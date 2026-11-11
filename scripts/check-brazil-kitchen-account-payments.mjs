import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [dataBytes, exported, caseBytes] = await Promise.all([
  readFile(new URL('../src/data/brazil-solidarity-kitchen-payments.json', import.meta.url)),
  readFile(new URL('../dist/record/funding-flows/brazil-solidarity-kitchens/account-payments/data.json', import.meta.url)),
  readFile(new URL('../src/data/brazil-solidarity-kitchens.json', import.meta.url)),
]);
const data = JSON.parse(dataBytes);
const referenceCase = JSON.parse(caseBytes);
assert.deepEqual(JSON.parse(exported), data);
assert.equal(data.currency, 'BRL');
assert.equal(createHash('sha256').update(caseBytes).digest('hex'), data.case.sha256);
assert.equal(data.case.signedAgreements, referenceCase.selected.filter(row => row.signed).length);
assert.deepEqual(data.periods.map(period => period.calendarYear), ['2024', '2025', '2026']);
assert.equal(data.counts.sourcePaymentRows, 7575512);
assert.equal(data.counts.agreementsWithPaymentRows, 20);

let movements = 0;
for (const [index, period] of data.periods.entries()) {
  const { calendarYear, otherAgreementAccountPayments: other, internalTransfersToAgreementHolder: internal, onwardRecordsByParentYear: onward,
    reportedPartnerContributions: partner, reportedTaxPayments: tax } = period;
  assert.equal(period.partialCalendarYear, index === 2);
  assert.deepEqual([other.rows, other.cents], [[157, 87345564], [3299, 1879370676], [1867, 1210732995]][index]);
  assert.deepEqual([internal.rows, internal.cents], [[0, 0], [24, 30955426], [51, 25348986]][index]);
  assert.deepEqual([partner.rows, partner.cents], [[0, 0], [0, 0], [1, 2180720]][index]);
  assert.deepEqual([tax.rows, tax.cents], [[1, 378281], [27, 7903527], [26, 6579518]][index]);
  assert.deepEqual([onward.withMatchingOnwardAmount, onward.withMissingOnwardAmount, onward.matchingOnwardCents],
    [[0, 0, 0], [4, 20, 742138], [23, 28, 9779382]][index]);
  assert.equal(onward.withOnwardRecord + onward.withoutOnwardRecord, internal.rows);
  assert.equal(onward.withMatchingOnwardAmount + onward.withMissingOnwardAmount + onward.withDifferentOnwardAmount, onward.withOnwardRecord);
  assert.ok(onward.matchingOnwardCents <= internal.cents);
  for (const category of [other, internal, partner, tax]) {
    assert.deepEqual(Object.keys(category).sort(), ['cents', 'firstRecordDate', 'lastRecordDate', 'rows']);
    if (category.rows) {
      assert.ok(category.firstRecordDate.startsWith(calendarYear + '-'));
      assert.ok(category.lastRecordDate.startsWith(calendarYear + '-') && category.lastRecordDate >= category.firstRecordDate);
    } else {
      assert.equal(category.firstRecordDate, null);
      assert.equal(category.lastRecordDate, null);
    }
  }
  movements += other.rows + internal.rows;
}
assert.equal(movements, data.counts.selectedPaymentRows);
assert.ok(Object.values(data.sources).every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
console.log('Brazil kitchen accounts: pinned cohort, separate payment stages, missing amounts and 5,398 movement aggregates verified.');
