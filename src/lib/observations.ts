// Build-only loader. Factual identity comes from the committed registry, never
// from file order, Git, a fresh network request or the build clock.
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
} from "node:fs";
import { resolve, join } from "node:path";
import {
  validateObservationFiles,
  observationProjection,
  legacyCountriesProjection,
} from "./observation-model.mjs";
import type {
  ObservationFiles,
  ObservationProjection,
} from "./observation-types";

const ROOT = resolve("src/data/observations");
// Whole history includes the registry. Full admission also enforces the exact
// inventory and each independent record, source, closure and export cap.
const MAX_FILES = 14_001;
const MAX_INPUT = 20 * 1024 * 1024;
const MAX_OBJECT = 2 * 1024 * 1024;
const SAFE_ID = /^[a-z][a-z0-9-]{0,99}$/;

export function observationId(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error("Invalid observation identity.");
  return id;
}
export const observationEditionHref = (id: string) =>
  `/observations/editions/${observationId(id)}/`;
export const observationSourceHref = (id: string, version: number) => {
  if (!Number.isSafeInteger(version) || version < 1 || version > 10_000)
    throw new Error("Invalid observation source version.");
  return `/observations/sources/${observationId(id)}/v${version}/`;
};

export function observationGroupSelections(projection: ObservationProjection) {
  const groups = projection.scopes.filter(
    (scope) => scope.scopeKind === "consolidated-reporting-group",
  );
  if (groups.length === 0) return Object.freeze([]);
  return Object.freeze([
    Object.freeze({
      id: "all-groups",
      label: `${groups.length} covered reporting groups`,
      entityIds: Object.freeze(
        [...new Set(groups.map((scope) => scope.entity.id))].sort(),
      ),
    }),
    ...groups.map((scope) =>
      Object.freeze({
        id: scope.id,
        label: scope.label,
        entityIds: Object.freeze([scope.entity.id]),
      }),
    ),
  ]);
}

export function readObservationFiles(root = ROOT): ObservationFiles {
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  let count = 0;
  if (!lstatSync(root).isDirectory())
    throw new Error("Observation data must be a real directory.");
  function visit(directory: string, prefix: string, depth: number) {
    if (depth > 2) throw new Error("Observation directory depth exceeded.");
    for (const name of readdirSync(directory).sort()) {
      if (!/^[a-z0-9][a-z0-9.-]{0,199}$/.test(name))
        throw new Error("Unexpected observation path.");
      const path = prefix ? `${prefix}/${name}` : name;
      const full = join(directory, name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink())
        throw new Error("Observation sources cannot be symbolic links.");
      if (stat.isDirectory()) {
        if (depth !== 0) throw new Error("Unexpected observation directory.");
        visit(full, path, depth + 1);
      } else {
        if (!stat.isFile() || !/\.(?:json|txt)$/.test(name))
          throw new Error("Unexpected observation file.");
        if (++count > MAX_FILES || stat.size > MAX_OBJECT)
          throw new Error("Observation input exceeds its whole bounds.");
        const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = fstatSync(fd);
          if (!opened.isFile() || opened.size !== stat.size)
            throw new Error("Observation file changed while opening.");
          const buffer = Buffer.alloc(stat.size + 1);
          let length = 0;
          while (length < buffer.length) {
            const count = readSync(
              fd,
              buffer,
              length,
              buffer.length - length,
              null,
            );
            if (count === 0) break;
            length += count;
          }
          const bytes = buffer.subarray(0, length);
          total += bytes.byteLength;
          if (bytes.byteLength !== stat.size || total > MAX_INPUT)
            throw new Error(
              "Observation input changed or exceeds history cap.",
            );
          Object.defineProperty(files, path, {
            value: Uint8Array.from(bytes),
            enumerable: true,
          });
        } finally {
          closeSync(fd);
        }
      }
    }
  }
  visit(root, "", 0);
  return files;
}

function load() {
  const files = readObservationFiles();
  const input = validateObservationFiles(files);
  const projection = observationProjection(input, input.registry.current.id);
  const countries = legacyCountriesProjection(projection);
  // Only detached file copies escape. The loader's cache is never a writable
  // authority for hashes, a current selection or another route's source text.
  const file = (path: string): Uint8Array => {
    if (!Object.hasOwn(files, path))
      throw new Error("Observation file is outside the admitted inventory.");
    return Uint8Array.from(files[path] as Uint8Array);
  };
  return Object.freeze({ input, projection, countries, file });
}

let cached: ReturnType<typeof load> | undefined;
export function loadObservations() {
  return (cached ??= load());
}
