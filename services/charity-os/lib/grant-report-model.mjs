/** Deterministic, IO-free grant-period assembly. Persisted authority is supplied by the tenant service. */
import {
  CURRENCIES,
  getModule,
  modulePermissions,
  validDate,
  validateRecord,
} from "./modules.mjs";
import { fail, hash, stable } from "./security.mjs";

export const GRANT_REPORT_METHOD = "grant-report-v1";
export const GRANT_REPORT_MODEL_LIMITS = Object.freeze({
  selected: 100,
  closure: 250,
  bytes: 2 * 1024 * 1024,
});
const STATES = Object.freeze({
  programs: ["approved", "active", "paused", "closed"],
  "grant-seeking": ["submitted", "decided"],
  "grant-delivery": ["approved", "active", "reporting", "closed"],
  finance: ["approved", "active", "reconciled", "closed"],
  fundraising: ["approved", "active", "reconciled", "acknowledged"],
  outcomes: ["approved", "included"],
  reporting: ["approved", "frozen", "issued"],
});
const plain = (value) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const opaque = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const copy = (value) => JSON.parse(stable(value));
const issue = (field, message, code = "grant_report_source") =>
  fail(422, code, message, [{ field, message }]);
const unavailable = () =>
  fail(
    403,
    "grant_report_source",
    "A required source is unavailable within current read/export authority.",
  );
const instant = (value) => {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  return (
    !!match &&
    validDate(match[1]) &&
    +match[2] < 24 &&
    +match[3] < 60 &&
    +match[4] < 60 &&
    (!match[6] ||
      (+match[6] <= 14 &&
        +match[7] < 60 &&
        (+match[6] < 14 || +match[7] === 0))) &&
    Number.isFinite(Date.parse(value))
  );
};
const access = (moduleId, member) => {
  try {
    return modulePermissions(moduleId, member?.role);
  } catch {
    return {};
  }
};
const scope = (programId, member) =>
  opaque(programId) &&
  (!(member.programIds || []).length || member.programIds.includes(programId));
const sourceIdentity = (r) => ({
  moduleId: r.moduleId,
  id: r.id,
  revision: r.revision,
});
const dataEnvelope = (r) => ({
  orgId: r.orgId,
  moduleId: r.moduleId,
  id: r.id,
  revision: r.revision,
  status: r.status,
  data: r.data,
});
const dataHash = (r) => hash(dataEnvelope(r));
const sorted = (values) =>
  [...values].sort((a, b) =>
    `${a.moduleId}/${a.id}`.localeCompare(`${b.moduleId}/${b.id}`, "en"),
  );
