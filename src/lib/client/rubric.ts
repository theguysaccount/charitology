// The Grant Evaluator's rubric: nine dimensions, each scored 0 to 4 or left
// unknown. The guides are editorial judgments, published here so anyone can
// check and challenge them with a pull request.

import depthScale from '../../data/depth.json';

export type Score = 0 | 1 | 2 | 3 | 4 | null;

export interface Dimension {
  id: string;
  name: string;
  /** Column heading in the comparison table. */
  short: string;
  question: string;
  /** One line per score, 0 to 4. */
  guides: string[];
  note?: string;
  link?: { href: string; text: string };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const DIMENSIONS: Dimension[] = [
  {
    id: 'depth',
    name: 'Source depth',
    short: 'Depth',
    question: 'Where on the chain from symptom to source does the work act?',
    guides: depthScale.map((d) => `${d.name}: ${lowerFirst(d.verb)}.`),
    note: 'Depth describes where work acts. It isn’t a grade, and every level is needed. Weight it by how far upstream you want this grant to reach.',
    link: { href: '/record/encyclopedia/symptoms-and-sources/', text: 'Symptoms and sources' },
  },
  {
    id: 'evidence',
    name: 'Evidence',
    short: 'Evidence',
    question: 'How well do we know that this kind of work does what the proposal claims?',
    guides: [
      'No evidence offered, or the evidence points the other way.',
      'Stories, testimonials or counts of activities only.',
      'The applicant’s own outcome data, with no comparison group.',
      'At least one rigorous study of this or a very similar program.',
      'Several rigorous studies agree, including in a setting like this one.',
    ],
  },
  {
    id: 'counterfactual',
    name: 'Counterfactual',
    short: 'Counterfactual',
    question: 'Would this happen anyway without this grant?',
    guides: [
      'It would clearly happen anyway, or it is already funded.',
      'Other funders would probably step in.',
      'It would probably happen, but later or smaller.',
      'It probably wouldn’t happen at this scale without this grant.',
      'There is clear evidence it won’t happen without this grant.',
    ],
    link: { href: '/open-problems/the-counterfactual-problem/', text: 'Open Problem 4, the Counterfactual Problem' },
  },
  {
    id: 'feedback',
    name: 'Feedback and learning',
    short: 'Feedback',
    question: 'Does the applicant measure what changes, and change course when it learns something?',
    guides: [
      'No plan to measure what changes.',
      'Counts activities, not what changed.',
      'Measures some outcomes, but results don’t clearly shape the plan.',
      'Measures outcomes and has changed course because of them.',
      'Learns in public, including publishing what didn’t work.',
    ],
  },
  {
    id: 'voice',
    name: 'Voice of the people served',
    short: 'Voice',
    question: 'Do the people the work serves shape what it does?',
    guides: [
      'They weren’t asked.',
      'They were asked once, for example in a needs survey.',
      'They are asked for feedback regularly, and some of it is acted on.',
      'They help design the work or sit where decisions are made.',
      'They lead the work or control key decisions, including money.',
    ],
  },
  {
    id: 'cost',
    name: 'Cost-effectiveness',
    short: 'Cost',
    question: 'How much good per dollar, compared with other ways to reach the same goal?',
    guides: [
      'Likely far more costly than other ways to reach the same goal.',
      'More costly than the alternatives you know of.',
      'About in line with the alternatives.',
      'Better than most alternatives, on a credible estimate.',
      'Among the best known ways to reach the goal, on an estimate others have checked.',
    ],
    note: 'If nobody has estimated it, leave it unknown rather than scoring 0.',
    link: { href: '/tools/cost-effectiveness-model-kit/', text: 'Make an estimate with the Cost-Effectiveness Model Kit' },
  },
  {
    id: 'durability',
    name: 'Durability',
    short: 'Durability',
    question: 'How long do the results last after the money stops?',
    guides: [
      'The benefit stops when the grant stops.',
      'It lasts months after the grant ends.',
      'It lasts a few years.',
      'It lasts a generation, or someone else, such as a government, keeps it going.',
      'It is permanent, or keeps going on its own without more funding.',
    ],
  },
  {
    id: 'team',
    name: 'Team and track record',
    short: 'Team',
    question: 'Can this team do what it proposes?',
    guides: [
      'No relevant experience and no plan to get it.',
      'Some relevant experience, but no record of similar work.',
      'Has done similar work at a smaller scale.',
      'Has done similar work at this scale.',
      'Has done similar work at this scale more than once, with results checked by others.',
    ],
  },
  {
    id: 'harm',
    name: 'Risk of harm',
    short: 'Safety',
    question: 'Could the work make things worse, and is that risk managed? Higher scores mean safer.',
    guides: [
      'Serious harm is plausible, with no plan to manage it.',
      'Serious harm is plausible, and the plan to manage it is weak.',
      'Some risk of harm, with a reasonable plan to watch for it.',
      'Low risk of harm, and it is monitored.',
      'Very low risk, with independent safeguards and a way for people to raise concerns.',
    ],
    note: 'Harm can come from crowding out local markets or services, creating dependency or delaying reform.',
    link: { href: '/open-problems/when-charity-harms/', text: 'Open Problem 20, When Charity Harms' },
  },
];

export const UNKNOWN_GUIDE = 'Unknown: not enough information to score yet.';
export const DEFAULT_WEIGHT = 5;
export const MAX_WEIGHT = 10;

export type Scores = Record<string, Score>;
export type Weights = Record<string, number>;
export type Notes = Record<string, string>;

export interface Proposal {
  id: string;
  name: string;
  savedAt?: string;
  scores: Scores;
  notes: Notes;
}

export const equalWeights = (): Weights => Object.fromEntries(DIMENSIONS.map((d) => [d.id, DEFAULT_WEIGHT]));

export function guideFor(d: Dimension, score: Score): string {
  return score == null ? UNKNOWN_GUIDE : `${score}: ${d.guides[score]}`;
}

export interface Range {
  /** Unknowns counted as 0. */
  low: number;
  /** Unknowns counted as 4. */
  high: number;
  known: number;
  unknown: Dimension[];
  /** Share of the total weight on dimensions that have a score. */
  knownWeight: number;
}

/**
 * The weighted score as a missing-data range: the low end counts every
 * unknown as 0 and the high end counts it as 4. Not a confidence interval.
 * Returns null when every weight is zero.
 */
export function weightedRange(scores: Scores, weights: Weights): Range | null {
  let total = 0;
  let low = 0;
  let high = 0;
  let knownW = 0;
  let known = 0;
  const unknown: Dimension[] = [];
  for (const d of DIMENSIONS) {
    const w = Math.max(0, Number(weights[d.id] ?? DEFAULT_WEIGHT) || 0);
    const s = scores[d.id] ?? null;
    total += w;
    if (s == null) {
      high += w * 4;
      unknown.push(d);
    } else {
      low += w * s;
      high += w * s;
      knownW += w;
      known++;
    }
  }
  if (!(total > 0)) return null;
  return { low: low / total, high: high / total, known, unknown, knownWeight: knownW / total };
}

export const fmtScore = (n: number) => n.toFixed(1);

export function rangeText(r: Range | null): string {
  if (!r) return 'No result: every weight is zero.';
  return r.high === r.low ? `${fmtScore(r.low)} out of 4` : `${fmtScore(r.low)} to ${fmtScore(r.high)} out of 4`;
}

export function weightShares(weights: Weights): Record<string, number> {
  const total = DIMENSIONS.reduce((sum, d) => sum + Math.max(0, weights[d.id] ?? DEFAULT_WEIGHT), 0);
  return Object.fromEntries(DIMENSIONS.map((d) => [d.id, total > 0 ? Math.max(0, weights[d.id] ?? DEFAULT_WEIGHT) / total : 0]));
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** A review memo in Markdown. `abs` turns a root-relative path into a full link. */
export function toMemo(p: Proposal, weights: Weights, abs: (path: string) => string, date: string): string {
  const r = weightedRange(p.scores, weights);
  const shares = weightShares(weights);
  const name = p.name.trim() || 'Untitled proposal';
  const lines: string[] = [`# Grant review: ${name}`, '', `${date} · Charitology Grant Evaluator`, '', '## Result', ''];
  lines.push(`**Weighted score: ${rangeText(r)}.**`, '');
  if (r && r.high !== r.low) {
    const n = r.unknown.filter((d) => shares[d.id] > 0).length;
    lines.push(
      `This is a missing-data range, not a confidence interval. The low end counts the ${n} unknown ${n === 1 ? 'dimension' : 'dimensions'} as 0 and the high end counts ${n === 1 ? 'it' : 'them'} as 4. Scoring an unknown narrows the range.`,
      '',
    );
  }
  lines.push('| Dimension | Weight | Score | Guide |', '| --- | --- | --- | --- |');
  for (const d of DIMENSIONS) {
    const s = p.scores[d.id] ?? null;
    lines.push(`| ${d.name} | ${pct(shares[d.id])} | ${s == null ? 'Unknown' : s} | ${s == null ? '' : d.guides[s]} |`);
  }
  lines.push('');
  if (r && r.unknown.length) {
    lines.push('## Still unknown', '');
    for (const d of r.unknown) lines.push(`- **${d.name}:** ${d.question}${shares[d.id] > 0 ? '' : ' (weight 0, so not counted)'}`);
    lines.push('');
  }
  const noted = DIMENSIONS.filter((d) => (p.notes[d.id] ?? '').trim());
  if (noted.length) {
    lines.push('## Notes', '');
    for (const d of noted) lines.push(`### ${d.name}`, '', p.notes[d.id].trim(), '');
  }
  lines.push(
    '## Before you set conditions',
    '',
    `Tying a grant to specific line items and short timelines can keep an organization from adapting, investing in itself or going after root causes. If this review gives you confidence in the team, consider flexible, multi-year support, and hold it accountable for results rather than line items. See the Restriction Reflex: ${abs('/diagnosis/restriction-reflex/')}`,
    '',
    '---',
    '',
    'Scores and guides are judgments, not measurements. Made in the browser with the Charitology Grant Evaluator; nothing was sent anywhere.',
    '',
  );
  return lines.join('\n');
}
