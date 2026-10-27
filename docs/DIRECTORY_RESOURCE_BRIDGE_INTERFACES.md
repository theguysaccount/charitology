# Directory → Resource review bridge: interfaces

Pre-implementation draft · October 27, 2026 · AI-assisted. Read the [plan](DIRECTORY_RESOURCE_BRIDGE_PLAN.md). These proposed contracts require coordinator review and a committed freeze before code; they are not implemented exports.

## Conventions

All described JSON objects are closed. Reject unknown/missing fields, undefined/nonfinite values, coercible IDs, callbacks, prototype-bearing values, duplicate decoded keys and controls. Detach owned values before retention. Use fixed typed validators, never an authorization/mapping callback.

Method directory-resource-v1; mapping directory-resource-map-v1. Hash means lowercase SHA-256, GitCommit lowercase 40-hex, OpaqueId an actual [A-Za-z0-9_-]{1,100} string, ListingId lowercase [a-z0-9][a-z0-9-]{0,63}. Date is a real YYYY-MM-DD, 1900–2200. UtcInstant is exact YYYY-MM-DDTHH:mm:ss.SSSZ in range. RestoreAuditId is null or canonical positive decimal string. commandKey is lowercase UUIDv4: ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$.

HttpsUrl is an absolute HTTPS string≤1200 characters without credentials/controls. It is displayed, never fetched. Hash canon uses existing security.stable/hash after validation, with fixed versioned namespaces for entry/capture/registry/event/binding/resource/membership/session/command/request/plan. Raw source-file SHA-256 covers exact bytes.

For private workflow hashes, define H(tag,value)=hash({namespace:'charitology:directory-resource:'+tag+':v1',value}) with only the fixed internal tags below:

    bindingId = H('binding',{orgId,catalogKind,listingId})
    resourceId = H('record',{bindingId})
    captureRowId = H('capture-row',{captureId})
    membershipSha256 = H('membership',{userId,role,programIds:sortedCopy,revision,createdAtExact})
    sessionSha256 = H('session',{sessionId:actualCurrentSessionId})
    selectionSha256 = H('selection',selection)
    beforeSha256 = H('before',plan.before)
    planSha256 = H('plan',closedPlanWithoutPlanSha256)
    proposalSha256 = H('proposal',exactOwnedRawProposal)
    command_hash = H('command',{orgId,actorId,createdAtExact,commandKey})
    request_hash = H('request',{previewToken,proposal})
    actor_binding_hash = H('actor-binding',{actorId,sessionSha256,createdAtExact})

Data, approval, snapshot and nullable limitations hashes use security.hash on the complete normalized value, including null. Entry/capture/registry/event formulas below use their specified separate namespaces. No caller selects a hashing tag or input as authority.

Keep 26 modules/339 fields; Resource has no programId and is organization-wide under actual inScope. Its record.source remains the integration-only contract.

## Immutable source artifacts

    public/data/directory-resources/
      registry.json
      captures/<captureId>/
        capture.json
        sources/nonprofit-tools.json
        sources/nonprofit-benefits.json
        entries/tools/<listingId>.json
        entries/benefits/<listingId>.json

A checked generated services/charity-os/lib/directory-catalog-data.json is statically imported by directory-catalog.mjs. Public Astro and hosted preparation consume this same projection. No request-time catalog discovery/fetch. Bundle shape: {format:'charitology-directory-bundle',version:1,registry,captures:[{captureId,core,entries:DirectoryEntry[]}]}; arrays have the canonical order below.

    interface DirectoryListing {
      id:ListingId; name:string; category:string; summary:string;
      costType:string; cost:string; delivery:string; fit:string;
      eligibility:string; limits:string; url:HttpsUrl;
      sources:readonly {label:string;url:HttpsUrl}[];
      checked:Date|null; review:'draft'|'reviewed';
    }
    interface DirectoryEntry {
      format:'charitology-directory-entry'; version:1;
      catalogKind:'tools'|'benefits'; listing:DirectoryListing;
    }
    interface EntryDescriptor {
      listingId:ListingId; entrySha256:Hash; entryPath:string;
    }
    interface CaptureCore {
      format:'charitology-directory-capture'; version:1;
      sourceCommit:GitCommit; capturedAt:UtcInstant;
      catalogs:readonly {
        kind:'tools'|'benefits'; sourcePath:string; rawPath:string;
        rawSourceSha256:Hash; entries:readonly EntryDescriptor[];
      }[];
    }
    interface CaptureFile {captureId:Hash;core:CaptureCore}
    interface Registry {
      format:'charitology-directory-registry'; version:1;
      captures:readonly {sequence:number;captureId:Hash}[];
      head:{sequence:number;captureId:Hash};
    }

