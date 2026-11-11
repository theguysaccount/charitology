import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../public/data/funding-flows/us-schedule-i/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
const { asset, counts } = manifest;
assert.equal(manifest.format, 'charitology-us-schedule-i-v1');
assert.equal(manifest.currency, 'USD');
assert.equal(manifest.source.archive, 'https://apps.irs.gov/pub/epostcard/990/xml/2024/2024_TEOS_XML_01A.zip');
assert.equal(manifest.source.sha256, '40b0aab9a3ae153a1d5945d9bd23e7414bdcf3b6b66819fd64819665701191d1');
assert.deepEqual(manifest.filingFields, ['filerEin', 'taxPeriodStart', 'taxPeriodEnd', 'filingObjectId', 'grants']);
assert.deepEqual(manifest.grantFields, ['recipientEin', 'partIIRow', 'cashGrantUSD', 'nonCashAssistanceUSD']);
assert.equal(manifest.registry.manifestSha256, hash(readFileSync(new URL('../public/data/irs-registry/manifest.json', import.meta.url))));
assert.deepEqual(counts, { competingFilingRows: 26, filerOrPeriodOutOfScope: 360, form990: 9682,
  includedFilings: 755, includedRecipientEINs: 5572, includedRows: 5916, noPositiveAmountRows: 9,
  partIIOrganizationRows: 9573, repeatedRecipientRows: 362, unresolvedOrSelfRecipient: 2900, xmlMembers: 17246 });
assert.equal(counts.partIIOrganizationRows, counts.includedRows + counts.competingFilingRows + counts.filerOrPeriodOutOfScope
  + counts.noPositiveAmountRows + counts.repeatedRecipientRows + counts.unresolvedOrSelfRecipient);
assert.equal(asset.path, 'filings.json.gz');
const packed = readFileSync(new URL(asset.path, root));
assert.equal(packed.length, asset.bytes);
assert.equal(hash(packed), asset.sha256);
assert.ok(asset.decodedBytes > 0 && asset.decodedBytes < 16_000_000);
const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
assert.equal(raw.length, asset.decodedBytes);
assert.equal(hash(raw), asset.decodedSha256);

const { filings, filingSha256 } = JSON.parse(raw);
assert.equal(filings.length, asset.rows);
assert.equal(filings.length, counts.includedFilings);
assert.equal(Object.keys(filingSha256).length, filings.length);
const filerPeriods = new Set();
const objects = new Set();
const recipientEins = new Set();
let rows = 0;
for (const filing of filings) {
  assert.equal(filing.length, 5);
  const [filer, start, end, objectId, grants] = filing;
  assert.match(filer, /^\d{9}$/);
  assert.match(start, /^20\d\d-\d\d-\d\d$/);
  assert.match(end, /^202[23]-\d\d-\d\d$/);
  assert.ok(start <= end && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)));
  assert.match(objectId, /^\d{18}$/);
  assert.ok(isHash(filingSha256[objectId]) && !objects.has(objectId));
  objects.add(objectId);
  const key = `${filer}:${end}`;
  assert.ok(!filerPeriods.has(key));
  filerPeriods.add(key);
  const recipients = new Set();
  let previous = 0;
  assert.ok(Array.isArray(grants) && grants.length > 0);
  for (const grant of grants) {
    assert.equal(grant.length, 4);
    const [recipient, row, cash, noncash] = grant;
    assert.match(recipient, /^\d{9}$/);
    assert.ok(recipient !== filer && !recipients.has(recipient));
    recipients.add(recipient);
    recipientEins.add(recipient);
    assert.ok(Number.isSafeInteger(row) && row > previous);
    previous = row;
    for (const amount of [cash, noncash]) assert.ok(amount === null || (Number.isSafeInteger(amount) && amount >= 0));
    assert.ok(cash > 0 || noncash > 0);
    rows++;
  }
}
assert.equal(rows, counts.includedRows);
assert.equal(recipientEins.size, counts.includedRecipientEINs);
console.log(`IRS Schedule I snapshot verified: ${rows} rows from ${filings.length} filing objects.`);

const contextBytes = readFileSync(new URL('filing-context.json', root));
assert.equal(hash(contextBytes), 'cabe5e22b0c8108d53c4258c309b6ca467ad3456132a8ef178460a804caf2043');
const context = JSON.parse(contextBytes);
assert.equal(context.initialEditionSha256, asset.sha256);
assert.deepEqual(Object.keys(context.indexes), ['2022', '2023', '2024', '2025', '2026']);
assert.ok(Object.values(context.indexes).every(source => isHash(source.sha256) && /^https:\/\/apps\.irs\.gov\//.test(source.url)));
const byObject = new Map(filings.map(filing => [filing[3], filing]));
const alternatives = new Set();
let excluded = 0;
let different = 0;
for (const observed of context.filings) {
  const filing = byObject.get(observed.filingObjectId);
  assert.ok(filing);
  assert.deepEqual([observed.filerEin, observed.taxPeriodStart, observed.taxPeriodEnd, observed.rowsInInitialEdition],
    [filing[0], filing[1], filing[2], filing[4].length]);
  assert.ok(observed.alternatives.length > 0);
  excluded += observed.rowsInInitialEdition;
  for (const alternate of observed.alternatives) {
    assert.match(alternate.filingObjectId, /^\d{18}$/);
    assert.ok(!alternatives.has(alternate.filingObjectId) && !byObject.has(alternate.filingObjectId));
    assert.ok(alternate.member.endsWith('/' + alternate.filingObjectId + '_public.xml') || alternate.member === alternate.filingObjectId + '_public.xml');
    assert.ok(isHash(alternate.filingSha256) && Object.hasOwn(context.searchedArchives, alternate.archive));
    assert.match(alternate.archive, /^https:\/\/apps\.irs\.gov\/pub\/epostcard\/990\/xml\/20\d\d\/[A-Z0-9_]+\.zip$/);
    assert.equal(typeof alternate.amendedFlagPresent, 'boolean');
    assert.equal(typeof alternate.sameRecordedPartIIAmountsAndRecipientIdentifiers, 'boolean');
    alternatives.add(alternate.filingObjectId);
    different += Number(!alternate.sameRecordedPartIIAmountsAndRecipientIdentifiers);
  }
}
assert.deepEqual(context.counts, { initialEditionFilings: filings.length, filingsWithAnotherVersion: context.filings.length,
  rowsFromFilingsWithAnotherVersion: excluded, alternateFilingObjects: alternatives.size, alternateObjectsWithDifferentRecordedPartII: different });
assert.deepEqual([context.filings.length, alternatives.size, excluded, different], [31, 32, 262, 7]);
assert.equal(new Set(context.filings.map(row => row.filingObjectId)).size, context.filings.length);
console.log('IRS filing version context verified: 32 other objects linked to 31 initial filings and 262 scoped rows.');
