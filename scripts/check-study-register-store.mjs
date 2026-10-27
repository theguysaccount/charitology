// Actual register model/store, synthetic private data and injected local browser capabilities only.
import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import ts from "typescript";
import { exactBoundaryState } from "../test-fixtures/study-register/factory.mjs";

const bundled = await build({
  stdin: {
    contents: `export * from './src/lib/client/study-register-store.ts'; export * from './src/lib/client/study-register-model.ts'; export * from './src/lib/client/study-register-import.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const at = "2026-10-26T12:00:00.000Z";
const key = "charitology.study-register.v1";
let groups = 0,
  sequence = 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const blank = () => m.blankStudyState("synthetic-register-" + ++sequence, at);
async function check(name, fn) {
  try {
    await fn();
    groups++;
    console.log(`  ✓ ${name}`);
  } catch (cause) {
    cause.message = `${name}: ${cause.message}`;
    throw cause;
  }
}
const rejected =
  (...codes) =>
  (cause) =>
    codes.includes(cause.code);
function storage() {
  const values = new Map(),
    touched = [];
  let unreadable = false,
    quota = false,
    removalsFail = false;
  return {
    values,
    touched,
    setUnreadable: (value) => {
      unreadable = value;
    },
    setQuota: (value) => {
      quota = value;
    },
    setRemoveFailure: (value) => {
      removalsFail = value;
    },
    getItem(name) {
      touched.push(["get", name]);
      if (unreadable) throw Error("synthetic read failure");
      return values.get(name) ?? null;
    },
    setItem(name, value) {
      touched.push(["set", name]);
      if (quota) throw Error("synthetic quota failure");
      values.set(name, value);
    },
    removeItem(name) {
      touched.push(["remove", name]);
      if (removalsFail) throw Error("synthetic remove failure");
      values.delete(name);
    },
  };
}
function locks() {
  let tail = Promise.resolve(),
    active = 0,
    maximum = 0;
  const calls = [];
  return {
    calls,
    maximum: () => maximum,
    request(name, options, fn) {
      assert.equal(name, key);
      assert.deepEqual(options, { mode: "exclusive" });
      calls.push(name);
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
  m.createStudyRegisterStore({ storage: s, locks: l, initialState, ...extra });
async function draft(store, title, extra = {}) {
  const snap = store.snapshot();
  assert.ok(snap.state);
  assert.ok(snap.hash);
  return m.prepareStudyCommand(
    snap.state,
    {
      kind: "draft.replace",
      draft: {
        ...snap.state.draft,
        tab: "protocol",
        form: { kind: "protocol", targetId: null, fields: { title, ...extra } },
        dirty: true,
      },
    },
    {
      expectedStateHash: snap.hash,
      at: "2026-10-26T12:00:01.000Z",
      makeId: () => "synthetic-id-" + ++sequence,
    },
  );
}

await check(
  "actual final key is isolated; initialization and readable snapshots never auto-save",
  async () => {
    assert.equal(m.STUDY_STORAGE_KEY, key);
    assert.equal(m.STUDY_LOCK_NAME, key);
    const s = storage(),
      l = locks();
    s.values.set("charitology.research.v1", "protected legacy bytes");
    s.values.set("unrelated", "also protected");
    const store = await open(s, l),
      snap = store.snapshot();
    assert.equal(snap.canWrite, true);
    assert.equal(snap.unsaved, false);
    assert.equal(s.values.has(key), false);
    assert.ok(Object.isFrozen(snap.state));
    assert.ok(Object.isFrozen(snap.state.draft));
    assert.deepEqual(
      await m.parseStudyBackup(await store.backup(at)),
      snap.state,
    );
    assert.ok(s.touched.every(([, name]) => name === key));
    assert.equal(
      s.values.get("charitology.research.v1"),
      "protected legacy bytes",
    );
    assert.equal(s.values.get("unrelated"), "also protected");
  },
);

await check(
  "simultaneous lock contenders serialize; stale prepared edit cannot replace the winner",
  async () => {
    const s = storage(),
      l = locks(),
      initial = blank();
    s.values.set(key, m.canonicalStudyJson(initial));
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
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.filter(
        (x) => x.status === "rejected" && x.reason.code === "external_change",
      ).length,
      1,
    );
    assert.equal(
      JSON.parse(s.values.get(key)).draft.form.fields.title,
      "Writer A",
    );
    assert.equal(l.maximum(), 1);
    assert.equal(b.snapshot().state.draft.form, null);
    assert.equal(b.snapshot().readOnly, true);
    const after = s.values.get(key);
    await assert.rejects(b.commitPrepared(pb), rejected("external_change"));
    await assert.rejects(b.undo(), rejected("external_change"));
    assert.equal(s.values.get(key), after);
  },
);

await check(
  "quota failure retains valid dirty current work; retry persists the same revision and never replays",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      p = await draft(store, "Unfinished title", {
        question: "incomplete raw input",
      });
    s.setQuota(true);
    const failed = await store.commitPrepared(p);
    assert.equal(failed.unsaved, true);
    assert.equal(failed.code, "persist_failed");
    assert.equal(failed.canWrite, true);
    assert.equal(failed.canRetryPersist, true);
    assert.equal(failed.hash, p.nextStateHash);
    assert.equal(s.values.has(key), false);
    assert.deepEqual(
      await m.parseStudyBackup(await store.backup(at)),
      p.nextState,
    );
    const revision = failed.state.revision;
    await store.retryPersist();
    assert.equal(store.snapshot().state.revision, revision);
    assert.equal(store.snapshot().unsaved, true);
    const next = await draft(store, "Newer memory draft");
    await store.commitPrepared(next);
    assert.equal(store.snapshot().state.revision, revision + 1);
    assert.equal(s.values.has(key), false);
    s.setQuota(false);
    await store.retryPersist();
    assert.equal(store.snapshot().unsaved, false);
    assert.equal(store.snapshot().state.revision, revision + 1);
    assert.equal(
      JSON.parse(s.values.get(key)).draft.form.fields.title,
      "Newer memory draft",
    );
    assert.equal((await store.retryPersist()).state.revision, revision + 1);
  },
);

await check(
  "changed disk blocks retry while retaining the unsaved valid current candidate and backup",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      p = await draft(store, "Keep this memory");
    s.setQuota(true);
    await store.commitPrepared(p);
    s.setQuota(false);
    const other = blank();
    s.values.set(key, m.canonicalStudyJson(other));
    await assert.rejects(store.retryPersist(), rejected("external_change"));
    assert.equal(store.snapshot().hash, p.nextStateHash);
    assert.equal(store.snapshot().unsaved, true);
    assert.deepEqual(
      await m.parseStudyBackup(await store.backup(at)),
      p.nextState,
    );
    assert.deepEqual(JSON.parse(s.values.get(key)), other);
  },
);

await check(
  "invalid prepared data/hash/oversized draft fails before memory assignment or saved writes",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      before = store.snapshot(),
      p = await draft(store, "Valid");
    for (const bad of [
      { ...clone(p), nextStateHash: "f".repeat(64) },
      {
        ...clone(p),
        nextState: { ...clone(p.nextState), unexpected: "not accepted" },
      },
      {
        ...clone(p),
        nextState: {
          ...clone(p.nextState),
          draft: {
            ...clone(p.nextState.draft),
            form: {
              kind: "protocol",
              targetId: null,
              fields: { title: "é".repeat(9000) },
            },
          },
        },
      },
      { ...clone(p), noOp: true },
    ]) {
      await assert.rejects(store.commitPrepared(bad));
      assert.equal(store.snapshot().hash, before.hash);
      assert.equal(store.snapshot().generation, before.generation);
      assert.equal(s.values.has(key), false);
    }
  },
);

await check(
  "restore is a validated preview, refuses late memory/disk changes and never trusts a foreign preview",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      backup = await m.makeStudyBackup(blank(), at);
    const preview = await store.previewRestore(backup);
    assert.equal(s.values.has(key), false);
    await store.commitPrepared(await draft(store, "Changed after preview"));
    await assert.rejects(
      store.restore(preview),
      rejected("preview_required", "stale_memory"),
    );
    const preview2 = await store.previewRestore(backup),
      saved = m.canonicalStudyJson(blank());
    s.values.set(key, saved);
    await assert.rejects(store.restore(preview2), rejected("external_change"));
    assert.equal(s.values.get(key), saved);
    const foreign = await open(s, l);
    const theirPreview = await foreign.previewRestore(backup);
    await assert.rejects(
      store.restore(theirPreview),
      rejected("preview_required"),
    );
  },
);

await check(
  "foreign writes before a restore or clear preview require visible conflict and a second explicit recovery review",
  async () => {
    for (const kind of ["restore", "clear"]) {
      const s = storage(),
        l = locks(),
        initial = blank();
      s.values.set(key, m.canonicalStudyJson(initial));
      const store = await open(s, l, initial),
        before = store.snapshot();
      const newer = blank(),
        raw = m.canonicalStudyJson(newer);
      s.values.set(key, raw);
      const replacement = blank(),
        backup = await m.makeStudyBackup(replacement, at);
      const preview = () =>
        kind === "restore"
          ? store.previewRestore(backup)
          : store.previewClear(replacement);
      await assert.rejects(preview, rejected("external_change"));
      assert.equal(store.snapshot().code, "external_change");
      assert.equal(store.snapshot().hash, before.hash);
      assert.equal(store.rawSavedCopy(), raw);
      assert.equal(s.values.get(key), raw);
      const acknowledged = await preview();
      if (kind === "restore") {
        await store.restore(acknowledged);
        assert.deepEqual(JSON.parse(s.values.get(key)), replacement);
      } else {
        await store.clear(acknowledged);
        assert.equal(s.values.has(key), false);
      }
      assert.equal(
        store.rawSavedCopy(),
        raw,
        "the deliberately replaced newer bytes remain exportable",
      );
    }
  },
);

await check(
  "an actual prepared citation import and a real undo cannot overwrite another tab's later saved version",
  async () => {
    const s = storage(),
      l = locks(),
      initial = blank();
    s.values.set(key, m.canonicalStudyJson(initial));
    const a = await open(s, l, initial),
      b = await open(s, l, initial),
      bs = b.snapshot();
    const preview = await m.previewCitationImport(
      bs.state,
      {
        kind: "citation-csv",
        bytes: new TextEncoder().encode("title\nSynthetic citation\n"),
        fileName: "synthetic.csv",
        columnMap: { title: 0 },
        searchRunId: null,
        provenanceNote: null,
      },
      bs.hash,
    );
    const prepared = await m.prepareStudyCommand(
      bs.state,
      {
        kind: "import.commit",
        preview,
        assignments: m.defaultImportAssignments(preview),
        reason: "Synthetic reviewed assignment.",
      },
      { expectedStateHash: bs.hash, at, makeId: () => "import-" + ++sequence },
    );
    await a.commitPrepared(await draft(a, "First saved writer"));
    await assert.rejects(
      b.commitPrepared(prepared),
      rejected("external_change"),
    );
    assert.equal(b.snapshot().state.reports.length, 0);
    await b.reload({ discardUnsaved: true });
    await b.commitPrepared(await draft(b, "Second saved writer"));
    const saved = s.values.get(key);
    await assert.rejects(a.undo(), rejected("external_change"));
    assert.equal(s.values.get(key), saved);
    assert.equal(
      a.snapshot().state.draft.form.fields.title,
      "First saved writer",
    );
  },
);

await check(
  "a late asynchronous backup parse cannot create a replacement preview after a storage event",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l),
      raw = await m.makeStudyBackup(blank(), at);
    const pending = store.previewRestore(raw);
    store.noticeExternalChange();
    await assert.rejects(pending, rejected("stale_memory"));
    assert.equal(s.values.has(key), false);
    assert.equal(store.snapshot().code, "external_change");
  },
);

await check(
  "corrupt bytes stay downloadable; explicit preview replacement is guarded and preserves recovery bytes",
  async () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ version: 1, missing: "graph" }),
    ]) {
      const s = storage(),
        l = locks();
      s.values.set(key, raw);
      const store = await open(s, l);
      assert.equal(store.snapshot().code, "corrupt");
      assert.equal(store.snapshot().canWrite, false);
      assert.equal(store.rawSavedCopy(), raw);
      await assert.rejects(
        store.commitPrepared(
          await draft(store, "Cannot replace protected data"),
        ),
        rejected("corrupt"),
      );
      assert.equal(s.values.get(key), raw);
      const next = blank(),
        preview = await store.previewRestore(await m.makeStudyBackup(next, at));
      const restored = await store.restore(preview);
      assert.deepEqual(restored.state, next);
      assert.equal(restored.canWrite, true);
      assert.equal(store.rawSavedCopy(), raw);
      assert.deepEqual(JSON.parse(s.values.get(key)), next);
    }
  },
);

await check(
  "read errors never overwrite, explicit safe reload clears undo, and dirty/unsaved discard is deliberate",
  async () => {
    const s = storage(),
      l = locks(),
      first = blank();
    s.values.set(key, m.canonicalStudyJson(first));
    s.setUnreadable(true);
    const store = await open(s, l);
    assert.equal(store.snapshot().code, "read_error");
    assert.equal(store.snapshot().observedRaw, undefined);
    assert.ok(store.snapshot().state);
    assert.ok(await store.backup(at));
    await assert.rejects(store.retryPersist(), rejected("read_error"));
    assert.deepEqual(JSON.parse(s.values.get(key)), first);
    s.setUnreadable(false);
    await store.reload();
    await store.commitPrepared(await draft(store, "Before external reload"));
    assert.equal(store.snapshot().canUndo, true);
    await assert.rejects(store.reload(), rejected("discard_required"));
    const next = blank();
    s.values.set(key, m.canonicalStudyJson(next));
    store.noticeExternalChange();
    await store.reload({ discardUnsaved: true });
    assert.deepEqual(store.snapshot().state, next);
    assert.equal(store.snapshot().canUndo, false);
    await assert.rejects(store.undo(), rejected("undo_unavailable"));
  },
);

await check(
  "reload confirmation cannot discard a newer command queued ahead of its lock",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l);
    const prepared = await draft(store, "Queued before reload");
    const saving = store.commitPrepared(prepared);
    const reloading = store.reload({ discardUnsaved: true });
    await saving;
    await assert.rejects(reloading, rejected("stale_memory"));
    assert.equal(store.snapshot().hash, prepared.nextStateHash);
    assert.equal(store.snapshot().canUndo, true);
  },
);

await check(
  "clear and undo use the same guard; failed clear retries removal without touching other keys",
  async () => {
    const s = storage(),
      l = locks(),
      store = await open(s, l);
    s.values.set("another-key", "keep");
    await store.commitPrepared(await draft(store, "Saved"));
    const before = store.snapshot().state;
    const empty = blank(),
      preview = await store.previewClear(empty);
    s.setRemoveFailure(true);
    await store.clear(preview);
    assert.equal(store.snapshot().unsaved, true);
    assert.deepEqual(store.snapshot().state, empty);
    assert.equal(s.values.has(key), true);
    s.setRemoveFailure(false);
    await store.retryPersist();
    assert.equal(s.values.has(key), false);
    assert.equal(store.snapshot().unsaved, false);
    await store.undo();
    assert.deepEqual(store.snapshot().state, before);
    assert.equal(s.values.get("another-key"), "keep");
    const preview2 = await store.previewClear(blank());
    s.values.set(key, m.canonicalStudyJson(blank()));
    await assert.rejects(store.clear(preview2), rejected("external_change"));
  },
);

await check(
  "storage notice, unsupported locks/hash and denied lock capability never fall back to optimistic writes",
  async () => {
    const s = storage(),
      l = locks(),
      initial = blank();
    s.values.set(key, m.canonicalStudyJson(initial));
    const store = await open(s, l, initial);
    const p = await draft(store, "Late");
    store.noticeExternalChange();
    await assert.rejects(store.commitPrepared(p), rejected("external_change"));
    for (const extra of [
      { locks: null },
      { cryptoAvailable: false },
      {
        locks: {
          request: async () => {
            throw Error("denied");
          },
        },
      },
    ]) {
      const readonly = await open(s, l, initial, extra),
        before = s.values.get(key);
      assert.equal(readonly.snapshot().readOnly, true);
      assert.equal(readonly.snapshot().canWrite, false);
      await assert.rejects(readonly.retryPersist(), rejected("unsupported"));
      await assert.rejects(
        readonly.previewRestore(await m.makeStudyBackup(initial, at)),
        rejected("unsupported"),
      );
      assert.equal(s.values.get(key), before);
      assert.equal(readonly.rawSavedCopy(), before);
    }
  },
);

await check(
  "exact 2 MiB backup restores/persists/exports; one-byte candidate or restore is refused before assignment",
  async () => {
    const exact = await exactBoundaryState(m);
    const raw = await m.makeStudyBackup(exact, at);
    assert.equal(new TextEncoder().encode(raw).byteLength, 2_097_152);
    const s = storage(),
      l = locks(),
      store = await open(s, l);
    await store.restore(await store.previewRestore(raw));
    assert.deepEqual(store.snapshot().state, exact);
    assert.equal(
      new TextEncoder().encode(await store.backup(at)).byteLength,
      2_097_152,
    );
    assert.equal(
      store.snapshot().state,
      store.snapshot().state,
      "immutable snapshots do not repeatedly copy the large graph",
    );
    const before = store.snapshot(),
      saved = s.values.get(key),
      tooLarge = clone(exact);
    tooLarge.draft.form.fields.title += "x";
    tooLarge.revision++;
    const candidate = {
      format: "charitology-study-mutation",
      version: 1,
      expectedStateHash: before.hash,
      expectedRevision: before.state.revision,
      nextStateHash: await m.studyStateHash(tooLarge),
      nextState: tooLarge,
      commandHash: "f".repeat(64),
      noOp: false,
      summary: {
        kind: "draft.replace",
        message: "Synthetic oversize",
        counts: null,
      },
    };
    await assert.rejects(
      store.commitPrepared(candidate),
      rejected("backup_limit"),
    );
    assert.equal(store.snapshot().hash, before.hash);
    assert.equal(store.snapshot().generation, before.generation);
    assert.equal(s.values.get(key), saved);
    const envelope = JSON.parse(raw);
    envelope.workspace.draft.form.fields.title += "x";
    envelope.checksum = await m.hashStudyValue({
      format: envelope.format,
      version: envelope.version,
      workspace: envelope.workspace,
    });
    const oversizedRaw = JSON.stringify(envelope, null, 2);
    assert.equal(new TextEncoder().encode(oversizedRaw).byteLength, 2_097_153);
    await assert.rejects(
      store.previewRestore(oversizedRaw),
      rejected("backup_limit"),
    );
    assert.equal(store.snapshot().hash, before.hash);
    assert.equal(s.values.get(key), saved);
  },
);

await check(
  "actual new store and final model pass strict TypeScript",
  async () => {
    const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile),
      parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        process.cwd(),
      );
    const program = ts.createProgram(
      [
        path.resolve("src/lib/client/study-register-store.ts"),
        path.resolve("node_modules/astro/client.d.ts"),
      ],
      {
        ...parsed.options,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        noEmit: true,
      },
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      diagnostics
        .map(
          (d) =>
            `${d.file?.fileName ?? ""} ${d.start == null ? "" : d.file.getLineAndCharacterOfPosition(d.start).line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        )
        .join("\n"),
    );
  },
);
console.log(
  `✓ Study register storage: ${groups} groups passed (actual final key, exclusive contenders, memory/saved-byte separation, recovery and strict types).`,
);
