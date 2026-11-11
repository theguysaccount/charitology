import type { APIRoute } from 'astro';
import edition from '../../../../data/kenya-pbo-coverage.json';
import { toCsv } from '../../../../lib/client/files';

type Period = typeof edition.periods[number];
type Reference = keyof Period['source']['references'];
function record(period: Period, source: Reference, metric: string, geography: string, value: number | string | null, unit: string) {
  const ref = period.source.references[source]!;
  return {
    fiscalYear: period.fiscalYear, metric, geography, value, unit, source: period.source.url,
    sourcePdfPage: ref.pdfPage, printedPage: ref.printedPage, sourceLocation: ref.location, sha256: period.source.sha256,
  };
}

export const GET: APIRoute = () => {
  const latest = edition.periods.find(period => period.fiscalYear === edition.expenditure.fiscalYear)!;
  const records = edition.periods.flatMap(period => [
    record(period, 'register', 'cumulative-registrations', 'Kenya', period.cumulativeRegistrations, 'count'),
    record(period, 'register', 'active-at-report-cutoff', 'Kenya', period.activeAtReportCutoff, 'count'),
    record(period, 'filed', 'annual-reports-submitted', 'Kenya', period.annualReportsSubmitted, 'count'),
    record(period, 'audited', 'audited-accounts-submitted', 'Kenya', period.auditedAccountsSubmitted, 'count'),
    record(period, 'receipts', 'total-reported-receipts', 'All sources', period.receiptsKES, 'KES'),
    ...Object.entries(period.receiptOriginsKES).map(([region, value]) => record(period, 'origins', 'reported-receipts-by-source-region', region, value, 'KES')),
    record(period, 'origins', 'published-receipts-minus-sum-of-regions', 'All sources', period.receiptOriginsDifferenceKES, 'KES'),
  ]);
  records.push(...edition.expenditure.rows.flatMap(row => [
    record(latest, 'expenditure', row.category, 'Kenya', row.inKenyaKES, 'KES'),
    record(latest, 'expenditure', row.category, 'Outside Kenya', row.outsideKenyaKES, 'KES'),
    record(latest, 'expenditure', row.category, 'All places', row.totalKES, 'KES'),
  ]));
  records.push(record(latest, 'sectorProjectTotal', 'project-cost-sector-table-total', 'Kenya', edition.expenditure.sectorTableProjectTotalInKenyaKES, 'KES'));
  return new Response(toCsv(records) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
