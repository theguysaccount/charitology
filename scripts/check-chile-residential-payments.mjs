import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = 'public/data/funding-flows/chile-residential-payments/';
const read = name => readFileSync(root + name, 'utf8');
const edition = JSON.parse(read('edition.json'));
const { awards, coverage, ledger, recipients, rostrosReconciliation, monitoring } = edition;
const sum = (records, key) => records.reduce((total, row) => total + row[key], 0);
const key = row => row.source + ':' + row.sourceRow;
assert.equal(edition.currency, 'CLP');
assert.equal(edition.priorCaseSha256, createHash('sha256')
  .update(readFileSync('public/data/funding-flows/chile-residential-care/edition.json')).digest('hex'));
assert.equal(edition.citations.license, 'https://creativecommons.org/licenses/by-sa/4.0/');
assert.equal(awards.length, 37);
assert.equal(new Set(awards.map(award => award.folio)).size, awards.length);
assert.equal(sum(awards, 'awardClp'), 15_762_384_000);
assert.equal(recipients.length, 19);
assert.deepEqual(coverage.map(row => [row.period, row.sourceTotals.rows, row.awardRecipientTotals.rows, row.otherTotals.rows]), [
  [2023, 2, 2, 0], [2024, 27, 27, 0], [2025, 169, 156, 13], [2026, 119, 100, 19],
]);
assert.equal(ledger.length, 285);
assert.equal(new Set(ledger.map(key)).size, ledger.length);
assert.ok(ledger.every(row => recipients.some(recipient => recipient.rut === row.rut)));
assert.ok(ledger.every(row => row.accruedClp >= row.paidClp && (row.paidClp === 0 || row.reportedPaymentDate)));
for (const period of coverage) {
  const rows = ledger.filter(row => row.period === period.period);
  assert.equal(rows.length, period.awardRecipientTotals.rows);
  for (const metric of ['rows', 'accruedClp', 'paidClp']) {
    assert.equal(period.sourceTotals[metric], period.awardRecipientTotals[metric] + period.otherTotals[metric]);
  }
  assert.equal(sum(rows, 'paidClp'), period.awardRecipientTotals.paidClp);
  assert.equal(sum(rows, 'accruedClp'), period.awardRecipientTotals.accruedClp);
}
assert.equal(coverage.find(row => row.period === 2025).awardRecipientTotals.paidByLastRecordedPaymentYearClp['2026'], 5_441_242_691);
const program2025 = coverage.find(row => row.period === 2025).sourceTotals;
assert.deepEqual([monitoring.year, monitoring.componentsClpThousands, monitoring.administrationClpThousands, monitoring.servedPeople],
  [2025, 19_111_340, 2_229_346, 1189]);
