import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  GROUP_METHOD, GROUP_LIMITS, ParticipationGroupError,
  projectGroupHistory, validateGroupHistory,
} from "../lib/participation-group-model.mjs";
import {
  PARTICIPATION_GROUP_BACKUP_FORMAT as FORMAT,
  PARTICIPATION_GROUP_BACKUP_DOMAIN as DOMAIN,
  PARTICIPATION_GROUP_BACKUP_LIMITS as LIMITS,
  makeParticipationGroupsBackup as make,
  validateParticipationGroupsBackup as validate,
} from "../lib/participation-group-backup.mjs";

const SHA = "a".repeat(64);
const stamp = second => `2026-11-08T12:00:${String(second).padStart(2, "0")}.123456Z`;
const clone = value => structuredClone(value);
const refuses = (fn, code) => assert.throws(fn, error => error instanceof ParticipationGroupError && (!code || error.code === code));
const canonical = value => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child)
  ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child);
function envelope(groups) {
  const body = { format: FORMAT, version: 1, method: GROUP_METHOD, groups };
  const checksum = createHash("sha256").update(DOMAIN, "utf8").update(canonical(body), "utf8").digest("hex");
  return { ...body, checksum };
}
function receipts(id = "group_1", members = 2, longIds = false) {
  const roster = Array.from({ length: members }, (_, i) => `p${String(i + 1).padStart(2, "0")}${longIds ? "_" + "x".repeat(95) : ""}`);
  const base = (operation, revision, result) => ({
    version: 1, groupId: id, operation, commandHash: String(revision).padStart(64, "0"), requestHash: SHA,
    authority: { actorSha256: SHA, sessionSha256: SHA, membershipSha256: SHA, memberCreatedAtExact: stamp(0), restoreEpochSha256: SHA },
    reviewSha256: operation === "create" ? null : SHA, acceptedAtExact: stamp(revision),
    result: { groupId: id, groupRevision: revision, state: operation === "create" ? "draft" : "admitted", ...result },
  });
  return [
    base("create", 1, { target: { targetId: "missing_original_target", moduleId: "volunteers" }, rosterIds: roster, coordinatorIntakeId: "missing_original_enquiry" }),
    base("admit", 2, {
      selectionMode: "all", selected: roster.map(participationId => ({ participationId, action: "confirm", resultRevision: 4, state: "confirmed", frozenSha256: SHA, allocationHash: null, notificationQueued: false, auditRetained: true })),
      unselectedIds: [], reasonHashes: [], auditRetained: true,
    }),
    ...roster.map((participationId, i) => base("cancel", i + 3, {
      selected: [{ participationId, resultRevision: 5, state: "cancelled", notificationQueued: false, auditRetained: false }],
      reasonSha256: SHA, auditRetained: false,
    })),
  ];
}
const history = (id, members = 2, longIds = false) => projectGroupHistory({ originOrgId: "original_org", receipts: receipts(id, members, longIds) });

test("absence, explicit empty import and empty export remain distinct without changing old packets", () => {
  const old = { format: "fictional-existing-packet", version: 2, records: [] }, bytes = JSON.stringify(old);
  assert.equal(validate(undefined), null);
  assert.equal(make([]), undefined);
  const exported = { ...old, participationGroups: make([]) };
  assert.equal(JSON.stringify(exported), bytes);
  const empty = validate(envelope([]));
  assert.deepEqual(empty.groups, []); assert(Object.isFrozen(empty) && Object.isFrozen(empty.groups));
  assert.notEqual(empty, null); assert.deepEqual(validate(empty), empty);
  refuses(() => validate(null)); refuses(() => make(undefined));
});

