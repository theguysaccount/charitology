// Editorial marks describe what an item is. IDs are shared by links and the
// items they point to, so filtering or reordering a list never changes its mark.
import type { SymbolName } from './site-symbols';

export const depthSymbols = ['medical', 'stitch', 'umbrella', 'columns', 'roots'] as const;
export const stageSymbols = {
  givers: 'gift', signals: 'signal', channels: 'split', work: 'tools',
  outcomes: 'target', feedback: 'loop', field: 'orbit',
} as const satisfies Record<string, SymbolName>;

export const methodSymbols = {
  system: 'network', depth: 'layers', evidence: 'flask', counterfactual: 'compare',
  frameworks: 'eye', time: 'hourglass', feedback: 'loop', checklist: 'checks', honesty: 'shield',
} as const satisfies Record<string, SymbolName>;

export const checklistSymbols = {
  depth: 'layers', counterfactual: 'compare', evidence: 'flask', feedback: 'loop', voice: 'speech',
  cost: 'calculator', strings: 'lock', durability: 'hourglass', story: 'story', neglect: 'hole',
} as const satisfies Record<string, SymbolName>;

export const lensSymbols: Record<string, SymbolName> = {
  welfare: 'heart', rights: 'shield', justice: 'scale', care: 'hands',
  tradition: 'candle', future: 'hourglass', nature: 'leafPair', flourishing: 'sun',
};

export const causeSymbols: Record<string, SymbolName> = {
  'global-health': 'medical', 'extreme-poverty': 'wallet', hunger: 'food', climate: 'cloud',
  nature: 'leafPair', animals: 'paw', education: 'school', 'mental-health': 'brain', housing: 'house',
  democracy: 'ballot', peace: 'dove', 'catastrophic-risk': 'alert', science: 'flask',
  community: 'people', arts: 'music', faith: 'candle', 'charity-system': 'network',
};

export const sourceSymbols: Record<string, SymbolName> = {
  story: 'story', coordination: 'network', vision: 'compass', attention: 'eye',
  status: 'star', gatekeepers: 'doorway',
};

export const needSymbols: Record<string, SymbolName> = {
  'SP.POP.TOTL': 'people', 'SP.DYN.LE00.IN': 'hourglass', 'SH.DYN.MORT': 'medical',
  'EG.ELC.ACCS.ZS': 'bolt', 'SH.H2O.BASW.ZS': 'water',
};

export const observationMeasureSymbols: Readonly<Record<string, SymbolName>> = {
  'country-basic-water-access': needSymbols['SH.H2O.BASW.ZS'],
  'country-electricity-access': needSymbols['EG.ELC.ACCS.ZS'],
  'country-life-expectancy': needSymbols['SP.DYN.LE00.IN'],
  'country-population': needSymbols['SP.POP.TOTL'],
  'country-under-five-mortality': needSymbols['SH.DYN.MORT'],
  'financial-assets': 'wallet',
  'financial-liabilities': 'scale',
  'financial-net-assets': 'balance',
  'financial-givewell-expenses': 'route',
  'financial-wikimedia-expenses': 'table',
  'afg-education-2024-requirements': 'school',
  'afg-education-2024-funding': 'coins',
};

export const observationEditionSymbols: Readonly<Record<string, SymbolName>> = {
  'observations-2026-10-27': 'globe',
  'observations-2026-11-08-education-plan': 'school',
};

export const hazardSymbols: Record<string, SymbolName> = {
  wildfire: 'flame', earthquake: 'quake', flood: 'flood', storm: 'cloud',
  drought: 'drought', other: 'alert', unclassified: 'question',
};

export const disasterClaimSymbols = {
  'reported-need': 'alert',
  'response-activity': 'hands',
  'appeal-request': 'megaphone',
  status: 'signal',
  correction: 'loop',
} as const satisfies Record<string, SymbolName>;

