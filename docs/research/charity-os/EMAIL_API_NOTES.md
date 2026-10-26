# Resend newsletter flow: official API notes

Checked October 26, 2026, America/Los_Angeles. **Draft technical research.** Official documentation and Resend's own example were inspected; no account access, provisioning, contact changes or email sends occurred for this review. The Vercel Connect authorization remains the owner's action. Account entitlements and actual granted scopes are still unverified.

## Recommended division of work

Use Resend's native **Contacts, Segments, Broadcasts, unsubscribe preferences and suppressions** for ongoing newsletter operation. Add only the website signup/confirmation bridge, its abuse controls and the minimum durable consent/token state needed for the promised behavior. Native Broadcasts already manage queuing, throttling and scheduling; rebuilding a newsletter sender or an unsubscribe platform is unnecessary. [Broadcast overview](https://resend.com/docs/dashboard/broadcasts/introduction)

The current [Contacts guide](https://resend.com/docs/dashboard/contacts/add-contacts) documents CSV import, API, CLI, manual entry and contact creation through Automations. A native hosted signup form or a native double-opt-in endpoint was **not documented in the reviewed index/guides**. Resend's [April 11, 2025 post](https://resend.com/blog/launch-week-behind-the-scenes) explicitly said double opt-in was not native at that time and links its [MIT example](https://github.com/resend/resend-double-opt-in-example). That older statement alone is not proof that no newer feature exists; verify the authorized dashboard before building an alternative.

The example adds an initially unsubscribed contact, sends confirmation and switches the contact to subscribed. It uses the older Audience model, so it is a conceptual reference, not a current drop-in implementation or proof of expiry, abuse protection or one-time-token guarantees.

## Native subscriber state and personalization

A Contact is a global entity in a Resend team, keyed by its email address. It can belong to zero, one or several Segments and have Topic preferences. Segments are internal grouping; Topics are subscriber-visible preferences. Keep pending signup requests outside the active confirmed-newsletter Segment. Do not treat merely adding a Contact as proof of consent. [Contacts overview](https://resend.com/docs/dashboard/contacts/introduction)

The [Contact properties guide](https://resend.com/docs/dashboard/contacts/properties) supports custom string/number properties, with case-sensitive alphanumeric/underscore keys up to 50 characters. Properties must be created before setting values; an unknown property or wrong type causes an error. ISO consent timestamps, consent-copy version and signup source could be stored as string properties. They are application-defined fields, not independently verified consent. The [update endpoint](https://resend.com/docs/api-reference/contacts/update-contact) supports updates by ID or email and permits clearing values with null. Its listed value types are broader than the property-creation types; use documented string/number property definitions and verify the chosen representation.

**Strict single use needs an atomic decision.** The reviewed Contact APIs do not document compare-and-set, conditional version updates or a transaction that atomically checks and consumes a DOI token. Storing a token hash/expiry/used flag in custom properties may be useful metadata, but a read-then-PATCH sequence alone does not establish race-safe single use. Use an atomic durable consume operation if that guarantee is promised, or verify an equivalent native capability first. This is a design inference from the documented API, not a claim that every internal Resend operation lacks transactions.

Use a dedicated confirmed-newsletter Segment and, if useful, a newsletter Topic. Topic defaults are easy to misread: the [Topic guide](https://resend.com/docs/dashboard/contacts/manage-topics) says `opt_in` defaults contacts to receiving the Topic unless they opt out; `opt_out` requires an explicit subscription before delivery. The default cannot be changed after creation. Check actual behavior with synthetic contacts before activating a Topic. [Create Topic](https://resend.com/docs/api-reference/topics/create-topic)

## Broadcasts, unsubscribe and suppressions

- Create newsletter issues as drafts first. `send` defaults to false on [Create Broadcast](https://resend.com/docs/api-reference/broadcasts/create-broadcast). Provide both HTML and plain text if exact text matters; otherwise Resend can generate plain text from HTML. Include the active Segment and, when used, the Topic on every issue.
- A Broadcast created with the Dashboard editor cannot be sent with the API send endpoint; that endpoint accepts API-created Broadcasts. Pick one authoring path for the initial issue and keep its saved ID. [Broadcast API guide](https://resend.com/docs/dashboard/broadcasts/send-broadcast-with-api), [Send Broadcast](https://resend.com/docs/api-reference/broadcasts/send-broadcast)
- Include `{{{RESEND_UNSUBSCRIBE_URL}}}` as the footer link target. Resend generates a recipient/Broadcast-specific preference link and maintains unsubscribe/Topic state. The [hosted unsubscribe page](https://resend.com/docs/dashboard/settings/unsubscribe-page) supports branding and applies across domains in the team. Removing its Resend branding requires a qualifying paid plan. [Editor unsubscribe instructions](https://resend.com/docs/dashboard/broadcasts/editor#broadcast-unsubscribe-link)
- The Contact's global `unsubscribed` state blocks Broadcasts and Automation emails. Ordinary transactional API/SMTP sends can still deliver unless a Topic restriction is supplied. Newsletter campaigns should use Broadcasts, rather than transactional sends that accidentally bypass newsletter preferences. [Subscription behavior](https://resend.com/docs/dashboard/contacts/managing-unsubscribe-list)
- Suppressions cover the entire team across domains, for transactional and Broadcast sending. Hard bounces, complaints and manual suppression are supported; APIs and webhooks expose their state. A signup must not automatically clear a suppression. [Suppression guide](https://resend.com/docs/dashboard/emails/email-suppressions)

A signup handler must retrieve an existing Contact before choosing how to change it. Do not reset another publication's global preferences, Segment memberships or Topic choices. A dedicated Charitology Resend team would simplify boundaries; whether the authorized account uses one remains unknown. Default create/upsert conflict behavior and concurrency semantics were not established in the reviewed create-contact reference.

## Transactional confirmation and reliability

A functional confirmation message is a transactional send. [Send Email](https://resend.com/docs/api-reference/emails/send-email) supports HTML/text, a sender, subject, tags, custom headers and optional Topic controls. For signup, send to one address; never expose the subscriber list in recipient headers.

Use a stable idempotency key for a particular confirmation attempt and identical payload on retry. The [current idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys) specifies a 1–256-character key and 24-hour retention for supported send endpoints. Reusing a key with a different payload produces a 409; concurrent requests can also return 409 and may be retried later. Its supported endpoint list does **not** include creating/sending Broadcasts or mutating Contacts. Do not assume idempotency headers protect those routes. Keep the Broadcast ID and reconcile status before retrying ambiguous campaign operations.

[Usage Limits](https://resend.com/docs/api-reference/rate-limit) documents a default team-wide rate of 10 requests/second, shared across keys; inspect the actual headers and account setting. Respect `retry-after`, separate 429 rate errors from quota exhaustion and keep retries bounded. Native Broadcast delivery already throttles recipients.

For a small initial deployment, Resend's own [current quota guide](https://resend.com/docs/knowledge-base/account-quotas-and-limits) lists free transactional limits of 100/day and 3,000/month, free marketing up to 1,000 contacts/month and up to three verified domains. Sent and received transactional emails count toward quota; the free day resets at midnight UTC. These are public plan snapshots, not confirmation of the owner's actual account. Do not enable a paid plan or overages implicitly. The guide states email content/events/log retention is normally 30 days; retain the minimum required consent evidence outside ephemeral delivery logs if needed.

## Webhook handling

Verify the **raw request body** with Resend's SDK/Svix helper and the endpoint signing secret. The example supplies `svix-id`, `svix-timestamp` and `svix-signature`. Parse/process only after verification; JSON reserialization can break the signature. A valid signature is not a deduplication mechanism: record processed event IDs and handle duplicate/out-of-order deliveries deliberately. [Verification guide](https://resend.com/docs/webhooks/verify-webhooks-requests)

Resend retries failed deliveries with backoff and supports replay of succeeded as well as failed events. Persistent endpoint failures can disable the endpoint. The application must therefore tolerate duplicate events, expose meaningful delivery/suppression state and monitor endpoint health. [Retries and replays](https://resend.com/docs/webhooks/retries-and-replays)

Use delivery/bounce/complaint/suppression events for diagnostics and reconciliation. A delivered event indicates the delivery path, not that a person read the email or confirmed consent. Keep pending confirmation separate from delivered status. Gmail does not always return complaint feedback, so lack of a complaint event is not proof of satisfaction. [Suppression guide](https://resend.com/docs/dashboard/emails/email-suppressions)

## OAuth scope needed after the owner authorizes

| Operation | Documented scope |
| --- | --- |
| Send transactional email, send an existing Broadcast | `emails:send` |
| Create/retrieve/verify domains | `full_access` |
| Retrieve/create/update Contacts, properties, Segments or Topics | `full_access` |
| Create/list/retrieve/update Broadcast drafts | `full_access` |
| Create/list/manage webhooks or suppressions, inspect usage | `full_access` |

These are the two coarse scopes in the [OAuth client guide](https://resend.com/docs/guides/building-a-resend-oauth-client), rather than separate domain/contact permissions. An omitted scope gets both by default, so request explicit scope and inspect the actual grant. An `emails:send` grant alone cannot configure the full newsletter lifecycle.

The [token reference](https://resend.com/docs/api-reference/oauth/token) documents 900-second access tokens and rotating refresh tokens with a 60-day lifetime renewed on issue. Refresh operations must be serialized and the rotated token stored atomically; reuse of an old token can revoke the grant. Refresh can narrow existing scope but cannot escalate it. Let Vercel Connect manage provider token handling where its connector does so; do not build a parallel OAuth token store or expose tokens to the public Astro client. Exact Vercel connector-granted scope remains an authorized-account check.

## Minimal end-to-end acceptance proof

After the owner authorizes the provider connection and account scope is known:

1. Inspect actual team, usage, allowed sending domains and subscriber isolation before creating anything.
2. Verify the chosen sender's DNS with the provider's exact records while preserving existing website/mail DNS. Confirm the displayed sender/reply address.
3. Submit an explicit newsletter signup with a controlled address; pending requests must remain outside active campaign delivery.
4. Send a confirmation, then exercise expiry, tampering, repeat submission and simultaneous token replay. Confirm only the intended transition occurs. Do not allow a GET-prefetch/scanner alone to silently consume a single-use subscription action; a deliberate confirmation action is a proposed protection.
5. Confirm the Contact is in the intended Segment/Topic, with the actual consent timestamp/version. Preserve unrelated preferences.
6. Prepare the real first issue as a draft and test it with an authorized controlled recipient. Verify visible unsubscribe, actual delivered headers, text fallback, source links and a usable body.
7. Unsubscribe, attempt another issue through the normal Broadcast path and confirm the recipient is excluded. Exercise a bounced/suppressed test separately.
8. Use Resend's [official test addresses](https://resend.com/docs/dashboard/emails/send-test-emails) for simulated `delivered`, `bounced`, `complained` and `suppressed` events; these consume quota and do not prove arrival in a human inbox.

Still unknown: actual account/marketing entitlements, granted scopes, existing contacts/team boundaries, sender identity/reply handling, a native hosted signup/DOI feature if present only in the authorized dashboard, exact property-count/value-size quotas, atomic contact mutation guarantees, Broadcast endpoint idempotency and actual inbox delivery. No production email-delivery claim follows from these notes alone.
