import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signGroupPreview, verifyGroupPreview, GROUP_PREVIEW_LIMITS } from "../lib/participation-group-preview.mjs";

const secret = "group-preview-fictional-test-secret-000000";
const pin = char => char.repeat(64);
const payload = () => ({
  format: "charitology-participation-group-preview", version: 1, operation: "admit",
  orgId: "org", groupId: "group", groupRevision: 1, actorSha256: pin("a"),
  sessionSha256: pin("b"), membershipSha256: pin("c"), restoreEpochSha256: pin("d"),
  rosterSha256: pin("e"), selectionSha256: pin("f"), pinsSha256: pin("1"), reviewSha256: pin("2"),
  issuedAtExact: "2026-11-08T12:00:00.123456Z", expiresAtExact: "2026-11-08T12:10:00.123456Z",
});
function context(p = payload(), nowExact = p.issuedAtExact) {
  const { format, version, issuedAtExact, expiresAtExact, ...bindings } = p;
  return { nowExact, bindings };
}
function rawSigned(text, keyDomain = "charitology:participation-group-preview:key:v1\0", macDomain = "charitology:participation-group-preview:mac:v1\0") {
  const bytes = Buffer.from(text), key = createHmac("sha256", secret)
    .update(keyDomain).digest();
  return bytes.toString("base64url") + "." + createHmac("sha256", key)
    .update(macDomain).update(bytes).digest("base64url");
}
const canonical = p => "{" + Object.keys(p).sort().map(k => JSON.stringify(k) + ":" + JSON.stringify(p[k])).join(",") + "}";
const refused = fn => assert.throws(fn, e => typeof e.code === "string");

test("stateless signing is deterministic and detached; no local clock participates", () => {
  const p = payload(), token = signGroupPreview(p, secret), oldNow = Date.now;
  Date.now = () => { throw new Error("local clock was read"); };
  try {
    assert.equal(signGroupPreview(Object.fromEntries(Object.entries(p).reverse()), secret), token);
    const result = verifyGroupPreview(token, secret, context(p));
    assert.deepEqual(result, p); assert.notEqual(result, p); assert.ok(Object.isFrozen(result));
    p.groupRevision = 2; assert.equal(result.groupRevision, 1);
  } finally { Date.now = oldNow; }
});

test("the exact SQL half-open lifetime preserves microseconds at both boundaries", () => {
  const p = payload(), token = signGroupPreview(p, secret);
  assert.deepEqual(verifyGroupPreview(token, secret, context(p, "2026-11-08T12:10:00.123455Z")), p);
  for (const stamp of ["2026-11-08T12:00:00.123455Z", p.expiresAtExact, "2026-11-08T12:10:00.123457Z"])
    assert.throws(() => verifyGroupPreview(token, secret, context(p, stamp)), e => e.status === 409);
  refused(() => verifyGroupPreview(token, secret, context(p, "2026-11-08T12:01:00.123Z")));
  refused(() => signGroupPreview({ ...p, expiresAtExact: "2026-11-08T12:10:00.123457Z" }, secret));
});

test("a reviewed cancellation has its own operation and post-admission revision", () => {
  const p = { ...payload(), operation: "cancel", groupRevision: 2 };
  assert.deepEqual(verifyGroupPreview(signGroupPreview(p, secret), secret, context(p)), p);
});

test("every fresh actor/session/membership/restore/roster/review binding is required", () => {
  const p = payload(), token = signGroupPreview(p, secret), good = context(p);
  for (const name of Object.keys(good.bindings)) {
    const changed = structuredClone(good);
    changed.bindings[name] = name === "groupRevision" ? 2 : name === "operation" ? "cancel" :
      name.endsWith("Sha256") ? pin("0") : "other";
    assert.throws(() => verifyGroupPreview(token, secret, changed), e => e.status === 409, name);
    const missing = structuredClone(good); delete missing.bindings[name];
    refused(() => verifyGroupPreview(token, secret, missing));
  }
  refused(() => verifyGroupPreview(token, secret, { ...good, now: good.nowExact }));
  refused(() => verifyGroupPreview(token, secret, { ...good, bindings: { ...good.bindings, extra: "hidden" } }));
  for (const value of ["2", 0, 2147483648, true])
    assert.throws(() => verifyGroupPreview(token, secret, { ...good, bindings: { ...good.bindings, groupRevision: value } }), e => e.status === 422);
  for (const value of ["foreign/identifier", "", 12])
    assert.throws(() => verifyGroupPreview(token, secret, { ...good, bindings: { ...good.bindings, groupId: value } }), e => e.status === 422);
});

