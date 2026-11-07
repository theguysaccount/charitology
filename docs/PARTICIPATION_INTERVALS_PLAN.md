# Partial volunteer intervals: implementation contract

Recorded November 7, 2026 before implementation, against `d1722b2b50168f929f1db17c9b5f040938f8d2cd`. This extends [the whole-occurrence booking contract](PARTICIPATION_BOOKINGS_PLAN.md); it does not replace its historical acceptance or claim a deployed feature. Implementation and verification remain pending.

## One requested interval

The slice is one person, one place and one contiguous requested interval within one explicitly opted-in volunteer shift. Event registrations and unopted-in shifts remain whole-occurrence. Independent source/candidate approval, current staff/program authorization, own-request account links and consent chronology remain required. Confirm before the parent shift starts, even if the requested subset starts later.

Add nullable typed shift field `allowPartialIntervals`. Only explicit true on an independently approved shift enables intervals. Absent/null/false preserves old whole-only semantics. Only true adds `intervalPolicy: {version: 1, mode: 'within-shift'}` to the closed public terms. Old whole terms and their hashes remain byte-exact; do not append null/default metadata to historical terms. Policy changes, like time/program changes, require explicit resolution of all noncancelled participation first.

`requestedInterval` is null for whole occurrence or exactly `{version: 1, startAt, endAt, timeZone}`. Bounds are `parent.start <= start < end <= parent.end`; its named zone must equal the approved parent zone and agree with both explicit offsets under the existing typed datetime validator. Preserve admitted strings. Equal-to-parent bounds are permitted only under the interval opt-in. Reject extra keys, invalid/DST-mismatched times, missing bounds, events and unopted-in partial requests. No implicit local-time conversion or duration rounding.

First specific consent fixes the range. After consent, changing it requires cancellation and a new typed candidate/request. Fresh consent after a nonmaterial source revision can reaffirm the same range. Existing unique booking/contact/intake rules remain, including intake/target uniqueness after cancellation; do not promise reuse of the same intake. Independent candidate approval is approval of the saved candidate, not an invented earlier review of a later participant-authored range. Staff confirmation deliberately reviews that range.

No groups, multiple intervals for one person/target, shared-resource allocation, substitutions, recurrence, late joining, general amendments, screening or automatic offers/promotion are included. Attendance/check-in and recorded worked minutes are separate. Never infer attendance, actual times or outcomes from a commitment. Event partial intervals and the remaining OS-PART-01 work stay open.

## Consent and current pins

Extend the existing staff/own consent request with optional `requestedInterval`; absence preserves the old whole-only contract. Staff offline evidence keeps its actual method/time/evidence fields without creating account identity or mail permission. The server derives:

`allocationHash = SHA-256(stable({version: 1, targetId, sourceRevision, termsHash, requestedInterval}))`

Store it with the exact consented range. It is a content pin, not a credential, independent human review, seat hold or a new preview registry. Return the own/staff requested interval, allocation hash and effective displayed range. Own responses expose no other person's range, hidden roster or queue rank.

Confirm/promote of an interval entry requires the exact allocation hash plus existing participation/target/candidate/consent revisions. Recheck current permissions, complete required visibility, approvals, source terms and consent under the organization lock. Missing new fields cannot downgrade an interval entry to whole. Genuine whole entries retain their existing request/command compatibility. Freeze the interval/hash beside existing full source terms and approval provenance; do not rewrite old frozen terms.

Keep latest-command idempotency: after fresh authorization, explicit Retry of the exact unknown-result command returns the saved result without another allocation/audit/outbox transition. Intervening commands or changed payloads require the current reconciliation path. Do not retry automatically or invent a new key to evade uncertainty. Preserve unfinished literal fields on invalid/stale responses and after file/recovery actions.

## Persistence and bounds

Add only nullable `os_participations.requested_interval jsonb`, SQL NULL for legacy/new whole. Non-null is the closed v1 object, capped at 1,024 UTF-8 bytes of PostgreSQL JSON text and the existing per-field typed bounds. There is no backfill, authority rewrite, new table, role, membership, RLS policy or grant. Do not reinterpret old generic assignment `startAt/endAt` fields as allocation authority.

