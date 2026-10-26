// Builds the Evidence Library: every source cited anywhere on the site,
// deduplicated by URL, with the pages that cite it.
import { getCollection, type CollectionKey } from "astro:content";
import { hrefFor } from "./content";
import figures from "../data/figures.json";
import countries from "../data/countries.json";
import nonprofitTools from "../data/nonprofit-tools.json";
import nonprofitBenefits from "../data/nonprofit-benefits.json";

export interface Citation {
  title: string;
  url: string;
  publisher?: string;
  year?: string | number;
  citedBy: { title: string; href: string }[];
}

type Src = {
  title: string;
  url: string;
  publisher?: string;
  year?: string | number;
};

const COLLECTIONS: CollectionKey[] = [
  "conditions",
  "problems",
  "programs",
  "tools",
  "record",
  "encyclopedia",
  "interventions",
  "cases",
  "traditions",
  "myths",
  "disagreements",
  "principles",
  "forecasts",
  "charities",
];

const normalize = (u: string) =>
  u.replace(/\/+$/, "").replace(/^http:/, "https:");

export async function allCitations(): Promise<Citation[]> {
  const map = new Map<string, Citation>();
  const add = (s: Src, by: { title: string; href: string }) => {
    const key = normalize(s.url);
    const existing = map.get(key);
    if (existing) {
      if (!existing.citedBy.some((c) => c.href === by.href))
        existing.citedBy.push(by);
      return;
    }
    map.set(key, {
      title: s.title,
      url: s.url,
      publisher: s.publisher,
      year: s.year,
      citedBy: [by],
    });
  };

  for (const collection of COLLECTIONS) {
    for (const entry of (await getCollection(collection)) as any[]) {
      const d = entry.data;
      const by = {
        title: d.title ?? d.name,
        href: hrefFor(collection, entry.id),
      };
      for (const s of (d.sources ?? []) as Src[]) add(s, by);
      if (d.cost?.source) add(d.cost.source, by);
    }
  }

  const figureBy = {
    title: "Headline figures",
    href: "/record/state-of-charity/",
  };
  for (const block of Object.values(figures) as any[]) {
    for (const s of (block?.sources ?? []) as Src[]) add(s, figureBy);
  }

  for (const [kind, entries] of [
    ["tools", nonprofitTools],
    ["benefits", nonprofitBenefits],
  ] as const) {
    for (const entry of entries) {
      for (const source of entry.sources)
        add(
          { title: `${entry.name}: ${source.label}`, url: source.url },
          { title: entry.name, href: `/for-charities/${kind}/#${entry.id}` },
        );
    }
  }

  for (const indicator of countries.indicators)
    add(
      {
        title: indicator.label,
        url: indicator.url,
        publisher: "World Bank and original statistical producers",
      },
      { title: "Country data profiles", href: "/record/country-profiles/" },
    );
  return [...map.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
  );
}
