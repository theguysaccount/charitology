// Actual final-key course adapter checks. All data and dependencies are synthetic.
import assert from "node:assert/strict";
import {
  actual,
  at,
  codes,
  storage,
  locks,
  hold,
  gateDigest,
  binding,
  strict,
} from "../test-fixtures/learning-portfolio/store-harness.mjs";
const m = await actual(),
  key = "charitology.principles-course-v1";
let groups = 0;
const check = async (name, fn) => {
  try {
    await fn();
    groups++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
};
const reject = (fn, ...c) => assert.rejects(async () => fn(), codes(...c));
const open = (s = storage(), l = locks(), extra = {}) =>
  m.createCourseProgressStore({
    storage: s,
    locks: l,
    initialState: m.emptyCourseProgress(),
    ...extra,
  });
const changed = (store, name) => ({
  ...structuredClone(store.snapshot().state),
  name,
});
const prep = (store, name) =>
  store.prepareReplace(changed(store, name), binding(store.snapshot()));
await check("strict TypeScript on actual course and companion modules", () =>
  strict([
    "src/lib/client/course-progress-store.ts",
    "src/lib/client/learning-portfolio-store.ts",
  ]),
);
await check(
  "final key/v1 export isolated and opening never writes",
  async () => {
    const s = storage(),
      l = locks();
    s.values.set("principles-course-v1", "UNPREFIXED");
    s.values.set("charitology.learning-portfolio.v1", "COMPANION");
    const st = await open(s, l);
    assert.equal(m.COURSE_PROGRESS_STORAGE_KEY, key);
    assert.equal(st.snapshot().canWrite, true);
    assert.equal(s.values.has(key), false);
    assert.equal(JSON.parse(await st.backup()).version, 1);
    assert.equal(
      Object.keys(JSON.parse(await st.backup())).includes("revision"),
      false,
    );
    assert.ok(s.touched.every(([, k]) => k === key));
    assert.equal(s.values.get("principles-course-v1"), "UNPREFIXED");
    assert.equal(
      s.values.get("charitology.learning-portfolio.v1"),
      "COMPANION",
    );
  },
);
await check(
  "concurrent actual-key writers allow one save and protect loser memory",
  async () => {
    const s = storage(),
      l = locks();
    s.values.set(key, JSON.stringify(m.emptyCourseProgress()));
    const [a, b] = await Promise.all([open(s, l), open(s, l)]),
      [pa, pb] = await Promise.all([prep(a, "A"), prep(b, "B")]);
    const r = await Promise.allSettled([
      a.commitPrepared(pa),
      b.commitPrepared(pb),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      r.find((x) => x.status === "rejected").reason.code,
      "external_change",
    );
    assert.equal(JSON.parse(s.values.get(key)).name, "A");
    assert.equal(b.snapshot().state.name, "");
    assert.equal(l.maximum(), 1);
  },
);
await check(
  "ordinary replacement cannot change a declared day; explicit day changes only day",
  async () => {
    const s = storage(),
      st = await open(s),
      bad = changed(st, "");
    bad.completedAt = "9999-12-31";
    await reject(
      () => st.prepareReplace(bad, binding(st.snapshot())),
      "completion_day_separate",
    );
    const p = await st.prepareCompletionDay(
      "9999-12-31",
      binding(st.snapshot()),
    );
    await st.commitPrepared(p);
    assert.equal(st.snapshot().state.completedAt, "9999-12-31");
    assert.equal(st.snapshot().state.name, "");
    await reject(
      () => st.prepareCompletionDay("2026-02-30", binding(st.snapshot())),
      "day",
    );
  },
);
await check(
  "source import/restore retains supplied source day and exact strings",
  async () => {
    const st = await open(),
      s = structuredClone(m.emptyCourseProgress());
    s.completedAt = "0000-01-01";
    s.name = "  Fictional  ";
    const p = await st.previewRestore(JSON.stringify(s));
    await st.restore(p);
    assert.equal(st.snapshot().state.completedAt, s.completedAt);
    assert.equal(st.snapshot().state.name, s.name);
  },
);
await check(
  "prepared and recovery objects are issuer-owned and consumed once",
  async () => {
    const s = storage(),
      l = locks(),
      a = await open(s, l),
      b = await open(s, l),
      p = await prep(a, "A");
    await reject(
      () => a.commitPrepared(structuredClone(p)),
      "prepared_required",
    );
    await reject(() => b.commitPrepared(p), "prepared_required");
    await a.commitPrepared(p);
    await reject(() => a.commitPrepared(p), "prepared_required");
    const r = await a.previewClear(m.emptyCourseProgress());
    await reject(() => b.clear(r), "preview_required");
    await a.clear(r);
    await reject(() => a.clear(r), "preview_required");
  },
);
await check(
  "queued form input and binding are captured before awaits",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      input = changed(st, "A"),
      b = binding(st.snapshot()),
      h = await hold(l, key);
    const pending = st.prepareReplace(input, b),
      result = Promise.allSettled([pending]);
    input.name = "B";
    b.expectedGeneration++;
    h.release();
    await h.done;
    assert.equal((await result)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.name, "");
    assert.equal(s.values.has(key), false);
  },
);
await check("no-op writes nothing and preserves prior undo", async () => {
  const s = storage(),
    st = await open(s);
  await st.commitPrepared(await prep(st, "A"));
  const writes = s.touched.filter(([op]) => op === "set").length;
  await st.commitPrepared(await prep(st, "A"));
  assert.equal(s.touched.filter(([op]) => op === "set").length, writes);
  assert.equal(st.snapshot().canUndo, true);
  await st.undo();
  assert.equal(st.snapshot().state.name, "");
});
await check(
  "failed save retains exportable candidate and retry persists it once",
  async () => {
    const s = storage(),
      st = await open(s);
    s.writeFail(true);
    await st.commitPrepared(await prep(st, "A"));
    assert.equal(st.snapshot().unsaved, true);
    assert.equal(st.snapshot().state.name, "A");
    assert.equal(s.values.has(key), false);
    assert.equal(JSON.parse(await st.backup()).name, "A");
    s.writeFail(false);
    await st.retryPersist();
    assert.equal(st.snapshot().unsaved, false);
    assert.equal(JSON.parse(s.values.get(key)).name, "A");
  },
);
await check(
  "retry refuses unseen foreign writes instead of overwriting",
  async () => {
    const s = storage(),
      st = await open(s);
    s.writeFail(true);
    await st.commitPrepared(await prep(st, "A"));
    s.writeFail(false);
    s.values.set(
      key,
      JSON.stringify({ ...m.emptyCourseProgress(), name: "Foreign" }),
    );
    await reject(() => st.retryPersist(), "external_change");
    assert.equal(st.snapshot().state.name, "A");
  },
);
await check(
  "corrupt/unknown saved data never turns into apparent blank progress",
  async () => {
    for (const raw of [
      '{"bad":true}',
      '{"version":1,"version":1}',
      "{corrupt",
    ]) {
      const s = storage();
      s.values.set(key, raw);
      const st = await open(s);
      assert.equal(st.snapshot().state, null);
      assert.equal(st.snapshot().canWrite, false);
      assert.equal(st.rawSavedCopy(), raw);
      assert.equal(s.values.get(key), raw);
      const p = await st.previewClear(m.emptyCourseProgress());
      await st.clear(p);
      assert.equal(st.snapshot().state.completedAt, "");
      assert.equal(s.values.has(key), false);
    }
  },
);
await check(
  "read denial stays unavailable and requires successful reload before recovery",
  async () => {
    const s = storage();
    s.readFail(true);
    const st = await open(s);
    assert.equal(st.snapshot().state, null);
    assert.equal(st.snapshot().observedRaw, undefined);
    assert.equal(st.snapshot().canRecover, false);
    assert.equal(st.rawSavedCopy(), undefined);
    await reject(() => st.previewClear(m.emptyCourseProgress()), "read_error");
    s.readFail(false);
    await st.reload();
    assert.ok(st.snapshot().state);
  },
);
await check(
  "no-event foreign write before preview first blocks; explicit second recovery may bind it",
  async () => {
    const s = storage(),
      st = await open(s);
    s.values.set(
      key,
      JSON.stringify({ ...m.emptyCourseProgress(), name: "Unseen" }),
    );
    await reject(
      () => st.previewClear(m.emptyCourseProgress()),
      "external_change",
    );
    assert.equal(JSON.parse(s.values.get(key)).name, "Unseen");
    const p = await st.previewClear(m.emptyCourseProgress());
    await st.clear(p);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "foreign write after a reviewed preview refuses replacement",
  async () => {
    const s = storage(),
      st = await open(s),
      p = await st.previewClear(m.emptyCourseProgress());
    s.values.set(
      key,
      JSON.stringify({ ...m.emptyCourseProgress(), name: "New" }),
    );
    await reject(() => st.clear(p), "external_change");
    assert.equal(JSON.parse(s.values.get(key)).name, "New");
  },
);
await check(
  "failed clear remembers removal mode and retry removes only course key",
  async () => {
    const s = storage(),
      st = await open(s);
    await st.commitPrepared(await prep(st, "A"));
    s.values.set("unrelated", "PRIVATE");
    const p = await st.previewClear(m.emptyCourseProgress());
    s.removeFail(true);
    await st.clear(p);
    assert.equal(st.snapshot().unsaved, true);
    assert.equal(JSON.parse(s.values.get(key)).name, "A");
    s.removeFail(false);
    await st.retryPersist();
    assert.equal(s.values.has(key), false);
    assert.equal(s.values.get("unrelated"), "PRIVATE");
  },
);
await check(
  "successful reload invalidates undo; failed/corrupt reload keeps valid current memory",
  async () => {
    const s = storage(),
      st = await open(s);
    await st.commitPrepared(await prep(st, "A"));
    await st.reload({ discardUnsaved: true });
    assert.equal(st.snapshot().canUndo, false);
    s.values.set(key, "{bad");
    await st.reload({ discardUnsaved: true });
    assert.equal(st.snapshot().state.name, "A");
    assert.equal(st.snapshot().code, "corrupt");
    assert.equal(st.rawSavedCopy(), "{bad");
  },
);
await check(
  "queued reload options cannot escalate discard authority",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l);
    s.writeFail(true);
    await st.commitPrepared(await prep(st, "A"));
    s.writeFail(false);
    const h = await hold(l, key),
      options = { discardUnsaved: false },
      p = st.reload(options),
      r = Promise.allSettled([p]);
    options.discardUnsaved = true;
    h.release();
    await h.done;
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.name, "A");
  },
);
await check(
  "no locks allow reading/export only; missing hashing allows raw recovery only",
  async () => {
    const s = storage();
    s.values.set(
      key,
      JSON.stringify({ ...m.emptyCourseProgress(), name: "Readable" }),
    );
    const st = await open(s, null);
    assert.equal(st.snapshot().state.name, "Readable");
    assert.equal(st.snapshot().canWrite, false);
    await reject(() => prep(st, "X"), "unsupported");
    const raw = await open(s, locks(), { cryptoAvailable: false });
    assert.equal(raw.snapshot().state, null);
    assert.equal(raw.rawSavedCopy(), s.values.get(key));
  },
);
await check(
  "capture read labels absence, persisted and failed-memory sources honestly",
  async () => {
    const s = storage(),
      st = await open(s);
    const absent = await st.previewCaptureRead();
    assert.equal(absent.persistence, "unsaved-memory");
    assert.equal(absent.observedRawHash, null);
    await st.commitPrepared(await prep(st, "A"));
    const saved = await st.previewCaptureRead();
    assert.equal(saved.persistence, "saved");
    assert.match(saved.observedRawHash, /^[a-f0-9]{64}$/);
    s.writeFail(true);
    await st.commitPrepared(await prep(st, "B"));
    const failed = await st.previewCaptureRead();
    assert.equal(failed.persistence, "unsaved-memory");
    assert.equal(failed.input.name, "B");
  },
);
await check(
  "course lease is one-use, issuer-owned, expires and notices source changes",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      other = await open(storage(), locks()),
      p = await st.previewCaptureRead();
    let lease;
    await reject(
      () => m.withCourseCaptureRead(other, p, async () => {}),
      "capture_read_required",
    );
    await m.withCourseCaptureRead(st, p, async (x) => {
      lease = x;
      x.assertCurrent();
    });
    assert.throws(() => lease.assertCurrent(), codes("lease_expired"));
    await reject(
      () => m.withCourseCaptureRead(st, p, async () => {}),
      "capture_read_required",
    );
    const q = await st.previewCaptureRead();
    s.values.set(
      key,
      JSON.stringify({ ...m.emptyCourseProgress(), name: "Foreign" }),
    );
    await reject(
      () => m.withCourseCaptureRead(st, q, async (x) => x.assertCurrent()),
      "external_change",
    );
  },
);
await check(
  "maximum known writer shape and strict byte/UTF8/unknown-field admission",
  async () => {
    const st = await open(),
      max = {
        version: 1,
        name: "\0".repeat(120),
        capstone: "\0".repeat(12000),
        completedAt: "9999-12-31",
        lessons: Array.from({ length: 10 }, () => ({
          read: false,
          practice: "\0".repeat(5000),
          answers: [-1, -1],
        })),
      };
    const raw = m.makeCourseProgressExport(max);
    assert.ok(
      Buffer.byteLength(raw) > 200000 && Buffer.byteLength(raw) <= 400000,
    );
    await st.restore(await st.previewRestore(raw));
    assert.deepEqual(JSON.parse(await st.backup()), max);
    await assert.rejects(
      () => st.previewRestore(new Uint8Array([0xff])),
      () => true,
    );
    await assert.rejects(
      () => st.previewRestore(" ".repeat(400001)),
      () => true,
    );
    await assert.rejects(
      () => st.previewRestore(JSON.stringify({ ...max, extra: "unsupported" })),
      () => true,
    );
  },
);

