// Actual fixed-key facade with synthetic storage/locks. Never browser/provider data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actual,
  at,
  later,
  KEY,
  OS,
  storage,
  locks,
  hold,
  strict,
  codes,
  digestGate,
  withEnvironment,
  clone,
  model,
  native,
  assertOnlyKey,
} from "../test-fixtures/program-record-recovery/engine-harness.mjs";
import {
  osFixture,
  osEnvelope,
  exactGeneralBoundary,
} from "../test-fixtures/program-record-recovery/factory.mjs";
const m = await actual();
let groups = 0;
async function check(name, fn) {
  try {
    await fn();
    groups++;
    console.log("PASS " + name);
  } catch (error) {
    error.message = name + ": " + error.message;
    throw error;
  }
}
const reject = (fn, ...names) =>
  assert.rejects(async () => fn(), codes(...names));
async function open(
  key = KEY,
  s = storage(),
  l = locks(),
  d = digestGate(),
  secure = true,
) {
  const view = m.createProgramRecordView(key);
  const session = await withEnvironment({ s, l, d, secure }, () =>
    m.openProgramRecordSession(key, { view }),
  );
  return { key, s, l, d, view, session };
}
function changed(x, name) {
  const v = clone(x.session.snapshot().value);
  if (x.key === OS) v.organization = name;
  else v.context.name = name;
  return v;
}
async function save(x, value, stamp = at, form = "context") {
  x.view.changedForm(form);
  const capture = x.session.captureSave(value, { at: stamp, form });
  const result = await x.session.saveCaptured(capture);
  if (["saved", "no-op"].includes(result.outcome) && result.viewCurrent)
    x.view.markClean(form, capture.view);
  return result;
}
const parse = (x) => JSON.parse(x.s.values.get(x.key));
await check(
  "actual facade strict compilation and closed production imports",
  async () => {
    await strict(["src/lib/client/program-record-recovery.ts"]);
    const text = readFileSync(
      "src/lib/client/program-record-recovery.ts",
      "utf8",
    );
    assert.doesNotMatch(text, /from ["']\.\/(?:store|persist|donor-recovery)/);
    assert.doesNotMatch(text, /Object\.keys\(localStorage|localStorage\.clear/);
  },
);
await check(
  "all six defaults are absent, detached and never probe or write",
  async () => {
    for (const key of m.PR_KEYS) {
      const x = await open(key),
        s = x.session.snapshot();
      assert.equal(s.hasCurrent, true);
      assert.equal(s.persistence, "absent");
      assert.equal(x.s.values.size, 0);
      assertOnlyKey(x.s, x.l, key);
      assert.ok(Object.isFrozen(s.value));
    }
  },
);
await check(
  "existing six native formats load exact bytes without rewriting timestamps",
  async () => {
    for (const key of m.PR_KEYS) {
      const s = storage(),
        value =
          key === OS
            ? osFixture()
            : m.sampleWorkspace(m.programWorkspaces[key.split(".").at(-1)]);
      const n = key === OS ? osEnvelope(value) : { ...value, updated: at };
      const raw = JSON.stringify(n);
      s.values.set(key, raw);
      const x = await open(key, s);
      assert.equal(x.session.snapshot().persistence, "saved");
      assert.equal(x.session.snapshot().observedRaw, raw);
      const b = x.session.exportNative({ at: later });
      assert.deepEqual(JSON.parse(b.text), n);
      assert.equal(b.unfinishedFormsIncluded, false);
      assert.equal(b.text.endsWith("\n"), false);
      assert.equal(
        s.touched.some(([op]) => op === "set"),
        false,
      );
    }
  },
);
await check(
  "absent equal Save writes once; only saved equality is no-op and keeps clock",
  async () => {
    for (const key of [KEY, OS]) {
      const x = await open(key),
        empty = clone(x.session.snapshot().value);
      assert.equal((await save(x, empty)).outcome, "saved");
      const raw = x.s.values.get(key),
        writes = x.s.touched.filter(([op]) => op === "set").length;
      assert.equal(
        (await save(x, clone(x.session.snapshot().value), later)).outcome,
        "no-op",
      );
      assert.equal(x.s.values.get(key), raw);
      assert.equal(x.s.touched.filter(([op]) => op === "set").length, writes);
      assert.equal(key === OS ? parse(x).exportedAt : parse(x).updated, at);
    }
  },
);
await check(
  "engine timestamps normal saves and rejects caller timestamp replacement",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    const v = changed(x, "B");
    v.updated = later;
    assert.throws(
      () => x.session.captureSave(v, { at: later, form: "context" }),
      codes("invalid_data"),
    );
    assert.equal(parse(x).context.name, "A");
    assert.equal((await save(x, changed(x, "B"), later)).outcome, "saved");
    assert.equal(parse(x).updated, later);
  },
);
await check(
  "two actual sessions contend on the exact final lock and foreign baseline refuses",
  async () => {
    const s = storage(),
      l = locks(),
      a = await open(KEY, s, l),
      b = await open(KEY, s, l);
    const results = await Promise.allSettled([
      save(a, changed(a, "A")),
      save(b, changed(b, "B")),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "external_change",
    );
    assert.equal(parse(a).context.name, "A");
    assertOnlyKey(s, l, KEY);
  },
);
await check(
  "failed set retains exact native timestamp for export and retry; equal new save is pending",
  async () => {
    const x = await open();
    x.s.writeFail(true);
    const r = await save(x, changed(x, "Desired"));
    assert.equal(r.outcome, "unsaved");
    assert.equal(r.snapshot.pendingOperation, "set");
    const text = x.session.exportNative({ at: later }).text;
    assert.equal(JSON.parse(text).updated, at);
    assert.throws(
      () =>
        x.session.captureSave(clone(r.snapshot.value), {
          at: later,
          form: null,
        }),
      codes("pending_operation"),
    );
    x.s.writeFail(false);
    const retry = await x.session.retryPersist();
    assert.equal(retry.outcome, "saved");
    assert.equal(x.s.values.get(KEY), text);
  },
);
await check(
  "foreign disk blocks exact retry but leaves desired native memory exportable",
  async () => {
    const x = await open();
    x.s.writeFail(true);
    await save(x, changed(x, "Desired"));
    x.s.writeFail(false);
    x.s.values.set(
      KEY,
      JSON.stringify(native(m, KEY, model(m, KEY, "Foreign"))),
    );
    await reject(() => x.session.retryPersist(), "external_change");
    assert.equal(x.session.snapshot().pendingOperation, "set");
    assert.equal(
      JSON.parse(x.session.exportNative({ at: later }).text).context.name,
      "Desired",
    );
    assert.equal(parse(x).context.name, "Foreign");
  },
);
await check(
  "saved empty differs from remove and guarded Undo restores exact presence",
  async () => {
    const x = await open();
    await save(x, clone(x.session.snapshot().value));
    const saved = x.s.values.get(KEY),
      p = await x.session.previewRemove({ discardLocal: false });
    assert.equal((await x.session.applyRemove(p)).outcome, "saved");
    assert.equal(x.s.values.has(KEY), false);
    assert.equal(x.session.snapshot().persistence, "absent");
    assert.equal(
      (await x.session.undo({ discardLocal: false })).outcome,
      "saved",
    );
    assert.equal(x.s.values.get(KEY), saved);
    const y = await open();
    await save(y, changed(y, "New"));
    await y.session.undo({ discardLocal: false });
    assert.equal(y.s.values.has(KEY), false);
  },
);
await check(
  "failed remove can explicitly Undo pending intent, and failed Undo retries once",
  async () => {
    const x = await open();
    await save(x, changed(x, "Before"));
    const old = x.s.values.get(KEY),
      p = await x.session.previewRemove({ discardLocal: false });
    x.s.removeFail(true);
    assert.equal((await x.session.applyRemove(p)).outcome, "unsaved");
    assert.equal(x.session.snapshot().pendingOperation, "remove");
    x.s.writeFail(true);
    const u = await x.session.undo({ discardLocal: true });
    assert.equal(u.outcome, "unsaved");
    assert.equal(u.snapshot.pendingOperation, "set");
    assert.equal(u.snapshot.hasUndo, true);
    assert.equal(
      JSON.parse(x.session.exportNative({ at: later }).text).context.name,
      "Before",
    );
    x.s.writeFail(false);
    x.s.removeFail(false);
    await x.session.retryPersist();
    assert.equal(x.s.values.get(KEY), old);
    assert.equal(x.session.snapshot().hasUndo, false);
  },
);
await check(
  "corrupt protected A and unseen B then C each require a fresh warning/review",
  async () => {
    const s = storage();
    s.values.set(KEY, "A{corrupt");
    const x = await open(KEY, s);
    assert.equal(x.session.snapshot().hasCurrent, false);
    s.values.set(KEY, JSON.stringify(native(m, KEY, model(m, KEY, "B"))));
    await reject(
      () => x.session.previewRemove({ discardLocal: false }),
      "external_change",
    );
    assert.equal(x.session.rawSavedCopy("protected").raw, "A{corrupt");
    assert.match(x.session.rawSavedCopy("observed").raw, /B/);
    const p = await x.session.previewRemove({ discardLocal: false });
    s.values.set(KEY, "C{corrupt");
    await reject(() => x.session.applyRemove(p), "external_change");
    assert.equal(x.session.rawSavedCopy("protected").raw, "A{corrupt");
    assert.equal(x.session.rawSavedCopy("observed").raw, "C{corrupt");
    const q = await x.session.previewRemove({ discardLocal: false });
    await x.session.applyRemove(q);
    assert.equal(s.values.has(KEY), false);
  },
);
await check(
  "loading valid B without discard preserves protected corrupt A; explicit discard can release A",
  async () => {
    const s = storage();
    s.values.set(KEY, "A{protected");
    const x = await open(KEY, s);
    const b = JSON.stringify(native(m, KEY, model(m, KEY, "B")));
    s.values.set(KEY, b);
    await x.session.noticeExternalChange();
    const next = await x.session.reload({ discardLocal: false });
    assert.equal(next.persistence, "saved");
    assert.equal(next.value.context.name, "B");
    assert.deepEqual(x.session.rawSavedCopy("protected"), {
      copy: "protected",
      raw: "A{protected",
    });
    assert.deepEqual(x.session.rawSavedCopy("observed"), {
      copy: "observed",
      raw: b,
    });
    await x.session.reload({ discardLocal: false });
    assert.equal(x.session.rawSavedCopy("protected").raw, "A{protected");
    await x.session.reload({ discardLocal: true });
    assert.equal(x.session.rawSavedCopy("protected").raw, b);
    assert.equal(
      s.touched.some(([op]) => op === "set"),
      false,
    );
  },
);
await check(
  "empty corrupt raw is a copy; null/duplicate/future JSON never becomes a loaded blank",
  async () => {
    for (const raw of [
      "",
      "null",
      '{"version":1,"version":1}',
      JSON.stringify({ ...m.defaultProgramRecordValue(KEY), future: true }),
    ]) {
      const s = storage();
      s.values.set(KEY, raw);
      const x = await open(KEY, s);
      assert.equal(x.session.snapshot().hasCurrent, false);
      assert.deepEqual(x.session.rawSavedCopy("protected"), {
        copy: "protected",
        raw,
      });
      assert.equal(
        s.touched.some(([op]) => op !== "get"),
        false,
      );
    }
  },
);
await check(
  "read denial and corrupt reload retain valid desired memory and pending retry",
  async () => {
    const x = await open();
    await save(x, changed(x, "Before"));
    x.s.writeFail(true);
    await save(x, changed(x, "Desired"));
    x.s.readFail(true);
    const r = await x.session.reload({ discardLocal: true });
    assert.equal(r.code, "read_error");
    assert.equal(r.hasCurrent, true);
    assert.equal(r.observedRaw, undefined);
    assert.equal(r.persistence, "unsaved-memory");
    assert.equal(r.pendingOperation, "set");
    assert.equal(
      JSON.parse(x.session.exportNative({ at: later }).text).context.name,
      "Desired",
    );
    x.s.readFail(false);
    x.s.values.set(KEY, "B{bad");
    const bad = await x.session.reload({ discardLocal: true });
    assert.equal(bad.code, "corrupt");
    assert.equal(bad.pendingOperation, "set");
    assert.equal(bad.value.context.name, "Desired");
  },
);
await check(
  "initial read denial invents neither absence nor current records",
  async () => {
    const s = storage();
    s.readFail(true);
    const x = await open(KEY, s);
    assert.equal(x.session.snapshot().hasCurrent, false);
    assert.equal(x.session.snapshot().observedRaw, undefined);
    assert.equal(x.session.rawSavedCopy("observed"), null);
    assert.throws(() => x.session.exportNative({ at }), codes("corrupt"));
  },
);
await check(
  "missing locks or secure capability is read-only, with valid load and native export",
  async () => {
    for (const [l, secure] of [
      [null, true],
      [locks(), false],
    ]) {
      const s = storage();
      s.values.set(KEY, JSON.stringify(native(m, KEY, model(m))));
      const x = await open(KEY, s, l, digestGate(), secure);
      assert.equal(x.session.snapshot().code, "unsupported");
      assert.equal(x.session.snapshot().canWrite, false);
      assert.equal(x.session.exportNative({ at }).persistence, "saved");
      assert.throws(
        () => x.session.captureSave(changed(x, "No"), { at, form: null }),
        codes("unsupported"),
      );
      assert.equal(
        s.touched.some(([op]) => op === "set"),
        false,
      );
    }
  },
);
await check(
  "Retry without a pending exact intent cannot label an absent fallback Saved",
  async () => {
    const x = await open();
    assert.throws(() => x.session.retryPersist(), codes("pending_operation"));
    assert.equal(x.session.snapshot().persistence, "absent");
    assert.equal(x.s.values.has(KEY), false);
  },
);
await check(
  "denied secure hashing leaves valid loaded records read-only and exportable",
  async () => {
    const s = storage();
    s.values.set(KEY, JSON.stringify(native(m, KEY, model(m))));
    const d = {
      async digest() {
        throw Error("Synthetic WebCrypto denial");
      },
    };
    const x = await open(KEY, s, locks(), d);
    assert.equal(x.session.snapshot().hasCurrent, true);
    assert.equal(x.session.snapshot().code, "unsupported");
    assert.equal(x.session.snapshot().canWrite, false);
    assert.ok(x.session.exportNative({ at }).text.includes("Fictional name"));
    assert.throws(
      () => x.session.captureSave(changed(x, "No"), { at, form: null }),
      codes("unsupported"),
    );
    assert.equal(
      s.touched.some(([op]) => op === "set"),
      false,
    );
  },
);
await check(
  "trackers/tokens/forms are instance-owned and cleaning never clears another form",
  async () => {
    const x = await open(),
      other = m.createProgramRecordView(KEY);
    assert.throws(
      () => m.assertProgramRecordControlBinding(x.session, other),
      codes("foreign_owner"),
    );
    m.assertProgramRecordControlBinding(x.session, x.view);
    x.view.changedForm("context");
    x.view.changedForm("collection:sessions");
    const t = x.view.capture();
    assert.equal(x.view.markClean("context", other.capture()), false);
    assert.equal(x.view.markClean("context", t), true);
    assert.deepEqual(x.view.snapshot().dirtyForms, ["collection:sessions"]);
    x.view.changedForm("context");
    assert.equal(x.view.markClean("context", t), false);
    assert.throws(() => x.view.changedForm("editor:projects"));
    await reject(
      () =>
        withEnvironment({ s: x.s, l: x.l }, () =>
          m.openProgramRecordSession(KEY, { view: x.view }),
        ),
      "foreign_owner",
    );
  },
);
await check(
  "save/preview owners refuse clones, foreign sessions, double Apply and wrong kind",
  async () => {
    const x = await open(),
      y = await open(),
      c = x.session.captureSave(changed(x, "A"), { at, form: null });
    assert.throws(() => y.session.saveCaptured(c), codes("foreign_owner"));
    assert.throws(
      () => x.session.saveCaptured({ ...c }),
      codes("foreign_owner"),
    );
    await x.session.saveCaptured(c);
    assert.throws(() => x.session.saveCaptured(c), codes("used_authority"));
    const p = await x.session.previewRemove({ discardLocal: false });
    assert.throws(() => x.session.applyRestore(p), codes("invalid_data"));
    assert.throws(() => y.session.applyRemove(p), codes("foreign_owner"));
    assert.throws(
      () => x.session.applyRemove({ ...p }),
      codes("foreign_owner"),
    );
    await x.session.applyRemove(p);
    assert.throws(() => x.session.applyRemove(p), codes("used_authority"));
  },
);
await check(
  "dirty forms require explicit captured discard and newer edits revoke it",
  async () => {
    const x = await open();
    x.view.changedForm("context");
    await reject(
      () => x.session.previewRemove({ discardLocal: false }),
      "discard_required",
    );
    const p = await x.session.previewRemove({ discardLocal: true });
    x.view.changedForm("context");
    await reject(() => x.session.applyRemove(p), "stale_view");
    assert.equal(x.view.snapshot().dirtyForms.includes("context"), true);
  },
);
await check(
  "invalid file/source choice revokes an older valid preview",
  async () => {
    const x = await open(),
      raw = m.programRecordBackup(KEY, native(m, KEY, model(m))),
      p = await x.session.previewRestore(raw, { discardLocal: false });
    assert.throws(() =>
      x.session.previewRestore("bad", { discardLocal: false }),
    );
    await reject(() => x.session.applyRestore(p), "stale_view");
    assert.equal(x.s.values.has(KEY), false);
  },
);
await check(
  "late file digest and mutated source bytes never reopen a preview",
  async () => {
    const x = await open(),
      raw = new TextEncoder().encode(
        m.programRecordBackup(KEY, native(m, KEY, model(m))),
      );
    let gate = x.d.pause(),
      promise = x.session.previewRestore(raw, { discardLocal: false });
    await gate.started;
    raw[0] ^= 1;
    gate.release();
    await reject(() => promise, "input_changed");
    const bytes = new TextEncoder().encode(
      m.programRecordBackup(KEY, native(m, KEY, model(m))),
    );
    gate = x.d.pause();
    promise = x.session.previewRestore(bytes, { discardLocal: false });
    await gate.started;
    x.view.changedView();
    gate.release();
    await reject(() => promise, "stale_view");
    assert.equal(x.s.values.has(KEY), false);
  },
);
await check(
  "detached caller/options cannot retarget a queued save or invoke hooks under lock",
  async () => {
    const x = await open(),
      value = changed(x, "Captured"),
      opts = { at, form: "context" },
      capture = x.session.captureSave(value, opts),
      h = await hold(x.l, KEY),
      promise = x.session.saveCaptured(capture);
    let hooks = 0;
    Object.defineProperty(value.context, "name", {
      get() {
        hooks++;
        throw Error("Caller invoked");
      },
      enumerable: true,
    });
    opts.at = later;
    h.release();
    await h.done;
    const r = await promise;
    assert.equal(r.outcome, "saved");
    assert.equal(hooks, 0);
    assert.equal(parse(x).context.name, "Captured");
    assert.equal(parse(x).updated, at);
  },
);
await check(
  "final disk read rechecks view after a storage dependency and refuses stale no-op",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    const c = x.session.captureSave(clone(x.session.snapshot().value), {
      at: later,
      form: null,
    });
    x.s.getHook(() => {
      x.s.getHook(null);
      x.view.changedForm("context");
    });
    const r = await x.session.saveCaptured(c);
    assert.equal(r.outcome, "superseded");
    assert.equal(r.viewCurrent, false);
    assert.equal(parse(x).updated, at);
  },
);
await check(
  "storage dependency reentry refuses before assigning or writing",
  async () => {
    const x = await open(),
      c = x.session.captureSave(changed(x, "A"), { at, form: null });
    x.s.getHook(() => {
      x.s.getHook(null);
      x.session.captureSave(changed(x, "Reentrant"), { at, form: null });
    });
    await reject(() => x.session.saveCaptured(c), "reentrant_call");
    assert.equal(x.s.values.has(KEY), false);
  },
);
await check(
  "one running plus one replacement slot supersedes a hundred stale candidates",
  async () => {
    const x = await open(),
      h = await hold(x.l, KEY),
      promises = [];
    for (let i = 0; i < 100; i++) {
      const c = x.session.captureSave(changed(x, "Candidate " + i), {
        at,
        form: null,
      });
      promises.push(x.session.saveCaptured(c));
      if (i === 0) await new Promise((r) => setTimeout(r, 0));
    }
    h.release();
    await h.done;
    const results = await Promise.all(promises);
    assert.equal(results.filter((r) => r.outcome === "saved").length, 1);
    assert.equal(results.filter((r) => r.outcome === "superseded").length, 99);
    assert.equal(parse(x).context.name, "Candidate 99");
    assert.equal(x.s.touched.filter(([op]) => op === "set").length, 1);
  },
);
await check(
  "held digest allows one running preview preparation and only the newest pending preview",
  async () => {
    const x = await open(),
      gate = x.d.pause(),
      base = x.d.calls.length,
      results = [];
    const settled = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    results.push(
      settled(
        x.session.previewReplace(model(m, KEY, "Preview 0"), {
          kind: "replace",
          at,
          discardLocal: false,
        }),
      ),
    );
    await gate.started;
    for (let i = 1; i < 100; i++)
      results.push(
        settled(
          x.session.previewReplace(model(m, KEY, "Preview " + i), {
            kind: "replace",
            at,
            discardLocal: false,
          }),
        ),
      );
    assert.equal(
      x.d.calls.length,
      base + 1,
      "pending previews have not started digest/preparation",
    );
    gate.release();
    const done = await Promise.all(results);
    assert.equal(done[0].error.code, "stale_view");
    assert.equal(done.filter((v) => v.error?.code === "superseded").length, 98);
    assert.equal(x.d.calls.length, base + 2);
    await x.session.applyRestore(done.at(-1).value);
    assert.equal(parse(x).context.name, "Preview 99");
  },
);
await check(
  "held lock does not retain a digest job per recovery choice",
  async () => {
    const x = await open(),
      h = await hold(x.l, KEY),
      base = x.d.calls.length,
      results = [];
    const settled = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    results.push(
      settled(
        x.session.previewReplace(model(m, KEY, "Lock 0"), {
          kind: "replace",
          at,
          discardLocal: false,
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 1; i < 50; i++)
      results.push(
        settled(
          x.session.previewReplace(model(m, KEY, "Lock " + i), {
            kind: "replace",
            at,
            discardLocal: false,
          }),
        ),
      );
    assert.equal(x.d.calls.length, base + 1);
    h.release();
    await h.done;
    const done = await Promise.all(results);
    assert.equal(done[0].error.code, "stale_view");
    assert.equal(done.filter((v) => v.error?.code === "superseded").length, 48);
    assert.equal(x.d.calls.length, base + 2);
    await x.session.applyRestore(done.at(-1).value);
    assert.equal(parse(x).context.name, "Lock 49");
  },
);
await check(
  "save and recovery preparation share the same one-running/one-slot pump",
  async () => {
    const x = await open(),
      gate = x.d.pause(),
      base = x.d.calls.length;
    const first = x.session.captureSave(changed(x, "Running save"), {
        at,
        form: null,
      }),
      saving = x.session.saveCaptured(first);
    await gate.started;
    const preview = x.session
      .previewReplace(model(m, KEY, "Replaced preview"), {
        kind: "example",
        at,
        discardLocal: false,
      })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    const last = x.session.captureSave(changed(x, "Newest save"), {
        at,
        form: null,
      }),
      lastSave = x.session.saveCaptured(last);
    assert.equal(x.d.calls.length, base + 1);
    gate.release();
    assert.equal((await saving).outcome, "superseded");
    assert.equal((await preview).error.code, "superseded");
    assert.equal((await lastSave).outcome, "saved");
    assert.equal(x.d.calls.length, base + 2);
    assert.equal(parse(x).context.name, "Newest save");
  },
);
await check(
  "cancel/form changes release a pending full preview before the running digest finishes",
  async () => {
    const x = await open(),
      gate = x.d.pause(),
      base = x.d.calls.length;
    const running = x.session
      .previewReplace(model(m), { kind: "replace", at, discardLocal: false })
      .catch((error) => error);
    await gate.started;
    let settled = false;
    const pending = x.session
      .previewReplace(model(m, KEY, "Will cancel"), {
        kind: "replace",
        at,
        discardLocal: false,
      })
      .catch((error) => {
        settled = true;
        return error;
      });
    x.view.changedForm("context");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(
      settled,
      true,
      "pending owned references/promise were released before digest release",
    );
    assert.equal((await pending).code, "superseded");
    assert.equal(x.d.calls.length, base + 1);
    gate.release();
    assert.equal((await running).code, "stale_view");
    assert.equal(x.d.calls.length, base + 1);
    assert.equal(x.s.values.has(KEY), false);
  },
);
await check("queued Reload discard cannot erase a later raw edit", async () => {
  const x = await open();
  await save(x, changed(x, "A"));
  x.view.changedForm("context");
  const h = await hold(x.l, KEY),
    p = x.session.reload({ discardLocal: true });
  x.view.changedForm("context");
  h.release();
  await h.done;
  await reject(() => p, "stale_view");
  assert.equal(x.view.snapshot().dirtyForms.includes("context"), true);
  assert.equal(x.session.snapshot().value.context.name, "A");
});
await check(
  "native Restore preserves historical clocks and every OS linked/null/zero/signed record",
  async () => {
    for (const key of [KEY, OS]) {
      const x = await open(key),
        n =
          key === OS
            ? osEnvelope()
            : native(m, key, model(m, key, "Historical")),
        raw = m.programRecordBackup(key, n),
        p = await x.session.previewRestore(raw, { discardLocal: false });
      assert.ok(Object.isFrozen(p.summary));
      assert.equal((await x.session.applyRestore(p)).outcome, "saved");
      assert.equal(x.s.values.get(key), raw);
      assert.deepEqual(
        JSON.parse(x.session.exportNative({ at: later }).text),
        n,
      );
    }
  },
);
await check(
  "exact valid 8,000,000 native save/export/parse/restore works and +1 refuses without memory change",
  async () => {
    const value = exactGeneralBoundary(m),
      x = await open();
    value.updated = "";
    const r = await save(x, value);
    assert.equal(r.outcome, "saved");
    const text = x.session.exportNative({ at: later }).text;
    assert.equal(Buffer.byteLength(text), 8_000_000);
    const y = await open(),
      p = await y.session.previewRestore(text, { discardLocal: false });
    await y.session.applyRestore(p);
    assert.equal(y.s.values.get(KEY), text);
    const too = exactGeneralBoundary(m, 8_000_001);
    too.updated = at;
    const before = x.session.snapshot().hash;
    assert.throws(
      () => x.session.captureSave(too, { at: later, form: null }),
      codes("input_limit"),
    );
    assert.equal(x.session.snapshot().hash, before);
  },
);
await check(
  "disposal revokes pending digests, captures/previews and controls binding",
  async () => {
    const x = await open(),
      raw = m.programRecordBackup(KEY, native(m, KEY, model(m))),
      gate = x.d.pause(),
      p = x.session.previewRestore(raw, { discardLocal: false });
    await gate.started;
    x.session.dispose();
    gate.release();
    await reject(() => p, "closed");
    assert.equal(x.s.values.has(KEY), false);
    assert.equal(x.session.snapshot().canWrite, false);
    assert.throws(
      () => m.assertProgramRecordControlBinding(x.session, x.view),
      codes("closed"),
    );
  },
);
console.log(`Program record recovery engine: ${groups} actual groups passed.`);
