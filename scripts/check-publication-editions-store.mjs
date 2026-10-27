// Actual NEW-key storage, simulated separate writers/queued Web Locks; no provider or OS.
import assert from "node:assert/strict";
import {
  actual,
  strict,
  storage,
  locks,
  hold,
  gateDigest,
} from "../test-fixtures/publication-editions/proposal-harness.mjs";
import {
  at,
  fixture,
  command,
  makeId,
  exactBoundaryState,
} from "../test-fixtures/publication-editions/proposal-factory.mjs";
const m = await actual(),
  f = fixture(m),
  key = "charitology.publication-editions.v1";
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
const blank = () => m.blankPublicationProposals("store-" + ++seq, at);
const open = (s = storage(), l = locks(), extra = {}) =>
  m.createPublicationProposalStore({
    storage: s,
    locks: l,
    initialState: blank(),
    knownCatalog: f.catalog,
    ...extra,
  });
const binding = (st) => {
  const s = st.snapshot();
  return {
    expectedGeneration: s.generation,
    expectedStateHash: s.hash,
    expectedRevision: s.state.revision,
  };
};
const opts = () => ({ at, makeId });
const guard = () => ({ assertUiCurrent: () => undefined });
const draft = (st, tab = "sources") =>
  st.prepareCommand(
    { kind: "draft.replace", draft: { ...st.snapshot().state.draft, tab } },
    binding(st),
    opts(),
  );
const capture = async (st) =>
  st.commitPrepared(
    await st.prepareCommand(
      { kind: "basis.capture", basis: f.basis },
      binding(st),
      opts(),
    ),
    guard(),
  );
