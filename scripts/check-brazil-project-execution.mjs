import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const record = json('src/data/funding-flows/brazil-project-execution.json');
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/brazil-project-execution/';
const output = 'dist' + route;
const digest = data => createHash('sha256').update(data).digest('hex');
function load(source) {
  const bytes = readFileSync('public' + source.base + source.asset.path);
  assert.equal(digest(bytes), source.asset.sha256);
  const raw = gunzipSync(bytes);
  assert.equal(digest(raw), source.asset.decodedSha256);
  return JSON.parse(raw);
}

const transfers = new Map(load(record.sources.transfer).map(row => [row[0], row]));
const { plannedGoals, municipalities } = load(record.sources.plans);
const places = new Map(municipalities.map(([code, name]) => [code, name]));
const goals = Map.groupBy(plannedGoals, row => row[1]);
const projects = new Map(record.projects.map(project => [project.agreement, project]));
assert.equal(projects.size, 88);
assert.equal(record.projects.length, projects.size);
assert.equal(new Set(record.projects.map(project => project.project)).size, 88);
const coverage = { transferAgreements: transfers.size, selectedProjects: projects.size, same: 0, commitments: 0,
  geographyRows: 0, currentPhysical: 0, historicalPhysical: 0, historicalPhysicalRows: 0, current100: 0,
  current100OtherStatus: 0, 'unknown-plan': 0, partial: 0, different: 0 };
const pairs = new Set();
const sourceRows = { siconv: new Set(), cipi: new Set(), history: new Set(), geometry: new Set(), bank: new Set() };
const built = readFileSync(output + 'index.html', 'utf8');

for (const [agreement, project] of projects) {
  const [id, proposal, cnpj, organization, state, , , , , orders] = transfers.get(agreement);
  assert.deepEqual([project.agreement, project.proposal, project.cnpj, project.organization, project.proponentState],
    [id, proposal, cnpj, organization, state]);
  assert.deepEqual(project.bankOrders, orders);
  for (const [orderId] of orders) {
    assert.ok(!sourceRows.bank.has(orderId), orderId);
    sourceRows.bank.add(orderId);
  }
  const plannedRows = goals.get(id);
  const planned = new Set(plannedRows.map(row => row[5]).filter(Boolean));
  assert.deepEqual(project.plannedMunicipalities, [...planned].sort().map(code => ({ code, name: places.get(code) })));
  assert.equal(project.goals, plannedRows.length);
  assert.equal(project.unresolvedGoals, plannedRows.filter(row => row[5] === null).length);

  const registry = project.api['projeto-investimento'];
  const geography = project.api.geometria;
  const physical = project.api['execucao-fisica'];
  for (const [endpoint, { source }] of Object.entries(project.api)) {
    const address = new URL(source.url);
    assert.equal(address.hostname, 'api-publica.obrasgov.gestao.gov.br');
    assert.equal(address.pathname, '/obras/' + endpoint);
    assert.equal(address.searchParams.get('id_projeto_investimento'), project.project);
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(source.bytes > 0);
  }
  assert.equal(registry.rows.length, 1);
  assert.ok(geography.rows.length > 0 && physical.rows.length <= 1);
  const registered = new Set(geography.rows.map(row => String(row.cod_ibge)));
  const comparison = planned.size === 0 ? 'unknown-plan' : planned.size === registered.size && [...planned].every(code => registered.has(code))
    ? 'same' : [...planned].some(code => registered.has(code)) ? 'partial' : 'different';
  assert.equal(project.geographyComparison, comparison);
  coverage[comparison]++;
  coverage.geographyRows += geography.rows.length;
  for (const row of geography.rows) {
    assert.match(String(row.cod_ibge), /^\d{7}$/);
    assert.ok(!sourceRows.geometry.has(row.id_geometria), row.id_geometria);
    sourceRows.geometry.add(row.id_geometria);
  }

  if (physical.rows.length) {
    coverage.currentPhysical++;
    const percent = physical.rows[0].percentual_execucao_fisica;
    if (percent !== null) assert.ok(Number(percent) >= 0 && Number(percent) <= 100);
    if (Number(percent) === 100) {
      coverage.current100++;
      if (registry.rows[0].situacao !== 'Concluída') {
        assert.equal(registry.rows[0].situacao, 'Em execução');
        coverage.current100OtherStatus++;
      }
    }
  }
  coverage.historicalPhysical += Number(project.physicalHistory.length > 0);
  coverage.historicalPhysicalRows += project.physicalHistory.length;
  for (const row of project.physicalHistory) {
    assert.ok(Number.isInteger(row.row) && row.row > 0 && !sourceRows.history.has(row.row));
    sourceRows.history.add(row.row);
  }
  for (const pair of project.commitments) {
    const key = [pair.issuingUnit, pair.commitmentNumber].join(':');
    assert.ok(!pairs.has(key), key);
    pairs.add(key);
    coverage.commitments++;
    for (const name of ['siconv', 'cipi']) {
      const row = pair[name];
      assert.ok(row.amountCentsBRL === null || Number.isSafeInteger(row.amountCentsBRL));
      assert.ok(Number.isInteger(row.row) && row.row > 0 && !sourceRows[name].has(row.row));
      sourceRows[name].add(row.row);
    }
  }

  assert.ok(built.includes(`href="${base + route + agreement}/"`), agreement);
  const detail = readFileSync(output + agreement + '/index.html', 'utf8');
  for (const id of ['status', 'locations', 'commitments', 'bank-orders']) {
    assert.ok(detail.includes(`id="${id}"`) && detail.includes(`href="#${id}"`), `${agreement} ${id}`);
  }
  assert.equal(detail.includes('id="municipal-context"'), ['895978', '953157'].includes(agreement));
  assert.ok(detail.includes('Report an error'), agreement);
}
assert.deepEqual(coverage, record.coverage);
assert.deepEqual([coverage.same, coverage.partial, coverage.different, coverage['unknown-plan']], [72, 3, 7, 6]);
assert.deepEqual([coverage.currentPhysical, coverage.historicalPhysical, coverage.current100, coverage.current100OtherStatus], [64, 61, 17, 5]);
assert.deepEqual([coverage.commitments, coverage.geographyRows, coverage.historicalPhysicalRows], [216, 95, 63]);

