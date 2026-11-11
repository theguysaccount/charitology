import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = new URL('../public/data/funding-flows/brazil-transferegov/', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
const { asset, coverage, source } = manifest;
assert.equal(manifest.format, 'charitology-br-transferegov-v1');
assert.equal(manifest.currency, 'BRL');
assert.equal(source.publisher, 'Transferegov.br');
assert.equal(source.license, 'https://opendatacommons.org/licenses/odbl/1-0/');
assert.ok(readFileSync(new URL('README.txt', root), 'utf8').includes(source.license));
assert.equal(source.legalNature, 'Organização da Sociedade Civil');
assert.deepEqual(Object.keys(source.archives), ['proposta','convenio','desembolso']);
for (const [key, archive] of Object.entries(source.archives)) {
  assert.equal(archive.url, `https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/siconv_${key}.zip`);
  assert.match(archive.sha256, /^[a-f0-9]{64}$/);
}
assert.match(source.model.sha256, /^[a-f0-9]{64}$/);
assert.deepEqual(manifest.agreementFields, ['agreementId','proposalId','cnpj','publishedOrganizationName','proponentState',
  'proposalRecord','agreementRecord','signatureDate','federalContributionAtCaptureCentsBRL','orders']);
assert.deepEqual(manifest.orderFields, ['disbursementId','bankOrderDate','madeAvailableToAgreementAccountCentsBRL','disbursementRecord']);
assert.equal(manifest.counts.joinedCivilSocietyAgreements, 48434);
assert.equal(manifest.organizations, 3811);
assert.equal(asset.path, 'agreements.json.gz');
assert.equal(asset.rows, 7900);
const packed = readFileSync(new URL(asset.path, root));
assert.equal(packed.length, asset.bytes);
assert.equal(hash(packed), asset.sha256);
assert.ok(asset.decodedBytes > 0 && asset.decodedBytes < 16_000_000);
const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
assert.equal(raw.length, asset.decodedBytes);
assert.equal(hash(raw), asset.decodedSha256);
const rows = JSON.parse(raw);
assert.equal(rows.length, asset.rows);

const dates = value => /^20\d\d-\d\d-\d\d$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
const sourceRow = (value, maximum) => Number.isSafeInteger(value) && value >= 1 && value <= maximum;
const organizations = new Set(), orders = new Set(), orderRecords = new Set(), agreementRecords = new Set();
const totals = { 2024: { rows: 0, cents: 0 }, 2025: { rows: 0, cents: 0 } };
let lastAgreement = '';
for (const row of rows) {
  assert.equal(row.length, manifest.agreementFields.length);
  const [agreement, proposal, cnpj, name, state, proposalRecord, agreementRecord, signed, contribution, records] = row;
  assert.match(agreement, /^(?:[0-9]{1,20}|[0-9][A-Z]{5})$/);
  assert.ok(agreement > lastAgreement);
  lastAgreement = agreement;
  assert.match(proposal, /^[0-9]{1,20}$/);
  assert.match(cnpj, /^[0-9A-Z]{12}[0-9]{2}$/);
  for (const position of [12, 13]) {
    const sum = [...cnpj.slice(0, position)].reverse().reduce((n, char, i) => n + (char.charCodeAt(0) - 48) * (2 + i % 8), 0);
    assert.equal(Number(cnpj[position]), (11 - sum % 11) % 11 % 10);
  }
  assert.ok(typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 320);
  assert.ok(state === null || /^[A-Z]{2}$/.test(state));
  assert.ok(sourceRow(proposalRecord, manifest.counts.proposalRows));
  assert.ok(sourceRow(agreementRecord, manifest.counts.agreementRows) && !agreementRecords.has(agreementRecord));
  assert.ok(signed === null || dates(signed));
  assert.ok(contribution === null || Number.isSafeInteger(contribution));
  assert.ok(Array.isArray(records) && records.length > 0);
  agreementRecords.add(agreementRecord);
  organizations.add(cnpj);
  let previous = '';
  for (const order of records) {
    assert.equal(order.length, manifest.orderFields.length);
    const [id, date, cents, coordinate] = order;
    assert.match(id, /^[0-9]{1,20}$/);
    assert.ok(dates(date) && date + ':' + id > previous);
    previous = date + ':' + id;
    assert.ok(Number.isSafeInteger(cents) && cents > 0 && !orders.has(id));
    assert.ok(sourceRow(coordinate, manifest.counts.disbursementRows) && !orderRecords.has(coordinate));
    orders.add(id);
    orderRecords.add(coordinate);
    const total = totals[date.slice(0, 4)];
    total.rows++;
    total.cents += cents;
  }
}
assert.equal(organizations.size, manifest.organizations);
assert.equal(orders.size, 12058);
assert.deepEqual(totals, { 2024: { rows: 4567, cents: 454975539842 }, 2025: { rows: 7491, cents: 555693713347 } });
for (const [year, total] of Object.entries(totals)) {
  const row = coverage[year];
  assert.equal(row.includedOrders, total.rows);
  assert.equal(row.reportedOrderCents, total.cents);
  assert.equal(row.sourceRows, row.includedOrders + row.outsideJoinedAgreements + row.invalidOrderRows + row.duplicateOrderRows);
}
console.log(`Brazil Transferegov verified: ${orders.size} distinct bank orders in ${rows.length} agreements.`);
