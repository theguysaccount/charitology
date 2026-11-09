import test from "node:test";
import assert from "node:assert/strict";
import { legacyVolunteerSubstitutions } from "./fixtures/volunteer-substitution-legacy.mjs";
import {
  restoredIntake,
  restoreIntake,
  exportIntake,
} from "../lib/intake-backup.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { feedbackPublicationSchema, proposedFeedbackDraft } from "../lib/feedback-intake-model.mjs";
import { FEEDBACK_CONVERSION_ACTION, FEEDBACK_PUBLICATION_GUARD_SQL, guardFeedbackPublicationWrite } from "../lib/feedback-intake-safety.mjs";
import { saveRecord } from "../lib/database.mjs";
import { hash, HttpError } from "../lib/security.mjs";
import { SCHEMA_VERSION } from "../lib/modules.mjs";
import { reservationSchemaSql, legacyReservationLayout } from "./fixtures/resource-reservation-schema.mjs";

const stamp = "2026-01-01T00:00:00.000Z";
const source = () => ({
  version: 1,
  publications: [
    {
      id: "pub",
      recordId: "form",
      sourceRevision: 3,
      kind: "contact",
      targetId: null,
      targetModule: null,
      targetRevision: null,
      createdAt: stamp,
      schema: {
        kind: "contact",
        title: "Operational contact",
        purpose: "Reply about organizing an event",
        questions: [
          {
            key: "email",
            label: "Operational email",
            type: "text",
            required: true,
          },
        ],
        retentionUntil: "2026-01-02",
      },
    },
  ],
  submissions: [
    {
      id: "request",
      publicationId: "pub",
      answers: { email: "fiction@example.invalid" },
      consentAt: stamp,
      createdAt: stamp,
      status: "reviewed",
      convertedIds: [],
    },
  ],
});

test("intake recovery retains expired schemas and answers without restoring public authority", async () => {
  const input = { intake: source() },
    restored = restoredIntake(input);
  assert.equal(restored.submissions[0].status, "pending");
  assert.equal(restored.publications[0].schema.retentionUntil, "2026-01-02");
  const queries = [];
  await restoreIntake(
    {
      query: async (sql, values) => {
        queries.push({ sql, values });
        return { rows: [{ count: 0, bytes: 0 }] };
      },
    },
    "new-org",
    "restorer",
    restored,
  );
  assert.match(queries[0].sql, /withdrawn_at.*now\(\)/);
  assert.equal(queries[0].values[0], "new-org");
  assert.equal(queries[0].values[9], "restorer");
  assert.doesNotMatch(
    queries[1].sql,
    /receipt_hash|idempotency_hash|reviewed_by|ip_hash/,
  );
  input.intake.submissions[0].status = "cancelled";
  assert.equal(restoredIntake(input).submissions[0].status, "cancelled");
  assert.equal(
    restoredIntake(input).submissions[0].cancelledAt,
    null,
    "An unknown historical withdrawal time must not be invented from creation or erasure time.",
  );
  input.intake.submissions[0].cancelledAt = "2026-01-01T01:00:00.000Z";
  assert.equal(
    restoredIntake(input).submissions[0].cancelledAt,
    "2026-01-01T01:00:00.000Z",
  );
  input.intake.submissions[0].cancelledAt = "unknown";
  assert.throws(() => restoredIntake(input), /withdrawal timestamp/);
  delete input.intake.submissions[0].cancelledAt;
  input.intake.submissions[0].erasedAt = stamp;
  input.intake.submissions[0].answers = {};
  assert.deepEqual(restoredIntake(input).submissions[0].answers, {});
  input.intake.submissions[0].status = "pending";
  assert.equal(restoredIntake(input).submissions[0].status, "dismissed");
  input.intake.submissions[0].answers = { email: "retained@example.invalid" };
  assert.throws(() => restoredIntake(input), /no retained answers/);
});

test("intake backup validation rejects forged schemas, references, duplicate IDs and excess queues", () => {
  const input = { intake: source() };
  input.intake.submissions[0].answers.unknown = "extra";
  assert.throws(() => restoredIntake(input));
  delete input.intake.submissions[0].answers.unknown;
  input.intake.submissions[0].publicationId = "absent";
  assert.throws(() => restoredIntake(input));
  input.intake.submissions[0].publicationId = "pub";
  input.intake.publications.push(structuredClone(input.intake.publications[0]));
  assert.throws(() => restoredIntake(input));
  const over = source();
  over.submissions = Array.from({ length: 1001 }, (_, i) => ({
    ...over.submissions[0],
    id: `request_${i}`,
  }));
  assert.throws(() => restoredIntake({ intake: over }), /1,000/);
  const native = makeBackup(
    { name: "Synthetic", currency: "USD", time_zone: "UTC" },
    [],
    {
      intake: {
        ...source(),
        submissions: [{ ...source().submissions[0], publicationId: "missing" }],
      },
    },
  );
  assert.throws(() => validateBackup(native, "new-org", "restorer"));
  assert.deepEqual(restoredIntake({}), { publications: [], submissions: [] });
});

