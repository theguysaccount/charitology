import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = 'public/data/charity-financials/scotland';
const ewRoot = 'public/data/charity-financials/ew';
const bytes = (directory, file) => readFileSync(join(directory, file));
const json = (directory, file) => JSON.parse(bytes(directory, file));
const sha = (body) => createHash('sha256').update(body).digest('hex');
const manifest = json(root, 'manifest.json');
const comparison = json(root, 'cross-register.json');
const ewManifest = json(ewRoot, 'manifest.json');
const amount = /^-?[0-9]{1,13}$/;
const number = /^SC[0-9]{6}$/;
const isoDay = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const order = (value) => value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');

function verifiedShard(directory, asset) {
  const packed = bytes(directory, asset.path);
  assert.equal(packed.length, asset.bytes, asset.path);
  assert.equal(sha(packed), asset.sha256, asset.path);
  const raw = gunzipSync(packed);
  assert.equal(raw.length, asset.decodedBytes, asset.path);
  assert.equal(sha(raw), asset.decodedSha256, asset.path);
  assert.ok(asset.decodedBytes < 16_000_000, asset.path);
  const rows = JSON.parse(raw);
  assert.equal(rows.length, asset.rows, asset.path);
  return rows;
}

assert.deepEqual(manifest.organizationFields, ['number', 'name', 'status', 'regulatoryType',
  'mainOperatingLocation', 'geographicalSpread', 'registryRecord', 'filings']);
assert.deepEqual(manifest.periodFields, ['end', 'annualReturnReceived', 'grossIncomeGBP',
  'grossExpenditureGBP', 'sourceRecord', 'incomeDetail', 'spendingDetail']);
assert.equal(manifest.currency, 'GBP');
assert.equal(manifest.identities, 24_994);
assert.equal(manifest.counts.included, 100_514);
for (const type of ['names', 'ids']) {
  assert.deepEqual(readdirSync(join(root, type)).sort(), Object.keys(manifest[type]).map(key => key + '.json.gz').sort());
}

const organizations = new Map();
const registryRecords = new Set();
const returns = new Set();
let first = manifest.lastYearEnd;
let last = manifest.firstYearEnd;
let covered = 0;
let multiple = 0;
let incomeDetail = 0;
let spendingDetail = 0;
for (const [bucket, asset] of Object.entries(manifest.names)) {
  for (const row of verifiedShard(root, asset)) {
    assert.equal(row.length, manifest.organizationFields.length);
    const [id, name, status, type, location, spread, registryRecord, history] = row;
    assert.match(id, number);
    assert.ok(!organizations.has(id));
    assert.ok(name.length > 0 && name.length <= 250);
    assert.ok(['Active', 'Not Submitted', 'Not Monitored'].includes(status));
    assert.ok(['Standard', 'Cross Border', 'Registered Social Landlord'].includes(type));
    assert.ok(location === null || (typeof location === 'string' && location.length <= 30));
    assert.ok(spread === null || (typeof spread === 'string' && spread.length <= 80));
    assert.ok(Number.isInteger(registryRecord) && registryRecord >= 1 && registryRecord <= manifest.identities);
    assert.ok(!registryRecords.has(registryRecord));
    registryRecords.add(registryRecord);
    const key = order(name);
    assert.equal(/^[a-z0-9]/.test(key) ? key[0] : '_', bucket, id);
    assert.ok(Array.isArray(history));
    covered += Number(history.length > 0);
    multiple += Number(history.length > 1);
    let previous = '9999-12-31';
    for (const filing of history) {
      assert.equal(filing.length, manifest.periodFields.length);
      const [end, received, income, expenditure, record, incomeGroup, spendingGroup] = filing;
      assert.match(end, isoDay);
      assert.match(received, isoDay);
      assert.ok(end < previous && end <= received, id);
      previous = end;
      if (end < first) first = end;
      if (end > last) last = end;
      assert.match(income, amount);
      assert.match(expenditure, amount);
      assert.ok(Number.isInteger(record) && record >= 1 && record <= manifest.counts.input && !returns.has(record));
      returns.add(record);
      for (const [group, fields] of [[incomeGroup, manifest.incomeDetailFields], [spendingGroup, manifest.spendingDetailFields]]) {
        if (group === null) continue;
        assert.equal(group.length, fields.length);
        for (const value of group) assert.match(value, amount);
        assert.ok(group.some(value => Number(value) !== 0));
      }
      incomeDetail += Number(incomeGroup !== null);
      spendingDetail += Number(spendingGroup !== null);
    }
    organizations.set(id, { bucket, history });
  }
}
assert.equal(organizations.size, manifest.identities);
assert.equal(covered, manifest.withReturns);
assert.equal(multiple, manifest.multiPeriod);
assert.equal(returns.size, manifest.counts.included);
assert.equal(incomeDetail, manifest.counts.withIncomeDetail);
assert.equal(spendingDetail, manifest.counts.withSpendingDetail);
assert.equal(first, manifest.firstYearEnd);
assert.equal(last, manifest.lastYearEnd);
const directed = new Set();
for (const [prefix, asset] of Object.entries(manifest.ids)) {
  for (const [id, bucket] of verifiedShard(root, asset)) {
    assert.equal(id.slice(0, 4), prefix);
    assert.ok(!directed.has(id));
    directed.add(id);
    assert.equal(organizations.get(id)?.bucket, bucket);
  }
}
assert.equal(directed.size, organizations.size);

