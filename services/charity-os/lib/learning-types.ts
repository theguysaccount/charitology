// Closed types from the frozen OS learning bridge plan including wire amendment1. Runtime admission is mandatory.
export type ToCIndicator = {
  what: string;
  how: string;
  when: string;
  baseline: string;
  target: string;
};
export type ToCDraft = {
  id: string;
  name: string;
  problem: string;
  source: string;
  depth: 0 | 1 | 2 | 3 | 4 | null;
  activities: string;
  outputs: string;
  outcomeShort: string;
  outcomeMedium: string;
  outcomeLong: string;
  indicators: ToCIndicator[];
  assumptions: string;
  feedbackMethod: string;
  feedbackFrequency: string;
  comparison: string;
  stopRule: string;
  reviewer: string;
  reviewDate: string;
  example: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ToCNative = {
  format: "charitology-theory-of-change";
  version: 1;
  exportedAt: string;
  draft: ToCDraft;
};

export type NativeLearningStatus =
  | "Draft"
  | "Needs evidence"
  | "Ready for discussion"
  | "Recorded decision"
  | "Closed";
export type NativeDiagnostic = {
  id: string;
  values: {
    title: string;
    area:
      | "Outcomes and causal pathway"
      | "Evidence and comparison"
      | "Full costs and capacity"
      | "Voice and access"
      | "Reporting burden"
      | "Governance and incentives";
    current: string;
    gap: string;
    consequence: string;
    depth:
      | "Unclassified"
      | "0 Relief"
      | "1 Repair"
      | "2 Prevention"
      | "3 Structure"
      | "4 Source"
      | "Several levels";
    status: NativeLearningStatus;
  };
};
export type NativeEvidence = {
  id: string;
  values: {
    title: string;
    type:
      | "Outcome evidence"
      | "Output description"
      | "Cost or capacity assumption"
      | "Feedback and access"
      | "Rival explanation";
    measure: string;
    finding: string;
    source: string;
    evidence:
      | "Unknown or not checked"
      | "Public description only"
      | "Observational evidence"
      | "Causal study"
      | "Mixed or disputed"
      | "Hypothesis";
    method: string;
    limits: string;
    checked: string;
  };
};
export type NativeAction = {
  id: string;
  values: {
    title: string;
    diagnostic: string;
    owner: string;
    date: string;
    steps: string;
    burden: string;
    complete: string;
    status: "To do" | "In progress" | "Blocked" | "Done";
  };
};
export type NativeReadiness = {
  id: string;
  values: {
    title: string;
    owner: string;
    status:
      | "Not established"
      | "Needs outside review"
      | "Evidence recorded locally"
      | "Needs revision";
    source: string;
    date: string;
    notes: string;
  };
};
export type NonprofitNative = {
  version: 1;
  program: "nonprofit-advisory";
  updated: string;
  context: {
    name: string;
    activity: string;
    decision: string;
    change: string;
    baseline: string;
    capacity: string;
    voice: string;
    privacy: string;
    period: string;
  };
  records: {
    diagnostics: NativeDiagnostic[];
    evidence: NativeEvidence[];
    actions: NativeAction[];
    learning: NativeLearning[];
    readiness: NativeReadiness[];
  };
};
export type NativeLearning = {
  id: string;
  values: {
    title: string;
    outcome: string;
    method: string;
    rule: string;
    feedback: string;
    result: string;
    date: string;
    status: NativeLearningStatus;
  };
};
export type SelectedNonprofit = {
  version: 1;
  program: "nonprofit-advisory";
  updated: string;
  context: NonprofitNative["context"];
  learning: NativeLearning;
};

export type Id = string; // /^[A-Za-z0-9_-]{1,100}$/; service-generated IDs are lowercase UUIDv4
export type Hash = string; // exactly 64 lowercase hex
export type AuditId = string; // canonical positive PostgreSQL bigint decimal, 1..9223372036854775807
export type Instant = string; // canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ
export type DbInstant = string; // canonical UTC with exactly six fractional digits, server SQL to_char
export type Day = string; // real YYYY-MM-DD, 1900..2200; start<=end
export type Adapter =
  "theory-of-change-native-v1" | "nonprofit-learning-native-v1";
export type Module = "programs" | "outcomes" | "evaluation" | "reporting";
export type Action = "continue" | "modify" | "test" | "stop";
export type ChangeOperation =
  | "map"
  | "measure"
  | "correct"
  | "apply-correction"
  | "abandon-correction"
  | "decide"
  | "adopt";
export type Operation = ChangeOperation | "freeze";
export type WorkingPin = {
  moduleId: Module;
  recordId: Id;
  revision: number;
  dataSha256: Hash;
};
export type SourcePin = {
  originOrgId: Id;
  bindingId: Id;
  version: number;
  sha256: Hash;
};
export type HeadPin = {
  originOrgId: Id;
  bindingId: Id;
  sequence: number;
  eventSha256: Hash;
};
export type RecordPin = {
  originOrgId: Id;
  moduleId: Module;
  recordId: Id;
  revision: number;
  snapshotSha256: Hash;
  approvalEventId: AuditId;
  approvalSha256: Hash;
};
export type FileMeta = {
  id: Id;
  name: string;
  mime: string;
  size: number;
  checksum: Hash;
};
export type OrdinaryDataByModule = {
  programs: OrdinaryProgramData;
  outcomes: OrdinaryOutcomeData;
  evaluation: OrdinaryEvaluationData;
  reporting: OrdinaryReportingData;
};
export type SnapshotFor<M extends Module> = {
  id: Id;
  orgId: Id;
  moduleId: M;
  data: OrdinaryDataByModule[M];
  status: string;
  ownerId: Id;
  revision: number;
  createdAt: Instant;
  updatedAt: Instant;
  files: FileMeta[];
};
export type Snapshot = { [M in Module]: SnapshotFor<M> }[Module];
export type Approval = {
  status: "approved";
  revision: number;
  actorId: Id;
  reason: string;
  at: Instant;
};
export type OrdinaryRecordFor<M extends Module> = {
  id: Id;
  orgId: Id;
  moduleId: M;
  data: OrdinaryDataByModule[M];
  status: string;
  ownerId: Id;
  lastEditedBy: Id;
  revision: number;
  approval: Approval | null;
  snapshot: SnapshotFor<M> | null;
  source: { integrationId: Id; externalId: string; checksum: Hash } | null;
  createdAt: Instant;
  updatedAt: Instant;
};
export type OrdinaryRecord = { [M in Module]: OrdinaryRecordFor<M> }[Module];
export type ApprovedEvidence = {
  format: "charitology-learning-approved-evidence";
  version: 1;
  pin: RecordPin;
  snapshot: Snapshot;
  approval: Approval;
  approvalEvent: {
    id: AuditId;
    action: "record.approved";
    actorId: Id;
    createdAtExact: DbInstant;
    recordSha256: Hash;
  };
  sha256: Hash;
};
export type SourceCaptureCommon = {
  format: "charitology-learning-source";
  version: 1;
  registrySha256: Hash;
  originOrgId: Id;
  bindingId: Id;
  sourceVersion: number;
  previousSource: SourcePin | null;
  receivedAt: Instant;
  originalBytes: number;
  originalSha256: Hash;
  nativeIdentity: string;
  sha256: Hash;
};
export type SourceCapture = SourceCaptureCommon &
  (
    | {
        adapter: "theory-of-change-native-v1";
        selection: { kind: "whole-draft" };
        selected: { kind: "theory-of-change"; value: ToCNative };
      }
    | {
        adapter: "nonprofit-learning-native-v1";
        selection: { kind: "learning-row"; recordId: string };
        selected: { kind: "nonprofit-learning"; value: SelectedNonprofit };
      }
  );
export type Period =
  { kind: "unknown" } | { kind: "closed-days"; startDate: Day; endDate: Day };
export type Unit =
  | { kind: "unknown" }
  | {
      kind: "defined";
      text: string;
      quantityKind: "count" | "amount" | "percentage" | "rate" | "other";
      definition: string;
      denominatorDefinition: string | null;
    };
export type SourceField =
  | "toc.outcomeShort"
  | "toc.outcomeMedium"
  | "toc.outcomeLong"
  | "toc.stopRule"
  | "toc.comparison"
  | "toc.feedbackMethod"
  | "toc.feedbackFrequency"
  | "np.learning.outcome"
  | "np.learning.rule"
  | "np.learning.feedback"
  | "np.context.change";
export type Basis = {
  disposition: "adopted" | "adapted" | "uncollected" | "not-adopted";
  sourceFields: SourceField[];
  text: string | null;
  reason: string | null;
};
export type ReviewBasis = {
  intendedOutcome: Basis;
  rule: { basis: Basis; whenMet: Action | null; whenNotMet: Action | null };
  comparison: Basis;
  feedback: Basis;
};
export type IndicatorOrigin =
  | { kind: "toc-indicator"; index: number }
  | { kind: "learning-checkpoint" }
  | { kind: "author-defined"; reason: string };
export type IndicatorInput = {
  slot: number;
  origin: IndicatorOrigin;
  title: string;
  unit: Unit;
  population: string;
  geography: string | null;
  plannedPeriod: Period;
  limitations: string;
};
export type ProtocolInput = {
  title: string;
  question: string;
  method:
    | "unknown"
    | "before-after"
    | "comparison"
    | "randomized"
    | "contribution-analysis"
    | "qualitative";
  uncertainty: string;
  harms: string;
  reviewDate: Day | null;
};
export type MappingInput = {
  mappingVersion: "learning-mapping-v1";
  basis: ReviewBasis;
  indicators: IndicatorInput[];
  protocol: ProtocolInput;
};
export type MapProposal =
  | {
      mode: "new";
      inspectionId: Id;
      program: WorkingPin;
      mapping: MappingInput;
    }
  | {
      mode: "refresh";
      inspectionId: Id;
      head: HeadPin;
      program: WorkingPin;
      mapping: MappingInput;
    }
  | {
      mode: "remap";
      head: HeadPin;
      source: SourcePin;
      program: WorkingPin;
      mapping: MappingInput;
    }
  | {
      mode: "adopt-recovered";
      recoveredHead: HeadPin;
      source: SourcePin;
      program: WorkingPin;
      mapping: MappingInput;
    };
export type Locator =
  { kind: "known"; text: string } | { kind: "not-collected" };
export type MeasurementInput = {
  head: HeadPin;
  mappingEventSha256: Hash;
  program: RecordPin;
  protocol: RecordPin;
  definition: RecordPin;
  title: string;
  value: number | null;
  denominator: number | null;
  period: { kind: "closed-days"; startDate: Day; endDate: Day };
  method:
    "unknown" | "administrative" | "survey" | "observation" | "experiment";
  evidence: "unknown" | "self-reported" | "source-linked";
  sourceUrl: string | null;
  locator: Locator;
  missingReason: string | null;
  limitations: string;
};
export type CorrectionInput = {
  measurement: MeasurementInput;
  replaces: RecordPin;
  reason: string;
};
export type CorrectionApplyInput = {
  head: HeadPin;
  correctionEventSha256: Hash;
  replacement: RecordPin;
};
export type CorrectionAbandonInput = {
  head: HeadPin;
  correctionEventSha256: Hash;
  reason: string;
};
export type RuleAssessment = {
  result: "met" | "not-met" | "unassessable" | "not-adopted";
  explanation: string;
  departureReason: string | null;
};
export type FeedbackAssessment = {
  status: "collected" | "not-collected" | "unknown";
  summary: string;
  sourceUrl: string | null;
};
export type DecisionInput = {
  head: HeadPin;
  mappingEventSha256: Hash;
  program: RecordPin;
  protocol: RecordPin;
  observations: RecordPin[];
  discussedDefinitions: RecordPin[];
  title: string;
  action: Action;
  assessment: RuleAssessment;
  feedback: FeedbackAssessment;
  uncertainty: string;
  harms: string;
  followUp: Day;
  noEvidenceReason: string | null;
};
export type ManifestInput = {
  title: string;
  programId: Id;
  startDate: Day;
  endDate: Day;
  summary: string;
  missingness: string;
  issueDate: Day | null;
  supersedes: { reportId: Id; checksum: Hash; reason: string } | null;
};
export type SelectionInput = {
  head: HeadPin;
  mappingEventSha256: Hash;
  program: RecordPin;
  source: SourcePin;
  protocol: RecordPin;
  definitions: RecordPin[];
  observations: RecordPin[];
  decision: RecordPin;
  manifestRecordId: Id;
};
export type FinalSelection = {
  selection: SelectionInput;
  manifest: RecordPin;
  sourceDigest: Hash;
};
export type CreatedRecord = {
  moduleId: "outcomes" | "evaluation";
  recordId: Id;
  revision: 1;
  dataSha256: Hash;
};
export type EventPayload =
  | {
      kind: "mapped";
      mode: "new" | "refresh" | "remap";
      source: SourcePin;
      program: WorkingPin;
      mapping: MappingInput;
      mappingNumber: number;
      records: CreatedRecord[];
    }
  | {
      kind: "adopted";
      recoveredHead: HeadPin;
      source: SourcePin;
      program: WorkingPin;
      mapping: MappingInput;
      mappingNumber: 1;
      records: CreatedRecord[];
    }
  | { kind: "measured"; input: MeasurementInput; record: CreatedRecord }
  | { kind: "corrected"; input: CorrectionInput; record: CreatedRecord }
  | {
      kind: "correction-applied";
      correctionEventSha256: Hash;
      replaces: RecordPin;
      replacement: RecordPin;
    }
  | {
      kind: "correction-abandoned";
      correctionEventSha256: Hash;
      candidateRecordId: Id;
      reason: string;
    }
  | { kind: "decided"; input: DecisionInput; record: CreatedRecord }
  | {
      kind: "report-frozen";
      selection: FinalSelection;
      reportId: Id;
      reportChecksum: Hash;
      frozenManifest: WorkingPin;
    };
export type LearningEvent = {
  format: "charitology-learning-event";
  version: 1;
  originOrgId: Id;
  bindingId: Id;
  sequence: number;
  previous: HeadPin | null;
  actorId: Id;
  recordedAt: Instant;
  programId: Id;
  payload: EventPayload;
  sha256: Hash;
};
export type Exclusion = {
  recordId: Id;
  revision: number;
  reason:
    | "not-selected"
    | "replaced"
    | "outside-period"
    | "unapproved"
    | "different-mapping"
    | "deleted"
    | "pending-correction"
    | "abandoned-correction"
    | "unresolved-correction";
  replacedBy: Id | null;
};
export type Boundary =
  | { kind: "source-parent"; pin: SourcePin }
  | { kind: "event-parent"; pin: HeadPin };
export type LearningReport = {
  format: "charitology-os-report";
  kind: "learning-review";
  version: 1;
  methodVersion: "learning-review-v1";
  id: Id;
  orgId: Id;
  title: string;
  createdBy: Id;
  createdAt: Instant;
  audience: "private-staff";
  selection: FinalSelection;
  manifest: LearningManifestData;
  basis: ReviewBasis;
  assessment: RuleAssessment;
  feedback: FeedbackAssessment;
  sources: SourceCapture[];
  approvedEvidence: ApprovedEvidence[];
  events: LearningEvent[];
  exclusions: Exclusion[];
  boundaries: Boundary[];
  supersedes: { reportId: Id; checksum: Hash; reason: string } | null;
  checksum: Hash;
};
export type CommitResult = {
  outcome:
    | "mapped"
    | "adopted"
    | "measured"
    | "corrected"
    | "correction-applied"
    | "correction-abandoned"
    | "decided"
    | "frozen";
  head: HeadPin;
  records: WorkingPin[];
  report: { id: Id; checksum: Hash } | null;
};
export type CommitInput = {
  previewId: Id;
  reviewSha256: Hash;
  commandKey: string;
}; // lowercase UUIDv4
export type CommitResponse = {
  ok: true;
  kind: "committed" | "already-committed";
  result: CommitResult;
  disposition: "active" | "trash" | "historical-only";
};

export type OrdinaryProgramData = {
  title: string;
  kind: "program" | "system-map" | "assumption";
  purpose: string | null;
  community: string | null;
  mechanism: string | null;
  depth: number | null;
  evidence: "hypothesis" | "documented" | "established" | "debated" | null;
  assumptions: string | null;
  sourceUrl: string | null;
  reviewDate: Day | null;
};
export type OrdinaryOutcomeData = {
  title: string;
  kind: "indicator" | "observation" | "harm";
  programId: Id | null;
  indicatorId: Id | null;
  value: number | null;
  unit: string | null;
  denominator: number | null;
  startDate: Day | null;
  endDate: Day | null;
  geography: string | null;
  method:
    | "unknown"
    | "administrative"
    | "survey"
    | "observation"
    | "experiment"
    | null;
  evidence:
    | "unknown"
    | "self-reported"
    | "source-linked"
    | "independently-reviewed"
    | null;
  sourceUrl: string | null;
  limitations: string | null;
};
export type OrdinaryEvaluationData = {
  title: string;
  kind: "question" | "protocol" | "review" | "decision";
  programId: Id | null;
  outcomeIds: Id[] | null;
  question: string | null;
  method:
    | "unknown"
    | "before-after"
    | "comparison"
    | "randomized"
    | "contribution-analysis"
    | "qualitative"
    | null;
  counterfactual: string | null;
  evidenceStrength: "unknown" | "weak" | "mixed" | "moderate" | "strong" | null;
  uncertainty: string | null;
  harms: string | null;
  decision: "undecided" | Action | null;
  reviewDate: Day | null;
};
export type OrdinaryReportingData = {
  title: string;
  kind: "board" | "funder" | "public" | "template";
  programId: Id | null;
  agreementId: Id | null;
  outcomeIds: Id[] | null;
  financeIds: Id[] | null;
  receiptIds: Id[] | null;
  assemblyMethod: "grant-report-v1" | "learning-review-v1" | null;
  sourceDigest: string | null;
  supersedesReportId: Id | null;
  revisionReason: string | null;
  startDate: Day | null;
  endDate: Day | null;
  summary: string | null;
  missingness: string | null;
  visibility: "private" | "board" | "funder" | "public" | null;
  issueDate: Day | null;
};
export type BridgeIndicatorData = {
  title: string;
  kind: "indicator";
  programId: Id;
  indicatorId: null;
  value: null;
  unit: string | null;
  denominator: null;
  startDate: Day | null;
  endDate: Day | null;
  geography: string | null;
  method: "unknown";
  evidence: "unknown";
  sourceUrl: null;
  limitations: string;
};
export type BridgeObservationData = {
  title: string;
  kind: "observation";
  programId: Id;
  indicatorId: Id;
  value: number | null;
  unit: string;
  denominator: number | null;
  startDate: Day;
  endDate: Day;
  geography: string | null;
  method:
    "unknown" | "administrative" | "survey" | "observation" | "experiment";
  evidence: "unknown" | "self-reported" | "source-linked";
  sourceUrl: string | null;
  limitations: string;
};
export type BridgeOutcomeData = BridgeIndicatorData | BridgeObservationData;
export type BridgeProtocolData = {
  title: string;
  kind: "protocol";
  programId: Id;
  outcomeIds: [];
  question: string;
  method:
    | "unknown"
    | "before-after"
    | "comparison"
    | "randomized"
    | "contribution-analysis"
    | "qualitative";
  counterfactual: string;
  evidenceStrength: "unknown";
  uncertainty: string;
  harms: string | null;
  decision: "undecided";
  reviewDate: Day | null;
};
export type BridgeDecisionData = {
  title: string;
  kind: "decision";
  programId: Id;
  outcomeIds: Id[];
  question: string;
  method:
    | "unknown"
    | "before-after"
    | "comparison"
    | "randomized"
    | "contribution-analysis"
    | "qualitative";
  counterfactual: string;
  evidenceStrength: "unknown";
  uncertainty: string;
  harms: string | null;
  decision: Action;
  reviewDate: Day;
};
export type BridgeEvaluationData = BridgeProtocolData | BridgeDecisionData;
export type LearningManifestData = {
  title: string;
  kind: "template";
  programId: Id;
  agreementId: null;
  outcomeIds: Id[];
  financeIds: [];
  receiptIds: [];
  assemblyMethod: "learning-review-v1";
  sourceDigest: Hash | null;
  supersedesReportId: Id | null;
  revisionReason: string | null;
  startDate: Day;
  endDate: Day;
  summary: string;
  missingness: string;
  visibility: "private";
  issueDate: Day | null;
};

export type Candidate =
  | {
      id: Id;
      moduleId: "outcomes";
      data: BridgeOutcomeData;
      status: "draft";
      ownerId: Id;
      revision: 1;
    }
  | {
      id: Id;
      moduleId: "evaluation";
      data: BridgeEvaluationData;
      status: "draft";
      ownerId: Id;
      revision: 1;
    };
export type ChangePreview = {
  previewId: Id;
  operation: ChangeOperation;
  reviewSha256: Hash;
  expiresAt: Instant;
  plan: {
    source: SourceCapture | null;
    event: LearningEvent;
    candidates: Candidate[];
    approvedEvidence: ApprovedEvidence[];
    samePeriodRecordIds: Id[];
  };
};
export type FreezePreview = {
  previewId: Id;
  operation: "freeze";
  reviewSha256: Hash;
  expiresAt: Instant;
  report: LearningReport;
  frozenManifest: WorkingPin;
};
export type BindingSummary = {
  bindingId: Id;
  originOrgId: Id;
  programId: Id;
  head: HeadPin;
  originMode: "live" | "recovered";
  source: SourcePin;
  mappingNumber: number;
  disposition: "bound" | "needs-review" | "trash" | "historical-only";
};
export type ReportSummary = {
  id: Id;
  title: string;
  checksum: Hash;
  createdAt: Instant;
  programId: Id;
  sourceDigest: Hash;
  supersedesReportId: Id | null;
};

export type Receipt = {
  version: 1;
  operation: Operation;
  commandHash: Hash;
  requestHash: Hash;
  actorBindingHash: Hash;
  actorId: Id;
  sessionSha256: Hash;
  membershipSha256: Hash;
  memberCreatedAtExact: DbInstant;
  restoreEpochSha256: Hash;
  previewId: Id;
  reviewSha256: Hash;
  acceptedAt: Instant;
  result: CommitResult;
};
export type RestoreEpoch = {
  root: HeadPin;
  records: { recordId: Id; lastRestoredAuditId: AuditId | null }[];
};

export type LearningBackup = {
  format: "charitology-learning-backup";
  version: 1;
  method: "learning-review-v1";
  sources: SourceCapture[];
  approvedEvidence: ApprovedEvidence[];
  events: LearningEvent[];
  reports: LearningReport[];
};

export type ApprovalResolution = {
  recordId: Id;
  record: OrdinaryRecord | null;
  pin: RecordPin | null;
  evidence: ApprovedEvidence | null;
  eligibility: {
    eligible: boolean;
    code:
      | "eligible"
      | "deleted-or-unavailable"
      | "unsupported-ordinary-record"
      | "wrong-state"
      | "not-approved"
      | "approval-not-current"
      | "approval-event-unavailable"
      | "program-data-changed";
    message: string;
  };
};
export type LearningContext = {
  binding: BindingSummary;
  mapping: LearningEvent;
  source: SourceCapture;
  program: ApprovalResolution;
  records: ApprovalResolution[];
  nextCursor: string | null;
};
export type RecoveredDetail = {
  binding: BindingSummary;
  mapping: LearningEvent;
  source: SourceCapture;
  history: LearningBackup;
};
