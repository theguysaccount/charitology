// Read the built sitemap set. /sitemap.xml may be a single <urlset> or a
// <sitemapindex> whose children are <urlset> files in the same build. Every
// structural rule is enforced here, so callers can keep their own URL checks
// unchanged and apply them to the complete set of URLs.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_URLS = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;
const locsIn = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

function readUrlset(dist, rel, origin) {
  const file = join(dist, rel);
  assert.ok(existsSync(file), `Sitemap file is missing from the build: ${rel}`);
  assert.ok(statSync(file).size <= MAX_BYTES, `${rel} exceeds 50 MB`);
  const xml = readFileSync(file, 'utf8');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/, `${rel} must be a sitemap <urlset>`);
  assert.ok(!xml.includes('<sitemapindex'), `${rel} must not nest a sitemap index`);
  const locs = locsIn(xml);
  assert.equal((xml.match(/<url>/g) ?? []).length, locs.length, `${rel}: every <url> needs exactly one <loc>`);
  assert.ok(locs.length > 0 && locs.length <= MAX_URLS, `${rel} must list 1 to ${MAX_URLS} URLs, not ${locs.length}`);
  for (const loc of locs) assert.equal(new URL(loc).origin, origin, `${rel}: mixed origin ${loc}`);
  return { file: rel, xml, locs };
}

/**
 * @param {string} dist built site directory
 * @returns {{ index: boolean, children: { file: string, loc: string, locs: string[] }[], locs: string[], xml: string }}
 */
export function readBuiltSitemapSet(dist) {
  const rootXml = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  if (!rootXml.includes('<sitemapindex')) {
    const first = locsIn(rootXml)[0];
    assert.ok(first, 'sitemap.xml lists no URLs');
    const set = readUrlset(dist, 'sitemap.xml', new URL(first).origin);
    return { index: false, children: [{ file: 'sitemap.xml', loc: null, locs: set.locs }], locs: set.locs, xml: rootXml };
  }
  assert.match(rootXml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/, 'sitemap.xml must be a well-formed sitemap index');
  assert.ok(!rootXml.includes('<url>'), 'A sitemap index must not list page URLs directly');
  const childLocs = locsIn(rootXml);
  assert.equal((rootXml.match(/<sitemap>/g) ?? []).length, childLocs.length, 'Every <sitemap> needs exactly one <loc>');
  assert.ok(childLocs.length >= 2, 'A sitemap index needs at least two children');
  assert.equal(new Set(childLocs).size, childLocs.length, 'Duplicate child sitemap');
  const origin = new URL(childLocs[0]).origin;
  const home = new URL(childLocs[0]);
  const base = home.pathname.replace(/[^/]*$/, '');
  const children = childLocs.map((loc) => {
    const url = new URL(loc);
    assert.equal(url.origin, origin, `Mixed origin child sitemap ${loc}`);
    assert.ok(url.pathname.startsWith(base) && /^[a-z0-9-]+\.xml$/.test(url.pathname.slice(base.length)), `Child sitemap must sit beside sitemap.xml: ${loc}`);
    const rel = url.pathname.slice(base.length);
    assert.notEqual(rel, 'sitemap.xml', 'The index cannot list itself');
    return { loc, ...readUrlset(dist, rel, origin) };
  });
  const locs = children.flatMap((child) => child.locs);
  return { index: true, children, locs, xml: children.map((child) => child.xml).join('\n') };
}
