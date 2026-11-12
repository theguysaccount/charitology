import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const assetRoot = 'data/charity-financials/fr-dila/';
const captureDate = '2026-11-12';
const sourceEndpoint = 'https://journal-officiel-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/jo_associations/exports/json';
const archive = [
  [2022, 14_434, '31131f72df0a6f7dc5790bf2612e1d3ca14bb5e7fe58305bdc1e0f23ee3e3c93'],
  [2023, 14_838, 'a55bd31021a16519aa7e27d0f02e82f01efab4456b44089daac1dd2f41617115'],
  [2024, 14_783, 'e39144d07b266b1c602d3ef5362e2da45c2ea5c2335bb6d3da76a5daa5138d83'],
  [2025, 11_913, '76cbfa04bc80967702a1ce6522be67bcb9850d1b52cd09fa54687258c9325abf'],
].map(([year, rows, sha256]) => {
  const url = new URL(sourceEndpoint);
  url.search = new URLSearchParams({
    select: 'id,source,dca_siren,dca_datecloture,dca_datevalidation,dca_rectificatif_version,numero_rna,dateparution,titre,numrnf',
    where: 'dca_datecloture >= "' + year + '-01-01" AND dca_datecloture < "' + (year + 1) + '-01-01"',
    order_by: 'dca_datecloture ASC, dca_siren ASC, dca_rectificatif_version ASC, id ASC',
  });
  return { year, rows, sha256, file: 'dila-closures-' + year + '.json', url: url.href };
});

