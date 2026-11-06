import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { installToolDom } from '../../../test-fixtures/donor-recovery/tool-dom.mjs';
import { calculateFundraisingBudget, prepareFundraisingPlan, addFundraisingDays, foldFundraisingCalendarLine,
  escapeFundraisingCalendarText, mountFundraisingPlanner, FundraisingPlannerError, FUNDRAISING_LIMITS } from './planner.mjs';

const NOW = '2026-10-28T03:04:05.006Z', nativeCrypto = globalThis.crypto;
const blankBudget = () => ({ currency: 'USD', grossReceived: '', refunds: '', cashCosts: '', staffHours: '', staffHourValue: '', volunteerHours: '', volunteerHourValue: '', newDonors: '', priorYearDonors: '', returningDonors: '' });
const fullBudget = () => ({ currency: 'USD', grossReceived: '1000', refunds: '50', cashCosts: '100', staffHours: '2.50', staffHourValue: '20', volunteerHours: '3', volunteerHourValue: '10', newDonors: '10', priorYearDonors: '3', returningDonors: '1' });
const raw = () => ({ ...fullBudget(), campaignTitle: 'Fictional community campaign', campaignDate: '2028-02-28', ownerRole: 'Fundraising lead', offsets: { acknowledgment: '0', welcome: '3', progress: '30', review: '90' } });
const known = value => ({ kind: 'known', value });
const fail = action => assert.throws(action, error => error instanceof FundraisingPlannerError);
const reject = action => assert.rejects(action, error => error instanceof FundraisingPlannerError);
const unfold = calendar => calendar.replace(/\r\n /g, '');