export const disasterAdviceSymbols: Record<string, SymbolName> = {
  'dr-cash': 'wallet', 'dr-local': 'hands', 'dr-recovery': 'hourglass',
  'dr-scams': 'shield', 'dr-prepare': 'umbrella', 'dr-strings': 'unlock',
};

export const comparisonSymbols = {
  depth: 'layers', evidence: 'flask', mechanism: 'network', timeToEffect: 'clock',
  durability: 'anchor', feedback: 'loop', agency: 'speech', cost: 'calculator',
  causes: 'atlas', conditions: 'lens',
} as const satisfies Record<string, SymbolName>;

export const compassDimensionSymbols: Record<string, SymbolName> = {
  horizon: 'hourglass', circle: 'leafPair', reach: 'pin', certainty: 'flask', depth: 'layers',
};

// These are presentation identities for field labels. They stay out of exports and source records.
export const referenceFieldSymbols: Readonly<Record<string, SymbolName>> = {
  'Also called': 'dialogue', 'System conditions': 'lens', 'Depth hypothesis': 'layers',
  'Cause areas': comparisonSymbols.causes, 'Classification note': 'notes',
  'Financial observation coverage': 'survey',
  Depth: comparisonSymbols.depth, 'Evidence grade': comparisonSymbols.evidence,
  Mechanism: comparisonSymbols.mechanism, 'Time to effect': comparisonSymbols.timeToEffect,
  Durability: comparisonSymbols.durability, Feedback: comparisonSymbols.feedback,
  Agency: comparisonSymbols.agency, 'Cost estimate': comparisonSymbols.cost, 'Estimate context': 'notes',
  'Recorded result': 'target', Place: 'pin', Period: 'calendar', 'Lessons stated in the entry': 'book',
  'Debate status': 'signal', 'Positions covered': 'people', 'Positions in this entry': 'dialogue',
  'Cruxes that could change minds': 'fork', 'Tradition covered': 'candle', 'Origin described': 'history',
  'Practice described': 'hands', 'Interpretive lens': 'eye', 'Editorial verdict': 'scale',
  'Related system conditions': 'lens',
};

export const networkSymbols: Record<string, SymbolName> = {
  'ambitious-impact': 'compass', 'd-prize': 'trophy', 'echoing-green': 'seed', 'fast-forward': 'bolt',
  'school-for-social-entrepreneurs': 'school', unltd: 'spark', acevo: 'personCheck',
  'csae-canada': 'leaf', 'charity-leadership-scotland': 'flag', 'ncss-sun-ray-singapore': 'sun',
  'sila-australia': 'dialogue', 'saif-southern-africa': 'megaphone', bond: 'chain',
  civicus: 'globe', 'national-council-of-nonprofits': 'columns', navca: 'pin', ncvo: 'network',
  techsoup: 'tools',
};

export const starterSymbols: Record<string, SymbolName> = {
  'donor-follow-up': 'dialogue', 'fundraising-costs': 'calculator', 'grant-deadlines': 'calendar',
  'team-handovers': 'people', 'evidence-feedback': 'loop', 'resources-benefits': 'gift',
};

export const starterStepSymbols: Readonly<Record<string, readonly SymbolName[]>> = {
  'donor-follow-up': ['mail', 'shield', 'personCheck', 'loop'],
  'fundraising-costs': ['calendar', 'split', 'calculator', 'scale'],
  'grant-deadlines': ['fileSearch', 'checks', 'calendar', 'mailSend'],
  'team-handovers': ['route', 'notes', 'personCheck', 'loop'],
  'evidence-feedback': ['target', 'compare', 'dialogue', 'loop'],
  'resources-benefits': ['tools', 'compare', 'shield', 'flask'],
};

export const starterReviewSymbols: Readonly<Record<string, readonly SymbolName[]>> = {
  'donor-follow-up': ['checks', 'eye', 'loop'],
  'fundraising-costs': ['wallet', 'compass', 'flask'],
  'grant-deadlines': ['calendar', 'personCheck', 'mailSend'],
  'team-handovers': ['personCheck', 'speech', 'loop'],
  'evidence-feedback': ['eye', 'dialogue', 'flask'],
  'resources-benefits': ['tools', 'coins', 'download'],
};

