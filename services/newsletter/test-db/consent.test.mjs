import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { database } from '../lib/database.mjs';
import { hashToken } from '../lib/security.mjs';
import { campaign, syncSubscriber } from '../lib/operations.mjs';
import { edition } from '../lib/content.mjs';
import { applyWebhook } from '../lib/webhook.mjs';

test('Actual Postgres: isolated-schema DOI races, expiry, replacement, withdrawal, durable limits and rollback', async () => {
  assert.ok(process.env.DATABASE_URL, 'Private DATABASE_URL is required');
  const schema = 'newsletter_test_'+randomBytes(8).toString('hex');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  let db;
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`BEGIN; SET LOCAL search_path TO ${schema}; ${await readFile(new URL('../schema.sql', import.meta.url), 'utf8')} COMMIT;`);
    db = database(process.env.DATABASE_URL, { schema });
    const query = (sql, values) => db.tx(c => c.query(sql, values));
    const attempt = await db.pending('race@example.invalid');
    const snapshots = await query('SELECT * FROM newsletter_tokens');
    assert.ok(!JSON.stringify(snapshots.rows).includes(attempt.confirm));
    assert.ok(!JSON.stringify(snapshots.rows).includes(attempt.unsubscribe));
    assert.equal(snapshots.rows.find(x => x.kind === 'confirm').token_hash, hashToken(attempt.confirm));
    const results = await Promise.allSettled(Array.from({ length: 15 }, () => db.confirm(attempt.confirm)));
    assert.equal(results.filter(x => x.status === 'fulfilled' && x.value).length, 1, 'exactly one simultaneous confirmation consumes the token; busy requests stop safely');
    assert.equal((await query("SELECT count(*)::int AS n FROM newsletter_consent_events WHERE kind='confirmed'")).rows[0].n, 1);
    const expired = await db.pending('expired@example.invalid');
    await query("UPDATE newsletter_tokens SET expires_at=now()-interval '1 second' WHERE email='expired@example.invalid' AND kind='confirm'");
    assert.equal(await db.confirm(expired.confirm), null);
    const first = await db.pending('replaced@example.invalid');
    const second = await db.pending('replaced@example.invalid');
    assert.equal(await db.confirm(first.confirm), null);
    assert.equal(await db.confirm(second.confirm), 'replaced@example.invalid');
    const withdrawn = await db.pending('withdrawn@example.invalid');
    assert.equal(await db.unsubscribe(withdrawn.unsubscribe), 'withdrawn@example.invalid');
    assert.equal(await db.confirm(withdrawn.confirm), null, 'withdrawal invalidates previously issued confirmation');
    assert.equal(await db.unsubscribe(withdrawn.unsubscribe), 'withdrawn@example.invalid', 'one-click unsubscribe remains repeatable');
    assert.equal((await query("SELECT state,sync_pending FROM newsletter_subscribers WHERE email='withdrawn@example.invalid'")).rows[0].state, 'unsubscribed');
    const renewed = await db.pending('withdrawn@example.invalid');
    assert.equal((await query("SELECT state FROM newsletter_subscribers WHERE email='withdrawn@example.invalid'")).rows[0].state, 'unsubscribed', 'a mere request never clears suppression');
    assert.equal(await db.confirm(renewed.confirm), 'withdrawn@example.invalid', 'new deliberate confirmation can renew this publication only');
    const allowed = await Promise.all(Array.from({ length: 12 }, () => db.rate([{ key: 'concurrent-test', limit: 3 }])));
    assert.equal(allowed.filter(Boolean).length, 3, 'durable rate counter serializes concurrent requests');
    assert.equal((await query("SELECT hits FROM newsletter_rate_limits WHERE key='concurrent-test'")).rows[0].hits, 12);
    await assert.rejects(db.tx(async connection => { await connection.query("UPDATE newsletter_subscribers SET state='blocked' WHERE email='race@example.invalid'"); throw new Error('deliberate rollback'); }), /deliberate rollback/);
    assert.equal((await query("SELECT state FROM newsletter_subscribers WHERE email='race@example.invalid'")).rows[0].state, 'confirmed');
    const settings = { segmentId: 'own-segment', topicId: 'own-topic', testOnly: true, testRecipient: 'member@example.invalid' };
    const contacts = new Map([['race@example.invalid', { id: 'global-opt-out', email: 'race@example.invalid', unsubscribed: true }]]);
    const members = new Set(); const calls = []; const topicStates = new Map(); let creates = 0; let sends = 0; let failAdd = false; let failCreate = false; let failSend = false; let currentEdition;
    const mail = {
      ready: async () => {}, contact: async email => contacts.get(email) || null,
      startContactImport: async email => { contacts.set(email, { id: email, email, unsubscribed: false }); calls.push('skip-import'); return { id: 'job-'+email }; },
      getContactImport: async () => ({ status: 'completed' }),
      assertNewContactIsolation: async () => {},
      contactTopics: async id => [{ id: settings.topicId, subscription: topicStates.get(id) || 'opt_out' }],
      setTopic: async (id, subscription) => { calls.push(['topic', id, subscription]); topicStates.set(id, subscription); },
      addSegment: async id => { if (failAdd) throw new Error('add failed'); members.add(id); },
      removeSegment: async id => { calls.push(['remove', id]); members.delete(id); },
      segmentContacts: async () => [...members].map(id => [...contacts.values()].find(x => x.id === id)),
      createBroadcast: async value => { creates++; currentEdition = value; if (failCreate) throw new Error('ambiguous create'); return { id: `broadcast-${creates}` }; },
      getBroadcast: async () => ({ status: 'draft', segment_id: settings.segmentId, topic_id: settings.topicId, from: 'Charitology <hello@charitology.org>', reply_to: ['hello@charitology.org'], subject: currentEdition.subject, html: currentEdition.html, text: currentEdition.text }),
      sendBroadcast: async () => { sends++; if (failSend) throw new Error('ambiguous send'); },
    };
    await syncSubscriber(db, mail, settings, 'race@example.invalid');
    assert.equal(contacts.get('race@example.invalid').unsubscribed, true);
    assert.equal(calls.some(x => Array.isArray(x) && x[0] === 'topic'), false, 'existing team-wide unsubscribe was never reset');
    assert.equal((await query("SELECT state FROM newsletter_subscribers WHERE email='race@example.invalid'")).rows[0].state, 'blocked');
    await query('UPDATE newsletter_subscribers SET sync_pending=false');
    const member = await db.pending(settings.testRecipient); await db.confirm(member.confirm);
    failAdd = true;
    await assert.rejects(syncSubscriber(db, mail, settings, settings.testRecipient), /add failed/);
    assert.equal((await query('SELECT sync_pending FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].sync_pending, true, 'partial provider mutation never clears durable pending state');
    assert.ok((await query('SELECT topic_attempted_generation FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].topic_attempted_generation, 'topic attempt checkpoint survives failed activation');
    const issue = { ...edition, id: 'test-success' };
    await assert.rejects(campaign(db, mail, settings, issue, 'prepare', { contentHash: issue.hash }), /pending subscription/);
    failAdd = false;
    topicStates.set(settings.testRecipient, 'opt_out');
    const optInsBefore = calls.filter(x => Array.isArray(x) && x[0] === 'topic' && x[2] === 'opt_in').length;
    await syncSubscriber(db, mail, settings, settings.testRecipient);
    assert.equal((await query('SELECT contact_import_id,contact_import_status FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].contact_import_status, 'completed');
    assert.equal(calls.filter(x => Array.isArray(x) && x[0] === 'topic' && x[2] === 'opt_in').length, optInsBefore, 'reconciliation never overrides a native opt-out after partial activation');
    assert.equal((await query('SELECT state FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].state, 'unsubscribed');
    const laterConsent = await db.pending(settings.testRecipient); await db.confirm(laterConsent.confirm);
    await syncSubscriber(db, mail, settings, settings.testRecipient);
    const consentAt = (await query('SELECT consent_at FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].consent_at;
    await applyWebhook(db, { type: 'contact.topics.updated', created_at: new Date(+consentAt-1000).toISOString(), data: { email: settings.testRecipient, topics: [{ id: settings.topicId, subscription: 'opt_out' }] } }, 'old-opt-out', settings);
    assert.equal((await query('SELECT state FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].state, 'active', 'late event predating later DOI cannot erase it');
    await applyWebhook(db, { type: 'contact.topics.updated', created_at: new Date(+consentAt+1000).toISOString(), data: { email: settings.testRecipient, topics: [{ id: 'unrelated-topic', subscription: 'opt_out' }] } }, 'unrelated-opt-out', settings);
    assert.equal((await query('SELECT state FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].state, 'active', 'another publication topic does not change this subscription');
    contacts.set('stranger@example.invalid', { id: 'stranger', email: 'stranger@example.invalid' }); members.add('stranger');
    await assert.rejects(campaign(db, mail, settings, issue, 'prepare', { contentHash: issue.hash }), /differs/);
    members.delete('stranger');
    const drafts = await Promise.allSettled([1, 2, 3].map(() => campaign(db, mail, settings, issue, 'prepare', { contentHash: issue.hash })));
    assert.equal(creates, 1, 'three concurrent prepare requests cannot exhaust the pool or duplicate a draft'); assert.ok(drafts.some(x => x.status === 'fulfilled' && x.value.broadcastId === 'broadcast-1'));
    const queued = await Promise.allSettled([1, 2, 3].map(() => campaign(db, mail, settings, issue, 'send', { contentHash: issue.hash, confirm: 'SEND THIS REVIEWED ISSUE' })));
    assert.equal(queued.filter(x => x.status === 'fulfilled').length, 1); assert.equal(sends, 1, 'concurrent send queues exactly once');
    const unknownCreate = { ...edition, id: 'test-create-unknown' }; failCreate = true;
    await assert.rejects(campaign(db, mail, settings, unknownCreate, 'prepare', { contentHash: edition.hash }), /ambiguous create/);
    assert.equal((await query('SELECT state FROM newsletter_campaigns WHERE edition=$1', [unknownCreate.id])).rows[0].state, 'create_unknown', 'ambiguous external intent survives transaction rollback');
    await campaign(db, mail, settings, unknownCreate, 'prepare', { contentHash: edition.hash }); assert.equal(creates, 2, 'ambiguous create is never retried');
    const unknownSend = { ...edition, id: 'test-send-unknown' }; failCreate = false;
    await campaign(db, mail, settings, unknownSend, 'prepare', { contentHash: edition.hash }); failSend = true;
    await assert.rejects(campaign(db, mail, settings, unknownSend, 'send', { contentHash: edition.hash, confirm: 'SEND THIS REVIEWED ISSUE' }), /ambiguous send/);
    assert.equal((await query('SELECT state FROM newsletter_campaigns WHERE edition=$1', [unknownSend.id])).rows[0].state, 'send_unknown');
    await assert.rejects(campaign(db, mail, settings, unknownSend, 'send', { contentHash: edition.hash, confirm: 'SEND THIS REVIEWED ISSUE' }), /ambiguous operations/);
    assert.equal(sends, 2, 'ambiguous send is never automatically retried');
    const activeAt = (await query('SELECT consent_at FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].consent_at;
    const nativeEvent = { type: 'contact.topics.updated', created_at: new Date(+activeAt+1000).toISOString(), data: { email: settings.testRecipient, topics: [{ id: settings.topicId, subscription: 'opt_out' }] } };
    topicStates.set(settings.testRecipient, 'opt_out');
    await applyWebhook(db, nativeEvent, 'native-withdrawal', settings);
    await applyWebhook(db, nativeEvent, 'native-withdrawal', settings);
    assert.equal((await query("SELECT count(*)::int AS n FROM newsletter_consent_events WHERE kind='native_topic_unsubscribed'")).rows[0].n, 1, 'signed native withdrawal is durably deduplicated');
    await syncSubscriber(db, mail, settings, settings.testRecipient);
    assert.equal(topicStates.get(settings.testRecipient), 'opt_out');
    await db.unsubscribe(member.unsubscribe);
    assert.equal((await query('SELECT state,sync_pending FROM newsletter_subscribers WHERE email=$1', [settings.testRecipient])).rows[0].state, 'unsubscribed');
    await syncSubscriber(db, mail, settings, settings.testRecipient);
    assert.equal(members.size, 0, 'withdrawal removes only own segment and own topic');
    let importsStarted = 0;
    const delayed = await db.pending('queued@example.invalid'); await db.confirm(delayed.confirm);
    const delayedMail = { ...mail, contact: async () => null, startContactImport: async () => { importsStarted++; return { id: 'saved-queued-import' }; }, getContactImport: async () => ({ status: 'queued' }) };
    await assert.rejects(syncSubscriber(db, delayedMail, settings, delayed.email), /still pending/);
    await assert.rejects(syncSubscriber(db, delayedMail, settings, delayed.email), /still pending/);
    assert.equal(importsStarted, 1, 'queued native import is resumed by ID rather than recreated');
    const pendingImport = (await query('SELECT contact_import_id,contact_import_status,sync_pending FROM newsletter_subscribers WHERE email=$1', [delayed.email])).rows[0];
    assert.deepEqual(pendingImport, { contact_import_id: 'saved-queued-import', contact_import_status: 'queued', sync_pending: true });
    console.log('Actual Neon test used only an isolated temporary schema and synthetic example.invalid addresses; no provider calls or sends.');
  } finally {
    if (db) await db.close();
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
});
