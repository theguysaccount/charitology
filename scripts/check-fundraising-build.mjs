import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'parse5';
import yaml from 'js-yaml';
import { fundraisingLearningFormUrl, fundraisingMethods, fundraisingResults, fundraisingSources } from '../src/data/fundraising.mjs';
import { fundraisingModuleSymbols, fundraisingSourceSymbols } from '../src/lib/list-identities.ts';
import { pageIdentity, symbols } from '../src/lib/site-identities.ts';
import { MODULE_MAP } from '../services/charity-os/lib/modules.mjs';

const expected = ['email-appeals', 'paid-ads', 'fundraising-events', 'recurring-giving', 'peer-to-peer', 'major-gifts', 'grants', 'direct-mail', 'corporate-partnerships', 'donor-follow-up'];
assert.deepEqual(fundraisingMethods.map(method => method.id), expected);
assert.equal(new Set(fundraisingSources.map(source => source.id)).size, fundraisingSources.length);
const sourceIds = new Set(fundraisingSources.map(source => source.id));
const noteGroups = ['costs', 'preflight', 'steps', 'measure', 'followup', 'pitfalls'];
for (const source of fundraisingSources) {
  assert.equal(source.review, 'draft');
  assert.equal(new URL(source.url).protocol, 'https:');
  for (const field of ['title', 'summary', 'limits', 'kind']) assert.ok(typeof source[field] === 'string' && source[field].trim());
  assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
}
for (const method of fundraisingMethods) {
  assert.equal(method.review, 'draft');
  for (const field of ['title', 'summary', 'goal', 'fit', 'experiment']) assert.ok(typeof method[field] === 'string' && method[field].trim());
  for (const field of noteGroups) {
    const items = method[field];
    assert.ok(Array.isArray(items) && items.length);
    assert.ok(items.every(([copy, mark]) => typeof copy === 'string' && copy.trim() && Object.hasOwn(symbols, mark)));
    assert.equal(new Set(items.map(([, mark]) => mark)).size, items.length, `${method.id} ${field}`);
  }
  assert.ok(method.sourceIds.length && method.sourceIds.every(id => sourceIds.has(id)));
  assert.ok(method.osModules.length && method.osModules.every(id => Object.hasOwn(MODULE_MAP, id)));
}
function nodes(document) { const result = []; const visit = node => { result.push(node); for (const child of node.childNodes ?? []) visit(child); }; visit(document); return result; }
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
const symbol = node => nodes(node).map(child => attr(child, 'data-site-symbol')).find(Boolean);
const expectedRows = {
  'thank-you-calls': [
    ['Assigned a call', '439,510', '27.97%'],
    ['Assigned no call', '54,606', '28.06%'],
  ],
  'direct-mail-match-offer': [
    ['Assigned a match offer', '33,396', '2.2%'],
    ['Assigned no match offer', '16,687', '1.8%'],
  ],
  'facebook-video-ads': [
    ['Average in control areas', '€129.30'],
    ['Adjusted difference from control', '+€17.65'],
  ],
};
assert.equal(fundraisingLearningFormUrl, 'https://github.com/theguysaccount/charitology/issues/new?template=fundraising-learning.yml');
assert.deepEqual(fundraisingResults.map(({ id, methodId }) => [id, methodId]), [
  ['thank-you-calls', 'donor-follow-up'],
  ['direct-mail-match-offer', 'direct-mail'],
  ['facebook-video-ads', 'paid-ads'],
]);

function checkResults(page, results) {
  const shelves = page.filter(node => attr(node, 'id') === 'results');
  assert.equal(shelves.length, results.length ? 1 : 0);
  assert.equal(page.filter(node => attr(node, 'href') === '#results').length, shelves.length);
  if (!results.length) return;
  const shelf = nodes(shelves[0]);
  assert.equal(shelf.filter(node => node.tagName === 'article').length, results.length);
  assert.ok(shelf.some(node => node.tagName === 'a' && attr(node, 'href') === fundraisingLearningFormUrl && text(node) === 'Share a de-identified result'));
  assert.match(text(shelves[0]), /public GitHub issue.*aggregate results you have permission to publish/);
  for (const result of results) {
    const cards = shelf.filter(node => attr(node, 'id') === `result-${result.id}`);
    assert.equal(cards.length, 1);
    const card = cards[0];
    assert.match(text(card), /Editorial draft.*Randomized field experiment/);
    for (const field of ['title', 'context', 'comparison', 'window', 'finding', 'costs', 'limits']) assert.ok(text(card).includes(result[field]));
    const caption = nodes(card).find(node => node.tagName === 'caption');
    assert.equal(text(caption), result.measurement.caption);
    if (result.id === 'facebook-video-ads') {
      for (const detail of ['7,686 postal codes', '52 days', 'per million residents per day', '€47,726', '€4,892 to €90,571', '€33,700 in direct campaign costs', 'shifted away from similar charities']) assert.ok(text(card).includes(detail), detail);
    } else {
      assert.match(text(card), /Costs\.\s+Unknown/);
    }
    const rows = nodes(card).find(node => node.tagName === 'tbody').childNodes.filter(node => node.tagName === 'tr');
    assert.deepEqual(rows.map(row => row.childNodes.filter(node => node.tagName === 'th' || node.tagName === 'td').map(text)), expectedRows[result.id]);
    for (const source of result.sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.ok(nodes(card).some(node => attr(node, 'href') === source.url && text(node) === source.label));
    }
  }
}

