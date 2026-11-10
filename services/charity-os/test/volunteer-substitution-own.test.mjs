import assert from "node:assert/strict";
import { test } from "node:test";
import { participationTerms } from "../lib/participation.mjs";
import { csrf, hash } from "../lib/security.mjs";
import { makeVolunteerOrientationMarkerRow, VOLUNTEER_ORIENTATION_MARKER_SQL } from "../lib/volunteer-orientation-marker.mjs";
import {
  participantVolunteerSubstitutionRoutes, volunteerSubstitutionLinkIdentity,
  VOLUNTEER_SUBSTITUTION_OWN_SQL as SQL,
} from "../lib/volunteer-substitution-own.mjs";

const settings = { origin: "https://own-substitution.invalid", secret: "fictional-own-substitution-secret-v1" };
const orgId = "workspace-v1", intentId = "private-intent-v1";
const created = "2026-11-01T12:00:00.123456Z";
const now = "2026-11-09T13:00:00.123456Z", offerEnd = "2026-11-09T14:00:00.123456Z";
const shift = {
  id: "private-shift-v1", orgId, moduleId: "volunteers",
  data: { kind: "shift", title: "Workshop shift", capacity: 2, startAt: "2026-11-10T15:00:00Z",
    endAt: "2026-11-10T17:00:00Z", timeZone: "UTC", participationPurpose: "Support a workshop.",
    participantInstructions: "Internal shift details.", organizerUrl: "https://organizer.invalid" },
};
const terms = participationTerms(shift), termsHash = hash(terms);
const approval = rev => ({ status: "approved", revision: rev, actorId: "private-approver" });
const user = (label, linkByte, confirmed) => ({
  userId: `account-${label}`, intakeId: `intake-${label}`, pid: `participation-${label}`,
  email: `${label}@example.invalid`, link: linkByte.repeat(32), confirmed,
});
const leaving = user("leaving", "a", true), joining = user("joining", "b", false);
const sessionFor = (u, sessionId = `session-${u.userId}`) => ({
  session: { id: sessionId },
  user: { id: u.userId, email: u.email, emailVerified: true },
});
const path = (u, org = orgId, pid = u.pid) =>
  `/api/participant/orgs/${org}/requests/${u.intakeId}/participations/${pid}/substitution-choice`;
const micros = value => BigInt(Date.parse(value.slice(0, 23) + "Z")) * 1000n + BigInt(value.slice(23, 26));
function stamp(value) {
  return new Date(Number(value / 1000n)).toISOString().slice(0, -1) + (value % 1000n).toString().padStart(3, "0") + "Z";
}
const wire = (view, choice) => ({
  version: 1, choice, reviewSha256: view.choice.reviewSha256,
  expectedChoiceRevision: view.choice.choiceRevision, acknowledge: true,
});
const refuses = (promise, status, code) => assert.rejects(promise, error =>
  error.status === status && (code === undefined || error.code === code));

