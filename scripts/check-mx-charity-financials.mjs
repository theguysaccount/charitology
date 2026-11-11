import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const dataPath = 'public/data/charity-financials/mx/';
const manifest = JSON.parse(read(dataPath + 'manifest.json'));
const raw = read(dataPath + manifest.asset.path);
const decoded = gunzipSync(raw);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(raw.length, manifest.asset.bytes);
assert.equal(decoded.length, manifest.asset.decodedBytes);
assert.equal(hash(raw), manifest.asset.sha256);
assert.equal(hash(decoded), manifest.asset.decodedSha256);
const rows = JSON.parse(decoded);
const { coverage, financial, directories, financialFields } = manifest;
assert.equal(rows.length, coverage.identities);
assert.equal(manifest.currency, 'MXN');
assert.equal(manifest.sourceCurrencyLabel, 'Pesos');
assert.equal(financialFields.length, 16);
assert.ok(financialFields.every(field => !field.field.startsWith('percep')));
assert.deepEqual(manifest.directoryActivityFields, ['sourceSpreadsheetRow', 'authorizedActivity']);
const ids = new Set();
const histories = { 1: 0, 2: 0, 3: 0 };
const financeByYear = new Map(Object.keys(financial).map(year => [Number(year), []]));
const directoryByYear = new Map(Object.keys(directories).map(year => [Number(year), []]));
let noFinancial = 0, noDirectory = 0;
for (const row of rows) {
  assert.equal(row.length, 3);
  const [rfc, periods, directory] = row;
  assert.match(rfc, /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/);
  assert.ok(!ids.has(rfc), 'repeated institutional RFC');
  ids.add(rfc);
  assert.ok(periods.length || directory.length);
  if (periods.length) histories[periods.length]++;
  else noFinancial++;
  if (!directory.length) noDirectory++;
  assert.deepEqual(periods.map(period => period[0]), [...new Set(periods.map(period => period[0]))].toSorted());
  assert.deepEqual(directory.map(edition => edition[0]), [...new Set(directory.map(edition => edition[0]))].toSorted());
  for (const period of periods) {
    assert.equal(period.length, 6);
    const [year, coordinate, name, state, category, values] = period;
    assert.ok(Number.isSafeInteger(coordinate) && coordinate > 0);
    assert.ok(name.length && state.length && category.length);
    assert.equal(values.length, financialFields.length);
    assert.ok(values.every(value => value === null || Number.isSafeInteger(value)));
    financeByYear.get(year).push({ coordinate, rfc, values, directory });
  }
  for (const entry of directory) {
    assert.equal(entry.length, 5);
    const [year, name, state, taxState, activities] = entry;
    assert.ok(name.length && state.length && taxState.length);
    assert.ok(activities.length);
    for (const activity of activities) {
      assert.equal(activity.length, 2);
      assert.ok(Number.isSafeInteger(activity[0]) && activity[0] > directories[year].headerRow);
      assert.ok(manifest.directoryActivityCodes[activity[1]], 'unknown activity code');
    }
    directoryByYear.get(year).push(activities);
  }
}
assert.deepEqual(histories, coverage.exactPeriodHistories);
assert.equal(noFinancial, coverage.directoryOnlyIds);
assert.equal(noDirectory, coverage.financialOnlyIds);
assert.equal(coverage.financialInstitutions + noFinancial, coverage.identities);
assert.equal([...financeByYear.values()].reduce((sum, year) => sum + year.length, 0), coverage.financialPeriods);
assert.equal([...directoryByYear.values()].reduce((sum, year) => sum + year.length, 0), coverage.directoryObservations);

for (const [year, periods] of financeByYear) {
  const source = financial[year];
  assert.equal(periods.length, source.sourceRows);
  assert.equal(periods.length, source.report.sourceIdsRecognizedInDetail);
  const coordinates = periods.map(period => period.coordinate).toSorted((a, b) => a - b);
  assert.ok(coordinates.every((value, index) => value === index + 1));
  for (const [edition, count] of Object.entries(source.directoryMatches)) {
    assert.equal(periods.filter(period => period.directory.some(entry => entry[0] === Number(edition))).length, count);
  }
  for (const [index, { field }] of financialFields.entries()) {
    const counts = { missing: 0, zero: 0, positive: 0, negative: 0 };
    let cents = 0;
    for (const { values } of periods) {
      const value = values[index];
      if (value === null) counts.missing++;
      else {
        counts[value === 0 ? 'zero' : value > 0 ? 'positive' : 'negative']++;
        cents += value;
      }
    }
    assert.deepEqual(counts, source.fieldCoverage[field], `${year} ${field}`);
    if (index < 4) assert.equal(cents / 100, source.report.fourOriginalDonationColumnsInPesos[index]);
  }
}
for (const [year, editions] of directoryByYear) {
  const source = directories[year];
  assert.equal(editions.length, source.distinctInstitutionalIds);
  assert.equal(editions.filter(activities => activities.length > 1).length, source.repeatedActivityGroups);
  const coordinates = editions.flatMap(activities => activities.map(row => row[0]));
  assert.equal(coordinates.length, source.institutionRows);
  assert.equal(new Set(coordinates).size, coordinates.length);
}
const path = '/record/charity-financials/mexico/';
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const buildRoot = 'dist';
const markup = read(buildRoot + path + 'index.html').toString();
for (const token of ['Report an error', '11,916', '32,368', '9,601', '57,937,338,720', 'data-mx-financials']) {
  assert.ok(markup.includes(token), token);
}
for (const entry of ['charity-index/', 'charity-index/coverage/', 'charity-financials/']) {
  assert.ok(read(buildRoot + '/record/' + entry + 'index.html').toString().includes(`href="${base + path}"`), entry);
}
assert.deepEqual(read(buildRoot + '/data/charity-financials/mx/organizations.json.gz'), raw);
console.log('Mexico SAT: 11,916 institutional IDs, 32,368 periods, original activity coordinates, four donation totals per year and built links pass.');
