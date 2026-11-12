import type { APIRoute } from 'astro';
import { toCsv } from '../../../../../lib/client/files';
import { hearingGroupKeys, joacabaOutpatient } from '../../../../../lib/brazil-joacaba-outpatient';

const { cnes, outpatient, hearing } = joacabaOutpatient;
const files = {
  outpatient: {
    rows: outpatient.months.map(({ month: reportingMonth, ...row }) => ({ cnes, reportingMonth, ...row })),
    columns: ['cnes', 'reportingMonth', 'institutionalRecords', 'observations', 'approvedProcedureUnits'],
  },
  'hearing-care': {
    rows: hearing.months.map(({ month: processingMonth, ...row }) => ({ cnes, processingMonth, ...row })),
    columns: ['cnes', 'processingMonth', ...hearingGroupKeys],
  },
};

type Series = keyof typeof files;
export const getStaticPaths = () => Object.keys(files).map(series => ({ params: { series }, props: { series } }));

export const GET: APIRoute<{ series: Series }> = ({ props: { series } }) => {
  const { rows, columns } = files[series];
  return new Response(toCsv(rows, columns) + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
