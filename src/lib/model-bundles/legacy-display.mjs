// Display-only helpers. These values never enter an engine/reference hash.
const MAX_BINS = 128, MAX_TICKS = 32, DRAWS = 5000;
const unavailable = () => ({ kind: 'unavailable', reason: 'numeric-display-range' });
const tidy = value => Number(value.toPrecision(12));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function digitsFor(abs) {
  if (abs >= 100) return 0;
  if (abs >= 10) return 1;
  if (abs >= 1) return 2;
  return Math.min(8, 1 - Math.floor(Math.log10(abs)));
}
function nonzeroLabel(value, label, money = false) {
  if (value > 0 && finite(value) && /[0-9]/.test(label) && !/[1-9]/.test(label))
    return (money ? '$' : '') + value.toExponential(6);
  return label;
}
export function formatNumber(value) {
  if (!finite(value)) return value === Infinity ? 'unlimited' : '—';
  if (value === 0) return '0';
  try {
    return nonzeroLabel(value, new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0, maximumFractionDigits: digitsFor(Math.abs(value)),
    }).format(value));
  } catch { return 'Number display unavailable'; }
}
export function formatMoney(value) {
  if (!finite(value)) return value === Infinity ? 'no outcome' : '—';
  try {
    const abs = Math.abs(value), digits = abs === 0 || abs >= 100 ? 0 : abs >= 1 ? 2 : Math.min(8, 1 - Math.floor(Math.log10(abs)));
    const min = abs >= 1 && abs < 100 ? 2 : 0;
    return nonzeroLabel(value, new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: min,
      maximumFractionDigits: Math.max(min, digits),
    }).format(value), true);
  } catch { return 'Money display unavailable'; }
}
export function formatMoneyTick(value, step) {
  if (!finite(value)) return value === Infinity ? 'no outcome' : '—';
  if (!finite(step) || !(step > 0)) return value === 0 ? '$0' : '$' + value.toExponential(6);
  try {
    let options;
    if (step >= 1000) options = { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 2 };
    else {
      const raw = step.toFixed(10).replace(/0+$/, ''), dot = raw.indexOf('.');
      const digits = dot < 0 ? 0 : Math.min(8, raw.length - dot - 1);
      options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    }
    return nonzeroLabel(value, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...options }).format(value), true);
  } catch { return 'Money display unavailable'; }
}

function niceStep(raw) {
  if (!finite(raw) || !(raw > 0)) return null;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  if (!finite(power) || !(power > 0)) return null;
  const fraction = raw / power;
  const multiple = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  const result = multiple * power;
  return finite(result) && result > 0 ? result : null;
}

/** Finite, bounded axis plan; never step an unbounded floating-point loop. */
export function displayTicks(min, max, count = 5) {
  if (!finite(min) || !finite(max) || min > max || !Number.isSafeInteger(count) || count < 1 || count > MAX_TICKS) return unavailable();
  if (min === max) return { kind: 'available', ticks: [min], step: 0 };
  const span = max - min, step = niceStep(span / count);
  if (!finite(span) || !(span > 0) || step === null) return unavailable();
  const first = Math.ceil(min / step - 1e-9) * step;
  const limit = max + step * 1e-9;
  if (!finite(first) || !finite(limit) || !finite((first - min) / span)) return unavailable();
  const ticks = [];
  let value = first;
  for (let i = 0; i <= MAX_TICKS; i++) {
    if (value > limit) return { kind: 'available', ticks, step };
    if (i === MAX_TICKS || !finite(value) || !finite((value - min) / span)) return unavailable();
    const tick = tidy(value);
    if (!finite(tick) || (ticks.length && tick <= ticks[ticks.length - 1])) return unavailable();
    ticks.push(tick);
    const next = value + step;
    if (!finite(next) || !(next > value)) return unavailable();
    value = next;
  }
  return unavailable();
}

