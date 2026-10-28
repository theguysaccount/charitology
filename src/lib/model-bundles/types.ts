/** Exact wire and internal orchestration interfaces from the frozen v1 contract. */
export type Id = string;
export type Hash = string;
export type Instant = string;
export type Day = string;
export type PartialDate = { precision: 'year' | 'month' | 'day'; value: string };
export type Row = 'cost' | 'people' | 'works' | 'effect' | 'years' | 'anyway';
export type Part = 'low' | 'likely' | 'high';
export type Triple<T> = [T, T, T];
export type Six<T> = { cost: T; people: T; works: T; effect: T; years: T; anyway: T };
export type Head = { id: Id; hash: Hash };
export type EnginePin = { id: 'charitology-ce-triangular-js-v1'; version: 1; definitionHash: Hash };
export type FilePin = { path: string; byteLength: number; sha256: Hash };
export type EngineFile = FilePin & { rawUtf8: string };
export type EngineDefinition = {
  id: 'charitology-ce-triangular-js-v1'; version: 1; language: 'ecmascript-binary64';
  rangedOrder: ['cost', 'people', 'works', 'effect', 'years', 'anyway']; draws: 5000;
  prng: 'mulberry32-v1'; distribution: 'triangular-inverse-cdf-v1'; quantile: 'type7-infinity-v1';
  equation: 'expected-one-outcome-geometric-years-v1'; drawConsumption: 'six-in-order-including-constants';
  sorting: 'separate-ascending-cost-and-outcome'; sensitivity: 'one-at-a-time-mode-v1';
  numericalPolicy: 'guarded-finite-intermediates-v1'; sourceFiles: FilePin[]; goldenVectorsHash: Hash;
};
export type KnownEngine = { definition: EngineDefinition; definitionHash: Hash; files: EngineFile[] };
export type Raw = { parser: 'legacy-amount-strip-v1' | 'strict-decimal-v1'; name: string; unit: string;
  values: Six<Triple<string>>; discount: string; seed: string };
export type Input = { values: Six<Triple<number>>; discount: number; seed: number; draws: 5000 };
export type Finite = { kind: 'finite'; value: number };
export type NoOutcome = { kind: 'no-outcome' };
export type Unbounded = { kind: 'unbounded' };
export type CostValue = Finite | NoOutcome;
export type CostSummary = { median: CostValue; p5: CostValue; p95: CostValue };
export type OutcomeSummary = { median: Finite; p5: Finite; p95: Finite };
export type SensitivityRow = { key: Row; atLow: CostValue; atHigh: CostValue; lo: CostValue;
  hi: CostValue; swing: Finite | Unbounded };
export type RecordedRun = { inputHash: Hash; draws: 5000; seed: number; none: number;
  cost: CostSummary; outcome: OutcomeSummary; likely: { cost: Finite; outcome: Finite };
  sensitivity: { base: Finite; rows: SensitivityRow[] }; costsSha256: Hash; outcomesSha256: Hash;
  numericalPolicy: 'guarded-finite-intermediates-v1' };
export type NumericalPath = `raw.values.${Row}.${Part}` | 'raw.discount'
  | `sample.${Row}.${'u' | 'span' | 'mode-low' | 'high-mode' | 'split' | 'left-scale' | 'left-product' | 'right-weight' | 'right-scale' | 'right-product' | 'root' | 'result'}`
  | `discount.${'base' | 'v' | 'power' | 'numerator' | 'denominator' | 'duration'}`
  | `outcome.${'people-works' | 'effect' | 'duration' | 'counterfactual' | 'result'}` | 'cost.ratio'
  | `quantile.${'costs' | 'outcomes'}.${'difference' | 'fractional-product' | 'result'}`
  | `sensitivity.${Row}.swing`;
export type NumericalContext = { kind: 'normalization' } | { kind: 'draw'; index: number }
  | { kind: 'likely' } | { kind: 'sensitivity'; row: Row; endpoint: 'low' | 'high' | 'swing' }
  | { kind: 'quantile'; series: 'costs' | 'outcomes'; q: 0.05 | 0.5 | 0.95 };
