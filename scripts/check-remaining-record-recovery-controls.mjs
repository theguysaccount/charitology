// Actual RR controller + engine in a fictional controlled DOM; no native Save claim.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import {
  installRemainingDom,
  settle,
  spin,
  fakeClock,
} from "../test-fixtures/remaining-record-controls/ui-dom.mjs";
import { strict } from "../test-fixtures/program-record-recovery/engine-harness.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const built = await build({
  stdin: {
    contents:
      'export * from "./src/lib/client/remaining-record-recovery.ts";export * from "./src/lib/client/remaining-record-recovery-controls.ts";export * from "./src/lib/client/remaining-record-recovery-schemas.ts";export * from "./src/lib/client/remaining-record-recovery-formats.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
const KEY = "charitology-manuscript-v1",
  COUNTRY = "charitology-country-notes-v1";
let groups = 0;
const mounts = [];
const clone = (v) => JSON.parse(JSON.stringify(v));
const value = (name = "Fictional A", key = KEY) => {
  const v = clone(m.defaultRemainingRecordValue(key));
  if (key === KEY) v.title = name;
  return v;
};
const raw = (name = "Fictional A", key = KEY) =>
  m.remainingRecordBackup(key, value(name, key));
const title = (d) =>
  d.session.snapshot().hasCurrent ? d.session.snapshot().value.title : null;
const forms = () => [
  {
    form: "manuscript",
    editingId: null,
    values: {
      ...value("  unfinished\r\n"),
      kind: "",
      sources: "https://example.invalid/?x=1&y=2",
    },
  },
];
async function mount(initial = {}, opts = {}) {
  const d = installRemainingDom(initial, opts);
  d.key = opts.key ?? KEY;
  if (opts.readonly)
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
  if (opts.failRead) d.behavior.failRead = true;
  d.view = m.createRemainingRecordView(d.key);
  d.session = await m.openRemainingRecordSession(d.key, { view: d.view });
  d.forms = opts.forms ?? [];
  d.adoptions = [];
  d.notifications = [];
  d.controls = m.mountRemainingRecordRecoveryControls({
    host: d.host,
    session: d.session,
    view: d.view,
    readForms: () => {
      assert.equal(d.lockDepth, 0);
      opts.onReadForms?.(d);
      return d.forms;
    },
    onAdopt: (s, t) => {
      assert.equal(d.lockDepth, 0);
      assert.ok(d.view.isCurrent(t));
      d.adoptions.push({ s, t });
      if (opts.throwAdopt) throw Error("Synthetic adoption render failure");
    },
    onStatus: (s) => {
      assert.equal(d.lockDepth, 0);
      assert.ok(Object.isFrozen(s));
      d.notifications.push(s);
      opts.onStatus?.(s, d);
      if (opts.throwStatus) throw Error("Synthetic status render failure");
    },
  });
  mounts.push(d);
  return d;
}
async function done(d) {
  await settle(() => !d.action("reload").disabled, "operation settled");
}
async function click(d, name) {
  const el = d.action(name);
  assert.ok(el, name);
  await el.click();
  await done(d);
}
async function ready(d, text = raw("Fictional import", d.key)) {
  await d.choose(d.file(text));
  await settle(() => !d.action("apply").hidden, "preview visible");
  assert.equal(d.action("apply").disabled, false);
}
async function allow(d) {
  d.field("rrDiscard").checked = true;
  await d.field("rrDiscard").fire("change");
}
async function save(d, name) {
  const v = value(name, d.key);
  const c = d.session.captureSave(v, {
    form: d.key === KEY ? "manuscript" : null,
  });
  const r = await d.session.saveCaptured(c);
  d.controls.refresh();
  return r;
}
async function download(d, action) {
  const n = d.downloads.length;
  await d.action(action).click();
  assert.equal(d.downloads.length, n + 1);
  return d.downloads.at(-1).blob.text();
}
async function check(name, run) {
  if (
    process.env.REMAINING_RECORD_CONTROL_CASE &&
    !name.includes(process.env.REMAINING_RECORD_CONTROL_CASE)
  )
    return;
  try {
    await run();
    groups++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
try {
  await check(
    "all twenty absent actual sessions mount with no startup writes, no foreign key and exact owner binding",
    async () => {
      for (const key of m.RR_KEYS) {
        const d = await mount({}, { key });
        assert.equal(d.session.snapshot().persistence, "absent");
        assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
        assert.ok(d.operations.every((o) => o[1] === key));
        assert.ok(d.lockNames.every((k) => k === key));
        assert.equal(d.values.get("unrelated.private.key"), "unchanged");
        assert.match(d.state(), /^absent:/);
        const foreign = m.createRemainingRecordView(key);
        assert.throws(
          () =>
            m.mountRemainingRecordRecoveryControls({
              host: d.host,
              session: d.session,
              view: foreign,
              readForms: () => [],
              onAdopt() {},
            }),
          (e) => e.code === "foreign_owner",
        );
        foreign.dispose();
      }
    },
  );
  await check(
    "read-only valid and corrupt values expose truthful recovery capabilities and native/raw exports",
    async () => {
      const d = await mount({ [KEY]: raw() }, { readonly: true });
      assert.equal(d.session.snapshot().code, "read-only");
      assert.equal(d.action("backup").disabled, false);
      assert.equal(d.action("retry").disabled, true);
      assert.equal(d.action("review-remove").disabled, true);
      assert.equal(d.field("rrFile").disabled, true);
      assert.equal(
        JSON.parse(await download(d, "backup")).title,
        "Fictional A",
      );
      const b = await mount({ [KEY]: "{bad" }, { readonly: true });
      assert.equal(b.session.snapshot().code, "read-only");
      assert.equal(b.action("review-remove").disabled, true);
      assert.equal(JSON.parse(await download(b, "protected")).raw, "{bad");
      assert.equal(b.operations.filter((o) => o[0] !== "get").length, 0);
    },
  );
  await check(
    "read-only reload adopts a validated new saved value without writing or inventing an empty copy",
    async () => {
      const d = await mount({ [KEY]: raw() }, { readonly: true });
      d.values.set(KEY, raw("Fictional readonly B"));
      await click(d, "reload");
      assert.equal(title(d), "Fictional readonly B");
      assert.equal(d.adoptions.length, 1);
      assert.equal(d.operations.filter((o) => o[0] !== "get").length, 0);
    },
  );
  await check(
    "read denial protects current disk and no native backup can be invented",
    async () => {
      const d = await mount({ [KEY]: raw() }, { failRead: true });
      assert.equal(d.session.snapshot().hasCurrent, false);
      assert.equal(d.action("backup").disabled, true);
      assert.equal(d.action("review-remove").disabled, true);
      assert.equal(d.values.get(KEY), raw());
    },
  );
  await check(
    "native backup exports exact unsaved admitted candidate while literal unfinished forms are separate and remain dirty",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: forms() });
      d.view.changedForm("manuscript");
      d.behavior.failWrite = true;
      assert.equal(
        (await save(d, "  admitted failure\r\n")).outcome,
        "unsaved",
      );
      const exported = JSON.parse(await download(d, "backup"));
      assert.equal(exported.title, "  admitted failure\r\n");
      assert.doesNotMatch(JSON.stringify(exported), /unfinished/);
      assert.match(d.say(), /unsaved/);
      const form = m.parseRemainingRecordFormArchive(
        await download(d, "forms"),
      );
      assert.equal(form.forms[0].values.title, "  unfinished\r\n");
      assert.equal(form.forms[0].values.kind, "");
      assert.deepEqual(d.view.snapshot().dirtyForms, ["manuscript"]);
      assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional A");
    },
  );
  await check(
    "explicit forms callback only runs for raw-form actions and plain-text fallback preserves refused oversized fields",
    async () => {
      let reads = 0;
      const d = await mount(
        { [KEY]: raw() },
        { forms: forms(), onReadForms: () => reads++ },
      );
      await download(d, "backup");
      assert.equal(reads, 0);
      d.forms[0].values.title = "x".repeat(201);
      await d.action("forms").click();
      assert.match(d.say(), /Plain-text/);
      assert.equal(d.forms[0].values.title.length, 201);
      const out = await download(d, "forms-text");
      assert.ok(out.includes("x".repeat(201)));
      assert.match(d.say(), /unvalidated/);
      assert.equal(reads, 2);
    },
  );
  await check(
    "exact Retry refreshes admitted lists and status without resetting newer unfinished controls",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: forms() });
      d.behavior.failWrite = true;
      await save(d, "Fictional retained failure");
      d.forms[0].values.title = "newer raw field";
      d.view.changedForm("manuscript");
      d.controls.noteViewMutation();
      d.behavior.failWrite = false;
      await click(d, "retry");
      assert.equal(title(d), "Fictional retained failure");
      assert.equal(d.notifications.at(-1).persistence, "saved");
      assert.equal(d.forms[0].values.title, "newer raw field");
      assert.equal(d.adoptions.length, 0);
      assert.deepEqual(d.view.snapshot().dirtyForms, ["manuscript"]);
      assert.equal(
        JSON.parse(d.values.get(KEY)).title,
        "Fictional retained failure",
      );
    },
  );
  await check(
    "read-only missing FileReader explains unavailable import while native and raw exports remain usable",
    async () => {
      const d = await mount({ [KEY]: raw() }, { noReader: true });
      assert.equal(d.field("rrFile").disabled, true);
      assert.match(d.say(), /abortable FileReader/);
      assert.equal(
        JSON.parse(await download(d, "backup")).title,
        "Fictional A",
      );
      assert.equal(JSON.parse(await download(d, "protected")).raw, raw());
      assert.equal(d.readers.length, 0);
    },
  );
  await check(
    "native abortable reader restores a complete reviewed value exactly once and retains import timestamp strings",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await ready(d, raw("  Import\r\n"));
      assert.equal(title(d), "Fictional A");
      assert.equal(d.maxActive, 1);
      await click(d, "apply");
      assert.equal(title(d), "  Import\r\n");
      assert.equal(d.adoptions.length, 1);
      assert.equal(d.action("apply").hidden, true);
      assert.equal(d.activeReaders(), 0);
      assert.equal(d.readers[0].onload, null);
      assert.equal(d.readers[0].onerror, null);
      assert.equal(d.readers[0].onabort, null);
      assert.equal(JSON.parse(d.values.get(KEY)).title, "  Import\r\n");
    },
  );
  await check(
    "A then Cancel aborts and detaches owned reader before a retained late completion and error",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await d.choose(d.file(raw("Fictional A late"), { held: true }));
      const a = d.readers.at(-1);
      await click(d, "cancel");
      const message = d.say();
      assert.ok(a.aborted);
      a.load({ late: true });
      a.fail({ late: true });
      await spin();
      assert.equal(d.say(), message);
      assert.equal(d.action("apply").hidden, true);
      assert.equal(title(d), "Fictional A");
    },
  );
  await check(
    "A then B aborts A first; newer B applies and late A cannot replace preview or saved B",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await d.choose(d.file(raw("Fictional A late"), { held: true }));
      const a = d.readers.at(-1);
      await ready(d, raw("Fictional B"));
      assert.ok(a.aborted);
      assert.equal(d.maxActive, 1);
      a.load({ late: true });
      await spin();
      await click(d, "apply");
      assert.equal(title(d), "Fictional B");
      a.fail({ late: true });
      await spin();
      assert.equal(title(d), "Fictional B");
      assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional B");
    },
  );
  await check(
    "new empty invalid and oversized choices revoke pending A before any choice inspection or additional reader",
    async () => {
      for (const next of [null, "invalid", "oversized"]) {
        const d = await mount({ [KEY]: raw() });
        await d.choose(d.file(raw("Fictional held A"), { held: true }));
        const a = d.readers.at(-1);
        const count = d.readers.length;
        if (next === null) await d.choose(null);
        else if (next === "invalid") await d.choose(d.file("{invalid"));
        else
          await d.choose(
            d.file("", {
              size: m.remainingRecordCapacity(KEY).nativeBytes + 1,
            }),
          );
        await spin();
        assert.ok(a.aborted);
        assert.equal(d.action("apply").hidden, true);
        const status = d.say();
        a.load({ late: true });
        await spin();
        assert.equal(d.say(), status);
        if (next !== "invalid") assert.equal(d.readers.length, count);
        assert.equal(title(d), "Fictional A");
      }
    },
  );
  await check(
    "new empty invalid and oversized choices revoke an already ready A preview",
    async () => {
      for (const next of [null, "{bad", "large"]) {
        const d = await mount({ [KEY]: raw() });
        await ready(d);
        await d.choose(
          next === null
            ? null
            : d.file(next, { size: next === "large" ? 1000001 : undefined }),
        );
        await spin();
        assert.equal(d.action("apply").hidden, true);
        assert.equal(d.action("apply").disabled, true);
        assert.equal(title(d), "Fictional A");
      }
    },
  );
  await check(
    "native 30-second read deadline aborts and detaches; late completion cannot revive Apply",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount({ [KEY]: raw() });
        await d.choose(d.file(raw("Fictional timeout"), { held: true }));
        const a = d.readers.at(-1);
        assert.equal(clock.count(30000), 1);
        await clock.tick(29999);
        assert.equal(a.aborted, false);
        await clock.tick(1);
        assert.ok(a.aborted);
        assert.match(d.say(), /timed out/);
        const message = d.say();
        a.load({ late: true });
        await spin();
        assert.equal(d.say(), message);
        assert.equal(d.action("apply").hidden, true);
        assert.equal(clock.count(30000), 0);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "actual read error abort event and mismatched result bytes never admit a preview",
    async () => {
      for (const kind of ["error", "abort", "mismatch"]) {
        const d = await mount({ [KEY]: raw() });
        await d.choose(d.file(raw(), { held: true }));
        const reader = d.readers.at(-1);
        if (kind === "error") reader.fail();
        else if (kind === "abort") reader.emitAbort();
        else reader.load({ bytes: new ArrayBuffer(0) });
        await spin();
        assert.equal(d.action("apply").hidden, true);
        assert.match(d.say(), /could not be read|aborted|do not match/);
        assert.equal(reader.onload, null);
        assert.equal(title(d), "Fictional A");
      }
    },
  );
  await check(
    "edit during native digest revokes stale preview; stale failure never replaces a newer view status",
    async () => {
      const d = await mount({ [KEY]: raw() });
      const release = await d.hold(KEY);
      await d.choose(d.file(raw("Fictional digest A")));
      await spin();
      d.view.changedForm("manuscript");
      d.controls.noteViewMutation();
      await d.choose(null);
      const message = d.say();
      release();
      await spin();
      await spin();
      assert.equal(d.action("apply").hidden, true);
      assert.equal(d.say(), message);
      assert.equal(title(d), "Fictional A");
    },
  );
  await check(
    "checked discard is captured at preview; newer unfinished field invalidates Apply and remains intact",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: forms() });
      d.view.changedForm("manuscript");
      await allow(d);
      await ready(d);
      d.forms[0].values.title = "newer";
      d.view.changedForm("manuscript");
      d.controls.noteViewMutation();
      assert.equal(d.action("apply").hidden, true);
      await d.action("apply").click();
      assert.equal(title(d), "Fictional A");
      assert.equal(d.forms[0].values.title, "newer");
    },
  );
  await check(
    "failed restore retains imported native candidate, newer raw form and status notification, exact Retry does not adopt",
    async () => {
      const d = await mount({ [KEY]: raw() }, { forms: forms() });
      await allow(d);
      await ready(d);
      d.behavior.failWrite = true;
      await click(d, "apply");
      assert.equal(title(d), "Fictional import");
      assert.equal(d.notifications.at(-1).pendingPersist, true);
      assert.equal(d.forms[0].values.title, "  unfinished\r\n");
      assert.equal(d.adoptions.length, 0);
      d.forms[0].values.title = "still newer";
      d.view.changedForm("manuscript");
      d.controls.noteViewMutation();
      d.behavior.failWrite = false;
      await click(d, "retry");
      assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional import");
      assert.equal(d.forms[0].values.title, "still newer");
      assert.equal(d.adoptions.length, 0);
    },
  );
  await check(
    "reviewed removal truly removes only one key and guarded Undo restores previous native state",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await click(d, "review-remove");
      assert.equal(d.action("apply").hidden, false);
      await click(d, "apply");
      assert.equal(d.values.has(KEY), false);
      assert.equal(d.session.snapshot().persistence, "absent");
      assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      await allow(d);
      await click(d, "undo");
      assert.equal(title(d), "Fictional A");
      assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional A");
    },
  );
  await check(
    "corrupt original A and unseen B remain separate raw archives until current explicit review",
    async () => {
      const d = await mount({ [KEY]: "{corrupt-A" });
      d.values.set(KEY, "{corrupt-B");
      await d.choose(d.file(raw("Fictional recovered")));
      await settle(
        () => /changed|another|outside|different/i.test(d.say()),
        "foreign copy noticed",
      );
      assert.equal(
        JSON.parse(await download(d, "protected")).raw,
        "{corrupt-A",
      );
      assert.equal(JSON.parse(await download(d, "observed")).raw, "{corrupt-B");
      await ready(d, raw("Fictional recovered"));
      await click(d, "apply");
      assert.equal(title(d), "Fictional recovered");
    },
  );
  await check(
    "status notification recursion and exceptions never relabel a completed actual write; adoption failure retains backup",
    async () => {
      let nested = false;
      const d = await mount(
        { [KEY]: raw() },
        {
          throwAdopt: true,
          onStatus: (_s, owner) => {
            if (owner.controls && !nested) {
              nested = true;
              owner.controls.refresh();
              nested = false;
            }
          },
        },
      );
      await ready(d);
      await click(d, "apply");
      assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional import");
      assert.match(d.say(), /finished.*could not redraw/);
      assert.equal(
        JSON.parse(await download(d, "backup")).title,
        "Fictional import",
      );
      const b = await mount({ [KEY]: raw() }, { throwStatus: true });
      await ready(b);
      await click(b, "apply");
      assert.equal(JSON.parse(b.values.get(KEY)).title, "Fictional import");
      assert.match(b.say(), /status changed.*could not redraw/);
    },
  );
  await check(
    "dispose aborts owned read, detaches UI and revokes queued actual Apply without stale callbacks",
    async () => {
      const d = await mount({ [KEY]: raw() });
      await d.choose(d.file(raw(), { held: true }));
      const reader = d.readers.at(-1);
      d.controls.dispose();
      assert.ok(reader.aborted);
      const n = d.notifications.length;
      reader.load({ late: true });
      await spin();
      assert.equal(d.notifications.length, n);
      assert.equal(d.host.children.length, 0);
      const b = await mount({ [KEY]: raw() });
      await ready(b);
      const release = await b.hold(KEY);
      await b.action("apply").click();
      await spin();
      b.controls.dispose();
      release();
      await spin();
      await spin();
      assert.equal(JSON.parse(b.values.get(KEY)).title, "Fictional A");
      assert.equal(b.adoptions.length, 0);
    },
  );
  await strict([
    "src/lib/client/remaining-record-recovery-controls.ts",
    "src/lib/client/remaining-record-recovery-autosave.ts",
  ]);
  console.log(
    `Remaining-record controls: ${groups} actual groups; strict zero. Fictional DOM and controlled FileReader only; native browser/Save remain separate.`,
  );
} finally {
  for (const d of mounts) {
    d.controls?.dispose();
    d.session?.dispose();
  }
}
