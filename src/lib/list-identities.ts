// Editorial marks describe what an item is. IDs are shared by links and the
// items they point to, so filtering or reordering a list never changes its mark.
import type { SymbolName } from './site-identities';

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

export const hazardSymbols: Record<string, SymbolName> = {
  wildfire: 'flame', earthquake: 'quake', flood: 'flood', storm: 'cloud',
  drought: 'drought', other: 'alert', unclassified: 'question',
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

export const providerSymbols: Record<string, SymbolName> = {
  civicrm: 'person', 'erpnext-frappe': 'table', tendenci: 'badge', 'odoo-oca': 'stack',
  openproject: 'board', kobotoolbox: 'pin', oscar: 'heart', caselight: 'notes',
  givebutter: 'gift', 'salesforce-nonprofit': 'people',
};

export const teachingSymbols: Record<string, SymbolName> = {
  'start-here': 'compass', 'facilitator-guide': 'people', 'student-worksheet': 'notes',
  'university-syllabus': 'columns', 'club-starter': 'flag', 'school-pack': 'school',
  'complete-pack': 'packet',
};

// Fragment destinations are shared across the site, including search and
// Markdown links. Registry and report pages still have their own page mark.
export const fragmentSymbols = {
  '/method/': methodSymbols,
  '/record/cause-atlas/': causeSymbols,
  '/for-charities/start/': starterSymbols,
} as const;
