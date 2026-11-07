import type { FundingSource, FundingSourceCode } from "./model.mjs";
export const FUNDING_SOURCE_PINS: Readonly<{ datasetId: string; packageName: string; resourceId: string; csvBytes: number; csvSha256: string; metadataSha256: string }>;
export const FUNDING_CODE_PATHS: readonly string[];
export const FUNDING_ATTRIBUTION: string;
export const FUNDING_DOCUMENTATION: readonly string[];
export const FUNDING_LICENSE_SUMMARY: string;
export function fundingSourceMetadata(metadata: Uint8Array, receipt: unknown, csv: Uint8Array): FundingSource;
export function validateFundingSourceMetadata(source: unknown): FundingSource;
export function validateFundingSourceCode(code: unknown): FundingSourceCode;