Listing bounds: name1..180, category/costType1..120, summary/cost/fit/eligibility1..2000, delivery1..1000, limits1..4000 characters; sources1..8 with labels1..240; canonical complete entry≤8,192 UTF-8 bytes. Retain all fourteen source fields exactly; missing/malformed checked is not null. Known checked≤capture UTC day. No source/capture time becomes organization reviewedDate.

Catalog order is exactly tools,benefits. Their paths are fixed to src/data/nonprofit-tools.json→sources/nonprofit-tools.json and corresponding nonprofit-benefits paths. entryPath is exactly entries/<kind>/<listingId>.json. Descriptors/entries sort by listingId, with no duplicate within kind; total≤128. Ordinary artifact files are security.stable(value) plus one newline; raw source files retain original bytes.

entrySha256=hash({namespace:'charitology:directory-entry:v1',entry}).
captureId=hash({namespace:'charitology:directory-capture:v1',core}).
Neither hash includes itself; the core contains relative entry paths, not its own directory ID. Registry hash uses namespace charitology:directory-registry:v1 over the complete registry. CaptureCore's recoverable PostgreSQL JSON envelope must fit 32 KiB. Retain≤32 distinct entry hashes/catalog identity and≤8MiB total canonical source tree. The bundle is a derived copy, not an authoring surface.

Registry sequences start1 without gaps; head equals the last immutable descriptor. Only append+advance is legal. The required Git gate uses a real nonzero committed comparison base and preserves every old artifact blob and descriptor exactly. For each new capture, find artifact-introducing commit B; source A must be a reachable ancestor of B's parent, not B/later/unrelated. git show A:<sourcePath> must equal both raw blobs. Validate source-row/full-entry bijection, hashes/paths/date bounds, capture identity, registry and derived bundle. capturedAt cannot claim a future instant at validation. Source-only authoring commits may leave public head unchanged. Do not weaken existing observation/publication gates or treat all-zero base as an empty repository.

A missing service capture refuses. Selection never silently changes. Require historical acknowledgment when selected entry differs from current head or is absent there. Show actual age or unknown, original editorial label and changed/absent source; no age threshold or availability inference.

## Proposal and ownership

    interface SourceSelection {
      captureId:Hash; catalogKind:'tools'|'benefits';
      listingId:ListingId; entrySha256:Hash;
    }
    type SourceChoice = null | {kind:'listing-url'} | {kind:'source';index:number};
    type NotesChoice = {kind:'keep'} | {kind:'set';text:string|null};
    type LimitationsChoice =
      | {kind:'keep-current'}
      | {kind:'replace-mapped';notes:NotesChoice}
      | {kind:'replace-all';adoptionNotes:string|null};
    interface ExplicitAssessment {
      providerName:string|null;
      eligibility:'unknown'|'eligible'|'ineligible';
      reviewedDate:Date; renewalDate:Date|null;
      cost:{minor:number|null;currency:string;precision:number}|null;
      confirmationReference:string|null;
    }
    interface Proposal {
      intent:'copy'|'recheck'|'adopt-recovered';
      selection:SourceSelection; acceptHistoricalVersion:boolean;
      target:null|{recordId:OpaqueId;revision:number;historyHeadSha256:Hash};
      copiedFields:readonly ('title'|'catalogUrl'|'sourceUrl')[];
      sourceChoice:SourceChoice;
      limitations:LimitationsChoice;
      assessment:ExplicitAssessment|null;
    }
    interface LimitationsState {
      ownership:'mapped'|'unstructured';
      rendered:string|null; renderedSha256:Hash;
      directoryBlock:string|null; directoryEntrySha256:Hash|null;
      adoptionNotes:string|null;
    }

All nullable fields are present. copiedFields is distinct, in title/catalogUrl/sourceUrl order. Source index is an actual bounded integer into the selected frozen entry. No moduleId/programId/status/owner/approval/snapshot/source/fieldMap/supplied URL/validator is admitted.

Copy: target/assessment null, all three copiedFields, replace-all notes null. Map all eleven fields: title listing.name; kind tool/benefit by catalog; catalogUrl fixed https://charitology.org/for-charities/<catalogKind>/#<listingId>; eligibility unknown; limitations fixed labeled directory block; providerName/reviewedDate/renewalDate/cost/confirmationReference null; sourceUrl explicitly selected link or null. No name→legal-provider, free→zero, checked→reviewedDate or listing→enrollment inference.

