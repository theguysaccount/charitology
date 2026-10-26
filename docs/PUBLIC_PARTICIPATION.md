# Public operational intake

Implementation and acceptance draft · October 26, 2026 · AI-assisted engineering and review

This release adds account-free operational request forms to the shared Charity OS. The implementation is in the `public-participation` branch; deployment and hosted acceptance are not established by this document. The earlier shared OS release remains recorded separately in [SHARED_OS_RELEASE.md](SHARED_OS_RELEASE.md).

## Supported workflow

An owner or administrator prepares a Forms record with a title, collection purpose, typed questions and a retention review date. Another authorized reviewer must approve its current revision. The author cannot approve the revision they last edited. The form must be in its published workflow state before an administrator can create a public link. A linked event session or volunteer shift must also retain its exact independently approved, open revision.

The public link opens a standalone page that names the organization and purpose. A visitor can send a contact, event-interest or volunteer-interest request without creating an account. Explicit collection consent is required. A request enters a private administrator queue. It does not subscribe anyone to a newsletter, reserve capacity, book an event, assign a volunteer, send a message or transfer money.

An administrator separately records a review before converting the request. Conversion creates unapproved drafts or links an explicitly chosen existing operational contact. Email similarity does not merge identities automatically. Linked registration or assignment drafts are checked against current capacity, duplicate and scheduling rules, but do not reserve a place. Later staff workflow changes must still pass the domain rules and applicable approval gates. A review action is an accountable staff action; software does not establish that an independent human actually performed it.

Editing, deleting or closing the source form or linked target makes that publication unavailable for new requests and conversion. The saved public version cannot silently move to a later revision. Publish a newly approved version deliberately when appropriate.

## Data and authority boundaries

| Boundary | Implemented behavior | Limit |
| --- | --- | --- |
| Public form | Only the organization's name and deliberate publication schema are returned: title, purpose, questions, review date, consent wording and request limits. | An authorized publisher must inspect every public prompt. No screening rule can guarantee that its wording contains no personal information. |
| Answers | A separate private queue is available only to current owners and administrators. Generic module readers do not gain queue access. | This is a minimal operational form, not a case-management or sensitive-service intake system. |
| Anonymous tenant access | Fixed intake routes set one organization context inside a transaction. Both new tables enable and force tenant row-level security; every query is scoped to organization and publication as applicable. | The runtime database role must remain unable to bypass RLS. Route allowlists and database context are both required. |
| Source authority | Publication and conversion recheck the persisted revision, independent approval and current workflow state. | Imported actor claims and earlier reviews cannot grant fresh authority. |
| Public mutations | Same-origin JSON POSTs, bounded streamed bodies, explicit consent, a honeypot and durable request limits. Receipt tokens are rejected in query strings. | These controls limit abuse; they do not verify a person's identity or replace platform-level protection. |
| Receipt | A cryptographically random 32-byte bearer is shown once, held only as a hash in the database and placed in the private link's fragment. Status and cancellation return no answers or address. | Anyone holding the link can use it. Save it privately. The raw token cannot be recovered from its hash. |
| Retry | A client request identifier and normalized answer hash deduplicate an unchanged retry. Changed answers with the same identifier are refused. | If the first accepted response is lost, a retry does not reveal its original receipt. Without a saved receipt, contact the organization through another channel. |
| Conversion | Current-revision staff review, explicit existing-contact selection and normal record/capacity validation; new records start as drafts with no approval. | A draft, review status or receipt is not a booking, eligibility decision, payment authorization or independently verified identity. |
| Rendering | Public and administrator text is rendered as text nodes. The standalone page uses local assets, no-referrer policy and no-index metadata. | No-index metadata is a request to crawlers, not access control for the deliberately public schema. |

Allowed questions are short text, finite numbers, booleans, dates and bounded choices. Unknown optional answers stay `null`; an explicit zero or `false` remains an answer. Reserved `name` and `email` questions support minimal contact creation. Prompt keyword checks reject several sensitive categories, but cannot recognize every sensitive question, language or volunteered answer. Publishers and reviewers remain responsible for minimizing collection and using specialist systems when needed.

The current bounds are 30 questions, a 12,000-byte schema and a 16,384-byte total submission body. Text answers have a 300-character general limit, with narrower reserved contact bounds. An organization can accept at most 100 new requests per UTC day; its active pending/reviewed queue is bounded at 1,000 requests and 8 MiB of measured row data. Public submissions have a durable 20-per-hour IP-derived limit and receipt actions have a 60-per-hour limit. The stored IP identifier is keyed and hashed, not a raw address. The global workspace export budget also applies. These are implementation limits, not supported-throughput or uptime guarantees; [intake.mjs](../services/charity-os/lib/intake.mjs) is the exact contract.

## Withdrawal, erasure and retention

The private receipt can show status or record a withdrawal without an account. Opening a link never cancels a request; cancellation needs a deliberate POST. A closed publication does not remove the receipt holder's ability to withdraw. Withdrawal retains submitted answers and any links to separately prepared drafts for the organization's follow-up. It is not deletion.

