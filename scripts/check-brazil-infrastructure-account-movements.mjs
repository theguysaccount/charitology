import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bytes = path => readFileSync(path);
const json = path => JSON.parse(bytes(path));
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/brazil-infrastructure-account-movements/';
const projectRoute = '/record/funding-flows/brazil-project-execution/';
const output = (path, file = 'index.html') => 'dist' + path + file;
const data = json('src/data/funding-flows/brazil-infrastructure-account-movements.json');
const projectBytes = bytes('src/data/funding-flows/brazil-project-execution.json');
assert.equal(createHash('sha256').update(projectBytes).digest('hex'), data.sources.projectEditionSha256);
const { coverage, periods } = data;
const projects = new Map(JSON.parse(projectBytes).projects.map(project => [project.agreement, project]));
assert.deepEqual(data.bankOrderYears, [2024, 2025]);

const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const keys = new Set();
const amounts = (record, amountRows) => {
  assert.ok(Number.isInteger(record.rows) && record.rows >= 0);
  assert.ok(Number.isInteger(amountRows) && amountRows >= 0 && amountRows <= record.rows);
  if (amountRows) assert.ok(Number.isSafeInteger(record.amountCentsBRL) && record.amountCentsBRL >= 0);
  else assert.equal(record.amountCentsBRL, null);
};
const stateNames = ['equalAmountParents', 'unknownAmountParents', 'differentAmountParents', 'noOnwardRecordParents'];
for (const period of periods) {
  assert.deepEqual(Object.keys(period), ['agreement', 'proposal', 'project', 'calendarYear', 'partialYear', 'movementRows',
    'institutionalPayments', 'otherNonHolderRowsWithoutAmounts', 'holderTransfers', 'onward', 'sameYearBankOrders']);
  const { agreement, calendarYear: year, movementRows, institutionalPayments, holderTransfers, onward, sameYearBankOrders } = period;
  const project = projects.get(agreement);
  assert.deepEqual([period.proposal, period.project], [project.proposal, project.project]);
  const key = agreement + ':' + year;
  assert.ok(!keys.has(key), key);
  keys.add(key);
  assert.equal(period.partialYear, year === Number(data.capturedOn.slice(0, 4)));
  assert.ok(Number.isInteger(period.otherNonHolderRowsWithoutAmounts) && period.otherNonHolderRowsWithoutAmounts >= 0);
  assert.ok(Number.isInteger(movementRows) && movementRows > 0);
  assert.equal(movementRows, institutionalPayments.rows + period.otherNonHolderRowsWithoutAmounts + holderTransfers.rows);
  assert.deepEqual(Object.keys(institutionalPayments), ['rows', 'amountCentsBRL']);
  assert.deepEqual(Object.keys(holderTransfers), ['rows', 'holderIdMatchedRows', 'amountCentsBRL']);
  amounts(institutionalPayments, institutionalPayments.rows);
  amounts(holderTransfers, holderTransfers.holderIdMatchedRows);
  assert.deepEqual(Object.keys(onward), ['rows', ...stateNames]);
  for (const count of Object.values(onward)) assert.ok(Number.isInteger(count) && count >= 0);
  assert.equal(sum(stateNames, state => onward[state]), holderTransfers.rows);
  assert.ok(onward.rows >= holderTransfers.rows - onward.noOnwardRecordParents);
  if (data.bankOrderYears.includes(year)) {
    const rows = project.bankOrders.filter(([, day]) => Number(day.slice(0, 4)) === year);
    assert.deepEqual(sameYearBankOrders, { rows: rows.length, amountCentsBRL: rows.length ? sum(rows, row => row[2]) : null });
  } else assert.equal(sameYearBankOrders, null);
}
assert.equal(coverage.agreementYears, periods.length);
assert.equal(coverage.projectAgreements, projects.size);
assert.equal(coverage.agreementsWithMovements, new Set(periods.map(row => row.agreement)).size);
assert.equal(coverage.movementRows, sum(periods, row => row.movementRows));
assert.equal(coverage.institutionalPaymentRows, sum(periods, row => row.institutionalPayments.rows));
assert.equal(coverage.otherNonHolderRowsWithoutAmounts, sum(periods, row => row.otherNonHolderRowsWithoutAmounts));
assert.equal(coverage.holderTransferRows, sum(periods, row => row.holderTransfers.rows));
assert.equal(coverage.holderIdMatchedRows, sum(periods, row => row.holderTransfers.holderIdMatchedRows));
assert.equal(coverage.onwardRows, sum(periods, row => row.onward.rows));
assert.deepEqual(coverage.onwardParentStates, Object.fromEntries(stateNames.map(state => [state, sum(periods, row => row.onward[state])])));
assert.deepEqual(Object.values(coverage.onwardParentStates), [188, 452, 0, 0]);
assert.deepEqual([coverage.projectAgreements, coverage.agreementsWithMovements, coverage.agreementYears, coverage.movementRows,
  coverage.zeroAmountRows, coverage.institutionalPaymentRows, coverage.otherNonHolderRowsWithoutAmounts,
  coverage.holderTransferRows, coverage.holderIdMatchedRows, coverage.onwardRows],
  [88, 84, 205, 2504, 8, 1420, 444, 640, 640, 1114]);
