/** Loss-aware preview of the original browser-only Charity OS version 1 export.
 * Pure conversion: no persistence, localStorage, provider, approval or money movement.
 * The authenticated importer must show warnings and commit only to an empty org.
 */
import {
  CURRENCIES,
  MODULE_MAP,
  validateRecord,
  validDate,
} from "./modules.mjs";
import { makeBackup, validateBackup } from "./backup.mjs";
import { hash } from "./security.mjs";
export const LOCAL_OS_FORMAT = "charitology.charity-os";
export const MIGRATION_FORMAT = "charitology-local-os-migration";
export const MAX_LOCAL_BYTES = 8 * 1024 * 1024;
export const MAX_MIGRATION_BYTES = 64 * 1024 * 1024;
const KINDS = ["projects", "grants", "tasks", "outcomes"];
const STATUS = {
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
const FIELDS = {
  projects: [
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
  ],
  grants: [
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
  ],
  tasks: [
    "id",
    "title",
    "projectId",
    "status",
    "priority",
    "due",
    "owner",
    "notes",
  ],
  outcomes: [
    "id",
    "date",
    "projectId",
    "indicator",
    "value",
    "unit",
    "evidence",
    "source",
    "notes",
  ],
};
const bytes = (value) =>
  Buffer.byteLength(
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  );
const plain = (value) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
export class MigrationError extends Error {
  constructor(field, reason, sourceId = null) {
    super(reason);
    this.name = "MigrationError";
    this.status = 422;
    this.code = "local_os_migration";
    this.issues = [{ sourceId, field, reason }];
  }
}
const invalid = (field, reason, sourceId) => {
  throw new MigrationError(field, reason, sourceId);
};
export function isLocalOsBackup(value) {
  return (
    plain(value) && value.format === LOCAL_OS_FORMAT && value.version === 1
  );
}
function jsonValue(value, depth = 0) {
  if (depth > 40)
    invalid("sourceBackup", "The source archive is too deeply nested.");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) jsonValue(item, depth + 1);
    return;
  }
  if (plain(value)) {
    for (const item of Object.values(value)) jsonValue(item, depth + 1);
    return;
  }
  invalid(
    "sourceBackup",
    "Only finite JSON values are supported; no source fields were discarded.",
  );
}
function text(value, field, max, sourceId, required = false) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    invalid(
      field,
      `Expected ${required ? "nonempty " : ""}text of at most ${max} characters.`,
      sourceId,
    );
  return value.trim();
}
function numeric(
  value,
  field,
  sourceId,
  { nullable = false, signed = false } = {},
) {
  if (value === null && nullable) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e12 ||
    (!signed && value < 0)
  )
    invalid(
      field,
      "Expected a finite source number within the local OS range; unknown is never made zero.",
      sourceId,
    );
  return value;
}
function date(value, field, sourceId, required = false) {
  const result = text(value, field, 10, sourceId, required);
  if (result && !validDate(result))
    invalid(
      field,
      "Expected a real source YYYY-MM-DD date from 1900 to 2200.",
      sourceId,
    );
  return result;
}
function choice(value, options, field, sourceId) {
  if (!options.includes(value))
    invalid(field, "Unrecognized source option.", sourceId);
  return value;
}
function localWorkspace(source) {
  if (!isLocalOsBackup(source) || !plain(source.workspace))
    invalid(
      "format",
      "Use an original browser-only Charity OS version 1 JSON export.",
    );
  const w = source.workspace;
  const result = {
    organization: text(w.organization, "organization", 160),
    mission: text(w.mission, "mission", 2000),
    community: text(w.community, "community", 2000),
    currency: text(w.currency, "currency", 3, null, true).toUpperCase(),
  };
  if (!/^[A-Z]{3}$/.test(result.currency))
    invalid("currency", "The source currency must be a three-letter code.");
  const projectIds = new Set();
  let count = 0;
  for (const kind of KINDS) {
    if (!Array.isArray(w[kind]))
      invalid(kind, "Every original collection must be an array.");
    count += w[kind].length;
    if (count > 2000)
      invalid(
        kind,
        "The original local OS supports at most 2,000 source records.",
      );
    const seen = new Set();
    result[kind] = [];
    for (const row of w[kind]) {
      if (!plain(row)) invalid(kind, "A source record must be an object.");
      const id = text(row.id, "id", 80, null, true);
      if (!/^[A-Za-z0-9_-]+$/.test(id) || seen.has(id))
        invalid(
          "id",
          "Invalid or duplicate identity within a source collection.",
          id,
        );
      seen.add(id);
      const notes = text(row.notes, "notes", 4000, id);
      if (kind === "projects") {
        const depth = numeric(row.depth, "depth", id, { nullable: true });
        if (depth !== null && (!Number.isInteger(depth) || depth > 4))
          invalid(
            "depth",
            "Depth must be null or a whole number from 0 to 4.",
            id,
          );
        result.projects.push({
          id,
          title: text(row.title, "title", 160, id, true),
          status: choice(row.status, STATUS.projects, "status", id),
          owner: text(row.owner, "owner", 120, id),
          due: date(row.due, "due", id),
          depth,
          budget: numeric(row.budget, "budget", id),
          spent: numeric(row.spent, "spent", id),
          goal: text(row.goal, "goal", 2000, id),
          notes,
        });
        projectIds.add(id);
      } else {
        const projectId = text(row.projectId, "projectId", 80, id);
        if (projectId && !projectIds.has(projectId))
          invalid(
            "projectId",
            "The linked source project is missing; no orphaned relationship was discarded.",
            id,
          );
        if (kind === "grants")
          result.grants.push({
            id,
            title: text(row.title, "title", 160, id, true),
            funder: text(row.funder, "funder", 160, id),
            projectId,
            status: choice(row.status, STATUS.grants, "status", id),
            requested: numeric(row.requested, "requested", id),
            awarded: numeric(row.awarded, "awarded", id),
            deadline: date(row.deadline, "deadline", id),
            owner: text(row.owner, "owner", 120, id),
            next: text(row.next, "next", 1000, id),
            notes,
          });
        if (kind === "tasks")
          result.tasks.push({
            id,
            title: text(row.title, "title", 160, id, true),
            projectId,
            status: choice(row.status, STATUS.tasks, "status", id),
            priority: choice(
              row.priority,
              ["high", "normal", "low"],
              "priority",
              id,
            ),
            due: date(row.due, "due", id),
            owner: text(row.owner, "owner", 120, id),
            notes,
          });
        if (kind === "outcomes") {
          const sourceUrl = text(row.source, "source", 1200, id);
          if (sourceUrl) {
            try {
              const u = new URL(sourceUrl);
              if (
                u.protocol !== "https:" ||
                u.username ||
                u.password ||
                /[\r\n]/.test(sourceUrl)
              )
                throw Error();
            } catch {
              invalid(
                "source",
                "A source link must be HTTPS without embedded credentials.",
                id,
              );
            }
          }
          result.outcomes.push({
            id,
            date: date(row.date, "date", id, true),
            projectId,
            indicator: text(row.indicator, "indicator", 160, id, true),
            value: numeric(row.value, "value", id, {
              nullable: true,
              signed: true,
            }),
            unit: text(row.unit, "unit", 80, id),
            evidence: choice(row.evidence, STATUS.outcomes, "evidence", id),
            source: sourceUrl,
            notes,
          });
        }
      }
    }
  }
  // This is the actual original normalized workspace limit, not the larger private archive limit.
  if (bytes(result) > 4_500_000)
    invalid(
      "workspace",
      "The normalized source workspace exceeds the original 4.5 MB limit.",
    );
  return result;
}
/** Exact decimal conversion. Unsupported precision is archived, never rounded. */
export function legacyMoney(value, currency) {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Object.hasOwn(CURRENCIES, currency)
  )
    return null;
  const precision = CURRENCIES[currency],
    match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) return null;
  const digits = BigInt(match[1] + (match[2] || "")),
    places = (match[2] || "").length - Number(match[3] || 0),
    shift = precision - places;
  let minor;
  if (shift >= 0) minor = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    if (digits % divisor !== 0n) return null;
    minor = digits / divisor;
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { minor: Number(minor), currency, precision };
}
/** Returns a checksummed shared-OS backup and a structured, value-free warning list.
 * The sourceBackup archive retains every JSON field. It belongs in the private
 * administrator import archive, never a generic notes field or public endpoint.
 */