Owners and administrators have a separate, revision-checked **erase submitted answers** action. It clears the queue answer object and its IP/payload hashes, records an erasure timestamp and keeps a minimal status/receipt/idempotency tombstone plus converted-record references. Pending or reviewed requests become closed so erased rows cannot occupy the active queue indefinitely. Erased requests cannot create new drafts.

Erasing a queue response does not erase a separately created contact, registration, assignment, immutable report, earlier source archive, database recovery copy or previously downloaded backup. Those have their own access and retention responsibilities. The software must say this before erasure. It does not claim remote deletion of files already held by an operator.

The published retention date is a **review and closure date**: after it passes, that publication stops accepting new requests. It is not an automatic answer-deletion schedule. Organizations must inspect the queue, decide what they still need and use the erasure control when appropriate. Do not promise automated legal compliance or that sensitive information can never be submitted.

Withdrawal, publication withdrawal and answer erasure remain available after the ordinary audit/export budget fills. A bounded reserve records minimal identifiers; if that reserve is exhausted, the safe action still completes with a redacted operational warning. Ordinary writes remain blocked until the operator resolves the limit.

## Recovery

Administrator JSON exports contain private publication schemas, queue answers and minimal status provenance. They omit receipt, idempotency, payload and IP hashes. Treat the export and its source archive as private organizational records. A later answer erasure cannot modify a backup already downloaded or an earlier retained source archive.

Restore requires an otherwise empty destination, validates the whole backup and refuses an oversized or malformed queue. Every restored publication is withdrawn, receipt capabilities are disabled, source approvals reset and earlier reviews confer no new authority. An erased response restores without answers and cannot re-enter the active queue. Recovered requests require manual handling; a newly approved form is needed for new public collection. No restored file automatically reactivates a public link, issues new consent or authorizes a booking.

## Acceptance and evidence

The following is the release checklist. A checked implementation or test assertion is not a claim that a real organization adopted the flow or a person performed a review.

| Scenario | Expected result | Evidence boundary |
| --- | --- | --- |
| Publish without approval; self-approval; edit source or target; expire review date | Refuse publication or immediately stop new acceptance/conversion. | Domain tests plus actual Postgres fixture; hosted browser check required. |
| Anonymous reads; foreign organization/publication IDs; contributor queue access | Only deliberate public schema is readable; private queue stays tenant/admin scoped. | Source review and constrained-role database fixture; production-role check must include both new tables. |
| Foreign/opaque origin, query token, missing consent, honeypot, malformed/oversized input | Reject before a new tenant intent; preserve explicit zero/false and unknown nulls. | Unit/request regressions and actual database fixture. |
| Concurrent unchanged request; changed-payload retry | One intent, one first-response receipt; no duplicate contact or draft. | Concurrent actual Postgres fixture; interrupted-response UI must explain receipt limits. |
| Receipt status and withdrawal after conversion or publication closure | No answers/addresses returned; deliberate withdrawal remains available and does not imply erasure. | Backend fixture and browser receipt/cancellation check. |
| Review, stale review, repeat conversion, duplicate contact, full capacity | Expected revisions enforced; separate review required; only unapproved drafts; no silent identity merge or booking. | Domain/actual database fixture and administrator browser flow. |
| Erase pending/reviewed/converted request, including full audit quota | Answers cleared, tombstone retained, active queue freed; no new conversion; separately prepared records unchanged. | Backend and recovery regressions; browser confirmation and displayed state required. |
| Backup and restore | Private answers preserved only where not erased; no bearer hashes or trusted restored approval; publications closed and receipts inactive. | Backup unit/actual database checks; explicit browser preview/commit and private exported-byte inspection required. |
| Keyboard, narrow viewport, validation correction, timeout/retry, receipt copy | Clear labels/focus/errors, no horizontal overflow, no unintended duplicate or changed-answer retry. | Browser acceptance and independent accessibility review remain distinct gates. |

Independent review ran the current complete service unit/browser-model command on October 26: **103 tests passed, zero failures or skips**. These tests do not drive a browser. The dedicated [unit](../services/charity-os/test/intake.test.mjs), [backup](../services/charity-os/test/intake-backup.test.mjs) and [actual Postgres](../services/charity-os/test-db/intake.test.mjs) fixtures are the executable specifications. This document does not claim the new database fixture, hosted deployment or intake browser journey passed merely because its code exists. Exact later results belong in [the release record](SHARED_OS_RELEASE.md).

Still open: an authenticated participant portal; editing one's submitted answers; confirmed booking/waitlist operations; staff or participant notifications; screening and safeguarding decisions; offline alternatives; specialist case handling; actual provider connections; consented pilot use; administrator training; support/incident ownership; and independent privacy, security and accessibility review. Public request forms complete only the bounded intake step of the wider people-and-participation plan.
