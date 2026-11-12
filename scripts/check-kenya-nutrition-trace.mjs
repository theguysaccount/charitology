import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';
import data from '../src/data/kenya-nutrition-trace.json' with { type: 'json' };
import { stages, expenditure, exportPairs } from '../src/lib/kenya-nutrition-trace.ts';
import { toCsv } from '../src/lib/client/files.ts';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/kenya-nutrition/';
const path = 'dist' + route;
const contents = name => readFileSync(path + name, 'utf8');
const cents = value => {
  assert.match(value, /^\d+(?:\.\d{1,2})?$/);
  const [units, fraction = ''] = value.split('.');
  return BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const sum = values => values.reduce((total, value) => total + cents(value), 0n);
const { manager, uk, kenya } = data.captures;
for (const source of [manager, uk, kenya, data.survey.source, data.kenyaRegistrationSource, data.projectGeographySource]) {
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(new URL(source.url).protocol, 'https:');
  assert.ok(source.bytes > 0);
}
assert.equal(uk.reportingOrg, 'GB-CHC-' + data.charityRegistrationEnglandWales);
assert.equal(uk.activityId, 'GB-CHC-299717-KY0002');
assert.equal(kenya.reportingOrg, 'KE-NCB-2180511703310709');
assert.equal(kenya.reportingOrg, 'KE-NCB-' + data.kenyaRegistrationSource.registrationNumber.replace(/\D/g, ''));
assert.equal(data.kenyaRegistrationSource.pdfPage, 35);
assert.equal(manager.allActivityTransactions, 1365);
assert.equal(manager.transactions.length, 12);
assert.equal(uk.transactions.length, 56);
assert.equal(kenya.transactions.length, 69);
for (const source of [manager, uk, kenya]) {
  const coordinates = new Set(source.transactions.map(row => row.row));
  assert.equal(coordinates.size, source.transactions.length);
  assert.ok(source.transactions.every(row => row.row >= 1 && row.row <= source.allActivityTransactions));
}

const [incoming, onward] = stages.map(stage => stage.rows);
assert.equal(incoming.length, 12);
assert.equal(new Set(incoming.map(pair => pair.left.row)).size, incoming.length);
assert.equal(new Set(incoming.map(pair => pair.right.row)).size, incoming.length);
assert.equal(incoming.filter(pair => pair.sameDate).length, 1);
for (const pair of incoming) {
  assert.equal(pair.left.receiver.activityRef, uk.activityId);
  assert.equal(pair.left.type, '3');
  assert.equal(pair.right.type, '1');
  assert.equal(pair.left.currency, pair.right.currency);
  assert.equal(cents(pair.left.amount), cents(pair.right.amount));
  assert.equal(pair.sameDate, pair.left.date === pair.right.date);
}
assert.equal(sum(incoming.map(pair => pair.left.amount)), 131079645n);
assert.deepEqual(onward.map(pair => pair.quarter), Array.from({length: 13}, (_, index) => index + 1));
assert.equal(new Set(onward.map(pair => pair.left.row)).size, onward.length);
assert.equal(new Set(onward.map(pair => pair.right.row)).size, onward.length);
for (const pair of onward) {
  assert.equal(pair.left.date, pair.right.date);
  assert.equal(pair.left.currency, pair.right.currency);
  assert.equal(pair.left.type, '3');
  assert.equal(pair.right.type, pair.quarter === 10 ? '3' : '1');
  assert.equal(cents(pair.left.amount) - cents(pair.right.amount), pair.quarter === 12 ? 11n : 0n);
  assert.equal(cents(pair.difference), pair.quarter === 12 ? 11n : 0n);
}
assert.match(onward[9].right.ref, /Income/);
assert.equal(onward[11].left.amount, '91473.98');
assert.equal(onward[11].right.amount, '91473.87');
assert.equal(sum(onward.map(pair => pair.left.amount)), 118245637n);
assert.equal(sum(onward.map(pair => pair.right.amount)), 118245626n);
assert.equal(data.ukBudgets.length, 4);
assert.ok(data.ukBudgets.every(row => row.type === '1' && row.status === '2' && row.currency === 'GBP'));
assert.equal(sum(data.ukBudgets.map(row => row.amount)), 145873513n);
const ukExpenses = expenditure.filter(row => row.activityId === uk.activityId);
const kenyaExpenses = expenditure.filter(row => row.activityId === kenya.activityId);
assert.equal(ukExpenses.length, 31);
assert.equal(kenyaExpenses.length, 56);
assert.equal(sum(ukExpenses.map(row => row.amount)), 20891585n);
assert.equal(sum(kenyaExpenses.map(row => row.amount)), 118246625n);
assert.equal(expenditure.length, ukExpenses.length + kenyaExpenses.length);
assert.equal(new Set(expenditure.map(row => row.activityId + ':' + row.transactionRow)).size, expenditure.length);
assert.ok(expenditure.every(row => row.originalTypeCode === '4'));
assert.equal(data.survey.source.pdfPage, 87);
assert.deepEqual(data.survey.estimates.map(row => [row.geography, row.percent, row.standardErrorPercentagePoints]), [
  ['Busia', '59.5', '2.74'], ['Bungoma', '32.4', '3.09'], ['Kenya', '32.0', '0.49'],
]);

assert.equal(contents('data.json'), JSON.stringify(data, null, 2) + '\n');
assert.equal(contents('counterparts.csv'), '\uFEFF' + toCsv(exportPairs()) + '\n');
assert.equal(contents('expenditure.csv'), '\uFEFF' + toCsv(expenditure) + '\n');
const html = contents('index.html');
const doc = parse(html);
const attrs = (node, attr) => node.attrs?.find(item => item.name === attr)?.value;
function nodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => nodes(child, predicate))];
}
for (const stage of stages) {
  const [section] = nodes(doc, node => node.tagName === 'section' && attrs(node, 'aria-labelledby') === stage.id);
  assert.ok(section, stage.id);
  assert.equal(nodes(section, node => node.tagName === 'tr').length, stage.rows.length + 1, stage.id);
}
assert.ok(html.includes('218/051/17-033/10709'));
assert.ok(html.includes(`href="${base}/record/charity-financials/england-wales/?registration=299717"`));
assert.ok(html.includes('Annex Table B1'));
assert.ok(html.includes('GBP 0.11'));
assert.ok(html.includes('Kenya code conflicts with its income reference.'));
assert.ok(html.includes('Draft, Edition 0.'));
for (const link of ['data.json', 'counterparts.csv', 'expenditure.csv']) assert.ok(html.includes(`href="${base}${route}${link}"`));
for (const index of ['record/funding-flows', 'record/charity-financials/kenya', 'record/charity-index/coverage', 'record/gap-map']) {
  assert.ok(readFileSync(`dist/${index}/index.html`, 'utf8').includes(`href="${base}${route}`), index);
}
console.log('Kenya nutrition: 25 paired reports, two expense scopes, four budget periods, three independent need estimates and three exact public downloads checked.');