function fixture() {
  const people = new Map([leaving, joining].map(u => [u.userId, structuredClone({
    link_id: u.link, link_revision: 1, link_created_exact: created, intake_id: u.intakeId,
    intake_revision: 4, publication_id: "private-published-intake", intake_email: u.email, intake_created_exact: created,
    participation: { org_id: orgId, id: u.pid, intake_id: u.intakeId, target_id: shift.id, module_id: "volunteers",
      booking_record_id: `assignment-${u.userId}`, contact_id: `contact-${u.userId}`, revision: 7, source: "intake",
      recovered: false, requested_interval: null, state: u.confirmed ? "confirmed" : "waitlisted",
      frozen: u.confirmed ? { terms, termsHash, sourceRevision: 3, programId: null } : null,
      consent: { revision: 5, waitlistAllowed: true, sourceRevision: 3, termsHash } },
    participation_created_exact: created,
    target: { org_id: orgId, target_id: shift.id, module_id: "volunteers", mode: "managed", recovery_block: false,
      source_revision: 3, revision: 3, terms, terms_hash: termsHash },
    target_created_exact: created, shift_id: shift.id, shift_revision: 3, shift_status: "open", shift_data: shift.data,
    shift_approval: approval(3), shift_editor: "private-editor", shift_created_exact: created,
    assignment_id: `assignment-${u.userId}`, assignment_revision: 5, assignment_status: u.confirmed ? "assigned" : "approved",
    assignment_approval: approval(5), assignment_editor: "private-editor", assignment_program: null,
    assignment_created_exact: created, group_linked: false,
  })]));
  const calls = [], offers = new Map(), sessionRows = new Map(), noLinks = new Set();
  let saved = new Map();
  const control = { clock: now, changeOffer: null, afterPreflight: null, loseResponse: false,
    forgedChoice: null, badSave: false, noOffer: false };
  const key = ({orgId, intentId, party}) => `${orgId}/${intentId}/${party}`;
  const db = {
    async tx(actor, org, fn, options) {
      calls.push(["tx", actor, org, options]);
      assert.deepEqual(options, org === null ? {readOnly:true} : {lock:true,readOnly:options.readOnly});
      const before = structuredClone(saved);
      const c = {
        actor, org, options,
        async query(sql, values) {
          calls.push(["sql", sql, values]);
          if (sql === VOLUNTEER_ORIENTATION_MARKER_SQL) return {rows: control.orientationMarkers ?? []};
          if (sql.startsWith(SQL.session)) {
            const [sessionId, userId] = values;
            assert.equal(actor, userId);
            assert.equal(sql.includes(" FOR SHARE"), !options.readOnly);
            return { rows: sessionRows.has(sessionId) ? [sessionRows.get(sessionId)] : [] };
          }
          if (sql === SQL.index) {
            assert.equal(org, null);
            const [userId, tenant, intake] = values;
            const row = people.get(userId);
            if (tenant !== orgId || row?.intake_id !== intake || noLinks.has(userId)) return {rows:[]};
            return {rows:[{id:row.link_id}]};
          }
          if (sql.startsWith(SQL.link)) {
            assert.equal(org, orgId);
            assert.equal(sql.includes(" FOR UPDATE OF l,i,p"), !options.readOnly);
            const [userId, tenant, intake, pid] = values;
            assert.equal(userId, actor);
            const row = people.get(userId);
            if (tenant !== org || row?.intake_id !== intake || row?.participation.id !== pid || noLinks.has(userId))
              return {rows:[]};
            return {rows:[row]};
          }
          if (sql.startsWith("WITH moment AS MATERIALIZED")) {
            assert.equal(org, orgId);
            assert.deepEqual(values, [null, null]);
            const at = micros(control.clock);
            return { rows: [{ at_exact: control.clock, expires_at_exact: stamp(at + 600000000n),
              epoch_microseconds: at.toString(), within_window: true }] };
          }
          assert.fail("Unexpected SQL " + sql);
        },
      };
      let result;
      try { result = await fn(c); } catch (error) { if (!options.readOnly) saved = before; throw error; }
      if (org === null) control.afterPreflight?.(actor);
      if (!options.readOnly && control.loseResponse) {
        control.loseResponse = false;
        throw new Error("Fictional response lost after commit");
      }
      return result;
    },
  };
  const dependencies = {
    async readOwnOffer(c, selector) {
      calls.push(["offer", selector]);
      assert.equal(c.actor, selector.userId);
      if (control.noOffer) return null;
      if (!offers.has(c.actor)) offers.set(c.actor, { ...selector, intentId, issuedAtExact: created, expiresAtExact: offerEnd });
      const offer = offers.get(c.actor);
      return control.changeOffer ? control.changeOffer({ ...offer }) : { ...offer };
    },
    async readChoice(c, query) {
      calls.push(["read", query]);
      assert.equal(c.org, query.orgId);
      assert.deepEqual(Object.keys(query).sort(), ["intentId", "orgId", "party"]);
      return control.forgedChoice ?? saved.get(key(query)) ?? null;
    },
    async recordChoice(c, value) {
      calls.push(["record", value]);
      assert.equal(c.options.readOnly, false);
      assert.equal(c.actor, value.userId);
      assert.equal(saved.has(key(value)), false);
      const row = { ...value, choiceRevision:1, withdrawnAtExact:null };
      saved.set(key(value), row);
      return control.badSave ? {...row, userId:"different-owner"} : row;
    },
    async withdrawChoice(c, value) {
      calls.push(["withdraw", value]);
      assert.equal(c.options.readOnly, false);
      assert.equal(c.actor, value.userId);
      assert.equal(value.expectedRevision, 1);
      const old = saved.get(key(value));
      assert.equal(old.choiceRevision, 1);
      assert.equal(old.linkId, value.linkId);
      const row = { ...old, choiceRevision: 2, withdrawnAtExact: value.atExact };
      saved.set(key(value), row);
      return row;
    },
  };
  function authorize(u, sid = sessionFor(u).session.id) {
    sessionRows.set(sid, {session_id:sid,user_id:u.userId,email:u.email,verified:true});
    return sessionFor(u, sid);
  }
  for (const u of [leaving, joining]) authorize(u);
  const send = (u, { method = "GET", body, raw, target = path(u), session = sessionFor(u),
    headers = {}, extra = {} } = {}) => {
    const request = new Request(settings.origin + target, { method, headers: {
      ...(method === "POST" ? {origin:settings.origin,"content-type":"application/json",
        "x-csrf-token":csrf(session?.session?.id,settings.secret)} : {}),
      ...headers,
    }, ...(raw !== undefined || body !== undefined ? {body:raw ?? JSON.stringify(body)} : {}) });
    return participantVolunteerSubstitutionRoutes({ request, db, settings, session, ...dependencies, ...extra });
  };
  const read = async (u, opts) => (await send(u, opts)).json();
  const post = async (u, body, opts) => read(u, {method:"POST", body, ...opts});
  const writes = name => calls.filter(([kind]) => kind === name).length;
  return { calls, people, offers, noLinks, sessionRows, authorize, send, read, post, writes, control };
}

