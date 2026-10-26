import { clear, h } from "./dom";
import { download, toCsv } from "./files";
import { load, remove, save } from "./store";
import { canPersist } from "./persist";
import { confirmTwice } from "./confirm";

export interface ResearchField {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "date" | "url" | "select";
  required?: boolean;
  hint?: string;
  group?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
}
export interface ResearchConfig {
  id: string;
  title: string;
  fields: ResearchField[];
  freeze?: boolean;
}
export interface ResearchRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, string>;
}
export interface ResearchState {
  version: 1;
  program: string;
  records: ResearchRecord[];
  draft: Record<string, string>;
  editing: string | null;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const MAX_RECORDS = 200;
export const isHttps = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};
export function fieldError(field: ResearchField, value: string): string | null {
  if (!value.trim())
    return field.required ? `${field.label} is required.` : null;
  if (value.length > (field.maxLength ?? 8000))
    return `${field.label} is too long.`;
  if (field.type === "url" && !isHttps(value))
    return `${field.label} needs a full public https:// source URL without a username or password.`;
  if (
    field.type === "date" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    return `${field.label} needs a valid date.`;
  if (
    field.type === "select" &&
    !field.options?.some((option) => option.value === value)
  )
    return `${field.label} has an unknown option.`;
  if (field.type === "number") {
    const n = Number(value);
    if (
      !Number.isFinite(n) ||
      (field.min != null && n < field.min) ||
      (field.max != null && n > field.max)
    )
      return `${field.label} is outside its allowed range.`;
    if (field.step === "1" && !Number.isInteger(n))
      return `${field.label} needs a whole number.`;
  }
  return null;
}
export function researchCrossError(
  config: ResearchConfig,
  values: Record<string, string>,
): string | null {
  if (
    ["history-of-charity", "moral-frameworks-program"].includes(config.id) &&
    values.first &&
    values.first === values.second
  )
    return "Choose two different items for this comparison.";
  if (config.id === "methods-lab")
    for (const [low, high, label] of [
      ["costLow", "costHigh", "Cost"],
      ["probabilityLow", "probabilityHigh", "Success probability"],
      ["unitsLow", "unitsHigh", "Outcome"],
    ])
      if (
        values[low] !== "" &&
        values[high] !== "" &&
        Number(values[low]) > Number(values[high])
      )
        return `${label}: the upper bound must be at least the lower bound.`;
  return null;
}
export function validateResearchState(
  raw: unknown,
  config: ResearchConfig,
): ResearchState | null {
  if (
    !object(raw) ||
    raw.version !== 1 ||
    raw.program !== config.id ||
    !Array.isArray(raw.records) ||
    raw.records.length > MAX_RECORDS ||
    !object(raw.draft)
  )
    return null;
  const values = (
    rawValues: unknown,
    required: boolean,
  ): Record<string, string> | null => {
    if (!object(rawValues)) return null;
    const result: Record<string, string> = {};
    for (const field of config.fields) {
      const value = rawValues[field.key] ?? "";
      if (typeof value !== "string" || value.length > (field.maxLength ?? 8000))
        return null;
      if (required && fieldError(field, value)) return null;
      result[field.key] = value;
    }
    return result;
  };
  const records: ResearchRecord[] = [];
  const ids = new Set<string>();
  for (const row of raw.records) {
    if (
      !object(row) ||
      typeof row.id !== "string" ||
      !row.id ||
      row.id.length > 100 ||
      ids.has(row.id) ||
      typeof row.createdAt !== "string" ||
      typeof row.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(row.createdAt)) ||
      !Number.isFinite(Date.parse(row.updatedAt))
    )
      return null;
    const v = values(row.values, true);
    if (!v || researchCrossError(config, v)) return null;
    records.push({
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      values: v,
    });
    ids.add(row.id);
  }
  const draft = values(raw.draft, false);
  if (!draft) return null;
  const editing =
    typeof raw.editing === "string" && ids.has(raw.editing) && !config.freeze
      ? raw.editing
      : null;
  return { version: 1, program: config.id, records, draft, editing };
}
export function upsertResearchRecord(
  state: ResearchState,
  config: ResearchConfig,
  values: Record<string, string>,
  at: string,
  id: string,
): ResearchState | null {
  if (
    config.fields.some(
      (field) =>
        typeof values[field.key] !== "string" ||
        fieldError(field, values[field.key]),
    ) ||
    researchCrossError(config, values) ||
    !Number.isFinite(Date.parse(at)) ||
    !id ||
    id.length > 100
  )
    return null;
  const old = config.freeze
    ? undefined
    : state.records.find((row) => row.id === state.editing);
  if (
    !old &&
    (state.records.length >= MAX_RECORDS ||
      state.records.some((row) => row.id === id))
  )
    return null;
  const row = {
    id: old?.id ?? id,
    createdAt: old?.createdAt ?? at,
    updatedAt: at,
    values: { ...values },
  };
  return {
    ...state,
    records: old
      ? state.records.map((item) => (item.id === old.id ? row : item))
      : [...state.records, row],
    draft: {},
    editing: null,
  };
}
export function deleteResearchRecord(
  state: ResearchState,
  id: string,
): ResearchState {
  return {
    ...state,
    records: state.records.filter((row) => row.id !== id),
    ...(state.editing === id ? { editing: null, draft: {} } : {}),
  };
}
export function editResearchRecord(
  state: ResearchState,
  id: string,
  freeze = false,
): ResearchState | null {
  const row = state.records.find((entry) => entry.id === id);
  return row
    ? { ...state, editing: freeze ? null : row.id, draft: { ...row.values } }
    : null;
}
export function researchCsv(rows: Record<string, unknown>[]): string {
  return toCsv(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          const text = value == null ? "" : String(value);
          return [
            key,
            /^\s*[=+@\-]/.test(text) || /^[\t\r]/.test(text)
              ? `'${text}`
              : text,
          ];
        }),
      ),
    ),
  );
}
export function researchMarkdown(
  config: ResearchConfig,
  state: ResearchState,
): string {
  const section = (title: string, values: Record<string, string>, meta = "") =>
    `## ${title}\n\n${meta}${config.fields.map((field) => `### ${field.label}\n\n${values[field.key] || "Unknown / not recorded."}`).join("\n\n")}\n`;
  return (
    `# ${config.title}\n\nExported ${new Date().toISOString()}. User-entered research notes, not Charitology findings or ratings.\n\n` +
    (config.freeze
      ? "Frozen versions below are local snapshots, not a public registration or independent timestamp.\n\n"
      : "") +
    state.records
      .map((row) =>
        section(
          row.values.title || "Research record",
          row.values,
          `Saved ${row.updatedAt}.\n\n`,
        ),
      )
      .join("\n") +
    (Object.values(state.draft).some(Boolean)
      ? "\n" + section("Current draft", state.draft)
      : "")
  );
}
export function mountResearchWorkspaces() {
  document
    .querySelectorAll<HTMLElement>("[data-research-workspace]")
    .forEach((root) => {
      if (root.dataset.ready) return;
      root.dataset.ready = "true";
      const config = JSON.parse(root.dataset.config!) as ResearchConfig;
      const key = `research-program.${config.id}.v1`;
      const blank = (): ResearchState => ({
        version: 1,
        program: config.id,
        records: [],
        draft: {},
        editing: null,
      });
      const raw = load<unknown>(key, null),
        restored = raw == null ? null : validateResearchState(raw, config);
      let state = restored ?? blank(),
        undo: ResearchState | null = null,
        pending: ResearchState | null = null;
      let persistent = canPersist();
      const form = root.querySelector<HTMLFormElement>("form")!;
      const status = root.querySelector<HTMLElement>("[data-status]")!;
      const say = (message: string) => {
        status.textContent =
          message +
          (persistent
            ? ""
            : " Browser storage is unavailable; download your work before leaving.");
      };
      const input = (key: string) =>
        form.elements.namedItem(key) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement;
      const read = () =>
        Object.fromEntries(
          config.fields.map((field) => [field.key, input(field.key).value]),
        );
      const fill = () =>
        config.fields.forEach((field) => {
          input(field.key).value = state.draft[field.key] ?? "";
        });
      const persist = () => {
        persistent = save(key, state) && persistent;
      };
      const snapshot = () => {
        undo = structuredClone(state);
        root.querySelector<HTMLButtonElement>("[data-undo]")!.disabled = false;
      };
      const completion = () => {
        const values = read(),
          required = config.fields.filter((field) => field.required);
        const complete = required.filter(
          (field) => !fieldError(field, values[field.key]),
        ).length;
        root.querySelector("[data-completion]")!.textContent =
          `${complete} of ${required.length} required fields complete. Blank optional fields stay unknown.`;
        root.dispatchEvent(
          new CustomEvent("research:change", { detail: values }),
        );
        root.dispatchEvent(
          new CustomEvent("research:state", { detail: state }),
        );
      };
      const render = () => {
        const box = root.querySelector<HTMLElement>("[data-records]")!;
        clear(box);
        root.querySelector("[data-count]")!.textContent = String(
          state.records.length,
        );
        if (!state.records.length)
          box.append(
            h(
              "p",
              { class: "empty" },
              "No saved records yet. Complete the required fields and save your first record.",
            ),
          );
        for (const row of [...state.records].reverse()) {
          const detail = h(
            "details",
            { class: "rp-record" },
            h("summary", {}, row.values.title || "Untitled record"),
          );
          detail.append(
            h(
              "p",
              { class: "note" },
              `${config.freeze ? "Frozen local version · " : ""}Saved ${new Date(row.updatedAt).toLocaleString()}`,
            ),
          );
          const fields = h("dl");
          config.fields.forEach((field) => {
            const value = row.values[field.key];
            const display =
              field.type === "select"
                ? (field.options?.find((option) => option.value === value)
                    ?.label ?? value)
                : value;
            fields.append(
              h("dt", {}, field.label),
              h(
                "dd",
                {},
                field.type === "url" && value && isHttps(value)
                  ? h(
                      "a",
                      { href: value, target: "_blank", rel: "noopener" },
                      value,
                    )
                  : display || "Unknown / not recorded.",
              ),
            );
          });
          const edit = h(
            "button",
            { type: "button", class: "btn btn-ghost btn-small" },
            config.freeze ? "Fork a new draft" : "Edit record",
          );
          edit.addEventListener("click", () => {
            snapshot();
            state = editResearchRecord(state, row.id, config.freeze)!;
            fill();
            persist();
            render();
            form.scrollIntoView({ block: "start" });
            input("title").focus();
            say(
              config.freeze
                ? "Copied this version into a new draft. The saved version is unchanged."
                : "Editing the saved record. Save to apply changes.",
            );
          });
          const del = h(
            "button",
            { type: "button", class: "btn btn-ghost btn-small" },
            "Delete record",
          );
          confirmTwice(del, {
            prompt: "Click again to delete",
            announce: say,
            action: () => {
              snapshot();
              state = deleteResearchRecord(state, row.id);
              fill();
              persist();
              render();
              say("Deleted. Undo restores the previous workspace.");
            },
          });
          detail.append(fields, h("div", { class: "btn-row" }, edit, del));
          box.append(detail);
        }
        root.querySelector("[data-editing]")!.textContent = state.editing
          ? "Editing a saved record"
          : config.freeze
            ? "New local version"
            : "New record";
        completion();
      };
      form.addEventListener("input", () => {
        state.draft = read();
        persist();
        completion();
        say(
          persistent
            ? "Draft saved in this browser."
            : "Draft is held only on this page.",
        );
      });
      form.addEventListener("change", () => {
        state.draft = read();
        persist();
        completion();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = read();
        const invalid = config.fields.find((field) =>
          fieldError(field, values[field.key]),
        );
        if (invalid) {
          input(invalid.key).focus();
          say(fieldError(invalid, values[invalid.key])!);
          return;
        }
        const crossError = researchCrossError(config, values);
        if (crossError) {
          say(crossError);
          return;
        }
        if (!state.editing && state.records.length >= MAX_RECORDS) {
          say(
            "This workspace holds up to 200 records. Export and remove old records first.",
          );
          return;
        }
        snapshot();
        const next = upsertResearchRecord(
          state,
          config,
          values,
          new Date().toISOString(),
          crypto.randomUUID(),
        );
        if (!next) {
          say(
            "Could not save this record. Check its fields and workspace capacity.",
          );
          return;
        }
        state = next;
        fill();
        persist();
        render();
        say(
          config.freeze
            ? "Saved a frozen local version. Export it for public registration or review."
            : "Record saved. Open it below to inspect or edit it.",
        );
      });
      confirmTwice(root.querySelector<HTMLButtonElement>("[data-new]")!, {
        prompt: "Click again to discard draft",
        needed: () => Object.values(read()).some(Boolean),
        announce: say,
        action: () => {
          snapshot();
          state.draft = {};
          state.editing = null;
          fill();
          persist();
          render();
          say("Started an empty draft.");
        },
      });
      confirmTwice(root.querySelector<HTMLButtonElement>("[data-clear]")!, {
        prompt: "Click again to clear workspace",
        announce: say,
        action: () => {
          snapshot();
          state = blank();
          remove(key);
          fill();
          persist();
          render();
          say(
            "Cleared this workspace. Undo is available until this page is closed.",
          );
        },
      });
      root
        .querySelector<HTMLButtonElement>("[data-undo]")!
        .addEventListener("click", () => {
          if (!undo) return;
          state = undo;
          undo = null;
          fill();
          persist();
          render();
          root.querySelector<HTMLButtonElement>("[data-undo]")!.disabled = true;
          say("Restored the previous workspace.");
        });
      root.querySelector("[data-json]")!.addEventListener("click", () => {
        state.draft = read();
        download(
          `${config.id}.json`,
          JSON.stringify(state, null, 2),
          "application/json",
        );
        say("JSON export downloaded, including the current draft.");
      });
      root.querySelector("[data-markdown]")!.addEventListener("click", () => {
        state.draft = read();
        download(
          `${config.id}.md`,
          researchMarkdown(config, state),
          "text/markdown;charset=utf-8",
        );
        say("Research memo downloaded.");
      });
      root.querySelector("[data-csv]")!.addEventListener("click", () => {
        download(
          `${config.id}.csv`,
          researchCsv(
            state.records.map((row) =>
              Object.fromEntries([
                ["savedAt", row.updatedAt],
                ...config.fields.map((field) => [
                  field.label,
                  row.values[field.key] ?? "",
                ]),
              ]),
            ),
          ),
          "text/csv;charset=utf-8",
        );
        say(
          state.records.length
            ? "Saved records exported as CSV."
            : "Exported an empty CSV. Save a record to include it.",
        );
      });
      const file = root.querySelector<HTMLInputElement>("[data-import]")!,
        confirmImport = root.querySelector<HTMLButtonElement>(
          "[data-confirm-import]",
        )!;
      file.addEventListener("change", async () => {
        const selected = file.files?.[0];
        pending = null;
        confirmImport.hidden = true;
        if (!selected) return;
        if (selected.size > 2_000_000) {
          say("Choose a JSON file smaller than 2 MB.");
          file.value = "";
          return;
        }
        try {
          pending = validateResearchState(
            JSON.parse(await selected.text()),
            config,
          );
        } catch {
          pending = null;
        }
        file.value = "";
        if (!pending) {
          say(
            "This file is not a valid export for this program. Your workspace was not changed.",
          );
          return;
        }
        confirmImport.hidden = false;
        say(
          `Valid import: ${pending.records.length} saved records. Press Replace with imported workspace to apply it. You can export this workspace first.`,
        );
      });
      confirmImport.addEventListener("click", () => {
        if (!pending) return;
        snapshot();
        state = pending;
        pending = null;
        confirmImport.hidden = true;
        fill();
        persist();
        render();
        say("Imported workspace. Undo restores the previous one.");
      });
      root.addEventListener("research:prefill", ((
        event: CustomEvent<Record<string, string>>,
      ) => {
        snapshot();
        state.draft = { ...read(), ...event.detail };
        state.editing = null;
        fill();
        persist();
        render();
        say(
          "Loaded a starting point. Add and verify the evidence before saving.",
        );
      }) as EventListener);
      root.addEventListener("research:inspect", completion);
      fill();
      render();
      say(
        raw != null && !restored
          ? "Saved data did not match this workspace and was not loaded. Your original stored data is left intact until you edit or save."
          : restored
            ? "Restored this browser’s workspace."
            : "Start a draft. Nothing is submitted to Charitology.",
      );
    });
}

