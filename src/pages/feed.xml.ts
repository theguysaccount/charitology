import type { APIRoute } from 'astro';
import { allPages } from '../lib/pages';
import { SITE, absolute } from '../lib/site';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const pages = (await allPages()).filter((p) => p.section !== 'Charitology');
  const items = pages
    .map((p) => {
      const link = absolute(p.path, site);
      return `    <item>
      <title>${esc(`${p.title} (${p.section})`)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <category>${esc(p.section)}</category>${p.summary ? `\n      <description>${esc(p.summary)}</description>` : ''}${
        p.date ? `\n      <pubDate>${p.date.toUTCString()}</pubDate>` : ''
      }
    </item>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE.name}</title>
    <link>${absolute('/', site)}</link>
    <description>${esc(SITE.description)}</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
