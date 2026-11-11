import type { APIRoute } from 'astro';
import data from '../../../../data/funding-flows/iberia-hrsa.json';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => {
  const rows = data.audits.flatMap(audit => audit.grants.map(row => ({
    grantNumber: row.grantNumber, assistanceListing: row.assistanceListing, currency: data.currency,
    reportedReceiptsUSD: (row.reportedReceiptsCents / 100).toFixed(2),
    reportedExpensesUSD: (row.reportedExpensesCents / 100).toFixed(2), accountingBasis: audit.accountingBasis,
    recipientUEI: data.organization.uei, recipientEIN: data.organization.ein,
    fiscalPeriodStart: audit.fiscalPeriodStart, fiscalPeriodEnd: audit.fiscalPeriodEnd,
    scheduleProgramStart: row.programPeriodStart, scheduleProgramEnd: row.programPeriodEnd,
    reportId: audit.reportId, pdfPage: audit.scheduleSource.pdfPage,
    sourceUrl: audit.scheduleSource.url, sourceSha256: audit.scheduleSource.sha256,
  })));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
