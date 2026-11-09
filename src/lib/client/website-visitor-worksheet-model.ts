export const worksheetTextLimits = { task: 160, change: 480, setup: 320, next: 240 } as const;
export const worksheetStages = [
  { id: "before", label: "Current page" },
  { id: "after", label: "Proposed version" },
] as const;
export const worksheetMeasures = [
  { id: "steps", label: "Navigation steps", max: 100 },
  { id: "seconds", label: "Elapsed seconds", max: 3600 },
] as const;
export const worksheetOutcomes = [
  { value: "", label: "Unknown" },
  { value: "completed", label: "Completed without help" },
  { value: "assisted", label: "Completed with help" },
  { value: "blocked", label: "Could not complete" },
] as const;
export const worksheetRows = [{ id: "outcome", label: "Completion" }, ...worksheetMeasures] as const;

type Stage = (typeof worksheetStages)[number];
type Measure = (typeof worksheetMeasures)[number];
type TextField = keyof typeof worksheetTextLimits;
type WorksheetField = TextField | `${Stage["id"]}-${(typeof worksheetRows)[number]["id"]}`;
export type WorksheetDraft = Readonly<Record<WorksheetField, string>>;
export const worksheetFieldIds: readonly WorksheetField[] = [
  "task", "change", "setup", "next",
  ...worksheetStages.flatMap((stage) =>
    worksheetRows.map((row) => `${stage.id}-${row.id}` as const),
  ),
];

export class WorksheetInputError extends Error {}

function textField(draft: WorksheetDraft, id: TextField, label: string, required = false) {
  const value = draft[id];
  const limit = worksheetTextLimits[id];
  if (value.length > limit || /[\p{Surrogate}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new WorksheetInputError(`Use up to ${limit} characters of plain text for ${label}.`);
  }
  if (required && !value.trim()) throw new WorksheetInputError(`Enter ${label} before reviewing.`);
  return value.trim() ? value : "Unknown";
}

function observation(draft: WorksheetDraft, stage: Stage) {
  const outcome = worksheetOutcomes.find((item) => item.value === draft[`${stage.id}-outcome`]);
  if (!outcome) throw new WorksheetInputError(`Choose a completion option for the ${stage.label.toLowerCase()}.`);
  const readNumber = (measure: Measure) => {
    const value = draft[`${stage.id}-${measure.id}`].trim();
    if (!value) return "Unknown";
    if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > String(measure.max).length || Number(value) > measure.max) {
      throw new WorksheetInputError(`Enter ${measure.label.toLowerCase()} from 0 to ${measure.max} for the ${stage.label.toLowerCase()}, or leave it blank.`);
    }
    return value;
  };
  const [steps, seconds] = worksheetMeasures.map(readNumber);
  return { outcome: outcome.label, steps, seconds };
}

// Every line of user writing stays inside an indented Markdown code block.
function literalBlock(value: string) {
  return value.split(/\r\n?|\n|\u2028|\u2029/u).map((line) => `    ${line}`).join("\n");
}

export function prepareWebsiteVisitorHandoff(draft: WorksheetDraft) {
  const task = textField(draft, "task", "one visitor task", true);
  const change = textField(draft, "change", "one proposed change", true);
  const setup = textField(draft, "setup", "the test setup");
  const next = textField(draft, "next", "the proposed next step");
  const [before, after] = worksheetStages.map((stage) => observation(draft, stage));
  const rows = worksheetRows.map(({ id, label }) => ({ label, before: before[id], after: after[id] }));
  const markdown = [
    "# Website visitor task handoff",
    "",
    "Practice draft for one visitor task. Record manual observations and leave missing measurements unknown. The charity decides whether to adopt or publish a change.",
    "",
    "## Visitor task",
    "",
    literalBlock(task),
    "",
    "## Proposed change",
    "",
    literalBlock(change),
    "",
    "## Test setup and differences",
    "",
    literalBlock(setup),
    "",
    "## Paired observations",
    "",
    "| Measure | Current page | Proposed version |",
    "| --- | --- | --- |",
    ...rows.map(({ label, before, after }) => `| ${label} | ${before} | ${after} |`),
    "",
    "Interpret the observations in the recorded setup. Questions about donations or mission outcomes need their own evidence.",
    "",
    "## Proposed next step",
    "",
    literalBlock(next),
    "",
  ].join("\n");
  return { rows, markdown };
}
