// The Public API: every dataset as static JSON at /api/v1/<name>.json.
// Each endpoint is generated at build time; no application keys are needed.
import { getCollection, type CollectionKey } from "astro:content";
import { hrefFor } from "./content";
import { allCitations } from "./sources";
import causes from "../data/causes.json";
import frameworks from "../data/frameworks.json";
import depth from "../data/depth.json";
import checklist from "../data/checklist.json";
import figures from "../data/figures.json";
import sourcesMap from "../data/sources-map.json";
import roadmap from "../data/roadmap.json";
import podcast from "../data/podcast.json";
import newsletter from "../data/newsletter.json";
import nonprofitTools from "../data/nonprofit-tools.json";
import nonprofitBenefits from "../data/nonprofit-benefits.json";
import osProviders from "../data/os-providers.json";
import osUserNeeds from "../data/os-user-needs.json";

async function researchLedger() {
  const { loadResearchLedger } = await import("./research-ledger");
  return loadResearchLedger();
}

export interface Endpoint {
  name: string;
  description: string;
  build: () => Promise<unknown>;
  capturedAt?: () => Promise<string>;
  preserveShape?: boolean;
  envelope?: "fixed-capture-v1";
  available?: () => Promise<boolean>;
  license?: string;
}

export const API_LICENSE_SUMMARY =
  "Charitology schema and editorial material: CC BY 4.0; cite “Charitology (charitology.org)”. External data and documents retain their own source-specific terms, attribution and exceptions. This notice does not license third-party source material.";
const OBSERVATION_LICENSE_SUMMARY =
  "Charitology schema and editorial notes: CC BY 4.0. World Bank indicator responses retain their recorded CC BY 4.0 attribution and source-specific terms; metadata licensing is a disclosed publisher-default inference. Financial documents have separate terms and private originals are not included. Consult each source rights record at /api/v1/observations.json.";
async function observations() {
  const { loadObservations } = await import("./observations");
  return loadObservations();
}

async function disasters() {
  const { requireDisasters } = await import("./disaster-incidents/public.mjs");
  return requireDisasters();
}
async function disastersAvailable() {
  const { loadDisasters } = await import("./disaster-incidents/public.mjs");
  return loadDisasters() !== null;
}
const DISASTER_LICENSE_SUMMARY =
  "Charitology schema and authored factual notes: CC BY 4.0. External originals remain with their publishers, are not redistributed and have no granted reuse license in this dataset. Read each exact source rights record and the edition coverage. Draft source self-reports; no independently verified current needs or worldwide coverage.";

const entries = (collection: CollectionKey) => async () =>
  ((await getCollection(collection)) as any[]).map((e) => ({
    id: e.id,
    path: hrefFor(collection, e.id),
    ...e.data,
    body: e.body,
  }));

/** Replace content references ({ id, collection }) with plain ids so the JSON is easy to use. */
function flattenRefs(value: unknown, preserveInstants = false): unknown {
  if (Array.isArray(value))
    return value.map((item) => flattenRefs(item, preserveInstants));
  if (value instanceof Date)
    return preserveInstants
      ? value.toISOString()
      : value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (
      typeof v.id === "string" &&
      typeof v.collection === "string" &&
      Object.keys(v).length === 2
    )
      return v.id;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, flattenRefs(x, preserveInstants)]),
    );
  }
  return value;
}

