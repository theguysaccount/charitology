// Wave 1d verified charity dossiers (Israel, Estonia, Italy, Hungary, Slovenia,
// rebuilt from the official downloads): offline integrity gate, at least as
// strict as scripts/check-registry-wave1c.mjs.
// 1. The committed dataset matches its manifest fingerprints; every compact
//    source extract matches the SHA-256 pinned below (packed and decoded); every
//    official file in the manifest names an http(s) URL, size, SHA-256, retrieval
//    time and title, and agrees with the extract that records it.
// 2. Every dossier is re-derived here, independently of the builder, from the
//    extracts: selection complete (dossiers + recorded exclusions = exactly the
//    rows at or above the pinned threshold), every fact and every figure equal
//    as exact strings, blanks null (never zero), no row merged.
// 3. Hubs (Israel activity sectors, Italy beneficiary categories) are
//    re-derived and each has at least five dossiers; the cause grouping is
//    reproduced from the published labels with the stems pinned below, and the
//    Wave 1b English stems are asserted unchanged.
// 4. Every built page carries six visible FAQs equal to its FAQPage JSON-LD, a
//    BreadcrumbList, Organization (dossiers) or CollectionPage + Dataset (hubs
//    and indexes) JSON-LD, its exact facts and figures cell by cell ("Not
//    supplied" for every null), internal links, the shared analytics script and
//    no rating language; titles and descriptions are unique across Wave 1, 1b,
//    1c and 1d; the partitioned sitemap, llms.txt and feed agree with the data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'parse5';
import { readBuiltSitemapSet } from './sitemap-set.mjs';

const root = process.cwd();
const dataDir = join(root, 'public/data/registry-wave1d');
const dist = join(root, 'dist');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256Pattern = /^[0-9a-f]{64}$/;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Pinned rules (a change in the builder cannot pass silently) ----------
const KEYS = ['il', 'ee', 'it', 'hu', 'si'];
const THRESHOLDS = {
  il: { line: 'revenue', value: '50000000.00', currency: 'ILS' },
  ee: { line: 'TotalRevenue', value: '500000', currency: 'EUR' },
  it: { line: 'total', value: '150000.00', currency: 'EUR' },
  hu: { line: 'amount', value: '10000000', currency: 'HUF' },
  si: { line: 'amount', value: '10000.00', currency: 'EUR' },
};
const HUB_MIN = 5;
const EXTRACTS = {
  il: ['extracts/il-amutot.json.gz', 'eb5a33224df955f33131bc49bc79b0855868da31fab841e53e830b5f86b3465c', '6a62509b0a2451323d76e075d9df3fa174f0446696b24752eb7cd8d8e16003ea'],
  ee: ['extracts/ee-rik-emta.json.gz', 'd50f2eae23dfeedbe954b3fccc9d1c03fcac48d479f1c789ac6953add5a3dcea', '0a7a94268fb529e2b7a1afff7263b7df3fca7839e26699427331c97262eba743'],
  it: ['extracts/it-5x1000.json.gz', '4e55563faf0be7bb4b600456c7a8634256e31c7889ebaeae63c9b0e57eeb81b0', '75c8ed4edb6af80761be04c08e0784179688c9e0adb1fbb30db24ccdd1867f8e'],
  hu: ['extracts/hu-szja.json.gz', '2562863d7ed93bef1b9f21a6c23afb28b1aa34c3b156119325c661baf9518cc1', 'cb9fec5e03f07689471b2a8518d3d4e1f8f7f438ee64d673e92fe5f669dfa2e6'],
  si: ['extracts/si-dohodnina.json.gz', 'ad261d8e8bc6ed43eb13b10da5284f20722e5c3c9eac2ad1c23bf6fc93a17e88', 'fe405a10fae2f2309aff02d8cc5e96fdf545af06734b18841490bad7e8419eee'],
};
// Official hosts each register's files must come from.
const OFFICIAL_HOSTS = {
  il: ['data.gov.il'], ee: ['avaandmed.ariregister.rik.ee', 'ncfailid.emta.ee'], it: ['www.agenziaentrate.gov.it'],
  hu: ['nav.gov.hu'], si: ['podatki.gov.si', 'www.fu.gov.si'],
};
const IL_INCLUDED_STATUSES = ['פעילה', 'רשומה'];
const IL_KEEP = ['מספר עמותה', 'תאריך רישום עמותה', 'שם עמותה בעברית', 'שם עמותה באנגלית', 'סטטוס עמותה', 'סיווג פעילות ענפי',
  'תחום פעילות משני', 'שנת דיווח דוח כספי אחרון', 'מחזור כספי (הכנסות)', 'סך הוצאות העמותה', 'שנת דיווח אחרונה', 'כתובת - ישוב'];
const EE_LINES = [['TotalRevenue', 'income'], ['BusinessIncome', 'income'], ['SurplusDeficitFromOperatingActivities', 'income'],
  ['NetSurplusDeficitForPeriod', 'income'], ['Assets', 'balance'], ['NetAssets', 'balance']];
const EE_INCOME_TABLES = ['Tulemiaruanne'];
const EE_BALANCE_TABLES = ['Bilanss', 'Bilanss, detailne', 'Bilanss, kasvava likviidsuse järjekorras'];
const IT_HEADER = ['Prog', 'Codice fiscale', 'Denominazione', 'Regione', 'PR', 'Comune', 'ETS', 'ASD', 'Ricerca scientifica', 'Ricerca sanitaria', 'Comuni',
  'Beni culturali e paesaggistici', 'Enti Gestori aree protette', 'Numero scelte', 'Importo delle scelte espresse', 'Importo proporzionale per le scelte generiche',
  'Importo proporzionale per ripartizione importi inferiori a 100 euro', 'Importo totale erogabile'];
const IT_CATEGORY_COLUMNS = [6, 7, 8, 9, 10, 11, 12];
const IT_AMOUNTS = { choices: 13, expressed: 14, generic: 15, under100: 16, total: 17 };
const IT_LEGEND = "R: ente ex ONLUS che ha presentato istanza di iscrizione al RUNTS entro il termine del 31.03.2026, ammesso con riserva sino all'esito della procedura amministrativa di iscrizione al RUNTS";
const SI_SECTIONS = { 1: 'Nevladne organizacije v javnem interesu', 2: 'Registrirane cerkve in druge verske skupnosti', 3: 'Sestavni deli registriranih cerkva in drugih verskih skupnosti',
  4: 'Reprezentativni sindikati', 5: 'Politične stranke', 6: 'Šole in vrtci' };
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
  education: { he: ['חינוך', 'השכלה'] },
  health: { he: ['בריאות'], it: ['sanitari'] },
  religion: { he: ['דת'] },
  environment: { he: ['סביבה'], it: ['aree protette', 'paesaggistic'] },
  animals: { he: ['ובעלי חיים'] },
  'arts-culture': { he: ['תרבות', 'אמנות'] },
  'sport-recreation': { he: ['ספורט'], it: ['asd'] },
  community: { he: ['קהילה'] },
  housing: { he: ['שיכון'] },
  'science-research': { he: ['מחקר', 'מדע'], it: ['ricerca'] },
  international: { he: ['בינלאומיים'] },
  safety: { he: ['הצלת חיים'] },
};
const LANGUAGES = ['he', 'it'];
const CAUSE_KEYS = ['il', 'it'];
const LABEL_LANGUAGE = { il: 'he', it: 'it' };
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordMatch = (label, stem) => new RegExp(`(?<![a-z\\u05d0-\\u05ea])${escapeRe(stem)}`).test(label.toLowerCase());
// Israel activity sectors: URL slug and Charitology's English translation (shown in brackets beside the published Hebrew label).
const IL_GLOSS = {
  'דת': ['religion', 'Religion'],
  'חינוך~ השכלה והכשרה מקצועית': ['education-and-vocational-training', 'Education, higher education and vocational training'],
  'שירותי רווחה': ['welfare-services', 'Welfare services'],
  'קהילה וחברה': ['community-and-society', 'Community and society'],
  'ספורט': ['sport', 'Sport'],
  'תרבות או אמנות': ['culture-or-arts', 'Culture or arts'],
  'בריאות או הצלת חיים': ['health-or-saving-lives', 'Health or saving lives'],
  'מורשת או הנצחה': ['heritage-or-commemoration', 'Heritage or commemoration'],
  'שיכון ופיתוח עירוני': ['housing-and-urban-development', 'Housing and urban development'],
  'מחקר~ מדע וטכנולוגיה': ['research-science-and-technology', 'Research, science and technology'],
  'ארגוני סנגור~ שינוי חברתי ופוליטי': ['advocacy-social-and-political-change', 'Advocacy, social and political change organizations'],
  'סביבה ובעלי חיים': ['environment-and-animals', 'Environment and animals'],
  'איגודים מקצועיים': ['professional-associations', 'Professional associations'],
  'קשרים בינלאומיים': ['international-relations', 'International relations'],
  'התנדבות וקרנות פילנטרופיות': ['volunteering-and-philanthropic-funds', 'Volunteering and philanthropic funds'],
};
const IT_GLOSS = { ETS: 'Third-sector entities', ASD: 'Amateur sports associations', 'Ricerca scientifica': 'Scientific and university research', 'Ricerca sanitaria': 'Health research',
  Comuni: 'Municipalities', 'Beni culturali e paesaggistici': 'Cultural and landscape heritage', 'Enti Gestori aree protette': 'Managers of protected areas' };