await check("strict actual store and model TypeScript", () =>
  strict(["src/lib/client/publication-editions-store.ts"]),
);
await check(
  "new final key only; opening never writes or touches legacy keys",
  async () => {
    const s = storage();
    s.values.set("charitology.manuscript-v1", "PRIVATE");
    const st = await open(s);
    assert.equal(m.PUBLICATION_PROPOSAL_STORAGE_KEY, key);
    assert.equal(s.values.has(key), false);
    assert.equal(st.snapshot().state.bases.length, 0);
    assert.ok(s.touched.every(([, k]) => k === key));
  },
);
await check(
  "issuer-owned one-use prepared objects reject clone, pure record and foreign view",
  async () => {
    const st = await open(),
      other = await open(),
      p = await draft(st);
    for (const x of [structuredClone(p), p.mutation])
      await assert.rejects(async () => st.commitPrepared(x, guard()));
    await assert.rejects(async () => other.commitPrepared(p, guard()));
    await st.commitPrepared(p, guard());
    await assert.rejects(async () => st.commitPrepared(p, guard()));
    assert.equal(st.snapshot().state.revision, 1);
  },
);
await check(
  "two writers contend on actual key; one stale writer never overwrites",
  async () => {
    const s = storage(),
      l = locks(),
      a = await open(s, l),
      b = await open(s, l),
      pa = await draft(a),
      pb = await draft(b, "exports");
    const out = await Promise.allSettled([
      a.commitPrepared(pa, guard()),
      b.commitPrepared(pb, guard()),
    ]);
    assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(JSON.parse(s.values.get(key)).revision, 1);
    assert.ok(l.calls.every((x) => x === key));
  },
);
await check(
  "queued command/binding/options are captured before the lock",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      held = await hold(l, key),
      cmd = {
        kind: "draft.replace",
        draft: { ...st.snapshot().state.draft, tab: "sources" },
      },
      b = binding(st),
      o = opts();
    const p = st.prepareCommand(cmd, b, o);
    cmd.draft.tab = "exports";
    b.expectedRevision = 123;
    o.at = "2026-10-28T12:00:00.000Z";
    held.release();
    await held.done;
    await assert.rejects(async () => p);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "async/failing/reentrant UI guards never assign and final disk race is checked",
  async () => {
    for (const callback of [
      async () => {},
      () => 1,
      () => {
        throw Error("stale");
      },
    ]) {
      const s = storage(),
        st = await open(s),
        p = await draft(st);
      await assert.rejects(async () =>
        st.commitPrepared(p, { assertUiCurrent: callback }),
      );
      assert.equal(s.values.has(key), false);
    }
    const s = storage(),
      st = await open(s),
      p = await draft(st);
    await assert.rejects(async () =>
      st.commitPrepared(p, {
        assertUiCurrent: () => {
          s.values.set(key, "FOREIGN");
        },
      }),
    );
    assert.equal(s.values.get(key), "FOREIGN");
    const t = await open();
    const q = await draft(t);
    await assert.rejects(async () =>
      t.commitPrepared(q, { assertUiCurrent: () => t.dispose() }),
    );
  },
);
await check(
  "successful final guard once; no-op preserves draft and does not write",
  async () => {
    const s = storage(),
      st = await open(s);
    await capture(st);
    let count = 0;
    const p = await st.prepareCommand(
        { kind: "basis.capture", basis: f.basis },
        binding(st),
        opts(),
      ),
      before = s.values.get(key);
    assert.equal(p.mutation.noOp, true);
    await st.commitPrepared(p, {
      assertUiCurrent: () => {
        count++;
      },
    });
    assert.equal(count, 1);
    assert.equal(s.values.get(key), before);
  },
);
await check(
  "quota failure retains valid complete candidate, exact retry never allocates twice",
  async () => {
    const s = storage(),
      st = await open(s);
    s.writeFail(true);
    await capture(st);
    assert.equal(st.snapshot().unsaved, true);
    assert.equal(st.snapshot().state.bases.length, 1);
    assert.equal(s.values.has(key), false);
    const backup = await st.backup(at);
    assert.equal(
      (await m.parsePublicationProposalBackup(backup, f.catalog)).bases.length,
      1,
    );
    const h = st.snapshot().hash;
    s.writeFail(false);
    await st.retryPersist();
    assert.equal(st.snapshot().hash, h);
    assert.equal(st.snapshot().unsaved, false);
    assert.equal(JSON.parse(s.values.get(key)).revision, 1);
  },
);
await check(
  "queued retry cannot overwrite a newer in-memory command",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l);
    s.writeFail(true);
    await capture(st);
    const newer = await draft(st, "exports"),
      held = await hold(l, key);
    const write = st.commitPrepared(newer, guard()),
      retry = st.retryPersist();
    held.release();
    await held.done;
    await write;
    await assert.rejects(async () => retry);
    assert.equal(st.snapshot().state.draft.tab, "exports");
  },
);
await check(
  "corrupt initial bytes have no invented blank and remain recoverable",
  async () => {
    const s = storage();
    s.values.set(key, "CORRUPT A");
    const st = await open(s);
    assert.equal(st.snapshot().code, "corrupt");
    assert.equal(st.snapshot().state, null);
    assert.equal(st.rawSavedCopy(), "CORRUPT A");
    await assert.rejects(async () => st.backup(at));
    const p = await st.previewClear(blank());
    await st.clear(p);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "corrupt A then unseen B/C each warn first and preserve protected/observed copies",
  async () => {
    const s = storage();
    s.values.set(key, "CORRUPT A");
    const st = await open(s);
    const b = m.canonicalPublicationProposalJson(blank());
    s.values.set(key, b);
    await assert.rejects(async () => st.previewClear(blank()));
    assert.equal(st.rawSavedCopy(), "CORRUPT A");
    assert.equal(st.snapshot().observedRaw, b);
    const preview = await st.previewClear(blank());
    const c = m.canonicalPublicationProposalJson(blank());
    s.values.set(key, c);
    await assert.rejects(async () => st.clear(preview));
    assert.equal(st.rawSavedCopy(), "CORRUPT A");
    assert.equal(st.snapshot().observedRaw, c);
    await assert.rejects(async () =>
      st.previewClear(blank()).then((p) => {
        s.values.set(key, "D");
        return st.clear(p);
      }),
    );
    assert.equal(s.values.get(key), "D");
  },
);
await check(
  "foreign write before restore/clear preview without event must first block",
  async () => {
    for (const type of ["clear", "restore"]) {
      const s = storage(),
        st = await open(s);
      await capture(st);
      const backup = await st.backup(at),
        foreign = m.canonicalPublicationProposalJson(blank());
      s.values.set(key, foreign);
      await assert.rejects(async () =>
        type === "clear" ? st.previewClear(blank()) : st.previewRestore(backup),
      );
      assert.equal(st.snapshot().code, "external_change");
      assert.equal(s.values.get(key), foreign);
    }
  },
);
await check(
  "restore preview clone/reuse/foreign and post-preview disk changes refused",
  async () => {
    const s = storage(),
      st = await open(s);
    await capture(st);
    const b = await st.backup(at),
      p = await st.previewRestore(b),
      other = await open();
    await assert.rejects(async () => st.restore(structuredClone(p)));
    await assert.rejects(async () => other.restore(p));
    await st.restore(p);
    await assert.rejects(async () => st.restore(p));
    const q = await st.previewRestore(b);
    s.values.set(key, "FOREIGN");
    await assert.rejects(async () => st.restore(q));
    assert.equal(s.values.get(key), "FOREIGN");
  },
);
await check(
  "mutated pending restore bytes and late preview after reload cannot acquire authority",
  async () => {
    const gate = gateDigest(),
      s = storage(),
      st = await open(s, locks(), { digest: gate.digest });
    await capture(st);
    const b = new TextEncoder().encode(await st.backup(at)),
      pause = gate.pause(),
      p = st.previewRestore(b);
    await pause.started;
    b[10] ^= 1;
    pause.release();
    await assert.rejects(async () => p);
  },
);
await check(
  "clear failure retries removal; undo and explicit reload guards truthful",
  async () => {
    const s = storage(),
      st = await open(s);
    await capture(st);
    s.removeFail(true);
    await st.clear(await st.previewClear(blank()));
    assert.equal(st.snapshot().unsaved, true);
    assert.ok(s.values.has(key));
    s.removeFail(false);
    await st.retryPersist();
    assert.equal(s.values.has(key), false);
    await st.undo();
    assert.equal(st.snapshot().state.bases.length, 1);
    await st.reload();
    assert.equal(st.snapshot().canUndo, false);
    await assert.rejects(async () => st.undo());
  },
);
await check(
  "dirty reload requires explicit captured discard; queued option mutation refused",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      p = await st.prepareCommand(
        {
          kind: "draft.replace",
          draft: { ...st.snapshot().state.draft, dirty: true },
        },
        binding(st),
        opts(),
      );
    await st.commitPrepared(p, guard());
    await assert.rejects(async () => st.reload());
    const held = await hold(l, key),
      o = { discardUnsaved: false },
      pending = st.reload(o);
    o.discardUnsaved = true;
    held.release();
    await held.done;
    await assert.rejects(async () => pending);
    await assert.rejects(async () => st.reload({ unknown: true }));
  },
);
await check(
  "read denial is unavailable, unsupported Web Locks is read/export only",
  async () => {
    const s = storage();
    s.readFail(true);
    const st = await open(s);
    assert.equal(st.snapshot().observedRaw, undefined);
    assert.equal(st.snapshot().state, null);
    assert.equal(st.snapshot().canRecover, false);
    const t = await open(storage(), null);
    assert.equal(t.snapshot().readOnly, true);
    assert.equal(
      (await m.parsePublicationProposalBackup(await t.backup(at), f.catalog))
        .bases.length,
      0,
    );
    await assert.rejects(async () => draft(t));
  },
);
await check(
  "actual exact 2 MiB state restore/load and plus one preservation",
  async () => {
    const { state, catalog } = await exactBoundaryState(m),
      s = storage(),
      st = await open(s, locks(), { knownCatalog: catalog }),
      b = await m.makePublicationProposalBackup(state, at, catalog);
    await st.restore(await st.previewRestore(b));
    assert.equal(Buffer.byteLength(await st.backup(at)), 2_097_152);
    const old = s.values.get(key);
    const bad = JSON.parse(b);
    bad.state.draft.form.fields.editionId += "x";
    bad.checksum = m.hashPublicationProposalSync(bad.state);
    await assert.rejects(async () =>
      st.previewRestore(JSON.stringify(bad, null, 2) + "\n"),
    );
    assert.equal(s.values.get(key), old);
    const again = await open(s, locks(), { knownCatalog: catalog });
    assert.equal(again.snapshot().hash, st.snapshot().hash);
  },
);

