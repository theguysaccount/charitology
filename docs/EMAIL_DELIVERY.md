# Email delivery: implementation and launch record

October 26, 2026. **Controlled confirmation, first-issue inbox delivery and withdrawal checks passed for one owner-authorized recipient.** Production Vercel Connect authorization is complete, and the production backend is enabled for normal confirmed signup. This activation release adds the public website form; its publication is gated by exact-head CI and the Pages rollout below. A prepared source flag alone does not establish a completed website rollout.

## Identity, plan and infrastructure

The owner selected Vercel team `jacksonjezio-7345s-projects`, sender and reply address `hello@charitology.org`, and public postal footer `938 Peacock Station Rd, McLean, VA 22102`. The receiving destination and controlled recipient remain private. Never copy them, subscriber data, authorization URLs or credentials into this repository or public artifacts.

The existing Resend account has the paid **USD20/month Pro plan**, with 50,000 monthly emails and ten domains. Transactional pay-as-you-go and optional add-ons are off. The dedicated Vercel project `charitology-mail` uses `services/newsletter/`; the static Astro site remains on GitHub Pages. `mail.charitology.org` has verified custom-domain HTTPS.

Vercel Connect connector `resend/charitology-mail` supplies short-lived server credentials. The owner completed the production browser authorization, and the actual production protected readiness request returned HTTP200. The earlier production `user_authorization_required` error is resolved; development success alone had not established production authorization.

A private Neon Free database is attached to **production only**. Preview deployments have no production database connection. The dedicated native topic, **The Charitology Letter**, requires explicit opt-in (`default_subscription=opt_out`). The dedicated segment is **Charitology confirmed newsletter**. Production records now contain the controlled test's consent, withdrawal, import and campaign evidence; they are not empty. Local operator files and generated provider state remain ignored.

## Sender, DNS and replies

Resend domain `charitology.org`, ID `5a7171c8-62dc-4c2c-9ebc-853026a0f56a`, is **verified**. Its four verification records were checked; `open_tracking` and `click_tracking` are explicitly false.

Namecheap's forwarding mail mode on `.org` drops custom MX records. The working arrangement preserves `.org` receiving, its apex forwarding MX records and the GitHub Pages website. `send.charitology.org` is a CNAME to `send.charitology.com`. The `.com` domain had no forwarding rules and now uses Custom MX with the SES sending MX and SPF under `send`. Its existing apex and `www` URL301 website redirects remain in place. Actual answers were checked at the authoritative nameservers and through `1.1.1.1` and `8.8.8.8`; Resend separately reports the domain verified. Do not replace receiving MX records with sending-domain MX records.

An owner-authorized message to `hello@charitology.org` arrived in the private Gmail inbox through the registrar-servers forwarding route, with DKIM passing. The actual first issue also had the expected `hello` reply address. Receiving and forwarding are verified separately from the issue-delivery check below.

## Controlled end-to-end evidence

Only the owner-authorized recipient received these controlled sends. No other recipients were sent mail.

- **Confirmation:** submitting the real form delivered a confirmation message to Gmail INBOX. HTML and plain text were inspected and DKIM passed. Opening its GET page left the request pending; a deliberate POST confirmed it. An actual replay returned HTTP400. Expired-link behavior also passed the real-database automated tests; it was not established by waiting for a live link to expire.
- **Membership:** after a fresh confirmation with the fixes below, the private application recorded one active subscriber. The native Contact had global unsubscribe false, the Charitology topic opted in and exactly one member in the dedicated segment.
- **Reviewed issue:** the protected preview contained 4,634 HTML characters and 2,856 plain-text characters, with SHA-256 `a3206bae9f3497914e7160b58984c5a1c3cea1ed550ddba205344ccf4f18f0f8`. The native unsent draft matched the reviewed content and scope before one deliberate send. Broadcast `59b9fda4-f4e8-40a4-b7b0-f2cd20a88217` progressed from accepted to provider-sent. Edition 1 retains its immutable accepted campaign state; do not reset it or send it again to work around a failure.
- **Actual issue receipt:** the message arrived in Gmail INBOX. HTML, plain text, reply address, postal footer, source links, resolved native unsubscribe link, one-click unsubscribe headers and passing DKIM were inspected. Provider acceptance and inbox receipt are separate observations; this one-inbox check is not a general deliverability guarantee.
- **Native withdrawal:** on the native preference page, the operator unchecked only the Charitology topic and pressed Update successfully. The actual provider also set global unsubscribe true. The application preserved that true value; it did not clear it or infer permission to resubscribe.
- **Local withdrawal:** opening the local unsubscribe GET page left counts unchanged. An actual RFC one-click POST returned HTTP200. Recovery against the actual private database and provider ended with one unsubscribed record, no pending sync and zero segment members. The recipient gate reported **No confirmed recipients**. Leave the test recipient withdrawn; do not resubscribe it or clear native provider flags.
- **Signed events:** provider-listed callbacks for `email.sent`, `email.delivered`, topic changes and global withdrawal succeeded and were durably recorded. Earlier unsigned-webhook rejection and duplicate-event handling remain covered. These delivery events do not prove a person read the message.