const SI_GLOSS = { 1: 'non-governmental organizations in the public interest', 2: 'registered churches and other religious communities',
  3: 'constituent parts of registered churches and other religious communities', 4: 'representative trade unions', 5: 'political parties', 6: 'schools and kindergartens' };

// Exact comparison of decimal strings (any number of decimals), no floating point.
const scaled = (text, places) => {
  const negative = text.startsWith('-');
  const [w, f = ''] = text.replace('-', '').split('.');
  assert.ok(/^\d+$/.test(w) && /^\d*$/.test(f) && f.length <= places, `decimal ${text}`);
  const v = BigInt(w) * 10n ** BigInt(places) + BigInt((f + '0'.repeat(places)).slice(0, places) || '0');
  return negative ? -v : v;
};
const atLeast = (text, threshold) => text !== null && text !== undefined && scaled(text, 6) >= scaled(threshold, 6);

// ---------- 1. Dataset files, pinned extracts and official sources ----------
const manifest = readJson(join(dataDir, 'manifest.json'));
assert.equal(manifest.format, 'charitology-registry-wave1d-v1');
assert.match(manifest.edition, isoDay);
assert.equal(manifest.builder, 'scripts/build-registry-wave1d.py');
assert.equal(manifest.checker, 'scripts/check-registry-wave1d.mjs');
assert.match(manifest.policy, /never zero/);
assert.match(manifest.policy, /never merged/);
const expectedOutputs = [...KEYS.flatMap((k) => [k, `${k}Counts`]), 'causes'].sort();
assert.deepEqual(Object.keys(manifest.outputs).sort(), expectedOutputs, 'Unexpected Wave 1d outputs');
for (const [key, output] of Object.entries(manifest.outputs)) {
  const bytes = readFileSync(join(dataDir, output.path));
  assert.equal(bytes.length, output.bytes, `${key}: byte count`);
  assert.equal(sha(bytes), output.sha256, `${key}: SHA-256`);
}
assert.deepEqual(Object.keys(manifest.extracts).sort(), [...KEYS].sort(), 'Unexpected Wave 1d extracts');
const X = {};
for (const k of KEYS) {
  const [path, packedSha, decodedSha] = EXTRACTS[k];
  const m = manifest.extracts[k];
  assert.equal(m.path, path, `${k}: extract path`);
  const packed = readFileSync(join(dataDir, path));
  assert.equal(packed.length, m.bytes, `${k}: extract bytes`);
  assert.equal(sha(packed), packedSha, `${k}: extract changed without updating the pinned fingerprint in this checker`);
  assert.equal(m.sha256, packedSha, `${k}: manifest extract fingerprint`);
  const raw = gunzipSync(packed, { maxOutputLength: m.decodedBytes });
  assert.equal(raw.length, m.decodedBytes, `${k}: decoded bytes`);
  assert.equal(sha(raw), decodedSha, `${k}: decoded SHA-256`);
  assert.equal(m.decodedSha256, decodedSha);
  X[k] = JSON.parse(raw);
  assert.equal(X[k].format, `charitology-wave1d-${k}-extract-v1`, `${k}: extract format`);
}
assert.deepEqual(Object.keys(manifest.sources).sort(), [...KEYS].sort(), 'Unexpected source groups');
let sourceFiles = 0;
for (const [k, entries] of Object.entries(manifest.sources)) {
  for (const [name, s] of Object.entries(entries)) {
    const u = new URL(s.url);
    assert.equal(u.protocol, 'https:', `${k} ${name}: https URL`);
    assert.ok(OFFICIAL_HOSTS[k].includes(u.host), `${k} ${name}: ${u.host} is not an official host for this register`);
    assert.match(s.sha256, sha256Pattern, `${k} ${name}: SHA-256`);
    assert.ok(Number.isSafeInteger(s.bytes) && s.bytes > 0, `${k} ${name}: bytes`);
    assert.match(s.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${k} ${name}: retrieval time`);
    assert.ok(Number.isFinite(Date.parse(s.retrievedAt)), `${k} ${name}: retrieval time`);
    assert.ok(s.title && s.title.length > 5, `${k} ${name}: title`);
    sourceFiles++;
  }
}
// The extracts record the same files as the manifest.
const pick = (s) => [s.url, s.bytes, s.sha256, s.retrievedAt];
assert.deepEqual(Object.values(manifest.sources.il).map(pick), X.il.pages.map(pick), 'il: manifest sources differ from the extract');
assert.deepEqual(Object.values(manifest.sources.ee).map(pick), Object.values(X.ee.sources).map(pick), 'ee: manifest sources differ from the extract');
assert.deepEqual(Object.values(manifest.sources.it).map(pick), [...X.it.parts.map(pick), pick(X.it.legend)], 'it: manifest sources differ from the extract');
assert.deepEqual(Object.values(manifest.sources.hu).map(pick), Object.values(X.hu.years).map(pick), 'hu: manifest sources differ from the extract');
assert.deepEqual(Object.values(manifest.sources.si).map(pick), [...Object.values(X.si.years).map(pick), pick(X.si.list)], 'si: manifest sources differ from the extract');

// ---------- 2. Dossiers, re-derived from the extracts ----------
const expected = {};
const expectedExcluded = {};
const counts = {};
const candidatesOf = {};
const labelsOf = {};
const dmy = (text, sep) => {
  if (!text) return null;
  const m = text.match(new RegExp(`^(\\d{2})${escapeRe(sep)}(\\d{2})${escapeRe(sep)}(\\d{4})$`));
  assert.ok(m, `date ${text}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
};
const groupBy = (items, key) => { const m = new Map(); for (const x of items) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); } return m; };
{
  // Israel: Registrar of Amutot datastore
  const x = X.il;
  assert.equal(x.resource.id, 'be5b7935-3922-45d4-9638-08871b17ec95');
  assert.deepEqual(x.keep, IL_KEEP);
  for (const f of IL_KEEP) assert.ok(x.fields.includes(f), `il: field ${f}`);
  assert.equal(x.floor, THRESHOLDS.il.value);
  assert.equal(x.index.length, x.total, 'il: every datastore record is in the index');
  assert.deepEqual(x.index.map((r) => r[0]), Array.from({ length: x.total }, (_, i) => i + 1), 'il: _id sequence');
  assert.equal(x.pages.reduce((n, p) => n + p.records, 0), x.total, 'il: pages cover the datastore');
  x.pages.forEach((p, i) => { assert.equal(p.offset, i * 10000); assert.ok(p.url.includes(`offset=${p.offset}`) && p.url.includes('sort=_id%20asc')); });
  for (const r of x.index) assert.ok(r[4] === null || /^-?\d+\.\d+$/.test(r[4]), `il ${r[0]}: revenue ${r[4]} must keep its published decimals`);
  const col = Object.fromEntries(IL_KEEP.map((n, i) => [n, i + 1]));
  const records = new Map(x.records.map((r) => [r[0], r]));
  const candidates = x.index.filter((r) => atLeast(r[4], THRESHOLDS.il.value));
  assert.deepEqual([...records.keys()].sort((a, b) => a - b), candidates.map((r) => r[0]), 'il: extract records must be exactly the rows at or above the threshold');
  const dossiers = []; const excluded = {};
  for (const row of candidates) {
    const r = records.get(row[0]);
    assert.equal(r[col['מספר עמותה']], row[1], `il ${row[0]}: id`);
    assert.equal(r[col['מחזור כספי (הכנסות)']], row[4], `il ${row[0]}: revenue`);
    assert.equal(r[col['סטטוס עמותה']], x.statuses[row[2]], `il ${row[0]}: status`);
    assert.equal(r[col['סיווג פעילות ענפי']], x.sectors[row[3]], `il ${row[0]}: sector`);
    const status = r[col['סטטוס עמותה']];
    if (!IL_INCLUDED_STATUSES.includes(status)) { (excluded[status] ??= []).push(row[1]); continue; }
    const expenses = r[col['סך הוצאות העמותה']];
    assert.match(expenses, /^-?\d+$/, `il ${row[1]}: expenses`);
    assert.ok(r[col['שנת דיווח דוח כספי אחרון']], `il ${row[1]}: financial report year`);
    const sector = r[col['סיווג פעילות ענפי']];
    dossiers.push({
      id: row[1], name: r[col['שם עמותה בעברית']], record: row[0],
      facts: { enName: r[col['שם עמותה באנגלית']] || null, registered: dmy(r[col['תאריך רישום עמותה']], '/'), status, sector: sector || null,
        secondary: r[col['תחום פעילות משני']] || null, city: r[col['כתובת - ישוב']] || null, lastReportYear: r[col['שנת דיווח אחרונה']] },
      labels: sector ? [sector] : [],
      periods: [{ label: r[col['שנת דיווח דוח כספי אחרון']], record: row[0], expensesPublishedZero: expenses === '0',
        values: { revenue: r[col['מחזור כספי (הכנסות)']], expenses: expenses === '0' ? null : expenses } }],
    });
  }
  expected.il = dossiers; expectedExcluded.il = excluded; candidatesOf.il = candidates.length;
  const included = x.index.filter((r) => IL_INCLUDED_STATUSES.includes(x.statuses[r[2]]));
  const byStatus = {};
  for (const s of [...new Set(x.index.map((r) => x.statuses[r[2]]))].sort()) byStatus[s] = x.index.filter((r) => x.statuses[r[2]] === s).length;
  counts.il = { editionOrganizations: x.index.length, withRevenue: x.index.filter((r) => r[4] !== null).length, byStatus,
    labels: Object.fromEntries(x.sectors.filter(Boolean).map((s) => [s, included.filter((r) => x.sectors[r[3]] === s).length])) };
  labelsOf.il = x.sectors.filter(Boolean).map((s) => [s, s]);
  assert.deepEqual(Object.keys(IL_GLOSS).sort(), x.sectors.filter(Boolean).sort(), 'il: every published sector needs a pinned slug and translation');
}
{
  // Estonia: e-Business Register reports and the EMTA list
  const x = X.ee;
  assert.deepEqual(x.years, ['2025', '2024']);
  assert.deepEqual(x.incomeTables, EE_INCOME_TABLES);
  assert.deepEqual(x.balanceTables, EE_BALANCE_TABLES);
  assert.deepEqual(x.lines, EE_LINES.map(([e]) => e));
  assert.match(x.emtaAsOf, /^\d{2}\.\d{2}\.\d{4}$/);
  const emta = groupBy(x.emta, (r) => r[0]);
  const entities = new Map(x.entities.map((e) => [e[0], e]));
  assert.equal(entities.size, x.entities.length, 'ee: duplicate entity');
  for (const e of x.entities) assert.ok(emta.has(e[0]), `ee ${e[0]}: entity outside the EMTA list`);
  const byOrg = new Map();
  for (const rep of x.reports) {
    assert.ok(emta.has(rep[1]) && x.years.includes(rep[4]), `ee report ${rep[0]}: outside the population`);
    const y = byOrg.get(rep[1]) ?? {};
    assert.ok(!y[rep[4]], `ee ${rep[1]}: two reports for ${rep[4]}`);
    y[rep[4]] = rep; byOrg.set(rep[1], y);
  }
  for (const [id, rows] of Object.entries(x.elements)) {
    assert.ok(x.reports.some((r) => r[0] === id), `ee: elements for unknown report ${id}`);
    for (const [table, element, , value] of rows) {
      assert.ok([...EE_INCOME_TABLES, ...EE_BALANCE_TABLES].includes(table) && x.lines.includes(element), `ee ${id}: unexpected element ${table}/${element}`);
      assert.match(value, /^-?\d+(\.\d+)?$/, `ee ${id}: value ${value}`);
    }
  }
  const linesOf = (id) => {
    const rows = x.elements[id] ?? [];
    const used = {};
    for (const [group, tables] of [['income', EE_INCOME_TABLES], ['balance', EE_BALANCE_TABLES]]) {
      const present = [...new Set(rows.filter(([t]) => tables.includes(t)).map(([t]) => t))].sort();
      assert.ok(present.length <= 1, `ee ${id}: more than one ${group} table`);
      used[group] = present[0] ?? null;
    }
    const values = {};
    for (const [key, group] of EE_LINES) {
      const hits = rows.filter(([t, e]) => t === used[group] && e === key);
      assert.ok(hits.length <= 1, `ee ${id}: ${key} published twice`);
      values[key] = hits.length ? hits[0][3] : null;
    }
    return { values, used };
  };
  const dossiers = []; const excluded = {}; let candidates = 0;
  for (const code of [...emta.keys()].sort()) {
    const years = byOrg.get(code) ?? {};
    const latest = x.years.map((y) => years[y]).find(Boolean);
    if (!latest) continue;
    if (!atLeast(linesOf(latest[0]).values.TotalRevenue, THRESHOLDS.ee.value)) continue;
    candidates++;
    const ent = entities.get(code);
    if (!ent) { (excluded.notInRegister ??= []).push(code); continue; }
    if (ent[4] !== 'R') { (excluded.notEntered ??= []).push(code); continue; }
    dossiers.push({
      id: code, name: ent[1], record: null,
      facts: { legalForm: ent[2], subform: ent[3] || null, status: ent[5], firstEntry: dmy(ent[6], '.'), location: ent[7] || null, link: ent[8] || null,
        emtaEntries: emta.get(code).map((e) => ({ name: e[1], since: dmy(e[2], '.'), county: e[3], place: e[4] })) },
      labels: [],
      periods: x.years.filter((y) => years[y]).map((y) => {
        const rep = years[y]; const { values, used } = linesOf(rep[0]);
        return { label: y, record: Number(rep[0]), periodStart: dmy(rep[6], '.'), periodEnd: dmy(rep[7], '.'), submitted: dmy(rep[8], '.'), audited: rep[9],
          consolidated: rep[5], incomeTable: used.income, balanceTable: used.balance, values };
      }),
    });
  }
  expected.ee = dossiers; expectedExcluded.ee = excluded; candidatesOf.ee = candidates;
  counts.ee = { emtaRows: x.emta.length, emtaOrganizations: emta.size, withReport: Object.fromEntries(x.years.map((y) => [y, [...emta.keys()].filter((c) => byOrg.get(c)?.[y]).length])),
    emtaAsOf: x.emtaAsOf, inRegister: [...emta.keys()].filter((c) => entities.has(c)).length };
}
const itDecimal = (text) => { assert.match(text, /^\d{1,3}(\.\d{3})*(,\d{1,2})?$/, `it amount ${text}`); return text.replace(/\./g, '').replace(',', '.'); };
{
  // Italy: Agenzia delle Entrate 5 per mille AF 2025
  const x = X.it;
  assert.deepEqual(x.header, IT_HEADER);
  assert.equal(x.parts.length, 7);
  assert.equal(x.legend.text, IT_LEGEND);
  assert.equal(x.floor, THRESHOLDS.it.value);
  assert.deepEqual(x.index.map((r) => r[0]), Array.from({ length: x.index.length }, (_, i) => i + 1), 'it: Prog sequence');
  assert.equal(x.parts.reduce((n, p) => n + p.rows, 0), x.index.length, 'it: parts cover the index');
  let prog = 1;
  for (const p of x.parts) { assert.equal(p.firstProg, prog); prog = p.lastProg + 1; assert.equal(p.lastProg - p.firstProg + 1, p.rows); }
  for (const r of x.index) { assert.match(r[1], /^[-XR]{7}$/, `it ${r[0]}: flags`); assert.ok(!r[1].slice(1).includes('R'), `it ${r[0]}: R outside ETS`); if (r[2] !== null) assert.match(r[2], /^\d+(\.\d{1,2})?$/); }
  const records = new Map(x.records.map((r) => [Number(r[1]), r]));
  const candidates = x.index.filter((r) => atLeast(r[2], THRESHOLDS.it.value));
  assert.deepEqual([...records.keys()].sort((a, b) => a - b), candidates.map((r) => r[0]), 'it: extract records must be exactly the rows at or above the threshold');
  const dossiers = []; const excluded = {};
  for (const row of candidates) {
    const r = records.get(row[0]);
    const part = r[0]; const cells = r.slice(1);
    assert.equal(cells.length, 18, `it ${row[0]}: 18 cells`);
    const partInfo = x.parts.find((p) => p.part === part);
    assert.ok(partInfo && row[0] >= partInfo.firstProg && row[0] <= partInfo.lastProg, `it ${row[0]}: part ${part}`);
    assert.equal(IT_CATEGORY_COLUMNS.map((j) => cells[j] || '-').join(''), row[1], `it ${row[0]}: flags`);
    assert.equal(itDecimal(cells[17]), row[2], `it ${row[0]}: total`);
    assert.match(cells[1], /^'[0-9A-Z]{11,16}'$/, `it ${row[0]}: codice fiscale`);
    const cf = cells[1].slice(1, -1);
    if (row[1] === '----X--') { (excluded.municipalityOnly ??= []).push(cf); continue; }
    dossiers.push({
      id: cf, name: cells[2], record: Number(cells[0]),
      facts: { part, region: cells[3] || null, province: cells[4] || null, comune: cells[5] || null, flags: Object.fromEntries(IT_CATEGORY_COLUMNS.map((j) => [IT_HEADER[j], cells[j]])) },
      labels: IT_CATEGORY_COLUMNS.filter((j) => cells[j]).map((j) => IT_HEADER[j]),
      periods: [{ label: 'AF 2025', record: Number(cells[0]), part, values: Object.fromEntries(Object.entries(IT_AMOUNTS).map(([kk, j]) => [kk, cells[j] ? itDecimal(cells[j]) : null])) }],
    });
  }
  expected.it = dossiers; expectedExcluded.it = excluded; candidatesOf.it = candidates.length;
  const labels = IT_CATEGORY_COLUMNS.map((j) => IT_HEADER[j]);
  counts.it = { editionOrganizations: x.index.length, withTotal: x.index.filter((r) => r[2] !== null).length,
    labels: Object.fromEntries(labels.map((l, i) => [l, x.index.filter((r) => r[1][i] !== '-').length])), etsReserved: x.index.filter((r) => r[1][0] === 'R').length };
  labelsOf.it = labels.map((l) => [l, l]);
}
{
  // Hungary: NAV 1% lists 2024 to 2026
  const x = X.hu;
  assert.deepEqual(Object.keys(x.years), ['2024', '2025', '2026']);
  assert.equal(x.selectionYear, '2026');
  assert.equal(x.floor, THRESHOLDS.hu.value);
  for (const [y, rows] of Object.entries(x.index)) {
    assert.equal(rows.length, x.years[y].rows, `hu ${y}: row count`);
    assert.deepEqual(rows.map((r) => r[0]), Array.from({ length: rows.length }, (_, i) => i + 1), `hu ${y}: Sorszám`);
    assert.equal(new Set(rows.map((r) => r[1])).size, rows.length, `hu ${y}: duplicate tax number`);
    for (const r of rows) { assert.match(r[1], /^\d{8}$/); assert.match(r[2], /^\d+$/, `hu ${y} ${r[1]}: amount must be a published whole number`); }
    assert.match(x.years[y].title, new RegExp(`a ${y}\\. rendelkező évben$`));
  }
  const candidates = x.index['2026'].filter((r) => BigInt(r[2]) >= BigInt(THRESHOLDS.hu.value));
  const selected = new Set(candidates.map((r) => r[1]));
  const byYear = {};
  for (const [y, rows] of Object.entries(x.records)) {
    const idx = new Map(x.index[y].map((r) => [r[1], r]));
    assert.deepEqual(rows.map((r) => r[2]).sort(), x.index[y].filter((r) => selected.has(r[1])).map((r) => r[1]).sort(), `hu ${y}: extract records must be exactly the selected organizations`);
    for (const r of rows) {
      assert.deepEqual([Number(r[1]), r[2], r[6]], idx.get(r[2]), `hu ${y} ${r[2]}: record differs from the index`);
      assert.match(r[7], /^\d+$/); assert.match(r[3], /^\d$/); assert.match(r[4], /^\d{1,2}$/);
    }
    byYear[y] = new Map(rows.map((r) => [r[2], r]));
  }
  const years = Object.keys(x.records).sort().reverse();
  expected.hu = candidates.map((row) => {
    const t = row[1]; const latest = byYear['2026'].get(t);
    return {
      id: t, name: latest[5], record: Number(latest[1]),
      facts: { vatCode: latest[3], countyCode: latest[4], listedYears: years.filter((y) => byYear[y].has(t)) },
      labels: [],
      periods: years.map((y) => { const r = byYear[y].get(t); return { label: y, record: r ? Number(r[1]) : null, name: r ? r[5] : null, values: { amount: r ? r[6] : null, donors: r ? r[7] : null } }; }),
    };
  });
  expectedExcluded.hu = {}; candidatesOf.hu = candidates.length;
  counts.hu = { recipients: Object.fromEntries(years.map((y) => [y, x.index[y].length])) };
}
{
  // Slovenia: FURS recipient lists and the Government's 2025 list of eligible recipients
  const x = X.si;
  assert.deepEqual(Object.keys(x.years), ['2023', '2024', '2025']);
  assert.deepEqual(x.list.sections, Object.fromEntries(Object.entries(SI_SECTIONS).map(([k, v]) => [k, v])));
  const membership = new Map(x.list.membership.map(([t, s]) => [t, s]));
  assert.equal(membership.size, x.list.membership.length, 'si: duplicate tax number in the membership');
  for (const [t, s] of membership) { assert.match(t, /^\d{8}$/); assert.ok(s.length >= 1 && s.every((n) => SI_SECTIONS[n]), `si ${t}: sections`); assert.deepEqual(s, [...s].sort()); }
  const rows = {};
  for (const [y, data] of Object.entries(x.rows)) {
    assert.equal(data.length, x.years[y].rows, `si ${y}: row count`);
    for (const r of data) {
      assert.match(r[1], /^\d{8}$/);
      if (r[3] === 'manj kot 5') assert.equal(r[4], null, `si ${y} ${r[1]}: a suppressed row has no amount`);
      else { assert.match(r[3], /^\d+$/); assert.match(r[4], /^\d+\.\d{2}$/, `si ${y} ${r[1]}: amount to the cent`); }
    }
    rows[y] = groupBy(data, (r) => r[1]);
  }
  const years = Object.keys(x.rows).sort().reverse();
  const period = (y, t) => {
    const hits = rows[y].get(t) ?? [];
    if (hits.length > 1) return { label: y, record: null, name: null, multipleRows: hits.map((h) => h[0]), values: { amount: null, donors: null } };
    const h = hits[0];
    return { label: y, record: h ? h[0] : null, name: h ? h[2] : null, multipleRows: null, values: { amount: h ? h[4] : null, donors: h ? h[3] : null } };
  };
  const dossiers = []; const excluded = {}; let candidates = 0;
  for (const r of x.rows['2025']) {
    if (!atLeast(r[4], THRESHOLDS.si.value)) continue;
    candidates++;
    const sections = membership.get(r[1]) ?? [];
    if (rows['2025'].get(r[1]).length > 1) { (excluded.multipleRows ??= []).push(r[1]); continue; }
    if (!sections.includes(1)) { (excluded[sections.length ? `section${Math.min(...sections)}` : 'notListed'] ??= []).push(r[1]); continue; }
    dossiers.push({ id: r[1], name: r[2], record: r[0], facts: { sections }, labels: [], periods: years.map((y) => period(y, r[1])) });
  }
  expected.si = dossiers; expectedExcluded.si = excluded; candidatesOf.si = candidates;
  // No political party, trade union, religious body or school may have a dossier.
  for (const d of dossiers) assert.ok(membership.get(d.id).includes(1), `si ${d.id}: not in section 1`);
  const bySection = {};
  for (const r of x.rows['2025']) { const s = membership.get(r[1]); const key = s ? String(Math.min(...s)) : 'notListed'; bySection[key] = (bySection[key] ?? 0) + 1; }
  counts.si = { recipients: Object.fromEntries(years.map((y) => [y, x.rows[y].length])), recipientsBySection2025: Object.fromEntries(Object.entries(bySection).sort()),
    listedTaxNumbers: membership.size, listedInSection: Object.fromEntries(Object.keys(SI_SECTIONS).map((n) => [n, [...membership.values()].filter((s) => s.includes(Number(n))).length])),
    suppressed2025: x.rows['2025'].filter((r) => r[4] === null).length };
}
const out = (key) => readJson(join(dataDir, manifest.outputs[key].path));
const data = Object.fromEntries(KEYS.map((k) => [k, out(k)]));
let figures = 0;
const sortedExcluded = (e) => Object.fromEntries(Object.entries(e).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([r, v]) => [r, [...v].sort()]));
for (const k of KEYS) {
  const exp = [...expected[k]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assert.deepEqual(data[k].map((d) => d.id), exp.map((d) => d.id), `${k}: dossier identifiers differ from the selection rule`);
  data[k].forEach((d, i) => assert.deepStrictEqual(d, exp[i], `${k} ${d.id}: dossier differs from the official extract`));
  const sel = manifest.selection[k];
  assert.deepEqual(sel.threshold, THRESHOLDS[k], `${k}: threshold changed`);
  assert.deepEqual(sel.excluded, sortedExcluded(expectedExcluded[k]), `${k}: exclusions`);
  const excludedIds = Object.values(sel.excluded).flat();
  assert.equal(new Set([...data[k].map((d) => d.id), ...excludedIds]).size, data[k].length + excludedIds.length, `${k}: dossiers and exclusions overlap`);
  assert.equal(sel.candidates, candidatesOf[k], `${k}: candidates`);
  assert.equal(sel.candidates, data[k].length + excludedIds.length, `${k}: every candidate is a dossier or a recorded exclusion`);
  assert.equal(sel.dossiers, data[k].length);
  assert.deepStrictEqual(out(`${k}Counts`), counts[k], `${k}: file counts`);
  for (const d of data[k]) {
    assert.ok(typeof d.name === 'string' && d.name.trim() && d.name.length <= 300, `${k} ${d.id}: name`);
    assert.ok(atLeast(d.periods[0].values[THRESHOLDS[k].line], THRESHOLDS[k].value), `${k} ${d.id}: latest period below the threshold`);
    for (const p of d.periods) for (const [line, v] of Object.entries(p.values)) {
      if (v === null) continue;
      if (k === 'si' && line === 'donors' && v === 'manj kot 5') continue;
      assert.match(v, /^-?\d{1,16}(?:\.\d{1,2})?$/, `${k} ${d.id} ${line}: ${v}`);
      figures++;
    }
  }
}
assert.deepEqual(manifest.selection.rules.il.includedStatuses, IL_INCLUDED_STATUSES);
assert.equal(manifest.selection.rules.si.includedSection, 1);
assert.equal(manifest.selection.hubMinimumDossiers, HUB_MIN);
const totalDossiers = KEYS.reduce((n, k) => n + data[k].length, 0);
assert.ok(totalDossiers >= 1000 && totalDossiers <= 2500, `Wave 1d should add 1,000 to 2,500 dossiers, not ${totalDossiers}`);

// ---------- 3. Cause groups ----------
const causes = out('causes');
assert.equal(causes.format, 'charitology-cause-by-country-wave1d-v1');
assert.match(causes.rule, /not an equivalence or an official crosswalk/);
assert.deepEqual(causes.registers, CAUSE_KEYS);
assert.deepEqual(causes.labelLanguage, LABEL_LANGUAGE);
assert.deepEqual(causes.labels, { il: labelsOf.il, it: labelsOf.it }, 'Cause labels differ from the published classifications');
assert.equal(causes.groups.length, WAVE1B_STEMS.length);
const wave1bCauses = readJson(join(root, 'public/data/registry-wave1b/cause-groups.json'));
const grouped = Object.fromEntries(CAUSE_KEYS.map((r) => [r, new Set()]));
causes.groups.forEach((g, i) => {
  const [id, name, stems] = WAVE1B_STEMS[i];
  assert.deepEqual([g.id, g.name, g.stems], [id, name, stems], `Cause group ${id} definition changed`);
  assert.deepEqual([wave1bCauses.groups[i].id, wave1bCauses.groups[i].stems], [id, stems], `${id}: Wave 1b stems must be reused unchanged`);
  assert.deepEqual(g.languageStems, Object.fromEntries(LANGUAGES.map((l) => [l, LANGUAGE_STEMS[id]?.[l] ?? []])), `${id}: language stems changed`);
  for (const r of CAUSE_KEYS) {
    const use = [...stems, ...(g.languageStems[LABEL_LANGUAGE[r]] ?? [])];
    const exp = causes.labels[r].filter(([, label]) => use.some((s) => wordMatch(label, s))).map(([kk]) => kk);
    assert.deepEqual(g.matches[r], exp, `${id}: ${r} matches`);
    for (const kk of exp) grouped[r].add(kk);
  }
});
for (const r of CAUSE_KEYS) assert.deepEqual(causes.ungrouped[r], causes.labels[r].map(([kk]) => kk).filter((kk) => !grouped[r].has(kk)), `${r}: ungrouped labels`);

// ---------- 4. Expected routes, derived independently of the page code ----------
const STOP = new Set(['a', 'and', 'as', 'be', 'by', 'in', 'of', 'or', 'the', 'to', 'with']);
const labelSlug = (text) => {
  const words = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 7);
  while (words.length > 1 && STOP.has(words.at(-1))) words.pop();
  return words.join('-');
};
const W = '/record/charity-dossiers/';
const COUNTRY = { il: 'israel', ee: 'estonia', it: 'italy', hu: 'hungary', si: 'slovenia' };
const COUNTRY_NAME = { il: 'Israel', ee: 'Estonia', it: 'Italy', hu: 'Hungary', si: 'Slovenia' };
const SEGMENT = { il: 'amuta', ee: 'org', it: 'cf', hu: 'adoszam', si: 'davcna' };
const HUB_SEGMENT = { il: 'sectors', it: 'categories' };
const labelDisplay = (k, l) => (k === 'il' ? `${l} (${IL_GLOSS[l][1]})` : `${l} (${IT_GLOSS[l]})`);
const hubSlug = (k, l) => (k === 'il' ? IL_GLOSS[l][0] : labelSlug(l));
const base = (k) => `${W}${COUNTRY[k]}/`;
const dossierPath = (k, d) => `${base(k)}${SEGMENT[k]}/${d.id.toLowerCase()}/`;
const hubPath = (k, l) => `${base(k)}${HUB_SEGMENT[k]}/${hubSlug(k, l)}/`;
const routes = new Map();
const addRoute = (path, desc) => { assert.ok(!routes.has(path), `Duplicate Wave 1d route ${path}`); routes.set(path, desc); };
const sortByName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const hubs = {};
for (const k of KEYS) {
  const items = [...data[k]].sort(sortByName);
  const byLabel = new Map();
  for (const d of items) for (const l of d.labels) byLabel.set(l, [...(byLabel.get(l) ?? []), d]);
  hubs[k] = HUB_SEGMENT[k] ? [...byLabel].filter(([, m]) => m.length >= HUB_MIN).map(([l]) => l).sort((a, b) => hubSlug(k, a).localeCompare(hubSlug(k, b))) : [];
  addRoute(base(k), { kind: 'index', k, items, hubs: hubs[k] });
  for (const l of hubs[k]) addRoute(hubPath(k, l), { kind: 'hub', k, label: l, members: byLabel.get(l) });
  for (const d of items) addRoute(dossierPath(k, d), { kind: 'dossier', k, d });
}
const allRoutes = [...routes.keys()];
assert.ok(allRoutes.length >= 1000 && allRoutes.length <= 2500, `Wave 1d should add 1,000 to 2,500 pages, not ${allRoutes.length}`);
for (const [path, r] of routes) if (r.kind === 'hub') assert.ok(r.members.length >= HUB_MIN, `${path}: fewer than ${HUB_MIN} dossiers`);

