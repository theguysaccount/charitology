// Actual Astro renderer and optional mounted controller, with fictional display
// props only. This creates no source seed, admitted history or browser evidence.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { parse } from 'parse5';
import postcss from 'postcss';
import { Element as BaseElement } from '../test-fixtures/artifact-results/ui-dom.mjs';
import { recordHash } from '../src/lib/disaster-incidents/canonical.mjs';
import { deviceWarning } from '../src/lib/disaster-incidents/projection.mjs';
import { DISASTER_FILTER_DEFAULTS, disasterDeskFragment, parseDisasterDeskFragment, disasterDeviceWarning, mountDisasterDesk } from '../src/scripts/disaster-desk.js';
let groups = 0;
const check = async (name, fn) => { await fn(); groups++; console.log(`✓ ${name}`); };
const hash = 'a'.repeat(64), pin = (kind, id, version = 1) => ({ kind, id, version, hash });
const base = (kind, id, extra = {}) => ({ format: 'charitology-disaster-record', schemaVersion: 1, kind, id, version: 1, previous: null, hash, review: 'draft', ...extra });
const geo = { countries: [{ code: 'US', reportedName: 'Fictional country' }], areas: ['Fictional area'], note: 'Fictional geography only.' };
const period = { start: null, end: null, literal: 'August 2023 (month only)' };
const s = base('source', 'fictional-source', { descriptor: 'fictional-private-only', publisher: 'Fictional publisher', title: 'Fictional source <img src=x onerror=bad()>', requestedUrl: 'https://fictional.example.invalid/original', finalUrl: 'https://fictional.example.invalid/original', retrievedAt: '2026-10-20T00:00:00.000Z', access: { outcome: 'retrieved', httpStatus: 200 }, original: { mediaType: 'application/pdf', responseContentType: 'application/octet-stream', bytes: 100, sha256: hash }, published: { kind: 'day', day: '2025-11-03', literal: '03/11/2025', mapping: 'day-month-year' }, sourceUpdated: null, documentCreated: { kind: 'instant', instant: '2026-06-01T13:20:49.000Z', literal: '2026-06-01T15:20:49+02', reportedOffset: '+02:00', mapping: 'pdf-metadata' }, documentModified: null, dateDiscrepancy: 'Document metadata is separate from the printed issue day.', literalFields: [{ name: 'Fictional literal', value: '0' }], publicNote: { path: 'notes/fictional-source/v1.json', bytes: 100, sha256: hash }, disposition: 'external-original-only', rights: { reuse: 'unknown-not-granted', publicOriginal: false, attribution: 'Fictional attribution', termsUrl: null, reason: 'No original body or reuse grant is provided.' }, evidence: 'source-self-report', limitations: ['Fictional fixture, not source evidence.'] });
const sp = pin('source', s.id), ref = (item, role = 'statement') => ({ source: sp, item, role });
const target = { kind: 'response-operation', incidentId: 'fictional-quake', issuer: 'Fictional issuer', code: 'FICT-1', originalUrl: 'https://fictional.example.invalid/operation' };
const note = { format: 'charitology-disaster-source-note', schemaVersion: 1, sourceId: s.id, sourceVersion: 1, originalSha256: hash, rights: 'charitology-authored-factual-note-only', review: 'draft', limitations: ['Fictional note only.'], items: [
        { id: 'operation-status', target, authoredText: 'The fictional operation reports ended.', locator: { kind: 'pdf', pdfPage: 2, printedPage: '1', headings: ['Fictional final report'], row: [], column: [], shortQuote: null }, roles: ['status'], basis: 'source-self-report', status: { targetKind: 'response-operation', value: 'ended' } },
        { id: 'quantity', target, authoredText: 'A fictional reported quantity is zero.', locator: { kind: 'html', headings: ['Fictional quantity'], paragraph: 3, shortQuote: null }, roles: ['statement'], basis: 'source-self-report', status: null },
        { id: 'json-locator', target, authoredText: 'Fictional JSON locator.', locator: { kind: 'json', pointer: '/value', expectedLiteral: '0' }, roles: ['statement'], basis: 'source-self-report', status: null },
        { id: 'metadata-locator', target, authoredText: 'Fictional metadata observation.', locator: { kind: 'metadata', field: 'pdf-created', parser: 'fictional parser 1', observedLiteral: '2026-06-01T15:20:49+02' }, roles: ['date-discrepancy'], basis: 'source-self-report', status: null },
    ] };
