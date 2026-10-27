// Static build adapter. Route helpers are usable without loading Astro or data.
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { readLedgerInput } from "./research-ledger-data.mjs";
import { captureResearchEntry } from "./research-ledger-capture.mjs";
import {
  validateResearchLedger,
  projectResearchLedger,
  researchProgress,
  ledgerHref,
} from "./research-ledger-model.mjs";

const collections = [
  "conditions",
  "programs",
  "tools",
  "record",
  "problems",
  "encyclopedia",
  "interventions",
  "cases",
  "myths",
  "disagreements",
  "traditions",
  "principles",
  "journal",
  "forecasts",
  "charities",
] as const;
function encoded(id: string) {
  ledgerHref(id);
  return encodeURIComponent(id);
}
export const ledgerEditionHref = (id: string) =>
  `/research-ledger/editions/${encoded(id)}/`;
export const ledgerEditionJsonHref = (id: string) =>
  `/research-ledger/editions/${encoded(id)}/ledger.json`;
export const ledgerEditionCsvHref = (id: string) =>
  `/research-ledger/editions/${encoded(id)}/ledger.csv`;
export const ledgerSourceHref = (id: string) =>
  `/research-ledger/sources/${encoded(id)}/source.txt`;

export async function readStaticResearchLedger(
  dataRoot = resolve("src/data/research-ledger"),
): Promise<Record<string, any>> {
  return readLedgerInput(dataRoot);
}
function normalize(value: any): any {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    if (typeof value.title === "string" && typeof value.url === "string")
      return {
        title: value.title,
        url: value.url,
        publisher: value.publisher ?? null,
        year: value.year ?? null,
        note: value.note ?? null,
      };
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, normalize(v)]),
    );
  }
  return value;
}

async function load() {
  const { getCollection } = await import("astro:content");
  const { hrefFor } = await import("./content");
  const input = await readStaticResearchLedger();
  const inventory = new Map<string, any>();
  for (const collection of collections)
    for (const entry of await getCollection(collection))
      inventory.set(`${collection}/${entry.id}`, { collection, entry });
  const coveredKeys = [...inventory.keys()]
    .filter(
      (key) =>
        key.startsWith("problems/") ||
        key.startsWith("journal/") ||
        key.startsWith("cases/") ||
        key === "record/methodology",
    )
    .sort();
  assert.deepEqual(
    [...input.manifest.coverage.includedSourceKeys].sort(),
    coveredKeys,
    "Research ledger coverage must enumerate every current covered content file",
  );
  const currentContent = [];
  for (const sourceKey of coveredKeys) {
    const { collection, entry } = inventory.get(sourceKey);
    const rawText = await readFile(
      resolve(`src/content/${sourceKey}.md`),
      "utf8",
    );
    const captured = captureResearchEntry({ sourceKey, rawText });
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(captured.subject.frontmatter).map((key) => [
          key,
          normalize(entry.data[key]),
        ]),
      ),
      captured.subject.frontmatter,
      `Astro schema and pinned source adapter differ: ${sourceKey}`,
    );
    assert.equal(
      entry.body,
      // Astro 5's Markdown entry type trims its display body; raw/hash input above remains exact.
      captured.subject.body.trim(),
      `Astro display body differs from source capture: ${sourceKey}`,
    );
    assert.equal(entry.data.review, captured.declaredReview);
    if (collection === "problems")
      assert.equal(entry.data.status, captured.declaredProblemState);
    currentContent.push({
      sourceKey,
      href: hrefFor(collection, entry.id),
      rawText,
      ...captured,
    });
  }
  const uncoveredReviews = [...inventory]
    .filter(([key]) => !coveredKeys.includes(key))
    .map(([sourceKey, { entry }]) => ({
      sourceKey,
      review: entry.data.review ?? "draft",
    }));
  // Directory/data review flags are also outside this initial source coverage.
  for (const file of (await readdir(resolve("src/data")))
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const data = JSON.parse(await readFile(resolve("src/data", file), "utf8"));
    const visit = (value: any, path: string, depth: number) => {
      assert.ok(
        depth <= 20,
        "Public data review inventory exceeds bounded depth",
      );
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value) && Object.hasOwn(value, "review"))
        uncoveredReviews.push({
          sourceKey: `data/${file}/${path}`,
          review: value.review,
        });
      for (const [key, child] of Object.entries(value))
        if (child && typeof child === "object")
          visit(child, `${path}/${key}`, depth + 1);
    };
    visit(data, "root", 0);
  }
  const graph = validateResearchLedger(input, {
    currentContent,
    uncoveredReviews,
  });
  const current = projectResearchLedger(graph, {
    editionId: input.manifest.currentEditionId,
  });
  const progress = researchProgress(graph, {
    editionId: current.edition.id,
    ...current.edition.period,
  });
  const editions = input.editions.map((edition: any) =>
    projectResearchLedger(graph, { editionId: edition.id }),
  );
  return Object.freeze({ input, graph, current, progress, editions });
}
let cached: ReturnType<typeof load> | undefined;
export function loadResearchLedger() {
  return (cached ??= load());
}
