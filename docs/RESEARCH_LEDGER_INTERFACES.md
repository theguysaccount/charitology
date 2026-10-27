# Research ledger interfaces

Frozen R4 software contract after coordinator review. This accompanies [the plan](RESEARCH_LEDGER_PLAN.md); no runtime exists yet. Only the new source-controlled ledger is covered. R2/R3 local data, public write services, real review assignment and named-charity rating authority are outside this contract.

## Pure model and input boundary

```ts
type Id = string;       // [a-z][a-z0-9-]{0,38}:[a-z0-9][a-z0-9-]{0,59}
type Hash = string;     // 64 lowercase SHA-256 hex
type Instant = string;  // canonical real UTC ISO, YYYY-MM-DDTHH:mm:ss.sssZ
type Commit = string;   // 40 lowercase Git commit hex, not SHA-256
type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
type Kind = 'problem'|'manuscript'|'case'|'method'|'claim'|'artifact'|'challenge'|'decision';
type State = 'open'|'partial'|'solved'|'under-review';
type ReviewState = 'draft'|'reviewed';
type VersionRef = {recordId:Id;version:number;subjectHash:Hash};
type Pin = {id:Id;hash:Hash};
type EvidenceRef = {url:string;title:string;locator:string|null};
type Disclosure = {state:'unknown'|'declared-none'|'declared';note:string|null;refs:EvidenceRef[]};

interface LedgerRecord {id:Id;kind:Kind;hash:Hash}
interface SourceSnapshot {
  id:Id;commit:Commit;path:string;sha256:Hash;byteLength:number;text:string;hash:Hash;
}
interface SourceBinding {sourceId:Id;selector:Selector}
type Selector = {kind:'entry'} | {
  kind:'claim';adapter:'depth-census-knowledge-v1'|'ten-dollars-framing-v1';
  frontmatterKeys:string[];bodyExcerpt:string|null;
};
interface Authorship {
  state:'unknown'|'documented';complete:boolean;actorIds:Id[];refs:EvidenceRef[];
}
interface SubjectVersion {
  id:Id;recordId:Id;version:number;previousId:Id|null;
  adapterVersion:'research-content-v1';subject:Subject;subjectHash:Hash;
  authorship:Authorship;sources:SourceBinding[];hash:Hash;
}
```

All objects reject unknown/prototype keys; numbers are finite and counts/versions are safe integers. Strings and nested arrays have explicit bounds below. Arrays retain meaningful source order; only explicitly unordered selections/pin sets are sorted. IDs are stable opaque public identifiers, not person identifiers or arbitrary paths. Contiguous versions/predecessors belong to one record; the record's kind never changes. Raw source snapshots are inert own-repository Markdown, decoded as strict UTF-8 with exact BOM/newlines preserved and re-encoded to verify both byte length and SHA-256. Pin their exact commit/path; never fetch, compile or execute them during validation/build.

`hash` covers the canonical object excluding only its own `hash`. `subjectHash` covers `subject`, not source capture, review IDs, event envelopes or the compatibility review/problem-status fields. Sort object keys, preserve array order, reject unsupported values/cycles/nonfinite numbers and encode exact UTF-8. Use Node's SHA-256 in this server/test-only pure module. Every returned graph/projection is a detached deeply frozen plain-JSON value. No wall clock, filesystem, process environment, network, Astro or browser API belongs in the pure module.

## Substantive subjects

```ts
type Subject = EntrySubject|ClaimSubject|ArtifactSubject|ChallengeSubject|DecisionSubject;
interface EntrySubject {
  type:'entry';collection:'problems'|'journal'|'cases'|'record';
  frontmatter:{[key:string]:Json};body:string;
}
interface ClaimSubject {
  type:'claim';parentId:Id;title:string;statement:string;context:string|null;
  evidence:'established'|'documented'|'debated'|'hypothesis'|'not-applicable';
  sources:EvidenceRef[];
}
type ArtifactKind = 'editorial-correction'|'proposed-method'|'software-check'|
  'empirical-result'|'replication-result'|'synthesis-result'|'theoretical-result';
interface ArtifactSubject {
  type:'artifact';kind:ArtifactKind;title:string;summary:string;
  targets:VersionRef[];sources:EvidenceRef[];
  finding:'positive'|'null'|'negative'|'inconclusive'|'not-applicable'|'unknown';
  limitations:string;funding:Disclosure;conflicts:Disclosure;
}
interface ChallengeSubject {
  type:'challenge';target:VersionRef;title:string;argument:string;
  sources:EvidenceRef[];crux:string;
}
interface DecisionSubject {
  type:'decision';problem:VersionRef;from:State;to:'open'|'partial'|'solved';
  results:VersionRef[];criterion:string;reason:string;limitations:string;
}
```

