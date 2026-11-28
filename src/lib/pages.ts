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
import {
  FUNDING_FLOW_GROUPS,
  GLOBAL_CHARITY_INDEX_PANELS,
  US_ADDITIONAL_EDITIONS,
} from "./global-index-catalog";
import { wave1Pages } from "./registry-wave1";
import { wave1bPages } from "./registry-wave1b";
import { wave1cPages } from "./registry-wave1c";
import { wave1dPages } from "./registry-wave1d";

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

  // Global Charity Index coverage, all published jurisdictions, and additional U.S. Form 990 editions
  pages.push({
    path: "/record/charity-index/coverage/",
    title: "Global Charity Index coverage",
    summary: `Coverage, identifiers, periods and boundaries across all ${GLOBAL_CHARITY_INDEX_PANELS.length} published charity registry jurisdictions.`,
    section: "Global Charity Index",
  });
  for (const panel of GLOBAL_CHARITY_INDEX_PANELS) {
    pages.push({
      path: panel.route,
      title: `${panel.name}: ${panel.source}`,
      summary: panel.coverage,
      ...(panel.date && /^\d{4}-\d{2}-\d{2}$/.test(panel.date) ? { date: new Date(panel.date) } : {}),
      section: "Global Charity Index",
    });
  }
  for (const edition of US_ADDITIONAL_EDITIONS) {
    pages.push({
      path: edition.route,
      title: `United States Form ${edition.form} financial extracts`,
      section: "Global Charity Index",
    });
  }

  // All published Funding Flows lookups and case studies
  pages.push({
    path: "/record/funding-flows/",
    title: "Public funding flows and case studies",
    summary: "Trace grants, tax-assignment designations, humanitarian plan gaps and local delivery records across published public datasets.",
    section: "Funding flows",
  });
  for (const group of FUNDING_FLOW_GROUPS) {
    for (const item of group.items) {
      pages.push({
        path: `/record/funding-flows/${item.slug}/`,
        title: `${item.title} (${item.scope})`,
        summary: item.summary,
        section: "Funding flows",
      });
    }
  }

  // Additional published static & guide routes across Disasters, For Charities, Learn, Newsletter & Tools
  const additionalRoutes: [string, string, string][] = [
    ["/disasters/", "Disaster Desk", "Disasters"],
    ["/disasters/2024-2026-emergencies/", "2024–2026 OpenFEMA Federal Disaster Captures", "Disasters"],
    ["/for-charities/start/", "Start here for charities", "For charities"],
    ["/for-charities/free/", "Free things, credits and grants for charities (65 verified programs)", "For charities"],
    ["/for-charities/fundraising/", "Fundraising guides for charities", "For charities"],
    ["/for-charities/fundraising/email-appeals/", "Email appeals for charities", "For charities"],
    ["/for-charities/fundraising/paid-ads/", "Paid ads for charities", "For charities"],
    ["/for-charities/fundraising/fundraising-events/", "Fundraising events for charities", "For charities"],
    ["/for-charities/fundraising/recurring-giving/", "Recurring giving for charities", "For charities"],
    ["/for-charities/fundraising/peer-to-peer/", "Peer-to-peer fundraising for charities", "For charities"],
    ["/for-charities/fundraising/major-gifts/", "Major gifts for charities", "For charities"],
    ["/for-charities/fundraising/grants/", "Grants for charities", "For charities"],
    ["/for-charities/fundraising/direct-mail/", "Direct mail for charities", "For charities"],
    ["/for-charities/fundraising/corporate-partnerships/", "Corporate partnerships for charities", "For charities"],
    ["/for-charities/fundraising/donor-follow-up/", "Donor follow-up for charities", "For charities"],
    ["/for-charities/networks/", "Charity networks directory", "For charities"],
    ["/for-charities/networks/founder-networks/", "Founder networks for charities", "For charities"],
    ["/for-charities/networks/leadership-networks/", "Leadership networks for charities", "For charities"],
    ["/for-charities/networks/sector-networks/", "Sector networks for charities", "For charities"],
    ["/for-charities/collaborate/", "Collaborate with Charitology", "For charities"],
    ["/for-charities/website-pilots/", "Charity website pilots", "For charities"],
    ["/for-charities/os-plan/", "Charity OS research and architecture plan", "For charities"],
    ["/learn/", "Teach and learn Charitology", "Learn"],
    ["/learn/teach/", "Teach a 50-minute session", "Learn"],
    ["/learn/schools/", "Charitology for schools", "Learn"],
    ["/learn/universities/", "Charitology for universities", "Learn"],
    ["/learn/clubs/", "Charitology clubs", "Learn"],
    ["/newsletter/", "The Charitology Letter", "Newsletter"],
    ["/newsletter/privacy/", "Newsletter privacy policy", "Newsletter"],
    ["/tools/browser-extension/compatibility/", "Before You Give: browser compatibility", "Tools"],
    ["/tools/cost-effectiveness-model-kit/spreadsheet/", "Cost-effectiveness model kit spreadsheet guide", "Tools"],
    ["/tools/giving-dashboard/estimate/", "Giving Dashboard: conditional gift estimate", "Tools"],
  ];
  for (const [path, title, section] of additionalRoutes) {
    pages.push({ path, title, section });
  }

  // Wave 1 verified charity dossiers and registry hubs (own sitemap partition).
  for (const page of wave1Pages()) pages.push(page);
  // Wave 1b: Scotland, Australia and Canada dossiers, cause hubs and Cause × Country (own sitemap partition).
  for (const page of wave1bPages()) pages.push(page);
  // Wave 1c: national register dossiers and register hubs (own sitemap partition).
  for (const page of wave1cPages()) pages.push(page);
  // Wave 1d: Israel, Estonia, Italy, Hungary and Slovenia dossiers rebuilt from official downloads (own sitemap partition).
  for (const page of wave1dPages()) pages.push(page);

  return pages;
}
