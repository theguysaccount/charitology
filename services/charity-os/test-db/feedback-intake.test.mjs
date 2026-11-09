import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database } from "../lib/database.mjs";
import { createHandler } from "../lib/handler.mjs";
import { applicationGrantsSql } from "../lib/migration-grants.mjs";
import { csrf } from "../lib/security.mjs";
import { runFeedbackIntakeCapacityCases } from "./fixtures/feedback-intake-capacity-cases.mjs";

function ciUrl(raw, role) {
  try {
    const u = new URL(raw);
    return u.protocol === "postgresql:" && u.hostname === "127.0.0.1" &&
      u.port === "5432" && u.pathname === "/charitology_os_ci" &&
      u.username === role && u.password && !u.search && !u.hash ? u.href : null;
  } catch { return null; }
}

const ownerRole = "os_test_owner";
const appRole = "os_test_app";
const ownerUrl = ciUrl(process.env.DATABASE_URL, ownerRole);
const appUrl = ciUrl(process.env.OS_DATABASE_URL, appRole);
const qualified = process.env.GITHUB_ACTIONS === "true" && process.env.NODE_ENV === "test" && ownerUrl && appUrl;
const org = "fictional_feedback_org";
const settings = { origin: "https://os.example.invalid", secret: "fictional-feedback-postgres-test-secret" };

