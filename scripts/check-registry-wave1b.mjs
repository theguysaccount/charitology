// Wave 1b verified charity dossiers (Scotland, Australia, Canada) and the
// Cause × Country index: offline integrity gate, at least as strict as
// scripts/check-registry-wave1.mjs.
// 1. The committed dataset matches its manifest fingerprints and the pinned
//    OSCR, ACNC AIS and CRA T3010 editions, figure for figure.
// 2. The selection rules are complete: every qualifying record has a dossier or
//    a recorded exclusion, and nothing else does.
// 3. The cause grouping is reproduced from the published labels and the pinned
//    stems; every hub has at least the recorded minimum of dossiers.
// 4. Every built dossier and hub page carries six visible FAQs that equal its
//    FAQPage JSON-LD, a BreadcrumbList, Organization (dossiers) or
//    CollectionPage + Dataset (hubs) JSON-LD, its exact figures cell by cell
//    ("Not supplied" for every null), internal links, the shared analytics
//    script and no rating language; the partitioned sitemap, llms.txt and feed
//    agree with the data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'parse5';
import { readBuiltSitemapSet } from './sitemap-set.mjs';

const root = process.cwd();
const dataDir = join(root, 'public/data/registry-wave1b');
const wave1Dir = join(root, 'public/data/registry-wave1');
const dist = join(root, 'dist');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const amountPattern = /^-?[0-9]{1,15}(?:\.[0-9]{1,2})?$/;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const atLeast = (value, threshold) => value !== null && Number(value) >= threshold;
const sha256Pattern = /^[0-9a-f]{64}$/;

// The label-level cause groups, pinned here so a change to the builder's stems
// cannot pass silently.
const CAUSE_GROUPS = [
  ['education', 'Education', ['educat', 'teaching', 'school']],
  ['health', 'Health', ['health']],
  ['religion', 'Religion and faith', ['religio', 'christian', 'islam', 'judaism', 'faith']],
  ['poverty', 'Poverty relief', ['poverty']],
  ['environment', 'Environment', ['environment']],
  ['animals', 'Animals', ['animal']],
  ['arts-culture', 'Arts and culture', ['arts', 'cultur']],
  ['rights', 'Human and civil rights', ['rights']],
  ['sport-recreation', 'Sport and recreation', ['sport', 'recreation']],
  ['community', 'Community development', ['community']],
  ['housing', 'Housing and shelter', ['housing', 'shelter', 'accommodation']],
  ['science-research', 'Science and research', ['scien', 'research']],
  ['disability', 'Disability', ['disab']],
  ['international', 'Overseas and international', ['overseas', 'international', 'foreign']],
  ['safety', 'Safety and saving lives', ['safety', 'security', 'saving of lives']],
  ['food-agriculture', 'Food and agriculture', ['food', 'agricultur', 'nutrition']],
  ['employment', 'Employment', ['employment']],
];
const REGISTRIES = ['us', 'ew', 'scotland', 'australia', 'canada'];
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordMatch = (label, stem) => new RegExp(`(?<![a-z])${escapeRe(stem)}`).test(label.toLowerCase());

// ---------- 1. Dataset files, code tables and pinned editions ----------
const manifest = readJson(join(dataDir, 'manifest.json'));
assert.equal(manifest.format, 'charitology-registry-wave1b-v1');
assert.match(manifest.edition, isoDay);
assert.equal(manifest.checker, 'scripts/check-registry-wave1b.mjs');
assert.deepEqual(Object.keys(manifest.outputs).sort(), ['acncFields', 'australia', 'australiaHubs', 'canada', 'canadaHubs', 'causes', 'craCodes', 'scotland', 'scotlandHubs']);
for (const [key, output] of Object.entries(manifest.outputs)) {
  const bytes = readFileSync(join(dataDir, output.path));
  assert.equal(bytes.length, output.bytes, `${key}: byte count`);
  assert.equal(sha(bytes), output.sha256, `${key}: SHA-256`);
}
assert.deepEqual(Object.keys(manifest.pinnedEditions).sort(), ['australia', 'canada', 'scotland']);
for (const [key, pin] of Object.entries(manifest.pinnedEditions)) {
  assert.equal(sha(readFileSync(join(root, pin.path))), pin.sha256, `Pinned ${key} edition manifest changed`);
}
assert.equal(sha(readFileSync(join(wave1Dir, 'manifest.json'))), manifest.sources.wave1.sha256, 'Wave 1 manifest changed without rebuilding Wave 1b');
const out = (key) => readJson(join(dataDir, manifest.outputs[key].path));
const sc = out('scotland');
const scHubs = out('scotlandHubs');
const au = out('australia');
const auHubs = out('australiaHubs');
const ca = out('canada');
const caHubs = out('canadaHubs');
const causes = out('causes');
const cra = out('craCodes');
const acnc = out('acncFields');
const hubMin = manifest.selection.hubMinimumDossiers;
assert.equal(hubMin, 5, 'Hubs need at least five dossiers');

