import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_METHOD, GROUP_LIMITS, PARTICIPATION_GROUP_CONTRACT, ParticipationGroupError,
  ownGroupValue, groupCanonical, groupHash, validateGroupExactStamp, compareGroupExactStamps,
  validateGroupCreate, validateGroupSelection, validateGroupCancellationSelection,
  validateGroupPreviewAdmission, validateGroupPreviewCancellation, validateGroupPreviewPayload,
  validateGroupCommit, validateGroupClose, groupCommandHashes, deriveGroupChildKey,
  validateGroupReceipt, validateGroupHistory, projectGroupHistory,
} from "../lib/participation-group-model.mjs";

const SHA = "a".repeat(64), KEY = "fictional_group_command_01", GID = "fictional_group_1";
const clone = value => structuredClone(value);
const ids = n => Array.from({ length: n }, (_, i) => "p" + String(i + 1).padStart(2, "0"));
const refuses = (fn, code) => assert.throws(fn, e => e instanceof ParticipationGroupError && (!code || e.code === code));
const create = (n = 2) => ({ version: 1, target: { targetId: "target_1", targetRevision: 2, sourceRevision: 7 }, members: ids(n).map(participationId => ({ participationId, revision: 3 })), coordinatorIntakeId: null, idempotencyKey: KEY });
const context = (operation = "admit", n = 2) => ({ operation, rosterIds: ids(n) });
const commit = () => ({ version: 1, previewToken: "e30." + "a".repeat(43), reviewSha256: SHA, selection: { mode: "all", items: [] }, reasons: [], idempotencyKey: KEY });
function payload() {
  return { format: "charitology-participation-group-preview", version: 1, operation: "admit", orgId: "org_1", groupId: GID, groupRevision: 1,
    actorSha256: SHA, sessionSha256: SHA, membershipSha256: SHA, restoreEpochSha256: SHA, rosterSha256: SHA, selectionSha256: SHA, pinsSha256: SHA, reviewSha256: SHA,
    issuedAtExact: "2026-11-08T23:55:00.123456Z", expiresAtExact: "2026-11-09T00:05:00.123456Z" };
}
const stamp = n => "2026-11-08T12:00:" + String(n).padStart(2, "0") + ".000001Z";
const authority = () => ({ actorSha256: SHA, sessionSha256: SHA, membershipSha256: SHA, memberCreatedAtExact: "2026-11-08T11:59:59.999999Z", restoreEpochSha256: SHA });
function result(operation, revision = operation === "create" ? 1 : operation === "cancel" ? 3 : 2, selected = ids(2), roster = ids(2)) {
  const base = { groupId: GID, groupRevision: revision, state: operation === "create" ? "draft" : operation === "close" ? "closed" : "admitted" };
  if (operation === "create") return { ...base, target: { targetId: "target_1", moduleId: "volunteers" }, rosterIds: roster, coordinatorIntakeId: null };
  if (operation === "admit") return { ...base, selectionMode: selected.length === roster.length ? "all" : "subset", selected: selected.map(participationId => ({ participationId, action: "confirm", resultRevision: 5, state: "confirmed", frozenSha256: SHA, allocationHash: null, notificationQueued: true, auditRetained: true })), unselectedIds: roster.filter(x => !selected.includes(x)), reasonHashes: [], auditRetained: true };
  if (operation === "cancel") return { ...base, selected: selected.map(participationId => ({ participationId, resultRevision: 6, state: "cancelled", notificationQueued: false, auditRetained: false })), reasonSha256: SHA, auditRetained: false };
  return { ...base, reasonSha256: SHA, auditRetained: false };
}
function receipt(operation, revision = operation === "create" ? 1 : operation === "cancel" ? 3 : 2, selected = ids(2), roster = ids(2)) {
  return { version: 1, groupId: GID, operation, commandHash: String(revision).padStart(64, "0"), requestHash: SHA, authority: authority(), reviewSha256: ["create", "close"].includes(operation) ? null : SHA, acceptedAtExact: stamp(revision), result: result(operation, revision, selected, roster) };
}
const history = receipts => projectGroupHistory({ originOrgId: "org_original", receipts });

