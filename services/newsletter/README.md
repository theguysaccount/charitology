# Charitology mail service

Private Node 24 Vercel Functions backend for the static Charitology site, using real Neon Postgres and the authorized existing Resend account through server-side Vercel Connect. No provider credential belongs in Astro, browser JavaScript or the repository. Implementation is present; deployment, sender verification and actual inbox delivery are separate owner-run acceptance steps. Defaults send nothing.

## Install and verify

```sh
cd services/newsletter
npm ci
npm test
# Uses private .env.local; creates and drops an isolated temporary schema.
npm run test:db
npm run migrate
```

The database test uses only synthetic `example.invalid` addresses. It exercises actual PostgreSQL locking, simultaneous single-use confirmation, expiry/replacement/withdrawal, concurrent durable limits, rollback, partial provider-sync failure, recipient isolation, simultaneous campaign prepare/send and persisted ambiguous-operation stops. Its provider boundary is a test double: no test calls Resend or sends mail. Migration prefers private `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` when available and otherwise uses the existing URL inside one transaction. Runtime, migration and database tests explicitly set `sslmode=verify-full` for genuine Neon hosts, preserving certificate and hostname checks instead of depending on legacy driver aliases. Local CI URLs keep their existing SSL settings.

Service dependency audit currently reports zero findings. The same-major Zod override replaces a vulnerable transitive pin in `@vercel/cli-config`; keep the lockfile and retest upgrades. This is separate from the static site's dependency audit.

## Owner deployment sequence

1. Use this directory as the root of the dedicated Vercel project `charitology-mail`, with Node `24.x`. Keep `.vercel/` and real environment files private. The public static Astro build stays on GitHub Pages.
2. Set private variables from `.env.example`, including `RESEND_SUBJECT_ID` for the stable authorized server identity; it is never accepted from a browser. Generate independent random secrets of at least 32 characters for `NEWSLETTER_ADMIN_TOKEN`, `NEWSLETTER_RATE_SECRET` and `CRON_SECRET`. Use the pooled `DATABASE_URL` for requests. Vercel supplies deployment OIDC for Connect; locally pulled OIDC expires. Never print credential values.
3. Run migration deliberately. Resolve the existing Resend domain allowance, add and verify `charitology.org` with its exact DNS records, and set `RESEND_DOMAIN_ID`. Preserve existing website and mail DNS. Check replies to `hello@charitology.org`. Disable open and click tracking on this dedicated domain: the service requires both actual API values to be false and refuses sending if either is enabled or unknown.
4. Run `node --env-file=.env.local scripts/setup-provider.mjs --create-preferences`. This creates/reuses the dedicated topic and segment, printing only their nonsecret IDs; it sends nothing. Set `RESEND_TOPIC_ID` and `RESEND_SEGMENT_ID` in Vercel. The topic must have `default_subscription=opt_out`, which requires explicit opt-in. Duplicate/paginated ambiguity or a wrong existing default stops setup. Inspect the provider after an ambiguous create before rerunning.
5. Deploy, attach `mail.charitology.org` and verify HTTPS, `/api/health`, `/privacy`, `/confirm` and `/unsubscribe`. Health checks database schema access and reports configuration flags; it does not prove inbox delivery. Leave `NEWSLETTER_SEND_ENABLED=false` until the actual sender is verified.
6. Configure a Resend webhook at `/api/webhook`, privately set `RESEND_WEBHOOK_SECRET`, and subscribe to supported delivery, bounce, complaint, suppression, `contact.created`, `contact.updated` and `contact.topics.updated` events. Verify real signed delivery. Event IDs are durably deduplicated; an unknown event is ignored. A signed `contact.created` may opportunistically resume only an existing confirmed pending activation; it never creates consent or sends mail. Resend documents that CSV imports do not emit these events, so daily maintenance and authenticated reconciliation provide independent recovery.
7. Keep `NEWSLETTER_TEST_ONLY=true`, privately set `NEWSLETTER_TEST_RECIPIENT`, then enable sending. Submit the real public form for that address. Open its email and press Confirm; GET alone must leave it pending. Confirmed contacts join only the dedicated segment and explicitly opt into its topic. Global unsubscribe and suppression are preserved.
8. Inspect protected preview/status, prepare the first native draft, inspect both formats and recipient scope, then deliberately send to the authorized controlled recipient. Verify actual inbox sender/body/plain text/postal footer/source links/native unsubscribe and future-send exclusion. Disable controlled-test mode only after the owner authorizes normal confirmed-subscriber operation.

