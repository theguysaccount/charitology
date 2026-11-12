import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/client/csv.ts';

const sourcePath = 'public/data/charity-registry/taiwan';
const outputPath = 'dist/data/charity-registry/taiwan';
const read = file => readFileSync(join(sourcePath, file));
const json = file => JSON.parse(read(file));
const sha = data => createHash('sha256').update(data).digest('hex');
const manifest = json('manifest.json');
const fund = json('fund-comparison.json');
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const registryRoute = '/record/charity-index/taiwan/';
const fundingRoute = '/record/funding-flows/taiwan-new-resident-fund/';
const page = route => readFileSync('dist' + route + 'index.html', 'utf8');

function verifyShard(asset) {
  const packed = read(asset.path);
  assert.equal(packed.length, asset.bytes, asset.path);
  assert.equal(sha(packed), asset.sha256, asset.path);
  assert.deepEqual(readFileSync(join(outputPath, asset.path)), packed);
  const decoded = gunzipSync(packed);
  assert.equal(decoded.length, asset.decodedBytes, asset.path);
  assert.ok(decoded.length <= 16_000_000, asset.path);
  assert.equal(sha(decoded), asset.decodedSha256, asset.path);
  const rows = JSON.parse(decoded);
  assert.equal(rows.length, asset.rows, asset.path);
  return rows;
}

assert.equal(manifest.format, 'charitology-taiwan-institutions-v1');
assert.equal(fund.format, 'charitology-taiwan-fund-v1');
assert.equal(manifest.capturedOn, fund.capturedOn);
assert.equal(manifest.license, fund.license);
assert.deepEqual(manifest.fields, ['number', 'name', 'registeredLocation', 'lastChangeLiteral', 'lastChangeDate', 'lastChangeCode', 'sourceRecord']);
assert.deepEqual(readdirSync(sourcePath).sort(), ['fund-comparison.csv', 'fund-comparison.json', 'ids', 'manifest.json', 'names']);
for (const section of ['ids', 'names']) {
  assert.deepEqual(readdirSync(join(sourcePath, section)).sort(), Object.keys(manifest[section]).map(key => key + '.json.gz').sort());
}
const pins = Object.fromEntries(readFileSync('src/data/taiwan-index-sources.tsv', 'utf8').trimEnd().split('\n').slice(1).map(line => {
  const [name, url, bytes, sha256] = line.split('\t');
  return [name, { url, bytes: Number(bytes), sha256 }];
}));
assert.deepEqual(manifest.source, pins['nonprofit-registrations.csv']);
assert.deepEqual(fund.sources, Object.fromEntries(Object.entries(pins).filter(([name]) => name !== 'nonprofit-registrations.csv')));

