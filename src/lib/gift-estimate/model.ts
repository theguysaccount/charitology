import { canonicalD1Json, copyD1Plain, validateD1Value } from '../client/donor-recovery-schemas';
import { strictD1Json } from '../client/donor-recovery-formats';
import type { Gift } from '../client/gifts';
import { createPureSessionBridge, createPureSessionBridgeForTesting, type PureSessionBridge } from '../model-bundles/pure.mjs';
import type { ModelWorkerPlatform } from '../model-bundles/worker-client.mjs';
import { parseSelected } from '../model-bundles/graph.mjs';
import { validateInstant } from '../model-bundles/content.mjs';
import { parseJsonBytes, hashValue, sha256Bytes, object } from '../model-bundles/codec.mjs';
import type { AdmittedSelected, ComparisonOutcome, SelectedBundle, SourceChecksumHandle, LocalChecksum, OwnedJob } from '../model-bundles/types';
import { METHOD_ID, deriveGiftCredit, encodeDerivedValues, type GiftSummary } from './arithmetic-v1.mjs';

export const ESTIMATE_METHOD = Object.freeze({ id: METHOD_ID, sourceSha256: 'ccd7dba0309023add4d4aac84d9c1bdccc7daa67bd10cef99697173a6c6ab774',
  arrayEncoding: 'sorted-binary64-le-v1', quantile: 'type7-finite-v1' });
export const ESTIMATE_LIMITS = Object.freeze({ gifts: 5_000_000, giftRows: 2000, selected: 2 * 1024 * 1024,
  artifact: 8 * 1024 * 1024, packet: 4 * 1024 * 1024, draws: 1024 * 1024, recovery: 4 * 1024 * 1024, fileReadMs: 30_000 });
export const ESTIMATE_NOTICE = 'Conditional modeled estimate with authored assumptions; not measured impact or independently reviewed evidence.';
export class GiftEstimateError extends Error {
  readonly code: string;
  constructor(code: string) { super('The gift estimate is unavailable. Current writing remains available.'); this.name = 'GiftEstimateError'; this.code = code; }
}
function fail(code: string): never { throw new GiftEstimateError(code); }
const encoder = new TextEncoder();
type Obj = Record<string, any>;
export type EstimateForm = Readonly<{ mappedAmount: string; donorCreditPercent: string; giftMoneyBasis: string;
  moneyRationale: string; applicability: string; linearFundingRationale: string; donorCreditRationale: string; exclusions: string;
  acknowledgeLimits: boolean }>;
const FORM_TEXT = ['mappedAmount', 'donorCreditPercent', 'giftMoneyBasis', 'moneyRationale', 'applicability', 'linearFundingRationale', 'donorCreditRationale', 'exclusions'] as const;
type Mapping = Readonly<{ raw: EstimateForm; mappedCents: number; donorCreditBasisPoints: number; currency: 'USD'; basis: 'nominal'; priceYear: number }>;
type GiftFile = Readonly<{ format: 'charitology-gifts'; version: 1; exportedAt: string; byteLength: number; sha256: string;
  coverage: 'unspecified'; gifts: readonly Gift[] }>;
type GiftBinding = Readonly<{ file: Omit<GiftFile, 'gifts'>; selectedId: string; rowJson: string; rowSha256: string }>;
type ModelBinding = Readonly<{ byteLength: number; sha256: string; nativeBase64: string; versionId: string; versionHash: string; contentHash: string;
  enginePin: SelectedBundle['modelVersion']['content']['enginePin']; inputHash: string; runSha256: string; costsSha256: string; outcomesSha256: string }>;
export type EstimateResult = Readonly<{ classification: 'hypothetical' | 'conditional-user-hypothesis'; notice: typeof ESTIMATE_NOTICE;
  summary: GiftSummary; derivedValuesSha256: string; fingerprint: string; unmappedCents: number;
  unit: SelectedBundle['modelVersion']['content']['outcome']; timeHorizon: string; discountRationale: string }>;
type PacketBody = Readonly<{ format: 'charitology-gift-model-estimate'; schemaVersion: 1; method: typeof ESTIMATE_METHOD; exportedAt: string;
  gift: GiftBinding; model: ModelBinding; sourceArtifact: LocalChecksum & {sourceId: string}; mapping: Mapping; declaredResult: EstimateResult;
  origin: null | {packetSha256: string; reason: string} }>;
