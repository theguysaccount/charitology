import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';

/** Collections that live under /record/<section>/<id>/. */
export const RECORD_SECTIONS = {
  encyclopedia: 'encyclopedia',
  interventions: 'interventions',
  cases: 'case-studies',
  traditions: 'traditions',
  myths: 'myths',
  disagreements: 'disagreements',
  principles: 'principles',
  journal: 'journal',
} as const;

export type RecordSectionCollection = keyof typeof RECORD_SECTIONS;

const BASES: Partial<Record<CollectionKey, string>> = {
  conditions: '/diagnosis/',
  programs: '/programs/',
  tools: '/tools/',
  record: '/record/',
  problems: '/open-problems/',
  forecasts: '/forecasts/',
};

/** Root-relative path for any entry (pass through url() before rendering). */
export function hrefFor(collection: CollectionKey, id: string): string {
  if (collection in RECORD_SECTIONS) {
    return `/record/${RECORD_SECTIONS[collection as RecordSectionCollection]}/${id}/`;
  }
  if (collection === 'charities') return `/record/charity-index/#${id}`;
  if (collection === 'lexicon') return `/record/lexicon/#${id}`;
  return `${BASES[collection] ?? '/'}${id}/`;
}

export async function conditionsInOrder() {
  return (await getCollection('conditions')).sort((a, b) => a.data.number - b.data.number);
}

export async function problemsInOrder() {
  return (await getCollection('problems')).sort((a, b) => a.data.number - b.data.number);
}

type CatalogKey = 'programs' | 'tools' | 'record';
export type CatalogEntry = CollectionEntry<CatalogKey>;

export const GROUP_ORDER: Record<CatalogKey, string[]> = {
  programs: ['Research', 'Funding', 'People and education', 'Reach'],
  tools: ['For donors', 'For nonprofits and funders', 'For everyone'],
  record: ['Flagship references', 'Annual publications', 'Research archives', 'Thought and teaching'],
};

/** Catalog entries grouped in the published group order, each group sorted by `order`. */
export async function catalogGroups(collection: CatalogKey) {
  const entries = (await getCollection(collection)) as CatalogEntry[];
  return GROUP_ORDER[collection]
    .map((group) => ({
      group,
      entries: entries.filter((e) => e.data.group === group).sort((a, b) => a.data.order - b.data.order),
    }))
    .filter((g) => g.entries.length > 0);
}

/** Everything in the field that names a given condition, for the backlinks on condition pages. */
export async function treatmentsFor(conditionId: string) {
  const out: { collection: CatalogKey; entry: CatalogEntry }[] = [];
  for (const collection of ['programs', 'tools', 'record'] as const) {
    for (const entry of (await getCollection(collection)) as CatalogEntry[]) {
      if (entry.data.conditions.some((c) => c.id === conditionId)) out.push({ collection, entry });
    }
  }
  return out;
}

let titleIndex: Map<string, string> | undefined;

/** Title for a root-relative path such as "/tools/values-compass/", for "related" links. */
export async function titleForPath(path: string): Promise<string | undefined> {
  if (!titleIndex) {
    titleIndex = new Map();
    const named: [CollectionKey, (e: any) => string][] = [
      ['conditions', (e) => e.data.title],
      ['programs', (e) => e.data.title],
      ['tools', (e) => e.data.title],
      ['record', (e) => e.data.title],
      ['problems', (e) => e.data.title],
      ['forecasts', (e) => e.data.title],
      ['encyclopedia', (e) => e.data.title],
      ['interventions', (e) => e.data.title],
      ['cases', (e) => e.data.title],
      ['traditions', (e) => e.data.title],
      ['myths', (e) => e.data.title],
      ['disagreements', (e) => e.data.title],
      ['principles', (e) => e.data.title],
      ['journal', (e) => e.data.title],
    ];
    for (const [collection, title] of named) {
      for (const e of await getCollection(collection)) titleIndex.set(hrefFor(collection, e.id), title(e));
    }
    for (const [path, title] of Object.entries(STATIC_PAGES)) titleIndex.set(path, title);
  }
  const key = path.endsWith('/') || path.includes('#') || path.includes('.') ? path : `${path}/`;
  return titleIndex.get(key) ?? (key.includes('#') ? titleIndex.get(key.split('#')[0]) : undefined);
}

export const STATIC_PAGES: Record<string, string> = {
  '/': 'Charitology',
  '/manifesto/': 'Ten Dollars: the manifesto',
  '/diagnosis/': 'The Diagnosis',
  '/method/': 'The Charitology Method',
  '/programs/': 'Programs',
  '/tools/': 'Tools',
  '/record/': 'The Record',
  '/open-problems/': 'The Open Problems of Charitology',
  '/contribute/': 'Become a charitologist',
  '/about/': 'About Charitology',
  '/search/': 'Search',
  '/feed.xml': 'RSS feed of new and updated pages',
};

export async function statusCounts(collection: CatalogKey) {
  const counts = { live: 0, seeded: 0, designed: 0, partners: 0 };
  for (const e of (await getCollection(collection)) as CatalogEntry[]) counts[e.data.status] += 1;
  return counts;
}
