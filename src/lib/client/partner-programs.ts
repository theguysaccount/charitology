import { programWorkspaces } from "../../data/partner-programs";
import type { PartnerWorkspace, ProgramField } from "../../data/partner-types";
import type { ProgramState } from "./program-workspaces";
import { validProgramDate, recordId, defaults } from "./program-workspaces";
import { mdBlock, mdInline, localDay } from "./markdown";
import { guardedDraft } from "./guarded-draft";
export { programWorkspaces, recordId, defaults };
export type { ProgramState };
export const workspaceKey = (id: string) => `partner-workspace-v1.${id}`;
export function partnerStorage(id: string) {
  const key = `charitology.${workspaceKey(id)}`;
  return { key, guard: guardedDraft(key) };
}
export const MAX_PARTNER_BACKUP_BYTES = 8_000_000;
export function partnerBackup(state: ProgramState): string {
  const backup = JSON.stringify(state, null, 2);
  if (
    new TextEncoder().encode(backup).length +
      Math.max(0, 24 - state.updated.length) >
    MAX_PARTNER_BACKUP_BYTES
  )
    throw Error(
      "Workspace exceeds the 8 MB backup limit. Export and split it before adding more content.",
    );
  return backup;
}
const withinCapacity = (state: ProgramState) => {
  partnerBackup(state);
  return state;
};
/** Undo belongs to one loaded storage version; failed writes remain unsaved work. */
export class PartnerSession {
  undo: ProgramState | undefined;
  unsavedInMemory = false;
  remember(state: ProgramState) {
    this.undo = structuredClone(state);
  }
  loaded() {
    this.undo = undefined;
    this.unsavedInMemory = false;
  }
  persisted() {
    this.unsavedInMemory = false;
  }
  failed() {
    this.unsavedInMemory = true;
  }
  needsDiscard(dirtyForms: number) {
    return dirtyForms > 0 || this.unsavedInMemory;
  }
}
export function emptyWorkspace(config: PartnerWorkspace): ProgramState {
  return {
    version: 1,
    program: config.id,
    updated: "",
    context: defaults(config.context),
    records: Object.fromEntries(config.collections.map((c) => [c.key, []])),
  };
}
export function validValues(
  value: unknown,
  fields: ProgramField[],
  draft = false,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("A set of fields is missing.");
  const next: Record<string, string> = {};
  for (const field of fields) {
    const raw = (value as Record<string, unknown>)[field.key];
    if (
      typeof raw !== "string" ||
      raw.length > (field.kind === "textarea" ? 5000 : 500)
    )
      throw Error(`${field.label}: use text within the stated limit.`);
    const v = raw.trim();
    if (!v) {
      if (!draft && !field.optional)
        throw Error(
          `${field.label} is required. Blank optional values stay unknown.`,
        );
      next[field.key] = "";
      continue;
    }
    if (field.kind === "number") {
      const n = Number(v),
        max = Math.min(field.max ?? 1e9, 1e9);
      if (!Number.isFinite(n) || n < (field.min ?? 0) || n > max)
        throw Error(
          `${field.label}: use a finite value between ${field.min ?? 0} and ${max}.`,
        );
      if (
        ["amount", "budget"].includes(field.key) &&
        !/^(?:\d+|\d*\.\d{1,2})$/.test(v)
      )
        throw Error(`${field.label}: use no more than two decimal places.`);
      if (field.key === "minutes" && !Number.isInteger(n))
        throw Error("Session duration must be a whole number of minutes.");
    }
    if (field.kind === "date" && !validProgramDate(v))
      throw Error(`${field.label}: use a real calendar date.`);
    if (field.kind === "select" && !field.options?.includes(v))
      throw Error(`${field.label}: choose an available option.`);
    if (field.kind === "url") {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" || !u.hostname || u.username || u.password)
          throw Error();
      } catch {
        throw Error(
          `${field.label}: use a public HTTPS URL without credentials.`,
        );
      }
    }
    if (field.key === "start" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
      throw Error("Use a UTC start time in HH:MM format.");
    next[field.key] = v;
  }
  return next;
}
export function parseWorkspace(
  value: unknown,
  config: PartnerWorkspace,
): ProgramState {
  const raw = value as ProgramState;
  if (
    !raw ||
    raw.version !== 1 ||
    raw.program !== config.id ||
    typeof raw.updated !== "string" ||
    raw.updated.length > 100 ||
    (raw.updated && !Number.isFinite(Date.parse(raw.updated)))
  )
    throw Error(`Choose a version 1 backup for ${config.title}.`);
  const context = validValues(raw.context, config.context, true);
  if (
    !raw.records ||
    typeof raw.records !== "object" ||
    Array.isArray(raw.records)
  )
    throw Error("Records are missing.");
  const seen = new Set<string>();
  let total = 0;
  const records: ProgramState["records"] = {};
  for (const c of config.collections) {
    const rows = raw.records[c.key];
    if (!Array.isArray(rows) || rows.length > 250)
      throw Error(`Invalid ${c.label} list; maximum 250 records.`);
    records[c.key] = rows.map((row) => {
      if (
        !row ||
        typeof row.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) ||
        seen.has(row.id)
      )
        throw Error("Record IDs must be present and unique.");
      seen.add(row.id);
      total++;
      return { id: row.id, values: validValues(row.values, c.fields) };
    });
  }
  if (total > 500) throw Error("This workspace supports at most 500 records.");
  return withinCapacity({
    version: 1,
    program: config.id,
    updated: raw.updated,
    context,
    records,
  });
}
export function sampleWorkspace(config: PartnerWorkspace): ProgramState {
  const state = emptyWorkspace(config);
  state.context = { ...state.context, ...config.sampleContext };
  state.records = Object.fromEntries(
    config.collections.map((c) => [
      c.key,
      c.sample.map((v) => ({
        id: recordId(),
        values: { ...defaults(c.fields), ...v },
      })),
    ]),
  );
  state.updated = new Date().toISOString();
  return parseWorkspace(state, config);
}
export function savePartnerRecord(
  state: ProgramState,
  config: PartnerWorkspace,
  key: string,
  raw: unknown,
  editing = "",
): ProgramState {
  const collection = config.collections.find((c) => c.key === key);
  if (!collection) throw Error("Unknown record collection.");
  const values = validValues(raw, collection.fields);
  const rows = state.records[key];
  if (editing && !rows.some((r) => r.id === editing))
    throw Error("That record was removed. Cancel and add it again.");
  if (
    !editing &&
    (rows.length >= 250 ||
      Object.values(state.records).reduce((n, r) => n + r.length, 0) >= 500)
  )
    throw Error("Record limit reached; export and split the project.");
  const record = { id: editing || recordId(), values };
  return withinCapacity({
    ...state,
    updated: new Date().toISOString(),
    records: {
      ...state.records,
      [key]: editing
        ? rows.map((r) => (r.id === editing ? record : r))
        : [...rows, record],
    },
  });
}
export function savePartnerContext(
  state: ProgramState,
  config: PartnerWorkspace,
  raw: unknown,
): ProgramState {
  return withinCapacity({
    ...state,
    updated: new Date().toISOString(),
    context: validValues(raw, config.context),
  });
}
export function deletePartnerRecord(
  state: ProgramState,
  key: string,
  id: string,
): ProgramState {
  if (!state.records[key]) throw Error("Unknown record collection.");
  return {
    ...state,
    records: {
      ...state.records,
      [key]: state.records[key].filter((r) => r.id !== id),
    },
  };
}
const number = (text: string | undefined): number | null =>
  text?.trim() && Number.isFinite(Number(text)) ? Number(text) : null;