test('blanks stay unknown, explicit zero stays known and zero denominators are separately undefined', () => {
  const empty = calculateFundraisingBudget(blankBudget()); for (const metric of Object.values(empty.metrics)) assert.deepEqual(metric, { kind: 'unknown' });
  const zero = calculateFundraisingBudget(Object.fromEntries(Object.keys(blankBudget()).map(key => [key, key === 'currency' ? 'USD' : '0'])));
  for (const key of ['netCash', 'staffTimeCost', 'volunteerTimeCost', 'fullCost', 'netWithTime']) assert.deepEqual(zero.metrics[key], known('0.00'));
  for (const key of ['cashCostPerNewDonor', 'fullCostPerNewDonor', 'retentionPercent']) assert.deepEqual(zero.metrics[key], { kind: 'undefined', reason: 'zero-denominator' });
  const partial = { ...blankBudget(), staffHours: '0', staffHourValue: '' }; assert.deepEqual(calculateFundraisingBudget(partial).metrics.staffTimeCost, { kind: 'unknown' });
});
test('actual exact cost arithmetic includes both time values, permits negative net and labels rounded donor ratios', () => {
  const b = calculateFundraisingBudget(fullBudget());
  assert.deepEqual(b.metrics, { netCash: known('850.00'), staffTimeCost: known('50.00'), volunteerTimeCost: known('30.00'), fullCost: known('180.00'), netWithTime: known('770.00'), cashCostPerNewDonor: known('10.00'), fullCostPerNewDonor: known('18.00'), retentionPercent: known('33.33') });
  const tiny = calculateFundraisingBudget({ ...fullBudget(), staffHours: '.01', staffHourValue: '.01', volunteerHours: '0', volunteerHourValue: '0' });
  assert.deepEqual(tiny.metrics.staffTimeCost, known('0.0001')); assert.deepEqual(tiny.metrics.netWithTime, known('849.9999'));
  const negative = calculateFundraisingBudget({ ...fullBudget(), grossReceived: '0', refunds: '1.01' }); assert.deepEqual(negative.metrics.netCash, known('-101.01'));
  assert.deepEqual(calculateFundraisingBudget({ ...fullBudget(), cashCosts: '.01', newDonors: '2' }).metrics.cashCostPerNewDonor, known('0.01'));
  assert.ok(Object.isFrozen(b.metrics)); assert.equal(b.inputs.staffHours, '2.50');
});
test('closed bounded financial inputs refuse coercion, nonfinite/scientific/negative values, donor inconsistencies and count+1', () => {
  for (const value of ['NaN', 'Infinity', '1e3', '-1', '+1', '1,000', '$3', '1.001']) fail(() => calculateFundraisingBudget({ ...fullBudget(), grossReceived: value }));
  for (const [key, value] of [['newDonors', '1.5'], ['returningDonors', '4'], ['newDonors', '1000000001'], ['staffHours', '1000000.01'], ['grossReceived', '1000000000000.01']]) fail(() => calculateFundraisingBudget({ ...fullBudget(), [key]: value }));
  const getter = { ...fullBudget() }; Object.defineProperty(getter, 'cashCosts', { enumerable: true, get() { assert.fail('Untrusted getter executed'); } }); fail(() => calculateFundraisingBudget(getter));
  fail(() => calculateFundraisingBudget({ ...fullBudget(), currency: 'CAD' })); fail(() => calculateFundraisingBudget({ ...fullBudget(), extra: '' })); fail(() => calculateFundraisingBudget({ ...fullBudget(), cashCosts: 0 }));
  const maximum = calculateFundraisingBudget({ ...fullBudget(), grossReceived: FUNDRAISING_LIMITS.money, staffHours: FUNDRAISING_LIMITS.hours, staffHourValue: FUNDRAISING_LIMITS.money, newDonors: '1000000000' });
  assert.deepEqual(maximum.metrics.staffTimeCost, known('1000000000000000000.00'));
  for (const currency of ['USD', 'GBP', 'EUR']) assert.equal(calculateFundraisingBudget({ ...fullBudget(), currency }).currency, currency);
});
test('calendar day arithmetic preserves leap/DST-independent dates and refuses real-date, offset and next-day overflow', async () => {
  assert.equal(addFundraisingDays('2028-02-28', 1), '2028-02-29'); assert.equal(addFundraisingDays('2100-02-28', 1), '2100-03-01');
  assert.equal(addFundraisingDays('2026-03-08', 1), '2026-03-09'); assert.equal(addFundraisingDays('2026-11-01', 1), '2026-11-02');
  for (const date of ['2026-02-29', '2100-02-29', '2026-04-31', '2026-2-01', '1899-12-31']) fail(() => addFundraisingDays(date, 0));
  fail(() => addFundraisingDays('9999-12-31', 1)); fail(() => addFundraisingDays('2026-01-01', -1));
  const p = raw(); p.campaignDate = '9999-12-31'; p.offsets = { acknowledgment: '0', welcome: '0', progress: '0', review: '0' }; await reject(() => prepareFundraisingPlan(p, NOW));
  await reject(() => prepareFundraisingPlan({ ...raw(), offsets: { ...raw().offsets, review: '3651' } }, NOW));
  await reject(() => prepareFundraisingPlan({ ...raw(), offsets: { ...raw().offsets, welcome: '' } }, NOW));
});
test('actual cryptographic UUID identifies one reviewed plan; separate Generate creates new IDs without guessed campaign identity', async () => {
  const p = await prepareFundraisingPlan(raw(), NOW), later = await prepareFundraisingPlan(raw(), '2026-10-29T04:00:00.000Z');
  assert.notDeepEqual(p.tasks.map(t => t.uid), later.tasks.map(t => t.uid)); assert.equal(new Set(p.tasks.map(t => t.uid)).size, 4);
  for (const task of p.tasks) assert.match(task.uid, /^charitology-fundraising-v1-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}-(?:acknowledgment|welcome|progress|review)@charitology\.org$/);
  assert.deepEqual(p.tasks.map(t => t.date), ['2028-02-28', '2028-03-02', '2028-03-29', '2028-05-28']);
  const changed = raw(); changed.offsets.welcome = '4'; const edited = await prepareFundraisingPlan(changed, NOW); assert.notEqual(edited.tasks[1].uid, p.tasks[1].uid); assert.equal(edited.tasks[1].date, '2028-03-03');
  const calendar = unfold(p.calendar); assert.match(calendar, /DTSTAMP:20261028T030405Z\r\n/); assert.match(calendar, /DTSTART;VALUE=DATE:20280228\r\nDTEND;VALUE=DATE:20280229/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 4); assert.equal((calendar.match(/STATUS:TENTATIVE/g) || []).length, 4);
  assert.doesNotMatch(calendar, /^(?:ATTENDEE|ORGANIZER|METHOD|URL):/m); assert.doesNotMatch(calendar.replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(p.markdown, /not evidence about|not a claim about/); assert.match(p.markdown, /not measure impact or establish causation/); assert.match(p.markdown, /No message, calendar import or Charity OS record/);
  assert.match(p.markdown, /not incremental acquisition cost/); assert.match(p.markdown, /Generating another plan creates new calendar identifiers/);
  const actual = globalThis.crypto; Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
  try { await reject(() => prepareFundraisingPlan(raw(), NOW)); } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: actual }); }
});
test('RFC5545 escaping and75-octet folding preserve Unicode and cannot inject new calendar properties or raw Markdown HTML', async () => {
  assert.equal(escapeFundraisingCalendarText('a\\b;c,d\r\ne'), 'a\\\\b\\;c\\,d\\ne');
  const line = 'DESCRIPTION:' + '🧭汉'.repeat(40), folded = foldFundraisingCalendarLine(line);
  assert.equal(folded.replaceAll('\r\n ', ''), line); for (const part of folded.split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75);
  const input = raw(); input.campaignTitle = '🧭汉'.repeat(40) + ';,[plan]<script>'; input.ownerRole = '=Role, with; punctuation\\';
  const p = await prepareFundraisingPlan(input, NOW), calendar = unfold(p.calendar);
  for (const part of p.calendar.split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75);
  assert.match(calendar, /SUMMARY:.*\\;\\,/); assert.doesNotMatch(p.markdown, /<script>/);
  for (const bad of ['Injected\r\nATTENDEE:mailto:x@example.invalid', '\u0000', '\ud800']) await reject(() => prepareFundraisingPlan({ ...raw(), ownerRole: bad }, NOW));
  await reject(() => prepareFundraisingPlan(raw(), '2026-02-30T00:00:00.000Z'));
  const maximum = raw(); maximum.campaignTitle = '🧭'.repeat(80); maximum.ownerRole = '汉'.repeat(120); maximum.offsets.review = '3650';
  const admitted = await prepareFundraisingPlan(maximum, NOW); assert.equal(admitted.ownerRole.length, 120); assert.ok(Buffer.byteLength(admitted.calendar) < FUNDRAISING_LIMITS.outputBytes);
  await reject(() => prepareFundraisingPlan({ ...maximum, campaignTitle: maximum.campaignTitle + 'x' }, NOW)); await reject(() => prepareFundraisingPlan({ ...maximum, ownerRole: maximum.ownerRole + 'x' }, NOW));
});

