import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { toCsv } from '../src/lib/client/files.ts';

const [command, directory] = process.argv.slice(2);
const target = 'data/funding-flows/france-emmaus/';
const committed = resolve('public', target);
assert.ok((command === '--check' && directory === undefined) ||
  (command === '--write' && directory) || (command === '--verify-captures' && directory),
'Use --check, --write <output directory> or --verify-captures <source directory>.');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const { awards, ...data } = json('src/data/france-emmaus.json');
const { accounts, activity, need, sources, institution } = data;
const parent = 'public/data/funding-flows/ile-de-france/';
const manifest = json(parent + 'manifest.json');
const compressed = readFileSync(parent + 'payments.json.gz');
assert.equal(sha256(compressed), data.paymentsSnapshotSha256, 'Pinned regional snapshot changed');
assert.equal(manifest.asset.sha256, data.paymentsSnapshotSha256);
assert.equal(manifest.currency, data.currency);
const rows = JSON.parse(gunzipSync(compressed));
assert.equal(rows.length, manifest.asset.rows);
assert.deepEqual(manifest.fields, [
  'sourceRecord', 'siret', 'publishedName', 'budgetYear', 'paymentDate',
  'amountEUR', 'decision', 'dossier', 'aidProgram',
]);

const decisions = new Map(awards.map(award => [award.sourceRecord, award]));
assert.equal(decisions.size, awards.length, 'A payment row cannot repeat');
assert.equal(new Set(awards.map(row => row.decision + ':' + row.dossier)).size, awards.length, 'Count each award once');
const duplicates = new Set(manifest.duplicateCandidates.flat());
const selected = rows.filter(row => row[1].startsWith(institution.siren));
const matches = selected.map(([sourceRecord, siret, publishedName, budgetYear, paymentDate, amountEUR, decision, rawDossier, aidProgram]) => {
  const award = decisions.get(sourceRecord);
  assert.ok(award && !duplicates.has(sourceRecord), 'Check new or ambiguous records before including them');
  assert.equal(siret, institution.headquartersSiret);
  assert.equal(publishedName, institution.publishedName);
  assert.equal(decision, award.decision);
  const dossier = rawDossier.match(/\bEX[0-9]{6}\b/g);
  assert.deepEqual(dossier, [award.dossier], 'Expected one exact dossier identifier');
  const amount = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(amountEUR);
  assert.ok(amount, 'Payment must have at most two decimal places');
  const paidCents = Number(amount[1]) * 100 + Number((amount[2] ?? '').padEnd(2, '0'));
  assert.ok(Number.isSafeInteger(paidCents) && Number.isSafeInteger(award.awardCents));
  assert.ok(sources[award.awardFile]?.sha256 && award.plannedStart <= award.plannedEnd);
  return { ...award, siret, publishedName, rawDossier, budgetYear, paymentDate, amountEUR, paidCents, aidProgram };
});
assert.equal(matches.length, awards.length, 'Every award must match one source row');
assert.equal(new Set(matches.map(row => row.sourceRecord)).size, matches.length);
const euro = cents => (cents / 100).toFixed(2);
const matchTotals = {
  awardCents: matches.reduce((total, row) => total + row.awardCents, 0),
  paidCents: matches.reduce((total, row) => total + row.paidCents, 0),
};

const accountFields = [
  ['assets', 'Total assets after depreciation and provisions', 'assetsPage'],
  ['situationNette', 'Situation nette subtotal', 'fundsPage'],
  ['fondsPropres', 'Fonds propres total', 'fundsPage'],
  ['operatingIncome', 'Operating income', 'operationsPage'],
  ['publicSupport', 'Public support and operating grants', 'operationsPage'],
  ['operatingExpenses', 'Operating expenses', 'operationsPage'],
  ['totalIncome', 'Total income', 'totalsPage'],
  ['totalExpenses', 'Total expenses', 'totalsPage'],
  ['reportedSurplus', 'Reported surplus', 'totalsPage'],
  ['inKind', 'Contributions in kind', 'totalsPage'],
  ['valuedVolunteering', 'Valued volunteer contribution included in contributions in kind', 'totalsPage'],
];
const pageLink = (file, page) => sources[file].url + '#page=' + page;
const financialRows = accounts.flatMap(account => accountFields.map(([field, measure, pageField]) => {
  assert.ok(Number.isSafeInteger(account[field]), field);
  return {
    siren: institution.siren, periodStart: account.periodStart, periodEnd: account.periodEnd,
    filingPublished: account.published, filingRevision: account.revision,
    measure, amount: account[field], currency: data.currency,
    source: pageLink(account.file, account[pageField]), sourceSha256: sources[account.file].sha256,
  };
}));
const context = [
  ...activity.map(row => ({
    kind: 'provider-reported-service-activity', periodStart: row.year + '-01-01', periodEnd: row.year + '-12-31',
    scope: row.scope, geography: 'Selected Emmaüs Solidarité services', value: row.peopleSupportedDaily,
    unit: 'people supported daily as reported', file: row.file, page: row.page,
  })),
  ...need.map(row => ({
    kind: 'independent-one-night-count', periodStart: row.nightStart, periodEnd: row.nightEnd,
    scope: row.coverage, geography: row.geography, value: row.peopleCounted,
    unit: 'people counted without accommodation', file: row.file, page: row.page,
  })),
].map(({ file, page, ...record }) => ({ ...record, source: pageLink(file, page), sourceSha256: sources[file].sha256 }));
const paymentRows = matches.map(row => ({
  siren: institution.siren, siret: row.siret, publishedName: row.publishedName,
  decision: row.decision, dossier: row.dossier, rawDossier: row.rawDossier, project: row.project,
  plannedStart: row.plannedStart, plannedEnd: row.plannedEnd, plannedGeography: row.plannedGeography,
  approvedMaximum: euro(row.awardCents), reportedPaid: euro(row.paidCents), currency: data.currency,
  budgetYear: row.budgetYear, paymentDate: row.paymentDate, paymentSourceRecord: row.sourceRecord,
  paymentSource: manifest.source.csv, paymentSourceSha256: manifest.source.sha256,
  paymentSnapshotSha256: manifest.asset.sha256,
  paymentPublisher: manifest.source.publisher, paymentSourceLicense: manifest.source.license,
  awardSource: pageLink(row.awardFile, row.awardPage), awardSourceSha256: sources[row.awardFile].sha256,
}));

