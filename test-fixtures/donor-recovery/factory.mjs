// Fictional data only. Complete old producer shapes, independent of D1 defaults.
export const STAMP = "2026-10-27T12:00:00.000Z";
export const GRANT_DIMS = [
  "depth",
  "evidence",
  "counterfactual",
  "feedback",
  "voice",
  "cost",
  "durability",
  "team",
  "harm",
];
export function donorFixtures() {
  const p = {
    id: "fictional-proposal",
    name: "Fictional proposal",
    scores: Object.fromEntries(GRANT_DIMS.map((k) => [k, null])),
    notes: Object.fromEntries(GRANT_DIMS.map((k) => [k, ""])),
    savedAt: STAMP,
  };
  const draft = {
    id: "fictional-impact",
    name: "Fictional program",
    problem: "",
    source: "",
    depth: null,
    activities: "",
    outputs: "",
    outcomeShort: "",
    outcomeMedium: "",
    outcomeLong: "",
    indicators: [{ what: "", how: "", when: "", baseline: "", target: "" }],
    assumptions: "",
    feedbackMethod: "",
    feedbackFrequency: "",
    comparison: "",
    stopRule: "",
    reviewer: "",
    reviewDate: "",
    example: false,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  return {
    gifts: [
      {
        id: "fictional-gift",
        date: "2026-10-27",
        organization: "Fictional organization",
        amount: 10,
        cause: "other",
        depth: null,
      },
    ],
    portfolio: {
      allocation: { "global-health": 1 },
      alternative: { "global-health": 1 },
      budget: 100,
      state: { w: [100, 0, 0, 0, 0, 0, 0, 0], b: 100, t: 0 },
      method: "shares",
      savedAt: STAMP,
    },
    legacy: {
      name: "",
      place: "",
      gifts: [
        {
          id: "fictional-bequest",
          charity: "",
          legal: "",
          ein: "",
          type: "specific",
          amount: "",
          percent: "",
          condition: "",
          purpose: "unrestricted",
          purposeText: "",
        },
      ],
      flexible: true,
      notes: "",
    },
    "gift-card": {
      to: "",
      from: "",
      charity: "",
      does: "",
      message: "",
      reasons: [],
      style: "classic",
    },
    "ce-models": [
      {
        id: "fictional-model",
        name: "Untitled model",
        unit: "",
        values: Object.fromEntries(
          ["cost", "people", "works", "effect", "years", "anyway"].map((k) => [
            k,
            ["", "", ""],
          ]),
        ),
        discount: "",
        seed: "1",
        savedAt: STAMP,
      },
    ],
    "due-diligence": {
      v: 1,
      current: "fictional-org",
      orgs: [
        {
          id: "fictional-org",
          name: "Fictional organization",
          answers: { outcomes: "unknown" },
          notes: {},
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      ],
    },
    "grant-proposals": [p],
    "grant-weights": Object.fromEntries(GRANT_DIMS.map((k) => [k, 5])),
    "grant-draft": JSON.parse(JSON.stringify(p)),
    "impact-drafts": { v: 1, current: draft.id, drafts: [draft] },
    split: {
      total: null,
      rows: [
        {
          id: "fictional-row",
          cause: "other",
          name: "",
          url: "",
          share: null,
          done: false,
        },
      ],
      source: "",
    },
    compass: {
      weights: Object.fromEntries(
        [
          "welfare",
          "rights",
          "justice",
          "care",
          "tradition",
          "future",
          "nature",
          "flourishing",
        ].map((k) => [k, 2]),
      ),
      position: Object.fromEntries(
        ["horizon", "circle", "reach", "certainty", "depth"].map((k) => [
          k,
          0.5,
        ]),
      ),
      answers: { d: [50, 50, 50, 50, 50], s: [2, 2, 2, 2, 2, 2, 2, 2] },
      savedAt: STAMP,
    },
    "disaster-plan": {
      amount: 0,
      shares: { relief: 50, recovery: 30, preparedness: 20 },
      what: "",
    },
    wrapped: { year: "2026", hide: false },
  };
}
export function grantBundle(fixtures = donorFixtures()) {
  return {
    format: "charitology-grant-workspace",
    version: 1,
    exportedAt: STAMP,
    members: ["grant-proposals", "grant-weights", "grant-draft"].map((key) => ({
      key,
      presence: "value",
      persistence: "saved",
      value: fixtures[key],
    })),
  };
}