test("maker sorts a detached family by ASCII id and checksum matches independent crypto", () => {
  const input = [clone(history("z")), clone(history("a")), clone(history("B"))], before = clone(input), result = make(input);
  assert.deepEqual(result.groups.map(x => x.id), ["B", "a", "z"]);
  assert.deepEqual(result, envelope(result.groups)); assert.deepEqual(input, before);
  assert.deepEqual(validate(result), result); assert(Object.isFrozen(result.groups[0].decisions[0].result));
  input[0].id = "later"; assert.equal(result.groups[2].id, "z");
  assert.throws(() => { result.groups[0].targetId = "other"; }, TypeError);
});

test("orphan historical decisions retain exact values through repeated inactive round trips", () => {
  const original = history("orphan", 10), bytes = JSON.stringify(original);
  let packet = make([original]);
  for (let i = 0; i < 3; ++i) {
    const admitted = validate(clone(packet));
    assert.equal(JSON.stringify(admitted.groups[0]), bytes);
    assert.deepEqual(admitted.groups[0], validateGroupHistory(original));
    packet = make(admitted.groups);
  }
  assert.equal(packet.groups[0].targetId, "missing_original_target");
  assert.equal(packet.groups[0].coordinatorIntakeId, "missing_original_enquiry");
  assert.equal(packet.groups[0].decisions.length, 12);
  for (const key of ["authority", "commandHash", "requestHash", "previewToken", "idempotencyKey", "actorId", "sessionSha256"])
    assert.equal(JSON.stringify(packet).includes(`"${key}"`), false);
});

test("unadmitted and explicitly closed histories remain historical rather than becoming an allocation", () => {
  const created = receipts("draft")[0];
  created.result.target.moduleId = "events";
  const draft = projectGroupHistory({ originOrgId: "original_org", receipts: [created] });
  const closedReceipts = receipts("closed").slice(0, 2), closed = closedReceipts[1];
  closed.operation = "close"; closed.reviewSha256 = null;
  closed.result = { groupId: "closed", groupRevision: 2, state: "closed", reasonSha256: SHA, auditRetained: false };
  const historyClosed = projectGroupHistory({ originOrgId: "original_org", receipts: closedReceipts });
  const packet = make([draft, historyClosed]), admitted = validate(clone(packet));
  assert.deepEqual(admitted.groups, [historyClosed, draft]);
  assert.equal(admitted.groups[1].decisions.length, 1);
  assert.equal(admitted.groups[0].decisions[1].result.state, "closed");
  assert.deepEqual(make(admitted.groups), packet);
});

test("strict import refuses duplicate IDs and noncanonical group ordering even with matching checksum", () => {
  const a = history("a"), b = history("b");
  refuses(() => make([a, a]), "participation_group_duplicate");
  refuses(() => validate(envelope([a, a])), "participation_group_duplicate");
  refuses(() => validate(envelope([b, a])));
  const otherOrigin = clone(a); otherOrigin.originOrgId = "another_original_org";
  refuses(() => make([a, otherOrigin]), "participation_group_duplicate");
});

test("checksum and complete new namespace fields bind content but cannot grant authority", () => {
  const good = make([history("group")]);
  for (const mutate of [
    x => { x.checksum = "0".repeat(64); },
    x => { x.groups[0].originOrgId = "another_original_org"; },
    x => { x.format = "other"; }, x => { x.version = 2; }, x => { x.method = "other"; },
    x => { x.extra = false; }, x => { delete x.checksum; }, x => { x.checksum = x.checksum.toUpperCase(); },
  ]) { const bad = clone(good); mutate(bad); refuses(() => validate(bad)); }
  for (const at of [x => x, x => x.decisions[0], x => x.decisions[1].result, x => x.decisions[1].result.selected[0]]) {
    const bad = clone(good.groups[0]); at(bad).authority = { sessionSha256: SHA };
    refuses(() => validate(envelope([bad]))); refuses(() => make([bad]));
  }
  refuses(() => make(receipts("live_receipt")));
  const wrapper = { originOrgId: "original_org", receipts: receipts("live_receipts") };
  refuses(() => make([wrapper]));
});