test("two own accounts see only their own offer and shift, and choosing changes neither allocation", async () => {
  const f = fixture();
  const roster = structuredClone([...f.people]);
  const leftResponse = await f.send(leaving);
  assert.equal(leftResponse.headers.get("cache-control"), "no-store");
  assert.equal(leftResponse.headers.get("referrer-policy"), "no-referrer");
  const a = await leftResponse.json(), b = await f.read(joining);
  for (const view of [a, b]) {
    assert.deepEqual(Object.keys(view).sort(), ["choice", "ok", "replayed"]);
    assert.deepEqual(view.choice.shift, { title: terms.title, startAt: terms.startAt, endAt: terms.endAt, timeZone: terms.timeZone });
    assert.deepEqual(Object.keys(view.choice).sort(), ["acceptedAtExact", "canAccept", "canWithdraw", "choiceRevision",
      "expiresAtExact", "offerExpiresAtExact", "party", "reviewSha256", "shift", "state", "version", "withdrawnAtExact"].sort());
    assert.equal(view.choice.state, "unanswered");
    for (const literal of [orgId, shift.id, intentId, leaving.userId, joining.userId, leaving.pid, joining.pid,
      leaving.email, joining.email, "private-approver", "Internal shift details", "organizer.invalid"])
      assert.equal(JSON.stringify(view).includes(literal), false);
  }
  assert.equal(a.choice.party, "leaving");
  assert.equal(b.choice.party, "joining");
  assert.notEqual(a.choice.reviewSha256, b.choice.reviewSha256);
  assert.equal((await f.post(leaving, wire(a, "accept"))).choice.state, "accepted");
  assert.equal((await f.read(joining)).choice.state, "unanswered");
  assert.equal((await f.post(joining, wire(b, "accept"))).choice.state, "accepted");
  assert.deepEqual([...f.people], roster);
  assert.equal(f.writes("record"), 2);
});

test("a protected handoff blocks fresh own consent while exact retained choice and withdrawal still work", async () => {
  const f = fixture(), first = await f.read(leaving), second = await f.read(joining);
  const accept = wire(first, "accept"), saved = await f.post(leaving, accept);
  f.control.orientationMarkers = [makeVolunteerOrientationMarkerRow(orgId, "fictional-admin", {
    version: 1, moduleId: "volunteers", targetId: shift.id, programId: "fictional-program",
    requirementId: "fictional-policy", policyRevision: 1, sourceRevision: 3, termsHash,
    disposition: "review-needed",
  }, "live")];
  assert.equal((await f.read(joining)).choice.canAccept, false);
  await refuses(f.post(joining, wire(second, "accept")), 409, "volunteer_orientation_operation");
  assert.equal((await f.post(leaving, accept)).replayed, true);
  assert.equal((await f.post(leaving, wire(saved, "withdraw"))).choice.state, "withdrawn");
  assert.equal(f.writes("record"), 1);
});

