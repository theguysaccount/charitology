import test from "node:test";
import assert from "node:assert/strict";
import { csrf } from "../lib/security.mjs";
import { makeResourceReservationsBackup, restoreResourceReservationRows } from "../lib/resource-reservation-ledger.mjs";
import { projectResourceReservationStorageRow } from "../lib/resource-reservation-store.mjs";
import { resourceReservationRoutes } from "../lib/resource-reservation-routes.mjs";

const org = "fictional_org", actor = "admin_1", sessionId = "session_cookie";
const initialClock = "2030-01-10T10:55:33.432198Z";
const stamp = "2029-10-01T08:11:22.123456Z";
const origin = "https://os.example.test";
const secret = "synthetic-resource-api-test-secret-01";
const requestKey = "fictional_request_0001";
const liveSession = { user: { id: actor }, session: { id: sessionId } };
const interval = {
  startAt: "2030-01-11T10:00:00-05:00", endAt: "2030-01-11T11:00:00-05:00", timeZone: "America/New_York",
};
const asset = id => ({ id, module_id: "assets", revision: 3, title: "Synthetic room",
  defining: { kind: "asset", programId: null, assetCode: "ONE", locationCode: null, quantity: 1 } });
const occurrence = id => ({ id, module_id: "events", revision: 3, title: "Synthetic workshop",
  defining: { kind: "session", programId: null, ...interval } });
const approved = row => ({ ...row, created_exact: stamp, last_editor_id: "last_editor",
  approval: { status: "approved", revision: row.revision, actorId: "reviewer", reason: "Independent\nreview", at: "2029-10-02T10:00:00.000Z" } });
const result = list => ({ rows: list, rowCount: list.length });

