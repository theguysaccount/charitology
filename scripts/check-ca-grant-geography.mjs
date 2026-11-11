import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/client/csv.ts';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const built = '../dist/record/funding-flows/canada-grant-geography/';
const data = JSON.parse(read('../src/data/ca-grant-geography.json'));
const expected = { '2023': [13209, 13206, 823, 20], '2024': [14108, 14106, 1113, 29] };
const total = object => Object.values(object).reduce((sum, value) => sum + value, 0);
const cents = value => value === null ? 0n : BigInt(value.replace('.', ''));
assert.equal(data.currency, 'CAD');
assert.equal(data.stage, 'filer-reported-disbursement');
assert.equal(data.minimumNonzeroReportingAccounts, 5);
assert.deepEqual(Object.keys(data.editions), Object.keys(expected));
const dataJson = read(built + 'data.json');
assert.equal(dataJson, JSON.stringify(data, null, 2) + '\n');
assert.doesNotMatch(dataJson, /[0-9]{9}RR[0-9]{4}|granteeName|grantPurpose|worksheetSequence/);

const [headers, ...rows] = parseCsv(read(built + 'amounts.csv').replace(/^\uFEFF/, ''));
const csv = rows.map(row => Object.fromEntries(headers.map((name, index) => [name, row[index]])));
let publishedRows = 0;
for (const [year, edition] of Object.entries(data.editions)) {
  assert.deepEqual([edition.sourceRows, edition.includedRows, edition.filerPeriods, edition.amounts.cash.countries.length], expected[year]);
  assert.equal(total(edition.excluded) + edition.includedRows, edition.sourceRows);
  assert.equal(total(edition.geography), edition.includedRows);
  for (const [component, group] of Object.entries(edition.amounts)) {
    assert.equal(group.reported.amountRows + group.unavailableRows, edition.includedRows);
    assert.equal(group.countries.reduce((sum, row) => sum + row.amountRows, group.unallocated.amountRows), group.reported.amountRows);
    assert.equal(group.countries.reduce((sum, row) => sum + cents(row.amountCAD), cents(group.unallocated.amountCAD)), cents(group.reported.amountCAD));
    assert.equal(new Set(group.countries.map(row => row.code)).size, group.countries.length);
    assert.ok(group.countries.every(row => /^[A-Z]{2}$/.test(row.code) && row.reportingAccounts >= data.minimumNonzeroReportingAccounts));
    assert.ok(group.unallocated.reportingAccounts >= data.minimumNonzeroReportingAccounts);
    const projected = [
      { scope: 'reported-total', code: '', name: '', ...group.reported },
      { scope: 'unallocated', code: '', name: '', ...group.unallocated },
      ...group.countries.map(row => ({ scope: 'country', ...row })),
    ].map(row => ({
      ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')])),
      year, component, currency: data.currency, stage: data.stage, capturedOn: data.capturedOn, licence: data.licence,
      grantSource: edition.sources.grants.url, grantSha256: edition.sources.grants.sha256,
      financeSource: edition.sources.finance.url, financeSha256: edition.sources.finance.sha256,
    }));
    assert.deepEqual(csv.filter(row => row.year === year && row.component === component), projected);
    publishedRows += projected.length;
  }
}
assert.equal(csv.length, publishedRows);
const page = read(built + 'index.html');
assert.ok(page.includes('Report an error') && page.includes('Download amounts CSV'));
assert.equal((page.match(/<tr data-country=/g) ?? []).length, 49);
console.log('Canada T1441: 27,312 matched grant rows, 49 country-year amounts, disjoint totals and exact source-linked exports passed.');
