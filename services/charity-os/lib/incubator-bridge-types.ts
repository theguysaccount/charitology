/** Inert v1 wire types; current permissions and database times are not transferable. */
export type IncubatorId = string;
export type IncubatorHash = string;
export type IncubatorInstant = string;
export type IncubatorOperation = 'copy' | 'refresh-copy' | 'adopt';
export interface IncubatorSelection { readonly projectId: IncubatorId; readonly milestoneId: IncubatorId }
export interface IncubatorSourcePin { readonly originOrgId: IncubatorId; readonly bindingId: IncubatorId; readonly sourceVersion: number; readonly sha256: IncubatorHash }
export interface IncubatorHeadPin { readonly originOrgId: IncubatorId; readonly bindingId: IncubatorId; readonly sequence: number; readonly sha256: IncubatorHash }
export interface IncubatorProgramPin { readonly recordId: IncubatorId; readonly revision: number; readonly dataSha256: IncubatorHash }
export interface IncubatorNativeRow<T> { readonly id: IncubatorId; readonly values: Readonly<T> }
export interface IncubatorSelectedNative {
  readonly version: 1; readonly program: 'charity-incubator'; readonly updated: string;
  readonly context: Readonly<Record<'name' | 'scope' | 'period' | 'authority' | 'privacy', string>>;
  readonly project: IncubatorNativeRow<Record<'title' | 'gap' | 'model' | 'status' | 'roles' | 'governance' | 'date', string>>;
  readonly milestone: IncubatorNativeRow<Record<'title' | 'project' | 'acceptance' | 'owner' | 'date' | 'status' | 'next', string>>;
}
export interface IncubatorSourceCapture {
  readonly format: 'charitology-incubator-source'; readonly version: 1; readonly adapter: 'incubator-project-milestone-native-v1'; readonly registrySha256: IncubatorHash;
  readonly originOrgId: IncubatorId; readonly bindingId: IncubatorId; readonly sourceVersion: number; readonly previousNativeSource: IncubatorSourcePin | null; readonly preparedAt: IncubatorInstant;
  readonly originalBytes: number; readonly originalSha256: IncubatorHash; readonly selection: IncubatorSelection; readonly selected: IncubatorSelectedNative; readonly sha256: IncubatorHash;
}
export interface IncubatorMapping {
  readonly project: Readonly<{ title: string; deliverable: string | null }>;
  readonly milestone: Readonly<{ title: string; deliverable: string | null }>;
  readonly relationship: Readonly<{ kind: 'milestone-of-selected-project'; confirmed: true; reason: string }>;
}
export interface IncubatorProjectData {
  readonly title: string; readonly kind: 'project'; readonly programId: IncubatorId; readonly projectId: null; readonly dependencyIds: readonly [];
  readonly deliverable: string | null; readonly dueAt: null; readonly timeZone: null; readonly effortMinutes: null; readonly priority: 'normal'; readonly recurrence: 'none';
}
export interface IncubatorMilestoneData extends Omit<IncubatorProjectData, 'kind' | 'projectId'> { readonly kind: 'milestone'; readonly projectId: IncubatorId }
export interface IncubatorCandidate<T extends IncubatorProjectData | IncubatorMilestoneData = IncubatorProjectData | IncubatorMilestoneData> {
  readonly id: IncubatorId; readonly moduleId: 'projects'; readonly data: T; readonly status: 'planned'; readonly ownerId: IncubatorId; readonly revision: 1;
  readonly approval: null; readonly snapshot: null; readonly source: null; readonly lastEditedBy: IncubatorId;
}
export interface IncubatorCopyEvent {
  readonly format: 'charitology-incubator-event'; readonly version: 1; readonly method: 'incubator-project-milestone-v1'; readonly originOrgId: IncubatorId; readonly bindingId: IncubatorId;
  readonly sequence: number; readonly previous: IncubatorHeadPin | null; readonly preparedAt: IncubatorInstant; readonly actorId: IncubatorId; readonly program: IncubatorProgramPin;
  readonly operation: IncubatorOperation; readonly source: IncubatorSourcePin; readonly recoveredHead: IncubatorHeadPin | null; readonly mapping: IncubatorMapping;
  readonly candidates: readonly [IncubatorCandidate<IncubatorProjectData>, IncubatorCandidate<IncubatorMilestoneData>]; readonly sha256: IncubatorHash;
}
export interface IncubatorCreatedDescriptor { readonly id: IncubatorId; readonly moduleId: 'projects'; readonly revision: 1; readonly status: 'planned'; readonly dataSha256: IncubatorHash }
export interface IncubatorStoredCommitResult { readonly created: readonly [IncubatorCreatedDescriptor, IncubatorCreatedDescriptor]; readonly head: IncubatorHeadPin; readonly acceptedAt: IncubatorInstant }
export interface IncubatorReceipt {
  readonly format: 'charitology-incubator-receipt'; readonly version: 1; readonly operation: IncubatorOperation; readonly commandHash: IncubatorHash; readonly requestHash: IncubatorHash;
  readonly actorBindingHash: IncubatorHash; readonly actorId: IncubatorId; readonly sessionSha256: IncubatorHash; readonly membershipSha256: IncubatorHash; readonly memberCreatedAtExact: IncubatorInstant;
  readonly restoreEpochSha256: IncubatorHash; readonly previewId: IncubatorId; readonly reviewSha256: IncubatorHash; readonly result: IncubatorStoredCommitResult;
}
export interface IncubatorEventEntry { readonly event: IncubatorCopyEvent; readonly originMode: 'live' | 'recovered'; readonly acceptedReceipt: IncubatorReceipt | null }
export interface IncubatorBackup { readonly format: 'charitology-incubator-bridge-backup'; readonly version: 1; readonly method: 'incubator-project-milestone-v1'; readonly registrySha256: IncubatorHash; readonly sources: readonly IncubatorSourceCapture[]; readonly events: readonly IncubatorEventEntry[] }
