import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../public/data/funding-flows/ca-qualified-donees/', import.meta.url);
const financeRoot = new URL('../public/data/charity-financials/ca/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const financeManifest = JSON.parse(readFileSync(new URL('manifest.json', financeRoot), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const accountPattern = /^\d{9}RR\d{4}$/;
const moneyPattern = /^\d{1,18}(?:\.\d{1,2})?$/;

function cents(value) {
  assert.match(value, moneyPattern);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function readShard(asset, year, direction, key) {
  assert.equal(asset.path, `${year}/${direction}/${key}.json.gz`);
  const packed = readFileSync(new URL(asset.path, root));
  assert.equal(packed.length, asset.bytes);
  assert.equal(sha256(packed), asset.sha256);
  assert.ok(asset.decodedBytes <= 16_000_000);
  const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
  assert.equal(raw.length, asset.decodedBytes);
  assert.equal(sha256(raw), asset.decodedSha256);
  const payload = JSON.parse(raw);
  assert.deepEqual(Object.keys(payload), ['identities', 'gifts']);
  assert.equal(payload.gifts.length, asset.rows);
  return payload;
}

const returns = new Map();
for (const asset of Object.values(financeManifest.names)) {
  const bytes = readFileSync(new URL(asset.path, financeRoot));
  for (const [account, , periods] of JSON.parse(gunzipSync(bytes))) {
    for (const [end, version, , , record] of periods) {
      returns.set(`${account}/${end}`, `${version}/${record}`);
    }
  }
}

assert.equal(manifest.format, 'charitology-ca-t1236-v1');
assert.equal(manifest.currency, 'CAD');
assert.deepEqual(manifest.rowFields, ['filerAccount', 'recipientAccount', 'filerPeriodEnd', 'formVersion', 'worksheetRecord',
  'worksheetSequence', 'filerFinancialRecord', 'totalGiftCAD', 'giftInKindCAD']);
assert.deepEqual(Object.keys(manifest.editions), ['2023', '2024']);
let totalRows = 0;

for (const [year, edition] of Object.entries(manifest.editions)) {
  assert.deepEqual(edition.sources.finance, financeManifest.editions[year].finance);
  assert.deepEqual(edition.sources.identification, financeManifest.editions[year].identification);
  assert.match(edition.sources.gifts.sha256, /^[0-9a-f]{64}$/);
  assert.equal(new URL(edition.sources.gifts.url).hostname, 'open.canada.ca');
  const { counts, worksheetComparison: comparison } = edition;
  assert.equal(counts.includedRows + Object.values(counts.excluded).reduce((sum, value) => sum + value, 0), counts.sourceRows);
  const { returnsWithMatchedWorksheetRows, ...comparisonCounts } = comparison;
  assert.equal(Object.values(comparisonCounts).reduce((sum, value) => sum + value, 0), returnsWithMatchedWorksheetRows);
  const records = new Map();
  const names = new Map();
  const filers = new Set(), recipients = new Set();
  for (const [key, asset] of Object.entries(edition.indexes.given)) {
    assert.match(key, /^\d{2}$/);
    const payload = readShard(asset, year, 'given', key);
    const used = new Set(), pairs = new Set();
    for (const row of payload.gifts) {
      assert.equal(row.length, manifest.rowFields.length);
      const [filer, recipient, end, version, record, sequence, financeRecord, total, inKind] = row;
      assert.match(filer, accountPattern);
      assert.match(recipient, accountPattern);
      assert.notEqual(filer, recipient);
      assert.equal(filer.slice(7, 9), key);
      assert.equal(end.slice(0, 4), year);
      assert.equal(returns.get(`${filer}/${end}`), `${version}/${financeRecord}`);
      assert.ok(Number.isInteger(record) && record > 0 && record <= counts.sourceRows && !records.has(record));
      assert.match(sequence, /^\d+$/);
      const totalCents = cents(total);
      assert.ok(totalCents > 0n && (inKind === null || cents(inKind) <= totalCents));
      const pair = `${filer}/${end}/${recipient}`;
      assert.ok(!pairs.has(pair));
      pairs.add(pair);
      records.set(record, JSON.stringify(row));
      filers.add(filer);
      recipients.add(recipient);
      used.add(filer);
      used.add(recipient);
    }
    assert.equal(used.size, Object.keys(payload.identities).length);
    for (const id of used) {
      const name = payload.identities[id];
      assert.ok(typeof name === 'string' && name && !/\p{Cc}/u.test(name));
      if (names.has(id)) assert.equal(names.get(id), name);
      names.set(id, name);
    }
  }
  assert.equal(records.size, counts.includedRows);
  assert.equal(filers.size, counts.includedFilerAccounts);
  assert.equal(recipients.size, counts.includedRecipientAccounts);
  for (const [key, asset] of Object.entries(edition.indexes.received)) {
    assert.match(key, /^\d{2}$/);
    const payload = readShard(asset, year, 'received', key);
    const used = new Set();
    for (const row of payload.gifts) {
      assert.equal(row[1].slice(7, 9), key);
      assert.equal(records.get(row[4]), JSON.stringify(row));
      assert.ok(records.delete(row[4]));
      used.add(row[0]);
      used.add(row[1]);
    }
    assert.equal(used.size, Object.keys(payload.identities).length);
    for (const id of used) assert.equal(payload.identities[id], names.get(id));
  }
  assert.equal(records.size, 0);
  totalRows += counts.includedRows;
}
assert.equal(totalRows, manifest.includedRows);
console.log(`Canada T1236: ${totalRows} unique worksheet records, exact finance references and equivalent giver and recipient indexes passed.`);
