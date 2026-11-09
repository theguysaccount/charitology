import test from "node:test";
import assert from "node:assert/strict";
import { feedbackIntakeDraftRoutes } from "../lib/feedback-intake-draft.mjs";
import { proposedFeedbackForm } from "../lib/feedback-intake-form.mjs";
import { feedbackPublicationSchema } from "../lib/feedback-intake-model.mjs";
import { csrf } from "../lib/security.mjs";
import { reservationSchemaSql, legacyReservationLayout } from "./fixtures/resource-reservation-schema.mjs";

const org = "fictional_org", actor = "fictional_staff", intakeId = "fictional_submission";
const session = { user: { id: actor }, session: { id: "fictional_session" } };
const settings = { origin: "https://fictional-os.invalid", secret: "owned-fictional-feedback-draft-secret" };
const path = "/api/orgs/" + org + "/intake/submissions/" + intakeId + "/feedback-draft";
const stamp = "2030-08-31T09:22:00.123456Z", retention = "2030-09-01";
const key = "946f0305-7c22-4b88-b693-e1e2bb3cd117";
const rows = (...values) => ({ rows: values, rowCount: values.length });
const lockRead = { lock: true, readOnly: true };
const bodyFor = preview => ({
  version: 1, revision: preview.submission.revision, scopeSha256: preview.scopeSha256,
  reviewSha256: preview.reviewSha256, idempotencyKey: key, acknowledge: true,
});

