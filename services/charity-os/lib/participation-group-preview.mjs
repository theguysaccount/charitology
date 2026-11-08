/** Stateless review proof only. Live authority and SQL pins remain gateway duties. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseBackupJson } from "./backup-json.mjs";
import { fail } from "./security.mjs";
import {
  ownGroupValue,
  groupCanonical,
  validateGroupPreviewPayload,
  validateGroupExactStamp,
  compareGroupExactStamps,
} from "./participation-group-model.mjs";

export const GROUP_PREVIEW_LIMITS = Object.freeze({ payloadBytes: 4096, tokenBytes: 8192 });
const KEY_DOMAIN = "charitology:participation-group-preview:key:v1\0";
const MAC_DOMAIN = "charitology:participation-group-preview:mac:v1\0";
const BINDING_KEYS = Object.freeze([
  "operation", "orgId", "groupId", "groupRevision", "actorSha256", "sessionSha256",
  "membershipSha256", "restoreEpochSha256", "rosterSha256", "selectionSha256",
  "pinsSha256", "reviewSha256",
]);
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const invalid = () => fail(422, "participation_group_preview", "Use the exact signed group review.");
const stale = () => fail(409, "participation_group_preview_stale", "Reload and review this group before submitting a new command.");

function signingKey(secret) {
  // The existing application secret is supplied by server code, never a body field.
  if (typeof secret !== "string" || secret.length < 32 || Buffer.byteLength(secret) > 4096)
    throw new TypeError("A bounded server signing secret is required.");
  return createHmac("sha256", secret).update(KEY_DOMAIN, "utf8").digest();
}
function signature(bytes, secret) {
  return createHmac("sha256", signingKey(secret)).update(MAC_DOMAIN, "utf8").update(bytes).digest();
}
function encodedPayload(payload) {
  const owned = validateGroupPreviewPayload(payload);
  const bytes = Buffer.from(groupCanonical(owned), "utf8");
  if (bytes.length > GROUP_PREVIEW_LIMITS.payloadBytes) invalid();
  return bytes;
}

/** No clock/ID/default is created here; SQL-issued stamps are required in payload. */
export function signGroupPreview(payload, secret) {
  const bytes = encodedPayload(payload);
  const token = bytes.toString("base64url") + "." + signature(bytes, secret).toString("base64url");
  if (token.length > GROUP_PREVIEW_LIMITS.tokenBytes) invalid();
  return token;
}

/**
 * NEW commands only. Accepted exact Replay must use the retained immutable
 * request/authority receipt before this expiring/rotatable proof is checked.
 * context = { nowExact: trusted SQL UTC microsecond stamp, bindings: all12 pins }.
 */
export function verifyGroupPreview(token, secret, context) {
  if (typeof token !== "string" || token.length > GROUP_PREVIEW_LIMITS.tokenBytes ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) invalid();
  const [encoded, mac] = token.split(".");
  const bytes = Buffer.from(encoded, "base64url"), supplied = Buffer.from(mac, "base64url");
  if (bytes.length > GROUP_PREVIEW_LIMITS.payloadBytes || encoded !== bytes.toString("base64url") ||
      supplied.length !== 32 || mac !== supplied.toString("base64url")) invalid();
  const wanted = signature(bytes, secret);
  if (wanted.length !== supplied.length || !timingSafeEqual(wanted, supplied)) invalid();

  let payload;
  try {
    payload = validateGroupPreviewPayload(parseBackupJson(bytes, GROUP_PREVIEW_LIMITS.payloadBytes));
  } catch { invalid(); }
  // Canonical bytes, not merely JSON-equivalent encodings, are the signed grammar.
  if (!bytes.equals(Buffer.from(groupCanonical(payload), "utf8"))) invalid();
  const current = ownGroupValue(context, 8192);
  if (!current || Array.isArray(current) || Object.keys(current).length !== 2 ||
      !Object.hasOwn(current, "nowExact") || !Object.hasOwn(current, "bindings")) invalid();
  validateGroupExactStamp(current.nowExact);
  const bindings = current.bindings;
  if (!bindings || Array.isArray(bindings) || Object.keys(bindings).length !== BINDING_KEYS.length ||
      !BINDING_KEYS.every(key => Object.hasOwn(bindings, key))) invalid();
  // Current pins can describe a later lifecycle (e.g. an already admitted
  // revision2 group). Validate scalar profiles separately from the old
  // preview's operation/revision combination, then classify changed pins stale.
  if (!["admit", "cancel"].includes(bindings.operation) ||
      !Number.isSafeInteger(bindings.groupRevision) || bindings.groupRevision < 1 || bindings.groupRevision > 2147483647 ||
      ![bindings.orgId, bindings.groupId].every(value => typeof value === "string" && ID.test(value)) ||
      !BINDING_KEYS.filter(key => key.endsWith("Sha256")).every(key => typeof bindings[key] === "string" && SHA.test(bindings[key]))) invalid();
  if (!BINDING_KEYS.every(key => bindings[key] === payload[key]) ||
      compareGroupExactStamps(payload.issuedAtExact, current.nowExact) > 0 ||
      compareGroupExactStamps(current.nowExact, payload.expiresAtExact) >= 0) stale();
  return payload;
}
