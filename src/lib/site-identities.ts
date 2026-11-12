import publicationRegistry from '../data/publication-editions/registry.json' with { type: 'json' };
import { observationEditionSymbols, publicationSymbols } from './list-identities.ts';
import ledgerManifest from '../data/research-ledger/manifest.json' with { type: 'json' };

import type { SymbolName } from './site-symbols.ts';
export { symbols, type SymbolName } from './site-symbols.ts';

type Tone = 'wine' | 'blue' | 'teal' | 'violet' | 'amber' | 'green' | 'slate';
type Section = { path: string; symbol: SymbolName; tone: Tone; entries?: Record<string, SymbolName> };

export const sections: Section[] = [
  { path: '/', symbol: 'compass', tone: 'slate' },
  { path: '/diagnosis/', symbol: 'lens', tone: 'wine', entries: {
    'fragmentation': 'break', 'measurement-gap': 'hole', 'missing-feedback-loop': 'loop',
    'missing-profession': 'badge', 'missing-voice': 'mute', 'overhead-myth': 'calculator',
    'parked-money': 'lock', 'prestige-economy': 'star', 'proximity-pull': 'pin',
    'restriction-reflex': 'filter', 'short-horizon': 'hourglass', 'silence-about-failure': 'archive',
    'single-lens': 'eye', 'story-bias': 'story', 'symptom-trap': 'layers',
  } },
  { path: '/method/', symbol: 'layers', tone: 'blue' },
  { path: '/programs/', symbol: 'orbit', tone: 'teal', entries: {
    'cause-census': 'atlas', 'certified-charitologist': 'badge', 'charitology-fellowship': 'people',
    'charitology-summit': 'podium', 'charity-incubator': 'seed', 'corporate-program': 'building',
    'donor-advisory': 'dialogue', 'evidence-reviews': 'fileSearch', 'failure-lab': 'alert',
    'field-verification': 'shield', 'forecasting-tournaments': 'forecast', 'history-of-charity': 'history',
    'local-charitology': 'pin', 'methods-lab': 'flask', 'moral-frameworks-program': 'scale',
    'nonprofit-advisory': 'hands', 'policy-program': 'columns', 'principles-course': 'book',
    'question-bounties': 'target', 'red-team': 'flag', 'replication-program': 'flaskCheck',
    'the-charitology-fund': 'coins', 'the-charitology-prize': 'trophy', 'the-open-problems': 'question',
    'time-charitology': 'clock', 'university-chapters': 'school',
  } },
  { path: '/tools/', symbol: 'tools', tone: 'violet', entries: {
    'ai-charitologist': 'spark', 'browser-extension': 'window', 'charitology-wrapped': 'gift',
    'charity-lookup': 'fileSearch', 'charity-os': 'board', 'compare-tool': 'compare',
    'cost-effectiveness-model-kit': 'table', 'disaster-response-guide': 'alert',
    'due-diligence-checklist': 'checks', 'forecasting-platform': 'forecast', 'gift-giving': 'heart',
    'giving-dashboard': 'chart', 'grant-evaluator': 'scale', 'impact-calculator': 'calculator',
    'impact-measurement-toolkit': 'dial', 'legacy-planner': 'document', 'model-bundles': 'packet',
    'one-click-split': 'split', 'portfolio-builder': 'layers', 'public-api': 'code', 'values-compass': 'compass',
    'browser-extension/compatibility': 'checks', 'browser-extension/privacy': 'lock',
    'cost-effectiveness-model-kit/spreadsheet': 'table',
    'giving-dashboard/estimate': 'calculator',
  } },
  { path: '/record/', symbol: 'archive', tone: 'blue', entries: {
    'case-studies': 'folder', 'cause-atlas': 'atlas', 'charitology-100': 'badge', 'charity-index': 'fileSearch',
    'charity-index/coverage': 'checks', 'charity-index/brazil': 'bridge', 'charity-index/japan': 'flag', 'charity-index/new-zealand': 'fern',
    'charity-index/taiwan': 'orchid',
    'charity-financials': 'coins', 'charity-financials/canada': 'maple', 'charity-financials/united-states': 'columns',
    'charity-financials/united-states/990-ez': 'notes', 'charity-financials/united-states/990-pf': 'building',
    'charity-financials/england-wales': 'shield', 'charity-financials/scotland': 'thistle', 'charity-financials/kenya': 'chart', 'charity-financials/mexico': 'agave',
    'charity-financials/france': 'filingStack',
    'countries': 'pin', 'country-profiles': 'globe', 'disagreements': 'dialogue', 'editions': 'document',
    'editions/compare': 'compare', 'encyclopedia': 'book', 'evidence-library': 'stack',
    'failure-archive': 'break', 'funding-flows': 'split', 'funding-flows/canada-qualified-donees': 'chain',
    'funding-flows/canada-grant-geography': 'globe',
    'funding-flows/brazil-transferegov': 'wallet', 'funding-flows/brazil-planned-geography': 'atlas', 'funding-flows/brazil-solidarity-kitchens': 'hands',
    'funding-flows/brazil-project-execution': 'construction',
    'funding-flows/brazil-project-contracts': 'yearFile',
    'funding-flows/brazil-works-measurements': 'ruler',
    'funding-flows/brazil-infrastructure-account-movements': 'bankOrder',
    'funding-flows/brazil-infrastructure-invoice-items': 'calculator',
    'funding-flows/brazil-infrastructure-procurement-payments': 'match',
    'funding-flows/brazil-infrastructure-work-lots': 'layers',
    'funding-flows/brazil-infrastructure-procurement-lots': 'rings',
    'funding-flows/brazil-infrastructure-procurement-lots/joacaba-outpatient': 'signal',
    'funding-flows/brazil-solidarity-kitchens/account-payments': 'coins', 'funding-flows/brazil-cisterns': 'water',
    'funding-flows/us-schedule-i': 'table', 'funding-flows/iberia-hrsa': 'medical', 'funding-flows/ile-de-france-paid-grants': 'pin',
    'funding-flows/greater-manchester-home-from-hospital': 'heart', 'funding-flows/hokkaido-child-support': 'seed',
    'funding-flows/western-cape-transfers': 'building',
    'funding-flows/heal-nepal': 'capsule',
    'funding-flows/kenya-nutrition': 'food',
    'funding-flows/ripple-effect-kenya-accounts': 'balance',
    'funding-flows/taiwan-municipal-assistance': 'umbrella',
    'funding-flows/taiwan-new-resident-fund': 'grantSchedule',
    'funding-flows/chile-residential-care': 'house',
    'funding-flows/chile-residential-payments': 'bankOrder',
    'funding-flows/chile-coanil-agreements': 'agreement',
    'funding-flows/france-emmaus-solidarite': 'winterCoat',
    'funding-flows/yes-i-do-alliance': 'network', 'gap-map': 'map', 'interventions': 'target',
    'journal': 'notes', 'lexicon': 'bars', 'methodology': 'checks', 'myths': 'eye', 'newsletter': 'mail', 'newsletter/edition-1': 'story',
    'open-datasets': 'table', 'podcast': 'headphones', 'podcast-and-newsletter': 'signal',
    'podcast/principles-1': 'network', 'podcast/principles-2': 'layers', 'podcast/principles-3': 'fileSearch',
    'podcast/principles-4': 'compare', 'podcast/principles-5': 'scale', 'podcast/principles-6': 'speech',
    'principles': 'layers', 'principles/read': 'book', 'progress-report': 'steps', 'state-of-charity': 'chart', 'traditions': 'history',
  } },
  { path: '/for-charities/', symbol: 'hands', tone: 'green', entries: {
    'start': 'steps', 'fundraising': 'megaphone', 'networks': 'network', 'collaborate': 'dialogue',
    'website-pilots': 'window', 'os-plan': 'ruler', 'tools': 'tools', 'benefits': 'gift',
    'fundraising/email-appeals': 'mailSend', 'fundraising/paid-ads': 'target',
    'fundraising/fundraising-events': 'calendar', 'fundraising/recurring-giving': 'loop',
    'fundraising/peer-to-peer': 'network', 'fundraising/major-gifts': 'gift',
    'fundraising/grants': 'document', 'fundraising/direct-mail': 'mail',
    'fundraising/corporate-partnerships': 'building', 'fundraising/donor-follow-up': 'dialogue',
    'networks/founder-networks': 'seed', 'networks/leadership-networks': 'people', 'networks/sector-networks': 'map',
  } },
  { path: '/learn/', symbol: 'school', tone: 'teal', entries: {
    'teach': 'book', 'schools': 'seed', 'universities': 'columns', 'clubs': 'people', 'materials': 'download',
  } },
  { path: '/open-problems/', symbol: 'question', tone: 'amber', entries: {
    'closing-the-feedback-loop': 'loop', 'discounting-the-future': 'hourglass', 'measuring-the-source': 'layers',
    'moral-parliament-in-practice': 'dialogue', 'proximity-and-obligation': 'pin', 'story-without-bias': 'story',
    'the-agency-premium': 'person', 'the-counterfactual-problem': 'compare', 'the-depth-census': 'bars',
    'the-enough-question': 'dial', 'the-exchange-rate-problem': 'scale', 'the-failure-commons': 'archive',
    'the-fragmentation-question': 'network', 'the-government-question': 'columns', 'the-money-time-exchange': 'clock',
    'the-optimal-restriction': 'filter', 'the-overhead-replacement': 'calculator', 'the-payout-question': 'wallet',
    'the-profession-question': 'badge', 'the-question-of-questions': 'target', 'the-replication-rate': 'flaskCheck',
    'the-status-flip': 'star', 'when-charity-harms': 'alert',
  } },
  { path: '/disasters/', symbol: 'alert', tone: 'wine', entries: { 'incidents': 'pin', 'editions': 'archive', 'sources': 'document' } },
  { path: '/observations/', symbol: 'eye', tone: 'teal', entries: { 'editions': 'archive', 'sources': 'document', 'files': 'download' } },
  { path: '/research-ledger/', symbol: 'notes', tone: 'blue', entries: { 'editions': 'archive', 'sources': 'document' } },
  { path: '/forecasts/', symbol: 'forecast', tone: 'violet', entries: {
    'daf-assets-2026-above-380b': 'wallet', 'first-open-problem-progress-by-2028': 'steps',
    'five-published-failures-by-2027': 'break', 'polio-wpv1-certified-by-2030': 'shield',
    'us-giving-2026-above-640b': 'gift',
  } },
  { path: '/newsletter/', symbol: 'mail', tone: 'wine', entries: { 'privacy': 'lock' } },
  { path: '/contribute/', symbol: 'people', tone: 'green', entries: { 'review': 'checks' } },
  { path: '/roadmap/', symbol: 'map', tone: 'amber' },
  { path: '/manifesto/', symbol: 'flag', tone: 'wine' },
  { path: '/about/', symbol: 'compass', tone: 'slate' },
  { path: '/browser-data/', symbol: 'download', tone: 'slate' },
  { path: '/search/', symbol: 'lens', tone: 'slate' },
  { path: '/404/', symbol: 'break', tone: 'slate' },
];

