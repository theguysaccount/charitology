import assert from 'node:assert/strict';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { pageIdentity, routes, symbols } from '../src/lib/site-identities.ts';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const sheet = readFileSync('dist/site-identities.css', 'utf8');
const byPath = new Map(routes.map((route) => [route.path, route]));
assert.equal(byPath.size, routes.length);
for (const { path, symbol, tone } of routes) {
  assert.ok(symbols[symbol], path);
  assert.ok(sheet.includes(`a[href^="${base + path}"]{--link-glyph:var(--glyph-${symbol});--link-tone:var(--tone-${tone})}`), path);
}

for (const [collection, prefix] of [
  ['programs', 'programs'], ['tools', 'tools'], ['record', 'record'],
  ['conditions', 'diagnosis'], ['problems', 'open-problems'],
  ['encyclopedia', 'record/encyclopedia'], ['interventions', 'record/interventions'], ['cases', 'record/case-studies'],
  ['myths', 'record/myths'], ['disagreements', 'record/disagreements'], ['traditions', 'record/traditions'],
  ['principles', 'record/principles'], ['journal', 'record/journal'],
]) {
  const slugs = readdirSync(`src/content/${collection}`)
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => file.replace(/\.mdx?$/, ''));
  const identities = slugs.map((slug) => {
    const path = `/${prefix}/${slug}/`;
    const route = byPath.get(path);
    assert.ok(route, `Missing destination symbol for ${path}`);
    return route.symbol;
  });
  assert.equal(new Set(identities).size, slugs.length, `Duplicate symbols in ${collection}`);
}

const pages = globSync('**/*.html', { cwd: 'dist' });
assert.ok(pages.length > 0);
for (const page of pages) {
  const route = '/' + page.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  const html = readFileSync(`dist/${page}`, 'utf8');
  const main = html.match(/<main id="main"[^>]*>/)?.[0];
  const { symbol, tone } = pageIdentity(route);
  assert.ok(main?.includes(`data-site-symbol="${symbol}"`), page);
  assert.ok(main.includes(`data-site-tone="${tone}"`), page);
  assert.ok(html.includes(`rel="stylesheet" href="${base}/site-identities.css"`), page);
  assert.equal(html.match(/<select id="site-theme"(?:\s|>)/g)?.length, 1, page);
}
console.log(`Site identity and theme checked on ${pages.length} pages, with unique symbols in the core catalogs and reference libraries.`);
