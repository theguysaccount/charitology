import type { APIRoute } from 'astro';
import { expenditure, exportPairs } from '../../../../lib/kenya-nutrition-trace';
import { toCsv } from '../../../../lib/client/files';

export const getStaticPaths = () => ['counterparts', 'expenditure'].map(table => ({ params: { table } }));

export const GET: APIRoute = ({ params }) => {
  const rows = params.table === 'counterparts' ? exportPairs() : expenditure;
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