test("owned values detach/freeze the complete graph without normalizing literal Unicode text", () => {
  const input = { a: [{ text: "  fictional 🍃 literal Unicode  " }], b: null };
  const before = clone(input), out = ownGroupValue(input);
  assert.deepEqual(input, before); assert.deepEqual(out, before); assert.notEqual(out, input); assert.notEqual(out.a, input.a);
  assert(Object.isFrozen(out) && Object.isFrozen(out.a) && Object.isFrozen(out.a[0]));
  assert.throws(() => { out.a[0].text = "changed"; }, TypeError);
  input.a[0].text = "later edit"; assert.equal(out.a[0].text, before.a[0].text);
});

test("hostile proxies, including revoked proxies, are refused without invoking traps", () => {
  let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error("trap"); }, getPrototypeOf() { calls++; throw Error("trap"); }, ownKeys() { calls++; throw Error("trap"); } });
  for (const fn of [() => ownGroupValue(p), () => ownGroupValue({ nested: p }), () => groupHash("pins", p), () => validateGroupCreate(p), () => validateGroupCommit(commit(), p), () => validateGroupSelection({ mode: "all", items: [] }, p)]) refuses(fn);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); refuses(() => ownGroupValue(revoked.proxy)); assert.equal(calls, 0);
});

test("getters and hidden/symbol properties never become serialized authority", () => {
  let calls = 0; const x = create(); Object.defineProperty(x.target, "sourceRevision", { enumerable: true, get() { calls++; return 7; } });
  refuses(() => validateGroupCreate(x)); assert.equal(calls, 0);
  for (const altered of [Object.defineProperty({}, "hidden", { value: 1 }), { [Symbol("secret")]: 1 }, Object.create(null), new Date(), /x/, new Map(), 1n, undefined]) refuses(() => ownGroupValue(altered));
  const parent = { child: {} }; parent.child.parent = parent; refuses(() => ownGroupValue(parent));
  const extra = create(); extra.permission = true; refuses(() => validateGroupCreate(extra));
});

test("dense arrays reject holes, compensating digit keys, exotic prototypes and accessors", () => {
  const sparse = new Array(2); sparse[1] = "p02"; sparse["01"] = "p01";
  refuses(() => ownGroupValue(sparse));
  const accessor = ["p01"]; let reads = 0; Object.defineProperty(accessor, "0", { enumerable: true, get() { reads++; return "p01"; } });
  refuses(() => ownGroupValue(accessor)); assert.equal(reads, 0);
  for (const key of ["01", "-1", "4294967295", "extra"]) { const a = ids(2); a[key] = "p03"; refuses(() => validateGroupSelection({ mode: "subset", items: a }, ids(3))); }
  const exotic = ids(2); Object.setPrototypeOf(exotic, null); refuses(() => ownGroupValue(exotic));
});

test("UTF-8 and graph bounds are byte/structure bounds, not string-length or recursion guesses", () => {
  assert.equal(ownGroupValue("🍃", 6), "🍃"); refuses(() => ownGroupValue("🍃", 5), "participation_group_limit");
  for (const v of [NaN, Infinity, -Infinity, "\0", "\u000b", "\ud800", "\udc00"]) refuses(() => ownGroupValue(v));
  let deep = null; for (let i = 0; i < 18; ++i) deep = { x: deep }; refuses(() => ownGroupValue(deep), "participation_group_limit");
  refuses(() => ownGroupValue(Array(257).fill(null)), "participation_group_limit");
  refuses(() => ownGroupValue(Array.from({ length: 256 }, () => Array(16).fill(0))), "participation_group_limit");
  for (const limit of [0, -1, "100", Infinity, GROUP_LIMITS.modelBytes + 1]) refuses(() => ownGroupValue({}, limit));
});

