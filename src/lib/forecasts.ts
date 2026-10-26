// Forecast aggregation and Brier scoring. A Brier score is (p − outcome)²:
// 0 is perfect, 0.25 is what always saying 50% earns, 1 is confidently wrong.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Question = CollectionEntry<'forecasts'>;

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function brier(p: number, outcome: boolean): number {
  return (p - (outcome ? 1 : 0)) ** 2;
}

/** Each forecaster's latest forecast on a question, which is the one that gets scored. */
export function latestByForecaster(q: Question) {
  const latest = new Map<string, Question['data']['forecasts'][number]>();
  for (const f of [...q.data.forecasts].sort((a, b) => a.date.getTime() - b.date.getTime())) latest.set(f.by.toLowerCase(), f);
  return [...latest.values()];
}

export function summarize(q: Question) {
  const latest = latestByForecaster(q);
  const resolved = q.data.outcome !== null;
  return {
    forecasters: latest.length,
    median: median(latest.map((f) => f.p)),
    resolved,
    open: !resolved && q.data.closes.getTime() > Date.now(),
    scores: resolved ? latest.map((f) => ({ by: f.by, p: f.p, score: brier(f.p, q.data.outcome as boolean) })) : [],
  };
}

export async function leaderboard() {
  const questions = await getCollection('forecasts');
  const totals = new Map<string, { by: string; sum: number; n: number }>();
  for (const q of questions) {
    for (const s of summarize(q).scores) {
      const key = s.by.toLowerCase();
      const t = totals.get(key) ?? { by: s.by, sum: 0, n: 0 };
      t.sum += s.score;
      t.n += 1;
      totals.set(key, t);
    }
  }
  return [...totals.values()].map((t) => ({ by: t.by, mean: t.sum / t.n, n: t.n })).sort((a, b) => a.mean - b.mean);
}