test("fresh authority and exact own context reconcile lost acceptance and terminal withdrawal", async () => {
  const f = fixture(), first = await f.read(leaving), accept = wire(first, "accept");
  f.control.loseResponse = true;
  await assert.rejects(f.post(leaving, accept), /Fictional response lost after commit/);
  const accepted = await f.post(leaving, accept);
  assert.equal(accepted.replayed, true);
  assert.equal(accepted.choice.acceptedAtExact, now);
  assert.equal(accepted.choice.expiresAtExact, "2026-11-09T13:10:00.123456Z");
  const freshSession = f.authorize(leaving, "different-verified-session");
  await refuses(f.post(leaving, accept, {session:freshSession}), 409, "substitution_choice_changed");
  const withdraw = wire(accepted, "withdraw");
  f.control.loseResponse = true;
  await assert.rejects(f.post(leaving, withdraw), /Fictional response lost after commit/);
  const withdrawn = await f.post(leaving, withdraw);
  assert.equal(withdrawn.replayed, true);
  assert.equal(withdrawn.choice.state, "withdrawn");
  assert.equal(withdrawn.choice.choiceRevision, 2);
  assert.equal(withdrawn.choice.withdrawnAtExact, now);
  assert.equal(withdrawn.choice.canAccept, false);
  await refuses(f.post(leaving, accept), 409, "substitution_choice_changed");
  assert.equal(f.writes("record"), 1);
  assert.equal(f.writes("withdraw"), 1);
});

test("method, query, unverified session, origin and closed lexical body fail before any tenant read", async () => {
  const f = fixture(), sha = "a".repeat(64);
  const body = {version:1,choice:"accept",expectedChoiceRevision:0,reviewSha256:sha,acknowledge:true};
  await refuses(f.send(leaving, {session:null}), 401, "session");
  const unverified = sessionFor(leaving); unverified.user.emailVerified = false;
  await refuses(f.send(leaving, {session:unverified}), 403, "participant_verification");
  await refuses(f.send(leaving, {method:"HEAD"}), 405, "substitution_method");
  await refuses(f.send(leaving, {target:path(leaving)+"?intentId=other"}), 400, "participant_query");
  await refuses(f.send(leaving, {headers:{"content-length":"1"}}), 400, "substitution_body");
  await refuses(f.post(leaving, body, {headers:{origin:"https://other.invalid"}}), 403, "origin");
  await refuses(f.post(leaving, body, {headers:{"x-csrf-token":"old"}}), 403, "csrf");
  await refuses(f.post(leaving, body, {headers:{"content-type":"text/plain"}}), 415, "content_type");
  await refuses(f.post(leaving, {...body,intentId}), 422, "substitution_choice_fields");
  await refuses(f.post(leaving, {...body,participationId:joining.pid}), 422, "substitution_choice_fields");
  await refuses(f.post(leaving, {...body,acknowledge:false}), 422, "substitution_choice_fields");
  await refuses(f.post(leaving, {...body,expectedChoiceRevision:1}), 422, "substitution_choice_fields");
  await refuses(f.send(leaving, {method:"POST",raw:'{"version":1,"version":1}'}), 422, "substitution_choice_fields");
  await refuses(f.send(leaving, {method:"POST",raw:"x".repeat(2049)}), 413);
  assert.equal(await f.send(leaving, {target:path(leaving)+"/other"}), null);
  assert.equal(f.writes("tx"), 0);
});

test("cross-tenant and wrong-party links never reach an offer or choice read", async () => {
  const f = fixture();
  await refuses(f.send(leaving, {target:path(leaving,"different-workspace")}), 404, "substitution_unavailable");
  assert.equal(f.calls.filter(x => x[0] === "tx").length, 1);
  await refuses(f.send(leaving, {target:path(joining)}), 404, "substitution_unavailable");
  await refuses(f.send(leaving, {target:path(leaving,orgId,joining.pid)}), 404, "substitution_unavailable");
  assert.equal(f.writes("offer"), 0);
  assert.equal(f.writes("read"), 0);
});

