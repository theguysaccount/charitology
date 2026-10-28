# OS learning bridge: frozen implementation contract

October 27, 2026. Root froze this implementation contract after the Disaster Desk publication and review of the consolidated proposal, all four runtime findings, the correction/capacity amendment and 85 actual native-string codec probes. The held input SHA-256 is `bb078b9a103e4bb5665319fab74fd64825257d4f5b9c8526423928e1f0879519`. This records a design, not completed software, production migration or empirical research. The original Disaster source A/artifact B and all native formats stay unchanged. This closes one bounded software workflow; the original mega list and Charity OS retain their wider requirements.

This is the single complete replacement proposal for root review. It consolidates the earlier implementation contract (SHA-256 `77315dbcddef13c51736949c06a7264b99ad3e47a52275bfbe2575d93cf4330a`), amendment (SHA-256 `7ba93870f67b02786e5801536497487ae8dad465b4fd53f2a2f09697ecec508c`) and independent runtime review (SHA-256 `ae666a208089120042ccf1deff2f5aadb47cf79104040ebccfbf17c9c4adfb7c`). Those inputs remain unchanged. No reader needs to apply an override appendix to this document. V1 has not yet been implemented or released. This file is the single frozen normative contract for the implementation; changes need an explicit recorded contract amendment.

The original bounded draft and its earlier findings remain historical preparation evidence. This document replaces their implementation choices, not their recorded evidence or acceptance status.
## 1. Smallest useful release and explicit boundaries

An authorized staff member uploads one actual native ToC export or one actual native Nonprofit Advisory backup, selects exactly one source plan/checkpoint, inspects the complete retained scope, explicitly adopts or adapts its intended outcome, review/stop rule, comparison and feedback plan, and maps one to ten indicators into an existing OS program. The service creates ordinary unapproved indicator and protocol records. A different authorized account approves them through existing OS workflows. Staff enter repeated measurements with explicit periods, create correction attempts, abandon a wrong attempt or independently approve and explicitly apply a supported replacement, and author a decision against the adopted rule. After ordinary decision and manifest approvals, a private compiler freezes one explicitly selected report containing the source → adopted intent → definition → measurement → assessment → decision chain. Full backup and restore preserve this evidence without restoring authority; explicit adoption creates fresh live drafts.

The acceptance journey uses one indicator and at least three measurements, including a known zero and a missing value. It must reach a downloaded immutable JSON report, safe private print, native full backup, clean restore and explicit adoption. Two native adapters, corrections, exact Retry and inactive recovery are part of this release, not later polish.

Release one is **private staff first**. There is no board projection, external reviewer, funder/public report, publish route, automatic synchronization, source URL fetch, inferred narrative measurement, formula engine, aggregation, trend verdict, target-attainment calculation, causal-impact claim, statistical test, participant record, scheduled collection, provider integration or outreach. Existing ordinary module fields keep their established visibility; raw imported source remains in the restricted feature store. This distinction must be shown before approval.

### Compatibility boundaries that must remain named in code and tests

1. `impact-drafts`, its exact `{v:1,current,drafts}` value, D1 `charitology-local-draft` v1 envelopes and the single ToC native exporter stay unchanged. No bridge action reads or writes another origin's localStorage.
2. `charitology.partner-workspace-v1.nonprofit-advisory`, all five composed native collections and its existing native recovery format stay unchanged. Program graph, local status/reviewer labels and Readiness fields grant no hosted authority.
3. The existing 26 module IDs, field names, normal validation, separate-account approval, program scoping, old CSV and generic legacy report semantics stay unchanged. Add only `learning-review-v1` to Reporting.assemblyMethod plus its necessary conditional validation/help, guards and readers. Do not raise the existing 100-reference ceiling.
4. Grant-report-v1 keeps its agreement requirement, source digest, previews, private/board readers and immutable payload rules. Learning never masquerades as a grant report. Directory and recurrence source/Retry/recovery formats stay unchanged.
5. Existing OS v1/schemaVersion1 full backups without `learningBridge` remain accepted. Existing restore resets records to initial states, revision 1, restorer ownership, null approval/snapshot. Existing source archives, their 30-minute pending policy and 32/128 MiB committed policy stay unchanged.
6. Learning has two additive private tables: append-only history/receipts and transient previews. Do not reuse `storePreview`/`commitPreview` in a way that archives the complete native upload. This corrects the original draft's under-specified “one table” proposal.

## 2. Source adapters and version pins

Review baseline observed at repository HEAD `32b80a71f07ef0b5dbb46b9168aaf35aab63ce3f`. Source files were read, not edited. Git blob identities at this review:

| Source contract | Git blob |
| --- | --- |
| `src/lib/client/theory-of-change.ts` | `fe567b01f95e47400bb32c2ffe31ac0bfc704e0c` |
| `src/lib/client/donor-recovery-schemas.ts` | `1e7eb0c93aeb68c37f31eb5ddd966ee52d2d35eb` |
| `src/lib/client/remaining-record-recovery-formats.ts` | `6b0488df3067e23b23f160868aa8751f9a0e1a5a` |
| `src/lib/client/remaining-record-recovery-schemas.ts` | `bbfc67f377628d6558d90726e092678f9ce6d298` |
| `src/data/program-graph-adapters.ts` | `388f06626c0a98c3e902ed4226ea68c7ac4234e8` |

Freeze a checked, closed adapter registry in implementation containing adapter ID, native format/key/version, mapping version, exact selected-source descriptor and SHA-256 of that descriptor. The frozen descriptor includes the retained string policy postgres-jsonb-selected-scalars-v1 as part of its hashed interpretation. Record that registry SHA-256 in every capture. A deterministic service build must bundle the actual pure native admission modules, with a build/test fixture proving the generated service entry uses those exports. The source blob identities above are review anchors, not security authority and not substitute runtime validation. Any later native admission or mapping change needs a new adapter/mapping version; never rewrite old captures with new code. Unknown adapter versions fail closed for live commands. Restore supports only explicitly implemented historical versions and never executes code from a backup.

### A. `theory-of-change-native-v1`

Accept exactly the current single-draft export from `theory-of-change.ts:265`:

```ts
type ToCIndicator = {what:string; how:string; when:string; baseline:string; target:string};
type ToCDraft = {
  id:string; name:string; problem:string; source:string; depth:0|1|2|3|4|null;
  activities:string; outputs:string; outcomeShort:string; outcomeMedium:string;
  outcomeLong:string; indicators:ToCIndicator[]; assumptions:string;
  feedbackMethod:string; feedbackFrequency:string; comparison:string; stopRule:string;
  reviewer:string; reviewDate:string; example:boolean; createdAt:string; updatedAt:string;
};
type ToCNative = {
  format:"charitology-theory-of-change"; version:1; exportedAt:string; draft:ToCDraft;
};
```

The wrapper is closed and exportedAt must be a valid timestamp literal admitted without rewriting. Validate its draft by the actual strict D1 impact schema using an in-memory `{v:1,current:draft.id,drafts:[draft]}`. That synthetic wrapper is validation input only, never retained provenance. Draft ID obeys the existing 80-unit identity rule, each native text its existing 5,000-unit limit, indicators 0..30, native timestamp literals their existing validation. The native reviewDate is only shape-checked by the old contract: preserve e.g. `2026-02-30` as source text; never promote it into an OS Day. `source` means the mechanism producing the problem, not a URL/citation. Baseline/target/when remain strings. `"0"` stays narrative text. `example:true` remains visible and cannot become an empirical observation.

Reject D1 full-library/individual envelopes and bare Drafts at this chooser with a precise supported-format message. Do not call `cleanDraft`, `parseImport`, ID generators or timestamp repair. The bridge upload ceiling is exactly 1,000,000 bytes, matching the current single-draft chooser; it does not promise the D1 library ceiling. Retain the entire admitted wrapper/draft, including exportedAt, unchanged as selected JSON data. Formatting/whitespace remain represented by original upload hash/size, not reconstructed bytes.

### B. `nonprofit-learning-native-v1`

Accept the complete actual native backup with `parseRemainingRecordBackup(bytes, "charitology.partner-workspace-v1.nonprofit-advisory")`. The frozen composed adapter is `partner-nonprofit-advisory-v1`, not just the first four public configuration collections. Exact top-level native shape:

```ts
type NativeLearningStatus = "Draft"|"Needs evidence"|"Ready for discussion"|"Recorded decision"|"Closed";
type NativeDiagnostic = {id:string;values:{title:string;
 area:"Outcomes and causal pathway"|"Evidence and comparison"|"Full costs and capacity"|
      "Voice and access"|"Reporting burden"|"Governance and incentives";
 current:string;gap:string;consequence:string;
 depth:"Unclassified"|"0 Relief"|"1 Repair"|"2 Prevention"|"3 Structure"|"4 Source"|"Several levels";
 status:NativeLearningStatus}};
type NativeEvidence = {id:string;values:{title:string;
 type:"Outcome evidence"|"Output description"|"Cost or capacity assumption"|"Feedback and access"|"Rival explanation";
 measure:string;finding:string;source:string;
 evidence:"Unknown or not checked"|"Public description only"|"Observational evidence"|"Causal study"|"Mixed or disputed"|"Hypothesis";
 method:string;limits:string;checked:string}};
type NativeAction = {id:string;values:{title:string;diagnostic:string;owner:string;date:string;
 steps:string;burden:string;complete:string;status:"To do"|"In progress"|"Blocked"|"Done"}};
type NativeReadiness = {id:string;values:{title:string;owner:string;
 status:"Not established"|"Needs outside review"|"Evidence recorded locally"|"Needs revision";
 source:string;date:string;notes:string}};
type NonprofitNative = {
  version:1; program:"nonprofit-advisory"; updated:string;
  context:{name:string;activity:string;decision:string;change:string;baseline:string;
           capacity:string;voice:string;privacy:string;period:string};
  records:{diagnostics:NativeDiagnostic[];evidence:NativeEvidence[];
           actions:NativeAction[];learning:NativeLearning[];readiness:NativeReadiness[]};
};
type NativeLearning = {id:string;values:{
  title:string;outcome:string;method:string;rule:string;feedback:string;result:string;
  date:string;status:NativeLearningStatus;
}};
type SelectedNonprofit = {
  version:1;program:"nonprofit-advisory";updated:string;
  context:NonprofitNative["context"];learning:NativeLearning;
};
```

The four complete Native* row types above and NativeLearning are the exact closed row descriptors of that frozen composed adapter, without optional narrowing, alternative costs collections or arbitrary dictionaries. All keys are required even when an optional native field holds an empty string; actual field-specific min/max/option/date/URL checks remain the frozen native validator's authority. The actual existing whole-file runtime validator is mandatory; copying only the selected-row schema is insufficient. Existing per-collection 250 and whole-file 500 row limits, exact keys, field ranges and 8,000,000-byte ceiling apply. Choose one exact learning ID after local strict inspection; send the original full bytes plus that ID, and independently admit/select the same row server-side. Retain all nine context fields plus the complete selected eight-field row and native top metadata. Disclose that diagnostics/evidence/actions/readiness and other learning rows are validated but not retained. Empty/optional native strings remain empty; no invented defaults. Native method/result/date/status never become an OS method/value/period/approval automatically.

### Common capture rules

Hash the full exact uploaded bytes before parsing; strictly reject malformed UTF-8/BOM, duplicate decoded keys, unsafe prototype keys, extra fields, nonfinite numbers, over-depth/work/byte limits and a missing/duplicate selected ID. Use actual native admission before selection. Native codecs can admit escaped lone UTF-16 surrogate code units and NUL in free text; do not describe those valid native values as malformed native files or silently repair them. The additional hosted representability rule below applies only to retained selection and new hosted feature DTOs. The strict in-memory object boundary additionally rejects accessors, exotic prototypes, proxies where detectable, sparse/decorated arrays and cycles. Do not claim to prove that an arbitrary hostile Proxy is harmless: only the decoder's detached, frozen JSON output crosses into the pure compiler. Preserve selected strings, array order, nulls and timestamp literals. No trimming, truncation, source rewriting, URL fetch or narrative extraction.

**Explicit bridge-only hosted string restriction:** every string in the retained SourceCapture (including selected native value, native identity and selection ID), new feature DTO, visible authored target block and retained ordinary evidence must contain neither U+0000 nor an unpaired high/low UTF-16 surrogate. This is an additional first-release bridge admission restriction, required by direct PostgreSQL JSONB storage; it is not a change to either native codec or exporter. Valid paired surrogates/Unicode remain exact. A native file with such code units only in validated-but-unretained Nonprofit rows can pass selection; do not blanket-reject decoded native strings that never cross the retained boundary. Before a preview is stored or a source captured, identify the retained field path and refuse with: “Valid native source; selected text is unsupported by this hosted bridge. The original file was not changed. Keep the original file and its native recovery; to continue here, edit an explicit copy in the original tool and export it again.” Never replace it with U+FFFD, strip NUL, trim or truncate. Do not store that rejected field value in errors/logs.

Independent private codec review `native-learning-string-review.md` (SHA-256 `8fc25153ec61ffd648544167edfb364100f91fcd10397da0580ae4e47fcdcb86`) records 85 actual-module probes, not hosted DB/browser acceptance. Actual native codec probes must cover high/low surrogates, literal `\ud800` text versus a decoded surrogate, U+0000, paired Unicode and unselected-row cases. Native/export/recovery formats remain untouched. Canonical hashing always serializes the whole JSON value with stable/JSON.stringify first, then UTF-8 encodes the serialized JSON; never hash a bare native field through TextEncoder, which replaces lone surrogate units. Native accepted literal strings are otherwise retained byte-for-code-unit exactly. A future fully general native-string bridge would require an explicitly versioned storage representation; it is not implemented by silently changing this restriction.

The full native file exists in bounded request memory only, and is discarded after validation/selection. Store no filename, full request body or source prose in logs/audit/errors. Before submission state: “The server validates this complete file and keeps only the selected scope. Keep your original file.” A raw hash/size records received bytes; it does not authenticate authorship or make an unretained full backup reconstructible. A selected JSON export is explicitly partial, not the original native backup.

### Exact source-version behavior

