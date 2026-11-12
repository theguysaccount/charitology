import type { PartnerWorkspace } from "./partner-types";
export const fundingWorkspaces: Record<string, PartnerWorkspace> = {
  "the-charitology-fund": {
    id: "the-charitology-fund",
    title: "Fund governance and grant desk",
    purpose:
      "Build a proposal pipeline, record conflicts and conditional allocations, and prepare a transparency draft. Amounts are planning entries, not cash or measured impact.",
    limits:
      "No legal fund exists through this workspace. It accepts, holds and transfers no money, verifies no eligibility and publishes no charity rankings. Every authorization is a local planning record.",
    context: [
      {
        key: "name",
        label: "Fund plan title",
        kind: "text",
        optional: false,
      },
      {
        key: "scope",
        label: "Purpose, populations, moral lenses and allocation boundaries",
        kind: "textarea",
        optional: false,
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "authority",
        label:
          "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
      },
      {
        key: "budget",
        label: "Optional hypothetical planning envelope",
        kind: "number",
        optional: true,
        min: 0,
        max: 1000000000000.0,
      },
      {
        key: "currency",
        label: "Currency for that envelope",
        kind: "text",
        optional: true,
      },
      {
        key: "publicSummary",
        label: "Public purpose and readiness summary",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "proposals",
        label: "Grant proposals",
        singular: "proposal",
        description:
          "Describe a public activity and its evidence. A pipeline stage does not approve a grant.",
        fields: [
          {
            key: "title",
            label: "Public activity or proposal code",
            kind: "text",
            optional: false,
          },
          {
            key: "mechanism",
            label: "Intended outcome, mechanism and counterfactual",
            kind: "textarea",
            optional: false,
          },
          {
            key: "depth",
            label: "Activity depth, a hypothesis never a grade",
            kind: "select",
            optional: false,
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels",
            ],
            value: "Unclassified",
          },
          {
            key: "amount",
            label: "Requested planning amount; blank unknown",
            kind: "number",
            optional: true,
            min: 0,
            max: 1000000000000.0,
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "evidence",
            label: "Evidence, uncertainty and strongest objection",
            kind: "textarea",
            optional: false,
          },
          {
            key: "voice",
            label:
              "Affected community input, authority and missing perspectives",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Proposal stage",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Evidence gathering",
              "Discussion",
              "Not proceeding",
              "Conditional allocation proposed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional proposal P-01",
            mechanism:
              "Hypothetical community access project. Compare partnership with starting a new service.",
            depth: "Unclassified",
            amount: "1000",
            currency: "USD",
            source: "",
            evidence:
              "No empirical evidence supplied. Define the outcome and check public sources first.",
            voice:
              "No community input has been collected; design an accessible invitation before proceeding.",
            status: "Draft",
          },
        ],
      },
      {
        key: "conflicts",
        label: "Conflicts and recusals",
        singular: "conflict disclosure",
        description:
          "Use roles and proposal codes. A local record is not an independent clearance.",
        fields: [
          {
            key: "title",
            label: "Disclosure reference",
            kind: "text",
            optional: false,
          },
          {
            key: "proposal",
            label: "Proposal or allocation reference",
            kind: "text",
            optional: false,
          },
          {
            key: "role",
            label: "Review role; no private personal information",
            kind: "text",
            optional: false,
          },
          {
            key: "connection",
            label: "Relevant public connection or explicit unknown",
            kind: "textarea",
            optional: false,
          },
          {
            key: "response",
            label: "Recusal, separation of duties and independent check needed",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional conflict check C-01",
            proposal: "P-01",
            role: "Proposed independent review role",
            connection:
              "No actual reviewer is appointed. Interests must be disclosed before review.",
            response:
              "Check connections before discussion; document a recusal if needed.",
            status: "Draft",
          },
        ],
      },
      {
        key: "allocations",
        label: "Conditional allocation decisions",
        singular: "allocation",
        description:
          "These are reversible local records, never a transfer instruction or promise to a recipient.",
        fields: [
          {
            key: "title",
            label: "Allocation reference",
            kind: "text",
            optional: false,
          },
          {
            key: "proposal",
            label: "Proposal reference",
            kind: "text",
            optional: false,
          },
          {
            key: "amount",
            label: "Conditional amount; blank unknown",
            kind: "number",
            optional: true,
            min: 0,
            max: 1000000000000.0,
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
          },
          {
            key: "rationale",
            label: "Public reasoning, alternatives and dissent",
            kind: "textarea",
            optional: false,
          },
          {
            key: "conditions",
            label: "Unmet readiness, evidence and authorization conditions",
            kind: "textarea",
            optional: false,
          },
          {
            key: "date",
            label: "Local review date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            label: "Decision record",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Conditional recommendation",
              "Locally recorded authorization",
              "Declined",
              "Withdrawn",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional allocation A-01",
            proposal: "P-01",
            amount: "400",
            currency: "USD",
            rationale:
              "Demonstration only; no proposal was actually approved. Preserve opposing views.",
            conditions:
              "No legal home, resources, recipient agreement or independent review exists.",
            date: "",
            status: "Conditional recommendation",
          },
        ],
      },
      {
        key: "ledger",
        label: "Nonpayment authorization ledger",
        singular: "ledger entry",
        description:
          "Track planned authorizations separately from gifts received, cash balances and payments. This ledger records none of those.",
        fields: [
          {
            key: "title",
            label: "Ledger reference",
            kind: "text",
            optional: false,
          },
          {
            key: "allocation",
            label: "Allocation reference",
            kind: "text",
            optional: false,
          },
          {
            key: "amount",
            label: "Planned authorization amount; blank unknown",
            kind: "number",
            optional: true,
            min: 0,
            max: 1000000000000.0,
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
          },
          {
            key: "status",
            label: "Planning entry state",
            kind: "select",
            optional: false,
            options: ["Planned", "Conditional", "Cancelled"],
            value: "Planned",
          },
          {
            key: "notes",
            label: "Public explanation and unresolved conditions",
            kind: "textarea",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
        ],
        sample: [
          {
            title: "Fictional ledger L-01",
            allocation: "A-01",
            amount: "400",
            currency: "USD",
            status: "Conditional",
            notes:
              "Unfunded example only. No cash receipt, liability or payment is represented.",
            source: "",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Review a grant",
        text: "Start from the purpose and affected communities. Read primary evidence, state counterfactuals, compare alternatives and examine disagreement across moral lenses. Never infer effectiveness from depth alone.",
      },
      {
        title: "Separate authorization from cash",
        text: "Reconcile proposed amounts and explicit conditions with the governing body. This nonpayment ledger cannot stand in for banking, bookkeeping, legal records or audited accounts.",
      },
      {
        title: "Prepare transparency",
        text: "Review the public draft, remove confidential information, verify evidence and obtain authority before sharing it. Exporting does not publish, approve or fund anything.",
      },
    ],
    readiness: [
      {
        title: "Governance and legal home",
        reason:
          "Identify an accountable host and seek appropriate independent review before any external operation.",
      },
      {
        title: "People, resources and permission",
        reason:
          "Confirm real roles, resources, consent and any required agreements; this software creates none.",
      },
      {
        title: "Conflicts, safeguards and correction",
        reason:
          "Set independent review, recusal, access, retention and challenge procedures before launch.",
      },
    ],
    sampleContext: {
      name: "Fund governance and grant desk — fictional demonstration",
      publicSummary:
        "Fictional planning demonstration. No operating fund, funding, allocation approval or payment exists.",
      scope:
        "A hypothetical planning exercise only. No actual program, participant, reviewer, funding commitment or field result exists.",
      period: "Illustrative planning cycle",
      authority:
        "No operating institution is represented. Responsible people must resolve the readiness checklist independently.",
      privacy:
        "Use project codes, role placeholders and public sources. No personal histories, private finances, contact details or sensitive applicant information.",
    },
  },
  "charity-incubator": {
    id: "charity-incubator",
    title: "Incubator discovery and cohort desk",
    purpose:
      "Investigate a gap, check existing organizations first, build a project pipeline and test a small causal hypothesis before proposing a launch.",
    limits:
      "This is a planning and learning workspace. It launches no legal organization, recruits no founder, awards no funding and verifies no result.",
    context: [
      {
        key: "name",
        label: "Incubator cycle title",
        kind: "text",
        optional: false,
      },
      {
        key: "scope",
        label: "Scope, populations and what would count as a genuine gap",
        kind: "textarea",
        optional: false,
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "authority",
        label:
          "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "gaps",
        label: "Gap and existing-work checks",
        singular: "gap check",
        description:
          "Missing from this notebook never means nobody is doing the work.",
        fields: [
          {
            key: "title",
            label: "Gap question",
            kind: "text",
            optional: false,
          },
          {
            key: "need",
            label: "Need, coverage and evidence limitations",
            kind: "textarea",
            optional: false,
          },
          {
            key: "search",
            label:
              "Public registries, search terms, dates and community-led sources",
            kind: "textarea",
            optional: false,
          },
          {
            key: "existing",
            label: "Existing work, partnership options and duplication risk",
            kind: "textarea",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "next",
            label: "Next independent check and who should shape it",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional gap G-01",
            need: "Hypothetical access question; scale and local priorities are unknown.",
            search:
              "No search conducted. Record exact sources and dates before claiming a gap.",
            existing:
              "Investigate whether an existing group can adapt or partner before forming a new one.",
            source: "",
            next: "Ask relevant community groups how to define the question without collecting private stories.",
            status: "Draft",
          },
        ],
      },
      {
        key: "projects",
        label: "Cohort projects and stages",
        singular: "project",
        description:
          "Track project codes and role needs, not sensitive founder profiles.",
        fields: [
          {
            key: "title",
            label: "Project code",
            kind: "text",
            optional: false,
          },
          {
            key: "gap",
            label: "Gap reference",
            kind: "text",
            optional: false,
          },
          {
            key: "model",
            label:
              "Theory of change, alternative delivery routes and stop rule",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Cohort stage",
            kind: "select",
            optional: false,
            options: [
              "Discovery",
              "Existing partner search",
              "Design",
              "Pilot proposed",
              "Learning",
              "Hand-off",
              "Closed",
            ],
            value: "Discovery",
          },
          {
            key: "roles",
            label: "Role placeholders, capacity and support needed",
            kind: "textarea",
            optional: false,
          },
          {
            key: "governance",
            label: "Decision authority, conflicts, access and consent",
            kind: "textarea",
            optional: false,
          },
          {
            key: "date",
            label: "Next review",
            kind: "date",
            optional: true,
          },
        ],
        sample: [
          {
            title: "Fictional project I-01",
            gap: "G-01",
            model:
              "A partnership might improve access. Stop if affected people do not want it or an existing route serves the need.",
            status: "Discovery",
            roles:
              "Facilitation, evidence and community liaison roles not appointed.",
            governance:
              "No organization, founder agreement or delivery authorization exists.",
            date: "",
          },
        ],
      },
      {
        key: "experiments",
        label: "Experiments and learning",
        singular: "experiment",
        description:
          "Write decision rules before results. Negative and inconclusive observations belong in the record.",
        fields: [
          {
            key: "title",
            label: "Experiment reference",
            kind: "text",
            optional: false,
          },
          {
            key: "project",
            label: "Project reference",
            kind: "text",
            optional: false,
          },
          {
            key: "hypothesis",
            label: "Hypothesis and causal link to test",
            kind: "textarea",
            optional: false,
          },
          {
            key: "design",
            label: "Population, comparison, outcome, consent and safeguards",
            kind: "textarea",
            optional: false,
          },
          {
            key: "threshold",
            label: "Success, stop and revision rules; limits of detection",
            kind: "textarea",
            optional: false,
          },
          {
            key: "finding",
            label: "Observed result, uncertainty or explicitly not run",
            kind: "textarea",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional experiment E-01",
            project: "I-01",
            hypothesis:
              "Hypothetical: a different opening window would improve access.",
            design:
              "Not designed or conducted. Seek community input and a proportionate ethical comparison.",
            threshold:
              "Define a meaningful change and a harm stopping rule before collecting data.",
            finding: "Not run; no result exists.",
            source: "",
            status: "Draft",
          },
        ],
      },
      {
        key: "milestones",
        label: "Milestones and hand-off",
        singular: "milestone",
        description:
          "Describe a deliverable and the evidence needed to accept it.",
        fields: [
          {
            key: "title",
            label: "Milestone",
            kind: "text",
            optional: false,
          },
          {
            key: "project",
            label: "Project reference",
            kind: "text",
            optional: false,
          },
          {
            key: "acceptance",
            label: "Public deliverable and acceptance evidence",
            kind: "textarea",
            optional: false,
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            label: "Milestone state",
            kind: "select",
            optional: false,
            options: [
              "Planned",
              "In progress",
              "Needs review",
              "Accepted locally",
              "Closed",
            ],
            value: "Planned",
          },
          {
            key: "next",
            label: "Hand-off, merger or closure plan",
            kind: "textarea",
            optional: false,
          },
        ],
        sample: [
          {
            title: "Fictional milestone M-01",
            project: "I-01",
            acceptance:
              "A documented search for existing services and an explicit duplication assessment.",
            owner: "",
            date: "",
            status: "Planned",
            next: "Prefer supporting an existing organization if the search supports that route.",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Investigate before launching",
        text: "Define coverage and search existing work. Separate a gap in your sources from an unmet need. Record reasons a partnership, adaptation or hand-off may be preferable to a new entity.",
      },
      {
        title: "Use staged commitments",
        text: "At each stage, write what would stop or change the project. Seek consent and appropriate independent guidance before involving participants or promising resources.",
      },
      {
        title: "Hand over honestly",
        text: "Export the evidence, open assumptions, responsibilities and next review. A stage change records a local decision; it does not establish incorporation, funding or proven impact.",
      },
    ],
    readiness: [
      {
        title: "Governance and legal home",
        reason:
          "Identify an accountable host and seek appropriate independent review before any external operation.",
      },
      {
        title: "People, resources and permission",
        reason:
          "Confirm real roles, resources, consent and any required agreements; this software creates none.",
      },
      {
        title: "Conflicts, safeguards and correction",
        reason:
          "Set independent review, recusal, access, retention and challenge procedures before launch.",
      },
    ],
    sampleContext: {
      name: "Incubator discovery and cohort desk — fictional demonstration",
      scope:
        "A hypothetical planning exercise only. No actual program, participant, reviewer, funding commitment or field result exists.",
      period: "Illustrative planning cycle",
      authority:
        "No operating institution is represented. Responsible people must resolve the readiness checklist independently.",
      privacy:
        "Use project codes, role placeholders and public sources. No personal histories, private finances, contact details or sensitive applicant information.",
    },
  },
  "question-bounties": {
    id: "question-bounties",
    title: "Question bounty specification and claims desk",
    purpose:
      "Write a question, acceptance rules and appeal route; track conditional pledges, evidence submissions and an auditable local decision packet.",
    limits:
      "No prize is funded, opened, promised or paid here. No pledge is collected or verified. Local records do not create a contract or establish independent judging.",
    context: [
      {
        key: "name",
        label: "Bounty planning cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "scope",
        label: "Open problem, public value and what the question leaves out",
        kind: "textarea",
        optional: false,
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "authority",
        label:
          "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "specifications",
        label: "Question specifications",
        singular: "specification",
        description:
          "Make partial, negative and disputed results legible before any public call.",
        fields: [
          {
            key: "title",
            label: "Bounty question code",
            kind: "text",
            optional: false,
          },
          {
            key: "question",
            label: "Exact question and open-problem link",
            kind: "textarea",
            optional: false,
          },
          {
            key: "acceptance",
            label: "Evidence, reproducibility and acceptance criteria",
            kind: "textarea",
            optional: false,
          },
          {
            key: "partial",
            label: "Partial-result and null-result rules",
            kind: "textarea",
            optional: false,
          },
          {
            key: "appeal",
            label: "Conflicts, appeal, withdrawal and correction process",
            kind: "textarea",
            optional: false,
          },
          {
            key: "amount",
            label: "Illustrative target amount; blank unknown",
            kind: "number",
            optional: true,
            min: 0,
            max: 1000000000000.0,
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional bounty B-01",
            question:
              "How could a bounded activity sample preserve unclassified spending?",
            acceptance:
              "Specify a reproducible method, provenance and sensitivity checks; no finding exists.",
            partial:
              "Document gaps and uncertainty even if no estimate can be made.",
            appeal:
              "Publish criteria for discussion; appoint independent reviewers before any real call.",
            amount: "100",
            currency: "USD",
            source: "",
            status: "Draft",
          },
        ],
      },
      {
        key: "pledges",
        label: "Unverified conditional pledges",
        singular: "pledge record",
        description:
          "A pledge is not money received, available cash or a payment obligation.",
        fields: [
          {
            key: "title",
            label: "Pledge reference",
            kind: "text",
            optional: false,
          },
          {
            key: "bounty",
            label: "Bounty code",
            kind: "text",
            optional: false,
          },
          {
            key: "role",
            label: "Public institution or role placeholder",
            kind: "text",
            optional: false,
          },
          {
            key: "amount",
            label: "Conditional amount; blank unknown",
            kind: "number",
            optional: true,
            min: 0,
            max: 1000000000000.0,
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
          },
          {
            key: "conditions",
            label: "Conditions and verification still needed",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Pledge state",
            kind: "select",
            optional: false,
            options: [
              "Illustrative only",
              "Unverified conditional",
              "Withdrawn",
            ],
            value: "Illustrative only",
          },
        ],
        sample: [
          {
            title: "Fictional pledge P-01",
            bounty: "B-01",
            role: "Potential sponsor role, not contacted",
            amount: "100",
            currency: "USD",
            conditions:
              "No sponsor, legal home or escrow exists. Demonstration only.",
            status: "Illustrative only",
          },
        ],
      },
      {
        key: "claims",
        label: "Evidence submissions and claims",
        singular: "claim",
        description:
          "Use public work or project codes; do not collect personal applications.",
        fields: [
          {
            key: "title",
            label: "Claim code",
            kind: "text",
            optional: false,
          },
          {
            key: "bounty",
            label: "Bounty code",
            kind: "text",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "result",
            label:
              "Claim, methods and reproducible materials or explicitly not supplied",
            kind: "textarea",
            optional: false,
          },
          {
            key: "limits",
            label: "Limits, objections, missing perspectives and permissions",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional claim C-01",
            bounty: "B-01",
            source: "",
            result:
              "No actual submission. This row illustrates a place to record a public method and evidence.",
            limits:
              "Check license, reproducibility and community safeguards before review.",
            status: "Draft",
          },
        ],
      },
      {
        key: "decisions",
        label: "Review and conditional awards",
        singular: "decision packet",
        description:
          "Record reasons against published criteria. There is no automatic eligibility, winner score or payment.",
        fields: [
          {
            key: "title",
            label: "Decision reference",
            kind: "text",
            optional: false,
          },
          {
            key: "claim",
            label: "Claim and bounty references",
            kind: "text",
            optional: false,
          },
          {
            key: "criteria",
            label:
              "Criteria applied, public evidence and unresolved disagreements",
            kind: "textarea",
            optional: false,
          },
          {
            key: "conflicts",
            label: "Reviewer-role interests, recusals and independent checks",
            kind: "textarea",
            optional: false,
          },
          {
            key: "amount",
            label: "Conditional award proposal; blank unknown",
            kind: "number",
            optional: true,
            min: 0,
            max: 1000000000000.0,
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
          },
          {
            key: "conditions",
            label: "Unmet legal, funding and appeal conditions",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local decision state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "More evidence needed",
              "Conditional recommendation",
              "No award proposed",
              "Withdrawn",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional decision D-01",
            claim: "B-01 / C-01",
            criteria:
              "No assessment conducted. Record evidence against each prepublished criterion.",
            conflicts: "No judges appointed or conflicts checked.",
            amount: "",
            currency: "USD",
            conditions:
              "No funded prize, legal home or judging process exists.",
            status: "Draft",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Before a real call",
        text: "Resolve a legal home, independently held resources, eligibility, accessibility, judging and disputes with responsible people. This software is not a prize announcement.",
      },
      {
        title: "Make claims reproducible",
        text: "Require public methods, data where appropriate, limitations and a response to objections. A null or incomplete result can still meet a prepublished partial-result criterion.",
      },
      {
        title: "Close the loop",
        text: "Publish a properly authorized decision with reasoning, dissent, appeal status and corrections. Keep conditional pledges separate from receipts and never infer available money from a local planning sum.",
      },
    ],
    readiness: [
      {
        title: "Governance and legal home",
        reason:
          "Identify an accountable host and seek appropriate independent review before any external operation.",
      },
      {
        title: "People, resources and permission",
        reason:
          "Confirm real roles, resources, consent and any required agreements; this software creates none.",
      },
      {
        title: "Conflicts, safeguards and correction",
        reason:
          "Set independent review, recusal, access, retention and challenge procedures before launch.",
      },
    ],
    sampleContext: {
      name: "Question bounty specification and claims desk — fictional demonstration",
      scope:
        "A hypothetical planning exercise only. No actual program, participant, reviewer, funding commitment or field result exists.",
      period: "Illustrative planning cycle",
      authority:
        "No operating institution is represented. Responsible people must resolve the readiness checklist independently.",
      privacy:
        "Use project codes, role placeholders and public sources. No personal histories, private finances, contact details or sensitive applicant information.",
    },
  },
  "the-charitology-prize": {
    id: "the-charitology-prize",
    title: "Prize nominations and jury packet desk",
    purpose:
      "Draft criteria, gather public-work nominations, record conflicts and preserve reasons and dissent in a local jury packet.",
    limits:
      "No award, appointed jury, funded prize or approved organization ranking is created. The unit is a published piece of work. There is no automatic winner or numerical rating.",
    context: [
      {
        key: "name",
        label: "Prize planning cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "scope",
        label: "Purpose, public-work categories and recognition hypothesis",
        kind: "textarea",
        optional: false,
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "authority",
        label:
          "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "criteria",
        label: "Categories and criteria",
        singular: "criterion",
        description:
          "Test the criteria before using them. Criteria can remain disputed.",
        fields: [
          {
            key: "title",
            label: "Criterion or category",
            kind: "text",
            optional: false,
          },
          {
            key: "definition",
            label: "What evidence would satisfy it?",
            kind: "textarea",
            optional: false,
          },
          {
            key: "risks",
            label: "Gaming, excluded work and fairness risks",
            kind: "textarea",
            optional: false,
          },
          {
            key: "challenge",
            label: "Strongest objection and revision process",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional published-failure category",
            definition:
              "A useful account of what did not work, with evidence, limits and protections for people served.",
            risks:
              "Do not reward spectacle, exposure of private stories or the size of a public profile.",
            challenge:
              "Ask affected communities and independent reviewers to challenge the framing before any call.",
            status: "Draft",
          },
        ],
      },
      {
        key: "nominations",
        label: "Public work nominations",
        singular: "nomination",
        description:
          "Nominate research, methods, tools or failure reports. Do not rank people or whole organizations.",
        fields: [
          {
            key: "title",
            label: "Public work title or nomination code",
            kind: "text",
            optional: false,
          },
          {
            key: "category",
            label: "Proposed category",
            kind: "text",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "contribution",
            label: "What the published work adds, with evidence and limits",
            kind: "textarea",
            optional: false,
          },
          {
            key: "voice",
            label:
              "Consent, attribution, missing voices and community protections",
            kind: "textarea",
            optional: false,
          },
          {
            key: "objection",
            label: "Strongest case against recognition",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional nomination N-01",
            category: "Published-failure category",
            source: "",
            contribution:
              "No work is nominated. Demonstration of a packet requiring public evidence.",
            voice:
              "Use public work with proper attribution; avoid private beneficiary or applicant information.",
            objection:
              "Recognition may reward visibility rather than useful learning; test that risk.",
            status: "Draft",
          },
        ],
      },
      {
        key: "conflicts",
        label: "Jury interests and recusals",
        singular: "recusal record",
        description: "Use roles and public connections, not personal profiles.",
        fields: [
          {
            key: "title",
            label: "Conflict check code",
            kind: "text",
            optional: false,
          },
          {
            key: "nomination",
            label: "Nomination reference",
            kind: "text",
            optional: false,
          },
          {
            key: "role",
            label: "Proposed jury role",
            kind: "text",
            optional: false,
          },
          {
            key: "connection",
            label: "Relevant connection or explicit unknown",
            kind: "textarea",
            optional: false,
          },
          {
            key: "response",
            label: "Recusal, independent check and record of dissent",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional recusal R-01",
            nomination: "N-01",
            role: "Independent methods-review role, not appointed",
            connection: "No actual review or conflict check has occurred.",
            response:
              "Do not deliberate until relevant connections and recusals are resolved.",
            status: "Draft",
          },
        ],
      },
      {
        key: "deliberations",
        label: "Jury deliberation packets",
        singular: "deliberation",
        description:
          "Prepare reasons and dissent for a human process. A local status does not confer an award.",
        fields: [
          {
            key: "title",
            label: "Deliberation reference",
            kind: "text",
            optional: false,
          },
          {
            key: "nomination",
            label: "Nomination and criterion references",
            kind: "text",
            optional: false,
          },
          {
            key: "evidence",
            label: "Evidence considered and unresolved checks",
            kind: "textarea",
            optional: false,
          },
          {
            key: "reasons",
            label: "Reasoning, counterarguments and alternatives",
            kind: "textarea",
            optional: false,
          },
          {
            key: "dissent",
            label: "Dissent and response, including unknown",
            kind: "textarea",
            optional: false,
          },
          {
            key: "authorization",
            label: "Who would authorize publication, appeal and correction?",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Packet state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "More evidence requested",
              "Ready for independent discussion",
              "Locally recorded proposal",
              "Withdrawn",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional packet J-01",
            nomination: "N-01",
            evidence: "No evidence reviewed; no jurors appointed.",
            reasons:
              "Compare the work with the criteria, not organizational reputation.",
            dissent:
              "No deliberation held; preserve dissent if a real process is established.",
            authorization:
              "No authority or funded award exists. Review public wording before any external communication.",
            status: "Draft",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Prepare an independent process",
        text: "Review category access, conflicts, evidence and appeal procedures before appointing a jury or opening nominations. A local checklist cannot establish independence.",
      },
      {
        title: "Recognize work without ranking charities",
        text: "Inspect a specific public contribution. Preserve limitations, reasons and dissent. Never turn the packet into an unsupported organization score.",
      },
      {
        title: "Publish only with authority",
        text: "Check attribution and consent, remove private details and explain the actual state. This tool never announces or awards a prize.",
      },
    ],
    readiness: [
      {
        title: "Governance and legal home",
        reason:
          "Identify an accountable host and seek appropriate independent review before any external operation.",
      },
      {
        title: "People, resources and permission",
        reason:
          "Confirm real roles, resources, consent and any required agreements; this software creates none.",
      },
      {
        title: "Conflicts, safeguards and correction",
        reason:
          "Set independent review, recusal, access, retention and challenge procedures before launch.",
      },
    ],
    sampleContext: {
      name: "Prize nominations and jury packet desk — fictional demonstration",
      scope:
        "A hypothetical planning exercise only. No actual program, participant, reviewer, funding commitment or field result exists.",
      period: "Illustrative planning cycle",
      authority:
        "No operating institution is represented. Responsible people must resolve the readiness checklist independently.",
      privacy:
        "Use project codes, role placeholders and public sources. No personal histories, private finances, contact details or sensitive applicant information.",
    },
  },
  "charitology-fellowship": {
    id: "charitology-fellowship",
    title: "Fellowship project and learning desk",
    purpose:
      "Design a cohort curriculum, record public project proposals, plan milestones and prepare transparent review and support discussions.",
    limits:
      "This software does not recruit or select people, offer a stipend, establish employment, award a fellowship or verify competence. Use project codes and role placeholders; omit sensitive applicant information.",
    context: [
      {
        key: "name",
        label: "Fellowship planning cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "scope",
        label: "Open questions, intended outputs and support model",
        kind: "textarea",
        optional: false,
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "authority",
        label:
          "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "projects",
        label: "Project proposals and scope",
        singular: "project proposal",
        description:
          "Describe the work, evidence and support needs. Do not create personal applicant profiles.",
        fields: [
          {
            key: "title",
            label: "Anonymous project code",
            kind: "text",
            optional: false,
          },
          {
            key: "question",
            label: "Open problem and proposed contribution",
            kind: "textarea",
            optional: false,
          },
          {
            key: "method",
            label: "Methods, access, limitations and ethics questions",
            kind: "textarea",
            optional: false,
          },
          {
            key: "output",
            label: "Public output, license and reproducibility plan",
            kind: "textarea",
            optional: false,
          },
          {
            key: "support",
            label:
              "Supervision roles and resources, without private personal details",
            kind: "textarea",
            optional: false,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional project F-01",
            question:
              "Develop a documented method for a bounded depth census; no finding exists.",
            method:
              "Scope public data and missing coverage; seek independent guidance for any participation.",
            output:
              "A reproducible protocol and limitations memo, not a verified global estimate.",
            support:
              "A methods mentor and community-review role would be needed; none appointed.",
            source: "",
            status: "Draft",
          },
        ],
      },
      {
        key: "curriculum",
        label: "Curriculum and facilitated sessions",
        singular: "learning session",
        description:
          "Plan learning goals and activities rather than claiming professional accreditation.",
        fields: [
          {
            key: "title",
            label: "Unit title",
            kind: "text",
            optional: false,
          },
          {
            key: "objective",
            label: "Question and learning objective",
            kind: "textarea",
            optional: false,
          },
          {
            key: "activity",
            label: "Reading, practice and facilitated discussion",
            kind: "textarea",
            optional: false,
          },
          {
            key: "output",
            label: "Worked output and feedback method",
            kind: "textarea",
            optional: false,
          },
          {
            key: "role",
            label: "Facilitating role",
            kind: "text",
            optional: true,
          },
          {
            key: "date",
            label: "Provisional session date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            label: "Session state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Materials prepared",
              "Discussion planned",
              "Local learning notes recorded",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional unit: counterfactuals and uncertainty",
            objective:
              "Distinguish an activity count from impact and name what a no-project scenario might be.",
            activity:
              "Read the textbook chapter on counterfactuals; critique a hypothetical causal chain through several moral lenses.",
            output:
              "A short causal diagram, uncertainty list and response to an opposing explanation.",
            role: "",
            date: "",
            status: "Draft",
          },
        ],
      },
      {
        key: "milestones",
        label: "Project milestones and supervision",
        singular: "milestone",
        description:
          "Milestones are project records, not credential or hiring decisions.",
        fields: [
          {
            key: "title",
            label: "Milestone",
            kind: "text",
            optional: false,
          },
          {
            key: "project",
            label: "Project code",
            kind: "text",
            optional: false,
          },
          {
            key: "deliverable",
            label: "Deliverable and review criteria",
            kind: "textarea",
            optional: false,
          },
          {
            key: "feedback",
            label:
              "Feedback, uncertainty and revisions or explicitly not reviewed",
            kind: "textarea",
            optional: false,
          },
          {
            key: "date",
            label: "Provisional review date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            label: "Milestone state",
            kind: "select",
            optional: false,
            options: [
              "Planned",
              "In progress",
              "Needs discussion",
              "Locally recorded completion",
              "Closed",
            ],
            value: "Planned",
          },
        ],
        sample: [
          {
            title: "Fictional milestone FM-01",
            project: "F-01",
            deliverable:
              "A source search plan and an explicit list of coverage limits.",
            feedback: "Not reviewed; no supervisor appointed.",
            date: "",
            status: "Planned",
          },
        ],
      },
      {
        key: "reviews",
        label: "Public-project review and fairness notes",
        singular: "review note",
        description:
          "Human discussion of public project work only. No automatic selection or sensitive applicant attributes.",
        fields: [
          {
            key: "title",
            label: "Review reference",
            kind: "text",
            optional: false,
          },
          {
            key: "project",
            label: "Project code",
            kind: "text",
            optional: false,
          },
          {
            key: "criteria",
            label: "Prepublished work-related criteria and evidence",
            kind: "textarea",
            optional: false,
          },
          {
            key: "access",
            label: "Accessible process, missing perspectives and alternatives",
            kind: "textarea",
            optional: false,
          },
          {
            key: "conflicts",
            label: "Reviewer-role connections, recusals and independent check",
            kind: "textarea",
            optional: false,
          },
          {
            key: "reasoning",
            label: "Reasons, dissent and questions; no automated selection",
            kind: "textarea",
            optional: false,
          },
          {
            key: "next",
            label:
              "Responsible human decision and correction process still required",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional review FR-01",
            project: "F-01",
            criteria:
              "No assessment has occurred. Define feasible public outputs and support required.",
            access:
              "Invite a range of research methods and community knowledge without collecting sensitive personal data here.",
            conflicts:
              "No real reviewer appointed; interests and recusals need a process.",
            reasoning:
              "No person is assessed or selected. Discuss the project design and limitations.",
            next: "Resolve host, resources, independent criteria and safeguards before any real call.",
            status: "Draft",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Set up a real host first",
        text: "Secure resources, supervision, accessible selection rules and appropriate agreements through responsible people. This software offers no stipend or employment.",
      },
      {
        title: "Study and practice",
        text: "Connect readings to public project outputs, uncertainty and peer feedback. A completed milestone is not an independently assessed qualification.",
      },
      {
        title: "Review projects fairly",
        text: "Use public work, explicit criteria and reasoned human discussion. Keep sensitive personal attributes and individual eligibility decisions outside this notebook.",
      },
    ],
    readiness: [
      {
        title: "Governance and legal home",
        reason:
          "Identify an accountable host and seek appropriate independent review before any external operation.",
      },
      {
        title: "People, resources and permission",
        reason:
          "Confirm real roles, resources, consent and any required agreements; this software creates none.",
      },
      {
        title: "Conflicts, safeguards and correction",
        reason:
          "Set independent review, recusal, access, retention and challenge procedures before launch.",
      },
    ],
    sampleContext: {
      name: "Fellowship project and learning desk — fictional demonstration",
      scope:
        "A hypothetical planning exercise only. No actual program, participant, reviewer, funding commitment or field result exists.",
      period: "Illustrative planning cycle",
      authority:
        "No operating institution is represented. Responsible people must resolve the readiness checklist independently.",
      privacy:
        "Use project codes, role placeholders and public sources. No personal histories, private finances, contact details or sensitive applicant information.",
    },
  },
  "charitology-summit": {
    id: "charitology-summit",
    title: "Summit agenda and production desk",
    purpose:
      "Design provisional working sessions, role needs, accessibility and follow-up. Export tentative local calendar blocks without announcing an event.",
    limits:
      "No summit, venue, speaker, invitation, attendee registration or recording agreement is established. Times are entered in UTC. Calendar files are tentative planning drafts, not invitations.",
    context: [
      {
        key: "name",
        label: "Summit planning title",
        kind: "text",
        optional: false,
      },
      {
        key: "scope",
        label: "Shared questions, intended participants and concrete outputs",
        kind: "textarea",
        optional: false,
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
      },
      {
        key: "authority",
        label:
          "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
      },
    ],
    collections: [
      {
        key: "sessions",
        label: "Provisional sessions and agenda",
        singular: "session",
        description:
          "Use UTC date and time. A row or calendar export does not announce a real event.",
        fields: [
          {
            key: "title",
            label: "Working session title",
            kind: "text",
            optional: false,
          },
          {
            key: "date",
            label: "Provisional UTC date",
            kind: "date",
            optional: true,
          },
          {
            key: "start",
            label: "Provisional UTC start, HH:MM",
            kind: "text",
            optional: true,
          },
          {
            key: "minutes",
            label: "Duration in minutes; blank unknown",
            kind: "number",
            optional: true,
            min: 1,
            max: 1440,
          },
          {
            key: "question",
            label: "Open problem or disagreement",
            kind: "textarea",
            optional: false,
          },
          {
            key: "format",
            label: "Facilitation, participation and disagreement format",
            kind: "textarea",
            optional: false,
          },
          {
            key: "output",
            label: "Written output and follow-up owner role",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Planning state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs host",
              "Tentative internal plan",
              "Cancelled",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional working session: missing feedback",
            date: "2027-01-15",
            start: "15:00",
            minutes: "60",
            question:
              "How could a hypothetical service close its feedback loop?",
            format:
              "Small group critique with written and anonymous contribution options; no participants invited.",
            output:
              "A draft test and list of unresolved questions; role owner not appointed.",
            status: "Draft",
          },
        ],
      },
      {
        key: "roles",
        label: "Speaker and facilitation role placeholders",
        singular: "role requirement",
        description:
          "Keep names and invitations outside the planning example. A placeholder is not a confirmed speaker.",
        fields: [
          {
            key: "title",
            label: "Role placeholder",
            kind: "text",
            optional: false,
          },
          {
            key: "session",
            label: "Session reference",
            kind: "text",
            optional: false,
          },
          {
            key: "contribution",
            label: "Perspective or expertise to seek",
            kind: "textarea",
            optional: false,
          },
          {
            key: "access",
            label: "Participation support, consent and recording needs",
            kind: "textarea",
            optional: false,
          },
          {
            key: "status",
            label: "Role planning state",
            kind: "select",
            optional: false,
            options: [
              "Placeholder only",
              "Invitation process needed",
              "Response not recorded",
              "Role no longer needed",
            ],
            value: "Placeholder only",
          },
        ],
        sample: [
          {
            title: "Fictional community-informed facilitation role",
            session: "Missing feedback session",
            contribution:
              "Seek perspectives from people affected by the question; nobody has been contacted.",
            access:
              "Resolve compensation, language, access and permission before inviting participation.",
            status: "Placeholder only",
          },
        ],
      },
      {
        key: "production",
        label: "Access and production checks",
        singular: "production check",
        description:
          "A checklist is a plan; verify access and consent through the actual host.",
        fields: [
          {
            key: "title",
            label: "Production or access requirement",
            kind: "text",
            optional: false,
          },
          {
            key: "plan",
            label: "Action, alternatives and contingency",
            kind: "textarea",
            optional: false,
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
          },
          {
            key: "status",
            label: "Production state",
            kind: "select",
            optional: false,
            options: [
              "Not started",
              "Planning",
              "Needs outside confirmation",
              "Locally checked",
            ],
            value: "Not started",
          },
        ],
        sample: [
          {
            title: "Fictional recording and participation plan",
            plan: "Offer an unrecorded route, accessible written materials and a clear permission process. No actual recording is planned or authorized.",
            owner: "",
            date: "",
            status: "Not started",
          },
        ],
      },
      {
        key: "followup",
        label: "Working outputs and follow-up",
        singular: "follow-up record",
        description:
          "Record what is actually produced or explicitly state that no session has occurred.",
        fields: [
          {
            key: "title",
            label: "Output or action reference",
            kind: "text",
            optional: false,
          },
          {
            key: "session",
            label: "Session reference",
            kind: "text",
            optional: false,
          },
          {
            key: "output",
            label: "Public output, uncertainty and dissent or not yet held",
            kind: "textarea",
            optional: false,
          },
          {
            key: "action",
            label: "Next research action and responsible role",
            kind: "textarea",
            optional: false,
          },
          {
            key: "date",
            label: "Provisional follow-up",
            kind: "date",
            optional: true,
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            hint: "Use public evidence, never private documents or personal records.",
          },
          {
            key: "status",
            label: "Local workflow state",
            kind: "select",
            optional: false,
            options: [
              "Draft",
              "Needs evidence",
              "Ready for discussion",
              "Recorded decision",
              "Closed",
            ],
            value: "Draft",
          },
        ],
        sample: [
          {
            title: "Fictional follow-up S-01",
            session: "Missing feedback session",
            output:
              "No gathering has occurred. This is a placeholder for a written output and dissent.",
            action:
              "Resolve host and purpose before setting real dates or inviting people.",
            date: "",
            source: "",
            status: "Draft",
          },
        ],
      },
    ],
    guide: [
      {
        title: "Plan a working gathering",
        text: "Choose concrete research questions and outputs. Prefer an accessible online option, include disagreement and set a follow-up role for each output.",
      },
      {
        title: "Confirm before announcing",
        text: "Resolve host, legal and financial responsibility, venue or platform, accessibility, consent and recording arrangements. Role placeholders are not confirmed speakers.",
      },
      {
        title: "Calendar limits",
        text: "Enter dates and start times in UTC. The export marks every eligible session TENTATIVE and names it a planning draft. Incomplete or cancelled sessions are excluded with an explanation.",
      },
    ],
    readiness: [
      {
        title: "Host and responsibility",
        reason:
          "A real host must authorize the gathering, resources and public communication.",
      },
      {
        title: "Access, support and recording consent",
        reason:
          "Verify accessible participation, language, support and recording permissions before invitations.",
      },
      {
        title: "Venue, schedule and safeguarding",
        reason:
          "Confirm the actual platform or venue and a responsible conduct and correction process.",
      },
    ],
    sampleContext: {
      name: "Summit agenda and production desk — fictional demonstration",
      scope:
        "A hypothetical planning exercise only. No actual program, participant, reviewer, funding commitment or field result exists.",
      period: "Illustrative planning cycle",
      authority:
        "No operating institution is represented. Responsible people must resolve the readiness checklist independently.",
      privacy:
        "Use project codes, role placeholders and public sources. No personal histories, private finances, contact details or sensitive applicant information.",
    },
  },
};
