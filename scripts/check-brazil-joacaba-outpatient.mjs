import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/data/funding-flows/brazil-joacaba-outpatient.json');
const { cnes, municipalityCode, infrastructureAgreement, outpatient, hearing } = JSON.parse(source);
const caseStudy = JSON.parse(readFileSync('src/data/funding-flows/brazil-joacaba-rehabilitation.json'));
assert.deepEqual([cnes, municipalityCode, infrastructureAgreement],
  [caseStudy.facility.cnes, caseStudy.facility.municipalityCode, caseStudy.agreement]);
assert.equal(outpatient.facility, cnes);
assert.deepEqual(hearing.annexComparison.source, caseStudy.documents.hearingTargets);

const { capturedOn, snapshot, ...dashboardCapture } = outpatient;
const capture = JSON.stringify(dashboardCapture, null, 2) + '\n';
assert.match(capturedOn, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(Buffer.byteLength(capture), snapshot.bytes);
assert.equal(createHash('sha256').update(capture).digest('hex'), snapshot.sha256);
for (const query of Object.values(outpatient.queries)) {
  assert.equal(query.size, 0);
  assert.equal(query._source, false);
  assert.deepEqual(query.query.bool.filter[0], { match_phrase: { 'CNES.keyword': cnes } });
}
assert.equal(outpatient.months.length, 32);
assert.deepEqual(outpatient.months.at(-1), {
  month: '2026-08', institutionalRecords: 1, observations: 0, approvedProcedureUnits: null,
});
assert.deepEqual(outpatient.years.map(row => [row.observations, row.approvedProcedureUnits]), [
  [12, 10688], [12, 62020], [7, 34823],
]);
assert.equal(outpatient.questionableFieldMatches, 31);
for (const year of outpatient.years) {
  const months = outpatient.months.filter(row => row.month.startsWith(String(year.year)));
  assert.equal(months.reduce((total, row) => total + (row.approvedProcedureUnits ?? 0), 0), year.approvedProcedureUnits);
  assert.equal(months.filter(row => row.approvedProcedureUnits !== null).length, year.observations);
}

const { positiveCodes, followUpCodesOutsideResearchScope } = hearing.annexComparison;
assert.equal(hearing.detailedRecordsForFacility, 951);
assert.deepEqual([hearing.months.length, hearing.months[0].month, hearing.months.at(-1).month], [12, '2025-08', '2026-07']);
assert.deepEqual(hearing.totals, {
  aasi: 1259, reposicao_aasi: 3, diagnostico_auditivo: 609, audiometria: 1456,
  selecao_adaptacao_aasi: 1, molde_auricular: 0, manutencao_aasi: 0, sistema_fm: 0,
});
assert.deepEqual(positiveCodes.filter(row => !row.printedInAnnex), [
  { code: '0701030291', group: 'reposicao_aasi', approvedUnits: 1, printedInAnnex: false },
]);
assert.deepEqual(followUpCodesOutsideResearchScope, ['0301070032', '0301070253']);
assert.equal(new Set(positiveCodes.map(row => row.code)).size, 9);
assert.ok(positiveCodes.every(row => /^\d{10}$/.test(row.code) && row.approvedUnits > 0));
const groups = Object.keys(hearing.totals);
for (const group of groups) {
  const quantity = hearing.months.reduce((total, row) => total + row[group], 0);
  const quantityByCode = positiveCodes.filter(row => row.group === group).reduce((total, row) => total + row.approvedUnits, 0);
  assert.equal(quantity, hearing.totals[group], group);
  assert.equal(quantityByCode, quantity, group);
}

const dist = process.env.CHARITOLOGY_DIST || 'dist';
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const parent = '/record/funding-flows/brazil-infrastructure-procurement-lots/';
const route = parent + 'joacaba-outpatient/';
const output = (filename, path = route) => readFileSync(dist + path + filename);
assert.deepEqual(output('data.json'), source);
const csv = filename => output(filename).toString().trimEnd().split('\n');
assert.deepEqual(csv('outpatient.csv'), [
  'cnes,reportingMonth,institutionalRecords,observations,approvedProcedureUnits',
  ...outpatient.months.map(row => [cnes, row.month, row.institutionalRecords, row.observations, row.approvedProcedureUnits ?? ''].join(',')),
]);
assert.deepEqual(csv('hearing-care.csv'), [
  ['cnes', 'processingMonth', ...groups].join(','),
  ...hearing.months.map(row => [cnes, row.month, ...groups.map(group => row[group])].join(',')),
]);
const html = output('index.html').toString();
for (const section of ['outpatient', 'hearing-care', 'annex', 'downloads']) {
  assert.ok(html.includes(`id="${section}"`) && html.includes(`href="#${section}"`), section);
}
for (const path of [parent, '/record/funding-flows/', '/record/charity-index/coverage/', `/record/funding-flows/brazil-project-execution/${infrastructureAgreement}/`]) {
  assert.ok(output('index.html', path).toString().includes(`href="${base + route}"`), path);
}
assert.ok(html.includes('August 2026') && html.includes('>Unknown</td>'));
assert.ok(html.includes(hearing.license));
assert.ok(!source.toString().includes('municipio_residencia'));
console.log('Joaçaba outpatient reporting: 31 approved counts, one unknown month, 12 hearing-care months, nine exact code comparisons and three exports verified.');