const repo = fileURLToPath(new URL('../../../', import.meta.url)), componentPath = join(repo, 'src/components/FundraisingPlanner.astro');
let html;
async function actualMarkup() {
  if (html) return html; const temporary = await mkdtemp(join(repo, 'node_modules/.fundraising-planner-'));
  try {
    const source = await readFile(componentPath, 'utf8'), compiled = await transform(source, { filename: componentPath, internalURL: 'astro/compiler-runtime', renderScript: true, resolvePath: async value => value });
    assert.equal(compiled.diagnostics.filter(d => d.severity === 1).length, 0);
    await build({ stdin: { contents: compiled.code.replace(/^import\s+"[^"]+\?astro&type=style[^"]*";$/gm, ''), loader: 'ts', resolveDir: join(repo, 'src/components') }, outfile: join(temporary, 'ssr.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const container = await AstroContainer.create(), Component = (await import(pathToFileURL(join(temporary, 'ssr.mjs')))).default; html = await container.renderToString(Component); return html;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
async function start() {
  const dom = installToolDom(await actualMarkup()), root = dom.$('#fundraising-planner'); let prints = 0; dom.window.print = () => { prints++; };
  const timers = [], revoked = [], schedule = dom.window.setTimeout; dom.window.setTimeout = (action, delay) => { const id = schedule(action, delay); timers.push({ action, delay, id }); return id; };
  URL.revokeObjectURL = url => revoked.push(url);
  const controller = mountFundraisingPlanner(root);
  const fill = async values => { for (const [key, value] of Object.entries(values)) if (key === 'offsets') { for (const [id, offset] of Object.entries(value)) await dom.set(`[data-offset="${id}"]`, offset); } else await dom.set(`[data-field="${key}"]`, value); };
  return { ...dom, controller, fill, timers, revoked, prints: () => prints };
}
test('actual Astro SSR is disabled and unnamed, then installs interception before enabling; all initial budget metrics remain unknown', async () => {
  const ssr = installToolDom(await actualMarkup()); assert.equal(ssr.$('[data-planner-controls]').disabled, true); assert.equal(ssr.$('form').querySelectorAll('[name]').length, 0);
  assert.equal(ssr.$('[data-planner-markdown]').disabled, true); assert.equal(ssr.$('[data-planner-reviewed]').checked, false);
  const dom = await start(); assert.equal(dom.$('[data-planner-controls]').disabled, false); assert.match(dom.$('[data-planner-budget]').textContent, /Unknown/);
  assert.match(dom.$('[data-planner-status]').textContent, /^Ready\./);
  const event = await dom.$('form').fire('submit'); assert.equal(event.defaultPrevented, true); assert.equal(dom.$('[data-planner-review]').hidden, true);
  assert.equal(dom.operations.length, 0); assert.equal(location.search, ''); assert.match(html, /https:\/\/os.charitology.org\/#module\/fundraising/); dom.controller.dispose();
});
test('actual mounted Generate shows exact text; acknowledgment gates both downloads/print and any edit revokes the reviewed payload', async () => {
  const dom = await start(); await dom.fill(raw()); await dom.$('form').fire('submit');
  const text = dom.$('[data-planner-preview]').value; assert.match(text, /USD 770.00/); assert.equal(dom.$('[data-planner-print-text]').textContent, text);
  assert.equal(dom.$('[data-planner-review]').hidden, false); await dom.$('[data-planner-markdown]').fire('click'); assert.equal(dom.downloads.length, 0);
  await dom.set('[data-planner-reviewed]', true, 'change'); assert.equal(dom.$('[data-planner-markdown]').disabled, false);
  await dom.$('[data-planner-markdown]').fire('click'); await dom.$('[data-planner-calendar]').fire('click'); await dom.$('[data-planner-print]').fire('click');
  assert.equal(await dom.downloads[0].text(), text); assert.equal(await dom.downloads[1].text(), dom.$('[data-planner-calendar-preview]').textContent); assert.match(dom.$('[data-planner-calendar-preview]').textContent, /DTSTAMP:/); assert.equal(dom.prints(), 1);
  await dom.$('[data-planner-calendar]').fire('click'); assert.equal(await dom.downloads[2].text(), await dom.downloads[1].text());
  assert.match(dom.$('[data-planner-status]').textContent, /Download requested/); assert.equal(dom.operations.length, 0);
  await dom.set('[data-field="cashCosts"]', 'invalid'); assert.equal(dom.$('[data-planner-markdown]').disabled, true); assert.equal(dom.$('[data-planner-preview]').value, ''); assert.equal(dom.$('[data-planner-calendar-preview]').textContent, '');
  assert.equal(dom.$('[data-field="cashCosts"]').value, 'invalid'); await dom.$('form').fire('submit'); assert.equal(dom.$('[data-field="cashCosts"]').value, 'invalid'); assert.equal(dom.downloads.length, 3); dom.controller.dispose();
});
test('native download handoff retains each bounded owned URL for10seconds, then releases only its timer/URL; hide/dispose/failure clean up', async () => {
  const dom = await start(); await dom.fill(raw()); await dom.$('form').fire('submit'); await dom.set('[data-planner-reviewed]', true, 'change');
  for (let i = 0; i < 9; i++) await dom.$('[data-planner-calendar]').fire('click');
  assert.equal(dom.downloads.length, 8); assert.equal(dom.revoked.length, 0); assert.equal(dom.timers.length, 8); assert.ok(dom.timers.every(t => t.delay === 10000));
  assert.match(dom.$('[data-planner-status]').textContent, /Eight downloads/);
  dom.timers[0].action(); assert.deepEqual(dom.revoked, ['blob:synthetic/1']); await dom.$('[data-planner-calendar]').fire('click'); assert.equal(dom.downloads.length, 9);
  await dom.window.fire('pagehide', { persisted: true }); assert.equal(new Set(dom.revoked).size, 9); assert.equal(dom.$('[data-planner-calendar-preview]').textContent, ''); assert.equal(dom.$('[data-field="campaignTitle"]').value, raw().campaignTitle);
  await dom.$('form').fire('submit'); await dom.set('[data-planner-reviewed]', true, 'change');
  const create = dom.document.createElement; dom.document.createElement = tag => { if (tag === 'a') throw Error('Synthetic native handoff failure'); return create(tag); };
  await dom.$('[data-planner-markdown]').fire('click'); assert.equal(new Set(dom.revoked).size, 10); assert.match(dom.$('[data-planner-status]').textContent, /could not be requested/);
  assert.ok(dom.$('[data-planner-preview]').value); dom.document.createElement = create;
  await dom.$('[data-planner-markdown]').fire('click'); dom.controller.dispose(); assert.equal(new Set(dom.revoked).size, 11);
});
test('actual native UUID plus microtask delivery cannot overwrite a newer form or revive review after suspend/dispose; fields stay local', async () => {
  const dom = await start(); await dom.fill(raw()); let entered = false;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => { const actual = nativeCrypto.randomUUID(); entered = true; queueMicrotask(() => { void dom.set('[data-field="campaignTitle"]', 'Newer unfinished title'); }); return actual; } } });
  try {
    await dom.$('form').fire('submit'); assert.equal(entered, true);
    assert.equal(dom.$('[data-planner-preview]').value, ''); assert.equal(dom.$('[data-field="campaignTitle"]').value, 'Newer unfinished title');
  } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto }); }
  await dom.$('form').fire('submit'); await dom.set('[data-planner-reviewed]', true, 'change');
  await dom.window.fire('pagehide', { persisted: true }); await dom.window.fire('pageshow', { persisted: true });
  assert.equal(dom.$('[data-field="campaignTitle"]').value, 'Newer unfinished title'); assert.equal(dom.$('[data-planner-review]').hidden, true);
  assert.equal(dom.$('[data-planner-controls]').disabled, false); await dom.$('form').fire('submit'); assert.equal(dom.$('[data-planner-review]').hidden, false);
  await dom.window.fire('pagehide', { persisted: false }); assert.equal(dom.$('#fundraising-planner').dataset.plannerReady, 'disposed'); assert.equal(dom.operations.length, 0);
});
test('native identifier unavailability and disposal during actual promise delivery retain raw fields without a downloadable plan', async () => {
  const unavailable = await start(); await unavailable.fill(raw());
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
  try { await unavailable.$('form').fire('submit'); assert.match(unavailable.$('[data-planner-status]').textContent, /unavailable/); assert.equal(unavailable.$('[data-field="campaignTitle"]').value, raw().campaignTitle); assert.equal(unavailable.$('[data-planner-markdown]').disabled, true); }
  finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto }); unavailable.controller.dispose(); }
  const disposed = await start(); await disposed.fill(raw());
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => { const value = nativeCrypto.randomUUID(); queueMicrotask(() => disposed.controller.dispose()); return value; } } });
  try { await disposed.$('form').fire('submit'); assert.equal(disposed.$('[data-planner-preview]').value, ''); assert.equal(disposed.$('[data-planner-calendar-preview]').textContent, ''); assert.equal(disposed.$('[data-field="campaignTitle"]').value, raw().campaignTitle); assert.equal(disposed.downloads.length, 0); }
  finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto }); disposed.controller.dispose(); }
});
test('actual declaration and component client entry compile strictly without alternate planner implementations', async () => {
  const temporary = await mkdtemp(join(repo, 'node_modules/.fundraising-types-'));
  try {
    await writeFile(join(temporary, 'actual.ts'), `import type {FundraisingRaw,FundraisingBudget,FundraisingPlan} from '${repo}/src/lib/fundraising/planner.mjs';import {calculateFundraisingBudget,prepareFundraisingPlan,mountFundraisingPlanner} from '${repo}/src/lib/fundraising/planner.mjs';declare const raw:FundraisingRaw;const budget:FundraisingBudget=calculateFundraisingBudget(raw);const plan:Promise<FundraisingPlan>=prepareFundraisingPlan(raw,'2026-10-28T03:04:05.006Z');declare const root:HTMLElement;mountFundraisingPlanner(root).dispose();void budget;void plan;`);
    const client = /<script>\n([\s\S]*?)\n<\/script>/.exec(await readFile(componentPath, 'utf8')); assert.ok(client);
    await writeFile(join(temporary, 'client.ts'), client[1].replace("'../lib/fundraising/planner.mjs'", `'${repo}/src/lib/fundraising/planner.mjs'`));
    const result = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--strict', '--noEmit', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM', join(temporary, 'actual.ts'), join(temporary, 'client.ts')], { cwd: repo, encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
