import assert from 'node:assert/strict';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { pageIdentity, routes, symbols } from '../src/lib/site-identities.ts';
import { sectionNavigation } from '../src/lib/section-navigation.ts';
import { observationSourceSymbol, sourceSymbol } from '../src/lib/source-symbol.ts';
import {
  causeSymbols, checklistSymbols, clubMeetingSymbols, comparisonSymbols, datasetSymbols, depthSymbols, disasterAdviceSymbols, ecosystemSymbols,
  diligenceGroupSymbols, diligenceItemSymbols, fragmentSymbols, fundraisingSourceSymbols, hazardSymbols, lensSymbols, needSymbols, networkSymbols,
  observationEditionSymbols, observationMeasureSymbols, osDiscussionSymbols, publicationSymbols,
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
  if (['programs', 'tools', 'record'].includes(collection)) {
    const html = readFileSync(`dist/${prefix}/index.html`, 'utf8');
    const cards = new Map([...html.matchAll(/<a class="card" id="item-([^"]+)"[^>]*>\s*<span[^>]*data-site-symbol="([^"]+)"/g)]
      .map(([, slug, mark]) => [slug, mark]));
    assert.equal(cards.size, slugs.length, `Missing catalog card marks in ${collection}`);
    for (const slug of slugs) assert.equal(cards.get(slug), byPath.get(`/${prefix}/${slug}/`).symbol, slug);
  }
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
  ['disaster giving guidance', ids(json('disaster-guide').points).map(id => `dr-${id}`), disasterAdviceSymbols],
  ['comparison attributes', Object.keys(comparisonSymbols), comparisonSymbols],
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

const disasterGuide = readFileSync('dist/tools/disaster-response-guide/index.html', 'utf8');
for (const [id, mark] of Object.entries(disasterAdviceSymbols)) {
  assert.match(disasterGuide, new RegExp(`href="#${id}"[^>]*><span[^>]*data-site-symbol="${mark}"`), id);
  assert.match(disasterGuide, new RegExp(`id="${id}"[^>]*>\\s*<div[^>]*>\\s*<span[^>]*data-site-symbol="${mark}"`), id);
}
for (const { id, depth } of json('disaster-guide').planner.buckets) {
  const mark = depthSymbols[depth];
  assert.match(disasterGuide, new RegExp(`for="dr-s-${id}"[^>]*>\\s*<span[^>]*><span[^>]*data-site-symbol="${mark}"`), id);
  assert.match(disasterGuide, new RegExp(`<li class="dr-bucket"[^>]*>\\s*<div[^>]*>\\s*<strong[^>]*><span[^>]*data-site-symbol="${mark}"`), id);
}

for (const slug of ['cause-census', 'moral-frameworks-program', 'evidence-reviews', 'failure-lab', 'history-of-charity', 'methods-lab', 'replication-program']) {
  const html = readFileSync(`dist/programs/${slug}/index.html`, 'utf8');
  const marks = [...html.matchAll(/<legend[^>]*><span[^>]*data-site-symbol="([^"]+)"[^>]*><\/span>/g)].map(([, mark]) => mark);
  assert.ok(marks.length >= 2, `Missing research field-group marks for ${slug}`);
  assert.equal(new Set(marks).size, marks.length, `Repeated research field-group marks for ${slug}`);
}

const ledger = readFileSync('dist/research-ledger/index.html', 'utf8');
const ledgerMarks = [...ledger.matchAll(/class="rl-stat"[^>]*><div[^>]*><span[^>]*data-site-symbol="([^"]+)"/g)].map(([, mark]) => mark);
assert.equal(ledgerMarks.length, 14);
assert.equal(new Set(ledgerMarks).size, ledgerMarks.length, 'Ledger summary measures have distinct identities');

const coverage = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
const jurisdictionIndex = coverage.match(/<nav class="page-sections" aria-label="Jump to a jurisdiction"[^>]*>[\s\S]*?<\/nav>/)?.[0];
assert.ok(jurisdictionIndex);
const jurisdictions = [...jurisdictionIndex.matchAll(/href="#([^"]+)"[^>]*><span[^>]*data-site-symbol="([^"]+)"/g)];
assert.equal(jurisdictions.length, 11);
assert.equal(new Set(jurisdictions.map(([, , mark]) => mark)).size, jurisdictions.length);
for (const [, id, mark] of jurisdictions) {
  const card = coverage.match(new RegExp(`<li class="card" id="${id}"[^>]*>[\\s\\S]*?<\\/li>`))?.[0];
  assert.ok(card?.includes(`data-site-symbol="${mark}"`), id);
  const destination = card.match(/<a class="identity-link" href="([^"]+)"/)?.[1];
  assert.ok(destination && pageIdentity(destination.slice(base.length)).symbol === mark, id);
}