One owned, zero-member, unsent API probe was identity-checked and deleted. The temporary protected production authorization deployment was also deleted; its diagnostic endpoint is not retained. After a provider contract failure, the operator reset only the authorized test address's 15-minute request counter once for a fresh confirmation. IP and global rate limits were unchanged. No private recipient or token is retained in this public record.

## Fixes and verification

Three problems found in actual browser/provider checks were corrected:

1. The no-referrer confirmation form can submit `Origin: null`. Confirmation handling now supports that browser form path while keeping tokens, deliberate POST and origin checks.
2. Native topic PATCH requires a top-level array. The earlier wrapped object returned HTTP422; the array contract was verified with an actual HTTP200 opt-out test.
3. Repeating an already-completed topic opt-out emitted another provider callback and created a feedback loop. Recovery now reads current topic state and skips a no-op opt-out.

**48 service unit tests pass**, isolated-schema Neon integration passed in **63.5 seconds**, and the final **447-page build and website checks passed**. A separate agent's code review reported no findings. Tests cover confirmation races, expiry/replay, replacement, withdrawal, limits, import recovery, native preference boundaries and campaign state. Their provider transports are test doubles and send no mail. The content fixture now checks the edition footer structurally; the reviewed issue's content hash above did not change. AI-assisted implementation and review are not human source, privacy or legal certification.

Actual no-send provider testing also showed that ordinary duplicate Contact creation resets a global unsubscribe. The service therefore uses one-address imports with `on_conflict=skip`, a persisted import job and guarded recovery. New creation and conflicting-import preservation were verified using disposable synthetic Contacts, which were removed. No production recovery may clear global unsubscribe or suppression.

The secret-free GitHub newsletter job runs unit tests and actual Postgres tests in a disposable container, without provider secrets. Pages publication waits for that job and the static build/check. Daily authenticated maintenance cleans expired records, then recovers at most 20 pending preference/import records within a shared 45-second budget when sending is enabled and readiness passes. It never prepares or sends an issue. CSV imports do not guarantee `contact.created` callbacks, so recovery does not depend on one. See [the service operation guide](../services/newsletter/README.md) and [CI boundary](NEWSLETTER_CI.md).

## Deployment and publication gate

The final service code is `420342a8fe2fd0ac3ade99140f59d4bb9857e41e`, deployed as **`dpl_E7dxWwGAksASY5ydxo91Px1GxeHV`** at [the immutable deployment](https://charitology-mail-zovoa8qns-jacksonjezio-7345s-projects.vercel.app) and promoted to `https://mail.charitology.org`.

Actual post-promotion checks returned:

- Public health HTTP200: `sendingFlagEnabled:true`, `controlledTestMode:false`.
- Authenticated readiness HTTP200: `providerReady:true`.
- Private status: one unsubscribed record, `syncPending:0`, Edition 1 accepted and provider-sent. The test recipient remains withdrawn.
- Authenticated maintenance HTTP200: cleanup true, reconciliation completed zero, failed zero, `stoppedForBudget:false`.
- Production test-recipient setting removed. Public website CORS permits only `https://charitology.org`, alongside the mail service's own origin; a localhost preflight returned403. Unauthenticated administration returned401. The temporary authorization endpoint returned404.

Public Pages publication must pass exact-head static and newsletter/Postgres CI, then the main deployment. After rollout, verify the actual form, consent checkbox, endpoint, privacy links and RSS on both signup pages. Do not send another issue as a deployment check.

For history, the disabled service deployment was code `0ece039`, Vercel deployment `dpl_EwJJBZ8FQRLoAhmQhmExswMuTe6X`. PR #5 merged as `97f03fafba1f4697fd49e3a52023fe862cacc275`; its [Pages deployment](https://github.com/theguysaccount/charitology/actions/runs/40288691818) published the earlier pending-email message. These are historical records, not the normal-signup service deployment above.

Campaign publication remains a separate authenticated action for a reviewed issue and confirmed audience. Future editions need a newly reviewed edition; signing up does not automatically send a past issue. No external log drain or independent uptime monitor is configured. Neon connections explicitly verify certificate and hostname; actual integration checks completed without the earlier SSL-mode warning.

## Earlier provisioning paths

Official Stripe CLI 1.55.1 with Directory 0.3.5 returned an invalid-user-agent error. Projects 0.50.0 found email services but initialization preflight required browser/account authorization. That path was not initialized; the owner-authorized existing Resend account through Vercel Connect was used instead. No second subscription or replacement provider was provisioned.