function fixture() {
  const state = {
    role: "admin", programs: [], memberRevision: 3, restoreEpoch: null, live: true, clock: stamp,
    source: { ...proposedFeedbackForm(retention).data },
    answers: { topic: "Using a form", experience: "Hard to follow" },
    entry: { id: intakeId, publication_id: "fictional_publication", revision: 2, status: "reviewed",
      erased: false, has_receipt: true, converted_ids: [] },
    draft: null, receipt: null, trace: [], failAudit: false, failCapacity: false, loseResponse: false,
  };
  const db = {
    async limit() {},
    async tx(userId, tenant, operation, options) {
      assert.equal(userId, actor);
      assert.equal(tenant, org);
      state.trace.push({ type: "tx", options });
      const snapshot = structuredClone({ entry: state.entry, draft: state.draft, receipt: state.receipt });
      const c = { async query(sql, args = []) {
        if (/^(INSERT|UPDATE)/.test(sql.trim())) assert.ok(options.lock && !options.readOnly);
        if (sql.includes('FROM "session" s'))
          return state.live ? rows({ session_id: session.session.id, user_id: actor }) : rows();
        if (sql.includes("FROM os_members")) return rows({
          user_id: actor, role: state.role, program_ids: state.programs, revision: state.memberRevision, created_exact: stamp,
        });
        if (sql.includes("FROM os_orgs o")) return rows({ created_exact: stamp, restored_id: state.restoreEpoch });
        if (sql.includes("FROM os_events WHERE") && sql.includes("intake.feedback-converted")) {
          assert.ok(options.lock);
          state.trace.push({ type: "lookup", options });
          return state.receipt ? rows(state.receipt) : rows();
        }
        if (sql.includes("AS has_receipt")) return rows(state.entry);
        if (sql.includes("AS live_collection")) {
          state.trace.push({ type: "proof" });
          return rows({
            record_id: "fictional_form", source_revision: 4, kind: "feedback", schema: feedbackPublicationSchema(retention),
            target_id: null, target_module: null, target_revision: null, withdrawn_at: false, publication_created: stamp,
            answers: state.answers, reviewed_by: actor, cancelled: false, received_exact: stamp, consent_exact: stamp,
            reviewed_exact: stamp, live_collection: true, module_id: "forms", status: "published", revision: 4,
            last_editor_id: "other_editor", form_created: stamp, form_updated: stamp, form_data: state.source,
            approval: { status: "approved", revision: 4, actorId: "independent_reviewer", at: "2030-08-31T09:20:00.000Z" },
          });
        }
        if (sql.includes("AS now_exact")) { state.trace.push({ type: "clock" }); return rows({ now_exact: state.clock }); }
        if (sql.startsWith("SELECT pg_advisory_xact_lock")) return rows({});
        if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
        if (sql.startsWith("SELECT id FROM os_records")) return rows();
        if (sql.includes("AS size,count(*) FILTER")) return rows({ size: "0", count: "0" });
        if (sql.startsWith("SELECT sum(size)")) return rows({ size: "0" });
        if (sql.startsWith("INSERT INTO os_records")) {
          assert.equal(args[2], "feedback");
          assert.equal(args[5], actor);
          assert.deepEqual(args.slice(7, 9), [null, null]);
          assert.equal(args[10], null);
          state.draft = { id: args[1], module_id: args[2], status: args[4], revision: args[6], trashed: false,
            data: JSON.parse(args[3]) };
          return rows();
        }
        if (sql.includes("UPDATE os_intake SET status='converted'")) {
          state.entry = { ...state.entry, status: "converted", revision: args[2] + 1, converted_ids: JSON.parse(args[3]) };
          return rows({ id: intakeId, revision: state.entry.revision });
        }
        if (sql.startsWith("INSERT INTO os_events")) {
          if (state.failAudit) throw Error("private synthetic journal failure");
          assert.equal(args[2], "intake.feedback-converted");
          assert.equal(args[3], state.draft.id);
          assert.equal(args[4], "feedback");
          assert.equal(state.receipt, null);
          state.receipt = { actor_id: args[1], record_id: args[3], module_id: args[4], detail: JSON.parse(args[5]) };
          return rows();
        }
        if (sql.startsWith("SELECT id,module_id,status,revision")) return state.draft ? rows(state.draft) : rows();
        throw Error("Unhandled scoped fixture query");
      } };
      let result;
      try { result = await operation(c); }
      catch (error) { Object.assign(state, snapshot); throw error; }
      if (options.lock && !options.readOnly && state.loseResponse) {
        state.loseResponse = false;
        throw Error("synthetic loss after committing");
      }
      return result;
    },
  };
  const admitWorkspace = async (_c, tenant) => {
    assert.equal(tenant, org);
    assert.ok(state.draft && state.receipt && state.entry.status === "converted");
    state.trace.push({ type: "admission" });
    return !state.failCapacity;
  };
  async function call(body, override = {}) {
    const { method = body === undefined ? "GET" : "POST", pathname = path,
      type = "application/json", csrfToken = csrf(session.session.id, settings.secret) } = override;
    const request = new Request(settings.origin + pathname, {
      method, headers: { "content-type": type, origin: settings.origin, "x-csrf-token": csrfToken },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    const response = await feedbackIntakeDraftRoutes({ request, db, session, settings, admitWorkspace });
    if (!response) return null;
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("cache-control"), "no-store");
    return { status: response.status, body: await response.json() };
  }
  return { state, call };
}

test("a read-only feedback preview derives only the exact working record and requires fresh staff scope", async () => {
  const { call, state } = fixture();
  const ready = await call();
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body.submission, { id: intakeId, revision: 2, status: "reviewed" });
  assert.equal(ready.body.state, "ready");
  assert.deepEqual(ready.body.proposed, { moduleId: "feedback", status: "received", data: {
    title: "Using a form · Hard to follow", kind: "feedback-summary", programId: null, channel: "anonymous",
    publicationConsent: "withheld", responses: 1, receivedDate: "2030-08-31", respondBy: null,
    resolution: "needs-review", publicSummary: null, change: null,
  } });
  assert.match(ready.body.reviewSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(state.trace[0].options, lockRead);
  assert.equal(state.draft, null);
  for (const options of [{ role: "program_lead" }, { role: "admin", programs: ["limited"] }]) {
    Object.assign(state, options);
    assert.equal((await call()).status, 403);
  }
  state.programs = [];
  state.live = false;
  assert.equal((await call()).status, 401);
});

test("one mandatory journal retains original acceptance and separately reports a changed current draft", async () => {
  const { call, state } = fixture(), wire = bodyFor((await call()).body);
  state.loseResponse = true;
  const first = await call(wire);
  assert.equal(first.status, 200);
  assert.equal(first.body.replayed, true);
  assert.equal(first.body.decision.reviewedRevision, 2);
  assert.equal(first.body.decision.submissionRevision, 3);
  assert.deepEqual(state.entry.converted_ids, [{ id: state.draft.id, moduleId: "feedback" }]);
  assert.equal(state.draft.data.publicationConsent, "withheld");
  assert.equal(state.receipt.detail.acceptedAtExact, stamp);
  assert.equal(Object.hasOwn(state.receipt.detail, "answers"), false);
  state.draft = { ...state.draft, status: "triaged", revision: 4, trashed: true };
  state.entry = { ...state.entry, erased: true, revision: 4 };
  state.clock = "2031-08-31T09:22:00.123456Z";
  state.failCapacity = true;
  state.trace.length = 0;
  const replay = await call(wire);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.decision, first.body.decision);
  assert.equal(replay.body.current.draft.disposition, "trashed");
  assert.equal(replay.body.current.draft.revision, 4);
  assert.equal(replay.body.current.submission.erased, true);
  assert.equal(state.trace.some(({ type }) => ["proof", "clock", "admission"].includes(type)), false);
  assert.equal((await call({ ...wire, idempotencyKey: key + "_changed" })).status, 409);
  state.memberRevision++;
  assert.equal((await call(wire)).status, 403);
  assert.equal((await call()).body.state, "accepted");
});