/** Owned synthetic SQL adapter. All ledger, store, route and preview functions are the held source. */
function fixture() {
  const state = {
    now: initialClock, role: "admin", memberRevision: 1, programs: [], memberCreatedAt: stamp, sessionId,
    orgRestore: null, restored: new Map(), events: [], faults: [], authFail: false,
    overflowSources: false, failLookup: false, loseAfterCommit: false, readAdmission: null,
    records: new Map([asset("room_a"), asset("room_b"), occurrence("event_a")].map(row => [row.id, approved(row)])),
    holds: new Map(), receipts: new Map(), audits: [], modes: [],
  };
  const db = {
    async limit(key) { state.events.push(["rate", key.split(":")[0]]); },
    async tx(user, tenant, fn, { lock = false, readOnly = false } = {}) {
      assert.equal(user, actor);
      assert.equal(tenant, org);
      const holds = structuredClone(state.holds), receipts = structuredClone(state.receipts), audits = [...state.audits];
      const c = { audits, async query(sql, args = []) {
        const write = /^(?:INSERT|UPDATE)\b/.test(sql.trim());
        if (write) assert.ok(lock && !readOnly, "all writes require the owned lock and mutable transaction");
        if (sql.includes('AS current_user_id')) {
          state.events.push(["auth", lock, readOnly]);
          return result(!state.authFail && args[0] === state.sessionId && args[1] === actor
            ? [{ session_id: state.sessionId, user_id: actor, current_user_id: actor }] : []);
        }
        if (sql.includes("FROM os_members")) return result([{ user_id: actor, role: state.role,
          program_ids: state.programs, revision: state.memberRevision, created_exact: state.memberCreatedAt }]);
        if (sql.includes("WITH selected AS")) return result([{
          org_created_exact: stamp, backup_restored_id: state.orgRestore,
          records: args[1].map(recordId => ({ recordId, lastRestoredAuditId: state.restored.get(recordId) ?? null })),
        }]);
        if (sql.includes("FROM os_orgs o")) return result([{ created_exact: stamp, restored_id: state.orgRestore }]);
        if (sql.includes("AS now_exact")) {
          state.events.push(["decision-clock", lock, readOnly]);
          return result([{ now_exact: state.now }]);
        }
        if (sql.includes("FROM os_records r CROSS JOIN")) {
          assert.ok(lock);
          const selected = [...state.records.values()].filter(row =>
            !row.deleted && row.approval && (args[1] === null || args[1].includes(row.id)));
          return result(state.overflowSources && args[1] === null ? Array(2001).fill(selected[0]) : selected);
        }
        if (sql.includes("FROM os_records WHERE")) return result(args[1].filter(id =>
          state.records.has(id) && (!sql.includes("deleted_at IS NULL") || !state.records.get(id).deleted))
          .map(id => { const { module_id, created_exact } = state.records.get(id); return { id, module_id, created_exact }; }));
        if (sql.includes("WITH holds AS")) {
          assert.ok(lock);
          state.events.push(["physical-measure", lock, readOnly]);
          return result([{
            reservation_count: String(holds.size), command_count: String(receipts.size),
            reservation_bytes: String([...holds.values()].reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0)),
            command_bytes: String([...receipts.values()].reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0)),
          }]);
        }
        if (sql.includes("LEFT JOIN os_resource_reservation_commands")) return result([...holds.values()]
          .sort((a, b) => a.id < b.id ? -1 : 1).map(row => ({
            ...row, original_receipt: receipts.get(row.original_command_hash)?.receipt ?? null,
            terminal_receipt: receipts.get(row.terminal_command_hash)?.receipt ?? null,
          })));
        if (sql.includes("FROM os_resource_reservation_commands WHERE")) {
          assert.ok(lock);
          state.events.push(["lookup", lock, readOnly]);
          if (state.failLookup && readOnly) throw new Error("synthetic receipt read failure");
          return result(receipts.has(args[1]) ? [receipts.get(args[1])] : []);
        }
        if (sql.includes("AND r.origin_mode='recovered'")) {
          assert.ok(lock);
          state.events.push(["recovery-lookup", lock, readOnly]);
          if (state.failLookup && readOnly) throw new Error("synthetic recovery lookup failure");
          const row = holds.get(args[1]);
          return result(row?.origin_mode === "recovered" ?
            [{ ...row, original_receipt: null, terminal_receipt: null }] : []);
        }
        if (sql.includes("FROM os_resource_reservations WHERE")) return result(args[1]
          .filter(id => holds.has(id)).map(id => holds.get(id)));
        if (sql.includes("INSERT INTO os_resource_reservation_commands")) {
          assert.ok(!receipts.has(args[1]));
          const receipt = JSON.parse(args[2]);
          const row = { command_hash: args[1], previous_id: receipt.decision.previous?.id ?? null,
            next_id: receipt.decision.next?.id ?? null };
          receipts.set(row.command_hash, { org_id: org, ...row, receipt });
          return result([row]);
        }
        if (sql.includes("UPDATE os_resource_reservations")) {
          const row = holds.get(args[1]);
          assert.equal(row.state, "reserved");
          assert.equal(row.proof_sha256, args[3]);
          const terminal = sql.includes("disposition=$3")
            ? { disposition: JSON.parse(args[2]) }
            : { terminal_command_hash: args[2] };
          holds.set(row.id, { ...row, state: "released", revision: 2, ...terminal });
          return result([{ id: row.id }]);
        }
        if (sql.includes("INSERT INTO os_resource_reservations")) {
          const [org_id, id, asset_id, occurrence_id, origin_mode, rowState, revision, proof, proof_sha256,
            original_command_hash, terminal_command_hash, history_core, disposition] = args;
          assert.ok(!holds.has(id));
          holds.set(id, { org_id, id, asset_id, occurrence_id, origin_mode, state: rowState, revision,
            proof: JSON.parse(proof), proof_sha256, original_command_hash, terminal_command_hash, history_core, disposition });
          return result([{ id }]);
        }
        state.faults.push(sql);
        throw new Error("Unexpected synthetic query");
      } };
      const value = await fn(c);
      if (!readOnly) {
        state.holds = holds; state.receipts = receipts; state.audits = audits;
        if (state.loseAfterCommit) {
          state.loseAfterCommit = false;
          throw new Error("synthetic disconnect after durable commit");
        }
      }
      return value;
    },
  };
  const hooks = {
    async auditReservation(c, orgId, actorId, action, record, detail) {
      c.audits.push({ orgId, actorId, action, record, detail });
      return true;
    },
    async admitWorkspace(c, admission) {
      assert.ok(c);
      state.modes.push(admission.mode);
      return state.readAdmission ? state.readAdmission() : true;
    },
  };
  async function call(action, payload, options = {}) {
    const settings = { secret: options.secret ?? secret, origin };
    const url = new URL("/api/orgs/" + org + "/resource-reservations/" + action, origin);
    const request = payload === undefined ? new Request(url) : new Request(url, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "x-csrf-token": csrf(sessionId, settings.secret) },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    const response = await resourceReservationRoutes({ request, db, settings, session: liveSession, ...hooks, ...options });
    assert.deepEqual(state.faults, []);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    return { status: response.status, value: await response.json() };
  }
  return { call, state };
}

