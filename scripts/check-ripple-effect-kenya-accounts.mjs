import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import data from '../src/data/ripple-effect-kenya-accounts.json' with { type: 'json' };
import { accountsCsvRows, accountsSource, rows } from '../src/lib/ripple-effect-kenya-accounts.ts';
import { toCsv } from '../src/lib/client/files.ts';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/ripple-effect-kenya-accounts/';
const read = name => readFileSync('dist' + route + name, 'utf8');
const actualDigest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const captures = process.argv[2];
const sourceIds = new Set(data.sources.map(source => source.id));
assert.equal(sourceIds.size, 6);
for (const receipt of [...data.sources, { ...data.directory, filename: 'kenya-directory.html' }]) {
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(new URL(receipt.url).protocol, 'https:');
  assert.ok(receipt.bytes > 0);
  if (captures) {
    const path = join(captures, receipt.filename);
    assert.equal(statSync(path).size, receipt.bytes, receipt.filename);
    assert.equal(actualDigest(path), receipt.sha256, receipt.filename);
  }
}
assert.equal(data.review, 'draft');
assert.equal(data.currency, 'GBP');
assert.equal(data.parent.charityRegistration, '299717');
assert.equal(data.parent.companyNumber, '02290024');
const [affiliate, hub] = data.entities;
assert.equal(affiliate.iatiRef, 'KE-NCB-' + affiliate.localRegistration.replace(/\D/g, ''));
assert.notEqual(affiliate.localRegistration, hub.localRegistration);
assert.equal(hub.localRegistration, '218/051/22-097/12473');
assert.notEqual(data.directory.affiliateNameEntry, data.directory.sameDigitsShortEntry);
assert.equal(rows.length, 9);
assert.equal(new Set(rows.map(row => row.entity + ':' + row.periodEnd)).size, rows.length);
const affiliateRows = rows.filter(row => row.entity === affiliate.id);
const hubRows = rows.filter(row => row.entity === hub.id);
assert.deepEqual(affiliateRows.map(row => row.periodEnd.slice(0,4)), ['2019','2020','2021','2022','2023','2024','2025']);
assert.deepEqual(hubRows.map(row => row.periodEnd.slice(0,4)), ['2024','2025']);
assert.equal(affiliateRows[0].periodStart, '2019-04-01');
assert.equal(affiliateRows[0].periodScope, 'three-month-subsidiary-period');
assert.equal(affiliateRows[0].grantOnTransferGbp, 157836);
assert.equal(affiliateRows[0].sourceColumn, 'comparative');
for (const row of rows) {
  const source = accountsSource(row.source);
  assert.equal(source.parentNote.number, 12);
  assert.equal(source.entityNote.number, 15);
  assert.ok(source.parentNote.pdfPage < source.entityNote.pdfPage);
  const year = Number(row.periodEnd.slice(0,4));
  if (year > 2019) {
    assert.equal(row.sourceColumn, 'current');
    assert.equal(row.periodStart, (year - 1) + '-07-01');
    assert.equal(row.periodEnd, source.periodEnd);
  }
  assert.equal(row.grantMadeLessReceivableGbp, year === 2021 ? 40045 : 0);
  assert.equal(row.totalIncomeGbp, row.grantReceivableGbp + (row.otherGrantIncomeGbp ?? 0)
    + (row.investmentIncomeGbp ?? 0) + (row.grantOnTransferGbp ?? 0));
  assert.equal(Math.sign(row.expenditureAsPrintedGbp), year >= 2024 ? -1 : 1);
  assert.equal(row.yearEndBalance.amountGbp === 0, row.yearEndBalance.direction === 'nil');
  for (const field of ['subsidiaryRechargeGbp', 'otherGrantIncomeGbp', 'investmentIncomeGbp', 'grantOnTransferGbp']) {
    assert.equal(Object.hasOwn(row.blankPresentation,field), row[field] === null);
  }
}
assert.equal(affiliateRows[2].parentReimbursementGbp, 0);
assert.equal(affiliateRows[2].subsidiaryRechargeGbp, 2157);
assert.equal(affiliateRows[2].yearEndBalance.amountGbp, 2123);
assert.equal(data.comparisons2021.yearEndBalanceToParentGbp, 2213);
assert.equal(data.comparisons2021.grantMadeGbp, affiliateRows[2].grantMadeGbp);
assert.equal(data.comparisons2021.grantReceivableGbp, affiliateRows[2].grantReceivableGbp);
assert.equal(affiliateRows[2].investmentIncomeGbp, 5448);
assert.equal(data.comparisons2021.investmentIncomePrinted, 'dash');

assert.equal(read('data.json'), JSON.stringify({ ...data, rows }, null, 2) + '\n');
assert.equal(read('annual-notes.csv'), '\uFEFF' + toCsv(accountsCsvRows()) + '\n');
const html = read('index.html');
const doc = parse(html);
const attr = (node, key) => node.attrs?.find(value => value.name === key)?.value;
function findNodes(node, pred) {
  return [...(pred(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => findNodes(child,pred))];
}
for (const entity of data.entities) {
  const [section] = findNodes(doc, node => node.tagName === 'section' && attr(node, 'aria-labelledby') === entity.id);
  assert.ok(section, entity.id);
  assert.equal(findNodes(section, node => node.tagName === 'tr').length, rows.filter(row => row.entity === entity.id).length + 1);
}
for (const text of ['GBP 40,045', 'GBP 2,123', 'GBP 2,213', 'GBP 5,448', '218/051/2017-034', '218/051/2017-033', 'Draft, Edition 0.']) assert.ok(html.includes(text), text);
assert.ok(html.includes(`href="${base}/record/charity-financials/england-wales/?registration=299717"`));
for (const index of ['record/funding-flows', 'record/funding-flows/kenya-nutrition', 'record/charity-financials/kenya', 'record/charity-index/coverage']) {
  assert.ok(readFileSync(`dist/${index}/index.html`, 'utf8').includes(`href="${base}${route}`), index);
}
console.log('Ripple Effect Kenya: nine entity/period rows, two registration scopes, disclosed differences and two exact public downloads checked.');
