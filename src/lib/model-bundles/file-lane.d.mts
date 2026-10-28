import type { AdmittedSelected, AdmittedBackup, SourceChecksumHandle, LocalChecksum, Inspection, Id, Instant, OwnedJob } from './types.js';
import type { PureSessionBridge } from './pure.mjs';
export type ModelFileBridge = Pick<PureSessionBridge, 'api' | 'payload' | 'admitFile' | 'hashSourceFile' | 'inspectSourceChecksum' | 'revokeSourceChecksum' | 'revokeSelections'>;
export type ModelFileOperation = { kind: 'selected' } | { kind: 'backup' } | { kind: 'checksum'; sourceId: Id; hashedAt: Instant };
export type ModelFileResult = { kind: 'selected'; handle: AdmittedSelected; inspection: Readonly<Inspection> }
  | { kind: 'backup'; handle: AdmittedBackup }
  | { kind: 'checksum'; sourceId: Id; handle: SourceChecksumHandle; checksum: Readonly<LocalChecksum> }
  | { kind: 'cancelled' }
  | { kind: 'refused'; code: 'invalid-request' | 'invalid-job' | 'invalid-file' | 'file-size' | 'unavailable' | 'read-failed' | 'byte-mismatch' | 'timeout' | 'invalid-data'; message: string };
export interface ModelFileLane {
  /** Captures the one File synchronously; caller then clears its chooser value. Every call revokes older file/worker authority. */
  choose(files: FileList | readonly File[] | null, operation: ModelFileOperation, job: OwnedJob): Promise<ModelFileResult>;
  /** Use for native cancel, explicit Cancel, recovery entry and foreign saved-byte notices. */
  revoke(): void;
  dispose(): void;
  snapshot(): Readonly<{ pending: boolean; reading: boolean; payloadBusy: boolean; queued: boolean }>;
}
export type ModelFilePlatform = { createReader(): FileReader | null; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
export function createModelFileLane(bridge: ModelFileBridge): ModelFileLane;
/** Controls native Reader/timer scheduling only; no admission/hash callback substitution. */
export function createModelFileLaneForTesting(bridge: ModelFileBridge, platform: ModelFilePlatform): ModelFileLane;
