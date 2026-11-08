import test from "node:test";
import assert from "node:assert/strict";
import { compileRecurringOccurrenceDrafts as compile } from "../lib/participation-recurrence-model.mjs";
import { recurringOccurrenceAnchor, RECURRING_METHOD } from "../lib/participation-recurrence-planner.mjs";

const fixture = (moduleId = "events") => {
  const data = { title: "Fictional saved template", kind: moduleId === "events" ? "session" : "shift", programId: "fictional-program",
    startAt: "2026-11-01T09:00:00.123Z", endAt: "2026-11-01T10:00:00.456Z", timeZone: "UTC", capacity: 3,
    participationPurpose: "Fictional practice only", participantInstructions: "First line\nSecond line", organizerUrl: "https://example.invalid/contact",
    contactId: "fictional-person-not-copied", ...(moduleId === "events" ? { registeredCount: 3, attendanceCount: 2, walkInCount: 1, joiningUrl: "https://example.invalid/join", accessCoordinatorNeeded: true }
      : { participants: 9, minutes: 55, skills: "Fictional practice skill", safeguardingId: "fictional-training", allowPartialIntervals: true }) };
  const schedule = { format: "charitology-participation-recurrence", version: 1, method: RECURRING_METHOD, timeZone: "UTC",
    anchor: recurringOccurrenceAnchor({ startAt: data.startAt, endAt: data.endAt, timeZone: data.timeZone, intervalWeeks: 1 }),
    intervalWeeks: 1, count: 1, exceptions: [], resolutions: [{ sequence: 1, start: null, end: null }] };
  return { orgId: "fictional-org", actorId: "fictional-writer", source: { id: "fictional-template", orgId: "fictional-org", moduleId, revision: 4, data }, schedule,
    titles: [{ sequence: 1, title: "Fictional next occurrence" }], children: [{ sequence: 1, id: "fictional-child-1" }],
    references: [{ id: "fictional-program", orgId: "fictional-org", moduleId: "programs" }, ...(moduleId === "volunteers" ? [{ id: "fictional-training", orgId: "fictional-org", moduleId: "safeguarding" }] : [])] };
};
const bad = (fn, code) => assert.throws(fn, e => e?.name === "RecurringScheduleError" && e.status === 422 && (!code || e.code === code));