test("real PostgreSQL keeps reviewed anonymous Feedback conversion exact and private", {
  skip: qualified ? false : "Requires the disposable GitHub PostgreSQL service and its separate app role.",
  timeout: 120_000,
}, async t => {
  const schema = "os_feedback_ci_" + randomBytes(8).toString("hex");
  const root = database(ownerUrl);
  let created = false, migration, db;
  const sessions = Object.fromEntries(["editor", "reviewer", "scoped"].map(key => [key, {
    user: { id: "fictional_" + key, name: "Fictional " + key, email: key + "@example.invalid", emailVerified: true },
    session: { id: "fictional_session_" + key },
  }]));
  let providerCalls = 0;
  const rejectProvider = async () => { providerCalls++; throw Error("No provider is available in the Feedback fixture."); };

  try {
    const identity = (await root.pool.query("SELECT current_database() AS name,inet_server_port() AS port,current_user AS role")).rows[0];
    assert.deepEqual(identity, { name: "charitology_os_ci", port: 5432, role: ownerRole });
    await root.pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    migration = database(ownerUrl, { schema });
    assert.equal((await migration.pool.query("SELECT current_schema() AS name")).rows[0].name, schema);
    await migration.migrate();
    await migration.pool.query('CREATE TABLE "user"(id text PRIMARY KEY,name text NOT NULL,email text NOT NULL,"emailVerified" boolean NOT NULL); ' +
      'CREATE TABLE "session"(id text PRIMARY KEY,"userId" text NOT NULL,"expiresAt" timestamptz NOT NULL)');
    await migration.pool.query(applicationGrantsSql(appRole, schema));
    db = database(appUrl, { schema });
    assert.deepEqual((await db.pool.query(`SELECT current_schema() AS schema,current_user AS role,rolsuper,rolbypassrls
      FROM pg_roles WHERE rolname=current_user`)).rows[0], { schema, role: appRole, rolsuper: false, rolbypassrls: false });
    await migration.pool.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional Feedback workspace',$1,'USD','UTC')", [org]);
    for (const [key, { user, session }] of Object.entries(sessions)) {
      await migration.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [user.id, user.name, user.email]);
      await migration.pool.query('INSERT INTO "session"(id,"userId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')', [session.id, user.id]);
      await migration.pool.query("INSERT INTO os_members(org_id,user_id,role,program_ids) VALUES($1,$2,$3,$4::jsonb)",
        [org, user.id, key === "editor" ? "owner" : "admin", JSON.stringify(key === "scoped" ? ["fictional_program"] : [])]);
    }
    const handle = createHandler({
      settings, db,
      auth: {
        api: { getSession: async ({ headers }) => sessions[headers.get("x-feedback-fixture-actor")] ?? null },
        handler: rejectProvider,
      },
      send: rejectProvider,
      participationTransport: { send: rejectProvider, status: rejectProvider },
    });
    async function call(path, { actor = "editor", body, status = 200 } = {}) {
      const headers = { origin: settings.origin, "content-type": "application/json" };
      if (actor) {
        headers["x-feedback-fixture-actor"] = actor;
        headers["x-csrf-token"] = csrf(sessions[actor].session.id, settings.secret);
      } else headers["x-forwarded-for"] = "192.0.2.51";
      const response = await handle(new Request(settings.origin + path, {
        method: body === undefined ? "GET" : "POST", headers,
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      }));
      const value = await response.json();
      assert.equal(response.status, status, value.code ?? path);
      return value;
    }

    const base = "/api/orgs/" + org, forms = base + "/modules/forms/records";
    const { form } = await call(base + "/intake/feedback/template?retentionUntil=2099-01-01");
    assert.equal(form.data.anonymous, true);
    const { record: draft } = await call(forms, { body: { data: form.data } });
    const formPath = forms + "/" + draft.id;
    const transition = async (revision, to, actor) => (await call(formPath + "/transition", {
      actor, body: { revision, to, reason: "Fictional reviewed form." },
    })).record;
    const forReview = await transition(draft.revision, "review", "editor");
    const approval = { revision: forReview.revision, reason: "Independent fictional review." };
    assert.equal((await call(formPath + "/approve", { body: approval, status: 403 })).code, "independent_approval");
    const { record: signed } = await call(formPath + "/approve", { actor: "reviewer", body: approval });
    const approved = await transition(signed.revision, "approved", "reviewer");
    const published = await transition(approved.revision, "published", "reviewer");
    assert.equal(published.approval.actorId, sessions.reviewer.user.id);
    assert.equal(published.approval.revision, published.revision);
    const { publication } = await call(base + "/intake/feedback/publications", {
      body: { recordId: published.id, revision: published.revision }, status: 201,
    });
    assert.equal(publication.kind, "feedback");

    const answers = { topic: "Using a form", experience: "Hard to follow" };
    const publicForm = "/api/public/intake/" + org + "/" + publication.id;
    const publicInput = { answers, consent: true, website: "", idempotencyKey: "fictional_feedback_public_ci" };
    const duplicate = JSON.stringify(publicInput).replace(/}$/, ',"consent":true}');
    assert.equal((await call(publicForm + "/submissions", {
      actor: null, body: duplicate, status: 400,
    })).code, "intake_json");
    const received = await call(publicForm + "/submissions", {
      actor: null, body: publicInput, status: 201,
    });
    const queue = base + "/intake/submissions";
    const { submissions: [submitted] } = await call(queue);
    assert.deepEqual(submitted.answers, answers);
    assert.equal(submitted.kind, "feedback");
    assert.deepEqual((await call(queue, { actor: "scoped" })).submissions, []);
    const requestPath = queue + "/" + submitted.id;
    assert.equal((await call(requestPath, { actor: "scoped", status: 404 })).code, "intake_submission");
    const { submission: reviewed } = await call(requestPath + "/review", {
      body: { action: "review", revision: submitted.revision },
    });
    assert.equal(reviewed.status, "reviewed");
    const draftPath = requestPath + "/feedback-draft";
    const preview = await call(draftPath);
    assert.equal(preview.proposed.data.publicationConsent, "withheld");
    const wire = JSON.stringify({ version: 1, revision: preview.submission.revision, scopeSha256: preview.scopeSha256,
      reviewSha256: preview.reviewSha256, idempotencyKey: "fictional_feedback_staff_ci", acknowledge: true });
    const outcomes = await Promise.all([call(draftPath, { body: wire }), call(draftPath, { body: wire })]);
    assert.deepEqual(outcomes.map(outcome => outcome.replayed).sort(), [false, true]);
    assert.deepEqual(outcomes[0].decision, outcomes[1].decision);
    const { draft: saved } = outcomes[0].decision;
    const records = base + "/modules/feedback/records";
    assert.equal((await call(records + "/" + saved.id)).record.data.publicationConsent, "withheld");
    assert.deepEqual((await call(records, { actor: "scoped" })).records, []);
    assert.equal((await call(records + "/" + saved.id, { actor: "scoped", status: 404 })).code, "record");
    assert.equal((await call(base + "/export", { actor: "scoped", status: 403 })).code, "feedback_draft_role");

    const { rows: [counts] } = await migration.pool.query(`SELECT
      (SELECT count(*)::int FROM os_records WHERE org_id=$1 AND module_id='feedback') AS drafts,
      (SELECT count(*)::int FROM os_records WHERE org_id=$1 AND module_id='contacts') AS contacts,
      (SELECT count(*)::int FROM os_participation_outbox WHERE org_id=$1) AS outbox,
      (SELECT count(*)::int FROM os_events WHERE org_id=$1 AND action='intake.feedback-converted') AS decisions,
      (SELECT ip_hash FROM os_intake WHERE org_id=$1 AND id=$2) AS ip_hash`, [org, submitted.id]);
    assert.deepEqual(counts, { drafts: 1, contacts: 0, outbox: 0, decisions: 1, ip_hash: null });
    const local = (await migration.pool.query("SELECT detail FROM os_events WHERE org_id=$1 AND action='intake.feedback-converted'", [org])).rows[0].detail;
    assert.match(local.requestSha256, /^[a-f0-9]{64}$/);
    assert.match(local.authoritySha256, /^[a-f0-9]{64}$/);
    const backup = await call(base + "/export");
    const event = backup.events.find(item => item.action === "intake.feedback-converted");
    assert.equal(event.record_id, saved.id);
    assert.equal(event.detail.intakeId, submitted.id);
    assert.ok(!Object.hasOwn(event.detail, "requestSha256") && !Object.hasOwn(event.detail, "authoritySha256"));

    // A missing receipt index must close fresh collection while retaining
    // the exact status Retry and the existing private receipt.
    await migration.pool.query("DROP INDEX os_feedback_intake_conversion");
    assert.equal((await call(publicForm, { actor: null, status: 404 })).code, "intake_unavailable");
    assert.equal((await call(publicForm + "/submissions", { actor: null, status: 404,
      body: { ...publicInput, idempotencyKey: "fictional_feedback_fresh_ci" },
    })).code, "intake_unavailable");
    const retry = await call(publicForm + "/submissions", { actor: null, body: publicInput });
    assert.deepEqual(retry, { ok: true, status: "converted" });
    const receipt = await call(publicForm + "/receipt", { actor: null, body: { action: "status", receipt: received.receipt } });
    assert.deepEqual(receipt, { ok: true, status: "converted", kind: "feedback", participantClaimAvailable: false });
    await migration.pool.query(`CREATE UNIQUE INDEX os_feedback_intake_conversion
      ON os_events(org_id,(detail->>'intakeId')) WHERE action='intake.feedback-converted'`);
    assert.equal(providerCalls, 0);
    await t.test("Feedback exit reserve and inactive recovery stay bounded", async () => {
      const { count } = await runFeedbackIntakeCapacityCases({ owner: migration.pool, runtime: db });
      assert.equal(count, 5);
    });
  } finally {
    try { await Promise.all([db?.close(), migration?.close()]); }
    finally {
      try { if (created) await root.pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await root.close(); }
    }
  }
});