Only an accepted fresh native upload creates a new SourceCapture. Inspection is an expiring fixed proposal and does not itself advance durable counters; commit accepts its exact bytes/time/pins with the mapping event or none. A new binding from a native upload starts sourceVersion1 with previousSource:null. Ordinary refresh uses the next local captured sourceVersion (maximum8) and exact previous local SourcePin; refresh explicitly creates the next mappingNumber. Remap reuses the explicit existing SourcePin and creates a new mappingNumber/definition/protocol IDs without inventing a receivedAt or source version. A deliberate new refresh can capture identical original bytes again as another receipt, visibly labeled “same uploaded bytes; a new received time”, not changed source facts. Exact CommitInput Retry never increments a counter twice.

An adopted binding starts with its own new live sequence1 root and mappingNumber1 but **zero local SourceCapture rows**. Its root source is the exact recovered historical SourcePin; do not clone that capture, rewrite its origin/binding/version, or pretend the original full native file was received. The first later real native refresh on that adopted binding creates local sourceVersion1 with previousSource:null, even if the inherited foreign sourceVersion was larger. The adopted root remains the explicit historical provenance link. Subsequent local captures are version2..8 with exact local previousSource pins. New received captures and old foreign provenance coexist without changing the old hashes. Refresh requires matching inherited adapter and exact native identity/selection ID; a different identity needs an explicit new binding, never silent relinking. Full backup closure resolves both local chains and the adopted foreign ancestry; selected reports enumerate omitted historical parents as explicit boundaries.

SourceCapture's adapter, selection and selected discriminants must agree exactly. nativeIdentity equals ToC draft.id or the selected native learning row.id, with literal native identity rules plus the explicit retained JSONB representability restriction. Source and event versions are provenance counters, not scientific confidence, refreshed approvals or authority. The 20-binding bound counts complete retained live+recovered binding roots; capacity can prevent adoption, which refuses without pruning old history or reusing a recovered root.

## 3. Closed feature DTOs and canonical hashing

Every feature object below has exactly its listed keys. Nullable fields are present as null. Discriminated union members have only their own keys. All IDs, counts, strings and arrays have runtime validators; TypeScript alone is insufficient. No user-controlled object is spread into an OS record or SQL row.

```ts
type Id = string; // /^[A-Za-z0-9_-]{1,100}$/; service-generated IDs are lowercase UUIDv4
type Hash = string; // exactly 64 lowercase hex
type AuditId = string; // canonical positive PostgreSQL bigint decimal, 1..9223372036854775807
type Instant = string; // canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ
type DbInstant = string; // canonical UTC with exactly six fractional digits, server SQL to_char
type Day = string; // real YYYY-MM-DD, 1900..2200; start<=end
type Adapter = "theory-of-change-native-v1"|"nonprofit-learning-native-v1";
type Module = "programs"|"outcomes"|"evaluation"|"reporting";
type Action = "continue"|"modify"|"test"|"stop";
type ChangeOperation = "map"|"measure"|"correct"|"apply-correction"|"abandon-correction"|"decide"|"adopt";
type Operation = ChangeOperation|"freeze";
type WorkingPin = {moduleId:Module;recordId:Id;revision:number;dataSha256:Hash};
type SourcePin = {originOrgId:Id;bindingId:Id;version:number;sha256:Hash};
type HeadPin = {originOrgId:Id;bindingId:Id;sequence:number;eventSha256:Hash};
type RecordPin = {originOrgId:Id;moduleId:Module;recordId:Id;revision:number;
                  snapshotSha256:Hash;approvalEventId:AuditId;approvalSha256:Hash};
type FileMeta = {id:Id;name:string;mime:string;size:number;checksum:Hash};
type OrdinaryDataByModule = {programs:OrdinaryProgramData;outcomes:OrdinaryOutcomeData;
  evaluation:OrdinaryEvaluationData;reporting:OrdinaryReportingData};
type SnapshotFor<M extends Module> = {id:Id;orgId:Id;moduleId:M;data:OrdinaryDataByModule[M];
  status:string;ownerId:Id;revision:number;createdAt:Instant;updatedAt:Instant;files:FileMeta[]};
type Snapshot = {[M in Module]:SnapshotFor<M>}[Module];
type Approval = {status:"approved";revision:number;actorId:Id;reason:string;at:Instant};
type OrdinaryRecordFor<M extends Module> = {id:Id;orgId:Id;moduleId:M;
  data:OrdinaryDataByModule[M];status:string;ownerId:Id;lastEditedBy:Id;revision:number;
  approval:Approval|null;snapshot:SnapshotFor<M>|null;
  source:{integrationId:Id;externalId:string;checksum:Hash}|null;createdAt:Instant;updatedAt:Instant};
type OrdinaryRecord = {[M in Module]:OrdinaryRecordFor<M>}[Module];
type ApprovedEvidence = {format:"charitology-learning-approved-evidence";version:1;
  pin:RecordPin;snapshot:Snapshot;approval:Approval;
  approvalEvent:{id:AuditId;action:"record.approved";actorId:Id;createdAtExact:DbInstant;recordSha256:Hash};
  sha256:Hash};
type SourceCaptureCommon = {format:"charitology-learning-source";version:1;
 registrySha256:Hash;originOrgId:Id;bindingId:Id;sourceVersion:number;
 previousSource:SourcePin|null;receivedAt:Instant;originalBytes:number;originalSha256:Hash;
 nativeIdentity:string;sha256:Hash};
type SourceCapture = SourceCaptureCommon & (
 {adapter:"theory-of-change-native-v1";selection:{kind:"whole-draft"};
  selected:{kind:"theory-of-change";value:ToCNative}}|
 {adapter:"nonprofit-learning-native-v1";selection:{kind:"learning-row";recordId:string};
  selected:{kind:"nonprofit-learning";value:SelectedNonprofit}}
);
type Period = {kind:"unknown"}|{kind:"closed-days";startDate:Day;endDate:Day};
type Unit = {kind:"unknown"}|{kind:"defined";text:string;
  quantityKind:"count"|"amount"|"percentage"|"rate"|"other";
  definition:string;denominatorDefinition:string|null};
type SourceField = "toc.outcomeShort"|"toc.outcomeMedium"|"toc.outcomeLong"|"toc.stopRule"|
  "toc.comparison"|"toc.feedbackMethod"|"toc.feedbackFrequency"|
  "np.learning.outcome"|"np.learning.rule"|"np.learning.feedback"|"np.context.change";
type Basis = {disposition:"adopted"|"adapted"|"uncollected"|"not-adopted";
              sourceFields:SourceField[];text:string|null;reason:string|null};
type ReviewBasis = {intendedOutcome:Basis;
  rule:{basis:Basis;whenMet:Action|null;whenNotMet:Action|null};comparison:Basis;feedback:Basis};
type IndicatorOrigin = {kind:"toc-indicator";index:number}|{kind:"learning-checkpoint"}|
                       {kind:"author-defined";reason:string};
type IndicatorInput = {slot:number;origin:IndicatorOrigin;title:string;unit:Unit;
  population:string;geography:string|null;plannedPeriod:Period;limitations:string};
type ProtocolInput = {title:string;question:string;
  method:"unknown"|"before-after"|"comparison"|"randomized"|"contribution-analysis"|"qualitative";
  uncertainty:string;harms:string;reviewDate:Day|null};
type MappingInput = {mappingVersion:"learning-mapping-v1";basis:ReviewBasis;
                     indicators:IndicatorInput[];protocol:ProtocolInput};
type MapProposal =
  {mode:"new";inspectionId:Id;program:WorkingPin;mapping:MappingInput}|
  {mode:"refresh";inspectionId:Id;head:HeadPin;program:WorkingPin;mapping:MappingInput}|
  {mode:"remap";head:HeadPin;source:SourcePin;program:WorkingPin;mapping:MappingInput}|
  {mode:"adopt-recovered";recoveredHead:HeadPin;source:SourcePin;program:WorkingPin;mapping:MappingInput};
type Locator = {kind:"known";text:string}|{kind:"not-collected"};
type MeasurementInput = {head:HeadPin;mappingEventSha256:Hash;program:RecordPin;
  protocol:RecordPin;definition:RecordPin;title:string;value:number|null;denominator:number|null;
  period:{kind:"closed-days";startDate:Day;endDate:Day};
  method:"unknown"|"administrative"|"survey"|"observation"|"experiment";
  evidence:"unknown"|"self-reported"|"source-linked";sourceUrl:string|null;
  locator:Locator;missingReason:string|null;limitations:string};
type CorrectionInput = {measurement:MeasurementInput;replaces:RecordPin;reason:string};
type CorrectionApplyInput = {head:HeadPin;correctionEventSha256:Hash;replacement:RecordPin};
type CorrectionAbandonInput = {head:HeadPin;correctionEventSha256:Hash;reason:string};
type RuleAssessment = {result:"met"|"not-met"|"unassessable"|"not-adopted";
                       explanation:string;departureReason:string|null};
type FeedbackAssessment = {status:"collected"|"not-collected"|"unknown";
                           summary:string;sourceUrl:string|null};
type DecisionInput = {head:HeadPin;mappingEventSha256:Hash;program:RecordPin;protocol:RecordPin;
  observations:RecordPin[];discussedDefinitions:RecordPin[];title:string;action:Action;assessment:RuleAssessment;
  feedback:FeedbackAssessment;uncertainty:string;harms:string;followUp:Day;noEvidenceReason:string|null};
type ManifestInput = {title:string;programId:Id;startDate:Day;endDate:Day;summary:string;
  missingness:string;issueDate:Day|null;supersedes:{reportId:Id;checksum:Hash;reason:string}|null};
type SelectionInput = {head:HeadPin;mappingEventSha256:Hash;program:RecordPin;source:SourcePin;
  protocol:RecordPin;definitions:RecordPin[];observations:RecordPin[];decision:RecordPin;
  manifestRecordId:Id};
type FinalSelection = {selection:SelectionInput;manifest:RecordPin;sourceDigest:Hash};
type CreatedRecord = {moduleId:"outcomes"|"evaluation";recordId:Id;revision:1;dataSha256:Hash};
type EventPayload =
  {kind:"mapped";mode:"new"|"refresh"|"remap";source:SourcePin;program:WorkingPin;
   mapping:MappingInput;mappingNumber:number;records:CreatedRecord[]}|
  {kind:"adopted";recoveredHead:HeadPin;source:SourcePin;program:WorkingPin;
   mapping:MappingInput;mappingNumber:1;records:CreatedRecord[]}|
  {kind:"measured";input:MeasurementInput;record:CreatedRecord}|
  {kind:"corrected";input:CorrectionInput;record:CreatedRecord}|
  {kind:"correction-applied";correctionEventSha256:Hash;replaces:RecordPin;replacement:RecordPin}|
  {kind:"correction-abandoned";correctionEventSha256:Hash;candidateRecordId:Id;reason:string}|
  {kind:"decided";input:DecisionInput;record:CreatedRecord}|
  {kind:"report-frozen";selection:FinalSelection;reportId:Id;reportChecksum:Hash;
   frozenManifest:WorkingPin};
type LearningEvent = {format:"charitology-learning-event";version:1;originOrgId:Id;
  bindingId:Id;sequence:number;previous:HeadPin|null;actorId:Id;recordedAt:Instant;
  programId:Id;payload:EventPayload;sha256:Hash};
type Exclusion = {recordId:Id;revision:number;reason:"not-selected"|"replaced"|"outside-period"|
  "unapproved"|"different-mapping"|"deleted"|"pending-correction"|"abandoned-correction"|
  "unresolved-correction";replacedBy:Id|null};
type Boundary = {kind:"source-parent";pin:SourcePin}|{kind:"event-parent";pin:HeadPin};
type LearningReport = {format:"charitology-os-report";kind:"learning-review";version:1;
  methodVersion:"learning-review-v1";id:Id;orgId:Id;title:string;createdBy:Id;createdAt:Instant;
  audience:"private-staff";selection:FinalSelection;manifest:LearningManifestData;
  basis:ReviewBasis;assessment:RuleAssessment;feedback:FeedbackAssessment;
  sources:SourceCapture[];approvedEvidence:ApprovedEvidence[];events:LearningEvent[];
  exclusions:Exclusion[];boundaries:Boundary[];
  supersedes:{reportId:Id;checksum:Hash;reason:string}|null;checksum:Hash};
type CommitResult = {outcome:"mapped"|"adopted"|"measured"|"corrected"|"correction-applied"|
  "correction-abandoned"|"decided"|"frozen";
  head:HeadPin;records:WorkingPin[];report:{id:Id;checksum:Hash}|null};
type CommitInput = {previewId:Id;reviewSha256:Hash;commandKey:string}; // lowercase UUIDv4
type CommitResponse = {ok:true;kind:"committed"|"already-committed";result:CommitResult;
  disposition:"active"|"trash"|"historical-only"};
```

`OrdinaryProgramData`, `OrdinaryOutcomeData`, `OrdinaryEvaluationData` and `OrdinaryReportingData` are the complete closed normalized ordinary module records explicitly listed in section 4. `BridgeOutcomeData`, `BridgeEvaluationData` and `LearningManifestData` are narrower generated compiler outputs, not alternate generic module schemas. Each Snapshot.data/OrdinaryRecord.data must match its module and kind, not merely one union member. OrdinaryRecord is the exact `rowRecord` shape; its source provenance is existing integration metadata, never new learning source text, and externalId obeys the existing nonblank 160-unit ceiling. Bridge-created records use source:null. Native identities retain their native rules; they are not coerced into an OS Id. Revisions are positive PostgreSQL int32 integers; sourceVersion/mappingNumber are 1..8, sequence 1..1,000 and indicator slots 1..10. Audit IDs are strings because `os_events.id` is bigserial; never coerce them through an unsafe JS Number.

Use SHA-256 of UTF-8 `"charitology-learning/v1/" + kind + "\n" + stable(value) + "\n"`, where stable is the existing OS sorted-key JSON algorithm, exact strings and array order preserved. Kinds are separately closed constants: source, evidence, snapshot, approval, audit-record, data, event, proposal, review, selection, digest, report, command, request, membership, actor-binding, session, restore-epoch, registry. Objects with sha256/checksum omit only that own field for their own hash. Do not apply this new prefix to existing native/OS/grant/backup checksums. LearningReport.checksum uses the new report hash; top-level full backup.checksum retains existing `hash(payload)` behavior. Readers dispatch before checksum interpretation.

