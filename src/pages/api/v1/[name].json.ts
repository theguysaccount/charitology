import type { APIRoute } from 'astro';
import { ENDPOINTS, buildEndpoint } from '../../../lib/api';

export function getStaticPaths() {
  return ENDPOINTS.map((e) => ({ params: { name: e.name } }));
}

export const GET: APIRoute = async ({ params }) => {
  const body = await buildEndpoint(params.name!);
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
