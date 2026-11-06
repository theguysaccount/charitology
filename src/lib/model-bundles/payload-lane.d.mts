declare const payloadLease: unique symbol;
declare const payloadCancelled: unique symbol;
export type ModelPayloadLease = { readonly [payloadLease]: true };
export type PayloadCancelled = { readonly [payloadCancelled]: true };
export interface ModelPayloadCoordinator {
  run<T>(current: () => boolean, work: (lease: ModelPayloadLease) => Promise<T>, lease?: ModelPayloadLease): Promise<T | PayloadCancelled>;
  isCancelled(value: unknown): value is PayloadCancelled;
  snapshot(): Readonly<{ busy: boolean; queued: boolean }>;
}
export function createModelPayloadCoordinator(): ModelPayloadCoordinator;
export function assertModelPayloadCoordinator(value: unknown): ModelPayloadCoordinator;