assert.equal(manifest.withheld.receiptBeforeEnd.length, manifest.counts.receiptBeforeEnd);
const withheld = new Set();
for (const [id, end, received, record] of manifest.withheld.receiptBeforeEnd) {
  assert.ok(organizations.has(id) && received < end && !returns.has(record) && !withheld.has(record));
  withheld.add(record);
}
for (const [id, end, records] of manifest.withheld.conflictingYearEnds) {
  assert.ok(organizations.has(id) && records.length >= 2);
  assert.ok(organizations.get(id).history.every(([period]) => period !== end));
  for (const record of records) {
    assert.ok(!returns.has(record) && !withheld.has(record));
    withheld.add(record);
  }
}
assert.equal(withheld.size, manifest.counts.receiptBeforeEnd + manifest.counts.conflictingRows);
assert.equal(returns.size + withheld.size + manifest.counts.missingReceipt, manifest.counts.input);

assert.equal(comparison.englandAndWales.manifestSha256, sha(bytes(ewRoot, 'manifest.json')));
assert.deepEqual(comparison.englandAndWales.sources, ewManifest.sources);
assert.deepEqual(comparison.scotland.sources, manifest.sources);
assert.equal(comparison.scotland.attribution, manifest.attribution);
const known = [
  ['SC039570', '213890'],
  ['SC037738', '220949'],
  ['SC039042', '202918'],
];
assert.deepEqual(comparison.pairs.map(pair => [pair.scotlandNumber, pair.englandAndWalesNumber]), known);
let matchedAmounts = 0;
let matchedReceipts = 0;
for (const pair of comparison.pairs) {
  const number = pair.englandAndWalesNumber;
  const [, bucket] = verifiedShard(ewRoot, ewManifest.ids[number.slice(0, 2)]).find(([id]) => id === number);
  const [, , regulatorId, history] = verifiedShard(ewRoot, ewManifest.names[bucket]).find(([id]) => id === number);
  assert.equal(pair.englandAndWalesOrganizationId, regulatorId);
  assert.equal(new Set(pair.periods.map(({ end }) => end)).size, 3);
  for (const { end, scotland, englandAndWales, englandAndWalesMinusScotlandGBP: diff } of pair.periods) {
    const [, received, incomeGBP, expenditureGBP, sourceRecord] = organizations.get(pair.scotlandNumber).history.find(row => row[0] === end);
    assert.deepEqual(scotland, { start: null, received, incomeGBP, expenditureGBP, sourceRecord });
    const [ewStart, , ewReceived, ewIncome, ewExpenditure, ewRecord] = history.find(row => row[1] === end);
    assert.deepEqual(englandAndWales, { start: ewStart, received: ewReceived, incomeGBP: ewIncome, expenditureGBP: ewExpenditure, sourceRecord: ewRecord });
    assert.equal(diff.income, Number(ewIncome) - Number(incomeGBP));
    assert.equal(diff.expenditure, Number(ewExpenditure) - Number(expenditureGBP));
    matchedAmounts += Number(!diff.income && !diff.expenditure);
    matchedReceipts += Number(ewReceived === received);
  }
}
assert.equal(matchedAmounts, 8);
assert.equal(matchedReceipts, 3);
assert.equal(comparison.pairs[2].periods.find(row => row.end === '2025-03-31').englandAndWalesMinusScotlandGBP.income, 30_000);

const route = '/record/charity-financials/scotland/';
const html = readFileSync('dist' + route + 'index.html', 'utf8');
assert.ok(html.includes('data-scotland-finance'));
assert.ok(html.includes('id="cross-register"'));
assert.ok(html.includes('£30,000'));
assert.ok(html.includes('data-site-symbol="thistle"'));
assert.ok(html.includes('github.com/theguysaccount/charitology/issues/new'));
for (const file of ['manifest.json', 'cross-register.json']) {
  assert.ok(html.includes(`href="${base}/data/charity-financials/scotland/${file}"`));
  assert.deepEqual(bytes('dist/data/charity-financials/scotland', file), bytes(root, file));
}
for (const page of ['record/charity-financials', 'record/charity-financials/england-wales', 'record/charity-index/coverage', 'record/charity-index']) {
  assert.ok(readFileSync(`dist/${page}/index.html`, 'utf8').includes(`href="${base}${route}`), page);
}
console.log(`Scotland financial snapshot checked across all shards: ${organizations.size} registrations, ${returns.size} returns and nine exact cross-register comparisons.`);
