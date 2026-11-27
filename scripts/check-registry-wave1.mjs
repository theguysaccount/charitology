// Wave 1 verified charity dossiers: offline integrity gate.
// 1. The committed dataset matches its manifest fingerprints and the pinned
//    U.S. Form 990 and England and Wales editions, figure for figure.
// 2. The selection rule is complete: every qualifying record has a dossier or a
//    recorded exclusion, and nothing else does.
// 3. Every built dossier and hub page carries six visible FAQs that equal its
//    FAQPage JSON-LD, a BreadcrumbList, Organization (dossiers) or
//    CollectionPage + Dataset (hubs) JSON-LD, its exact figures, internal links,
//    the shared analytics script and no rating language; the partitioned
//    sitemap, llms.txt and feed agree with the data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'parse5';
import { readBuiltSitemapSet } from './sitemap-set.mjs';

const root = process.cwd();
const dataDir = join(root, 'public/data/registry-wave1');
const dist = join(root, 'dist');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const amountPattern = /^-?[0-9]{1,15}(?:\.[0-9]{1,2})?$/;
const atLeast = (value, threshold) => value !== null && Number(value) >= threshold;

// ---------- 1. Dataset files and pinned editions ----------
const manifest = readJson(join(dataDir, 'manifest.json'));
assert.equal(manifest.format, 'charitology-registry-wave1-v1');
assert.match(manifest.edition, /^\d{4}-\d{2}-\d{2}$/);
for (const [key, output] of Object.entries(manifest.outputs)) {
  const bytes = readFileSync(join(dataDir, output.path));
  assert.equal(bytes.length, output.bytes, `${key}: byte count`);
  assert.equal(sha(bytes), output.sha256, `${key}: SHA-256`);
}
for (const [key, pin] of Object.entries(manifest.pinnedEditions)) {
  assert.equal(sha(readFileSync(join(root, pin.path))), pin.sha256, `Pinned ${key} edition manifest changed`);
}
const us = readJson(join(dataDir, manifest.outputs.us.path));
const usHubs = readJson(join(dataDir, manifest.outputs.usHubs.path));
const ew = readJson(join(dataDir, manifest.outputs.ew.path));
const ewHubs = readJson(join(dataDir, manifest.outputs.ewHubs.path));
const codes = readJson(join(dataDir, manifest.outputs.codes.path));
assert.equal(codes.format, 'charitology-irs-eo-bmf-codes-v1');
assert.deepEqual(codes.source, manifest.sources.irsCodes);
assert.equal(Object.keys(codes.majorGroups).join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
for (const file of manifest.sources.irsEoBmf.files) {
  assert.match(file.url, /^https:\/\/www\.irs\.gov\/pub\/irs-soi\/eo[1-4]\.csv$/);
  assert.match(file.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(Date.parse(file.retrievedAt)) && Number.isFinite(Date.parse(file.lastModified)));
}
assert.equal(manifest.sources.irsEoBmf.files.reduce((sum, f) => sum + f.rows, 0), usHubs.posting.records);
assert.deepEqual(manifest.sources.irsEoBmf.files.map((f) => f.rows), usHubs.posting.regionRows);

function shards(directory, descriptors) {
  const rows = [];
  for (const asset of Object.values(descriptors)) {
    const packed = readFileSync(join(directory, asset.path));
    assert.equal(sha(packed), asset.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
    assert.equal(sha(raw), asset.decodedSha256);
    const decoded = JSON.parse(raw);
    assert.equal(decoded.length, asset.rows);
    rows.push(...decoded);
  }
  return rows;
}

// U.S.: every dossier period equals the pinned Form 990 edition, and the selection is complete.
const usDir = join(root, 'public/data/charity-financials/us');
const usEdition = readJson(join(usDir, 'manifest.json'));
for (const [year, file] of Object.entries(manifest.sources.irsSoiForm990.files)) {
  assert.equal(file.sha256, usEdition.sources[year].sha256, `SOI ${year} archive differs from the pinned edition`);
  assert.equal(file.url, usEdition.sources[year].archive);
}
const pinnedUs = new Map(shards(usDir, usEdition.shards).map(([ein, , periods]) => [ein, periods]));
assert.equal(pinnedUs.size, manifest.selection.us.editionOrganizations);
const usCandidates = [...pinnedUs].filter(([, periods]) => atLeast(periods.reduce((a, b) => (b[0] > a[0] ? b : a))[1], manifest.selection.us.thresholdUSD)).map(([ein]) => ein);
assert.equal(usCandidates.length, manifest.selection.us.candidates);
const usExcluded = [...manifest.selection.us.excluded.notInBmfPosting, ...manifest.selection.us.excluded.notSubsection03InBmfPosting];
const usEins = us.map((d) => d.ein);
assert.deepEqual([...usEins].sort(), usEins, 'U.S. dossiers sorted by EIN');
assert.equal(new Set([...usEins, ...usExcluded]).size, usEins.length + usExcluded.length, 'Dossiers and exclusions overlap');
assert.deepEqual([...usEins, ...usExcluded].sort(), [...usCandidates].sort(), 'U.S. selection is incomplete or adds records');
assert.equal(us.length, manifest.selection.us.dossiers);
const amountKeys = manifest.sources.irsSoiForm990.fields.map((f) => f.key);
let usFigures = 0;
for (const d of us) {
  assert.match(d.ein, /^\d{9}$/);
  assert.ok(typeof d.name === 'string' && d.name && d.name.length <= 250);
  assert.equal(d.subsection, '03');
  assert.ok(d.state === null || /^[A-Z]{2}$/.test(d.state));
  assert.ok([1, 2, 3, 4].includes(d.bmfRegion));
  const pinned = [...pinnedUs.get(d.ein)].sort((a, b) => b[0].localeCompare(a[0]));
  assert.equal(d.periods.length, pinned.length, `${d.ein}: period count`);
  d.periods.forEach((p, i) => {
    const q = pinned[i];
    assert.equal(p.taxPeriod, q[0]);
    assert.deepEqual([[p.extractYear, p.record]], q[6], `${d.ein} ${p.taxPeriod}: source record`);
    assert.deepEqual([p.totalRevenue, p.functionalExpenses, p.programServiceRevenue, p.grantsUSOrganizations, p.grantsOutsideUS], q.slice(1, 6), `${d.ein} ${p.taxPeriod}: figures differ from the pinned edition`);
    assert.ok([null, 'E', 'P'].includes(p.efile));
    for (const key of amountKeys) {
      assert.ok(p[key] === null || amountPattern.test(p[key]), `${d.ein}: ${key}`);
      if (p[key] !== null) usFigures++;
    }
  });
  assert.ok(atLeast(d.periods[0].totalRevenue, manifest.selection.us.thresholdUSD));
}

// England and Wales: every dossier period equals the pinned annual-return edition.
const ewDir = join(root, 'public/data/charity-financials/ew');
const ewEdition = readJson(join(ewDir, 'manifest.json'));
assert.equal(manifest.sources.ccewAnnualReturns.sha256, ewEdition.sources.returns.sha256);
const pinnedEw = new Map(shards(ewDir, ewEdition.names).map(([number, name, organisation, periods]) => [number, { name, organisation, periods }]));
assert.equal(pinnedEw.size, manifest.selection.ew.editionOrganizations);
const ewCandidates = [...pinnedEw].filter(([, r]) => atLeast(r.periods.reduce((a, b) => (b[1] > a[1] ? b : a))[3], manifest.selection.ew.thresholdGBP)).map(([n]) => n);
assert.equal(ewCandidates.length, manifest.selection.ew.candidates);
const ewExcluded = [...manifest.selection.ew.excluded.notInRegisterExtract, ...manifest.selection.ew.excluded.notRegisteredInRegisterExtract];
const ewNumbers = ew.map((d) => d.number);
assert.deepEqual([...ewNumbers].sort((a, b) => a - b), ewNumbers, 'England and Wales dossiers sorted by number');
assert.deepEqual([...ewNumbers, ...ewExcluded].sort(), [...ewCandidates].sort(), 'England and Wales selection is incomplete or adds records');
assert.equal(ew.length, manifest.selection.ew.dossiers);
let ewFigures = 0;
for (const d of ew) {
  const pinned = pinnedEw.get(d.number);
  assert.equal(d.organisationNumber, pinned.organisation);
  assert.equal(d.editionName, pinned.name);
  assert.equal(d.registrationStatus, 'Registered');
  const periods = [...pinned.periods].sort((a, b) => b[1].localeCompare(a[1]));
  assert.deepEqual(d.periods.map((p) => [p.start, p.end, p.received, p.grossIncome, p.grossExpenditure, p.record]), periods, `${d.number}: figures differ from the pinned edition`);
  for (const p of d.periods) for (const v of [p.grossIncome, p.grossExpenditure]) if (v !== null) { assert.match(v, amountPattern); ewFigures++; }
  for (const kind of ['what', 'who', 'how']) for (const [code, text] of d[kind]) assert.ok(/^\d{3}$/.test(code) && text);
  for (const [code] of d.what) assert.ok(ewHubs.purposes[code], `${d.number}: unknown purpose ${code}`);
}

// Hub counts add up across the posting.
const stateRows = Object.values(usHubs.states);
assert.equal(stateRows.reduce((s, r) => s + r.records, 0), usHubs.posting.subsection03);
assert.equal(stateRows.reduce((s, r) => s + r.withNtee, 0), usHubs.posting.subsection03WithNtee);
for (const r of stateRows) assert.equal(Object.values(r.groups).reduce((s, n) => s + n, 0), r.withNtee);
for (const [g, info] of Object.entries(usHubs.groups)) {
  assert.ok(codes.majorGroups[g]);
  assert.equal(Object.values(info.states).reduce((s, n) => s + n, 0), info.records, `NTEE ${g} state counts`);
  assert.equal(stateRows.reduce((s, r) => s + (r.groups[g] ?? 0), 0), info.records, `NTEE ${g} totals`);
}
for (const p of Object.values(ewHubs.purposes)) assert.ok(Number.isInteger(p.charities) && p.charities > 0 && p.charities <= ewHubs.registeredMain);

// ---------- 2. Expected routes, derived independently of the page code ----------
const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const standard = (code) => (code && /^[A-Z][0-9A-Z]{1,3}$/.test(code) ? code : null);
const groupSlug = (g) => `${g.toLowerCase()}-${slug(codes.majorGroups[g])}`;
const W = '/record/charity-dossiers/';
const routes = { dossiers: new Map(), hubs: new Map() };
const members = new Map();
const add = (path, list) => { members.set(path, list); routes.hubs.set(path, list.length); };
for (const d of us) routes.dossiers.set(`${W}united-states/ein/${d.ein}/`, { kind: 'us', d });
for (const d of ew) routes.dossiers.set(`${W}england-wales/charity/${d.number}/`, { kind: 'ew', d });
const byKey = (items, key) => {
  const map = new Map();
  for (const item of items) for (const k of [key(item)].flat()) if (k) map.set(k, [...(map.get(k) ?? []), item]);
  return map;
};
const usState = byKey(us, (d) => d.state);
const usGroup = byKey(us, (d) => standard(d.ntee)?.[0]);
const usStateGroup = byKey(us, (d) => (d.state && standard(d.ntee) ? `${d.state}|${d.ntee[0]}` : null));
const ewPurpose = byKey(ew, (d) => d.what.map(([c]) => c));
const usPath = (d) => `${W}united-states/ein/${d.ein}/`;
const ewPath = (d) => `${W}england-wales/charity/${d.number}/`;
add(W, []);
add(`${W}united-states/`, us.filter((d) => !d.state).map(usPath));
add(`${W}england-wales/`, ew.map(ewPath));
for (const [st, items] of usState) add(`${W}united-states/states/${st.toLowerCase()}/`, items.map(usPath));
for (const [g, items] of usGroup) add(`${W}united-states/ntee/${groupSlug(g)}/`, items.map(usPath));
for (const [key, items] of usStateGroup) {
  if (items.length < manifest.selection.stateGroupHubMinimumDossiers) continue;
  const [st, g] = key.split('|');
  add(`${W}united-states/states/${st.toLowerCase()}/${groupSlug(g)}/`, items.map(usPath));
}
for (const [code, items] of ewPurpose) add(`${W}england-wales/purposes/${slug(ewHubs.purposes[code].description)}/`, items.map(ewPath));
const allRoutes = [...routes.hubs.keys(), ...routes.dossiers.keys()];
assert.equal(new Set(allRoutes).size, allRoutes.length, 'Duplicate Wave 1 route');
assert.ok(routes.dossiers.size >= 2000, 'Wave 1 should publish at least 2,000 dossiers');

// ---------- 3. Built pages ----------
assert.ok(existsSync(join(dist, 'index.html')), 'Run npm run build first.');
const homeHtml = readFileSync(join(dist, 'index.html'), 'utf8');
const home = new URL(homeHtml.match(/<meta property="og:url" content="([^"]+)"/)[1]);
const base = home.pathname.replace(/\/$/, '');
const abs = (path) => new URL(base + path, home.origin).href;

const text = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join(''));
const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;
function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
  if (node.content) yield* walk(node.content);
}
const squash = (value) => value.replace(/\s+/g, ' ').trim();
const formatGrouped = (value, symbol) => {
  const negative = value.startsWith('-');
  const [whole, cents] = value.replace('-', '').split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${symbol}${cents ? `${digits}.${cents}` : digits}`;
};
const RATING_LANGUAGE = [/★|☆/, /\b\d(?:\.\d)?\s*(?:out of|\/)\s*(?:5|10)\s*stars?\b/i, /\btop[- ]rated\b/i, /\bbest charit/i,
  /\branked\s+(?:#|no\.?\s*|number\s*)\d/i, /\b(?:impact|efficiency|effectiveness|transparency|accountability)\s+(?:score|rating|grade)\s*(?:of|:)/i,
  /\boverhead ratio (?:of|is|was)\b/i, /\bgrade\s*:\s*[A-F][+-]?(?!\w)/];

const descriptions = new Map();
const titles = new Map();
const linkedFrom = new Map();
let faqCount = 0;
let pages = 0;
for (const path of allRoutes) {
  const file = join(dist, path.slice(1), 'index.html');
  assert.ok(existsSync(file), `Missing built page ${path}`);
  const html = readFileSync(file, 'utf8');
  const doc = parse(html);
  const nodes = [...walk(doc)];
  const label = path;
  pages++;
  // Head: canonical, social, analytics.
  const canonicals = nodes.filter((n) => n.nodeName === 'link' && attr(n, 'rel') === 'canonical');
  assert.equal(canonicals.length, 1, `${label}: one canonical`);
  assert.equal(attr(canonicals[0], 'href'), abs(path), `${label}: canonical`);
  const meta = (key) => nodes.find((n) => n.nodeName === 'meta' && (attr(n, 'property') === key || attr(n, 'name') === key));
  assert.equal(attr(meta('og:url'), 'content'), abs(path), `${label}: og:url`);
  for (const key of ['og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(attr(meta(key), 'content'), `${label}: ${key}`);
  const description = attr(meta('description'), 'content');
  assert.ok(description && description.length >= 50, `${label}: meta description`);
  assert.ok(!descriptions.has(description), `${label}: duplicate meta description with ${descriptions.get(description)}`);
  descriptions.set(description, path);
  const title = squash(text(nodes.find((n) => n.nodeName === 'title')));
  assert.ok(!titles.has(title), `${label}: duplicate <title> with ${titles.get(title)}`);
  titles.set(title, path);
  const h1 = nodes.filter((n) => n.nodeName === 'h1');
  assert.equal(h1.length, 1, `${label}: one h1`);
  assert.ok(title.startsWith(squash(text(h1[0]))), `${label}: <title> and h1 differ`);
  assert.ok(nodes.some((n) => n.nodeName === 'script' && attr(n, 'src') === 'https://rsio.org/vital.js' && attr(n, 'defer') !== undefined), `${label}: shared analytics script`);
  assert.ok(!html.includes('document.cookie'), `${label}: must not touch cookies`);
  assert.ok(!nodes.some((n) => n.nodeName === 'meta' && attr(n, 'name') === 'robots'), `${label}: must be indexable`);
  // JSON-LD.
  const ld = nodes.filter((n) => n.nodeName === 'script' && attr(n, 'type') === 'application/ld+json').map((n) => JSON.parse(text(n)));
  const ofType = (type) => ld.filter((n) => n['@type'] === type);
  const faqLd = ofType('FAQPage');
  assert.equal(faqLd.length, 1, `${label}: one FAQPage`);
  const questions = faqLd[0].mainEntity;
  assert.equal(questions.length, 6, `${label}: six FAQ questions`);
  const crumbs = ofType('BreadcrumbList');
  assert.equal(crumbs.length, 1, `${label}: one BreadcrumbList`);
  const items = crumbs[0].itemListElement;
  assert.ok(items.length >= 3 && items[0].item === abs('/') && items.at(-1).item === abs(path), `${label}: breadcrumb ends at the page`);
  items.forEach((item, i) => assert.equal(item.position, i + 1));
  // Visible FAQs equal the JSON-LD, in order.
  const details = nodes.filter((n) => n.nodeName === 'details' && attr(n, 'class') === 'rw-faq');
  assert.equal(details.length, 6, `${label}: six visible FAQ details`);
  details.forEach((node, i) => {
    const summary = node.childNodes.find((c) => c.nodeName === 'summary');
    const answer = node.childNodes.find((c) => c.nodeName === 'p');
    // HTML rendering collapses runs of whitespace (some register names contain double spaces).
    assert.equal(squash(text(summary)), squash(questions[i].name), `${label}: FAQ ${i + 1} question differs from JSON-LD`);
    assert.equal(squash(text(answer)), squash(questions[i].acceptedAnswer.text), `${label}: FAQ ${i + 1} answer differs from JSON-LD`);
    assert.equal(questions[i]['@type'], 'Question');
    assert.equal(questions[i].acceptedAnswer['@type'], 'Answer');
  });
  faqCount += 6;
  // No rating language anywhere in the main landmark.
  const main = nodes.find((n) => n.nodeName === 'main');
  const mainText = squash(text(main));
  for (const pattern of RATING_LANGUAGE) assert.ok(!pattern.test(mainText), `${label}: rating language ${pattern}`);
  for (const ref of nodes.filter((n) => n.nodeName === 'a').map((n) => attr(n, 'href')).filter(Boolean)) {
    const target = ref.startsWith(base + W) ? ref.slice(base.length) : null;
    if (target) linkedFrom.set(target, [...(linkedFrom.get(target) ?? []), path]);
  }
  const dossier = routes.dossiers.get(path);
  const facts = new Map();
  for (const dl of nodes.filter((n) => n.nodeName === 'dl' && attr(n, 'class') === 'rw-facts')) {
    const cells = dl.childNodes.filter((c) => c.nodeName === 'dt' || c.nodeName === 'dd');
    for (let i = 0; i < cells.length; i += 2) {
      assert.ok(cells[i].nodeName === 'dt' && cells[i + 1]?.nodeName === 'dd', `${label}: facts must pair dt and dd`);
      facts.set(squash(text(cells[i])), squash(text(cells[i + 1])));
    }
  }
  if (dossier) {
    const org = ofType('Organization');
    assert.equal(org.length, 1, `${label}: one Organization`);
    assert.equal(org[0].name, dossier.d.name, `${label}: Organization name`);
    assert.equal(org[0].mainEntityOfPage, abs(path));
    if (dossier.kind === 'us') {
      const ein = `${dossier.d.ein.slice(0, 2)}-${dossier.d.ein.slice(2)}`;
      assert.equal(org[0].taxID, ein, `${label}: taxID`);
      assert.equal(org[0].identifier[0].value, ein);
      assert.equal(facts.get('EIN'), ein, `${label}: visible EIN`);
      assert.equal(facts.get('IRS primary name'), squash(dossier.d.name), `${label}: visible name`);
      assert.equal(facts.get('Subsection'), '03, section 501(c)(3)', `${label}: subsection`);
      for (const p of dossier.d.periods) {
        assert.ok(mainText.includes(`${p.extractYear} extract, record ${p.record.toLocaleString('en-US')}`), `${label}: source record ${p.record}`);
        for (const key of amountKeys) if (p[key] !== null) assert.ok(mainText.includes(formatGrouped(p[key], '$')), `${label}: ${key} ${p[key]}`);
      }
    } else {
      assert.equal(org[0].identifier[0].value, dossier.d.number, `${label}: charity number`);
      assert.equal(facts.get('Registered charity number'), dossier.d.number, `${label}: visible charity number`);
      assert.equal(facts.get('Register name'), squash(dossier.d.name), `${label}: visible name`);
      assert.equal(facts.get('Registration status'), 'Registered', `${label}: status`);
      for (const p of dossier.d.periods) {
        assert.ok(mainText.includes(`Record ${p.record.toLocaleString('en-US')}`), `${label}: source record ${p.record}`);
        for (const v of [p.grossIncome, p.grossExpenditure]) if (v !== null) assert.ok(mainText.includes(formatGrouped(v, '£')), `${label}: amount ${v}`);
      }
    }
    assert.equal(ofType('CollectionPage').length, 0, `${label}: dossiers are not collections`);
  } else {
    const collection = ofType('CollectionPage');
    const dataset = ofType('Dataset');
    assert.equal(collection.length, 1, `${label}: one CollectionPage`);
    assert.equal(dataset.length, 1, `${label}: one Dataset`);
    assert.equal(collection[0].url, abs(path));
    const list = collection[0].mainEntity;
    assert.equal(list['@type'], 'ItemList');
    assert.equal(list.numberOfItems, list.itemListElement.length, `${label}: ItemList count`);
    const expected = members.get(path);
    if (expected.length) {
      assert.deepEqual(new Set(list.itemListElement.map((i) => i.url)).size, list.itemListElement.length);
      for (const member of expected) {
        assert.ok(html.includes(`href="${base}${member}"`), `${label}: missing link to ${member}`);
      }
    }
    list.itemListElement.forEach((item, i) => {
      assert.equal(item.position, i + 1);
      const target = new URL(item.url).pathname.slice(base.length);
      assert.ok(routes.hubs.has(target) || routes.dossiers.has(target), `${label}: ItemList points outside Wave 1: ${item.url}`);
    });
    assert.equal(dataset[0].isAccessibleForFree, true, `${label}: free dataset`);
    assert.ok(dataset[0].license && dataset[0].dateModified === manifest.edition);
    assert.ok(dataset[0].distribution.length >= 1, `${label}: dataset distribution`);
    for (const d of dataset[0].distribution) {
      assert.equal(d['@type'], 'DataDownload');
      const rel = new URL(d.contentUrl).pathname.slice(base.length + 1);
      assert.ok(existsSync(join(dist, rel)), `${label}: distribution file missing ${d.contentUrl}`);
    }
  }
}
// Every Wave 1 page is reachable from another Wave 1 page.
for (const path of allRoutes) {
  if (path === W) continue;
  assert.ok((linkedFrom.get(path) ?? []).some((from) => from !== path), `Orphan Wave 1 page ${path}`);
}
for (const path of routes.dossiers.keys()) {
  assert.ok((linkedFrom.get(path) ?? []).some((from) => routes.hubs.has(from)), `Dossier not linked from any hub: ${path}`);
}
for (const entry of ['record/charity-financials/index.html', 'record/charity-financials/united-states/index.html', 'record/charity-financials/england-wales/index.html']) {
  assert.ok(readFileSync(join(dist, entry), 'utf8').includes(`href="${base}${W}`), `${entry} must link to the Wave 1 dossiers`);
}

