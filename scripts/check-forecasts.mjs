// Exercise the actual pure model, content schema, drafter and API serializer.
// No provider calls, browser automation or public-data mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';
const root = process.cwd();
const bundle = async options => {
  const result = await build({ bundle: true, write: false, platform: 'node', format: 'esm', ...options });
  try { return await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`); }
  catch (error) { error.stack = `${error.name}: ${error.message}`; throw error; }
};
const m = await bundle({ entryPoints: ['src/lib/forecast-model.ts'] });
let groups = 0;
const check = async (label, run) => { try { await run(); groups++; } catch (error) { error.message = `${label}: ${error.message}`; throw error; } };
const now = Date.parse('2020-02-01T00:00:00.000Z');
const at = value => new Date(value);
const forecast = (by, p, date) => ({ by, p, date: at(date) });
const base = () => ({ closes: at('2020-01-04T12:34:56.789Z'), outcome: null, annulled: false, forecasts: [] });
const settled = (outcome = true) => ({ ...base(), outcome, resolvedOn: at('2020-01-04T16:00:00Z'), outcomeKnownOn: at('2020-01-04T13:00:00Z'), resolutionSource: 'https://example.invalid/result', resolutionNote: 'Synthetic test evidence only.' });
const issue = (data, field) => m.forecastValidationIssues(data, now).some(x => x.path[0] === field);

await check('strict cutoff uses the earliest actual instant and excludes equality', () => {
  const data = { ...settled(), outcomeKnownOn: at('2020-01-03T09:00:00.123Z'), forecasts: [forecast('before', 0.5, '2020-01-03T09:00:00.122Z'), forecast('equal', 1, '2020-01-03T09:00:00.123Z'), forecast('after', 1, '2020-01-03T09:00:00.124Z')] };
  assert.equal(m.cutoffText(data), '2020-01-03T09:00:00.123Z');
  assert.deepEqual(m.latestByForecaster({ data }, now).map(f => f.by), ['before']);
  assert.equal(m.forecastValidationIssues(data, now).filter(x => x.path[0] === 'forecasts').length, 2);
});
await check('date-only closing remains midnight UTC rather than an implicit end of day', () => {
  const data = { ...base(), closes: at('2020-01-04'), forecasts: [forecast('early', 0, '2020-01-03T23:59:59.999Z'), forecast('at-midnight', 1, '2020-01-04T00:00:00.000Z')] };
  assert.deepEqual(m.latestByForecaster({ data }, now).map(f => f.by), ['early']);
});
await check('late updates never replace the earlier eligible forecast', () => {
  const data = { ...settled(), forecasts: [forecast('Example', 0.2, '2020-01-01T12:00:00Z'), forecast('example', 0.4, '2020-01-04T12:34:56.788Z'), forecast('EXAMPLE', 1, '2020-01-04T12:34:56.789Z'), forecast('example', 1, '2020-01-05T00:00:00Z')] };
  const summary = m.summarize({ data }, now);
  assert.equal(summary.forecasters, 1);
  assert.equal(summary.scores[0].p, 0.4);
  assert.equal(summary.scores[0].score, 0.36);
});
await check('early public outcome availability closes scoring before the scheduled date', () => {
  const data = { ...settled(), outcomeKnownOn: at('2020-01-02T10:00:00Z'), forecasts: [forecast('one', 0.1, '2020-01-01T00:00:00Z'), forecast('one', 1, '2020-01-02T10:00:00Z')] };
  assert.equal(m.summarize({ data }, now).scores[0].p, 0.1);
});
await check('false outcome scores zero probability correctly and unresolved scores nothing', () => {
  const data = { ...settled(false), forecasts: [forecast('zero', 0, '2020-01-01T00:00:00Z'), forecast('one', 1, '2020-01-01T00:00:00Z')] };
  assert.deepEqual(m.summarize({ data }, now).scores.map(f => f.score), [0, 1]);
  assert.deepEqual(m.summarize({ data: base() }, now).scores, []);
});
await check('annulled questions have a reason/source/date and never affect leaderboard counts', () => {
  const annulled = { ...settled(), outcome: null, annulled: true, forecasts: [forecast('one', 1, '2020-01-01T00:00:00Z')] };
  assert.equal(m.summarize({ data: annulled }, now).annulled, true);
  assert.deepEqual(m.summarize({ data: annulled }, now).scores, []);
  const scored = { ...settled(false), forecasts: [forecast('one', 0.5, '2020-01-01T00:00:00Z')] };
  assert.deepEqual(m.scoreLeaderboard([{ data: annulled }, { data: scored }], now), [{ by: 'one', mean: 0.25, n: 1 }]);
  assert.ok(issue({ ...annulled, outcome: false }, 'outcome'));
  assert.ok(issue({ ...annulled, resolutionNote: undefined }, 'resolutionNote'));
});
await check('missing, invalid or future decision evidence fails closed before scoring', () => {
  for (const changes of [{ resolvedOn: undefined }, { outcomeKnownOn: undefined }, { resolutionSource: undefined }, { resolutionSource: 'http://example.invalid' }, { resolutionSource: 'https://user:secret@example.invalid' }, { resolutionNote: '' }, { resolvedOn: at('2021-01-01') }, { outcomeKnownOn: at('2020-01-05') }]) {
    const data = { ...settled(), ...changes, forecasts: [forecast('one', 1, '2020-01-01T00:00:00Z')] };
    assert.ok(m.forecastValidationIssues(data, now).length);
    assert.deepEqual(m.summarize({ data }, now).scores, []);
  }
});
await check('future timestamps and invalid probabilities/handles are not eligible', () => {
  const data = { ...base(), closes: at('2022-01-01'), forecasts: [forecast('future', 1, '2021-01-01'), forecast('bad-p', NaN, '2020-01-01'), forecast('over', 1.01, '2020-01-01'), forecast('line\nby:', 0.5, '2020-01-01'), forecast('valid', 0, '2020-01-01')] };
  assert.deepEqual(m.latestByForecaster({ data }, now).map(f => f.by), ['valid']);
  assert.throws(() => m.brier(NaN, true));
  assert.throws(() => m.brier(0.5, null));
});
await check('ambiguous duplicate timestamps cannot win by array order or handle case', () => {
  const data = { ...settled(), forecasts: [forecast('one', 0.3, '2020-01-01'), forecast('One', 0.8, '2020-01-02'), forecast('ONE', 0.9, '2020-01-02')] };
  assert.ok(issue(data, 'forecasts'));
  assert.equal(m.summarize({ data }, now).scores[0].p, 0.3);
  data.forecasts.reverse();
  assert.equal(m.summarize({ data }, now).scores[0].p, 0.3);
});
await check('draft builder closes at the exact instant, rejects settled/invalid input and safely quotes text', () => {
  const question = { cutoff: '2020-02-01T00:00:00.001Z', settled: false };
  const input = { by: 'public-handle', p: 0, rationale: 'A "quote"\nnew line: true' };
  const draft = m.forecastDraft(question, input, now);
  assert.match(draft, /p: 0\.00/);
  assert.match(draft, /date: "2020-02-01T00:00:00\.000Z"/);
  assert.equal(draft.split('\n').length, 4);
  assert.equal(JSON.parse(draft.split('rationale: ')[1]), 'A "quote" new line: true');
  assert.match(m.forecastDraft(question, { ...input, p: 1 }, now), /p: 1\.00/);
  for (const q of [{ ...question, settled: true }, { ...question, cutoff: new Date(now).toISOString() }, { ...question, cutoff: 'bad' }]) assert.equal(m.forecastDraft(q, input, now), null);
  for (const changes of [{ by: 'a\n  p: 1' }, { p: -1 }, { rationale: 'x'.repeat(2001) }]) assert.equal(m.forecastDraft(question, { ...input, ...changes }, now), null);
});

const astroStub = {
  name: 'forecast-content-harness', setup(build) {
    build.onResolve({ filter: /^astro(?::content|\/loaders)$/ }, ({ path }) => ({ path, namespace: 'forecast-test' }));
    build.onLoad({ filter: /.*/, namespace: 'forecast-test' }, ({ path: module }) => ({
      contents: module === 'astro/loaders' ? 'export const glob = () => ({}); export const file = () => ({});' : `import { z } from 'zod'; export { z }; export const defineCollection = x => x; export const reference = () => z.any(); export const getCollection = async name => globalThis.__forecastFixtures?.[name] ?? [];`,
      resolveDir: root,
    }));
  },
};
await check('actual Astro content schema rejects missing resolution evidence and late updates', async () => {
  const { collections } = await bundle({ entryPoints: ['src/content.config.ts'], plugins: [astroStub] });
  const schema = collections.forecasts.schema;
  const data = { title: 'Synthetic', question: 'Test?', resolution: 'A documented test rule', ...settled(), forecasts: [forecast('one', 0.5, '2020-01-01')] };
  assert.equal(schema.safeParse(data).success, true);
  for (const change of [{ resolvedOn: undefined }, { outcomeKnownOn: undefined }, { resolutionSource: undefined }, { resolutionNote: undefined }, { forecasts: [forecast('one', 0.5, '2020-01-05')] }, { outcome: true, annulled: true }]) assert.equal(schema.safeParse({ ...data, ...change }).success, false);
  assert.equal(schema.safeParse({ ...data, outcome: null, annulled: true }).success, true);
});
await check('actual API preserves forecast milliseconds but leaves other dataset dates unchanged', async () => {
  const stamp = '2020-01-02T03:04:05.678Z';
  globalThis.__forecastFixtures = { forecasts: [{ id: 'synthetic', data: { ...settled(), closes: at(stamp), forecasts: [forecast('one', 0.5, stamp)] }, body: '' }], conditions: [{ id: 'synthetic', data: { date: at(stamp) }, body: '' }] };
  try {
    const api = await bundle({ entryPoints: ['src/lib/api.ts'], plugins: [astroStub] });
    assert.equal((await api.buildEndpoint('forecasts')).data[0].closes, stamp);
    assert.equal((await api.buildEndpoint('forecasts')).data[0].forecasts[0].date, stamp);
    assert.equal((await api.buildEndpoint('conditions')).data[0].date, '2020-01-02');
  } finally { delete globalThis.__forecastFixtures; }
});
await check('forecast model and actual drafter script pass strict TypeScript', () => {
  const file = path.resolve('src/components/ForecastDrafter.astro'), source = fs.readFileSync(file, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const virtual = `${file}.forecast-test.ts`;
  const read = ts.readConfigFile('tsconfig.json', ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  const options = { ...parsed.options, lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], noEmit: true };
  const host = ts.createCompilerHost(options), get = host.getSourceFile.bind(host), exists = host.fileExists.bind(host), readFile = host.readFile.bind(host);
  host.getSourceFile = (name, language, onError, create) => name === virtual ? ts.createSourceFile(name, source, language, true) : get(name, language, onError, create);
  host.fileExists = name => name === virtual || exists(name);
  host.readFile = name => name === virtual ? source : readFile(name);
  const program = ts.createProgram([virtual, path.resolve('src/lib/forecast-model.ts'), path.resolve('node_modules/astro/client.d.ts')], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => `${d.file?.fileName ?? ''}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`).join('\n'));
});
const apiPath = 'dist/api/v1/forecasts.json';
if (fs.existsSync(apiPath)) await check('built public forecast records satisfy the same integrity rules', () => {
  for (const data of JSON.parse(fs.readFileSync(apiPath, 'utf8')).data) assert.deepEqual(m.forecastValidationIssues(data), [], data.id);
});
console.log(`✓ Forecast integrity: ${groups} groups passed (actual model, content schema, drafter types and API serialization).`);
