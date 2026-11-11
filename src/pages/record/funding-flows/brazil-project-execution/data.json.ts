import type { APIRoute } from 'astro';
import { data } from '../../../../lib/brazil-project-execution';

export const GET: APIRoute = () => new Response(JSON.stringify(data, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
