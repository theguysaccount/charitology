import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/client/csv.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const data = JSON.parse(read('src/data/funding-flows/brazil-cisterns.json'));
const route = '/record/funding-flows/brazil-cisterns/';
const built = 'dist' + route;
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const { agreement, amendment, accountYears, bankOrders, census, sources } = data;
const sum = (rows, select) => rows.reduce((total, row) => total + select(row), 0);

assert.equal(data.review, 'draft');
assert.equal(data.currency, 'BRL');
assert.equal(agreement.originalAgreementTotalCents + amendment.federalIncreaseCents, agreement.currentFederalContributionCents);
assert.equal(sum(bankOrders, order => order.madeAvailableCents), agreement.reportedMadeAvailableCents);
assert.equal(agreement.reportedMadeAvailableCents, agreement.currentFederalContributionCents);
assert.equal(new Set(bankOrders.map(order => order.orderId)).size, 11);
assert.equal(new Set(bankOrders.map(order => order.sourceRecord)).size, 11);
const published = JSON.parse(gunzipSync(readFileSync(new URL(
  '../public/data/funding-flows/brazil-transferegov/agreements.json.gz', import.meta.url))));
const [selected] = published.filter(row => row[0] === agreement.id);
assert.deepEqual(selected.slice(0, 3), [agreement.id, agreement.proposalId, agreement.cnpj]);
assert.deepEqual(bankOrders.filter(order => /^202[45]-/.test(order.date))
  .map(order => [order.orderId, order.date, order.madeAvailableCents, order.sourceRecord]).sort(),
selected[9].toSorted());
assert.deepEqual(accountYears.map(period => [period.calendarYear, period.partialCalendarYear, period.otherPayments.rows,
  period.otherPayments.amountCents, period.internalTransfers.rows, period.internalTransfers.amountCents]), [
  [2023, false, 17, 5_928_127, 0, 0],
  [2024, false, 192, 861_442_030, 61, 32_035_600],
  [2025, false, 126, 1_009_128_268, 76, 24_477_586],
  [2026, true, 111, 772_131_170, 53, 13_984_746],
]);
for (const period of accountYears) {
  const { onward, internalTransfers, institutionalPayees, otherPayments } = period;
  assert.equal(onward.matchedInternalIds, internalTransfers.rows);
  assert.equal(onward.internalIdsMissingAnyAmount, onward.matchedInternalIds);
  assert.equal(onward.internalIdsWithEqualAmount, 0);
  assert.ok(sum(Object.values(institutionalPayees), amount => amount.amountCents) <= otherPayments.amountCents);
}
const [somecdh, instituto] = data.institutions.map(row => row.cnpj);
assert.deepEqual([somecdh, instituto], ['02614277000130', '05670699000110']);
assert.equal(sum(accountYears, row => row.institutionalPayees[somecdh]?.amountCents ?? 0), 1_737_817_639);
assert.equal(sum(accountYears, row => row.institutionalPayees[instituto]?.amountCents ?? 0), 584_158_363);
assert.equal(sum(accountYears, row => row.institutionalPayees[somecdh]?.zeroAmountRows ?? 0), 1);

const tender = data.tenders.find(row => row.id === '001/2025');
assert.equal(sum(data.amendedTenderLots, row => row.plannedInstallations), tender.plannedInstallations);
assert.deepEqual(data.amendedTenderLots.map(row => [row.municipalityCode, row.plannedInstallations, row.maximumEstimatedCents]),
  [['1505106', 120, 333_874_860], ['1505304', 238, 614_903_542]]);
assert.deepEqual(census.find(series => series.table === '10103').rows
  .map(row => [row.municipalityCode, row.residentsWithMeasure, row.residents, row.percent]),
[['1505106', 777, 3696, '21.02'], ['1505304', 3486, 4857, '71.77']]);
assert.equal(census.find(series => series.table === '6909').rows.length, 4);
assert.equal(data.operatorReport.reportedInstallations, 70);

assert.equal(read(built + 'data.json'), JSON.stringify(data, null, 2) + '\n');
function exportRows(name) {
  const [header, ...records] = parseCsv(read(built + name + '.csv').replace(/^\uFEFF/, ''));
  assert.ok(records.length > 0);
  assert.ok(records.every(row => row.length === header.length));
  assert.equal(new Set(header).size, header.length);
  return records.map(row => Object.fromEntries(header.map((column, index) => [column, row[index]])));
}
const orderRows = exportRows('bank-orders');
assert.deepEqual(orderRows.map(row => [row.orderId, Number(row.madeAvailableCents), Number(row.sourceRecord), row.sourceSha256]),
  bankOrders.map(row => [row.orderId, row.madeAvailableCents, row.sourceRecord, sources.transferegov.archives.desembolso.sha256]));
const paymentRows = exportRows('account-payments');
assert.equal(paymentRows[0].internalTransfersCents, '');
assert.deepEqual(paymentRows.map(row => [row.calendarYear, row.partialCalendarYear, Number(row.otherPaymentsCents), Number(row.internalIdsMissingAnyOnwardAmount)]),
  accountYears.map(row => [String(row.calendarYear), String(row.partialCalendarYear), row.otherPayments.amountCents, row.onward.internalIdsMissingAnyAmount]));
const payeeRows = exportRows('institutional-payees');
assert.deepEqual(payeeRows.map(row => [row.calendarYear, row.cnpj, Number(row.amountCents), row.subsetOf]),
  accountYears.flatMap(period => Object.entries(period.institutionalPayees)
    .map(([id, row]) => [String(period.calendarYear), id, row.amountCents, 'other account payments'])));
const censusRows = exportRows('water-access');
assert.deepEqual(censusRows.map(row => [row.sidraTable, row.municipalityCode, Number(row.residents), Number(row.residentsWithMeasure), row.percent, row.sourceSha256]),
  census.flatMap(series => series.rows.map(row => [series.table, row.municipalityCode, row.residents,
    row.residentsWithMeasure, row.percent, sources.sidra.tables[series.table].sha256])));

const page = read(built + 'index.html');
for (const phrase of ['Report an error', '71.77%', '21.02%', 'operator-reported output', '2026 (partial)', 'data-site-symbol="water"']) {
  assert.ok(page.includes(phrase), phrase);
}
for (const name of ['bank-orders.csv', 'account-payments.csv', 'institutional-payees.csv', 'water-access.csv', 'data.json']) {
  assert.ok(page.includes(`href="${base + route + name}"`), name);
}
for (const entry of ['charity-index/', 'charity-index/coverage/', 'charity-index/brazil/', 'funding-flows/brazil-transferegov/', 'gap-map/']) {
  assert.ok(read('dist/record/' + entry + 'index.html').includes(base + route), entry);
}
console.log('Brazil Cisternas case: stages, institutional subsets, census measures, exact exports and five entry links pass.');
