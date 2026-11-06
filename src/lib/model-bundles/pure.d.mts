import type { ModelBundlePureAPI, Prepared, Review, State, UndoHandle, SourceChecksumHandle, LocalChecksum, Id, Instant, OwnedJob } from './types.js';
import type { ModelWorkerPlatform } from './worker-client.mjs';
import type { ModelPayloadCoordinator, ModelPayloadLease } from './payload-lane.mjs';
export type PreparedBindings = { beforeStateHash: string; formGeneration: number; storeGeneration: number };
export type ConsumedPrepared = Readonly<{ review: Review; candidate: State | null; noop: boolean }>;
/** Trusted session capability. Keep this object in session closure; no method is selected by imported data. */
export interface PureSessionBridge {
  readonly api: ModelBundlePureAPI;
  readonly payload: ModelPayloadCoordinator;
  admitFile(lease: ModelPayloadLease, operation: {kind: 'selected' | 'backup'} | {kind: 'checksum'; sourceId: Id; hashedAt: Instant},
    bytes: Uint8Array, job: OwnedJob): Promise<import('./types.js').AdmittedSelected | import('./types.js').AdmittedBackup | SourceChecksumHandle>;
  inspectPrepared(handle: Prepared): Readonly<Review>;
  consumePrepared(handle: Prepared, bindings: PreparedBindings): ConsumedPrepared;
  registerUndo(prior: State | null, bindings: PreparedBindings): UndoHandle;
  hashSourceFile(sourceId: Id, bytes: Uint8Array, hashedAt: Instant, job: OwnedJob): Promise<SourceChecksumHandle>;
  inspectSourceChecksum(handle: SourceChecksumHandle): Readonly<LocalChecksum>;
  revokeSourceChecksum(sourceId: Id): void;
  cancelCalculations(): void;
  revokeSelections(): void;
  invalidate(): void;
  dispose(): void;
}
export function createPureSessionBridge(): PureSessionBridge;
export function createPureSessionBridgeForTesting(platform: ModelWorkerPlatform): PureSessionBridge;
