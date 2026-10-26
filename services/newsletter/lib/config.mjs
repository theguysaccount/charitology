export const CONSENT_VERSION = 'charitology-letter-2026-10-26-v1';
export const CONSENT_COPY = 'I want to receive The Charitology Letter by email. I can unsubscribe whenever I choose.';
export const FROM = 'Charitology <hello@charitology.org>';
export function config(env = process.env) {
  const origin = env.NEWSLETTER_ORIGIN || 'https://mail.charitology.org';
  if (!/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Invalid newsletter origin');
  const osOrigin = env.OS_ORIGIN || 'https://os.charitology.org';
  let parsedOsOrigin;
  try { parsedOsOrigin = new URL(osOrigin); } catch { throw new Error('Invalid OS origin'); }
  const localOs = env.NODE_ENV !== 'production' && parsedOsOrigin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedOsOrigin.hostname) && parsedOsOrigin.port;
  if ((!localOs && parsedOsOrigin.protocol !== 'https:') || parsedOsOrigin.username || parsedOsOrigin.password || parsedOsOrigin.search || parsedOsOrigin.hash || parsedOsOrigin.pathname !== '/' || parsedOsOrigin.origin !== osOrigin) throw new Error('Invalid OS origin');
  return {
    databaseUrl: env.DATABASE_URL,
    origin,
    allowedOrigins: new Set([origin, ...(env.NEWSLETTER_ALLOWED_ORIGINS || 'https://charitology.org').split(',').map(x => x.trim()).filter(Boolean)]),
    enabled: env.NEWSLETTER_SEND_ENABLED === 'true',
    testOnly: env.NEWSLETTER_TEST_ONLY !== 'false',
    testRecipient: (env.NEWSLETTER_TEST_RECIPIENT || '').trim().toLowerCase(),
    adminToken: env.NEWSLETTER_ADMIN_TOKEN || '',
    cronSecret: env.CRON_SECRET || '',
    rateSecret: env.NEWSLETTER_RATE_SECRET || '',
    connector: env.RESEND_CONNECTOR || 'resend/charitology-mail',
    subjectId: env.RESEND_SUBJECT_ID || '',
    domainId: env.RESEND_DOMAIN_ID || '',
    segmentId: env.RESEND_SEGMENT_ID || '',
    topicId: env.RESEND_TOPIC_ID || '',
    webhookSecret: env.RESEND_WEBHOOK_SECRET || '',
    osOrigin,
    osMailSecret: env.OS_MAIL_RELAY_SECRET || '',
  };
}
