import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import {
  at,
  command,
  protocol,
} from "../test-fixtures/study-register/factory.mjs";

const result = await build({
  stdin: {
    contents:
      "export * from './src/lib/study-catalog.ts'; export * from './src/lib/client/study-register-model.ts'; export * from './src/lib/client/study-register-import.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "synthetic-content-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^astro:content$/ }, () => ({
          path: "content",
          namespace: "synthetic",
        }));
        builder.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
          contents: "export async function getCollection(){return []}",
          loader: "js",
        }));
      },
    },
  ],
});
const model = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const { buildStudyCatalog } = model;
const citation = {
  title: "Synthetic citation",
  url: "https://example.invalid/report?edition=1",
  publisher: "Synthetic publisher",
  year: "undated",
  citedBy: [{ title: "Synthetic page", href: "/record/journal/synthetic/" }],
};
const before = structuredClone(citation);
const first = buildStudyCatalog([citation]);
assert.deepEqual(citation, before);
assert.equal(first.entries.length, 1);
assert.equal(first.entries[0].year, null);
assert.equal(first.entries[0].originalYear, "undated");
assert.equal(first.entries[0].authors, null);
assert.equal(first.entries[0].doi, null);
assert.deepEqual(first.entries[0].backlinks, citation.citedBy);
assert.equal(first.entries[0].url, citation.url);
assert.equal(
  buildStudyCatalog([{ ...citation, title: "Corrected public title" }])
    .entries[0].entryId,
  first.entries[0].entryId,
);
assert.equal(
  buildStudyCatalog([{ ...citation, year: 0 }]).entries[0].year,
  null,
);
assert.equal(
  buildStudyCatalog([{ ...citation, year: 2024 }]).entries[0].year,
  2024,
);
const refused = buildStudyCatalog([
  { ...citation, url: "http://example.invalid/report" },
  { ...citation, url: "https://name:secret@example.invalid/report" },
  { ...citation, url: "javascript:alert(1)" },
  { ...citation, title: "a".repeat(501) },
  { ...citation, publisher: "a".repeat(2001) },
  { ...citation, year: "a".repeat(2001) },
  {
    ...citation,
    citedBy: [{ title: "Unsafe path", href: "//example.invalid/" }],
  },
]);
assert.equal(refused.entries.length, 0);
assert.equal(refused.omitted.length, 7);
assert.ok(refused.omitted.every((row) => row.reason));

const datasets = [];
for (const route of ["record/evidence-library", "programs/evidence-reviews"]) {
  const html = await readFile(`dist/${route}/index.html`, "utf8");
  const raw = html.match(
    /<script\b[^>]*class="study-register-catalog"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(raw, route + ": missing real serialized public catalog");
  assert.doesNotMatch(raw, /<\/script/i);
  const entries = JSON.parse(raw);
  assert.ok(entries.length > 0);
  assert.equal(new Set(entries.map((row) => row.entryId)).size, entries.length);
  assert.ok(
    entries.some((row) =>
      row.backlinks.some((backlink) =>
        backlink.href.startsWith("/record/journal/"),
      ),
    ),
    "Journal citation coverage must reach the actual built register.",
  );
  assert.ok(
    entries.every(
      (row) => row.authors === null && row.doi === null && row.pmid === null,
    ),
    "Bibliography metadata must not invent paper metadata.",
  );
  datasets.push(entries);
}
assert.deepEqual(
  datasets[0],
  datasets[1],
  "Both views must receive the same public catalog.",
);
const sourceApi = JSON.parse(
  await readFile("dist/api/v1/sources.json", "utf8"),
);
assert.equal(sourceApi.name, "sources");
assert.deepEqual(
  buildStudyCatalog(sourceApi.data).entries,
  datasets[0],
  "The public source API and both register views must describe the same bibliography.",
);
const blank = model.blankStudyState("catalog-acceptance", at);
const preview = await model.previewCitationImport(
  blank,
  {
    kind: "site-bibliography",
    entries: datasets[0],
    catalogHash: await model.hashStudyValue(datasets[0]),
    provenanceNote:
      "Automated catalog compatibility fixture; no literature search was performed.",
  },
  await model.studyStateHash(blank),
);
assert.deepEqual(
  preview.issues,
  [],
  "Every offered source must be representable without field repair.",
);
const imported = await command(
  model,
  blank,
  {
    kind: "import.commit",
    preview,
    assignments: model.defaultImportAssignments(preview),
    reason:
      "Check the complete public catalog against the actual final import model.",
  },
  "catalog",
);
assert.equal(imported.occurrences.length, datasets[0].length);
const scoped = await command(
  model,
  imported,
  {
    kind: "protocol.freeze",
    content: protocol,
    basedOnId: null,
  },
  "catalog-protocol",
);
assert.equal(model.studyCounts(scoped).titlePending, datasets[0].length);
assert.ok(
  imported.reports.every(
    (report) =>
      model.reportRevision(report).metadata.classification === "unknown",
  ),
);
const library = await readFile(
  "dist/record/evidence-library/index.html",
  "utf8",
);
assert.match(library, /class="cites"/);
assert.match(library, /Cited by:/);
console.log(
  `✓ Study catalog: ${datasets[0].length} actual public references on both views, journal backlinks, preserved no-JavaScript bibliography, safe exact metadata and explicit refused-source diagnostics.`,
);
