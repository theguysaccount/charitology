// Exercise the real authenticated handler with an explicit, bounded SQL fixture.
// Synthetic example.invalid data only; no database/provider/network mutations.
import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../lib/handler.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { csrf, hash } from "../lib/security.mjs";
const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-migration-handler-secret-over-thirty-two-characters",
};
const org = "migration-org",
  user = "migration-operator";
const target = {
  id: org,
  name: "Synthetic destination",
  currency: "CAD",
  time_zone: "Pacific/Auckland",
};
const session = {
  session: { id: "synthetic-migration-session" },
  user: { id: user, email: "migration-operator@example.invalid" },
};
function legacy() {
  return {
    format: "charitology.charity-os",
    version: 1,
    exportedAt: "2026-10-26T12:00:00Z",
    workspace: {
      organization: "Synthetic source",
      mission: "Synthetic intended change.",
      community: "PRIVATE COMMUNITY",
      currency: "USD",
      projects: [
        {
          id: "p",
          title: "Synthetic project",
          status: "complete",
          owner: "PRIVATE OWNER",
          due: "2026-11-01",
          depth: null,
          budget: 12.29,
          spent: 0,
          goal: "Synthetic goal.",
          notes: "PRIVATE PROJECT NOTES",
        },
      ],
      grants: [
        {
          id: "g",
          title: "Synthetic grant",
          funder: "Synthetic funder",
          projectId: "p",
          status: "awarded",
          requested: 12.29,
          awarded: 10,
          deadline: "",
          owner: "",
          next: "",
          notes: "PRIVATE GRANT NOTES",
        },
      ],
      tasks: [
        {
          id: "t",
          title: "Synthetic task",
          projectId: "p",
          status: "done",
          priority: "high",
          due: "",
          owner: "",
          notes: "",
        },
      ],
      outcomes: [
        {
          id: "o",
          date: "2026-10-25",
          projectId: "p",
          indicator: "Synthetic count",
          value: 0,
          unit: "",
          evidence: "independent",
          source: "",
          notes: "PRIVATE OUTCOME NOTES",
        },
      ],
    },
  };
}
function fixture({
  role = "owner",
  loggedIn = true,
  membership = true,
  occupied = 0,
  intakeOccupied = 0,
} = {}) {
  let activeRole = role,
    authenticated = loggedIn;
  const state = {
    records: new Map(),
    previews: new Map(),
    events: [],
    queryCount: 0,
    transactions: 0,
    occupied,
  };
  const c = {
    query: async (sql, args = []) => {
      state.queryCount++;
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
        return {
          rows:
            membership && args[0] === org && args[1] === user
              ? [
                  {
                    user_id: user,
                    role: activeRole,
                    program_ids: [],
                    revision: 1,
                  },
                ]
              : [],
        };
      if (sql.startsWith("SELECT * FROM os_orgs"))
        return { rows: args[0] === org ? [target] : [] };
      if (
        sql.startsWith(
          "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NULL",
        )
      )
        return {
          rows: [...state.records.values()].filter((r) => !r.deleted_at),
        };
      if (sql.startsWith("SELECT count(*) AS count FROM os_records"))
        return { rows: [{ count: state.records.size + state.occupied }] };
      if (sql.startsWith("SELECT count(*) FROM os_integrations"))
        return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT (SELECT count(*) FROM os_publications"))
        return { rows: [{ count: intakeOccupied }] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
      if (sql.startsWith("DELETE FROM os_previews")) {
        for (const [id, p] of state.previews)
          if (!p.committed_at && p.expires_at <= new Date())
            state.previews.delete(id);
        return { rows: [] };
      }
      if (sql.startsWith("SELECT count(*) FILTER")) {
        const pending = [...state.previews.values()].filter(
            (p) => !p.committed_at,
          ),
          committed = [...state.previews.values()].filter(
            (p) => p.committed_at,
          );
        const size = (rows) =>
          rows.reduce(
            (n, p) => n + Buffer.byteLength(JSON.stringify(p.payload)),
            0,
          );
        return {
          rows: [
            {
              pending_count: pending.length,
              pending_bytes: size(pending),
              committed_count: committed.length,
              committed_bytes: size(committed),
              candidate_bytes: Buffer.byteLength(args[1]),
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO os_previews")) {
        const [orgId, id, actor, kind, payload, checksum, base] = args;
        assert.equal(orgId, org);
        assert.equal(actor, user);
        state.previews.set(id, {
          org_id: orgId,
          id,
          actor_id: actor,
          payload: JSON.parse(payload),
          checksum,
          base_revision: base,
          committed_at: null,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 60_000),
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT * FROM os_previews")) {
        const p = state.previews.get(args[1]);
        return {
          rows:
            p &&
            p.org_id === args[0] &&
            p.actor_id === args[2] &&
            p.expires_at > new Date()
              ? [p]
              : [],
        };
      }
      if (sql.startsWith("UPDATE os_previews SET committed_at")) {
        state.previews.get(args[1]).committed_at = new Date();
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT payload FROM os_previews")) {
        const p = state.previews.get(args[1]),
          pending = sql.includes("committed_at IS NULL");
        return {
          rows:
            p?.org_id === args[0] &&
            (pending
              ? !p.committed_at && p.expires_at > new Date()
              : p.committed_at)
              ? [{ payload: p.payload }]
              : [],
        };
      }
      if (sql.startsWith("SELECT id,checksum,created_at"))
        return {
          rows: [...state.previews.values()]
            .filter((p) => p.org_id === args[0] && p.committed_at)
            .map((p) => ({
              id: p.id,
              checksum: p.checksum,
              createdAt: p.created_at,
              committedAt: p.committed_at,
            })),
        };
      if (sql.startsWith("SELECT COALESCE(sum(octet_length(data::text))"))
        return {
          rows: [
            {
              size: [...state.records.values()].reduce(
                (sum, r) => sum + Buffer.byteLength(JSON.stringify(r.data)),
                0,
              ),
              count: [...state.records.keys()].filter((id) => id !== args[1])
                .length,
            },
          ],
        };
      if (sql.startsWith("SELECT sum(size) AS size FROM ("))
        return { rows: [{ size: 0 }] };
      if (sql.startsWith("INSERT INTO os_records")) {
        const [
          orgId,
          id,
          moduleId,
          data,
          status,
          ownerId,
          revision,
          approval,
          snapshot,
          lastEditor,
          source,
        ] = args;
        state.records.set(id, {
          org_id: orgId,
          id,
          module_id: moduleId,
          data: JSON.parse(data),
          status,
          owner_id: ownerId,
          revision,
          approval: approval ? JSON.parse(approval) : null,
          snapshot: snapshot ? JSON.parse(snapshot) : null,
          last_editor_id: lastEditor,
          source: source ? JSON.parse(source) : null,
          created_at: new Date(),
          updated_at: new Date(),
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO os_events")) {
        state.events.push({
          action: args[2],
          recordId: args[3],
          moduleId: args[4],
          detail: JSON.parse(args[5]),
        });
        return { rows: [], rowCount: 1 };
      }
      throw new Error("Unexpected migration fixture query: " + sql);
    },
  };
  const db = {
    tx: async (actor, orgId, fn) => {
      assert.equal(actor, user);
      assert.ok([org, "another-org"].includes(orgId));
      state.transactions++;
      const before = structuredClone({
        records: state.records,
        previews: state.previews,
        events: state.events,
      });
      try {
        return await fn(c);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
    limit: async () => {
      throw Error(
        "Unexpected rate-limit operation for this bounded import test.",
      );
    },
  };
  const handle = createHandler({
    settings,
    db,
    auth: { api: { getSession: async () => (authenticated ? session : null) } },
    send: async () => {
      throw Error("An import must never send email.");
    },
  });
  async function call(
    tail,
    { method = "POST", input, headers = {}, organizationId = org } = {},
  ) {
    const h = new Headers(
      method === "GET"
        ? {}
        : {
            origin: settings.origin,
            "x-csrf-token": csrf(session.session.id, settings.secret),
            "content-type": "application/json",
          },
    );
    for (const [key, value] of Object.entries(headers)) {
      if (value === null) h.delete(key);
      else h.set(key, value);
    }
    const response = await handle(
      new Request(`${settings.origin}/api/orgs/${organizationId}/${tail}`, {
        method,
        headers: h,
        ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
      }),
    );
    const value = await response.json();
    return { response, value };
  }
  return {
    state,
    call,
    setRole: (value) => {
      activeRole = value;
    },
    setAuthenticated: (value) => {
      authenticated = value;
    },
  };
}
test("real legacy-preview route requires a live session, exact Origin, CSRF and organization administrator", async () => {
  for (const headers of [
    { origin: "https://other.example.invalid" },
    { origin: "null" },
    { origin: null },
    { "x-csrf-token": null },
    { "x-csrf-token": "wrong" },
  ]) {
    const f = fixture(),
      r = await f.call("import/preview", {
        input: { backup: legacy() },
        headers,
      });
    assert.equal(r.response.status, 403);
    assert.equal(f.state.queryCount, 0);
    assert.equal(f.state.previews.size, 0);
  }
  for (const role of [
    "contributor",
    "program_lead",
    "board_reader",
    "external_reviewer",
  ]) {
    const f = fixture({ role }),
      r = await f.call("import/preview", { input: { backup: legacy() } });
    assert.equal(r.response.status, 403);
    assert.equal(r.value.code, "role");
    assert.equal(f.state.previews.size, 0);
  }
  const signedOut = fixture({ loggedIn: false }),
    noSession = await signedOut.call("import/preview", {
      input: { backup: legacy() },
    });
  assert.equal(noSession.response.status, 401);
  assert.equal(signedOut.state.transactions, 0);
  const missingMembership = fixture({ membership: false }),
    noMembership = await missingMembership.call("import/preview", {
      input: { backup: legacy() },
    });
  assert.equal(noMembership.response.status, 403);
  assert.equal(missingMembership.state.previews.size, 0);
});
test("preview uses actual destination settings, returns structured review warnings, and privately preserves the source without writing records", async () => {
  const f = fixture({ role: "admin" }),
    original = legacy();
  original.workspace.projects[0].unsupportedHistory =
    "PRIVATE UNSUPPORTED HISTORY";
  const r = await f.call("import/preview", {
    input: {
      backup: original,
      organization: {
        name: "Untrusted override",
        currency: "JPY",
        time_zone: "UTC",
      },
    },
  });
  assert.equal(r.response.status, 200);
  assert.equal(r.value.summary.accepted, 9);
  assert.equal(r.value.summary.migration.sourceRecords, 4);
  assert.equal(r.value.summary.migration.archivedObservationMeasurements, 1);
  assert.ok(
    r.value.warnings.some(
      (w) =>
        w.sourceId === "o" &&
        w.code === "observation_needs_review" &&
        typeof w.field === "string" &&
        typeof w.reason === "string",
    ),
  );
  assert.ok(r.value.warnings.some((w) => w.code === "currency_not_converted"));
  assert.equal(r.value.issues.length, 0);
  const saved = f.state.previews.get(r.value.previewId);
  assert.deepEqual(saved.payload.organization, {
    name: target.name,
    currency: "CAD",
    timeZone: "Pacific/Auckland",
  });
  assert.deepEqual(saved.payload.migration.sourceBackup, original);
  assert.equal(saved.payload.migration.inputCanonicalHash, hash(original));
  assert.equal(saved.checksum, saved.payload.checksum);
  assert.doesNotThrow(() => validateBackup(saved.payload, org, user));
  const responseText = JSON.stringify(r.value);
  for (const content of [
    "PRIVATE UNSUPPORTED HISTORY",
    "PRIVATE PROJECT NOTES",
    "PRIVATE COMMUNITY",
    "PRIVATE OWNER",
  ])
    assert.equal(responseText.includes(content), false);
  assert.equal(Object.hasOwn(r.value, "backup"), false);
  assert.equal(Object.hasOwn(r.value, "records"), false);
  assert.equal(f.state.records.size, 0);
  assert.equal(f.state.events.length, 0);
  const active = JSON.stringify(saved.payload.records);
  assert.equal(active.includes("PRIVATE"), false);
  assert.ok(
    saved.payload.records.every(
      (record) =>
        record.approval === null &&
        record.snapshot === null &&
        record.moduleId !== "accounting",
    ),
  );
});
test("explicit commit uses only the stored preview, retains admin-only source archives and cannot replay", async () => {
  const f = fixture(),
    original = legacy(),
    p = await f.call("import/preview", { input: { backup: original } });
  assert.equal(
    (await f.call(`backups/imports/${p.value.previewId}`, { method: "GET" }))
      .response.status,
    404,
    "uncommitted previews are not completed archives",
  );
  const committed = await f.call("import/commit", {
    input: {
      previewId: p.value.previewId,
      backup: { ignored: "A commit cannot replace its reviewed payload." },
    },
  });
  assert.equal(committed.response.status, 200);
  assert.equal(committed.value.imported, 9);
  assert.equal(f.state.records.size, 9);
  assert.ok(
    [...f.state.records.values()].every(
      (r) => r.owner_id === user && r.approval === null && r.snapshot === null,
    ),
  );
  assert.equal(f.state.records.get("p").status, "planned");
  assert.equal(f.state.records.get("g").status, "prospect");
  assert.equal(f.state.records.get("o").data.kind, "indicator");
  const budget = [...f.state.records.values()].find(
    (r) => r.module_id === "finance",
  );
  assert.deepEqual(budget.data.planned, {
    minor: 1229,
    currency: "USD",
    precision: 2,
  });
  assert.equal(budget.status, "draft");
  assert.equal(
    JSON.stringify(f.state.events).includes("PRIVATE"),
    false,
    "raw source narratives do not enter the ordinary audit stream",
  );
  const listed = await f.call("backups/imports", { method: "GET" });
  assert.equal(listed.value.imports.length, 1);
  assert.equal(JSON.stringify(listed.value).includes("PRIVATE"), false);
  const archive = await f.call(`backups/imports/${p.value.previewId}`, {
    method: "GET",
  });
  assert.equal(archive.response.status, 200);
  assert.equal(archive.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(archive.value.migration.sourceBackup, original);
  f.setRole("contributor");
  assert.equal(
    (await f.call("backups/imports", { method: "GET" })).response.status,
    403,
  );
  assert.equal(
    (await f.call(`backups/imports/${p.value.previewId}`, { method: "GET" }))
      .response.status,
    403,
  );
  f.setRole("owner");
  assert.equal(
    (
      await f.call(`backups/imports/${p.value.previewId}`, {
        method: "GET",
        organizationId: "another-org",
      })
    ).response.status,
    403,
  );
  f.setAuthenticated(false);
  assert.equal(
    (await f.call(`backups/imports/${p.value.previewId}`, { method: "GET" }))
      .response.status,
    401,
  );
  f.setAuthenticated(true);
  const replay = await f.call("import/commit", {
    input: { previewId: p.value.previewId },
  });
  assert.equal(replay.response.status, 409);
  assert.equal(f.state.records.size, 9);
});
test("invalid local migration and over-cap expanded/native backups return422 without persisting a preview", async () => {
  const invalid = legacy();
  invalid.workspace.tasks[0].projectId = "missing";
  const f = fixture();
  const r = await f.call("import/preview", { input: { backup: invalid } });
  assert.equal(r.response.status, 422);
  assert.equal(r.value.code, "local_os_migration");
  assert.equal(f.state.previews.size, 0);
  assert.equal(f.state.records.size, 0);
  const large = legacy();
  large.workspace.projects = Array.from({ length: 667 }, (_, i) => ({
    ...large.workspace.projects[0],
    id: `p-${i}`,
    owner: "",
    due: "",
    notes: "",
  }));
  large.workspace.grants =
    large.workspace.tasks =
    large.workspace.outcomes =
      [];
  const expanded = await f.call("import/preview", { input: { backup: large } });
  assert.equal(expanded.response.status, 422);
  assert.equal(expanded.value.code, "backup");
  assert.equal(f.state.previews.size, 0);
  const native = makeBackup(
    target,
    Array.from({ length: 2001 }, (_, i) => ({
      id: `native-${i}`,
      moduleId: "organization",
      data: { title: "Synthetic context", kind: "profile" },
    })),
  );
  const oversized = await f.call("import/preview", {
    input: { backup: native },
  });
  assert.equal(oversized.response.status, 422);
  assert.equal(f.state.previews.size, 0);
});
test("occupied organizations expose a blocking issue and reject commit while preserving original preview data", async () => {
  const f = fixture({ occupied: 1 }),
    p = await f.call("import/preview", { input: { backup: legacy() } });
  assert.equal(p.response.status, 200);
  assert.equal(p.value.summary.rejected, 1);
  assert.equal(p.value.issues[0].field, "organization");
  const r = await f.call("import/commit", {
    input: { previewId: p.value.previewId },
  });
  assert.equal(r.response.status, 409);
  assert.equal(r.value.code, "restore_conflict");
  assert.equal(f.state.records.size, 0);
  assert.equal(f.state.previews.get(p.value.previewId).committed_at, null);
});
test("an organization containing only recovered intake cannot overwrite its private queue during restore", async () => {
  const f = fixture({ intakeOccupied: 1 });
  const p = await f.call("import/preview", { input: { backup: legacy() } });
  assert.equal(p.response.status, 200);
  assert.equal(p.value.summary.rejected, 1);
  const committed = await f.call("import/commit", {
    input: { previewId: p.value.previewId },
  });
  assert.equal(committed.response.status, 409);
  assert.equal(committed.value.code, "restore_conflict");
  assert.equal(f.state.records.size, 0);
  assert.equal(f.state.previews.get(p.value.previewId).committed_at, null);
});
test("native shared backups retain the established preview/commit contract and reset forged approval state", async () => {
  const f = fixture(),
    backup = makeBackup(target, [
      {
        id: "native-task",
        moduleId: "projects",
        status: "done",
        revision: 99,
        approval: { actor: "untrusted" },
        data: {
          title: "Synthetic native task",
          kind: "task",
          priority: "normal",
        },
      },
    ]);
  const p = await f.call("import/preview", { input: { backup } });
  assert.equal(p.response.status, 200);
  assert.equal(p.value.summary.accepted, 1);
  assert.equal(p.value.summary.migration, undefined);
  assert.deepEqual(p.value.warnings, []);
  assert.deepEqual(f.state.previews.get(p.value.previewId).payload, backup);
  const r = await f.call("import/commit", {
    input: { previewId: p.value.previewId },
  });
  assert.equal(r.response.status, 200);
  assert.equal(r.value.imported, 1);
  const saved = f.state.records.get("native-task");
  assert.equal(saved.status, "planned");
  assert.equal(saved.revision, 1);
  assert.equal(saved.owner_id, user);
  assert.equal(saved.approval, null);
});
