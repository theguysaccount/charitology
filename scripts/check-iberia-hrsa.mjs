import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/client/csv.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(read('../src/data/funding-flows/iberia-hrsa.json'));
const route = '/record/funding-flows/iberia-hrsa/';
const built = '..' + '/dist' + route;
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const dollars = cents => (cents / 100).toFixed(2);
const { organization, audits, agencyAwards, agencySource } = data;

assert.equal(data.currency, 'USD');
assert.equal(data.review, 'draft');
assert.equal(agencySource.sourceRows, 75_859);
assert.equal(agencySource.selectedRows, 15);
assert.equal(agencySource.crossCheck.matchedRows, 15);
assert.deepEqual([organization.ein, organization.uei], ['582164455', 'CQM4LLQ6GDU8']);
assert.equal(new Set(agencyAwards.map(row => row.sourceRecord)).size, 15);
assert.equal(new Set(agencyAwards.map(row => row.agencyMapObjectId)).size, 15);
assert.equal(new Set(agencyAwards.map(row => `${row.grantNumber}:${row.federalIssueYear}`)).size, 15);
assert.deepEqual(audits.map(audit => [
  audit.fiscalPeriodStart, audit.fiscalPeriodEnd, audit.grants.length, audit.reportedExpensesCents,
  audit.scheduleSource.pdfPage, audit.scheduleSource.printedPage,
]), [
  ['2022-06-01', '2023-05-31', 4, 642_463_100, 20, 18],
  ['2023-06-01', '2024-05-31', 3, 403_765_200, 20, 18],
  ['2024-06-01', '2025-05-31', 1, 397_015_200, 24, 22],
]);
for (const audit of audits) {
  assert.equal(audit.accountingBasis, 'accrual');
  assert.equal(audit.generalSource.selectedRows, 1);
  assert.equal(new Set(audit.grants.map(row => row.grantNumber)).size, audit.grants.length);
  assert.equal(audit.grants.reduce((sum, row) => sum + row.reportedReceiptsCents, 0), audit.reportedReceiptsCents);
  assert.equal(audit.grants.reduce((sum, row) => sum + row.reportedExpensesCents, 0), audit.reportedExpensesCents);
  for (const row of audit.grants) assert.ok(agencyAwards.some(award => award.grantNumber === row.grantNumber));
}
const vaccination = 'H8GCS48002';
assert.deepEqual(agencyAwards.filter(row => row.grantNumber === vaccination).map(row => [row.federalIssueYear, row.awardedCents]),
  [[2023, 32_304_600]]);
assert.deepEqual(audits.flatMap(audit => audit.grants.filter(row => row.grantNumber === vaccination)
  .map(row => [audit.fiscalPeriodEnd, row.assistanceListing, row.reportedExpensesCents])),
  [['2023-05-31', '93.527', 29_554_600], ['2024-05-31', '93.527', 2_750_000]]);

const financeBase = new URL('../public/data/charity-financials/us/', import.meta.url);
const manifest = JSON.parse(read('../public/data/charity-financials/us/manifest.json'));
const shard = JSON.parse(gunzipSync(readFileSync(new URL(manifest.shards['58'].path, financeBase))));
const [, registryMatch, filings] = shard.find(([ein]) => ein === organization.ein);
assert.equal(registryMatch, true);
assert.deepEqual(filings.map(period => period[0]), ['2023-05', '2022-05']);

assert.equal(read(built + 'data.json'), JSON.stringify(data, null, 2) + '\n');
const csv = path => parseCsv(read(built + path).replace(/^\uFEFF/, ''));
const [agencyHead, ...agency] = csv('agency-awards.csv');
const [auditHead, ...schedule] = csv('audit-schedules.csv');
assert.deepEqual(agencyHead, [
  'grantNumber', 'federalIssueYear', 'currency', 'awardedUSD', 'recipientUEI', 'agencyProjectStart',
  'agencyProjectEnd', 'sourceRefreshedOn', 'sourceRecord', 'sourceUrl', 'sourceSha256',
]);
assert.deepEqual(agency, agencyAwards.map(row => [
  row.grantNumber, String(row.federalIssueYear), data.currency, dollars(row.awardedCents), organization.uei,
  row.projectPeriodStart, row.projectPeriodEnd, row.sourceRefreshedOn, String(row.sourceRecord),
  agencySource.url, agencySource.sha256,
]));
assert.deepEqual(auditHead, [
  'grantNumber', 'assistanceListing', 'currency', 'reportedReceiptsUSD', 'reportedExpensesUSD', 'accountingBasis',
  'recipientUEI', 'recipientEIN', 'fiscalPeriodStart', 'fiscalPeriodEnd', 'scheduleProgramStart',
  'scheduleProgramEnd', 'reportId', 'pdfPage', 'sourceUrl', 'sourceSha256',
]);
assert.deepEqual(schedule, audits.flatMap(audit => audit.grants.map(row => [
  row.grantNumber, row.assistanceListing, data.currency, dollars(row.reportedReceiptsCents),
  dollars(row.reportedExpensesCents), audit.accountingBasis, organization.uei, organization.ein,
  audit.fiscalPeriodStart, audit.fiscalPeriodEnd, row.programPeriodStart, row.programPeriodEnd,
  audit.reportId, String(audit.scheduleSource.pdfPage), audit.scheduleSource.url, audit.scheduleSource.sha256,
])));
const page = read(built + 'index.html');
assert.ok(page.includes('Report an error'));
assert.ok(page.includes('data-site-symbol="medical"'));
assert.ok(page.includes(base + '/record/charity-financials/united-states/#ein=' + organization.ein));
for (const audit of audits) assert.ok(page.includes(audit.scheduleSource.url + '#page=' + audit.scheduleSource.pdfPage));
for (const path of ['charity-index/', 'charity-index/coverage/', 'charity-financials/united-states/']) {
  assert.ok(read('../dist/record/' + path + 'index.html').includes(`href="${base + route}"`), path);
}
console.log('Iberia: four grant identities, 15 agency award rows, three exact audit totals, distinct stage exports and IRS navigation passed.');
