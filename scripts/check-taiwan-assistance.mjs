import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseCsv } from '../src/lib/client/csv.ts';

const assets = 'data/funding-flows/taiwan-municipal-assistance';
const source = 'public/' + assets;
const route = '/record/funding-flows/taiwan-municipal-assistance/';
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const read = name => readFileSync(source + '/' + name);
const edition = JSON.parse(read('edition.json'));
const evidence = JSON.parse(readFileSync('src/data/taiwan-assistance-evidence.json'));
const csvs = new Map([
  ['awards.csv', edition.awards],
  ['municipal-audit.csv', edition.audit.rows],
  ['survey.csv', edition.survey.rows],
  ['government-draft.csv', edition.governmentDraft.rows],
]);

assert.equal(edition.format, 'charitology-taiwan-municipal-assistance-v1');
assert.equal(edition.currency, 'TWD');
assert.deepEqual(readdirSync(source).sort(), [...csvs.keys(), 'edition.json'].sort());
for (const name of [...csvs.keys(), 'edition.json']) {
  assert.deepEqual(readFileSync('dist/' + assets + '/' + name), read(name), name);
}
for (const [name, records] of csvs) {
  const [columns, ...actual] = parseCsv(read(name).toString('utf8'));
  assert.deepEqual(columns, Object.keys(records[0]), name);
  const fields = records.map(row => columns.map(key => Array.isArray(row[key]) ? row[key].join('|') : String(row[key] ?? '')));
  assert.deepEqual(actual, fields, name);
  for (const row of actual) for (const value of row) assert.doesNotMatch(value, /^\s*[=+@-]/, name);
}

const pins = readFileSync('src/data/taiwan-assistance-inputs.tsv', 'utf8').trimEnd().split('\n').slice(1).map(line => {
  const [filename, sha256, bytes, url, encoding, records, selected] = line.split('\t');
  return { filename, sha256, bytes: Number(bytes), url, encoding, records: Number(records), selected: Number(selected) };
});
assert.deepEqual(edition.grantSources, pins);
const byKey = new Map(edition.awards.map(row => [row.key, row]));
assert.equal(byKey.size, 87);
assert.equal(byKey.size, edition.awards.length);
const coords = new Set();
for (const pin of edition.grantSources) {
  const rows = edition.awards.filter(row => row.sourceFile === pin.filename);
  assert.equal(rows.length, pin.selected, pin.filename);
  for (const row of rows) {
    const coord = row.sourceFile + ':' + row.sourceRecord;
    assert.ok(!coords.has(coord), coord);
    coords.add(coord);
    assert.ok(Number.isInteger(row.sourceRecord) && row.sourceRecord > 0 && row.sourceRecord <= pin.records);
    assert.equal(row.sourceUrl, pin.url);
    assert.equal(row.year, Number(pin.filename.slice(0, 4)));
    assert.equal(row.quarter, Number(pin.filename[5]));
    assert.ok(row.title.includes('特殊境遇') && row.title.includes('設籍前'));
    assert.ok(Number.isInteger(row.grantTwd) && row.grantTwd > 0);
    assert.equal(new Date(row.approvalDate).toISOString().slice(0, 10), row.approvalDate);
    if (row.projectId) {
      assert.equal(Number(row.projectId.slice(0, 3)) + 1911, row.year);
      assert.ok(row.title.normalize('NFKC').includes(row.projectId));
    }
  }
}
assert.deepEqual(edition.awards.filter(row => row.projectId === null).map(row => row.key), ['2020q4-2', '2026q2-52']);
assert.deepEqual(edition.comparison.map(row => [row.year, row.throughQuarter, row.disclosedGrantRecords, row.disclosedGrantTwd, row.draftSubsidyTwd, row.differenceTwd]), [
  [2020, 4, 12, 3_022_017, 3_022_017, 0], [2021, 4, 13, 3_538_024, 3_538_024, 0],
  [2022, 4, 12, 5_139_912, 5_139_912, 0], [2023, 4, 13, 4_218_817, 4_218_817, 0],
  [2024, 4, 12, 3_364_255, 3_364_255, 0], [2025, 4, 13, 3_286_067, 2_411_383, 874_684],
  [2026, 2, 12, 2_173_741, null, null],
]);
assert.equal(edition.comparison[0].disclosedGrantTwd - byKey.get('2020q4-2').grantTwd, 2_864_104);
assert.deepEqual(edition.audit.rows.filter(row => row.executionTwd === null).map(row => [row.municipality, row.year, row.approvedTwd, row.executionPercent]), [
  ['Chiayi City', 2022, 71_459, null], ['Kinmen County', 2020, null, null], ['Kinmen County', 2021, 218_090, null],
]);
const auditProjection = edition.audit.rows.map(({ matchingAwardKeys, sourceUrl, printedPage, table, ...original }) => original);
assert.deepEqual(auditProjection, evidence.audit.rows);
assert.equal(edition.audit.crossCheck.count, 16);
for (const row of edition.audit.rows) {
  const matches = row.matchingAwardKeys.map(key => byKey.get(key));
  assert.ok(matches.every(award => award && award.year === row.year && (row.municipality === 'Total' || award.municipality === row.municipality)));
  assert.equal(matches.reduce((sum, award) => sum + award.grantTwd, 0), row.approvedTwd ?? 0);
}
assert.deepEqual(edition.audit.rows.find(row => row.year === 2021 && row.municipality === 'Nantou County').matchingAwardKeys, ['110HC218', '110HC227']);
const selected = edition.survey.rows.slice(1).map(row => {
  const awards = edition.awards.filter(award => award.year === row.year && award.municipality === row.municipality);
  return [row.municipality, row.weightedCount, row.anyDifficultyPercent, awards.map(award => [award.key, award.grantTwd])];
});
assert.deepEqual(selected, [
  ['New Taipei City', 751, '23.1', [['112AC213', 664_080]]],
  ['Taoyuan City', 415, '23.2', [['112CC214', 720_984]]],
  ['Kaohsiung City', 265, '26.9', [['1125C222', 856_699]]],
]);
assert.deepEqual(edition.survey.rows.map(({ year, sourceUrl, pdfPage, printedPage, table, ...row }) => row), evidence.survey.rows);
assert.deepEqual(edition.governmentDraft.rows.map(({ sourceUrl, pdfPage, printedPage, table, draft, ...row }) => row), evidence.governmentDraft.rows);

const page = path => readFileSync('dist' + path + 'index.html', 'utf8');
const html = page(route);
assert.equal((html.match(/ data-key="/g) ?? []).length, 87);
assert.equal((html.match(/ data-annual-year="/g) ?? []).length, 7);
assert.equal((html.match(/ data-survey-area="/g) ?? []).length, 4);
for (const row of edition.awards) assert.ok(html.includes(`id="award-${row.key}"`), row.key);
for (const name of [...csvs.keys(), 'edition.json']) assert.ok(html.includes(`href="${base}/${assets}/${name}" download`), name);
assert.ok(html.includes('NT$874,684') && html.includes('NT$157,913'));
assert.ok(html.includes('github.com/theguysaccount/charitology/issues/new'));
for (const inbound of ['/record/funding-flows/', '/record/charity-index/coverage/', '/record/charity-index/taiwan/',
  '/record/funding-flows/taiwan-new-resident-fund/', '/record/gap-map/']) {
  assert.ok(page(inbound).includes(`href="${base}${route}`), inbound);
}
console.log('Taiwan municipal assistance checked across 87 records, 39 audit rows, 4 survey estimates, the seven reporting years and the built exports.');