A distinct field preserves an unconfirmed choice through inactive restore after live consent is cleared. Hiding that choice solely in consent would lose writing or revive authority; using old generic fields would reinterpret existing data. Include it in the existing limits: 500 targets/2 MiB, 2,000 retained participations/8 MiB, 8,000 outbox rows/8 MiB with 2 KiB payloads and the conservative 60 MiB complete workspace export budget. Cancelled/recovered rows still count. Unknown/zero capacity is never unlimited.

Migration must preserve every old row/field and protected schema/function/ACL fact apart from the reviewed additive column. Keep actual before/after evidence. Deploy server, clients and backup codec together; an older writer cannot safely export/manage new interval entries. Rollback after the first such entry requires explicit preservation/recovery, not silent downgrade. This contract authorizes no production migration or provider action.

## Shared concurrent occupancy

One pure helper validates/extracts effective intervals, half-open overlap and peak occupancy. It imports no database, provider, environment or UI. Confirmed interval-aware entries use frozen interval; genuine old whole entries use validated frozen whole terms. Ambiguous/malformed history fails closed for reconciliation. Unmanaged generic assignments retain conservative whole-parent ranges.

Under the existing organization advisory transaction lock, use the complete authoritative ledger and unmanaged references, never the filtered/paginated roster. Do not count managed generic projections again. Sweep at most 4,000 endpoints for 2,000 retained rows, processing ends before starts at equal instants. Proposed range plus existing rows must have maximum concurrent occupancy no greater than known capacity. Keep cumulative `confirmedCount` distinct from `peakOccupied`.

At capacity one, different people `[09:00,10:00)` and `[10:00,11:00)` both fit even though confirmedCount is two. `[09:30,10:30)` conflicts. A legacy whole `[08:00,16:00)` entry occupies every included slice. A person still cannot create two active rows for the same target. Across volunteer targets, compare exact frozen intervals and unmanaged whole schedules; errors must not reveal another program's private roster.

Use the same calculation for confirmation/promotion, capacity reductions, summaries, exact legacy/recovered adoption, waitlist fit and all generic save/transition/import/trash restore/source-time paths. The pure typed validator currently counts active generic rows/full parent schedules. Supply server-derived, owned allocation context for managed validation under the same lock; JSON cannot supply a bypass flag. Keep the central database guard mandatory. Missing required context must refuse an interval mutation rather than revert to the old count reducer. Preserve unmanaged rules. Do not replace the attendance helper's booking context count with peak occupancy.

FIFO suggestion chooses the earliest currently approved, consented request whose actual range fits capacity and other commitments. Skipping an earlier fitting entry still needs the existing bounded operational reason. Requested/waitlisted rows consume no capacity. Cancellation releases its range once and never automatically promotes anyone. Source changes invalidate old suggestion/revision pins.

## Inactive recovery and notifications

Participation backup sub-block version 3 retains the top full-backup version. Accept genuine v1/v2 whole history unchanged. Reject interval-only keys smuggled into an old sub-version. Version 3 preserves requested range, frozen range/hash and historical consent, including cancelled and unconfirmed entries; update both the consent whitelist and closed recovered projection.

Restore imports no live consent, last-command authority, eligible delivery backlog or participant account grant. Noncancelled rows become inactive recovered Requested entries. Former confirmed ranges remain historical occupancy claims and recovery-block the target. Exact adoption/reconciliation includes those ranges and old whole occupants; changing an endpoint invalidates the adoption hash. Never discard/broaden a range to make capacity fit. Existing confirmed-history missing-reference, duplicate and atomic refusal rules remain.

Identity/program/time/policy edits stay blocked while noncancelled participation exists. Known capacity can change only without dropping below peak occupancy, with fresh source approval and revisioned consent before a new confirmation. Working review/completed labels cannot silently free frozen commitments.

No new mail purpose, provider or opt-in: retain existing delivery consent/template/portal/opt-out gates. Confirmed partial delivery expiration uses the frozen interval end, and the private portal shows its range alongside the original approved occurrence. Restore cannot queue sends or grant access.

## Required verification

Use actual existing typed/booking/own-portal code, not a parallel model. Meaningful tests must cover:

