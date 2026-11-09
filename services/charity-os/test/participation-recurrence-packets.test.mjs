import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hash, stable } from "../lib/security.mjs";
import { getModule } from "../lib/modules.mjs";
import { compileRecurringOccurrenceDrafts as compile } from "../lib/participation-recurrence-model.mjs";
import { recurringOccurrenceAnchor, RECURRING_METHOD } from "../lib/participation-recurrence-planner.mjs";
import { makeRecurringOccurrenceManifest as manifest, validateRecurringOccurrenceManifest as validateManifest,
  makeRecurringOccurrenceReportRow as reportRow, validateRecurringOccurrenceReportRow as validateReportRow,
  makeRecurringOccurrencePreview as preview, validateRecurringOccurrencePreview as validatePreview,
  makeRecurringOccurrenceReceipt as receipt, validateRecurringOccurrenceReceipt as validateReceipt,
  validateRecurringOccurrencePreviewRow as validateRow, recurringOccurrenceCommandHashes as commandHashes,
  RECURRENCE_PACKET_KIND, RECURRENCE_PACKET_LIMITS } from "../lib/participation-recurrence-packets.mjs";

// Entirely fictional pure data; no account, SQL clock/row, COMMIT or real consent.
const AT = "2026-11-02T00:00:00.000001Z", CREATED = "2026-10-31T00:00:00.123456Z", UPDATED = "2026-11-01T00:00:00.654321Z";
const fixture = moduleId => {
  const data = { title: "Fictional root template", kind: moduleId === "events" ? "session" : "shift", programId: "fictional-program",
    startAt: "2026-11-01T09:00:00.123Z", endAt: "2026-11-01T10:00:00.456Z", timeZone: "UTC", capacity: 3,
    participationPurpose: "Fictional practice only", participantInstructions: "First line\nSecond line", organizerUrl: "https://example.invalid/contact",
    contactId: "fictional-unrelated-person", ...(moduleId === "events" ? { registeredCount: 3, attendanceCount: 2, walkInCount: 1 }
      : { participants: 2, minutes: 60, skills: "Fictional skill", safeguardingId: "fictional-training", allowPartialIntervals: true }) };
  const input = { orgId: "fictional-org", actorId: "fictional-writer", source: { id: "fictional-template", orgId: "fictional-org", moduleId, revision: 4, data },
    schedule: { format: "charitology-participation-recurrence", version: 1, method: RECURRING_METHOD, timeZone: "UTC",
      anchor: recurringOccurrenceAnchor({ startAt: data.startAt, endAt: data.endAt, timeZone: data.timeZone, intervalWeeks: 1 }),
      intervalWeeks: 1, count: 2, exceptions: [], resolutions: [1, 2].map(sequence => ({ sequence, start: null, end: null })) },
    titles: [1, 2].map(sequence => ({ sequence, title: "Fictional occurrence " + sequence })),
    children: [1, 2].map(sequence => ({ sequence, id: "fictional-child-" + sequence })),
    references: [{ id: "fictional-program", moduleId: "programs", orgId: "fictional-org" },
      ...(moduleId === "volunteers" ? [{ id: "fictional-training", moduleId: "safeguarding", orgId: "fictional-org" }] : [])] };
  const compiled = compile(input), dependencies = {
    source: { id: input.source.id, revision: 4, rowSha256: "a".repeat(64), createdAtExact: CREATED, updatedAtExact: UPDATED, deletedAtExact: null },
    references: input.references.map(r => ({ id: r.id, moduleId: r.moduleId, revision: 3, rowSha256: "b".repeat(64), createdAtExact: CREATED, updatedAtExact: UPDATED, deletedAtExact: null })) };
  return { input, compiled, dependencies, authority: { actorId: input.actorId, sessionSha256: "c".repeat(64), membershipSha256: "d".repeat(64), memberCreatedAtExact: CREATED, restoreEpochSha256: "e".repeat(64) } };
};
const EVENT = fixture("events"), VOLUNTEER = fixture("volunteers");
const args = f => ({ reportId: "fictional-report", recordedAtExact: AT, compiled: f.compiled, dependencies: f.dependencies });
const previewArgs = f => ({ orgId: f.input.orgId, actorId: f.input.actorId, reportId: "fictional-report", authority: f.authority, dependencies: f.dependencies, input: f.input });
const clone = value => structuredClone(value);
const bad = (fn, code) => assert.throws(fn, e => e?.name === "RecurringOccurrencePacketError" && e.status === 422 && (!code || e.code === code));
const seal = (kind, value) => { const { sha256, ...body } = value; value.sha256 = hash({ method: RECURRING_METHOD, purpose: RECURRENCE_PACKET_KIND, kind, value: body }); return value; };
const hashes = commandHashes({ orgId: "fictional-org", actorId: "fictional-writer", previewId: "fictional-preview", commandKey: "fictional-command-key-0001" });
const makeReceipt = f => receipt({ manifest: manifest(args(f)), authority: f.authority, keyHash: hashes.commandSha256, requestHash: hashes.requestSha256 });
const sqlRow = (payload, committed = false) => ({ org_id: "fictional-org", id: "fictional-preview", actor_id: "fictional-writer", kind: RECURRENCE_PACKET_KIND,
  payload, checksum: hash(payload), base_revision: committed ? "a".repeat(64) : payload.dependenciesSha256,
  created_at: "2026-11-02T00:00:00.000000Z", expires_at: "2026-11-02T00:30:00.000000Z", committed_at: committed ? "2026-11-02T00:00:00.000000Z" : null });

