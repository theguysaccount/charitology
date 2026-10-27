import type { APIRoute } from "astro";
import newsletter from "../data/newsletter.json";
import { absolute } from "../lib/site";
const esc = (s: string) =>
  s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
export const GET: APIRoute = ({ site }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${newsletter.title}</title><description>Source-linked field letters from Charitology. Read through RSS or choose confirmed email signup on the Charitology Letter page.</description><link>${absolute("/record/podcast-and-newsletter/", site)}</link><language>en-us</language><atom:link href="${absolute("/newsletter.xml", site)}" rel="self" type="application/rss+xml"/>${newsletter.issues.map((i) => `<item><title>${esc(i.title)}</title><description>${esc(i.summary)}</description><link>${absolute(i.path, site)}</link><guid isPermaLink="true">${absolute(i.path, site)}</guid><pubDate>${new Date(i.date + "T12:00:00-07:00").toUTCString()}</pubDate></item>`).join("")}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
