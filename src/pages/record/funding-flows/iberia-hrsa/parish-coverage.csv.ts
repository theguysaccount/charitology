import type { APIRoute } from 'astro';
import data from '../../../../data/funding-flows/iberia-hrsa.json';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => {
  const coverage = data.parishCoverage;
  const rows = coverage.estimates.map(row => ({
    countyFips: coverage.countyFips, calendarYear: row.calendarYear,
    ...coverage.selection, population: row.population, populationMargin: row.populationMargin,
    uninsured: row.uninsured, uninsuredMargin: row.uninsuredMargin,
    uninsuredPercent: row.uninsuredPercent, uninsuredPercentMargin: row.uninsuredPercentMargin,
    confidenceLevelPercent: coverage.confidenceLevelPercent, sourceVersion: row.sourceVersion,
    sourceUrl: row.source.url, sourceMember: row.source.member,
    sourceRecord: row.source.sourceRecord, sourceSha256: row.source.sha256,
  }));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
