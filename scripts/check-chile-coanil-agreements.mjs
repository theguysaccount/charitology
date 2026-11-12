import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const path = 'data/funding-flows/chile-coanil-agreements/';
const edition = JSON.parse(readFileSync('public/' + path + 'edition.json', 'utf8'));
const parent = readFileSync('public/data/funding-flows/chile-residential-payments/edition.json');
assert.equal(edition.paymentsEditionSha256, createHash('sha256').update(parent).digest('hex'));
const payments = JSON.parse(parent);
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
assert.equal(edition.institution.rut, '70267000-4');
assert.equal(edition.institution.registration, '812');
assert.equal(edition.currency, 'CLP');
assert.equal(edition.residences.length, 10);
assert.equal(new Set(edition.residences.map(row => row.commune)).size, 7);
assert.equal(sum(edition.residences, 'places2025'), 308);
assert.equal(sum(edition.residences, 'places2026'), 304);
assert.equal(sum(edition.residences, 'approved2025'), 4_350_192_000);
assert.equal(sum(edition.residences, 'adaptationClp'), 182_850_000);
assert.equal(sum(edition.residences, 'approved2026'), 5_099_904_000);
assert.equal(edition.residences.find(row => row.folio === '110016').places2026, 100);

const byKey = new Map(payments.ledger.filter(row => row.rut === edition.institution.rut)
  .map(row => [row.period + ':' + row.sourceRow, row]));
const used = new Set();
for (const group of edition.agreements) {
  for (const item of group.installments) {
    const rows = item.ledgerRows.map(position => {
      const key = group.year + ':' + position;
      assert.ok(byKey.has(key) && !used.has(key), key);
      used.add(key);
      return byKey.get(key);
    });
    assert.deepEqual([...new Set(rows.map(row => row.document))].sort(), [...item.documents].sort());
    assert.equal(sum(rows, 'accruedClp'), item.ledgerAccruedClp);
    assert.equal(sum(rows, 'paidClp'), item.ledgerPaidClp);
    assert.ok(rows.every(row => row.reportedPaymentDate === item.ledgerDate));
  }
  assert.equal(sum(group.installments, 'ledgerAccruedClp'), group.ledgerAccruedClp);
  assert.equal(sum(group.installments, 'ledgerPaidClp'), group.ledgerPaidClp);
}
assert.equal(used.size, byKey.size);
assert.equal(used.size, 76);
assert.equal(sum(edition.agreements.filter(row => row.year === 2025), 'ledgerPaidClp'), 5_622_042_000);
const original = edition.agreements.find(row => row.id === 'original-2025');
assert.deepEqual(original.installments.map(row => Object.keys(row.matchingCommuneTotals).length), [7, 7, 7]);
assert.equal(original.installments[2].ledgerDate, '2026-01-07');
const renewal = edition.agreements.find(row => row.id === 'renewal-2026');
assert.equal(renewal.basis, 'amount-and-institution-comparison');
assert.equal(renewal.reference, null);
assert.deepEqual(renewal.installments.map(row => [row.ledgerPaidClp, row.ledgerDate, row.recipientReported.paidClp, row.recipientReported.date]), [
  [2_039_961_600, '2026-05-08', 2_039_961_600, '2026-04-30'],
  [1_529_971_200, '2026-09-07', 1_529_971_200, null],
  [0, null, 1_529_971_200, null],
]);
assert.deepEqual(edition.agreements.filter(row => row.id.startsWith('glosa-'))
  .map(row => [row.year, row.installments[0].ledgerDate, row.installments[0].recipientReported.date]), [
  [2025, '2025-04-25', '2025-04-23'], [2026, '2026-05-08', '2026-04-30'],
]);
assert.deepEqual(edition.donations.map(row => [row.year, row.rowCount, row.reportedClp]),
  [[2022, 0, null], [2023, 0, null], [2024, 10, 117_295_275], [2025, 30, 364_898_960]]);
assert.deepEqual(edition.accounts.map(row => [row.year, row.senadisSubsidyClpThousands, row.deferredSenadisClpThousands]),
  [[2024, 3_688_534, 200_832], [2025, 4_070_010, 1_261_120]]);
for (const [file, rows] of [['edition.json', null], ['residences.csv', 10], ['installments.csv', 11], ['financial-disclosures.csv', 4]]) {
  const publicBytes = readFileSync('public/' + path + file);
  if (rows !== null) assert.equal(publicBytes.toString().trimEnd().split('\n').length, rows + 1, file);
  assert.deepEqual(publicBytes, readFileSync('dist/' + path + file), file);
}
const html = readFileSync('dist/record/funding-flows/chile-coanil-agreements/index.html', 'utf8');
assert.equal((html.match(/<tr data-installment=/g) ?? []).length, 11);
assert.equal((html.match(/<tr data-folio=/g) ?? []).length, 10);
assert.match(html, /data-installment="renewal-2026-3"/);
assert.match(html, /#recipient-70267000-4/);
console.log('Chile COANIL: ten awards, seven communes, 76 unique ledger references, five agreements, three reported-date differences and four exact downloads checked.');
