/** Pure, JSON-described domain contracts. Authentication, tenant lookup and persistence belong to the API. */
export const ROLES = Object.freeze([
  "owner",
  "admin",
  "program_lead",
  "grants_lead",
  "finance_reviewer",
  "contributor",
  "board_reader",
  "external_reviewer",
]);
export const CURRENCIES = Object.freeze({
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  JPY: 0,
  KWD: 3,
});
export const SCHEMA_VERSION = 1;
const staff = [
  "program_lead",
  "grants_lead",
  "finance_reviewer",
  "contributor",
];
const label = (value) =>
  value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const options = (values) =>
  values.map((value) =>
    typeof value === "string" ? { value, label: label(value) } : value,
  );
const field = (key, title, type, extra = {}) => ({
  key,
  label: title,
  type,
  nullable: true,
  ...extra,
});
const text = (key, title, extra) =>
  field(key, title, "text", { maxLength: 240, ...extra });
const area = (key, title, extra) =>
  field(key, title, "textarea", { maxLength: 4000, ...extra });
const select = (key, title, values, extra) =>
  field(key, title, "select", { options: options(values), ...extra });
const integer = (key, title, extra) =>
  field(key, title, "integer", { min: 0, max: 1_000_000_000, ...extra });
const number = (key, title, extra) =>
  field(key, title, "number", { min: -1e12, max: 1e12, ...extra });
const bool = (key, title, extra) => field(key, title, "boolean", extra);
const date = (key, title, extra) => field(key, title, "date", extra);
const instant = (key, title, extra) =>
  field(key, title, "datetime", {
    help: "Use an ISO instant with an explicit offset, for example 2026-10-26T14:00:00-04:00. Supply the named time zone too.",
    ...extra,
  });
const zone = () =>
  field("timeZone", "Named time zone", "timezone", {
    help: "An IANA zone, for example America/New_York or UTC. It must agree with the instant offset.",
  });
const money = (key, title, extra) =>
  field(key, title, "money", {
    help: "Unknown stays unknown. Amounts use integer minor units and explicit currency precision; currencies are never added together.",
    ...extra,
  });
const ref = (key, title, target, extra) =>
  field(key, title, "reference", { target, ...extra });
const refs = (key, title, target, extra) =>
  field(key, title, "references", {
    target,
    multiple: true,
    maxItems: 100,
    ...extra,
  });
const url = (key, title, extra) =>
  text(key, title, { format: "https", maxLength: 1200, ...extra });
const kind = (values) =>
  select("kind", "Record type", values, {
    required: true,
    nullable: false,
    default: values[0],
  });
const program = () => ref("programId", "Program", "programs");
const dates = () => [
  date("startDate", "Period starts"),
  date("endDate", "Period ends"),
];
const external = () => [
  text("externalSystem", "External system"),
  text("externalId", "External record ID", { maxLength: 160 }),
  url("externalUrl", "External record link"),
];
const titleField = text("title", "Title", {
  required: true,
  nullable: false,
  maxLength: 180,
});

function module(id, title, group, description, fields, states, settings = {}) {
  const write = ["owner", "admin", ...(settings.write || staff)];
  const approve = ["owner", "admin", ...(settings.approve || ["program_lead"])];
  const approvalStates = settings.approvalStates || ["approved"];
  const snapshotStates = settings.snapshotStates || [];
  const transitions = states.slice(0, -1).map((from, i) => ({
    from,
    to: states[i + 1],
    roles: approvalStates.includes(states[i + 1]) ? approve : write,
    requiresApproval: approvalStates.includes(states[i + 1]),
    requiresSnapshot: snapshotStates.includes(states[i + 1]),
  }));
  if (states.includes("cancelled"))
    for (const from of states.filter((x) => x !== "cancelled"))
      if (!transitions.some((x) => x.from === from && x.to === "cancelled"))
        transitions.push({
          from,
          to: "cancelled",
          roles: write,
          requiresApproval: false,
          requiresSnapshot: false,
        });
  return {
    id,
    title,
    group,
    description,
    schemaVersion: SCHEMA_VERSION,
    sensitivity: settings.sensitivity || "internal",
    fields: [titleField, ...fields],
    workflow: {
      initial: states[0],
      states: states.map((id) => ({ id, label: label(id) })),
      transitions,
    },
    roles: {
      read: [
        "owner",
        "admin",
        ...(settings.read ||
          ROLES.filter((x) => !["owner", "admin"].includes(x))),
      ],
      write,
      approve,
      export: [
        "owner",
        "admin",
        ...(settings.export || [
          "program_lead",
          "grants_lead",
          "finance_reviewer",
        ]),
      ],
    },
    scopeRules: {
      requiresOrganization: true,
      supportsProgramScope: true,
      approvedSnapshotsOnly: ["board_reader", "external_reviewer"],
      independentApproval: settings.independentApproval !== false,
      publicPublicationPermission: "publish",
    },
    views: ["table", "board", ...(settings.dateField ? ["calendar"] : [])],
    ...(settings.dateField ? { dateField: settings.dateField } : {}),
    invariants: settings.invariants || [],
  };
}

