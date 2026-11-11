import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const path = '/record/funding-flows/brazil-infrastructure-procurement-payments/';
const projectPath = '/record/funding-flows/brazil-project-execution/';
const dir = 'src/data/funding-flows/';
const bytes = file => readFileSync(file);
const json = file => JSON.parse(bytes(file));
const html = route => bytes('dist' + route + 'index.html').toString();
const sha = file => createHash('sha256').update(bytes(file)).digest('hex');

const data = json(dir + 'brazil-infrastructure-procurement-payments.json');
const { coverage, procurements, contracts, sources } = data;
for (const [source, name] of [
  ['projectEditionSha256', 'brazil-project-execution'],
  ['accountEditionSha256', 'brazil-infrastructure-account-movements'],
  ['invoiceEditionSha256', 'brazil-infrastructure-invoice-items'],
  ['cipiContractEditionSha256', 'brazil-project-contracts'],
]) assert.equal(sources[source], sha(dir + name + '.json'), source);
const cipi = json(dir + 'brazil-project-contracts.json');
for (const name of ['siconv_licitacao', 'siconv_contrato']) {
  assert.deepEqual(sources.archives[name], cipi.sources.archives[name], name);
}
assert.equal(sources.archives.siconv_dl.dataRows, 7710768);
assert.equal(data.currency, 'BRL');
const projects = json(dir + 'brazil-project-execution.json').projects;
const invoice = Map.groupBy(json(dir + 'brazil-infrastructure-invoice-items.json').periods, row => row.agreement);
const byAgreement = Map.groupBy(procurements, row => row.agreement);
const byTender = Map.groupBy(contracts, row => row.procurementId);
const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const key = row => [row.agreement, row.procurementId, row.contractId].join(':');
const cipiKeys = new Set(cipi.contracts.map(row => key({ agreement: row.agreement, ...row.procurementContract })));
const stateNames = ['verified', 'noReference', 'unresolved'];
const commonFields = [
  'agreement', 'proposal', 'project', 'procurementId', 'procurementSourceRow',
  'documents', 'paymentRows', 'reportedPaymentCentsBRL', 'firstPaymentYear', 'lastPaymentYear',
].sort();

function checkAmounts(row) {
  assert.ok(Number.isInteger(row.documents) && row.documents > 0);
  assert.ok(row.paymentRows >= row.documents);
  assert.ok(Number.isSafeInteger(row.reportedPaymentCentsBRL) && row.reportedPaymentCentsBRL >= 0);
  assert.ok(row.firstPaymentYear <= row.lastPaymentYear);
  assert.ok(row.lastPaymentYear <= Number(data.capturedOn.slice(0, 4)));
  assert.ok(Number.isInteger(row.procurementSourceRow) && row.procurementSourceRow > 0 &&
    row.procurementSourceRow <= sources.archives.siconv_licitacao.dataRows);
}
assert.equal(new Set(procurements.map(row => row.procurementId)).size, procurements.length);
assert.equal(new Set(contracts.map(key)).size, contracts.length);
for (const row of contracts) {
  assert.deepEqual(Object.keys(row).sort(), [...commonFields, 'contractId', 'contractSourceRow', 'alsoInCipiContractEdition'].sort());
  assert.ok(Number.isInteger(row.contractSourceRow) && row.contractSourceRow > 0 &&
    row.contractSourceRow <= sources.archives.siconv_contrato.dataRows);
  assert.equal(row.alsoInCipiContractEdition, cipiKeys.has(key(row)));
  checkAmounts(row);
}
for (const row of procurements) {
  assert.deepEqual(Object.keys(row).sort(), [...commonFields, 'contractStates'].sort());
  assert.deepEqual(Object.keys(row.contractStates), stateNames);
  assert.equal(sum(Object.values(row.contractStates), n => n), row.documents);
  checkAmounts(row);
  const subset = byTender.get(row.procurementId) ?? [];
  assert.equal(sum(subset, contract => contract.documents), row.contractStates.verified);
  assert.ok(sum(subset, contract => contract.paymentRows) <= row.paymentRows);
  assert.ok(sum(subset, contract => contract.reportedPaymentCentsBRL) <= row.reportedPaymentCentsBRL);
  for (const contract of subset) {
    assert.deepEqual([contract.agreement, contract.proposal, contract.project, contract.procurementSourceRow],
      [row.agreement, row.proposal, row.project, row.procurementSourceRow]);
  }
}

