/** Gift credit is an authored allocation assumption, not observed donor causation.
 * This adjacent method does not change the frozen source simulation. */
export const METHOD_ID = 'gift-credit-from-matched-cpo-v1';
export const DRAW_COUNT = 5000;
export class GiftArithmeticError extends Error {
  constructor(code) { super('The conditional estimate is unavailable.'); this.name = 'GiftArithmeticError'; this.code = code; }
}
const refuse = code => { throw new GiftArithmeticError(code); };
function finite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Object.is(value, -0)) refuse('arithmetic-range');
  return value;
}
function product(a, b) {
  const result = finite(a * b);
  if (a > 0 && b > 0 && result === 0) refuse('arithmetic-range');
  return result;
}
function quantile(sorted, q) {
  const position = (sorted.length - 1) * q, low = Math.floor(position), fraction = position - low;
  if (fraction === 0) return sorted[low];
  const difference = finite(sorted[low + 1] - sorted[low]);
  return finite(sorted[low] + product(difference, fraction));
}
/** Caller must establish ownership, source pins and exact numerical reproduction.
 * This function alone grants no qualification. Arrays are never paired by index. */
export function deriveGiftCredit(costDraws, mappedCents, donorCreditBasisPoints) {
  if (!Number.isSafeInteger(mappedCents) || mappedCents <= 0 ||
      !Number.isSafeInteger(donorCreditBasisPoints) || donorCreditBasisPoints < 0 || donorCreditBasisPoints > 10000 ||
      !Array.isArray(costDraws) || Object.getPrototypeOf(costDraws) !== Array.prototype || costDraws.length !== DRAW_COUNT)
    refuse('arithmetic-input');
  const numerator = product(mappedCents / 100, donorCreditBasisPoints / 10000), values = [];
  let sourceNoOutcomeDraws = 0;
  for (const draw of costDraws) {
    if (draw === null || typeof draw !== 'object' || Object.getPrototypeOf(draw) !== Object.prototype) refuse('arithmetic-input');
    const keys = Object.keys(draw);
    if (draw.kind === 'no-outcome' && keys.length === 1 && keys[0] === 'kind') { values.push(0); sourceNoOutcomeDraws++; }
    else {
      if (draw.kind !== 'finite' || keys.length !== 2 || !keys.includes('kind') || !keys.includes('value') || !(finite(draw.value) > 0)) refuse('arithmetic-input');
      const value = finite(numerator / draw.value);
      if (numerator > 0 && value === 0) refuse('arithmetic-range');
      values.push(value);
    }
  }
  values.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return Object.freeze({ values: Object.freeze(values), summary: Object.freeze({ draws: DRAW_COUNT, sourceNoOutcomeDraws,
    p5: quantile(values, 0.05), median: quantile(values, 0.5), p95: quantile(values, 0.95) }) });
}
/** Versioned fingerprint payload: sorted nonnegative binary64, little endian. */
export function encodeDerivedValues(values) {
  if (!Array.isArray(values) || values.length !== DRAW_COUNT) refuse('arithmetic-input');
  const prefix = new TextEncoder().encode(`${METHOD_ID}/sorted-binary64-le-v1\n`);
  const bytes = new Uint8Array(prefix.length + DRAW_COUNT * 8); bytes.set(prefix);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < DRAW_COUNT; i++) {
    const value = finite(values[i]); if (i && value < values[i - 1]) refuse('arithmetic-input');
    view.setFloat64(prefix.length + i * 8, value, true);
  }
  return bytes;
}
