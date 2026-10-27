# Directory → Resource review bridge: plan

Pre-implementation draft · October 27, 2026 · AI-assisted. The coordinator accepted this bounded scope; [the detailed interfaces](DIRECTORY_RESOURCE_BRIDGE_INTERFACES.md) require review and a committed freeze before runtime work. No provider relationship, eligibility decision, independent human review or pilot is supplied.

## Outcome

An authorized staff member selects one exact retained tool/benefit listing, previews its source and destination values and deliberately copies it into a Resource draft. Later they compare another selected version, explicitly preserve/replace copied prose and record their organization's dated assessment against that basis. Approval, applications, enrollment and personal reminders remain separate existing workflows.

Preserve **26 modules and 339 fields**. Resource discovery has eleven fields and **no programId**. Its actual access rule is organization-wide, including for otherwise program-scoped members. Show that boundary before copy; offer no program picker. The generic supportsProgramScope flag does not create protection.

Use one new append-only typed tenant table and an optional full-backup section. Keep record.source integration-only. Create no provider connection, installation, account, enrollment, automatic refresh, job, reminder, email or payment.

## Basis and source publication

The current directory contains 15 tools and 16 benefits, all checked 2026-10-25 with review draft. The largest compact listing is 1,095 UTF-8 bytes; sources number at most two per entry. These are repository measurements, not refreshed vendor claims. [The component](../src/components/NonprofitDirectory.astro) and [Resource registry](../services/charity-os/lib/modules.mjs) are the inspected implementation.

Keep the original JSON files as authoring inputs. Explicitly capture an existing source commit A into later artifact commit B. Retain raw files, complete typed entries and a closed capture core under public/data/directory-resources/. The only mutable selector is registry.json, which advances by appending an immutable capture descriptor. Both public pages and the hosted service consume the same checked generated service-local bundle.

The interfaces fix the file layout and required Git gate: old artifact bytes/descriptors cannot change, source blobs must match A, A precedes B, head cannot rewind and generated bundle bytes must match. Source-only edits may remain unpublished while the old head renders. Every known checked date must be no later than its capture's UTC day. Null means unknown; capture time never substitutes for checked.

Public links pin kind/ID/capture/hash in a bounded fragment at the fixed OS origin, without private data. A version absent from the service refuses; no silent latest selection or URL fetch. Historical selection needs acknowledgment when a newer entry version exists or the identity is absent from the head.

A listing is dated editorial material, initially draft. It does not verify current terms, availability, eligibility, savings or outcomes. Show actual UTC calendar-day age only: no 90-day policy, freshness score or automatic expiry.

## Copy and recheck

1. “Review in Charity OS” opens the exact public selection. Keep the existing fixed workspace sign-in destination; do not add an arbitrary return URL. A visitor can return to the original tab after magic-link sign-in.
2. Staff explicitly choose an organization and read the organization-wide access notice. Show the frozen listing, checked date/age, editorial label, version and any newer source. Selecting or loading creates nothing.
3. “Preview Resource draft” shows all eleven destination fields, hashes, acting owner, discovered state and null approval/snapshot. “Copy this listing” alone commits.
4. An already tracked identity returns a currently readable active/trash disposition. It never creates a duplicate or restores trash. The same copy flow appears inside Resource discovery. Similar manual records are not automatically matched.
5. A later recheck explicitly selects a retained version and displays each changed term/link/date. Staff choose fixed mapped fields and a prose-ownership operation, then preview the full resulting record. They may record a dated self-declared eligibility assessment with a selected admitted source.
6. Independent approval and later applied/active transitions remain separate ordinary actions. The bridge never schedules a reminder. Actual renewal/application dates use the existing calendar; a recheck does not invent a renewal date.

Initial mapping: title from listing name; kind tools→tool or benefits→benefit; catalogUrl to the fixed card; deterministic labeled directory prose in limitations; eligibility unknown; all other fields null unless an admitted sourceUrl is explicitly selected. A product name does not establish providerName, cost prose does not become typed money, checked does not become reviewedDate and a listing never supplies an enrollment reference.

An existing recheck/adoption uses the **exact generic Resource PATCH policy**: owner retained, actor as editor, revision +1, approval null, snapshot retained byte for byte; status review if an old approval or snapshot exists, otherwise old status. Preserve the current legal Resource kind, including an ordinary change to eligibility-review or renewal. Validate the full resulting state and current owner/scope/references. An active record without approval/snapshot remains active by that policy; an unknown/ineligible assessment or missing active-state evidence must refuse, never force review to evade invariants.

Board/external readers still see only their retained historical snapshot through normal visibility rules, with current approval metadata. They receive no current bridge panel/history. A contributor can write but cannot export or approve. An assessment is a dated organization declaration, not independent/provider verification.

