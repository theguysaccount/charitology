#!/usr/bin/env node
/** Initial v1 registry creation, or read-only exact regeneration check. Never replaces an existing v1. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { normalizeRaw, validateInput, evaluateInput, NumericalError } from '../src/lib/model-bundles/interpretations/v1/arithmetic.mjs';
import { hashArray } from '../src/lib/model-bundles/interpretations/v1/encoding.mjs';
import { canonicalJson, cloneJson, hashValue, sha256Bytes, prettyBytes, LIMITS } from '../src/lib/model-bundles/codec.mjs';
const root = new URL('../', import.meta.url);
const sourcePaths = ['src/lib/model-bundles/interpretations/v1/arithmetic.mjs',
  'src/lib/model-bundles/interpretations/v1/encoding.mjs', 'src/lib/model-bundles/interpretations/v1/random.mjs'];
const dataPath = new URL('src/lib/model-bundles/registry-v1.generated.mjs', root);
const goldenPath = new URL('src/lib/model-bundles/fixtures/golden-v1.json', root);
const args = process.argv.slice(2);
if (args.length > 1 || args.length === 1 && !['--create', '--check'].includes(args[0])) {
  process.stderr.write('Use --check (default), or --create only for the first v1 registry.\n'); process.exit(2);
}
const create = args[0] === '--create';
const ordinary = { cost: [100, 200, 500], people: [10, 20, 40], works: [0.2, 0.6, 0.9],
  effect: [0.1, 1, 2], years: [0.5, 1, 3], anyway: [0, 0.1, 0.5] };
const rowOrder = ['cost', 'people', 'works', 'effect', 'years', 'anyway'];
const base = { cost: 100, people: 10, works: 1, effect: 1, years: 1, anyway: 0 };
const fixed = changes => Object.fromEntries(rowOrder.map(row => [row, Array(3).fill(changes[row] ?? base[row])]));
const input = (values = fixed({}), discount = 0, seed = 42) => ({ values, discount, seed, draws: 5000 });
function ordinaryRaw(seed) { return { parser: 'strict-decimal-v1', name: 'Illustrative numerical fixture', unit: 'fictional outcome',
  values: { cost: ['100', '200', '500'], people: ['10', '20', '40'], works: ['20', '60', '90'], effect: ['0.1', '1', '2'],
    years: ['0.5', '1', '3'], anyway: ['0', '10', '50'] }, discount: '3', seed: String(seed) }; }
async function runCase(id, value, raw = null) {
  const checked = validateInput(value);
  if (raw !== null && canonicalJson(normalizeRaw(raw)) !== canonicalJson(checked)) throw new Error('Golden raw/input mismatch.');
  const result = evaluateInput(checked);
  const expected = { draws: result.draws, seed: result.seed, none: result.none, cost: result.cost, outcome: result.outcome,
    likely: result.likely, sensitivity: result.sensitivity,
    costsSha256: await hashArray('costs', result.costs), outcomesSha256: await hashArray('outcomes', result.outcomes),
    numericalPolicy: result.numericalPolicy };
  return { kind: 'run', id, input: checked, raw, expected };
}
function refusalCase(id, value, raw = null) {
  try { raw === null ? evaluateInput(value) : evaluateInput(normalizeRaw(raw)); }
  catch (error) {
    if (!(error instanceof NumericalError)) throw error;
    return { kind: 'refusal', id, raw, input: raw === null ? value : null, issue: error.issue };
  }
  throw new Error('A golden refusal fixture unexpectedly succeeded.');
}
async function goldenVectors() {
  const cases = [];
  for (const seed of [1, 42, 4294967295]) {
    const raw = ordinaryRaw(seed); cases.push(await runCase(`ordinary-seed-${seed}`, normalizeRaw(raw), raw));
  }
  cases.push(await runCase('constant-six-draws', input()));
  cases.push(await runCase('cost-low-mode', input({ ...fixed({}), cost: [100, 100, 500] })));
  cases.push(await runCase('cost-high-mode', input({ ...fixed({}), cost: [100, 500, 500] })));
  cases.push(await runCase('fractional-years-undiscounted', input({ ...ordinary, years: [0, 0.5, 2] })));
  cases.push(await runCase('finite-subnormal-costs', input({ ...fixed({ cost: 2e-322, people: 1 }), people: [1, 5, 10] })));
  cases.push(await runCase('finite-subnormal-outcomes', input(fixed({ cost: Number.MIN_VALUE, people: 1, effect: Number.MIN_VALUE }))));
  for (const [row, call] of [['works', 3], ['effect', 4], ['years', 5]]) {
    const seed = (-call * 0x6d2b79f5) >>> 0;
    cases.push(await runCase(`genuine-zero-${row}`, input({ ...fixed({}), [row]: [0, 1, 1] }, 0, seed)));
  }
  cases.push(refusalCase('discount-rounds-to-one', input(fixed({}), 1e-17)));
  cases.push(refusalCase('outcome-product-overflow', input(fixed({ people: 1e308, effect: 1e308 }))));
  cases.push(refusalCase('positive-cost-ratio-collapse', input(fixed({ cost: 1e-120, people: 1e120, effect: 1e120 }))));
  cases.push(refusalCase('triangle-positive-product-collapse', input({ ...fixed({ people: 1 }), effect: [0, 5e-201, 1e-200] })));
  cases.push(refusalCase('discount-positive-power-collapse', input(fixed({ years: 1e308 }), 0.5)));
  const tinyPercent = { ...ordinaryRaw(42), parser: 'legacy-amount-strip-v1', discount: '0.' + '0'.repeat(322) + '1' };
  cases.push(refusalCase('raw-positive-percent-collapse', null, tinyPercent));
  const tinyToken = ordinaryRaw(42); tinyToken.parser = 'legacy-amount-strip-v1'; tinyToken.values.effect = Array(3).fill('0.' + '0'.repeat(400) + '1');
  cases.push(refusalCase('raw-positive-number-collapse', null, tinyToken));
  return cloneJson({ format: 'charitology-model-golden', version: 1, cases }, { maxBytes: LIMITS.golden });
}
async function readSources() {
  const files = [];
  for (const path of sourcePaths) {
    const bytes = new Uint8Array(await readFile(new URL(path, root)));
    const rawUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (Buffer.compare(Buffer.from(bytes), Buffer.from(rawUtf8, 'utf8')) !== 0) throw new Error('Source is not exact UTF-8.');
    for (const [, specifier] of rawUtf8.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      if (!['./arithmetic.mjs', './encoding.mjs', './random.mjs'].includes(specifier)) throw new Error('Engine source dependency left its closed inventory.');
    }
    if (/\b(?:eval|Function|fetch|localStorage)\s*\(|\bimport\s*\(/.test(rawUtf8)) throw new Error('Engine source contains a forbidden runtime capability.');
    files.push({ path, byteLength: bytes.byteLength, sha256: await sha256Bytes(bytes), rawUtf8 });
  }
  return files;
}
try {
  const files = await readSources(), golden = await goldenVectors();
  const after = await readSources();
  if (canonicalJson(files) !== canonicalJson(after)) throw new Error('Source changed during registry generation.');
  const definition = { id: 'charitology-ce-triangular-js-v1', version: 1, language: 'ecmascript-binary64',
    rangedOrder: rowOrder, draws: 5000, prng: 'mulberry32-v1', distribution: 'triangular-inverse-cdf-v1', quantile: 'type7-infinity-v1',
    equation: 'expected-one-outcome-geometric-years-v1', drawConsumption: 'six-in-order-including-constants', sorting: 'separate-ascending-cost-and-outcome',
    sensitivity: 'one-at-a-time-mode-v1', numericalPolicy: 'guarded-finite-intermediates-v1',
    sourceFiles: files.map(({ rawUtf8: _, ...pin }) => pin), goldenVectorsHash: await hashValue('golden', golden) };
  const engine = { definition, definitionHash: await hashValue('engine', definition), files };
  prettyBytes(engine, LIMITS.engine);
  const generated = `// Generated only by scripts/generate-model-engine-registry.mjs --create.\n// Candidate v1 interpretation. Existing bytes are never silently replaced.\nexport const ENGINE = ${JSON.stringify(engine, null, 2)};\nexport const GOLDEN = ${JSON.stringify(golden, null, 2)};\n`;
  const goldenBytes = prettyBytes(golden, LIMITS.golden);
  if (create) {
    // Any existing member refuses creation before the first write.
    for (const target of [dataPath, goldenPath]) {
      try { await readFile(target); throw new Error('An existing v1 registry member may not be overwritten. Use --check.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await mkdir(new URL('src/lib/model-bundles/fixtures/', root), { recursive: true });
    await writeFile(goldenPath, goldenBytes, { flag: 'wx' });
    await writeFile(dataPath, generated, { flag: 'wx' });
  } else {
    if (await readFile(dataPath, 'utf8') !== generated || Buffer.compare(await readFile(goldenPath), goldenBytes) !== 0)
      throw new Error('Existing v1 bytes differ. This interpretation cannot be silently replaced; use a new engine version.');
  }
  process.stdout.write(JSON.stringify({ mode: create ? 'created-candidate' : 'checked', definitionHash: engine.definitionHash,
    goldenVectorsHash: definition.goldenVectorsHash, cases: golden.cases.length,
    files: files.map(({ rawUtf8: _, ...pin }) => pin), goldenBytes: goldenBytes.byteLength,
    engineBytes: prettyBytes(engine, LIMITS.engine).byteLength }) + '\n');
} catch (error) { process.stderr.write(`Model engine registry refused: ${error.message}\n`); process.exitCode = 1; }
