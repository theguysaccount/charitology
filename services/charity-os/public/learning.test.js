import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createLearningWorkspace } from "./learning.js";
import { learningHash, numericLiteral, closedPeriod, learningCommitIntent, loadLearningContext, learningSeries, checkedLearningReport } from "./learning-model.js";
import { learningTestDOM } from "./learning-test-dom.js";
import { learningHash as serverHash } from "../lib/learning-json.mjs";
import * as actualNative from "./learning-native-admission.js";

globalThis.crypto ||= webcrypto;
const H = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64), CMD = "11111111-1111-4111-8111-111111111111";
const pin = (id, moduleId = "outcomes") => ({ originOrgId: "org", moduleId, recordId: id, revision: 3, snapshotSha256: H, approvalEventId: "9007199254740993", approvalSha256: H2 });
const head = { originOrgId: "org", bindingId: "binding", sequence: 4, eventSha256: H3 };
const basis = { intendedOutcome: { disposition: "adapted", sourceFields: [], text: "Fictional intended outcome", reason: "Authored explicitly" }, rule: { basis: { disposition: "uncollected", sourceFields: [], text: null, reason: "Not collected" }, whenMet: null, whenNotMet: null }, comparison: { disposition: "uncollected", sourceFields: [], text: null, reason: "Not collected" }, feedback: { disposition: "uncollected", sourceFields: [], text: null, reason: "Not collected" } };
const native = () => ({ format: "charitology-theory-of-change", version: 1, exportedAt: "2026-10-27T00:00:00.000Z", draft: { id: "fictional-draft", name: "Fictional source", problem: "A fictional access problem", source: "A fictional mechanism", depth: null, activities: "", outputs: "", outcomeShort: "Literal outcome", outcomeMedium: "", outcomeLong: "", indicators: [{ what: "A fictional count", how: "", when: "", baseline: "0", target: "" }], assumptions: "", feedbackMethod: "", feedbackFrequency: "", comparison: "", stopRule: "", reviewer: "", reviewDate: "", example: false, createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z" } });
const source = () => ({ format: "charitology-learning-source", version: 1, registrySha256: H, originOrgId: "org", bindingId: "binding", sourceVersion: 1, previousSource: null, receivedAt: "2026-10-27T00:00:00.000Z", originalBytes: 123, originalSha256: H, nativeIdentity: "fictional-draft", sha256: H, adapter: "theory-of-change-native-v1", selection: { kind: "whole-draft" }, selected: { kind: "theory-of-change", value: native() } });
function resolution(id, moduleId, data, eligible = true) { return { recordId: id, record: { id, orgId: "org", moduleId, revision: 3, status: eligible ? "approved" : "draft", ownerId: "author", data }, pin: eligible ? pin(id, moduleId) : null, evidence: eligible ? { pin: pin(id, moduleId) } : null, eligibility: { eligible, code: eligible ? "eligible" : "not-approved", message: eligible ? "Eligible exact final-state approval" : "Needs separate-account final-state approval" } }; }
function contextFixture({ zero = false, unknownUnit = false } = {}) {
  const mapping = { mappingVersion: "learning-mapping-v1", basis, indicators: [{ slot: 1, origin: { kind: "toc-indicator", index: 0 }, title: "Fictional count", unit: unknownUnit ? { kind: "unknown" } : { kind: "defined", text: "participants", quantityKind: "count", definition: "Distinct fictional participants", denominatorDefinition: null }, population: "Fictional cohort", geography: null, plannedPeriod: { kind: "unknown" }, limitations: "Fictional only" }], protocol: { title: "Fictional protocol" } };
  const program = resolution("program", "programs", { title: "Fictional program", kind: "program", evidence: null });
  const definition = resolution("definition", "outcomes", { title: "Fictional indicator", kind: "indicator" });
  const protocol = resolution("protocol", "evaluation", { title: "Fictional protocol", kind: "protocol" });
  const map = { sha256: H, sequence: 1, recordedAt: "2026-10-27T00:00:00.000Z", payload: { kind: "mapped", mappingNumber: 1, mapping, records: [{ recordId: "definition", moduleId: "outcomes" }, { recordId: "protocol", moduleId: "evaluation" }] } };
  const input = { head, mappingEventSha256: H, program: program.pin, protocol: protocol.pin, definition: definition.pin, period: { kind: "closed-days", startDate: "2026-10-01", endDate: "2026-10-07" }, title: "Fictional zero", value: 0, denominator: null, method: "unknown", evidence: "unknown", sourceUrl: null, locator: { kind: "not-collected" }, missingReason: null, limitations: "Fictional limits" };
  const measured = { sha256: H2, sequence: 2, payload: { kind: "measured", input, record: { recordId: "point", moduleId: "outcomes" } } };
  const point = resolution("point", "outcomes", { title: "Fictional zero", kind: "observation", value: 0 });
  const decisionInput = { head, mappingEventSha256: H, program: program.pin, protocol: protocol.pin, observations: zero ? [] : [point.pin], discussedDefinitions: [definition.pin], title: "Fictional review", action: "test", assessment: { result: "unassessable", explanation: "No rule collected", departureReason: null }, feedback: { status: "unknown", summary: "Not collected", sourceUrl: null }, uncertainty: "Uncertain", harms: "Not established", followUp: "2026-11-01", noEvidenceReason: zero ? "No observations selected" : null };
  const decided = { sha256: "d".repeat(64), sequence: 3, payload: { kind: "decided", input: decisionInput, record: { recordId: "decision", moduleId: "evaluation" } } };
  const decision = resolution("decision", "evaluation", { title: "Fictional review", kind: "decision" });
  const binding = { bindingId: "binding", originOrgId: "org", programId: "program", head, originMode: "live", source: { originOrgId: "org", bindingId: "binding", version: 1, sha256: H }, mappingNumber: 1, disposition: "bound" };
  return { binding, mapping: map, source: source(), program, records: [definition, protocol, point, decision], nextCursor: null, events: [map, measured, decided] };
}
function fakeApi(ctx = contextFixture()) {
  const calls = [], ordinary = new Map();
  const api = {
    async records(org, module, cursor, options) { calls.push({ name: "records", args: [org, module, cursor], options }); return { records: [ctx.program.record], nextCursor: null }; },
    async learningBindings(...args) { calls.push({ name: "learningBindings", args }); return { bindings: [ctx.binding], nextCursor: null }; },
    async learningReports(...args) { calls.push({ name: "learningReports", args }); return { reports: [], nextCursor: null }; },
    async learningContext(...args) { calls.push({ name: "learningContext", args }); const { events, ...page } = ctx; return structuredClone(page); },
    async learningBinding(...args) { calls.push({ name: "learningBinding", args }); return { binding: ctx.binding, events: ctx.events, nextCursor: null }; },
    async learningApproval(org, id, options) { calls.push({ name: "learningApproval", args: [org, id], options }); return { resolution: id === "program" ? ctx.program : ordinary.get(id) || ctx.records.find((row) => row.recordId === id) }; },
  };
  for (const name of ["previewLearningMapping", "previewLearningMeasurement", "previewLearningDecision", "previewLearningCorrectionApply", "previewLearningCorrectionAbandon"]) api[name] = async (...args) => {
    calls.push({ name, args });
    return { previewId: "preview", operation: name === "previewLearningMapping" ? "map" : name === "previewLearningDecision" ? "decide" : name === "previewLearningCorrectionAbandon" ? "abandon-correction" : name === "previewLearningCorrectionApply" ? "apply-correction" : args[1].kind === "correction" ? "correct" : "measure", reviewSha256: H, expiresAt: "2026-10-27T00:15:00.000Z", plan: { source: ctx.source, event: { recordedAt: "2026-10-27T00:00:00.000Z", payload: args[1] }, candidates: [], approvedEvidence: [], samePeriodRecordIds: ["existing-same-period"] } };
  };
  api.commitLearning = async (...args) => { calls.push({ name: "commitLearning", args }); return { ok: true, kind: "committed", disposition: "active", result: { outcome: "measured", head, records: [], report: null } }; };
  return { api, calls, ordinary, ctx };
}
function harness(t, config = {}) {
  const dom = learningTestDOM(), service = fakeApi(config.context);
  let authorized = true, dirty = false;
  const view = createLearningWorkspace({ org: "org", role: "owner", api: service.api, isCurrent: () => authorized, onDirty: (value) => { dirty = value; }, makeCommandKey: () => CMD, ...config.options });
  dom.mount(view); t.after(() => { view.dispose(); dom.restore(); });
  const get = (name) => { const result = view.querySelector(`[data-learning="${name}"]`); assert.ok(result, name); return result; };
  const button = (text) => { const result = view.querySelectorAll("button").find((row) => row.textContent === text); assert.ok(result, text); return result; };
  return { ...dom, ...service, view, get, button, revoke() { authorized = false; }, get dirty() { return dirty; }, async field(name, value) { const control = get(name); control.value = value; await control.emit("input"); }, async load() { await get("load").click(); get("binding").value = "binding"; await get("load-context").click(); } };
}

test("client canonical hashing matches actual server namespace with Unicode, null and ordered pins", async () => {
  const value = { text: "Literal \\u0000 text 😀", missing: null, nested: { z: 0, a: -2.5 }, pins: [pin("one"), pin("two")] };
  assert.equal(await learningHash("report", value), serverHash("report", value));
  assert.equal(numericLiteral("0", "Value"), 0); assert.equal(numericLiteral("", "Value"), null);
  for (const value of [" ", "Infinity", "NaN", "1,000", "0x10", "1000000000001"]) assert.throws(() => numericLiteral(value, "Value"));
  assert.deepEqual(closedPeriod("2028-02-29", "2028-03-01"), { kind: "closed-days", startDate: "2028-02-29", endDate: "2028-03-01" });
  assert.throws(() => closedPeriod("2027-02-29", "2027-03-01"));
});

test("commit intent keeps the exact UUIDv4 through timeout, rate-before-receipt, unreadable 422 and 5xx; known rejection releases it", () => {
  const intent = learningCommitIntent(() => CMD), preview = { previewId: "prepared", reviewSha256: H };
  const body = intent.prepare(preview);
  for (const error of [{ status: 0 }, { status: 429, code: "rate" }, { status: 500 }, { status: 422, code: "invalid_response" }, { name: "AbortError" }]) { intent.rejected(error); assert.deepEqual(intent.prepare(preview), body); }
  assert.throws(() => intent.prepare({ ...preview, previewId: "different" }), /Retry/);
  intent.rejected({ status: 409, code: "head_changed" }); assert.equal(intent.pending, null);
});

test("mount is network/storage free and every source form prevents a hidden GET", (t) => {
  const h = harness(t);
  assert.equal(h.calls.length, 0);
  assert.equal(h.view.querySelectorAll("form").length, 5);
  for (const form of h.view.querySelectorAll("form")) { assert.equal(form.getAttribute("method"), "post"); assert.ok(form.handlers.get("submit")?.length); }
  assert.match(h.view.textContent, /Account approval does not establish causal impact/);
});

test("actual compiled native chooser inspects complete bytes and server upload preserves original without filename", async (t) => {
  const h = harness(t); await h.load();
  const bytes = new TextEncoder().encode(JSON.stringify(native())), local = actualNative.inspectLearningNativeValue(bytes, { adapter: "theory-of-change-native-v1", selection: { kind: "whole-draft" } });
  let imports = 0;
  // The default loader is the actual production generated module; it is not
  // imported by workspace construction. This test also independently runs it.
  h.api.inspectLearningSource = async (org, metadata, received, options) => {
    h.calls.push({ name: "inspectLearningSource", args: [org, metadata, received], options });
    assert.deepEqual(received, bytes); assert.equal(metadata.selection.kind, "whole-draft");
    return { inspectionId: "inspection", expiresAt: "2026-10-27T00:15:00.000Z", retainedScope: "whole-toc-export", existingSource: null, source: { ...source(), ...local } };
  };
  const file = { name: "a-private-file-name.json", size: bytes.length, async arrayBuffer() { return bytes.buffer; } };
  h.get("native-file").files = [file]; await h.get("native-file").emit("change");
  assert.equal(h.calls.filter((row) => row.name === "inspectLearningSource").length, 0);
  h.get("source-choice").value = "0"; await h.get("source-choice").emit("change");
  await h.get("source-form").emit("submit");
  assert.equal(h.calls.filter((row) => row.name === "inspectLearningSource").length, 1);
  assert.match(h.get("source-inspection").textContent, /whole-toc-export/);
  assert.doesNotMatch(JSON.stringify(h.calls.map((row) => row.args)), /a-private-file-name/);
  assert.equal(imports, 0);
});

test("mounted measurement keeps explicit zero, actual dates, locator unknown and literal input after preview", async (t) => {
  const h = harness(t); await h.load();
  await h.field("measurement-definition", "definition"); await h.field("measurement-title", "  Literal authored title  ");
  await h.field("measurement-value", "0"); await h.field("measurement-start", "2026-10-01"); await h.field("measurement-end", "2026-10-07"); await h.field("measurement-limits", "Actual limitations");
  await h.get("measurement-form").emit("submit");
  const sent = h.calls.find((row) => row.name === "previewLearningMeasurement").args[1];
  assert.equal(sent.kind, "measurement"); assert.equal(sent.input.value, 0); assert.equal(sent.input.missingReason, null);
  assert.equal(sent.input.title, "  Literal authored title  "); assert.deepEqual(sent.input.locator, { kind: "not-collected" });
  assert.deepEqual(sent.input.period, { kind: "closed-days", startDate: "2026-10-01", endDate: "2026-10-07" });
  assert.equal(sent.input.definition.approvalEventId, "9007199254740993");
  assert.match(h.get("preview").textContent, /Repeated period/);
  assert.equal(h.get("measurement-value").value, "0");
  assert.equal(h.get("commit").disabled, true); h.get("preview-ack").checked = true; await h.get("preview-ack").emit("change"); assert.equal(h.get("commit").disabled, false);
  const beforeHide = h.calls.length;
  await h.button("Hide this preview locally").click();
  assert.equal(h.calls.length, beforeHide); assert.equal(h.get("preview").textContent, "");
  assert.match(h.get("status").textContent, /counted preview slot until 2026-10-27T00:15:00.000Z/);
  assert.equal(h.get("measurement-value").value, "0");
});

test("unknown unit and missing-value errors refuse local measurement without inventing data", async (t) => {
  const h = harness(t, { context: contextFixture({ unknownUnit: true }) }); await h.load();
  await h.field("measurement-definition", "definition"); await h.field("measurement-title", "Missing fictional point"); await h.field("measurement-start", "2026-10-01"); await h.field("measurement-end", "2026-10-07"); await h.field("measurement-missing", "Not collected");
  await h.get("measurement-form").emit("submit");
  assert.match(h.get("status").textContent, /unknown unit/); assert.equal(h.calls.filter((row) => row.name === "previewLearningMeasurement").length, 0);
});

test("unknown commit response retains exact command across Retry and refuses replacement work", async (t) => {
  const h = harness(t); await h.load();
  await h.field("measurement-definition", "definition"); await h.field("measurement-title", "Missing point"); await h.field("measurement-start", "2026-10-01"); await h.field("measurement-end", "2026-10-07"); await h.field("measurement-missing", "Not collected");
  await h.get("measurement-form").emit("submit");
  let tries = 0; const bodies = [];
  h.api.commitLearning = async (org, body) => { bodies.push(structuredClone(body)); if (tries++ === 0) throw Object.assign(new Error("Interrupted"), { status: 0 }); if (tries === 2) throw Object.assign(new Error("Wait before retrying"), { status: 429, code: "rate" }); return { ok: true, kind: "already-committed", disposition: "historical-only", result: { outcome: "measured", head, records: [], report: null } }; };
  h.get("preview-ack").checked = true; await h.get("preview-ack").emit("change"); await h.get("commit").click();
  assert.ok(h.get("retry")); const before = h.calls.length; await h.get("load").click(); assert.equal(h.calls.length, before); assert.match(h.get("status").textContent, /Retry/);
  await h.get("retry").click(); assert.ok(h.get("retry")); await h.get("retry").click(); assert.deepEqual(bodies[0], bodies[1]); assert.deepEqual(bodies[0], bodies[2]); assert.equal(bodies[0].commandKey, CMD); assert.equal(h.get("measurement-missing").value, "Not collected"); assert.match(h.get("saved").textContent, /historical only/);
});

test("zero-observation decision requires explicit discussed definitions and no-evidence reason", async (t) => {
  const h = harness(t); await h.load();
  await h.field("decision-title", "Fictional discussion"); await h.field("decision-action", "test"); await h.field("decision-rule-explanation", "No rule collected"); await h.field("decision-feedback", "Unknown feedback"); await h.field("decision-uncertainty", "Uncertain"); await h.field("decision-harms", "Unknown"); await h.field("decision-follow-up", "2026-11-01");
  await h.get("decision-form").emit("submit"); assert.match(h.get("status").textContent, /Choose one to ten/);
  const check = h.view.querySelector('[data-learning-definition="definition"]'); assert.ok(check, h.get("status").textContent + " :: " + h.get("discussion-definitions").textContent); check.checked = true; await check.emit("change");
  await h.get("decision-form").emit("submit"); assert.match(h.get("status").textContent, /zero-observation/);
  await h.field("decision-no-evidence", "No observations selected for this decision"); await h.get("decision-form").emit("submit");
  const body = h.calls.find((row) => row.name === "previewLearningDecision").args[1]; assert.deepEqual(body.observations, []); assert.deepEqual(body.discussedDefinitions, [pin("definition")]); assert.equal(body.noEvidenceReason, "No observations selected for this decision");
});

test("paging refuses a changed head, repeated cursor and permits explicit unavailable historical resolutions", async () => {
  const ctx = contextFixture(), signal = new AbortController().signal;
  const base = { learningBinding: async () => ({ binding: ctx.binding, events: ctx.events, nextCursor: null }) };
  let count = 0;
  await assert.rejects(loadLearningContext({ ...base, learningContext: async () => ({ ...ctx, binding: { ...ctx.binding, head: count++ ? { ...head, sequence: 5 } : head }, records: [], nextCursor: "again" }) }, "org", "binding", signal, () => {}), /changed/);
  await assert.rejects(loadLearningContext({ ...base, learningContext: async () => ({ ...ctx, records: [], nextCursor: "again" }) }, "org", "binding", signal, () => {}), /Repeated/);
  const missing = { recordId: "unavailable", record: null, pin: null, evidence: null, eligibility: { eligible: false, code: "deleted-or-unavailable", message: "Unavailable" } };
  const result = await loadLearningContext({ ...base, learningContext: async () => ({ ...ctx, records: [...ctx.records, missing], nextCursor: null }) }, "org", "binding", signal, () => {});
  assert.equal(result.records.at(-1).record, null);
});

test("dispose and auth epoch changes suppress late private data and abort active context requests", async (t) => {
  const h = harness(t); await h.get("load").click(); h.get("binding").value = "binding";
  let resolve, signal;
  h.api.learningContext = async (org, id, cursor, options) => { signal = options.signal; return new Promise((done) => { resolve = done; }); };
  const pending = h.get("load-context").click(); await Promise.resolve();
  h.view.dispose(); assert.equal(signal.aborted, true); resolve(h.ctx); await pending;
  assert.doesNotMatch(h.view.textContent, /Fictional source/); assert.equal(h.view.querySelector('[data-learning="context"]'), null);
});

test("correction fold excludes pending/wrong/abandoned candidates and never revives a permanently replaced ancestor", () => {
  const ctx = contextFixture();
  const attempt = { sha256: "e".repeat(64), sequence: 5, payload: { kind: "corrected", input: { measurement: ctx.events[1].payload.input, replaces: pin("point"), reason: "Wrong candidate" }, record: { recordId: "wrong" } } };
  ctx.records.push(resolution("wrong", "outcomes", { kind: "observation", title: "Wrong" }, false)); ctx.events.push(attempt);
  assert.deepEqual(learningSeries(ctx).selectable, []);
  ctx.events.push({ sha256: "f".repeat(64), sequence: 6, payload: { kind: "correction-abandoned", correctionEventSha256: attempt.sha256, candidateRecordId: "wrong", reason: "Known wrong" } });
  assert.deepEqual(learningSeries(ctx).selectable.map((point) => point.recordId), ["point"]);
  const replacement = { ...attempt, sha256: "1".repeat(64), sequence: 7, payload: { ...attempt.payload, record: { recordId: "replacement" } } };
  ctx.records.push(resolution("replacement", "outcomes", { kind: "observation", title: "Replacement" })); ctx.events.push(replacement, { sha256: "2".repeat(64), sequence: 8, payload: { kind: "correction-applied", correctionEventSha256: replacement.sha256, replaces: pin("point"), replacement: pin("replacement") } });
  ctx.records.find((row) => row.recordId === "replacement").eligibility.eligible = false;
  assert.deepEqual(learningSeries(ctx).selectable, []);
});

test("remapping keeps earlier pending corrections visible for deliberate abandonment only", async (t) => {
  const ctx = contextFixture();
  const attempt = { sha256: "e".repeat(64), sequence: 5, payload: { kind: "corrected", input: { measurement: ctx.events[1].payload.input, replaces: pin("point"), reason: "Earlier mapping concern" }, record: { recordId: "old-candidate" } } };
  const remap = { ...ctx.mapping, sha256: "f".repeat(64), sequence: 6, payload: { ...ctx.mapping.payload, mappingNumber: 2, records: [{ recordId: "new-definition", moduleId: "outcomes" }, { recordId: "new-protocol", moduleId: "evaluation" }] } };
  ctx.records.push(resolution("old-candidate", "outcomes", { kind: "observation", title: "Earlier candidate" }), resolution("new-definition", "outcomes", { kind: "indicator", title: "New indicator" }), resolution("new-protocol", "evaluation", { kind: "protocol", title: "New protocol" }));
  ctx.events.push(attempt, remap); ctx.mapping = remap; ctx.binding.head = { ...head, sequence: 6, eventSha256: remap.sha256 };
  assert.deepEqual(learningSeries(ctx).pending.map((event) => event.sha256), [attempt.sha256]);
  assert.deepEqual(learningSeries(ctx).points, []);
  const h = harness(t, { context: ctx }); await h.load();
  assert.match(h.view.textContent, /belongs to an earlier mapping/);
  assert.equal(h.button("Preview applying this approved replacement").disabled, true);
  await h.field(`abandon-${attempt.sha256}`, "  Deliberately close the earlier attempt  ");
  await h.button("Preview deliberate abandonment").click();
  const sent = h.calls.find((row) => row.name === "previewLearningCorrectionAbandon").args[1];
  assert.deepEqual(sent, { head: ctx.binding.head, correctionEventSha256: attempt.sha256, reason: "  Deliberately close the earlier attempt  " });
  assert.equal(h.calls.filter((row) => row.name === "previewLearningCorrectionApply").length, 0);
});

function fakeReport(selected, manifest, digest = H) {
  const body = { format: "charitology-os-report", kind: "learning-review", version: 1, methodVersion: "learning-review-v1", id: "private-report", orgId: "org", title: manifest.title, createdBy: "staff", createdAt: "2026-10-27T00:00:00.000Z", audience: "private-staff", selection: { selection: selected, manifest: pin("manifest", "reporting"), sourceDigest: digest }, manifest, basis, assessment: { result: "unassessable", explanation: "No rule collected", departureReason: null }, feedback: { status: "unknown", summary: "Unknown", sourceUrl: null }, sources: [source()], approvedEvidence: [{ pin: selected.decision, snapshot: { data: { decision: "test" } } }], events: [], exclusions: [], boundaries: [], supersedes: null };
  return { ...body, checksum: serverHash("report", body) };
}

test("mounted manifest sequence computes without saving, explicitly saves digest, then uses exact current approval for freeze", async (t) => {
  const h = harness(t); await h.load();
  await h.field("report-decision", "decision"); await h.field("manifest-title", "Private fictional review"); await h.field("manifest-start", "2026-10-01"); await h.field("manifest-end", "2026-10-07"); await h.field("manifest-summary", "Fictional summary"); await h.field("manifest-missingness", "Unknown feedback");
  let record, updates = [], preparedSelection, final;
  h.api.createRecord = async (org, moduleId, payload) => { record = { id: "manifest", orgId: org, moduleId, data: payload.data, revision: 1, status: "draft", ownerId: "author" }; return { record }; };
  h.api.updateRecord = async (org, moduleId, id, payload) => { updates.push(structuredClone(payload)); record = { ...record, data: payload.data, revision: payload.revision + 1, status: "draft" }; return { record }; };
  h.api.prepareLearningReport = async (org, body) => { preparedSelection = body.selection; return { sourceDigest: H2, selectionSha256: H, manifest: { moduleId: "reporting", recordId: "manifest", revision: 1, dataSha256: H }, requiresSave: true, requiresApproval: true, exclusions: [] }; };
  h.api.previewLearningReport = async (org, body) => { final = body; return { previewId: "freeze-preview", operation: "freeze", reviewSha256: H3, expiresAt: "2026-10-27T00:15:00.000Z", frozenManifest: { moduleId: "reporting", recordId: "manifest", revision: 5, dataSha256: H }, report: fakeReport(body.selection, record.data, body.sourceDigest) }; };
  await h.get("manifest-form").emit("submit");
  assert.equal(record.data.sourceDigest, null); assert.deepEqual(record.data.outcomeIds, ["point"]); assert.equal(record.data.visibility, "private"); assert.equal(record.data.assemblyMethod, "learning-review-v1");
  await h.get("prepare-report").click();
  assert.equal(updates.length, 0); assert.deepEqual(preparedSelection.definitions, [pin("definition")]); assert.deepEqual(preparedSelection.observations, [pin("point")]);
  await h.button("Save this prepared digest as an ordinary new revision").click();
  assert.equal(updates.length, 1); assert.equal(updates[0].data.sourceDigest, H2); assert.equal(updates[0].revision, 1); assert.match(h.get("status").textContent, /Final-state approval is still required/);
  const approved = resolution("manifest", "reporting", record.data); approved.record = { ...record, revision: 5, status: "approved" }; approved.pin = { ...approved.pin, revision: 5 }; approved.evidence.pin = approved.pin; h.ordinary.set("manifest", approved);
  await h.button("Load known manifest and its exact approval").click(); await h.get("preview-report").click();
  assert.equal(final.manifest.revision, 5); assert.equal(final.sourceDigest, H2); assert.equal(final.selection.manifestRecordId, "manifest"); assert.match(h.get("preview").textContent, /Private fictional review/); assert.match(h.get("preview").textContent, /Prepared/);
});

test("an unresolved ordinary manifest create is not blindly repeated; typed known-ID reload resolves it", async (t) => {
  const h = harness(t); await h.load(); await h.field("report-decision", "decision"); await h.field("manifest-start", "2026-10-01"); await h.field("manifest-end", "2026-10-07");
  let creates = 0; h.api.createRecord = async () => { creates++; throw Object.assign(new Error("Interrupted ordinary response"), { status: 0 }); };
  await h.get("manifest-form").emit("submit"); await h.get("manifest-form").emit("submit");
  assert.equal(creates, 1); assert.match(h.get("status").textContent, /earlier ordinary create response is unresolved/);
});

test("pending wrong candidate can be abandoned without approval, then explicitly trashed", async (t) => {
  const ctx = contextFixture();
  const attempt = { sha256: "e".repeat(64), sequence: 5, payload: { kind: "corrected", input: { measurement: ctx.events[1].payload.input, replaces: pin("point"), reason: "Wrong value" }, record: { recordId: "wrong" } } };
  ctx.events.push(attempt); ctx.records.push(resolution("wrong", "outcomes", { kind: "observation", title: "Known wrong draft" }, false));
  const h = harness(t, { context: ctx }); await h.load();
  assert.equal(h.button("Preview applying this approved replacement").disabled, true);
  await h.field(`abandon-${attempt.sha256}`, "The candidate is known wrong; abandon it deliberately"); await h.button("Preview deliberate abandonment").click();
  const body = h.calls.find((row) => row.name === "previewLearningCorrectionAbandon").args[1]; assert.equal(body.correctionEventSha256, attempt.sha256); assert.equal(body.reason, "The candidate is known wrong; abandon it deliberately");
  ctx.events.push({ sha256: "f".repeat(64), sequence: 6, payload: { kind: "correction-abandoned", correctionEventSha256: attempt.sha256, candidateRecordId: "wrong", reason: body.reason } });
  await h.get("load-context").click();
  let trash; h.api.deleteRecord = async (...args) => { trash = args; return { ok: true }; };
  const check = h.view.querySelectorAll("label").find((row) => row.textContent.includes("I deliberately want to trash")); check.querySelector("input").checked = true; await check.querySelector("input").emit("change");
  await h.button("Trash this abandoned ordinary draft").click(); assert.deepEqual(trash.slice(0, 4), ["org", "outcomes", "wrong", 3]); assert.match(h.get("status").textContent, /explicitly trashed/);
});

test("private report consistency refuses tamper/foreign family and output reauthorizes instead of trusting screen cache", async (t) => {
  const ctx = contextFixture(), selected = { decision: pin("decision", "evaluation") }, report = fakeReport(selected, { title: "Fictional private report", startDate: "2026-10-01", endDate: "2026-10-07", summary: "Fictional", missingness: "Unknown" });
  assert.equal((await checkedLearningReport(report)).checksum, report.checksum);
  await assert.rejects(checkedLearningReport({ ...report, title: "Tampered" }), /checksum/);
  await assert.rejects(checkedLearningReport({ ...report, kind: "grant-period" }), /could not be verified/);
  const downloads = [], printed = [];
  const h = harness(t, { options: { download: (...args) => downloads.push(args), print: (value) => printed.push(value) } });
  h.get("report-choice").value = report.id;
  let reads = 0; h.api.learningReport = async () => { reads++; return { report }; }; h.api.exportLearningReport = async () => report;
  await h.button("Read selected private report").click(); assert.equal(reads, 1);
  await h.get("export-report").click(); assert.equal(downloads.length, 1); assert.equal(JSON.parse(downloads[0][1]).checksum, report.checksum);
  await h.get("print-report").click(); assert.equal(reads, 2); assert.equal(printed.length, 1);
  h.api.learningReport = async () => { throw Object.assign(new Error("Access revoked"), { status: 403 }); };
  await h.get("print-report").click(); assert.equal(printed.length, 1); assert.doesNotMatch(h.view.textContent, /Fictional private report/);
});

test("pagehide/BFCache clears private source material without an automatic GET", async (t) => {
  const h = harness(t); await h.load(); assert.match(h.view.textContent, /Fictional source/);
  const before = h.calls.length; await h.window.emit("pagehide"); assert.doesNotMatch(h.view.textContent, /Fictional source/);
  await h.window.emit("pageshow", { persisted: true }); assert.equal(h.calls.length, before); assert.match(h.get("status").textContent, /Reopen Learning and review/);
});

test("mounted nonprofit chooser uses whole-file codec and uploads full original while retaining only one selected row", async (t) => {
  const h = harness(t); await h.load(); await h.field("adapter", "nonprofit-learning-native-v1"); await h.get("adapter").emit("change");
  const fileValue = { version: 1, program: "nonprofit-advisory", updated: "2026-10-27T00:00:00.000Z", context: { name: "Fictional program", activity: "Fictional activity", decision: "Fictional decision", change: "Fictional change", baseline: "0", capacity: "Unknown", voice: "Not collected", privacy: "Fictional only", period: "Unknown" }, records: { diagnostics: [], evidence: [], actions: [], learning: [
    { id: "selected-row", values: { title: "Selected fictional row", outcome: "Literal outcome", method: "A narrative method", rule: "A qualitative rule", feedback: "Unknown", result: "Narrative, never a number", date: "", status: "Draft" } },
    { id: "unselected-row", values: { title: "Unselected native text \u0000", outcome: "Unknown", method: "Unknown", rule: "Unknown", feedback: "Unknown", result: "Unknown", date: "", status: "Draft" } },
  ], readiness: [] } };
  const bytes = new TextEncoder().encode(JSON.stringify(fileValue));
  let received;
  h.api.inspectLearningSource = async (org, metadata, original) => {
    received = original; const selected = actualNative.inspectLearningNativeValue(original, { adapter: metadata.adapter, selection: metadata.selection });
    return { inspectionId: "nonprofit-inspection", expiresAt: "2026-10-27T00:15:00.000Z", retainedScope: "context-and-one-learning-row", existingSource: null, source: { ...source(), ...selected } };
  };
  h.get("native-file").files = [{ size: bytes.length, async arrayBuffer() { return bytes.buffer; } }]; await h.get("native-file").emit("change");
  assert.match(h.get("source-choice").textContent, /Selected fictional row/, h.get("status").textContent); assert.match(h.get("source-choice").textContent, /Unselected native text/);
  h.get("source-choice").value = "0"; await h.get("source-choice").emit("change"); await h.get("source-form").emit("submit");
  assert.deepEqual(received, bytes); assert.match(h.get("source-inspection").textContent, /context-and-one-learning-row/); assert.doesNotMatch(h.get("source-inspection").textContent, /unselected-row/);
});

test("contributor authoring does not make a forbidden report request during ordinary workspace load", async (t) => {
  const h = harness(t, { options: { role: "contributor", canExport: false } }); await h.get("load").click();
  assert.equal(h.calls.filter((row) => row.name === "learningReports").length, 0); assert.equal(h.view.querySelector('[data-learning="manifest-form"]'), null); assert.equal(h.view.querySelector('[data-learning="export-report"]'), null); assert.match(h.view.textContent, /contributor role does not gain export authority/);
});

test("binding choice change invalidates an existing review preview while keeping literal observation text", async (t) => {
  const h = harness(t); await h.load(); await h.field("measurement-definition", "definition"); await h.field("measurement-title", "Literal unfinished point"); await h.field("measurement-start", "2026-10-01"); await h.field("measurement-end", "2026-10-07"); await h.field("measurement-missing", "Missing explicitly");
  await h.get("measurement-form").emit("submit"); assert.ok(h.get("commit"));
  h.get("binding").value = "another-binding"; await h.get("binding").emit("change"); assert.equal(h.get("preview").textContent, ""); assert.equal(h.get("measurement-title").value, "Literal unfinished point");
  await h.get("measurement-form").emit("submit"); assert.match(h.get("status").textContent, /Load the current live binding context/);
});

test("context reload keeps literal correction-abandonment reason and earlier checked approval identity", async (t) => {
  const ctx = contextFixture(), attempt = { sha256: "e".repeat(64), sequence: 5, payload: { kind: "corrected", input: { measurement: ctx.events[1].payload.input, replaces: pin("point"), reason: "Wrong" }, record: { recordId: "wrong" } } };
  ctx.events.push(attempt); ctx.records.push(resolution("wrong", "outcomes", { kind: "observation", title: "Wrong draft" }, false));
  const h = harness(t, { context: ctx }); await h.load(); await h.field(`abandon-${attempt.sha256}`, "  Keep this exact unfinished abandonment reason  "); await h.get("load-context").click();
  assert.equal(h.get(`abandon-${attempt.sha256}`).value, "  Keep this exact unfinished abandonment reason  ");
});

test("a selected point approval refresh cannot silently substitute a new revision", async (t) => {
  const h = harness(t); await h.load();
  const check = h.view.querySelector('[data-learning-point="point"]'); check.checked = true; await check.emit("change");
  const point = h.ctx.records.find((row) => row.recordId === "point"); point.record.revision = 4; point.pin = { ...point.pin, revision: 4 }; point.evidence.pin = point.pin;
  await h.get("load-context").click(); await h.get("decision-form").emit("submit");
  assert.match(h.get("status").textContent, /approval changed after selection/);
  assert.equal(h.calls.some((row) => row.name === "previewLearningDecision"), false);
});

test("an unavailable earlier indicator never shifts a later indicator's unit or mapping slot", async (t) => {
  const ctx = contextFixture({ unknownUnit: true });
  const second = resolution("second-definition", "outcomes", { title: "Second exact indicator", kind: "indicator" });
  ctx.mapping.payload.mapping.indicators.push({ ...ctx.mapping.payload.mapping.indicators[0], slot: 2, unit: { kind: "defined", text: "visits", quantityKind: "count", definition: "Explicit second-slot count", denominatorDefinition: null } });
  ctx.mapping.payload.records.splice(1, 0, { recordId: second.recordId, moduleId: "outcomes" });
  ctx.records[0] = { recordId: "definition", record: null, pin: null, evidence: null, eligibility: { eligible: false, code: "deleted-or-unavailable", message: "Unavailable" } }; ctx.records.push(second);
  const h = harness(t, { context: ctx }); await h.load();
  assert.match(h.get("discussion-definitions").textContent, /Slot 2/);
  await h.field("measurement-definition", second.recordId); await h.field("measurement-title", "Explicit second-slot observation"); await h.field("measurement-value", "0"); await h.field("measurement-start", "2026-10-01"); await h.field("measurement-end", "2026-10-07");
  await h.get("measurement-form").emit("submit");
  assert.equal(h.calls.find((row) => row.name === "previewLearningMeasurement")?.args[1].input.definition.recordId, second.recordId);
});
