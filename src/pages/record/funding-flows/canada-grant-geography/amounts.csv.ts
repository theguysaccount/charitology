import type { APIRoute } from 'astro';
import data from '../../../../data/ca-grant-geography.json';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => {
  const rows = Object.entries(data.editions).flatMap(([year, edition]) =>
    Object.entries(edition.amounts).flatMap(([component, amount]) => {
      const base = { year, component, currency: data.currency, stage: data.stage,
        capturedOn: data.capturedOn, licence: data.licence,
        grantSource: edition.sources.grants.url, grantSha256: edition.sources.grants.sha256,
        financeSource: edition.sources.finance.url, financeSha256: edition.sources.finance.sha256 };
      return [
        { ...base, scope: 'reported-total', code: '', name: '', ...amount.reported },
        { ...base, scope: 'unallocated', code: '', name: '', ...amount.unallocated },
        ...amount.countries.map(({ code, name, ...values }) => ({ ...base, scope: 'country', code, name, ...values })),
      ];
    }));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