assert.equal(monitoring.ledgerAccruedMinusComponentsClp, 890);
assert.equal(program2025.accruedClp - monitoring.componentsClpThousands * 1000, monitoring.ledgerAccruedMinusComponentsClp);
assert.equal(monitoring.regions.length, 16);
assert.deepEqual([...monitoring.regions.map(row => row.cut)].sort(), Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0')));
assert.equal(sum(monitoring.regions, 'servedPeople') + monitoring.servedPeopleRegionUnknown, monitoring.servedPeople);
assert.equal(sum(monitoring.regions, 'componentsClpThousands') + monitoring.centralComponentsClpThousands, monitoring.componentsClpThousands);
assert.equal(sum(monitoring.regions, 'ledgerRows') + monitoring.ledgerWithoutRegion.rows, program2025.rows);
assert.equal(sum(monitoring.regions, 'ledgerAccruedClp') + monitoring.ledgerWithoutRegion.accruedClp, program2025.accruedClp);
assert.equal(sum(monitoring.regions, 'ledgerPaidClp') + monitoring.ledgerWithoutRegion.paidClp, program2025.paidClp);
assert.deepEqual(monitoring.regions
  .map(row => [row.cut, row.ledgerAccruedClp - 1000 * row.componentsClpThousands])
  .filter(([, delta]) => delta !== 0), [['13', 870], ['16', 190], ['10', 930]]);
assert.deepEqual([monitoring.regionalNeed.surveyYear, monitoring.regionalNeed.minimumAge, monitoring.regionalNeed.table], [2022, 18, 13]);
const nuble = monitoring.regions.find(row => row.cut === '16');
assert.deepEqual([nuble.servedPeople, nuble.prevalencePct, nuble.absoluteErrorPp, nuble.relativeErrorPct, nuble.endideSourceRow], [1, 13.1, 2.5, 18.8, 12]);
assert.deepEqual(monitoring.outcomes, {
  improvedQualityOfLifeScore: { numerator: 153, denominator: 267 },
  individualizedCareReported: { numerator: 1117, denominator: 1189, residencesSubmittingTechnicalReport: 38 },
});
assert.equal(edition.sources.find(row => row.id === 'program-2026').lastBookMonthWithRows, 9);
for (const recipient of recipients) {
  const awardRows = awards.filter(row => row.rut === recipient.rut);
  const financial = ledger.filter(row => row.period === 2025 && row.rut === recipient.rut);
  assert.equal(recipient.awardCount, awardRows.length);
  assert.equal(recipient.rows, financial.length);
  assert.equal(recipient.awardClp, sum(awardRows, 'awardClp'));
  assert.equal(recipient.paidClp, sum(financial, 'paidClp'));
}
assert.equal(recipients.filter(row => row.paidClp === row.awardClp).length, 6);
assert.equal(recipients.filter(row => row.paidClp < row.awardClp).length, 3);
assert.deepEqual(rostrosReconciliation.map(group => [group.period, group.awardClp, sum(group.recordGroups, 'paidClp')]), [
  [2024, 650_260_000, 650_260_000], [2025, 409_596_000, 409_596_000],
]);
assert.equal(rostrosReconciliation[1].recordGroups[2].reportedPaymentDate, '2026-01-02');
assert.deepEqual(edition.rostrosGroupedApiCheck.map(row => [row.period, row.sourceGroupedSumClp, row.sumOfPaidFieldsClp]), [
  [2023, 596_224_800, 596_224_800], [2024, 706_236_000, 650_260_000],
  [2025, 426_846_000, 409_596_000], [2026, 452_952_000, 181_180_800],
]);
const extra = ledger.find(row => row.period === 2025 && row.rut === '53226150-3' && row.document === '3535202');
assert.deepEqual([extra.accruedClp, extra.paidClp, extra.reportedPaymentDate], [17_250_000, 0, null]);
for (const [name, rows] of [['awards.csv', 37], ['ledger.csv', 285], ['recipient-comparison.csv', 19], ['regional-comparison.csv', 16]]) {
  assert.equal(read(name).trimEnd().split('\n').length, rows + 1, name);
  assert.equal(read(name), readFileSync('dist/data/funding-flows/chile-residential-payments/' + name, 'utf8'));
}
assert.equal(read('edition.json'), readFileSync('dist/data/funding-flows/chile-residential-payments/edition.json', 'utf8'));
const page = readFileSync('dist/record/funding-flows/chile-residential-payments/index.html', 'utf8');
for (const recipient of recipients) {
  assert.ok(page.includes('id="recipient-' + recipient.rut + '"'));
  assert.ok(page.includes('href="#recipient-' + recipient.rut + '"'));
}
assert.equal((page.match(/<tr data-recipient-row(?:\s|>)/g) ?? []).length, recipients.length);
assert.equal((page.match(/<tr data-region-cut="\d\d"/g) ?? []).length, monitoring.regions.length);
assert.match(page, /13\.1% ± 2\.5 pp/);
assert.match(page, /153 of 267/);
assert.match(page, /Last recorded payment date/);
console.log('Chile payments: 37 award folios, 19 recipient joins, 285 ledger records, 16 regional comparisons, two monitoring indicators and five exact downloads checked.');
