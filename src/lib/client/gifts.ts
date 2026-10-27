// The gift log shared by the Giving Dashboard and Charitology Wrapped.
// Gifts live only in this browser, as the array saved under "gifts".
// Everything here is pure except loadGifts/saveGifts, so imports, exports
// and summaries behave the same in every tool that reads the log.

import causesData from "../../data/causes.json";
import depthScale from "../../data/depth.json";
import { csvRecords } from "./csv";
import { toCsv } from "./files";
import { parseAmount } from "./format";
import {
  readD1Dependency,
  type D1ToolSession,
  type D1SaveResult,
} from "./donor-recovery";

export interface Gift {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  organization: string;
  /** U.S. dollars, rounded to cents. */
  amount: number;
  /** A cause id from src/data/causes.json, or "other". */
  cause: string;
  /** Source depth: 0 Relief, 1 Repair, 2 Prevention, 3 Structure, 4 Source. */
  depth: number | null;
  note?: string;
  /** Fictional gifts added by "Try sample data". */
  sample?: boolean;
}

export const OTHER = { id: "other", name: "Other or not sure" };
export const CAUSES: { id: string; name: string }[] = [
  ...causesData.causes.map((c) => ({ id: c.id, name: c.name })),
  OTHER,
];
export const DEPTHS = depthScale;
export const LEVELS = [0, 1, 2, 3, 4];

export function causeName(id: string): string {
  return CAUSES.find((c) => c.id === id)?.name ?? OTHER.name;
}

export function depthName(level: number | null): string {
  return DEPTHS.find((d) => d.level === level)?.name ?? "Unclassified";
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in the viewer's own time zone (format.ts todayISO() is the UTC date). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const localToday = (): string => isoDate(new Date());

export function validDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** Accept ISO dates, and the M/D/YYYY dates spreadsheet apps write when they re-save a CSV. */
function toDate(text: string): string {
  if (validDate(text)) return text;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) {
    const iso = `${us[3]}-${pad2(Number(us[1]))}-${pad2(Number(us[2]))}`;
    if (validDate(iso)) return iso;
  }
  return "";
}

/** "Mar 2, 2026", read without time-zone shifts. */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" || typeof v === "number"
    ? String(v).replace(/\s+/g, " ").trim().slice(0, max)
    : "";

function toAmount(v: unknown): number {
  const n = typeof v === "number" ? v : parseAmount(String(v ?? ""));
  return Number.isFinite(n) && n > 0 && n < 1e10
    ? Math.round(n * 100) / 100
    : NaN;
}

function toCause(v: unknown): string {
  const s = clean(v, 80).toLowerCase();
  if (!s) return "";
  return (
    CAUSES.find((c) => c.id === s || c.name.toLowerCase() === s)?.id ?? OTHER.id
  );
}

function toDepth(v: unknown): number | null {
  if (
    v === null ||
    v === undefined ||
    (typeof v === "string" &&
      (v.trim() === "" || /^(unknown|unclassified|not set)$/i.test(v.trim())))
  )
    return null;
  if (typeof v !== "number" && typeof v !== "string") return NaN;
  if (typeof v === "number")
    return Number.isInteger(v) && v >= 0 && v <= 4 ? v : NaN;
  const s = clean(v, 60).toLowerCase();
  const lead = /^([0-4])(?![0-9.])/.exec(s);
  if (lead) return Number(lead[1]);
  return DEPTHS.find((d) => d.name.toLowerCase() === s)?.level ?? NaN;
}

/** A valid gift from loose input (a stored gift, a JSON object or a CSV row), or undefined. */
export function sanitizeGift(raw: unknown): Gift | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const pick = (...keys: string[]) =>
    keys.map((k) => r[k]).find((v) => v != null && v !== "");
  const date = toDate(clean(pick("date", "day", "given_on"), 10));
  const organization = clean(
    pick("organization", "organisation", "org", "charity", "recipient", "name"),
    120,
  );
  const amount = toAmount(pick("amount", "usd", "value"));
  const depth = toDepth(pick("depth", "depth_level", "level", "depth_name"));
  if (
    !date ||
    !organization ||
    !Number.isFinite(amount) ||
    (depth !== null && !Number.isFinite(depth))
  )
    return undefined;
  const cause = toCause(pick("cause", "cause_id", "cause_name")) || OTHER.id;
  const note = clean(pick("note", "notes", "memo"), 200);
  const id = clean(pick("id"), 64) || newId();
  const sample =
    r.sample === true || String(r.sample ?? "").toLowerCase() === "true";
  return {
    id,
    date,
    organization,
    amount,
    cause,
    depth,
    ...(note ? { note } : {}),
    ...(sample ? { sample: true } : {}),
  };
}

