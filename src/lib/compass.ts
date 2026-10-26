// Scoring shared by the Values Compass and the Portfolio Builder.
// Pure functions over src/data/causes.json and src/data/frameworks.json,
// so the same math runs at build time and in the browser.

import causesData from '../data/causes.json';
import frameworksData from '../data/frameworks.json';

export const CAUSES = causesData.causes;
export const FRAMEWORKS = frameworksData.frameworks;
export const DIMS = ['horizon', 'circle', 'reach', 'certainty', 'depth'] as const;

export type Dim = (typeof DIMS)[number];
export type Cause = (typeof CAUSES)[number];
export type Weights = Record<string, number>;
export type Position = Record<Dim, number>;

const priority = (frameworkId: string, causeId: string): number => {
  const f = FRAMEWORKS.find((x) => x.id === frameworkId);
  return ((f?.priorities ?? {}) as Record<string, number>)[causeId] ?? 0;
};

/** Credences that sum to 1. All-zero input means "no idea", so every framework gets an equal share. */
export function normalize(weights: Weights): Weights {
  const ids = FRAMEWORKS.map((f) => f.id);
  const total = ids.reduce((s, id) => s + Math.max(0, weights[id] ?? 0), 0);
  return Object.fromEntries(ids.map((id) => [id, total > 0 ? Math.max(0, weights[id] ?? 0) / total : 1 / ids.length]));
}

/** How highly the weighted frameworks rank each cause, 0–1. */
export function lensScore(weights: Weights, causeId: string): number {
  const w = normalize(weights);
  return FRAMEWORKS.reduce((s, f) => s + w[f.id] * (priority(f.id, causeId) / 5), 0);
}

/** How close a cause sits to the giver's answers on the five dimensions, 0–1. */
export function fit(position: Position, cause: Cause): number {
  const dims = cause.dims as Position;
  return 1 - DIMS.reduce((s, d) => s + Math.abs(position[d] - dims[d]), 0) / DIMS.length;
}

export interface Match {
  cause: Cause;
  score: number;
  lens: number;
  fit: number;
  topFramework: string;
  closeDims: Dim[];
}

export function matchCauses(weights: Weights, position: Position): Match[] {
  const w = normalize(weights);
  return CAUSES.map((cause) => {
    const lens = lensScore(w, cause.id);
    const f = fit(position, cause);
    const top = [...FRAMEWORKS].sort((a, b) => w[b.id] * priority(b.id, cause.id) - w[a.id] * priority(a.id, cause.id))[0];
    const dims = cause.dims as Position;
    const closeDims = DIMS.filter((d) => Math.abs(position[d] - dims[d]) <= 0.2);
    return { cause, score: 0.65 * lens + 0.35 * f, lens, fit: f, topFramework: top.id, closeDims };
  }).sort((a, b) => b.score - a.score);
}

/** Causes the giver's least-weighted frameworks rank highly: what the other lenses see. */
export function blindSpots(weights: Weights, exclude: string[], count = 3): { cause: Cause; frameworks: string[] }[] {
  const w = normalize(weights);
  const quiet = [...FRAMEWORKS].sort((a, b) => w[a.id] - w[b.id]).slice(0, 3);
  return CAUSES.filter((c) => !exclude.includes(c.id))
    .map((cause) => ({
      cause,
      score: quiet.reduce((s, f) => s + priority(f.id, cause.id), 0),
      frameworks: quiet.filter((f) => priority(f.id, cause.id) >= 4).map((f) => f.id),
    }))
    .filter((x) => x.frameworks.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

export type Allocation = Record<string, number>;

/**
 * Method A, "each lens spends its share": every framework gets a slice of the
 * budget equal to your credence in it and spends it on its own priorities.
 * Close to a proportional moral parliament.
 */
export function allocateShares(weights: Weights, sharpness = 2): Allocation {
  const w = normalize(weights);
  const out: Allocation = Object.fromEntries(CAUSES.map((c) => [c.id, 0]));
  for (const f of FRAMEWORKS) {
    const raw = CAUSES.map((c) => Math.pow(priority(f.id, c.id), sharpness));
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    CAUSES.forEach((c, i) => (out[c.id] += w[f.id] * (raw[i] / total)));
  }
  return out;
}

/**
 * Method B, "best on average": score each cause by its credence-weighted
 * priority and concentrate the budget on the top few. Close to maximizing
 * expected choice-worthiness.
 */
export function allocateBest(weights: Weights, top = 5, sharpness = 3): Allocation {
  const scored = CAUSES.map((c) => ({ id: c.id, s: lensScore(weights, c.id) })).sort((a, b) => b.s - a.s);
  const chosen = scored.slice(0, top);
  const total = chosen.reduce((a, b) => a + Math.pow(b.s, sharpness), 0) || 1;
  const out: Allocation = Object.fromEntries(CAUSES.map((c) => [c.id, 0]));
  for (const c of chosen) out[c.id] = Math.pow(c.s, sharpness) / total;
  return out;
}

/** Shift an allocation toward causes whose work sits deeper on the source scale. tilt: -1 to 1. */
export function tiltToSources(allocation: Allocation, tilt: number): Allocation {
  const shifted = Object.fromEntries(
    CAUSES.map((c) => [c.id, allocation[c.id] * Math.max(0, 1 + tilt * ((c.dims as Position).depth - 0.5) * 2)]),
  );
  const total = Object.values(shifted).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(shifted).map(([k, v]) => [k, v / total]));
}

/** Share of money the two allocations agree on, 0–1. */
export function overlap(a: Allocation, b: Allocation): number {
  return CAUSES.reduce((s, c) => s + Math.min(a[c.id] ?? 0, b[c.id] ?? 0), 0);
}

/** Money-weighted average of the causes' depth positions, 0–1. */
export function sourceLean(allocation: Allocation): number {
  return CAUSES.reduce((s, c) => s + (allocation[c.id] ?? 0) * (c.dims as Position).depth, 0);
}

export const DIM_LABELS: Record<Dim, string> = {
  horizon: 'time horizon',
  circle: 'circle of concern',
  reach: 'reach',
  certainty: 'appetite for risk',
  depth: 'depth',
};