Entry projection uses schema-aware frontmatter and exact body, never string replacements. The adapter's normalized key inventory is:

| Collection | Included frontmatter keys |
| --- | --- |
| problems | `title,number,statement,progress,conditions,bounty,sources` |
| journal | `title,author,date,summary,volume,issue,sources` |
| cases | `title,summary,kind,era,place,depth,lessons,conditions,sources` |
| record, methodology only initially | `title,group,order,summary,status,statusNote,conditions,firstMilestone,help,related,sources` |

Missing optional scalars become null; schema defaults remain explicit arrays/values. Reference objects normalize to `{collection,id}`; source objects have exactly `title,url,publisher,year,note`, missing optional properties null. Known journal declared dates become `YYYY-MM-DD` calendar strings, not invented publication instants. Preserve source order and body whitespace. Exclude `review` in all four adapters and `status` **only in problems**. Unknown current frontmatter fields fail the adapter inventory check until deliberately classified; do not silently drop a new substantive field. A syntax-aware raw parser must see the original keys before Astro's schema can strip them. Historical projection uses the same pinned adapter version, not today's altered schema.

An entry version is a whole-page subject. A claim version covers only its exact wording/context and cited sources. Its selector must actually match its pinned parent source; repeated/ambiguous excerpts fail. A selected frontmatter value/body excerpt must match the claim's statement/context construction under a frozen named selector in the capture adapter; contributors cannot assert unrelated text as an extraction. Keep the two initial selectors explicit and tested rather than introducing a general expression language: depth-census-knowledge-v1 extracts the first paragraph under the exact “Why it matters” heading, with that heading as context; ten-dollars-framing-v1 extracts the summary plus the first editorial-note paragraph, or null context before that note existed. The emitted statement/context must equal those exact slices. Store the adapter ID on each binding and adapterVersion on each version; do not reinterpret historical versions after a future adapter extension. Parent date or compatibility changes can leave the same claim subject intact, but cannot preserve an altered whole-entry review.

Research-result kinds can be proposed without qualifying review, but remain draft. Editorial/proposed-method/software kinds require `finding:'not-applicable'`; they cannot qualify a problem status. `theoretical-result` is allowed, separately labeled, with the same exact-source research/disposition review requirements. A decision's exact progress criterion must equal the target problem version's `progress`. A status cannot be changed by a descriptive case label, local result checksum, GitHub issue state or artifact filename.

## Public observations, actors and reviews

```ts
type PublicObservation = {id:Id;url:string;observedAt:Instant;hash:Hash} & (
 |{kind:'github-pull-request';facts:{number:number;state:'open'|'closed';draft:boolean;
   base:Commit;head:Commit;mergeCommit:Commit|null;mergedAt:Instant|null}}
 |{kind:'github-issue';facts:{number:number;state:'open'|'closed';commentCount:number}}
 |{kind:'github-review-list';facts:{prNumber:number;reviewIds:string[]}}
);
interface Actor {
  id:Id;kind:'person'|'project'|'organization'|'unknown';publicName:string;profileUrls:string[];
  aliases:Id[];humanWork:'unknown'|'publicly-declared';declarationRefs:EvidenceRef[];hash:Hash;
}
interface Review {
  id:Id;subject:VersionRef;scope:'source-framing'|'research'|'peer-review'|'disposition';
  reviewerId:Id;statement:string;sourcesChecked:EvidenceRef[];
  statementRefs:EvidenceRef[];occurredAt:Instant|null;
  independence:'unknown'|'declared-independent'|'not-independent';
  conflicts:Disclosure;
  inspection:{by:Id;at:Instant;refs:EvidenceRef[];decision:'eligible'|'ineligible'|'unknown';reason:string};
  disposition:'approve'|'request-changes'|'comment';hash:Hash;
}
```

Public observation `facts` has a strict kind-specific allowlist: PR number/state/draft/base/head/merge commit/mergedAt; issue number/state/commentCount; review list's PR number and returned review IDs. A missing/null fact is unknown. These dated API observations prove only the displayed metadata at inspection. A merge or empty review list does not constitute qualification. Full private tool responses, emails, API tokens or user account details must never be copied into the ledger.

