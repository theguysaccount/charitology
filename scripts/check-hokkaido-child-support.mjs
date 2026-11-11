import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(read('../src/data/hokkaido-child-support.json'));
const built = '../dist/record/funding-flows/hokkaido-child-support/';
const root = new URL('../public/data/charity-registry/japan-npo/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const registry = JSON.parse(gunzipSync(readFileSync(new URL(manifest.asset.path, root))));
const counts = new Map();
for (const row of registry) if (row[4]) counts.set(row[4], (counts.get(row[4]) ?? 0) + 1);

assert.equal(data.awardStage, 'amount-at-selection');
assert.equal(data.currency, 'JPY');
assert.deepEqual(Object.keys(data.funding), ['2022', '2023']);
const { funding, need } = data;
const total = edition => edition.awards.reduce((sum, row) => sum + row.awardAtSelectionJPYThousands, 0);
assert.deepEqual(Object.values(funding).map(edition => [edition.awards.length, edition.selectionRowsListed, total(edition)]),
  [[7, 7, 13_954], [9, 9, 18_275]]);
assert.equal(funding['2022'].awards.filter(row => row.selection === null).length, 1);
assert.ok(funding['2023'].awards.every(row => row.selection?.number));
const joined = funding['2023'].awards.filter(row => row.recipientLabel.startsWith('NPO法人') && row.selection?.corporateNumber);
assert.equal(joined.length, 5);
assert.ok(joined.every(row => counts.get(row.selection.corporateNumber) === 1));
assert.equal(need.geography, 'Hokkaido excluding Sapporo');
assert.deepEqual([need.mailedQuestionnaires, need.receivedQuestionnaires, need.responseRatePercent], [4347, 1856, '42.7']);
assert.deepEqual(need.rows.map(row => [row.sampleSize, row.oftenPercent, row.sometimesPercent, row.rarelyPercent]),
  [[1441, '6.2', '12.5', '18.8'], [218, '5.0', '9.2', '11.9'], [120, '6.7', '11.7', '21.7'], [29, '3.4', '13.8', '10.3']]);
assert.equal(read(built + 'data.json'), JSON.stringify(data, null, 2) + '\n');
const csv = read(built + 'awards.csv');
assert.equal(csv.trimEnd().split('\n').length, 17);
assert.equal((csv.match(/amount-at-selection/g) ?? []).length, 16);
for (const [year, edition] of Object.entries(funding)) {
  const source = data.sources['awards' + year];
  for (const award of edition.awards) {
    const expected = `${award.category},${award.awardAtSelectionJPYThousands},${source.url},${award.awardTablePdfPage},${source.sha256}`;
    assert.ok(csv.includes(expected));
  }
}
const page = read(built + 'index.html');
for (const award of joined) assert.ok(page.includes('#corporate=' + award.selection.corporateNumber));
assert.ok(page.includes('Report an error'));
console.log('Hokkaido: 16 award rows, five registry joins, four independent need observations and exact JSON/CSV passed.');
