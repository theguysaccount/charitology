import assert from "node:assert/strict";
import { test } from "node:test";
import { hash } from "../lib/security.mjs";
import { createVolunteerSubstitutionCommand } from "../lib/volunteer-substitution-command.mjs";
import { consumeVolunteerSubstitutionFreshWrite } from "../lib/volunteer-substitution-rate.mjs";
import { planVolunteerSubstitution } from "../lib/volunteer-substitution-review.mjs";

const orgId = "fictional-org", intentId = "a".repeat(32), userId = "fictional-staff";
const session = { user: { id: userId }, session: { id: "fictional-session" } };
const person = (id, state, identity, scope) => ({
  id, revision: 3, targetId: "fictional-shift", candidateRevision: 5, candidateCurrent: true,
  state, coverage: "full", origin: "live", groupLinked: false,
  personIdentitySha256: identity.repeat(64), linkScopeSha256: scope.repeat(64),
});
const outgoing = person("place-outgoing", "confirmed", "b", "c");
const replacement = person("place-replacement", "waitlisted", "d", "e");
const choice = (person, party) => ({
  orgId, intentId, party, shiftId: "fictional-shift", shiftRevision: 2, participationId: person.id,
  participationRevision: person.revision, linkScopeSha256: person.linkScopeSha256,
  acceptedAt: "2026-11-09T10:59:00.000000Z", expiresAt: "2026-11-09T11:10:00.000000Z", active: true,
});
const scope = { orgId, intentId, staffScopeSha256: "1".repeat(64) };
const restoreScopeSha256 = "2".repeat(64);
const facts = {
  ...scope, restoreScopeSha256, nowExact: "2026-11-09T11:00:00.000000Z",
  shift: { id: "fictional-shift", revision: 2, kind: "volunteer-shift", approved: true, state: "open",
    startsAt: "2026-11-09T12:00:00.000000Z", endsAt: "2026-11-09T13:00:00.000000Z", capacity: 1, managed: true },
  outgoing, replacement, releaseConsent: choice(outgoing, "leaving"), replacementConsent: choice(replacement, "joining"),
  roster: { confirmed: 1, nextEligibleId: replacement.id, replacementOverlap: false, outgoingCheckedIn: false, sourceComplete: true },
};
const request = {
  version: 1, reviewSha256: planVolunteerSubstitution(facts).reviewSha256,
  idempotencyKey: "fictional-request-1", acknowledge: true,
};
const assignmentIds = { outgoing: "assignment-outgoing", replacement: "assignment-replacement" };

function fixture() {
  const events = [];
  const state = { hits: 29, receipt: null, staged: 0, failFinal: false };
  const c = {
    async query(sql, params) {
      assert.match(sql, /INSERT INTO os_rate_limits/);
      assert.deepEqual(params, ["shift-substitution:write:" + hash([orgId, userId]), 3600]);
      events.push("fresh rate");
      return { rows: [{ hits: ++state.hits }] };
    },
  };
  const traced = (name, work) => async (client, ...args) => {
    assert.equal(client, c);
    events.push(name);
    return work(...args);
  };
  const command = createVolunteerSubstitutionCommand({
    db: {
      limit() { throw Error("No second pool acquisition is allowed."); },
      async tx(actor, org, run, options) {
        assert.deepEqual([actor, org, options], [userId, orgId, { lock: true }]);
        const before = { ...state };
        try { return await run(c); }
        catch (error) { Object.assign(state, before); throw error; }
      },
    },
    readStaffAuthority: traced("staff scope", () => scope),
    readRestoreScope: traced("restore scope", () => restoreScopeSha256),
    readLocalAcceptance: traced("read receipt", (_org, id) => state.receipt?.id === id ? state.receipt : null),
    readLockedReview: traced("locked review", () => ({ facts, assignmentIds, writeContext: {} })),
    consumeFreshWrite: consumeVolunteerSubstitutionFreshWrite,
    checkProspectiveCapacity: traced("prospective capacity", () => {}),
    stagePair: traced("stage pair", (_selector, _context, plan) => {
      state.staged++;
      return Object.fromEntries(["outgoing", "replacement"].map((party) => [party, {
        orgId, shiftId: plan.shift.id, participationId: plan[party].id, revision: plan[party].nextRevision,
        state: plan[party].state, assignmentId: assignmentIds[party],
        assignmentRevision: facts[party].candidateRevision + 1,
        assignmentState: party === "outgoing" ? "cancelled" : "assigned", atExact: facts.nowExact,
      }]));
    }),
    appendAcceptance: traced("append receipt", (_org, receipt) => { state.receipt = receipt; }),
    checkFinalCapacity: traced("final capacity", () => { if (state.failFinal) throw Error("fixture final capacity"); }),
    noteExactRetry(client) { assert.equal(client, c); events.push("exact retry"); },
  });
  return { state, events, save: (wire = request) => command({ orgId, intentId, session, request: wire }) };
}

test("the last fresh write spends one same-client unit and its accepted Retry reads through a full fresh window", async () => {
  const f = fixture();
  const first = await f.save();
  assert.equal(first.replayed, false);
  assert.deepEqual(f.events, [
    "staff scope", "read receipt", "locked review", "restore scope", "fresh rate",
    "prospective capacity", "stage pair", "append receipt", "read receipt", "final capacity",
  ]);
  assert.equal(f.state.hits, 30);
  f.events.length = 0;
  const replay = await f.save();
  assert.deepEqual(replay, { decision: first.decision, replayed: true });
  assert.deepEqual(f.events, ["staff scope", "read receipt", "restore scope", "exact retry"]);
  assert.equal(f.state.hits, 30);
  await assert.rejects(f.save({ ...request, reviewSha256: "3".repeat(64) }), { code: "substitution_receipt_collision" });
  await assert.rejects(f.save({ ...request, idempotencyKey: "fictional-request-2" }), { status: 429, code: "rate" });
  assert.equal(f.state.hits, 30);
  assert.equal(f.state.staged, 1);
});

test("a refused final admission rolls the fresh rate unit back with the pair and receipt", async () => {
  const f = fixture();
  f.state.failFinal = true;
  await assert.rejects(f.save(), /fixture final capacity/);
  assert.deepEqual(f.state, { hits: 29, receipt: null, staged: 0, failFinal: true });
});
