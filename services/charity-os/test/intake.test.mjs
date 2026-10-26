import test from "node:test";
import assert from "node:assert/strict";
import {
  intakeSchema,
  intakeAnswers,
  publicationAccepting,
  publicIntakeRoutes,
  intakeRoutes,
} from "../lib/intake.mjs";

const source = () => ({
  id: "source",
  moduleId: "forms",
  revision: 4,
  status: "published",
  lastEditedBy: "author",
  approval: { status: "approved", revision: 4, actorId: "reviewer" },
  data: {
    title: "Volunteer interest",
    kind: "form",
    definition: JSON.stringify([
      { key: "name", label: "Operational name", type: "text", required: true },
    ]),
    purpose: "Arrange a response about this request.",
    retentionUntil: "2099-01-01",
  },
});
const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-intake-secret-at-least-32-characters",
};
const error = (code) => (e) => e.code === code;

test("published schema exposes only deliberate collection metadata, not record authority or private fields", () => {
  const record = source();
  record.data.internalMemo = "private";
  const schema = intakeSchema(record, "contact");
  assert.deepEqual(Object.keys(schema).sort(), [
    "kind",
    "purpose",
    "questions",
    "retentionUntil",
    "title",
  ]);
  assert.equal(JSON.stringify(schema).includes("private"), false);
  assert.equal(JSON.stringify(schema).includes("reviewer"), false);
});

test("publication rejects sensitive prompts and malformed or excessive schemas", () => {
  for (const questions of [
    [{ key: "history", label: "Medical diagnosis", type: "text" }],
    [{ key: "__proto__", label: "Name", type: "text" }],
    [{ key: "one", label: "Name", type: "text", extra: true }],
    [{ key: "email", label: "Email", type: "number" }],
    Array.from({ length: 31 }, (_, n) => ({
      key: `q${n}`,
      label: "Option",
      type: "boolean",
    })),
    [
      {
        key: "one",
        label: "Choice",
        type: "select",
        options: ["Same", "Same"],
      },
    ],
  ]) {
    const record = source();
    record.data.definition = JSON.stringify(questions);
    assert.throws(() => intakeSchema(record, "contact"));
  }
});

test("expired source snapshots may be validated privately for restore but cannot accept new requests", () => {
  const record = source();
  record.data.retentionUntil = "2000-01-01";
  assert.throws(
    () => intakeSchema(record, "contact"),
    error("intake_retention"),
  );
  const schema = intakeSchema(record, "contact", { allowExpired: true });
  assert.equal(schema.retentionUntil, "2000-01-01");
  assert.equal(
    publicationAccepting({ source_revision: 4, schema }, record),
    false,
  );
  record.data.retentionUntil = "2000-02-30";
  assert.throws(
    () => intakeSchema(record, "contact", { allowExpired: true }),
    error("intake_retention"),
  );
});

const answerSchema = {
  questions: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "count", label: "Count", type: "number", required: true },
    { key: "choice", label: "Choice", type: "boolean", required: true },
    { key: "day", label: "Day", type: "date", required: true },
    { key: "option", label: "Option", type: "select", options: ["One", "Two"] },
    { key: "email", label: "Email", type: "text" },
  ],
};
const answers = () => ({
  name: " Example person ",
  count: 0,
  choice: false,
  day: "2028-02-29",
});

test("zero and false are required answers while optional unknown values remain null", () => {
  assert.deepEqual(intakeAnswers(answerSchema, answers()), {
    name: "Example person",
    count: 0,
    choice: false,
    day: "2028-02-29",
    option: null,
    email: null,
  });
  assert.deepEqual(
    intakeAnswers(
      {
        questions: [{ key: "toString", label: "Optional label", type: "text" }],
      },
      {},
    ),
    { toString: null },
  );
});

test("answer validation refuses unknown keys, wrong types, impossible dates and invalid email", () => {
  for (const patch of [
    { extra: "hidden" },
    { name: " " },
    { name: "x".repeat(181) },
    { count: "0" },
    { count: Infinity },
    { choice: "false" },
    { day: "2027-02-29" },
    { option: "Other" },
    { email: "invalid" },
  ])
    assert.throws(() =>
      intakeAnswers(answerSchema, { ...answers(), ...patch }),
    );
  assert.equal(
    intakeAnswers(answerSchema, {
      ...answers(),
      email: "synthetic@example.invalid",
    }).email,
    "synthetic@example.invalid",
  );
});

test("source revision, current independent approval, withdrawal and published workflow all gate acceptance", () => {
  const record = source(),
    publication = {
      source_revision: 4,
      schema: intakeSchema(record, "contact"),
    };
  assert.equal(publicationAccepting(publication, record), true);
  for (const changed of [
    { revision: 5 },
    { status: "closed" },
    { approval: null },
    { approval: { revision: 4, status: "approved", actorId: "author" } },
    { approval: { revision: 3, status: "approved", actorId: "reviewer" } },
  ])
    assert.equal(
      publicationAccepting(publication, { ...record, ...changed }),
      false,
    );
  assert.equal(
    publicationAccepting({ ...publication, withdrawn_at: new Date() }, record),
    false,
  );
});