export type EstimatePacket = PacketBody & {checksum: string};
declare const opaque: unique symbol;
export type GiftFileHandle = {readonly [opaque]: 'gift-file'};
export type EstimateReview = {readonly [opaque]: 'review'};
export type HistoricalPacket = {readonly [opaque]: 'historical-packet'};
const token = <T>(): T => Object.freeze({}) as T;
function own<T>(value: T, maxBytes = ESTIMATE_LIMITS.packet): Readonly<T> {
  const copied = copyD1Plain(value, maxBytes);
  function freeze(input: any): any { if (input && typeof input === 'object') { for (const item of Object.values(input)) freeze(item); Object.freeze(input); } return input; }
  return freeze(copied) as Readonly<T>;
}
function equal(a: unknown, b: unknown): boolean { return canonicalD1Json(a) === canonicalD1Json(b); }
function exact(value: unknown, keys: readonly string[]): asserts value is Obj { object(value, keys); }
function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('hash'); }
function integer(value: unknown, low: number, high: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < low || (value as number) > high || Object.is(value, -0)) fail('integer');
}
function sourceBytes(value: Uint8Array, cap: number): Uint8Array {
  if (!value || Object.getPrototypeOf(value) !== Uint8Array.prototype || !ArrayBuffer.isView(value)) fail('byte-limit');
  const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
  const length = getter.call(value); if (length > cap) fail('byte-limit');
  const bytes = new Uint8Array(length); Uint8Array.prototype.set.call(bytes, value); return bytes;
}
async function fingerprint(kind: string, value: unknown): Promise<string> {
  return sha256Bytes(encoder.encode(`charitology-gift-estimate/v1/${kind}\n${canonicalD1Json(value)}\n`));
}
function base64(bytes: Uint8Array): string {
  let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value);
}
function unbase64(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(ESTIMATE_LIMITS.selected / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('base64');
  const text = atob(value); if (text.length > ESTIMATE_LIMITS.selected) fail('byte-limit');
  const bytes = Uint8Array.from(text, character => character.charCodeAt(0)); if (base64(bytes) !== value) fail('base64'); return bytes;
}
export function parseAmountCents(value: string): number {
  if (typeof value !== 'string' || value.length > 16 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)) fail('amount');
  const [whole, fraction = ''] = value.split('.'), cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  integer(cents, 1, 999_999_999_999); return cents;
}
export function parseCreditBasisPoints(value: string): number {
  if (typeof value !== 'string' || value.length > 6 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)) fail('credit');
  const [whole, fraction = ''] = value.split('.'), points = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  integer(points, 0, 10000); return points;
}
/** Monetary interpretation comes from the admitted raw decimal, not rounding a
 * binary product. Other legacy tokens remain unsupported by this consumer. */
