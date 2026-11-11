import assert from 'node:assert/strict';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { pageIdentity, routes, symbols } from '../src/lib/site-identities.ts';
import { sectionNavigation } from '../src/lib/section-navigation.ts';
import { sourceSymbol } from '../src/lib/source-symbol.ts';
import {
  causeSymbols, checklistSymbols, clubMeetingSymbols, datasetSymbols, depthSymbols, ecosystemSymbols,
  diligenceGroupSymbols, diligenceItemSymbols, fragmentSymbols, fundraisingSourceSymbols, hazardSymbols, lensSymbols, needSymbols, networkSymbols, osDiscussionSymbols,
  providerSymbols, seminarSymbols, sourceSymbols, starterSymbols, teachingSymbols, worksheetSymbols,
} from '../src/lib/list-identities.ts';
import { charityNetworks } from '../src/data/charity-networks.mjs';
import { charityStartJobs } from '../src/data/charity-start.mjs';
import { beginnerMeetings, seminarSessions, teachingMaterials, worksheet } from '../src/data/education-kit.mjs';
import { fundraisingSources } from '../src/data/fundraising.mjs';
import { HAZARDS } from '../src/lib/disaster-incidents/interpretations/v1/limits.mjs';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const sheet = readFileSync('dist/site-identities.css', 'utf8');
const byPath = new Map(routes.map((route) => [route.path, route]));
assert.equal(byPath.size, routes.length);
for (const { path, symbol, tone } of routes) {
  assert.ok(symbols[symbol], path);
  const match = path === '/' ? '=' : '^=';
  const selector = `a[href${match}"${base + path}"]`;
  const encoded = path.includes(':') ? `,a[href${match}"${base + path.replace(':', '%3A')}" i]` : '';
  assert.ok(sheet.includes(`${selector}${encoded}{--link-glyph:var(--glyph-${symbol});--link-tone:var(--tone-${tone});--list-mark:inline-block}`), path);
}

