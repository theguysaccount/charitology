import { LIMITS, cloneJson, object, array, text, oneOf, integer, hash, id, equal, fail, hashValue, parseJsonBytes, canonicalJson } from './codec.mjs';
export const ROWS = Object.freeze(['cost', 'people', 'works', 'effect', 'years', 'anyway']);
export const PARTS = Object.freeze(['low', 'likely', 'high']);
export const RUN_FIELDS = Object.freeze(['inputHash', 'draws', 'seed', 'none', 'cost', 'outcome', 'likely', 'sensitivity', 'costsSha256', 'outcomesSha256', 'numericalPolicy']);
export const LIMITATIONS = Object.freeze([
  'Inputs are user-entered assumptions unless their sources have been independently checked.',
  'The six triangular inputs are sampled independently; correlation is not modeled.',
  'Chance scales expected outcomes and is not a simulation of program success or failure.',
  'One defined outcome is counted; unlike outcomes are not made comparable.',
  'Harms, spillovers and outcomes outside this model are not calculated.',
  'Discounting is an authored choice; fractional years use geometric continuation.',
  'Five thousand draws are a finite simulation of the entered ranges.',
  'Calculation and numerical reproduction are not observation or causal impact.',
  'Exact reproduction depends on the pinned engine and this JavaScript runtime.',
  'Source descriptions, checksums and local timestamps do not establish independent review.',
  'This bundle is not a charity rating, ranking or automatic giving decision.'
]);
const nullableText = (v, max, path) => v === null ? null : text(v, max, path, true);
export function validateInstant(v, path = '$') {
  if (typeof v !== 'string' || !/^(?:19\d\d|20\d\d|21\d\d|2200)-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)) fail('instant', path);
  const time = Date.parse(v); if (!Number.isFinite(time) || new Date(time).toISOString() !== v) fail('instant', path); return v;
}
function realDay(v) {
  if (typeof v !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const year = Number(v.slice(0, 4)), month = Number(v.slice(5, 7)), day = Number(v.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function validateDay(v, path = '$') { if (!realDay(v)) fail('day', path); return v; }
export function validatePartialDate(v, path = '$') {
  object(v, ['precision', 'value'], path); oneOf(v.precision, ['year', 'month', 'day'], path);
  if (v.precision === 'day') validateDay(v.value, path);
  else if (v.precision === 'year' ? typeof v.value !== 'string' || !/^(?!0000)\d{4}$/.test(v.value)
    : typeof v.value !== 'string' || !/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(v.value)) fail('partial-date', path);
  return v;
}
export function validateHead(v, path = '$') { object(v, ['id', 'hash'], path); id(v.id, path); hash(v.hash, path); return v; }
export function validateEnginePin(v, path = '$') {
  object(v, ['id', 'version', 'definitionHash'], path);
  if (v.id !== 'charitology-ce-triangular-js-v1' || v.version !== 1) fail('unsupported-engine', path);
  hash(v.definitionHash, path); return v;
}
export function validateRaw(v, options = {}) {
  const draft = options.draft === true;
  object(v, ['parser', 'name', 'unit', 'values', 'discount', 'seed'], '$.raw');
  oneOf(v.parser, ['legacy-amount-strip-v1', 'strict-decimal-v1'], '$.raw.parser');
  text(v.name, draft ? LIMITS.leaf : 120, '$.raw.name'); text(v.unit, draft ? LIMITS.leaf : 80, '$.raw.unit');
  object(v.values, ROWS, '$.raw.values');
  for (const row of ROWS) for (const [i, entry] of array(v.values[row], 3, `$.raw.values.${row}`, true).entries()) text(entry, LIMITS.leaf, `$.raw.values.${row}[${i}]`);
  text(v.discount, LIMITS.leaf, '$.raw.discount'); text(v.seed, LIMITS.leaf, '$.raw.seed');
  return v;
}
export function validateNumericalIssue(value) {
  const v = cloneJson(value);
  object(v, ['code', 'phase', 'path', 'context'], '$.issue');
  oneOf(v.code, ['numeric-underflow', 'numeric-overflow', 'numeric-domain'], '$.issue.code');
  oneOf(v.phase, ['normalize', 'sample', 'discount', 'outcome', 'cost', 'quantile', 'sensitivity'], '$.issue.phase');
  text(v.path, 128, '$.issue.path', true);
  const paths = {
    normalize: ['raw.discount', ...ROWS.flatMap(row => PARTS.map(part => `raw.values.${row}.${part}`))],
    sample: ROWS.flatMap(row => ['u', 'span', 'mode-low', 'high-mode', 'split', 'left-scale', 'left-product', 'right-weight', 'right-scale', 'right-product', 'root', 'result'].map(part => `sample.${row}.${part}`)),
    discount: ['base', 'v', 'power', 'numerator', 'denominator', 'duration'].map(part => `discount.${part}`),
    outcome: ['people-works', 'effect', 'duration', 'counterfactual', 'result'].map(part => `outcome.${part}`),
    cost: ['cost.ratio'], quantile: ['costs', 'outcomes'].flatMap(series => ['difference', 'fractional-product', 'result'].map(part => `quantile.${series}.${part}`)),
    sensitivity: ROWS.map(row => `sensitivity.${row}.swing`)
  };
  if (!paths[v.phase].includes(v.path)) fail('issue-path', '$.issue');
  const c = v.context;
  if (!c || typeof c !== 'object') fail('issue-context');
  if (c.kind === 'normalization') {
    object(c, ['kind']); if (v.phase !== 'normalize') fail('issue-context');
  } else if (c.kind === 'draw') {
    object(c, ['kind', 'index']); integer(c.index, 0, 4999);
    if (!['sample', 'discount', 'outcome', 'cost'].includes(v.phase)) fail('issue-context');
  } else if (c.kind === 'likely') {
    object(c, ['kind']); if (!['discount', 'outcome', 'cost'].includes(v.phase)) fail('issue-context');
  } else if (c.kind === 'sensitivity') {
    object(c, ['kind', 'row', 'endpoint']); oneOf(c.row, ROWS); oneOf(c.endpoint, ['low', 'high', 'swing']);
    if (c.endpoint === 'swing' ? v.phase !== 'sensitivity' || v.path !== `sensitivity.${c.row}.swing`
      : !['discount', 'outcome', 'cost'].includes(v.phase)) fail('issue-context');
  } else if (c.kind === 'quantile') {
    object(c, ['kind', 'series', 'q']); oneOf(c.series, ['costs', 'outcomes']); oneOf(c.q, [0.05, 0.5, 0.95]);
    if (v.phase !== 'quantile' || !v.path.startsWith(`quantile.${c.series}.`)) fail('issue-context');
  } else fail('issue-context');
  return v;
}
function finite(v, positive = false, path = '$') {
  object(v, ['kind', 'value'], path);
  if (v.kind !== 'finite' || typeof v.value !== 'number' || !Number.isFinite(v.value) || Object.is(v.value, -0) || (positive ? v.value <= 0 : v.value < 0)) fail('finite-value', path);
  return v.value;
}
function cost(v, path = '$') {
  if (v?.kind === 'no-outcome') { object(v, ['kind'], path); return Infinity; }
  return finite(v, true, path);
}
export function validateRecordedRun(value, input = null) {
  const v = cloneJson(value);
  object(v, RUN_FIELDS, '$.run'); hash(v.inputHash); integer(v.draws, 5000, 5000); integer(v.seed, 1, 4294967295); integer(v.none, 0, 5000);
  if (input && (v.draws !== input.draws || v.seed !== input.seed)) fail('run-input');
  hash(v.costsSha256); hash(v.outcomesSha256);
  if (v.numericalPolicy !== 'guarded-finite-intermediates-v1') fail('numerical-policy');
  object(v.cost, ['median', 'p5', 'p95']); object(v.outcome, ['median', 'p5', 'p95']);
  const cs = {}, os = {};
  for (const [key, q] of [['p5', 0.05], ['median', 0.5], ['p95', 0.95]]) {
    cs[key] = cost(v.cost[key], `$.run.cost.${key}`); os[key] = finite(v.outcome[key], false, `$.run.outcome.${key}`);
    const position = 4999 * q;
    if ((cs[key] === Infinity) !== (Math.ceil(position) >= 5000 - v.none)) fail('no-outcome-position');
    if (Math.ceil(position) < v.none && os[key] !== 0 || Math.floor(position) >= v.none && os[key] <= 0) fail('outcome-zero-position');
  }
  if (!(cs.p5 <= cs.median && cs.median <= cs.p95 && os.p5 <= os.median && os.median <= os.p95)) fail('summary-order');
  object(v.likely, ['cost', 'outcome']); const likelyCost = finite(v.likely.cost, true); finite(v.likely.outcome, true);
  object(v.sensitivity, ['base', 'rows']); if (finite(v.sensitivity.base, true) !== likelyCost) fail('sensitivity-base');
  const seen = new Set(); let previous = Infinity, previousIndex = -1;
  for (const row of array(v.sensitivity.rows, 6, '$.run.sensitivity.rows', true)) {
    object(row, ['key', 'atLow', 'atHigh', 'lo', 'hi', 'swing']); oneOf(row.key, ROWS);
    if (seen.has(row.key)) fail('sensitivity-key'); seen.add(row.key);
    const a = cost(row.atLow), b = cost(row.atHigh), lo = cost(row.lo), hi = cost(row.hi);
    if (lo !== Math.min(a, b) || hi !== Math.max(a, b)) fail('sensitivity-endpoints');
    let swing;
    if ((a === Infinity) !== (b === Infinity)) {
      object(row.swing, ['kind']); if (row.swing.kind !== 'unbounded') fail('unbounded-position'); swing = Infinity;
    } else { swing = finite(row.swing); if (swing !== (a === Infinity ? 0 : hi - lo)) fail('sensitivity-swing'); }
    const index = ROWS.indexOf(row.key);
    if (swing > previous || swing === previous && index <= previousIndex) fail('sensitivity-order');
    previous = swing; previousIndex = index;
  }
  return v;
}
export function validateFingerprint(v) {
  object(v, ['inputHash', 'runHash', 'costsSha256', 'outcomesSha256']);
  for (const key of Object.keys(v)) hash(v[key]); return v;
}
export function validateCopyObservation(value) {
  const v = cloneJson(value);
  if (v?.kind === 'arithmetic-refusal') {
    object(v, ['kind', 'declared', 'recalculated', 'differences', 'issue']); validateFingerprint(v.declared);
    if (v.recalculated !== null) fail('refusal-fingerprint'); array(v.differences, 0, '$.differences', true); validateNumericalIssue(v.issue);
  } else {
    object(v, ['kind', 'declared', 'recalculated', 'differences']); oneOf(v.kind, ['matched', 'mismatched']);
    validateFingerprint(v.declared); validateFingerprint(v.recalculated); array(v.differences, RUN_FIELDS.length);
    let last = -1;
    for (const field of v.differences) { const i = RUN_FIELDS.indexOf(field); if (i <= last) fail('difference-order'); last = i; }
    if (v.kind === 'matched' ? v.differences.length !== 0 || !equal(v.declared, v.recalculated) : v.differences.length === 0 || equal(v.declared, v.recalculated)) fail('observation-kind');
    for (const field of ['inputHash', 'costsSha256', 'outcomesSha256']) {
      if ((v.declared[field] !== v.recalculated[field]) !== v.differences.includes(field)) fail('observation-differences');
    }
    if (v.kind === 'mismatched' && v.declared.runHash === v.recalculated.runHash) fail('observation-run-hash');
  }
  return v;
}
export function validateOrigin(value) {
  if (value === null) return null;
  const v = cloneJson(value);
  if (v.kind === 'selected-bundle-copy') {
    object(v, ['kind', 'sourceVersionId', 'sourceVersionHash', 'sourceContentHash', 'chosenFileSha256', 'observation']);
    hash(v.chosenFileSha256); validateCopyObservation(v.observation);
  } else {
    object(v, ['kind', 'sourceModelId', 'sourceVersionId', 'sourceVersionHash', 'sourceContentHash']);
    if (v.kind !== 'local-version-copy') fail('origin-kind'); id(v.sourceModelId);
  }
  id(v.sourceVersionId); hash(v.sourceVersionHash); hash(v.sourceContentHash); return v;
}
function safeUrl(v) {
  text(v, 1200, '$.sources.url', true);
  if (!v.startsWith('https://') || /[\s\u0000-\u001f\u007f]/.test(v)) fail('source-url');
  let url; try { url = new URL(v); } catch { fail('source-url'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.startsWith('[')
    || /^\d+\.\d+\.\d+\.\d+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)) fail('source-url');
}
function validateSource(v) {
  object(v, ['id', 'title', 'publisher', 'url', 'locator', 'published', 'accessedOn', 'access', 'license', 'note', 'checksum']);
  id(v.id); text(v.title, 180, '$.source.title', true); nullableText(v.publisher, 180, '$.source.publisher');
  if (v.url !== null) safeUrl(v.url); nullableText(v.locator, 500, '$.source.locator');
  if (v.published !== null) validatePartialDate(v.published); if (v.accessedOn !== null) validateDay(v.accessedOn);
  oneOf(v.access, ['public', 'restricted', 'not-shared', 'unknown']); nullableText(v.license, 2000, '$.source.license'); text(v.note, 2000);
  if (v.checksum !== null) {
    if (v.checksum.kind === 'declared') object(v.checksum, ['kind', 'sha256']);
    else { object(v.checksum, ['kind', 'sha256', 'byteLength', 'hashedAt']); if (v.checksum.kind !== 'local-bytes') fail('checksum-kind'); integer(v.checksum.byteLength, 0, LIMITS.checksumFile); validateInstant(v.checksum.hashedAt); }
    hash(v.checksum.sha256);
  }
}
export function validateSourceDescription(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.selected }); validateSource(v); return v;
}
export function validatePointBasis(v, sourceIds, used) {
  object(v, ['kind', 'sourceIds', 'rationale']); oneOf(v.kind, ['user-assumption', 'source-informed']);
  text(v.rationale, 8000, '$.basis.rationale', true); array(v.sourceIds, 3);
  const seen = new Set();
  for (const sourceId of v.sourceIds) { id(sourceId); if (seen.has(sourceId) || !sourceIds.has(sourceId)) fail('source-reference'); seen.add(sourceId); used.add(sourceId); }
  if (v.kind === 'source-informed' && v.sourceIds.length === 0) fail('source-informed-empty');
  return v;
}
/** Historical outputs are checked structurally, never recomputed by graph/backup admission. */
export async function validateContent(value) {
  const v = cloneJson(value, { maxBytes: LIMITS.selected });
  object(v, ['enginePin', 'classification', 'title', 'purpose', 'programDescription', 'population', 'period', 'outcome', 'money', 'assumptions', 'sources', 'sourceModel', 'raw', 'input', 'basis', 'run', 'limitations']);
  validateEnginePin(v.enginePin);
  const { knownEnginePin } = await import('./registry.mjs');
  if (!equal(v.enginePin, knownEnginePin())) fail('unsupported-engine');
  oneOf(v.classification, ['illustrative', 'user-authored']); text(v.title, 120, '$.title', true);
  text(v.purpose, 2000, '$.purpose', true); text(v.programDescription, 2000, '$.programDescription', true);
  object(v.population, ['description', 'geography', 'eligibility', 'timeHorizon']);
  for (const key of ['description', 'eligibility', 'timeHorizon']) text(v.population[key], 2000, `$.population.${key}`, true);
  nullableText(v.population.geography, 2000, '$.population.geography');
  object(v.period, ['label', 'from', 'to']); text(v.period.label, 2000, '$.period.label', true);
  if (v.period.from === null || v.period.to === null) { if (v.period.from !== null || v.period.to !== null) fail('partial-period'); }
  else { validatePartialDate(v.period.from); validatePartialDate(v.period.to); if (v.period.from.precision !== v.period.to.precision || v.period.from.value > v.period.to.value) fail('period-order'); }
  object(v.outcome, ['name', 'definition', 'measurement', 'scope']); text(v.outcome.name, 80, '$.outcome.name', true);
  text(v.outcome.definition, 2000, '$.outcome.definition', true); text(v.outcome.measurement, 2000, '$.outcome.measurement', true);
  if (v.outcome.scope !== 'one-outcome') fail('outcome-scope');
  object(v.money, ['currency', 'priceYear', 'basis', 'inclusions', 'exclusions', 'adjustment']);
  if (v.money.currency !== 'USD') fail('currency'); if (v.money.priceYear !== null) integer(v.money.priceYear, 1900, 2200);
  oneOf(v.money.basis, ['nominal', 'constant-price', 'unknown']);
  text(v.money.inclusions, 2000, '$.money.inclusions', true); text(v.money.exclusions, 2000, '$.money.exclusions', true);
  if (v.money.basis === 'constant-price') { if (v.money.priceYear === null) fail('price-year'); text(v.money.adjustment, 2000, '$.money.adjustment', true); }
  else if (v.money.adjustment !== null) fail('adjustment-position');
  const assumptionKeys = ['independence', 'chanceAsScale', 'counterfactual', 'discountRationale', 'harmsAndSpillovers', 'sourceDepthLimit', 'other'];
  object(v.assumptions, assumptionKeys);
  for (const key of assumptionKeys) text(v.assumptions[key], 8000, `$.assumptions.${key}`, key !== 'other');
  array(v.sources, LIMITS.sources); const sourceIds = new Set(), used = new Set();
  for (const source of v.sources) { validateSource(source); if (sourceIds.has(source.id)) fail('duplicate-source'); sourceIds.add(source.id); }
  object(v.basis, [...ROWS, 'discount']);
  for (const row of ROWS) { object(v.basis[row], PARTS); for (const part of PARTS) validatePointBasis(v.basis[row][part], sourceIds, used); }
  validatePointBasis(v.basis.discount, sourceIds, used);
  if (v.sourceModel !== null) {
    object(v.sourceModel, ['sourceId', 'artifactSha256', 'interpretation']); id(v.sourceModel.sourceId); hash(v.sourceModel.artifactSha256);
    text(v.sourceModel.interpretation, 8000, '$.sourceModel.interpretation', true);
    const source = v.sources.find(source => source.id === v.sourceModel.sourceId);
    if (!source || source.checksum?.sha256 !== v.sourceModel.artifactSha256) fail('source-model-checksum'); used.add(source.id);
  }
  for (const source of v.sources) if (!used.has(source.id) && !source.note.trim()) fail('unused-source-note');
  validateRaw(v.raw); if (v.raw.unit.trim() !== v.outcome.name) fail('outcome-unit');
  const { normalizeRaw, validateInput } = await import('./interpretations/v1/arithmetic.mjs');
  validateInput(v.input); const normalized = normalizeRaw(v.raw);
  if (!equal(normalized, v.input)) fail('raw-input-mismatch');
  validateRecordedRun(v.run, v.input);
  const { inputHash } = await import('./interpretations/v1/encoding.mjs');
  if (v.run.inputHash !== await inputHash(v.enginePin, v.input)) fail('input-hash');
  if (!equal(v.limitations, LIMITATIONS)) fail('limitations');
  return v;
}
export async function runFingerprint(run) {
  const value = validateRecordedRun(run);
  return cloneJson({ inputHash: value.inputHash, runHash: await hashValue('run', value), costsSha256: value.costsSha256, outcomesSha256: value.outcomesSha256 });
}
/** Explicit preview/freeze compilation. The retained EditorForm is never rewritten by this operation. */
export async function compileEditorContent(form, calculation) {
  // Snapshot both arguments before the first await; no mutable caller field survives the boundary.
  const frozenForm = cloneJson(form, { maxBytes: LIMITS.form });
  const result = cloneJson(calculation);
  object(result, ['enginePin', 'input', 'run']);
  const { validateEditorForm } = await import('./graph.mjs'); validateEditorForm(frozenForm);
  const t = frozenForm.text, j = frozenForm.json;
  const parse = value => parseJsonBytes(new TextEncoder().encode(value), { maxBytes: LIMITS.form });
  const optionalText = value => value === '' ? null : value;
  const date = value => value === '' ? null : validatePartialDate(parse(value));
  let priceYear = null;
  if (t.moneyPriceYear !== '') {
    if (!/^[0-9]{4}$/.test(t.moneyPriceYear)) fail('price-year');
    priceYear = integer(Number(t.moneyPriceYear), 1900, 2200);
  }
  const basis = Object.fromEntries(ROWS.map(row => [row, parse(j[`${row}Basis`])]));
  basis.discount = parse(j.discountBasis);
  return validateContent({ enginePin: result.enginePin, classification: t.classification,
    title: t.title, purpose: t.purpose, programDescription: t.programDescription,
    population: { description: t.populationDescription, geography: optionalText(t.populationGeography),
      eligibility: t.populationEligibility, timeHorizon: t.populationTimeHorizon },
    period: { label: t.periodLabel, from: date(t.periodFrom), to: date(t.periodTo) },
    outcome: { name: t.outcomeName, definition: t.outcomeDefinition, measurement: t.outcomeMeasurement, scope: 'one-outcome' },
    money: { currency: 'USD', priceYear, basis: t.moneyBasis, inclusions: t.moneyInclusions,
      exclusions: t.moneyExclusions, adjustment: optionalText(t.moneyAdjustment) },
    assumptions: { independence: t.independence, chanceAsScale: t.chanceAsScale,
      counterfactual: t.counterfactual, discountRationale: t.discountRationale,
      harmsAndSpillovers: t.harmsAndSpillovers, sourceDepthLimit: t.sourceDepthLimit, other: t.other },
    sources: parse(j.sources), sourceModel: parse(j.sourceModel), raw: frozenForm.raw,
    input: result.input, basis, run: result.run, limitations: LIMITATIONS });
}
/** A deliberate new editor projection of admitted content; historical raw strings stay literal. */
export async function editorFormFromContent(content, amendmentReason = '') {
  const snapshot = cloneJson(content); text(amendmentReason, LIMITS.leaf);
  const v = await validateContent(snapshot);
  const string = value => canonicalJson(value);
  const optional = value => value === null ? '' : value;
  const date = value => value === null ? '' : string(value);
  const result = { raw: v.raw, text: { classification: v.classification, title: v.title, purpose: v.purpose,
    programDescription: v.programDescription, populationDescription: v.population.description,
    populationGeography: optional(v.population.geography), populationEligibility: v.population.eligibility,
    populationTimeHorizon: v.population.timeHorizon, periodLabel: v.period.label,
    periodFrom: date(v.period.from), periodTo: date(v.period.to), outcomeName: v.outcome.name,
    outcomeDefinition: v.outcome.definition, outcomeMeasurement: v.outcome.measurement,
    moneyPriceYear: v.money.priceYear === null ? '' : String(v.money.priceYear), moneyBasis: v.money.basis,
    moneyInclusions: v.money.inclusions, moneyExclusions: v.money.exclusions, moneyAdjustment: optional(v.money.adjustment),
    ...v.assumptions, amendmentReason },
    json: { sources: string(v.sources), sourceModel: string(v.sourceModel),
      ...Object.fromEntries(ROWS.map(row => [`${row}Basis`, string(v.basis[row])])), discountBasis: string(v.basis.discount) } };
  const { validateEditorForm } = await import('./graph.mjs'); return validateEditorForm(result);
}
