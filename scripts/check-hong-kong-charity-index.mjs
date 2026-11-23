import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const regDir = 'public/data/charity-registry/hong-kong';
const manifest = JSON.parse(readFileSync(`${regDir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-hong-kong-registry-v1');
assert.equal(manifest.asOf, '2026-10-31');
assert.equal(manifest.counts.sourceRows, 17614);
assert.equal(manifest.counts.subsidiaryRows, 6475);
assert.equal(manifest.counts.includedOrganizations, 11138);

const art = manifest.artifacts.charities;
const gz = readFileSync(`${regDir}/${art.path}`);
assert.equal(gz.length, art.bytes);
assert.equal(sha256(gz), art.sha256);
const raw = gunzipSync(gz);
assert.equal(raw.length, art.decodedBytes);
assert.equal(sha256(raw), art.decodedSha256);

const rows = JSON.parse(raw.toString('utf8'));
assert.equal(rows.length, 11138);
for (const r of rows) {
  assert.ok(r.en.trim().length > 0 || r.zh.trim().length > 0, 'Empty both EN and ZH name');
  assert.match(r.effectiveDate, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, `Invalid effective date ${r.effectiveDate}`);
}

const csvBuf = readFileSync(`${regDir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.equal(csvBuf.toString('utf8').trim().split('\n').length, 11139);

const regHtml = readFileSync('dist/record/charity-index/hong-kong/index.html', 'utf8');
assert.ok(regHtml.includes('11,138'), 'Hong Kong registry page missing 11,138 count');
assert.ok(regHtml.includes('data-hong-kong-registry'), 'Hong Kong registry page missing mount');
assert.ok(regHtml.includes('data-site-symbol="bauhinia"'), 'Hong Kong registry page missing bauhinia symbol');

const coverageHtml = readFileSync('dist/record/charity-index/coverage/index.html', 'utf8');
assert.ok(coverageHtml.includes('id="hong-kong"'), 'Coverage page missing Hong Kong card');

console.log(
  `Hong Kong release verified: ${rows.length} distinct Section 88 charities (collapsed from ${manifest.counts.sourceRows} IRD rows incl. ${manifest.counts.subsidiaryRows} subsidiaries, as at ${manifest.asOf}) and matching built pages.`,
);
