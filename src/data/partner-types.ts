import type { ProgramField, ProgramWorkspace } from "./program-workspaces";
export type PartnerWorkspace = ProgramWorkspace & {
  readiness: { title: string; reason: string }[];
  sampleContext?: Record<string, string>;
};
export type { ProgramField, ProgramCollection } from "./program-workspaces";
export const text = (
  key: string,
  label: string,
  optional = false,
): ProgramField => ({ key, label, optional });
export const area = (
  key: string,
  label: string,
  optional = false,
): ProgramField => ({ key, label, kind: "textarea", optional });
export const num = (
  key: string,
  label: string,
  optional = true,
  max = 1e12,
): ProgramField => ({ key, label, kind: "number", optional, min: 0, max });
export const date = (
  key: string,
  label: string,
  optional = false,
): ProgramField => ({ key, label, kind: "date", optional });
export const select = (
  key: string,
  label: string,
  options: string[],
): ProgramField => ({ key, label, kind: "select", options, value: options[0] });
export const source = (optional = true): ProgramField => ({
  key: "source",
  label: "Public HTTPS evidence source",
  kind: "url",
  optional,
  hint: "Public sources only. No private files, contact details or personal histories.",
});
export const depth = () =>
  select("depth", "Activity depth (hypothesis, never a grade)", [
    "Unclassified",
    "0 Relief",
    "1 Repair",
    "2 Prevention",
    "3 Structure",
    "4 Source",
    "Several levels",
  ]);
export const workflow = () =>
  select("status", "Local workflow state", [
    "Draft",
    "Needs evidence",
    "Ready for discussion",
    "Recorded decision",
    "Closed",
  ]);
export const taskFields = [
  text("title", "Task or unresolved requirement"),
  text("owner", "Responsible role", true),
  date("date", "Review date", true),
  select("status", "Task status", ["To do", "In progress", "Blocked", "Done"]),
  area("notes", "Evidence of completion or next step"),
];
