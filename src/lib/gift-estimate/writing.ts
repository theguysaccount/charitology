import {copyD1Plain, canonicalD1Json} from '../client/donor-recovery-schemas';
import {strictD1Json} from '../client/donor-recovery-formats';
import {validateInstant} from '../model-bundles/content.mjs';
import {ESTIMATE_LIMITS, GiftEstimateError} from './model';

export const WRITING_KEYS = ['mappedAmount', 'donorCreditPercent', 'giftMoneyBasis', 'moneyRationale', 'applicability',
  'linearFundingRationale', 'donorCreditRationale', 'exclusions'] as const;
export type EstimateWriting = Record<(typeof WRITING_KEYS)[number], string>;
const fail = (): never => { throw new GiftEstimateError('writing-format'); };
export function copyEstimateWriting(input: unknown): EstimateWriting {
  const value = copyD1Plain(input, ESTIMATE_LIMITS.recovery) as Record<string, unknown>;
  if (!value || Array.isArray(value) || Object.keys(value).length !== WRITING_KEYS.length ||
    WRITING_KEYS.some(key => !Object.hasOwn(value, key) || typeof value[key] !== 'string')) fail();
  return Object.freeze(value) as EstimateWriting;
}
export function makeEstimateWriting(input: unknown, exportedAt: string): Uint8Array {
  validateInstant(exportedAt);
  const writing = copyEstimateWriting(input), body = {format: 'charitology-gift-estimate-writing', version: 1, exportedAt,
    notice: 'Unfinished writing only. Choose original source files and reproduce the model again. No current estimate is saved here.', writing};
  const bytes = new TextEncoder().encode(JSON.stringify(body, null, 2) + '\n');
  if (bytes.length > ESTIMATE_LIMITS.recovery) throw new GiftEstimateError('byte-limit'); return bytes;
}
export function parseEstimateWriting(bytes: Uint8Array): EstimateWriting {
  if (!bytes || Object.getPrototypeOf(bytes) !== Uint8Array.prototype || bytes.byteLength > ESTIMATE_LIMITS.recovery) throw new GiftEstimateError('byte-limit');
  const value = strictD1Json(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes), ESTIMATE_LIMITS.recovery) as Record<string, unknown>;
  const expected = ['format', 'version', 'exportedAt', 'notice', 'writing'];
  if (!value || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key)) ||
    value.format !== 'charitology-gift-estimate-writing' || value.version !== 1 ||
    value.notice !== 'Unfinished writing only. Choose original source files and reproduce the model again. No current estimate is saved here.') fail();
  validateInstant(value.exportedAt); return copyEstimateWriting(value.writing);
}
export const sameEstimateWriting = (a: EstimateWriting, b: EstimateWriting): boolean => canonicalD1Json(a) === canonicalD1Json(b);