Actors identify only voluntarily public contributors/projects. Canonical actor IDs must consolidate known public aliases; different account strings alone do not establish different humans. Actor objects are immutable. A newly documented identity link appends a new canonical actor with `aliases` referring to the former public actor IDs and declaration refs; reduce their union only within the selected edition. Never replace an old actor/hash. Recompute current distinctness after a new alias link; old editions stay as-of. No private individual, beneficiary identity or inferred email is allowed. Version authorship is separate from a reviewer’s claim about who the authors are. Unknown/incomplete authorship cannot qualify. Documented complete authorship needs public references, all known contributing identities and an inspected completeness declaration; a new unexplained author-set reduction fails. Authorship is immutable within its version; new attribution needs a new version, even when substantive text is unchanged. R2 lane labels, OS accounts and AI identities cannot become human reviewers through import.

A mechanically eligible review has an approving disposition, exact current subject, documented complete version authorship, public source/statement references, an eligible documented maintainer inspection, a person actor’s publicly declared human work, declared independence and a different canonical identity from every relevant author. The inspection actor is a documented human maintainer distinct from the reviewer; the subject’s author may inspect the existence/scope of another person’s public review but cannot supply that review. Unknown conflicts fail. Declared conflicts need an explicit public inspection explaining why they do not disqualify the review; a checkbox alone never clears them. A review marked ineligible or later withdrawn does not qualify. This is validation of recorded public declarations, not automated proof of human work or independence. Real inspection remains a merge responsibility.

Whole-entry ordinary review needs one eligible `source-framing` statement; two distinct eligible `peer-review` statements are additionally required for journal peer-reviewed wording. Peer review and ordinary source review are separately displayed. A peer-review statement may satisfy ordinary source review only when its public statement explicitly covers every source and framing; add a separate source-framing review record sharing that reference, not implicit scope promotion. Problem changes require eligible `research` review of each result and `disposition` review of the decision. At least two distinct eligible human identities must span research and disposition reviews, each independent of all relevant result/decision authors; one person’s two statements cannot satisfy both sides. Journal still needs its own two eligible peer reviewers.

## Events and reduction

```ts
interface EventBase {
  id:Id;ordinal:number;recordId:Id;sequence:number;previousId:Id|null;previousHash:Hash|null;
  occurredAt:Instant|null;timeBasis:'public-decision'|'pr-merge'|'undated';
  recordedAt:Instant;actorIds:Id[];refs:EvidenceRef[];observationIds:Id[];reason:string;hash:Hash;
}
type Event = EventBase & (
 |{type:'baseline';version:VersionRef;initialProblemState:'open'|'under-review'|null}
 |{type:'version-recorded';before:VersionRef|null;after:VersionRef}
 |{type:'artifact-recorded';artifact:VersionRef;changes:{before:VersionRef;after:VersionRef}[];challengeIds:Id[]}
 |{type:'response';challenge:VersionRef;response:string;dissent:string[]}
 |{type:'challenge-disposition';challenge:VersionRef;responseIds:Id[];
   disposition:'corrected'|'scope-narrowed'|'upheld-with-evidence'|'unresolved'|'withdrawn'|'duplicate';
   resultingClaims:VersionRef[];dissent:string[]}
 |{type:'review-recorded';reviewId:Id}
 |{type:'review-withdrawn';reviewId:Id;replacementReviewId:Id|null}
 |{type:'artifact-withdrawn';artifact:VersionRef;replacement:VersionRef|null}
 |{type:'problem-disposition';decision:VersionRef;researchReviewIds:Id[];decisionReviewIds:Id[]}
);
```

Append contiguous per-record sequences with exact predecessor hashes and a globally contiguous `ordinal` recording order. Recorded timestamps are nondecreasing by ordinal; equal timestamps are allowed. Cross-record dependencies must already be recorded at a lower ordinal (including review-recorded events before a disposition). No forks, duplicate IDs, backwards version links, missing references or cyclic subject/decision dependencies. Every nonbaseline event has public evidence refs and a reason. Baseline events have no historical occurred time; they establish current capture coverage only. `timeBasis:'undated'` iff occurredAt is null. A PR merge time is permitted only for source-backed editorial activity, never a scientific disposition; its referenced PR observation must supply that exact mergedAt. Known dates must not exceed the explicit capture; recordedAt cannot precede occurredAt. Backfills can have older occurredAt than previous events, so reduce by ordinal/per-record sequence, never by filename or occurred-time sorting. A version can be archived without activating it; a version-recorded event changes the current head only from its exact prior head to a new later version. An explicit return to old wording requires a new version, never selecting an old ID. Events in an edition cannot be recorded after its capture.

