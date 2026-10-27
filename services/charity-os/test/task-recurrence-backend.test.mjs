import test from "node:test";
import assert from "node:assert/strict";
import {
  readTaskRecurrenceBody,
  parseTaskRecurrenceJson,
} from "../lib/task-recurrence.mjs";
const error = (status) => (e) => e.status === status;
test("recurrence strict JSON rejects duplicate decoded members, depth, BOM, trailing and invalid syntax", () => {
  for (const bad of [
    '{"revision":1,"\\u0072evision":2}',
    '{"a":{"b":1,"b":2}}',
    '{"a":[[[[[[[[1]]]]]]]]}',
    "\ufeff{}",
    "{} {}",
    '{"a":01}',
    '{"a":"\n"}',
  ])
    assert.throws(() => parseTaskRecurrenceJson(bad), error(422));
  assert.deepEqual(
    parseTaskRecurrenceJson('{"a":[1,null,true,{"x":"\\\""}]}'),
    { a: [1, null, true, { x: '"' }] },
  );
});
test("recurrence reader enforces actual bytes and cancels untrusted streamed overflow", async () => {
  let cancelled = false;
  const request = new Request("https://example.invalid", {
    method: "POST",
    body: new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(8193));
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  });
  await assert.rejects(readTaskRecurrenceBody(request), error(413));
  assert.equal(cancelled, true);
  await assert.rejects(
    readTaskRecurrenceBody(
      new Request("https://example.invalid", {
        method: "POST",
        body: Uint8Array.from([123, 34, 97, 34, 58, 34, 0xc0, 0xaf, 34, 125]),
      }),
    ),
    error(422),
  );
  await assert.rejects(
    readTaskRecurrenceBody(
      new Request("https://example.invalid", {
        method: "POST",
        body: Uint8Array.from([0xef, 0xbb, 0xbf, 123, 125]),
      }),
    ),
    error(422),
  );
});

