/** Publication permission stays separate from intake collection consent. */
import { isDate, isProxy } from "node:util/types";
import { fail } from "./security.mjs";

export const FEEDBACK_CONVERSION_ACTION = "intake.feedback-converted";
const privateStates = new Set(["received", "triaged", "review", "approved", "responded", "closed"]);
const eventKeys = ["org_id", "id", "actor_id", "action", "record_id", "module_id", "detail", "created_at"];
const portableKeys = ["version", "intakeId", "publicationId", "sourceRevision", "reviewedRevision",
  "submissionRevision", "draftRevision", "acceptedAtExact"];
const localKeys = [...portableKeys, "requestSha256", "authoritySha256"];
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const revision = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
const plain = value => value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
const descriptor = (value, key) => plain(value) && Object.getOwnPropertyDescriptor(value, key);
export const feedbackDataField = (value, key) => {
  const d = descriptor(value, key);
  return d?.enumerable && Object.hasOwn(d, "value") ? d.value : undefined;
};
export function exactFeedbackObject(value, keys) {
  return plain(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const d = descriptor(value, key);
    return d?.enumerable && Object.hasOwn(d, "value");
  });
}
function stamp(value, exact = false) {
  if (typeof value !== "string" || !(exact
    ? /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value)
    : /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))) return false;
  const millis = value.slice(0, 23) + "Z";
  const parsed = new Date(millis);
  return Number.isFinite(+parsed) && parsed.toISOString() === millis;
}
const eventId = value => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
  BigInt(value) <= 9223372036854775807n || Number.isSafeInteger(value) && value > 0;
const eventStamp = value => stamp(value) || isDate(value) && Object.getPrototypeOf(value) === Date.prototype &&
  Number.isFinite(Date.prototype.getTime.call(value));
const badEvent = () => fail(422, "feedback_intake_history", "Use the fixed portable history for anonymous feedback conversions.");

/** Recognize only this event and remove the original local replay pins. */
export function feedbackPortableConversionEvent(event, allowLocal = false) {
  if (feedbackDataField(event, "action") !== FEEDBACK_CONVERSION_ACTION) return null;
  if (!exactFeedbackObject(event, eventKeys) || !id(event.org_id) || !id(event.actor_id) ||
      !id(event.record_id) || event.module_id !== "feedback" || !eventId(event.id) || !eventStamp(event.created_at)) badEvent();
  const detail = event.detail;
  const local = allowLocal && exactFeedbackObject(detail, localKeys);
  if (!(local || exactFeedbackObject(detail, portableKeys)) || detail.version !== 1 ||
      !id(detail.intakeId) || !id(detail.publicationId) || !revision(detail.sourceRevision) ||
      !revision(detail.reviewedRevision) || !revision(detail.submissionRevision) ||
      detail.submissionRevision !== detail.reviewedRevision + 1 || detail.draftRevision !== 1 ||
      !stamp(detail.acceptedAtExact, true) || local && (!sha(detail.requestSha256) || !sha(detail.authoritySha256))) badEvent();
  if (!local) return event;
  const { requestSha256: _request, authoritySha256: _authority, ...portable } = detail;
  return { ...event, detail: portable };
}

export function projectFeedbackNativeEvents(events) {
  if (!Array.isArray(events) || !events.some(event => feedbackDataField(event, "action") === FEEDBACK_CONVERSION_ACTION))
    return events;
  return events.map(event => feedbackPortableConversionEvent(event, true) ?? event);
}

function withheldRecord(record) {
  const data = feedbackDataField(record, "data");
  return feedbackDataField(record, "moduleId") === "feedback" && privateStates.has(feedbackDataField(record, "status")) &&
    feedbackDataField(data, "kind") === "feedback-summary" && feedbackDataField(data, "channel") === "anonymous" &&
    feedbackDataField(data, "publicationConsent") === "withheld";
}
export function isWithheldFeedbackDraft(record) {
  if (!withheldRecord(record)) return false;
  const d = descriptor(record, "snapshot");
  if (!d) return true;
  if (!d.enumerable || !Object.hasOwn(d, "value")) return false;
  const snapshot = d.value;
  return snapshot == null || withheldRecord(snapshot) && feedbackDataField(snapshot, "id") === feedbackDataField(record, "id");
}

export const FEEDBACK_PUBLICATION_GUARD_SQL = `/*feedback:linked-publication-guard*/
SELECT EXISTS(
  SELECT 1 FROM os_intake i JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
  WHERE i.org_id=$1 AND p.kind='feedback'
    AND i.converted_ids @> jsonb_build_array(jsonb_build_object('id',$2::text))
) AS linked`;
const guardState = () => fail(409, "feedback_publication_state", "Reload the saved feedback history before changing this record.");

/** Trusted typed save caller. A link remains protective after any queue exit. */
export async function guardFeedbackPublicationWrite(c, record) {
  if (feedbackDataField(record, "moduleId") !== "feedback" || isWithheldFeedbackDraft(record)) return;
  const org = feedbackDataField(record, "orgId"), recordId = feedbackDataField(record, "id");
  if (!id(org) || !id(recordId)) guardState();
  // The separate snapshot must see a conversion committed while waiting.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [org]);
  const result = await c.query(FEEDBACK_PUBLICATION_GUARD_SQL, [org, recordId]);
  if (result?.rowCount !== 1 || result.rows?.length !== 1 || !exactFeedbackObject(result.rows[0], ["linked"]) ||
      typeof result.rows[0].linked !== "boolean") guardState();
  if (result.rows[0].linked)
    fail(409, "feedback_publication_protected", "Keep this intake-linked feedback summary anonymous and private. The collection agreement supports internal review.");
}
