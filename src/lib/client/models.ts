// The arithmetic behind the Impact Calculator and the Cost-Effectiveness Model Kit.
// Pure functions only, so the math can be checked without a browser.

import { mulberry32, quantile, triangular } from './montecarlo';

/**
 * What a gift could buy at a published cost per outcome. Only the share that
 * would not have happened anyway counts. The fewest outcomes come from the
 * high cost, the most from the low cost.
 */
export function impactRange(amount: number, anywayShare: number, costLow: number, costHigh: number) {
  const counted = amount * (1 - anywayShare);
  const cheap = Math.min(costLow, costHigh);
  const dear = Math.max(costLow, costHigh);
  return {
    counted,
    fewest: counted / dear,
    most: counted / cheap,
    /** The gift it takes for one whole outcome, at each end of the cost range. */
    perOutcomeLow: cheap / (1 - anywayShare),
    perOutcomeHigh: dear / (1 - anywayShare),
  };
}

/** The six model inputs that carry a low, likely and high value, in draw order. */
export const RANGED = ['cost', 'people', 'works', 'effect', 'years', 'anyway'] as const;
export type RangedKey = (typeof RANGED)[number];
export type Triple = [low: number, likely: number, high: number];

/**
 * A cost-effectiveness model. `works` and `anyway` are shares from 0 to 1,
 * `discount` is an annual rate from 0 to 1.
 */
export type ModelInputs = Record<RangedKey, Triple> & { discount: number };
export type Point = Record<RangedKey, number>;

/**
 * Years of effect after discounting. The first year counts in full and each
 * later year counts 1 / (1 + rate) as much as the one before. Fractional years
 * follow the same curve.
 */
export function discountedYears(years: number, rate: number): number {
  if (!(years > 0)) return 0;
  if (!(rate > 0)) return years;
  const v = 1 / (1 + rate);
  return (1 - Math.pow(v, years)) / (1 - v);
}

/** Outcomes the program can claim: people × chance it works × effect × discounted years × the share that is not "anyway". */
export function outcomesAt(p: Point, discount: number): number {
  return p.people * p.works * p.effect * discountedYears(p.years, discount) * (1 - p.anyway);
}

/** Cost per outcome at one set of input values. Infinite when there is no outcome to divide by. */
export function costPerOutcomeAt(p: Point, discount: number): number {
  const out = outcomesAt(p, discount);
  return out > 0 ? p.cost / out : Infinity;
}

export const likelyPoint = (m: ModelInputs): Point =>
  Object.fromEntries(RANGED.map((k) => [k, m[k][1]])) as Point;

export interface Summary {
  median: number;
  p5: number;
  p95: number;
}

export interface ModelRun {
  draws: number;
  seed: number;
  /** Cost per outcome for every draw, ascending. Draws with no outcome are Infinity and sort last. */
  costs: Float64Array;
  /** Total outcomes for every draw, ascending. */
  outcomes: Float64Array;
  cost: Summary;
  outcome: Summary;
  /** Draws that produced no outcome at all. */
  none: number;
}

const summarize = (sorted: Float64Array): Summary => ({
  median: quantile(sorted, 0.5),
  p5: quantile(sorted, 0.05),
  p95: quantile(sorted, 0.95),
});

/**
 * Monte Carlo: draw every ranged input from its triangular distribution,
 * independently, `draws` times, using a seeded generator so runs repeat exactly.
 */
export function runModel(m: ModelInputs, draws = 5000, seed = 1): ModelRun {
  const rand = mulberry32(seed);
  const costs = new Float64Array(draws);
  const outcomes = new Float64Array(draws);
  const p = {} as Point;
  let none = 0;
  for (let i = 0; i < draws; i++) {
    for (const k of RANGED) {
      const [low, likely, high] = m[k];
      p[k] = triangular(rand(), low, likely, high);
    }
    const out = outcomesAt(p, m.discount);
    outcomes[i] = out;
    if (out > 0) costs[i] = p.cost / out;
    else {
      costs[i] = Infinity;
      none++;
    }
  }
  costs.sort();
  outcomes.sort();
  return { draws, seed, costs, outcomes, cost: summarize(costs), outcome: summarize(outcomes), none };
}

export interface SensitivityRow {
  key: RangedKey;
  /** Cost per outcome with this input at its low value and every other input at likely. */
  atLow: number;
  /** The same with this input at its high value. */
  atHigh: number;
  lo: number;
  hi: number;
  swing: number;
}

/** One-at-a-time sensitivity: vary each input from low to high with the rest at likely. Biggest swing first. */
export function sensitivity(m: ModelInputs): { base: number; rows: SensitivityRow[] } {
  const likely = likelyPoint(m);
  const base = costPerOutcomeAt(likely, m.discount);
  const rows = RANGED.map((key) => {
    const atLow = costPerOutcomeAt({ ...likely, [key]: m[key][0] }, m.discount);
    const atHigh = costPerOutcomeAt({ ...likely, [key]: m[key][2] }, m.discount);
    const lo = Math.min(atLow, atHigh);
    const hi = Math.max(atLow, atHigh);
    return { key, atLow, atHigh, lo, hi, swing: hi === lo ? 0 : hi - lo };
  });
  rows.sort((a, b) => b.swing - a.swing || RANGED.indexOf(a.key) - RANGED.indexOf(b.key));
  return { base, rows };
}

// ---------- Formatting ----------

const fmt = (digits: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits, ...opts });

/** Decimals for about two significant digits below 1, and fewer as numbers grow: 0.18, 3.33, 33.3, 333. */
function digitsFor(abs: number): number {
  if (abs >= 100) return 0;
  if (abs >= 10) return 1;
  if (abs >= 1) return 2;
  return Math.min(8, 1 - Math.floor(Math.log10(abs)));
}

/** A count or ratio with sensible precision: 0.18, 3.33, 33.3, 3,333. */
export function sig(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? 'unlimited' : '—';
  if (n === 0) return '0';
  return fmt(digitsFor(Math.abs(n))).format(n);
}

/** Dollars with sensible precision: $0.012, $14.56, $3,000. */
export function dollars(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? 'no outcome' : '—';
  const abs = Math.abs(n);
  const digits = abs === 0 || abs >= 100 ? 0 : abs >= 1 ? 2 : Math.min(8, 1 - Math.floor(Math.log10(abs)));
  const min = abs >= 1 && abs < 100 ? 2 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: min,
    maximumFractionDigits: Math.max(min, digits),
  }).format(n);
}

/** Decimal places in a round step such as 2.5 (1) or 0.05 (2). */
function decimalsOf(step: number): number {
  const s = step.toFixed(10).replace(/0+$/, '');
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(8, s.length - dot - 1);
}

/** Short dollar labels for chart axes, with as many decimals as the tick step needs: $2.5, $750, $1.25K. */
export function dollarsTick(n: number, step: number): string {
  if (step >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  }
  const decimals = decimalsOf(step);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
