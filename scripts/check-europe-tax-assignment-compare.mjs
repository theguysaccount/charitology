import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const dir = 'public/data/funding-flows/europe-tax-assignment-compare';
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));

assert.equal(manifest.format, 'charitology-europe-tax-assignment-compare-manifest-v1');
assert.equal(manifest.countryCount, 5);
assert.deepEqual(manifest.countries, ['Italy', 'Poland', 'Slovakia', 'Hungary', 'Slovenia']);

// Verify every referenced national manifest hash matches disk verbatim
for (const src of manifest.sourceManifests) {
  const buf = readFileSync(src.path);
  assert.equal(buf.length, src.bytes, `Source manifest length drift: ${src.path}`);
  assert.equal(sha256(buf), src.sha256, `Source manifest SHA-256 drift: ${src.path}`);
}

const compBuf = readFileSync(`${dir}/${manifest.artifacts.comparison.path}`);
assert.equal(compBuf.length, manifest.artifacts.comparison.bytes);
assert.equal(sha256(compBuf), manifest.artifacts.comparison.sha256);
const comp = JSON.parse(compBuf.toString('utf8'));
assert.equal(comp.systems.length, 5);
assert.equal(comp.policyShocks.length, 2);

const byId = new Map(comp.systems.map((s) => [s.id, s]));
assert.equal(byId.get('poland')?.top10SharePct, 45.69);
assert.equal(byId.get('slovenia')?.top10SharePct, 29.13);
assert.equal(byId.get('italy')?.top10SharePct, 28.76);
assert.equal(byId.get('slovakia')?.top10SharePct, 19);
assert.equal(byId.get('hungary')?.top10SharePct, 15.04);

const csvBuf = readFileSync(`${dir}/${manifest.artifacts.csv.path}`);
assert.equal(csvBuf.length, manifest.artifacts.csv.bytes);
assert.equal(sha256(csvBuf), manifest.artifacts.csv.sha256);
assert.ok(csvBuf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'CSV missing UTF-8 BOM');

const html = readFileSync('dist/record/funding-flows/europe-tax-assignment-compare/index.html', 'utf8');
assert.ok(html.includes('data-eu-tax-compare'), 'Observatory page missing mount');
assert.ok(html.includes('45.69%'), 'Observatory page missing Poland Top-10 share');
assert.ok(html.includes('15.04%'), 'Observatory page missing Hungary Top-10 share');
assert.ok(html.includes('data-site-symbol="euroCompare"'), 'Observatory page missing euroCompare symbol');

console.log(
  `European Tax-Assignment Observatory verified: 5 countries (Poland 45.69% → Hungary 15.04% Top-10 concentration), all 5 pinned national manifests matched, and built page verified.`,
);
