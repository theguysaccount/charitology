// Actual Astro markup, actual controller/graph/codecs and fixed numerical worker.
// Native scheduling/DOM adapters do not substitute validation or mathematics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { installToolDom } from '../../../test-fixtures/donor-recovery/tool-dom.mjs';
import { mountModelBundlesForTesting, readEditorForm, illustrativeEditorForm } from './ui.mjs';
import { createModelBundleControllerForTesting } from './session.mjs';
import { fixtureState, fixtureSelected, FIXTURE_NOW } from './test-fixtures.mjs';
import { LOCAL_KEY, makeBackup, parseSelected, parseBackup, validateState } from './graph.mjs';
import { canonicalJson } from './codec.mjs';
import { installCalculatorCopyProvider } from './calculator-copy-provider.mjs';

const rootPath = fileURLToPath(new URL('../../..', import.meta.url));
const componentPath = join(rootPath, 'src/components/tools/model-bundles.astro');
const source = await readFile(componentPath, 'utf8');
const temporary = await mkdtemp(join(rootPath, 'node_modules/.mb-ui-'));
const nativeTimeout = globalThis.setTimeout;
const compiled = await transform(source, { filename: componentPath, internalURL: 'astro/compiler-runtime', renderScript: true, resolvePath: async value => value });
assert.equal(compiled.diagnostics.filter(d => d.severity === 1).length, 0);
await build({ stdin: { contents: compiled.code.replace(/^import\s+"[^"]+\?astro&type=style[^"]*";$/gm, ''), loader: 'ts', resolveDir: join(rootPath, 'src/components/tools') },
  outfile: join(temporary, 'ssr.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent' });
const container = await AstroContainer.create(), Component = (await import(pathToFileURL(join(temporary, 'ssr.mjs')))).default;
const html = await container.renderToString(Component);
const waitFor = async predicate => { const until = performance.now() + 10000; while (!predicate()) { if (performance.now() > until) throw Error('Mounted condition deadline exceeded.'); await new Promise(resolve => nativeTimeout(resolve, 1)); } };

function start(initial = null, options = {}) {
  const dom = installToolDom('<section class="tool"><form id="ce-form"></form></section>' + html), desk = dom.$('#model-bundles');
  if (initial !== null) dom.values.set(LOCAL_KEY, typeof initial === 'string' ? initial : canonicalJson(initial));
  const workerRecords = [], readers = [], fileBytes = new WeakMap(); let heldWorkers = false, id = 0;
  class Reader {
    constructor() { this.onload = this.onerror = this.onabort = null; this.busy = false; this.result = null; this.aborted = 0; readers.push(this); }
    readAsArrayBuffer(file) { this.file = file; this.busy = true; this.retained = { load: this.onload, error: this.onerror };
      if (!options.holdReader) queueMicrotask(() => this.load()); }
    load() { if (!this.busy) return; this.busy = false; this.result = fileBytes.get(this.file).slice().buffer; this.onload?.({}); }
    abort() { assert.equal(this.onload, null); assert.equal(this.onerror, null); assert.equal(this.onabort, null); this.aborted++; this.busy = false; }
  }
  globalThis.FileReader = Reader;
  const workerPlatform = { createWorker() {
    const native = new Worker(new URL('./pure-worker.fixture.mjs', import.meta.url)), listeners = new Map(), record = { pending: [], terminated: false };
    const wrapper = { addEventListener(type, listener) { const handler = type === 'message' ? data => { const event = { data }; record.pending.push(() => listener(event)); if (!heldWorkers) record.deliver(); } : listener;
      listeners.set(listener, [type, handler]); native.on(type, handler); },
    removeEventListener(type, listener) { const entry = listeners.get(listener); if (entry) native.off(entry[0], entry[1]); listeners.delete(listener); },
    postMessage(value) { native.postMessage(value); }, terminate() { record.terminated = true; void native.terminate(); } };
    record.deliver = () => record.pending.shift()?.(); record.native = native; record.listeners = listeners; workerRecords.push(record); return wrapper;
  }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: timer => clearTimeout(timer) };
  let releaseRead = null, releaseWrite = null, firstRead = true;
  const storage = { getItem(key) {
    if (options.holdOpening && firstRead) { firstRead = false; const captured = dom.storage.getItem(key); return new Promise(resolve => { releaseRead = () => resolve(captured); }); }
    return dom.storage.getItem(key);
  }, setItem(key, value) { dom.storage.setItem(key, value); if (options.holdWrite) return new Promise(resolve => { releaseWrite = resolve; }); }, removeItem: key => dom.storage.removeItem(key) };
  const controller = createModelBundleControllerForTesting({ storage, locks: options.unsupported ? null : { request: (key, action) => dom.locks.request(key, {}, action) },
    newId: kind => kind + '-ui-' + ++id, now: () => FIXTURE_NOW, workerPlatform, disableSecureHash: false });
  const mounted = mountModelBundlesForTesting(desk, { controller,
    filePlatform: { createReader: () => new Reader(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: timer => clearTimeout(timer) } });
  const action = name => desk.querySelector(`[data-mb-action="${name}"]`);
  return { ...dom, desk, controller, mounted, readers, workerRecords, action,
    holdWorkers(value) { heldWorkers = value; }, releaseOpening() { releaseRead(); },
    releaseWrite() { releaseWrite(); },
    async ready() { await mounted.ready; return this; },
    async confirm() { await dom.set('#mb-review-ack', true, 'change'); await dom.$('#mb-confirm').click(); },
    async choose(bytes, kind = 'selected') { await dom.set('#mb-file-kind', kind, 'change'); const file = new File([bytes], 'private-original.bin'); fileBytes.set(file, new Uint8Array(bytes)); const input = dom.$('#mb-import-file'); input.files = [file]; await input.fire('change'); assert.equal(input.value, ''); },
    async checksum(sourceId, bytes) { await dom.set('#mb-source-id', sourceId); const file = new File([bytes], 'never-retained-private-path.txt'); fileBytes.set(file, new Uint8Array(bytes)); const input = dom.$('#mb-checksum-file'); input.files = [file]; await input.fire('change'); },
    async example() { await action('example').click(); await this.confirm(); },
    async close() { mounted.dispose(); for (const worker of workerRecords) if (!worker.terminated) { worker.terminated = true; await worker.native.terminate(); } },
  };
}
const sourceDescription = id => ({ id, title: 'Fictional source description', publisher: null, url: null, locator: null, published: null, accessedOn: null, access: 'unknown', license: null, note: 'Unused fictional source; no evidence claim.', checksum: null });

test('mounted model bundle desk uses actual local authority and guarded arithmetic', async t => {
  try {
    await t.test('SSR disables all private controls, 58 leaves plus parser; mounting reads only its key and never writes', async () => {
      const d = start();
      try {
        assert.equal(d.desk.querySelectorAll('[data-mb-field]').length, 59);
        assert.equal(d.desk.querySelectorAll('[data-mb-field]').filter(el => el.dataset.mbField !== 'raw.parser').length, 58);
        assert.ok(d.desk.querySelectorAll('input,textarea,select,button').every(el => el.disabled));
        assert.ok(d.desk.querySelectorAll('[data-mb-field]').every(el => !el.name));
        assert.equal((await d.$('#mb-editor').fire('submit')).defaultPrevented, true);
        await d.ready(); assert.equal(readEditorForm(d.desk).raw.name, '');
        assert.deepEqual(d.operations.map(op => op[1]), [LOCAL_KEY]); assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
        assert.match(d.desk.textContent, /public model registry is empty/);
      } finally { await d.close(); }
    });
    await t.test('explicit example → actual fresh freeze → full candidate review → selected output review with no implicit download', async () => {
      const d = await start().ready();
      try {
        await d.action('example').click(); assert.equal(readEditorForm(d.desk).raw.name, ''); assert.match(d.$('#mb-review-body').textContent, /made-up|Made-up/);
        await d.confirm(); assert.deepEqual(readEditorForm(d.desk), illustrativeEditorForm());
        await d.action('freeze').click(); assert.equal(d.controller.session.snapshot().memory.versions.length, 0);
        assert.equal(d.document.activeElement, d.$('#mb-review-title')); assert.equal(d.$('#mb-review-title').getAttribute('tabindex'), '-1');
        const review = JSON.parse(d.$('#mb-review-body').textContent).review;
        assert.equal(review.candidate.versions.length, 1); assert.ok(review.candidateBackupBytes > 0); assert.equal(review.candidate.versions[0].content.money.currency, 'USD');
        await d.confirm(); assert.equal(d.controller.session.snapshot().memory.versions.length, 1);
        await validateState(JSON.parse(d.values.get(LOCAL_KEY))); assert.equal(d.workerRecords.length, 1);
        await d.action('export-selected').click(); assert.equal(d.downloads.length, 0); assert.match(d.$('#mb-review-body').textContent, /charitology-cost-effectiveness-bundle/);
        await d.confirm(); const bytes = new Uint8Array(await d.downloads[0].arrayBuffer()), packet = await parseSelected(bytes);
        assert.equal(packet.modelVersion.content.classification, 'illustrative'); assert.equal(Object.hasOwn(packet, 'draft'), false);
        assert.ok(d.operations.every(op => op[1] === LOCAL_KEY));
      } finally { await d.close(); }
    });
    await t.test('unfinished JSON saves literally, refused freeze retains every value; raw lone-code-unit recovery is escaped exactly', async () => {
      const d = await start().ready();
      try {
        await d.example();
        const discount = d.desk.querySelectorAll('[data-mb-field]').find(el => el.dataset.mbField === 'raw.discount');
        discount.value = '0.000000000000001'; await discount.fire('input'); await d.action('freeze').click();
        assert.match(d.$('#mb-error').textContent, /numeric-domain/); assert.match(d.$('#mb-error').textContent, /"phase": "discount"/); assert.match(d.$('#mb-error').textContent, /"context"/);
        discount.value = '3'; await discount.fire('input'); await d.set('#mb-json-sources', '[unfinished');
        await d.action('save-draft').click(); await d.confirm(); assert.equal(d.controller.session.snapshot().memory.draft.form.json.sources, '[unfinished');
        await d.action('freeze').click(); assert.equal(d.$('#mb-review').hidden, true); assert.equal(d.get('#mb-json-sources'), '[unfinished'); assert.match(d.$('#mb-error').textContent, /refused/);
        await d.set('#mb-text-purpose', 'Unfinished lone: \ud800'); await d.action('raw-form').click(); assert.match(d.$('#mb-review-body').textContent, /\\ud800/);
        await d.confirm(); const text = await d.downloads.at(-1).text(); const recovered = JSON.parse(text.slice(text.indexOf('{')));
        assert.equal(recovered.form.text.purpose, 'Unfinished lone: \ud800'); assert.equal(d.get('#mb-text-purpose'), recovered.form.text.purpose);
      } finally { await d.close(); }
    });
    await t.test('quota failure retains exact candidate and Retry never replaces newer literal edits or creates another run', async () => {
      const d = await start().ready();
      try {
        await d.example(); d.flags.failWrite = true; await d.action('freeze').click(); await d.confirm();
        const attempted = d.operations.find(op => op[0] === 'set')[2]; assert.equal(d.controller.session.snapshot().pending, 'retry');
        await d.set('#mb-text-purpose', 'Newest writing after the failed save'); assert.equal(d.action('freeze').disabled, true);
        await d.action('pending-recovery').click(); const retained = await parseBackup(new TextEncoder().encode(d.$('#mb-review-body').textContent));
        assert.deepEqual(retained, JSON.parse(attempted)); assert.equal(d.controller.session.snapshot().pending, 'retry');
        await d.confirm(); assert.equal(d.controller.session.snapshot().pending, 'retry'); assert.equal(d.get('#mb-text-purpose'), 'Newest writing after the failed save');
        d.flags.failWrite = false; await d.action('retry').click(); assert.equal(d.values.get(LOCAL_KEY), attempted);
        assert.equal(d.get('#mb-text-purpose'), 'Newest writing after the failed save'); assert.equal(d.workerRecords.length, 1);
        assert.equal(JSON.parse(attempted).versions.length, 1); assert.equal(d.controller.session.snapshot().pending, 'none');
      } finally { await d.close(); }
    });
    await t.test('an actual saved write completing after a newer edit exposes Retry without repainting the newer form', async () => {
      const d = await start(null, { holdWrite: true }).ready();
      try {
        await d.example(); await d.action('freeze').click(); const confirming = d.confirm();
        await waitFor(() => d.operations.some(op => op[0] === 'set'));
        const attempted = d.values.get(LOCAL_KEY); await d.set('#mb-text-purpose', 'Newer text while the write finishes');
        d.releaseWrite(); await confirming;
        assert.equal(d.controller.session.snapshot().pending, 'retry'); assert.equal(d.action('retry').disabled, false);
        assert.equal(d.get('#mb-text-purpose'), 'Newer text while the write finishes');
        await d.action('retry').click(); assert.equal(d.controller.session.snapshot().pending, 'none');
        assert.equal(d.get('#mb-text-purpose'), 'Newer text while the write finishes'); assert.equal(d.values.get(LOCAL_KEY), attempted);
        assert.equal(d.operations.filter(op => op[0] === 'set').length, 1);
      } finally { await d.close(); }
    });
    await t.test('foreign saved bytes and BFCache return update status only; deliberate reload is separately reviewed', async () => {
      const initial = await fixtureState(), d = await start(initial).ready();
      try {
        await d.set('#mb-text-purpose', 'Unsubmitted current writing'); await d.window.fire('pagehide', { persisted: true });
        const foreign = structuredClone(initial); foreign.draft.form.text.purpose = 'Different saved private writing'; foreign.draft.dirty = true;
        d.values.set(LOCAL_KEY, canonicalJson(foreign)); await d.window.fire('pageshow', { persisted: true });
        assert.equal(d.get('#mb-text-purpose'), 'Unsubmitted current writing'); assert.equal(d.controller.session.snapshot().persistence, 'conflict');
        assert.equal(d.action('freeze').disabled, true); assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
        await d.action('reload').click(); assert.equal(d.get('#mb-text-purpose'), 'Unsubmitted current writing'); await d.confirm();
        assert.equal(d.get('#mb-text-purpose'), 'Different saved private writing'); assert.equal(d.controller.session.snapshot().persistence, 'saved');
      } finally { await d.close(); }
    });
    await t.test('held opening across persisted hide/show checks fresh bytes before first hydration; no initial mutation', async () => {
      const initial = await fixtureState(), d = start(initial, { holdOpening: true });
      try {
        await d.window.fire('pagehide', { persisted: true });
        const foreign = structuredClone(initial); foreign.draft.form.text.title = 'Fresh saved title'; d.values.set(LOCAL_KEY, canonicalJson(foreign));
        const showing = d.window.fire('pageshow', { persisted: true }); d.releaseOpening(); await showing; await d.ready();
        assert.equal(d.get('#mb-text-title'), 'Fresh saved title'); assert.ok(d.operations.filter(op => op[0] === 'get').length >= 2);
        assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { await d.close(); }
    });
    await t.test('matched selected file uses actual comparison/draws and reproduced-copy receipt, then local copy/new/amend reviews', async () => {
      const d = await start().ready();
      try {
        await d.choose(await fixtureSelected()); assert.match(d.$('#mb-inspection-status').textContent, /not recalculated/); assert.equal(d.action('copy-reproduced').disabled, true);
        await d.action('recalculate').click(); assert.equal(JSON.parse(d.$('#mb-comparison').textContent).kind, 'matched');
        await d.action('draws').click(); const draws = JSON.parse(d.$('#mb-review-body').textContent); assert.equal(draws.costs.length, 5000); assert.equal(draws.outcomes.length, 5000);
        await d.$('#mb-dismiss').click(); await d.action('copy-reproduced').click(); await d.confirm();
        const state = d.controller.session.snapshot().memory; assert.equal(state.imports.length, 1); assert.equal(state.versions.length, 1); assert.equal(state.versions[0].origin.observation.kind, 'matched');
        await d.action('copy-local').click(); await d.confirm(); assert.equal(d.controller.session.snapshot().memory.draft.origin.kind, 'local-version-copy');
        await d.action('new-draft').click(); await d.confirm(); assert.equal(readEditorForm(d.desk).raw.name, ''); assert.equal(d.controller.session.snapshot().memory.draft.origin, null);
        await d.action('amend').click(); await d.confirm(); assert.equal(d.controller.session.snapshot().memory.draft.mode, 'amend'); assert.equal(readEditorForm(d.desk).raw.name, state.versions[0].content.raw.name);
      } finally { await d.close(); }
    });
    await t.test('mismatch/refusal allows only explicitly acknowledged draft copy; unknown/malformed files remain inert', async () => {
      for (const kind of ['mismatched', 'refused']) {
        const d = await start().ready();
        try {
          await d.choose(await fixtureSelected(kind)); await d.action('recalculate').click();
          assert.equal(d.action('copy-reproduced').disabled, true); assert.equal(d.action('draws').disabled, true); assert.equal(d.action('copy-selected-draft').disabled, true);
          await d.set('#mb-copy-ack', true, 'change'); await d.action('copy-selected-draft').click();
          assert.match(d.$('#mb-review-body').textContent, /observation/); await d.confirm();
          const state = d.controller.session.snapshot().memory;
          assert.equal(state.models.length, 0); assert.equal(state.versions.length, 0); assert.equal(state.imports.length, 0);
          assert.equal(state.draft.origin.observation.kind, kind === 'refused' ? 'arithmetic-refusal' : kind);
        } finally { await d.close(); }
      }
      const d = await start().ready();
      try { await d.choose(await fixtureSelected('unsupported')); assert.equal(d.action('recalculate').disabled, true); assert.match(d.$('#mb-error').textContent, /not be admitted/); assert.match(d.$('#mb-inspection-status').textContent, /inert/); assert.equal(d.workerRecords.length, 0); }
      finally { await d.close(); }
    });
    await t.test('complete backup Restore/Clear/Undo are separately reviewed and raw corrupt bytes stay protected', async () => {
      const d = await start().ready();
      try {
        const state = await fixtureState(); await d.choose(await makeBackup(state, FIXTURE_NOW), 'backup'); await d.action('restore').click();
        assert.deepEqual(JSON.parse(d.$('#mb-review-body').textContent).review.candidate, state); await d.confirm(); assert.equal(d.controller.session.snapshot().memory.versions.length, 1);
        await d.action('clear').click(); await d.confirm(); assert.equal(d.values.has(LOCAL_KEY), false); assert.equal(readEditorForm(d.desk).raw.name, '');
        await d.action('undo').click(); await d.confirm(); assert.equal(d.controller.session.snapshot().memory.versions.length, 1);
      } finally { await d.close(); }
      const corrupt = '{ private lone \ud800 broken', c = await start(corrupt).ready();
      try {
        assert.equal(c.action('freeze').disabled, true); assert.equal(c.values.get(LOCAL_KEY), corrupt);
        await c.action('raw-saved').click(); await c.confirm(); const body = await c.downloads.at(-1).text(); assert.equal(JSON.parse(body.slice(body.indexOf('{'))).savedString, corrupt);
        await c.action('clear').click(); await c.confirm(); assert.equal(c.values.has(LOCAL_KEY), false); assert.equal(c.action('undo').disabled, true);
      } finally { await c.close(); }
    });
    await t.test('separate source proofs survive unrelated edits; malformed/removed claims permanently revoke proof and literal text stays intact', async () => {
      const d = await start().ready();
      try {
        await d.example(); await d.set('#mb-json-sources', JSON.stringify([sourceDescription('source-a'), sourceDescription('source-b')]));
        await d.checksum('source-a', new Uint8Array()); assert.equal(d.$('#mb-error').hidden, true, d.$('#mb-error').textContent);
        assert.equal(JSON.parse(d.get('#mb-json-sources'))[0].checksum?.byteLength, 0);
        await d.checksum('source-b', new Uint8Array([1, 2, 3])); assert.equal(d.$('#mb-error').hidden, true, d.$('#mb-error').textContent);
        const claims = d.get('#mb-json-sources'); assert.equal(JSON.parse(claims)[0].checksum.byteLength, 0); assert.equal(JSON.parse(claims)[1].checksum.byteLength, 3);
        await d.set('#mb-text-purpose', 'An unrelated authored purpose.'); await d.action('freeze').click(); assert.equal(d.$('#mb-review').hidden, false); await d.$('#mb-dismiss').click();
        await d.set('#mb-json-sources', '[unfinished'); assert.equal(d.get('#mb-json-sources'), '[unfinished'); await d.set('#mb-json-sources', claims);
        await d.action('freeze').click(); assert.equal(d.$('#mb-review').hidden, true); assert.match(d.$('#mb-error').textContent, /checksum/);
        assert.doesNotMatch(d.desk.textContent, /never-retained-private-path/);
      } finally { await d.close(); }
    });
    await t.test('explicit calculator capture waits for installed provider, never scans old key, and stale capture cannot replace form', async () => {
      const d = await start().ready(); let remove;
      try {
        await d.action('copy-current').click(); assert.match(d.$('#mb-error').textContent, /not finished initialization/);
        let generation = 0; const raw = illustrativeEditorForm().raw; delete raw.parser;
        remove = installCalculatorCopyProvider(d.$('#ce-form').closest('section.tool'), { capture: () => ({ raw, formGeneration: generation }), isCurrent: value => value === generation });
        await d.action('copy-current').click(); generation++; await d.confirm(); assert.equal(readEditorForm(d.desk).raw.name, ''); assert.match(d.$('#mb-error').textContent, /changed after review/);
        await d.action('copy-current').click(); await d.confirm(); assert.equal(readEditorForm(d.desk).raw.parser, 'legacy-amount-strip-v1');
        assert.ok(d.operations.every(op => op[1] === LOCAL_KEY));
      } finally { remove?.(); await d.close(); }
    });
    await t.test('held actual worker cannot repaint after edit or persisted hide; read-only storage still offers exact recovery', async () => {
      const d = await start().ready();
      try {
        await d.choose(await fixtureSelected()); d.holdWorkers(true); const work = d.action('recalculate').click();
        await waitFor(() => d.workerRecords[0]?.pending.length); await d.set('#mb-text-purpose', 'Latest literal writing'); await work;
        d.workerRecords[0].deliver(); assert.equal(d.$('#mb-comparison').textContent, ''); assert.equal(d.get('#mb-text-purpose'), 'Latest literal writing'); assert.equal(d.workerRecords[0].terminated, true);
        await d.window.fire('pagehide', { persisted: true }); d.flags.failRead = true; await d.window.fire('pageshow', { persisted: true });
        assert.equal(d.get('#mb-text-purpose'), 'Latest literal writing'); assert.equal(d.action('freeze').disabled, true); assert.equal(d.operations.filter(op => op[0] !== 'get').length, 0);
      } finally { await d.close(); }
    });
    await t.test('new invalid file choice aborts the held reader; retained old load cannot restore authority or overwrite literal writing', async () => {
      const d = await start(null, { holdReader: true }).ready();
      try {
        await d.set('#mb-text-purpose', 'Literal writing before file choice');
        const reading = d.choose(await fixtureSelected()); await waitFor(() => d.readers[0]?.busy);
        const reader = d.readers[0], retained = reader.retained.load;
        d.$('#mb-import-file').files = []; await d.$('#mb-import-file').fire('change'); await reading;
        assert.equal(reader.aborted, 1); assert.equal(reader.onload, null); reader.result = (await fixtureSelected()).buffer; retained({});
        assert.equal(d.action('recalculate').disabled, true); assert.equal(d.action('copy-reproduced').disabled, true);
        assert.equal(d.get('#mb-text-purpose'), 'Literal writing before file choice'); assert.equal(d.controller.session.snapshot().memory.versions.length, 0);
      } finally { await d.close(); }
    });
    await t.test('cancelled native SHA retains the physical slot, blocks new freeze honestly and leaves raw recovery available', async () => {
      const d = await start().ready(), digest = globalThis.crypto.subtle.digest; let release;
      try {
        await d.example(); await d.set('#mb-json-sources', JSON.stringify([sourceDescription('source-a')]));
        let entered = false; const gate = new Promise(resolve => { release = resolve; });
        globalThis.crypto.subtle.digest = async function (...args) { const result = await digest.apply(this, args); entered = true; await gate; return result; };
        const pending = d.checksum('source-a', new Uint8Array([4, 5])); await waitFor(() => entered);
        await d.action('cancel-file').click(); await pending;
        assert.equal(d.controller.bridge.payload.snapshot().busy, true);
        await d.action('freeze').click(); assert.match(d.$('#mb-error').textContent, /native hashing is still settling/);
        assert.equal(d.workerRecords.length, 0); assert.equal(d.$('#mb-review').hidden, true);
        await d.action('raw-form').click(); assert.match(d.$('#mb-review-body').textContent, /Unfinished model bundle form recovery/);
        await d.confirm(); assert.equal(d.downloads.length, 1); assert.equal(d.controller.session.snapshot().memory.versions.length, 0);
        release(); await waitFor(() => !d.controller.bridge.payload.snapshot().busy);
      } finally { release?.(); globalThis.crypto.subtle.digest = digest; await d.close(); }
    });
    await t.test('source checksum native Cancel revokes that completed claim; typing the old bytes back cannot revive it', async () => {
      const d = await start().ready();
      try {
        await d.example(); await d.set('#mb-json-sources', JSON.stringify([sourceDescription('source-a')])); await d.checksum('source-a', new Uint8Array([9]));
        const sources = d.get('#mb-json-sources'); await d.$('#mb-checksum-file').fire('cancel');
        assert.equal(d.get('#mb-json-sources'), sources); await d.action('freeze').click();
        assert.equal(d.$('#mb-review').hidden, true); assert.match(d.$('#mb-error').textContent, /checksum/);
      } finally { await d.close(); }
    });
    await t.test('deliberate new-draft replacement revokes completed unsaved source proof before another draft can reuse its claim', async () => {
      const d = await start().ready();
      try {
        await d.example(); await d.set('#mb-json-sources', JSON.stringify([sourceDescription('source-a')])); await d.checksum('source-a', new Uint8Array([5]));
        const oldClaim = d.get('#mb-json-sources'); await d.action('new-draft').click(); await d.confirm();
        await d.example(); await d.set('#mb-json-sources', oldClaim); await d.action('freeze').click();
        assert.equal(d.$('#mb-review').hidden, true); assert.match(d.$('#mb-error').textContent, /checksum/);
      } finally { await d.close(); }
    });
    await t.test('download URL remains readable for native handoff, then expires or is released on lifecycle cleanup', async () => {
      const d = await start().ready(), active = new Map(), released = [], timers = [];
      const priorCreate = URL.createObjectURL, priorRevoke = URL.revokeObjectURL;
      const priorSet = globalThis.setTimeout, priorClear = globalThis.clearTimeout;
      let number = 0;
      URL.createObjectURL = blob => { const url = 'blob:held-native-handoff/' + ++number; active.set(url, blob); return url; };
      URL.revokeObjectURL = url => { released.push(url); active.delete(url); };
      globalThis.setTimeout = (fn, ms, ...args) => {
        if (ms !== 10000) return priorSet(fn, ms, ...args);
        const timer = { fn, cancelled: false }; timers.push(timer); return timer;
      };
      globalThis.clearTimeout = timer => { if (timers.includes(timer)) timer.cancelled = true; else priorClear(timer); };
      try {
        await d.action('raw-form').click(); await d.confirm();
        assert.equal(active.size, 1, 'The native browser must be able to consume the URL after the anchor click returns.');
        assert.match(await [...active.values()][0].text(), /Unfinished model bundle form recovery/);
        assert.equal(released.length, 0); assert.equal(timers.length, 1);
        timers[0].fn(); assert.equal(active.size, 0); assert.equal(released.length, 1);
        await d.action('raw-form').click(); await d.confirm(); assert.equal(active.size, 1);
        await d.window.fire('pagehide', { persisted: true }); assert.equal(active.size, 0); assert.equal(timers[1].cancelled, true);
        await d.window.fire('pageshow', { persisted: true });
        await d.action('raw-form').click(); await d.confirm(); assert.equal(active.size, 1);
        await d.close(); assert.equal(active.size, 0); assert.equal(timers[2].cancelled, true);
      } finally {
        await d.close(); URL.createObjectURL = priorCreate; URL.revokeObjectURL = priorRevoke;
        globalThis.setTimeout = priorSet; globalThis.clearTimeout = priorClear;
      }
    });
    await t.test('page mount is conditional to only the model kit; responsive styles use shared theme tokens', async () => {
      const page = await readFile(join(rootPath, 'src/pages/tools/[slug].astro'), 'utf8'), css = await readFile(join(rootPath, 'src/lib/model-bundles/ui.css'), 'utf8');
      assert.match(page, /entry\.id === 'cost-effectiveness-model-kit' \? <Fragment slot="top"><Tool \/><ModelBundles \/><\/Fragment> : <Tool slot="top" \/>/);
      assert.match(css, /@media\(max-width:540px\)/); assert.match(css, /var\(--surface\)/); assert.doesNotMatch(source, /name=|set:html|<iframe/);
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