export const providerSymbols: Record<string, SymbolName> = {
  civicrm: 'person', 'erpnext-frappe': 'table', tendenci: 'badge', 'odoo-oca': 'stack',
  openproject: 'board', kobotoolbox: 'pin', oscar: 'shield', caselight: 'notes',
  givebutter: 'heart', 'salesforce-nonprofit': 'people',
};

export const publicationSymbols: Record<string, SymbolName> = {
  'state-of-charity': 'chart', 'progress-report': 'steps', principles: 'book', journal: 'notes', letter: 'mail',
};

export const diligenceGroupSymbols = {
  legitimacy: 'permit', money: 'coins', results: 'target',
  learning: 'loop', system: 'network', 'red-flags': 'alert',
} as const satisfies Record<string, SymbolName>;

export const diligenceItemSymbols: Record<string, SymbolName> = {
  'irs-status': 'shield', filing: 'yearFile', state: 'flag', governance: 'columns',
  spending: 'wallet', invest: 'seed', audit: 'fileSearch', funders: 'route', pay: 'scale',
  outcomes: 'target', evidence: 'flask', cost: 'calculator', failure: 'break',
  changed: 'loop', 'stop-rule': 'filter', feedback: 'dialogue', depth: 'layers',
  counterfactual: 'compare', coordination: 'network', voice: 'speech', rush: 'clock',
  payment: 'bankOrder', soundalike: 'match', vague: 'hole', prize: 'trophy',
};

export const osDiscussionSymbols: Record<string, SymbolName> = {
  U01: 'people', U02: 'calendar', U03: 'clock', U04: 'personCheck', U05: 'split',
  U06: 'document', U07: 'chart', U08: 'route', U09: 'notes', U10: 'doorway',
  U11: 'compare', U12: 'calculator', U13: 'board', U14: 'steps', U15: 'wallet',
  U16: 'stack', U17: 'badge', U18: 'tools', U19: 'seed', U20: 'hands',
};

export const teachingSymbols: Record<string, SymbolName> = {
  'start-here': 'compass', 'facilitator-guide': 'people', 'student-worksheet': 'notes',
  'university-syllabus': 'columns', 'club-starter': 'flag', 'school-pack': 'school',
  'complete-pack': 'packet',
};

export const clubMeetingSymbols: Record<number, SymbolName> = {
  1: 'network', 2: 'compare', 3: 'scale', 4: 'loop',
};

export const seminarSymbols: Record<number, SymbolName> = {
  1: 'network', 2: 'layers', 3: 'compare', 4: 'scale', 5: 'hourglass',
  6: 'speech', 7: 'loop', 8: 'shield',
};

export const worksheetSymbols: Record<string, SymbolName> = {
  W1: 'network', W2: 'calculator', W3: 'eye', W4: 'compare',
  W5: 'story', W6: 'scale', W7: 'loop', W8: 'doorway',
};

export const lessonGlossarySymbols: Readonly<Record<string, SymbolName>> = {
  Input: 'wallet', Activity: 'tools', Output: 'table', Outcome: 'signal',
  Counterfactual: 'compare', 'Impact claim': 'target', Proxy: 'lens',
  'Percentage point': 'calculator', 'Moral lens': 'scale', Depth: 'layers',
  'Six-source hypothesis': 'roots',
};

export const lessonOutcomeSymbols = ['network', 'calculator', 'dialogue'] as const;
export const lessonLimitSymbols = ['clock', 'compare', 'ruler', 'target', 'doorway', 'lock'] as const;

export const clubHandoverSymbols = [
  'target', 'recordVersion', 'people', 'doorway', 'scale',
  'question', 'calendar', 'wallet', 'columns', 'lock',
] as const;