test("signature, key rotation, operation and canonical base64url refuse tampering", () => {
  const p = payload(), token = signGroupPreview(p, secret), [body, mac] = token.split(".");
  for (const bad of [token + ".", body + "=." + mac, body + "." + mac + "=", token.replace(/.$/, mac.at(-1) === "A" ? "B" : "A"),
    rawSigned(canonical({ ...p, format: "other" })), rawSigned(canonical({ ...p, operation: "other" }))])
    refused(() => verifyGroupPreview(bad, secret, context(p)));
  refused(() => verifyGroupPreview(token, secret + "rotated", context(p)));
  const bytes = Buffer.from(body, "base64url"), replaced = Buffer.from(bytes); replaced[0] ^= 1;
  refused(() => verifyGroupPreview(replaced.toString("base64url") + "." + mac, secret, context(p)));
});

test("both HMAC domains and unused base64url pad bits are enforced", () => {
  const p = payload(), text = canonical(p);
  refused(() => verifyGroupPreview(rawSigned(text, "os-csrf:", "charitology:participation-group-preview:mac:v1\0"), secret, context(p)));
  refused(() => verifyGroupPreview(rawSigned(text, "charitology:participation-group-preview:key:v1\0", "os:directory-resource:v1:"), secret, context(p)));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const alias = encoded => encoded.slice(0, -1) + alphabet[alphabet.indexOf(encoded.at(-1)) | 1];
  const token = signGroupPreview(p, secret), [encoded, mac] = token.split(".");
  const macAlias = alias(mac);
  assert.notEqual(macAlias, mac); assert.deepEqual(Buffer.from(macAlias, "base64url"), Buffer.from(mac, "base64url"));
  refused(() => verifyGroupPreview(encoded + "." + macAlias, secret, context(p)));
  let withPadding = p;
  while (Buffer.byteLength(canonical(withPadding)) % 3 === 0)
    withPadding = { ...withPadding, groupId: withPadding.groupId + "x" };
  const [body, sig] = signGroupPreview(withPadding, secret).split("."), bodyAlias = alias(body);
  assert.notEqual(bodyAlias, body); assert.deepEqual(Buffer.from(bodyAlias, "base64url"), Buffer.from(body, "base64url"));
  refused(() => verifyGroupPreview(bodyAlias + "." + sig, secret, context(withPadding)));
});

test("even signed malformed/noncanonical/duplicate JSON cannot enter the payload", () => {
  const p = payload(), good = canonical(p);
  for (const text of [JSON.stringify(p), " " + good, good.replace('"version":1', '"version":1,"ver\\u0073ion":1'),
    good.replace('"version":1', '"version":1e999'), good.replace('"groupId":"group"', '"groupId":"\\ud800"'),
    '\ufeff' + good, '{"__proto__":{},' + good.slice(1)])
    refused(() => verifyGroupPreview(rawSigned(text), secret, context(p)));
  const invalidUtf8 = Buffer.from([0xff, 0xfe, 0xff]);
  refused(() => verifyGroupPreview(rawSigned(invalidUtf8), secret, context(p)));
});

test("token and decoded byte limits are independent refusal bounds", () => {
  assert.equal(GROUP_PREVIEW_LIMITS.payloadBytes, 4096); assert.equal(GROUP_PREVIEW_LIMITS.tokenBytes, 8192);
  for (const length of [8192, 8193])
    refused(() => verifyGroupPreview("a".repeat(length - 44) + "." + "a".repeat(43), secret, context()));
  refused(() => verifyGroupPreview(rawSigned(" ".repeat(4097)), secret, context()));
});

test("hostile signing payload and fresh binding objects invoke no getters or proxy traps", () => {
  let touched = 0;
  const accessor = payload(); Object.defineProperty(accessor, "groupId", { enumerable: true, get() { touched++; return "group"; } });
  const proxy = new Proxy(payload(), { ownKeys() { touched++; throw new Error("proxy trap"); }, get() { touched++; throw new Error("proxy trap"); } });
  refused(() => signGroupPreview(accessor, secret)); refused(() => signGroupPreview(proxy, secret));
  const token = signGroupPreview(payload(), secret), good = context();
  refused(() => verifyGroupPreview(token, secret, new Proxy(good, { ownKeys() { touched++; throw new Error("proxy trap"); } })));
  const bad = context(); Object.defineProperty(bad.bindings, "orgId", { enumerable: true, get() { touched++; return "org"; } });
  refused(() => verifyGroupPreview(token, secret, bad)); assert.equal(touched, 0);
});

test("server secret types are explicit and errors contain no supplied key", () => {
  for (const key of [null, {}, "short", "x".repeat(4097)])
    assert.throws(() => signGroupPreview(payload(), key), e => e instanceof TypeError && !e.message.includes(String(key)));
});