test("a linked session must retain its exact approved revision and open workflow", () => {
  const record = source(),
    publication = {
      source_revision: 4,
      target_id: "session",
      target_revision: 2,
      kind: "event-interest",
      schema: intakeSchema(record, "event-interest"),
    };
  const target = {
    id: "session",
    moduleId: "events",
    revision: 2,
    status: "open",
    lastEditedBy: "author",
    approval: { revision: 2, status: "approved", actorId: "reviewer" },
    data: { kind: "session" },
  };
  assert.equal(publicationAccepting(publication, record, target), true);
  assert.equal(
    publicationAccepting(publication, record, { ...target, revision: 3 }),
    false,
  );
  assert.equal(
    publicationAccepting(publication, record, {
      ...target,
      status: "completed",
    }),
    false,
  );
  assert.equal(
    publicationAccepting(publication, record, {
      ...target,
      moduleId: "volunteers",
    }),
    false,
  );
});

test("public mutations reject foreign/opaque origins and query tokens before touching storage", async () => {
  const db = {
    tx: () => {
      throw new Error("must not touch DB");
    },
    limit: () => {
      throw new Error("must not touch rate DB");
    },
  };
  for (const origin of ["https://other.example.invalid", "null"]) {
    await assert.rejects(
      publicIntakeRoutes({
        request: new Request(
          `${settings.origin}/api/public/intake/org/pub/submissions`,
          {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: "{}",
          },
        ),
        db,
        settings,
      }),
      error("origin"),
    );
  }
  await assert.rejects(
    publicIntakeRoutes({
      request: new Request(
        `${settings.origin}/api/public/intake/org/pub/receipt?receipt=secret`,
        {
          method: "POST",
          headers: {
            origin: settings.origin,
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      db,
      settings,
    }),
    error("intake_query"),
  );
});

test("public collection needs explicit consent and a clear honeypot; invalid data creates no intent", async () => {
  const db = {
    tx: () => {
      throw new Error("must not touch tenant DB");
    },
    limit: async () => {},
  };
  for (const [input, code] of [
    [{ consent: false }, "intake_consent"],
    [{ consent: true, website: "bot" }, "intake_honeypot"],
    [
      { consent: true, website: "", idempotencyKey: "short" },
      "intake_identity",
    ],
  ]) {
    await assert.rejects(
      publicIntakeRoutes({
        request: new Request(
          `${settings.origin}/api/public/intake/org/pub/submissions`,
          {
            method: "POST",
            headers: {
              origin: settings.origin,
              "content-type": "application/json",
            },
            body: JSON.stringify(input),
          },
        ),
        db,
        settings,
      }),
      error(code),
    );
  }
});

test("the exact Vercel rewrite capture reaches intake routing while wrong, duplicate and extra query fields stay forbidden", async () => {
  const pathname = "/api/public/intake/org/pub",
    capture = pathname.slice("/api/".length);
  let calls = 0;
  const marker = new Error("Synthetic storage boundary reached.");
  const db = {
    tx: async (_user, org) => {
      calls++;
      assert.equal(org, "org");
      throw marker;
    },
    limit: async () => {
      throw new Error("GET must not use rate storage.");
    },
  };
  await assert.rejects(
    publicIntakeRoutes({
      request: new Request(
        `${settings.origin}${pathname}?path=${encodeURIComponent(capture)}`,
      ),
      db,
      settings,
    }),
    (e) => e === marker,
  );
  assert.equal(calls, 1);
  for (const query of [
    "path=wrong",
    `path=${encodeURIComponent(capture)}&path=${encodeURIComponent(capture)}`,
    `path=${encodeURIComponent(capture)}&token=secret`,
    `path=${encodeURIComponent(capture)}&receipt=secret`,
    `path=${encodeURIComponent(capture)}&other=`,
  ]) {
    await assert.rejects(
      publicIntakeRoutes({
        request: new Request(`${settings.origin}${pathname}?${query}`),
        db,
        settings,
      }),
      error("intake_query"),
    );
  }
  assert.equal(
    calls,
    1,
    "Invalid query fields are refused before tenant storage.",
  );
});

test("private review routes require administrators before any queue read", async () => {
  await assert.rejects(
    intakeRoutes({
      c: {
        query() {
          throw new Error("no storage access");
        },
      },
      org: "org",
      user: "user",
      member: { role: "contributor" },
      tail: "intake/submissions",
      method: "GET",
      settings,
    }),
    error("role"),
  );
});

test("review metadata cannot push the pending queue beyond its actual row-byte cap", async () => {
  const row = {
    id: "request",
    revision: 1,
    status: "pending",
    answers: {},
    consent_at: new Date(),
    created_at: new Date(),
    converted_ids: [],
  };
  const c = {
    query: async (sql) => {
      if (sql.startsWith("SELECT * FROM os_intake")) return { rows: [row] };
      if (sql.startsWith("UPDATE os_intake"))
        return { rows: [{ ...row, revision: 2, status: "reviewed" }] };
      if (sql.startsWith("SELECT COALESCE(sum(octet_length(to_jsonb(i)"))
        return { rows: [{ bytes: 8 * 1024 * 1024 + 1 }] };
      throw new Error("The failed review must not append an audit event.");
    },
  };
  await assert.rejects(
    intakeRoutes({
      c,
      org: "org",
      user: "admin",
      member: { role: "admin" },
      tail: "intake/submissions/request/review",
      method: "POST",
      input: { revision: 1, action: "review" },
      settings,
    }),
    error("intake_quota"),
  );
});
