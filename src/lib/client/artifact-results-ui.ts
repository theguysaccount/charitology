import { rawStorageRecoveryDownload } from "./raw-storage-recovery";
import { h, clear } from "./dom";
import { download } from "./files";
import { RESEARCH_ARTIFACT_ADAPTERS } from "../../data/research-artifact-adapters";
import {
  ARTIFACT_LIMITS,
  blankArtifactState,
  prepareArtifactCommand,
  artifactProjectView,
  artifactDifference,
  makeArtifactBackup,
  artifactCsvExports,
  artifactMarkdownPacket,
  makeArtifactPacket,
  type ArtifactState,
  type ArtifactCommand,
  type Draft,
  type Tab,
  type Program,
  type Adapter,
  type Artifact,
  type ManifestContent,
  type ProtocolContent,
  type Estimate,
  type ResultContent,
  type ComparisonContent,
  type SourceRef,
  type ProjectView,
  type Result,
  type Protocol,
  type Manifest,
  type Comparison,
} from "./artifact-results-model";
import {
  readLegacyResearchExport,
  previewProtocolImport,
  hashSelectedArtifact,
  type ProtocolImportPreview,
  type ImportAssignment,
} from "./artifact-results-import";
import {
  createArtifactResultsStore,
  ARTIFACT_STORAGE_KEY,
  type ArtifactResultsStore,
  type RestorePreview,
  type ClearPreview,
} from "./artifact-results-store";
import {
  artifactUiGeneration,
  artifactPage,
  artifactNumber,
  readArtifactFile,
  artifactJson,
  artifactErrorMessage,
  rawArtifactFormRecovery,
  blankArtifactEstimate,
} from "./artifact-results-ui-helpers";

type Fields = Record<string, string>;
type OpenForm = NonNullable<Draft["form"]>;
const tabs: Record<Tab, string> = {
  projects: "Projects",
  import: "Import old saved work",
  protocol: "Protocol",
  artifacts: "Artifacts",
  results: "Results",
  compare: "Comparison",
  exports: "Packets and recovery",
};
const now = () => new Date().toISOString();
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const nullable = (v: string | undefined) => v?.trim() || null;
const json = (v: unknown) => JSON.stringify(v);
const short = (v: string) => (v.length > 20 ? `${v.slice(0, 16)}…` : v);
const p = (s: string, cls = "") => h("p", { class: cls }, s);
const note = (s: string) => p(s, "ar-note");
const object = (
  v: unknown,
  keys: string[],
  label: string,
): Record<string, unknown> => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw Error(
      `${label} has an unfinished or unrecognized shape. Repair the retained raw fields.`,
    );
  return v as Record<string, unknown>;
};
const fullWarning =
  "Packet JSON contains the whole private register, including unselected projects and saved form fields.";

