export type ProgramField = {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "number" | "date" | "url" | "select";
  options?: string[];
  optional?: boolean;
  min?: number;
  max?: number;
  value?: string;
  hint?: string;
};
export type ProgramCollection = {
  key: string;
  label: string;
  singular: string;
  description: string;
  fields: ProgramField[];
  sample: Record<string, string>[];
};
export type ProgramWorkspace = {
  id: string;
  title: string;
  purpose: string;
  limits: string;
  context: ProgramField[];
  collections: ProgramCollection[];
  guide: { title: string; text: string }[];
};
const text = (key: string, label: string, optional = false): ProgramField => ({
  key,
  label,
  optional,
});
const area = (key: string, label: string, optional = false): ProgramField => ({
  key,
  label,
  kind: "textarea",
  optional,
});
const num = (
  key: string,
  label: string,
  value: string,
  max = 1e9,
): ProgramField => ({ key, label, kind: "number", value, min: 0, max });
const date = (key: string, label: string, optional = false): ProgramField => ({
  key,
  label,
  kind: "date",
  optional,
});
const select = (
  key: string,
  label: string,
  options: string[],
): ProgramField => ({ key, label, kind: "select", options, value: options[0] });
const source = (optional = true): ProgramField => ({
  key: "source",
  label: "Public source URL",
  kind: "url",
  optional,
  hint: "Use a public source; no private documents or personal records.",
});
const depth = () =>
  select("depth", "Depth description (a hypothesis, never a grade)", [
    "Unclassified",
    "0 Relief",
    "1 Repair",
    "2 Prevention",
    "3 Structure",
    "4 Source",
    "Several levels",
  ]);
const evidence = () =>
  select("evidence", "Evidence status for this claim", [
    "Not checked",
    "Public description",
    "Observational evidence",
    "Causal study",
    "Mixed or disputed",
    "Hypothesis",
  ]);