Recheck/adopt: retain current legal Resource kind and owner; change mapped fields only when selected. A sourceChoice null clears sourceUrl only when selected, otherwise it preserves it and must be null. Non-null assessment requires sourceUrl selected plus a non-null admitted sourceChoice. Its six fields are explicit organization declarations: reviewedDate≤server UTC day, supported money/currency precision, actual optional deadline/reference; no auto eligibility. Bounds remain providerName/confirmationReference≤240 and existing typed Resource validation.

renderDirectoryBlock uses exactly these lines, with source values after each label, joined by one newline: Summary, Cost model, Cost description, Delivery, Possible fit, Eligibility description, Limits, Directory source checked, Editorial review. Each label ends with colon and one space; the checked value is its ISO date or literal Unknown. renderLimitations returns the block for null notes, otherwise block + two newlines + literal Organization adoption notes: + one newline + normalized notes. Apply ordinary trim normalization consistently before hashing. Store exact output and hashes; never parse delimiters to infer ownership.

A mapped directoryEntrySha256 must resolve to a complete frozen entry in the same binding's history at or before this event (or this selected entry); rebuilding its block/notes must reproduce the stored normalized rendered value/hash. Unstructured state has null block/version/notes. Unknown mapping versions require a reviewed historical renderer; they are never reinterpreted using today's renderer.

- keep-current preserves complete working value. If it equals prior stored rendered text, retain that older block/version/notes. Otherwise mark unstructured with directoryBlock/version/notes null.
- replace-mapped requires current text exactly equals the last mapped rendered value; else409 ownership conflict. Rebuild selected block, keeping stored notes only for explicit keep, or setting exact supplied nullable notes.
- replace-all rebuilds selected block with exact explicit new notes, without inferred carry-over. Show full before/after.
- Whole rendered limitations≤4,000 characters. Refuse overflow, never truncate. A generic edit cannot mutate history or silently restore old mapped prose.

## Ordinary state and snapshot policy

New copy: discovered/revision1/actor owner+editor/null approval+snapshot/source.

Existing recheck/adoption must exactly reproduce ordinary PATCH:

    ownerId = previous.ownerId
    lastEditedBy = actor
    revision = previous.revision + 1
    approval = null
    snapshot = previous.snapshot
    status = (previous.approval || previous.snapshot) ? 'review' : previous.status

Validate the entire resulting data with existing resources/status/owner/inScope/reference rules against current tenant context. If active without approval/snapshot remains active, unknown/ineligible or missing reference/source refuses. Do not force review or bypass an invariant. Approval and transitions remain separate.

Retain snapshot bytes exactly. Board/external reads continue through visibleRecord's old snapshot, historical revision/status and current approval metadata; no live bridge history. Copying/rechecking creates no independent approval.

A bound assessment matches only while current normalized data hash, selected entry and restore epoch match its stored basis. Search the latest non-null assessment in live events only; recovered assessments remain historical even if their hashes happen to match. New event assessmentDataSha256 is non-null exactly when that event explicitly records an assessment. Restore epoch is latest record.restored audit ID as canonical decimal string/null, queried under current tenant scope. Identical-data restore invalidates it; approval-only revision changes need not. A changed/unbound/historical eligible value is labeled with date/basis, not current eligibility.

## HTTP and proof

All responses no-store. Authenticated catalog reads expose only bundled public data. Organization bridge/history commands require current Resource write and actual visibility; evidence export requires existing Resource export/read. Snapshot readers never receive live bridge history. Generic unavailable reveals no hidden identifiers.

| Route | Closed input/result |
| --- | --- |
| GET /api/directory-resources/catalogs | Current head/capture metadata; optional cursor only, pages25 |
| GET /api/directory-resources/catalogs/:captureId/:kind/:listingId | No query/body; exact core/entry/hash and head comparison |
| GET /api/orgs/:org/directory-resources/records/:recordId | Optional cursor only; current binding/disposition, history20 |
| POST /api/orgs/:org/directory-resources/preview | Proposal→ready or current existing disposition |
| POST /api/orgs/:org/directory-resources/commit | {previewToken,commandKey,proposal}→accepted/current disposition |
| GET /api/orgs/:org/directory-resources/records/:recordId/export | No query/body; explicitly partial evidence JSON |

