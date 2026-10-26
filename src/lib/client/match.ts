// Name matching for the Charity Lookup. Pure functions with no DOM, so the
// same code runs in the browser and in tests.

export interface Named {
  name: string;
  website?: string;
}

export interface Match<T> {
  item: T;
  score: number;
}

// Words that say nothing about which organization is meant.
const STOP = new Set(['the', 'of', 'and', 'for', 'a', 'an', 'in', 'inc', 'incorporated', 'llc', 'ltd', 'corp', 'corporation', 'co', 'org']);

/** Lowercase, strip accents and punctuation, and spell out "&". */
export function normalizeName(text: string): string {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function nameTokens(text: string): string[] {
  return normalizeName(text)
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

/** "https://www.example-charity.org/about" → ["example", "charity"]: the part people type. */
export function hostTokens(url?: string): string[] {
  if (!url) return [];
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.').slice(0, -1).flatMap((part) => nameTokens(part));
  } catch {
    return [];
  }
}

/** If the query looks like a web address, return its host words instead. */
function queryTokens(query: string): string[] {
  const trimmed = query.trim();
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(trimmed) && !/\s/.test(trimmed)) {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const words = hostTokens(withScheme);
    if (words.length) return words;
  }
  return nameTokens(trimmed);
}

/** 0 means no match. 100 is an exact name match. */
export function scoreName(query: string, item: Named): number {
  const q = normalizeName(query);
  if (q.length < 2) return 0;
  const name = normalizeName(item.name);
  if (!name) return 0;
  if (name === q) return 100;

  let score = 0;
  if (name.startsWith(q)) score = Math.max(score, 85);
  else if (name.includes(q)) score = Math.max(score, 70);

  // "give directly" should find "GiveDirectly", and the other way round.
  const qCompact = q.replace(/ /g, '');
  const nameCompact = name.replace(/ /g, '');
  if (qCompact.length >= 4 && nameCompact.includes(qCompact)) score = Math.max(score, 65);

  // The query may wrap the name in other words, like a page title: "Donate | Example Foundation".
  const own = nameTokens(item.name);
  if (name.length >= 5 && ` ${q} `.includes(` ${name} `)) score = Math.max(score, 80);

  const qt = queryTokens(query);
  if (!qt.length) return score;
  if (own.length >= 2 && own.every((t) => qt.includes(t))) score = Math.max(score, 60);
  const words = [...own, ...hostTokens(item.website)];
  const hits = qt.filter((t) => words.some((w) => w.startsWith(t) || (t.length >= 4 && w.includes(t))));
  if (hits.length === qt.length) {
    const coverage = Math.min(1, qt.length / Math.max(own.length, 1));
    score = Math.max(score, Math.round(55 + 20 * coverage));
  } else if (hits.length && hits.length / qt.length >= 0.5 && hits.some((t) => t.length >= 3)) {
    score = Math.max(score, Math.round(40 * (hits.length / qt.length)));
  }
  return score;
}

/** Best matches first. Scores below `min` are dropped. */
export function searchByName<T extends Named>(query: string, items: T[], limit = 10, min = 25): Match<T>[] {
  return items
    .map((item) => ({ item, score: scoreName(query, item) }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}