test("create admits exactly2–10 current-ID/revision references and sorts only owned members", () => {
  for (const n of [2, 10]) { const x = create(n); x.members.reverse(); const before = clone(x), v = validateGroupCreate(x); assert.deepEqual(x, before); assert.deepEqual(v.members.map(x => x.participationId), ids(n)); }
  for (const n of [0, 1, 11]) refuses(() => validateGroupCreate(create(n)));
  const duplicate = create(); duplicate.members[1] = clone(duplicate.members[0]); refuses(() => validateGroupCreate(duplicate), "participation_group_duplicate");
  for (const value of [0, -1, 1.5, true, "3", 2147483648, Number.MAX_SAFE_INTEGER + 1]) { const x = create(); x.members[0].revision = value; refuses(() => validateGroupCreate(x)); }
  for (const value of ["", "x".repeat(101), ["p01"], 1, "p/1"]) { const x = create(); x.members[0].participationId = value; refuses(() => validateGroupCreate(x)); }
  const valid = create(); valid.coordinatorIntakeId = "existing_enquiry_1"; assert.equal(validateGroupCreate(valid).coordinatorIntakeId, "existing_enquiry_1");
  const extra = create(); extra.members[0].contactId = "cannot_assert_contact_identity_here"; refuses(() => validateGroupCreate(extra));
});

test("all is explicit, admission subsets are proper, and cancellation may include every admitted child", () => {
  assert.deepEqual(validateGroupSelection({ mode: "all", items: [] }, ids(3)), { mode: "all", items: [] });
  assert.deepEqual(validateGroupSelection({ mode: "subset", items: ["p02", "p01"] }, ids(3)).items, ["p01", "p02"]);
  assert.deepEqual(validateGroupSelection({ mode: "subset", items: ["p01"] }, ids(2)).items, ["p01"]);
  for (const x of [{ mode: "all", items: ["p01"] }, { mode: "subset", items: [] }, { mode: "subset", items: ids(2) }, { mode: "subset", items: ["foreign"] }, { mode: "subset", items: ["p01", "p01"] }, { mode: "auto-fit", items: [] }]) refuses(() => validateGroupSelection(x, ids(2)));
  assert.deepEqual(validateGroupCancellationSelection({ mode: "subset", items: ids(2) }, ids(2)).items, ids(2));
  assert.deepEqual(validateGroupCancellationSelection({ mode: "subset", items: ["p01"] }, ["p01"]).items, ["p01"]);
  refuses(() => validateGroupCancellationSelection({ mode: "all", items: [] }, ids(2)));
  refuses(() => validateGroupSelection({ mode: "all", items: [] }, ["p01", "p01"]));
});

test("preview admission binds explicit reasons without inventing current waitlist eligibility", () => {
  const x = { version: 1, groupRevision: 1, selection: { mode: "subset", items: ["p02", "p01"] }, reasons: [{ participationId: "p02", reason: "  deliberate 🍃 explanation  " }, { participationId: "p01", reason: "First" }] };
  const v = validateGroupPreviewAdmission(x, ids(3)); assert.equal(v.reasons[1].reason, x.reasons[0].reason); assert.equal(v.reasons[0].participationId, "p01");
  for (const change of [y => y.reasons.push(clone(y.reasons[0])), y => y.reasons[0].participationId = "p03", y => y.reasons[0].reason = " ", y => y.reasons[0].reason = "x".repeat(301), y => y.groupRevision = 2]) { const y = clone(x); change(y); refuses(() => validateGroupPreviewAdmission(y, ids(3))); }
  assert.deepEqual(validateGroupPreviewAdmission({ version: 1, groupRevision: 1, selection: { mode: "all", items: [] }, reasons: [] }, ids(2)).reasons, []);
});

test("cancellation preview and commit cannot masquerade as admission or infer full selection", () => {
  assert.deepEqual(validateGroupPreviewCancellation({ version: 1, groupRevision: 2, selected: ids(2), reason: "Separate cancellation" }, ids(2)).selected, ids(2));
  const x = commit(); x.selection = { mode: "subset", items: ids(2) }; x.reasons = ids(2).map(participationId => ({ participationId, reason: "Separate cancellation" }));
  assert.equal(validateGroupCommit(x, context("cancel")).selection.items.length, 2);
  refuses(() => validateGroupCommit(x, context("admit")));
  for (const change of [y => y.reasons.pop(), y => y.reasons[1].reason = "Different reason", y => y.selection.items = [], y => y.selection.mode = "all"]) { const y = clone(x); change(y); refuses(() => validateGroupCommit(y, context("cancel"))); }
  for (const groupRevision of [1, 12, "2"]) refuses(() => validateGroupPreviewCancellation({ version: 1, groupRevision, selected: ["p01"], reason: "Cancel" }, ids(2)));
  const c = context(); c.role = "owner"; refuses(() => validateGroupCommit(commit(), c));
});

