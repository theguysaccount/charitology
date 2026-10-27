// Synthetic isolated browser storage and queued Web Locks for actual store checks.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
export const at = "2026-10-27T12:00:00.000Z";
export async function actual() {
  const result = await build({
    stdin: {
      contents:
        "export * from './src/lib/client/publication-editions-model.ts';export * from './src/lib/client/publication-editions-store.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const dir = mkdtempSync(join(tmpdir(), "charitology-publication-proposal-")),
    file = join(dir, "actual.mjs");
  writeFileSync(file, result.outputFiles[0].text);
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return import(pathToFileURL(file));
}
export const codes =
  (...expected) =>
  (e) =>
    expected.includes(e.code);
export function storage() {
  const values = new Map(),
    touched = [];
  let badRead = false,
    badWrite = false,
    badRemove = false;
  return {
    values,
    touched,
    readFail: (v) => (badRead = v),
    writeFail: (v) => (badWrite = v),
    removeFail: (v) => (badRemove = v),
    getItem(k) {
      touched.push(["get", k]);
      if (badRead) throw Error("Synthetic read denial");
      return values.get(k) ?? null;
    },
    setItem(k, v) {
      touched.push(["set", k]);
      if (badWrite) throw Error("Synthetic quota");
      values.set(k, v);
    },
    removeItem(k) {
      touched.push(["remove", k]);
      if (badRemove) throw Error("Synthetic remove denial");
      values.delete(k);
    },
  };
}
export function locks() {
  const tails = new Map(),
    active = new Map(),
    calls = [];
  let max = 0;
  return {
    calls,
    maximum: () => max,
    request(name, options, run) {
      assert.deepEqual(options, { mode: "exclusive" });
      calls.push(name);
      const next = (tails.get(name) ?? Promise.resolve()).then(async () => {
        assert.equal(active.get(name) ?? 0, 0, "No same-key lock reentry");
        active.set(name, 1);
        max = Math.max(
          max,
          [...active.values()].reduce((a, b) => a + b, 0),
        );
        try {
          return await run();
        } finally {
          active.set(name, 0);
        }
      });
      tails.set(
        name,
        next.catch(() => {}),
      );
      return next;
    },
  };
}
export async function hold(l, key) {
  let release, start;
  const entered = new Promise((r) => (start = r));
  const done = l.request(key, { mode: "exclusive" }, async () => {
    start();
    await new Promise((r) => (release = r));
  });
  await entered;
  return { release, done };
}
export function gateDigest() {
  let pending = null,
    entered = null;
  return {
    pause() {
      let release;
      const wait = new Promise((r) => (release = r)),
        started = new Promise((r) => (entered = r));
      pending = wait;
      return { started, release };
    },
    async digest(bytes) {
      if (pending) {
        const wait = pending;
        pending = null;
        entered();
        await wait;
      }
      return createHash("sha256").update(bytes).digest("hex");
    },
  };
}
export const binding = (s) => ({
  expectedGeneration: s.generation,
  expectedStateHash: s.hash,
});
let sequence = 0;
export const makeId = () => "synthetic-store-" + ++sequence;
export async function strict(files) {
  const ts = await import("typescript"),
    p = ts.default.createProgram(files, {
      strict: true,
      noEmit: true,
      target: ts.default.ScriptTarget.ES2022,
      module: ts.default.ModuleKind.ESNext,
      moduleResolution: ts.default.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    });
  const d = ts.default.getPreEmitDiagnostics(p);
  assert.equal(
    d.length,
    0,
    ts.default.formatDiagnosticsWithColorAndContext(d, {
      getCanonicalFileName: (x) => x,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
}