const fields = ['noticeId', 'publishedNumber', 'title', 'fiscalEnd', 'publishedOn', 'validatedAt', 'revision', 'rna', 'candidateSiren', 'regionalPaymentLink'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = data => Buffer.from(JSON.stringify(data));
const luhn = value => [...value].reverse().reduce((total, digit, position) => {
  const n = Number(digit);
  return total + (position % 2 ? (n > 4 ? n * 2 - 9 : n * 2) : n);
}, 0) % 10 === 0;
const usualRna = value => typeof value === 'string' && /^W\d{9}$/.test(value);
const dateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
const versionAt = notice => Number(/_rectif([1-9]\d*)$/.exec(notice)?.[1] ?? 0);

const regionalRoot = 'public/data/funding-flows/ile-de-france/';
const regionalSource = JSON.parse(readFileSync(regionalRoot + 'manifest.json', 'utf8'));
const regionalBytes = readFileSync(regionalRoot + 'payments.json.gz');
assert.equal(sha(regionalBytes), regionalSource.asset.sha256);
const regional = new Set(JSON.parse(gunzipSync(regionalBytes)).map(row => row[1].slice(0, 9)));
assert.equal(regional.size, regionalSource.legalUnits);
const caseEdition = JSON.parse(readFileSync('public/data/funding-flows/france-emmaus/edition.json', 'utf8'));
assert.equal(regionalSource.asset.sha256, caseEdition.paymentsSnapshotSha256);

function summarize(rows) {
  const periodsBySiren = new Map();
  const withPayments = new Set();
  const counts = { notices: rows.length, candidateSirens: 0, distinctClosingDatesForCandidateSirens: 0,
    multiPeriodCandidateSirens: 0, unusableCandidateSiren: 0, noStandardRna: 0,
    positiveRevision: 0, revisionLabelDisagreement: 0, regionalPaymentCandidates: 0 };
  for (const [id, , , fiscalEnd, , , revision, rna, siren, regionalPaymentLink] of rows) {
    if (revision > 0) counts.positiveRevision++;
    if (versionAt(id) !== revision) counts.revisionLabelDisagreement++;
    if (rna === null) counts.noStandardRna++;
    if (siren === null) {
      counts.unusableCandidateSiren++;
      continue;
    }
    if (!periodsBySiren.has(siren)) periodsBySiren.set(siren, new Set());
    periodsBySiren.get(siren).add(fiscalEnd);
    if (regionalPaymentLink) withPayments.add(siren);
  }
  counts.candidateSirens = periodsBySiren.size;
  counts.regionalPaymentCandidates = withPayments.size;
  for (const dates of periodsBySiren.values()) {
    counts.distinctClosingDatesForCandidateSirens += dates.size;
    if (dates.size > 1) counts.multiPeriodCandidateSirens++;
  }
  return counts;
}

function readEdition(directory) {
  const used = new Set();
  const byYear = archive.map(({ year, rows, sha256, file }) => {
    const bytes = readFileSync(resolve(directory, file));
    assert.equal(sha(bytes), sha256, file);
    const records = JSON.parse(bytes);
    assert.equal(records.length, rows);
    return records.map(({ id, source, titre, dca_siren: number, dca_datecloture, dca_datevalidation,
      dca_rectificatif_version: revision, numero_rna, dateparution }) => {
      const fiscalEnd = dca_datecloture.slice(0, 10);
      const title = titre.replace(/\s+/g, ' ').trim();
      assert.ok(source === 'dca' && title && !used.has(id), id);
      assert.ok(dateOnly(fiscalEnd) && fiscalEnd.startsWith(String(year)) && dateOnly(dateparution), id);
      assert.ok(Number.isFinite(Date.parse(dca_datevalidation)) && Number.isSafeInteger(revision) && revision >= 0, id);
      const key = number + '_' + fiscalEnd.slice(8) + fiscalEnd.slice(5, 7) + fiscalEnd.slice(0, 4);
      assert.ok(/^\d{9}$/.test(number) && /^(\d{9}_\d{8})(?:_rectif[1-9]\d*)?$/.exec(id)?.[1] === key, id);
      const siren = !number.startsWith('999') && luhn(number) ? number : null;
      const rna = usualRna(numero_rna) ? numero_rna : null;
      used.add(id);
      return [id, number, title, fiscalEnd, dateparution, dca_datevalidation, revision, rna, siren,
        siren !== null && regional.has(siren)];
    });
  });
  return byYear.flat();
}

function verify(rows) {
  assert.equal(rows.length, archive.reduce((sum, source) => sum + source.rows, 0));
  assert.equal(new Set(rows.map(([id]) => id)).size, rows.length);
  assert.ok(rows.every(row => {
    const [, number, , , , , , rna, siren, hasPayments] = row;
    const expected = !number.startsWith('999') && luhn(number) ? number : null;
    return row.length === fields.length && (rna === null || usualRna(rna)) && siren === expected &&
      hasPayments === (siren !== null && regional.has(siren));
  }));
  for (const source of archive) {
    assert.equal(rows.filter(row => row[3].startsWith(String(source.year))).length, source.rows);
  }
  assert.equal(summarize(rows).revisionLabelDisagreement, 16);
  const emmaus = rows.filter(row => row[8] === caseEdition.institution.siren);
  assert.deepEqual(emmaus.map(row => [row[3], row[4], row[7], row[9]]),
    caseEdition.accounts.map(row => [row.periodEnd, row.published, caseEdition.institution.rna, true]));
}

function manifestFor(rows, decoded, compressed) {
  return { format: 'charitology-france-dila-filing-index-v1', capturedOn: captureDate,
    source: { publisher: 'Direction de l’information légale et administrative (DILA)',
      dataset: 'https://www.data.gouv.fr/datasets/comptes-associations',
      documentation: 'https://www.data.gouv.fr/dataservices/api-annonces-officielles-et-comptes-annuels-des-associations',
      license: 'https://www.data.gouv.fr/pages/legal/licences/etalab-2-0' },
    archive, fields, counts: summarize(rows),
    byYear: archive.map(({ year }) => ({ year, ...summarize(rows.filter(row => row[3].startsWith(String(year)))) })),
    regionalPayments: { capturedOn: regionalSource.capturedOn, snapshotSha256: regionalSource.asset.sha256,
      legalUnits: regionalSource.legalUnits },
    asset: { path: 'notices.json.gz', rows: rows.length, bytes: compressed.length, decodedBytes: decoded.length,
      sha256: sha(compressed), decodedSha256: sha(decoded) } };
}
const [mode, sourceDir, destination] = process.argv.slice(2);
if (mode === '--write' && sourceDir && destination) {
  const rows = readEdition(sourceDir);
  verify(rows);
  const decoded = jsonBytes(rows);
  const compressed = gzipSync(decoded, { level: 9 });
  mkdirSync(destination, { recursive: true });
  writeFileSync(resolve(destination, 'notices.json.gz'), compressed);
  writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifestFor(rows, decoded, compressed), null, 2) + '\n');
} else if (mode === '--check' && !sourceDir) {
  const compressed = readFileSync('public/' + assetRoot + 'notices.json.gz');
  const decoded = gunzipSync(compressed);
  const rows = JSON.parse(decoded);
  verify(rows);
  const manifest = JSON.parse(readFileSync('public/' + assetRoot + 'manifest.json'));
  assert.deepEqual(manifest, manifestFor(rows, decoded, compressed));
  assert.ok(decoded.length < 16_000_000);
  for (const file of ['notices.json.gz', 'manifest.json']) {
    assert.deepEqual(readFileSync('public/' + assetRoot + file), readFileSync('dist/' + assetRoot + file), file);
  }
  const html = readFileSync('dist/record/charity-financials/france/index.html','utf8');
  assert.ok(html.includes('data-dila-search') && html.includes('id="dila-year"'));
  assert.ok(html.includes('/record/funding-flows/france-emmaus-solidarite/'));
  console.log('France DILA: ' + rows.length.toLocaleString('en-US') + ' filing notices, source revision disagreements, conservative identifier rules and exact built assets checked.');
} else {
  throw Error('Use --write <capture directory> <output directory> or --check after building.');
}
