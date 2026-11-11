// Full-text search over the built site with Pagefind. The index is generated
// at build time (npm run build), so search works on the deployed site and in
// `npm run preview`, but not in `npm run dev`.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface Hit {
  url: string;
  title: string;
  excerpt: string;
  section: string;
  sectionHref: string;
  code?: string;
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

const SECTIONS: [string, string, string?][] = [
  ['/diagnosis/', 'Diagnosis'],
  ['/open-problems/', 'Open Problems'],
  ['/programs/', 'Programs'],
  ['/tools/', 'Tools'],
  ['/forecasts/', 'Forecasts'],
  ['/record/funding-flows/', 'Funding flows'],
  ['/record/charity-index/', 'Global Charity Index'],
  ['/record/charity-financials/', 'Charity financial filings'],
  ['/record/countries/', 'Country profiles', '/record/country-profiles/'],
  ['/record/country-profiles/', 'Country profiles'],
  ['/record/interventions/', 'Intervention Database'],
  ['/record/case-studies/', 'Case Studies'],
  ['/record/encyclopedia/', 'Encyclopedia'],
  ['/record/principles/', 'Principles'],
  ['/record/myths/', 'Myths'],
  ['/record/disagreements/', 'Disagreements'],
  ['/record/traditions/', 'Traditions'],
  ['/record/', 'Record'],
  ['/for-charities/fundraising/', 'Fundraising'],
  ['/for-charities/networks/', 'Charity networks'],
  ['/for-charities/', 'For charities'],
  ['/learn/', 'Teach and learn'],
  ['/observations/', 'Sourced observations'],
  ['/disasters/', 'Disaster Desk'],
  ['/research-ledger/', 'Research Ledger'],
  ['/method/', 'Method'],
  ['/manifesto/', 'Manifesto'],
];

function resultIdentity(url: string) {
  const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  const [prefix, section, href = prefix] = SECTIONS.find(([prefix]) => path.startsWith(prefix))
    ?? ['/', 'Charitology'];
  const country = path.match(/^\/record\/countries\/([a-z]{3})\//);
  const agreement = path.match(/^\/record\/funding-flows\/brazil-project-execution\/(\d+)\//);
  return { section, sectionHref: BASE + href, code: country?.[1].toUpperCase() ?? agreement?.[1] };
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
    ...resultIdentity(d.url),
  }));
}