function approval(r, required = true) {
  const a = r.approval;
  if (
    !plain(a) ||
    a.status !== "approved" ||
    a.revision !== r.revision ||
    !opaque(a.actorId) ||
    !opaque(r.lastEditedBy) ||
    a.actorId === r.lastEditedBy ||
    !instant(a.at)
  ) {
    if (!required) return null;
    fail(
      409,
      "grant_report_approval",
      "Every factual source needs current independent approval of its exact revision.",
    );
  }
  return { revision: a.revision, actorId: a.actorId, at: a.at };
}
function period(startDate, endDate, field) {
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate)
    issue(field, "Supply a real inclusive start/end date period.");
  return { startDate, endDate, convention: "inclusive-dates" };
}
function inside(child, parent, field) {
  if (child.startDate < parent.startDate || child.endDate > parent.endDate)
    issue(
      field,
      "The complete selected period must be inside the report period; no proration is inferred.",
    );
}
function dated(date, enclosing, field) {
  if (
    !validDate(date) ||
    date < enclosing.startDate ||
    date > enclosing.endDate
  )
    issue(field, "Supply an explicit date within the inclusive report period.");
  return date;
}
function money(value, currency, field, required = false) {
  if (value === null || value === undefined) {
    if (required)
      issue(
        field,
        "An explicit awarded-money currency and precision is required, even when its amount is unknown.",
      );
    return null;
  }
  if (
    !plain(value) ||
    Object.keys(value).some(
      (k) => !["minor", "currency", "precision"].includes(k),
    ) ||
    !Object.hasOwn(CURRENCIES, value.currency) ||
    value.precision !== CURRENCIES[value.currency] ||
    (value.minor !== null &&
      (!Number.isSafeInteger(value.minor) || value.minor < 0))
  )
    issue(
      field,
      "Use nonnegative safe integer minor units or null with an explicit supported currency/precision.",
    );
  if (
    currency &&
    (value.currency !== currency.code || value.precision !== currency.precision)
  )
    issue(
      field,
      "Every selected money object must use the agreement currency and precision; no conversion is inferred.",
    );
  return copy(value);
}
const missingMoney = (value) => value === null || value.minor === null;
function bounded(report) {
  if (
    Buffer.byteLength(stable(report), "utf8") > GRANT_REPORT_MODEL_LIMITS.bytes
  )
    issue(
      "selection",
      "The complete report exceeds 2 MiB. Reduce the selected sources.",
      "grant_report_size",
    );
}
function financialSummary(items) {
  let sum = 0n,
    knownCount = 0;
  for (const item of items)
    if (!missingMoney(item.amount)) {
      sum += BigInt(item.amount.minor);
      knownCount++;
    }
  if (sum > BigInt(Number.MAX_SAFE_INTEGER))
    issue(
      "amount",
      "The known subtotal exceeds safe integer precision. Split the report period or selection.",
    );
  const selectedCount = items.length,
    unknownCount = selectedCount - knownCount;
  return {
    totalMinor: !selectedCount || unknownCount ? null : Number(sum),
    knownSubtotalMinor: Number(sum),
    knownCount,
    unknownCount,
    selectedCount,
    coverage: !selectedCount ? "empty" : unknownCount ? "partial" : "complete",
    notice: !selectedCount
      ? "No references were selected; this is not evidence of zero activity."
      : unknownCount
        ? "Selected amounts are missing. The known subtotal is not a complete total."
        : "Total of selected external references only; completeness of the external ledger has not been established.",
    items,
  };
}
function identityKey(system, reference, field) {
  if (
    typeof system !== "string" ||
    !system.trim() ||
    typeof reference !== "string" ||
    !reference.trim()
  )
    issue(
      field,
      "An identified external system and explicit external reference is required.",
    );
  return stable([system.trim().toLowerCase(), reference.trim()]);
}
function distinct(items, keyFor, field) {
  const keys = new Set();
  for (const row of items) {
    const key = keyFor(row);
    if (key === null) continue;
    if (keys.has(key))
      issue(
        field,
        "Selected references repeat the same external source identity. Resolve the duplicate before review.",
      );
    keys.add(key);
  }
}
function immutableEnvelope(r) {
  return {
    ...copy(dataEnvelope(r)),
    ownerId: r.ownerId ?? null,
    lastEditedBy: r.lastEditedBy,
    approval: { status: "approved", ...approval(r) },
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}
function checkCorrection(previous, manifest, org, agreement, programId) {
  const previousId = manifest.data.supersedesReportId;
  if (!previousId) {
    if (previous)
      issue(
        "supersedesReportId",
        "The supplied earlier report is not selected by this manifest.",
      );
    return null;
  }
  if (!manifest.data.revisionReason?.trim())
    issue(
      "revisionReason",
      "Explain the correction in the independently reviewed manifest.",
    );
  if (
    !plain(previous) ||
    previous.kind !== "grant-period" ||
    previous.methodVersion !== GRANT_REPORT_METHOD ||
    previous.id !== previousId ||
    previous.orgId !== org ||
    previous.agreement?.id !== agreement.id ||
    previous.agreement?.programId !== programId ||
    !digest(previous.checksum)
  )
    issue(
      "supersedesReportId",
      "The earlier immutable grant report must have the same organization, agreement and program.",
    );
  const { checksum, ...payload } = previous;
  if (hash(payload) !== checksum)
    issue(
      "supersedesReportId",
      "The earlier report checksum does not match its immutable payload.",
    );
  return { id: previous.id, checksum, reason: manifest.data.revisionReason };
}
function historicalSubmission(events, application, org, context, identity) {
  if (!Array.isArray(events))
    issue("applicationId", "The server submission artifact is required.");
  const eligible = events.filter(
    (event) =>
      plain(event) &&
      event.recordId === application.id &&
      plain(event.record) &&
      event.record.data?.applicationVersion ===
        application.data.applicationVersion &&
      event.record.data?.submissionReference ===
        application.data.submissionReference,
  );
  // More than one matching transition is ambiguous; never silently choose a convenient history entry.
  if (eligible.length !== 1)
    issue(
      "applicationId",
      "Exactly one matching server-created submitted application artifact is required.",
    );
  const event = eligible[0],
    record = event.record,
    snap = record.snapshot;
  if (
    !opaque(String(event.id)) ||
    !instant(event.createdAt) ||
    record.orgId !== org ||
    record.moduleId !== "grant-seeking" ||
    record.id !== application.id ||
    record.status !== "submitted" ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    record.revision > application.revision ||
    !plain(snap) ||
    snap.orgId !== org ||
    snap.moduleId !== record.moduleId ||
    snap.id !== record.id ||
    snap.status !== "submitted" ||
    snap.revision !== record.revision ||
    !plain(snap.data) ||
    hash(snap.data) !== hash(record.data)
  )
    issue(
      "applicationId",
      "Submitted provenance must identify this application, its own submitted revision and matching captured data.",
    );
  approval(record);
  for (const field of getModule("grant-seeking").fields.filter((f) =>
    ["reference", "references"].includes(f.type),
  )) {
    const ids =
      field.type === "references"
        ? snap.data[field.key] || []
        : snap.data[field.key]
          ? [snap.data[field.key]]
          : [];
    if (!Array.isArray(ids))
      issue(
        "applicationId",
        "The submitted artifact has invalid reference fields.",
      );
    for (const id of ids) identity(id, field.target);
  }
  let normalized;
  try {
    normalized = validateRecord("grant-seeking", snap.data, {
      orgId: org,
      recordId: record.id,
      status: "submitted",
      records: context,
    });
  } catch {
    issue(
      "applicationId",
      "The submitted application artifact has invalid typed data or references.",
    );
  }
  if (
    normalized.programId !== application.data.programId ||
    normalized.kind !== "application" ||
    normalized.applicationVersion !== application.data.applicationVersion ||
    normalized.submissionReference !== application.data.submissionReference
  )
    issue(
      "applicationId",
      "Submitted provenance must match the explicit program, version and submission reference.",
    );
  const snapshot = {
    ...dataEnvelope({ ...snap, data: normalized }),
    createdAt: snap.createdAt ?? null,
    updatedAt: snap.updatedAt ?? null,
  };
  return {
    eventId: String(event.id),
    createdAt: event.createdAt,
    revision: snap.revision,
    dataHash: dataHash(snapshot),
    submissionReference: normalized.submissionReference,
    record: snapshot,
    approval: approval(record),
  };
}
function boardSource(source) {
  return {
    moduleId: source.moduleId,
    id: source.id,
    revision: source.revision,
    sourceStatus: source.status,
    dataHash: source.dataHash,
    ...(source.snapshotRef
      ? {
          snapshotRef: {
            eventId: source.snapshotRef.eventId,
            revision: source.snapshotRef.revision,
            dataHash: source.snapshotRef.dataHash,
          },
        }
      : {}),
  };
}
function hasPath(value, path) {
  let current = value;
  for (const key of path.split("/").slice(1)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return false;
    current = current[key];
  }
  return true;
}
function boardView(report) {
  const sections = copy(report.sections);
  delete sections.grantContext.application;
  for (const name of ["receipts", "spending"])
    sections.finances[name].items = sections.finances[name].items.map(
      ({ source, date, amount }) => ({ source, date, amount }),
    );
  sections.observations = sections.observations.map(
    ({ sourceUrl, ...safe }) => safe,
  );
  const board = {
    kind: "grant-period-board",
    schemaVersion: 1,
    methodVersion: GRANT_REPORT_METHOD,
    title: report.title,
    manifest: copy(report.manifest),
    agreement: copy(report.agreement),
    program: copy(report.program),
    period: copy(report.period),
    currency: copy(report.currency),
    sections,
    sourceRevisions: report.sourceRevisions.map(boardSource),
    supersedes: copy(report.supersedes),
  };
  board.trace = report.trace
    .filter((item) => hasPath(board, item.outputPath))
    .map((item) => ({
      ...copy(item),
      sources: item.sources.map(
        ({ moduleId, id, revision, dataHash, fields }) => ({
          moduleId,
          id,
          revision,
          dataHash,
          fields: [...fields],
        }),
      ),
    }));
  return board;
}

/** All records are persisted, active, full-organization rowRecord envelopes, never reader snapshots. */
export function compileGrantReport({
  org,
  member,
  records,
  reportingRecordId,
  revision,
  submissionEvents = [],
  previousReport = null,
  mode = "preview",
} = {}) {
  if (
    !opaque(org) ||
    !plain(member) ||
    !opaque(member.userId) ||
    !Number.isSafeInteger(member.revision) ||
    member.revision < 1 ||
    !Array.isArray(member.programIds || []) ||
    (member.programIds || []).some((p) => !opaque(p))
  )
    unavailable();
  const creator = access("reporting", member);
  if (
    !creator.write ||
    !creator.export ||
    !creator.read ||
    ["board_reader", "external_reviewer"].includes(member.role)
  )
    unavailable();
  if (
    !["prepare", "preview"].includes(mode) ||
    !opaque(reportingRecordId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Array.isArray(records)
  )
    issue(
      "manifest",
      "Choose a saved reporting manifest, current revision and supported operation.",
    );
  const index = new Map();
  for (const row of records) {
    if (!plain(row) || !opaque(row.id) || !opaque(row.moduleId))
      issue(
        "records",
        "Source context must contain valid current record identities.",
      );
    if (index.has(row.id))
      issue("records", "Source context contains duplicate record identities.");
    index.set(row.id, row);
  }
  const closure = new Map();
  let programId;
  function get(recordId, moduleId, { factual = true, identity = false } = {}) {
    const r = index.get(recordId),
      p = access(moduleId, member);
    if (
      !r ||
      r.orgId !== org ||
      r.moduleId !== moduleId ||
      r.deletedAt ||
      r.deleted_at ||
      !p.read ||
      (!identity && !p.export)
    )
      unavailable();
    if (!plain(r.data))
      issue("sources", "A required authorized source has invalid typed data.");
    const anchor = moduleId === "programs" ? r.id : r.data.programId;
    if (
      (anchor && !scope(anchor, member)) ||
      (!identity && (!opaque(anchor) || (programId && anchor !== programId)))
    )
      unavailable();
    if (!identity) {
      if (!Number.isSafeInteger(r.revision) || r.revision < 1)
        issue("revision", "A required source has no valid current revision.");
      if (factual && !STATES[moduleId]?.includes(r.status))
        fail(
          409,
          "grant_report_state",
          "A required current source is not in an eligible approved workflow state.",
        );
      if (factual) approval(r);
      closure.set(r.id, r);
      if (closure.size > GRANT_REPORT_MODEL_LIMITS.closure)
        issue(
          "selection",
          "The required dependency closure exceeds 250 records.",
        );
    }
    return r;
  }
  const manifest = get(reportingRecordId, "reporting", {
    factual: mode === "preview",
  });
  if (manifest.revision !== revision)
    fail(
      409,
      "revision",
      "The manifest changed. Reload its current revision before continuing.",
    );
  if (
    mode === "prepare" &&
    !["draft", "review", ...STATES.reporting].includes(manifest.status)
  )
    fail(
      409,
      "grant_report_state",
      "Prepare requires an active reporting manifest.",
    );
  programId = manifest.data.programId;
  const program = get(programId, "programs");
  if (program.data.kind !== "program")
    issue("programId", "Choose an explicit program record.");
  const agreement = get(manifest.data.agreementId, "grant-delivery");
  if (agreement.data.kind !== "agreement")
    issue(
      "agreementId",
      "Choose one grant agreement, not a report, restriction or amendment.",
    );
  const application = get(agreement.data.applicationId, "grant-seeking");
  if (application.data.kind !== "application")
    issue(
      "applicationId",
      "The agreement must identify its submitted application.",
    );
  const arrays = ["receiptIds", "financeIds", "outcomeIds"];
  const selections = Object.fromEntries(
    arrays.map((field) => {
      const ids = manifest.data[field] ?? [];
      if (
        !Array.isArray(ids) ||
        ids.some((x) => !opaque(x)) ||
        new Set(ids).size !== ids.length
      )
        issue(field, "Select distinct saved source IDs.");
      return [field, [...ids].sort()];
    }),
  );
  if (
    Object.values(selections).reduce((n, rows) => n + rows.length, 0) >
    GRANT_REPORT_MODEL_LIMITS.selected
  )
    issue(
      "selection",
      "Select at most 100 receipt, finance and outcome records combined.",
    );
  const receipts = selections.receiptIds.map((id) => get(id, "fundraising"));
  const finances = selections.financeIds.map((id) => get(id, "finance"));
  const observations = selections.outcomeIds.map((id) => get(id, "outcomes"));
  const selectedFinance = new Set(finances.map((r) => r.id));
  const financeClosure = new Map();
  const visitFinance = (r, visiting = new Set()) => {
    if (visiting.has(r.id))
      issue("parentBudgetId", "Parent budgets contain a cycle.");
    if (financeClosure.has(r.id)) return;
    const path = new Set([...visiting, r.id]);
    if (r.data.parentBudgetId) {
      const parent = get(r.data.parentBudgetId, "finance");
      if (parent.data.kind !== "budget")
        issue("parentBudgetId", "The required parent must be a budget.");
      visitFinance(parent, path);
    }
    financeClosure.set(r.id, r);
  };
  for (const r of finances) visitFinance(r);
  for (const r of observations) {
    if (!["observation", "harm"].includes(r.data.kind) || !r.data.indicatorId)
      issue(
        "outcomeIds",
        "Select individual observations or harms with an explicit indicator definition.",
      );
    const indicator = get(r.data.indicatorId, "outcomes");
    if (indicator.data.kind !== "indicator")
      issue("indicatorId", "The linked definition must be an indicator.");
  }
  // Check all linked identities before typed errors; linked private content is never silently copied.
  for (const r of closure.values())
    for (const field of getModule(r.moduleId).fields.filter((f) =>
      ["reference", "references"].includes(f.type),
    )) {
      const ids =
        field.type === "references"
          ? r.data[field.key] || []
          : r.data[field.key]
            ? [r.data[field.key]]
            : [];
      if (!Array.isArray(ids))
        issue(field.key, "Use saved source reference IDs.");
      for (const id of ids) get(id, field.target, { identity: true });
    }
  // A linked unchecked amendment is a blocker too; this model has no precedence/effective-date engine.
  for (const row of records)
    if (
      row.orgId === org &&
      row.moduleId === "grant-delivery" &&
      !row.deletedAt &&
      !row.deleted_at &&
      row.status !== "cancelled" &&
      row.data?.agreementId === agreement.id &&
      ["amendment", "restriction"].includes(row.data.kind)
    ) {
      get(row.id, "grant-delivery", { identity: true });
      if (row.data.kind === "amendment")
        fail(
          409,
          "grant_report_amendment",
          "Resolve linked noncancelled amendments before preparing this agreement; amendment precedence is not supported.",
        );
      if (
        ["restriction", "restrictionCode", "allowedPurpose"].some(
          (key) =>
            row.data[key] !== null &&
            row.data[key] !== undefined &&
            row.data[key] !== agreement.data[key],
        )
      )
        fail(
          409,
          "grant_report_restriction",
          "A linked restriction disagrees with the current agreement. Resolve the source terms before review.",
        );
    }
  // Normalization is complete and deterministic; validation context includes existing identity/sibling invariants.
  const normalized = new Map();
  for (const r of closure.values()) {
    let data;
    try {
      data = validateRecord(r.moduleId, r.data, {
        orgId: org,
        recordId: r.id,
        status: r.status,
        records,
      });
    } catch (error) {
      issue(
        "sources",
        "A selected source has invalid typed data or reference invariants. Correct the source record before preparation.",
      );
    }
    normalized.set(r.id, { ...r, data });
  }
  const M = normalized.get(manifest.id),
    A = normalized.get(agreement.id),
    P = normalized.get(program.id),
    APP = normalized.get(application.id);
  if (M.data.assemblyMethod !== GRANT_REPORT_METHOD)
    issue(
      "assemblyMethod",
      "Save the grant-report-v1 assembly method on this manifest before Prepare.",
    );
  if (!["private", "board", "funder"].includes(M.data.visibility))
    issue(
      "visibility",
      "Choose private, board or funder. This assembler does not publish reports publicly.",
    );
  const reportPeriod = period(M.data.startDate, M.data.endDate, "period");
  const agreementPeriod = period(
    A.data.startDate,
    A.data.endDate,
    "agreementId",
  );
  inside(reportPeriod, agreementPeriod, "period");
  const awarded = money(A.data.awarded, null, "awarded", true),
    currency = { code: awarded.currency, precision: awarded.precision };
  const committed = money(A.data.committed, currency, "committed"),
    recordedAgreementSpending = money(A.data.spent, currency, "spent");
  money(APP.data.requested, currency, "requested");
  const historical = historicalSubmission(
    submissionEvents,
    APP,
    org,
    records,
    (id, moduleId) => get(id, moduleId, { identity: true }),
  );
  money(historical.record.data.requested, currency, "submitted.requested");
  const receiptItems = receipts.map((raw) => {
    const r = normalized.get(raw.id),
      d = r.data;
    if (d.kind !== "gift-reference" || d.agreementId !== A.id)
      issue(
        "receiptIds",
        "Every receipt must be an explicit gift-reference linked to this agreement.",
      );
    identityKey(d.externalSystem, d.receiptReference, "receiptReference");
    if (
      d.restricted === true &&
      (A.data.restriction !== "restricted" ||
        d.restrictionPurpose !== A.data.allowedPurpose)
    )
      issue(
        "restrictionPurpose",
        "Receipt restriction purpose disagrees with the explicit agreement.",
      );
    return {
      source: sourceIdentity(r),
      date: dated(d.receivedDate, reportPeriod, "receivedDate"),
      amount: money(d.amount, currency, "amount"),
      externalSystem: d.externalSystem,
      externalId: d.externalId,
      receiptReference: d.receiptReference,
    };
  });
  distinct(
    receiptItems,
    (r) =>
      identityKey(r.externalSystem, r.receiptReference, "receiptReference"),
    "receiptIds",
  );
  distinct(
    receiptItems,
    (r) =>
      r.externalId
        ? identityKey(r.externalSystem, r.externalId, "externalId")
        : null,
    "receiptIds",
  );
  const spendingItems = [],
    planning = [],
    notices = [];
  for (const raw of sorted([...financeClosure.values()])) {
    const r = normalized.get(raw.id),
      d = r.data,
      isDependency = !selectedFinance.has(r.id);
    if (d.agreementId !== A.id)
      issue(
        "financeIds",
        "Every selected financial source and parent budget must identify this agreement.",
      );
    const planned = money(d.planned, currency, "planned"),
      actual = money(d.actual, currency, "actual");
    if (
      A.data.restriction === "restricted" &&
      (d.restrictionCode !== A.data.restrictionCode ||
        d.purpose !== A.data.allowedPurpose)
    )
      issue(
        "restrictionCode",
        "Financial restriction code and permitted purpose must match the agreement.",
      );
    if (d.kind === "actual-reference" && d.actualClass === "cash-spent") {
      if (isDependency)
        issue(
          "parentBudgetId",
          "An actual reference cannot be a parent budget.",
        );
      identityKey(d.externalSystem, d.externalId, "externalId");
      spendingItems.push({
        source: sourceIdentity(r),
        date: dated(d.actualDate, reportPeriod, "actualDate"),
        amount: actual,
        externalSystem: d.externalSystem,
        externalId: d.externalId,
      });
      continue;
    }
    if (
      !["budget", "allocation", "scenario", "actual-reference"].includes(d.kind)
    )
      issue(
        "financeIds",
        "Select a supported planning or external actual-reference row.",
      );
    let sourcePeriod;
    if (d.kind === "actual-reference" && d.actualDate) {
      dated(d.actualDate, reportPeriod, "actualDate");
      sourcePeriod = period(d.actualDate, d.actualDate, "actualDate");
    } else {
      sourcePeriod = period(d.startDate, d.endDate, "financePeriod");
      inside(
        sourcePeriod,
        isDependency ? agreementPeriod : reportPeriod,
        "financePeriod",
      );
    }
    if (d.parentBudgetId) {
      const parent = normalized.get(d.parentBudgetId);
      inside(
        sourcePeriod,
        period(parent.data.startDate, parent.data.endDate, "parentBudgetId"),
        "parentBudgetId",
      );
    }
    const classificationNotice =
      d.kind === "actual-reference"
        ? "This reference is not explicitly classified as cash spent and contributes no cash subtotal."
        : isDependency
          ? "Parent budget context only; planning amounts are not period cash movements."
          : "Planning amounts are shown individually and are not added to receipts or spending.";
    planning.push({
      source: sourceIdentity(r),
      kind: d.kind,
      planned,
      actual,
      actualClass: d.actualClass,
      period: sourcePeriod,
      parentBudgetId: d.parentBudgetId,
      isDependency,
      classificationNotice,
    });
    if (d.kind === "actual-reference") notices.push(classificationNotice);
  }
  distinct(
    spendingItems,
    (r) => identityKey(r.externalSystem, r.externalId, "externalId"),
    "financeIds",
  );
  const observationRows = observations.map((raw) => {
    const r = normalized.get(raw.id),
      d = r.data,
      indicator = normalized.get(d.indicatorId);
    if (!indicator || d.unit !== indicator.data.unit || !d.unit)
      issue(
        "unit",
        "Every observation must use its approved indicator’s exact unit.",
      );
    const measuredPeriod = period(d.startDate, d.endDate, "outcomePeriod");
    inside(measuredPeriod, reportPeriod, "outcomePeriod");
    return {
      source: sourceIdentity(r),
      indicator: {
        id: indicator.id,
        revision: indicator.revision,
        title: indicator.data.title,
        unit: indicator.data.unit,
      },
      kind: d.kind,
      title: d.title,
      value: d.value,
      unit: d.unit,
      denominator: d.denominator,
      period: measuredPeriod,
      geography: d.geography,
      method: d.method,
      evidence: d.evidence,
      sourceUrl: d.sourceUrl,
      limitations: d.limitations,
    };
  });
  const sourceRevisions = sorted([...normalized.values()]).map((r) => ({
    ...sourceIdentity(r),
    status: r.status,
    dataHash: dataHash(r),
    approval: approval(r, r.id !== M.id || mode === "preview"),
    ...(r.id === APP.id
      ? {
          snapshotRef: {
            eventId: historical.eventId,
            createdAt: historical.createdAt,
            revision: historical.revision,
            dataHash: historical.dataHash,
            submissionReference: historical.submissionReference,
          },
        }
      : {}),
  }));
  const selection = { ...M.data };
  delete selection.sourceDigest;
  const factualRefs = sourceRevisions.filter((r) => r.id !== M.id);
  const sourceDigest = hash({
    methodVersion: GRANT_REPORT_METHOD,
    manifestId: M.id,
    selection,
    agreement: A.id,
    period: reportPeriod,
    sourceRefs: factualRefs,
  });
  if (mode === "preview" && M.data.sourceDigest !== sourceDigest)
    fail(
      409,
      "grant_report_digest",
      "Sources or manifest data changed. Prepare sources, save the returned digest and obtain fresh independent manifest approval.",
    );
  const summaryReceipts = financialSummary(receiptItems),
    summarySpending = financialSummary(spendingItems);
  const report = {
    format: "charitology-os-report",
    kind: "grant-period",
    schemaVersion: 1,
    methodVersion: GRANT_REPORT_METHOD,
    title: M.data.title,
    manifest: {
      id: M.id,
      revision: M.revision,
      hash: dataHash(M),
      sourceDigest,
      audience: M.data.visibility,
    },
    agreement: { id: A.id, revision: A.revision, programId },
    program: { id: P.id, revision: P.revision, title: P.data.title },
    period: reportPeriod,
    currency,
    sections: {
      summary: M.data.summary,
      grantContext: {
        awarded,
        committed,
        recordedAgreementSpending,
        restriction: {
          status: A.data.restriction,
          code: A.data.restrictionCode,
          purpose: A.data.allowedPurpose,
        },
        application: {
          current: {
            id: APP.id,
            revision: APP.revision,
            status: APP.status,
            submissionReference: APP.data.submissionReference,
          },
          submitted: {
            eventId: historical.eventId,
            createdAt: historical.createdAt,
            revision: historical.revision,
            dataHash: historical.dataHash,
            submissionReference: historical.submissionReference,
          },
        },
      },
      finances: {
        receipts: summaryReceipts,
        spending: summarySpending,
        planning,
      },
      observations: observationRows,
      gaps: {
        declared: M.data.missingness,
        selection: {
          receiptCount: receipts.length,
          financeCount: finances.length,
          outcomeCount: observations.length,
        },
        notices: [
          ...new Set([
            "Only explicitly selected references are covered; this is not a complete ledger or causal impact evaluation.",
            ...(!receipts.length ? [summaryReceipts.notice] : []),
            ...(!spendingItems.length ? [summarySpending.notice] : []),
            ...(!observations.length
              ? [
                  "No observations were selected; this is not evidence of zero outcomes.",
                ]
              : []),
            ...notices,
          ]),
        ],
      },
    },
    trace: [],
    sourceRevisions,
    modules: [],
    supersedes: checkCorrection(previousReport, M, org, A, programId),
  };
  const refsById = new Map(sourceRevisions.map((r) => [r.id, r]));
  const trace = (outputPath, operation, sources, missingness = "known") =>
    report.trace.push({
      outputPath,
      operation,
      sources: sources.map(([id, fields]) => {
        const r = refsById.get(id);
        return { ...sourceIdentity(r), dataHash: r.dataHash, fields };
      }),
      missingness,
    });
  trace("/title", "copy-v1", [[M.id, ["data.title"]]]);
  trace("/period", "copy-v1", [
    [M.id, ["data.startDate", "data.endDate"]],
    [A.id, ["data.startDate", "data.endDate"]],
  ]);
  trace("/currency", "copy-v1", [
    [A.id, ["data.awarded.currency", "data.awarded.precision"]],
  ]);
  trace("/program/title", "copy-v1", [[P.id, ["data.title"]]]);
  trace(
    "/sections/summary",
    "copy-v1",
    [[M.id, ["data.summary"]]],
    M.data.summary === null ? "unknown" : "known",
  );
  for (const [key, field] of [
    ["awarded", "awarded"],
    ["committed", "committed"],
    ["recordedAgreementSpending", "spent"],
  ])
    trace(
      `/sections/grantContext/${key}`,
      "copy-v1",
      [[A.id, [`data.${field}`]]],
      missingMoney(report.sections.grantContext[key]) ? "unknown" : "known",
    );
  trace(
    "/sections/grantContext/restriction",
    "copy-v1",
    [
      [
        A.id,
        ["data.restriction", "data.restrictionCode", "data.allowedPurpose"],
      ],
    ],
    A.data.restriction === null || A.data.restriction === "unknown"
      ? "unknown"
      : "known",
  );
  trace("/sections/grantContext/application/current", "copy-v1", [
    [APP.id, ["status", "revision", "data.submissionReference"]],
  ]);
  trace(
    "/sections/grantContext/application/submitted",
    "copy-historical-submission-v1",
    [
      [
        APP.id,
        [
          "submittedArtifact.eventId",
          "submittedArtifact.record.revision",
          "submittedArtifact.record.data.submissionReference",
        ],
      ],
    ],
  );
  for (const [key, field] of [
    ["receipts", "amount"],
    ["spending", "actual"],
  ]) {
    const summary = report.sections.finances[key];
    trace(
      `/sections/finances/${key}`,
      "sum-known-minor-v1",
      summary.items.map((item) => [
        item.source.id,
        [
          `data.${field}`,
          key === "receipts" ? "data.receivedDate" : "data.actualDate",
        ],
      ]),
      summary.coverage === "empty"
        ? "not-selected"
        : summary.coverage === "partial"
          ? "partial"
          : "known",
    );
    summary.items.forEach((item, i) =>
      trace(
        `/sections/finances/${key}/items/${i}`,
        "copy-v1",
        [
          [
            item.source.id,
            key === "receipts"
              ? [
                  "data.amount",
                  "data.receivedDate",
                  "data.externalSystem",
                  "data.receiptReference",
                  "data.externalId",
                ]
              : [
                  "data.actual",
                  "data.actualClass",
                  "data.actualDate",
                  "data.externalSystem",
                  "data.externalId",
                ],
          ],
        ],
        missingMoney(item.amount) ? "unknown" : "known",
      ),
    );
  }
  planning.forEach((item, i) =>
    trace(
      `/sections/finances/planning/${i}`,
      "planning-context-v1",
      [
        [
          item.source.id,
          [
            "data.kind",
            "data.planned",
            "data.actual",
            "data.actualClass",
            "data.actualDate",
            "data.startDate",
            "data.endDate",
            "data.parentBudgetId",
          ],
        ],
      ],
      missingMoney(item.planned) || missingMoney(item.actual)
        ? "partial"
        : "known",
    ),
  );
  observationRows.forEach((item, i) =>
    trace(
      `/sections/observations/${i}`,
      "observation-unpooled-v1",
      [
        [
          item.source.id,
          [
            "data.value",
            "data.unit",
            "data.denominator",
            "data.startDate",
            "data.endDate",
            "data.geography",
            "data.method",
            "data.evidence",
            "data.sourceUrl",
            "data.limitations",
          ],
        ],
        [item.indicator.id, ["data.title", "data.unit"]],
      ],
      item.value === null ? "unknown" : "known",
    ),
  );
  trace(
    "/sections/gaps/declared",
    "copy-v1",
    [[M.id, ["data.missingness"]]],
    M.data.missingness === null ? "unknown" : "known",
  );
  trace("/sections/gaps/selection", "selection-count-v1", [
    [M.id, arrays.map((field) => `data.${field}`)],
  ]);
  const grouped = new Map();
  for (const r of sorted([...normalized.values()])) {
    if (!grouped.has(r.moduleId))
      grouped.set(r.moduleId, {
        id: r.moduleId,
        title: getModule(r.moduleId).title,
        records: [],
      });
    const frozen =
      r.id === M.id && mode === "prepare" && !approval(r, false)
        ? {
            ...copy(dataEnvelope(r)),
            ownerId: r.ownerId ?? null,
            lastEditedBy: r.lastEditedBy,
            approval: null,
            createdAt: r.createdAt ?? null,
            updatedAt: r.updatedAt ?? null,
          }
        : immutableEnvelope(r);
    if (r.id === APP.id) frozen.submittedArtifact = copy(historical);
    grouped.get(r.moduleId).records.push(frozen);
  }
  report.modules = [...grouped.values()];
  report.boardProjection = boardView(report);
  bounded(report);
  return { mode, sourceDigest, report };
}

/** Called only with a freshly recompiled preview inside the service's current tenant mutation lock. */
export function finalizeGrantReport(
  compiled,
  { id, org, user, member, createdAt, command } = {},
) {
  if (
    !plain(compiled) ||
    compiled.mode !== "preview" ||
    compiled.report?.kind !== "grant-period" ||
    compiled.report.methodVersion !== GRANT_REPORT_METHOD ||
    !digest(compiled.sourceDigest) ||
    compiled.report.manifest?.sourceDigest !== compiled.sourceDigest
  )
    issue(
      "preview",
      "Freeze requires an exact current Preview proof, not a Prepare-only result.",
    );
  if (
    !opaque(id) ||
    !opaque(org) ||
    !opaque(user) ||
    !plain(member) ||
    (member.userId && member.userId !== user) ||
    !Number.isSafeInteger(member.revision) ||
    member.revision < 1 ||
    !instant(createdAt) ||
    !plain(command) ||
    Object.keys(command).some(
      (k) => !["keyHash", "previewId", "reviewHash"].includes(k),
    ) ||
    !digest(command.keyHash) ||
    !digest(command.reviewHash) ||
    !opaque(command.previewId)
  )
    issue(
      "command",
      "Finalization requires server-owned identity, time, membership and exact reviewed command metadata.",
    );
  const p = access("reporting", member);
  if (
    !p.read ||
    !p.write ||
    !p.export ||
    !scope(compiled.report.agreement?.programId, member)
  )
    unavailable();
  for (const module of compiled.report.modules || [])
    for (const r of module.records || []) {
      const a = access(r.moduleId, member),
        anchor = r.moduleId === "programs" ? r.id : r.data?.programId;
      if (
        r.orgId !== org ||
        anchor !== compiled.report.agreement.programId ||
        !a.read ||
        !a.export ||
        !scope(anchor, member)
      )
        unavailable();
      approval(r);
    }
  const report = copy(compiled.report);
  const board = { ...report.boardProjection, id, orgId: org, createdAt };
  board.checksum = hash(board);
  report.boardProjection = board;
  Object.assign(report, {
    id,
    orgId: org,
    createdBy: user,
    createdAt,
    authorization: {
      role: member.role,
      programIds: [...(member.programIds || [])].sort(),
      membershipRevision: member.revision,
    },
    command: {
      actorId: user,
      keyHash: command.keyHash,
      previewId: command.previewId,
      reviewHash: command.reviewHash,
    },
  });
  report.checksum = hash(report);
  bounded(report);
  return report;
}
