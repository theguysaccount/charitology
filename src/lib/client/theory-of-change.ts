// The model behind the Impact Measurement Toolkit: one theory-of-change draft,
// what is still missing from it, and its Markdown and JSON exports.
// No DOM here, so the same code is used by the page and by tests.

import { localDay, mdBlock, mdInline, mdTable } from './markdown';

export interface Indicator {
  what: string;
  how: string;
  when: string;
  baseline: string;
  target: string;
}

export interface Draft {
  id: string;
  name: string;
  problem: string;
  source: string;
  depth: number | null;
  activities: string;
  outputs: string;
  outcomeShort: string;
  outcomeMedium: string;
  outcomeLong: string;
  indicators: Indicator[];
  assumptions: string;
  feedbackMethod: string;
  feedbackFrequency: string;
  comparison: string;
  stopRule: string;
  reviewer: string;
  reviewDate: string;
  example: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepthLevel {
  level: number;
  name: string;
  verb: string;
}

export type TextKey = Exclude<keyof Draft, 'id' | 'depth' | 'indicators' | 'example' | 'createdAt' | 'updatedAt'>;

export const TEXT_KEYS: TextKey[] = [
  'name',
  'problem',
  'source',
  'activities',
  'outputs',
  'outcomeShort',
  'outcomeMedium',
  'outcomeLong',
  'assumptions',
  'feedbackMethod',
  'feedbackFrequency',
  'comparison',
  'stopRule',
  'reviewer',
  'reviewDate',
];

export const INDICATOR_KEYS: (keyof Indicator)[] = ['what', 'how', 'when', 'baseline', 'target'];

export const INDICATOR_LABELS: Record<keyof Indicator, string> = {
  what: 'What is measured',
  how: 'How',
  when: 'When',
  baseline: 'Baseline',
  target: 'Target',
};

export const LABELS: Record<TextKey, string> = {
  name: 'Program name',
  problem: 'Problem (symptom)',
  source: 'Source',
  activities: 'Activities',
  outputs: 'Outputs',
  outcomeShort: 'Short-term outcomes',
  outcomeMedium: 'Medium-term outcomes',
  outcomeLong: 'Long-term outcomes',
  assumptions: 'Assumptions',
  feedbackMethod: 'Feedback method',
  feedbackFrequency: 'How often',
  comparison: 'Comparison or counterfactual plan',
  stopRule: 'Stop rule',
  reviewer: 'Reviewer',
  reviewDate: 'Next review',
};

const MAX_TEXT = 5000;
const MAX_INDICATORS = 30;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyIndicator(): Indicator {
  return { what: '', how: '', when: '', baseline: '', target: '' };
}

export function emptyDraft(now = new Date()): Draft {
  const stamp = now.toISOString();
  return {
    id: newId(),
    name: '',
    problem: '',
    source: '',
    depth: null,
    activities: '',
    outputs: '',
    outcomeShort: '',
    outcomeMedium: '',
    outcomeLong: '',
    indicators: [emptyIndicator()],
    assumptions: '',
    feedbackMethod: '',
    feedbackFrequency: '',
    comparison: '',
    stopRule: '',
    reviewer: '',
    reviewDate: '',
    example: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : typeof v === 'number' ? String(v) : '');

/** Turn anything (stored data, an imported file) into a valid draft. Unknown fields are dropped. */
export function cleanDraft(raw: unknown, keepId = true): Draft {
  const base = emptyDraft();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const draft: Draft = { ...base };
  for (const key of TEXT_KEYS) draft[key] = text(r[key]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reviewDate)) draft.reviewDate = '';
  const depth = Number(r.depth);
  draft.depth = r.depth === null || r.depth === '' || r.depth === undefined || !Number.isInteger(depth) || depth < 0 || depth > 4 ? null : depth;
  const indicators = Array.isArray(r.indicators) ? r.indicators.slice(0, MAX_INDICATORS) : [];
  draft.indicators = indicators.map((row) => {
    const o = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    return { what: text(o.what), how: text(o.how), when: text(o.when), baseline: text(o.baseline), target: text(o.target) };
  });
  draft.example = r.example === true;
  if (keepId && typeof r.id === 'string' && r.id) draft.id = r.id.slice(0, 80);
  for (const key of ['createdAt', 'updatedAt'] as const) {
    const v = r[key];
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) draft[key] = v;
  }
  return draft;
}

const filled = (s: string) => s.trim().length > 0;
const usedIndicators = (d: Draft) => d.indicators.filter((i) => INDICATOR_KEYS.some((k) => filled(i[k])));