// ---------- 5. Built pages ----------
assert.ok(existsSync(join(dist, 'index.html')), 'Run npm run build first.');
const homeHtml = readFileSync(join(dist, 'index.html'), 'utf8');
const home = new URL(homeHtml.match(/<meta property="og:url" content="([^"]+)"/)[1]);
const sitePath = home.pathname.replace(/\/$/, '');
const abs = (path) => new URL(sitePath + path, home.origin).href;
const sitemap = readBuiltSitemapSet(dist);
assert.ok(sitemap.index, '/sitemap.xml must be a sitemap index');
assert.deepEqual(sitemap.children.map((c) => c.file), ['sitemap-core.xml', 'sitemap-registries-wave1.xml', 'sitemap-registries-wave1b.xml', 'sitemap-registries-wave1c.xml', 'sitemap-registries-wave1d.xml'], 'Unexpected child sitemaps');
const [core, wave1, wave1b, wave1c, wave1d] = sitemap.children;

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
  const [whole, frac] = value.replace('-', '').split('.');
  return { negative, text: `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac !== undefined ? `.${frac}` : ''}` };
};
const PREFIX = { il: '₪', ee: '€', it: '€', hu: 'HUF ', si: '€' };
const LINES = {
  il: [['revenue', 'money'], ['expenses', 'money']],
  ee: EE_LINES.map(([e]) => [e, 'money']),
  it: [['choices', 'count'], ['expressed', 'money'], ['generic', 'money'], ['under100', 'money'], ['total', 'money']],
  hu: [['amount', 'money'], ['donors', 'count']],
  si: [['amount', 'money'], ['donors', 'count']],
};
const money = (k, v) => { const { negative, text: t } = grouped3(v); return `${negative ? '−' : ''}${PREFIX[k]}${t}`; };
const expectedCell = (k, p, line) => {
  if (k === 'si' && p.multipleRows) return 'Not shown: the list prints this tax number on more than one row';
  if (k === 'il' && line === 'expenses' && p.expensesPublishedZero) return 'Not supplied (the dataset prints 0, which it also uses for a blank)';
  const v = p.values[line];
  if (v === null || v === undefined) return 'Not supplied';
  if (k === 'si' && line === 'donors' && v === 'manj kot 5') return 'Fewer than 5 (“manj kot 5”)';
  return LINES[k].find(([l]) => l === line)[1] === 'count' ? grouped3(v).text : money(k, v);
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLabel = (value) => { const [y, m, d] = value.split('-'); return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`; };
const optionalDay = (v) => (v ? dayLabel(v) : 'Not supplied');
const n = (v) => v.toLocaleString('en-US');
const PERIOD_HEADING = {
  il: (p) => `Financial report ${p.label}`, ee: (p) => `Annual report ${p.label}`, it: () => 'Financial year 2025 (AF 2025)',
  hu: (p) => `List year ${p.label}`, si: (p) => `Tax year ${p.label}`,
};
const PERIOD_SUB = {
  il: (p) => `Datastore record ${n(p.record)}`, ee: (p) => `Report ${p.record}`, it: (p) => `Prog ${n(p.record)}, part ${p.part} of 7`,
  hu: (p) => (p.record === null ? null : `Sorszám ${n(p.record)}`), si: (p) => (p.record === null ? null : `Worksheet row ${n(p.record)}`),
};
const expectedFacts = (k, d) => {
  const f = d.facts;
  return {
    il: () => [['Amuta number', d.id], ['Name (Hebrew, as registered)', d.name], ['English name', f.enName ?? 'Not supplied'], ['Status', f.status],
      ['Date registered', optionalDay(f.registered)], ['Activity sector', f.sector ? labelDisplay('il', f.sector) : 'Not supplied'],
      ['Secondary field', f.secondary ?? 'Not supplied'], ['City', f.city ?? 'Not supplied'], ['Latest reporting year', f.lastReportYear ?? 'Not supplied']],
    ee: () => [['Registry code', d.id], ['Name', d.name], ['Legal form', f.subform ? `${f.legalForm} (${f.subform})` : f.legalForm], ['Register status', f.status],
      ['First entered in the register', optionalDay(f.firstEntry)], ['Location', f.location ?? 'Not supplied'],
      ['EMTA income tax incentive list', f.emtaEntries.map((e) => `listed since ${dayLabel(e.since)} as “${e.name}”, ${e.county}, ${e.place}`).join('; ')]],
    it: () => [['Codice fiscale', d.id], ['Name (Denominazione)', d.name], ['Region', f.region ?? 'Not supplied'], ['Province', f.province ?? 'Not supplied'],
      ['Comune', f.comune ?? 'Not supplied'], ['Beneficiary categories', Object.entries(f.flags).filter(([, v]) => v).map(([c, v]) => `${c} (${v})`).join('; ')],
      ['List file', `Part ${f.part} of 7, Prog ${n(d.record)}`]],
    hu: () => [['Tax number (first eight digits)', d.id], ['Name in the 2026 list', d.name],
      ['VAT code and county code', `${f.vatCode} and ${f.countyCode}, as printed beside the tax number in the 2026 list`], ['Lists with this tax number', f.listedYears.join('; ')]],
    si: () => [['Tax number', d.id], ['Name in the 2025 list', d.name], ['Section of the 2025 eligible list', f.sections.map((s) => `${s} (${SI_GLOSS[s]})`).join('; ')]],
  }[k]();
};
const ID_PROPERTY = {
  il: 'Israeli Registrar of Amutot registration number', ee: 'Estonian e-Business Register registry code (registrikood)', it: 'Italian tax code (codice fiscale)',
  hu: 'Hungarian tax number (adószám), first eight digits', si: 'Slovenian tax number (davčna številka)',
};
const ENTRY_URL = { il: (d) => `https://www.guidestar.org.il/organization/${d.id}`, ee: (d) => d.facts.link, it: () => null, hu: () => null, si: () => null };
for (const d of data.ee) assert.match(d.facts.link, /^https:\/\/ariregister\.rik\.ee\/est\/company\/\d{8}$/, `ee ${d.id}: register link as published`);
const RATING_LANGUAGE = [/★|☆/, /\b\d(?:\.\d)?\s*(?:out of|\/)\s*(?:5|10)\s*stars?\b/i, /\btop[- ]rated\b/i, /\bbest charit/i,
  /\branked\s+(?:#|no\.?\s*|number\s*)\d/i, /\b(?:impact|efficiency|effectiveness|transparency|accountability)\s+(?:score|rating|grade)\s*(?:of|:)/i,
  /\boverhead ratio (?:of|is|was)\b/i, /\bgrade\s*:\s*[A-F][+-]?(?!\w)/, /\b(?:admin|administration|purpose)\s*(?:cost\s*)?(?:share|percentage|ratio)\s*(?:of|:)?\s*\d+\s*%/i];

// Titles and descriptions must be unique across every verified registry page (Wave 1, 1b, 1c and 1d).
const descriptions = new Map();
const titles = new Map();
for (const child of [wave1, wave1b, wave1c]) {
  for (const loc of child.locs) {
    const path = new URL(loc).pathname.slice(sitePath.length);
    const html = readFileSync(join(dist, path.slice(1), 'index.html'), 'utf8');
    const head = [...walk(parse(html.slice(0, html.indexOf('</head>') + 7)))];
    titles.set(squash(text(head.find((nd) => nd.nodeName === 'title'))), path);
    descriptions.set(attr(head.find((nd) => nd.nodeName === 'meta' && attr(nd, 'name') === 'description'), 'content'), path);
  }
}
const linkedFrom = new Map();
let faqCount = 0;
let cells = 0;
let factRows = 0;
for (const [path, route] of routes) {
  const file = join(dist, path.slice(1), 'index.html');
  assert.ok(existsSync(file), `Missing built page ${path}`);
  const html = readFileSync(file, 'utf8');
  const nodes = [...walk(parse(html))];
  const label = path;
  const canonicals = nodes.filter((nd) => nd.nodeName === 'link' && attr(nd, 'rel') === 'canonical');
  assert.equal(canonicals.length, 1, `${label}: one canonical`);
  assert.equal(attr(canonicals[0], 'href'), abs(path), `${label}: canonical`);
  const meta = (key) => nodes.find((nd) => nd.nodeName === 'meta' && (attr(nd, 'property') === key || attr(nd, 'name') === key));
  assert.equal(attr(meta('og:url'), 'content'), abs(path), `${label}: og:url`);
  for (const key of ['og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(attr(meta(key), 'content'), `${label}: ${key}`);
  const description = attr(meta('description'), 'content');
  assert.ok(description && description.length >= 50, `${label}: meta description`);
  assert.ok(!descriptions.has(description), `${label}: duplicate meta description with ${descriptions.get(description)}`);
  descriptions.set(description, path);
  const title = squash(text(nodes.find((nd) => nd.nodeName === 'title')));
  assert.ok(!titles.has(title), `${label}: duplicate <title> with ${titles.get(title)}`);
  titles.set(title, path);
  const h1 = nodes.filter((nd) => nd.nodeName === 'h1');
  assert.equal(h1.length, 1, `${label}: one h1`);
  assert.ok(title.startsWith(squash(text(h1[0]))), `${label}: <title> and h1 differ`);
  assert.ok(nodes.some((nd) => nd.nodeName === 'script' && attr(nd, 'src') === 'https://rsio.org/vital.js' && attr(nd, 'defer') !== undefined), `${label}: shared analytics script`);
  assert.ok(!html.includes('document.cookie'), `${label}: must not touch cookies`);
  assert.ok(!nodes.some((nd) => nd.nodeName === 'meta' && attr(nd, 'name') === 'robots'), `${label}: must be indexable`);
  const ld = nodes.filter((nd) => nd.nodeName === 'script' && attr(nd, 'type') === 'application/ld+json').map((nd) => JSON.parse(text(nd)));
  const ofType = (type) => ld.filter((nd) => nd['@type'] === type);
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
  const details = nodes.filter((nd) => nd.nodeName === 'details' && attr(nd, 'class') === 'rw-faq');
  assert.equal(details.length, 6, `${label}: six visible FAQ details`);
  details.forEach((node, i) => {
    const summary = node.childNodes.find((c) => c.nodeName === 'summary');
    const answer = node.childNodes.find((c) => c.nodeName === 'p');
    assert.equal(squash(text(summary)), squash(questions[i].name), `${label}: FAQ ${i + 1} question differs from JSON-LD`);
    assert.equal(squash(text(answer)), squash(questions[i].acceptedAnswer.text), `${label}: FAQ ${i + 1} answer differs from JSON-LD`);
    assert.equal(questions[i]['@type'], 'Question');
    assert.equal(questions[i].acceptedAnswer['@type'], 'Answer');
    assert.ok(!/\bundefined\b|\bNaN\b|\[object |\bnull\b/.test(questions[i].acceptedAnswer.text + questions[i].name), `${label}: FAQ ${i + 1} renders a missing value`);
  });
  faqCount += 6;
  const main = nodes.find((nd) => nd.nodeName === 'main');
  const mainText = squash(text(main));
  for (const pattern of RATING_LANGUAGE) assert.ok(!pattern.test(mainText), `${label}: rating language ${pattern}`);
  assert.ok(!/\bundefined\b|\bNaN\b|\[object |\bnull\b/.test(mainText), `${label}: renders a missing value`);
  for (const ref of nodes.filter((nd) => nd.nodeName === 'a').map((nd) => attr(nd, 'href')).filter(Boolean)) {
    const target = ref.startsWith(sitePath + W) ? ref.slice(sitePath.length) : null;
    if (target) linkedFrom.set(target, [...(linkedFrom.get(target) ?? []), path]);
  }
  const links = (target) => html.includes(`href="${sitePath}${target}"`);
  const facts = [];
  for (const dl of nodes.filter((nd) => nd.nodeName === 'dl' && attr(nd, 'class') === 'rw-facts')) {
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
    assert.deepEqual(facts, expectedFacts(k, d).map(([dt, dd]) => [dt, squash(dd)]), `${label}: register facts differ from the dataset`);
    factRows += facts.length;
    const table = nodes.find((nd) => nd.nodeName === 'table' && attr(nd, 'data-figures') === 'w1d');
    assert.ok(table, `${label}: figure table`);
    const tnodes = [...walk(table)];
    const heads = tnodes.filter((nd) => nd.nodeName === 'th' && attr(nd, 'data-period') !== undefined);
    assert.deepEqual(heads.map((h) => attr(h, 'data-period')), d.periods.map((p) => p.label), `${label}: one column per period`);
    heads.forEach((h, i) => {
      const sub = PERIOD_SUB[k](d.periods[i]);
      assert.equal(squash(text(h)), squash(`${PERIOD_HEADING[k](d.periods[i])}${sub ?? ''}`), `${label}: period heading and source record ${i}`);
    });
    const rows = tnodes.filter((nd) => nd.nodeName === 'tr' && attr(nd, 'data-line'));
    assert.deepEqual(rows.map((r) => attr(r, 'data-line')), LINES[k].map(([l]) => l), `${label}: one row per published line`);
    for (const row of rows) {
      const line = attr(row, 'data-line');
      const got = row.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)));
      assert.deepEqual(got, d.periods.map((p) => expectedCell(k, p, line)), `${label}: ${line}`);
      for (const g of got) assert.ok(!/^[₪€]?(HUF )?0(\.0+)?$/.test(g) || d.periods.some((p) => p.values[line] !== null && /^0(\.0+)?$/.test(p.values[line])), `${label}: a zero shown for ${line} must be a published zero`);
      cells += got.length;
    }
    if (d.record !== null) assert.ok(mainText.includes(`${n(d.record)} of the ${COUNTRY_NAME[k]} file`), `${label}: source record`);
    for (const l of d.labels) if (hubs[k].includes(l)) assert.ok(links(hubPath(k, l)), `${label}: link to its ${l} hub`);
    assert.ok(links(base(k)), `${label}: link to the country index`);
  } else if (route.kind === 'hub') {
    const { k, members, label: l } = route;
    checkCollection(members.map((d) => [d.name, abs(dossierPath(k, d))]));
    for (const d of members) assert.ok(links(dossierPath(k, d)), `${label}: missing link to ${d.id}`);
    assert.deepEqual(facts.slice(0, 2).map(([, v]) => v), [counts[k].labels[l], members.length].map(n), `${label}: register counts`);
  } else {
    const { k, items: list, hubs: hk } = route;
    checkCollection(hk.length
      ? hk.map((l) => [`${labelDisplay(k, l)}: ${COUNTRY_NAME[k]} charity dossiers`, abs(hubPath(k, l))])
      : list.map((d) => [d.name, abs(dossierPath(k, d))]));
    for (const d of list) assert.ok(links(dossierPath(k, d)), `${label}: missing link to ${d.id}`);
    for (const l of hk) assert.ok(links(hubPath(k, l)), `${label}: missing link to hub ${l}`);
    assert.ok(mainText.includes(`${n(manifest.selection[k].candidates)} records qualify`), `${label}: qualifying count`);
    for (const [reason, ids] of Object.entries(manifest.selection[k].excluded)) assert.ok(mainText.includes(ids.join(', ')), `${label}: exclusions ${reason} listed`);
    if (k === 'si') assert.ok(mainText.includes('it includes only recipients that the list places in section 1, non-governmental organizations in the public interest'), `${label}: the Slovenian classification rule must be stated`);
    if (HUB_SEGMENT[k]) {
      const table = nodes.find((nd) => nd.nodeName === 'table' && attr(nd, 'data-labels') === 'w1d');
      const rows = [...walk(table)].filter((nd) => nd.nodeName === 'tr' && attr(nd, 'data-label') !== undefined);
      assert.deepEqual(rows.map((r) => attr(r, 'data-label')), Object.keys(counts[k].labels).sort((a, b) => hubSlug(k, a).localeCompare(hubSlug(k, b))), `${label}: one row per published label`);
      for (const r of rows) {
        const l = attr(r, 'data-label');
        const got = [squash(text(r.childNodes.find((c) => c.nodeName === 'th'))), ...r.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)))];
        assert.deepEqual(got, [labelDisplay(k, l), n(counts[k].labels[l]), n(list.filter((d) => d.labels.includes(l)).length)], `${label}: label row ${l}`);
        cells += 2;
      }
    }
  }
}
// Every Wave 1d page is reachable from another page; every dossier from a hub or index.
for (const path of allRoutes) assert.ok((linkedFrom.get(path) ?? []).some((from) => from !== path), `Orphan Wave 1d page ${path}`);
for (const [path, r] of routes) if (r.kind === 'dossier') assert.ok((linkedFrom.get(path) ?? []).some((from) => ['index', 'hub'].includes(routes.get(from)?.kind)), `Dossier not linked from a hub or index: ${path}`);
const rootHtml = readFileSync(join(dist, W.slice(1), 'index.html'), 'utf8');
for (const k of KEYS) assert.ok(rootHtml.includes(`href="${sitePath}${base(k)}"`), `${W} must link to ${base(k)}`);
const rootLd = [...walk(parse(rootHtml))].filter((nd) => nd.nodeName === 'script' && attr(nd, 'type') === 'application/ld+json').map((nd) => JSON.parse(text(nd)));
const rootFaq = rootLd.find((nd) => nd['@type'] === 'FAQPage');
assert.ok(rootFaq.mainEntity[0].acceptedAnswer.text.includes(`Wave 1d adds ${n(totalDossiers)} dossiers`), `${W}: FAQ counts`);
const rootList = rootLd.find((nd) => nd['@type'] === 'CollectionPage').mainEntity.itemListElement.map((i) => new URL(i.url).pathname.slice(sitePath.length));
assert.deepEqual(rootList.slice(-KEYS.length), KEYS.map(base), `${W}: ItemList must end with the Wave 1d country pages`);
for (const k of KEYS) {
  const page = `record/charity-index/${COUNTRY[k]}`;
  assert.ok(readFileSync(join(dist, page, 'index.html'), 'utf8').includes(`href="${sitePath}${base(k)}"`), `${page} must link to ${base(k)}`);
}
for (const file of [...Object.values(manifest.outputs).map((o) => o.path), ...Object.values(manifest.extracts).map((o) => o.path), 'manifest.json']) {
  assert.equal(sha(readFileSync(join(dist, 'data/registry-wave1d', file))), sha(readFileSync(join(dataDir, file))), `Built copy of ${file} differs`);
}

// Cause × Country: the Wave 1d table shows every stem, match, count and ungrouped label.
const causeHtml = readFileSync(join(dist, W.slice(1), 'cause-by-country/index.html'), 'utf8');
const causeDoc = [...walk(parse(causeHtml))];
const causeMain = squash(text(causeDoc.find((nd) => nd.nodeName === 'main')));
assert.ok(causeMain.includes('The categories are not identical across registers.'), 'Cause × Country must state that categories differ');
assert.ok(causeMain.includes('It is not an equivalence, a crosswalk or a ranking.'), 'Cause × Country must state that it is not a crosswalk');
assert.ok(causeMain.includes('a word starts where no Latin or Hebrew letter precedes it'), 'Cause × Country must state the Hebrew word-start rule');
const causeCount = (r, key) => data[r].filter((d) => d.labels.includes(key)).length;
const causeHub = (r, key) => (hubs[r].includes(key) ? hubPath(r, key) : null);
let causeCells = 0;
const causeHubs = new Set();
for (const g of causes.groups) {
  const row = causeDoc.find((nd) => nd.nodeName === 'tr' && attr(nd, 'data-group-1d') === g.id);
  assert.ok(row, `Cause × Country Wave 1d row ${g.id}`);
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
      assert.equal(squash(segments[i]), squash(`${labelDisplay(r, key)} (${n(causeCount(r, key))})`), `${g.id} ${r}: ${key}`);
      const hub = causeHub(r, key);
      if (hub) { assert.ok(cell.childNodes.some((c) => c.nodeName === 'a' && attr(c, 'href') === `${sitePath}${hub}`), `${g.id} ${r}: link to ${hub}`); causeHubs.add(hub); }
      causeCells++;
    });
  }
  const stems = causeDoc.find((nd) => nd.nodeName === 'tr' && attr(nd, 'data-stems-1d') === g.id);
  assert.ok(stems, `Stem row ${g.id}`);
  const stemCells = stems.childNodes.filter((c) => c.nodeName === 'td').map((c) => squash(text(c)));
  assert.deepEqual(stemCells, [g.stems.map((s) => `“${s}”`).join(', '), ...LANGUAGES.map((l) => (g.languageStems[l].length ? g.languageStems[l].map((s) => `“${s}”`).join(', ') : 'None'))], `${g.id}: stems shown`);
}
const ungroupedDl = causeDoc.find((nd) => nd.nodeName === 'dl' && attr(nd, 'data-ungrouped') === 'wave1d');
assert.ok(ungroupedDl, 'Wave 1d ungrouped labels');
const ungroupedDd = ungroupedDl.childNodes.filter((c) => c.nodeName === 'dd').map((c) => squash(text(c)));
assert.deepEqual(ungroupedDd, CAUSE_KEYS.map((r) => (causes.ungrouped[r].length ? causes.ungrouped[r].map((key) => `${labelDisplay(r, key)} (${n(causeCount(r, key))})`).join('; ') : 'None')).map(squash), 'Wave 1d ungrouped labels shown');
const causeList = causeDoc.filter((nd) => nd.nodeName === 'script' && attr(nd, 'type') === 'application/ld+json').map((nd) => JSON.parse(text(nd))).find((nd) => nd['@type'] === 'CollectionPage').mainEntity.itemListElement.map((i) => new URL(i.url).pathname.slice(sitePath.length));
const causeWave1d = causeList.filter((p) => routes.has(p));
assert.deepEqual(causeWave1d, [...CAUSE_KEYS.map(base), ...[...causeHubs]], 'Cause × Country ItemList must list the Wave 1d country pages and every linked Wave 1d hub');
for (const p of causeWave1d) assert.ok(causeHtml.includes(`href="${sitePath}${p}"`), `Cause × Country must link ${p}`);