export type NumericalIssue = { code: 'numeric-underflow' | 'numeric-overflow' | 'numeric-domain';
  phase: 'normalize' | 'sample' | 'discount' | 'outcome' | 'cost' | 'quantile' | 'sensitivity';
  path: NumericalPath; context: NumericalContext };
export type GoldenCase = { kind: 'run'; id: Id; input: Input; raw: Raw | null;
  expected: Omit<RecordedRun, 'inputHash'> } | { kind: 'refusal'; id: Id; raw: Raw | null;
  input: Input | null; issue: NumericalIssue };
export type GoldenVectors = { format: 'charitology-model-golden'; version: 1; cases: GoldenCase[] };
export type PointBasis = { kind: 'user-assumption' | 'source-informed'; sourceIds: Id[]; rationale: string };
export type Basis = Six<{ low: PointBasis; likely: PointBasis; high: PointBasis }> & { discount: PointBasis };
export type LocalChecksum = { kind: 'local-bytes'; sha256: Hash; byteLength: number; hashedAt: Instant };
export type SourceDescription = { id: Id; title: string; publisher: string | null; url: string | null;
  locator: string | null; published: PartialDate | null; accessedOn: Day | null;
  access: 'public' | 'restricted' | 'not-shared' | 'unknown'; license: string | null; note: string;
  checksum: null | { kind: 'declared'; sha256: Hash } | LocalChecksum };
export type SourceModel = { sourceId: Id; artifactSha256: Hash; interpretation: string };
export type Content = { enginePin: EnginePin; classification: 'illustrative' | 'user-authored';
  title: string; purpose: string; programDescription: string;
  population: { description: string; geography: string | null; eligibility: string; timeHorizon: string };
  period: { label: string; from: PartialDate | null; to: PartialDate | null };
  outcome: { name: string; definition: string; measurement: string; scope: 'one-outcome' };
  money: { currency: 'USD'; priceYear: number | null; basis: 'nominal' | 'constant-price' | 'unknown';
    inclusions: string; exclusions: string; adjustment: string | null };
  assumptions: { independence: string; chanceAsScale: string; counterfactual: string;
    discountRationale: string; harmsAndSpillovers: string; sourceDepthLimit: string; other: string };
  sources: SourceDescription[]; sourceModel: SourceModel | null; raw: Raw; input: Input;
  basis: Basis; run: RecordedRun; limitations: string[] };
export type RunFingerprint = { inputHash: Hash; runHash: Hash; costsSha256: Hash; outcomesSha256: Hash };
export type RunField = 'inputHash' | 'draws' | 'seed' | 'none' | 'cost' | 'outcome' | 'likely'
  | 'sensitivity' | 'costsSha256' | 'outcomesSha256' | 'numericalPolicy';
export type CopyObservation = { kind: 'matched' | 'mismatched'; declared: RunFingerprint;
  recalculated: RunFingerprint; differences: RunField[] }
  | { kind: 'arithmetic-refusal'; declared: RunFingerprint; recalculated: null; differences: [];
    issue: NumericalIssue };
export type Origin = null | { kind: 'selected-bundle-copy'; sourceVersionId: Id; sourceVersionHash: Hash;
  sourceContentHash: Hash; chosenFileSha256: Hash; observation: CopyObservation }
  | { kind: 'local-version-copy'; sourceModelId: Id; sourceVersionId: Id;
    sourceVersionHash: Hash; sourceContentHash: Hash };
export type FrozenVersion = { id: Id; modelId: Id; sequence: number; previous: Head | null;
  recordedAt: Instant; amendmentReason: string | null; origin: Origin; content: Content;
  contentHash: Hash; hash: Hash };
export type SelectedBundle = { format: 'charitology-cost-effectiveness-bundle'; schemaVersion: 1;
  exportedAt: Instant; label: 'User-entered model; not measured or independently reviewed.';
  engine: KnownEngine; modelVersion: FrozenVersion;
  omissions: ['Other versions, unrelated models and unfinished private writing are excluded.']; checksum: Hash };
export type ImportReceipt = { sourceVersionId: Id; sourceVersionHash: Hash; sourceContentHash: Hash;
  chosenFileSha256: Hash; localModelId: Id; localVersionId: Id };
