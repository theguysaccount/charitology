import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bytes = path => readFileSync(path);
const json = path => JSON.parse(bytes(path));
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/brazil-works-measurements/';
const projectRoute = '/record/funding-flows/brazil-project-execution/';
const output = (path, file = 'index.html') => 'dist' + path + file;
const snapshot = json('src/data/funding-flows/brazil-works-measurements.json');
const projectBytes = bytes('src/data/funding-flows/brazil-project-execution.json');
assert.equal(createHash('sha256').update(projectBytes).digest('hex'), snapshot.sources.projectEditionSha256);
const projects = new Map(JSON.parse(projectBytes).projects.map(project => [project.proposal, project]));
const { monitoring, items, coverage, sources } = snapshot;
const [monitoringArchive, itemsArchive] = Object.values(sources.archives);

const id = value => assert.match(value, /^[0-9]{1,20}$/);
const date = value => {
  if (value === null) return;
  assert.match(value, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  assert.equal(new Date(value + 'T00:00:00Z').toISOString().slice(0, 10), value);
};
const row = (index, archive, seen) => {
  assert.ok(Number.isInteger(index) && index > 0 && index <= archive.dataRows);
  assert.ok(!seen.has(index), index);
  seen.add(index);
};
const monitorByKey = new Map();
const reportRows = new Set();
const reportIds = new Set();
const statusCounts = new Map();
for (const report of monitoring) {
  assert.deepEqual(Object.keys(report), [
    'agreement', 'project', 'proposal', 'monitoringContractId', 'sourceRow', 'worksStartOn',
    'measurementId', 'measurementNumber', 'lastMeasurementNumber', 'measurementStatus', 'periodStart', 'periodEnd',
  ]);
  const { proposal, monitoringContractId, sourceRow, measurementId, measurementStatus, periodStart, periodEnd } = report;
  const project = projects.get(proposal);
  assert.deepEqual([report.agreement, report.project], [project.agreement, project.project]);
  row(sourceRow, monitoringArchive, reportRows);
  id(monitoringContractId);
  if (measurementId !== null) {
    assert.ok(!reportIds.has(measurementId), measurementId);
    reportIds.add(measurementId);
    for (const value of [measurementId, report.measurementNumber, report.lastMeasurementNumber]) id(value);
    assert.ok(periodStart && periodEnd && periodStart <= periodEnd && measurementStatus);
  } else {
    assert.deepEqual([report.measurementNumber, report.lastMeasurementNumber, measurementStatus, periodStart, periodEnd],
      [null, null, null, null, null]);
  }
  for (const value of [periodStart, periodEnd, report.worksStartOn]) date(value);
  assert.ok(!monitorByKey.has(monitoringContractId));
  monitorByKey.set(monitoringContractId, report);
  const label = measurementStatus ?? 'unknown';
  statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
}

const itemRows = new Set();
const itemKeys = new Set();
const itemCounts = { total: 0, grantor: 0, recipient: 0, company: 0 };
for (const item of items) {
  assert.deepEqual(Object.keys(item), ['agreement', 'project', 'proposal', 'monitoringContractId', 'measurementItemId', 'sourceRow', 'amountCentsBRL']);
  const report = monitorByKey.get(item.monitoringContractId);
  assert.deepEqual([item.agreement, item.project, item.proposal], [report.agreement, report.project, report.proposal]);
  row(item.sourceRow, itemsArchive, itemRows);
  id(item.measurementItemId);
  const key = item.monitoringContractId + ':' + item.measurementItemId;
  assert.ok(!itemKeys.has(key), key);
  itemKeys.add(key);
  assert.deepEqual(Object.keys(item.amountCentsBRL), Object.keys(itemCounts));
  for (const [name, amount] of Object.entries(item.amountCentsBRL)) {
    assert.ok(amount === null || Number.isSafeInteger(amount) && amount >= 0, name);
    if (amount !== null) itemCounts[name]++;
  }
}
const count = (rows, field) => new Set(rows.map(item => item[field])).size;
assert.deepEqual(coverage, {
  projectProposals: projects.size,
  proposalsWithMonitoringRows: count(monitoring, 'proposal'),
  monitoringRows: monitoring.length,
  identifiedMeasurements: reportIds.size,
  proposalsWithMeasurements: count(monitoring.filter(report => report.measurementId), 'proposal'),
  measurementsWithPeriods: monitoring.filter(report => report.periodStart && report.periodEnd).length,
  statusCounts: Object.fromEntries(statusCounts),
  monitoringKeysWithItemAmounts: count(items, 'monitoringContractId'),
  proposalsWithItemAmounts: count(items, 'proposal'),
  itemRows: itemRows.size,
  itemFieldsPresent: itemCounts,
});
assert.deepEqual([coverage.projectProposals, coverage.proposalsWithMonitoringRows, coverage.monitoringRows,
  coverage.identifiedMeasurements, coverage.proposalsWithMeasurements, coverage.itemRows], [88, 58, 60, 58, 56, 19]);
assert.deepEqual(itemCounts, { total: 19, grantor: 8, recipient: 18, company: 18 });
assert.equal(statusCounts.get('Aceita'), 21);
for (const agreement of ['895978', '953157']) {
  assert.deepEqual(monitoring.filter(report => report.agreement === agreement).map(report => report.measurementStatus), ['Aceita', 'Aceita']);
}
const [caseItem] = items.filter(item => item.agreement === '895978');
assert.deepEqual(caseItem.amountCentsBRL, { total: 34120000, grantor: 34120000, recipient: 34120000, company: 34120000 });
assert.equal(caseItem.sourceRow, 5712);
assert.equal(items.filter(item => item.agreement === '953157').length, 0);

const built = bytes(output(route)).toString();
for (const [selector, expected] of [['data-monitoring-row', 60], ['data-measurement-item', 19]]) {
  assert.equal([...built.matchAll(new RegExp(`${selector}(?:\\s|=|>)`, 'g'))].length, expected);
}
for (const heading of ['monitoring', 'amounts', 'coverage', 'downloads']) {
  assert.ok(built.includes(`id="${heading}"`) && built.includes(`href="#${heading}"`), heading);
}
assert.deepEqual(json(output(route, 'data.json')), snapshot);
for (const [name, expected, includesAmounts] of [['monitoring.csv', 60, false], ['work-items.csv', 19, true]]) {
  const [header, ...rows] = bytes(output(route, name)).toString().trimEnd().split('\n');
  assert.equal(rows.length, expected, name);
  assert.equal(header.includes('totalCents'), includesAmounts, name);
  assert.equal(header.includes('periodStart'), !includesAmounts, name);
  assert.ok(built.includes(`href="${base + route + name}"`), name);
}
const monitoringGroups = Map.groupBy(monitoring, report => report.agreement);
const itemGroups = Map.groupBy(items, item => item.agreement);
for (const { agreement } of projects.values()) {
  const page = bytes(output(projectRoute + agreement + '/')).toString();
  assert.ok(page.includes('id="works-measurements"') && page.includes('href="#works-measurements"'), agreement);
  assert.equal([...page.matchAll(/data-monitoring-row(?:\s|=|>)/g)].length, monitoringGroups.get(agreement)?.length ?? 0);
  assert.equal([...page.matchAll(/data-measurement-item(?:\s|=|>)/g)].length, itemGroups.get(agreement)?.length ?? 0);
}
for (const path of ['/record/funding-flows/', projectRoute, '/record/funding-flows/brazil-project-contracts/', '/record/charity-index/coverage/']) {
  assert.ok(bytes(output(path)).toString().includes(`href="${base + route}"`), path);
}
console.log('Brazil works monitoring: 60 monitoring rows, 58 dated measurements, 19 separate accumulated item rows and 88 project pages verified.');
