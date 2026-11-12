import { defineMiddleware } from 'astro:middleware';
import { markPublicLists } from './lib/public-list-marks.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (!context.isPrerendered || !response.body || !response.headers.get('content-type')?.startsWith('text/html')) {
    return response;
  }
  const html = await response.text();
  const marked = markPublicLists(html);
  const headers = new Headers(response.headers);
  if (marked !== html) {
    headers.delete('content-length');
    headers.delete('etag');
  }
  return new Response(marked, { status: response.status, statusText: response.statusText, headers });
});