assert.equal(sum(coverage.categories, row => row.rows), 2504);
assert.equal(sum(coverage.categories, row => row.publishedAmountRows), 2060);

for (const [id, year, institutional, holder, bank, onward] of [
  ['895978', 2023, 13746618, 5150900, null, 1],
  ['895978', 2024, null, 53048253, 54245800, 2],
  ['953157', 2025, 70902488, null, 144300000, 0],
  ['953157', 2026, 34704443, null, null, 0],
]) {
  const period = periods.find(row => row.agreement === id && row.calendarYear === year);
  assert.deepEqual([period.institutionalPayments.amountCentsBRL, period.holderTransfers.amountCentsBRL,
    period.sameYearBankOrders?.amountCentsBRL ?? null, period.onward.equalAmountParents], [institutional, holder, bank, onward]);
}

const accountRows = html => [...html.matchAll(/data-movement-period="accounts"/g)].length;
const onwardRows = html => [...html.matchAll(/data-movement-period="onward"/g)].length;
const onwardPeriods = periods.filter(period => period.holderTransfers.rows > 0).length;
const directory = bytes(output(route)).toString();
assert.equal(accountRows(directory), periods.length);
assert.equal(onwardRows(directory), onwardPeriods);
for (const heading of ['accounts', 'onward', 'coverage', 'downloads']) {
  assert.ok(directory.includes(`id="${heading}"`) && directory.includes(`href="#${heading}"`), heading);
}
assert.deepEqual(json(output(route, 'data.json')), data);
for (const [name, count, amountsIncluded] of [['agreement-years.csv', periods.length, true], ['onward-coverage.csv', onwardPeriods, false]]) {
  const [header, ...rows] = bytes(output(route, name)).toString().trimEnd().split('\n');
  assert.equal(rows.length, count, name);
  assert.equal(header.includes('AmountCents'), amountsIncluded, name);
  assert.ok(directory.includes(`href="${base + route + name}"`), name);
}
const byAgreement = Map.groupBy(periods, row => row.agreement);
for (const agreement of projects.keys()) {
  const page = bytes(output(projectRoute + agreement + '/')).toString();
  const rows = byAgreement.get(agreement) ?? [];
  assert.ok(page.includes('id="account-movements"') && page.includes('href="#account-movements"'), agreement);
  assert.equal(accountRows(page), rows.length, agreement);
  assert.equal(onwardRows(page), rows.filter(row => row.holderTransfers.rows > 0).length, agreement);
}
for (const path of [
  '/record/funding-flows/', projectRoute, '/record/funding-flows/brazil-project-contracts/',
  '/record/funding-flows/brazil-works-measurements/', '/record/charity-index/coverage/',
]) assert.ok(bytes(output(path)).toString().includes(`href="${base + route}"`), path);

console.log(`Brazil infrastructure accounts: ${periods.length} year aggregates, ${onwardPeriods} onward-coverage periods, 88 project sections and 3 downloads verified.`);