for (const project of projects) {
  const rows = byAgreement.get(project.agreement) ?? [];
  const cohorts = invoice.get(project.agreement) ?? [];
  for (const row of rows) assert.deepEqual([row.proposal, row.project], [project.proposal, project.project]);
  assert.deepEqual([sum(rows, row => row.documents), sum(rows, row => row.paymentRows), sum(rows, row => row.reportedPaymentCentsBRL)],
    [sum(cohorts, row => row.documents), sum(cohorts, row => row.comparablePaymentRows), sum(cohorts, row => row.reportedPaymentCentsBRL)]);
  const page = html(projectPath + project.agreement + '/');
  assert.ok(page.includes('id="procurement-payments"') && page.includes('href="#procurement-payments"'), project.agreement);
  const link = rows.length ? path + '?agreement=' + project.agreement + '#procurements' : path;
  assert.ok(page.includes(`href="${base + link}"`), project.agreement);
}
assert.deepEqual([coverage.projectAgreements, coverage.agreementsWithProcurements, coverage.procurements, coverage.documents, coverage.paymentRows],
  [projects.length, byAgreement.size, procurements.length, sum(procurements, row => row.documents), sum(procurements, row => row.paymentRows)]);
assert.deepEqual(Object.values(coverage.contractStates), [211, 1157, 14]);
assert.deepEqual(coverage.unresolvedContractReasons, { missingPair: 14, repeatedPair: 0, supplierDiffers: 0 });
assert.deepEqual([coverage.verifiedContracts, coverage.agreementsWithVerifiedContracts, coverage.contractsAlsoInCipiEdition],
  [58, 12, 0]);
assert.equal(sum(contracts, row => row.documents), coverage.contractStates.verified);
assert.ok(contracts.every(row => byTender.has(row.procurementId) && procurements.some(t => t.procurementId === row.procurementId)));
assert.equal(sum(byAgreement.get('887109'), row => row.contractStates.unresolved), 14);
assert.equal(sum(byAgreement.get('953157'), row => row.reportedPaymentCentsBRL), 105606931);
assert.equal(sum(byAgreement.get('895978'), row => row.reportedPaymentCentsBRL), 13746618);
const example = contracts.find(row => row.agreement === '825120' && row.procurementId === '579416' && row.contractId === '434206');
assert.deepEqual([example.documents, example.reportedPaymentCentsBRL, example.firstPaymentYear, example.lastPaymentYear],
  [10, 56711818, 2018, 2021]);

assert.deepEqual(json('dist' + path + 'data.json'), data);
const lookup = html(path);
for (const [name, records] of [['procurements', procurements], ['contracts', contracts]]) {
  assert.equal([...lookup.matchAll(new RegExp(`data-procurement-payment="${name}"`, 'g'))].length, records.length);
  const [header, ...lines] = bytes('dist' + path + name + '.csv').toString().trimEnd().split('\n');
  assert.equal(header.split(',')[7], 'reportedPaymentCentsBRL');
  assert.equal(lines.length, records.length);
  for (const [index, line] of lines.entries()) {
    assert.equal(line.split(',').length, header.split(',').length);
    assert.equal(Number(line.split(',')[7]), records[index].reportedPaymentCentsBRL);
  }
}
for (const route of ['/record/funding-flows/', '/record/charity-index/coverage/', '/record/funding-flows/brazil-infrastructure-invoice-items/']) {
  assert.ok(html(route).includes(`href="${base + path}"`), route);
}
console.log('Brazil procurement payments: 334 procurements, 58 verified contracts, 88 project sections and all three downloads checked.');