An initial baseline preserves observed source state without inventing earlier history; seed problems are open. Baseline cannot mint partial/solved status: a legacy unsupported claim starts under-review with the original source label retained as provenance. A later `problem-disposition` applies only if `from` equals the prior derived state, its problem definition is current, all exact result/decision reviews qualify and an actual public-decision instant is supplied. Required scientific reviews need known public instants no later than that decision; an unknown date can still be shown as an undated review, but cannot establish a dated scientific disposition. Later ledger inspection/recording is labeled separately and may backfill older public evidence without changing its dates. An explicit new scientific disposition, including reopening, uses the same review path and retains earlier records. Withdrawal/ineligibility is different: publish it immediately without a replacement result; retain `lastRecordedDisposition`, derive current `effectiveStatus:'under-review'`, remove current source/peer-review qualification and require the corresponding frontmatter downgrade in the same PR. Source-framing fallback is draft. This administrative state makes no new scientific conclusion. A new substantive problem/result version or new identity evidence that invalidates a supporting qualification has the same conservative effect. Issue closure alone does nothing.

Qualification at an earlier disposition ordinal uses only evidence then recorded. A later withdrawal does not rewrite that historical record or an old pinned edition; it removes present support in the new edition. Progress retains the earlier dated decision as recorded-then-qualified and separately lists current support withdrawal/under-review, with its actual known date or an undated marker. Do not count it as a currently supported resolution.

Challenge responses retain original arguments, sources and dissent. A corrected/scope-narrowed disposition needs exact resulting claim versions and a substantive response; withdrawn/duplicate need a sourced explanation. The real correction has no challenge record. Count correction artifacts by unique artifact ID, changed claim subjects separately and qualifying scientific dispositions separately.

## Manifest, current inventory and pinned editions

```ts
interface Manifest {
  schemaVersion:1;adapterVersion:'research-content-v1';currentEditionId:Id;
  capture:{id:Id;at:Instant;commit:Commit};
  coverage:{includedSourceKeys:string[];excludedKinds:string[];limitations:string[]};
  currentSources:{sourceKey:string;recordId:Id;sourceId:Id;currentVersion:VersionRef;href:string}[];
  aliases:{sourceKey:string;recordId:Id;href:string}[];
}
interface Edition {
  id:Id;capturedAt:Instant;period:{from:Instant;to:Instant};
  recordPins:Pin[];versionPins:Pin[];eventPins:Pin[];reviewPins:Pin[];
  sourcePins:Pin[];actorPins:Pin[];observationPins:Pin[];
  heads:{recordId:Id;version:VersionRef;eventId:Id;eventHash:Hash}[];
  currentSources:Manifest['currentSources'];
  coverage:{sourceKeys:string[];baselineKnownFrom:Instant|null;limitations:string[]};
  hash:Hash;
}
interface LedgerInput {
  manifest:Manifest;records:LedgerRecord[];versions:SubjectVersion[];events:Event[];
  reviews:Review[];actors:Actor[];observations:PublicObservation[];
  editions:Edition[];sources:SourceSnapshot[];
}
interface CurrentContent {
  sourceKey:string;href:string;rawText:string;subject:EntrySubject;
  declaredReview:ReviewState;declaredProblemState:State|null;
}
```

The Astro adapter supplies `CurrentContent[]` from actual current raw/schema-parsed files. The model recomputes archived source projections and compares each covered current substantive subject to its declared current version. Raw hashes remain separate: compatibility-only edits may use a new capture/source pin without mutating an existing version or its old source bytes. The manifest must exactly enumerate current collection coverage, including 23 problems, rather than silently omitting a newly added covered item. Renames require explicit aliases/stable ID retention; no source or ID reuse. Initial author declarations on source-derived entry subjects are unknown unless actually documented; do not infer a real human from the byline “Charitology.”

Every edition's pin arrays are unordered unique sets sorted by ID. Its event pins are the complete global recorded-order prefix through its captured head, not an arbitrary selection that hides a known withdrawal. Its `currentSources` pins the exact source capture independently of version source bindings and equals the manifest binding only for the current edition. They must contain the complete referenced closure, including historical predecessors and all objects required to reproduce its qualification. All version/source/actor/review inputs are immutable. Corrections append new versions, identity assertions or withdrawal events. An old edition resolves only its pinned objects, never mutable “latest” records, aliases, current raw files or subsequently added reviews/events. Missing pins, hash drift, dangling refs and silently omitted closure fail. New additions create a new capture/edition. Old edition JSON remains byte-identical; it explicitly says what was recorded by its capture and links to the current ledger for later caveats. A shallow/offline build reads inert checked-in sources only.

