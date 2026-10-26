// Every page on the site with its title and summary, for the RSS feed and the sitemap.
import { getCollection, type CollectionKey } from 'astro:content';
import { STATIC_PAGES, hrefFor } from './content';

export interface PageInfo {
  path: string;
  title: string;
  summary?: string;
  date?: Date;
  section: string;
}

const SECTIONS: [CollectionKey, string][] = [
  ['journal', 'Journal'],
  ['conditions', 'Diagnosis'],
  ['problems', 'Open Problems'],
  ['programs', 'Programs'],
  ['tools', 'Tools'],
  ['record', 'Record'],
  ['forecasts', 'Forecasts'],
  ['encyclopedia', 'Encyclopedia'],
  ['interventions', 'Intervention Database'],
  ['cases', 'Case Studies'],
  ['myths', 'Myths'],
  ['disagreements', 'Disagreements'],
  ['traditions', 'Traditions'],
  ['principles', 'Principles'],
];

export async function allPages(): Promise<PageInfo[]> {
  const pages: PageInfo[] = Object.entries(STATIC_PAGES)
    .filter(([path]) => path.endsWith('/'))
    .map(([path, title]) => ({ path, title, section: 'Charitology' }));
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
  return pages;
}
