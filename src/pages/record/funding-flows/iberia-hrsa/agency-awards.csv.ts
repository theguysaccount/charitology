import type { APIRoute } from 'astro';
import data from '../../../../data/funding-flows/iberia-hrsa.json';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => {
  const rows = data.agencyAwards.map(row => ({
    grantNumber: row.grantNumber, federalIssueYear: row.federalIssueYear, currency: data.currency,
    awardedUSD: (row.awardedCents / 100).toFixed(2), recipientUEI: data.organization.uei,
    agencyProjectStart: row.projectPeriodStart, agencyProjectEnd: row.projectPeriodEnd,
    sourceRefreshedOn: row.sourceRefreshedOn, sourceRecord: row.sourceRecord,
    sourceUrl: data.agencySource.url, sourceSha256: data.agencySource.sha256,
  }));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
