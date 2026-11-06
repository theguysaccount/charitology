import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import { createModelWorkerClientForTesting, ModelWorkerError } from './worker-client.mjs';
import { createLegacyCalculatorForTesting } from './legacy-calculator.mjs';
import { ROWS } from './worker-protocol.mjs';
import { inputHash, hashArray } from './interpretations/v1/encoding.mjs';

const compiled = async path => {
  const output = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64'));
};
const [old, files, format] = await Promise.all([compiled('../client/models.ts'), compiled('../client/files.ts'), compiled('../client/format.ts')]);
const raw = (seed = '42') => ({ name: ' Fictional ordinary model ', unit: ' visits ', values: { cost: ['100', '200', '500'], people: ['10', '20', '40'], works: ['20', '60', '90'], effect: ['0.1', '1', '2'], years: ['0.5', '1', '3'], anyway: ['0', '10', '50'] }, discount: '3', seed });
const model = value => ({ ...Object.fromEntries(ROWS.map(row => [row, value.values[row].map(s => Number(s.replace(/[^0-9.\-]/g, '')) / (row === 'works' || row === 'anyway' ? 100 : 1))])), discount: Number(value.discount) / 100 });
const decimal = value => {
  const text = String(value); if (!text.includes('e')) return text;
  const [coefficient, exponent] = text.split('e'), digits = coefficient.replace('.', '');
  const position = (coefficient.indexOf('.') < 0 ? coefficient.length : coefficient.indexOf('.')) + Number(exponent);
  return position <= 0 ? '0.' + '0'.repeat(-position) + digits : position >= digits.length ? digits + '0'.repeat(position - digits.length) : digits.slice(0, position) + '.' + digits.slice(position);
};
const context = (epoch = 1) => ({ epoch, formGeneration: 0, isCurrent: () => true, signal: new AbortController().signal });
const waitFor = async predicate => {
  const until = performance.now() + 10000;
  while (!predicate()) { if (performance.now() >= until) throw new Error('Actual worker condition deadline exceeded.'); await new Promise(resolve => setTimeout(resolve, 1)); }
};

function harness({ hold = false, mutate = null, manualClock = false } = {}) {
  const workers = [], timers = new Map(); let timerId = 0;
  class BrowserWorker {
    constructor() {
      this.handlers = new Map(); this.retained = new Map(); this.pending = []; this.terminated = 0;
      const entry = new URL('./model-worker.mjs', import.meta.url).href;
      // Test platform bridge only. It imports the actual fixed product worker.
      const bootstrap = `import{parentPort}from'node:worker_threads';globalThis.self={addEventListener:(type,fn)=>{if(type==='message')parentPort.on('message',data=>fn({data}));},postMessage:(data,transfer)=>parentPort.postMessage(data,transfer),close:()=>parentPort.close()};await import(${JSON.stringify(entry)});`;
      this.native = new ThreadWorker(new URL('data:text/javascript,' + encodeURIComponent(bootstrap)), { type: 'module' });
      this.native.on('message', data => {
        if (mutate) data = mutate(data);
        const event = { data }; this.pending.push(event);
        if (!hold) this.deliver();
      });
      this.native.on('error', error => this.emit('error', { error }));
      workers.push(this);
    }
    addEventListener(type, fn) { this.handlers.set(type, fn); this.retained.set(type, fn); }
    removeEventListener(type, fn) { if (this.handlers.get(type) === fn) this.handlers.delete(type); }
    postMessage(value) { this.request = structuredClone(value); this.native.postMessage(value); }
    emit(type, event) { this.handlers.get(type)?.(event); }
    deliver() { const event = this.pending.shift(); if (event) this.emit('message', event); }
    terminate() { this.terminated++; void this.native.terminate(); }
  }
  const adapter = { createWorker: () => new BrowserWorker(),
    setTimeout: (fn, ms) => { assert.equal(ms, 30000); if (manualClock) { timers.set(++timerId, fn); return timerId; } return setTimeout(fn, ms); },
    clearTimeout: id => { if (manualClock) timers.delete(id); else clearTimeout(id); } };
  return { adapter, workers, timers, cleanup() { for (const worker of workers) if (!worker.terminated) worker.terminate(); } };
}
async function owned(h, action, legacy = false) {
  const client = legacy ? createLegacyCalculatorForTesting(h.adapter) : createModelWorkerClientForTesting(h.adapter);
  try { return await action(client); } finally { client.dispose(); h.cleanup(); }
}

