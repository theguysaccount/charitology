import test from "node:test";
import assert from "node:assert/strict";
import {
  currentGroupMember, groupSessionHash, groupAuthority,
  requireGroupReceiptAuthority, groupRestoreEpoch,
} from "../lib/participation-group-access.mjs";
import { groupHash, PARTICIPATION_GROUP_CONTRACT } from "../lib/participation-group-model.mjs";

// Closed fake SQL only: no real session, authorization/RLS, locks or PG execution.
const ORG = "fictional_org", USER = "fictional_user", SID = "fictional_session";
const AT = "2026-11-08T12:00:00.123456Z", NEXT = "2026-11-08T12:00:00.123457Z", SHA = "a".repeat(64);
const session = () => ({ session: { id: SID, createdAt: new Date(0), expiresAt: new Date(0), userId: "untrusted_ignored_copy" }, user: { id: USER, emailVerified: false, createdAt: new Date(0) } });
const memberRow = () => ({ user_id: USER, role: "owner", program_ids: ["program_b", "program_a"], revision: 3, created_exact: AT });
const code = value => error => error.code === value;
function fixture({ present, member, epoch, rowCount } = {}) {
  const calls = [], c = { query: async (sql, args) => {
    calls.push({ sql, args });
    const rows = sql.startsWith("SELECT s.id") ? present ?? [{ session_id: SID, user_id: USER, current_user_id: USER }]
      : sql.startsWith("SELECT user_id") ? member ?? [memberRow()]
      : epoch ?? [{ org_created_exact: AT, backup_restored_id: "9007199254740993", records: args[1].map(recordId => ({ recordId, lastRestoredAuditId: null })) }];
    return { rows, rowCount: rowCount ?? rows.length };
  } };
  return { c, calls };
}
const current = (f, readOnly = false, s = session(), moduleId = "events") => currentGroupMember(f.c, ORG, s, { moduleId, readOnly });

test("current SQL relationship/expiry and exact member profile require no verified email or own link", async () => {
  const raw = memberRow(), f = fixture({ member: [raw] }), result = await current(f);
  assert.deepEqual(result.programIds, ["program_b", "program_a"]);
  assert.equal(result.createdAtExact, AT); assert.equal(result.userId, USER);
  assert.equal(result.membershipSha256, groupHash("membership", { userId: USER, role: "owner", programIds: ["program_a", "program_b"], revision: 3, createdAtExact: AT }));
  assert(Object.isFrozen(result) && Object.isFrozen(result.programIds));
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0].args, [SID, USER]); assert.deepEqual(f.calls[1].args, [ORG, USER]);
  assert.match(f.calls[0].sql, /JOIN "user" u ON u.id=s\."userId"/);
  assert.match(f.calls[0].sql, /s\."expiresAt">clock_timestamp\(\)/);
  assert.match(f.calls[0].sql, /FOR SHARE OF s$/); assert.match(f.calls[1].sql, / FOR SHARE$/);
  assert.equal(/emailVerified|participant_links|FOR UPDATE/.test(f.calls.map(x => x.sql).join("\n")), false);
  raw.program_ids.push("later"); assert.equal(result.programIds.length, 2);
});

test("read-only profile has no row locks but still needs module read and write", async () => {
  const f = fixture(); await current(f, true, session(), "volunteers");
  assert.equal(/FOR SHARE|FOR UPDATE/.test(f.calls.map(x => x.sql).join("\n")), false);
  for (const role of ["board_reader", "external_reviewer"])
    await assert.rejects(current(fixture({ member: [{ ...memberRow(), role }] }), true), code("role"));
});

test("SQL revoked/expired session, changed user relationship and removed membership refuse", async () => {
  for (const present of [[], [{ session_id: SID, user_id: "other", current_user_id: "other" }]])
    await assert.rejects(current(fixture({ present })), code("session"));
  await assert.rejects(current(fixture({ member: [] })), code("membership"));
  const row = { session_id: SID, user_id: USER, current_user_id: USER };
  await assert.rejects(current(fixture({ present: [row, row] })), code("participation_group_access"));
  await assert.rejects(current(fixture({ member: [memberRow(), memberRow()] })), code("participation_group_access"));
  await assert.rejects(current(fixture({ rowCount: 0 })), code("participation_group_access"));
});

