// Actual Astro SSR + component script + fixed numerical worker. Bounded DOM;
// native Chrome layout/downloads remain separate acceptance work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { installToolDom } from '../../../test-fixtures/donor-recovery/tool-dom.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const componentPath = join(root, 'src/components/tools/cost-effectiveness-model-kit.astro');
const source = await readFile(componentPath, 'utf8');
const temporary = await mkdtemp(join(root, 'node_modules/.mb-component-'));
const nativeTimeout = globalThis.setTimeout;
let serial = 0;
const compiled = await transform(source, { filename: componentPath, internalURL: 'astro/compiler-runtime', renderScript: true, resolvePath: async x => x });
assert.equal(compiled.diagnostics.filter(d => d.severity === 1).length, 0);
await build({ stdin: { contents: compiled.code.replace(/^import\s+"[^"]+\?astro&type=style[^"]*";$/gm, ''), loader: 'ts', resolveDir: join(root, 'src/components/tools') },
  outfile: join(temporary, 'ssr.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.SITE': '"https://example.invalid"' } });
const container = await AstroContainer.create(), Component = (await import(pathToFileURL(join(temporary, 'ssr.mjs')))).default;
const html = await container.renderToString(Component);
const inline = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace('void initializeDonorTool().catch', 'export const ready = initializeDonorTool().catch') +
  '\nexport {calculatorCopyProvider} from "../../lib/model-bundles/calculator-copy-provider.mjs";';