test("both real compiler modules produce closed data-only historical generation manifests", () => {
  for (const f of [EVENT, VOLUNTEER]) {
    const value = manifest(args(f)); assert.equal(value.originOrgId, f.input.orgId); assert.equal(value.recordedAtExact, AT);
    assert.equal(value.candidates.length, 2); assert.deepEqual(value.candidates.map(c => c.sequence), [1, 2]);
    assert.deepEqual(Object.keys(value.candidates[0]).sort(), ["sequence", "id", "moduleId", "data", "status", "revision"].sort());
    assert.deepEqual(Object.keys(value.candidates[0].data).sort(), getModule(f.input.source.moduleId).fields.map(x => x.key).sort());
    for (const row of value.candidates) { assert.equal(row.status, "draft"); assert.equal(row.revision, 1); }
    for (const key of ["actorId", "authority", "commandKey", "recordedBy", "sourceCommit", "sourceFiles"]) assert.equal(Object.hasOwn(value, key), false);
    assert.equal(Object.hasOwn(value.source.data, "contactId"), false); assert(!JSON.stringify(value).includes("fictional-unrelated-person"));
    assert(Object.isFrozen(value.candidates[0].data)); assert.deepEqual(validateManifest(value), value);
  }
});
test("recorded report time is exactSQL6 input, before every generated start, never a newly minted current time", () => {
  bad(() => manifest({ ...args(EVENT), recordedAtExact: "2026-11-02T00:00:00.000Z" }), "recurrence_packet_time");
  bad(() => manifest({ ...args(EVENT), recordedAtExact: "2026-11-08T09:00:00.123000Z" }), "recurrence_packet_future");
  const exact = manifest({ ...args(EVENT), recordedAtExact: "2026-11-08T09:00:00.122999Z" }); assert.equal(exact.recordedAtExact.slice(-7), "122999Z");
});
test("historical manifest and report-row validation never consult current Intl or Date.now", () => {
  const value = manifest(args(EVENT)), originalIntl = Intl.DateTimeFormat, originalNow = Date.now; let calls = 0;
  Intl.DateTimeFormat = function () { calls++; throw Error("No current calendar in historical admission"); };
  Date.now = () => { calls++; throw Error("No current clock"); };
  try {
    assert.deepEqual(validateManifest(value), value);
    assert.equal(reportRow({ orgId: "fictional-org", id: value.reportId, actorId: "fictional-writer", createdAtExact: AT, payload: value }).payload.sha256, value.sha256);
    assert.equal(calls, 0);
  } finally { Intl.DateTimeFormat = originalIntl; Date.now = originalNow; }
});
test("rehashed source, candidate, copied-count and dependency mutations still fail semantic admission", () => {
  const original = manifest(args(EVENT));
  for (const change of [
    v => { v.candidates[0].data.capacity = 7; }, v => { v.candidates[0].data.registeredCount = 1; },
    v => { v.candidates[0].data.contactId = "fictional-person"; }, v => { v.candidates[0].id = v.source.id; },
    v => { v.candidates.reverse(); }, v => { v.candidates[0].revision = 2; },
    v => { v.candidates[0].createdAtExact = AT; }, v => { v.dependencies.source.revision++; },
    v => { v.dependencies.source.deletedAtExact = AT; }, v => { v.dependencies.references[0].moduleId = "contacts"; },
    v => { v.source.data.startAt = "2026-11-02T09:00:00.123Z"; }, v => { v.authority = EVENT.authority; },
  ]) { const v = clone(original); change(v); bad(() => validateManifest(seal("manifest", v))); }
});
test("manifest checks compiled ownership/null-state with a genuine draft-domain checksum before stripping actor bookkeeping", () => {
  const compiledDigest = value => {
    const { sha256, ...body } = value;
    return createHash("sha256").update("charitology:participation-recurrence:v1:drafts\0" + stable(body)).digest("hex");
  };
  assert.equal(compiledDigest(EVENT.compiled), EVENT.compiled.sha256);
  assert.equal(compiledDigest(VOLUNTEER.compiled), VOLUNTEER.compiled.sha256);
  for (const f of [EVENT, VOLUNTEER]) for (const [field, value] of [
    ["ownerId", "somebody-else"], ["lastEditedBy", "somebody-else"],
    ["approval", {}], ["snapshot", {}], ["source", {}],
  ]) {
    const v = clone(args(f)); v.compiled.candidates[0][field] = value;
    v.compiled.sha256 = compiledDigest(v.compiled);
    assert.notEqual(v.compiled.sha256, f.compiled.sha256);
    // The checksum was correctly resealed, so refusal must reach the later
    // semantic fields guard rather than recurrence_packet_compiled.
    bad(() => manifest(v), "recurrence_packet_fields");
  }
  const changed = clone(args(EVENT)); changed.compiled.sha256 = "0".repeat(64); bad(() => manifest(changed), "recurrence_packet_compiled");
});
test("V1 security.hash string reseal is exactly the raw draft checksum and reaches the ownership guard", t => {
  const v = clone(args(EVENT)); v.compiled.candidates[0].ownerId = "somebody-else";
  const { sha256, ...body } = v.compiled;
  const draftBytes = "charitology:participation-recurrence:v1:drafts\0" + stable(body);
  v.compiled.sha256 = hash(draftBytes);
  assert.equal(v.compiled.sha256, createHash("sha256").update(draftBytes).digest("hex"));
  bad(() => manifest(v), "recurrence_packet_fields");
  t.diagnostic("Actual pinned security.hash special-cases strings as raw bytes. V1 already used the correct digest; V2 strengthens exact guard coverage, without a runtime defect claim.");
});
test("ordinary report metadata can move to a destination while historical origin, original IDs and payload remain exact", () => {
  const m = manifest(args(EVENT)), source = reportRow({ orgId: m.originOrgId, id: m.reportId, actorId: "fictional-writer", createdAtExact: AT, payload: m });
  const destination = validateReportRow({ ...source, org_id: "fictional-destination", created_by: "fictional-new-admin", created_at: "2027-01-01T00:00:00.000Z" });
  assert.equal(destination.payload.originOrgId, "fictional-org"); assert.equal(destination.checksum, source.checksum); assert.deepEqual(destination.payload, source.payload);
  assert.deepEqual(destination.payload.candidates.map(c => c.id), ["fictional-child-1", "fictional-child-2"]);
  bad(() => reportRow({ orgId: "fictional-destination", id: m.reportId, actorId: "fictional-new-admin", createdAtExact: "2027-01-01T00:00:00.000000Z", payload: m }), "recurrence_packet_live_context");
  bad(() => validateReportRow({ ...source, title: "Invented title" })); bad(() => validateReportRow({ ...source, id: "different-report" }));
  bad(() => validateReportRow({ ...source, created_at: new Date() }));
});
test("live preview maker recomputes actual compiler and retains only minimized outgoing source data", () => {
  const p = preview(previewArgs(EVENT)); assert.deepEqual(p.review.compiled, EVENT.compiled);
  assert.equal(Object.hasOwn(p.review.input.source.data, "contactId"), false); assert.equal(Object.hasOwn(p.review.input.source.data, "registeredCount"), false);
  assert(!JSON.stringify(p).includes("fictional-unrelated-person"));
  assert.deepEqual(compile(p.review.input), EVENT.compiled);
  for (const key of ["recordedAtExact", "acceptedAtExact", "reportSha256", "expiresAt"]) assert.equal(Object.hasOwn(p, key), false);
});
test("preview authority is closed binding data and keeps module writer/scope policy outside this model", () => {
  const p = preview(previewArgs(VOLUNTEER)); assert.equal(Object.hasOwn(p.authority, "role"), false); assert.equal(Object.hasOwn(p.authority, "unscoped"), false);
  const mismatched = clone(previewArgs(EVENT)); mismatched.authority.actorId = "another-writer"; bad(() => preview(mismatched));
  const fakeRole = clone(previewArgs(EVENT)); fakeRole.authority.role = "owner"; bad(() => preview(fakeRole));
  bad(() => preview({ ...previewArgs(EVENT), input: null }));
});
test("passive preview validation keeps frozen review even if current zone tools are unavailable", () => {
  const p = preview(previewArgs(EVENT)), original = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () { throw Error("No current resolver in passive packet admission"); };
  try { assert.deepEqual(validatePreview(p), p); assert.equal(validateRow(sqlRow(p)).classification, "passive"); }
  finally { Intl.DateTimeFormat = original; }
});
test("rehashed preview cannot substitute source pins, report identity, actor or hidden input fields", () => {
  const p = preview(previewArgs(EVENT));
  for (const change of [
    v => { v.dependencies.source.id = "another-source"; }, v => { v.dependencies.source.revision = 99; },
    v => { v.dependencies.references = []; }, v => { v.dependenciesSha256 = "0".repeat(64); },
    v => { v.actorId = "another-actor"; }, v => { v.reportId = v.review.compiled.candidates[0].id; },
    v => { v.review.input.source.data.contactId = "fictional-person"; }, v => { v.authority.memberCreatedAtExact = "2026-10-31T00:00:00.123Z"; },
  ]) { const v = clone(p); change(v); bad(() => validatePreview(seal("preview", v))); }
});
test("compact receipt time and ordered original result come only from the supplied final manifest", () => {
  const m = manifest(args(EVENT)), r = makeReceipt(EVENT);
  assert.equal(r.acceptedAtExact, m.recordedAtExact); assert.equal(r.orgId, m.originOrgId);
  assert.deepEqual(r.result, { reportId: m.reportId, reportSha256: m.sha256, recordIds: ["fictional-child-1", "fictional-child-2"] });
  assert.equal(Object.hasOwn(r, "manifest"), false); assert.equal(Object.hasOwn(m, "authority"), false); assert.deepEqual(validateReceipt(r), r);
  const altered = clone(r); altered.result.recordIds.push(altered.result.recordIds[0]); bad(() => validateReceipt(seal("receipt", altered)));
});
test("closed command hash binds actor/org/key and distinguishes exact preview request without accepting arbitrary payloads", () => {
  const base = { orgId: "fictional-org", actorId: "fictional-writer", previewId: "fictional-preview", commandKey: "fictional-command-key-0001" };
  const a = commandHashes(base), b = commandHashes({ ...base, previewId: "fictional-other-preview" });
  assert.equal(a.commandSha256, b.commandSha256); assert.notEqual(a.requestSha256, b.requestSha256);
  assert.notEqual(a.commandSha256, commandHashes({ ...base, actorId: "another-actor" }).commandSha256);
  assert.notEqual(a.commandSha256, commandHashes({ ...base, orgId: "another-org" }).commandSha256);
  bad(() => commandHashes({ ...base, commandKey: "short" })); bad(() => commandHashes({ ...base, automaticRetry: true }));
});
test("actualSQL-row profile checks generic checksum separately from packet checksum and admitted purpose", () => {
  const p = preview(previewArgs(EVENT)), row = sqlRow(p);
  assert.notEqual(row.checksum, p.sha256); assert.deepEqual(validateRow(row), { classification: "passive", state: "pending", payload: p });
  bad(() => validateRow({ ...row, checksum: p.sha256 }), "recurrence_packet_row_checksum");
  bad(() => validateRow({ ...row, base_revision: "0".repeat(64) }), "recurrence_packet_row_context");
  bad(() => validateRow({ ...row, kind: "future.unknown" }), "recurrence_packet_kind");
  bad(() => validateRow({ ...row, org_id: "another-org" }), "recurrence_packet_row_context");
  bad(() => validateRow({ ...row, actor_id: "another-writer" }), "recurrence_packet_row_context");
});
test("committed receipt and pending review cannot be interchanged or interpreted as current expiry/COMMIT proof", () => {
  const p = preview(previewArgs(EVENT)), r = makeReceipt(EVENT), committed = sqlRow(r, true);
  committed.expires_at = "2001-01-01T00:00:00.000000Z";
  assert.equal(validateRow(committed).state, "committed");
  bad(() => validateRow(sqlRow(r))); bad(() => validateRow(sqlRow(p, true)));
  bad(() => validateRow({ ...committed, created_at: "2026-11-02T00:00:00.000Z" }), "recurrence_packet_time");
  bad(() => validateRow({ ...committed, freshAuthority: true }));
});
test("owned packet admission refuses getters, proxies, sparse/decorated arrays, cycles and oversize without caller hooks", () => {
  const m = manifest(args(EVENT)); let calls = 0;
  const getter = clone(m); Object.defineProperty(getter.source.data, "title", { enumerable: true, get() { calls++; throw Error("no"); } }); bad(() => validateManifest(getter));
  const proxy = new Proxy(m, { getPrototypeOf() { calls++; throw Error("no"); } }); bad(() => validateManifest(proxy));
  const sparse = clone(m); delete sparse.candidates[0]; bad(() => validateManifest(sparse));
  const decorated = clone(m); decorated.candidates.extra = true; bad(() => validateManifest(decorated));
  const cycle = clone(m); cycle.source = cycle; bad(() => validateManifest(cycle));
  const large = clone(m); large.source.data.title = "x".repeat(RECURRENCE_PACKET_LIMITS.bytes); bad(() => validateManifest(large), "recurrence_packet_limit");
  const hidden = clone(m); Object.defineProperty(hidden, "secret", { value: true }); bad(() => validateManifest(hidden));
  assert.equal(calls, 0);
});
test("manifest keeps deliberate ordinal skips and all original child IDs as data-only reservations", () => {
  const input = clone(EVENT.input); input.schedule.exceptions = [{ sequence: 1, kind: "skip", reason: "Fictional closure" }];
  input.children.shift(); input.titles.shift(); const c = compile(input), m = manifest({ ...args(EVENT), compiled: c });
  assert.deepEqual(m.candidates.map(row => row.sequence), [2]); assert.equal(m.plan.occurrences[0].range, null);
  assert.equal(m.source.id, "fictional-template"); assert.equal(m.candidates[0].id, "fictional-child-2");
});