const referenceEntries: Record<string, Record<string, SymbolName>> = {
  encyclopedia: {
    'beneficiary-feedback': 'loop', 'charity-as-a-system': 'network', 'cost-effectiveness-analysis': 'calculator',
    'counterfactual-impact': 'compare', 'discounting': 'hourglass', 'donor-advised-funds': 'wallet',
    'effective-altruism': 'compass', 'expected-value': 'forecast', 'identifiable-victim-effect': 'person',
    'impact-investing': 'chart', 'moral-uncertainty': 'scale', 'mutual-aid': 'hands', 'neglectedness': 'hole',
    'outputs-and-outcomes': 'signal', 'overhead-ratio': 'dial', 'participatory-grantmaking': 'dialogue',
    'private-foundations': 'columns', 'psychic-numbing': 'mute', 'randomized-controlled-trials': 'flask',
    'restricted-and-unrestricted-funding': 'unlock', 'scale-neglectedness-tractability': 'target',
    'source-depth': 'layers', 'symptoms-and-sources': 'lens', 'systemic-change': 'steps',
    'theory-of-change': 'map', 'warm-glow-giving': 'sun',
  },
  interventions: {
    'cash-transfers': 'wallet', 'community-health-workers': 'medical', 'corporate-animal-welfare-campaigns': 'paw',
    deworming: 'capsule', 'food-banks': 'food', 'housing-first': 'house', 'insecticide-treated-nets': 'net',
    'lead-exposure-elimination': 'shield', microcredit: 'coins', 'oral-rehydration-therapy': 'drop',
    'seasonal-malaria-chemoprevention': 'calendar', 'teaching-at-the-right-level': 'school',
    'tobacco-taxation-advocacy': 'megaphone', 'vaccination-incentives': 'target', 'vitamin-a-supplementation': 'eye',
  },
  'case-studies': {
    'carnegie-libraries': 'book', dare: 'megaphone', 'green-revolution': 'seed',
    'haiti-earthquake-reconstruction': 'house', 'hookworm-campaign': 'capsule', 'ice-bucket-challenge': 'drop',
    'one-laptop-per-child': 'window', 'oral-rehydration-therapy-spread': 'medical', playpumps: 'loop',
    'polio-eradication': 'shield', 'rosenwald-schools': 'school', 'scared-straight': 'alert', 'smallpox-eradication': 'target',
  },
  myths: {
    'aid-never-works': 'globe', 'if-a-program-sounds-logical-it-works': 'flask', 'low-overhead-means-a-good-charity': 'calculator',
    'most-charities-are-about-equally-effective': 'compare', 'sending-supplies-is-the-best-disaster-help': 'packet',
    'small-donations-dont-make-a-difference': 'coins', 'the-cause-that-moves-you-needs-your-money-most': 'heart',
    'you-cant-measure-the-good-a-charity-does': 'dial',
  },
  disagreements: {
    'are-donor-advised-funds-good-for-charity': 'wallet', 'deworming-long-run-effects': 'capsule',
    'does-microcredit-transform-lives': 'coins', 'how-much-do-animals-count': 'paw', 'near-or-far': 'pin',
    'systemic-change-or-proven-programs': 'layers', 'the-long-term-future-or-present-needs': 'hourglass',
    'what-randomized-trials-can-tell-us': 'flask',
  },
  traditions: {
    'christian-almsgiving-and-tithing': 'gift', dana: 'hands', 'dasvandh-and-seva': 'heart',
    'mutual-aid-societies': 'network', 'the-gospel-of-wealth': 'building',
    tzedakah: 'scale', ubuntu: 'people', 'zakat-and-sadaqah': 'coins',
  },
  principles: {
    '01-what-charitology-is': 'compass', '02-the-charity-system': 'network', '03-depth-from-relief-to-source': 'layers',
    '04-evidence-and-its-grades': 'fileSearch', '05-counterfactuals-and-neglect': 'compare',
    '06-comparing-the-incomparable': 'scale', '07-time': 'clock', '08-feedback-and-voice': 'speech',
    '09-failure-and-learning': 'loop', '10-becoming-a-charitologist': 'badge',
  },
  journal: { 'depth-without-a-ladder': 'layers', 'ten-dollars': 'coins', 'the-feedback-contract': 'loop' },
};