SourcePin.sha256 is the matching SourceCapture.sha256. RecordPin hashes only the exact snapshot and approval copied from the matching immutable approval event; ApprovedEvidence.sha256 covers its complete evidence object. HeadPin hashes its event. Source parent/event boundaries are explicit in selected reports. Full backups permit no missing parent/evidence boundary. Hashes prove consistency, not authenticity, causal validity or permission.

## 4. Intent, mapping and ordinary target bytes

The server resolves every Basis.sourceFields path against the selected SourceCapture, with the source pin supplied by its mapping event. No arbitrary JSON Pointer or external URL is allowed. ToC outcome slots allow the three outcome fields; rule only stopRule; comparison only comparison; feedback only feedbackMethod/feedbackFrequency. Nonprofit outcome allows learning.outcome/context.change; rule only learning.rule; feedback only learning.feedback; comparison has no native direct field, so an authored comparison is `adapted` with no sourceFields and a reason, or `uncollected`/`not-adopted`. No absent native field is manufactured. All slots are required; unknown never becomes empty success.

For adopted/adapted Basis, nonblank text is required. `adopted` requires at least one allowed nonempty source field and exact equality to that field, or the exact two-field feedback rendering `Method: <verbatim>\nFrequency: <verbatim>` when both ToC feedback fields are chosen in that order. `adapted` requires a reason and may use empty sourceFields only for expressly author-supplied intent. For uncollected/not-adopted, text is null and a reason is required. The original complete source remains alongside the adopted interpretation. IntendedOutcome must be adopted/adapted to create live measurement records; a wholly unknown outcome can still be retained as an inspected source but cannot silently make a usable protocol. Rule/feedback/comparison may remain unknown with explicit reasons. If rule.basis.disposition is exactly not-adopted or uncollected, both planned actions must be null; adopted/adapted may carry explicitly chosen actions or null. Never parse a qualitative stopRule/rule to infer thresholds, actions or dates.

Indicators have stable **mapping slots** 1..10, contiguous and unique. A ToC origin index refers to that exact capture's array only; no stable source indicator IDs exist. A refresh/reorder always needs explicit renewed mapping. `author-defined` requires a reason and is visibly authored, not extracted. Unit defined requires nonblank text/definition; count/rate/percentage semantics and denominator definition are approved user choices. Population is separate from geography and required, even if deliberately “Unknown; not collected” with an explicit limitation. A measured series cannot silently change unit/population/denominator meaning; remap creates new definition and protocol IDs. Planned period may remain unknown. Every actual observation period must be known. Unknown unit blocks measurement until a new mapping defines it; an unknown planned period alone does not prevent later deliberate measurement with actual dates.

Compile the following complete closed module data; every field not derived from explicitly approved user input has the stated fixed value, never a source-text heuristic:

```ts
type OrdinaryProgramData = {title:string;kind:"program"|"system-map"|"assumption";purpose:string|null;
 community:string|null;mechanism:string|null;depth:number|null;
 evidence:"hypothesis"|"documented"|"established"|"debated"|null;
 assumptions:string|null;sourceUrl:string|null;reviewDate:Day|null};
type OrdinaryOutcomeData = {title:string;kind:"indicator"|"observation"|"harm";programId:Id|null;
 indicatorId:Id|null;value:number|null;unit:string|null;denominator:number|null;
 startDate:Day|null;endDate:Day|null;geography:string|null;
 method:"unknown"|"administrative"|"survey"|"observation"|"experiment"|null;
 evidence:"unknown"|"self-reported"|"source-linked"|"independently-reviewed"|null;
 sourceUrl:string|null;limitations:string|null};
type OrdinaryEvaluationData = {title:string;kind:"question"|"protocol"|"review"|"decision";
 programId:Id|null;outcomeIds:Id[]|null;question:string|null;
 method:"unknown"|"before-after"|"comparison"|"randomized"|"contribution-analysis"|"qualitative"|null;
 counterfactual:string|null;evidenceStrength:"unknown"|"weak"|"mixed"|"moderate"|"strong"|null;
 uncertainty:string|null;harms:string|null;decision:"undecided"|Action|null;reviewDate:Day|null};
type OrdinaryReportingData = {title:string;kind:"board"|"funder"|"public"|"template";programId:Id|null;
 agreementId:Id|null;outcomeIds:Id[]|null;financeIds:Id[]|null;receiptIds:Id[]|null;
 assemblyMethod:"grant-report-v1"|"learning-review-v1"|null;sourceDigest:string|null;
 supersedesReportId:Id|null;revisionReason:string|null;startDate:Day|null;endDate:Day|null;
 summary:string|null;missingness:string|null;visibility:"private"|"board"|"funder"|"public"|null;
 issueDate:Day|null};
type BridgeIndicatorData = {title:string;kind:"indicator";programId:Id;indicatorId:null;
 value:null;unit:string|null;denominator:null;startDate:Day|null;endDate:Day|null;
 geography:string|null;method:"unknown";evidence:"unknown";sourceUrl:null;limitations:string};
type BridgeObservationData = {title:string;kind:"observation";programId:Id;indicatorId:Id;
 value:number|null;unit:string;denominator:number|null;startDate:Day;endDate:Day;
 geography:string|null;method:"unknown"|"administrative"|"survey"|"observation"|"experiment";
 evidence:"unknown"|"self-reported"|"source-linked";sourceUrl:string|null;limitations:string};
type BridgeOutcomeData = BridgeIndicatorData|BridgeObservationData;
type BridgeProtocolData = {title:string;kind:"protocol";programId:Id;outcomeIds:[];question:string;
 method:"unknown"|"before-after"|"comparison"|"randomized"|"contribution-analysis"|"qualitative";
 counterfactual:string;evidenceStrength:"unknown";uncertainty:string;harms:string|null;
 decision:"undecided";reviewDate:Day|null};
type BridgeDecisionData = {title:string;kind:"decision";programId:Id;outcomeIds:Id[];question:string;
 method:"unknown"|"before-after"|"comparison"|"randomized"|"contribution-analysis"|"qualitative";
 counterfactual:string;evidenceStrength:"unknown";uncertainty:string;harms:string|null;
 decision:Action;reviewDate:Day};
type BridgeEvaluationData = BridgeProtocolData|BridgeDecisionData;
type LearningManifestData = {title:string;kind:"template";programId:Id;agreementId:null;outcomeIds:Id[];
 financeIds:[];receiptIds:[];assemblyMethod:"learning-review-v1";sourceDigest:Hash|null;
 supersedesReportId:Id|null;revisionReason:string|null;startDate:Day;endDate:Day;
 summary:string;missingness:string;visibility:"private";issueDate:Day|null};
```

OrdinaryProgramData is read-only input and must be kind program, with a nonnull program selection in current scope. Its valid nullable fields, including evidence:null, remain null; they do not require an invented evidence level or reapproval just to satisfy a narrower DTO. Other ordinary kinds cannot substitute. The bridge never creates/rewrites a program. Mapping pins its exact current data; later approval-only revisions are allowed, but changed program data requires renewed mapping. Module validators remain final authority; no bridge validator relaxes them. Complete ordinary schemas retain actual nullability. A generic nullable field is not permitted in every kind/state: ordinary validateRecord applies the normal state-dependent requirements, and selected evidence additionally meets this feature's exact final-state pin policy. OrdinaryReportingData.sourceDigest remains nullable existing text (maximum 64 UTF-16 units); only the narrower learning manifest requires null or a complete lowercase Hash. The generated Bridge* and LearningManifestData outputs above are strict subtypes of the complete ordinary schemas. Future ordinary modules are not admitted by this four-module union. Run generated candidate data through existing validateRecord before preview/data hashing, show its normalized authored target values, and compare that final closed result on commit. Native retained source and the strings inside structured visible metadata blocks are never passed through a source cleaner or rewritten by this target normalization.

Target data compilation v1:

| Record | Exact policy |
| --- | --- |
| Indicator | title/program; kind indicator; indicatorId/value/denominator/sourceUrl null; unit and geography from explicit choices; planned dates or null/null; method/evidence unknown; limitations is DefinitionBlock below. |
| Protocol | title/program; kind protocol; outcomeIds []; question is IntentBlock; chosen method; counterfactual is ComparisonBlock; evidenceStrength unknown; uncertainty is FeedbackBlock; authored harms or null; decision undecided; explicitly chosen reviewDate or null. |
| Observation | title/program; kind observation; indicatorId exact approved definition ID; unit/geography copied exactly from that definition/mapping; explicit value/denominator/actual dates/method/evidence/sourceUrl; limitations is MeasurementBlock. No harm-kind record in this slice. |
| Decision | title/program; kind decision; outcomeIds exactly selected observations in declared order; question/method/counterfactual copied from exact approved protocol after explicit preview acceptance; evidenceStrength unknown; uncertainty is DecisionBlock; authored harms; chosen action/followUp. Protocol and exact input pins live in the feature event. |
| Manifest | exactly LearningManifestData; kind template/private, agreementId null, financeIds/receiptIds empty; outcomeIds exactly selected observations; sourceDigest only compiler output; no invented grant relationship or board audience. |

Visible blocks are exact prefix + existing stable JSON, no hidden approval sidecar:

```text
DefinitionBlock  = "LEARNING-DEFINITION-V1\n" + stable({source,slot,origin,unit,population,geography,plannedPeriod,limitations})
IntentBlock      = "LEARNING-INTENT-V1\n" + stable({source,question,basis:{intendedOutcome,rule}})
ComparisonBlock  = "LEARNING-COMPARISON-V1\n" + stable({source,comparison})
FeedbackBlock    = "LEARNING-FEEDBACK-V1\n" + stable({source,feedback,uncertainty})
MeasurementBlock= "LEARNING-MEASUREMENT-V1\n" + stable({definition,locator,missingReason,limitations})
DecisionBlock    = "LEARNING-DECISION-V1\n" + stable({protocol,discussedDefinitions,assessment,feedback,uncertainty,noEvidenceReason})
```

Names in each block resolve to the closed inputs above; source is SourcePin, protocol/definition are RecordPins. Blocks are knowingly authored target text, not modified native source. Show the complete actual rendered target fields in preview and ordinary approval. Refuse if any complete field exceeds its existing 4,000 UTF-16-unit bound; never shorten it. The UI can explain a refused combination and let the user write a shorter interpretation while retaining the source. Every bridge command and approval guard recompiles and compares target data exactly to its structured immutable event. No parser extracts authority from user-pasted block text.

Generic data edits to bridge-created indicators/protocols/observations/decisions are refused with an actionable Remap/Correction/New decision route and the unsaved form preserved. Ordinary owner changes, comments, workflow transitions, independent approvals and trash/restore keep existing semantics; any such revision change makes a previously selected pin stale until deliberately reselected/reapproved. No new file attachments are admitted to bridge-created records in v1. Existing program attachment metadata may appear in its approved snapshot; report output explicitly includes metadata only, not file contents.

## 5. Approval pins, repeated measurements, corrections and decisions

### Conservative, implementable snapshot policy

Select **only `record.approved` audit events**, not arbitrary carried transition approvals. `os_events.id` is a positive bigint decimal string, and its timestamp is read with exact six-digit UTC formatting. Resolve a unique event whose detail.record contains the selected snapshot and approval; validate/detach its complete ordinary record before copying snapshot/approval. Require event actor==approval.actorId, approval.revision==snapshot.revision==current record.revision, current snapshot hash/data/status/owner match, current approval hash match, same org/module/record, live undeleted current record, and exact compiled bridge data. No synthesis from a later current row and no fallback to an earlier approval. The evidence receipt records the audit-record hash and original event identity; it does not claim portable institutional authenticity.

Eligible current states: program approved or active; definition approved or included; protocol registered; observation approved or included; decision decided; manifest approved. In **each selected state**, a matching ordinary explicit approval at that final state is necessary. The existing API permits approval without changing state. Registration/inclusion/decision progression can carry approval revision without refreshing snapshots, so the UI must say “Approve this final state before selecting it,” and link the existing action. Normal transitions may first need an earlier approval; that does not remove the final-state selection requirement. This is extra selection discipline, not a change to existing workflows and not a claim of scientific preregistration before data collection.

### Measurement and correction rules

MeasurementInput pins one live mapping, approved program, registered protocol and exact definition. All belong to the same binding/mapping/program; current program data must still equal mapping's Program WorkingPin data hash. Each observation is a new ordinary draft and event. Repeated measurements never overwrite a prior period. No point is inferred from baseline/target/result/date/method prose.

Actual dates are real closed days, ordered, explicitly chosen independently of source update/review/export/receipt dates. Known zero is numeric 0. Missing is null with nonblank missingReason; nonnull value requires missingReason null. Locator may explicitly be not-collected; it never asserts a publisher did not report data. Values/denominators must be finite within existing ±1e12 range. Count means a nonnegative integer; percentage means a share in 0..100; rate means nonnegative per the approved denominator definition; amount/other permit the existing signed range. Rate/percentage require denominatorDefinition at mapping and a positive measured denominator even when value is null; other kinds may use a null denominator or a nonnegative declared denominator. These quantity rules are checked structurally even if a custom unit spelling would bypass generic percent/rate detection. Source-linked requires the existing valid HTTPS sourceUrl. `independently-reviewed` is not offered by this bridge; ordinary account approval does not establish independently reviewed empirical evidence. Unknown method/evidence is an explicit choice, not a successful inferred collection.

An overlapping/same-period observation is allowed only after preview explicitly shows existing same-definition periods and the user acknowledges it; it is a distinct submitted point, never automatically a total or average. The acknowledgement is represented by the exact preview review hash and commit, not an untracked UI boolean. The private report lists all selected points separately. There is no claim that points form a complete population/time series.

### Correction lifecycle, abandonment and effective replacement

#### Chosen policy

A correction draft **reserves an attempt but does not replace its prior point**. Only an explicit apply command against a current ordinarily approved candidate establishes an effective replacement edge. Abandonment is an immutable terminal disposition of one attempt, freeing its pending reservation. A candidate that was abandoned can never regain that claim through generic approval, trash restore, replay or a different command key.

Starting a correction means the original point has been questioned. After that, do not silently report the original while a correction is pending or abandoned. The original remains an effective graph leaf until apply, but is withheld from report selection while its concern is unresolved. Abandoning a wrong candidate does not assert that the old point is correct. Staff can reclaim the same effective leaf with a fresh candidate, without approving the wrong candidate or the questioned original. A deliberately missing replacement (`value:null` with known unit/actual period and explicit missingReason) is valid input if that is what the authorized people can support; no numeric value is invented to unblock the workflow.

