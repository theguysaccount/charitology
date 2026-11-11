import type { SymbolName } from './site-identities';

type Destination = readonly [slug: string, text: string, symbol: SymbolName];

// Short labels for stable anchors. Use the same mark in links and at the destination.
export const sectionNavigation: Record<string, readonly Destination[]> = {
  '/about/': [
    ['what-it-is', 'What Charitology is', 'compass'],
    ['why-now', 'Why now', 'clock'],
    ['standards', 'Editorial standards', 'checks'],
    ['open-instruments', 'Open instruments', 'tools'],
    ['privacy', 'Privacy', 'lock'],
    ['licenses', 'Licenses', 'document'],
    ['contact', 'Contact', 'mail'],
  ],
  '/for-charities/os-plan/': [
    ['research-title', 'What we checked', 'lens'],
    ['providers-title', 'Provider landscape', 'board'],
    ['needs-title', 'Public user needs', 'speech'],
    ['implementation', 'Implementation plan', 'steps'],
  ],
  '/record/charity-index/': [
    ['editorial-profiles', 'Search editorial profiles', 'fileSearch'],
    ['irs-index-title', 'Search IRS registry identities', 'permit'],
  ],
  '/record/open-datasets/': [
    ['charitology-datasets', 'Charitology datasets', 'code'],
    ['external-data', 'Independent data sources', 'external'],
  ],
  '/record/country-profiles/': [
    ['country-desk', 'Country data desk', 'globe'],
    ['country-list', 'Browse country profiles', 'atlas'],
  ],
  '/record/cause-atlas/': [
    ['cause-areas', 'Cause areas', 'compass'],
    ['source-map', 'The source map', 'roots'],
  ],
  '/record/gap-map/': [
    ['humanitarian-plan-funding', 'Humanitarian funding and plan requirements', 'route'],
    ['education-plan-funding', 'Afghanistan’s education plan', 'school'],
    ['giving-sources', 'Who gives', 'hands'],
    ['giving-recipients', 'Who receives', 'building'],
    ['donor-advised-funds', 'Donor-advised funds', 'wallet'],
    ['depth-gap', 'The missing depth estimate', 'layers'],
  ],
  '/record/evidence-library/': [
    ['study-register', 'Study register', 'flask'],
    ['bibliography', 'Published bibliography', 'book'],
  ],
  '/record/podcast-and-newsletter/': [
    ['podcast-season', 'Season 1 readings', 'headphones'],
    ['charitology-letter', 'The Charitology Letter', 'mail'],
  ],
  '/record/charity-index/coverage/': [
    ['filings', 'Registry and financial editions', 'archive'],
    ['funding', 'Where money goes', 'route'],
    ['contribute', 'Help close a gap', 'hands'],
  ],
  '/record/charity-index/brazil/': [
    ['registry-search-title', 'Find a registration', 'lens'],
    ['coverage', 'Registry coverage', 'permit'],
    ['sources-and-reuse', 'Sources and reuse', 'packet'],
  ],
  '/record/charity-index/japan/': [
    ['jp-npo-heading', 'Search NPO records', 'lens'],
    ['coverage', 'Registry coverage', 'permit'],
    ['finance', 'Read financial summaries', 'coins'],
  ],
  '/record/charity-index/new-zealand/': [
    ['nz-search-heading', 'Look up a charity', 'lens'],
    ['coverage', 'Coverage and original records', 'permit'],
  ],
  '/record/charity-financials/': [
    ['au-financial-search', 'Search Australian filings', 'lens'],
    ['coverage', 'Coverage and original data', 'yearFile'],
    ['reading-the-figures', 'Read the figures', 'coins'],
  ],
  '/record/charity-financials/canada/': [
    ['ca-finance-heading', 'Search Canadian filings', 'lens'],
    ['coverage', 'Coverage and original data', 'yearFile'],
  ],
  '/record/charity-financials/england-wales/': [
    ['ew-finance-heading', 'Search annual returns', 'lens'],
    ['coverage', 'Coverage and original data', 'yearFile'],
  ],
  '/record/charity-financials/united-states/': [
    ['us-finance-heading', 'Search Form 990 extracts', 'lens'],
    ['coverage', 'Coverage and original data', 'yearFile'],
  ],
  '/record/charity-financials/united-states/990-ez/': [
    ['us-finance-heading', 'Search Form 990-EZ extracts', 'lens'],
    ['coverage', 'Coverage and original data', 'yearFile'],
  ],
  '/record/charity-financials/united-states/990-pf/': [
    ['us-finance-heading', 'Search Form 990-PF extracts', 'lens'],
    ['coverage', 'Coverage and original data', 'yearFile'],
  ],
  '/record/charity-financials/mexico/': [
    ['mx-search-heading', 'Find an organization', 'lens'],
    ['coverage', 'Organizations and years covered', 'yearFile'],
    ['donations', 'Reported donations', 'gift'],
    ['sources-and-downloads', 'Sources and downloads', 'download'],
  ],
  '/record/charity-financials/kenya/': [
    ['filing-coverage', 'Filing coverage', 'yearFile'],
    ['receipts', 'Reported receipts', 'wallet'],
    ['expenditure', 'Reported spending', 'coins'],
    ['original-reports', 'Original report pages', 'document'],
  ],
  '/record/funding-flows/brazil-transferegov/': [
    ['brazil-transfer-heading', 'Find agreements and bank orders', 'lens'],
    ['coverage', 'Coverage and original files', 'archive'],
  ],
  '/record/funding-flows/brazil-planned-geography/': [
    ['lookup', 'Find work-plan goals', 'lens'],
    ['coverage', 'Location coverage', 'map'],
    ['sources-and-data', 'Download data and sources', 'download'],
  ],
  '/record/funding-flows/brazil-cisterns/': [
    ['agreement', 'Federal agreement', 'permit'],
    ['payments', 'Reported account payments', 'bankOrder'],
    ['planned', 'Planned locations', 'map'],
    ['need', 'Water access before the agreement', 'water'],
    ['delivery', 'Reported delivery', 'construction'],
    ['check-records', 'Check the records', 'fileSearch'],
  ],
  '/record/funding-flows/brazil-solidarity-kitchens/': [
    ['selection-and-orders', 'Selection and bank orders', 'bankOrder'],
    ['plans-and-need', 'Planned work and food insecurity', 'food'],
    ['delivery', 'Reported delivery', 'checks'],
    ['agreement-records', 'Original records', 'document'],
  ],
  '/record/funding-flows/brazil-solidarity-kitchens/account-payments/': [
    ['account-payments', 'Reported account payments', 'bankOrder'],
    ['onward-records', 'Matching onward records', 'route'],
    ['separate-sources', 'Partner contributions and tax records', 'table'],
  ],
  '/record/funding-flows/canada-grant-geography/': [
    ['country-lookup', 'Country lookup', 'globe'],
    ['totals', 'Reported and unallocated amounts', 'coins'],
    ['coverage', 'Source coverage', 'archive'],
  ],
  '/record/funding-flows/canada-qualified-donees/': [
    ['ca-gifts-heading', 'Follow reported gifts', 'lens'],
    ['coverage', 'Coverage and original records', 'archive'],
    ['worksheet-comparison', 'Compare worksheets and returns', 'compare'],
  ],
  '/record/funding-flows/greater-manchester-home-from-hospital/': [
    ['awards', 'Who funded what', 'wallet'],
    ['nhs-records', 'NHS delivery records', 'medical'],
    ['scope', 'What the sources can answer', 'fileSearch'],
    ['trials', 'What randomized trials measured', 'flask'],
  ],
  '/record/funding-flows/hokkaido-child-support/': [
    ['awards-2022', 'Fiscal 2022 awards', 'yearFile'],
    ['awards-2023', 'Fiscal 2023 awards', 'calendar'],
    ['need', 'Household food affordability', 'survey'],
    ['funded-organization', 'A funded organization', 'building'],
  ],
  '/record/funding-flows/iberia-hrsa/': [
    ['reporting-calendars', 'Two reporting calendars', 'calendar'],
    ['audit-totals', 'Audit schedule totals', 'table'],
    ['parish', 'Parish health insurance coverage', 'medical'],
    ['grants', 'Records by grant', 'wallet'],
    ['reproduce', 'Reproduce the comparison', 'compare'],
  ],
  '/record/funding-flows/ile-de-france-paid-grants/': [
    ['idf-search-heading', 'Find paid grants', 'lens'],
    ['coverage', 'Coverage and original data', 'archive'],
  ],
  '/record/funding-flows/us-schedule-i/': [
    ['us-grants-heading', 'Find grants by EIN', 'lens'],
    ['coverage', 'Coverage and original records', 'archive'],
  ],
  '/record/funding-flows/yes-i-do-alliance/': [
    ['transfer-views', 'Two views of a transfer', 'compare'],
    ['routes', 'Reported records by route', 'route'],
    ['comparison', 'How the comparison works', 'fileSearch'],
  ],
};

export function pageSections(path: string) {
  return sectionNavigation[path]?.map(([slug, text, symbol]) => ({ slug, text, symbol }));
}
