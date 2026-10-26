// The words on a Gift Giving card, shared by the HTML preview and the PNG.
// The "why this gift" reasons come from the Giver's Checklist
// (src/data/checklist.json), one short sentence per theme.

export type CardStyle = 'classic' | 'modern' | 'seal';

export const STYLES: Record<CardStyle, string> = {
  classic: 'Classic',
  modern: 'Modern',
  seal: 'Seal',
};

export const MAX_REASONS = 3;

/** One sentence per Giver's Checklist theme, keyed by its id. */
export const REASONS: Record<string, string> = {
  depth: 'It was chosen knowing where it acts, from today’s need to its source.',
  counterfactual: 'It pays for work that might not happen without it.',
  evidence: 'There is good evidence that this kind of work changes lives.',
  feedback: 'The people running it check whether it is working.',
  voice: 'The people it serves help decide what it does.',
  cost: 'It does a lot of good with every dollar.',
  strings: 'It comes with no strings, so it can go where it’s needed most.',
  durability: 'Its good should still matter ten years from now.',
  story: 'It answers the size of a need, not just the loudest story.',
  neglect: 'It goes where few other dollars go.',
};

export interface CardState {
  to: string;
  from: string;
  charity: string;
  does: string;
  message: string;
  reasons: string[];
  style: CardStyle;
}

export const LIMITS = { to: 60, from: 60, charity: 80, does: 220, message: 420 };

export function emptyCard(style: CardStyle = 'classic'): CardState {
  return { to: '', from: '', charity: '', does: '', message: '', reasons: [], style };
}

export function cleanCard(raw: unknown): CardState {
  if (!raw || typeof raw !== 'object') return emptyCard();
  const r = raw as Record<string, unknown>;
  const str = (k: keyof typeof LIMITS) => (typeof r[k] === 'string' ? (r[k] as string).slice(0, LIMITS[k]) : '');
  const style = typeof r.style === 'string' && r.style in STYLES ? (r.style as CardStyle) : 'classic';
  const reasons = Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string' && x in REASONS).slice(0, MAX_REASONS) : [];
  return { to: str('to'), from: str('from'), charity: str('charity'), does: str('does'), message: str('message'), reasons, style };
}

export interface CardText {
  eyebrow: string;
  to: string;
  line: string;
  does: string;
  messageLabel: string;
  message: string;
  reasons: string[];
}

export function cardText(s: CardState): CardText {
  const from = s.from.trim();
  const charity = s.charity.trim();
  let line = 'A gift to charity was made in your name.';
  if (from && charity) line = `${from} gave to ${charity} in your name.`;
  else if (charity) line = `A gift to ${charity} was made in your name.`;
  else if (from) line = `${from} made a gift to charity in your name.`;
  return {
    eyebrow: s.style === 'seal' ? 'In honor of' : 'A gift in your name',
    to: s.to.trim() || 'Someone special',
    line,
    does: s.does.trim(),
    messageLabel: from ? `A note from ${from}` : 'A note',
    message: s.message.trim(),
    reasons: s.reasons.filter((id) => id in REASONS).slice(0, MAX_REASONS).map((id) => REASONS[id]),
  };
}
