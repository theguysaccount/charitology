// Wave 1c verified charity dossiers and register hubs (the national registers
// already validated by check:references): offline integrity gate, at least as
// strict as scripts/check-registry-wave1b.mjs.
// 1. The committed dataset matches its manifest fingerprints, and every pinned
//    edition manifest, source table and edition asset matches its fingerprint.
// 2. Every dossier is re-derived here, independently of the builder, from the
//    committed editions: selection complete (dossiers + recorded exclusions =
//    exactly the qualifying records), every fact and every figure equal.
// 3. Every register hub is re-derived from the edition (population, label
//    counts, members, the Croatia list cap); every hub has at least five
//    organizations or dossiers; the cause grouping is reproduced from the
//    published labels with the stems pinned below.
// 4. Every built page carries six visible FAQs equal to its FAQPage JSON-LD, a
//    BreadcrumbList, Organization (dossiers) or CollectionPage + Dataset (hubs)
//    JSON-LD, its exact facts and figures cell by cell ("Not supplied" for every
//    null), internal links, the shared analytics script and no rating
//    language; titles and descriptions are unique across Wave 1, 1b and 1c; the
//    partitioned sitemap, llms.txt and feed agree with the data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'parse5';
import { readBuiltSitemapSet } from './sitemap-set.mjs';

