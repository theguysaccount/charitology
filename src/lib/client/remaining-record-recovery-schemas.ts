/** Frozen native v1 definitions for exactly twenty existing local records. */
import type { ResearchState } from "./research-programs";
import type { ProgramState } from "./program-workspaces";
import type { DepthSample, Nomination } from "./completion-models";
import { PROGRAM_GRAPH_ADAPTERS } from "../../data/program-graph-adapters";
export type RRResearchProgram =
  | "moral-frameworks-program"
  | "methods-lab"
  | "cause-census"
  | "evidence-reviews"
  | "replication-program"
  | "failure-lab"
  | "history-of-charity";
export type RRPartnerProgram =
  | "the-charitology-fund"
  | "charity-incubator"
  | "question-bounties"
  | "the-charitology-prize"
  | "charitology-fellowship"
  | "charitology-summit"
  | "donor-advisory"
  | "nonprofit-advisory"
  | "field-verification";
export type RRResearchKey =
  `charitology.research-program.${RRResearchProgram}.v1`;
export type RRPartnerKey =
  `charitology.partner-workspace-v1.${RRPartnerProgram}`;
export type RROtherKey =
  | "charitology-manuscript-v1"
  | "charitology-nominations-v1"
  | "charitology-depth-census-v1"
  | "charitology-country-notes-v1";
export type RRKey = RRResearchKey | RRPartnerKey | RROtherKey;
export type RRManuscriptField =
  | "title"
  | "author"
  | "summary"
  | "kind"
  | "question"
  | "methods"
  | "results"
  | "limits"
  | "sources";
export type RRManuscript = Record<RRManuscriptField, string>;
export type RRCountryNotes = Record<
  string,
  { voices: string; institutions: string; gaps: string }
>;
export type RRValueMap = { [K in RRResearchKey]: ResearchState } & {
  [K in RRPartnerKey]: ProgramState;
} & {
  "charitology-manuscript-v1": RRManuscript;
  "charitology-nominations-v1": Nomination[];
  "charitology-depth-census-v1": DepthSample;
  "charitology-country-notes-v1": RRCountryNotes;
};
export type RRNative<K extends RRKey> = RRValueMap[K];
export type RRReadonly<T> = T extends readonly (infer E)[]
  ? readonly RRReadonly<E>[]
  : T extends object
    ? { readonly [P in keyof T]: RRReadonly<T[P]> }
    : T;
export type RRPartnerCollection =
  | "proposals"
  | "conflicts"
  | "allocations"
  | "ledger"
  | "readiness"
  | "gaps"
  | "projects"
  | "experiments"
  | "milestones"
  | "specifications"
  | "pledges"
  | "claims"
  | "decisions"
  | "criteria"
  | "nominations"
  | "deliberations"
  | "curriculum"
  | "reviews"
  | "sessions"
  | "roles"
  | "production"
  | "followup"
  | "questions"
  | "options"
  | "evidence"
  | "diagnostics"
  | "actions"
  | "learning"
  | "checks"
  | "findings"
  | "safeguards"
  | "responses";
export type RRFormId =
  | "draft"
  | "manuscript"
  | "nomination"
  | "activity"
  | "currency"
  | "context"
  | `collection:${RRPartnerCollection}`
  | `country:${string}`;
