// Synthetic memory storage and cooperating Web Locks; never touches browser data.
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
        "export * from './src/lib/client/donor-recovery.ts';export * from './src/lib/client/donor-recovery-schemas.ts';export * from './src/lib/client/donor-recovery-formats.ts';export {createD1ReplacementQueue} from './src/lib/client/donor-recovery-cell.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const dir = mkdtempSync(join(tmpdir(), "charitology-d1-engine-")),
    file = join(dir, "actual.mjs");
  writeFileSync(file, result.outputFiles[0].text);
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return import(pathToFileURL(file));
}
export function storage() {
  const values = new Map(),
    touched = [];
  let badRead = false,
    badSet = false,
    badRemove = false,
    hook = null,
    readHook = null;
  return {
    values,
    touched,
    readFail: (v) => (badRead = v),
    writeFail: (v) => (badSet = v),
    removeFail: (v) => (badRemove = v),
    setHook: (v) => (hook = v),
    getHook: (v) => (readHook = v),
    getItem(k) {
      touched.push(["get", k]);
      if (readHook) readHook(k);
      if (badRead) throw Error("Synthetic read denial");
      return values.get(k) ?? null;
    },
    setItem(k, v) {
      touched.push(["set", k]);
      if (hook) hook(k, v);
      if (badSet) throw Error("Synthetic quota failure");
      values.set(k, v);
    },
    removeItem(k) {
      touched.push(["remove", k]);
      if (badRemove) throw Error("Synthetic removal failure");
      values.delete(k);
    },
  };
}
export function locks() {
  const tails = new Map(),
    active = new Set(),
    calls = [];
  return {
    calls,
    request(name, options, run) {
      assert.deepEqual(options, { mode: "exclusive" });
      calls.push(name);
      const result = (tails.get(name) ?? Promise.resolve()).then(async () => {
        assert.equal(
          active.has(name),
          false,
          "no nested same-key lock reacquisition",
        );
        active.add(name);
        try {
          return await run();
        } finally {
          active.delete(name);
        }
      });
      tails.set(
        name,
        result.catch(() => {}),
      );
      return result;
    },
  };
}
export async function hold(l, key) {
  let release, start;
  const entered = new Promise((r) => (start = r)),
    done = l.request(key, { mode: "exclusive" }, async () => {
      start();
      await new Promise((r) => (release = r));
    });
  await entered;
  return { release, done };
}
export function gateDigest() {
  let wait = null,
    start = null;
  return {
    pause() {
      let release;
      wait = new Promise((r) => (release = r));
      return { release, started: new Promise((r) => (start = r)) };
    },
    async digest(bytes) {
      if (wait) {
        const p = wait;
        wait = null;
        start();
        await p;
      }
      return createHash("sha256").update(bytes).digest("hex");
    },
  };
}
export async function strict(files) {
  const { default: ts } = await import("typescript"),
    p = ts.createProgram(files, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      types: [],
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true,
    });
  const d = ts.getPreEmitDiagnostics(p);
  assert.equal(
    d.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(d, {
      getCanonicalFileName: (x) => x,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
}
export const codes =
  (...c) =>
  (e) =>
    c.includes(e.code);
export const full = (k) => "charitology." + k;
export function proposal(m, id = "fictional-a") {
  const x = structuredClone(m.d1DefaultValue("grant-draft"));
  return {
    id,
    name: "Fictional proposal",
    scores: Object.fromEntries(m.D1_GRANT_DIMENSIONS.map((k) => [k, null])),
    notes: Object.fromEntries(m.D1_GRANT_DIMENSIONS.map((k) => [k, ""])),
  };
}
