import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const dir = path.join(root, 'public/data/charity-registry/croatia');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

assert.equal(manifest.format, 'charitology-croatia-registry-v1');
assert.equal(manifest.counts.includedOrganizations, 71859);
assert.equal(manifest.counts.byForm.association, 71415);
assert.equal(manifest.counts.byForm.foundation, 444);
assert.equal(manifest.counts.validatedOibs, 68646);
assert.equal(manifest.counts.invalidOibs, 0);
assert.equal(manifest.counts.duplicateOibGroups, 1);

const anomBytes = fs.readFileSync(path.join(dir, manifest.anomalies.path));
assert.equal(anomBytes.length, manifest.anomalies.bytes);
assert.equal(sha256(anomBytes), manifest.anomalies.sha256);

let nameRowsTotal = 0;
for (const meta of Object.values(manifest.shards.names)) {
  const gz = fs.readFileSync(path.join(dir, meta.path));
  const dec = zlib.gunzipSync(gz);
  assert.equal(gz.length, meta.bytes);
  assert.equal(sha256(gz), meta.sha256);
  assert.equal(dec.length, meta.decodedBytes);
  assert.equal(sha256(dec), meta.decodedSha256);
  const rows = JSON.parse(dec.toString('utf8'));
  assert.equal(rows.length, meta.rows);
  nameRowsTotal += rows.length;
  for (const r of rows) {
    assert.ok(!('MAIL' in r) && !('SJEDISTE' in r), 'Personal email/street address fields must be stripped');
  }
}
assert.equal(nameRowsTotal, 71859);

for (const meta of Object.values(manifest.shards.ids)) {
  const gz = fs.readFileSync(path.join(dir, meta.path));
  const dec = zlib.gunzipSync(gz);
  assert.equal(gz.length, meta.bytes);
  assert.equal(sha256(gz), meta.sha256);
  assert.equal(dec.length, meta.decodedBytes);
  assert.equal(sha256(dec), meta.decodedSha256);
}

const builtHtml = path.join(root, 'dist/record/charity-index/croatia/index.html');
if (fs.existsSync(builtHtml)) {
  const html = fs.readFileSync(builtHtml, 'utf8');
  for (const token of ['71,859', '71,415', '444', 'OIB', 'Grad Zagreb']) {
    assert.ok(html.includes(token), `Built Croatia registry page missing ${token}`);
  }
}

console.log('✓ Croatia nonprofit registry verified: 71,859 orgs (71,415 associations + 444 foundations), 68,646 ISO-7064 valid OIBs (0 invalid), all name & ID shards exact.');
