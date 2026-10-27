// Fictional environments only; no browser, user, provider or production data.
import { build } from "esbuild";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";
export {
  storage,
  locks,
  hold,
  strict,
  codes,
} from "../donor-recovery/engine-harness.mjs";
export {
  digestGate,
  assertOnlyKey,
} from "../program-record-recovery/engine-harness.mjs";
export const STAMP = "2026-10-27T00:00:00.000Z";
export const KEY = "charitology-manuscript-v1";
export const clone = (v) => JSON.parse(JSON.stringify(v));
export async function bundle(contents, resolveDir = process.cwd()) {
  const r = await build({
    stdin: { contents, resolveDir, loader: "ts" },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    metafile: true,
    logLevel: "silent",
    define: {
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "charitology-rr-")),
    file = join(dir, "actual.mjs");
  writeFileSync(file, r.outputFiles[0].text);
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return {
    m: await import(pathToFileURL(file)),
    inputs: Object.keys(r.metafile.inputs),
  };
}
export async function actual() {
  return (
    await bundle(
      'export * from "./src/lib/client/remaining-record-recovery.ts";export * from "./src/lib/client/remaining-record-recovery-schemas.ts";export * from "./src/lib/client/remaining-record-recovery-formats.ts";',
    )
  ).m;
}
export async function producers() {
  const { m: old } = await bundle(
    'export * from "./src/lib/client/completion-models.ts";export {validateResearchState,fieldError} from "./src/lib/client/research-programs.ts";export {programWorkspaces,emptyWorkspace,sampleWorkspace,partnerBackup,parseWorkspace} from "./src/lib/client/partner-programs.ts";',
  );
  const cases = readdirSync("src/content/cases")
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((name) => ({
      id: name.slice(0, -3),
      ...load(
        readFileSync("src/content/cases/" + name, "utf8").match(
          /^---\n([\s\S]*?)\n---/,
        )[1],
      ),
    }));
  const research = {};
  for (const id of [
    "moral-frameworks-program",
    "methods-lab",
    "cause-census",
    "evidence-reviews",
    "replication-program",
    "failure-lab",
    "history-of-charity",
  ]) {
    const source = readFileSync(`src/components/programs/${id}.astro`, "utf8");
    let fm = source
      .match(/^---\n([\s\S]*?)\n---/)[1]
      .replace(/^import[^\n]+\.astro["'];\s*$/gm, "")
      .replace(
        /^import \{ researchProgramCatalog \} from [^\n]+;\s*$/gm,
        `async function researchProgramCatalog(){return ${JSON.stringify({ cases, interventions: [] })};}`,
      );
    const { m } = await bundle(
      fm + "\nexport {fields};",
      resolve("src/components/programs"),
    );
    research[id] = {
      id,
      fields: m.fields,
      freeze: /freeze=\{true\}/.test(source),
    };
  }
  return { old, research, cases };
}
export function researchValues(m, program, max = false) {
  const values = {};
  for (const f of m.RR_RESEARCH_SCHEMAS[program].fields)
    values[f.key] =
      f.kind === "select"
        ? f.options[0]
        : f.kind === "url"
          ? max
            ? "https://example.invalid/" + "x".repeat(f.maxLength - 24)
            : "https://example.invalid/fictional"
          : f.kind === "date"
            ? "2028-02-29"
            : f.kind === "number"
              ? String(f.min ?? 0)
              : max
                ? "x".repeat(f.maxLength)
                : "Fictional test";
  if ("first" in values)
    values.second = m.RR_RESEARCH_SCHEMAS[program].fields.find(
      (f) => f.key === "second",
    ).options[1];
  return values;
}
export function researchValue(
  m,
  program = "replication-program",
  count = 1,
  max = false,
) {
  return {
    version: 1,
    program,
    records: Array.from({ length: count }, (_, i) => ({
      id: "fictional-" + i,
      createdAt: STAMP,
      updatedAt: STAMP,
      values: researchValues(m, program, max),
    })),
    draft: {},
    editing: null,
  };
}
export function exactResearch(m, target = 32000000) {
  const v = researchValue(m, "replication-program", 200, true),
    slots = v.records.flatMap((r) =>
      m.RR_RESEARCH_SCHEMAS["replication-program"].fields
        .filter((f) => ["text", "textarea"].includes(f.kind))
        .map((f) => [r.values, f.key]),
    );
  let remaining = target - Buffer.byteLength(JSON.stringify(v, null, 2));
  if (remaining < 0) throw Error("Target below baseline");
  for (const [obj, key] of slots) {
    if (!remaining) break;
    const n = Math.min(obj[key].length, Math.floor(remaining / 5));
    obj[key] = "\u0001".repeat(n) + obj[key].slice(n);
    remaining -= n * 5;
    if (remaining > 0 && remaining < 5 && n < obj[key].length) {
      obj[key] =
        obj[key].slice(0, n) +
        '"'.repeat(remaining) +
        obj[key].slice(n + remaining);
      remaining = 0;
    }
  }
  if (remaining || Buffer.byteLength(JSON.stringify(v, null, 2)) !== target)
    throw Error("Unreachable exact research target");
  return v;
}
export function maximalCountry(m) {
  return Object.fromEntries(
    m.RR_COUNTRY_CODES.map((c) => [
      c,
      {
        voices: "\u0001".repeat(10000),
        institutions: "\u0001".repeat(10000),
        gaps: "\u0001".repeat(10000),
      },
    ]),
  );
}
export function maximalManuscript(m) {
  return Object.fromEntries(
    m.RR_MANUSCRIPT_FIELDS.map((f, i) => [
      f,
      f === "kind"
        ? "Proposed method"
        : "\u0001".repeat(m.RR_MANUSCRIPT_LIMITS[i]),
    ]),
  );
}
export function maximalNominations(m) {
  return Array.from({ length: 100 }, (_, i) => ({
    id: String(i).padStart(3, "0") + "\u0001".repeat(96),
    ...Object.fromEntries(
      m.RR_NOMINATION_FIELDS.map((f, j) => [
        f,
        f === "depth"
          ? "Multiple levels; explain below"
          : "\u0001".repeat(m.RR_NOMINATION_LIMITS[j]),
      ]),
    ),
  }));
}
export function maximalDepth() {
  return {
    currency: "USD",
    rows: Array.from({ length: 1000 }, (_, i) => ({
      id: String(i).padStart(3, "0") + "\u0001".repeat(96),
      activity: "\u0001".repeat(200),
      amount: 1e9,
      depth: "unknown",
      source: "\u0001".repeat(5000),
    })),
  };
}
export function exactPartner(m, target = 8000000, updated = STAMP) {
  const key = "charitology.partner-workspace-v1.the-charitology-fund",
    spec = m.remainingRecordPartnerSchema(key),
    v = clone(m.defaultRemainingRecordValue(key)),
    slots = [];
  v.updated = updated;
  for (const c of spec.collections.slice(0, 2)) {
    v.records[c.key] = Array.from({ length: 250 }, (_, i) => ({
      id: c.key + "-" + i,
      values: Object.fromEntries(
        c.fields.map((f) => [
          f.key,
          f.kind === "select"
            ? f.options[0]
            : f.kind === "number"
              ? String(f.min ?? 0)
              : f.kind === "date"
                ? "2028-02-29"
                : f.kind === "url"
                  ? "https://example.invalid/fictional"
                  : "x",
        ]),
      ),
    }));
    for (const r of v.records[c.key])
      for (const f of c.fields)
        if (["text", "textarea"].includes(f.kind))
          slots.push([r.values, f.key, f.maxLength]);
  }
  let left = target - Buffer.byteLength(JSON.stringify(v, null, 2));
  for (const [obj, key, max] of slots) {
    if (!left) break;
    const add = Math.min(max - obj[key].length, left);
    obj[key] += "x".repeat(add);
    left -= add;
  }
  for (const [obj, key] of slots) {
    if (!left) break;
    const n = Math.min(obj[key].length, Math.floor(left / 5));
    obj[key] = "\u0001".repeat(n) + obj[key].slice(n);
    left -= n * 5;
    if (left > 0 && left < 5 && n + left <= obj[key].length) {
      obj[key] =
        obj[key].slice(0, n) + '\"'.repeat(left) + obj[key].slice(n + left);
      left = 0;
    }
  }
  if (left) throw Error("Unreachable partner boundary " + left);
  return v;
}

export async function withEnvironment({ s, l, d, secure = true }, fn) {
  const previous = new Map();
  for (const [name, value] of Object.entries({
    localStorage: s,
    navigator: { locks: l },
    crypto: d
      ? {
          subtle: {
            digest:
              typeof d.digest === "function" ? d.digest.bind(d) : undefined,
          },
        }
      : undefined,
    isSecureContext: secure,
  })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  try {
    return await fn();
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