const root = process.cwd();
const dataDir = join(root, 'public/data/registry-wave1c');
const dist = join(root, 'dist');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256Pattern = /^[0-9a-f]{64}$/;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Pinned rules (a change in the builder cannot pass silently) ----------
const THRESHOLDS = {
  nz: { line: 'totalGrossIncome', value: '3000000', currency: 'NZD' },
  ni: { line: 'totalIncome', value: '1000000', currency: 'GBP' },
  jp: { line: 'ordinaryRevenue', value: '100000000', currency: 'JPY' },
  se: { line: 'revenue', value: '50000', currency: 'SEK', unit: 'thousand' },
  mx: { line: 'dona_efe_nal', value: '50000000.00', currency: 'MXN' },
  sk: { line: 'amount', value: '100000.00', currency: 'EUR' },
  pl: { line: 'amount', value: '2000000.00', currency: 'PLN' },
};
const DOSSIER_KEYS = ['nz', 'ni', 'jp', 'se', 'mx', 'sk', 'pl'];
const HUB_KEYS = ['at', 'fi', 'lv', 'dk', 'hr'];
const HUB_MIN = 5;
const HR_CAP = 1000;
const PINNED_EDITIONS = {
  nz: ['public/data/charity-registry/new-zealand/manifest.json', '2f4f5523fb1b9ebcdd41fb24f51d5ed0f7f0f773ae9928434e879e5c08ab64d0'],
  ni: ['public/data/charity-registry/northern-ireland/manifest.json', 'c0aee8093c71ba9130624f92958ffc8953ae19bd09cf43196fa9ff130cb58661'],
  niAnomalies: ['public/data/charity-registry/northern-ireland/anomalies.json', 'b8689f5cee3440909d12bfd70afaef1d3403fcf23aceb0e4fc9df93263d2a5e3'],
  jp: ['public/data/charity-registry/japan-npo/manifest.json', '965d73a2cb39ae709465cc231a360e0c3e5f1f962db6ebefe448a7d8738cd823'],
  se: ['public/data/charity-registry/sweden/manifest.json', 'd69c0528f7492e5c72685a1204d08aad9bffe94722ea3452efcfef8aafb3fab2'],
  seAnomalies: ['public/data/funding-flows/sweden-90-konto/anomalies.json', '422242a7dac5d61ba917da3c4fa10bf2c64b3039b19e582face0285b59dc46f1'],
  mx: ['public/data/charity-financials/mx/manifest.json', 'afa96fe2139dc73c5e1c913e794ff3463d7f1da4abc9c763c7e791bfb541ed5c'],
  sk: ['public/data/charity-registry/slovakia/manifest.json', '1965201117ea69417aa4d3cc0b6c553be1ac23e483fd42689b82ae762707a183'],
  skAnomalies: ['public/data/funding-flows/slovakia-pit-2-percent/anomalies.json', '20766f8cb19db495a68bef6e29f6d2d8b3d3c4fdef133d8b2013956a7bb1104b'],
  pl: ['public/data/charity-registry/poland/manifest.json', '1ffbd2aa2546b11b3ea9210ce38095bc2269d29060d8e6a0e5dfbb8cd514c434'],
  plFlows: ['public/data/funding-flows/poland-pit-1-5-percent/manifest.json', '09f9bcdf11f069b9a049771b9389e75f712b2944a8ced58cfcabf73e3e21f4ca'],
  at: ['public/data/charity-registry/austria/manifest.json', '34a1d310944b9635cbf9256e06af1a32d5e0553a6144cf08d9d4a7da748b7372'],
  fi: ['public/data/charity-registry/finland/manifest.json', 'df2107fa7a0b1bc8ee569b1841ecf21a2f9fc242046620912f56e4f8504a8157'],
  lv: ['public/data/charity-registry/latvia/manifest.json', '71e20841b0ab0e8a7f78d49619918b991cfbace4441e13bbce80910093ee5194'],
  dk: ['public/data/charity-registry/denmark/manifest.json', 'aa50b4ded7ccf17ee852d86d49869eee4e44442121136946a556f1751e9694bf'],
  hr: ['public/data/charity-registry/croatia/manifest.json', 'b4e24f39732bc270cac5ec697adf8b3c0b366d5e7183ba07b8c148cad9e6c04b'],
  wave1b: ['public/data/registry-wave1b/manifest.json', '0c3896923388a393e2b19d569e77c98f838a001274a67299c3cb9f5671f07797'],
};
// Wave 1b's English stems, unchanged, and the Wave 1c stems by label language.
const WAVE1B_STEMS = [
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
const LANGUAGE_STEMS = {
  education: { sv: ['utbildning'], es: ['educa'], de: ['bildung', 'schul', 'privatschul', 'universit', 'kindergärt', 'privatkindergärt'], lv: ['izglītīb'], hr: ['obrazovan', 'prosvjet'] },
  health: { sv: ['hälso', 'sjukvård', 'sjukdom', 'kärlsjukdom', 'cancer', 'diabetes', 'hiv'], es: ['salud'], de: ['gesundheit'], lv: ['veselīb', 'slimīb'], hr: ['zdravlj', 'zdravstven'] },
  religion: { sv: ['religiös', 'mission'], es: ['religios'], de: ['kirche'], lv: ['reliģ', 'baznīc'], hr: ['duhovn', 'vjersk'] },
  poverty: { sv: ['fattig'], es: ['pobreza'], de: ['armut'], lv: ['trūcīg', 'nabadzīb'], hr: ['siromaš'] },
  environment: { sv: ['miljö', 'natur'], es: ['ecológ', 'ambient'], de: ['naturschutz', 'umwelt'], lv: ['vide'], hr: ['okoliš', 'ekološ'] },
  animals: { sv: ['djur'], es: ['especie'], de: ['tier'], lv: ['dzīvniek'], hr: ['životinj'] },
  'arts-culture': { sv: ['kultur'], es: ['museo', 'bibliotec'], de: ['kunst', 'kultur', 'museen', 'privatmuseen', 'denkmal'], lv: ['kultūr', 'māksl'], hr: ['umjetnost', 'kulturn', 'kultura i umjet'] },
  rights: { sv: ['rättighet'], es: ['derechos'], de: ['menschenrecht'], lv: ['cilvēktiesīb', 'tiesīb'], hr: ['prava'] },
  'sport-recreation': { sv: ['idrott', 'fritid', 'friluftsliv'], es: ['deport'], hr: ['šport', 'hobist'] },
  community: { sv: ['samhälls'], es: ['comunidad', 'comunitari'], de: ['gemeinwesen'], lv: ['pilsonisk', 'kopien'], hr: ['zajednic'] },
  housing: { sv: ['boende'], es: ['vivienda'], de: ['wohn'], lv: ['mājok'], hr: ['stanov'] },
  'science-research': { sv: ['forskning'], es: ['investigaci', 'científ'], de: ['wissenschaft', 'forschung'], lv: ['zinātn', 'pētniec'], hr: ['znanstven', 'znanost', 'istraživanj'] },
  disability: { sv: ['funktionsned'], es: ['discapacid'], de: ['behind'], lv: ['invalid'], hr: ['invalid'] },
  international: { sv: ['internation'], es: ['internacional'], lv: ['starptautisk'], hr: ['međunarodn'] },
  safety: { sv: ['katastrof'], de: ['feuerwehr', 'katastroph'], lv: ['katastrof', 'ārkārtas'], hr: ['spašavanj'] },
  'food-agriculture': { sv: ['jordbruk'], es: ['aliment'], de: ['landwirtschaft', 'ernährung'], lv: ['lauksaimniec'], hr: ['poljoprivred'] },
  employment: { sv: ['arbetsmarknad', 'sysselsättning'], es: ['empleo'], de: ['beschäftigung', 'arbeitsmarkt'], lv: ['nodarbinātīb'], hr: ['zapošljav'] },
};
const LANGUAGES = ['sv', 'es', 'de', 'lv', 'hr'];
const CAUSE_KEYS = ['ni', 'se', 'mx', 'at', 'fi', 'lv', 'dk', 'hr'];
const LABEL_LANGUAGE = { ni: 'en', se: 'sv', mx: 'es', at: 'de', fi: 'en', lv: 'lv', dk: 'da', hr: 'hr' };
const DK_LABELS = { s8a: 'LL § 8 A', s12: 'LL § 12, stk. 3', bal: 'BAL § 3, stk. 2' };
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordMatch = (label, stem) => new RegExp(`(?<![a-z])${escapeRe(stem)}`).test(label.toLowerCase());

// ---------- 1. Dataset files, pinned editions and source tables ----------
const manifest = readJson(join(dataDir, 'manifest.json'));
assert.equal(manifest.format, 'charitology-registry-wave1c-v1');
assert.match(manifest.edition, isoDay);
assert.equal(manifest.builder, 'scripts/build-registry-wave1c.py');
assert.equal(manifest.checker, 'scripts/check-registry-wave1c.mjs');
const expectedOutputs = [...DOSSIER_KEYS.flatMap((k) => [k, `${k}Counts`]), ...HUB_KEYS, 'causes'].sort();
assert.deepEqual(Object.keys(manifest.outputs).sort(), expectedOutputs, 'Unexpected Wave 1c outputs');
for (const [key, output] of Object.entries(manifest.outputs)) {
  const bytes = readFileSync(join(dataDir, output.path));
  assert.equal(bytes.length, output.bytes, `${key}: byte count`);
  assert.equal(sha(bytes), output.sha256, `${key}: SHA-256`);
}
assert.deepEqual(Object.keys(manifest.pinnedEditions).sort(), Object.keys(PINNED_EDITIONS).sort(), 'Pinned editions changed');
for (const [key, [path, digest]] of Object.entries(PINNED_EDITIONS)) {
  assert.deepEqual(manifest.pinnedEditions[key], { path, sha256: digest }, `${key}: pinned edition`);
  assert.equal(sha(readFileSync(join(root, path))), digest, `Pinned ${key} edition file changed without rebuilding Wave 1c`);
}
for (const [key, table] of Object.entries(manifest.sourceTables)) {
  assert.match(table.sha256, sha256Pattern);
  assert.equal(sha(readFileSync(join(root, table.path))), table.sha256, `${key}: source table changed`);
}
const edition = (key) => readJson(join(root, PINNED_EDITIONS[key][0]));
const out = (key) => readJson(join(dataDir, manifest.outputs[key].path));
function asset(directory, descriptor) {
  const packed = readFileSync(join(root, directory, descriptor.path));
  assert.equal(packed.length, descriptor.bytes, `${descriptor.path}: bytes`);
  assert.equal(sha(packed), descriptor.sha256, `${descriptor.path}: SHA-256`);
  const raw = gunzipSync(packed, { maxOutputLength: descriptor.decodedBytes });
  assert.equal(raw.length, descriptor.decodedBytes);
  assert.equal(sha(raw), descriptor.decodedSha256, `${descriptor.path}: decoded SHA-256`);
  const rows = JSON.parse(raw);
  if (descriptor.rows !== undefined) assert.equal(rows.length, descriptor.rows, `${descriptor.path}: rows`);
  return rows;
}
const shards = (directory, descriptors) => Object.keys(descriptors).sort().flatMap((k) => asset(directory, descriptors[k]));
// Every source record of the manifest names an official URL, a SHA-256 and a capture date.
for (const [key, entries] of Object.entries(manifest.sources)) {
  assert.ok([...DOSSIER_KEYS, ...HUB_KEYS].includes(key), `Unexpected source group ${key}`);
  for (const [name, s] of Object.entries(entries)) {
    assert.ok(new URL(s.url).protocol.startsWith('http'), `${key} ${name}: URL`);
    assert.match(s.sha256, sha256Pattern, `${key} ${name}: SHA-256`);
    assert.ok(Number.isFinite(Date.parse(s.retrievedAt)), `${key} ${name}: retrieval time`);
    assert.ok(s.title && s.title.length > 5, `${key} ${name}: title`);
  }
}

// ---------- 2. Dossiers, re-derived from the committed editions ----------
const centsText = (cents) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
const decimalAtLeast = (text, threshold) => {
  // Exact comparison of non-negative decimal strings with at most two decimals.
  const toCents = (v) => { const [w, c = ''] = String(v).split('.'); return BigInt(w) * 100n + BigInt((c + '00').slice(0, 2)); };
  return text !== null && text !== undefined && !String(text).startsWith('-') && toCents(text) >= toCents(threshold);
};
const expected = {};
const expectedExcluded = {};
const counts = {};
{
  // New Zealand
  const m = edition('nz');
  assert.equal(m.format, 'charitology-nz-tier3-v1');
  const rows = asset('public/data/charity-registry/new-zealand', m.asset);
  const dossiers = []; const excluded = { notRegistered: [] };
  rows.forEach((r, i) => {
    const [orgId, number, name, status, registered, deregistered, group, returns] = r;
    if (!returns.length) return;
    const latest = returns.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (!decimalAtLeast(String(latest[6]), THRESHOLDS.nz.value)) return;
    if (status !== 'Registered') { excluded.notRegistered.push(number); return; }
    for (const ret of returns) assert.ok(Number.isSafeInteger(ret[6]) && Number.isSafeInteger(ret[7]), `${number}: integer amounts`);
    dossiers.push({
      id: number, name, record: i + 1,
      facts: { organisationId: orgId, status, registered, deregistered, groupId: group }, labels: [],
      periods: [...returns].sort((a, b) => b[1].localeCompare(a[1])).map((ret) => ({
        end: ret[1], record: ret[0], sourceStatusCode: ret[2], reportedCurrency: ret[3], currency: ret[4], currencyBasis: ret[5],
        values: { totalGrossIncome: String(ret[6]), totalExpenditure: String(ret[7]) },
      })),
    });
  });
  expected.nz = dossiers; expectedExcluded.nz = excluded;
  counts.nz = { editionOrganizations: rows.length, withReturns: rows.filter((r) => r[7].length).length, statuses: Object.fromEntries([...new Set(rows.map((r) => r[3]))].sort().map((s) => [s, rows.filter((r) => r[3] === s).length])) };
}
{
  // Northern Ireland
  const m = edition('ni');
  const anomalies = edition('niAnomalies');
  assert.equal(anomalies.sourceSha256, m.sourceCapture.sha256);
  const flagged = new Map(anomalies.largeUnverifiedOutliers.map((a) => [a.nic, a.note]));
  const rows = asset('public/data/charity-registry/northern-ireland', m.artifacts.organizations);
  const purposeCodes = m.purposes.map((p) => p.code);
  const dossiers = []; const excluded = { removed: [] };
  rows.forEach((r, i) => {
    if (r.fye === null || r.income === null || !decimalAtLeast(String(r.income), THRESHOLDS.ni.value)) return;
    if (!r.active) { excluded.removed.push(r.regId); return; }
    assert.ok(Number.isSafeInteger(r.income) && Number.isSafeInteger(r.spending) && r.spending > 0, `${r.regId}: income and spending must be published non-zero integers`);
    dossiers.push({
      id: r.regId, name: r.name, record: i + 1,
      facts: { nic: r.nic, otherName: r.otherName, registered: r.registered, status: r.statusRaw, governingDocument: r.govDoc, editionFlag: flagged.get(r.nic) ?? null },
      labels: purposeCodes.filter((p) => r.purposes.includes(p)),
      periods: [{ end: r.fye, values: { totalIncome: String(r.income), totalSpending: String(r.spending) } }],
    });
  });
  expected.ni = dossiers; expectedExcluded.ni = excluded;
  const active = rows.filter((r) => r.active);
  counts.ni = { editionOrganizations: rows.length, active: active.length, removed: rows.length - active.length, labels: Object.fromEntries(purposeCodes.map((p) => [p, active.filter((r) => r.purposes.includes(p)).length])) };
}
{
  // Japan
  const m = edition('jp');
  assert.deepEqual(m.financeFields, ['organizationSourceRecord', 'fiscalYearLabel', 'ordinaryRevenueJPY', 'ordinaryExpensesJPY', 'donationsReceivedJPY', 'grantsAndSimilarIncomeReceivedJPY']);
  const rows = asset('public/data/charity-registry/japan-npo', m.asset);
  const dossiers = []; const excluded = { dissolutionRecorded: [] };
  rows.forEach((r, i) => {
    const [portal, name, kana, authority, corporate, certified, dissolution, adminRecord, finance] = r;
    if (!finance || finance[2] === null || !decimalAtLeast(finance[2], THRESHOLDS.jp.value)) return;
    if (dissolution) { excluded.dissolutionRecorded.push(portal); return; }
    for (const v of finance.slice(2)) assert.ok(v === null || /^-?\d{1,16}$/.test(v));
    dossiers.push({
      id: portal, name, record: i + 1,
      facts: { kana, authority, corporateNumber: corporate, certified, administrativeRecord: adminRecord }, labels: [],
      periods: [{ label: finance[1], record: finance[0], values: { ordinaryRevenue: finance[2], ordinaryExpenses: finance[3], donationsReceived: finance[4], grantsReceived: finance[5] } }],
    });
  });
  expected.jp = dossiers; expectedExcluded.jp = excluded;
  counts.jp = { editionOrganizations: rows.length, financialSummaries: rows.filter((r) => r[8]).length, authorities: m.authorities.length, withDissolutionInformation: rows.filter((r) => r[6]).length };
}
{
  // Sweden
  const m = edition('se');
  const anomalies = edition('seAnomalies');
  const flagged = new Set(anomalies.duplicateYearColumns.organizations.map((o) => o.slug));
  assert.equal(flagged.size, m.counts.duplicateYearHeaderCards);
  const rows = asset('public/data/charity-registry/sweden', m.artifacts.organizations);
  const dossiers = []; const excluded = { duplicateYearHeaderCard: [] };
  rows.forEach((r, i) => {
    const f = r.financials;
    if (r.status !== 'active' || !f || f.latestYear !== m.financialReportingYear || f.latestRevenueTkr === null || !decimalAtLeast(String(f.latestRevenueTkr), THRESHOLDS.se.value)) return;
    assert.match(r.orgNr, /^\d{6}-\d{4}$/);
    if (flagged.has(r.slug)) { excluded.duplicateYearHeaderCard.push(r.orgNr); return; }
    dossiers.push({
      id: r.orgNr, name: r.name, record: i + 1,
      facts: { legalForm: r.legalForm, since: r.since, profileUrl: r.profileUrl, areas: r.areas, regions: r.regions, swedenCounties: r.swedenCounties },
      labels: [...r.purposes],
      periods: [...f.years].sort((a, b) => b.year - a.year).map((y) => ({ label: String(y.year), values: { revenue: y.revenueTkr === null ? null : String(y.revenueTkr), equity: y.equityTkr === null ? null : String(y.equityTkr) } })),
    });
  });
  expected.se = dossiers; expectedExcluded.se = excluded;
  const active = rows.filter((r) => r.status === 'active');
  const purposes = [...new Set(rows.flatMap((r) => r.purposes))].sort();
  counts.se = { editionOrganizations: rows.length, active: active.length, byStatus: m.counts.byStatus, labels: Object.fromEntries(purposes.map((p) => [p, active.filter((r) => r.purposes.includes(p)).length])) };
}
{
  // Mexico
  const m = edition('mx');
  const fields = m.financialFields.map((f) => f.field);
  assert.equal(fields[0], 'dona_efe_nal');
  assert.equal(fields.length, 16);
  const rows = asset('public/data/charity-financials/mx', m.asset);
  const threshold = BigInt(THRESHOLDS.mx.value.replace('.', ''));
  const dossiers = []; const categories = new Map();
  rows.forEach((r, i) => {
    const [rfc, periods, directories] = r;
    if (!periods.length) return;
    const latest = periods.reduce((a, b) => (b[0] > a[0] ? b : a));
    categories.set(latest[4], (categories.get(latest[4]) ?? 0) + 1);
    if (latest[5][0] === null || BigInt(latest[5][0]) < threshold) return;
    for (const p of periods) for (const v of p[5]) assert.ok(v === null || Number.isSafeInteger(v));
    const dir = directories.length ? directories.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
    dossiers.push({
      id: rfc, name: latest[2], record: i + 1,
      facts: { state: latest[3], category: latest[4], directoryYear: dir ? dir[0] : null, directoryName: dir ? dir[1] : null, directoryStatus: dir ? dir[3] : null,
        directoryActivities: dir ? [...new Set(dir[4].map(([, code]) => code))].sort() : [] },
      labels: [latest[4]],
      periods: [...periods].sort((a, b) => b[0] - a[0]).map((p) => ({ label: String(p[0]), record: p[1], name: p[2], category: p[4],
        values: Object.fromEntries(fields.map((f, j) => [f, p[5][j] === null ? null : centsText(p[5][j])])) })),
    });
  });
  expected.mx = dossiers; expectedExcluded.mx = {};
  counts.mx = { editionOrganizations: rows.length, withFinancialPeriods: rows.filter((r) => r[1].length).length, labels: Object.fromEntries([...categories].sort((a, b) => (a[0] < b[0] ? -1 : 1))) };
}
{
  // Slovakia
  const m = edition('sk');
  const anomalies = edition('skAnomalies');
  const years = m.counts.yearsCovered;
  assert.deepEqual(years, [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  const rows = shards('public/data/charity-registry/slovakia', m.shards.names);
  assert.equal(rows.length, m.counts.includedOrganizations);
  const combined = new Set(anomalies.duplicateIcoRowsInSameYear.records.map((x) => `${x.ico}|${x.year}`));
  assert.equal(combined.size, anomalies.duplicateIcoRowsInSameYear.count);
  const threshold = BigInt(THRESHOLDS.sk.value.replace('.', ''));
  const dossiers = rows.filter((r) => r.y2025Cents !== null && BigInt(r.y2025Cents) >= threshold).map((r) => {
    assert.equal(r.yearly['2025'], r.y2025Cents);
    return {
      id: r.ico, name: r.name, record: null, facts: { municipality: r.muni }, labels: [],
      periods: [...years].sort((a, b) => b - a).map((y) => {
        const c = combined.has(`${r.ico}|${y}`);
        return { label: String(y), combined: c, values: { amount: c || !(String(y) in r.yearly) ? null : centsText(r.yearly[String(y)]) } };
      }),
    };
  });
  expected.sk = dossiers; expectedExcluded.sk = {};
  counts.sk = { editionOrganizations: rows.length, years, active2025: m.counts.active2025Organizations, recipients: Object.fromEntries(years.map((y) => [String(y), m.yearly[String(y)].distinctOrganizations])) };
}
{
  // Poland
  const m = edition('pl');
  const flows = edition('plFlows');
  const registry = new Map(asset('public/data/charity-registry/poland', m.asset).map((r) => [r[0], r]));
  const recipients = asset('public/data/funding-flows/poland-pit-1-5-percent', flows.asset);
  const taxYears = flows.byYear.map((y) => y.taxYear);
  assert.deepEqual(taxYears, [2022, 2023, 2024, 2025]);
  const threshold = BigInt(THRESHOLDS.pl.value.replace('.', ''));
  const dossiers = [];
  recipients.forEach((r, i) => {
    const [krs, name, voiv, mask, , ...rest] = r;
    const amounts = rest.slice(0, 4); const taxpayers = rest.slice(4);
    if (BigInt(amounts[3]) < threshold) return;
    const reg = registry.get(krs);
    assert.ok(reg && reg[2] === name && reg[3] === voiv && reg[5] === mask, `${krs}: registry row`);
    dossiers.push({
      id: krs, name, record: i + 1,
      facts: { nip: reg[1], voivodeship: voiv, city: reg[4], eligibleLists: [[1, 2023], [2, 2024], [4, 2025]].filter(([bit]) => mask & bit).map(([, y]) => y) },
      labels: [],
      periods: taxYears.map((y, j) => ({ y, a: amounts[j], t: taxpayers[j] })).sort((a, b) => b.y - a.y).map(({ y, a, t }) => ({
        label: String(y), payoutYear: String(y + 1),
        values: { amount: a > 0 ? centsText(a) : null, taxpayers: t === null ? null : `${Math.floor(t / 10)}.${t % 10}` },
      })),
    });
  });
  expected.pl = dossiers; expectedExcluded.pl = {};
  counts.pl = { editionOrganizations: registry.size, fundedRecipients: recipients.length, funded: Object.fromEntries(flows.byYear.map((y) => [String(y.taxYear), y.fundedOrgCount])), eligible2025: m.counts.eligible2025 };
}
const data = Object.fromEntries(DOSSIER_KEYS.map((k) => [k, out(k)]));
let figures = 0;
for (const k of DOSSIER_KEYS) {
  const exp = [...expected[k]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assert.deepEqual(data[k].map((d) => d.id), exp.map((d) => d.id), `${k}: dossier identifiers differ from the selection rule`);
  data[k].forEach((d, i) => assert.deepStrictEqual(d, exp[i], `${k} ${d.id}: dossier differs from the committed edition`));
  const sel = manifest.selection[k];
  assert.deepEqual(sel.threshold, THRESHOLDS[k], `${k}: threshold changed`);
  assert.deepEqual(sel.excluded, Object.fromEntries(Object.entries(expectedExcluded[k]).map(([r, v]) => [r, [...v].sort()])), `${k}: exclusions`);
  const excludedIds = Object.values(sel.excluded).flat();
  assert.equal(new Set([...data[k].map((d) => d.id), ...excludedIds]).size, data[k].length + excludedIds.length, `${k}: dossiers and exclusions overlap`);
  assert.equal(sel.candidates, data[k].length + excludedIds.length, `${k}: candidates`);
  assert.equal(sel.dossiers, data[k].length);
  assert.deepStrictEqual(out(`${k}Counts`), counts[k], `${k}: edition counts`);
  for (const d of data[k]) {
    assert.ok(typeof d.name === 'string' && d.name.trim() && d.name.length <= 250, `${k} ${d.id}: name`);
    assert.ok(decimalAtLeast(d.periods[0].values[THRESHOLDS[k].line], THRESHOLDS[k].value), `${k} ${d.id}: latest period below the threshold`);
    for (const p of d.periods) for (const v of Object.values(p.values)) if (v !== null) { assert.match(v, /^-?\d{1,16}(?:\.\d{1,2})?$/); figures++; }
  }
}
const totalDossiers = DOSSIER_KEYS.reduce((n, k) => n + data[k].length, 0);
assert.ok(totalDossiers >= 1000 && totalDossiers <= 2500, `Wave 1c should add 1,000 to 2,500 dossiers, not ${totalDossiers}`);

// ---------- 3. Register hubs, re-derived; cause groups reproduced ----------
const hubData = Object.fromEntries(HUB_KEYS.map((k) => [k, out(k)]));
const registryLabels = {};
function hubTable(k, population, keysOf, member, labelOf, cap = null, order = null) {
  const by = new Map();
  for (const item of population) for (const key of keysOf(item)) by.set(key, [...(by.get(key) ?? []), item]);
  const hubs = {};
  for (const [key, items] of by) {
    if (items.length < HUB_MIN) continue;
    let listed = items; let capped = false;
    if (cap !== null && items.length > cap) { listed = [...items].sort(order).slice(0, cap); capped = true; }
    hubs[key] = { label: labelOf(key), count: items.length, capped, members: listed.map(member) };
  }
  const labelCounts = Object.fromEntries([...by].map(([key, items]) => [key, items.length]));
  const got = hubData[k];
  assert.deepEqual(Object.keys(got.hubs).sort(), Object.keys(hubs).sort(), `${k}: hub labels`);
  for (const [key, hub] of Object.entries(hubs)) {
    const g = got.hubs[key];
    assert.deepEqual([g.label, g.count, g.capped], [hub.label, hub.count, hub.capped], `${k} ${key}: hub header`);
    const canon = (rows) => rows.map((r) => JSON.stringify(r)).sort();
    assert.deepEqual(canon(g.members), canon(hub.members), `${k} ${key}: hub members differ from the edition`);
    assert.ok(g.members.length >= HUB_MIN, `${k} ${key}: fewer than ${HUB_MIN} organizations`);
  }
  assert.deepEqual(got.counts.labels, labelCounts, `${k}: label counts`);
  assert.equal(got.counts.population, population.length, `${k}: population`);
  return hubs;
}
{
  const m = edition('at');
  const rows = asset('public/data/charity-registry/austria', m.artifacts.organizations);
  const cats = new Map(m.categories.map((c) => [c.prefix, c]));
  for (const r of rows) assert.ok(cats.has(r.prefix) && r.code.startsWith(`${r.prefix}-`), `${r.code}: BMF prefix`);
  hubTable('at', rows.filter((r) => r.active), (r) => [r.prefix], (r) => [r.code, r.name, r.validFrom], (k) => cats.get(k).labelDe);
  assert.equal(hubData.at.counts.editionOrganizations, rows.length);
  registryLabels.at = m.categories.map((c) => [c.prefix, c.labelDe]);
}
{
  const m = edition('fi');
  const rows = asset('public/data/charity-registry/finland', m.artifacts.organizations);
  assert.equal(rows.length, m.counts.includedOrganizations);
  const population = rows.filter((r) => r.active && r.tol && r.sector);
  hubTable('fi', population, (r) => [`${r.tol}|${r.sector}`], (r) => [r.id, r.name, r.formEn, r.regDate, r.city], (k) => k.slice(k.indexOf('|') + 1));
  assert.equal(hubData.fi.counts.active, rows.filter((r) => r.active).length);
  registryLabels.fi = [...new Set(population.map((r) => `${r.tol}|${r.sector}`))].sort().map((k) => [k, k.slice(k.indexOf('|') + 1)]);
}
{
  const m = edition('lv');
  const rows = shards('public/data/charity-registry/latvia', m.names);
  assert.equal(rows.length, m.counts.includedOrganizations);
  const population = rows.filter((r) => r[6] === 'A' && r[3] === 'A' && r[9]);
  hubTable('lv', population, (r) => r[9].split('|'), (r) => [r[0], r[1], r[2], r[7]], (k) => k);
  registryLabels.lv = [...new Set(population.flatMap((r) => r[9].split('|')))].sort().map((f) => [f, f]);
}
{
  const m = edition('dk');
  const rows = asset('public/data/charity-registry/denmark', m.artifacts.organizations);
  const population = rows.filter((r) => !r.ceased2025);
  const hubs = Object.keys(DK_LABELS);
  for (const key of hubs) {
    const members = population.filter((r) => r[key]).map((r) => [r.cvr, r.name, key === 'bal' ? false : Boolean(r[`${key}Partial`])]);
    if (members.length < HUB_MIN) continue;
    const g = hubData.dk.hubs[key];
    assert.ok(g, `dk ${key}: hub`);
    assert.deepEqual([g.label, g.count, g.capped], [DK_LABELS[key], members.length, false]);
    assert.deepEqual(g.members.map((x) => JSON.stringify(x)).sort(), members.map((x) => JSON.stringify(x)).sort(), `dk ${key}: members`);
  }
  assert.equal(hubData.dk.counts.population, population.length);
  registryLabels.dk = Object.entries(DK_LABELS);
}
{
  const m = edition('hr');
  const rows = shards('public/data/charity-registry/croatia', m.shards.names);
  assert.equal(rows.length, m.counts.includedOrganizations);
  const population = rows.filter((r) => r.status === 'active' && r.domains.length);
  for (const r of population) assert.match(r.regDate, isoDay);
  const newest = (a, b) => (a.regDate === b.regDate ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.regDate < b.regDate ? 1 : -1);
  const hubs = hubTable('hr', population, (r) => r.domains, (r) => [r.id, r.name, r.oib, r.county, r.regDate, r.form], (k) => k, HR_CAP, newest);
  for (const hub of Object.values(hubs)) assert.ok(hub.members.length <= HR_CAP);
  registryLabels.hr = [...new Set(population.flatMap((r) => r.domains))].sort().map((d) => [d, d]);
}
for (const k of HUB_KEYS) {
  assert.equal(manifest.selection[k].hubMinimum, HUB_MIN);
  assert.equal(manifest.selection[k].hubs, Object.keys(hubData[k].hubs).length);
  assert.equal(manifest.selection[k].listCap, k === 'hr' ? HR_CAP : null, `${k}: list cap`);
}
assert.equal(manifest.selection.hubMinimumDossiers, HUB_MIN);

const causes = out('causes');
assert.equal(causes.format, 'charitology-cause-by-country-wave1c-v1');
assert.match(causes.rule, /not an equivalence or an official crosswalk/);
assert.deepEqual(causes.registers, CAUSE_KEYS);
assert.deepEqual(causes.labelLanguage, LABEL_LANGUAGE);
const niM = edition('ni');
const labels = {
  ni: niM.purposes.map((p) => [p.code, p.label]),
  se: Object.keys(counts.se.labels).map((p) => [p, p]),
  mx: Object.keys(counts.mx.labels).map((c) => [c, c]),
  ...registryLabels,
};
assert.deepEqual(causes.labels, labels, 'Cause labels differ from the published classifications');
assert.equal(causes.groups.length, WAVE1B_STEMS.length);
const grouped = Object.fromEntries(CAUSE_KEYS.map((r) => [r, new Set()]));
const wave1bCauses = readJson(join(root, 'public/data/registry-wave1b/cause-groups.json'));
causes.groups.forEach((g, i) => {
  const [id, name, stems] = WAVE1B_STEMS[i];
  assert.deepEqual([g.id, g.name, g.stems], [id, name, stems], `Cause group ${id} definition changed`);
  assert.deepEqual([wave1bCauses.groups[i].id, wave1bCauses.groups[i].stems], [id, stems], `${id}: Wave 1b stems must be reused unchanged`);
  assert.deepEqual(g.languageStems, Object.fromEntries(LANGUAGES.map((l) => [l, LANGUAGE_STEMS[id]?.[l] ?? []])), `${id}: language stems changed`);
  for (const r of CAUSE_KEYS) {
    const use = [...stems, ...(g.languageStems[LABEL_LANGUAGE[r]] ?? [])];
    const exp = labels[r].filter(([, label]) => use.some((s) => wordMatch(label, s))).map(([k]) => k);
    assert.deepEqual(g.matches[r], exp, `${id}: ${r} matches`);
    for (const k of exp) grouped[r].add(k);
  }
});
for (const r of CAUSE_KEYS) assert.deepEqual(causes.ungrouped[r], labels[r].map(([k]) => k).filter((k) => !grouped[r].has(k)), `${r}: ungrouped labels`);

// ---------- 4. Expected routes, derived independently of the page code ----------
const STOP = new Set(['a', 'and', 'as', 'be', 'by', 'in', 'of', 'or', 'the', 'to', 'with']);
const FOLD = { đ: 'd', ł: 'l', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i' };
const labelSlug = (text) => {
  const folded = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[đłøßæœı]/g, (ch) => FOLD[ch]);
  const words = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 7);
  while (words.length > 1 && STOP.has(words.at(-1))) words.pop();
  return words.join('-');
};
const W = '/record/charity-dossiers/';
const COUNTRY = { nz: 'new-zealand', ni: 'northern-ireland', jp: 'japan', se: 'sweden', mx: 'mexico', sk: 'slovakia', pl: 'poland', at: 'austria', fi: 'finland', lv: 'latvia', dk: 'denmark', hr: 'croatia' };
const COUNTRY_NAME = { nz: 'New Zealand', ni: 'Northern Ireland', jp: 'Japan', se: 'Sweden', mx: 'Mexico', sk: 'Slovakia', pl: 'Poland', at: 'Austria', fi: 'Finland', lv: 'Latvia', dk: 'Denmark', hr: 'Croatia' };
const SEGMENT = { nz: 'charity', ni: 'charity', jp: 'npo', se: 'org', mx: 'rfc', sk: 'ico', pl: 'krs' };
const HUB_SEGMENT = { ni: 'purposes', se: 'purposes', mx: 'categories' };
const niLabel = new Map(niM.purposes.map((p) => [p.code, p.label]));
const dossierLabelText = (k, l) => (k === 'ni' ? niLabel.get(l) : l);
const base = (k) => `${W}${COUNTRY[k]}/`;
const dossierPath = (k, d) => `${base(k)}${SEGMENT[k]}/${d.id.toLowerCase()}/`;
const dossierHubPath = (k, l) => `${base(k)}${HUB_SEGMENT[k]}/${labelSlug(dossierLabelText(k, l))}/`;
const DK_SLUG = { s8a: 'll-8-a', s12: 'll-12-stk-3', bal: 'bal-3-stk-2' };
const registryHubPath = (k, key, label) => ({
  at: `${base(k)}categories/${labelSlug(`${key} ${label}`)}/`,
  fi: `${base(k)}sectors/${key.split('|')[0]}-${labelSlug(label)}/`,
  lv: `${base(k)}public-benefit-fields/${labelSlug(label)}/`,
  dk: `${base(k)}approvals/${DK_SLUG[key]}/`,
  hr: `${base(k)}domains/${labelSlug(label)}/`,
})[k];
const routes = new Map(); // path -> descriptor
const addRoute = (path, desc) => { assert.ok(!routes.has(path), `Duplicate Wave 1c route ${path}`); routes.set(path, desc); };
const sortByName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const dossierHubs = {};
for (const k of DOSSIER_KEYS) {
  const items = [...data[k]].sort(sortByName);
  dossierHubs[k] = [];
  const byLabel = new Map();
  for (const d of items) for (const l of d.labels) byLabel.set(l, [...(byLabel.get(l) ?? []), d]);
  if (HUB_SEGMENT[k]) for (const [l, members] of byLabel) if (members.length >= HUB_MIN) {
    dossierHubs[k].push(l);
    addRoute(dossierHubPath(k, l), { kind: 'dossierHub', k, label: l, members });
  }
  addRoute(base(k), { kind: 'index', k, items, hubs: dossierHubs[k] });
  for (const d of items) addRoute(dossierPath(k, d), { kind: 'dossier', k, d });
}
for (const k of HUB_KEYS) {
  const keys = Object.keys(hubData[k].hubs);
  addRoute(base(k), { kind: 'registryIndex', k, keys });
  for (const key of keys) addRoute(registryHubPath(k, key, hubData[k].hubs[key].label), { kind: 'registryHub', k, key, hub: hubData[k].hubs[key] });
}
const allRoutes = [...routes.keys()];
assert.ok(allRoutes.length >= 1000 && allRoutes.length <= 2500, `Wave 1c should add 1,000 to 2,500 pages, not ${allRoutes.length}`);
for (const [path, r] of routes) {
  if (r.kind === 'dossierHub') assert.ok(r.members.length >= HUB_MIN, `${path}: fewer than ${HUB_MIN} dossiers`);
  if (r.kind === 'registryHub') assert.ok(r.hub.count >= HUB_MIN && r.hub.members.length >= HUB_MIN, `${path}: fewer than ${HUB_MIN} organizations`);
}

// ---------- 5. Built pages ----------
assert.ok(existsSync(join(dist, 'index.html')), 'Run npm run build first.');
const homeHtml = readFileSync(join(dist, 'index.html'), 'utf8');
const home = new URL(homeHtml.match(/<meta property="og:url" content="([^"]+)"/)[1]);
const sitePath = home.pathname.replace(/\/$/, '');
const abs = (path) => new URL(sitePath + path, home.origin).href;
const sitemap = readBuiltSitemapSet(dist);
assert.ok(sitemap.index, '/sitemap.xml must be a sitemap index');
assert.deepEqual(sitemap.children.map((c) => c.file), ['sitemap-core.xml', 'sitemap-registries-wave1.xml', 'sitemap-registries-wave1b.xml', 'sitemap-registries-wave1c.xml'], 'Unexpected child sitemaps');
const [core, wave1, wave1b, wave1c] = sitemap.children;

const text = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join(''));
const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;
function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
  if (node.content) yield* walk(node.content);
}
const squash = (value) => value.replace(/\s+/g, ' ').trim();
const grouped3 = (value) => {
  const negative = value.startsWith('-');
  const [whole, cents] = value.replace('-', '').split('.');
  return { negative, text: `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${cents ? `.${cents}` : ''}` };
};
const MONEY = {
  nz: ['NZ$', ''], ni: ['£', ''], jp: ['¥', ''], se: ['SEK ', ' thousand'], mx: ['MX$', ''], sk: ['€', ''], pl: ['PLN ', ''],
};
const money = (k, value) => { const { negative, text: t } = grouped3(value); return `${negative ? '−' : ''}${MONEY[k][0]}${t}${MONEY[k][1]}`; };
const LINES = {
  nz: ['totalGrossIncome', 'totalExpenditure'], ni: ['totalIncome', 'totalSpending'], jp: ['ordinaryRevenue', 'ordinaryExpenses', 'donationsReceived', 'grantsReceived'],
  se: ['revenue', 'equity'], mx: edition('mx').financialFields.map((f) => f.field), sk: ['amount'], pl: ['amount', 'taxpayers'],
};
const expectedCell = (k, p, line) => {
  if (k === 'sk' && p.combined) return 'Not shown: two or more lines combined in the edition';
  const v = p.values[line];
  if (v === null || v === undefined) return 'Not supplied';
  if (k === 'pl' && line === 'taxpayers') return `${grouped3(v).text} thousand`;
  return money(k, v);
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLabel = (value) => { const [y, m, d] = value.split('-'); return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`; };
const optionalDay = (v) => (v ? dayLabel(v) : 'Not supplied');
const PERIOD_HEADING = {
  nz: (p) => `Year ended ${dayLabel(p.end)}`, ni: (p) => `Year ending ${dayLabel(p.end)}`, jp: (p) => `Settlement label ${p.label}`, se: (p) => `Year ${p.label}`,
  mx: (p) => `Fiscal year ${p.label}`, sk: (p) => `Overview ${p.label}`, pl: (p) => `Tax year ${p.label}`,
};
const mxActivities = edition('mx').directoryActivityCodes;
const plVoiv = edition('pl').voivodeships;
const expectedFacts = (k, d) => {
  const f = d.facts;
  const joined = (xs) => (xs.length ? xs.join('; ') : 'None listed');
  return {
    nz: () => [['Registration number', d.id], ['Register name', d.name], ['Registration status', f.status], ['Date registered', optionalDay(f.registered)],
      ['Organisation ID (open data)', String(f.organisationId)], ['Group ID', f.groupId === null ? 'None recorded' : String(f.groupId)]],
    ni: () => [['Charity number', f.nic], ['Register ID', d.id], ['Register name', d.name], ['Other name', f.otherName ?? 'Not supplied'], ['Date registered', optionalDay(f.registered)],
      ['Return status', f.status], ['Governing document', f.governingDocument ?? 'Not supplied'], ['Charitable purposes', joined(d.labels.map((l) => niLabel.get(l)))]],
    jp: () => [['NPO Portal ID', d.id], ['Corporate name', d.name], ['Name reading', f.kana ?? 'Not supplied'], ['Supervising authority', f.authority],
      ['Corporate number', f.corporateNumber ?? 'Not supplied'], ['Certification date', optionalDay(f.certified)]],
    se: () => [['Organisation number', d.id], ['Name', d.name], ['Legal form', f.legalForm], ['90-account holder since', f.since === null ? 'Not supplied' : String(f.since)],
      ['Purposes', joined(d.labels)], ['Areas', joined(f.areas)], ['Regions', joined(f.regions)], ['Swedish counties', joined(f.swedenCounties)]],
    mx: () => [['RFC', d.id], ['Reported name', d.name], ['Reported state', f.state ?? 'Not supplied'], ['Authorized category', f.category],
      ['Directory edition', f.directoryYear === null ? 'Not listed in a committed directory' : String(f.directoryYear)], ['Directory taxpayer status', f.directoryStatus ?? 'Not supplied'],
      ['Directory activity codes', f.directoryActivities.length ? f.directoryActivities.map((c) => `${c} (${mxActivities[c].label})`).join('; ') : 'None listed']],
    sk: () => [['IČO', d.id], ['Name', d.name], ['Municipality', f.municipality ?? 'Not supplied']],
    pl: () => [['KRS number', d.id], ['Name', d.name], ['NIP', f.nip ?? 'Not supplied'], ['Voivodeship', f.voivodeship ? plVoiv[f.voivodeship].pl : 'Not supplied'],
      ['City', f.city ?? 'Not supplied'], ['NIW eligibility lists', f.eligibleLists.length ? f.eligibleLists.map((y) => `tax year ${y}`).join('; ') : 'None']],
  }[k]();
};
const ID_PROPERTY = {
  nz: 'New Zealand Charities Register registration number', ni: 'Charity Commission for Northern Ireland register ID', jp: 'Cabinet Office NPO Portal ID',
  se: 'Swedish organisation number (organisationsnummer)', mx: 'Mexican taxpayer registry number (RFC)', sk: 'Slovak organization identification number (IČO)',
  pl: 'Polish National Court Register number (KRS)',
};
const ENTRY_URL = {
  nz: (d) => `${edition('nz').register}${d.id}`, ni: (d) => `${edition('ni').catalogues.ccniCharityDetailsPrefix}${d.id}&subId=0`,
  jp: (d) => `${edition('jp').portal}gyosei-print/${d.id}`, se: (d) => d.facts.profileUrl, mx: () => null, sk: () => null, pl: () => null,
  fi: (id) => `https://tietopalvelu.ytj.fi/yritys/${id}`, lv: (id) => `https://info.ur.gov.lv/#/legal-entity/${id}`,
};
const RATING_LANGUAGE = [/★|☆/, /\b\d(?:\.\d)?\s*(?:out of|\/)\s*(?:5|10)\s*stars?\b/i, /\btop[- ]rated\b/i, /\bbest charit/i,
  /\branked\s+(?:#|no\.?\s*|number\s*)\d/i, /\b(?:impact|efficiency|effectiveness|transparency|accountability)\s+(?:score|rating|grade)\s*(?:of|:)/i,
  /\boverhead ratio (?:of|is|was)\b/i, /\bgrade\s*:\s*[A-F][+-]?(?!\w)/, /\b(?:admin|administration|purpose)\s*(?:cost\s*)?(?:share|percentage|ratio)\s*(?:of|:)?\s*\d+\s*%/i];

// Titles and descriptions must be unique across every verified registry page (Wave 1, 1b and 1c).
const descriptions = new Map();
const titles = new Map();
for (const child of [wave1, wave1b]) {
  for (const loc of child.locs) {
    const path = new URL(loc).pathname.slice(sitePath.length);
    const html = readFileSync(join(dist, path.slice(1), 'index.html'), 'utf8');
    const head = [...walk(parse(html.slice(0, html.indexOf('</head>') + 7)))];
    titles.set(squash(text(head.find((n) => n.nodeName === 'title'))), path);
    descriptions.set(attr(head.find((n) => n.nodeName === 'meta' && attr(n, 'name') === 'description'), 'content'), path);
  }
}
const linkedFrom = new Map();
let faqCount = 0;
let cells = 0;
let entryRows = 0;
for (const [path, route] of routes) {
  const file = join(dist, path.slice(1), 'index.html');
  assert.ok(existsSync(file), `Missing built page ${path}`);
  const html = readFileSync(file, 'utf8');
  const nodes = [...walk(parse(html))];
  const label = path;
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
  if (path !== base(route.k)) assert.ok(items.some((item) => item.item === abs(base(route.k))), `${label}: breadcrumb passes through the country index`);
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
    assert.ok(!/\bundefined\b|\bNaN\b|\[object |\bnull\b/.test(questions[i].acceptedAnswer.text), `${label}: FAQ ${i + 1} renders a missing value`);
  });
  faqCount += 6;
  const main = nodes.find((n) => n.nodeName === 'main');
  const mainText = squash(text(main));
  for (const pattern of RATING_LANGUAGE) assert.ok(!pattern.test(mainText), `${label}: rating language ${pattern}`);
  assert.ok(!/\bundefined\b|\bNaN\b|\[object /.test(mainText), `${label}: renders a missing value`);
  for (const ref of nodes.filter((n) => n.nodeName === 'a').map((n) => attr(n, 'href')).filter(Boolean)) {
    const target = ref.startsWith(sitePath + W) ? ref.slice(sitePath.length) : null;
    if (target) linkedFrom.set(target, [...(linkedFrom.get(target) ?? []), path]);
  }
  const links = (target) => html.includes(`href="${sitePath}${target}"`);
  const facts = [];
  for (const dl of nodes.filter((n) => n.nodeName === 'dl' && attr(n, 'class') === 'rw-facts')) {
    const pairs = dl.childNodes.filter((c) => c.nodeName === 'dt' || c.nodeName === 'dd');
    for (let i = 0; i < pairs.length; i += 2) {
      assert.ok(pairs[i].nodeName === 'dt' && pairs[i + 1]?.nodeName === 'dd', `${label}: facts must pair dt and dd`);
      facts.push([squash(text(pairs[i])), squash(text(pairs[i + 1]))]);
    }
  }
  const checkCollection = (expectedItems) => {
    const collection = ofType('CollectionPage');
    const dataset = ofType('Dataset');
    assert.equal(collection.length, 1, `${label}: one CollectionPage`);
    assert.equal(dataset.length, 1, `${label}: one Dataset`);
    assert.equal(ofType('Organization').length, 0, `${label}: hubs carry no Organization node`);
    assert.equal(collection[0].url, abs(path));
    const list = collection[0].mainEntity;
    assert.equal(list['@type'], 'ItemList');
    assert.equal(list.numberOfItems, list.itemListElement.length, `${label}: ItemList count`);
    assert.ok(list.itemListElement.length >= 1, `${label}: empty ItemList`);
    list.itemListElement.forEach((item, i) => assert.equal(item.position, i + 1, `${label}: ItemList position`));
    assert.deepEqual(list.itemListElement.map((i) => [i.name, i.url ?? null]), expectedItems, `${label}: ItemList must list exactly the expected entries`);
    assert.equal(dataset[0].isAccessibleForFree, true, `${label}: free dataset`);
    assert.ok(dataset[0].license && dataset[0].dateModified === manifest.edition, `${label}: dataset licence and edition`);
    assert.ok(dataset[0].distribution.length >= 1, `${label}: dataset distribution`);
    for (const dl of dataset[0].distribution) {
      assert.equal(dl['@type'], 'DataDownload');
      assert.ok(existsSync(join(dist, new URL(dl.contentUrl).pathname.slice(sitePath.length + 1))), `${label}: distribution file missing ${dl.contentUrl}`);
    }
  };
  if (route.kind === 'dossier') {
    const { k, d } = route;
    const org = ofType('Organization');
    assert.equal(org.length, 1, `${label}: one Organization`);
    assert.equal(org[0].name, d.name, `${label}: Organization name`);
    assert.equal(org[0].mainEntityOfPage, abs(path));
    assert.deepEqual(org[0].identifier, [{ '@type': 'PropertyValue', propertyID: ID_PROPERTY[k], value: d.id }], `${label}: identifier`);
    const entry = ENTRY_URL[k](d);
    assert.deepEqual(org[0].sameAs ?? null, entry ? [entry] : null, `${label}: sameAs`);
    if (entry) assert.ok(html.includes(`href="${entry.replace(/&/g, '&amp;')}"`), `${label}: link to the official register entry`);
    assert.equal(ofType('CollectionPage').length, 0, `${label}: dossiers are not collections`);
    assert.equal(ofType('Dataset').length, 0, `${label}: dossiers carry no Dataset node`);
    // HTML rendering collapses runs of whitespace (some register names contain ideographic or double spaces).
    assert.deepEqual(facts, expectedFacts(k, d).map(([dt, dd]) => [dt, squash(dd)]), `${label}: register facts differ from the dataset`);
    const table = nodes.find((n) => n.nodeName === 'table' && attr(n, 'data-figures') === 'w1c');
    assert.ok(table, `${label}: figure table`);
    const tnodes = [...walk(table)];
    const heads = tnodes.filter((n) => n.nodeName === 'th' && attr(n, 'data-period') !== undefined);
    assert.deepEqual(heads.map((h) => attr(h, 'data-period')), d.periods.map((p) => p.end ?? p.label), `${label}: one column per period`);
    heads.forEach((h, i) => assert.ok(squash(text(h)).startsWith(PERIOD_HEADING[k](d.periods[i])), `${label}: period heading ${i}`));
    if (k === 'nz') heads.forEach((h, i) => assert.ok(squash(text(h)).endsWith(`Annual return ${d.periods[i].record}`), `${label}: return record`));
    if (k === 'mx') heads.forEach((h, i) => assert.ok(squash(text(h)).endsWith(`Report row ${d.periods[i].record.toLocaleString('en-US')}`), `${label}: report row`));
    if (k === 'jp') heads.forEach((h, i) => assert.ok(squash(text(h)).endsWith(`Organization CSV record ${d.periods[i].record.toLocaleString('en-US')}`), `${label}: CSV record`));
    const rows = tnodes.filter((n) => n.nodeName === 'tr' && attr(n, 'data-line'));
    assert.deepEqual(rows.map((r) => attr(r, 'data-line')), LINES[k], `${label}: one row per published line`);
    for (const row of rows) {
      const line = attr(row, 'data-line');
      const got = row.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)));
      assert.deepEqual(got, d.periods.map((p) => expectedCell(k, p, line)), `${label}: ${line}`);
      cells += got.length;
    }
    if (d.record !== null) assert.ok(mainText.includes(`row ${d.record.toLocaleString('en-US')} of the committed`), `${label}: edition record`);
    for (const l of d.labels) if (dossierHubs[k].includes(l)) assert.ok(links(dossierHubPath(k, l)), `${label}: link to its ${l} hub`);
    assert.ok(links(base(k)), `${label}: link to the country index`);
  } else if (route.kind === 'dossierHub') {
    const { k, members } = route;
    checkCollection(members.map((d) => [d.name, abs(dossierPath(k, d))]));
    for (const d of members) assert.ok(links(dossierPath(k, d)), `${label}: missing link to ${d.id}`);
    assert.deepEqual(facts.slice(0, 2).map(([, v]) => v), [counts[k].labels[route.label], members.length].map((n) => n.toLocaleString('en-US')), `${label}: register counts`);
  } else if (route.kind === 'index') {
    const { k, items: list, hubs } = route;
    checkCollection(hubs.length
      ? [...hubs].sort((a, b) => dossierLabelText(k, a).localeCompare(dossierLabelText(k, b))).map((l) => [`${dossierLabelText(k, l)}: ${COUNTRY_NAME[k]} charity dossiers`, abs(dossierHubPath(k, l))])
      : list.map((d) => [d.name, abs(dossierPath(k, d))]));
    for (const d of list) assert.ok(links(dossierPath(k, d)), `${label}: missing link to ${d.id}`);
    for (const l of hubs) assert.ok(links(dossierHubPath(k, l)), `${label}: missing link to hub ${l}`);
    assert.ok(mainText.includes(`${manifest.selection[k].candidates.toLocaleString('en-US')} records qualify`), `${label}: qualifying count`);
  } else if (route.kind === 'registryIndex') {
    const { k, keys } = route;
    const hubPaths = keys.map((key) => registryHubPath(k, key, hubData[k].hubs[key].label));
    const list = ofType('CollectionPage')[0]?.mainEntity?.itemListElement ?? [];
    assert.deepEqual(list.map((i) => i.url), hubPaths.map(abs), `${label}: ItemList lists every hub`);
    checkCollection(list.map((i) => [i.name, i.url]));
    for (const p of hubPaths) assert.ok(links(p), `${label}: missing link to ${p}`);
  } else {
    const { k, hub } = route;
    checkCollection(hub.members.map((m) => [m[1], ENTRY_URL[k] ? ENTRY_URL[k](m[0]) : null]));
    const table = nodes.find((n) => n.nodeName === 'table' && attr(n, 'data-entries') === k);
    assert.ok(table, `${label}: entries table`);
    const rows = [...walk(table)].filter((n) => n.nodeName === 'tr' && attr(n, 'data-id') !== undefined);
    assert.deepEqual(rows.map((r) => attr(r, 'data-id')), hub.members.map((m) => m[0]), `${label}: one row per listed entry, in dataset order`);
    rows.forEach((row, i) => {
      const m = hub.members[i];
      const th = row.childNodes.find((c) => c.nodeName === 'th');
      assert.equal(squash(text(th)), squash(m[1]), `${label}: entry name ${m[0]}`);
      const tds = row.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)));
      const exp = {
        at: () => [m[0], optionalDay(m[2])], fi: () => [m[0], m[2], optionalDay(m[3]), m[4] ?? 'Not supplied'], lv: () => [m[0], m[2], optionalDay(m[3])],
        dk: () => [m[0], m[2] ? 'Yes' : 'No'], hr: () => [m[0], m[2] ?? 'Not supplied', m[3] ?? 'Not supplied', dayLabel(m[4])],
      }[k]();
      assert.deepEqual(tds, exp, `${label}: entry ${m[0]}`);
      if (ENTRY_URL[k]) assert.ok(th.childNodes.some((c) => c.nodeName === 'a' && attr(c, 'href') === ENTRY_URL[k](m[0])), `${label}: official entry link ${m[0]}`);
      entryRows++;
    });
    assert.equal(facts[0][1], hub.count.toLocaleString('en-US'), `${label}: count with label`);
    assert.equal(facts[1][1], `${hub.members.length.toLocaleString('en-US')}${hub.capped ? ', the most recently registered' : ', all of them'}`, `${label}: listed count`);
    if (hub.capped) assert.ok(mainText.includes('most recently registered'), `${label}: states the list cap`);
  }
}
// Every Wave 1c page is reachable from another page; every dossier from a hub or index.
for (const path of allRoutes) assert.ok((linkedFrom.get(path) ?? []).some((from) => from !== path), `Orphan Wave 1c page ${path}`);
for (const [path, r] of routes) if (r.kind === 'dossier') assert.ok((linkedFrom.get(path) ?? []).some((from) => ['index', 'dossierHub'].includes(routes.get(from)?.kind)), `Dossier not linked from a hub or index: ${path}`);
const rootHtml = readFileSync(join(dist, W.slice(1), 'index.html'), 'utf8');
for (const k of [...DOSSIER_KEYS, ...HUB_KEYS]) assert.ok(rootHtml.includes(`href="${sitePath}${base(k)}"`), `${W} must link to ${base(k)}`);
const rootLd = [...walk(parse(rootHtml))].filter((n) => n.nodeName === 'script' && attr(n, 'type') === 'application/ld+json').map((n) => JSON.parse(text(n)));
const rootFaq = rootLd.find((n) => n['@type'] === 'FAQPage');
assert.ok(rootFaq.mainEntity[0].acceptedAnswer.text.includes(`Wave 1c adds ${totalDossiers.toLocaleString('en-US')} dossiers`), `${W}: FAQ counts`);
const RECORD_PAGES = { nz: 'record/charity-index/new-zealand', ni: 'record/charity-index/northern-ireland', jp: 'record/charity-index/japan', se: 'record/charity-index/sweden',
  mx: 'record/charity-financials/mexico', sk: 'record/charity-index/slovakia', pl: 'record/charity-index/poland', at: 'record/charity-index/austria',
  fi: 'record/charity-index/finland', lv: 'record/charity-index/latvia', dk: 'record/charity-index/denmark', hr: 'record/charity-index/croatia' };
