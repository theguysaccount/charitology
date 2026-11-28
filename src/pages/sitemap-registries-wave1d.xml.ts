import type { APIRoute } from 'astro';
import { childSitemap } from '../lib/sitemaps';

export const GET: APIRoute = ({ site }) => childSitemap('sitemap-registries-wave1d.xml', site);
