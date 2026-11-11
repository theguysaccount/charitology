// Verify the immutable Japanese NPO projection without network access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../public/data/charity-registry/japan-npo/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const asset = manifest.asset;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = readFileSync(new URL(asset.path, root));
assert.equal(archive.length, asset.bytes);
assert.equal(digest(archive), asset.sha256);
assert.ok(asset.decodedBytes <= 16_000_000);
const decoded = gunzipSync(archive, { maxOutputLength: asset.decodedBytes });
assert.equal(decoded.length, asset.decodedBytes);
assert.equal(digest(decoded), asset.decodedSha256);
const rows = JSON.parse(decoded);

function hasValidCorporateNumber(number) {
  if (!/^[1-9]\d{12}$/.test(number)) return false;
  const weighted = [...number.slice(1)].reverse().reduce((total, char, index) => total + Number(char) * (1 + index % 2), 0);
  return Number(number[0]) === 9 - weighted % 9;
}

const portal = new Set();
const numbers = new Map();
const names = new Map();
const financialNames = [];
const authorityCounts = Object.fromEntries(manifest.authorities.map(authority => [authority, 0]));
let dissolution = 0;
let formationDate = 0;
for (const [index, row] of rows.entries()) {
  assert.equal(row.length, manifest.fields.length);
  const [id, name, kana, authority, number, certificationDate, dissolutionRecorded, sourceRecord, finance] = row;
  assert.match(id, /^\d{9}$/);
  assert.ok(!portal.has(id));
  portal.add(id);
  assert.ok(typeof name === 'string' && name && !/\p{Cc}/u.test(name));
  assert.ok(kana === null || (typeof kana === 'string' && !/\p{Cc}/u.test(kana)));
  assert.ok(Object.hasOwn(authorityCounts, authority));
  authorityCounts[authority]++;
  assert.equal(sourceRecord, index + 1);
  assert.ok(number === null || hasValidCorporateNumber(number));
  if (number) numbers.set(number, (numbers.get(number) ?? 0) + 1);
  names.set(name, (names.get(name) ?? 0) + 1);
  if (certificationDate !== null) {
    assert.match(certificationDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(certificationDate).toISOString().slice(0, 10), certificationDate);
    formationDate++;
  }
  assert.equal(typeof dissolutionRecorded, 'boolean');
  dissolution += Number(dissolutionRecorded);
  if (finance !== null) {
    const [record, year, ...amounts] = finance;
    assert.equal(finance.length, manifest.financeFields.length);
    assert.equal(record, sourceRecord);
    assert.match(year, /^\d{4}$/);
    assert.ok(amounts.some(value => value !== null));
    assert.ok(amounts.every(value => value === null || /^-?\d{1,16}$/.test(value)));
    financialNames.push(name);
  }
}
assert.ok(financialNames.every(name => names.get(name) === 1));
assert.equal(financialNames.length, manifest.counts.financialSummaries);
assert.equal(dissolution, manifest.counts.withDissolutionInformation);
assert.equal(formationDate, manifest.counts.withCertificationDate);
assert.equal([...numbers.values()].reduce((a, b) => a + b, 0), manifest.counts.validCorporateNumberRows);
assert.equal([...numbers.values()].filter(count => count > 1).length, manifest.counts.repeatedCorporateNumbers);
assert.deepEqual(authorityCounts, manifest.counts.byAuthority);
assert.equal(rows.length, manifest.counts.portalRows);
assert.equal(rows.length, asset.rows);
console.log(`Japan NPO Portal: ${rows.length} unique portal IDs and ${financialNames.length} linked financial summaries passed.`);
