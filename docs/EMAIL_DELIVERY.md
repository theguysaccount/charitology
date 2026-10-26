# Email delivery: implementation and launch record

October 26, 2026. The real mail service is implemented, but **public email delivery is not enabled yet**. The owner approved the existing Resend account's USD20/month upgrade and its checkout is open in Chrome awaiting payment. Resend currently rejects a fourth domain on the existing three-domain allowance. No domain was removed, no charge has been verified, no subscriber address was collected and no message was sent during this implementation pass.

## Selected identity and infrastructure

The owner selected Vercel team `jacksonjezio-7345s-projects`, sender and reply address `hello@charitology.org`, and public postal footer `938 Peacock Station Rd, McLean, VA 22102`. The destination inbox and controlled test recipient are configured privately. Never copy them or subscriber data into this repository, the static site or public API.

The dedicated Vercel project `charitology-mail` is linked to `services/newsletter/`. The static Astro website remains on GitHub Pages. `mail.charitology.org` points to the exact Vercel-assigned CNAME, and Vercel reports its DNS configuration correct. The deployed service is reachable over HTTPS. Actual checks verified database health, disabled sending, protected administrative routes, exact-origin CORS, invalid-link handling, authenticated first-issue preview and authenticated maintenance. Production subscriber, import and campaign tables remain empty.

The existing Resend account is authorized through Vercel Connect connector `resend/charitology-mail`, attached to this project for development and production. The service obtains short-lived server credentials at use time; no provider key is embedded in the app. A dedicated native topic, **The Charitology Letter**, requires explicit subscription (`default_subscription=opt_out`). A dedicated empty segment, **Charitology confirmed newsletter**, is provisioned. Setup sent no email and changed no contact preferences. A read-only inspection found no unrelated Topics at that time; the shared account's global preferences remain an explicit boundary.

A private Neon Free database is provisioned and the initial application schema migrated. Its Vercel attachment is **production only**; preview deployments have no production database connection. Local operator credentials and generated Vercel state remain ignored. Automated database tests create and drop isolated schemas using synthetic addresses and provider test doubles; those tests never send mail.

The owner-supplied receiving destination is configured through a `hello` forwarding rule, re-read successfully. Public DNS lists Namecheap forwarding MX servers and its forwarding SPF record. Website records were preserved. Actual forwarded receipt remains a separate acceptance test.

## Implemented behavior

Read [the service operation guide](../services/newsletter/README.md) for configuration, routes and maintenance.

- Explicit consent, scanner-safe confirmation page, expiring single-use hashed confirmation credentials and durable private consent history.
- Accessible public form with a non-JavaScript POST path, bounded input, honeypot and durable per-address, per-IP and overall request limits. Public responses do not enumerate subscriber state.
- Scoped native Resend topic and segment, preserving global unsubscribe and suppression. Confirmation is required before creating a provider Contact. Provider synchronization failures remain visible privately and cannot authorize a campaign.
- Durable withdrawal, native subscription preferences and signed deduplicated webhook processing. No event reactivates a subscriber.
- Real first-issue HTML and plain text, approved sender/reply identity and complete postal footer. Open and click tracking must both be explicitly disabled on the verified sender domain.
- Protected preview/status, deliberate native draft creation, exact content/audience checks, one persisted campaign intent and a stop after ambiguous provider operations. No automatic issue sending or blind campaign retry.
- Sending defaults off. Controlled-test mode restricts all sends to the privately authorized recipient. A healthy endpoint or accepted provider API request does not establish inbox receipt.

Independent AI review and automated checks assist implementation; they are not human source, privacy or legal certification. See [program validation](PROGRAM_WORKSPACES.md) for the separate public software release.

## Verification so far

Thirty-seven service unit tests and real isolated-schema Neon integration tests pass. The integration covers simultaneous single-use confirmation, expiry, replacement, withdrawal, concurrent limits, saved import recovery, native Topic withdrawal, late-event handling and concurrent campaign state changes. Provider boundaries in those automated tests are test doubles; they send no email.

