/** Strict, bounded citation import. Input previews are private and never evidence that a search ran. */
import {
  STUDY_LIMITS,
  studyFail,
  StudyError,
  canonicalStudyJson,
  studyClone,
  exactStudyObject,
  studyText,
  isStudyHash,
  isStudyId,
  validStudyDay,
  validateCitation,
  metadataFromCitation,
  normalizedDoi,
  normalizedPmid,
  identifierConflict,
  hashStudyValue,
  hashStudySync,
  studyStateHash,
  reportRevision,
  appendStudyReportRevision,
} from "./study-register-model";
import type {
  Id,
  Hash,
  Instant,
  StudyState,
  StudyIssue,
  SourceBacklink,
  ImportedCitation,
  ImportBatch,
  Metadata,
  DuplicateSuggestion,
} from "./study-register-model";
export type CitationColumn =
  "title" | "authors" | "year" | "doi" | "pmid" | "url" | "abstract";
export interface CsvInput {
  kind: "citation-csv";
  bytes: Uint8Array;
  fileName: string;
  columnMap: Partial<Record<CitationColumn, number>>;
  searchRunId: Id | null;
  provenanceNote: string | null;
}
export interface CatalogEntry extends ImportedCitation {
  entryId: string;
  publisher: string | null;
  backlinks: SourceBacklink[];
}
export interface CatalogInput {
  kind: "site-bibliography";
  entries: CatalogEntry[];
  catalogHash: Hash;
  provenanceNote: string | null;
}
export type CitationImportInput = CsvInput | CatalogInput;
export interface ImportRow {
  row: number;
  rawCells: string[];
  citation: ImportedCitation;
  backlinks: SourceBacklink[];
  issues: StudyIssue[];
}
export interface ImportAssignment {
  row: number;
  target:
    | { kind: "existing"; reportId: Id; reportRevision: number }
    | { kind: "new"; group: string; canonicalRow: number };
}
export interface ImportDuplicateSuggestion {
  hash: Hash;
  rows: number[];
  reportIds: Id[];
  reason: DuplicateSuggestion["reason"];
  identifierConflict: boolean;
}
export interface ImportPreview {
  version: 1;
  expectedStateHash: Hash;
  sourceHash: Hash;
  identityHash: Hash;
  reviewHash: Hash;
  input: CitationImportInput;
  headers: string[];
  rows: ImportRow[];
  issues: StudyIssue[];
  ignoredBlankLines: number;
  duplicateSuggestions: ImportDuplicateSuggestion[];
  capacity: {
    currentReports: number;
    currentOccurrences: number;
    currentBatches: number;
  };
  existingBatchId: Id | null;
}
const COLUMNS: readonly CitationColumn[] = [
  "title",
  "authors",
  "year",
  "doi",
  "pmid",
  "url",
  "abstract",
];
const CATALOG_HEADERS = [
  "entryId",
  "title",
  "authors",
  "year",
  "originalYear",
  "doi",
  "pmid",
  "url",
  "abstract",
  "publisher",
];
const reserved = new Set(["__proto__", "prototype", "constructor"]);
const byteHex = (bytes: Uint8Array) =>
  crypto.subtle
    .digest("SHA-256", bytes.slice().buffer)
    .then((buf) =>
      Array.from(new Uint8Array(buf), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    );
function inputSnapshot(input: CitationImportInput): unknown {
  if (input.kind !== "citation-csv") return input;
  if (!(input.bytes instanceof Uint8Array))
    studyFail("csv", "Choose actual CSV file bytes.");
  if (input.bytes.length > STUDY_LIMITS.csvBytes)
    studyFail("csv_limit", "Choose a CSV no larger than 1 MiB.");
  return {
    ...input,
    bytes: {
      length: input.bytes.length,
      hash: hashStudySync(Array.from(input.bytes)),
    },
  };
}
export function parseCitationCsv(bytes: Uint8Array): {
  headers: string[];
  rows: { row: number; cells: string[] }[];
  ignoredBlankLines: number;
} {
  if (!(bytes instanceof Uint8Array) || bytes.length > STUDY_LIMITS.csvBytes)
    studyFail("csv_limit", "Choose a CSV no larger than 1 MiB.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    studyFail("csv_utf8", "The citation file is not valid UTF-8.");
  }
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  const records: { row: number; cells: string[] }[] = [];
  let cells: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    touched = false,
    line = 1,
    start = 1,
    ignoredBlankLines = 0;
  const endField = () => {
    if (field.length > 8000)
      studyFail(
        "cell_limit",
        "A CSV cell exceeds 8,000 characters.",
        "row." + start,
      );
    cells.push(field);
    field = "";
    closed = false;
    if (cells.length > 30)
      studyFail("csv_columns", "Use at most 30 CSV columns.");
  };
  const endRow = () => {
    if (!touched && !cells.length && !field) {
      ignoredBlankLines++;
      return;
    }
    endField();
    records.push({ row: start, cells });
    if (records.length > 2001)
      studyFail("csv_rows", "Use at most 2,000 citation rows per file.");
    cells = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (c === "\r" || c === "\n") {
        field += c;
        if (c === "\r" && text[i + 1] === "\n") {
          field += "\n";
          i++;
        }
        line++;
      } else field += c;
      if (field.length > 8000)
        studyFail(
          "cell_limit",
          "A CSV cell exceeds 8,000 characters.",
          "row." + start,
        );
      continue;
    }
    if (closed && ![",", "\r", "\n"].includes(c))
      studyFail(
        "csv_quote",
        "Only a delimiter or line ending may follow a closing quote.",
        "row." + line,
      );
    if (c === '"') {
      if (field.length || closed)
        studyFail(
          "csv_quote",
          "Quotes must surround a complete CSV field.",
          "row." + line,
        );
      quoted = true;
      touched = true;
    } else if (c === ",") {
      touched = true;
      endField();
    } else if (c === "\r" || c === "\n") {
      endRow();
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else {
      field += c;
      touched = true;
    }
  }
  if (quoted)
    studyFail(
      "csv_quote",
      "The CSV ends inside a quoted field.",
      "row." + start,
    );
  if (touched || cells.length || field) endRow();
  const header = records.shift();
  if (!header)
    studyFail(
      "csv_header",
      "The CSV needs a header and at least one citation.",
    );
  const headers = header.cells;
  const normalized = headers.map((h) => h.trim().toLowerCase());
  if (
    headers.some((h) => !h.trim() || h.length > 2000) ||
    new Set(normalized).size !== normalized.length ||
    normalized.some((h) => reserved.has(h))
  )
    studyFail(
      "csv_header",
      "Headers must be nonempty, distinct and free of reserved object names.",
    );
  if (!records.length) studyFail("csv_empty", "The CSV has no citation rows.");
  for (const r of records)
    if (r.cells.length !== headers.length)
      studyFail(
        "csv_width",
        "Every data row must have the same number of columns as the header.",
        "row." + r.row,
      );
  return { headers, rows: records, ignoredBlankLines };
}
const nullText = (value: string | undefined) => value?.trim() || null;
export function mappedCitation(
  cells: string[],
  map: Partial<Record<CitationColumn, number>>,
): ImportedCitation {
  const get = (key: CitationColumn) =>
    nullText(map[key] === undefined ? undefined : cells[map[key]!]);
  const y = get("year");
  return {
    title: get("title") ?? "",
    authors: get("authors"),
    year:
      y && /^\d{1,4}$/.test(y) && Number(y) >= 1 && Number(y) <= 2200
        ? Number(y)
        : null,
    originalYear: y,
    doi: get("doi"),
    pmid: get("pmid"),
    url: get("url"),
    abstract: get("abstract"),
  };
}
function checkMap(value: unknown, width: number) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    studyFail("column_map", "Choose a citation column mapping.");
  const entries = Object.entries(value);
  if (
    entries.some(
      ([key, i]) =>
        !COLUMNS.includes(key as CitationColumn) ||
        !Number.isSafeInteger(i) ||
        (i as number) < 0 ||
        (i as number) >= width,
    ) ||
    new Set(entries.map(([, i]) => i)).size !== entries.length ||
    !Object.hasOwn(value, "title")
  )
    studyFail(
      "column_map",
      "Map a title column and distinct supported citation columns.",
    );
}
function batchIdentity(
  value: Pick<
    ImportBatch,
    | "kind"
    | "sourceHash"
    | "parserVersion"
    | "columnMap"
    | "searchRunId"
    | "catalogHash"
    | "provenanceNote"
  >,
) {
  return {
    kind: value.kind,
    sourceHash: value.sourceHash,
    parserVersion: value.parserVersion,
    columnMap: value.columnMap,
    searchRunId: value.searchRunId,
    catalogHash: value.catalogHash,
    provenanceNote: value.provenanceNote,
  };
}
function previewBasis(p: ImportPreview) {
  const { reviewHash, input, ...rest } = p;
  return rest;
}
function previewSuggestions(
  s: StudyState,
  rows: ImportRow[],
): ImportDuplicateSuggestion[] {
  const buckets = new Map<
    string,
    {
      reason: DuplicateSuggestion["reason"];
      rows: number[];
      reportIds: Id[];
      metadata: Metadata[];
    }
  >();
  const add = (m: Metadata, row: number | null, id: Id | null) => {
    for (const [reason, value] of [
      ["doi", normalizedDoi(m.doi)],
      ["pmid", normalizedPmid(m.pmid)],
      ["exact-url", m.url?.trim() ?? null],
      [
        "title-year",
        m.year === null
          ? null
          : canonicalStudyJson([m.title.trim().toLowerCase(), m.year]),
      ],
    ] as const) {
      if (!value) continue;
      const key = reason + ":" + value;
      if (!buckets.has(key))
        buckets.set(key, { reason, rows: [], reportIds: [], metadata: [] });
      const b = buckets.get(key)!;
      if (row !== null) b.rows.push(row);
      if (id) b.reportIds.push(id);
      b.metadata.push(m);
    }
  };
  for (const r of s.reports)
    if (reportRevision(r).occurrenceIds.length)
      add(reportRevision(r).metadata, null, r.id);
  for (const r of rows)
    if (!r.issues.length) add(metadataFromCitation(r.citation), r.row, null);
  return [...buckets.values()]
    .filter((b) => b.rows.length && b.rows.length + b.reportIds.length > 1)
    .map((b) => {
      const value = {
        rows: b.rows.sort((a, b) => a - b),
        reportIds: b.reportIds.sort(),
        reason: b.reason,
        identifierConflict: identifierConflict(b.metadata),
      };
      return {
        ...value,
        hash: hashStudySync({
          ...value,
          revisions: value.reportIds.map(
            (id) => s.reports.find((r) => r.id === id)!.currentRevision,
          ),
        }),
      };
    })
    .sort((a, b) => a.hash.localeCompare(b.hash))
    .slice(0, 100);
}
export async function previewCitationImport(
  state: StudyState,
  input: CitationImportInput,
  expectedStateHash: Hash,
): Promise<ImportPreview> {
  const stateRaw = canonicalStudyJson(state),
    sourceRaw = canonicalStudyJson(inputSnapshot(input));
  const s = studyClone(state),
    source = structuredClone(input);
  if (
    !isStudyHash(expectedStateHash) ||
    (await studyStateHash(s)) !== expectedStateHash
  )
    studyFail("stale_state", "The workspace changed before import preview.");
  let headers: string[],
    rows: ImportRow[] = [],
    sourceHash: Hash,
    ignoredBlankLines = 0,
    columnMap: Record<string, number>,
    searchRunId: Id | null,
    catalogHash: Hash | null,
    parserVersion: ImportBatch["parserVersion"];
  if (source.kind === "citation-csv") {
    exactStudyObject(
      source,
      [
        "kind",
        "bytes",
        "fileName",
        "columnMap",
        "searchRunId",
        "provenanceNote",
      ],
      "import",
    );
    studyText(source.fileName, 2000, "fileName");
    const parsed = parseCitationCsv(source.bytes);
    headers = parsed.headers;
    ignoredBlankLines = parsed.ignoredBlankLines;
    checkMap(source.columnMap, headers.length);
    columnMap = { ...source.columnMap };
    searchRunId = source.searchRunId;
    catalogHash = null;
    parserVersion = "citation-csv-v1";
    if (
      searchRunId !== null &&
      (!isStudyId(searchRunId) ||
        !s.searchRuns.some((r) => r.id === searchRunId))
    )
      studyFail(
        "search_run",
        "Choose a saved recorded search or unknown provenance.",
      );
    sourceHash = await byteHex(source.bytes);
    rows = parsed.rows.map((r) => {
      const citation = mappedCitation(r.cells, source.columnMap),
        issues: StudyIssue[] = [];
      try {
        validateCitation(citation, `rows.${r.row}`);
      } catch (e) {
        if (e instanceof StudyError) issues.push(...e.issues);
        else throw e;
      }
      for (const [i, cell] of r.cells.entries())
        if (cell.length > (source.columnMap.abstract === i ? 8000 : 2000))
          issues.push({
            path: `rows.${r.row}.${i}`,
            code: "cell_limit",
            message: "This retained raw cell exceeds its allowed length.",
          });
      return {
        row: r.row,
        rawCells: [...r.cells],
        citation,
        backlinks: [],
        issues,
      };
    });
  } else if (source.kind === "site-bibliography") {
    exactStudyObject(
      source,
      ["kind", "entries", "catalogHash", "provenanceNote"],
      "import",
    );
    if (
      !isStudyHash(source.catalogHash) ||
      !Array.isArray(source.entries) ||
      !source.entries.length ||
      source.entries.length > 2000
    )
      studyFail(
        "catalog",
        "Select bounded public catalog entries with a source hash.",
      );
    headers = [...CATALOG_HEADERS];
    columnMap = {
      title: 1,
      authors: 2,
      year: 3,
      doi: 5,
      pmid: 6,
      url: 7,
      abstract: 8,
    };
    searchRunId = null;
    catalogHash = source.catalogHash;
    parserVersion = "site-citations-v1";
    sourceHash = await hashStudyValue(source.entries);
    const seen = new Set<string>();
    rows = source.entries.map((entry, i) => {
      exactStudyObject(
        entry,
        [
          "entryId",
          "publisher",
          "backlinks",
          "title",
          "authors",
          "year",
          "originalYear",
          "doi",
          "pmid",
          "url",
          "abstract",
        ],
        "catalogEntry",
      );
      studyText(entry.entryId, 100, "entryId");
      if (seen.has(entry.entryId))
        studyFail("catalog", "A public catalog entry is selected twice.");
      seen.add(entry.entryId);
      studyText(entry.publisher, 2000, "publisher", true);
      const { entryId, publisher, backlinks, ...citation } = entry;
      const issues: StudyIssue[] = [];
      try {
        validateCitation(citation, `rows.${i + 1}`);
      } catch (e) {
        if (e instanceof StudyError) issues.push(...e.issues);
        else throw e;
      }
      if (!Array.isArray(backlinks) || backlinks.length > 100)
        studyFail("backlinks", "Use bounded controlled source backlinks.");
      return {
        row: i + 1,
        rawCells: CATALOG_HEADERS.map((k) =>
          String((entry as unknown as Record<string, unknown>)[k] ?? ""),
        ),
        citation,
        backlinks: studyClone(backlinks),
        issues,
      };
    });
  } else
    studyFail(
      "import_kind",
      "Choose citation CSV or the controlled public bibliography.",
    );
  studyText(source.provenanceNote, 2000, "provenanceNote", true);
  const identityHash = await hashStudyValue(
    batchIdentity({
      kind: source.kind,
      sourceHash,
      parserVersion,
      columnMap,
      searchRunId,
      catalogHash,
      provenanceNote: source.provenanceNote,
    }),
  );
  const p: ImportPreview = {
    version: 1,
    expectedStateHash,
    sourceHash,
    identityHash,
    reviewHash: "",
    input: source,
    headers,
    rows,
    issues: rows.flatMap((r) => r.issues),
    ignoredBlankLines,
    duplicateSuggestions: previewSuggestions(s, rows),
    capacity: {
      currentReports: s.reports.length,
      currentOccurrences: s.occurrences.length,
      currentBatches: s.imports.length,
    },
    existingBatchId:
      s.imports.find((b) => b.identityHash === identityHash)?.id ?? null,
  };
  p.reviewHash = await hashStudyValue(previewBasis(p));
  if (
    canonicalStudyJson(state) !== stateRaw ||
    canonicalStudyJson(inputSnapshot(input)) !== sourceRaw
  )
    studyFail(
      "input_changed",
      "Import input changed during asynchronous preview.",
    );
  return p;
}
export function defaultImportAssignments(p: ImportPreview): ImportAssignment[] {
  return p.rows.map((r) => ({
    row: r.row,
    target: { kind: "new", group: "row-" + r.row, canonicalRow: r.row },
  }));
}
export async function applyCitationImport(
  s: StudyState,
  preview: ImportPreview,
  assignments: ImportAssignment[],
  context: {
    expectedStateHash: Hash;
    at: Instant;
    newId: () => Id;
    reason: string;
  },
): Promise<{ noOp: boolean; message: string }> {
  exactStudyObject(
    preview,
    [
      "version",
      "expectedStateHash",
      "sourceHash",
      "identityHash",
      "reviewHash",
      "input",
      "headers",
      "rows",
      "issues",
      "ignoredBlankLines",
      "duplicateSuggestions",
      "capacity",
      "existingBatchId",
    ],
    "preview",
  );
  const fresh = await previewCitationImport(
    s,
    preview.input,
    context.expectedStateHash,
  );
  if (
    preview.reviewHash !== fresh.reviewHash ||
    canonicalStudyJson(previewBasis(preview)) !==
      canonicalStudyJson(previewBasis(fresh))
  )
    studyFail(
      "preview_changed",
      "Import preview changed. Review the current complete file again.",
    );
  if (fresh.issues.length)
    studyFail("import_rows", "Correct every invalid row before importing.");
  studyText(context.reason, 2000, "reason");
  if (!Array.isArray(assignments) || assignments.length !== fresh.rows.length)
    studyFail("assignments", "Assign every previewed row exactly once.");
  const mapped = new Map<number, ImportAssignment>();
  const groups = new Map<
    string,
    { target: ImportAssignment["target"]; rows: ImportRow[] }
  >();
  for (const a of assignments) {
    exactStudyObject(a, ["row", "target"], "assignment");
    if (mapped.has(a.row) || !fresh.rows.some((r) => r.row === a.row))
      studyFail("assignments", "A row is missing, repeated or unrecognized.");
    mapped.set(a.row, a);
    if (a.target?.kind === "existing") {
      exactStudyObject(
        a.target,
        ["kind", "reportId", "reportRevision"],
        "assignment.target",
      );
      const r = s.reports.find(
        (r) =>
          r.id ===
          (
            a.target as Extract<
              ImportAssignment["target"],
              { kind: "existing" }
            >
          ).reportId,
      );
      if (
        !r ||
        r.currentRevision !== a.target.reportRevision ||
        !reportRevision(r).occurrenceIds.length
      )
        studyFail("stale_revision", "An existing target report changed.");
    } else {
      exactStudyObject(
        a.target,
        ["kind", "group", "canonicalRow"],
        "assignment.target",
      );
      if (a.target.kind !== "new" || !isStudyId(a.target.group))
        studyFail("assignments", "Choose a bounded new group token.");
    }
    const key =
      a.target.kind === "existing"
        ? "existing:" + a.target.reportId
        : "new:" + a.target.group;
    const group = groups.get(key);
    if (
      group &&
      canonicalStudyJson(group.target) !== canonicalStudyJson(a.target)
    )
      studyFail(
        "assignments",
        "All rows in a group must choose the same canonical target.",
      );
    if (!group) groups.set(key, { target: a.target, rows: [] });
    groups.get(key)!.rows.push(fresh.rows.find((r) => r.row === a.row)!);
  }
  const prior = s.imports.find((b) => b.identityHash === fresh.identityHash);
  if (prior)
    return {
      noOp: true,
      message:
        "This exact file/mapping/provenance import is already retained; no occurrences were added.",
    };
  const batchId = context.newId(),
    occurrences: StudyState["occurrences"] = [],
    initial: ImportBatch["assignments"] = [];
  for (const group of groups.values()) {
    let report: StudyState["reports"][number], metadata: Metadata;
    if (group.target.kind === "existing") {
      report = s.reports.find(
        (r) =>
          r.id ===
          (
            group.target as Extract<
              ImportAssignment["target"],
              { kind: "existing" }
            >
          ).reportId,
      )!;
      metadata = reportRevision(report).metadata;
    } else {
      const canonical = group.rows.find(
        (r) =>
          r.row ===
          (group.target as Extract<ImportAssignment["target"], { kind: "new" }>)
            .canonicalRow,
      );
      if (!canonical)
        studyFail(
          "assignments",
          "A new group must choose one of its own rows as canonical.",
        );
      metadata = metadataFromCitation(canonical.citation);
      report = { id: context.newId(), currentRevision: 0, revisions: [] };
      s.reports.push(report);
    }
    if (
      identifierConflict([
        metadata,
        ...group.rows.map((r) => metadataFromCitation(r.citation)),
      ])
    )
      studyFail(
        "identifier_conflict",
        "Conflicting DOI/PMID identifiers must be resolved deliberately before grouping.",
      );
    const ids: Id[] = report.currentRevision
      ? [...reportRevision(report).occurrenceIds]
      : [];
    for (const r of group.rows) {
      const id = context.newId();
      ids.push(id);
      occurrences.push({
        id,
        batchId,
        row: r.row,
        rawCells: [...r.rawCells],
        imported: studyClone(r.citation),
        backlinks: studyClone(r.backlinks),
        reportId: report.id,
      });
      initial.push({
        row: r.row,
        occurrenceId: id,
        initialReportId: report.id,
      });
    }
    appendStudyReportRevision(
      s,
      report,
      metadata,
      ids,
      context.reason,
      context.at,
    );
  }
  const source = fresh.input,
    parserVersion =
      source.kind === "citation-csv" ? "citation-csv-v1" : "site-citations-v1";
  const batch: ImportBatch = {
    id: batchId,
    kind: source.kind,
    identityHash: fresh.identityHash,
    sourceHash: fresh.sourceHash,
    fileName: source.kind === "citation-csv" ? source.fileName : null,
    parserVersion,
    columnMap:
      source.kind === "citation-csv"
        ? { ...source.columnMap }
        : {
            title: 1,
            authors: 2,
            year: 3,
            doi: 5,
            pmid: 6,
            url: 7,
            abstract: 8,
          },
    headers: [...fresh.headers],
    searchRunId: source.kind === "citation-csv" ? source.searchRunId : null,
    catalogHash:
      source.kind === "site-bibliography" ? source.catalogHash : null,
    provenanceNote: source.provenanceNote,
    committedAt: context.at,
    assignments: initial.sort((a, b) => a.row - b.row),
  };
  s.imports.push(batch);
  s.occurrences.push(...occurrences.sort((a, b) => a.row - b.row));
  return {
    noOp: false,
    message:
      "Reviewed source rows imported locally; no study, search or independent review was verified.",
  };
}
export async function validateStoredBatch(value: ImportBatch, s: StudyState) {
  exactStudyObject(
    value,
    [
      "id",
      "kind",
      "identityHash",
      "sourceHash",
      "fileName",
      "parserVersion",
      "columnMap",
      "headers",
      "searchRunId",
      "catalogHash",
      "provenanceNote",
      "committedAt",
      "assignments",
    ],
    "importBatch",
  );
  if (!isStudyHash(value.identityHash) || !isStudyHash(value.sourceHash))
    studyFail("import_hash", "A source batch needs complete hashes.");
  if (
    !Array.isArray(value.headers) ||
    !value.headers.length ||
    value.headers.length > 30 ||
    value.headers.some(
      (h) => typeof h !== "string" || !h.trim() || h.length > 2000,
    ) ||
    new Set(value.headers.map((h) => h.trim().toLowerCase())).size !==
      value.headers.length ||
    value.headers.some((h) => reserved.has(h.trim().toLowerCase()))
  )
    studyFail("import_headers", "Retain distinct bounded source headers.");
  checkMap(value.columnMap, value.headers.length);
  if (value.kind === "citation-csv") {
    if (value.parserVersion !== "citation-csv-v1" || value.catalogHash !== null)
      studyFail("import_kind", "CSV batch metadata is inconsistent.");
    studyText(value.fileName, 2000, "fileName");
    if (
      value.searchRunId !== null &&
      !s.searchRuns.some((r) => r.id === value.searchRunId)
    )
      studyFail("search_run", "Retained search provenance is missing.");
  } else if (value.kind === "site-bibliography") {
    if (
      value.parserVersion !== "site-citations-v1" ||
      value.fileName !== null ||
      value.searchRunId !== null ||
      !isStudyHash(value.catalogHash) ||
      canonicalStudyJson(value.headers) !== canonicalStudyJson(CATALOG_HEADERS)
    )
      studyFail(
        "import_kind",
        "Public bibliography provenance is inconsistent.",
      );
  } else studyFail("import_kind", "Unsupported retained batch kind.");
  studyText(value.provenanceNote, 2000, "provenanceNote", true);
  if (
    typeof value.committedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.committedAt) ||
    !validStudyDay(value.committedAt.slice(0, 10)) ||
    !Number.isFinite(Date.parse(value.committedAt)) ||
    new Date(value.committedAt).toISOString() !== value.committedAt
  )
    studyFail("date", "Retain a real committed UTC timestamp.");
  if (
    !Array.isArray(value.assignments) ||
    !value.assignments.length ||
    value.assignments.length > 2000
  )
    studyFail(
      "assignments",
      "A source batch needs bounded retained assignments.",
    );
  const rows = new Set<number>(),
    ids = new Set<string>();
  for (const a of value.assignments) {
    exactStudyObject(
      a,
      ["row", "occurrenceId", "initialReportId"],
      "assignment",
    );
    if (
      !Number.isSafeInteger(a.row) ||
      a.row < 1 ||
      a.row > 1000000 ||
      rows.has(a.row) ||
      !isStudyId(a.occurrenceId) ||
      ids.has(a.occurrenceId) ||
      !isStudyId(a.initialReportId)
    )
      studyFail(
        "assignments",
        "Retain distinct source rows and occurrence IDs.",
      );
    rows.add(a.row);
    ids.add(a.occurrenceId);
  }
  if (value.identityHash !== (await hashStudyValue(batchIdentity(value))))
    studyFail("import_hash", "Retained source provenance changed.");
}

export function validateOccurrenceSource(
  o: import("./study-register-model").Occurrence,
  b: ImportBatch,
) {
  let expected: ImportedCitation;
  if (b.kind === "citation-csv")
    expected = mappedCitation(o.rawCells, b.columnMap);
  else {
    const text = (i: number) => o.rawCells[i] || null;
    const y = text(3);
    expected = {
      title: o.rawCells[1] ?? "",
      authors: text(2),
      year: y === null ? null : Number(y),
      originalYear: text(4),
      doi: text(5),
      pmid: text(6),
      url: text(7),
      abstract: text(8),
    };
    studyText(o.rawCells[0], 100, "catalog.entryId");
  }
  if (canonicalStudyJson(expected) !== canonicalStudyJson(o.imported))
    studyFail(
      "source_row",
      "Original imported citation disagrees with its retained raw source cells.",
    );
}