Current compatibility checks apply to the manifest's current edition. A covered `reviewed` value needs its current exact-subject qualification, and problem status equals derived `effectiveStatus`, including under-review. New withdrawal/identity evidence must downgrade those compatibility fields in the same PR. Never block the withdrawal pending replacement science. A global adapter scan must reject **any uncovered entry marked reviewed** with a useful registration-required error; uncovered draft pages render their ordinary draft label. No new verified-review badge is inferred on unrelated collections. A proposed future peer-reviewed field is not added to journal frontmatter; its displayed qualification comes only from the ledger.

## Public projections, API and exports

```ts
validateResearchLedger(input:unknown,options:{currentContent:CurrentContent[];
  uncoveredReviews:{sourceKey:string;review:ReviewState}[]}):ValidatedLedger;
projectResearchLedger(graph:ValidatedLedger,{editionId:Id}):LedgerProjection;
researchProgress(graph:ValidatedLedger,{editionId:Id,from:Instant,to:Instant}):Progress;
researchLedgerExport(projection:LedgerProjection,{format:'json'|'csv';
  eventIds:Id[]|null}):{text:string;mime:string;fileName:string;metadata:ExportMetadata};
researchSubjectHash(subject:Subject):Hash;
canonicalResearchJson(value:Json):string;
ledgerHref(id:Id,version?:number):string;
```

`ValidatedLedger` is model-created/frozen, not trusted solely because an arbitrary input has its shape. Only validateResearchLedger can produce the accepted model identity; projections reject an arbitrary cast/JSON clone and require revalidation. Expose LedgerError with bounded `{code,path,message}` issues (shape, limit, hash, reference, chain, source, qualification, status and edition failures); errors cannot substitute empty data. Projection exposes edition ID/hash, capture, coverage, public records with all pinned versions/timelines, qualification/reasons, current problem states, sources/observations and computed counters. A problem view carries `lastRecordedDisposition:VersionRef|null`, `lastRecordedStatus:State`, `effectiveStatus:State` and `support:'baseline'|'current'|'withdrawn'|'ineligible'`; only effectiveStatus feeds current frontmatter, badges, API and counts. It includes an explicit `qualifyingResearchResultIds` set and separate editorial/proposed/software/challenge counters. Reviews are described as recorded public declarations with their inspection references. No privacy-sensitive or hidden fields exist in a public projection.

The exact outer projection is `{schemaVersion:1,edition,graph,views,problemStates,qualifyingResearchResultIds,counters,factualHash}`. `graph` contains each pinned record/version/event/review/actor/observation/source once, omitting the mutable manifest and other editions. `views` is one summary per record `{id,kind,currentVersion,versionIds,eventIds,qualification}`; qualification is `{sourceReview:'draft'|'reviewed',peerReview:'not-applicable'|'not-peer-reviewed'|'peer-reviewed',reviewIds:Id[],reasons:string[]}`. `problemStates` has the problem view shape above. Counters are nonnegative integer counts for records/versions/events/reviews, qualified source/peer reviews, qualifying research results, correction artifacts/changed claims, open/partial/solved/under-review problems and unresolved challenges. factualHash covers this entire object excluding itself; no duplicate full narrative payload belongs in views.


`Progress` exposes `{editionId,editionHash,period,inputHash,coverage,startingStates,endingStates,dispositionsRecorded,currentlySupportedDispositionIds,supportWithdrawals,editorialCorrections,changedClaimIds,reviewEvents,undatedEvents,lateBackfills,counters,limitations}`. Validate real UTC `[from,to)`, from < to <= edition capture. Starting states without a recorded baseline are null/unknown, not open/zero; ending states are known only where coverage supports them. Distinguish unique result IDs, unique affected problems and event counts. Include retractions/reopenings/caveats. No present status is backdated to January. Hash only explicit pinned inputs/period, not build time, URL order or file traversal order.