test("all container descriptors and canonical dense indices are admitted without touching getters", () => {
  let touched = 0;
  const good = make([history("group")]);
  const getter = clone(good); Object.defineProperty(getter, "groups", { enumerable: true, get() { touched++; return good.groups; } });
  refuses(() => validate(getter));
  const element = [history("group")]; Object.defineProperty(element, "0", { enumerable: true, get() { touched++; return good.groups[0]; } });
  refuses(() => make(element)); refuses(() => validate({ ...good, groups: element }));
  const nested = clone(good.groups[0]); Object.defineProperty(nested.decisions[0].result, "rosterIds", { enumerable: true, get() { touched++; return []; } });
  refuses(() => make([nested]));
  for (const key of ["01", "-0", "1e0", "4294967295", "99999999999999999999999999999999999"]) {
    const sparse = new Array(1); sparse[key] = history("group");
    refuses(() => make(sparse)); refuses(() => validate({ ...good, groups: sparse }));
  }
  const hidden = [history("group")]; Object.defineProperty(hidden, "hidden", { value: true }); refuses(() => make(hidden));
  const symbol = [history("group")]; symbol[Symbol("hidden")] = true; refuses(() => make(symbol));
  const decorated = clone(good); Object.defineProperty(decorated, "checksum", { enumerable: false, value: good.checksum }); refuses(() => validate(decorated));
  const exotic = [history("group")]; Object.setPrototypeOf(exotic, null); refuses(() => make(exotic));
  assert.equal(touched, 0);
});

test("proxies, revoked proxies, cycles and exotic roots refuse before serialization or hashing", () => {
  let touched = 0;
  const proxy = target => new Proxy(target, {
    get() { touched++; throw Error("trap"); }, getPrototypeOf() { touched++; throw Error("trap"); },
    ownKeys() { touched++; throw Error("trap"); }, getOwnPropertyDescriptor() { touched++; throw Error("trap"); },
  });
  refuses(() => make(proxy([]))); refuses(() => validate(proxy(envelope([]))));
  refuses(() => make([proxy(history("group"))]));
  const revoked = Proxy.revocable([], {}); revoked.revoke(); refuses(() => make(revoked.proxy));
  const cycle = []; cycle.push(cycle); refuses(() => make(cycle));
  const bad = clone(history("group")); bad.decisions[0].result.loop = bad; refuses(() => make([bad]));
  for (const value of [new Map(), new Date(), Object.create(null), "[]", null]) refuses(() => make(value));
  assert.equal(touched, 0);
});

test("one hundred valid histories can exceed the model graph cap without raising it", t => {
  const histories = Array.from({ length: 100 }, (_, i) => history(`group_${String(i).padStart(3, "0")}`, 10, true));
  const packet = make(histories);
  const packetBytes = Buffer.byteLength(JSON.stringify(packet));
  assert(packetBytes > GROUP_LIMITS.modelBytes);
  assert(packetBytes < LIMITS.bytes);
  t.diagnostic(`100 valid inactive histories serialize to ${packetBytes} UTF-8 JSON bytes; this is not SQL or whole-workspace capacity.`);
  assert.equal(validate(packet).groups.length, 100);
  assert.equal(LIMITS.groups, 100); assert.equal(LIMITS.bytes, 8 * 1024 * 1024); assert.equal(LIMITS.historyBytes, 65536);
  assert.equal(GROUP_LIMITS.modelBytes, 131072);
  refuses(() => make([...histories, history("group_101")]), "participation_group_limit");
  refuses(() => validate(envelope([...histories, history("group_101")])), "participation_group_limit");
});

test("per-history ownership and closed schema apply before a content checksum can legitimize it", () => {
  const tooLarge = clone(history("group")); tooLarge.originOrgId = "x".repeat(LIMITS.historyBytes);
  refuses(() => make([tooLarge]), "participation_group_limit");
  refuses(() => validate(envelope([tooLarge])), "participation_group_limit");
  const forged = clone(history("group")); forged.decisions[2].result.selected[0].participationId = "unadmitted_person";
  refuses(() => validate(envelope([forged])));
});
