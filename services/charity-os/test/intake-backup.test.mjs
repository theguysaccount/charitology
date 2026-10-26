import test from "node:test";
import assert from "node:assert/strict";
import {
  restoredIntake,
  restoreIntake,
  exportIntake,
} from "../lib/intake-backup.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";

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
