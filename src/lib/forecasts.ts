// Forecast aggregation and Brier scoring. A Brier score is (p − outcome)²:
// 0 is perfect, 0.25 is what always saying 50% earns, 1 is confidently wrong.
import { getCollection, type CollectionEntry } from 'astro:content';
import { scoreLeaderboard } from './forecast-model';
export { median, brier, latestByForecaster, summarize, cutoffText } from './forecast-model';

export type Question = CollectionEntry<'forecasts'>;

export async function leaderboard() {
  return scoreLeaderboard(await getCollection('forecasts'));
}
