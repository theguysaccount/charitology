// Arithmetic and checks for One-Click Split. Pure functions, so the
// rounding can be tested on its own: amounts are whole dollars and always
// add up to the total exactly.

/**
 * Split a whole number in proportion to weights using the largest remainder
 * method: round every share down, then hand the leftover units one at a time
 * to the shares that lost the most in rounding (ties go to the larger weight,
 * then to the earlier row). The result always sums to `total`.
 */
export function splitWhole(total: number, weights: number[]): number[] {
  const t = Math.max(0, Math.round(total));
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!t || !sum) return w.map(() => 0);
  const raw = w.map((x) => (t * x) / sum);
  const out = raw.map((r) => Math.floor(r));
  let left = t - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: w[i] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k].i] += 1;
  return out;
}

/** Sum of percentage shares, rounded to avoid floating-point noise. */
export function shareTotal(shares: number[]): number {
  return Math.round(shares.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) * 1000) / 1000;
}

/** A plan's shares are complete when they add up to 100 percent. */
export const sharesComplete = (shares: number[]): boolean => Math.abs(shareTotal(shares) - 100) < 0.001;

export interface CheckedUrl {
  url?: string;
  error?: string;
}

/**
 * A donation page address. Only https is accepted. A bare address such as
 * "example.org/donate" gets https:// added; anything with another scheme
 * (http:, javascript:, data:, mailto:) is refused.
 */
export function checkUrl(text: string): CheckedUrl {
  const s = text.trim();
  if (!s) return {};
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?![0-9])/i.test(s);
  const candidate = hasScheme ? s : `https://${s.replace(/^\/+/, '')}`;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { error: 'That doesn’t look like a web address.' };
  }
  if (u.protocol !== 'https:') return { error: 'Use the page’s secure address, starting with https://.' };
  if (!u.hostname.includes('.') || u.username || u.password) return { error: 'That doesn’t look like a donation page address.' };
  return { url: u.href };
}
