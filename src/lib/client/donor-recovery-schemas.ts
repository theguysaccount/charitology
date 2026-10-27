// D1 is intentionally independent of storage, DOM and runtime gifts.ts.
import causesData from "../../data/causes.json";
import diligenceData from "../../data/due-diligence.json";
import { allocateShares, allocateBest, normalize } from "../compass";
import type { Gift } from "./gifts";
import type { LegacyPlan } from "./legacy";
import type { CardState } from "./giftcard";
import type { DiligenceState } from "./diligence";
import type { Draft } from "./theory-of-change";

export const D1_KEYS = Object.freeze([
  "gifts",
  "portfolio",
  "legacy",
  "gift-card",
  "ce-models",
  "due-diligence",
  "grant-proposals",
  "grant-weights",
  "grant-draft",
  "impact-drafts",
  "split",
  "compass",
  "disaster-plan",
  "wrapped",
] as const);
export type D1Key = (typeof D1_KEYS)[number];
export type D1GrantKey = "grant-proposals" | "grant-weights" | "grant-draft";
export type D1StandaloneKey = Exclude<D1Key, D1GrantKey>;
export const D1_GRANT_KEYS = Object.freeze([
  "grant-proposals",
  "grant-weights",
  "grant-draft",
] as const);
export const D1_GRANT_DIMENSIONS = Object.freeze([
  "depth",
  "evidence",
  "counterfactual",
  "feedback",
  "voice",
  "cost",
  "durability",
  "team",
  "harm",
] as const);
export const D1_FRAMEWORKS = Object.freeze([
  "welfare",
  "rights",
  "justice",
  "care",
  "tradition",
  "future",
  "nature",
  "flourishing",
] as const);
export const D1_DIMENSIONS = Object.freeze([
  "horizon",
  "circle",
  "reach",
  "certainty",
  "depth",
] as const);
const CAUSES = Object.freeze(causesData.causes.map((c) => c.id));
const GIFT_CAUSES = Object.freeze([...CAUSES, "other"]);
const QUESTIONS = Object.freeze(
  diligenceData.groups.flatMap((g) => g.items.map((i) => i.id)),
);
const REASONS = Object.freeze([
  "depth",
  "counterfactual",
  "evidence",
  "feedback",
  "voice",
  "cost",
  "strings",
  "durability",
  "story",
  "neglect",
]);
const RANGED = Object.freeze([
  "cost",
  "people",
  "works",
  "effect",
  "years",
  "anyway",
] as const);
const IMPACT_TEXT = Object.freeze([
  "name",
  "problem",
  "source",
  "activities",
  "outputs",
  "outcomeShort",
  "outcomeMedium",
  "outcomeLong",
  "assumptions",
  "feedbackMethod",
  "feedbackFrequency",
  "comparison",
  "stopRule",
  "reviewer",
  "reviewDate",
]);
const INDICATOR_KEYS = Object.freeze([
  "what",
  "how",
  "when",
  "baseline",
  "target",
]);

export interface D1PortfolioRecord {
  allocation: Record<string, number>;
  alternative?: Record<string, number>;
  budget: number;
  state?: { w: number[]; b: number; t: number };
  method?: string;
  savedAt?: string;
}
export interface D1SavedCEModel {
  id: string;
  name: string;
  unit: string;
  discount: string;
  seed: string;
  savedAt: string;
  values: Record<(typeof RANGED)[number], [string, string, string]>;
}
export interface D1SplitPlan {
  total: number | null;
  rows: {
    id: string;
    cause: string;
    name: string;
    url: string;
    share: number | null;
    done: boolean;
  }[];
  source: string;
  savedAt?: string;
}
export interface D1CompassRecord {
  weights: Record<string, number>;
  position: Record<string, number>;
  answers: { d: number[]; s: number[] };
  savedAt: string;
}
export interface D1GrantProposal {
  id: string;
  name: string;
  savedAt?: string;
  scores: Record<string, 0 | 1 | 2 | 3 | 4 | null>;
  notes: Record<string, string>;
}
export interface D1ValueMap {
  gifts: Gift[];
  portfolio: D1PortfolioRecord;
  legacy: LegacyPlan;
  "gift-card": CardState;
  "ce-models": D1SavedCEModel[];
  "due-diligence": DiligenceState;
  "grant-proposals": D1GrantProposal[];
  "grant-weights": Record<string, number>;
  "grant-draft": D1GrantProposal | null;
  "impact-drafts": { v: 1; current: string; drafts: Draft[] };
  split: D1SplitPlan;
  compass: D1CompassRecord;
  "disaster-plan": {
    amount: number;
    shares: Record<"relief" | "recovery" | "preparedness", number>;
    what: string;
  };
  wrapped: { year: string; hide: boolean };
}

