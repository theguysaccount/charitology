import {
  programWorkspaces,
  type ProgramCollection,
  type ProgramField,
  type ProgramWorkspace,
} from "../../data/program-workspaces";
import { mdBlock, mdInline, mdTable, localDay } from "./markdown";
export type ProgramRecord = { id: string; values: Record<string, string> };
export type ProgramState = {
  version: 1;
  program: string;
  updated: string;
  context: Record<string, string>;
  records: Record<string, ProgramRecord[]>;
};
export type ProgramMetric = { label: string; value: string };
export const workspaceKey = (id: string) => `program-workspace-v1.${id}`;
export const recordId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function validProgramDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}
export const defaults = (fields: ProgramField[]) =>
  Object.fromEntries(fields.map((field) => [field.key, field.value ?? ""]));
export function emptyWorkspace(config: ProgramWorkspace): ProgramState {
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
    throw new Error("A set of fields is missing. Nothing was imported.");
  const next: Record<string, string> = {};
  for (const field of fields) {
    const raw = (value as Record<string, unknown>)[field.key];
    if (
      typeof raw !== "string" ||
      raw.length > (field.kind === "textarea" ? 5000 : 500)
    )
      throw new Error(`${field.label}: choose text within the field limit.`);
    const v = raw.trim();
    if (!v) {
      if (field.kind === "number" || (!draft && !field.optional))
        throw new Error(
          `${field.label} is required; missing numbers are not treated as zero.`,
        );
      next[field.key] = "";
      continue;
    }
    if (field.kind === "number") {
      const n = Number(v);
      if (
        !Number.isFinite(n) ||
        n < (field.min ?? 0) ||
        n > (field.max ?? 1e12)
      )
        throw new Error(
          `${field.label}: enter a number from ${field.min ?? 0} to ${field.max ?? 1e12}.`,
        );
      if (["employees", "years"].includes(field.key) && !Number.isInteger(n))
        throw new Error(`${field.label} must be a whole number.`);
      if (field.key === "years" && n < 1)
        throw new Error("The time horizon must be at least one year.");
    }
    if (field.kind === "date" && !validProgramDate(v))
      throw new Error(`${field.label}: enter a real calendar date.`);
    if (field.kind === "select" && !field.options?.includes(v))
      throw new Error(`${field.label}: choose an available option.`);
    if (field.kind === "url") {
      try {
        const u = new URL(v);
        if (
          !["https:", "http:"].includes(u.protocol) ||
          !u.hostname ||
          u.username ||
          u.password
        )
          throw new Error();
      } catch {
        throw new Error(
          `${field.label}: use a public http or https URL without a password.`,
        );
      }
    }
    next[field.key] = v;
  }
  if ("annualLow" in next && Number(next.annualHigh) < Number(next.annualLow))
    throw new Error(
      "The high benefit scenario must be at least the low scenario.",
    );
  return next;
}
export function parseWorkspace(
  value: unknown,
  config: ProgramWorkspace,
): ProgramState {
  const raw = value as ProgramState;
  if (
    !raw ||
    raw.version !== 1 ||
    raw.program !== config.id ||
    typeof raw.updated !== "string" ||
    (raw.updated && !Number.isFinite(Date.parse(raw.updated)))
  )
    throw new Error(
      `Choose a version 1 ${config.title.toLowerCase()} JSON export.`,
    );
  const context = validValues(raw.context, config.context, true);
  if (
    !raw.records ||
    typeof raw.records !== "object" ||
    Array.isArray(raw.records)
  )
    throw new Error("The records are missing.");
  const seen = new Set<string>();
  let total = 0;
  const records: ProgramState["records"] = {};
  for (const c of config.collections) {
    const rows = raw.records[c.key];
    if (!Array.isArray(rows) || rows.length > 250)
      throw new Error(
        `The ${c.label.toLowerCase()} list is invalid or exceeds 250 records.`,
      );
    records[c.key] = rows.map((r) => {
      if (
        !r ||
        typeof r.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id) ||
        seen.has(r.id)
      )
        throw new Error("Record identifiers must be present and unique.");
      seen.add(r.id);
      total++;
      return { id: r.id, values: validValues(r.values, c.fields) };
    });
  }
  if (total > 500)
    throw new Error(
      "This workspace supports at most 500 records. Split larger research projects into separate exports.",
    );
  return {
    version: 1,
    program: config.id,
    updated: raw.updated,
    context,
    records,
  };
}
const sampleContexts: Record<string, Record<string, string>> = {
  "university-chapters": {
    name: "Example chapter — fictional",
    institution: "Example University",
    purpose:
      "A welcoming place to study how generosity works, open to students across subjects and moral views.",
    access:
      "Choose an accessible room, offer written contributions and permit disagreement without personal judgments.",
    governance:
      "Decide by discussion and record dissent; rotate session facilitators with consent.",
    term: "Illustrative six-session term",
    meeting: "Location to be confirmed",
  },
  "local-charitology": {
    name: "Example district needs notebook — fictional",
    place: "A hypothetical district, boundaries to be defined",
    population: "Residents and informal groups in the defined area",
    question: "Which transport needs and activities should we investigate?",
    method:
      "Define sources, record search dates and invite overlooked perspectives; no fieldwork has happened.",
    limits:
      "Fictional demonstration only; no real local findings or coverage claims.",
    date: localDay(),
  },
  "time-charitology": {
    name: "Example volunteer week — fictional",
    available: "4",
    skills: "Spreadsheets, writing",
    wage: "0",
    currency: "Example currency units",
    access:
      "No evenings; confirm remote access and staff support before committing.",
  },
  "corporate-program": {
    name: "Example workplace match — fictional",
    employees: "100",
    currency: "Example currency units",
    period: "One hypothetical year",
    eligibility:
      "Draft: equal access for eligible employees; recipient rules and appeals need review.",
    flexibility:
      "Draft: general-support gifts eligible on equal terms; multi-year commitments need an approved budget.",
    privacy:
      "Participation is voluntary. Do not publish individual giving choices; set retention and access rules before launch.",
    learning:
      "Separate gifts from outcomes. Invite employee and recipient feedback, including unwanted effects.",
  },
  "policy-program": {
    name: "Example policy options brief — fictional",
    jurisdiction: "Hypothetical public body",
    question:
      "How should a hypothetical prevention activity be compared with the status quo?",
    baseline:
      "No new activity. Specify existing services and trends before using a real analysis.",
    years: "10",
    discount: "3",
    currency: "Example constant-price currency units",
    uncertainty:
      "No empirical data supplied. Participation, implementation and distributional effects are unknown.",
  },
};
export function sampleWorkspace(config: ProgramWorkspace): ProgramState {
  const next = emptyWorkspace(config);
  next.context = { ...next.context, ...sampleContexts[config.id] };
  next.records = Object.fromEntries(
    config.collections.map((c) => [
      c.key,
      c.sample.map((s) => ({
        id: recordId(),
        values: { ...defaults(c.fields), ...s },
      })),
    ]),
  );
  next.updated = new Date().toISOString();
  return parseWorkspace(next, config);
}
export const numberText = (n: number, digits = 2) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(
        n,
      )
    : "Outside supported range";
