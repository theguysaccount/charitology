import type { APIRoute } from 'astro';
import data from '../../../../data/ripple-effect-kenya-accounts.json';
import { rows } from '../../../../lib/ripple-effect-kenya-accounts';

export const GET: APIRoute = () => new Response(JSON.stringify({ ...data, rows }, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
