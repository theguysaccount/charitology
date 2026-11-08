/** Explicit CRM-only PG17.11 entry. Not included by legacy *.test.mjs. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash } from "node:crypto";
import { createCrmCi17Profile } from "./fixtures/contact-reconciliation-ci17-profile.mjs";
import { openCrmCi17Fixture, closeCrmCi17Fixture, requireCrmCi17Fixture } from "./fixtures/contact-reconciliation.mjs";
import { CRM_CASE_NAMES, runCrmCases } from "./fixtures/contact-reconciliation-cases.mjs";
import sql from "./fixtures/contact-reconciliation-sql.json" with { type: "json" };
import absentGolden from "../test/fixtures/contact-reconciliation-legacy75-v1.json" with { type: "json" };
import catalogVectors from "../test/fixtures/contact-schema-column-vectors-v1.json" with { type: "json" };

let profile, fixture, caps, modules, caseWork, result, failed = false, registered = false;
const completed = [], artifacts = [];
const emit = value => { const text = JSON.stringify(value); assert(Buffer.byteLength(text) <= 2097152); process.stdout.write(text + "\n"); };
async function actualModules() { return {
  database: await import("../lib/database.mjs"), security: await import("../lib/security.mjs"),
  handler: await import("../lib/handler.mjs"), backup: await import("../lib/backup.mjs"),
  workspace: await import("../lib/workspace-backup.mjs"), learning: await import("../lib/learning-capacity.mjs"),
  crmModel: await import("../lib/contact-reconciliation-model.mjs"), crmContext: await import("../lib/contact-reconciliation-context.mjs"),
  crmPreview: await import("../lib/contact-reconciliation-preview.mjs"), crmReport: await import("../lib/contact-reconciliation-report.mjs"),
  crmStore: await import("../lib/contact-reconciliation-store.mjs"), crmRecovery: await import("../lib/contact-reconciliation-recovery.mjs"),
  crmCatalog: await import("../lib/contact-context-catalog.mjs"),
}; }
try {
  profile = await createCrmCi17Profile();
  assert.equal(CRM_CASE_NAMES.length, 16); assert.equal(new Set(CRM_CASE_NAMES).size, 16);
  assert(CRM_CASE_NAMES.every((name, i) => name.startsWith("CRM" + String(i + 1).padStart(2, "0") + " ")));
  before(async () => {
    try { fixture = await openCrmCi17Fixture(profile); caps = requireCrmCi17Fixture(fixture); modules = await actualModules(); }
    catch { failed = true; throw Error("CRM_CI17_FIXTURE_PREPARATION_REFUSED"); }
  });
  // One real Node test executes all sixteen sequential business cases. The
  // numbered JSON records distinguish cases; no TAP subtest count is invented.
  test("CRM actual sixteen-case handler and SQL journey", async () => {
    try {
      caseWork = runCrmCases({ ...caps, modules, sql, absentGolden, catalogVectors, expectedServerVersionNum: 170011,
        onCase: async value => {
          assert(value.number === completed.length + 1 && value.name === CRM_CASE_NAMES[value.number - 1]); completed.push(value);
          const { number, name, status, code, diagnostic, lastCalls } = value;
          emit({ format: "crm-business-ci17-case", number, name, status, ...(code ? { code } : {}), ...(diagnostic ? { diagnostic } : {}), ...(lastCalls ? { lastCalls } : {}) });
        },
        onArtifact: async (name, value) => {
          const text = JSON.stringify(value); assert(/^[a-z0-9-]+\.json$/.test(name) && Buffer.byteLength(text) <= 2097152);
          const ref = { name, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };
          assert(!artifacts.some(x => x.name === name)); artifacts.push(ref);
          emit({ format: "crm-business-ci17-artifact-digest", ...ref, bodyRetainedInCiLog: false });
        },
      });
      caps.track(caseWork); result = await caseWork;
      assert.equal(result.tests, 16); assert.equal(result.pass, 16); assert.equal(result.caseWorkSettled, true); assert.equal(result.providerCalls, 0);
      assert.equal(completed.length, 16); assert(completed.every((x, i) => x.number === i + 1 && x.name === CRM_CASE_NAMES[i] && x.status === "PASS"));
    } catch { failed = true; throw Error("CRM_CI17_CASE_JOURNEY_REFUSED"); }
  });
  after(async () => {
    let cleanupError = false;
    // No teardown before the real command journey promise settles, including
    // a failure. Fixed per-query/startup and CI job bounds remain independent.
    if (caseWork) await Promise.allSettled([caseWork]);
    try { if (fixture) emit(await closeCrmCi17Fixture(fixture, failed ? Error("CRM_CI17_PRIOR_FAILURE") : null)); }
    catch { cleanupError = true; }
    try {
      const final = await profile.finish(); emit(final);
      assert(!cleanupError && !failed && result && completed.length === 16 && result.tests === 16 && result.pass === 16 && result.caseWorkSettled && result.providerCalls === 0);
      emit({ format: "crm-business-ci17-final-cases", version: 1, tests: 16, pass: 16, fail: 0, skip: 0,
        syntheticAuthNotRealSignIn: true, expiredRowSqlSeamNotNaturalExpiry: true, postCommitSuppressedValueNotSocket: true,
        quotaBallastCounterfactualNotCrmMaximum: true, actualNative64Attainment: false, nodeTestCount: 1,
        artifactDigestsOnly: artifacts, cleanupVerified: final.cleanupVerified, sourceCommit: final.sourceCommit, sourceTree: final.sourceTree,
        actualServerVersion: final.actualServerVersion, actualServerVersionNum: final.actualServerVersionNum });
    } catch { throw Error("CRM_CI17_FINAL_REFUSED"); }
    finally { await profile.abandon(); }
  }); registered = true;
} catch {
  if (profile && !registered) await profile.abandon();
  process.stderr.write("CRM_CI17_PRETEST_REFUSAL\n"); process.exitCode = 1;
}
