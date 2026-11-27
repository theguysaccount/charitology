// Build-only loader and page model for the Wave 1 verified charity dossiers.
// Every figure is copied from the committed, hash-pinned dataset built by
// scripts/build-registry-wave1.py from official registry files. Nothing here
// estimates, scores, ranks or rates an organization. Missing stays missing.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FaqEntry } from './structured-data';

const ROOT = resolve('public/data/registry-wave1');
export const WAVE1_DATA_PATH = '/data/registry-wave1/';
export const WAVE1_BASE = '/record/charity-dossiers/';
export const US_BASE = `${WAVE1_BASE}united-states/`;
export const EW_BASE = `${WAVE1_BASE}england-wales/`;
export const WAVE1_SITEMAP_SECTIONS = new Set(['Verified charity dossiers', 'Verified registry hubs']);

export interface UsPeriod {
  taxPeriod: string;
  extractYear: number;
  record: number;
  efile: string | null;
  totalRevenue: string | null;
  contributions: string | null;
  programServiceRevenue: string | null;
  investmentIncome: string | null;
  functionalExpenses: string | null;
  grantsUSOrganizations: string | null;
  grantsUSIndividuals: string | null;
  grantsOutsideUS: string | null;
  assetsEndOfYear: string | null;
  liabilitiesEndOfYear: string | null;
  netAssetsEndOfYear: string | null;
}
export interface UsDossier {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  subsection: '03';
  foundation: string | null;
  deductibility: string | null;
  status: string | null;
  ruling: string | null;
  ntee: string | null;
  bmfTaxPeriod: string | null;
  bmfRegion: number;
  periods: UsPeriod[];
}
export interface EwPeriod {
  start: string;
  end: string;
  received: string | null;
  grossIncome: string | null;
  grossExpenditure: string | null;
  record: number;
}
export interface EwDossier {
  number: string;
  organisationNumber: string;
  name: string;
  charityType: string | null;
  registrationStatus: string;
  registered: string | null;
  removed: string | null;
  reportingStatus: string | null;
  companyNumber: string | null;
  cio: boolean | null;
  insolvent: boolean;
  inAdministration: boolean;
  editionName: string;
  what: [string, string][];
  who: [string, string][];
  how: [string, string][];
  periods: EwPeriod[];
}
interface UsHubs {
  posting: { records: number; subsection03: number; subsection03WithNtee: number; regionRows: number[] };
  states: Record<string, { records: number; withNtee: number; nonstandardNtee: number; privateFoundations: number; groups: Record<string, number> }>;
  groups: Record<string, { records: number; distinctCoreCodes: number; coreCodes: [string, number][]; states: Record<string, number> }>;
}
interface EwHubs {
  registeredMain: number;
  purposes: Record<string, { description: string; charities: number }>;
}
interface Codes {
  source: { title: string; publisher: string; url: string; lastModified: string; retrievedAt: string; sha256: string };
  deductibilityCodes: Record<string, string>;
  foundationCodes: Record<string, string>;
  statusCodes: Record<string, string>;
  majorGroups: Record<string, string>;
  coreCodes: Record<string, string>;
}

