// Single source of truth for the Global Charity Index (17 jurisdictions) and
// published Funding Flows lookups and case studies. Powers /record/charity-index/coverage/,
// /record/funding-flows/, /tools/charity-lookup/, /record/open-datasets/, and
// /api/v1/charity-index.json + /api/v1/funding-flows.json.
import australia from '../../public/data/charity-financials/manifest.json';
import canada from '../../public/data/charity-financials/ca/manifest.json';
import englandWales from '../../public/data/charity-financials/ew/manifest.json';
import scotland from '../../public/data/charity-financials/scotland/manifest.json';
import france from '../../public/data/charity-financials/fr-dila/manifest.json';
import usa from '../../public/data/charity-financials/us/manifest.json';
import usaShort from '../../public/data/charity-financials/us-990-ez/manifest.json';
import usaFoundation from '../../public/data/charity-financials/us-990-pf/manifest.json';
import registry from '../../public/data/irs-registry/manifest.json';
import japan from '../../public/data/charity-registry/japan-npo/manifest.json';
import israel from '../../public/data/charity-registry/israel/manifest.json';
import latvia from '../../public/data/charity-registry/latvia/manifest.json';
import newZealand from '../../public/data/charity-registry/new-zealand/manifest.json';
import netherlands from '../../public/data/charity-registry/netherlands/manifest.json';
import norway from '../../public/data/charity-registry/norway/manifest.json';
import poland from '../../public/data/charity-registry/poland/manifest.json';
import taiwan from '../../public/data/charity-registry/taiwan/manifest.json';
import brazil from '../../public/data/charity-registry/brazil-osc/manifest.json';
import mexico from '../../public/data/charity-financials/mx/manifest.json';
import kenyaDirectory from '../data/kenya-pbo-directory-coverage.json';
import { pageIdentity, type SymbolName } from './site-identities';

const number = (value: number) => value.toLocaleString('en-US');
const australianPeriods = australia.sources.reduce((sum, source) => sum + source.includedPeriods, 0);

export interface JurisdictionPanelBase {
  id: string;
  name: string;
  source: string;
  route: string;
  label: string;
  date?: string;
  recordCount: number;
  recordUnit: string;
  coverage: string;
  history?: string;
  boundary?: string;
  manifest?: string;
  fundingFlowRoute?: string;
  fundingFlowLabel?: string;
}

export interface JurisdictionPanel extends JurisdictionPanelBase {
  symbol: SymbolName;
  tone: string;
}

