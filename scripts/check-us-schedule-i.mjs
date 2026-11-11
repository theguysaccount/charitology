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