function outlineMarks(html, label) {
  const outline = html.match(new RegExp(`<nav class="page-sections" aria-label="${label}"[^>]*>[\\s\\S]*?</nav>`))?.[0];
  assert.ok(outline, label);
  return [...outline.matchAll(/href="#([^"]+)"[^>]*><span[^>]*data-site-symbol="([^"]+)"/g)];
}

const publicationRegistry = JSON.parse(readFileSync('src/data/publication-editions/registry.json', 'utf8'));
const publicationIndex = readFileSync('dist/record/editions/index.html', 'utf8');
assert.deepEqual(
  new Map(outlineMarks(publicationIndex, 'Browse by publication').map(([, id, mark]) => [id, mark])),
  new Map(Object.entries(publicationSymbols).map(([family, mark]) => [`captures-${family}`, mark])),
);
assert.match(publicationIndex, /href="#proposal-desk"/);
assert.match(publicationIndex, /id="proposal-desk"/);
for (const { id } of publicationRegistry.editionPins) {
  const { core } = JSON.parse(readFileSync(`src/data/publication-editions/editions/${id}.json`, 'utf8'));
  const html = readFileSync(`dist/record/editions/${id}/index.html`, 'utf8');
  const marks = new Map(outlineMarks(html, 'In this capture').map(([, slug, mark]) => [slug, mark]));
  assert.equal(marks.size, core.members.length + 1, id);
  assert.equal(new Set(marks.values()).size, marks.size, id);
  assert.equal(marks.get('capture-sources'), 'archive', id);
  for (const member of core.members) {
    const slug = `member-${member.id}`;
    const body = html.match(new RegExp(`id="${slug}"[^>]*>[\\s\\S]*?<h3[^>]*>[\\s\\S]*?</h3>`))?.[0];
    const mark = marks.get(slug);
    assert.ok(mark && body?.includes(`data-site-symbol="${mark}"`), `${id}#${slug}`);
  }
}

const observationIndex = readFileSync('dist/observations/index.html', 'utf8');
const observationRegistry = JSON.parse(readFileSync('src/data/observations/registry.json', 'utf8'));
const editionMarks = observationRegistry.editions.map(({ id }) => {
  const symbol = observationEditionSymbols[id];
  assert.ok(symbol && Object.hasOwn(symbols, symbol), id);
  assert.match(observationIndex, new RegExp(`href="${base}/observations/editions/${id}/"[^>]*>[\\s\\S]*?<span[^>]*data-site-symbol="${symbol}"`));
  const edition = readFileSync(`dist/observations/editions/${id}/index.html`, 'utf8');
  assert.ok(edition.match(/<main id="main"[^>]*>/)?.[0].includes(`data-site-symbol="${symbol}"`), id);
  assert.deepEqual(outlineMarks(edition, 'On this page').map(([, slug]) => slug), ['observed-facts', 'source-editions', 'coverage']);
  return symbol;
});
assert.equal(new Set(editionMarks).size, editionMarks.length);
const observationMeasureIds = readdirSync('src/data/observations/measures')
  .filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(readFileSync(`src/data/observations/measures/${file}`, 'utf8')).id);
const observationMeasures = observationMeasureIds.map(id => observationMeasureSymbols[id]);
assert.ok(observationMeasures.every(mark => Object.hasOwn(symbols, mark)));
assert.equal(new Set(observationMeasures).size, new Set(observationMeasureIds).size);
const renderedMeasures = new Set();
for (const [, id, mark] of observationIndex.matchAll(/<tr [^>]*data-measure="([^"]+)"[^>]*>\s*<th[^>]*>[^<]*<\/th><td class="ob-measure" data-site-symbol="([^"]+)"/g)) {
  assert.equal(mark, observationMeasureSymbols[id], id);
  renderedMeasures.add(id);
}
assert.deepEqual(renderedMeasures, new Set(observationMeasureIds));

const disasterIndex = readFileSync('dist/disasters/index.html', 'utf8');
assert.deepEqual(outlineMarks(disasterIndex, 'On this page').map(([, slug]) => slug),
  ['dd-coverage', 'dd-incidents', 'dd-sources', 'dd-changes', 'dd-history']);