export function previewLocalOsMigration(
  input,
  { organization, now = new Date().toISOString() } = {},
) {
  let source;
  if (typeof input === "string") {
    if (bytes(input) > MAX_LOCAL_BYTES)
      invalid("sourceBackup", "The local source file exceeds 8 MiB.");
    try {
      source = JSON.parse(input);
    } catch {
      invalid("sourceBackup", "The source file is not readable JSON.");
    }
  } else source = input;
  jsonValue(source);
  if (bytes(source) > MAX_LOCAL_BYTES)
    invalid("sourceBackup", "The local source archive exceeds 8 MiB.");
  source = structuredClone(source);
  const w = localWorkspace(source),
    sourceHash = hash(source);
  if (
    !plain(organization) ||
    typeof organization.name !== "string" ||
    !organization.name.trim() ||
    organization.name.length > 180 ||
    !Object.hasOwn(CURRENCIES, organization.currency)
  )
    invalid(
      "organization",
      "Supply the authenticated destination organization name, supported currency and named time zone.",
    );
  const zone = organization.time_zone ?? organization.timeZone;
  try {
    if (typeof zone !== "string" || zone.length > 100) throw Error();
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
  } catch {
    invalid(
      "timeZone",
      "Use the destination organization’s actual named time zone; the local source has no time zone.",
    );
  }
  if (!Number.isFinite(Date.parse(now)))
    invalid("createdAt", "Supply a valid preview creation timestamp.");
  const createdAt = new Date(now).toISOString(),
    warnings = [],
    records = [],
    idMap = {
      workspace: null,
      ...Object.fromEntries(KINDS.map((kind) => [kind, Object.create(null)])),
    };
  const warn = (collection, sourceId, field, code, reason, extra = {}) =>
    warnings.push({ collection, sourceId, field, code, reason, ...extra });
  warn(
    "workspace",
    null,
    "sourceBackup",
    "private_archive",
    "The complete original JSON is preserved in a private administrator archive. Review its privacy before importing; it is not copied into active generic notes.",
  );
  warn(
    "workspace",
    null,
    "status",
    "no_approvals",
    "All imported records start at their shared workflow’s initial state. Source status labels, owners and evidence claims do not grant membership, approval, submission, payment or independent review.",
  );
  if (w.currency !== organization.currency)
    warn(
      "workspace",
      null,
      "currency",
      "currency_not_converted",
      "The source and destination planning currencies differ. Representable amounts retain the source currency; no exchange rate or conversion is inferred.",
    );
  if (!Object.hasOwn(CURRENCIES, w.currency))
    warn(
      "workspace",
      null,
      "currency",
      "unsupported_currency",
      "The source currency is not supported by the shared money contract. Monetary values remain in the private archive and active amounts stay null; no replacement currency is inferred.",
    );
  if (w.community)
    warn(
      "workspace",
      null,
      "community",
      "archive_only",
      "Global community/context text has no equivalent organization field and is retained only in the private source archive.",
    );
  const unknown = (
    value,
    allowed,
    collection,
    sourceId,
    field = "unsupported",
  ) => {
    const keys = Object.keys(value).filter((k) => !allowed.includes(k));
    if (keys.length)
      warn(
        collection,
        sourceId,
        field,
        "unsupported_fields",
        "Unsupported source fields are preserved only in the private original archive, without copying their values into active notes.",
        { sourceFields: keys },
      );
  };
  unknown(
    source,
    ["format", "version", "exportedAt", "workspace"],
    "workspace",
    null,
    "envelope",
  );
  unknown(
    source.workspace,
    ["organization", "mission", "community", "currency", ...KINDS],
    "workspace",
    null,
  );
  for (const key of ["organization", "mission", "community", "currency"])
    if (source.workspace[key] !== w[key])
      warn(
        "workspace",
        null,
        key,
        "normalized_for_contract",
        "Whitespace or currency casing is normalized in active metadata; exact source text remains in the private archive.",
      );
  const originalIds = new Set(
      KINDS.flatMap((kind) => w[kind].map((r) => r.id)),
    ),
    used = new Set();
  function allocate(base, role, sourceId, primary = false) {
    let candidate = base,
      attempt = 0;
    while (
      candidate.length > 100 ||
      used.has(candidate) ||
      ((!primary || candidate !== base) && originalIds.has(candidate))
    )
      candidate = `${base.slice(0, 80)}_${hash(`${role}:${sourceId}:${attempt++}`).slice(0, 12)}`;
    used.add(candidate);
    return candidate;
  }
  for (const kind of KINDS)
    for (const row of w[kind]) {
      const targetId = allocate(row.id, kind, row.id, true);
      idMap[kind][row.id] = {
        targetId,
        moduleId:
          kind === "grants"
            ? "grant-seeking"
            : kind === "outcomes"
              ? "outcomes"
              : "projects",
        companions: {},
      };
      if (targetId !== row.id)
        warn(
          kind,
          row.id,
          "id",
          "id_collision",
          "This ID also occurs in another source collection; a deterministic unique shared ID is recorded in the migration ID map.",
          { targetId },
        );
    }
  const add = (id, moduleId, data) => {
    const record = {
      id,
      moduleId,
      status: MODULE_MAP[moduleId].workflow.initial,
      revision: 1,
      approval: null,
      snapshot: null,
      data,
    };
    records.push(record);
    return record;
  };
  const companion = (kind, row, role, moduleId, data) => {
    const id = allocate(`local_${role}_${row.id}`, `${kind}:${role}`, row.id);
    idMap[kind][row.id].companions[role] = id;
    add(id, moduleId, data);
    return id;
  };
  const money = (value, kind, row, field) => {
    const converted = legacyMoney(value, w.currency);
    if (converted === null)
      warn(
        kind,
        row.id,
        field,
        "unrepresentable_money",
        "The source amount cannot be represented exactly under the shared currency/precision contract. Its original value is archived; the active field is null, never rounded or made zero.",
      );
    return converted;
  };
  const linked = (projectId) =>
    projectId
      ? {
          programId: idMap.projects[projectId].companions.program,
          projectId: idMap.projects[projectId].targetId,
        }
      : { programId: null, projectId: null };
  const contextId = allocate(
    "local_organization_context",
    "workspace",
    "context",
  );
  idMap.workspace = contextId;
  add(contextId, "organization", {
    title: "Imported local organization context",
    kind: "profile",
    legalName: w.organization || null,
    mission: w.mission || null,
    currency: Object.hasOwn(CURRENCIES, w.currency) ? w.currency : null,
  });
  for (const row of w.projects) {
    const programId = companion("projects", row, "program", "programs", {
      title: row.title,
      kind: "program",
      purpose: row.goal || null,
      depth: row.depth,
    });
    add(idMap.projects[row.id].targetId, "projects", {
      title: row.title,
      kind: "project",
      programId,
    });
    companion("projects", row, "budget", "finance", {
      title: `Budget: ${row.title}`,
      kind: "budget",
      programId,
      planned: money(row.budget, "projects", row, "budget"),
      actual: money(row.spent, "projects", row, "spent"),
    });
  }
  for (const row of w.grants) {
    const { programId } = linked(row.projectId);
    let funderId = null;
    if (row.funder)
      funderId = companion("grants", row, "funder", "contacts", {
        title: row.funder,
        kind: "relationship",
        displayLabel: row.funder,
        relationship: "funder",
        contactPreference: "unknown",
        purpose:
          "Imported legacy funder label; identity and contact permission require review.",
      });
    const grantId = idMap.grants[row.id].targetId;
    add(grantId, "grant-seeking", {
      title: row.title,
      kind: "opportunity",
      programId,
      funderId,
      eligibility: "unknown",
      requested: money(row.requested, "grants", row, "requested"),
    });
    if (row.awarded !== 0 || row.status === "awarded")
      companion("grants", row, "award", "grant-delivery", {
        title: `Award record: ${row.title}`,
        kind: "agreement",
        programId,
        applicationId: grantId,
        awarded: money(row.awarded, "grants", row, "awarded"),
        restriction: "unknown",
      });
    else
      warn(
        "grants",
        row.id,
        "awarded",
        "archive_only",
        "The recorded zero award field remains in the private source archive. No draft agreement is invented for an opportunity without a declared award.",
      );
    if (row.next)
      warn(
        "grants",
        row.id,
        "next",
        "archive_only",
        "The legacy next-step text has no equivalent typed grant field and remains in the private archive.",
      );
  }
  for (const row of w.tasks)
    add(idMap.tasks[row.id].targetId, "projects", {
      title: row.title,
      kind: "task",
      ...linked(row.projectId),
      priority: row.priority,
    });
  for (const row of w.outcomes) {
    add(idMap.outcomes[row.id].targetId, "outcomes", {
      title: row.indicator,
      kind: "indicator",
      programId: linked(row.projectId).programId,
      unit: row.unit || null,
      sourceUrl: row.source || null,
      limitations:
        "Imported indicator definition only. The original observation value, recording date and evidence assertion remain in the private migration archive. Supply a real measurement period and any required denominator before recreating an observation.",
    });
    warn(
      "outcomes",
      row.id,
      "value,date,evidence",
      "observation_needs_review",
      "Only a draft indicator definition is activated. The source value (including zero/null), recording date and claimed evidence remain unchanged in the private archive. No measurement period, denominator or independent evidence is invented.",
      { targetId: idMap.outcomes[row.id].targetId },
    );
  }
  for (const kind of KINDS)
    for (const row of w[kind]) {
      const raw = source.workspace[kind].find((r) => r.id.trim() === row.id);
      unknown(raw, FIELDS[kind], kind, row.id);
      if (row.notes)
        warn(
          kind,
          row.id,
          "notes",
          "archive_only",
          "Free-form legacy notes remain only in the private original archive; unsupported or sensitive narratives are not copied into active generic notes.",
        );
      if (row.owner)
        warn(
          kind,
          row.id,
          "owner",
          "archive_only",
          "A legacy owner label is not an authenticated user assignment. It is archived without creating a person, account or permission.",
        );
      const deadline = kind === "grants" ? row.deadline : row.due;
      if (deadline)
        warn(
          kind,
          row.id,
          kind === "grants" ? "deadline" : "due",
          "date_without_time",
          "The source date has no clock time or named zone. It remains in the private archive; no shared deadline instant or reminder is invented.",
        );
      if (kind !== "outcomes")
        warn(
          kind,
          row.id,
          "status",
          "workflow_reset",
          "The source status is archived. Imported work starts at the shared module’s initial state without implying an approval, completion, submission or award decision.",
        );
      for (const key of FIELDS[kind])
        if (typeof raw[key] === "string" && raw[key] !== raw[key].trim())
          warn(
            kind,
            row.id,
            key,
            "trimmed_for_contract",
            "Leading/trailing whitespace is normalized in active fields; exact source text remains in the private archive.",
          );
    }
  for (const record of records)
    record.data = validateRecord(record.moduleId, record.data, {
      records,
      recordId: record.id,
      status: record.status,
    });
  const sourceCounts = Object.fromEntries(
    KINDS.map((kind) => [kind, w[kind].length]),
  );
  const targetCounts = Object.fromEntries(
    [...new Set(records.map((r) => r.moduleId))]
      .sort()
      .map((kind) => [kind, records.filter((r) => r.moduleId === kind).length]),
  );
  const summary = {
    sourceCounts,
    sourceRecords: KINDS.reduce((sum, kind) => sum + sourceCounts[kind], 0),
    targetCounts,
    targetRecords: records.length,
    warningCount: warnings.length,
    archivedObservationMeasurements: w.outcomes.length,
    approvalsReset: records.length,
    requiresEmptyOrganization: true,
    requiresExplicitConfirmation: true,
  };
  const migration = {
    format: MIGRATION_FORMAT,
    version: 1,
    adapterVersion: 1,
    sourceFormat: LOCAL_OS_FORMAT,
    inputCanonicalHash: sourceHash,
    ...(typeof input === "string" ? { inputByteHash: hash(input) } : {}),
    createdAt,
    summary,
    warnings,
    idMap,
    sourceBackup: source,
    archiveVisibility: "organization-administrators-only",
  };
  const backup = makeBackup(
    {
      name: organization.name,
      currency: organization.currency,
      time_zone: zone,
    },
    records,
    { createdAt, migration },
  );
  if (bytes(backup) > MAX_MIGRATION_BYTES)
    invalid(
      "backup",
      "The lossless migration backup exceeds 64 MiB. Nothing was truncated; split an archive deliberately before importing.",
    );
  validateBackup(backup, "migration-preview-org", "migration-preview-actor");
  return { backup, summary, warnings, inputCanonicalHash: sourceHash };
}
