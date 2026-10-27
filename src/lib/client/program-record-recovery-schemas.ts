// Fixed legacy producer schemas. No storage, DOM, clocks or generated record IDs.
import type { ProgramState } from "./program-workspaces";
import type { Workspace } from "./charity-os";
export type PRProgram =
  | "university-chapters"
  | "local-charitology"
  | "time-charitology"
  | "corporate-program"
  | "policy-program";
export type PRProgramKey = `charitology.program-workspace-v1.${PRProgram}`;
export type PRKey = PRProgramKey | "charitology.charity-os";
export type PRValueMap = { [K in PRProgramKey]: ProgramState } & {
  "charitology.charity-os": Workspace;
};
export type PRReadonly<T> = T extends readonly (infer E)[]
  ? readonly PRReadonly<E>[]
  : T extends object
    ? { readonly [P in keyof T]: PRReadonly<T[P]> }
    : T;
export interface PROsEnvelope {
  format: "charitology.charity-os";
  version: 1;
  exportedAt: string;
  workspace: Workspace;
}
export type PRNative<K extends PRKey> = K extends "charitology.charity-os"
  ? PROsEnvelope
  : ProgramState;
export type PRCollection =
  | "sessions"
  | "roles"
  | "tasks"
  | "needs"
  | "activities"
  | "questions"
  | "logs"
  | "scenarios"
  | "options"
  | "evidence"
  | "equity";
export type PROsKind = "projects" | "grants" | "tasks" | "outcomes";
export type PRFormId =
  "context" | `collection:${PRCollection}` | `editor:${PROsKind}`;
