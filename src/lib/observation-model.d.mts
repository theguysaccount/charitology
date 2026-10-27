export {
  OBSERVATION_LIMITS,
  observationDecimalFromLexeme,
  observationScaledDecimal,
  observationDecimalText,
  validateObservationFiles,
  observationFactualClosure,
  observationProjection,
  coverageProjection,
  compareOrganizations,
  observationExport,
  observationHistoryExport,
  legacyCountriesProjection,
} from "./observation-types";
import type { ValidatedObservationRegistry } from "./observation-types";
export declare class ObservationError extends Error {
  readonly code: string;
  readonly path: string;
}
export declare function observationFail(
  code: string,
  message: string,
  path?: string,
): never;
export declare function canonicalObservationJson(value: unknown): string;
export declare function observationObjectHash(value: unknown): string;
export declare function observationRawHash(value: string | Uint8Array): string;
export declare function observationPrettyJson(value: unknown): string;
export declare function strictObservationJson(
  raw: string | Uint8Array,
  maxBytes?: number,
): unknown;
export declare function observationJsonTokens(
  raw: string | Uint8Array,
  maxBytes?: number,
): { value: unknown; tokens: ReadonlyMap<string, string> };
export declare function observationFileTexts(
  input: ValidatedObservationRegistry,
): Readonly<Record<string, string>>;
