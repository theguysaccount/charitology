import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { visibleRecord } from "../lib/access.mjs";
import { createHandler } from "../lib/handler.mjs";
import { runOrgJobs } from "../lib/jobs.mjs";
import { csrf, hash, decrypt } from "../lib/security.mjs";
import {
  readRemote,
  mapRows,
  integrationRoutes,
} from "../lib/integrations.mjs";
import { exampleRecords } from "../lib/modules.mjs";
import { uploadPart, uploadedBackup, downloadJson } from "../lib/uploads.mjs";
import {
  makeBackup,
  validateBackup,
  restoredIntegrations,
} from "../lib/backup.mjs";
import { validateFile } from "../lib/files.mjs";
import { audit as appendAudit, saveRecord } from "../lib/database.mjs";

const org = "test-org";
const user = "test-reader";
const settings = {
  origin: "https://os.example.invalid",
  secret: "test-review-secret-at-least-thirty-two-characters",
};
const stamp = new Date("2026-10-26T12:00:00.000Z");
function envelope(moduleId = "projects", extra = {}) {
  return {
    ...structuredClone(
      exampleRecords(org).find((r) => r.moduleId === moduleId),
    ),
    id: "record-one",
    ownerId: "author",
    lastEditedBy: "author",
    revision: 3,
    approval: null,
    snapshot: null,
    createdAt: stamp.toISOString(),
    updatedAt: stamp.toISOString(),
    ...extra,
  };
}
function row(record) {
  return {
    org_id: record.orgId,
    id: record.id,
    module_id: record.moduleId,
    data: record.data,
    status: record.status,
    owner_id: record.ownerId,
    last_editor_id: record.lastEditedBy,
    revision: record.revision,
    approval: record.approval,
    snapshot: record.snapshot,
    source: record.source,
    created_at: stamp,
    updated_at: stamp,
  };
}
function memberRow(member) {
  return {
    user_id: user,
    role: member.role,
    program_ids: member.programIds || [],
    revision: 1,
  };
}
function fixture(
  record,
  member,
  files = [],
  contextRecords = [record],
  reports = [],
  extraQuery,
) {
  const saves = [];
  const c = {
    query: async (sql, args = []) => {
      const extra = await extraQuery?.(sql, args);
      if (extra !== undefined) return extra;
      if (
        sql.startsWith("SELECT pg_advisory_xact_lock") ||
        sql.startsWith("DELETE FROM os_previews")
      )
        return { rows: [] };
      if (sql.startsWith("SELECT count(*) FILTER"))
        return {
          rows: [
            {
              pending_count: 0,
              pending_bytes: 0,
              committed_count: 0,
              committed_bytes: 0,
              candidate_bytes: Buffer.byteLength(args[1]),
            },
          ],
        };
      if (
        sql ===
          "SELECT s.* FROM os_task_recurrence_series s WHERE s.org_id=$1 AND (s.root_record_id=$2 OR EXISTS(SELECT 1 FROM os_task_recurrence_occurrences o WHERE o.org_id=s.org_id AND o.series_id=s.id AND (o.source_record_id=$2 OR o.generated_record_id=$2)))" ||
        sql ===
          "SELECT * FROM os_task_recurrence_series WHERE org_id=$1 ORDER BY id" ||
        sql ===
          "SELECT packet FROM os_task_recurrence_occurrences WHERE org_id=$1 ORDER BY series_id,sequence" ||
        sql ===
          "SELECT 1 FROM os_task_recurrence_series WHERE org_id=$1 LIMIT 1" ||
        sql === "SELECT * FROM os_resource_directory_history WHERE org_id=$1 ORDER BY row_kind,capture_id,binding_id,sequence,id"
      )
        return { rows: [] };
      if (
        sql === "SELECT count(*) FROM os_task_recurrence_series WHERE org_id=$1" ||
        sql === "SELECT count(*) AS count FROM os_resource_directory_history WHERE org_id=$1"
      )
        return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT * FROM os_members"))
        return { rows: [memberRow(member)] };
      if (sql.startsWith("SELECT 1 FROM os_members"))
        return { rows: [{ present: 1 }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM os_orgs"))
        return {
          rows: [
            {
              id: org,
              name: "Synthetic organization",
              time_zone: "UTC",
              currency: "USD",
            },
          ],
        };
      if (sql.startsWith("SELECT * FROM os_records"))
        return { rows: contextRecords.map(row) };
      if (sql.startsWith("SELECT * FROM os_files"))
        return { rows: files.filter((f) => f.id === args[1]) };
      if (sql.startsWith("SELECT id,title,checksum,payload"))
        return { rows: reports };
      if (sql.startsWith("SELECT id,name,mime")) return { rows: files };
      if (sql.startsWith("SELECT COALESCE(sum(size)"))
        return {
          rows: [
            {
              size: files.reduce((n, f) => n + f.size, 0),
              count: files.length,
            },
          ],
        };
      if (sql.startsWith("SELECT COALESCE(sum(octet_length(data::text))"))
        return { rows: [{ size: 0, count: 0 }] };
      if (sql.startsWith("SELECT sum(size) AS size FROM ("))
        return { rows: [{ size: 0 }] };
      if (sql.startsWith("SELECT (SELECT count(*) FROM os_publications"))
        return { rows: [{ count: 0 }] };
      if (
        /FROM os_participation(?:_targets|_outbox|_delivery_policies|_delivery_previews|s)\b/.test(
          sql,
        )
      )
        return { rows: [] };
      if (
        sql.startsWith("SELECT id,record_id,source_revision") ||
        sql.startsWith("SELECT id,publication_id,answers")
      )
        return { rows: [] };
      if (sql.startsWith("INSERT INTO os_files"))
        return { rows: [], rowCount: 1 };
      if (sql.startsWith("INSERT INTO os_records")) {
        saves.push({
          status: args[4],
          revision: args[6],
          approval: args[7] && JSON.parse(args[7]),
          snapshot: args[8] && JSON.parse(args[8]),
          lastEditedBy: args[9],
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO os_events"))
        return { rows: [], rowCount: 1 };
      throw new Error("Unexpected test query: " + sql);
    },
  };
  const session = {
    user: { id: user, email: "synthetic@example.invalid" },
    session: { id: "test-session" },
  };
  const handle = createHandler({
    settings,
    db: { tx: async (_u, _o, fn) => fn(c) },
    auth: { api: { getSession: async () => session } },
    send: async () => {
      throw new Error("No real or mocked mail expected from a file request.");
    },
  });
  const call = (path, method = "GET", payload) =>
    handle(
      new Request(settings.origin + `/api/orgs/${org}/` + path, {
        method,
        headers: {
          ...(method === "GET"
            ? {}
            : {
                origin: settings.origin,
                "x-csrf-token": csrf(session.session.id, settings.secret),
                "content-type": "application/json",
              }),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      }),
    );
  return { call, saves };
}

test("Historical snapshots obey their own program scope as well as the current record scope", () => {
  const r = envelope();
  r.data = { ...r.data, programId: "program-b", title: "Working B title" };
  r.snapshot = {
    ...r,
    data: { ...r.data, programId: "program-a", title: "Private A snapshot" },
    snapshot: undefined,
  };
  for (const role of ["board_reader", "external_reviewer"]) {
    assert.equal(visibleRecord(r, { role, programIds: ["program-b"] }), null);
    assert.equal(visibleRecord(r, { role, programIds: ["program-a"] }), null);
    assert.equal(
      visibleRecord(r, { role, programIds: ["program-a", "program-b"] }).data
        .title,
      "Private A snapshot",
    );
  }
});

test("Snapshot readers list and download only frozen attachment identities with matching checksums", async () => {
  const record = envelope("documents");
  const files = [
    {
      id: "approved",
      record_id: record.id,
      name: "approved.txt",
      mime: "text/plain",
      bytes: Buffer.from("Approved"),
      checksum: hash("Approved"),
      size: 8,
    },
    {
      id: "later",
      record_id: record.id,
      name: "later.txt",
      mime: "text/plain",
      bytes: Buffer.from("Later private draft"),
      checksum: hash("Later private draft"),
      size: 19,
    },
    {
      id: "changed",
      record_id: record.id,
      name: "changed.txt",
      mime: "text/plain",
      bytes: Buffer.from("Changed"),
      checksum: hash("Changed"),
      size: 7,
    },
  ];
  record.snapshot = {
    ...record,
    files: [
      { id: "approved", checksum: files[0].checksum },
      { id: "changed", checksum: hash("Previously approved bytes") },
    ],
    snapshot: undefined,
  };
  for (const role of ["board_reader", "external_reviewer"]) {
    const f = fixture(record, { role }, files);
    const listing = await f.call(
      `modules/documents/records/${record.id}/files`,
    );
    assert.equal(listing.status, 200);
    assert.deepEqual(
      (await listing.json()).files.map((x) => x.id),
      ["approved"],
    );
    const approved = await f.call("files/approved");
    assert.equal(approved.status, 200);
    assert.equal(await approved.text(), "Approved");
    assert.equal((await f.call("files/later")).status, 404);
    assert.equal((await f.call("files/changed")).status, 404);
  }
  const staff = fixture(record, { role: "program_lead" }, files);
  assert.equal((await staff.call("files/later")).status, 200);
});

test("Attachment changes invalidate approval and revision while retaining the historical snapshot", async () => {
  const record = envelope("documents", {
    approval: { status: "approved", revision: 3 },
  });
  record.snapshot = {
    ...record,
    files: [{ id: "earlier", checksum: hash("earlier") }],
    snapshot: undefined,
  };
  const f = fixture(record, { role: "program_lead" });
  const response = await f.call(
    `modules/documents/records/${record.id}/files`,
    "POST",
    {
      name: "draft.txt",
      mime: "text/plain",
      content: Buffer.from("A later draft").toString("base64"),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(f.saves.length, 1);
  assert.equal(f.saves[0].revision, 4);
  assert.equal(f.saves[0].approval, null);
  assert.equal(f.saves[0].lastEditedBy, user);
  assert.equal(f.saves[0].status, "review");
  assert.deepEqual(f.saves[0].snapshot.files, record.snapshot.files);
});

test("Independent approval freezes current file checksums into the persisted snapshot", async () => {
  const record = envelope("documents");
  const files = [
    {
      id: "current-file",
      name: "current.txt",
      mime: "text/plain",
      size: 7,
      checksum: hash("current"),
    },
  ];
  const f = fixture(record, { role: "program_lead" }, files);
  const response = await f.call(
    `modules/documents/records/${record.id}/approve`,
    "POST",
    { revision: record.revision, reason: "Independent synthetic review." },
  );
  assert.equal(response.status, 200);
  assert.equal(f.saves.length, 1);
  assert.deepEqual(f.saves[0].snapshot.files, files);
  assert.equal(f.saves[0].approval.revision, 4);
});

test("Scalar and array references cannot bypass the current program scope on create, edit, approval or transition", async () => {
  const program = envelope("programs", { id: "program-a" });
  const privateParent = envelope("projects", { id: "private-parent" });
  privateParent.data.programId = "program-b";
  for (const link of [
    { projectId: privateParent.id },
    { dependencyIds: [privateParent.id] },
  ]) {
    const record = envelope("projects");
    record.data = { ...record.data, programId: program.id, ...link };
    const f = fixture(
      record,
      { role: "program_lead", programIds: [program.id] },
      [],
      [program, privateParent, record],
    );
    for (const [suffix, method, input] of [
      ["", "POST", { data: record.data }],
      [
        `/${record.id}`,
        "PATCH",
        { revision: record.revision, data: record.data },
      ],
      [
        `/${record.id}/approve`,
        "POST",
        {
          revision: record.revision,
          reason: "Review must not authorize a foreign link.",
        },
      ],
      [
        `/${record.id}/transition`,
        "POST",
        {
          revision: record.revision,
          to: "ready",
          reason: "Transition must not authorize a foreign link.",
        },
      ],
    ]) {
      const response = await f.call(
        "modules/projects/records" + suffix,
        method,
        input,
      );
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "reference_scope");
    }
    assert.equal(f.saves.length, 0);
  }
});

test("Reference authorization also checks the target module permission", async () => {
  const restricted = envelope("safeguarding", { id: "private-check" });
  const record = envelope("volunteers");
  record.data.safeguardingId = restricted.id;
  const f = fixture(record, { role: "contributor" }, [], [restricted, record]);
  const response = await f.call("modules/volunteers/records", "POST", {
    data: record.data,
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "reference_scope");
  assert.equal(f.saves.length, 0);
});

test("Financial content edits return an approved or active record to review and cannot advance a stale approval", async () => {
  const stale = envelope("finance", { status: "approved", approval: null });
  stale.snapshot = { ...stale, revision: 2, snapshot: undefined };
  const f = fixture(stale, { role: "finance_reviewer" });
  const denied = await f.call(
    `modules/finance/records/${stale.id}/transition`,
    "POST",
    {
      revision: stale.revision,
      to: "active",
      reason: "A prior approval does not authorize edited content.",
    },
  );
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).code, "approval");
  assert.equal(f.saves.length, 0);
  const approved = envelope("finance", {
    status: "active",
    approval: { status: "approved", revision: 3 },
  });
  approved.snapshot = { ...approved, snapshot: undefined };
  const g = fixture(approved, { role: "finance_reviewer" });
  const edited = await g.call(
    `modules/finance/records/${approved.id}`,
    "PATCH",
    {
      revision: approved.revision,
      data: { ...approved.data, title: "A changed financial plan" },
    },
  );
  assert.equal(edited.status, 200);
  assert.equal(g.saves.length, 1);
  assert.equal(g.saves[0].status, "review");
  assert.equal(g.saves[0].approval, null);
  assert.equal(g.saves[0].lastEditedBy, user);
});

test("Report listings do not reveal metadata for records outside current module permissions or program scope", async () => {
  const record = envelope("projects");
  record.data.programId = "program-a";
  const report = (id, moduleId, programId) => ({
    id,
    title: "Synthetic report " + id,
    checksum: hash(id),
    payload: {
      modules: [
        { id: moduleId, records: [{ id, moduleId, data: { programId } }] },
      ],
    },
  });
  const reports = [
    report("allowed", "projects", "program-a"),
    report("private-program", "projects", "program-b"),
    report("private-module", "accounting", "program-a"),
  ];
  const f = fixture(
    record,
    { role: "program_lead", programIds: ["program-a"] },
    [],
    [record],
    reports,
  );
  const response = await f.call("reports");
  assert.equal(response.status, 200);
  const result = (await response.json()).reports;
  assert.deepEqual(
    result.map((r) => r.id),
    ["allowed"],
  );
  assert.equal("payload" in result[0], false);
});

async function runReminder(record, member) {
  const sent = [],
    states = [];
  let claimed = false;
  const job = {
    id: "reminder-one",
    kind: "reminder",
    payload: { userId: user, recordId: record.id },
    idempotency_key: "reminder:one",
  };
  const c = {
    query: async (sql, args = []) => {
      if (sql.startsWith("SELECT * FROM os_jobs")) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [job] };
      }
      if (sql.startsWith("UPDATE os_jobs SET status='processing'"))
        return { rows: [] };
      if (sql.startsWith("SELECT u.email,o.name"))
        return {
          rows: member
            ? [
                {
                  email: "synthetic@example.invalid",
                  name: "Synthetic organization",
                },
              ]
            : [],
        };
      if (sql.startsWith("SELECT * FROM os_members"))
        return { rows: member ? [memberRow(member)] : [] };
      if (sql.startsWith("SELECT * FROM os_records"))
        return { rows: [row(record)] };
      if (sql.startsWith("UPDATE os_jobs SET status=$3")) {
        states.push(args[2]);
        return { rows: [] };
      }
      throw new Error("Unexpected reminder test query: " + sql);
    },
  };
  const outcome = await runOrgJobs({
    db: { tx: async (_u, _o, fn) => fn(c) },
    org,
    settings,
    send: async (message) => {
      sent.push(message);
    },
  });
  return { sent, states, outcome };
}
test("Due reminders cancel after membership revocation, role loss or program scope loss", async () => {
  const scoped = envelope("projects");
  scoped.data.programId = "program-private";
  const restricted = envelope("accounting");
  for (const [record, member] of [
    [scoped, null],
    [scoped, { role: "contributor", programIds: ["program-other"] }],
    [restricted, { role: "program_lead" }],
  ]) {
    const result = await runReminder(record, member);
    assert.equal(result.sent.length, 0);
    assert.deepEqual(result.states, ["cancelled"]);
  }
});

test("A snapshot reader reminder uses the visible approved title, never a later working title", async () => {
  const record = envelope("projects");
  record.snapshot = {
    ...record,
    data: { ...record.data, title: "Approved title" },
    snapshot: undefined,
  };
  record.data = { ...record.data, title: "Private later working title" };
  const result = await runReminder(record, { role: "board_reader" });
  assert.equal(result.sent.length, 1);
  assert.equal(result.sent[0].title, "Approved title");
  assert.deepEqual(result.states, ["accepted"]);
});

test("Authenticated remote reads pin the checked public address and reject redirects without forwarding credentials", async () => {
  let resolved = 0,
    wire;
  const resolver = async () => {
    resolved++;
    return [{ address: "8.8.8.8", family: 4 }];
  };
  const requester = (_url, options, callback) => {
    wire = options;
    const req = new EventEmitter();
    req.end = () => {
      const response = new EventEmitter();
      response.statusCode = 302;
      response.resume = () => {};
      callback(response);
    };
    req.destroy = (error) => req.emit("error", error);
    return req;
  };
  await assert.rejects(
    () =>
      readRemote(
        "https://remote.example.invalid/api",
        { authorization: "Bearer synthetic-test-token" },
        { resolver, requester },
      ),
    /endpoint failed/,
  );
  assert.equal(resolved, 1);
  assert.equal(wire.servername, "remote.example.invalid");
  wire.lookup("remote.example.invalid", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
  wire.lookup("remote.example.invalid", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
  });
  assert.equal(wire.headers.authorization, "Bearer synthetic-test-token");
  let contacted = false;
  await assert.rejects(
    () =>
      readRemote(
        "https://remote.example.invalid/api",
        {},
        {
          resolver: async () => [{ address: "127.0.0.1", family: 4 }],
          requester: () => {
            contacted = true;
          },
        },
      ),
    (error) => error.code === "host",
  );
  assert.equal(contacted, false);
});

function uploadStore() {
  const parts = [];
  return {
    parts,
    c: {
      query: async (sql, args) => {
        if (sql.startsWith("DELETE FROM os_uploads")) return { rows: [] };
        if (sql.startsWith("SELECT count(DISTINCT id)"))
          return {
            rows: [
              {
                count: new Set(
                  parts.filter((r) => r.org_id === args[0]).map((r) => r.id),
                ).size,
              },
            ],
          };
        if (sql.startsWith("SELECT part,total,actor_id,checksum"))
          return {
            rows: parts.filter((r) => r.org_id === args[0] && r.id === args[1]),
          };
        if (sql.startsWith("INSERT INTO os_uploads")) {
          const [org_id, id, part, total, actor_id, bytes, checksum] = args;
          if (
            !parts.some(
              (r) => r.org_id === org_id && r.id === id && r.part === part,
            )
          )
            parts.push({ org_id, id, part, total, actor_id, bytes, checksum });
          return { rows: [] };
        }
        if (sql.startsWith("SELECT * FROM os_uploads"))
          return {
            rows: parts
              .filter(
                (r) =>
                  r.org_id === args[0] &&
                  r.id === args[1] &&
                  r.actor_id === args[2],
              )
              .sort((a, b) => a.part - b.part),
          };
        throw new Error("Unexpected upload test query: " + sql);
      },
    },
  };
}
test("Backup chunks retain actor/organization identity, order and exact bytes across Unicode boundaries", async () => {
  const store = uploadStore(),
    uploadId = "a".repeat(32),
    backup = { label: "A donation in ₹, €, 日本語 and café" },
    bytes = Buffer.from(JSON.stringify(backup));
  const midpoint = bytes.indexOf(Buffer.from("₹")) + 1;
  const chunks = [bytes.subarray(0, midpoint), bytes.subarray(midpoint)];
  const save = (index, extra = {}) =>
    uploadPart({
      c: store.c,
      org,
      user,
      input: {
        uploadId,
        index,
        total: 2,
        chunk: chunks[index].toString("base64"),
        ...extra,
      },
    });
  await save(1);
  await assert.rejects(
    () => uploadedBackup(store.c, org, user, uploadId),
    (e) => e.code === "upload",
  );
  await save(0);
  await save(0);
  assert.equal(store.parts.length, 2);
  assert.deepEqual(await uploadedBackup(store.c, org, user, uploadId), backup);
  await assert.rejects(
    () => uploadedBackup(store.c, "foreign-org", user, uploadId),
    (e) => e.code === "upload",
  );
  await assert.rejects(
    () => uploadedBackup(store.c, org, "foreign-actor", uploadId),
    (e) => e.code === "upload",
  );
  await assert.rejects(
    () => save(0, { chunk: Buffer.from("different").toString("base64") }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => save(0, { total: 3 }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () =>
      uploadPart({
        c: store.c,
        org,
        user: "foreign-actor",
        input: {
          uploadId,
          index: 0,
          total: 2,
          chunk: chunks[0].toString("base64"),
        },
      }),
    (e) => e.status === 409,
  );
});

test("Large organization downloads use a readable stream and preserve JSON beyond a single response payload", async () => {
  const backup = { content: "x".repeat(5 * 1024 * 1024), unicode: "Δ" };
  const response = downloadJson(backup, "synthetic-backup.json");
  assert.ok(response.body instanceof ReadableStream);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    bytes += value.byteLength;
    assert.ok(value.byteLength <= 65536);
  }
  assert.ok(chunks.length > 70);
  assert.ok(bytes > 4.5 * 1024 * 1024);
  assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString("utf8")), backup);
});

test("Valid module lists and CSV exports stream beyond the hosting non-streaming response limit", async () => {
  const prototype = envelope("programs");
  for (const key of ["purpose", "community", "mechanism", "assumptions"])
    prototype.data[key] = "x".repeat(4000);
  const records = Array.from({ length: 350 }, (_, index) => ({
    ...prototype,
    id: "program-" + index,
  }));
  const f = fixture(records[0], { role: "owner" }, [], records);
  for (const [path, type] of [
    ["modules/programs/records", "application/json"],
    ["modules/programs/export?format=csv", "text/csv"],
  ]) {
    const response = await f.call(path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(type));
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      assert.ok(value.byteLength <= 65536);
      chunks.push(Buffer.from(value));
      size += value.byteLength;
    }
    assert.ok(size > 4.5 * 1024 * 1024);
    const text = Buffer.concat(chunks).toString("utf8");
    if (type === "application/json")
      assert.equal(JSON.parse(text).records.length, records.length);
    else assert.equal(text.split("\r\n").length, records.length + 1);
  }
});

test("Native source identities survive backup restore while connection credentials and approvals remain untrusted", () => {
  const connection = {
    id: "connection-one",
    name: "Synthetic CSV",
    provider: "csv",
    config: { moduleId: "projects", fieldMap: {} },
    encrypted_token: "untrusted-original-credential",
    status: "verified",
  };
  const rows = [{ id: "source-one", title: "Imported project" }];
  const imported = mapRows(rows, connection, [], "source-org", user).records;
  imported[0].approval = {
    actorId: "untrusted-actor",
    status: "approved",
    revision: 99,
  };
  imported[0].snapshot = { data: { title: "Untrusted approved claim" } };
  const backup = makeBackup(
    { name: "Synthetic", currency: "USD", time_zone: "UTC" },
    imported,
    { integrations: [connection] },
  );
  const restored = validateBackup(
    JSON.parse(JSON.stringify(backup)),
    org,
    user,
  );
  assert.deepEqual(restored[0].source, imported[0].source);
  assert.equal(restored[0].approval, null);
  assert.equal(restored[0].snapshot, null);
  assert.equal(
    mapRows(rows, connection, restored, org, user).summary.skipped,
    1,
  );
  const metadata = restoredIntegrations(backup);
  assert.equal(metadata[0].id, connection.id);
  assert.equal(metadata[0].status, "unconfigured");
  assert.equal("encrypted_token" in metadata[0], false);
  assert.doesNotMatch(
    JSON.stringify(metadata),
    /untrusted-original-credential/,
  );
  const missing = makeBackup(
    { name: "Synthetic", currency: "USD", time_zone: "UTC" },
    imported,
  );
  assert.throws(
    () => validateBackup(missing, org, user),
    (error) => error.code === "source",
  );
});

test("Reconnecting a restored integration retains its identity, encrypts only the new credential and rejects stale revision", async () => {
  const connection = {
    id: "connection-one",
    revision: 3,
    name: "Synthetic service",
    provider: "kobo",
    config: {
      baseUrl: "https://remote.example.invalid",
      moduleId: "forms",
      fieldMap: {},
    },
  };
  const writes = [],
    key = "synthetic-storage-encryption-key-at-least-thirty-two-characters";
  const c = {
    query: async (sql, args) => {
      if (sql.startsWith("SELECT sum(size) AS size FROM ("))
        return { rows: [{ size: 0 }] };
      if (sql.startsWith("SELECT * FROM os_integrations"))
        return { rows: [connection] };
      if (sql.startsWith("UPDATE os_integrations")) {
        writes.push({ sql, args });
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO os_events")) return { rows: [] };
      throw new Error("Unexpected connection test query: " + sql);
    },
  };
  const context = {
    c,
    org,
    user,
    member: { role: "owner" },
    tail: "integrations/" + connection.id,
    method: "PATCH",
    settings: { ...settings, encryptionKey: key },
  };
  await assert.rejects(
    () =>
      integrationRoutes({
        ...context,
        input: { revision: 2, token: "synthetic-new-token" },
      }),
    (error) => error.code === "revision",
  );
  assert.equal(writes.length, 0);
  const response = await integrationRoutes({
    ...context,
    input: { revision: 3, token: "synthetic-new-token" },
  });
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args[1], connection.id);
  assert.equal(decrypt(writes[0].args[3], key), "synthetic-new-token");
  assert.doesNotMatch(await response.text(), /synthetic-new-token/);
});

test("A workspace containing only trash cannot silently accept a backup restore", async () => {
  const record = envelope("projects");
  const backup = makeBackup(
    { name: "Synthetic", currency: "USD", time_zone: "UTC" },
    [record],
  );
  const f = fixture(record, { role: "owner" }, [], [], [], async (sql) => {
    if (sql.startsWith("SELECT count(*) AS count FROM os_records"))
      return { rows: [{ count: 1 }] };
    if (sql.startsWith("INSERT INTO os_previews")) return { rows: [] };
    if (sql.startsWith("SELECT * FROM os_previews"))
      return {
        rows: [
          {
            id: "preview-one",
            payload: backup,
            base_revision: hash([]),
            committed_at: null,
          },
        ],
      };
  });
  const preview = await f.call("import/preview", "POST", { backup });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).issues.length, 1);
  const committed = await f.call("import/commit", "POST", {
    previewId: "preview-one",
  });
  assert.equal(committed.status, 409);
  assert.equal((await committed.json()).code, "restore_conflict");
  assert.equal(f.saves.length, 0);
});

