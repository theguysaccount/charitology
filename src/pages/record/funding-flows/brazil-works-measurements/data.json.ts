import type { APIRoute } from 'astro';
import { worksEdition } from '../../../../lib/brazil-works-measurements';

export const GET: APIRoute = () => new Response(JSON.stringify(worksEdition, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
