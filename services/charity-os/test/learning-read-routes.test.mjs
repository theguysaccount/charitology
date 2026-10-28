import test from "node:test";
import assert from "node:assert/strict";
import { learningReadRoute } from "../lib/learning-read-routes.mjs";
import {
  buildLearningFixture,
  appendLearningTestMeasurement,
} from "./learning-fixtures.mjs";
import { learningJSONBBytes } from "../lib/learning-backup.mjs";
import { encodeLearningCursor } from "../lib/learning-history.mjs";
const clone = (x) => structuredClone(x);
const base = buildLearningFixture();
function setup({ recovered = false } = {}) {
  const f = clone(base),
    statements = [],
    records = new Map(),
    audits = new Map();
  const member = {
    userId: "reviewer-one",
    role: "admin",
    programIds: [],
    revision: 1,
    membershipSha256: "1".repeat(64),
    createdAtExact: "2026-10-27T00:00:00.000000Z",
  };
  const sync = () => {
    for (const r of f.records)
      records.set(r.id, {
        org_id: r.orgId,
        id: r.id,
        module_id: r.moduleId,
        data: clone(r.data),
        status: r.status,
        owner_id: r.ownerId,
        last_editor_id: r.lastEditedBy,
        revision: r.revision,
        approval: clone(r.approval),
        snapshot: clone(r.snapshot),
        source: r.source,
        created_at: new Date(r.createdAt),
        updated_at: new Date(r.updatedAt),
        deleted_at: null,
      });
    for (const p of f.approvedEvidence)
      audits.set(p.pin.recordId, [
        {
          id: p.approvalEvent.id,
          actor_id: p.approval.actorId,
          created_exact: p.approvalEvent.createdAtExact,
          detail: {
            record: clone(f.records.find((r) => r.id === p.pin.recordId)),
          },
        },
      ]);
  };
  sync();
  let live = true;
  const reportRow = () => ({
    id: f.report.id,
    org_id: f.orgId,
    checksum: f.report.checksum,
    title: f.report.title,
    created_by: f.report.createdBy,
    payload: clone(f.report),
    learning_payload_bytes: learningJSONBBytes(f.report),
  });
  const rows = () => [
    ...f.sources.map((payload) => ({
      id: payload.sha256,
      row_kind: "source",
      origin_mode: recovered ? "recovered" : "live",
      payload,
    })),
    ...f.approvedEvidence.map((payload) => ({
      id: payload.sha256,
      row_kind: "evidence",
      origin_mode: recovered ? "recovered" : "live",
      payload,
    })),
    ...f.events.map((payload) => ({
      id: payload.sha256,
      row_kind: "event",
      origin_mode: recovered ? "recovered" : "live",
      payload,
    })),
  ];
  const client = {
    query: async (sql, params) => {
      statements.push(sql);
      assert(!/^(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/.test(sql));
      if (sql.includes("FROM os_learning_history")) {
        if (sql.includes("AS count"))
          return { rows: [{ count: rows().length, bytes: 100000 }] };
        if (sql.includes("row_kind='recovered-report'"))
          return {
            rows: recovered
              ? [
                  {
                    id: f.report.checksum,
                    row_kind: "recovered-report",
                    origin_mode: "recovered",
                    origin_org_id: f.report.orgId,
                    program_id: f.programId,
                    binding_id: null,
                    sequence: null,
                    source_version: null,
                    receipt: null,
                    payload: clone(f.report),
                  },
                ]
              : [],
          };
        return {
          rows: clone(
            rows().filter((r) => !params[1] || r.origin_mode === "recovered"),
          ),
        };
      }
      if (sql.includes("FROM os_records"))
        return {
          rows: clone(
            sql.includes("ANY(")
              ? params[1].map((id) => records.get(id)).filter(Boolean)
              : [records.get(params[1])].filter(Boolean),
          ),
        };
      if (sql.includes("FROM os_events"))
        return { rows: clone(audits.get(params[1]) ?? []) };
      if (sql.includes("FROM os_reports"))
        return {
          rows:
            recovered || !live
              ? []
              : sql.startsWith("SELECT id ")
                ? [{ id: f.report.id }]
                : params[1] === f.report.id
                  ? [reportRow()]
                  : [],
        };
      throw Error("Unexpected read SQL: " + sql);
    },
  };
  const read = (tail, query = "", who = member) =>
    learningReadRoute({
      c: client,
      org: f.orgId,
      member: who,
      tail,
      url: new URL(
        "http://localhost/api/orgs/" + f.orgId + "/learning/" + tail + query,
      ),
    });
  return {
    f,
    client,
    member,
    records,
    audits,
    statements,
    read,
    sync,
    setLive: (v) => (live = v),
  };
}
const payload = async (response) => {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return response.json();
};
test("real model history routes emit exact summaries, newest event page and current approval context without writes", async () => {
  const s = setup(),
    list = await payload(await s.read("bindings"));
  assert.deepEqual(Object.keys(list).sort(), ["bindings", "nextCursor", "ok"]);
  assert.equal(list.bindings[0].head.eventSha256, s.f.head.eventSha256);
  const detail = await payload(await s.read("bindings/binding-one"));
  assert.equal(detail.events[0].sha256, s.f.events.at(-1).sha256);
  const context = await payload(await s.read("bindings/binding-one/context"));
  assert.deepEqual(Object.keys(context).sort(), [
    "binding",
    "mapping",
    "nextCursor",
    "ok",
    "program",
    "records",
    "source",
  ]);
  assert.equal(context.source.sha256, s.f.source.sha256);
  assert.equal(context.program.eligibility.eligible, true);
  assert.deepEqual(
    context.records.map((r) => r.recordId),
    context.records.map((r) => r.recordId).sort(),
  );
  const approval = await payload(
    await s.read("records/indicator-one/approval"),
  );
  assert.deepEqual(approval.resolution.pin, s.f.definition.evidence.pin);
  assert(s.statements.every((sql) => sql.startsWith("SELECT")));
});
test("reports retain complete exact private JSON and service-chosen attachment name", async () => {
  const s = setup(),
    list = await payload(await s.read("reports"));
  assert.equal(list.reports[0].sourceDigest, s.f.report.selection.sourceDigest);
  assert(!JSON.stringify(list).includes("Fictional access problem"));
  const detail = await s.read("reports/report-one"),
    text = await detail.text(),
    native = JSON.stringify(s.f.report);
  assert.deepEqual(JSON.parse(text).report, s.f.report);
  assert.equal(Buffer.byteLength(text) - Buffer.byteLength(native), 21);
  assert(Buffer.byteLength(text) - Buffer.byteLength(native) <= 8192);
  const download = await s.read("reports/report-one/export");
  assert.match(
    download.headers.get("content-disposition"),
    /^attachment; filename="charitology-learning-report-report-one.json"$/,
  );
  assert.deepEqual(await download.json(), s.f.report);
});
test("strict route/query/cursor grammar rejects duplicate, malformed, extra keys and stale context head", async () => {
  const s = setup();
  for (const [tail, q] of [
    ["bindings", "?cursor=x&cursor=x"],
    ["reports/report-one", "?cursor=x"],
    ["records/indicator-one/approval", "?source=secret"],
    ["bindings", "?unknown=1"],
    ["bindings", "?cursor=%3D"],
    [
      "bindings",
      "?cursor=" +
        encodeLearningCursor({
          version: 1,
          lastId: "x",
          headSha256: null,
          extra: 1,
        }),
    ],
  ])
    await assert.rejects(s.read(tail, q));
  assert.equal(await s.read("unknown"), null);
  await assert.rejects(
    s.read(
      "bindings/binding-one",
      "?cursor=" +
        encodeLearningCursor({
          version: 1,
          bindingId: "binding-one",
          head: { ...s.f.head, eventSha256: "f".repeat(64) },
          beforeSequence: 3,
        }),
    ),
    (e) => e.status === 409,
  );
});
test("current role/scope and source write rules block raw context and hide unavailable ordinary approval", async () => {
  const s = setup();
  for (const role of ["board_reader", "external_reviewer"])
    await assert.rejects(
      s.read("bindings", "", { ...s.member, role }),
      (e) => e.status === 403,
    );
  await assert.rejects(
    s.read("reports", "", {
      ...s.member,
      role: "contributor",
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.read("bindings/binding-one", "", {
      ...s.member,
      programIds: ["other-program"],
    }),
    (e) => e.status === 404,
  );
  assert.deepEqual(
    (
      await payload(
        await s.read("bindings", "", {
          ...s.member,
          programIds: ["other-program"],
        }),
      )
    ).bindings,
    [],
  );
  s.records.delete("indicator-one");
  await assert.rejects(
    s.read("records/indicator-one/approval"),
    (e) => e.status === 404,
  );
  const context = await payload(await s.read("bindings/binding-one/context"));
  assert.equal(
    context.records.find((r) => r.recordId === "indicator-one").record,
    null,
  );
});
test("context keeps full retained source when current program data changed and never supplies fallback approval", async () => {
  const s = setup();
  s.records.get(s.f.programId).data.title = "Changed ordinary program";
  const context = await payload(await s.read("bindings/binding-one/context"));
  assert.equal(context.binding.disposition, "needs-review");
  assert.equal(context.program.pin, null);
  assert.equal(context.program.evidence, null);
  assert.equal(context.program.eligibility.eligible, false);
  assert.equal(context.source.sha256, s.f.source.sha256);
});
test("twenty-item context/event paging binds exact current head and refuses a later changed history", async () => {
  const s = setup();
  for (let i = 0; i < 21; i++)
    appendLearningTestMeasurement(s.f, i, {
      recordId: "later-" + String(i).padStart(2, "0"),
    });
  s.sync();
  const first = await payload(await s.read("bindings/binding-one/context"));
  assert.equal(first.records.length, 20);
  assert(first.nextCursor);
  const second = await payload(
    await s.read("bindings/binding-one/context", "?cursor=" + first.nextCursor),
  );
  assert(second.records.length > 0);
  assert(
    !first.records.some((x) =>
      second.records.some((y) => x.recordId === y.recordId),
    ),
  );
  const history = await payload(await s.read("bindings/binding-one"));
  assert.equal(history.events.length, 20);
  const old = await payload(
    await s.read("bindings/binding-one", "?cursor=" + history.nextCursor),
  );
  assert(old.events.every((e) => e.sequence < history.events.at(-1).sequence));
  appendLearningTestMeasurement(s.f, 3, { recordId: "newer-head" });
  s.sync();
  await assert.rejects(
    s.read("bindings/binding-one/context", "?cursor=" + first.nextCursor),
    (e) => e.status === 409,
  );
  await assert.rejects(
    s.read("bindings/binding-one", "?cursor=" + history.nextCursor),
    (e) => e.status === 409,
  );
});
test("recovered reader requires server recovered rows and admin, preserves full inactive bytes and denies live report route", async () => {
  const s = setup({ recovered: true }),
    list = await payload(await s.read("recovered"));
  assert.equal(list.bindings[0].originMode, "recovered");
  assert.equal(list.bindings[0].disposition, "historical-only");
  const detail = await payload(
    await s.read("recovered/" + s.f.head.eventSha256),
  );
  assert.deepEqual(detail.history, s.f.backup);
  const keys = (value) =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, item]) => [key, ...keys(item)])
      : [];
  assert(!keys(detail).includes("receipt"));
  await assert.rejects(s.read("reports/report-one"), (e) => e.status === 404);
  await assert.rejects(
    s.read("recovered", "", { ...s.member, role: "program_lead" }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.read("recovered/" + s.f.head.eventSha256, "", {
      ...s.member,
      programIds: ["other-program"],
    }),
    (e) => e.status === 404,
  );
  const live = setup();
  await assert.rejects(
    live.read("recovered/" + live.f.head.eventSha256),
    (e) => e.status === 404,
  );
});
test("context stops before complete4MiB response and refuses oversized base without truncating fields", async () => {
  const s = setup();
  s.records.get("decision-one").source = "x".repeat(2 * 1024 * 1024);
  s.records.get("indicator-one").source = "y".repeat(2 * 1024 * 1024);
  const response = await s.read("bindings/binding-one/context"),
    raw = await response.text();
  assert(Buffer.byteLength(raw) <= 4 * 1024 * 1024);
  const first = JSON.parse(raw);
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].record.source.length, 2 * 1024 * 1024);
  assert(first.nextCursor);
  const next = await payload(
    await s.read("bindings/binding-one/context", "?cursor=" + first.nextCursor),
  );
  assert(next.records.some((r) => r.recordId === "indicator-one"));
  s.records.get(s.f.programId).source = "z".repeat(4 * 1024 * 1024);
  await assert.rejects(
    s.read("bindings/binding-one/context"),
    (e) => e.code === "learning_size",
  );
  assert.equal(s.records.get(s.f.programId).source.length, 4 * 1024 * 1024);
});
