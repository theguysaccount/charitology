// src/data/program-graph-adapters.ts
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
var PROGRAM_GRAPH_ADAPTERS = freeze([
  {
    id: "partner-the-charitology-fund-v1",
    version: 1,
    program: "the-charitology-fund",
    context: [
      {
        key: "name",
        label: "Fund plan title",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Purpose, populations, moral lenses and allocation boundaries",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "budget",
        label: "Optional hypothetical planning envelope",
        kind: "number",
        optional: true,
        options: [],
        min: 0,
        max: 1e12,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "currency",
        label: "Currency for that envelope",
        kind: "text",
        optional: true,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "publicSummary",
        label: "Public purpose and readiness summary",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "proposals",
        label: "Grant proposals",
        singular: "proposal",
        description: "Describe a public activity and its evidence. A pipeline stage does not approve a grant.",
        fields: [
          {
            key: "title",
            label: "Public activity or proposal code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "mechanism",
            label: "Intended outcome, mechanism and counterfactual",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Several levels"
            ],
            min: null,
            max: null,
            value: "Unclassified",
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Requested planning amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Evidence, uncertainty and strongest objection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "voice",
            label: "Affected community input, authority and missing perspectives",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Conditional allocation proposed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "conflicts",
        label: "Conflicts and recusals",
        singular: "conflict disclosure",
        description: "Use roles and proposal codes. A local record is not an independent clearance.",
        fields: [
          {
            key: "title",
            label: "Disclosure reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "proposal",
            label: "Proposal or allocation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "role",
            label: "Review role; no private personal information",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "connection",
            label: "Relevant public connection or explicit unknown",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "response",
            label: "Recusal, separation of duties and independent check needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "allocations",
        label: "Conditional allocation decisions",
        singular: "allocation",
        description: "These are reversible local records, never a transfer instruction or promise to a recipient.",
        fields: [
          {
            key: "title",
            label: "Allocation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "proposal",
            label: "Proposal reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Conditional amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "rationale",
            label: "Public reasoning, alternatives and dissent",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conditions",
            label: "Unmet readiness, evidence and authorization conditions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Local review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
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
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "ledger",
        label: "Nonpayment authorization ledger",
        singular: "ledger entry",
        description: "Track planned authorizations separately from gifts received, cash balances and payments. This ledger records none of those.",
        fields: [
          {
            key: "title",
            label: "Ledger reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "allocation",
            label: "Allocation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Planned authorization amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Planning entry state",
            kind: "select",
            optional: false,
            options: ["Planned", "Conditional", "Cancelled"],
            min: null,
            max: null,
            value: "Planned",
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Public explanation and unresolved conditions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "6c35d45e777bb1f972c177d579330ce6733c60a3972886cfcab7adbc2ae61d2d"
  },
  {
    id: "partner-charity-incubator-v1",
    version: 1,
    program: "charity-incubator",
    context: [
      {
        key: "name",
        label: "Incubator cycle title",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Scope, populations and what would count as a genuine gap",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "gaps",
        label: "Gap and existing-work checks",
        singular: "gap check",
        description: "Missing from this notebook never means nobody is doing the work.",
        fields: [
          {
            key: "title",
            label: "Gap question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "need",
            label: "Need, coverage and evidence limitations",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "search",
            label: "Public registries, search terms, dates and community-led sources",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "existing",
            label: "Existing work, partnership options and duplication risk",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "next",
            label: "Next independent check and who should shape it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "projects",
        label: "Cohort projects and stages",
        singular: "project",
        description: "Track project codes and role needs, not sensitive founder profiles.",
        fields: [
          {
            key: "title",
            label: "Project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "gap",
            label: "Gap reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "model",
            label: "Theory of change, alternative delivery routes and stop rule",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Discovery",
            hint: null,
            maxLength: 500
          },
          {
            key: "roles",
            label: "Role placeholders, capacity and support needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "governance",
            label: "Decision authority, conflicts, access and consent",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Next review",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "experiments",
        label: "Experiments and learning",
        singular: "experiment",
        description: "Write decision rules before results. Negative and inconclusive observations belong in the record.",
        fields: [
          {
            key: "title",
            label: "Experiment reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "hypothesis",
            label: "Hypothesis and causal link to test",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "design",
            label: "Population, comparison, outcome, consent and safeguards",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "threshold",
            label: "Success, stop and revision rules; limits of detection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "finding",
            label: "Observed result, uncertainty or explicitly not run",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "milestones",
        label: "Milestones and hand-off",
        singular: "milestone",
        description: "Describe a deliverable and the evidence needed to accept it.",
        fields: [
          {
            key: "title",
            label: "Milestone",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "acceptance",
            label: "Public deliverable and acceptance evidence",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Planned",
            hint: null,
            maxLength: 500
          },
          {
            key: "next",
            label: "Hand-off, merger or closure plan",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "eded5ab6727d9def42321ff1551fa22329f2281863ffdb60bb95a6efde697656"
  },
  {
    id: "partner-question-bounties-v1",
    version: 1,
    program: "question-bounties",
    context: [
      {
        key: "name",
        label: "Bounty planning cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Open problem, public value and what the question leaves out",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "specifications",
        label: "Question specifications",
        singular: "specification",
        description: "Make partial, negative and disputed results legible before any public call.",
        fields: [
          {
            key: "title",
            label: "Bounty question code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Exact question and open-problem link",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "acceptance",
            label: "Evidence, reproducibility and acceptance criteria",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "partial",
            label: "Partial-result and null-result rules",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "appeal",
            label: "Conflicts, appeal, withdrawal and correction process",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "amount",
            label: "Illustrative target amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "pledges",
        label: "Unverified conditional pledges",
        singular: "pledge record",
        description: "A pledge is not money received, available cash or a payment obligation.",
        fields: [
          {
            key: "title",
            label: "Pledge reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "bounty",
            label: "Bounty code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "role",
            label: "Public institution or role placeholder",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Conditional amount; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "conditions",
            label: "Conditions and verification still needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Pledge state",
            kind: "select",
            optional: false,
            options: [
              "Illustrative only",
              "Unverified conditional",
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Illustrative only",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "claims",
        label: "Evidence submissions and claims",
        singular: "claim",
        description: "Use public work or project codes; do not collect personal applications.",
        fields: [
          {
            key: "title",
            label: "Claim code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "bounty",
            label: "Bounty code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "result",
            label: "Claim, methods and reproducible materials or explicitly not supplied",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "Limits, objections, missing perspectives and permissions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "decisions",
        label: "Review and conditional awards",
        singular: "decision packet",
        description: "Record reasons against published criteria. There is no automatic eligibility, winner score or payment.",
        fields: [
          {
            key: "title",
            label: "Decision reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "claim",
            label: "Claim and bounty references",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "criteria",
            label: "Criteria applied, public evidence and unresolved disagreements",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conflicts",
            label: "Reviewer-role interests, recusals and independent checks",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "amount",
            label: "Conditional award proposal; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "currency",
            label: "Currency or unit",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "conditions",
            label: "Unmet legal, funding and appeal conditions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "ae04bedb847405ebed5513309da655f5c1f0021c7f67649faed2f49d0559a212"
  },
  {
    id: "partner-the-charitology-prize-v1",
    version: 1,
    program: "the-charitology-prize",
    context: [
      {
        key: "name",
        label: "Prize planning cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Purpose, public-work categories and recognition hypothesis",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "criteria",
        label: "Categories and criteria",
        singular: "criterion",
        description: "Test the criteria before using them. Criteria can remain disputed.",
        fields: [
          {
            key: "title",
            label: "Criterion or category",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "definition",
            label: "What evidence would satisfy it?",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "risks",
            label: "Gaming, excluded work and fairness risks",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "challenge",
            label: "Strongest objection and revision process",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "nominations",
        label: "Public work nominations",
        singular: "nomination",
        description: "Nominate research, methods, tools or failure reports. Do not rank people or whole organizations.",
        fields: [
          {
            key: "title",
            label: "Public work title or nomination code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "category",
            label: "Proposed category",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
          },
          {
            key: "contribution",
            label: "What the published work adds, with evidence and limits",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "voice",
            label: "Consent, attribution, missing voices and community protections",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "objection",
            label: "Strongest case against recognition",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
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
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "nomination",
            label: "Nomination reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "role",
            label: "Proposed jury role",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "connection",
            label: "Relevant connection or explicit unknown",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "response",
            label: "Recusal, independent check and record of dissent",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "deliberations",
        label: "Jury deliberation packets",
        singular: "deliberation",
        description: "Prepare reasons and dissent for a human process. A local status does not confer an award.",
        fields: [
          {
            key: "title",
            label: "Deliberation reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "nomination",
            label: "Nomination and criterion references",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Evidence considered and unresolved checks",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "reasons",
            label: "Reasoning, counterarguments and alternatives",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "dissent",
            label: "Dissent and response, including unknown",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "authorization",
            label: "Who would authorize publication, appeal and correction?",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Withdrawn"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "292cc4b7776c5845b64dc1caaa66d41b652ae854902dd965ada283af97b9d25b"
  },
  {
    id: "partner-charitology-fellowship-v1",
    version: 1,
    program: "charitology-fellowship",
    context: [
      {
        key: "name",
        label: "Fellowship planning cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Open questions, intended outputs and support model",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "projects",
        label: "Project proposals and scope",
        singular: "project proposal",
        description: "Describe the work, evidence and support needs. Do not create personal applicant profiles.",
        fields: [
          {
            key: "title",
            label: "Anonymous project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Open problem and proposed contribution",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "method",
            label: "Methods, access, limitations and ethics questions",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "output",
            label: "Public output, license and reproducibility plan",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "support",
            label: "Supervision roles and resources, without private personal details",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "curriculum",
        label: "Curriculum and facilitated sessions",
        singular: "learning session",
        description: "Plan learning goals and activities rather than claiming professional accreditation.",
        fields: [
          {
            key: "title",
            label: "Unit title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "objective",
            label: "Question and learning objective",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "activity",
            label: "Reading, practice and facilitated discussion",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "output",
            label: "Worked output and feedback method",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "role",
            label: "Facilitating role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Provisional session date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
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
              "Local learning notes recorded"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "milestones",
        label: "Project milestones and supervision",
        singular: "milestone",
        description: "Milestones are project records, not credential or hiring decisions.",
        fields: [
          {
            key: "title",
            label: "Milestone",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "deliverable",
            label: "Deliverable and review criteria",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "feedback",
            label: "Feedback, uncertainty and revisions or explicitly not reviewed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Provisional review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Planned",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "reviews",
        label: "Public-project review and fairness notes",
        singular: "review note",
        description: "Human discussion of public project work only. No automatic selection or sensitive applicant attributes.",
        fields: [
          {
            key: "title",
            label: "Review reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "project",
            label: "Project code",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "criteria",
            label: "Prepublished work-related criteria and evidence",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "access",
            label: "Accessible process, missing perspectives and alternatives",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conflicts",
            label: "Reviewer-role connections, recusals and independent check",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "reasoning",
            label: "Reasons, dissent and questions; no automated selection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "next",
            label: "Responsible human decision and correction process still required",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "f7ab921a507d504981d40f8b31641aacdc6f47f90461c1747f1db742bcdce46b"
  },
  {
    id: "partner-charitology-summit-v1",
    version: 1,
    program: "charitology-summit",
    context: [
      {
        key: "name",
        label: "Summit planning title",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "scope",
        label: "Shared questions, intended participants and concrete outputs",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period or review cycle",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "authority",
        label: "Who could authorize operation, and what is not authorized here?",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundaries, access and deletion plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "sessions",
        label: "Provisional sessions and agenda",
        singular: "session",
        description: "Use UTC date and time. A row or calendar export does not announce a real event.",
        fields: [
          {
            key: "title",
            label: "Working session title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Provisional UTC date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "start",
            label: "Provisional UTC start, HH:MM",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "minutes",
            label: "Duration in minutes; blank unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 1,
            max: 1440,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Open problem or disagreement",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "format",
            label: "Facilitation, participation and disagreement format",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "output",
            label: "Written output and follow-up owner role",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Cancelled"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "roles",
        label: "Speaker and facilitation role placeholders",
        singular: "role requirement",
        description: "Keep names and invitations outside the planning example. A placeholder is not a confirmed speaker.",
        fields: [
          {
            key: "title",
            label: "Role placeholder",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "session",
            label: "Session reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "contribution",
            label: "Perspective or expertise to seek",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "access",
            label: "Participation support, consent and recording needs",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Role no longer needed"
            ],
            min: null,
            max: null,
            value: "Placeholder only",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "production",
        label: "Access and production checks",
        singular: "production check",
        description: "A checklist is a plan; verify access and consent through the actual host.",
        fields: [
          {
            key: "title",
            label: "Production or access requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "plan",
            label: "Action, alternatives and contingency",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
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
              "Locally checked"
            ],
            min: null,
            max: null,
            value: "Not started",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "followup",
        label: "Working outputs and follow-up",
        singular: "follow-up record",
        description: "Record what is actually produced or explicitly state that no session has occurred.",
        fields: [
          {
            key: "title",
            label: "Output or action reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "session",
            label: "Session reference",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "output",
            label: "Public output, uncertainty and dissent or not yet held",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "action",
            label: "Next research action and responsible role",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Provisional follow-up",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Use public evidence, never private documents or personal records.",
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "5bdd5fbdbae4c21f85a7c02d2df85c57e32551b89c29ad37047050a79bdcece9"
  },
  {
    id: "partner-donor-advisory-v1",
    version: 1,
    program: "donor-advisory",
    context: [
      {
        key: "name",
        label: "Plan title or project alias",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "decision",
        label: "Decision to prepare and who has authority to decide",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "values",
        label: "Values, moral lenses and disagreements to preserve",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "constraints",
        label: "Commitments, access needs, restrictions and nonnegotiable constraints",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "amount",
        label: "Optional hypothetical planning amount; blank means unknown",
        kind: "number",
        optional: true,
        options: [],
        min: 0,
        max: 1e12,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "currency",
        label: "Currency or planning unit",
        kind: "text",
        optional: true,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "horizon",
        label: "Giving period and decision checkpoint",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "privacy",
        label: "What may be recorded or shared, and when to delete it",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "conflicts",
        label: "Potential conflicts, referral interests and who must review them",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      }
    ],
    collections: [
      {
        key: "questions",
        label: "Intake and unresolved choices",
        singular: "intake question",
        description: "Start with what the donor wants to understand. A recorded answer is the user’s account, not independent verification or consent from other decision-makers.",
        fields: [
          {
            key: "title",
            label: "Question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "topic",
            label: "Topic",
            kind: "select",
            optional: false,
            options: [
              "Values and disagreement",
              "Timing",
              "Near and far",
              "Restrictions and flexibility",
              "Decision authority",
              "Privacy and access",
              "Professional referral"
            ],
            min: null,
            max: null,
            value: "Values and disagreement",
            hint: null,
            maxLength: 500
          },
          {
            key: "answer",
            label: "Current answer, including unknowns",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "alternatives",
            label: "Other perspectives or choices still open",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "next",
            label: "What would resolve the question, and whose input is needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "options",
        label: "Alternative giving scenarios",
        singular: "scenario",
        description: "Scenarios are alternatives, not allocations to add together. No score, optimal portfolio, payout rule or named-charity ranking is calculated.",
        fields: [
          {
            key: "title",
            label: "Scenario title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "mechanism",
            label: "Proposed activity, who may benefit and how change might happen",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "depth",
            label: "Activity depth (hypothesis, never a grade)",
            kind: "select",
            optional: false,
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels"
            ],
            min: null,
            max: null,
            value: "Unclassified",
            hint: null,
            maxLength: 500
          },
          {
            key: "place",
            label: "Near/far scope and reason for choosing it",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "amount",
            label: "Hypothetical amount for this scenario; blank means unknown",
            kind: "number",
            optional: true,
            options: [],
            min: 0,
            max: 1e12,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "timing",
            label: "Timing and conditions before committing",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "fit",
            label: "How it fits the stated values and constraints",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "tradeoffs",
            label: "What it displaces, possible harms and the strongest objection",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "unknowns",
            label: "Missing evidence and what could change the choice",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "evidence",
        label: "Evidence and due-diligence questions",
        singular: "evidence note",
        description: "Attach a specific claim to its source and scope. A public report does not verify an entire organization. No private due-diligence files belong here.",
        fields: [
          {
            key: "title",
            label: "Claim or question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "scenario",
            label: "Related scenario",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Basis of this claim",
            kind: "select",
            optional: false,
            options: [
              "Unknown or not checked",
              "Public description only",
              "Observational evidence",
              "Causal study",
              "Mixed or disputed",
              "Hypothesis"
            ],
            min: null,
            max: null,
            value: "Unknown or not checked",
            hint: null,
            maxLength: 500
          },
          {
            key: "finding",
            label: "What the source supports, or what remains to be found",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "Population, period, counterfactual, conflicts and transfer limits",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "checked",
            label: "Date you checked the source",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "next",
            label: "Next check or question for a qualified reviewer",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      },
      {
        key: "followup",
        label: "Decisions and follow-up",
        singular: "decision checkpoint",
        description: "Record a decision in the user’s own words and how it will be revisited. “Recorded decision” is a local label; it is no payment authorization, advisor approval or external commitment.",
        fields: [
          {
            key: "title",
            label: "Decision or checkpoint",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "decision",
            label: "Choice, reasons and dissent; state explicitly if still undecided",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "conditions",
            label: "Evidence or professional checks required before action",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible role, without a personal name",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Next review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "learning",
            label: "Feedback sought, possible unwanted effects and change/stop rule",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "25b0f881b40775eff925c3907b08223a277762993838881bbeb1439b218e5e56"
  },
  {
    id: "partner-nonprofit-advisory-v1",
    version: 1,
    program: "nonprofit-advisory",
    context: [
      {
        key: "name",
        label: "Project alias",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "activity",
        label: "Activity and population in scope, without personal details",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "decision",
        label: "Decision the learning plan must inform",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "change",
        label: "Proposed change pathway, from resources to outcomes",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "baseline",
        label: "What might happen without the activity or change",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "capacity",
        label: "Staff time, skills, access and reporting constraints",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "voice",
        label: "How affected people could shape the questions and challenge conclusions",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "privacy",
        label: "Public-information boundary, access and retention plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "period",
        label: "Planning period and review checkpoint",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      }
    ],
    collections: [
      {
        key: "diagnostics",
        label: "Diagnostic questions",
        singular: "diagnostic note",
        description: "Inspect the system around an activity. A gap in this notebook does not prove that an organization lacks the practice, and no organizational score is produced.",
        fields: [
          {
            key: "title",
            label: "Decision-relevant question",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "area",
            label: "Area",
            kind: "select",
            optional: false,
            options: [
              "Outcomes and causal pathway",
              "Evidence and comparison",
              "Full costs and capacity",
              "Voice and access",
              "Reporting burden",
              "Governance and incentives"
            ],
            min: null,
            max: null,
            value: "Outcomes and causal pathway",
            hint: null,
            maxLength: 500
          },
          {
            key: "current",
            label: "Current practice and basis for describing it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "gap",
            label: "Unknowns, rival explanations or constraints",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "consequence",
            label: "How this affects the decision and who might bear the cost",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "depth",
            label: "Activity depth (hypothesis, never a grade)",
            kind: "select",
            optional: false,
            options: [
              "Unclassified",
              "0 Relief",
              "1 Repair",
              "2 Prevention",
              "3 Structure",
              "4 Source",
              "Several levels"
            ],
            min: null,
            max: null,
            value: "Unclassified",
            hint: null,
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "evidence",
        label: "Evidence and full-cost notebook",
        singular: "evidence note",
        description: "Keep effects, outputs and costs separate. Cost entries need a period, currency and allocation basis; overhead shares are not an outcome score.",
        fields: [
          {
            key: "title",
            label: "Evidence question or cost item",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "type",
            label: "Record type",
            kind: "select",
            optional: false,
            options: [
              "Outcome evidence",
              "Output description",
              "Cost or capacity assumption",
              "Feedback and access",
              "Rival explanation"
            ],
            min: null,
            max: null,
            value: "Outcome evidence",
            hint: null,
            maxLength: 500
          },
          {
            key: "measure",
            label: "Measure, unit, denominator and period",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "finding",
            label: "Finding or assumption, explicitly stating unknowns",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Basis of this claim",
            kind: "select",
            optional: false,
            options: [
              "Unknown or not checked",
              "Public description only",
              "Observational evidence",
              "Causal study",
              "Mixed or disputed",
              "Hypothesis"
            ],
            min: null,
            max: null,
            value: "Unknown or not checked",
            hint: null,
            maxLength: 500
          },
          {
            key: "method",
            label: "Source, comparison or allocation method; whose time and costs count",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "Missing costs, bias, consent and limits on interpretation",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "checked",
            label: "Source checked on",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "actions",
        label: "Proportionate action plan",
        singular: "action",
        description: "Choose changes that serve a stated decision. Record the burden and an observable completion criterion; a local “Done” label is not an independent sign-off.",
        fields: [
          {
            key: "title",
            label: "Action",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "diagnostic",
            label: "Diagnostic question addressed",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "steps",
            label: "Smallest feasible next step, dependencies and support needed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "burden",
            label: "Time, cost, access and reporting burden; what will be stopped to make room",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "complete",
            label: "Completion evidence and who should review it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Task status",
            kind: "select",
            optional: false,
            options: ["To do", "In progress", "Blocked", "Done"],
            min: null,
            max: null,
            value: "To do",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "learning",
        label: "Learning and adaptation checkpoints",
        singular: "learning checkpoint",
        description: "Plan what evidence would support continuing, adapting or stopping. Before/after differences and positive feedback alone do not establish causation.",
        fields: [
          {
            key: "title",
            label: "Learning decision",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "outcome",
            label: "Outcome, population, unit and time horizon",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "method",
            label: "Proportionate method, comparison and alternative explanations",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "rule",
            label: "What would support continuing, changing or stopping; how uncertainty affects the rule",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "feedback",
            label: "How aggregate feedback, disagreement and possible harm will be considered",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "result",
            label: "What is known now, and the next question",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
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
              "Closed"
            ],
            min: null,
            max: null,
            value: "Draft",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "8092fd8b1de272db6d1bfc1318066b058cc8b8dedbd17fc5d0e0ca8c0b71fc87"
  },
  {
    id: "partner-field-verification-v1",
    version: 1,
    program: "field-verification",
    context: [
      {
        key: "name",
        label: "Protocol title and version",
        kind: "text",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 500
      },
      {
        key: "question",
        label: "Reported claim and verification question",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "scope",
        label: "Site types, period and boundaries; omit identifying locations",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "sampling",
        label: "Sampling frame, selection rule, exclusions and limits of coverage",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "method",
        label: "Checks, comparison sources and what they could establish",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "independence",
        label: "Local partner roles, funding, conflicts and independence",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "consent",
        label: "Consent, access, ethics review and stop conditions still required",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
      },
      {
        key: "publication",
        label: "Aggregate publication, correction, right of response and retention plan",
        kind: "textarea",
        optional: false,
        options: [],
        min: null,
        max: null,
        value: null,
        hint: null,
        maxLength: 5e3
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
          "Closed"
        ],
        min: null,
        max: null,
        value: "Draft",
        hint: null,
        maxLength: 500
      }
    ],
    collections: [
      {
        key: "checks",
        label: "Claim and evidence checklist",
        singular: "planned check",
        description: "A check must state both what it could establish and what remains outside its reach. No checklist entry means an actual site has been visited or a claim verified.",
        fields: [
          {
            key: "title",
            label: "Check identifier and title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "claim",
            label: "Specific reported claim, unit and period",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "method",
            label: "Evidence sought and how it would be checked",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "sampling",
            label: "Eligible sites, selection rule, exclusions and nonresponse",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "limits",
            label: "What this check could not establish; rival explanations",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "stop",
            label: "Access, consent or safety condition that stops the check",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Check state",
            kind: "select",
            optional: false,
            options: [
              "Planned only",
              "Blocked pending safeguards",
              "User note entered — unverified",
              "Needs further check",
              "Closed locally"
            ],
            min: null,
            max: null,
            value: "Planned only",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "findings",
        label: "Findings and uncertainty log",
        singular: "finding note",
        description: "Use aggregate, nonidentifying notes only. “User note entered” is never an independent finding by Charitology. Keep observations, reported accounts and interpretations separate.",
        fields: [
          {
            key: "title",
            label: "Finding identifier and title",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "check",
            label: "Related check identifier",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "kind",
            label: "Basis",
            kind: "select",
            optional: false,
            options: [
              "No observation — planning example",
              "Aggregate user-entered observation",
              "Public document comparison",
              "Conflicting sources",
              "Unable to check"
            ],
            min: null,
            max: null,
            value: "No observation — planning example",
            hint: null,
            maxLength: 500
          },
          {
            key: "observed",
            label: "What was observed or found; explicitly state if nothing was checked",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "interpretation",
            label: "Interpretation, competing explanations and confidence limits",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "coverage",
            label: "Scope, missingness and who or what is not represented",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Observation or source-check date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Review state",
            kind: "select",
            optional: false,
            options: [
              "Draft — unverified",
              "Needs evidence",
              "Awaiting response",
              "Ready for discussion",
              "Closed locally"
            ],
            min: null,
            max: null,
            value: "Draft — unverified",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "safeguards",
        label: "Safeguards and unresolved permissions",
        singular: "safeguard",
        description: "This log prepares a review. Marking a safeguard complete records the user’s statement; it does not supply ethical approval, lawful authority, informed consent or safety clearance.",
        fields: [
          {
            key: "title",
            label: "Risk or permission to resolve",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "risk",
            label: "Who could bear a burden or face harm; use no identifying detail",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "control",
            label: "Preventive measure, accessible alternative and escalation route",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "stop",
            label: "Stop rule and who may invoke it without penalty",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "owner",
            label: "Responsible qualified role",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "evidence",
            label: "Evidence of review or why it remains unresolved; no confidential attachments",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "status",
            label: "Safeguard state",
            kind: "select",
            optional: false,
            options: [
              "Unresolved — do not proceed",
              "Under review",
              "User records a resolution",
              "Needs recheck"
            ],
            min: null,
            max: null,
            value: "Unresolved — do not proceed",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "responses",
        label: "Response and correction log",
        singular: "response note",
        description: "Plan a fair opportunity to respond and correct errors. Enter only public or explicitly shareable aggregate text; this software does not contact anyone or publish a response.",
        fields: [
          {
            key: "title",
            label: "Response or correction identifier",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "finding",
            label: "Related finding identifier",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "question",
            label: "Claim, uncertainty or correction to put to the relevant role",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "response",
            label: "Public/shareable response, or explicit statement that none has been sought",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "provenance",
            label: "How the response is attributed and permission to quote checked; no private identities",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "change",
            label: "What changes, what remains disputed and what could resolve it",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          },
          {
            key: "date",
            label: "Agreed response checkpoint",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Response state",
            kind: "select",
            optional: false,
            options: [
              "Not sought",
              "Planned",
              "User-entered response — unverified",
              "Correction pending",
              "Closed locally"
            ],
            min: null,
            max: null,
            value: "Not sought",
            hint: null,
            maxLength: 500
          }
        ]
      },
      {
        key: "actions",
        label: "Corrective actions and rechecks",
        singular: "action",
        description: "Track a proposed change, the role responsible and the evidence needed to close it. No external task, reminder, enforcement or follow-up visit is created.",
        fields: [
          {
            key: "title",
            label: "Task or unresolved requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "date",
            label: "Review date",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Task status",
            kind: "select",
            optional: false,
            options: ["To do", "In progress", "Blocked", "Done"],
            min: null,
            max: null,
            value: "To do",
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence of completion or next step",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      },
      {
        key: "readiness",
        label: "Institutional readiness and outside authorization",
        singular: "readiness check",
        description: "Track prerequisites separately from the working software. A local checkbox or record is not legal, funding, ethical or independent approval.",
        fields: [
          {
            key: "title",
            label: "Requirement",
            kind: "text",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "owner",
            label: "Responsible role",
            kind: "text",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "status",
            label: "Readiness record",
            kind: "select",
            optional: false,
            options: [
              "Not established",
              "Needs outside review",
              "Evidence recorded locally",
              "Needs revision"
            ],
            min: null,
            max: null,
            value: "Not established",
            hint: null,
            maxLength: 500
          },
          {
            key: "source",
            label: "Public HTTPS evidence source",
            kind: "url",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: "Public sources only. No private files, contact details or personal histories.",
            maxLength: 500
          },
          {
            key: "date",
            label: "Next check",
            kind: "date",
            optional: true,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 500
          },
          {
            key: "notes",
            label: "Evidence, authority and what remains unconfirmed",
            kind: "textarea",
            optional: false,
            options: [],
            min: null,
            max: null,
            value: null,
            hint: null,
            maxLength: 5e3
          }
        ]
      }
    ],
    hash: "86c84be22a760c535af0e888a2ddacedce9190bba5af4a4bae9e0552c1f4f56e"
  }
]);

// src/lib/client/remaining-record-recovery-schemas.ts
var RRDataError = class extends Error {
  code;
  path;
  constructor(message, path = "$", code = "invalid_data") {
    super(`${message} (${path})`);
    this.name = "RRDataError";
    this.code = code;
    this.path = path;
  }
};
function rrFail(message, path = "$") {
  throw new RRDataError(message, path);
}
var RR_KEYS = Object.freeze([
  "charitology.research-program.moral-frameworks-program.v1",
  "charitology.research-program.methods-lab.v1",
  "charitology.research-program.cause-census.v1",
  "charitology.research-program.evidence-reviews.v1",
  "charitology.research-program.replication-program.v1",
  "charitology.research-program.failure-lab.v1",
  "charitology.research-program.history-of-charity.v1",
  "charitology-manuscript-v1",
  "charitology-nominations-v1",
  "charitology-depth-census-v1",
  "charitology-country-notes-v1",
  "charitology.partner-workspace-v1.the-charitology-fund",
  "charitology.partner-workspace-v1.charity-incubator",
  "charitology.partner-workspace-v1.question-bounties",
  "charitology.partner-workspace-v1.the-charitology-prize",
  "charitology.partner-workspace-v1.charitology-fellowship",
  "charitology.partner-workspace-v1.charitology-summit",
  "charitology.partner-workspace-v1.donor-advisory",
  "charitology.partner-workspace-v1.nonprofit-advisory",
  "charitology.partner-workspace-v1.field-verification"
]);
function isRemainingRecordKey(key) {
  return typeof key === "string" && RR_KEYS.includes(key);
}
function requireRemainingRecordKey(key) {
  if (!isRemainingRecordKey(key)) rrFail("Unknown remaining-record key");
}
function remainingRecordCapacity(key) {
  requireRemainingRecordKey(key);
  const nativeBytes = key.startsWith("charitology.research-program.") ? 32e6 : key.startsWith("charitology.partner-workspace-v1.") ? 8e6 : key === "charitology-manuscript-v1" ? 1e6 : key === "charitology-nominations-v1" ? 24e6 : key === "charitology-depth-census-v1" ? 32e6 : 48e6;
  return Object.freeze({
    nativeBytes,
    rawArchiveBytes: 128e6,
    formArchiveBytes: 1e6,
    jsonDepth: 32,
    fileReadTimeoutMs: 3e4,
    autosaveDelayMs: 250
  });
}
var RR_RESEARCH_SCHEMAS = freezeOwned({
  "moral-frameworks-program": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "first",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system"
        ]
      },
      {
        key: "second",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system"
        ]
      },
      {
        key: "weight_welfare",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_rights",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_justice",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_care",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_tradition",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_future",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_nature",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "weight_flourishing",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 5
      },
      {
        key: "reasons",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "disagreement",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: false,
        maxLength: 8e3
      },
      {
        key: "correction",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "methods-lab": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "problem",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "unit",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "horizon",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "currency",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "method",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "cash",
          "advocacy",
          "research",
          "mutual-aid",
          "volunteering",
          "investing",
          "prizes"
        ]
      },
      {
        key: "chain",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "costLow",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "costHigh",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "probabilityLow",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 100
      },
      {
        key: "probabilityHigh",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0,
        max: 100
      },
      {
        key: "unitsLow",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "unitsHigh",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "assumptions",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: false,
        maxLength: 8e3
      },
      {
        key: "harm",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "cause-census": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "cause",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "global-health",
          "extreme-poverty",
          "hunger",
          "climate",
          "nature",
          "animals",
          "education",
          "mental-health",
          "housing",
          "democracy",
          "peace",
          "catastrophic-risk",
          "science",
          "community",
          "arts",
          "faith",
          "charity-system"
        ]
      },
      {
        key: "scope",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "metric",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: ["scale", "spending", "solvability", "depth", "other"]
      },
      {
        key: "value",
        kind: "number",
        required: false,
        maxLength: 8e3,
        min: 0
      },
      {
        key: "unit",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "year",
        kind: "number",
        required: true,
        maxLength: 8e3,
        min: 1900,
        max: 2200,
        integer: true
      },
      {
        key: "uncertainty",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "location",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "framework",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "depth",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "check",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "evidence-reviews": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "population",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "intervention",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "outcome",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "search",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "inclusion",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "selection",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "design",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "randomized",
          "quasi",
          "observational",
          "qualitative",
          "systematic",
          "other"
        ]
      },
      {
        key: "sample",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "effect",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "bias",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "transfer",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "conflicts",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      },
      {
        key: "synthesis",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "replication-program": {
    freeze: true,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "claim",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "kind",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: ["reproduce", "reanalyse", "direct", "context"]
      },
      {
        key: "change",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "hypotheses",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "sample",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "outcome",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "estimand",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "analysis",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "missing",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "multiple",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "access",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "ethics",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "review",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "due",
        kind: "date",
        required: false,
        maxLength: 8e3
      },
      {
        key: "amendments",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "failure-lab": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "intent",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "timeline",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "observed",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "counterfactual",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "mechanism",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "causal-chain",
          "implementation",
          "context",
          "incentives",
          "displacement",
          "measurement",
          "unknown"
        ]
      },
      {
        key: "confidence",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: ["hypothesis", "documented", "debated"]
      },
      {
        key: "lesson",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "action",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "owner",
        kind: "text",
        required: false,
        maxLength: 8e3
      },
      {
        key: "due",
        kind: "date",
        required: false,
        maxLength: 8e3
      },
      {
        key: "verification",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "result",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  },
  "history-of-charity": {
    freeze: false,
    fields: [
      {
        key: "title",
        kind: "text",
        required: true,
        maxLength: 8e3
      },
      {
        key: "first",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "carnegie-libraries",
          "dare",
          "green-revolution",
          "haiti-earthquake-reconstruction",
          "hookworm-campaign",
          "ice-bucket-challenge",
          "one-laptop-per-child",
          "oral-rehydration-therapy-spread",
          "playpumps",
          "polio-eradication",
          "rosenwald-schools",
          "scared-straight",
          "smallpox-eradication"
        ]
      },
      {
        key: "second",
        kind: "select",
        required: true,
        maxLength: 8e3,
        options: [
          "carnegie-libraries",
          "dare",
          "green-revolution",
          "haiti-earthquake-reconstruction",
          "hookworm-campaign",
          "ice-bucket-challenge",
          "one-laptop-per-child",
          "oral-rehydration-therapy-spread",
          "playpumps",
          "polio-eradication",
          "rosenwald-schools",
          "scared-straight",
          "smallpox-eradication"
        ]
      },
      {
        key: "question",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "source",
        kind: "url",
        required: true,
        maxLength: 8e3
      },
      {
        key: "similar",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "different",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "missing",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "lesson",
        kind: "textarea",
        required: true,
        maxLength: 8e3
      },
      {
        key: "next",
        kind: "textarea",
        required: false,
        maxLength: 8e3
      }
    ]
  }
});
var RR_COUNTRY_CODES = Object.freeze([
  "AFG",
  "ALB",
  "DZA",
  "ASM",
  "AND",
  "AGO",
  "ATG",
  "ARG",
  "ARM",
  "ABW",
  "AUS",
  "AUT",
  "AZE",
  "BHS",
  "BHR",
  "BGD",
  "BRB",
  "BLR",
  "BEL",
  "BLZ",
  "BEN",
  "BMU",
  "BTN",
  "BOL",
  "BIH",
  "BWA",
  "BRA",
  "VGB",
  "BRN",
  "BGR",
  "BFA",
  "BDI",
  "CPV",
  "KHM",
  "CMR",
  "CAN",
  "CYM",
  "CAF",
  "TCD",
  "CHI",
  "CHL",
  "CHN",
  "COL",
  "COM",
  "COD",
  "COG",
  "CRI",
  "CIV",
  "HRV",
  "CUB",
  "CUW",
  "CYP",
  "CZE",
  "DNK",
  "DJI",
  "DMA",
  "DOM",
  "ECU",
  "EGY",
  "SLV",
  "GNQ",
  "ERI",
  "EST",
  "SWZ",
  "ETH",
  "FRO",
  "FJI",
  "FIN",
  "FRA",
  "PYF",
  "GAB",
  "GMB",
  "GEO",
  "DEU",
  "GHA",
  "GIB",
  "GRC",
  "GRL",
  "GRD",
  "GUM",
  "GTM",
  "GIN",
  "GNB",
  "GUY",
  "HTI",
  "HND",
  "HKG",
  "HUN",
  "ISL",
  "IND",
  "IDN",
  "IRN",
  "IRQ",
  "IRL",
  "IMN",
  "ISR",
  "ITA",
  "JAM",
  "JPN",
  "JOR",
  "KAZ",
  "KEN",
  "KIR",
  "PRK",
  "KOR",
  "XKX",
  "KWT",
  "KGZ",
  "LAO",
  "LVA",
  "LBN",
  "LSO",
  "LBR",
  "LBY",
  "LIE",
  "LTU",
  "LUX",
  "MAC",
  "MDG",
  "MWI",
  "MYS",
  "MDV",
  "MLI",
  "MLT",
  "MHL",
  "MRT",
  "MUS",
  "MEX",
  "FSM",
  "MDA",
  "MCO",
  "MNG",
  "MNE",
  "MAR",
  "MOZ",
  "MMR",
  "NAM",
  "NRU",
  "NPL",
  "NLD",
  "NCL",
  "NZL",
  "NIC",
  "NER",
  "NGA",
  "MKD",
  "MNP",
  "NOR",
  "OMN",
  "PAK",
  "PLW",
  "PAN",
  "PNG",
  "PRY",
  "PER",
  "PHL",
  "POL",
  "PRT",
  "PRI",
  "QAT",
  "ROU",
  "RUS",
  "RWA",
  "WSM",
  "SMR",
  "STP",
  "SAU",
  "SEN",
  "SRB",
  "SYC",
  "SLE",
  "SGP",
  "SXM",
  "SVK",
  "SVN",
  "SLB",
  "SOM",
  "ZAF",
  "SSD",
  "ESP",
  "LKA",
  "KNA",
  "LCA",
  "MAF",
  "VCT",
  "SDN",
  "SUR",
  "SWE",
  "CHE",
  "SYR",
  "TJK",
  "TZA",
  "THA",
  "TLS",
  "TGO",
  "TON",
  "TTO",
  "TUN",
  "TUR",
  "TKM",
  "TCA",
  "TUV",
  "UGA",
  "UKR",
  "ARE",
  "GBR",
  "USA",
  "URY",
  "UZB",
  "VUT",
  "VEN",
  "VNM",
  "VIR",
  "PSE",
  "YEM",
  "ZMB",
  "ZWE"
]);
var RR_PARTNER_SCHEMAS = PROGRAM_GRAPH_ADAPTERS;
var RR_MANUSCRIPT_FIELDS = Object.freeze([
  "title",
  "author",
  "summary",
  "kind",
  "question",
  "methods",
  "results",
  "limits",
  "sources"
]);
var RR_MANUSCRIPT_LIMITS = Object.freeze([
  200,
  150,
  1500,
  100,
  1e4,
  2e4,
  2e4,
  1e4,
  1e4
]);
var RR_MANUSCRIPT_KINDS = Object.freeze([
  "Proposed method",
  "Research result",
  "Replication",
  "Null result or failure report",
  "Essay"
]);
var RR_NOMINATION_FIELDS = Object.freeze([
  "title",
  "subject",
  "depth",
  "mechanism",
  "lenses",
  "evidence",
  "funding",
  "voice",
  "objection",
  "conflicts"
]);
var RR_NOMINATION_LIMITS = Object.freeze([
  180,
  180,
  100,
  5e3,
  5e3,
  1e4,
  5e3,
  5e3,
  5e3,
  3e3
]);
var RR_NOMINATION_DEPTHS = Object.freeze([
  "unknown",
  "0 · Relief",
  "1 · Repair",
  "2 · Prevention",
  "3 · Structure",
  "4 · Source",
  "Multiple levels; explain below"
]);
function freezeOwned(v) {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v))
      freezeOwned(v[k]);
    Object.freeze(v);
  }
  return v;
}
var encoder = new TextEncoder();
function copyRemainingRecordPlain(input, maxBytes = 128e6) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 128e6)
    rrFail("Invalid input bound");
  let charged = 0;
  const active = /* @__PURE__ */ new Set();
  const charge = (n, p) => {
    charged += n;
    if (charged > maxBytes)
      throw new RRDataError(
        "Remaining-record input exceeds its complete byte limit",
        p,
        "input_limit"
      );
  };
  const visit = (v, p, depth) => {
    if (depth > 32)
      throw new RRDataError(
        "Remaining-record JSON exceeds depth 32",
        p,
        "input_limit"
      );
    if (v === null) {
      charge(4, p);
      return null;
    }
    if (typeof v === "string") {
      if (v.length > maxBytes)
        throw new RRDataError("Text exceeds input bound", p, "input_limit");
      charge(encoder.encode(JSON.stringify(v)).length, p);
      return v;
    }
    if (typeof v === "boolean") {
      charge(v ? 4 : 5, p);
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) rrFail("Nonfinite number", p);
      charge(String(v).length, p);
      return v;
    }
    if (!v || typeof v !== "object") rrFail("Expected plain JSON data", p);
    if (active.has(v)) rrFail("Cyclic data", p);
    active.add(v);
    try {
      if (Array.isArray(v)) {
        const length = Object.getOwnPropertyDescriptor(v, "length")?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 2e3)
          rrFail("Array exceeds the closed producer collection bound", p);
      }
      let proto, descriptors;
      try {
        proto = Object.getPrototypeOf(v);
        descriptors = Object.getOwnPropertyDescriptors(v);
      } catch {
        return rrFail("Object cannot be inspected as plain data", p);
      }
      const keys = Reflect.ownKeys(descriptors);
      if (Array.isArray(v)) {
        if (proto !== Array.prototype) rrFail("Unsupported array prototype", p);
        const n = descriptors.length?.value;
        if (!Number.isSafeInteger(n) || n < 0 || n > maxBytes / 2)
          rrFail("Invalid array length", p);
        if (keys.length !== n + 1)
          rrFail("Sparse or decorated arrays are unsupported", p);
        charge(2 + Math.max(0, n - 1), p);
        const out2 = [];
        for (let i = 0; i < n; i++) {
          const d = descriptors[String(i)];
          if (!d || !("value" in d) || !d.enumerable)
            rrFail("Array index must be own data", `${p}[${i}]`);
          out2.push(visit(d.value, `${p}[${i}]`, depth + 1));
        }
        return out2;
      }
      if (proto !== Object.prototype) rrFail("Unsupported object prototype", p);
      const out = {};
      charge(2 + Math.max(0, keys.length - 1), p);
      for (const k of keys) {
        if (typeof k !== "string") rrFail("Symbol fields are unsupported", p);
        const d = descriptors[k];
        if (!d || !("value" in d) || !d.enumerable)
          rrFail("Object field must be own enumerable data", `${p}.${k}`);
        charge(encoder.encode(JSON.stringify(k)).length + 1, p);
        Object.defineProperty(out, k, {
          value: visit(d.value, `${p}.${k}`, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
      return out;
    } finally {
      active.delete(v);
    }
  };
  return freezeOwned(visit(input, "$", 0));
}
function rrObject(value, fields, path = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    rrFail("Expected an object", path);
  const v = value, keys = Object.keys(v);
  if (keys.length !== fields.length || fields.some((k) => !Object.hasOwn(v, k)) || keys.some((k) => !fields.includes(k)))
    rrFail("Unknown or missing field", path);
  return v;
}
function text(value, max, path, required = false) {
  if (typeof value !== "string" || value.length > max || required && !value.trim())
    rrFail("Text is missing or exceeds its field limit", path);
  return value;
}
function choice(value, choices, path) {
  if (typeof value !== "string" || !choices.includes(value))
    rrFail("Unknown exact choice", path);
}
function realDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
function rrCanonicalInstant(v, p = "$") {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v)
    rrFail("Invalid canonical UTC timestamp", p);
}
function safeUrl(s, p) {
  if (/[\u0000-\u001f\u007f-\u009f\\]/.test(s))
    rrFail("URL contains unsupported control or backslash", p);
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password)
      throw Error();
  } catch {
    rrFail("Use credential-free HTTPS", p);
  }
}
function researchForRemainingKey(key) {
  requireRemainingRecordKey(key);
  return key.startsWith("charitology.research-program.") ? key.slice(29, -3) : null;
}
function partnerForRemainingKey(key) {
  requireRemainingRecordKey(key);
  return key.startsWith("charitology.partner-workspace-v1.") ? key.slice(33) : null;
}
function remainingRecordPartnerSchema(key) {
  const program = partnerForRemainingKey(key), spec = RR_PARTNER_SCHEMAS.find((s) => s.program === program);
  if (!spec) rrFail("Key has no partner schema");
  return spec;
}
function researchField(v, f, p, draft) {
  const s = text(v, f.maxLength, p), t = s.trim();
  if (draft) return;
  if (!t) {
    if (f.required) rrFail("Required saved field is blank", p);
    return;
  }
  if (f.kind === "select") choice(s, f.options ?? [], p);
  if (f.kind === "date" && !realDate(s))
    rrFail("A real exact calendar date is required", p);
  if (f.kind === "url") safeUrl(s, p);
  if (f.kind === "number") {
    const n = Number(s);
    if (!Number.isFinite(n) || f.min !== void 0 && n < f.min || f.max !== void 0 && n > f.max || f.integer && !Number.isInteger(n))
      rrFail("Number is outside its declared bounds", p);
  }
}
function researchValue(input, program) {
  const v = rrObject(input, [
    "version",
    "program",
    "records",
    "draft",
    "editing"
  ]);
  if (v.version !== 1 || v.program !== program)
    rrFail("Wrong research version or program");
  const spec = RR_RESEARCH_SCHEMAS[program], fields = spec.fields;
  if (!Array.isArray(v.records) || v.records.length > 200)
    rrFail("Research exceeds 200 records", "$.records");
  const ids = /* @__PURE__ */ new Set();
  for (const [i, row] of v.records.entries()) {
    const p = `$.records[${i}]`, r = rrObject(row, ["id", "createdAt", "updatedAt", "values"], p), id = text(r.id, 100, p + ".id");
    if (!id || ids.has(id))
      rrFail("Invalid or duplicate research ID", p + ".id");
    ids.add(id);
    rrCanonicalInstant(r.createdAt, p + ".createdAt");
    rrCanonicalInstant(r.updatedAt, p + ".updatedAt");
    const values = rrObject(
      r.values,
      fields.map((f) => f.key),
      p + ".values"
    );
    for (const f of fields)
      researchField(values[f.key], f, p + ".values." + f.key, false);
    if (["moral-frameworks-program", "history-of-charity"].includes(program) && values.first !== "" && values.first === values.second)
      rrFail("Comparison identities must differ", p + ".values");
    if (program === "methods-lab") {
      for (const [low, high] of [
        ["costLow", "costHigh"],
        ["probabilityLow", "probabilityHigh"],
        ["unitsLow", "unitsHigh"]
      ])
        if (values[low] !== "" && values[high] !== "" && Number(values[low]) > Number(values[high]))
          rrFail("Lower bound exceeds upper bound", p + ".values");
    }
  }
  if (!v.draft || typeof v.draft !== "object" || Array.isArray(v.draft))
    rrFail("Research draft must be an object", "$.draft");
  for (const [key, value] of Object.entries(v.draft)) {
    const f = fields.find((f2) => f2.key === key);
    if (!f) rrFail("Unknown research draft field", "$.draft." + key);
    researchField(value, f, "$.draft." + key, true);
  }
  if (v.editing !== null && (typeof v.editing !== "string" || !ids.has(v.editing) || spec.freeze))
    rrFail("Editing must refer to an existing unfrozen row", "$.editing");
}
function partnerFields(input, fields, path, context = false) {
  const v = rrObject(
    input,
    fields.map((f) => f.key),
    path
  );
  for (const f of fields) {
    const p = path + "." + f.key, s = text(v[f.key], f.maxLength, p), t = s.trim();
    if (!t) {
      if (!context && !f.optional) rrFail("Required saved field is blank", p);
      continue;
    }
    if (f.kind === "number") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < (f.min ?? 0) || n > Math.min(f.max ?? 1e9, 1e9) || ["amount", "budget"].includes(f.key) && !/^(?:\d+|\d*\.\d{1,2})$/.test(t) || f.key === "minutes" && !Number.isInteger(n))
        rrFail("Number is outside existing partner bounds", p);
    }
    if (f.kind === "date" && !realDate(s))
      rrFail("A real exact calendar date is required", p);
    if (f.kind === "select") choice(s, f.options, p);
    if (f.kind === "url") safeUrl(s, p);
    if (f.key === "start" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
      rrFail("UTC start must be exact HH:MM", p);
  }
}
function partnerValue(input, key) {
  const v = rrObject(input, [
    "version",
    "program",
    "updated",
    "context",
    "records"
  ]), spec = remainingRecordPartnerSchema(key);
  if (v.version !== 1 || v.program !== spec.program)
    rrFail("Wrong partner version or program");
  const updated = text(v.updated, 100, "$.updated");
  if (updated && !Number.isFinite(Date.parse(updated)))
    rrFail("Invalid retained partner timestamp", "$.updated");
  partnerFields(v.context, spec.context, "$.context", true);
  const records = rrObject(
    v.records,
    spec.collections.map((c) => c.key),
    "$.records"
  ), ids = /* @__PURE__ */ new Set();
  let count = 0;
  for (const c of spec.collections) {
    const rows = records[c.key];
    if (!Array.isArray(rows) || rows.length > 250)
      rrFail("Collection exceeds 250 records", "$.records." + c.key);
    for (const [i, row] of rows.entries()) {
      const p = `$.records.${c.key}[${i}]`, r = rrObject(row, ["id", "values"], p), id = text(r.id, 100, p + ".id");
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id))
        rrFail("Invalid or duplicate partner ID", p + ".id");
      ids.add(id);
      if (++count > 500) rrFail("Partner workspace exceeds 500 records");
      partnerFields(r.values, c.fields, p + ".values");
    }
  }
}
function otherValue(key, own) {
  if (key === "charitology-manuscript-v1") {
    const v = rrObject(own, RR_MANUSCRIPT_FIELDS);
    RR_MANUSCRIPT_FIELDS.forEach(
      (f, i) => text(v[f], RR_MANUSCRIPT_LIMITS[i], "$." + f)
    );
    choice(v.kind, RR_MANUSCRIPT_KINDS, "$.kind");
    return;
  }
  if (key === "charitology-nominations-v1") {
    if (!Array.isArray(own) || own.length > 100)
      rrFail("Nomination array exceeds 100 packets");
    const ids = /* @__PURE__ */ new Set();
    for (const [i, row] of own.entries()) {
      const p = `$[${i}]`, v = rrObject(row, ["id", ...RR_NOMINATION_FIELDS], p), id = text(v.id, 99, p + ".id");
      if (!id || ids.has(id))
        rrFail("Invalid or duplicate nomination ID", p + ".id");
      ids.add(id);
      RR_NOMINATION_FIELDS.forEach(
        (f, i2) => text(v[f], RR_NOMINATION_LIMITS[i2], p + "." + f, true)
      );
      choice(v.depth, RR_NOMINATION_DEPTHS, p + ".depth");
    }
    return;
  }
  if (key === "charitology-depth-census-v1") {
    const v = rrObject(own, ["currency", "rows"]);
    if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency))
      rrFail("Currency must be three uppercase letters", "$.currency");
    if (!Array.isArray(v.rows) || v.rows.length > 1e3)
      rrFail("Depth sample exceeds 1000 rows", "$.rows");
    const ids = /* @__PURE__ */ new Set();
    for (const [i, row] of v.rows.entries()) {
      const p = `$.rows[${i}]`, r = rrObject(row, ["id", "activity", "amount", "depth", "source"], p), id = text(r.id, 99, p + ".id");
      if (!id || ids.has(id))
        rrFail("Invalid or duplicate activity ID", p + ".id");
      ids.add(id);
      text(r.activity, 200, p + ".activity", true);
      text(r.source, 5e3, p + ".source", true);
      const n = r.amount;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e9 || Math.abs(n * 100 - Math.round(n * 100)) >= 1e-4)
        rrFail(
          "Amount must retain existing cent precision and bounds",
          p + ".amount"
        );
      choice(r.depth, ["unknown", "0", "1", "2", "3", "4"], p + ".depth");
    }
    return;
  }
  if (key === "charitology-country-notes-v1") {
    if (!own || typeof own !== "object" || Array.isArray(own))
      rrFail("Country notes must be a bare map");
    for (const [code, row] of Object.entries(own)) {
      if (!RR_COUNTRY_CODES.includes(code))
        rrFail("Unknown country identity", "$." + code);
      const r = rrObject(row, ["voices", "institutions", "gaps"], "$." + code);
      for (const f of ["voices", "institutions", "gaps"])
        text(r[f], 1e4, "$." + code + "." + f);
    }
    return;
  }
  rrFail("Unknown native family");
}
function validateRemainingRecordValue(key, input) {
  requireRemainingRecordKey(key);
  const cap = remainingRecordCapacity(key).nativeBytes, own = copyRemainingRecordPlain(input, cap), research = researchForRemainingKey(key), partner = partnerForRemainingKey(key);
  if (research) researchValue(own, research);
  else if (partner) partnerValue(own, key);
  else otherValue(key, own);
  const pretty = JSON.stringify(own, null, 2), reserve = partner ? Math.max(0, 24 - own.updated.length) : 0;
  if (encoder.encode(pretty).byteLength + reserve > cap)
    throw new RRDataError(
      "Complete native backup exceeds its byte limit",
      "$",
      "input_limit"
    );
  return own;
}

// src/lib/client/remaining-record-recovery-formats.ts
var REMAINING_RECORD_LIMITS = Object.freeze({
  rawArchiveBytes: 128e6,
  formArchiveBytes: 1e6,
  jsonDepth: 32,
  fileReadTimeoutMs: 3e4,
  autosaveDelayMs: 250,
  pendingFullReplacements: 1
});
var encoder2 = new TextEncoder();
function invalid(message, path = "$") {
  return rrFail(message, path);
}
function freezeOwned2(value) {
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) freezeOwned2(value[k]);
    Object.freeze(value);
  }
  return value;
}
function boundText(text2, maxBytes) {
  if (text2.length > maxBytes || encoder2.encode(text2).byteLength > maxBytes)
    throw new RRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit"
    );
}
var typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
var nativeBuffer = Object.getOwnPropertyDescriptor(
  typedPrototype,
  "buffer"
).get;
var nativeLength = Object.getOwnPropertyDescriptor(
  typedPrototype,
  "byteLength"
).get;
var nativeArrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength"
).get;
var nativeResizable = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "resizable"
)?.get;
function inputText(raw, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > REMAINING_RECORD_LIMITS.rawArchiveBytes)
    invalid("Invalid file bound");
  if (typeof raw === "string") {
    boundText(raw, maxBytes);
    const owned2 = encoder2.encode(raw);
    if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      owned2
    ) !== raw)
      invalid("Raw input string cannot be represented exactly as UTF-8");
    return raw;
  }
  let length, backing;
  try {
    if (!ArrayBuffer.isView(raw))
      return invalid("Expected genuine Uint8Array bytes");
    backing = nativeBuffer.call(raw);
    length = nativeLength.call(raw);
    nativeArrayBufferLength.call(backing);
    if (nativeResizable?.call(backing))
      invalid("Resizable byte storage is unsupported");
  } catch {
    return invalid("Expected stable plain Uint8Array bytes");
  }
  if (Object.getPrototypeOf(raw) !== Uint8Array.prototype || Object.getPrototypeOf(backing) !== ArrayBuffer.prototype)
    invalid("Expected plain Uint8Array bytes");
  if (length > maxBytes)
    throw new RRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit"
    );
  const owned = new Uint8Array(length);
  try {
    Uint8Array.prototype.set.call(owned, raw);
  } catch {
    return invalid("Detached byte storage is unsupported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      owned
    );
  } catch {
    return invalid("File is not valid UTF-8");
  }
}
function strictRemainingRecordJson(raw, maxBytes) {
  const source = inputText(raw, maxBytes);
  let at = 0;
  function ws() {
    while (at < source.length && (source[at] === " " || source[at] === "\n" || source[at] === "\r" || source[at] === "	"))
      at++;
  }
  function str() {
    const start = at++;
    while (at < source.length) {
      const c = source.charCodeAt(at++);
      if (c === 34) {
        try {
          return JSON.parse(source.slice(start, at));
        } catch {
          return invalid("Invalid JSON string");
        }
      }
      if (c < 32) invalid("Unescaped JSON control character");
      if (c === 92) {
        if (at >= source.length) invalid("Unterminated JSON escape");
        const escaped = source[at++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(at, at + 4)))
            invalid("Invalid Unicode escape");
          at += 4;
        } else if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped))
          invalid("Invalid JSON escape");
      }
    }
    return invalid("Unterminated JSON string");
  }
  function value(depth) {
    if (depth > REMAINING_RECORD_LIMITS.jsonDepth)
      throw new RRDataError(
        "Remaining-record JSON exceeds depth 32",
        "$",
        "input_limit"
      );
    ws();
    const c = source[at];
    if (c === '"') return str();
    if (c === "{") {
      at++;
      ws();
      const out = {};
      const names = /* @__PURE__ */ new Set();
      if (source[at] === "}") {
        at++;
        return out;
      }
      for (; ; ) {
        ws();
        if (source[at] !== '"') invalid("Expected JSON object name");
        const name = str();
        if (names.has(name)) invalid("Duplicate JSON object name");
        names.add(name);
        ws();
        if (source[at++] !== ":") invalid("Expected JSON colon");
        Object.defineProperty(out, name, {
          value: value(depth + 1),
          enumerable: true,
          configurable: true,
          writable: true
        });
        ws();
        const end = source[at++];
        if (end === "}") return out;
        if (end !== ",") invalid("Expected JSON comma");
      }
    }
    if (c === "[") {
      at++;
      ws();
      const out = [];
      if (source[at] === "]") {
        at++;
        return out;
      }
      for (; ; ) {
        out.push(value(depth + 1));
        ws();
        const end = source[at++];
        if (end === "]") return out;
        if (end !== ",") invalid("Expected JSON comma");
      }
    }
    for (const [literal, decoded2] of [
      ["null", null],
      ["true", true],
      ["false", false]
    ]) {
      if (source.startsWith(literal, at)) {
        at += literal.length;
        return decoded2;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(at)
    );
    if (!number) return invalid("Invalid JSON value");
    at += number[0].length;
    const decoded = Number(number[0]);
    if (!Number.isFinite(decoded)) invalid("Nonfinite JSON number");
    return decoded;
  }
  const result = value(0);
  ws();
  if (at !== source.length) invalid("Trailing JSON content");
  return freezeOwned2(result);
}
function remainingRecordBackup(key, native) {
  const own = validateRemainingRecordValue(key, native), out = JSON.stringify(own, null, 2);
  boundText(out, remainingRecordCapacity(key).nativeBytes);
  return out;
}
function parseRemainingRecordBackup(raw, key) {
  requireRemainingRecordKey(key);
  const parsed = strictRemainingRecordJson(
    raw,
    remainingRecordCapacity(key).nativeBytes
  );
  return validateRemainingRecordValue(key, parsed);
}

// services/charity-os/node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// services/charity-os/node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// services/charity-os/node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// services/charity-os/node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// services/charity-os/lib/learning-transport.mjs
var LearningError = class extends Error {
  constructor(code, message, field = "", status = 422) {
    super(message);
    this.name = "LearningError";
    this.status = status;
    this.code = code;
    if (field) this.issues = [{ field, message }];
  }
};
var learningFail = (code, message = "Use the documented learning fields.", field = "", status = 422) => {
  throw new LearningError(code, message, field, status);
};
var reserved = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
function learningRepresentable(s) {
  if (s.includes("\0")) return false;
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 55296 && n <= 56319) {
      const next = s.charCodeAt(++i);
      if (!(next >= 56320 && next <= 57343)) return false;
    } else if (n >= 56320 && n <= 57343) return false;
  }
  return true;
}
function learningCanonical(value, { nativeStrings = false, maxBytes = 64 * 1024 * 1024 } = {}) {
  const seen = /* @__PURE__ */ new Set();
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > maxBytes || depth > 32)
      learningFail(
        "learning_limit",
        "Learning JSON exceeds its depth or work bound."
      );
    if (v === null || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "string") {
      if (!nativeStrings && !learningRepresentable(v))
        learningFail(
          "learning_text_unsupported",
          "This text is unsupported by the hosted bridge."
        );
      return JSON.stringify(v);
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        learningFail("learning_json", "Use finite JSON numbers.");
      return JSON.stringify(v);
    }
    if (!v || typeof v !== "object" || seen.has(v) || Object.getOwnPropertySymbols(v).length)
      learningFail("learning_json", "Use bounded acyclic plain JSON.");
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertyNames(v).length !== v.length + 1 || Object.keys(v).length !== v.length)
        learningFail(
          "learning_json",
          "Sparse or decorated arrays are unsupported."
        );
      const cells = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !Object.hasOwn(d, "value"))
          learningFail("learning_json", "Accessors are unsupported.");
        cells.push(walk(d.value, depth + 1));
      }
      out = "[" + cells.join(",") + "]";
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.getOwnPropertyNames(v).length !== Object.keys(v).length)
        learningFail("learning_json", "Use plain enumerable objects.");
      out = "{" + Object.keys(v).sort().map((k) => {
        if (reserved.has(k) || !nativeStrings && !learningRepresentable(k))
          learningFail("learning_key", "Unsupported object key.");
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !Object.hasOwn(d, "value"))
          learningFail("learning_json", "Accessors are unsupported.");
        return JSON.stringify(k) + ":" + walk(d.value, depth + 1);
      }).join(",") + "}";
    }
    seen.delete(v);
    return out;
  };
  const result = walk(value, 1);
  if (new TextEncoder().encode(result).length > maxBytes)
    learningFail(
      "learning_limit",
      "Complete learning JSON exceeds its byte bound."
    );
  return result;
}
function learningFreeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) learningFreeze(x);
    Object.freeze(v);
  }
  return v;
}
function learningOwned(value, { bytes = 64 * 1024 * 1024, nativeStrings = false } = {}) {
  return learningFreeze(
    JSON.parse(learningCanonical(value, { nativeStrings, maxBytes: bytes }))
  );
}
function learningBytes(raw, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024)
    learningFail("learning_limit", "Invalid learning byte limit.");
  if (!(raw instanceof Uint8Array) || Object.getPrototypeOf(raw) !== Uint8Array.prototype && !(typeof Buffer !== "undefined" && Buffer.isBuffer(raw)))
    learningFail("learning_bytes", "Choose actual UTF-8 bytes.");
  let n;
  try {
    n = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength"
    ).get.call(raw);
  } catch {
    learningFail("learning_bytes", "File bytes are unavailable.");
  }
  if (n > maxBytes)
    learningFail("learning_limit", "The complete file exceeds its byte bound.");
  const b = new Uint8Array(n);
  Uint8Array.prototype.set.call(b, raw);
  return b;
}
function parseLearningTransport(raw, maxBytes, { nativeStrings = false } = {}) {
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : learningBytes(raw, maxBytes);
  if (bytes.length > maxBytes)
    learningFail("learning_limit", "The complete file exceeds its byte bound.");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    );
  } catch {
    learningFail("learning_utf8", "Choose valid UTF-8 JSON.");
  }
  if (s.charCodeAt(0) === 65279)
    learningFail("learning_json", "A UTF-8 BOM is unsupported.");
  if (typeof raw === "string" && s !== raw)
    learningFail("learning_utf8", "Raw JSON text cannot be encoded exactly.");
  let at = 0, nodes = 0;
  const ws = () => {
    while (/[ \n\r\t]/.test(s[at] ?? "x")) at++;
  };
  const bad = () => learningFail("learning_json", "Choose one complete strict JSON value.");
  const str = () => {
    const start = at++;
    while (at < s.length) {
      const c = s.charCodeAt(at++);
      if (c === 34) {
        try {
          return JSON.parse(s.slice(start, at));
        } catch {
          bad();
        }
      }
      if (c < 32) bad();
      if (c === 92) {
        const e = s[at++];
        if (e === "u") {
          if (!/^[a-fA-F0-9]{4}$/.test(s.slice(at, at + 4))) bad();
          at += 4;
        } else if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(e))
          bad();
      }
    }
    bad();
  };
  const val = (depth) => {
    if (++nodes > 2e5 || depth > 32)
      learningFail(
        "learning_limit",
        "Learning JSON exceeds its depth or work bound."
      );
    ws();
    const c = s[at];
    if (c === '"') return str();
    if (c === "{") {
      at++;
      ws();
      const out = {};
      const names = /* @__PURE__ */ new Set();
      if (s[at] === "}") {
        at++;
        return out;
      }
      for (; ; ) {
        ws();
        if (s[at] !== '"') bad();
        const k = str();
        if (names.has(k) || reserved.has(k))
          learningFail(
            "learning_json",
            "Duplicate or unsafe JSON object name."
          );
        names.add(k);
        ws();
        if (s[at++] !== ":") bad();
        Object.defineProperty(out, k, {
          value: val(depth + 1),
          writable: true,
          enumerable: true,
          configurable: true
        });
        ws();
        const end = s[at++];
        if (end === "}") return out;
        if (end !== ",") bad();
      }
    }
    if (c === "[") {
      at++;
      ws();
      const out = [];
      if (s[at] === "]") {
        at++;
        return out;
      }
      for (; ; ) {
        out.push(val(depth + 1));
        ws();
        const end = s[at++];
        if (end === "]") return out;
        if (end !== ",") bad();
      }
    }
    for (const [l, v2] of [
      ["null", null],
      ["true", true],
      ["false", false]
    ])
      if (s.startsWith(l, at)) {
        at += l.length;
        return v2;
      }
    const m = s.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!m) bad();
    at += m[0].length;
    const num = Number(m[0]);
    if (!Number.isFinite(num)) bad();
    return num;
  };
  const v = val(1);
  ws();
  if (at !== s.length) bad();
  return learningOwned(v, { bytes: maxBytes, nativeStrings });
}

// services/charity-os/lib/incubator-bridge-json.mjs
var IncubatorError = class extends Error {
  constructor(code, message, field = "", status = 422) {
    super(message);
    this.name = "IncubatorError";
    this.code = code;
    this.status = status;
    if (field) this.issues = [{ field, message }];
  }
};
var incubatorFail = (code, message = "Use the documented Incubator fields.", field = "", status = 422) => {
  throw new IncubatorError(code, message, field, status);
};
var transport = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof IncubatorError) throw e;
    if (e?.name === "LearningError") incubatorFail("incubator_" + e.code.replace(/^learning_/, ""), "Use complete bounded strict JSON supported by this bridge.", e.issues?.[0]?.field ?? "", e.status);
    throw e;
  }
};
var INCUBATOR_LIMITS = Object.freeze({ nativeBytes: 8e6, selectedBytes: 1048576, sourceBytes: 1056768, previewBytes: 2097152, requestBytes: 131072, eventBytes: 131072, receiptBytes: 8192, history: 1e3, historyBytes: 16777216, bindings: 40, liveBindings: 20, nativeVersions: 8, eventsPerBinding: 8, jsonDepth: 32, jsonNodes: 2e5 });
var incubatorOwned = (v, options) => transport(() => learningOwned(v, options));
var incubatorFreeze = learningFreeze;
var incubatorBytes = (v, max) => transport(() => learningBytes(v, max));
var incubatorRepresentable = learningRepresentable;
var parseIncubatorJSON = (v, max = INCUBATOR_LIMITS.requestBytes, options) => transport(() => parseLearningTransport(v, max, options));
var incubatorRawHash = (bytes) => bytesToHex(sha256(bytes));
function incubatorObject(v, keys, field = "") {
  if (!v || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.keys(v).length !== keys.length || Object.keys(v).some((k) => !keys.includes(k))) incubatorFail("incubator_shape", "Use every documented field and no additional fields.", field);
  return v;
}
function incubatorId(v, field = "") {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) incubatorFail("incubator_id", "Use an exact opaque identifier.", field);
  return v;
}

// services/charity-os/lib/incubator-native-entry.ts
var KEY = "charitology.partner-workspace-v1.charity-incubator";
var ADAPTER = "incubator-project-milestone-native-v1";
function complete(bytes, adapter) {
  if (adapter !== ADAPTER) incubatorFail("incubator_adapter", "Choose the supported Incubator native export.");
  const owned = incubatorBytes(bytes, INCUBATOR_LIMITS.nativeBytes);
  const parsed = parseIncubatorJSON(owned, INCUBATOR_LIMITS.nativeBytes, { nativeStrings: true });
  try {
    parseRemainingRecordBackup(owned, KEY);
  } catch {
    incubatorFail("incubator_native", "Choose a complete valid native Incubator v1 export.");
  }
  return parsed;
}
function selectionValue(value) {
  const v = incubatorOwned(value, { bytes: 1024 });
  incubatorObject(v, ["projectId", "milestoneId"]);
  incubatorId(v.projectId, "selection.projectId");
  incubatorId(v.milestoneId, "selection.milestoneId");
  if (v.projectId === v.milestoneId) incubatorFail("incubator_selection", "Choose two distinct saved row IDs.");
  return v;
}
function representable(value, field = "selected") {
  if (typeof value === "string" && !incubatorRepresentable(value)) incubatorFail("incubator_native_text_unsupported", "Valid native source; this selected text cannot be retained by PostgreSQL. The original file was not changed.", field);
  if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) representable(v, field + "." + k);
}
function listIncubatorNativeSelections(bytes, choice2 = { adapter: ADAPTER }) {
  const c = incubatorOwned(choice2, { bytes: 1024 });
  incubatorObject(c, ["adapter"]);
  const v = complete(bytes, c.adapter);
  return incubatorFreeze({ projects: v.records.projects.map((r) => ({ id: r.id, title: r.values.title })), milestones: v.records.milestones.map((r) => ({ id: r.id, title: r.values.title, projectReference: r.values.project })) });
}
function validateIncubatorSelectedNative(selection, selected) {
  const choice2 = selectionValue(selection);
  const v = incubatorOwned(selected, { bytes: INCUBATOR_LIMITS.selectedBytes, nativeStrings: true });
  incubatorObject(v, ["version", "program", "updated", "context", "project", "milestone"]);
  if (v.project?.id !== choice2.projectId || v.milestone?.id !== choice2.milestoneId) incubatorFail("incubator_selection", "The selected native identities differ.");
  representable(v);
  const native = { version: v.version, program: v.program, updated: v.updated, context: v.context, records: { gaps: [], projects: [v.project], experiments: [], milestones: [v.milestone], readiness: [] } };
  try {
    parseRemainingRecordBackup(remainingRecordBackup(KEY, native), KEY);
  } catch {
    incubatorFail("incubator_native", "Retained selection differs from the native schema.");
  }
  return incubatorOwned(v, { bytes: INCUBATOR_LIMITS.selectedBytes });
}
function inspectIncubatorNativeValue(bytes, input) {
  const c = incubatorOwned(input, { bytes: 2048 });
  incubatorObject(c, ["adapter", "selection"]);
  const adapter = c.adapter, owned = incubatorBytes(bytes, INCUBATOR_LIMITS.nativeBytes), originalSha256 = incubatorRawHash(owned);
  const v = complete(owned, adapter), choice2 = selectionValue(c.selection);
  const project = v.records.projects.find((r) => r.id === choice2.projectId), milestone = v.records.milestones.find((r) => r.id === choice2.milestoneId);
  if (!project || !milestone) incubatorFail("incubator_selection", "Choose one saved project and one saved milestone.");
  const selected = validateIncubatorSelectedNative(choice2, { version: v.version, program: v.program, updated: v.updated, context: v.context, project, milestone });
  return incubatorOwned({ adapter, selection: choice2, selected, originalBytes: owned.length, originalSha256 }, { bytes: INCUBATOR_LIMITS.sourceBytes });
}
export {
  inspectIncubatorNativeValue,
  listIncubatorNativeSelections,
  validateIncubatorSelectedNative
};