const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export function planningAmounts(
  rows: { values: Record<string, string> }[],
  states?: string[],
) {
  const groups = new Map<
    string,
    { currency: string; cents: number; known: number; unknown: number }
  >();
  for (const { values: v } of rows) {
    if (states && !states.includes(v.status)) continue;
    const currency = v.currency?.trim() || "Unit not recorded";
    const unit = currency.toLowerCase();
    const group = groups.get(unit) ?? {
      currency,
      cents: 0,
      known: 0,
      unknown: 0,
    };
    const n = number(v.amount);
    if (n === null) group.unknown++;
    else {
      group.cents += Math.round(n * 100);
      group.known++;
    }
    groups.set(unit, group);
  }
  return [...groups.values()].map((v) => ({
    currency: v.currency,
    amount: v.cents / 100,
    known: v.known,
    unknown: v.unknown,
  }));
}
function sessionInterval(
  values: Record<string, string>,
): { start: number; end: number } | null {
  if (
    values.status === "Cancelled" ||
    !validProgramDate(values.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.start)
  )
    return null;
  const minutes = number(values.minutes);
  if (
    minutes === null ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 1440
  )
    return null;
  const start = Date.parse(`${values.date}T${values.start}:00Z`);
  return { start, end: start + minutes * 60000 };
}
export function scheduleConflicts(state: ProgramState) {
  const sessions = state.records.sessions ?? [];
  const conflicts: string[] = [];
  for (let a = 0; a < sessions.length; a++)
    for (let b = a + 1; b < sessions.length; b++) {
      const first = sessionInterval(sessions[a].values),
        second = sessionInterval(sessions[b].values);
      if (
        first &&
        second &&
        first.start < second.end &&
        second.start < first.end
      )
        conflicts.push(
          `${sessions[a].values.title} / ${sessions[b].values.title}`,
        );
    }
  return conflicts;
}
export function workspaceSummary(
  config: PartnerWorkspace,
  state: ProgramState,
) {
  const metrics = config.collections.map((c) => ({
    label: c.label,
    value: String(state.records[c.key].length),
  }));
  const notes = [
    "All counts describe this local notebook. No outside operation, funding, human review or approval is established.",
  ];
  if (config.id === "the-charitology-fund") {
    for (const g of planningAmounts(state.records.allocations, [
      "Conditional recommendation",
      "Locally recorded authorization",
    ]))
      notes.push(
        `Conditional allocation plans in ${g.currency}: ${fmt(g.amount)} from ${g.known} known amounts; ${g.unknown} amount(s) unknown. These are not payments or a cash balance.`,
      );
    const budget = number(state.context.budget);
    if (budget !== null && state.context.currency) {
      const allocations = planningAmounts(state.records.allocations, [
        "Conditional recommendation",
        "Locally recorded authorization",
      ]);
      const group = allocations.find(
        (g) =>
          g.currency.toLowerCase() ===
          state.context.currency.trim().toLowerCase(),
      );
      notes.push(
        `Hypothetical envelope ${fmt(budget)} ${state.context.currency}; known conditional plans ${fmt(group?.amount ?? 0)} in the same unit. ${group?.unknown ? "An unknown allocation prevents a complete envelope check." : "This comparison does not verify resources or authorize spending."}`,
      );
    } else
      notes.push(
        "Planning envelope unknown. A blank amount never represents available money.",
      );
    notes.push(
      "Proposal asks, allocation plans and ledger authorizations describe different stages; they are never added together.",
    );
  }
  if (config.id === "question-bounties") {
    for (const g of planningAmounts(state.records.pledges, [
      "Unverified conditional",
    ]))
      notes.push(
        `Unverified conditional pledge records: ${fmt(g.amount)} ${g.currency}, with ${g.unknown} unknown amount(s). None is money received or evidence of a funded prize.`,
      );
    notes.push(
      "Illustrative and withdrawn pledges are excluded. Claim review and proposed awards remain conditional human-process records.",
    );
  }
  if (config.id === "charity-incubator")
    notes.push(
      `${state.records.projects.filter((r) => r.values.status === "Existing partner search").length} project(s) in existing-partner search. A gap in this notebook is not evidence that no organization exists.`,
    );
  if (config.id === "charitology-fellowship")
    notes.push(
      "Projects and milestones are tracked by codes. There is no applicant score, automated selection, stipend offer or credential.",
    );
  if (config.id === "the-charitology-prize")
    notes.push(
      "Jury packets preserve reasons and dissent. No numerical winner score, organization rating or awarded prize is produced.",
    );
  if (config.id === "charitology-summit") {
    const complete = state.records.sessions.filter((r) =>
      sessionInterval(r.values),
    ).length;
    const conflicts = scheduleConflicts(state);
    notes.push(
      `${complete} session(s) have a complete noncancelled UTC planning slot; ${state.records.sessions.length - complete} are incomplete or cancelled. ${conflicts.length} overlapping pair(s). Calendar exports are tentative drafts only.`,
    );
    notes.push(...conflicts.map((c) => `Planning overlap: ${c}`));
  }
  notes.push(
    `${state.records.readiness.filter((r) => r.values.status === "Evidence recorded locally").length} readiness item(s) have local evidence notes. This is not outside verification.`,
  );
  return { metrics, notes };
}
export function recordAnalysis(
  config: PartnerWorkspace,
  state: ProgramState,
  collection: string,
  v: Record<string, string>,
): string[] {
  if (
    config.id === "the-charitology-fund" &&
    ["proposals", "allocations", "ledger"].includes(collection)
  )
    return [
      `Planning amount: ${number(v.amount) === null ? "Unknown" : fmt(Number(v.amount))} ${v.currency || "unit unknown"}. No cash or transfer is represented.`,
    ];
  if (
    config.id === "question-bounties" &&
    ["pledges", "decisions"].includes(collection)
  )
    return [
      `Conditional amount: ${number(v.amount) === null ? "Unknown" : fmt(Number(v.amount))} ${v.currency || "unit unknown"}. No funded award or enforceable pledge is established.`,
    ];
  if (config.id === "charitology-summit" && collection === "sessions") {
    const interval = sessionInterval(v);
    return [
      interval
        ? `Tentative UTC slot: ${new Date(interval.start).toISOString()} through ${new Date(interval.end).toISOString()}. Not an announced event.`
        : "Calendar export excludes this row until date, valid UTC start and positive duration are recorded, or while cancelled.",
    ];
  }
  return [];
}
export function workspaceMarkdown(
  config: PartnerWorkspace,
  state: ProgramState,
) {
  const summary = workspaceSummary(config, state);
  const out = [
    `# ${mdInline(state.context.name || config.title)}`,
    `Local planning draft, ${localDay()}. ${config.limits}`,
    "No source check, independent review, legal readiness, funding, appointment, participant consent or public operation is granted by this export.",
    "## Scope",
    ...config.context.map(
      (f) =>
        `### ${f.label}\n\n${mdBlock(state.context[f.key]) || "Unknown / not recorded."}`,
    ),
    "## Local record summary",
    ...summary.metrics.map((m) => `${m.label}: ${m.value}`),
    ...summary.notes,
  ];
  for (const c of config.collections) {
    out.push(`## ${c.label}`, c.description);
    if (!state.records[c.key].length)
      out.push("No records entered. This remains a gap.");
    for (const row of state.records[c.key]) {
      out.push(`### ${mdInline(row.values.title || c.singular)}`);
      for (const f of c.fields)
        if (f.key !== "title")
          out.push(
            `**${f.label}**\n\n${mdBlock(row.values[f.key]) || "Unknown / not recorded."}`,
          );
      out.push(...recordAnalysis(config, state, c.key, row.values));
    }
  }
  out.push(
    "## Operating guide",
    ...config.guide.flatMap((g) => [`### ${g.title}`, g.text]),
    "## Before sharing",
    "Read the complete packet, check sources and permissions, remove private information and seek the responsible people’s approval. Exporting does not publish it.",
  );
  return out.join("\n\n") + "\n";
}
export function workspaceCsv(config: PartnerWorkspace, state: ProgramState) {
  const rows = [["section", "record_id", "field", "label", "value"]];
  config.context.forEach((f) =>
    rows.push(["context", "", f.key, f.label, state.context[f.key]]),
  );
  config.collections.forEach((c) =>
    state.records[c.key].forEach((r) =>
      c.fields.forEach((f) =>
        rows.push([c.key, r.id, f.key, f.label, r.values[f.key]]),
      ),
    ),
  );
  const cell = (v: string) =>
    `"${(/^\s*[=+@-]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function fundTransparency(state: ProgramState) {
  const lines = [
    "# Fund transparency planning draft",
    "No legal fund, funding, grant award, payment or charity ranking is established. This selected-field export is for review before any public communication.",
    `## Public purpose\n\n${mdBlock(state.context.publicSummary) || "Unknown."}`,
  ];
  for (const key of ["allocations", "ledger"]) {
    lines.push(
      `## ${key === "allocations" ? "Conditional allocation plans" : "Nonpayment authorization records"}`,
    );
    for (const { values: v } of state.records[key])
      lines.push(
        `### ${mdInline(v.title)}`,
        `Reference: ${mdInline(v.proposal || v.allocation)}. Local state: ${mdInline(v.status)}.`,
        `${number(v.amount) === null ? "Amount unknown" : fmt(Number(v.amount))} ${mdInline(v.currency)}.`,
        mdBlock(v.rationale || v.notes),
        mdBlock(v.conditions || "No payment is represented."),
        v.source
          ? `Public source: ${mdInline(v.source)}`
          : "No public source recorded.",
      );
  }
  lines.push(
    "## Publication check",
    "Verify authority, sources, conflicts, privacy and every actual readiness condition before sharing. Internal conflict and intake records are excluded from this selected-field packet.",
  );
  return lines.join("\n\n") + "\n";
}
const escapeIcs = (v: string) =>
  v
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const foldIcs = (line: string) => {
  const parts: string[] = [];
  let chunk = "",
    bytes = 0;
  for (const char of line) {
    const n = new TextEncoder().encode(char).length;
    if (bytes + n > 73) {
      parts.push(chunk);
      chunk = " " + char;
      bytes = 1 + n;
    } else {
      chunk += char;
      bytes += n;
    }
  }
  parts.push(chunk);
  return parts.join("\r\n");
};
export function summitCalendar(state: ProgramState, at = new Date()) {
  const stamp = (n: number) =>
    new Date(n)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Charitology//Local summit planning draft//EN",
    "CALSCALE:GREGORIAN",
  ];
  let included = 0;
  for (const row of state.records.sessions ?? []) {
    const slot = sessionInterval(row.values);
    if (!slot) continue;
    included++;
    out.push(
      "BEGIN:VEVENT",
      `UID:${row.id}@local.charitology.org`,
      `DTSTAMP:${stamp(at.getTime())}`,
      `DTSTART:${stamp(slot.start)}`,
      `DTEND:${stamp(slot.end)}`,
      "STATUS:TENTATIVE",
      `SUMMARY:${escapeIcs("Planning draft: " + row.values.title)}`,
      `DESCRIPTION:${escapeIcs("Local planning draft only. No event, speaker or invitation is confirmed. " + row.values.question + "\nProposed output: " + row.values.output)}`,
      "END:VEVENT",
    );
  }
  out.push("END:VCALENDAR");
  return {
    text: out.map(foldIcs).join("\r\n") + "\r\n",
    included,
    excluded: (state.records.sessions?.length ?? 0) - included,
  };
}
