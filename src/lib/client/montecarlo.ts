// Seeded random numbers and small statistics helpers for in-browser models.
// Everything here is pure and deterministic: the same seed gives the same draws,
// so a model run can be repeated exactly by anyone.

/** Mulberry32: a small, fast seeded generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Inverse CDF of the triangular distribution with minimum `low`, mode `likely`
 * and maximum `high`. Feed it a uniform number u in [0, 1).
 */
export function triangular(u: number, low: number, likely: number, high: number): number {
  if (!(high > low)) return low;
  const span = high - low;
  const split = (likely - low) / span;
  return u < split ? low + Math.sqrt(u * span * (likely - low)) : high - Math.sqrt((1 - u) * span * (high - likely));
}

/** Quantile of an ascending array, interpolating between neighbors (the common "type 7" rule). */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const a = sorted[lo];
  const b = sorted[hi];
  if (pos === lo || a === b) return a;
  if (!Number.isFinite(b)) return b;
  return a + (b - a) * (pos - lo);
}

/** A round step (1, 2, 2.5 or 5 times a power of ten) at least as big as `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * p;
}

/** Clean up floating-point noise such as 0.30000000000000004. */
const tidy = (v: number) => Number(v.toPrecision(12));

/** Evenly spaced round values inside [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [tidy(min)];
  const step = niceStep((max - min) / Math.max(1, count));
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(tidy(v));
  return out;
}

export interface Bin {
  x0: number;
  x1: number;
  count: number;
}

/**
 * Equal-width bins with round edges that cover [lo, hi], about `target` of them.
 * Values outside the covered range are not binned; they are counted in
 * `below` and `above` so a chart can say what it left out.
 */
export function histogram(values: ArrayLike<number>, lo: number, hi: number, target = 24): { bins: Bin[]; below: number; above: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { bins: [], below: 0, above: 0 };
  let below = 0;
  let above = 0;
  if (hi - lo <= Math.abs(lo) * 1e-9) {
    // Every value is the same: one bar, one value.
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v < lo) below++;
      else if (v > hi) above++;
      else count++;
    }
    return { bins: [{ x0: lo, x1: hi, count }], below, above };
  }
  const step = niceStep((hi - lo) / target);
  const start = tidy(Math.floor(lo / step + 1e-9) * step);
  let n = Math.max(1, Math.ceil((hi - start) / step - 1e-9));
  if (start + n * step < hi) n += 1;
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ x0: tidy(start + i * step), x1: tidy(start + (i + 1) * step), count: 0 }));
  const end = bins[n - 1].x1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < start) below++;
    else if (v > end) above++;
    else bins[Math.min(n - 1, Math.floor((v - start) / step))].count++;
  }
  return { bins, below, above };
}
