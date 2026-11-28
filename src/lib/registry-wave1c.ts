// Build-only loader and page model for the Wave 1c verified charity dossiers and
// registry hubs: the national registers already validated by check:references.
// Every figure is copied from the committed, hash-pinned dataset built by
// scripts/build-registry-wave1c.py from committed official editions. Nothing here
// estimates, scores, ranks or rates an organization. Missing stays missing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FaqEntry } from './structured-data';
import { count, dayLabel, gbp, WAVE1_BASE } from './registry-wave1';
import { sentence } from './registry-wave1b';

const ROOT = resolve('public/data/registry-wave1c');
export const WAVE1C_DATA_PATH = '/data/registry-wave1c/';
export const WAVE1C_SITEMAP = 'sitemap-registries-wave1c.xml';
export const WAVE1C_SITEMAP_SECTIONS = new Set(['Verified charity dossiers, Wave 1c', 'Verified registry hubs, Wave 1c']);

export type DossierKey = 'nz' | 'ni' | 'jp' | 'se' | 'mx' | 'sk' | 'pl';
export type HubKey = 'at' | 'fi' | 'lv' | 'dk' | 'hr';
export type CauseKey = 'ni' | 'se' | 'mx' | 'at' | 'fi' | 'lv' | 'dk' | 'hr';
export const DOSSIER_KEYS: DossierKey[] = ['nz', 'ni', 'jp', 'se', 'mx', 'sk', 'pl'];
export const HUB_KEYS: HubKey[] = ['at', 'fi', 'lv', 'dk', 'hr'];

export interface Period {
  end?: string;
  label?: string;
  record?: number;
  values: Record<string, string | null>;
  [key: string]: unknown;
}
export interface Dossier {
  id: string;
  name: string;
  record: number | null;
  facts: Record<string, any>;
  labels: string[];
  periods: Period[];
}
interface RegistryHub {
  label: string;
  count: number;
  capped: boolean;
  members: any[][];
}

