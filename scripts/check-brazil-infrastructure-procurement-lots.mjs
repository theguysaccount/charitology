import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(`src/data/funding-flows/${name}.json`);
const read = name => JSON.parse(source(name));
const edition = read('brazil-infrastructure-procurement-lots');
const payments = read('brazil-infrastructure-procurement-payments');
const works = read('brazil-infrastructure-work-lots');
const caseStudy = read('brazil-joacaba-rehabilitation');
const contracts = read('brazil-project-contracts');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sameProcurement = (left, right) => ['agreement', 'proposal', 'project', 'procurementId'].every(key => left[key] === right[key]);

assert.equal(edition.currency, 'BRL');
assert.equal(edition.license, payments.sources.license);
for (const name of ['brazil-infrastructure-procurement-payments', 'brazil-infrastructure-work-lots']) {
  assert.equal(edition.upstreamEditionSha256[name + '.json'], sha(source(name)));
}

const seen = new Set();
for (const payment of payments.procurements) {
  const candidates = works.lots.filter(lot => sameProcurement(lot, payment));
  const matches = edition.procurements.filter(row => sameProcurement(row, payment));
  assert.equal(matches.length, candidates.length ? 1 : 0, payment.procurementId);
  if (!matches.length) continue;
  const [{ lots, ...original }] = matches;
  assert.deepEqual(original, payment, payment.procurementId);
  assert.equal(original.contractStates.noReference, original.documents);
  assert.equal(lots.length, candidates.length);
  for (const lot of lots) {
    const originalLot = candidates.find(candidate => candidate.lotId === lot.lotId);
    assert.ok(originalLot);
    const { worksInstrumentId, worksContractId, lotId, lotNumber, lotSourceRow } = originalLot;
    assert.deepEqual(lot, { worksInstrumentId, worksContractId, lotId, lotNumber, lotSourceRow });
    const identity = worksInstrumentId + ':' + lotId;
    assert.ok(!seen.has(identity), identity);
    seen.add(identity);
  }
}
const { paymentEdition, linked, oneLot, multipleLots, noLotMatch, linkedLotReferences } = edition.coverage;
assert.equal(edition.procurements.length, linked.procurements);
assert.equal(seen.size, linkedLotReferences);
assert.deepEqual(
  [paymentEdition.procurements, linked.procurements, linked.agreements, linked.expenseDocuments, linked.paymentRows,
    linked.reportedPaymentCentsBRL, oneLot.procurements, multipleLots.procurements, noLotMatch.procurements, linkedLotReferences],
  [334, 53, 52, 332, 340, 7370484441, 51, 2, 281, 55],
);
for (const key of ['procurements', 'expenseDocuments', 'paymentRows', 'reportedPaymentCentsBRL']) {
  assert.equal(linked[key] + noLotMatch[key], paymentEdition[key], key);
  assert.equal(oneLot[key] + multipleLots[key], linked[key], key);
}