test("SQL rechecks live session, verified address and the exact preflight link inside the tenant lock", async () => {
  for (const [change, status, code] of [
    [f => f.sessionRows.delete(sessionFor(leaving).session.id), 401, "session"],
    [f => { f.sessionRows.get(sessionFor(leaving).session.id).verified = false; }, 403, "participant_verification"],
    [f => { f.sessionRows.get(sessionFor(leaving).session.id).email = "changed@example.invalid"; }, 403, "participant_verification"],
    [f => f.noLinks.add(leaving.userId), 404, "substitution_unavailable"],
    [f => { f.people.get(leaving.userId).link_id = "e".repeat(32); }, 404, "substitution_unavailable"],
    [f => { f.people.get(leaving.userId).intake_email = "changed@example.invalid"; }, 404, "substitution_unavailable"],
  ]) {
    const f = fixture();
    f.control.afterPreflight = () => change(f);
    await refuses(f.send(leaving), status, code);
    assert.equal(f.writes("offer"), 0);
    assert.equal(f.writes("record"), 0);
  }
});

test("changed link, source or assignment cannot reuse a server-issued offer or review", async () => {
  for (const change of [
    r => r.link_revision++,
    r => { r.link_created_exact = "2026-11-01T12:00:00.123457Z"; },
    r => r.intake_revision++,
    r => r.participation.revision++,
    r => r.target.revision++,
    r => { r.assignment_revision++; r.assignment_approval.revision++; },
    r => { r.shift_approval.actorId = "another-approver"; },
    r => { r.shift_created_exact = "2026-11-01T12:00:00.123457Z"; },
  ]) {
    const f = fixture(), before = await f.read(leaving);
    change(f.people.get(leaving.userId));
    await refuses(f.post(leaving, wire(before, "accept")), 404, "substitution_unavailable");
    assert.equal(f.writes("record"), 0);
  }
  const f = fixture(), before = await f.read(leaving);
  f.control.changeOffer = offer => ({ ...offer, intentId:"different-server-intent" });
  await refuses(f.post(leaving, wire(before, "accept")), 409, "substitution_choice_changed");
  assert.equal(f.writes("record"), 0);
});

test("the trusted issuer must return an exact own offer before any stored consent is read", async () => {
  for (const change of [
    offer => ({...offer,party:"joining"}),
    offer => ({...offer,userId:joining.userId}),
    offer => ({...offer,participationId:joining.pid}),
    offer => ({...offer,linkScopeSha256:"c".repeat(64)}),
    offer => ({...offer,counterpart:joining.userId}),
    offer => ({...offer,issuedAtExact:"2026-11-09T13:00:00.123457Z"}),
    offer => ({...offer,expiresAtExact:now}),
  ]) {
    const f = fixture();
    f.control.changeOffer = change;
    await refuses(f.send(leaving), 404, "substitution_unavailable");
    assert.equal(f.writes("read"), 0);
  }
  const f = fixture();
  f.control.noOffer = true;
  await refuses(f.send(leaving), 404, "substitution_unavailable");
  await refuses(f.send(leaving, {extra:{readOwnOffer:null}}), 503, "substitution_unavailable");
  assert.equal(f.writes("read"), 0);
});