function readVerified(name: string, sha256?: string) {
  const bytes = readFileSync(join(ROOT, name));
  if (sha256 && createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error(`Wave 1 data file changed without a rebuilt manifest: ${name}`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

function load() {
  const manifest = readVerified('manifest.json');
  if (manifest.format !== 'charitology-registry-wave1-v1') throw new Error('Unexpected Wave 1 manifest.');
  const out = manifest.outputs;
  const us: UsDossier[] = readVerified(out.us.path, out.us.sha256);
  const usHubs: UsHubs = readVerified(out.usHubs.path, out.usHubs.sha256);
  const ew: EwDossier[] = readVerified(out.ew.path, out.ew.sha256);
  const ewHubs: EwHubs = readVerified(out.ewHubs.path, out.ewHubs.sha256);
  const codes: Codes = readVerified(out.codes.path, out.codes.sha256);
  return { manifest, us, usHubs, ew, ewHubs, codes };
}

let cached: ReturnType<typeof model> | undefined;
export function wave1() {
  return (cached ??= model());
}

// USPS state, district and territory abbreviations used in IRS mailing addresses.
export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam', MP: 'Northern Mariana Islands', AS: 'American Samoa',
  FM: 'Federated States of Micronesia', MH: 'Marshall Islands', PW: 'Palau',
  AA: 'Armed Forces Americas', AE: 'Armed Forces Europe', AP: 'Armed Forces Pacific',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (value: string) => {
  const [y, m] = value.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
export const yyyymmLabel = (value: string | null) =>
  value && /^\d{6}$/.test(value) && value.slice(4) !== '00' ? `${MONTHS[Number(value.slice(4)) - 1]} ${value.slice(0, 4)}` : null;
export const dayLabel = (value: string) => {
  const [y, m, d] = value.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
};
export const count = (value: number) => value.toLocaleString('en-US');
function grouped(value: string) {
  const negative = value.startsWith('-');
  const [whole, cents] = value.replace('-', '').split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { negative, text: cents ? `${digits}.${cents}` : digits };
}
export const usd = (value: string) => {
  const { negative, text } = grouped(value);
  return `${negative ? '−' : ''}$${text}`;
};
export const gbp = (value: string) => {
  const { negative, text } = grouped(value);
  return `${negative ? '−' : ''}£${text}`;
};
export const einLabel = (ein: string) => `${ein.slice(0, 2)}-${ein.slice(2)}`;
const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const slug = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const usDossierPath = (ein: string) => `${US_BASE}ein/${ein}/`;
export const usStatePath = (state: string) => `${US_BASE}states/${state.toLowerCase()}/`;
export const ewDossierPath = (number: string) => `${EW_BASE}charity/${number}/`;

export const SOI_LINES: [keyof UsPeriod, string, string][] = [
  ['totalRevenue', 'Total revenue', 'Part VIII, line 12'],
  ['contributions', 'Contributions, gifts and grants received', 'Part VIII, line 1h'],
  ['programServiceRevenue', 'Program service revenue', 'Part VIII, line 2g'],
  ['investmentIncome', 'Investment income', 'Part VIII, line 3'],
  ['functionalExpenses', 'Total functional expenses', 'Part IX, line 25'],
  ['grantsUSOrganizations', 'Grants to U.S. governments and organizations', 'Part IX, line 1'],
  ['grantsUSIndividuals', 'Grants to U.S. individuals', 'Part IX, line 2'],
  ['grantsOutsideUS', 'Grants to organizations and individuals outside the U.S.', 'Part IX, line 3'],
  ['assetsEndOfYear', 'Total assets, end of year', 'Part X, line 16, column (B)'],
  ['liabilitiesEndOfYear', 'Total liabilities, end of year', 'Part X, line 26, column (B)'],
  ['netAssetsEndOfYear', 'Total net assets, end of year', 'Part X, line 33, column (B)'],
];

const sortByName = <T extends { name: string }>(key: (item: T) => string) => (a: T, b: T) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || key(a).localeCompare(key(b));

function model() {
  const { manifest, us, usHubs, ew, ewHubs, codes } = load();
  const bmf = manifest.sources.irsEoBmf;
  const soi = manifest.sources.irsSoiForm990;
  const register = manifest.sources.ccewRegister;
  const bmfPosted = dayLabel(new Date(bmf.files[0].lastModified).toISOString().slice(0, 10));
  const registerDate = dayLabel(register.extractDate);
  const usThreshold = usd(String(manifest.selection.us.thresholdUSD));
  const ewThreshold = gbp(String(manifest.selection.ew.thresholdGBP));
  const stateMin: number = manifest.selection.stateGroupHubMinimumDossiers;

  const groupName = (letter: string) => codes.majorGroups[letter];
  const standardNtee = (code: string | null) => (code && /^[A-Z][0-9A-Z]{1,3}$/.test(code) ? code : null);
  const groupOf = (d: UsDossier) => standardNtee(d.ntee)?.[0] ?? null;
  const groupSlug = (letter: string) => `${letter.toLowerCase()}-${slug(groupName(letter))}`;
  const groupPath = (letter: string) => `${US_BASE}ntee/${groupSlug(letter)}/`;
  const stateGroupPath = (state: string, letter: string) => `${usStatePath(state)}${groupSlug(letter)}/`;
  const groupLabel = (letter: string) => `${groupName(letter)} (NTEE ${letter})`;
  const nteeText = (code: string | null) => {
    const standard = standardNtee(code);
    if (!standard) return null;
    const core = codes.coreCodes[standard.slice(0, 3)];
    return { code: standard, core: standard.slice(0, 3), coreDescription: core ?? null, group: standard[0], groupName: groupName(standard[0]) };
  };
  const purposeSlug = (code: string) => slug(ewHubs.purposes[code].description);
  const purposePath = (code: string) => `${EW_BASE}purposes/${purposeSlug(code)}/`;
  const stateName = (code: string) => US_STATE_NAMES[code] ?? code;
  const soiFile = (year: number) => soi.files[String(year)];
  const bmfFile = (region: number) => bmf.files[region - 1];

  const usSorted = [...us].sort(sortByName((d) => d.ein));
  const ewSorted = [...ew].sort(sortByName((d) => d.number));
  const byState = new Map<string, UsDossier[]>();
  const byGroup = new Map<string, UsDossier[]>();
  const byStateGroup = new Map<string, UsDossier[]>();
  for (const d of usSorted) {
    const g = groupOf(d);
    if (d.state) byState.set(d.state, [...(byState.get(d.state) ?? []), d]);
    if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), d]);
    if (d.state && g) byStateGroup.set(`${d.state}|${g}`, [...(byStateGroup.get(`${d.state}|${g}`) ?? []), d]);
  }
  const stateHubs = [...byState.keys()].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const groupHubs = [...byGroup.keys()].sort();
  const stateGroupHubs = [...byStateGroup.entries()]
    .filter(([, items]) => items.length >= stateMin)
    .map(([key]) => key.split('|') as [string, string])
    .sort((a, b) => stateName(a[0]).localeCompare(stateName(b[0])) || a[1].localeCompare(b[1]));
  const stateGroupSet = new Set(stateGroupHubs.map(([s, g]) => `${s}|${g}`));
  const byPurpose = new Map<string, EwDossier[]>();
  for (const d of ewSorted) for (const [code] of d.what) byPurpose.set(code, [...(byPurpose.get(code) ?? []), d]);
  const purposeHubs = [...byPurpose.keys()].sort();

  const latest = (d: UsDossier) => d.periods[0];
  const latestEw = (d: EwDossier) => d.periods[0];
  const periodRange = (months: string[]) => {
    const sorted = [...months].sort();
    return sorted[0] === sorted.at(-1)
      ? `all end in ${monthLabel(sorted[0])}`
      : `end between ${monthLabel(sorted[0])} and ${monthLabel(sorted.at(-1)!)}`;
  };
  const dayRange = (days: string[]) => {
    const sorted = [...days].sort();
    return sorted[0] === sorted.at(-1)
      ? `all end on ${dayLabel(sorted[0])}`
      : `end between ${dayLabel(sorted[0])} and ${dayLabel(sorted.at(-1)!)}`;
  };
  const positive = (value: string | null) => value !== null && Number(value) > 0;
  const top = (counter: Map<string, number>, n: number) =>
    [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
  const tally = <T,>(items: T[], key: (item: T) => string | null) => {
    const counter = new Map<string, number>();
    for (const item of items) {
      const k = key(item);
      if (k !== null) counter.set(k, (counter.get(k) ?? 0) + 1);
    }
    return counter;
  };
  const extractYears = (items: UsDossier[]) => [...new Set(items.flatMap((d) => d.periods.map((p) => p.extractYear)))].sort();
  const yearsText = (years: number[]) => `calendar-year ${list(years.map(String))} IRS Form 990 extract${years.length > 1 ? 's' : ''}`;

  function usDossierFaqs(d: UsDossier): FaqEntry[] {
    const p = latest(d);
    const ein = einLabel(d.ein);
    const place = d.city && d.state ? `${d.city}, ${d.state}` : d.city ?? d.state;
    const faqs: FaqEntry[] = [];
    faqs.push({
      question: `What EIN and mailing address does the IRS list for ${d.name}?`,
      answer: `The IRS Exempt Organizations Business Master File (regional file eo${d.bmfRegion}.csv, last modified ${bmfPosted}) lists ${d.name} under EIN ${ein}${place ? ` with a mailing address in ${place}` : ' without a city or state'}. A mailing address does not show where an organization works.`,
    });
    const ruling = yyyymmLabel(d.ruling);
    faqs.push({
      question: `Which IRS exemption codes does the EO BMF record for ${d.name}?`,
      answer: [
        `Subsection code 03, which is section 501(c)(3) of the Internal Revenue Code${d.status ? `, and exemption status code ${d.status}: ${codes.statusCodes[d.status] ?? 'a code the IRS table does not describe'}` : ''}.`,
        d.deductibility ? `Its deductibility code is ${d.deductibility}: ${codes.deductibilityCodes[d.deductibility] ?? 'a code the IRS table does not describe.'}` : 'No deductibility code is supplied.',
        d.foundation ? `Its foundation code is ${d.foundation}: ${codes.foundationCodes[d.foundation] ?? 'a code the IRS table does not describe'}.` : 'No foundation code is supplied.',
        ruling ? `The ruling or determination letter month on file is ${ruling}.` : '',
      ].filter(Boolean).join(' '),
    });
    const month = monthLabel(p.taxPeriod);
    const revenueParts = [
      p.contributions !== null ? `contributions, gifts and grants of ${usd(p.contributions)} (line 1h)` : '',
      p.programServiceRevenue !== null ? `program service revenue of ${usd(p.programServiceRevenue)} (line 2g)` : '',
    ].filter(Boolean);
    faqs.push({
      question: `What total revenue did ${d.name} report for the tax period ending ${month}?`,
      answer: p.totalRevenue === null
        ? `The calendar-year ${p.extractYear} IRS Form 990 extract (record ${count(p.record)}) supplies no total revenue for the tax period ending ${month}.`
        : `The calendar-year ${p.extractYear} IRS Form 990 extract (record ${count(p.record)}) reports total revenue of ${usd(p.totalRevenue)} (Form 990 Part VIII, line 12) for the tax period ending ${month}.${revenueParts.length ? ` The same record reports ${list(revenueParts)}.` : ''}`,
    });
    const grantParts = [
      p.grantsUSOrganizations !== null ? `${usd(p.grantsUSOrganizations)} in grants to U.S. governments and organizations (line 1)` : '',
      p.grantsUSIndividuals !== null ? `${usd(p.grantsUSIndividuals)} in grants to U.S. individuals (line 2)` : '',
      p.grantsOutsideUS !== null ? `${usd(p.grantsOutsideUS)} in grants to organizations and individuals outside the United States (line 3)` : '',
    ].filter(Boolean);
    faqs.push({
      question: `What total functional expenses did ${d.name} report for that period?`,
      answer: p.functionalExpenses === null
        ? `The extract record supplies no total functional expenses for the tax period ending ${month}.`
        : `Total functional expenses were ${usd(p.functionalExpenses)} (Form 990 Part IX, line 25) for the tax period ending ${month}.${grantParts.length ? ` Part IX also reports ${list(grantParts)}.` : ''}`,
    });
    const balance = [
      p.assetsEndOfYear !== null ? `total assets of ${usd(p.assetsEndOfYear)} (Part X, line 16)` : '',
      p.liabilitiesEndOfYear !== null ? `total liabilities of ${usd(p.liabilitiesEndOfYear)} (line 26)` : '',
      p.netAssetsEndOfYear !== null ? `total net assets of ${usd(p.netAssetsEndOfYear)} (line 33)` : '',
    ].filter(Boolean);
    if (balance.length) {
      faqs.push({
        question: `What total assets did ${d.name} report at the end of that period?`,
        answer: `At the end of the tax period ending ${month}, the extract reports ${list(balance)}, all from column (B), end of year.`,
      });
    } else {
      faqs.push({
        question: `How many Form 990 periods does this dossier include for ${d.name}?`,
        answer: `${d.periods.length} period${d.periods.length > 1 ? 's' : ''}, ending ${list(d.periods.map((x) => monthLabel(x.taxPeriod)))}, from the ${yearsText(extractYears([d]))}.`,
      });
    }
    const ntee = nteeText(d.ntee);
    faqs.push({
      question: `Which NTEE code does the IRS record for ${d.name}?`,
      answer: ntee
        ? `The EO BMF records NTEE code ${ntee.code}. ${ntee.coreDescription ? `In the IRS code table, ${ntee.core} is “${ntee.coreDescription}”` : `The IRS code table does not describe core code ${ntee.core}`}, in major group ${ntee.group}, ${ntee.groupName}.`
        : d.ntee
          ? `The EO BMF NTEE field holds ${d.ntee}, which is not a standard NTEE code, so Charitology assigns no major group.`
          : 'The EO BMF supplies no NTEE code for this EIN, so Charitology assigns no category.',
    });
    return faqs;
  }

  function ewDossierFaqs(d: EwDossier): FaqEntry[] {
    const p = latestEw(d);
    const faqs: FaqEntry[] = [];
    faqs.push({
      question: `What is the registered charity number of ${d.name}?`,
      answer: `The Charity Commission for England and Wales register extract dated ${registerDate} lists ${d.name} as registered charity number ${d.number} (organisation number ${d.organisationNumber})${d.registered ? `, registered on ${dayLabel(d.registered)}` : ''}. Its registration status is ${d.registrationStatus}.`,
    });
    faqs.push({
      question: `What type of charity is ${d.name}?`,
      answer: [
        d.charityType ? `The register records the charity type as ${d.charityType}.` : 'The register extract supplies no charity type.',
        d.companyNumber ? `It lists company registration number ${d.companyNumber}.` : 'It lists no company registration number.',
        d.cio === true ? 'It is recorded as a charitable incorporated organisation (CIO).' : d.cio === false ? 'It is not recorded as a charitable incorporated organisation (CIO).' : '',
      ].filter(Boolean).join(' '),
    });
    faqs.push({
      question: `What gross income did ${d.name} report for its latest financial year?`,
      answer: p.grossIncome === null
        ? `The Commission’s annual return history (record ${count(p.record)}) supplies no gross income for the financial year ${dayLabel(p.start)} to ${dayLabel(p.end)}.`
        : `For the financial year ${dayLabel(p.start)} to ${dayLabel(p.end)}, the Commission’s annual return history (record ${count(p.record)}) reports gross income of ${gbp(p.grossIncome)}.`,
    });
    faqs.push({
      question: `What gross expenditure did ${d.name} report for that year?`,
      answer: `${p.grossExpenditure === null ? 'The record supplies no gross expenditure' : `Gross expenditure was ${gbp(p.grossExpenditure)}`} for the financial year ending ${dayLabel(p.end)}.${p.received ? ` The Commission recorded the annual return as received on ${dayLabel(p.received)}.` : ''}`,
    });
    faqs.push({
      question: `Which charitable purposes does the register list for ${d.name}?`,
      answer: d.what.length
        ? `The register lists ${d.what.length} “What” classification${d.what.length > 1 ? 's' : ''}: ${list(d.what.map(([, text]) => text))}.`
        : 'The register extract lists no “What” classification for this charity.',
    });
    faqs.push(d.who.length || d.how.length
      ? {
          question: `Which beneficiaries and methods does the register list for ${d.name}?`,
          answer: [
            d.who.length ? `“Who” classifications: ${list(d.who.map(([, text]) => text))}.` : 'No “Who” classification is listed.',
            d.how.length ? `“How” classifications: ${list(d.how.map(([, text]) => text))}.` : 'No “How” classification is listed.',
          ].join(' '),
        }
      : {
          question: `How many financial years does this dossier include for ${d.name}?`,
          answer: `${d.periods.length} financial year${d.periods.length > 1 ? 's' : ''}, ending ${list(d.periods.map((x) => dayLabel(x.end)))}.`,
        });
    return faqs;
  }

  function usHubFaqs(items: UsDossier[], scope: { label: string; state?: string; group?: string }): FaqEntry[] {
    const faqs: FaqEntry[] = [];
    const months = items.map((d) => latest(d).taxPeriod);
    const abroad = items.filter((d) => positive(latest(d).grantsOutsideUS)).length;
    const rule = `every subsection 03 filer in the committed IRS Form 990 extract edition whose latest selected tax period reports total revenue of at least ${usThreshold} and whose EIN appears in the EO BMF posting`;
    if (scope.state && !scope.group) {
      const s = usHubs.states[scope.state];
      const groups = top(new Map(Object.entries(s.groups)), 3);
      faqs.push({
        question: `How many 501(c)(3) records does the IRS EO BMF list with a ${scope.label} mailing address?`,
        answer: `The EO BMF posting last modified ${bmfPosted} lists ${count(s.records)} subsection 03 records with mailing-address state ${scope.state}. ${count(s.withNtee)} carry a standard NTEE code and ${count(s.privateFoundations)} carry a private-foundation code (02, 03 or 04).`,
      });
      faqs.push({
        question: `Which ${scope.label} organizations have a Wave 1 dossier?`,
        answer: `${count(items.length)} organization${items.length > 1 ? 's' : ''}: ${rule} with mailing-address state ${scope.state}. They are listed alphabetically below.`,
      });
      faqs.push({
        question: `Which NTEE major groups are most common among ${scope.label} 501(c)(3) records?`,
        answer: `${list(groups.map(([g, n]) => `${groupLabel(g)} with ${count(n)} records`))}. Counts use the first letter of each standard NTEE code in the EO BMF.`,
      });
    } else if (scope.group && !scope.state) {
      const g = usHubs.groups[scope.group];
      const states = top(new Map(Object.entries(g.states)), 3);
      faqs.push({
        question: `How many 501(c)(3) records in the IRS EO BMF carry an NTEE ${scope.group} code?`,
        answer: `${count(g.records)} of the ${count(usHubs.posting.subsection03WithNtee)} subsection 03 records with a standard NTEE code in the posting last modified ${bmfPosted} begin with ${scope.group}, ${groupName(scope.group)}. They use ${count(g.distinctCoreCodes)} distinct three-character core codes.`,
      });
      faqs.push({
        question: `Which NTEE ${scope.group} core codes are most common?`,
        answer: `${list(g.coreCodes.slice(0, 3).map(([code, n]) => `${code}${codes.coreCodes[code] ? ` (${codes.coreCodes[code]})` : ' (not described in the IRS code table)'} with ${count(n)} records`))}.`,
      });
      faqs.push({
        question: `Which mailing-address states have the most NTEE ${scope.group} records?`,
        answer: `${list(states.map(([st, n]) => `${st ? stateName(st) : 'no state supplied'} with ${count(n)}`))}. A mailing address does not show where an organization works.`,
      });
    } else if (scope.state && scope.group) {
      const n = usHubs.states[scope.state].groups[scope.group] ?? 0;
      const cores = top(tally(items, (d) => standardNtee(d.ntee)?.slice(0, 3) ?? null), 3);
      const cities = top(tally(items, (d) => d.city), 1);
      faqs.push({
        question: `How many ${stateName(scope.state)} 501(c)(3) records carry an NTEE ${scope.group} code?`,
        answer: `The EO BMF posting last modified ${bmfPosted} lists ${count(n)} subsection 03 records with mailing-address state ${scope.state} and an NTEE code beginning with ${scope.group}, ${groupName(scope.group)}.`,
      });
      faqs.push({
        question: `How many of them have a Wave 1 dossier?`,
        answer: `${count(items.length)}: ${rule}, with mailing-address state ${scope.state} and an NTEE code beginning with ${scope.group}. They are listed alphabetically below.`,
      });
      faqs.push({
        question: `Which core NTEE codes appear among these ${count(items.length)} dossiers?`,
        answer: `${list(cores.map(([code, k]) => `${code} (${codes.coreCodes[code] ?? 'not described in the IRS code table'}) with ${count(k)}`))}.${cities.length ? ` The most frequent mailing-address city is ${cities[0][0]}, with ${count(cities[0][1])}.` : ''}`,
      });
      const foundations = top(tally(items, (d) => d.foundation), 3);
      faqs.push({
        question: 'Which IRS foundation codes do these dossiers carry?',
        answer: foundations.length
          ? `${list(foundations.map(([code, k]) => `${count(k)} with code ${code} (${codes.foundationCodes[code] ?? 'not described in the IRS code table'})`))}.`
          : 'None of these EO BMF rows supplies a foundation code.',
      });
    }
    if (!(scope.state && scope.group)) {
      const groupsHere = top(tally(items, (d) => groupOf(d)), 3);
      const noNtee = items.filter((d) => !groupOf(d)).length;
      faqs.push(scope.group
        ? {
            question: `How many NTEE ${scope.group} organizations have a Wave 1 dossier?`,
            answer: `${count(items.length)}: ${rule} with an NTEE code beginning with ${scope.group}. ${count(tally(items, (d) => d.state).size)} mailing-address states are represented.`,
          }
        : {
            question: `Which NTEE major groups appear among the ${scope.label} dossiers?`,
            answer: `${list(groupsHere.map(([g, k]) => `${groupLabel(g)} with ${count(k)}`))}${noNtee ? `; ${count(noNtee)} carr${noNtee > 1 ? 'y' : 'ies'} no standard NTEE code` : ''}.`,
          });
    }
    faqs.push({
      question: `Which tax periods do the ${scope.label} dossier figures cover?`,
      answer: `The latest selected tax periods ${periodRange(months)}. The figures come from the ${yearsText(extractYears(items))}, with each value cited by extract year and record number.`,
    });
    faqs.push({
      question: `How many of these dossiers report grants outside the United States?`,
      answer: `${count(abroad)} of ${count(items.length)} report a positive amount on Form 990 Part IX, line 3 (grants to organizations and individuals outside the U.S.) for their latest selected period. Others report zero or supply no value.`,
    });
    return faqs;
  }

  function ewPurposeFaqs(code: string, items: EwDossier[]): FaqEntry[] {
    const purpose = ewHubs.purposes[code];
    const others = top(tally(items.flatMap((d) => d.what.filter(([c]) => c !== code)), ([, text]) => text), 3);
    const who = top(tally(items.flatMap((d) => d.who), ([, text]) => text), 3);
    const types = top(tally(items, (d) => d.charityType), 3);
    const ends = items.map((d) => latestEw(d).end).sort();
    return [
      {
        question: `How many registered charities list “${purpose.description}” as a purpose?`,
        answer: `${count(purpose.charities)} of the ${count(ewHubs.registeredMain)} registered main charities in the Charity Commission register extract dated ${registerDate} list the “What” classification ${code}, ${purpose.description}.`,
      },
      {
        question: 'How many of them have a Wave 1 dossier?',
        answer: `${count(items.length)}: every registered main charity in the committed annual-return edition with this classification whose latest financial year reports gross income of at least ${ewThreshold}. They are listed alphabetically below.`,
      },
      {
        question: 'Which other purposes do these charities list most often?',
        answer: others.length ? `${list(others.map(([text, n]) => `${text} (${count(n)})`))}.` : 'None of these dossiers lists another “What” classification.',
      },
      {
        question: 'Which beneficiary groups do these charities list most often?',
        answer: who.length ? `${list(who.map(([text, n]) => `${text} (${count(n)})`))}, from the register’s “Who” classifications.` : 'None of these dossiers lists a “Who” classification.',
      },
      {
        question: 'Which financial years do the figures cover?',
        answer: `The latest financial years ${dayRange(ends)}. Gross income and gross expenditure come from the Commission’s annual return history in the committed edition of ${dayLabel(manifest.sources.ccewAnnualReturns.edition)}.`,
      },
      {
        question: 'Which charity types appear among these dossiers?',
        answer: `${list(types.map(([text, n]) => `${text} (${count(n)})`))}${items.some((d) => !d.charityType) ? `; ${count(items.filter((d) => !d.charityType).length)} without a recorded type` : ''}.`,
      },
    ];
  }

  function usIndexFaqs(): FaqEntry[] {
    const sel = manifest.selection.us;
    const states = top(tally(usSorted, (d) => d.state), 3);
    const groups = top(tally(usSorted, (d) => groupOf(d)), 3);
    const years = extractYears(usSorted);
    return [
      {
        question: 'How many U.S. organizations have a Wave 1 dossier?',
        answer: `${count(usSorted.length)}. Of the ${count(sel.editionOrganizations)} subsection 03 Form 990 filers in the committed IRS extract edition, ${count(sel.candidates)} report total revenue of at least ${usThreshold} for their latest selected tax period. ${count(sel.excluded.notInBmfPosting.length)} of those are absent from the current EO BMF posting and have no dossier.`,
      },
      {
        question: 'Which IRS files supply the dossier records?',
        answer: `Identity, codes and NTEE classifications come from the four regional EO BMF files (eo1.csv to eo4.csv, last modified ${bmfPosted}, ${count(usHubs.posting.records)} records). Financial figures come from the ${yearsText(years)} published by IRS Statistics of Income.`,
      },
      {
        question: 'How many 501(c)(3) records does the EO BMF posting contain?',
        answer: `${count(usHubs.posting.subsection03)} records carry subsection code 03. ${count(usHubs.posting.subsection03WithNtee)} of them carry a standard NTEE code.`,
      },
      {
        question: 'Which mailing-address states have the most Wave 1 dossiers?',
        answer: `${list(states.map(([st, n]) => `${stateName(st)} (${count(n)})`))}. ${count(usSorted.filter((d) => !d.state).length)} dossiers have no state in the EO BMF.`,
      },
      {
        question: 'Which NTEE major groups are most common among the dossiers?',
        answer: `${list(groups.map(([g, n]) => `${groupLabel(g)} with ${count(n)}`))}. ${count(usSorted.filter((d) => !groupOf(d)).length)} dossiers carry no standard NTEE code.`,
      },
      {
        question: 'How can I check a figure against the IRS file?',
        answer: `Each figure names its extract year and record number. The record number is the data row in the IRS CSV after the header. Download the original ZIP from irs.gov and compare its SHA-256 fingerprint with the one in the Wave 1 manifest before reading the row.`,
      },
    ];
  }

  function ewIndexFaqs(): FaqEntry[] {
    const sel = manifest.selection.ew;
    const purposes = top(tally(ewSorted.flatMap((d) => d.what), ([, text]) => text), 3);
    const types = top(tally(ewSorted, (d) => d.charityType), 3);
    const ends = ewSorted.map((d) => latestEw(d).end).sort();
    return [
      {
        question: 'How many England and Wales charities have a Wave 1 dossier?',
        answer: `${count(ewSorted.length)}. Of the ${count(sel.editionOrganizations)} registered main charities in the committed annual-return edition of ${dayLabel(manifest.sources.ccewAnnualReturns.edition)}, ${count(sel.candidates)} report gross income of at least ${ewThreshold} for their latest financial year. ${sel.candidates === ewSorted.length ? 'The register extract dated ' + registerDate + ' still lists all of them as Registered.' : `${count(ewSorted.length)} of them are still listed as Registered in the register extract dated ${registerDate}.`}`,
      },
      {
        question: 'Which Charity Commission files supply the dossier records?',
        answer: `Registration details and classifications come from the register extract and classification extract dated ${registerDate}. Gross income and gross expenditure come from the annual return history in the committed edition. All are published under the Open Government Licence v3.0.`,
      },
      {
        question: 'How many registered main charities does the register extract list?',
        answer: `${count(ewHubs.registeredMain)} main charities, not linked subsidiaries, have the status Registered in the extract dated ${registerDate}.`,
      },
      {
        question: 'Which purposes do the dossier charities list most often?',
        answer: `${list(purposes.map(([text, n]) => `${text} (${count(n)})`))}, from the register’s “What” classifications.`,
      },
      {
        question: 'Which charity types appear among the dossiers?',
        answer: `${list(types.map(([text, n]) => `${text} (${count(n)})`))}.`,
      },
      {
        question: 'Which financial years do the dossier figures cover?',
        answer: `The latest financial years ${dayRange(ends)}. Each figure cites its annual return history record number.`,
      },
    ];
  }

  function wave1IndexFaqs(): FaqEntry[] {
    return [
      {
        question: 'What is a Charitology verified charity dossier?',
        answer: `A page that reproduces one organization’s official registry record and published financial figures, with the source file, date, record number and fingerprint. Wave 1 holds ${count(usSorted.length)} U.S. and ${count(ewSorted.length)} England and Wales dossiers.`,
      },
      {
        question: 'How were the Wave 1 organizations chosen?',
        answer: `By one published figure per register: U.S. Form 990 total revenue of at least ${usThreshold} in the latest selected tax period, and England and Wales gross income of at least ${ewThreshold} in the latest financial year. Inclusion is a coverage boundary, not a rating or endorsement.`,
      },
      {
        question: 'Which official registers does Wave 1 use?',
        answer: `The IRS Exempt Organizations Business Master File (last modified ${bmfPosted}), IRS Statistics of Income Form 990 extracts for calendar years ${list(extractYears(usSorted).map(String))}, and the Charity Commission for England and Wales register and annual return history.`,
      },
      {
        question: 'How many hub pages group the dossiers?',
        answer: `${count(stateHubs.length)} U.S. state and territory hubs, ${count(groupHubs.length)} NTEE major-group hubs, ${count(stateGroupHubs.length)} state and NTEE group hubs with at least ${stateMin} dossiers, and ${count(purposeHubs.length)} England and Wales purpose hubs.`,
      },
      {
        question: 'Does Charitology rate or rank these charities?',
        answer: 'No. Dossiers are listed alphabetically. They carry no star rating, score, overhead ratio or effectiveness claim, and Charitology computes no ratio from the figures.',
      },
      {
        question: 'Can I download the Wave 1 dataset?',
        answer: 'Yes. The dossier records, hub counts, IRS code table and a manifest with every source URL, retrieval time and SHA-256 fingerprint are published as JSON under /data/registry-wave1/.',
      },
    ];
  }

  return {
    manifest, codes, usHubs, ewHubs, bmf, soi, register, bmfPosted, registerDate, usThreshold, ewThreshold, stateMin,
    us: usSorted, ew: ewSorted, byState, byGroup, byStateGroup, byPurpose, stateHubs, groupHubs, stateGroupHubs, stateGroupSet, purposeHubs,
    groupName, groupLabel, groupSlug, groupPath, stateGroupPath, groupOf, nteeText, stateName, purposePath, purposeSlug, soiFile, bmfFile,
    latest, latestEw, extractYears, yearsText, tally, top, periodRange,
    usDossierFaqs, ewDossierFaqs, usHubFaqs, ewPurposeFaqs, usIndexFaqs, ewIndexFaqs, wave1IndexFaqs,
  };
}

export type Wave1 = ReturnType<typeof model>;

/** Every Wave 1 page, for pages.ts and the partitioned sitemap. */
export function wave1Pages() {
  const w = wave1();
  const hubs: { path: string; title: string; summary?: string }[] = [
    { path: WAVE1_BASE, title: 'Verified charity dossiers: Wave 1' },
    { path: US_BASE, title: 'United States charity dossiers: IRS EO BMF and Form 990 extracts' },
    { path: EW_BASE, title: 'England and Wales charity dossiers: Charity Commission register' },
    ...w.stateHubs.map((s) => ({ path: usStatePath(s), title: `${w.stateName(s)} charity dossiers` })),
    ...w.groupHubs.map((g) => ({ path: w.groupPath(g), title: `${w.groupLabel(g)} charity dossiers` })),
    ...w.stateGroupHubs.map(([s, g]) => ({ path: w.stateGroupPath(s, g), title: `${w.groupLabel(g)} charity dossiers in ${w.stateName(s)}` })),
    ...w.purposeHubs.map((c) => ({ path: w.purposePath(c), title: `${w.ewHubs.purposes[c].description}: England and Wales charity dossiers` })),
  ];
  return [
    ...hubs.map((h) => ({ ...h, section: 'Verified registry hubs' })),
    ...w.us.map((d) => ({ path: usDossierPath(d.ein), title: `${d.name}: IRS Form 990 dossier (EIN ${einLabel(d.ein)})`, section: 'Verified charity dossiers' })),
    ...w.ew.map((d) => ({ path: ewDossierPath(d.number), title: `${d.name}: Charity Commission dossier (charity ${d.number})`, section: 'Verified charity dossiers' })),
  ];
}

export function faqNode(faqs: readonly FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/** CollectionPage + Dataset nodes for a hub page. */
export function hubNodes({
  name, description, canonical, items, spatialCoverage, dataFiles, isBasedOn, license, creditText, origin,
}: {
  name: string;
  description: string;
  canonical: string;
  items: { name: string; url: string }[];
  spatialCoverage: string;
  dataFiles: string[];
  isBasedOn: string[];
  license: string;
  creditText: string;
  origin: string;
}) {
  const w = wave1();
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name,
      description,
      url: canonical,
      isPartOf: { '@id': `${origin}#website` },
      mainEntity: {
        '@type': 'ItemList',
        name: `${name}: alphabetical list`,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: item.url })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `${name} (dataset)`,
      description,
      url: canonical,
      isAccessibleForFree: true,
      license,
      creditText,
      dateModified: w.manifest.edition,
      spatialCoverage,
      isBasedOn,
      creator: { '@type': 'Organization', name: 'Charitology', url: origin },
      distribution: dataFiles.map((contentUrl) => ({ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl })),
    },
  ];
}
