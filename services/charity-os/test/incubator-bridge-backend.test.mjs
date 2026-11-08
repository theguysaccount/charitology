import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { INCUBATOR_ADAPTER } from "../lib/incubator-native.mjs";
import { incubatorHash as H } from "../lib/incubator-bridge-json.mjs";
import {
  incubatorMetadata,
  incubatorQuery,
  incubatorCommitInput,
  readIncubatorJSON,
} from "../lib/incubator-bridge-requests.mjs";
import {
  incubatorUploadPart,
  incubatorUploadActor,
  assembledIncubatorUpload,
} from "../lib/incubator-bridge-uploads.mjs";
import {
  currentIncubatorMember,
  currentIncubatorProgram,
  incubatorAuthority,
  requireIncubatorAuthority,
} from "../lib/incubator-bridge-access.mjs";
import {
  duplicateIncubatorBindings,
  loadIncubatorInventory,
} from "../lib/incubator-bridge-store.mjs";
import {
  restoredIncubatorBridge,
  restoreIncubatorBridge,
  measureIncubatorBackup,
} from "../lib/incubator-bridge-backup.mjs";
import {
  foldIncubatorHistory,
  makeIncubatorBackup,
  headPin,
} from "../lib/incubator-bridge-model.mjs";
import { incubatorBridgeRoutes } from "../lib/incubator-bridge.mjs";
import {
  sourceFixture,
  eventFixture,
  entry,
  programRecord,
  clone,
} from "./incubator-fixtures.mjs";
import { hash } from "../lib/security.mjs";
import { modulePermissions } from "../lib/modules.mjs";

const session = { user: { id: "actor-a" }, session: { id: "session-a" } },
  member = {
    userId: "actor-a",
    role: "owner",
    programIds: [],
    revision: 1,
    createdAtExact: "2026-11-07T10:00:00.000000Z",
    membershipSha256: "a".repeat(64),
  };