const reviewHtml = readFileSync('dist/contribute/review/index.html', 'utf8');
const reviewHeadings = [...reviewHtml.matchAll(/<h2 data-section-symbol="([^"]+)" id="(review-[^"]+)"/g)]
  .map(([, mark, slug]) => [slug, mark]);
if (reviewHeadings.length >= 2) {
  assert.deepEqual(
    outlineMarks(reviewHtml, 'On this page').map(([, slug, mark]) => [slug, mark]),
    reviewHeadings,
  );
}

const archivedIdentities = new Map();
for (const pin of observationRegistry.records.filter(({ kind }) => kind === 'source')) {
  const source = json(`observations/sources/${pin.id}.v${pin.version}`);
  const path = `/observations/sources/${pin.id}/v${pin.version}/`;
  archivedIdentities.set(path, [observationSourceSymbol(source), `${pin.id} v${pin.version}`]);
}
for (const { id } of observationRegistry.editions) {
  archivedIdentities.set(`/observations/editions/${id}/`, [observationEditionSymbols[id], id]);
}
for (const { id } of publicationRegistry.editionPins) {
  const { core } = json(`publication-editions/editions/${id}`);
  archivedIdentities.set(`/record/editions/${id}/`, [publicationSymbols[core.family], id]);
}
const disasterRegistry = json('disaster-incidents/registry');
for (const { edition: { id } } of disasterRegistry.editions) {
  const { incidents, sources } = json(`disaster-incidents/editions/${id}`);
  archivedIdentities.set(`/disasters/editions/${id}/`, ['archive', id]);
  for (const pin of incidents) {
    const incident = json(`disaster-incidents/records/incident/${pin.id}/v${pin.version}`);
    const mark = hazardSymbols[incident.hazard];
    archivedIdentities.set(`/disasters/editions/${id}/incidents/${pin.id}/`, [mark, `${pin.id} v${pin.version}`]);
    if (id === disasterRegistry.selected.id) archivedIdentities.set(`/disasters/incidents/${pin.id}/`, [mark, pin.id]);
  }
  for (const pin of sources) {
    const source = json(`disaster-incidents/records/source/${pin.id}/v${pin.version}`);
    archivedIdentities.set(`/disasters/sources/${pin.id}/${pin.version}/`, [sourceSymbol(source.finalUrl), `${pin.id} v${pin.version}`]);
  }
}

const execution = readFileSync('dist/record/funding-flows/brazil-project-execution/index.html', 'utf8');
const projectLinks = [...execution.matchAll(/href="([^"]+)" data-source-symbol="agreement"><span class="identity-code">([0-9]+)<\/span>/g)];
assert.ok(projectLinks.length > 80);
assert.equal(new Set(projectLinks.map(([, , code]) => code)).size, projectLinks.length);
for (const [, href, code] of projectLinks) {
  archivedIdentities.set(href.slice(base.length), ['agreement', code]);
}

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
  const [recordSymbol, code] = archivedIdentities.get(route) ?? [];
  assert.ok(main?.includes(`data-site-symbol="${recordSymbol ?? symbol}"`), page);
  assert.ok(main.includes(`data-site-tone="${tone}"`), page);
  assert.ok(main.includes('data-pagefind-meta="record_symbol[data-site-symbol], record_tone[data-site-tone]"'), page);
  if (code) {
    assert.ok(html.includes(`class="identity-code title-code" data-pagefind-meta="record_code">${code}</span>`), page);
    assert.ok(html.includes('<h1 data-pagefind-meta="title">'), page);
  }
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
    const marks = [...outline.matchAll(/data-site-symbol="([^"]+)"/g)].map(([, mark]) => mark);
    assert.equal(marks.length, links.length, page);
    assert.equal(new Set(marks).size, marks.length, `Repeated outline symbol in ${page}`);
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
for (const [page, first] of [['disaster-response-guide', 'dr-guidance'], ['compare-tool', 'ct-title']]) {
  const html = readFileSync(`dist/tools/${page}/index.html`, 'utf8');
  const firstJump = html.match(/<nav class="page-sections"[^>]*>[\s\S]*?<a href="#([^"]+)"/)?.[1];
  assert.equal(firstJump, first, page);
  assert.ok(!html.includes('href="#working-tool"'), `Extra tool shortcut on ${page}`);
}
console.log(`Site identity and theme checked on ${pages.length} pages, including ${outlines} outlines and ${matchingHeadings} matching article headings, with distinct symbols in the catalogs, reference libraries and editorial lists.`);
