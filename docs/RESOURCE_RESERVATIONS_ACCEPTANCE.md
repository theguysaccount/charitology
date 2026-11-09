# Room and equipment reservations

An organization owner or administrator with workspace-wide access to Assets and Events can review an internal hold for one approved room or item over one approved Events session. Both source approvals and the exact session interval are checked at review and again before recording.

The first slice recognizes an Assets record with a known quantity of one. Back-to-back sessions can use the same item. Overlapping sessions cannot. The review shows the written offsets and zone, so daylight changes do not silently shift a saved hold.

- Reserve creates an internal hold without booking a place for any person or arranging physical access.
- Replace releases the old hold and records the new one together. If the new hold cannot be saved, the original stays in place.
- Release ends a hold. Its required history has storage reserved when the hold is recorded.

A staff member must acknowledge the reviewed records and times. An interrupted response leaves an explicit Retry for the same command. Its original recorded decision appears separately from the hold’s current state. Normal editing cannot change the defining fields while a hold is active. A source record that is still linked to reservation history stays out of Trash so the history can still be backed up and restored.

The native backup retains history. Restoring it leaves all holds inactive and restores no live command receipts. Staff can choose Resolve recovered claim, review the frozen sources and times, enter a reason and confirm that no internal hold carries forward. This separate disposition cannot release a live hold or cancel an external booking. An unresolved claim blocks a new hold for the same item until staff record their decision. The original Asset and Events records must be present as current records; the restore preview refuses a history that refers to a source found only in archived Trash.

## Verification before release

The actual workspace shell ran in the in-app browser against a fictional API. The test checked conflict, unresolved recovery, unchanged replacement, the exact repeated request after interruption, both effects of Replace, Release, and refusal in an organization without the feature. The repeated Reserve produced one saved hold. A second rehearsal checked an interrupted recovered disposition, exact Retry, refreshed inactive history and an unchanged live hold. The tabs and local fixtures were closed.

Isolated PostgreSQL 18.6 checks covered tenant isolation, immutable command receipts, atomic overlap, actual byte accounting, reserved space for Release, and native recovery. The assembled staff handler also ran on that database. It verified Reserve, Replace, Release, refusal to trash a retained source, and exact Retry for a recovered disposition. A second native restore retained the historical proof and disposition, but neither restored copy contained live command rows. These use fictional records and a disposable database. They do not establish hosted use.

The additive release needs both new tables and their narrow runtime grants before deploying the new application. The previous application can operate with the two tables empty. After the first recorded hold, the previous application cannot be used as a live rollback because it cannot protect or export the history.

Quantities above one, unknown quantity, additional types of occurrences, external calendars and bookings, and a hosted pilot remain separate.