const identities = new Map();
const names = new Map();
const coordinates = new Set();
const normalizedName = value => value.normalize('NFKC').trim();
let missingLocation = 0;
let missingDate = 0;
for (const [bucket, asset] of Object.entries(manifest.names)) {
  for (const row of verifyShard(asset)) {
    assert.equal(row.length, manifest.fields.length);
    const [id, name, place, literal, day, code, record] = row;
    assert.match(id, /^[0-9]{8}$/);
    assert.ok(!identities.has(id) && name.trim());
    assert.ok(place === null || /^[\p{Script=Han}]{2,4}$/u.test(place));
    assert.match(literal, /^[0-9]{5,7}$/);
    if (day !== null) {
      assert.match(day, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
      assert.equal(new Date(day).toISOString().slice(0, 10), day);
      assert.equal(day, `${Number(literal.slice(0, 3)) + 1911}-${literal.slice(3, 5)}-${literal.slice(5)}`);
    }
    assert.match(code, /^[0-9]{2}$/);
    assert.ok(Number.isInteger(record) && record > 1 && record <= manifest.counts.inputRecords && !coordinates.has(record));
    coordinates.add(record);
    missingLocation += Number(place === null);
    missingDate += Number(day === null);
    const first = name.normalize('NFKD').toLowerCase().match(/[\p{L}\p{N}]/u)?.[0];
    assert.equal(bucket, first ? (first.codePointAt(0) % 64).toString(16).padStart(2, '0') : 'other', id);
    identities.set(id, bucket);
    const key = normalizedName(name);
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(id);
  }
}
const directed = new Set();
for (const [prefix, asset] of Object.entries(manifest.ids)) {
  for (const [id, bucket] of verifyShard(asset)) {
    assert.equal(id.slice(0, 2), prefix);
    assert.equal(identities.get(id), bucket);
    assert.ok(!directed.has(id));
    directed.add(id);
  }
}
assert.equal(identities.size, 99_913);
assert.equal(identities.size, directed.size);
assert.equal(identities.size, manifest.counts.includedIdentities);
assert.equal(identities.size + manifest.counts.blankIdentifier, manifest.counts.inputRecords);
assert.equal(missingLocation, manifest.counts.unknownLocation);
assert.equal(missingDate, manifest.counts.unknownChangeDate);
assert.equal([...names.values()].filter(rows => rows.length > 1).length, manifest.counts.repeatedNormalizedNames);

assert.equal(fund.currency, 'TWD');
const reportCounts = { 2024: 0, 2025: 0 };
const projects = new Set();
const reports = new Map();
const repeats = [];
for (const project of fund.projects) {
  assert.match(project.projectId, /^[0-9]{4}[A-Z][0-9]{3}$/);
  assert.ok(!projects.has(project.projectId));
  projects.add(project.projectId);
  assert.ok(project.executionReports.length === 1 || project.executionReports.length === 2);
  const candidates = names.get(normalizedName(project.reportedRecipient)) ?? [];
  assert.deepEqual([...project.exactNameCandidateIds].sort(), [...candidates].sort());
  const filingYears = new Set();
  for (const filing of project.executionReports) {
    const { reportYear, sourceRecord, reportedRecipient, approvedTWD, executionTWD, returnedBalanceTWD } = filing;
    assert.ok(Object.hasOwn(reportCounts, reportYear) && !filingYears.has(reportYear));
    filingYears.add(reportYear);
    reportCounts[reportYear]++;
    assert.ok(Number.isInteger(sourceRecord) && sourceRecord >= 1 && sourceRecord <= fund.coverageByReport[reportYear].projectRecords);
    assert.equal(reportedRecipient, project.reportedRecipient);
    assert.ok(filing.projectTitle.includes(project.projectId));
    assert.ok(Number.isSafeInteger(approvedTWD) && approvedTWD >= 0);
    assert.ok(Number.isSafeInteger(executionTWD) && executionTWD >= 0);
    assert.ok(returnedBalanceTWD === null || (Number.isSafeInteger(returnedBalanceTWD) && returnedBalanceTWD >= 0));
    const key = `${reportYear}/${sourceRecord}`;
    assert.ok(!reports.has(key));
    reports.set(key, { project, filing });
  }
  if (project.executionReports.length === 2) {
    repeats.push(project.projectId);
    const [a, b] = project.executionReports;
    assert.ok(Number.isInteger(project.approval.pdfPage));
    assert.equal(a.approvedTWD, project.approval.approvedTWD);
    assert.equal(b.approvedTWD, project.approval.approvedTWD);
    assert.notEqual(a.executionTWD, b.executionTWD);
  } else {
    assert.equal(project.approval, null);
  }
}
assert.equal(projects.size, 111);
assert.equal(projects.size, fund.uniqueProjects);
assert.deepEqual(reportCounts, { 2024: 58, 2025: 59 });
assert.deepEqual(repeats, ['1132D342', '1132D346', '1132D350', '1132D424', '1132F507', '1133F514']);
assert.equal(repeats.length, fund.repeatedProjects);
assert.equal(fund.coverageByReport['2025'].blankRecords, 451);
const example = fund.projects.find(({ projectId }) => projectId === '1132D350');
assert.deepEqual(example.approval, { pdfPage: 9, requestedTWD: 266_000, approvedTWD: 186_000 });
assert.deepEqual(example.executionReports.map(r => [r.reportYear, r.sourceRecord, r.executionTWD, r.disbursementFieldLiteral, r.reportedDisbursementDate]), [
  [2024, 58, 139_500, '尚未撥款', null], [2025, 54, 38_000, '114.6.6', '2025-06-06'],
]);

const [header, ...csv] = parseCsv(read('fund-comparison.csv').toString('utf8').replace(/^\uFEFF/, ''));
assert.equal(csv.length, reports.size);
const exported = new Set();
for (const values of csv) {
  assert.equal(values.length, header.length);
  const row = Object.fromEntries(header.map((field, index) => [field, values[index]]));
  const key = `${row.reportYear}/${row.sourceRecord}`;
  assert.ok(!exported.has(key));
  exported.add(key);
  const { project, filing } = reports.get(key);
  assert.equal(row.projectId, project.projectId);
  assert.equal(row.currency, fund.currency);
  assert.equal(row.approvalPdfPage, String(project.approval?.pdfPage ?? ''));
  assert.equal(row.sourceSha256, fund.sources[`new-resident-fund-${row.reportYear}.csv`].sha256);
  assert.equal(row.license, fund.license);
  for (const [field, value] of Object.entries(filing)) {
    const safe = typeof value === 'string' && /^(?:\s*[=+\-@]|[\t\r\n])/.test(value) ? "'" + value : value;
    assert.equal(row[field], String(safe ?? ''), field);
  }
}

for (const file of ['manifest.json', 'fund-comparison.csv', 'fund-comparison.json']) {
  assert.deepEqual(readFileSync(join(outputPath, file)), read(file));
}
const registry = page(registryRoute);
const grants = page(fundingRoute);
assert.ok(registry.includes('data-taiwan-registry'));
assert.ok(registry.includes(`href="${base}${fundingRoute}"`));
assert.ok(grants.includes(`href="${base}${registryRoute}?registration=72895230"`));
assert.equal((grants.match(/ data-project="/g) ?? []).length, 111);
for (const project of fund.projects) assert.ok(grants.includes(`id="project-${project.projectId}"`));
assert.ok(grants.includes('NT$139,500'));
assert.ok(grants.includes('NT$38,000'));
for (const html of [registry, grants]) assert.ok(html.includes('github.com/theguysaccount/charitology/issues/new'));
assert.ok(page('/record/charity-index/coverage/').includes(`href="${base}${registryRoute}"`));
assert.ok(page('/record/funding-flows/').includes(`href="${base}${fundingRoute}"`));
console.log(`Taiwan release verified across all shards, ${identities.size} IDs, ${projects.size} projects, ${reports.size} distinct report rows and matching built pages.`);