export const fundraisingSourceSymbols: Record<string, SymbolName> = {
  'mr-email': 'mail', 'mr-advertising': 'target', 'mr-fundraising': 'chart', 'mr-mail': 'packet',
  'mr-glossary': 'book', fep: 'signal', nextafter: 'flask', 'candid-planning': 'steps',
  'candid-individual': 'person', nten: 'network', rogare: 'notes', acknowledgments: 'checks',
  'corporate-sponsorship': 'building', 'donor-rights': 'shield',
};

export const fundraisingModuleSymbols: Record<string, SymbolName> = {
  fundraising: 'gift', projects: 'calendar', communications: 'dialogue', events: 'people',
  'grant-seeking': 'fileSearch', 'grant-delivery': 'route', evaluation: 'flaskCheck',
  outcomes: 'signal', documents: 'document', volunteers: 'personCheck', resources: 'tools',
};

export const lexiconSymbols: Record<string, SymbolName> = {
  additionality: 'spark', beachhead: 'anchor', 'brier-score': 'calculator', calibration: 'dial',
  charitologist: 'badge', charitology: 'compass', 'contract-failure': 'break',
  'cost-effectiveness': 'ruler', counterfactual: 'compare', credence: 'question',
  'discount-rate': 'hourglass', 'donor-advised-fund': 'wallet', 'expected-value': 'forecast',
  'feedback-loop': 'loop', 'general-operating-support': 'building', 'identifiable-victim-effect': 'person',
  impact: 'target', leverage: 'lever', 'moral-parliament': 'dialogue', 'moral-uncertainty': 'scale',
  'mutual-aid': 'hands', neglectedness: 'hole', outcomes: 'signal', outputs: 'table',
  'overhead-ratio': 'bars', 'participatory-grantmaking': 'people', 'payout-rate': 'coins',
  prevention: 'umbrella', 'private-foundation': 'columns', protopia: 'seed',
  'psychic-numbing': 'mute', 'pure-time-preference': 'clock', 'red-team': 'flag',
  relief: 'medical', repair: 'stitch', replication: 'flaskCheck', 'restricted-funding': 'lock',
  scale: 'chart', source: 'roots', 'source-depth': 'layers', 'starvation-cycle': 'drought',
  structure: 'network', symptom: 'pulse', 'systemic-change': 'steps', 'theory-of-change': 'map',
  tractability: 'fork', 'trust-based-philanthropy': 'rings', 'unrestricted-funding': 'unlock',
  'warm-glow': 'sun',
};

const charityProfileSymbols: Record<string, SymbolName> = {
  'against-malaria-foundation': 'net', 'center-for-effective-philanthropy': 'dial',
  'doctors-without-borders': 'medical', 'feedback-labs': 'loop', 'feeding-america': 'food',
  givedirectly: 'wallet', givewell: 'flask', 'habitat-for-humanity': 'house', 'helen-keller-intl': 'eye',
  'lead-exposure-elimination-project': 'shield', 'malaria-consortium': 'calendar',
  'new-incentives': 'target', 'our-world-in-data': 'globe', pratham: 'school',
  'the-humane-league': 'paw', 'wikimedia-foundation': 'book',
};

export const datasetSymbols: Record<string, SymbolName> = {
  index: 'compass', 'humanitarian-plan-cluster': 'split', 'humanitarian-funding': 'wallet',
  'disaster-incidents': 'alert', 'disaster-incident-coverage': 'umbrella', observations: 'eye',
  'observation-coverage': 'checks', 'publication-editions': 'archive', 'research-ledger': 'notes',
  'research-progress': 'steps', 'os-providers': 'board', 'os-user-needs': 'speech',
  conditions: 'lens', 'open-problems': 'question', programs: 'orbit', tools: 'tools',
  record: 'folder', interventions: 'target', charities: 'building', encyclopedia: 'book',
  cases: 'history', myths: 'break', disagreements: 'dialogue', traditions: 'candle',
  principles: 'school', forecasts: 'forecast', journal: 'fileSearch', lexicon: 'bars',
  causes: 'atlas', frameworks: 'scale', depth: 'layers', checklist: 'personCheck',
  figures: 'chart', 'source-map': 'roots', roadmap: 'map', 'nonprofit-tools': 'calculator',
  'nonprofit-benefits': 'gift', countries: 'globe', podcast: 'headphones',
  newsletter: 'mail', sources: 'document',
};

