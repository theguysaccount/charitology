// The Legacy Planner's worksheet model and its sample bequest wording.
// The wording follows the common patterns charities publish for donors
// (specific, percentage, residuary and contingent gifts; unrestricted or
// restricted use). It is sample language to discuss with an estate
// attorney, never legal advice, and the tool labels it that way.

export type BequestType = 'specific' | 'percent' | 'residue' | 'contingent';

export interface Bequest {
  id: string;
  charity: string;
  legal: string;
  ein: string;
  type: BequestType;
  amount: string;
  percent: string;
  condition: string;
  purpose: 'unrestricted' | 'restricted';
  purposeText: string;
}

export interface LegacyPlan {
  name: string;
  place: string;
  gifts: Bequest[];
  flexible: boolean;
  notes: string;
  savedAt?: string;
}

export const TYPES: Record<BequestType, { label: string; hint: string }> = {
  specific: {
    label: 'A specific amount',
    hint: 'A fixed sum written into your will, such as $5,000.',
  },
  percent: {
    label: 'A percentage of your estate',
    hint: 'A share of everything you leave, such as 10 percent, so the gift grows or shrinks with your estate.',
  },
  residue: {
    label: 'A share of the residue',
    hint: 'All or part of what is left after your debts, taxes, expenses and other gifts are paid.',
  },
  contingent: {
    label: 'A contingent (backup) gift',
    hint: 'Takes effect only if a condition is met, such as when the people you named don’t survive you.',
  },
};

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under1000(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`);
  return parts.join(' ');
}

/** A whole number in words, as wills often spell out amounts: 10250 → "ten thousand two hundred fifty". */
export function words(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) return String(n);
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let rest = n;
  for (const [value, name] of [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ] as const) {
    if (rest >= value) {
      parts.push(`${under1000(Math.floor(rest / value))} ${name}`);
      rest %= value;
    }
  }
  if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}

/** Digits of an EIN as 12-3456789, or '' when it isn't nine digits. */
export function formatEin(text: string): string {
  const digits = text.replace(/\D/g, '');
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : '';
}

export const einProblem = (text: string): string =>
  text.trim() && !formatEin(text) ? 'An EIN has nine digits, like 12-3456789.' : '';

/** A positive number from a typed amount or percentage, or NaN. */
export function positive(text: string): number {
  const n = Number(String(text).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function amountText(text: string): string {
  const n = positive(text);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${words(rounded)} dollars (${USD.format(rounded)})` : USD.format(rounded);
}

export function percentText(text: string): string {
  const n = positive(text);
  if (!Number.isFinite(n) || n > 100) return '';
  return Number.isInteger(n) ? `${words(n)} percent (${n}%)` : `${n} percent (${n}%)`;
}

/** The short name a sentence refers back to. */
export const shortName = (g: Bequest): string => g.charity.trim() || g.legal.trim() || 'the organization';

/** The legal identification of the charity, with placeholders for what's missing. */
export function identify(g: Bequest): string {
  const legal = g.legal.trim() || g.charity.trim() || '[the charity’s full legal name]';
  const ein = formatEin(g.ein);
  return ein ? `${legal} (federal tax identification number ${ein})` : `${legal} (federal tax identification number [EIN])`;
}

/** What is given, in words, with placeholders for missing values. */
export function giftText(g: Bequest): string {
  switch (g.type) {
    case 'specific':
      return `the sum of ${amountText(g.amount) || '[amount]'}`;
    case 'percent':
      return `${percentText(g.percent) || '[percentage]'} of my estate`;
    case 'residue':
    case 'contingent': {
      const n = positive(g.percent);
      if (n === 100) return 'all of the residue of my estate';
      return `${percentText(g.percent) || '[percentage]'} of the residue of my estate`;
    }
  }
}

/** The condition of a contingent gift, written to follow "If". */
export function conditionText(g: Bequest): string {
  const c = g.condition.trim().replace(/^if\s+/i, '').replace(/[.,;:\s]+$/, '');
  return c || 'none of the beneficiaries named above survives me';
}