/** The parts of a theory of change, and whether each is written yet. */
export function parts(d: Draft): { label: string; done: boolean }[] {
  return [
    { label: 'Problem', done: filled(d.problem) },
    { label: 'Source', done: filled(d.source) },
    { label: 'Depth', done: d.depth !== null },
    { label: 'Activities', done: filled(d.activities) },
    { label: 'Outputs', done: filled(d.outputs) },
    { label: 'Short-term outcomes', done: filled(d.outcomeShort) },
    { label: 'Medium-term outcomes', done: filled(d.outcomeMedium) },
    { label: 'Long-term outcomes', done: filled(d.outcomeLong) },
    { label: 'Indicators', done: usedIndicators(d).some((i) => filled(i.what)) },
    { label: 'Assumptions', done: filled(d.assumptions) },
    { label: 'Feedback', done: filled(d.feedbackMethod) },
    { label: 'Comparison', done: filled(d.comparison) },
    { label: 'Stop rule', done: filled(d.stopRule) },
    { label: 'Reviewer', done: filled(d.reviewer) },
  ];
}

/** Plain-language prompts for what is missing. Prompts, not grades. */
export function gaps(d: Draft): string[] {
  const out: string[] = [];
  const outcomes = [d.outcomeShort, d.outcomeMedium, d.outcomeLong].some(filled);
  if (!filled(d.problem)) out.push('Name the problem as people experience it.');
  if (!filled(d.source)) out.push('Say what produces the problem. That is its source.');
  if (d.depth === null) out.push('Choose where on the depth scale your work acts.');
  if (filled(d.outputs) && !outcomes) out.push('Outputs count what you do. Add outcomes: what changes for people.');
  else if (!outcomes) out.push('Add outcomes: what should change for people, and by when.');
  const rows = usedIndicators(d);
  if (!rows.length) out.push('Add at least one indicator, so you will know whether an outcome happened.');
  else {
    const noBaseline = rows.filter((i) => !filled(i.baseline)).length;
    const noTarget = rows.filter((i) => !filled(i.target)).length;
    if (noBaseline) out.push(`${noBaseline} ${noBaseline === 1 ? 'indicator has' : 'indicators have'} no baseline. Without a starting point, change is hard to see.`);
    if (noTarget) out.push(`${noTarget} ${noTarget === 1 ? 'indicator has' : 'indicators have'} no target.`);
  }
  if (!filled(d.assumptions)) out.push('Write down what must be true for the chain to hold.');
  if (!filled(d.feedbackMethod)) out.push('Plan how the people you serve will tell you what is working.');
  else if (!filled(d.feedbackFrequency)) out.push('Say how often you will ask for feedback.');
  if (!filled(d.comparison)) out.push('Plan a comparison, so you can tell your effect from what would have happened anyway.');
  if (!filled(d.stopRule)) out.push('Decide in advance what result would make you change course.');
  if (!filled(d.reviewer)) out.push('Name someone to review this, ideally from outside the program.');
  return out;
}

export interface ExportContext {
  depthLevels: DepthLevel[];
  /** Absolute link back to the toolkit, included in the export. */
  toolUrl?: string;
  date?: Date;
}

function section(title: string, body: string): string {
  return `### ${title}\n\n${filled(body) ? mdBlock(body) : '_Not written yet._'}`;
}

export function toMarkdown(d: Draft, ctx: ExportContext): string {
  const when = localDay(ctx.date ?? new Date());
  const title = filled(d.name) ? mdInline(d.name) : 'Untitled program';
  const level = d.depth === null ? undefined : ctx.depthLevels.find((l) => l.level === d.depth);
  const rows = usedIndicators(d);
  const missing = gaps(d);
  const out: string[] = [];
  out.push(`# Theory of change: ${title}`);
  out.push(
    `Made with the Charitology Impact Measurement Toolkit${ctx.toolUrl ? ` (${ctx.toolUrl})` : ''} on ${when}.` +
      (isExample(d) ? '\n\n**This is a fictional example.** The program, the place and the numbers are made up.' : ''),
  );
  out.push('## The chain');
  out.push(section(LABELS.problem, d.problem));
  out.push(section(LABELS.source, d.source));
  out.push(`### Where the work acts\n\n${level ? `Depth ${level.level} of 4, ${level.name}: ${level.verb.toLowerCase()}.` : '_Not chosen yet._'}`);
  out.push(section(LABELS.activities, d.activities));
  out.push(section(LABELS.outputs, d.outputs));
  out.push(section(LABELS.outcomeShort, d.outcomeShort));
  out.push(section(LABELS.outcomeMedium, d.outcomeMedium));
  out.push(section(LABELS.outcomeLong, d.outcomeLong));
  out.push('## Indicators');
  out.push(
    rows.length
      ? mdTable(
          INDICATOR_KEYS.map((k) => INDICATOR_LABELS[k]),
          rows.map((i) => INDICATOR_KEYS.map((k) => i[k])),
        )
      : '_No indicators yet._',
  );
  out.push('## Guardrails');
  out.push(section(LABELS.assumptions, d.assumptions));
  const feedback = [filled(d.feedbackMethod) ? mdBlock(d.feedbackMethod) : '', filled(d.feedbackFrequency) ? `How often: ${mdInline(d.feedbackFrequency)}` : '']
    .filter(Boolean)
    .join('\n\n');
  out.push(`### Feedback from the people served\n\n${feedback || '_Not written yet._'}`);
  out.push(section(LABELS.comparison, d.comparison));
  out.push(section(LABELS.stopRule, d.stopRule));
  const review = [filled(d.reviewer) ? mdInline(d.reviewer) : '', filled(d.reviewDate) ? `Next review: ${d.reviewDate}` : ''].filter(Boolean).join('  \n');
  out.push(`### ${LABELS.reviewer}\n\n${review || '_Not written yet._'}`);
  if (missing.length) {
    out.push('## Still to write');
    out.push(missing.map((m) => `- ${m}`).join('\n'));
  }
  return out.join('\n\n') + '\n';
}

