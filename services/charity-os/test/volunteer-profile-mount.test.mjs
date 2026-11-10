import assert from "node:assert/strict";
import test from "node:test";
import { createHandler } from "../lib/handler.mjs";
import { volunteerProfileConfiguration } from "../lib/volunteer-profile-routes.mjs";

const origin = "https://profile-fixture.invalid";
const secret = "fictional-volunteer-profile-test-secret";
const path = "/api/participant/orgs/fixture-org/requests/fixture-request";
const linkId = "a".repeat(32);
const timestamp = "2026-11-09T12:00:00.000000Z";
const session = { session: { id: "fixture-session" },
  user: { id: "fixture-user", email: "volunteer@example.invalid", emailVerified: true } };
const on = { applicationSchema: "public", storageSchema: "fixture_private" };
function fixture(options = {}) {
  const { config = on, kind = "volunteer-interest", status = "pending", ready = true, queryError = false,
    intakeRevision = 1 } = options;
  const statements = [];
  const c = { async query(sql, args) {
    statements.push(sql);
    if (/^(?:SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)/.test(sql)) return { rows: [] };
    if (sql.startsWith("SELECT id,org_id,intake_id,publication_id"))
      return { rows: [{ id: linkId, revision: 1 }] };
    if (sql.startsWith("SELECT l.id AS link_id")) return { rows: [{
      id: "fixture-request", link_id: linkId, publication_id: "fixture-form", status, revision: 1,
      linked_at: timestamp, consent_at: timestamp, created_at: timestamp, erased_at: null,
      answers: { email: session.user.email },
    }] };
    if (sql.startsWith("SELECT * FROM os_publications")) return { rows: [{
      id: "fixture-form", kind, schema: { title: "Fictional request", purpose: "Fictional volunteering", questions: [] },
    }] };
    if (sql.startsWith("SELECT name FROM os_orgs")) return { rows: [{ name: "Fictional organization" }] };
    if (sql.startsWith('SELECT l.id AS "linkId"')) {
      assert.deepEqual(args, ["fixture-org", "fixture-request", session.user.id, linkId, session.session.id]);
      if (queryError) throw Object.assign(Error("Fixture optional permission error"), { code: "42501" });
      return { rowCount: 1, rows: [{ linkId, linkRevision: 1, linkCreatedAt: timestamp,
        intakeRevision, intakeCreatedAt: timestamp, publicationId: "fixture-form", publicationCreatedAt: timestamp,
        verifiedEmail: session.user.email, requestEmail: session.user.email, workspaceTimeZone: "UTC" }] };
    }
    if (sql.startsWith("WITH refs AS (SELECT to_regclass")) return { rowCount: 1, rows: [{ ready }] };
    throw Error("Unexpected fixture query");
  } };
  const db = { async limit() {}, tx: async (_user, _org, operation) => operation(c) };
  const handler = createHandler({ settings: { origin, secret }, volunteerProfileConfig: config, db,
    auth: { api: { getSession: async () => session } }, send: async () => assert.fail("Unexpected delivery") });
  return { handler, statements };
}
async function read(handler, target = path) {
  const response = await handler(new Request(origin + target));
  return { status: response.status, headers: [...response.headers], body: await response.text() };
}

test("volunteer profile mount requires exact opt-in and explicit separate storage schema", async () => {
  for (const value of [undefined, "", "0", "true"])
    assert.equal(volunteerProfileConfiguration({ OS_VOLUNTEER_PROFILE_ENABLED: value }), null);
  assert.deepEqual(volunteerProfileConfiguration({
    OS_VOLUNTEER_PROFILE_ENABLED: "1", OS_VOLUNTEER_PROFILE_STORAGE_SCHEMA: on.storageSchema,
  }), on);
  const off = fixture({ config: null }), baseline = await read(off.handler);
  assert.equal(baseline.status, 200);
  for (const config of [null, { applicationSchema: "public" }, { ...on, storageSchema: "public" },
    { ...on, storageSchema: "not-a-schema" }]) {
    const hidden = fixture({ config });
    assert.deepEqual(await read(hidden.handler), baseline);
    assert.deepEqual(hidden.statements, off.statements);
    assert.equal((await read(hidden.handler, path + "/volunteer-profile")).status, 404);
  }
});

test("only an exact eligible own detail appends the capability and an optional SQL failure rolls back its savepoint", async () => {
  const off = await read(fixture({ config: null }).handler), available = fixture();
  assert.deepEqual(await read(available.handler), { ...off, body: off.body.slice(0, -1) + ',"volunteerProfile":true}' });
  for (const options of [{ ready: false }, { intakeRevision: 2 }, { queryError: true }]) {
    const hidden = fixture(options);
    assert.deepEqual(await read(hidden.handler), off);
    assert.equal(hidden.statements.some(sql=>sql.startsWith("ROLLBACK TO SAVEPOINT")), options.intakeRevision !== 2);
    assert.match(hidden.statements.at(-1), /^RELEASE SAVEPOINT /);
  }
  for (const options of [{ kind: "contact" }, { status: "cancelled" }]) {
    const hidden = fixture(options);
    assert.deepEqual(await read(hidden.handler), await read(fixture({ ...options, config: null }).handler));
    assert(!hidden.statements.some(sql=>sql.startsWith("SAVEPOINT")));
  }
});
