// Full-text search over the built site with Pagefind. The index is generated
// at build time (npm run build), so search works on the deployed site and in
// `npm run preview`, but not in `npm run dev`.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface Hit {
  url: string;
  title: string;
  excerpt: string;
  section: string;
}

let loaded: Promise<any | null> | undefined;

function load(): Promise<any | null> {
  loaded ??= (async () => {
    try {
      const pf = await import(/* @vite-ignore */ `${BASE}/pagefind/pagefind.js`);
      await pf.options({ baseUrl: `${BASE}/`, excerptLength: 36 });
      return pf;
    } catch {
      return null;
    }
  })();
  return loaded;
}

const SECTIONS: [string, string][] = [
  ['/diagnosis/', 'Diagnosis'],
  ['/open-problems/', 'Open Problems'],
  ['/programs/', 'Programs'],
  ['/tools/', 'Tools'],
  ['/forecasts/', 'Forecasts'],
  ['/record/interventions/', 'Intervention Database'],
  ['/record/case-studies/', 'Case Studies'],
  ['/record/encyclopedia/', 'Encyclopedia'],
  ['/record/principles/', 'Principles'],
  ['/record/myths/', 'Myths'],
  ['/record/disagreements/', 'Disagreements'],
  ['/record/traditions/', 'Traditions'],
  ['/record/', 'Record'],
  ['/method/', 'Method'],
  ['/manifesto/', 'Manifesto'],
];

export function sectionOf(url: string): string {
  const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  return SECTIONS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'Charitology';
}

/** Returns null when the search index isn't available (for example in dev mode). */
export async function searchSite(query: string, limit = 12): Promise<Hit[] | null> {
  const pf = await load();
  if (!pf) return null;
  const res = await pf.search(query);
  const data = await Promise.all(res.results.slice(0, limit).map((r: any) => r.data()));
  return data.map((d: any) => ({
    url: d.url,
    title: d.meta?.title ?? d.url,
    excerpt: d.excerpt ?? '',
    section: sectionOf(d.url),
  }));
}
