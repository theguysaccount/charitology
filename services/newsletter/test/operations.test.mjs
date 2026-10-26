import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSubscriber } from '../lib/operations.mjs';

const settings = { segmentId: 'own-segment', topicId: 'own-topic' };
function withdrawalFixture(state, topics) {
  const person = { email: 'withdrawn@example.invalid', state, sync_pending: true };
  const contact = Object.freeze({ id: 'own-contact', unsubscribed: true });
  const calls = []; let emittedWebhooks = 0;
  const client = { query: async (sql, values) => {
    assert.deepEqual(values, [person.email]);
    if (sql.startsWith('SELECT * FROM newsletter_subscribers')) return { rows: [{ ...person }] };
    assert.equal(sql, 'UPDATE newsletter_subscribers SET sync_pending=false,updated_at=now() WHERE email=$1');
    person.sync_pending = false;
    calls.push('cleared');
    return { rowCount: 1 };
  } };
  const db = { exclusive: async action => action(client), tx: async action => action(client) };
  const mail = {
    contact: async email => { assert.equal(email, person.email); return contact; },
    contactTopics: async id => { assert.equal(id, contact.id); calls.push('read-topics'); return topics; },
    setTopic: async (id, subscription) => { assert.equal(id, contact.id); assert.equal(subscription, 'opt_out'); calls.push('topic-patch'); emittedWebhooks++; },
    removeSegment: async id => { assert.equal(id, contact.id); calls.push('remove-segment'); },
  };
  return { person, contact, db, mail, calls, emitted: () => emittedWebhooks };
}
test('Already opted-out withdrawals and blocked contacts drain pending state without PATCH/webhook feedback', async () => {
  for (const state of ['unsubscribed', 'blocked']) {
    const fixture = withdrawalFixture(state, [{ id: 'other-topic', subscription: 'opt_in' }, { id: settings.topicId, subscription: 'opt_out' }]);
    await syncSubscriber(fixture.db, fixture.mail, settings, fixture.person.email);
    assert.deepEqual(fixture.calls, ['read-topics', 'remove-segment', 'cleared']);
    assert.equal(fixture.emitted(), 0, 'unchanged opt-out must not emit another pending withdrawal webhook');
    assert.equal(fixture.person.sync_pending, false);
    assert.equal(fixture.contact.unsubscribed, true, 'global withdrawal stays unchanged');
    await syncSubscriber(fixture.db, fixture.mail, settings, fixture.person.email);
    assert.deepEqual(fixture.calls, ['read-topics', 'remove-segment', 'cleared'], 'drained record performs no further provider work');
  }
});
test('Withdrawal updates a non-out or absent dedicated Topic before segment cleanup', async () => {
  for (const topics of [[{ id: settings.topicId, subscription: 'opt_in' }], [{ id: 'other-topic', subscription: 'opt_out' }]]) {
    const fixture = withdrawalFixture('unsubscribed', topics);
    await syncSubscriber(fixture.db, fixture.mail, settings, fixture.person.email);
    assert.deepEqual(fixture.calls, ['read-topics', 'topic-patch', 'remove-segment', 'cleared']);
    assert.equal(fixture.emitted(), 1);
    assert.equal(fixture.contact.unsubscribed, true);
  }
});
test('Failed Topic read or segment removal keeps withdrawal pending for a later recovery', async () => {
  for (const failure of ['contactTopics', 'removeSegment']) {
    const fixture = withdrawalFixture('unsubscribed', [{ id: settings.topicId, subscription: 'opt_out' }]);
    fixture.mail[failure] = async () => { throw new Error('provider unavailable'); };
    await assert.rejects(syncSubscriber(fixture.db, fixture.mail, settings, fixture.person.email), /provider unavailable/);
    assert.equal(fixture.person.sync_pending, true);
    assert.equal(fixture.emitted(), 0);
    assert.equal(fixture.calls.includes('cleared'), false);
  }
});
