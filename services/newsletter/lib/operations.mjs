import { randomUUID } from 'node:crypto';
export async function syncSubscriber(db, mail, settings, email, { confirmedOnly = false } = {}) {
  const durable = (sql, values) => db.tx(client => client.query(sql, values));
  return db.exclusive(async client => {
    const { rows } = await client.query('SELECT * FROM newsletter_subscribers WHERE email=$1', [email]);
    const person = rows[0];
    if (!person || !person.sync_pending) return;
    if (confirmedOnly && (!person.consent_at || !person.consent_generation || !['confirmed','active'].includes(person.state))) return;
    if (!settings.segmentId || !settings.topicId) throw new Error('Newsletter preferences are not configured');
    let contact = await mail.contact(email);
    if (person.state === 'unsubscribed' || person.state === 'blocked') {
      if (contact) { await mail.setTopic(contact.id, 'opt_out'); await mail.removeSegment(contact.id); }
      await durable('UPDATE newsletter_subscribers SET sync_pending=false,updated_at=now() WHERE email=$1', [email]);
      return;
    }
    if (!person.consent_at || !person.consent_generation || person.state === 'pending') throw new Error('Confirmed consent required');
    // Never reset a team-wide unsubscribe, including another publication's preference.
    if (contact?.unsubscribed) {
      await mail.removeSegment(contact.id);
      await durable("UPDATE newsletter_subscribers SET state='blocked',contact_id=$2,sync_pending=false,updated_at=now() WHERE email=$1", [email, contact.id]);
      return;
    }
    if (!contact) {
      await mail.assertNewContactIsolation();
      let importId = person.contact_import_id;
      if (!importId) {
        await durable("UPDATE newsletter_subscribers SET contact_import_status='creating',updated_at=now() WHERE email=$1", [email]);
        try {
          const job = await mail.startContactImport(email);
          if (!job.id) throw new Error('Provider import ID missing');
          importId = job.id;
          await durable("UPDATE newsletter_subscribers SET contact_import_id=$2,contact_import_status='submitted',updated_at=now() WHERE email=$1", [email, importId]);
        } catch (error) {
          await durable("UPDATE newsletter_subscribers SET contact_import_status='unknown',updated_at=now() WHERE email=$1", [email]);
          throw error;
        }
      }
      for (let check = 0; check < 4; check++) {
        const job = await mail.getContactImport(importId);
        await durable('UPDATE newsletter_subscribers SET contact_import_status=$2,updated_at=now() WHERE email=$1', [email, ['queued','in_progress','completed','failed'].includes(job.status) ? job.status : 'unknown']);
        if (job.status === 'failed') throw new Error('Contact import failed; inspect its private provider diagnostics');
        contact = await mail.contact(email);
        if (contact) break;
        if (check < 3) await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (!contact) throw new Error('Native contact import is still pending; reconcile its saved job later');
      if (contact.unsubscribed) {
        await durable("UPDATE newsletter_subscribers SET state='blocked',contact_id=$2,sync_pending=false,updated_at=now() WHERE email=$1", [email, contact.id]);
        return;
      }
    }
    if (person.topic_attempted_generation === person.consent_generation) {
      const topics = await mail.contactTopics(contact.id);
      if (topics.find(x => x.id === settings.topicId)?.subscription !== 'opt_in') {
        // A partial activation, timeout or later native withdrawal must never
        // cause a retry to overwrite an opt-out. A new deliberate DOI is needed.
        await db.tx(async connection => {
          await connection.query("UPDATE newsletter_subscribers SET state='unsubscribed',unsubscribed_at=now(),sync_pending=true,updated_at=now() WHERE email=$1", [email]);
          await connection.query("DELETE FROM newsletter_tokens WHERE email=$1 AND kind='confirm'", [email]);
          await connection.query("INSERT INTO newsletter_consent_events(email,kind) VALUES($1,'provider_opt_out_preserved')", [email]);
        });
        await mail.removeSegment(contact.id);
        await durable('UPDATE newsletter_subscribers SET sync_pending=false,updated_at=now() WHERE email=$1', [email]);
        return;
      }
    } else {
      // Commit the attempt checkpoint BEFORE the external call. Even an
      // ambiguous timeout cannot trigger another opt-in for this consent.
      await durable('UPDATE newsletter_subscribers SET topic_attempted_generation=$2,updated_at=now() WHERE email=$1', [email, person.consent_generation]);
      await mail.setTopic(contact.id, 'opt_in');
    }
    await mail.addSegment(contact.id);
    await durable("UPDATE newsletter_subscribers SET state='active',contact_id=$2,sync_pending=false,updated_at=now() WHERE email=$1", [email, contact.id]);
  });
}
export async function reconcileSubscribers(db, mail, settings, { limit = 20, deadline = Infinity, continueOnError = false } = {}) {
  if (Date.now() >= deadline) return { completed: 0, failed: 0, stoppedForBudget: true };
  const count = Math.min(20, Math.max(1, Number.isInteger(limit) ? limit : 20));
  const pending = await db.tx(async client => (await client.query('SELECT email FROM newsletter_subscribers WHERE sync_pending ORDER BY updated_at LIMIT $1', [count])).rows);
  let completed = 0; let failed = 0;
  for (const person of pending) {
    if (Date.now() >= deadline) break;
    try { await syncSubscriber(db, mail, settings, person.email); completed++; }
    catch (error) {
      if (!continueOnError) throw error;
      failed++;
      // One permanently bad job must not occupy the first page every day.
      if (Date.now() < deadline) await db.tx(client => client.query('UPDATE newsletter_subscribers SET updated_at=now() WHERE email=$1 AND sync_pending', [person.email])).catch(() => {});
    }
  }
  return { completed, failed, stoppedForBudget: Date.now() >= deadline };
}
export async function recipientSafety(client, mail, settings) {
  const { rows: pending } = await client.query('SELECT count(*)::int AS count FROM newsletter_subscribers WHERE sync_pending');
  if (pending[0].count) throw new Error('Resolve pending subscription preferences before a campaign');
  const { rows } = await client.query("SELECT email FROM newsletter_subscribers WHERE state='active' AND consent_at IS NOT NULL AND unsubscribed_at IS NULL");
  const expected = new Set(rows.map(x => x.email));
  const actual = await mail.segmentContacts();
  if (!expected.size) throw new Error('No confirmed recipients');
  // Exact segment membership prevents accidentally using an existing list from the owner's shared team.
  if (actual.length !== expected.size || actual.some(x => !expected.has(x.email?.toLowerCase()))) throw new Error('Provider segment differs from confirmed consent records');
  if (settings.testOnly && (expected.size !== 1 || !expected.has(settings.testRecipient))) throw new Error('Controlled test recipient guard');
  return expected.size;
}
export async function campaign(db, mail, settings, edition, action, input) {
  // Intent writes use a separate committed transaction while the outer transaction
  // holds the provider lock. Thus a function crash cannot roll back a send intent.
  const durable = (sql, values) => db.tx(client => client.query(sql, values));
  return db.exclusive(async client => {
    await mail.ready({ campaign: true });
    const { rows } = await client.query('SELECT * FROM newsletter_campaigns WHERE edition=$1', [edition.id]);
    let record = rows[0];
    if (action === 'reconcile') {
      if (!record?.broadcast_id) throw new Error('An unknown create needs manual provider inspection; no automatic retry');
      const remote = await mail.getBroadcast(record.broadcast_id);
      // Never infer delivery from acceptance or reconstruct an ambiguous send automatically.
      await durable('UPDATE newsletter_campaigns SET provider_status=$2,updated_at=now() WHERE edition=$1', [edition.id, remote.status || 'unknown']);
      return { ok: true, state: record.state, providerStatus: remote.status || 'unknown' };
    }
    if (input.contentHash !== edition.hash) throw new Error('Preview hash does not match this issue');
    if (record && record.content_hash !== edition.hash) throw new Error('Saved issue differs from the deployed content; review the existing draft manually');
    if (action === 'prepare') {
      if (record) return { ok: true, state: record.state, broadcastId: record.broadcast_id, message: 'Existing operation retained; no duplicate created.' };
      const recipients = await recipientSafety(client, mail, settings);
      const operation = randomUUID();
      // Commit intent before a non-idempotent API mutation. A crash leaves a visible stop, never a blind retry.
      await durable("INSERT INTO newsletter_campaigns(edition,content_hash,state,operation_id) VALUES($1,$2,'creating',$3)", [edition.id, edition.hash, operation]);
      try {
        const remote = await mail.createBroadcast(edition);
        if (!remote.id) throw new Error('Provider did not return a broadcast ID');
        await durable("UPDATE newsletter_campaigns SET state='draft',broadcast_id=$2,provider_status='draft',updated_at=now() WHERE edition=$1", [edition.id, remote.id]);
        return { ok: true, state: 'draft', broadcastId: remote.id, confirmedSegmentMembers: recipients };
      } catch (error) { await durable("UPDATE newsletter_campaigns SET state='create_unknown',updated_at=now() WHERE edition=$1", [edition.id]); throw error; }
    }
    if (action !== 'send' || input.confirm !== 'SEND THIS REVIEWED ISSUE') throw new Error('Explicit reviewed send confirmation required');
    if (!record || record.state !== 'draft' || !record.broadcast_id) throw new Error('A saved unsent draft is required; ambiguous operations require manual review');
    const remote = await mail.getBroadcast(record.broadcast_id);
    const replies = Array.isArray(remote.reply_to) ? remote.reply_to : [remote.reply_to];
    if (remote.status !== 'draft' || remote.segment_id !== settings.segmentId || remote.topic_id !== settings.topicId || remote.subject !== edition.subject || remote.html !== edition.html || remote.text !== edition.text || remote.from !== 'Charitology <hello@charitology.org>' || replies.length !== 1 || replies[0] !== 'hello@charitology.org') throw new Error('Provider draft differs from the reviewed issue');
    const recipients = await recipientSafety(client, mail, settings);
    await durable("UPDATE newsletter_campaigns SET state='sending',updated_at=now() WHERE edition=$1", [edition.id]);
    try {
      await mail.sendBroadcast(record.broadcast_id);
      await durable("UPDATE newsletter_campaigns SET state='accepted',provider_status='accepted',updated_at=now() WHERE edition=$1", [edition.id]);
      return { ok: true, state: 'accepted', confirmedSegmentMembers: recipients, message: 'Provider accepted the issue for processing and applies native subscription preferences and suppression filters. This is not proof of inbox delivery.' };
    } catch (error) { await durable("UPDATE newsletter_campaigns SET state='send_unknown',updated_at=now() WHERE edition=$1", [edition.id]); throw error; }
  });
}
