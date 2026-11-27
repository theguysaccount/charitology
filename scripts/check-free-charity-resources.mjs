import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBuiltSitemapSet } from './sitemap-set.mjs';

const srcRaw = readFileSync('src/data/free-charity-resources.json', 'utf8');
const pubRaw = readFileSync('public/data/free-charity-resources.json', 'utf8');
assert.equal(pubRaw, srcRaw, 'public/data/free-charity-resources.json must match src/data/free-charity-resources.json');

const data = JSON.parse(srcRaw);
assert.equal(data.format, 'charitology-free-charity-resources-v1');
assert.ok(Array.isArray(data.items) && data.items.length >= 60, `Expected >= 60 verified programs, got ${data.items?.length}`);

const validTiers = new Set(['free', 'grant', 'discount']);
const seenIds = new Set();
for (const item of data.items) {
  assert.match(item.id, /^[a-z0-9-]+$/, `Invalid id ${item.id}`);
  assert.ok(!seenIds.has(item.id), `Duplicate id ${item.id}`);
  seenIds.add(item.id);
  assert.ok(item.name.trim().length > 0, `Empty name for ${item.id}`);
  assert.ok(item.category.trim().length > 0, `Empty category for ${item.id}`);
  assert.ok(validTiers.has(item.tier), `Invalid tier ${item.tier} for ${item.id}`);
  assert.ok(item.offer.trim().length > 15, `Too short offer for ${item.id}`);
  assert.ok(item.eligibility.trim().length > 10, `Too short eligibility for ${item.id}`);
  assert.match(item.url, /^https:\/\//, `Non-HTTPS URL for ${item.id}: ${item.url}`);
}

const html = readFileSync('dist/for-charities/free/index.html', 'utf8');
assert.ok(html.includes('data-free-directory'), 'Built /for-charities/free/ missing data-free-directory mount');
const cards = [...html.matchAll(/data-free-card="([^"]+)"/g)];
assert.equal(cards.length, data.items.length, `Expected ${data.items.length} rendered cards, got ${cards.length}`);
assert.ok(html.includes('Charity OS'), 'Built /for-charities/free/ missing Charity OS');
assert.ok(html.includes('Cloudflare Project Galileo'), 'Built /for-charities/free/ missing Cloudflare Project Galileo');
assert.ok(html.includes('OpenAI for Nonprofits'), 'Built /for-charities/free/ missing OpenAI for Nonprofits');
assert.ok(html.includes('Claude for Nonprofits'), 'Built /for-charities/free/ missing Claude for Nonprofits');

const sitemap = readBuiltSitemapSet('dist');
assert.ok(sitemap.locs.some((loc) => new URL(loc).pathname.endsWith('/for-charities/free/')), 'sitemap.xml missing /for-charities/free/');

const llms = readFileSync('dist/llms.txt', 'utf8');
assert.ok(llms.includes('/for-charities/free/'), 'llms.txt missing /for-charities/free/');

console.log(`✓ Free things for charities verified: ${data.items.length} source-verified programs rendered, synced JSON, sitemap, and /llms.txt.`);
