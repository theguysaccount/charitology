import type { APIRoute } from 'astro';
import { accountsCsvRows } from '../../../../lib/ripple-effect-kenya-accounts';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => new Response('\uFEFF' + toCsv(accountsCsvRows()) + '\n', {
  headers: { 'Content-Type': 'text/csv; charset=utf-8' },
});
