export class LearningError extends Error {
  constructor(code: string, message: string, field?: string, status?: number);
  code: string;
  status: number;
  issues?: { field: string; message: string }[];
}
export function learningFail(
  code: string,
  message?: string,
  field?: string,
  status?: number,
): never;
export function learningRepresentable(value: string): boolean;
export function learningCanonical(
  value: unknown,
  options?: { nativeStrings?: boolean; maxBytes?: number },
): string;
export function learningFreeze<T>(value: T): T;
export function learningOwned<T>(
  value: T,
  options?: { bytes?: number; nativeStrings?: boolean },
): T;
export function learningBytes(raw: unknown, maxBytes: number): Uint8Array;
export function parseLearningTransport(
  raw: string | Uint8Array,
  maxBytes: number,
  options?: { nativeStrings?: boolean },
): unknown;