for (const [k, page] of Object.entries(RECORD_PAGES)) {
  assert.ok(readFileSync(join(dist, page, 'index.html'), 'utf8').includes(`href="${sitePath}${base(k)}"`), `${page} must link to ${base(k)}`);
}
for (const file of Object.values(manifest.outputs).map((o) => o.path).concat('manifest.json')) {
  assert.equal(sha(readFileSync(join(dist, 'data/registry-wave1c', file))), sha(readFileSync(join(dataDir, file))), `Built copy of ${file} differs`);
}

// Cause × Country: the Wave 1c table shows every stem, match, count and ungrouped label.
const causeHtml = readFileSync(join(dist, W.slice(1), 'cause-by-country/index.html'), 'utf8');
const causeDoc = [...walk(parse(causeHtml))];
const causeMain = squash(text(causeDoc.find((n) => n.nodeName === 'main')));
assert.ok(causeMain.includes('The categories are not identical across registers.'), 'Cause × Country must state that categories differ');
assert.ok(causeMain.includes('It is not an equivalence, a crosswalk or a ranking.'), 'Cause × Country must state that it is not a crosswalk');
const causeCount = (r, key) => (['ni', 'se', 'mx'].includes(r) ? data[r].filter((d) => d.labels.includes(key)).length : hubData[r].counts.labels[key] ?? 0);
const causeDisplay = (r, key) => { const l = labels[r].find(([k]) => k === key)[1]; return r === 'fi' ? `${l} (${key.split('|')[0]})` : r === 'at' ? `${l} (${key})` : l; };
const causeHub = (r, key) => (['ni', 'se', 'mx'].includes(r)
  ? (dossierHubs[r].includes(key) ? dossierHubPath(r, key) : null)
  : (hubData[r].hubs[key] ? registryHubPath(r, key, hubData[r].hubs[key].label) : null));
