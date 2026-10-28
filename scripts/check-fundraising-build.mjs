import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'parse5';
import yaml from 'js-yaml';
import { fundraisingMethods, fundraisingSources } from '../src/data/fundraising.mjs';
import { MODULE_MAP } from '../services/charity-os/lib/modules.mjs';

const expected = ['email-appeals', 'paid-ads', 'fundraising-events', 'recurring-giving', 'peer-to-peer', 'major-gifts', 'grants', 'direct-mail', 'corporate-partnerships', 'donor-follow-up'];
assert.deepEqual(fundraisingMethods.map(method => method.id), expected);
assert.equal(new Set(fundraisingSources.map(source => source.id)).size, fundraisingSources.length);
const sourceIds = new Set(fundraisingSources.map(source => source.id));
for (const source of fundraisingSources) {
  assert.equal(source.review, 'draft');
  assert.equal(new URL(source.url).protocol, 'https:');
  for (const field of ['title', 'summary', 'limits', 'kind']) assert.ok(typeof source[field] === 'string' && source[field].trim());
  assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
}
for (const method of fundraisingMethods) {
  assert.equal(method.review, 'draft');
  for (const field of ['title', 'summary', 'goal', 'fit', 'experiment']) assert.ok(typeof method[field] === 'string' && method[field].trim());
  for (const field of ['costs', 'preflight', 'steps', 'measure', 'followup', 'pitfalls']) assert.ok(Array.isArray(method[field]) && method[field].length && method[field].every(item => typeof item === 'string' && item.trim()));
  assert.ok(method.sourceIds.length && method.sourceIds.every(id => sourceIds.has(id)));
  assert.ok(method.osModules.length && method.osModules.every(id => Object.hasOwn(MODULE_MAP, id)));
}
function nodes(document) { const result = []; const visit = node => { result.push(node); for (const child of node.childNodes ?? []) visit(child); }; visit(document); return result; }
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
const hub = parse(await readFile('dist/for-charities/fundraising/index.html', 'utf8'));
const all = nodes(hub), planner = all.filter(node => attr(node, 'id') === 'fundraising-planner');
assert.equal(planner.length, 1, 'One actual planner is emitted.');
const controls = nodes(planner[0]).filter(node => ['input', 'textarea', 'select', 'button'].includes(node.tagName));
assert.ok(controls.length > 20);
for (const control of controls) {
  assert.equal(attr(control, 'name'), undefined, 'Private writing has no default GET names.');
  if (attr(control, 'readonly') !== undefined) continue;
  let disabled = attr(control, 'disabled') !== undefined;
  for (let parent = control.parentNode; parent && parent !== planner[0]; parent = parent.parentNode) if (parent.tagName === 'fieldset' && attr(parent, 'disabled') !== undefined) disabled = true;
  assert.ok(disabled, 'Editable controls and actions start effectively disabled.');
}
assert.ok(nodes(planner[0]).some(node => node.tagName === 'noscript'));
for (const method of fundraisingMethods) {
  const page = nodes(parse(await readFile(join('dist/for-charities/fundraising', method.id, 'index.html'), 'utf8')));
  assert.equal(page.filter(node => node.tagName === 'h1').length, 1);
  assert.ok(page.some(node => node.tagName === 'h1' && text(node) === method.title));
  for (const id of ['fit', 'costs', 'preflight', 'steps', 'measure', 'experiment', 'followup', 'pitfalls', 'sources', 'workspace']) assert.equal(page.filter(node => attr(node, 'id') === id).length, 1);
  for (const id of method.osModules) assert.ok(page.some(node => attr(node, 'href') === 'https://os.charitology.org/#module/' + id));
  for (const id of method.sourceIds) assert.ok(page.some(node => attr(node, 'href') === fundraisingSources.find(source => source.id === id).url));
  assert.match(text(page[0]), /Untested proposal/);
}
const form = yaml.load(await readFile('.github/ISSUE_TEMPLATE/fundraising-learning.yml', 'utf8'));
assert.equal(form.name, 'Fundraising learning note');
assert.equal(new Set(form.body.filter(item => item.id).map(item => item.id)).size, 6);
assert.ok(form.body.filter(item => item.validations?.required).length >= 5);
console.log(`Fundraising build: ${fundraisingMethods.length} readable guides, ${fundraisingSources.length} draft source capsules, ${controls.length} protected controls and one public learning-note form.`);