const RAW_PANELS: JurisdictionPanelBase[] = [
  {
    id: 'australia',
    name: 'Australia',
    source: 'Annual Information Statements',
    route: '/record/charity-financials/',
    label: 'Search Australian filings',
    date: australia.date,
    recordCount: australia.organizations,
    recordUnit: 'ABNs',
    coverage: `${number(australia.organizations)} ABNs and ${number(australianPeriods)} dated records in the selected extracts.`,
    history: `${number(australia.organizationsWithBothYears)} ABNs have dated reporting in both source years, 2023 and 2024.`,
    boundary: 'The 2024 extract sets the identity scope. Earlier unmatched and undated records are left out. The grant fields distinguish money for use inside and outside Australia.',
    manifest: '/data/charity-financials/manifest.json',
  },
  {
    id: 'brazil',
    name: 'Brazil',
    source: 'Ipea and Transferegov',
    route: '/record/charity-index/brazil/',
    label: 'Compare Brazil registry and transfer records',
    date: brazil.source.accessedOn,
    recordCount: brazil.coverage.exact.identifiers,
    recordUnit: 'matched CNPJs',
    coverage: `The Brazil registry comparison finds one exact CNPJ match in Ipea for ${number(brazil.coverage.exact.identifiers)} of ${number(brazil.transfers.identifiers)} registration numbers in the federal transfer edition.`,
    history: 'The August 2026 registry snapshot appears alongside separate 2024 and 2025 bank-order periods.',
    manifest: '/data/charity-registry/brazil-osc/manifest.json',
    fundingFlowRoute: '/record/funding-flows/brazil-transferegov/',
    fundingFlowLabel: 'Federal transfers (Transferegov)',
  },
  {
    id: 'canada',
    name: 'Canada',
    source: 'Canada Revenue Agency T3010',
    route: '/record/charity-financials/canada/',
    label: 'Search Canadian financial filings',
    date: canada.capturedOn,
    recordCount: canada.accounts,
    recordUnit: 'charity accounts',
    coverage: `${number(canada.accounts)} charity accounts with a dated financial record in the two extracts.`,
    history: `${number(canada.financialPeriods)} periods ending in 2023 or 2024. ${number(canada.multiYearAccounts)} accounts have records in both years.`,
    boundary: 'Income, expenditure, gifts and grants are reported in CAD. Returns keep their accounting basis, fiscal period and original records.',
    manifest: '/data/charity-financials/ca/manifest.json',
    fundingFlowRoute: '/record/funding-flows/canada-qualified-donees/',
    fundingFlowLabel: 'Qualified donee gifts (CRA)',
  },
  {
    id: 'england-wales',
    name: 'England and Wales',
    source: 'Charity Commission annual returns',
    route: '/record/charity-financials/england-wales/',
    label: 'Search England and Wales returns',
    date: englandWales.date,
    recordCount: englandWales.organizations,
    recordUnit: 'registered charities',
    coverage: `${number(englandWales.organizations)} of ${number(englandWales.registeredMain)} main registered charities with eligible records.`,
    history: `${number(englandWales.counts.included)} received annual returns for periods ending in 2023–2025. ${number(englandWales.multiPeriod)} charities have multiple periods.`,
    boundary: 'The figures are gross income and expenditure in GBP. Linked, suppressed and unreceived records are outside the included scope.',
    manifest: '/data/charity-financials/ew/manifest.json',
    fundingFlowRoute: '/record/funding-flows/greater-manchester-home-from-hospital/',
    fundingFlowLabel: 'Greater Manchester case',
  },
  {
    id: 'france',
    name: 'France',
    source: 'DILA published annual account notices',
    route: '/record/charity-financials/france/',
    label: 'Search French annual account notices',
    date: france.capturedOn,
    recordCount: france.counts.candidateSirens,
    recordUnit: 'candidate SIRENs',
    coverage: `${number(france.counts.notices)} notices for fiscal closings from 2022 to 2025. ${number(france.counts.candidateSirens)} distinct identifiers pass the format checks.`,
    history: `${number(france.counts.multiPeriodCandidateSirens)} candidate identifiers have filings for more than one fiscal closing date.`,
    boundary: 'Originals and corrected versions remain searchable. The capture covers published filing notices. It cannot measure the size of the association sector.',
    manifest: '/data/charity-financials/fr-dila/manifest.json',
    fundingFlowRoute: '/record/funding-flows/ile-de-france-paid-grants/',
    fundingFlowLabel: 'Île-de-France paid grants',
  },
  {
    id: 'israel',
    name: 'Israel',
    source: 'Ministry of Justice Amutot, Public Benefit Companies and Proper Management',
    route: '/record/charity-index/israel/',
    label: 'Search Israeli nonprofits and Proper Management',
    date: israel.capturedOn,
    recordCount: israel.counts.includedOrganizations,
    recordUnit: 'Amutot & PBCs',
    coverage: `${number(israel.counts.includedOrganizations)} merged registered associations and public benefit companies (${number(israel.counts.byStatus.active)} active, ${number(israel.counts.withReportedRevenue)} with reported annual revenue, ${number(israel.counts.withProperManagement2026Or2027)} with signed 2026–2027 Proper Management).`,
    history: 'A paired funding-flows edition covers 15 years (2012–2026) of statutory quarterly foreign-state donation disclosures across 516 recipients totaling ILS 7.53 billion net.',
    boundary: 'Unreported expense cells default to 0 in the source export and stay shown as not reported. Two production software test IDs inside the live foreign-state donations table remain flagged in anomalies.json.',
    manifest: '/data/charity-registry/israel/manifest.json',
    fundingFlowRoute: '/record/funding-flows/israel-foreign-state-donations/',
    fundingFlowLabel: 'Foreign-state donations (2012–2026)',
  },
  {
    id: 'japan',
    name: 'Japan',
    source: 'Cabinet Office NPO Portal',
    route: '/record/charity-index/japan/',
    label: 'Search Japan NPO Portal records',
    date: japan.capturedOn,
    recordCount: japan.counts.portalRows,
    recordUnit: 'NPO portal entries',
    coverage: `${number(japan.counts.portalRows)} dated portal entries across ${number(japan.authorities.length)} supervising authorities.`,
    history: `${number(japan.counts.financialSummaries)} entries link to a dated organization-entered financial summary.`,
    boundary: 'The portal includes dissolution records. Corporate numbers can be repeated, and the reported financial figures cover only matched records.',
    manifest: '/data/charity-registry/japan-npo/manifest.json',
    fundingFlowRoute: '/record/funding-flows/hokkaido-child-support/',
    fundingFlowLabel: 'Hokkaido child-support awards',
  },
  {
    id: 'kenya',
    name: 'Kenya',
    source: 'Public Benefit Organizations Regulatory Authority',
    route: '/record/charity-financials/kenya/',
    label: 'Compare Kenya’s sector reports',
    date: kenyaDirectory.capturedOn,
    recordCount: kenyaDirectory.directoryRows,
    recordUnit: 'PBORA directory rows',
    coverage: 'The Kenya edition compares aggregate filing counts and receipts across three regulator reports, with a spending breakdown for the latest report year.',
    boundary: 'The regulator’s live register supplies organization names and references.',
    fundingFlowRoute: '/record/funding-flows/kenya-nutrition/',
    fundingFlowLabel: 'Kenya nutrition & accounts traces',
  },
  {
    id: 'latvia',
    name: 'Latvia',
    source: 'Enterprise Register (UR), VID Public Benefit (SLO) and CFLA EU Funds',
    route: '/record/charity-index/latvia/',
    label: 'Search Latvian nonprofits and SLO status',
    date: latvia.capturedOn,
    recordCount: latvia.counts.includedOrganizations,
    recordUnit: 'nonprofits',
    coverage: `${number(latvia.counts.includedOrganizations)} associations, foundations, trade unions and religious organizations (${number(latvia.counts.byStatus.active)} active, ${number(latvia.counts.vidSloByStatus.activeSlo)} active SLO, ${number(latvia.counts.vidSloByStatus.revokedSlo)} revoked SLO).`,
    history: 'A paired funding-flows edition covers 292 nonprofit-led EU Cohesion & Recovery projects (2014–2027) totaling EUR 233.47M plus 260 separate nonprofit cooperation-partner roles with exact implementation regions.',
    boundary: 'Associations include 4,897 housing-management bodies and industry clusters (which account for 66.2% of nonprofit-led EU funds); Active SLO status separates tax-deductible charities.',
    manifest: '/data/charity-registry/latvia/manifest.json',
    fundingFlowRoute: '/record/funding-flows/latvia-eu-funds/',
    fundingFlowLabel: 'EU Cohesion & Recovery projects',
  },
  {
    id: 'mexico',
    name: 'Mexico',
    source: 'SAT financial reports and authorization directories',
    route: '/record/charity-financials/mexico/',
    label: 'Search Mexico’s charity financial reports',
    date: mexico.capturedOn,
    recordCount: mexico.coverage.identities,
    recordUnit: 'authorized RFCs',
    coverage: `${number(mexico.coverage.identities)} exact institutional RFCs across three financial reports and two directories.`,
    history: `${number(mexico.coverage.financialPeriods)} fiscal-year records from 2023–2025. ${number(mexico.coverage.exactPeriodHistories['3'])} RFCs appear in all three.`,
    boundary: 'Amounts stay in MXN. Financial periods and dated directory entries describe different observations. The edition covers SAT’s authorized-entity publications.',
    manifest: '/data/charity-financials/mx/manifest.json',
  },
  {
    id: 'netherlands',
    name: 'Netherlands',
    source: 'Belastingdienst ANBI register and Rijksfinanciën subsidies',
    route: '/record/charity-index/netherlands/',
    label: 'Search Dutch ANBI public benefit organizations',
    date: netherlands.capturedOn,
    recordCount: netherlands.counts.distinctOrganizations,
    recordUnit: 'ANBI RSINs',
    coverage: `${number(netherlands.counts.distinctOrganizations)} distinct nine-digit RSIN organizations (${number(netherlands.counts.activeOrganizations)} active, ${number(netherlands.counts.revokedOrEndedOrganizations)} revoked or ended, ${number(netherlands.counts.culturalActiveOrganizations)} active Cultural ANBIs).`,
    history: 'A paired funding-flows edition covers 17,868 nonprofit recipients across five budget years (2020–2024) of central-government subsidies totaling EUR 15,540,383k net.',
    boundary: 'Belastingdienst uses RSIN while Rijksfinanciën uses KvK-nummer with no free public crosswalk, so subsidy links stay labeled as unverified name candidates and statutory Bekostiging block funding (EUR 70.88B) stays separate.',
    manifest: '/data/charity-registry/netherlands/manifest.json',
    fundingFlowRoute: '/record/funding-flows/netherlands-rijksfinancien/',
    fundingFlowLabel: 'Rijksfinanciën subsidies (2020–2024)',
  },
  {
    id: 'new-zealand',
    name: 'New Zealand',
    source: 'Charities Services register and Tier 3 filings',
    route: '/record/charity-index/new-zealand/',
    label: 'Search New Zealand charities and Tier 3 filings',
    date: newZealand.capturedAt.slice(0, 10),
    recordCount: newZealand.registry.included,
    recordUnit: 'organizations',
    coverage: `${number(newZealand.registry.included)} searchable organization entries, including deregistered and removed entries.`,
    history: `${number(newZealand.registry.withBothYears)} entries have selected Tier 3 returns for periods ending in both 2024 and 2025.`,
    boundary: 'The financial selection covers individual Tier 3 returns. Currency follows the reporting standard where the source field is blank.',
    manifest: '/data/charity-registry/new-zealand/manifest.json',
  },
  {
    id: 'norway',
    name: 'Norway',
    source: 'Brønnøysundregistrene Frivillighetsregisteret and Lottstift Momskompensasjon',
    route: '/record/charity-index/norway/',
    label: 'Search Norwegian voluntary organizations',
    date: norway.capturedOn,
    recordCount: norway.counts.includedOrganizations,
    recordUnit: 'voluntary orgs',
    coverage: `${number(norway.counts.includedOrganizations)} voluntary organizations with validated nine-digit organization numbers, including ${number(norway.counts.matchedMomskompensasjon2023to2025)} matched to 2023–2025 VAT compensation grants.`,
    history: 'A paired funding-flows edition spans three grant years (2023–2025), two 2025 disbursement tranches and 264 central umbrella intermediaries.',
    boundary: 'Public annual accounts in Regnskapsregisteret return an unsupported chart-of-accounts error (IDEELL) for nonprofits, so grant disclosures stay separate from audited accounts.',
    manifest: '/data/charity-registry/norway/manifest.json',
    fundingFlowRoute: '/record/funding-flows/norway-momskompensasjon/',
    fundingFlowLabel: 'VAT compensation grants (2023–2025)',
  },
  {
    id: 'poland',
    name: 'Poland',
    source: 'NIW-CRSO Public Benefit Organizations (OPP) and Ministry of Finance 1.5% PIT',
    route: '/record/charity-index/poland/',
    label: 'Search Polish public benefit organizations',
    date: poland.capturedOn,
    recordCount: poland.counts.includedOrganizations,
    recordUnit: 'KRS OPPs',
    coverage: `${number(poland.counts.includedOrganizations)} distinct 10-digit KRS organizations across 2023–2025 NIW eligibility registers (${number(poland.counts.eligible2025)} eligible for 2025/2026; ${number(poland.counts.withValidatedNip)} with mod-11 validated NIPs).`,
    history: 'A paired funding-flows edition covers four years of 1.5% PIT tax designations (2022–2025, paid 2023–2026) totaling PLN 8.32 billion across 10,395 funded OPPs with disclosed taxpayer counts.',
    boundary: 'OPP status covers statutory 1.5%-eligible charities rather than all Polish associations. Top-10 concentration (45.69% in 2025) reflects sub-account (cel szczegółowy) intermediaries; taxpayer counts omit OPPs below 0.1k taxpayers.',
    manifest: '/data/charity-registry/poland/manifest.json',
    fundingFlowRoute: '/record/funding-flows/poland-pit-1-5-percent/',
    fundingFlowLabel: '1.5% PIT designations (2022–2025)',
  },
  {
    id: 'scotland',
    name: 'Scotland',
    source: 'Scottish Charity Regulator register and annual returns',
    route: '/record/charity-financials/scotland/',
    label: 'Search Scottish registrations and returns',
    date: scotland.date,
    recordCount: scotland.identities,
    recordUnit: 'registered charities',
    coverage: `${number(scotland.identities)} searchable registration numbers, including ${number(scotland.withReturns)} with an included return.`,
    history: `${number(scotland.counts.included)} dated returns in GBP. ${number(scotland.multiPeriod)} registrations have multiple periods.`,
    boundary: 'The period start is unavailable. Three confirmed cross-register matches show where the regulators agree and where their figures or receipt dates differ.',
    manifest: '/data/charity-financials/scotland/manifest.json',
  },
  {
    id: 'taiwan',
    name: 'Taiwan',
    source: 'Ministry of Finance institutional registrations',
    route: '/record/charity-index/taiwan/',
    label: 'Search Taiwan institutional registrations',
    date: taiwan.capturedOn,
    recordCount: taiwan.counts.includedIdentities,
    recordUnit: 'institutional IDs',
    coverage: `${number(taiwan.counts.includedIdentities)} exact institutional withholding-unit numbers with published names.`,
    history: 'A separate Fund edition follows reported execution for projects across two reporting years.',
    boundary: 'Registration location and a tax change code describe the filed identity. Active charity status and where services happened require other evidence.',
    manifest: '/data/charity-registry/taiwan/manifest.json',
    fundingFlowRoute: '/record/funding-flows/taiwan-new-resident-fund/',
    fundingFlowLabel: 'New Resident Development Fund',
  },
  {
    id: 'united-states',
    name: 'United States',
    source: 'IRS identity and Form 990 extracts',
    route: '/record/charity-financials/united-states/',
    label: 'Search U.S. Form 990 finances',
    date: usa.capturedOn,
    recordCount: registry.recordCount,
    recordUnit: 'IRS EO BMF EINs',
    coverage: `${number(registry.recordCount)} dated federal registry identities. Separately, ${number(usa.counts.organizations)} EINs have a selected full Form 990 period.`,
    history: `${number(usa.counts.includedPeriods)} processed financial records for periods ending in 2022–2024. ${number(usa.counts.multiPeriod)} EINs have multiple periods.`,
    boundary: 'The full-form financial edition covers subsection 03. The other U.S. editions below use their own extract populations.',
    manifest: '/data/charity-financials/us/manifest.json',
    fundingFlowRoute: '/record/funding-flows/us-schedule-i/',
    fundingFlowLabel: 'U.S. Schedule I grants',
  },
];

