import { getToken } from '@vercel/connect';
import { FROM } from './config.mjs';
export class ProviderError extends Error {
  constructor(status, ambiguous = false) { super('Mail provider operation failed'); this.status = status; this.ambiguous = ambiguous; }
}
export function provider(settings, { credential = () => {
  if (!settings.subjectId) throw new Error('Authorized server-side Connect subject is required');
  return getToken(settings.connector, { subject: { type: 'user', id: settings.subjectId } });
}, fetcher = fetch, deadline = Infinity } = {}) {
  const remaining = () => {
    const milliseconds = Math.floor(deadline - Date.now());
    if (milliseconds <= 0) throw new Error('Maintenance time budget reached');
    return Math.min(8000, milliseconds);
  };
  const call = async (method, path, body, key) => {
    let token;
    if (Number.isFinite(deadline)) {
      const timeout = remaining(); let timer;
      try {
        token = await Promise.race([credential(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Credential time budget reached')), timeout); })]);
      } finally { clearTimeout(timer); }
    } else token = await credential();
    let response;
    try {
      response = await fetcher(`https://api.resend.com${path}`, {
        method, signal: AbortSignal.timeout(remaining()),
        headers: { authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      });
    } catch { throw new ProviderError(503, method !== 'GET'); }
    if (!response.ok) throw new ProviderError(response.status, method !== 'GET' && response.status >= 500);
    return response.status === 204 ? null : response.json();
  };
  const e = encodeURIComponent;
  const all = async path => {
    const results = []; let after;
    for (let page = 0; page < 30; page++) {
      const data = await call('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100${after ? `&after=${e(after)}` : ''}`);
      if (!Array.isArray(data.data)) throw new ProviderError(502);
      results.push(...data.data);
      if (!data.has_more) return results;
      after = data.data.at(-1)?.id;
      if (!after) throw new ProviderError(502);
    }
    throw new Error('Contact safety limit reached; review segmentation before sending');
  };
  return {
    call,
    withDeadline: value => provider(settings, { credential, fetcher, deadline: value }),
    async ready({ campaign = false } = {}) {
      if (!settings.enabled || !settings.domainId || (campaign && (!settings.segmentId || !settings.topicId))) throw new Error('Newsletter delivery is not enabled');
      const domain = await call('GET', `/domains/${e(settings.domainId)}`);
      if (domain.name !== 'charitology.org' || domain.status !== 'verified') throw new Error('Newsletter sender is not verified');
      if (domain.open_tracking !== false || domain.click_tracking !== false) throw new Error('Newsletter requires open and click tracking disabled');
      if (campaign) {
        const topic = await call('GET', `/topics/${e(settings.topicId)}`);
        const segment = await call('GET', `/segments/${e(settings.segmentId)}`);
        if (topic.default_subscription !== 'opt_out' || topic.name !== 'The Charitology Letter' || segment.name !== 'Charitology confirmed newsletter') throw new Error('Newsletter isolation configuration mismatch');
      }
    },
    async contact(email) {
      try { return await call('GET', `/contacts/${e(email)}`); }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    // Ordinary POST /contacts is an unsafe upsert: actual provider testing showed
    // that even omitting unsubscribed resets an existing true flag to false.
    // Native imports explicitly skip existing contacts instead.
    startContactImport: email => {
      const form = new FormData();
      form.set('file', new Blob([`Email\n${email}\n`], { type: 'text/csv' }), 'charitology-confirmed-signup.csv');
      form.set('column_map', JSON.stringify({ email: 'Email' }));
      form.set('on_conflict', 'skip');
      return call('POST', '/contacts/imports', form);
    },
    getContactImport: id => call('GET', `/contacts/imports/${e(id)}`),
    contactTopics: id => all(`/contacts/${e(id)}/topics`),
    async assertNewContactIsolation() {
      const topics = await all('/topics');
      if (topics.some(x => x.id !== settings.topicId && x.default_subscription !== 'opt_out')) throw new Error('Unrelated default-subscription topics prevent safely creating a shared-team contact');
    },
    // HTTP accepts the array itself; the SDK's topics wrapper is not its wire shape.
    setTopic: (id, subscription) => call('PATCH', `/contacts/${e(id)}/topics`, [{ id: settings.topicId, subscription }]),
    addSegment: id => call('POST', `/contacts/${e(id)}/segments/${e(settings.segmentId)}`),
    removeSegment: async id => {
      try { await call('DELETE', `/contacts/${e(id)}/segments/${e(settings.segmentId)}`); }
      catch (error) { if (error.status !== 404) throw error; }
    },
    segmentContacts: () => all(`/segments/${e(settings.segmentId)}/contacts`),
    getBroadcast: id => call('GET', `/broadcasts/${e(id)}`),
    createBroadcast: edition => call('POST', '/broadcasts', { segment_id: settings.segmentId, topic_id: settings.topicId, from: FROM, reply_to: ['hello@charitology.org'], name: `Charitology ${edition.id} ${edition.hash.slice(0, 12)}`, subject: edition.subject, html: edition.html, text: edition.text, send: false }),
    sendBroadcast: id => call('POST', `/broadcasts/${e(id)}/send`, {}),
    sendConfirmation: (attempt, origin, htmlEscape) => {
      const confirm = `${origin}/confirm?token=${attempt.confirm}`;
      const unsubscribe = `${origin}/unsubscribe?token=${attempt.unsubscribe}`;
      return call('POST', '/emails', {
        from: FROM, to: [attempt.email], reply_to: 'hello@charitology.org', subject: 'Confirm your Charitology Letter signup',
        html: `<h1>Confirm your signup</h1><p>Someone requested The Charitology Letter for this address. To subscribe, open the link and press Confirm. The link expires in 24 hours. If you did not ask, ignore this message.</p><p><a href="${htmlEscape(confirm)}">Review and confirm signup</a></p><p><a href="${htmlEscape(unsubscribe)}">Cancel this request or unsubscribe</a> · <a href="${origin}/privacy">Privacy</a></p><p>Charitology · 938 Peacock Station Rd, McLean, VA 22102</p>`,
        text: `Confirm your Charitology Letter signup\n\nSomeone requested this newsletter for your address. Open the link and press Confirm to subscribe. Expires in 24 hours. If you did not ask, ignore this message.\n\n${confirm}\n\nCancel or unsubscribe: ${unsubscribe}\nPrivacy: ${origin}/privacy\nCharitology · 938 Peacock Station Rd, McLean, VA 22102`,
        headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }, `doi-${attempt.generation}`);
    },
  };
}
