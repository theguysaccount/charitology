import type { APIRoute } from 'astro';
import data from '../../../../data/western-cape-transfers.json';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => {
  const rows = data.editions.flatMap(edition => Object.entries(edition.programs).map(([code, program]) => ({
    fiscalYear: edition.year, periodStart: edition.start, periodEnd: edition.end,
    code, program: program.label, paidTableRows: program.rowCount,
    detailTransferredZar: program.detailSums[0], detailReportedSpentZar: program.detailSums[1],
    printedTransferredZar: program.printedAmounts[0], printedReportedSpentZar: program.printedAmounts[1],
    pdfPage: program.page, source: edition.annex.url,
  })));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