for (const [agreement, status, municipality, values] of [
  ['895978', 'Concluída', '3549904', ['683181', '41456', '6.1']],
  ['953157', 'Em execução', '4209003', ['29506', '1665', '5.6']],
]) {
  const project = projects.get(agreement);
  assert.equal(project.api['projeto-investimento'].rows[0].situacao, status);
  assert.equal(Number(project.api['execucao-fisica'].rows[0].percentual_execucao_fisica), 100);
  assert.deepEqual(project.plannedMunicipalities.map(place => place.code), [municipality]);
  assert.deepEqual(Object.values(record.census.values[municipality].variables).map(cell => cell.value), values);
}
assert.deepEqual(projects.get('895978').physicalHistory.map(row => row.row), [16456, 16457]);
assert.deepEqual(json(output + 'data.json'), record);
for (const [stage, rows] of Object.entries({
  projects: projects.size, commitments: pairs.size, 'bank-orders': sourceRows.bank.size,
  'registered-municipalities': sourceRows.geometry.size, 'physical-history': sourceRows.history.size,
})) {
  const csv = readFileSync(output + stage + '.csv', 'utf8').trimEnd();
  assert.equal(csv.split('\n').length - 1, rows, stage);
  assert.ok(built.includes(`href="${base + route + stage}.csv"`), stage);
}
for (const parent of ['funding-flows', 'charity-index', 'charity-index/coverage', 'funding-flows/brazil-planned-geography', 'funding-flows/brazil-transferegov']) {
  assert.ok(readFileSync(`dist/record/${parent}/index.html`, 'utf8').includes(`href="${base + route}"`), parent);
}
console.log(`Brazil infrastructure execution: ${projects.size} exact agreement/project links, ${pairs.size} paired commitments, ${sourceRows.bank.size} bank orders, two independent census contexts and all static exports checked.`);