export interface RRRawForm {
  readonly form: RRFormId;
  readonly editingId: string | null;
  readonly values: Readonly<Record<string, string>>;
}
export interface RRFormArchive {
  readonly format: "charitology-remaining-record-forms";
  readonly version: 1;
  readonly key: RRKey;
  readonly exportedAt: string;
  readonly forms: readonly RRRawForm[];
}
export interface RRRawArchive {
  readonly format: "charitology-remaining-record-raw-copy";
  readonly version: 1;
  readonly key: RRKey;
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
export interface RRCapacity {
  readonly nativeBytes: number;
  readonly rawArchiveBytes: 128000000;
  readonly formArchiveBytes: 1000000;
  readonly jsonDepth: 32;
  readonly fileReadTimeoutMs: 30000;
  readonly autosaveDelayMs: 250;
}
export class RRDataError extends Error {
  readonly code: "invalid_data" | "input_limit";
  readonly path: string;
  constructor(
    message: string,
    path = "$",
    code: "invalid_data" | "input_limit" = "invalid_data",
  ) {
    super(`${message} (${path})`);
    this.name = "RRDataError";
    this.code = code;
    this.path = path;
  }
}
export function rrFail(message: string, path = "$"): never {
  throw new RRDataError(message, path);
}
export const RR_KEYS = Object.freeze([
  "charitology.research-program.moral-frameworks-program.v1",
  "charitology.research-program.methods-lab.v1",
  "charitology.research-program.cause-census.v1",
  "charitology.research-program.evidence-reviews.v1",
  "charitology.research-program.replication-program.v1",
  "charitology.research-program.failure-lab.v1",
  "charitology.research-program.history-of-charity.v1",
  "charitology-manuscript-v1",
  "charitology-nominations-v1",
  "charitology-depth-census-v1",
  "charitology-country-notes-v1",
  "charitology.partner-workspace-v1.the-charitology-fund",
  "charitology.partner-workspace-v1.charity-incubator",
  "charitology.partner-workspace-v1.question-bounties",
  "charitology.partner-workspace-v1.the-charitology-prize",
  "charitology.partner-workspace-v1.charitology-fellowship",
  "charitology.partner-workspace-v1.charitology-summit",
  "charitology.partner-workspace-v1.donor-advisory",
  "charitology.partner-workspace-v1.nonprofit-advisory",
  "charitology.partner-workspace-v1.field-verification",
] as const);
export function isRemainingRecordKey(key: unknown): key is RRKey {
  return (
    typeof key === "string" && (RR_KEYS as readonly string[]).includes(key)
  );
}
export function requireRemainingRecordKey(key: unknown): asserts key is RRKey {
  if (!isRemainingRecordKey(key)) rrFail("Unknown remaining-record key");
}
export function remainingRecordCapacity(key: RRKey): RRCapacity {
  requireRemainingRecordKey(key);
  const nativeBytes = key.startsWith("charitology.research-program.")
    ? 32000000
    : key.startsWith("charitology.partner-workspace-v1.")
      ? 8000000
      : key === "charitology-manuscript-v1"
        ? 1000000
        : key === "charitology-nominations-v1"
          ? 24000000
          : key === "charitology-depth-census-v1"
            ? 32000000
            : 48000000;
  return Object.freeze({
    nativeBytes,
    rawArchiveBytes: 128000000,
    formArchiveBytes: 1000000,
    jsonDepth: 32,
    fileReadTimeoutMs: 30000,
    autosaveDelayMs: 250,
  });
}
export interface RRFieldSpec {
  readonly key: string;
  readonly kind: "text" | "textarea" | "number" | "date" | "url" | "select";
  readonly required: boolean;
  readonly maxLength: number;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly value?: string;
}
export const RR_RESEARCH_SCHEMAS: RRReadonly<
  Record<RRResearchProgram, { freeze: boolean; fields: RRFieldSpec[] }>
> = freezeOwned({
  "moral-frameworks-program": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "first",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system",
        ],
      },
      {
        key: "second",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system",
        ],
      },
      {
        key: "weight_welfare",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_rights",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_justice",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_care",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_tradition",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_future",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_nature",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "weight_flourishing",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 5,
      },
      {
        key: "reasons",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "disagreement",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: false,
        maxLength: 8000,
      },
      {
        key: "correction",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
  "methods-lab": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "problem",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "unit",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "horizon",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "currency",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "method",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "cash",
          "advocacy",
          "research",
          "mutual-aid",
          "volunteering",
          "investing",
          "prizes",
        ],
      },
      {
        key: "chain",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "costLow",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
      },
      {
        key: "costHigh",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
      },
      {
        key: "probabilityLow",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 100,
      },
      {
        key: "probabilityHigh",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
        max: 100,
      },
      {
        key: "unitsLow",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
      },
      {
        key: "unitsHigh",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
      },
      {
        key: "assumptions",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: false,
        maxLength: 8000,
      },
      {
        key: "harm",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
  "cause-census": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "cause",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system",
        ],
      },
      {
        key: "scope",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "metric",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: ["scale", "spending", "solvability", "depth", "other"],
      },
      {
        key: "value",
        kind: "number",
        required: false,
        maxLength: 8000,
        min: 0,
      },
      {
        key: "unit",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "year",
        kind: "number",
        required: true,
        maxLength: 8000,
        min: 1900,
        max: 2200,
        integer: true,
      },
      {
        key: "uncertainty",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8000,
      },
      {
        key: "location",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "framework",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "depth",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
      {
        key: "check",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
  "evidence-reviews": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "population",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "intervention",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "outcome",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "search",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "inclusion",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "selection",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8000,
      },
      {
        key: "design",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "randomized",
          "quasi",
          "observational",
          "qualitative",
          "systematic",
          "other",
        ],
      },
      {
        key: "sample",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
      {
        key: "effect",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "bias",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "transfer",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
      {
        key: "conflicts",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
      {
        key: "synthesis",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
  "replication-program": {
    freeze: true,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8000,
      },
      {
        key: "claim",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "kind",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: ["reproduce", "reanalyse", "direct", "context"],
      },
      {
        key: "change",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "hypotheses",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "sample",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "outcome",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "estimand",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "analysis",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "missing",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "multiple",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "access",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "ethics",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "review",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "due",
        kind: "date",
        required: false,
        maxLength: 8000,
      },
      {
        key: "amendments",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
  "failure-lab": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8000,
      },
      {
        key: "intent",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "timeline",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "observed",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "counterfactual",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "mechanism",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "causal-chain",
          "implementation",
          "context",
          "incentives",
          "displacement",
          "measurement",
          "unknown",
        ],
      },
      {
        key: "confidence",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: ["hypothesis", "documented", "debated"],
      },
      {
        key: "lesson",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "action",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "owner",
        kind: "text",
        required: false,
        maxLength: 8000,
      },
      {
        key: "due",
        kind: "date",
        required: false,
        maxLength: 8000,
      },
      {
        key: "verification",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "result",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
  "history-of-charity": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8000,
      },
      {
        key: "first",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "carnegie-libraries",
          "dare",
          "green-revolution",
          "haiti-earthquake-reconstruction",
          "hookworm-campaign",
          "ice-bucket-challenge",
          "one-laptop-per-child",
          "oral-rehydration-therapy-spread",
          "playpumps",
          "polio-eradication",
          "rosenwald-schools",
          "scared-straight",
          "smallpox-eradication",
        ],
      },
      {
        key: "second",
        kind: "select",
        required: true,
        maxLength: 8000,
        options: [
          "carnegie-libraries",
          "dare",
          "green-revolution",
          "haiti-earthquake-reconstruction",
          "hookworm-campaign",
          "ice-bucket-challenge",
          "one-laptop-per-child",
          "oral-rehydration-therapy-spread",
          "playpumps",
          "polio-eradication",
          "rosenwald-schools",
          "scared-straight",
          "smallpox-eradication",
        ],
      },
      {
        key: "question",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8000,
      },
      {
        key: "similar",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "different",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "missing",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "lesson",
        kind: "textarea",
        required: true,
        maxLength: 8000,
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8000,
      },
    ],
  },
});
export const RR_COUNTRY_CODES = Object.freeze([
  "AFG",
  "ALB",
  "DZA",
  "ASM",
  "AND",
  "AGO",
  "ATG",
  "ARG",
  "ARM",
  "ABW",
  "AUS",
  "AUT",
  "AZE",
  "BHS",
  "BHR",
  "BGD",
  "BRB",
  "BLR",
  "BEL",
  "BLZ",
  "BEN",
  "BMU",
  "BTN",
  "BOL",
  "BIH",
  "BWA",
  "BRA",
  "VGB",
  "BRN",
  "BGR",
  "BFA",
  "BDI",
  "CPV",
  "KHM",
  "CMR",
  "CAN",
  "CYM",
  "CAF",
  "TCD",
  "CHI",
  "CHL",
  "CHN",
  "COL",
  "COM",
  "COD",
  "COG",
  "CRI",
  "CIV",
  "HRV",
  "CUB",
  "CUW",
  "CYP",
  "CZE",
  "DNK",
  "DJI",
  "DMA",
  "DOM",
  "ECU",
  "EGY",
  "SLV",
  "GNQ",
  "ERI",
  "EST",
  "SWZ",
  "ETH",
  "FRO",
  "FJI",
  "FIN",
  "FRA",
  "PYF",
  "GAB",
  "GMB",
  "GEO",
  "DEU",
  "GHA",
  "GIB",
  "GRC",
  "GRL",
  "GRD",
  "GUM",
  "GTM",
  "GIN",
  "GNB",
  "GUY",
  "HTI",
  "HND",
  "HKG",
  "HUN",
  "ISL",
  "IND",
  "IDN",
  "IRN",
  "IRQ",
  "IRL",
  "IMN",
  "ISR",
  "ITA",
  "JAM",
  "JPN",
  "JOR",
  "KAZ",
  "KEN",
  "KIR",
  "PRK",
  "KOR",
  "XKX",
  "KWT",
  "KGZ",
  "LAO",
  "LVA",
  "LBN",
  "LSO",
  "LBR",
  "LBY",
  "LIE",
  "LTU",
  "LUX",
  "MAC",
  "MDG",
  "MWI",
  "MYS",
  "MDV",
  "MLI",
  "MLT",
  "MHL",
  "MRT",
  "MUS",
  "MEX",
  "FSM",
  "MDA",
  "MCO",
  "MNG",
  "MNE",
  "MAR",
  "MOZ",
  "MMR",
  "NAM",
  "NRU",
  "NPL",
  "NLD",
  "NCL",
  "NZL",
  "NIC",
  "NER",
  "NGA",
  "MKD",
  "MNP",
  "NOR",
  "OMN",
  "PAK",
  "PLW",
  "PAN",
  "PNG",
  "PRY",
  "PER",
  "PHL",
  "POL",
  "PRT",
  "PRI",
  "QAT",
  "ROU",
  "RUS",
  "RWA",
  "WSM",
  "SMR",
  "STP",
  "SAU",
  "SEN",
  "SRB",
  "SYC",
  "SLE",
  "SGP",
  "SXM",
  "SVK",
  "SVN",
  "SLB",
  "SOM",
  "ZAF",
  "SSD",
  "ESP",
  "LKA",
  "KNA",
  "LCA",
  "MAF",
  "VCT",
  "SDN",
  "SUR",
  "SWE",
  "CHE",
  "SYR",
  "TJK",
  "TZA",
  "THA",
  "TLS",
  "TGO",
  "TON",
  "TTO",
  "TUN",
  "TUR",
  "TKM",
  "TCA",
  "TUV",
  "UGA",
  "UKR",
  "ARE",
  "GBR",
  "USA",
  "URY",
  "UZB",
  "VUT",
  "VEN",
  "VNM",
  "VIR",
  "PSE",
  "YEM",
  "ZMB",
  "ZWE",
] as const);
export const RR_PARTNER_SCHEMAS = PROGRAM_GRAPH_ADAPTERS;
export const RR_MANUSCRIPT_FIELDS = Object.freeze([
  "title",
  "author",
  "summary",
  "kind",
  "question",
  "methods",
  "results",
  "limits",
  "sources",
] as const);
export const RR_MANUSCRIPT_LIMITS = Object.freeze([
  200, 150, 1500, 100, 10000, 20000, 20000, 10000, 10000,
]);
export const RR_MANUSCRIPT_KINDS = Object.freeze([
  "Proposed method",
  "Research result",
  "Replication",
  "Null result or failure report",
  "Essay",
]);
export const RR_NOMINATION_FIELDS = Object.freeze([
  "title",
  "subject",
  "depth",
  "mechanism",
  "lenses",
  "evidence",
  "funding",
  "voice",
  "objection",
  "conflicts",
] as const);
export const RR_NOMINATION_LIMITS = Object.freeze([
  180, 180, 100, 5000, 5000, 10000, 5000, 5000, 5000, 3000,
]);
export const RR_NOMINATION_DEPTHS = Object.freeze([
  "unknown",
  "0 · Relief",
  "1 · Repair",
  "2 · Prevention",
  "3 · Structure",
  "4 · Source",
  "Multiple levels; explain below",
]);
function freezeOwned<T>(v: T): RRReadonly<T> {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v))
      freezeOwned((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v as RRReadonly<T>;
}
const encoder = new TextEncoder();
/** Detached own plain JSON data. Never invokes getters, toJSON or caller array methods. */
export function copyRemainingRecordPlain(
  input: unknown,
  maxBytes: number = 128_000_000,
): unknown {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > 128_000_000
  )
    rrFail("Invalid input bound");
  let charged = 0;
  const active = new Set<object>();
  const charge = (n: number, p: string) => {
    charged += n;
    if (charged > maxBytes)
      throw new RRDataError(
        "Remaining-record input exceeds its complete byte limit",
        p,
        "input_limit",
      );
  };
  const visit = (v: unknown, p: string, depth: number): unknown => {
    if (depth > 32)
      throw new RRDataError(
        "Remaining-record JSON exceeds depth 32",
        p,
        "input_limit",
      );
    if (v === null) {
      charge(4, p);
      return null;
    }
    if (typeof v === "string") {
      if (v.length > maxBytes)
        throw new RRDataError("Text exceeds input bound", p, "input_limit");
      charge(encoder.encode(JSON.stringify(v)).length, p);
      return v;
    }
    if (typeof v === "boolean") {
      charge(v ? 4 : 5, p);
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) rrFail("Nonfinite number", p);
      charge(String(v).length, p);
      return v;
    }
    if (!v || typeof v !== "object") rrFail("Expected plain JSON data", p);
    if (active.has(v)) rrFail("Cyclic data", p);
    active.add(v);
    try {
      // Every legitimate array in these six closed schemas has at most 2,000
      // elements. Check before materializing its full descriptor table.
      if (Array.isArray(v)) {
        const length = Object.getOwnPropertyDescriptor(v, "length")?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 2_000)
          rrFail("Array exceeds the closed producer collection bound", p);
      }
      let proto: object | null, descriptors: PropertyDescriptorMap;
      try {
        proto = Object.getPrototypeOf(v);
        descriptors = Object.getOwnPropertyDescriptors(v);
      } catch {
        return rrFail("Object cannot be inspected as plain data", p);
      }
      const keys = Reflect.ownKeys(descriptors);
      if (Array.isArray(v)) {
        if (proto !== Array.prototype) rrFail("Unsupported array prototype", p);
        const n = descriptors.length?.value;
        if (!Number.isSafeInteger(n) || n < 0 || n > maxBytes / 2)
          rrFail("Invalid array length", p);
        if (keys.length !== n + 1)
          rrFail("Sparse or decorated arrays are unsupported", p);
        charge(2 + Math.max(0, n - 1), p);
        const out: unknown[] = [];
        for (let i = 0; i < n; i++) {
          const d = descriptors[String(i)];
          if (!d || !("value" in d) || !d.enumerable)
            rrFail("Array index must be own data", `${p}[${i}]`);
          out.push(visit(d.value, `${p}[${i}]`, depth + 1));
        }
        return out;
      }
      if (proto !== Object.prototype) rrFail("Unsupported object prototype", p);
      const out: Record<string, unknown> = {};
      charge(2 + Math.max(0, keys.length - 1), p);
      for (const k of keys) {
        if (typeof k !== "string") rrFail("Symbol fields are unsupported", p);
        const d = descriptors[k];
        if (!d || !("value" in d) || !d.enumerable)
          rrFail("Object field must be own enumerable data", `${p}.${k}`);
        charge(encoder.encode(JSON.stringify(k)).length + 1, p);
        Object.defineProperty(out, k, {
          value: visit(d.value, `${p}.${k}`, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    } finally {
      active.delete(v);
    }
  };
  return freezeOwned(visit(input, "$", 0));
}
export function canonicalRemainingRecordJson(
  value: unknown,
  maxBytes: number = 128_000_000,
): string {
  const own = copyRemainingRecordPlain(value, maxBytes);
  const canonical = (v: unknown): string =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? "[" + v.map(canonical).join(",") + "]"
        : "{" +
          Object.keys(v)
            .sort()
            .map(
              (k) =>
                JSON.stringify(k) +
                ":" +
                canonical((v as Record<string, unknown>)[k]),
            )
            .join(",") +
          "}";
  return canonical(own);
}
type Obj = Record<string, unknown>;
export function rrObject(
  value: unknown,
  fields: readonly string[],
  path = "$",
): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    rrFail("Expected an object", path);
  const v = value as Obj,
    keys = Object.keys(v);
  if (
    keys.length !== fields.length ||
    fields.some((k) => !Object.hasOwn(v, k)) ||
    keys.some((k) => !fields.includes(k))
  )
    rrFail("Unknown or missing field", path);
  return v;
}
function text(
  value: unknown,
  max: number,
  path: string,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    rrFail("Text is missing or exceeds its field limit", path);
  return value;
}
function choice(
  value: unknown,
  choices: readonly string[],
  path: string,
): void {
  if (typeof value !== "string" || !choices.includes(value))
    rrFail("Unknown exact choice", path);
}
function realDate(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function rrCanonicalInstant(v: unknown, p = "$"): asserts v is string {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    rrFail("Invalid canonical UTC timestamp", p);
}
function safeUrl(s: string, p: string) {
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(s))
    rrFail("URL contains unsupported control or backslash", p);
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password)
      throw Error();
  } catch {
    rrFail("Use credential-free HTTPS", p);
  }
}
export function researchForRemainingKey(key: RRKey): RRResearchProgram | null {
  requireRemainingRecordKey(key);
  return key.startsWith("charitology.research-program.")
    ? (key.slice(29, -3) as RRResearchProgram)
    : null;
}
export function partnerForRemainingKey(key: RRKey): RRPartnerProgram | null {
  requireRemainingRecordKey(key);
  return key.startsWith("charitology.partner-workspace-v1.")
    ? (key.slice(33) as RRPartnerProgram)
    : null;
}
export function remainingRecordPartnerSchema(key: RRKey) {
  const program = partnerForRemainingKey(key),
    spec = RR_PARTNER_SCHEMAS.find((s) => s.program === program);
  if (!spec) rrFail("Key has no partner schema");
  return spec;
}
function researchField(v: unknown, f: RRFieldSpec, p: string, draft: boolean) {
  const s = text(v, f.maxLength, p),
    t = s.trim();
  if (draft) return;
  if (!t) {
    if (f.required) rrFail("Required saved field is blank", p);
    return;
  }
  if (f.kind === "select") choice(s, f.options ?? [], p);
  if (f.kind === "date" && !realDate(s))
    rrFail("A real exact calendar date is required", p);
  if (f.kind === "url") safeUrl(s, p);
  if (f.kind === "number") {
    const n = Number(s);
    if (
      !Number.isFinite(n) ||
      (f.min !== undefined && n < f.min) ||
      (f.max !== undefined && n > f.max) ||
      (f.integer && !Number.isInteger(n))
    )
      rrFail("Number is outside its declared bounds", p);
  }
}
function researchValue(input: unknown, program: RRResearchProgram) {
  const v = rrObject(input, [
    "version",
    "program",
    "records",
    "draft",
    "editing",
  ]);
  if (v.version !== 1 || v.program !== program)
    rrFail("Wrong research version or program");
  const spec = RR_RESEARCH_SCHEMAS[program],
    fields: readonly RRFieldSpec[] = spec.fields;
  if (!Array.isArray(v.records) || v.records.length > 200)
    rrFail("Research exceeds 200 records", "$.records");
  const ids = new Set<string>();
  for (const [i, row] of v.records.entries()) {
    const p = `$.records[${i}]`,
      r = rrObject(row, ["id", "createdAt", "updatedAt", "values"], p),
      id = text(r.id, 100, p + ".id");
    if (!id || ids.has(id))
      rrFail("Invalid or duplicate research ID", p + ".id");
    ids.add(id);
    rrCanonicalInstant(r.createdAt, p + ".createdAt");
    rrCanonicalInstant(r.updatedAt, p + ".updatedAt");
    const values = rrObject(
      r.values,
      fields.map((f) => f.key),
      p + ".values",
    );
    for (const f of fields)
      researchField(values[f.key], f, p + ".values." + f.key, false);
    if (
      ["moral-frameworks-program", "history-of-charity"].includes(program) &&
      values.first !== "" &&
      values.first === values.second
    )
      rrFail("Comparison identities must differ", p + ".values");
    if (program === "methods-lab")
      for (const [low, high] of [
        ["costLow", "costHigh"],
        ["probabilityLow", "probabilityHigh"],
        ["unitsLow", "unitsHigh"],
      ])
        if (
          values[low] !== "" &&
          values[high] !== "" &&
          Number(values[low]) > Number(values[high])
        )
          rrFail("Lower bound exceeds upper bound", p + ".values");
  }
  if (!v.draft || typeof v.draft !== "object" || Array.isArray(v.draft))
    rrFail("Research draft must be an object", "$.draft");
  for (const [key, value] of Object.entries(v.draft)) {
    const f = fields.find((f) => f.key === key);
    if (!f) rrFail("Unknown research draft field", "$.draft." + key);
    researchField(value, f, "$.draft." + key, true);
  }
  if (
    v.editing !== null &&
    (typeof v.editing !== "string" || !ids.has(v.editing) || spec.freeze)
  )
    rrFail("Editing must refer to an existing unfrozen row", "$.editing");
}
function partnerFields(
  input: unknown,
  fields: readonly {
    key: string;
    kind: string;
    optional: boolean;
    maxLength: number;
    options: readonly string[];
    min: number | null;
    max: number | null;
  }[],
  path: string,
  context = false,
) {
  const v = rrObject(
    input,
    fields.map((f) => f.key),
    path,
  );
  for (const f of fields) {
    const p = path + "." + f.key,
      s = text(v[f.key], f.maxLength, p),
      t = s.trim();
    if (!t) {
      if (!context && !f.optional) rrFail("Required saved field is blank", p);
      continue;
    }
    if (f.kind === "number") {
      const n = Number(t);
      if (
        !Number.isFinite(n) ||
        n < (f.min ?? 0) ||
        n > Math.min(f.max ?? 1e9, 1e9) ||
        (["amount", "budget"].includes(f.key) &&
          !/^(?:\d+|\d*\.\d{1,2})$/.test(t)) ||
        (f.key === "minutes" && !Number.isInteger(n))
      )
        rrFail("Number is outside existing partner bounds", p);
    }
    if (f.kind === "date" && !realDate(s))
      rrFail("A real exact calendar date is required", p);
    if (f.kind === "select") choice(s, f.options, p);
    if (f.kind === "url") safeUrl(s, p);
    if (f.key === "start" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
      rrFail("UTC start must be exact HH:MM", p);
  }
}
function partnerValue(input: unknown, key: RRKey) {
  const v = rrObject(input, [
      "version",
      "program",
      "updated",
      "context",
      "records",
    ]),
    spec = remainingRecordPartnerSchema(key);
  if (v.version !== 1 || v.program !== spec.program)
    rrFail("Wrong partner version or program");
  const updated = text(v.updated, 100, "$.updated");
  if (updated && !Number.isFinite(Date.parse(updated)))
    rrFail("Invalid retained partner timestamp", "$.updated");
  partnerFields(v.context, spec.context, "$.context", true);
  const records = rrObject(
      v.records,
      spec.collections.map((c) => c.key),
      "$.records",
    ),
    ids = new Set<string>();
  let count = 0;
  for (const c of spec.collections) {
    const rows = records[c.key];
    if (!Array.isArray(rows) || rows.length > 250)
      rrFail("Collection exceeds 250 records", "$.records." + c.key);
    for (const [i, row] of rows.entries()) {
      const p = `$.records.${c.key}[${i}]`,
        r = rrObject(row, ["id", "values"], p),
        id = text(r.id, 100, p + ".id");
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id))
        rrFail("Invalid or duplicate partner ID", p + ".id");
      ids.add(id);
      if (++count > 500) rrFail("Partner workspace exceeds 500 records");
      partnerFields(r.values, c.fields, p + ".values");
    }
  }
}
function otherValue(key: RRKey, own: unknown) {
  if (key === "charitology-manuscript-v1") {
    const v = rrObject(own, RR_MANUSCRIPT_FIELDS);
    RR_MANUSCRIPT_FIELDS.forEach((f, i) =>
      text(v[f], RR_MANUSCRIPT_LIMITS[i], "$." + f),
    );
    choice(v.kind, RR_MANUSCRIPT_KINDS, "$.kind");
    return;
  }
  if (key === "charitology-nominations-v1") {
    if (!Array.isArray(own) || own.length > 100)
      rrFail("Nomination array exceeds 100 packets");
    const ids = new Set<string>();
    for (const [i, row] of own.entries()) {
      const p = `$[${i}]`,
        v = rrObject(row, ["id", ...RR_NOMINATION_FIELDS], p),
        id = text(v.id, 99, p + ".id");
      if (!id || ids.has(id))
        rrFail("Invalid or duplicate nomination ID", p + ".id");
      ids.add(id);
      RR_NOMINATION_FIELDS.forEach((f, i) =>
        text(v[f], RR_NOMINATION_LIMITS[i], p + "." + f, true),
      );
      choice(v.depth, RR_NOMINATION_DEPTHS, p + ".depth");
    }
    return;
  }
  if (key === "charitology-depth-census-v1") {
    const v = rrObject(own, ["currency", "rows"]);
    if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency))
      rrFail("Currency must be three uppercase letters", "$.currency");
    if (!Array.isArray(v.rows) || v.rows.length > 1000)
      rrFail("Depth sample exceeds 1000 rows", "$.rows");
    const ids = new Set<string>();
    for (const [i, row] of v.rows.entries()) {
      const p = `$.rows[${i}]`,
        r = rrObject(row, ["id", "activity", "amount", "depth", "source"], p),
        id = text(r.id, 99, p + ".id");
      if (!id || ids.has(id))
        rrFail("Invalid or duplicate activity ID", p + ".id");
      ids.add(id);
      text(r.activity, 200, p + ".activity", true);
      text(r.source, 5000, p + ".source", true);
      const n = r.amount;
      if (
        typeof n !== "number" ||
        !Number.isFinite(n) ||
        n < 0 ||
        n > 1e9 ||
        Math.abs(n * 100 - Math.round(n * 100)) >= 0.0001
      )
        rrFail(
          "Amount must retain existing cent precision and bounds",
          p + ".amount",
        );
      choice(r.depth, ["unknown", "0", "1", "2", "3", "4"], p + ".depth");
    }
    return;
  }
  if (key === "charitology-country-notes-v1") {
    if (!own || typeof own !== "object" || Array.isArray(own))
      rrFail("Country notes must be a bare map");
    for (const [code, row] of Object.entries(own)) {
      if (!(RR_COUNTRY_CODES as readonly string[]).includes(code))
        rrFail("Unknown country identity", "$." + code);
      const r = rrObject(row, ["voices", "institutions", "gaps"], "$." + code);
      for (const f of ["voices", "institutions", "gaps"])
        text(r[f], 10000, "$." + code + "." + f);
    }
    return;
  }
  rrFail("Unknown native family");
}
/** Fully detached strict admission; accepted text and insertion order are preserved. */
export function validateRemainingRecordValue<K extends RRKey>(
  key: K,
  input: unknown,
): RRReadonly<RRValueMap[K]> {
  requireRemainingRecordKey(key);
  const cap = remainingRecordCapacity(key).nativeBytes,
    own = copyRemainingRecordPlain(input, cap),
    research = researchForRemainingKey(key),
    partner = partnerForRemainingKey(key);
  if (research) researchValue(own, research);
  else if (partner) partnerValue(own, key);
  else otherValue(key, own);
  const pretty = JSON.stringify(own, null, 2),
    reserve = partner
      ? Math.max(0, 24 - (own as { updated: string }).updated.length)
      : 0;
  if (encoder.encode(pretty).byteLength + reserve > cap)
    throw new RRDataError(
      "Complete native backup exceeds its byte limit",
      "$",
      "input_limit",
    );
  return own as RRReadonly<RRValueMap[K]>;
}
export function defaultRemainingRecordValue<K extends RRKey>(
  key: K,
): RRReadonly<RRValueMap[K]> {
  requireRemainingRecordKey(key);
  const research = researchForRemainingKey(key),
    partner = partnerForRemainingKey(key);
  let own: unknown;
  if (research)
    own = {
      version: 1,
      program: research,
      records: [],
      draft: {},
      editing: null,
    };
  else if (partner) {
    const spec = remainingRecordPartnerSchema(key);
    own = {
      version: 1,
      program: partner,
      updated: "",
      context: Object.fromEntries(
        spec.context.map((f) => [f.key, f.value ?? ""]),
      ),
      records: Object.fromEntries(spec.collections.map((c) => [c.key, []])),
    };
  } else if (key === "charitology-manuscript-v1")
    own = Object.fromEntries(
      RR_MANUSCRIPT_FIELDS.map((f) => [
        f,
        f === "kind" ? "Proposed method" : "",
      ]),
    );
  else if (key === "charitology-nominations-v1") own = [];
  else if (key === "charitology-depth-census-v1")
    own = { currency: "USD", rows: [] };
  else own = {};
  return validateRemainingRecordValue(key, own);
}
/** Exact literal exposed-control lengths, with whole archive bounds for controls lacking maxlength. */
export function remainingRecordFormFields(
  key: RRKey,
  form: RRFormId,
): Readonly<Record<string, number>> {
  requireRemainingRecordKey(key);
  if (typeof form !== "string") rrFail("Invalid form identity");
  const research = researchForRemainingKey(key),
    partner = partnerForRemainingKey(key);
  if (research) {
    if (form !== "draft") rrFail("Form does not belong to research key");
    return Object.freeze(
      Object.fromEntries(
        (RR_RESEARCH_SCHEMAS[research].fields as readonly RRFieldSpec[]).map(
          (f) => [f.key, f.kind === "select" ? 1000000 : f.maxLength],
        ),
      ),
    );
  }
  if (partner) {
    const spec = remainingRecordPartnerSchema(key),
      fields =
        form === "context"
          ? spec.context
          : form.startsWith("collection:")
            ? spec.collections.find((c) => c.key === form.slice(11))?.fields
            : undefined;
    if (!fields) rrFail("Form does not belong to partner key");
    return Object.freeze(
      Object.fromEntries(fields.map((f) => [f.key, f.maxLength])),
    );
  }
  if (key === "charitology-manuscript-v1" && form === "manuscript")
    return Object.freeze(
      Object.fromEntries(
        RR_MANUSCRIPT_FIELDS.map((f, i) => [
          f,
          f === "kind" ? 1000000 : RR_MANUSCRIPT_LIMITS[i],
        ]),
      ),
    );
  if (key === "charitology-nominations-v1" && form === "nomination")
    return Object.freeze(
      Object.fromEntries(
        RR_NOMINATION_FIELDS.map((f, i) => [
          f,
          f === "depth" ? 1000000 : RR_NOMINATION_LIMITS[i],
        ]),
      ),
    );
  if (key === "charitology-depth-census-v1") {
    if (form === "currency") return Object.freeze({ currency: 3 });
    if (form === "activity")
      return Object.freeze({
        activity: 200,
        amount: 1000000,
        depth: 1000000,
        source: 5000,
      });
  }
  if (
    key === "charitology-country-notes-v1" &&
    form.startsWith("country:") &&
    (RR_COUNTRY_CODES as readonly string[]).includes(form.slice(8))
  )
    return Object.freeze({ voices: 10000, institutions: 10000, gaps: 10000 });
  return rrFail("Form does not belong to this key");
}
export interface RRHydratedString {
  readonly original: string;
  readonly display: string;
}
export function remainingRecordHydratedString(
  current: string,
  hydrated: RRHydratedString | null,
): string {
  if (typeof current !== "string") rrFail("Current control string is required");
  if (hydrated === null) return current;
  const v = rrObject(copyRemainingRecordPlain(hydrated, 128000000), [
    "original",
    "display",
  ]);
  if (typeof v.original !== "string" || typeof v.display !== "string")
    rrFail("Hydration requires exact string pair");
  return current === v.display ? v.original : current;
}