await check(
  "post-await form mutation cannot enter a validated candidate",
  async () => {
    const s = storage(),
      g = gateDigest(),
      st = await open(s, locks(), { digest: g.digest }),
      input = changed(st, "A"),
      gate = g.pause();
    const pending = st.prepareReplace(input, binding(st.snapshot())),
      r = Promise.allSettled([pending]);
    await gate.started;
    input.name = "Changed during digest";
    gate.release();
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.name, "");
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "recovery bytes are owned before asynchronous hash and changed input cannot replace",
  async () => {
    const s = storage(),
      g = gateDigest(),
      st = await open(s, locks(), { digest: g.digest }),
      raw = new TextEncoder().encode(
        m.makeCourseProgressExport({
          ...m.emptyCourseProgress(),
          name: "File",
        }),
      ),
      gate = g.pause();
    const pending = st.previewRestore(raw),
      r = Promise.allSettled([pending]);
    await gate.started;
    raw[0] = 32;
    gate.release();
    assert.equal((await r)[0].status, "rejected");
    assert.equal(st.snapshot().state.name, "");
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "reload discard changes during validation cannot discard valid unsaved memory",
  async () => {
    const s = storage(),
      g = gateDigest();
    s.values.set(
      key,
      JSON.stringify({ ...m.emptyCourseProgress(), name: "Saved A" }),
    );
    const st = await open(s, locks(), { digest: g.digest });
    s.writeFail(true);
    await st.commitPrepared(await prep(st, "Unsaved B"));
    s.writeFail(false);
    const settings = { discardUnsaved: true },
      gate = g.pause(),
      pending = st.reload(settings),
      r = Promise.allSettled([pending]);
    await gate.started;
    settings.discardUnsaved = false;
    gate.release();
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.name, "Unsaved B");
    assert.equal(st.snapshot().unsaved, true);
    await reject(
      () => st.reload({ discardUnsaved: true, other: true }),
      "reload_options",
    );
  },
);
await check(
  "accessor/decorated candidates are refused without invoking getters",
  async () => {
    const st = await open();
    let called = 0;
    const input = changed(st, "A");
    Object.defineProperty(input, "name", {
      enumerable: true,
      get() {
        called++;
        return "B";
      },
    });
    await assert.rejects(
      async () => st.prepareReplace(input, binding(st.snapshot())),
      () => true,
    );
    assert.equal(called, 0);
    assert.equal(st.snapshot().state.name, "");
  },
);