const incident = (id, name, hazard, placement) => { const i = base('incident', id, { name, hazard, identifiers: [], geography: structuredClone(geo), period: structuredClone(period), lifecycle: { value: 'unknown', refs: [], uncertainty: 'Incident-wide end is not established.' }, editorial: { placement, decidedAt: '2026-10-20T00:00:00.000Z', reason: 'Fictional editorial placement.' }, checkedAt: '2026-10-20T00:00:00.000Z', recheckAfter: '2026-10-28T00:00:00.000Z', reviewRationale: 'Fictional explicit recheck.', refs: [], limitations: ['No real incident is seeded.'] }); i.hash = recordHash('incident', i); return i; };
const first = incident('fictional-quake', 'Fictional quake', 'earthquake', 'archive'), second = incident('fictional-fire', 'F'.repeat(120), 'wildfire', 'follow-up');
const oldClaim = pin('claim', 'fictional-quantity', 1), oldIncident = pin('incident', first.id, 1);
const common = { incidentId: first.id, target, sector: { editorial: 'shelter', literal: 'Fictional shelter', reason: 'Editorial classification.' }, geography: geo, period, standing: { value: 'reported', reason: 'Attributed only.', related: [] }, refs: [], limitations: ['Fictional statement only.'], evidence: 'source-self-report' };
const quantity = base('claim', 'fictional-quantity', { ...common, version: 2, previous: oldClaim, attributedSummary: 'Fictional <script>bad()</script> zero statement.', content: { kind: 'reported-need', quantity: { reportedText: '0', unit: null, currency: null, definition: null, refs: [ref('quantity')] } } });
const ended = base('claim', 'fictional-ended', { ...common, attributedSummary: 'This operation ended; the incident remains unknown.', content: { kind: 'status', value: 'ended' }, refs: [ref('operation-status', 'status')] });
const unknown = base('claim', 'fictional-unknown', { ...common, target: { ...target, kind: 'appeal' }, attributedSummary: 'Appeal status was not collected.', content: { kind: 'status', value: 'unknown' } });
const correction = base('claim', 'fictional-correction', { ...common, attributedSummary: 'Fictional correction.', content: { kind: 'correction', corrects: oldClaim, reason: 'Fictional correction reason.' }, standing: { value: 'corrected', reason: 'Fictional standing.', related: [oldClaim] } });
first.version = 2;
first.previous = oldIncident;
first.hash = recordHash('incident', first);
const edition = base('edition', 'fictional-edition', { asOf: '2026-10-27T00:00:00.000Z', capturedAt: '2026-10-27T01:00:00.000Z', interpretation: pin('method', 'fictional-method'), sourceCommit: 'b'.repeat(40), incidents: [{ ...oldIncident, version: 2, hash: first.hash }, pin('incident', second.id)], claims: [{ ...oldClaim, version: 2 }, pin('claim', ended.id), pin('claim', unknown.id), pin('claim', correction.id)], sources: [sp], coverage: { geography: ['Fictional area'], hazards: ['earthquake', 'wildfire'], sectors: ['shelter'], omitted: ['All other incidents are uncollected.'], accessibilityChecks: [], worldwideCurrentCoverage: 'not-established', currentNeedsVerification: 'not-established' }, changes: [{ kind: 'revised', before: oldIncident, after: { ...oldIncident, version: 2, hash: first.hash }, reason: 'Fictional changed version.' }], limitations: ['Not live or worldwide coverage.'] });
const previousEdition = { ...structuredClone(edition), id: 'fictional-old-edition', incidents: [oldIncident], claims: [oldClaim] };
const packet = { format: 'charitology-disaster-packet', schemaVersion: 1, scope: { kind: 'complete-edition' }, edition, method: base('method', 'fictional-method', { sourceCommit: 'b'.repeat(40), sourceFiles: [], adapter: 'bounded-issuer-note-v1', canonicalEncoding: 'DI-C14N-1', taxonomy: { hazards: ['wildfire', 'earthquake'], sectors: ['shelter'] }, rules: ['Fictional rendering rule.'] }), incidents: [first, second], claims: [quantity, ended, unknown, correction], sources: [s], notes: [{ file: s.publicNote, value: note }], boundaryPins: [], limitations: ['Fictional display fixture; not admitted history.'] };
const projection = { packet, incidents: packet.incidents.map(i => ({ incident: i, freshness: { asOf: edition.asOf, checkedAt: i.checkedAt, recheckAfter: i.recheckAfter, atCapture: 'not-due-at-capture' }, claims: packet.claims.filter(c => c.incidentId === i.id) })), coverage: edition.coverage, warning: 'Not live. Fictional renderer fixture.', asOf: edition.asOf, capturedAt: edition.capturedAt, editionId: edition.id };
globalThis.__disasterUiData = { selected: { projection }, editions: [{ projection: { packet: { edition: previousEdition } } }, { projection: { packet: { edition } } }] };
class Element extends BaseElement {
    setAttribute(k, v) { super.setAttribute(k, v); if (k.startsWith('data-'))
        this.dataset[k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = String(v); if (k === 'hidden')
        this.hidden = true; if (k === 'href')
        this.href = String(v); }
    matches(selector) { const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector); return m ? this.attributes.has(m[1]) && (m[2] === undefined || this.getAttribute(m[1]) === m[2]) : super.matches(selector); }
    closest(selector) { let e = this; while (e) {
        if (e.matches(selector))
            return e;
        e = e.parentNode;
    } return null; }
    removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(v => v !== fn)); }
}
function dom(html) { const document = new Element('#document'); function visit(n, p) { if (n.nodeName === '#text') {
    p.append(new Element('#text', n.value));
    return;
} const e = n.tagName ? new Element(n.tagName) : p; if (e !== p) {
    for (const a of n.attrs || [])
        e.setAttribute(a.name, a.value);
    p.append(e);
} for (const c of n.childNodes || [])
    visit(c, e); } visit(parse(html), document); return document; }
