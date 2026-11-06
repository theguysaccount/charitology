// Check the emitted product page and the actual browser-worker packaging.
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse } from 'parse5';

const dist = resolve('dist');
const target = join(dist, 'tools/cost-effectiveness-model-kit/index.html');
const html = await readFile(target, 'utf8');
const document = parse(html);
const all = [];
function collect(node) { all.push(node); for (const child of node.childNodes ?? []) collect(child); }
collect(document);
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const byId = id => all.filter(node => attribute(node, 'id') === id);
assert.equal(byId('model-bundles').length, 1, 'The Model Kit has exactly one bundle desk.');
assert.equal(byId('ce-form').length, 1, 'The original calculator remains available.');
const desk = byId('model-bundles')[0];
const descendants = [];
function children(node) { descendants.push(node); for (const child of node.childNodes ?? []) children(child); }
children(desk);
assert.ok(!descendants.includes(byId('ce-form')[0]), 'The new desk does not enclose the original calculator.');
let legacyRoot = byId('ce-form')[0];
while (legacyRoot && !(legacyRoot.tagName === 'section' && (attribute(legacyRoot, 'class') ?? '').split(/\s+/).includes('tool'))) legacyRoot = legacyRoot.parentNode;
assert.ok(legacyRoot, 'The original calculator retains its own tool section.');
for (let parent = desk.parentNode; parent; parent = parent.parentNode) assert.notEqual(parent, legacyRoot, 'Bundle controls must be outside the legacy selector boundary.');
const controls = descendants.filter(node => ['input', 'textarea', 'select', 'button'].includes(node.tagName));
assert.ok(controls.length > 60);
for (const control of controls) {
  assert.notEqual(attribute(control, 'disabled'), undefined, 'Private controls start disabled.');
  assert.equal(attribute(control, 'name'), undefined, 'Private fields have no default GET submission names.');
}
const fields = controls.filter(node => attribute(node, 'data-mb-field') !== undefined);
assert.equal(fields.filter(node => attribute(node, 'data-mb-field') !== 'raw.parser').length, 58);
assert.equal(fields.filter(node => attribute(node, 'data-mb-field') === 'raw.parser').length, 1);
assert.equal(new Set(fields.map(node => attribute(node, 'data-mb-field'))).size, 59);
assert.equal(attribute(byId('mb-editor')[0], 'action'), undefined);
assert.equal(attribute(byId('mb-review-title')[0], 'tabindex'), '-1', 'The complete review has a keyboard focus destination.');
assert.doesNotMatch(html, /held-before-restore|Synthetic learner A|source-fixture-secret/);

const base = (process.env.BASE_PATH ?? '/').replace(/\/$/, '');
const local = value => {
  if (!value?.startsWith('/')) return null;
  const path = value.split(/[?#]/)[0];
  return join(dist, decodeURIComponent(base && path.startsWith(base + '/') ? path.slice(base.length) : path));
};
let linkedAssets = 0;
for (const node of all) {
  const url = node.tagName === 'script' ? attribute(node, 'src') : node.tagName === 'link' ? attribute(node, 'href') : null;
  const file = local(url);
  if (file && /\.(?:js|css)$/.test(file)) { await access(file); linkedAssets++; }
}
assert.ok(linkedAssets > 0);
const astroFiles = await readdir(join(dist, '_astro'));
const workers = astroFiles.filter(name => /^model-worker-[A-Za-z0-9_-]+\.js$/.test(name));
assert.equal(workers.length, 1, 'The actual static module worker is emitted once.');
const worker = await readFile(join(dist, '_astro', workers[0]), 'utf8');
assert.match(worker, /charitology-model-worker/);
assert.match(worker, /charitology-ce-triangular-js-v1/);
assert.doesNotMatch(worker, /node:worker_threads|pure-worker\.fixture/);
const browserScripts = await Promise.all(astroFiles.filter(name => name.endsWith('.js') && name !== workers[0]).map(name => readFile(join(dist, '_astro', name), 'utf8')));
assert.ok(browserScripts.some(source => source.includes(workers[0]) && /new Worker\(/.test(source)), 'A browser client references the emitted fixed worker.');
for (const entry of await readdir(join(dist, 'tools'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'cost-effectiveness-model-kit') continue;
  let other;
  try { other = await readFile(join(dist, 'tools', entry.name, 'index.html'), 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  assert.doesNotMatch(other, /id="model-bundles"/, 'Only the Model Kit mounts the private model desk.');
}
console.log(`Model bundle build: one isolated desk, 58 literal leaves plus parser, ${controls.length} protected controls, ${linkedAssets} linked assets and one fixed module worker.`);
