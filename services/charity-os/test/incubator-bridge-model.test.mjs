import test from 'node:test';
import assert from 'node:assert/strict';
import { compileIncubatorCandidates, validateIncubatorEvent, makeIncubatorEvent, validateIncubatorReceipt, foldIncubatorHistory, makeIncubatorBackup, validateIncubatorBackup, headPin, validateIncubatorMapping } from '../lib/incubator-bridge-model.mjs';
import { sourcePin } from '../lib/incubator-native.mjs';
import { incubatorSeal, incubatorHash as H } from '../lib/incubator-bridge-json.mjs';
import { sourceFixture, eventFixture, receiptFixture, entry, programRecord, nativeFixture, mapping, clone } from './incubator-fixtures.mjs';
const reseal = (domain, value) => { const v = clone(value); delete v.sha256; return incubatorSeal(domain, v); };
function graph() { const source = sourceFixture(), event = eventFixture(source); return { source, event, sources: [source], events: [entry(event)] }; }
test('compiler creates exactly two editable planned records and explicit parent, independent of source status/owner', () => {
  const { event } = graph(), [p, m] = event.candidates; assert.equal(p.data.kind, 'project'); assert.equal(m.data.kind, 'milestone'); assert.equal(m.data.projectId, p.id); assert.equal(p.data.title, 'Authored project'); assert.equal(m.data.deliverable, 'Review the proposal.');
  for (const c of event.candidates) { assert.equal(c.ownerId, 'acting-member'); assert.equal(c.lastEditedBy, c.ownerId); assert.equal(c.status, 'planned'); assert.equal(c.revision, 1); assert.equal(c.approval, null); assert.equal(c.snapshot, null); assert.equal(c.source, null); assert.equal(c.data.dueAt, null); assert.equal(c.data.timeZone, null); assert.deepEqual(c.data.dependencyIds, []); }
});
test('only current same-org program kind is required, without new approval gate; IDs must be fresh', () => {
  const program = programRecord(), args = { orgId: 'org-a', actorId: 'member', programId: program.id, projectId: 'new-p', milestoneId: 'new-m', mapping, records: [program] };
  assert.equal(compileIncubatorCandidates(args).length, 2);
  for (const p of [{ ...program, orgId: 'other' }, { ...program, data: { ...program.data, kind: 'assumption' } }, { ...program, deletedAt: '2026-11-07T00:00:00.000Z' }]) assert.throws(() => compileIncubatorCandidates({ ...args, records: [p] }));
  assert.throws(() => compileIncubatorCandidates({ ...args, milestoneId: 'new-p' })); assert.throws(() => compileIncubatorCandidates({ ...args, records: [...args.records, { id: 'new-p' }] }));
});
test('explicit relationship, exact target normalization and bounded authored interpretations are mandatory', () => {
  for (const change of [m => { m.relationship.confirmed = false; }, m => { m.relationship.reason = ''; }, m => { m.project.title = 'x'.repeat(181); }, m => { m.milestone.deliverable = 'x'.repeat(4001); }, m => { m.ownerId = 'source-owner'; }]) { const v = clone(mapping); change(v); assert.throws(() => validateIncubatorMapping(v)); }
  const { event } = graph();
  for (const change of [e => { e.candidates[1].data.projectId = 'not-selected'; }, e => { e.candidates[0].status = 'done'; }, e => { e.candidates[0].ownerId = 'source-owner'; }, e => { e.candidates[1].data.dueAt = '2099-01-02T00:00:00Z'; }, e => { e.candidates.push(clone(e.candidates[0])); }, e => { e.candidates[0].data.title = 'Unreviewed change'; }]) { const v = clone(event); change(v); assert.throws(() => validateIncubatorEvent(reseal('event', v))); }
});
test('compact receipt does not duplicate two full 4,000-unit deliverables', () => {
  const s = sourceFixture(), authored = clone(mapping); authored.project.deliverable = '中'.repeat(4000); authored.milestone.deliverable = '界'.repeat(4000); const e = eventFixture(s, { authored });
  const r = receiptFixture(e); assert(Buffer.byteLength(JSON.stringify(e)) > 24000); assert(Buffer.byteLength(JSON.stringify(r)) < 8192); assert.equal(JSON.stringify(r).includes('中'), false); assert.equal(JSON.stringify(r).includes('界'), false); assert.deepEqual(validateIncubatorReceipt(r, e), r);
  const bad = clone(r); bad.result.created[1].dataSha256 = H('candidate-data', 'wrong'); assert.throws(() => validateIncubatorReceipt(bad, e));
});
test('refresh retains complete native chain, changed-unselected facts and old target data without synchronization', () => {
  const g = graph(), n = nativeFixture(); n.context.privacy = 'Changed exact context';
  const s2 = sourceFixture({ native: n, version: 2, previous: sourcePin(g.source) }), e2 = eventFixture(s2, { sequence: 2, previous: headPin(g.event), operation: 'refresh-copy', suffix: 'two' });
  const folded = foldIncubatorHistory({ sources: [s2, g.source], events: [entry(e2, 'live', 'two'), ...g.events] }); assert.equal(folded.bindings.length, 1); assert.equal(folded.bindings[0].nativeSources.length, 2); assert.deepEqual(folded.bindings[0].head, headPin(e2)); assert.equal(g.event.candidates[0].id, 'project-one');
  const sameRaw = sourceFixture({ version: 2, previous: sourcePin(g.source) }), sameEvent = eventFixture(sameRaw, { sequence: 2, previous: headPin(g.event), operation: 'refresh-copy', suffix: 'same' }); assert.throws(() => foldIncubatorHistory({ sources: [g.source, sameRaw], events: [...g.events, entry(sameEvent, 'live', 'same')] }));
});
test('adoption keeps historical source, has no phantom capture, and first real identical upload is allowed', () => {
  const g = graph(), recovered = entry(g.event, 'recovered'), adopted = eventFixture(g.source, { org: 'org-b', binding: 'adopted', operation: 'adopt', recoveredHead: headPin(g.event), suffix: 'adopted' });
  const live = entry(adopted, 'live', 'adopted'), first = foldIncubatorHistory({ sources: g.sources, events: [recovered, live] }); assert.equal(first.bindings.find(b => b.originOrgId === 'org-b').nativeSources.length, 0);
  const uploaded = sourceFixture({ org: 'org-b', binding: 'adopted' }); assert.equal(uploaded.originalSha256, g.source.originalSha256);
  const refreshed = eventFixture(uploaded, { org: 'org-b', binding: 'adopted', sequence: 2, previous: headPin(adopted), operation: 'refresh-copy', suffix: 'revalidated' });
  const all = foldIncubatorHistory({ sources: [...g.sources, uploaded], events: [recovered, live, entry(refreshed, 'live', 'revalidated')] }); assert.equal(all.bindings.find(b => b.originOrgId === 'org-b').nativeSources.length, 1);
  assert.throws(() => foldIncubatorHistory({ sources: g.sources, events: [entry(g.event), live] }));
});
test('missing parents, forks, orphan captures, stale adoption heads and duplicate target/command identities refuse', () => {
  const g = graph(); const n = nativeFixture(); n.context.privacy = 'Changed'; const s2 = sourceFixture({ native: n, version: 2, previous: sourcePin(g.source) }), e2 = eventFixture(s2, { sequence: 2, previous: headPin(g.event), operation: 'refresh-copy', suffix: 'two' });
  assert.throws(() => foldIncubatorHistory({ sources: [s2], events: [entry(e2, 'live', 'two')] }));
  assert.throws(() => foldIncubatorHistory({ sources: [...g.sources, s2], events: g.events }));
  const fork = eventFixture(s2, { sequence: 2, previous: headPin(g.event), operation: 'refresh-copy', suffix: 'fork' }); assert.throws(() => foldIncubatorHistory({ sources: [...g.sources, s2], events: [...g.events, entry(e2, 'live', 'two'), entry(fork, 'live', 'fork')] }));
  const reused = eventFixture(s2, { sequence: 2, previous: headPin(g.event), operation: 'refresh-copy' }); assert.throws(() => foldIncubatorHistory({ sources: [...g.sources, s2], events: [...g.events, entry(reused, 'live', 'reused')] }));
  const commandDup = entry(e2, 'live', 'one'); assert.throws(() => foldIncubatorHistory({ sources: [...g.sources, s2], events: [...g.events, commandDup] }));
  assert.throws(() => foldIncubatorHistory({ sources: g.sources, events: [{ ...g.events[0], acceptedReceipt: null }] }));
});
test('whole backup preserves ordinary later edits/trash and historical pin, but rejects module identity substitution', () => {
  const g = graph(), changed = { ...g.event.candidates[0], data: { arbitrary: 'ordinary edited data' }, revision: 200, status: 'cancelled' };
  const b = makeIncubatorBackup({ sources: g.sources, events: g.events }, { records: [changed] }); assert.deepEqual(validateIncubatorBackup(b, { trash: [changed] }), b);
  assert.throws(() => validateIncubatorBackup(b, { records: [{ ...changed, moduleId: 'contacts' }] }));
  const recovered = makeIncubatorBackup({ sources: g.sources, events: [{ ...g.events[0], originMode: 'recovered' }] }); assert.equal(foldIncubatorHistory({ sources: recovered.sources, events: recovered.events }).bindings[0].originMode, 'recovered');
  const bad = clone(b); bad.registrySha256 = '0'.repeat(64); assert.throws(() => validateIncubatorBackup(bad));
});
test('source/event own checksum omission does not omit nested pins; inherited or extra fields refuse', () => {
  const g = graph(), changed = clone(g.event); changed.program.dataSha256 = H('program-data', 'different'); assert.throws(() => validateIncubatorEvent(changed));
  changed.sha256 = reseal('event', changed).sha256; assert.notEqual(changed.sha256, g.event.sha256); assert.deepEqual(validateIncubatorEvent(changed), changed);
  assert.throws(() => makeIncubatorEvent({ ...clone(g.event), extra: true }));
  const inherited = Object.create(g.event); assert.throws(() => validateIncubatorEvent(inherited));
});
test('all recovered branches count toward40; only20 can be live, and source/event ceilings refuse', () => {
  const sources = [], events = [];
  for (let i = 0; i < 41; i++) {
    const binding = 'branch-' + i, source = sourceFixture({ binding }), event = eventFixture(source, { binding, suffix: binding });
    sources.push(source); events.push(entry(event, 'recovered', binding));
  }
  assert.equal(foldIncubatorHistory({ sources: sources.slice(0, 40), events: events.slice(0, 40) }).bindings.length, 40);
  assert.throws(() => foldIncubatorHistory({ sources, events }));
  const live = events.slice(0, 21).map(e => ({ ...e, originMode: 'live' }));
  assert.equal(foldIncubatorHistory({ sources: sources.slice(0, 20), events: live.slice(0, 20) }).bindings.length, 20);
  assert.throws(() => foldIncubatorHistory({ sources: sources.slice(0, 21), events: live }));
  assert.throws(() => sourceFixture({ version: 9 }));
  assert.throws(() => eventFixture(sources[0], { sequence: 9 }));
  assert.throws(() => foldIncubatorHistory({ sources: [], events: Array(1001).fill(null) }));
});
