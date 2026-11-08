// Exercise the real authenticated handler with an explicit, bounded SQL fixture.
// Synthetic example.invalid data only; no database/provider/network mutations.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHandler } from "../lib/handler.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { csrf, hash, stable } from "../lib/security.mjs";
import { makeIncubatorBackup } from "../lib/incubator-bridge-model.mjs";
import { GROUP_METHOD } from "../lib/participation-group-model.mjs";
import { makeParticipationGroupsBackup, PARTICIPATION_GROUP_BACKUP_DOMAIN, PARTICIPATION_GROUP_BACKUP_FORMAT } from "../lib/participation-group-backup.mjs";
import { exportParticipationGroups, restoreParticipationGroups } from "../lib/participation-group-recovery.mjs";
import { measureLearningRestoreCapacity } from "../lib/learning-capacity.mjs";
import { restoreMeasurementFixture } from "./restore-capacity-fixture.mjs";
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
  fieldOccupied = 0,
  withRestoreMeasurements = false,
} = {}) {
  let activeRole = role,
    authenticated = loggedIn;
  const state = {
    records: new Map(),
    previews: new Map(),
    groups: new Map(),
    groupReceipts: new Map(),
    events: [],
    queryCount: 0,
    transactions: 0,
    occupied,
    fieldOccupied,
  };
  const measurements = withRestoreMeasurements ? restoreMeasurementFixture() : null;
  const c = {
    query: async (sql, args = []) => {
      state.queryCount++;
      if (sql === "SELECT count(*) AS count FROM os_reports WHERE org_id=$1 AND payload->>'format'='charitology-field-response-import'") {
        assert.deepEqual(args, [org]);
        return { rows: [{ count: state.fieldOccupied }] };
      }
      // This legacy migration fixture has no participant self-report history.
      if (sql === "SELECT t.* FROM os_participation_checkins t WHERE org_id=$1 ORDER BY id") return { rows: [] };
      if (sql === "SELECT count(*) AS count FROM os_participation_checkins WHERE org_id=$1") return { rows: [{ count: 0 }] };
      // Explicit group sidecars, empty in every legacy case. These statements
      // model only the actual store's closed count/read/recovered-insert surface.
      if (sql === "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups t WHERE org_id=$1")
        return { rows: [{ count: state.groups.size, bytes: String([...state.groups.values()].reduce((n, row) => n + Buffer.byteLength(JSON.stringify(row)), 0)) }] };
      if (sql === "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts t WHERE org_id=$1")
        return { rows: [{ count: state.groupReceipts.size, bytes: String([...state.groupReceipts.values()].reduce((n, row) => n + Buffer.byteLength(JSON.stringify(row)), 0)) }] };
      if (sql === "SELECT group_id,count(*)::int AS count FROM os_participation_group_receipts WHERE org_id=$1 GROUP BY group_id ORDER BY group_id LIMIT 101") {
        const counts = new Map();
        for (const row of state.groupReceipts.values()) counts.set(row.group_id, (counts.get(row.group_id) || 0) + 1);
        return { rows: [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([group_id, count]) => ({ group_id, count })) };
      }
      const groupColumns = "org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at_exact";
      const projectedGroup = row => {
        const { created_at, updated_at, ...rest } = row;
        return { ...rest, created_at_exact: created_at, updated_at_exact: updated_at };
      };
      if (sql === "SELECT " + groupColumns + " FROM os_participation_groups WHERE org_id=$1 AND id=$2")
        return { rows: state.groups.has(args[1]) ? [projectedGroup(state.groups.get(args[1]))] : [] };
      if (sql === "SELECT " + groupColumns + " FROM os_participation_groups WHERE org_id=$1 ORDER BY id LIMIT 101")
        return { rows: [...state.groups.values()].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(projectedGroup) };
      if (sql === "SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND group_id=$2 ORDER BY command_hash LIMIT 13")
        return { rows: [...state.groupReceipts.values()].filter(row => row.group_id === args[1]) };
      if (sql === "SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 ORDER BY group_id,command_hash LIMIT 1201")
        return { rows: [...state.groupReceipts.values()] };
      if (sql === "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stored_at_exact")
        return { rows: [{ stored_at_exact: "2026-11-08T12:00:00.123456Z" }] };
      if (sql === "INSERT INTO os_participation_groups(org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,created_at,updated_at) VALUES($1,$2,'recovered',$3,NULL,'[]'::jsonb,NULL,'archived',1,NULL,$4::jsonb,$5::timestamptz,$5::timestamptz)") {
        assert.equal(args[0], org); assert(!state.groups.has(args[1]));
        state.groups.set(args[1], { org_id: args[0], id: args[1], origin_mode: "recovered", module_id: args[2], live_target_id: null,
          roster_ids: [], coordinator_intake_id: null, state: "archived", revision: 1, last_command_hash: null,
          history: JSON.parse(args[3]), created_at: args[4], updated_at: args[4] });
        return { rows: [], rowCount: 1 };
      }
      const measurement = measurements?.query(sql,args);
      if (measurement !== undefined) return measurement;
      if (withRestoreMeasurements && /^SELECT t\.\*,octet_length\(to_jsonb\(t\)::text\) AS capacity_bytes FROM os_(?:events|reports) t/.test(sql)) return {rows:[]};
      if (withRestoreMeasurements && sql === "SELECT count(*) AS count FROM os_incubator_history WHERE org_id=$1") return {rows:[{count:0}]};
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
      if (sql.startsWith("SELECT (SELECT count(*) FROM os_incubator_history WHERE org_id=$1)")) return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT (SELECT count(*) FROM os_learning_history WHERE org_id=$1)"))
        return { rows: [{ count: 0 }] }; // No feature history, reports or feature previews in this fixture.
      if (sql.startsWith("SELECT count(*) AS count,COALESCE(sum(GREATEST(octet_length(to_jsonb(t)::text),budget_bytes)),0) AS bytes FROM os_learning_history"))
        return { rows: [{ count: 0, bytes: 0 }] };
      if (sql.startsWith("SELECT * FROM os_learning_history WHERE org_id=$1 AND row_kind<>'recovered-report'"))
        return { rows: [] };
      if (sql.startsWith("SELECT h.*,octet_length(payload::text) AS learning_payload_bytes") ||
          sql.startsWith("SELECT r.*,octet_length(payload::text) AS learning_payload_bytes"))
        return { rows: [] };
      if (sql.startsWith("SELECT data,status FROM os_records WHERE org_id=$1 AND id=$2")) {
        const current = state.records.get(args[1]);
        return { rows: current ? [{ data: current.data, status: current.status }] : [] };
      }
      if (sql.startsWith("SELECT payload,origin_mode FROM os_learning_history")) return { rows: [] };
      if (sql === "SELECT count(*) AS count FROM os_participation_delivery_policies WHERE org_id=$1") return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL"))
        return { rows: [...state.records.values()].filter(record => record.deleted_at) };
      if (sql.startsWith("SELECT * FROM os_comments WHERE org_id=$1") || sql.startsWith("SELECT * FROM os_reports WHERE org_id=$1") ||
          sql.startsWith("SELECT id,record_id AS") || sql.startsWith("SELECT id,provider,name,config") ||
          sql.startsWith("SELECT id,record_id,source_revision") || sql.startsWith("SELECT id,publication_id,answers") ||
          /FROM os_participation(?:_targets|_outbox|_delivery_policies|_delivery_previews|s)\b/.test(sql))
        return { rows: [] };
      if (sql.startsWith("SELECT * FROM os_events WHERE org_id=$1 ORDER BY id"))
        return { rows: state.events };
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
      if (sql === "SELECT t.*,octet_length(to_jsonb(t)::text) AS incubator_row_bytes FROM os_incubator_history t WHERE org_id=$1 ORDER BY origin_org_id,binding_id,sequence NULLS FIRST,id LIMIT 1001") return { rows: [] }; // This fixture has no Incubator history.
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
        groups: state.groups,
        groupReceipts: state.groupReceipts,
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
    c,
    measurements,
    call,
    setRole: (value) => {
      activeRole = value;
    },
    setAuthenticated: (value) => {
      authenticated = value;
    },
  };
}
test("old backups keep their complete preview shape without Incubator counters", async () => {
  const f = fixture(), backup = makeBackup(target, []);
  const preview = await f.call("import/preview", { input: { backup } });
  assert.equal(preview.response.status, 200);
  assert.deepEqual(preview.value.summary, {
    accepted: 0, rejected: 0, skipped: 0, approvalsReset: 0,
    intakePublicationsClosed: 0, intakeRequests: 0,
    participationTargetsRecovered: 0, participationsRecovered: 0,
    participationDeliveryDisabled: false,
    taskRecurrenceSeriesRecovered: 0, taskRecurrenceOccurrencesRetained: 0,
    directoryResourceBindingsRecovered: 0, directoryResourceEventsRetained: 0,
    learningSourcesRecovered: 0, learningEventsRetained: 0, learningReportsRecovered: 0,
  });
 });
test("old backups keep their complete committed restore audit shape without Incubator counters", async () => {
  const f = fixture(), backup = makeBackup(target, []);
  const preview = await f.call("import/preview", { input: { backup } });
  assert.equal(preview.response.status, 200);
  const committed = await f.call("import/commit", { input: { previewId: preview.value.previewId } });
  assert.equal(committed.response.status, 200);
  const audits = f.state.events.filter(event => event.action === "backup.restored");
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].detail, {
    count: 0, checksum: backup.checksum, sourceArchiveId: preview.value.previewId,
    sourceHistoryCount: 0, sourceCommentCount: 0, sourceReportCount: 0,
    learningSourcesRecovered: 0, learningEventsRetained: 0, learningReportsRecovered: 0,
    intakePublicationsClosed: 0, intakeRequests: 0,
    participationTargetsRecovered: 0, participationsRecovered: 0,
    taskRecurrenceSeriesRecovered: 0, taskRecurrenceOccurrencesRetained: 0,
  });
});
test("an explicitly present empty Incubator backup keeps zero counters in actual preview and committed audit", async () => {
  const f=fixture({withRestoreMeasurements:true});
  const backup=makeBackup(target,[],{incubatorBridge:makeIncubatorBackup({sources:[],events:[]})});
  const preview=await f.call("import/preview",{input:{backup}});
  assert.equal(preview.response.status,200);
  assert.equal(preview.value.summary.incubatorSourcesRecovered,0);
  assert.equal(preview.value.summary.incubatorEventsRetained,0);
  const committed=await f.call("import/commit",{input:{previewId:preview.value.previewId}});
  assert.equal(committed.response.status,200);
  const audit=f.state.events.find(event=>event.action==="backup.restored");
  assert.equal(audit.detail.incubatorSourcesRecovered,0);
  assert.equal(audit.detail.incubatorEventsRetained,0);
});
function groupEnvelope(groups) {
  const body = { format: PARTICIPATION_GROUP_BACKUP_FORMAT, version: 1, method: GROUP_METHOD, groups };
  return { ...body, checksum: createHash("sha256").update(PARTICIPATION_GROUP_BACKUP_DOMAIN).update(stable(body)).digest("hex") };
}
function historicalGroup() {
  const id = "original_group", rosterIds = ["original_one", "original_two"], target = { targetId: "missing_original_target", moduleId: "events" };
  const first = "2026-11-07T10:00:00.123456Z", second = "2026-11-07T10:01:00.123456Z";
  return { version: 1, id, originOrgId: "original_org", moduleId: "events", targetId: target.targetId,
    rosterIds, coordinatorIntakeId: "missing_original_coordinator", createdAtExact: first,
    decisions: [
      { operation: "create", acceptedAtExact: first, result: { groupId: id, groupRevision: 1, state: "draft", target,
        rosterIds: [...rosterIds], coordinatorIntakeId: "missing_original_coordinator" } },
      { operation: "admit", acceptedAtExact: second, result: { groupId: id, groupRevision: 2, state: "admitted", selectionMode: "all",
        selected: rosterIds.map(participationId => ({ participationId, action: "confirm", resultRevision: 3, state: "confirmed",
          frozenSha256: "a".repeat(64), allocationHash: null, notificationQueued: false, auditRetained: null })),
        unselectedIds: [], reasonHashes: [], auditRetained: false } },
    ] };
}
test("group-free legacy restore projections keep the old audit detail without group counters", async () => {
  const f = fixture({ withRestoreMeasurements: true }), backup = makeBackup(target, []);
  await measureLearningRestoreCapacity(f.c, backup, { orgId: org, actorId: user });
  const detail = f.measurements.observed.get("os_events").find(event => event.action === "backup.restored").detail;
  assert.deepEqual(Object.keys(detail).sort(), ["count", "checksum", "sourceArchiveId", "sourceHistoryCount", "sourceCommentCount", "sourceReportCount",
    "learningSourcesRecovered", "learningEventsRetained", "learningReportsRecovered", "intakePublicationsClosed", "intakeRequests",
    "participationTargetsRecovered", "participationsRecovered", "taskRecurrenceSeriesRecovered", "taskRecurrenceOccurrencesRetained"].sort());
  assert.equal(f.state.groups.size, 0); assert.equal(f.state.groupReceipts.size, 0);
});
test("explicit empty group history retains zero counters in actual preview, restore audit and capacity projection", async () => {
  const f = fixture({ withRestoreMeasurements: true }), packet = groupEnvelope([]), backup = makeBackup(target, [], { participationGroups: packet });
  const before = structuredClone(backup), preview = await f.call("import/preview", { input: { backup } });
  assert.equal(preview.response.status, 200); assert.equal(preview.value.summary.participationGroupsRecovered, 0);
  assert.equal(preview.value.warnings.filter(w => w.field === "participationGroups").length, 1);
  assert.equal(f.measurements.observed.get("os_events").find(event => event.action === "backup.restored").detail.participationGroupsRecovered, 0);
  assert.deepEqual(f.state.previews.get(preview.value.previewId).payload.participationGroups, packet);
  const committed = await f.call("import/commit", { input: { previewId: preview.value.previewId } });
  assert.equal(committed.response.status, 200);
  assert.equal(f.state.events.find(event => event.action === "backup.restored").detail.participationGroupsRecovered, 0);
  assert.equal(f.state.groups.size, 0); assert.equal(f.state.groupReceipts.size, 0); assert.deepEqual(backup, before);
});
test("invalid group backup namespaces return a closed422 before any preview or restore persistence", async () => {
  for (const participationGroups of [null, [], { ...groupEnvelope([]), checksum: "0".repeat(64) },
    groupEnvelope([{ ...historicalGroup(), rosterIds: ["only_one"] }]), { ...groupEnvelope([]), actor: "must-not-be-authority" }]) {
    const f = fixture(), backup = makeBackup(target, [], { participationGroups });
    const preview = await f.call("import/preview", { input: { backup } });
    assert.equal(preview.response.status, 422); assert.match(preview.value.code, /^participation_group/);
    assert.equal(f.state.previews.size, 0); assert.equal(f.state.records.size, 0); assert.equal(f.state.events.length, 0);
    assert.equal(f.state.groups.size, 0); assert.equal(f.state.groupReceipts.size, 0);
  }
});
test("an existing group-only destination blocks even a group-free legacy restore without changing history", async () => {
  const f = fixture(), history = historicalGroup(), stamp = "2026-11-08T12:00:00.123456Z";
  const saved = { org_id: org, id: history.id, origin_mode: "recovered", module_id: history.moduleId, live_target_id: null, roster_ids: [],
    coordinator_intake_id: null, state: "archived", revision: 1, last_command_hash: null, history, created_at: stamp, updated_at: stamp };
  f.state.groups.set(history.id, structuredClone(saved));
  const preview = await f.call("import/preview", { input: { backup: makeBackup(target, []) } });
  assert.equal(preview.response.status, 200); assert.equal(preview.value.summary.rejected, 1);
  assert.deepEqual(preview.value.issues.map(issue => issue.field), ["organization"]);
  const committed = await f.call("import/commit", { input: { previewId: preview.value.previewId } });
  assert.equal(committed.response.status, 409); assert.equal(committed.value.code, "restore_conflict");
  assert.deepEqual(f.state.groups.get(history.id), saved); assert.equal(f.state.groupReceipts.size, 0);
  assert.equal(f.state.records.size, 0); assert.equal(f.state.events.length, 0);
  assert.equal(f.state.previews.get(preview.value.previewId).committed_at, null);
});
test("a destination with a retained live group receipt refuses restore and preserves both families", async () => {
  const f = fixture(), history = historicalGroup(), decision = history.decisions[0], sha = "b".repeat(64);
  const receipt = { version: 1, groupId: history.id, operation: "create", commandHash: sha, requestHash: sha,
    authority: { actorSha256: sha, sessionSha256: sha, membershipSha256: sha,
      memberCreatedAtExact: decision.acceptedAtExact, restoreEpochSha256: sha }, reviewSha256: null,
    acceptedAtExact: decision.acceptedAtExact, result: decision.result };
  f.state.groups.set(history.id, { org_id: org, id: history.id, origin_mode: "live", module_id: history.moduleId,
    live_target_id: history.targetId, roster_ids: [...history.rosterIds], coordinator_intake_id: history.coordinatorIntakeId,
    state: "draft", revision: 1, last_command_hash: sha, history: null, created_at: decision.acceptedAtExact, updated_at: decision.acceptedAtExact });
  f.state.groupReceipts.set(sha, { org_id: org, command_hash: sha, group_id: history.id, receipt });
  const before = structuredClone({ groups: f.state.groups, receipts: f.state.groupReceipts });
  const preview = await f.call("import/preview", { input: { backup: makeBackup(target, []) } });
  assert.equal(preview.response.status, 200); assert.equal(preview.value.summary.rejected, 1);
  const committed = await f.call("import/commit", { input: { previewId: preview.value.previewId } });
  assert.equal(committed.response.status, 409); assert.equal(committed.value.code, "restore_conflict");
  assert.deepEqual(f.state.groups, before.groups); assert.deepEqual(f.state.groupReceipts, before.receipts);
  assert.equal(f.state.records.size, 0); assert.equal(f.state.events.length, 0);
  assert.equal(f.state.previews.get(preview.value.previewId).committed_at, null);
});
test("actual restore adapter retains orphan decisions as an inactive header without live links or receipts", async () => {
  const f = fixture({ withRestoreMeasurements: true }), history = historicalGroup(), packet = makeParticipationGroupsBackup([history]),
    backup = makeBackup(target, [], { participationGroups: packet });
  const before = structuredClone(packet), preview = await f.call("import/preview", { input: { backup } });
  assert.equal(preview.response.status, 200); assert.equal(preview.value.summary.participationGroupsRecovered, 1);
  const projected = f.measurements.observed.get("os_participation_groups");
  assert.equal(projected.length, 1); assert.equal(projected[0].origin_mode, "recovered"); assert.deepEqual(projected[0].history, history);
  const committed = await f.call("import/commit", { input: { previewId: preview.value.previewId } });
  assert.equal(committed.response.status, 200); assert.equal(f.state.groups.size, 1); assert.equal(f.state.groupReceipts.size, 0);
  const row = f.state.groups.get(history.id);
  assert.equal(row.origin_mode, "recovered"); assert.equal(row.state, "archived"); assert.equal(row.revision, 1);
  for (const key of ["live_target_id", "coordinator_intake_id", "last_command_hash"]) assert.equal(row[key], null);
  assert.deepEqual(row.roster_ids, []); assert.deepEqual(row.history, history); assert.equal(row.created_at, "2026-11-08T12:00:00.123456Z");
  assert.equal(f.state.events.find(event => event.action === "backup.restored").detail.participationGroupsRecovered, 1);
  assert.deepEqual(await exportParticipationGroups(f.c, org), packet);
  await assert.rejects(restoreParticipationGroups(f.c, org, packet), error => error.code === "restore_conflict");
  assert.equal(f.state.groups.size, 1); assert.equal(f.state.groupReceipts.size, 0); assert.deepEqual(packet, before);
});
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