test("intake export selects no receipt, idempotency or IP credentials", async () => {
  const sqls = [],
    c = {
      query: async (sql) => {
        sqls.push(sql);
        return { rows: [] };
      },
    };
  assert.deepEqual(await exportIntake(c, "org"), {
    version: 1,
    publications: [],
    submissions: [],
  });
  for (const sql of sqls)
    assert.doesNotMatch(
      sql,
      /receipt_hash|idempotency_hash|payload_hash|ip_hash|SELECT \*/,
    );
});

const organization = { name: "Fictional workspace", currency: "USD", time_zone: "UTC" };
const feedbackAnswers = { topic: "Using a form", experience: "Hard to follow" };
const later = "2026-01-02T10:00:00.000Z";
const acceptedAtExact = "2026-01-01T00:15:00.000001Z";
const link = { id: "feedback_draft", moduleId: "feedback" };
const feedbackPacket = () => {
  const schema = feedbackPublicationSchema("2026-01-02");
  const form = { id: "feedback_form", moduleId: "forms", status: "published", data: {
    title: schema.title, kind: "form", version: 1, purpose: schema.purpose, definition: JSON.stringify(schema.questions),
    consentRequired: true, anonymous: true, retentionUntil: schema.retentionUntil, collectionUrl: null,
  } };
  return { records: [form, { id: link.id, ...proposedFeedbackDraft({ answers: feedbackAnswers, receivedAt: stamp }) }],
    trash: [], events: [], intake: { version: 1,
      publications: [{ id: "feedback_pub", recordId: form.id, sourceRevision: 3, kind: "feedback", targetId: null,
        targetModule: null, targetRevision: null, schema, createdAt: stamp, withdrawnAt: null }],
      submissions: [{ id: "feedback_submission", publicationId: "feedback_pub", answers: { ...feedbackAnswers },
        consentAt: stamp, createdAt: stamp, status: "converted", convertedIds: [{ ...link }], erasedAt: null, cancelledAt: null }],
    } };
};
const conversionEvent = () => ({ org_id: "fictional_org", id: "1", actor_id: "fictional_staff",
  action: FEEDBACK_CONVERSION_ACTION, record_id: link.id, module_id: "feedback", created_at: new Date(later), detail: {
    version: 1, intakeId: "feedback_submission", publicationId: "feedback_pub", sourceRevision: 3, reviewedRevision: 2,
    submissionRevision: 3, draftRevision: 1, acceptedAtExact, requestSha256: "a".repeat(64), authoritySha256: "b".repeat(64),
  } });
const badFeedback = error => error instanceof HttpError && error.status === 422 &&
  ["feedback_intake_backup", "feedback_intake_history", "intake_backup"].includes(error.code);

function fictionalRestoreDatabase() {
  const publications = [], submissions = [], calls = [];
  return { calls, publications, submissions, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("INSERT INTO os_publications")) {
      assert.match(sql, /withdrawn_at.*now\(\)/);
      const [, id, record_id, source_revision, kind, target_id, target_module, target_revision, schema, , created_at] = values;
      publications.push({ id, record_id, source_revision, kind, target_id, target_module, target_revision,
        schema: JSON.parse(schema), created_at, withdrawn_at: later });
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO os_intake")) {
      assert.doesNotMatch(sql, /receipt_hash|idempotency_hash|payload_hash|ip_hash|reviewed_by|reviewed_at/);
      const [, id, publication_id, answers, consent_at, status, converted_ids, created_at, erased_at, cancelled_at] = values;
      submissions.push({ id, publication_id, answers: JSON.parse(answers), consent_at, status,
        converted_ids: JSON.parse(converted_ids), created_at, erased_at, cancelled_at });
      return { rows: [] };
    }
    if (sql.includes("SELECT count(*)")) return { rows: [{ count: 0, bytes: 0 }] };
    if (sql.includes("FROM os_publications")) return { rows: publications };
    if (sql.includes("FROM os_intake")) return { rows: submissions };
    throw Error("Unexpected modeled intake SQL");
  } };
}

