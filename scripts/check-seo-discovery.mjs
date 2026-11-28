import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readBuiltSitemapSet } from './sitemap-set.mjs';

const root = process.cwd();
const dist = join(root, 'dist');

const readDist = (rel) => readFileSync(join(dist, rel), 'utf8');

function extractJsonLd(html, label) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(matches.length > 0, `${label}: expected at least one JSON-LD block`);
  return matches.map((m, idx) => {
    try {
      return JSON.parse(m[1]);
    } catch (err) {
      throw new Error(`${label}: invalid JSON-LD block #${idx}: ${err}`);
    }
  });
}

// 1. Sitemap completeness, zero duplicates, excludes utility pages, and resolves to real dist files.
// /sitemap.xml is a sitemap index once the site passes 2,000 URLs; every rule below applies to
// the union of its child urlsets, and the core child alone must still hold the original >= 580.
const sitemapSet = readBuiltSitemapSet(dist);
const locs = sitemapSet.locs;
assert.equal(new Set(locs).size, locs.length, 'sitemap.xml contains duplicate <loc> entries');
assert.ok(locs.length >= 580, `Expected expanded sitemap with >= 580 URLs, got ${locs.length}`);
if (sitemapSet.index) {
  assert.deepEqual(sitemapSet.children.map((c) => c.file), ['sitemap-core.xml', 'sitemap-registries-wave1.xml', 'sitemap-registries-wave1b.xml'], 'Unexpected child sitemaps');
  const core = sitemapSet.children[0].locs;
  assert.ok(core.length >= 580, `Expected core sitemap with >= 580 URLs, got ${core.length}`);
  assert.ok(locs.length > 2000, 'A sitemap index is only used once the site exceeds 2,000 URLs');
  const robots = readDist('robots.txt');
  assert.ok(robots.includes(`Sitemap: ${new URL('sitemap.xml', sitemapSet.children[0].loc).href}`), 'robots.txt must point to the sitemap index');
}

for (const excluded of ['/search/', '/404/', '/browser-data/']) {
  assert.ok(!locs.some((u) => u.endsWith(excluded)), `sitemap.xml should exclude utility route ${excluded}`);
}

const charityIndexApi = JSON.parse(readDist('api/v1/charity-index.json')).data;
const fundingFlowsApi = JSON.parse(readDist('api/v1/funding-flows.json')).data;

for (const j of charityIndexApi.jurisdictions) {
  assert.ok(
    locs.some((u) => u.endsWith(j.route)),
    `sitemap.xml missing Global Charity Index jurisdiction route: ${j.route}`,
  );
}
for (const f of fundingFlowsApi.entries) {
  assert.ok(
    locs.some((u) => u.endsWith(f.route)),
    `sitemap.xml missing Funding Flow route: ${f.route}`,
  );
}
assert.ok(
  locs.some((u) => u.endsWith('/disasters/2024-2026-emergencies/')),
  'sitemap.xml missing /disasters/2024-2026-emergencies/',
);

// Verify every single sitemap URL resolves to an actual built file in dist/
const origin = new URL(locs[0]).origin;
for (const loc of locs) {
  const u = new URL(loc);
  assert.equal(u.origin, origin, `Mixed origins in sitemap.xml: ${loc}`);
  const rel = u.pathname.endsWith('/') ? `${u.pathname.slice(1)}index.html` : u.pathname.slice(1);
  assert.ok(existsSync(join(dist, rel)), `sitemap.xml points to non-existent built page: ${loc} (${rel})`);
}

// 2. JSON-LD validation across homepage, Dataset registries, Funding Flows, and WebApplication tools
const homeLd = extractJsonLd(readDist('index.html'), 'homepage');
assert.ok(homeLd.some((n) => n['@type'] === 'Organization'), 'homepage missing Organization JSON-LD');
assert.ok(homeLd.some((n) => n['@type'] === 'WebSite' && n.potentialAction?.['@type'] === 'SearchAction'), 'homepage missing WebSite SearchAction JSON-LD');

for (const rel of [
  'record/charity-index/austria/index.html',
  'record/charity-index/northern-ireland/index.html',
  'record/charity-index/slovenia/index.html',
  'record/charity-index/colombia/index.html',
  'record/charity-index/finland/index.html',
  'record/charity-index/italy/index.html',
  'record/charity-index/croatia/index.html',
  'record/funding-flows/italy-five-per-mille/index.html',
  'record/funding-flows/slovenia-dohodnina-1-percent/index.html',
  'record/funding-flows/europe-tax-assignment-compare/index.html',
  'record/funding-flows/eu-transparency-register-ngos/index.html',
  'record/funding-flows/ocha-fts-global-clusters/index.html',
]) {
  const ld = extractJsonLd(readDist(rel), rel);
  const ds = ld.find((n) => n['@type'] === 'Dataset');
  assert.ok(ds, `${rel}: missing Dataset JSON-LD`);
  assert.equal(ds.isAccessibleForFree, true, `${rel}: Dataset must declare isAccessibleForFree: true`);
  assert.ok(ds.distribution?.[0]?.contentUrl, `${rel}: Dataset missing DataDownload distribution`);
  assert.ok(ld.some((n) => n['@type'] === 'BreadcrumbList'), `${rel}: missing BreadcrumbList JSON-LD`);
}

