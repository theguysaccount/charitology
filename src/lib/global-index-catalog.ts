// Single source of truth for the Global Charity Index (25 jurisdictions) and
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
import croatia from '../../public/data/charity-registry/croatia/manifest.json';
import czechia from '../../public/data/charity-registry/czechia/manifest.json';
import denmark from '../../public/data/charity-registry/denmark/manifest.json';
import estonia from '../../public/data/charity-registry/estonia/manifest.json';
import hongKong from '../../public/data/charity-registry/hong-kong/manifest.json';
import hkPermits from '../../public/data/funding-flows/hong-kong-fundraising-permits/manifest.json';
import hungary from '../../public/data/charity-registry/hungary/manifest.json';
import israel from '../../public/data/charity-registry/israel/manifest.json';
import latvia from '../../public/data/charity-registry/latvia/manifest.json';
import newZealand from '../../public/data/charity-registry/new-zealand/manifest.json';
import netherlands from '../../public/data/charity-registry/netherlands/manifest.json';
import norway from '../../public/data/charity-registry/norway/manifest.json';
import poland from '../../public/data/charity-registry/poland/manifest.json';
import slovakia from '../../public/data/charity-registry/slovakia/manifest.json';
import sweden from '../../public/data/charity-registry/sweden/manifest.json';
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
    id: 'croatia',
    name: 'Croatia',
    source: 'Ministry of Justice Register of Associations (Registar udruga) & Register of Foundations (Registar zaklada)',
    route: '/record/charity-index/croatia/',
    label: 'Search Croatian associations and foundations',
    date: croatia.capturedOn,
    recordCount: croatia.counts.includedOrganizations,
    recordUnit: 'nonprofits',
    coverage: `${number(croatia.counts.includedOrganizations)} Croatian associations (${number(croatia.counts.byForm.association)}) and foundations (${number(croatia.counts.byForm.foundation)}) across active (${number(croatia.counts.byStatus.active)}), erased (${number(croatia.counts.byStatus.erased)}) and ceased (${number(croatia.counts.byStatus.ceased)}) statuses, with ${number(croatia.counts.validatedOibs)} ISO-7064 validated 11-digit OIBs.`,
    history: `Joins ${number(croatia.counts.activityDomainRowsJoined)} statutory activity-domain classifications across ${number(croatia.counts.associationsWithActivityDomains)} associations (register snapshot as of ${croatia.asOf}).`,
    boundary: 'Email addresses and street addresses are stripped (county/city only) and the separate officeholder personal-names extract is excluded. Blank legacy OIBs (3,213 historic erased associations) and one source duplicate OIB remain verbatim in anomalies.json.',
    manifest: '/data/charity-registry/croatia/manifest.json',
  },
  {
    id: 'czechia',
    name: 'Czechia',
    source: 'Ministry of Justice Public Registers (Veřejný rejstřík) and DotaceEU 2021–2027',
    route: '/record/charity-index/czechia/',
    label: 'Search Czech nonprofits, foundation endowments and EU grants',
    date: czechia.capturedOn,
    recordCount: czechia.counts.includedOrganizations,
    recordUnit: 'nonprofits',
    coverage: `${number(czechia.counts.includedOrganizations)} nonprofits across 6 civil-society legal forms (${number(czechia.counts.byForm.spolek)} associations, ${number(czechia.counts.byForm.pobspolek)} branches, ${number(czechia.counts.byForm.nadf)} endowment funds, ${number(czechia.counts.byForm.ops)} o.p.s., ${number(czechia.counts.byForm.ustav)} institutes, ${number(czechia.counts.byForm.nad)} foundations; ${number(czechia.counts.withRegisteredCapital)} with CZK 17.33B in statutory capital).`,
    history: 'A paired funding-flows edition covers 3,906 deduplicated EU Cohesion Policy 2021–2027 nonprofit operations totaling CZK 23.83 billion (CZK 17.85B EU support / CZK 11.89B paid).',
    boundary: 'Unit-owners housing associations (SVJ), trade unions and Ministry of Culture church entities sit outside this 6-form Ministry of Justice civil-society scope. Endowed foundations hold 98.4% of declared statutory capital yet account for 0.6% of EU Cohesion funding, while legacy public benefit companies (o.p.s.) deliver 26.1%.',
    manifest: '/data/charity-registry/czechia/manifest.json',
    fundingFlowRoute: '/record/funding-flows/czechia-eu-funds/',
    fundingFlowLabel: 'EU Cohesion Policy 2021–2027 grants',
  },
  {
    id: 'denmark',
    name: 'Denmark',
    source: 'Skattestyrelsen Den juridiske vejledning 2026-2 (C.A.4.3.5.9)',
    route: '/record/charity-index/denmark/',
    label: 'Search Danish tax-approved charities',
    date: denmark.capturedOn,
    recordCount: denmark.counts.includedOrganizations,
    recordUnit: 'tax-approved charities',
    coverage: `${number(denmark.counts.includedOrganizations)} Danish charities, foundations and institutions with 100% unique 8-digit CVR numbers (${number(denmark.counts.ll8aTotal)} LL § 8 A gift-deductible, ${number(denmark.counts.ll12Total)} LL § 12 stk. 3 recurring gifts, ${number(denmark.counts.balListedTotal)} BAL § 3 stk. 2 estate-tax exempt).`,
    history: `Covers the ${denmark.approvalCalendarYear} statutory approval year (LL § 8 A deduction cap DKK 19,000 in 2025 / DKK 20,000 in 2026), keeping ${number(denmark.counts.ll8aPartialYear)} partial-year § 8 A flags and ${number(denmark.counts.ceased2025)} OPHØRT ceased notices intact.`,
    boundary: 'Covers organizations approved by Skattestyrelsen for donor gift deductions or inheritance-tax exemption; unapproved clubs and separate LL § 8 H research entities sit outside this extract. Organization-level financial statements are not published in Skattestyrelsen’s list.',
    manifest: '/data/charity-registry/denmark/manifest.json',
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
    id: 'estonia',
    name: 'Estonia',
    source: 'e-Business Register (RIK), EMTA Tax-Incentive (TMNSN) and RTK EU/EEA Funds',
    route: '/record/charity-index/estonia/',
    label: 'Search Estonian nonprofits, TMNSN and annual filings',
    date: estonia.capturedOn,
    recordCount: estonia.counts.includedOrganizations,
    recordUnit: 'nonprofits',
    coverage: `${number(estonia.counts.includedOrganizations)} nonprofit associations, foundations and trade unions (${number(estonia.counts.byTmnsn.active)} active EMTA TMNSN charities; ${number(estonia.counts.withFinancialReports2023to2025)} with 2023–2025 XBRL EUR financial filings).`,
    history: 'A paired funding-flows edition covers 1,566 nonprofit-form EU Cohesion, JTF, RRF and EEA/Norway projects (2014–2027) totaling EUR 2.62 billion (EUR 1.81B grant / EUR 1.48B paid).',
    boundary: 'Apartment associations (25,709 Korteriühistu) are cleanly excluded by separate legal form. State innovation agencies and public hospitals using the Sihtasutus foundation form account for 80.3% of nonprofit EU/EEA project budgets vs. 1.3% for active TMNSN associations.',
    manifest: '/data/charity-registry/estonia/manifest.json',
    fundingFlowRoute: '/record/funding-flows/estonia-eu-funds/',
    fundingFlowLabel: 'EU/EEA & Recovery projects',
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
    id: 'hong-kong',
    name: 'Hong Kong',
    source: 'Inland Revenue Department Section 88 Register of Tax-Exempt Charities',
    route: '/record/charity-index/hong-kong/',
    label: 'Search Hong Kong Section 88 charities (EN & 中文)',
    date: hongKong.capturedOn,
    recordCount: hongKong.counts.includedOrganizations,
    recordUnit: 'Section 88 charities',
    coverage: `${number(hongKong.counts.includedOrganizations)} distinct parent charitable institutions and trusts exempt under Section 88 of the Inland Revenue Ordinance as at ${hongKong.asOf} (${number(hongKong.counts.bilingualOrganizations)} bilingual English + Traditional Chinese; ${number(hongKong.counts.organizationsWithSubsidiaries)} parent networks overseeing ${number(hongKong.counts.subsidiaryRows)} separately listed subsidiary schools, kindergartens and clinics).`,
    history: `Effective dates span ${hongKong.counts.earliestEffectiveDate} through ${hongKong.counts.latestEffectiveDate} (${number(hongKong.counts.byDecade['2020s'])} approved in the 2020s; ${number(hongKong.counts.byDecade['2010s'])} in the 2010s).`,
    boundary: 'Collapsing 17,614 raw IRD rows by parent English and Chinese names keeps subsidiary bodies visible inside parent counts without double-counting them as independent charities. Hong Kong IRD publishes tax-exemption status and effective dates without centralized annual financial statements.',
    manifest: '/data/charity-registry/hong-kong/manifest.json',
    fundingFlowRoute: '/record/funding-flows/hong-kong-fundraising-permits/',
    fundingFlowLabel: 'Approved fundraising permits (GovHK)',
  },
  {
    id: 'hungary',
    name: 'Hungary',
    source: 'National Tax and Customs Administration (NAV) 1%+1% SZJA Recipient Registers',
    route: '/record/charity-index/hungary/',
    label: 'Search Hungarian 1% SZJA civil charities',
    date: hungary.capturedOn,
    recordCount: hungary.counts.includedOrganizations,
    recordUnit: '1% SZJA charities',
    coverage: `${number(hungary.counts.includedOrganizations)} distinct 8-digit Hungarian tax IDs that received civil 1% personal income tax (SZJA) designations across 2024–2026 (${number(hungary.counts.active2026Organizations)} in 2026; ${number(hungary.counts.presentAll3Years)} funded in all three years), with exact taxpayer counts for every recipient.`,
    history: `A paired funding-flows edition tracks HUF 58.97 billion across 5.40 million civil designations (2024–2026) alongside all ${number(hungary.counts.technicalNumber2026Count)} second-1% technical-number recipients in 2026 (HUF 23.95B from 2.50M taxpayers).`,
    boundary: 'Covers organizations receiving positive 1% SZJA disbursements published by NAV rather than all court-registered civil entities. Street addresses are omitted (municipality only); civil-sector 1% and church/budget technical-number 1% tracks stay strictly separate.',
    manifest: '/data/charity-registry/hungary/manifest.json',
    fundingFlowRoute: '/record/funding-flows/hungary-szja-1-percent/',
    fundingFlowLabel: '1%+1% SZJA designations (2024–2026)',
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
    id: 'slovakia',
    name: 'Slovakia',
    source: 'Finančná správa SR §50 2%/3% Tax-Assignment Overviews (2016–2025)',
    route: '/record/charity-index/slovakia/',
    label: 'Search Slovak 2%/3% tax-assignment recipients',
    date: slovakia.capturedOn,
    recordCount: slovakia.counts.includedOrganizations,
    recordUnit: 'tax-assignment recipients',
    coverage: `${number(slovakia.counts.includedOrganizations)} distinct 8-digit IČO organizations that received §50 income-tax shares across 2016–2025 (${number(slovakia.counts.active2025Organizations)} in 2025; ${number(slovakia.counts.presentAll10Years)} present all 10 years).`,
    history: 'A paired funding-flows edition covers ten full years (2016–2025) of statutory EUR disbursements totaling EUR 782.06 million (EUR 107.04M in 2025), including full cp852 recovery of the 2022 official CSV.',
    boundary: 'Covers organizations receiving positive §50 individual (2%/3%) and corporate (1%/2%) tax assignments; EUR 0 Notary Chamber registrants are excluded. Because Slovakia allows corporate tax assignment, named foundations (dominated by corporate foundations) receive 30.9% of 2025 payouts.',
    manifest: '/data/charity-registry/slovakia/manifest.json',
    fundingFlowRoute: '/record/funding-flows/slovakia-pit-2-percent/',
    fundingFlowLabel: '2%/3% tax assignments (2016–2025)',
  },
  {
    id: 'sweden',
    name: 'Sweden',
    source: 'Svensk Insamlingskontroll (90-konto registry & 2025 audited statistics)',
    route: '/record/charity-index/sweden/',
    label: 'Search Swedish 90-konto charities and audited accounts',
    date: sweden.capturedOn,
    recordCount: sweden.counts.includedOrganizations,
    recordUnit: '90-konto profiles',
    coverage: `${number(sweden.counts.includedOrganizations)} fundraising charity profiles overseen by Svensk Insamlingskontroll (${number(sweden.counts.byStatus.active)} active with 100% Swedish Org nr, ${number(sweden.counts.byStatus.withdrawn)} revoked/Indragna, ${number(sweden.counts.byStatus.finished)} closed/Avslutade; ${number(sweden.counts.activeWith2025Revenue)} active cards carry audited 2025 SEK revenue totaling SEK 29.28B).`,
    history: 'A paired funding-flows edition covers audited 2023–2025 sector totals (SEK 23,090M gifts & grants in 2025 across 481 charities) and matches 110/110 Top-110 charities against Sweden’s Top-100 private individual donor list.',
    boundary: 'Covers charities overseen under the 90-konto fundraising standard rather than all Swedish associations. Revoked and closed accounts stay strictly separate from active holders; 3-year administrative ratios measure accounting cost shares rather than program effectiveness.',
    manifest: '/data/charity-registry/sweden/manifest.json',
    fundingFlowRoute: '/record/funding-flows/sweden-90-konto/',
    fundingFlowLabel: 'Audited 90-konto giving (2023–2025)',
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
  { title: 'Registar udruga Republike Hrvatske & Registar zaklada Republike Hrvatske (Otvorena dozvola RH)', publisher: croatia.publisher, url: croatia.catalogues.associations },
  { title: 'Public Registers Open Data (Veřejný rejstřík — 42 court dumps, 2026 actual)', publisher: 'Ministry of Justice of the Czech Republic (Ministerstvo spravedlnosti ČR)', url: czechia.catalogues.justiceVr },
  { title: 'Seznam operací (List of Operations) 2021–2027', publisher: 'Ministry for Regional Development of the Czech Republic (DotaceEU)', url: czechia.catalogues.dotaceEu },
  { title: 'Den juridiske vejledning 2026-2 — C.A.4.3.5.9 Liste over godkendte foreninger', publisher: denmark.publisher, url: denmark.catalogues.skatApprovedList },
  { title: 'Full register download', publisher: 'Charity Commission for England and Wales', url: 'https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download' },
  { title: 'Scottish register and annual return downloads', publisher: scotland.sources.register.publisher, url: scotland.catalogue },
  { title: 'e-Business Register Open Data (RIK) & 2023–2025 annual report XBRL elements', publisher: 'Centre of Registers and Information Systems (RIK)', url: estonia.catalogues.rik },
  { title: 'List of associations benefiting from income tax incentives (TMNSN)', publisher: 'Estonian Tax and Customs Board (EMTA)', url: estonia.catalogues.emtaTmnsn },
  { title: 'EU Structural Funds, JTF, RRF & EEA/Norway Funded Projects', publisher: 'State Shared Service Centre of Estonia (RTK)', url: estonia.catalogues.rtk },
  { title: 'French association accounts dataset', publisher: france.source.publisher, url: france.source.dataset },
  { title: 'List of charitable institutions and trusts of a public character exempt from tax under Section 88 (CSV)', publisher: hongKong.publisher, url: hongKong.catalogues.irdCsv },
  { title: 'Approved Charitable Fund-Raising Activities (SWD Public Subscription Permits & HAD Lottery Licences PSI JSON)', publisher: hkPermits.publisher, url: hkPermits.catalogue },
  { title: 'SZJA 1+1% recipient disbursement announcements (2024–2026 civil & 2026 technical-number workbooks)', publisher: hungary.publisher, url: hungary.catalogues.navSzjaPortal },
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
  { title: 'Ročný prehľad prijímateľov podielu zaplatenej dane (2016–2025 CSVs)', publisher: slovakia.publisher, url: slovakia.catalogues.financnaSprava },
  { title: '90-konto public directory & 2025 audited fundraising statistics', publisher: sweden.publisher, url: sweden.catalogues.directory },
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
      { slug: 'czechia-eu-funds', title: 'EU Cohesion Policy 2021–2027 nonprofit grants', scope: 'Czechia', summary: 'Search 3,906 deduplicated Czech nonprofit EU operations (CZK 23.83B cost / CZK 17.85B EU support) and compare statutory foundation endowments against frontline ESF+ delivery.', manifest: '/data/funding-flows/czechia-eu-funds/manifest.json' },
      { slug: 'estonia-eu-funds', title: 'EU Structural Funds, Recovery & EEA/Norway grants (2014–2027)', scope: 'Estonia', summary: 'Search 1,566 nonprofit-form EU/EEA projects (EUR 2.62B budget / EUR 1.48B paid) and inspect why state/hospital foundations absorb 80.3% vs. 1.3% for active TMNSN associations.', manifest: '/data/funding-flows/estonia-eu-funds/manifest.json' },
      { slug: 'hong-kong-fundraising-permits', title: 'Approved charitable fund-raising permits (GovHK SWD & HAD)', scope: 'Hong Kong', summary: 'Search 401 active Hong Kong government-approved street fundraising permits (391 SWD Public Subscription Permits + 10 HAD Lottery Licences across 76 organizations), conservatively cross-matched by bilingual name to IRD Section 88 charities.', manifest: '/data/funding-flows/hong-kong-fundraising-permits/manifest.json' },
      { slug: 'hungary-szja-1-percent', title: '1%+1% personal income tax (SZJA) designations (2024–2026)', scope: 'Hungary', summary: 'Compare HUF 58.97B across 34,109 civil 1% recipients (with exact taxpayer counts for every charity) alongside all 186 second-1% church and national-budget technical-number recipients (HUF 23.95B in 2026).', manifest: '/data/funding-flows/hungary-szja-1-percent/manifest.json' },
      { slug: 'ile-de-france-paid-grants', title: 'Regional grant payments', scope: 'Île-de-France, France', summary: 'Find reported payments by association name or official organization identifier.', manifest: '/data/funding-flows/ile-de-france/manifest.json' },
      { slug: 'israel-foreign-state-donations', title: 'Foreign state entity donations (2012–2026)', scope: 'Israel', summary: 'Search 516 Israeli nonprofits across 13,436 quarterly cross-border disclosures (ILS 7.53B net), joined by exact ID with source anomalies kept visible.', manifest: '/data/funding-flows/israel-foreign-state-donations/manifest.json' },
      { slug: 'latvia-eu-funds', title: 'EU Cohesion & Recovery Fund projects (2014–2027)', scope: 'Latvia', summary: 'Search 292 nonprofit-led EU projects (EUR 233.47M total) and 260 separate partner roles with implementation regions and Active SLO vs. industry-cluster splits.', manifest: '/data/funding-flows/latvia-eu-funds/manifest.json' },
      { slug: 'netherlands-rijksfinancien', title: 'Central-government nonprofit subsidies (2020–2024)', scope: 'Netherlands', summary: 'Search 17,868 Dutch foundations, associations and religious bodies across 16 budget chapters (EUR 15.54B net) and inspect the KvK-to-RSIN identifier gap.', manifest: '/data/funding-flows/netherlands-rijksfinancien/manifest.json' },
      { slug: 'norway-momskompensasjon', title: 'VAT compensation grants (2023–2025)', scope: 'Norway', summary: 'Search 28,011 Norwegian voluntary organizations across three grant years, 264 central umbrella intermediaries and two-tranche 2025 payouts.', manifest: '/data/funding-flows/norway-momskompensasjon/manifest.json' },
      { slug: 'ocha-fts-global-clusters', title: 'Global humanitarian funding gaps (2019–2026)', scope: '58 crisis country codes', summary: 'Compare 3,958 UN OCHA FTS plan-cluster rows across 313 response plans ($269.49B required vs. $147.20B funded) and track the global funding drop to 41.0% in 2025.', manifest: '/data/funding-flows/ocha-fts-global-clusters/manifest.json' },
      { slug: 'poland-pit-1-5-percent', title: '1.5% personal income tax designations (2022–2025)', scope: 'Poland', summary: 'Search 10,395 Polish public benefit organizations totaling PLN 8.32B, inspect disclosed taxpayer counts and reconcile NIW eligibility lists against payouts.', manifest: '/data/funding-flows/poland-pit-1-5-percent/manifest.json' },
      { slug: 'slovakia-pit-2-percent', title: '2%/3% income-tax assignments (2016–2025)', scope: 'Slovakia', summary: 'Search EUR 782.06M in statutory individual and corporate income-tax assignments across 26,357 Slovak recipients and inspect corporate foundation concentration (30.9% in 2025).', manifest: '/data/funding-flows/slovakia-pit-2-percent/manifest.json' },
      { slug: 'sweden-90-konto', title: 'Audited 90-konto giving & private-gift shares (2023–2025)', scope: 'Sweden', summary: 'Compare all Top-110 Swedish 90-konto charities (SEK 21,040M = 91.1% of collections) against Top-100 private individual donations alongside audited 2023–2025 sector totals.', manifest: '/data/funding-flows/sweden-90-konto/manifest.json' },
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