test("native v1 retains byte-identical ordinary packets and scrubs only local Feedback event authority", () => {
  const oldEvent = { id: "1", action: "organization.created", detail: {} };
  const legacy = makeBackup(organization, [], { events: [oldEvent], intake: source() });
  const expected = { format: "charitology-os", version: 1, schemaVersion: SCHEMA_VERSION,
    organization: { name: organization.name, currency: "USD", timeZone: "UTC" }, createdAt: legacy.createdAt,
    records: [], events: [oldEvent], intake: source() };
  assert.equal(JSON.stringify(legacy), JSON.stringify({ ...expected, checksum: hash(expected) }));
  const packet = feedbackPacket(), local = conversionEvent();
  const native = makeBackup(organization, packet.records, { events: [oldEvent, local], intake: packet.intake, trash: [] });
  assert.equal(native.events[0], oldEvent);
  assert.equal(native.events[1].record_id, link.id);
  assert.equal(native.events[1].detail.acceptedAtExact, acceptedAtExact);
  assert(!Object.hasOwn(native.events[1].detail, "requestSha256"));
  assert(!Object.hasOwn(native.events[1].detail, "authoritySha256"));
  assert.equal(local.detail.requestSha256, "a".repeat(64));
  const current = validateBackup(JSON.parse(JSON.stringify(native)), "destination", "restorer");
  assert.equal(current.find(row => row.id === link.id).data.publicationConsent, "withheld");
  const { checksum: _old, ...body } = native;
  body.events = [local];
  assert.throws(() => validateBackup({ ...body, checksum: hash(body) }, "destination", "restorer"), badFeedback);
  const portable = native.events[1];
  for (const events of [[portable, portable], [{ ...portable, record_id: "other_draft" }],
    [{ ...portable, detail: { ...portable.detail, sourceRevision: 4 } }]]) {
    const changed = { ...body, events };
    assert.throws(() => validateBackup({ ...changed, checksum: hash(changed) }, "destination", "restorer"), badFeedback);
  }
});

test("anonymous Feedback stays withdrawn and inert through two modeled native recovery hops", async () => {
  const packet = feedbackPacket();
  const draft = packet.records.pop();
  packet.trash.push(draft);
  packet.intake.submissions.push({ ...packet.intake.submissions[0], id: "reviewed_open", status: "reviewed", convertedIds: [] },
    { ...packet.intake.submissions[0], id: "cancelled_open", status: "cancelled", cancelledAt: later, convertedIds: [],
      erasedAt: later, answers: {} });
  packet.intake.submissions[0].status = "cancelled";
  packet.intake.submissions[0].cancelledAt = later;
  packet.intake.submissions[0].erasedAt = later;
  packet.intake.submissions[0].answers = {};
  let native = makeBackup(organization, packet.records, { ...packet, events: [conversionEvent()] });
  for (const destination of ["first_destination", "second_destination"]) {
    const incoming = JSON.parse(JSON.stringify(native));
    const records = validateBackup(incoming, destination, "restorer");
    assert(!records.some(row => row.id === link.id));
    const restored = restoredIntake(incoming);
    assert.deepEqual(restored.submissions.map(row => [row.status, row.convertedIds]),
      [["cancelled", [link]], ["dismissed", []], ["cancelled", []]]);
    assert.deepEqual(restored.submissions[0].answers, {});
    assert.deepEqual(restored.submissions[1].answers, feedbackAnswers);
    assert.equal(restored.publications[0].schema.retentionUntil, "2026-01-02");
    const c = fictionalRestoreDatabase();
    await restoreIntake(c, destination, "restorer", restored);
    const intake = await exportIntake(c, destination);
    assert.equal(intake.publications[0].withdrawnAt, later);
    assert(!JSON.stringify(intake).includes("receiptHash"));
    assert(!c.calls.some(({ sql }) => /INSERT INTO os_(?:records|events|participant_links)/.test(sql)));
    native = makeBackup(organization, records, { intake, events: [], trash: [] });
  }
  assert.deepEqual(native.intake.submissions[0].convertedIds, [link]);
});