const component = await readFile(new URL('../../components/tools/cost-effectiveness-model-kit.astro', import.meta.url), 'utf8');
const labels = component.match(/const LABELS: Record<RangedKey, string> = \{[\s\S]*?\n  \};/)[0];
const csv = component.match(/\$\('#ce-csv'\)\.addEventListener\('click', \(\) => \{[\s\S]*?\n  \}\);/)[0];
const csvCode = (await transform(labels + '\nconst PERCENT = new Set(["works","anyway"]);\n' + csv, { loader: 'ts', format: 'esm' })).code;
function actualCSV(last) {
  let saved;
  new Function('last', 'RANGED', 'toCsv', 'slugify', 'download', '$', csvCode)(last, ROWS, files.toCsv, format.slugify,
    (filename, text, type) => { saved = { filename, text, type }; }, selector => ({ addEventListener: (event, fn) => { assert.equal(selector, '#ce-csv'); assert.equal(event, 'click'); fn(); } }));
  return saved;
}

test('actual fixed worker yields exact all5000 old arrays, summaries, sensitivity and original CSV for three seeds', async () => {
  await owned(harness(), async calculator => {
    for (const seed of ['1', '42', '4294967295']) {
      const literal = raw(seed), m = model(literal), run = old.runModel(m, 5000, Number(seed)), sens = old.sensitivity(m);
      const result = await calculator.calculate(literal, context(Number(seed)));
      assert.equal(result.kind, 'success');
      assert.deepEqual(result.run, run); assert.deepEqual(result.sensitivity, sens); assert.deepEqual(result.model, m);
      assert.equal(result.recorded.inputHash, await inputHash(result.enginePin, result.input));
      assert.equal(result.recorded.costsSha256, await hashArray('costs', result.run.costs));
      assert.deepEqual(actualCSV({ raw: result.raw, model: result.model, run: result.run, sens: result.sensitivity, unit: result.unit }),
        actualCSV({ raw: literal, model: m, run, sens, unit: literal.unit.trim() || 'outcome' }));
    }
  }, true);
});
test('actual worker preserves seed Number spellings, amount stripping, empty labels and pre-await raw capture', async () => {
  await owned(harness(), async calculator => {
    for (const [seed, expected] of [['+42', 42], ['42.0', 42], ['1e3', 1000], ['0x2a', 42]]) {
      const literal = raw(seed); literal.name = ''; literal.unit = ''; literal.values.cost.fill('1e3');
      const pending = calculator.calculate(literal, context(expected)); literal.values.cost[0] = '999';
      const result = await pending; assert.equal(result.kind, 'success');
      assert.equal(result.run.seed, expected); assert.deepEqual(result.model.cost, [13, 13, 13]);
      assert.equal(result.raw.name, ''); assert.equal(result.unit, 'outcome'); assert.equal(result.raw.values.cost[0], '1e3');
    }
    const literal = raw(); literal.name = '\ud800'; literal.unit = '\u0000';
    const result = await calculator.calculate(literal, context(2000));
    assert.equal(result.kind, 'success'); assert.equal(result.raw.name, '\ud800'); assert.equal(result.unit, '\u0000');
  }, true);
});
test('normalized worker requests retain exact pre-await input and store-generation bindings', async () => {
  const h = harness({ hold: true });
  await owned(h, async client => {
    const numeric = { values: Object.fromEntries(ROWS.map(row => [row, model(raw())[row]])), discount: 0.03, seed: 42, draws: 5000 };
    const job = { ...context(), storeGeneration: 1 };
    const first = client.run({ kind: 'normalized-run', input: numeric }, job);
    numeric.values.cost[0] = 1;
    await waitFor(() => h.workers[0]?.pending.length);
    assert.equal(h.workers[0].request.request.input.values.cost[0], 100);
    job.storeGeneration++;
    h.workers[0].deliver(); assert.deepEqual(await first, { kind: 'cancelled' });
    const result = client.run({ kind: 'normalized-run', input: { ...numeric, values: { ...numeric.values, cost: [100, 200, 500] } } }, { ...context(2), storeGeneration: 2 });
    await waitFor(() => h.workers[1]?.pending.length); h.workers[1].deliver();
    assert.equal((await result).kind, 'success');
  });
});
test('held native SHA completion keeps one physical lane and only the latest queued replacement, including stale error', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), crypto = globalThis.crypto;
  let release, entered = false, calls = 0, inFlight = 0, maxInFlight = 0;
  const hold = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async (...args) => {
    calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const bytes = await crypto.subtle.digest(...args);
      if (calls === 1) { entered = true; await hold; throw new Error('Private stale platform failure must not escape'); }
      return bytes;
    } finally { inFlight--; }
  } } } });
  const h = harness();
  try {
    await owned(h, async client => {
      const a = client.run({ kind: 'legacy-run', raw: raw() }, context());
      await waitFor(() => entered);
      const b = client.run({ kind: 'legacy-run', raw: raw('1') }, context(2));
      await assert.rejects(client.run({ kind: 'legacy-run', raw: {} }, context(3)), e => e.code === 'protocol');
      assert.deepEqual(await a, { kind: 'cancelled' }); assert.deepEqual(await b, { kind: 'cancelled' });
      const d = client.run({ kind: 'legacy-run', raw: raw('42') }, context(4));
      assert.equal(calls, 1); assert.equal(h.workers.length, 0);
      release();
      assert.equal((await d).kind, 'success'); assert.equal(h.workers.length, 1); assert.equal(maxInFlight, 1);
    });
  } finally { release(); Object.defineProperty(globalThis, 'crypto', original); }
});
test('unavailable platform worker rejects only the fixed bounded error, never a private exception', async () => {
  const client = createModelWorkerClientForTesting({ createWorker() { throw new Error('Private platform exception'); }, setTimeout, clearTimeout });
  try { await assert.rejects(client.run({ kind: 'legacy-run', raw: raw() }, context()), error => error instanceof ModelWorkerError && error.code === 'unavailable' && !error.message.includes('Private')); }
  finally { client.dispose(); }
});
test('actual guarded worker accepts genuine zero draws/no-outcome and unbounded sensitivity, not numeric failure', async () => {
  await owned(harness(), async calculator => {
    const literal = raw(String((-3 * 0x6d2b79f5) >>> 0));
    literal.values = { cost: ['100', '100', '100'], people: ['10', '10', '10'], works: ['0', '100', '100'], effect: ['1', '1', '1'], years: ['1', '1', '1'], anyway: ['0', '0', '0'] }; literal.discount = '0';
    const result = await calculator.calculate(literal, context());
    assert.equal(result.kind, 'success'); assert.equal(result.run.none, 1); assert.equal(result.run.costs[4999], Infinity); assert.equal(result.run.outcomes[0], 0);
    assert.equal(result.sensitivity.rows.find(row => row.key === 'works').swing, Infinity);
    assert.deepEqual(result.run, old.runModel(model(literal), 5000, Number(literal.seed)));
  }, true);
});
test('both triangular endpoint modes retain full old worker arrays and CSV compatibility', async () => {
  await owned(harness(), async calculator => {
    const literal = raw(); literal.values = { cost: ['100', '100', '500'], people: ['10', '20', '20'], works: ['20', '20', '90'], effect: ['1', '1', '2'], years: ['1', '3', '3'], anyway: ['0', '0', '50'] };
    const m = model(literal), oldRun = old.runModel(m, 5000, 42), oldSensitivity = old.sensitivity(m);
    const result = await calculator.calculate(literal, context());
    assert.equal(result.kind, 'success'); assert.deepEqual(result.run, oldRun); assert.deepEqual(result.sensitivity, oldSensitivity);
    assert.deepEqual(actualCSV({ raw: result.raw, model: result.model, run: result.run, sens: result.sensitivity, unit: result.unit }), actualCSV({ raw: literal, model: m, run: oldRun, sens: oldSensitivity, unit: 'visits' }));
  }, true);
});
test('actual subnormal worker calculation retains successful math, scientific labels, chart-only fallback and nonzero CSV', async () => {
  await owned(harness(), async calculator => {
    const literal = raw(); literal.values = { cost: Array(3).fill('0.' + '0'.repeat(321) + '2'), people: ['1', '5', '10'], works: ['100', '100', '100'], effect: ['1', '1', '1'], years: ['1', '1', '1'], anyway: ['0', '0', '0'] }; literal.discount = '0';
    const result = await calculator.calculate(literal, context());
    assert.equal(result.kind, 'success'); assert.equal(result.run.cost.median, 4e-323); assert.equal(result.run.none, 0);
    assert.match(calculator.formatMoney(result.run.cost.median), /e-323$/);
    assert.equal(calculator.histogram(result.run).kind, 'unavailable');
    assert.match(actualCSV({ raw: result.raw, model: result.model, run: result.run, sens: result.sensitivity, unit: result.unit }).text, /4e-323/);
  }, true);
});
test('actual worker exposes closed admission/numerical refusals for old known bugs without a partial successful result', async () => {
  await owned(harness(), async calculator => {
    const tiny = raw(); tiny.discount = '0.' + '0'.repeat(14) + '1';
    const refused = await calculator.calculate(tiny, context());
    assert.equal(refused.kind, 'refused'); assert.equal(refused.issue.path, 'discount.v'); assert.ok(!Object.hasOwn(refused, 'run'));
    const negative = raw(); negative.values.effect[0] = '-1';
    const invalid = await calculator.calculate(negative, context(2)); assert.equal(invalid.kind, 'invalid'); assert.ok(invalid.errors.effect);
    const fixed = changes => {
      const base = { cost: 100, people: 10, works: 100, effect: 1, years: 1, anyway: 0, ...changes };
      return { ...raw(), values: Object.fromEntries(ROWS.map(row => [row, (Array.isArray(base[row]) ? base[row] : [base[row], base[row], base[row]]).map(decimal)])), discount: '0' };
    };
    for (const [literal, code, path] of [
      [fixed({ people: 1e308, effect: 1e308 }), 'numeric-overflow', 'outcome.effect'],
      [fixed({ cost: 1e-120, people: 1e120, effect: 1e120 }), 'numeric-underflow', 'cost.ratio'],
      [fixed({ people: 1, effect: [0, 5e-201, 1e-200] }), 'numeric-underflow', 'sample.effect.right-product'],
      [fixed({ works: 1e-323 }), 'numeric-underflow', 'raw.values.works.low'],
    ]) {
      const result = await calculator.calculate(literal, context(3));
      assert.equal(result.kind, 'refused'); assert.equal(result.issue.code, code); assert.equal(result.issue.path, path); assert.ok(!Object.hasOwn(result, 'run'));
    }
  }, true);
});
test('new invalid entry and A→B late events terminate/detach A without clobbering B', async () => {
  const h = harness({ hold: true });
  await owned(h, async client => {
    const a = client.run({ kind: 'legacy-run', raw: raw() }, context());
    await waitFor(() => h.workers[0]?.pending.length);
    const oldWorker = h.workers[0], lateMessage = oldWorker.retained.get('message'), lateError = oldWorker.retained.get('error'), oldResult = oldWorker.pending[0];
    await assert.rejects(client.run({ kind: 'legacy-run', raw: {} }, context(2)), e => e instanceof ModelWorkerError && e.code === 'protocol');
    assert.deepEqual(await a, { kind: 'cancelled' }); assert.equal(oldWorker.terminated, 1); assert.equal(oldWorker.handlers.size, 0);
    const b = client.run({ kind: 'legacy-run', raw: raw('1') }, context(3));
    await waitFor(() => h.workers[1]?.pending.length);
    lateError({}); lateMessage(oldResult);
    h.workers[1].deliver(); assert.equal((await b).kind, 'success');
  });
});
test('abort, disposal, callback failure and owned deadline revoke late worker response/error authority', async () => {
  for (const mode of ['abort', 'dispose', 'callback', 'deadline']) {
    const h = harness({ hold: true, manualClock: true });
    await owned(h, async client => {
      const controller = new AbortController(); let current = true;
      const job = { ...context(), signal: controller.signal, isCurrent: () => { if (mode === 'callback' && !current) throw new Error('private callback detail'); return current; } };
      const pending = client.run({ kind: 'legacy-run', raw: raw() }, job);
      const observed = pending.then(value => ({ value }), error => ({ error }));
      await waitFor(() => h.workers[0]?.pending.length);
      const worker = h.workers[0], late = worker.retained.get('message'), error = worker.retained.get('error'), result = worker.pending[0];
      if (mode === 'abort') controller.abort();
      if (mode === 'dispose') client.dispose();
      if (mode === 'callback') { current = false; worker.deliver(); }
      if (mode === 'deadline') [...h.timers.values()][0]();
      const outcome = await observed;
      if (mode === 'deadline') { assert.ok(outcome.error instanceof ModelWorkerError); assert.equal(outcome.error.code, 'timeout'); }
      else assert.deepEqual(outcome.value, { kind: 'cancelled' });
      assert.equal(worker.terminated, 1); assert.equal(worker.handlers.size, 0); assert.equal(h.timers.size, 0);
      late(result); error({});
    });
  }
});
test('actual computed worker result cannot pass altered request, arrays, summaries, pins or binding', async () => {
  const mutations = [frame => { frame.requestSha256 = '0'.repeat(64); }, frame => { frame.outcome.costs[0] = 0; },
    frame => { frame.outcome.recorded.cost.median.value *= 2; }, frame => { frame.enginePin.definitionHash = '0'.repeat(64); },
    frame => { frame.binding.formGeneration++; }, frame => { frame.outcome.recorded.outcomesSha256 = '0'.repeat(64); }];
  for (const mutate of mutations) await owned(harness({ mutate: frame => { mutate(frame); return frame; } }), async client => {
    await assert.rejects(client.run({ kind: 'legacy-run', raw: raw() }, context()), e => e instanceof ModelWorkerError && e.code === 'protocol');
  });
});
