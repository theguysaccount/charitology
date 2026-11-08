import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readParticipationGroupRowPin, createParticipationGroupInventoryPin } from "../lib/participation-group-pins.mjs";

const selected = { orgId: "org", table: "os_records", id: "record" };
const sha = "a".repeat(64);
function client(raw, transform = value => value) {
  const bytes = Buffer.from(raw), calls = [];
  return {
    calls,
    async query(sql, args) {
      calls.push({ sql, args });
      const rows = args.length === 2 ? [{ bytes: bytes.length }] : [{ bytes: bytes.length, chunk: bytes.subarray(args[2] - 1, args[2] - 1 + 65536) }];
      return transform({ rows, rowCount: 1 }, calls.length);
    },
  };
}
function expected(raw, input = selected) {
  const bytes = Buffer.from(raw), chunks = [Buffer.from("charitology:participation-group-row-pin:v1\0")];
  for (const value of [input.table, input.orgId, input.id, String(bytes.length)]) {
    const b = Buffer.from(value), n = Buffer.alloc(4); n.writeUInt32BE(b.length); chunks.push(n, b);
  }
  chunks.push(bytes); return createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
}
const code = value => error => error.code === value;

test("large raw JSONB is fingerprinted without a generic 128 KiB graph clone", async () => {
  // The euro crosses the first fixed byte boundary; decoding chunks separately
  // would replace its split UTF-8 bytes and fail the independently framed hash.
  const prefix = '{"text":"';
  const raw = prefix + " ".repeat(65535 - Buffer.byteLength(prefix)) + "€" + "x".repeat(80000) + '"}';
  const c = client(raw);
  assert.equal(await readParticipationGroupRowPin(c, selected), expected(raw));
  assert.equal(c.calls.length, 4);
  assert.deepEqual(c.calls.map(x => x.args[2] ?? null), [null, 1, 65537, 131073]);
  assert(c.calls.every(x => x.sql.startsWith("SELECT ") && x.args[0] === "org" && x.args[1] === "record"));
});
test("raw PostgreSQL microseconds remain distinct although JS Dates agree", async () => {
  const a = '{"updated_at": "2026-11-08T00:00:00.000001+00:00"}';
  const b = a.replace("000001", "000002");
  assert.equal(new Date(JSON.parse(a).updated_at).getTime(), new Date(JSON.parse(b).updated_at).getTime());
  assert.notEqual(await readParticipationGroupRowPin(client(a), selected), await readParticipationGroupRowPin(client(b), selected));
});
test("literal table/key allowlist and bound identity distinguish equal raw bytes", async () => {
  const first = await readParticipationGroupRowPin(client("{}"), selected);
  for (const change of [{ orgId: "other" }, { id: "other" }, { table: "os_participation_targets" }]) {
    const input = { ...selected, ...change }, c = client("{}");
    assert.notEqual(await readParticipationGroupRowPin(c, input), first);
    assert(c.calls.every(x => x.sql.includes(input.table)));
    if (input.table === "os_participation_targets") assert(c.calls.every(x => x.sql.includes("target_id=$2")));
  }
});
test("missing row is null without reading bytes", async () => {
  const c = client("{}", () => ({ rows: [], rowCount: 0 }));
  assert.equal(await readParticipationGroupRowPin(c, selected), null); assert.equal(c.calls.length, 1);
});
test("unsafe selectors and executable getters refuse before any SQL", async () => {
  for (const input of [{ ...selected, table: "os_records;DROP TABLE os_orgs" }, { ...selected, table: "__proto__" },
    { ...selected, id: "a'" }, { ...selected, skip: true }, { ...selected, orgId: "" }]) {
    const c = client("{}"); await assert.rejects(readParticipationGroupRowPin(c, input)); assert.equal(c.calls.length, 0);
  }
  let called = false; const input = { ...selected };
  Object.defineProperty(input, "id", { enumerable: true, get() { called = true; throw Error("getter"); } });
  const c = client("{}"); await assert.rejects(readParticipationGroupRowPin(c, input)); assert.equal(called, false); assert.equal(c.calls.length, 0);
});
test("changed, missing or incomplete chunks cannot yield a pin", async () => {
  for (const transform of [
    (r, n) => n === 1 ? r : ({ rows: [], rowCount: 0 }),
    (r, n) => n === 1 ? r : ({ rows: [{ ...r.rows[0], bytes: 3 }], rowCount: 1 }),
    (r, n) => n === 1 ? r : ({ rows: [{ bytes: 2, chunk: Buffer.from("{") }], rowCount: 1 }),
    (r, n) => n === 1 ? r : ({ rows: [{ bytes: 2, chunk: "{}" }], rowCount: 1 }),
    r => ({ ...r, rowCount: 2 }),
  ]) await assert.rejects(readParticipationGroupRowPin(client("{}", transform), selected), code("participation_group_stale"));
});
test("existing complete emergency processing ceiling is checked before chunk reads", async () => {
  for (const value of [0, 1, -1, "2", 1.5, 61 * 1024 * 1024 + 1]) {
    const c = client("{}", () => ({ rows: [{ bytes: value }], rowCount: 1 }));
    await assert.rejects(readParticipationGroupRowPin(c, selected), code("participation_group_stale")); assert.equal(c.calls.length, 1);
  }
});
test("database failures propagate without becoming readiness or missing data", async () => {
  const failure = Error("fixture network failure");
  await assert.rejects(readParticipationGroupRowPin({ query() { throw failure; } }, selected), e => e === failure);
});
test("incremental inventory covers more than 128 KiB and changes with any bound row", () => {
  const fill = changed => {
    const h = createParticipationGroupInventoryPin();
    for (let i = 0; i < 2000; i++) h.add({ table: "os_participations", id: "p" + String(i).padStart(4, "0"), sha256: changed && i === 1999 ? "b".repeat(64) : sha });
    return h.digest();
  };
  assert.equal(fill(false), fill(false)); assert.notEqual(fill(false), fill(true));
});
test("inventory requires complete canonical order without duplicates or post-finalization edits", () => {
  const first = { table: "os_participations", id: "a", sha256: sha };
  for (const next of [first, { ...first, id: "0" }, { ...first, table: "os_intake" }]) {
    const h = createParticipationGroupInventoryPin(); h.add(first); assert.throws(() => h.add(next));
  }
  const h = createParticipationGroupInventoryPin(); h.add(first); const digest = h.digest();
  assert.match(digest, /^[a-f0-9]{64}$/); assert.throws(() => h.digest()); assert.throws(() => h.add({ ...first, id: "b" }));
  for (const input of [{ ...first, sha256: "A".repeat(64) }, { ...first, hidden: true }]) assert.throws(() => createParticipationGroupInventoryPin().add(input));
});