test("Restore and direct upload share strict file signatures, UTF8 encoding and content checksum validation", () => {
  const valid = {
    name: "../synthetic.txt",
    mime: "text/plain",
    content: Buffer.from("UTF8 café").toString("base64"),
    checksum: hash("UTF8 café"),
  };
  const checked = validateFile(valid);
  assert.equal(checked.name, ".._synthetic.txt");
  assert.equal(checked.bytes.toString("utf8"), "UTF8 café");
  for (const bad of [
    { ...valid, mime: "text/html" },
    { ...valid, mime: "application/pdf" },
    { ...valid, mime: "image/png" },
    { ...valid, mime: "image/jpeg" },
    { ...valid, content: Buffer.from([0xff, 0xfe]).toString("base64") },
    { ...valid, content: "%%%" },
    { ...valid, checksum: hash("different bytes") },
  ])
    assert.throws(
      () => validateFile(bad),
      (error) => error.code === "file",
    );
});

test("The full export budget rejects ordinary mutations while a private organization export remains available", async () => {
  const record = envelope("projects");
  const f = fixture(
    record,
    { role: "owner" },
    [],
    [record],
    [],
    async (sql) => {
      if (sql.startsWith("SELECT sum(size) AS size FROM ("))
        return { rows: [{ size: 60 * 1024 * 1024 + 1 }] };
      if (/^SELECT \* FROM os_(comments|events|reports)\b/.test(sql))
        return { rows: [] };
      if (
        sql.startsWith("SELECT * FROM os_records") &&
        sql.includes("deleted_at IS NOT NULL")
      )
        return { rows: [] };
      if (
        sql.startsWith("SELECT id,record_id AS") ||
        sql.startsWith("SELECT id,provider,name,config")
      )
        return { rows: [] };
    },
  );
  const mutation = await f.call(
    `modules/projects/records/${record.id}`,
    "PATCH",
    {
      revision: record.revision,
      data: { ...record.data, title: "A change over quota" },
    },
  );
  assert.equal(mutation.status, 422);
  assert.equal((await mutation.json()).code, "quota");
  // Actual transaction rollback is separately exercised by the Postgres suite.
  const exported = await f.call("export");
  assert.equal(exported.status, 200);
  assert.equal((await exported.json()).records.length, 1);
});