test("event generation makes ordinary unapproved drafts and excludes personal/count/external authority", () => {
  const input = fixture(), before = structuredClone(input), value = compile(input), row = value.candidates[0];
  assert.deepEqual(input, before); assert.equal(row.data.kind, "session"); assert.equal(row.data.startAt, "2026-11-08T09:00:00.123Z");
  assert.equal(row.data.capacity, 3); assert.equal(row.status, "draft"); assert.equal(row.revision, 1); assert.equal(row.ownerId, input.actorId);
  for (const key of ["approval", "snapshot", "source"]) assert.equal(row[key], null);
  for (const key of ["contactId", "eventId", "registeredCount", "attendanceCount", "walkInCount"]) assert.equal(row.data[key], null);
  for (const key of ["externalSystem", "externalId"]) assert.equal(Object.hasOwn(row.data, key), false);
  assert.equal(row.data.joiningUrl, input.source.data.joiningUrl); assert.equal(row.data.accessCoordinatorNeeded, true);
  assert.equal(row.data.participantInstructions, "First line\nSecond line");
  assert(!JSON.stringify(value).includes("fictional-person-not-copied")); assert(!Object.hasOwn(value.source.data, "registeredCount"));
  assert(!Object.hasOwn(row, "createdAt")); assert(!Object.hasOwn(value, "acceptedAt")); assert.match(value.sha256, /^[a-f0-9]{64}$/);
});
test("volunteer shifts retain typed training/interval policy but never copy assignments or attendance", () => {
  const value = compile(fixture("volunteers")), row = value.candidates[0];
  assert.equal(row.data.kind, "shift"); assert.equal(row.data.safeguardingId, "fictional-training"); assert.equal(row.data.allowPartialIntervals, true);
  assert.equal(row.data.skills, "Fictional practice skill");
  for (const key of ["contactId", "shiftId", "participants", "minutes"]) assert.equal(row.data[key], null);
  assert.deepEqual(value.children, [{ sequence: 1, recordId: "fictional-child-1" }]);
});
test("known zero and unknown capacity stay distinct under actual ordinary module rules", () => {
  const unknown = fixture(); unknown.source.data.capacity = null; assert.equal(compile(unknown).candidates[0].data.capacity, null);
  const zero = fixture(); zero.source.data.capacity = 0; assert.equal(compile(zero).candidates[0].data.capacity, 0);
  const shift = fixture("volunteers"); shift.source.data.capacity = 0; bad(() => compile(shift), "recurrence_draft_record");
});
test("typed copied dependencies must match exact program/training module and organization", () => {
  for (const change of [
    v => { v.references = []; }, v => { v.references[0].moduleId = "contacts"; },
    v => { v.references[0].orgId = "another-org"; }, v => { v.references.push({ ...v.references[0] }); },
    v => { v.references[0].approval = true; },
  ]) { const value = fixture(); change(value); bad(() => compile(value)); }
  const wrongTraining = fixture("volunteers"); wrongTraining.references[1].moduleId = "programs"; bad(() => compile(wrongTraining));
});
test("source module/kind/org/revision and server-controlled field boundaries refuse before generation", () => {
  for (const change of [
    v => { v.source.moduleId = "projects"; }, v => { v.source.data.kind = "registration"; },
    v => { v.source.orgId = "another-org"; }, v => { v.source.revision = 0; },
    v => { v.source.approval = { status: "approved" }; }, v => { v.source.data.authority = true; },
    v => { v.actorId = "bad actor"; },
  ]) { const value = fixture(); change(value); bad(() => compile(value)); }
});
test("schedule must be the next anchored calendar interval of the exact template", () => {
  const moved = structuredClone(fixture()); moved.schedule.anchor.startCivil = "2026-11-09T09:00:00.123"; moved.schedule.anchor.endCivil = "2026-11-09T10:00:00.456";
  bad(() => compile(moved), "recurrence_draft_anchor");
  const renamedZone = fixture(); renamedZone.schedule.timeZone = "Etc/UTC"; bad(() => compile(renamedZone), "recurrence_draft_anchor");
});
test("skipped ordinal holes require exact selected child/title entries with no automatic fit", () => {
  const value = fixture(); value.schedule.count = 3; value.schedule.exceptions = [{ sequence: 2, kind: "skip", reason: "Fictional closure" }];
  value.schedule.resolutions = [1, 2, 3].map(sequence => ({ sequence, start: null, end: null }));
  value.children.push({ sequence: 3, id: "fictional-child-3" }); value.titles.push({ sequence: 3, title: "Fictional third date" });
  const result = compile(value); assert.deepEqual(result.children.map(x => x.sequence), [1, 3]); assert.equal(result.plan.occurrences[1].range, null);
  const absent = structuredClone(value); absent.children.pop(); bad(() => compile(absent));
  const wrong = structuredClone(value); wrong.children[1].sequence = 2; bad(() => compile(wrong));
  const reordered = structuredClone(value); reordered.titles.reverse(); bad(() => compile(reordered));
  const skippedTitle = structuredClone(value); skippedTitle.titles.splice(1, 0, { sequence: 2, title: "Must not generate" }); bad(() => compile(skippedTitle));
});
test("all-skipped or gap plans and known ID collisions cannot compile to a no-op or duplicate", () => {
  const empty = fixture(); empty.schedule.exceptions = [{ sequence: 1, kind: "skip", reason: "Fictional closure" }];
  bad(() => compile(empty), "recurrence_draft_not_ready");
  for (const id of ["fictional-template", "fictional-program"]) { const value = fixture(); value.children[0].id = id; bad(() => compile(value)); }
  const duplicate = fixture(); duplicate.schedule.count = 2; duplicate.schedule.resolutions.push({ sequence: 2, start: null, end: null });
  duplicate.children.push({ sequence: 2, id: duplicate.children[0].id }); duplicate.titles.push({ sequence: 2, title: "Fictional repeated ID" }); bad(() => compile(duplicate));
});
test("actual180-character title boundary preserves text and refuses181 without truncation", () => {
  const valid = fixture(); valid.titles[0].title = "x".repeat(180); assert.equal(compile(valid).candidates[0].data.title.length, 180);
  const long = fixture(); long.titles[0].title = "x".repeat(181); bad(() => compile(long), "recurrence_draft_record");
  const control = fixture(); control.titles[0].title = "bad\u0001title"; bad(() => compile(control), "recurrence_draft_record");
});
test("compiler rejects hostile ownership without getter/proxy execution and detaches frozen output", () => {
  let calls = 0;
  const getter = fixture(); Object.defineProperty(getter.source.data, "title", { enumerable: true, get() { calls++; throw Error("no"); } }); bad(() => compile(getter));
  const proxy = fixture(); proxy.references = new Proxy(proxy.references, { ownKeys() { calls++; throw Error("no"); } }); bad(() => compile(proxy));
  const hidden = fixture(); Object.defineProperty(hidden.children, "extra", { value: true }); bad(() => compile(hidden));
  const sparse = fixture(); delete sparse.titles[0]; bad(() => compile(sparse));
  const oversized = fixture(); oversized.source.data.title = "x".repeat(131072); bad(() => compile(oversized), "recurrence_draft_limit");
  assert.equal(calls, 0);
  const input = fixture(), value = compile(input); input.source.data.participationPurpose = "Changed later";
  assert.equal(value.candidates[0].data.participationPurpose, "Fictional practice only"); assert(Object.isFrozen(value.candidates[0].data));
  assert.throws(() => { value.candidates[0].data.title = "Mutated"; }, TypeError);
});
test("new drafts are deterministic without a current clock, capacity allocation or authority callback", () => {
  const input = fixture(), original = Date.now;
  Date.now = () => { throw Error("No current time in pure compiler"); };
  try { assert.deepEqual(compile(input), compile(structuredClone(input))); }
  finally { Date.now = original; }
});
