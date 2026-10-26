// Pure forecast integrity rules, shared by content validation, scoring and UI.
// Dates are UTC instants. A forecast must be strictly BEFORE every cutoff;
// date-only closing values retain their existing meaning: midnight UTC.
export type Forecast = { by: string; p: number; date: Date; rationale?: string };
export type ForecastData = {
  closes: Date;
  outcome: boolean | null;
  annulled?: boolean;
  resolvedOn?: Date;
  outcomeKnownOn?: Date;
  resolutionSource?: string;
  resolutionNote?: string;
  forecasts: Forecast[];
};
export type ForecastQuestion = { data: ForecastData };
export type ForecastIssue = { path: (string | number)[]; message: string };
const instant = (value: unknown): number => value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
const https = (value: unknown) => {
  if (typeof value !== 'string') return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; } catch { return false; }
};
export const validForecastHandle = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,78}$/.test(value);
export const forecastCutoff = (data: ForecastData): number => Math.min(
  instant(data.closes),
  data.outcomeKnownOn === undefined ? Infinity : instant(data.outcomeKnownOn),
  data.resolvedOn === undefined ? Infinity : instant(data.resolvedOn),
);
export const cutoffText = (data: ForecastData) => Number.isFinite(forecastCutoff(data)) ? new Date(forecastCutoff(data)).toISOString() : 'Invalid cutoff';
export function forecastDraft(question: { cutoff: string; settled: boolean }, input: { by: string; p: number; rationale: string }, now = Date.now()): string | null {
  if (question.settled || !(now < Date.parse(question.cutoff)) || !validForecastHandle(input.by) || !Number.isFinite(input.p) || input.p < 0 || input.p > 1 || input.rationale.length > 2000) return null;
  const lines = [`  - by: ${JSON.stringify(input.by)}`, `    p: ${input.p.toFixed(2)}`, `    date: ${JSON.stringify(new Date(now).toISOString())}`];
  if (input.rationale.trim()) lines.push(`    rationale: ${JSON.stringify(input.rationale.replace(/\s+/g, ' ').trim())}`);
  return lines.join('\n');
}