const script = await build({ stdin: { contents: inline, loader: 'ts', resolveDir: join(root, 'src/components/tools') }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.SITE': '"https://example.invalid"' } });
const raw = (name = 'Fictional model') => ({ name, unit: 'visits', values: { cost: ['100', '200', '500'], people: ['10', '20', '40'], works: ['20', '60', '90'], effect: ['0.1', '1', '2'], years: ['0.5', '1', '3'], anyway: ['0', '10', '50'] }, discount: '3', seed: '42' });
const saved = name => ({ ...raw(name), id: 'saved-one', savedAt: '2026-10-27T00:00:00.000Z' });
const waitFor = async predicate => { const until = performance.now() + 10000; while (!predicate()) { if (performance.now() > until) throw new Error('Actual component condition deadline exceeded.'); await new Promise(resolve => nativeTimeout(resolve, 1)); } };

async function start(initial = {}, options = {}) {
  const dom = installToolDom(html, initial, options), workers = [];
  let held = false;
  class BrowserWorker {
    constructor(url, workerOptions) {
      assert.match(url.pathname, /model-worker\.mjs$/); assert.equal(workerOptions.type, 'module');
      this.handlers = new Map(); this.retained = new Map(); this.pending = []; this.terminated = 0;
      const entry = new URL('./model-worker.mjs', import.meta.url).href;
      const bootstrap = `import{parentPort}from'node:worker_threads';globalThis.self={addEventListener:(type,fn)=>{if(type==='message')parentPort.on('message',data=>fn({data}));},postMessage:(data,transfer)=>parentPort.postMessage(data,transfer),close:()=>parentPort.close()};await import(${JSON.stringify(entry)});`;
      this.native = new ThreadWorker(new URL('data:text/javascript,' + encodeURIComponent(bootstrap)), { type: 'module' });
      this.native.on('message', data => { this.pending.push({ data }); if (!held) this.deliver(); });
      this.native.on('error', error => this.handlers.get('error')?.({ error })); workers.push(this);
    }
    addEventListener(type, fn) { this.handlers.set(type, fn); this.retained.set(type, fn); }
    removeEventListener(type, fn) { if (this.handlers.get(type) === fn) this.handlers.delete(type); }
    postMessage(frame) { this.request = frame; this.native.postMessage(frame); }
    deliver() { const event = this.pending.shift(); if (event) this.handlers.get('message')?.(event); }
    terminate() { this.terminated++; void this.native.terminate(); }
  }
  globalThis.Worker = BrowserWorker;
  const release = options.holdKey ? await dom.hold(options.holdKey) : null;
  const path = join(temporary, `script-${serial++}.mjs`); await writeFile(path, script.outputFiles[0].text);
  const module = await import(pathToFileURL(path));
  return { ...dom, module, release, workers, hold(value) { held = value; }, async close() { await dom.window.fire('pagehide', { persisted: false }); for (const worker of workers) if (!worker.terminated) worker.terminate(); } };
}
async function mount(initial, options) { const d = await start(initial, options); await d.module.ready; assert.ok(d.$('[data-d1-recovery]')); assert.doesNotMatch(d.root.textContent, /Missing element:|is not a function/); return d; }
async function fill(d, value = raw()) {
  for (const key of ['name', 'unit', 'discount', 'seed']) await d.set('#ce-' + key, value[key]);
  for (const row of Object.keys(value.values)) for (const [i, part] of ['low', 'likely', 'high'].entries()) await d.set(`#ce-${row}-${part}`, value.values[row][i]);
}
async function csv(d) { const before = d.downloads.length; await d.$('#ce-csv').click(); assert.equal(d.downloads.length, before + 1); return d.downloads.at(-1).text(); }

test('actual guarded calculator component acceptance', async t => {
  try {
    await t.test('mount owns no new storage write and provider captures only current literal raw, after initialization', async () => {
      const d = await start({}, { holdKey: 'ce-models' });
      try {
        assert.equal(d.module.calculatorCopyProvider(d.root), null);
        await d.set('#ce-cost-low', ' 1,234.50 '); d.release(); await d.module.ready;
        const provider = d.module.calculatorCopyProvider(d.root), capture = provider.capture();
        assert.equal(capture.raw.values.cost[0], ' 1,234.50 '); assert.equal(provider.isCurrent(capture.formGeneration), true);
        await d.set('#ce-cost-low', '99'); assert.equal(provider.isCurrent(capture.formGeneration), false);
        assert.equal(capture.raw.values.cost[0], ' 1,234.50 ');
        assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { await d.close(); }
      assert.equal(d.module.calculatorCopyProvider(d.root), null);
    });
    await t.test('real async submit commits one coherent result; refused/new raw keeps last-successful CSV exactly', async () => {
      const d = await mount();
      try {
        await fill(d); const event = await d.$('#ce-form').fire('submit'); assert.equal(event.defaultPrevented, true);
        assert.equal(d.$('#ce-out').hidden, false); assert.equal(d.$('#ce-out').classList.contains('ce-stale'), false);
        const chart = d.$('.mb-legacy-chart');
        const navigation = await chart.fire('keydown', { key: 'End' });
        assert.equal(navigation.defaultPrevented, true); assert.match(chart.textContent, /draw/);
        assert.ok(chart.querySelectorAll('rect').length <= 128); assert.ok(chart.querySelectorAll('text').length <= 32);
        assert.match(d.$('#ce-summary').textContent, /Median cost/); const previous = await csv(d);
        await d.set('#ce-discount', '0.' + '0'.repeat(14) + '1'); await d.$('#ce-form').fire('submit');
        assert.match(d.$('#ce-summary').textContent, /numeric-domain, discount.v/); assert.equal(d.$('#ce-out').classList.contains('ce-stale'), true);
        assert.equal(await csv(d), previous); assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { await d.close(); }
    });
    await t.test('saved Load and confirmed Example both await real worker while preserving native library bytes', async () => {
      const initial = [saved('Original saved name')], d = await mount({ 'ce-models': initial });
      try {
        const bytes = d.values.get('charitology.ce-models'); await d.$('#ce-load').click();
        assert.equal(d.get('#ce-name'), 'Original saved name'); assert.match(d.$('#ce-summary').textContent, /Median cost/);
        await d.$('#ce-example').click(); await d.$('#ce-example').click();
        await waitFor(() => !d.$('#ce-form').getAttribute('aria-busy') && /Median cost/.test(d.$('#ce-summary').textContent));
        assert.match(d.get('#ce-name'), /Example: school meals/); assert.equal(d.values.get('charitology.ce-models'), bytes);
      } finally { await d.close(); }
    });
    await t.test('held A→input→B and retained A message/error cannot repaint current fields, result or CSV', async () => {
      const d = await mount();
      try {
        await fill(d); d.hold(true); const a = d.$('#ce-form').fire('submit'); await waitFor(() => d.workers[0]?.pending.length);
        const worker = d.workers[0], late = worker.retained.get('message'), error = worker.retained.get('error'), message = worker.pending[0];
        await d.set('#ce-name', 'Newest field'); await a;
        const b = d.$('#ce-form').fire('submit'); await waitFor(() => d.workers[1]?.pending.length);
        late(message); error({}); d.workers[1].deliver(); await b;
        assert.equal(d.get('#ce-name'), 'Newest field'); assert.match(await csv(d), /Newest field/);
        assert.equal(worker.terminated, 1); assert.equal(worker.handlers.size, 0);
      } finally { await d.close(); }
    });
    await t.test('actual complete tiny-positive run displays science and bounded chart fallback without losing CSV', async () => {
      const d = await mount();
      try {
        const value = raw(); value.values = { cost: Array(3).fill('0.' + '0'.repeat(321) + '2'), people: ['1', '5', '10'], works: ['100', '100', '100'], effect: ['1', '1', '1'], years: ['1', '1', '1'], anyway: ['0', '0', '0'] }; value.discount = '0';
        await fill(d, value); await d.$('#ce-form').fire('submit');
        assert.match(d.$('#ce-kpis').textContent, /e-323/); assert.match(d.$('#ce-hist').textContent, /chart cannot represent/);
        assert.match(await csv(d), /4e-323/); assert.equal(d.$('#ce-out').classList.contains('ce-stale'), false);
        assert.ok(d.$('#ce-hist').querySelectorAll('rect').length <= 128);
      } finally { await d.close(); }
    });
    await t.test('read-only D1 storage still calculates; later worker unavailability retains exact last CSV', async () => {
      const d = await mount({}, { unsupported: true }), originalWorker = globalThis.Worker;
      try {
        await fill(d); await d.$('#ce-form').fire('submit'); const previous = await csv(d);
        await d.set('#ce-name', 'New unavailable run');
        globalThis.Worker = class { constructor() { throw new Error('private unavailable platform detail'); } };
        await d.$('#ce-form').fire('submit');
        assert.match(d.$('#ce-summary').textContent, /worker is unavailable/); assert.doesNotMatch(d.$('#ce-summary').textContent, /private/);
        assert.equal(await csv(d), previous); assert.equal(d.$('#ce-out').classList.contains('ce-stale'), true);
        assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { globalThis.Worker = originalWorker; await d.close(); }
    });
    await t.test('persisted hide revokes pending Run but preserves fields/Last; changed saved bytes get status only', async () => {
      const d = await mount();
      try {
        await fill(d); await d.$('#ce-form').fire('submit'); const previous = await csv(d);
        await d.set('#ce-name', 'Unsubmitted newest'); d.hold(true); const pending = d.$('#ce-form').fire('submit');
        await waitFor(() => d.workers[1]?.pending.length); await d.window.fire('pagehide', { persisted: true }); await pending;
        d.values.set('charitology.ce-models', JSON.stringify([saved('Foreign saved name')]));
        const before = d.operations.length; await d.window.fire('pageshow', { persisted: true });
        assert.equal(d.get('#ce-name'), 'Unsubmitted newest'); assert.equal(await csv(d), previous); assert.equal(d.workers.length, 2);
        assert.ok(d.operations.slice(before).some(op => op[0] === 'get' && op[1] === 'charitology.ce-models'));
        assert.match(d.root.textContent, /saved model library changed/); assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { await d.close(); }
    });
    await t.test('persisted hide/show during held opening preserves early raw/provider admission and checks exact bytes before setup', async () => {
      const d = await start({ 'ce-models': [saved('Initially saved')] }, { holdKey: 'ce-models' });
      try {
        await d.set('#ce-name', 'Typed before opening'); await d.window.fire('pagehide', { persisted: true }); await d.window.fire('pageshow', { persisted: true });
        d.release(); await d.module.ready;
        assert.equal(d.get('#ce-name'), 'Typed before opening'); assert.ok(d.module.calculatorCopyProvider(d.root));
        assert.ok(d.operations.filter(op => op[0] === 'get' && op[1] === 'charitology.ce-models').length >= 2);
        assert.equal(d.workers.length, 0); assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { await d.close(); }
    });
    await t.test('denied resume read is never absence, never hydrates and keeps literal fields/Last/private saved bytes', async () => {
      const original = [saved('Private saved library')], d = await mount({ 'ce-models': original });
      try {
        await fill(d); await d.$('#ce-form').fire('submit'); const previous = await csv(d), native = d.values.get('charitology.ce-models');
        await d.set('#ce-name', 'Unsaved literal'); await d.window.fire('pagehide', { persisted: true });
        d.flags.failRead = true; await d.window.fire('pageshow', { persisted: true });
        assert.match(d.root.textContent, /could not be rechecked/); assert.equal(d.get('#ce-name'), 'Unsaved literal');
        assert.equal(await csv(d), previous); assert.equal(d.values.get('charitology.ce-models'), native);
        assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { d.flags.failRead = false; await d.close(); }
    });
    await t.test('failed native Save retains exact generated intent through BFCache and ordinary Retry', async () => {
      const d = await mount();
      try {
        await fill(d); d.flags.failWrite = true; await d.$('#ce-save').click();
        const attempted = d.operations.find(op => op[0] === 'set' && op[1] === 'charitology.ce-models')[2];
        await d.window.fire('pagehide', { persisted: true }); await d.window.fire('pageshow', { persisted: true });
        d.flags.failWrite = false; await d.$('[data-d1-action="retry"]').click();
        await waitFor(() => d.values.has('charitology.ce-models'));
        assert.equal(d.values.get('charitology.ce-models'), attempted); assert.equal(d.get('#ce-name'), 'Fictional model');
      } finally { await d.close(); }
    });
    await t.test('ordinary disposal revokes provider and held worker, and retained callbacks cannot create a result', async () => {
      const d = await mount(); await fill(d); d.hold(true); const pending = d.$('#ce-form').fire('submit');
      await waitFor(() => d.workers[0]?.pending.length); const worker = d.workers[0], late = worker.retained.get('message'), event = worker.pending[0];
      await d.close(); await pending; late(event); assert.equal(d.module.calculatorCopyProvider(d.root), null); assert.equal(d.$('#ce-out').hidden, true);
    });
    await t.test('ordinary hide during held initialization cannot install a late provider/controller or overwrite early fields', async () => {
      const d = await start({}, { holdKey: 'ce-models' });
      await d.set('#ce-name', 'Early private text'); await d.close(); d.release(); await d.module.ready;
      assert.equal(d.module.calculatorCopyProvider(d.root), null); assert.equal(d.$('[data-d1-recovery]'), null);
      assert.equal(d.get('#ce-name'), 'Early private text'); assert.equal(d.workers.length, 0); assert.doesNotMatch(d.root.textContent, /Missing element|closed|disposed/);
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
