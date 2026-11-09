import { RESOURCE_RESERVATION_GUARD_SQL as reservationSql } from "../lib/resource-reservation-guards.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceRoutes,
  attendanceInput,
  readAttendanceBody,
  ATTENDANCE_METHOD,
} from "../lib/attendance-from-bookings.mjs";
import { guardParticipationWrite } from "../lib/participation-guards.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import { participationTerms } from "../lib/participation.mjs";
import { validateBackup, makeBackup } from "../lib/backup.mjs";
import { createHandler } from "../lib/handler.mjs";
import { csrf } from "../lib/security.mjs";
import { saveRecord } from "../lib/database.mjs";
import { emptyParticipationGroupsQuery } from "./fixtures/empty-participation-groups.mjs";

const clone = structuredClone,
  err = (code) => (e) => e.code === code;
const settings = { secret: "fictional-attendance-secret-only-for-tests" },
  session = { user: { id: "author" }, session: { id: "fictional-session" } };
const raw = (r) => ({
  id: r.id,
  org_id: "org",
  module_id: r.moduleId,
  data: r.data,
  status: r.status ?? "draft",
  owner_id: "author",
  last_editor_id: "author",
  revision: r.revision ?? 1,
  approval: r.approval ?? null,
  snapshot: null,
  source: null,
  created_at: new Date("2001-01-01T00:00:00.000Z"),
  updated_at: new Date("2001-01-01T00:00:00.000Z"),
  deleted_at: null,
});
function fixture(module = "events") {
  const program = raw({
    id: "program",
    moduleId: "programs",
    data: validateRecord("programs", {
      title: "Fictional program",
      kind: "program",
    }),
  });
  const source = {
    id: "target",
    orgId: "org",
    moduleId: module,
    revision: 5,
    status: "open",
    lastEditedBy: "author",
    approval: { status: "approved", revision: 5, actorId: "different-account" },
    data: validateRecord(
      module,
      {
        title: "Fictional ended occurrence",
        kind: module === "events" ? "session" : "shift",
        programId: "program",
        startAt: "2001-01-02T09:00:00Z",
        endAt: "2001-01-02T11:00:00Z",
        timeZone: "UTC",
        capacity: 10,
        participationPurpose: "Fictional operational booking.",
        organizerEmail: "fictional@example.invalid",
      },
      {
        records: [{ id: "program", moduleId: "programs", data: program.data }],
      },
    ),
  };
  const contact = raw({
    id: "contact",
    moduleId: "contacts",
    data: validateRecord("contacts", {
      title: "Fictional contact",
      kind: "person-reference",
    }),
  });
  const booking = raw({
    id: "booking",
    moduleId: module,
    status: module === "events" ? "scheduled" : "assigned",
    revision: 4,
    data: validateRecord(
      module,
      {
        title: "Fictional booking",
        kind: module === "events" ? "registration" : "assignment",
        programId: "program",
        [module === "events" ? "eventId" : "shiftId"]: "target",
        contactId: "contact",
      },
      {
        orgId: "org",
        recordId: "booking",
        status: module === "events" ? "scheduled" : "assigned",
        records: [
          { ...source },
          { id: "contact", moduleId: "contacts", data: contact.data },
          { id: "program", moduleId: "programs", data: program.data },
        ],
      },
    ),
  });
  const terms = participationTerms(source);
  const state = {
    records: new Map(
      [program, raw(source), contact, booking].map((r) => [r.id, r]),
    ),
    events: [],
    restores: [],
    member: {
      user_id: "author",
      role: "owner",
      program_ids: [],
      revision: 1,
      incarnation: "2001-01-01T00:00:00.000000Z",
    },
    live: true,
    managed: {
      target_id: "target",
      module_id: module,
      revision: 2,
      source_revision: 5,
      mode: "managed",
      recovery_block: false,
      terms,
      terms_hash: hash(terms),
      created_at: new Date("2001-01-01Z"),
    },
    ledger: [
      {
        id: "participation",
        target_id: "target",
        module_id: module,
        booking_record_id: "booking",
        contact_id: "contact",
        state: "confirmed",
        revision: 3,
        recovered: false,
        frozen: {
          terms,
          termsHash: hash(terms),
          programId: "program",
          sourceRevision: 5,
          candidateRevision: 3,
          candidateApproval: {
            status: "approved",
            revision: 3,
            actorId: "different-account",
          },
        },
        created_at: new Date("2001-01-01Z"),
      },
    ],
    quota: false,
    exportFailure: false,
    queries: [],
  };
  const result = (rows) => ({ rows: clone(rows), rowCount: rows.length });
  const c = {
    async query(sql, p = []) {
      state.queries.push(sql);
      if (sql === reservationSql.projection) return result([]);
      if (sql === reservationSql.destination) return result([{ occupied: false }]);
      const emptyGroups = emptyParticipationGroupsQuery(sql, p);
      if (emptyGroups !== undefined) return emptyGroups;
      // This attendance fixture retains no participant self-report sidecar.
      if (sql === "SELECT t.* FROM os_participation_checkins t WHERE org_id=$1 ORDER BY id") return result([]);
      if (sql === "SELECT count(*) AS count FROM os_participation_checkins WHERE org_id=$1") return result([{ count: 0 }]);
      if (sql.includes("pg_advisory_xact_lock")) return result([]);
      if (sql.startsWith('SELECT 1 FROM "session"'))
        return result(state.live ? [{}] : []);
      if (sql.includes(" AS incarnation FROM os_members"))
        return result([state.member]);
      if (sql.startsWith("SELECT * FROM os_members"))
        return result([state.member]);
      if (sql.startsWith("SELECT 1 FROM os_members"))
        return result(p[1] === state.member.user_id ? [{}] : []);
      if (sql.startsWith("SELECT record_id,max(id)::text"))
        return result(state.restores);
      if (sql.startsWith("SELECT sum(size)"))
        return result([{ size: state.quota ? 60 * 1024 * 1024 : 0 }]);
      if (sql.includes("AS size,count(*) FILTER"))
        return result([
          {
            size: 0,
            count: [...state.records.values()].filter(
              (r) => r.id !== p[1] && !r.deleted_at,
            ).length,
          },
        ]);
      if (sql.startsWith("SELECT data,status FROM os_records")) {
        const r = state.records.get(p[1]);
        return result(r ? [r] : []);
      }
      if (sql.startsWith("SELECT id FROM os_records"))
        return result(
          [...state.records.values()].filter(
            (r) =>
              r.module_id === p[1] &&
              r.data.kind === "attendance" &&
              r.data[p[2]] === p[3] &&
              r.id !== p[4],
          ),
        );
      if (sql.startsWith("SELECT * FROM os_records")) {
        if (sql.includes("data->>'kind'='attendance'"))
          return result(
            [...state.records.values()]
              .filter(
                (r) =>
                  (r.module_id === p[1] &&
                    r.data.kind === "attendance" &&
                    r.data[p[2]] === p[3]) ||
                  r.id === p[4],
              )
              .sort((a, b) => a.id.localeCompare(b.id)),
          );
        if (sql.includes("id=$2")) {
          const r = state.records.get(p[1]);
          return result(r ? [r] : []);
        }
        return result(
          [...state.records.values()].filter((r) =>
            sql.includes("deleted_at IS NOT NULL")
              ? !!r.deleted_at
              : !r.deleted_at,
          ),
        );
      }
      if (sql.startsWith("INSERT INTO os_records")) {
        state.records.set(p[1], {
          ...state.records.get(p[1]),
          org_id: p[0],
          id: p[1],
          module_id: p[2],
          data: JSON.parse(p[3]),
          status: p[4],
          owner_id: p[5],
          revision: p[6],
          approval: p[7] ? JSON.parse(p[7]) : null,
          snapshot: p[8] ? JSON.parse(p[8]) : null,
          last_editor_id: p[9],
          source: p[10] ? JSON.parse(p[10]) : null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        });
        return result([]);
      }
      if (sql.startsWith("INSERT INTO os_events")) {
        state.events.push({
          id: state.events.length + 1,
          org_id: p[0],
          actor_id: p[1],
          action: p[2],
          record_id: p[3],
          module_id: p[4],
          detail: JSON.parse(p[5]),
        });
        return result([]);
      }
      if (sql.includes("FROM os_events")) {
        if (sql.includes("attendance.draft-created")) {
          let rows = state.events.filter(
            (r) => r.action === "attendance.draft-created",
          );
          if (sql.includes("commandHash"))
            rows = rows.filter(
              (r) => r.detail.attendanceReceipt.commandHash === p[1],
            );
          else if (sql.includes("attendanceReceipt,targetId"))
            rows = rows.filter(
              (r) =>
                r.detail.attendanceReceipt.targetId === p[1] &&
                r.record_id !== p[2],
            );
          else rows = rows.filter((r) => r.record_id === p[1]);
          return result(rows);
        }
        return result(state.events);
      }
      if (sql.includes("FROM os_participation_targets"))
        return result(
          p.length === 1
            ? [state.managed]
            : [state.managed].filter((t) => p.slice(1).includes(t.target_id)),
        );
      if (sql.includes("FROM os_participations")) {
        if (sql.includes("(booking_record_id=$2 OR target_id=$2)"))
          return result(
            state.ledger.filter(
              (r) => r.booking_record_id === p[1] || r.target_id === p[1],
            ),
          );
        return result(
          state.ledger.filter(
            (r) => !sql.includes("target_id=$2") || r.target_id === p[1],
          ),
        );
      }
      if (sql.includes(" AS present")) return result([{ present: false }]);
      if (sql.includes("FROM os_orgs")) {
        if (state.exportFailure)
          throw Error("Fictional complete-export failure");
        return result([
          {
            id: "org",
            name: "Fictional organization",
            currency: "USD",
            time_zone: "UTC",
          },
        ]);
      }
      if (
        /FROM os_(?:comments|reports|files|integrations|publications|intake|participant_org_usage|participation_outbox|participation_delivery|task_recurrence|resource_directory|learning_)/.test(
          sql,
        )
      )
        return result([]);
      if (sql === "SELECT t.*,octet_length(to_jsonb(t)::text) AS incubator_row_bytes FROM os_incubator_history t WHERE org_id=$1 ORDER BY origin_org_id,binding_id,sequence NULLS FIRST,id LIMIT 1001") return result([]); // This fixture has no Incubator history.
      throw Error("Unhandled fictional SQL: " + sql);
    },
  };
  let serial = Promise.resolve();
  const tx = (fn) => {
    const task = serial.then(async () => {
      const saved = clone({ records: state.records, events: state.events });
      try {
        return await fn();
      } catch (e) {
        state.records = saved.records;
        state.events = saved.events;
        throw e;
      }
    });
    serial = task.catch(() => {});
    return task;
  };
  const call = async (action = "", input = {}, extra = {}) =>
    tx(async () => {
      const response = await attendanceRoutes({
        c,
        org: "org",
        user: "author",
        session,
        settings,
        tail:
          "participation-targets/target/attendance" +
          (action ? "/" + action : ""),
        method: action ? "POST" : "GET",
        url: new URL(
          "https://os.example.invalid/api/orgs/org/participation-targets/target/attendance",
        ),
        input,
        ...extra,
      });
      return response.json();
    });
  const prepare = async (overrides = {}) => {
    const ctx = await call();
    return call("preview", {
      contextSha256: ctx.contextSha256,
      title: "Fictional whole attendance",
      reportedAttendance: 0,
      registeredCount: null,
      walkInCount: null,
      wholeOccurrence: true,
      ...overrides,
    });
  };
  return { state, c, call, prepare, source, tx };
}
test("whole attendance input distinguishes blank, zero, subset and bounded counts", () => {
  const value = {
    contextSha256: "a".repeat(64),
    title: "Fictional",
    reportedAttendance: 0,
    registeredCount: null,
    walkInCount: null,
    wholeOccurrence: true,
  };
  assert.equal(attendanceInput(value).reportedAttendance, 0);
  for (const reportedAttendance of ["", null, -1, 0.5, 1_000_000_001])
    assert.throws(
      () => attendanceInput({ ...value, reportedAttendance }),
      err("attendance_count"),
    );
  assert.throws(
    () => attendanceInput({ ...value, wholeOccurrence: false }),
    err("attendance_fields"),
  );
  assert.throws(
    () => attendanceInput({ ...value, extra: true }),
    err("attendance_fields"),
  );
});
test("strict bounded attendance request refuses decoded duplicates, malformed UTF8 and over-cap bodies", async () => {
  const request = (b) =>
    new Request("https://os.example.invalid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: b,
    });
  await assert.rejects(
    () => readAttendanceBody(request('{"title":"A","\\u0074itle":"B"}')),
    err("attendance_fields"),
  );
  await assert.rejects(
    () => readAttendanceBody(request(new Uint8Array([0xff]))),
    err("attendance_fields"),
  );
  await assert.rejects(
    () => readAttendanceBody(request(" ".repeat(8193))),
    (e) => e.status === 413,
  );
});
for (const module of ["events", "volunteers"])
  test(
    module +
      " prepares and creates one whole count above confirmations, with no minutes, observed times or approval",
    async () => {
      const f = fixture(module),
        before = clone(f.state.ledger),
        p = await f.prepare({ reportedAttendance: 7 });
      assert.equal(p.preview.method, ATTENDANCE_METHOD);
      assert.equal(p.preview.sourceContext.confirmedPlaces, 1);
      const d = p.preview.candidate.data;
      assert.equal(
        d[module === "events" ? "attendanceCount" : "participants"],
        7,
      );
      assert.equal(d.startAt, null);
      assert.equal(d.endAt, null);
      assert.equal(d.contactId, null);
      if (module === "events") {
        assert.equal(d.registeredCount, null);
        assert.equal(d.walkInCount, null);
      } else assert.equal(d.minutes, null);
      const made = await f.call("create", {
        previewToken: p.previewToken,
        idempotencyKey: "fictional-command-0001",
      });
      assert.equal(made.kind, "created");
      assert.equal(made.record.status, "draft");
      assert.equal(made.record.revision, 1);
      assert.equal(made.record.approval, null);
      assert.equal(made.record.snapshot, null);
      assert.equal(made.record.source, null);
      assert.deepEqual(f.state.ledger, before);
      assert.equal(
        f.state.events.filter((e) => e.action === "attendance.draft-created")
          .length,
        1,
      );
    },
  );
