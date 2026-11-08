/** Real Request/stream admission units; no handler, authorization, SQL or network. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isParticipationGroupPath,
  isParticipationGroupPreview,
  readParticipationGroupBody,
} from "../lib/participation-group-http.mjs";

const stem = "/api/orgs/org_A/participation-groups";
const endpoint = "https://os.example.invalid" + stem + "/group_1/admit";
const limit = 16384;
const bytes = text => Buffer.from(text, "utf8");
function request(body, headers = { "content-type": "application/json" }, method = "POST") {
  return new Request(endpoint, { method, headers, ...(body === undefined ? {} : { body }) });
}
function streamed(chunks, extraHeaders = {}) {
  let sent = 0, cancelled = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (sent === chunks.length) controller.close();
      else controller.enqueue(chunks[sent++]);
    },
    cancel() { ++cancelled; },
  });
  return {
    request: new Request(endpoint, { method: "POST", headers: { "content-type": "application/json", ...extraHeaders }, body, duplex: "half" }),
    sent: () => sent,
    cancelled: () => cancelled,
  };
}
const rejects = (req, status = 422, code = "group_json") =>
  assert.rejects(readParticipationGroupBody(req), e => e.status === status && e.code === code);

test("complete group prefix selects strict admission for collection and unknown suffixes", () => {
  for (const path of [stem, stem + "/", stem + "/group_1", stem + "/unknown/action", stem + "//unknown", stem + "/%67roup/unknown"])
    assert.equal(isParticipationGroupPath(path), true, path);
  for (const org of ["a", "A_9-", "a".repeat(100)])
    assert.equal(isParticipationGroupPath(`/api/orgs/${org}/participation-groups/unknown`), true);
});

test("reader classifier refuses sibling families and invalid or encoded organization prefixes", () => {
  for (const path of [
    "/api/participant/orgs/org_A/participation-groups", "/api/orgs//participation-groups",
    "/api/orgs/org.A/participation-groups", "/api/orgs/%6frg_A/participation-groups",
    "/api/orgs/" + "a".repeat(101) + "/participation-groups",
    "/api/orgs/組/participation-groups", stem + "-other", stem + "%2fgroup_1",
    stem + "?token=not-authority", stem + "#group_1", "/prefix" + stem,
    "https://os.example.invalid" + stem, "/API/orgs/org_A/participation-groups",
  ]) assert.equal(isParticipationGroupPath(path), false, path);
});

test("only two exact POST previews classify read-only, with the existing closed ID grammar", () => {
  for (const action of ["preview-admission", "preview-cancellation"])
    for (const org of ["o", "o".repeat(100)])
      for (const group of ["g", "A_9-", "g".repeat(100)])
        assert.equal(isParticipationGroupPreview(`/api/orgs/${org}/participation-groups/${group}/${action}`, "POST"), true);
  for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "post", " POST", undefined])
    assert.equal(isParticipationGroupPreview(stem + "/group_1/preview-admission", method), false);
});

test("preview classification never uses a substring, query, encoded ID or extra path", () => {
  for (const path of [
    stem, stem + "/preview-admission", stem + "//preview-admission",
    stem + "/g/preview-admission/", stem + "/g/preview-admission/extra",
    stem + "/g/preview-admission-copy", stem + "/g/not-preview-admission",
    stem + "/g/preview-cancellation?token=fake", stem + "/g/preview-admission#fake",
    stem + "/g/admit?preview-admission", stem + "/%67/preview-admission",
    stem + "/g%2fextra/preview-admission", stem + "/g%00/preview-admission",
    stem + "/g.g/preview-admission", stem + "/組/preview-admission",
    stem + "/" + "g".repeat(101) + "/preview-admission",
    stem.replace("org_A", "%6frg_A") + "/g/preview-admission",
    stem.replace("org_A", "o".repeat(101)) + "/g/preview-admission",
    "https://os.example.invalid" + stem + "/g/preview-admission",
  ]) assert.equal(isParticipationGroupPreview(path, "POST"), false, path);
});

test("preview exactness refuses terminal line separators rather than using a line-end anchor", () => {
  for (const suffix of ["\n", "\r", "\r\n", "\u2028", "\u2029"])
    for (const action of ["preview-admission", "preview-cancellation"])
      assert.equal(isParticipationGroupPreview(stem + "/g/" + action + suffix, "POST"), false);
});

test("classification never coerces nonstring paths or method objects", () => {
  let called = 0;
  const coercible = { toString() { ++called; throw new Error("must not coerce"); } };
  for (const path of [null, undefined, 0, [], coercible]) {
    assert.equal(isParticipationGroupPath(path), false);
    assert.equal(isParticipationGroupPreview(path, "POST"), false);
  }
  assert.equal(isParticipationGroupPreview(stem + "/g/preview-admission", coercible), false);
  assert.equal(called, 0);
});

test("reader requires the existing JSON media base without inventing parameter restrictions", async () => {
  for (const type of ["application/json", "Application/JSON;charset=UTF-8", "application/json; profile=fictional", "application/json;"])
    assert.deepEqual(await readParticipationGroupBody(request('{"version":1}', { "content-type": type })), { version: 1 });
  for (const type of [null, "text/plain", "application/jsonx", "application/ld+json", "application/json-patch+json"])
    await rejects(request("{}", type === null ? {} : { "content-type": type }), 415, "content_type");
});

test("method and media-type refusal do not consume a request body", async () => {
  for (const method of ["GET", "HEAD"]) {
    const req = request(undefined, { "content-type": "application/json" }, method);
    await rejects(req, 405, "group_method");
    assert.equal(req.bodyUsed, false);
  }
  const req = request('{"mustRemainUnread":true}', { "content-type": "text/plain" });
  await rejects(req, 415, "content_type");
  assert.equal(req.bodyUsed, false);
  assert.equal(await req.text(), '{"mustRemainUnread":true}');
});

test("ordinary lexical JSON is returned unchanged for separate model admission", async () => {
  const value = { literal: "  Fictional 🌍\n<TAG>  ", nested: [{ repeated: 1 }, { repeated: 2 }], known: false, unknown: null };
  assert.deepEqual(await readParticipationGroupBody(request(JSON.stringify(value))), value);
  // Scalar/field shape is the model's job, not hidden HTTP authorization.
  for (const text of ["[]", "null", "true", '"fictional-token"'])
    assert.deepEqual(await readParticipationGroupBody(request(text)), JSON.parse(text));
});

test("UTF8 code points and escaped names may cross every actual stream byte boundary", async () => {
  const raw = bytes('{"place":"同じ 🌍","\\u006bey":"literal \\\" quote"}');
  const f = streamed(Array.from(raw, value => Uint8Array.of(value)));
  assert.deepEqual(await readParticipationGroupBody(f.request), { place: "同じ 🌍", key: 'literal " quote' });
  assert.equal(f.cancelled(), 0);
  assert.equal(f.request.body.locked, false);
});

test("complete multibyte JSON exactly 16KiB is admitted by actual bytes, including whitespace", async () => {
  const text = JSON.stringify({ note: "界".repeat(5400) });
  const raw = bytes(text + " ".repeat(limit - bytes(text).length));
  assert.equal(raw.length, limit);
  assert.ok(raw.toString("utf8").length < limit);
  assert.deepEqual(await readParticipationGroupBody(request(raw)), { note: "界".repeat(5400) });
  const f = streamed([raw.subarray(0, 13), raw.subarray(13, 16383), raw.subarray(16383)]);
  assert.deepEqual(await readParticipationGroupBody(f.request), { note: "界".repeat(5400) });
  assert.equal(f.cancelled(), 0);
});

test("actual byte overflow cancels even when Content-Length falsely claims a small body", async () => {
  const text = JSON.stringify({ note: "界".repeat(5400) });
  const raw = bytes(text + " ".repeat(limit + 1 - bytes(text).length));
  assert.equal(raw.length, limit + 1);
  assert.ok(raw.toString("utf8").length < limit);
  for (const headers of [{}, { "content-length": "1" }, { "content-length": String(limit) }]) {
    const f = streamed([raw.subarray(0, limit), raw.subarray(limit), bytes("never needed"), bytes("not consumed")], headers);
    await rejects(f.request, 413, "group_size");
    assert.equal(f.cancelled(), 1);
    assert.ok(f.sent() < 4);
    assert.equal(f.request.body.locked, false);
  }
});

test("declared overflow cancels before lexical parsing and cannot be waived by a tiny body", async () => {
  const f = streamed([bytes("{}")], { "content-length": String(limit + 1) });
  await rejects(f.request, 413, "group_size");
  assert.equal(f.cancelled(), 1);
  assert.equal(f.request.body.locked, false);
});

test("complete-body admission observes a later chunk, not only a valid initial object", async () => {
  for (const tail of [" {}", " true", "x", "\0", "\ufeff"])
    await rejects(streamed([bytes("{}"), bytes(tail)]).request);
  const f = streamed([bytes("{}"), bytes(" \r\n\t")]);
  assert.deepEqual(await readParticipationGroupBody(f.request), {});
  assert.equal(f.sent(), 2);
});

test("decoded duplicate keys are refused at every depth, including escaped Unicode equivalence", async () => {
  for (const raw of [
    '{"revision":1,"\\u0072evision":2}',
    '{"selection":{"ids":[],"\\u0069ds":[]}}',
    '{"items":[{"𝄞":1,"\\ud834\\udd1e":2}]}',
    '{"__proto__":1,"\\u005f_proto__":2}',
  ]) await rejects(streamed([bytes(raw.slice(0, 7)), bytes(raw.slice(7))]).request);
  assert.deepEqual(await readParticipationGroupBody(request('{"a":{"x":1},"b":{"x":2}}')), { a: { x: 1 }, b: { x: 2 } });
});

test("malformed UTF8 fails rather than becoming replacement characters", async () => {
  for (const malformed of [[0x80], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) {
    const f = streamed([bytes('{"note":"'), ...malformed.map(b => Uint8Array.of(b)), bytes('"}')]);
    await rejects(f.request);
    assert.equal(f.request.body.locked, false);
  }
  assert.deepEqual(await readParticipationGroupBody(request(bytes('{"note":"�"}'))), { note: "�" });
});

test("a leading UTF8 BOM remains evidence and is not silently stripped", async () => {
  await rejects(request(bytes("\ufeff{}")));
  await rejects(streamed([Uint8Array.of(0xef), Uint8Array.of(0xbb), Uint8Array.of(0xbf), bytes("{}")]).request);
});

test("nonfinite numeric overflow and invalid JSON number aliases are refused", async () => {
  for (const raw of ['{"n":1e309}', '{"n":-1e999}', '{"n":NaN}', '{"n":Infinity}', '{"n":01}'])
    await rejects(request(raw));
  assert.deepEqual(await readParticipationGroupBody(request('{"n":1.7976931348623157e308,"tiny":1e-999}')), { n: Number.MAX_VALUE, tiny: 0 });
});

test("malformed or incomplete JSON cannot become an empty envelope", async () => {
  for (const raw of [" ", "{", '{"a":}', '{"a":1,}', "[1,]", '"unterminated', '{"a":"raw\nline"}'])
    await rejects(request(raw));
  // The established reader deliberately leaves absent/zero-byte envelopes to domain validation.
  assert.deepEqual(await readParticipationGroupBody(request(undefined)), {});
  assert.deepEqual(await readParticipationGroupBody(streamed([]).request), {});
});

test("nonbyte stream chunks are rejected and their reader is released", async () => {
  const f = streamed(["not a Uint8Array", bytes("{}")]);
  await rejects(f.request);
  assert.equal(f.cancelled(), 1);
  assert.equal(f.request.body.locked, false);
});

test("actual interrupted streams propagate failure instead of parsing a partial valid object", async () => {
  const failure = new Error("Fictional interrupted transport");
  let pulls = 0;
  const body = new ReadableStream({ pull(c) { if (++pulls === 1) c.enqueue(bytes("{}")); else c.error(failure); } });
  const req = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" });
  await assert.rejects(readParticipationGroupBody(req), error => error === failure);
  assert.equal(req.body.locked, false);
});

test("known lexer failures use group labels without echoing private input", async () => {
  const secret = "Fictional private writing must not appear in an error";
  await assert.rejects(readParticipationGroupBody(request(`{"${secret}":1,"${secret}":2}`)), error => {
    assert.equal(error.status, 422); assert.equal(error.code, "group_json");
    assert(!/backup/i.test(error.message)); assert(!error.message.includes(secret));
    return true;
  });
  await assert.rejects(readParticipationGroupBody(request(" ".repeat(limit + 1))), error => {
    assert.equal(error.status, 413); assert.equal(error.code, "group_size");
    assert(!/backup/i.test(error.message)); return true;
  });
});

test("a stream error with parser-like properties is not mistaken for a known lexical error", async () => {
  const failure = Object.assign(new Error("Fictional transport failure"), { status: 422, code: "backup_json" });
  const body = new ReadableStream({ start(c) { c.error(failure); } });
  const req = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" });
  await assert.rejects(readParticipationGroupBody(req), error => error === failure);
  assert.equal(req.body.locked, false);
});