test("exact SQL microseconds remain distinct, validate calendar and never use current wall time", () => {
  assert.equal(validateGroupExactStamp("2024-02-29T23:59:59.123456Z"), "2024-02-29T23:59:59.123456Z");
  assert.equal(compareGroupExactStamps("2026-11-08T00:00:00.000001Z", "2026-11-08T00:00:00.000002Z"), -1);
  assert.equal(compareGroupExactStamps("1969-12-31T23:59:59.999999Z", "1970-01-01T00:00:00.000000Z"), -1);
  for (const x of ["2025-02-29T00:00:00.000000Z", "2026-11-31T00:00:00.000000Z", "2026-11-08T24:00:00.000000Z", "2026-11-08T00:00:00.123Z", "2026-11-08T00:00:00.000000+00:00", "0000-01-01T00:00:00.000000Z", new Date(), [stamp(1)]]) refuses(() => validateGroupExactStamp(x), "participation_group_time");
  const old = Date.now; Date.now = () => { throw Error("No clock authority"); };
  try { assert.deepEqual(validateGroupPreviewPayload(payload()), payload()); } finally { Date.now = old; }
});

test("preview envelope has exactly16 bounded scalar fields and exactly10-minute SQL lifetime", () => {
  const p = payload(); assert.equal(Object.keys(validateGroupPreviewPayload(p)).length, 16);
  for (const change of [x => x.expiresAtExact = "2026-11-09T00:05:00.123457Z", x => x.expiresAtExact = x.issuedAtExact, x => x.name = "No PII", x => x.role = "owner", x => x.version = "1", x => x.operation = "create", x => x.groupRevision = 2]) { const x = clone(p); change(x); refuses(() => validateGroupPreviewPayload(x)); }
  for (const k of Object.keys(p).filter(k => k.endsWith("Sha256"))) { const x = clone(p); x[k] = [SHA]; refuses(() => validateGroupPreviewPayload(x)); }
  const cancel = clone(p); cancel.operation = "cancel"; cancel.groupRevision = 11; assert.equal(validateGroupPreviewPayload(cancel).groupRevision, 11); cancel.groupRevision = 12; refuses(() => validateGroupPreviewPayload(cancel));
});

test("commit token syntax and byte bounds are not a claim of signature authority", () => {
  const x = commit(); assert.deepEqual(validateGroupCommit(x, context()), x);
  x.previewToken = "a".repeat(GROUP_LIMITS.previewTokenBytes - 44) + "." + "a".repeat(43); assert.equal(validateGroupCommit(x, context()).previewToken.length, 8192);
  x.previewToken = "a" + x.previewToken; refuses(() => validateGroupCommit(x, context()), "participation_group_token");
  for (const token of ["", "abc", "a.a", "a." + "a".repeat(44), "a." + "a".repeat(42) + "=", [commit().previewToken]]) { const y = commit(); y.previewToken = token; refuses(() => validateGroupCommit(y, context())); }
  const huge = commit(); huge.previewToken = "a".repeat(8148) + "." + "a".repeat(43); huge.reasons = ids(10).map(participationId => ({ participationId, reason: "界".repeat(300) })); refuses(() => validateGroupCommit(huge, context("admit", 10)), "participation_group_limit");
});

