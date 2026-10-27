# Participation bookings acceptance

Implementation and acceptance record · October 26, 2026 · AI-assisted engineering and review

The [pre-implementation contract](PARTICIPATION_BOOKINGS_PLAN.md) defines the bounded event/volunteer fulfillment slice. This record distinguishes software tests, controlled fictional browser journeys and actual deployment evidence. It does not establish real participants, attendance, independent human approval, operating events or a consented organizational pilot.

## Working boundary

The Participation console supports one person, one place and the full event session or volunteer shift. An administrator first reconciles an exact hashed legacy inventory; duplicate, overlapping or over-capacity history blocks adoption. A scoped writer deliberately associates a typed candidate and contact, with exact converted intake provenance where applicable. Requested and waitlisted entries reserve no capacity.

New confirmation requires current independent source and candidate approval, exact expected revisions, specific approved-terms consent and an atomic capacity/overlap check. Promotion is manual. A FIFO suggestion has no eligibility/deservingness score; skipping an earlier currently eligible request requires an operational reason. Cancelling a place releases it once and never automatically promotes another person.

Confirmed fulfillment is separate from a typed record's working review state. Edits cannot silently free capacity, reschedule a frozen commitment or retarget a historical candidate. Generic edits, transitions, imports, trash recovery and deletion pass central guards. Legacy consent and unknown withdrawal dates remain unknown. Newly observed request withdrawals have a separate timestamp; new consent must follow that actual withdrawal.

The own-request portal exposes only the associated participant's state and deliberate public terms. Attendance consent, waitlist consent, email preference and cancellation are distinct. A private receipt alone cannot operate a booking. Withdrawing the original request, erasing its answers and unlinking account access do not cancel a confirmed place. Unlinking warns that self-service access is lost, supplies the approved organizer route and cancels unsent account-addressed notices.

**Participation mail is paused.** The base checkbox records a preference only and all new causal outbox rows remain paused. No provider transport is called. The [separate delivery contract](PARTICIPATION_DELIVERY_PLAN.md) requires fresh live-delivery consent and deliberate bounded activation; it cannot flush this historical backlog. Existing login, invitation and reminder delivery is separate.

## Database and recovery checks

The actual isolated Postgres suite uses a migration owner and a separate constrained application role, random temporary schemas, fictional identities and no external mail transport. Its checks cover:

- forced tenant RLS, writer-only staff reads and cross-program preview/roster identifier redaction;
- two confirmations competing for the last place, with exactly one winner;
- explicit waitlisting/manual promotion and unchanged occupancy through generic review edits;
- exact legacy adoption, duplicate/overlap refusal and frozen volunteer commitments;
- own-only consent/privacy, known withdrawal timestamps and explicit acknowledgement of unknown legacy withdrawal;
- latest-command exact replay without another allocation/audit/outbox event, changed-payload conflict and stale revisions;
- inactive recovery, no imported authority, retained former-confirmed occupancy and explicit reconciliation before enabling;
- actual row-count and PostgreSQL JSON-byte boundaries, with atomic rollback;
- full-storage cancellation and preference-off, with opt-in rejected and its saved revision/preference unchanged.

Limits include 500 targets/2 MiB, 2,000 retained participations/8 MiB and 8,000 paused outbox rows/8 MiB, including cancelled history. The 60 MiB conservative current-workspace export budget also applies. Cancellation and opt-out remain available after the separate audit reserve fills; a missing notification journal row is returned explicitly rather than stranding capacity. This does not promise another durable audit event after reserve exhaustion.

Backups retain bounded private fulfillment provenance. Recovered targets are paused and blocked, grants/consent cannot allocate, and former confirmed occupancy requires exact legacy reconciliation even if its typed records restore as drafts. Missing references for formerly confirmed history are rejected. Original source archives remain separate; restoring provenance does not establish a new human review or recipient authority.

## Actual Chrome journey

A private loopback fixture used actual Better Auth scanner-safe sign-in and cookies, the actual handler, a random constrained Postgres schema and captured synthetic `example.invalid` login mail. Staff and participants used separate host-only sessions. Approved source/candidate fixtures were explicitly seeded software provenance, not human review. No external provider was called.

Staff adopted a one-place occurrence and associated two exact intake/contact/candidate chains. Participant A deliberately claimed only the matching own request, affirmed specific terms and received a staff-confirmed place. Their portal showed frozen details and no rescheduling consent form. The active-place unlink warning explained the retained booking, organizer route and receipt limitation; A retained access.

