/** Reminder native extension only. No recovered value is live authority. */
import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import { learningCanonical, learningOwned } from "./learning-transport.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";
import { validateReminderIntentMarker } from "./participation-reminder-model.mjs";
import { REMINDER_CONSENT_VERSION } from "./participation-reminder-model.mjs";
import { PARTICIPATION_REMINDER_TEMPLATE_VERSION } from "./participation-reminder-template.mjs";

const bad = () => fail(422, "participation_backup", "Invalid, inconsistent or oversized participation history. No authority was imported.");
const plain = value => value !== null && typeof value === "object" && !isProxy(value) &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => { if (!plain(value) || Reflect.ownKeys(value).length !== keys.length ||
  !keys.every(key => Object.hasOwn(value, key))) bad(); };
const field = (value, key) => {
  if (!plain(value)) bad();
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (d && (!d.enumerable || !Object.hasOwn(d, "value"))) bad();
  return d?.value;
};
function dense(values) {
  if (!values || isProxy(values) || !Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) bad();
  const d = Object.getOwnPropertyDescriptor(values, "length");
  // Existing native/outbox limit, not a new per-row or small model bound.
  if (!d || !Object.hasOwn(d, "value") || d.value > 8000 || d.value < 0 || !Number.isSafeInteger(d.value)) bad();
  const keys = Reflect.ownKeys(values);
  if (keys.length !== d.value + 1) bad();
  for (let i = 0; i < d.value; i++) {
    const item = Object.getOwnPropertyDescriptor(values, String(i));
    if (!item?.enumerable || !Object.hasOwn(item, "value")) bad();
  }
  return values;
}
export function participationNativeInput(backup) { return field(backup, "participation"); }

/** Classification reads only own data descriptors; present-null is reserved. */
export function reminderOutboxPresence(values) {
  if (values === undefined) return false;
  for (const row of dense(values)) {
    const kind = field(row, "intentKind"), payload = field(row, "payload");
    if (kind === "reminder") return true;
    if (payload !== null && typeof payload === "object") {
      if (!plain(payload)) bad();
      const d = Object.getOwnPropertyDescriptor(payload, "reminder");
      if (d) { if (!d.enumerable || !Object.hasOwn(d, "value")) bad(); return true; }
    }
  }
  return false;
}

// Descriptor/proxy preflight before the existing native canonical admission.
// No canonicalizer is reimplemented and the small pure model is not applied
// to a complete historical family. Actual family byte/count limits stay in
// restoredParticipation and the existing outer native parser.
function inert(value, active = new Set(), depth = 0) {
  if (depth > 32) bad();
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) bad(); return; }
  if (!value || typeof value !== "object" || isProxy(value) || active.has(value)) bad();
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) bad();
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string")) bad();
  const length = array ? Object.getOwnPropertyDescriptor(value, "length")?.value : null;
  if (array && (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1)) bad();
  active.add(value);
  if (array) {
    for (let i = 0; i < length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d?.enumerable || !Object.hasOwn(d, "value")) bad(); inert(d.value, active, depth + 1);
    }
  } else for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !Object.hasOwn(d, "value")) bad(); inert(d.value, active, depth + 1);
  }
  active.delete(value);
}
/** Descriptor preflight + unchanged native canonical admission for private
 * SQL projection values. It is never a current-authority or capacity override. */
export function ownReminderProjectionValue(input, bytes = 64 * 1024 * 1024) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 64 * 1024 * 1024) bad();
  inert(input);
  try { return learningOwned(input, { nativeStrings: true, bytes }); } catch { bad(); }
}
export function reminderNativeBasis(input) {
  const version = field(input, "version"), outbox = field(input, "outbox");
  const present = reminderOutboxPresence(outbox);
  if (version !== 4) { if (present) bad(); return version; }
  inert(input);
  try { learningCanonical(input, { nativeStrings: true, maxBytes: 64 * 1024 * 1024 }); } catch { bad(); }
  exact(input, ["version", "basisVersion", "targets", "participations", "outbox"]);
  if (!present || ![2, 3].includes(input.basisVersion)) bad();
  return input.basisVersion;
}

const targetKeys = ["targetId", "moduleId", "revision", "mode", "sourceRevision", "terms", "termsHash", "recoveryBlock", "createdAt"];
const personKeys = ["id", "targetId", "moduleId", "bookingRecordId", "contactId", "intakeId", "state", "revision", "source", "consent", "frozen", "waitlistSequence", "confirmedAt", "cancelledAt", "recovered", "recoveredState", "createdAt"];
const outboxKeys = ["id", "participationId", "eventRevision", "purpose", "channel", "state", "payload", "createdAt", "participationRevision", "intentKind", "consentRevision", "consentCopy", "templateVersion", "attemptedAt", "attempts", "lastCheckedAt", "safeCode", "providerEventAt", "recoveredState"];
export function reminderNativeRows(input, basis) {
  if (input.version !== 4) return;
  for (const t of dense(input.targets)) exact(t, targetKeys);
  for (const p of dense(input.participations)) exact(p, [...personKeys, ...(basis === 3 ? ["requestedInterval"] : [])]);
  for (const o of dense(input.outbox)) exact(o, outboxKeys);
}

export function nativeReminderPayload(input) {
  let value;
  try { value = ownGroupValue(input, 2048); validateReminderIntentMarker(value.reminder); } catch { bad(); }
  exact(value, ["state", "participationId", "revision", "reminder"]);
  if (value.state !== "confirmed" || typeof value.participationId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(value.participationId) || !Number.isSafeInteger(value.revision) || value.revision < 1) bad();
  return value;
}

/** Returns the detached marker-bearing payload or null for an old payload. */
export function admittedReminderOutbox(row, input, people, retained, commitments) {
  const marker = Object.hasOwn(row.payload || {}, "reminder");
  if (!marker) { if (row.intentKind === "reminder") bad(); return null; }
  if (input.version !== 4 || !["legacy", "reminder"].includes(row.intentKind) || !retained.has(row.participationId)) bad();
  const payload = nativeReminderPayload(row.payload), parent = people.get(row.participationId);
  if (!parent || payload.participationId !== row.participationId || payload.revision !== row.eventRevision ||
      row.consentRevision < 1 || row.consentCopy !== REMINDER_CONSENT_VERSION || row.templateVersion !== PARTICIPATION_REMINDER_TEMPLATE_VERSION) bad();
  if (row.intentKind === "legacy" && (row.state !== "cancelled" || parent.recovered !== true || parent.source !== "recovered")) bad();
  if (row.intentKind === "reminder" && (parent.recovered === true || ["legacy", "recovered"].includes(parent.source))) bad();
  const key = row.participationId + ":" + payload.reminder.commitmentSha256;
  if (commitments.has(key)) bad(); commitments.add(key);
  return payload;
}