test("existing aggregate history blocks a FIELD-free legacy restore at preview and commit", async () => {
  const blocked = fixture({ fieldOccupied: 1 });
  const first = await blocked.call("import/preview", { input: { backup: legacy() } });
  assert.equal(first.response.status, 200);
  assert.equal(first.value.summary.rejected, 1);
  assert.equal(blocked.state.records.size, 0);

  const changed = fixture();
  const preview = await changed.call("import/preview", { input: { backup: legacy() } });
  assert.equal(preview.response.status, 200);
  changed.state.fieldOccupied = 1;
  const commit = await changed.call("import/commit", { input: { previewId: preview.value.previewId } });
  assert.equal(commit.response.status, 409);
  assert.equal(commit.value.code, "restore_conflict");
  assert.equal(changed.state.records.size, 0);
  assert.equal(changed.state.previews.get(preview.value.previewId).committed_at, null);
});

test("malformed reserved aggregate reports fail through the authenticated restore handler", async () => {
  const f = fixture();
  const backup = makeBackup(target, [], { reports: [{ payload: { format: "charitology-field-response-import", version: 2 } }] });
  const result = await f.call("import/preview", { input: { backup } });
  assert.equal(result.response.status, 422);
  assert.equal(f.state.previews.size, 0);
  assert.equal(f.state.records.size, 0);
});
