import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/client/csv.ts';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const path = '/record/funding-flows/brazil-infrastructure-work-lots/';
const projectPath = '/record/funding-flows/brazil-project-execution/';
const directory = 'src/data/funding-flows/';
const read = file => readFileSync(file, 'utf8');
const html = route => read('dist' + route + 'index.html');
const edition = name => JSON.parse(read(directory + name + '.json'));
const data = edition('brazil-infrastructure-work-lots');
const { coverage, sources, contractCoverage, lots, subgoals, authorizations } = data;
const projectEdition = edition('brazil-project-execution');
const contracts = edition('brazil-project-contracts');
const payments = edition('brazil-infrastructure-procurement-payments');
assert.equal(data.currency, 'BRL');
for (const [field, name] of [
  ['projectEditionSha256', 'brazil-project-execution'],
  ['cipiContractEditionSha256', 'brazil-project-contracts'],
  ['paymentContractEditionSha256', 'brazil-infrastructure-procurement-payments'],
  ['worksMeasurementEditionSha256', 'brazil-works-measurements'],
]) {
  const bytes = readFileSync(directory + name + '.json');
  assert.equal(sources[field], createHash('sha256').update(bytes).digest('hex'), field);
}
for (const name of ['siconv_contrato', 'siconv_licitacao']) {
  assert.deepEqual(sources.archives[name], contracts.sources.archives[name]);
}
const lotArchive = sources.archives.siconv_inst_cont_contratos_lotes_empresas_modulo_empresas;
const subgoalArchive = sources.archives.siconv_inst_cont_metas_submetas_po_modulo_empresas;
const authorizationArchive = sources.archives.siconv_inst_cont_proposta_aio_modulo_empresas;
assert.deepEqual([lotArchive.dataRows, subgoalArchive.dataRows, authorizationArchive.dataRows], [38521, 47595, 33235]);

const projectByAgreement = new Map(projectEdition.projects.map(row => [row.agreement, row]));
const contractKey = row => [row.agreement, row.procurementId, row.contractId].join(':');
const lotKey = row => [row.worksInstrumentId, row.lotId].join(':');
const idFields = row => [row.agreement, row.proposal, row.project];
const keySet = (rows, key) => [...new Set(rows.map(key))].sort();
const cipi = contractCoverage.filter(row => row.cohort === 'cipi');
const paid = contractCoverage.filter(row => row.cohort === 'payments');
const matched = cipi.filter(row => row.linkStatus === 'linked');
assert.deepEqual(keySet(cipi, contractKey), keySet(contracts.contracts.map(row => ({
  agreement: row.agreement, ...row.procurementContract,
})), contractKey));
assert.deepEqual(keySet(paid, contractKey), keySet(payments.contracts, contractKey));
assert.equal(contractCoverage.length, cipi.length + paid.length);
assert.deepEqual([cipi.length, paid.length, matched.length], [65, 58, 55]);
assert.ok(paid.every(row => row.linkStatus === 'noExactWorksMatch'));
assert.equal(cipi.filter(row => row.linkStatus === 'noExactWorksMatch').length, 10);
assert.deepEqual(keySet(lots, contractKey), keySet(matched, contractKey));