export const GLOBAL_CHARITY_INDEX_PANELS: JurisdictionPanel[] = RAW_PANELS.map((panel) => ({
  ...panel,
  ...pageIdentity(panel.route),
}));

export const GLOBAL_CHARITY_INDEX_TOTAL_RECORDS = RAW_PANELS.reduce(
  (sum, panel) => sum + panel.recordCount,
  0,
);

export const US_ADDITIONAL_EDITIONS = [
  {
    form: usaShort.form,
    route: `/record/charity-financials/united-states/${usaShort.form.toLowerCase()}/`,
    manifest: '/data/charity-financials/us-990-ez/manifest.json',
    organizations: usaShort.counts.organizations,
    includedPeriods: usaShort.counts.includedPeriods,
    multiPeriod: usaShort.counts.multiPeriod,
  },
  {
    form: usaFoundation.form,
    route: `/record/charity-financials/united-states/${usaFoundation.form.toLowerCase()}/`,
    manifest: '/data/charity-financials/us-990-pf/manifest.json',
    organizations: usaFoundation.counts.organizations,
    includedPeriods: usaFoundation.counts.includedPeriods,
    multiPeriod: usaFoundation.counts.multiPeriod,
  },
] as const;

export const US_IRS_REGISTRY_SUMMARY = {
  dataDate: registry.dataDate,
  recordCount: registry.recordCount,
  manifest: '/data/irs-registry/manifest.json',
  route: '/tools/charity-lookup/',
} as const;