const selected = id => ({ id, revision: 3 });
const reviewBody = (scopeSha256, operation = "reserve", assetId = "room_a", previous = null) => ({
  version: 1, scopeSha256, operation, previous,
  asset: operation === "release" ? null : selected(assetId),
  session: operation === "release" ? null : selected("event_a"),
  reason: operation === "reserve" ? null : "Staff requested the change.",
});
const commitBody = (view, idempotencyKey = requestKey) => {
  const { operation, previous, reason } = view.input;
  const request = { version: 1, idempotencyKey };
  if (previous) Object.assign(request, { reservationId: previous.id, reservationRevision: previous.revision, reason });
  if (view.preview) Object.assign(request, { previewToken: view.preview.previewToken,
    reviewSha256: view.preview.reviewSha256, acknowledge: true });
  return { version: 1, scopeSha256: view.scopeSha256, operation, request };
};
async function ready(h, operation, assetId, previous) {
  const work = await h.call("workspace");
  assert.equal(work.status, 200);
  const input = reviewBody(work.value.scopeSha256, operation, assetId, previous);
  const review = await h.call("review", input);
  assert.equal(review.status, 200);
  assert.equal(review.value.state, "ready");
  assert.deepEqual(review.value.input, input);
  return review.value;
}

test("reserve and prepaid release project exact DTOs and preserve accepted retry across expiry and key rotation", async () => {
  const h = fixture(), review = await ready(h);
  assert.equal(review.preview.expiresAtExact, "2030-01-10T11:05:33.432198Z");
  assert.equal(h.state.holds.size, 0);
  const wire = commitBody(review), first = await h.call("commit", wire);
  assert.equal(first.status, 200);
  assert.equal(first.value.state, "accepted");
  assert.equal(first.value.replayed, false);
  assert.equal(first.value.decision.next.id, review.next.id);
  assert.deepEqual(first.value.decision.next, first.value.current[0]);
  assert.deepEqual(Object.keys(first.value.decision).sort(), ["acceptedAtExact", "next", "operation", "previous", "reason"]);
  assert.deepEqual(h.state.audits.map(audit => audit.action), ["resource-reservation.reserved"]);

  h.state.records.get("room_a").approval = null;
  h.state.records.get("event_a").deleted = true;
  h.state.now = "2030-01-13T10:00:00.000000Z";
  const release = await ready(h, "release", null, { id: review.next.id, revision: 1 });
  assert.equal(release.preview, null);
  const closed = await h.call("commit", commitBody(release, "fictional_release_001"));
  assert.equal(closed.value.decision.previous.state, "released");
  assert.deepEqual(h.state.modes, ["ordinary", "release-safety"]);
  assert.equal(h.state.audits.length, 1);
  assert.equal(h.state.receipts.size, 2);

  h.state.events.length = 0;
  const replay = await h.call("commit", wire, { secret: secret + "rotated", admitWorkspace: undefined, auditReservation: undefined });
  assert.equal(replay.value.replayed, true);
  assert.deepEqual(replay.value.decision, first.value.decision);
  assert.equal(replay.value.current[0].state, "released");
  assert.equal(replay.value.current[0].revision, 2);
  assert.deepEqual(h.state.events.filter(event => ["lookup", "decision-clock", "physical-measure"].includes(event[0])),
    [["lookup", true, true]]);
  assert.ok(!h.state.events.some(event => event[1] === "resource-reservation-write"));
  const altered = await h.call("commit", { ...wire, request: { ...wire.request, reviewSha256: "f".repeat(64) } });
  assert.equal(altered.status, 409);
  assert.equal(h.state.receipts.size, 2);
});

