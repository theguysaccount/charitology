import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();

const bundle = await build({
  stdin: {
    contents: `
      export { csvCell, toCsv } from './src/lib/client/files.ts';
      export { financialCsvName } from './src/lib/client/financial-directory.ts';
      export { giftsToCsv, giftsToJson, parseGiftFile } from './src/lib/client/gifts.ts';
    `,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});

const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

// 1. RFC 4180 CSV quoting including \r, \n, quotes, commas, and UTF-8 scripts
assert.equal(mod.csvCell('plain'), 'plain');
assert.equal(mod.csvCell('a,b'), '"a,b"');
assert.equal(mod.csvCell('say "hi"'), '"say ""hi"""');
assert.equal(mod.csvCell('line1\nline2'), '"line1\nline2"');
assert.equal(mod.csvCell('line1\r\nline2'), '"line1\r\nline2"');
assert.equal(mod.csvCell('bare\rcarriage'), '"bare\rcarriage"');
assert.equal(mod.csvCell(null), '');
assert.equal(mod.csvCell(undefined), '');

const utf8Csv = mod.toCsv([
  {
    hr: 'Hrvatski Crveni križ — Đakovo',
    hu: 'Őrségi Alapítvány — Űrkutatás',
    hk: '香港公益金 / 樂施會',
    se: 'Läkare Utan Gränser · ÅÄÖ',
    note: 'Multi\r\nline "quoted", note',
  },
]);
assert.ok(utf8Csv.includes('Hrvatski Crveni križ — Đakovo'));
assert.ok(utf8Csv.includes('Őrségi Alapítvány — Űrkutatás'));
assert.ok(utf8Csv.includes('香港公益金 / 樂施會'));
assert.ok(utf8Csv.includes('Läkare Utan Gränser · ÅÄÖ'));
assert.ok(utf8Csv.includes('"Multi\r\nline ""quoted"", note"'));

// 2. Formula-injection neutralization for spreadsheet exports
for (const payload of ['=SUM(A1:A2)', '+1+1', '-2+3', '@HYPERLINK("x")', '  =CMD()', '\t=1', '\r=1', '\n=1']) {
  assert.equal(mod.financialCsvName(payload), `'${payload}`, `Must neutralize formula prefix: ${JSON.stringify(payload)}`);
}
assert.equal(mod.financialCsvName('Oxfam Hong Kong 樂施會'), 'Oxfam Hong Kong 樂施會');

// 3. Donor Giving Dashboard CSV/JSON UTF-8 & null-depth round-trip
const donorGifts = [
  {
    id: 'utf8-1',
    date: '2026-11-23',
    organization: 'Hrvatski Crveni križ & 樂施會',
    amount: 125.5,
    cause: 'global-health',
    depth: 0,
    note: 'Relief note, with "quotes" and diacritics: őűčćšžđ',
  },
  {
    id: 'utf8-2',
    date: '2026-10-15',
    organization: 'Läkare Utan Gränser',
    amount: 250,
    cause: 'other',
    depth: null,
  },
];
const csvRoundTrip = mod.parseGiftFile('\uFEFF' + mod.giftsToCsv(donorGifts), 'gifts.csv');
assert.equal(csvRoundTrip.skipped, 0);
assert.deepEqual(csvRoundTrip.gifts, donorGifts);

const jsonRoundTrip = mod.parseGiftFile(mod.giftsToJson(donorGifts), 'gifts.json');
assert.equal(jsonRoundTrip.skipped, 0);
assert.deepEqual(jsonRoundTrip.gifts, donorGifts);

// 4. Verify all recent Wave 5–10 registry/flow/disaster CSV exports emit UTF-8 BOM and formula protection
for (const rel of [
  'src/pages/record/charity-index/denmark.astro',
  'src/pages/record/charity-index/sweden.astro',
  'src/pages/record/charity-index/hungary.astro',
  'src/pages/record/charity-index/hong-kong.astro',
  'src/pages/record/charity-index/croatia.astro',
  'src/pages/record/charity-index/italy.astro',
  'src/pages/record/funding-flows/hong-kong-fundraising-permits/index.astro',
  'src/pages/record/funding-flows/italy-five-per-mille/index.astro',
  'src/pages/disasters/2024-2026-emergencies.astro',
]) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.ok(src.includes("'\\uFEFF' + "), `${rel} CSV download should include UTF-8 BOM for spreadsheet diacritic/CJK fidelity`);
  assert.ok(src.includes('financialCsvName('), `${rel} CSV download should neutralize formula prefixes via financialCsvName()`);
}

console.log('✓ Export integrity verified: RFC-4180 CRLF quoting, formula neutralization, UTF-8 donor round-trips, and Wave 5–10 BOM/formula guards.');