export const COVERAGE_SOURCES = [
  { title: 'Download charity register data', publisher: 'Australian Charities and Not-for-profits Commission', url: 'https://www.acnc.gov.au/charity/about-charity-register/download-charity-register-data' },
  { title: '2024 List of charities', publisher: canada.publisher, url: canada.editions['2024'].catalogue },
  { title: 'Full register download', publisher: 'Charity Commission for England and Wales', url: 'https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download' },
  { title: 'Scottish register and annual return downloads', publisher: scotland.sources.register.publisher, url: scotland.catalogue },
  { title: 'French association accounts dataset', publisher: france.source.publisher, url: france.source.dataset },
  { title: 'Registry of Associations and Public Benefit Companies (moj-amutot)', publisher: israel.publisher, url: israel.catalogue },
  { title: 'Foreign State Entity Donations CKAN API (35cb40b5)', publisher: israel.publisher, url: 'https://data.gov.il/dataset/moj-amutot' },
  { title: 'Uzņēmumu reģistrs & VID Sabiedriskā labuma organizācijas (SLO)', publisher: latvia.publisher, url: latvia.catalogues.vidSlo },
  { title: 'CFLA EU Funds 2014–2027 & Recovery Facility Projects', publisher: 'Centrālā finanšu un līgumu aģentūra (data.gov.lv)', url: 'https://data.gov.lv/dati/lv/dataset/eiropas-savienibas-fondu-21-27-perioda-lidzfinansetie-projekti' },
  { title: 'Open data — Algemeen Nut Beogende Instellingen (ANBI)', publisher: netherlands.publisher, url: netherlands.catalogue },
  { title: 'Open data — Financiële Instrumenten 2017–2024', publisher: 'Ministerie van Financiën (Rijksfinanciën)', url: 'https://www.rijksfinancien.nl/financiele-instrumenten' },
  { title: 'Frivillighetsregisteret dataset listing', publisher: norway.publisher, url: norway.catalogue },
  { title: 'Momskompensasjon open data workbooks (2023–2025)', publisher: 'Lotteri- og stiftelsestilsynet', url: 'https://lottstift.no/nb/om-oss/apne-data/' },
  { title: 'Wykaz OPP uprawnionych do 1,5% PIT za 2025 r.', publisher: 'NIW-CRSO (dane.gov.pl)', url: poland.catalogues.niw2025 },
  { title: 'Wykaz OPP, które otrzymały część należnego PIT (dataset 171)', publisher: 'Ministerstwo Finansów (dane.gov.pl)', url: poland.catalogues.mfPit15 },
  { title: 'Taiwan nonprofit institution and organization dataset', publisher: taiwan.publisher, url: taiwan.catalogue },
  { title: 'National NPO Portal bulk downloads', publisher: japan.publisher, url: japan.portal + 'download/all' },
  { title: 'Annual extract of tax-exempt organization financial data', publisher: 'Internal Revenue Service', url: usa.sourcePage },
] as const;

