import { createHash } from "node:crypto";
import { validDate } from "./modules.mjs";
export {
  LearningError,
  learningFail,
  learningCanonical,
  learningOwned,
  learningFreeze,
  learningRepresentable,
} from "./learning-transport.mjs";
import {
  learningFail,
  learningCanonical,
  learningOwned,
  learningFreeze,
  learningRepresentable,
  parseLearningTransport,
} from "./learning-transport.mjs";
export const LEARNING_LIMITS = Object.freeze({
  tocBytes: 1000000,
  nonprofitBytes: 8000000,
  jsonDepth: 32,
  jsonNodes: 200000,
  selectedBytes: 1048576,
  sourceBytes: 1056768,
  requestBytes: 131072,
  commitBytes: 4096,
  bindings: 20,
  sourceVersions: 8,
  mappingVersions: 8,
  indicators: 10,
  measurements: 200,
  decisions: 20,
  reports: 20,
  selectedObservations: 100,
  evidence: 600,
  history: 1000,
  historyBytes: 16777216,
  evidenceBytes: 262144,
  eventBytes: 131072,
  reportBytes: 4194304,
  backupBytes: 67108864,
  boundaries: 64,
});
export const parseLearningJSON = (
  raw,
  maxBytes = LEARNING_LIMITS.requestBytes,
) => parseLearningTransport(raw, maxBytes);
const kinds = new Set([
  "source",
  "evidence",
  "snapshot",
  "approval",
  "audit-record",
  "data",
  "event",
  "proposal",
  "review",
  "selection",
  "digest",
  "report",
  "command",
  "request",
  "membership",
  "actor-binding",
  "session",
  "restore-epoch",
  "registry",
]);
export function learningHash(kind, value) {
  if (!kinds.has(kind))
    learningFail("learning_hash", "Unknown learning hash namespace.");
  return createHash("sha256")
    .update(
      "charitology-learning/v1/" +
        kind +
        "\n" +
        learningCanonical(value) +
        "\n",
      "utf8",
    )
    .digest("hex");
}
export const learningRawHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function learningSeal(kind, value) {
  const field = kind === "report" ? "checksum" : "sha256";
  const v = learningOwned(value);
  if (Object.hasOwn(v, field))
    learningFail("learning_hash", "Seal an unhashed closed value.");
  return learningFreeze({ ...v, [field]: learningHash(kind, v) });
}
export function learningObject(v, keys, path = "") {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
    Object.keys(v).length !== keys.length ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    learningFail(
      "learning_shape",
      "Use every documented field and no additional fields.",
      path,
    );
  return v;
}
export function learningArray(v, max, path = "", min = 0) {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    learningFail(
      "learning_limit",
      "Use an array within its documented bound.",
      path,
    );
  return v;
}
export function learningText(
  v,
  max,
  path = "",
  { nullable = false, nonblank = false } = {},
) {
  if (v === null && nullable) return v;
  if (
    typeof v !== "string" ||
    v.length > max ||
    !learningRepresentable(v) ||
    (nonblank && !v.trim())
  )
    learningFail(
      "learning_text",
      "Use supported text within its documented bound.",
      path,
    );
  return v;
}
export function learningId(v, path = "") {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v))
    learningFail("learning_id", "Use an exact learning record identity.", path);
  return v;
}
export function learningHashValue(v, path = "") {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    learningFail("learning_hash", "Use a complete lowercase SHA-256.", path);
  return v;
}
export function learningNumber(
  v,
  min = 0,
  max = 2147483647,
  path = "",
  integer = true,
) {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isSafeInteger(v))
  )
    learningFail(
      "learning_number",
      "Use a finite number within its documented bound.",
      path,
    );
  return v;
}
export function learningEnum(v, values, path = "") {
  if (!values.includes(v))
    learningFail("learning_choice", "Choose an exact documented value.", path);
  return v;
}
export function learningInstant(v, path = "", micro = false) {
  const re = micro
    ? /^(?:19|20|21|22)\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/
    : /^(?:19|20|21|22)\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
  if (
    typeof v !== "string" ||
    !re.test(v) ||
    !validDate(v.slice(0, 10)) ||
    !Number.isFinite(Date.parse(v)) ||
    (micro ? v.slice(0, 23) + "Z" : v) !== new Date(v).toISOString()
  )
    learningFail("learning_instant", "Use a real canonical UTC instant.", path);
  return v;
}
export function learningDay(v, path = "") {
  if (!validDate(v))
    learningFail("learning_day", "Use a real calendar day.", path);
  return v;
}
export function learningSame(a, b) {
  return learningCanonical(a) === learningCanonical(b);
}
export function learningCheckedHash(
  kind,
  v,
  field = kind === "report" ? "checksum" : "sha256",
) {
  learningHashValue(v[field], field);
  const copy = { ...v };
  delete copy[field];
  if (learningHash(kind, copy) !== v[field])
    learningFail(
      "learning_hash",
      "Retained learning bytes do not match their checksum.",
    );
  return v;
}
