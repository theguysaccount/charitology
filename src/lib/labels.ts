import depthScale from '../data/depth.json';

export const STATUS = {
  live: { label: 'Live', glyph: '●', note: 'Works on this site today.' },
  seeded: { label: 'Seeded', glyph: '◐', note: 'First entries are published. It grows as people contribute.' },
  designed: { label: 'Designed', glyph: '○', note: 'The charter is written. It needs builders.' },
  partners: { label: 'Needs partners', glyph: '◇', note: 'Needs funding, licensing or institutions before it can run.' },
} as const;

export type Status = keyof typeof STATUS;

export const EVIDENCE = {
  established: { label: 'Established', glyph: '■', note: 'Strong published evidence from several independent sources.' },
  documented: { label: 'Documented', glyph: '▣', note: 'Reported by credible sources. How big the effect is remains less certain.' },
  debated: { label: 'Debated', glyph: '◩', note: 'Credible people disagree. Both sides are shown.' },
  hypothesis: { label: 'Hypothesis', glyph: '□', note: 'Charitology’s working claim. It has not been tested yet, and testing it is the work.' },
} as const;

export type Evidence = keyof typeof EVIDENCE;

export const GRADE = {
  strong: { label: 'Strong evidence', note: 'Several rigorous studies agree.' },
  moderate: { label: 'Moderate evidence', note: 'Some rigorous studies, or strong studies of a related program.' },
  mixed: { label: 'Mixed evidence', note: 'Rigorous studies disagree.' },
  weak: { label: 'Weak evidence', note: 'Plausible, but rigorous studies are scarce.' },
  unknown: { label: 'Unknown', note: 'Nobody has measured it well yet.' },
} as const;

export const VERDICT = {
  false: 'False',
  misleading: 'Misleading',
  'half-true': 'Half true',
} as const;

export const CASE_KIND = {
  success: 'What worked',
  failure: 'What failed',
  mixed: 'Mixed result',
} as const;

/** Where each condition sits in the charity system. */
export const NODES = {
  givers: { label: 'Givers', note: 'The people and institutions who give.' },
  signals: { label: 'Signals', note: 'What givers see when they decide.' },
  channels: { label: 'Channels', note: 'Where money is held and routed.' },
  work: { label: 'The work', note: 'What the money does, from relief to source.' },
  outcomes: { label: 'Outcomes', note: 'What changes in the world.' },
  feedback: { label: 'Feedback', note: 'How results travel back to givers.' },
  field: { label: 'The field', note: 'The knowledge and people that should steer the whole system.' },
} as const;

/** The six sources from Humanity's Checklist (humanityschecklist.org). */
export const UPSTREAM = {
  story: { label: 'Story', title: 'Rewrite the story we tell ourselves' },
  coordination: { label: 'Coordination', title: 'Connect everyone to the people who share their vision' },
  vision: { label: 'Vision', title: 'Let humanity preview its future' },
  attention: { label: 'Attention', title: 'Turn the doomscroll into a bloomscroll' },
  status: { label: 'Status', title: 'Make giving the status symbol' },
  gatekeepers: { label: 'Gatekeepers', title: 'Open the internet’s gates' },
} as const;

export const DEPTH = depthScale;

export function depthName(level: number): string {
  return DEPTH.find((d) => d.level === level)?.name ?? 'Unknown';
}