test("fresh authorization, source approval and restored source authority invalidate the correct paths", async () => {
  const h = fixture(), review = await ready(h), wire = commitBody(review);
  h.state.records.get("room_a").approval.actorId = "last_editor";
  const stale = await h.call("commit", wire);
  assert.equal(stale.value.reasonCode, "stale");
  assert.equal(h.state.holds.size, 0);
  assert.equal(h.state.events.at(-1)[0], "lookup");
  h.state.records.get("room_a").approval.actorId = "reviewer";
  const saved = await h.call("commit", wire);
  assert.equal(saved.value.state, "accepted");
  h.state.restored.set("room_a", "31");
  const restored = await h.call("commit", wire);
  assert.equal(restored.status, 409);
  h.state.programs = ["limited_program"];
  h.state.events.length = 0;
  assert.equal((await h.call("commit", wire)).status, 403);
  assert.ok(!h.state.events.some(event => event[0] === "lookup"));
  h.state.programs = [];
  h.state.memberRevision++;
  assert.equal((await h.call("commit", wire)).status, 403);
  h.state.memberRevision--;
  h.state.sessionId = "other_session";
  assert.equal((await h.call("commit", wire)).status, 401);
  assert.equal(h.state.receipts.size, 1);
});

test("the final SQL clock boundary and changed complete inventory refuse without writes", async () => {
  const h = fixture(), review = await ready(h), wire = commitBody(review);
  h.state.now = review.preview.expiresAtExact;
  assert.equal((await h.call("commit", wire)).value.reasonCode, "expired");
  assert.equal(h.state.receipts.size, 0);
  h.state.now = initialClock;
  const other = await ready(h, "reserve", "room_b");
  assert.equal((await h.call("commit", commitBody(other, "other_resource_key_001"))).value.state, "accepted");
  assert.equal((await h.call("commit", wire)).value.reasonCode, "stale");
  assert.equal(h.state.receipts.size, 1);
});

test("failed mandatory audit and final measured admission preserve the original replacement predecessor", async () => {
  const h = fixture(), original = await ready(h);
  assert.equal((await h.call("commit", commitBody(original))).value.state, "accepted");
  const previous = { id: original.next.id, revision: 1 };
  const replacement = await ready(h, "replace", "room_b", previous);
  const wire = commitBody(replacement, "fictional_replace_001");
  assert.equal((await h.call("commit", wire, { auditReservation: undefined })).status, 503);
  const missing = await h.call("commit", wire, { auditReservation: async () => false });
  assert.equal(missing.status, 503);
  assert.equal(h.state.holds.get(previous.id).state, "reserved");
  h.state.readAdmission = () => false;
  const capacity = await h.call("commit", wire);
  assert.equal(capacity.value.reasonCode, "capacity");
  assert.equal(h.state.holds.size, 1);
  assert.equal(h.state.receipts.size, 1);
  assert.equal(h.state.audits.length, 1);
  h.state.readAdmission = () => { h.state.failLookup = true; return false; };
  const unknown = await h.call("commit", wire);
  assert.equal(unknown.status, 500);
  assert.ok(!Object.hasOwn(unknown.value, "reasonCode"));
  assert.equal(h.state.holds.get(previous.id).state, "reserved");
});

test("a lost commit response only reconciles the same accepted command under a read-only lock", async () => {
  const h = fixture(), review = await ready(h), wire = commitBody(review);
  h.state.loseAfterCommit = true;
  const lost = await h.call("commit", wire);
  assert.equal(lost.value.replayed, true);
  assert.equal(lost.value.decision.next.id, review.next.id);
  assert.equal(h.state.receipts.size, 1);
  assert.equal(h.state.audits.length, 1);
  assert.deepEqual(h.state.events.at(-1), ["lookup", true, true]);
});

