import type { APIRoute } from 'astro';
import { movementEdition } from '../../../../lib/brazil-infrastructure-account-movements';

export const GET: APIRoute = () => new Response(JSON.stringify(movementEdition, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
