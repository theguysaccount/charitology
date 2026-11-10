import type { APIRoute } from 'astro';
import data from '../../../../data/home-from-hospital.json';

export const GET: APIRoute = () => new Response(JSON.stringify(data, null, 2) + '\n', {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
