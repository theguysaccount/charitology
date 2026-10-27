// Actual production facade + controls in a bounded fictional DOM. No browser,
// network, native Save, shared organization or user's localStorage is exercised.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  installProgramRecordDom,
  settle,
  fileOf,
  delayedFile,
} from "../test-fixtures/program-record-recovery/ui-dom.mjs";
import { strict } from "../test-fixtures/program-record-recovery/engine-harness.mjs";
import { STAMP } from "../test-fixtures/program-record-recovery/factory.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const out = await build({
  stdin: {
    contents:
      'export * from "./src/lib/client/program-record-recovery.ts";export * from "./src/lib/client/program-record-recovery-controls.ts";export * from "./src/lib/client/program-record-recovery-schemas.ts";export * from "./src/lib/client/program-record-recovery-formats.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const temp = await mkdtemp(join(tmpdir(), "charitology-program-controls-"));
await writeFile(join(temp, "actual.mjs"), out.outputFiles[0].text);
const m = await import(pathToFileURL(join(temp, "actual.mjs")));
const KEY = "charitology.program-workspace-v1.university-chapters",
  OS = "charitology.charity-os";
let groups = 0;
const mounts = [];
const clone = (v) => JSON.parse(JSON.stringify(v));
const model = (name = "Fictional A", key = KEY) => {
  const v = clone(m.defaultProgramRecordValue(key));
  if (key === OS) v.organization = name;
  else v.context.name = name;
  return v;
};
const native = (name = "Fictional A", key = KEY) => {
  const value = model(name, key);
  return key === OS
    ? {
        format: "charitology.charity-os",
        version: 1,
        exportedAt: STAMP,
        workspace: value,
      }
    : { ...value, updated: STAMP };
};
const raw = (name = "Fictional A", key = KEY) =>
  m.programRecordBackup(key, native(name, key));
const recordName = (d) => {
  const v = d.session.snapshot();
  return v.hasCurrent
    ? d.key === OS
      ? v.value.organization
      : v.value.context.name
    : null;
};
function formsFor(key = KEY) {
  return [
    {
      form: "context",
      editingId: null,
      values: Object.fromEntries(
        Object.keys(m.programRecordFormFields(key, "context")).map((k) => [
          k,
          k === "name" ? "Fictional unfinished" : "",
        ]),
      ),
    },
  ];
}
async function mount(initial = {}, opts = {}) {
  const d = installProgramRecordDom(initial),
    key = opts.key ?? KEY;
  d.lockDepth = 0;
  const request = d.locks.request.bind(d.locks);
  d.locks.request = (name, settings, action) =>
    request(name, settings, async () => {
      d.lockDepth++;
      try {
        return await action();
      } finally {
        d.lockDepth--;
      }
    });
  d.key = key;
  if (opts.unsupported)
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
  if (opts.failRead) d.behavior.failRead = true;
  const view = m.createProgramRecordView(key),
    session = await m.openProgramRecordSession(key, { view });
  d.view = view;
  d.session = session;
  d.forms = opts.forms ?? [];
  d.adopted = [];
  d.notifications = [];
  d.controls = m.mountProgramRecordRecoveryControls({
    host: d.host,
    session,
    view,
    readForms: () => d.forms,
    onAdopt: (state, token) => {
      d.adopted.push({ state, token });
      if (opts.throwAdopt) throw Error("Synthetic render failure");
    },
    onStatus: (state) => {
      assert.equal(
        d.lockDepth,
        0,
        "application notification cannot run inside a held engine lock",
      );
      assert.ok(Object.isFrozen(state));
      d.notifications.push(state);
      opts.onStatus?.(state, d);
      if (opts.throwStatus) throw Error("Synthetic status render failure");
    },
  });
  mounts.push(d);
  return d;
}
const done = (d) => settle(() => !d.action("reload").disabled);
async function click(d, name) {
  const el = d.action(name);
  assert.ok(el, name);
  await el.click();
  await done(d);
}
async function ready(d, text = raw("Fictional imported", d.key)) {
  await d.choose(fileOf(text));
  await settle(() => d.action("apply").hidden === false);
}
async function allow(d) {
  d.field("prDiscard").checked = true;
  await d.field("prDiscard").fire("change");
}
async function save(d, name) {
  const v = clone(d.session.snapshot().value);
  if (d.key === OS) v.organization = name;
  else v.context.name = name;
  const captured = d.session.captureSave(v, { at: STAMP, form: "context" });
  const r = await d.session.saveCaptured(captured);
  d.controls.refresh();
  return r;
}
async function download(d, name) {
  const n = d.downloads.length;
  await d.action(name).click();
  assert.equal(d.downloads.length, n + 1);
  return d.downloads.at(-1).blob.text();
}
async function check(name, run) {
  if (
    process.env.PROGRAM_RECORD_CONTROL_CASE &&
    !name.includes(process.env.PROGRAM_RECORD_CONTROL_CASE)
  )
    return;
  try {
    await run();
    console.log("✓ " + name);
    groups++;
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
try {
  await check(
    "all six actual absent sessions mount read-only exports/status without any startup write/probe or foreign-key access",
    async () => {
      for (const key of m.PR_KEYS) {
        const d = await mount({}, { key });
        assert.equal(d.session.snapshot().persistence, "absent");
        assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
        assert.ok(d.operations.every((o) => o[1] === key));
        assert.ok(d.lockNames.every((k) => k === key));
        assert.equal(d.values.get("unrelated.private.key"), "unchanged");
        assert.match(d.state(), /^absent:/);
      }
    },
  );
  await check(
    "unsupported locking retains readable records/export but mutation controls remain unavailable",
    async () => {
      const d = await mount({ [KEY]: raw() }, { unsupported: true });
      assert.equal(d.session.snapshot().code, "unsupported");
      assert.equal(d.action("review-remove").disabled, true);
      assert.equal(d.action("retry").disabled, true);
      assert.equal(d.action("backup").disabled, false);
      assert.equal(
        JSON.parse(await download(d, "backup")).context.name,
        "Fictional A",
      );
      assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
    },
  );
  await check(
    "explicit read-only reload adopts the newly validated saved records without any write",
    async () => {
      const d = await mount({ [KEY]: raw() }, { unsupported: true });
      d.values.set(KEY, raw("Fictional readonly B"));
      await click(d, "reload");
      assert.equal(recordName(d), "Fictional readonly B");
      assert.equal(d.adopted.length, 1);
      assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
      assert.match(d.state(), /^saved:/);
    },
  );

  await check(
    "initial read denial has no invented blank native backup and no saved success",
    async () => {
      const d = await mount({ [KEY]: raw() }, { failRead: true });
      assert.equal(d.session.snapshot().hasCurrent, false);
      assert.equal(d.action("backup").disabled, true);
      assert.match(d.state(), /^unreadable:/);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "native backup exports exact retained failed-save memory, with truthful unsaved status and no unfinished-form fields",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: formsFor() });
      d.behavior.failWrite = true;
      assert.equal((await save(d, "Fictional unsaved")).outcome, "unsaved");
      const exported = await download(d, "backup");
      assert.equal(JSON.parse(exported).context.name, "Fictional unsaved");
      assert.doesNotMatch(exported, /Fictional unfinished/);
      assert.match(d.say(), /unsaved-memory/);
      assert.equal(JSON.parse(d.values.get(KEY)).context.name, "Fictional A");
    },
  );
  await check(
    "unsubmitted invalid raw fields have their own archive and downloading never marks form clean",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: formsFor() });
      d.view.changedForm("context");
      const text = await download(d, "forms");
      const parsed = m.parseProgramRecordFormArchive(text);
      assert.equal(parsed.forms[0].values.name, "Fictional unfinished");
      assert.deepEqual(d.view.snapshot().dirtyForms, ["context"]);
      assert.match(d.say(), /separate from validated records/);
    },
  );
  await check(
    "structured form refusal retains text and provides explicit plain-text fallback without pretending it restores records",
    async () => {
      const f = formsFor();
      f[0].values.name = "x".repeat(501);
      const d = await mount({ [KEY]: raw() }, { forms: f });
      await d.action("forms").click();
      assert.equal(d.downloads.length, 0);
      assert.match(d.say(), /Plain-text recovery/);
      const text = await download(d, "forms-text");
      assert.ok(text.includes("x".repeat(501)));
      assert.match(text, /not a workspace restore file/);
      assert.equal(d.forms[0].values.name.length, 501);
    },
  );
  await check(
    "empty-string corrupt saved copy remains separately downloadable, rather than falsy absence",
    async () => {
      const d = await mount({ [KEY]: "" });
      assert.equal(d.action("backup").disabled, true);
      assert.equal(d.action("protected").disabled, false);
      assert.equal(
        m.parseProgramRecordRawArchive(await download(d, "protected")).raw,
        "",
      );
      assert.equal(
        m.parseProgramRecordRawArchive(await download(d, "observed")).raw,
        "",
      );
    },
  );
  await check(
    "corrupt A then unseen valid B first warns and preserves distinct exact raw copies before second explicit preview",
    async () => {
      const a = " { broken A\ud800";
      const d = await mount({ [KEY]: a });
      d.values.set(KEY, raw("Fictional B"));
      await d.choose(fileOf(raw("Fictional C")));
      await settle(() => /Another tab changed/.test(d.say()));
      assert.equal(d.action("apply").hidden, true);
      assert.equal(
        m.parseProgramRecordRawArchive(await download(d, "protected")).raw,
        a,
      );
      assert.equal(
        m.parseProgramRecordRawArchive(await download(d, "observed")).raw,
        raw("Fictional B"),
      );
      await ready(d, raw("Fictional C"));
      assert.equal(d.values.get(KEY), raw("Fictional B"));
    },
  );
  await check(
    "actual native file preview becomes visible and Apply saves complete records then adopts once",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await ready(d);
      assert.match(d.previewText(), /Fictional imported/);
      await click(d, "apply");
      assert.equal(recordName(d), "Fictional imported");
      assert.equal(
        JSON.parse(d.values.get(KEY)).context.name,
        "Fictional imported",
      );
      assert.equal(d.adopted.length, 1);
      assert.match(d.say(), /Restored the complete/);
      const writes = d.operations.filter((o) => o[0] === "set").length;
      await d.action("apply").click();
      assert.equal(d.operations.filter((o) => o[0] === "set").length, writes);
    },
  );
  await check(
    "valid A preview followed by invalid, empty or oversized new B revokes old Apply before validation",
    async () => {
      for (const file of [fileOf("{"), null, { size: 8_000_001 }]) {
        const d = await mount({ [KEY]: raw() });
        await ready(d);
        await d.choose(file);
        await settle(() => d.action("apply").hidden === true);
        assert.equal(d.values.get(KEY), raw());
      }
    },
  );
  await check(
    "late file A after invalid newer B cannot reopen preview or overwrite the newer error",
    async () => {
      const d = await mount({ [KEY]: raw() }),
        a = delayedFile(raw("Fictional delayed"));
      await d.choose(a.file);
      await d.choose(fileOf("{"));
      await settle(() => d.say().length > 0);
      const message = d.say();
      a.finish();
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(d.action("apply").hidden, true);
      assert.equal(d.say(), message);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "cancel during delayed file read revokes its result and preserves saved bytes",
    async () => {
      const d = await mount({ [KEY]: raw() }),
        a = delayedFile(raw("Fictional delayed"));
      await d.choose(a.file);
      await d.action("cancel").click();
      a.finish();
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(d.action("apply").hidden, true);
      assert.match(d.say(), /Canceled recovery/);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "new invalid file also revokes an earlier clear preview",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await click(d, "review-remove");
      assert.equal(d.action("apply").hidden, false);
      await d.choose(fileOf("{"));
      await settle(() => d.action("apply").hidden === true);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "disposed controls never reopen a delayed file or call adoption",
    async () => {
      const d = await mount({ [KEY]: raw() }),
        a = delayedFile(raw());
      await d.choose(a.file);
      d.controls.dispose();
      a.finish();
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(d.host.textContent, "");
      assert.equal(d.adopted.length, 0);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "held-lock Apply is revoked by a newer unfinished form, with no disk mutation or adoption",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await ready(d);
      const release = await d.hold(KEY);
      await d.action("apply").click();
      d.forms = formsFor();
      d.forms[0].values.name = "Fictional newer";
      d.view.changedForm("context");
      d.controls.noteViewMutation();
      release();
      await done(d);
      assert.equal(d.values.get(KEY), raw());
      assert.equal(d.adopted.length, 0);
      assert.equal(d.forms[0].values.name, "Fictional newer");
      assert.doesNotMatch(d.say(), /Restored the complete/);
    },
  );
  await check(
    "held-lock removal is revoked by controls disposal, preserving the prior saved key",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await click(d, "review-remove");
      const release = await d.hold(KEY);
      await d.action("apply").click();
      d.controls.dispose();
      release();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(d.values.get(KEY), raw());
      assert.equal(d.adopted.length, 0);
    },
  );
  await check("held-lock reload cannot reset a newer raw form", async () => {
    const d = await mount({ [KEY]: raw() });
    const release = await d.hold(KEY);
    await d.action("reload").click();
    d.forms = formsFor();
    d.forms[0].values.name = "Fictional newer";
    d.view.changedForm("context");
    d.controls.noteViewMutation();
    release();
    await done(d);
    assert.equal(d.adopted.length, 0);
    assert.equal(d.forms[0].values.name, "Fictional newer");
    assert.doesNotMatch(d.say(), /Loaded the saved copy/);
  });
  await check(
    "clear is a reviewed removal of only the selected key and guarded Undo restores the previous exact model",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await click(d, "review-remove");
      assert.equal(d.values.has(KEY), true);
      assert.match(d.previewText(), /Remove only/);
      await click(d, "apply");
      assert.equal(d.values.has(KEY), false);
      assert.equal(d.session.snapshot().persistence, "absent");
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      assert.match(d.say(), /empty workspace is unsaved/);
      await click(d, "undo");
      assert.equal(JSON.parse(d.values.get(KEY)).context.name, "Fictional A");
      assert.match(d.say(), /Restored the reviewed previous/);
    },
  );
  await check(
    "failed removal retains exact remove intent and Retry persists it without cleaning unrelated forms",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await click(d, "review-remove");
      d.behavior.failRemove = true;
      await click(d, "apply");
      assert.equal(d.session.snapshot().pendingOperation, "remove");
      assert.equal(d.values.has(KEY), true);
      assert.match(d.say(), /could not keep/);
      d.forms = formsFor();
      d.view.changedForm("context");
      d.controls.noteViewMutation();
      d.behavior.failRemove = false;
      await click(d, "retry");
      assert.equal(d.values.has(KEY), false);
      assert.equal(d.session.snapshot().pendingOperation, null);
      assert.deepEqual(d.view.snapshot().dirtyForms, ["context"]);
      assert.equal(d.adopted.length, 0);
    },
  );
  await check(
    "reload after read denial reports no loaded success and preserves current native export",
    async () => {
      const d = await mount({ [KEY]: raw() });
      d.behavior.failRead = true;
      await click(d, "reload");
      assert.equal(recordName(d), "Fictional A");
      assert.match(d.state(), /^unsaved-memory:/);
      assert.doesNotMatch(d.say(), /Loaded the saved copy/);
      assert.equal(d.adopted.length, 0);
      const text = await download(d, "backup");
      assert.equal(JSON.parse(text).context.name, "Fictional A");
    },
  );
  await check(
    "dirty form guard is independent of downloading; explicit permission then new preview is required",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: formsFor() });
      d.view.changedForm("context");
      await download(d, "forms");
      await click(d, "review-remove");
      assert.equal(d.action("apply").hidden, true);
      assert.match(d.say(), /explicitly confirm/);
      await allow(d);
      await click(d, "review-remove");
      assert.equal(d.action("apply").hidden, false);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "render callback failure follows an actual persisted recovery without false write failure or data rollback",
    async () => {
      const d = await mount({ [KEY]: raw() }, { throwAdopt: true });
      await ready(d);
      await click(d, "apply");
      assert.equal(
        JSON.parse(d.values.get(KEY)).context.name,
        "Fictional imported",
      );
      assert.match(d.say(), /recovery finished.*could not redraw/);
      assert.doesNotMatch(d.say(), /browser could not keep/);
    },
  );
  await check(
    "foreign same-key session/tracker and structural copies cannot mount recovery authority",
    async () => {
      const d = await mount({ [KEY]: raw() }),
        other = m.createProgramRecordView(KEY);
      assert.throws(
        () =>
          m.mountProgramRecordRecoveryControls({
            host: d.host,
            session: d.session,
            view: other,
            readForms: () => [],
            onAdopt: () => {},
          }),
        (e) => e.code === "foreign_owner",
      );
      assert.throws(
        () =>
          m.mountProgramRecordRecoveryControls({
            host: d.host,
            session: { ...d.session },
            view: d.view,
            readForms: () => [],
            onAdopt: () => {},
          }),
        (e) => e.code === "foreign_owner",
      );
    },
  );
  await check(
    "actual file byte length must match its bounded choice and cannot exploit a false small size",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await d.choose({
        size: 0,
        arrayBuffer: async () => new TextEncoder().encode(raw()).buffer,
      });
      await settle(() => /actual file bytes/.test(d.say()));
      assert.equal(d.action("apply").hidden, true);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "bounded file deadline refuses a never-settling read; its later result cannot revive a preview",
    async () => {
      const d = await mount({ [KEY]: raw() }),
        a = delayedFile(raw("Fictional late"));
      const original = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) =>
        original(fn, ms === 30000 ? 5 : ms, ...args);
      try {
        await d.choose(a.file);
        await settle(() => /timed out/.test(d.say()));
        a.finish();
        await new Promise((r) => original(r, 15));
        assert.equal(d.action("apply").hidden, true);
        assert.equal(d.values.get(KEY), raw());
      } finally {
        globalThis.setTimeout = original;
      }
    },
  );
  await check(
    "constructor status notification is immutable, outside locks and carries no startup write",
    async () => {
      const d = await mount({ [KEY]: raw() });
      assert.equal(d.notifications.length, 1);
      assert.equal(d.notifications[0].persistence, "saved");
      assert.equal(d.operations.filter(([op]) => op !== "get").length, 0);
      assert.equal(d.adopted.length, 0);
      d.controls.refresh();
      assert.equal(d.notifications.length, 2);
    },
  );
  await check(
    "nested refresh cannot recursively notify or change raw forms",
    async () => {
      const forms = formsFor();
      const d = await mount(
        { [KEY]: raw() },
        {
          forms,
          onStatus(_state, d) {
            d.controls?.refresh();
          },
        },
      );
      const before = d.notifications.length;
      d.controls.refresh();
      assert.equal(d.notifications.length, before + 1);
      assert.deepEqual(d.forms, forms);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "status after failed save and exact Retry updates cache/capabilities without adopting or clearing unfinished fields",
    async () => {
      let cached;
      const forms = formsFor();
      const d = await mount(
        { [KEY]: raw() },
        {
          forms,
          onStatus(state) {
            cached = state;
          },
        },
      );
      d.view.changedForm("context");
      d.controls.noteViewMutation();
      d.behavior.failWrite = true;
      assert.equal(
        (await save(d, "Fictional retained memory")).outcome,
        "unsaved",
      );
      assert.equal(cached.value.context.name, "Fictional retained memory");
      assert.equal(cached.canWrite, false);
      d.behavior.failWrite = false;
      await click(d, "retry");
      assert.equal(cached.persistence, "saved");
      assert.equal(cached.canWrite, true);
      assert.deepEqual(d.forms, forms);
      assert.deepEqual(d.view.snapshot().dirtyForms, ["context"]);
      assert.equal(d.adopted.length, 0);
    },
  );
  await check(
    "status callback failure cannot relabel a successful write and disposal prevents further notifications",
    async () => {
      const d = await mount({ [KEY]: raw() }, { throwStatus: true });
      const saved = await save(d, "Fictional committed B");
      assert.equal(saved.outcome, "saved");
      assert.equal(
        JSON.parse(d.values.get(KEY)).context.name,
        "Fictional committed B",
      );
      assert.match(d.say(), /could not redraw/);
      const count = d.notifications.length;
      d.controls.dispose();
      d.controls.refresh();
      assert.equal(d.notifications.length, count);
    },
  );
  await check(
    "actual engine plus controls compile strict without declaration shims",
    async () => {
      await strict([
        "src/lib/client/program-record-recovery.ts",
        "src/lib/client/program-record-recovery-controls.ts",
        "src/lib/client/program-record-recovery-schemas.ts",
        "src/lib/client/program-record-recovery-formats.ts",
      ]);
    },
  );
  console.log(groups + " program-record mounted controls groups passed.");
} finally {
  for (const d of mounts) {
    d.controls.dispose();
    d.session.dispose();
    d.view.dispose();
  }
  await rm(temp, { recursive: true, force: true });
}