for (const [collection, prefix] of [
  ['programs', 'programs'], ['tools', 'tools'], ['record', 'record'],
  ['conditions', 'diagnosis'], ['problems', 'open-problems'],
  ['encyclopedia', 'record/encyclopedia'], ['interventions', 'record/interventions'], ['cases', 'record/case-studies'],
  ['myths', 'record/myths'], ['disagreements', 'record/disagreements'], ['traditions', 'record/traditions'],
  ['principles', 'record/principles'], ['journal', 'record/journal'], ['forecasts', 'forecasts'],
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
const contentIds = (name) => readdirSync(`src/content/${name}`)
  .filter((file) => /\.mdx?$/.test(file)).map((file) => file.replace(/\.mdx?$/, ''));
const ecosystemUrls = [...new Set(Object.values(json('ecosystem')).flatMap((items) => items.map((item) => item.url)))];
const api = JSON.parse(readFileSync('dist/api/v1/index.json', 'utf8'));
const datasetNames = ['index', ...api.endpoints.map(({ name }) => name)];
for (const [name, keys, mapping] of [
  ['due diligence groups', ids(json('due-diligence').groups), diligenceGroupSymbols],
  ['due diligence checks', ids(json('due-diligence').groups.flatMap(group => group.items)), diligenceItemSymbols],
  ['OS research discussions', ids(json('os-user-needs').entries), osDiscussionSymbols],
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
  ['editorial charity profiles', contentIds('charities'), fragmentSymbols['/record/charity-index/']],
  ['glossary terms', ids(json('lexicon')), fragmentSymbols['/record/lexicon/']],
  ['API datasets', datasetNames, datasetSymbols],
  ['external projects', ecosystemUrls, ecosystemSymbols],
  ['beginner meetings', beginnerMeetings.map(({ number }) => number), clubMeetingSymbols],
  ['university seminars', seminarSessions.map(({ number }) => number), seminarSymbols],
  ['student worksheet', ids(worksheet), worksheetSymbols],
  ['fundraising sources', ids(fundraisingSources), fundraisingSourceSymbols],
]) {
  const marks = keys.map((key) => mapping[key]);
  assert.ok(marks.every((mark) => Object.hasOwn(symbols, mark)), `Missing symbol in ${name}`);
  assert.equal(new Set(marks).size, keys.length, `Duplicate symbols in ${name}`);
}
for (const name of datasetNames) {
  assert.ok(sheet.includes(`a[href="${base}/api/v1/${name}.json"]{--link-glyph:var(--glyph-${datasetSymbols[name]});--list-mark:inline-block}`), name);
}
for (const href of ecosystemUrls) {
  assert.ok(sheet.includes(`a[href^="${href}"]{--link-glyph:var(--glyph-${ecosystemSymbols[href]});--list-mark:inline-block}`), href);
}
for (const [path, entries] of Object.entries(fragmentSymbols)) {
  for (const [id, symbol] of Object.entries(entries)) {
    assert.ok(sheet.includes(`a[href="${base + path}#${id}"],main[data-site-path="${path}"] a[href="#${id}"]{--link-glyph:var(--glyph-${symbol})}`),
      `Missing fragment mark for ${path}#${id}`);
  }
}

for (const [href, mark] of [
  ['https://archive.example/REPORT.PDF?edition=2', 'document'],
  ['https://www.gov.br/charities.csv', 'table'],
  ['https://www.data.gouv.fr/fr/', 'columns'],
  ['https://doi.org/10.0000/example', 'flask'],
  ['/data/example.json.gz', 'packet'],
  ['/audio/example.mp3', 'headphones'],
]) {
  assert.equal(sourceSymbol(href), mark, href);
}

for (const [route, entries] of Object.entries(sectionNavigation)) {
  const html = readFileSync(`dist${route}index.html`, 'utf8');
  const outline = html.match(/<nav class="page-sections"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(outline, `Missing section shortcuts in ${route}`);
  assert.equal(new Set(entries.map(([, , mark]) => mark)).size, entries.length, route);
  for (const [id, , mark] of entries) {
    assert.equal([...html.matchAll(new RegExp(` id="${id}"`, 'g'))].length, 1, `Expected one ${route}#${id}`);
    assert.ok(outline.includes(`href="#${id}"`), `Missing link to ${route}#${id}`);
    assert.ok(outline.includes(`data-site-symbol="${mark}"`), `Missing ${mark} in ${route}`);
    assert.ok(sheet.includes(`a[href="${base + route}#${id}"]`), `Missing fragment rule for ${route}#${id}`);
  }
}

const diligence = readFileSync('dist/tools/due-diligence-checklist/index.html', 'utf8');
for (const group of json('due-diligence').groups) {
  const symbol = diligenceGroupSymbols[group.id];
  assert.ok(new RegExp(`href="#dd-g-${group.id}"[^>]*>\\s*<span[^>]*data-site-symbol="${symbol}"`).test(diligence), group.id);
  for (const item of group.items) {
    assert.ok(new RegExp(`data-item="${item.id}"[^>]*>\\s*<legend[^>]*>\\s*<span[^>]*data-site-symbol="${diligenceItemSymbols[item.id]}"`).test(diligence), item.id);
  }
}

const osPlan = readFileSync('dist/for-charities/os-plan/index.html', 'utf8');
for (const id of ids(json('os-user-needs').entries)) {
  assert.ok(new RegExp(` id="${id}"[^>]*>[\\s\\S]*?data-site-symbol="${osDiscussionSymbols[id]}"[^>]*></span>\\s*<a href="#${id}"`).test(osPlan), id);
}

for (const kind of ['tools', 'benefits']) {
  const html = readFileSync(`dist/for-charities/${kind}/index.html`, 'utf8');
  const cardIds = [...html.matchAll(/<article id="([^"]+)" class="directory-card"/g)].map(([, id]) => id);
  assert.ok(cardIds.length > 0, kind);
  const index = html.match(/<details class="listing-index"[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(index, `Missing listing index for ${kind}`);
  const marks = [];
  for (const id of cardIds) {
    const symbol = index.match(new RegExp(`href="#${id}"[^>]*><span[^>]*data-site-symbol="([^"]+)"`))?.[1];
    assert.ok(symbol && Object.hasOwn(symbols, symbol), `Missing listing shortcut mark for ${id}`);
    const start = html.indexOf(`<article id="${id}"`);
    const card = html.slice(start, html.indexOf('</article>', start));
    assert.ok(card.includes(`data-site-symbol="${symbol}"`), `Shortcut and card marks differ for ${id}`);
    marks.push(symbol);
  }
  assert.equal(new Set(marks).size, cardIds.length, `Duplicate listing marks in ${kind}`);
}

const fundingIndex = readFileSync('dist/record/funding-flows/index.html', 'utf8');
for (const { path } of routes.filter(({ path }) => path.startsWith('/record/funding-flows/') && path !== '/record/funding-flows/')) {
  assert.ok(fundingIndex.includes(`href="${base + path}"`), `Missing funding directory entry for ${path}`);
}
assert.ok(fundingIndex.includes('aria-label="Browse funding flows"'));

const pages = globSync('**/*.html', { cwd: 'dist' });
assert.ok(pages.length > 0);
let outlines = 0;
let matchingHeadings = 0;
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
  assert.deepEqual([...theme[0].matchAll(/<span[^>]*>(System|Light|Dark)<\/span>/g)].map(([, label]) => label),
    ['System', 'Light', 'Dark'], page);
  assert.ok(!html.includes('data-site-symbol=""'), page);
  const outline = html.match(/<nav class="page-sections"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  if (outline) {
    outlines++;
    const links = [...outline.matchAll(/<a href="#([^"]+)"/g)].map(([, id]) => id);
    assert.ok(links.length >= 2, page);
    assert.equal(new Set(links).size, links.length, `Duplicate outline destination in ${page}`);
    for (const id of links) assert.ok(html.includes(` id="${id}"`), `Missing ${id} in ${page}`);
    const headingMarks = new Map([...html.matchAll(/<h2 data-section-symbol="([^"]+)" id="([^"]+)"/g)]
      .map(([, symbol, id]) => [id, symbol]));
    for (const [, id, mark] of outline.matchAll(/href="#([^"]+)"[^>]*><span[^>]*data-site-symbol="([^"]+)"/g)) {
      const headingMark = headingMarks.get(id);
      if (!headingMark || sectionNavigation[route]?.some(([slug]) => slug === id)) continue;
      assert.equal(mark, headingMark, `Outline and heading marks differ for ${page}#${id}`);
      matchingHeadings++;
    }
    assert.equal([...outline.matchAll(/data-site-symbol="[^"]+"/g)].length, links.length, page);
  }
  const country = page.match(/^record\/countries\/([a-z]{3})\/index\.html$/);
  if (country) {
    assert.ok(outline, `Missing country outline in ${page}`);
    assert.match(html, new RegExp(`class="identity-code title-code"[^>]*>${country[1].toUpperCase()}</span>`), page);
  }
  assert.equal(html.match(/<h1(?:\s|>)/g)?.length, 1, `Expected one page title in ${page}`);
}
assert.ok(outlines >= 200, "Page outlines should cover country profiles and article templates");
assert.ok(matchingHeadings >= 100, 'Article shortcut marks should match their heading marks');
for (const page of ['values-compass', 'due-diligence-checklist', 'giving-dashboard', 'charity-os']) {
  const html = readFileSync(`dist/tools/${page}/index.html`, 'utf8');
  const jump = html.indexOf('href="#working-tool"');
  assert.ok(jump >= 0 && jump < html.indexOf('id="working-tool"'), `Tool shortcut must precede the tool on ${page}`);
}
console.log(`Site identity and theme checked on ${pages.length} pages, including ${outlines} outlines and ${matchingHeadings} matching article headings, with distinct symbols in the catalogs, reference libraries and editorial lists.`);