let causeCells = 0;
const causeHubs = new Set();
for (const g of causes.groups) {
  const row = causeDoc.find((n) => n.nodeName === 'tr' && attr(n, 'data-group-1c') === g.id);
  assert.ok(row, `Cause × Country Wave 1c row ${g.id}`);
  for (const r of CAUSE_KEYS) {
    const cell = row.childNodes.find((c) => c.nodeName === 'td' && attr(c, 'data-registry') === r);
    assert.ok(cell, `${g.id} ${r}: cell`);
    if (!g.matches[r].length) { assert.equal(squash(text(cell)), 'No matching label', `${g.id} ${r}`); continue; }
    const segments = [''];
    for (const child of cell.childNodes) {
      if (child.nodeName === 'br') segments.push('');
      else segments[segments.length - 1] += text(child);
    }
    assert.equal(segments.length, g.matches[r].length, `${g.id} ${r}: one line per label`);
    g.matches[r].forEach((key, i) => {
      assert.equal(squash(segments[i]), squash(`${causeDisplay(r, key)} (${causeCount(r, key).toLocaleString('en-US')})`), `${g.id} ${r}: ${key}`);
      const hub = causeHub(r, key);
      if (hub) { assert.ok(cell.childNodes.some((c) => c.nodeName === 'a' && attr(c, 'href') === `${sitePath}${hub}`), `${g.id} ${r}: link to ${hub}`); causeHubs.add(hub); }
      causeCells++;
    });
  }
  const stems = causeDoc.find((n) => n.nodeName === 'tr' && attr(n, 'data-stems') === g.id);
  assert.ok(stems, `Stem row ${g.id}`);
  const stemCells = stems.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)));
  assert.deepEqual(stemCells, [g.stems.map((s) => `“${s}”`).join(', '), ...LANGUAGES.map((l) => (g.languageStems[l].length ? g.languageStems[l].map((s) => `“${s}”`).join(', ') : 'None'))], `${g.id}: stems shown`);
}
const ungroupedDl = causeDoc.find((n) => n.nodeName === 'dl' && attr(n, 'data-ungrouped') === 'wave1c');
assert.ok(ungroupedDl, 'Wave 1c ungrouped labels');
const ungroupedDd = ungroupedDl.childNodes.filter((c) => c.nodeName === 'dd').map((c) => squash(text(c)));
assert.deepEqual(ungroupedDd, CAUSE_KEYS.map((r) => (causes.ungrouped[r].length ? causes.ungrouped[r].map((k) => `${causeDisplay(r, k)} (${causeCount(r, k).toLocaleString('en-US')})`).join('; ') : 'None')).map(squash), 'Wave 1c ungrouped labels shown');
const causeList = causeDoc.filter((n) => n.nodeName === 'script' && attr(n, 'type') === 'application/ld+json').map((n) => JSON.parse(text(n))).find((n) => n['@type'] === 'CollectionPage').mainEntity.itemListElement.map((i) => new URL(i.url).pathname.slice(sitePath.length));
const causeWave1c = causeList.filter((p) => routes.has(p));
assert.deepEqual(causeWave1c, [...CAUSE_KEYS.map(base), ...[...causeHubs]], 'Cause × Country ItemList must list the Wave 1c country pages and every linked Wave 1c hub');
for (const p of causeWave1c) assert.ok(causeHtml.includes(`href="${sitePath}${p}"`), `Cause × Country must link ${p}`);