export class D1DataError extends Error {
  readonly code: "invalid_data" | "input_limit";
  readonly path: string;
  constructor(
    message: string,
    path = "$",
    code: "invalid_data" | "input_limit" = "invalid_data",
  ) {
    super(`${message} (${path})`);
    this.name = "D1DataError";
    this.code = code;
    this.path = path;
  }
}
function fail(message: string, path = "$"): never {
  throw new D1DataError(message, path);
}
type Obj = Record<string, unknown>;
export function isD1Key(key: unknown): key is D1Key {
  return (
    typeof key === "string" && (D1_KEYS as readonly string[]).includes(key)
  );
}
function requireKey(key: unknown): asserts key is D1Key {
  if (!isD1Key(key)) fail("Unknown donor tool key");
}
function freezeD1<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) freezeD1((value as Obj)[key]);
    Object.freeze(value);
  }
  return value;
}

function optionalUndefined(
  key: D1Key | "grant-bundle" | undefined,
  path: readonly (string | number)[],
): boolean {
  if (key === "grant-bundle")
    return (
      (path.length === 5 &&
        path[0] === "members" &&
        path[1] === 0 &&
        path[2] === "value" &&
        typeof path[3] === "number" &&
        path[4] === "savedAt") ||
      (path.length === 4 &&
        path[0] === "members" &&
        path[1] === 2 &&
        path[2] === "value" &&
        path[3] === "savedAt")
    );
  if (key === "legacy" || key === "split" || key === "grant-draft")
    return path.length === 1 && path[0] === "savedAt";
  if (key === "portfolio")
    return (
      path.length === 1 &&
      ["alternative", "state", "method", "savedAt"].includes(path[0] as string)
    );
  if (key === "grant-proposals")
    return (
      path.length === 2 && typeof path[0] === "number" && path[1] === "savedAt"
    );
  return (
    key === "gifts" &&
    path.length === 2 &&
    typeof path[0] === "number" &&
    (path[1] === "note" || path[1] === "sample")
  );
}

/** Own plain-data copy. It never calls getters, toJSON or caller array methods.
 * The optional omission policy is closed to declared legacy fields only. */