- Exact old whole terms/hashes and v1/v2 backup compatibility; no default opt-in rewrite. Invalid/extra/bounded/time-zone/DST/overnight ranges and unsupported event/shift requests refuse.
- Adjacent ranges, maximum peak versus total count, unknown/zero capacity, simultaneous overlapping final-place requests, exact-limit/reduction behavior and same-person uniqueness. Test both managed/unmanaged conflict directions and hidden program scope.
- Nonallocating preparation/waitlists at full capacity, earliest fitting suggestion, explicit skip reason, stale pins and once-only cancellation with no automatic promotion.
- Current approval/role/program/visibility/withdrawal/start-time guards; exact unknown-result Retry produces one durable result and altered commands do not duplicate it.
- Every generic edit/import/intake/transition/trash/source path uses authoritative managed context without accepting JSON authority or over-rejecting adjacent partial rows through old count rules.
- Version 3 roundtrip preserves all ranges while restoring no consent/command/delivery/account authority. Former confirmation blocks new allocation until exact reconciliation; malformed/missing/duplicate history refuses atomically. Old sub-version plus interval fields refuses.
- Actual retained caps/complete backup budgets and additive migration preservation under a new owned isolated PostgreSQL fixture, with constrained RLS/context-free reads. No production/provider/mail action.
- Actual mounted staff/own controls retain raw writing on stale/invalid/unknown results; explicit range/consent/Retry and current focus work. Finite keyboard/390px light/dark browser proof remains separate from real hosted auth/business acceptance.

Completion is this one-interval volunteer flow and its bounded evidence. It does not establish charity adoption, measured attendance, complete accessibility conformance, participant check-in or completion of all OS-PART-01 capabilities.

## Recorded recovery clarification

Before the recovery-envelope implementation, the contract adds this version 3 case: an unconfirmed recovered request can retain a closed nonallocating history object in `frozen`, exactly `{version: 1, allocationKnown: false, sourceHistory: {state, terms, sourceRevision, termsHash, consent}}`. `state` is the actual archived requested/waitlisted state; an already cancelled unconfirmed source can retain its known cancelled state without inventing its prior state. Existing explicit original requested/waitlisted history remains unchanged if later cancelled. `terms` and the bounded historical consent are exact archived facts; `consent` can be null when unknown. The separately admitted `requested_interval` remains the requested range.

This object has no top-level allocation interval/hash, approval, live consent, participant account link or delivery authority. Every confirmed/former-confirmed allocation reader must reject `allocationKnown:false`, never fall back to whole-shift occupancy. Its original state/terms/consent survive repeated export→restore. A later live confirmation still needs fresh specific consent and all normal approvals/current pins. Count the complete envelope within retained participation/whole-backup limits and refuse overflow atomically. Genuine version 1/2 recovery behavior remains unchanged.

Older unconfirmed consent stores only a source revision/hash, so its original public terms may no longer be available. In that nonallocating history variant only, `sourceHistory.terms` is null unless a retained snapshot actually matches the original terms hash. Preserve the exact revision/hash/consent; never substitute current or last-management terms merely because they are available. New interval-aware consent can retain its server-derived exact reviewed public terms after hash-consistency checks within the complete-row quota. Old whole consent shapes and hashes are unchanged. Confirmed/former-confirmed history still requires valid known frozen terms and allocation and refuses missing or mismatched evidence.

## Recorded complete-backup capacity clarification

A wholly legacy state keeps the genuine version 2 participation serializer: no interval-policy terms, requested interval, allocation hash or nonallocating marker is present. It does not synthesize duplicated public terms merely because a new server exports it. This preserves the existing near-capacity owner's v2 exit/restore path. Any interval-aware/history state uses version 3 with all known history retained; no history is dropped to downgrade it.

Before an ordinary affected mutation commits, measure the exact exported participation arrays, exact inactive normalized projection and complete workspace backup under the existing organization lock. This also covers source edits that do not call the booking quota helper. Retained database-row accounting still applies. Reserve future cancellation/opt-out growth from the exact bounded latest-command hashes/action/revision/notification flag, disabled delivery-consent shape and timestamp/revision encodings; use the larger conservative database/native bound, not an assumed 256 bytes. Safety-only actions check actual hard export caps without requiring that ordinary growth reserve again. Existing outbox `budget_bytes`, emergency audit and explicit notification-not-queued behavior remain. No cap is raised. A new opt-in/interval transition that would make a formerly valid legacy exit too large must roll back atomically, leaving the old v2 backup available.