function readVerified(name: string, sha256?: string) {
  const bytes = readFileSync(join(ROOT, name));
  if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error(`Wave 1c data file changed without a rebuilt manifest: ${name}`);
  }
  return JSON.parse(bytes.toString('utf8'));
}
const readEdition = (rel: string) => JSON.parse(readFileSync(resolve(rel), 'utf8'));

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const quoted = (items: string[]) => list(items.map((x) => `“${x}”`));
function grouped(value: string) {
  const negative = value.startsWith('-');
  const [whole, cents] = value.replace('-', '').split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { negative, text: cents ? `${digits}.${cents}` : digits };
}
const symbolMoney = (symbol: string, suffix = '') => (value: string) => {
  const { negative, text } = grouped(value);
  return `${negative ? '−' : ''}${symbol}${text}${suffix}`;
};
export const plainNumber = (value: string) => grouped(value).text;
const STOP = new Set(['a', 'and', 'as', 'be', 'by', 'in', 'of', 'or', 'the', 'to', 'with']);
const FOLD: Record<string, string> = { 'đ': 'd', 'ł': 'l', 'ø': 'o', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ı': 'i' };
/** URL slug of a label in any Latin script: diacritics folded, first seven words, no trailing function words. */
export const labelSlug = (text: string) => {
  const folded = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[đłøßæœı]/g, (ch) => FOLD[ch]);
  const words = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 7);
  while (words.length > 1 && STOP.has(words.at(-1)!)) words.pop();
  return words.join('-');
};
const tally = <T,>(items: T[], key: (item: T) => string | null | undefined) => {
  const counter = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== null && k !== undefined && k !== '') counter.set(k, (counter.get(k) ?? 0) + 1);
  }
  return counter;
};
const top = (counter: Map<string, number>, n: number) => [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const yearRange = (labels: string[]) => {
  const sorted = [...labels].sort();
  return sorted[0] === sorted.at(-1) ? sorted[0] : `${sorted[0]} to ${sorted.at(-1)}`;
};
const dayRange = (days: string[]) => {
  const sorted = [...days].sort();
  return sorted[0] === sorted.at(-1) ? `all end on ${dayLabel(sorted[0])}` : `end between ${dayLabel(sorted[0])} and ${dayLabel(sorted.at(-1)!)}`;
};
const optionalDay = (value: string | null | undefined) => (value ? dayLabel(value) : 'Not supplied');
/** Lower-case the first letter for use mid-sentence, unless the word is an acronym (RFC, IČO, KRS, NPO). */
export const midSentence = (text: string) => (/^\p{Lu}{2}/u.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

// ---------- Register definitions (wording only; every value comes from the dataset) ----------
export interface Line { key: string; label: string; ref: string }
export interface FactRow { label: string; value: string; links?: { text: string; href: string }[] }
interface DossierDef {
  key: DossierKey;
  country: string;
  slug: string;
  segment: string;
  register: string;
  publisher: string;
  idLabel: string;
  idProperty: string;
  identityCode: string;
  symbol: string;
  money: (value: string) => string;
  moneyNote: string;
  lines: Line[];
  periodNoun: string;
  periodHeading: (p: Period) => string;
  periodSub: (p: Period) => string | null;
  periodSubIsRecord: boolean;
  thresholdText: string;
  titleOf: (d: Dossier) => string;
  entryUrl: (d: Dossier) => string | null;
  editionPath: string;
  recordPage: string;
  licence: string;
  attribution: string;
  labelNoun?: string;
  labelPlural?: string;
  hubSegment?: string;
  labelText?: (key: string) => string;
}
interface HubDef {
  key: HubKey;
  country: string;
  slug: string;
  hubSegment: string;
  register: string;
  publisher: string;
  idLabel: string;
  labelNoun: string;
  labelPlural: string;
  population: string;
  symbol: string;
  identityCode: string;
  columns: string[];
  entryUrl: ((id: string) => string) | null;
  entrySite: string;
  editionPath: string;
  recordPage: string;
  licence: string;
  attribution: string;
  hubPath: (key: string, label: string) => string;
  hubTitle: (label: string, key: string) => string;
}

function load() {
  const manifest = readVerified('manifest.json');
  if (manifest.format !== 'charitology-registry-wave1c-v1') throw new Error('Unexpected Wave 1c manifest.');
  const out = manifest.outputs;
  const dossiers = Object.fromEntries(DOSSIER_KEYS.map((k) => [k, readVerified(out[k].path, out[k].sha256) as Dossier[]])) as Record<DossierKey, Dossier[]>;
  const counts = Object.fromEntries(DOSSIER_KEYS.map((k) => [k, readVerified(out[`${k}Counts`].path, out[`${k}Counts`].sha256)])) as Record<DossierKey, any>;
  const hubs = Object.fromEntries(HUB_KEYS.map((k) => [k, readVerified(out[k].path, out[k].sha256)])) as Record<HubKey, { counts: any; hubs: Record<string, RegistryHub> }>;
  const causes = readVerified(out.causes.path, out.causes.sha256);
  return { manifest, dossiers, counts, hubs, causes };
}

let cached: ReturnType<typeof model> | undefined;
export function wave1c() {
  return (cached ??= model());
}

function model() {
  const { manifest, dossiers, counts, hubs, causes } = load();
  const sel = manifest.selection;
  const src = manifest.sources;
  const editions = {
    nz: readEdition(manifest.pinnedEditions.nz.path), ni: readEdition(manifest.pinnedEditions.ni.path), jp: readEdition(manifest.pinnedEditions.jp.path),
    se: readEdition(manifest.pinnedEditions.se.path), mx: readEdition(manifest.pinnedEditions.mx.path), sk: readEdition(manifest.pinnedEditions.sk.path),
    pl: readEdition(manifest.pinnedEditions.pl.path), plFlows: readEdition(manifest.pinnedEditions.plFlows.path),
    at: readEdition(manifest.pinnedEditions.at.path), fi: readEdition(manifest.pinnedEditions.fi.path), lv: readEdition(manifest.pinnedEditions.lv.path),
    dk: readEdition(manifest.pinnedEditions.dk.path), hr: readEdition(manifest.pinnedEditions.hr.path),
  };
  const niPurposes = new Map<string, string>(editions.ni.purposes.map((p: any) => [p.code, p.label]));
  const mxFields: { field: string; label: string; group: string }[] = editions.mx.financialFields;
  const mxActivities: Record<string, { label: string }> = editions.mx.directoryActivityCodes;
  const plVoiv: Record<string, { pl: string }> = editions.pl.voivodeships;
  const atCats = new Map<string, any>(editions.at.categories.map((c: any) => [c.prefix, c]));

  const D: Record<DossierKey, DossierDef> = {
    nz: {
      key: 'nz', country: 'New Zealand', slug: 'new-zealand', segment: 'charity', register: 'Charities Register',
      publisher: editions.nz.publisher, idLabel: 'Registration number', idProperty: 'New Zealand Charities Register registration number',
      identityCode: 'Tier 3', symbol: 'fern', money: symbolMoney('NZ$'), moneyNote: 'New Zealand dollars, as stored in the committed Tier 3 return edition',
      lines: [
        { key: 'totalGrossIncome', label: 'Total gross income', ref: 'AnnualReturn TotalGrossIncome' },
        { key: 'totalExpenditure', label: 'Total expenditure', ref: 'AnnualReturn TotalExpenditure' },
      ],
      periodNoun: 'annual return', periodHeading: (p) => `Year ended ${dayLabel(p.end!)}`, periodSub: (p) => `Annual return ${p.record}`, periodSubIsRecord: true,
      thresholdText: `total gross income of at least ${symbolMoney('NZ$')(sel.nz.threshold.value)} in the latest included Tier 3 return`,
      titleOf: (d) => `${d.name}: Charities Register Tier 3 dossier (${d.id})`,
      entryUrl: (d) => `${editions.nz.register}${d.id}`,
      editionPath: '/data/charity-registry/new-zealand/', recordPage: '/record/charity-index/new-zealand/',
      licence: editions.nz.licence, attribution: 'Contains information from Charities Services, New Zealand Department of Internal Affairs, licensed under Creative Commons Attribution 3.0 New Zealand.',
    },
    ni: {
      key: 'ni', country: 'Northern Ireland', slug: 'northern-ireland', segment: 'charity', register: 'Register of Charities',
      publisher: editions.ni.publisher, idLabel: 'Charity number', idProperty: 'Charity Commission for Northern Ireland register ID',
      identityCode: 'CCNI', symbol: 'basaltColumn', money: gbp, moneyNote: 'Pounds sterling, as published in the CCNI register export',
      lines: [
        { key: 'totalIncome', label: 'Total income', ref: 'CCNI export column “Total income”' },
        { key: 'totalSpending', label: 'Total spending', ref: 'CCNI export column “Total spending”' },
      ],
      periodNoun: 'financial year', periodHeading: (p) => `Year ending ${dayLabel(p.end!)}`, periodSub: () => null, periodSubIsRecord: false,
      thresholdText: `total income of at least ${gbp(sel.ni.threshold.value)} for the latest financial year in the register export`,
      titleOf: (d) => `${d.name}: CCNI register dossier (${d.facts.nic})`,
      entryUrl: (d) => `${editions.ni.catalogues.ccniCharityDetailsPrefix}${d.id}&subId=0`,
      editionPath: '/data/charity-registry/northern-ireland/', recordPage: '/record/charity-index/northern-ireland/',
      licence: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      attribution: 'Contains information from the Charity Commission for Northern Ireland, licensed under the Open Government Licence v3.0.',
      labelNoun: 'charitable purpose', labelPlural: 'charitable purposes', hubSegment: 'purposes', labelText: (k) => niPurposes.get(k)!,
    },
    jp: {
      key: 'jp', country: 'Japan', slug: 'japan', segment: 'npo', register: 'NPO Portal',
      publisher: editions.jp.publisher, idLabel: 'NPO Portal ID', idProperty: 'Cabinet Office NPO Portal ID',
      identityCode: 'NPO', symbol: 'flag', money: symbolMoney('¥'), moneyNote: 'Yen, as entered by the organization in the NPO Portal snapshot',
      lines: [
        { key: 'ordinaryRevenue', label: 'Ordinary revenue', ref: '活動計算書 経常収益計-合計' },
        { key: 'ordinaryExpenses', label: 'Ordinary expenses', ref: '活動計算書 経常費用計-合計' },
        { key: 'donationsReceived', label: 'Donations received', ref: '活動計算書 経常収益計（受取寄附金）-合計' },
        { key: 'grantsReceived', label: 'Grants and similar income received', ref: '活動計算書 経常収益計（受取助成金等）-合計' },
      ],
      periodNoun: 'settlement year', periodHeading: (p) => `Settlement label ${p.label}`, periodSub: (p) => `Organization CSV record ${count(p.record!)}`, periodSubIsRecord: true,
      thresholdText: `ordinary revenue of at least ${symbolMoney('¥')(sel.jp.threshold.value)} in the latest financial summary`,
      titleOf: (d) => `${d.name}: NPO Portal dossier (${d.id})`,
      entryUrl: (d) => `${editions.jp.portal}gyosei-print/${d.id}`,
      editionPath: '/data/charity-registry/japan-npo/', recordPage: '/record/charity-index/japan/',
      licence: editions.jp.licence, attribution: 'Source data from the Cabinet Office NPO Portal, used under Japan’s Public Data License 1.0.',
    },
    se: {
      key: 'se', country: 'Sweden', slug: 'sweden', segment: 'org', register: '90-konto directory',
      publisher: editions.se.publisher, idLabel: 'Organisation number', idProperty: 'Swedish organisation number (organisationsnummer)',
      identityCode: '90-konto', symbol: 'nordicStar', money: symbolMoney('SEK ', ' thousand'), moneyNote: 'Thousands of Swedish kronor (tkr), as printed on the directory card',
      lines: [
        { key: 'revenue', label: 'Total revenue', ref: 'Directory card “Totala intäkter” (tkr)' },
        { key: 'equity', label: 'Equity', ref: 'Directory card “Eget kapital” (tkr)' },
      ],
      periodNoun: 'reporting year', periodHeading: (p) => `Year ${p.label}`, periodSub: () => null, periodSubIsRecord: false,
      thresholdText: `total revenue of at least ${symbolMoney('SEK ', ' thousand')(sel.se.threshold.value)} for ${editions.se.financialReportingYear} on the directory card`,
      titleOf: (d) => `${d.name}: Svensk Insamlingskontroll 90-konto dossier (${d.id})`,
      entryUrl: (d) => d.facts.profileUrl,
      editionPath: '/data/charity-registry/sweden/', recordPage: '/record/charity-index/sweden/',
      licence: editions.se.catalogues.directory, attribution: 'Directory information published by Svensk Insamlingskontroll.',
      labelNoun: 'purpose', labelPlural: 'purposes', hubSegment: 'purposes', labelText: (k) => k,
    },
    mx: {
      key: 'mx', country: 'Mexico', slug: 'mexico', segment: 'rfc', register: 'Donatarias autorizadas transparency report',
      publisher: editions.mx.publisher, idLabel: 'RFC', idProperty: 'Mexican taxpayer registry number (RFC)',
      identityCode: 'SAT', symbol: 'agave', money: symbolMoney('MX$'), moneyNote: 'Pesos, as reported in the SAT transparency report',
      lines: mxFields.map((f) => ({ key: f.field, label: f.label, ref: `Report column ${f.field}` })),
      periodNoun: 'fiscal year', periodHeading: (p) => `Fiscal year ${p.label}`, periodSub: (p) => `Report row ${count(p.record!)}`, periodSubIsRecord: true,
      thresholdText: `domestic cash donations (column dona_efe_nal) of at least ${symbolMoney('MX$')(sel.mx.threshold.value)} in the latest fiscal year`,
      titleOf: (d) => `${d.name}: SAT authorized donee dossier (RFC ${d.id})`,
      entryUrl: () => null,
      editionPath: '/data/charity-financials/mx/', recordPage: '/record/charity-financials/mexico/',
      licence: editions.mx.openData, attribution: 'Information published by Mexico’s Servicio de Administración Tributaria (SAT).',
      labelNoun: 'authorized category', labelPlural: 'authorized categories', hubSegment: 'categories', labelText: (k) => k,
    },
    sk: {
      key: 'sk', country: 'Slovakia', slug: 'slovakia', segment: 'ico', register: 'Annual overview of tax-share recipients',
      publisher: editions.sk.publisher, idLabel: 'IČO', idProperty: 'Slovak organization identification number (IČO)',
      identityCode: '2% tax', symbol: 'tatraPeak', money: symbolMoney('€'), moneyNote: 'Euros, as listed in the Financial Directorate’s annual overview',
      lines: [{ key: 'amount', label: 'Tax share received', ref: 'Annual overview amount (podiel zaplatenej dane)' }],
      periodNoun: 'annual overview', periodHeading: (p) => `Overview ${p.label}`, periodSub: () => null, periodSubIsRecord: false,
      thresholdText: `a 2025 tax share of at least ${symbolMoney('€')(sel.sk.threshold.value)} in the Financial Directorate’s annual overview`,
      titleOf: (d) => `${d.name}: Slovak tax-share recipient dossier (IČO ${d.id})`,
      entryUrl: () => null,
      editionPath: '/data/charity-registry/slovakia/', recordPage: '/record/charity-index/slovakia/',
      licence: editions.sk.catalogues.financnaSprava, attribution: 'Information published by the Financial Directorate of the Slovak Republic.',
    },
    pl: {
      key: 'pl', country: 'Poland', slug: 'poland', segment: 'krs', register: 'Public benefit organization lists',
      publisher: editions.pl.publisher, idLabel: 'KRS number', idProperty: 'Polish National Court Register number (KRS)',
      identityCode: '1.5% PIT', symbol: 'poppy', money: symbolMoney('PLN '), moneyNote: 'Polish złoty, as listed by the Ministry of Finance',
      lines: [
        { key: 'amount', label: 'Amount transferred (1.5% of tax due)', ref: 'Ministry of Finance list, column “kwota”' },
        { key: 'taxpayers', label: 'Taxpayers', ref: 'Ministry of Finance list, number of taxpayers in thousands' },
      ],
      periodNoun: 'tax year', periodHeading: (p) => `Tax year ${p.label}`, periodSub: (p) => `Transferred in ${p.payoutYear}`, periodSubIsRecord: false,
      thresholdText: `at least ${symbolMoney('PLN ')(sel.pl.threshold.value)} transferred from 1.5% of personal income tax for tax year 2025`,
      titleOf: (d) => `${d.name}: Polish public benefit organization dossier (KRS ${d.id})`,
      entryUrl: () => null,
      editionPath: '/data/charity-registry/poland/', recordPage: '/record/charity-index/poland/',
      licence: editions.pl.license, attribution: 'Data from the Ministry of Finance and NIW-CRSO via dane.gov.pl, CC0 1.0.',
    },
  };

  const H: Record<HubKey, HubDef> = {
    at: {
      key: 'at', country: 'Austria', slug: 'austria', hubSegment: 'categories', register: 'BMF list of donation-deductible organizations',
      publisher: editions.at.publisher, idLabel: 'BMF code', labelNoun: 'BMF category', labelPlural: 'BMF categories',
      population: 'entries with no expiry date', symbol: 'edelweiss', identityCode: 'BMF',
      columns: ['Organization (BMF list name)', 'BMF code', 'Valid from'], entryUrl: null, entrySite: editions.at.catalogues.bmfSearchPortal,
      editionPath: '/data/charity-registry/austria/', recordPage: '/record/charity-index/austria/',
      licence: editions.at.catalogues.bmfSearchPortal, attribution: 'Information published by the Austrian Federal Ministry of Finance (BMF).',
      hubPath: (k, label) => `${WAVE1_BASE}austria/categories/${labelSlug(`${k} ${label}`)}/`,
      hubTitle: (label, k) => `${label} (BMF ${k}): Austria donation-deductible register hub`,
    },
    fi: {
      key: 'fi', country: 'Finland', slug: 'finland', hubSegment: 'sectors', register: 'PRH business information system (YTJ)',
      publisher: editions.fi.publisher, idLabel: 'Business ID', labelNoun: 'industry label', labelPlural: 'industry labels',
      population: 'active non-profit associations and foundations with an industry label', symbol: 'nordicBirch', identityCode: 'TOL',
      columns: ['Organization (YTJ name)', 'Business ID', 'Legal form', 'Registered', 'Municipality'],
      entryUrl: (id) => `https://tietopalvelu.ytj.fi/yritys/${id}`, entrySite: editions.fi.catalogues.ytjSearch,
      editionPath: '/data/charity-registry/finland/', recordPage: '/record/charity-index/finland/',
      licence: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Contains data from the Finnish Patent and Registration Office (PRH), CC BY 4.0.',
      hubPath: (k, label) => `${WAVE1_BASE}finland/sectors/${k.split('|')[0]}-${labelSlug(label)}/`,
      hubTitle: (label, k) => `${label} (TOL ${k.split('|')[0]}): Finland register hub`,
    },
    lv: {
      key: 'lv', country: 'Latvia', slug: 'latvia', hubSegment: 'public-benefit-fields', register: 'Public benefit organization register (SLO)',
      publisher: 'Valsts ieņēmumu dienests and Uzņēmumu reģistrs (Latvia)', idLabel: 'Registration number', labelNoun: 'public benefit field', labelPlural: 'public benefit fields',
      population: 'organizations with active public benefit status and an active Enterprise Register entry', symbol: 'amber', identityCode: 'SLO',
      columns: ['Organization (Enterprise Register name)', 'Registration number', 'Legal form', 'Public benefit status since'],
      entryUrl: (id) => `https://info.ur.gov.lv/#/legal-entity/${id}`, entrySite: 'https://info.ur.gov.lv/',
      editionPath: '/data/charity-registry/latvia/', recordPage: '/record/charity-index/latvia/',
      licence: editions.lv.license, attribution: 'Data from the State Revenue Service and the Enterprise Register of Latvia via data.gov.lv, CC0 1.0.',
      hubPath: (_k, label) => `${WAVE1_BASE}latvia/public-benefit-fields/${labelSlug(label)}/`,
      hubTitle: (label) => `${label}: Latvia public benefit register hub`,
    },
    dk: {
      key: 'dk', country: 'Denmark', slug: 'denmark', hubSegment: 'approvals', register: 'Skattestyrelsen list of approved associations (C.A.4.3.5.9)',
      publisher: editions.dk.publisher, idLabel: 'CVR number', labelNoun: 'approval marker', labelPlural: 'approval markers',
      population: 'organizations not marked as ceased in the list', symbol: 'danishCrown', identityCode: 'Skat',
      columns: ['Organization (list name)', 'CVR number', 'Approved for part of the year'],
      entryUrl: null, entrySite: editions.dk.catalogues.skatApprovedList,
      editionPath: '/data/charity-registry/denmark/', recordPage: '/record/charity-index/denmark/',
      licence: editions.dk.catalogues.skatApprovedList, attribution: 'Information published by Skattestyrelsen (the Danish Tax Agency).',
      hubPath: (k) => `${WAVE1_BASE}denmark/approvals/${({ s8a: 'll-8-a', s12: 'll-12-stk-3', bal: 'bal-3-stk-2' } as Record<string, string>)[k]}/`,
      hubTitle: (label) => `${label}: Denmark approved associations hub`,
    },
    hr: {
      key: 'hr', country: 'Croatia', slug: 'croatia', hubSegment: 'domains', register: 'Register of Associations (Registar udruga)',
      publisher: editions.hr.publisher, idLabel: 'Registration number', labelNoun: 'activity domain', labelPlural: 'activity domains',
      population: 'active associations and foundations with at least one activity domain', symbol: 'adriaticCheck', identityCode: 'Udruge',
      columns: ['Organization (register name)', 'Registration number', 'OIB', 'County', 'Registered'],
      entryUrl: null, entrySite: editions.hr.catalogues.portal,
      editionPath: '/data/charity-registry/croatia/', recordPage: '/record/charity-index/croatia/',
      licence: editions.hr.license, attribution: 'Data from the Ministry of Justice, Public Administration and Digital Transformation of Croatia via data.gov.hr (Otvorena dozvola).',
      hubPath: (_k, label) => `${WAVE1_BASE}croatia/domains/${labelSlug(label)}/`,
      hubTitle: (label) => `${sentence(label.toLowerCase())}: Croatia register hub`,
    },
  };

  const sorted = Object.fromEntries(DOSSIER_KEYS.map((k) => [k, [...dossiers[k]].sort(byName)])) as Record<DossierKey, Dossier[]>;
  const base = (slug: string) => `${WAVE1_BASE}${slug}/`;
  const dossierPath = (k: DossierKey, d: Dossier) => `${base(D[k].slug)}${D[k].segment}/${d.id.toLowerCase()}/`;
  const hubMin: number = sel.hubMinimumDossiers;
  const byLabel = (k: DossierKey) => {
    const map = new Map<string, Dossier[]>();
    for (const d of sorted[k]) for (const l of d.labels) map.set(l, [...(map.get(l) ?? []), d]);
    return map;
  };
  const labelMaps = Object.fromEntries(DOSSIER_KEYS.map((k) => [k, byLabel(k)])) as Record<DossierKey, Map<string, Dossier[]>>;
  const dossierHubKeys = (k: DossierKey) => (D[k].hubSegment ? [...labelMaps[k]].filter(([, v]) => v.length >= hubMin).map(([l]) => l).sort((a, b) => D[k].labelText!(a).localeCompare(D[k].labelText!(b))) : []);
  const dossierHubs = Object.fromEntries(DOSSIER_KEYS.map((k) => [k, dossierHubKeys(k)])) as Record<DossierKey, string[]>;
  const dossierHubPath = (k: DossierKey, label: string) => `${base(D[k].slug)}${D[k].hubSegment}/${labelSlug(D[k].labelText!(label))}/`;
  const dossierHubTitle = (k: DossierKey, label: string) => `${D[k].labelText!(label)}: ${D[k].country} charity dossiers`;
  const registryHubPath = (k: HubKey, key: string) => H[k].hubPath(key, hubs[k].hubs[key].label);
  const registryHubKeys = (k: HubKey) => Object.keys(hubs[k].hubs);
  const latest = (d: Dossier) => d.periods[0];
  const cell = (k: DossierKey, p: Period, line: string) => {
    if (k === 'sk' && p.combined) return 'Not shown: two or more lines combined in the edition';
    const v = p.values[line];
    if (v === null || v === undefined) return 'Not supplied';
    if (k === 'pl' && line === 'taxpayers') return `${plainNumber(v)} thousand`;
    return D[k].money(v);
  };
  const editionDate: Record<DossierKey | HubKey, string> = {
    nz: editions.nz.capturedAt.slice(0, 10), ni: editions.ni.capturedOn, jp: editions.jp.capturedOn, se: editions.se.capturedOn, mx: editions.mx.capturedOn,
    sk: editions.sk.capturedOn, pl: editions.pl.capturedOn, at: editions.at.capturedOn, fi: editions.fi.capturedOn, lv: editions.lv.capturedOn,
    dk: editions.dk.capturedOn, hr: editions.hr.capturedOn,
  };

  // ---------- Facts shown in each dossier's register record ----------
  function facts(k: DossierKey, d: Dossier): FactRow[] {
    const f = d.facts;
    const labelLinks = (labels: string[]) => labels.map((l) => ({ text: D[k].labelText!(l), href: dossierHubs[k].includes(l) ? dossierHubPath(k, l) : '' }));
    switch (k) {
      case 'nz':
        return [
          { label: 'Registration number', value: d.id }, { label: 'Register name', value: d.name },
          { label: 'Registration status', value: f.status }, { label: 'Date registered', value: optionalDay(f.registered) },
          { label: 'Organisation ID (open data)', value: String(f.organisationId) }, { label: 'Group ID', value: f.groupId === null ? 'None recorded' : String(f.groupId) },
        ];
      case 'ni':
        return [
          { label: 'Charity number', value: f.nic }, { label: 'Register ID', value: d.id }, { label: 'Register name', value: d.name },
          { label: 'Other name', value: f.otherName ?? 'Not supplied' }, { label: 'Date registered', value: optionalDay(f.registered) },
          { label: 'Return status', value: f.status }, { label: 'Governing document', value: f.governingDocument ?? 'Not supplied' },
          { label: 'Charitable purposes', value: d.labels.length ? d.labels.map((l) => niPurposes.get(l)).join('; ') : 'None listed', links: labelLinks(d.labels) },
        ];
      case 'jp':
        return [
          { label: 'NPO Portal ID', value: d.id }, { label: 'Corporate name', value: d.name }, { label: 'Name reading', value: f.kana ?? 'Not supplied' },
          { label: 'Supervising authority', value: f.authority }, { label: 'Corporate number', value: f.corporateNumber ?? 'Not supplied' },
          { label: 'Certification date', value: optionalDay(f.certified) },
        ];
      case 'se':
        return [
          { label: 'Organisation number', value: d.id }, { label: 'Name', value: d.name }, { label: 'Legal form', value: f.legalForm },
          { label: '90-account holder since', value: f.since === null ? 'Not supplied' : String(f.since) },
          { label: 'Purposes', value: d.labels.length ? d.labels.join('; ') : 'None listed', links: labelLinks(d.labels) },
          { label: 'Areas', value: f.areas.length ? f.areas.join('; ') : 'None listed' },
          { label: 'Regions', value: f.regions.length ? f.regions.join('; ') : 'None listed' },
          { label: 'Swedish counties', value: f.swedenCounties.length ? f.swedenCounties.join('; ') : 'None listed' },
        ];
      case 'mx':
        return [
          { label: 'RFC', value: d.id }, { label: 'Reported name', value: d.name }, { label: 'Reported state', value: f.state ?? 'Not supplied' },
          { label: 'Authorized category', value: f.category, links: labelLinks([f.category]) },
          { label: 'Directory edition', value: f.directoryYear === null ? 'Not listed in a committed directory' : String(f.directoryYear) },
          { label: 'Directory taxpayer status', value: f.directoryStatus ?? 'Not supplied' },
          { label: 'Directory activity codes', value: f.directoryActivities.length ? f.directoryActivities.map((c: string) => `${c} (${mxActivities[c].label})`).join('; ') : 'None listed' },
        ];
      case 'sk':
        return [{ label: 'IČO', value: d.id }, { label: 'Name', value: d.name }, { label: 'Municipality', value: f.municipality ?? 'Not supplied' }];
      case 'pl':
        return [
          { label: 'KRS number', value: d.id }, { label: 'Name', value: d.name }, { label: 'NIP', value: f.nip ?? 'Not supplied' },
          { label: 'Voivodeship', value: f.voivodeship ? plVoiv[f.voivodeship].pl : 'Not supplied' }, { label: 'City', value: f.city ?? 'Not supplied' },
          { label: 'NIW eligibility lists', value: f.eligibleLists.length ? f.eligibleLists.map((y: number) => `tax year ${y}`).join('; ') : 'None' },
        ];
    }
  }

  // ---------- Dossier FAQs ----------
  function dossierFaqs(k: DossierKey, d: Dossier): FaqEntry[] {
    const p = latest(d);
    const f = d.facts;
    const def = D[k];
    const money = (line: string, q: Period = p) => cell(k, q, line);
    const periods = `${d.periods.length} ${def.periodNoun}${d.periods.length > 1 ? 's' : ''}`;
    switch (k) {
      case 'nz': return [
        { question: `What registration number does the Charities Register list for ${d.name}?`, answer: `The committed Charities Register edition (captured ${dayLabel(editionDate.nz)}, row ${count(d.record!)}) lists ${d.name} under registration number ${d.id}, with the status ${f.status}${f.registered ? ` and a registration date of ${dayLabel(f.registered)}` : ''}.` },
        { question: `What total gross income did ${d.name} report for the year ended ${dayLabel(p.end!)}?`, answer: `${money('totalGrossIncome')}, in Tier 3 annual return ${p.record}. The return’s currency basis is ${p.currencyBasis === 'reported' ? 'the currency reported on the return' : 'New Zealand dollars under the Tier 3 standard'}.` },
        { question: `What total expenditure did ${d.name} report for that year?`, answer: `${money('totalExpenditure')} for the year ended ${dayLabel(p.end!)}, in the same annual return.` },
        { question: `How many Tier 3 returns does this dossier include for ${d.name}?`, answer: `${periods}, for years ended ${list(d.periods.map((x) => dayLabel(x.end!)))}, from the 2024 and 2025 Tier 3 return extracts in the committed edition.` },
        { question: `Does the register record a group for ${d.name}?`, answer: f.groupId === null ? 'No group identifier is recorded for this organization in the committed edition.' : `Yes. The edition records group identifier ${f.groupId}. Group returns are reported separately and are not part of this dossier.` },
        { question: 'Why is this charity in the Wave 1c dossiers?', answer: `Its latest included Tier 3 return reports ${def.thresholdText.replace(' in the latest included Tier 3 return', '')}, and its registration status is Registered. The committed edition contains Tier 3 returns only, so charities reporting under other tiers are not covered.` },
      ];
      case 'ni': return [
        { question: `What charity number does the CCNI register list for ${d.name}?`, answer: `The CCNI register export captured ${dayLabel(editionDate.ni)} lists ${d.name} as charity ${f.nic} (register ID ${d.id})${f.registered ? `, registered on ${dayLabel(f.registered)}` : ''}. Its return status is “${f.status}”.` },
        { question: `What total income did ${d.name} report for the year ending ${dayLabel(p.end!)}?`, answer: `${money('totalIncome')}, in the export’s “Total income” column for the financial year ending ${dayLabel(p.end!)}.` },
        { question: `What total spending did ${d.name} report for that year?`, answer: `${money('totalSpending')}, in the export’s “Total spending” column for the same financial year.` },
        { question: `Which charitable purposes does the register list for ${d.name}?`, answer: d.labels.length ? `${count(d.labels.length)} purpose${d.labels.length > 1 ? 's' : ''}: ${quoted(d.labels.map((l) => niPurposes.get(l)!))}.` : 'The export lists no charitable purpose for this charity.' },
        { question: `What governing document does the register record for ${d.name}?`, answer: f.governingDocument ? `${f.governingDocument}.${f.otherName ? ` The register also records the other name “${f.otherName}”.` : ''}` : 'The export supplies no governing document.' },
        { question: 'Why does this dossier show only income and spending?', answer: `The committed edition stores a blank CCNI cell as zero, so other expenditure columns cannot be told apart from blanks. Total income and total spending are both above zero here and are shown as published.${f.editionFlag ? ' The edition also flags this record: income above £50m with no employed staff and no itemized charitable expenditure.' : ''}` },
      ];
      case 'jp': return [
        { question: `What NPO Portal ID and corporate number does the portal list for ${d.name}?`, answer: `The NPO Portal snapshot dated ${dayLabel(editions.jp.asOf)} lists ${d.name} under portal ID ${d.id}${f.corporateNumber ? ` with corporate number ${f.corporateNumber}` : ' without a corporate number'} (administrative CSV record ${count(f.administrativeRecord)}).` },
        { question: `Which authority supervises ${d.name}?`, answer: `${f.authority}, according to the administrative record.${f.certified ? ` The certification date is ${dayLabel(f.certified)}.` : ''}` },
        { question: `What ordinary revenue did ${d.name} enter for settlement label ${p.label}?`, answer: `${money('ordinaryRevenue')}, in the activity statement field 経常収益計-合計 of organization CSV record ${count(p.record!)}.` },
        { question: 'What ordinary expenses were entered for that settlement?', answer: `${money('ordinaryExpenses')}, in the field 経常費用計-合計.` },
        { question: 'What donations and grants were entered?', answer: `Donations received: ${money('donationsReceived')}. Grants and similar income received: ${money('grantsReceived')}. Both are income categories within the activity statement.` },
        { question: 'Who entered these figures?', answer: 'The organization itself. The portal’s financial fields are organization-entered, and Charitology links them to the administrative record only where the corporate name occurs once in both portal files.' },
      ];
      case 'se': return [
        { question: `What organisation number does Svensk Insamlingskontroll list for ${d.name}?`, answer: `${d.id}. The 90-konto directory captured ${dayLabel(editionDate.se)} lists ${d.name} as an active 90-account holder (${f.legalForm})${f.since !== null ? ` since ${f.since}` : ''}.` },
        { question: `What total revenue did ${d.name} report for ${p.label}?`, answer: `${money('revenue')}, printed on the directory card as “Totala intäkter”.` },
        { question: `What equity did ${d.name} report for ${p.label}?`, answer: `${money('equity')}, printed on the directory card as “Eget kapital”.` },
        { question: `Which purposes does the directory list for ${d.name}?`, answer: d.labels.length ? `${quoted(d.labels)}.` : 'The directory lists no purpose for this organization.' },
        { question: 'Where does the organization work, according to the directory?', answer: [f.regions.length ? `Regions: ${list(f.regions)}.` : 'No region is listed.', f.areas.length ? `Areas: ${list(f.areas)}.` : 'No area is listed.'].join(' ') },
        { question: 'How many years does this dossier include?', answer: `${periods}: ${list(d.periods.map((x) => x.label!))}. The card also prints three-year cost percentages, which Charitology does not reproduce.` },
      ];
      case 'mx': return [
        { question: `What RFC does the SAT report list for ${d.name}?`, answer: `${d.id}. The ${p.label} transparency report lists the organization as “${p.name}” in ${f.state ?? 'no stated state'}, row ${count(p.record!)}.` },
        { question: `Which authorized category does the ${p.label} report give ${d.name}?`, answer: `${f.category}, as worded in the report.` },
        { question: `What domestic cash donations did ${d.name} report for fiscal year ${p.label}?`, answer: `${money('dona_efe_nal')}, in column dona_efe_nal. Foreign cash donations: ${money('dona_efe_ext')}.` },
        { question: 'What operating and administrative expenses were reported?', answer: `Domestic operating expenses: ${money('gas_opera_nal')}. Domestic administrative expenses: ${money('gas_admin_nal')}. Wages, salaries and related costs: ${money('eroga_sys')}.` },
        { question: `Is ${d.name} listed in the SAT directory of authorized donees?`, answer: f.directoryYear === null ? 'It does not appear in the committed 2025 or 2026 directory.' : `Yes. The ${f.directoryYear} directory lists it as “${f.directoryName}” with taxpayer status “${f.directoryStatus}”${f.directoryActivities.length ? ` and activity code${f.directoryActivities.length > 1 ? 's' : ''} ${list(f.directoryActivities)}` : ''}.` },
        { question: 'How many fiscal years does this dossier include?', answer: `${periods}: ${list(d.periods.map((x) => x.label!))}, from the SAT transparency reports in the committed edition captured ${dayLabel(editionDate.mx)}.` },
      ];
      case 'sk': {
        const listed = d.periods.filter((x) => x.values.amount !== null);
        const combinedYears = d.periods.filter((x) => x.combined).map((x) => x.label!);
        return [
          { question: `What IČO does the Financial Directorate list for ${d.name}?`, answer: `${d.id}, with the municipality ${f.municipality ?? 'not supplied'}, in the annual overviews of tax-share recipients.` },
          { question: `What tax share did ${d.name} receive in the 2025 overview?`, answer: `${money('amount')}, in the Financial Directorate’s annual overview of recipients for 2025.` },
          { question: 'What did the 2024 overview list?', answer: `${cell('sk', d.periods[1], 'amount')} in the 2024 overview.` },
          { question: `In how many annual overviews from 2016 to 2025 does ${d.name} appear with an amount shown here?`, answer: `${count(listed.length)} of 10: ${list(listed.map((x) => x.label!))}.${combinedYears.length ? ` In ${list(combinedYears)}, the overview printed this IČO on more than one line, which the committed edition adds together, so that year is not shown.` : ''}` },
          { question: 'What is a tax share?', answer: 'Under §50 of Slovakia’s Income Tax Act, taxpayers can assign a share of their paid income tax to an eligible recipient. The Financial Directorate publishes the amount each recipient received.' },
          { question: 'Why is this organization in the Wave 1c dossiers?', answer: `Its 2025 tax share is at least ${symbolMoney('€')(sel.sk.threshold.value)}. The threshold is a coverage boundary, not an assessment of the organization.` },
        ];
      }
      case 'pl': return [
        { question: `What KRS number does the NIW list give for ${d.name}?`, answer: `${d.id}${f.nip ? `, with NIP ${f.nip}` : ''}. The organization appears in the NIW lists of public benefit organizations eligible for 1.5% for ${f.eligibleLists.length ? `tax year${f.eligibleLists.length > 1 ? 's' : ''} ${list(f.eligibleLists.map(String))}` : 'none of the three committed tax years'}.` },
        { question: `How much did ${d.name} receive from 1.5% of personal income tax for tax year ${p.label}?`, answer: `${money('amount')}, transferred in ${p.payoutYear}, according to the Ministry of Finance list.` },
        { question: 'How many taxpayers chose the organization for that year?', answer: p.values.taxpayers === null ? 'The Ministry of Finance taxpayer list gives no count for this organization for that year.' : `${cell('pl', p, 'taxpayers')} taxpayers, as the Ministry of Finance publishes the count in thousands.` },
        { question: 'What did the organization receive for tax year 2024?', answer: `${cell('pl', d.periods[1], 'amount')}, transferred in 2025.` },
        { question: `Where is ${d.name} based?`, answer: `${f.city ?? 'No city is given'}${f.voivodeship ? `, ${plVoiv[f.voivodeship].pl} voivodeship` : ''}, from the NIW list.` },
        { question: 'How many tax years does this dossier include?', answer: `${periods}: ${list(d.periods.map((x) => x.label!))}. Years without a transfer read “Not supplied”.` },
      ];
    }
  }

  // ---------- Dossier hub FAQs (registers with labels and dossiers) ----------
  function dossierHubFaqs(k: DossierKey, label: string): FaqEntry[] {
    const def = D[k];
    const items = labelMaps[k].get(label)!;
    const text = def.labelText!(label);
    const registerCount = counts[k].labels[label];
    const others = top(tally(items.flatMap((d) => d.labels.filter((x) => x !== label)), (x) => x), 3);
    const places = top(tally(items, (d) => (k === 'mx' ? d.facts.state : k === 'se' ? d.facts.swedenCounties[0] ?? null : null)), 3);
    const populationText = k === 'ni' ? `active charities in the CCNI export captured ${dayLabel(editionDate.ni)}` : k === 'se' ? `active 90-account holders in the directory captured ${dayLabel(editionDate.se)}` : `organizations whose latest fiscal year in the SAT report carries this category`;
    return [
      { question: `How many organizations carry the ${def.labelNoun} “${text}”?`, answer: `${count(registerCount)} ${populationText}.` },
      { question: 'How many of them have a Wave 1c dossier?', answer: `${count(items.length)}: every organization with this ${def.labelNoun} whose record reports ${def.thresholdText}. They are listed alphabetically below.` },
      { question: `Which other ${def.labelPlural} do these organizations list most often?`, answer: others.length ? `${list(others.map(([l, n]) => `“${def.labelText!(l)}” (${count(n)})`))}.` : `${k === 'mx' ? 'Each organization carries one authorized category per fiscal year.' : 'None of these dossiers lists another one.'}` },
      { question: 'Which periods do the figures cover?', answer: k === 'ni' ? `The latest financial years ${dayRange(items.map((d) => latest(d).end!))}.` : `${sentence(def.periodNoun)}s ${yearRange(items.map((d) => latest(d).label!))} for the latest period of each dossier.` },
      { question: k === 'ni' ? 'How are these charities registered?' : 'Where are these organizations based?', answer: k === 'ni' ? `${list(top(tally(items, (d) => d.facts.governingDocument), 3).map(([g, n]) => `${g} (${count(n)})`))}, by governing document in the export.` : places.length ? `${list(places.map(([pl, n]) => `${pl} (${count(n)})`))}${k === 'se' ? ', by the first Swedish county on the directory card' : ', by the state in the SAT report'}.` : 'None of these records supplies a place.' },
      { question: 'Where does the label come from?', answer: `It is the ${def.labelNoun} exactly as worded by ${def.publisher}${k === 'se' ? ' on the 90-konto directory' : ''}. Charitology does not translate or reassign it. Counts can overlap because an organization can carry several labels.` },
    ];
  }

  // ---------- Registry-only hub FAQs ----------
  function registryHubFaqs(k: HubKey, key: string): FaqEntry[] {
    const def = H[k];
    const hub = hubs[k].hubs[key];
    const c = hubs[k].counts;
    const shown = hub.members.length;
    const range = (values: (string | null)[]) => {
      const days = values.filter(Boolean).sort() as string[];
      return days.length ? `from ${dayLabel(days[0])} to ${dayLabel(days.at(-1)!)}` : null;
    };
    const third: Record<HubKey, () => FaqEntry> = {
      at: () => {
        const dated = hub.members.filter((m) => m[2]).map((m) => m[2]);
        return { question: 'How many entries print a “valid from” date?', answer: dated.length ? `${count(dated.length)} of ${count(shown)}, ${range(dated)}. The others print none in the BMF list.` : `None of the ${count(shown)} entries prints a “valid from” date in the BMF list.` };
      },
      fi: () => ({ question: 'When were the listed organizations registered?', answer: range(hub.members.map((m) => m[3])) ? `Registration dates run ${range(hub.members.map((m) => m[3]))}, as recorded in YTJ.` : 'YTJ records no registration date for these organizations.' }),
      lv: () => ({ question: 'Since when have they held public benefit status?', answer: range(hub.members.map((m) => m[3])) ? `Status start dates run ${range(hub.members.map((m) => m[3]))}, as recorded in the SLO register.` : 'The SLO register records no start date for these organizations.' }),
      dk: () => ({ question: 'How many are approved for only part of the year?', answer: key === 'bal' ? `The list prints no partial-year marker for ${hub.label}.` : `${count(hub.members.filter((m) => m[2]).length)} of ${count(shown)} carry the list’s partial-year marker for this approval.` }),
      hr: () => ({ question: 'When were the listed associations registered?', answer: `Registration dates run ${range(hub.members.map((m) => m[4]))}, as recorded in the register.` }),
    };
    const places = top(tally(hub.members, (m) => (k === 'fi' ? m[4] : k === 'hr' ? m[3] : null)), 3);
    const forms = top(tally(hub.members, (m) => (k === 'fi' || k === 'lv' ? m[2] : k === 'hr' ? m[5] : null)), 3);
    const fourth: FaqEntry = places.length
      ? { question: 'Where are they based?', answer: `${list(places.map(([pl, n]) => `${pl} (${count(n)})`))}, by the ${k === 'fi' ? 'municipality' : 'county'} recorded in the register.` }
      : { question: `What does the ${midSentence(def.idLabel)} identify?`, answer: k === 'at' ? `The BMF code is the ministry’s own reference: the category prefix ${key} and a number.` : k === 'dk' ? 'The CVR number is the Danish Central Business Register number printed beside each name in Skattestyrelsen’s list.' : `It is the organization’s registration number in the Enterprise Register of Latvia, also used by the SLO register.` };
    const fifth: FaqEntry = forms.length
      ? { question: 'Which legal forms appear?', answer: `${list(forms.map(([fm, n]) => `${fm} (${count(n)})`))}, as recorded in the register.` }
      : { question: 'Is this a rating or endorsement?', answer: `No. The hub reproduces the ${def.register} as published. Charitology adds no rating, score or ranking.` };
    return [
      { question: `How many organizations carry the ${def.labelNoun} “${hub.label}”?`, answer: `${count(hub.count)} of the ${count(c.population)} ${def.population} in the committed edition captured ${dayLabel(editionDate[k])}.` },
      { question: 'Which organizations does this hub list?', answer: hub.capped ? `The ${count(shown)} most recently registered of the ${count(hub.count)}, by registration date in the register (newest first, then registration number), listed alphabetically. The full set is in the downloadable hub file.` : `All ${count(shown)}, listed alphabetically by the register’s name.` },
      third[k](),
      fourth,
      fifth,
      { question: 'How can I check an entry?', answer: def.entryUrl ? `Each name links to its entry in the official register, where current status and filings are shown. The data come from ${def.publisher}.` : `Look up the ${midSentence(def.idLabel)} in the official ${def.register}, which has no page per entry. The data come from ${def.publisher}.` },
    ];
  }

  // ---------- Country index FAQs ----------
  const exclusionReasons: Record<string, string> = {
    notRegistered: 'no longer have the status Registered', removed: 'are marked Removed in the export', dissolutionRecorded: 'have dissolution information recorded',
    duplicateYearHeaderCard: 'have directory cards with repeated year columns, recorded as an anomaly in the committed edition',
  };
  const exclusionText: Record<string, string> = {
    notRegistered: 'status other than Registered', removed: 'marked Removed', dissolutionRecorded: 'dissolution information recorded',
    duplicateYearHeaderCard: 'directory card with repeated year columns (recorded anomaly)',
  };
  function indexFaqs(k: DossierKey): FaqEntry[] {
    const def = D[k];
    const s = sel[k];
    const items = sorted[k];
    const excluded = Object.entries(s.excluded as Record<string, string[]>).filter(([, v]) => v.length);
    const reasons = exclusionReasons;
    const labels = def.hubSegment ? top(tally(items.flatMap((d) => d.labels), (x) => x), 3) : [];
    const c = counts[k];
    const populations: Record<DossierKey, () => string> = {
      nz: () => `${count(c.editionOrganizations)} organization entries, of which ${count(c.withReturns)} have at least one included Tier 3 return`,
      ni: () => `${count(c.editionOrganizations)} charities, ${count(c.active)} of them not removed`,
      jp: () => `${count(c.editionOrganizations)} portal entries from ${count(c.authorities)} supervising authorities, ${count(c.financialSummaries)} with a financial summary`,
      se: () => `${count(c.editionOrganizations)} organizations, ${count(c.active)} of them active 90-account holders`,
      mx: () => `${count(c.editionOrganizations)} taxpayer registry numbers, ${count(c.withFinancialPeriods)} with at least one fiscal year in the transparency reports`,
      sk: () => `${count(c.editionOrganizations)} recipient IČOs across the 2016 to 2025 overviews, ${count(c.active2025)} of them in 2025`,
      pl: () => `${count(c.editionOrganizations)} public benefit organizations, ${count(c.funded['2025'])} of them with a transfer for tax year 2025`,
    };
    const population = { [k]: populations[k]() } as Record<DossierKey, string>;
    return [
      { question: `How many ${def.country} organizations have a Wave 1c dossier?`, answer: `${count(items.length)}. Of ${population[k]}, ${count(s.candidates)} report ${def.thresholdText}.${excluded.length ? ` ${list(excluded.map(([r, v]) => `${count(v.length)} ${reasons[r] ?? r}`))} and have no dossier.` : ' Every one of them has a dossier.'}` },
      { question: 'Which files supply the records?', answer: `The committed ${def.register} edition captured ${dayLabel(editionDate[k])} from ${def.publisher}. Each source file is listed with its URL, size and SHA-256 fingerprint in the Wave 1c manifest.` },
      { question: 'How many organizations does the edition list?', answer: `${sentence(population[k])}.` },
      labels.length
        ? { question: `Which ${def.labelPlural} do the dossier organizations carry most often?`, answer: `${list(labels.map(([l, n]) => `“${def.labelText!(l)}” (${count(n)})`))}.` }
        : { question: 'Does the edition carry category labels?', answer: `No. The committed ${def.register} edition has no published category field, so this register has no cause hubs and no column on the Cause × Country page.` },
      { question: 'Which periods do the dossier figures cover?', answer: k === 'nz' || k === 'ni' ? `The latest periods ${dayRange(items.map((d) => latest(d).end!))}.` : `${sentence(def.periodNoun)}s ${yearRange(items.flatMap((d) => d.periods.map((x) => x.label!)))}; each dossier shows every ${def.periodNoun} in the edition.` },
      { question: 'Does Charitology rate or rank these organizations?', answer: 'No. Dossiers are listed alphabetically, figures are copied as published, and Charitology computes no ratio, score or estimate from them.' },
    ];
  }
  function registryIndexFaqs(k: HubKey): FaqEntry[] {
    const def = H[k];
    const c = hubs[k].counts;
    const keys = registryHubKeys(k);
    const biggest = top(new Map(keys.map((key) => [hubs[k].hubs[key].label, hubs[k].hubs[key].count])), 3);
    const small = Object.entries(c.labels as Record<string, number>).filter(([, n]) => n < hubMin).length;
    const capped = keys.filter((key) => hubs[k].hubs[key].capped).length;
    return [
      { question: `Why does ${def.country} have hubs but no dossiers?`, answer: `The committed ${def.register} edition publishes registry and classification fields but no per-organization financial figures, so Wave 1c groups its entries by the register’s own ${def.labelPlural} instead.` },
      { question: 'How many organizations does the edition list?', answer: `${count(c.editionOrganizations)}. The hubs cover ${count(c.population)} ${def.population}.` },
      { question: 'How many hubs are there?', answer: `${count(keys.length)}: one per ${def.labelNoun} carried by at least ${hubMin} organizations.${small ? ` ${count(small)} label${small > 1 ? 's' : ''} with fewer ${small > 1 ? 'get' : 'gets'} no hub.` : ''}` },
      { question: `Which ${def.labelPlural} are most common?`, answer: `${list(biggest.map(([l, n]) => `“${l}” (${count(n)})`))}.` },
      { question: 'Do the hubs list every organization?', answer: capped ? `Hubs with at most ${count(sel[k].listCap)} organizations list all of them. ${count(capped)} larger hubs list the ${count(sel[k].listCap)} most recently registered and link the full set in the downloadable hub file.` : 'Yes. Every hub lists every organization carrying its label, alphabetically.' },
      { question: 'Which source does this use?', answer: `The committed edition captured ${dayLabel(editionDate[k])} from ${def.publisher}. Each source file is listed with its URL, size and SHA-256 fingerprint in the Wave 1c manifest.` },
    ];
  }

  // ---------- Cause × Country (Wave 1c registers) ----------
  const CAUSE_KEYS: CauseKey[] = causes.registers;
  const causeName: Record<CauseKey, string> = { ni: 'Northern Ireland', se: 'Sweden', mx: 'Mexico', at: 'Austria', fi: 'Finland', lv: 'Latvia', dk: 'Denmark', hr: 'Croatia' };
  const causeClassification: Record<CauseKey, string> = {
    ni: 'CCNI charitable purpose', se: 'Svensk Insamlingskontroll purpose', mx: 'SAT authorized category', at: 'BMF category',
    fi: 'PRH industry label', lv: 'SLO public benefit field', dk: 'Skattestyrelsen approval marker', hr: 'Activity domain',
  };
  const causeLabel = (r: CauseKey, key: string) => (causes.labels[r] as [string, string][]).find(([kk]) => kk === key)![1];
  const causeCount = (r: CauseKey, key: string) => (r === 'ni' || r === 'se' || r === 'mx' ? (labelMaps[r].get(key) ?? []).length : hubs[r].counts.labels[key] ?? 0);
  const causeUnit = (r: CauseKey) => (r === 'ni' || r === 'se' || r === 'mx' ? 'dossiers' : 'organizations');
  const causeHub = (r: CauseKey, key: string): string | null => {
    if (r === 'ni' || r === 'se' || r === 'mx') return dossierHubs[r].includes(key) ? dossierHubPath(r, key) : null;
    return hubs[r].hubs[key] ? registryHubPath(r, key) : null;
  };
  const causeDisplay = (r: CauseKey, key: string) => (r === 'fi' ? `${causeLabel(r, key)} (${key.split('|')[0]})` : r === 'at' ? `${causeLabel(r, key)} (${key})` : causeLabel(r, key));

  function dossierIndexFaqsWave1c() {
    const total = DOSSIER_KEYS.reduce((n, k) => n + sorted[k].length, 0);
    return {
      total,
      text: `Wave 1c adds ${count(total)} dossiers from ${list(DOSSIER_KEYS.map((k) => `${D[k].country} (${count(sorted[k].length)})`))}, and register hubs for ${list(HUB_KEYS.map((k) => H[k].country))}.`,
    };
  }

  return {
    manifest, sel, src, editions, counts, hubs, causes, D, H, hubMin, sorted, labelMaps, dossierHubs, editionDate,
    base, dossierPath, dossierHubPath, dossierHubTitle, registryHubPath, registryHubKeys, latest, cell, facts,
    dossierFaqs, dossierHubFaqs, registryHubFaqs, indexFaqs, registryIndexFaqs, dossierIndexFaqsWave1c,
    CAUSE_KEYS, causeName, causeClassification, causeLabel, causeCount, causeUnit, causeHub, causeDisplay, niPurposes, atCats, mxActivities, plVoiv,
    exclusionText,
  };
}

export type Wave1c = ReturnType<typeof model>;

/** Every Wave 1c page, for pages.ts and the partitioned sitemap. */
export function wave1cPages() {
  const w = wave1c();
  const hubs: { path: string; title: string }[] = [];
  for (const k of DOSSIER_KEYS) {
    hubs.push({ path: w.base(w.D[k].slug), title: `${w.D[k].country} charity dossiers: ${w.D[k].register}` });
    for (const l of w.dossierHubs[k]) hubs.push({ path: w.dossierHubPath(k, l), title: w.dossierHubTitle(k, l) });
  }
  for (const k of HUB_KEYS) {
    hubs.push({ path: w.base(w.H[k].slug), title: `${w.H[k].country} register hubs: ${w.H[k].register}` });
    for (const key of w.registryHubKeys(k)) hubs.push({ path: w.registryHubPath(k, key), title: w.H[k].hubTitle(w.hubs[k].hubs[key].label, key) });
  }
  return [
    ...hubs.map((h) => ({ ...h, section: 'Verified registry hubs, Wave 1c' })),
    ...DOSSIER_KEYS.flatMap((k) => w.sorted[k].map((d) => ({ path: w.dossierPath(k, d), title: w.D[k].titleOf(d), section: 'Verified charity dossiers, Wave 1c' }))),
  ];
}
