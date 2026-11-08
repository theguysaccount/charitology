# Participant self-check-in plan

Draft implementation contract · November 7, 2026 · AI-assisted

This finite component extends the [booking contract](PARTICIPATION_BOOKINGS_PLAN.md) and [confirmed interval contract](PARTICIPATION_INTERVALS_PLAN.md). It is not a released check-in feature or evidence of actual attendance. The original 66-item brief and separate staff-reported whole-occurrence attendance remain intact.

## One assertion and a terminal withdrawal

A verified participant may deliberately report their own arrival for one already confirmed live commitment, then withdraw that assertion once. The future backend must freshly prove the same active own-request grant, current parent/booking identity, confirmed nonrecovered staff/intake participation and exact frozen commitment before proposing a new report. The pure model does not authenticate roles, sessions, accounts or database state. Existing legacy/recovered history does not grant reporting authority.

A report is **unverified self-reported arrival**. It does not allocate a place, confirm a request, create attendance, approve anything, record work/minutes, send mail or imply a charitable outcome. No report means not reported, not absent or zero. No checkout, edits/resubmission, free-text casework, screening, location/device proof or automatic attendance aggregate is included. Staff can read a scoped unverified claim; verification and ordinary aggregate attendance require separate deliberate evidence/workflows.

Show a separate initially unchecked affirmation: “I am reporting my own arrival. The organization can retain and review this unverified report. This does not record attendance or time worked.” Fixed affirmation version is `arrival-self-report-v1`; it changes no booking, collection, waitlist, delivery or newsletter consent.

## Exact time policy

Let the strictly validated frozen effective commitment be `[S,E)`, including the exact confirmed subinterval when present. New submission is permitted at server time `N` iff `S <= N <= E + 86,400,000` elapsed milliseconds. Claimed arrival `A` must satisfy `S <= A < E` and `A <= N`. No early or future arrival, inferred time, duration or calendar-day rounding is accepted. This 24-hour window is an engineering policy, not an organizer claim or research conclusion.

The future backend must provide one fresh SQL `clock_timestamp()` after the org lock and authority/revision checks. Transaction-start `now()`, host `Date.now()` and browser clock are not authority. The pure model requires an explicit canonical UTC server instant and never reads a current clock. Submitted/affirmed time is server processing time; claimed arrival is the person's assertion.

Product controls start blank with local date/time in the displayed frozen IANA zone. Resolve through the existing strict civil-time utility: one unique instant needs no extra choice, a fold needs an initially unselected earlier/later choice, and a gap refuses while preserving incomplete writing. Users need not type ISO offsets. The final API instant still includes seconds/explicit offset and must agree with the frozen zone; preserve admitted spelling.

## Closed model and history

New pure module `participant-check-in-model.mjs` reuses `security.mjs` stable hashing and `schedule.mjs` instant/zone validation. It emits detached frozen values, rejects undocumented fields and unsafe object inputs, and exposes content/receipt matching, not authorization handles. Raw network parsing, SQL/RLS, actual composite-row capacity and UI remain future integration.

Server-owned creation context is exactly `{id,orgId,participationId,moduleId,bookingRecordId,revision,intakeRevision,frozen,requestedInterval}`. IDs use the existing opaque identifier profile. `frozen` is the saved staff/intake confirmation shape, with original public terms/hash/source revision, candidate revision/approval, nullable program and optional confirmed interval/hash. Its interpretation grants no new approval. Commitment checksum uses the existing stable hash of `{method:'participant-check-in-v1',kind:'commitment',orgId,participationId,moduleId,bookingRecordId,frozen,requestedInterval}`. New report `id` and mutable participation/intake revisions are excluded from that hash. They remain separate creation and request-revision pins.

Report input is exactly `{revision,intakeRevision,checkInRevision,commitmentSha256,claimedArrivalAt,reportConsent:true,consentVersion:'arrival-self-report-v1',idempotencyKey}`; new `checkInRevision` is zero. Withdrawal is exactly `{checkInRevision,reportSha256,withdraw:true,idempotencyKey}`. Intent keys retain the existing 16–100 opaque-character bounds.

