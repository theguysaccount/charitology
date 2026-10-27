import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const baseline = JSON.parse(
  await readFile(
    "test-fixtures/artifact-results/legacy-fields-v1.json",
    "utf8",
  ),
);
const bundled = await build({
  entryPoints: ["src/data/research-artifact-adapters.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const data = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
          .join(",") +
        "}";
const normalize = (fields) =>
  fields.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type ?? "text",
    required: field.required ?? false,
    group: field.group ?? null,
    hint: field.hint ?? null,
    maxLength: field.maxLength ?? 8000,
    options: (field.options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
    })),
    min: field.min ?? null,
    max: field.max ?? null,
    step: field.step ?? null,
  }));
const sourceOnly = process.argv.includes("--source-only");
const current = {
  "methods-lab": data.METHODS_RESEARCH_FIELDS,
  "replication-program": data.REPLICATION_RESEARCH_FIELDS,
};
assert.equal(data.RESEARCH_ARTIFACT_ADAPTERS.length, 2);
for (const adapter of data.RESEARCH_ARTIFACT_ADAPTERS) {
  assert.deepEqual(
    current[adapter.program],
    baseline.programs[adapter.program].fields,
    "Existing form semantics and option metadata must remain exact.",
  );
  assert.deepEqual(
    adapter.fields,
    normalize(baseline.programs[adapter.program].fields),
  );
  const { hash, ...subject } = adapter;
  assert.equal(
    hash,
    createHash("sha256").update(canonical(subject)).digest("hex"),
  );
  assert.equal(
    hash,
    baseline.adapterHashes[adapter.id],
    "A frozen v1 adapter cannot silently change.",
  );
  assert.ok(
    Object.isFrozen(adapter) &&
      Object.isFrozen(adapter.fields) &&
      Object.isFrozen(current[adapter.program]),
  );
  assert.equal(adapter.fields.length, 17);
  assert.equal(new Set(adapter.fields.map((field) => field.key)).size, 17);
  assert.equal(adapter.legacyFreeze, adapter.program === "replication-program");
  if (sourceOnly) continue;
  const html = await readFile(
    `dist/programs/${adapter.program}/index.html`,
    "utf8",
  );
  assert.match(html, /data-artifact-results/);
  assert.ok(html.includes(`data-artifact-program="${adapter.program}"`));
  const tag = html.match(/<section\b[^>]*data-research-workspace[^>]*>/)?.[0];
  assert.ok(tag, "The earlier research workspace must remain present.");
  const encoded = tag.match(/data-config="([^"]*)"/)?.[1];
  assert.ok(encoded);
  const entities = {
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
  };
  const config = JSON.parse(
    encoded.replace(
      /&(?:#(?:x[0-9a-f]+|[0-9]+)|quot|apos|lt|gt|amp);/gi,
      (value) => {
        if (value.startsWith("&#")) {
          const hex = value[2].toLowerCase() === "x";
          return String.fromCodePoint(
            Number.parseInt(value.slice(hex ? 3 : 2, -1), hex ? 16 : 10),
          );
        }
        return entities[value.toLowerCase()];
      },
    ),
  );
  assert.equal(config.id, adapter.program);
  assert.equal(config.freeze, adapter.legacyFreeze);
  assert.deepEqual(
    config.fields,
    baseline.programs[adapter.program].fields,
    "Actual built legacy fields must match the captured old configuration.",
  );
  assert.ok(html.includes(`id="workspace-${adapter.program}"`));
}
console.log(
  `✓ Artifact adapters: both frozen 17-field schemas and exact old form semantics${sourceOnly ? " (source-only; built routes not checked)" : ", both actual built mounts and preserved legacy configurations"}.`,
);
