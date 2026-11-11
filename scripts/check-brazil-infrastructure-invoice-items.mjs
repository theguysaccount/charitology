import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const path = '/record/funding-flows/brazil-infrastructure-invoice-items/';
const projectPath = '/record/funding-flows/brazil-project-execution/';
const directory = 'src/data/funding-flows/';
const bytes = file => readFileSync(file);
const json = file => JSON.parse(bytes(file));
const html = route => bytes('dist' + route + 'index.html').toString();
const sha = file => createHash('sha256').update(bytes(file)).digest('hex');

const data = json(directory + 'brazil-infrastructure-invoice-items.json');
const { coverage, periods } = data;
const projectFile = directory + 'brazil-project-execution.json';
const accountFile = directory + 'brazil-infrastructure-account-movements.json';
const accounts = json(accountFile);
const projects = new Map(json(projectFile).projects.map(row => [row.agreement, row]));
assert.equal(sha(projectFile), data.sources.projectEditionSha256);
assert.equal(sha(accountFile), data.sources.accountEditionSha256);
assert.deepEqual(data.sources.archives.siconv_pagamento, accounts.sources.archives.siconv_pagamento);
assert.equal(data.sources.archives.siconv_itens_dl.dataRows, 10079834);
assert.equal(data.currency, 'BRL');
assert.equal(periods.length, 175);
const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const states = ['equal', 'grossHigher', 'paymentHigher', 'paymentScopeUnresolved', 'noItems', 'itemIdentityUnresolved', 'unknownItemAmount'];
const keys = new Set();
for (const row of periods) {
  const key = row.agreement + ':' + row.issueYear;
  assert.ok(!keys.has(key), key);
  keys.add(key);
  const project = projects.get(row.agreement);
  assert.deepEqual([row.proposal, row.project], [project.proposal, project.project]);
  assert.deepEqual(Object.keys(row), [
    'agreement', 'proposal', 'project', 'issueYear', 'partialYear', 'documents', 'paymentRows',
    'lineRows', 'comparedUniqueItems', 'comparablePaymentRows', 'multiYearDocuments',
    'earliestIncludedPaymentYear', 'latestIncludedPaymentYear', 'grossItemCentsBRL', 'reportedPaymentCentsBRL', 'statuses',
  ], key);
  assert.equal(row.partialYear, row.issueYear === Number(data.capturedOn.slice(0, 4)), key);
  assert.ok(Number.isInteger(row.issueYear), key);
  assert.deepEqual(Object.keys(row.statuses), states, key);
  assert.equal(sum(Object.values(row.statuses), n => n), row.documents, key);
  assert.equal(sum(states.slice(3), name => row.statuses[name]), 0, key);
  assert.equal(row.paymentRows, row.comparablePaymentRows, key);
  assert.ok(row.comparedUniqueItems <= row.lineRows, key);
  assert.ok(row.multiYearDocuments <= row.documents, key);
  assert.ok(row.earliestIncludedPaymentYear <= row.latestIncludedPaymentYear, key);
  assert.ok(row.latestIncludedPaymentYear <= Number(data.capturedOn.slice(0, 4)), key);
  assert.ok(Number.isSafeInteger(row.reportedPaymentCentsBRL) && row.reportedPaymentCentsBRL >= 0, key);
  assert.ok(Number.isSafeInteger(row.grossItemCentsBRL) && row.grossItemCentsBRL >= row.reportedPaymentCentsBRL, key);
}

const byAgreement = Map.groupBy(periods, row => row.agreement);
const accountYears = Map.groupBy(accounts.periods, row => row.agreement);
const rowCount = text => [...text.matchAll(/data-invoice-cohort(?:\s|=|>)/g)].length;
for (const agreement of projects.keys()) {
  const row = byAgreement.get(agreement) ?? [];
  const movementRows = accountYears.get(agreement) ?? [];
  assert.equal(sum(row, r => r.paymentRows) + (data.paymentsWithoutDocumentIdByAgreement[agreement] ?? 0),
    sum(movementRows, r => r.institutionalPayments.rows), agreement);
  assert.equal(sum(row, r => r.reportedPaymentCentsBRL),
    sum(movementRows, r => r.institutionalPayments.amountCentsBRL ?? 0), agreement);
  const page = html(projectPath + agreement + '/');
  assert.equal(rowCount(page), row.length, agreement);
  assert.ok(page.includes('id="invoice-items"') && page.includes('href="#invoice-items"'), agreement);
  const target = row.length ? path + '?agreement=' + agreement + '#lookup' : path;
  assert.ok(page.includes(`href="${base + target}"`), agreement);
}
assert.equal(coverage.projectAgreements, projects.size);
assert.equal(coverage.agreementsWithInstitutionalPayments, byAgreement.size);
assert.equal(coverage.institutionalPayments, accounts.coverage.institutionalPaymentRows);
assert.equal(coverage.comparablePaymentRows, sum(periods, row => row.comparablePaymentRows));
assert.equal(coverage.paymentsWithoutDocumentId, 0);
assert.equal(coverage.repeatedPaymentDocuments, 32);
for (const key of ['documents', 'lineRows', 'comparedUniqueItems', 'multiYearDocuments']) {
  assert.equal(coverage[key], sum(periods, row => row[key]), key);
}
assert.deepEqual([coverage.documents, coverage.lineRows, coverage.comparedUniqueItems, coverage.multiYearDocuments],
  [1382, 1675, 1637, 6]);
assert.deepEqual(coverage.statuses, Object.fromEntries(states.map(name => [name, sum(periods, row => row.statuses[name])])));
assert.deepEqual(Object.values(coverage.statuses), [877, 505, 0, 0, 0, 0, 0]);

for (const [agreement, year, count, gross, paid] of [
  ['895978', 2023, 4, 14849100, 13746618],
  ['953157', 2025, 11, 95841540, 92697587],
  ['953157', 2026, 3, 13659851, 12909344],
]) {
  const row = byAgreement.get(agreement).find(value => value.issueYear === year);
  assert.deepEqual([row.documents, row.grossItemCentsBRL, row.reportedPaymentCentsBRL], [count, gross, paid]);
}
const lookup = html(path);
assert.equal(rowCount(lookup), periods.length);
assert.deepEqual(json('dist' + path + 'data.json'), data);
const [header, ...rows] = bytes('dist' + path + 'cohorts.csv').toString().trimEnd().split('\n');
assert.equal(rows.length, periods.length);
const columns = header.split(',');
assert.deepEqual(columns.slice(14, 16), ['grossItemCentsBRL', 'reportedPaymentCentsBRL']);
assert.deepEqual(columns.slice(16), states);
for (const [index, line] of rows.entries()) {
  const fields = line.split(',');
  assert.equal(fields.length, columns.length);
  const row = periods[index];
  assert.deepEqual(fields.slice(0, 4), [row.agreement, row.proposal, row.project, String(row.issueYear)]);
  assert.deepEqual(fields.slice(14).map(Number), [row.grossItemCentsBRL, row.reportedPaymentCentsBRL, ...Object.values(row.statuses)]);
}
for (const parent of ['/record/funding-flows/', '/record/charity-index/coverage/', '/record/funding-flows/brazil-infrastructure-account-movements/']) {
  assert.ok(html(parent).includes(`href="${base + path}"`), parent);
}
console.log('Brazil invoice items: 175 issue-year cohorts, 1,382 documents, 88 project sections, upstream agreement totals and both downloads verified.');
