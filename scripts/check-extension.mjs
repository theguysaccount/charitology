// Validate the packages users download and exercise the lookup privacy boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
function unzipStored(path) {
  const zip = readFileSync(path), entries = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(offset + 8), 0, 'Expected a stored ZIP');
    const size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26), extraSize = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 30, offset + 30 + nameSize);
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), 'Unsafe ZIP path');
    assert.ok(!entries.has(name), `Duplicate ZIP entry: ${name}`);
    const start = offset + 30 + nameSize + extraSize;
    entries.set(name, zip.subarray(start, start + size));
    offset = start + size;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'Missing ZIP central directory');
  return entries;
}
for (const name of ['charitology-extension.zip', 'charitology-chrome.zip', 'charitology-firefox.zip']) {
  const entries = unzipStored(join(root, 'public/downloads', name));
  const manifest = JSON.parse(entries.get('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, source.version);
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage']);
  if (name.includes('chrome')) assert.equal(manifest.browser_specific_settings, undefined);
  else assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
  for (const file of [...Object.values(manifest.icons), manifest.action.default_popup, ...manifest.content_scripts.flatMap((script) => script.js), 'checklist.json', 'popup.js', 'popup.css']) assert.ok(entries.has(file), `${name}: missing ${file}`);
  const checklist = JSON.parse(entries.get('checklist.json'));
  assert.equal(checklist.length, 10);
  for (const [file, bytes] of entries) if (file.endsWith('.js')) {
    const text = bytes.toString('utf8');
    assert.ok(!text.includes('__CHARITOLOGY_SITE__'), `${name}: unbaked site URL`);
    new vm.Script(text, { filename: file });
  }
}

// Exercise real popup code: a Unicode/special-character tab title must reach
// the local lookup in a fragment, never a server-visible query parameter.
const elements = new Map();
const element = () => ({ value: '', textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, append() {}, querySelectorAll() { return []; }, focus() {}, select() {} });
const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
const opened = [];
const context = vm.createContext({ document, window: {close() {}}, browser: {tabs: {query: async () => [{title: 'Donate to Aid & Care / 救援 | GoFundMe'}], create: ({url}) => opened.push(url)}}, fetch: async () => ({json: async () => []}) });
new vm.Script(readFileSync(join(root, 'extension/popup.js'), 'utf8')).runInContext(context);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(opened.length, 0, 'Opening the popup must not send the search anywhere');
elements.get('lookup').listeners.submit({preventDefault() {}});
assert.equal(opened.length, 1);
const destination = new URL(opened[0]);
assert.equal(destination.origin, 'https://charitology.org');
assert.equal(destination.pathname, '/tools/charity-lookup/');
assert.equal(destination.search, '', 'Search text must be absent from the HTTP query');
assert.equal(new URLSearchParams(destination.hash.slice(1)).get('q'), 'Aid & Care / 救援');
assert.ok(readFileSync(join(root, 'extension/content.js'), 'utf8').includes('#q='));
console.log('✓ Three extension packages validated; popup lookup keeps the title out of HTTP requests.');