import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
import {
  prepareTaskRecurrence,
  taskRecurrenceSourceApproval,
} from "../lib/task-recurrence-model.mjs";
import { restoredTaskRecurrence } from "../lib/task-recurrence-backup.mjs";
function recurrenceFixture() {
  const orgId = "fictional-backup-org",
    actor = "fictional-backup-actor",
    at = "2026-01-01T00:00:00.000Z";
  const root = {
    id: "fictional-backup-root",
    orgId,
    moduleId: "projects",
    status: "planned",
    ownerId: actor,
    lastEditedBy: actor,
    revision: 1,
    approval: null,
    snapshot: null,
    source: null,
    createdAt: at,
    updatedAt: at,
  };
  root.data = validateRecord(
    "projects",
    {
      title: "Fictional frozen history",
      kind: "task",
      dueAt: "2027-01-31T09:00:00.000Z",
      timeZone: "UTC",
      recurrence: "monthly",
    },
    { orgId, recordId: root.id, records: [], status: "planned" },
  );
  const member = {
    userId: actor,
    role: "owner",
    programIds: [],
    revision: 1,
    createdAtExact: "2026-01-01T00:00:00.123456Z",
  };
  const first = prepareTaskRecurrence({
    source: root,
    series: null,
    member,
    records: [root],
    resolution: null,
  }).plan;
  const child = {
    ...first.candidate,
    id: first.generatedRecordId,
    orgId,
    createdAt: at,
    updatedAt: at,
  };
  const series = {
    id: first.seriesId,
    orgId,
    rootRecordId: root.id,
    method: first.method,
    anchor: first.anchor,
    state: "active",
    revision: 2,
    tipRecordId: child.id,
    tipSequence: 1,
    createdBy: actor,
    createdAt: at,
    endedAt: null,
    endCode: null,
    recoveredState: null,
    budgetBytes: 4096,
    lastEndCommand: null,
  };
  const second = prepareTaskRecurrence({
    source: child,
    series,
    member,
    records: [root, child],
    resolution: null,
  }).plan;
  const tip = {
    ...second.candidate,
    id: second.generatedRecordId,
    orgId,
    createdAt: at,
    updatedAt: at,
  };
  const occurrence = (p, r) => ({
    seriesId: p.seriesId,
    sequence: p.sequence,
    sourceRecordId: r.id,
    sourceRevision: r.revision,
    sourceDataHash: p.sourceDataHash,
    capturedSource: {
      moduleId: "projects",
      kind: "task",
      programId: r.data.programId,
      dueAt: r.data.dueAt,
      timeZone: r.data.timeZone,
      recurrence: r.data.recurrence,
    },
    generatedRecordId: p.generatedRecordId,
    initialGeneratedDataHash: p.candidateDataHash,
    generatedModuleId: "projects",
    generatedKindAtCreation: "task",
    method: p.method,
    anchorHash: hash(p.anchor),
    selectedCivil: p.chosen.dueAt.slice(0, 23),
    chosen: p.chosen,
    planHash: p.planHash,
    originalActorId: actor,
    acceptedCommandHash: hash("fictional-command-" + p.sequence),
    acceptedRequestHash: hash("fictional-request-" + p.sequence),
    createdAt: at,
  });
  const { orgId: ignored, lastEndCommand, ...saved } = series;
  return {
    rows: [root, child, tip],
    backup: {
      format: "charitology-os-task-recurrence",
      version: 1,
      series: [
        {
          ...saved,
          state: "ended",
          revision: 3,
          tipSequence: 2,
          tipRecordId: tip.id,
          endedAt: at,
          endCode: "explicit",
        },
      ],
      occurrences: [occurrence(first, root), occurrence(second, child)],
    },
  };
}
test("backup preserves exact frozen predecessor instants and refuses contradictory offsets at root and later source", () => {
  const { rows, backup } = recurrenceFixture();
  const recovered = restoredTaskRecurrence(backup, {
    records: rows,
    trash: [],
  });
  assert.equal(recovered.series[0].state, "recovered");
  for (const index of [0, 1]) {
    const changed = structuredClone(backup);
    changed.occurrences[index].capturedSource.dueAt = changed.occurrences[
      index
    ].capturedSource.dueAt.replace("Z", "+01:00");
    assert.throws(
      () => restoredTaskRecurrence(changed, { records: rows, trash: [] }),
      error(422),
    );
  }
  const moved = rows.map((r) => ({
    ...r,
    orgId: "fictional-recovered-destination",
    data: {
      ...r.data,
      kind: "milestone",
      recurrence: "none",
      dueAt: null,
      timeZone: null,
    },
  }));
  const again = restoredTaskRecurrence(recovered, {
    records: moved.slice(1),
    trash: [],
  });
  assert.equal(again.series[0].recoveredState, "ended");
  assert.equal(again.occurrences.length, 2);
});
test("backup closed chain admission rejects missing live identities, duplicate commands, malformed versions and detached tips", () => {
  const { rows, backup } = recurrenceFixture();
  assert.throws(
    () => restoredTaskRecurrence(backup, { records: rows.slice(1), trash: [] }),
    error(422),
  );
  for (const change of [
    (b) => (b.version = 2),
    (b) => (b.series[0].tipRecordId = "fictional-unrelated"),
    (b) =>
      (b.occurrences[1].acceptedCommandHash =
        b.occurrences[0].acceptedCommandHash),
    (b) => (b.occurrences[0].unknown = true),
    (b) => b.occurrences.reverse() && b.occurrences.pop(),
  ]) {
    const candidate = structuredClone(backup);
    change(candidate);
    assert.throws(
      () => restoredTaskRecurrence(candidate, { records: rows, trash: [] }),
      error(422),
    );
  }
  const crossOrg = structuredClone(rows);
  crossOrg[1].orgId = "fictional-foreign-org";
  assert.throws(
    () => restoredTaskRecurrence(backup, { records: crossOrg, trash: [] }),
    error(422),
  );
});
test("GET and prepared plans share exact independent current approval and approval-time predicate", () => {
  const { rows } = recurrenceFixture(),
    r = rows[0];
  assert.equal(taskRecurrenceSourceApproval(r), "not-current");
  r.approval = {
    status: "approved",
    revision: r.revision,
    actorId: "fictional-independent-reviewer",
    at: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(taskRecurrenceSourceApproval(r), "current");
  for (const at of [
    null,
    "2026-02-30T00:00:00Z",
    "not-a-time",
    "2026-01-01T00:00:00",
  ])
    assert.equal(
      taskRecurrenceSourceApproval({ ...r, approval: { ...r.approval, at } }),
      "not-current",
    );
  assert.equal(
    taskRecurrenceSourceApproval({
      ...r,
      approval: { ...r.approval, actorId: r.lastEditedBy },
    }),
    "not-current",
  );
});

test("backup identities stay exact opaque strings and never coerce numbers or arrays", () => {
  const { rows, backup } = recurrenceFixture();
  for (const bad of [123, ["fictional-actor"], null, {}, true])
    for (const mutate of [
      (b) => (b.series[0].createdBy = bad),
      (b) => (b.occurrences[0].originalActorId = bad),
    ]) {
      const b = structuredClone(backup);
      mutate(b);
      assert.throws(
        () => restoredTaskRecurrence(b, { records: rows, trash: [] }),
        error(422),
      );
    }
});