const hub = parse(await readFile('dist/for-charities/fundraising/index.html', 'utf8'));
const all = nodes(hub), planner = all.filter(node => attr(node, 'id') === 'fundraising-planner');
checkResults(all, fundraisingResults);
for (const result of fundraisingResults) {
  assert.ok(all.some(node => attr(node, 'href')?.endsWith(`/for-charities/fundraising/${result.methodId}/#results`)));
}
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
const methodMarks = new Set();
for (const method of fundraisingMethods) {
  const page = nodes(parse(await readFile(join('dist/for-charities/fundraising', method.id, 'index.html'), 'utf8')));
  checkResults(page, fundraisingResults.filter(result => result.methodId === method.id));
  assert.equal(page.filter(node => node.tagName === 'h1').length, 1);
  assert.ok(page.some(node => node.tagName === 'h1' && text(node) === method.title));
  for (const id of ['fit', 'costs', 'preflight', 'steps', 'measure', 'experiment', 'followup', 'pitfalls', 'sources', 'workspace']) assert.equal(page.filter(node => attr(node, 'id') === id).length, 1);
  const path = `/for-charities/fundraising/${method.id}/`;
  const mark = pageIdentity(path).symbol;
  assert.ok(all.some(node => attr(node, 'href')?.endsWith(path) && attr(node, 'class') === 'method-card'), path);
  assert.equal(attr(page.find(node => node.tagName === 'main'), 'data-site-symbol'), mark, path);
  assert.ok(!methodMarks.has(mark), path);
  methodMarks.add(mark);
  const contents = page.find(node => attr(node, 'class')?.split(' ').includes('method-contents'));
  const jumpLinks = nodes(contents).filter(node => attr(node, 'href')?.startsWith('#'));
  assert.ok(jumpLinks.length >= 10, path);
  assert.equal(new Set(jumpLinks.map(symbol)).size, jumpLinks.length, path);
  for (const link of jumpLinks) {
    const section = page.find(node => attr(node, 'id') === attr(link, 'href').slice(1));
    const heading = nodes(section).find(node => node.tagName === 'h2');
    assert.equal(attr(heading, 'data-section-symbol'), symbol(link), attr(link, 'href'));
  }
  for (const field of noteGroups) {
    const section = page.find(node => attr(node, 'id') === field);
    const list = nodes(section).find(node => attr(node, 'class')?.split(' ').includes('marked-list'));
    assert.equal(list?.tagName, field === 'steps' ? 'ol' : 'ul', `${path}#${field}`);
    const items = list.childNodes.filter(node => node.tagName === 'li');
    assert.deepEqual(items.map(item => [text(item).trim(), symbol(item)]), method[field], `${path}#${field}`);
  }
  for (const id of method.osModules) {
    const link = page.find(node => attr(node, 'href') === 'https://os.charitology.org/#module/' + id);
    assert.equal(symbol(link), fundraisingModuleSymbols[id], id);
  }
  for (const id of method.sourceIds) {
    const source = page.find(node => attr(node, 'data-fundraising-source') === id);
    const link = nodes(source).find(node => attr(node, 'href') === fundraisingSources.find(item => item.id === id).url);
    assert.equal(symbol(link), fundraisingSourceSymbols[id], id);
  }
  assert.match(text(page[0]), /Untested proposal/);
}
const form = yaml.load(await readFile('.github/ISSUE_TEMPLATE/fundraising-learning.yml', 'utf8'));
assert.equal(form.name, 'Fundraising learning note');
assert.equal(new Set(form.body.filter(item => item.id).map(item => item.id)).size, 6);
assert.ok(form.body.filter(item => item.validations?.required).length >= 5);
console.log(`Fundraising build: ${fundraisingMethods.length} readable guides, ${fundraisingResults.length} sourced field results, ${fundraisingSources.length} draft source capsules, ${controls.length} protected controls and one public learning-note form.`);
