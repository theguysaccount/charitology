import {
  programWorkspaces,
  emptyWorkspace,
  defaults,
  parseWorkspace,
} from "./partner-programs";
import type { ProgramState } from "./program-workspaces";
import type { ProgramField } from "../../data/partner-types";
import {
  websitePilotMaterials,
  WEBSITE_PILOT_VERSION,
} from "../../data/website-pilots.mjs";
import {
  parseRemainingRecordBackup,
  remainingRecordBackup,
} from "./remaining-record-recovery-formats";
import {
  validateRemainingRecordValue,
  type RRReadonly,
} from "./remaining-record-recovery-schemas";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const WEBSITE_PILOT_KEY =
  "charitology.partner-workspace-v1.nonprofit-advisory" as const;
export const WEBSITE_PILOT_LIMITS = Object.freeze({
  nativeBytes: 8_000_000,
  briefBytes: 1_000_000,
  readTimeoutMs: 30_000,
});
const config = programWorkspaces["nonprofit-advisory"];
export type WebsitePilotState = RRReadonly<ProgramState>;
export const PILOT_ROWS = Object.freeze({
  task: ["diagnostics", "website-pilot-task"],
  observation: ["evidence", "website-pilot-observation"],
  change: ["actions", "website-pilot-change"],
  publication: ["readiness", "website-pilot-publication"],
  recurring: ["readiness", "website-pilot-recurring-updates"],
  os: ["readiness", "website-pilot-os-choice"],
  osRecurring: ["readiness", "website-pilot-os-updates"],
  publicCase: ["readiness", "website-pilot-public-case"],
  review: ["learning", "website-pilot-review"],
  osReview: ["learning", "website-pilot-os-review"],
} as const);
type RowName = keyof typeof PILOT_ROWS;
type Pointer = { context: string } | { row: RowName; field: string };
export type WebsitePilotField = Readonly<{
  id: string;
  group: string;
  label: string;
  hint?: string;
  pointer: Pointer;
  native: ProgramField;
  maxLength: number;
}>;
const field = (
  id: string,
  group: string,
  label: string,
  pointer: Pointer,
  hint?: string,
): WebsitePilotField => {
  const fields =
    "context" in pointer
      ? config.context
      : config.collections.find((c) => c.key === PILOT_ROWS[pointer.row][0])!
          .fields;
  const native = fields.find(
    (f) => f.key === ("context" in pointer ? pointer.context : pointer.field),
  );
  if (!native)
    throw Error(
      "Website pilot field does not match the existing native producer",
    );
  return Object.freeze({
    id,
    group,
    label,
    hint,
    pointer: Object.freeze(pointer),
    native,
    maxLength: native.kind === "textarea" ? 5000 : 500,
  });
};
export const websitePilotGroups = Object.freeze(
  [
    {
      id: "task",
      title: "1. Choose one visitor task",
      intro:
        "Use a project alias and public information. Blank context stays unknown.",
    },
    {
      id: "observation",
      title: "2. Record the current website",
      intro:
        "Describe a task you actually inspected. A hypothesis is separate from an observation.",
    },
    {
      id: "concept",
      title: "3. Describe the private concept",
      intro:
        "Keep donations, applications and personal records on the charity’s existing authorized routes.",
    },
    {
      id: "permission",
      title: "4. Keep decisions separate",
      intro:
        "These are your notes about outside decisions. A local status supplies no permission, subscription or approval.",
    },
    {
      id: "review",
      title: "5. Review what happened",
      intro:
        "Record criticism, missing evidence and reasons to keep the current tool as well as favorable findings.",
    },
    {
      id: "os",
      title: "6. Optional OS trial notes",
      intro:
        "Leave this separate task unknown if no OS trial was agreed. Website observations do not become OS results.",
    },
  ].map(Object.freeze),
);
export const websitePilotFields: readonly WebsitePilotField[] = Object.freeze([
  field("alias", "task", "Case alias", { context: "name" }),
  field("visitor", "task", "One visitor task", { context: "activity" }),
  field("question", "task", "Question the website decision should answer", {
    context: "decision",
  }),
  field("current", "task", "Current method that must be preserved", {
    context: "baseline",
  }),
  field(
    "website",
    "observation",
    "Official public website URL · optional",
    { row: "observation", field: "source" },
    "HTTPS only. Do not include private links or credentials. No page is fetched.",
  ),
  field(
    "checked",
    "observation",
    "Date actually inspected · optional",
    { row: "observation", field: "checked" },
    "YYYY-MM-DD. Leave unknown dates blank.",
  ),
  field(
    "finding",
    "observation",
    "What you actually observed, or what remains unknown",
    { row: "observation", field: "finding" },
  ),
  field("evidence", "observation", "Basis for the observation", {
    row: "observation",
    field: "evidence",
  }),
  field(
    "limits",
    "observation",
    "Access limits, missing measures and rival explanations",
    { row: "observation", field: "limits" },
  ),
  field("change", "concept", "Proposed change and why it might help", {
    context: "change",
  }),
  field("steps", "concept", "Exact changes proposed", {
    row: "change",
    field: "steps",
  }),
  field(
    "version",
    "concept",
    "Private preview version, file/hash or reference",
    { row: "change", field: "complete" },
    "A reference is not evidence that a reviewer approved it. No preview is opened or hosted here.",
  ),
  field("owner", "concept", "Responsible role", {
    row: "change",
    field: "owner",
  }),
  field("capacity", "concept", "Time budget, support and work displaced", {
    context: "capacity",
  }),
  field("voice", "concept", "How people can disagree accessibly", {
    context: "voice",
  }),
  field("privacy", "concept", "Data boundary, retention and stop route", {
    context: "privacy",
  }),
  field("period", "concept", "Proposed period and next checkpoint", {
    context: "period",
  }),
  field(
    "publicationRole",
    "permission",
    "Website publication decision-maker role · optional",
    { row: "publication", field: "owner" },
  ),
  field(
    "publication",
    "permission",
    "Website publication decision, exact version and evidence/reference",
    { row: "publication", field: "notes" },
    "State unknown, withheld or the actual separately obtained decision. Keep private contacts out.",
  ),
  field("publicationStatus", "permission", "Publication evidence record", {
    row: "publication",
    field: "status",
  }),
  field(
    "recurring",
    "permission",
    "Separate recurring-update purpose, cadence, stop route and permission",
    { row: "recurring", field: "notes" },
  ),
  field(
    "casePermission",
    "permission",
    "Separate permission for a public name, quotation, logo or case study",
    { row: "publicCase", field: "notes" },
  ),
  field(
    "outcome",
    "review",
    "Task completion condition, unit and observation window",
    { row: "review", field: "outcome" },
  ),
  field("method", "review", "Comparison method and its limits", {
    row: "review",
    field: "method",
  }),
  field(
    "feedback",
    "review",
    "Aggregate feedback, disagreements and whose view is missing",
    { row: "review", field: "feedback" },
  ),
  field(
    "result",
    "review",
    "What is known now · negative or unknown findings are valid",
    { row: "review", field: "result" },
  ),
  field(
    "decision",
    "review",
    "Continue, revise, pause, stop or keep the current tool — and why",
    { row: "review", field: "rule" },
  ),
  field("reviewDate", "review", "Actual or next review date · optional", {
    row: "review",
    field: "date",
  }),
  field(
    "osChoice",
    "os",
    "Separate OS participation decision and allowed scope",
    { row: "os", field: "notes" },
    "Declining an OS trial does not change an agreed website contribution.",
  ),
  field("osRole", "os", "Separate authorized OS owner role · optional", {
    row: "os",
    field: "owner",
  }),
  field(
    "osRecurring",
    "os",
    "Separate OS recurring-update purpose, cadence, stop route and permission",
    { row: "osRecurring", field: "notes" },
  ),
  field(
    "osTask",
    "os",
    "One separate OS workflow · leave unknown if not chosen",
    { row: "osReview", field: "title" },
  ),
  field(
    "osOutcome",
    "os",
    "OS task completion condition and observation window",
    { row: "osReview", field: "outcome" },
  ),
  field(
    "osMethod",
    "os",
    "OS hypothesis, baseline, setup/help time, comparison and limits",
    { row: "osReview", field: "method" },
  ),
  field(
    "osFeedback",
    "os",
    "OS feedback, difficulties and missing perspectives",
    { row: "osReview", field: "feedback" },
  ),
  field(
    "osResult",
    "os",
    "OS observations, export/recovery actually tried or unknown",
    { row: "osReview", field: "result" },
  ),
  field("osDecision", "os", "OS next decision and cleanup/access plan", {
    row: "osReview",
    field: "rule",
  }),
  field("osDate", "os", "OS review date · optional", {
    row: "osReview",
    field: "date",
  }),
]);
export type WebsitePilotRaw = Readonly<Record<string, string>>;
export function websitePilotHash(raw: string | Uint8Array): string {
  return bytesToHex(
    sha256(typeof raw === "string" ? new TextEncoder().encode(raw) : raw),
  );
}
function row(state: WebsitePilotState, name: RowName) {
  const [collection, id] = PILOT_ROWS[name];
  const found = state.records[collection].find((r) => r.id === id);
  if (!found)
    throw Error(
      "This native file does not contain this guide’s named case records. Open it in the general Nonprofit Advisory desk. Your current writing has not changed.",
    );
  return found;
}
function admit(input: unknown): WebsitePilotState {
  const owned = validateRemainingRecordValue(WEBSITE_PILOT_KEY, input);
  // Use the unchanged producer for semantic admission, without adopting its
  // whitespace-normalized copy. Native recovery preserves accepted raw text.
  parseWorkspace(owned, config);
  for (const name of Object.keys(PILOT_ROWS) as RowName[]) row(owned, name);
  return owned;
}
export function blankWebsitePilot(): WebsitePilotState {
  const state = emptyWorkspace(config);
  const make = (
    name: RowName,
    title: string,
    overrides: Record<string, string> = {},
  ) => {
    const [collection, id] = PILOT_ROWS[name],
      spec = config.collections.find((c) => c.key === collection)!;
    const values = defaults(spec.fields);
    for (const f of spec.fields)
      if (!f.optional && !values[f.key])
        values[f.key] = "Unknown — not recorded.";
    Object.assign(values, { title, ...overrides });
    state.records[collection].push({ id, values });
  };
  make("task", "One website visitor task", {
    area: "Voice and access",
    depth: "Unclassified",
    status: "Needs evidence",
  });
  make("observation", "Website task observation", {
    type: "Output description",
    evidence: "Hypothesis",
  });
  make("change", "Proposed private website change", { status: "To do" });
  make("publication", "Separate website publication decision", {
    status: "Not established",
  });
  make("recurring", "Separate recurring-update permission", {
    status: "Not established",
  });
  make("os", "Separate optional OS trial decision", {
    status: "Not established",
  });
  make("osRecurring", "Separate OS recurring-update permission", {
    status: "Not established",
  });
  make("publicCase", "Separate public case-study permission", {
    status: "Not established",
  });
  make("review", "Review one website visitor task", {
    result: "Unknown — no use, pilot or adoption is recorded.",
    status: "Draft",
  });
  make("osReview", "Unknown — no separate OS workflow chosen", {
    result: "Unknown — no OS trial is recorded.",
    status: "Draft",
  });
  return admit(state);
}
export function websitePilotValues(state: WebsitePilotState): WebsitePilotRaw {
  const valid = admit(state);
  return Object.freeze(
    Object.fromEntries(
      websitePilotFields.map((f) => [
        f.id,
        "context" in f.pointer
          ? valid.context[f.pointer.context]
          : row(valid, f.pointer.row).values[f.pointer.field],
      ]),
    ),
  );
}
export function applyWebsitePilotFields(
  state: WebsitePilotState,
  raw: WebsitePilotRaw,
  at: string,
  observed?: WebsitePilotRaw,
): WebsitePilotState {
  const owned = admit(state),
    fields = Object.keys(raw);
  if (
    fields.length !== websitePilotFields.length ||
    fields.some((id) => !websitePilotFields.some((f) => f.id === id))
  )
    throw Error("Use the current complete guide fields.");
  const baseline = observed ?? websitePilotValues(owned);
  if (
    Object.keys(baseline).length !== websitePilotFields.length ||
    websitePilotFields.some((f) => typeof baseline[f.id] !== "string")
  )
    throw Error("Use the complete observed field baseline.");
  const next = structuredClone(owned) as ProgramState;
  for (const f of websitePilotFields) {
    const value = raw[f.id];
    if (typeof value !== "string" || value.length > f.maxLength)
      throw Error(
        `${f.label}: keep the field within ${f.maxLength} characters.`,
      );
    if (value === baseline[f.id]) continue;
    if ("context" in f.pointer) next.context[f.pointer.context] = value;
    else
      (row(next, f.pointer.row).values as Record<string, string>)[
        f.pointer.field
      ] = value;
  }
  if (JSON.stringify(next) !== JSON.stringify(owned)) next.updated = at;
  return admit(next);
}
export function restoreWebsitePilot(
  raw: string | Uint8Array,
): WebsitePilotState {
  return admit(parseRemainingRecordBackup(raw, WEBSITE_PILOT_KEY));
}
export function websitePilotNative(state: WebsitePilotState): string {
  return remainingRecordBackup(WEBSITE_PILOT_KEY, admit(state));
}
export function websitePilotCounts(state: WebsitePilotState) {
  const valid = admit(state),
    total = Object.values(valid.records).reduce(
      (n, rows) => n + rows.length,
      0,
    );
  return Object.freeze({
    records: total,
    caseRecords: Object.keys(PILOT_ROWS).length,
    otherRecords: total - Object.keys(PILOT_ROWS).length,
  });
}
const unknown = (s: string) => (s.trim() ? s : "Unknown — not recorded.");
function safeMarkdown(s: string) {
  // Treat every recorded value as literal quoted text, never executable HTML,
  // a new document heading or an injected Markdown link/permission checkbox.
  return unknown(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, "\\$&")
    .split(/\r\n?|\n/)
    .map((v) => "> " + v)
    .join("\n");
}
export function websitePilotBriefs(
  state: WebsitePilotState,
): Readonly<Record<"website-preview-brief" | "os-pilot-brief", string>> {
  const v = websitePilotValues(state),
    notCollected = "Unknown — not separately collected by this guide.";
  const website: Record<string, string> = {
    "Organization/public website:":
      "Case alias: " + unknown(v.alias) + "\nPublic URL: " + unknown(v.website),
    "Visitor task:": v.visitor,
    "Charity contact/decision-maker role:":
      "Recorded role (authority unverified): " + unknown(v.publicationRole),
    "Current method that must be preserved:": v.current,
    "Observation and source:":
      unknown(v.finding) +
      "\nSource: " +
      unknown(v.website) +
      "\nActually inspected: " +
      unknown(v.checked) +
      "\nBasis: " +
      unknown(v.evidence),
    "Proposed change:":
      unknown(v.change) + "\nRecorded steps: " + unknown(v.steps),
    "Why it might help:":
      "Hypothesis — recorded proposal, not a measured benefit: " +
      unknown(v.change),
    "Version/source identity:": v.version,
    "Exact preview reviewed:": notCollected,
    "Known limitations:": v.limits,
    "Charity authority to approve:":
      "Recorded role only; authority remains unverified: " +
      unknown(v.publicationRole),
    "Approved exact version and changes:": notCollected,
    "Hosting/domain/editorial owner:": notCollected,
    "Donation/application route verification:": notCollected,
    "Accessibility/security/rights checks still needed:": v.limits,
    "Backup and rollback method:": notCollected,
    "Publication permission and evidence:":
      "Self-recorded decision note only: " + unknown(v.publication),
    "Recipient role or private consent-record reference and requested purpose:":
      v.recurring,
    "Approved channel/cadence:": notCollected,
    "Exact permission and evidence/reference:":
      "Self-recorded recurring-update note for its stated purpose only: " +
      unknown(v.recurring),
    "How a recipient can stop updates:": notCollected,
    "Website-only, OS-only or both:": v.osChoice,
    "Actual publication date:": notCollected,
    "What visitors or staff actually observed:": v.result,
    "What remains unmeasured:": v.limits,
    "Unexpected difficulties and next decision:":
      unknown(v.feedback) + "\nNext decision: " + unknown(v.decision),
  };
  const os: Record<string, string> = {
    "Organization/authorized owner role:":
      "Case alias: " +
      unknown(v.alias) +
      "\nRecorded OS role (authority unverified): " +
      unknown(v.osRole),
    "Workflow:": v.osTask,
    "Specific question:": notCollected,
    "Hypothesis to test:": notCollected,
    "Current process that works and must be preserved:": notCollected,
    "Agreed dates and time budget:": notCollected,
    "Baseline observation:": notCollected,
    "Baseline task/version:": notCollected,
    "Proposed comparison and its limits:": v.osMethod,
    "Issue and reproduction with fictional data:": notCollected,
    "Proposed change/version:": notCollected,
    "Decision-maker and next check:":
      "Recorded role: " +
      unknown(v.osRole) +
      "\nRecorded participation decision: " +
      unknown(v.osChoice) +
      "\nReview date: " +
      unknown(v.osDate),
    "What changed:": notCollected,
    "What still failed or felt unnecessary:": v.osFeedback,
    "Whose perspective is missing:": v.osFeedback,
    "Evidence supporting the next decision:":
      "Self-recorded OS observation note (unverified): " + unknown(v.osResult),
    "Decision:": v.osDecision,
    "Export/cleanup owner and confirmation:": notCollected,
    "Access that should end:": notCollected,
    "Private notes retention decision:":
      "Case-level recorded boundary; separate OS agreement remains necessary: " +
      unknown(v.privacy),
    "Any requested recurring update recipient role or private consent-record reference/channel/cadence/evidence:":
      v.osRecurring,
    "Separate permission for name, quote, logo or public case study:":
      "Recorded permission note for its stated scope only: " +
      unknown(v.casePermission),
  };
  const native = websitePilotNative(state),
    hash = websitePilotHash(native);
  const out = {} as Record<"website-preview-brief" | "os-pilot-brief", string>;
  for (const material of websitePilotMaterials) {
    const data = material.id === "website-preview-brief" ? website : os;
    const body = material.body
      .split("\n")
      .map((line) => {
        const prefix = Object.keys(data).find((k) => line.startsWith(k));
        return prefix
          ? prefix + "\n\n" + safeMarkdown(data[prefix]) + "\n"
          : line;
      })
      .join("\n");
    const noteIds =
      material.id === "website-preview-brief"
        ? [
            "question",
            "capacity",
            "voice",
            "privacy",
            "period",
            "outcome",
            "method",
            "reviewDate",
            "publicationStatus",
          ]
        : ["osChoice", "osOutcome", "osMethod", "osDate"];
    const notes = noteIds
      .map((id) => {
        const f = websitePilotFields.find((f) => f.id === id)!;
        return "### " + f.label + "\n\n" + safeMarkdown(v[id]);
      })
      .join("\n\n");
    out[material.id] =
      body +
      "\n## Additional recorded working notes\n\n" +
      notes +
      "\n\n## Recorded case scope\n\nComplete Nonprofit Advisory v1 case file: " +
      new TextEncoder().encode(native).length +
      " bytes.\n\nSHA-256: " +
      hash +
      "\n\nThis identifies the case file, not the website preview or any approval. Template " +
      WEBSITE_PILOT_VERSION +
      ". These are self-recorded notes, not verified approvals, consent, adoption or causal findings. Uncollected facts and observation-table measures remain explicitly unknown; narrative notes do not populate them automatically. This brief includes this guide’s selected case fields; the complete native JSON includes every restored record. No publication, message, account or OS write is performed.\n";
    if (
      new TextEncoder().encode(out[material.id]).length >
      WEBSITE_PILOT_LIMITS.briefBytes
    )
      throw Error(
        "The complete brief exceeds its limit. Your writing remains available.",
      );
  }
  return Object.freeze(out);
}