export interface FundingFlowCatalogItem {
  slug: string;
  title: string;
  scope: string;
  summary: string;
  manifest?: string;
  dataJson?: string;
}

export interface FundingFlowCatalogGroup {
  id: 'lookups' | 'cases';
  title: string;
  symbol: SymbolName;
  items: readonly FundingFlowCatalogItem[];
}

export const FUNDING_FLOW_GROUPS: readonly FundingFlowCatalogGroup[] = [
  {
    id: 'lookups',
    title: 'Search original records',
    symbol: 'fileSearch',
    items: [
      { slug: 'brazil-transferegov', title: 'Federal transfers', scope: 'Brazil', summary: 'Find agreements and the bank orders that made federal money available.', manifest: '/data/funding-flows/brazil-transferegov/manifest.json' },
      { slug: 'brazil-planned-geography', title: 'Planned work by municipality', scope: 'Brazil', summary: 'Look up where civil society agreements planned work and see where the source leaves locations unknown.', manifest: '/data/funding-flows/brazil-planned-geography/manifest.json' },
      { slug: 'brazil-project-execution', title: 'Infrastructure projects and progress', scope: 'Brazil', summary: 'Link public works to budget commitments. Compare where work was planned, where projects are registered and what physical progress was reported.', dataJson: '/record/funding-flows/brazil-project-execution/data.json' },
      { slug: 'brazil-project-contracts', title: 'Infrastructure contract records', scope: 'Brazil', summary: 'Match project and procurement references to reported contract dates and amounts. See where portal references overlap.', dataJson: '/record/funding-flows/brazil-project-contracts/data.json' },
      { slug: 'brazil-works-measurements', title: 'Works monitoring and measured amounts', scope: 'Brazil', summary: 'Find reported measurement periods and accumulated work-item figures connected to the original proposal.', dataJson: '/record/funding-flows/brazil-works-measurements/data.json' },
      { slug: 'brazil-infrastructure-account-movements', title: 'Infrastructure account movements', scope: 'Brazil', summary: 'Find institutional payments and transfers to agreement holders. See how far onward amounts can be reconciled.', dataJson: '/record/funding-flows/brazil-infrastructure-account-movements/data.json' },
      { slug: 'brazil-infrastructure-invoice-items', title: 'Infrastructure invoice items', scope: 'Brazil', summary: 'Trace institutional payments to expense documents. Compare gross item amounts and reported payments for the same documents.', dataJson: '/record/funding-flows/brazil-infrastructure-invoice-items/data.json' },
      { slug: 'brazil-infrastructure-procurement-payments', title: 'Infrastructure procurements and payments', scope: 'Brazil', summary: 'Follow expense documents to the original procurements and inspect payments with a verified contract reference.', dataJson: '/record/funding-flows/brazil-infrastructure-procurement-payments/data.json' },
      { slug: 'brazil-infrastructure-work-lots', title: 'Infrastructure contract lots and start authorizations', scope: 'Brazil', summary: 'Connect reported contracts to work packages, planned subgoals and start authorization records.', dataJson: '/record/funding-flows/brazil-infrastructure-work-lots/data.json' },
      { slug: 'brazil-infrastructure-procurement-lots', title: 'Infrastructure payments and works lots', scope: 'Brazil', summary: 'Follow paid procurements to recorded work packages. Read the exact links and the Joaçaba clinic case.', dataJson: '/record/funding-flows/brazil-infrastructure-procurement-lots/data.json' },
      { slug: 'canada-qualified-donees', title: 'Reported gifts', scope: 'Canada', summary: 'Look up a filer or recipient and open the corresponding CRA worksheet entries.', manifest: '/data/funding-flows/ca-qualified-donees/manifest.json' },
      { slug: 'canada-grant-geography', title: 'Grant activities by country', scope: 'Canada', summary: 'See the countries named in charity grant reporting and the amounts left unallocated.', dataJson: '/record/funding-flows/canada-grant-geography/data.json' },
      { slug: 'chile-residential-payments', title: 'Residential care awards and payments', scope: 'Chile', summary: 'Find all 19 recipients by tax ID. Compare the award round with the ledger, and see reported service counts and surveyed need across 16 regions.' },
      { slug: 'ile-de-france-paid-grants', title: 'Regional grant payments', scope: 'Île-de-France, France', summary: 'Find reported payments by association name or official organization identifier.', manifest: '/data/funding-flows/ile-de-france/manifest.json' },
      { slug: 'israel-foreign-state-donations', title: 'Foreign state entity donations (2012–2026)', scope: 'Israel', summary: 'Search 516 Israeli nonprofits across 13,436 quarterly cross-border disclosures (ILS 7.53B net), joined by exact ID with source anomalies kept visible.', manifest: '/data/funding-flows/israel-foreign-state-donations/manifest.json' },
      { slug: 'latvia-eu-funds', title: 'EU Cohesion & Recovery Fund projects (2014–2027)', scope: 'Latvia', summary: 'Search 292 nonprofit-led EU projects (EUR 233.47M total) and 260 separate partner roles with implementation regions and Active SLO vs. industry-cluster splits.', manifest: '/data/funding-flows/latvia-eu-funds/manifest.json' },
      { slug: 'netherlands-rijksfinancien', title: 'Central-government nonprofit subsidies (2020–2024)', scope: 'Netherlands', summary: 'Search 17,868 Dutch foundations, associations and religious bodies across 16 budget chapters (EUR 15.54B net) and inspect the KvK-to-RSIN identifier gap.', manifest: '/data/funding-flows/netherlands-rijksfinancien/manifest.json' },
      { slug: 'norway-momskompensasjon', title: 'VAT compensation grants (2023–2025)', scope: 'Norway', summary: 'Search 28,011 Norwegian voluntary organizations across three grant years, 264 central umbrella intermediaries and two-tranche 2025 payouts.', manifest: '/data/funding-flows/norway-momskompensasjon/manifest.json' },
      { slug: 'poland-pit-1-5-percent', title: '1.5% personal income tax designations (2022–2025)', scope: 'Poland', summary: 'Search 10,395 Polish public benefit organizations totaling PLN 8.32B, inspect disclosed taxpayer counts and reconcile NIW eligibility lists against payouts.', manifest: '/data/funding-flows/poland-pit-1-5-percent/manifest.json' },
      { slug: 'taiwan-new-resident-fund', title: 'New Resident Development Fund', scope: 'Taiwan', summary: 'Search institutional grant reports. Follow the same project ID across approvals, execution figures and disbursement fields.' },
      { slug: 'us-schedule-i', title: 'Schedule I grants', scope: 'United States', summary: 'Trace grants and noncash assistance between filer and recipient EINs in one IRS archive.', manifest: '/data/funding-flows/us-schedule-i/manifest.json' },
    ],
  },
  {
    id: 'cases',
    title: 'Follow a funding case',
    symbol: 'split',
    items: [
      { slug: 'chile-coanil-agreements', title: 'COANIL residence agreements', scope: 'Chile', summary: 'Trace ten awards through a signed agreement, a later amendment and a separate grant. Compare government and recipient payment reports.' },
      { slug: 'france-emmaus-solidarite', title: 'Regional grants to Emmaüs Solidarité', scope: 'Île-de-France, France', summary: 'Match five regional decisions to reported payments. Read four annual filings and independent one-night counts during planned winter work.' },
      { slug: 'brazil-cisterns', title: 'Rainwater systems in Pará', scope: 'Brazil', summary: 'Connect a federal agreement, account payments and tender locations. Read the separate census baseline.', dataJson: '/record/funding-flows/brazil-cisterns/data.json' },
      { slug: 'brazil-infrastructure-procurement-lots/joacaba-outpatient', title: 'Outpatient and hearing-care records in Joaçaba', scope: 'Brazil', summary: 'Read approved procedure counts for the clinic and see which hearing-care codes match its signed service annex.', dataJson: '/record/funding-flows/brazil-infrastructure-procurement-lots/joacaba-outpatient/data.json' },
      { slug: 'brazil-solidarity-kitchens', title: 'Solidarity kitchens', scope: 'Brazil', summary: 'Follow a federal call from selection to bank orders and see what published plans cover.', dataJson: '/record/funding-flows/brazil-solidarity-kitchens/data.json' },
      { slug: 'brazil-solidarity-kitchens/account-payments', title: 'Solidarity kitchens account payments', scope: 'Brazil', summary: 'Follow movements from agreement accounts and see which onward amounts are missing.', dataJson: '/record/funding-flows/brazil-solidarity-kitchens/account-payments/data.json' },
      { slug: 'chile-residential-care', title: 'Donations and residential care funding', scope: 'Chile', summary: 'Follow a foundation from reported donations and municipal records to residence awards and audited accounts.' },
      { slug: 'greater-manchester-home-from-hospital', title: 'Home-from-hospital support', scope: 'England', summary: 'Read local awards and delivery periods alongside the NHS discharge figures for the same area.', dataJson: '/record/funding-flows/greater-manchester-home-from-hospital/data.json' },
      { slug: 'hokkaido-child-support', title: 'Child-support awards in Hokkaido', scope: 'Japan', summary: 'Connect two award years to organization identifiers and read the separate food affordability survey.', dataJson: '/record/funding-flows/hokkaido-child-support/data.json' },
      { slug: 'iberia-hrsa', title: 'Federal grants to an Iberia health center', scope: 'United States', summary: 'Match federal awards to annual audit schedules and read independent health insurance estimates.', dataJson: '/record/funding-flows/iberia-hrsa/data.json' },
      { slug: 'heal-nepal', title: 'Heal Nepal funding and receipts', scope: 'United Kingdom and Nepal', summary: 'Compare three publisher records and see where two currencies or different funding periods leave the connection unresolved.', dataJson: '/record/funding-flows/heal-nepal/data.json' },
      { slug: 'kenya-nutrition', title: 'Nutrition funding from the UK to western Kenya', scope: 'United Kingdom and Kenya', summary: 'Compare paired reports from the grant manager, UK charity and Kenyan implementer. Read separate county food poverty estimates.', dataJson: '/record/funding-flows/kenya-nutrition/data.json' },
      { slug: 'ripple-effect-kenya-accounts', title: 'Ripple Effect’s annual accounts in Kenya', scope: 'United Kingdom and Kenya', summary: 'Read parent grants, subsidiary receivables, reported expenses and the discrepancies visible in the same published accounts.', dataJson: '/record/funding-flows/ripple-effect-kenya-accounts/data.json' },
      { slug: 'taiwan-municipal-assistance', title: 'Municipal assistance for new residents', scope: 'Taiwan', summary: 'Trace municipal grants through the audit and compare 2023 disclosures with separately surveyed barriers to getting services.' },
      { slug: 'western-cape-transfers', title: 'Western Cape nonprofit transfers', scope: 'South Africa', summary: 'Compare the province’s transfer and spending figures across two fiscal years, with the original annexes and a home-care project example.', dataJson: '/record/funding-flows/western-cape-transfers/data.json' },
      { slug: 'yes-i-do-alliance', title: 'Yes I Do Alliance', scope: 'Multiple countries', summary: 'Compare the funder’s reported disbursements with the receipts and activities partners published.', dataJson: '/record/funding-flows/yes-i-do-alliance/data.json' },
    ],
  },
];

