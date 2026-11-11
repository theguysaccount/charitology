import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bytes = path => readFileSync(path);
const json = path => JSON.parse(bytes(path));
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const projectPath = '/record/funding-flows/brazil-project-execution/';
const contractPath = '/record/funding-flows/brazil-project-contracts/';
const publicFile = (path, name = 'index.html') => 'dist' + path + name;
const detail = bytes('src/data/funding-flows/brazil-project-execution.json');
const source = json('src/data/funding-flows/brazil-project-contracts.json');
const { contracts, coverage } = source;
const projects = new Map(JSON.parse(detail).projects.map(project => [project.agreement, project.project]));
assert.equal(createHash('sha256').update(detail).digest('hex'), source.sources.projectEditionSha256);

const cipi = source.sources.archives.siconv_contrato_cipi;
const siconv = source.sources.archives.siconv_contrato;
const procurement = source.sources.archives.siconv_licitacao;
const distinct = new Set();
const cipiRows = new Set();
const contractRows = new Set();
const byAgreement = Map.groupBy(contracts, record => record.agreement);
const links = new Map();
const dates = (value) => {
  if (value === null) return;
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(value + 'T00:00:00Z').toISOString().slice(0, 10), value);
};
const coordinate = (row, receipt) => {
  assert.ok(Number.isInteger(row) && row > 0 && row <= receipt.dataRows, row);
};
for (const record of contracts) {
  assert.deepEqual(Object.keys(record), ['agreement', 'project', 'contractNumber', 'signedOn', 'globalAmountCentsBRL', 'procurementContract', 'cipiRows']);
  const { agreement, procurementContract: contract } = record;
  assert.equal(projects.get(agreement), record.project);
  assert.match(record.contractNumber, /^[A-Za-z0-9][A-Za-z0-9 ./_\-]{0,63}$/);
  assert.ok(Number.isSafeInteger(record.globalAmountCentsBRL) && record.globalAmountCentsBRL > 0);
  dates(record.signedOn);
  assert.deepEqual(Object.keys(contract), ['contractId', 'procurementId', 'sourceRow', 'publishedOn', 'startsOn', 'endsOn', 'procurementSourceRow']);
  for (const id of [contract.contractId, contract.procurementId]) assert.match(id, /^[0-9]{1,20}$/);
  const key = contract.procurementId + '-' + contract.contractId;
  assert.ok(!distinct.has(key), key);
  distinct.add(key);
  coordinate(contract.sourceRow, siconv);
  coordinate(contract.procurementSourceRow, procurement);
  assert.ok(!contractRows.has(contract.sourceRow), key);
  contractRows.add(contract.sourceRow);
  for (const date of [contract.publishedOn, contract.startsOn, contract.endsOn]) dates(date);

  for (const row of record.cipiRows) {
    assert.deepEqual(Object.keys(row), ['sourceRow', 'portalReference', 'publishedOn', 'archiveStatus', 'sharedPortalReference']);
    coordinate(row.sourceRow, cipi);
    assert.ok(!cipiRows.has(row.sourceRow), row.sourceRow);
    cipiRows.add(row.sourceRow);
    dates(row.publishedOn);
    assert.match(row.portalReference, /^[0-9]{1,20}$/);
    if (!links.has(row.portalReference)) links.set(row.portalReference, new Set());
    links.get(row.portalReference).add(key);
  }
}
for (const record of contracts) {
  for (const row of record.cipiRows) assert.equal(row.sharedPortalReference, links.get(row.portalReference).size > 1, row.sourceRow);
}
assert.deepEqual(coverage, {
  projectEditionAgreements: projects.size,
  agreementsWithContractRecords: byAgreement.size,
  cipiSourceRows: cipiRows.size,
  pairedContractReferences: distinct.size,
  referencesWithRepeatedCipiRows: contracts.filter(record => record.cipiRows.length > 1).length,
  portalReferences: links.size,
  portalReferencesSharedByDifferentContracts: [...links.values()].filter(link => link.size > 1).length,
  pairedReferencesWithSharedPortalReference: contracts.filter(record => record.cipiRows.some(row => row.sharedPortalReference)).length,
});
assert.deepEqual(Object.values(coverage), [88, 63, 84, 65, 17, 77, 5, 4]);
for (const [agreement, refs] of [
  ['895978', [['001/2021', 34120000, 3], ['001/2023', 38928253, 3]]],
  ['953157', [['999994606/12/24/PJ', 78713282, 2], ['178/UNOESC/2025', 30790433, 2]]],
]) {
  assert.deepEqual(byAgreement.get(agreement).map(row => [row.contractNumber, row.globalAmountCentsBRL, row.cipiRows.length]), refs);
  assert.ok(byAgreement.get(agreement).every(row => row.cipiRows.some(item => item.sharedPortalReference)));
}

assert.deepEqual(json(publicFile(contractPath, 'data.json')), source);
for (const [file, count, amountColumn] of [['contracts.csv', 65, true], ['cipi-rows.csv', 84, false]]) {
  const [header, ...data] = bytes(publicFile(contractPath, file)).toString().trimEnd().split('\n');
  assert.equal(header.includes('globalAmountCents'), amountColumn, file);
  assert.equal(data.length, count, file);
}
const directory = bytes(publicFile(contractPath)).toString();
assert.equal([...directory.matchAll(/data-contract-row(?:\s|=|>)/g)].length, 65);
for (const id of ['lookup', 'coverage', 'downloads']) {
  assert.ok(directory.includes(`id="${id}"`) && directory.includes(`href="#${id}"`), id);
}
for (const agreement of projects.keys()) {
  const records = byAgreement.get(agreement) ?? [];
  const page = bytes(publicFile(projectPath + agreement + '/')).toString();
  assert.ok(page.includes('id="contracts"') && page.includes('href="#contracts"'), agreement);
  assert.equal([...page.matchAll(/data-contract-row(?:\s|=|>)/g)].length, records.length, agreement);
  assert.equal(page.includes('No contract from the captured CIPI archive matches this project.'), records.length === 0, agreement);
}
for (const route of ['/record/funding-flows/', '/record/charity-index/coverage/', projectPath]) {
  assert.ok(bytes(publicFile(route)).toString().includes(`href="${base + contractPath}"`), route);
}
console.log('Brazil infrastructure contracts: 65 distinct procurement pairs, 84 CIPI rows, 5 shared portal references, 88 project sections and 3 exports checked.');