Separate bounded real-provider tests used disposable synthetic addresses only. Ordinary duplicate Contact creation unexpectedly reset a global unsubscribe. The service therefore uses native one-row imports with `on_conflict=skip`; an actual new import created one Contact, and a conflicting import skipped it while preserving the unsubscribe and identity. Synthetic Contacts were identity-checked and removed. Completed import-job diagnostics remain at the provider. No real recipient, membership or delivery was involved.

A secret-free GitHub job runs unit tests and real Postgres tests against a disposable container. Pages deployment depends on that job. The configured daily authenticated mail-service task cleans expired records and, only after delivery is enabled and readiness checks pass, recovers up to 20 pending preference/import updates within a shared 45-second budget. It never prepares or sends a campaign. CSV imports do not guarantee `contact.created` events, so recovery does not depend on that webhook. The branch and pull-request jobs both passed on GitHub, including disposable Postgres integration. Production Pages publication remains gated on those checks.

## Disabled production deployment

The final service code at commit `0ece039` was staged, checked and promoted as Vercel deployment `dpl_EwJJBZ8FQRLoAhmQhmExswMuTe6X`. The earlier disabled deployment was `dpl_7QYsYQHv28teE7VRnJtnfea2mzD6`. Public endpoint: `https://mail.charitology.org/api/health`; it reports `sendingFlagEnabled:false` and `controlledTestMode:true`. Successful preview/health/maintenance responses are not delivery claims. A dedicated nine-event Resend webhook is configured with a private signing credential. A real provider-signed synthetic Contact event reached the promoted service with HTTP200 and provider success; exactly one durable event record was present, and no subscriber was created. The disposable Contact was removed and absence verified. An unsigned request was rejected with400. No email or membership change occurred. A post-deployment error/fatal log scan for this final deployment returned no entries. No external log drain or independent uptime monitor is configured.

The initial runtime scan identified one PostgreSQL SSL-mode compatibility warning while its health request returned200. The final connection explicitly requires certificate and hostname verification for Neon; actual integration and final deployment checks completed without that warning. Local test connections retain their existing settings.

## Remaining launch acceptance

1. Verify the approved upgrade actually completed, check the domain allowance and keep transactional pay-as-you-go disabled. Do not create a second subscription or remove another domain.
2. Create `charitology.org` in the authorized account, disable both tracking settings, publish its exact returned DKIM and sending-domain records without replacing website or receiving records, then confirm verified sender status.
3. Sender-specific configuration remains pending. The reviewed service is deployed with verified custom-domain HTTPS, private database access, disabled-send health and authenticated bounded maintenance. Preserve those checks when enabling the sender.
4. The signed webhook is configured and verified for a synthetic Contact event. Still verify actual message-delivery and unsubscribe events during the controlled inbox test. Keep credentials server-only and out of public build logs and artifacts.
5. Enable controlled delivery and use the owner-authorized inbox: request, receive, inspect, deliberately confirm, reject replay, inspect native membership, send only the reviewed first issue and verify provider events separately from inbox receipt.
6. Verify native and local unsubscribe, durable future-send exclusion, expired links and the `hello` reply forwarding route.
7. Only after those checks, enable public confirmed signup, update public delivery copy and record the actual deployment and costs. Do not infer another list's consent or launch an unrequested campaign.

## Other attempted paths

Stripe Directory was attempted with official CLI 1.55.1 and Directory plugin 0.3.5. Both focused queries failed with:

> Invalid user agent. This endpoint can only be used by the Stripe CLI tool.

Stripe Projects plugin 0.50.0 catalog search found email services, but initialization preflight returned `BROWSER_AUTH_REQUIRED`. No initialization or login was retried. Its exact message and remedy were:

> No Stripe session with a live-mode account is signed in. Rerun this same `stripe projects init` command without `--preflight`, keeping every other argument (such as `--from` or a project name) and including `--json --yes`. It returns `BROWSER_AUTH_REQUIRED` with `details.reason` `handoff_prepared`, an `onboarding_url`, a `browser_url` and a `verification_code`. Ask the user to open `onboarding_url` to create or choose their Stripe Projects account, then approve the sign-in at `browser_url` with the code. Once they have, run that command again. Do not run `stripe login` yourself.

The skill governing that path requires the human to clear browser/account blockers. The alternate Vercel route above was chosen instead; Stripe onboarding is unnecessary if that route succeeds.
