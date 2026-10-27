// D1 real facade/cell checks: fixed legacy keys, synthetic records, no browser/provider.
import assert from "node:assert/strict";
import {
  actual,
  at,
  storage,
  locks,
  hold,
  gateDigest,
  strict,
  codes,
  full,
} from "../test-fixtures/donor-recovery/engine-harness.mjs";
const m = await actual();
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
async function open(key = "wrapped", s = storage(), l = locks(), extra = {}) {
  const view = m.createD1ViewTracker(),
    session = await m.openD1ToolSession(key, {
      view,
      storage: s,
      locks: l,
      ...extra,
    });
  return { s, l, view, session };
}
async function save(x, value) {
  x.view.changedForm();
  const c = x.session.captureSave(value),
    r = await x.session.saveCaptured(c);
  if (r.outcome === "saved" || r.outcome === "no-op")
    x.view.markFormSaved(r.formGeneration);
  return r;
}
const wrapped = (year) => ({ year, hide: false });
await check("strict actual engine, cell and public control modules", () =>
  strict([
    "src/lib/client/donor-recovery.ts",
    "src/lib/client/donor-recovery-cell.ts",
    "src/lib/client/donor-recovery-controls.ts",
  ]),
);
await check(
  "all eleven standalone keys load fixed defaults without writing or discovering keys",
  async () => {
    const keys = m.D1_KEYS.filter((k) => !k.startsWith("grant-"));
    for (const key of keys) {
      const x = await open(key);
      assert.equal(x.session.snapshot().hasState, true, key);
      assert.equal(x.session.snapshot().persistence, "absent");
      assert.equal(x.s.values.size, 0);
      assert.ok(x.s.touched.every(([, k]) => k === full(key)));
      assert.ok(x.l.calls.every((k) => k === full(key)));
    }
    assert.equal(keys.length, 11);
  },
);
await check(
  "absent fallback equal save really persists; only persisted equality is no-op",
  async () => {
    const x = await open();
    assert.equal((await save(x, wrapped(""))).outcome, "saved");
    const n = x.s.touched.filter(([op]) => op === "set").length;
    assert.equal((await save(x, wrapped(""))).outcome, "no-op");
    assert.equal(x.s.touched.filter(([op]) => op === "set").length, n);
  },
);
await check(
  "cooperating final-key writers serialize and one refuses foreign baseline",
  async () => {
    const s = storage(),
      l = locks();
    s.values.set(full("wrapped"), JSON.stringify(wrapped("2024")));
    const [a, b] = await Promise.all([
      open("wrapped", s, l),
      open("wrapped", s, l),
    ]);
    const r = await Promise.allSettled([
      save(a, wrapped("2025")),
      save(b, wrapped("2026")),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      r.find((x) => x.status === "rejected").reason.code,
      "external_change",
    );
    assert.equal(JSON.parse(s.values.get(full("wrapped"))).year, "2025");
    assert.equal(b.session.snapshot().value.year, "2024");
  },
);
await check(
  "corrupt A and unseen B/C are separately protected; every new baseline first warns",
  async () => {
    const s = storage();
    s.values.set(full("wrapped"), "A{corrupt");
    const x = await open("wrapped", s);
    assert.equal(x.session.snapshot().hasState, false);
    s.values.set(full("wrapped"), JSON.stringify(wrapped("B")));
    await reject(() => x.session.previewRemove(), "external_change");
    assert.equal(x.session.protectedRawCopy(), "A{corrupt");
    assert.equal(x.session.observedRawCopy(), JSON.stringify(wrapped("B")));
    const p = await x.session.previewRemove();
    s.values.set(full("wrapped"), JSON.stringify(wrapped("C")));
    await reject(() => x.session.remove(p), "external_change");
    assert.equal(x.session.protectedRawCopy(), "A{corrupt");
    assert.equal(x.session.observedRawCopy(), JSON.stringify(wrapped("C")));
    const q = await x.session.previewRemove();
    await x.session.remove(q);
    assert.equal(s.values.has(full("wrapped")), false);
  },
);
await check(
  "unseen foreign write before normal restore preview warns without adopting into memory",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    x.s.values.set(full("wrapped"), JSON.stringify(wrapped("B")));
    const raw = m.d1IndividualBackup("wrapped", wrapped("C"), at);
    await reject(() => x.session.previewRestore(raw), "external_change");
    assert.equal(x.session.snapshot().value.year, "A");
    const p = await x.session.previewRestore(raw);
    await x.session.restore(p);
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "C");
  },
);
await check(
  "read denial is unavailable, never absent/corrupt fallback; later reload works",
  async () => {
    const s = storage();
    s.readFail(true);
    const x = await open("wrapped", s);
    assert.equal(x.session.snapshot().observedRaw, undefined);
    assert.equal(x.session.snapshot().hasState, false);
    assert.equal(x.session.snapshot().canRecover, false);
    await reject(() => x.session.previewRemove(), "read_error");
    s.readFail(false);
    await x.session.reload();
    assert.equal(x.session.snapshot().persistence, "absent");
  },
);
await check(
  "no locks or a failing lock manager fail closed but preserve validated reads",
  async () => {
    const s = storage();
    s.values.set(full("wrapped"), JSON.stringify(wrapped("A")));
    for (const l of [
      null,
      { request: () => Promise.reject(Error("denied")) },
    ]) {
      const x = await open("wrapped", s, l);
      assert.equal(x.session.snapshot().hasState, true);
      assert.equal(x.session.snapshot().canWrite, false);
      await reject(() => save(x, wrapped("B")), "unsupported");
    }
    assert.equal(JSON.parse(s.values.get(full("wrapped"))).year, "A");
  },
);
await check(
  "save capture is detached, issuer-owned, one-use and copied plain authority refused",
  async () => {
    const x = await open(),
      other = await open();
    x.view.changedForm();
    const value = wrapped("A"),
      c = x.session.captureSave(value);
    value.year = "B";
    await reject(() => other.session.saveCaptured(c), "foreign_owner");
    await reject(
      () => x.session.saveCaptured(structuredClone(c)),
      "foreign_owner",
    );
    await x.session.saveCaptured(c);
    assert.equal(x.session.snapshot().value.year, "A");
    await reject(() => x.session.saveCaptured(c), "foreign_owner");
  },
);
await check(
  "final synchronous form guard refuses input changed during hash await",
  async () => {
    const g = gateDigest(),
      x = await open("wrapped", storage(), locks(), { digest: g.digest }),
      p = g.pause();
    x.view.changedForm();
    const pending = x.session.saveCaptured(x.session.captureSave(wrapped("A")));
    await p.started;
    x.view.changedForm();
    p.release();
    const r = await pending;
    assert.equal(r.outcome, "superseded");
    assert.equal(x.s.values.has(full("wrapped")), false);
  },
);
await check(
  "bounded save queue supersedes unstarted full candidate and keeps latest input",
  async () => {
    const x = await open(),
      held = await hold(x.l, full("wrapped"));
    x.view.changedForm();
    const a = x.session.saveCaptured(x.session.captureSave(wrapped("A")));
    await Promise.resolve();
    x.view.changedForm();
    const b = x.session.saveCaptured(x.session.captureSave(wrapped("B")));
    x.view.changedForm();
    const c = x.session.saveCaptured(x.session.captureSave(wrapped("C")));
    held.release();
    await held.done;
    const r = await Promise.all([a, b, c]);
    assert.equal(r[1].outcome, "superseded");
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "C");
  },
);
await check(
  "failed set retains exact valid candidate; new capture blocked; retry persists without replay",
  async () => {
    const x = await open();
    x.s.writeFail(true);
    const r = await save(x, wrapped("A"));
    assert.equal(r.outcome, "unsaved");
    assert.equal(x.session.snapshot().value.year, "A");
    assert.equal(x.session.snapshot().canRetryPersist, true);
    assert.equal(JSON.parse(await x.session.backup()).value.year, "A");
    await reject(
      () => x.session.captureSave(wrapped("B")),
      "pending_operation",
    );
    x.s.writeFail(false);
    await x.session.retryPersist();
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "A");
    assert.equal(x.session.snapshot().unsaved, false);
  },
);
await check(
  "failed removal remains a removal intent, exportable fallback, exact retry removes only key",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    x.s.values.set("charitology.unrelated", "KEEP");
    x.s.removeFail(true);
    const p = await x.session.previewRemove();
    const r = await x.session.remove(p);
    assert.equal(r.pendingOperation, "remove");
    assert.equal(r.unsaved, true);
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "A");
    x.s.removeFail(false);
    await x.session.retryPersist();
    assert.equal(x.s.values.has(full("wrapped")), false);
    assert.equal(x.s.values.get("charitology.unrelated"), "KEEP");
  },
);
await check(
  "restore/clear authority is one-use, exact issuer/kind, stale form and file epochs refused",
  async () => {
    const x = await open(),
      y = await open(),
      p = await x.session.previewRestore(
        m.d1IndividualBackup("wrapped", wrapped("A"), at),
      );
    await reject(() => y.session.restore(p), "preview_required");
    await reject(() => x.session.remove(p), "preview_required");
    x.view.changedRecovery();
    await reject(() => x.session.restore(p), "stale_view");
    const q = await x.session.previewRemove();
    x.view.changedForm();
    await reject(() => x.session.remove(q), "stale_view");
    assert.equal(x.s.values.size, 0);
  },
);
await check(
  "failed-memory and dirty DOM loss require explicit captured discard; changed options refused",
  async () => {
    const x = await open();
    x.view.changedForm();
    await reject(() => x.session.previewRemove(), "discard_required");
    const held = await hold(x.l, full("wrapped")),
      o = { discardUnsaved: true },
      pending = x.session.previewRemove(o);
    o.discardUnsaved = false;
    held.release();
    await held.done;
    await reject(() => pending, "input_changed");
    const p = await x.session.previewRemove({ discardUnsaved: true });
    await x.session.remove(p);
  },
);
await check(
  "guarded undo returns to real absence; reload clears prior undo and queued stale reload refuses",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    assert.equal(x.session.snapshot().hasUndo, true);
    await x.session.undo();
    assert.equal(x.s.values.has(full("wrapped")), false);
    await save(x, wrapped("B"));
    await x.session.reload();
    assert.equal(x.session.snapshot().hasUndo, false);
    await reject(() => x.session.undo(), "preview_required");
  },
);
await check(
  "malformed/duplicate JSON and wrong key backup preserve memory and disk",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    const before = x.s.values.get(full("wrapped"));
    for (const raw of [
      '{"format":"charitology-local-draft","format":"x"}',
      m.d1IndividualBackup("gifts", [], at),
      "{",
    ])
      await reject(() => x.session.previewRestore(raw), "invalid_data");
    assert.equal(x.s.values.get(full("wrapped")), before);
  },
);
await check(
  "fixed registry cannot be weakened by options, alias readers or custom objects",
  async () => {
    await reject(
      () =>
        m.openD1ToolSession("wrapped", {
          view: m.createD1ViewTracker(),
          storage: storage(),
          locks: locks(),
          validate: () => true,
        }),
      "invalid_data",
    );
    await reject(
      () =>
        m.openD1ToolSession("grant-draft", { view: m.createD1ViewTracker() }),
      "invalid_data",
    );
    const x = await open();
    await reject(
      () => x.session.captureSave({ year: "A", hide: false, extra: 1 }),
      "invalid_data",
    );
  },
);
await check(
  "readonly exact dependency reads canonical producer without locks/defaults or writes",
  async () => {
    const s = storage();
    s.values.set(full("gifts"), "[]");
    const r = await m.readD1Dependency("charitology-wrapped", {
      storage: s,
      cryptoAvailable: false,
    });
    assert.equal(r.code, "saved");
    assert.deepEqual(r.value, []);
    assert.equal(r.rawHash, null);
    assert.ok(
      s.touched.every(([op, k]) => op === "get" && k === full("gifts")),
    );
    s.values.set(
      full("portfolio"),
      JSON.stringify({ allocation: { notAcause: 1 }, budget: 20 }),
    );
    assert.equal(
      (await m.readD1Dependency("one-click-split", { storage: s })).code,
      "corrupt",
    );
  },
);
await check(
  "owned control binding and storage callback reentry cannot substitute authority",
  async () => {
    const x = await open(),
      y = await open();
    m.assertD1ControlBinding(x.session, x.view);
    assert.throws(
      () => m.assertD1ControlBinding(x.session, y.view),
      codes("foreign_owner"),
    );
    let seen = false;
    x.s.setHook(() => {
      assert.throws(
        () => x.session.captureSave(wrapped("EVIL")),
        codes("reentrant_call"),
      );
      seen = true;
    });
    await save(x, wrapped("A"));
    assert.equal(seen, true);
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "A");
  },
);
await check(
  "named optional undefined compatibility is projected before owned capture",
  async () => {
    for (const key of ["legacy", "split"]) {
      const x = await open(key),
        value = structuredClone(x.session.snapshot().value);
      value.savedAt = undefined;
      const r = await save(x, value);
      assert.equal(r.outcome, "saved");
      assert.equal(Object.hasOwn(r.snapshot.value, "savedAt"), false);
    }
  },
);
await check(
  "explicit-discard undo safely replaces failed set and failed remove intents",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    x.s.writeFail(true);
    await save(x, wrapped("B"));
    await reject(() => x.session.undo(), "discard_required");
    x.s.writeFail(false);
    await x.session.undo({ discardUnsaved: true });
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "A");
    x.view.discardedForm();
    x.s.removeFail(true);
    await x.session.remove(await x.session.previewRemove());
    x.s.removeFail(false);
    await x.session.undo({ discardUnsaved: true });
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "A");
  },
);
await check(
  "last disk-read callback cannot change source options or form without final refusal",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    let reads = 0;
    const o = { discardUnsaved: true };
    x.s.getHook(() => {
      if (++reads === 2) o.discardUnsaved = false;
    });
    await reject(() => x.session.previewRemove(o), "input_changed");
    x.s.getHook(() => x.view.changedForm());
    x.view.changedForm();
    const c = x.session.captureSave(wrapped("B")),
      r = await x.session.saveCaptured(c);
    assert.equal(r.outcome, "superseded");
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "A");
  },
);
await check(
  "exact full 8,000,000-byte legacy-compatible CE backup saves, reloads, exports; +1 preserves",
  async () => {
    const x = await open("ce-models"),
      f = (
        await import("../test-fixtures/donor-recovery/factory.mjs")
      ).donorFixtures()["ce-models"];
    const bytes = (t) => new TextEncoder().encode(t).byteLength;
    const initial = m.d1IndividualBackup("ce-models", f, at);
    f[0].values.cost[0] = "x".repeat(
      m.D1_LIMITS.individualBackupBytes - bytes(initial),
    );
    const exact = m.d1IndividualBackup("ce-models", f, at);
    assert.equal(bytes(exact), 8_000_000);
    await x.session.restore(await x.session.previewRestore(exact));
    assert.equal(bytes(await x.session.backup()), 8_000_000);
    await x.session.reload();
    const prior = x.s.values.get(full("ce-models"));
    f[0].values.cost[0] += "x";
    await reject(() => x.session.captureSave(f), "input_limit");
    assert.equal(x.s.values.get(full("ce-models")), prior);
    assert.equal(bytes(await x.session.backup()), 8_000_000);
  },
);
await check(
  "actual internal replacement scheduler holds one running +one pending value with one scheduled pump",
  async () => {
    let release, start;
    const entered = new Promise((r) => (start = r)),
      wait = new Promise((r) => (release = r));
    let queued = 0;
    const runs = [];
    let tail = Promise.resolve();
    const enqueue = (run) => {
      queued++;
      const r = tail.then(run);
      tail = r.catch(() => {});
      return r;
    };
    const scheduler = m.createD1ReplacementQueue(
      enqueue,
      async (v) => {
        runs.push(v.id);
        if (v.id === 0) {
          start();
          await wait;
        }
        return { id: v.id };
      },
      (v) => ({ superseded: v.id }),
    );
    const first = scheduler.submit({ id: 0, text: "first" });
    await entered;
    const all = [];
    for (let n = 1; n <= 100; n++) {
      all.push(scheduler.submit({ id: n, text: "x".repeat(100_000) }));
      assert.deepEqual(scheduler.counts(), {
        running: 1,
        pending: 1,
        scheduled: 0,
      });
      assert.equal(queued, 1);
    }
    release();
    await first;
    const result = await Promise.all(all);
    assert.equal(result.filter((r) => "superseded" in r).length, 99);
    assert.deepEqual(runs, [0, 100]);
    assert.equal(queued, 2);
    assert.deepEqual(scheduler.counts(), {
      running: 0,
      pending: 0,
      scheduled: 0,
    });
  },
);
await check(
  "many actual-key replacements while first lock waits retain only latest unstarted job",
  async () => {
    const x = await open(),
      held = await hold(x.l, full("wrapped"));
    x.view.changedForm();
    const first = x.session.saveCaptured(
      x.session.captureSave(wrapped("first")),
    );
    await new Promise((r) => setTimeout(r, 0));
    const all = [];
    for (let n = 0; n < 100; n++) {
      x.view.changedForm();
      all.push(
        x.session.saveCaptured(x.session.captureSave(wrapped("latest-" + n))),
      );
    }
    held.release();
    await held.done;
    const results = await Promise.all([first, ...all]);
    assert.equal(results.filter((r) => r.outcome === "saved").length, 1);
    assert.equal(results.filter((r) => r.outcome === "superseded").length, 100);
    assert.equal(JSON.parse(x.s.values.get(full("wrapped"))).year, "latest-99");
    assert.equal(x.s.touched.filter(([op]) => op === "set").length, 1);
  },
);
await check(
  "retained memory after external/corrupt reload never claims to be currently saved",
  async () => {
    const x = await open();
    await save(x, wrapped("A"));
    x.s.values.set(full("wrapped"), "{corrupt");
    const result = await x.session.reload();
    assert.equal(result.hasState, true);
    assert.equal(result.value.year, "A");
    assert.equal(result.persistence, "unsaved-memory");
    assert.equal(result.code, "corrupt");
    assert.equal(JSON.parse(await x.session.backup()).value.year, "A");
    const y = await open();
    await save(y, wrapped("A"));
    y.s.values.set(full("wrapped"), JSON.stringify(wrapped("B")));
    await reject(() => save(y, wrapped("C")), "external_change");
    assert.equal(y.session.snapshot().persistence, "unsaved-memory");
  },
);
await check(
  "dependency callbacks cannot reenter a different owned session",
  async () => {
    const x = await open(),
      y = await open();
    x.s.setHook(() => {
      assert.throws(
        () => y.session.captureSave(wrapped("evil")),
        codes("reentrant_call"),
      );
    });
    await save(x, wrapped("A"));
    assert.equal(y.s.values.size, 0);
  },
);
console.log(`${groups} D1 engine groups passed.`);