/** Read the saved gift log without acquiring a writer or rewriting IDs. */
export async function loadGifts() {
  return readD1Dependency("charitology-wrapped");
}
/** The Dashboard supplies its already-open, fixed-key writer. */
export async function saveGifts(
  session: D1ToolSession<Gift[]>,
  gifts: Gift[],
): Promise<D1SaveResult<Gift[]>> {
  return session.saveCaptured(session.captureSave(gifts));
}

export const yearOf = (g: Gift): string => g.date.slice(0, 4);

/** Years with gifts, newest first. */
export function yearsOf(gifts: Gift[]): string[] {
  return [...new Set(gifts.map(yearOf))].sort((a, b) => b.localeCompare(a));
}

export function inYear(gifts: Gift[], year: string): Gift[] {
  return year === "all" ? gifts : gifts.filter((g) => yearOf(g) === year);
}

/** Newest first; gifts on the same day keep the order they were logged. */
export function sortGifts(gifts: Gift[]): Gift[] {
  return gifts
    .map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.date.localeCompare(a.g.date) || b.i - a.i)
    .map((x) => x.g);
}

export interface CauseTotal {
  id: string;
  name: string;
  amount: number;
  count: number;
}

export interface Summary {
  total: number;
  count: number;
  organizations: number;
  /** Largest first. */
  byCause: CauseTotal[];
  /** Dollars at each depth level, 0 to 4. */
  byDepth: number[];
  /** Number of gifts at each depth level. */
  depthCounts: number[];
  /** Fraction of dollars at each depth level. */
  shares: number[];
  /** Fraction of dollars at structure and source (levels 3 and 4). NaN with no gifts. */
  sourceShare: number;
  /** All gifts count in totals; these amounts have no depth classification yet. */
  unclassified: number;
  unclassifiedCount: number;
  classified: number;
}

const orgKey = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

