import { normalizeEmail } from './security.mjs';
import { applyOsMailFeedback } from './os-mail.mjs';
export async function applyWebhook(db, event, id, settings) {
  return db.tx(async client => {
    const inserted = await client.query('INSERT INTO newsletter_webhook_events(id,type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id', [id, event.type]);
    if (!inserted.rowCount) return;
    await applyOsMailFeedback(client,event,settings);
    const topicWithdrawal = event.type === 'contact.topics.updated' && Array.isArray(event.data?.topics) && event.data.topics.some(x => x.id === settings.topicId && x.subscription === 'opt_out');
    if (topicWithdrawal) {
      const email = normalizeEmail(event.data.email); if (!email) return;
      const { rows } = await client.query('SELECT consent_at FROM newsletter_subscribers WHERE email=$1', [email]);
      if (!rows[0]) return;
      const emitted = Date.parse(event.created_at);
      // A delayed event predating a later deliberate DOI must not erase it.
      // Unparseable timestamps fail closed for this newsletter's own opt-out.
      if (Number.isFinite(emitted) && rows[0].consent_at && emitted <= +new Date(rows[0].consent_at)) return;
      await client.query("UPDATE newsletter_subscribers SET state='unsubscribed',unsubscribed_at=now(),sync_pending=true,updated_at=now() WHERE email=$1", [email]);
      await client.query("DELETE FROM newsletter_tokens WHERE email=$1 AND kind='confirm'", [email]);
      await client.query("INSERT INTO newsletter_consent_events(email,kind) VALUES($1,'native_topic_unsubscribed')", [email]);
      return;
    }
    const blocking = ['email.bounced', 'email.complained', 'email.suppressed'].includes(event.type) || (event.type === 'contact.updated' && event.data?.unsubscribed === true);
    if (!blocking) return;
    const values = Array.isArray(event.data?.to) ? event.data.to : [event.data?.email];
    for (const value of values.slice(0, 100)) {
      const email = normalizeEmail(value); if (!email) continue;
      await client.query("UPDATE newsletter_subscribers SET state='blocked',sync_pending=true,updated_at=now() WHERE email=$1 AND state<>'unsubscribed'", [email]);
    }
  }, { providerLock: true });
}
