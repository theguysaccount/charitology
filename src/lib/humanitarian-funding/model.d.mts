export type FundingField = "countryCode" | "id" | "name" | "code" | "typeId" | "typeName" | "startDate" | "endDate" | "year" | "requirements" | "funding" | "percentFunded";
export type FundingRaw = Record<FundingField, string>;
export interface FundingLicense { id: string; title: string; url: string }
export interface FundingSource {
  publisher: string; title: string; datasetId: string; datasetUrl: string;
  resourceId: string; resourceUrl: string; resourceFilename: string;
  resourceModified: string; metadataModified: string; publisherDateRange: string;
  publisherHashLiteral: string; publisherHashAlgorithm: string; metadataSha256: string;
  csvBytes: number; csvSha256: string; httpDate: string; asOf: string; evidenceUrl: string;
  attribution: string; license: FundingLicense; documentation: string[]; interpretation: string;
}
export interface FundingSourceCode { format: "charitology-funding-source-code"; version: 1; commit: string; files: {path: string; bytes: number; sha256: string}[] }
export interface FundingCoverage { status: "comparable" | "both-missing" | "requirements-missing" | "funding-missing" | "zero-requirements"; numerator: string | null; denominator: string | null; displayPercent: string | null }
export interface FundingLocator { recordNumber: number; firstLine: number; lastLine: number; byteStart: number; byteEnd: number; rawSha256: string }
export interface FundingRow { key: string; raw: FundingRaw; locator: FundingLocator; coverage: FundingCoverage }
export interface FundingSummary { rows: number; countryCodes: number; identifiedPlanCountryRows: number; missingFundingRows: number; explicitZeroFundingRows: number; comparableRows: number }
export interface ParsedFundingCsv { sourceBytes: number; sourceSha256: string; totalRecords: number; rows: FundingRow[] }
export interface FundingEdition { format: "charitology-humanitarian-funding-edition"; version: 1; referenceYear: string; review: "draft"; units: string; source: FundingSource; sourceCode: FundingSourceCode; headers: FundingField[]; sourceRecordCount: number; summary: FundingSummary; modification: string; limitations: string[]; rows: FundingRow[]; sha256: string }
export interface FundingSourceEnvelope { format: "charitology-humanitarian-funding-source"; version: 1; source: FundingSource; sourceCode: FundingSourceCode; csvUtf8: string; modification: string; sha256: string }
export interface FundingFilter { search?: string; country?: string; type?: string }
export const FUNDING_HEADERS: readonly FundingField[];
export const FUNDING_LICENSE: Readonly<FundingLicense>;
export const FUNDING_LIMITATIONS: readonly string[];
export const FUNDING_LIMITS: Readonly<{ bytes: number; records: number; field: number; editionBytes: number }>;
export const FUNDING_MODIFICATION: string;
export const FUNDING_CSV_TEXT_POLICY: string;
export function fundingSha256(input: string | Uint8Array): string;
export function fundingCanonical(value: unknown): string;
export function fundingObjectHash(value: unknown): string;
export function fundingDecimal(raw: string, options?: { signed?: boolean }): { coefficient: bigint; scale: number } | null;
export function fundingCoverage(requirements: string, funding: string): FundingCoverage;
export function fundingUsd(raw: string): string;
export function parseFundingCsv(bytes: Uint8Array): ParsedFundingCsv;
export function fundingSummary(rows: FundingRow[]): FundingSummary;
export function makeFundingEdition(parsed: ParsedFundingCsv, source: FundingSource, code: FundingSourceCode, year?: string): FundingEdition;
export function makeFundingSource(csvUtf8: string, source: FundingSource, code: FundingSourceCode): FundingSourceEnvelope;
export function validateFundingProjection(value: unknown): FundingEdition;
export function validateFundingEdition(edition: unknown, source: unknown): FundingEdition;
export function selectFundingRows(edition: FundingEdition, filter?: FundingFilter): FundingRow[];
export function fundingSelectionJson(edition: FundingEdition, rows: FundingRow[], selection: unknown): string;
export function fundingSelectionCsv(edition: FundingEdition, rows: FundingRow[], selection: unknown): string;
