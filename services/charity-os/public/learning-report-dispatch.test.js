import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { learningHash, checkedLearningReport } from "./learning-model.js";
import { ApiError } from "./api.js";
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const implementation = app.slice(app.indexOf("async function showReport(id)"), app.indexOf("\nfunction renderData()"));
async function report() {
  const body = { format: "charitology-os-report", kind: "learning-review", version: 1, methodVersion: "learning-review-v1", id: "saved-learning", orgId: "org", title: "Fictional", createdBy: "staff", createdAt: "2026-10-27T00:00:00.000Z", audience: "private-staff", selection: { selection: {} }, manifest: {}, basis: {}, assessment: {}, feedback: {}, sources: [{}], approvedEvidence: [], events: [], exclusions: [], boundaries: [], supersedes: null };
  return { ...body, checksum: await learningHash("report", body) };
}
function controller(api, checker = checkedLearningReport) {
  const state = { org: "org", session: { user: { id: "staff" } }, epoch: 1, route: "reports", reportReadAbort: null, reportReadSequence: 0 }, location = { hash: "#reports" };
  let legacyTouches = 0;
  const context = { state, location, api, ApiError, checkedLearningReport: checker, AbortController, setTimeout, clearTimeout, node() { legacyTouches++; throw new Error("Legacy reader touched"); } };
  vm.runInNewContext(`${implementation}\nglobalThis.show = showReport;`, context);
  return { state, location, show: context.show, get legacyTouches() { return legacyTouches; } };
}

test("actual generic consumer recognizes learning family before legacy modules and opens the private reader", async () => {
  const saved = await report(), c = controller({ report: async () => ({ report: saved }) });
  await c.show(saved.id); assert.equal(c.location.hash, "#learning/saved-learning"); assert.equal(c.legacyTouches, 0);
  const unknown = controller({ report: async () => ({ report: { ...saved, kind: "future", methodVersion: "learning-future-v99", modules: [] } }) });
  await assert.rejects(unknown.show(saved.id), /could not be verified/); assert.equal(unknown.legacyTouches, 0); assert.equal(unknown.location.hash, "#reports");
  const missing = controller({ report: async () => ({ report: { title: "Malformed", methodVersion: "unrecognized" } }) });
  await assert.rejects(missing.show("missing"), /format is unavailable/); assert.equal(missing.legacyTouches, 0);
});

test("generic learning read cannot redirect or emit an old failure after route/session/epoch changes", async () => {
  let resolve;
  const c = controller({ report: async () => new Promise((done) => { resolve = done; }) });
  const pending = c.show("saved-learning"); c.state.epoch++; resolve({ report: await report() }); await pending;
  assert.equal(c.location.hash, "#reports"); assert.equal(c.legacyTouches, 0);
  let reject;
  const stale = controller({ report: async () => new Promise((done, fail) => { reject = fail; }) });
  const old = stale.show("saved-learning"); stale.state.session = { user: { id: "new-session" } }; reject(Object.assign(new Error("Old forbidden response"), { status: 403 })); await old; assert.equal(stale.location.hash, "#reports");
});

test("generic report hash verification is guarded and exact org/report identity is required", async () => {
  const saved = await report(); let finish;
  const c = controller({ report: async () => ({ report: saved }) }, async (value) => { await new Promise((resolve) => { finish = resolve; }); return checkedLearningReport(value); });
  const pending = c.show(saved.id); while (!finish) await Promise.resolve(); c.state.epoch++; finish(); await pending; assert.equal(c.location.hash, "#reports");
  const wrong = controller({ report: async () => ({ report: saved }) }); await assert.rejects(wrong.show("other-id"), /identity could not be verified/); assert.equal(wrong.location.hash, "#reports");
});