export const ecosystemSymbols: Record<string, SymbolName> = {
  'https://humanityschecklist.org/': 'roots',
  'https://charities.systemicaltruism.com/': 'layers',
  'https://theguysaccount.github.io/charity-impact-media/': 'chart',
  'https://theguysaccount.github.io/whofunds-open-grant-graph/': 'network',
  'https://projects.propublica.org/nonprofits/': 'fileSearch',
  'https://apps.irs.gov/app/eos/': 'shield',
  'https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf': 'building',
  'https://990data.givingtuesday.org/': 'stack',
  'https://www.givewell.org/': 'flask',
  'https://www.givinggreen.earth/': 'leafPair',
  'https://animalcharityevaluators.org/': 'paw',
  'https://ourworldindata.org/': 'globe',
};

// Fragment destinations are shared across the site, including search and
// Markdown links. Registry and report pages still have their own page mark.
export const fragmentSymbols = {
  '/method/': methodSymbols,
  '/record/cause-atlas/': causeSymbols,
  '/record/charity-index/': charityProfileSymbols,
  '/record/lexicon/': lexiconSymbols,
  '/for-charities/start/': starterSymbols,
  '/tools/disaster-response-guide/': disasterAdviceSymbols,
} as const;

export const researchGroupSymbols: Readonly<Record<string, SymbolName>> = {
  'Research record': 'notes',
  Scope: 'lens',
  Protocol: 'planSheet',
  'Shared comparison': 'compare',
  Approach: 'route',
  'Assumption ranges': 'chart',
  'Evidence and limits': 'shield',
  'Claim and scope': 'lens',
  Design: 'planSheet',
  Analysis: 'calculator',
  'Delivery and review': 'reviewDeclaration',
  'Version record': 'recordVersion',
  'Search and selection': 'filter',
  'Study extraction': 'sourceCopy',
  'Critical appraisal': 'checks',
  Synthesis: 'layers',
  Evidence: 'fileSearch',
  Estimate: 'calculator',
  Comparison: 'compare',
  Interpretation: 'speech',
  Decision: 'scale',
  'Deliberation record': 'dialogue',
  'Your weights': 'dial',
  'What happened': 'history',
  'What was tried': 'flask',
  'What was learned': 'book',
  'Follow-up': 'loop',
};

export const workspaceCollectionSymbols: Readonly<Record<string, SymbolName>> = {
  actions: 'route',
  activities: 'pin',
  allocations: 'split',
  checks: 'checks',
  claims: 'speech',
  conflicts: 'flag',
  criteria: 'ruler',
  curriculum: 'school',
  decisions: 'scale',
  deliberations: 'dialogue',
  diagnostics: 'lens',
  equity: 'balance',
  evidence: 'fileSearch',
  experiments: 'flask',
  findings: 'notes',
  followup: 'loop',
  gaps: 'hole',
  learning: 'book',
  ledger: 'archive',
  logs: 'clock',
  milestones: 'steps',
  needs: 'lens',
  nominations: 'star',
  options: 'split',
  pledges: 'wallet',
  production: 'tools',
  projects: 'seed',
  proposals: 'planSheet',
  questions: 'question',
  readiness: 'shield',
  responses: 'dialogue',
  reviews: 'personCheck',
  roles: 'people',
  safeguards: 'lock',
  scenarios: 'match',
  sessions: 'calendar',
  specifications: 'question',
  tasks: 'checks',
};