test("bounded sources, JSON body, duplicate keys and review token have no silent truncation", async () => {
  const h = fixture(), review = await ready(h), wire = commitBody(review);
  assert.equal((await h.call("review", " ".repeat(16385))).status, 413);
  assert.equal((await h.call("review", '{"scopeSha256":"a","scopeSha256":"b"}')).status, 422);
  const huge = { ...wire, request: { ...wire.request, previewToken: "a".repeat(8193) + "." + "a".repeat(43) } };
  assert.equal((await h.call("commit", huge)).status, 422);
  h.state.overflowSources = true;
  const over = await h.call("workspace");
  assert.equal(over.status, 422);
  assert.equal(over.value.ok, false);
  assert.ok(!Object.hasOwn(over.value, "assets"));
  assert.equal(h.state.receipts.size, 0);
});

const recoveryOperation = "resolve-recovered";
const recoveryReason = "Carry no internal hold forward.";

function recoveryInput(scopeSha256, hold, reason = recoveryReason) {
  return { version: 1, scopeSha256, operation: recoveryOperation,
    previous: { id: hold.id, revision: 1 }, asset: null, session: null, reason };
}

function recoveryWire(view) {
  return { version: 1, scopeSha256: view.scopeSha256, operation: recoveryOperation, request: {
    version: 1, idempotencyKey: view.preview.reviewSha256, reservationId: view.previous.id,
    reservationRevision: 1, reason: view.input.reason, proofSha256: view.previous.proofSha256,
    previewToken: view.preview.previewToken, reviewSha256: view.preview.reviewSha256, acknowledge: true,
  } };
}

async function recoveredFixture() {
  const h = fixture(), original = await ready(h);
  const accepted = await h.call("commit", commitBody(original));
  assert.equal(accepted.value.state, "accepted");
  const physical = h.state.holds.get(original.next.id);
  const live = { version: 1, orgId: org, id: physical.id, originMode: "live", state: "reserved", revision: 1,
    proof: physical.proof, originalReceipt: h.state.receipts.get(physical.original_command_hash).receipt,
    terminalReceipt: null, history: null };
  const refs = [{ id: physical.asset_id, moduleId: "assets" }, { id: physical.occurrence_id, moduleId: "events" }];
  const backup = makeResourceReservationsBackup(org, [live], refs);
  const [recovered] = restoreResourceReservationRows(org, backup, org, refs);
  h.state.holds.set(recovered.id, projectResourceReservationStorageRow(recovered));
  h.state.receipts.clear();
  h.state.audits.length = 0;
  h.state.modes.length = 0;
  h.state.orgRestore = "34";
  h.state.now = "2030-01-10T12:00:00.123456Z";
  for (const { id } of refs) {
    h.state.records.get(id).created_exact = "2029-12-10T10:00:00.123456Z";
    h.state.records.get(id).approval = null;
  }
  return { h, recovered };
}

async function recoveryReady(h) {
  const { value } = await h.call("workspace");
  const hold = value.reservations[0];
  const review = await h.call("review", recoveryInput(value.scopeSha256, hold));
  assert.equal(review.status, 200);
  assert.equal(review.value.state, "ready");
  assert.deepEqual(review.value.previous, hold);
  assert.equal(review.value.next, null);
  return review.value;
}

