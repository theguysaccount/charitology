// Actual private companion/coordinator. Synthetic criteria/learners only, never OS or provider.
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
  makeId,
  strict,
} from "../test-fixtures/learning-portfolio/store-harness.mjs";
import {
  known,
  progress,
  criteria,
  source,
  exactBoundaryState,
} from "../test-fixtures/learning-portfolio/factory.mjs";
const m = await actual(),
  key = "charitology.learning-portfolio.v1",
  courseKey = "charitology.principles-course-v1",
  definitions = known(m);
let groups = 0,
  seq = 0;
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
const blank = () =>
  m.blankLearningPortfolio("synthetic-portfolio-" + ++seq, at);
const open = (s = storage(), l = locks(), extra = {}) =>
  m.createLearningPortfolioStore({
    storage: s,
    locks: l,
    initialState: blank(),
    knownCriteria: definitions,
    ...extra,
  });
const course = (s, l, extra = {}) =>
  m.createCourseProgressStore({
    storage: s,
    locks: l,
    initialState: m.emptyCourseProgress(),
    ...extra,
  });
const intent = (target = null) => ({
  criteriaId: definitions[0].id,
  criteriaHash: definitions[0].hash,
  target,
});
const opts = (extra = {}) => ({
  criteriaAffirmed: true,
  reason: null,
  at,
  makeId,
  assertUiCurrent: () => undefined,
  ...extra,
});
const bytes = () => m.makeCourseProgressExport(progress(m));
async function draft(st, tab = "criteria") {
  const s = st.snapshot();
  return m.prepareLearningCommand(
    s.state,
    { kind: "draft.replace", draft: { ...s.state.draft, tab } },
    {
      expectedStateHash: s.hash,
      expectedRevision: s.state.revision,
      at,
      makeId,
      knownCriteria: definitions,
    },
  );
}
async function file(st, options = {}) {
  const p = await st.previewFileCapture(
    bytes(),
    "fictional-course.json",
    intent(),
  );
  return st.commitFileCapture(p, opts(options));
}
await check("strict TypeScript on real model and two adapters", () =>
  strict([
    "src/lib/client/course-progress-store.ts",
    "src/lib/client/learning-portfolio-store.ts",
  ]),
);
await check(
  "final companion key opens without save and all other keys are untouched",
  async () => {
    const s = storage(),
      l = locks();
    s.values.set(courseKey, "COURSE");
    s.values.set("charitology.study-register.v1", "PRIVATE");
    const st = await open(s, l);
    assert.equal(m.LEARNING_PORTFOLIO_STORAGE_KEY, key);
    assert.equal(s.values.has(key), false);
    assert.ok(s.touched.every(([, k]) => k === key));
    assert.equal(s.values.get(courseKey), "COURSE");
    assert.equal(
      (await m.parseLearningBackup(await st.backup(at), definitions)).records
        .length,
      0,
    );
  },
);
await check(
  "generic draft commit performs exact actual-model semantics",
  async () => {
    const s = storage(),
      st = await open(s);
    await st.commitPrepared(await draft(st));
    assert.equal(st.snapshot().state.revision, 1);
    assert.equal(st.snapshot().state.draft.tab, "criteria");
    const before = s.values.get(key),
      p = await draft(st, "criteria");
    assert.equal(p.noOp, true);
    await st.commitPrepared(p);
    assert.equal(s.values.get(key), before);
  },
);
await check(
  "forged command hash, unchanged-draft metadata and backdated draft are rejected",
  async () => {
    const st = await open();
    const valid = structuredClone(await draft(st));
    valid.commandHash = "a".repeat(64);
    await reject(() => st.commitPrepared(valid), "draft_semantics");
    const same = structuredClone(
      await draft(st, st.snapshot().state.draft.tab),
    );
    same.noOp = false;
    same.candidate.revision++;
    same.candidate.updatedAt = "2026-10-27T12:00:01.000Z";
    same.candidateHash = await m.learningPortfolioStateHash(same.candidate);
    await reject(() => st.commitPrepared(same), "draft_semantics");
    const future = await m.prepareLearningCommand(
      st.snapshot().state,
      {
        kind: "draft.replace",
        draft: { ...st.snapshot().state.draft, tab: "exports" },
      },
      {
        expectedStateHash: st.snapshot().hash,
        expectedRevision: 0,
        at: "2026-10-27T12:00:05.000Z",
        makeId,
        knownCriteria: definitions,
      },
    );
    await st.commitPrepared(future);
    // Prepare through a valid future instant, then forge an older otherwise well-shaped state.
    const input = structuredClone(future);
    input.expectedStateHash = st.snapshot().hash;
    input.expectedRevision = 1;
    input.candidate.revision = 2;
    input.candidate.updatedAt = at;
    input.candidate.draft.tab = "criteria";
    input.candidateHash = await m.learningPortfolioStateHash(input.candidate);
    await assert.rejects(
      async () => st.commitPrepared(input),
      (e) => ["chronology", "state_time"].includes(e.code),
    );
    assert.equal(st.snapshot().state.updatedAt, "2026-10-27T12:00:05.000Z");
  },
);
await check(
  "a forged draft discriminator cannot append records or criteria",
  async () => {
    const st = await open(),
      s = st.snapshot(),
      p = structuredClone(
        await m.prepareLearningCommand(
          s.state,
          {
            kind: "record.capture",
            criteriaId: definitions[0].id,
            criteriaHash: definitions[0].hash,
            source: source(progress(m)),
            criteriaAffirmed: true,
          },
          {
            expectedStateHash: s.hash,
            expectedRevision: 0,
            at,
            makeId,
            knownCriteria: definitions,
          },
        ),
      );
    p.commandKind = "draft.replace";
    await reject(() => st.commitPrepared(p), "protected_records");
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check("two actual-key draft writers preserve one revision", async () => {
  const s = storage(),
    l = locks(),
    initial = blank();
  s.values.set(key, m.canonicalLearningJson(initial));
  const [a, b] = await Promise.all([
      open(s, l, { initialState: initial }),
      open(s, l, { initialState: initial }),
    ]),
    [pa, pb] = await Promise.all([draft(a, "criteria"), draft(b, "exports")]);
  const r = await Promise.allSettled([
    a.commitPrepared(pa),
    b.commitPrepared(pb),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    r.find((x) => x.status === "rejected").reason.code,
    "external_change",
  );
});
await check(
  "queued mutable prepared envelope cannot swap A for B",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      a = structuredClone(await draft(st, "criteria")),
      b = structuredClone(await draft(st, "exports")),
      h = await hold(l, key);
    const p = st.commitPrepared(a),
      r = Promise.allSettled([p]);
    Object.assign(a, b);
    h.release();
    await h.done;
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "file capture owns exact bytes/provenance and never reads course storage",
  async () => {
    const s = storage(),
      st = await open(s);
    await file(st);
    assert.equal(st.snapshot().state.records.length, 1);
    const record = st.snapshot().state.records[0];
    assert.equal(record.origin.kind, "course-file");
    assert.equal(record.origin.persistence, "selected-file");
    assert.equal(record.origin.historicalCriteria, "unknown");
    assert.equal(record.evaluation.complete, true);
    assert.ok(s.touched.every(([, k]) => k === key));
    assert.ok(Object.isFrozen(record.input.lessons));
  },
);
await check(
  "file preview is private one-use and detects later caller-byte mutation",
  async () => {
    const st = await open(),
      raw = new TextEncoder().encode(bytes()),
      p = await st.previewFileCapture(raw, "fictional.json", intent()),
      other = await open();
    await reject(
      () => st.commitFileCapture(structuredClone(p), opts()),
      "capture_required",
    );
    await reject(() => other.commitFileCapture(p, opts()), "capture_required");
    raw[0] = 32;
    await reject(() => st.commitFileCapture(p, opts()), "input_changed");
    await reject(() => st.commitFileCapture(p, opts()), "capture_required");
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check(
  "live capture uses course then companion locks, writes companion only and labels absence",
  async () => {
    const s = storage(),
      l = locks(),
      cs = await course(s, l),
      st = await open(s, l);
    const p = await st.previewCourseCapture(cs, intent());
    assert.equal(p.source.origin.persistence, "unsaved-memory");
    assert.equal(p.source.origin.rawHash, null);
    const n = l.calls.length;
    await st.commitCourseCapture(p, opts());
    assert.deepEqual(l.calls.slice(n), [courseKey, key]);
    assert.equal(l.maximum(), 2);
    assert.equal(s.values.has(courseKey), false);
    assert.equal(st.snapshot().state.records.length, 1);
  },
);
await check(
  "live saved and failed-memory captures retain honest source bindings",
  async () => {
    const s = storage(),
      l = locks();
    s.values.set(courseKey, bytes());
    const cs = await course(s, l),
      st = await open(s, l);
    const a = await st.previewCourseCapture(cs, intent());
    assert.equal(a.source.origin.persistence, "saved");
    assert.match(a.source.origin.rawHash, /^[a-f0-9]{64}$/);
    s.writeFail(true);
    const updated = {
      ...structuredClone(cs.snapshot().state),
      name: "Unsaved newer source",
    };
    await cs.commitPrepared(
      await cs.prepareReplace(updated, binding(cs.snapshot())),
    );
    s.writeFail(false);
    const b = await st.previewCourseCapture(cs, intent());
    assert.equal(b.source.origin.persistence, "unsaved-memory");
    assert.equal(b.source.origin.rawHash, null);
    assert.equal(b.source.input.name, updated.name);
    await st.commitCourseCapture(b, opts());
    assert.equal(st.snapshot().state.records[0].input.name, updated.name);
  },
);
await check(
  "changed course generation after preview cannot append stale source",
  async () => {
    const s = storage(),
      l = locks(),
      cs = await course(s, l),
      st = await open(s, l),
      p = await st.previewCourseCapture(cs, intent());
    await cs.commitPrepared(
      await cs.prepareReplace(
        { ...structuredClone(cs.snapshot().state), name: "New source" },
        binding(cs.snapshot()),
      ),
    );
    await reject(() => st.commitCourseCapture(p, opts()), "stale_memory");
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check(
  "final synchronous UI guard can stop append and changed source bytes are rechecked afterward",
  async () => {
    const s = storage(),
      l = locks(),
      cs = await course(s, l),
      st = await open(s, l),
      p = await st.previewCourseCapture(cs, intent());
    await assert.rejects(
      async () =>
        st.commitCourseCapture(
          p,
          opts({
            assertUiCurrent() {
              throw Error("synthetic newer UI");
            },
          }),
        ),
      /synthetic newer UI/,
    );
    assert.equal(st.snapshot().state.records.length, 0);
    const q = await st.previewCourseCapture(cs, intent());
    await reject(
      () =>
        st.commitCourseCapture(
          q,
          opts({
            assertUiCurrent() {
              s.values.set(
                courseKey,
                JSON.stringify({
                  ...m.emptyCourseProgress(),
                  name: "Foreign final write",
                }),
              );
              return undefined;
            },
          }),
        ),
      "external_change",
    );
    assert.equal(st.snapshot().state.records.length, 0);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "async/nonundefined controller guards are refused without append",
  async () => {
    const st = await open();
    for (const assertUiCurrent of [async () => undefined, () => false]) {
      const p = await st.previewFileCapture(
        bytes(),
        "fictional.json",
        intent(),
      );
      await reject(
        () => st.commitFileCapture(p, opts({ assertUiCurrent })),
        "async_ui_guard",
      );
      assert.equal(st.snapshot().state.records.length, 0);
    }
  },
);
await check(
  "queued options cannot change affirmation, reason, clock or callback",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      p = await st.previewFileCapture(bytes(), "fictional.json", intent()),
      o = opts(),
      h = await hold(l, key);
    const pending = st.commitFileCapture(p, o),
      r = Promise.allSettled([pending]);
    o.assertUiCurrent = () => undefined;
    o.at = "2026-10-27T12:00:01.000Z";
    h.release();
    await h.done;
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check(
  "stale companion disk or memory rejects an earlier capture",
  async () => {
    const s = storage(),
      st = await open(s),
      p = await st.previewFileCapture(bytes(), "fictional.json", intent());
    await st.commitPrepared(await draft(st));
    await reject(() => st.commitFileCapture(p, opts()), "stale_memory");
    const q = await st.previewFileCapture(bytes(), "fictional.json", intent());
    const before = s.values.get(key);
    s.values.set(key, before + " ");
    await reject(() => st.commitFileCapture(q, opts()), "external_change");
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check(
  "quota-failed append is one valid unsaved record and retry never reappends",
  async () => {
    const s = storage(),
      st = await open(s),
      p = await st.previewFileCapture(bytes(), "fictional.json", intent());
    s.writeFail(true);
    await st.commitFileCapture(p, opts());
    const before = st.snapshot();
    assert.equal(before.unsaved, true);
    assert.equal(before.state.records.length, 1);
    assert.equal(s.values.has(key), false);
    await reject(() => st.commitFileCapture(p, opts()), "capture_required");
    s.writeFail(false);
    await st.retryPersist();
    assert.equal(st.snapshot().state.records.length, 1);
    assert.equal(st.snapshot().state.records[0].id, before.state.records[0].id);
    assert.equal(st.snapshot().state.revision, before.state.revision);
  },
);
await check(
  "amendment binds exact current head and same criteria, preserving prior record",
  async () => {
    const st = await open();
    await file(st);
    const a = st.snapshot().state.records[0],
      old = JSON.stringify(a),
      p = await st.previewFileCapture(
        bytes(),
        "fictional-amendment.json",
        intent({ recordId: a.id, recordHash: a.hash }),
      );
    await st.commitFileCapture(
      p,
      opts({ reason: "Explicit synthetic amendment" }),
    );
    const records = st.snapshot().state.records;
    assert.equal(records.length, 2);
    assert.equal(JSON.stringify(records[0]), old);
    assert.equal(records[1].previousId, a.id);
    assert.equal(records[1].previousHash, a.hash);
    await reject(
      () =>
        st.previewFileCapture(
          bytes(),
          "fictional.json",
          intent({ recordId: a.id, recordHash: a.hash }),
        ),
      "stale_record",
    );
  },
);
await check(
  "corrupt/read-denied keys stay unavailable; explicit owned recovery replaces only companion",
  async () => {
    const s = storage();
    s.values.set(key, "{bad");
    s.values.set(courseKey, "PROTECTED");
    const st = await open(s);
    assert.equal(st.snapshot().state, null);
    assert.equal(st.rawSavedCopy(), "{bad");
    const p = await st.previewClear(blank());
    await st.clear(p);
    assert.equal(s.values.has(key), false);
    assert.equal(s.values.get(courseKey), "PROTECTED");
    const denied = storage();
    denied.readFail(true);
    const d = await open(denied);
    assert.equal(d.snapshot().canRecover, false);
    assert.equal(d.snapshot().observedRaw, undefined);
    await reject(() => d.previewClear(blank()), "read_error");
  },
);
await check(
  "no-event pre-preview foreign write blocks before explicit replacement; post-preview races fail",
  async () => {
    const s = storage(),
      st = await open(s);
    s.values.set(key, m.canonicalLearningJson(blank()));
    await reject(() => st.previewClear(blank()), "external_change");
    const p = await st.previewClear(blank());
    s.values.set(key, m.canonicalLearningJson(blank()));
    await reject(() => st.clear(p), "external_change");
  },
);
await check(
  "failed clear, undo and reload retain guarded state and invalidate old intent",
  async () => {
    const s = storage(),
      st = await open(s);
    await file(st);
    const p = await st.previewClear(blank());
    s.removeFail(true);
    await st.clear(p);
    assert.equal(st.snapshot().unsaved, true);
    assert.equal(st.snapshot().state.records.length, 0);
    s.removeFail(false);
    await st.retryPersist();
    assert.equal(s.values.has(key), false);
    await st.undo();
    assert.equal(st.snapshot().state.records.length, 1);
    await st.reload({ discardUnsaved: true });
    assert.equal(st.snapshot().canUndo, false);
  },
);
await check(
  "unsupported capabilities preserve readable export without writes or capture authority",
  async () => {
    const s = storage();
    const st = await open(s, null);
    assert.ok(st.snapshot().state);
    assert.equal(st.snapshot().canWrite, false);
    await reject(
      () => st.previewFileCapture(bytes(), "fictional.json", intent()),
      "unsupported",
    );
    const raw = await open(s, locks(), { cryptoAvailable: false });
    assert.equal(raw.snapshot().state, null);
    assert.equal(raw.snapshot().canRecover, false);
  },
);
await check(
  "actual exact2MiB state loads/exports/restores; one-byte oversize leaves bytes and memory unchanged",
  async () => {
    const boundary = await exactBoundaryState(m),
      raw = await m.makeLearningBackup(boundary, at, definitions);
    assert.equal(Buffer.byteLength(raw), 2097152);
    const s = storage();
    s.values.set(key, m.canonicalLearningJson(boundary));
    const st = await open(s);
    assert.equal(Buffer.byteLength(await st.backup(at)), 2097152);
    const target = await open();
    await target.restore(await target.previewRestore(raw));
    assert.deepEqual(target.snapshot().state, boundary);
    const bad = structuredClone(boundary);
    bad.draft.form.course.capstone += "x";
    bad.revision++;
    const forged = {
      format: "charitology-learning-mutation",
      version: 1,
      commandKind: "draft.replace",
      expectedStateHash: st.snapshot().hash,
      expectedRevision: boundary.revision,
      commandHash: "a".repeat(64),
      candidateHash: await m.learningPortfolioStateHash(bad),
      candidate: bad,
      noOp: false,
      summary: { message: "fictional", recordId: null },
    };
    const before = s.values.get(key),
      beforeHash = st.snapshot().hash;
    await assert.rejects(
      async () => st.commitPrepared(forged),
      () => true,
    );
    assert.equal(s.values.get(key), before);
    assert.equal(st.snapshot().hash, beforeHash);
    await assert.rejects(
      () => target.previewRestore(raw + "x"),
      () => true,
    );
  },
);

await check(
  "post-await mutable no-op envelope cannot change candidate or command metadata",
  async () => {
    const s = storage(),
      g = gateDigest(),
      st = await open(s, locks(), { digest: g.digest }),
      p = structuredClone(await draft(st, st.snapshot().state.draft.tab)),
      gate = g.pause();
    assert.equal(p.noOp, true);
    const pending = st.commitPrepared(p),
      r = Promise.allSettled([pending]);
    await gate.started;
    p.commandHash = "b".repeat(64);
    gate.release();
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.revision, 0);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "queued live capture cannot overwrite a newer companion draft and has no reverse lock edge",
  async () => {
    const s = storage(),
      l = locks(),
      cs = await course(s, l),
      st = await open(s, l),
      p = await st.previewCourseCapture(cs, intent()),
      h = await hold(l, courseKey);
    const pending = st.commitCourseCapture(p, opts()),
      r = Promise.allSettled([pending]);
    await st.commitPrepared(await draft(st, "exports"));
    h.release();
    await h.done;
    assert.equal((await r)[0].reason.code, "stale_memory");
    assert.equal(st.snapshot().state.records.length, 0);
    assert.equal(st.snapshot().state.draft.tab, "exports");
    assert.equal(s.values.has(courseKey), false);
  },
);
await check(
  "intent mutation while preview hashes source is refused before authority is issued",
  async () => {
    const s = storage(),
      g = gateDigest(),
      st = await open(s, locks(), { digest: g.digest }),
      i = intent(),
      gate = g.pause(),
      pending = st.previewFileCapture(bytes(), "fictional.json", i),
      r = Promise.allSettled([pending]);
    await gate.started;
    i.criteriaHash = definitions[1].hash;
    gate.release();
    assert.equal((await r)[0].reason.code, "input_changed");
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check(
  "a final UI callback cannot change companion bytes and then append anyway",
  async () => {
    const s = storage(),
      st = await open(s),
      p = await st.previewFileCapture(bytes(), "fictional.json", intent()),
      foreign = m.canonicalLearningJson(blank());
    await reject(
      () =>
        st.commitFileCapture(
          p,
          opts({
            assertUiCurrent() {
              s.values.set(key, foreign);
              return undefined;
            },
          }),
        ),
      "external_change",
    );
    assert.equal(s.values.get(key), foreign);
    assert.equal(st.snapshot().state.records.length, 0);
  },
);
await check(
  "initial/clear shapes must be exact blank states, not metadata-only alternatives",
  async () => {
    const s = storage(),
      b = structuredClone(blank());
    b.updatedAt = "2026-10-27T12:00:01.000Z";
    await reject(() => open(s, locks(), { initialState: b }), "blank_required");
    const st = await open(s);
    await reject(() => st.previewClear(b), "blank_required");
  },
);
await check(
  "strict source byte/duplicate/depth admission precedes any new record",
  async () => {
    const st = await open();
    for (const raw of [
      '{"version":1,"version":1}',
      new Uint8Array([0xff]),
      "[".repeat(33) + "0" + "]".repeat(33),
    ])
      await assert.rejects(
        () => st.previewFileCapture(raw, "fictional.json", intent()),
        () => true,
      );
    let touched = 0;
    class Oversized extends Uint8Array {
      get length() {
        touched++;
        return 0;
      }
      slice() {
        touched++;
        throw Error("must not call");
      }
    }
    const tooLarge = new Oversized(400001);
    await reject(
      () => st.previewFileCapture(tooLarge, "fictional.json", intent()),
      "input_limit",
    );
    assert.equal(touched, 0);
    assert.equal(st.snapshot().state.records.length, 0);
  },
);

await check(
  "initially corrupt companion A cannot hide a newly seen B or later C during replacement",
  async () => {
    const s = storage(),
      original = "{corrupt portfolio A";
    s.values.set(key, original);
    const st = await open(s),
      foreignB = m.canonicalLearningJson(blank());
    s.values.set(key, foreignB);
    await reject(() => st.previewClear(blank()), "external_change");
    assert.equal(st.snapshot().state, null);
    assert.equal(st.rawSavedCopy(), original);
    assert.equal(st.snapshot().observedRaw, foreignB);
    assert.equal(s.values.get(key), foreignB);
    const p = await st.previewClear(blank()),
      foreignC = m.canonicalLearningJson(blank());
    s.values.set(key, foreignC);
    await reject(() => st.clear(p), "external_change");
    assert.equal(st.rawSavedCopy(), original);
    assert.equal(st.snapshot().observedRaw, foreignC);
    assert.equal(s.values.get(key), foreignC);
    const fresh = await st.previewClear(blank());
    await st.clear(fresh);
    assert.equal(s.values.has(key), false);
    assert.equal(st.rawSavedCopy(), original);
  },
);
console.log(
  "Learning portfolio store: " +
    groups +
    " actual-key/coordinator/strict groups passed. Synthetic data only.",
);