// ---------- 6. Sitemap partition, llms.txt and feed ----------
assert.deepEqual([...wave1c.locs].sort(), allRoutes.map(abs).sort(), 'Wave 1c sitemap must list exactly the Wave 1c pages');
const wave1cSet = new Set(allRoutes.map(abs));
for (const child of [core, wave1, wave1b]) assert.ok(!child.locs.some((loc) => wave1cSet.has(loc)), `${child.file} must not list Wave 1c pages`);
assert.ok(!core.locs.some((loc) => new URL(loc).pathname.startsWith(sitePath + W)), 'Core sitemap must not list registry dossier pages');
const llms = readFileSync(join(dist, 'llms.txt'), 'utf8');
for (const [path, r] of routes) if (r.kind !== 'dossier') assert.ok(llms.includes(abs(path)), `llms.txt missing ${path}`);
for (const ref of ['/sitemap-registries-wave1c.xml', '/data/registry-wave1c/manifest.json', '/data/registry-wave1c/cause-groups.json']) assert.ok(llms.includes(abs(ref)), `llms.txt missing ${ref}`);
const section = llms.slice(llms.indexOf('## Verified Charity Dossiers, Wave 1c'), llms.indexOf('## Key Funding-Flow'));
assert.ok(section.length > 100, 'llms.txt Wave 1c section');
assert.ok(/^[\x00-\x7F]*$/.test(section), 'llms.txt Wave 1c section must be ASCII');
const feed = readFileSync(join(dist, 'feed.xml'), 'utf8');
for (const k of [...DOSSIER_KEYS, ...HUB_KEYS]) assert.ok(!feed.includes(base(k)), 'The RSS feed lists writing, not Wave 1c registry records');

const hubCount = [...routes.values()].filter((r) => r.kind === 'dossierHub' || r.kind === 'registryHub').length;
console.log(`✓ Registry Wave 1c: ${DOSSIER_KEYS.map((k) => `${data[k].length} ${COUNTRY_NAME[k]}`).join(', ')} dossiers re-derived from the pinned editions (${figures} figures, ${cells} table cells checked); ${hubCount} hubs (each >= ${HUB_MIN}; ${entryRows} register entry rows checked) for ${HUB_KEYS.map((k) => COUNTRY_NAME[k]).join(', ')} and the dossier registers; ${causes.groups.length} cause groups reproduced for ${CAUSE_KEYS.length} registers (${causeCells} label cells checked); ${routes.size} built pages with ${faqCount} FAQ answers equal to FAQPage JSON-LD; sitemap index ${core.locs.length} core + ${wave1.locs.length} Wave 1 + ${wave1b.locs.length} Wave 1b + ${wave1c.locs.length} Wave 1c URLs.`);
