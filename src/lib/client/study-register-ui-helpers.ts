import type { ImportAssignment } from "./study-register-import";
import type { CitationColumn } from "./study-register-import";

/** One token covers user edits, navigation and external saves, not just requests. */
export function studyUiGeneration() {
  let value = 0;
  return {
    current: () => value,
    invalidate: () => ++value,
    matches: (token: number) => token === value,
  };
}

export function studyPage<T>(rows: T[], requestedPage: number, size = 25) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages - 1, Math.max(0, Math.trunc(requestedPage) || 0));
  return {
    page,
    pages,
    total: rows.length,
    rows: rows.slice(page * size, (page + 1) * size),
  };
}

/** Empty is unknown; an explicitly typed zero remains a measurement. */
export function studyNumber(raw: string, label: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(
      `${label} must be a finite number or left blank for unknown.`,
    );
  return value;
}

export function studyColumnMap(
  raw: string,
): Partial<Record<CitationColumn, number>> {
  const value: unknown = JSON.parse(raw);
  const allowed = [
    "title",
    "authors",
    "year",
    "doi",
    "pmid",
    "url",
    "abstract",
  ];
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.entries(value).some(
      ([key, index]) =>
        !allowed.includes(key) ||
        !Number.isInteger(index) ||
        Number(index) < 0 ||
        Number(index) >= 30,
    )
  )
    throw Error(
      "The saved column mapping is invalid. Reselect the file and map its columns again.",
    );
  return { ...value } as Partial<Record<CitationColumn, number>>;
}

export async function readStudyFile<T>(
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

export interface AssignmentInput {
  row: number;
  existingReportId: string | null;
  group: string;
  canonicalRow: number;
}

/** Complete, explicit assignments; the model independently rechecks them at commit. */
export function studyImportAssignments(
  rows: number[],
  inputs: AssignmentInput[],
  existing: { id: string; revision: number }[],
): ImportAssignment[] {
  const rowSet = new Set(rows);
  if (
    rowSet.size !== rows.length ||
    inputs.length !== rows.length ||
    new Set(inputs.map((x) => x.row)).size !== rows.length
  )
    throw new Error("Every preview row needs exactly one assignment.");
  const reports = new Map(existing.map((x) => [x.id, x.revision]));
  const groups = new Map<string, AssignmentInput[]>();
  for (const input of inputs) {
    if (!rowSet.has(input.row))
      throw new Error("An assignment refers to a row outside this preview.");
    if (input.existingReportId) {
      if (!reports.has(input.existingReportId))
        throw new Error(
          "The selected existing report is no longer current. Preview again.",
        );
    } else {
      const group = input.group.trim();
      if (!group || group.length > 100)
        throw new Error(
          `Row ${input.row} needs a group label of at most 100 characters.`,
        );
      const members = groups.get(group) || [];
      members.push(input);
      groups.set(group, members);
    }
  }
  for (const [label, members] of groups) {
    const canonical = members[0].canonicalRow;
    if (
      !members.some((member) => member.row === canonical) ||
      members.some((member) => member.canonicalRow !== canonical)
    )
      throw new Error(
        `Group ${label} must name one of its own rows as the same canonical row.`,
      );
  }
  return inputs.map((input) => ({
    row: input.row,
    target: input.existingReportId
      ? {
          kind: "existing" as const,
          reportId: input.existingReportId,
          reportRevision: reports.get(input.existingReportId)!,
        }
      : {
          kind: "new" as const,
          group: input.group.trim(),
          canonicalRow: input.canonicalRow,
        },
  }));
}

export function studyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const issues = (
      error as Error & { issues?: { path: string; message: string }[] }
    ).issues;
    return issues?.length
      ? `${error.message} ${issues
          .slice(0, 5)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join(" ")}`
      : error.message;
  }
  return "This action could not be completed. Your form has been kept.";
}