export function chapterSymbol(chapter: number): SymbolName {
  const prefix = String(chapter).padStart(2, '0') + '-';
  return Object.entries(referenceEntries.principles).find(([slug]) => slug.startsWith(prefix))?.[1] ?? 'book';
}

const articleRoutes = sections.flatMap(({ path, symbol, tone, entries = {} }) => [
  { path, symbol, tone },
  ...Object.entries(entries).map(([slug, symbol]) => ({ path: path + slug + '/', symbol, tone })),
]).concat(Object.entries(referenceEntries).flatMap(([section, entries]) =>
  Object.entries(entries).map(([slug, symbol]) => ({ path: `/record/${section}/${slug}/`, symbol, tone: 'blue' as const })),
));

const ledgerPath = '/research-ledger/';
const ledgerKinds = {
  problem: ['question', 'amber'], manuscript: ['notes', 'violet'], case: ['folder', 'teal'],
  method: ['layers', 'slate'], concept: ['book', 'blue'], claim: ['speech', 'wine'],
  artifact: ['packet', 'green'], challenge: ['flag', 'wine'], decision: ['scale', 'slate'],
} as const satisfies Record<string, readonly [SymbolName, Tone]>;
const standaloneLedgerSymbols: Record<string, SymbolName> = {
  'artifact:pr-3-editorial-framing': 'code',
  'claim:depth-census-knowledge': 'layers',
  'claim:ten-dollars-framing': 'compare',
};

