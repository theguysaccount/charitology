import {
  PROGRAM_GRAPH_LIMITS,
  canonicalProgramGraphJson,
  programGraphLinkState,
  type GraphDraft,
  type Program,
  type ProgramGraphState,
} from "./program-graph-model";

export const PROGRAM_GRAPH_PROGRAMS: readonly Program[] = [
  "the-charitology-fund",
  "charity-incubator",
  "question-bounties",
  "the-charitology-prize",
  "charitology-fellowship",
  "charitology-summit",
  "donor-advisory",
  "nonprofit-advisory",
  "field-verification",
];
export const programGraphLabel = (value: string): string =>
  value
    .replace(/^the-/, "")
    .split("-")
    .map((v) => v.charAt(0).toUpperCase() + v.slice(1))
    .join(" ");
export function knownProgram(value: string | undefined): value is Program {
  return PROGRAM_GRAPH_PROGRAMS.includes(value as Program);
}
export function programGraphSourceKey(program: Program): string {
  if (!knownProgram(program)) throw Error("Choose a known program.");
  return `charitology.partner-workspace-v1.${program}`;
}
export function graphRawJson<T>(
  raw: string | undefined,
  check: (value: unknown) => value is T,
): T {
  if (typeof raw !== "string" || !raw.trim())
    throw Error(
      "This unfinished JSON field needs repair; an empty value is not null.",
    );
  const value: unknown = JSON.parse(raw);
  if (!check(value))
    throw Error(
      "The saved raw field does not have the required shape. Repair it without changing its binding.",
    );
  return value;
}
export const graphStringIds = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
export const graphIndexes = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && x >= 0);
export function graphRawRecovery(draft: GraphDraft): string {
  return (
    "Charitology program graph — unfinished raw form recovery\nThis is plain recovery text, NOT a validated graph backup. It includes private unfinished fields and their original bindings.\n\n" +
    JSON.stringify(draft, null, 2) +
    "\n"
  );
}
export function graphPage<T>(
  values: readonly T[],
  requested: number,
): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(values.length / 25));
  const page = Math.max(0, Math.min(pages - 1, requested));
  return { rows: values.slice(page * 25, page * 25 + 25), page, pages };
}
/** Two undirected hops are a presentation cap, never a stored or export closure. */
export function graphConnected(
  state: ProgramGraphState,
  start: string,
  states: readonly string[],
) {
  if (!state.nodes.some((n) => n.id === start))
    return { nodeIds: [], linkIds: [], truncated: false };
  const allowed = state.links.filter((l) =>
    states.includes(programGraphLinkState(state, l.id).state),
  );
  const discovered = new Set([start]);
  let frontier = [start],
    truncated = false;
  for (let hop = 0; hop < 2; hop++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const link of allowed) {
        const neighbor =
          link.from === id ? link.to : link.to === id ? link.from : null;
        if (neighbor && !discovered.has(neighbor)) {
          if (discovered.size >= 200) {
            truncated = true;
            continue;
          }
          discovered.add(neighbor);
          next.push(neighbor);
        }
      }
    frontier = next;
  }
  return {
    nodeIds: [...discovered],
    linkIds: allowed
      .filter((l) => discovered.has(l.from) && discovered.has(l.to))
      .map((l) => l.id),
    truncated,
  };
}
/** Bound before requesting bytes, and prevent a stalled file provider keeping the UI busy forever. */
export async function readGraphFile(
  file: File,
  limit: number = PROGRAM_GRAPH_LIMITS.sourceBytes,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit)
    throw Error(
      `Choose a file no larger than ${limit.toLocaleString()} bytes. Nothing was changed.`,
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const buffer = await Promise.race([
      file.arrayBuffer(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "The selected file could not be read within 30 seconds. Choose a fresh local copy. Nothing was changed.",
              ),
            ),
          30_000,
        );
      }),
    ]);
    if (buffer.byteLength > limit)
      throw Error(
        "The file grew beyond the allowed bound. Nothing was changed.",
      );
    return new Uint8Array(buffer);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export const graphSame = (a: unknown, b: unknown) =>
  canonicalProgramGraphJson(a) === canonicalProgramGraphJson(b);