export const MODULES = [
  module(
    "organization",
    "Organization and access",
    "Foundation",
    "Organization profiles, team responsibilities and access reviews. Account and role changes use the separate authenticated access API.",
    [
      kind(["profile", "team", "access-review"]),
      text("legalName", "Organization name"),
      area("mission", "Mission"),
      text("country", "Country or jurisdiction"),
      zone(),
      select("currency", "Planning currency", Object.keys(CURRENCIES)),
      url("website", "Public website"),
      date("reviewDate", "Next access review"),
      area("handover", "Administrator handover steps"),
    ],
    ["draft", "review", "approved", "archived"],
    {
      write: [],
      approve: [],
      export: [],
      dateField: "reviewDate",
      invariants: [
        "Profile records cannot grant account access or change membership roles.",
      ],
    },
  ),
  module(
    "programs",
    "Mission and program design",
    "Programs and learning",
    "Connect a proposed change, affected communities, assumptions and optional depth hypotheses.",
    [
      kind(["program", "system-map", "assumption"]),
      area("purpose", "Intended change"),
      area("community", "Community context without personal histories"),
      area("mechanism", "How the work may produce change"),
      integer("depth", "Depth hypothesis, 0–4", { max: 4 }),
      select("evidence", "Evidence label", [
        "hypothesis",
        "documented",
        "established",
        "debated",
      ]),
      area("assumptions", "Assumptions and alternatives"),
      url("sourceUrl", "Source"),
      date("reviewDate", "Review date"),
    ],
    ["draft", "review", "approved", "active", "review-due", "closed"],
    {
      dateField: "reviewDate",
      invariants: [
        "Depth describes relief through source; it does not rank the good being done.",
        "A program design is not an independently verified causal claim.",
      ],
    },
  ),
  module(
    "projects",
    "Projects and tasks",
    "Programs and learning",
    "Plan projects, milestones and tasks with accountable owners, dependency checks and explicit deadlines.",
    [
      kind(["project", "task", "milestone"]),
      program(),
      ref("projectId", "Parent project", "projects"),
      refs("dependencyIds", "Dependencies", "projects"),
      area("deliverable", "Completion condition"),
      instant("dueAt", "Due instant"),
      zone(),
      integer("effortMinutes", "Estimated work, minutes"),
      select("priority", "Priority", ["normal", "high", "low"]),
      select("recurrence", "Recurrence rule", [
        "none",
        "weekly",
        "monthly",
        "quarterly",
      ]),
    ],
    ["planned", "ready", "active", "review", "done", "cancelled"],
    {
      dateField: "dueAt",
      approvalStates: ["done"],
      invariants: [
        "A task cannot depend on itself or form a dependency cycle.",
        "A completed task cannot depend on unfinished work.",
        "Recurring rules are recorded explicitly; no silent scheduler is implied.",
      ],
    },
  ),
  module(
    "grant-seeking",
    "Grant seeking",
    "Funding and finance",
    "Track eligibility, application versions, approval and frozen submissions before recording a decision.",
    [
      kind(["opportunity", "application"]),
      program(),
      ref("funderId", "Funder contact", "contacts"),
      select("eligibility", "Eligibility", [
        "unknown",
        "eligible",
        "ineligible",
      ]),
      money("requested", "Requested funding"),
      integer("applicationVersion", "Application version", { min: 1 }),
      instant("deadlineAt", "Funder deadline"),
      zone(),
      area("applicationSummary", "Application summary"),
      refs("documentIds", "Application documents", "documents"),
      text("submissionReference", "Submission reference"),
      date("decisionDate", "Decision date"),
    ],
    [
      "prospect",
      "drafting",
      "review",
      "approved",
      "submitted",
      "decided",
      "cancelled",
    ],
    {
      write: ["grants_lead", "program_lead", "contributor"],
      approve: ["grants_lead"],
      dateField: "deadlineAt",
      snapshotStates: ["submitted"],
      invariants: [
        "Submission requires known eligibility, an application version and a submission reference.",
        "A submission snapshot preserves what was approved; it is not an automatic application to a funder.",
      ],
    },
  ),
  module(
    "grant-delivery",
    "Grant delivery",
    "Funding and finance",
    "Keep award terms, restrictions, commitments and reporting periods linked to the original application.",
    [
      kind(["agreement", "restriction", "report", "amendment"]),
      program(),
      ref("applicationId", "Awarded application", "grant-seeking"),
      ref("agreementId", "Parent agreement", "grant-delivery"),
      money("awarded", "Award amount"),
      money("committed", "Planned commitments"),
      money("spent", "Externally recorded spending"),
      select("restriction", "Restriction", [
        "unknown",
        "unrestricted",
        "restricted",
      ]),
      text("restrictionCode", "Approved restriction code", {
        format: "opaque",
      }),
      area("allowedPurpose", "Permitted use"),
      area("varianceReason", "Funding or spending variance explanation"),
      ...dates(),
      date("reportDue", "Next report due"),
      refs("documentIds", "Agreement versions", "documents"),
    ],
    [
      "draft",
      "review",
      "approved",
      "active",
      "reporting",
      "closed",
      "cancelled",
    ],
    {
      write: ["grants_lead", "program_lead", "finance_reviewer"],
      approve: ["grants_lead", "finance_reviewer"],
      dateField: "reportDue",
      snapshotStates: ["approved"],
      invariants: [
        "Restricted funding requires a permitted purpose before approval.",
        "Award, commitment and spending amounts must use the same currency and precision.",
        "Overruns remain recordable, with an explanation; commitments do not mean paid expenses.",
      ],
    },
  ),
  module(
    "finance",
    "Finance planning",
    "Funding and finance",
    "Build budgets, scenarios and restriction-aware allocations, while recording actual references separately.",
    [
      kind(["budget", "allocation", "scenario", "actual-reference"]),
      program(),
      ref("parentBudgetId", "Parent budget", "finance"),
      ref("agreementId", "Grant agreement", "grant-delivery"),
      money("planned", "Planned amount"),
      money("actual", "External actual amount"),
      integer("allocationBps", "Allocation share, basis points", {
        max: 10000,
      }),
      select("scenario", "Scenario", ["base", "lower", "higher"]),
      text("restrictionCode", "Approved grant restriction code", {
        format: "opaque",
      }),
      area("purpose", "Allocation purpose"),
      ...dates(),
      area("varianceReason", "Budget variance explanation"),
      ...external(),
    ],
    [
      "draft",
      "review",
      "approved",
      "active",
      "reconciled",
      "closed",
      "cancelled",
    ],
    {
      write: ["finance_reviewer", "program_lead", "grants_lead"],
      approve: ["finance_reviewer"],
      dateField: "endDate",
      snapshotStates: ["approved"],
      invariants: [
        "Approved child allocations cannot exceed a known parent budget or sum above 10,000 basis points.",
        "Unknown money is never converted into zero; unlike currencies never share a total.",
        "Restricted grant allocations must state a purpose and match the grant currency.",
      ],
    },
  ),
  module(
    "accounting",
    "Accounting and payroll",
    "Funding and finance",
    "Track external ledger and payroll controls, aggregate reconciliation and accountant review.",
    [
      kind(["ledger-reference", "reconciliation", "payroll-summary"]),
      program(),
      ...external(),
      ...dates(),
      money("amount", "External aggregate amount"),
      money("variance", "Reconciliation variance", { signed: true }),
      integer("peopleCount", "Aggregate payroll count"),
      bool("reconciled", "Reconciled by the external system"),
      area(
        "controlSummary",
        "Control result, without bank or employee details",
      ),
    ],
    ["draft", "review", "approved", "reconciled", "closed"],
    {
      sensitivity: "restricted-finance",
      read: ["finance_reviewer"],
      write: ["finance_reviewer"],
      approve: ["finance_reviewer"],
      export: ["finance_reviewer"],
      dateField: "endDate",
      invariants: [
        "This module stores references and aggregate controls, not a general ledger, bank credentials, tax filing or individual payroll.",
        "A reconciled status requires external identity and an explicit reconciliation result.",
      ],
    },
  ),
  module(
    "contacts",
    "Contacts and relationships",
    "People and participation",
    "Keep minimal operational contact references, organization relationships and purpose-specific contact preferences.",
    [
      kind(["organization", "person-reference", "relationship"]),
      text("displayLabel", "Operational display label"),
      text("email", "Optional operational email", { format: "email" }),
      ref("organizationId", "Related organization contact", "contacts"),
      select("relationship", "Relationship", [
        "unknown",
        "partner",
        "funder",
        "member",
        "volunteer",
        "supplier",
        "staff",
      ]),
      select("contactPreference", "Contact preference", [
        "unknown",
        "permission-needed",
        "permitted",
        "do-not-contact",
      ]),
      area("purpose", "Permitted operational purpose"),
      date("reviewDate", "Preference review date"),
      ...external(),
    ],
    ["draft", "verified", "active", "archived"],
    {
      sensitivity: "restricted-contact",
      read: staff,
      write: staff,
      dateField: "reviewDate",
      approvalStates: ["verified"],
      invariants: [
        "Email is optional so offline participation remains possible.",
        "Beneficiary histories and sensitive service notes do not belong in the contact record.",
        "External identifiers are unique within a module and source system.",
      ],
    },
  ),
  module(
    "fundraising",
    "Giving and fundraising",
    "Funding and finance",
    "Separate campaign plans, pledges and externally confirmed gifts, with restriction and acknowledgment records.",
    [
      kind(["campaign", "pledge", "gift-reference", "acknowledgment"]),
      program(),
      ref("contactId", "Operational donor reference", "contacts"),
      ref("campaignId", "Campaign", "fundraising"),
      money("amount", "Amount"),
      bool("restricted", "Restricted gift"),
      area("restrictionPurpose", "Restriction purpose"),
      date("expectedDate", "Expected date"),
      date("receivedDate", "Externally confirmed receipt date"),
      text("receiptReference", "Provider receipt or reconciliation reference"),
      ...external(),
    ],
    [
      "planned",
      "review",
      "approved",
      "active",
      "reconciled",
      "acknowledged",
      "cancelled",
    ],
    {
      sensitivity: "restricted-finance",
      read: ["finance_reviewer", "grants_lead", "program_lead"],
      write: ["finance_reviewer", "grants_lead"],
      approve: ["finance_reviewer"],
      dateField: "expectedDate",
      invariants: [
        "Pledges remain promises, not receipts.",
        "A reconciled gift needs a receipt reference and received date.",
        "This workspace neither moves money nor issues tax receipts.",
      ],
    },
  ),
  module(
    "memberships",
    "Memberships",
    "People and participation",
    "Manage membership periods, chapters, dues references and explicit directory choices without requiring email.",
    [
      kind(["membership-type", "chapter", "member", "renewal"]),
      ref("contactId", "Member contact", "contacts"),
      ref("chapterId", "Chapter", "memberships"),
      ...dates(),
      money("dues", "Dues amount"),
      select("duesStatus", "Dues status", [
        "unknown",
        "not-required",
        "pending",
        "externally-verified",
      ]),
      text("duesReference", "External dues reference"),
      bool("directoryConsent", "Explicit member directory consent", {
        default: false,
      }),
      date("renewalDate", "Renewal date"),
    ],
    [
      "draft",
      "review",
      "approved",
      "active",
      "renewal-due",
      "expired",
      "cancelled",
    ],
    {
      dateField: "renewalDate",
      invariants: [
        "Membership dates are ordered and renewals do not imply settled dues.",
        "Directory inclusion requires explicit consent and a separate publication permission.",
      ],
    },
  ),
  module(
    "volunteers",
    "Volunteers",
    "People and participation",
    "Plan shifts, record assignments and aggregate attendance, including overnight times and capacity.",
    [
      kind(["profile", "shift", "assignment", "attendance"]),
      program(),
      ref("contactId", "Volunteer reference", "contacts"),
      ref("shiftId", "Shift", "volunteers"),
      area("skills", "Operational skills and interests"),
      instant("startAt", "Starts"),
      instant("endAt", "Ends"),
      zone(),
      integer("capacity", "Shift places"),
      integer("participants", "Attendance count"),
      integer("minutes", "Recorded minutes"),
      ref("safeguardingId", "Required training status", "safeguarding"),
      area("participationPurpose", "Public participation purpose", {
        maxLength: 600,
      }),
      area("participantInstructions", "Public participant instructions", {
        maxLength: 600,
      }),
      text("organizerEmail", "Public organizer email", { maxLength: 254 }),
      url("organizerUrl", "Public organizer contact page", { maxLength: 500 }),
    ],
    [
      "draft",
      "review",
      "approved",
      "open",
      "assigned",
      "completed",
      "cancelled",
    ],
    {
      read: ["program_lead", "contributor", "grants_lead"],
      write: ["program_lead", "contributor"],
      dateField: "startAt",
      invariants: [
        "Shifts have explicit start/end instants and named zones; overnight shifts are valid.",
        "Active assignments cannot exceed known capacity or double-book one volunteer.",
        "Attendance minutes cannot exceed the linked shift duration.",
      ],
    },
  ),
  module(
    "events",
    "Events and learning",
    "People and participation",
    "Coordinate sessions, capacity, registrations and aggregate attendance with explicit scheduling.",
    [
      kind(["session", "registration", "attendance"]),
      program(),
      ref("eventId", "Session", "events"),
      ref("contactId", "Participant reference", "contacts"),
      instant("startAt", "Starts"),
      instant("endAt", "Ends"),
      zone(),
      integer("capacity", "Session places"),
      integer("registeredCount", "Registered participants"),
      integer("attendanceCount", "Attendance count"),
      integer("walkInCount", "Walk-in count"),
      bool("accessCoordinatorNeeded", "Access coordinator requested"),
      url("joiningUrl", "Joining or venue information"),
      area("participationPurpose", "Public participation purpose", {
        maxLength: 600,
      }),
      area("participantInstructions", "Public participant instructions", {
        maxLength: 600,
      }),
      text("organizerEmail", "Public organizer email", { maxLength: 254 }),
      url("organizerUrl", "Public organizer contact page", { maxLength: 500 }),
    ],
    [
      "draft",
      "review",
      "approved",
      "scheduled",
      "open",
      "completed",
      "cancelled",
    ],
    {
      dateField: "startAt",
      invariants: [
        "Session registration respects capacity and avoids duplicate active registrations.",
        "Attendance is distinct from registration and includes explicit walk-ins.",
        "Store access coordination status here, not private medical details.",
      ],
    },
  ),
  module(
    "communications",
    "Communications",
    "People and participation",
    "Review templates and purpose-specific consent; retain provider delivery references without bypassing suppression.",
    [
      kind(["consent", "template", "campaign-reference", "delivery-reference"]),
      ref("contactId", "Contact reference", "contacts"),
      area("purpose", "Specific communication purpose"),
      select("consent", "Consent state", [
        "unknown",
        "pending",
        "opt_in",
        "opt_out",
      ]),
      instant("consentAt", "Consent or withdrawal instant"),
      zone(),
      url("consentEvidence", "Consent evidence reference"),
      select("suppression", "Provider suppression", [
        "unknown",
        "clear",
        "suppressed",
      ]),
      area("content", "Reviewed message or template"),
      ...external(),
    ],
    ["draft", "review", "approved", "active", "withdrawn", "archived"],
    {
      sensitivity: "restricted-contact",
      read: staff,
      write: ["program_lead", "grants_lead"],
      dateField: "consentAt",
      invariants: [
        "Opt-in needs an explicit purpose, timestamp and evidence reference.",
        "Withdrawal and provider suppression cannot be treated as sending authorization.",
        "An approved template is not permission to send a campaign.",
      ],
    },
  ),
  module(
    "forms",
    "Forms and intake",
    "People and participation",
    "Version non-sensitive form definitions, collection purposes and aggregate response batches.",
    [
      kind(["form", "response-batch"]),
      integer("version", "Form version", { min: 1 }),
      area("purpose", "Collection purpose"),
      area("definition", "Question schema JSON", {
        maxLength: 12000,
        help: "JSON array of {key,label,type,required}; types: text,number,boolean,date,select. Do not request sensitive service histories.",
      }),
      bool("consentRequired", "Explicit collection consent required", {
        default: true,
      }),
      bool("anonymous", "Anonymous collection", { default: true }),
      integer("responseCount", "Aggregate response count"),
      date("retentionUntil", "Retention review date"),
      url("collectionUrl", "External collection form"),
    ],
    ["draft", "review", "approved", "published", "closed", "archived"],
    {
      dateField: "retentionUntil",
      snapshotStates: ["published"],
      invariants: [
        "Published definitions have a positive version and validated bounded question schema.",
        "This shared record holds aggregate response counts, not personal intake answers.",
      ],
    },
  ),
  module(
    "casework",
    "Service delivery and casework",
    "Restricted coordination",
    "Coordinate status, external specialist-system references and aggregate service counts without sensitive case narratives.",
    [
      kind(["referral", "request", "appointment", "service-summary"]),
      program(),
      text("coordinationCode", "Pseudonymous coordination code", {
        format: "opaque",
      }),
      select("serviceCategory", "Service category", [
        "unknown",
        "food",
        "housing",
        "education",
        "health",
        "legal",
        "other",
      ]),
      select("consentStatus", "Referral consent", [
        "unknown",
        "not-required",
        "recorded",
        "withdrawn",
      ]),
      instant("consentAt", "Referral consent instant"),
      instant("appointmentAt", "Appointment instant"),
      zone(),
      integer("serviceCount", "Aggregate services delivered"),
      ...external(),
    ],
    [
      "requested",
      "triaged",
      "review",
      "approved",
      "referred",
      "completed",
      "cancelled",
    ],
    {
      sensitivity: "restricted-coordination",
      read: ["program_lead"],
      write: ["program_lead"],
      approve: ["program_lead"],
      export: [],
      dateField: "appointmentAt",
      invariants: [
        "Only codes, categories, dates, aggregate counts and specialist references are accepted.",
        "No beneficiary names, case notes, allegations, health narratives or uploaded service histories are supported.",
        "Referral completion requires an external specialist reference and recorded or not-required consent.",
      ],
    },
  ),
  module(
    "outcomes",
    "Evidence and outcomes",
    "Programs and learning",
    "Define indicators and preserve measurements with units, periods, denominators, sources and missingness.",
    [
      kind(["indicator", "observation", "harm"]),
      program(),
      ref("indicatorId", "Indicator definition", "outcomes"),
      number("value", "Observed value"),
      text("unit", "Measurement unit"),
      number("denominator", "Denominator", { min: 0 }),
      ...dates(),
      text("geography", "Aggregate geography"),
      select("method", "Collection method", [
        "unknown",
        "administrative",
        "survey",
        "observation",
        "experiment",
      ]),
      select("evidence", "Evidence label", [
        "unknown",
        "self-reported",
        "source-linked",
        "independently-reviewed",
      ]),
      url("sourceUrl", "Source"),
      area("limitations", "Limitations and missingness"),
    ],
    ["draft", "review", "approved", "included", "superseded"],
    {
      dateField: "endDate",
      invariants: [
        "Null is missing; zero is a measured value.",
        "Measurements need a unit, observation period and source status.",
        "Percentage/rate observations need a positive denominator; linked indicator units must agree.",
        "Outputs and source links are not proof of causal impact.",
      ],
    },
  ),
  module(
    "feedback",
    "Community feedback",
    "Programs and learning",
    "Track aggregate themes, response commitments and consented public changes without publishing personal accounts.",
    [
      kind(["theme", "feedback-summary", "response"]),
      program(),
      select("channel", "Feedback route", [
        "anonymous",
        "meeting",
        "survey",
        "phone",
        "other",
      ]),
      select("publicationConsent", "Publication permission", [
        "withheld",
        "summary-only",
        "publish-approved",
      ]),
      integer("responses", "Aggregate responses"),
      date("receivedDate", "Received"),
      date("respondBy", "Response due"),
      select("resolution", "Response", [
        "needs-review",
        "changed",
        "planned",
        "no-change-explained",
        "withdrawn",
      ]),
      area("publicSummary", "De-identified summary"),
      area("change", "What changed or why it did not"),
    ],
    [
      "received",
      "triaged",
      "review",
      "approved",
      "responded",
      "published",
      "closed",
    ],
    {
      dateField: "respondBy",
      snapshotStates: ["published"],
      invariants: [
        "Public feedback requires explicit publication permission and a reviewed de-identified summary.",
        "Summaries describe aggregate themes, never personal service histories.",
      ],
    },
  ),
  module(
    "evaluation",
    "Evaluation and learning",
    "Programs and learning",
    "Register questions and protocols, compare explanations and connect evidence to a revisitable decision.",
    [
      kind(["question", "protocol", "review", "decision"]),
      program(),
      refs("outcomeIds", "Evidence records", "outcomes"),
      area("question", "Evaluation question"),
      select("method", "Evaluation approach", [
        "unknown",
        "before-after",
        "comparison",
        "randomized",
        "contribution-analysis",
        "qualitative",
      ]),
      area("counterfactual", "What may have happened otherwise"),
      select("evidenceStrength", "Evidence strength", [
        "unknown",
        "weak",
        "mixed",
        "moderate",
        "strong",
      ]),
      area("uncertainty", "Uncertainty and limitations"),
      area("harms", "Potential harms and dissent"),
      select("decision", "Decision", [
        "undecided",
        "continue",
        "modify",
        "test",
        "stop",
      ]),
      date("reviewDate", "Follow-up review"),
    ],
    [
      "draft",
      "review",
      "approved",
      "registered",
      "analyzing",
      "decided",
      "follow-up",
      "closed",
    ],
    {
      dateField: "reviewDate",
      snapshotStates: ["registered"],
      invariants: [
        "A registered protocol states a question and method before analysis.",
        "A decision includes uncertainty and a follow-up date; unknown evidence is a valid finding.",
      ],
    },
  ),
  module(
    "reporting",
    "Reporting",
    "Governance and records",
    "Assemble source-linked board, funder and public reports from an explicit period and frozen inputs.",
    [
      kind(["board", "funder", "public", "template"]),
      program(),
      ref("agreementId", "Grant agreement", "grant-delivery"),
      refs("outcomeIds", "Indicator sources", "outcomes"),
      refs("financeIds", "Financial planning sources", "finance"),
      ...dates(),
      area("summary", "Report narrative"),
      area("missingness", "Known gaps and uncertainty"),
      select("visibility", "Intended audience", [
        "private",
        "board",
        "funder",
        "public",
      ]),
      date("issueDate", "Issue date"),
    ],
    ["draft", "review", "approved", "frozen", "issued", "superseded"],
    {
      approve: ["program_lead", "grants_lead", "finance_reviewer"],
      dateField: "issueDate",
      snapshotStates: ["frozen", "issued"],
      invariants: [
        "Reports preserve source IDs/revisions in the server snapshot, including missingness.",
        "Public publication requires a separate permission; a report record alone is private.",
      ],
    },
  ),
  module(
    "governance",
    "Governance",
    "Governance and records",
    "Record meetings, decisions, conflicts and delegation with accountable review and explicit voting totals.",
    [
      kind(["meeting", "decision", "conflict", "delegation", "policy"]),
      program(),
      instant("meetingAt", "Meeting instant"),
      zone(),
      area("decisionText", "Decision or policy"),
      bool("conflictDeclared", "Conflict declared"),
      text("recusalReference", "Recusal record reference"),
      integer("votesFor", "Votes for"),
      integer("votesAgainst", "Votes against"),
      integer("abstentions", "Abstentions"),
      integer("quorum", "Required quorum"),
      date("reviewDate", "Review date"),
    ],
    ["draft", "agenda", "review", "approved", "recorded", "superseded"],
    {
      sensitivity: "restricted-governance",
      read: ["program_lead", "board_reader", "external_reviewer"],
      write: ["program_lead"],
      approve: ["board_reader", "program_lead"],
      dateField: "meetingAt",
      snapshotStates: ["recorded"],
      invariants: [
        "Known voting totals must satisfy a stated quorum for approved decisions.",
        "A declared conflict needs a recusal reference; approving one’s own work requires the API’s explicit policy.",
      ],
    },
  ),
  module(
    "documents",
    "Documents and knowledge",
    "Governance and records",
    "Keep versioned external document references, retention decisions and handover knowledge.",
    [
      kind(["document", "version", "retention", "handover"]),
      program(),
      ref("parentDocumentId", "Parent document", "documents"),
      integer("version", "Version", { min: 1 }),
      url("documentUrl", "Private document or knowledge link"),
      text("checksum", "SHA-256 checksum", { format: "sha256", maxLength: 64 }),
      select("classification", "Classification", [
        "internal",
        "restricted",
        "public",
      ]),
      date("retentionUntil", "Retention review date"),
      bool("legalHold", "Retention hold"),
      area("summary", "Non-sensitive document summary"),
    ],
    ["draft", "review", "approved", "archived", "deletion-requested"],
    {
      dateField: "retentionUntil",
      snapshotStates: ["approved"],
      invariants: [
        "Version numbers are unique for one parent document.",
        "An active retention hold prevents an approved deletion request.",
        "External file deletion and private object storage remain separate audited operations.",
      ],
    },
  ),
  module(
    "safeguarding",
    "People and safeguarding",
    "Restricted coordination",
    "Track minimum training/screening status and escalation routes; specialist systems retain reports.",
    [
      kind(["training", "screening-status", "escalation-route"]),
      ref("contactId", "Staff or volunteer reference", "contacts"),
      select("requirement", "Requirement", [
        "orientation",
        "role-training",
        "screening-reference",
        "code-of-conduct",
        "escalation-route",
      ]),
      date("checkedDate", "Checked"),
      date("expiryDate", "Expires"),
      select("completion", "Status", [
        "unknown",
        "pending",
        "current",
        "expired",
        "not-required",
      ]),
      text("verificationReference", "External verification reference"),
      text("responsibleRole", "Responsible role"),
      url("routeUrl", "Specialist escalation route"),
    ],
    ["pending", "review", "approved", "current", "due", "expired"],
    {
      sensitivity: "restricted-status",
      read: ["program_lead"],
      write: ["program_lead"],
      export: [],
      dateField: "expiryDate",
      invariants: [
        "Current status requires a check date and external verification reference.",
        "Only status references are accepted; no criminal, medical or allegation narratives are supported.",
      ],
    },
  ),
  module(
    "assets",
    "Assets and supplies",
    "Operations",
    "Track stock, procurement approvals, in-kind references and program allocation without placing orders.",
    [
      kind(["asset", "stock", "procurement", "in-kind"]),
      program(),
      text("assetCode", "Asset code or stock SKU"),
      integer("quantity", "Quantity"),
      integer("reorderLevel", "Reorder level"),
      money("unitValue", "Unit value"),
      ref("supplierId", "Supplier reference", "contacts"),
      ref("procurementId", "Procurement request", "assets"),
      text("locationCode", "Operational location code"),
      date("receivedDate", "Received date"),
      text("receiptReference", "Receipt or inventory reference"),
    ],
    [
      "requested",
      "review",
      "approved",
      "ordered",
      "received",
      "assigned",
      "disposed",
      "cancelled",
    ],
    {
      approve: ["finance_reviewer", "program_lead"],
      dateField: "receivedDate",
      invariants: [
        "Received stock needs a known quantity and receipt reference.",
        "A planning record never places an order or settles a supplier payment.",
      ],
    },
  ),
  module(
    "resources",
    "Resource discovery",
    "Operations",
    "Review tools and nonprofit benefits, eligibility, renewal dates and operating costs.",
    [
      kind(["tool", "benefit", "eligibility-review", "renewal"]),
      text("providerName", "Provider"),
      url("catalogUrl", "Charitology directory or provider link"),
      select("eligibility", "Eligibility", [
        "unknown",
        "eligible",
        "ineligible",
      ]),
      date("reviewedDate", "Eligibility checked"),
      date("renewalDate", "Renewal or application date"),
      money("cost", "Quoted operating cost"),
      url("sourceUrl", "Terms source"),
      text("confirmationReference", "Actual enrollment reference"),
      area("limitations", "Limits and adoption work"),
    ],
    [
      "discovered",
      "review",
      "approved",
      "applied",
      "active",
      "expired",
      "cancelled",
    ],
    {
      dateField: "renewalDate",
      invariants: [
        "Active benefit enrollment needs a confirmation reference and known eligibility.",
        "A directory listing does not claim current availability or enroll the organization.",
      ],
    },
  ),
  module(
    "integrations",
    "Data and integrations",
    "Foundation",
    "Define field ownership, preview imports, reconcile row counts and record connector conflicts.",
    [
      kind(["connector", "mapping", "import", "sync", "conflict"]),
      ...external(),
      select("direction", "Direction", ["pull", "push", "two-way"]),
      select("fieldOwner", "Field owner", [
        "external",
        "local",
        "review-conflicts",
      ]),
      area("fieldMap", "Mapping JSON", {
        maxLength: 12000,
        help: "JSON object mapping external column names to local field keys; no secrets or executable expressions.",
      }),
      integer("inputRows", "Input rows"),
      integer("acceptedRows", "Accepted rows"),
      integer("rejectedRows", "Rejected rows"),
      integer("skippedRows", "Skipped rows"),
      bool("previewApproved", "Import preview reviewed"),
      text("sourceChecksum", "Source SHA-256", {
        format: "sha256",
        maxLength: 64,
      }),
    ],
    [
      "draft",
      "mapped",
      "preview",
      "approved",
      "running",
      "completed",
      "closed",
    ],
    {
      write: [],
      approve: [],
      read: ["program_lead", "finance_reviewer"],
      export: [],
      snapshotStates: ["approved"],
      invariants: [
        "Completed imports reconcile input = accepted + rejected + skipped.",
        "Import approval requires a source checksum, explicit field ownership and reviewed preview.",
        "Repeated external IDs cannot silently create a second record; no credentials enter mapping data.",
      ],
    },
  ),
  module(
    "administration",
    "Administration and reliability",
    "Foundation",
    "Record restore rehearsals, incidents, retention actions and explicit operating cost controls.",
    [
      kind(["incident", "backup", "restore-test", "retention", "cost-limit"]),
      select("severity", "Severity", [
        "info",
        "low",
        "moderate",
        "high",
        "critical",
      ]),
      date("dueDate", "Action due"),
      integer("expectedRecords", "Expected records"),
      integer("restoredRecords", "Restored records"),
      text("storageReference", "Private backup reference"),
      text("checksum", "SHA-256 checksum", { format: "sha256", maxLength: 64 }),
      instant("testedAt", "Test instant"),
      zone(),
      money("monthlyCap", "Approved monthly cost limit"),
      money("observedCost", "Observed cost"),
      area("recoverySummary", "Recovery result without secrets"),
    ],
    ["planned", "review", "approved", "running", "verified", "closed"],
    {
      sensitivity: "restricted-administration",
      read: ["finance_reviewer"],
      write: [],
      approve: [],
      export: [],
      dateField: "dueDate",
      invariants: [
        "A verified restore needs equal known expected/restored counts, checksum and test time.",
        "A verified backup needs an external storage reference and checksum.",
        "A cost-limit record does not authorize paid provisioning.",
      ],
    },
  ),
];

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
freeze(MODULES);
export const MODULE_MAP = Object.freeze(
  Object.fromEntries(MODULES.map((m) => [m.id, m])),
);
export function getModule(id) {
  if (!Object.hasOwn(MODULE_MAP, id))
    throw new ModuleValidationError([
      { field: "moduleId", message: "Unknown module." },
    ]);
  return MODULE_MAP[id];
}
export class ModuleValidationError extends Error {
  constructor(issues) {
    super(issues.map((x) => `${x.field}: ${x.message}`).join(" "));
    this.name = "ModuleValidationError";
    this.issues = issues;
    this.status = 422;
  }
}
export function modulePermissions(id, role) {
  const m = getModule(id);
  return Object.fromEntries(
    ["read", "write", "approve", "export"].map((action) => [
      action,
      m.roles[action].includes(role),
    ]),
  );
}

