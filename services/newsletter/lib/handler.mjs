import { Webhook } from 'svix';
import { config, CONSENT_COPY } from './config.mjs';
import { edition, escapeHtml, renderPage } from './content.mjs';
import { authorized, boundedBody, fields, InputError, normalizeEmail, rateKeys, validToken } from './security.mjs';
import { campaign, reconcileSubscribers, syncSubscriber } from './operations.mjs';
import { applyWebhook } from './webhook.mjs';
import { handleOsMail } from './os-mail.mjs';

const generic = 'If this address can receive signup mail, a confirmation message will arrive. Open it and press Confirm to subscribe.';
const headers = {
  'cache-control': 'no-store, private', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'strict-transport-security': 'max-age=31536000',
};
export function createHandler({ db, mail, settings = config(), logger = () => console.error('Newsletter request failed; private operational review needed.') }) {
  return async request => {
    const url = new URL(request.url); const path = url.pathname.replace(/\/$/, '') || '/';
    const origin = request.headers.get('origin');
    const wantsJson = request.headers.get('accept')?.includes('application/json') || path.startsWith('/api/admin/');
    const cors = path === '/api/subscribe' && origin && settings.allowedOrigins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    const json = (value, status = 200) => Response.json(value, { status, headers: { ...headers, ...cors } });
    const page = (title, body, status = 200) => new Response(renderPage(title, body), { status, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
    const reply = (ok, message, status = 200) => wantsJson ? json({ ok, message }, status) : page(ok ? 'The Charitology Letter' : 'Please try again', `<p>${escapeHtml(message)}</p><p><a href="https://charitology.org/record/podcast-and-newsletter/">Return to Charitology</a> · <a href="/privacy">Privacy</a></p>`, status);
    try {
      if (request.method === 'POST' && path === '/api/system/os-mail') {
        const response = await handleOsMail(request, { db, mail, settings, logger });
        return json(response.body, response.status);
      }
      if (request.method === 'OPTIONS' && path === '/api/subscribe') {
        if (!origin || !settings.allowedOrigins.has(origin)) return json({ ok: false, message: 'Origin is not allowed.' }, 403);
        return new Response(null, { status: 204, headers: { ...headers, ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept', 'access-control-max-age': '600' } });
      }
      if (request.method === 'GET' && path === '/api/health') {
        await db.tx(client => client.query('SELECT 1 FROM newsletter_subscribers LIMIT 0'));
        return json({ ok: true, service: 'charitology-newsletter', sendingFlagEnabled: settings.enabled, controlledTestMode: settings.testOnly });
      }
      if (request.method === 'GET' && path === '/api/cron/maintenance') {
        if (!authorized(request, settings.cronSecret)) return json({ ok: false, message: 'Authentication required.' }, 401);
        const deadline = Date.now() + 45000;
        await db.cleanup({ deadline });
        if (!settings.enabled) return json({ ok: true, cleanup: true, reconciliation: 'disabled' });
        // CSV contact imports do not emit contact.created. This independent
        // bounded recovery path makes their eventual activation recoverable.
        try {
          const boundedMail = mail.withDeadline(deadline);
          await boundedMail.ready({ campaign: true });
          const result = await reconcileSubscribers(db.withDeadline(deadline), boundedMail, settings, { limit: 20, deadline, continueOnError: true });
          const ok = result.failed === 0 && !result.stoppedForBudget;
          return json({ ok, cleanup: true, reconciliation: result }, ok ? 200 : 503);
        } catch {
          logger();
          return json({ ok: false, cleanup: true, message: 'Cleanup completed; preference recovery needs an operational retry.' }, 503);
        }
      }
      if (request.method === 'GET' && path === '/') return page('The Charitology Letter', `<p>Updates from Charitology, with evidence, uncertainty and ways to contribute.</p><p><a href="https://charitology.org/record/podcast-and-newsletter/">Read and subscribe at Charitology</a> · <a href="/privacy">Email privacy</a></p>`);
      if (request.method === 'GET' && path === '/privacy') return page('Email privacy', `<p>Charitology uses your email address to send The Charitology Letter after you explicitly confirm. We store your address, consent-copy version and confirmation time, subscription state and the provider contact reference in a private Postgres database. Resend processes confirmation messages and newsletter delivery. Vercel hosts this service; Neon hosts the database.</p><p>Confirmation tokens are stored as hashes and expire after 24 hours. Unconfirmed requests are removed by the maintenance command after seven days. Request-limit keys use a secret-key hash rather than storing a raw IP address and expire after two days. Hosting and email providers also maintain their own operational logs.</p><p>Every newsletter uses Resend's native subscription preferences and suppression controls. You may unsubscribe using its footer. A cancellation link in signup mail also records a durable Charitology suppression. We keep the minimum address and consent/withdrawal history needed to avoid sending again by accident. A new deliberate signup and confirmation can renew Charitology consent; it cannot clear a provider-wide unsubscribe or suppression.</p><p>A campaign already queued may be in transit when you unsubscribe. We do not publish subscriber lists or add tracking links in this service. Provider delivery diagnostics do not prove that a person read a message. Ask about access, deletion or an email problem at <a href="mailto:hello@charitology.org">hello@charitology.org</a>. Removing records must preserve enough suppression information to honor withdrawal.</p><p>Charitology · 938 Peacock Station Rd, McLean, VA 22102. <a href="https://charitology.org/">Return to Charitology</a>.</p>`);
      if (request.method === 'GET' && (path === '/confirm' || path === '/unsubscribe')) {
        const token = url.searchParams.get('token') || '';
        if (!validToken(token)) return page('Invalid link', '<p>This link is incomplete. Use the link in your signup message, or request another signup.</p>', 400);
        const confirm = path === '/confirm';
        // GET is deliberately read-only: no database mutation and no provider request.
        return page(confirm ? 'Confirm your subscription' : 'Unsubscribe', `<p>${confirm ? escapeHtml(CONSENT_COPY) + ' This link expires 24 hours after the request.' : 'Stop The Charitology Letter for the address attached to this private link.'}</p><form action="${path}" method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">${confirm ? 'Confirm subscription' : 'Unsubscribe'}</button></form><p><a href="/privacy">Email privacy</a></p>`);
      }
      if (request.method === 'POST' && path === '/api/subscribe') {
        if (origin && !settings.allowedOrigins.has(origin)) return reply(false, 'This form origin is not allowed.', 403);
        const input = await fields(request);
        if (input.website) return reply(true, generic, 202);
        const email = normalizeEmail(input.email);
        if (!email || input.consent !== 'yes') return reply(false, 'Enter a valid email address and choose the email consent checkbox.', 400);
        if (!settings.enabled) return reply(false, 'Email signup is temporarily unavailable. Please use the newsletter RSS feed or try again later.', 503);
        if (settings.testOnly && email !== settings.testRecipient) return reply(true, generic, 202);
        if (!await db.rate(rateKeys(request, email, settings.rateSecret))) return reply(true, generic, 202);
        await mail.ready();
        const attempt = await db.pending(email);
        try {
          await mail.sendConfirmation(attempt, settings.origin, escapeHtml);
          await db.mailResult(email, attempt.generation, 'accepted');
        } catch (error) {
          await db.mailResult(email, attempt.generation, error.ambiguous ? 'unknown' : 'failed');
          // Keep the public result generic for existing, suppressed and new addresses alike.
          logger();
        }
        return reply(true, generic, 202);
      }
      if (request.method === 'POST' && (path === '/confirm' || path === '/unsubscribe')) {
        // The no-referrer confirmation page can submit an opaque Origin: null.
        // The single-use bearer token, rather than a cookie, authorizes this POST.
        if (path === '/confirm' && origin && origin !== 'null' && origin !== settings.origin) return reply(false, 'Open the confirmation page and use its button.', 403);
        const input = await fields(request);
        const token = input.token || url.searchParams.get('token') || '';
        if (!validToken(token)) return reply(false, 'The link is incomplete or invalid.', 400);
        const email = path === '/confirm' ? await db.confirm(token) : await db.unsubscribe(token);
        if (!email) return reply(false, 'This link is expired, already used or no longer valid. Request a new signup if needed.', 400);
        let pending = false;
        try { await syncSubscriber(db, mail, settings, email); }
        catch { pending = true; logger(); }
        return reply(true, path === '/confirm' ? (pending ? 'Your email confirmation was recorded. Activation is waiting for a provider preference update; no issue is sent by this confirmation.' : 'Your email confirmation was recorded. Delivery follows your email provider preferences; a prior global unsubscribe or suppression is preserved.') : 'Your unsubscribe is recorded. No new issue will be queued until provider preferences are reconciled. A message already queued may still be in transit.');
      }
      if (path.startsWith('/api/admin/')) {
        if (!authorized(request, settings.adminToken)) return json({ ok: false, message: 'Authentication required.' }, 401);
        if (origin && origin !== settings.origin) return json({ ok: false, message: 'Origin is not allowed.' }, 403);
        if (path === '/api/admin/readiness' && request.method === 'GET') {
          try {
            await mail.ready({ campaign: true });
            return json({ ok: true, providerReady: true });
          } catch (error) {
            // Operational diagnostics never include provider messages, payloads,
            // credentials or addresses, including in the request logger.
            logger();
            const safe = { ok: false, providerReady: false, errorType: 'Error' };
            if (typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)) safe.errorType = error.name;
            if (typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(error.code)) safe.code = error.code;
            if (Number.isSafeInteger(error?.status)) safe.providerStatus = error.status;
            return json(safe, 503);
          }
        }
        if (path === '/api/admin/status' && request.method === 'GET') return json({ ok: true, ...await db.status() });
        if (path === '/api/admin/preview' && request.method === 'GET') return json({ ok: true, ...edition });
        if (path === '/api/admin/reconcile' && request.method === 'POST') return json({ ok: true, ...await reconcileSubscribers(db, mail, settings) });
        if (path === '/api/admin/cleanup' && request.method === 'POST') return json(await db.cleanup());
        const action = path.match(/^\/api\/admin\/campaign\/(prepare|send|reconcile)$/)?.[1];
        if (action && request.method === 'POST') return json(await campaign(db, mail, settings, edition, action, await fields(request)));
      }
      if (path === '/api/webhook' && request.method === 'POST') {
        if (!settings.webhookSecret) return json({ ok: false, message: 'Webhook is not configured.' }, 503);
        const raw = await boundedBody(request, 65536);
        let event;
        try {
          new Webhook(settings.webhookSecret).verify(raw, { 'svix-id': request.headers.get('svix-id') || '', 'svix-timestamp': request.headers.get('svix-timestamp') || '', 'svix-signature': request.headers.get('svix-signature') || '' });
          event = JSON.parse(raw);
        }
        catch { return json({ ok: false, message: 'Invalid signature.' }, 400); }
        const id = request.headers.get('svix-id');
        if (!id || id.length > 200 || typeof event.type !== 'string' || event.type.length > 100) return json({ ok: false, message: 'Invalid event.' }, 400);
        await applyWebhook(db, event, id, settings);
        if (event.type === 'contact.created') {
          const email = normalizeEmail(event.data?.email);
          // The locked sync rechecks existing consent/state. No event creates
          // consent, a subscriber row or a message; failed sync causes retry.
          if (email) await syncSubscriber(db, mail, settings, email, { confirmedOnly: true });
        }
        return json({ ok: true });
      }
      return page('Page not found', '<p><a href="https://charitology.org/">Return to Charitology</a></p>', 404);
    } catch (error) {
      if (error instanceof InputError) return reply(false, error.message, error.status);
      logger(error);
      return reply(false, 'This operation is temporarily unavailable. Please try later or contact hello@charitology.org.', 503);
    }
  };
}