await check(
  "late restore preview after a successful reload is invalidated",
  async () => {
    const gate = gateDigest(),
      s = storage(),
      st = await open(s, locks(), { digest: gate.digest });
    await capture(st);
    const b = await st.backup(at),
      pause = gate.pause(),
      pending = st.previewRestore(b);
    await pause.started;
    await st.reload();
    pause.release();
    await assert.rejects(async () => pending);
    assert.equal(st.snapshot().state.bases.length, 1);
  },
);
await check(
  "queued final guard replacement and stale prepared after undo/reload cannot write",
  async () => {
    const s = storage(),
      l = locks(),
      st = await open(s, l),
      p = await draft(st),
      held = await hold(l, key),
      o = guard(),
      pending = st.commitPrepared(p, o);
    o.assertUiCurrent = () => {
      throw Error("replacement must not run");
    };
    held.release();
    await held.done;
    await assert.rejects(async () => pending);
    assert.equal(s.values.has(key), false);
    const q = await draft(st);
    await st.reload();
    await assert.rejects(async () => st.commitPrepared(q, guard()));
  },
);
await check(
  "recovery after memory change is refused; repeated absent-key clears remain lossless",
  async () => {
    const s = storage(),
      l = locks(),
      a = await open(s, l),
      b = await open(s, l),
      pa = await a.previewClear(blank()),
      pb = await b.previewClear(blank());
    const out = await Promise.allSettled([a.clear(pa), b.clear(pb)]);
    /* Both removals of absent storage can be serial no-loss operations; memory identity remains per-view. */ assert.equal(
      out.filter((x) => x.status === "fulfilled").length,
      2,
    );
    await capture(a);
    const before = s.values.get(key),
      preview = await a.previewRestore(await a.backup(at));
    await a.commitPrepared(await draft(a, "exports"), guard());
    await assert.rejects(async () => a.restore(preview));
    assert.notEqual(s.values.get(key), before);
    assert.equal(JSON.parse(s.values.get(key)).draft.tab, "exports");
  },
);
await check(
  "read denial after corrupt A keeps the protected text without claiming current bytes",
  async () => {
    const s = storage();
    s.values.set(key, "CORRUPT A");
    const st = await open(s);
    s.readFail(true);
    await st.reload({ discardUnsaved: true });
    assert.equal(st.snapshot().observedRaw, undefined);
    assert.equal(st.rawSavedCopy(), "CORRUPT A");
    assert.equal(st.snapshot().canRecover, false);
  },
);
await check(
  "normal guarded proposal creation and amend retain source closure across reopen",
  async () => {
    const s = storage(),
      st = await open(s);
    await capture(st);
    const cmd = command(m, f.basis);
    await st.commitPrepared(
      await st.prepareCommand(cmd, binding(st), opts()),
      guard(),
    );
    const prior = st.snapshot().state.versions[0];
    const p = await st.prepareCommand(
      {
        ...cmd,
        proposalId: prior.proposalId,
        expectedVersionId: prior.id,
        expectedVersionHash: prior.hash,
        title: "Revised local title",
        amendmentReason: "Fictional correction",
      },
      binding(st),
      opts(),
    );
    await st.commitPrepared(p, guard());
    const again = await open(s);
    assert.equal(again.snapshot().state.versions.length, 2);
    assert.equal(again.snapshot().state.versions[1].previousHash, prior.hash);
    assert.equal(again.snapshot().state.sources.length, 1);
  },
);
console.log(`${groups} publication proposal store groups passed.`);