export const EXPORT_FORMAT = 'charitology-theory-of-change';

export function toJson(d: Draft, now = new Date()): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(), draft: d }, null, 2) + '\n';
}

/** Read a file made by toJson (or a bare draft object). Returns a fresh draft with a new id. */
export function parseImport(textContent: string): Draft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('That file doesn’t contain a theory of change.');
  const wrapper = parsed as Record<string, unknown>;
  const raw = wrapper.format === EXPORT_FORMAT ? wrapper.draft : parsed;
  if (!raw || typeof raw !== 'object') throw new Error('That file doesn’t contain a theory of change.');
  const known = [...TEXT_KEYS, 'depth', 'indicators'];
  if (!Object.keys(raw as object).some((k) => known.includes(k))) throw new Error('That file doesn’t contain a theory of change.');
  const draft = cleanDraft(raw, false);
  const now = new Date().toISOString();
  draft.createdAt = now;
  draft.updatedAt = now;
  if (!draft.indicators.length) draft.indicators = [emptyIndicator()];
  return draft;
}

export const EXAMPLE_NAME = 'Millbrook Reading Circles (fictional example)';

/** Still the fictional example? Renaming a copy of it makes it the viewer's own draft. */
export const isExample = (d: Draft) => d.example && d.name.trim() === EXAMPLE_NAME;

/** A clearly fictional program, to show how the parts fit together. */
export function exampleDraft(): Draft {
  const d = emptyDraft();
  return {
    ...d,
    example: true,
    name: EXAMPLE_NAME,
    problem:
      'Many children in Millbrook, a made-up town, reach age nine unable to read a short paragraph with ease. Teachers see it in class every day.',
    source:
      'Few children’s books at home, little reading practice outside school since the town library closed, and no help for parents who want to read with their children.',
    depth: 2,
    activities:
      'Weekly volunteer-led reading circles at the community center for children aged six to nine.\nA free lending shelf, so books go home with families.\nTwo evening workshops a term on simple ways for parents to read with their children.',
    outputs: 'Circles held each week, children attending, books lent and parents at the workshops.',
    outcomeShort: 'Children read at home at least three times a week.',
    outcomeMedium: 'Children who attend for a school year read more fluently than similar children who don’t.',
    outcomeLong: 'More Millbrook children read at grade level by age ten, and they keep reading for pleasure.',
    indicators: [
      {
        what: 'Reading at home',
        how: 'A short picture survey children fill in with a volunteer',
        when: 'Start and end of each term',
        baseline: 'Measured in the first survey',
        target: 'Three times a week',
      },
      {
        what: 'Reading fluency (words read correctly in one minute)',
        how: 'A one-minute reading check by a trained volunteer',
        when: 'September and June',
        baseline: 'Measured in the first September',
        target: 'Larger gain than the waiting-list group',
      },
      {
        what: 'Books lent',
        how: 'Lending log',
        when: 'Monthly',
        baseline: 'None (new shelf)',
        target: '200 a term',
      },
    ],
    assumptions:
      'Parents can bring children to the center after school.\nVolunteers stay for at least a school year.\nThe reading check is fair to children who speak another language at home.',
    feedbackMethod: 'A three-question picture survey for children, and a ten-minute conversation with parents at pick-up.',
    feedbackFrequency: 'Every term',
    comparison:
      'The circles have more applicants than places, so places are given by lottery. Children on the waiting list are the comparison group, and they get a place the next year.',
    stopRule:
      'If, after one school year, attending children’s fluency gains are no larger than the waiting list’s, redesign the sessions with teachers. If a second year shows the same, stop the circles and put the money into the parent workshops.',
    reviewer: 'A reading specialist from outside the program, with the parents’ advisory group',
    reviewDate: '2027-06-30',
  };
}