Cursors are closed bounded data: catalog cursor {registrySha256,nextSequence}; history cursor {bindingId,headSha256,nextSequence}. Validate current identity, positive bounded sequence and current access; changed head requires restart. Refuse duplicate/unknown query keys and client page-size/source-path inputs. The public fragment has only kind/id/capture/hash, never org/email/session/token/notes.

    interface Plan {
      method:'directory-resource-v1'; mappingVersion:'directory-resource-map-v1';
      orgId:OpaqueId; intent:Proposal['intent']; selection:SourceSelection;
      registrySha256:Hash; currentHeadCaptureId:Hash;
      bindingId:OpaqueId; nextSequence:number; resourceId:OpaqueId;
      before:null|{
        revision:number;dataSha256:Hash;approvalSha256:Hash;snapshotSha256:Hash;
        restoreEpoch:RestoreAuditId;historyHeadSha256:Hash;
      };
      candidate:{
        moduleId:'resources';data:NormalizedResourceData;status:ResourceState;
        ownerId:OpaqueId;lastEditedBy:OpaqueId;revision:number;approval:null;
        snapshotSha256:Hash;
      };
      limitationsState:LimitationsState;assessment:ExplicitAssessment|null;
      assessmentDataSha256:Hash|null;restoreEpoch:RestoreAuditId;
      membershipSha256:Hash;changes:readonly FieldDifference[];
      warnings:readonly WarningCode[];planSha256:Hash;
    }
    type PreviewResult =
      | {ok:true;kind:'ready';plan:Plan;previewToken:string;expiresAt:UtcInstant}
      | {ok:true;kind:'existing';disposition:CurrentDisposition};
    type CurrentDisposition =
      | {kind:'active-record';record:OrdinaryResourceRecord}
      | {kind:'trash';recordId:OpaqueId;recoveryAvailable:true}
      | {kind:'historical-only';recoveryAvailable:false}; // admin archive only
    type CommitResult = {
      ok:true;kind:'copied'|'rechecked'|'adopted'|'existing';
      disposition:CurrentDisposition;historyHeadSha256:Hash;auditRecorded:true;
    };

NormalizedResourceData is exactly the eleven normalized registry fields; ResourceState is its existing seven states. FieldDifference={field,before,after,origin}, field one of eleven keys, values validated by that field type, origin directory/assessment/preserved. WarningCode is historical-selection/source-date-unknown/newer-version/listing-absent-from-head/editorial-draft/preserved-old-prose/unstructured-prose/unbound-assessment/working-data-changed/restore-since-assessment/renewal-date-passed. Age is an integer/null separately, never a threshold.

Active disposition returns the normal current Resource projection, not embedded old packet data or a relabeled draft. Trash requires an actual currently writable visible soft-deleted row. Archive-only IDs have no restore link and are admin-only; others receive generic unavailable.

Dedicated command intake precedes generic8MiB parsing: session/Origin/CSRF/rate, then actual streamed≤32,768 bytes, fatal UTF-8/no BOM, depth≤8, duplicate decoded key detection at every level and exact/trailing syntax checks before JSON.parse. Cancel overflow. Per-account rates120 reads/60 commands per hour before expensive preparation.

Reviewed correction after contract freeze: ten-minute HMAC proof, domain-separated existing secret, constant-time comparison. The exact MAC input is `os:directory-resource:v1:` + H(`proposal`, exact raw Proposal) + U+0000 + the base64url encoded closed payload. The fixed internal `proposal` hash tag uses the same H namespace convention. At preview and commit, retain an owned detached raw Proposal after strict lexical and full closed validation, before further awaits; normalization must not erase notes or equivalent-link choices. A caller supplies no digest. The closed payload remains unchanged and contains no proposal text. Token≤4,096 bytes; decoded payload≤2,048 with the same strict reader. Closed payload: {version:1,method,orgId,intent,bindingId,resourceId,actorId,sessionSha256,membershipSha256,selectionSha256,registrySha256,beforeSha256,planSha256,issuedAt,expiresAt}; integral epoch milliseconds and expiry=issue+600000. Include no free text/private notes.

Membership hash covers userId/role/sorted programIds preserving admitted duplicates/revision and exact persisted created_at microseconds. Read under org lock; the existing helper drops that timestamp. Session hash binds actual Better Auth session ID. Signature integrity never substitutes for current authorization.

Token/key/exact proposal stay only in page memory. Synchronous selection/epoch checks guard async hashing and responses. Edits, route/org/source/editor/session changes/sign-out invalidate immediately; one in-flight command. Lost response retains exact Retry; never silently substitutes a new key/plan. Expiry requires fresh inspection.

