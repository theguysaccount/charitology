// Every page on the site with its title and summary, for the RSS feed and the sitemap.
import {
  loadObservations,
  observationEditionHref,
  observationSourceHref,
} from "./observations";
import podcast from "../data/podcast.json";
import newsletter from "../data/newsletter.json";
import { getCollection, type CollectionKey } from "astro:content";
import { STATIC_PAGES, hrefFor } from "./content";
import { loadPublicationEditions } from "./publication-editions";

export interface PageInfo {
  path: string;
  title: string;
  summary?: string;
  date?: Date;
  section: string;
}

const SECTIONS: [CollectionKey, string][] = [
  ["journal", "Journal"],
  ["conditions", "Diagnosis"],
  ["problems", "Open Problems"],
  ["programs", "Programs"],
  ["tools", "Tools"],
  ["record", "Record"],
  ["forecasts", "Forecasts"],
  ["encyclopedia", "Encyclopedia"],
  ["interventions", "Intervention Database"],
  ["cases", "Case Studies"],
  ["myths", "Myths"],
  ["disagreements", "Disagreements"],
  ["traditions", "Traditions"],
  ["principles", "Principles"],
];

export async function allPages(): Promise<PageInfo[]> {
  const observations = loadObservations();
  const countries = observations.countries;
  const pages: PageInfo[] = Object.entries(STATIC_PAGES)
    .filter(([path]) => path.endsWith("/"))
    .map(([path, title]) => ({ path, title, section: "Charitology" }));
  for (const [collection, section] of SECTIONS) {
    for (const e of (await getCollection(collection)) as any[]) {
      pages.push({
        path: hrefFor(collection, e.id),
        title: e.data.title,
        summary: e.data.summary ?? e.data.statement ?? e.data.question,
        date: e.data.date,
        section,
      });
    }
  }
  pages.push({
    path: "/record/principles/read/",
    title: "Principles of Charitology: complete reading edition",
    section: "Principles",
  });
  for (const c of countries.countries)
    pages.push({
      path: `/record/countries/${c.id.toLowerCase()}/`,
      title: `${c.name}: country data`,
      section: "Country profiles",
    });
  for (const e of podcast.episodes)
    pages.push({
      path: `/record/podcast/${e.id}/`,
      title: e.title,
      summary: e.description,
      date: new Date(e.date),
      section: "Podcast",
    });
  for (const i of newsletter.issues)
    pages.push({
      path: i.path,
      title: i.title,
      summary: i.summary,
      date: new Date(i.date),
      section: "Newsletter",
    });
  for (const edition of loadPublicationEditions().input.editions)
    pages.push({
      path: `/record/editions/${edition.core.id}/`,
      title: edition.core.title,
      summary: `Fixed ${edition.core.provenance.replaceAll("-", " ")} · editorial draft · ${edition.core.coverage.scope}`,
      section: "Fixed publications",
    });
  pages.push({
    path: "/observations/",
    title: "Dated observations and coverage",
    summary:
      "Exact source-linked facts, definitions, periods and missing coverage; no charity ratings.",
    section: "Observations",
  });
  for (const edition of observations.input.registry.editions)
    pages.push({
      path: observationEditionHref(edition.id),
      title: `Observation edition ${edition.sequence}: ${edition.id}`,
      section: "Observations",
    });
  for (const pin of observations.input.registry.records.filter(
    (pin) => pin.kind === "source",
  ))
    pages.push({
      path: observationSourceHref(pin.id, pin.version),
      title: `Observation source: ${pin.id}, version ${pin.version}`,
      section: "Observation sources",
    });
  return pages;
}