Sender: `Charitology <hello@charitology.org>`. Reply address: `hello@charitology.org`. Postal footer: `938 Peacock Station Rd, McLean, VA 22102`. These are owner-supplied details, not legal certification or a claim that a funded institution exists.

## Public contract

- `POST /api/subscribe`: FormData, URL-encoded form or JSON with `email`, explicit `consent=yes`, and empty `website`. `Accept: application/json` gets `{ok,message}`; ordinary form posts get readable HTML. New, existing, suppressed, rate-limited and ineligible test addresses receive the same generic accepted message. Acceptance does not prove delivery. Provider rejection remains a private status record.
- Subscribe CORS permits exact origins from `NEWSLETTER_ALLOWED_ORIGINS`, defaulting to `https://charitology.org`. Add `http://127.0.0.1:4333` explicitly for local tests. No cookies are used.
- `GET /confirm?token=…` is a read-only explanation and POST form. POST atomically consumes a single-use token, records consent and requests provider preference sync. Tokens contain 32 random bytes; only SHA-256 hashes enter Postgres. Expiry is 24 hours; a replacement invalidates its predecessor.
- `GET /unsubscribe?token=…` is read-only. POST records durable withdrawal before preference synchronization. The query token plus URL-encoded `List-Unsubscribe=One-Click` body is supported for cancellation in signup mail. Native Broadcasts use Resend's native unsubscribe link and preferences.
- `/privacy` explains storage and retention. Token pages use `no-store`, `no-referrer`, no-index and a restrictive content policy. Keep hosting logs private and add no analytics to these pages.

Consent copy version `charitology-letter-2026-10-26-v1`: “I want to receive The Charitology Letter by email. I can unsubscribe whenever I choose.” It matches the public checkbox.

Bodies are capped at 16 KiB, signed webhooks at 64 KiB. Email input is bounded ASCII syntax. Default durable limits: one request/address/15 minutes, eight/IP/hour, 50/day overall. Limit keys store secret-key hashes, not raw IPs. The trusted Vercel edge IP header is used, never arbitrary `x-forwarded-for`; local requests share an unknown bucket.

## Private operation

All admin routes require `Authorization: Bearer <NEWSLETTER_ADMIN_TOKEN>`. Use a private client reading its environment, never a command containing the secret value or a public browser bundle.

| Route | Action |
| --- | --- |
| `GET /api/admin/status` | Counts and campaign states; no subscriber export |
| `GET /api/admin/preview` | Edition 1 HTML/text, subject and SHA-256 content hash |
| `POST /api/admin/reconcile` | Retry at most 20 pending preference updates; stop on provider error |
| `POST /api/admin/cleanup` | Remove expired limits, old pending requests/confirmation tokens and old webhook IDs |
| `GET /api/cron/maintenance` | Cleanup, then guarded bounded preference recovery when enabled/ready; independent `CRON_SECRET` bearer |
| `POST /api/admin/campaign/prepare` | Body `contentHash`; create one unsent scoped native draft |
| `POST /api/admin/campaign/send` | Body `contentHash`, `confirm=SEND THIS REVIEWED ISSUE`; verify draft and queue once |
| `POST /api/admin/campaign/reconcile` | Read saved provider status; never resend |

