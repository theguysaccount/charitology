import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import data from '../src/data/heal-nepal-trace.json' with { type: 'json' };

const { manager, uk, nepal } = data.captures;
const route = new URL('../dist/record/funding-flows/heal-nepal/', import.meta.url);
const get = (publisher, row) => {
  const found = publisher.transactions.find(entry => entry.row === row);
  assert.ok(found, 'Unknown transaction ' + publisher.activityId + ' row ' + row);
  return found;
};
const scaled = row => {
  const [whole, fraction = ''] = row.amount.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
for (const [capture, code, total] of [
  [manager, '3', '1872894.37'], [uk, '1', '1872894.36'], [uk, '3', '1701841.72'],
  [uk, '4', '153435.1987'], [nepal, '1', '265414037.15'], [nepal, '4', '118066726.48'],
]) {
  const group = capture.transactions.filter(row => row.type === code);
  assert.equal(group.reduce((sum, row) => sum + scaled(row), 0n), scaled({ amount: total }));
}

assert.deepEqual(Object.values(data.captures).map(source => source.transactions.length), [13, 28, 18]);
assert.equal(data.upstreamPairs.length, 13);
assert.equal(new Set(data.upstreamPairs.map(pair => pair.managerRow)).size, 13);
assert.equal(new Set(data.upstreamPairs.map(pair => pair.ukRow)).size, 13);
assert.equal(data.upstreamPairs.filter(pair => pair.sameDate).length, 5);
assert.equal(data.upstreamPairs.filter(pair => pair.managerLessUk === '0.01').length, 1);
for (const pair of data.upstreamPairs) {
  const left = get(manager, pair.managerRow);
  const right = get(uk, pair.ukRow);
  assert.equal(left.type, '3');
  assert.equal(right.type, '1');
  assert.equal(left.receiver.activityRef, uk.activityId);
  assert.equal(left.currency, 'GBP');
  assert.equal(right.currency, 'GBP');
  assert.equal(left.date === right.date, pair.sameDate);
  assert.equal(scaled(left) - scaled(right), scaled({ amount: pair.managerLessUk }));
}

const groups = data.onward.groups;
assert.equal(groups.length, 7);
assert.equal(new Set(groups.map(group => group.ukRow)).size, 7);
assert.equal(groups.filter(group => group.comparison === 'unresolved').length, 1);
assert.equal(groups.filter(group => group.nepalRows.length === 2).length, 1);
const receiptRows = [...groups.flatMap(group => group.nepalRows), ...data.onward.nepalTestReceipts];
assert.equal(receiptRows.length, 10);
assert.equal(new Set(receiptRows).size, 10);
for (const group of groups) assert.equal(get(uk, group.ukRow).type, '3');
for (const row of receiptRows) assert.equal(get(nepal, row).type, '1');
assert.ok(receiptRows.every(row => get(nepal, row).currency === 'NPR'));
assert.equal(data.need.detectedCases, 3282);
assert.equal(data.need.source.pdfPage, 4);

assert.deepEqual(JSON.parse(readFileSync(new URL('data.json', route), 'utf8')), data);
const csv = readFileSync(new URL('transactions.csv', route), 'utf8');
assert.equal(csv.split('\n').length, 61);
assert.match(csv, /NP_SWC-17775/);
assert.match(csv, /177798\.75,GBP,GBP/);
assert.match(csv, /39084431\.55,NPR,,GB-CHC-1050327/);
assert.match(csv, /GBP,GBP,GB-COH-04105827,GB-COH-04105827- AIDMATCHII/);
const html = readFileSync(new URL('index.html', route), 'utf8');
assert.match(html, /data-site-symbol="capsule"/);
assert.match(html, /Only part of the period agrees/);
assert.match(html, /GBP 153,435\.1987/);
assert.match(html, /NPR 118,066,726\.48/);
assert.match(html, /report|correction/i);
console.log('Heal Nepal: 59 exact source transactions, 13 upstream pairs, 7 onward groups, separate currencies and both exports passed.');
