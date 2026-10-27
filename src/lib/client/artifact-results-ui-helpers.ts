import type { Draft, Estimate } from "./artifact-results-model";

/** Invalidates work on edits, navigation and foreign saves, including delayed file reads. */
export function artifactUiGeneration() {
  let generation = 0;
  return {
    current: () => generation,
    invalidate: () => ++generation,
    matches: (token: number) => token === generation,
  };
}
export function artifactPage<T>(rows: T[], requested: number, size = 25) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages - 1, Math.max(0, Math.trunc(requested) || 0));
  return {
    page,
    pages,
    total: rows.length,
    rows: rows.slice(page * size, (page + 1) * size),
  };
}
/** Blank is unknown; zero, negative values and finite decimals stay distinct. */
export function artifactNumber(raw: string, label: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw Error(`${label} must be a finite number or left blank for unknown.`);
  return value;
}
export async function readArtifactFile<T>(
  read: () => Promise<T>,
  timeoutMs = 30_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "The selected file could not be read in time. Choose a fresh local copy. No records were changed.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
export function artifactJson<T>(raw: string | undefined, label: string): T {
  try {
    return JSON.parse(raw ?? "") as T;
  } catch {
    throw Error(
      `${label} contains unfinished JSON. Its exact text is retained for repair.`,
    );
  }
}
export function artifactErrorMessage(error: unknown): string {
  if (!(error instanceof Error))
    return "This action could not be completed. Your form has been kept.";
  const issues = (
    error as Error & { issues?: { path: string; message: string }[] }
  ).issues;
  return issues?.length
    ? `${error.message} ${issues
        .slice(0, 5)
        .map((i) => `${i.path}: ${i.message}`)
        .join(" ")}`
    : error.message;
}
/** The recovery format deliberately cannot be confused with a validated workspace backup. */
export function rawArtifactFormRecovery(
  form: Draft["form"],
  exportedAt: string,
): string {
  return (
    "Unfinished raw form recovery; not a valid workspace backup or research record\n" +
    JSON.stringify({ exportedAt, form }, null, 2)
  );
}
export function blankArtifactEstimate(): Estimate {
  return {
    estimate: null,
    lower: null,
    upper: null,
    intervalLevel: null,
    unit: null,
    measure: null,
    population: null,
    timeHorizon: null,
    denominator: null,
    source: null,
  };
}
