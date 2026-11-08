# Group booking foundations: acceptance record

This is a development checkpoint for OS-PART-02. No group route, interface, production table or usable group workflow is enabled. The existing public booking behavior remains one person per place. Implementation and review are AI-assisted; fictional test records establish no real consent, approval, attendance or charity pilot.

## Implemented candidates

- [Closed model](../services/charity-os/lib/participation-group-model.mjs): owned requests, explicit selection, canonical hashes, compact receipts and inactive history.
- [Signed review](../services/charity-os/lib/participation-group-preview.mjs): separate HMAC domains, canonical encoding, all twelve fresh bindings and exact SQL-time expiry.
- [Access helpers](../services/charity-os/lib/participation-group-access.mjs): current session and writer membership checks, exact creation time and restore-event pins. Full typed roster visibility remains a caller duty.
- [Allocation planner](../services/charity-os/lib/participation-group-allocation.mjs): one prospective selection, half-open peak occupancy and overlap checks. Its output contains selected-person blockers and authorized-target aggregates.
- [Store candidate](../services/charity-os/lib/participation-group-store.mjs): complete history/header reconciliation, receipt-before-CAS ordering, inactive archives and full composite SQL charge queries. Its proposed tables are not integrated into the application schema.
- [Backup codec](../services/charity-os/lib/participation-group-backup.mjs): closed checksummed inactive history, strict order and distinct missing/empty behavior. Workspace integration remains open.
- [Shared participation command](../services/charity-os/lib/participation.mjs): typed confirmation, promotion and cancellation outcomes inside a caller-owned transaction. Old wire and latest-command formats remain unchanged. A same-client SQL-clock brand guards internal misuse; it grants no authorization or transaction freshness.

## Local verification

The closed 80-file unit/client run passes **980/980**, with zero failures, skips or cancellations. It includes 902 existing checks plus the model, preview, backup, domain and store candidates. Both native bundle freshness checks pass. That source includes the corrected clock-year and enumerable-window rules and the invalid-source no-mutation case.

The access and allocation helpers separately pass **30/30** focused checks: thirteen fake-SQL access cases and seventeen pure allocation cases. A later store-test correction passes **15/15**: its immutability assertion now passes the exact input being checked. The earlier 980 result retains its original test source; it is not relabeled as a later complete run.

Adversarial cases cover proxies without invoked traps, getters, dense arrays, control characters, UTF-8 bounds, complete nested request limits, explicit subsets, distinct unknown and zero capacity, private-inventory output, original receipt preservation and inactive history. One hundred valid backup histories exceed the generic model graph cap without raising it. The planner admits the complete bounded 2,000-row inventory and refuses 2,001; neither result is a physical storage or authority proof.

A fresh owned **PostgreSQL 18.6 / 180006** instance passes six actual clock checks through the exported factory: microsecond precision, exact ten-minute expiry, a current window, expired and future window refusals, and independence from skewed or throwing `Date.now`. The successful path contains fourteen fixed read-only client statements. Cluster initialization writes only the new local test data. The client closes, the owned postmaster exits cleanly, and its PID file, temporary bootstrap password file and short socket directory are independently confirmed absent.

The clock test is not an actual group allocation, RLS, rollback, hosted authentication or browser result. Exact expiry-equality boundaries retain their separate source-unit evidence. Static review caught an IPv4 normalization mismatch and partial-write password cleanup gap before the one actual clock run; preserved successors corrected them.

## Unperformed integration

The private two-table proposal has not been executed or added to `schema.sql`. Static review found missing-field SQL NULL paths and an ambiguous PL/pgSQL variable; its held successor uses fail-closed type/state checks and qualified aliases. Actual PostgreSQL positive and negative rehearsal remains required. This does not claim that SQL backstops duplicate every model rule.

Complete group-family accounting, future mandatory receipt/exit reserves, full native and inactive recovery projections, and first-retention activation of legacy participation allowances are unimplemented. No cap has been raised and no nominal maximum is described as safely attainable.

Staff routes, strict original-byte admission, fresh locked graph loading, aggregate Replay ordering, interface lifecycle and actual group transactions remain unimplemented. The end-to-end cases include three-at-capacity-two, deliberate subset admission, stale capacity, competing group/single requests, final-child rollback, actual response loss and explicit Retry, own cancellation, current staff access loss and inactive orphan recovery. A separate group CI17 profile and all release checks remain open.

The [plan](PARTICIPATION_GROUPS_PLAN.md), stable backlog IDs, eight conditional gates and original 66-item mapping remain intact. These foundations close neither OS-PART-02 nor the broader OS project.
