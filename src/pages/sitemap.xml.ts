import type { APIRoute } from 'astro';
import { SITEMAP_CHILDREN } from '../lib/sitemaps';
import { absolute } from '../lib/site';

// Sitemap index. Core pages and the Wave 1 registry dossiers are separate children.
export const GET: APIRoute = async ({ site }) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_CHILDREN.map((name) => `  <sitemap><loc>${absolute(`/${name}`, site)}</loc></sitemap>`).join('\n')}
</sitemapindex>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