assert.equal(caseStudy.facility.cnes, '2964511');
assert.equal(caseStudy.facility.institutionalCnpj, '84592369000120');
const caseRows = edition.procurements.filter(row => row.agreement === caseStudy.agreement);
assert.equal(caseRows.length, 2);
for (const contract of caseStudy.contracts) {
  const row = caseRows.find(row => row.procurementId === contract.procurementId);
  assert.ok(row && row.lots.length === 1);
  assert.equal(row.lots[0].lotId, contract.lotId);
  assert.equal(row.lots[0].worksContractId, contract.worksContractId);
  const cipi = contracts.contracts.find(row => row.agreement === caseStudy.agreement && row.procurementContract?.procurementId === contract.procurementId);
  assert.equal(cipi?.globalAmountCentsBRL, contract.cipiAmountCentsBRL);
}
assert.equal(caseStudy.contracts[0].signedAmountCentsBRL, 78713282);
assert.equal(caseStudy.contracts[1].signedAmountCentsBRL, 30788109);
assert.equal(caseStudy.contracts[1].cipiAmountCentsBRL - caseStudy.contracts[1].signedAmountCentsBRL, 2324);
assert.deepEqual(caseStudy.startAuthorization, { worksInstrumentId: '20010', id: '20774', issuedOn: '2025-03-19' });
const { rows, municipalities, totals } = caseStudy.catchment;
assert.equal(new Set(rows.map(row => row.municipalityCode)).size, 53);
assert.equal(rows.length, municipalities);
assert.ok(rows.every(row => row.municipalityCode.startsWith('42') && row.peopleAge2AndOlderWithDisability <= row.peopleAge2AndOlder));
for (const key of ['peopleAge2AndOlder', 'peopleAge2AndOlderWithDisability']) {
  assert.equal(rows.reduce((total, row) => total + row[key], 0), totals[key], key);
}
assert.deepEqual(totals, { peopleAge2AndOlder: 619730, peopleAge2AndOlderWithDisability: 41412 });
for (const document of Object.values(caseStudy.documents)) {
  assert.ok(document.url.startsWith('https://'));
  if ('bytes' in document) assert.match(document.sha256, /^[a-f0-9]{64}$/);
}
const { fundTransfers, municipalContract, hearingCommitments, unverified } = caseStudy.operations;
const order = fundTransfers.exactOrdinanceOrder;
assert.equal(fundTransfers.municipalityCodeSixDigit, caseStudy.facility.municipalityCode.slice(0, 6));
assert.equal(fundTransfers.fundCnpj, '10594533000100');
assert.deepEqual(
  [order.year, order.ordinancePrinted, order.siafiOrderNumber, order.recordedOn, order.grossCentsBRL, order.netCentsBRL],
  [2024, '05402', '029513', '2024-10-22', 27000000, 27000000],
);
assert.equal(new URL(order.filteredSource.url).searchParams.get('portaria'), order.ordinancePrinted);
assert.deepEqual(fundTransfers.yearly.map(row => [
  row.year, row.latestListedMonth, row.detailOrders, row.summaryNetCentsBRL, row.detailNetCentsBRL, row.differenceCentsBRL,
]), [
  [2024, 12, 13, 772029528, 772029528, 0],
  [2025, 12, 14, 1091332335, 1092469638, 1137303],
  [2026, 11, 13, 987001167, 987001167, 0],
]);
for (const row of fundTransfers.yearly) {
  assert.equal(row.detailNetCentsBRL - row.summaryNetCentsBRL, row.differenceCentsBRL);
  for (const receipt of Object.values(row.sources)) {
    const url = new URL(receipt.url);
    assert.equal(url.hostname, 'consultafns.saude.gov.br');
    assert.equal(url.searchParams.get('ano'), String(row.year));
    assert.equal(url.searchParams.get('cpfCnpjUg'), fundTransfers.fundCnpj);
    assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  }
}
const { year, eachNetCentsBRL, orders } = fundTransfers.reconciliationExample;
assert.equal(year, 2025);
assert.equal(eachNetCentsBRL, fundTransfers.yearly.find(row => row.year === year).differenceCentsBRL);
assert.deepEqual(orders.map(order => [order.siafiOrderNumber, order.recordedOn]), [
  ['016472', '2025-06-02'], ['018828', '2025-06-12'],
]);
assert.equal(municipalContract.monthlyCentsBRL * municipalContract.termMonths, municipalContract.annualCentsBRL);
assert.equal(municipalContract.annualCentsBRL, caseStudy.services.authorizedAnnualOperatingCentsBRL);
assert.equal(hearingCommitments.initialMonthlyCentsBRL * 12, hearingCommitments.awardCentsBRL);
assert.deepEqual(hearingCommitments.sharedMonthlyTargets, {
  referralRegions: 3, initialAssessmentsAndHearingAidReplacements: 50, followUps: 100,
});
assert.ok(unverified.includes('municipal payments to clinic operator') && unverified.includes('observed service counts'));

const dist = process.env.CHARITOLOGY_DIST || 'dist';
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/brazil-infrastructure-procurement-lots/';
const output = (name, path = route) => readFileSync(dist + path + name);
assert.deepEqual(output('data.json'), source('brazil-infrastructure-procurement-lots'));
assert.deepEqual(output('case.json'), source('brazil-joacaba-rehabilitation'));
const comparison = output('index.html').toString();
assert.ok(comparison.includes('id="operations"') && comparison.includes('href="#operations"'));
assert.ok(comparison.includes('portaria=05402') && comparison.includes('Through November · partial year'));
const csv = name => output(name + '.csv').toString().trimEnd().split('\n');
const [procurementHeader, ...procurementRows] = csv('procurements');
const [lotHeader, ...lotRows] = csv('lot-references');
assert.equal(procurementRows.length, linked.procurements);
assert.equal(lotRows.length, seen.size);
assert.ok(procurementHeader.split(',').includes('reportedPaymentCentsBRL'));
assert.equal(lotHeader, 'agreement,proposal,project,procurementId,worksInstrumentId,worksContractId,lotId,lotNumber,lotSourceRow');
for (const path of ['/record/funding-flows/', '/record/charity-index/coverage/',
  '/record/funding-flows/brazil-infrastructure-procurement-payments/', '/record/funding-flows/brazil-infrastructure-work-lots/']) {
  assert.ok(output('index.html', path).toString().includes(`href="${base + route}"`), path);
}
for (const agreement of new Set(edition.procurements.map(row => row.agreement))) {
  const html = output('index.html', `/record/funding-flows/brazil-project-execution/${agreement}/`).toString();
  assert.ok(html.includes(`href="${base + route}?agreement=${agreement}#lookup"`), agreement);
}
console.log('Brazil procurement-to-lot comparison: 334 source procurements, 53 matches, 55 works references, 53 census joins and three years of Joaçaba transfer records verified.');