test("canonical hash domains have an independent fixed vector and detached value semantics", () => {
  assert.equal(GROUP_METHOD, "participation-group-v1");
  // Independent Python hashlib/json.dumps(sort_keys=True,separators=(',',':')) vector.
  assert.equal(groupHash("selection", { mode: "subset", items: ["p01"] }), "4cdb91f1b6b9ce2743c0b32d4a67c924691437f3b23f0ab6db1885dc30296a39");
  assert.equal(groupCanonical({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}');
  assert.equal(groupHash("pins", { b: 2, a: 1 }), groupHash("pins", { a: 1, b: 2 }));
  assert.notEqual(groupHash("pins", { a: 1 }), groupHash("review", { a: 1 }));
  refuses(() => groupHash("other-method", {}));
});

test("same actor/key binds every operation while complete request changes remain distinct", () => {
  const args = { orgId: "org_1", actorId: "staff_1", groupId: null, operation: "create", input: create() }, first = groupCommandHashes(args);
  const reordered = clone(args); reordered.input.members.reverse(); assert.deepEqual(groupCommandHashes(reordered), first);
  const changed = clone(args); changed.input.target.sourceRevision++; const next = groupCommandHashes(changed); assert.equal(next.commandHash, first.commandHash); assert.notEqual(next.requestHash, first.requestHash);
  const closing = groupCommandHashes({ ...args, groupId: GID, operation: "close", input: { version: 1, groupRevision: 1, reason: "Close draft", idempotencyKey: KEY } }); assert.equal(closing.commandHash, first.commandHash); assert.notEqual(closing.requestHash, first.requestHash);
  assert.notEqual(groupCommandHashes({ ...args, actorId: "staff_2" }).commandHash, first.commandHash);
  assert.notEqual(groupCommandHashes({ ...args, orgId: "org_2" }).commandHash, first.commandHash);
  const malformed = { ...args, operation: "admit", groupId: GID, input: commit() }; malformed.input.selection.mode = "auto-fit"; refuses(() => groupCommandHashes(malformed));
  const withExtra = clone(args); withExtra.clock = stamp(1); refuses(() => groupCommandHashes(withExtra));
});

test("child intent is deterministic, person/action/accepted-command separated and old-key compatible", () => {
  const x = { groupId: GID, commandHash: SHA, operation: "admit", participationId: "p01", action: "confirm" }, a = deriveGroupChildKey(x);
  assert.match(a, /^[A-Za-z0-9_-]{16,100}$/); assert.equal(a.length, 64); assert.equal(deriveGroupChildKey(clone(x)), a);
  for (const delta of [{ groupId: "group_2" }, { commandHash: "b".repeat(64) }, { participationId: "p02" }, { action: "promote" }, { operation: "cancel", action: "cancel" }]) assert.notEqual(deriveGroupChildKey({ ...x, ...delta }), a);
  refuses(() => deriveGroupChildKey({ ...x, operation: "cancel" })); refuses(() => deriveGroupChildKey({ ...x, actorId: "unbound" }));
});

test("close is explicit, bounded and only a draft alternative", () => {
  const x = { version: 1, groupRevision: 1, reason: "  close only this draft 🍃  ", idempotencyKey: KEY }; assert.deepEqual(validateGroupClose(x), x);
  for (const delta of [{ groupRevision: 2 }, { reason: "" }, { reason: "x".repeat(301) }, { idempotencyKey: "short" }, { cancelIndividuals: true }]) refuses(() => validateGroupClose({ ...x, ...delta }));
});

test("retained receipts preserve exact results but admit no personal data or arbitrary nested fields", () => {
  for (const op of ["create", "admit", "cancel", "close"]) { const x = receipt(op); assert.deepEqual(validateGroupReceipt(x), x); assert(Object.isFrozen(validateGroupReceipt(x).result)); }
  for (const change of [x => x.name = "No aggregate name", x => x.authority.role = "owner", x => x.commandHash = [SHA], x => x.result.selected[0].frozenSha256 = [SHA], x => x.result.selected[0].approval = true, x => x.result.selected[0].notificationQueued = "true", x => x.result.groupId = "different", x => x.reviewSha256 = null, x => x.acceptedAtExact = "2026-11-08T11:59:59.999998Z"]) { const x = receipt("admit"); change(x); refuses(() => validateGroupReceipt(x)); }
  const noAuthority = receipt("create"); delete noAuthority.authority; refuses(() => validateGroupReceipt(noAuthority));
  const unsupported = receipt("admit"); unsupported.result.unselectedIds = ["p01"]; refuses(() => validateGroupReceipt(unsupported));
});

test("inactive history strips all live receipt capability and retains original accepted JSON values", () => {
  const receipts = [receipt("create", 1, ids(2), ids(3)), receipt("admit", 2, ids(2), ids(3)), receipt("cancel", 3, ["p01"])];
  const before = clone(receipts), v = history(receipts); assert.deepEqual(receipts, before); assert.equal(v.decisions.length, 3); assert.deepEqual(v.decisions[1].result, receipts[1].result);
  const wire = JSON.stringify(v); for (const key of ["authority", "commandHash", "requestHash", "previewToken", "sessionSha256", "idempotencyKey"]) assert(!wire.includes('"' + key + '"'));
  assert.deepEqual(validateGroupHistory(clone(v)), v); assert(Object.isFrozen(v.decisions[1].result.selected[0]));
  const forged = clone(v); forged.liveTargetId = "target_1"; refuses(() => validateGroupHistory(forged));
  const reordered = clone(v); [reordered.decisions[0], reordered.decisions[1]] = [reordered.decisions[1], reordered.decisions[0]]; refuses(() => validateGroupHistory(reordered));
});

test("the12-receipt bound is witnessed by ten distinct cancellations and refuses duplicate/no-op history", () => {
  const roster = ids(10), records = [receipt("create", 1, roster, roster), receipt("admit", 2, roster, roster), ...roster.map((p, i) => receipt("cancel", i + 3, [p], roster))];
  assert.equal(history(records).decisions.length, 12);
  const repeat = [receipt("create"), receipt("admit"), receipt("cancel", 3, ["p01"]), receipt("cancel", 4, ["p01"])]; refuses(() => history(repeat), "participation_group_noop");
  const outside = [receipt("create"), receipt("admit"), receipt("cancel", 3, ["foreign"])]; refuses(() => history(outside), "participation_group_noop");
  refuses(() => history([...records, receipt("cancel", 13, ["p01"], roster)]));
  const duplicateKey = [receipt("create"), receipt("admit")]; duplicateKey[1].commandHash = duplicateKey[0].commandHash; refuses(() => history(duplicateKey), "participation_group_duplicate");
});

test("draft close is a terminal two-receipt alternative and history never fabricates later admission", () => {
  assert.equal(history([receipt("create"), receipt("close")]).decisions.length, 2);
  refuses(() => history([receipt("create"), receipt("close"), receipt("cancel", 3, ["p01"])]));
  refuses(() => history([receipt("admit")]));
  const x = history([receipt("create"), receipt("admit")]); const wrong = clone(x); wrong.rosterIds = ["p01", "foreign"]; refuses(() => validateGroupHistory(wrong));
  const old = clone(x); old.decisions[1].acceptedAtExact = "2026-11-08T12:00:00.999999Z"; refuses(() => validateGroupHistory(old), "participation_group_time");
});

test("contract labels these closed values as candidates, not implemented admission/capacity/consent authority", () => {
  assert.equal(PARTICIPATION_GROUP_CONTRACT.nominalBoundsMeasured, false);
  assert.equal(PARTICIPATION_GROUP_CONTRACT.previewPayloadKeys.length, 16);
  assert(PARTICIPATION_GROUP_CONTRACT.gatewayDuties.includes("duplicate booking/contact/intake identities"));
  assert(PARTICIPATION_GROUP_CONTRACT.omitted.includes("domain transition execution"));
  assert.equal(GROUP_LIMITS.groups, 100); assert.equal(GROUP_LIMITS.receipts, 12);
});

test("owned group strings AND property names reject every control without invoking getters or proxy traps", () => {
  for (const control of ["\t", "\n", "\r", "\u007f", "\u0085", "\u009f"]) {
    refuses(() => ownGroupValue("ordinary" + control + "text"));
    refuses(() => ownGroupValue({ ["key" + control]: 1 }));
    const x = { version: 1, groupRevision: 1, reason: "Reason" + control, idempotencyKey: KEY }; refuses(() => validateGroupClose(x));
  }
  for (const key of ["\ud800", "\udc00"]) refuses(() => groupHash("pins", { [key]: 1 }));
  let calls = 0; const x = {};
  Object.defineProperty(x, "bad\nkey", { enumerable: true, get() { calls++; throw Error("getter"); } });
  refuses(() => ownGroupValue(x)); assert.equal(calls, 0);
});

test("group command hashing enforces complete16KiB request even inside its larger trusted context", () => {
  const input = commit(); input.previewToken = "a".repeat(8148) + "." + "a".repeat(43);
  input.reasons = ids(10).map(participationId => ({ participationId, reason: "界".repeat(300) }));
  assert(Buffer.byteLength(JSON.stringify(input)) > GROUP_LIMITS.requestBytes);
  refuses(() => groupCommandHashes({ orgId: "org_1", actorId: "staff_1", groupId: GID, operation: "admit", input }), "participation_group_limit");
});
