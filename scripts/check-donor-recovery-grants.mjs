// Three-key, separately confirmed grant recovery checks; cooperating locks only.
import assert from "node:assert/strict";
import {
  actual,
  at,
  storage,
  locks,
  hold,
  gateDigest,
  codes,
  full,
  proposal,
} from "../test-fixtures/donor-recovery/engine-harness.mjs";
const m = await actual(),
  order = ["grant-proposals", "grant-weights", "grant-draft"];
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
async function open(s = storage(), l = locks(), extra = {}) {
  const view = m.createD1ViewTracker(),
    grant = await m.openD1GrantCoordinator({
      view,
      storage: s,
      locks: l,
      ...extra,
    });
  return { s, l, view, grant };
}
async function save(x, values) {
  x.view.changedForm();
  const r = await x.grant.saveCaptured(x.grant.captureSave(values));
  if (!r.snapshot.pending) x.view.markFormSaved(r.formGeneration);
  return r;
}
const members = (values, presence = {}) =>
  order.map((key) =>
    presence[key] === "absent"
      ? { key, presence: "absent", persistence: "saved" }
      : {
          key,
          presence: "value",
          persistence: "saved",
          value: values[key] ?? m.d1DefaultValue(key),
        },
  );
function source(values, presence) {
  return m.d1GrantBundle({
    format: "charitology-grant-workspace",
    version: 1,
    exportedAt: at,
    members: members(values, presence),
  });
}
function seed(s, values) {
  for (const key of order)
    if (Object.hasOwn(values, key))
      s.values.set(full(key), JSON.stringify(values[key]));
}
async function step(x, plan, key) {
  return x.grant.applyStep(await x.grant.previewStep(plan, key));
}
await check(
  "opening three exact legacy keys preserves valid saved null and absence distinctly",
  async () => {
    const s = storage();
    s.values.set(full("grant-draft"), "null");
    const x = await open(s);
    const snap = x.grant.snapshot();
    assert.equal(snap.members["grant-draft"].hasState, true);
    assert.equal(snap.members["grant-draft"].value, null);
    assert.equal(snap.members["grant-draft"].persistence, "saved");
    const b = JSON.parse(await x.grant.bundle(at));
    assert.equal(b.members[0].presence, "absent");
    assert.equal(b.members[1].presence, "absent");
    assert.equal(b.members[2].presence, "value");
    assert.equal(b.members[2].value, null);
    assert.ok(x.s.touched.every(([, k]) => order.map(full).includes(k)));
    assert.deepEqual(x.l.calls.slice(0, 3), [...order].sort().map(full));
  },
);
await check(
  "complete proposal and draft save uses three lexical locks and library-before-draft writes",
  async () => {
    const x = await open(),
      p = proposal(m);
    const r = await save(x, { "grant-proposals": [p], "grant-draft": p });
    assert.equal(r.outcomes["grant-proposals"], "saved");
    assert.equal(r.outcomes["grant-draft"], "saved");
    assert.deepEqual(
      x.s.touched.filter(([op]) => op === "set").map(([, k]) => k),
      [full(order[0]), full(order[2])],
    );
    assert.equal(x.grant.snapshot().consistency, "consistent");
  },
);
await check(
  "absent equal defaults persist and subsequent equal saved values no-op",
  async () => {
    const x = await open();
    const r = await save(x, { "grant-draft": null });
    assert.equal(r.outcomes["grant-draft"], "saved");
    assert.equal(x.s.values.get(full("grant-draft")), "null");
    const again = await save(x, { "grant-draft": null });
    assert.equal(again.outcomes["grant-draft"], "no-op");
  },
);
await check(
  "partial save retains full desired vector and exact retry without regenerating IDs",
  async () => {
    const x = await open(),
      p = proposal(m);
    x.s.setHook((k) => {
      if (k === full("grant-draft"))
        throw Error("Synthetic second write failure");
    });
    const r = await save(x, { "grant-proposals": [p], "grant-draft": p });
    assert.equal(r.outcomes["grant-proposals"], "saved");
    assert.equal(r.outcomes["grant-draft"], "unsaved");
    assert.equal(r.snapshot.pending.origin, "save");
    assert.equal(r.snapshot.pending.remaining[0].operation, "set");
    assert.equal(
      JSON.parse(await x.grant.desiredBundle(at)).members[2].value.id,
      p.id,
    );
    await reject(
      () => x.grant.captureSave({ "grant-draft": null }),
      "pending_operation",
    );
    x.s.setHook(null);
    const next = await x.grant.retryPending();
    assert.equal(next.snapshot.pending, null);
    assert.equal(JSON.parse(x.s.values.get(full("grant-draft"))).id, p.id);
  },
);
await check(
  "failed first save keeps unattempted desired members and no hidden later step",
  async () => {
    const x = await open(),
      p = proposal(m);
    x.s.writeFail(true);
    const r = await save(x, { "grant-proposals": [p], "grant-draft": p });
    assert.equal(r.outcomes["grant-proposals"], "unsaved");
    assert.equal(r.outcomes["grant-draft"], "not-attempted");
    assert.equal(r.snapshot.pending.remaining.length, 2);
    const desired = JSON.parse(await x.grant.desiredBundle(at));
    assert.equal(desired.members[2].value.id, p.id);
    assert.equal(desired.members[2].persistence, "unsaved-memory");
    assert.equal(x.s.values.size, 0);
  },
);
await check(
  "whole bundle preview is inert and each member needs its own ordered fresh confirmation",
  async () => {
    const x = await open(),
      p = proposal(m),
      raw = source({ "grant-proposals": [p], "grant-draft": p });
    const plan = await x.grant.previewBundle(raw);
    assert.equal(x.s.values.size, 0);
    await reject(
      () => x.grant.previewStep(plan, "grant-draft"),
      "preview_required",
    );
    let r = await step(x, plan, "grant-proposals");
    assert.equal(r.complete, false);
    assert.equal(x.s.values.has(full("grant-draft")), false);
    await reject(
      () => x.grant.previewStep(plan, "grant-weights"),
      "foreign_owner",
    );
    r = await step(x, r.plan, "grant-weights");
    assert.equal(r.complete, false);
    r = await step(x, r.plan, "grant-draft");
    assert.equal(r.complete, true);
    assert.equal(x.grant.snapshot().consistency, "consistent");
  },
);
await check(
  "full restore may visibly orphan old draft between steps and blocks normal writes",
  async () => {
    const s = storage(),
      old = proposal(m, "old"),
      p = proposal(m, "new");
    seed(s, { "grant-proposals": [old], "grant-draft": old });
    const x = await open(s),
      plan = await x.grant.previewBundle(
        source({ "grant-proposals": [p], "grant-draft": p }),
      );
    const a = await step(x, plan, "grant-proposals");
    assert.equal(a.snapshot.consistency, "partial");
    assert.equal(a.snapshot.members["grant-draft"].value.id, "old");
    await reject(
      () => x.grant.captureSave({ "grant-draft": null }),
      "pending_operation",
    );
    let r = await step(x, a.plan, "grant-weights");
    r = await step(x, r.plan, "grant-draft");
    assert.equal(r.complete, true);
    assert.equal(r.snapshot.members["grant-draft"].value.id, "new");
  },
);
await check(
  "initially inconsistent target repairs through complete source without ID cleaning",
  async () => {
    const s = storage(),
      orphan = proposal(m, "orphan"),
      p = proposal(m, "new");
    seed(s, { "grant-proposals": [], "grant-draft": orphan });
    const x = await open(s);
    assert.equal(x.grant.snapshot().consistency, "inconsistent");
    assert.equal(x.grant.snapshot().members["grant-draft"].value.id, "orphan");
    let plan = await x.grant.previewBundle(
      source({ "grant-proposals": [p], "grant-draft": p }),
    );
    let r;
    for (const k of order) {
      r = await step(x, plan, k);
      plan = r.plan;
    }
    assert.equal(r.complete, true);
  },
);
await check(
  "inconsistent target can explicitly remove draft only; null value and removal differ",
  async () => {
    const s = storage(),
      orphan = proposal(m, "orphan");
    seed(s, { "grant-proposals": [], "grant-draft": orphan });
    const x = await open(s),
      p = await x.grant.previewRemove("grant-draft");
    const r = await x.grant.remove(p);
    assert.equal(r.complete, false);
    assert.equal(s.values.has(full("grant-draft")), false);
    assert.equal(r.snapshot.consistency, "consistent");
    assert.equal(r.snapshot.members["grant-draft"].persistence, "absent");
  },
);
await check(
  "individual library removal that would orphan draft is refused; current IDs stay intact",
  async () => {
    const p = proposal(m),
      s = storage();
    seed(s, { "grant-proposals": [p], "grant-draft": p });
    const x = await open(s);
    await reject(
      () => x.grant.previewRemove("grant-proposals"),
      "invalid_data",
    );
    assert.equal(JSON.parse(s.values.get(full("grant-draft"))).id, p.id);
  },
);
await check(
  "failed restore/remove intents require exact failed plan retry, never retryPending",
  async () => {
    const x = await open();
    await save(x, { "grant-draft": null });
    x.s.removeFail(true);
    const p = await x.grant.previewRemove("grant-draft"),
      r = await x.grant.remove(p);
    assert.equal(r.snapshot.pending.origin, "remove");
    assert.equal(r.snapshot.pending.remaining[0].operation, "remove");
    await reject(() => x.grant.retryPending(), "pending_operation");
    await reject(
      () => x.grant.retryStep(structuredClone(r.plan)),
      "foreign_owner",
    );
    x.s.removeFail(false);
    const next = await x.grant.retryStep(r.plan);
    assert.equal(next.snapshot.pending, null);
    assert.equal(x.s.values.has(full("grant-draft")), false);
    assert.equal(next.complete, false);
  },
);
await check(
  "restore failure never confirms subsequent members, retryStep only retries exact failed member",
  async () => {
    const x = await open(),
      p = proposal(m),
      plan = await x.grant.previewBundle(
        source({ "grant-proposals": [p], "grant-draft": p }),
      );
    x.s.writeFail(true);
    let r = await step(x, plan, "grant-proposals");
    assert.equal(r.outcome, "unsaved");
    await reject(
      () => x.grant.previewStep(r.plan, "grant-weights"),
      "pending_operation",
    );
    x.s.writeFail(false);
    r = await x.grant.retryStep(r.plan);
    assert.equal(r.outcome, "saved");
    assert.equal(x.s.values.has(full("grant-weights")), false);
    assert.equal(x.s.values.has(full("grant-draft")), false);
    assert.equal(r.complete, false);
  },
);
await check(
  "all-vector foreign writes refuse step and keep original protected bytes",
  async () => {
    const s = storage();
    seed(s, { "grant-draft": null });
    const x = await open(s),
      p = proposal(m),
      plan = await x.grant.previewBundle(
        source({ "grant-proposals": [p], "grant-draft": p }),
      );
    const preview = await x.grant.previewStep(plan, "grant-proposals");
    s.values.set(
      full("grant-weights"),
      JSON.stringify(
        Object.fromEntries(m.D1_GRANT_DIMENSIONS.map((k) => [k, 2])),
      ),
    );
    await reject(() => x.grant.applyStep(preview), "external_change");
    assert.equal(s.values.has(full("grant-proposals")), false);
  },
);
await check(
  "grant corrupt A→unseen B/C requires new review while preserving both copies",
  async () => {
    const s = storage();
    s.values.set(full("grant-draft"), "A{");
    const x = await open(s);
    s.values.set(full("grant-draft"), "null");
    await reject(() => x.grant.previewBundle(source({})), "external_change");
    assert.equal(x.grant.protectedRawCopy("grant-draft"), "A{");
    assert.equal(x.grant.observedRawCopy("grant-draft"), "null");
    const plan = await x.grant.previewBundle(source({}));
    s.values.set(full("grant-draft"), JSON.stringify(proposal(m, "C")));
    await reject(
      () => x.grant.previewStep(plan, "grant-proposals"),
      "external_change",
    );
    assert.equal(x.grant.protectedRawCopy("grant-draft"), "A{");
  },
);
await check(
  "recovery decision changed during async hashing refuses whole plan without any write",
  async () => {
    const g = gateDigest(),
      x = await open(storage(), locks(), { digest: g.digest }),
      p = g.pause();
    const pending = x.grant.previewBundle(source({}));
    await p.started;
    x.view.changedRecovery();
    p.release();
    await reject(() => pending, "stale_view");
    assert.equal(x.s.values.size, 0);
  },
);
await check(
  "two grant coordinators serialize complete vectors and loser never rolls winner back",
  async () => {
    const s = storage(),
      l = locks(),
      a = await open(s, l),
      b = await open(s, l),
      p = proposal(m, "A"),
      q = proposal(m, "B");
    const results = await Promise.allSettled([
      save(a, { "grant-proposals": [p], "grant-draft": p }),
      save(b, { "grant-proposals": [q], "grant-draft": q }),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "external_change",
    );
    assert.equal(JSON.parse(s.values.get(full("grant-draft"))).id, "A");
  },
);
await check(
  "named proposal savedAt undefined survives whole grant write-set capture",
  async () => {
    const x = await open(),
      p = { ...proposal(m), savedAt: undefined };
    const r = await save(x, { "grant-proposals": [p], "grant-draft": p });
    assert.equal(r.snapshot.pending, null);
    assert.equal(
      Object.hasOwn(r.snapshot.members["grant-draft"].value, "savedAt"),
      false,
    );
  },
);
await check(
  "new complete recovery preview retains pending intent and current memory until explicit apply",
  async () => {
    const x = await open(),
      p = proposal(m);
    x.s.writeFail(true);
    await save(x, { "grant-proposals": [p], "grant-draft": p });
    const before = x.grant.snapshot(),
      raw = source({});
    await x.grant.previewBundle(raw, { discardUnsaved: true });
    const after = x.grant.snapshot();
    assert.deepEqual(after.pending, before.pending);
    assert.deepEqual(after.members, before.members);
    assert.equal(
      JSON.parse(await x.grant.desiredBundle(at)).members[0].value.length,
      0,
    );
  },
);
await check(
  "full source plan retains exact validated source metadata and snapshot",
  async () => {
    const x = await open(),
      raw = source({}),
      plan = await x.grant.previewBundle(raw);
    assert.deepEqual(plan.bundle, JSON.parse(raw));
    assert.equal(plan.bundle.exportedAt, at);
  },
);
await check(
  "final source-byte guard runs after last injected disk-read before publishing plan",
  async () => {
    const x = await open(),
      raw = new TextEncoder().encode(source({}));
    let reads = 0;
    x.s.getHook(() => {
      if (++reads === 9) raw[0] = 32;
    });
    await reject(() => x.grant.previewBundle(raw), "input_changed");
    assert.equal(x.s.values.size, 0);
  },
);
await check(
  "many grant replacements behind one running three-key lock write only the latest slot",
  async () => {
    const x = await open(),
      held = await hold(x.l, full("grant-draft"));
    x.view.changedForm();
    const first = x.grant.saveCaptured(
      x.grant.captureSave({
        "grant-draft": { ...proposal(m, ""), name: "first" },
      }),
    );
    const guarded = first.then(
      (v) => ({ v }),
      (e) => ({ e }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const all = [];
    for (let n = 0; n < 100; n++) {
      x.view.changedForm();
      all.push(
        x.grant.saveCaptured(
          x.grant.captureSave({
            "grant-draft": { ...proposal(m, ""), name: "latest-" + n },
          }),
        ),
      );
    }
    held.release();
    await held.done;
    const firstResult = await guarded;
    assert.equal(firstResult.e.code, "stale_view");
    const results = await Promise.all(all);
    assert.equal(
      results.filter((r) => Object.keys(r.outcomes).length === 0).length,
      99,
    );
    assert.equal(
      JSON.parse(x.s.values.get(full("grant-draft"))).name,
      "latest-99",
    );
    assert.equal(x.s.touched.filter(([op]) => op === "set").length, 1);
  },
);
await check(
  "failed grant reload retains the complete pending desired vector and valid memory",
  async () => {
    const x = await open(),
      p = proposal(m);
    x.s.writeFail(true);
    await save(x, { "grant-proposals": [p], "grant-draft": p });
    const pending = x.grant.snapshot().pending;
    x.s.readFail(true);
    const result = await x.grant.reload({ discardUnsaved: true });
    assert.deepEqual(result.pending, pending);
    assert.equal(result.members["grant-proposals"].value[0].id, p.id);
    const desired = JSON.parse(await x.grant.desiredBundle(at));
    assert.equal(desired.members[2].value.id, p.id);
    assert.equal(desired.members[2].persistence, "unsaved-memory");
    x.s.readFail(false);
    await x.grant.reload({ discardUnsaved: true });
    assert.equal(x.grant.snapshot().pending, null);
  },
);
console.log(`${groups} D1 grant groups passed.`);
