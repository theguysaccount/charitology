/** Exact staff wire and stateless review proofs. Only the locked route supplies current authority. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseBackupJson } from "./backup-json.mjs";
import { fail, hash, stable } from "./security.mjs";
import { ownGroupValue, validateGroupExactStamp } from "./participation-group-model.mjs";
import {
  RESOURCE_RESERVATION_LIMITS as limits, RESOURCE_RESERVATION_METHOD as method,
  validateResourceReservationRequest,
} from "./resource-reservation-ledger.mjs";

const PREVIEW_FORMAT = "charitology-resource-reservation-preview";
const KEY_DOMAIN = "charitology:resource-reservation-preview:key:v1\0";
const MAC_DOMAIN = "charitology:resource-reservation-preview:mac:v1\0";
const PAYLOAD_BYTES = 2048;
const operations = ["reserve", "release", "replace"];
const invalid = () => fail(422, "resource_reservation_fields", "Use the exact bounded reservation fields.");
const invalidPreview = () => fail(422, "resource_reservation_preview", "Use the exact signed reservation review.");

export const resourceReservationId = value =>
  typeof value === "string" && value.length >= 1 && value.length <= 100 && !/[^A-Za-z0-9_-]/.test(value);
export const resourceReservationSha256 = value =>
  typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value);
export const resourceReservationRevision = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;
export const reservationHash = (kind, value) => hash({ method, kind, value });
const sameFields = (value, keys) =>
  value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const pin = value => sameFields(value, ["id", "revision"]) &&
  resourceReservationId(value.id) && resourceReservationRevision(value.revision);
const reason = value => typeof value === "string" && value.length >= 1 &&
  value.length <= limits.reasonCharacters && value.trim() === value;

export function resourceReservationReviewInput(input) {
  const value = ownGroupValue(input, limits.requestBytes);
  if (!sameFields(value, ["version", "scopeSha256", "operation", "previous", "asset", "session", "reason"]) ||
      value.version !== 1 || !resourceReservationSha256(value.scopeSha256) || !operations.includes(value.operation))
    invalid();
  if (value.operation === "reserve" ? value.previous !== null || value.reason !== null
    : !pin(value.previous) || value.previous.revision !== 1 || !reason(value.reason)) invalid();
  if (value.operation === "release" ? value.asset !== null || value.session !== null
    : !pin(value.asset) || !pin(value.session) || value.asset.id === value.session.id) invalid();
  return value;
}

export function resourceReservationCommitInput(input) {
  const value = ownGroupValue(input, limits.requestBytes);
  if (!sameFields(value, ["version", "scopeSha256", "operation", "request"]) || value.version !== 1 ||
      !resourceReservationSha256(value.scopeSha256) || !operations.includes(value.operation)) invalid();
  const request = validateResourceReservationRequest(value.operation, value.request);
  if (value.operation !== "reserve" && !reason(request.reason)) invalid();
  return { ...value, request };
}

/** Preserve the SQL clock's exact fractional microseconds at the ten-minute boundary. */
export function resourceReservationPreviewExpiry(issuedAtExact) {
  validateGroupExactStamp(issuedAtExact);
  const end = new Date(Date.parse(issuedAtExact) + 600_000).toISOString();
  return validateGroupExactStamp(end.slice(0, -1) + issuedAtExact.slice(23, 26) + "Z");
}

function signature(bytes, secret) {
  if (typeof secret !== "string" || secret.length < 32 || Buffer.byteLength(secret) > 4096)
    throw new TypeError("A bounded server signing secret is required.");
  const key = createHmac("sha256", secret).update(KEY_DOMAIN).digest();
  return createHmac("sha256", key).update(MAC_DOMAIN).update(bytes).digest();
}

function previewPayload(input) {
  const value = ownGroupValue(input, PAYLOAD_BYTES);
  if (!sameFields(value, [
    "format", "version", "orgId", "scopeSha256", "operation", "asset", "session", "nextId",
    "proofSha256", "inventorySha256", "authoritySha256", "reviewSha256", "issuedAtExact", "expiresAtExact",
  ]) || value.format !== PREVIEW_FORMAT || value.version !== 1 ||
      ![value.orgId, value.nextId].every(resourceReservationId) ||
      !["reserve", "replace"].includes(value.operation) ||
      !pin(value.asset) || !pin(value.session) || value.asset.id === value.session.id ||
      ![value.scopeSha256, value.proofSha256, value.inventorySha256, value.authoritySha256, value.reviewSha256]
        .every(resourceReservationSha256) ||
      value.expiresAtExact !== resourceReservationPreviewExpiry(value.issuedAtExact)) invalidPreview();
  return value;
}

export function resourceReservationReviewHash(payload, previous, reason) {
  const { reviewSha256: _, ...pins } = payload;
  return reservationHash("review", { pins, previous, reason });
}

export function makeResourceReservationPreview(pins, previous, reason, secret) {
  const body = { format: PREVIEW_FORMAT, version: 1, ...pins, expiresAtExact: resourceReservationPreviewExpiry(pins.issuedAtExact) };
  const reviewSha256 = resourceReservationReviewHash(body, previous, reason);
  const payload = previewPayload({ ...body, reviewSha256 });
  const bytes = Buffer.from(stable(payload), "utf8");
  const previewToken = bytes.toString("base64url") + "." + signature(bytes, secret).toString("base64url");
  if (previewToken.length > limits.tokenBytes) invalidPreview();
  return { previewToken, reviewSha256, expiresAtExact: payload.expiresAtExact };
}

/** Call only for a new intent, after current authorization and the exact accepted-key read. */
export function readResourceReservationPreview(token, secret) {
  if (typeof token !== "string" || token.length > limits.tokenBytes ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) invalidPreview();
  const [encoded, mac] = token.split(".");
  const bytes = Buffer.from(encoded, "base64url"), supplied = Buffer.from(mac, "base64url");
  if (bytes.length > PAYLOAD_BYTES || encoded !== bytes.toString("base64url") ||
      supplied.length !== 32 || mac !== supplied.toString("base64url") ||
      !timingSafeEqual(supplied, signature(bytes, secret))) invalidPreview();
  try {
    const payload = previewPayload(parseBackupJson(bytes, PAYLOAD_BYTES));
    if (bytes.equals(Buffer.from(stable(payload), "utf8"))) return payload;
  } catch {}
  invalidPreview();
}