export interface PRRawForm {
  readonly form: PRFormId;
  readonly editingId: string | null;
  readonly values: Readonly<Record<string, string>>;
}
export interface PRFormArchive {
  readonly format: "charitology-program-record-forms";
  readonly version: 1;
  readonly key: PRKey;
  readonly exportedAt: string;
  readonly forms: readonly PRRawForm[];
}
export interface PRRawArchive {
  readonly format: "charitology-program-record-raw-copy";
  readonly version: 1;
  readonly key: PRKey;
  readonly copy: "protected" | "observed";
  readonly raw: string;
}
export const PR_KEYS = Object.freeze([
  "charitology.program-workspace-v1.university-chapters",
  "charitology.program-workspace-v1.local-charitology",
  "charitology.program-workspace-v1.time-charitology",
  "charitology.program-workspace-v1.corporate-program",
  "charitology.program-workspace-v1.policy-program",
  "charitology.charity-os",
] as const);
export class PRDataError extends Error {
  readonly code: "invalid_data" | "input_limit";
  readonly path: string;
  constructor(
    message: string,
    path = "$",
    code: "invalid_data" | "input_limit" = "invalid_data",
  ) {
    super(`${message} (${path})`);
    this.name = "PRDataError";
    this.code = code;
    this.path = path;
  }
}
export function prFail(message: string, path = "$"): never {
  throw new PRDataError(message, path);
}
export function isProgramRecordKey(value: unknown): value is PRKey {
  return (
    typeof value === "string" && (PR_KEYS as readonly string[]).includes(value)
  );
}
export function requireProgramRecordKey(key: unknown): asserts key is PRKey {
  if (!isProgramRecordKey(key)) prFail("Unknown program-record key");
}
function freezeOwned<T>(v: T): PRReadonly<T> {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v))
      freezeOwned((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v as PRReadonly<T>;
}
const encoder = new TextEncoder();
/** Detached own plain JSON data. Never invokes getters, toJSON or caller array methods. */
export function copyProgramRecordPlain(
  input: unknown,
  maxBytes: number = 8_000_000,
): unknown {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 64_000_000)
    prFail("Invalid input bound");
  let charged = 0;
  const active = new Set<object>();
  const charge = (n: number, p: string) => {
    charged += n;
    if (charged > maxBytes)
      throw new PRDataError(
        "Program-record input exceeds its complete byte limit",
        p,
        "input_limit",
      );
  };
  const visit = (v: unknown, p: string, depth: number): unknown => {
    if (depth > 32)
      throw new PRDataError(
        "Program-record JSON exceeds depth 32",
        p,
        "input_limit",
      );
    if (v === null) {
      charge(4, p);
      return null;
    }
    if (typeof v === "string") {
      if (v.length > maxBytes)
        throw new PRDataError("Text exceeds input bound", p, "input_limit");
      charge(encoder.encode(JSON.stringify(v)).length, p);
      return v;
    }
    if (typeof v === "boolean") {
      charge(v ? 4 : 5, p);
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) prFail("Nonfinite number", p);
      charge(String(v).length, p);
      return v;
    }
    if (!v || typeof v !== "object") prFail("Expected plain JSON data", p);
    if (active.has(v)) prFail("Cyclic data", p);
    active.add(v);
    try {
      // Every legitimate array in these six closed schemas has at most 2,000
      // elements. Check before materializing its full descriptor table.
      if (Array.isArray(v)) {
        const length = Object.getOwnPropertyDescriptor(v, "length")?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 2_000)
          prFail("Array exceeds the closed producer collection bound", p);
      }
      let proto: object | null, descriptors: PropertyDescriptorMap;
      try {
        proto = Object.getPrototypeOf(v);
        descriptors = Object.getOwnPropertyDescriptors(v);
      } catch {
        return prFail("Object cannot be inspected as plain data", p);
      }
      const keys = Reflect.ownKeys(descriptors);
      if (Array.isArray(v)) {
        if (proto !== Array.prototype) prFail("Unsupported array prototype", p);
        const n = descriptors.length?.value;
        if (!Number.isSafeInteger(n) || n < 0 || n > maxBytes / 2)
          prFail("Invalid array length", p);
        if (keys.length !== n + 1)
          prFail("Sparse or decorated arrays are unsupported", p);
        charge(2 + Math.max(0, n - 1), p);
        const out: unknown[] = [];
        for (let i = 0; i < n; i++) {
          const d = descriptors[String(i)];
          if (!d || !("value" in d) || !d.enumerable)
            prFail("Array index must be own data", `${p}[${i}]`);
          out.push(visit(d.value, `${p}[${i}]`, depth + 1));
        }
        return out;
      }
      if (proto !== Object.prototype) prFail("Unsupported object prototype", p);
      const out: Record<string, unknown> = {};
      charge(2 + Math.max(0, keys.length - 1), p);
      for (const k of keys) {
        if (typeof k !== "string") prFail("Symbol fields are unsupported", p);
        const d = descriptors[k];
        if (!d || !("value" in d) || !d.enumerable)
          prFail("Object field must be own enumerable data", `${p}.${k}`);
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
export function canonicalProgramRecordJson(
  value: unknown,
  maxBytes: number = 8_000_000,
): string {
  const own = copyProgramRecordPlain(value, maxBytes);
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
export interface PRFieldSpec {
  key: string;
  kind?: "text" | "textarea" | "number" | "date" | "url" | "select";
  optional?: boolean;
  min?: number;
  max?: number;
  value?: string;
  options?: readonly string[];
}
export interface PRProgramSpec {
  context: readonly PRFieldSpec[];
  collections: readonly { key: string; fields: readonly PRFieldSpec[] }[];
}
// Captured explicitly from the five v1 producer definitions; compatibility checker detects drift.
const definitions: Record<PRProgram, PRProgramSpec> = {
  "university-chapters": {
    context: [
      {
        key: "name",
        optional: false,
      },
      {
        key: "institution",
        optional: false,
      },
      {
        key: "purpose",
        kind: "textarea",
        optional: false,
      },
      {
        key: "access",
        kind: "textarea",
        optional: false,
      },
      {
        key: "governance",
        kind: "textarea",
        optional: false,
      },
      {
        key: "term",
        optional: false,
      },
      {
        key: "meeting",
        optional: true,
      },
    ],
    collections: [
      {
        key: "sessions",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "date",
            kind: "date",
            optional: true,
          },
          {
            key: "facilitator",
            optional: true,
          },
          {
            key: "location",
            optional: true,
          },
          {
            key: "objective",
            kind: "textarea",
            optional: false,
          },
          {
            key: "agenda",
            kind: "textarea",
            optional: false,
          },
          {
            key: "reading",
            optional: true,
          },
          {
            key: "output",
            kind: "textarea",
            optional: false,
          },
          {
            key: "notes",
            kind: "textarea",
            optional: true,
          },
        ],
      },
      {
        key: "roles",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "responsibility",
            kind: "textarea",
            optional: false,
          },
          {
            key: "handover",
            kind: "textarea",
            optional: false,
          },
          {
            key: "term",
            optional: true,
          },
        ],
      },
      {
        key: "tasks",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "owner",
            optional: true,
          },
          {
            key: "date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            kind: "select",
            value: "To do",
            options: ["To do", "In progress", "Done"],
          },
          {
            key: "notes",
            kind: "textarea",
            optional: true,
          },
        ],
      },
    ],
  },
  "local-charitology": {
    context: [
      {
        key: "name",
        optional: false,
      },
      {
        key: "place",
        optional: false,
      },
      {
        key: "population",
        optional: false,
      },
      {
        key: "question",
        kind: "textarea",
        optional: false,
      },
      {
        key: "method",
        kind: "textarea",
        optional: false,
      },
      {
        key: "limits",
        kind: "textarea",
        optional: false,
      },
      {
        key: "date",
        kind: "date",
        optional: true,
      },
    ],
    collections: [
      {
        key: "needs",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "population",
            optional: false,
          },
          {
            key: "period",
            optional: false,
          },
          {
            key: "finding",
            kind: "textarea",
            optional: false,
          },
          {
            key: "source",
            kind: "url",
            optional: false,
          },
          {
            key: "evidence",
            kind: "select",
            value: "Not checked",
            options: [
              "Not checked",
              "Public description",
              "Observational evidence",
              "Causal study",
              "Mixed or disputed",
              "Hypothesis",
            ],
          },
          {
            key: "limits",
            kind: "textarea",
            optional: false,
          },
          {
            key: "voice",
            optional: true,
          },
        ],
      },
      {
        key: "activities",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "organization",
            optional: false,
          },
          {
            key: "cause",
            optional: false,
          },
          {
            key: "coverage",
            optional: false,
          },
          {
            key: "depth",
            kind: "select",
            value: "Unclassified",
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels",
            ],
          },
          {
            key: "mechanism",
            kind: "textarea",
            optional: false,
          },
          {
            key: "source",
            kind: "url",
            optional: false,
          },
          {
            key: "date",
            kind: "date",
            optional: false,
          },
          {
            key: "limits",
            kind: "textarea",
            optional: false,
          },
        ],
      },
      {
        key: "questions",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "reason",
            kind: "textarea",
            optional: false,
          },
          {
            key: "voices",
            kind: "textarea",
            optional: false,
          },
          {
            key: "owner",
            optional: true,
          },
          {
            key: "date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            kind: "select",
            value: "Open",
            options: ["Open", "Checking", "Answered", "Unresolved"],
          },
          {
            key: "notes",
            kind: "textarea",
            optional: true,
          },
        ],
      },
    ],
  },
  "time-charitology": {
    context: [
      {
        key: "name",
        optional: false,
      },
      {
        key: "available",
        kind: "number",
        min: 0,
        max: 168,
        value: "4",
      },
      {
        key: "skills",
        optional: false,
      },
      {
        key: "wage",
        kind: "number",
        min: 0,
        max: 1000000,
        value: "0",
      },
      {
        key: "currency",
        optional: false,
      },
      {
        key: "access",
        kind: "textarea",
        optional: true,
      },
    ],
    collections: [
      {
        key: "roles",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "organization",
            optional: false,
          },
          {
            key: "status",
            kind: "select",
            value: "Exploring",
            options: ["Exploring", "Planned", "Active", "Finished", "Declined"],
          },
          {
            key: "hours",
            kind: "number",
            min: 0,
            max: 168,
            value: "2",
          },
          {
            key: "travel",
            kind: "number",
            min: 0,
            max: 168,
            value: "0",
          },
          {
            key: "prep",
            kind: "number",
            min: 0,
            max: 168,
            value: "0",
          },
          {
            key: "staff",
            kind: "number",
            min: 0,
            max: 168,
            value: "0",
          },
          {
            key: "cost",
            kind: "number",
            min: 0,
            max: 1000000,
            value: "0",
          },
          {
            key: "skills",
            optional: true,
          },
          {
            key: "confirmed",
            kind: "select",
            value: "Not confirmed",
            options: [
              "Not confirmed",
              "Role confirmed only",
              "Role and support confirmed",
            ],
          },
          {
            key: "outcome",
            kind: "textarea",
            optional: false,
          },
          {
            key: "feedback",
            kind: "textarea",
            optional: true,
          },
          {
            key: "source",
            kind: "url",
            optional: true,
          },
        ],
      },
      {
        key: "logs",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "date",
            kind: "date",
            optional: false,
          },
          {
            key: "hours",
            kind: "number",
            min: 0,
            max: 168,
            value: "1",
          },
          {
            key: "travel",
            kind: "number",
            min: 0,
            max: 168,
            value: "0",
          },
          {
            key: "observation",
            kind: "textarea",
            optional: false,
          },
          {
            key: "next",
            kind: "textarea",
            optional: true,
          },
        ],
      },
    ],
  },
  "corporate-program": {
    context: [
      {
        key: "name",
        optional: false,
      },
      {
        key: "employees",
        kind: "number",
        min: 0,
        max: 10000000,
        value: "100",
      },
      {
        key: "currency",
        optional: false,
      },
      {
        key: "period",
        optional: false,
      },
      {
        key: "eligibility",
        kind: "textarea",
        optional: false,
      },
      {
        key: "flexibility",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        kind: "textarea",
        optional: false,
      },
      {
        key: "learning",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "scenarios",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "participation",
            kind: "number",
            min: 0,
            max: 100,
            value: "50",
          },
          {
            key: "gift",
            kind: "number",
            min: 0,
            max: 1000000000,
            value: "100",
          },
          {
            key: "ratio",
            kind: "number",
            min: 0,
            max: 100,
            value: "1",
          },
          {
            key: "cap",
            kind: "number",
            min: 0,
            max: 1000000000,
            value: "100",
          },
          {
            key: "budget",
            kind: "number",
            min: 0,
            max: 1000000000000,
            value: "10000",
          },
          {
            key: "admin",
            kind: "number",
            min: 0,
            max: 1000000000000,
            value: "500",
          },
          {
            key: "assumptions",
            kind: "textarea",
            optional: false,
          },
        ],
      },
      {
        key: "tasks",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "owner",
            optional: true,
          },
          {
            key: "date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            kind: "select",
            value: "To do",
            options: ["To do", "In progress", "Done"],
          },
          {
            key: "notes",
            kind: "textarea",
            optional: true,
          },
        ],
      },
    ],
  },
  "policy-program": {
    context: [
      {
        key: "name",
        optional: false,
      },
      {
        key: "jurisdiction",
        optional: false,
      },
      {
        key: "question",
        kind: "textarea",
        optional: false,
      },
      {
        key: "baseline",
        kind: "textarea",
        optional: false,
      },
      {
        key: "years",
        kind: "number",
        min: 0,
        max: 100,
        value: "10",
      },
      {
        key: "discount",
        kind: "number",
        min: 0,
        max: 100,
        value: "3",
      },
      {
        key: "currency",
        optional: false,
      },
      {
        key: "uncertainty",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "options",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "mechanism",
            kind: "textarea",
            optional: false,
          },
          {
            key: "depth",
            kind: "select",
            value: "Unclassified",
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels",
            ],
          },
          {
            key: "upfront",
            kind: "number",
            min: 0,
            max: 1000000000000,
            value: "0",
          },
          {
            key: "annualCost",
            kind: "number",
            min: 0,
            max: 1000000000000,
            value: "0",
          },
          {
            key: "annualLow",
            kind: "number",
            min: 0,
            max: 1000000000000,
            value: "0",
          },
          {
            key: "annualHigh",
            kind: "number",
            min: 0,
            max: 1000000000000,
            value: "0",
          },
          {
            key: "unpriced",
            kind: "textarea",
            optional: false,
          },
          {
            key: "uncertainty",
            kind: "textarea",
            optional: false,
          },
        ],
      },
      {
        key: "evidence",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "option",
            optional: false,
          },
          {
            key: "source",
            kind: "url",
            optional: false,
          },
          {
            key: "evidence",
            kind: "select",
            value: "Not checked",
            options: [
              "Not checked",
              "Public description",
              "Observational evidence",
              "Causal study",
              "Mixed or disputed",
              "Hypothesis",
            ],
          },
          {
            key: "finding",
            kind: "textarea",
            optional: false,
          },
          {
            key: "limits",
            kind: "textarea",
            optional: false,
          },
          {
            key: "date",
            kind: "date",
            optional: false,
          },
        ],
      },
      {
        key: "equity",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "option",
            optional: false,
          },
          {
            key: "effects",
            kind: "textarea",
            optional: false,
          },
          {
            key: "voice",
            kind: "textarea",
            optional: false,
          },
          {
            key: "safeguards",
            kind: "textarea",
            optional: false,
          },
        ],
      },
      {
        key: "tasks",
        fields: [
          {
            key: "title",
            optional: false,
          },
          {
            key: "owner",
            optional: true,
          },
          {
            key: "date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            kind: "select",
            value: "To do",
            options: ["To do", "In progress", "Done"],
          },
          {
            key: "notes",
            kind: "textarea",
            optional: true,
          },
        ],
      },
    ],
  },
};
export const PR_PROGRAM_SCHEMAS = freezeOwned(definitions);
type Obj = Record<string, unknown>;
export function prObject(
  value: unknown,
  fields: readonly string[],
  path = "$",
): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    prFail("Expected an object", path);
  const own = value as Obj,
    keys = Object.keys(own);
  if (
    keys.length !== fields.length ||
    fields.some((k) => !Object.hasOwn(own, k)) ||
    keys.some((k) => !fields.includes(k))
  )
    prFail("Unknown or missing field", path);
  return own;
}
function text(v: unknown, max: number, p: string, required = false): string {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    prFail("Text is missing or exceeds its field limit", p);
  return v;
}
function exactText(
  v: unknown,
  max: number,
  p: string,
  required = false,
): string {
  const s = text(v, max, p, required);
  if (s !== s.trim())
    prFail("Noncanonical identity, date or choice needs explicit repair", p);
  return s;
}
function choice(v: unknown, choices: readonly string[], p: string): string {
  if (typeof v !== "string" || !choices.includes(v))
    prFail("Unrecognized choice", p);
  return v;
}
function realDate(s: string, min = 0, max = 9999): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4)),
    d = new Date(s + "T12:00:00Z");
  return (
    year >= min &&
    year <= max &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === s
  );
}
export function prCanonicalInstant(
  value: unknown,
  p = "$",
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    prFail("Invalid canonical UTC timestamp", p);
}
function safeUrl(s: string, p: string, httpsOnly = false): void {
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(s))
    prFail("URL contains a control character or backslash", p);
  try {
    const u = new URL(s);
    if (
      !(httpsOnly
        ? u.protocol === "https:"
        : ["http:", "https:"].includes(u.protocol)) ||
      !u.hostname ||
      u.username ||
      u.password
    )
      throw Error();
  } catch {
    prFail("Use a public URL without embedded credentials", p);
  }
}
export function programForRecordKey(key: PRKey): PRProgram | null {
  requireProgramRecordKey(key);
  return key === "charitology.charity-os"
    ? null
    : (key.slice("charitology.program-workspace-v1.".length) as PRProgram);
}
function generalValues(
  raw: unknown,
  fields: readonly PRFieldSpec[],
  path: string,
  draft = false,
): void {
  const v = prObject(
    raw,
    fields.map((f) => f.key),
    path,
  );
  for (const f of fields) {
    const p = path + "." + f.key,
      s = text(v[f.key], f.kind === "textarea" ? 5000 : 500, p),
      t = s.trim();
    if (!t) {
      if (f.kind === "number" || (!draft && !f.optional))
        prFail("Required field is blank; missing numbers are not zero", p);
      continue;
    }
    if (f.kind === "number") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < (f.min ?? 0) || n > (f.max ?? 1e12))
        prFail("Number is outside its configured bounds", p);
      if (["employees", "years"].includes(f.key) && !Number.isInteger(n))
        prFail("A whole number is required", p);
      if (f.key === "years" && n < 1) prFail("Years must be at least one", p);
    }
    if (f.kind === "date" && (s !== t || !realDate(s)))
      prFail("A real canonical calendar date is required", p);
    if (f.kind === "select" && (s !== t || !f.options?.includes(s)))
      prFail("Choose an available exact option", p);
    if (f.kind === "url") safeUrl(t, p);
  }
  if ("annualLow" in v && Number(v.annualHigh) < Number(v.annualLow))
    prFail("High annual benefit must be at least low annual benefit", path);
}
function generalValue(input: unknown, program: PRProgram): ProgramState {
  const v = prObject(input, [
    "version",
    "program",
    "updated",
    "context",
    "records",
  ]);
  if (v.version !== 1 || v.program !== program)
    prFail("Wrong version or program for this key");
  if (
    typeof v.updated !== "string" ||
    (v.updated && !Number.isFinite(Date.parse(v.updated)))
  )
    prFail("Invalid updated timestamp", "$.updated");
  const spec = PR_PROGRAM_SCHEMAS[program];
  generalValues(v.context, spec.context, "$.context", true);
  const records = prObject(
    v.records,
    spec.collections.map((c) => c.key),
    "$.records",
  );
  const seen = new Set<string>();
  let total = 0;
  for (const c of spec.collections) {
    const rows = records[c.key];
    if (!Array.isArray(rows) || rows.length > 250)
      prFail("Collection exceeds 250 records", "$.records." + c.key);
    for (const [i, row] of rows.entries()) {
      const p = `$.records.${c.key}[${i}]`,
        r = prObject(row, ["id", "values"], p),
        id = exactText(r.id, 100, p + ".id", true);
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || seen.has(id))
        prFail("Invalid or duplicate record ID", p + ".id");
      seen.add(id);
      if (++total > 500) prFail("Workspace exceeds 500 records", "$.records");
      generalValues(r.values, c.fields, p + ".values");
    }
  }
  return v as ProgramState;
}
const OS_KINDS = ["projects", "grants", "tasks", "outcomes"] as const;
export const PR_OS_FIELDS = Object.freeze({
  projects: Object.freeze([
    "id",
    "title",
    "status",
    "owner",
    "due",
    "depth",
    "budget",
    "spent",
    "goal",
    "notes",
  ]),
  grants: Object.freeze([
    "id",
    "title",
    "funder",
    "projectId",
    "status",
    "requested",
    "awarded",
    "deadline",
    "owner",
    "next",
    "notes",
  ]),
  tasks: Object.freeze([
    "id",
    "title",
    "projectId",
    "status",
    "priority",
    "due",
    "owner",
    "notes",
  ]),
  outcomes: Object.freeze([
    "id",
    "date",
    "projectId",
    "indicator",
    "value",
    "unit",
    "evidence",
    "source",
    "notes",
  ]),
});
const OS_TEXT_LIMITS: Record<string, number> = {
  title: 160,
  owner: 120,
  goal: 2000,
  notes: 4000,
  funder: 160,
  next: 1000,
  indicator: 160,
  unit: 80,
  source: 1200,
};
const OS_CHOICES: Record<string, readonly string[]> = {
  projects: ["planned", "active", "paused", "complete"],
  grants: [
    "prospect",
    "drafting",
    "submitted",
    "awarded",
    "declined",
    "closed",
  ],
  tasks: ["todo", "in-progress", "done"],
  outcomes: ["unknown", "self-reported", "documented", "independent"],
};
function osNumber(
  v: unknown,
  p: string,
  signed = false,
  nullable = false,
): void {
  if (nullable && v === null) return;
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    Math.abs(v) > 1e12 ||
    (!signed && v < 0)
  )
    prFail("Expected a finite bounded number", p);
}
function osValue(input: unknown): Workspace {
  const v = prObject(input, [
    "organization",
    "mission",
    "community",
    "currency",
    ...OS_KINDS,
  ]);
  text(v.organization, 160, "$.organization");
  text(v.mission, 2000, "$.mission");
  text(v.community, 2000, "$.community");
  if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency))
    prFail("Currency must be three uppercase letters", "$.currency");
  const projectIds = new Set<string>();
  let total = 0;
  for (const kind of OS_KINDS) {
    const rows = v[kind];
    if (!Array.isArray(rows)) prFail("Missing record list", "$. " + kind);
    total += rows.length;
    if (total > 2000) prFail("Workspace exceeds 2000 records");
    const seen = new Set<string>();
    for (const [i, row] of rows.entries()) {
      const p = `$.${kind}[${i}]`,
        r = prObject(row, PR_OS_FIELDS[kind], p),
        id = exactText(r.id, 80, p + ".id", true);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || seen.has(id))
        prFail("Invalid or duplicate collection ID", p + ".id");
      seen.add(id);
      if (kind === "projects") projectIds.add(id);
      for (const [field, max] of Object.entries(OS_TEXT_LIMITS))
        if (Object.hasOwn(r, field))
          text(
            r[field],
            max,
            p + "." + field,
            ["title", "indicator"].includes(field),
          );
      if (kind === "projects") {
        osNumber(r.budget, p + ".budget");
        osNumber(r.spent, p + ".spent");
        osNumber(r.depth, p + ".depth", false, true);
        if (
          r.depth !== null &&
          (!Number.isInteger(r.depth) || (r.depth as number) > 4)
        )
          prFail("Depth must be null or integer 0 through 4", p + ".depth");
      } else {
        const project = exactText(r.projectId, 80, p + ".projectId");
        if (project && !projectIds.has(project))
          prFail("Linked project is missing", p + ".projectId");
      }
      if (kind === "grants") {
        osNumber(r.requested, p + ".requested");
        osNumber(r.awarded, p + ".awarded");
      }
      if (kind === "tasks")
        choice(r.priority, ["high", "normal", "low"], p + ".priority");
      if (kind === "outcomes") {
        osNumber(r.value, p + ".value", true, true);
        if (r.source) safeUrl(r.source as string, p + ".source", true);
      }
      choice(
        r[kind === "outcomes" ? "evidence" : "status"],
        OS_CHOICES[kind],
        p + ".status",
      );
      const dateKey =
        kind === "projects" || kind === "tasks"
          ? "due"
          : kind === "grants"
            ? "deadline"
            : "date";
      const d = exactText(
        r[dateKey],
        10,
        p + "." + dateKey,
        kind === "outcomes",
      );
      if (d && !realDate(d, 1900, 2200))
        prFail(
          "Date must be real and between 1900 and 2200",
          p + "." + dateKey,
        );
    }
  }
  if (encoder.encode(JSON.stringify(v)).byteLength > 4_500_000)
    throw new PRDataError(
      "OS compact workspace exceeds 4500000 bytes",
      "$",
      "input_limit",
    );
  return v as Workspace;
}
export function validateProgramRecordValue<K extends PRKey>(
  key: K,
  input: unknown,
): PRReadonly<PRValueMap[K]> {
  requireProgramRecordKey(key);
  const own = copyProgramRecordPlain(input);
  const program = programForRecordKey(key),
    value = program ? generalValue(own, program) : osValue(own);
  if (
    program &&
    encoder.encode(JSON.stringify(value, null, 2)).byteLength > 8_000_000
  )
    throw new PRDataError(
      "Native backup exceeds 8000000 bytes",
      "$",
      "input_limit",
    );
  return value as PRReadonly<PRValueMap[K]>;
}
export function defaultProgramRecordValue<K extends PRKey>(
  key: K,
): PRReadonly<PRValueMap[K]> {
  requireProgramRecordKey(key);
  const program = programForRecordKey(key);
  const value = program
    ? {
        version: 1,
        program,
        updated: "",
        context: Object.fromEntries(
          PR_PROGRAM_SCHEMAS[program].context.map((f) => [
            f.key,
            f.value ?? "",
          ]),
        ),
        records: Object.fromEntries(
          PR_PROGRAM_SCHEMAS[program].collections.map((c) => [c.key, []]),
        ),
      }
    : {
        organization: "",
        mission: "",
        community: "",
        currency: "USD",
        projects: [],
        grants: [],
        tasks: [],
        outcomes: [],
      };
  return validateProgramRecordValue(key, value);
}
/** Inert raw-form field map; an ID is not a saved record field in editor forms. */
export function programRecordFormFields(
  key: PRKey,
  form: PRFormId,
): Readonly<Record<string, number>> {
  const program = programForRecordKey(key);
  if (typeof form !== "string") prFail("Invalid raw form identity");
  if (program) {
    const spec = PR_PROGRAM_SCHEMAS[program],
      fields =
        form === "context"
          ? spec.context
          : form.startsWith("collection:")
            ? spec.collections.find((c) => c.key === form.slice(11))?.fields
            : undefined;
    if (!fields) prFail("Form does not belong to this program");
    return Object.freeze(
      Object.fromEntries(
        fields.map((f) => [f.key, f.kind === "textarea" ? 5000 : 500]),
      ),
    );
  }
  if (form === "context")
    return Object.freeze({
      organization: 160,
      mission: 2000,
      community: 2000,
      currency: 3,
    });
  const kind = form.startsWith("editor:") ? (form.slice(7) as PROsKind) : null;
  if (!kind || !OS_KINDS.includes(kind))
    prFail("Form does not belong to local OS");
  // Editor fields without an explicit maxlength are limited only by the whole
  // raw-form wrapper. Invalid long numeric/date/choice text is not truncated.
  return Object.freeze(
    Object.fromEntries(
      PR_OS_FIELDS[kind]
        .filter((k) => k !== "id")
        .map((k) => [k, OS_TEXT_LIMITS[k] ?? 524_288]),
    ),
  );
}
