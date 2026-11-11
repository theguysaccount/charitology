import type { APIRoute } from 'astro';
import data from '../../../../data/hokkaido-child-support.json';
import { toCsv } from '../../../../lib/client/files';

const years = ['2022', '2023'] as const;

export const GET: APIRoute = () => {
  const rows = years.flatMap(year => {
    const edition = data.funding[year];
    const awardSource = data.sources[`awards${year}`];
    const selectionSource = data.sources[`selection${year}`];
    return edition.awards.map(award => ({
      fiscalYear: year, periodStart: edition.periodStart, periodEnd: edition.periodEnd,
      listedPrefecture: 'Hokkaido', awardStage: data.awardStage, currency: data.currency,
      recipient: award.recipientLabel, category: award.category,
      awardJPYThousands: award.awardAtSelectionJPYThousands,
      awardPdf: awardSource.url, awardPdfPage: award.awardTablePdfPage, awardSha256: awardSource.sha256,
      selectionPdf: award.selection ? selectionSource.url : null, selectionPdfPage: award.selection?.page,
      selectionNumber: award.selection?.number, selectionSha256: award.selection ? selectionSource.sha256 : null,
      corporateNumber: award.selection?.corporateNumber,
    }));
  });
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
