import type { APIRoute } from 'astro';
import { allPages } from '../lib/pages';
import { absolute } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
  const paths = [...new Set((await allPages()).map((p) => p.path).filter((p) => !p.includes('#')))];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${absolute(p, site)}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