const taskFields = [
  text("title", "Task"),
  text("owner", "Role responsible", true),
  date("date", "Due date", true),
  select("status", "Task status", ["To do", "In progress", "Done"]),
  area("notes", "Next step or notes", true),
];
const sessions = [
  {
    title: "Values night",
    objective: "Understand where frameworks agree and where they differ.",
    agenda:
      "0–10 min: welcome and permission to disagree. 10–25: complete Values Compass individually. 25–45: compare a hypothetical gift through welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. 45–55: name one unresolved disagreement. 55–60: choose a next step.",
    reading: "/tools/values-compass/",
    output:
      "A short anonymous list of agreements and disagreements; do not collect members’ private giving histories.",
  },
  {
    title: "Story and scale",
    objective: "Notice how stories and scale each shape attention.",
    agenda:
      "0–10 min: agree a hypothetical issue. 10–25: write two truthful appeals from the same facts, one personal and one aggregate. 25–40: discuss what each reveals and leaves out. 40–55: design a fairer combined appeal. 55–60: record what would test whether it works.",
    reading: "/open-problems/story-without-bias/",
    output:
      "Two draft appeals and a testable question; use fictional people, not invented claims about real beneficiaries.",
  },
  {
    title: "Depth coding",
    objective:
      "Describe the causal mechanism of an activity without scoring an organization.",
    agenda:
      "0–10 min: read the five depth definitions. 10–30: independently code a publicly described activity. 30–45: compare disagreements and cite the exact description. 45–55: record uncertainty and what would change the classification. 55–60: check that nobody treated depth as quality.",
    reading: "/method/#depth",
    output:
      "One activity description with a source, tentative depth, rival interpretation and an explicit uncertainty note.",
  },
  {
    title: "Forecast night",
    objective: "Turn a broad expectation into a resolvable forecast.",
    agenda:
      "0–10 min: pick an open question. 10–25: specify an observable event, deadline and resolution source. 25–40: make individual probabilities before discussing. 40–50: compare reasons and outside views. 50–60: set a date to resolve and learn.",
    reading: "/tools/forecasting-platform/",
    output:
      "A dated forecast with a public resolution rule and reasoning; do not treat agreement as evidence.",
  },
  {
    title: "Red-team night",
    objective: "Give a claim its strongest fair challenge.",
    agenda:
      "0–10 min: choose one claim and read its source. 10–25: list the evidence and its scope. 25–40: construct a rival explanation or failure mode. 40–50: ask what finding would change either view. 50–60: draft a specific, respectful correction or research question.",
    reading: "/contribute/",
    output:
      "A claim, source excerpt location, strongest challenge and proposed correction. A person must choose whether to submit it.",
  },
  {
    title: "Reading and handover",
    objective:
      "Practice the method and make the next organizer’s work possible.",
    agenda:
      "0–15 min: read a textbook section. 15–35: apply it to a hypothetical giving decision. 35–45: list remaining questions. 45–55: update public-safe notes, next dates and role descriptions. 55–60: choose the next organizer with consent.",
    reading: "/record/principles/read/",
    output:
      "A worked exercise and a handover checklist; export the kit without private contact details.",
  },
];
export const programWorkspaces: Record<string, ProgramWorkspace> = {
  "university-chapters": {
    id: "university-chapters",
    title: "Build a chapter launch kit",
    purpose:
      "Plan a term, assign responsibilities and leave the next organizer a usable handover. The six sample sessions include facilitation agendas and concrete outputs.",
    limits:
      "This workspace does not register a chapter or imply university approval. Follow your institution’s rules. Do not raise, hold or direct funds in Charitology’s name.",
    context: [
      text("name", "Chapter working name"),
      text("institution", "Institution or community"),
      area("purpose", "Purpose and who is welcome"),
      area(
        "access",
        "Accessibility, participation and disagreement ground rules",
      ),
      area("governance", "How decisions and role changes will work"),
      text("term", "Term or date range"),
      text("meeting", "Meeting place or public meeting link", true),
    ],
    collections: [
      {
        key: "sessions",
        label: "Term sessions",
        singular: "session",
        description:
          "Each meeting has a timed agenda, a reading and an output. Add dates and adapt the kit to your group.",
        fields: [
          text("title", "Session title"),
          date("date", "Session date", true),
          text("facilitator", "Facilitator role", true),
          text("location", "Place or public meeting link", true),
          area("objective", "Learning objective"),
          area("agenda", "Timed agenda"),
          text("reading", "Reading or tool path", true),
          area("output", "Expected output"),
          area("notes", "What happened and what to improve", true),
        ],
        sample: sessions,
      },
      {
        key: "roles",
        label: "Responsibilities",
        singular: "role",
        description: "Use role names. Store private contact details elsewhere.",
        fields: [
          text("title", "Role name"),
          area("responsibility", "Responsibilities and boundaries"),
          area("handover", "Handover checklist"),
          text("term", "Rotation or term", true),
        ],
        sample: [
          {
            title: "Facilitator",
            responsibility:
              "Keep discussion open, give each framework a fair hearing and stop personal judgments.",
            handover:
              "Share agendas, public-safe notes and open questions; show the next facilitator how to export this kit.",
            term: "Rotate each session",
          },
          {
            title: "Evidence steward",
            responsibility:
              "Check public source links, label uncertainty and record proposed corrections.",
            handover:
              "Export the reading list, unresolved claims and corrections awaiting a human decision.",
            term: "One term",
          },
        ],
      },
      {
        key: "tasks",
        label: "Launch and handover tasks",
        singular: "task",
        description: "Track the actual steps from a draft kit to a meeting.",
        fields: taskFields,
        sample: [
          {
            title: "Check student-group recognition and room rules",
            owner: "Organizer",
            status: "To do",
            notes:
              "Ask the institution which permissions, access arrangements and naming rules apply.",
          },
          {
            title: "Run the first meeting and record feedback",
            owner: "Facilitator",
            status: "To do",
            notes:
              "Invite differing views, record what confused people and update the next session.",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Draft constitution",
        text: "Purpose: learn and practice the Charitology method. Membership is open across subjects and views. Describe mechanisms, not people’s motives. Depth never grades good work. Decisions and role changes follow the rules entered above. Members may disagree and leave. No funds are held or directed in Charitology’s name. Institutional recognition and local rules must be checked before launch.",
      },
      {
        title: "Invitation template",
        text: "Join a free discussion of how generosity works. We will use a short reading, a practical exercise and open disagreement across moral frameworks. No giving pledge or prior knowledge is required. Add your date, place, access arrangements and an organizer contact through your own approved channel.",
      },
      {
        title: "After each meeting",
        text: "Record the question, sources read, strongest disagreement, what changed and one next step. Ask participants what made it easier or harder to take part. Publish only notes people agreed could be shared.",
      },
    ],
  },
  "local-charitology": {
    id: "local-charitology",
    title: "Research a local needs picture",
    purpose:
      "Keep a traceable inventory of needs, public activities and questions for listening. The export becomes a methods-first local research brief.",
    limits:
      "This is a research notebook, not a completed city census or a rating of organizations. Absence from this inventory is not evidence that no work exists. Use aggregate public information; keep private experiences and contact details out.",
    context: [
      text("name", "Study title"),
      text("place", "Geographic boundary"),
      text("population", "Population and inclusion rules"),
      area("question", "Decision or question this research will inform"),
      area("method", "Search and listening method, including missing groups"),
      area("limits", "Coverage limits and blind spots"),
      date("date", "Research cutoff date", true),
    ],
    collections: [
      {
        key: "needs",
        label: "Needs and evidence",
        singular: "need",
        description:
          "Separate an observed indicator from an interpretation of need. Record the denominator and date.",
        fields: [
          text("title", "Need or indicator"),
          text("population", "Population or denominator"),
          text("period", "Period covered"),
          area("finding", "Finding and units"),
          source(false),
          evidence(),
          area("limits", "What the source cannot establish"),
          text("voice", "Whose perspectives are missing?", true),
        ],
        sample: [
          {
            title: "Fictional district: transport access",
            population: "All residents in a hypothetical district",
            period: "Illustrative only",
            finding:
              "No observed number supplied. Replace with a public transport-access indicator.",
            source: "https://example.org/",
            evidence: "Hypothesis",
            limits:
              "This fictional placeholder provides no evidence about a real place.",
            voice: "Residents who cannot attend meetings",
          },
        ],
      },
      {
        key: "activities",
        label: "Public activities",
        singular: "activity",
        description:
          "Describe one piece of work at a time. Source its mechanism and state the limits of your depth hypothesis.",
        fields: [
          text("title", "Activity description"),
          text("organization", "Organization or public body"),
          text("cause", "Cause or local issue"),
          text("coverage", "Area and population served"),
          depth(),
          area("mechanism", "Causal mechanism and alternative classification"),
          source(false),
          date("date", "Source checked on"),
          area("limits", "Coverage and classification uncertainty"),
        ],
        sample: [],
      },
      {
        key: "questions",
        label: "Gaps and listening plan",
        singular: "question",
        description:
          "A data gap starts a question. Plan how to check it with people who know the work and place.",
        fields: [
          text("title", "Unanswered question"),
          area("reason", "Why the answer matters"),
          area(
            "voices",
            "Whose input is needed and how participation will be accessible",
          ),
          text("owner", "Research role", true),
          date("date", "Follow-up date", true),
          select("status", "Question status", [
            "Open",
            "Checking",
            "Answered",
            "Unresolved",
          ]),
          area("notes", "Answer, consent boundaries or next step", true),
        ],
        sample: [
          {
            title: "Which informal groups are missing from public filings?",
            reason:
              "Formal records may not show all mutual aid or community work.",
            voices:
              "Ask community organizations how to invite overlooked groups without collecting private beneficiary stories.",
            status: "Open",
            notes: "Record the search method and unresolved coverage limits.",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Methods before conclusions",
        text: "Define the boundary, population and cutoff date. Search the same public sources consistently, record exclusions and ask what informal or small-scale work those sources miss. The inventory is a sample unless you establish coverage.",
      },
      {
        title: "Listening guide",
        text: "Ask: What need does the available data miss? What work already exists? Who makes decisions and who cannot take part? What could we safely publish? Explain the purpose and offer a way to correct or withdraw a contribution. Do not collect personal case histories here.",
      },
      {
        title: "Interpretation rule",
        text: "Report overlaps and possible gaps as questions to check. Multiple activities may complement each other. A depth distribution describes the entered sample and says nothing by itself about quality, effectiveness or where a city should give.",
      },
    ],
  },
  "time-charitology": {
    id: "time-charitology",
    title: "Plan a realistic volunteer week",
    purpose:
      "Compare role requirements, travel, preparation and staff support before committing. Build a feasible plan and agree how to learn what the work changes.",
    limits:
      "Hours and hypothetical opportunity costs are planning inputs, not evidence of social value. Confirm needs with the organization. This tool does not find openings, arrange placements or rate named organizations.",
    context: [
      text("name", "Plan name"),
      num(
        "available",
        "Hours available per week, including travel and preparation",
        "4",
        168,
      ),
      text("skills", "Skills you can offer (comma separated)"),
      num(
        "wage",
        "Optional hypothetical value of your own time per hour (0 to omit)",
        "0",
        1e6,
      ),
      text("currency", "Currency or unit for optional costs"),
      area(
        "access",
        "Access needs, boundaries and scheduling constraints",
        true,
      ),
    ],
    collections: [
      {
        key: "roles",
        label: "Volunteer opportunities",
        singular: "opportunity",
        description:
          "Enter weekly averages. The committed total includes roles marked Planned or Active. Other statuses remain visible for comparison.",
        fields: [
          text("title", "Role or opportunity"),
          text("organization", "Organization or project"),
          select("status", "Commitment status", [
            "Exploring",
            "Planned",
            "Active",
            "Finished",
            "Declined",
          ]),
          num("hours", "Direct service hours per week", "2", 168),
          num("travel", "Travel hours per week", "0", 168),
          num("prep", "Preparation or training hours per week", "0", 168),
          num(
            "staff",
            "Staff support hours needed per week (your estimate)",
            "0",
            168,
          ),
          num("cost", "Travel and other out-of-pocket cost per week", "0", 1e6),
          text("skills", "Required skills (comma separated)", true),
          select(
            "confirmed",
            "Has the organization confirmed this role and support estimate?",
            [
              "Not confirmed",
              "Role confirmed only",
              "Role and support confirmed",
            ],
          ),
          area(
            "outcome",
            "What would change, for whom, and how would you check?",
          ),
          area("feedback", "Feedback question and next review date", true),
          source(),
        ],
        sample: [
          {
            title: "Fictional database cleanup",
            organization: "Example community project",
            status: "Planned",
            hours: "2",
            travel: "0.5",
            prep: "0.5",
            staff: "0.25",
            cost: "5",
            skills: "Spreadsheets, careful checking",
            confirmed: "Not confirmed",
            outcome:
              "Hypothesis: fewer duplicate records. Ask staff which task is actually needed before committing.",
            feedback:
              "After two sessions, ask whether the cleaned records saved staff time.",
          },
        ],
      },
      {
        key: "logs",
        label: "Hours and learning log",
        singular: "log entry",
        description:
          "Record actual hours and observations separately from your plan. An observation is not proof of attribution.",
        fields: [
          text("title", "Role or activity"),
          date("date", "Date"),
          num("hours", "Actual direct service hours", "1", 168),
          num("travel", "Actual travel and preparation hours", "0", 168),
          area(
            "observation",
            "What you observed, including unexpected effects",
          ),
          area("next", "What to ask or change next", true),
        ],
        sample: [],
      },
    ],
    guide: [
      {
        title: "Before agreeing",
        text: "Ask the organization what would otherwise happen, which skills matter, who will supervise, how much support it needs and whether a one-off visit creates extra work. Agree access arrangements and boundaries. Do not assume unused volunteer time is free for staff.",
      },
      {
        title: "Review the role",
        text: "Separate hours provided, outputs delivered and changes in people’s lives or the organization. Ask what staff and the people served think. Include friendship, belonging, rights and care alongside outcomes that can be counted. Do not convert those goods into a wage figure.",
      },
      {
        title: "Cost assumptions",
        text: "Door-to-door commitment = direct service + travel + preparation. Hypothetical weekly personal cost = that commitment × the hourly value you enter + out-of-pocket cost. This does not compare the social value of volunteering with donating money.",
      },
    ],
  },
  "corporate-program": {
    id: "corporate-program",
    title: "Design a workplace giving policy",
    purpose:
      "Model matching rules before drafting a policy. Compare scenarios, see where a budget would fall short and export a reviewable policy and assumptions.",
    limits:
      "This is a planning calculator. It does not process payroll, gifts or matching payments, determine tax eligibility or establish a company pilot. Every scenario assumes the same average gift for every participating employee.",
    context: [
      text("name", "Workplace policy draft name"),
      num("employees", "Eligible employees", "100", 1e7),
      text("currency", "Currency or unit"),
      text("period", "Policy period"),
      area("eligibility", "Proposed recipient and employee eligibility rules"),
      area("flexibility", "General support and multi-year matching rules"),
      area(
        "privacy",
        "Privacy, voluntary participation and accessibility rules",
      ),
      area("learning", "Reporting, employee feedback and policy review plan"),
    ],
    collections: [
      {
        key: "scenarios",
        label: "Matching scenarios",
        singular: "scenario",
        description:
          "Participants are rounded down to whole people. Match cap is the employer contribution per participating person. Budget includes administration. No funds are actually allocated.",
        fields: [
          text("title", "Scenario name"),
          num("participation", "Participation rate (%)", "50", 100),
          num("gift", "Average employee gift in policy period", "100", 1e9),
          num("ratio", "Employer match per 1 unit of employee gift", "1", 100),
          num("cap", "Employer match cap per participating person", "100", 1e9),
          num(
            "budget",
            "Total employer budget, including administration",
            "10000",
            1e12,
          ),
          num("admin", "Administration cost in policy period", "500", 1e12),
          area(
            "assumptions",
            "Rationale, uncertain inputs and eligibility assumptions",
          ),
        ],
        sample: [
          {
            title: "Illustrative 1:1 match",
            participation: "50",
            gift: "100",
            ratio: "1",
            cap: "100",
            budget: "6000",
            admin: "500",
            assumptions:
              "Fictional inputs only. All 50 modeled participants make a 100-unit eligible gift; no payment or outcome is implied.",
          },
          {
            title: "Illustrative higher take-up",
            participation: "80",
            gift: "100",
            ratio: "1",
            cap: "100",
            budget: "6000",
            admin: "500",
            assumptions:
              "Same equal-gift assumption with more participants. The shortfall requires a policy choice; the tool does not silently prorate matches.",
          },
        ],
      },
      {
        key: "tasks",
        label: "Policy review checklist",
        singular: "review task",
        description:
          "Resolve rules and accountability before anyone promises a match.",
        fields: taskFields,
        sample: [
          {
            title: "Check eligibility, access and privacy with employees",
            owner: "Policy owner",
            status: "To do",
            notes:
              "Make participation voluntary. Offer a way to challenge exclusions without exposing private giving preferences.",
          },
          {
            title: "Resolve oversubscription rule before launch",
            owner: "Budget owner",
            status: "To do",
            notes:
              "Choose and disclose whether to increase the budget, change the cap or apply a clearly stated allocation rule. Do not promise unsupported full matches.",
          },
          {
            title:
              "Check legal, payroll and tax rules in the relevant jurisdiction",
            owner: "Qualified reviewer",
            status: "To do",
            notes: "This calculator supplies no legal or tax determination.",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Draft policy structure",
        text: "State eligible employees and recipients, the period, match ratio, per-person cap and total employer budget. Describe how people request a match, how it is checked, when it would be paid and what happens if requests exceed the budget. Treat those administration steps as unresolved until a responsible person approves them.",
      },
      {
        title: "Choice and privacy",
        text: "Participation should be voluntary. Publish access and exclusion rules. Do not require employees to disclose beliefs, rank their generosity or give to a preferred cause. State who can see requests, what records are retained and how corrections or appeals work.",
      },
      {
        title: "Learning plan",
        text: "Distinguish gifts and employer spending from outcomes. Ask recipients what reporting is useful and proportionate. Describe flexibility and restrictions, consider different moral lenses and publish limitations and unwanted effects as well as results.",
      },
    ],
  },
  "policy-program": {
    id: "policy-program",
    title: "Build a policy options brief",
    purpose:
      "Compare options with an explicit baseline, evidence, equity questions and uncertain assumptions. Optional present-value arithmetic keeps monetary assumptions separate from unpriced outcomes.",
    limits:
      "The output is a draft for scrutiny, not an endorsed policy, completed evaluation or official government document. No option is automatically recommended. Numerical scenarios are not evidence and do not put a price on rights, care or other unpriced goods.",
    context: [
      text("name", "Brief title"),
      text("jurisdiction", "Jurisdiction and decision-maker"),
      area("question", "Decision, affected population and scope"),
      area("baseline", "Status quo: what would happen without a change?"),
      num("years", "Time horizon in whole years", "10", 100),
      num("discount", "Annual discount rate (%)", "3", 100),
      text("currency", "Common monetary unit and price year"),
      area(
        "uncertainty",
        "Shared uncertainties and what would change the decision",
      ),
    ],
    collections: [
      {
        key: "options",
        label: "Options and monetary scenarios",
        singular: "option",
        description:
          "Enter incremental costs and benefits relative to the stated baseline, all in the same price-year units. Upfront cost occurs at year 0; constant annual flows occur at each year end. Use 0 if you are not monetizing an item, and explain it in unpriced outcomes.",
        fields: [
          text("title", "Option name"),
          area("mechanism", "Mechanism, implementation and causal assumptions"),
          depth(),
          num("upfront", "Incremental upfront cost at year 0", "0", 1e12),
          num("annualCost", "Incremental annual cost", "0", 1e12),
          num("annualLow", "Low annual monetary benefit scenario", "0", 1e12),
          num("annualHigh", "High annual monetary benefit scenario", "0", 1e12),
          area(
            "unpriced",
            "Unpriced outcomes, rights, care, nature and possible harms",
          ),
          area(
            "uncertainty",
            "Evidence gaps, delivery risks and scenario rationale",
          ),
        ],
        sample: [
          {
            title: "Fictional prevention option",
            mechanism:
              "Illustrative causal chain only. Describe a real baseline and evidence before interpreting any result.",
            depth: "2 Prevention",
            upfront: "1000",
            annualCost: "100",
            annualLow: "150",
            annualHigh: "300",
            unpriced:
              "Participation, access and possible displacement have not been measured or priced.",
            uncertainty:
              "All numbers are hypothetical. Benefits are constant each year only to show the arithmetic.",
          },
        ],
      },
      {
        key: "evidence",
        label: "Evidence and rival explanations",
        singular: "evidence claim",
        description:
          "A citation supports a specific claim, not the whole brief. Describe transfer limits and what would distinguish rival explanations.",
        fields: [
          text("title", "Claim or finding"),
          text("option", "Option this bears on"),
          source(false),
          evidence(),
          area(
            "finding",
            "What the source supports, including population and setting",
          ),
          area(
            "limits",
            "Counterfactual, rival explanations and limits on transfer",
          ),
          date("date", "Source checked on"),
        ],
        sample: [],
      },
      {
        key: "equity",
        label: "Equity and participation",
        singular: "equity question",
        description:
          "Record distribution and voice separately from aggregate monetary results. Keep personal data out.",
        fields: [
          text("title", "Population or perspective"),
          text("option", "Option or all options"),
          area("effects", "Who may benefit, bear costs or be excluded?"),
          area("voice", "Whose input is present, missing or constrained?"),
          area(
            "safeguards",
            "Safeguards, alternatives and questions to resolve",
          ),
        ],
        sample: [],
      },
      {
        key: "tasks",
        label: "Review and evaluation plan",
        singular: "review task",
        description: "Make the next evidence check and follow-up explicit.",
        fields: taskFields,
        sample: [
          {
            title: "Add status quo and at least one alternative",
            owner: "Analyst",
            status: "To do",
            notes:
              "State why these options are feasible and what each would displace.",
          },
          {
            title: "Seek affected communities’ and implementers’ critique",
            owner: "Brief owner",
            status: "To do",
            notes:
              "Document who was invited, access barriers, disagreement and whether publication is appropriate.",
          },
          {
            title: "Pre-specify a follow-up measure and decision rule",
            owner: "Evaluation lead",
            status: "To do",
            notes:
              "State the outcome, data source, date, counterfactual and what would trigger a change. Label any plan not yet agreed.",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Decision framing",
        text: "Define the decision and affected population. Include the status quo and feasible alternatives, opportunity costs and implementation constraints. Explain what relief, repair, prevention, structure or source means for each mechanism; deeper is not automatically better.",
      },
      {
        title: "Evidence and fairness",
        text: "Separate causal findings from descriptions and hypotheses. Check the population, setting, measurement and comparison. Show credible disagreement. Consider welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing without treating one monetary total as the decision.",
      },
      {
        title: "Arithmetic and uncertainty",
        text: "Present value of a constant annual flow = the sum from year 1 through the horizon of flow ÷ (1 + discount rate)^year. Net present value here subtracts upfront cost and annual costs from a low or high annual monetary benefit scenario. The interval is an input scenario range, not a confidence interval or probability forecast. Costs and benefits are incremental to your baseline; no inflation, tax, risk adjustment or distribution weighting is added.",
      },
      {
        title: "Recommendation remains yours",
        text: "Write the strongest case against your preferred option, the evidence that could change your view and a feasible evaluation plan. Seek relevant expertise and affected communities’ input before using a brief to influence a public decision.",
      },
    ],
  },
};
