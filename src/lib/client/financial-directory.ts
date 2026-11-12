import { loadVerifiedJson, type VerifiedJsonAsset } from './verified-json';

export type FinancialShard = VerifiedJsonAsset & { path: string; rows: number };

export function financialShardLoader<Row>(base: string, assets: Record<string, FinancialShard>) {
  let cached: { key: string; rows: Promise<Row[]> } | undefined;
  return (key: string) => {
    const asset = Object.hasOwn(assets, key) ? assets[key] : undefined;
    if (!asset) return Promise.resolve([] as Row[]);
    if (cached?.key === key) return cached.rows;
    const rows = loadVerifiedJson(base + asset.path, asset).then(value => {
      if (!Array.isArray(value) || value.length !== asset.rows) throw new Error('The snapshot has an unexpected row count.');
      return value as Row[];
    });
    cached = { key, rows };
    void rows.catch(() => { if (cached?.rows === rows) cached = undefined; });
    return rows;
  };
}

export const normalizeFinancialName = (value: string) =>
  value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const financialCsvName = (name: string) => /^(?:\s*[=+\-@]|[\t\r\n])/.test(name) ? "'" + name : name;
