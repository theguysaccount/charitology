import type { APIRoute } from 'astro';
import { availableEndpoints, buildEndpoint } from '../../../lib/api';

export async function getStaticPaths() {
  return (await availableEndpoints()).map((e) => ({ params: { name: e.name } }));
}

export const GET: APIRoute = async ({ params }) => {
  const body = await buildEndpoint(params.name!);
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