test("only a signed acknowledged recovered review can record one inactive disposition", async () => {
  const live = fixture(), reserve = await ready(live);
  assert.equal((await live.call("commit", commitBody(reserve))).value.state, "accepted");
  assert.equal((await live.call("review", recoveryInput(reserve.scopeSha256, reserve.next))).status, 409);
  assert.equal(live.state.holds.get(reserve.next.id).state, "reserved");

  const { h, recovered } = await recoveredFixture(), view = await recoveryReady(h), wire = recoveryWire(view);
  assert.equal(view.previous.originMode, "recovered");
  assert.equal(view.previous.sourceState, "reserved");
  assert.equal(view.previous.disposition, null);
  assert.equal(view.preview.expiresAtExact, "2030-01-10T12:10:00.123456Z");
  const ignored = await h.call("commit", { ...wire, request: { ...wire.request, acknowledge: false } });
  assert.equal(ignored.status, 422);
  const forged = await h.call("commit", { ...wire, request: { ...wire.request, previewToken: reserve.preview.previewToken } });
  assert.equal(forged.status, 422);
  assert.equal(h.state.holds.get(recovered.id).state, "reserved");

  const result = await h.call("commit", wire);
  assert.equal(result.value.state, "accepted");
  assert.equal(result.value.decision.operation, recoveryOperation);
  assert.equal(result.value.decision.reason, recoveryReason);
  assert.deepEqual(result.value.current, [result.value.decision.previous]);
  assert.equal(result.value.decision.previous.revision, 2);
  assert.equal(result.value.decision.next, null);
  const saved = h.state.holds.get(recovered.id);
  assert.deepEqual(saved.history_core.proof, recovered.history.proof);
  assert.equal(saved.history_core.sourceState, "reserved");
  assert.match(saved.disposition.actorSha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.disposition.orgId, org);
  assert.equal(saved.terminal_command_hash, null);
  assert.equal(h.state.receipts.size, 0);
  assert.deepEqual(h.state.modes, ["release-safety"]);
  assert.equal(h.state.audits.length, 0);

  h.state.now = "2030-01-11T10:00:00.000000Z";
  h.state.events.length = 0;
  const retry = await h.call("commit", wire, { admitWorkspace: undefined, auditReservation: undefined });
  assert.equal(retry.value.replayed, true);
  assert.deepEqual(retry.value.decision, result.value.decision);
  assert.deepEqual(h.state.events.filter(event => /lookup|clock|measure/.test(event[0])),
    [["recovery-lookup", true, true]]);
  const changed = await h.call("commit", { ...wire, request: { ...wire.request, reason: "Different reason." } });
  assert.equal(changed.status, 409);
  const rotated = await h.call("commit", wire, { secret: secret + "rotated" });
  assert.equal(rotated.status, 422);
  assert.deepEqual(h.state.holds.get(recovered.id), saved);
});

test("recovered scope staleness, capacity rollback and a lost reply keep the exact one-write semantics", async () => {
  const { h, recovered } = await recoveredFixture(), view = await recoveryReady(h), wire = recoveryWire(view);
  h.state.restored.set(recovered.history.proof.asset.id, "37");
  assert.equal((await h.call("commit", wire)).value.reasonCode, "stale");
  h.state.restored.clear();
  h.state.now = view.preview.expiresAtExact;
  assert.equal((await h.call("commit", wire)).value.reasonCode, "expired");
  h.state.now = "2030-01-10T12:00:00.123456Z";
  h.state.readAdmission = () => false;
  assert.equal((await h.call("commit", wire)).value.reasonCode, "capacity");
  assert.equal(h.state.holds.get(recovered.id).disposition, null);

  h.state.readAdmission = null;
  h.state.loseAfterCommit = true;
  const lost = await h.call("commit", wire);
  assert.equal(lost.value.state, "accepted");
  assert.equal(lost.value.replayed, true);
  assert.equal(h.state.receipts.size, 0);
  assert.equal(h.state.audits.length, 0);
  assert.equal((await h.call("workspace")).value.reservations[0].disposition.reason, recoveryReason);
  h.state.memberRevision++;
  assert.equal((await h.call("commit", wire)).status, 403);
});

test("an inherited same-organization disposition cannot settle an unrelated signed review", async () => {
  const { h, recovered } = await recoveredFixture(), view = await recoveryReady(h), wire = recoveryWire(view);
  const accepted = await h.call("commit", wire);
  assert.equal(accepted.value.state, "accepted");
  const record = h.state.holds.get(recovered.id);
  // Model a historical disposition retained before this workspace's review.
  record.disposition.acceptedAtExact = "2030-01-10T11:59:59.999999Z";
  const historical = await h.call("commit", wire);
  assert.equal(historical.status, 409);
  assert.equal(record.state, "released");
  assert.equal(h.state.receipts.size, 0);
  assert.equal(h.state.audits.length, 0);
});