if (command === '--verify-captures') {
  for (const [file, { sha256: expected }] of Object.entries(sources)) {
    if (expected) assert.equal(sha256(readFileSync(resolve(directory, file))), expected, file);
  }
  const { results: identities } = json(resolve(directory, 'sirene-search-317236248.json'));
  const [legalUnit] = identities.filter(row => row.siren === institution.siren);
  assert.equal(legalUnit.siege.siret, institution.headquartersSiret);
  assert.equal(legalUnit.nom_complet, institution.publishedName);
  assert.equal(legalUnit.complements.identifiant_association, institution.rna);
  assert.equal(legalUnit.nature_juridique, '9220');
  const { results: notices } = json(resolve(directory, 'idf-four-siren-dca.json'));
  const scoped = notices.filter(row => row.dca_siren === institution.siren);
  assert.equal(scoped.length, accounts.length);
  for (const account of accounts) {
    const notice = scoped.find(row => row.dca_datecloture.slice(0, 10) === account.periodEnd);
    assert.equal(notice.id + '.pdf', account.file);
    assert.equal(notice.dca_rectificatif_version, account.revision);
    assert.equal(notice.dateparution, account.published);
    assert.equal(notice.numero_rna, institution.rna);
  }
  console.log('France: original source fingerprints and exact SIREN, SIRET, RNA and filing notices verified.');
}

const edition = { ...data, matchTotals, matches, paymentSource: manifest.source, paymentSnapshot: manifest.asset,
  paymentCoverage: manifest.counts, paymentCapturedOn: manifest.capturedOn };
const files = {
  'edition.json': JSON.stringify(edition, null, 2) + '\n',
  'regional-awards-and-payments.csv': toCsv(paymentRows) + '\n',
  'annual-accounts.csv': toCsv(financialRows) + '\n',
  'reported-activity-and-need.csv': toCsv(context) + '\n',
};
if (command === '--write') {
  mkdirSync(directory, { recursive: true });
  for (const [file, content] of Object.entries(files)) writeFileSync(resolve(directory, file), content);
} else {
  for (const [file, content] of Object.entries(files)) {
    assert.equal(readFileSync(resolve(committed, file), 'utf8'), content, file);
    if (command === '--check') assert.equal(readFileSync(resolve('dist', target, file), 'utf8'), content, file);
  }
}
if (command === '--check') {
  const html = readFileSync('dist/record/funding-flows/france-emmaus-solidarite/index.html', 'utf8');
  assert.equal((html.match(/<tr[^>]+data-dossier=/g) ?? []).length, 5);
  assert.equal((html.match(/<tr[^>]+data-financial-period=/g) ?? []).length, 4);
  assert.equal((html.match(/<tr[^>]+data-need-date=/g) ?? []).length, 5);
  assert.match(html, /€182,750\.00/);
  assert.match(html, /€72,732\.48/);
  assert.match(html, /#q=317236248/);
  const lookup = readFileSync('dist/record/funding-flows/ile-de-france-paid-grants/index.html', 'utf8');
  assert.match(lookup, /\/record\/funding-flows\/france-emmaus-solidarite\//);
  for (const name of Object.keys(files)) assert.ok(html.includes(target + name), name);
  console.log('France: five matched awards and payments, four filing years, five independent count observations and four reproducible public downloads checked.');
}