export function sourceCostFloorCents(raw: unknown, normalized: number): number {
  if (typeof raw !== 'string' || raw.length > 128 || !/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(raw)) fail('cost-floor-cents');
  const [whole = '', fraction = ''] = raw.split('.');
  if (/[1-9]/.test(fraction.slice(2))) fail('cost-floor-cents');
  const exactCents = BigInt(whole || '0') * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  if (exactCents <= 0n || exactCents > BigInt(Number.MAX_SAFE_INTEGER)) fail('cost-floor-cents');
  const cents = Number(exactCents);
  if (!Number.isFinite(normalized) || normalized <= 0 || cents / 100 !== normalized) fail('cost-floor-cents');
  return cents;
}
export function validateEstimateForm(value: unknown): EstimateForm {
  const form = own(value) as Obj; exact(form, [...FORM_TEXT, 'acknowledgeLimits']);
  for (const key of FORM_TEXT) if (typeof form[key] !== 'string' || form[key].length > (key === 'mappedAmount' ? 16 : key === 'donorCreditPercent' ? 6 : 8000)) fail('form');
  if (typeof form.acknowledgeLimits !== 'boolean') fail('form'); return form as EstimateForm;
}
function mappingFor(form: EstimateForm, gift: Gift, bundle: SelectedBundle): Mapping {
  for (const key of FORM_TEXT) if (!form[key].trim()) fail(`missing-${key}`);
  if (form.acknowledgeLimits !== true) fail('acknowledgement');
  if (form.giftMoneyBasis !== 'nominal-USD-gift-year') fail('gift-money-basis');
  const content = bundle.modelVersion.content, year = Number(gift.date.slice(0, 4));
  if (content.money.currency !== 'USD' || content.money.basis !== 'nominal' || content.money.priceYear !== year) fail('money-incompatible');
  if (content.period.from?.precision !== 'day' || content.period.to?.precision !== 'day' || content.period.from.value > gift.date || content.period.to.value < gift.date) fail('period-incompatible');
  if (content.classification === 'illustrative' && gift.sample !== true) fail('illustrative-real-gift');
  const mappedCents = parseAmountCents(form.mappedAmount), donorCreditBasisPoints = parseCreditBasisPoints(form.donorCreditPercent);
  const floor = content.input.values.cost[0], floorCents = sourceCostFloorCents(content.raw.values.cost[0], floor), giftCents = Math.round(gift.amount * 100);
  if (mappedCents > giftCents || mappedCents > floorCents || mappedCents / 100 > floor) fail('funding-bound');
  return own({ raw: form, mappedCents, donorCreditBasisPoints, currency: 'USD' as const, basis: 'nominal' as const, priceYear: year });
}
async function giftBinding(file: GiftFile, gift: Gift): Promise<GiftBinding> {
  const {gifts: _omitted, ...descriptor} = file, rowJson = canonicalD1Json(gift);
  return own({file: descriptor, selectedId: gift.id, rowJson, rowSha256: await fingerprint('gift-row', rowJson)});
}
async function modelBinding(bytes: Uint8Array, bundle: SelectedBundle): Promise<ModelBinding> {
  const version = bundle.modelVersion, run = version.content.run;
  return own({byteLength: bytes.length, sha256: await sha256Bytes(bytes), nativeBase64: base64(bytes), versionId: version.id, versionHash: version.hash,
    contentHash: version.contentHash, enginePin: version.content.enginePin, inputHash: run.inputHash, runSha256: await hashValue('run', run),
    costsSha256: run.costsSha256, outcomesSha256: run.outcomesSha256});
}
function parseGiftRow(json: unknown): Gift {
  if (typeof json !== 'string') fail('gift-row'); const row = validateD1Value('gifts', [strictD1Json(json, ESTIMATE_LIMITS.gifts)])[0];
  if (canonicalD1Json(row) !== json) fail('gift-row-canonical'); return row;
}
async function parseGiftFile(value: Uint8Array): Promise<GiftFile> {
  const bytes = sourceBytes(value, ESTIMATE_LIMITS.gifts), source = strictD1Json(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes), ESTIMATE_LIMITS.gifts); exact(source, ['format', 'version', 'exportedAt', 'gifts']);
  if (source.format !== 'charitology-gifts' || source.version !== 1) fail('gift-format'); validateInstant(source.exportedAt);
  if (!Array.isArray(source.gifts) || source.gifts.length > ESTIMATE_LIMITS.giftRows) fail('gift-count');
  const gifts = validateD1Value('gifts', source.gifts);
  return own({format: 'charitology-gifts', version: 1, exportedAt: source.exportedAt, byteLength: bytes.length, sha256: await sha256Bytes(bytes), coverage: 'unspecified', gifts}, ESTIMATE_LIMITS.gifts);
}
function checkSummary(value: unknown): asserts value is GiftSummary {
  exact(value, ['draws', 'sourceNoOutcomeDraws', 'p5', 'median', 'p95']);
  if (value.draws !== 5000) fail('draw-count'); integer(value.sourceNoOutcomeDraws, 0, 5000);
  for (const key of ['p5', 'median', 'p95']) if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || Object.is(value[key], -0)) fail('result-range');
  if (!(value.p5 <= value.median && value.median <= value.p95)) fail('result-order');
}
async function parsePacket(value: Uint8Array): Promise<{packet: EstimatePacket; bundle: SelectedBundle; bytes: Uint8Array; sha256: string}> {
  const bytes = sourceBytes(value, ESTIMATE_LIMITS.packet), source = strictD1Json(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes), ESTIMATE_LIMITS.packet);
  exact(source, ['format', 'schemaVersion', 'method', 'exportedAt', 'gift', 'model', 'sourceArtifact', 'mapping', 'declaredResult', 'origin', 'checksum']);
  if (source.format !== 'charitology-gift-model-estimate' || source.schemaVersion !== 1) fail('packet-format');
  if (!equal(source.method, ESTIMATE_METHOD)) fail('unsupported-method'); validateInstant(source.exportedAt); hash(source.checksum);
  const {checksum: _checksum, ...body} = source; if (await fingerprint('packet', body) !== source.checksum) fail('packet-checksum');
  exact(source.gift, ['file', 'selectedId', 'rowJson', 'rowSha256']); exact(source.gift.file, ['format', 'version', 'exportedAt', 'byteLength', 'sha256', 'coverage']);
  const descriptor = source.gift.file; if (descriptor.format !== 'charitology-gifts' || descriptor.version !== 1 || descriptor.coverage !== 'unspecified') fail('gift-format');
  validateInstant(descriptor.exportedAt); integer(descriptor.byteLength, 1, ESTIMATE_LIMITS.gifts); hash(descriptor.sha256); hash(source.gift.rowSha256);
  const gift = parseGiftRow(source.gift.rowJson); if (gift.id !== source.gift.selectedId || await fingerprint('gift-row', source.gift.rowJson) !== source.gift.rowSha256) fail('gift-row-hash');
  exact(source.model, ['byteLength', 'sha256', 'nativeBase64', 'versionId', 'versionHash', 'contentHash', 'enginePin', 'inputHash', 'runSha256', 'costsSha256', 'outcomesSha256']);
  const modelBytes = unbase64(source.model.nativeBase64), bundle = await parseSelected(modelBytes);
  if (!equal(source.model, await modelBinding(modelBytes, bundle))) fail('model-binding');
  exact(source.sourceArtifact, ['kind', 'sha256', 'byteLength', 'hashedAt', 'sourceId']);
  if (source.sourceArtifact.kind !== 'local-bytes' || bundle.modelVersion.content.sourceModel?.sourceId !== source.sourceArtifact.sourceId ||
      bundle.modelVersion.content.sourceModel?.artifactSha256 !== source.sourceArtifact.sha256) fail('source-binding');
  integer(source.sourceArtifact.byteLength, 0, ESTIMATE_LIMITS.artifact); hash(source.sourceArtifact.sha256); validateInstant(source.sourceArtifact.hashedAt);
  exact(source.mapping, ['raw', 'mappedCents', 'donorCreditBasisPoints', 'currency', 'basis', 'priceYear']);
  const mapping = mappingFor(validateEstimateForm(source.mapping.raw), gift, bundle); if (!equal(mapping, source.mapping)) fail('mapping-binding');
  const result = source.declaredResult; exact(result, ['classification', 'notice', 'summary', 'derivedValuesSha256', 'fingerprint', 'unmappedCents', 'unit', 'timeHorizon', 'discountRationale']);
  checkSummary(result.summary); hash(result.derivedValuesSha256); hash(result.fingerprint);
  if (result.notice !== ESTIMATE_NOTICE || result.classification !== (gift.sample === true || bundle.modelVersion.content.classification === 'illustrative' ? 'hypothetical' : 'conditional-user-hypothesis') ||
      result.unmappedCents !== Math.round(gift.amount * 100) - mapping.mappedCents || !equal(result.unit, bundle.modelVersion.content.outcome) ||
      result.timeHorizon !== bundle.modelVersion.content.population.timeHorizon || result.discountRationale !== bundle.modelVersion.content.assumptions.discountRationale) fail('result-binding');
  const {fingerprint: _resultHash, ...resultBody} = result; if (await fingerprint('result', {method: ESTIMATE_METHOD, gift: source.gift, model: source.model, mapping, result: resultBody}) !== result.fingerprint) fail('result-fingerprint');
  if (source.origin !== null) { exact(source.origin, ['packetSha256', 'reason']); hash(source.origin.packetSha256); if (typeof source.origin.reason !== 'string' || !source.origin.reason.trim() || source.origin.reason.length > 2000) fail('origin'); }
  return {packet: own(source) as EstimatePacket, bundle, bytes, sha256: await sha256Bytes(bytes)};
}