Commit under existing org advisory lock +forcedRLS:
1. Re-read session/membership/role/scope/current working visibility.
2. Exact accepted receipt may return current readable disposition after actor/session/incarnation/request checks and the complete current membership fingerprint; never old embedded data. Changed membership revision/role/scopes, authority or expired proof requires fresh read. Same accepted key with another request409.
3. Otherwise reconstruct from trusted bundled source and exact closed Proposal; verify expiry/current registry/head/selection/mapping/target revision/data/approval/snapshot/restore epoch/history/plan.
4. Check owner/ordinary state invariants, primary identity across live/trash/recovered and unrelated stable-ID collision; measure all caps.
5. Atomically save ordinary record, any new capture evidence, one event/live receipt hashes and ordinary audit. Audit must succeed or all rolls back. No provider/enqueue/approval/transition.
6. Different new keys for an already bound copy return existing without a new receipt/event. In an existing CommitResult, auditRecorded true refers to the original accepted change, not a newly written replay audit.

Errors retain existing {ok:false,code,message,issues?}:401session,403role,generic404unavailable,409stale/ownership/identity/idempotency,413size,422input/JSON/capture/mapping/record/quota,429rate. No rawSQL, token or hidden source data.

## One append-only tenant table

Proposed os_resource_directory_history columns:

    org_id,id,row_kind:'capture'|'event',capture_id,
    binding_id|null,sequence|null,resource_id|null,catalog_kind|null,listing_id|null,
    origin_mode:'live'|'recovered',
    command_hash|null,request_hash|null,actor_binding_hash|null,
    payload:jsonb,budget_bytes,created_at

Primary(org_id,id). Capture row ID is namespaced capture hash; event row ID its packet hash. Capture payload is CaptureFile, null binding/sequence/resource/catalog/listing/receipt fields, unique(org_id,capture_id) for capture rows. Event payload={packet,packetSha256}, sequence1..32, unique(org_id,binding_id,sequence). A partial root index unique(org_id,catalog_kind,listing_id) for event sequence1 includes recovered/trash identities. Subsequent events keep root binding/resource/catalog identity.

Receipt uniqueness is (org_id,command_hash) where live/nonnull. command_hash namespaced over org/actor/membership incarnation/UUIDv4 key; request_hash binds exact proof bytes+Proposal; actor_binding_hash binds actor/session/incarnation. Store no raw key/proof/session. Receipts are not evidence and never exported/restored.

Copy binding/resource IDs are fixed namespaced hashes of org/catalog identity then binding ID. Refuse unrelated collisions. Adoption keeps recovered historical IDs and appends fresh current authority; identity labels do not grant permission.

Enable and force tenant RLS USING/WITH CHECK app.org_id. Runtime SELECT/INSERT only; immutable UPDATE/DELETE trigger; no cascade or mandatory live-record FK for archive-only IDs. Capture evidence is inserted only atomically with an accepted event, not through a standalone upload endpoint. Include this table in logicalBackupBytes.

    interface EventPacket {
      format:'charitology-directory-resource-event';version:1;
      method:'directory-resource-v1';mappingVersion:'directory-resource-map-v1';
      event:'copied'|'rechecked'|'adopted';
      bindingId:OpaqueId;sequence:number;parentPacketSha256:Hash|null;
      resourceId:OpaqueId;catalogKind:'tools'|'benefits';listingId:ListingId;
      selection:SourceSelection;frozenEntry:DirectoryEntry;
      originOrgId:OpaqueId;actorId:OpaqueId;recordedAt:UtcInstant;
      before:null|{resourceRevision:number;dataSha256:Hash;restoreEpoch:RestoreAuditId};
      resultingRevision:number;resultingDataSha256:Hash;resultingStatus:ResourceState;
      copiedFields:readonly ('title'|'catalogUrl'|'sourceUrl')[];
      sourceChoice:SourceChoice;limitationsState:LimitationsState;
      assessment:ExplicitAssessment|null;assessmentDataSha256:Hash|null;
      restoreEpoch:RestoreAuditId;
    }

packetSha256=hash({namespace:'charitology:directory-resource-event:v1',packet}). Root copied/sequence1/parentnull; later rechecked/adopted increment and link previous hash. Verify frozen entry against its own hash and descriptor in retained CaptureCore. Historical revisions/hashes are event claims; today's mutable record need not equal old data. originOrgId/actorId/time are historical labels, never destination access. No proof/session/receipt authority in packets.