export function copyD1Plain(
  input: unknown,
  maxBytes = 24_008_192,
  optionalKey?: D1Key | "grant-bundle",
): unknown {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 24_008_192)
    fail("Invalid input bound");
  if (optionalKey !== undefined && optionalKey !== "grant-bundle")
    requireKey(optionalKey);
  let bytes = 0;
  const active = new Set<object>();
  const encoder = new TextEncoder();
  function charge(count: number, path: string) {
    bytes += count;
    if (bytes > maxBytes)
      throw new D1DataError(
        "Donor input exceeds its byte limit",
        path,
        "input_limit",
      );
  }
  function stringBytes(value: string, path: string): void {
    if (value.length > maxBytes)
      throw new D1DataError(
        "Donor text exceeds its byte limit",
        path,
        "input_limit",
      );
    charge(encoder.encode(JSON.stringify(value)).byteLength, path);
  }
  function visit(
    value: unknown,
    path: string,
    depth: number,
    segments: readonly (string | number)[],
  ): unknown {
    if (depth > 32)
      throw new D1DataError("Donor JSON exceeds depth 32", path, "input_limit");
    if (value === null) {
      charge(4, path);
      return null;
    }
    if (typeof value === "string") {
      stringBytes(value, path);
      return value;
    }
    if (typeof value === "boolean") {
      charge(value ? 4 : 5, path);
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        fail("Only finite numbers are supported", path);
      charge(String(value).length, path);
      return value;
    }
    if (!value || typeof value !== "object")
      fail("Only plain JSON data is supported", path);
    if (active.has(value)) fail("Cyclic donor data is unsupported", path);
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (
      array
        ? proto !== Array.prototype
        : proto !== Object.prototype && proto !== null
    )
      fail("Custom prototypes are unsupported", path);
    if (
      array &&
      (Object.getOwnPropertyDescriptor(value, "length")?.value as number) >
        maxBytes / 2
    )
      throw new D1DataError(
        "Donor array exceeds its byte limit",
        path,
        "input_limit",
      );
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    for (const key of ownKeys) {
      if (typeof key !== "string")
        fail("Symbol properties are unsupported", path);
      const d = descriptors[key];
      if (
        !Object.hasOwn(d, "value") ||
        (!d.enumerable && !(array && key === "length"))
      )
        fail("Accessors and hidden fields are unsupported", path);
    }
    active.add(value);
    charge(2, path);
    let result: unknown;
    if (array) {
      const length = descriptors.length?.value as unknown;
      if (
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        ownKeys.length !== length + 1
      )
        fail("Sparse or decorated arrays are unsupported", path);
      // Every element contributes at least two bytes in a nonempty JSON array.
      if (length > maxBytes / 2)
        throw new D1DataError(
          "Donor array exceeds its byte limit",
          path,
          "input_limit",
        );
      const out: unknown[] = [];
      for (let i = 0; i < length; i++) {
        const d = descriptors[String(i)];
        if (!d) fail("Sparse arrays are unsupported", path);
        if (i) charge(1, path);
        out.push(visit(d.value, `${path}[${i}]`, depth + 1, [...segments, i]));
      }
      result = out;
    } else {
      const out: Obj = {};
      let count = 0;
      for (const key of ownKeys as string[]) {
        const d = descriptors[key];
        const next = `${path}.${key}`;
        const nextSegments = [...segments, key];
        if (
          d.value === undefined &&
          optionalUndefined(optionalKey, nextSegments)
        )
          continue;
        if (count++) charge(1, path);
        stringBytes(key, next);
        charge(1, next);
        Object.defineProperty(out, key, {
          value: visit(d.value, next, depth + 1, nextSegments),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      result = out;
    }
    active.delete(value);
    return result;
  }
  return visit(input, "$", 0, []);
}

function object(
  v: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  path = "$",
): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail("Expected an object", path);
  const r = v as Obj;
  for (const key of required)
    if (!Object.hasOwn(r, key)) fail(`Missing ${key}`, path);
  for (const key of Object.keys(r))
    if (!required.includes(key) && !optional.includes(key))
      fail(`Unknown field ${key}`, path);
  return r;
}
function text(
  v: unknown,
  path: string,
  max = Infinity,
  nonempty = false,
): asserts v is string {
  if (typeof v !== "string" || v.length > max || (nonempty && !v))
    fail("Invalid text", path);
}
function num(
  v: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
  integer = false,
): asserts v is number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    fail("Invalid number", path);
}
function bool(v: unknown, path: string): asserts v is boolean {
  if (typeof v !== "boolean") fail("Expected a boolean", path);
}
function one(v: unknown, values: readonly unknown[], path: string): void {
  if (!values.includes(v)) fail("Unknown choice", path);
}
function list(v: unknown, path: string, min = 0, max = Infinity): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    fail("Invalid collection size", path);
  return v;
}
function timestamp(v: unknown, path: string): void {
  text(v, path);
  if (Number.isNaN(Date.parse(v))) fail("Invalid timestamp", path);
}
function optionalStamp(r: Obj, max: number): void {
  if (Object.hasOwn(r, "savedAt")) text(r.savedAt, "$.savedAt", max, true);
}
function identity(
  v: unknown,
  path: string,
  max = Infinity,
  slug = false,
): asserts v is string {
  text(v, path, max, true);
  if (slug && !/^[A-Za-z0-9_-]{1,64}$/.test(v)) fail("Invalid identity", path);
}
function unique(rows: unknown[], path: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = (row as Obj).id as string;
    if (seen.has(id)) fail("Duplicate saved identity", path);
    seen.add(id);
  }
}
function map(
  r: unknown,
  keys: readonly string[],
  path: string,
  check: (v: unknown, p: string) => void,
  complete = true,
): Obj {
  const o = object(r, complete ? keys : [], complete ? [] : keys, path);
  for (const key of Object.keys(o)) check(o[key], `${path}.${key}`);
  return o;
}
function cleaned(
  v: unknown,
  path: string,
  max: number,
  required = false,
): void {
  text(v, path, max, required);
  if (v !== v.replace(/\s+/g, " ").trim())
    fail("Saved text would require cleaning", path);
}

