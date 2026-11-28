// Build-only loader and page model for the Wave 1d verified charity dossiers:
// Israel, Estonia, Italy, Hungary and Slovenia, rebuilt from the official
// downloads that Wave 1c could not use exactly. Every figure is copied from the
// committed, hash-pinned dataset built by scripts/build-registry-wave1d.py from
// compact extracts of the official files. Nothing here estimates, scores,
// ranks, sums or rates an organization. Missing stays missing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FaqEntry } from './structured-data';
import { count, dayLabel, WAVE1_BASE } from './registry-wave1';
import { labelSlug, midSentence } from './registry-wave1c';

const ROOT = resolve('public/data/registry-wave1d');
export const WAVE1D_DATA_PATH = '/data/registry-wave1d/';
export const WAVE1D_SITEMAP = 'sitemap-registries-wave1d.xml';
export const WAVE1D_SITEMAP_SECTIONS = new Set(['Verified charity dossiers, Wave 1d', 'Verified registry hubs, Wave 1d']);

export type W1dKey = 'il' | 'ee' | 'it' | 'hu' | 'si';
export type W1dCauseKey = 'il' | 'it';
export const W1D_KEYS: W1dKey[] = ['il', 'ee', 'it', 'hu', 'si'];
export const W1D_SLUG: Record<W1dKey, string> = { il: 'israel', ee: 'estonia', it: 'italy', hu: 'hungary', si: 'slovenia' };

export interface W1dPeriod {
  label: string;
  record: number | null;
  values: Record<string, string | null>;
  [key: string]: any;
}
export interface W1dDossier {
  id: string;
  name: string;
  record: number | null;
  facts: Record<string, any>;
  labels: string[];
  periods: W1dPeriod[];
}