const lotByKey = new Map(lots.map(row => [lotKey(row), row]));
const authorizationByInstrument = new Map(authorizations.map(row => [row.worksInstrumentId, row]));
const matchesByContract = new Map(matched.map(row => [contractKey(row), row]));
assert.equal(lotByKey.size, lots.length);
assert.equal(authorizationByInstrument.size, authorizations.length);
assert.equal(keySet(subgoals, row => lotKey(row) + ':' + row.subgoalId).length, subgoals.length);
assert.deepEqual(keySet(subgoals, lotKey), keySet(lots, lotKey));
assert.deepEqual(keySet(lots, row => row.worksInstrumentId), keySet(authorizations, row => row.worksInstrumentId));
for (const row of [...cipi, ...lots, ...subgoals, ...authorizations]) {
  assert.deepEqual(idFields(row), idFields(projectByAgreement.get(row.agreement)), row.agreement);
}
const inRange = (value, archive) => Number.isInteger(value) && value > 0 && value <= archive.dataRows;
for (const row of lots) {
  const contract = matchesByContract.get(contractKey(row));
  assert.deepEqual([row.contractNumber, row.signedOn], [contract.contractNumber, contract.signedOn]);
  assert.deepEqual(idFields(row), idFields(authorizationByInstrument.get(row.worksInstrumentId)));
  assert.ok(inRange(row.lotSourceRow, lotArchive));
}
for (const row of subgoals) {
  assert.deepEqual(idFields(row), idFields(lotByKey.get(lotKey(row))));
  assert.ok(inRange(row.subgoalSourceRow, subgoalArchive));
  assert.ok(Number.isSafeInteger(row.tenderedAmountCentsBRL) && row.tenderedAmountCentsBRL >= 0);
  assert.match(row.sourceLocalityCode, /^[A-Z]{2}$/);
  assert.match(row.plannedStartOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(row.budgetReferenceOn, /^\d{4}-\d{2}-\d{2}$/);
}
for (const row of authorizations) {
  assert.ok(inRange(row.authorizationSourceRow, authorizationArchive));
  if (row.authorizationStatus === 'Emitida') {
    assert.match(row.authorizationId, /^\d+$/);
    assert.match(row.issuedOn, /^\d{4}-\d{2}-\d{2}$/);
  } else assert.deepEqual([row.authorizationStatus, row.authorizationId, row.issuedOn], ['Não Emitida', null, null]);
}
assert.deepEqual([lots.length, subgoals.length, authorizations.length, authorizations.filter(row => row.issuedOn).length],
  [coverage.lots, coverage.subgoals, coverage.authorizations, coverage.issuedAuthorizations]);
assert.deepEqual([lots.length, subgoals.length, authorizations.length, coverage.issuedAuthorizations], [57, 73, 53, 51]);
const agreementsWithLots = new Set(lots.map(row => row.agreement));
assert.equal(agreementsWithLots.size, 53);

const lookup = html(path);
assert.deepEqual(JSON.parse(read('dist' + path + 'data.json')), data);
for (const [stage, rows] of Object.entries({ contracts: contractCoverage, lots, subgoals, authorizations })) {
  const [columns, ...records] = parseCsv(read('dist' + path + stage + '.csv'));
  assert.equal(records.length, rows.length, stage);
  assert.ok(!columns.some(column => /supplier|cnpj|latitude|longitude|paymentCents/i.test(column)), stage);
  for (const [index, row] of rows.entries()) {
    const expected = row.cohort === 'payments'
      ? columns.filter(column => !['proposal', 'project', 'contractNumber', 'signedOn'].includes(column))
      : columns;
    assert.deepEqual(Object.keys(row).sort(), [...expected].sort(), stage);
    assert.deepEqual(records[index], columns.map(column => String(row[column] ?? '')), stage);
  }
  if (stage !== 'contracts') {
    assert.equal([...lookup.matchAll(new RegExp(`data-work-lot-row="${stage}"`, 'g'))].length, rows.length, stage);
  }
}
for (const project of projectEdition.projects) {
  const page = html(projectPath + project.agreement + '/');
  assert.ok(page.includes('id="work-lots"') && page.includes('href="#work-lots"'), project.agreement);
  const filter = agreementsWithLots.has(project.agreement) ? '?agreement=' + project.agreement + '#lots' : '#coverage';
  assert.ok(page.includes(`href="${base + path + filter}"`), project.agreement);
}
for (const page of ['/record/funding-flows/', '/record/charity-index/coverage/', '/record/funding-flows/brazil-project-contracts/', '/record/funding-flows/brazil-works-measurements/']) {
  assert.ok(html(page).includes(`href="${base + path}"`), page);
}
console.log('Brazil works lots: 123 contract checks, 57 lots, 73 subgoals, 53 authorization records, 88 project links and five downloads checked.');