// Bind to the published entry in the ledger manifest. A matching slug alone
// does not establish that a ledger record documents an article.
const ledgerArticles = new Map(ledgerManifest.currentSources.map(({ recordId, href }) => [recordId, href]));
const articleSymbols = new Map(articleRoutes.map(({ path, symbol }) => [path, symbol]));
function ledgerRecordRoute(id: string, symbol: SymbolName) {
  const kind = id.split(':', 1)[0] as keyof typeof ledgerKinds;
  return { path: `${ledgerPath}${id}/`, symbol, tone: ledgerKinds[kind]?.[1] ?? 'blue' as const };
}
const ledgerRecords = [...ledgerArticles].map(([id, href]) => {
  const symbol = articleSymbols.get(href);
  if (!symbol) throw new Error(`No article symbol for ${id} at ${href}`);
  return ledgerRecordRoute(id, symbol);
});

const observationEditions = Object.entries(observationEditionSymbols).map(([id, symbol]) => ({
  path: `/observations/editions/${id}/`, symbol, tone: 'teal' as const,
}));
const publicationEditions = Object.entries(publicationRegistry.current).map(([family, id]) => ({
  path: `/record/editions/${id}/`, symbol: publicationSymbols[family], tone: 'blue' as const,
}));

export const routes = [
  ...articleRoutes,
  ...observationEditions,
  ...publicationEditions,
  ...Object.entries(ledgerKinds).map(([kind, [symbol, tone]]) => ({ path: `${ledgerPath}${kind}:`, symbol, tone })),
  ...Object.entries(standaloneLedgerSymbols).map(([id, symbol]) => ledgerRecordRoute(id, symbol)),
  ...ledgerRecords,
].sort((a, b) => a.path.length - b.path.length);

export function pageIdentity(path: string) {
  const decoded = path.startsWith(ledgerPath) ? path.replace(/%3a/gi, ':') : path;
  const normalized = decoded.endsWith('/') ? decoded : decoded + '/';
  return routes.findLast((route) => normalized.startsWith(route.path)) ?? { symbol: 'compass', tone: 'slate' };
}
