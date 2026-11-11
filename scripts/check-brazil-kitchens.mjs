import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const [caseBytes, transferBytes, publishedBytes] = await Promise.all([
  readFile(new URL('../src/data/brazil-solidarity-kitchens.json', import.meta.url)),
  readFile(new URL('../public/data/funding-flows/brazil-transferegov/agreements.json.gz', import.meta.url)),
  readFile(new URL('../dist/record/funding-flows/brazil-solidarity-kitchens/data.json', import.meta.url)),
]);
const edition = JSON.parse(caseBytes);
assert.deepEqual(JSON.parse(publishedBytes), edition);
assert.equal(createHash('sha256').update(transferBytes).digest('hex'), edition.transferEdition.sha256);
assert.equal(edition.selected.length, 23);
for (const field of ['proposalId', 'proposalNumber', 'cnpj', 'agreementId']) {
  assert.equal(new Set(edition.selected.map(row => row[field])).size, 23, field);
}

const signed = edition.selected.filter(row => row.signed);
const transfers = new Map(JSON.parse(gunzipSync(transferBytes)).map(row => [row[0], row]));
const sums = new Map();
const orderIds = new Set();
const plannedStates = new Set();
assert.equal(signed.length, 21);
assert.equal(signed.reduce((sum, term) => sum + term.contributionCents, 0), 3959562890);
assert.equal(signed.filter(term => Object.keys(term.plannedStates).length > 0).length, 20);
for (const term of edition.selected) {
  assert.equal(term.signatureFlag, term.signed ? 'SIM' : 'NÃO');
  assert.equal(term.modality, 'TERMO DE COLABORACAO');
  if (!term.signed) {
    assert.ok(!Object.hasOwn(term, 'orders') && !Object.hasOwn(term, 'plannedStates'));
    continue;
  }
  const [, proposal, cnpj, name, , proposalRecord, agreementRecord, date, contribution, orders] = transfers.get(term.agreementId);
  assert.deepEqual([proposal, cnpj, name, proposalRecord, agreementRecord, date, contribution, orders], [
    term.proposalId, term.cnpj, term.organizationName, term.proposalRecord, term.agreementRecord, term.signed, term.contributionCents, term.orders,
  ]);
  for (const [state, coordinates] of Object.entries(term.plannedStates)) {
    assert.ok(Object.hasOwn(edition.foodInsecurity2024, state));
    assert.ok(coordinates.length && coordinates.every(value => Number.isSafeInteger(value) && value > 0));
    plannedStates.add(state);
  }
  for (const [id, date, amount] of orders) {
    assert.ok(!orderIds.has(id));
    orderIds.add(id);
    const year = date.slice(0, 4);
    const [count, total] = sums.get(year) ?? [0, 0];
    sums.set(year, [count + 1, total + amount]);
  }
}
assert.equal(plannedStates.size, 9);
assert.deepEqual(Object.fromEntries(sums), { 2024: [41, 2521800256], 2025: [16, 813293695] });
assert.equal(Object.keys(edition.foodInsecurity2024).length, 27);
for (const { any, severe } of Object.values(edition.foodInsecurity2024)) {
  assert.ok(0 < Number(severe.sharePercent) && Number(severe.sharePercent) <= Number(any.sharePercent) && Number(any.sharePercent) < 100);
  assert.ok(0 < Number(severe.householdsThousands) && Number(severe.householdsThousands) <= Number(any.householdsThousands));
}
console.log('Brazil solidarity kitchens: 23 notice matches, 21 signed terms, 57 bank orders, nine plan states and 27 survey geographies verified.');
