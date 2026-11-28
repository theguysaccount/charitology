// Partitioned sitemaps. /sitemap.xml is a sitemap index; each child is a
// urlset well under the protocol's 50,000-URL and 50 MB limits.
import { allPages } from './pages';
import { absolute } from './site';
import { WAVE1_SITEMAP_SECTIONS } from './registry-wave1';
import { WAVE1B_SITEMAP_SECTIONS } from './registry-wave1b';
import { WAVE1C_SITEMAP_SECTIONS } from './registry-wave1c';
import { WAVE1D_SITEMAP_SECTIONS } from './registry-wave1d';

const EXCLUDED_FROM_SITEMAP = new Set(['/search/', '/404/', '/browser-data/']);
export const SITEMAP_CHILDREN = ['sitemap-core.xml', 'sitemap-registries-wave1.xml', 'sitemap-registries-wave1b.xml', 'sitemap-registries-wave1c.xml', 'sitemap-registries-wave1d.xml'] as const;
export type SitemapChild = (typeof SITEMAP_CHILDREN)[number];

export async function sitemapPaths(): Promise<Record<SitemapChild, string[]>> {
  const seen = new Set<string>();
  const parts: Record<SitemapChild, string[]> = { 'sitemap-core.xml': [], 'sitemap-registries-wave1.xml': [], 'sitemap-registries-wave1b.xml': [], 'sitemap-registries-wave1c.xml': [], 'sitemap-registries-wave1d.xml': [] };
  for (const page of await allPages()) {
    if (page.path.includes('#') || EXCLUDED_FROM_SITEMAP.has(page.path) || seen.has(page.path)) continue;
    seen.add(page.path);
    const child = WAVE1_SITEMAP_SECTIONS.has(page.section) ? 'sitemap-registries-wave1.xml'
      : WAVE1B_SITEMAP_SECTIONS.has(page.section) ? 'sitemap-registries-wave1b.xml'
      : WAVE1C_SITEMAP_SECTIONS.has(page.section) ? 'sitemap-registries-wave1c.xml'
      : WAVE1D_SITEMAP_SECTIONS.has(page.section) ? 'sitemap-registries-wave1d.xml' : 'sitemap-core.xml';
    parts[child].push(page.path);
  }
  return parts;
}

export function urlset(paths: string[], site: URL | undefined) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${absolute(p, site)}</loc></url>`).join('\n')}
</urlset>
`;
}

export async function childSitemap(name: SitemapChild, site: URL | undefined) {
  const paths = (await sitemapPaths())[name];
  if (paths.length === 0 || paths.length > 50_000) throw new Error(`Sitemap ${name} must hold 1 to 50,000 URLs, not ${paths.length}.`);
  return new Response(urlset(paths, site), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