export const ENDPOINTS: Endpoint[] = [
  {
    name: "disaster-incidents",
    description: "Complete fixed Disaster Desk edition: attributed reports, exact source versions, status scopes and explicit limitations. Not live or a worldwide needs census.",
    build: async () => (await disasters()).selected.projection.packet,
    capturedAt: async () => (await disasters()).selected.projection.capturedAt,
    envelope: "fixed-capture-v1",
    available: disastersAvailable,
    preserveShape: true,
    license: DISASTER_LICENSE_SUMMARY,
  },
  {
    name: "disaster-incident-coverage",
    description: "Fixed Disaster Desk coverage, omitted areas, source-access checks and explicit gaps. Missing coverage never means zero need.",
    build: async () => (await disasters()).selected.coverage,
    capturedAt: async () => (await disasters()).selected.projection.capturedAt,
    envelope: "fixed-capture-v1",
    available: disastersAvailable,
    preserveShape: true,
    license: DISASTER_LICENSE_SUMMARY,
  },
  {
    name: "observations",
    description:
      "Version-pinned exact source tokens, decimals, periods, definitions, source rights and explicit coverage. Draft source transcription; no ranking or impact estimate.",
    build: async () => (await observations()).projection,
    capturedAt: async () => (await observations()).projection.capturedAt,
    preserveShape: true,
    license: OBSERVATION_LICENSE_SUMMARY,
  },
  {
    name: "observation-coverage",
    description:
      "Explicit country-window and consolidated-group coverage, including producer-null and uncollected states, linked to exact observations and source rights in the same edition.",
    build: async () => {
      const p = (await observations()).projection;
      return {
        format: "charitology-observation-coverage-projection",
        version: 1,
        edition: p.edition,
        capturedAt: p.capturedAt,
        countryProjection: p.countryProjection,
        entities: p.entities,
        scopes: p.scopes,
        measures: p.measures,
        sources: p.sources,
        coverage: p.coverage,
        observationsEndpoint: "/api/v1/observations.json",
        limitations: p.limitations,
      };
    },
    capturedAt: async () => (await observations()).projection.capturedAt,
    preserveShape: true,
    license: OBSERVATION_LICENSE_SUMMARY,
  },
  {
    name: "publication-editions",
    description:
      "Fixed public capture metadata and registry hash. The endpoint wrapper generated date is build metadata; each edition retains its own capture/source dates. No private proposal or subscriber data.",
    build: async () => {
      const { loadPublicationEditions } =
        await import("./publication-editions");
      const { publicationRegistryMetadata } =
        await import("./publication-editions-model.mjs");
      const archive = loadPublicationEditions();
      return {
        ...publicationRegistryMetadata(archive.input),
        inventory: archive.inventory,
      };
    },
    preserveShape: true,
  },
  {
    name: "research-ledger",
    description:
      "Pinned public source versions, editorial corrections and recorded review declarations; no private local workspaces or automatic scientific qualification.",
    build: async () => (await researchLedger()).current,
    capturedAt: async () => (await researchLedger()).current.edition.capturedAt,
    preserveShape: true,
  },
  {
    name: "research-progress",
    description:
      "Explicit as-of research progress: present states, dated editorial corrections, recorded decisions and support limits; unknown historical baseline stays unknown.",
    build: async () => (await researchLedger()).progress,
    capturedAt: async () => (await researchLedger()).current.edition.capturedAt,
    preserveShape: true,
  },
  {
    name: "os-providers",
    description:
      "Dated Charity OS provider dossiers, licenses, scope, limits and primary sources; draft research, not tested integrations.",
    build: async () => osProviders,
  },
  {
    name: "os-user-needs",
    description:
      "Twenty primary public user discussions, observed needs, constraints and proposed OS requirements; a purposive draft research sample.",
    build: async () => osUserNeeds,
  },
  {
    name: "conditions",
    description:
      "The fifteen conditions of the charity system (the Diagnosis).",
    build: entries("conditions"),
  },
  {
    name: "open-problems",
    description: "The Open Problems of Charitology, with status.",
    build: entries("problems"),
  },
  {
    name: "programs",
    description: "Every program, with status and the conditions it treats.",
    build: entries("programs"),
  },
  {
    name: "tools",
    description: "Every tool, with status.",
    build: entries("tools"),
  },
  {
    name: "record",
    description: "Every information base in the Record.",
    build: entries("record"),
  },
  {
    name: "interventions",
    description:
      "The Intervention Database: depth, evidence grade, mechanism, cost data.",
    build: entries("interventions"),
  },
  {
    name: "charities",
    description:
      "The Charity Index: organizations with depth classifications (hypotheses, not ratings).",
    build: entries("charities"),
  },
  {
    name: "encyclopedia",
    description: "Encyclopedia entries.",
    build: entries("encyclopedia"),
  },
  {
    name: "cases",
    description: "Historical case studies, including failures.",
    build: entries("cases"),
  },
  {
    name: "myths",
    description: "The Myth-Busting Series.",
    build: entries("myths"),
  },
  {
    name: "disagreements",
    description: "The Disagreement Register.",
    build: entries("disagreements"),
  },
  {
    name: "traditions",
    description: "The Giving Traditions Library.",
    build: entries("traditions"),
  },
  {
    name: "principles",
    description: "Principles of Charitology, chapter by chapter.",
    build: entries("principles"),
  },
  {
    name: "forecasts",
    description: "Forecast questions, forecasts and outcomes.",
    build: entries("forecasts"),
  },
  {
    name: "journal",
    description: "Journal entries with their review status.",
    build: entries("journal"),
  },
  {
    name: "lexicon",
    description: "The Lexicon of terms.",
    build: async () =>
      (await getCollection("lexicon")).map((e) => ({ id: e.id, ...e.data })),
  },
  {
    name: "causes",
    description:
      "Cause areas with their editorial positions on five dimensions.",
    build: async () => causes,
  },
  {
    name: "frameworks",
    description: "Moral frameworks with their editorial cause priorities.",
    build: async () => frameworks,
  },
  {
    name: "depth",
    description: "The five-level depth scale, from relief to source.",
    build: async () => depth,
  },
  {
    name: "checklist",
    description: "The Giver’s Checklist.",
    build: async () => checklist,
  },
  {
    name: "figures",
    description: "Headline figures with their sources.",
    build: async () => figures,
  },
  {
    name: "source-map",
    description:
      "Which sources Humanity’s Checklist links to which world problems.",
    build: async () => sourcesMap,
  },
  {
    name: "roadmap",
    description: "All 66 original brief items and their implementation scope.",
    build: async () => roadmap,
  },
  {
    name: "nonprofit-tools",
    description:
      "External tools for charities with costs, limits and official sources.",
    build: async () => nonprofitTools,
  },
  {
    name: "nonprofit-benefits",
    description:
      "Benefits for charities with eligibility and official application links.",
    build: async () => nonprofitBenefits,
  },
  {
    name: "countries",
    description:
      "Dated World Bank country/economy indicators, definitions, source metadata and explicit missing data.",
    build: async () => (await observations()).countries,
    capturedAt: async () => (await observations()).projection.capturedAt,
    preserveShape: true,
    license: OBSERVATION_LICENSE_SUMMARY,
  },
  {
    name: "podcast",
    description:
      "Computer-narrated textbook episodes with audio, transcripts, duration and file size.",
    build: async () => podcast,
  },
  {
    name: "newsletter",
    description: "Published Charitology Letter issues.",
    build: async () => newsletter,
  },
  {
    name: "sources",
    description:
      "Sources in Charitology's bibliography, with the pages that cite them; wider literature coverage is unknown.",
    build: allCitations,
  },
];

