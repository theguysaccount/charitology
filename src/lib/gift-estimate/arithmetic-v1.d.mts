export const METHOD_ID: 'gift-credit-from-matched-cpo-v1';
export const DRAW_COUNT: 5000;
export class GiftArithmeticError extends Error { readonly code: string; }
export type GiftSummary = Readonly<{draws: 5000; sourceNoOutcomeDraws: number; p5: number; median: number; p95: number}>;
export function deriveGiftCredit(costDraws: unknown[], mappedCents: number, donorCreditBasisPoints: number): Readonly<{values: readonly number[]; summary: GiftSummary}>;
export function encodeDerivedValues(values: readonly number[]): Uint8Array;
