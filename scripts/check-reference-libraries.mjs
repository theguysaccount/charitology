import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const slugs = [
  "encyclopedia",
  "charity-index",
  "interventions",
  "case-studies",
  "failure-archive",
  "disagreements",
  "traditions",
  "myths",
];
const libraries = [];
for (const slug of slugs) {
  const html = await readFile(
    new URL(`dist/record/${slug}/index.html`, root),
    "utf8",
  );
  const json = html.match(
    /<script\b[^>]*\bdata-library-data\b[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(
    json,
    `${slug}: built page must contain its actual serialized library`,
  );
  const data = JSON.parse(json);
  assert.equal(data.id, slug);
  assert.ok(data.entries.length > 0, `${slug}: empty reference collection`);
  assert.equal(
    new Set(data.entries.map((e) => e.id)).size,
    data.entries.length,
    `${slug}: duplicate IDs`,
  );
  const cards = [...html.matchAll(/\bdata-record-id="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    cards,
    data.entries.map((e) => e.id),
    `${slug}: rendered cards must match exporter records`,
  );
  assert.ok(data.notice && data.title && data.page);
  for (const entry of data.entries) {
    const label = `${slug}/${entry.id}`;
    assert.ok(
      entry.id && entry.title && entry.href && entry.summary,
      `${label}: missing identity`,
    );
    assert.ok(
      entry.body || entry.fields.some((field) => field.values.length),
      `${label}: no recorded content`,
    );
    assert.ok(
      ["draft", "reviewed"].includes(entry.review),
      `${label}: missing review state`,
    );
    assert.ok(
      entry.sources.length > 0,
      `${label}: source list unexpectedly missing`,
    );
    for (const source of entry.sources) {
      assert.ok(source.title, `${label}: untitled source`);
      assert.match(
        source.url,
        /^https?:\/\//,
        `${label}: non-public source URL`,
      );
    }
    for (const field of entry.fields) {
      assert.ok(field.label);
      assert.ok(field.values.every((value) => typeof value === "string"));
    }
  }
  for (const filter of data.filters) {
    assert.equal(
      new Set(filter.options.map((option) => option.value)).size,
      filter.options.length,
      `${slug}: duplicate filter options`,
    );
    for (const option of filter.options)
      assert.ok(
        data.entries.some((entry) =>
          entry.facets[filter.key]?.includes(option.value),
        ),
        `${slug}: ${filter.key}=${option.value} matches no entry`,
      );
  }
  assert.equal(Boolean(data.compare), slug === "interventions");
  libraries.push(data);
}

// Use the exact browser exporter, bundled without running browser initialization.
// Infer its deploy prefix from the canonical URL so subpath builds are checked too.
const sample = libraries[0];
const suffix = `/record/${sample.id}/`;
const pathname = new URL(sample.page).pathname;
assert.ok(pathname.endsWith(suffix));
const base = pathname.slice(0, -suffix.length) + "/";
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("src/lib/client/record-library.ts", root))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  define: { "import.meta.env.BASE_URL": JSON.stringify(base) },
  logLevel: "silent",
});
const { researchDossier } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
let entries = 0;
for (const data of libraries) {
  const text = researchDossier(data, data.entries);
  assert.match(text, /CC BY 4\.0/);
  assert.match(text, /not an independent verification/);
  assert.ok(
    text.includes(data.notice) && text.includes(data.page),
    `${data.id}: export must preserve collection scope and canonical origin`,
  );
  for (const entry of data.entries) {
    assert.ok(
      text.includes(`## ${entry.title}`),
      `${entry.id}: missing dossier entry`,
    );
    for (const source of entry.sources)
      assert.ok(text.includes(source.url), `${entry.id}: lost source`);
    for (const field of entry.fields)
      for (const value of field.values)
        assert.ok(
          text.includes(value),
          `${entry.id}: lost recorded field or cost caveat`,
        );
    const single = researchDossier(data, [entry]);
    assert.ok(
      single.includes(
        `Review: ${entry.review === "reviewed" ? "contributor reviewed" : "draft: human review pending"}`,
      ),
    );
    const href = new URL(
      entry.href.startsWith("/")
        ? base.replace(/\/$/, "") + entry.href
        : entry.href,
      new URL(data.page).origin,
    ).href;
    assert.ok(
      single.includes(href),
      `${entry.id}: invalid portable citation URL`,
    );
    entries++;
  }
}
console.log(
  `✓ Reference libraries: ${libraries.length} working collections / ${entries} records; actual built cards, filters, sources, review labels and exact research-dossier exporter checked.`,
);