test("selectors reject hidden IDs, accessors/proxies and malformed options before SQL without reading extra Dates", async () => {
  let touched = 0;
  const getter = session(); Object.defineProperty(getter.user, "id", { enumerable: true, get() { touched++; return USER; } });
  const hidden = session(); Object.defineProperty(hidden.session, "id", { enumerable: false, value: SID });
  const proxy = new Proxy(session(), { get() { touched++; throw Error("trap"); }, getPrototypeOf() { touched++; throw Error("trap"); } });
  const extra = session(); Object.defineProperty(extra.user, "email", { get() { touched++; throw Error("unused extra"); } });
  await current(fixture(), true, extra);
  for (const value of [getter, hidden, proxy, null, { session: { id: SID }, user: { id: "email@example.invalid" } }]) {
    const f = fixture(); await assert.rejects(current(f, false, value)); assert.equal(f.calls.length, 0);
  }
  for (const options of [undefined, { moduleId: "events" }, { moduleId: "contacts", readOnly: true }, { moduleId: "events", readOnly: 1 }, { moduleId: "events", readOnly: false, bypass: true }]) {
    const f = fixture(); await assert.rejects(currentGroupMember(f.c, ORG, session(), options)); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); await assert.rejects(currentGroupMember(f.c, "foreign/org", session(), { moduleId: "events", readOnly: false })); assert.equal(f.calls.length, 0);
  assert.equal(touched, 0);
});

test("malformed raw membership rows never become hashed authority", async () => {
  for (const patch of [{ revision: "3" }, { revision: 0 }, { revision: 2147483648 }, { created_exact: AT.replace("123456", "123") },
    { created_exact: "2026-02-30T12:00:00.123456Z" }, { role: "not_a_role" },
    { program_ids: ["bad/path"] }, { program_ids: Array(101).fill("p") }, { extra: "unexpected" }, { user_id: "different" }])
    await assert.rejects(current(fixture({ member: [{ ...memberRow(), ...patch }] })));
  let touched = 0; const row = memberRow(); Object.defineProperty(row, "role", { enumerable: true, get() { touched++; return "owner"; } });
  await assert.rejects(current(fixture({ member: [row] }))); assert.equal(touched, 0);
});

test("membership revisions/scopes/roles and submillisecond removal/re-addition change pins; source order does not", async () => {
  const original = await current(fixture());
  assert.equal((await current(fixture({ member: [{ ...memberRow(), program_ids: ["program_a", "program_b"] }] }))).membershipSha256, original.membershipSha256);
  for (const patch of [{ revision: 4 }, { role: "admin" }, { program_ids: ["program_a"] }, { created_exact: NEXT }]) {
    const changed = await current(fixture({ member: [{ ...memberRow(), ...patch }] }));
    assert.notEqual(changed.membershipSha256, original.membershipSha256);
    assert.throws(() => requireGroupReceiptAuthority(groupAuthority(original, session(), SHA), changed, session(), SHA), code("participation_group_stale"));
  }
});

test("existing valid duplicate scopes keep literal order and multiplicity in the sorted membership hash", async () => {
  const original = ["program_b", "program_a", "program_b"];
  const member = await current(fixture({ member: [{ ...memberRow(), program_ids: original }] }));
  assert.deepEqual(member.programIds, original); assert.notEqual(member.programIds, original);
  assert.equal(member.membershipSha256, groupHash("membership", { userId: USER, role: "owner", programIds: ["program_a", "program_b", "program_b"], revision: 3, createdAtExact: AT }));
  assert.notEqual(member.membershipSha256, (await current(fixture())).membershipSha256);
});

test("receipt authority has exactly five model keys and cannot follow another session/user/restore epoch", async () => {
  const member = await current(fixture()), authority = groupAuthority(member, session(), SHA);
  assert.deepEqual(Object.keys(authority).sort(), [...PARTICIPATION_GROUP_CONTRACT.receiptAuthorityKeys].sort());
  assert.equal(authority.sessionSha256, groupSessionHash(session()));
  requireGroupReceiptAuthority(authority, member, session(), SHA);
  assert(Object.isFrozen(authority));
  for (const key of Object.keys(authority)) {
    const changed = { ...authority, [key]: key === "memberCreatedAtExact" ? NEXT : "b".repeat(64) };
    assert.throws(() => requireGroupReceiptAuthority(changed, member, session(), SHA), code("participation_group_stale"));
  }
  for (const value of [{ ...authority, extra: true }, { ...authority, actorSha256: 1 }, { ...authority, actorSha256: "A".repeat(64) }, null])
    assert.throws(() => requireGroupReceiptAuthority(value, member, session(), SHA));
  const other = session(); other.session.id = "other_session";
  assert.throws(() => requireGroupReceiptAuthority(authority, member, other, SHA), code("participation_group_stale"));
  const foreign = session(); foreign.user.id = "other_user";
  assert.throws(() => groupAuthority(member, foreign, SHA), code("participation_group_unavailable"));
});

