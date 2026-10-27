// Actual graph/store modules and exclusive lock queues; fictional local drafts only.
import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import path from "node:path";
import { exactBoundaryState } from "../test-fixtures/program-graph/factory.mjs";
const result = await build({
  stdin: {
    contents: `export * from './src/lib/client/program-graph-model.ts'; export * from './src/lib/client/program-graph-import.ts'; export * from './src/lib/client/program-graph-store.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const at = "2026-10-27T12:00:00.000Z",
  key = "charitology.program-graph.v1";
let count = 0,
  sequence = 0;
const blank = () =>
  m.blankProgramGraphState("synthetic-graph-" + ++sequence, at);
const codes =
  (...expected) =>
  (error) =>
    expected.includes(error.code);
async function check(name, fn) {
  try {
    await fn();
    count++;
    console.log("✓ " + name);
  } catch (error) {
    error.message = name + ": " + error.message;
    throw error;
  }
}
function storage() {
  const values = new Map(),
    touched = [];
  let readFail = false,
    writeFail = false,
    removeFail = false;
  return {
    values,
    touched,
    readFail: (v) => (readFail = v),
    writeFail: (v) => (writeFail = v),
    removeFail: (v) => (removeFail = v),
    getItem(k) {
      touched.push(["get", k]);
      if (readFail) throw Error("fictional read denial");
      return values.get(k) ?? null;
    },
    setItem(k, v) {
      touched.push(["set", k]);
      if (writeFail) throw Error("fictional quota");
      values.set(k, v);
    },
    removeItem(k) {
      touched.push(["remove", k]);
      if (removeFail) throw Error("fictional remove denial");
      values.delete(k);
    },
  };
}
function locks() {
  let tail = Promise.resolve(),
    active = 0,
    maximum = 0;
  return {
    maximum: () => maximum,
    request(name, options, fn) {
      assert.equal(name, key);
      assert.deepEqual(options, { mode: "exclusive" });
      const next = tail.then(async () => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          return await fn();
        } finally {
          active--;
        }
      });
      tail = next.catch(() => {});
      return next;
    },
  };
}
const open = (s, l, initialState = blank(), extra = {}) =>
  m.createProgramGraphStore({ storage: s, locks: l, initialState, ...extra });
async function draft(store, alias, extra = {}) {
  const snap = store.snapshot();
  assert.ok(snap.state && snap.hash);
  return m.prepareProgramGraphCommand(
    snap.state,
    {
      kind: "draft.replace",
      draft: {
        tab: "import",
        sourceId: null,
        nodeId: null,
        form: {
          kind: "capture",
          targetId: null,
          binding: extra.binding ?? {},
          fields: { alias, ...extra.fields },
        },
        dirty: true,
      },
    },
    {
      expectedStateHash: snap.hash,
      at: "2026-10-27T12:00:01.000Z",
      makeId: () => "synthetic-entity-" + ++sequence,
    },
  );
}
await check(
  "the final key and lock are isolated; reading never creates a saved graph",
  async () => {
    const s = storage(),
      l = locks();
    const protectedKeys = [
      "charitology.partner-workspace-v1.the-charitology-fund",
      "charitology.partner-workspace-v1.field-verification",
      "charitology.study-register.v1",
      "charitology.artifact-results.v1",
    ];
    for (const k of protectedKeys) s.values.set(k, "protected:" + k);
    const store = await open(s, l);
    assert.equal(m.PROGRAM_GRAPH_STORAGE_KEY, key);
    assert.equal(m.PROGRAM_GRAPH_LOCK_NAME, key);
    assert.equal(store.snapshot().canWrite, true);
    assert.equal(s.values.has(key), false);
    assert.ok(Object.isFrozen(store.snapshot().state.draft));
    assert.deepEqual(
      await m.parseProgramGraphBackup(await store.backup(at)),
      store.snapshot().state,
    );
    assert.ok(s.touched.every(([, k]) => k === key));
    for (const k of protectedKeys)
      assert.equal(s.values.get(k), "protected:" + k);
  },
);
await check(
  "simultaneous real lock contenders preserve exactly one saved revision",
  async () => {
    const s = storage(),
      l = locks(),
      initial = blank();
    s.values.set(key, m.canonicalProgramGraphJson(initial));
    const [a, b] = await Promise.all([
      open(s, l, initial),
      open(s, l, initial),
    ]);
    const [pa, pb] = await Promise.all([
      draft(a, "Writer A"),
      draft(b, "Writer B"),
    ]);
    const results = await Promise.allSettled([
      a.commitPrepared(pa),
      b.commitPrepared(pb),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.filter(
        (r) => r.status === "rejected" && r.reason.code === "external_change",
      ).length,
      1,
    );
    assert.equal(
      JSON.parse(s.values.get(key)).draft.form.fields.alias,
      "Writer A",
    );
    assert.equal(l.maximum(), 1);
    assert.equal(b.snapshot().state.draft.form, null);
    await assert.rejects(b.undo(), codes("external_change"));
  },
);
await check(
  "a queued mutable prepared envelope cannot substitute a different valid candidate",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l);
    const requested = structuredClone(await draft(store, "Requested A"));
    const replacement = await draft(store, "Substituted B");
    let release, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const blocker = l.request(key, { mode: "exclusive" }, async () => {
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
    });
    await started;
    const before = store.snapshot().hash;
    const committing = store.commitPrepared(requested);
    const outcome = Promise.allSettled([committing]);
    Object.assign(requested, structuredClone(replacement));
    release();
    await blocker;
    const [result] = await outcome;
    assert.equal(result.status, "rejected");
    assert.equal(result.reason.code, "input_changed");
    assert.equal(store.snapshot().hash, before);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "prepared input mutations during validation are refused, including no-op commands",
  async () => {
    for (const noop of [false, true]) {
      const s = storage(),
        store = await open(s, locks());
      if (noop) await store.commitPrepared(await draft(store, "Same form"));
      const requested = structuredClone(
        await draft(store, noop ? "Same form" : "New form"),
      );
      if (noop) assert.equal(requested.noOp, true);
      const before = store.snapshot().hash,
        saved = s.values.get(key);
      const read = s.getItem.bind(s);
      let scheduled = false;
      s.getItem = function (k) {
        const result = read(k);
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => {
            requested.summary.message = "Changed after validation began";
          });
        }
        return result;
      };
      await assert.rejects(
        store.commitPrepared(requested),
        codes("input_changed"),
      );
      assert.equal(store.snapshot().hash, before);
      assert.equal(s.values.get(key), saved);
    }
  },
);
await check(
  "quota failures retain exportable candidate and retry without command replay",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      p = await draft(store, "Unsaved graph form");
    s.writeFail(true);
    await store.commitPrepared(p);
    const revision = store.snapshot().state.revision;
    assert.equal(store.snapshot().unsaved, true);
    assert.equal(store.snapshot().code, "persist_failed");
    assert.equal(store.snapshot().hash, p.nextStateHash);
    assert.deepEqual(
      await m.parseProgramGraphBackup(await store.backup(at)),
      p.nextState,
    );
    await store.retryPersist();
    assert.equal(store.snapshot().state.revision, revision);
    s.writeFail(false);
    await store.retryPersist();
    assert.equal(store.snapshot().unsaved, false);
    assert.equal(store.snapshot().state.revision, revision);
    assert.equal(
      JSON.parse(s.values.get(key)).draft.form.fields.alias,
      "Unsaved graph form",
    );
  },
);
await check(
  "unseen foreign writes block retries but retain dirty memory",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      p = await draft(store, "Preserve this");
    s.writeFail(true);
    await store.commitPrepared(p);
    s.writeFail(false);
    const other = blank();
    s.values.set(key, m.canonicalProgramGraphJson(other));
    await assert.rejects(store.retryPersist(), codes("external_change"));
    assert.equal(store.snapshot().hash, p.nextStateHash);
    assert.deepEqual(
      await m.parseProgramGraphBackup(await store.backup(at)),
      p.nextState,
    );
    assert.deepEqual(JSON.parse(s.values.get(key)), other);
  },
);
await check(
  "large malformed raw bindings remain lossless recovery data rather than command authority",
  async () => {
    const s = storage(),
      store = await open(s, locks());
    const raw = "λ".repeat(16000);
    const p = await draft(store, raw, {
      binding: { reviewHash: raw, expectedCaptureHash: raw, originValue: raw },
    });
    await store.commitPrepared(p);
    const backup = await store.backup(at);
    assert.ok(Buffer.byteLength(backup) > 65536);
    const restored = await m.parseProgramGraphBackup(backup);
    assert.equal(restored.draft.form.binding.reviewHash, raw);
    assert.equal(restored.draft.form.fields.alias, raw);
    assert.equal(restored.sources.length, 0);
  },
);
await check(
  "forged prepared hashes, stale revisions and invalid oversized drafts do not assign memory",
  async () => {
    const s = storage(),
      store = await open(s, locks()),
      p = await draft(store, "Candidate"),
      before = store.snapshot();
    await assert.rejects(
      store.commitPrepared({ ...p, nextStateHash: "0".repeat(64) }),
      codes("candidate_hash"),
    );
    assert.equal(store.snapshot().hash, before.hash);
    await assert.rejects(
      store.commitPrepared({ ...p, expectedRevision: 99 }),
      codes("stale_prepared"),
    );
    assert.equal(store.snapshot().hash, before.hash);
    const invalid = structuredClone(p);
    invalid.nextState.draft.form.fields.alias = "x".repeat(16385);
    await assert.rejects(store.commitPrepared(invalid));
    assert.equal(store.snapshot().hash, before.hash);
    assert.equal(s.values.has(key), false);
  },
);
await check(
  "restore previews are one-use owned capabilities, with post-preview disk comparison",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      backup = await store.backup(at),
      preview = await store.previewRestore(backup);
    await assert.rejects(
      store.restore(structuredClone(preview)),
      codes("preview_required"),
    );
    const other = await open(storage(), locks());
    await assert.rejects(other.restore(preview), codes("preview_required"));
    s.values.set(key, m.canonicalProgramGraphJson(blank()));
    await assert.rejects(store.restore(preview), codes("external_change"));
    assert.equal(store.snapshot().code, "external_change");
  },
);
await check(
  "an unseen foreign write first blocks restore and clear; explicit second recovery observes it",
  async () => {
    for (const action of ["restore", "clear"]) {
      const s = storage(),
        store = await open(s, locks()),
        own = await store.backup(at);
      const foreign = m.canonicalProgramGraphJson(blank());
      s.values.set(key, foreign);
      const preview = () =>
        action === "restore"
          ? store.previewRestore(own)
          : store.previewClear(blank());
      await assert.rejects(preview(), codes("external_change"));
      assert.equal(s.values.get(key), foreign);
      const approved = await preview();
      await store[action](approved);
      assert.equal(store.snapshot().readOnly, false);
      if (action === "clear") assert.equal(s.values.has(key), false);
      else
        assert.equal(
          store.snapshot().state.id,
          (await m.parseProgramGraphBackup(own)).id,
        );
    }
  },
);
await check(
  "late parsing cannot restore over a newer memory generation",
  async () => {
    const s = storage(),
      store = await open(s, locks()),
      backup = await store.backup(at),
      pending = store.previewRestore(backup);
    const changed = draft(store, "Newer queued work").then((p) =>
      store.commitPrepared(p),
    );
    const result = await Promise.allSettled([pending, changed]);
    if (result[0].status === "fulfilled")
      await assert.rejects(
        store.restore(result[0].value),
        codes("stale_memory", "external_change", "preview_required"),
      );
    assert.equal(
      store.snapshot().state.draft.form.fields.alias,
      "Newer queued work",
    );
  },
);
await check(
  "corrupt saved bytes remain available and explicit restoration is required",
  async () => {
    const s = storage();
    s.values.set(key, "{broken saved graph");
    const store = await open(s, locks());
    assert.equal(store.snapshot().code, "corrupt");
    assert.equal(store.rawSavedCopy(), "{broken saved graph");
    assert.equal(store.snapshot().state, null);
    const fresh = blank(),
      preview = await store.previewRestore(
        await m.makeProgramGraphBackup(fresh, at),
      );
    await store.restore(preview);
    assert.deepEqual(store.snapshot().state, fresh);
    assert.equal(store.rawSavedCopy(), "{broken saved graph");
  },
);
await check(
  "strict saved-state admission rejects decoded duplicate keys and depth33 before assignment",
  async () => {
    const initial = blank(),
      canonical = m.canonicalProgramGraphJson(initial);
    const duplicate = canonical.replace(
      '"revision":0',
      '"revision":0,"revi\\u0073ion":0',
    );
    assert.notEqual(duplicate, canonical);
    for (const raw of [duplicate, "[".repeat(33) + "0" + "]".repeat(33)]) {
      const s = storage();
      s.values.set(key, raw);
      const store = await open(s, locks(), initial);
      assert.equal(store.snapshot().code, "corrupt");
      assert.equal(store.snapshot().state, null);
      assert.equal(s.values.get(key), raw);
      assert.equal(s.touched.filter(([action]) => action !== "get").length, 0);
    }
  },
);
await check(
  "read denial never invents an absent graph or authorizes replacement",
  async () => {
    const s = storage();
    s.readFail(true);
    const store = await open(s, locks());
    assert.equal(store.snapshot().code, "read_error");
    assert.equal(store.snapshot().observedRaw, undefined);
    assert.equal(store.rawSavedCopy(), undefined);
    await assert.rejects(store.previewClear(blank()));
    await assert.rejects(
      store.previewRestore(await m.makeProgramGraphBackup(blank(), at)),
    );
    assert.equal(s.touched.filter(([action]) => action !== "get").length, 0);
  },
);
await check(
  "failed clear, retry removal and a newer draft preserve the correct operation",
  async () => {
    const s = storage(),
      store = await open(s, locks());
    await store.commitPrepared(await draft(store, "Saved before clear"));
    s.removeFail(true);
    await store.clear(await store.previewClear(blank()));
    assert.equal(store.snapshot().unsaved, true);
    assert.equal(s.values.has(key), true);
    await store.retryPersist();
    assert.equal(store.snapshot().unsaved, true);
    await store.commitPrepared(await draft(store, "Newer than failed clear"));
    s.removeFail(false);
    await store.retryPersist();
    assert.equal(
      JSON.parse(s.values.get(key)).draft.form.fields.alias,
      "Newer than failed clear",
    );
    assert.equal(store.snapshot().unsaved, false);
  },
);
await check(
  "clear and undo share exact disk guard, so a foreign newer graph survives",
  async () => {
    const s = storage(),
      store = await open(s, locks());
    await store.commitPrepared(await draft(store, "First"));
    await store.commitPrepared(await draft(store, "Second"));
    const raw = m.canonicalProgramGraphJson(blank());
    s.values.set(key, raw);
    await assert.rejects(store.undo(), codes("external_change"));
    assert.equal(s.values.get(key), raw);
    assert.equal(store.snapshot().state.draft.form.fields.alias, "Second");
  },
);
await check(
  "safe reload requires explicit dirty discard and clears obsolete undo",
  async () => {
    const s = storage(),
      store = await open(s, locks());
    await store.commitPrepared(await draft(store, "Saved"));
    s.writeFail(true);
    await store.commitPrepared(await draft(store, "Dirty current"));
    await assert.rejects(store.reload(), codes("discard_required"));
    await store.reload({ discardUnsaved: true });
    assert.equal(store.snapshot().state.draft.form.fields.alias, "Saved");
    assert.equal(store.snapshot().canUndo, false);
  },
);
await check(
  "queued confirmed reload cannot discard a command queued ahead of it",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l);
    let release, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const blocker = l.request(key, { mode: "exclusive" }, async () => {
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
    });
    await started;
    const prepared = await draft(store, "New work ahead of reload");
    const write = store.commitPrepared(prepared);
    const reload = store.reload({ discardUnsaved: true });
    const outcomes = Promise.allSettled([write, reload]);
    release();
    await blocker;
    const results = await outcomes;
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    assert.equal(results[1].reason.code, "stale_memory");
    assert.equal(
      store.snapshot().state.draft.form.fields.alias,
      "New work ahead of reload",
    );
  },
);
await check(
  "changing a queued reload flag cannot grant permission to discard dirty work",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l);
    await store.commitPrepared(await draft(store, "Saved A"));
    s.writeFail(true);
    await store.commitPrepared(await draft(store, "Unsaved B"));
    const before = store.snapshot().hash;
    let release, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const blocker = l.request(key, { mode: "exclusive" }, async () => {
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
    });
    await started;
    const options = { discardUnsaved: false };
    const reloading = store.reload(options);
    const outcome = Promise.allSettled([reloading]);
    options.discardUnsaved = true;
    release();
    await blocker;
    const [result] = await outcome;
    assert.equal(result.status, "rejected");
    assert.equal(result.reason.code, "discard_required");
    assert.equal(store.snapshot().hash, before);
    assert.equal(store.snapshot().unsaved, true);
    assert.equal(store.snapshot().state.draft.form.fields.alias, "Unsaved B");
  },
);
await check(
  "unsupported locks allow validated read/export; missing hashing retains protected raw bytes",
  async () => {
    for (const extra of [{ locks: null }, { cryptoAvailable: false }]) {
      const s = storage(),
        initial = blank();
      s.values.set(key, m.canonicalProgramGraphJson(initial));
      const store = await open(s, locks(), initial, extra);
      assert.equal(store.snapshot().code, "unsupported");
      assert.equal(store.snapshot().canWrite, false);
      if (extra.cryptoAvailable === false) {
        assert.equal(store.snapshot().state, null);
        assert.equal(
          store.rawSavedCopy(),
          m.canonicalProgramGraphJson(initial),
        );
        await assert.rejects(store.backup(at), codes("backup_unavailable"));
      } else {
        assert.deepEqual(
          await m.parseProgramGraphBackup(await store.backup(at)),
          initial,
        );
      }
      const writable = await open(storage(), locks(), initial);
      const prepared = await draft(writable, "Refused");
      await assert.rejects(
        store.commitPrepared(prepared),
        codes("unsupported"),
      );
      assert.equal(s.values.get(key), m.canonicalProgramGraphJson(initial));
    }
  },
);
await check(
  "the storage bound rejects oversize raw state and backup without rewriting protected bytes",
  async () => {
    const s = storage(),
      raw = " ".repeat(2097153);
    s.values.set(key, raw);
    const store = await open(s, locks());
    assert.equal(store.snapshot().code, "corrupt");
    assert.equal(store.rawSavedCopy(), raw);
    await assert.rejects(store.previewRestore(raw));
    assert.equal(s.values.get(key), raw);
  },
);
await check(
  "an exact 2 MiB complete graph survives actual save/load/restore and +1 is refused",
  async () => {
    const boundary = await exactBoundaryState(m);
    const initial = boundary.state ?? boundary;
    const backup = await m.makeProgramGraphBackup(initial, at);
    assert.equal(Buffer.byteLength(backup), 2097152);
    const s = storage();
    s.values.set(key, m.canonicalProgramGraphJson(initial));
    const store = await open(s, locks(), initial);
    assert.equal(store.snapshot().code, "ready");
    assert.equal(Buffer.byteLength(await store.backup(at)), 2097152);
    const preview = await store.previewRestore(backup);
    await store.restore(preview);
    assert.deepEqual(store.snapshot().state, initial);
    const before = store.snapshot().hash,
      saved = s.values.get(key);
    const wrapper = JSON.parse(backup);
    wrapper.state.draft.form.fields.alias += "x";
    delete wrapper.checksum;
    wrapper.checksum = await m.hashProgramGraphValue(wrapper);
    const oversized = JSON.stringify(wrapper, null, 2) + "\n";
    assert.equal(Buffer.byteLength(oversized), 2097153);
    await assert.rejects(store.previewRestore(oversized));
    assert.equal(store.snapshot().hash, before);
    assert.equal(s.values.get(key), saved);
  },
);
await check(
  "actual new store and model compile with strict TypeScript",
  async () => {
    const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile),
      parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        process.cwd(),
      );
    const roots = [
      "src/lib/client/program-graph-model.ts",
      "src/lib/client/program-graph-import.ts",
      "src/lib/client/program-graph-store.ts",
      "src/data/program-graph-adapters.ts",
    ].map((f) => path.resolve(f));
    const program = ts.createProgram(roots, {
      ...parsed.options,
      strict: true,
      noEmit: true,
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      diagnostics
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
        .join("\n"),
    );
  },
);
console.log(
  `Program graph storage: ${count} actual-key groups passed; no original source key read/write or real shared authority.`,
);