test("failed journal or whole-workspace admission rolls back the draft and converted intake link", async () => {
  const { call, state } = fixture(), wire = bodyFor((await call()).body);
  state.failAudit = true;
  const auditFailed = await call(wire);
  assert.equal(auditFailed.status, 503);
  assert.equal(Object.hasOwn(auditFailed.body, "definitive"), false);
  assert.doesNotMatch(auditFailed.body.message, /private synthetic/);
  assert.equal(state.draft, null);
  assert.equal(state.receipt, null);
  assert.equal(state.entry.status, "reviewed");
  state.failAudit = false;
  state.failCapacity = true;
  const denied = await call(wire);
  assert.equal(denied.status, 422);
  assert.equal(denied.body.definitive, true);
  assert.equal(state.draft, null);
  assert.equal(state.receipt, null);
  assert.equal(state.entry.revision, 2);
  state.failCapacity = false;
  assert.equal((await call(wire)).body.replayed, false);
});

test("closed request shapes, source changes, erasure and historical links do not grant a new draft", async () => {
  const { call, state } = fixture(), wire = bodyFor((await call()).body);
  assert.equal(await call(undefined, { pathname: "/unrelated" }), null);
  const capture = "?path=" + encodeURIComponent(path.slice("/api/".length));
  assert.equal((await call(undefined, { pathname: path + capture })).status, 200);
  for (const query of ["?extra=1", "?path=another", capture + "&path=duplicate", capture + "&extra=1"])
    assert.equal((await call(undefined, { pathname: path + query })).status, 400);
  assert.equal((await call(undefined, { method: "HEAD" })).status, 405);
  assert.equal((await call(wire, { type: "text/plain" })).status, 415);
  assert.equal((await call(wire, { csrfToken: "wrong" })).status, 403);
  for (const input of [
    { ...wire, acknowledge: false }, { ...wire, idempotencyKey: key + "\n" }, { ...wire, contactId: "forbidden" },
    '{"version":1,"version":1}', " ".repeat(4097),
  ]) assert.ok([413, 422].includes((await call(input)).status));
  state.answers.experience = "Clear";
  assert.equal((await call(wire)).body.definitive, true);
  state.clock = "2030-09-02T09:22:00.123456Z";
  assert.equal((await call()).status, 409);
  state.entry = { ...state.entry, has_receipt: false, erased: true, status: "converted", revision: 1,
    converted_ids: [{ id: "historical_draft", moduleId: "feedback" }] };
  const history = (await call()).body;
  assert.equal(history.state, "historical");
  assert.equal(history.current.draft.disposition, "missing");
  assert.equal(Object.hasOwn(history, "decision"), false);
  assert.equal((await call(wire)).status, 409);
  assert.equal(state.draft, null);
  assert.equal(state.receipt, null);
});
