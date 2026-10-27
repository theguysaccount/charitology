// Execute real D1 facade and mounted controls with scheduled native-file-like reads.
// These are synthetic DOM/storage checks, separate from controlled Chrome acceptance.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  installD1Dom,
  settle,
  fileOf,
  delayedFile,
} from "../test-fixtures/donor-recovery/ui-dom.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const output = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/donor-recovery.ts';export * from './src/lib/client/donor-recovery-controls.ts';export * from './src/lib/client/donor-recovery-formats.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const temp = await mkdtemp(join(tmpdir(), "charitology-d1-controls-"));
await writeFile(join(temp, "actual.mjs"), output.outputFiles[0].text);
const m = await import(pathToFileURL(join(temp, "actual.mjs")));
let groups = 0;
async function check(name, action) {
  try {
    await action();
    groups++;
    console.log("✓ " + name);
  } catch (error) {
    error.message = name + ": " + error.message;
    throw error;
  }
}
const stamp = "2026-10-27T16:00:00.000Z";
const gift = (id = "fictional-a") => ({
  id,
  date: "2026-10-27",
  organization: "Fictional example only",
  amount: 10,
  cause: "other",
  depth: null,
  note: "Synthetic recovery fixture",
  sample: true,
});
const backup = (gifts = [gift()]) =>
  m.d1IndividualBackup("gifts", gifts, stamp);
const criteria = [
  "depth",
  "evidence",
  "counterfactual",
  "feedback",
  "voice",
  "cost",
  "durability",
  "team",
  "harm",
];
const weights = (value) =>
  Object.fromEntries(criteria.map((id) => [id, value]));
const proposal = (id = "fictional-grant-a") => ({
  id,
  name: "Fictional proposal only",
  scores: Object.fromEntries(criteria.map((id) => [id, null])),
  notes: Object.fromEntries(criteria.map((id) => [id, ""])),
  savedAt: stamp,
});
const grantSource = (id = "fictional-grant-a") =>
  m.d1GrantBundle({
    format: "charitology-grant-workspace",
    version: 1,
    exportedAt: stamp,
    members: [
      {
        key: "grant-proposals",
        presence: "value",
        persistence: "saved",
        value: [proposal(id)],
      },
      {
        key: "grant-weights",
        presence: "value",
        persistence: "saved",
        value: weights(2),
      },
      {
        key: "grant-draft",
        presence: "value",
        persistence: "saved",
        value: proposal(id),
      },
    ],
  });