function mounted(html, hash = '') { const document = dom(html), root = document.querySelector('[data-disaster-desk]'), window = new Element('window'); window.location = new URL('https://fictional.example.invalid/charitology/disasters/' + hash); window.history = { state: null, replaceState(_s, _t, href) { window.location.href = new URL(href, window.location.href).href; } }; const copied = [], navigator = { clipboard: { async writeText(value) { copied.push(value); } } }; const workspace = mountDisasterDesk(root, { window, navigator, readClock: () => '2026-10-28T00:00:00.000Z' }); return { document, root, window, copied, workspace }; }
const temporary = await mkdtemp(join(resolve('node_modules'), '.disaster-ui-'));
try {
    const plugin = { name: 'actual-astro-fictional-props', setup(b) { b.onResolve({ filter: /disaster-incidents\/public\.mjs$/ }, () => ({ path: 'fixture-loader', namespace: 'disaster-ui' })); b.onLoad({ filter: /.*/, namespace: 'disaster-ui' }, () => ({ contents: 'export const loadDisasters=()=>globalThis.__disasterUiData;', loader: 'js' })); b.onLoad({ filter: /\.astro$/ }, async (args) => { const compiled = await transform(await readFile(args.path, 'utf8'), { filename: args.path, internalURL: 'astro/compiler-runtime', renderScript: true, resolvePath: async (s) => s }); assert.equal(compiled.diagnostics.filter(d => d.severity === 1).length, 0, args.path); return { contents: compiled.code, loader: 'ts', resolveDir: dirname(args.path) }; }); } };
    const loaded = {};
    for (const [name, file] of [['desk', 'src/components/DisasterDesk.astro'], ['guide', 'src/components/tools/disaster-response-guide.astro']]) {
        const output = join(temporary, name + '.mjs');
        await build({ entryPoints: [file], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [plugin], loader: { '.css': 'empty' }, define: { 'import.meta.env.BASE_URL': '"/charitology/"' }, logLevel: 'silent' });
        loaded[name] = (await import(pathToFileURL(output))).default;
    }
    const container = await AstroContainer.create(), render = (props = {}) => container.renderToString(loaded.desk, { props: { projection, editions: [previousEdition, edition], ...props } }), html = await render();
    await check('actual Astro keeps dates, distinct states, unknowns and zero without a device clock', () => { assert.ok(html.includes(edition.asOf) && html.includes(edition.capturedAt)); assert.match(html, /unknown<\/strong> · not established by this capture/); assert.match(html, /Reported operation status: ended/); assert.match(html, /appeal status: unknown \(not collected in this capture\)/); assert.doesNotMatch(html, /Reported appeal status: unknown/); assert.match(html, /<strong>0<\/strong>; unit: unknown/); assert.ok(html.includes('All other incidents are uncollected.')); });
    await check('script-free sources retain exact date literals, all locator shapes and rights limits', () => { for (const text of ['03/11/2025', '2026-06-01T15:20:49+02', 'application/octet-stream', 'PDF page 2', 'HTML headings:', 'JSON pointer: /value', 'parser: fictional parser 1', 'Original bodies remain external-only.', 'No original body or reuse grant'])
        assert.ok(html.includes(text), text); assert.match(html, /Quantity source fictional-source, version 1 · quantity/); assert.ok(html.includes('href="/charitology/disasters/editions/fictional-edition/coverage.json"')); assert.ok(html.includes('RFC 4180')); });
    await check('actual Astro escapes authored text and source titles without executable source HTML', () => { assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;')); assert.ok(html.includes('&lt;img src=x onerror=bad()&gt;')); const d = dom(html); assert.equal(d.querySelectorAll('img').length, 0); assert.ok(!d.querySelectorAll('script').some(e => e.textContent.includes('bad()'))); });
    await check('previous incident/claim, correction and standing pins link exact fixed editions', () => { assert.ok(html.includes('href="/charitology/disasters/editions/fictional-old-edition/incidents/fictional-quake/"')); const expected = 'href="/charitology/disasters/editions/fictional-old-edition/#dd-claim-fictional-quantity-v1"'; assert.ok(html.split(expected).length >= 4); });
    await check('historical source view uses its own retrieval evidence without selected-edition freshness', async () => { const old = { ...structuredClone(s), version: 2, previous: sp, retrievedAt: '2020-02-01T00:00:00.000Z' }; const h = await render({ view: 'source', source: old, sourceNote: { ...note, sourceVersion: 2 } }); assert.ok(h.includes(old.retrievedAt)); assert.doesNotMatch(h, /As of this capture:<\/strong>/); assert.doesNotMatch(h, /data-dd-incident[\s>]/); assert.ok(h.includes('does not place this historical source in the selected edition')); assert.ok(h.includes('/disasters/sources/fictional-source/1/')); });
    await check('unavailable source keeps null dates unknown without asserting publisher nonreporting', async () => {
        const source = { ...structuredClone(s), access: { outcome: 'unavailable', httpStatus: null }, original: null, published: null, sourceUpdated: null, documentCreated: null, documentModified: null, dateDiscrepancy: null, literalFields: [] };
        const h = await render({ view: 'source', source, sourceNote: { ...note, items: [] } });
        assert.ok(h.includes('body was unavailable'));
        assert.ok(h.includes('no new factual statement or zero-needs conclusion'));
        assert.ok(h.includes('No body retained for this attempt.'));
        for (const label of ['Published', 'Publisher source update', 'Document created metadata', 'Document modified metadata'])
            assert.ok(h.includes(`<dt>${label}</dt><dd>Unknown (not collected in this capture)</dd>`), label);
        assert.doesNotMatch(h, /Unknown \(not reported\)/);
    });
    await check('strict edition fragments round-trip exact text and refuse complete malformed inputs', () => { const f = { ...DISASTER_FILTER_DEFAULTS, q: 'zero + 🌱' }, fragment = disasterDeskFragment(edition.id, f); assert.deepEqual(parseDisasterDeskFragment(fragment, edition.id), { kind: 'ready', editionId: edition.id, filters: f }); const invalid = [fragment + '&q=x', fragment.replace('hazard=all', 'hazard=alien'), fragment.replace('q=', 'extra='), '#disaster-desk/edition/' + edition.id + '?q=%E0%A4', fragment.replace('q=zero+%2B+%F0%9F%8C%B1', 'q=%ED%A0%80'), fragment.replace('q=zero+%2B+%F0%9F%8C%B1', 'q=' + 'x'.repeat(121)), fragment + 'x'.repeat(2049)]; for (const value of invalid)
        assert.equal(parseDisasterDeskFragment(value, edition.id)?.kind, 'invalid'); assert.throws(() => disasterDeskFragment(edition.id, { ...f, q: '\ud800' })); assert.equal(parseDisasterDeskFragment(fragment, 'other-edition').kind, 'different-edition'); });
    await check('fragment field order and alternate encodings fail closed', () => {
        const fragment = disasterDeskFragment(edition.id, { ...DISASTER_FILTER_DEFAULTS, q: 'a b' });
        for (const value of [fragment.replace('q=a+b', 'q=a%20b'), fragment.replace('hazard=all&sector=all', 'sector=all&hazard=all'), fragment.replace('hazard=all', '%68azard=all'), fragment.replace('q=a+b', 'q=%61+b'), fragment + '&q='])
            assert.equal(parseDisasterDeskFragment(value, edition.id).kind, 'invalid');
    });
    await check('mounted filters and share links stay in one exact edition and retain no planner state', async () => { const m = mounted(html), q = m.root.querySelector('[data-dd-filter="q"]'); q.value = 'quake'; await q.fire('input'); assert.equal(m.root.querySelectorAll('[data-dd-incident]').filter(e => !e.hidden).length, 1); const share = m.root.querySelector('[data-dd-share]').href; assert.ok(share.startsWith('https://fictional.example.invalid/charitology/disasters/editions/fictional-edition/#disaster-desk/edition/fictional-edition?')); await m.root.querySelector('[data-dd-copy-share]').click(); assert.equal(m.copied[0], share); await m.root.querySelector('[data-dd-reset]').click(); assert.equal(m.root.querySelectorAll('[data-dd-incident]').filter(e => !e.hidden).length, 2); m.workspace.dispose(); });
    await check('mismatched edition and invalid fragment never partly apply or follow a new head', async () => { const m = mounted(html), q = m.root.querySelector('[data-dd-filter="q"]'); q.value = 'quake'; await q.fire('input'); m.window.location.hash = disasterDeskFragment('fictional-old-edition', { ...DISASTER_FILTER_DEFAULTS, q: 'fire' }); await m.window.fire('hashchange'); assert.equal(q.value, 'quake'); const exact = m.root.querySelector('[data-dd-exact-edition]'); assert.equal(exact.hidden, false); assert.ok(exact.href.includes('/editions/fictional-old-edition/')); m.window.location.hash = '#disaster-desk/edition/bad?q=%E0%A4'; await m.window.fire('hashchange'); assert.equal(q.value, 'quake'); assert.match(m.root.querySelector('[data-dd-fragment-status]').textContent, /refused/); m.workspace.dispose(); });
    await check('disposed controller detaches listeners and refuses stale fragments', async () => {
        const m = mounted(html), q = m.root.querySelector('[data-dd-filter="q"]');
        m.workspace.dispose();
        q.value = 'quake';
        await q.fire('input');
        assert.equal(m.root.querySelectorAll('[data-dd-incident]').filter(e => !e.hidden).length, 2);
        m.window.location.hash = disasterDeskFragment(edition.id, { ...DISASTER_FILTER_DEFAULTS, q: 'quake' });
        await m.window.fire('hashchange');
        m.workspace.readFragment();
        assert.equal(m.root.querySelectorAll('[data-dd-incident]').filter(e => !e.hidden).length, 2);
        assert.equal((m.window.listeners.get('hashchange') || []).length, 0);
    });
    await check('qualified device display matches core at the exact deadline and refuses normalization', async () => { const small = packet.incidents.map(i => ({ id: i.id, checkedAt: i.checkedAt, recheckAfter: i.recheckAfter })); for (const clock of ['2026-10-28T00:00:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-28T02:00:00.000+02:00', '2026-02-30T00:00:00.000Z', null])
        assert.deepEqual(disasterDeviceWarning(small, edition.asOf, clock), deviceWarning(packet.incidents, edition.asOf, clock)); const m = mounted(html); await m.root.querySelector('[data-dd-check-clock]').click(); assert.match(m.root.querySelector('[data-dd-device-status]').textContent, /not a verified current-time or source check/); assert.match(m.root.querySelector('[data-dd-device-status]').textContent, /2 retained incident review deadlines appear overdue/); m.workspace.dispose(); });
    await check('explicit 120-unit label copy and planner links never write or fill the planner', async () => { const guide = await container.renderToString(loaded.guide), m = mounted(guide), tool = m.document.querySelector('.tool'); assert.ok(m.root && !tool.querySelector('[data-disaster-desk]')); const before = tool.querySelectorAll('input').map(e => [e.getAttribute('id'), e.value]); for (const button of m.root.querySelectorAll('[data-dd-copy-label]'))
        await button.click(); assert.equal(m.copied.at(-1), 'F'.repeat(120)); assert.deepEqual(tool.querySelectorAll('input').map(e => [e.getAttribute('id'), e.value]), before); for (const a of m.root.querySelectorAll('a').filter(e => e.textContent === 'Open gift planner'))
        assert.equal(new URL(a.href, 'https://fictional.example.invalid').hash, '#dr-planner'); m.workspace.dispose(); });
    await check('D1 runtime source remains byte exact and optional controls use no storage/network', async () => { const old = execFileSync('git', ['show', 'c0d509a0e132e91b7f5d6b764eabce421015b125:src/components/tools/disaster-response-guide.astro'], { encoding: 'utf8' }), current = await readFile('src/components/tools/disaster-response-guide.astro', 'utf8'); assert.equal(current.slice(current.indexOf('<script>')), old.slice(old.indexOf('<script>'))); const code = await readFile('src/scripts/disaster-desk.js', 'utf8'), css = await readFile('src/styles/disaster-desk.css', 'utf8'); assert.doesNotMatch(code, /\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket)\b|#dr-(?:what|amount)|disaster-plan/); assert.doesNotThrow(() => postcss.parse(css)); });
}
finally {
    await rm(temporary, { recursive: true, force: true });
    delete globalThis.__disasterUiData;
}
console.log(`${groups} actual Disaster Astro/controller groups passed; fictional props only, no source seed or browser acceptance.`);