// ---------- 4. Sitemap partition, llms.txt and feed ----------
const sitemap = readBuiltSitemapSet(dist);
assert.ok(sitemap.index, 'More than 2,000 URLs: /sitemap.xml must be a sitemap index');
const [core, wave1] = sitemap.children;
assert.equal(core.file, 'sitemap-core.xml');
assert.equal(wave1.file, 'sitemap-registries-wave1.xml');
assert.deepEqual([...wave1.locs].sort(), allRoutes.map(abs).sort(), 'Wave 1 sitemap must list exactly the Wave 1 pages');
assert.ok(!core.locs.some((loc) => new URL(loc).pathname.startsWith(base + W)), 'Core sitemap must not list Wave 1 pages');
const llms = readFileSync(join(dist, 'llms.txt'), 'utf8');
for (const path of routes.hubs.keys()) {
  if (path.split('/').length > 7) continue; // state x group hubs are listed through the Wave 1 sitemap
  assert.ok(llms.includes(abs(path)), `llms.txt missing hub ${path}`);
}
assert.ok(llms.includes(abs('/sitemap-registries-wave1.xml')) && llms.includes(abs('/data/registry-wave1/manifest.json')));
assert.ok(!readFileSync(join(dist, 'feed.xml'), 'utf8').includes(W), 'The RSS feed lists writing, not Wave 1 registry records');

console.log(`✓ Registry Wave 1: ${us.length} U.S. and ${ew.length} England and Wales dossiers match the pinned editions (${usFigures + ewFigures} figures); ${routes.hubs.size} hubs; ${pages} built pages with ${faqCount} FAQ answers equal to FAQPage JSON-LD, breadcrumbs, Organization or CollectionPage + Dataset JSON-LD; sitemap index ${core.locs.length} core + ${wave1.locs.length} Wave 1 URLs.`);