function displayQuantile(sorted, q) {
  const position = (sorted.length - 1) * q, low = Math.floor(position), high = Math.min(sorted.length - 1, low + 1);
  const a = sorted[low], b = sorted[high];
  if (!finite(a) || !finite(b) || !(a > 0) || a > b) return null;
  if (position === low || a === b) return a;
  const difference = b - a, fraction = position - low, product = difference * fraction, result = a + product;
  if (!finite(difference) || !finite(product) || difference > 0 && fraction > 0 && product === 0 || !finite(result) || !(result > 0)) return null;
  return result;
}
function finiteCosts(run) {
  if (!run || run.draws !== DRAWS || !Number.isInteger(run.none) || run.none < 0 || run.none > DRAWS ||
      !(run.costs instanceof Float64Array) || Object.getPrototypeOf(run.costs) !== Float64Array.prototype || run.costs.length !== DRAWS) return null;
  const length = DRAWS - run.none;
  let previous = 0;
  for (let i = 0; i < DRAWS; i++) {
    const value = run.costs[i];
    if (i < length ? !finite(value) || !(value > 0) || value < previous : value !== Infinity) return null;
    previous = value;
  }
  return run.costs.subarray(0, length);
}

/** Existing clipping/bin policy for ordinary values, with all allocations bounded. */
export function histogram(run) {
  const values = finiteCosts(run);
  if (values === null) return unavailable();
  if (!values.length) return { kind: 'unavailable', reason: 'no-finite-cost-draws' };
  const lo = displayQuantile(values, 0.005), hi = displayQuantile(values, 0.995);
  if (lo === null || hi === null || hi < lo) return unavailable();
  let below = 0, above = 0;
  const span = hi - lo;
  if (!finite(span)) return unavailable();
  if (span <= Math.abs(lo) * 1e-9) {
    let count = 0;
    for (const value of values) { if (value < lo) below++; else if (value > hi) above++; else count++; }
    return { kind: 'available', bins: [{ x0: lo, x1: hi, count }], below, above };
  }
  const step = niceStep(span / 28);
  if (step === null) return unavailable();
  const start = tidy(Math.floor(lo / step + 1e-9) * step);
  if (!finite(start)) return unavailable();
  let count = Math.max(1, Math.ceil((hi - start) / step - 1e-9));
  if (!Number.isSafeInteger(count) || count > MAX_BINS) return unavailable();
  if (start + count * step < hi) count++;
  if (count > MAX_BINS) return unavailable();
  const bins = [];
  for (let i = 0; i < count; i++) {
    const x0 = tidy(start + i * step), x1 = tidy(start + (i + 1) * step);
    if (!finite(x0) || !finite(x1) || !(x1 > x0) || i && x0 !== bins[i - 1].x1) return unavailable();
    bins.push({ x0, x1, count: 0 });
  }
  const end = bins[bins.length - 1].x1, width = end - start;
  if (!finite(width) || !(width > 0) || displayTicks(start, end).kind !== 'available') return unavailable();
  for (const value of values) {
    if (value < start) below++;
    else if (value > end) above++;
    else {
      const index = Math.min(count - 1, Math.floor((value - start) / step));
      if (!Number.isSafeInteger(index) || index < 0 || index >= count || !finite((value - start) / width)) return unavailable();
      bins[index].count++;
    }
  }
  if (below + above + bins.reduce((sum, bin) => sum + bin.count, 0) !== values.length) return unavailable();
  return { kind: 'available', bins, below, above };
}

/** Domain for a bounded renderer; unbounded endpoints retain their table only. */
export function sensitivityChartDomain(sensitivity) {
  if (!sensitivity || !finite(sensitivity.base) || !(sensitivity.base > 0) || !Array.isArray(sensitivity.rows) || sensitivity.rows.length !== 6) return unavailable();
  let min = sensitivity.base, max = sensitivity.base;
  for (const row of sensitivity.rows) {
    if (![row.lo, row.hi, row.atLow, row.atHigh, row.swing].every(finite) || row.lo <= 0 || row.hi < row.lo || row.swing < 0) return unavailable();
    min = Math.min(min, row.lo); max = Math.max(max, row.hi);
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad; max += pad;
  }
  const span = max - min;
  if (!finite(min) || !finite(max) || !finite(span) || !(span > 0)) return unavailable();
  const axis = displayTicks(min, max, 4);
  if (axis.kind !== 'available') return unavailable();
  for (const row of sensitivity.rows) if (![row.lo, row.hi, sensitivity.base].every(v => finite((v - min) / span))) return unavailable();
  return { kind: 'available', min, max, ticks: axis.ticks, step: axis.step };
}
