// The Public API: every dataset as static JSON at /api/v1/<name>.json.
// Each endpoint is generated at build time, so there are no keys and no rate limits.
import { getCollection, type CollectionKey } from 'astro:content';
import { hrefFor } from './content';
import { allCitations } from './sources';
import causes from '../data/causes.json';
import frameworks from '../data/frameworks.json';
import depth from '../data/depth.json';
import checklist from '../data/checklist.json';
import figures from '../data/figures.json';
import sourcesMap from '../data/sources-map.json';

export interface Endpoint {
  name: string;
  description: string;
  build: () => Promise<unknown>;
}

const entries = (collection: CollectionKey) => async () =>
  ((await getCollection(collection)) as any[]).map((e) => ({ id: e.id, path: hrefFor(collection, e.id), ...e.data, body: e.body }));

/** Replace content references ({ id, collection }) with plain ids so the JSON is easy to use. */
function flattenRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(flattenRefs);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.id === 'string' && typeof v.collection === 'string' && Object.keys(v).length === 2) return v.id;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, flattenRefs(x)]));
  }
  return value;
}

export const ENDPOINTS: Endpoint[] = [
  { name: 'conditions', description: 'The fifteen conditions of the charity system (the Diagnosis).', build: entries('conditions') },
  { name: 'open-problems', description: 'The Open Problems of Charitology, with status.', build: entries('problems') },
  { name: 'programs', description: 'Every program, with status and the conditions it treats.', build: entries('programs') },
  { name: 'tools', description: 'Every tool, with status.', build: entries('tools') },
  { name: 'record', description: 'Every information base in the Record.', build: entries('record') },
  { name: 'interventions', description: 'The Intervention Database: depth, evidence grade, mechanism, cost data.', build: entries('interventions') },
  { name: 'charities', description: 'The Charity Index: organizations with depth classifications (hypotheses, not ratings).', build: entries('charities') },
  { name: 'encyclopedia', description: 'Encyclopedia entries.', build: entries('encyclopedia') },
  { name: 'cases', description: 'Historical case studies, including failures.', build: entries('cases') },
  { name: 'myths', description: 'The Myth-Busting Series.', build: entries('myths') },
  { name: 'disagreements', description: 'The Disagreement Register.', build: entries('disagreements') },
  { name: 'traditions', description: 'The Giving Traditions Library.', build: entries('traditions') },
  { name: 'principles', description: 'Principles of Charitology, chapter by chapter.', build: entries('principles') },
  { name: 'forecasts', description: 'Forecast questions, forecasts and outcomes.', build: entries('forecasts') },
  { name: 'lexicon', description: 'The Lexicon of terms.', build: async () => (await getCollection('lexicon')).map((e) => ({ id: e.id, ...e.data })) },
  { name: 'causes', description: 'Cause areas with their editorial positions on five dimensions.', build: async () => causes },
  { name: 'frameworks', description: 'Moral frameworks with their editorial cause priorities.', build: async () => frameworks },
  { name: 'depth', description: 'The five-level depth scale, from relief to source.', build: async () => depth },
  { name: 'checklist', description: 'The Giver’s Checklist.', build: async () => checklist },
  { name: 'figures', description: 'Headline figures with their sources.', build: async () => figures },
  { name: 'source-map', description: 'Which sources Humanity’s Checklist links to which world problems.', build: async () => sourcesMap },
  { name: 'sources', description: 'Every source cited on the site, with the pages that cite it.', build: allCitations },
];

export async function buildEndpoint(name: string): Promise<unknown> {
  const endpoint = ENDPOINTS.find((e) => e.name === name);
  if (!endpoint) throw new Error(`Unknown endpoint: ${name}`);
  return {
    name,
    description: endpoint.description,
    license: 'CC BY 4.0. Cite “Charitology (charitology.org)”.',
    generated: new Date().toISOString().slice(0, 10),
    data: flattenRefs(await endpoint.build()),
  };
}
