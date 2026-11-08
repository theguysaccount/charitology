# Partial volunteer intervals: local acceptance

November 7, 2026 · AI-assisted implementation and technical checks under the [recorded contract](PARTICIPATION_INTERVALS_PLAN.md). This candidate is not yet released to the shared OS. The original 66-item brief, whole-occurrence booking behavior and separate check-in work remain intact.

## Implemented behavior

One person can request one contiguous interval inside an independently approved volunteer shift that explicitly permits it. Events and other shifts retain whole-occurrence behavior. Exact offsets, named zone, source/consent revisions and allocation hash bind the choice; changing a consented range requires cancellation and a new request. A commitment does not establish attendance, actual work or worked minutes.

The server checks maximum simultaneous occupancy under the organization lock, including the complete managed ledger and unmanaged whole-shift references. Adjacent half-open intervals can fit when cumulative confirmations exceed capacity. Overlap, unknown capacity and stale authority still refuse. Cancellation releases its range once and never automatically promotes someone else. Groups, recurring participation, substitution, screening and participant check-in remain separate.

One nullable, object-only, 1,024-byte `requested_interval` JSONB column preserves the request through inactive recovery. Genuine version 1/2 whole-history backups remain accepted. Version 3 retains interval and known source history without restoring live consent, command authority, accounts or delivery. Unknown earlier terms stay null. Former confirmations need valid frozen allocation history; a nonallocating recovered request never becomes a whole-shift allocation.

The existing participation, logical workspace and native backup caps remain unchanged. For verified wholly legacy state only, the added SQL NULL key receives the exact old logical charge. Interval-aware state uses full new rows. One shared marker definition drives serializer and SQL accounting; incoming JSON cannot select a budget mode. Complete inactive SQL projections and existing Learning/operational reserves remain part of admission. Safety exits and exact accepted receipt reads keep their bounded behavior; a saved change can truthfully report that some audit entries could not be retained.

## Source and automated checks

- Backend checkpoint `8120dc45d6d26383b4cce4c4baf37d12dbd39c15` precedes the shared legacy accounting and final client corrections.
- Sealed implementation `bef32defd24ce8fc9967a5f9be2e2a55229902b9`, tree `ab44e6f4e00006f9894f0919090c9be13bded677`, passed **741 unit/client tests and 16 actual isolated PostgreSQL cases**. Its separately retained source receipt has SHA-256 `206c82049b8779e5b8528facda5817306daf5c045f2ed57cacfd4fc32cad9fcc`.
- Actual browser testing then found that a refused decision left focus on the page body. Forward commit `faf99de909ef8eb191bc3ecb85af632db1199a19` focuses only the connected current error message. Removed forms, detached workspaces and revoked scopes cannot reclaim focus. Literal writing and command keys are unchanged.
- The focused predecessor regression fails before that fix. An initial test-harness selector mistake is retained separately and is not counted as a product regression. The corrected negative log SHA-256 is `890c774d81efd9434015430bf62a19ec7d6135425d0062798291ed383494d0a5`.
- The complete forward OS suite passes **743/743** tests. Its 75,098-byte log has SHA-256 `c64e2812c6efab8929337f36df2906d748afd5a62fd2024eb293946ade8e1ab3`. The native admission bundle remains 254,934 bytes with its 14 original inputs/pins unchanged. No backend/schema change followed the 16-case PostgreSQL run.
- These implementation commits retain the exact project author and committer plus Codex coauthor disclosure. Normal merge history retains the published encyclopedia, genuine source A/B and A54 ancestry; nothing was squashed or recaptured.

The PostgreSQL cases exercise adjacency/overlap/concurrency, both managed/unmanaged conflict directions, waitlists and own controls, durable Retry, inactive recovery, column bounds and capacity composition. The migration witness starts with the actual old table shape: 1,325 records charge 8,382,002 bytes. After the exact additive statement their raw JSON is 8,419,102 bytes while the verified old charge stays exact. Whole-workspace charged bytes remain 62,913,948 while raw new-row accounting is 62,951,048. Export, cancellation, opt-out and inactive restore retain all 1,325 records. These are logical JSON measures, not disk sizes. A separate out-of-band version 3 aggregate refuses full-row overflow even on a safety path; JSONB null is refused by the real SQL constraint.

