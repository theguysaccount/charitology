import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = new URL('../src/data/funding-flows/', import.meta.url);
const sources = {
  'brazil-infrastructure-procurement-payments.json': '7df2978953b130f398faaa9aec21217206250f90cff78f796dcf2e4f7aea02ff',
  'brazil-infrastructure-work-lots.json': '55f8f695bd15fced26163011a4a29227f37cd1ca19447eaf0ab8a6962cea77ac',
};
function edition(name) {
  const bytes = readFileSync(new URL(name, directory));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sources[name], name);
  return JSON.parse(bytes);
}

const payments = edition('brazil-infrastructure-procurement-payments.json');
const works = edition('brazil-infrastructure-work-lots.json');
assert.equal(payments.currency, 'BRL');
assert.equal(works.currency, 'BRL');
assert.equal(works.sources.paymentContractEditionSha256, sources['brazil-infrastructure-procurement-payments.json']);
assert.equal(works.sources.projectEditionSha256, payments.sources.projectEditionSha256);

const key = row => [row.agreement, row.proposal, row.project, row.procurementId].join(':');
const byProcurement = Map.groupBy(works.lots, key);
assert.equal(new Set(payments.procurements.map(key)).size, payments.procurements.length);
assert.equal(new Set(works.lots.map(row => `${row.worksInstrumentId}:${row.lotId}`)).size, works.lots.length);

function amounts(rows) {
  return {
    procurements: rows.length,
    agreements: new Set(rows.map(row => row.agreement)).size,
    expenseDocuments: rows.reduce((total, row) => total + row.documents, 0),
    paymentRows: rows.reduce((total, row) => total + row.paymentRows, 0),
    reportedPaymentCentsBRL: rows.reduce((total, row) => total + row.reportedPaymentCentsBRL, 0),
  };
}

const linked = [];
const missing = [];
for (const procurement of payments.procurements) {
  const lots = byProcurement.get(key(procurement));
  if (!lots) {
    missing.push(procurement);
    continue;
  }
  linked.push({
    ...procurement,
    lots: lots.map(({ worksInstrumentId, worksContractId, lotId, lotNumber, lotSourceRow }) =>
      ({ worksInstrumentId, worksContractId, lotId, lotNumber, lotSourceRow })),
  });
}
const data = {
  format: 'charitology-br-infrastructure-procurement-lots-v1',
  capturedOn: payments.capturedOn,
  currency: 'BRL',
  license: payments.sources.license,
  upstreamEditionSha256: sources,
  coverage: {
    paymentEdition: amounts(payments.procurements),
    linked: amounts(linked),
    oneLot: amounts(linked.filter(row => row.lots.length === 1)),
    multipleLots: amounts(linked.filter(row => row.lots.length > 1)),
    noLotMatch: amounts(missing),
    linkedLotReferences: linked.reduce((total, row) => total + row.lots.length, 0),
  },
  procurements: linked,
};
assert.equal(Object.values(data.coverage.linked).every(Number.isSafeInteger), true);
const output = process.argv[2];
if (!output) throw new Error('Pass an output JSON path to rebuild the pinned edition.');
writeFileSync(output, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(data.coverage));