// URL slugs and Charitology's English glosses for the Registrar of Amutot activity sectors. The page always shows the
// Hebrew label exactly as published; the gloss is marked as a translation and the slug is only an address.
export const IL_SECTOR_GLOSS: Record<string, [string, string]> = {
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
// Charitology's English names for the Italian 5 per mille list columns (the column headers are shown as published).
export const IT_CATEGORY_GLOSS: Record<string, string> = {
  ETS: 'Third-sector entities',
  ASD: 'Amateur sports associations',
  'Ricerca scientifica': 'Scientific and university research',
  'Ricerca sanitaria': 'Health research',
  Comuni: 'Municipalities',
  'Beni culturali e paesaggistici': 'Cultural and landscape heritage',
  'Enti Gestori aree protette': 'Managers of protected areas',
};
export const SI_SECTION_GLOSS: Record<string, string> = {
  '1': 'non-governmental organizations in the public interest',
  '2': 'registered churches and other religious communities',
  '3': 'constituent parts of registered churches and other religious communities',
  '4': 'representative trade unions',
  '5': 'political parties',
  '6': 'schools and kindergartens',
};

function readVerified(name: string, sha256?: string) {
  const bytes = readFileSync(join(ROOT, name));
  if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error(`Wave 1d data file changed without a rebuilt manifest: ${name}`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
function grouped(value: string) {
  const negative = value.startsWith('-');
  const [whole, frac] = value.replace('-', '').split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { negative, text: frac !== undefined ? `${digits}.${frac}` : digits };
}
/** A published amount with its currency: digits grouped, every published decimal kept. */
const money = (prefix: string) => (value: string) => {
  const { negative, text } = grouped(value);
  return `${negative ? '−' : ''}${prefix}${text}`;
};
export const plainNumber = (value: string) => grouped(value).text;
const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const tally = <T,>(items: T[], key: (item: T) => string | null | undefined) => {
  const counter = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== null && k !== undefined && k !== '') counter.set(k, (counter.get(k) ?? 0) + 1);
  }
  return counter;
};
const top = (counter: Map<string, number>, n: number) => [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
const optionalDay = (value: string | null | undefined) => (value ? dayLabel(value) : 'Not supplied');
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

export interface W1dLine { key: string; label: string; ref: string; kind: 'money' | 'count' }
export interface W1dFact { label: string; value: string; links?: { text: string; href: string }[] }
interface Def {
  key: W1dKey;
  country: string;
  slug: string;
  segment: string;
  register: string;
  publisher: string;
  idLabel: string;
  idProperty: string;
  identityCode: string;
  money: (value: string) => string;
  moneyNote: string;
  lines: W1dLine[];
  periodNoun: string;
  periodHeading: (p: W1dPeriod) => string;
  periodSub: (p: W1dPeriod) => string | null;
  thresholdText: string;
  titleOf: (d: W1dDossier) => string;
  entryUrl: (d: W1dDossier) => string | null;
  entryName: string;
  recordPage: string;
  licence: string;
  attribution: string;
  labelNoun?: string;
  labelPlural?: string;
  hubSegment?: string;
  labelSlugOf?: (label: string) => string;
  labelDisplay?: (label: string) => string;
  extractNote: string;
}

function load() {
  const manifest = readVerified('manifest.json');
  if (manifest.format !== 'charitology-registry-wave1d-v1') throw new Error('Unexpected Wave 1d manifest.');
  const out = manifest.outputs;
  const dossiers = Object.fromEntries(W1D_KEYS.map((k) => [k, readVerified(out[k].path, out[k].sha256) as W1dDossier[]])) as Record<W1dKey, W1dDossier[]>;
  const counts = Object.fromEntries(W1D_KEYS.map((k) => [k, readVerified(out[`${k}Counts`].path, out[`${k}Counts`].sha256)])) as Record<W1dKey, any>;
  const causes = readVerified(out.causes.path, out.causes.sha256);
  return { manifest, dossiers, counts, causes };
}

let cached: ReturnType<typeof model> | undefined;
export function wave1d() {
  return (cached ??= model());
}

function model() {
  const { manifest, dossiers, counts, causes } = load();
  const sel = manifest.selection;
  const src = manifest.sources;
  const th = (k: W1dKey) => sel[k].threshold.value as string;
  const eur = money('€');
  const ils = money('₪');
  const huf = money('HUF ');
  const ilGloss = (label: string) => IL_SECTOR_GLOSS[label]?.[1] ?? label;
  const ilDisplay = (label: string) => `${label} (${ilGloss(label)})`;

  const D: Record<W1dKey, Def> = {
    il: {
      key: 'il', country: 'Israel', slug: 'israel', segment: 'amuta', register: 'Registrar of Amutot dataset',
      publisher: 'the Israel Ministry of Justice (Registrar of Amutot)', idLabel: 'Amuta number', idProperty: 'Israeli Registrar of Amutot registration number',
      identityCode: 'Amutot', money: ils, moneyNote: 'New Israeli shekels, as published in the Registrar of Amutot dataset on data.gov.il, decimals included',
      lines: [
        { key: 'revenue', label: 'Revenue (financial turnover)', ref: 'Field “מחזור כספי (הכנסות)”', kind: 'money' },
        { key: 'expenses', label: 'Total expenses', ref: 'Field “סך הוצאות העמותה”', kind: 'money' },
      ],
      periodNoun: 'financial report', periodHeading: (p) => `Financial report ${p.label}`, periodSub: (p) => `Datastore record ${count(p.record!)}`,
      thresholdText: `revenue of at least ${ils(th('il'))} in its latest financial report`,
      titleOf: (d) => `${d.name}: Registrar of Amutot dossier (${d.id})`,
      entryUrl: (d) => `https://www.guidestar.org.il/organization/${d.id}`, entryName: 'Ministry of Justice GuideStar entry',
      recordPage: '/record/charity-index/israel/', licence: 'https://data.gov.il/terms',
      attribution: 'Data from the Israel Ministry of Justice (Registrar of Amutot) via data.gov.il, under the data.gov.il terms of use.',
      labelNoun: 'activity sector', labelPlural: 'activity sectors', hubSegment: 'sectors',
      labelSlugOf: (l) => IL_SECTOR_GLOSS[l][0], labelDisplay: ilDisplay,
      extractNote: 'every datastore record of resource be5b7935 (record number, status, sector and revenue as published), with all kept fields of the records at or above the threshold',
    },
    ee: {
      key: 'ee', country: 'Estonia', slug: 'estonia', segment: 'org', register: 'e-Business Register annual reports',
      publisher: 'the Centre of Registers and Information Systems (RIK) and the Estonian Tax and Customs Board (EMTA)', idLabel: 'Registry code',
      idProperty: 'Estonian e-Business Register registry code (registrikood)', identityCode: 'RIK',
      money: eur, moneyNote: 'Euros, exactly as the e-Business Register open data file prints them, including the decimal place it prints',
      lines: [
        { key: 'TotalRevenue', label: 'Total revenue', ref: 'Tulemiaruanne: Tulud (TotalRevenue)', kind: 'money' },
        { key: 'BusinessIncome', label: 'Income from business activities', ref: 'Tulemiaruanne: Tulu ettevõtlusest (BusinessIncome)', kind: 'money' },
        { key: 'SurplusDeficitFromOperatingActivities', label: 'Surplus or deficit from main activities', ref: 'Tulemiaruanne: Põhitegevuse tulem', kind: 'money' },
        { key: 'NetSurplusDeficitForPeriod', label: 'Surplus or deficit for the year', ref: 'Tulemiaruanne: Aruandeaasta tulem', kind: 'money' },
        { key: 'Assets', label: 'Total assets', ref: 'Balance sheet: Varad (Assets)', kind: 'money' },
        { key: 'NetAssets', label: 'Net assets', ref: 'Balance sheet: Netovara (NetAssets)', kind: 'money' },
      ],
      periodNoun: 'annual report', periodHeading: (p) => `Annual report ${p.label}`, periodSub: (p) => `Report ${p.record}`,
      thresholdText: `total revenue (Tulud) of at least ${eur(th('ee'))} in its latest annual report for 2025 or 2024`,
      titleOf: (d) => `${d.name}: e-Business Register annual report dossier (${d.id})`,
      entryUrl: (d) => d.facts.link, entryName: 'e-Business Register entry',
      recordPage: '/record/charity-index/estonia/', licence: 'https://avaandmed.ariregister.rik.ee/en/downloading-open-data',
      attribution: 'Data from the Estonian e-Business Register open data (RIK) and the Estonian Tax and Customs Board list of associations eligible for income tax incentives.',
      extractNote: 'the EMTA list rows, the register entries of those organizations, their 2024 and 2025 report metadata and the six published report elements shown here',
    },
    it: {
      key: 'it', country: 'Italy', slug: 'italy', segment: 'cf', register: '5 per mille list of admitted beneficiaries (AF 2025)',
      publisher: 'Agenzia delle Entrate', idLabel: 'Codice fiscale', idProperty: 'Italian tax code (codice fiscale)', identityCode: '5×1000',
      money: eur, moneyNote: 'Euros, exactly as the Agenzia delle Entrate list prints them (decimals as published)',
      lines: [
        { key: 'choices', label: 'Number of choices', ref: 'Column “Numero scelte”', kind: 'count' },
        { key: 'expressed', label: 'Amount of the expressed choices', ref: 'Column “Importo delle scelte espresse”', kind: 'money' },
        { key: 'generic', label: 'Proportional amount for generic choices', ref: 'Column “Importo proporzionale per le scelte generiche”', kind: 'money' },
        { key: 'under100', label: 'Proportional amount from redistributed amounts under €100', ref: 'Column “Importo proporzionale per ripartizione importi inferiori a 100 euro”', kind: 'money' },
        { key: 'total', label: 'Total amount payable', ref: 'Column “Importo totale erogabile”', kind: 'money' },
      ],
      periodNoun: 'financial year', periodHeading: () => 'Financial year 2025 (AF 2025)', periodSub: (p) => `Prog ${count(p.record!)}, part ${p.part} of 7`,
      thresholdText: `a total amount payable (Importo totale erogabile) of at least ${eur(th('it'))} in the AF 2025 list`,
      titleOf: (d) => `${d.name}: 5 per mille AF 2025 dossier (codice fiscale ${d.id})`,
      entryUrl: () => null, entryName: '',
      recordPage: '/record/charity-index/italy/', licence: 'https://www.agenziaentrate.gov.it/portale/elenco-complessivo-degli-enti-ammessi-in-una-o-pi%C3%B9-categorie-di-beneficiari1',
      attribution: 'Information published by the Agenzia delle Entrate (Italian Revenue Agency).',
      labelNoun: 'beneficiary category', labelPlural: 'beneficiary categories', hubSegment: 'categories',
      labelSlugOf: (l) => labelSlug(l), labelDisplay: (l) => `${l} (${IT_CATEGORY_GLOSS[l] ?? l})`,
      extractNote: 'every row’s Prog number, category columns and total amount, with every cell of the rows at or above the threshold',
    },
    hu: {
      key: 'hu', country: 'Hungary', slug: 'hungary', segment: 'adoszam', register: 'NAV lists of civil beneficiaries of the 1% personal income tax assignment',
      publisher: 'Nemzeti Adó- és Vámhivatal (NAV)', idLabel: 'Tax number', idProperty: 'Hungarian tax number (adószám), first eight digits', identityCode: 'SZJA 1%',
      money: huf, moneyNote: 'Hungarian forints, as listed by NAV',
      lines: [
        { key: 'amount', label: 'Amount assigned', ref: 'Column “Felajánlott összeg (Ft)”', kind: 'money' },
        { key: 'donors', label: 'Taxpayers who assigned it', ref: 'Column “Felajánlók száma (fő)”', kind: 'count' },
      ],
      periodNoun: 'list year', periodHeading: (p) => `List year ${p.label}`, periodSub: (p) => (p.record === null ? null : `Sorszám ${count(p.record)}`),
      thresholdText: `at least ${huf(th('hu'))} assigned in NAV’s 2026 list`,
      titleOf: (d) => `${d.name}: NAV 1% tax assignment dossier (tax number ${d.id})`,
      entryUrl: () => null, entryName: '',
      recordPage: '/record/charity-index/hungary/', licence: 'https://nav.gov.hu/ado/szja1_1',
      attribution: 'Information published by the Hungarian National Tax and Customs Administration (NAV).',
      extractNote: 'every row’s Sorszám, tax number and amount in the 2024, 2025 and 2026 lists, with every published cell except the address for the organizations above the threshold',
    },
    si: {
      key: 'si', country: 'Slovenia', slug: 'slovenia', segment: 'davcna', register: 'FURS lists of recipients of the income tax donation',
      publisher: 'Finančna uprava Republike Slovenije (FURS)', idLabel: 'Tax number', idProperty: 'Slovenian tax number (davčna številka)', identityCode: 'Dohodnina',
      money: eur, moneyNote: 'Euros to the cent, as stored in the FURS workbooks',
      lines: [
        { key: 'amount', label: 'Amount donated', ref: 'Column “ZNESEK_DON”', kind: 'money' },
        { key: 'donors', label: 'Taxpayers who donated', ref: 'Column “STEVILO_DON”', kind: 'count' },
      ],
      periodNoun: 'tax year', periodHeading: (p) => `Tax year ${p.label}`, periodSub: (p) => (p.record === null ? null : `Worksheet row ${count(p.record)}`),
      thresholdText: `at least ${eur(th('si'))} donated in the 2025 list, as a recipient in section 1 of the Government’s 2025 list of eligible recipients`,
      titleOf: (d) => `${d.name}: Slovenian income tax donation dossier (tax number ${d.id})`,
      entryUrl: () => null, entryName: '',
      recordPage: '/record/charity-index/slovenia/', licence: 'https://podatki.gov.si/dataset/prejemniki-namenitve-dela-dohodnine-za-donacije',
      attribution: 'Information published by the Financial Administration of the Republic of Slovenia (FURS) and the Government of Slovenia (Uradni list RS).',
      extractNote: 'every row of the 2023, 2024 and 2025 FURS workbooks and the section of every tax number in the Government’s 2025 list',
    },
  };

  const sorted = Object.fromEntries(W1D_KEYS.map((k) => [k, [...dossiers[k]].sort(byName)])) as Record<W1dKey, W1dDossier[]>;
  const base = (k: W1dKey) => `${WAVE1_BASE}${D[k].slug}/`;
  const dossierPath = (k: W1dKey, d: W1dDossier) => `${base(k)}${D[k].segment}/${d.id.toLowerCase()}/`;
  const hubMin: number = sel.hubMinimumDossiers;
  const labelMaps = Object.fromEntries(W1D_KEYS.map((k) => {
    const map = new Map<string, W1dDossier[]>();
    for (const d of sorted[k]) for (const l of d.labels) map.set(l, [...(map.get(l) ?? []), d]);
    return [k, map];
  })) as Record<W1dKey, Map<string, W1dDossier[]>>;
  const hubKeys = Object.fromEntries(W1D_KEYS.map((k) => [k, D[k].hubSegment
    ? [...labelMaps[k]].filter(([, v]) => v.length >= hubMin).map(([l]) => l).sort((a, b) => D[k].labelSlugOf!(a).localeCompare(D[k].labelSlugOf!(b)))
    : []])) as Record<W1dKey, string[]>;
  const hubPath = (k: W1dKey, label: string) => `${base(k)}${D[k].hubSegment}/${D[k].labelSlugOf!(label)}/`;
  const hubTitle = (k: W1dKey, label: string) => `${D[k].labelDisplay!(label)}: ${D[k].country} charity dossiers`;
  const latest = (d: W1dDossier) => d.periods[0];
  const editionDate = Object.fromEntries(W1D_KEYS.map((k) => [k, Object.values(src[k] as Record<string, any>).map((s) => s.retrievedAt as string).sort().at(-1)!.slice(0, 10)])) as Record<W1dKey, string>;

  function cell(k: W1dKey, p: W1dPeriod, line: string): string {
    if (k === 'si' && p.multipleRows) return 'Not shown: the list prints this tax number on more than one row';
    if (k === 'il' && line === 'expenses' && p.expensesPublishedZero) return 'Not supplied (the dataset prints 0, which it also uses for a blank)';
    const v = p.values[line];
    if (v === null || v === undefined) return 'Not supplied';
    if (k === 'si' && line === 'donors' && v === 'manj kot 5') return 'Fewer than 5 (“manj kot 5”)';
    const def = D[k].lines.find((l) => l.key === line)!;
    return def.kind === 'count' ? plainNumber(v) : D[k].money(v);
  }

  // ---------- Facts shown in each dossier's register record ----------
  function facts(k: W1dKey, d: W1dDossier): W1dFact[] {
    const f = d.facts;
    switch (k) {
      case 'il':
        return [
          { label: 'Amuta number', value: d.id }, { label: 'Name (Hebrew, as registered)', value: d.name },
          { label: 'English name', value: f.enName ?? 'Not supplied' }, { label: 'Status', value: f.status },
          { label: 'Date registered', value: optionalDay(f.registered) },
          { label: 'Activity sector', value: f.sector ? ilDisplay(f.sector) : 'Not supplied', links: f.sector ? [{ text: ilDisplay(f.sector), href: hubKeys.il.includes(f.sector) ? hubPath('il', f.sector) : '' }] : undefined },
          { label: 'Secondary field', value: f.secondary ?? 'Not supplied' }, { label: 'City', value: f.city ?? 'Not supplied' },
          { label: 'Latest reporting year', value: f.lastReportYear ?? 'Not supplied' },
        ];
      case 'ee':
        return [
          { label: 'Registry code', value: d.id }, { label: 'Name', value: d.name }, { label: 'Legal form', value: f.subform ? `${f.legalForm} (${f.subform})` : f.legalForm },
          { label: 'Register status', value: f.status }, { label: 'First entered in the register', value: optionalDay(f.firstEntry) },
          { label: 'Location', value: f.location ?? 'Not supplied' },
          { label: 'EMTA income tax incentive list', value: (f.emtaEntries as any[]).map((e) => `listed since ${dayLabel(e.since)} as “${e.name}”, ${e.county}, ${e.place}`).join('; ') },
        ];
      case 'it': {
        const flagged = Object.entries(f.flags as Record<string, string>).filter(([, v]) => v);
        return [
          { label: 'Codice fiscale', value: d.id }, { label: 'Name (Denominazione)', value: d.name },
          { label: 'Region', value: f.region ?? 'Not supplied' }, { label: 'Province', value: f.province ?? 'Not supplied' }, { label: 'Comune', value: f.comune ?? 'Not supplied' },
          { label: 'Beneficiary categories', value: flagged.map(([c, v]) => `${c} (${v})`).join('; '),
            links: flagged.map(([c, v]) => ({ text: `${c} (${v})`, href: hubKeys.it.includes(c) ? hubPath('it', c) : '' })) },
          { label: 'List file', value: `Part ${f.part} of 7, Prog ${count(d.record!)}` },
        ];
      }
      case 'hu':
        return [
          { label: 'Tax number (first eight digits)', value: d.id }, { label: 'Name in the 2026 list', value: d.name },
          { label: 'VAT code and county code', value: `${f.vatCode} and ${f.countyCode}, as printed beside the tax number in the 2026 list` },
          { label: 'Lists with this tax number', value: f.listedYears.join('; ') },
        ];
      case 'si':
        return [
          { label: 'Tax number', value: d.id }, { label: 'Name in the 2025 list', value: d.name },
          { label: 'Section of the 2025 eligible list', value: (f.sections as number[]).map((s) => `${s} (${SI_SECTION_GLOSS[String(s)]})`).join('; ') },
        ];
    }
  }

  // ---------- Dossier FAQs (six, all from the record) ----------
  function dossierFaqs(k: W1dKey, d: W1dDossier): FaqEntry[] {
    const p = latest(d);
    const f = d.facts;
    const def = D[k];
    switch (k) {
      case 'il': return [
        { question: `What registration number does the Registrar of Amutot list for ${d.name}?`, answer: `${d.id}. The dataset retrieved ${dayLabel(editionDate.il)} lists the amuta with the status “${f.status}”${f.registered ? ` and a registration date of ${dayLabel(f.registered)}` : ''} (datastore record ${count(d.record!)}).` },
        { question: `What revenue did ${d.name} report in its latest financial report?`, answer: `${cell('il', p, 'revenue')}, for the financial report year ${p.label}, in the field “מחזור כספי (הכנסות)”, copied with its published decimals.` },
        { question: 'What total expenses does the dataset give?', answer: p.expensesPublishedZero ? 'None that can be shown. The field “סך הוצאות העמותה” prints 0 for this amuta, and the dataset prints 0 for most amutot that report revenue, so a 0 there cannot be told apart from a blank.' : `${cell('il', p, 'expenses')}, in the field “סך הוצאות העמותה”.` },
        { question: `Which activity sector does the register give ${d.name}?`, answer: f.sector ? `“${f.sector}” (${ilGloss(f.sector)}, Charitology’s translation)${f.secondary ? `, with the secondary field “${f.secondary}”` : ''}.` : 'The dataset gives no activity sector for this amuta.' },
        { question: 'Where is the amuta registered?', answer: f.city ? `${f.city}, according to the address city in the dataset. Street addresses are omitted here.` : 'The dataset gives no city for this amuta.' },
        { question: 'Why is this amuta in the Wave 1d dossiers?', answer: `Its latest financial report shows ${def.thresholdText.replace(' in its latest financial report', '')}, and its status is “${f.status}”. The threshold is a coverage boundary, not an assessment of the organization.` },
      ];
      case 'ee': {
        const years = d.periods.map((x) => x.label);
        return [
          { question: `What registry code does the e-Business Register give ${d.name}?`, answer: `${d.id}. The register lists it as a ${midSentence(f.legalForm)}${f.subform ? ` (${f.subform})` : ''} with the status “${f.status}”${f.firstEntry ? `, first entered on ${dayLabel(f.firstEntry)}` : ''}.` },
          { question: `What total revenue did ${d.name} report for ${p.label}?`, answer: `${cell('ee', p, 'TotalRevenue')}, the element Tulud (TotalRevenue) of the ${p.incomeTable ?? 'income statement'} in annual report ${p.record}${p.periodStart && p.periodEnd ? `, covering ${dayLabel(p.periodStart)} to ${dayLabel(p.periodEnd)}` : ''}.` },
          { question: 'What surplus or deficit did the annual report show?', answer: `Surplus or deficit for the year (Aruandeaasta tulem): ${cell('ee', p, 'NetSurplusDeficitForPeriod')}. From main activities (Põhitegevuse tulem): ${cell('ee', p, 'SurplusDeficitFromOperatingActivities')}.` },
          { question: 'What assets did the balance sheet show?', answer: `Total assets (Varad): ${cell('ee', p, 'Assets')}. Net assets (Netovara): ${cell('ee', p, 'NetAssets')}.${p.balanceTable ? ` Both come from the table “${p.balanceTable}”.` : ''}` },
          { question: `Is ${d.name} on the EMTA list of associations eligible for income tax incentives?`, answer: `Yes. ${(f.emtaEntries as any[]).map((e) => `The list dated ${counts.ee.emtaAsOf} includes it since ${dayLabel(e.since)} as “${e.name}”.`).join(' ')} Donations to listed organizations qualify for income tax incentives.` },
          { question: 'How many annual reports does this dossier include?', answer: `${plural(years.length, 'annual report')}: ${list(years)}. ${p.audited === 'Jah' ? `The ${p.label} report is marked as audited.` : `The ${p.label} report is not marked as audited.`}` },
        ];
      }
      case 'it': {
        const flagged = Object.entries(f.flags as Record<string, string>).filter(([, v]) => v);
        return [
          { question: `What codice fiscale does the 5 per mille list give ${d.name}?`, answer: `${d.id}. The AF 2025 list of admitted beneficiaries, updated 5 November 2026, prints it at Prog ${count(d.record!)} in part ${f.part} of 7, in ${f.comune ?? 'no stated comune'}${f.province ? ` (${f.province})` : ''}.` },
          { question: `How many taxpayers chose ${d.name}?`, answer: `${cell('it', p, 'choices')} choices, in the column “Numero scelte”.` },
          { question: 'What total amount is payable?', answer: `${cell('it', p, 'total')}, in the column “Importo totale erogabile”. It is the list’s own total for this row; Charitology adds nothing to it.` },
          { question: 'How is the total made up?', answer: `Expressed choices: ${cell('it', p, 'expressed')}. Generic choices: ${cell('it', p, 'generic')}. Redistributed amounts under €100: ${cell('it', p, 'under100')}.` },
          { question: `Which beneficiary categories is ${d.name} admitted in?`, answer: `${list(flagged.map(([c, v]) => `${c} (${IT_CATEGORY_GLOSS[c]}), marked “${v}”`))}.${flagged.some(([, v]) => v === 'R') ? ' In the ETS column, “R” marks a former ONLUS admitted with reservation while its registration in the national third-sector register (RUNTS) is decided.' : ''} The list publishes one row per entity, so a single amount covers every category it is admitted in.` },
          { question: 'Why is this entity in the Wave 1d dossiers?', answer: `Its row shows ${def.thresholdText.replace(' in the AF 2025 list', '')}. Entities admitted only as municipalities (the Comuni column) are left out. The threshold is a coverage boundary, not an assessment.` },
        ];
      }
      case 'hu': {
        const listed = d.periods.filter((x) => x.values.amount !== null);
        const prev = d.periods[1];
        return [
          { question: `What tax number does NAV list for ${d.name}?`, answer: `${d.id}, with the VAT code ${f.vatCode} and county code ${f.countyCode} printed beside it, at Sorszám ${count(d.record!)} of NAV’s 2026 list of civil beneficiaries.` },
          { question: `How much was assigned to ${d.name} in the 2026 list?`, answer: `${cell('hu', p, 'amount')}, in the column “Felajánlott összeg (Ft)”.` },
          { question: 'How many taxpayers assigned it?', answer: `${cell('hu', p, 'donors')} taxpayers in the 2026 list, in the column “Felajánlók száma (fő)”.` },
          { question: 'What did the 2025 list show?', answer: prev.values.amount === null ? 'The organization does not appear in the 2025 list.' : `${cell('hu', prev, 'amount')} from ${cell('hu', prev, 'donors')} taxpayers.` },
          { question: `In how many of the 2024 to 2026 lists does ${d.name} appear?`, answer: `${count(listed.length)} of 3: ${list(listed.map((x) => x.label))}.` },
          { question: 'What is the 1% assignment?', answer: 'Hungarian taxpayers can assign 1% of their personal income tax to a registered civil organization. NAV publishes the amount and the number of taxpayers for each beneficiary by the year of the assignment.' },
        ];
      }
      case 'si': {
        const listed = d.periods.filter((x) => x.values.amount !== null);
        const sections = f.sections as number[];
        return [
          { question: `What tax number does FURS list for ${d.name}?`, answer: `${d.id}, at worksheet row ${count(d.record!)} of the 2025 list of recipients of the income tax donation.` },
          { question: `How much was donated to ${d.name} for 2025?`, answer: `${cell('si', p, 'amount')}, in the column ZNESEK_DON of the preliminary 2025 list.` },
          { question: 'How many taxpayers donated?', answer: `${cell('si', p, 'donors')} for 2025, in the column STEVILO_DON.` },
          { question: `How is ${d.name} classified in the Government’s 2025 list of eligible recipients?`, answer: `In section ${list(sections.map(String))}: ${list(sections.map((s) => SI_SECTION_GLOSS[String(s)]))}.${sections.length > 1 ? ' The list prints the tax number in more than one section; Wave 1d includes it because section 1 lists it.' : ''}` },
          { question: `In how many of the 2023 to 2025 lists does ${d.name} have an amount shown here?`, answer: `${count(listed.length)} of 3: ${list(listed.map((x) => x.label))}.` },
          { question: 'Why are political parties not in these dossiers?', answer: 'The Government’s list of eligible recipients puts political parties, representative trade unions, churches and other religious communities and their parts, and schools and kindergartens in their own sections. Wave 1d covers only recipients in section 1, non-governmental organizations in the public interest.' },
        ];
      }
    }
  }

  // ---------- Hub FAQs (Israel sectors, Italy categories) ----------
  function hubFaqs(k: W1dKey, label: string): FaqEntry[] {
    const def = D[k];
    const items = labelMaps[k].get(label)!;
    const display = def.labelDisplay!(label);
    const editionCount = counts[k].labels[label];
    const others = top(tally(items.flatMap((d) => d.labels.filter((x) => x !== label)), (x) => x), 3);
    const places = top(tally(items, (d) => (k === 'il' ? d.facts.city : d.facts.region)), 3);
    return [
      { question: `How many organizations carry the ${def.labelNoun} “${label}”?`, answer: k === 'il' ? `${count(editionCount)} amutot with the status “רשומה” or “פעילה” in the dataset retrieved ${dayLabel(editionDate.il)}.` : `${count(editionCount)} rows of the AF 2025 list carry a mark in the column “${label}”.` },
      { question: 'How many of them have a Wave 1d dossier?', answer: `${count(items.length)}: every one whose record shows ${def.thresholdText}. They are listed alphabetically below.` },
      { question: k === 'il' ? 'What does the label mean?' : `Which other ${def.labelPlural} do these entities carry?`, answer: k === 'il' ? `“${label}” is the register’s activity sector (סיווג פעילות ענפי). Charitology’s English translation is “${ilGloss(label)}”; the Hebrew label is the published one.` : others.length ? `${list(others.map(([l, n]) => `${l} (${count(n)})`))}.` : 'None of these dossiers carries another category.' },
      { question: 'Which period do the figures cover?', answer: k === 'il' ? `Each dossier shows its latest financial report; the report years here run ${list([...new Set(items.map((d) => latest(d).label))].sort())}.` : 'The AF 2025 list (5 per mille of the 2025 financial year), updated by the Agenzia delle Entrate on 5 November 2026.' },
      { question: 'Where are these organizations based?', answer: places.length ? `${list(places.map(([pl, n]) => `${pl} (${count(n)})`))}, by the ${k === 'il' ? 'city in the dataset' : 'region in the list'}.` : 'None of these records gives a place.' },
      { question: 'Is this a ranking?', answer: `No. The hub lists dossiers alphabetically and copies each figure as published by ${def.publisher}. Charitology adds no rating, score or ranking, and never adds figures across organizations.` },
    ];
  }

  // ---------- Country index FAQs ----------
  const exclusionText = (k: W1dKey, reason: string) => {
    if (k === 'il') return `status “${reason}”`;
    return ({
      notEntered: 'register status other than “Registrisse kantud” (entered in the register)', notInRegister: 'no entry in the register’s entity file',
      municipalityOnly: 'admission only in the Comuni (municipalities) column', multipleRows: 'a tax number printed on more than one row of the 2025 list',
      section2: `listing in section 2 of the eligible list (${SI_SECTION_GLOSS['2']})`, section3: `listing in section 3 (${SI_SECTION_GLOSS['3']})`,
      section4: `listing in section 4 (${SI_SECTION_GLOSS['4']})`, section5: `listing in section 5 (${SI_SECTION_GLOSS['5']})`, section6: `listing in section 6 (${SI_SECTION_GLOSS['6']})`,
      notListed: 'no listing in the Government’s 2025 list',
    } as Record<string, string>)[reason] ?? reason;
  };
  function indexFaqs(k: W1dKey): FaqEntry[] {
    const def = D[k];
    const s = sel[k];
    const items = sorted[k];
    const c = counts[k];
    const excluded = Object.entries(s.excluded as Record<string, string[]>).filter(([, v]) => v.length);
    const populations: Record<W1dKey, () => string> = {
      il: () => `${count(c.editionOrganizations)} amutot, ${count(c.withRevenue)} of them with a published revenue figure`,
      ee: () => `${count(c.emtaOrganizations)} organizations on the EMTA list dated ${c.emtaAsOf} (${count(c.emtaRows)} printed rows), ${count(c.withReport['2025'])} of them with a 2025 annual report in the register file`,
      it: () => `${count(c.editionOrganizations)} admitted entities, ${count(c.withTotal)} of them with a total amount payable`,
      hu: () => `${count(c.recipients['2026'])} civil beneficiaries in the 2026 list (${count(c.recipients['2025'])} in 2025 and ${count(c.recipients['2024'])} in 2024)`,
      si: () => `${count(c.recipients['2025'])} recipients in the 2025 list, ${count(c.recipientsBySection2025['1'])} of them in section 1 of the Government’s list`,
    };
    const population = { [k]: populations[k]() } as Record<W1dKey, string>;
    const labels = def.hubSegment ? top(tally(items.flatMap((d) => d.labels), (x) => x), 3) : [];
    const periods = [...new Set(items.flatMap((d) => d.periods.map((p) => p.label)))].sort();
    return [
      { question: `How many ${def.country} organizations have a Wave 1d dossier?`, answer: `${count(items.length)}. The files list ${population[k]}. ${count(s.candidates)} of these records qualify, each reporting ${def.thresholdText}.${excluded.length ? ` Left out, with no dossier: ${list(excluded.map(([r, v]) => `${count(v.length)} for ${exclusionText(k, r)}`))}.` : ' Every one of them has a dossier.'}` },
      { question: 'Which official files supply the records?', answer: `${list(Object.values(src[k] as Record<string, any>).slice(0, 3).map((x) => `“${x.title}”`))}${Object.keys(src[k]).length > 3 ? ` and ${count(Object.keys(src[k]).length - 3)} more` : ''}, from ${def.publisher}, retrieved by ${dayLabel(editionDate[k])}. The Wave 1d manifest lists every file with its URL, size, retrieval time and SHA-256 fingerprint.` },
      { question: 'What does Charitology keep from those files?', answer: `A compact extract: ${def.extractNote}. Each value is the text the official file prints, and the dossiers are rebuilt from the extract by a checked script.` },
      labels.length
        ? { question: `Which ${def.labelPlural} do the dossier organizations carry most often?`, answer: `${list(labels.map(([l, n]) => `“${def.labelDisplay!(l)}” (${count(n)})`))}.` }
        : { question: 'Does the official file carry category labels?', answer: `No. ${k === 'ee' ? 'The register files carry activity codes without their names, and the EMTA list has no category field' : k === 'hu' ? 'NAV’s lists give the name, tax number, address, amount and number of taxpayers only' : 'The FURS lists give the tax number, name, amount and number of donors only; the Government’s list sections are used to choose recipients, not as cause labels'}, so ${def.country} has no cause hubs and no column on the Cause × Country page.` },
      { question: 'Which periods do the figures cover?', answer: `${list(periods)}. Each dossier shows every ${def.periodNoun} the files hold for it, with its source record; years without a value read “Not supplied”.` },
      { question: 'Does Charitology rate or rank these organizations?', answer: 'No. Dossiers are listed alphabetically, figures are copied as published, and Charitology computes no ratio, score, total or estimate from them.' },
    ];
  }

  // ---------- Cause × Country (Wave 1d registers) ----------
  const CAUSE_KEYS: W1dCauseKey[] = causes.registers;
  const causeName: Record<W1dCauseKey, string> = { il: 'Israel', it: 'Italy' };
  const causeClassification: Record<W1dCauseKey, string> = { il: 'Registrar of Amutot activity sector', it: '5 per mille beneficiary category' };
  const causeDisplay = (r: W1dCauseKey, key: string) => D[r].labelDisplay!(key);
  const causeCount = (r: W1dCauseKey, key: string) => (labelMaps[r].get(key) ?? []).length;
  const causeHub = (r: W1dCauseKey, key: string): string | null => (hubKeys[r].includes(key) ? hubPath(r, key) : null);

  function dossierIndexText() {
    const total = W1D_KEYS.reduce((n, k) => n + sorted[k].length, 0);
    return { total, text: `Wave 1d adds ${count(total)} dossiers from ${list(W1D_KEYS.map((k) => `${D[k].country} (${count(sorted[k].length)})`))}, rebuilt from the official downloads.` };
  }

  return {
    manifest, sel, src, counts, causes, D, hubMin, sorted, labelMaps, hubKeys, editionDate,
    base, dossierPath, hubPath, hubTitle, latest, cell, facts, dossierFaqs, hubFaqs, indexFaqs, exclusionText, dossierIndexText,
    CAUSE_KEYS, causeName, causeClassification, causeDisplay, causeCount, causeHub, ilGloss,
  };
}

export type Wave1d = ReturnType<typeof model>;

/** Every Wave 1d page, for pages.ts and the partitioned sitemap. */
export function wave1dPages() {
  const w = wave1d();
  const hubs: { path: string; title: string }[] = [];
  for (const k of W1D_KEYS) {
    hubs.push({ path: w.base(k), title: `${w.D[k].country} charity dossiers: ${w.D[k].register}` });
    for (const l of w.hubKeys[k]) hubs.push({ path: w.hubPath(k, l), title: w.hubTitle(k, l) });
  }
  return [
    ...hubs.map((h) => ({ ...h, section: 'Verified registry hubs, Wave 1d' })),
    ...W1D_KEYS.flatMap((k) => w.sorted[k].map((d) => ({ path: w.dossierPath(k, d), title: w.D[k].titleOf(d), section: 'Verified charity dossiers, Wave 1d' }))),
  ];
}

/** Static paths for one country's dossiers and hubs (src/pages/record/charity-dossiers/{country}/[group]/[slug].astro). */
export function wave1dCountryPaths(k: W1dKey) {
  const w = wave1d();
  const split = (path: string) => {
    const [group, slug] = path.slice(w.base(k).length).split('/');
    return { group, slug };
  };
  const paths = [
    ...w.sorted[k].map((d) => ({ params: split(w.dossierPath(k, d)), props: { kind: 'dossier' as const, k, id: d.id } })),
    ...w.hubKeys[k].map((label) => ({ params: split(w.hubPath(k, label)), props: { kind: 'hub' as const, k, label } })),
  ];
  const seen = new Set<string>();
  for (const p of paths) {
    const id = `${p.params.group}/${p.params.slug}`;
    if (seen.has(id)) throw new Error(`Duplicate Wave 1d route ${k} ${id}`);
    seen.add(id);
  }
  return paths;
}
