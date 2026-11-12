import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = 'public/data/funding-flows/chile-residential-care/';
const read = file => readFileSync(data + file, 'utf8');
const edition = JSON.parse(read('edition.json'));
const sourceEvidence = JSON.parse(readFileSync('src/data/chile-residential-evidence.json', 'utf8'));
const { donationDisclosures, governmentRegisterTransfers, ...evidence } = edition;
assert.deepEqual(evidence, sourceEvidence);
assert.equal(edition.institution.rut, '53226150-3');
assert.equal(edition.institution.rpd, '137');
assert.equal(edition.register.registered + edition.register.removed, edition.register.snapshotEntries);
assert.equal(donationDisclosures.distinctRecipients, 659);
assert.deepEqual(donationDisclosures.workbooks.map(workbook => workbook.rowCount), [414, 14291, 428151, 533650]);
assert.deepEqual(donationDisclosures.institution.map(record => record.totalNominalClp), [3234830, 3420454, 702000, null]);
assert.deepEqual(donationDisclosures.institution.map(record => record.rows.length), [1, 3, 1, 0]);
for (const year of donationDisclosures.institution) {
  assert.equal(new Set(year.rows.map(row => row.sourceRow)).size, year.rows.length);
  for (const row of year.rows) {
    assert.ok(row.sourceRow > 2 && row.reportedDate.startsWith(year.workbookYear + '-'));
  }
}
assert.deepEqual(governmentRegisterTransfers.map(row => [row.folio, row.recipientRut, row.nominalClp]), [
  ['3666880', '53226150-3', 3000000], ['3743603', '53226150-3', 1000000], ['3929287', '53226150-3', 900000],
]);
const awards24 = edition.awards.filter(award => award.year === 2024);
const awards25 = edition.awards.filter(award => award.year === 2025);
assert.equal(awards24.reduce((sum, award) => sum + award.amount, 0), 650260000);
assert.equal(awards25.reduce((sum, award) => sum + award.amount, 0), 409596000);
assert.equal(awards24.every(award => award.region && award.regularCare === null), true);
assert.equal(awards25.every(award => award.region === null && award.regularCare !== null), true);
assert.deepEqual(awards24.filter(award => award.correspondingAward).map(award => award.correspondingAward).sort(), awards25.map(award => award.record));
assert.equal(edition.accounts.find(row => row.year === 2024).confirmedIn, 2025);
assert.equal(edition.accounts.every(row => row.socialCareExpenses < 0), true);
assert.equal(edition.monitoring.priorYearBeneficiaries - edition.monitoring.priorYearManagementReportBeneficiaries, 45);
for (const [file, count] of [['donation-disclosures.csv', 5], ['government-register-transfers.csv', 3], ['residence-awards.csv', 8], ['consolidated-accounts.csv', 3]]) {
  assert.equal(read(file).trimEnd().split('\n').length, count + 1, file);
  assert.equal(readFileSync('dist/data/funding-flows/chile-residential-care/' + file, 'utf8'), read(file), file);
}
assert.equal(readFileSync('dist/data/funding-flows/chile-residential-care/edition.json', 'utf8'), read('edition.json'));
const html = readFileSync('dist/record/funding-flows/chile-residential-care/index.html', 'utf8');
for (const id of ['donations', 'transfers', 'residence-awards', 'accounts', 'care-context', 'downloads', 'award-110066', 'award-110083', 'award-110084']) {
  assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes(`href="#${id}"`), id);
}
assert.match(html, /No matching row/);
assert.match(html, /thousands of CLP/);
console.log('Chile: four disclosure workbooks, five selected donation rows, three register records, eight awards, three statement periods and five exact data files.');