test("only the fixed Feedback schema, answers and single original typed link enter native history", () => {
  for (const change of [
    packet => { packet.intake.publications[0].targetModule = "events"; },
    packet => { packet.intake.publications[0].schema = { ...packet.intake.publications[0].schema, retentionUntil: "2026-02-30" }; },
    packet => { packet.intake.publications[0].schema = { ...packet.intake.publications[0].schema, email: "forged" }; },
    packet => { packet.intake.submissions[0].answers.email = "forged@example.invalid"; },
    packet => { packet.intake.submissions[0].answers.topic = "Free text"; },
    packet => { packet.intake.submissions[0].erasedAt = later; },
    packet => { packet.intake.submissions[0].convertedIds.push({ ...link, id: "second_draft" }); },
    packet => { packet.intake.submissions[0].convertedIds[0].moduleId = "contacts"; },
    packet => { packet.intake.submissions[0].convertedIds[0].extra = true; },
    packet => { packet.intake.submissions[0].convertedIds = []; },
    packet => { packet.intake.submissions[0].status = "reviewed"; },
    packet => { packet.intake.submissions.push({ ...packet.intake.submissions[0], id: "other_submission" }); },
    packet => { packet.records[0].moduleId = "projects"; },
    packet => { packet.records[1].moduleId = "contacts"; },
    packet => { packet.records[1].data = { ...packet.records[1].data, kind: "theme" }; },
    packet => { packet.records[1].data = { ...packet.records[1].data, channel: "survey" }; },
    packet => { packet.records[1].data = { ...packet.records[1].data, publicationConsent: "summary-only" }; },
    packet => { packet.records[1].status = "published"; },
    packet => { packet.trash.push({ ...packet.records[1] }); },
    packet => {
      const row = packet.records.pop();
      packet.trash.push({ ...row, data: { ...row.data, publicationConsent: "publish-approved" } });
    },
  ]) {
    const packet = feedbackPacket(); change(packet);
    assert.throws(() => restoredIntake(packet), badFeedback);
  }
  const legacy = source(); legacy.submissions[0].convertedIds = [{ ...link }];
  assert.throws(() => restoredIntake({ intake: legacy }), badFeedback);
  const packet = feedbackPacket();
  packet.records = [];
  assert.deepEqual(restoredIntake(packet).submissions[0].convertedIds, [link]);
});

test("native export refuses unexpected stored Feedback answers before returning a packet", async () => {
  const packet = feedbackPacket(), c = fictionalRestoreDatabase();
  await restoreIntake(c, "destination", "restorer", restoredIntake(packet));
  c.submissions[0].answers = { ...c.submissions[0].answers, contact: "fiction@example.invalid" };
  await assert.rejects(exportIntake(c, "destination"), badFeedback);
});

test("central saves allow private work but block publication permission while the durable intake link exists", async () => {
  const { records } = feedbackPacket();
  const draft = { ...records[1], orgId: "fictional_org", revision: 2, ownerId: "staff", approval: null, snapshot: null };
  const fixture = linked => ({ calls: [], async query(sql, params) {
    const handoff = legacyVolunteerSubstitutions(sql);
    if (handoff) return handoff;
    this.calls.push({ sql, params });
    if (sql === FEEDBACK_PUBLICATION_GUARD_SQL) return { rows: [{ linked }], rowCount: 1 };
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    if (sql.includes("sum(octet_length(data::text))")) return { rows: [{ size: "0", count: "1" }] };
    if (sql.startsWith("INSERT INTO os_records")) return { rows: [], rowCount: 1 };
    throw Error("Unexpected modeled central save SQL");
  } });
  const protectedResult = error => error instanceof HttpError && error.status === 409 && error.code === "feedback_publication_protected";
  for (const next of [
    { ...draft, data: { ...draft.data, publicationConsent: "publish-approved" } },
    { ...draft, data: { ...draft.data, publicationConsent: "summary-only" } },
    { ...draft, data: { ...draft.data, channel: "meeting" } },
    { ...draft, status: "published" },
    { ...draft, snapshot: { ...draft, status: "published" } },
  ]) {
    const c = fixture(true);
    await assert.rejects(saveRecord(c, next, { operation: "restore" }), protectedResult);
    assert.equal(c.calls.length, 2);
    assert.match(c.calls[0].sql, /pg_advisory_xact_lock/);
    assert.deepEqual(c.calls[1], { sql: FEEDBACK_PUBLICATION_GUARD_SQL, params: [draft.orgId, draft.id] });
  }
  assert.doesNotMatch(FEEDBACK_PUBLICATION_GUARD_SQL, /i\.(status|erased_at|cancelled_at|receipt_hash)/);
  const privateEdit = fixture(true);
  await saveRecord(privateEdit, { ...draft, data: { ...draft.data, change: "Fictional process improvement" } });
  assert(privateEdit.calls.some(call => call.sql.startsWith("INSERT INTO os_records")));
  const manual = fixture(false);
  await saveRecord(manual, { ...draft, data: { ...draft.data, publicationConsent: "publish-approved" } });
  assert(manual.calls.some(call => call.sql.startsWith("INSERT INTO os_records")));
  await assert.rejects(guardFeedbackPublicationWrite({ query: async () => ({ rows: [{ linked: "true" }], rowCount: 1 }) },
    { ...draft, status: "published" }), { status: 409, code: "feedback_publication_state" });
});