export function buildCharityIndexApiPayload() {
  return {
    format: 'charitology-global-charity-index-catalog',
    version: 1,
    jurisdictionCount: GLOBAL_CHARITY_INDEX_PANELS.length,
    totalRegistryRecordsAcrossJurisdictions: GLOBAL_CHARITY_INDEX_TOTAL_RECORDS,
    scopeNote:
      'Jurisdictions retain their own legal definitions, periods, currencies and coverage boundaries. Totals are counts of included source records per jurisdiction, not a unified worldwide census or charity rating.',
    coverageRoute: '/record/charity-index/coverage/',
    usIrsRegistry: US_IRS_REGISTRY_SUMMARY,
    usAdditionalFinancialEditions: US_ADDITIONAL_EDITIONS,
    jurisdictions: GLOBAL_CHARITY_INDEX_PANELS.map(
      ({ symbol: _symbol, tone: _tone, ...rest }) => rest,
    ),
  };
}

export function buildFundingFlowsApiPayload() {
  const entries = FUNDING_FLOW_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      group: group.id,
      groupTitle: group.title,
      slug: item.slug,
      route: `/record/funding-flows/${item.slug}/`,
      title: item.title,
      scope: item.scope,
      summary: item.summary,
      ...(item.manifest ? { manifest: item.manifest } : {}),
      ...(item.dataJson ? { dataJson: item.dataJson } : {}),
    })),
  );
  return {
    format: 'charitology-funding-flows-catalog',
    version: 1,
    indexRoute: '/record/funding-flows/',
    totalEntries: entries.length,
    lookupCount: FUNDING_FLOW_GROUPS[0].items.length,
    caseCount: FUNDING_FLOW_GROUPS[1].items.length,
    entries,
  };
}
