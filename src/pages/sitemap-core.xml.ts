import type { APIRoute } from 'astro';
import { childSitemap } from '../lib/sitemaps';

export const GET: APIRoute = ({ site }) => childSitemap('sitemap-core.xml', site);
