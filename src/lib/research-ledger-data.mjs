// Read-only inert data admission. Importing this module performs no file reads.
// Git capture, network access and writes do not belong in this loader.
import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEDGER_LIMITS } from "./research-ledger-canonical.mjs";

export const LEDGER_GROUPS = Object.freeze([
  "records",
  "versions",
  "events",
  "reviews",
  "actors",
  "observations",
  "editions",
  "sources",
]);
export const DATA_ROOT = join(
  fileURLToPath(new URL("..", import.meta.url)),
  "data/research-ledger",
);
export function readLedgerJson(path) {
  const info = lstatSync(path);
  assert.ok(
    info.isFile() &&
      !info.isSymbolicLink() &&
      info.size <= LEDGER_LIMITS.exportBytes,
    "Use a bounded regular JSON input file",
  );
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path)),
  );
}
export function readLedgerInput(dataRoot = DATA_ROOT) {
  const rootInfo = lstatSync(dataRoot);
  assert.ok(
    rootInfo.isDirectory() && !rootInfo.isSymbolicLink(),
    "Use a regular ledger data directory",
  );
  const known = new Set(["manifest.json", ...LEDGER_GROUPS]);
  for (const name of readdirSync(dataRoot))
    assert.ok(known.has(name), `Unknown ledger input path: ${name}`);
  const input = { manifest: readLedgerJson(join(dataRoot, "manifest.json")) };
  for (const key of LEDGER_GROUPS) {
    const dir = join(dataRoot, key);
    // Git does not retain empty directories. Required object closure belongs to
    // the model validator; a missing zero-cardinality group is simply empty.
    if (!existsSync(dir)) {
      input[key] = [];
      continue;
    }
    const info = lstatSync(dir);
    assert.ok(
      info.isDirectory() && !info.isSymbolicLink(),
      `Use a regular ${key} data directory`,
    );
    const files = readdirSync(dir).sort();
    assert.ok(
      files.length <= LEDGER_LIMITS[key],
      `Too many ${key} input files`,
    );
    for (const name of files)
      assert.match(
        name,
        /^[a-z0-9-]+\.json$/,
        `Unknown ${key} input file: ${name}`,
      );
    input[key] = files.map((name) => readLedgerJson(join(dir, name)));
    input[key].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return input;
}