const pin = { recordId: "program-a", revision: 1, dataSha256: "b".repeat(64) };
test("closed wire metadata, commit and cursor grammar admit no caller candidates or alternate authority", () => {
  const metadata = {
    version: 1,
    adapter: INCUBATOR_ADAPTER,
    selection: { projectId: "p", milestoneId: "m" },
    target: { kind: "new", program: pin, duplicatePolicy: "refuse" },
  };
  assert.deepEqual(incubatorMetadata(metadata), metadata);
  for (const changed of [
    { ...metadata, approval: true },
    { ...metadata, target: { ...metadata.target, candidates: [] } },
    { ...metadata, target: { ...metadata.target, duplicatePolicy: "ignore" } },
  ])
    assert.throws(() => incubatorMetadata(changed));
  const input = {
    previewId: "p",
    reviewSha256: "c".repeat(64),
    commandKey: randomUUID(),
  };
  assert.deepEqual(incubatorCommitInput(input), input);
  assert.throws(() =>
    incubatorCommitInput({
      ...input,
      commandKey: input.commandKey.toUpperCase(),
    }),
  );
  assert.throws(() => incubatorCommitInput({ ...input, event: {} }));
  assert.throws(() =>
    incubatorQuery(
      new URL(
        "https://example.invalid/api/orgs/o/incubator-bridge/bindings?cursor=a&cursor=b",
      ),
      ["cursor"],
    ),
  );
});
test("actual bounded request reader refuses duplicate JSON and cancels the underlying held stream", async (t) => {
  const request = (text) =>
    new Request("http://localhost/api/incubator", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
  await assert.rejects(readIncubatorJSON(request('{"a":1,"\\u0061":2}')));
  await assert.rejects(
    readIncubatorJSON(request(" ".repeat(129)), 128),
    (e) => e.status === 413,
  );
  let cancelled = false;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("{}"));
    },
    cancel() {
      cancelled = true;
    },
  });
  const pending = readIncubatorJSON(
    new Request("http://localhost/incubator", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    }),
  );
  const refused = assert.rejects(
    pending,
    (e) => e.status === 408 && e.code === "incubator_request",
  );
  await new Promise(setImmediate);
  t.mock.timers.tick(30000);
  await refused;
  assert.equal(cancelled, true);
});
test("six bounded canonical parts and purpose/session identities cannot consume other uploads", async () => {
  assert.doesNotThrow(() =>
    incubatorUploadPart({
      index: 0,
      total: 1,
      chunk: Buffer.from("{}").toString("base64"),
    }),
  );
  for (const input of [
    { index: 0, total: 7, chunk: "e30=" },
    { index: 0, total: 2, chunk: "e30=" },
    { index: 0, total: 1, chunk: "e31=" },
  ])
    assert.throws(() => incubatorUploadPart(input));
  assert.notEqual(
    incubatorUploadActor("org-a", member, session),
    incubatorUploadActor("org-b", member, session),
  );
  assert.notEqual(
    incubatorUploadActor("org-a", member, session),
    incubatorUploadActor("org-a", member, {
      ...session,
      session: { id: "session-b" },
    }),
  );
  const native = Buffer.from("{}"),
    metadata = {
      version: 1,
      adapter: INCUBATOR_ADAPTER,
      selection: { projectId: "p", milestoneId: "m" },
      target: { kind: "new", program: pin, duplicatePolicy: "refuse" },
    };
  const input = {
    metadata,
    upload: {
      uploadId: "a".repeat(32),
      byteLength: native.length,
      sha256: hash(native),
    },
  };
  const c = {
    query: async () => ({
      rows: [{ part: 0, total: 1, bytes: native, checksum: hash(native) }],
    }),
  };
  assert.deepEqual(
    (
      await assembledIncubatorUpload(c, {
        org: "org-a",
        member,
        session,
        input,
      })
    ).native,
    native,
  );
  await assert.rejects(
    assembledIncubatorUpload(
      { query: async () => ({ rows: [] }) },
      { org: "org-a", member, session, input },
    ),
    (e) => e.code === "incubator_upload",
  );
});
test("fresh session, exact membership and real permission intersections gate every bridge role", async () => {
  const roles = [
    "owner",
    "admin",
    "program_lead",
    "grants_lead",
    "finance_reviewer",
    "contributor",
    "board_reader",
    "external_reviewer",
  ];
  for (const role of roles) {
    const c = {
      query: async (sql) =>
        sql.includes('FROM "session"')
          ? { rowCount: 1, rows: [{}] }
          : {
              rows: [
                {
                  user_id: "actor-a",
                  role,
                  program_ids: [],
                  revision: 2,
                  created_exact: member.createdAtExact,
                },
              ],
            },
    };
    if (
      ["board_reader", "external_reviewer"].includes(role) ||
      !modulePermissions("projects", role).write ||
      !modulePermissions("programs", role).read
    )
      await assert.rejects(
        currentIncubatorMember(c, "org-a", session),
        (e) => e.status === 403,
      );
    else
      assert.equal(
        (await currentIncubatorMember(c, "org-a", session)).role,
        role,
      );
  }
  await assert.rejects(
    currentIncubatorMember(
      { query: async () => ({ rowCount: 0, rows: [] }) },
      "org-a",
      session,
    ),
    (e) => e.status === 401,
  );
  const authority = incubatorAuthority(member, session, "d".repeat(64));
  requireIncubatorAuthority(authority, member, session, "d".repeat(64));
  for (const changed of [
    { ...member, revision: 2, membershipSha256: "e".repeat(64) },
    { ...member, createdAtExact: "2026-11-07T10:00:01.000000Z" },
  ])
    assert.throws(() =>
      requireIncubatorAuthority(authority, changed, session, "d".repeat(64)),
    );
});
test("current unapproved planned program is sufficient, but deletion, kind, scope and exact pins remain guarded", async () => {
  const program = programRecord(),
    raw = {
      org_id: "org-a",
      id: program.id,
      module_id: "programs",
      data: program.data,
      status: "draft",
      owner_id: "actor-a",
      revision: 1,
      approval: null,
      snapshot: null,
      source: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  const currentPin = {
    recordId: program.id,
    revision: 1,
    dataSha256: H("program-data", program.data),
  };
  const c = { query: async () => ({ rows: [raw] }) };
  assert.equal(
    (await currentIncubatorProgram(c, "org-a", currentPin, member)).status,
    "draft",
  );
  await assert.rejects(
    currentIncubatorProgram(c, "org-a", { ...currentPin, revision: 2 }, member),
    (e) => e.code === "incubator_stale",
  );
  await assert.rejects(
    currentIncubatorProgram(c, "org-a", currentPin, {
      ...member,
      programIds: ["other"],
    }),
    (e) => e.status === 404,
  );
});
test("adopted live selection is an existing-copy warning without inventing a local native capture", () => {
  const source = sourceFixture(),
    event = eventFixture(source),
    adopted = eventFixture(source, {
      org: "org-b",
      binding: "binding-adopted",
      operation: "adopt",
      recoveredHead: headPin(event),
      suffix: "adopted",
    });
  const inventory = foldIncubatorHistory({
    sources: [source],
    events: [entry(event, "recovered"), entry(adopted)],
  });
  const binding = inventory.bindings.find(
    (value) => value.originOrgId === "org-b",
  );
  assert.equal(binding.nativeSources.length, 0);
  assert.equal(
    duplicateIncubatorBindings(inventory, {
      org: "org-b",
      programId: adopted.program.recordId,
      source,
    }).length,
    1,
  );
});
test("inactive bridge restore preserves historical receipts but never restores live mode or command authority", async () => {
  const source = sourceFixture(),
    event = eventFixture(source),
    backup = makeIncubatorBackup({ sources: [source], events: [entry(event)] });
  assert.equal(restoredIncubatorBridge(undefined), null);
  const writes = [];
  const c = {
    query: async (sql, args) => {
      if (sql.startsWith("SELECT count")) return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT *")) return { rows: [] };
      if (sql.startsWith("INSERT")) {
        writes.push(args);
        return { rows: [{ budget_bytes: 50000, actual: 10000 }] };
      }
      if (sql.startsWith("SELECT t.*"))
        return {
          rows: writes.map((args) => ({
            org_id: args[0],
            id: args[1],
            row_kind: args[2],
            origin_mode: args[3],
            origin_org_id: args[4],
            binding_id: args[5],
            sequence: args[6],
            source_version: args[7],
            program_id: args[8],
            payload: JSON.parse(args[9]),
            receipt: args[10] === null ? null : JSON.parse(args[10]),
            budget_bytes: 50000,
            incubator_row_bytes: 10000,
          })),
        };
      throw Error("Unexpected fixture query");
    },
  };
  const result = await restoreIncubatorBridge(c, "destination", backup);
  assert.deepEqual(result, { sources: 1, events: 1 });
  assert(writes.every((args) => args[3] === "recovered"));
  assert.deepEqual(JSON.parse(writes[1][10]), backup.events[0].acceptedReceipt);
  assert.equal(
    (await loadIncubatorInventory(c, "destination")).bindings[0].originMode,
    "recovered",
  );
});
test("unknown paths/methods and roles refuse before source bytes or generic request-body work", async () => {
  const db = {
    limit: async () => {},
    tx: async (_user, _org, fn) =>
      fn({
        query: async (sql) =>
          sql.includes('FROM "session"')
            ? { rowCount: 1, rows: [{}] }
            : {
                rows: [
                  {
                    user_id: "actor-a",
                    role: "board_reader",
                    program_ids: [],
                    revision: 1,
                    created_exact: member.createdAtExact,
                  },
                ],
              },
      }),
  };
  await assert.rejects(
    incubatorBridgeRoutes({
      request: new Request(
        "http://localhost/api/orgs/o/incubator-bridge/uploads",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "invalid",
        },
      ),
      url: new URL("http://localhost/api/orgs/o/incubator-bridge/uploads"),
      db,
      session,
    }),
    (e) => e.status === 403,
  );
});