export type TextForm = { classification: string; title: string; purpose: string; programDescription: string;
  populationDescription: string; populationGeography: string; populationEligibility: string;
  populationTimeHorizon: string; periodLabel: string; periodFrom: string; periodTo: string;
  outcomeName: string; outcomeDefinition: string; outcomeMeasurement: string; moneyPriceYear: string;
  moneyBasis: string; moneyInclusions: string; moneyExclusions: string; moneyAdjustment: string;
  independence: string; chanceAsScale: string; counterfactual: string; discountRationale: string;
  harmsAndSpillovers: string; sourceDepthLimit: string; other: string; amendmentReason: string };
export type JsonForm = { sources: string; sourceModel: string; costBasis: string; peopleBasis: string;
  worksBasis: string; effectBasis: string; yearsBasis: string; anywayBasis: string; discountBasis: string };
export type EditorForm = { raw: Raw; text: TextForm; json: JsonForm };
export type Draft = { mode: 'new' | 'amend' | 'copy'; modelId: Id | null; expectedHead: Head | null;
  origin: Origin; form: EditorForm; dirty: boolean };
export type State = { format: 'charitology-model-bundles'; schemaVersion: 1; id: Id; revision: number;
  createdAt: Instant; updatedAt: Instant; engines: KnownEngine[];
  models: { id: Id; title: string; currentVersionId: Id }[]; versions: FrozenVersion[];
  imports: ImportReceipt[]; draft: Draft };
export type FullBackup = { format: 'charitology-model-bundles-backup'; schemaVersion: 1;
  exportedAt: Instant; state: State; checksum: Hash };
declare const handleBrand: unique symbol;
export type Opaque<T extends string> = { readonly [handleBrand]: T };
export type AdmittedSelected = Opaque<'selected'>;
export type AdmittedBackup = Opaque<'backup'>;
export type ComparisonOutcome = Opaque<'comparison-outcome'>;
export type Prepared = Opaque<'prepared'>;
export type UndoHandle = Opaque<'undo'>;
export type SourceChecksumHandle = Opaque<'source-checksum'>;
export type OwnedJob = { epoch: number; formGeneration: number; storeGeneration: number;
  isCurrent: () => boolean; signal: AbortSignal };
export type OwnedContext = { job: OwnedJob; now: Instant; newModelId: Id | null; newVersionId: Id | null;
  sourceChecksums: ReadonlyMap<Id, SourceChecksumHandle> };
export type Inspection = { bundle: SelectedBundle; chosenFileSha256: Hash; reproduction: 'not-checked-here' };
export type Command = { kind: 'save-draft'; draft: Draft } | { kind: 'freeze'; draft: Draft }
  | { kind: 'new-draft'; discardCurrentDraft: true }
  | { kind: 'amend-draft'; sourceModelId: Id; source: Head; discardCurrentDraft: true }
  | { kind: 'copy-reproduced'; selected: AdmittedSelected; comparison: ComparisonOutcome }
  | { kind: 'copy-selected-draft'; selected: AdmittedSelected; comparison: ComparisonOutcome;
    purpose: 'comparison-mismatch-or-refusal' | 'intentional-new-branch';
    acknowledge: 'Copy inputs to a new draft without a reproduction claim.' }
  | { kind: 'copy-local-draft'; sourceModelId: Id; source: Head }
  | { kind: 'restore'; backup: AdmittedBackup; discardLocal: true }
  | { kind: 'clear'; discardLocal: true } | { kind: 'undo'; undo: UndoHandle };
export type Review = { operation: Command['kind']; reviewHash: Hash; beforeStateHash: Hash;
  candidateStateHash: Hash | null; candidateBackupBytes: number; candidate: State | null;
  createdVersion: Head | null; chosenFileSha256: Hash | null;
  notice: 'Only this exact reviewed local command is authorized.' };
export type StoreSnapshot = { generation: number; memory: State;
  persistence: 'absent' | 'saved' | 'corrupt' | 'unavailable' | 'conflict'; pending: 'none' | 'retry';
  savedSha256: Hash | null; message: string;
  capabilities: { canCalculate: boolean; canPersist: boolean; canReadNative: boolean } };