const n = (value: string | undefined) => Number(value || 0);
export function matchScenario(employees: number, v: Record<string, string>) {
  const participants = Math.floor((employees * n(v.participation)) / 100);
  const employeeGifts = participants * n(v.gift);
  const matchPerPerson = Math.min(n(v.gift) * n(v.ratio), n(v.cap));
  const match = participants * matchPerPerson;
  const employerTotal = match + n(v.admin);
  const shortfall = Math.max(0, employerTotal - n(v.budget));
  const headroom = Math.max(0, n(v.budget) - employerTotal);
  return {
    participants,
    employeeGifts,
    matchPerPerson,
    match,
    employerTotal,
    shortfall,
    headroom,
  };
}
export function volunteerTotals(v: Record<string, string>, wage = 0) {
  const commitment = n(v.hours) + n(v.travel) + n(v.prep);
  return {
    commitment,
    service: n(v.hours),
    staff: n(v.staff),
    cost: n(v.cost),
    personalCost: commitment * wage + n(v.cost),
  };
}
export function policyScenario(
  years: number,
  ratePercent: number,
  v: Record<string, string>,
) {
  let factor = 0;
  for (let y = 1; y <= years; y++) factor += 1 / (1 + ratePercent / 100) ** y;
  const costs = n(v.upfront) + n(v.annualCost) * factor;
  return {
    factor,
    costs,
    lowBenefits: n(v.annualLow) * factor,
    highBenefits: n(v.annualHigh) * factor,
    lowNet: (n(v.annualLow) - n(v.annualCost)) * factor - n(v.upfront),
    highNet: (n(v.annualHigh) - n(v.annualCost)) * factor - n(v.upfront),
  };
}
export function recordAnalysis(
  config: ProgramWorkspace,
  state: ProgramState,
  collection: string,
  v: Record<string, string>,
): string[] {
  if (config.id === "corporate-program" && collection === "scenarios") {
    const r = matchScenario(n(state.context.employees), v);
    const low = matchScenario(n(state.context.employees), {
      ...v,
      participation: String(Math.max(0, n(v.participation) - 10)),
    });
    const high = matchScenario(n(state.context.employees), {
      ...v,
      participation: String(Math.min(100, n(v.participation) + 10)),
    });
    return [
      `Modeled participants: ${r.participants}; employee gifts: ${numberText(r.employeeGifts)}; employer match: ${numberText(r.match)}.`,
      `Employer cost including administration: ${numberText(r.employerTotal)} ${state.context.currency || "units"}. ${r.shortfall ? `Budget shortfall: ${numberText(r.shortfall)}. No allocation or proration is assumed.` : `Budget headroom: ${numberText(r.headroom)}.`}`,
      `Participation sensitivity, −10/+10 percentage points (bounded at 0–100%): employer cost ${numberText(low.employerTotal)} / ${numberText(high.employerTotal)}. Equal gifts assumed; per-person cap applies before aggregation.`,
    ];
  }
  if (config.id === "time-charitology" && collection === "roles") {
    const t = volunteerTotals(v, n(state.context.wage));
    const offered = state.context.skills
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const required = v.skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const unconfirmed = required.filter(
      (s) => !offered.includes(s.toLowerCase()),
    );
    return [
      `Weekly commitment: ${numberText(t.commitment)} hours (${numberText(t.service)} direct service). Staff support estimate: ${numberText(t.staff)} hours, counted separately.`,
      `Out-of-pocket cost: ${numberText(t.cost)} ${state.context.currency || "units"}.${n(state.context.wage) ? ` Hypothetical personal cost: ${numberText(t.personalCost)} (not social value).` : ""}`,
      `Skills requiring a conversation: ${unconfirmed.length ? unconfirmed.join(", ") : required.length ? "none from an exact text match; this does not verify competence" : "requirements not entered"}. ${v.confirmed}.`,
    ];
  }
  if (config.id === "policy-program" && collection === "options") {
    const r = policyScenario(
      n(state.context.years),
      n(state.context.discount),
      v,
    );
    return [
      `Present-value costs: ${numberText(r.costs)} ${state.context.currency || "units"}. Benefit scenarios: ${numberText(r.lowBenefits)} to ${numberText(r.highBenefits)}.`,
      `Net present-value scenarios: ${numberText(r.lowNet)} to ${numberText(r.highNet)} over ${state.context.years} years at ${state.context.discount}% per year. This is an input range, not a confidence interval.`,
      "Unpriced effects, implementation risks, evidence and distribution remain separate; these totals do not select an option.",
    ];
  }
  return [];
}
export function workspaceSummary(
  config: ProgramWorkspace,
  state: ProgramState,
): { metrics: ProgramMetric[]; notes: string[] } {
  const rows = state.records;
  if (config.id === "university-chapters") {
    const tasks = rows.tasks;
    return {
      metrics: [
        { label: "Sessions planned", value: String(rows.sessions.length) },
        {
          label: "Sessions dated",
          value: String(rows.sessions.filter((r) => r.values.date).length),
        },
        {
          label: "Tasks complete",
          value: `${tasks.filter((r) => r.values.status === "Done").length} / ${tasks.length}`,
        },
      ],
      notes: [
        "Export the kit for agendas, a draft constitution, invitation and handover. Institutional recognition and any public launch are separate steps.",
      ],
    };
  }
  if (config.id === "local-charitology") {
    const depths = new Map<string, number>();
    rows.activities.forEach((r) =>
      depths.set(r.values.depth, (depths.get(r.values.depth) ?? 0) + 1),
    );
    return {
      metrics: [
        { label: "Needs recorded", value: String(rows.needs.length) },
        { label: "Activities sourced", value: String(rows.activities.length) },
        {
          label: "Questions open",
          value: String(
            rows.questions.filter(
              (r) => !["Answered"].includes(r.values.status),
            ).length,
          ),
        },
      ],
      notes: [
        depths.size
          ? `Entered activity sample by tentative depth: ${[...depths].map(([d, count]) => `${d}: ${count}`).join("; ")}. Counts are not spending shares or quality scores.`
          : "No activity sample yet. Add a sourced public activity before interpreting coverage.",
        "A missing activity is a gap in this notebook, not proof that a community has no work at that depth.",
      ],
    };
  }
  if (config.id === "time-charitology") {
    const committed = rows.roles.filter((r) =>
      ["Planned", "Active"].includes(r.values.status),
    );
    const totals = committed.reduce(
      (t, r) => {
        const x = volunteerTotals(r.values, n(state.context.wage));
        return {
          commitment: t.commitment + x.commitment,
          service: t.service + x.service,
          staff: t.staff + x.staff,
          cost: t.cost + x.cost,
        };
      },
      { commitment: 0, service: 0, staff: 0, cost: 0 },
    );
    const remaining = n(state.context.available) - totals.commitment;
    const actual = rows.logs.reduce(
      (total, row) => total + n(row.values.hours) + n(row.values.travel),
      0,
    );
    return {
      metrics: [
        {
          label: "Committed hours / week",
          value: numberText(totals.commitment),
        },
        {
          label:
            remaining < 0 ? "Over capacity / week" : "Uncommitted hours / week",
          value: numberText(Math.abs(remaining)),
        },
        { label: "Actual hours logged (all dates)", value: numberText(actual) },
      ],
      notes: [
        `Planned/active roles: ${numberText(totals.service)} direct service hours and ${numberText(totals.staff)} staff support hours per week. Staff support is a separate burden, not subtracted to manufacture a net impact.`,
        `Out-of-pocket weekly cost: ${numberText(totals.cost)} ${state.context.currency || "units"}. ${remaining < 0 ? "Reduce commitments or revise capacity before agreeing a plan." : "Leave room for unexpected travel, training and access needs."}`,
        `${committed.filter((r) => r.values.confirmed !== "Role and support confirmed").length} committed role(s) still need role or support confirmation.`,
      ],
    };
  }
  if (config.id === "corporate-program")
    return {
      metrics: [
        {
          label: "Eligible employees",
          value: numberText(n(state.context.employees), 0),
        },
        { label: "Policy scenarios", value: String(rows.scenarios.length) },
        {
          label: "Scenarios over budget",
          value: String(
            rows.scenarios.filter(
              (r) =>
                matchScenario(n(state.context.employees), r.values).shortfall >
                0,
            ).length,
          ),
        },
      ],
      notes: [
        "Scenarios are alternatives, so their costs are never added together. Figures use the same unit you enter; decimal results are rounded for display only. Review individual gift distributions before relying on an average-gift model.",
      ],
    };
  return {
    metrics: [
      { label: "Policy options", value: String(rows.options.length) },
      { label: "Evidence claims", value: String(rows.evidence.length) },
      { label: "Equity perspectives", value: String(rows.equity.length) },
    ],
    notes: [
      `${state.context.years || "No"}-year horizon; ${state.context.discount || "0"}% annual discount rate. Monetary totals exclude unpriced outcomes.`,
      "Check that every option has evidence and equity discussion. These fields are deliberately not an automatic score or recommendation.",
    ],
  };
}
export function workspaceMarkdown(
  config: ProgramWorkspace,
  state: ProgramState,
): string {
  const summary = workspaceSummary(config, state);
  const sections = [
    `# ${mdInline(state.context.name || config.title)}`,
    `Draft generated ${localDay()}. ${config.limits}`,
    "## Scope and method",
    ...config.context.map(
      (f) =>
        `### ${mdInline(f.label)}\n\n${mdBlock(state.context[f.key]) || "Not entered."}`,
    ),
    "## Planning summary",
    mdTable(
      ["Measure", "Value"],
      summary.metrics.map((m) => [m.label, m.value]),
    ),
    ...summary.notes.map(mdBlock),
  ];
  for (const c of config.collections) {
    sections.push(`## ${c.label}`, c.description);
    if (!state.records[c.key].length)
      sections.push("No records entered. This remains a gap.");
    for (const r of state.records[c.key]) {
      sections.push(`### ${mdInline(r.values.title || c.singular)}`);
      for (const f of c.fields)
        if (f.key !== "title")
          sections.push(
            `**${mdInline(f.label)}**\n\n${mdBlock(r.values[f.key]) || "Not entered."}`,
          );
      sections.push(
        ...recordAnalysis(config, state, c.key, r.values).map(mdBlock),
      );
    }
  }
  sections.push(
    "## Working documents and review prompts",
    ...config.guide.map((g) => `### ${g.title}\n\n${g.text}`),
    "## Publication and review status\n\nPrepared locally by the person using the workspace. No source check, human review, partner approval, institutional recognition or public adoption is implied. Check facts, consent and confidential information before sharing.",
  );
  return sections.join("\n\n") + "\n";
}
export function workspaceCsv(
  config: ProgramWorkspace,
  state: ProgramState,
): string {
  const rows: string[][] = [
    ["section", "record_id", "field", "label", "value"],
  ];
  config.context.forEach((f) =>
    rows.push(["context", "", f.key, f.label, state.context[f.key]]),
  );
  config.collections.forEach((c) =>
    state.records[c.key].forEach((r) => {
      c.fields.forEach((f) =>
        rows.push([c.key, r.id, f.key, f.label, r.values[f.key]]),
      );
      recordAnalysis(config, state, c.key, r.values).forEach((line, i) =>
        rows.push([
          c.key,
          r.id,
          `calculation_${i + 1}`,
          "Calculated planning result",
          line,
        ]),
      );
    }),
  );
  const cell = (v: string) =>
    `"${(/^[\s]*[=+@-]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
export { programWorkspaces };