Earlier invalid seeds, time-pin and quota fixtures, the original large legacy expansion refusal and corrected client response-admission regressions remain in the working receipts. A synthetic near-64-MiB exporter witness is not described as naturally accumulated PostgreSQL history. No cap was raised, history truncated or production migration repeated to obtain a pass.

## Actual local browser, HTTP and database

The successful fictional workflow uses the actual product staff interface, API transport, participation controller, organization lock and constrained PostgreSQL role. Session responses and seed approvals are explicitly synthetic. It does not exercise Better Auth, a real person's consent or a hosted service.

At source `bef32de`, one capacity-one UTC shift has a seeded `[10:00,11:00)` commitment. Actual browser controls record a fictional `[09:00,10:00)` consent assertion and confirmation. The UI and database show **two confirmed commitments, peak occupancy one**. An attempted `[09:30,10:30)` confirmation refuses while preserving the exact Unicode/newline reason and all seven observed business-table snapshots.

Cancellation then completes one real transaction before the fixture deliberately drops its response. A deliberate resubmission through the unchanged **Confirm cancellation** control receives one local 429 before the controller. A third deliberate resubmission reaches the actual saved receipt. All three 273-byte requests have the same raw SHA-256 `5a594ff05a3c8497737fc0abe72e8d0c3ccb694e4d9a7642cd2e727f8d508491`, canonical hash and key hash. The result and complete post-cancellation snapshots stay exact; there is one revision change, no automatic promotion and no additional business operation on Retry. The UI retains literal writing through both unknown/rejected responses and then displays the saved cancellation.

The successful case made 27 actual local HTTP requests. Dormant notification history grows **one → two → three** paused legacy entries across seed confirmation, primary confirmation and cancellation. All live delivery pins remain null; jobs and job-tenant registration remain zero. `notificationQueued` can describe that journal append and is never presented here as accepted or sent email. No provider or mail request occurred.

The fixture history is preserved honestly:

- Version 1 refused before listening after a mistaken zero-outbox expectation. Static analysis identified the contradiction; its masked error did not establish the exact thrown line.
- Versions 2/3 encountered a browser Cookie-header isolation guard. Version 3 records boolean-only diagnostics proving the cookie check, with other guards satisfied. Cookie values were never inspected or persisted.
- Version 4 discards that incidental header unread and uses its explicitly fixed fictional identity. Exact loopback, Host, Origin, CSRF, route and Authorization-header checks remain. It changes no product authentication or browser cookie state. Its actual functional journey succeeds.

Phone-width reading has document width 390 pixels, separate cumulative/concurrent labels and visible keyboard control focus. The forward `faf99de` browser follow-up makes only a refused, unconsented request: its current error receives focus, literal writing stays exact and Tab reaches the next control with a visible outline. All seven business tables remain unchanged. That narrower case made 16 requests and does not claim to repeat the full functional journey. Its acceptance receipt has SHA-256 `0bd77405a45442a93a69b823ca64324589766a23469d08546df18debf7bcd41d`.

Visible private controls clear on disposal. Owned tabs and listeners closed, viewport overrides reset, child processes settled normally and helper cleanup returned. A fresh root inspection verifies all five owned browser schemas absent on the exact owned cluster. That cluster is deliberately retained for the separately authorized Incubator tests, not reported stopped.

## Remaining release scope

The candidate still needs final integrated CI, a protected compatible stage, the reviewed single-column production change/readback and current canonical verification. Because the hosting integration can deploy `main` automatically, prepare and verify the compatible stage and additive migration before merging this feature to production `main`; do not rerun historical full-schema migrations or disable deployment controls by inference. Actual target and deployment facts must be checked at release time. No production action is established by this acceptance.

Broader authenticated hosted journeys, other browsers, screen-reader/accessibility conformance, real charity pilots, participant check-in and the rest of the OS retain separate gates. AI-assisted checks establish none of the human review, actual attendance or operating claims.
