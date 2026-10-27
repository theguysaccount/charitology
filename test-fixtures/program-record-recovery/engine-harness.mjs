// Excluded synthetic browser boundary. No real browser keys, clocks or providers.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash } from "node:crypto";
export {
  storage,
  locks,
  hold,
  strict,
  codes,
} from "../donor-recovery/engine-harness.mjs";
export const at = "2026-10-27T12:00:00.000Z";
export const later = "2026-10-27T13:00:00.000Z";
export const KEY = "charitology.program-workspace-v1.university-chapters";
export const OS = "charitology.charity-os";
export async function actual() {
  const result = await build({
    stdin: {
      contents:
        'export * from "./src/lib/client/program-record-recovery.ts";export * from "./src/lib/client/program-record-recovery-schemas.ts";export * from "./src/lib/client/program-record-recovery-formats.ts";export {sampleWorkspace} from "./src/lib/client/program-workspaces.ts";export {programWorkspaces} from "./src/data/program-workspaces.ts";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
export function digestGate() {
  let gate = null;
  const calls = [];
  return {
    calls,
    pause() {
      let release, start;
      const wait = new Promise((r) => (release = r)),
        started = new Promise((r) => (start = r));
      gate = { wait, start };
      return { release, started };
    },
    async digest(_algorithm, bytes) {
      calls.push(bytes.byteLength);
      const owned = Uint8Array.from(bytes);
      if (gate) {
        const g = gate;
        gate = null;
        g.start();
        await g.wait;
      }
      const b = createHash("sha256").update(owned).digest();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
  };
}
export async function withEnvironment(
  { s, l, d = digestGate(), secure = true },
  fn,
) {
  const descriptors = new Map();
  for (const [name, value] of Object.entries({
    localStorage: s,
    navigator: { locks: l },
    crypto: { subtle: { digest: d.digest.bind(d) } },
    isSecureContext: secure,
  })) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  try {
    return await fn();
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
export function model(m, key = KEY, name = "Fictional name") {
  const value = clone(m.defaultProgramRecordValue(key));
  if (key === OS) value.organization = name;
  else value.context.name = name;
  return value;
}
export function native(m, key, value, stamp = at) {
  return key === OS
    ? { format: OS, version: 1, exportedAt: stamp, workspace: value }
    : { ...value, updated: stamp };
}
export function assertOnlyKey(s, l, key) {
  assert.ok(s.touched.every(([, k]) => k === key));
  assert.ok(l.calls.every((k) => k === key));
}