test("known registrations are preserved; nullable walk-ins are not zero and consistency is not evaded", async () => {
  const f = fixture();
  f.state.records.get("target").data.registeredCount = 2;
  const p = await f.prepare({ reportedAttendance: 2 });
  assert.equal(p.preview.candidate.data.registeredCount, 2);
  assert.equal(p.preview.candidate.data.walkInCount, null);
  await assert.rejects(
    () => f.prepare({ reportedAttendance: 3 }),
    (e) => e.name === "ModuleValidationError",
  );
  await assert.rejects(
    () => f.prepare({ registeredCount: 1 }),
    err("attendance_count"),
  );
  const withWalkIns = await f.prepare({
    reportedAttendance: 3,
    walkInCount: 1,
  });
  assert.equal(withWalkIns.preview.candidate.data.walkInCount, 1);
  assert.equal(f.state.records.get("target").data.registeredCount, 2);
});
test("same accepted command reconciles later ordinary edits and trash without overwriting them", async () => {
  const f = fixture(),
    p = await f.prepare(),
    input = {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-command-0002",
    },
    first = await f.call("create", input);
  const row = f.state.records.get(first.record.id);
  row.data.attendanceCount = 9;
  row.revision = 2;
  row.status = "cancelled";
  row.deleted_at = new Date();
  f.state.ledger[0].state = "cancelled";
  const again = await f.call("create", input);
  assert.equal(again.kind, "already-created");
  assert.equal(again.disposition, "trash");
  assert.equal(again.record.data.attendanceCount, 9);
  assert.equal(again.record.revision, 2);
  assert.equal(f.state.events.length, 1);
});
test("changed command payload, actor incarnation, membership or session cannot impersonate an accepted receipt", async () => {
  const f = fixture(),
    p = await f.prepare(),
    other = await f.prepare({ title: "Different reviewed request" }),
    input = {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-command-0003",
    };
  await f.call("create", input);
  await assert.rejects(
    () => f.call("create", { ...input, previewToken: other.previewToken }),
    err("attendance_command"),
  );
  await assert.rejects(
    () => f.call("create", { ...input, previewToken: p.previewToken + ".bad" }),
    err("attendance_preview"),
  );
  f.state.member.revision++;
  await assert.rejects(
    () => f.call("create", input),
    err("attendance_command"),
  );
  f.state.member.revision--;
  await assert.rejects(
    () =>
      f.call("create", input, {
        session: { ...session, session: { id: "different-session" } },
      }),
    err("attendance_command"),
  );
  f.state.member.incarnation = "2002-01-01T00:00:00.000000Z";
  await assert.rejects(() => f.call("create", input), err("attendance_stale"));
});
test("accepted exact Retry remains readable after review expiry without granting a new create", async (t) => {
  const f = fixture(),
    p = await f.prepare(),
    input = {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-command-expired",
    };
  await f.call("create", input);
  t.mock.method(Date, "now", () => Date.parse(p.expiresAt) + 1);
  const result = await f.call("create", input);
  assert.equal(result.kind, "already-created");
  assert.equal(f.state.events.length, 1);
});
test("an arbitrary audit-shaped object is not live signed receipt authority", async () => {
  const f = fixture(),
    p = await f.prepare(),
    input = {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-command-forged",
    };
  await f.call("create", input);
  f.state.events[0].detail.attendanceSignature = "forged";
  await assert.rejects(
    () => f.call("create", input),
    err("attendance_command"),
  );
  assert.equal(f.state.records.size, 5);
});
test("ledger/target/restore changes stale a reviewed create without partial persistence", async () => {
  for (const change of [
    (f) => f.state.ledger[0].revision++,
    (f) => {
      f.state.records.get("target").revision++;
      f.state.records.get("target").approval.revision++;
    },
    (f) => f.state.restores.push({ record_id: "target", id: "99" }),
  ]) {
    const f = fixture(),
      p = await f.prepare();
    change(f);
    await assert.rejects(
      () =>
        f.call("create", {
          previewToken: p.previewToken,
          idempotencyKey: "fictional-command-stale",
        }),
      err("attendance_stale"),
    );
    assert.equal(f.state.records.size, 4);
    assert.equal(f.state.events.length, 0);
  }
});
test("current permissions and complete visibility apply to context and accepted Retry", async () => {
  const f = fixture();
  f.state.member.role = "board_reader";
  await assert.rejects(
    () => f.call(),
    (e) => e.status === 403,
  );
  f.state.member.role = "owner";
  f.state.records.delete("contact");
  await assert.rejects(() => f.call(), err("attendance_unavailable"));
  const g = fixture(),
    p = await g.prepare(),
    input = {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-command-visibility",
    };
  await g.call("create", input);
  g.state.records.delete("contact");
  await assert.rejects(
    () => g.call("create", input),
    err("attendance_unavailable"),
  );
});
test("future, unapproved, recovered and unreconciled occurrences never become attendance authority", async () => {
  for (const change of [
    (f) => {
      f.state.records.get("target").data.endAt = "2099-01-02T11:00:00Z";
    },
    (f) => (f.state.records.get("target").approval = null),
    (f) => (f.state.ledger[0].recovered = true),
    (f) => (f.state.managed.recovery_block = true),
  ]) {
    const f = fixture();
    change(f);
    const ctx = await f.call();
    assert.equal(ctx.canPrepare, false);
    assert.equal(ctx.contextSha256, null);
    assert.equal(ctx.sourceContext, null);
  }
});
test("helper commands reserve one aggregate and retain its target and whole-occurrence identities", async () => {
  const f = fixture(),
    p = await f.prepare();
  const outcomes = await Promise.allSettled(
    ["one", "two"].map((k) =>
      f.call("create", {
        previewToken: p.previewToken,
        idempotencyKey: "fictional-concurrent-" + k,
      }),
    ),
  );
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    outcomes.find((x) => x.status === "rejected").reason.code,
    "attendance_exists",
  );
  const row = [...f.state.records.values()].find(
    (r) => r.data.kind === "attendance",
  );
  await assert.rejects(
    () =>
      guardParticipationWrite(f.c, {
        ...p.preview.candidate,
        id: "generic-second",
      }),
    err("attendance_exists"),
  );
  await guardParticipationWrite(f.c, {
    ...p.preview.candidate,
    data: { ...row.data, attendanceCount: 2 },
  });
  for (const [key, value] of [
    ["kind", "registration"],
    ["eventId", null],
    ["programId", null],
    ["contactId", "contact"],
  ])
    await assert.rejects(
      () =>
        guardParticipationWrite(f.c, {
          ...p.preview.candidate,
          data: { ...row.data, [key]: value },
        }),
      err("attendance_guard"),
    );
});
test("manual attendance retains generic creation and correction rules without a helper receipt", async () => {
  const f = fixture(),
    p = await f.prepare(),
    candidate = p.preview.candidate;
  // These are actual saveRecord calls, not a weaker alias admission path.
  const outcomes = await Promise.allSettled(
    ["manual-one", "manual-two"].map((id) =>
      f.tx(() => saveRecord(f.c, { ...candidate, id })),
    ),
  );
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 2);
  assert.equal(f.state.events.length, 0);
  assert.equal(
    [...f.state.records.values()].filter((r) => r.data.kind === "attendance")
      .length,
    2,
  );
  await saveRecord(f.c, {
    ...candidate,
    id: "manual-one",
    revision: 2,
    data: { ...candidate.data, contactId: "contact", attendanceCount: 2 },
  });
  assert.equal(f.state.records.get("manual-one").data.contactId, "contact");
  const context = await f.call();
  assert.equal(context.canPrepare, false);
  assert.equal(context.existing, null);
  assert.match(context.reason, /multiple|more than one/i);
});
test("a generic-first aggregate makes a previously reviewed helper command refuse under the same queue", async () => {
  const f = fixture(),
    p = await f.prepare();
  const outcomes = await Promise.allSettled([
    f.tx(() => saveRecord(f.c, { ...p.preview.candidate, id: "manual-first" })),
    f.call("create", {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-manual-first",
    }),
  ]);
  assert.equal(outcomes[0].status, "fulfilled");
  assert.equal(outcomes[1].status, "rejected");
  assert.equal(outcomes[1].reason.code, "attendance_exists");
  assert.equal(f.state.events.length, 0);
  assert.equal(
    [...f.state.records.values()].filter((r) => r.data.kind === "attendance")
      .length,
    1,
  );
});
test("record, mandatory audit and complete-export failures roll the create transaction back together", async () => {
  for (const failure of ["quota", "exportFailure"]) {
    const f = fixture(),
      p = await f.prepare();
    f.state[failure] = true;
    await assert.rejects(() =>
      f.call("create", {
        previewToken: p.previewToken,
        idempotencyKey: "fictional-command-failure",
      }),
    );
    assert.equal(f.state.records.size, 4);
    assert.equal(f.state.events.length, 0);
  }
});
test("restored typed counts remain intact, but original audit receipts are not installed as command authority", async () => {
  const f = fixture(),
    p = await f.prepare({ reportedAttendance: 8 }),
    made = await f.call("create", {
      previewToken: p.previewToken,
      idempotencyKey: "fictional-command-backup",
    });
  const records = [...f.state.records.values()].map((r) => ({
    id: r.id,
    orgId: "org",
    moduleId: r.module_id,
    data: r.data,
    status: r.status,
    revision: r.revision,
    ownerId: "author",
    approval: null,
    snapshot: null,
    source: null,
  }));
  const backup = makeBackup(
      { name: "Fictional", currency: "USD", time_zone: "UTC" },
      records,
      { events: clone(f.state.events) },
    ),
    restored = validateBackup(backup, "new-org", "restorer");
  const item = restored.find((r) => r.id === made.record.id);
  assert.equal(item.data.attendanceCount, 8);
  assert.equal(item.data.registeredCount, null);
  assert.equal(item.data.walkInCount, null);
  assert.equal(item.approval, null);
  assert.equal(item.status, "draft");
  // The real importer creates record.restored audits (not supplied originals).
  f.state.events = [];
  f.state.restores = [{ record_id: made.record.id, id: "100" }];
  await assert.rejects(
    () =>
      f.call("create", {
        previewToken: p.previewToken,
        idempotencyKey: "fictional-command-backup",
      }),
    err("attendance_exists"),
  );
});
test("actual authenticated handler routes context/review/create/Retry through bounded attendance admission", async () => {
  const f = fixture(),
    rates = [],
    transactions = [],
    configuration = { ...settings, origin: "https://os.example.invalid" };
  const handle = createHandler({
    settings: configuration,
    db: {
      async limit(...args) {
        rates.push(args);
      },
      async tx(user, org, fn, options) {
        transactions.push(options);
        return f.tx(() => fn(f.c));
      },
    },
    auth: {
      api: {
        async getSession() {
          return session;
        },
      },
    },
    send: async () => {
      throw Error("No fixture mail transport");
    },
  });
  const url =
    "https://os.example.invalid/api/orgs/org/participation-targets/target/attendance";
  const contextResponse = await handle(new Request(url));
  assert.equal(contextResponse.status, 200);
  const ctx = await contextResponse.json();
  assert.equal(transactions[0].readOnly, true);
  const post = (path, value) =>
    handle(
      new Request(url + path, {
        method: "POST",
        headers: {
          origin: configuration.origin,
          "content-type": "application/json",
          "x-csrf-token": csrf(session.session.id, configuration.secret),
        },
        body: JSON.stringify(value),
      }),
    );
  const previewResponse = await post("/preview", {
    contextSha256: ctx.contextSha256,
    title: "Fictional handler attendance",
    reportedAttendance: 4,
    registeredCount: null,
    walkInCount: null,
    wholeOccurrence: true,
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  const input = {
    previewToken: preview.previewToken,
    idempotencyKey: "fictional-handler-command",
  };
  const created = await post("/create", input);
  assert.equal(created.status, 200);
  const createdValue = await created.json();
  assert.equal(createdValue.kind, "created");
  const retried = await post("/create", input);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).kind, "already-created");
  assert.equal(f.state.events.length, 1);
  assert.ok(rates.every((r) => r[0].startsWith("attendance-")));
  assert.ok(transactions.slice(1).every((t) => t.lock && !t.readOnly));
  const personLink = await handle(
    new Request(
      configuration.origin +
        "/api/orgs/org/modules/events/records/" +
        createdValue.record.id,
      {
        method: "PATCH",
        headers: {
          origin: configuration.origin,
          "content-type": "application/json",
          "x-csrf-token": csrf(session.session.id, configuration.secret),
        },
        body: JSON.stringify({
          revision: 1,
          data: { ...createdValue.record.data, contactId: "contact" },
        }),
      },
    ),
  );
  assert.equal(personLink.status, 409);
  assert.equal((await personLink.json()).code, "attendance_guard");
  assert.equal(
    f.state.records.get(createdValue.record.id).data.contactId,
    null,
  );
  const before = f.state.queries.length;
  const bad = await handle(
    new Request(url + "/preview", {
      method: "POST",
      headers: {
        origin: configuration.origin,
        "content-type": "application/json",
        "x-csrf-token": csrf(session.session.id, configuration.secret),
      },
      body: '{"title":"A","title":"B"}',
    }),
  );
  assert.equal(bad.status, 422);
  assert.equal(f.state.queries.length, before);
});
