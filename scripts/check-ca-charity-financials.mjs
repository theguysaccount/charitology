import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../public/data/charity-financials/ca/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const cleanAccount = /^[0-9]{9}RR[0-9]{4}$/;
const money = /^-?[0-9]{1,18}(?:\.[0-9]{1,2})?$/;

function shard(asset, directory, key) {
  assert.equal(asset.path, `${directory}/${key}.json.gz`);
  const packed = readFileSync(new URL(asset.path, root));
  assert.equal(packed.length, asset.bytes);
  assert.equal(digest(packed), asset.sha256);
  assert.ok(asset.decodedBytes <= 16_000_000);
  const decoded = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
  assert.equal(decoded.length, asset.decodedBytes);
  assert.equal(digest(decoded), asset.decodedSha256);
  const rows = JSON.parse(decoded);
  assert.equal(rows.length, asset.rows);
  return rows;
}

assert.equal(manifest.format, 'charitology-ca-t3010-v1');
assert.equal(manifest.currency, 'CAD');
assert.deepEqual(manifest.periodFields, [
  'periodEnd', 'formVersion', 'financialSection', 'accountingBasis', 'financialSourceRecord',
  'identificationSourceRecord', 'totalRevenueCAD', 'totalExpendituresCAD', 'charitableProgramExpendituresCAD',
  'receivedFromRegisteredCharitiesCAD', 'giftsToQualifiedDoneesCAD', 'grantsToOtherGranteesCAD',
]);

const coordinates = Object.fromEntries(Object.keys(manifest.editions).map(year => [year, new Set()]));
const names = new Map();
let periods = 0, bothYears = 0;
for (const [key, asset] of Object.entries(manifest.names)) {
  assert.match(key, /^[a-z0-9_]$/);
  for (const row of shard(asset, 'names', key)) {
    assert.equal(row.length, 3);
    const [id, name, history] = row;
    assert.match(id, cleanAccount);
    assert.ok(!names.has(id));
    assert.ok(name && [...name].length <= 175 && !/\p{Cc}/u.test(name));
    const initial = name.normalize('NFKD').toLowerCase().match(/[\p{L}\p{N}]/u)?.[0];
    assert.ok(initial);
    assert.equal(/^[a-z0-9]$/.test(initial) ? initial : '_', key);
    names.set(id, key);
    assert.ok(history.length > 0);
    const years = new Set();
    let previous = '9999-12-31';
    for (const period of history) {
      assert.equal(period.length, manifest.periodFields.length);
      const [end, version, section, basis, source, identity, ...amounts] = period;
      assert.match(end, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(new Date(end).toISOString().slice(0, 10), end);
      assert.ok(end < previous);
      previous = end;
      const year = end.slice(0, 4);
      const edition = manifest.editions[year];
      assert.ok(edition);
      assert.match(version, /^\d+$/);
      assert.ok(['D', '6'].includes(section));
      assert.ok(['A', 'C', null].includes(basis));
      assert.ok(Number.isInteger(source) && source > 0 && source <= edition.financialPeriods && !coordinates[year].has(source));
      assert.ok(Number.isInteger(identity) && identity > 0 && identity <= edition.identityAccounts);
      assert.ok(amounts.every(amount => amount === null || (typeof amount === 'string' && money.test(amount))));
      coordinates[year].add(source);
      years.add(year);
      periods++;
    }
    if (years.size === 2) bothYears++;
  }
}
assert.equal(names.size, manifest.accounts);
assert.equal(periods, manifest.financialPeriods);
assert.equal(bothYears, manifest.multiYearAccounts);
for (const [year, edition] of Object.entries(manifest.editions)) {
  assert.equal(coordinates[year].size, edition.financialPeriods);
  for (const source of [edition.finance, edition.identification]) {
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(source.url).hostname, 'open.canada.ca');
    assert.ok(source.url.endsWith('/' + source.file));
  }
}

for (const [key, asset] of Object.entries(manifest.ids)) {
  assert.match(key, /^\d{2}$/);
  for (const row of shard(asset, 'ids', key)) {
    assert.equal(row.length, 2);
    const [id, nameBucket] = row;
    assert.equal(id.slice(7, 9), key);
    assert.equal(names.get(id), nameBucket);
    assert.ok(names.delete(id));
  }
}
assert.equal(names.size, 0);
console.log(`Canada charity filings: ${manifest.accounts} verified account pointers, ${periods} dated records and all shard fingerprints passed.`);
