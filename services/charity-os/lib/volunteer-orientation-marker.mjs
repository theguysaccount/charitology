import { isProxy } from "node:util/types";
import { fail, hash } from "./security.mjs";

export const VOLUNTEER_ORIENTATION_MARKER_FORMAT = "charitology-os-volunteer-orientation-marker";
export const VOLUNTEER_ORIENTATION_MARKER_SQL = "SELECT id,org_id,created_by,title,checksum,payload FROM os_reports " +
  "WHERE org_id=$1 AND (id=$2 OR payload->>'format'=$3) LIMIT 2";
const title = "Volunteer orientation requirement";
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const markerKeys = ["version", "moduleId", "targetId", "programId", "requirementId",
  "policyRevision", "sourceRevision", "termsHash", "disposition"];
const packetKeys = ["format", "version", "originMode", "marker"];
export const orientationId = value => typeof value === "string" && ID.test(value);
export const orientationHash = value => typeof value === "string" && SHA.test(value);
export const orientationRevision = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;
export const orientationUnavailable = () => fail(503, "volunteer_orientation_unavailable", "Orientation review is currently unavailable.");
export const orientationChanged = () => fail(409, "volunteer_orientation_stale", "The shift or its orientation review changed. Reload it before continuing.");
export const orientationRequired = () => fail(409, "volunteer_orientation_required", "Review current site orientation before confirming this place.");
export const orientationOperation = () => fail(409, "volunteer_orientation_operation", "This shift requires individual orientation review before a place can be allocated.");

export function orientationData(value, keys) {
  if (!value || typeof value !== "object" || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== keys.length) return null;
  const entries = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}

export function validateOrientationRecoveryMarker(value) {
  const m = orientationData(value, markerKeys);
  if (!m || m.version !== 1 || m.moduleId !== "volunteers" || m.disposition !== "review-needed" ||
      ![m.targetId, m.programId, m.requirementId].every(orientationId) || !orientationRevision(m.policyRevision) ||
      !orientationRevision(m.sourceRevision) || !orientationHash(m.termsHash)) orientationUnavailable();
  return Object.freeze(m);
}

export function orientationMarkerId(org) {
  if (!orientationId(org)) orientationUnavailable();
  return hash(["charitology-volunteer-orientation-marker-v1", org]).slice(0, 32);
}

export function isVolunteerOrientationMarkerRow(row) {
  return row?.payload?.format === VOLUNTEER_ORIENTATION_MARKER_FORMAT ||
    (orientationId(row?.org_id) && row.id === orientationMarkerId(row.org_id));
}

export function validateVolunteerOrientationMarkerRow(row, org) {
  const payload = orientationData(row?.payload, packetKeys);
  if (!payload || row.org_id !== org || row.id !== orientationMarkerId(org) || row.title !== title ||
      !orientationId(row.created_by) || payload.format !== VOLUNTEER_ORIENTATION_MARKER_FORMAT ||
      payload.version !== 1 || !["live", "recovered"].includes(payload.originMode) || row.checksum !== hash(payload))
    orientationUnavailable();
  return Object.freeze({ originMode: payload.originMode, marker: validateOrientationRecoveryMarker(payload.marker) });
}

/** Runs in the current workspace transaction. Only the exact absent row pair
 * is ordinary. A malformed or conflicting reserved row always refuses. */
export async function readVolunteerOrientationMarker(c, org) {
  const rows = (await c.query(VOLUNTEER_ORIENTATION_MARKER_SQL,
    [org, orientationMarkerId(org), VOLUNTEER_ORIENTATION_MARKER_FORMAT])).rows;
  if (rows.length === 0) return null;
  if (rows.length !== 1) orientationUnavailable();
  return validateVolunteerOrientationMarkerRow(rows[0], org);
}

export function makeVolunteerOrientationMarkerRow(org, user, raw, originMode = "recovered") {
  if (!orientationId(user) || !["live", "recovered"].includes(originMode)) orientationUnavailable();
  const payload = { format: VOLUNTEER_ORIENTATION_MARKER_FORMAT, version: 1,
    originMode, marker: validateOrientationRecoveryMarker(raw) };
  return Object.freeze({ org_id: org, id: orientationMarkerId(org), created_by: user, title,
    checksum: hash(payload), payload: Object.freeze(payload) });
}

async function insertMarker(c, org, user, raw, originMode) {
  const row = makeVolunteerOrientationMarkerRow(org, user, raw, originMode);
  const rows = (await c.query("INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) " +
    "VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
  [row.org_id, row.id, row.created_by, row.title, row.checksum, JSON.stringify(row.payload)])).rows;
  if (rows.length !== 1 || rows[0].id !== row.id) orientationChanged();
  return Object.freeze({ originMode, marker: row.payload.marker });
}

export const insertLiveVolunteerOrientationMarker = (c, org, user, marker) => insertMarker(c, org, user, marker, "live");
export const insertRecoveredVolunteerOrientationMarker = (c, org, user, marker) => insertMarker(c, org, user, marker, "recovered");

export async function volunteerOrientationForTarget(c, org, target) {
  if (target.moduleId !== "volunteers") return null;
  const declaration = await readVolunteerOrientationMarker(c, org);
  return declaration?.marker.targetId === target.id ? declaration : null;
}

export async function refuseProtectedVolunteerOrientation(c, org, target) {
  if (await volunteerOrientationForTarget(c, org, target)) orientationOperation();
}
