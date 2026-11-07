import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { fixtureState, fixtureSelected, sealFixtureVersion, FIXTURE_NOW } from '../model-bundles/test-fixtures.mjs';
import { makeSelected } from '../model-bundles/graph.mjs';
import { editorFormFromContent } from '../model-bundles/content.mjs';
import { hashValue, sha256Bytes, prettyBytes } from '../model-bundles/codec.mjs';
import {normalizeRaw, evaluateInput} from '../model-bundles/interpretations/v1/arithmetic.mjs';
import {makeRecordedRun} from '../model-bundles/interpretations/v1/encoding.mjs';
import { deriveGiftCredit, encodeDerivedValues } from './arithmetic-v1.mjs';

const compiled = await build({stdin: {contents: `export * from './src/lib/gift-estimate/model.ts';`, resolveDir: process.cwd()},
  bundle: true, write: false, format: 'esm', platform: 'node', metafile: true});
const m = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const producerBundle = await build({stdin:{contents:"export {giftsToJson} from './src/lib/client/gifts.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const producer = await import(`data:text/javascript;base64,${Buffer.from(producerBundle.outputFiles[0].text).toString('base64')}`);
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const decode = value => JSON.parse(new TextDecoder().decode(value));
const artifact = encode('ENGINEERING FIXTURE: fictional source bytes; no real study, participant or charity outcome.');
const chosenGift = {id: 'fictional-gift', date: '2026-10-28', organization: 'Fictional engineering example', amount: 100, cause: 'other', depth: null, sample: true,
  note: 'ENGINEERING FIXTURE; no payment or outcome.'};
const unrelatedGift = {...chosenGift, id: 'unrelated-gift', note: 'UNRELATED-DONOR-WRITING-MUST-NOT-LEAVE'};
const form = {mappedAmount: '50.00', donorCreditPercent: '25.00', giftMoneyBasis: 'nominal-USD-gift-year', moneyRationale: 'Fictional nominal USD for its logged year.',
  applicability: 'Fictional engineering allocation only; no empirical applicability.', linearFundingRationale: 'Assume proportional funding only for this software example.',
  donorCreditRationale: 'A fixed authored allocation assumption, not donor causation.', exclusions: 'No delivery, additionality, funding gap, fees or measured outcome.', acknowledgeLimits: true};
const platform = {createWorker() {
  const worker = new Worker(new URL('../model-bundles/pure-worker.fixture.mjs', import.meta.url)), listeners = new Map();
  return {addEventListener(type, listener) { const wrapped = type === 'message' ? data => listener({data}) : listener; listeners.set(listener, [type, wrapped]); worker.on(type, wrapped); },
    removeEventListener(type, listener) { const found = listeners.get(listener); if (found) worker.off(found[0], found[1]); listeners.delete(listener); },
    postMessage(value) { worker.postMessage(value); }, terminate() { void worker.terminate(); }};
}, setTimeout, clearTimeout};
async function selected(change = () => {}) {
  const state = await fixtureState(), version = structuredClone(state.versions[0]), content = version.content;
  content.period = {label: 'Fictional 2026 program period.', from: {precision: 'day', value: '2026-01-01'}, to: {precision: 'day', value: '2026-12-31'}};
  content.money = {currency: 'USD', priceYear: 2026, basis: 'nominal', inclusions: 'Fictional total cash cost.', exclusions: 'Unpriced resources unknown.', adjustment: null};
  const sha256 = await sha256Bytes(artifact);
  content.sources = [{id: 'fictional-source', title: 'ENGINEERING FIXTURE', publisher: null, url: null, locator: null, published: null, accessedOn: null,
    access: 'not-shared', license: null, note: 'Fictional software source; no scientific authority.', checksum: {kind: 'declared', sha256}}];
  content.sourceModel = {sourceId: 'fictional-source', artifactSha256: sha256, interpretation: 'Fictional authored interpretation for software acceptance.'};
  await change(content); state.versions[0] = await sealFixtureVersion(version); state.draft.expectedHead = {id:version.id,hash:state.versions[0].hash}; state.draft.form = await editorFormFromContent(content);
  return makeSelected(state, version.id, FIXTURE_NOW);
}
async function ready({modelChange, gift = chosenGift, gifts, modelBytes, loadSource = true} = {}) {
  const desk = m.createGiftEstimateDeskForTesting(platform);
  try {
    const giftBytes = encode(producer.giftsToJson(gifts ?? [gift, unrelatedGift]));
    const handle = await desk.admitGifts(giftBytes); desk.selectGift(handle, gift.id);
    const native = modelBytes ?? await selected(modelChange); await desk.admitModel(native);
    const observation = await desk.reproduce();
    if (observation.kind === 'matched' && loadSource) await desk.admitSource(artifact, FIXTURE_NOW);
    return {desk, giftBytes, native, observation};
  } catch (error) { desk.dispose(); throw error; }
}
async function errorCode(work, code) { await assert.rejects(work, error => { assert.equal(error.code, code); return true; }); }
async function resealPacket(packet) {
  delete packet.checksum; packet.checksum = await sha256Bytes(encode(`charitology-gift-estimate/v1/packet\n${canonical(packet)}\n`)); return encode(packet);
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

test('new method source pin and guarded inverse-then-quantile differ from divide-by-median', async () => {
  const bytes = await readFile(new URL('./arithmetic-v1.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), m.ESTIMATE_METHOD.sourceSha256);
  const costs = Array.from({length: 5000}, (_, i) => ({kind: 'finite', value: i < 2500 ? 1 : 100}));
  const actual = deriveGiftCredit(costs, 10000, 10000);
  assert.equal(actual.summary.median, 50.5); assert.notEqual(actual.summary.median, 100 / 50.5);
  assert.equal(actual.summary.p5, 1); assert.equal(actual.summary.p95, 100);
  assert.equal(encodeDerivedValues(actual.values).length, new TextEncoder().encode('gift-credit-from-matched-cpo-v1/sorted-binary64-le-v1\n').length + 40000);
});
test('unknown, zero and arithmetic-range boundaries are separate and strict', () => {
  for (const value of ['', ' 1', '+1', '01', '1e2', '$1', '1,000', '1.001', '0', '-0']) assert.throws(() => m.parseAmountCents(value));
  for (const value of ['', '100.01', ' 0', '1e1', '01', '-0']) assert.throws(() => m.parseCreditBasisPoints(value));
  assert.equal(m.parseAmountCents('0.01'), 1); assert.equal(m.parseCreditBasisPoints('0'), 0); assert.equal(m.parseCreditBasisPoints('12.34'), 1234);
  const costs = Array.from({length: 5000}, () => ({kind: 'finite', value: 1})); costs[0] = {kind: 'no-outcome'};
  assert.equal(deriveGiftCredit(costs, 1, 10000).summary.sourceNoOutcomeDraws, 1);
  assert.equal(deriveGiftCredit(costs, 1, 0).summary.median, 0);
  assert.ok(deriveGiftCredit(Array(5000).fill({kind: 'finite', value: Number.MAX_VALUE}), 1, 1).summary.median > 0);
  assert.throws(() => deriveGiftCredit(Array(5000).fill({kind: 'finite', value: Number.MIN_VALUE}), 1, 10000), {code: 'arithmetic-range'});
  assert.throws(() => deriveGiftCredit(Array(5000).fill({kind: 'finite', value: 0}), 1, 0), {code: 'arithmetic-input'});
});
test('actual Dashboard and selected-model producers reproduce, derive, export only selected gift, then requalify fresh', async () => {
  const fixture = await ready(), fresh = m.createGiftEstimateDeskForTesting(platform);
  try {
    assert.equal(fixture.observation.kind, 'matched');
    const review = await fixture.desk.review(form), inspected = fixture.desk.inspectReview(review);
    assert.equal(inspected.declaredResult.classification, 'hypothetical'); assert.equal(inspected.gift.file.coverage, 'unspecified');
    assert.equal(inspected.mapping.mappedCents, 5000); assert.equal(inspected.mapping.donorCreditBasisPoints, 2500);
    assert.equal(inspected.declaredResult.unmappedCents, 5000); assert.equal(inspected.declaredResult.unit.name, decode(fixture.native).modelVersion.content.outcome.name);
    await errorCode(fixture.desk.exportReviewed(review, FIXTURE_NOW, false), 'acknowledgement');
    const bytes = await fixture.desk.exportReviewed(review, FIXTURE_NOW, true), packet = decode(bytes), text = new TextDecoder().decode(bytes);
    assert.equal(text.includes(unrelatedGift.note), false); assert.equal(text.includes(new TextDecoder().decode(artifact)), false);
    assert.equal(Buffer.from(packet.model.nativeBase64, 'base64').equals(Buffer.from(fixture.native)), true);
    const historical = await fresh.admitPacket(bytes); assert.equal(fresh.inspectPacket(historical).currentResult, 'unknown-not-requalified');
    await errorCode(fresh.requalify(historical), 'gift-required');
    const gifts = await fresh.admitGifts(fixture.giftBytes); fresh.selectGift(gifts, chosenGift.id);
    await fresh.reusePacketModel(historical); await errorCode(fresh.requalify(historical), 'reproduction-required');
    assert.equal((await fresh.reproduce()).kind, 'matched'); await errorCode(fresh.requalify(historical), 'source-required');
    await fresh.admitSource(artifact, '2026-10-29T01:02:03.004Z');
    const requalified = fresh.inspectReview(await fresh.requalify(historical));
    assert.equal(requalified.declaredResult.fingerprint, inspected.declaredResult.fingerprint); assert.equal(requalified.origin.packetSha256, await sha256Bytes(bytes));
    assert.throws(() => { requalified.mapping.raw.applicability = 'changed'; }, TypeError);
  } finally { fixture.desk.dispose(); fresh.dispose(); }
});
test('historical flags/opaque handles and changed gift file identity never become current qualification', async () => {
  const fixture = await ready(), fresh = m.createGiftEstimateDeskForTesting(platform);
  try {
    const review = await fixture.desk.review(form), bytes = await fixture.desk.exportReviewed(review, FIXTURE_NOW, true);
    assert.throws(() => fixture.desk.inspectReview({}), {code: 'review-handle'});
    const packet = decode(bytes); packet.matched = true; await errorCode(fresh.admitPacket(await resealPacket(packet)), 'object-keys');
    const old = await fresh.admitPacket(bytes), giftFile = decode(fixture.giftBytes); giftFile.exportedAt = '2026-10-29T01:02:03.004Z';
    const handle = await fresh.admitGifts(encode(giftFile)); fresh.selectGift(handle, chosenGift.id); await fresh.reusePacketModel(old); await fresh.reproduce(); await fresh.admitSource(artifact, FIXTURE_NOW);
    await errorCode(fresh.requalify(old), 'requalification-mismatch');
    fixture.desk.invalidateReview(); assert.throws(() => fixture.desk.inspectReview(review), {code: 'review-handle'});
  } finally { fixture.desk.dispose(); fresh.dispose(); }
});
test('same ID changed nonnumeric gift text revokes exact old row; selected writing preserves escaped code units', async () => {
  const gift = {...chosenGift, note: 'literal\ud800\udfff'}, fixture = await ready({gift});
  try {
    const review = await fixture.desk.review(form), packet = decode(await fixture.desk.exportReviewed(review, FIXTURE_NOW, true));
    assert.equal(JSON.parse(packet.gift.rowJson).note, gift.note);
    const historical = await fixture.desk.admitPacket(encode(packet)), changed = decode(fixture.giftBytes); changed.gifts[0].depth = 4;
    const h = await fixture.desk.admitGifts(encode(changed)); fixture.desk.selectGift(h, gift.id);
    await errorCode(fixture.desk.requalify(historical), 'requalification-mismatch');
  } finally { fixture.desk.dispose(); }
});
test('native gift parsing refuses duplicate/extra/fractional/unknown/oversize rows without cleaning', async () => {
  const desk = m.createGiftEstimateDeskForTesting(platform);
  try {
    const native = JSON.parse(producer.giftsToJson([chosenGift]));
    for (const change of [v => v.gifts.push({...v.gifts[0]}), v => v.gifts[0].amount = 1.001, v => v.gifts[0].depth = 5,
      v => v.gifts[0].unknown = true, v => v.extra = true, v => v.gifts[0].id = '']) {
      const value = structuredClone(native); change(value); await assert.rejects(desk.admitGifts(encode(value)));
    }
    await assert.rejects(desk.admitGifts(encode(JSON.stringify(native).replace('"version":1', '"version":1,"\\u0076ersion":1'))));
    await errorCode(desk.admitGifts(new Uint8Array(m.ESTIMATE_LIMITS.gifts + 1)), 'byte-limit');
    const handle = await desk.admitGifts(encode(native)); desk.beginGiftChoice(); assert.throws(() => desk.inspectGifts(handle), {code: 'gift-handle'});
  } finally { desk.dispose(); }
});
test('actual producer admits and inspects all valid escaped gift rows above the separate packet cap', async () => {
  const gifts = Array.from({length: 2000}, (_, i) => ({...chosenGift, id: (`engineering-${i}-`).padEnd(64, '\ud800'),
    organization: '\ud800'.repeat(120), note: '\ud800'.repeat(200)}));
  const desk = m.createGiftEstimateDeskForTesting(platform);
  try {
    const bytes = encode(producer.giftsToJson(gifts));
    assert.ok(bytes.length > m.ESTIMATE_LIMITS.packet && bytes.length < m.ESTIMATE_LIMITS.gifts);
    const handle = await desk.admitGifts(bytes), inspected = desk.inspectGifts(handle);
    assert.equal(inspected.gifts.length, 2000); assert.equal(inspected.byteLength, bytes.length);
    assert.equal(inspected.sha256, await sha256Bytes(bytes)); assert.deepEqual(inspected.gifts, gifts);
    desk.selectGift(handle, gifts[1999].id); await desk.admitModel(await selected());
    assert.equal((await desk.reproduce()).kind, 'matched'); await desk.admitSource(artifact, FIXTURE_NOW);
    const packetBytes = await desk.exportReviewed(await desk.review(form), FIXTURE_NOW, true), packet = decode(packetBytes);
    assert.ok(packetBytes.length < m.ESTIMATE_LIMITS.packet);
    assert.equal(packet.gift.file.sha256, inspected.sha256); assert.equal(packet.gift.selectedId, gifts[1999].id);
    assert.deepEqual(JSON.parse(packet.gift.rowJson), gifts[1999]); assert.equal(Object.hasOwn(packet.gift.file, 'gifts'), false);
    assert.equal(new TextDecoder().decode(packetBytes).includes('engineering-0-'), false);
  } finally { desk.dispose(); }
});
test('money/period/source and authored funding/credit gates never substitute zero or a source match', async () => {
  for (const [change, expected] of [[c => c.money.priceYear = null, 'money-incompatible'], [c => c.money.basis = 'unknown', 'money-incompatible'],
    [c => c.period = {label: 'Year only', from: {precision: 'year', value: '2026'}, to: {precision: 'year', value: '2026'}}, 'period-incompatible'],
    [c => c.period.to.value = '2026-01-02', 'period-incompatible']]) {
    const {desk} = await ready({modelChange: change}); try { await errorCode(desk.review(form), expected); } finally { desk.dispose(); }
  }
  const fixture = await ready();
  try {
    for (const [change, code] of [[{donorCreditPercent: ''}, 'missing-donorCreditPercent'], [{mappedAmount: '101'}, 'funding-bound'], [{giftMoneyBasis: 'unknown'}, 'gift-money-basis'],
      [{applicability: ''}, 'missing-applicability'], [{acknowledgeLimits: false}, 'acknowledgement']]) await errorCode(fixture.desk.review({...form, ...change}), code);
    const zero = fixture.desk.inspectReview(await fixture.desk.review({...form, donorCreditPercent: '0'})); assert.equal(zero.declaredResult.summary.median, 0);
    fixture.desk.beginSourceChoice(); await errorCode(fixture.desk.review(form), 'source-required');
    await errorCode(fixture.desk.admitSource(encode('Different bytes'), FIXTURE_NOW), 'source-mismatch');
    await errorCode(fixture.desk.review(form), 'source-required');
  } finally { fixture.desk.dispose(); }
});
test('resealed false selected run admits as historical but mismatches real fixed worker and cannot derive', async () => {
  const fixture = await ready({modelChange: c => c.run.cost.p95.value *= 2});
  try { assert.equal(fixture.observation.kind, 'mismatched'); await errorCode(fixture.desk.review(form), 'reproduction-required'); }
  finally { fixture.desk.dispose(); }
});
test('picker cancellation, failed replacement, page suspension and completed stale work revoke authority', async () => {
  const fixture = await ready();
  try {
    const review = await fixture.desk.review(form); fixture.desk.beginModelChoice(); assert.throws(() => fixture.desk.inspectReview(review), {code: 'review-handle'});
    await errorCode(fixture.desk.review(form), 'model-required');
    await fixture.desk.admitModel(fixture.native); const pending = fixture.desk.reproduce(); fixture.desk.beginModelChoice(); await assert.rejects(pending);
    const admission = fixture.desk.admitGifts(fixture.giftBytes); fixture.desk.beginGiftChoice(); await errorCode(admission, 'stale');
    const selectedRead = fixture.desk.admitModel(fixture.native); fixture.desk.suspend(); await assert.rejects(selectedRead);
    await errorCode(fixture.desk.review(form), 'gift-required'); fixture.desk.dispose(); await errorCode(fixture.desk.admitGifts(fixture.giftBytes), 'disposed');
  } finally { fixture.desk.dispose(); }
});

test('missing source, unsupported engine, refusal, non-cent floor and illustrative real-gift cases stay unqualified', async () => {
  const cases = [
    {modelChange: c => { c.sourceModel = null; c.sources = []; }, loadSource: false, code: 'source-required'},
    {modelChange: c => c.classification = 'illustrative', gift: {...chosenGift, sample: undefined}, code: 'illustrative-real-gift'},
    {modelChange: async c => { c.raw.values.cost = ['0.001', '0.01', '0.02']; c.input = normalizeRaw(c.raw); c.run = await makeRecordedRun(c.enginePin, c.input, evaluateInput(c.input)); }, code: 'cost-floor-cents'},
  ];
  for (const {code, ...options} of cases) {
    if (options.gift) delete options.gift.sample;
    const fixture = await ready(options); try { await errorCode(fixture.desk.review(form), code); } finally { fixture.desk.dispose(); }
  }
  const desk = m.createGiftEstimateDeskForTesting(platform);
  try { await errorCode(desk.admitModel(await fixtureSelected('unsupported')), 'unsupported-engine'); }
  finally { desk.dispose(); }
  const refused = await ready({modelBytes: await fixtureSelected('refused')});
  try { assert.equal(refused.observation.kind, 'arithmetic-refusal'); await errorCode(refused.desk.review(form), 'reproduction-required'); }
  finally { refused.desk.dispose(); }
});
test('actual producer raw decimal floors preserve exact cents without binary rounding or precision-collapse repair', async () => {
  const cases = [
    ['0.29', '0.29', 29], ['1.01', '1.01', 101], ['0.2900', '0.29', 29],
    ['0.291', '0.29', null], ['0.2900000000000000001', '0.29', null],
    ['90071992547409.91', '50', Number.MAX_SAFE_INTEGER], ['90071992547409.92', '50', null],
  ];
  for (const [raw, mappedAmount, expectedCents] of cases) {
    const fixture = await ready({modelChange: async c => {
      c.raw.values.cost = [raw, raw, raw]; c.input = normalizeRaw(c.raw);
      c.run = await makeRecordedRun(c.enginePin, c.input, evaluateInput(c.input));
    }});
    try {
      assert.equal(fixture.observation.kind, 'matched'); const normalized = decode(fixture.native).modelVersion.content.input.values.cost[0];
      if (expectedCents === null) await errorCode(fixture.desk.review({...form, mappedAmount}), 'cost-floor-cents');
      else {
        assert.equal(m.sourceCostFloorCents(raw, normalized), expectedCents);
        const review = fixture.desk.inspectReview(await fixture.desk.review({...form, mappedAmount}));
        assert.ok(review.mapping.mappedCents / 100 <= normalized); assert.equal(review.mapping.mappedCents, {'0.29':29, '1.01':101, '50':5000}[mappedAmount]);
      }
      if (raw === '0.29') assert.notEqual(normalized * 100, 29, 'This actual binary64 floor demonstrates why multiplication cannot establish exact cents');
    } finally { fixture.desk.dispose(); }
  }
  for (const token of ['$0.29', '2.9e-1', ' 0.29', '+0.29']) assert.throws(() => m.sourceCostFloorCents(token, 0.29), {code:'cost-floor-cents'});
  assert.throws(() => m.sourceCostFloorCents('0.29', 0.29000000000000004), {code:'cost-floor-cents'});
});
test('a fully resealed false historical estimate remains Unknown and fails fresh numerical requalification', async () => {
  const fixture = await ready(), fresh = m.createGiftEstimateDeskForTesting(platform);
  try {
    const packet = decode(await fixture.desk.exportReviewed(await fixture.desk.review(form), FIXTURE_NOW, true));
    packet.declaredResult.summary.p95 *= 2;
    const {fingerprint: _old, ...resultBody} = packet.declaredResult;
    packet.declaredResult.fingerprint = await sha256Bytes(encode(`charitology-gift-estimate/v1/result\n${canonical({method:packet.method,gift:packet.gift,model:packet.model,mapping:packet.mapping,result:resultBody})}\n`));
    const historical = await fresh.admitPacket(await resealPacket(packet));
    assert.equal(fresh.inspectPacket(historical).currentResult, 'unknown-not-requalified');
    const h = await fresh.admitGifts(fixture.giftBytes); fresh.selectGift(h, chosenGift.id); await fresh.reusePacketModel(historical); await fresh.reproduce(); await fresh.admitSource(artifact, FIXTURE_NOW);
    await errorCode(fresh.requalify(historical), 'requalification-mismatch');
    fresh.suspend(); assert.throws(() => fresh.inspectPacket(historical), {code:'packet-handle'});
  } finally { fixture.desk.dispose(); fresh.dispose(); }
});
test('new consumer graph has no old storage reads, runtime observation profiles or provider client', () => {
  const sources = Object.keys(compiled.metafile.inputs).filter(path => !path.endsWith('/gifts.ts'));
  assert.equal(sources.some(path => /model-runtime|runtime-profile|donor-recovery-cell|durable-store|donor-recovery\.ts|session\.mjs$/.test(path)), false);
});
