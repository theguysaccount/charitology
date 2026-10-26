export function money(n: number, opts: { cents?: boolean; compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.cents ? 2 : 0,
    minimumFractionDigits: opts.cents ? 2 : 0,
  }).format(n);
}

export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function pct(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Parse a user-typed amount like "$1,250.50" into a number. */
export function parseAmount(text: string): number {
  const n = Number(String(text).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