export interface MethodRange {
  expectedLow: number;
  expectedHigh: number;
  costPerLow: number;
  costPerHigh: number | null;
}
export function weightedLensComparison(
  frameworks: { id: string; priorities: Record<string, number> }[],
  weights: Record<string, string>,
  first: string,
  second: string,
) {
  if (
    !frameworks.length ||
    first === second ||
    frameworks.some(
      (framework) =>
        !Number.isFinite(framework.priorities[first]) ||
        !Number.isFinite(framework.priorities[second]),
    )
  )
    return null;
  let sum = 0,
    a = 0,
    b = 0,
    included = 0,
    unknown = 0;
  for (const framework of frameworks) {
    const raw = weights[framework.id] ?? "";
    if (raw === "") {
      unknown++;
      continue;
    }
    const weight = Number(raw);
    if (!Number.isFinite(weight) || weight < 0 || weight > 5) return null;
    if (weight === 0) continue;
    sum += weight;
    a += weight * framework.priorities[first];
    b += weight * framework.priorities[second];
    included++;
  }
  if (!sum) return null;
  return {
    first: a / sum,
    second: b / sum,
    included,
    unknown,
    equalFirst:
      frameworks.reduce(
        (total, framework) => total + framework.priorities[first],
        0,
      ) / frameworks.length,
    equalSecond:
      frameworks.reduce(
        (total, framework) => total + framework.priorities[second],
        0,
      ) / frameworks.length,
  };
}
/** Conditional success produces the entered units; failure produces zero units. Bounds are scenarios, not confidence intervals. */
export function methodRange(
  costLow: number,
  costHigh: number,
  probabilityLow: number,
  probabilityHigh: number,
  unitsLow: number,
  unitsHigh: number,
): MethodRange | null {
  const values = [
    costLow,
    costHigh,
    probabilityLow,
    probabilityHigh,
    unitsLow,
    unitsHigh,
  ];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    costHigh < costLow ||
    probabilityHigh < probabilityLow ||
    probabilityHigh > 100 ||
    unitsHigh < unitsLow
  )
    return null;
  const expectedLow = (probabilityLow / 100) * unitsLow,
    expectedHigh = (probabilityHigh / 100) * unitsHigh;
  if (expectedHigh <= 0) return null;
  const costPerLow = costLow / expectedHigh,
    costPerHigh = expectedLow > 0 ? costHigh / expectedLow : null;
  if (
    !Number.isFinite(costPerLow) ||
    (costPerHigh != null && !Number.isFinite(costPerHigh))
  )
    return null;
  return { expectedLow, expectedHigh, costPerLow, costPerHigh };
}