Historical claim is exactly `{id,originOrgId,participationId,moduleId,bookingRecordId,programId,commitment:{sourceRevision,termsHash,range,allocationHash},claimedArrivalAt,submittedAt,affirmation:{version,at,actorHash},claimSha256,withdrawnAt}`. `range` is `{startAt,endAt,timeZone}`; program is an ID or null; allocation hash is null only for whole commitments. Original claim checksum excludes only its own `claimSha256` and `withdrawnAt`, so terminal withdrawal retains the original checksum. This is content integrity, not a signature or proof of presence.

The proposed sidecar record is `{originMode,revision,liveParticipationId,history,reportReceipt,withdrawalReceipt}`. A live record has one report receipt and at most one terminal-withdrawal receipt; original accepted results remain separate from current disposition. Report is revision 1, withdrawal revision 2. A recovered record has no live participation FK, receipts or current reporting authority. Its original reported/withdrawn history is preserved and labeled imported unverified history-only, including orphaned historical parents; it does not recreate them.

The optional `participantCheckins` backup family is exactly `{version:1,entries:[{id,history}]}`. Omit it when no history exists. Reject duplicate IDs or original organization/participation identities, malformed history and overflow as a whole. Restore creates only inactive recovered candidates; repeated export/restore preserves original claims without nested wrappers, new times, receipts, accounts, live consent, allocation or mail. Existing participation v1/v2/v3 and frozen Learning/Incubator formats remain unchanged.

## Retry, privacy and bounds

Future backend authorization always precedes receipt lookup. Existing-record report Replay takes only the closed stable identity context `{orgId,participationId,moduleId,bookingRecordId}`; it needs no new report ID, new frozen source, current revision or eligibility computation. Exact accepted report/withdrawal Replay can return its original result after later expiry, parent/source changes or withdrawal, together with the actual current disposition; it must perform no write/audit before trusted receipt-Replay classification. New/altered commands still require current pins and eligible state. Recovered history cannot supply a live receipt. Foreign account knowledge, a content hash or supplied context is never sufficient authority.

After response loss, malformed success, 5xx, or a later 429/definitive refusal while already uncertain, the UI must retain the original body/key and offer explicit Retry only. Clear only on strictly validated success or deliberate authoritative saved-state reconciliation. A failed follow-up read cannot erase a known saved outcome or audit warning. No pending intent is silently cleared by an ordinary participation reload.

Cancellation prevents a new report but does not retract an earlier assertion or erase it. Separate terminal withdrawal remains available after the deadline/cancellation while the own grant stays valid. Permanent unlink/revocation blocks future own access and Replay; retained organization history grants no account link. Staff access must retain current source/booking/contact and historical program scope. Pagehide/dispose/session failure clears private DOM and obsolete completions.

Proposed limits remain 2,000 retained records/4,194,304 full-row JSON bytes; historical JSON <=2,048 bytes, each of two receipts <=1,024 and complete SQL row <=8,192. Pure checks bound admitted JSON only; actual SQL composite/native/global accounting is not established by unit tests. Future integration must compose exact inactive projection and prepaid terminal-withdrawal/audit growth with existing required operational totals and 60/64-MiB workspace limits. Preserve legacy exit and truthful omitted-audit outcomes; no cap increase, history truncation or safety bypass.

## Finite component and remaining work

This first implementation is only pure validation, time eligibility, stable claim/history, terminal withdrawal, two exact receipts, inactive backup candidates and focused negatives. All storage, live authorization, schema/capacity, server routes, civil-time preparation transport, client UI, actual PG/browser/keyboard, final CI and publication gates remain open. The earlier 28-item private implementation checklist remains open except where separately recorded finite pure evidence actually closes a component; it is not an acceptance record for a full feature or real pilot.
