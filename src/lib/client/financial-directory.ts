import { loadVerifiedJson, type VerifiedJsonAsset } from './verified-json';

export type FinancialShard = VerifiedJsonAsset & { path: string; rows: number };

const MAX_CACHED_SHARDS = 6;

export function financialShardLoader<Row>(base: string, assets: Record<string, FinancialShard>) {
  const cache = new Map<string, Promise<Row[]>>();
  return (key: string) => {
    const asset = Object.hasOwn(assets, key) ? assets[key] : undefined;
    if (!asset) return Promise.resolve([] as Row[]);
    const existing = cache.get(key);
    if (existing) {
      cache.delete(key);
      cache.set(key, existing);
      return existing;
    }
    const rows = loadVerifiedJson(base + asset.path, asset).then(value => {
      if (!Array.isArray(value) || value.length !== asset.rows) throw new Error('The snapshot has an unexpected row count.');
      return value as Row[];
    });
    cache.set(key, rows);
    if (cache.size > MAX_CACHED_SHARDS) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    void rows.catch(() => { if (cache.get(key) === rows) cache.delete(key); });
    return rows;
  };
}

export const normalizeFinancialName = (value: string) =>
  value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const financialCsvName = (name: string) => /^(?:\s*[=+\-@]|[\t\r\n])/.test(name) ? "'" + name : name;
