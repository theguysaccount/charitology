import type { APIRoute } from 'astro';
import { contractEdition } from '../../../../lib/brazil-project-contracts';

export const GET: APIRoute = () => new Response(JSON.stringify(contractEdition, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