const lookupLd = extractJsonLd(readDist('tools/charity-lookup/index.html'), 'tools/charity-lookup');
assert.ok(lookupLd.some((n) => n['@type'] === 'WebApplication' && n.offers?.price === '0'), 'tools/charity-lookup missing free WebApplication JSON-LD');
assert.ok(lookupLd.some((n) => n['@type'] === 'BreadcrumbList'), 'tools/charity-lookup missing BreadcrumbList JSON-LD');

const toolsHubLd = extractJsonLd(readDist('tools/index.html'), 'tools');
assert.ok(
  toolsHubLd.some((n) => n['@type'] === 'SoftwareApplication' && n.offers?.price === '0' && n.url === 'https://os.charitology.org/'),
  'tools/index.html missing Charity OS SoftwareApplication JSON-LD',
);
assert.ok(toolsHubLd.some((n) => n['@type'] === 'ItemList' && n.itemListElement?.length >= 6), 'tools/index.html missing ItemList JSON-LD');
assert.ok(toolsHubLd.some((n) => n['@type'] === 'BreadcrumbList'), 'tools/index.html missing BreadcrumbList JSON-LD');

const freeLd = extractJsonLd(readDist('for-charities/free/index.html'), 'for-charities/free');
assert.ok(
  freeLd.some((n) => n['@type'] === 'CollectionPage' && n.mainEntity?.['@type'] === 'ItemList' && n.mainEntity.numberOfItems >= 60),
  'for-charities/free missing CollectionPage/ItemList JSON-LD',
);
assert.ok(
  freeLd.some((n) => n['@type'] === 'Dataset' && n.isAccessibleForFree === true && n.distribution?.[0]?.contentUrl?.endsWith('/data/free-charity-resources.json')),
  'for-charities/free missing Dataset JSON-LD',
);
assert.ok(
  freeLd.some((n) => n['@type'] === 'FAQPage' && Array.isArray(n.mainEntity) && n.mainEntity.length >= 4),
  'for-charities/free missing FAQPage JSON-LD',
);

for (const hubRel of ['record/charity-index/coverage/index.html', 'record/funding-flows/index.html']) {
  const hubLd = extractJsonLd(readDist(hubRel), hubRel);
  assert.ok(
    hubLd.some((n) => n['@type'] === 'Dataset' && n.isAccessibleForFree === true && n.distribution?.[0]?.contentUrl),
    `${hubRel}: missing hub Dataset JSON-LD`,
  );
}

// 3. Validate /llms.txt agent entrypoint and Glama MCP backlink
const llmsTxt = readDist('llms.txt');
assert.ok(llmsTxt.includes('https://os.charitology.org/mcp'), 'llms.txt missing MCP endpoint');
assert.ok(llmsTxt.includes('https://glama.ai/mcp/connectors/io.github.theguysaccount/charitology'), 'llms.txt missing Glama connector link');
assert.ok(llmsTxt.includes('/api/v1/index.json'), 'llms.txt missing Public API index');
assert.ok(llmsTxt.includes(`${charityIndexApi.jurisdictionCount} Jurisdictions`), 'llms.txt missing jurisdiction count');
for (const j of charityIndexApi.jurisdictions) {
  assert.ok(llmsTxt.includes(j.route), `llms.txt missing jurisdiction route ${j.route}`);
}
const readmeMd = readFileSync(join(root, 'README.md'), 'utf8');
assert.ok(
  readmeMd.includes('https://glama.ai/mcp/connectors/io.github.theguysaccount/charitology'),
  'README.md missing Glama MCP backlink',
);

// 4. Validate Charity OS public robots.txt & sitemap.xml
const osRobots = readFileSync(join(root, 'services/charity-os/public/robots.txt'), 'utf8');
assert.ok(osRobots.includes('Sitemap: https://os.charitology.org/sitemap.xml'), 'Charity OS robots.txt missing sitemap');
assert.ok(osRobots.includes('Disallow: /api/'), 'Charity OS robots.txt must disallow /api/');
const osSitemap = readFileSync(join(root, 'services/charity-os/public/sitemap.xml'), 'utf8');
assert.ok(osSitemap.includes('https://os.charitology.org/mcp.html'), 'Charity OS sitemap.xml missing mcp.html');

console.log(
  `✓ SEO & Agent discovery verified: ${locs.length} valid sitemap URLs (all ${charityIndexApi.jurisdictionCount} countries + ${fundingFlowsApi.totalEntries} funding flows), validated JSON-LD (Organization, WebSite, Dataset, WebApplication, BreadcrumbList), /llms.txt, and Charity OS robots/sitemap.`,
);
