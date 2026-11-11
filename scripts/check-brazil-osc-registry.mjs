import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { formatCnpj, readCnpj } from '../src/lib/client/brazil-transferegov.ts';

const registryDir = new URL('../public/data/charity-registry/brazil-osc/', import.meta.url);
const transferDir = new URL('../public/data/funding-flows/brazil-transferegov/', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('manifest.json', registryDir)));
const transfer = JSON.parse(readFileSync(new URL('manifest.json', transferDir)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function records(dir, asset) {
  const packed = readFileSync(new URL(asset.path, dir));
  assert.equal(packed.length, asset.bytes);
  assert.equal(hash(packed), asset.sha256);
  const decoded = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
  assert.equal(decoded.length, asset.decodedBytes);
  assert.equal(hash(decoded), asset.decodedSha256);
  const rows = JSON.parse(decoded);
  assert.equal(rows.length, asset.rows);
  return rows;
}

assert.equal(registry.format, 'charitology-br-osc-registry-v1');
assert.equal(registry.source.edition, '2026-08');
assert.equal(registry.source.sourceRows, 1_113_949);
assert.equal(registry.source.sourceBytes, 343_956_497);
assert.equal(registry.source.sourceSha256, '77d4b622ae84df3cc97fb274662463b9112a8e2e93e655e1beb3316fad37193e');
assert.equal(registry.source.dictionarySha256, 'c52a109a3e498e180c2b0947804c1d76425a163a5f6e920823eb1b1c98e91c95');
assert.equal(registry.source.terms, 'https://mapaosc.ipea.gov.br/termosuso');
assert.equal(registry.transfers.assetSha256, transfer.asset.sha256);
assert.deepEqual(registry.fields, ['cnpj', 'ipeaSourceRecord', 'registrationStatus', 'officeType', 'registeredState']);
assert.equal(registry.sourceColumns.registeredState, 'UF_Sigla');
assert.equal(readCnpj('00.000.000/E08G-12'), '00000000E08G12');
assert.equal(readCnpj('00.000.000/E08G-13'), null);
assert.equal(readCnpj('00000000000000'), null);

const ids = new Set(), sourceRecords = new Set();
const statuses = {}, offices = {};
let previous = '';
for (const row of records(registryDir, registry.asset)) {
  assert.equal(row.length, registry.fields.length);
  const [cnpj, record, status, office, state] = row;
  assert.equal(readCnpj(formatCnpj(cnpj)), cnpj);
  assert.ok(cnpj > previous && !ids.has(cnpj));
  assert.ok(Number.isSafeInteger(record) && record >= 1 && record <= registry.source.sourceRows && !sourceRecords.has(record));
  assert.ok(['Ativa', 'Inapta', 'Nula ou Baixada', 'Suspensa'].includes(status));
  assert.ok(['Matriz', 'Filial', 'Não Identificado'].includes(office));
  assert.ok(state === null || /^[A-Z]{2}$/.test(state));
  previous = cnpj;
  ids.add(cnpj);
  sourceRecords.add(record);
  statuses[status] = (statuses[status] ?? 0) + 1;
  offices[office] = (offices[office] ?? 0) + 1;
}
assert.equal(ids.size, 3645);
assert.deepEqual(statuses, registry.registrationStatuses);
assert.deepEqual(offices, registry.officeTypes);
const ambiguous = new Set(registry.ambiguousCnpjs);
assert.equal(ambiguous.size, 0);

const agreements = records(transferDir, transfer.asset);
const orderIds = new Set(), agreementIds = new Set();
const identifiers = new Set(agreements.map(row => row[2]));
assert.equal(identifiers.size, registry.transfers.identifiers);
assert.equal(agreements.length, registry.transfers.agreements);
for (const id of [...ids, ...ambiguous]) assert.ok(identifiers.has(id), id);

const totals = new Map();
for (const [kind, expected] of Object.entries(registry.coverage)) {
  const matching = agreements.filter(row => {
    const actual = ids.has(row[2]) ? 'exact' : ambiguous.has(row[2]) ? 'ambiguous' : 'unmatched';
    return actual === kind;
  });
  assert.equal(new Set(matching.map(row => row[2])).size, expected.identifiers);
  assert.equal(matching.length, expected.agreements);
  const orders = [];
  for (const [agreement, , cnpj, , , , , , , group] of matching) {
    assert.ok(!agreementIds.has(agreement));
    agreementIds.add(agreement);
    for (const [order, date, cents] of group) {
      assert.ok(!orderIds.has(order) && Number.isSafeInteger(cents) && cents > 0);
      orderIds.add(order);
      orders.push({ cnpj, year: date.slice(0, 4), cents });
    }
  }
  assert.equal(orders.length, expected.orders);
  const years = new Set(orders.map(order => order.year));
  assert.deepEqual([...years].sort(), Object.keys(expected.byBankOrderYear).sort());
  for (const [year, declared] of Object.entries(expected.byBankOrderYear)) {
    const period = orders.filter(order => order.year === year);
    const sum = period.reduce((cents, order) => cents + order.cents, 0);
    assert.deepEqual({ identifiers: new Set(period.map(order => order.cnpj)).size, orders: period.length, centsBRL: sum }, declared);
    const total = totals.get(year) ?? { orders: 0, cents: 0 };
    totals.set(year, { orders: total.orders + period.length, cents: total.cents + sum });
  }
}
assert.equal(orderIds.size, registry.transfers.orders);
assert.equal(agreementIds.size, registry.transfers.agreements);
for (const [year, reported] of Object.entries(transfer.coverage)) {
  assert.deepEqual(totals.get(year), { orders: reported.includedOrders, cents: reported.reportedOrderCents });
}
assert.equal(registry.coverage.unmatched.identifiers, 166);
assert.equal(registry.coverage.unmatched.orders, 407);

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = 'record/charity-index/brazil/';
const page = readFileSync(`dist/${route}index.html`, 'utf8');
assert.ok(page.includes('Report an error') && page.includes(registry.source.terms));
assert.ok(page.includes('status and location belong to August 2026'));
assert.ok(page.includes(`data-transfer-page="${base}/record/funding-flows/brazil-transferegov/"`));
assert.ok(page.includes(`href="${base}/data/charity-registry/brazil-osc/registrations.json.gz"`));
for (const path of ['record/charity-index/', 'record/charity-index/coverage/', 'record/funding-flows/brazil-transferegov/']) {
  assert.ok(readFileSync(`dist/${path}index.html`, 'utf8').includes(`href="${base}/${route}"`), path);
}
console.log(`Brazil civil society registry verified: ${ids.size} exact CNPJs, ${registry.coverage.unmatched.identifiers} unresolved and ${orderIds.size} distinct bank orders reconciled.`);