export function forecastValidationIssues(data: ForecastData, now = Date.now()): ForecastIssue[] {
  const issues: ForecastIssue[] = [];
  const add = (path: ForecastIssue['path'], message: string) => issues.push({ path, message });
  if (!Number.isFinite(instant(data.closes))) add(['closes'], 'Use a valid UTC closing instant.');
  if (data.outcome !== null && typeof data.outcome !== 'boolean') add(['outcome'], 'Outcome must be true, false or null.');
  if (data.annulled !== undefined && typeof data.annulled !== 'boolean') add(['annulled'], 'Annulled must be true or false.');
  const decided = typeof data.outcome === 'boolean' || data.annulled === true;
  if (data.annulled && data.outcome !== null) add(['outcome'], 'An annulled question has no YES/NO outcome.');
  if (decided) {
    if (!Number.isFinite(instant(data.resolvedOn))) add(['resolvedOn'], 'A resolution or annulment needs its actual decision timestamp.');
    if (!https(data.resolutionSource)) add(['resolutionSource'], 'A resolution or annulment needs a public HTTPS evidence source.');
    if (!data.resolutionNote?.trim()) add(['resolutionNote'], 'Explain how the evidence meets the resolution or annulment rule.');
  } else if (data.resolvedOn !== undefined) add(['resolvedOn'], 'A decision timestamp requires a resolved or annulled state.');
  if (typeof data.outcome === 'boolean' && !Number.isFinite(instant(data.outcomeKnownOn))) add(['outcomeKnownOn'], 'Record when the outcome first became publicly knowable, before scoring.');
  if (data.outcomeKnownOn !== undefined && !https(data.resolutionSource)) add(['resolutionSource'], 'An outcome-availability cutoff needs a public HTTPS source.');
  for (const field of ['resolvedOn', 'outcomeKnownOn'] as const) {
    if (data[field] !== undefined && (!Number.isFinite(instant(data[field])) || instant(data[field]) > now)) add([field], 'Use an actual timestamp, not an invalid or future time.');
  }
  if (data.outcomeKnownOn !== undefined && data.resolvedOn !== undefined && instant(data.outcomeKnownOn) > instant(data.resolvedOn)) add(['outcomeKnownOn'], 'The public outcome cannot become known after the recorded decision.');
  const cutoff = forecastCutoff(data);
  const seen = new Set<string>();
  data.forecasts.forEach((f, index) => {
    if (!validForecastHandle(f.by)) add(['forecasts', index, 'by'], 'Use a public handle of 1–79 letters, numbers, underscores or hyphens, beginning with a letter or number.');
    if (!Number.isFinite(f.p) || f.p < 0 || f.p > 1) add(['forecasts', index, 'p'], 'Probability must be between zero and one.');
    const time = instant(f.date);
    if (!Number.isFinite(time) || time > now) add(['forecasts', index, 'date'], 'Use the actual submission timestamp, not an invalid or future time.');
    if (!(time < cutoff)) add(['forecasts', index, 'date'], 'Forecasts must precede closing, public outcome availability and the resolution decision.');
    const key = `${f.by.toLowerCase()}\n${time}`;
    if (seen.has(key)) add(['forecasts', index, 'date'], 'A handle cannot have two different forecasts at the same timestamp.');
    seen.add(key);
  });
  return issues;
}

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
export function brier(p: number, outcome: boolean): number {
  if (!Number.isFinite(p) || p < 0 || p > 1 || typeof outcome !== 'boolean') throw Error('A Brier score requires a probability and a resolved boolean outcome.');
  return (p - (outcome ? 1 : 0)) ** 2;
}
/** Defensive scoring also filters invalid/late records, even before build checks. */
export function latestByForecaster(q: ForecastQuestion, now = Date.now()): Forecast[] {
  const latest = new Map<string, Forecast>(), cutoff = forecastCutoff(q.data);
  const eligible = q.data.forecasts.filter(f => validForecastHandle(f.by) && Number.isFinite(f.p) && f.p >= 0 && f.p <= 1 && instant(f.date) <= now && instant(f.date) < cutoff);
  // Ambiguous same-handle/same-time duplicates are not resolved by array order.
  const counts = new Map<string, number>();
  for (const f of eligible) { const key = `${f.by.toLowerCase()}\n${instant(f.date)}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
  for (const f of eligible.sort((a, b) => instant(a.date) - instant(b.date))) {
    if (counts.get(`${f.by.toLowerCase()}\n${instant(f.date)}`) === 1) latest.set(f.by.toLowerCase(), f);
  }
  return [...latest.values()];
}
export function summarize(q: ForecastQuestion, now = Date.now()) {
  const latest = latestByForecaster(q, now);
  const metadataIssues = forecastValidationIssues({ ...q.data, forecasts: [] }, now);
  const valid = metadataIssues.length === 0;
  const annulled = valid && q.data.annulled === true;
  const resolved = valid && !annulled && typeof q.data.outcome === 'boolean';
  const open = valid && !annulled && !resolved && forecastCutoff(q.data) > now;
  const status = !valid ? 'Invalid resolution metadata' : annulled ? 'Annulled · no score' : resolved ? `Resolved ${q.data.outcome ? 'YES' : 'NO'}` : open ? 'Open' : 'Closed, awaiting result';
  return {
    forecasters: latest.length, median: median(latest.map(f => f.p)), resolved, annulled, open, status,
    scores: resolved ? latest.map(f => ({ by: f.by, p: f.p, score: brier(f.p, q.data.outcome as boolean) })) : [],
  };
}
export function scoreLeaderboard(questions: ForecastQuestion[], now = Date.now()) {
  const totals = new Map<string, { by: string; sum: number; n: number }>();
  for (const q of questions) for (const score of summarize(q, now).scores) {
    const key = score.by.toLowerCase(), total = totals.get(key) ?? { by: score.by, sum: 0, n: 0 };
    total.sum += score.score; total.n++; totals.set(key, total);
  }
  return [...totals.values()].map(t => ({ by: t.by, mean: t.sum / t.n, n: t.n })).sort((a, b) => a.mean - b.mean || a.by.localeCompare(b.by));
}