## Copied prose and assessments

Store exact generated block, its source version, separately owned adoption notes and rendered value/hash.

- Keep current preserves the complete working limitations; it does not claim prose was refreshed.
- Replace mapped block is allowed only if current limitations exactly equals the last stored rendered value. Preserve or explicitly replace its separately owned notes.
- Replace all needs explicit new notes and a full before/after preview. Never infer ownership by parsing delimiters in user text.

A generic edit makes unmatched prose unstructured. The existing 4,000-character limit applies to the entire rendered value; overflow refuses without truncation. Full selected source remains in history.

Display separate source age/editorial state, selected versus current retained version, organization assessment basis, changed working data and actual renewal date. A past renewal does not automatically expire a Resource.

A bound assessment records exact data hash, selected entry and restore epoch. A data edit invalidates its match; approval-only revision changes need not. A later trash restore invalidates it even with identical data, using the latest record.restored audit ID, not cross-table clock comparison.

## Authority and recovery

A ten-minute signed preview remains in page memory only. Bind exact source/head/mapping, org, actor, actual Better Auth session, persisted membership creation microseconds/role/revision/scopes, target revision/data/restore epoch/history and full candidate. Commit rechecks them under the organization advisory lock and forced-RLS tenant context. No client callback, supplied inventory, fieldMap or URL supplies authority.

A closed lowercase UUIDv4 commandKey identifies acceptance. Persist namespaced live retry hashes only; proofs, raw session IDs/bearers and raw keys never enter exports. Same key with another request refuses; different keys cannot duplicate a primary binding, including trash/recovered history. Accepted replay returns only the current readable disposition.

The single table has closed capture-core and binding-event variants. Complete cores let backups verify selected entries without repeating whole manifests in every event. Immutable roots/chains retain source history. Charge measured payload plus a fixed recovery-overhead allowance under feature and whole-workspace quotas.

| Bound | Limit |
| --- | --- |
| Source | Two catalog kinds; 128 entries/capture; eight links and 8 KiB canonical UTF-8/entry |
| Retention | 32 distinct versions/catalog identity; 8 MiB canonical retained source tree |
| Tenant history | 250 bindings; 1,000 total capture/event rows; 32 events/binding |
| Storage | 32 KiB PostgreSQL JSON payload/row; payload bytes +4 KiB charged/row; 4 MiB feature total |
| Intake/proof | 32,768 streamed command bytes; strict UTF-8/duplicate names/depth≤8; proof 4,096 bytes, decoded≤2,048, ten minutes |
| Rate/pages | 120 reads/60 commands per account/hour; records 25, history 20 |

All limits apply together; bytes can exhaust before counts. Existing 2,000 active records, 16 MiB structured data, 64,000-byte record and 60 MiB logical export caps remain. No unbounded whole-workspace clone. Copy/recheck/adoption need record/history/audit success or full rollback; exports remain available at quota.

Full admin backup adds optional complete source history. CSV remains a working-record table; selected evidence JSON is explicitly partial. Export gathers fresh record/history inventory under the org lock, avoiding mixed revisions.

Restore remains empty-destination and resets ordinary working records/approvals/snapshots as today. Historical packets remain exact and inactive, without receipt/session/membership authority or nested wrapper growth. Source trash stays archived. Fresh recovered adoption requires current authority and a currently readable restored Resource; archive-only IDs remain admin provenance without live links.

## Acceptance and release

Before implementation, commit the reviewed plan/interfaces. Then verify exact initial captures/A-before-B/immutable history/bundle; fixed mappings and ownership; generic state/snapshot parity; UUID/proof/current membership and revocation/rejoin; duplicate/retry/trash behavior; strict intake; actual PostgreSQL quotas/recovery overhead; and export→inactive restore/adoption.

Use real Better Auth fictional sessions, constrained runtime roles and uniquely named disposable schemas. Actual Chrome covers public selection→copy, historical/missing/changed sources, two-account assessment/approval/reader snapshot/recheck, editor/hash/route/stale-tab races, retained Retry, recovery/adoption, keyboard and 320/390 light/dark. Disclose fixture assistance and native Save limits. Clean all owned fixtures.

Require independent bounded contract review, existing OS/module/backup/provider/mail regressions, full public build/link/social checks and exact CI. Only then prepare the additive table/index/grant migration with old-row/column/ACL preservation and forced-RLS checks. Stage without canonical assignment, verify unsigned guards/exact assets/isolation and main-build races, then obtain explicit coordinator promotion/publication instructions. These documents authorize no production action.

Preserve additive history on rollback; older writers/exporters may omit it. Real pilots, independent source/security/accessibility review, current provider terms, eligibility/enrollment decisions and operating support remain separate.