export type StoreCode = 'stale' | 'foreign-save' | 'unavailable' | 'quota' | 'invalid' | 'unsupported';
export type CommitResult = { kind: 'saved' | 'removed' | 'noop'; snapshot: StoreSnapshot }
  | { kind: 'unconfirmed'; candidateStateHash: Hash; retryAvailable: true; snapshot: StoreSnapshot }
  | { kind: 'refused'; code: StoreCode; message: string; snapshot: StoreSnapshot };
export interface ModelBundlePureAPI {
  admitSelected(bytes: Uint8Array): Promise<AdmittedSelected>;
  inspectSelected(value: AdmittedSelected): Readonly<Inspection>;
  recalculate(value: AdmittedSelected, owned: OwnedJob): Promise<ComparisonOutcome>;
  inspectComparison(value: ComparisonOutcome): Readonly<CopyObservation>;
  prepareCommand(state: State, command: Command, context: OwnedContext): Promise<Prepared>;
  makeSelected(state: State, versionId: Id, exportedAt: Instant): Promise<Uint8Array>;
  makeBackup(state: State, exportedAt: Instant): Promise<Uint8Array>;
  admitBackup(bytes: Uint8Array): Promise<AdmittedBackup>;
  parseBackup(bytes: Uint8Array): Promise<State>;
  makeDraws(result: ComparisonOutcome): Promise<Uint8Array>;
  makeProposal(selected: AdmittedSelected): Promise<Uint8Array>;
}
export interface ModelBundleSession {
  snapshot(): StoreSnapshot;
  preview(command: Command): Promise<{ review: Review; handle: Prepared }>;
  commit(handle: Prepared): Promise<CommitResult>;
  retry(): Promise<CommitResult>;
  reload(options: { discardLocal: true }): Promise<StoreSnapshot>;
  rereadStatus(): Promise<StoreSnapshot>;
  rawSavedRecovery(): Promise<Uint8Array | null>;
  undo(): UndoHandle | null;
  dispose(): void;
}
export type LegacyCalculatorRaw = Omit<Raw, 'parser'>;
export type LegacyCalculatorJob = { epoch: number; formGeneration: number; isCurrent: () => boolean; signal: AbortSignal };
export type LegacyField = Row | 'discount' | 'seed';
export type LegacySummary = { median: number; p5: number; p95: number };
export type LegacyRunProjection = { draws: 5000; seed: number; costs: Float64Array; outcomes: Float64Array;
  cost: LegacySummary; outcome: LegacySummary; none: number };
export type LegacySensitivityProjection = { base: number; rows: { key: Row; atLow: number; atHigh: number;
  lo: number; hi: number; swing: number }[] };
export type LegacyCalculation = { kind: 'success'; raw: LegacyCalculatorRaw; enginePin: EnginePin;
  input: Input; recorded: RecordedRun; model: Six<Triple<number>> & { discount: number };
  run: LegacyRunProjection; sensitivity: LegacySensitivityProjection; unit: string }
  | { kind: 'invalid'; errors: Partial<Record<LegacyField, string>> }
  | { kind: 'refused'; issue: NumericalIssue } | { kind: 'cancelled' };
export type LegacyBin = { x0: number; x1: number; count: number };
export type LegacyHistogram = { kind: 'available'; bins: LegacyBin[]; below: number; above: number }
  | { kind: 'unavailable'; reason: 'no-finite-cost-draws' | 'numeric-display-range' };
export interface LegacyCalculatorAPI {
  calculate(raw: LegacyCalculatorRaw, job: LegacyCalculatorJob): Promise<LegacyCalculation>;
  histogram(run: LegacyRunProjection): LegacyHistogram;
  formatMoney(value: number): string; formatNumber(value: number): string;
  formatMoneyTick(value: number, step: number): string;
}
export type CalculatorCopySnapshot = { raw: LegacyCalculatorRaw; formGeneration: number };
export interface CalculatorCopyProvider { capture(): Readonly<CalculatorCopySnapshot>; isCurrent(formGeneration: number): boolean }