await check(
  "already-corrupt recovery never silently absorbs unseen B and retains original A plus current bytes",
  async () => {
    const s = storage(),
      original = "{original corrupt A";
    s.values.set(key, original);
    const st = await open(s),
      foreignB = JSON.stringify({
        ...m.emptyCourseProgress(),
        name: "Foreign B",
      });
    s.values.set(key, foreignB);
    await reject(
      () => st.previewClear(m.emptyCourseProgress()),
      "external_change",
    );
    assert.equal(st.snapshot().state, null);
    assert.equal(st.rawSavedCopy(), original);
    assert.equal(st.snapshot().observedRaw, foreignB);
    assert.equal(s.values.get(key), foreignB);
    const p = await st.previewClear(m.emptyCourseProgress()),
      foreignC = JSON.stringify({
        ...m.emptyCourseProgress(),
        name: "Foreign C",
      });
    s.values.set(key, foreignC);
    await reject(() => st.clear(p), "external_change");
    assert.equal(st.rawSavedCopy(), original);
    assert.equal(st.snapshot().observedRaw, foreignC);
    assert.equal(s.values.get(key), foreignC);
    const fresh = await st.previewClear(m.emptyCourseProgress());
    await st.clear(fresh);
    assert.equal(s.values.has(key), false);
    assert.equal(st.rawSavedCopy(), original);
  },
);
console.log(
  "Course progress store: " +
    groups +
    " actual-key/lease/strict groups passed. Synthetic data only.",
);