/** Local research records only. No source fetching, execution, submission or review authority. */
export async function mountArtifactResults(root: HTMLElement): Promise<void> {
  if (root.dataset.artifactMounted) return;
  root.dataset.artifactMounted = "true";
  const mount = root.querySelector(".artifact-results-mount") || root;
  const host = h("div", { class: "ar-workspace" });
  const header = h("div", { class: "ar-header" });
  const nav = h("nav", {
    class: "ar-tabs",
    "aria-label": "Artifact and results views",
  });
  const status = h("p", {
    class: "ar-status",
    role: "status",
    "aria-live": "polite",
    tabindex: "-1",
  });
  const guard = h("div", { class: "ar-guard" });
  const content = h("div", { class: "ar-content", tabindex: "-1" });
  host.append(header, nav, status, guard, content);
  if (mount !== root) clear(mount);
  mount.append(host);
  const epoch = artifactUiGeneration();
  let store: ArtifactResultsStore;
  let tab: Tab = "projects",
    selected: string | null = null,
    form: OpenForm | null = null;
  let dirty = false,
    busy = false,
    pendingRender = false;
  let programFilter =
    root.dataset.artifactProgram === "replication-program"
      ? "replication-program"
      : "methods-lab";
  let projectQuery = "",
    projectPage = 0;
  let history: {
    kind: "protocol" | "manifest" | "result" | "comparison";
    id: string;
  } | null = null;
  const packetProjects = new Set<string>();
  let importBytes: Uint8Array | null = null,
    importName = "",
    importProgram: Program = programFilter as Program;
  let legacy: ReturnType<typeof readLegacyResearchExport> | null = null;
  const importSelected = new Set<string>();
  let importPreview: ProtocolImportPreview | null = null;
  let assignments: ImportAssignment[] = [];
  let importPending = false;
  let restorePreview: RestorePreview | null = null,
    clearPreview: ClearPreview | null = null;
  try {
    store = await createArtifactResultsStore({
      initialState: blankArtifactState(uid(), now()),
    });
    const saved = store.snapshot().state?.draft;
    if (saved) {
      selected = saved.selectedProjectId;
      if (saved.form) {
        form = structuredClone(saved.form);
        tab = saved.tab;
      }
    }
  } catch (error) {
    status.textContent = `The register could not open safely. ${artifactErrorMessage(error)}`;
    return;
  }
  function state(): ArtifactState {
    const s = store.snapshot().state;
    if (!s)
      throw Error(
        "Secure hashing is unavailable. Protected saved bytes can still be downloaded.",
      );
    return s;
  }
  function say(message: string, error = false) {
    status.textContent = message;
    status.classList.toggle("ar-error", error);
  }
  function touch() {
    dirty = true;
    epoch.invalidate();
    updateHeader();
  }
  function b(
    label: string,
    action: () => void | Promise<void>,
    options: { write?: boolean; disabled?: boolean; primary?: boolean } = {},
  ) {
    const button = h(
      "button",
      {
        type: "button",
        class: `ar-button${options.primary ? " ar-primary" : ""}${options.write ? " ar-write" : ""}`,
        disabled:
          options.disabled || (options.write && !store.snapshot().canWrite),
      },
      label,
    );
    button.addEventListener("click", () => {
      if (busy) return;
      try {
        const result = action();
        if (result)
          void result.catch((error) => say(artifactErrorMessage(error), true));
      } catch (error) {
        say(artifactErrorMessage(error), true);
      }
    });
    return button;
  }
  async function work(
    action: () => Promise<void>,
    message = "Checking your current work…",
  ) {
    if (busy) return;
    busy = true;
    const controls = [
      ...host.querySelectorAll<
        | HTMLInputElement
        | HTMLButtonElement
        | HTMLSelectElement
        | HTMLTextAreaElement
      >("input,button,select,textarea"),
    ].map((el) => ({ el, disabled: el.disabled }));
    controls.forEach(({ el }) => (el.disabled = true));
    say(message);
    try {
      await action();
    } catch (error) {
      say(artifactErrorMessage(error), true);
      if (tab === "exports" && store.snapshot().code === "external_change") {
        // The recovery view must expose the newly observed copy immediately.
        // Form data stays in its existing state object; old replacement authority
        // is revoked before rendering fresh recovery controls.
        restorePreview = null;
        clearPreview = null;
        clear(guard);
        pendingRender = true;
      }
    } finally {
      busy = false;
      controls.forEach(({ el, disabled }) => {
        if (el.isConnected) el.disabled = disabled;
      });
      if (pendingRender) {
        pendingRender = false;
        render();
      } else updateHeader();
    }
  }
  function adopted() {
    const draft = store.snapshot().state?.draft;
    form = draft?.form ? structuredClone(draft.form) : null;
    if (draft?.form) tab = draft.tab;
    selected = draft?.selectedProjectId || selected;
    dirty = false;
    epoch.invalidate();
  }
  async function mutate(
    command: ArtifactCommand,
    message: string,
    after?: (noOp: boolean) => void,
  ) {
    await work(async () => {
      const snap = store.snapshot();
      if (!snap.canWrite || !snap.state || !snap.hash)
        throw Error(
          snap.message ||
            "Saving is unavailable. Export your work before recovery.",
        );
      const token = epoch.current();
      const prepared = await prepareArtifactCommand(snap.state, command, {
        expectedStateHash: snap.hash,
        at: now(),
        makeId: uid,
      });
      if (!epoch.matches(token))
        throw Error(
          "Your work changed during checking. Nothing from this action was saved; review it again.",
        );
      const saved = await store.commitPrepared(prepared);
      if (!prepared.noOp) adopted();
      if (after) after(prepared.noOp);
      render();
      say(
        saved.unsaved
          ? `${message} This valid change is only in memory: browser saving failed. Download it or retry saving before closing.`
          : prepared.noOp
            ? `${message} No duplicate version was added; current selection and unfinished fields were retained.`
            : message,
      );
    });
  }
  function rawDraft(): Draft {
    return {
      tab,
      selectedProjectId: selected,
      form: form ? structuredClone(form) : null,
      dirty: Boolean(form),
    };
  }
  async function saveDraft(continuation?: () => void) {
    if (!form) {
      say("There is no open form to save.");
      return;
    }
    const savedForm = structuredClone(form);
    const transient = importPending;
    await mutate(
      { kind: "draft.replace", draft: rawDraft() },
      "Raw form saved. It is unfinished and has not become a research record.",
      () => {
        form = savedForm;
        dirty = false;
        importPending = transient;
        // The raw import draft includes all reviewed assignments but no file bytes or preview authority.
        if (importPreview) {
          importPreview = null;
          importPending = true;
        }
        if (continuation) continuation();
      },
    );
  }
  function askLeave(action: () => void) {
    if (busy) return;
    if (!dirty && !importPending) {
      clear(guard);
      action();
      return;
    }
    clear(guard);
    guard.append(
      h("h3", {}, "Keep these unfinished edits?"),
      p(
        "Your open fields or chosen import are not yet recorded research. A raw form preserves text and exact version bindings; chosen file bytes and preview authority are never saved.",
      ),
      b(
        "Save raw form, then continue",
        async () => {
          await saveDraft(() => {
            importPending = false;
            clear(guard);
            action();
          });
        },
        { write: true, disabled: !form },
      ),
      b("Download unfinished raw form", rawRecovery, { disabled: !form }),
      b("Discard these edits and continue", () => {
        dirty = false;
        importPending = false;
        form = null;
        importPreview = null;
        clear(guard);
        epoch.invalidate();
        action();
      }),
      b("Keep editing", () => {
        clear(guard);
        content
          .querySelector<HTMLElement>("input,select,textarea,button")
          ?.focus();
      }),
    );
    guard.querySelector<HTMLElement>("button")?.focus();
  }
  function goto(next: Tab, id = selected) {
    askLeave(() => {
      tab = next;
      selected = id;
      form = null;
      history = null;
      epoch.invalidate();
      render();
      content.focus();
    });
  }
  function open(
    kind: OpenForm["kind"],
    targetId: string | null,
    fields: Fields,
    next: Tab,
  ) {
    askLeave(() => {
      form = { kind, targetId, fields: structuredClone(fields) };
      dirty = false;
      tab = next;
      history = null;
      epoch.invalidate();
      render();
      content.querySelector<HTMLElement>("input,select,textarea")?.focus();
    });
  }
  function updateHeader() {
    const snap = store.snapshot();
    clear(header);
    header.append(
      h(
        "div",
        {},
        h("h3", {}, "Your artifact and results register"),
        note(
          "Private to this browser and origin. Versions, sources, checksum provenance and times are self-recorded; they do not establish registration or independent review.",
        ),
      ),
      h(
        "div",
        { class: "ar-save-state" },
        h(
          "strong",
          {},
          snap.readOnly
            ? "Read-only"
            : snap.blocked
              ? "Saved copy protected"
              : snap.unsaved
                ? "Not saved to browser"
                : dirty || importPending
                  ? "Uncommitted edits"
                  : "Browser copy ready",
        ),
        note(
          snap.message ||
            "No upload, code execution or background source lookup.",
        ),
      ),
    );
    if (snap.state)
      header.append(
        b("Download current work with open form", downloadCurrent),
        b("Download unfinished raw form", rawRecovery, { disabled: !form }),
      );
    if (snap.state?.draft.form && !form)
      header.append(
        b("Resume saved unfinished form", () =>
          askLeave(() => {
            const saved = state().draft;
            form = saved.form ? structuredClone(saved.form) : null;
            selected = saved.selectedProjectId;
            tab = saved.tab;
            dirty = false;
            epoch.invalidate();
            render();
            say(
              "Saved unfinished fields reopened with their original version bindings. File bytes and import preview authority must be reselected and checked.",
            );
          }),
        ),
      );
    if (!snap.canWrite)
      for (const button of host.querySelectorAll<HTMLButtonElement>(
        ".ar-write",
      ))
        button.disabled = true;
  }
  function render() {
    const focused = [
      ...host.querySelectorAll<HTMLElement>("input,select,textarea"),
    ]
      .find((element) => element === document.activeElement)
      ?.getAttribute("aria-label");
    renderContent();
    if (!busy && focused)
      [...host.querySelectorAll<HTMLElement>("input,select,textarea")]
        .find((element) => element.getAttribute("aria-label") === focused)
        ?.focus();
  }
  function renderContent() {
    if (busy) {
      pendingRender = true;
      return;
    }
    updateHeader();
    clear(nav);
    for (const [key, label] of Object.entries(tabs)) {
      const button = b(label, () => goto(key as Tab));
      button.setAttribute("aria-current", tab === key ? "page" : "false");
      nav.append(button);
    }
    clear(content);
    const snap = store.snapshot();
    if (snap.blocked || snap.unsaved || snap.readOnly)
      content.append(
        h(
          "aside",
          { class: "ar-warning" },
          p(
            snap.message ||
              "Your valid current work is not saved. Export it before recovery.",
          ),
          b("Open recovery controls", () => goto("exports")),
        ),
      );
    if (
      !snap.state ||
      (["corrupt", "read_error"].includes(snap.code) && tab !== "exports")
    ) {
      content.append(
        p(
          "The saved copy could not be validated or read. This view does not substitute empty-register totals for that protected copy.",
        ),
        b("Review recovery choices", () => goto("exports")),
      );
      return;
    }
    if (form) {
      try {
        renderForm();
      } catch (error) {
        clear(content);
        renderRawRepair(error);
      }
      return;
    }
    if (tab === "projects") renderProjects();
    else if (tab === "import") renderImport();
    else if (tab === "protocol") renderProtocol();
    else if (tab === "artifacts") renderArtifacts();
    else if (tab === "results") renderResults();
    else if (tab === "compare") renderComparison();
    else renderExports();
  }
  function input(
    label: string,
    value: string,
    change: (v: string) => void,
    options: {
      type?: string;
      max?: number;
      required?: boolean;
      hint?: string;
      min?: number;
      upper?: number;
      step?: string;
      editing?: boolean;
    } = {},
  ) {
    const control =
      options.type === "textarea"
        ? h("textarea", { rows: 4, maxlength: options.max || 8000 })
        : h("input", {
            type: options.type || "text",
            maxlength: options.max || 8000,
            min: options.min,
            max: options.upper,
            step: options.step,
          });
    control.value = value;
    control.setAttribute("aria-label", label);
    control.required = Boolean(options.required);
    const id = `ar-${uid()}`;
    control.id = id;
    control.addEventListener("input", () => {
      change(control.value);
      if (options.editing !== false) touch();
    });
    const wrapper = h(
      "div",
      { class: "ar-field" },
      h("label", { for: id }, label, options.required ? " (required)" : ""),
      control,
    );
    if (options.hint) {
      const hint = p(options.hint, "ar-note");
      hint.id = `${id}-hint`;
      control.setAttribute("aria-describedby", hint.id);
      wrapper.append(hint);
    }
    return wrapper;
  }
  function select(
    label: string,
    value: string,
    choices: { value: string; label: string }[],
    change: (v: string) => void,
    editing = true,
  ) {
    const id = `ar-${uid()}`;
    const control = h("select", { id, "aria-label": label });
    for (const choice of choices)
      control.append(h("option", { value: choice.value }, choice.label));
    control.value = value;
    control.addEventListener("change", () => {
      change(control.value);
      if (editing) touch();
    });
    return h(
      "div",
      { class: "ar-field" },
      h("label", { for: id }, label),
      control,
    );
  }
  function check(
    label: string,
    checked: boolean,
    change: (v: boolean) => void,
    editing = true,
  ) {
    const control = h("input", { type: "checkbox", "aria-label": label });
    control.checked = checked;
    control.addEventListener("change", () => {
      change(control.checked);
      if (editing) touch();
    });
    return h("label", { class: "ar-check" }, control, h("span", {}, label));
  }
  function fields(): Fields {
    if (!form) throw Error("Open a form first.");
    return form.fields;
  }
  function field(
    key: string,
    label: string,
    options: Parameters<typeof input>[3] = {},
  ) {
    return input(
      label,
      fields()[key] || "",
      (v) => (fields()[key] = v),
      options,
    );
  }
  function choice(
    key: string,
    label: string,
    choices: string[] | { value: string; label: string }[],
  ) {
    return select(
      label,
      fields()[key] || "",
      choices.map((c) => (typeof c === "string" ? { value: c, label: c } : c)),
      (v) => (fields()[key] = v),
    );
  }
  function actions(saveLabel: string, submit: () => void | Promise<void>) {
    content.append(
      h(
        "div",
        { class: "ar-actions" },
        b(saveLabel, submit, { write: true, primary: true }),
        b("Save raw form draft", () => saveDraft(), { write: true }),
        b("Download unfinished raw form", rawRecovery),
        b("Close form", () => goto(tab)),
      ),
    );
  }
  function bindingLine(label: string, value: string) {
    return note(`${label}: ${value || "none (first entry)"}`);
  }
  function pager(
    parent: HTMLElement,
    page: number,
    pages: number,
    total: number,
    change: (v: number) => void,
  ) {
    parent.append(
      h(
        "div",
        { class: "ar-pager" },
        note(`${total} entries · page ${page + 1} of ${pages}`),
        b("Previous page", () => change(page - 1), { disabled: page === 0 }),
        b("Next page", () => change(page + 1), { disabled: page + 1 >= pages }),
      ),
    );
  }
  function current(): ProjectView | null {
    return selected && state().projects.some((x) => x.id === selected)
      ? artifactProjectView(state(), selected)
      : null;
  }
  function selectionRequired(): ProjectView | null {
    const view = current();
    if (!view)
      content.append(
        p(
          "Select a project first. Each new project starts with a frozen, self-recorded protocol.",
        ),
        b("Choose a project", () => goto("projects")),
      );
    return view;
  }
  function renderProjects() {
    content.append(
      h("h3", {}, "Plans and observed work remain separate"),
      p(
        "Freeze assumptions first, describe artifacts, then record sourced results and an explicit comparison. Old versions stay historical. A version is a local record, not a registration or review decision.",
      ),
      h(
        "div",
        { class: "ar-actions" },
        b("Draft a Methods protocol", () => newProtocol("methods-lab"), {
          write: true,
        }),
        b(
          "Draft a Replication protocol",
          () => newProtocol("replication-program"),
          { write: true },
        ),
      ),
      select(
        "Project program",
        programFilter,
        [
          { value: "", label: "Both programs" },
          { value: "methods-lab", label: "Methods Lab" },
          { value: "replication-program", label: "Replication Program" },
        ],
        (v) => {
          programFilter = v;
          projectPage = 0;
          render();
        },
        false,
      ),
      input(
        "Search project titles",
        projectQuery,
        (v) => {
          projectQuery = v;
          projectPage = 0;
          renderProjectList(list);
        },
        { max: 500, editing: false },
      ),
    );
    const list = h("div", { class: "ar-project-list" });
    content.append(list);
    renderProjectList(list);
  }
  function renderProjectList(parent: HTMLElement) {
    clear(parent);
    const rows = state().projects.filter(
      (x) =>
        (!programFilter || x.program === programFilter) &&
        `${x.title} ${state().protocols.find((p) => p.id === x.currentProtocolId)?.content.values.title || ""}`
          .toLowerCase()
          .includes(projectQuery.toLowerCase()),
    );
    const page = artifactPage(rows, projectPage);
    projectPage = page.page;
    if (!rows.length)
      parent.append(
        p(
          "No matching projects. Draft a new protocol or import selected saved work.",
        ),
      );
    for (const project of page.rows) {
      const view = artifactProjectView(state(), project.id);
      parent.append(
        h(
          "article",
          { class: "ar-card" },
          h("h4", {}, project.title),
          p(
            `Current protocol: ${view.currentProtocol.content.values.title} · v${view.currentProtocol.version}`,
          ),
          note(
            `${project.program} · ${view.counts.manifests} manifests · ${view.counts.results} result records · ${view.counts.comparisons} comparisons`,
          ),
          b("Open project", () => goto("protocol", project.id)),
        ),
      );
    }
    pager(parent, page.page, page.pages, page.total, (v) => {
      projectPage = v;
      renderProjectList(parent);
    });
  }
  function newProtocol(program: Program) {
    const adapter = RESEARCH_ARTIFACT_ADAPTERS.find(
      (x) => x.program === program,
    )!;
    open(
      "protocol",
      null,
      {
        adapterId: adapter.id,
        adapterHash: adapter.hash,
        projectId: "",
        expectedProtocolId: "",
        expectedProtocolHash: "",
        resultsKnown: "unknown",
        registration: "null",
        amendmentReason: "",
        ...Object.fromEntries(adapter.fields.map((f) => [f.key, ""])),
      },
      "protocol",
    );
  }
  function amendProtocol(view: ProjectView) {
    const old = view.currentProtocol;
    open(
      "protocol",
      view.project.id,
      {
        adapterId: old.content.adapterId,
        adapterHash: old.content.adapterHash,
        projectId: view.project.id,
        expectedProtocolId: old.id,
        expectedProtocolHash: old.hash,
        resultsKnown: old.content.resultsKnown,
        registration: json(old.content.registration),
        amendmentReason: "",
        ...old.content.values,
      },
      "protocol",
    );
  }
  function renderProtocol() {
    const view = selectionRequired();
    if (!view) return;
    content.append(
      h("h3", {}, view.project.title),
      h(
        "h4",
        {},
        `Current protocol v${view.currentProtocol.version}: ${view.currentProtocol.content.values.title}`,
      ),
      note(
        "Frozen assumptions are not observed outcomes. New amendments do not carry forward a manifest or result.",
      ),
      b("Draft an explicit amendment", () => amendProtocol(view), {
        write: true,
      }),
    );
    showProtocol(view.currentProtocol, content);
    renderHistory(view);
  }
  function showProtocol(entry: Protocol, parent: HTMLElement) {
    const adapter = state().adapters.find(
      (x) => x.id === entry.content.adapterId,
    )!;
    const dl = h("dl", { class: "ar-details" });
    for (const f of adapter.fields)
      dl.append(
        h("dt", {}, f.label),
        h("dd", {}, entry.content.values[f.key] || "Unknown / not supplied"),
      );
    parent.append(
      dl,
      note(
        `Results known when recorded: ${entry.content.resultsKnown}. Recorded locally: ${entry.recordedAt}. Hash: ${entry.hash}`,
      ),
    );
    if (entry.origin)
      parent.append(
        note(
          `Imported saved record ${entry.origin.recordId}; original timestamp ${entry.origin.updatedAt}; chosen-file SHA-256 ${entry.origin.sourceFileHash}. These are self-recorded provenance, not independent verification.`,
        ),
      );
    if (entry.content.registration)
      parent.append(
        note(
          `User-supplied registration reference (unverified): ${entry.content.registration.reference} · ${entry.content.registration.url} · declared date ${entry.content.registration.declaredOn || "unknown"}`,
        ),
      );
    if (entry.amendmentReason)
      parent.append(p(`Amendment reason: ${entry.amendmentReason}`));
  }
  function renderHistory(view: ProjectView) {
    const details = h(
      "details",
      { class: "ar-history" },
      h(
        "summary",
        {},
        "Inspect immutable history (does not change current write bindings)",
      ),
    );
    for (const [kind, rows] of [
      ["protocol", view.history.protocols],
      ["manifest", view.history.manifests],
      ["result", view.history.results],
      ["comparison", view.history.comparisons],
    ] as const)
      for (const row of rows)
        details.append(
          b(
            `Inspect ${kind} ${"version" in row ? `v${row.version}` : short(row.id)}`,
            () => {
              history = { kind, id: row.id };
              render();
            },
          ),
        );
    if (history) {
      const section = h(
        "section",
        { class: "ar-history-reader" },
        h("h4", {}, `Historical ${history.kind}: ${history.id}`),
        note(
          "Inspection only. New entries still bind the project’s current protocol, manifest and result.",
        ),
      );
      if (history.kind === "protocol") {
        const row = view.history.protocols.find((x) => x.id === history!.id);
        if (row) showProtocol(row, section);
      } else if (history.kind === "manifest") {
        const row = view.history.manifests.find((x) => x.id === history!.id);
        if (row) showManifest(row, section);
      } else if (history.kind === "result") {
        const row = view.history.results.find((x) => x.id === history!.id);
        if (row) showResult(row, section);
      } else {
        const row = view.history.comparisons.find((x) => x.id === history!.id);
        if (row) showComparison(row, section);
      }
      section.append(
        b("Close historical inspection", () => {
          history = null;
          render();
        }),
      );
      details.append(section);
      details.open = true;
    }
    content.append(details);
  }
  function renderForm() {
    if (!form) return;
    if (form.kind === "protocol") renderProtocolForm();
    else if (form.kind === "manifest") renderManifestForm();
    else if (form.kind === "result") renderResultForm();
    else if (form.kind === "comparison") renderComparisonForm();
    else renderImport();
  }
  function renderProtocolForm() {
    const f = fields();
    const adapter = RESEARCH_ARTIFACT_ADAPTERS.find(
      (x) => x.id === f.adapterId && x.hash === f.adapterHash,
    );
    if (!adapter)
      throw Error(
        "This saved form has an unknown adapter binding. Its raw values remain available.",
      );
    if (
      !["unknown", "not-known", "partly-known", "known"].includes(
        f.resultsKnown,
      )
    )
      throw Error("Repair the saved results-known choice.");
    const registration = artifactJson<unknown>(
      f.registration,
      "Registration reference",
    );
    if (registration !== null)
      object(
        registration,
        ["url", "reference", "declaredOn"],
        "Registration reference",
      );
    content.append(
      h(
        "h3",
        {},
        f.projectId
          ? "Draft an explicit protocol amendment"
          : "Draft a new protocol",
      ),
      note(
        "Freeze captures stated assumptions. It does not submit a registration, establish an independent reviewer, or turn estimates into observed results.",
      ),
      bindingLine("Captured predecessor", f.expectedProtocolId),
      bindingLine("Captured predecessor hash", f.expectedProtocolHash),
    );
    for (const fieldDef of adapter.fields) {
      if (fieldDef.type === "select")
        content.append(
          select(
            fieldDef.label,
            f[fieldDef.key] || "",
            [{ value: "", label: "Choose…" }, ...fieldDef.options],
            (v) => (f[fieldDef.key] = v),
          ),
        );
      else
        content.append(
          field(fieldDef.key, fieldDef.label, {
            type: fieldDef.type,
            required: fieldDef.required,
            max: fieldDef.maxLength,
            min: fieldDef.min ?? undefined,
            upper: fieldDef.max ?? undefined,
            step: fieldDef.step ?? undefined,
            hint: fieldDef.hint || undefined,
          }),
        );
    }
    content.append(
      choice(
        "resultsKnown",
        "Were results already known when recording these assumptions?",
        [
          { value: "unknown", label: "Unknown" },
          { value: "not-known", label: "Not known" },
          { value: "partly-known", label: "Partly known" },
          { value: "known", label: "Known" },
        ],
      ),
    );
    content.append(
      check(
        "Include a user-supplied registration reference (unverified)",
        registration !== null,
        (enabled) => {
          f.registration = enabled
            ? json({ url: "", reference: "", declaredOn: null })
            : "null";
          render();
        },
      ),
    );
    if (registration !== null) {
      const reg = registration as Record<string, unknown>;
      const update = (key: string, v: string) => {
        f.registration = json({
          ...artifactJson<Record<string, unknown>>(
            f.registration,
            "Registration reference",
          ),
          [key]: key === "declaredOn" ? nullable(v) : v,
        });
      };
      content.append(
        input("Registration URL", text(reg.url), (v) => update("url", v), {
          type: "url",
          max: 1200,
        }),
        input(
          "Registration reference",
          text(reg.reference),
          (v) => update("reference", v),
          { max: 500 },
        ),
        input(
          "Declared registration date",
          text(reg.declaredOn),
          (v) => update("declaredOn", v),
          { type: "date" },
        ),
      );
    }
    if (f.projectId)
      content.append(
        field("amendmentReason", "Reason for this amendment", {
          type: "textarea",
          required: true,
          max: 2000,
          hint: "This creates a new latest version. Even a return to earlier assumptions is a new amendment; old outputs stay historical.",
        }),
      );
    actions("Freeze this protocol", async () => {
      const values = Object.fromEntries(
        adapter.fields.map((x) => [x.key, f[x.key] || ""]),
      );
      const protocol: ProtocolContent = {
        adapterId: adapter.id,
        adapterHash: adapter.hash,
        values,
        resultsKnown: f.resultsKnown as ProtocolContent["resultsKnown"],
        registration: artifactJson(f.registration, "Registration reference"),
      };
      const oldIds = new Set(state().projects.map((x) => x.id));
      await mutate(
        {
          kind: "protocol.freeze",
          projectId: nullable(f.projectId),
          expectedProtocolId: nullable(f.expectedProtocolId),
          expectedProtocolHash: nullable(f.expectedProtocolHash),
          content: protocol,
          amendmentReason: f.amendmentReason || "",
        },
        "Protocol checked and recorded locally.",
        () => {
          selected =
            nullable(f.projectId) ||
            state().projects.find((x) => !oldIds.has(x.id))?.id ||
            selected;
          if (!form) tab = "protocol";
        },
      );
    });
  }
  function newArtifact(): Artifact {
    return {
      id: uid(),
      role: "data",
      title: "",
      fileName: null,
      url: null,
      access: "unknown",
      license: null,
      note: null,
      checksum: null,
    };
  }
  function openManifest(view: ProjectView) {
    const old = view.currentManifest;
    open(
      "manifest",
      view.project.id,
      {
        projectId: view.project.id,
        protocolId: view.currentProtocol.id,
        protocolHash: view.currentProtocol.hash,
        previousId: old?.id || "",
        environment: old?.content.environment || "",
        runInstructions: old?.content.runInstructions || "",
        deviations: old?.content.deviations || "",
        ...Object.fromEntries(
          (old?.content.artifacts || [newArtifact()]).map((a, i) => [
            `artifact${i}`,
            json(a),
          ]),
        ),
      },
      "artifacts",
    );
  }
  function renderArtifacts() {
    const view = selectionRequired();
    if (!view) return;
    content.append(
      h("h3", {}, "Artifacts and a reproducible path"),
      note(
        "Descriptors point to files or explain access. No file is uploaded, fetched or executed. A checksum establishes byte identity only, not a successful run.",
      ),
      b(
        view.currentManifest
          ? "Draft a new manifest version"
          : "Describe a first artifact manifest",
        () => openManifest(view),
        { write: true },
      ),
    );
    if (view.currentManifest) showManifest(view.currentManifest, content);
    else
      content.append(
        p(
          "This protocol has no artifact manifest yet. Older protocol manifests are historical.",
        ),
      );
    renderHistory(view);
  }
  function showManifest(entry: Manifest, parent: HTMLElement) {
    parent.append(
      h("h4", {}, `Manifest v${entry.version}`),
      bindingLine("Protocol", entry.protocolId),
      note(`Manifest hash: ${entry.hash}`),
    );
    for (const a of entry.content.artifacts)
      parent.append(
        h(
          "article",
          { class: "ar-card" },
          h("h5", {}, `${a.role}: ${a.title}`),
          p(
            `Access: ${a.access} · License: ${a.license || "unknown"} · File: ${a.fileName || "not supplied"}`,
          ),
          p(`URL: ${a.url || "not supplied"}`),
          p(a.note || "No descriptor note supplied."),
          note(
            a.checksum
              ? `${a.checksum.kind === "local-bytes" ? "Self-recorded local-byte checksum" : "User-declared checksum"}: ${a.checksum.sha256}${a.checksum.kind === "local-bytes" ? ` · ${a.checksum.byteLength} bytes · locally hashed ${a.checksum.hashedAt}` : ""}`
              : "Checksum unknown.",
          ),
        ),
      );
    parent.append(
      p(`Environment: ${entry.content.environment}`),
      p(`Run instructions: ${entry.content.runInstructions}`),
      p(`Deviations: ${entry.content.deviations}`),
    );
  }
  function renderManifestForm() {
    const f = fields();
    content.append(
      h("h3", {}, "Draft an artifact manifest"),
      bindingLine("Captured protocol", f.protocolId),
      bindingLine("Captured protocol hash", f.protocolHash),
      bindingLine("Previous manifest", f.previousId),
      note(
        "Changing an artifact after freeze creates a new manifest version; prior results keep their exact old binding.",
      ),
    );
    const descriptors: { index: number; value: Artifact }[] = [];
    for (let i = 0; i < 10; i++)
      if (f[`artifact${i}`]) {
        const value = artifactJson<unknown>(
          f[`artifact${i}`],
          `Artifact ${i + 1}`,
        );
        object(
          value,
          [
            "id",
            "role",
            "title",
            "fileName",
            "url",
            "access",
            "license",
            "note",
            "checksum",
          ],
          `Artifact ${i + 1}`,
        );
        const artifact = value as Artifact;
        if (artifact.checksum !== null) {
          const c = object(
            artifact.checksum,
            ["kind", "sha256", "byteLength", "hashedAt"],
            "Artifact checksum",
          );
          if (c.kind !== "declared" && c.kind !== "local-bytes")
            throw Error("The saved artifact checksum kind needs repair.");
        }
        descriptors.push({ index: i, value: artifact });
      }
    for (const { index, value: a } of descriptors) {
      const box = h(
        "fieldset",
        { class: "ar-card" },
        h("legend", {}, `Artifact ${index + 1}`),
      );
      const update = (key: string, value: unknown) => {
        const current = artifactJson<Artifact>(
          f[`artifact${index}`],
          `Artifact ${index + 1}`,
        );
        f[`artifact${index}`] = json({ ...current, [key]: value });
      };
      box.append(
        select(
          `Artifact ${index + 1} role`,
          a.role,
          [
            "protocol",
            "data",
            "code",
            "environment",
            "analysis",
            "output",
            "report",
          ].map((x) => ({ value: x, label: x })),
          (v) => update("role", v),
        ),
        input(
          `Artifact ${index + 1} title`,
          text(a.title),
          (v) => update("title", v),
          { max: 500, required: true },
        ),
        input(
          `Artifact ${index + 1} file name`,
          text(a.fileName),
          (v) => update("fileName", nullable(v)),
          { max: 200 },
        ),
        input(
          `Artifact ${index + 1} HTTPS URL`,
          text(a.url),
          (v) => update("url", nullable(v)),
          { type: "url", max: 1200 },
        ),
        select(
          `Artifact ${index + 1} access`,
          a.access,
          ["unknown", "public", "restricted", "not-shared"].map((x) => ({
            value: x,
            label: x,
          })),
          (v) => update("access", v),
        ),
        input(
          `Artifact ${index + 1} license`,
          text(a.license),
          (v) => update("license", nullable(v)),
          { max: 200 },
        ),
        input(
          `Artifact ${index + 1} note`,
          text(a.note),
          (v) => update("note", nullable(v)),
          { type: "textarea", max: 2000 },
        ),
      );
      if (a.checksum)
        box.append(
          note(
            `${a.checksum.kind === "local-bytes" ? "Self-recorded local-byte checksum" : "User-declared checksum"}: ${a.checksum.sha256}. This is not independently verified file selection or execution.`,
          ),
          b(`Remove artifact ${index + 1} checksum`, () => {
            update("checksum", null);
            touch();
            render();
          }),
        );
      box.append(
        input(
          `Artifact ${index + 1} declared SHA-256`,
          a.checksum?.kind === "declared" ? a.checksum.sha256 : "",
          (v) => update("checksum", v ? { kind: "declared", sha256: v } : null),
          {
            max: 64,
            hint: "A manually entered hash is declared. It does not replace provenance with a verification claim.",
          },
        ),
      );
      const file = h("input", { type: "file" });
      const fileId = `ar-${uid()}`;
      file.id = fileId;
      file.addEventListener("change", () => {
        const selectedFile = file.files?.[0];
        if (!selectedFile) return;
        void work(async () => {
          if (selectedFile.size > ARTIFACT_LIMITS.localFileBytes)
            throw Error(
              "Choose a local artifact no larger than 8 MiB. No file bytes were stored.",
            );
          if (selectedFile.name.length > 200)
            throw Error(
              "Use a file name of at most 200 characters. No file bytes were stored.",
            );
          const active = form,
            token = epoch.current(),
            artifactId = a.id;
          const bytes = new Uint8Array(
            await readArtifactFile(() => selectedFile.arrayBuffer()),
          );
          const checksum = await hashSelectedArtifact(bytes, now());
          if (
            !epoch.matches(token) ||
            form !== active ||
            !form ||
            artifactJson<Artifact>(fields()[`artifact${index}`], "Artifact")
              .id !== artifactId
          )
            throw Error(
              "The form changed during hashing. The late checksum was discarded; select the file again.",
            );
          update("checksum", checksum);
          update("fileName", selectedFile.name);
          touch();
          render();
          say(
            "Self-recorded local-byte checksum added to this unfinished descriptor. File bytes stay on this device and are not saved in the register.",
          );
        }, "Reading one local file and calculating its checksum…");
      });
      box.append(
        h(
          "label",
          { for: fileId },
          `Artifact ${index + 1}: choose a local file to hash (up to 8 MiB)`,
        ),
        file,
        b(`Remove artifact ${index + 1}`, () => {
          const remaining = descriptors
            .filter((x) => x.index !== index)
            .map((x) => f[`artifact${x.index}`]);
          for (let i = 0; i < 10; i++) delete f[`artifact${i}`];
          remaining.forEach((raw, i) => (f[`artifact${i}`] = raw));
          touch();
          render();
        }),
      );
      content.append(box);
    }
    content.append(
      b(
        "Add an artifact descriptor",
        () => {
          const index = Array.from({ length: 10 }, (_, i) => i).find(
            (i) => !f[`artifact${i}`],
          );
          if (index === undefined) return;
          f[`artifact${index}`] = json(newArtifact());
          touch();
          render();
        },
        { disabled: descriptors.length >= 10 },
      ),
      field("environment", "Environment and dependencies", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      field("runInstructions", "Run or inspection instructions", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      field("deviations", "Deviations from the frozen plan", {
        type: "textarea",
        required: true,
        max: 2000,
        hint: "Use an explicit statement such as “none reported” when that is your account.",
      }),
    );
    actions("Freeze artifact manifest", async () => {
      const artifacts: Artifact[] = [];
      let gap = false;
      for (let i = 0; i < 10; i++) {
        if (!f[`artifact${i}`]) gap = true;
        else {
          if (gap)
            throw Error(
              "Artifact entries must be contiguous. Repair or remove the empty slot before recording.",
            );
          artifacts.push(
            artifactJson<Artifact>(f[`artifact${i}`], `Artifact ${i + 1}`),
          );
        }
      }
      const manifest: ManifestContent = {
        artifacts,
        environment: f.environment || "",
        runInstructions: f.runInstructions || "",
        deviations: f.deviations || "",
      };
      await mutate(
        {
          kind: "manifest.freeze",
          projectId: f.projectId,
          protocolId: f.protocolId,
          protocolHash: f.protocolHash,
          previousId: nullable(f.previousId),
          content: manifest,
        },
        "Artifact manifest recorded locally. Earlier versions remain historical.",
      );
    });
  }
  function openResult(view: ProjectView) {
    const m = view.currentManifest;
    if (!m) return;
    const old = view.latestResult;
    const data = old?.content;
    open(
      "result",
      view.project.id,
      {
        projectId: view.project.id,
        protocolId: view.currentProtocol.id,
        protocolHash: view.currentProtocol.hash,
        manifestId: m.id,
        manifestHash: m.hash,
        supersedesId: old?.id || "",
        kind: data?.kind || "not-observed",
        observedOn: data?.observedOn || "",
        summary: data?.summary || "",
        original: json(data?.original || null),
        reported: json(data?.reported || null),
        deviations: data?.deviations || "",
        limitations: data?.limitations || "",
        sourceReferences: json(data?.sourceReferences || []),
        conflicts: json(data?.conflicts || { state: "unknown", note: null }),
      },
      "results",
    );
  }
  function renderResults() {
    const view = selectionRequired();
    if (!view) return;
    content.append(
      h("h3", {}, "Results are recorded separately from the plan"),
      note(
        "Observed, reported-null, inconclusive, stopped and not-observed are distinct user statements. Reported-null does not force an estimate of zero or establish no effect.",
      ),
    );
    if (!view.currentManifest)
      content.append(
        p(
          "Record an artifact manifest for this protocol before recording results.",
        ),
        b("Open artifacts", () => goto("artifacts")),
      );
    else
      content.append(
        b(
          view.latestResult
            ? "Record a superseding result"
            : "Record a first result",
          () => openResult(view),
          { write: true },
        ),
      );
    if (view.latestResult) showResult(view.latestResult, content);
    else
      content.append(
        p(
          "No result has been recorded for the current protocol and manifest. Unknown values have not been replaced by zero.",
        ),
      );
    renderHistory(view);
  }
  function showEstimate(
    label: string,
    estimate: Estimate | null,
    parent: HTMLElement,
  ) {
    if (!estimate) {
      parent.append(note(`${label}: not supplied.`));
      return;
    }
    parent.append(
      h("h5", {}, label),
      p(
        `Estimate: ${estimate.estimate === null ? "unknown" : estimate.estimate} · bounds: ${estimate.lower === null ? "unknown" : estimate.lower} to ${estimate.upper === null ? "unknown" : estimate.upper} · interval level: ${estimate.intervalLevel === null ? "unknown" : estimate.intervalLevel}`,
      ),
      p(
        `Unit: ${estimate.unit || "unknown"} · Measure: ${estimate.measure || "unknown"} · Population: ${estimate.population || "unknown"} · Horizon: ${estimate.timeHorizon || "unknown"} · Denominator: ${estimate.denominator === null ? "unknown" : estimate.denominator}`,
      ),
    );
    if (estimate.source)
      parent.append(
        note(
          `Self-recorded source: ${estimate.source.url} · ${estimate.source.locator || "locator not supplied"}`,
        ),
      );
  }
  function showResult(entry: Result, parent: HTMLElement) {
    parent.append(
      h("h4", {}, `Result: ${entry.content.kind}`),
      p(entry.content.summary),
      note(
        `Observed on: ${entry.content.observedOn || "unknown"} · Locally recorded: ${entry.recordedAt} · Hash: ${entry.hash}`,
      ),
      bindingLine("Exact manifest", entry.manifestId),
    );
    showEstimate(
      "Original / reference estimate",
      entry.content.original,
      parent,
    );
    showEstimate("Later reported estimate", entry.content.reported, parent);
    parent.append(
      p(`Deviations: ${entry.content.deviations}`),
      p(`Limitations: ${entry.content.limitations}`),
      p(
        `Conflicts: ${entry.content.conflicts.state}${entry.content.conflicts.note ? ` · ${entry.content.conflicts.note}` : ""}`,
      ),
    );
    for (const ref of entry.content.sourceReferences)
      parent.append(
        note(
          `Self-recorded later-result source: ${ref.url} · ${ref.locator || "locator not supplied"}`,
        ),
      );
  }
  function estimateWidget(key: "original" | "reported", label: string) {
    const f = fields();
    const raw = artifactJson<unknown>(f[key], label);
    if (raw !== null)
      object(
        raw,
        [
          "estimate",
          "lower",
          "upper",
          "intervalLevel",
          "unit",
          "measure",
          "population",
          "timeHorizon",
          "denominator",
          "source",
        ],
        label,
      );
    const box = h(
      "fieldset",
      { class: "ar-card" },
      h("legend", {}, label),
      check(`Include ${label.toLowerCase()}`, raw !== null, (enabled) => {
        f[key] = json(enabled ? blankArtifactEstimate() : null);
        render();
      }),
    );
    if (raw === null) return box;
    const data = raw as Record<string, unknown>;
    const update = (field: string, value: unknown) =>
      (f[key] = json({
        ...artifactJson<Record<string, unknown>>(f[key], label),
        [field]: value,
      }));
    for (const [field, title] of [
      ["estimate", "Estimate"],
      ["lower", "Lower interval endpoint"],
      ["upper", "Upper interval endpoint"],
      ["intervalLevel", "Interval level (0–1)"],
      ["denominator", "Denominator"],
    ] as const)
      box.append(
        input(
          `${label}: ${title}`,
          text(data[field]),
          (v) => update(field, v),
          {
            type: "text",
            max: 100,
            hint: "Blank means unknown. An explicitly entered 0 is retained.",
          },
        ),
      );
    for (const [field, title] of [
      ["unit", "Unit"],
      ["measure", "Measure"],
      ["population", "Population"],
      ["timeHorizon", "Time horizon"],
    ] as const)
      box.append(
        input(
          `${label}: ${title}`,
          text(data[field]),
          (v) => update(field, nullable(v)),
          { max: 500 },
        ),
      );
    if (data.source !== null)
      object(data.source, ["url", "locator"], `${label} source`);
    const source = (data.source || { url: "", locator: null }) as SourceRef;
    const changeSource = (field: "url" | "locator", value: string) => {
      const current = artifactJson<Record<string, unknown>>(f[key], label);
      const next = {
        ...(current.source
          ? (current.source as SourceRef)
          : { url: "", locator: null }),
        [field]: field === "locator" ? nullable(value) : value,
      };
      update("source", !next.url && !next.locator ? null : next);
    };
    box.append(
      input(
        `${label}: source HTTPS URL`,
        source.url,
        (v) => changeSource("url", v),
        { type: "url", max: 1200 },
      ),
      input(
        `${label}: source locator`,
        text(source.locator),
        (v) => changeSource("locator", v),
        { max: 500 },
      ),
    );
    return box;
  }
  function parsedEstimate(raw: string, label: string): Estimate | null {
    const value = artifactJson<Record<string, unknown> | null>(raw, label);
    if (value === null) return null;
    object(
      value,
      [
        "estimate",
        "lower",
        "upper",
        "intervalLevel",
        "unit",
        "measure",
        "population",
        "timeHorizon",
        "denominator",
        "source",
      ],
      label,
    );
    return {
      estimate: artifactNumber(text(value.estimate), `${label} estimate`),
      lower: artifactNumber(text(value.lower), `${label} lower bound`),
      upper: artifactNumber(text(value.upper), `${label} upper bound`),
      intervalLevel: artifactNumber(
        text(value.intervalLevel),
        `${label} interval level`,
      ),
      denominator: artifactNumber(
        text(value.denominator),
        `${label} denominator`,
      ),
      unit: nullable(text(value.unit)),
      measure: nullable(text(value.measure)),
      population: nullable(text(value.population)),
      timeHorizon: nullable(text(value.timeHorizon)),
      source: value.source as SourceRef | null,
    };
  }
  function renderResultForm() {
    const f = fields();
    const refs = artifactJson<SourceRef[]>(
      f.sourceReferences,
      "Later-result references",
    );
    if (!Array.isArray(refs) || refs.length > 4)
      throw Error(
        "Later-result references need a list of at most four entries.",
      );
    refs.forEach((ref) => object(ref, ["url", "locator"], "Source reference"));
    const conflicts = object(
      artifactJson(f.conflicts, "Conflicts"),
      ["state", "note"],
      "Conflicts",
    );
    if (
      !["unknown", "declared-none", "declared"].includes(text(conflicts.state))
    )
      throw Error("Repair the saved conflict declaration.");
    content.append(
      h("h3", {}, "Record a sourced result"),
      bindingLine("Captured protocol", f.protocolId),
      bindingLine("Captured manifest", f.manifestId),
      bindingLine("Superseded result", f.supersedesId),
      choice("kind", "Result kind", [
        "observed",
        "reported-null",
        "inconclusive",
        "stopped",
        "not-observed",
      ]),
      field("observedOn", "Observed or reported result date", { type: "date" }),
      field("summary", "Result summary", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      note(
        "For observed or reported-null, supply a later-result reference or a source for the later reported estimate. An original source alone does not support the later result.",
      ),
      estimateWidget("original", "Original estimate"),
      estimateWidget("reported", "Later reported estimate"),
    );
    refs.forEach((ref, index) => {
      const box = h(
        "fieldset",
        { class: "ar-card" },
        h("legend", {}, `Later-result reference ${index + 1}`),
      );
      const change = (key: string, value: string) => {
        const current = artifactJson<SourceRef[]>(
          f.sourceReferences,
          "References",
        );
        current[index] = {
          ...current[index],
          [key]: key === "locator" ? nullable(value) : value,
        };
        f.sourceReferences = json(current);
      };
      box.append(
        input(
          `Reference ${index + 1} HTTPS URL`,
          ref.url,
          (v) => change("url", v),
          { type: "url", max: 1200 },
        ),
        input(
          `Reference ${index + 1} locator`,
          text(ref.locator),
          (v) => change("locator", v),
          { max: 500 },
        ),
        b(`Remove reference ${index + 1}`, () => {
          const current = artifactJson<SourceRef[]>(
            f.sourceReferences,
            "References",
          );
          current.splice(index, 1);
          f.sourceReferences = json(current);
          touch();
          render();
        }),
      );
      content.append(box);
    });
    content.append(
      b(
        "Add a later-result reference",
        () => {
          f.sourceReferences = json([
            ...artifactJson<SourceRef[]>(f.sourceReferences, "References"),
            { url: "", locator: null },
          ]);
          touch();
          render();
        },
        { disabled: refs.length >= 4 },
      ),
      field("deviations", "Result deviations", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      field("limitations", "Result limitations", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      select(
        "Conflicts declaration",
        text(conflicts.state),
        ["unknown", "declared-none", "declared"].map((x) => ({
          value: x,
          label: x,
        })),
        (v) =>
          (f.conflicts = json({
            ...artifactJson<Record<string, unknown>>(f.conflicts, "Conflicts"),
            state: v,
          })),
      ),
      input(
        "Conflicts note",
        text(conflicts.note),
        (v) =>
          (f.conflicts = json({
            ...artifactJson<Record<string, unknown>>(f.conflicts, "Conflicts"),
            note: nullable(v),
          })),
        { type: "textarea", max: 2000 },
      ),
    );
    actions("Record this result", async () => {
      const result: ResultContent = {
        kind: f.kind as ResultContent["kind"],
        observedOn: nullable(f.observedOn),
        summary: f.summary || "",
        original: parsedEstimate(f.original, "Original estimate"),
        reported: parsedEstimate(f.reported, "Later reported estimate"),
        deviations: f.deviations || "",
        limitations: f.limitations || "",
        sourceReferences: artifactJson(f.sourceReferences, "References"),
        conflicts: artifactJson(f.conflicts, "Conflicts"),
      };
      await mutate(
        {
          kind: "result.record",
          projectId: f.projectId,
          protocolId: f.protocolId,
          protocolHash: f.protocolHash,
          manifestId: f.manifestId,
          manifestHash: f.manifestHash,
          supersedesId: nullable(f.supersedesId),
          content: result,
        },
        "Result recorded locally with its exact protocol and manifest.",
      );
    });
  }
  function openComparison(view: ProjectView) {
    const result = view.latestResult;
    if (!result) return;
    const old = view.latestComparison;
    open(
      "comparison",
      view.project.id,
      {
        resultId: result.id,
        resultHash: result.hash,
        supersedesId: old?.id || "",
        compatible: String(old?.content.compatible || false),
        compatibilityReason: old?.content.compatibilityReason || "",
        showDifference: String(old?.content.showDifference || false),
        interpretation: old?.content.interpretation || "",
        limitations: old?.content.limitations || "",
        nextCheck: old?.content.nextCheck || "",
      },
      "compare",
    );
  }
  function renderComparison() {
    const view = selectionRequired();
    if (!view) return;
    content.append(
      h("h3", {}, "Compare explicitly, with limits"),
      note(
        "No automatic replication verdict, pooled estimate, causal claim or significance label is computed. A simple later-minus-original difference is available only for exactly compatible known measures.",
      ),
    );
    if (view.latestResult)
      content.append(
        b(
          view.latestComparison
            ? "Record a superseding comparison"
            : "Draft a comparison",
          () => openComparison(view),
          { write: true },
        ),
      );
    else
      content.append(
        p(
          "Record a result for the current protocol and artifact manifest first.",
        ),
      );
    if (view.latestComparison) showComparison(view.latestComparison, content);
    renderHistory(view);
  }
  function showComparison(entry: Comparison, parent: HTMLElement) {
    const result = state().results.find((x) => x.id === entry.resultId);
    const difference = result
      ? artifactDifference(result, entry.content)
      : { value: null, reasons: ["Bound result unavailable."] };
    parent.append(
      h("h4", {}, "Recorded comparison"),
      p(
        `Compatibility declared: ${entry.content.compatible ? "yes" : "no"} · ${entry.content.compatibilityReason}`,
      ),
      p(entry.content.interpretation),
      p(`Limitations: ${entry.content.limitations}`),
      p(`Next check: ${entry.content.nextCheck}`),
      note(`Exact result: ${entry.resultId} · Comparison hash: ${entry.hash}`),
      p(
        difference.value === null
          ? `Difference unavailable: ${difference.reasons.join(" ")}`
          : `Later minus original: ${difference.value}. No unit conversion or interval arithmetic was performed.`,
      ),
    );
  }
  function comparisonContent(): ComparisonContent {
    const f = fields();
    if (
      !["true", "false"].includes(f.compatible) ||
      !["true", "false"].includes(f.showDifference)
    )
      throw Error("Repair the retained boolean choices before recording.");
    return {
      compatible: f.compatible === "true",
      compatibilityReason: f.compatibilityReason || "",
      showDifference: f.showDifference === "true",
      interpretation: f.interpretation || "",
      limitations: f.limitations || "",
      nextCheck: f.nextCheck || "",
    };
  }
  function renderComparisonForm() {
    const f = fields();
    comparisonContent();
    content.append(
      h("h3", {}, "Draft an explicit comparison"),
      bindingLine("Captured result", f.resultId),
      bindingLine("Captured result hash", f.resultHash),
      bindingLine("Superseded comparison", f.supersedesId),
      check(
        "I declare these estimates compatible for the stated comparison",
        f.compatible === "true",
        (v) => (f.compatible = String(v)),
      ),
      field("compatibilityReason", "Compatibility reason", {
        type: "textarea",
        required: true,
        max: 2000,
        hint: "Explain unit, measure, population and time horizon. Known labels must match exactly for a numerical difference.",
      }),
      check(
        "Request the simple later-minus-original difference",
        f.showDifference === "true",
        (v) => (f.showDifference = String(v)),
      ),
      field("interpretation", "Interpretation", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      field("limitations", "Comparison limitations", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      field("nextCheck", "Next check", {
        type: "textarea",
        required: true,
        max: 2000,
      }),
      b("Check whether a difference is available", () => {
        const result = state().results.find((x) => x.id === f.resultId);
        if (!result) {
          say("The exact bound result is unavailable.", true);
          return;
        }
        const difference = artifactDifference(result, comparisonContent());
        say(
          difference.value === null
            ? `Difference unavailable: ${difference.reasons.join(" ")}`
            : `Later minus original: ${difference.value}. This does not establish causality or significance.`,
        );
      }),
    );
    actions("Record this comparison", async () => {
      await mutate(
        {
          kind: "comparison.record",
          resultId: f.resultId,
          resultHash: f.resultHash,
          supersedesId: nullable(f.supersedesId),
          content: comparisonContent(),
        },
        "Comparison recorded locally. No independent assessment was inferred.",
      );
    });
  }
  function importDraftUpdate() {
    if (!form || form.kind !== "import") return;
    form.fields.program = importProgram;
    form.fields.selectedRecordIds = json([...importSelected]);
    for (let i = 0; i < 20; i++) delete form.fields[`assignment${i}`];
    assignments.forEach((a, i) => (form!.fields[`assignment${i}`] = json(a)));
  }
  function restoredImport() {
    if (!form || form.kind !== "import") return;
    const f = fields();
    if (!["methods-lab", "replication-program"].includes(f.program))
      throw Error("Repair the retained import program.");
    const selectedIds = artifactJson<unknown>(
      f.selectedRecordIds,
      "Selected saved records",
    );
    if (
      !Array.isArray(selectedIds) ||
      selectedIds.some((x) => typeof x !== "string")
    )
      throw Error("Selected saved records must remain a list of record IDs.");
    if (!importBytes) {
      importProgram = f.program as Program;
      importSelected.clear();
      selectedIds.forEach((x) => importSelected.add(x));
      assignments = [];
      for (let i = 0; i < 20; i++)
        if (f[`assignment${i}`])
          assignments.push(
            artifactJson<ImportAssignment>(
              f[`assignment${i}`],
              `Import assignment ${i + 1}`,
            ),
          );
    }
  }
  function renderImport() {
    restoredImport();
    content.append(
      h("h3", {}, "Import selected saved work from a chosen file"),
      p(
        "Choose an exported Methods Lab or Replication Program JSON file. Only explicitly selected saved records become protocols. Its unfinished draft and editing selection are excluded. No old browser storage key is read.",
      ),
      note(
        "A changed source snapshot requires an explicit amendment of the exact current version. An identical imported identity does not create a duplicate or move current history back.",
      ),
    );
    content.append(
      select(
        "Legacy file program",
        importProgram,
        [
          { value: "methods-lab", label: "Methods Lab" },
          { value: "replication-program", label: "Replication Program" },
        ],
        (v) => {
          if (importBytes || form) {
            say(
              "Close or discard the current import before changing its program.",
              true,
            );
            render();
            return;
          }
          importProgram = v as Program;
          touch();
        },
      ),
    );
    const file = h("input", { type: "file", accept: ".json,application/json" });
    const id = `ar-${uid()}`;
    file.id = id;
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      void work(async () => {
        if (chosen.size > ARTIFACT_LIMITS.legacyBytes)
          throw Error(
            "Choose a legacy export no larger than 2 MiB. No data was imported.",
          );
        const active = form,
          token = epoch.current();
        const bytes = new Uint8Array(
          await readArtifactFile(() => chosen.arrayBuffer()),
        );
        const parsed = readLegacyResearchExport(bytes, importProgram);
        const checksum = await hashSelectedArtifact(bytes, now());
        if (!epoch.matches(token) || form !== active)
          throw Error(
            "The import changed while the file was read. Choose it again; no records were changed.",
          );
        if (
          form?.kind === "import" &&
          form.fields.sourceFileHash &&
          form.fields.sourceFileHash !== checksum.sha256
        )
          throw Error(
            "This file differs from the saved draft’s exact byte hash. Keep the raw draft or discard it before choosing a different file.",
          );
        importBytes = bytes;
        importName = chosen.name;
        legacy = parsed;
        importPreview = null;
        if (!form || form.kind !== "import") {
          form = {
            kind: "import",
            targetId: null,
            fields: {
              program: importProgram,
              sourceFileHash: checksum.sha256,
              selectedRecordIds: "[]",
            },
          };
          importSelected.clear();
          assignments = [];
        } else form.fields.sourceFileHash = checksum.sha256;
        importPending = true;
        dirty = true;
        epoch.invalidate();
        render();
        say(
          "File read locally. Choose saved records, then generate a fresh preview. Unfinished source drafts are excluded.",
        );
      }, "Reading the selected legacy export…");
    });
    content.append(
      h(
        "label",
        { for: id },
        "Choose a local legacy JSON export (up to 2 MiB)",
      ),
      file,
    );
    if (form?.kind === "import")
      content.append(
        note(
          `Exact chosen-file hash: ${fields().sourceFileHash || "not yet captured"}. Reselecting a saved draft always requires the same bytes and a fresh preview.`,
        ),
      );
    if (!legacy || !importBytes) {
      content.append(
        p(
          "No file bytes are retained after reload. Reselect the exact source file to continue a saved import draft.",
        ),
      );
      if (form?.kind === "import")
        content.append(
          b(
            "Save import mapping and assignments as a raw draft",
            () => saveDraft(),
            { write: true },
          ),
          b("Download unfinished raw form", rawRecovery),
        );
      return;
    }
    content.append(
      note(
        `${legacy.export.records.length} saved source records. ${Object.keys(legacy.export.draft).length ? "The source unfinished draft is excluded." : "No source draft will be imported."}`,
      ),
    );
    for (const record of legacy.export.records)
      content.append(
        check(
          `Select saved record: ${record.values.title} (${record.id})`,
          importSelected.has(record.id),
          (checked) => {
            if (checked && importSelected.size >= 20) {
              say("Select at most 20 saved records per import.", true);
              render();
              return;
            }
            checked
              ? importSelected.add(record.id)
              : importSelected.delete(record.id);
            importPreview = null;
            assignments = [];
            importPending = true;
            importDraftUpdate();
            render();
          },
        ),
      );
    content.append(
      b(
        "Preview selected saved records",
        () =>
          work(async () => {
            const snap = store.snapshot();
            if (!snap.state || !snap.hash || !importBytes)
              throw Error(
                "A valid current register and selected file are required.",
              );
            const token = epoch.current();
            const bytes = importBytes;
            const preview = await previewProtocolImport(
              snap.state,
              {
                kind: "legacy-research-json",
                bytes,
                fileName: importName,
                program: importProgram,
                selectedRecordIds: [...importSelected],
              },
              snap.hash,
            );
            if (!epoch.matches(token) || importBytes !== bytes)
              throw Error(
                "The file, selection or register changed. Generate a fresh preview.",
              );
            const savedAssignments = assignments;
            assignments = preview.rows.map(
              (row) =>
                savedAssignments.find((x) => x.recordId === row.recordId) || {
                  recordId: row.recordId,
                  target: { kind: "new" },
                },
            );
            importPreview = preview;
            importPending = true;
            importDraftUpdate();
            render();
            say(
              "Preview ready. Review each assignment and its exact current predecessor. Nothing has been imported.",
            );
          }, "Checking exact selected saved records…"),
        { write: true, disabled: !importSelected.size },
      ),
      b(
        "Save import mapping and assignments as a raw draft",
        () => saveDraft(),
        { write: true },
      ),
      b("Download unfinished raw form", rawRecovery),
    );
    if (!importPreview) return;
    content.append(
      h("h4", {}, "Explicit row assignments"),
      note(
        `Review hash ${importPreview.reviewHash}. Minimum future backup ${importPreview.capacity.backupBytesMinimum} bytes. File and selection changes require another preview; assignment changes are checked again at commit.`,
      ),
    );
    for (const [index, row] of importPreview.rows.entries()) {
      const assignment = assignments[index];
      const box = h(
        "fieldset",
        { class: "ar-card" },
        h("legend", {}, row.title),
        note(
          `Source saved record: ${row.recordId} · ${row.existingProtocolId ? `Exact identity already exists as ${row.existingProtocolId}; import will not select it as current.` : "New source identity."}`,
        ),
      );
      if (row.issues.length)
        box.append(p(row.issues.map((x) => x.message).join(" "), "ar-error"));
      const candidates = state().projects.filter(
        (project) =>
          project.program === importProgram &&
          (!row.changedSourceProjectIds.length ||
            row.changedSourceProjectIds.includes(project.id)),
      );
      const choices = [
        {
          value: "new",
          label: row.changedSourceProjectIds.length
            ? "New project is unavailable for changed source identity"
            : "Create a new project",
        },
        ...candidates.map((project) => ({
          value: project.id,
          label: `Amend current: ${project.title}`,
        })),
      ];
      box.append(
        select(
          `Assignment for ${row.recordId}`,
          assignment.target.kind === "new"
            ? "new"
            : assignment.target.projectId,
          choices,
          (value) => {
            if (value === "new")
              assignments[index] = {
                recordId: row.recordId,
                target: { kind: "new" },
              };
            else {
              const view = artifactProjectView(state(), value);
              assignments[index] = {
                recordId: row.recordId,
                target: {
                  kind: "amend",
                  projectId: value,
                  expectedProtocolId: view.currentProtocol.id,
                  expectedProtocolHash: view.currentProtocol.hash,
                  reason: "",
                },
              };
            }
            importPending = true;
            importDraftUpdate();
            render();
          },
        ),
      );
      if (assignment.target.kind === "amend") {
        const target = assignment.target;
        box.append(
          bindingLine("Captured predecessor", target.expectedProtocolId),
          bindingLine("Captured predecessor hash", target.expectedProtocolHash),
          input(
            `Amendment reason for ${row.recordId}`,
            target.reason,
            (value) => {
              target.reason = value;
              importPending = true;
              importDraftUpdate();
            },
            { type: "textarea", max: 2000, required: true },
          ),
        );
      }
      content.append(box);
    }
    content.append(
      b(
        "Commit all reviewed import assignments",
        async () => {
          if (!importPreview) return;
          const command: ArtifactCommand = {
            kind: "protocol.import",
            preview: importPreview,
            assignments: structuredClone(assignments),
          };
          await mutate(
            command,
            "Selected saved records checked and imported locally.",
            (noOp) => {
              if (noOp) return;
              importPreview = null;
              importBytes = null;
              legacy = null;
              importSelected.clear();
              assignments = [];
              importPending = false;
              dirty = false;
              if (!form) tab = "projects";
            },
          );
        },
        { write: true, primary: true },
      ),
    );
  }
  function rawRecovery() {
    if (!form) {
      say("There is no open raw form to download.");
      return;
    }
    download(
      "charitology-unfinished-artifact-form.txt",
      rawArtifactFormRecovery(structuredClone(form), now()),
    );
    say(
      "Unfinished raw form recovery download requested. This plain text is not a valid backup or research record; your unsaved warning remains.",
    );
  }
  async function downloadCurrent() {
    await work(async () => {
      const token = epoch.current();
      const copy = structuredClone(state());
      if (form) copy.draft = rawDraft();
      const raw = await makeArtifactBackup(copy, now());
      if (!epoch.matches(token))
        throw Error(
          "The form changed while preparing this backup. Download it again.",
        );
      download(
        "charitology-artifact-results-with-form.json",
        raw,
        "application/json;charset=utf-8",
      );
      say(
        "Private full-register backup download requested, including the current open form. This does not mark edits as saved to browser storage.",
      );
    }, "Preparing a complete private backup…");
  }
  function renderRawRepair(error: unknown) {
    if (!form) return;
    content.append(
      h("h3", {}, "Repair an unfinished raw form"),
      p(artifactErrorMessage(error), "ar-error"),
      p(
        "These are the exact retained field strings, including captured version IDs and hashes. Nothing has been retargeted or shortened. Repair only the malformed field, then reopen the structured form. Raw JSON is a recovery route, not the normal record-entry form.",
      ),
      note(
        `Form kind: ${form.kind} · target: ${form.targetId || "new project / no target"}`,
      ),
    );
    for (const key of Object.keys(form.fields))
      content.append(
        field(key, `Raw field: ${key}`, {
          type: "textarea",
          max: ARTIFACT_LIMITS.draftFieldChars,
        }),
      );
    content.append(
      b("Try the structured form again", () => render()),
      b("Save repaired raw form", () => saveDraft(), { write: true }),
      b("Download unfinished raw form", rawRecovery),
      b("Close raw form", () => goto(tab)),
    );
  }
  function renderExports() {
    content.append(
      h("h3", {}, "Export, inspect and recover private work"),
      p(
        "Backups contain the whole register and saved unfinished fields. Keep them somewhere private. A packet’s selected CSV and memo cover only its selected project closure; packet JSON contains the whole private register.",
      ),
    );
    if (store.snapshot().state) {
      content.append(
        b("Download canonical register without open form edits", () =>
          work(async () => {
            const token = epoch.current();
            const raw = await store.backup(now());
            if (!epoch.matches(token))
              throw Error("The register changed; download again.");
            download(
              "charitology-artifact-results-canonical.json",
              raw,
              "application/json;charset=utf-8",
            );
            say(
              "Canonical workspace backup download requested. It excludes newer open form edits; download those separately as raw recovery text.",
            );
          }),
        ),
        b("Download unfinished raw form", rawRecovery, { disabled: !form }),
      );
      content.append(h("h4", {}, "Select projects for CSV and memo"));
      for (const project of state().projects)
        content.append(
          check(
            `Include project: ${project.title}`,
            packetProjects.has(project.id),
            (checked) => {
              checked
                ? packetProjects.add(project.id)
                : packetProjects.delete(project.id);
              epoch.invalidate();
            },
            false,
          ),
        );
      const selectedIds = () => [...packetProjects].sort();
      content.append(
        b("Download selected CSV files", () => {
          try {
            const csv = artifactCsvExports(state(), selectedIds());
            for (const [name, body] of Object.entries(csv))
              download(
                `charitology-${name}.csv`,
                body,
                "text/csv;charset=utf-8",
              );
            say(
              "Selected-project CSV downloads requested. Blank numeric cells mean unknown; zero remains zero.",
            );
          } catch (error) {
            say(artifactErrorMessage(error), true);
          }
        }),
        b("Download selected Markdown memo", () => {
          try {
            download(
              "charitology-artifact-results-memo.md",
              artifactMarkdownPacket(state(), selectedIds()),
            );
            say(
              "Selected-project memo download requested. It is a self-recorded research account.",
            );
          } catch (error) {
            say(artifactErrorMessage(error), true);
          }
        }),
      );
      const warning = h(
        "aside",
        { class: "ar-warning" },
        p(fullWarning),
        p(
          "A packet descriptor pins only the selected project closure. It does not preserve an unchanged unselected workspace or raw draft; keep the actual downloaded JSON if you need that exact earlier workspace.",
        ),
      );
      let accepted = false;
      const make = b(
        "Record packet and download full private JSON",
        async () => {
          if (!accepted) {
            say("Acknowledge the whole-register JSON warning first.", true);
            return;
          }
          const oldIds = new Set(state().packets.map((x) => x.id));
          await mutate(
            { kind: "packet.record", projectIds: selectedIds() },
            "Packet descriptor recorded for the selected closure.",
            () => {
              tab = "exports";
            },
          );
          const packet = state().packets.find((x) => !oldIds.has(x.id));
          if (packet) await downloadPacket(packet.id);
        },
        { write: true, disabled: true, primary: true },
      );
      warning.append(
        check(
          "I understand that packet JSON also includes unselected projects and saved raw fields",
          false,
          (value) => {
            accepted = value;
            make.disabled = !value || !store.snapshot().canWrite;
          },
          false,
        ),
        make,
      );
      content.append(warning);
      for (const packet of state().packets)
        content.append(
          h(
            "article",
            { class: "ar-card" },
            h("h5", {}, `Packet ${short(packet.id)}`),
            note(
              `Selected projects: ${packet.projectIds.join(", ")} · selected input hash ${packet.inputHash} · locally recorded ${packet.recordedAt}`,
            ),
            p(fullWarning),
            b(
              "Download this packet’s current full JSON and selected files",
              () => downloadPacket(packet.id),
            ),
          ),
        );
    }
    content.append(
      h("h4", {}, "Guarded browser-copy recovery"),
      p(
        "Preview a replacement before applying it. Restore, clear and undo compare the exact saved bytes under a Web Lock. If another tab changed the saved copy, review that conflict explicitly instead of overwriting it.",
      ),
    );
    const savedBytes = store.rawSavedCopy();
    content.append(
      b(
        "Download protected raw saved bytes (unverified)",
        () => {
          const raw = store.rawSavedCopy();
          if (typeof raw !== "string") {
            say(
              "The saved bytes are absent or unreadable; no empty copy was substituted.",
              true,
            );
            return;
          }
          const recovery = rawStorageRecoveryDownload(raw);
          download(
            `charitology-artifact-results-protected-raw.${recovery.wrapped ? "json" : "txt"}`,
            recovery.text,
          );
          say(
            recovery.wrapped
              ? "Protected UTF-16 text recovery requested as escaped JSON, preserving every code unit. This is not a validated backup."
              : "Exact protected bytes download requested. They may be corrupt and are not being labeled a validated backup.",
          );
        },
        { disabled: typeof savedBytes !== "string" },
      ),
    );
    const observedCopy = store.snapshot().observedRaw;
    if (typeof observedCopy === "string" && observedCopy !== savedBytes) {
      content.append(
        p(
          "The last observed saved text differs from the protected original. Preserve both before replacing either.",
        ),
        b("Download last observed saved text", () => {
          const recovery = rawStorageRecoveryDownload(observedCopy);
          download(
            `charitology-artifact-results-last-observed.${recovery.wrapped ? "json" : "txt"}`,
            recovery.text,
          );
          say(
            "A last-observed text recovery download was requested. The protected original remains separately available; no replacement was made.",
          );
        }),
      );
    }
    const restore = h("input", {
      type: "file",
      accept: ".json,application/json",
    });
    const restoreId = `ar-${uid()}`;
    restore.id = restoreId;
    restore.disabled = !store.snapshot().canRecover;
    restore.addEventListener("change", () => {
      const file = restore.files?.[0];
      if (!file) return;
      void work(async () => {
        if (file.size > ARTIFACT_LIMITS.backupBytes)
          throw Error(
            "A backup must be no larger than 2 MiB. Your current work was not replaced.",
          );
        const token = epoch.current();
        const raw = new Uint8Array(
          await readArtifactFile(() => file.arrayBuffer()),
        );
        const preview = await store.previewRestore(raw);
        if (!epoch.matches(token))
          throw Error(
            "Your current work changed during backup checking. Choose the backup again.",
          );
        restorePreview = preview;
        clearPreview = null;
        showRecoveryPreview();
        say("Validated replacement preview ready. Nothing has been replaced.");
      }, "Reading and checking the proposed backup…");
    });
    content.append(
      h(
        "label",
        { for: restoreId },
        "Choose a full workspace backup to preview",
      ),
      restore,
      b(
        "Review clearing this register",
        () =>
          work(async () => {
            const preview = await store.previewClear(
              blankArtifactState(uid(), now()),
            );
            clearPreview = preview;
            restorePreview = null;
            showRecoveryPreview();
            say("Clear preview ready. Your current work has not been removed.");
          }),
        { disabled: !store.snapshot().canRecover },
      ),
      b(
        "Retry saving the current valid in-memory candidate",
        () =>
          work(async () => {
            const saved = await store.retryPersist();
            epoch.invalidate();
            render();
            say(
              saved.unsaved
                ? "Saving still failed. This valid candidate remains only in memory; export before closing."
                : "The same valid candidate was saved. No research command was replayed.",
            );
          }),
        { disabled: !store.snapshot().canRetryPersist },
      ),
      b("Review reloading the browser copy", () => {
        clear(guard);
        guard.append(
          h("h3", {}, "Reload the saved browser copy?"),
          p(
            "This discards open edits, uncommitted imports and any valid unsaved in-memory candidate. Export them first.",
          ),
          b("Discard local edits and reload saved copy", () =>
            work(async () => {
              const reloaded = await store.reload({ discardUnsaved: true });
              adopted();
              importPending = false;
              importBytes = null;
              legacy = null;
              importPreview = null;
              restorePreview = null;
              clearPreview = null;
              clear(guard);
              render();
              say(
                reloaded.code === "ready"
                  ? "Browser copy reloaded and validated; earlier local edits were discarded."
                  : `Local edits were discarded, but the saved copy could not be opened for writing. ${reloaded.message || "Its bytes remain protected; no validated saved copy is claimed."}`,
                reloaded.code !== "ready",
              );
            }),
          ),
          b("Keep current work", () => clear(guard)),
        );
        guard.querySelector<HTMLElement>("button")?.focus();
      }),
      b(
        "Review undoing the last local save",
        () => {
          clear(guard);
          guard.append(
            h("h3", {}, "Undo the last local save?"),
            p(
              "This replaces the current candidate with the previous local state, including its previous raw draft. Export newer work first. Another writer blocks undo.",
            ),
            b("Undo the last local save", () =>
              work(async () => {
                const saved = await store.undo();
                adopted();
                importPending = false;
                importBytes = null;
                importName = "";
                legacy = null;
                importPreview = null;
                assignments = [];
                importSelected.clear();
                restorePreview = null;
                clearPreview = null;
                clear(guard);
                render();
                say(
                  saved.unsaved
                    ? "The prior valid state is now in memory only. Browser saving failed; saved bytes were not replaced. Export or retry."
                    : "The previous local state was restored to browser storage.",
                );
              }),
            ),
            b("Keep the current state", () => clear(guard)),
          );
          guard.querySelector<HTMLElement>("button")?.focus();
        },
        { disabled: !store.snapshot().canUndo },
      ),
    );
    if (restorePreview || clearPreview) showRecoveryPreview();
    if (store.snapshot().state?.draft.form)
      content.append(
        b(
          "Review discarding only the saved raw form",
          () => {
            clear(guard);
            guard.append(
              h("h3", {}, "Discard only the saved raw form?"),
              p(
                "Protocols, artifacts, results, comparisons and packets remain. This removes the saved unfinished fields only.",
              ),
              b(
                "Discard the saved raw form",
                () =>
                  mutate(
                    {
                      kind: "draft.replace",
                      draft: {
                        tab,
                        selectedProjectId: selected,
                        form: null,
                        dirty: false,
                      },
                    },
                    "Saved raw form discarded.",
                    () => {
                      form = null;
                      dirty = false;
                      clear(guard);
                    },
                  ),
                { write: true },
              ),
              b("Keep saved fields", () => clear(guard)),
            );
          },
          { write: true },
        ),
      );
  }
  async function downloadPacket(id: string) {
    await work(async () => {
      const token = epoch.current();
      const files = await makeArtifactPacket(state(), id, now());
      if (!epoch.matches(token))
        throw Error(
          "Your register changed during packet preparation. Download again.",
        );
      download(
        "charitology-artifact-packet-full-private-register.json",
        files.json,
        "application/json;charset=utf-8",
      );
      for (const [name, body] of Object.entries(files.csv))
        download(
          `charitology-packet-${name}.csv`,
          body,
          "text/csv;charset=utf-8",
        );
      download("charitology-artifact-packet-selected-memo.md", files.markdown);
      say(
        "Packet downloads requested: full private register JSON plus selected-closure CSV and memo. Keep the actual downloaded JSON for this workspace snapshot.",
      );
    }, "Checking that the packet’s selected closure still matches…");
  }
  function showRecoveryPreview() {
    clear(guard);
    const preview = restorePreview || clearPreview;
    if (!preview) return;
    guard.append(
      h(
        "h3",
        {},
        preview.kind === "restore"
          ? "Apply this validated replacement?"
          : "Clear this browser register?",
      ),
      p(
        preview.kind === "restore"
          ? `Replacement: ${preview.state.projects.length} projects, ${preview.state.protocols.length} protocol versions and ${preview.state.results.length} result records. This replaces the full register, including its raw draft.`
          : "This clears only the new artifact/results key. Legacy research desks and the study register are untouched. Export this register first.",
      ),
      note(`Exact proposed state hash: ${preview.stateHash}`),
      b(
        preview.kind === "restore"
          ? "Replace the register with this backup"
          : "Clear the new artifact/results register",
        () =>
          work(async () => {
            const saved =
              preview.kind === "restore"
                ? await store.restore(preview)
                : await store.clear(preview);
            adopted();
            tab = saved.state?.draft.form ? saved.state.draft.tab : "projects";
            importPending = false;
            importBytes = null;
            legacy = null;
            importPreview = null;
            restorePreview = null;
            clearPreview = null;
            clear(guard);
            render();
            say(
              saved.unsaved
                ? "The replacement is valid only in memory; browser saving failed and the saved bytes were not changed. Export or retry before closing."
                : preview.kind === "restore"
                  ? "Validated backup restored to this browser."
                  : "The new artifact/results register was cleared. Other workspace keys were untouched.",
            );
          }),
        { disabled: !store.snapshot().canRecover },
      ),
      b("Keep the current register", () => {
        restorePreview = null;
        clearPreview = null;
        clear(guard);
      }),
    );
    guard.querySelector<HTMLElement>("button")?.focus();
  }
  const foreign = (event: StorageEvent) => {
    if (event.key !== ARTIFACT_STORAGE_KEY && event.key !== null) return;
    store.noticeExternalChange();
    epoch.invalidate();
    restorePreview = null;
    clearPreview = null;
    clear(guard);
    updateHeader();
    say(
      "Another tab changed the saved copy. Your current form is preserved. Download it before reloading or reviewing a replacement.",
      true,
    );
  };
  window.addEventListener("storage", foreign);
  window.addEventListener("beforeunload", (event) => {
    if (dirty || importPending || store.snapshot().unsaved) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    epoch.invalidate();
  });
  render();
}
