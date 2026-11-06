import type { Input, LegacyCalculatorRaw, LegacyCalculatorJob, OwnedJob, EnginePin, RecordedRun, LegacyField, NumericalIssue } from './types.js';
import type { ModelPayloadCoordinator, ModelPayloadLease } from './payload-lane.mjs';
export type ModelWorkerRequest = { kind: 'legacy-run'; raw: LegacyCalculatorRaw } | { kind: 'normalized-run'; input: Input };
export type ModelWorkerOutcome = { kind: 'success'; enginePin: EnginePin; input: Input; recorded: RecordedRun; costs: Float64Array; outcomes: Float64Array }
  | { kind: 'invalid'; errors: Partial<Record<LegacyField, string>> } | { kind: 'refused'; issue: NumericalIssue } | { kind: 'cancelled' };
export interface ModelWorker { addEventListener(type: string, fn: (event: any) => void): void;
  removeEventListener(type: string, fn: (event: any) => void): void; postMessage(value: unknown): void; terminate(): void; }
export type ModelWorkerPlatform = { createWorker(): ModelWorker; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
export interface ModelWorkerClient { run(request: ModelWorkerRequest, job: LegacyCalculatorJob | OwnedJob): Promise<ModelWorkerOutcome>; cancel(): void; dispose(): void; }
export class ModelWorkerError extends Error { readonly code: 'timeout' | 'unavailable' | 'protocol'; }
export function createModelWorkerClient(): ModelWorkerClient;
export function createModelWorkerClientForTesting(platform: ModelWorkerPlatform): ModelWorkerClient;
export function createModelWorkerClientForPayload(payload: ModelPayloadCoordinator, platform?: ModelWorkerPlatform): ModelWorkerClient & {
  runWithin(lease: ModelPayloadLease, request: ModelWorkerRequest, job: LegacyCalculatorJob | OwnedJob): Promise<ModelWorkerOutcome>;
};
