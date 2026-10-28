import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalGrowth, LEARNING_OPERATIONAL_CAPACITY as O } from '../lib/learning-capacity.mjs';
import { hash } from '../lib/security.mjs';
const at = '2026-10-27T00:00:00.000Z';
const entry = (id, intentKind = 'legacy', participationId = 'participant-one') => ({ id, participationId, eventRevision: 1,
  purpose: 'participation', channel: 'email', state: 'paused', payload: { state: 'confirmed', participationId, revision: 1 },
  createdAt: at, participationRevision: 1, intentKind, consentRevision: 1, consentCopy: null, templateVersion: null,
  attemptedAt: null, attempts: 0, lastCheckedAt: null, safeCode: null, providerEventAt: null, recoveredState: null });
test('legacy-only journals have no operational reserve and inputs stay writable and unchanged', () => {
  const source = { version: 2, outbox: [entry('legacy')], participations: [{ id: 'participant-one', revision: 1 }] }, before = hash(source);
  const result = operationalGrowth(source);
  assert.equal(result.active, false); assert.equal(result.sourceWireGrowthBytes, 0); assert.equal(hash(source), before);
  assert.equal(Object.isFrozen(source.outbox[0]), false); assert.deepEqual(result.affectedParticipationIds, []);
});
test('one active item reserves every portable outbox item but only affected participation revisions', () => {
  const source = { version: 2, outbox: [entry('live', 'snapshot'), entry('legacy-sibling'), entry('other-legacy', 'legacy', 'participant-two')],
    participations: [{ id: 'participant-one', revision: 1 }, { id: 'participant-two', revision: 1 }] }, before = hash(source);
  const result = operationalGrowth(source);
  assert.deepEqual(result.affectedParticipationIds, ['participant-one']); assert.equal(result.outboxBounds.length, 3);
  assert.ok(result.sourceOutboxWireGrowthBytes > 0); assert.equal(result.sourceParticipationWireGrowthBytes, 9);
  assert.equal(result.sourceWireGrowthBytes, result.sourceOutboxWireGrowthBytes + 9);
  for (const bound of result.outboxBounds) { assert.equal(bound.safeCode.length, 100); assert.equal(bound.providerEventAt.length, 27); assert.equal(bound.attemptedAt.length, 24); assert.equal(bound.state.length, 10); }
  assert.equal(hash(source), before); assert.equal(Object.isFrozen(source.outbox[0].payload), false);
});
test('extended provider instants and existing longer service instants retain their admitted wire width', () => {
  assert.equal(new Date(O.providerTime).toISOString(), O.providerTime); assert.equal(O.providerTime.length, 27);
  const source = { version: 2, outbox: [{ ...entry('live', 'transition'), attemptedAt: '+010000-01-01T00:00:00.000Z' }], participations: [] };
  const result = operationalGrowth(source); assert.equal(result.outboxBounds[0].attemptedAt, source.outbox[0].attemptedAt);
  assert.equal(result.outboxBounds[0].providerEventAt.length, 27); assert.ok(result.sourceWireGrowthBytes > 0);
});
test('already bounded metadata needs no repeated reserve growth and never changes event payloads', () => {
  const source = { version: 2, outbox: [{ ...entry('live', 'snapshot'), state: O.state, safeCode: O.safeCode, attempts: O.attempts,
    attemptedAt: O.serviceTime, lastCheckedAt: O.serviceTime, providerEventAt: O.providerTime }], participations: [{ id: 'participant-one', revision: O.attempts }] };
  const before = JSON.stringify(source), result = operationalGrowth(source);
  assert.equal(result.sourceWireGrowthBytes, 0); assert.equal(JSON.stringify(source), before);
  assert.equal(result.outboxBounds[0].attempts, 2147483647);
});