/** Page-only owned capabilities. No key, localStorage, network or registry write. */
function desk(bridge: PureSessionBridge) {
  let disposed = false, life = 1, revision = 1, giftEpoch = 1, modelEpoch = 1, sourceEpoch = 1;
  let file: GiftFile | null = null, gift: Gift | null = null;
  let model: {bytes: Uint8Array; selected: AdmittedSelected; bundle: SelectedBundle; comparison: ComparisonOutcome | null} | null = null;
  let source: {handle: SourceChecksumHandle; sourceId: string} | null = null;
  let modelAbort = new AbortController(), sourceAbort = new AbortController();
  const files = new WeakMap<GiftFileHandle, {epoch: number; file: GiftFile}>(), reviews = new WeakMap<EstimateReview, {revision: number; life: number; body: Omit<PacketBody, 'exportedAt'>}>();
  const historical = new WeakMap<HistoricalPacket, Awaited<ReturnType<typeof parsePacket>> & {life: number}>();
  function live() { if (disposed) fail('disposed'); }
  function revokeReview() { live(); if (++revision >= Number.MAX_SAFE_INTEGER) { disposed = true; bridge.dispose(); fail('generation-limit'); } }
  function current(captured: number) { live(); if (revision !== captured) fail('stale'); }
  function clearSource() { sourceAbort.abort(); sourceAbort = new AbortController(); sourceEpoch++; if (source) bridge.revokeSourceChecksum(source.sourceId); source = null; }
  function modelJob(): OwnedJob {
    const epoch = modelEpoch, capturedLife = life, signal = modelAbort.signal;
    return {epoch, formGeneration: 0, storeGeneration: 1, signal, isCurrent: () => !disposed && life === capturedLife && modelEpoch === epoch && !signal.aborted};
  }
  function sourceJob(): OwnedJob {
    const base = modelJob(), epoch = sourceEpoch, signal = sourceAbort.signal;
    return {...base, signal, isCurrent: () => base.isCurrent() && sourceEpoch === epoch && !signal.aborted};
  }
  async function calculate(formValue: unknown, prior: HistoricalPacket | null): Promise<EstimateReview> {
    revokeReview(); const captured = revision, form = validateEstimateForm(formValue), chosenFile = file, chosenGift = gift, chosenModel = model, chosenSource = source;
    if (!chosenFile || !chosenGift) fail('gift-required'); if (!chosenModel) fail('model-required');
    if (!chosenModel.comparison || bridge.api.inspectComparison(chosenModel.comparison).kind !== 'matched') fail('reproduction-required');
    if (!chosenSource || chosenModel.bundle.modelVersion.content.sourceModel === null) fail('source-required');
    const sourceArtifact = {...bridge.inspectSourceChecksum(chosenSource.handle), sourceId: chosenSource.sourceId};
    if (chosenModel.bundle.modelVersion.content.sourceModel.artifactSha256 !== sourceArtifact.sha256) fail('source-mismatch');
    const mapping = mappingFor(form, chosenGift, chosenModel.bundle);
    const binding = await giftBinding(chosenFile, chosenGift); current(captured);
    const boundModel = await modelBinding(chosenModel.bytes, chosenModel.bundle); current(captured);
    const drawBytes = await bridge.api.makeDraws(chosenModel.comparison); current(captured);
    const draws = parseJsonBytes(drawBytes, {maxBytes: ESTIMATE_LIMITS.draws}) as Obj;
    exact(draws, ['format', 'schemaVersion', 'versionId', 'versionHash', 'enginePin', 'inputHash', 'costsSha256', 'outcomesSha256', 'costs', 'outcomes', 'notice', 'checksum']);
    const {checksum, ...drawBody} = draws;
    if (draws.format !== 'charitology-model-draws' || draws.schemaVersion !== 1 || draws.versionId !== boundModel.versionId || draws.versionHash !== boundModel.versionHash ||
      !equal(draws.enginePin, boundModel.enginePin) || draws.inputHash !== boundModel.inputHash || draws.costsSha256 !== boundModel.costsSha256 || draws.outcomesSha256 !== boundModel.outcomesSha256 ||
      checksum !== await hashValue('draws', drawBody)) fail('draw-binding'); current(captured);
    const derived = deriveGiftCredit(draws.costs, mapping.mappedCents, mapping.donorCreditBasisPoints);
    const valuesSha256 = await sha256Bytes(encodeDerivedValues(derived.values)); current(captured);
    const content = chosenModel.bundle.modelVersion.content;
    const resultBody = {classification: chosenGift.sample === true || content.classification === 'illustrative' ? 'hypothetical' as const : 'conditional-user-hypothesis' as const,
      notice: ESTIMATE_NOTICE as typeof ESTIMATE_NOTICE, summary: derived.summary, derivedValuesSha256: valuesSha256, unmappedCents: Math.round(chosenGift.amount * 100) - mapping.mappedCents,
      unit: content.outcome, timeHorizon: content.population.timeHorizon, discountRationale: content.assumptions.discountRationale};
    const result: EstimateResult = own({...resultBody, fingerprint: await fingerprint('result', {method: ESTIMATE_METHOD, gift: binding, model: boundModel, mapping, result: resultBody})}); current(captured);
    let origin: PacketBody['origin'] = null;
    if (prior !== null) {
      const previous = historical.get(prior); if (!previous || previous.life !== life) fail('packet-handle');
      if (!equal(previous.packet.gift, binding) || !equal(previous.packet.model, boundModel) || !equal(previous.packet.mapping, mapping) ||
        previous.packet.sourceArtifact.sourceId !== sourceArtifact.sourceId || previous.packet.sourceArtifact.sha256 !== sourceArtifact.sha256 ||
        previous.packet.sourceArtifact.byteLength !== sourceArtifact.byteLength || !equal(previous.packet.declaredResult, result)) fail('requalification-mismatch');
      origin = {packetSha256: previous.sha256, reason: 'Freshly chosen original gift and source bytes, and exact selected model reproduction, requalify this conditional calculation.'};
    }
    current(captured); bridge.api.inspectComparison(chosenModel.comparison); bridge.inspectSourceChecksum(chosenSource.handle);
    const handle = token<EstimateReview>(); reviews.set(handle, {revision: captured, life, body: own({format: 'charitology-gift-model-estimate', schemaVersion: 1,
      method: ESTIMATE_METHOD, gift: binding, model: boundModel, sourceArtifact, mapping, declaredResult: result, origin})}); return handle;
  }
  return Object.freeze({
    invalidateReview: revokeReview,
    beginGiftChoice() { revokeReview(); giftEpoch++; file = null; gift = null; },
    async admitGifts(value: Uint8Array) {
      this.beginGiftChoice(); const epoch = giftEpoch, chosen = await parseGiftFile(value); live(); if (epoch !== giftEpoch) fail('stale');
      file = chosen; const handle = token<GiftFileHandle>(); files.set(handle, {epoch, file: chosen}); return handle;
    },
    inspectGifts(handle: GiftFileHandle) { live(); const found = files.get(handle); if (!found || found.epoch !== giftEpoch || found.file !== file) fail('gift-handle'); return own(found.file, ESTIMATE_LIMITS.gifts); },
    selectGift(handle: GiftFileHandle, id: string) { revokeReview(); const found = files.get(handle); if (!found || found.epoch !== giftEpoch || found.file !== file) fail('gift-handle');
      gift = found.file.gifts.find(row => row.id === id) ?? null; if (!gift) fail('gift-id'); return own(gift); },
    beginModelChoice() { revokeReview(); modelEpoch++; modelAbort.abort(); modelAbort = new AbortController(); clearSource(); model = null; bridge.revokeSelections(); },
    async admitModel(value: Uint8Array) {
      this.beginModelChoice(); const epoch = modelEpoch, bytes = sourceBytes(value, ESTIMATE_LIMITS.selected), selected = await bridge.api.admitSelected(bytes); live();
      if (epoch !== modelEpoch) fail('stale'); const inspection = bridge.api.inspectSelected(selected); model = {bytes, selected, bundle: inspection.bundle, comparison: null}; return own(inspection);
    },
    async reproduce() { revokeReview(); const chosen = model; if (!chosen) fail('model-required'); const epoch = ++modelEpoch; modelAbort.abort(); modelAbort = new AbortController(); bridge.cancelCalculations();
      chosen.comparison = null; const comparison = await bridge.api.recalculate(chosen.selected, modelJob()); live(); if (epoch !== modelEpoch || model !== chosen) fail('stale');
      chosen.comparison = comparison; return bridge.api.inspectComparison(comparison); },
    beginSourceChoice() { revokeReview(); clearSource(); },
    async admitSource(value: Uint8Array, now: string) {
      this.beginSourceChoice(); const chosen = model, sourceModel = chosen?.bundle.modelVersion.content.sourceModel; if (!chosen || !sourceModel) fail('source-required');
      const epoch = sourceEpoch, handle = await bridge.hashSourceFile(sourceModel.sourceId, sourceBytes(value, ESTIMATE_LIMITS.artifact), now, sourceJob()); live();
      if (sourceEpoch !== epoch || model !== chosen) fail('stale'); const checksum = bridge.inspectSourceChecksum(handle);
      const description = chosen.bundle.modelVersion.content.sources.find(item => item.id === sourceModel.sourceId)!;
      if (checksum.sha256 !== sourceModel.artifactSha256 || description.checksum?.kind === 'local-bytes' && description.checksum.byteLength !== checksum.byteLength) fail('source-mismatch'); source = {handle, sourceId: sourceModel.sourceId}; return own({...checksum, sourceId: sourceModel.sourceId});
    },
    review(form: unknown) { return calculate(form, null); },
    inspectReview(handle: EstimateReview) { live(); const found = reviews.get(handle); if (!found || found.life !== life || found.revision !== revision) fail('review-handle'); return own(found.body); },
    async exportReviewed(handle: EstimateReview, now: string, acknowledge: boolean) {
      if (acknowledge !== true) fail('acknowledgement'); const body = this.inspectReview(handle), captured = revision; validateInstant(now);
      const packetBody = {...body, exportedAt: now}, checksum = await fingerprint('packet', packetBody); current(captured);
      const bytes = encoder.encode(JSON.stringify({...packetBody, checksum}, null, 2) + '\n'); if (bytes.length > ESTIMATE_LIMITS.packet) fail('byte-limit');
      this.inspectReview(handle); return bytes;
    },
    async admitPacket(value: Uint8Array) {
      live(); const capturedLife = life, parsed = await parsePacket(value); live(); if (life !== capturedLife) fail('stale');
      const handle = token<HistoricalPacket>(); historical.set(handle, {...parsed, life}); return handle;
    },
    inspectPacket(handle: HistoricalPacket) { live(); const found = historical.get(handle); if (!found || found.life !== life) fail('packet-handle');
      return own({currentResult: 'unknown-not-requalified' as const, packetSha256: found.sha256, declaredHistorical: found.packet}); },
    async reusePacketModel(handle: HistoricalPacket) { live(); const found = historical.get(handle); if (!found || found.life !== life) fail('packet-handle'); return this.admitModel(unbase64(found.packet.model.nativeBase64)); },
    requalify(handle: HistoricalPacket) { live(); const found = historical.get(handle); if (!found || found.life !== life) fail('packet-handle'); return calculate(found.packet.mapping.raw, handle); },
    suspend() { live(); life++; revision++; giftEpoch++; modelEpoch++; clearSource(); modelAbort.abort(); modelAbort = new AbortController(); file = null; gift = null; model = null; bridge.invalidate(); },
    dispose() { if (!disposed) { this.suspend(); disposed = true; bridge.dispose(); } },
  });
}
export type GiftEstimateDesk = ReturnType<typeof desk>;
export function createGiftEstimateDesk(): GiftEstimateDesk { return desk(createPureSessionBridge()); }
/** Test seam selects only the worker transport; all admission, source and arithmetic code is unchanged. */
export function createGiftEstimateDeskForTesting(platform: ModelWorkerPlatform): GiftEstimateDesk { return desk(createPureSessionBridgeForTesting(platform)); }