Caps:250bindings,1,000totalcapture/eventrows,32events/binding,32,768PostgreSQLJSON payload bytes/row,4 MiB charged feature storage. budget_bytes=measured payload::text bytes+4,096; charge max(actual whole-row JSON bytes,budget_bytes). Prove actual worst-length live/recovered fixed-column overhead fits 4 KiB. Normalized payload is identical across restore; recompute reserve, never trust imported budget or repeatedly add wrapper overhead. Existing60MiB logical budget uses charged bytes. Ordinary 2,000-record/16 MiB structured/64,000-byte limits remain. All caps apply together and new writes refuse atomically; exports remain available.

## Full backup and recovery

    interface DirectoryResourcesBackup {
      format:'charitology-directory-resources';version:1;method:'directory-resource-v1';
      captures:readonly CaptureFile[];
      bindings:readonly {
        id:OpaqueId;resourceId:OpaqueId;catalogKind:'tools'|'benefits';listingId:ListingId;
        events:readonly {
          packet:EventPacket;packetSha256:Hash;provenance:'live'|'recovered';
        }[];
      }[];
    }

This optional full-org section includes all live/trash/archive-only selected source history. Complete entries and capture cores verify selected entry descriptors; raw original complete catalog files remain retained public/Git artifacts. No commandKey/receipt hash/proof/token/cookie/bearer/rawsession/membershipauthority/credential is exported. Per-Resource export is explicitly partial, never standalone restore; CSV still lacks complete provenance.

Gather fresh complete record/trash/history inventory under the org lock before export, not a stale record list read before locking. Recheck member/read/export rights within that snapshot. Keep existing admin full-export privilege; selected evidence needs Resource export/read. Exports remain possible at audit quota using the existing export pattern; do not claim a skipped audit was recorded.

Restore validates all closed IDs/dates/hashes, unique roots, complete capture/entry descriptors, checked≤captureUTCday, contiguous sequence/parents, root/binding/resource consistency, event/revision types, ownership renderer/hash, assessments, active/trash/archive references and measured caps before writes. Historical source need not be in today's bundle to preserve inert evidence. Integrity is not independent source review.

Keep existing empty-destination behavior and ordinary record resets. Insert origin_mode recovered with receipt fields null, preserving packet/core payloads exactly. Do not replay historical actions or generic events as current authority. Reexport uses provenance recovered without nested payload wrappers; budget is recomputed from unchanged payload+fixed allowance. Source trash remains privately archived.

Fresh adopt-recovered requires current writable readable restored Resource, inactive binding, current bundled selection and a new proof/key. Append sequenceN+1 using ordinary PATCH; cap exhaustion refuses. A live binding cannot be adopted again. Archive-only IDs remain admin provenance, never fabricated live/trash links. Restored labels create no membership, approval, provider connection, enrollment, reminder or job. Older backups without this section remain readable; rollback preserves additive history and avoids incompatible older writers/exporters after data exists.

## Required acceptance

- Exact 31-source projections, raw/canonical hashes, source A/artifact B, immutable old blobs/head/bundle and future checked refusal; source-only unpublished edit; missing/historical/absent versions and age-only labels.
- Eleven-field defaults, typed zero/unknown/currencies, ownership keep/replace/conflict/overflow, no date/provider/cost inference; exact generic PATCH/snapshot/active-state parity.
- Actual Better Auth fictional accounts and constrained PostgreSQL: two tenants/all roles, org-wide scope truth, snapshot-only readers, contributor limits, independent approval, revocation/rejoin, changed role/scope/session/source/record/restore/history, UUID/proof errors and races/retry/trash/collision.
- Strict streamed intake before generic parsing; malformed UTF-8, escaped duplicate keys, depth and byte limits; actual PostgreSQL overhead/reserve/feature/whole quotas and atomic audit failure; near-quota workspace without whole-context clone.
- Full export→preview→inactive restore→reexport/adoption with active/trash/archive-only/later-edited records; exact evidence and no renewed authority; coerced IDs/graph/date/hash/wrapper-evasion refusal.
- Controlled Chrome public card/copy, changed/missing/historical source, two-account assessment/approval/reader/recheck, editor/hash/stale-tab/route/logout/Retry, export/recovery/adoption, keyboard and 320/390 light/dark. Disclose fixtures/native Save/human review limits.
- Existing regressions/full build/links/social, independent bounded review, exact CI, cleanup, reviewed additive migration/old-row/ACL/RLS proof and explicitly authorized staged/canonical publication per plan. No production/provider/mail/job action follows from this freeze.