Proposed routes: `/research-ledger/`, `/research-ledger/<encoded-id>/#version-N`, `/research-ledger/editions/<encoded-id>/`, `/research-ledger/editions/<encoded-id>.json` and `/research-ledger/sources/<encoded-id>.txt`. `ledgerHref` encodes the namespaced ID exactly once; invalid/duplicate decoding, path traversal and wrong version numbers fail. Links pass through existing `url()` for base paths. Historical sources render/download as escaped inert text. Filterable server-rendered content is fully readable without JavaScript; optional filters use only fixed enums and bounded text.

Add `/api/v1/research-ledger.json` and `research-progress.json` to `ENDPOINTS`; current edition/capture selects the data. Add an optional endpoint capture override to `buildEndpoint` so these wrappers and factual JSON are deterministic; retain other endpoints' existing wrapper contract. All ledger instants remain exact UTC strings; declared manuscript calendar dates remain calendar dates. API `generated` uses the pinned capture's calendar date for compatibility, while data contains full capturedAt. Historical edition downloads contain only their pinned payload/checksum and never change when a later edition is added.

Full JSON exports are canonical lossless pinned projections with `{format:'charitology-research-ledger',version:1,editionId,editionHash,data,checksum}`; checksum covers all fields except itself. No wall-clock exportedAt is added. JSON export is always complete; `eventIds` must be null for JSON. CSV may select exact unique event IDs, labels its filter/partial scope and omitted counts, and includes a separate metadata row even when zero events match. Every event row includes edition/hash, stable IDs, type, full timestamps, source/review refs and reason. Neutralize leading formulas after whitespace/control checks before quote escaping; JSON remains lossless. Do not reuse the existing quote-only helper without formula defense.

## Finite limits and implementation proof

Limits are records 1,000, versions 3,000, events 5,000, reviews 2,000, actors 500, observations 500, sources 250, editions 10. The exact combined canonical LedgerInput JSON, including source text once per snapshot and its JSON escaping, is at most 5,242,880 UTF-8 bytes. Do not add the same source text again per referring version. Bound individual raw source inputs before decoding/copying; bound full input before clone and every full exported JSON envelope at 8,388,608 bytes before output. Projection indexes reference graph IDs rather than duplicating full bodies/events in every view. Each individual source is at most 128 KiB, frontmatter/body or excerpt at most 32,768 characters, reason/summary/limitation at most 4,000, public URL 1,200, title 500, locator 500 and ID 100. Evidence refs 20/object, author/actor IDs 20/object, claim changes 20/artifact event, dissent 20×4,000, responses 50/disposition, version source bindings 10 and edition pins bounded by their corresponding global counts. Tables show 20 rows/page; do not cap semantic totals at the visible page size.

The public seed must pass actual full encoded-byte measurement before acceptance; these finite refusal bounds are fixed before runtime implementation. Do not reject a genuine source silently or truncate an existing file to fit. No raw private local register data, files, emails, participant receipts, provider secrets, narrative casework or synthetic production record may enter the input. Malformed URLs, unsafe credentials, invalid instants, ambiguous selectors, unknown keys, altered pins and excessive bounds fail with clear typed error codes/path; they never become empty coverage.

Required tests include actual source-adapter equality and source-byte hashes; review/status hash-cycle boundaries; global uncovered-reviewed refusal; current source drift and renamed aliases; exact selectors; synthetic challenge and scientific decision/reopening paths; duplicate/incorrect/conflicted/withdrawn reviewers; no author or same-person-alias double review; wrong result type; per-record event chain forks; old edition immutability under new backfill; null January coverage; unique correction counts; offline/shallow and cross-clock/time-zone determinism; formula-safe CSV and lossless JSON; escaping and route/base paths; actual downloaded byte checks and no synthetic content in built APIs. No test result upgrades a real draft or proves an independent human review.

## Capture helper exports

The pure syntax-aware capture module exports:

```ts
captureResearchEntry(input:{sourceKey:string;rawText:string}):{
  subject:EntrySubject;declaredReview:ReviewState;declaredProblemState:State|null
};
captureResearchClaim(input:{parentId:Id;selector:Selector;rawText:string}):ClaimSubject;
```

`sourceKey` is the exact `collection/id` key, with only the four documented adapters allowed and only `record/methodology` in the record adapter. The capture rejects unsupported selectors, unknown raw frontmatter keys and invalid field shapes rather than applying today's Astro schema silently. Use exact locked js-yaml 4.3.2, JSON schema, duplicate-key refusal and maxDepth 20; reject repeated/cyclic container aliases and unsupported merge keys. A shared pure canonical/hash helper may break module cycles; it must preserve the exact public model exports above. No helper reads files, clocks or network.