// ---------- 6. Sitemap partition, llms.txt and feed ----------
assert.deepEqual([...wave1d.locs].sort(), allRoutes.map(abs).sort(), 'Wave 1d sitemap must list exactly the Wave 1d pages');
const wave1dSet = new Set(allRoutes.map(abs));
for (const child of [core, wave1, wave1b, wave1c]) assert.ok(!child.locs.some((loc) => wave1dSet.has(loc)), `${child.file} must not list Wave 1d pages`);
assert.ok(!core.locs.some((loc) => new URL(loc).pathname.startsWith(sitePath + W)), 'Core sitemap must not list registry dossier pages');
const llms = readFileSync(join(dist, 'llms.txt'), 'utf8');
for (const [path, r] of routes) if (r.kind !== 'dossier') assert.ok(llms.includes(abs(path)), `llms.txt missing ${path}`);
for (const ref of ['/sitemap-registries-wave1d.xml', '/data/registry-wave1d/manifest.json', '/data/registry-wave1d/cause-groups.json', ...Object.values(manifest.extracts).map((e) => `/data/registry-wave1d/${e.path}`)]) assert.ok(llms.includes(abs(ref)), `llms.txt missing ${ref}`);
const section = llms.slice(llms.indexOf('## Verified Charity Dossiers, Wave 1d'), llms.indexOf('## Key Funding-Flow'));
assert.ok(section.length > 100, 'llms.txt Wave 1d section');
assert.ok(/^[\x00-\x7F]*$/.test(section), 'llms.txt Wave 1d section must be ASCII');
const feed = readFileSync(join(dist, 'feed.xml'), 'utf8');
for (const k of KEYS) assert.ok(!feed.includes(base(k)), 'The RSS feed lists writing, not Wave 1d registry records');

const hubCount = [...routes.values()].filter((r) => r.kind === 'hub').length;
console.log(`✓ Registry Wave 1d: ${KEYS.map((k) => `${data[k].length} ${COUNTRY_NAME[k]}`).join(', ')} dossiers re-derived from ${KEYS.length} pinned official extracts (${sourceFiles} official files; ${figures} figures, ${cells} table cells, ${factRows} fact rows checked); ${hubCount} hubs (each >= ${HUB_MIN}); ${causes.groups.length} cause groups reproduced for ${CAUSE_KEYS.length} registers (${causeCells} label cells checked); ${routes.size} built pages with ${faqCount} FAQ answers equal to FAQPage JSON-LD; sitemap index ${core.locs.length} core + ${wave1.locs.length} Wave 1 + ${wave1b.locs.length} Wave 1b + ${wave1c.locs.length} Wave 1c + ${wave1d.locs.length} Wave 1d URLs.`);