test("recovered, cancelled, partial, group-managed and stale approvals do not have an own choice", async () => {
  for (const change of [
    r => { r.participation.recovered = true; },
    r => { r.participation.source = "legacy"; },
    r => { r.participation.state = "cancelled"; },
    r => { r.participation.requested_interval = {startAt:terms.startAt,endAt:terms.endAt,timeZone:terms.timeZone}; },
    r => { r.participation.frozen.interval = {startAt:terms.startAt,endAt:terms.endAt,timeZone:terms.timeZone}; },
    r => { r.group_linked = true; },
    r => { r.target.mode = "paused"; },
    r => { r.target.recovery_block = true; },
    r => { r.shift_data.capacity = null; },
    r => { r.shift_status = "completed"; },
    r => { r.assignment_status = "cancelled"; },
    r => { r.shift_approval.revision--; },
    r => { r.assignment_approval.actorId = r.assignment_editor; },
    r => { r.participation.frozen.terms = null; },
  ]) {
    const f = fixture();
    change(f.people.get(leaving.userId));
    await refuses(f.send(leaving), 404, "substitution_unavailable");
    assert.equal(f.writes("offer"), 0);
  }
  const f = fixture();
  f.people.get(joining.userId).participation.consent.waitlistAllowed = false;
  await refuses(f.send(joining), 404, "substitution_unavailable");
  assert.equal(f.writes("offer"), 0);
});

test("foreign or malformed persistence rows and writes fail closed, with no lasting fake mutation", async () => {
  const f = fixture(), before = await f.read(leaving), input = wire(before, "accept");
  f.control.badSave = true;
  await refuses(f.post(leaving, input), 404, "substitution_unavailable");
  f.control.badSave = false;
  assert.equal((await f.read(leaving)).choice.state, "unanswered");
  await f.post(leaving, input);
  const row = f.calls.findLast(([kind]) => kind === "record")[1];
  for (const changed of [
    {...row,userId:joining.userId}, {...row,linkId:joining.link}, {...row,participationId:joining.pid},
    {...row,acceptedAtExact:"2026-11-09T13:00:00.123457Z"}, {...row,counterpart:joining.userId},
  ]) {
    f.control.forgedChoice = {...changed,choiceRevision:1,withdrawnAtExact:null};
    await refuses(f.send(leaving), 404, "substitution_unavailable");
  }
});

test("the SQL clock limits acceptance and consent without reviving an expired choice", async () => {
  const f = fixture(), before = await f.read(leaving);
  const earlierOffer = "2026-11-09T13:05:00.123456Z";
  f.control.changeOffer = offer => ({...offer,expiresAtExact:earlierOffer});
  await refuses(f.post(leaving, wire(before, "accept")), 409, "substitution_choice_changed");
  const current = await f.read(leaving);
  const accepted = await f.post(leaving, wire(current, "accept"));
  assert.equal(accepted.choice.expiresAtExact, earlierOffer);
  f.control.clock = earlierOffer;
  await refuses(f.send(leaving), 404, "substitution_unavailable");
  const g = fixture(), fresh = await g.read(leaving);
  const receipt = await g.post(leaving, wire(fresh, "accept"));
  g.control.clock = receipt.choice.expiresAtExact;
  const expired = await g.read(leaving);
  assert.equal(expired.choice.state, "expired");
  assert.equal(expired.choice.canWithdraw, false);
  await refuses(g.post(leaving, wire(receipt, "withdraw")), 409, "substitution_choice_changed");
  assert.equal(g.writes("withdraw"), 0);
});

test("private account identity stays stable across own links while each exact link scope changes", () => {
  const value = {orgId,userId:leaving.userId,email:leaving.email,intakeId:leaving.intakeId,intakeRevision:4,
    intakeCreatedAtExact:created,publicationId:"publication",participationId:leaving.pid,
    participationRevision:7,participationCreatedAtExact:created,linkId:leaving.link,linkRevision:1,linkCreatedAtExact:created};
  const a = volunteerSubstitutionLinkIdentity(settings.secret,value);
  const b = volunteerSubstitutionLinkIdentity(settings.secret,{...value,linkId:"c".repeat(32),intakeId:"second-intake"});
  const c = volunteerSubstitutionLinkIdentity(settings.secret,{...value,userId:joining.userId,email:joining.email});
  const d = volunteerSubstitutionLinkIdentity(settings.secret,{...value,orgId:"other-workspace"});
  assert.equal(a.personIdentitySha256,b.personIdentitySha256);
  assert.notEqual(a.linkScopeSha256,b.linkScopeSha256);
  assert.notEqual(a.personIdentitySha256,c.personIdentitySha256);
  assert.notEqual(a.personIdentitySha256,d.personIdentitySha256);
  assert.throws(() => volunteerSubstitutionLinkIdentity(settings.secret,{...value,actorId:"other"}), {status:404});
});
