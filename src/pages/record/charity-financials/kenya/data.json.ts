import type { APIRoute } from 'astro';
import edition from '../../../../data/kenya-pbo-coverage.json';

export const GET: APIRoute = () => new Response(JSON.stringify(edition, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
