// Explicit rebuild from locally retained regulator downloads. Site builds are offline.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { csvRows } from './update-irs-registry.mjs';
import { AU_FINANCIAL_ASSET, AU_FINANCIAL_FIELDS, AU_FINANCIAL_FORMAT, isReportingDate, validateFinancialRows } from '../src/lib/charity-financials.mjs';

const license = 'https://creativecommons.org/licenses/by/3.0/au/';
const captures = [
  {
    year: 2023, sha256: '79c8e766113a5a0843ba9d838e30391ebf74608ca9ab31ffec610f288a0c8fcf',
    dataset: 'https://data.gov.au/data/dataset/ff6905d6-9d5d-4ef1-8478-72b833864fb7',
    csv: 'https://data.gov.au/data/dataset/ff6905d6-9d5d-4ef1-8478-72b833864fb7/resource/2b0fb746-57c5-4523-bb4c-74b7b78279d9/download/datadotgov_ais23.csv',
    notes: 'https://data.gov.au/data/dataset/ff6905d6-9d5d-4ef1-8478-72b833864fb7/resource/ff1aad35-e468-453b-bad1-d3bedf457c01/download/2023-ais-data.gov.au-explanatory-notes.pdf',
  },
  {
    year: 2024, sha256: '7213b28f384ca4bea48cb5001d8ad69c4d1a97d2cb825bcc79c1637896456a9d',
    dataset: 'https://data.gov.au/data/dataset/276ec1bc-4971-461c-88bc-be9f3c99a0f8',
    csv: 'https://data.gov.au/data/dataset/276ec1bc-4971-461c-88bc-be9f3c99a0f8/resource/710630ea-1202-4bbb-95f7-3973a972ddf8/download/datadotgov_ais24.csv',
    notes: 'https://data.gov.au/data/dataset/276ec1bc-4971-461c-88bc-be9f3c99a0f8/resource/014d919b-aa79-4da4-8aab-438141391f99/download/explanatory-notes.pdf',
  },
];
const date = '2026-11-10';
const columns = ['abn', 'charity name', 'fin report from', 'fin report to', 'report consolidated with more than one entity', 'cash or accrual', ...AU_FINANCIAL_FIELDS];
const digest = value => createHash('sha256').update(value).digest('hex');

function parseDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const result = match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  if (value && !isReportingDate(result)) throw new Error(`Unrecognized reporting date: ${value}`);
  return result;
}

function parseAmount(value) {
  if (!value) return null;
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Unexpected ACNC amount format.');
  return Number(value);
}

async function readCapture(input, capture) {
  const bytes = await readFile(join(input, `acnc-ais-${capture.year}.csv`));
  assert.equal(digest(bytes), capture.sha256, `ACNC ${capture.year} download differs from this edition.`);
  const rows = csvRows(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const header = rows.next().value;
  const indices = columns.map(column => {
    const index = header.indexOf(column);
    assert(index >= 0 && index === header.lastIndexOf(column), `Missing or ambiguous ACNC column: ${column}`);
    return index;
  });
  const identities = new Map();
  let inputRows = 0;
  let duplicateRows = 0;
  for (const cells of rows) {
    inputRows++;
    assert.equal(cells.length, header.length, `Unexpected column count in record ${inputRows}.`);
    const [abn, name, from, to, consolidation, basis, ...amounts] = indices.map(index => cells[index].trim());
    assert(/^\d{11}$/.test(abn) && name && name.length <= 250, `Invalid identity in record ${inputRows}.`);
    const normalized = [name, parseDate(from), parseDate(to), consolidation || null, basis || null, ...amounts.map(parseAmount)];
    const prior = identities.get(abn);
    if (prior) {
      assert.deepEqual(prior.values, normalized, `Conflicting duplicate for ABN ${abn}.`);
      duplicateRows++;
      continue;
    }
    identities.set(abn, { values: normalized, sourceRecord: inputRows });
  }
  return { identities, source: { ...capture, bytes: bytes.length, inputRows, duplicateRows, undated: 0, olderOnly: 0, includedPeriods: 0 } };
}

function period(entry, source) {
  const [, from, to, consolidation, basis, ...amounts] = entry.values;
  if (!from || !to) {
    source.undated++;
    return null;
  }
  source.includedPeriods++;
  return [source.year, from, to, consolidation, basis, entry.sourceRecord, ...amounts];
}

async function build(input, output) {
  const [earlier, latest] = await Promise.all(captures.map(capture => readCapture(input, capture)));
  const rows = [];
  for (const [abn, entry] of latest.identities) {
    const old = earlier.identities.get(abn);
    const history = [period(entry, latest.source), old && period(old, earlier.source)].filter(Boolean);
    if (history.length) rows.push([abn, entry.values[0], history]);
  }
  earlier.source.olderOnly = [...earlier.identities.keys()].filter(abn => !latest.identities.has(abn)).length;
  rows.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0].localeCompare(b[0], 'en'));
  const decoded = Buffer.from(JSON.stringify(rows) + '\n');
  const compressed = gzipSync(decoded, { level: 9 });
  const manifest = {
    format: AU_FINANCIAL_FORMAT, date, jurisdiction: 'AU', currency: 'AUD', license,
    organizations: rows.length, organizationsWithBothYears: rows.filter(row => row[2].length === 2).length,
    periodFields: ['aisYear', 'periodStart', 'periodEnd', 'consolidation', 'accountingBasis', 'sourceRecord', ...AU_FINANCIAL_FIELDS],
    sources: [earlier.source, latest.source],
    asset: { path: AU_FINANCIAL_ASSET, bytes: compressed.length, decodedBytes: decoded.length, sha256: digest(compressed), decodedSha256: digest(decoded) },
  };
  validateFinancialRows(rows, manifest);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, AU_FINANCIAL_ASSET), compressed);
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function check(output) {
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, AU_FINANCIAL_FORMAT);
  assert.equal(manifest.date, date);
  assert.equal(manifest.license, license);
  assert.equal(manifest.asset.path, AU_FINANCIAL_ASSET);
  assert.deepEqual(manifest.sources.map(({ year, sha256, dataset, csv, notes }) => ({ year, sha256, dataset, csv, notes })), captures);
  for (const source of manifest.sources) assert.equal(source.inputRows, source.duplicateRows + source.undated + source.olderOnly + source.includedPeriods);
  const compressed = await readFile(join(output, AU_FINANCIAL_ASSET));
  assert.equal(compressed.length, manifest.asset.bytes);
  assert.equal(digest(compressed), manifest.asset.sha256);
  const decoded = gunzipSync(compressed, { maxOutputLength: 16_000_000 });
  assert.equal(decoded.length, manifest.asset.decodedBytes);
  assert.equal(digest(decoded), manifest.asset.decodedSha256);
  const rows = validateFinancialRows(JSON.parse(decoded), manifest);
  assert.equal(rows.filter(row => row[2].length === 2).length, manifest.organizationsWithBothYears);
  return manifest;
}

const [input, output = 'public/data/charity-financials', extra] = process.argv.slice(2);
if (!input || extra) throw new Error('Usage: node scripts/build-au-charity-financials.mjs <input-directory|--check> [output-directory]');
const manifest = input === '--check' ? await check(resolve(output)) : await build(resolve(input), resolve(output));
console.log(`${manifest.organizations} Australian organizations with dated reporting, ${manifest.organizationsWithBothYears} with both AIS years.`);
