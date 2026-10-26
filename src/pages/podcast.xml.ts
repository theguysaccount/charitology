import type { APIRoute } from "astro";
import podcast from "../data/podcast.json";
import { absolute } from "../lib/site";
const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export const GET: APIRoute = ({ site }) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>${esc(podcast.title)}</title><link>${absolute("/record/podcast-and-newsletter/", site)}</link><description>Six computer-narrated readings from the open textbook. Editorial drafts with full transcripts and source links; no guest interviews or peer review is implied.</description><language>en-us</language><copyright>Charitology, CC BY 4.0</copyright><atom:link href="${absolute("/podcast.xml", site)}" rel="self" type="application/rss+xml"/><itunes:author>Charitology editorial project</itunes:author><itunes:explicit>false</itunes:explicit>${podcast.episodes.map((e) => `<item><title>${esc(e.title)}</title><link>${absolute("/record/podcast/" + e.id + "/", site)}</link><guid isPermaLink="true">${absolute("/record/podcast/" + e.id + "/", site)}</guid><description>${esc(e.description + " " + e.narration)}</description><pubDate>${new Date(e.date + "T12:00:00-07:00").toUTCString()}</pubDate><enclosure url="${absolute(e.audio, site)}" length="${e.bytes}" type="audio/mpeg"/><itunes:duration>${e.seconds}</itunes:duration><itunes:episode>${e.number}</itunes:episode><itunes:season>1</itunes:season></item>`).join("")}</channel></rss>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
