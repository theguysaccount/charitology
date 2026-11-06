import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelPayloadCoordinator, assertModelPayloadCoordinator } from './payload-lane.mjs';
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test('owned coordinator accepts only its own currently active lease; structural, cross-lane and expired leases refuse', async () => {
  const a = createModelPayloadCoordinator(), b = createModelPayloadCoordinator(); let expired;
  assert.equal(assertModelPayloadCoordinator(a), a); assert.throws(() => assertModelPayloadCoordinator({ ...a }));
  await a.run(() => true, async lease => {
    expired = lease;
    assert.equal(await a.run(() => true, async () => 7, lease), 7);
    await assert.rejects(b.run(() => true, async () => 0, lease), TypeError);
    await assert.rejects(a.run(() => true, async () => 0, {}), TypeError);
  });
  await assert.rejects(a.run(() => true, async () => 0, expired), TypeError);
});
test('one physical slot retains only latest current queued work and a stale queued caller cannot cancel a newer current entry', async () => {
  const lane = createModelPayloadCoordinator(), held = deferred(), calls = [];
  const a = lane.run(() => true, async () => { calls.push('a'); await held.promise; return 'a'; });
  const b = lane.run(() => true, async () => { calls.push('b'); return 'b'; });
  const c = lane.run(() => true, async () => { calls.push('c'); return 'c'; });
  assert.equal(lane.isCancelled(await b), true);
  assert.equal(lane.isCancelled(await lane.run(() => false, async () => { throw Error('never'); })), true);
  assert.deepEqual(calls, ['a']); held.resolve(); assert.equal(await a, 'a'); assert.equal(await c, 'c');
  assert.deepEqual(calls, ['a', 'c']); await turn(); assert.deepEqual(lane.snapshot(), { busy: false, queued: false });
});
test('outer cancellation can deliver immediately while a registered nonabortable nested child keeps the physical lease occupied', async () => {
  const lane = createModelPayloadCoordinator(), held = deferred(), started = deferred(); let current = true, lease, child;
  const outer = lane.run(() => current, async owned => {
    lease = owned;
    child = lane.run(() => current, async () => { started.resolve(); await held.promise; return 3; }, owned);
    await started.promise;
    return 'delivery-cancelled'; // Like a worker's already-cancelled public promise.
  });
  assert.equal(await outer, 'delivery-cancelled'); current = false;
  assert.equal(lane.snapshot().busy, true);
  await assert.rejects(lane.run(() => true, async () => 0, lease), TypeError);
  let nextStarted = false; const next = lane.run(() => true, async () => { nextStarted = true; return 5; });
  await turn(); assert.equal(nextStarted, false); held.resolve(); assert.equal(await child, 3); assert.equal(await next, 5);
});
test('nested rejection and cancellation between nested phases never leak a lease or manufacture a queued calculation', async () => {
  const lane = createModelPayloadCoordinator(), held = deferred(), started = deferred(); let current = true;
  const root = lane.run(() => current, async lease => {
    await lane.run(() => current, async () => { started.resolve(); await held.promise; }, lease);
    return lane.run(() => current, async () => { throw Error('must not start'); }, lease);
  });
  await started.promise; current = false; const next = lane.run(() => true, async () => 'next'); held.resolve();
  assert.equal(lane.isCancelled(await root), true); assert.equal(await next, 'next');
  await assert.rejects(lane.run(() => true, async lease => lane.run(() => true, async () => { throw new Error('fixed test rejection'); }, lease)), /fixed test rejection/);
  assert.equal(await lane.run(() => true, async () => 'available'), 'available');
});