Participant B claimed a separate request and separately consented to waitlisting. Staff waitlisted B while A occupied the only place. B withdrew the original request. Manual promotion was rejected because that withdrawal followed the earlier affirmation. Staff cancellation of A reduced occupancy to zero and left B waitlisted. B renewed specific consent, staff manually promoted B, and B separately cancelled their own participation. Final occupancy was zero. B erased answers and permanently unlinked; the own list and displayed private detail cleared.

A final constrained read confirmed both entries cancelled, occupancy zero, five outbox rows either paused or cancelled, no external jobs, and empty erased request answers with a known withdrawal timestamp. The disposable fixture exited successfully and asserted its temporary schema was absent. Browser error logs were empty. Local diagnostics included missing fixture asset/favicon messages and a loopback client-IP warning; this does not establish production IP behavior.

Browser verification found and fixed a native option-array coercion bug that the earlier simulated DOM harness had hidden. The harness now reproduces native coercion. The core journey preceded the later narrow ordinary-budget preference opt-in fix, which has separate exact-code Postgres evidence. It is not represented as a browser journey against every later commit. A subsequent stale picker-label correction has its own exact-head Chrome proof below.

This was desktop mouse/semantic-control verification. Dedicated mobile, keyboard/screen-reader, nonzero legacy adoption, unknown historical withdrawal, volunteer overlap and recovery browser journeys remain unexecuted; database tests provide their separately bounded evidence. No production participant data or real organizational approval was created.

## Release evidence

Runtime **`e6c880d6bb2f89b4ca2fa507372d25cb964c4f69`**, deployment **`dpl_4Zs32Y794voSwEkcPnEbrMgygJCG`**, was promoted to https://os.charitology.org. A post-promotion lookup resolved the custom domain to that exact deployment and commit. [PR #11](https://github.com/theguysaccount/charitology/pull/11) retains the public implementation history.

| Evidence | Recorded result and limit |
| --- | --- |
| Exact runtime CI | [Run 40448380106](https://github.com/theguysaccount/charitology/actions/runs/40448380106) passed **159 service unit/browser-model checks**, **44 actual OS Postgres checks**, **61 newsletter unit checks and its two actual Postgres checks**, and the **447-page** public build/check. Strict checks covered 11 inline public modules with zero diagnostics. |
| Production migration | The additive migration completed. The three new participation tables enable and force tenant RLS; all 19 tenant tables remain forced. The constrained runtime has no superuser/RLS-bypass/create-role/create-database/inheritance privileges. Context-free reads of each new table returned zero, and the logical-backup query returned zero for a nonexistent tenant. The nullable withdrawal column exists; no historical timestamps were backfilled. |
| Protected stage | **19 checks passed**, including private staff/own-route rejection, query-receipt rejection, foreign-Origin rejection, clean confirmation, shells and **8 exact deployed asset/shell SHA comparisons**. |
| Public origin | **20 checks passed**, including the same private boundaries/exact assets and HTTP-to-HTTPS 308. The actual signed-out Chrome portal opened without private data or a browser error. No production booking, intake or participant grant was created. |
| Browser follow-up | A fresh exact-`e6c880d` fixture verified the native picker says **managed** after adoption and refresh, preserving its selected target and agreeing with the detail badge. It used actual Better Auth/constrained Postgres and synthetic captured login mail, then exited 0 and asserted schema removal. This supplements the earlier core journey rather than relabeling it exact-head. |
| Mail and logs | No new real-provider emails were sent for booking acceptance; all participation events remain paused/cancelled. The inspected final deployment's error/fatal log window returned no entries. This is a bounded log observation, not an uptime or general-deliverability claim. |

The compatible pre-bookings application was main `f457bd9` / `dpl_HNLam6TVJogzw2K9hrRt8tAkTDuZ` (the application files match the earlier participant release). Preserve all additive tables and a current-version backup plus separate source archives on rollback. The older application cannot manage or export new fulfillment history; do not perform a destructive down-migration.

## Remaining gates

Participant notification delivery, real connector contracts, consented organizational pilots, staff training/support ownership and independent privacy/security/accessibility review remain separate work. Group bookings, partial/recurring shifts, automatic offers, screening, shared-resource capacity and attendance check-in need their own designs. No software record establishes an operating institution, impact finding, accreditation, ledger, payment settlement or named-charity rating.