function gifts(value: unknown): void {
  const rows = list(value, "$");
  for (const [i, v] of rows.entries()) {
    const p = `$[${i}]`;
    const r = object(
      v,
      ["id", "date", "organization", "amount", "cause", "depth"],
      ["note", "sample"],
      p,
    );
    cleaned(r.id, `${p}.id`, 64, true);
    cleaned(r.organization, `${p}.organization`, 120, true);
    text(r.date, `${p}.date`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      Number.isNaN(Date.parse(`${r.date}T00:00:00Z`)) ||
      new Date(`${r.date}T00:00:00Z`).toISOString().slice(0, 10) !== r.date
    )
      fail("Invalid calendar day", `${p}.date`);
    num(r.amount, `${p}.amount`, Number.MIN_VALUE, 1e10);
    if (r.amount >= 1e10 || Math.round(r.amount * 100) / 100 !== r.amount)
      fail("Invalid gift amount", `${p}.amount`);
    one(r.cause, GIFT_CAUSES, `${p}.cause`);
    if (r.depth !== null) num(r.depth, `${p}.depth`, 0, 4, true);
    if (Object.hasOwn(r, "note")) cleaned(r.note, `${p}.note`, 200, true);
    if (Object.hasOwn(r, "sample") && r.sample !== true)
      fail("Sample must be true or omitted", `${p}.sample`);
  }
  unique(rows, "$");
}
function portfolio(value: unknown): void {
  const r = object(
    value,
    ["allocation", "budget"],
    ["alternative", "state", "method", "savedAt"],
  );
  const allocation = (v: unknown, p: string) => {
    const o = map(v, CAUSES, p, (n, q) => num(n, q, 0, 1), false);
    if (!Object.keys(o).length) fail("Empty allocation", p);
  };
  allocation(r.allocation, "$.allocation");
  num(r.budget, "$.budget", 0);
  if (Object.hasOwn(r, "alternative"))
    allocation(r.alternative, "$.alternative");
  if (Object.hasOwn(r, "state")) {
    const s = object(r.state, ["w", "b", "t"], [], "$.state");
    list(s.w, "$.state.w", 8, 8).forEach((v, i) =>
      num(v, `$.state.w[${i}]`, 0, 100),
    );
    num(s.b, "$.state.b", 0);
    num(s.t, "$.state.t", -100, 100);
  }
  if (Object.hasOwn(r, "method")) text(r.method, "$.method", Infinity, true);
  if (Object.hasOwn(r, "savedAt")) text(r.savedAt, "$.savedAt", Infinity, true);
}
function legacy(value: unknown): void {
  const r = object(
    value,
    ["name", "place", "gifts", "flexible", "notes"],
    ["savedAt"],
  );
  text(r.name, "$.name", 100);
  text(r.place, "$.place", 100);
  text(r.notes, "$.notes", 2000);
  bool(r.flexible, "$.flexible");
  optionalStamp(r, 40);
  const rows = list(r.gifts, "$.gifts", 1);
  rows.forEach((v, i) => {
    const p = `$.gifts[${i}]`;
    const g = object(
      v,
      [
        "id",
        "charity",
        "legal",
        "ein",
        "type",
        "amount",
        "percent",
        "condition",
        "purpose",
        "purposeText",
      ],
      [],
      p,
    );
    identity(g.id, `${p}.id`, 64, true);
    for (const [key, max] of Object.entries({
      charity: 120,
      legal: 200,
      ein: 20,
      amount: 30,
      percent: 10,
      condition: 200,
      purposeText: 200,
    }))
      text(g[key], `${p}.${key}`, max);
    one(g.type, ["specific", "percent", "residue", "contingent"], `${p}.type`);
    one(g.purpose, ["unrestricted", "restricted"], `${p}.purpose`);
  });
  unique(rows, "$.gifts");
}
function card(value: unknown): void {
  const r = object(value, [
    "to",
    "from",
    "charity",
    "does",
    "message",
    "reasons",
    "style",
  ]);
  for (const [key, max] of Object.entries({
    to: 60,
    from: 60,
    charity: 80,
    does: 220,
    message: 420,
  }))
    text(r[key], `$.${key}`, max);
  one(r.style, ["classic", "modern", "seal"], "$.style");
  list(r.reasons, "$.reasons", 0, 3).forEach((v, i) =>
    one(v, REASONS, `$.reasons[${i}]`),
  );
}
function ce(value: unknown): void {
  const rows = list(value, "$");
  rows.forEach((v, i) => {
    const p = `$[${i}]`;
    const r = object(
      v,
      ["id", "name", "unit", "discount", "seed", "savedAt", "values"],
      [],
      p,
    );
    identity(r.id, `${p}.id`);
    for (const key of ["name", "unit", "discount", "seed"])
      text(r[key], `${p}.${key}`);
    timestamp(r.savedAt, `${p}.savedAt`);
    map(r.values, RANGED, `${p}.values`, (v, q) =>
      list(v, q, 3, 3).forEach((n, j) => text(n, `${q}[${j}]`)),
    );
  });
  unique(rows, "$");
}
function diligence(value: unknown): void {
  const r = object(value, ["v", "current", "orgs"]);
  if (r.v !== 1) fail("Unsupported diligence version");
  text(r.current, "$.current");
  const rows = list(r.orgs, "$.orgs", 0, 100);
  rows.forEach((v, i) => {
    const p = `$.orgs[${i}]`;
    const o = object(
      v,
      ["id", "name", "answers", "notes", "createdAt", "updatedAt"],
      [],
      p,
    );
    identity(o.id, `${p}.id`, 80);
    text(o.name, `${p}.name`, 160);
    map(
      o.answers,
      QUESTIONS,
      `${p}.answers`,
      (v, q) => one(v, ["yes", "no", "unknown", "na"], q),
      false,
    );
    map(o.notes, QUESTIONS, `${p}.notes`, (v, q) => text(v, q, 2000), false);
    timestamp(o.createdAt, `${p}.createdAt`);
    timestamp(o.updatedAt, `${p}.updatedAt`);
  });
  unique(rows, "$.orgs");
  if (r.current !== "" && !rows.some((o) => (o as Obj).id === r.current))
    fail("Unknown current organization", "$.current");
}
function proposal(value: unknown, allowEmpty: boolean, p = "$"): void {
  const r = object(value, ["id", "name", "scores", "notes"], ["savedAt"], p);
  text(r.id, `${p}.id`, Infinity, !allowEmpty);
  text(r.name, `${p}.name`, 120);
  if (Object.hasOwn(r, "savedAt")) text(r.savedAt, `${p}.savedAt`);
  map(r.scores, D1_GRANT_DIMENSIONS, `${p}.scores`, (v, q) => {
    if (v !== null) num(v, q, 0, 4, true);
  });
  map(r.notes, D1_GRANT_DIMENSIONS, `${p}.notes`, (v, q) => text(v, q, 4000));
}
function impact(value: unknown): void {
  const r = object(value, ["v", "current", "drafts"]);
  if (r.v !== 1) fail("Unsupported measurement version");
  text(r.current, "$.current");
  const rows = list(r.drafts, "$.drafts", 1, 50);
  rows.forEach((v, i) => {
    const p = `$.drafts[${i}]`;
    const d = object(
      v,
      [
        "id",
        ...IMPACT_TEXT,
        "depth",
        "indicators",
        "example",
        "createdAt",
        "updatedAt",
      ],
      [],
      p,
    );
    identity(d.id, `${p}.id`, 80);
    for (const key of IMPACT_TEXT) text(d[key], `${p}.${key}`, 5000);
    if (
      d.reviewDate !== "" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(d.reviewDate as string)
    )
      fail("Invalid review date shape", `${p}.reviewDate`);
    if (d.depth !== null) num(d.depth, `${p}.depth`, 0, 4, true);
    list(d.indicators, `${p}.indicators`, 0, 30).forEach((v, j) => {
      const q = `${p}.indicators[${j}]`;
      const row = object(v, INDICATOR_KEYS, [], q);
      for (const key of INDICATOR_KEYS) text(row[key], `${q}.${key}`, 5000);
    });
    bool(d.example, `${p}.example`);
    timestamp(d.createdAt, `${p}.createdAt`);
    timestamp(d.updatedAt, `${p}.updatedAt`);
  });
  unique(rows, "$.drafts");
  if (!rows.some((d) => (d as Obj).id === r.current))
    fail("Unknown current measurement draft", "$.current");
}
function split(value: unknown): void {
  const r = object(value, ["total", "rows", "source"], ["savedAt"]);
  if (r.total !== null) {
    num(r.total, "$.total", 1, 1e10, true);
    if (r.total >= 1e10) fail("Total is too large", "$.total");
  }
  text(r.source, "$.source", 200);
  optionalStamp(r, 40);
  const rows = list(r.rows, "$.rows", 1);
  rows.forEach((v, i) => {
    const p = `$.rows[${i}]`;
    const row = object(
      v,
      ["id", "cause", "name", "url", "share", "done"],
      [],
      p,
    );
    identity(row.id, `${p}.id`, 64, true);
    one(row.cause, GIFT_CAUSES, `${p}.cause`);
    text(row.name, `${p}.name`, 120);
    text(row.url, `${p}.url`, 2000);
    if (row.share !== null) num(row.share, `${p}.share`, 0);
    bool(row.done, `${p}.done`);
  });
  unique(rows, "$.rows");
}
function compass(value: unknown): void {
  const r = object(value, ["weights", "position", "answers", "savedAt"]);
  const a = object(r.answers, ["d", "s"], [], "$.answers");
  list(a.d, "$.answers.d", 5, 5).forEach((v, i) =>
    num(v, `$.answers.d[${i}]`, 0, 100),
  );
  list(a.s, "$.answers.s", 8, 8).forEach((v, i) =>
    num(v, `$.answers.s[${i}]`, 0, 4, true),
  );
  const w = map(r.weights, D1_FRAMEWORKS, "$.weights", (v, p) =>
    num(v, p, 0, 4, true),
  );
  const pos = map(r.position, D1_DIMENSIONS, "$.position", (v, p) =>
    num(v, p, 0, 1),
  );
  D1_FRAMEWORKS.forEach((id, i) => {
    if (w[id] !== (a.s as number[])[i])
      fail("Weights differ from answers", `$.weights.${id}`);
  });
  D1_DIMENSIONS.forEach((id, i) => {
    if (pos[id] !== (a.d as number[])[i] / 100)
      fail("Position differs from answers", `$.position.${id}`);
  });
  timestamp(r.savedAt, "$.savedAt");
}
function disaster(value: unknown): void {
  const r = object(value, ["amount", "shares", "what"]);
  num(r.amount, "$.amount", 0);
  text(r.what, "$.what", 120);
  const shares = map(
    r.shares,
    ["relief", "recovery", "preparedness"],
    "$.shares",
    (v, p) => num(v, p, 0, 100, true),
  );
  if (
    (shares.relief as number) +
      (shares.recovery as number) +
      (shares.preparedness as number) !==
    100
  )
    fail("Disaster shares must total 100", "$.shares");
}
const CHECKS: Record<D1Key, (value: unknown) => void> = {
  gifts,
  portfolio,
  legacy,
  "gift-card": card,
  "ce-models": ce,
  "due-diligence": diligence,
  "grant-proposals": (value) => {
    const rows = list(value, "$");
    rows.forEach((v, i) => proposal(v, false, `$[${i}]`));
    unique(rows, "$");
  },
  "grant-weights": (value) => {
    map(value, D1_GRANT_DIMENSIONS, "$", (v, p) => num(v, p, 0, 10, true));
  },
  "grant-draft": (value) => {
    if (value !== null) proposal(value, true);
  },
  "impact-drafts": impact,
  split,
  compass,
  "disaster-plan": disaster,
  wrapped: (value) => {
    const r = object(value, ["year", "hide"]);
    text(r.year, "$.year");
    bool(r.hide, "$.hide");
  },
};
Object.freeze(CHECKS);