export async function availableEndpoints(): Promise<Endpoint[]> {
  const ready = await Promise.all(ENDPOINTS.map(async e => !e.available || await e.available()));
  return ENDPOINTS.filter((_, i) => ready[i]);
}

export async function buildEndpoint(name: string): Promise<unknown> {
  const endpoint = ENDPOINTS.find((e) => e.name === name);
  if (!endpoint) throw new Error(`Unknown endpoint: ${name}`);
  if (endpoint.available && !await endpoint.available()) throw new Error("This dataset has no committed source capture yet.");
  const data = await endpoint.build();
  const capture = endpoint.capturedAt ? await endpoint.capturedAt() : null;
  if (
    endpoint.capturedAt &&
    (typeof capture !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capture) ||
      new Date(capture).toISOString() !== capture)
  )
    throw new Error("Invalid pinned API capture.");
  if (endpoint.envelope === "fixed-capture-v1") {
    if (!capture) throw new Error("A fixed API envelope requires its capture instant.");
    return { name, generated: capture, license: endpoint.license ?? API_LICENSE_SUMMARY, data };
  }
  return {
    name,
    description: endpoint.description,
    license: endpoint.license ?? API_LICENSE_SUMMARY,
    generated: capture
      ? capture.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    // Forecast timestamps are scoring cutoffs, not calendar-only dates.
    data: endpoint.preserveShape
      ? data
      : flattenRefs(data, name === "forecasts"),
  };
}