test("restore epoch uses one parameterized sorted graph query, exact creation stamp and decimal event IDs", async () => {
  const f = fixture(), epoch = await groupRestoreEpoch(f.c, ORG, ["z", "A"]);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].args, [ORG, ["A", "z"]]);
  assert.match(f.calls[0].sql, /unnest\(\$2::text\[\]\)/); assert.match(f.calls[0].sql, /e\.org_id=\$1/);
  assert.match(f.calls[0].sql, /e\.action='record.restored'/); assert.match(f.calls[0].sql, /e\.action='backup.restored'/);
  assert.match(f.calls[0].sql, /max\(e.id\)::text/); assert.match(f.calls[0].sql, /COLLATE "C"/);
  assert.equal(epoch, groupHash("restore-epoch", { orgId: ORG, orgCreatedAtExact: AT, backupRestoredAuditId: "9007199254740993", records: [
    { recordId: "A", lastRestoredAuditId: null }, { recordId: "z", lastRestoredAuditId: null },
  ] }));
  assert.equal(await groupRestoreEpoch(fixture().c, ORG, ["A", "z"]), epoch);
});

test("org recreation, full restore and each record restore revoke epochs without Number rounding", async () => {
  const raw = { org_created_exact: AT, backup_restored_id: "9007199254740993", records: [{ recordId: "p", lastRestoredAuditId: "9007199254740993" }] };
  const before = await groupRestoreEpoch(fixture({ epoch: [raw] }).c, ORG, ["p"]);
  for (const patch of [{ org_created_exact: NEXT }, { backup_restored_id: "9007199254740994" },
    { records: [{ recordId: "p", lastRestoredAuditId: "9007199254740994" }] }])
    assert.notEqual(await groupRestoreEpoch(fixture({ epoch: [{ ...raw, ...patch }] }).c, ORG, ["p"]), before);
});

test("restore graph admission is closed, nonempty, bounded and rejects duplicate/hostile selectors before SQL", async () => {
  const ids = Array.from({ length: 64 }, (_, i) => `p${String(i).padStart(2, "0")}`);
  await groupRestoreEpoch(fixture().c, ORG, ids);
  let touched = 0; const getter = ["p"]; Object.defineProperty(getter, "0", { enumerable: true, get() { touched++; return "p"; } });
  const proxy = new Proxy([], { ownKeys() { touched++; throw Error("trap"); } });
  for (const list of [[], [...ids, "p64"], ["p", "p"], ["bad/id"], getter, proxy, new Array(1), { ids: [] }]) {
    const f = fixture(); await assert.rejects(groupRestoreEpoch(f.c, ORG, list)); assert.equal(f.calls.length, 0);
  }
  assert.equal(touched, 0);
});

test("malformed decimal/result descriptors cannot establish a restore epoch", async () => {
  const raw = { org_created_exact: AT, backup_restored_id: null, records: [{ recordId: "p", lastRestoredAuditId: null }] };
  for (const value of [0, 9007199254740992, "0", "01", "-1", "1e3", "9223372036854775808", "9".repeat(100)]) {
    await assert.rejects(groupRestoreEpoch(fixture({ epoch: [{ ...raw, backup_restored_id: value }] }).c, ORG, ["p"]));
    await assert.rejects(groupRestoreEpoch(fixture({ epoch: [{ ...raw, records: [{ recordId: "p", lastRestoredAuditId: value }] }] }).c, ORG, ["p"]));
  }
  for (const patch of [{ org_created_exact: AT.replace("123456", "123") }, { records: [] }, { records: [{ recordId: "other", lastRestoredAuditId: null }] }, { extra: true }])
    await assert.rejects(groupRestoreEpoch(fixture({ epoch: [{ ...raw, ...patch }] }).c, ORG, ["p"]));
  await assert.rejects(groupRestoreEpoch(fixture({ epoch: [] }).c, ORG, ["p"]), code("participation_group_unavailable"));
});

test("no local wall clock is needed for current member or restore epoch", async () => {
  const original = Date.now; Date.now = () => { throw Error("host clock read"); };
  try { await current(fixture()); await groupRestoreEpoch(fixture().c, ORG, ["p"]); }
  finally { Date.now = original; }
});