The Vercel cron runs daily at 06:00 UTC with its independent `CRON_SECRET`; verify the deployed cron succeeds. It cleans up first, then recovers at most 20 pending preference/import records only when sending is enabled and the actual sender/tracking/topic/segment readiness checks pass. A shared 45-second deadline bounds credential, provider and database work, leaving room within the 60-second function for connection/rollback cleanup. Individual failures do not stop later rows within the budget; failure or budget exhaustion returns 503 for operational review. It never prepares or sends a campaign. Disabled sending performs cleanup only. Pending requests are removed after seven days when cleanup runs, rate keys after two days, webhook IDs after 90 days. Consent and withdrawal evidence remain private; deletion must retain enough suppression information to honor withdrawal.

Prepare/send check the verified sender, topic default/name, segment name, pending-sync count, exact segment membership against private confirmed consent and the controlled-recipient gate. Send compares native draft HTML, text, subject, sender, reply address and topic/segment to the reviewed edition. Segment counts are not delivery counts: native preferences and suppression still filter delivery.

Native Broadcast creation/send have no documented idempotency guarantee. Committed intent precedes these calls; a nonblocking transaction-scoped advisory lock works through Neon's pooler. Competing preference/campaign requests fail busy and can be retried without occupying the connection pool while a winner needs an intent-write connection. `creating`, `create_unknown`, `sending` or `send_unknown` is a deliberate stop after a crash/ambiguous response. Never delete/reset such a record to blindly retry. Inspect provider drafts/status and delivery evidence first. Reconcile reports status without authorizing a resend. Each edition has one campaign record; a later issue needs a newly reviewed edition.

Only confirmed requests create provider Contacts. Ordinary `POST /contacts` is never used: actual provider testing showed that an email-only duplicate upsert resets a global unsubscribe. Instead a one-address native CSV import uses explicit `on_conflict=skip`, no memberships/preferences and a saved job ID/status. Real no-send contract testing confirmed both new creation and preservation of an existing true global unsubscribe. Sync checks the saved job/contact up to four times; asynchronous imports stay pending and resume through daily bounded maintenance or authenticated reconciliation. An ambiguous import submission can be retried only through the same skip-existing path, which may create another import job but never intentionally upserts a contact. New-contact import fails closed if any unrelated Topic has an opt-in or unknown default. Sync changes only the dedicated topic/segment and never resets a global unsubscribe, clears suppression or edits another topic. The shared team still has global Contacts/preferences; unrelated publications must use their own consented segments.

Each deliberate consent generation gets at most one Topic opt-in attempt, checkpointed before its provider call. A failed segment-add retry reads current native Topic state and preserves any opt-out. If the opt-in call was ambiguous and the native state is opt-out or unknown, activation stops; a new deliberate signup/confirmation is required. A mere new pending request never creates another opt-in authorization. Signed native Topic opt-outs become durable withdrawals. A valid event emitted before a newer DOI is ignored; an unparseable matching opt-out timestamp fails closed. Provider APIs offer no documented atomic preference version/CAS, so this uses their event emission timestamps and native preference filtering without claiming a stronger global ordering guarantee. Busy unsubscribe/webhook requests receive failure and need retry; already queued mail may remain in transit.

## Primary references

[Vercel Functions](https://vercel.com/docs/functions/functions-api-reference), [Connect](https://vercel.com/docs/connect), [authenticated daily cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Neon Node connections](https://neon.com/docs/guides/node), [Postgres transactions](https://node-postgres.com/features/transactions), [native skip-existing contact imports](https://resend.com/docs/api-reference/contacts/create-contact-import), [topic defaults](https://resend.com/docs/dashboard/contacts/manage-topics), [global unsubscribe](https://resend.com/docs/dashboard/contacts/managing-unsubscribe-list), [suppression](https://resend.com/docs/dashboard/emails/email-suppressions), [native Broadcast drafts](https://resend.com/docs/api-reference/broadcasts/create-broadcast), [draft retrieval](https://resend.com/docs/api-reference/broadcasts/get-broadcast), [idempotency scope](https://resend.com/docs/dashboard/emails/idempotency-keys), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests).

AI-assisted implementation and tests. Independent source/privacy/operational review remains review work; no legal-compliance certification is claimed.
