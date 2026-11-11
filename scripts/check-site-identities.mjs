import assert from 'node:assert/strict';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { pageIdentity, routes, symbols } from '../src/lib/site-identities.ts';
import {
  causeSymbols, checklistSymbols, depthSymbols, fragmentSymbols, hazardSymbols, lensSymbols,
  needSymbols, networkSymbols, providerSymbols, sourceSymbols, starterSymbols, teachingSymbols,
} from '../src/lib/list-identities.ts';
import { charityNetworks } from '../src/data/charity-networks.mjs';
import { charityStartJobs } from '../src/data/charity-start.mjs';
import { teachingMaterials } from '../src/data/education-kit.mjs';
import { HAZARDS } from '../src/lib/disaster-incidents/interpretations/v1/limits.mjs';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const sheet = readFileSync('dist/site-identities.css', 'utf8');
const byPath = new Map(routes.map((route) => [route.path, route]));
assert.equal(byPath.size, routes.length);
for (const { path, symbol, tone } of routes) {
  assert.ok(symbols[symbol], path);
  const match = path === '/' ? '=' : '^=';
  assert.ok(sheet.includes(`a[href${match}"${base + path}"]{--link-glyph:var(--glyph-${symbol});--link-tone:var(--tone-${tone});--list-mark:inline-block}`), path);
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

const json = (name) => JSON.parse(readFileSync(`src/data/${name}.json`, 'utf8'));
const ids = (items) => items.map(({ id }) => id);
for (const [name, keys, mapping] of [
  ['cause areas', ids(json('causes').causes), causeSymbols],
  ['moral lenses', ids(json('frameworks').frameworks), lensSymbols],
  ['upstream sources', ids(json('sources-map').sources), sourceSymbols],
  ['depth levels', json('depth').map(({ level }) => String(level)), depthSymbols],
  ['Giver’s Checklist', ids(json('checklist')), checklistSymbols],
  ['charity networks', ids(charityNetworks), networkSymbols],
  ['charity starter jobs', ids(charityStartJobs), starterSymbols],
  ['Charity OS providers', ids(json('os-providers').providers), providerSymbols],
  ['teaching materials', ids(teachingMaterials), teachingSymbols],
  ['disaster hazards', HAZARDS, hazardSymbols],
  ['country measures', ids(json('countries').indicators), needSymbols],
]) {
  const marks = keys.map((key) => mapping[key]);
  assert.ok(marks.every((mark) => Object.hasOwn(symbols, mark)), `Missing symbol in ${name}`);
  assert.equal(new Set(marks).size, keys.length, `Duplicate symbols in ${name}`);
}
for (const [path, entries] of Object.entries(fragmentSymbols)) {
  for (const [id, symbol] of Object.entries(entries)) {
    assert.ok(sheet.includes(`a[href="${base + path}#${id}"],main[data-site-path="${path}"] a[href="#${id}"]{--link-glyph:var(--glyph-${symbol})}`),
      `Missing fragment mark for ${path}#${id}`);
  }
}

const pages = globSync('**/*.html', { cwd: 'dist' });
assert.ok(pages.length > 0);
for (const page of pages) {
  const route = '/' + page.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  const html = readFileSync(`dist/${page}`, 'utf8');
  assert.equal(html.match(/<main(?:\s|>)/g)?.length, 1, `Expected one main landmark in ${page}`);
  const main = html.match(/<main id="main"[^>]*>/)?.[0];
  const { symbol, tone } = pageIdentity(route);
  assert.ok(main?.includes(`data-site-symbol="${symbol}"`), page);
  assert.ok(main.includes(`data-site-tone="${tone}"`), page);
  assert.ok(html.includes(`rel="stylesheet" href="${base}/site-identities.css"`), page);
  const theme = html.match(/<fieldset [^>]*id="site-theme"[^>]*>[\s\S]*?<\/fieldset>/g);
  assert.equal(theme?.length, 1, page);
  assert.deepEqual([...theme[0].matchAll(/type="radio" name="site-theme" value="([^"]+)"/g)].map(([, mode]) => mode),
    ['system', 'light', 'dark'], page);
  assert.ok(!html.includes('data-site-symbol=""'), page);
  assert.equal(html.match(/<h1(?:\s|>)/g)?.length, 1, `Expected one page title in ${page}`);
}
console.log(`Site identity and theme checked on ${pages.length} pages, with distinct symbols in the catalogs, reference libraries and editorial lists.`);
