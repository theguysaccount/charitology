import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = 'public/data/funding-flows/';
const dir = root + 'brazil-planned-geography/';
const source = JSON.parse(readFileSync(dir + 'manifest.json'));
const transfer = JSON.parse(readFileSync(root + 'brazil-transferegov/manifest.json'));
assert.deepEqual(source.sources.transfers.asset, transfer.asset);
const load = (dir, asset) => {
  const bytes = readFileSync(dir + asset.path);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(hash(bytes), asset.sha256);
  const raw = gunzipSync(bytes);
  assert.equal(raw.length, asset.decodedBytes);
  assert.equal(hash(raw), asset.decodedSha256);
  return JSON.parse(raw);
};
const { plannedGoals, municipalities } = load(dir, source.asset);
const agreements = new Map(load(root + 'brazil-transferegov/', transfer.asset).map(row => [row[0], row]));
const places = new Map(municipalities.map(row => [row[0], row]));
assert.equal(agreements.size, source.selection.agreements);
assert.equal(places.size, municipalities.length);
assert.equal(places.size, source.selection.municipalities);
assert.deepEqual(source.fields.goals, ['proposalId', 'agreementId', 'workPlanGoalId', 'sourceDataRecord',
  'reportedGoalState', 'ibgeMunicipalityCode', 'matchStatus', 'plannedStart', 'plannedEnd']);
assert.deepEqual(source.fields.municipalities, ['municipalityCode', 'municipalityName', 'stateNameFromIBGE', 'odsPhysicalRow']);

const states = new Map('11:RO 12:AC 13:AM 14:RR 15:PA 16:AP 17:TO 21:MA 22:PI 23:CE 24:RN 25:PB 26:PE 27:AL 28:SE 29:BA 31:MG 32:ES 33:RJ 35:SP 41:PR 42:SC 43:RS 50:MS 51:MT 52:GO 53:DF'
  .split(' ').map(entry => entry.split(':')));
for (const place of places.values()) {
  assert.equal(place.length, 4);
  assert.match(place[0], /^\d{7}$/);
  assert.ok(states.has(place[0].slice(0, 2)));
  assert.ok(place.slice(1, 3).every(value => typeof value === 'string' && /^[\p{L}]/u.test(value)));
  assert.ok(Number.isSafeInteger(place[3]) && place[3] > 0);
}
assert.equal(new Set(municipalities.map(row => row[3])).size, places.size);

const statuses = { 'municipality-linked': 0, 'missing-state-or-municipality': 0, 'unresolved-municipality': 0 };
const goalsByAgreement = new Map();
const goalIds = new Set();
const coordinates = new Set();
const codes = new Set();
assert.equal(plannedGoals.length, source.selection.goals);
for (const row of plannedGoals) {
  assert.equal(row.length, 9);
  const [proposal, agreement, goal, coordinate, state, code, status, start, end] = row;
  assert.equal(agreements.get(agreement)?.[1], proposal);
  assert.match(goal, /^[0-9]{1,20}$/);
  assert.ok(!goalIds.has(goal) && !coordinates.has(coordinate));
  goalIds.add(goal);
  coordinates.add(coordinate);
  assert.ok(Number.isSafeInteger(coordinate) && coordinate >= 1 && coordinate <= source.sources.workPlan.dataRecords);
  assert.ok(state === null || [...states.values()].includes(state));
  assert.ok(Object.hasOwn(statuses, status));
  statuses[status]++;
  if (status === 'municipality-linked') {
    assert.ok(places.has(code));
    assert.equal(states.get(code.slice(0, 2)), state);
    codes.add(code);
  } else {
    assert.equal(code, null);
  }
  for (const date of [start, end]) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(date + 'T00:00:00Z').toISOString().slice(0, 10), date);
  }
  assert.ok(start <= end);
  if (!goalsByAgreement.has(agreement)) goalsByAgreement.set(agreement, []);
  goalsByAgreement.get(agreement).push(row);
}
assert.equal(codes.size, places.size);
assert.equal(goalsByAgreement.size, agreements.size);
assert.deepEqual(statuses, source.selection.goalStatuses);
const coverage = { allGoalsResolved: 0, someGoalsResolved: 0, noGoalsResolved: 0, multipleMunicipalities: 0,
  plannedStateDiffersFromProponent: 0 };
for (const [agreement, group] of goalsByAgreement) {
  const resolved = group.filter(row => row[5]);
  coverage[resolved.length === 0 ? 'noGoalsResolved' : resolved.length === group.length ? 'allGoalsResolved' : 'someGoalsResolved']++;
  coverage.multipleMunicipalities += Number(new Set(resolved.map(row => row[5])).size > 1);
  const state = agreements.get(agreement)[4];
  coverage.plannedStateDiffersFromProponent += Number(Boolean(state) && resolved.some(row => row[4] !== state));
}
assert.deepEqual(coverage, source.selection.agreementCoverage);
for (const [year, expected] of Object.entries(source.selection.byBankOrderYear)) {
  const eligible = [...agreements.values()].filter(row => row[9].some(order => order[1].slice(0, 4) === year));
  const overlap = eligible.map(row => goalsByAgreement.get(row[0]).filter(goal => goal[7] <= year + '-12-31' && goal[8] >= year + '-01-01'));
  const linked = overlap.flat().filter(goal => goal[5]);
  assert.deepEqual({
    agreementsWithBankOrders: eligible.length,
    agreementsWithOverlappingGoals: overlap.filter(group => group.length).length,
    agreementsWithLinkedOverlappingGoals: overlap.filter(group => group.some(row => row[5])).length,
    linkedOverlappingGoals: linked.length,
    linkedMunicipalities: new Set(linked.map(row => row[5])).size,
  }, expected);
}
assert.equal(agreements.get('949266')[4], 'MG');
assert.ok(goalsByAgreement.get('949266').some(row => row[5] === '1501402' && row[4] === 'PA'));
assert.equal(places.get('1501402')[1], 'Belém');
const cisterns = goalsByAgreement.get('945310');
assert.equal(cisterns.filter(row => row[5] === '1506807').length, 6);
assert.equal(cisterns.filter(row => !row[5]).length, 5);

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const route = '/record/funding-flows/brazil-planned-geography/';
const build = path => readFileSync('dist' + path + 'index.html', 'utf8');
const page = build(route);
for (const value of ['20,219', '11,329', '953', '4,491', '2,716', '5,583', 'Report an error', 'data-site-symbol="atlas"']) {
  assert.ok(page.includes(value), value);
}
for (const path of ['/record/funding-flows/', '/record/funding-flows/brazil-transferegov/',
  '/record/charity-index/', '/record/charity-index/coverage/']) {
  assert.ok(build(path).includes(`href="${base + route}"`), path);
}
assert.ok(build('/record/funding-flows/brazil-cisterns/').includes(`${base + route}?agreement=945310#lookup`));
assert.ok(page.includes(`href="${base}/data/funding-flows/brazil-planned-geography/planned-goals.json.gz"`));
console.log(`Brazil planned geography: ${plannedGoals.length} distinct plan goals, ${places.size} IBGE municipalities, both bank-order-year denominators and five entry routes verified.`);