/** Canonical saved-shape validation only; no cleaner, generated identity or time. */
export function validateD1Value<K extends D1Key>(
  key: K,
  input: unknown,
): D1ValueMap[K] {
  requireKey(key);
  const owned = copyD1Plain(input, 8_000_000, key);
  CHECKS[key](owned);
  return freezeD1(owned as D1ValueMap[K]);
}

export function canonicalD1Json(input: unknown): string {
  const owned = copyD1Plain(input);
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) {
      const a = [];
      for (let i = 0; i < v.length; i++) a.push(stable(v[i]));
      return a;
    }
    if (v && typeof v === "object") {
      const out = Object.create(null) as Obj;
      for (const key of Object.keys(v).sort())
        out[key] = stable((v as Obj)[key]);
      return out;
    }
    return v;
  }
  return JSON.stringify(stable(owned));
}

/** Fresh valid absent-key form only. Never called to repair a saved record. */
export function d1DefaultValue<K extends D1Key>(key: K): D1ValueMap[K] {
  requireKey(key);
  const stamp = new Date().toISOString();
  const id = () =>
    globalThis.crypto?.randomUUID?.() ??
    `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const emptyBequest = () => ({
    id: id(),
    charity: "",
    legal: "",
    ein: "",
    type: "specific",
    amount: "",
    percent: "",
    condition: "",
    purpose: "unrestricted",
    purposeText: "",
  });
  const impactId = key === "impact-drafts" ? id() : "";
  const blankImpact = () => ({
    id: impactId,
    ...Object.fromEntries(IMPACT_TEXT.map((k) => [k, ""])),
    depth: null,
    indicators: [Object.fromEntries(INDICATOR_KEYS.map((k) => [k, ""]))],
    example: false,
    createdAt: stamp,
    updatedAt: stamp,
  });
  let value: unknown;
  switch (key) {
    case "gifts":
    case "ce-models":
    case "grant-proposals":
      value = [];
      break;
    case "grant-draft":
      value = null;
      break;
    case "grant-weights":
      value = Object.fromEntries(D1_GRANT_DIMENSIONS.map((d) => [d, 5]));
      break;
    case "legacy":
      value = {
        name: "",
        place: "",
        gifts: [emptyBequest()],
        flexible: true,
        notes: "",
      };
      break;
    case "gift-card":
      value = {
        to: "",
        from: "",
        charity: "",
        does: "",
        message: "",
        reasons: [],
        style: "classic",
      };
      break;
    case "due-diligence": {
      const current = id();
      value = {
        v: 1,
        current,
        orgs: [
          {
            id: current,
            name: "",
            answers: {},
            notes: {},
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
      };
      break;
    }
    case "impact-drafts":
      value = { v: 1, current: impactId, drafts: [blankImpact()] };
      break;
    case "split":
      value = {
        total: null,
        rows: [0, 1].map(() => ({
          id: id(),
          cause: "other",
          name: "",
          url: "",
          share: 50,
          done: false,
        })),
        source: "Started from a blank plan.",
      };
      break;
    case "portfolio": {
      const weights = normalize(
        Object.fromEntries(D1_FRAMEWORKS.map((f) => [f, 50])),
      );
      value = {
        allocation: allocateShares(weights),
        alternative: allocateBest(weights),
        budget: 1000,
        state: { w: D1_FRAMEWORKS.map(() => 50), b: 1000, t: 0 },
        method: "shares",
        savedAt: stamp,
      };
      break;
    }
    case "compass":
      value = {
        weights: Object.fromEntries(D1_FRAMEWORKS.map((f) => [f, 2])),
        position: Object.fromEntries(D1_DIMENSIONS.map((d) => [d, 0.5])),
        answers: { d: [50, 50, 50, 50, 50], s: [2, 2, 2, 2, 2, 2, 2, 2] },
        savedAt: stamp,
      };
      break;
    case "disaster-plan":
      value = {
        amount: 100,
        shares: { relief: 50, recovery: 30, preparedness: 20 },
        what: "",
      };
      break;
    case "wrapped":
      value = { year: "", hide: false };
      break;
  }
  return validateD1Value(key, value);
}
