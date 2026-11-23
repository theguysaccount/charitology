import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'public/data/disaster-editions/fema-2024-2026');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
const edition = JSON.parse(fs.readFileSync(path.join(dataDir, 'edition.json'), 'utf8'));
const csvText = fs.readFileSync(path.join(dataDir, 'fema-2023-2026-summary.csv'), 'utf8');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

assert.equal(manifest.format, 'charitology-disaster-fema-manifest-v1');
assert.equal(edition.format, 'charitology-disaster-fema-edition-v2');
assert.equal(edition.disasters.length, 5);
assert.equal(manifest.counts.totalDisasters, 5);
assert.equal(manifest.counts.expansion2024to2026Disasters, 4);
assert.equal(manifest.counts.benchmark2023Disasters, 1);
assert.equal(manifest.counts.openWithoutCloseoutDate, 5);
assert.equal(manifest.counts.disastersWithNullHmgp, 2);

const edBytes = fs.readFileSync(path.join(dataDir, 'edition.json'));
const csvBytes = fs.readFileSync(path.join(dataDir, 'fema-2023-2026-summary.csv'));
assert.equal(edBytes.length, manifest.artifacts.editionJson.bytes);
assert.equal(sha256(edBytes), manifest.artifacts.editionJson.sha256);
assert.equal(csvBytes.length, manifest.artifacts.summaryCsv.bytes);
assert.equal(sha256(csvBytes), manifest.artifacts.summaryCsv.sha256);

const lines = csvText.trim().split('\n');
assert.equal(lines.length, 6, 'CSV should have header + 5 disaster rows');

// Verify null preservation (never coerced to 0) on recent October 2026 declarations
for (const femaId of ['DR-4946-GU', 'DR-4955-FL']) {
  const row = edition.disasters.find((d) => d.femaId === femaId);
  assert.ok(row, `Missing ${femaId}`);
  assert.equal(row.financialsUsd.hmgpObligatedUsd, null, `${femaId} HMGP must remain null`);
  assert.equal(row.closeoutDate, null, `${femaId} closeoutDate must remain null`);
}

// Verify Helene (2024) and LA Wildfires (2025) exact open federal totals
const helene = edition.disasters.find((d) => d.femaId === 'DR-4827-NC');
assert.ok(helene && helene.designatedAreaCount === 40 && helene.financialsUsd.iaHouseholdsApproved === 161046);
const la = edition.disasters.find((d) => d.femaId === 'DR-4856-CA');
assert.ok(la && la.designatedAreaCount === 1 && la.financialsUsd.iaHouseholdsApproved === 35172);

// Verify built page exists and carries key records when dist/ is present
const builtHtmlPath = path.join(root, 'dist/disasters/2024-2026-emergencies/index.html');
if (fs.existsSync(builtHtmlPath)) {
  const html = fs.readFileSync(builtHtmlPath, 'utf8');
  for (const token of ['DR-4827-NC', 'DR-4856-CA', 'DR-4946-GU', 'DR-4955-FL', 'DR-4724-HI', 'OpenFEMA']) {
    assert.ok(html.includes(token), `Built 2024-2026 emergencies page missing ${token}`);
  }
}

console.log('✓ OpenFEMA 2023–2026 Disaster Desk edition verified: 5 major disasters (4 new 2024–2026 + 1 2023 Maui benchmark), SHA-256 manifests exact, null HMGP & closeout fields preserved.');