export function summarize(gifts: Gift[]): Summary {
  // Sum in cents so totals don't drift.
  const depthCents = [0, 0, 0, 0, 0];
  const depthCounts = [0, 0, 0, 0, 0];
  const causes = new Map<
    string,
    { id: string; cents: number; count: number }
  >();
  const orgs = new Set<string>();
  let cents = 0;
  let unclassifiedCents = 0,
    unclassifiedCount = 0;
  for (const g of gifts) {
    const c = Math.round(g.amount * 100);
    cents += c;
    if (g.depth === null) {
      unclassifiedCents += c;
      unclassifiedCount++;
    } else {
      depthCents[g.depth] += c;
      depthCounts[g.depth] += 1;
    }
    orgs.add(orgKey(g.organization));
    const row = causes.get(g.cause) ?? { id: g.cause, cents: 0, count: 0 };
    row.cents += c;
    row.count += 1;
    causes.set(g.cause, row);
  }
  const byCause = [...causes.values()]
    .map((c) => ({
      id: c.id,
      name: causeName(c.id),
      amount: c.cents / 100,
      count: c.count,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return {
    total: cents / 100,
    count: gifts.length,
    organizations: orgs.size,
    byCause,
    byDepth: depthCents.map((c) => c / 100),
    depthCounts,
    shares: depthCents.map((c) => (cents > 0 ? c / cents : 0)),
    sourceShare: cents > 0 ? (depthCents[3] + depthCents[4]) / cents : NaN,
    unclassified: unclassifiedCents / 100,
    unclassifiedCount,
    classified: (cents - unclassifiedCents) / 100,
  };
}

export const hasSamples = (gifts: Gift[]): boolean =>
  gifts.some((g) => g.sample);

// Clearly fictional gifts for "Try sample data": [days ago, organization, amount, cause, depth, note].
const SAMPLES: [number, string, number, string, number, string?][] = [
  [9, "Riverside Food Bank", 150, "hunger", 0, "Holiday meal drive"],
  [27, "Upstream Story Project", 100, "charity-system", 4, "Monthly gift"],
  [
    44,
    "Clear Water Wells Fund",
    300,
    "global-health",
    2,
    "Water filters for a school",
  ],
  [70, "Fair Housing Policy Lab", 250, "housing", 3],
  [96, "Harbor Street Shelter", 120, "housing", 0],
  [
    131,
    "Northside Job Bridge",
    200,
    "community",
    1,
    "Job training after layoffs",
  ],
  [165, "Bed Net Collective", 180, "global-health", 2],
  [204, "Hometown Animal Rescue", 75, "animals", 0],
  [238, "Civic Trust Initiative", 150, "democracy", 3],
  [282, "Riverside Food Bank", 100, "hunger", 0],
  [321, "Little Library Network", 60, "education", 2],
  [366, "Rebuild Together Fund", 220, "housing", 1, "After the spring floods"],
  [402, "Upstream Story Project", 100, "charity-system", 4],
  [447, "Riverside Food Bank", 125, "hunger", 0],
  [489, "Open Science Commons", 140, "science", 3],
  [531, "Clean Air Coalition", 160, "climate", 3],
];

/** Fictional gifts spread over the last year and a half, all marked sample. */
export function sampleGifts(today = new Date()): Gift[] {
  return SAMPLES.map(([daysAgo, org, amount, cause, depth, note], i) => ({
    id: `sample-${i + 1}`,
    date: isoDate(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - daysAgo,
      ),
    ),
    organization: `Sample: ${org}`,
    amount,
    cause,
    depth,
    ...(note ? { note } : {}),
    sample: true,
  }));
}

export const CSV_COLUMNS = [
  "id",
  "date",
  "organization",
  "amount",
  "cause",
  "cause_name",
  "depth",
  "depth_name",
  "note",
  "sample",
];

export function giftsToCsv(gifts: Gift[]): string {
  const rows = gifts.map((g) => ({
    id: g.id,
    date: g.date,
    organization: g.organization,
    amount: g.amount.toFixed(2),
    cause: g.cause,
    cause_name: causeName(g.cause),
    depth: g.depth,
    depth_name: depthName(g.depth),
    note: g.note ?? "",
    sample: g.sample ? "true" : "",
  }));
  return toCsv(rows, CSV_COLUMNS);
}

export function giftsToJson(gifts: Gift[]): string {
  return JSON.stringify(
    {
      format: "charitology-gifts",
      version: 1,
      exportedAt: new Date().toISOString(),
      gifts,
    },
    null,
    2,
  );
}

export interface Parsed {
  gifts: Gift[];
  skipped: number;
  error?: string;
}

/** Read a JSON export (an array, or an object with a "gifts" array) or a CSV with a header row. */
export function parseGiftFile(text: string, filename = ""): Parsed {
  const body = text.replace(/^﻿/, "").trim();
  if (!body) return { gifts: [], skipped: 0, error: "That file is empty." };
  let rows: unknown[];
  if (/\.json$/i.test(filename) || /^[[{]/.test(body)) {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return { gifts: [], skipped: 0, error: "That file isn’t valid JSON." };
    }
    const list = Array.isArray(data)
      ? data
      : (data as { gifts?: unknown })?.gifts;
    if (!Array.isArray(list))
      return {
        gifts: [],
        skipped: 0,
        error: "That JSON file has no list of gifts in it.",
      };
    rows = list;
  } else {
    rows = csvRecords(body);
  }
  const gifts: Gift[] = [];
  let skipped = 0;
  for (const row of rows) {
    const g = sanitizeGift(row);
    if (g) gifts.push(g);
    else skipped += 1;
  }
  return { gifts, skipped };
}

/** Add imported gifts. A gift whose id is already logged replaces it, so re-importing an export is safe. */
export function mergeGifts(
  current: Gift[],
  incoming: Gift[],
): { gifts: Gift[]; added: number; updated: number; same: number } {
  const gifts = [...current];
  const index = new Map(gifts.map((g, i) => [g.id, i]));
  let added = 0;
  let updated = 0;
  let same = 0;
  for (const g of incoming) {
    const i = index.get(g.id);
    if (i === undefined) {
      index.set(g.id, gifts.length);
      gifts.push(g);
      added += 1;
    } else if (JSON.stringify(gifts[i]) === JSON.stringify(g)) {
      same += 1;
    } else {
      gifts[i] = g;
      updated += 1;
    }
  }
  return { gifts, added, updated, same };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