There is no v1 “withdraw concern and revive the old value” action. That would need another deliberate review contract; it is unnecessary for the requested error/reclaim path. A report may explicitly omit an unresolved period with missingness, but cannot count it as zero or quietly fall back to the questioned old value.

#### Computed state and invariants

Each correction attempt is identified by its `corrected` creation event SHA-256 and candidate record ID. Its state is exactly pending, abandoned or applied, computed by a bounded fold of immutable binding events under the existing organization writer lock. No mutable sidecar can overwrite its disposition.

| State/action | Consequence |
| --- | --- |
| Initial ordinary observation, no correction | Selectable only with the original current approved-pin rules. |
| Commit corrected draft | Creates candidate + pending attempt; reserves its replaced effective leaf; original becomes questioned/unselectable. No effective replacement edge yet. |
| Approve pending candidate | Existing separate-account approval of its exact final-state bytes. Still no effective edge until apply. |
| Apply approved candidate | Atomically appends applied event/evidence/receipt/audit; establishes replaced→replacement edge and resolves that concern. Old point is historical ancestry. |
| Abandon pending attempt | Appends terminal abandonment; releases pending reservation; old point stays questioned; candidate cannot be applied/selected. Fresh correction of the same effective leaf is allowed. |
| Trash pending candidate | Generic DELETE refuses with “Abandon this correction attempt before putting its draft in trash.” If the row is already unavailable/trashed through a fault, abandonment still works from the retained attempt identity. |
| Trash abandoned candidate | Ordinary authorized trash semantics apply. It never alters the immutable abandonment. |
| Restore abandoned candidate | Ordinary restoration may recover its bytes as inactive candidate material, but cannot reopen the attempt. Approval/apply/learning selection refuses with an actionable fresh-correction route. |
| Trash/restore an applied replacement | Where existing ordinary reference/role guards permit the action, it does not remove the effective edge or revive its ancestor. If its current live approval is unavailable it cannot be selected. A fresh correction may replace that effective leaf using retained approved proof as described below. |

At most one **pending** attempt exists per effective leaf, and at most one **applied** outgoing edge ever exists per point. Any number of sequential abandoned attempts is allowed within existing 200-measurement/1,000-history-row/global budgets; abandoned drafts consume those budgets and remain exportable evidence. There is no unlimited retry reserve and no hidden deletion at capacity.

An effective edge is permanent provenance. No current `deleted_at`, approval reset, state transition or restored draft can cause it to disappear or make an ancestor a selectable leaf again. Same record label, period or local ID is never a relinking rule. Source/mapping/unit/population compatibility and the existing quantity/period validation still apply.

#### Exact apply/abandon rules

CorrectionInput, CorrectionApplyInput, CorrectionAbandonInput and all lifecycle event members are the closed DTOs in section 3. `corrected` means pending attempt creation, not an applied replacement.

Reason is nonblank, maximum 2,000 UTF-16 units. `replacement` resolves the pending attempt's exact candidate ID, compiled data and final-state approved proof. Apply rechecks its ordinary approval at approved/included, exact current revision/snapshot/approval, same live mapping, source/protocol/definition pins, current session/member/scope/restore epoch and effective replaced leaf. It does not write new empirical bytes, grant an approval or change ordinary record data/status. The record's independent reviewer remains the normal OS reviewer; an authorized writer may then submit apply.

For **correction creation only**, `replaces` may be the retained exact approved proof for the effective leaf even when the leaf is now trashed/restored/unapproved. That proof must already be in immutable learning evidence from the original question/attempt or prior applied edge. Resolve same record ID, same mapping/program and exact compiled data; if a current row exists its data must match that historical proof. This grants permission to correct a historical point, never permission to select its old value or call its current revision approved. A first correction of a never-approved ordinary draft is not admitted; staff can trash that draft and enter a fresh ordinary point. A missing row cannot be silently matched by name.

If a protocol/definition has been reapproved, a fresh candidate may explicitly use the current pins under this contract's compatible same-definition/data-hash rules. The old and new proof remain in ancestry. Apply does not silently restamp an earlier candidate whose embedded pins became stale; abandon that attempt and create a fresh compatible one. A changed definition/protocol data version still needs remapping.

The closed `corrections/apply/preview` and `corrections/abandon/preview` routes, request bounds, ChangePreview/Receipt operation enums and CommitResult outcomes are listed in sections 3 and 6. No additional table is needed. Candidate arrays are empty for these plans; apply retains replacement evidence and returns its current WorkingPin, abandonment returns records:[]; neither returns a report. Both use existing `POST commit` and the exact durable Retry receipt discipline. Unknown-result Retry returns the accepted terminal result even after a new attempt/head exists, subject to current authority; it does not reapply, reabandon or create another candidate.

The displayed plan fixes IDs/event bytes as before. Abandonment does not automatically trash, unapprove or edit its candidate. The UI offers the ordinary explicit trash action afterward; it preserves forms and links to the retained attempt. Apply/abandon cannot be combined with an unreviewed arbitrary replacement body.

#### Generic guards, indexes and concurrency

Ordinary candidate approval must check pending/applied/abandoned disposition after the tenant lock, not merely compiled bytes. A pending candidate may be approved only while its attempt is still pending and still reserves the same effective leaf. An abandoned candidate cannot be approved, applied, selected or regain a reservation. An applied leaf may follow existing ordinary reapproval rules, but earlier replacement edges never vanish. Generic data/method/file protections remain unchanged.

DELETE and restore SQL paths bypass `saveRecord`; add their explicit learning guards alongside the existing participation/recurrence guards at `handler.mjs:1366..1392` and `:1154..1192`. The shared save/approve guard is still required. Generic restore resets approval/snapshot as today; it never appends an apply event. Full backup restore marks all imported lifecycle events recovered and does not revive any active attempt; adoption still creates fresh definitions/protocols, not old measured candidates.

There is no unconditional one-claim-ever-per-leaf constraint. Required partial indexes on `os_learning_history` (whose payload is the outer LearningEvent) are:

```sql
-- At most one terminal disposition for one attempt.
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_correction_terminal
ON os_learning_history (org_id, origin_org_id, binding_id,
                       (payload #>> '{payload,correctionEventSha256}'))
WHERE row_kind='event'
  AND payload #>> '{payload,kind}' IN ('correction-applied','correction-abandoned');

-- At most one effective outgoing replacement edge for one point.
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_correction_edge
ON os_learning_history (org_id, origin_org_id, binding_id,
                       (payload #>> '{payload,replaces,recordId}'))
WHERE row_kind='event' AND payload #>> '{payload,kind}'='correction-applied';
```

These supplement the existing sequence/head/command constraints. The one-current-pending reservation is enforced by the validated lifecycle fold under the organization writer lock; immutable rows cannot have a SQL partial index conditioned on a later abandonment. Full backup admission runs the same chronological fold and refuses duplicate concurrent pending claims, two terminals, forks/cycles, apply-before-create, wrong candidate/leaf or applying an abandoned attempt. Recovered history uses original event provenance in these checks but creates no active reservation.

Approval versus abandonment/apply races serialize under that lock. If approval wins first, abandonment may still terminally discard the approved-but-unapplied attempt, without rewriting its approval; future apply refuses. If abandonment wins, approval refuses before any record/audit write. If apply wins, abandonment refuses; correcting a subsequently wrong applied value requires a new attempt against the current effective leaf. A retried already accepted command is reconciled before head/preview checks as before.

#### Report and closure changes

Selection requires an applied effective leaf, or an uncorrected ordinary approved point with no unresolved concern. Pending/abandoned candidates are never selected. A questioned original cannot be selected merely because its sole candidate was abandoned/trashed. The report may still select other points or zero points with explicit missingness.

Exclusion.reason includes `pending-correction`, `abandoned-correction` and `unresolved-correction`. An unavailable applied leaf uses the existing deleted/unapproved reason without returning to its ancestor. Report proof closure includes the required correction create/apply/abandon events for a selected chain and reservation resolution, with abandoned candidate values explicitly labelled unselected/unapproved as applicable. They are provenance, not additional outcomeIds or measurements counted in the selected result. Existing 100 selected points/600 proof-evidence/64 boundary/4 MiB report bounds remain. A lifecycle proof that does not fit refuses without truncation. Current ordinary privacy and selected-report boundary disclosures remain intact.


### Decision rules

Select 0..100 exact approved current leaf observations from one mapping, with definitions/protocol exact and current. DecisionInput.observations equals their exact declared RecordPin order; the compiled ordinary decision outcomeIds equals those record IDs in that order. If empty, nonblank noEvidenceReason is required and report missingness must visibly say no observations were selected; this proves no measured effect. If nonempty, noEvidenceReason is null. No claim is made about collection elsewhere.

DecisionInput.discussedDefinitions is required: 1..10 exact eligible approved indicator RecordPins from the same mapping/program, no duplicates, in ascending indicator mapping-slot order. With observations nonempty, it equals the unique exact definition pins from their immutable measurement inputs in that slot order; the service derives/previews that set and requires exact submitted equality. With observations empty, the user explicitly selects one to ten definitions to discuss and the normal separate-account reviewer approves their full DecisionBlock pins. SelectionInput.definitions must equal the approved decision event/block's discussedDefinitions exactly in both cases, including hashes/revisions/approval events/order. Never infer discussion authority from prose or labels. A definition approval or discussion change requires a new decision and fresh prepare/save/manifest approval. Known measured zero remains a selected numeric-zero observation, not a zero-observation decision.

The decision shows original source stopRule/rule, adopted/adapted basis, planned actions, selected evidence and authored assessment together. With adopted/adapted rule, assessment is met/not-met/unassessable; not-adopted is allowed only for a mapping explicitly not-adopted. Uncollected rule must be unassessable. Explanation is always required. Expected action is derived only from the user-authored whenMet/whenNotMet mapping and declared assessment, never parsed source prose. When a nonnull expected action differs from chosen action, require departureReason; otherwise departureReason is null. Unknown expected action is visibly unassessable, not silently consistent. FeedbackAssessment is a separately authored aggregate statement with unknown/not-collected valid; it is not inferred community consent or a measured response count. All assessment/feedback/action/uncertainty/harms/follow-up bytes are in the ordinary approved DecisionBlock/fields and the report. No rule assessment produces a causal verdict.

## 6. Requests, previews, exact Retry and durable storage

### Routes and closed wire envelopes

New routes are under `/api/orgs/:org/learning`. Reject unknown/duplicate query parameters and wrong methods. GET query supports only the specifically documented cursor; never put source prose, filenames, tokens or native data in URLs. Errors use the actual existing `{ok:false,code,message}` wire shape, with optional existing `issues:[{field,message}]` for field errors, without source values. All responses use no-store/nosniff; JSON downloads have an attachment filename chosen by the service.

| Route | Exact request / response payload inside existing ok envelope |
| --- | --- |
| POST `source/inspect` | multipart exactly `metadata` JSON and `native` bytes. Metadata `{version:1,adapter,selection,target:{kind:"new",program:WorkingPin}|{kind:"refresh",program:WorkingPin,head:HeadPin}}`. Response `{inspectionId,expiresAt,source:SourceCapture,retainedScope:"whole-toc-export"|"context-and-one-learning-row",existingSource:SourcePin|null}`. |
| POST `mapping/preview` | MapProposal. Response ChangePreview. |
| POST `measurements/preview` | `{kind:"measurement",input:MeasurementInput}` or `{kind:"correction",input:CorrectionInput}`. Response ChangePreview. |
| POST `corrections/apply/preview` | CorrectionApplyInput; 128 KiB complete bytes. Response ChangePreview. |
| POST `corrections/abandon/preview` | CorrectionAbandonInput; 128 KiB complete bytes. Response ChangePreview. |
| POST `decisions/preview` | DecisionInput. Response ChangePreview. |
| POST `reports/prepare` | `{selection:SelectionInput,manifestRevision:number}`; current manifest data admitted as LearningManifestData. Response `{sourceDigest,selectionSha256,manifest:WorkingPin,requiresSave:boolean,requiresApproval:boolean,exclusions:Exclusion[]}`. No lasting event/selection write. |
| POST `reports/preview` | FinalSelection. Response FreezePreview. |
| POST `commit` | CommitInput only, all operation/plan/source content read from stored preview. Response CommitResponse. |
| GET `bindings` | cursor only; response `{bindings:BindingSummary[],nextCursor:string|null}`. |
| GET `bindings/:id` | cursor only; response `{binding:BindingSummary,events:LearningEvent[],nextCursor:string|null}`. |
| GET `reports` | cursor only; response `{reports:ReportSummary[],nextCursor:string|null}`. |
| GET `reports/:id` | `{report:LearningReport}` after private reader admission/authorization. |
| GET `reports/:id/export` | exactly LearningReport JSON; selected report, not restore input. |
| GET `recovered` and `recovered/:headHash` | administrator-only; paged summaries or strict historical closure, all recovered-only; never a live report route. |

```ts
type Candidate =
 {id:Id;moduleId:"outcomes";data:BridgeOutcomeData;status:"draft";ownerId:Id;revision:1}|
 {id:Id;moduleId:"evaluation";data:BridgeEvaluationData;status:"draft";ownerId:Id;revision:1};
type ChangePreview = {previewId:Id;operation:ChangeOperation;
 reviewSha256:Hash;expiresAt:Instant;plan:{source:SourceCapture|null;event:LearningEvent;
 candidates:Candidate[];approvedEvidence:ApprovedEvidence[];samePeriodRecordIds:Id[]}};
type FreezePreview = {previewId:Id;operation:"freeze";reviewSha256:Hash;expiresAt:Instant;
 report:LearningReport;frozenManifest:WorkingPin};
type BindingSummary = {bindingId:Id;originOrgId:Id;programId:Id;head:HeadPin;
 originMode:"live"|"recovered";source:SourcePin;mappingNumber:number;
 disposition:"bound"|"needs-review"|"trash"|"historical-only"};
type ReportSummary = {id:Id;title:string;checksum:Hash;createdAt:Instant;programId:Id;
                     sourceDigest:Hash;supersedesReportId:Id|null};
```

Operation correspondence is closed; preview kind, stored plan/event, receipt.operation and CommitResult.outcome must match this table exactly. Never select an operation from user-pasted event fields:

| Operation | Event payload.kind | Result outcome | Candidate records |
| --- | --- | --- | --- |
| map | mapped | mapped | freshly generated indicator/protocol drafts |
| adopt | adopted | adopted | freshly generated indicator/protocol drafts |
| measure | measured | measured | one new observation draft |
| correct | corrected | corrected | one new pending correction observation draft |
| apply-correction | correction-applied | correction-applied | [] (result.records is the replacement's current WorkingPin) |
| abandon-correction | correction-abandoned | correction-abandoned | [] (result.records is []) |
| decide | decided | decided | one new decision draft |
| freeze | report-frozen | frozen | [] (result.records includes the frozen manifest WorkingPin) |

Apply/abandon produce report:null and use the exact source/mapping/protocol/definition/event pins already validated in their attempt. Any earlier no-source placeholder in a preview cannot omit required immutable proof. A report freeze's selected report omits its new report-frozen event to avoid a checksum cycle; the fixed commit plan still specifies that event and its receipt before acceptance.

Freeze preview fixes report ID, server createdAt and event timestamp before showing its exact bytes. Commit must reproduce the same output without rebasing. ChangePreview.event similarly has fixed IDs/time; preview is a proposal, not a claim the event has been committed. For these new DTOs, report.createdAt and event.recordedAt mean the server time the immutable candidate bytes were assembled; label them “Prepared” in the UI. Actual transaction acceptance time is Receipt.acceptedAt and table/audit created_at, never represented by that earlier candidate time. A server deadline does not authorize proceeding without user submission. Preview completeness includes same-period warning, source/target text and existing ordinary-module reader visibility; commit's exact review hash acknowledges that displayed plan. List cursors are server-encoded, strictly decoded closed `{version:1,lastId:Id,headSha256:Hash|null}` with max 2,048 bytes and page size 20; any head mismatch refuses rather than silently skipping history. Binding-history pages instead use a separately closed `{version:1,bindingId:Id,head:HeadPin,beforeSequence:number}` cursor, with the same byte/page bounds and current-head equality. Summaries never expose raw native prose.

### Request integration and current authority

Insert `learningRoutes` in handler after real `auth.api.getSession` and mutation `checkCsrf`, alongside directory dispatch **before the generic JSON body reader** (`handler.mjs:310..350`). This is necessary for the bounded multipart route and feature-specific JSON limits. Check verified email and existing same-origin/CSRF rules. Rate limits: 120 reads/hour, 60 ordinary feature writes/hour, 6 native inspection uploads/15 minutes per authenticated actor. Browser aborts a superseded upload; server enforces byte/decode/deadline limits regardless of abort. No distributed one-upload semaphore is promised.

Inside `db.tx(user,org,...,{lock:true})`, reread the real unexpired Better Auth session `FOR SHARE` after the tenant writer lock, membership including exact UTC microsecond created_at, current role/programIds/revision, source/record heads, restore epoch and quotas. No request-cached membership is write authority. Require read on programs/outcomes/evaluation/reporting for feature read; write on each target module for commands and on reporting for freeze. Staff roles are owner/admin/program_lead/grants_lead/finance_reviewer/contributor, intersected with existing permissions. Board_reader/external_reviewer and unsigned users are denied **every** feature route. Reports prepare/preview/freeze/read/export/print additionally require current read and export on all four source modules and current scope; contributors do not acquire export. Source inspection/mapping and historical source reads require current write on outcomes/evaluation plus program read/scope. Recovered reads/adoption additionally require administrator; adoption still checks target write permissions. This conservative v1 feature policy is intentionally narrower than ordinary module read.

Every binding has one explicit immutable program ID. Current member program scope is checked against that ID and every included record/pin on every read/write/export, including historical reports. Full OS backup remains administrator-only. Raw source never goes into ordinary source/URL columns, generic report summaries, logs or participant endpoints. Complete consciously authored target blocks remain visible through existing board/external approved-snapshot APIs (`access.mjs:19..36`); show that fact before approving. Private feature endpoints cannot claim to hide those ordinary record bytes.

### Durable exact Retry

Do not blindly copy directory's current proof helper: it enforces expiry before accepted-command lookup. Learning must reconcile an already accepted request before preview expiry/head validation, after current authentication/permission checks. A stored preview ID plus exact review hash is the request binding; previews can be deleted after commit without losing the receipt.

```ts
type Receipt = {version:1;operation:Operation;
 commandHash:Hash;requestHash:Hash;actorBindingHash:Hash;actorId:Id;
 sessionSha256:Hash;membershipSha256:Hash;memberCreatedAtExact:DbInstant;
 restoreEpochSha256:Hash;previewId:Id;reviewSha256:Hash;acceptedAt:Instant;result:CommitResult};
type RestoreEpoch = {root:HeadPin;records:{recordId:Id;lastRestoredAuditId:AuditId|null}[]};
```

commandHash hashes `{orgId,actorId,memberCreatedAtExact,commandKey}`. requestHash hashes the exact `{previewId,reviewSha256}` plus route/method/operation from the stored accepted receipt or current preview; commandKey itself is not retained. membershipSha256 hashes `{userId,role,sortedProgramIds,revision,createdAtExact}`; sessionSha256 hashes `{sessionId}`; actorBindingHash hashes `{actorId,sessionSha256,memberCreatedAtExact}`. restoreEpochSha256 hashes RestoreEpoch. Its root is the binding's sequence-1 live HeadPin (the fixed proposed root for a new/adopt command); records are the program plus every current target/source ordinary record used by that command, deduplicated and sorted by recordId. Each lastRestoredAuditId is exactly `SELECT max(id)::text ... WHERE org_id=$1 AND record_id=$2 AND action='record.restored'`, or null, matching the existing directory helper. Import commit already creates record.restored events for imported ordinary rows. The list of epoch record IDs is recovered from the immutable event/receipt result plus its typed input pins, never recomputed from a later enlarged binding; head advances do not change an old command's epoch. A live root is never overwritten by restore: full restore marks old history recovered; adoption creates a new root. Missing/deleted rows still have a queryable epoch and do not become names to relink. No head hash after sequence1 belongs in the epoch.

Commit order: strict CommitInput → current auth/role/scope → commandHash lookup → if accepted, compare exact request/actor binding/membership/restore incarnation and authorize the retained result program/records/report; return already-committed with current disposition, **without requiring the old preview/head to remain current**. If membership/session/restore incarnation changed, return a stale/authority error without new writes; do not invent a fresh command. The user can use authorized current binding/report reads to reconcile under a new session. Same key with different request refuses. Only an unknown command proceeds to current preview lookup, expiry/current-head validation, exact recompilation and atomic writes. An expired unknown preview refuses and creates nothing.

Receipt, all candidate records, selected source/evidence, event, audit and report/frozen-manifest update are one transaction. On rollback none are accepted. Retrying after network result loss, later head advance, target trash or preview expiry returns the exact retained CommitResult under current authority; it never creates another point/report. UI retains `{previewId,reviewSha256,commandKey}` in memory while disposition is unknown and exposes Retry. It cannot issue a new key as a response to uncertainty. Cross-tab/new-session reconciliation must use the binding/report reader if the original in-memory command is unavailable; no native/source state is automatically written to localStorage.

### Tables and indexes

`os_learning_history` columns are exactly `org_id,id,row_kind,origin_mode,origin_org_id,binding_id,sequence,source_version,program_id,payload,receipt,budget_bytes,created_at`. id is payload hash (source/evidence/event/report hash), row_kind is source/evidence/event/recovered-report, origin_mode live/recovered; source/evidence/event payloads are their closed DTO; recovered-report payload is LearningReport. Live reports are only in os_reports. origin_org_id is provenance, not the tenancy key. source_version exists only for source, sequence only for event, program_id exists for event/recovered-report, binding_id exists for source/event. Evidence has null binding/program/sequence/source_version because it is tenant-deduplicated by exact hash. receipt is present only for a live event and is the closed Receipt; recovered rows always have null receipt. Payload max 4 MiB, tighter per-kind limits below; receipt max 8 KiB; budget_bytes for source/evidence/event equals actual JSONB payload+receipt text bytes plus 4,096 reserve. Recovered-report uses the separate report Q accounting in section 9; do not charge it to the nonreport 16 MiB/1,000-row category.

Required constraints/indexes: PK(org_id,id); tenant FK org_id→os_orgs; ID/hash/enum/nullability/positive bounds checks; unique `(org_id,origin_org_id,binding_id,sequence)` where event; unique `(org_id,origin_org_id,binding_id,source_version)` where source; unique `(org_id,(receipt->>'commandHash'))` where receipt nonnull; index `(org_id,program_id,binding_id,sequence)` for scoped paging; unique report `(org_id,id)` remains os_reports PK and a learning-specific expression index on immutable `(org_id,manifest recordId,manifest revision,sourceDigest)` prevents another command freezing the same edition. A second key for the same edition returns conflict with the authorized existing ID; it does not append a duplicate event/receipt. The correction terminal/edge partial indexes in section 5 are also mandatory. Binding-root uniqueness is the event sequence=1 uniqueness, and program_id must match its root on every insert. Capture native ID is **not** a global unique key; explicit separate bindings are allowed and refresh must keep the same adapter/native identity. Each event payload pins prior head; application under tenant lock proves no fork/gap. Source/evidence insert dedup requires byte-equal same-hash payload, not ON CONFLICT silent replacement.

The report-edition index paths are exactly `(payload#>>'{selection,selection,manifestRecordId}')`, `(payload#>>'{selection,manifest,revision}')` and `(payload#>>'{selection,sourceDigest}')`, prefixed by org_id, partial where kind learning-review and methodVersion learning-review-v1. Its runtime admission also checks live row id/org_id/checksum match payload.id/orgId/checksum. Recovered-report rows deliberately retain original payload.orgId under destination tenant org_id and can only be read through the recovered reader. SQL constraints require column kind/origin/binding/sequence/version/program values to match their corresponding closed payload fields where present; application validation proves parent/reference/compiled-byte semantics under the tenant writer lock.

`os_learning_previews` columns exactly `org_id,id,actor_id,session_sha256,membership_sha256,restore_epoch_sha256,kind,payload,review_sha256,expires_at,created_at`. kind inspection/map/measure/correct/apply-correction/abandon-correction/decide/adopt/freeze; payload is a closed corresponding proposal/plan plus current input pins, never the whole native backup; inspection payload is the retained SourceCapture plus metadata/target. PK(org_id,id), org FK, valid hash/kind/size checks; expiry index `(expires_at)` and actor index `(org_id,actor_id,created_at)`. No committed flag. Fifteen-minute TTL; transactional count/byte quota; delete owned consumed/expired previews and never archive them or export them. Deliberate cancellation may delete only that actor's preview; lifecycle disposal merely aborts requests/removes UI, not source evidence.

Both tables require ENABLE+FORCE RLS and exact tenant USING/WITH CHECK policy. Add immutable trigger to history. `applicationGrantsSql` grants all tables broad DML then revokes UPDATE/DELETE from an explicit list: append os_learning_history to that revoke list; previews retain cleanup DML. Repeat migration must be idempotent. No cascade from a mutable record may erase history. Application has no UPDATE/DELETE authority on history even if a helper errs. All receipt bytes and PostgreSQL representation count in quota; no hidden unbudgeted command ledger.

## 7. Report digest, generic readers and state transitions

One report selects one mapping version and its source, one approved program/protocol/decision, 1..10 definitions and 0..100 observations. Definitions exactly equal the selected approved decision's discussedDefinitions, as structural RecordPins in mapping-slot order. With points they also equal the unique exact definitions from those points; with zero points they remain the user-selected, ordinarily approved discussion pins. All direct selected pins resolve inside the current tenant feature history/audit store, with current authorization and exact eligible state checks. Only applied effective correction leaves or uncorrected points without unresolved concern, no pending/abandoned candidates or questioned originals, no deleted/inaccessible points, no mixed program/mapping, no inferred range coverage or proration. Report period contains each selected actual period. Decision observation order exactly equals report observation order. Source update/export/receipt dates remain separately labelled from actual measurement periods and follow-up dates.

Distinguish direct selection from proof ancestry. The closure starts with the selected source, mapping event, selected observation-origin events, every required correction create/apply/abandon lifecycle event resolving the selected effective chains and their reservations, recursively replaced-observation origin events, and the selected decision event. Pending/abandoned candidates are explicit unselected provenance, never extra outcomeIds; a questioned original cannot reappear as evidence by being an effective graph leaf alone. Copy every exact ApprovedEvidence referenced by those typed payloads as well as the direct FinalSelection pins. Historical correction ancestors/measurement-time approval proofs need not still be current/live/eligible: they are read only from already retained immutable evidence and grant no selection or authority. Current scope and same mapping/program provenance still apply. Include only these required events/evidence, deduplicated by exact hash; do not silently include unrelated points or another report. Every omitted event/source parent pin is an explicit Boundary; if the complete closure exceeds a count/byte/boundary limit, refuse and explain the bounded selection requirement. A prior report relation is the explicit supersedes ID/checksum boundary; the prior full report is not nested. Full backup resolves that predecessor report internally.

V1 deliberately requires each selected point's measurement-time protocol/definition RecordPins to equal the direct selected protocol/definition pins; a later approval does not silently retarget old measurements. If those records are reapproved after points were entered, old points become unselectable under this conservative policy until a new explicit compatible correction is recorded against the current pins. “Same definition” for a correction means the same mapped definition record ID with exactly the same compiled data hash, not merely the same label/unit; its old and new approval pins may differ and both remain in ancestry. A protocol data change requires remapping/new definitions; a protocol approval-only change can be explicitly accepted by such corrections. This extra work is the accepted conservative first-release policy, not a hidden schema assumption.

Prepare computes selectionSha256 over SelectionInput (which contains fixed manifestRecordId but no manifest revision). sourceDigest hashes `{methodVersion,selectionSha256,sourceCaptureHashes,approvedEvidenceHashesExceptManifest,manifestDataWithoutSourceDigest}`. LearningManifestDataWithoutSourceDigest includes all fields including supersedes/reason, title, dates, summary, missingness and exact ordered outcomeIds; it omits only sourceDigest. It does not contain current manifest revision/status/approval. Thus saving that exact digest and ordinary approval do not invalidate the digest; every meaningful source/approval/value/unit/denominator/period/selection/narrative change does. Prepare never mutates history/manifest/approvals. User deliberately saves the digest through the existing record update path and obtains ordinary separate-account approval at final approved state. If the save changes data, existing approval resets as usual. A current approved manifest pin is then required by FinalSelection.

Final preview/freeze resolves pins from immutable approval events, exact selected source/mapping/evidence/event closure, exclusions from all up to 200 authorized binding measurements, prior report checksum and all current heads. Omission reasons are explicit; missing/unselected points are not zero. Include complete primary source, adopted basis, all approved evidence, relevant mapping/measurement/correction/decision events and ancestor boundary pins. The report declares a selected partial history, not full native reconstruction/full workspace backup. Source parent/event ancestors outside that closure are explicit boundaries (max 64). Avoid cycles: report refers to the **pre-freeze** head; the new report-frozen event pins the final report checksum. Neither report nor its checksum contains the new freeze event or the receipt. Manifest pin is its pre-freeze approved snapshot; the post-freeze WorkingPin is recorded only in the new event/receipt.

Successful commit performs a service-owned ordinary-equivalent Reporting transition approved→frozen: `validateTransition` and `validateRecord` under current permissions/current approval, revision+1, carried approval revision, exact new status snapshot with approved file metadata, save, mandatory `record.transitioned` audit. This transition occurs only atomically with os_reports insert + learning event/receipt. Generic attempts to frozen/issued for assemblyMethod learning-review-v1 always refuse; issued is not supported in v1. Freeze cannot be called against a restored/inactive or already frozen manifest. Frozen learning manifests cannot be generically edited, have assemblyMethod cleared/switched or be “re-frozen”; a new edition uses a new manifest ID with exact prior report checksum and nonblank reason, same program. V1 leaves the earlier manifest frozen: it does not invent a frozen→superseded edge around the existing intervening issued state. Supersession is the immutable new report's prior-ID/checksum relationship, not an automatic old-record transition. Review UI clearly distinguishes an approved manifest from an existing immutable frozen report.

All report consumers must discriminate a learning family marker **before** touching legacy `.modules`, granting grant-specific authority or interpreting checksums. Recognize kind learning-review **or** a methodVersion string beginning `learning-` as the learning family, even with malformed/unsupported format/version; strict supported version dispatches to learning reader, unsupported/tampered versions fail closed/are omitted with an actionable private error, never fall back. Only a validated known legacy modules-array payload reaches `.modules`; an unrecognized malformed payload is unavailable, not a runtime property error. Preserve existing grant-specific dispatch/reader authority. Implement in:

- handler generic GET `/reports` list (`:1007`), GET `/reports/:id` (`:1091`) and any report download path; either route valid learning entries through the private feature reader or consistently exclude them from the legacy list and show them only in Learning. Choose the latter for v1; generic detail still routes through strict private reader to preserve safe bookmarked IDs.
- generic POST `/reports` (`:1023`): remains whole-module snapshot output with its existing format; it cannot accept/assign a learning assembly marker or advance a learning manifest. A legacy snapshot may contain ordinary approved learning records under its established permissions, never raw capture/feature report payload.
- generic create/update/transition/restore/file paths: guard bridge-created record data, learning manifest assembly invariants, frozen manifest edits and service-only freeze. No alternate PATCH/status, method-clear/switch, upload or restored-row path may bypass compiler semantics.
- `backup.mjs`, handler full export/import/preview/commit, learning backup validator/store and private report read/export/print; client `api.js`, `app.js` reports workspace, new learning workspace, safe renderer and disposal.

Put the record ownership/compiled-data guard in the shared `saveRecord` boundary alongside existing participation/recurrence guards, as well as actionable handler-level checks. Derive ownership only from validated committed learning events, never pasted metadata prefixes. Internal feature commit/freeze/restore capabilities are server-only non-HTTP options with exact operations, not a caller-supplied bypass boolean. Initial feature creation and clean restore need their explicit validated paths; generic writes cannot adopt/rebind a source. The service-owned frozen transition must satisfy both the shared write guard and its ordinary workflow invariants.

Report read/export/print rechecks current staff role, source-module read+export and program scope; stored creator/approver/pasted pins never grant access. Escaped text nodes only, validated HTTPS links with safe target/rel, no innerHTML/raw source script execution. Print uses precisely the authorized stored report in a temporary owned print surface removed on completion/cancel/dispose. No source prose/actor tokens in HTML metadata. Scope loss blocks later reads but cannot recall a prior download.

## 8. Full backup, one report copy and inactive adoption

Add optional closed `learningBridge` to the existing full v1 backup, with exact shape:

```ts
type LearningBackup = {format:"charitology-learning-backup";version:1;
 method:"learning-review-v1";sources:SourceCapture[];approvedEvidence:ApprovedEvidence[];
 events:LearningEvent[];reports:LearningReport[]};
```

Arrays have deterministic order: sources by originOrgId/bindingId/sourceVersion; evidence by sha256; events by originOrgId/bindingId/sequence; reports by createdAt/id. Include live and recovered provenance with original payload bytes/identities; origin disposition is assigned by destination restore, not trusted from backup. No receipts, preview rows, session/member hashes or tokens are exported. The combined report category and recovery-sized source/destination accounting in section 9 are checked identically at export, backup admission and restore. Complete full-backup parent chains and pin/evidence closure must resolve internally; reject duplicates, forks, gaps, unknown versions, orphan sources/evidence, conflicting same hashes, wrong native selected schemas, broken correction lifecycle links (including pending reservations, terminal dispositions and permanent applied edges) and learning reports copied into both inventories. Fold each complete original event chain to validate chronology/attempt state before classifying recovered history; it creates no active destination reservation. A selected standalone LearningReport is not accepted as full restore input.

**One canonical report copy:** handler full export's top-level `reports` query excludes the entire learning family; learningBridge.reports is the sole full-backup copy of learning reports, including recovered ones. Legacy top-level report envelopes stay their current snake_case DB shape (`id,org_id,created_by,title,checksum,payload,created_at`), not invented camelCase rows. Admission explicitly refuses any learning-family payload in top-level reports or duplicate report ID/checksum across inventories; it does not deduplicate silently. Learning reports include their selected evidence closure; global feature history is separately retained and charged. That intended evidence redundancy is not a second report inventory. Quota counts both actual copies wherever physically stored/serialized.

Add `exportLearningBridge`, `restoredLearningBridge` and `restoreLearningBridge` to full makeBackup/validateBackup/preview summary/commit, after strict whole-backup JSON/checksum admission and before any durable write. All destination record IDs/modules/data references must be cross-validated against the existing source backup records/trash without treating their reset revisions as historical approval pins. Empty-destination import guard must include both new tables and learning reports; a partially initialized workspace is not empty. Existing direct/chunked full-backup path and 64 MiB JSON ceiling remain. Existing committed full-backup source archive intentionally retains the complete received backup under its separate 128 MiB archive budget; that does not authorize a duplicate current report inventory or revive authority.

Restore creates ordinary initial-state records exactly as today and inserts every feature source/evidence/event/report into history as origin_mode recovered, receipt null. Do not insert recovered learning reports into active os_reports. Do not resurrect approvals, membership, session, consent, source connection or native statuses. Existing top-level old reports continue existing archive-only behavior. Administrator recovered reader validates original checksums, labels historical source material and uses no live report/private-print authority. All current feature actions reject recovered heads until deliberate adoption.

Adoption v1 is intentionally precise: the admin selects one recovered head/source capture, chooses a currently present explicit program, reviews/re-enters the full MappingInput and previews creation of a **new live binding plus fresh draft indicator/protocol IDs**. It does not reauthorize/reuse the old restored definition/observation/decision IDs or rewrite original pins to destination org. New adopted root event has destination originOrgId, sequence1, previous null, payload.recoveredHead/source preserving original provenance, and new program/mapping/records. It can refer to the already retained old SourcePin without fabricating a new uploaded-file receipt/receivedAt/hash. UI says “Adopted from a restored selected source; original whole file was not received by this import action.” Old recovered chains/reports remain unchanged and addressable in recovered view. Subsequent fresh measurement/decision/report work requires ordinary new separate-account approvals and current source/definition/protocol pins. Old restored observation values cannot silently become live; a future explicit measured-evidence adoption is outside v1. A fresh native file can later refresh the new binding; it must match the source adapter/native identity and starts its new binding's sourceVersion1, with explicit historical source ancestry retained by the adopted root.

## 9. Finite joint bounds and quota behavior

Existing 2,000 active-record, 16 MiB structured-record, 60 MiB logical workspace and 64 MiB full JSON limits win. Every maximum is independent; no promise that all maxima coexist. No raising existing limits or field inventory to make the feature fit.

| Item | Maximum |
| --- | ---: |
| ToC / Nonprofit original upload | 1,000,000 / 8,000,000 bytes |
| Multipart metadata / overhead / complete request | 8,192 / 16,384 / adapter native limit + 24,576 bytes |
| Native parser deadline / depth / nodes | 30 sec / 32 / 200,000 |
| Retained selected source / SourceCapture | 1 MiB / 1,056,768 bytes |
| Mapping/measurement/decision JSON request | 128 KiB (strict complete bytes) |
| Commit / report selection request | 4 KiB / 128 KiB |
| Bindings / source versions / mapping versions | 20 / 8 per binding / 8 per binding |
| Indicators per mapping / feature-created active records | 10 / 500 per organization |
| Measurements including abandoned correction candidates / decisions / learning reports | 200 per organization / 20 per binding / 20 combined live+recovered per organization |
| Selected observations / definitions / direct approved pins per report | 100 / 10 / 114 (program+protocol+decision+manifest+10+100) |
| Complete approved-evidence proof closure per report | 600, including correction ancestors and earlier measurement-time approvals; never additional outcomeIds |
| Source captures / boundaries per selected report | 1 primary / 64 |
| Nonreport source/evidence/event history rows | 1,000 combined live+recovered; 600 evidence rows maximum; recovered-report excluded |
| Evidence / event payload | 256 KiB / 128 KiB |
| Nonreport history payload+receipts+row reserve | 16 MiB combined live+recovered |
| Learning reports live+recovered | 20 combined; canonical and actual JSONB payload each <=4 MiB; report Q charges share the existing 60 MiB global budget |
| Feature previews / one preview / all feature preview bytes | 4 per org / 4 MiB / 16 MiB |
| Preview TTL / receipt | 15 min / 8 KiB |
| One complete report / export wrapper | 4 MiB / 8 KiB extra maximum |
| List page / cursor | 20 / 2,048 bytes |
| Authored title / unit / population / basis text | 180 / 240 / 700 / 700 UTF-16 units |
| Authored question / source locator / reason | 500 / 512 / 2,000 units |
| Authored narrative input / complete ordinary area output | 4,000 / 4,000 units; composed output limit wins |
| HTTPS URL / SourceField refs in one Basis | existing 1,200 units / 3 unique ordered refs |

The following field-level authored string bounds remove shorthand ambiguity in this table. Limits count UTF-16 code units, independently of complete UTF-8 byte limits. Titles are nonblank 1..180; Unit.text is nonblank 1..240; Unit.definition is nonblank 1..700; Unit.denominatorDefinition is null or nonblank 1..700 (required for rate/percentage); population is nonblank 1..700; geography is null or nonblank 1..240. Basis.text is null or nonblank 1..700; Basis.reason is null or nonblank 1..2,000 with its disposition requirements. Protocol.question is nonblank 1..500. Known locator.text is nonblank 1..512. Correction/abandonment/revision/author-defined reasons, missingReason, noEvidenceReason, RuleAssessment.explanation and departureReason are nonblank 1..2,000 when required, otherwise null only where their DTO permits it. FeedbackAssessment.summary is nonblank 1..4,000, including an explicit explanation for unknown/not-collected. Indicator/measurement limitations, protocol uncertainty/harms and decision uncertainty/harms are exact strings 0..4,000; existing required-field rules and composed 4,000-unit output limits still win. Manifest summary/missingness are nonblank 1..4,000. Feedback sourceUrl and measurement sourceUrl are null or existing validated HTTPS URLs <=1,200. No trimming occurs in source/structured blocks; a nonblank check does not mutate the admitted string. Native strings, ordinary evidence fields, IDs, instants and enumerations retain their separately stated native/ordinary bounds. No arbitrary unbounded string field is admitted.

All other string minima/maxima follow their explicit existing native/module schemas; feature IDs/arrays/enums are closed. Smaller inputs may fail a composed-output or global byte bound without any truncation. Pending preview bytes count toward logicalBackupBytes even though previews do not export, conservatively reserving capacity. Add both new tables to logicalBackupBytes, using GREATEST(actual PostgreSQL to_jsonb(row) bytes, budget_bytes) for history. Live and recovered learning reports count once each in their separate combined report category using the exact recovery-sized Q charge below; nonreport receipts count in nonreport history. Legacy/grant report accounting remains unchanged. Preview quota is separate from existing source archive quotas, not a rewrite of their counters.

### Source-to-destination report capacity closure

#### Chosen storage/accounting policy

Keep the two tables and the single canonical backup report inventory. `recovered-report` may remain a row_kind in the append-only history table, but it is a **separate quota category**, not a source/evidence/event history row. Source and destination use the same combined learning-report count and recovery-sized charge.

| Category | Bound at live admission, backup validation and restore |
| --- | --- |
| Nonreport history: source/evidence/event | 1,000 rows / 16 MiB charged retained representation; recovered and live nonreport rows included |
| Learning reports: live os_reports + recovered-report history | **20 combined**, each canonical output and actual PostgreSQL JSONB payload at most 4 MiB |
| Combined report charged bytes | At most 60 MiB, and within the same existing global 60 MiB workspace budget after all other categories; this is not an extra allowance |
| Whole emitted backup | Existing 64 MiB complete UTF-8 full-backup bound |

Thus 1,000 nonreport rows plus 20 live reports can restore as 1,000 nonreport rows plus 20 recovered reports. A source with recovered reports cannot additionally freeze 20 new live reports; the combined count remains 20. Nonreport history cap remains meaningful and cannot be consumed or evaded by reclassifying arbitrary objects as reports. Strict family/version/DTO/checksum validation determines the category before accounting. Unknown/tampered report family payloads never get a cheaper category.

Define for each strictly admitted learning report:

```text
C = UTF-8 byte length of stable(LearningReport)
P = actual PostgreSQL octet_length(report_payload::jsonb::text)
Q = P + 4096
```

Require both C<=4 MiB and P<=4 MiB at source freeze/import admission, before any durable acceptance. This matters because compact canonical JSON and PostgreSQL JSONB text can differ in size. The actual recovered row serialized PostgreSQL representation must be <=Q; measure/verify during isolated acceptance and after insert inside the transaction. A row that exceeds its fixed reserve is refused/rolled back; do not assume the compact byte count proves it fits.

Every live learning row in `os_reports` is charged `max(actual os_reports row bytes,Q)` in `logicalBackupBytes`, not only its smaller current row bytes. Every recovered-report row is charged `max(actual history row bytes,Q)`. Recovered receipts are null and no new report command receipt is inserted during restore. That future recovered-row reserve is paid **at source**, so relocation does not introduce an unreserved 4 KiB per report. The retained-report category sum uses the same charge. Nonreport source/evidence/event rows keep payload+receipt+4 KiB/GREATEST(actual row) accounting; dropping source receipts on restore cannot increase that charge.

Implement the learning-specific `os_reports` charge in shared logicalBackupBytes and its exact quota/projection helper. Do not add Q a second time on top of the already charged learning report row; replace that row's charge with max(actual,Q). Legacy/grant report accounting remains its current behavior. All physical rows count exactly once in overall usage. A recovered body is not also inserted into active os_reports. No second canonical report copy goes into top-level backup.reports.

Restore admission computes projected destination nonreport/report category counts and actual JSONB charges before writes, including all report rows that will become recovered. Actual final destination usage is rechecked under the transaction. Feature restore adds no per-report duplicate audit containing a report body; one bounded existing backup-restored summary plus recovered-row evidence is enough. Existing ordinary record/file/other-feature restore and source-archive budgets still apply and must be measured as part of the whole source→destination acceptance, rather than assumed away. The common export/restore projection used by feature commits must include the learning report relocation reserve and bounded existing restore-journal/row overhead; a source near the global bound must not be accepted on an unmeasured compact-body estimate.

This source/destination policy provides representational closure; it does not promise that a workspace at an append-only mutation cap has capacity for new adoption/correction events. At capacity, existing export/recovered reads remain available and new mutations refuse clearly. No immutable history is pruned to make a backup restore.

#### Required integration changes

- History usage queries explicitly filter row_kind in source/evidence/event for the 1,000-row/16 MiB category; a separate query sums live+recovered learning reports and their Q charge. Do not leave a table-wide count/sum that still applies the old combined history cap.
- Table hard payload ceiling stays compatible with the per-report **actual JSONB** bound. Nonreport tighter per-kind limits continue. Recovered-report receipt null, report org provenance, immutable triggers/RLS/ACL and single-copy export rules stay unchanged.
- `exportLearningBridge` reads both report locations once, verifies the combined count and emits one sorted reports array. `restoredLearningBridge` verifies that same combined report inventory and restores it only into the recovered-report category.
- Destination emptiness checks include recovered-report rows and both new tables as already proposed. Existing v1 backups with no learningBridge stay compatible.
- Receipt/event/history duplication cannot accidentally count one report body twice or omit its selected evidence copies from quota. Evidence already inside a report plus separately retained global evidence are intentionally distinct retained byte copies and both are charged.


Every commit preflights counts/estimated bytes, then checks actual PostgreSQL retained representation, all normal record/audit limits and the actual canonical full-backup UTF-8 serialization after inserts inside the transaction, with bounded export-envelope/audit reserve. This serializer must share export inventory selection, not emit HTTP/download/audit side effects. Reject/rollback if emitted full backup would exceed 64 MiB. Check complete report bytes before os_reports insert and again after JSONB retrieval in tests. No swallowed audit failure counts as accepted. Existing evidence/export remains usable at capacity; failed mutation preserves forms, source inspection and the exact unknown-result Retry state.

## 10. Implementation split, tests and actual acceptance

This reviewed contract is frozen for implementation. Natural finite work packages, with no provider/research work:

1. Pure source/native bundle admission, DTO/runtime validators, fixed mapping/visible-block compiler, intent/quantity/correction/rule tests and source/version pins.
2. Additive tables/RLS/ACL/indexes, feature preview/receipt store, current authority/restore epoch, immutable evidence resolver, generic write/state guards and byte/count admission.
3. Report compiler/digest/private readers/generic dispatch, single-inventory backup/recovered-only storage/adoption, actual database and compatibility checks.
4. Hosted private workspace/API wiring, native chooser/inspection/mapping, links to existing final-state approvals, repeated measurements/corrections/decision, report/Retry/print/backup journey and actual browser/output evidence.

Named existing integration points to inspect/update: `services/charity-os/lib/{handler,modules,access,database,backup,backup-json,schema,migration-grants}.mjs` (schema is `.sql`); new learning native/model/store/routes/backup modules and generated native service entry; `public/{api,app}.js`, new private learning workspace/renderer/tests; service migration/testing entry points; source static build's service-asset copy/bundle checks; full PostgreSQL access/report/backup tests and actual native source-export fixtures. Existing `grant-reports`, `directory-resource-*`, `task-recurrence-*`, `local-os-migration`, participant and delivery modules are compatibility consumers to test, not invitations to refactor them. No source native key/format change is part of a package.

Pure tests must use actual exporters and strict production codecs, not repaired stand-ins. Prove the bridge-only retained-string restriction separately from native validity: both native codecs/exporters continue to preserve accepted lone surrogate/NUL strings; selected unsupported strings refuse with the named hosted limitation, while such strings in unretained Nonprofit rows remain valid. Also test literal backslash-u text, valid surrogate pairs, source canonical hash versus replacement U+FFFD and unchanged native recovery. Required cases: both valid native outputs; all five composed collections; native strings/timestamps/array order; `source` mechanism text; baseline `"0"`; shape-only invalid source review day; source index reorder/refresh; unknown field/decoded duplicate/UTF-8/BOM/prototype/depth/node/byte +1; wrong program/format/key/status/selected ID. Prove no cleaner/ID/time generator ran. Unknown unit/actual period refuses measurement; planned-period unknown stays distinct. Run actual module validators with complete tenant reference contexts at 100/101 refs. Test each basis disposition, qualitative stopRule/rule, comparison absence, feedback frequency, planned action and departure reason through approved target bytes and final report. Reject composed field overflow without source mutation.

Actual isolated PostgreSQL acceptance must cover both tenants and all eight roles, direct no-context/foreign RLS, application-role UPDATE/DELETE refusals, migration re-run/old-row checks, verified session expiry after lock, membership revoke/recreate/incarnation/revision/program scope, contributor export denial, board/external ordinary snapshots versus feature denial. Test unique/fork/correction/report indexes, head changes, audit-ID bigint precision and exact timestamp resolution. Exercise normal protocol registered/observation included/decision decided/manifest approved transitions, final-state reapproval, snapshot replacement by later approvals, deleted/restored records and generic method-clear/frozen/issued/data/file bypasses. Freeze must atomically write its ordinary transition, report, history, receipt and audit or none.

Exact Retry tests: committed result loss, consumed/deleted/expired preview, later head advance, trash, same key/different request, parallel same-key and two-key same-edition, new session/member incarnation/restore epoch, expired unknown command, invalid receipt and failures before/after each insert. Recovered receipts never export/replay. Use real PostgreSQL JSONB and whole full-backup serialization at representative joint near-limits and each +1; duplicate reports in either inventory refuse; old v1 backups/old grant/directory/recurrence/full backup paths remain valid. Report sourceDigest must change on every meaningful source/approval/selection/period/value/unit/population/denominator/decision/narrative/correction change, survive exact digest save/approval, and have no self-hash cycle.

Additional required lifecycle/capacity/nullability/discussion acceptance:

1. **Wrong correction draft without wrong approval:** approved original → wrong pending replacement → failed generic edit/delete → deliberate abandonment → ordinary trash → new correct candidate against the same original → separate-account approval → explicit apply → report selects the applied point and excludes original/abandoned candidate. No known-wrong value receives a required approval. Repeat with a null replacement supported by an explicit missing reason.
2. **Later restore/concurrency:** restore the abandoned draft and attempt normal approval/apply/report; all refuse without reviving its claim. Race approval/abandon, apply/abandon, two pending attempts and two apply requests under real tenant locks. Verify one terminal disposition/effective edge, exact Retry after head advance/preview expiry, same key/different body refusal and rollback at every event/evidence/receipt/audit insertion. Trash/restore an applied leaf; no ancestor becomes selectable, and a fresh supported correction can replace the historical effective leaf.
3. **Correction report/backup proofs:** required lifecycle event closure, ancestor approval proofs, explicit unresolved/candidate exclusions, no aggregate substitution, no old+replacement selection, independent ordinary source/role limits. Full export/restore preserves lifecycle bytes as inactive; adoption never activates old candidate/edge authority. Each +1 cap refuses without pruning history.
4. **Capacity closure:** actual source with 10 MiB nonreport history and 8 MiB live learning reports; source at 1,000 nonreport rows plus 20 reports; mixtures of live/recovered reports summing 20; one report at compact/JSONB boundary; joint global near 60 MiB and emitted full-backup near 64 MiB. Export via the actual serializer, restore into an empty isolated real database, verify category counts/actual JSONB charges/global reserve/audit/source-archive limits and exact historical output. A source accepted by these same projections must restore without deleting immutable objects. Repeat +1 count/byte cases at source and destination and compare failure codes. Check no recovered report is charged to 16 MiB nonreport history or copied twice. Existing legacy/grant report accounting and old v1 backups remain compatible.
5. **Nullable ordinary values:** actual validateRecord programs with evidence omitted/null in approved/active; confirm bridge program admission preserves null and final-state approved pin. Probe nullable Outcome method/indicator evidence and Evaluation outcomeIds/evidenceStrength against real schemas in valid states. Generated candidates still use their prescribed exact nonnull choices/arrays; generic nulls are not repaired. Cross-module Candidate data mismatch refuses. No module inventory/field ceiling changes.
6. **Zero-observation intent chain:** explicitly choose discussed definitions, approve decision block, prepare/approve/freeze zero-point report. Tamper or reorder a pin, choose another mapping/program, change definition approval, omit discussion array or parse a fake pin from prose; all refuse. Then add a real zero observation and prove it follows the nonempty evidence path. A decision with an uncollected rule/feedback and explicit no-evidence reason retains those distinctions through JSON/private print.


Actual Chrome acceptance with isolated fictional Better Auth accounts and real isolated PostgreSQL: native source chooser for **each** adapter → full exact retained inspection → explicit intended outcome/rule/comparison/feedback and one mapping → existing normal separate-account final-state approvals → three explicit periods (0/null/nonzero) → wrong correction candidate → abandon → explicit ordinary trash → new supported correction → independent approval → apply → decision with rule/feedback assessment and a departure reason case → independent decision/manifest approval → prepare/save digest/final preview/freeze → inspect native downloaded JSON checksum/complete semantic closure/private print. Test stale two-tab input, cancelled upload, unknown network result/exact Retry after preview expiry, scope removal, both actual local keys and native exporter bytes unchanged, zero-observation decision with an explicit approved discussed-definition picker, old report bytes unchanged after refresh/new edition. Then native full-backup Save → actual chooser upload → clean restore → administrator historical-only view → explicit fresh draft adoption → fresh ordinary approval required. Request/Blob/checksum/synthetic controller alone is not native Save, actual output or actual account/DB evidence.

UI acceptance: keyboard file chooser and all forms, focus/label/error/live-state behavior, readable original/adopted/assessed text, 320/390 widths light/dark, long strings/URLs, no page overflow, print cleanup and navigation/tenant/logout/dispose abort+generation checks. Failed/stale responses cannot replace current selection or write into a disposed workspace; retain unsubmitted input and unknown-result command state. Do not leave a copied print surface/source form after scope loss or logout. Screen-reader table headers and alternative text must describe separate measurements without causal totals. Root owns Chrome until explicitly delegated.

Before release run required static/Astro/service builds, module contracts, existing full OS unit/actual PostgreSQL, grant-report, directory, recurrence, backup, participant/delivery and local recovery suites. New pure/synthetic tests are useful engineering evidence, not actual browser/native Save/source/institutional evidence. Publication needs root's release workflow after review; this private contract grants no deployment action.

## 11. Accepted first-release decisions

These are the accepted conservative first-release choices, not open user permission questions or claims of implementation:

1. **Authority and program continuity:** reports are staff-only; source-module read/export and current program scope remain necessary. Program approved/active requires an explicit final-state approval, with unchanged program data since mapping; valid evidence:null remains unknown and accepted. Protocol/definition approval-only changes after measurement require an explicit compatible new correction with current pins; do not silently retarget old measurements. Changed data requires remapping/new IDs. The bounded additional review cost is accepted for v1.
2. **Authored target visibility:** existing ordinary approved-record board/external-reader visibility remains intact and is disclosed in complete previews before approval. The private feature endpoints protect captures/reports but do not claim to hide consciously authored ordinary target blocks. Record-level cross-API privacy changes are outside this release; no hidden privacy promise or new role is introduced.
3. **Recovery and adoption:** full restore retains original source/evidence/events/report bytes inactive, including correction lifecycle evidence. Adoption creates a new live binding and fresh definition/protocol drafts, followed by new ordinary approvals. It never activates imported measured values, decisions, approvals, consent or candidate reservations. Reusing restored measurements as live values would require another explicit input/approval contract.
4. **Quantities and evidence:** percentage means 0..100 share, rate is nonnegative with a stated denominator definition, and signed change uses explicitly defined other/amount. Numeric zero, null missing value, no selected observations and uncollected source fields stay distinct. No empirical independently-reviewed label, causal calculation, aggregation, automatic threshold or scientific-registration claim is created.
5. **Correction lifecycle and discussion:** correction creation only reserves/question-marks; approval alone does not replace; explicit apply makes the permanent edge. Deliberate abandonment frees a pending reservation without reviving a questioned value. A wrong candidate need never be approved. Every decision carries exact discussedDefinitions pins, including zero-observation decisions, and reports match them exactly.
6. **Finite persistence:** two additive tables, append-only immutable history, accepted receipts before expiry/head lookup, one canonical full-backup report inventory, separate but jointly charged live/recovered report category and reserved destination representation. No immutable history pruning or additional global quota is introduced.
7. **Report workflow:** service-only approved→frozen manifest transition; no issued state in v1, generic bypass or automatic superseded transition. New immutable edition requires a new manifest and exact prior-report checksum/reason. Existing legacy/grant/report/native formats stay compatible.
8. **String transport:** original native codecs are unchanged. Hosted retained strings explicitly exclude NUL/unpaired UTF-16 because direct JSONB storage cannot preserve them; unselected native rows are not unnecessarily restricted. All admitted strings/array order/date literals remain exact; no repair or truncation is hidden. A broader native-string representation requires a separately reviewed version.

Implementation uses this one frozen complete file and its exact recorded hash. A concrete implementation finding requires an explicit reviewed contract amendment before changing dependent behavior. No unresolved routine choice is delegated to a user approval question. If implementation evidence disproves a chosen constraint or capacity projection, stop that dependent implementation and return the precise finding for a versioned contract correction. Independent peer review remains AI-assisted engineering evidence; consented pilots, real observations, institutional decisions, human source/security/accessibility review, credentials and owner-deferred AI remain separate from this software release.

## 12. Recorded amendment 1: discoverable approval and source context

The first implementation pass identified a missing wire flow: ordinary record responses do not expose an approval audit-event ID, and a binding summary alone does not supply its retained source after reload. Clients must not infer either from prose or manufacture pins. This amendment adds read-only staff endpoints; all existing authority, source-scope and current-final-state checks remain mandatory.

```ts
type ApprovalResolution = {recordId:Id;record:OrdinaryRecord|null;pin:RecordPin|null;
 evidence:ApprovedEvidence|null;eligibility:{eligible:boolean;
 code:"eligible"|"deleted-or-unavailable"|"unsupported-ordinary-record"|"wrong-state"|
 "not-approved"|"approval-not-current"|"approval-event-unavailable"|"program-data-changed";
 message:string}};
type LearningContext = {binding:BindingSummary;mapping:LearningEvent;source:SourceCapture;
 program:ApprovalResolution;records:ApprovalResolution[];nextCursor:string|null};
type RecoveredDetail = {binding:BindingSummary;mapping:LearningEvent;source:SourceCapture;
 history:LearningBackup};
```

- GET `records/:id/approval` has no query. Resolve one currently authorized ordinary record from the four closed modules. An inaccessible/missing record returns the existing unavailable error. Otherwise return `{resolution:ApprovalResolution}` with both pin/evidence present only for an exact eligible current final-state approval. Eligibility false never supplies a fallback approval. Use fixed safe messages and no raw source values in error text. A valid discovered pin supplies no mapping, selection or mutation authority by itself.
- GET `bindings/:id/context` accepts only the documented cursor. Return exactly LearningContext: current full mapping event, current selected SourceCapture, current program resolution and at most 20 related definition/protocol/measurement/decision resolutions per page. Resolve IDs from typed committed events, never names or pasted blocks. Page order is recordId code-unit order; cursor binds the exact current HeadPin, and a changed head refuses. Stop the page before the complete 4 MiB response bound and provide nextCursor; at least one valid item must fit. An authorized unavailable historical target uses record:null/pin:null/evidence:null with the fixed unavailable code. Do not let an unavailable old record prevent reading other retained evidence. Raw-source write-on-outcomes/evaluation rules apply to this endpoint.
- GET `recovered` returns `{bindings:BindingSummary[],nextCursor}` using the established bounded paging rule and recovered-only disposition. GET `recovered/:headHash` returns exactly RecoveredDetail after administrator and current program/source-scope authorization. History is a strictly admitted recovered closure containing the selected binding and necessary provenance, with no receipts, sessions or preview authority; complete response is bounded by 64 MiB. If a required closure is outside current program scope, refuse rather than omit it. Do not expose live report routes or adopt by merely reading it. The client explicitly selects its historical source and re-enters/adapts mapping before adoption.

Every resolution is recomputed under current authentication/membership/scope. A context page/read is an observation, not a transactional snapshot or approval; preview and commit still recheck the exact current pins. The UI checks unchanged binding.head while assembling pages, retains literal input, and invalidates stale preview authority. Safe response text is bounded by 500 units, and a true eligibility result uses code eligible with matching record/pin/evidence identities. Both nullability directions are runtime checked. This is a wire-completeness amendment, not permission to broaden roles or alter native formats.

### Amendment 1 clarification: transient inspection incarnation

Before mapping exists, an inspection has no real event root. Its transient preview restore_epoch_sha256 therefore hashes the closed `{kind:"inspection-target",programRecordId:Id,lastRestoredAuditId:AuditId|null,head:HeadPin|null}` through the existing restore-epoch namespace; head is null for new and the exact existing head for refresh. It must match again before mapping preview. Do not fabricate an event hash or reuse this inspection digest as a command Receipt RestoreEpoch. A fixed map/adoption preview then has a real proposed sequence-1 root; all accepted command receipts use the unchanged real-root RestoreEpoch definition. This clarification adds no persistent source, command or approval authority.

### Amendment 1 clarification: ordinary approval navigation

Learning approval links use exactly `#learning-record/<org>/<module>/<id>` with ASCII IDs and one of the four learning modules. The new tab rechecks the actual session, exact organization membership and ordinary read permission before showing the existing record detail. Missing or changed authority refuses without substituting a remembered organization. This matters when a recovered record has the same ID in two organizations. The original form remains in its own tab. No approval permission or workflow changes.

Abandoning a pending correction is a metadata disposition under current binding, head, staff, scope and write authority. It does not require the program, protocol or definition to retain an empirical approval that may since have become stale. It creates no replacement edge and never revives a questioned value. Applying a correction still requires its exact current final-state approvals and mapping.

## Amendment 2: complete transaction capacity

Implementation review found that a feature payload reserve alone does not cover ordinary `record.restored` audits, longer destination identities or all restored sidecars. The existing 60 MiB logical and 64 MiB full-backup limits remain. The source and destination must be measured through their actual ordinary and feature normalizers, PostgreSQL composite rows, actual JSONB sizes and complete export serializers. Projection is read-only; no dummy restore or temporary writes provide admission. Exact column-set checks refuse schema drift. PostgreSQL's own base64 encoding, including its line breaks, supplies the file wire representation.

The complete source gate runs at the end of the real organization transaction, after every candidate, history row and mandatory audit exists and before COMMIT. Raw SQL logical accounting remains available to intermediate writes. Calling a strict whole-source validator from an intermediate audit would reject a valid mapping whose later candidate rows have not yet been inserted. A server-owned WeakMap records audit actions; no HTTP field supplies a deferral or validator. Locked mutations without audits, including pending native inspections, still reach the complete gate. The gate applies to later ordinary and other feature content mutations whenever retained learning state exists.

The existing fixed access-control and cancellation audit actions retain their emergency-reserve priority. If all recorded actions are in that server-defined set, the transaction keeps its existing behavior; a quota must not prevent withdrawal or revocation. This is an explicit exception to the normal future-copy reserve, not a promise that emergency-reserve changes always fit another ordinary mutation. Optional `backup.exported` audits also keep export available, retain the raw 60 MiB cap and do not change current content. Export takes the organization lock before assembly. Projection reserves ten decimal digits for `sourceHistoryCount`, using the maximum JavaScript array length only as a size bound; actual audit counts remain exact. Thus an optional archived export audit cannot increase the projected destination count width.

The default prospective target includes one worst-bound `organization.created` event, 100-character ASCII organization/actor identities, maximum bigint audit IDs and full microsecond timestamp widths. Actual import preview and commit instead admit the target's real event and nonconflicting legacy-report baseline, including both its storage and its emitted JSON. Any other retained row or sidecar outside that admitted baseline refuses. Existing source-archive count/byte gates remain separate. A target report collision with recovered learning report identity or checksum refuses before writes. Full restore preserves one canonical learning report inventory and inactive history; no receipt or current approval is recovered.

These choices received AI-assisted engineering review. Actual near-limit source/export/restore measurements are acceptance evidence only when their exact implementation and test versions are recorded; this amendment itself makes no deployment or native-browser claim.


### Amendment 2 clarification: read availability and bounded worker status

A server-selected read-only transaction executes PostgreSQL `SET TRANSACTION READ ONLY` immediately after BEGIN. Its trusted GET/HEAD routes retain organization advisory locks where needed, but omit row-update/session-share locks that PostgreSQL forbids in read-only transactions. Only this database-enforced path skips mutation capacity admission. It cannot write previews, audits or content; PostgreSQL rejects an accidental write. Write transactions retain all current authority locks and final capacity admission. Viewing records must remain possible after emergency withdrawal has used its existing reserve.

Delivery worker transactions retain their existing bounded lock/deadline and known-provider-result handling. They do not run a large whole-workspace projection after a provider attempt. Instead normal learning-bearing content admission reserves their finite future changes before accepting content. When any nonlegacy outbox item exists, a read-only hypothetical projection bounds every portable outbox item's status (ten characters), safe code (100 ASCII characters), attempt count (maximum SQL integer) and ISO timestamps (24 characters for service-generated attempt/check times; 27 for a provider timestamp, whose existing parser accepts extended years). This also covers legacy sibling items changed by suppression. Original export, narrative, report, payload, checksum and history bytes remain untouched. Only the separate admission projection uses the upper bounds.

The source's full-backup wire measurement and compact outbox array reserve those future fields within their existing 64 MiB and 8 MiB limits. Affected participation revisions reserve ten digits in source wire. Actual PostgreSQL row measurement reserves positive source participation growth for the bounded revision, updated timestamp and suppression-consent object; the global 60 MiB and participation category include that growth. A nonlegacy outbox row's worst physical size must fit its existing prepaid per-row reserve. Legacy sibling rows with no prepaid reserve instead charge any positive worst-row growth to source global and outbox admission. The future restored copy uses bounded outbox metadata and recovered-state width, with its actual PostgreSQL row category, global 60 MiB and complete 64 MiB re-export all checked. Restored participation has no live delivery authority. The fixed withdrawal/access-control priority exception still applies; these projections must never block withdrawal or discard a known provider outcome.

This clarification follows independent call-site review of locked reads and unaudited worker updates. Acceptance must exercise the enforced read-only refusal of writes and actual bounded status growth, rather than treating an HTTP GET label or a constant reserve alone as proof.


## Amendment 3: hosted native transport

Vercel Functions limit a request body to 4.5 MB ([official limits](https://vercel.com/docs/functions/limitations), checked October 28, 2026 UTC). The admitted Nonprofit native file remains at most 8,000,000 bytes. Its complete original bytes therefore need bounded upload requests; passing a loopback multipart test alone cannot establish hosted acceptance.

The existing exact two-part multipart source inspection remains available for small files. The browser uses it up to 3,000,000 native bytes. Larger explicit selections use POST `source/upload` with closed `{uploadId?:string,index:number,total:number,chunk:string}`. Every decoded chunk is at most 1,500,000 bytes; each nonfinal chunk has exactly that length, total is 1..6, and the final chunk also fits `8,000,000 - (total-1)*1,500,000`. Base64 is canonical. The whole JSON request has a 2,008,192-byte bound. Existing transient `os_uploads` storage keeps its two-active-upload and 30-minute expiry limits; no new source or approval table is introduced. A server-derived actor identity hashes an explicit source-upload namespace and the current learning actor/session/membership incarnation. Generic full-backup uploads use their existing user identity and cannot read these chunks. A new upload must start at index zero. The client creates and retains its upload ID before its first await, so a lost first response retries the same slot. It retains only acknowledged part progress in file-object memory; a deliberate Retry resumes at the first unconfirmed part, while an expired/session-mismatched upload discards that local progress and requires a fresh upload. No progress is written to browser storage. Exact duplicate chunks are idempotent; changed content, total, actor, organization or expiry refuses.

Final POST `source/inspect` may instead receive closed JSON `{metadata,upload:{uploadId,byteLength,sha256}}`, bounded to 16 KiB. Metadata has exactly the existing multipart metadata schema. Current real session, staff/source permission and target scope checks apply again. The server reads the complete ordered upload under the organization lock, checks all indices/totals/expiry/derived actor, its actual complete byte length and SHA-256, and applies the exact same complete native admission and selected-retention rules as multipart. An adapter's original 1,000,000 or 8,000,000-byte bound still applies. A supplied digest is an integrity expectation, never source or approval authority. Successful inspection removes only its owned transient chunks in the same transaction. A failed or interrupted attempt retains the original browser file/form and bounded chunks; deliberate inspection can be retried. Expiry makes parts unreadable after 30 minutes; physical deletion occurs on a later organization upload cleanup, not an exact-time timer. This temporary private bytea storage contains the complete original, including unselected Nonprofit rows. The visible upload explanation discloses that distinction; only selected source DTOs enter learning previews, permanent history and backups. Index-zero requests and final inspections each retain a six-per-15-minute upload rate gate; common current-staff write rate limits also remain.

All Learning read responses are fully authorized, validated and byte-bounded before emitting an actual `ReadableStream` in at most 64 KiB parts. This includes a recovered historical closure whose established response bound is 64 MiB. Streaming changes transport only; it does not lower retained response bounds, page authority, release private data before validation, activate recovered state or bypass current scope. Reports/context remain at their existing smaller bounds. Native filename/MIME still supplies no provenance. The client abort signal reaches every chunk/final request; no automatic command submission or background source discovery is added.

Acceptance needs client transport byte reconstruction, exact +1/base64/order/actor/session/expiry/hash failures and actual constrained-handler >4.5 MB upload/final inspection. Every upload request must stay below the provider cap. Large historical response tests must consume the actual stream; staged hosted acceptance must exercise the deployed route rather than infer it from the local server. Existing native codec, multipart, ordinary full-backup chunk and recovery contracts remain unchanged.


### Amendment 2 clarification: PostgreSQL timestamp transport

An actual PostgreSQL probe found that canonical JavaScript extended-year ISO text with a leading plus is not accepted by a direct PostgreSQL timestamp cast, although the represented positive year is supported. Delivery completion and outbox recovery therefore pass already validated timestamp instants as Date parameters. This is a value-preserving database transport change; provider admission, stored facts, source/export ISO strings, send decisions, leases and deadlines do not change. Composite-row capacity measurement uses the equivalent PostgreSQL timestamp spelling only inside its SQL transport, including supported BC/year-zero conversion. Wire measurements retain the original canonical ISO spelling. Physical bounds account for the longer BC representation as well as microsecond width. Exact PostgreSQL→Date→export round trips establish preservation; timestamps outside PostgreSQL's supported range remain refused rather than repaired or coerced into a different instant.
