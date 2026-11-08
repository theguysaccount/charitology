# Group bookings: one review, individual places

OS-PART-02 is in development. The public OS still books one person into one place. These foundations do not enable a group endpoint, change a production table or close the backlog item. This plan and implementation are AI-assisted.

## The first usable workflow

A staff member selects two to ten existing participation requests for one event session or volunteer shift. Each person keeps their own contact, request, specific consent, approved candidate, frozen commitment and cancellation. A group helps staff process those requests together. It grants no coordinator, household, guardian or account authority.

An ordinary group enquiry can be provenance for the draft. It reserves no places and does not create requests or consent for other people. Each person submits their own request or uses the existing documented offline-consent process.

Staff first review all members. If three people request an occurrence with two available places, that selection reserves nothing. Staff can deliberately choose two, inspect a new review and submit that exact subset. The third request stays unchanged. Every selected person must pass; a last-person failure rolls back the entire selection.

There is one admission decision per group. Changing the roster means closing the draft and creating another group. Individual cancellation remains available. Staff can also review an exact cancellation subset; one cancellation never cancels another person's place or promotes a replacement automatically.

## Review and retry

The review binds current staff session, membership and program scope; exact membership creation time and restore history; the group and roster; the typed target, requests, contacts and intake; individual approval and consent; and the complete applicable capacity and overlap inventory. It holds no places.

A signed review lasts ten minutes according to PostgreSQL time, preserving microseconds. The token contains bounded IDs and digests. It stays in memory and request bodies. A new command rechecks the complete context under the organization lock and ordered row locks.

Capacity uses the existing half-open interval model: adjacent volunteer intervals can share a place, while overlapping intervals consume simultaneous capacity. Events retain whole-occurrence allocation. Saved commitments always use their frozen ranges. A current-source mismatch requires reconciliation; it does not rewrite the historical commitment.

One transaction applies every selected transition and its ordinary record, allocation and notice-journal effects, then saves the aggregate receipt. It commits once. Existing waitlist order governs promotions before confirmations; an out-of-order promotion still needs its own explicit reason.

After an uncertain response, the browser retains the exact body and key and offers explicit Retry. It never submits on a timer or invents a new key. An accepted retry returns the immutable original result plus separately labeled current dispositions. Current staff authorization, typed visibility and restore identity still apply. Later cancellation, token expiry or signing-key rotation does not recreate an accepted admission.

## Storage and recovery

Two proposed tenant tables retain the container and compact immutable command receipts. A live group has one create receipt, one admission decision and at most ten non-no-op cancellation receipts. Draft closure is an alternative terminal decision. The proposed lifetime bound is twelve receipts.

The independently versioned backup namespace retains inactive history. Restore removes live target links, session and command capabilities, delivery authority and retry authority. Orphan historical IDs remain historical. Reusing them requires a new group from current independent requests and consent.

Group-free exports retain their existing shape. Missing, explicitly empty and nonempty imports keep distinct admission and counter behavior. Existing participation, Learning, Incubator and check-in codecs remain unchanged.

The proposed limits of 100 groups, ten members, twelve receipts and 8 MiB of new-family SQL charge are independent refusal bounds. Their combined feasibility is unmeasured. The first retained draft must fit complete SQL, native backup and inactive recovery sizes, including future safe exits. Existing participation, booking, outbox, Learning, Incubator and check-in allowances must compose once. A later legal cancellation cannot be blocked by spending its prepaid space on an optional audit.

## Required before enabling the workflow

- Compile and exercise the two-table schema, deferred receipt chain, tenant RLS and narrow grants on actual PostgreSQL, including malformed-history failures.
- Integrate actual SQL/native/inactive measurements and future-exit reserves into every relevant write, export and restore path.
- Add the closed staff routes, strict 16 KiB original-byte reader, read-only POST previews, fresh typed graph and exact receipt reconciliation.
- Build the staff group interface with whole-roster defaults, deliberate exclusions, accessible review and explicit uncertain Retry. Keep the own portal's individual access unchanged.
- Verify actual atomic capacity, competing transactions, injected final-child rollback, authority loss, inactive recovery and legacy counters. Add a separate closed PostgreSQL 17 CI profile.
- Verify the real local browser flow, then the compatible staged release, additive production change, preservation readback and canonical publication.

Current evidence and remaining gaps are in [the acceptance record](PARTICIPATION_GROUPS_ACCEPTANCE.md). Existing public bookings remain one person per place until those integrations are complete.
