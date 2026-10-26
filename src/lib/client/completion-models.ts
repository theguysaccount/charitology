/** Local publication workspaces describe evidence; no output grants a review or a rating. */
export type DepthRow = {
  id: string;
  activity: string;
  amount: number;
  depth: string;
  source: string;
};
export type DepthSample = { currency: string; rows: DepthRow[] };
export function validateDepthSample(value: unknown): value is DepthSample {
  const x = value as DepthSample;
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.currency === "string" &&
    /^[A-Z]{3}$/.test(x.currency) &&
    Array.isArray(x.rows) &&
    x.rows.length <= 1000 &&
    new Set(x.rows.map((r) => r?.id)).size === x.rows.length &&
    x.rows.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        r.id.length > 0 &&
        r.id.length < 100 &&
        typeof r.activity === "string" &&
        !!r.activity.trim() &&
        r.activity.length <= 200 &&
        Number.isFinite(r.amount) &&
        r.amount >= 0 &&
        r.amount <= 1e9 &&
        Math.abs(r.amount * 100 - Math.round(r.amount * 100)) < 0.0001 &&
        ["unknown", "0", "1", "2", "3", "4"].includes(r.depth) &&
        typeof r.source === "string" &&
        !!r.source.trim() &&
        r.source.length <= 5000,
    )
  );
}
export function depthCoverage(sample: DepthSample) {
  const cents = sample.rows.reduce((n, r) => n + Math.round(r.amount * 100), 0);
  const unknown = sample.rows
    .filter((r) => r.depth === "unknown")
    .reduce((n, r) => n + Math.round(r.amount * 100), 0);
  return {
    total: cents / 100,
    unknown: unknown / 100,
    classifiedShare: cents ? (cents - unknown) / cents : null,
  };
}
export const nominationFields = [
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
] as const;
export const nominationDepths = [
  "unknown",
  "0 · Relief",
  "1 · Repair",
  "2 · Prevention",
  "3 · Structure",
  "4 · Source",
  "Multiple levels; explain below",
] as const;
const nominationLimits = [
  180, 180, 100, 5000, 5000, 10000, 5000, 5000, 5000, 3000,
];
export type Nomination = { id: string; [key: string]: string };
export function validateNominations(value: unknown): value is Nomination[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    new Set(value.map((r) => r?.id)).size === value.length &&
    value.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        r.id.length > 0 &&
        r.id.length < 100 &&
        nominationDepths.includes(r.depth) &&
        nominationFields.every(
          (f, i) =>
            typeof r[f] === "string" &&
            !!r[f].trim() &&
            r[f].length <= nominationLimits[i],
        ),
    )
  );
}
export const manuscriptFields = [
  "title",
  "author",
  "summary",
  "kind",
  "question",
  "methods",
  "results",
  "limits",
  "sources",
] as const;
export const manuscriptKinds = [
  "Proposed method",
  "Research result",
  "Replication",
  "Null result or failure report",
  "Essay",
] as const;
const manuscriptLimits = [
  200, 150, 1500, 100, 10000, 20000, 20000, 10000, 10000,
];
/** Partial drafts are valid backups; the select value must survive a restore. */
export function validateManuscript(
  value: unknown,
): value is Record<(typeof manuscriptFields)[number], string> {
  const x = value as Record<string, string>;
  return (
    !!x &&
    typeof x === "object" &&
    !Array.isArray(x) &&
    manuscriptKinds.includes(x.kind as (typeof manuscriptKinds)[number]) &&
    manuscriptFields.every(
      (f, i) => typeof x[f] === "string" && x[f].length <= manuscriptLimits[i],
    )
  );
}

export function safeCsvText(value: string): string {
  return /^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
}