const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const opaque = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^(19|20|21|22)\d{2}-\d{2}-\d{2}$/.test(value)
  )
    return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(+d) &&
    d.toISOString().slice(0, 10) === value &&
    +value.slice(0, 4) <= 2200
  );
}
function validZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return typeof value === "string" && value.length <= 100;
  } catch {
    return false;
  }
}
function validInstant(value) {
  if (typeof value !== "string") return false;
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/,
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
}
function agreesWithZone(value, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((x) => [x.type, x.value]),
  );
  return (
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` ===
    value.slice(0, 19)
  );
}
const isKnownMoney = (value) => plain(value) && value.minor !== null;
const sameCurrency = (a, b) =>
  a.currency === b.currency && a.precision === b.precision;
const rowData = (row) => row?.data || {};
function rowsFrom(context) {
  const input = context.records;
  if (input === undefined) return undefined;
  const rows = input instanceof Map ? [...input.values()] : input;
  if (!Array.isArray(rows))
    throw new ModuleValidationError([
      {
        field: "records",
        message: "Reference context must be an array or Map.",
      },
    ]);
  return rows.filter((row) => row && !row.deletedAt && !row.deleted_at);
}

/** Returns a new normalized domain object. It never mutates the input or applies a partial update. */
export function validateRecord(moduleId, input, context = {}) {
  const m = getModule(moduleId);
  if (!plain(input))
    throw new ModuleValidationError([
      { field: "data", message: "Expected a plain object." },
    ]);
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  const allowed = new Set(m.fields.map((f) => f.key));
  for (const key of Object.keys(input))
    if (!allowed.has(key)) add(key, "Unknown or server-owned field.");
  const data = {};
  for (const f of m.fields) {
    let value = Object.hasOwn(input, f.key)
      ? input[f.key]
      : (f.default ?? null);
    if (value === "" && !f.required) value = null;
    if (value === null || value === undefined) {
      if (f.required || f.nullable === false)
        add(f.key, "This field is required.");
      data[f.key] = null;
      continue;
    }
    if (
      [
        "text",
        "textarea",
        "date",
        "datetime",
        "timezone",
        "reference",
      ].includes(f.type)
    ) {
      if (typeof value !== "string") {
        add(f.key, "Expected text.");
        continue;
      }
      value = value.trim();
      if ((f.required && !value) || value.length > (f.maxLength || 1200))
        add(
          f.key,
          `Use ${f.required ? "1–" : "at most "}${f.maxLength || 1200} characters.`,
        );
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
        add(f.key, "Control characters are not accepted.");
      if (f.type === "date" && !validDate(value))
        add(f.key, "Use a real YYYY-MM-DD date from 1900 to 2200.");
      if (f.type === "datetime" && !validInstant(value))
        add(
          f.key,
          "Use a real ISO instant with seconds and an explicit UTC offset.",
        );
      if (f.type === "timezone" && !validZone(value))
        add(f.key, "Use a recognized IANA time zone.");
      if ((f.type === "reference" || f.format === "opaque") && !opaque(value))
        add(
          f.key,
          "Use an opaque record code of at most 100 letters, digits, underscores or hyphens.",
        );
      if (f.format === "sha256" && !/^[a-fA-F0-9]{64}$/.test(value))
        add(f.key, "Use a complete SHA-256 hexadecimal checksum.");
      if (
        f.format === "email" &&
        (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      )
        add(f.key, "Use a valid operational email or leave it unknown.");
      if (f.format === "https") {
        try {
          const u = new URL(value);
          if (
            u.protocol !== "https:" ||
            u.username ||
            u.password ||
            /[\r\n]/.test(value)
          )
            throw new Error();
        } catch {
          add(
            f.key,
            "Use an absolute HTTPS link without embedded credentials.",
          );
        }
      }
    } else if (f.type === "select") {
      if (!f.options.some((x) => x.value === value))
        add(f.key, "Choose a listed option.");
    } else if (f.type === "integer" || f.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (f.type === "integer" && !Number.isSafeInteger(value)) ||
        value < f.min ||
        value > f.max
      )
        add(
          f.key,
          `Use a finite ${f.type === "integer" ? "safe integer" : "number"} between ${f.min} and ${f.max}.`,
        );
    } else if (f.type === "boolean") {
      if (typeof value !== "boolean")
        add(f.key, "Expected true, false or unknown.");
    } else if (f.type === "money") {
      if (
        !plain(value) ||
        Object.keys(value).some(
          (x) => !["minor", "currency", "precision"].includes(x),
        )
      ) {
        add(f.key, "Money requires only minor, currency and precision.");
        continue;
      }
      const currency =
        typeof value.currency === "string" ? value.currency.toUpperCase() : "";
      if (
        !Object.hasOwn(CURRENCIES, currency) ||
        value.precision !== CURRENCIES[currency]
      )
        add(f.key, "Choose a supported currency and its declared precision.");
      if (
        value.minor !== null &&
        (!Number.isSafeInteger(value.minor) || (!f.signed && value.minor < 0))
      )
        add(
          f.key,
          "Amount must be unknown or safe integer minor units; negative values are only allowed for explicit variance fields.",
        );
      value = { minor: value.minor, currency, precision: value.precision };
    } else if (f.type === "references") {
      if (
        !Array.isArray(value) ||
        value.length > (f.maxItems || 100) ||
        value.some((x) => !opaque(x)) ||
        new Set(value).size !== value.length
      ) {
        add(f.key, "Use a bounded list of distinct opaque record IDs.");
        continue;
      }
      value = [...value];
    } else add(f.key, "Unsupported schema field.");
    data[f.key] = value;
  }
  if (issues.length) throw new ModuleValidationError(issues);
  const rows = rowsFrom(context);
  const indexed = new Map((rows || []).map((row) => [row.id, row]));
  const linked = (key) => indexed.get(data[key]);
  for (const f of m.fields.filter((f) =>
    ["reference", "references"].includes(f.type),
  )) {
    for (const id of f.type === "references"
      ? data[f.key] || []
      : data[f.key]
        ? [data[f.key]]
        : []) {
      if (!rows) {
        add(
          f.key,
          "Linked records require a complete organization-scoped reference context.",
        );
        continue;
      }
      const target = indexed.get(id);
      if (
        !target ||
        target.moduleId !== f.target ||
        (context.orgId && target.orgId && target.orgId !== context.orgId)
      )
        add(
          f.key,
          "The linked record is missing, in another module or outside this organization.",
        );
      if (id === context.recordId && !["dependencyIds"].includes(f.key))
        add(f.key, "A record cannot be its own parent.");
    }
  }
  for (const [start, end] of [
    ["startDate", "endDate"],
    ["checkedDate", "expiryDate"],
  ])
    if (data[start] && data[end] && data[end] < data[start])
      add(end, "The end must not precede the start.");
  for (const [start, end] of [["startAt", "endAt"]])
    if (
      data[start] &&
      data[end] &&
      Date.parse(data[end]) <= Date.parse(data[start])
    )
      add(
        end,
        "The end must be later than the start, including overnight work.",
      );
  for (const f of m.fields.filter((x) => x.type === "datetime"))
    if (data[f.key]) {
      if (!data.timeZone)
        add(
          "timeZone",
          "A named time zone is required for scheduled or recorded instants.",
        );
      else if (!agreesWithZone(data[f.key], data.timeZone))
        add(
          f.key,
          "The supplied UTC offset does not agree with the named time zone at this instant.",
        );
    }
  if (data.externalId && !data.externalSystem)
    add("externalSystem", "An external ID needs its source system.");
  if (
    data.externalId &&
    rows?.some(
      (row) =>
        row.id !== context.recordId &&
        row.moduleId === moduleId &&
        rowData(row).externalSystem?.toLowerCase() ===
          data.externalSystem?.toLowerCase() &&
        rowData(row).externalId === data.externalId,
    )
  )
    add(
      "externalId",
      "That external system/ID is already mapped in this module.",
    );
  const state = context.status || m.workflow.initial;
  if (!m.workflow.states.some((x) => x.id === state))
    add("status", "Unknown workflow state.");
  const final = ![
    m.workflow.initial,
    "draft",
    "planned",
    "prospect",
    "requested",
    "pending",
    "discovered",
    "received",
    "review",
    "drafting",
    "triaged",
    "agenda",
    "mapped",
    "preview",
    "cancelled",
    "archived",
    "superseded",
    "expired",
    "deletion-requested",
  ].includes(state);
  const requireValue = (
    key,
    message = "This field is required for this workflow stage.",
  ) => {
    if (data[key] === null || data[key] === undefined || data[key] === "")
      add(key, message);
  };
  const currenciesAgree = (keys) => {
    const amounts = keys.map((k) => data[k]).filter(plain);
    if (amounts.length > 1 && amounts.some((x) => !sameCurrency(x, amounts[0])))
      add(
        keys.join(","),
        "Related money amounts must have the same currency and precision.",
      );
  };
  if (moduleId === "projects") {
    if (data.projectId && rowData(linked("projectId")).kind !== "project")
      add("projectId", "Parent must be a project.");
    const graph = new Map(
      (rows || [])
        .filter((r) => r.moduleId === "projects")
        .map((r) => [r.id, rowData(r).dependencyIds || []]),
    );
    const ownId = context.recordId || "__candidate__";
    graph.set(ownId, data.dependencyIds || []);
    const visiting = new Set(),
      visited = new Set(),
      stack = [[ownId, false]];
    let cycle = false;
    while (stack.length) {
      const [id, leaving] = stack.pop();
      if (leaving) {
        visiting.delete(id);
        visited.add(id);
        continue;
      }
      if (visiting.has(id)) {
        cycle = true;
        break;
      }
      if (visited.has(id)) continue;
      visiting.add(id);
      stack.push([id, true]);
      for (const child of graph.get(id) || []) stack.push([child, false]);
    }
    if (cycle) add("dependencyIds", "Dependencies contain a cycle.");
    if (
      state === "done" &&
      (data.dependencyIds || []).some(
        (id) => indexed.get(id)?.status !== "done",
      )
    )
      add("dependencyIds", "Finish dependencies before completing this work.");
  }
  if (
    moduleId === "grant-seeking" &&
    ["submitted", "decided"].includes(state)
  ) {
    if (data.eligibility !== "eligible")
      add("eligibility", "Submission requires verified eligibility.");
    for (const k of ["applicationVersion", "submissionReference"])
      requireValue(k);
  }
  if (moduleId === "grant-delivery") {
    currenciesAgree(["awarded", "committed", "spent"]);
    if (data.agreementId && rowData(linked("agreementId")).kind !== "agreement")
      add("agreementId", "Link to an agreement record.");
    if (data.kind !== "agreement" && final) requireValue("agreementId");
    if (final && data.restriction === "restricted") {
      requireValue("allowedPurpose");
      requireValue("restrictionCode");
    }
    if (
      isKnownMoney(data.awarded) &&
      [data.committed, data.spent].some(
        (x) =>
          isKnownMoney(x) &&
          sameCurrency(x, data.awarded) &&
          x.minor > data.awarded.minor,
      )
    )
      requireValue(
        "varianceReason",
        "Explain the overrun; recording it must not imply additional funding.",
      );
  }
  if (moduleId === "finance") {
    currenciesAgree(["planned", "actual"]);
    const parent = rowData(linked("parentBudgetId"));
    if (
      data.kind === "budget" &&
      context.recordId &&
      isKnownMoney(data.planned)
    ) {
      const children = (rows || [])
        .filter(
          (r) =>
            r.moduleId === "finance" &&
            rowData(r).parentBudgetId === context.recordId &&
            rowData(r).kind === "allocation" &&
            ["approved", "active", "reconciled", "closed"].includes(r.status),
        )
        .map((r) => rowData(r).planned)
        .filter(isKnownMoney);
      if (children.some((x) => !sameCurrency(x, data.planned)))
        add(
          "planned",
          "Budget currency cannot change while approved allocations use another currency.",
        );
      else if (
        children.reduce((sum, x) => sum + BigInt(x.minor), 0n) >
        BigInt(data.planned.minor)
      )
        add("planned", "Budget cannot be reduced below approved allocations.");
    }
    if (data.parentBudgetId && parent.kind !== "budget")
      add("parentBudgetId", "Allocations must link to a budget.");
    if (
      data.parentBudgetId &&
      isKnownMoney(data.planned) &&
      isKnownMoney(parent.planned) &&
      !sameCurrency(data.planned, parent.planned)
    )
      add("planned", "Allocation currency must match its parent budget.");
    const agreement = rowData(linked("agreementId"));
    if (data.agreementId) {
      if (
        isKnownMoney(data.planned) &&
        isKnownMoney(agreement.awarded) &&
        !sameCurrency(data.planned, agreement.awarded)
      )
        add("planned", "Allocation currency must match the grant agreement.");
      if (agreement.restriction === "restricted" && final) {
        requireValue(
          "purpose",
          "Restricted grant allocations need an explicit permitted purpose.",
        );
        if (
          !agreement.restrictionCode ||
          data.restrictionCode !== agreement.restrictionCode
        )
          add(
            "restrictionCode",
            "Allocation must match the agreement’s approved restriction code.",
          );
      }
      if (
        data.programId &&
        agreement.programId &&
        data.programId !== agreement.programId
      )
        add(
          "programId",
          "Allocation program differs from its grant agreement.",
        );
    }
    if (data.parentBudgetId && final && data.kind === "allocation") {
      if (!isKnownMoney(data.planned))
        add("planned", "Approve an allocation only after its amount is known.");
      const siblings = (rows || [])
        .filter(
          (r) =>
            r.id !== context.recordId &&
            r.moduleId === "finance" &&
            rowData(r).parentBudgetId === data.parentBudgetId &&
            rowData(r).kind === "allocation" &&
            ["approved", "active", "reconciled", "closed"].includes(r.status),
        )
        .map(rowData)
        .concat(data);
      const amounts = siblings.map((x) => x.planned).filter(isKnownMoney);
      if (isKnownMoney(parent.planned)) {
        if (amounts.some((x) => !sameCurrency(x, parent.planned)))
          add(
            "planned",
            "Sibling allocation currencies must match the parent.",
          );
        else {
          let sum = 0;
          for (const amount of amounts) {
            sum += amount.minor;
            if (!Number.isSafeInteger(sum)) {
              add(
                "planned",
                "Allocation total exceeds safe integer precision.",
              );
              break;
            }
          }
          if (sum > parent.planned.minor)
            add("planned", "Approved allocations exceed the parent budget.");
        }
      }
      if (siblings.reduce((sum, x) => sum + (x.allocationBps ?? 0), 0) > 10000)
        add("allocationBps", "Approved allocation shares exceed 100%.");
      if (
        isKnownMoney(parent.planned) &&
        isKnownMoney(data.planned) &&
        data.allocationBps !== null &&
        BigInt(data.planned.minor) !==
          (BigInt(parent.planned.minor) * BigInt(data.allocationBps) + 5000n) /
            10000n
      )
        add(
          "planned",
          "Amount differs from the declared budget share, rounded to the nearest minor unit.",
        );
    }
    if (
      data.agreementId &&
      data.kind === "allocation" &&
      final &&
      isKnownMoney(data.planned)
    ) {
      const existing = (rows || [])
        .filter(
          (r) =>
            r.id !== context.recordId &&
            r.moduleId === "finance" &&
            rowData(r).agreementId === data.agreementId &&
            rowData(r).kind === "allocation" &&
            ["approved", "active", "reconciled", "closed"].includes(r.status),
        )
        .map((r) => rowData(r).planned)
        .filter(isKnownMoney);
      if (!isKnownMoney(agreement.awarded))
        add(
          "agreementId",
          "A grant-funded allocation needs a known award limit before approval.",
        );
      else if (existing.some((x) => !sameCurrency(x, agreement.awarded)))
        add("planned", "Grant allocations have inconsistent currencies.");
      else if (
        existing.reduce(
          (sum, x) => sum + BigInt(x.minor),
          BigInt(data.planned.minor),
        ) > BigInt(agreement.awarded.minor)
      )
        add("planned", "Approved grant allocations exceed the recorded award.");
    }
  }
  if (moduleId === "accounting" && state === "reconciled") {
    requireValue("externalSystem");
    requireValue("externalId");
    if (data.reconciled !== true)
      add("reconciled", "An explicit external reconciliation is required.");
  }
  if (moduleId === "fundraising") {
    if (data.restricted === true && final) requireValue("restrictionPurpose");
    if (
      ["reconciled", "acknowledged"].includes(state) &&
      data.kind === "gift-reference"
    ) {
      requireValue("receivedDate");
      requireValue("receiptReference");
    }
    if (data.campaignId && rowData(linked("campaignId")).kind !== "campaign")
      add("campaignId", "Link to a campaign record.");
  }
  if (moduleId === "memberships") {
    if (data.chapterId && rowData(linked("chapterId")).kind !== "chapter")
      add("chapterId", "Link to a chapter record.");
    if (data.duesStatus === "externally-verified")
      requireValue("duesReference");
  }
  if (["volunteers", "events"].includes(moduleId)) {
    const isVol = moduleId === "volunteers",
      parentKey = isVol ? "shiftId" : "eventId",
      parentKind = isVol ? "shift" : "session";
    const parentRow = linked(parentKey),
      parent = rowData(parentRow);
    if (data[parentKey] && parent.kind !== parentKind)
      add(parentKey, `Link to a ${parentKind}.`);
    if (data.kind === parentKind && final) {
      requireValue("startAt");
      requireValue("endAt");
      requireValue("capacity");
    }
    if (
      isVol &&
      data.kind === "shift" &&
      data.capacity !== null &&
      data.capacity < 1
    )
      add("capacity", "An open shift must have at least one place.");
    const activeStates = isVol
      ? ["open", "assigned", "completed"]
      : ["scheduled", "open", "completed"];
    const assignmentKind = isVol ? "assignment" : "registration";
    if (data.kind === assignmentKind && activeStates.includes(state)) {
      requireValue(parentKey);
      requireValue("contactId");
      if (
        parentRow &&
        !(
          state === "completed"
            ? activeStates
            : activeStates.filter((x) => x !== "completed")
        ).includes(parentRow.status)
      )
        add(
          parentKey,
          "The linked shift/session is not open for assignments or registration.",
        );
      const peers = (rows || []).filter(
        (r) =>
          r.id !== context.recordId &&
          r.moduleId === moduleId &&
          rowData(r).kind === assignmentKind &&
          activeStates.includes(r.status),
      );
      const inSession = peers.filter(
        (r) => rowData(r)[parentKey] === data[parentKey],
      );
      if (
        Number.isSafeInteger(parent.capacity) &&
        inSession.length + 1 > parent.capacity
      )
        add(parentKey, "The linked shift/session has no capacity remaining.");
      if (inSession.some((r) => rowData(r).contactId === data.contactId))
        add(
          "contactId",
          "This contact already has an active assignment/registration.",
        );
      if (isVol && parent.startAt && parent.endAt)
        for (const other of peers.filter(
          (r) => rowData(r).contactId === data.contactId,
        )) {
          const otherShift = rowData(indexed.get(rowData(other).shiftId));
          if (
            otherShift.startAt &&
            otherShift.endAt &&
            Date.parse(parent.startAt) < Date.parse(otherShift.endAt) &&
            Date.parse(otherShift.startAt) < Date.parse(parent.endAt)
          )
            add(
              "shiftId",
              "This volunteer has an overlapping active assignment.",
            );
        }
    }
    if (
      data.kind === parentKind &&
      Number.isSafeInteger(data.capacity) &&
      context.recordId
    ) {
      const existingCount = (rows || []).filter(
        (r) =>
          r.moduleId === moduleId &&
          rowData(r).kind === assignmentKind &&
          rowData(r)[parentKey] === context.recordId &&
          activeStates.includes(r.status),
      ).length;
      if (existingCount > data.capacity)
        add(
          "capacity",
          "Capacity cannot be reduced below existing active assignments/registrations.",
        );
    }
    if (
      isVol &&
      data.kind === "shift" &&
      data.startAt &&
      data.endAt &&
      context.recordId
    ) {
      const assigned = (rows || []).filter(
        (r) =>
          r.moduleId === "volunteers" &&
          rowData(r).kind === "assignment" &&
          activeStates.includes(r.status),
      );
      for (const own of assigned.filter(
        (r) => rowData(r).shiftId === context.recordId,
      ))
        for (const other of assigned.filter(
          (r) =>
            r.id !== own.id &&
            rowData(r).contactId === rowData(own).contactId &&
            rowData(r).shiftId !== context.recordId,
        )) {
          const otherShift = rowData(indexed.get(rowData(other).shiftId));
          if (
            otherShift.startAt &&
            otherShift.endAt &&
            Date.parse(data.startAt) < Date.parse(otherShift.endAt) &&
            Date.parse(otherShift.startAt) < Date.parse(data.endAt)
          )
            add(
              "startAt",
              "Changing this shift would double-book an assigned volunteer.",
            );
        }
    }
    if (
      isVol &&
      data.kind === "attendance" &&
      data.minutes !== null &&
      parent.startAt &&
      parent.endAt &&
      data.minutes >
        (Date.parse(parent.endAt) - Date.parse(parent.startAt)) / 60000
    )
      add("minutes", "Attendance minutes exceed the linked shift duration.");
    if (
      !isVol &&
      data.capacity !== null &&
      data.registeredCount !== null &&
      data.registeredCount > data.capacity
    )
      add("registeredCount", "Registrations exceed capacity.");
    if (
      !isVol &&
      data.attendanceCount !== null &&
      data.registeredCount !== null &&
      data.attendanceCount > data.registeredCount + (data.walkInCount ?? 0)
    )
      add(
        "attendanceCount",
        "Record walk-ins explicitly when attendance exceeds registrations.",
      );
  }
  if (moduleId === "communications" && data.consent === "opt_in") {
    requireValue("purpose");
    requireValue("consentAt");
    requireValue("consentEvidence");
    if (data.suppression === "suppressed" && state === "active")
      add("suppression", "Suppression prevents active sending authorization.");
  }
  if (moduleId === "forms" && data.definition) {
    try {
      const questions = JSON.parse(data.definition);
      if (
        !Array.isArray(questions) ||
        questions.length < 1 ||
        questions.length > 50
      )
        throw new Error();
      const keys = new Set();
      for (const q of questions) {
        if (
          !plain(q) ||
          Object.keys(q).some(
            (k) => !["key", "label", "type", "required", "options"].includes(k),
          ) ||
          !opaque(q.key) ||
          keys.has(q.key) ||
          typeof q.label !== "string" ||
          !q.label.trim() ||
          q.label.length > 180 ||
          !["text", "number", "boolean", "date", "select"].includes(q.type) ||
          (q.required !== undefined && typeof q.required !== "boolean") ||
          (q.type === "select" &&
            (!Array.isArray(q.options) ||
              !q.options.length ||
              q.options.length > 30 ||
              q.options.some(
                (x) => typeof x !== "string" || !x || x.length > 120,
              )))
        )
          throw new Error();
        keys.add(q.key);
      }
      data.definition = JSON.stringify(questions);
    } catch {
      add(
        "definition",
        "Use a bounded, valid non-sensitive question schema with distinct keys.",
      );
    }
  }
  if (moduleId === "forms" && state === "published") {
    requireValue("version");
    requireValue("definition");
    requireValue("purpose");
    requireValue("retentionUntil");
  }
  if (moduleId === "casework") {
    requireValue("coordinationCode");
    if (data.title !== data.coordinationCode)
      add(
        "title",
        "Use only the pseudonymous coordination code as the title; no case narrative or person name.",
      );
    if (["referred", "completed"].includes(state)) {
      requireValue("externalSystem");
      requireValue("externalId");
      if (!["recorded", "not-required"].includes(data.consentStatus))
        add(
          "consentStatus",
          "Referral needs recorded or explicitly not-required consent.",
        );
    }
    if (data.consentStatus === "recorded") requireValue("consentAt");
  }
  if (moduleId === "outcomes") {
    const indicator = rowData(linked("indicatorId"));
    if (data.indicatorId && indicator.kind !== "indicator")
      add("indicatorId", "Link to an indicator definition.");
    if (data.kind !== "indicator") {
      requireValue("unit");
      requireValue("startDate");
      requireValue("endDate");
      requireValue("evidence");
    }
    if (
      data.indicatorId &&
      data.unit &&
      indicator.unit &&
      data.unit !== indicator.unit
    )
      add("unit", "Observation unit differs from its indicator definition.");
    if (
      data.value !== null &&
      ["%", "percent", "percentage", "rate", "ratio"].includes(
        data.unit?.toLowerCase(),
      ) &&
      !(data.denominator > 0)
    )
      add(
        "denominator",
        "A measured rate or percentage needs a positive denominator.",
      );
    if (
      data.value !== null &&
      ["%", "percent", "percentage"].includes(data.unit?.toLowerCase()) &&
      (data.value < 0 || data.value > 100)
    )
      add("value", "A percentage must be between 0 and 100.");
    if (["source-linked", "independently-reviewed"].includes(data.evidence))
      requireValue("sourceUrl");
  }
  if (moduleId === "feedback" && state === "published") {
    if (data.publicationConsent !== "publish-approved")
      add("publicationConsent", "Publication needs explicit permission.");
    requireValue("publicSummary");
    requireValue("change");
  }
  if (moduleId === "evaluation") {
    if (
      ["registered", "analyzing", "decided", "follow-up", "closed"].includes(
        state,
      )
    ) {
      requireValue("question");
      if (!data.method || data.method === "unknown")
        add("method", "A protocol needs a declared method.");
    }
    if (["decided", "follow-up", "closed"].includes(state)) {
      requireValue("uncertainty");
      requireValue("reviewDate");
      if (!data.decision || data.decision === "undecided")
        add("decision", "Record the actual decision.");
    }
  }
  if (moduleId === "reporting" && ["frozen", "issued"].includes(state)) {
    for (const k of ["startDate", "endDate", "summary", "missingness"])
      requireValue(k);
  }
  if (moduleId === "governance" && ["approved", "recorded"].includes(state)) {
    requireValue("decisionText");
    if (data.conflictDeclared === true) requireValue("recusalReference");
    const votes = [data.votesFor, data.votesAgainst, data.abstentions];
    if (
      data.quorum !== null &&
      (votes.some((x) => x === null) ||
        votes.reduce((a, b) => a + b, 0) < data.quorum)
    )
      add("quorum", "Known voting totals must meet the stated quorum.");
  }
  if (moduleId === "documents") {
    if (
      data.parentDocumentId &&
      data.version !== null &&
      rows?.some(
        (r) =>
          r.id !== context.recordId &&
          r.moduleId === "documents" &&
          rowData(r).parentDocumentId === data.parentDocumentId &&
          rowData(r).version === data.version,
      )
    )
      add("version", "This parent document already has that version.");
    if (state === "deletion-requested" && data.legalHold === true)
      add("legalHold", "A retention hold prevents deletion approval.");
  }
  if (
    moduleId === "safeguarding" &&
    (state === "current" || data.completion === "current")
  ) {
    requireValue("checkedDate");
    requireValue("verificationReference");
  }
  if (
    moduleId === "assets" &&
    ["received", "assigned", "disposed"].includes(state)
  ) {
    requireValue("quantity");
    requireValue("receivedDate");
    requireValue("receiptReference");
  }
  if (moduleId === "resources" && state === "active") {
    if (data.eligibility !== "eligible")
      add("eligibility", "Active enrollment needs known eligibility.");
    requireValue("confirmationReference");
    requireValue("sourceUrl");
  }
  if (moduleId === "integrations") {
    if (data.fieldMap) {
      try {
        const map = JSON.parse(data.fieldMap);
        if (
          !plain(map) ||
          Object.keys(map).length > 100 ||
          Object.entries(map).some(
            ([k, v]) =>
              !/^[A-Za-z0-9_. -]{1,100}$/.test(k) ||
              typeof v !== "string" ||
              !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(v) ||
              [
                "__proto__",
                "constructor",
                "prototype",
                "token",
                "password",
                "secret",
                "apiKey",
              ].includes(v),
          )
        )
          throw new Error();
        data.fieldMap = JSON.stringify(map);
      } catch {
        add(
          "fieldMap",
          "Use a bounded field-name mapping without executable expressions or credential fields.",
        );
      }
    }
    if (
      ["approved", "running", "completed", "closed"].includes(state) &&
      ["import", "sync", "mapping"].includes(data.kind)
    ) {
      if (data.previewApproved !== true)
        add(
          "previewApproved",
          "Approve a preview before committing an import.",
        );
      requireValue("sourceChecksum");
      requireValue("fieldOwner");
    }
    if (state === "completed" && ["import", "sync"].includes(data.kind)) {
      const counts = [
        "inputRows",
        "acceptedRows",
        "rejectedRows",
        "skippedRows",
      ];
      for (const k of counts) requireValue(k);
      if (
        counts.every((k) => data[k] !== null) &&
        data.inputRows !==
          data.acceptedRows + data.rejectedRows + data.skippedRows
      )
        add(
          "inputRows",
          "Input must equal accepted + rejected + skipped rows.",
        );
    }
  }
  if (moduleId === "administration" && state === "verified") {
    if (["backup", "restore-test"].includes(data.kind)) {
      requireValue("storageReference");
      requireValue("checksum");
    }
    if (data.kind === "restore-test") {
      requireValue("testedAt");
      requireValue("expectedRecords");
      requireValue("restoredRecords");
      if (data.expectedRecords !== data.restoredRecords)
        add(
          "restoredRecords",
          "Restore totals must reconcile before verification.",
        );
    }
  }
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 64000)
    add("data", "One domain record may not exceed 64,000 UTF-8 bytes.");
  if (issues.length) throw new ModuleValidationError(issues);
  return data;
}

/** Approval and snapshot flags must be derived from persisted server state, never trusted request fields. */
export function validateTransition(moduleId, from, to, context = {}) {
  const m = getModule(moduleId),
    issues = [];
  if (
    !m.workflow.states.some((x) => x.id === from) ||
    !m.workflow.states.some((x) => x.id === to)
  )
    throw new ModuleValidationError([
      { field: "status", message: "Unknown workflow state." },
    ]);
  if (from === to) {
    if (!modulePermissions(moduleId, context.role).write)
      issues.push({
        field: "role",
        message: "This role cannot edit the record.",
      });
  } else {
    const transition = m.workflow.transitions.find(
      (x) => x.from === from && x.to === to,
    );
    if (!transition)
      issues.push({
        field: "status",
        message: "This workflow transition is not allowed.",
      });
    else {
      if (!transition.roles.includes(context.role))
        issues.push({
          field: "role",
          message: "This role cannot perform the transition.",
        });
      if (
        transition.requiresApproval &&
        context.approved !== true &&
        context.approvalApproved !== true &&
        context.approval?.status !== "approved"
      )
        issues.push({
          field: "approval",
          message: "A persisted approval is required.",
        });
      if (
        transition.requiresApproval &&
        m.scopeRules.independentApproval &&
        context.actorId &&
        context.ownerId === context.actorId &&
        context.allowSelfApproval !== true
      )
        issues.push({
          field: "approval",
          message:
            "The record owner cannot approve their own work under this policy.",
        });
      if (transition.requiresSnapshot && context.snapshotApproved !== true)
        issues.push({
          field: "snapshot",
          message: "A server-created immutable approved snapshot is required.",
        });
    }
  }
  if (issues.length) throw new ModuleValidationError(issues);
  if (context.data)
    validateRecord(moduleId, context.data, { ...context, status: to });
  return true;
}

/** Totals remain grouped by currency/precision; missing amounts are counted explicitly. */
export function summarizeMoney(values) {
  for (const value of values)
    if (
      value !== null &&
      value !== undefined &&
      (!plain(value) ||
        !Object.hasOwn(CURRENCIES, value.currency) ||
        CURRENCIES[value.currency] !== value.precision ||
        (value.minor !== null && !Number.isSafeInteger(value.minor)))
    )
      throw new ModuleValidationError([
        { field: "money", message: "Invalid money in total." },
      ]);
  const totals = {},
    unknown = values.filter(
      (x) => x === null || x === undefined || x.minor === null,
    ).length;
  for (const value of values.filter(isKnownMoney)) {
    if (
      !Object.hasOwn(CURRENCIES, value.currency) ||
      CURRENCIES[value.currency] !== value.precision ||
      !Number.isSafeInteger(value.minor)
    )
      throw new ModuleValidationError([
        { field: "money", message: "Invalid money in total." },
      ]);
    const key = `${value.currency}:${value.precision}`;
    totals[key] = (totals[key] || 0) + value.minor;
    if (!Number.isSafeInteger(totals[key]))
      throw new ModuleValidationError([
        {
          field: "money",
          message: "Money total exceeds safe integer precision.",
        },
      ]);
  }
  return { totals, unknown };
}

/** One complete fictional draft per module. These are examples, never seeded claims about real organizations. */
export function exampleRecords(orgId = "example-organization") {
  const records = MODULES.map((m) => ({
    id: `example-${m.id}`,
    orgId,
    moduleId: m.id,
    status: m.workflow.initial,
    revision: 1,
    data: {
      title: `Example: ${m.title}`,
      kind: m.fields.find((f) => f.key === "kind").options[0].value,
    },
  }));
  const examples = {
    organization: {
      legalName: "Example: Open Table Collective",
      mission: "Offer food today and let neighbors shape the service.",
      country: "Example jurisdiction",
      timeZone: "UTC",
      currency: "USD",
    },
    programs: {
      purpose: "Improve reliable access to a weekly food table.",
      community: "Fictional aggregate context. No personal service records.",
      mechanism: "Test opening hours and remove repeated access barriers.",
      depth: 0,
      evidence: "hypothesis",
    },
    projects: {
      deliverable: "A reviewed opening-hours plan.",
      dueAt: "2026-11-12T18:00:00Z",
      timeZone: "UTC",
      effortMinutes: 120,
      priority: "normal",
      recurrence: "none",
    },
    "grant-seeking": {
      eligibility: "unknown",
      requested: { minor: 600000, currency: "USD", precision: 2 },
      applicationVersion: 1,
    },
    "grant-delivery": {
      awarded: null,
      committed: { minor: 0, currency: "USD", precision: 2 },
      restriction: "unknown",
      startDate: "2026-11-01",
      endDate: "2027-01-31",
    },
    finance: {
      planned: { minor: 1200000, currency: "USD", precision: 2 },
      actual: null,
      scenario: "base",
      purpose: "Fictional next-season planning budget.",
    },
    accounting: {
      externalSystem: "Example ledger",
      externalId: "synthetic-period-1",
      amount: null,
      reconciled: false,
      controlSummary: "No accountant review or ledger posting is claimed.",
    },
    contacts: {
      displayLabel: "Example: community partner",
      relationship: "partner",
      contactPreference: "permission-needed",
    },
    fundraising: {
      amount: { minor: 100000, currency: "USD", precision: 2 },
      restricted: false,
    },
    memberships: {
      startDate: "2026-11-01",
      endDate: "2027-10-31",
      directoryConsent: false,
      duesStatus: "unknown",
    },
    volunteers: {
      kind: "shift",
      startAt: "2026-11-12T23:00:00Z",
      endAt: "2026-11-13T02:00:00Z",
      timeZone: "UTC",
      capacity: 4,
    },
    events: {
      startAt: "2026-11-15T15:00:00Z",
      endAt: "2026-11-15T16:00:00Z",
      timeZone: "UTC",
      capacity: 12,
      registeredCount: 0,
      attendanceCount: null,
      walkInCount: 0,
    },
    communications: {
      purpose: "Optional program updates",
      consent: "unknown",
      suppression: "unknown",
    },
    forms: {
      version: 1,
      purpose:
        "Count preferred opening-hour choices without identifying respondents.",
      definition:
        '[{"key":"opening_hour","label":"Preferred opening time","type":"select","options":["Morning","Afternoon"],"required":true}]',
      responseCount: 0,
      anonymous: true,
      consentRequired: true,
    },
    casework: {
      title: "example-coordination-001",
      coordinationCode: "example-coordination-001",
      serviceCategory: "unknown",
      consentStatus: "unknown",
      serviceCount: null,
    },
    outcomes: {
      unit: "visits",
      value: null,
      denominator: null,
      evidence: "unknown",
      limitations: "No observations have been collected.",
    },
    feedback: {
      channel: "anonymous",
      publicationConsent: "withheld",
      responses: null,
      publicSummary: "Fictional aggregate theme awaiting community review.",
      resolution: "needs-review",
    },
    evaluation: {
      question:
        "Does the revised opening time reduce repeated access barriers?",
      method: "unknown",
      evidenceStrength: "unknown",
      decision: "undecided",
      uncertainty: "The proposed design has not been tested.",
    },
    reporting: {
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      visibility: "private",
      summary: "Example report structure.",
      missingness: "No outcome or spending data is included.",
    },
    governance: {
      decisionText: "Example proposal to test revised hours.",
      conflictDeclared: false,
      votesFor: null,
      votesAgainst: null,
      abstentions: null,
    },
    documents: {
      version: 1,
      classification: "internal",
      summary: "Example handbook reference. No file has been uploaded.",
      legalHold: false,
    },
    safeguarding: {
      requirement: "orientation",
      completion: "pending",
      responsibleRole: "Program lead",
    },
    assets: {
      assetCode: "example-stock-001",
      quantity: null,
      reorderLevel: 2,
      unitValue: null,
    },
    resources: {
      providerName: "Example provider",
      eligibility: "unknown",
      limitations: "Check current terms and adoption costs before applying.",
    },
    integrations: {
      direction: "pull",
      fieldOwner: "review-conflicts",
      fieldMap: '{"Project name":"title"}',
      inputRows: null,
      acceptedRows: null,
      rejectedRows: null,
      skippedRows: null,
      previewApproved: false,
    },
    administration: {
      severity: "info",
      monthlyCap: { minor: 0, currency: "USD", precision: 2 },
      observedCost: null,
      recoverySummary: "Example rehearsal plan; no restore has been performed.",
    },
  };
  for (const record of records)
    record.data = validateRecord(
      record.moduleId,
      { ...record.data, ...examples[record.moduleId] },
      { records, orgId, recordId: record.id, status: record.status },
    );
  return records;
}
