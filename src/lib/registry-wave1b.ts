// Build-only loader and page model for the Wave 1b verified charity dossiers:
// Scotland (OSCR), Australia (ACNC) and Canada (CRA), their cause hubs and the
// label-level Cause × Country index. Every figure is copied from the committed,
// hash-pinned dataset built by scripts/build-registry-wave1b.py from official
// registry files. Nothing here estimates, scores, ranks or rates an
// organization. Missing stays missing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FaqEntry } from './structured-data';
import { wave1, count, dayLabel, gbp, WAVE1_BASE } from './registry-wave1';

const ROOT = resolve('public/data/registry-wave1b');
export const WAVE1B_DATA_PATH = '/data/registry-wave1b/';
export const SC_BASE = `${WAVE1_BASE}scotland/`;
export const AU_BASE = `${WAVE1_BASE}australia/`;
export const CA_BASE = `${WAVE1_BASE}canada/`;
export const CAUSE_PATH = `${WAVE1_BASE}cause-by-country/`;
export const WAVE1B_SITEMAP = 'sitemap-registries-wave1b.xml';
export const WAVE1B_SITEMAP_SECTIONS = new Set(['Verified charity dossiers, Wave 1b', 'Verified registry hubs, Wave 1b']);

export interface ScPeriod {
  end: string;
  received: string;
  grossIncome: string;
  grossExpenditure: string;
  record: number;
  incomeDetail: Record<string, string> | null;
  spendingDetail: Record<string, string> | null;
}
export interface ScDossier {
  number: string;
  name: string;
  editionName: string;
  knownAs: string | null;
  status: string;
  editionStatus: string;
  registered: string | null;
  constitutionalForm: string | null;
  regulatoryType: string;
  editionRegulatoryType: string;
  mainOperatingLocation: string | null;
  geographicalSpread: string | null;
  designatedReligiousBody: string | null;
  parent: { name: string | null; number: string | null; country: string | null } | null;
  purposes: string[];
  beneficiaries: string[];
  activities: string[];
  registerRecord: number;
  editionRegistryRecord: number;
  periods: ScPeriod[];
}
export interface AuPeriod {
  aisYear: number;
  start: string;
  end: string;
  consolidation: 'y' | 'n' | null;
  accountingBasis: string | null;
  record: number;
  totalRevenue: string | null;
  totalExpenses: string | null;
  revenueFromGovernment: string | null;
  grantsInAustralia: string | null;
  grantsOutsideAustralia: string | null;
}
export interface AuDossier {
  abn: string;
  name: string;
  editionName: string;
  otherNames: string | null;
  townCity: string | null;
  state: string | null;
  country: string | null;
  registered: string | null;
  established: string | null;
  charitySize: string | null;
  financialYearEnd: string | null;
  operatesIn: string[];
  operatingCountries: string[];
  subtypes: string[];
  beneficiaries: string[];
  registerRecord: number;
  periods: AuPeriod[];
}
export interface CaPeriod {
  end: string;
  formVersion: string;
  section: string;
  accountingBasis: string | null;
  record: number;
  identificationSourceRecord: number;
  totalRevenue: string | null;
  totalExpenditures: string | null;
  charitableProgramExpenditures: string | null;
  receivedFromRegisteredCharities: string | null;
  giftsToQualifiedDonees: string | null;
  grantsToOtherGrantees: string | null;
}
export interface CaDossier {
  bn: string;
  name: string;
  identificationName: string;
  accountName: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  category: string;
  subCategory: string;
  designation: string;
  identificationYear: string;
  identificationRecord: number;
  periods: CaPeriod[];
}
interface ScHubs { registerRows: number; statuses: Record<string, number>; regulatoryTypes: Record<string, number>; purposes: Record<string, number> }
interface AuHubs { registerRows: number; registerAbns: number; withheldAbns: number; subtypes: Record<string, number>; charitySizes: Record<string, number> }
interface CaHubs { identification: Record<string, { rows: number; categories: Record<string, number>; designations: Record<string, number> }> }
interface CraCodes {
  source: { title: string; publisher: string; url: string; dataset: string; lastModified: string; retrievedAt: string; bytes: number; sha256: string; licence: string };
  categories: Record<string, string>;
  categoryHeadings: Record<string, string>;
  headings: string[];
  designations: Record<string, string>;
}
interface AcncFields {
  source: { title: string; publisher: string; url: string; dataset: string; lastModified: string; retrievedAt: string; bytes: number; sha256: string; licence: string };
  subtypes: { column: string; label: string }[];
  beneficiaries: { column: string; label: string }[];
  operatingStates: string[];
}
export type Registry = 'us' | 'ew' | 'scotland' | 'australia' | 'canada';
interface CauseGroups {
  rule: string;
  labels: Record<Registry, [string, string][]>;
  groups: { id: string; name: string; stems: string[]; matches: Record<Registry, string[]> }[];
  ungrouped: Record<Registry, string[]>;
}