const checkSource = (label, s, host) => {
  assert.ok(new URL(s.url).hostname === host, `${label}: unexpected host ${s.url}`);
  assert.match(s.sha256, sha256Pattern, `${label}: SHA-256`);
  assert.ok(Number.isInteger(s.bytes) && s.bytes > 0, `${label}: bytes`);
  assert.ok(Number.isFinite(Date.parse(s.retrievedAt)), `${label}: retrievedAt`);
};
const S = manifest.sources;
checkSource('OSCR register', S.oscrRegister, 'www.oscr.org.uk');
assert.equal(S.oscrRegister.licence, 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/');
assert.match(S.oscrRegister.memberDate, isoDay);
assert.equal(S.oscrRegister.rows, scHubs.registerRows);
checkSource('ACNC register', S.acncRegister, 'data.gov.au');
assert.ok(Number.isFinite(Date.parse(S.acncRegister.lastModified)));
assert.equal(S.acncRegister.rows, auHubs.registerRows);
assert.equal(S.acncRegister.licence, 'https://creativecommons.org/licenses/by/3.0/au/');
for (const [year, s] of Object.entries(S.craIdentification)) {
  checkSource(`CRA identification ${year}`, s, 'open.canada.ca');
  assert.ok(Number.isFinite(Date.parse(s.lastModified)));
  assert.equal(s.rows, caHubs.identification[year].rows, `CRA ${year} identification rows`);
}
assert.deepEqual(Object.keys(S.craIdentification).sort(), ['2023', '2024']);
assert.deepEqual(cra.source, S.craCodes);
checkSource('CRA codes', cra.source, 'open.canada.ca');
assert.deepEqual(acnc.source, S.acncUserGuide);
checkSource('ACNC user guide', acnc.source, 'data.gov.au');
assert.equal(cra.format, 'charitology-cra-codes-v1');
assert.equal(Object.keys(cra.categories).length, 30);
for (const [code, label] of Object.entries(cra.categories)) {
  assert.match(code, /^\d{4}$/);
  assert.ok(label && label === label.trim());
  assert.ok(cra.headings.includes(cra.categoryHeadings[code]), `CRA category ${code} heading`);
}
assert.deepEqual(Object.keys(cra.categoryHeadings).sort(), Object.keys(cra.categories).sort());
assert.deepEqual(cra.designations, { A: 'Public Foundation', B: 'Private Foundation', C: 'Charitable Organization' });
assert.equal(acnc.format, 'charitology-acnc-register-fields-v1');
assert.equal(acnc.subtypes.length, 14);
assert.equal(acnc.beneficiaries.length, 29);
assert.deepEqual(acnc.operatingStates, ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);
const subtypeColumns = acnc.subtypes.map((s) => s.column);
const subtypeLabel = new Map(acnc.subtypes.map((s) => [s.column, s.label]));
const beneficiaryColumns = acnc.beneficiaries.map((b) => b.column);

function shards(directory, descriptors) {
  const rows = [];
  for (const asset of Object.values(descriptors)) {
    const packed = readFileSync(join(directory, asset.path));
    assert.equal(packed.length, asset.bytes);
    assert.equal(sha(packed), asset.sha256);
    const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
    assert.equal(sha(raw), asset.decodedSha256);
    const decoded = JSON.parse(raw);
    assert.equal(decoded.length, asset.rows);
    rows.push(...decoded);
  }
  return rows;
}
const latestBy = (periods, index) => periods.reduce((a, b) => (b[index] > a[index] ? b : a));
const selection = (key, ids, candidates) => {
  const sel = manifest.selection[key];
  const excluded = Object.values(sel.excluded).flat();
  assert.deepEqual([...ids].sort(), ids, `${key}: dossiers sorted by identifier`);
  assert.equal(new Set([...ids, ...excluded]).size, ids.length + excluded.length, `${key}: dossiers and exclusions overlap`);
  assert.deepEqual([...ids, ...excluded].sort(), [...candidates].sort(), `${key}: selection is incomplete or adds records`);
  assert.equal(ids.length, sel.dossiers);
  assert.equal(candidates.length, sel.candidates);
};

// Scotland: every dossier period equals the pinned OSCR edition.
const scDir = join(root, 'public/data/charity-financials/scotland');
const scEdition = readJson(join(scDir, 'manifest.json'));
assert.equal(S.oscrReturns.sha256, scEdition.sources.returns.sha256);
assert.equal(S.oscrReturns.member, scEdition.sources.returns.member);
assert.equal(S.oscrReturns.edition, scEdition.date);
const pinnedSc = new Map(shards(scDir, scEdition.names).map((row) => [row[0], row]));
assert.equal(pinnedSc.size, manifest.selection.scotland.editionOrganizations);
const scThreshold = manifest.selection.scotland.thresholdGBP;
assert.equal(scThreshold, 10_000_000);
const scCandidates = [...pinnedSc.values()].filter((r) => r[7].length && atLeast(latestBy(r[7], 0)[2], scThreshold)).map((r) => r[0]);
selection('scotland', sc.map((d) => d.number), scCandidates);
assert.equal(Object.keys(scHubs.purposes).length, 16, 'OSCR lists 16 charitable purposes');
assert.equal(Object.values(scHubs.statuses).reduce((a, b) => a + b, 0), scHubs.registerRows);
assert.equal(Object.values(scHubs.regulatoryTypes).reduce((a, b) => a + b, 0), scHubs.registerRows);
for (const n of Object.values(scHubs.purposes)) assert.ok(Number.isInteger(n) && n > 0 && n <= scHubs.registerRows);
let figures = 0;
for (const d of sc) {
  const [number, name, status, kind, , , registryRecord, periods] = pinnedSc.get(d.number);
  assert.match(d.number, /^SC\d{6}$/);
  assert.ok(typeof d.name === 'string' && d.name && d.name.length <= 250);
  assert.equal(d.editionName, name, `${number}: edition name`);
  assert.equal(d.editionStatus, status);
  assert.equal(d.editionRegulatoryType, kind);
  assert.equal(d.editionRegistryRecord, registryRecord);
  assert.ok(Object.hasOwn(scHubs.statuses, d.status) && Object.hasOwn(scHubs.regulatoryTypes, d.regulatoryType));
  assert.ok(Number.isInteger(d.registerRecord) && d.registerRecord >= 1 && d.registerRecord <= scHubs.registerRows);
  assert.ok(d.registered === null || isoDay.test(d.registered));
  for (const p of d.purposes) assert.ok(Object.hasOwn(scHubs.purposes, p), `${number}: unknown purpose ${p}`);
  assert.equal(new Set(d.purposes).size, d.purposes.length);
  const expected = [...periods].sort((a, b) => b[0].localeCompare(a[0]));
  assert.deepEqual(d.periods.map((p) => [p.end, p.received, p.grossIncome, p.grossExpenditure, p.record,
    p.incomeDetail === null ? null : scEdition.incomeDetailFields.map((f) => p.incomeDetail[f]),
    p.spendingDetail === null ? null : scEdition.spendingDetailFields.map((f) => p.spendingDetail[f])]), expected, `${number}: figures differ from the pinned edition`);
  for (const p of d.periods) {
    for (const v of [p.grossIncome, p.grossExpenditure, ...Object.values(p.incomeDetail ?? {}), ...Object.values(p.spendingDetail ?? {})]) { assert.match(v, amountPattern); figures++; }
    if (p.incomeDetail) assert.deepEqual(Object.keys(p.incomeDetail), scEdition.incomeDetailFields);
    if (p.spendingDetail) assert.deepEqual(Object.keys(p.spendingDetail), scEdition.spendingDetailFields);
  }
  assert.ok(atLeast(d.periods[0].grossIncome, scThreshold));
}

// Australia: every dossier period equals the pinned ACNC AIS edition.
const auEdition = readJson(join(root, 'public/data/charity-financials/manifest.json'));
assert.equal(auEdition.format, 'charitology-acnc-ais-v1');
const auPacked = readFileSync(join(root, 'public/data/charity-financials', auEdition.asset.path));
assert.equal(sha(auPacked), auEdition.asset.sha256);
const auRaw = gunzipSync(auPacked, { maxOutputLength: auEdition.asset.decodedBytes });
assert.equal(sha(auRaw), auEdition.asset.decodedSha256);
const pinnedAu = new Map(JSON.parse(auRaw).map((row) => [row[0], row]));
assert.equal(pinnedAu.size, manifest.selection.australia.editionOrganizations);
for (const s of auEdition.sources) {
  const f = S.acncAis.files[String(s.year)];
  assert.equal(f.sha256, s.sha256);
  assert.equal(f.url, s.csv);
  assert.equal(f.rows, s.inputRows);
}
const auThreshold = manifest.selection.australia.thresholdAUD;
assert.equal(auThreshold, 100_000_000);
const auCandidates = [...pinnedAu.values()].filter((r) => atLeast(latestBy(r[2], 2)[6], auThreshold)).map((r) => r[0]);
selection('australia', au.map((d) => d.abn), auCandidates);
const auExcluded = [...manifest.selection.australia.excluded.notInRegisterDataset, ...manifest.selection.australia.excluded.repeatedInRegisterDataset];
assert.deepEqual(manifest.selection.australia.excludedEditionNames, auExcluded.map((abn) => [abn, pinnedAu.get(abn)[1]]), 'AU exclusion names differ from the pinned edition');
assert.deepEqual(Object.keys(auHubs.subtypes), subtypeColumns);
for (const n of Object.values(auHubs.subtypes)) assert.ok(Number.isInteger(n) && n >= 0 && n <= auHubs.registerRows);
assert.ok(auHubs.registerAbns + auHubs.withheldAbns <= auHubs.registerRows);
assert.equal(Object.values(auHubs.charitySizes).reduce((a, b) => a + b, 0), auHubs.registerRows);
const auKeys = ['totalRevenue', 'totalExpenses', 'revenueFromGovernment', 'grantsInAustralia', 'grantsOutsideAustralia'];
for (const d of au) {
  const [abn, name, periods] = pinnedAu.get(d.abn);
  assert.match(abn, /^\d{11}$/);
  assert.ok(typeof d.name === 'string' && d.name && d.name.length <= 250);
  assert.equal(d.editionName, name, `${abn}: AIS name`);
  assert.ok(Number.isInteger(d.registerRecord) && d.registerRecord >= 1 && d.registerRecord <= auHubs.registerRows);
  assert.deepEqual(d.subtypes, subtypeColumns.filter((c) => d.subtypes.includes(c)), `${abn}: subtypes`);
  assert.deepEqual(d.beneficiaries, beneficiaryColumns.filter((c) => d.beneficiaries.includes(c)), `${abn}: beneficiaries`);
  assert.deepEqual(d.operatesIn, acnc.operatingStates.filter((s) => d.operatesIn.includes(s)));
  for (const c of d.operatingCountries) assert.match(c, /^[A-Z]{3}$/);
  for (const day of [d.registered, d.established]) assert.ok(day === null || isoDay.test(day));
  const expected = [...periods].sort((a, b) => b[2].localeCompare(a[2]));
  assert.deepEqual(d.periods.map((p) => [p.aisYear, p.start, p.end, p.consolidation, p.accountingBasis, p.record, ...auKeys.map((k) => (p[k] === null ? null : Number(p[k])))]), expected, `${abn}: figures differ from the pinned edition`);
  for (const p of d.periods) for (const k of auKeys) {
    if (p[k] === null) continue;
    assert.match(p[k], /^-?\d+$/);
    assert.equal(String(Number(p[k])), p[k]);
    figures++;
  }
  assert.ok(atLeast(d.periods[0].totalRevenue, auThreshold));
}

// Canada: every dossier period equals the pinned CRA T3010 edition.
const caDir = join(root, 'public/data/charity-financials/ca');
const caEdition = readJson(join(caDir, 'manifest.json'));
assert.equal(caEdition.format, 'charitology-ca-t3010-v1');
for (const [year, e] of Object.entries(caEdition.editions)) {
  assert.equal(S.craFinancial.files[year].sha256, e.finance.sha256);
  assert.equal(S.craFinancial.files[year].url, e.finance.url);
}
const pinnedCa = new Map(shards(caDir, caEdition.names).map((row) => [row[0], row]));
assert.equal(pinnedCa.size, manifest.selection.canada.editionOrganizations);
const caThreshold = manifest.selection.canada.thresholdCAD;
assert.equal(caThreshold, 100_000_000);
const caCandidates = [...pinnedCa.values()].filter((r) => atLeast(latestBy(r[2], 0)[6], caThreshold)).map((r) => r[0]);
selection('canada', ca.map((d) => d.bn), caCandidates);
for (const [year, info] of Object.entries(caHubs.identification)) {
  assert.equal(Object.values(info.categories).reduce((a, b) => a + b, 0), info.rows, `${year} category counts`);
  assert.equal(Object.values(info.designations).reduce((a, b) => a + b, 0), info.rows, `${year} designation counts`);
  for (const c of Object.keys(info.categories)) assert.ok(cra.categories[c]);
}
const caKeys = ['totalRevenue', 'totalExpenditures', 'charitableProgramExpenditures', 'receivedFromRegisteredCharities', 'giftsToQualifiedDonees', 'grantsToOtherGrantees'];
for (const d of ca) {
  const [bn, name, periods] = pinnedCa.get(d.bn);
  assert.match(bn, /^\d{9}RR\d{4}$/);
  assert.equal(d.name, name, `${bn}: legal name from the pinned edition`);
  assert.ok(d.identificationName && d.identificationName.length <= 250);
  assert.ok(cra.categories[d.category] && cra.designations[d.designation], `${bn}: codes`);
  assert.match(d.subCategory, /^\d{4}$/);
  const expected = [...periods].sort((a, b) => b[0].localeCompare(a[0]));
  assert.equal(d.identificationYear, expected[0][0].slice(0, 4));
  assert.ok(Number.isInteger(d.identificationRecord) && d.identificationRecord >= 1 && d.identificationRecord <= caHubs.identification[d.identificationYear].rows);
  assert.deepEqual(d.periods.map((p) => [p.end, p.formVersion, p.section, p.accountingBasis, p.record, p.identificationSourceRecord, ...caKeys.map((k) => p[k])]), expected, `${bn}: figures differ from the pinned edition`);
  for (const p of d.periods) for (const k of caKeys) if (p[k] !== null) { assert.match(p[k], amountPattern); figures++; }
  assert.ok(atLeast(d.periods[0].totalRevenue, caThreshold));
}

// ---------- 2. Cause groups, reproduced from the published labels ----------
const wave1Manifest = readJson(join(wave1Dir, 'manifest.json'));
const irs = readJson(join(wave1Dir, wave1Manifest.outputs.codes.path));
const ewHubs = readJson(join(wave1Dir, wave1Manifest.outputs.ewHubs.path));
const us = readJson(join(wave1Dir, wave1Manifest.outputs.us.path));
const ew = readJson(join(wave1Dir, wave1Manifest.outputs.ew.path));
const labels = {
  us: Object.entries(irs.majorGroups),
  ew: Object.entries(ewHubs.purposes).map(([c, p]) => [c, p.description]),
  scotland: Object.keys(scHubs.purposes).sort().map((p) => [p, p]),
  australia: acnc.subtypes.map((s) => [s.column, s.label]),
  canada: Object.entries(cra.categories),
};
assert.deepEqual(causes.labels, labels, 'Cause labels differ from the published classifications');
assert.equal(causes.format, 'charitology-cause-by-country-v1');
assert.match(causes.rule, /not an equivalence or an official crosswalk/);
assert.equal(causes.groups.length, CAUSE_GROUPS.length);
const grouped = Object.fromEntries(REGISTRIES.map((r) => [r, new Set()]));
causes.groups.forEach((g, i) => {
  const [id, name, stems] = CAUSE_GROUPS[i];
  assert.deepEqual([g.id, g.name, g.stems], [id, name, stems], `Cause group ${id} definition changed`);
  for (const r of REGISTRIES) {
    const expected = labels[r].filter(([, label]) => stems.some((stem) => wordMatch(label, stem))).map(([k]) => k);
    assert.deepEqual(g.matches[r], expected, `${id}: ${r} matches`);
    for (const k of expected) grouped[r].add(k);
  }
  assert.ok(REGISTRIES.filter((r) => g.matches[r].length).length >= 2, `${id}: labels in at least two registers`);
});
for (const r of REGISTRIES) assert.deepEqual(causes.ungrouped[r], labels[r].map(([k]) => k).filter((k) => !grouped[r].has(k)), `${r}: ungrouped labels`);

// ---------- 3. Expected routes, derived independently of the page code ----------
const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STOP = new Set(['a', 'and', 'as', 'be', 'by', 'in', 'of', 'or', 'the', 'to', 'with']);
const shortSlug = (text) => {
  const words = slug(text.replace(/[[\]]/g, '')).split('-').slice(0, 7);
  while (words.length > 1 && STOP.has(words.at(-1))) words.pop();
  return words.join('-');
};
const W = '/record/charity-dossiers/';
const SCB = `${W}scotland/`;
const AUB = `${W}australia/`;
const CAB = `${W}canada/`;
const CAUSE = `${W}cause-by-country/`;
const routes = { dossiers: new Map(), hubs: new Map() };
const members = new Map();
const add = (path, list) => {
  assert.ok(!routes.hubs.has(path), `Duplicate hub route ${path}`);
  members.set(path, list);
  routes.hubs.set(path, list.length);
};
const scPath = (d) => `${SCB}charity/${d.number.toLowerCase()}/`;
const auPath = (d) => `${AUB}abn/${d.abn}/`;
const caPath = (d) => `${CAB}bn/${d.bn.toLowerCase()}/`;
for (const d of sc) routes.dossiers.set(scPath(d), { kind: 'sc', d });
for (const d of au) routes.dossiers.set(auPath(d), { kind: 'au', d });
for (const d of ca) routes.dossiers.set(caPath(d), { kind: 'ca', d });
const byKey = (items, keys) => {
  const map = new Map();
  for (const item of items) for (const k of keys(item)) map.set(k, [...(map.get(k) ?? []), item]);
  return map;
};
add(SCB, []);
add(AUB, []);
add(CAB, []);
add(CAUSE, []);
const scHubPaths = new Map();
for (const [p, items] of byKey(sc, (d) => d.purposes)) {
  if (items.length < hubMin) continue;
  scHubPaths.set(p, `${SCB}purposes/${shortSlug(p)}/`);
  add(scHubPaths.get(p), items.map(scPath));
}
const auHubPaths = new Map();
for (const [c, items] of byKey(au, (d) => d.subtypes)) {
  if (items.length < hubMin) continue;
  auHubPaths.set(c, `${AUB}subtypes/${shortSlug(subtypeLabel.get(c))}/`);
  add(auHubPaths.get(c), items.map(auPath));
}
const caHubPaths = new Map();
for (const [c, items] of byKey(ca, (d) => [d.category])) {
  if (items.length < hubMin) continue;
  caHubPaths.set(c, `${CAB}categories/${c}-${shortSlug(cra.categories[c])}/`);
  add(caHubPaths.get(c), items.map(caPath));
}
const caDesignationPaths = new Map();
for (const [c, items] of byKey(ca, (d) => [d.designation])) {
  if (items.length < hubMin) continue;
  caDesignationPaths.set(c, `${CAB}designations/${c.toLowerCase()}-${shortSlug(cra.designations[c])}/`);
  add(caDesignationPaths.get(c), items.map(caPath));
}
for (const [path, n] of routes.hubs) if (![SCB, AUB, CAB, CAUSE].includes(path)) assert.ok(n >= hubMin, `${path}: fewer than ${hubMin} dossiers`);
const allRoutes = [...routes.hubs.keys(), ...routes.dossiers.keys()];
assert.equal(new Set(allRoutes).size, allRoutes.length, 'Duplicate Wave 1b route');
const dossierCount = routes.dossiers.size;
assert.ok(dossierCount >= 600 && dossierCount <= 1500, `Wave 1b should add 600 to 1,500 dossiers, not ${dossierCount}`);

// ---------- 4. Built pages ----------
assert.ok(existsSync(join(dist, 'index.html')), 'Run npm run build first.');
const homeHtml = readFileSync(join(dist, 'index.html'), 'utf8');
const home = new URL(homeHtml.match(/<meta property="og:url" content="([^"]+)"/)[1]);
const base = home.pathname.replace(/\/$/, '');
const abs = (path) => new URL(base + path, home.origin).href;

const sitemap = readBuiltSitemapSet(dist);
assert.ok(sitemap.index, '/sitemap.xml must be a sitemap index');
assert.deepEqual(sitemap.children.map((c) => c.file), ['sitemap-core.xml', 'sitemap-registries-wave1.xml', 'sitemap-registries-wave1b.xml', 'sitemap-registries-wave1c.xml', 'sitemap-registries-wave1d.xml'], 'Unexpected child sitemaps');
const [core, wave1, wave1b, wave1c, wave1d] = sitemap.children;
// Cause × Country also lists the Wave 1c country pages and hubs (verified in full by scripts/check-registry-wave1c.mjs).
const wave1cPaths = new Set(wave1c.locs.map((loc) => new URL(loc).pathname.slice(base.length)));
// ... and the Wave 1d country pages and hubs (verified in full by scripts/check-registry-wave1d.mjs).
const wave1dPaths = new Set(wave1d.locs.map((loc) => new URL(loc).pathname.slice(base.length)));
const wave1Paths = new Set(wave1.locs.map((loc) => new URL(loc).pathname.slice(base.length)));

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
const money = (value, symbol) => (value === null ? 'Not supplied' : formatGrouped(value, symbol));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLabel = (value) => {
  const [y, m, d] = value.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
};
const RATING_LANGUAGE = [/★|☆/, /\b\d(?:\.\d)?\s*(?:out of|\/)\s*(?:5|10)\s*stars?\b/i, /\btop[- ]rated\b/i, /\bbest charit/i,
  /\branked\s+(?:#|no\.?\s*|number\s*)\d/i, /\b(?:impact|efficiency|effectiveness|transparency|accountability)\s+(?:score|rating|grade)\s*(?:of|:)/i,
  /\boverhead ratio (?:of|is|was)\b/i, /\bgrade\s*:\s*[A-F][+-]?(?!\w)/];

// Titles and descriptions must be unique across every verified registry page, Wave 1 included.
const descriptions = new Map();
const titles = new Map();
for (const path of wave1Paths) {
  const html = readFileSync(join(dist, path.slice(1), 'index.html'), 'utf8');
  const head = [...walk(parse(html.slice(0, html.indexOf('</head>') + 7)))];
  titles.set(squash(text(head.find((n) => n.nodeName === 'title'))), path);
  descriptions.set(attr(head.find((n) => n.nodeName === 'meta' && attr(n, 'name') === 'description'), 'content'), path);
}
const linkedFrom = new Map();
let faqCount = 0;
let pages = 0;
let cells = 0;
for (const path of allRoutes) {
  const file = join(dist, path.slice(1), 'index.html');
  assert.ok(existsSync(file), `Missing built page ${path}`);
  const html = readFileSync(file, 'utf8');
  const doc = parse(html);
  const nodes = [...walk(doc)];
  const label = path;
  pages++;
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
  const ld = nodes.filter((n) => n.nodeName === 'script' && attr(n, 'type') === 'application/ld+json').map((n) => JSON.parse(text(n)));
  const ofType = (type) => ld.filter((n) => n['@type'] === type);
  const faqLd = ofType('FAQPage');
  assert.equal(faqLd.length, 1, `${label}: one FAQPage`);
  const questions = faqLd[0].mainEntity;
  assert.equal(questions.length, 6, `${label}: six FAQ questions`);
  assert.equal(new Set(questions.map((q) => q.name)).size, 6, `${label}: six distinct questions`);
  const crumbs = ofType('BreadcrumbList');
  assert.equal(crumbs.length, 1, `${label}: one BreadcrumbList`);
  const items = crumbs[0].itemListElement;
  assert.ok(items.length >= 3 && items[0].item === abs('/') && items.at(-1).item === abs(path), `${label}: breadcrumb ends at the page`);
  assert.ok(items.some((item) => item.item === abs(W)), `${label}: breadcrumb passes through the dossier index`);
  items.forEach((item, i) => assert.equal(item.position, i + 1));
  const details = nodes.filter((n) => n.nodeName === 'details' && attr(n, 'class') === 'rw-faq');
  assert.equal(details.length, 6, `${label}: six visible FAQ details`);
  details.forEach((node, i) => {
    const summary = node.childNodes.find((c) => c.nodeName === 'summary');
    const answer = node.childNodes.find((c) => c.nodeName === 'p');
    assert.equal(squash(text(summary)), squash(questions[i].name), `${label}: FAQ ${i + 1} question differs from JSON-LD`);
    assert.equal(squash(text(answer)), squash(questions[i].acceptedAnswer.text), `${label}: FAQ ${i + 1} answer differs from JSON-LD`);
    assert.equal(questions[i]['@type'], 'Question');
    assert.equal(questions[i].acceptedAnswer['@type'], 'Answer');
    assert.ok(!/\bundefined\b|\bNaN\b|\[object /.test(questions[i].acceptedAnswer.text), `${label}: FAQ ${i + 1} renders a missing value`);
  });
  faqCount += 6;
  const main = nodes.find((n) => n.nodeName === 'main');
  const mainText = squash(text(main));
  for (const pattern of RATING_LANGUAGE) assert.ok(!pattern.test(mainText), `${label}: rating language ${pattern}`);
  assert.ok(!/\bundefined\b|\bNaN\b|\[object /.test(mainText), `${label}: renders a missing value`);
  for (const ref of nodes.filter((n) => n.nodeName === 'a').map((n) => attr(n, 'href')).filter(Boolean)) {
    const target = ref.startsWith(base + W) ? ref.slice(base.length) : null;
    if (target) linkedFrom.set(target, [...(linkedFrom.get(target) ?? []), path]);
  }
  const facts = new Map();
  for (const dl of nodes.filter((n) => n.nodeName === 'dl' && attr(n, 'class') === 'rw-facts')) {
    const pairs = dl.childNodes.filter((c) => c.nodeName === 'dt' || c.nodeName === 'dd');
    for (let i = 0; i < pairs.length; i += 2) {
      assert.ok(pairs[i].nodeName === 'dt' && pairs[i + 1]?.nodeName === 'dd', `${label}: facts must pair dt and dd`);
      facts.set(squash(text(pairs[i])), squash(text(pairs[i + 1])));
    }
  }
  // Figure tables: every cell equals the dataset value, or "Not supplied" for null.
  const table = (name) => nodes.find((n) => n.nodeName === 'table' && attr(n, 'data-figures') === name);
  const rowCells = (row) => row.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)));
  const lineRow = (tbl, key) => [...walk(tbl)].find((n) => n.nodeName === 'tr' && attr(n, 'data-line') === key);
  const dossier = routes.dossiers.get(path);
  if (dossier) {
    const org = ofType('Organization');
    assert.equal(org.length, 1, `${label}: one Organization`);
    assert.equal(org[0].name, dossier.d.name, `${label}: Organization name`);
    assert.equal(org[0].mainEntityOfPage, abs(path));
    assert.equal(ofType('CollectionPage').length, 0, `${label}: dossiers are not collections`);
    assert.equal(ofType('Dataset').length, 0, `${label}: dossiers carry no Dataset node`);
    const d = dossier.d;
    if (dossier.kind === 'sc') {
      assert.equal(org[0].identifier[0].value, d.number, `${label}: charity number`);
      assert.equal(facts.get('Scottish charity number'), d.number);
      assert.equal(facts.get('Register name'), squash(d.name));
      assert.equal(facts.get('Charity status'), d.status);
      assert.equal(facts.get('Regulatory type'), d.regulatoryType);
      assert.ok(mainText.includes(`row ${d.registerRecord.toLocaleString('en-US')} of ${S.oscrRegister.member}`), `${label}: register row`);
      const returns = table('returns');
      assert.ok(returns, `${label}: returns table`);
      const rows = [...walk(returns)].filter((n) => n.nodeName === 'tr' && attr(n, 'data-record'));
      assert.deepEqual(rows.map((r) => Number(attr(r, 'data-record'))), d.periods.map((p) => p.record), `${label}: one row per return`);
      rows.forEach((row, i) => {
        const p = d.periods[i];
        assert.deepEqual(rowCells(row), [dayLabel(p.received), money(p.grossIncome, '£'), money(p.grossExpenditure, '£')], `${label}: record ${p.record}`);
        assert.ok(squash(text(row)).startsWith(dayLabel(p.end)), `${label}: year end ${p.end}`);
        assert.ok(squash(text(row)).includes(`Record ${p.record.toLocaleString('en-US')}`));
        cells += 2;
      });
      const breakdown = table('breakdown');
      assert.equal(Boolean(breakdown), d.periods.some((p) => p.incomeDetail || p.spendingDetail), `${label}: breakdown table presence`);
      if (breakdown) {
        for (const [group, fields] of [['incomeDetail', scEdition.incomeDetailFields], ['spendingDetail', scEdition.spendingDetailFields]]) {
          for (const field of fields) {
            const row = lineRow(breakdown, field);
            assert.ok(row, `${label}: breakdown row ${field}`);
            assert.deepEqual(rowCells(row), d.periods.map((p) => (p[group] ? money(p[group][field], '£') : 'Not supplied')), `${label}: ${field}`);
            cells += d.periods.length;
          }
        }
      }
      for (const purpose of d.purposes) {
        if (scHubPaths.has(purpose)) assert.ok(html.includes(`href="${base}${scHubPaths.get(purpose)}"`), `${label}: link to purpose hub`);
      }
    } else if (dossier.kind === 'au') {
      assert.equal(org[0].identifier[0].value, d.abn, `${label}: ABN`);
      assert.equal(facts.get('ABN'), d.abn);
      assert.equal(facts.get('Charity legal name'), squash(d.name));
      assert.ok(mainText.includes(`row ${d.registerRecord.toLocaleString('en-US')}`), `${label}: register row`);
      const ais = table('ais');
      assert.ok(ais, `${label}: AIS table`);
      for (const k of auKeys) {
        const row = lineRow(ais, k);
        assert.ok(row, `${label}: AIS row ${k}`);
        assert.deepEqual(rowCells(row), d.periods.map((p) => money(p[k], 'A$')), `${label}: ${k}`);
        cells += d.periods.length;
      }
      assert.deepEqual(rowCells(lineRow(ais, 'consolidation')), d.periods.map((p) => (p.consolidation === 'y' ? 'Yes (y)' : p.consolidation === 'n' ? 'No (n)' : 'Not supplied')));
      assert.deepEqual(rowCells(lineRow(ais, 'accountingBasis')), d.periods.map((p) => p.accountingBasis ?? 'Not supplied'));
      for (const p of d.periods) assert.ok(mainText.includes(`${dayLabel(p.start)} to ${dayLabel(p.end)}AIS ${p.aisYear}, record ${p.record.toLocaleString('en-US')}`), `${label}: AIS period and record ${p.record}`);
      for (const c of d.subtypes) if (auHubPaths.has(c)) assert.ok(html.includes(`href="${base}${auHubPaths.get(c)}"`), `${label}: link to subtype hub`);
    } else {
      assert.equal(org[0].identifier[0].value, d.bn, `${label}: BN`);
      assert.equal(facts.get('Registration number (BN)'), d.bn);
      assert.equal(facts.get('Legal name'), squash(d.name));
      assert.equal(facts.get('Sub-category code'), d.subCategory);
      assert.ok(facts.get('Category').startsWith(`${d.category} ${cra.categories[d.category]}`), `${label}: category`);
      assert.ok(facts.get('Designation').startsWith(`${d.designation} ${cra.designations[d.designation]}`), `${label}: designation`);
      assert.ok(mainText.includes(`record ${d.identificationRecord.toLocaleString('en-US')}`), `${label}: identification record`);
      const t3010 = table('t3010');
      assert.ok(t3010, `${label}: T3010 table`);
      for (const k of caKeys) {
        const row = lineRow(t3010, k);
        assert.ok(row, `${label}: T3010 row ${k}`);
        assert.deepEqual(rowCells(row), d.periods.map((p) => money(p[k], 'C$')), `${label}: ${k}`);
        cells += d.periods.length;
      }
      for (const p of d.periods) assert.ok(mainText.includes(`Fiscal period ending ${dayLabel(p.end)}Financial record ${p.record.toLocaleString('en-US')}`), `${label}: fiscal period and record ${p.record}`);
      if (caHubPaths.has(d.category)) assert.ok(html.includes(`href="${base}${caHubPaths.get(d.category)}"`), `${label}: link to category hub`);
      if (caDesignationPaths.has(d.designation)) assert.ok(html.includes(`href="${base}${caDesignationPaths.get(d.designation)}"`), `${label}: link to designation hub`);
    }
  } else {
    const collection = ofType('CollectionPage');
    const dataset = ofType('Dataset');
    assert.equal(collection.length, 1, `${label}: one CollectionPage`);
    assert.equal(dataset.length, 1, `${label}: one Dataset`);
    assert.equal(ofType('Organization').length, 0, `${label}: hubs carry no Organization node`);
    assert.equal(collection[0].url, abs(path));
    const list = collection[0].mainEntity;
    assert.equal(list['@type'], 'ItemList');
    assert.equal(list.numberOfItems, list.itemListElement.length, `${label}: ItemList count`);
    assert.ok(list.itemListElement.length > 0, `${label}: empty ItemList`);
    assert.equal(new Set(list.itemListElement.map((i) => i.url)).size, list.itemListElement.length, `${label}: duplicate ItemList entry`);
    const expected = members.get(path);
    if (expected.length) {
      assert.deepEqual([...list.itemListElement.map((i) => i.url)].sort(), expected.map(abs).sort(), `${label}: ItemList must list exactly the hub's dossiers`);
      for (const member of expected) assert.ok(html.includes(`href="${base}${member}"`), `${label}: missing link to ${member}`);
    }
    list.itemListElement.forEach((item, i) => {
      assert.equal(item.position, i + 1);
      const target = new URL(item.url).pathname.slice(base.length);
      const wave1cEntry = path === CAUSE && (wave1cPaths.has(target) || wave1dPaths.has(target)) && existsSync(join(dist, target.slice(1), 'index.html'));
      assert.ok(routes.hubs.has(target) || routes.dossiers.has(target) || wave1Paths.has(target) || wave1cEntry, `${label}: ItemList points outside the verified registry pages: ${item.url}`);
      assert.ok(html.includes(`href="${base}${target}"`), `${label}: ItemList entry is not linked on the page: ${target}`);
    });
    assert.equal(dataset[0].isAccessibleForFree, true, `${label}: free dataset`);
    assert.ok(dataset[0].license && dataset[0].dateModified === manifest.edition, `${label}: dataset licence and edition`);
    assert.ok(dataset[0].distribution.length >= 1, `${label}: dataset distribution`);
    for (const dl of dataset[0].distribution) {
      assert.equal(dl['@type'], 'DataDownload');
      const rel = new URL(dl.contentUrl).pathname.slice(base.length + 1);
      assert.ok(existsSync(join(dist, rel)), `${label}: distribution file missing ${dl.contentUrl}`);
    }
  }
}
// Hub-specific coverage: the country indexes list their hubs; the cause page covers every register.
const itemPaths = (path) => {
  const html = readFileSync(join(dist, path.slice(1), 'index.html'), 'utf8');
  const node = [...walk(parse(html))].filter((n) => n.nodeName === 'script' && attr(n, 'type') === 'application/ld+json').map((n) => JSON.parse(text(n))).find((n) => n['@type'] === 'CollectionPage');
  return { html, urls: node.mainEntity.itemListElement.map((i) => new URL(i.url).pathname.slice(base.length)) };
};
assert.deepEqual(itemPaths(SCB).urls.sort(), [...scHubPaths.values()].sort(), 'Scotland index lists every purpose hub');
assert.deepEqual(itemPaths(AUB).urls.sort(), [...auHubPaths.values()].sort(), 'Australia index lists every subtype hub');
assert.deepEqual(itemPaths(CAB).urls.sort(), [...caHubPaths.values(), ...caDesignationPaths.values()].sort(), 'Canada index lists every category and designation hub');
for (const [path, items] of [[SCB, sc.map(scPath)], [AUB, au.map(auPath)], [CAB, ca.map(caPath)]]) {
  const html = readFileSync(join(dist, path.slice(1), 'index.html'), 'utf8');
  for (const member of items) assert.ok(html.includes(`href="${base}${member}"`), `${path}: missing link to ${member}`);
}
const standardNtee = (code) => (code && /^[A-Z][0-9A-Z]{1,3}$/.test(code) ? code : null);
const labelKeys = {
  us: (d) => [standardNtee(d.ntee)?.[0]].filter(Boolean), ew: (d) => d.what.map(([c]) => c),
  scotland: (d) => d.purposes, australia: (d) => d.subtypes, canada: (d) => [d.category],
};
const registryItems = { us, ew, scotland: sc, australia: au, canada: ca };
const labelCount = (r, key) => registryItems[r].filter((d) => labelKeys[r](d).includes(key)).length;
let causeCells = 0;
const cause = itemPaths(CAUSE);
for (const index of ['/record/charity-dossiers/united-states/', '/record/charity-dossiers/england-wales/', SCB, AUB, CAB]) assert.ok(cause.urls.includes(index), `Cause × Country must list ${index}`);
const causeDoc = [...walk(parse(cause.html))];
assert.ok(squash(text(causeDoc.find((n) => n.nodeName === 'main'))).includes('The categories are not identical across registers.'), 'Cause × Country must state that categories differ');
for (const g of causes.groups) {
  const row = causeDoc.find((n) => n.nodeName === 'tr' && attr(n, 'data-group') === g.id);
  assert.ok(row, `Cause × Country row ${g.id}`);
  for (const r of REGISTRIES) {
    const cell = row.childNodes.find((c) => c.nodeName === 'td' && attr(c, 'data-registry') === r);
    const cellText = squash(text(cell));
    if (!g.matches[r].length) assert.equal(cellText, 'No matching label', `${g.id} ${r}`);
    // One line per matched label, in label order, separated by <br>: "<label>[ (<code>)] (<dossiers>)".
    const segments = [''];
    for (const child of cell.childNodes) {
      if (child.nodeName === 'br') segments.push('');
      else segments[segments.length - 1] += text(child);
    }
    if (g.matches[r].length) assert.equal(segments.length, g.matches[r].length, `${g.id} ${r}: one line per label`);
    g.matches[r].forEach((key, i) => {
      const name = labels[r].find(([k]) => k === key)[1];
      const segment = squash(segments[i]);
      assert.ok(segment.toLowerCase().startsWith(name.toLowerCase()), `${g.id} ${r}: label ${name}`);
      const shown = segment.slice(name.length).match(/^(?: \((?:NTEE )?[0-9A-Z]{1,4}\))? \(([\d,]+)\)$/);
      assert.ok(shown, `${g.id} ${r}: dossier count after ${name}`);
      assert.equal(Number(shown[1].replace(/,/g, '')), labelCount(r, key), `${g.id} ${r}: dossier count for ${name}`);
      const hub = r === 'scotland' ? scHubPaths.get(key) : r === 'australia' ? auHubPaths.get(key) : r === 'canada' ? caHubPaths.get(key) : null;
      if (hub) assert.ok(cell.childNodes.some((c) => c.nodeName === 'a' && attr(c, 'href') === `${base}${hub}`), `${g.id} ${r}: link to ${hub}`);
      causeCells++;
    });
  }
}
// Every Wave 1b page is reachable from another Wave 1b page (the indexes also from the dossier index).
for (const path of allRoutes) {
  assert.ok((linkedFrom.get(path) ?? []).some((from) => from !== path), `Orphan Wave 1b page ${path}`);
}
for (const path of routes.dossiers.keys()) {
  assert.ok((linkedFrom.get(path) ?? []).some((from) => routes.hubs.has(from)), `Dossier not linked from any hub: ${path}`);
}
const rootHtml = readFileSync(join(dist, W.slice(1), 'index.html'), 'utf8');
for (const index of [SCB, AUB, CAB, CAUSE]) assert.ok(rootHtml.includes(`href="${base}${index}"`), `${W} must link to ${index}`);
const rootLd = [...walk(parse(rootHtml))].filter((n) => n.nodeName === 'script' && attr(n, 'type') === 'application/ld+json').map((n) => JSON.parse(text(n)));
const rootFaq = rootLd.find((n) => n['@type'] === 'FAQPage');
assert.equal(rootFaq.mainEntity.length, 6);
assert.ok(rootFaq.mainEntity[0].acceptedAnswer.text.includes(`${sc.length.toLocaleString('en-US')} Scotland, ${au.length.toLocaleString('en-US')} Australia and ${ca.length.toLocaleString('en-US')} Canada`), `${W}: FAQ counts`);
for (const [entry, index] of [['record/charity-financials/index.html', AUB], ['record/charity-financials/scotland/index.html', SCB], ['record/charity-financials/canada/index.html', CAB]]) {
  assert.ok(readFileSync(join(dist, entry), 'utf8').includes(`href="${base}${index}"`), `${entry} must link to ${index}`);
}
for (const file of Object.values(manifest.outputs).map((o) => o.path).concat('manifest.json')) {
  assert.equal(sha(readFileSync(join(dist, 'data/registry-wave1b', file))), sha(readFileSync(join(dataDir, file))), `Built copy of ${file} differs`);
}

// ---------- 5. Sitemap partition, llms.txt and feed ----------
assert.deepEqual([...wave1b.locs].sort(), allRoutes.map(abs).sort(), 'Wave 1b sitemap must list exactly the Wave 1b pages');
const wave1bSet = new Set(allRoutes.map(abs));
assert.ok(!core.locs.some((loc) => wave1bSet.has(loc)), 'Core sitemap must not list Wave 1b pages');
assert.ok(!wave1.locs.some((loc) => wave1bSet.has(loc)), 'Wave 1 sitemap must not list Wave 1b pages');
assert.ok(!wave1c.locs.some((loc) => wave1bSet.has(loc)), 'Wave 1c sitemap must not list Wave 1b pages');
assert.ok(!wave1d.locs.some((loc) => wave1bSet.has(loc)), 'Wave 1d sitemap must not list Wave 1b pages');
assert.ok(!core.locs.some((loc) => new URL(loc).pathname.startsWith(base + W)), 'Core sitemap must not list registry dossier pages');
const llms = readFileSync(join(dist, 'llms.txt'), 'utf8');
for (const path of routes.hubs.keys()) assert.ok(llms.includes(abs(path)), `llms.txt missing hub ${path}`);
for (const ref of ['/sitemap-registries-wave1b.xml', '/data/registry-wave1b/manifest.json', '/data/registry-wave1b/cause-groups.json']) assert.ok(llms.includes(abs(ref)), `llms.txt missing ${ref}`);
assert.ok(/^[\x00-\x7F]*$/.test(llms.slice(llms.indexOf('## Verified Charity Dossiers, Wave 1b'), llms.indexOf('## Key Funding-Flow'))), 'llms.txt Wave 1b section must be ASCII');
const feed = readFileSync(join(dist, 'feed.xml'), 'utf8');
for (const path of [SCB, AUB, CAB, CAUSE]) assert.ok(!feed.includes(path), 'The RSS feed lists writing, not Wave 1b registry records');

console.log(`✓ Registry Wave 1b: ${sc.length} Scotland, ${au.length} Australia and ${ca.length} Canada dossiers match the pinned editions (${figures} figures, ${cells} table cells checked); ${routes.hubs.size} hubs (each topical hub >= ${hubMin} dossiers) and ${causes.groups.length} cause groups reproduced from published labels (${causeCells} label counts checked); ${pages} built pages with ${faqCount} FAQ answers equal to FAQPage JSON-LD; sitemap index ${core.locs.length} core + ${wave1.locs.length} Wave 1 + ${wave1b.locs.length} Wave 1b URLs.`);