test("Access revocation remains possible with minimal audit reserve and after that reserve is exhausted", async () => {
  const originalWarn = console.warn,
    warnings = [];
  console.warn = (...values) => warnings.push(values.join(" "));
  try {
    for (const usage of [60.5 * 1024 * 1024, 61 * 1024 * 1024 + 1]) {
      const events = [],
        c = {
          query: async (sql, args) => {
            if (sql.startsWith("SELECT sum(size) AS size FROM ("))
              return { rows: [{ size: usage }] };
            if (sql.startsWith("INSERT INTO os_events")) {
              events.push({ action: args[2], detail: JSON.parse(args[5]) });
              return { rows: [] };
            }
            throw new Error("Unexpected quota test query: " + sql);
          },
        };
      for (const action of [
        "membership.revoked",
        "membership.changed",
        "invitation.revoked",
        "integration.disabled",
      ]) {
        await appendAudit(c, org, user, action, null, {
          userId: "affected-member",
          id: "affected-connection",
          previousRole: "contributor",
          role: null,
          body: "Sensitive working content must not enter emergency audit.",
        });
      }
      if (usage < 61 * 1024 * 1024) {
        assert.equal(events.length, 4);
        assert.ok(events.every((event) => event.detail.quotaReserve === true));
        assert.doesNotMatch(
          JSON.stringify(events),
          /Sensitive working content/,
        );
      } else assert.equal(events.length, 0);
      await assert.rejects(
        () => appendAudit(c, org, user, "record.updated"),
        (error) => error.code === "quota",
      );
    }
    assert.equal(warnings.length, 4);
    assert.doesNotMatch(
      warnings.join(" "),
      /affected-member|affected-connection|test-reader|@|token/i,
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("The central active-record limit also protects bulk callers of saveRecord", async () => {
  let writes = 0;
  const c = {
    query: async (sql) => {
      if (
        sql ===
          "SELECT s.* FROM os_task_recurrence_series s WHERE s.org_id=$1 AND (s.root_record_id=$2 OR EXISTS(SELECT 1 FROM os_task_recurrence_occurrences o WHERE o.org_id=s.org_id AND o.series_id=s.id AND (o.source_record_id=$2 OR o.generated_record_id=$2)))" ||
        sql ===
          "SELECT * FROM os_task_recurrence_series WHERE org_id=$1 ORDER BY id" ||
        sql ===
          "SELECT packet FROM os_task_recurrence_occurrences WHERE org_id=$1 ORDER BY series_id,sequence" ||
        sql ===
          "SELECT 1 FROM os_task_recurrence_series WHERE org_id=$1 LIMIT 1" ||
        sql === "SELECT * FROM os_resource_directory_history WHERE org_id=$1 ORDER BY row_kind,capture_id,binding_id,sequence,id"
      )
        return { rows: [] };
      if (
        sql === "SELECT count(*) FROM os_task_recurrence_series WHERE org_id=$1" ||
        sql === "SELECT count(*) AS count FROM os_resource_directory_history WHERE org_id=$1"
      )
        return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT COALESCE(sum(octet_length(data::text))"))
        return { rows: [{ size: 1000, count: 2000 }] };
      writes++;
      return { rows: [] };
    },
  };
  await assert.rejects(
    () => saveRecord(c, envelope("projects")),
    (error) => error.code === "quota",
  );
  assert.equal(writes, 0);
});
