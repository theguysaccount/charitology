import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const dir = new URL('../public/data/charity-registry/new-zealand/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const raw = readFileSync(new URL(manifest.asset.path, dir));
const body = gunzipSync(raw);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(raw.length, manifest.asset.bytes);
assert.equal(body.length, manifest.asset.decodedBytes);
assert.equal(hash(raw), manifest.asset.sha256);
assert.equal(hash(body), manifest.asset.decodedSha256);
const records = JSON.parse(body);
assert.equal(records.length, 46174);
assert.equal(records.length, manifest.asset.rows);
assert.equal(records.length + Object.values(manifest.registry.excluded).reduce((a,b) => a+b), manifest.registry.sourceRows);
assert.equal(new Set(records.map(row => row[0])).size, records.length);
const duplicates = new Set(records.map(row => row[1]));
assert.equal(duplicates.size, records.length);
assert.equal(records.filter(row => row[7].length).length, manifest.registry.withFinancialHistory);
assert.equal(records.filter(row => new Set(row[7].map(filing => filing[1].slice(0,4))).size === 2).length, 8547);
const periods = [];
for (const [id, number, name, status, registered, deregistered, group, filings] of records) {
  assert.ok(Number.isSafeInteger(id) && /^CC[0-9]{5}$/.test(number) && typeof name === 'string' && name);
  assert.ok([null, 'Registered', 'Deregistered', 'Removed'].includes(status));
  assert.ok([registered, deregistered].every(value => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value)));
  assert.ok(group === null || Number.isSafeInteger(group));
  assert.equal(new Set(filings.map(row => row[1])).size, filings.length);
  for (const filing of filings) {
    const [returnId, end, sourceStatus, suppliedCurrency, currency, basis, income, expenditure] = filing;
    assert.ok([returnId, income, expenditure].every(Number.isSafeInteger));
    assert.ok(/^202[45]-\d{2}-\d{2}$/.test(end) && sourceStatus === manifest.selectedReturnStatus);
    assert.equal(currency, suppliedCurrency ?? 'NZD');
    assert.equal(basis, suppliedCurrency ? 'reported' : 'tier-3-standard');
    periods.push(filing);
  }
}
assert.equal(new Set(periods.map(row => row[0])).size, periods.length);
assert.equal(periods.length, 20068);
for (const [year, edition] of Object.entries(manifest.editions)) {
  assert.equal(periods.filter(row => row[1].startsWith(year)).length, edition.includedReturns);
  assert.equal(edition.includedReturns + Object.values(edition.excluded).reduce((a,b) => a+b), edition.sourceReturns);
}
const sample = records.find(row => row[1] === 'CC48103');
assert.deepEqual(sample[7].map(row => [row[0],row[1],row[6],row[7]]),
  [[418054,'2025-03-31',491677,475953],[395917,'2024-03-31',538393,495846]]);
const page = readFileSync(new URL('../dist/record/charity-index/new-zealand/index.html', import.meta.url), 'utf8');
assert.ok(page.includes('Report an error') && page.includes('20,068 individual Tier 3 returns'));
console.log('New Zealand: 46,174 organization entries, 20,068 dated Tier 3 returns, exact asset fingerprints and filing coverage passed.');
