// Actual closed facade against controlled fictional storage/locks/digests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actual,
  storage,
  locks,
  hold,
  strict,
  codes,
  digestGate,
  withEnvironment,
  assertOnlyKey,
  clone,
  researchValue,
  STAMP,
  KEY,
} from "../test-fixtures/remaining-record-recovery/harness.mjs";
const m = await actual();
let groups = 0;
async function check(name, fn) {
  try {
    await fn();
    groups++;
    console.log("PASS " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
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
  const view = m.createRemainingRecordView(key),
    session = await withEnvironment({ s, l, d, secure }, () =>
      m.openRemainingRecordSession(key, { view }),
    );
  return { key, s, l, d, view, session };
}
function changed(x, name = "Fictional updated") {
  const v = clone(x.session.snapshot().value);
  if (m.researchForRemainingKey(x.key)) v.draft.title = name;
  else if (m.partnerForRemainingKey(x.key)) {
    v.context.name = name;
    v.updated = STAMP;
  } else if (x.key === KEY) v.title = name;
  else if (x.key === "charitology-country-notes-v1")
    v.AFG = { voices: name, institutions: "", gaps: "" };
  else if (x.key === "charitology-depth-census-v1")
    v.rows = [
      {
        id: "fictional row",
        activity: name,
        amount: 0,
        depth: "unknown",
        source: "Fictional rationale",
      },
    ];
  else
    v.push({
      id: "fictional nomination",
      ...Object.fromEntries(
        m.RR_NOMINATION_FIELDS.map((f) => [
          f,
          f === "depth" ? "unknown" : name,
        ]),
      ),
    });
  return v;
}
function form(x) {
  return m.researchForRemainingKey(x.key)
    ? "draft"
    : m.partnerForRemainingKey(x.key)
      ? "context"
      : x.key === KEY
        ? "manuscript"
        : x.key === "charitology-country-notes-v1"
          ? "country:AFG"
          : x.key === "charitology-depth-census-v1"
            ? "activity"
            : "nomination";
}
async function save(x, v, clean = true) {
  x.view.changedForm(form(x));
  const cap = x.session.captureSave(v, { form: form(x) }),
    result = await x.session.saveCaptured(cap);
  if (
    clean &&
    ["saved", "no-op"].includes(result.outcome) &&
    x.view.isCurrent(result.view)
  )
    x.view.markClean(form(x), result.view);
  return result;
}
const settle = (p) =>
  Promise.resolve(p).then(
    (v) => ({ value: v }),
    (error) => ({ error }),
  );
await check(
  "actual engine and imports strict0, fixedfacade without legacy storage engines or arbitrary validators",
  async () => {
    await strict(["src/lib/client/remaining-record-recovery.ts"]);
    const source = readFileSync(
      "src/lib/client/remaining-record-recovery.ts",
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /from ["']\.\/(?:store|persist|program-record-recovery)["']/,
    );
    assert.doesNotMatch(
      source,
      /Object\.keys\(localStorage|localStorage\.clear|setInterval\(/,
    );
  },
);
await check(
  "all20 defaults use exactkey lock, remain absent, detached and unwritten",
  async () => {
    for (const key of m.RR_KEYS) {
      const x = await open(key),
        s = x.session.snapshot();
      assert.equal(s.hasCurrent, true);
      assert.equal(s.persistence, "absent");
      assert.equal(s.observedPresence, "absent");
      assert.equal(s.pendingPersist, false);
      assert.equal(x.s.values.size, 0);
      assert.ok(Object.isFrozen(s.value));
      assertOnlyKey(x.s, x.l, key);
      x.session.dispose();
    }
  },
);
await check(
  "all20 original native saves are compact, preserve keys/shapes/timestamps and read exactwhitespace without rewrite",
  async () => {
    for (const key of m.RR_KEYS) {
      const x = await open(key),
        v = changed(x);
      await save(x, v);
      assert.equal(x.s.values.get(key), JSON.stringify(v));
      assert.deepEqual(x.session.snapshot().value, v);
      const raw = " \n" + m.remainingRecordBackup(key, v) + "\n ",
        s = storage();
      s.values.set(key, raw);
      const y = await open(key, s);
      assert.equal(y.session.snapshot().persistence, "saved");
      assert.equal(s.values.get(key), raw);
      assert.equal(s.touched.filter(([op]) => op !== "get").length, 0);
      assert.equal(
        y.session.exportNative().text,
        m.remainingRecordBackup(key, v),
      );
      x.session.dispose();
      y.session.dispose();
    }
  },
);
await check(
  "strict owner/session/key/token/capture checks reject forged, cloned or foreign authority",
  async () => {
    const a = await open(),
      b = await open();
    const cap = a.session.captureSave(changed(a), { form: null });
    await reject(() => b.session.saveCaptured(cap), "foreign_owner");
    await reject(() => a.session.saveCaptured({ ...cap }), "foreign_owner");
    assert.equal(a.view.isCurrent({ ...cap.view }), false);
    assert.equal(a.view.markClean("manuscript", { ...cap.view }), false);
    await reject(
      () => m.openRemainingRecordSession(KEY, { view: a.view }),
      "foreign_owner",
    );
    assert.throws(
      () => m.assertRemainingRecordControlBinding(b.session, a.view),
      codes("foreign_owner"),
    );
    assert.throws(() => a.view.changedForm("context"));
    assert.throws(
      () =>
        a.session.captureSave(changed(a), {
          form: null,
          validator() {
            throw Error();
          },
        }),
      "Exact options only",
    );
  },
);
await check(
  "capture synchronously admits full native schema/capacity before an editor may bind newidentity",
  async () => {
    const x = await open("charitology-nominations-v1"),
      v = changed(x);
    const invalid = clone(v);
    invalid[0].unknown = "";
    assert.throws(
      () => x.session.captureSave(invalid, { form: "nomination" }),
      codes("invalid_data"),
    );
    assert.deepEqual(x.session.snapshot().value, []);
    assert.equal(x.s.values.size, 0);
    const cap = x.session.captureSave(v, { form: "nomination" });
    v[0].title = "later foreign mutation";
    const r = await x.session.saveCaptured(cap);
    assert.equal(r.outcome, "saved");
    assert.equal(r.snapshot.value[0].title, "Fictional updated");
    assert.equal(r.snapshot.value[0].id, "fictional nomination");
  },
);
await check(
  "options/native input getters/toJSON never execute; detached owned values survive caller mutation",
  async () => {
    const x = await open(),
      v = changed(x, "Captured exact"),
      settings = { form: "manuscript" };
    let calls = 0;
    const evil = {};
    Object.defineProperty(evil, "form", {
      get() {
        calls++;
        return null;
      },
      enumerable: true,
    });
    assert.throws(() => x.session.captureSave(v, evil));
    const cap = x.session.captureSave(v, settings);
    v.title = "changed";
    settings.form = null;
    await x.session.saveCaptured(cap);
    assert.equal(x.session.snapshot().value.title, "Captured exact");
    assert.equal(calls, 0);
  },
);
await check(
  "newcapture revokes old unstarted payload/authority; later old submission settles superseded",
  async () => {
    const x = await open(),
      a = x.session.captureSave(changed(x, "old"), { form: null }),
      b = x.session.captureSave(changed(x, "new"), { form: null });
    assert.equal((await x.session.saveCaptured(a)).outcome, "superseded");
    assert.equal((await x.session.saveCaptured(b)).outcome, "saved");
    assert.equal(x.session.snapshot().value.title, "new");
    await reject(() => x.session.saveCaptured(b), "used_preview");
  },
);
await check(
  "one held digest admits newestsave only and immediately settles100 unstarted submissions",
  async () => {
    const x = await open(),
      gate = x.d.pause(),
      first = settle(
        x.session.saveCaptured(
          x.session.captureSave(changed(x, "running"), { form: null }),
        ),
      );
    await gate.started;
    const all = [];
    for (let i = 0; i < 100; i++) {
      const p = settle(
        x.session.saveCaptured(
          x.session.captureSave(changed(x, "pending-" + i), { form: null }),
        ),
      );
      all.push(p);
    }
    for (const p of all.slice(0, -1))
      assert.equal((await p).value.outcome, "superseded");
    assert.equal(x.d.calls.length, 1);
    gate.release();
    assert.equal((await first).value.outcome, "superseded");
    assert.equal((await all.at(-1)).value.outcome, "saved");
    assert.equal(x.session.snapshot().value.title, "pending-99");
    assert.equal(x.s.touched.filter(([op]) => op === "set").length, 1);
  },
);
await check(
  "one shared held-digest lane bounds100restore/example/replace preview floods and immediate typed superseded rejection",
  async () => {
    const x = await open(),
      gate = x.d.pause(),
      first = settle(
        x.session.previewReplace(changed(x, "running"), {
          kind: "example",
          discardLocal: true,
        }),
      );
    await gate.started;
    const all = [];
    for (let i = 0; i < 100; i++) {
      const v = changed(x, "preview-" + i),
        p =
          i % 3 === 0
            ? x.session.previewRestore(m.remainingRecordBackup(KEY, v), {
                discardLocal: true,
              })
            : x.session.previewReplace(v, {
                kind: i % 3 === 1 ? "example" : "replace",
                discardLocal: true,
              });
      all.push(settle(p));
    }
    for (const p of all.slice(0, -1))
      assert.equal((await p).error.code, "superseded");
    assert.equal(x.d.calls.length, 1);
    gate.release();
    assert.equal((await first).error.code, "stale_view");
    const preview = (await all.at(-1)).value;
    assert.equal(preview.summary.replacesCurrent, true);
    assert.equal((await x.session.applyRestore(preview)).outcome, "saved");
    assert.equal(x.session.snapshot().value.title, "preview-99");
  },
);
await check(
  "one shared held-lock lane bounds50mixed save/restore/replacement jobs without parallel hashing or writes",
  async () => {
    const x = await open(),
      blocked = await hold(x.l, KEY);
    const first = settle(
      x.session.previewReplace(changed(x, "running"), {
        kind: "replace",
        discardLocal: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const all = [];
    for (let i = 0; i < 50; i++) {
      const v = changed(x, "mixed-" + i);
      all.push(
        settle(
          i % 2
            ? x.session.previewRestore(m.remainingRecordBackup(KEY, v), {
                discardLocal: true,
              })
            : x.session.saveCaptured(x.session.captureSave(v, { form: null })),
        ),
      );
    }
    for (const p of all.slice(0, -1)) {
      const result = await p;
      assert.ok(
        result.error?.code === "superseded" ||
          result.value?.outcome === "superseded",
      );
    }
    assert.equal(x.d.calls.length, 1);
    assert.equal(x.s.values.size, 0);
    blocked.release();
    await blocked.done;
    assert.equal((await first).error.code, "stale_view");
    const last = (await all.at(-1)).value;
    await x.session.applyRestore(last);
    assert.equal(x.session.snapshot().value.title, "mixed-49");
  },
);
await check(
  "mixedpreview revokesrunning save and save revokesrunning preview, with only newest admitted authority",
  async () => {
    for (const saving of [true, false]) {
      const x = await open(),
        g = x.d.pause(),
        first = settle(
          saving
            ? x.session.saveCaptured(
                x.session.captureSave(changed(x, "old"), { form: null }),
              )
            : x.session.previewReplace(changed(x, "old"), {
                kind: "replace",
                discardLocal: true,
              }),
        );
      await g.started;
      const final = settle(
        saving
          ? x.session.previewReplace(changed(x, "new"), {
              kind: "replace",
              discardLocal: true,
            })
          : x.session.saveCaptured(
              x.session.captureSave(changed(x, "new"), { form: null }),
            ),
      );
      g.release();
      const a = await first;
      assert.ok(
        a.value?.outcome === "superseded" || a.error?.code === "stale_view",
      );
      const b = await final;
      if (saving) await x.session.applyRestore(b.value);
      else assert.equal(b.value.outcome, "saved");
      assert.equal(x.session.snapshot().value.title, "new");
    }
  },
);
await check(
  "exactfailedset retains admitted ID/timestamp/candidate; newer rawtyping blocks ordinarysave and Retry never rereads it",
  async () => {
    const key = "charitology.partner-workspace-v1.the-charitology-fund",
      x = await open(key);
    x.s.writeFail(true);
    const v = changed(x, "Exact failed candidate"),
      r = await save(x, v, false);
    assert.equal(r.outcome, "unsaved");
    assert.equal(r.snapshot.pendingPersist, true);
    assert.equal(r.snapshot.persistence, "unsaved");
    const raw = x.session.exportNative().text;
    x.view.changedForm("context");
    await reject(
      () =>
        x.session.captureSave(changed(x, "new raw draft"), { form: "context" }),
      "unsaved_intent",
    );
    assert.equal(x.session.exportNative().text, raw);
    x.s.writeFail(false);
    const retried = await x.session.retryPersist();
    assert.equal(retried.outcome, "saved");
    assert.deepEqual(JSON.parse(x.s.values.get(key)), v);
    assert.equal(x.view.snapshot().dirtyForms.includes("context"), true);
    assert.equal(retried.snapshot.value.updated, STAMP);
  },
);
await check(
  "failedset followed by guarded explicitreplace may supersede failedintent; later edit revokes review",
  async () => {
    const x = await open();
    x.s.writeFail(true);
    await save(x, changed(x, "failed"), false);
    x.s.writeFail(false);
    const p = await x.session.previewReplace(changed(x, "replacement"), {
      kind: "replace",
      discardLocal: true,
    });
    x.view.changedForm("manuscript");
    await reject(() => x.session.applyRestore(p), "stale_view");
    assert.equal(x.session.snapshot().pendingPersist, true);
    const next = await x.session.previewReplace(changed(x, "replacement"), {
      kind: "replace",
      discardLocal: true,
    });
    assert.equal((await x.session.applyRestore(next)).outcome, "saved");
    assert.equal(x.session.snapshot().value.title, "replacement");
  },
);
await check(
  "foreignsavedchange rejects exactRetry and retains desired export plus protected baseline",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    x.s.writeFail(true);
    await save(x, changed(x, "desired"), false);
    x.s.writeFail(false);
    const desired = x.session.exportNative().text;
    x.s.values.set(KEY, JSON.stringify(changed(x, "B")));
    await reject(() => x.session.retryPersist(), "conflict");
    assert.equal(x.session.snapshot().code, "conflict");
    assert.equal(x.session.exportNative().text, desired);
    assert.equal(
      JSON.parse(x.session.rawSavedCopy("protected").raw).title,
      "A",
    );
    assert.equal(JSON.parse(x.session.rawSavedCopy("observed").raw).title, "B");
  },
);
await check(
  "two cooperating sessions serialize underexactkey; stale save cannot overwrite first writer",
  async () => {
    const s = storage(),
      l = locks(),
      a = await open(KEY, s, l),
      b = await open(KEY, s, l);
    const ra = await save(a, changed(a, "A"));
    assert.equal(ra.outcome, "saved");
    await reject(() => save(b, changed(b, "B")), "conflict");
    assert.equal(JSON.parse(s.values.get(KEY)).title, "A");
    assert.equal(b.session.snapshot().value.title, "");
    assertOnlyKey(s, l, KEY);
    await b.session.reload({ discardLocal: true });
    assert.equal(b.session.snapshot().value.title, "A");
  },
);
await check(
  "final exact UTF16/presence CAS catches differentlyformatted and lone-surrogate foreign data",
  async () => {
    const x = await open();
    await save(x, changed(x, "saved"));
    x.s.values.set(KEY, " " + x.s.values.get(KEY));
    await reject(() => save(x, changed(x, "stale")), "conflict");
    assert.equal(x.s.values.get(KEY).startsWith(" "), true);
    const y = await open(),
      p = await y.session.previewReplace(changed(y, "candidate"), {
        kind: "replace",
        discardLocal: true,
      });
    y.s.values.set(KEY, "\ud800");
    await reject(() => y.session.applyRestore(p), "conflict");
    assert.equal(y.s.values.get(KEY), "\ud800");
  },
);
await check(
  "corruptA unseenB firstwarn then explicitfreshreview; BtoC warns again and A stays separate",
  async () => {
    const s = storage();
    s.values.set(KEY, "A corrupt \ud800");
    const x = await open(KEY, s);
    assert.equal(x.session.snapshot().hasCurrent, false);
    assert.equal(x.session.snapshot().hasProtectedRaw, true);
    s.values.set(KEY, "B corrupt \udfff");
    await reject(
      () =>
        x.session.previewReplace(m.defaultRemainingRecordValue(KEY), {
          kind: "replace",
          discardLocal: true,
        }),
      "conflict",
    );
    assert.equal(x.session.rawSavedCopy("protected").raw, "A corrupt \ud800");
    assert.equal(x.session.rawSavedCopy("observed").raw, "B corrupt \udfff");
    const p = await x.session.previewReplace(
      m.defaultRemainingRecordValue(KEY),
      { kind: "replace", discardLocal: true },
    );
    s.values.set(KEY, "C corrupt");
    await reject(() => x.session.applyRestore(p), "conflict");
    const p2 = await x.session.previewReplace(
      m.defaultRemainingRecordValue(KEY),
      { kind: "replace", discardLocal: true },
    );
    await x.session.applyRestore(p2);
    assert.equal(x.session.rawSavedCopy("protected").raw, "A corrupt \ud800");
  },
);
await check(
  "nativefile digest binds exact admitted source bytes; source decorations remain inert and later source mutation cannot retarget",
  async () => {
    const x = await open(),
      raw = m.remainingRecordBackup(KEY, changed(x, "file A")),
      bytes = new TextEncoder().encode(raw);
    let called = 0;
    Object.defineProperty(bytes, "constructor", {
      get() {
        called++;
        throw Error();
      },
    });
    const g = x.d.pause(),
      promise = x.session.previewRestore(bytes, { discardLocal: true });
    await g.started;
    bytes.fill(0);
    g.release();
    const p = await promise;
    await x.session.applyRestore(p);
    assert.equal(x.session.snapshot().value.title, "file A");
    assert.equal(called, 0);
    const y = await open(),
      a = await y.session.previewRestore(raw, { discardLocal: true }),
      z = await open(),
      b = await z.session.previewRestore(" " + raw, { discardLocal: true });
    assert.notEqual(a.reviewHash, b.reviewHash);
  },
);
await check(
  "one-use restore/remove previews reject copied/wrongkind/reused authority and stalecurrent view",
  async () => {
    const x = await open(),
      p = await x.session.previewRestore(
        m.remainingRecordBackup(KEY, changed(x)),
        { discardLocal: true },
      );
    await reject(() => x.session.applyRestore({ ...p }), "foreign_owner");
    await reject(() => x.session.applyRemove(p), "invalid_data");
    assert.equal((await x.session.applyRestore(p)).outcome, "saved");
    await reject(() => x.session.applyRestore(p), "used_preview");
    const q = await x.session.previewRemove({ discardLocal: true });
    x.view.changedView();
    await reject(() => x.session.applyRemove(q), "stale_view");
    assert.equal(x.s.values.has(KEY), true);
  },
);
await check(
  "read denial is unavailable notabsence and cannot invent raw current or writable blank",
  async () => {
    const s = storage();
    s.readFail(true);
    const x = await open(KEY, s),
      snap = x.session.snapshot();
    assert.equal(snap.observedPresence, "unreadable");
    assert.equal(snap.hasCurrent, false);
    assert.equal(snap.canWrite, false);
    assert.equal(x.session.rawSavedCopy("protected"), null);
    assert.equal(x.session.rawSavedCopy("observed"), null);
    assert.throws(() => x.session.exportNative(), codes("invalid_data"));
    s.readFail(false);
    await x.session.reload({ discardLocal: true });
    assert.equal(x.session.snapshot().persistence, "absent");
  },
);
await check(
  "failedreload keeps valid memory, pendingdesired export and protectedA; valid reload false preservesprotectedA",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    x.s.writeFail(true);
    await save(x, changed(x, "desired"), false);
    const before = x.session.exportNative().text;
    x.s.readFail(true);
    const r = await x.session.reload({ discardLocal: true });
    assert.equal(r.pendingPersist, true);
    assert.equal(x.session.exportNative().text, before);
    x.s.readFail(false);
    x.s.writeFail(false);
    x.s.values.set(KEY, "corrupt");
    await x.session.reload({ discardLocal: true });
    assert.equal(x.session.exportNative().text, before);
    x.s.values.set(KEY, JSON.stringify(changed(x, "B")));
    await x.session.reload({ discardLocal: true });
    assert.equal(x.session.snapshot().value.title, "B");
    const s = storage();
    s.values.set(KEY, "protected A");
    const y = await open(KEY, s);
    s.values.set(
      KEY,
      m.remainingRecordBackup(KEY, m.defaultRemainingRecordValue(KEY)),
    );
    await y.session.reload({ discardLocal: false });
    assert.equal(y.session.rawSavedCopy("protected").raw, "protected A");
  },
);
await check(
  "savedempty countrymap, rawemptystring and absent remain distinct; emptyrawcopy never becomesnull",
  async () => {
    const key = "charitology-country-notes-v1",
      x = await open(key);
    assert.equal(x.session.snapshot().persistence, "absent");
    await save(x, {});
    assert.equal(x.session.snapshot().persistence, "saved");
    assert.equal(x.s.values.get(key), "{}");
    const s = storage();
    s.values.set(key, "");
    const y = await open(key, s);
    assert.equal(y.session.snapshot().code, "corrupt");
    assert.deepEqual(y.session.rawSavedCopy("protected"), {
      copy: "protected",
      raw: "",
    });
    assert.equal(y.session.snapshot().hasCurrent, false);
  },
);
await check(
  "reviewedremove removesonekey and one guardedUndo restores previousvalid presence/model",
  async () => {
    const x = await open();
    x.s.values.set("unrelated", "untouched");
    await save(x, changed(x, "A"));
    const p = await x.session.previewRemove({ discardLocal: false });
    const r = await x.session.applyRemove(p);
    assert.equal(r.snapshot.persistence, "absent");
    assert.equal(x.s.values.has(KEY), false);
    assert.equal(x.s.values.get("unrelated"), "untouched");
    assert.equal(r.snapshot.canUndo, true);
    const back = await x.session.undo({ discardLocal: true });
    assert.equal(back.snapshot.value.title, "A");
    assert.equal(back.snapshot.canUndo, false);
    await reject(() => x.session.undo({ discardLocal: true }), "invalid_data");
  },
);
await check(
  "failedremove supports explicitUndo; failedUndo retains exactretry without repeat toggling",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    x.s.removeFail(true);
    const p = await x.session.previewRemove({ discardLocal: false });
    assert.equal((await x.session.applyRemove(p)).outcome, "unsaved");
    assert.equal(x.session.snapshot().canUndo, true);
    x.s.writeFail(true);
    assert.equal(
      (await x.session.undo({ discardLocal: true })).outcome,
      "unsaved",
    );
    assert.equal(x.session.snapshot().value.title, "A");
    x.s.writeFail(false);
    assert.equal((await x.session.retryPersist()).outcome, "saved");
    assert.equal(x.session.snapshot().canUndo, false);
    assert.equal(JSON.parse(x.s.values.get(KEY)).title, "A");
  },
);
await check(
  "failedrestore retains candidate/oldraw/Undo and consumedpreview cannot be reused",
  async () => {
    const x = await open();
    await save(x, changed(x, "old"));
    const p = await x.session.previewRestore(
      m.remainingRecordBackup(KEY, changed(x, "restore")),
      { discardLocal: false },
    );
    x.s.writeFail(true);
    const r = await x.session.applyRestore(p);
    assert.equal(r.outcome, "unsaved");
    assert.equal(r.snapshot.value.title, "restore");
    assert.equal(r.snapshot.canUndo, true);
    await reject(() => x.session.applyRestore(p), "used_preview");
    assert.equal(JSON.parse(x.s.values.get(KEY)).title, "old");
    x.s.writeFail(false);
    await x.session.retryPersist();
    assert.equal(JSON.parse(x.s.values.get(KEY)).title, "restore");
  },
);
await check(
  "discardfalse protects dirtyforms,failedintent and meaningful unsaved memory; download never marks clean",
  async () => {
    const x = await open();
    x.view.changedForm("manuscript");
    assert.throws(
      () => x.session.previewRemove({ discardLocal: false }),
      codes("discard_required"),
    );
    assert.throws(
      () =>
        x.session.previewRestore(m.remainingRecordBackup(KEY, changed(x)), {
          discardLocal: false,
        }),
      codes("discard_required"),
    );
    x.session.exportNative();
    assert.deepEqual(x.view.snapshot().dirtyForms, ["manuscript"]);
    x.s.writeFail(true);
    await save(x, changed(x), false);
    assert.throws(
      () => x.session.reload({ discardLocal: false }),
      codes("discard_required"),
    );
  },
);
await check(
  "readonly missinglocks/hash can load/export valid native and raw corruptcopies but neverwrite",
  async () => {
    for (const what of ["locks", "hash", "secure"]) {
      const s = storage();
      s.values.set(
        KEY,
        m.remainingRecordBackup(KEY, {
          ...m.defaultRemainingRecordValue(KEY),
          title: "read only",
        }),
      );
      const x = await open(
        KEY,
        s,
        what === "locks" ? null : locks(),
        what === "hash" ? { digest: undefined } : digestGate(),
        what !== "secure",
      );
      assert.equal(x.session.snapshot().code, "read-only");
      assert.equal(x.session.snapshot().value.title, "read only");
      assert.match(x.session.exportNative().text, /read only/);
      await reject(
        () => x.session.captureSave(changed(x), { form: null }),
        "unavailable",
      );
      assert.equal(s.touched.filter(([op]) => op !== "get").length, 0);
    }
  },
);
await check(
  "digest or lock capability failure turns read-only and preserves bytes/model",
  async () => {
    const x = await open();
    x.d.digest = async () => {
      throw Error("unused bound method");
    };
    const d = {
        async digest() {
          throw Error("hash denied");
        },
      },
      y = await open(KEY, storage(), locks(), d);
    assert.equal(y.session.snapshot().code, "ready");
    await reject(() => save(y, changed(y)), "unavailable");
    assert.equal(y.session.snapshot().code, "read-only");
    assert.equal(y.s.values.size, 0);
    const l = {
        request() {
          throw Error("locks denied");
        },
      },
      z = await open(KEY, storage(), l);
    assert.equal(z.session.snapshot().code, "read-only");
    assert.equal(z.session.snapshot().hasCurrent, true);
  },
);
await check(
  "stale no-op and final read-induced formgeneration change neverwrite or clean currentform",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    let once = true;
    x.s.getHook(() => {
      if (once) {
        once = false;
        x.view.changedForm("manuscript");
      }
    });
    const cap = x.session.captureSave(clone(x.session.snapshot().value), {
        form: "manuscript",
      }),
      r = await x.session.saveCaptured(cap);
    assert.equal(r.outcome, "superseded");
    assert.equal(r.viewCurrent, false);
    assert.equal(x.view.markClean("manuscript", r.view), false);
    assert.equal(x.s.touched.filter(([op]) => op === "set").length, 1);
  },
);
await check(
  "noticeexternalchange revokes sourceauthority and retains in-memory work without adoption",
  async () => {
    const x = await open();
    await save(x, changed(x, "A"));
    const p = await x.session.previewReplace(changed(x, "reviewed"), {
      kind: "replace",
      discardLocal: true,
    });
    x.s.values.set(KEY, JSON.stringify(changed(x, "foreign")));
    const r = await x.session.noticeExternalChange();
    assert.equal(r.code, "conflict");
    assert.equal(r.value.title, "A");
    await reject(() => x.session.applyRestore(p), "stale_view");
  },
);
await check(
  "dispose revokes helddigest/heldlock/queued captures and releases session payloads withoutwrites",
  async () => {
    for (const useLock of [false, true]) {
      const x = await open(),
        held = useLock ? await hold(x.l, KEY) : x.d.pause(),
        run = settle(
          x.session.saveCaptured(
            x.session.captureSave(changed(x, "candidate"), { form: null }),
          ),
        );
      if (useLock) await new Promise((r) => setTimeout(r, 0));
      else await held.started;
      x.session.dispose();
      held.release();
      if (useLock) await held.done;
      const r = await run;
      assert.ok(
        r.error?.code === "disposed" || r.value?.outcome === "superseded",
      );
      assert.equal(x.s.values.size, 0);
      assert.equal(x.session.snapshot().code, "disposed");
      assert.throws(() => x.session.exportNative(), codes("disposed"));
    }
  },
);
console.log(`Remaining-record engine: ${groups} groups passed.`);