/** A short, plain description of the gift for the summary table. */
export function giftSummary(g: Bequest): string {
  const usd = positive(g.amount);
  const p = positive(g.percent);
  switch (g.type) {
    case 'specific':
      return Number.isFinite(usd) ? `${USD.format(usd)}, a specific amount` : 'A specific amount (not set yet)';
    case 'percent':
      return Number.isFinite(p) ? `${p}% of the estate` : 'A percentage of the estate (not set yet)';
    case 'residue':
      return Number.isFinite(p) ? `${p}% of the residue` : 'A share of the residue (not set yet)';
    case 'contingent':
      return `${Number.isFinite(p) ? `${p}% of the residue` : 'A share of the residue'}, only if ${conditionText(g)}`;
  }
}

export function bequestSentence(g: Bequest): string {
  const lead = g.type === 'contingent' ? `If ${conditionText(g)}, I give` : 'I give';
  const use =
    g.purpose === 'restricted'
      ? `, to be used for ${g.purposeText.trim().replace(/[.\s]+$/, '') || '[the purpose]'}. If ${shortName(g)} determines that this purpose can no longer be carried out, or has become impractical, it may use this gift for the purpose it judges closest to my intent.`
      : ', to be used for its general charitable purposes.';
  return `${lead} ${giftText(g)} to ${identify(g)}${use}`;
}

export function flexibilitySentence(g: Bequest): string {
  const name = shortName(g);
  return `If at my death ${name} no longer exists, has merged with another organization, or is no longer a charitable organization, I give this gift instead to its successor organization or, if there is none, to a charitable organization with similar purposes chosen by my executor.`;
}

export const SAMPLE_LABEL = 'Sample language to discuss with your estate attorney, not legal advice';

/** Every gift's sample wording as plain text, for copying. */
export function sampleText(plan: LegacyPlan): string {
  const gifts = plan.gifts.filter((g) => g.charity.trim() || g.legal.trim());
  const body = gifts.map((g, i) => {
    const parts = [bequestSentence(g)];
    if (plan.flexible) parts.push(flexibilitySentence(g));
    return `${i + 1}. ${parts.join(' ')}`;
  });
  return [`${SAMPLE_LABEL}.`, '', ...body].join('\n');
}

/** Problems worth fixing before printing: missing names and shares that can't all be paid. */
export function planChecks(plan: LegacyPlan): string[] {
  const out: string[] = [];
  plan.gifts.forEach((g, i) => {
    const n = i + 1;
    if (!g.charity.trim() && !g.legal.trim()) out.push(`Gift ${n} needs the charity’s name.`);
    if (einProblem(g.ein)) out.push(`Gift ${n}: ${einProblem(g.ein)}`);
    if (g.type === 'specific' && !Number.isFinite(positive(g.amount))) out.push(`Gift ${n} needs an amount.`);
    if (g.type !== 'specific') {
      const p = positive(g.percent);
      if (!Number.isFinite(p)) out.push(`Gift ${n} needs a percentage.`);
      else if (p > 100) out.push(`Gift ${n} is more than 100 percent.`);
    }
    if (g.purpose === 'restricted' && !g.purposeText.trim()) out.push(`Gift ${n} is restricted but has no purpose written in.`);
  });
  const total = (gifts: Bequest[]) =>
    Math.round(gifts.reduce((s, g) => s + (Number.isFinite(positive(g.percent)) ? positive(g.percent) : 0), 0) * 100) / 100;
  const percent = total(plan.gifts.filter((g) => g.type === 'percent'));
  const residue = total(plan.gifts.filter((g) => g.type === 'residue'));
  if (percent > 100) out.push(`Your percentage gifts add up to ${percent}% of the estate, more than 100%.`);
  if (residue > 100) out.push(`Your shares of the residue add up to ${residue}%, more than 100%.`);
  // Backup gifts only add up when they share a condition.
  const conditions = new Map<string, Bequest[]>();
  for (const g of plan.gifts.filter((x) => x.type === 'contingent')) {
    const key = conditionText(g).toLowerCase();
    conditions.set(key, [...(conditions.get(key) ?? []), g]);
  }
  for (const [condition, gifts] of conditions) {
    const t = total(gifts);
    if (t > 100) out.push(`Your backup gifts for “if ${condition}” add up to ${t}% of the residue, more than 100%.`);
  }
  return out;
}