function readVerified(name: string, sha256?: string) {
  const bytes = readFileSync(join(ROOT, name));
  if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error(`Wave 1b data file changed without a rebuilt manifest: ${name}`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

function load() {
  const manifest = readVerified('manifest.json');
  if (manifest.format !== 'charitology-registry-wave1b-v1') throw new Error('Unexpected Wave 1b manifest.');
  const out = manifest.outputs;
  return {
    manifest,
    sc: readVerified(out.scotland.path, out.scotland.sha256) as ScDossier[],
    scHubs: readVerified(out.scotlandHubs.path, out.scotlandHubs.sha256) as ScHubs,
    au: readVerified(out.australia.path, out.australia.sha256) as AuDossier[],
    auHubs: readVerified(out.australiaHubs.path, out.australiaHubs.sha256) as AuHubs,
    ca: readVerified(out.canada.path, out.canada.sha256) as CaDossier[],
    caHubs: readVerified(out.canadaHubs.path, out.canadaHubs.sha256) as CaHubs,
    causes: readVerified(out.causes.path, out.causes.sha256) as CauseGroups,
    cra: readVerified(out.craCodes.path, out.craCodes.sha256) as CraCodes,
    acnc: readVerified(out.acncFields.path, out.acncFields.sha256) as AcncFields,
  };
}

let cached: ReturnType<typeof model> | undefined;
export function wave1b() {
  return (cached ??= model());
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const slug = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STOP = new Set(['a', 'and', 'as', 'be', 'by', 'in', 'of', 'or', 'the', 'to', 'with']);
/** First seven words of the slug, without trailing function words. */
export const shortSlug = (text: string) => {
  const words = slug(text.replace(/[[\]]/g, '')).split('-').slice(0, 7);
  while (words.length > 1 && STOP.has(words.at(-1)!)) words.pop();
  return words.join('-');
};
export const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
function grouped(value: string) {
  const negative = value.startsWith('-');
  const [whole, cents] = value.replace('-', '').split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { negative, text: cents ? `${digits}.${cents}` : digits };
}
export const aud = (value: string) => {
  const { negative, text } = grouped(value);
  return `${negative ? '−' : ''}A$${text}`;
};
export const cad = (value: string) => {
  const { negative, text } = grouped(value);
  return `${negative ? '−' : ''}C$${text}`;
};
export const scDossierPath = (number: string) => `${SC_BASE}charity/${number.toLowerCase()}/`;
export const auDossierPath = (abn: string) => `${AU_BASE}abn/${abn}/`;
export const caDossierPath = (bn: string) => `${CA_BASE}bn/${bn.toLowerCase()}/`;

export const SC_INCOME_LINES: [string, string][] = [
  ['donationsAndLegaciesGBP', 'Donations and legacies income'],
  ['charitableActivitiesIncomeGBP', 'Charitable activities income'],
  ['otherTradingIncomeGBP', 'Other trading activities income'],
  ['investmentsIncomeGBP', 'Investments income'],
  ['otherIncomeGBP', 'Other income'],
];
export const SC_SPENDING_LINES: [string, string][] = [
  ['raisingFundsGBP', 'Raising funds spending'],
  ['charitableActivitiesSpendingGBP', 'Charitable activities spending'],
  ['otherSpendingGBP', 'Other spending'],
];
export const AU_LINES: [keyof AuPeriod, string, string][] = [
  ['totalRevenue', 'Total revenue', 'AIS “total revenue”'],
  ['totalExpenses', 'Total expenses', 'AIS “total expenses”'],
  ['revenueFromGovernment', 'Revenue from government', 'AIS “revenue from government”'],
  ['grantsInAustralia', 'Grants and donations made for use in Australia', 'AIS “grants and donations made for use in Australia”'],
  ['grantsOutsideAustralia', 'Grants and donations made for use outside Australia', 'AIS “grants and donations made for use outside Australia”'],
];
export const CA_LINES: [keyof CaPeriod, string, string][] = [
  ['totalRevenue', 'Total revenue', 'T3010 line 4700'],
  ['totalExpenditures', 'Total expenditures', 'T3010 line 5100'],
  ['charitableProgramExpenditures', 'Charitable program expenditures', 'T3010 line 5000'],
  ['receivedFromRegisteredCharities', 'Received from registered charities', 'T3010 line 4510'],
  ['giftsToQualifiedDonees', 'Gifts to qualified donees', 'T3010 line 5050'],
  ['grantsToOtherGrantees', 'Grants to other grantees', 'T3010 line 5045'],
];
export const consolidationLabel = (value: string | null) => (value === 'y' ? 'Yes (y)' : value === 'n' ? 'No (n)' : 'Not supplied');
export const REGISTRY_NAMES: Record<Registry, string> = {
  us: 'United States', ew: 'England and Wales', scotland: 'Scotland', australia: 'Australia', canada: 'Canada',
};
export const CLASSIFICATION_NAMES: Record<Registry, string> = {
  us: 'IRS NTEE major group',
  ew: 'Charity Commission “What” classification',
  scotland: 'OSCR charitable purpose',
  australia: 'ACNC charity subtype',
  canada: 'CRA charity category',
};

const sortByName = <T extends { name: string }>(key: (item: T) => string) => (a: T, b: T) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || key(a).localeCompare(key(b));

function model() {
  const { manifest, sc, scHubs, au, auHubs, ca, caHubs, causes, cra, acnc } = load();
  const w1 = wave1();
  const src = manifest.sources;
  const hubMin: number = manifest.selection.hubMinimumDossiers;
  const scThreshold = gbp(String(manifest.selection.scotland.thresholdGBP));
  const auThreshold = aud(String(manifest.selection.australia.thresholdAUD));
  const caThreshold = cad(String(manifest.selection.canada.thresholdCAD));
  const registerDate = dayLabel(src.oscrRegister.memberDate);
  const scEdition = dayLabel(src.oscrReturns.edition);
  const acncDate = dayLabel(new Date(src.acncRegister.lastModified).toISOString().slice(0, 10));
  const auEdition = dayLabel(src.acncAis.edition);
  const craIdentDate = dayLabel(new Date(src.craIdentification['2024'].lastModified).toISOString().slice(0, 10));
  const caEdition = dayLabel(src.craFinancial.edition);
  const subtypeLabel = (column: string) => acnc.subtypes.find((s) => s.column === column)!.label;
  const beneficiaryLabel = (column: string) => acnc.beneficiaries.find((b) => b.column === column)!.label;
  const categoryLabel = (code: string) => cra.categories[code];
  const designationLabel = (code: string) => cra.designations[code];

  const scSorted = [...sc].sort(sortByName((d) => d.number));
  const auSorted = [...au].sort(sortByName((d) => d.abn));
  const caSorted = [...ca].sort(sortByName((d) => d.bn));
  const by = <T,>(items: T[], keys: (item: T) => string[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) for (const k of keys(item)) map.set(k, [...(map.get(k) ?? []), item]);
    return map;
  };
  const scByPurpose = by(scSorted, (d) => d.purposes);
  const auBySubtype = by(auSorted, (d) => d.subtypes);
  const caByCategory = by(caSorted, (d) => [d.category]);
  const caByDesignation = by(caSorted, (d) => [d.designation]);
  const atLeast = <T,>(map: Map<string, T[]>) => new Set([...map].filter(([, items]) => items.length >= hubMin).map(([k]) => k));
  const scPurposeHubs = [...atLeast(scByPurpose)].sort();
  const auSubtypeHubs = acnc.subtypes.map((s) => s.column).filter((c) => atLeast(auBySubtype).has(c));
  const caCategoryHubs = [...atLeast(caByCategory)].sort();
  const caDesignationHubs = [...atLeast(caByDesignation)].sort();
  const scPurposePath = (label: string) => `${SC_BASE}purposes/${shortSlug(label)}/`;
  const auSubtypePath = (column: string) => `${AU_BASE}subtypes/${shortSlug(subtypeLabel(column))}/`;
  const caCategoryPath = (code: string) => `${CA_BASE}categories/${code}-${shortSlug(categoryLabel(code))}/`;
  const caDesignationPath = (code: string) => `${CA_BASE}designations/${code.toLowerCase()}-${shortSlug(designationLabel(code))}/`;
  const scHubSet = new Set(scPurposeHubs);
  const auHubSet = new Set(auSubtypeHubs);
  const caCategorySet = new Set(caCategoryHubs);
  const caDesignationSet = new Set(caDesignationHubs);

  const tally = <T,>(items: T[], key: (item: T) => string | null) => {
    const counter = new Map<string, number>();
    for (const item of items) {
      const k = key(item);
      if (k !== null) counter.set(k, (counter.get(k) ?? 0) + 1);
    }
    return counter;
  };
  const top = (counter: Map<string, number>, n: number) =>
    [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
  const positive = (value: string | null) => value !== null && Number(value) > 0;
  const dayRange = (days: string[]) => {
    const sorted = [...days].sort();
    return sorted[0] === sorted.at(-1) ? `all end on ${dayLabel(sorted[0])}` : `end between ${dayLabel(sorted[0])} and ${dayLabel(sorted.at(-1)!)}`;
  };
  const latestSc = (d: ScDossier) => d.periods[0];
  const latestAu = (d: AuDossier) => d.periods[0];
  const latestCa = (d: CaDossier) => d.periods[0];
  const quoted = (items: string[]) => list(items.map((item) => `“${item}”`));
  const scPlace = (d: ScDossier) => d.mainOperatingLocation;
  const auPlace = (d: AuDossier) => [d.townCity, d.state].filter(Boolean).join(', ') || null;
  const caPlace = (d: CaDossier) => [d.city, d.province].filter(Boolean).join(', ') || null;
  const crossBorder = scSorted.filter((d) => d.regulatoryType === 'Cross Border').length;
  const excludedAuNames = new Map<string, string>(manifest.selection.australia.excludedEditionNames);

  // ---------- Scotland ----------
  function scDossierFaqs(d: ScDossier): FaqEntry[] {
    const p = latestSc(d);
    const faqs: FaqEntry[] = [
      {
        question: `What is the Scottish charity number of ${d.name}?`,
        answer: `The Scottish Charity Register download dated ${registerDate} (row ${count(d.registerRecord)}) lists ${d.name} as charity number ${d.number}${d.registered ? `, registered on ${dayLabel(d.registered)}` : ''}. Its charity status is ${d.status} and its regulatory type is ${d.regulatoryType}.`,
      },
      {
        question: `What constitutional form and operating area does OSCR record for ${d.name}?`,
        answer: [
          d.constitutionalForm ? `The register records the constitutional form as ${d.constitutionalForm}.` : 'The register supplies no constitutional form.',
          d.mainOperatingLocation ? `Its main operating location is ${d.mainOperatingLocation}.` : 'No main operating location is supplied.',
          d.geographicalSpread ? `Its geographical spread is “${d.geographicalSpread}”.` : 'No geographical spread is supplied.',
        ].join(' '),
      },
      {
        question: `What gross income did ${d.name} report for its latest financial year?`,
        answer: `For the financial year ending ${dayLabel(p.end)}, OSCR’s five-year return export (record ${count(p.record)}) reports gross income of ${gbp(p.grossIncome)}.`,
      },
      {
        question: `What gross expenditure did ${d.name} report for that year?`,
        answer: `Gross expenditure was ${gbp(p.grossExpenditure)} for the financial year ending ${dayLabel(p.end)}. OSCR recorded the annual return as received on ${dayLabel(p.received)}.`,
      },
      {
        question: `Which charitable purposes does the Scottish Charity Register list for ${d.name}?`,
        answer: d.purposes.length
          ? `The register lists ${d.purposes.length} purpose${d.purposes.length > 1 ? 's' : ''}: ${quoted(d.purposes)}.`
          : 'The register download lists no purpose for this charity.',
      },
    ];
    if (p.incomeDetail) {
      const parts = SC_INCOME_LINES.map(([key, label]) => `${label.toLowerCase()} ${gbp(p.incomeDetail![key])}`);
      faqs.push({
        question: `How does the latest return break down the income of ${d.name}?`,
        answer: `For the year ending ${dayLabel(p.end)}, the return reports ${list(parts)}.`,
      });
    } else {
      faqs.push({
        question: `Which beneficiaries and activities does the register list for ${d.name}?`,
        answer: [
          d.beneficiaries.length ? `Beneficiaries: ${quoted(d.beneficiaries)}.` : 'No beneficiary group is listed.',
          d.activities.length ? `Activities: ${quoted(d.activities)}.` : 'No activity is listed.',
        ].join(' '),
      });
    }
    return faqs;
  }

  function scPurposeFaqs(label: string, items: ScDossier[]): FaqEntry[] {
    const others = top(tally(items.flatMap((d) => d.purposes.filter((x) => x !== label)), (x) => x), 3);
    const who = top(tally(items.flatMap((d) => d.beneficiaries), (x) => x), 3);
    const kinds = top(tally(items, (d) => d.regulatoryType), 3);
    return [
      {
        question: `How many Scottish charities list the purpose “${label}”?`,
        answer: `${count(scHubs.purposes[label])} of the ${count(scHubs.registerRows)} charities in the Scottish Charity Register download dated ${registerDate} list “${label}” among their purposes.`,
      },
      {
        question: 'How many of them have a Wave 1b dossier?',
        answer: `${count(items.length)}: every charity in the committed OSCR edition of ${scEdition} with this purpose whose latest included annual return reports gross income of at least ${scThreshold}. They are listed alphabetically below.`,
      },
      {
        question: 'Which other purposes do these charities list most often?',
        answer: others.length ? `${list(others.map(([text, n]) => `“${text}” (${count(n)})`))}.` : 'None of these dossiers lists another purpose.',
      },
      {
        question: 'Which beneficiary groups do these charities list most often?',
        answer: who.length ? `${list(who.map(([text, n]) => `“${text}” (${count(n)})`))}, from the register’s beneficiary field.` : 'None of these dossiers lists a beneficiary group.',
      },
      {
        question: 'Which financial years do the figures cover?',
        answer: `The latest financial years ${dayRange(items.map((d) => latestSc(d).end))}. Gross income and gross expenditure come from OSCR’s five-year return export in the committed edition of ${scEdition}.`,
      },
      {
        question: 'Which regulatory types appear among these dossiers?',
        answer: `${list(kinds.map(([text, n]) => `${text} (${count(n)})`))}, as recorded in the register download.`,
      },
    ];
  }

  function scIndexFaqs(): FaqEntry[] {
    const sel = manifest.selection.scotland;
    const purposes = top(tally(scSorted.flatMap((d) => d.purposes), (x) => x), 3);
    const kinds = top(tally(scSorted, (d) => d.regulatoryType), 3);
    return [
      {
        question: 'How many Scottish charities have a Wave 1b dossier?',
        answer: `${count(scSorted.length)}. Of the ${count(sel.editionOrganizations)} charity numbers in the committed OSCR edition of ${scEdition}, ${count(sel.candidates)} report gross income of at least ${scThreshold} in their latest included annual return. ${sel.excluded.notInRegisterDownload.length ? `${count(sel.excluded.notInRegisterDownload.length)} of those are absent from the register download dated ${registerDate} and have no dossier.` : `The register download dated ${registerDate} still lists all of them.`}`,
      },
      {
        question: 'Which OSCR files supply the dossier records?',
        answer: `Register details, purposes, beneficiaries and activities come from the Scottish Charity Register download dated ${registerDate} (${src.oscrRegister.member}). Gross income, gross expenditure and their breakdowns come from the five-year return export in the committed edition of ${scEdition} (${src.oscrReturns.member}). Both are published under the Open Government Licence v3.0.`,
      },
      {
        question: 'How many charities does the register download list?',
        answer: `${count(scHubs.registerRows)} charities: ${list(Object.entries(scHubs.statuses).map(([status, n]) => `${count(n)} with status ${status}`))}.`,
      },
      {
        question: 'Which purposes do the dossier charities list most often?',
        answer: `${list(purposes.map(([text, n]) => `“${text}” (${count(n)})`))}. A charity can list several of the 16 purposes in the register.`,
      },
      {
        question: 'How many dossiers are cross-border registrations?',
        answer: `${list(kinds.map(([text, n]) => `${count(n)} ${text}`))}, by the register’s regulatory type. A Cross Border charity’s Scottish registration can describe the same organization as a registration in England and Wales, so totals are not added across registers.`,
      },
      {
        question: 'Which financial years do the dossier figures cover?',
        answer: `The latest financial years ${dayRange(scSorted.map((d) => latestSc(d).end))}. Each figure cites its record number in OSCR’s five-year return export.`,
      },
    ];
  }

  // ---------- Australia ----------
  function auDossierFaqs(d: AuDossier): FaqEntry[] {
    const p = latestAu(d);
    const period = `${dayLabel(p.start)} to ${dayLabel(p.end)}`;
    const faqs: FaqEntry[] = [
      {
        question: `What ABN and registration details does the ACNC register list for ${d.name}?`,
        answer: `The ACNC Registered Charities dataset (last modified ${acncDate}, row ${count(d.registerRecord)}) lists ${d.name} under ABN ${d.abn}${d.registered ? `, registered with the ACNC on ${dayLabel(d.registered)}` : ''}.${d.charitySize ? ` Its charity size is ${d.charitySize}.` : ' It supplies no charity size.'}${auPlace(d) ? ` Its business address is in ${auPlace(d)}.` : ''}`,
      },
      {
        question: `Which charity subtypes is ${d.name} registered with?`,
        answer: d.subtypes.length
          ? `The register records ${d.subtypes.length} subtype${d.subtypes.length > 1 ? 's' : ''}: ${quoted(d.subtypes.map(subtypeLabel))}.`
          : 'The register dataset records no subtype for this charity.',
      },
      {
        question: `What total revenue did ${d.name} report in its latest Annual Information Statement?`,
        answer: p.totalRevenue === null
          ? `The ${p.aisYear} Annual Information Statement extract (record ${count(p.record)}) supplies no total revenue for ${period}.`
          : `For ${period}, the ${p.aisYear} Annual Information Statement extract (record ${count(p.record)}) reports total revenue of ${aud(p.totalRevenue)}${p.revenueFromGovernment !== null ? `, including revenue from government of ${aud(p.revenueFromGovernment)}` : ''}.`,
      },
      {
        question: `What total expenses did ${d.name} report for that period?`,
        answer: `${p.totalExpenses === null ? 'The record supplies no total expenses' : `Total expenses were ${aud(p.totalExpenses)}`} for ${period}.${[
          p.grantsInAustralia !== null ? ` Grants and donations made for use in Australia were ${aud(p.grantsInAustralia)}.` : '',
          p.grantsOutsideAustralia !== null ? ` Grants and donations made for use outside Australia were ${aud(p.grantsOutsideAustralia)}.` : '',
        ].join('')}`,
      },
      {
        question: `Which beneficiaries does the ACNC register list for ${d.name}?`,
        answer: d.beneficiaries.length
          ? `${count(d.beneficiaries.length)} beneficiary group${d.beneficiaries.length > 1 ? 's' : ''}: ${list(d.beneficiaries.map(beneficiaryLabel))}.`
          : 'The register dataset lists no beneficiary group for this charity.',
      },
    ];
    faqs.push(d.operatesIn.length || d.operatingCountries.length
      ? {
          question: `Where does ${d.name} operate, according to the ACNC register?`,
          answer: [
            d.operatesIn.length ? `It reports operating in ${list(d.operatesIn)}.` : 'It reports no Australian state or territory.',
            d.operatingCountries.length ? `The operating countries field lists ${list(d.operatingCountries)} (ISO 3166-1 alpha-3 codes).` : 'The operating countries field is blank.',
          ].join(' '),
        }
      : {
          question: `How many AIS periods does this dossier include for ${d.name}?`,
          answer: `${d.periods.length} period${d.periods.length > 1 ? 's' : ''}, ending ${list(d.periods.map((x) => dayLabel(x.end)))}, from the ${list(d.periods.map((x) => String(x.aisYear)))} Annual Information Statement extract${d.periods.length > 1 ? 's' : ''}.`,
        });
    return faqs;
  }

  function auSubtypeFaqs(column: string, items: AuDossier[]): FaqEntry[] {
    const label = subtypeLabel(column);
    const others = top(tally(items.flatMap((d) => d.subtypes.filter((x) => x !== column)), (x) => x), 3);
    const who = top(tally(items.flatMap((d) => d.beneficiaries), (x) => x), 3);
    const states = top(tally(items, (d) => d.state), 3);
    return [
      {
        question: `How many charities in the ACNC dataset are registered with the subtype “${label}”?`,
        answer: `${count(auHubs.subtypes[column])} of the ${count(auHubs.registerRows)} rows in the ACNC Registered Charities dataset last modified ${acncDate} carry this subtype.`,
      },
      {
        question: 'How many of them have a Wave 1b dossier?',
        answer: `${count(items.length)}: every organization in the committed AIS edition with this subtype whose latest dated reporting period reports total revenue of at least ${auThreshold}. They are listed alphabetically below.`,
      },
      {
        question: 'Which other subtypes do these charities hold most often?',
        answer: others.length ? `${list(others.map(([c, n]) => `“${subtypeLabel(c)}” (${count(n)})`))}.` : 'None of these dossiers holds another subtype.',
      },
      {
        question: 'Which beneficiary groups do these charities list most often?',
        answer: who.length ? `${list(who.map(([c, n]) => `${beneficiaryLabel(c)} (${count(n)})`))}, from the register’s beneficiary fields.` : 'None of these dossiers lists a beneficiary group.',
      },
      {
        question: 'Which reporting periods do the figures cover?',
        answer: `The latest dated reporting periods ${dayRange(items.map((d) => latestAu(d).end))}. Figures come from the 2023 and 2024 Annual Information Statement extracts in the committed edition of ${auEdition}.`,
      },
      {
        question: 'Which business-address states appear most often among these dossiers?',
        answer: states.length ? `${list(states.map(([st, n]) => `${st} (${count(n)})`))}. A business address does not show where services are delivered.` : 'None of these register rows supplies a state.',
      },
    ];
  }

  function auIndexFaqs(): FaqEntry[] {
    const sel = manifest.selection.australia;
    const subtypes = top(tally(auSorted.flatMap((d) => d.subtypes), (x) => x), 3);
    const excluded: string[] = sel.excluded.notInRegisterDataset;
    const groups = excluded.filter((abn) => /ACNC[\s_\u00a0\u202f]*Group/i.test(excludedAuNames.get(abn) ?? '')).length;
    return [
      {
        question: 'How many Australian charities have a Wave 1b dossier?',
        answer: `${count(auSorted.length)}. Of the ${count(sel.editionOrganizations)} organizations in the committed AIS edition of ${auEdition}, ${count(sel.candidates)} report total revenue of at least ${auThreshold} for their latest dated reporting period. ${count(excluded.length)} of those identifiers are not in the ACNC Registered Charities dataset last modified ${acncDate} and have no dossier.`,
      },
      {
        question: 'Which ACNC files supply the dossier records?',
        answer: `Registration details, subtypes, beneficiaries and operating locations come from the ACNC Registered Charities dataset last modified ${acncDate}. Financial figures come from the 2023 and 2024 Annual Information Statement extracts in the committed edition. Both are published under Creative Commons Attribution 3.0 Australia.`,
      },
      {
        question: 'How many charities does the ACNC dataset list?',
        answer: `${count(auHubs.registerRows)} rows. ${count(auHubs.withheldAbns)} rows have no ABN because it is withheld from the dataset, and ${count(auHubs.registerAbns)} distinct ABNs remain.`,
      },
      {
        question: 'Which subtypes do the dossier charities hold most often?',
        answer: `${list(subtypes.map(([c, n]) => `“${subtypeLabel(c)}” (${count(n)})`))}. A charity can hold several of the 14 subtypes.`,
      },
      {
        question: 'Why do some large AIS records have no dossier?',
        answer: `${count(excluded.length)} AIS identifiers above the threshold do not appear in the register dataset. ${count(groups)} of them carry an AIS name containing “ACNC Group” (in some spelling), and are not listed in the register under that identifier. Charitology does not guess why the others are absent.`,
      },
      {
        question: 'Which reporting periods do the dossier figures cover?',
        answer: `The latest dated reporting periods ${dayRange(auSorted.map((d) => latestAu(d).end))}. Each figure cites its AIS year and record number in the ACNC extract.`,
      },
    ];
  }

  // ---------- Canada ----------
  function caDossierFaqs(d: CaDossier): FaqEntry[] {
    const p = latestCa(d);
    const fiscal = `the fiscal period ending ${dayLabel(p.end)}`;
    const heading = cra.categoryHeadings[d.category];
    return [
      {
        question: `What registration number does the CRA list for ${d.name}?`,
        answer: `The CRA ${d.identificationYear} List of charities identification file (re-published ${craIdentDate}, record ${count(d.identificationRecord)}) lists registration number ${d.bn} with the legal name ${d.identificationName}${caPlace(d) ? ` and an address in ${caPlace(d)}` : ''}.`,
      },
      {
        question: `Which CRA category and designation does ${d.name} carry?`,
        answer: `Category ${d.category}, ${categoryLabel(d.category)}, listed under “${heading}” in the CRA codes list, with sub-category code ${d.subCategory}. Designation ${d.designation}: ${designationLabel(d.designation)}.`,
      },
      {
        question: `What total revenue did ${d.name} report for ${fiscal}?`,
        answer: p.totalRevenue === null
          ? `The T3010 financial record ${count(p.record)} supplies no total revenue (line 4700) for ${fiscal}.`
          : `The T3010 financial record ${count(p.record)} reports total revenue of ${cad(p.totalRevenue)} on line 4700 for ${fiscal}. The filer used Section ${p.section} of the return.`,
      },
      {
        question: `What total expenditures did ${d.name} report for that period?`,
        answer: `${p.totalExpenditures === null ? 'No total expenditures (line 5100) are supplied' : `Total expenditures were ${cad(p.totalExpenditures)} (line 5100)`}${p.charitableProgramExpenditures !== null ? `, and expenditures on charitable programs were ${cad(p.charitableProgramExpenditures)} (line 5000)` : ''}, for ${fiscal}.`,
      },
      {
        question: `What gifts and grants did ${d.name} report for that period?`,
        answer: [
          p.giftsToQualifiedDonees !== null ? `Gifts to qualified donees: ${cad(p.giftsToQualifiedDonees)} (line 5050).` : 'No gifts to qualified donees (line 5050) are supplied.',
          p.grantsToOtherGrantees !== null ? `Grants to grantees that are not qualified donees: ${cad(p.grantsToOtherGrantees)} (line 5045).` : 'No grants to other grantees (line 5045) are supplied.',
          p.receivedFromRegisteredCharities !== null ? `Received from other registered charities: ${cad(p.receivedFromRegisteredCharities)} (line 4510).` : 'No amount received from other registered charities (line 4510) is supplied.',
        ].join(' '),
      },
      {
        question: `How many fiscal periods does this dossier include for ${d.name}?`,
        answer: `${d.periods.length} period${d.periods.length > 1 ? 's' : ''}, ending ${list(d.periods.map((x) => dayLabel(x.end)))}, from the CRA ${list([...new Set(d.periods.map((x) => x.end.slice(0, 4)))].sort())} financial file${d.periods.length > 1 ? 's' : ''} captured ${caEdition}.`,
      },
    ];
  }

  function caHubFaqs(kind: 'category' | 'designation', code: string, items: CaDossier[]): FaqEntry[] {
    const ident = caHubs.identification['2024'];
    const provinces = top(tally(items, (d) => d.province), 3);
    const periods = `The latest fiscal periods ${dayRange(items.map((d) => latestCa(d).end))}. Figures come from the CRA T3010 financial files in the committed edition captured ${caEdition}.`;
    if (kind === 'category') {
      const label = categoryLabel(code);
      const heading = cra.categoryHeadings[code];
      const designations = top(tally(items, (d) => d.designation), 3);
      const siblings = Object.keys(cra.categories).filter((c) => c !== code && cra.categoryHeadings[c] === heading);
      return [
        {
          question: `How many charities in the CRA 2024 identification file carry category ${code}, ${label}?`,
          answer: `${count(ident.categories[code] ?? 0)} of the ${count(ident.rows)} rows in the 2024 List of charities identification file re-published ${craIdentDate}.`,
        },
        {
          question: 'How many of them have a Wave 1b dossier?',
          answer: `${count(items.length)}: every account in the committed T3010 edition with this category whose latest fiscal period reports total revenue of at least ${caThreshold} on line 4700. They are listed alphabetically below.`,
        },
        {
          question: 'Which designations appear among these dossiers?',
          answer: `${list(designations.map(([c, n]) => `${designationLabel(c)} (${c}, ${count(n)})`))}.`,
        },
        {
          question: 'Which provinces appear most often among these dossiers?',
          answer: provinces.length ? `${list(provinces.map(([pr, n]) => `${pr} (${count(n)})`))}, from the address in the identification file.` : 'None of these identification rows supplies a province.',
        },
        { question: 'Which fiscal periods do the figures cover?', answer: periods },
        {
          question: `Under which CRA heading is category ${code} listed?`,
          answer: `The CRA codes list places ${label} under “${heading}”${siblings.length ? `, with ${list(siblings.map((c) => `${c} ${categoryLabel(c)}`))}` : ''}.`,
        },
      ];
    }
    const label = designationLabel(code);
    const categories = top(tally(items, (d) => d.category), 3);
    const gifts = items.filter((d) => positive(latestCa(d).giftsToQualifiedDonees)).length;
    return [
      {
        question: `How many charities in the CRA 2024 identification file carry designation ${code}, ${label}?`,
        answer: `${count(ident.designations[code] ?? 0)} of the ${count(ident.rows)} rows in the 2024 List of charities identification file re-published ${craIdentDate}.`,
      },
      {
        question: 'How many of them have a Wave 1b dossier?',
        answer: `${count(items.length)}: every account in the committed T3010 edition with this designation whose latest fiscal period reports total revenue of at least ${caThreshold} on line 4700. They are listed alphabetically below.`,
      },
      {
        question: 'Which categories appear most often among these dossiers?',
        answer: `${list(categories.map(([c, n]) => `${c} ${categoryLabel(c)} (${count(n)})`))}.`,
      },
      {
        question: 'Which provinces appear most often among these dossiers?',
        answer: provinces.length ? `${list(provinces.map(([pr, n]) => `${pr} (${count(n)})`))}, from the address in the identification file.` : 'None of these identification rows supplies a province.',
      },
      { question: 'Which fiscal periods do the figures cover?', answer: periods },
      {
        question: 'How many of these dossiers report gifts to qualified donees?',
        answer: `${count(gifts)} of ${count(items.length)} report a positive amount on line 5050 for their latest fiscal period. Others report zero or supply no value.`,
      },
    ];
  }

  function caIndexFaqs(): FaqEntry[] {
    const sel = manifest.selection.canada;
    const ident = caHubs.identification['2024'];
    const categories = top(tally(caSorted, (d) => d.category), 3);
    const designations = top(tally(caSorted, (d) => d.designation), 3);
    return [
      {
        question: 'How many Canadian charities have a Wave 1b dossier?',
        answer: `${count(caSorted.length)}. Of the ${count(sel.editionOrganizations)} charity accounts in the committed CRA T3010 edition captured ${caEdition}, ${count(sel.candidates)} report total revenue of at least ${caThreshold} on line 4700 for their latest fiscal period. ${sel.excluded.notInIdentificationFile.length ? `${count(sel.excluded.notInIdentificationFile.length)} are missing from the identification file and have no dossier.` : 'Every one of them appears in the re-published identification file for that fiscal year.'}`,
      },
      {
        question: 'Which CRA files supply the dossier records?',
        answer: `Category, sub-category, designation and address city come from the 2023 and 2024 List of charities identification files re-published ${craIdentDate}. Financial figures come from the T3010 financial files (Section D and Schedule 6) in the committed edition captured ${caEdition}. Both are published under the Open Government Licence – Canada.`,
      },
      {
        question: 'How many charities does the 2024 identification file list?',
        answer: `${count(ident.rows)} accounts: ${list(Object.entries(ident.designations).map(([c, n]) => `${count(n)} ${designationLabel(c)} (${c})`))}.`,
      },
      {
        question: 'Which categories are most common among the dossiers?',
        answer: `${list(categories.map(([c, n]) => `${c} ${categoryLabel(c)} (${count(n)})`))}, by the category code in the identification file.`,
      },
      {
        question: 'Which designations do the dossiers carry?',
        answer: `${list(designations.map(([c, n]) => `${designationLabel(c)} (${c}, ${count(n)})`))}.`,
      },
      {
        question: 'Which fiscal periods do the dossier figures cover?',
        answer: `The latest fiscal periods ${dayRange(caSorted.map((d) => latestCa(d).end))}. Each figure cites its record number in the CRA financial file.`,
      },
    ];
  }

  // ---------- Cause × Country ----------
  const registryItems = {
    us: { items: w1.us, keys: (d: (typeof w1.us)[number]) => [w1.groupOf(d)].filter(Boolean) as string[] },
    ew: { items: w1.ew, keys: (d: (typeof w1.ew)[number]) => d.what.map(([c]) => c) },
    scotland: { items: scSorted, keys: (d: ScDossier) => d.purposes },
    australia: { items: auSorted, keys: (d: AuDossier) => d.subtypes },
    canada: { items: caSorted, keys: (d: CaDossier) => [d.category] },
  } as const;
  const REGISTRIES: Registry[] = ['us', 'ew', 'scotland', 'australia', 'canada'];
  const labelText = (registry: Registry, key: string) => causes.labels[registry].find(([k]) => k === key)![1];
  const ungroupedLabel = (registry: Registry, key: string) => {
    if (!causes.ungrouped[registry].includes(key)) throw new Error(`${registry} ${key} is not ungrouped`);
    return labelText(registry, key);
  };
  const labelCount = (registry: Registry, key: string) =>
    (registryItems[registry].items as any[]).filter((d) => (registryItems[registry].keys as (d: any) => string[])(d).includes(key)).length;
  const labelHub = (registry: Registry, key: string): string | null => {
    if (registry === 'us') return w1.byGroup.has(key) ? w1.groupPath(key) : null;
    if (registry === 'ew') return w1.byPurpose.has(key) ? w1.purposePath(key) : null;
    if (registry === 'scotland') return scHubSet.has(key) ? scPurposePath(key) : null;
    if (registry === 'australia') return auHubSet.has(key) ? auSubtypePath(key) : null;
    return caCategorySet.has(key) ? caCategoryPath(key) : null;
  };
  const labelName = (registry: Registry, key: string) => {
    if (registry === 'us') return `${labelText(registry, key)} (NTEE ${key})`;
    if (registry === 'ew') return `${labelText(registry, key)} (${key})`;
    if (registry === 'canada') return `${labelText(registry, key)} (${key})`;
    return labelText(registry, key);
  };
  const groupDossiers = (registry: Registry, keys: string[]) =>
    (registryItems[registry].items as any[]).filter((d) => (registryItems[registry].keys as (d: any) => string[])(d).some((k) => keys.includes(k))).length;

  function causeFaqs(): FaqEntry[] {
    const all = causes.groups.filter((g) => REGISTRIES.every((r) => g.matches[r].length));
    const education = causes.groups.find((g) => g.id === 'education')!;
    return [
      {
        question: 'How does Charitology group causes across the five registers?',
        answer: `By label text only. A cause group lists every published category label, in each register, that contains a word starting with one of the group’s stems. ${count(causes.groups.length)} groups are defined; their stems are shown in the table and in cause-groups.json.`,
      },
      {
        question: 'Are the categories the same across registers?',
        answer: 'No. The NTEE major groups, the Charity Commission “What” classifications, the OSCR charitable purposes, the ACNC charity subtypes and the CRA charity categories are defined differently and assigned differently. A shared word is a reading aid, not an equivalence or an official crosswalk.',
      },
      {
        question: 'Which cause groups have labels in all five registers?',
        answer: all.length ? `${list(all.map((g) => g.name))}.` : 'None of the groups has a matching label in all five registers.',
      },
      {
        question: 'How many dossiers fall under education labels in each register?',
        answer: `${list(REGISTRIES.map((r) => `${REGISTRY_NAMES[r]} ${count(groupDossiers(r, education.matches[r]))}`))}. Each count is the number of that register’s dossiers carrying at least one matching label; the counts use different thresholds and are not added together.`,
      },
      {
        question: 'Can the same organization appear in more than one register?',
        answer: `Yes. ${count(crossBorder)} of the ${count(scSorted.length)} Scotland dossiers have the regulatory type Cross Border, and a cross-border charity can also hold an England and Wales registration. Charitology does not match organizations across registers here, so totals are never summed across countries.`,
      },
      {
        question: 'Which labels belong to no cause group?',
        answer: `${list(REGISTRIES.map((r) => `${REGISTRY_NAMES[r]} ${count(causes.ungrouped[r].length)}`))}. They include broad labels such as the Charity Commission’s ${list(['101', '117'].map((c) => `“${ungroupedLabel('ew', c)}”`))}, and every one is listed in cause-groups.json.`,
      },
    ];
  }

  // ---------- All dossiers index (Wave 1 and Wave 1b) ----------
  function dossierIndexFaqs(): FaqEntry[] {
    const total = w1.us.length + w1.ew.length + scSorted.length + auSorted.length + caSorted.length;
    return [
      {
        question: 'What is a Charitology verified charity dossier?',
        answer: `A page that reproduces one organization’s official registry record and published financial figures, with the source file, date, record number and fingerprint. ${count(total)} dossiers cover five registers: ${count(w1.us.length)} U.S., ${count(w1.ew.length)} England and Wales, ${count(scSorted.length)} Scotland, ${count(auSorted.length)} Australia and ${count(caSorted.length)} Canada.`,
      },
      {
        question: 'How were the organizations chosen?',
        answer: `By one published figure per register: U.S. Form 990 total revenue of at least ${w1.usThreshold}, England and Wales gross income of at least ${w1.ewThreshold}, Scottish gross income of at least ${scThreshold}, Australian AIS total revenue of at least ${auThreshold}, and Canadian T3010 total revenue of at least ${caThreshold}, each in the latest period. Inclusion is a coverage boundary, not a rating or endorsement.`,
      },
      {
        question: 'Which official registers do the dossiers use?',
        answer: 'The IRS Exempt Organizations Business Master File and Form 990 extracts, the Charity Commission for England and Wales register and annual return history, the Scottish Charity Register, the ACNC Registered Charities dataset and Annual Information Statements, and the CRA List of charities and T3010 returns.',
      },
      {
        question: 'How many hub pages group the dossiers?',
        answer: `${count(w1.stateHubs.length)} U.S. state, ${count(w1.groupHubs.length)} NTEE and ${count(w1.stateGroupHubs.length)} state and NTEE hubs, ${count(w1.purposeHubs.length)} England and Wales purpose hubs, ${count(scPurposeHubs.length)} Scottish purpose hubs, ${count(auSubtypeHubs.length)} Australian subtype hubs, and ${count(caCategoryHubs.length + caDesignationHubs.length)} Canadian category and designation hubs, plus a Cause × Country index.`,
      },
      {
        question: 'Does Charitology rate or rank these charities?',
        answer: 'No. Dossiers are listed alphabetically. They carry no star rating, score, overhead ratio or effectiveness claim, and Charitology computes no ratio from the figures.',
      },
      {
        question: 'Can I download the dossier datasets?',
        answer: 'Yes. Records, hub counts, code tables and manifests with every source URL, retrieval time and SHA-256 fingerprint are published as JSON under /data/registry-wave1/ and /data/registry-wave1b/.',
      },
    ];
  }

  return {
    manifest, cra, acnc, scHubs, auHubs, caHubs, causes, src, hubMin,
    scThreshold, auThreshold, caThreshold, registerDate, scEdition, acncDate, auEdition, craIdentDate, caEdition,
    sc: scSorted, au: auSorted, ca: caSorted,
    scByPurpose, auBySubtype, caByCategory, caByDesignation,
    scPurposeHubs, auSubtypeHubs, caCategoryHubs, caDesignationHubs, scHubSet, auHubSet, caCategorySet, caDesignationSet,
    scPurposePath, auSubtypePath, caCategoryPath, caDesignationPath,
    subtypeLabel, beneficiaryLabel, categoryLabel, designationLabel, auPlace, caPlace, scPlace,
    latestSc, latestAu, latestCa, tally, top, dayRange, crossBorder,
    REGISTRIES, labelText, labelCount, labelHub, labelName, groupDossiers,
    scDossierFaqs, scPurposeFaqs, scIndexFaqs, auDossierFaqs, auSubtypeFaqs, auIndexFaqs,
    caDossierFaqs, caHubFaqs, caIndexFaqs, causeFaqs, dossierIndexFaqs,
  };
}

export type Wave1b = ReturnType<typeof model>;

/** Every Wave 1b page, for pages.ts and the partitioned sitemap. */
export function wave1bPages() {
  const w = wave1b();
  const hubs: { path: string; title: string }[] = [
    { path: SC_BASE, title: 'Scotland charity dossiers: Scottish Charity Register' },
    { path: AU_BASE, title: 'Australia charity dossiers: ACNC register and Annual Information Statements' },
    { path: CA_BASE, title: 'Canada charity dossiers: CRA List of charities and T3010 returns' },
    { path: CAUSE_PATH, title: 'Cause × Country: charity dossiers by registry category' },
    ...w.scPurposeHubs.map((p) => ({ path: w.scPurposePath(p), title: `${sentence(p)}: Scotland charity dossiers` })),
    ...w.auSubtypeHubs.map((c) => ({ path: w.auSubtypePath(c), title: `${w.subtypeLabel(c)}: Australia charity dossiers` })),
    ...w.caCategoryHubs.map((c) => ({ path: w.caCategoryPath(c), title: `${w.categoryLabel(c)} (CRA category ${c}): Canada charity dossiers` })),
    ...w.caDesignationHubs.map((c) => ({ path: w.caDesignationPath(c), title: `${w.designationLabel(c)} (CRA designation ${c}): Canada charity dossiers` })),
  ];
  return [
    ...hubs.map((h) => ({ ...h, section: 'Verified registry hubs, Wave 1b' })),
    ...w.sc.map((d) => ({ path: scDossierPath(d.number), title: `${d.name}: Scottish Charity Register dossier (${d.number})`, section: 'Verified charity dossiers, Wave 1b' })),
    ...w.au.map((d) => ({ path: auDossierPath(d.abn), title: `${d.name}: ACNC dossier (ABN ${d.abn})`, section: 'Verified charity dossiers, Wave 1b' })),
    ...w.ca.map((d) => ({ path: caDossierPath(d.bn), title: `${d.name}: CRA T3010 dossier (${d.bn})`, section: 'Verified charity dossiers, Wave 1b' })),
  ];
}