async function mountedGrant(initial = {}) {
  const dom = installD1Dom(initial),
    view = m.createD1ViewTracker();
  const grant = await m.openD1GrantCoordinator({
    view,
    storage: dom.storage,
    locks: dom.locks,
  });
  const controls = m.mountD1GrantRecoveryControls({
    host: dom.host,
    editor: dom.editor,
    coordinator: grant,
    view,
  });
  return { ...dom, dom, view, grant, controls };
}
async function grantReady(d) {
  await settle(() => d.action("preview-step").hidden === false);
}
async function grantStep(d) {
  await d.action("preview-step").click();
  await settle(() => d.action("apply-step").hidden === false);
  await d.action("apply-step").click();
  await settle(
    () =>
      d.action("apply-step").hidden === true &&
      !d.action("preview-step").disabled,
  );
}
async function mounted(initial = {}, dependencies = {}) {
  const dom = installD1Dom(initial),
    view = m.createD1ViewTracker();
  const session = await m.openD1ToolSession("gifts", {
    view,
    storage: dom.storage,
    locks: dom.locks,
    ...dependencies,
  });
  const controls = m.mountD1RecoveryControls({ host: dom.host, session, view });
  return { ...dom, dom, view, session, controls };
}
async function ready(d) {
  await settle(() => d.action("apply-restore").hidden === false);
}
async function expectNoApply(d) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(d.action("apply-restore").hidden, true);
}
try {
  await check(
    "mount refuses copied session or a different owned view",
    async () => {
      const d = await mounted();
      assert.throws(() =>
        m.mountD1RecoveryControls({
          host: d.host,
          session: { ...d.session },
          view: d.view,
        }),
      );
      assert.throws(() =>
        m.mountD1RecoveryControls({
          host: d.host,
          session: d.session,
          view: m.createD1ViewTracker(),
        }),
      );
      d.controls.dispose();
    },
  );
  await check(
    "a late valid file A cannot reauthorize after invalid file B",
    async () => {
      const d = await mounted(),
        a = delayedFile(backup());
      await d.choose(a.file);
      await d.choose(fileOf("{invalid B"));
      await settle(() =>
        /JSON|parse|Invalid|invalid|Expected|expected|Unexpected/i.test(
          d.say(),
        ),
      );
      a.finish();
      await expectNoApply(d);
      assert.equal(d.values.has("charitology.gifts"), false);
      d.controls.dispose();
    },
  );
  await check(
    "clearing the file selection immediately invalidates its previous read",
    async () => {
      const d = await mounted(),
        a = delayedFile(backup());
      await d.choose(a.file);
      await d.choose(null);
      a.finish();
      await expectNoApply(d);
      d.controls.dispose();
    },
  );
  await check(
    "new form input invalidates an unfinished file read",
    async () => {
      const d = await mounted(),
        a = delayedFile(backup());
      await d.choose(a.file);
      d.view.changedForm();
      d.controls.noteViewMutation();
      a.finish();
      await expectNoApply(d);
      assert.equal(d.view.snapshot().hasUnsubmittedForm, true);
      d.controls.dispose();
    },
  );
  await check(
    "the original corrupt string and newly observed B/C remain separate exports",
    async () => {
      const rawA = "{original A\ud800",
        rawB = "{foreign B",
        rawC = "{foreign C";
      const d = await mounted({ gifts: rawA });
      d.values.set("charitology.gifts", rawB);
      await d.choose(fileOf(backup()));
      await settle(() => /chang|another|external/i.test(d.say()));
      assert.equal(d.session.protectedRawCopy(), rawA);
      assert.equal(d.session.observedRawCopy(), rawB);
      await d.action("protected").click();
      await d.action("observed").click();
      assert.equal(
        m.parseD1RawRecovery(await d.downloads.at(-2).blob.text()).raw,
        rawA,
      );
      assert.equal(
        m.parseD1RawRecovery(await d.downloads.at(-1).blob.text()).raw,
        rawB,
      );
      d.values.set("charitology.gifts", rawC);
      await d.choose(fileOf(backup()));
      await settle(() => /chang|another|external/i.test(d.say()));
      assert.equal(d.session.protectedRawCopy(), rawA);
      assert.equal(d.session.observedRawCopy(), rawC);
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      d.controls.dispose();
    },
  );
  await check(
    "a foreign write after preview blocks Apply without replacing it",
    async () => {
      const d = await mounted({ gifts: [] });
      await d.choose(fileOf(backup()));
      await ready(d);
      const foreign = JSON.stringify([gift("foreign-b")]);
      d.values.set("charitology.gifts", foreign);
      await d.action("apply-restore").click();
      await settle(() => /chang|another|external/i.test(d.say()));
      assert.equal(d.values.get("charitology.gifts"), foreign);
      assert.equal(d.dom.reloads, 0);
      d.controls.dispose();
    },
  );
  await check(
    "valid individual preview has a separate explicit Apply and touches only its key",
    async () => {
      const d = await mounted({ gifts: [] });
      await d.choose(fileOf(backup()));
      await ready(d);
      assert.equal(d.values.get("charitology.gifts"), "[]");
      await d.action("apply-restore").click();
      await settle(() => d.dom.reloads === 1);
      assert.deepEqual(JSON.parse(d.values.get("charitology.gifts")), [gift()]);
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      assert.ok(d.lockNames.every((name) => name === "charitology.gifts"));
      d.controls.dispose();
    },
  );
  await check(
    "dirty HTML requires a captured discard choice before restore",
    async () => {
      const d = await mounted({ gifts: [] });
      d.view.changedForm();
      d.controls.noteViewMutation();
      await d.choose(fileOf(backup()));
      await settle(() => /discard|unsaved|unsubmitted/i.test(d.say()));
      assert.equal(d.action("apply-restore").hidden, true);
      const discard = d.field("d1Discard");
      discard.checked = true;
      await discard.fire("change");
      await d.choose(fileOf(backup()));
      await ready(d);
      d.controls.dispose();
    },
  );
  await check(
    "a changed discard choice revokes an already displayed preview",
    async () => {
      const d = await mounted({ gifts: [] });
      await d.choose(fileOf(backup()));
      await ready(d);
      const discard = d.field("d1Discard");
      discard.checked = true;
      await discard.fire("change");
      assert.equal(d.action("apply-restore").hidden, true);
      d.controls.dispose();
    },
  );
  await check(
    "newer form input requires a new discard choice even for a fresh file preview",
    async () => {
      const d = await mounted({ gifts: [] }),
        discard = d.field("d1Discard");
      discard.checked = true;
      await discard.fire("change");
      d.view.changedForm();
      d.controls.noteViewMutation();
      assert.equal(discard.checked, false);
      await d.choose(fileOf(backup()));
      await settle(() => /discard|unsaved|unsubmitted/i.test(d.say()));
      assert.equal(d.action("apply-restore").hidden, true);
      discard.checked = true;
      await discard.fire("change");
      await d.choose(fileOf(backup()));
      await ready(d);
      d.controls.dispose();
    },
  );
  await check(
    "removal is previewed separately and only removes the selected key",
    async () => {
      const d = await mounted({ gifts: [gift()] });
      await d.action("preview-remove").click();
      await settle(() => d.action("apply-remove").hidden === false);
      assert.equal(d.values.has("charitology.gifts"), true);
      await d.action("apply-remove").click();
      await settle(() => d.dom.reloads === 1);
      assert.equal(d.values.has("charitology.gifts"), false);
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      d.controls.dispose();
    },
  );
  await check(
    "failed valid save exports memory and exact retry without losing the old disk copy",
    async () => {
      const d = await mounted({ gifts: [] });
      d.dom.behavior.failWrite = true;
      d.view.changedForm();
      const capture = d.session.captureSave([gift()]);
      const saved = await d.session.saveCaptured(capture);
      assert.equal(saved.outcome, "unsaved");
      d.controls.refresh();
      assert.equal(d.action("retry").disabled, false);
      await d.action("backup").click();
      await settle(() => d.downloads.length === 1);
      assert.deepEqual(
        m.parseD1IndividualBackup(await d.downloads[0].blob.text(), "gifts"),
        [gift()],
      );
      assert.equal(d.values.get("charitology.gifts"), "[]");
      d.dom.behavior.failWrite = false;
      await d.action("retry").click();
      await settle(() => !d.session.snapshot().unsaved);
      assert.deepEqual(JSON.parse(d.values.get("charitology.gifts")), [gift()]);
      d.controls.dispose();
    },
  );
  await check(
    "saving unavailable stays read-only while valid backup remains usable",
    async () => {
      const d = await mounted({ gifts: [gift()] }, { locks: null });
      assert.equal(d.session.snapshot().canWrite, false);
      assert.equal(d.action("preview-remove").disabled, true);
      await d.action("backup").click();
      await settle(() => d.downloads.length === 1);
      assert.deepEqual(
        m.parseD1IndividualBackup(await d.downloads[0].blob.text(), "gifts"),
        [gift()],
      );
      assert.equal(d.dom.reloads, 0);
      d.controls.dispose();
    },
  );
  await check(
    "beforeunload warns for raw fields and a disposed controller stops warning",
    async () => {
      const d = await mounted();
      let warnings = 0;
      d.view.changedForm();
      await d.window.fire("beforeunload", {
        preventDefault() {
          warnings++;
        },
      });
      assert.equal(warnings, 1);
      d.controls.dispose();
      await d.window.fire("beforeunload", {
        preventDefault() {
          warnings++;
        },
      });
      assert.equal(warnings, 1);
    },
  );
  await check(
    "a storage notice invalidates a displayed Apply without adopting foreign bytes",
    async () => {
      const d = await mounted({ gifts: [] });
      await d.choose(fileOf(backup()));
      await ready(d);
      const before = d.session.snapshot().value;
      d.values.set("charitology.gifts", JSON.stringify([gift("b")]));
      await d.window.fire("storage", { key: "charitology.gifts" });
      assert.equal(d.action("apply-restore").hidden, true);
      assert.deepEqual(d.session.snapshot().value, before);
      d.controls.dispose();
    },
  );
  await check(
    "retained unverified memory or an original raw copy warns before close without a fake retry",
    async () => {
      const d = await mounted({ gifts: [gift()] });
      d.values.set("charitology.gifts", "{foreign B");
      await d.choose(fileOf(backup()));
      await settle(() => /chang|another|external/i.test(d.say()));
      assert.equal(d.session.snapshot().persistence, "unsaved-memory");
      assert.equal(d.session.snapshot().canRetryPersist, false);
      let warnings = 0;
      await d.window.fire("beforeunload", {
        preventDefault() {
          warnings++;
        },
      });
      assert.equal(warnings, 1);
      d.controls.dispose();
    },
  );
  await check(
    "an expired file read cannot later create an Apply authority",
    async () => {
      const native = globalThis.setTimeout;
      globalThis.setTimeout = (callback, delay, ...args) =>
        native(callback, delay === 30_000 ? 5 : delay, ...args);
      try {
        const d = await mounted(),
          a = delayedFile(backup());
        await d.choose(a.file);
        await settle(() => /timed out/i.test(d.say()));
        a.finish();
        await expectNoApply(d);
        d.controls.dispose();
      } finally {
        globalThis.setTimeout = native;
      }
    },
  );
  await check(
    "disposing controls invalidates a pending read and removes only its own panel",
    async () => {
      const d = await mounted(),
        a = delayedFile(backup());
      await d.choose(a.file);
      d.controls.dispose();
      a.finish();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(d.host.children.length, 0);
      assert.equal(d.editor.isConnected, true);
      assert.equal(d.values.has("charitology.gifts"), false);
    },
  );
  await check(
    "grant controls require an outside editor and exact coordinator/view ownership",
    async () => {
      const d = await mountedGrant();
      assert.throws(() =>
        m.mountD1GrantRecoveryControls({
          host: d.editor,
          editor: d.editor,
          coordinator: d.grant,
          view: d.view,
        }),
      );
      assert.throws(() =>
        m.mountD1GrantRecoveryControls({
          host: d.host,
          editor: d.editor,
          coordinator: { ...d.grant },
          view: d.view,
        }),
      );
      d.controls.dispose();
      assert.equal(d.editor.inert, false);
    },
  );
  await check(
    "a grant bundle needs three separate previews/applies and reloads only after the final match",
    async () => {
      const d = await mountedGrant();
      await d.choose(fileOf(grantSource()));
      await grantReady(d);
      assert.equal(d.values.has("charitology.grant-proposals"), false);
      assert.equal(d.editor.inert, true);
      await grantStep(d);
      assert.equal(d.dom.reloads, 0);
      assert.deepEqual(
        JSON.parse(d.values.get("charitology.grant-proposals")),
        [proposal()],
      );
      assert.equal(d.values.has("charitology.grant-draft"), false);
      await grantStep(d);
      assert.equal(d.dom.reloads, 0);
      assert.deepEqual(
        JSON.parse(d.values.get("charitology.grant-weights")),
        weights(2),
      );
      assert.equal(d.values.has("charitology.grant-draft"), false);
      await grantStep(d);
      await settle(() => d.dom.reloads === 1);
      assert.deepEqual(
        JSON.parse(d.values.get("charitology.grant-draft")),
        proposal(),
      );
      assert.match(d.say(), /complete source bundle is restored/);
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      d.controls.dispose();
    },
  );
  await check(
    "grant individual Apply keeps the editor inert while its lock is pending",
    async () => {
      const d = await mountedGrant({ "grant-weights": weights(5) });
      const mode = d.field("d1FileKind");
      mode.value = "grant-weights";
      await mode.fire("change");
      await d.choose(
        fileOf(m.d1IndividualBackup("grant-weights", weights(2), stamp)),
      );
      await settle(() => d.action("apply-step").hidden === false);
      assert.equal(d.editor.inert, true);
      const release = await d.hold("charitology.grant-draft");
      try {
        await d.action("apply-step").click();
        assert.equal(d.editor.inert, true);
        assert.deepEqual(
          JSON.parse(d.values.get("charitology.grant-weights")),
          weights(5),
        );
      } finally {
        release();
      }
      await settle(() => d.dom.reloads === 1);
      assert.deepEqual(
        JSON.parse(d.values.get("charitology.grant-weights")),
        weights(2),
      );
      d.controls.dispose();
    },
  );
  await check(
    "grant newer raw fields revoke an earlier discard choice",
    async () => {
      const d = await mountedGrant(),
        discard = d.field("d1Discard");
      discard.checked = true;
      await discard.fire("change");
      d.view.changedForm();
      d.controls.noteViewMutation();
      assert.equal(discard.checked, false);
      await d.choose(fileOf(grantSource()));
      await settle(() => /discard|unsaved|unsubmitted/i.test(d.say()));
      assert.equal(d.action("preview-step").hidden, true);
      discard.checked = true;
      await discard.fire("change");
      await d.choose(fileOf(grantSource()));
      await grantReady(d);
      d.controls.dispose();
    },
  );
  await check(
    "grant weights failure stops before draft, retains intended full export and exact-step retry",
    async () => {
      const d = await mountedGrant();
      await d.choose(fileOf(grantSource()));
      await grantReady(d);
      await grantStep(d);
      d.dom.behavior.failWrite = true;
      await grantStep(d);
      await settle(() => d.grant.snapshot().pending !== null);
      assert.equal(d.grant.snapshot().pending.origin, "restore");
      assert.equal(d.values.has("charitology.grant-draft"), false);
      assert.equal(d.action("preview-step").hidden, true);
      assert.equal(d.editor.inert, true);
      assert.equal(d.dom.reloads, 0);
      await d.action("desired-bundle").click();
      await settle(() => d.downloads.length === 1);
      const intended = m.parseD1GrantBundle(await d.downloads[0].blob.text());
      assert.deepEqual(
        intended.members.find((member) => member.key === "grant-draft").value,
        proposal(),
      );
      assert.equal(
        intended.members.find((member) => member.key === "grant-draft")
          .persistence,
        "unsaved-memory",
      );
      assert.equal(
        intended.members.find((member) => member.key === "grant-weights")
          .persistence,
        "unsaved-memory",
      );
      d.dom.behavior.failWrite = false;
      await d.action("retry").click();
      await settle(() => !d.grant.snapshot().pending);
      assert.equal(d.values.has("charitology.grant-draft"), false);
      assert.equal(d.dom.reloads, 0);
      await grantReady(d);
      await grantStep(d);
      await settle(() => d.dom.reloads === 1);
      d.controls.dispose();
    },
  );
  await check(
    "grant ordinary failed Save exports every unattempted desired member without calling it applied",
    async () => {
      const d = await mountedGrant();
      d.dom.behavior.failWrite = true;
      d.view.changedForm();
      const captured = d.grant.captureSave({
        "grant-proposals": [proposal()],
        "grant-draft": proposal(),
      });
      const result = await d.grant.saveCaptured(captured);
      d.controls.refresh();
      assert.equal(result.outcomes["grant-proposals"], "unsaved");
      assert.equal(result.outcomes["grant-draft"], "not-attempted");
      assert.equal(d.values.has("charitology.grant-draft"), false);
      assert.equal(d.editor.inert, true);
      await d.action("desired-bundle").click();
      await settle(() => d.downloads.length === 1);
      const intended = m.parseD1GrantBundle(await d.downloads[0].blob.text());
      assert.deepEqual(
        intended.members.find((member) => member.key === "grant-draft").value,
        proposal(),
      );
      assert.equal(
        intended.members.find((member) => member.key === "grant-draft")
          .persistence,
        "unsaved-memory",
      );
      d.dom.behavior.failWrite = false;
      await d.action("retry").click();
      await settle(() => !d.grant.snapshot().pending);
      assert.deepEqual(
        JSON.parse(d.values.get("charitology.grant-draft")),
        proposal(),
      );
      assert.equal(d.dom.reloads, 0);
      d.controls.dispose();
    },
  );
  await check(
    "initial orphan draft is preserved and can be repaired by explicit draft-only removal",
    async () => {
      const orphan = proposal("orphan-retained");
      const d = await mountedGrant({
        "grant-proposals": [],
        "grant-draft": orphan,
      });
      assert.equal(d.grant.snapshot().consistency, "inconsistent");
      assert.equal(d.editor.inert, true);
      assert.deepEqual(
        JSON.parse(d.values.get("charitology.grant-draft")),
        orphan,
      );
      await d.action("preview-remove").click();
      await settle(() => d.action("apply-step").hidden === false);
      assert.equal(d.values.has("charitology.grant-draft"), true);
      await d.action("apply-step").click();
      await settle(() => d.dom.reloads === 1);
      assert.equal(d.values.has("charitology.grant-draft"), false);
      assert.equal(d.values.get("charitology.grant-proposals"), "[]");
      assert.doesNotMatch(d.say(), /complete source bundle is restored/);
      d.controls.dispose();
    },
  );
  await check(
    "a late grant source A cannot return after invalid B or a source-type change",
    async () => {
      const d = await mountedGrant(),
        a = delayedFile(grantSource());
      await d.choose(a.file);
      await d.choose(fileOf("{invalid B"));
      await settle(() => d.say().length > 0);
      a.finish();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(d.action("preview-step").hidden, true);
      assert.equal(d.action("apply-step").hidden, true);
      const again = delayedFile(grantSource());
      await d.choose(again.file);
      const mode = d.field("d1FileKind");
      mode.value = "grant-draft";
      await mode.fire("change");
      again.finish();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(d.action("preview-step").hidden, true);
      assert.equal(d.values.has("charitology.grant-proposals"), false);
      d.controls.dispose();
    },
  );
  await check(
    "foreign grant member after preview invalidates the entire vector and applies nothing else",
    async () => {
      const d = await mountedGrant();
      await d.choose(fileOf(grantSource()));
      await grantReady(d);
      await d.action("preview-step").click();
      await settle(() => d.action("apply-step").hidden === false);
      const foreign = JSON.stringify(weights(4));
      d.values.set("charitology.grant-weights", foreign);
      await d.action("apply-step").click();
      await settle(() => /chang|another|external/i.test(d.say()));
      assert.equal(d.values.has("charitology.grant-proposals"), false);
      assert.equal(d.values.has("charitology.grant-draft"), false);
      assert.equal(d.values.get("charitology.grant-weights"), foreign);
      assert.equal(d.dom.reloads, 0);
      d.controls.dispose();
    },
  );
  console.log(
    `${groups} actual D1 control groups passed; synthetic DOM/files, not native browser saving.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
