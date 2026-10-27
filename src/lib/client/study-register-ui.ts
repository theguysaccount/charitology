import { h, clear } from "./dom";
import { download } from "./files";
import {
  blankStudyState,
  hashStudyValue,
  prepareStudyCommand,
  studyCounts,
  studyReportView,
  duplicateSuggestions,
  makeStudyBackup,
  studyCsvExports,
  studyMarkdownMemo,
  makeStudyPacket,
  type StudyState,
  type StudyCommand,
  type Draft,
  type Metadata,
  type ProtocolContent,
  type ReportView,
} from "./study-register-model";
import {
  parseCitationCsv,
  previewCitationImport,
  type CatalogEntry,
  type CitationColumn,
  type CitationImportInput,
  type ImportPreview,
} from "./study-register-import";
import {
  createStudyRegisterStore,
  STUDY_STORAGE_KEY,
  type StudyRegisterStore,
  type StoreSnapshot,
  type RestorePreview,
  type ClearPreview,
} from "./study-register-store";
import {
  studyUiGeneration,
  studyPage,
  studyNumber,
  studyColumnMap,
  readStudyFile,
  studyImportAssignments,
  studyErrorMessage,
  type AssignmentInput,
} from "./study-register-ui-helpers";

type Tab = Draft["tab"];
type FormKind = NonNullable<Draft["form"]>["kind"];
type Fields = Record<string, string>;
type OpenForm = { kind: FormKind; targetId: string | null; fields: Fields };
const columns: CitationColumn[] = [
  "title",
  "authors",
  "year",
  "doi",
  "pmid",
  "url",
  "abstract",
];
const designs = [
  "unknown",
  "randomized",
  "quasi-experimental",
  "observational",
  "qualitative",
  "systematic-review",
  "method",
  "other",
];
const classes = [
  "unknown",
  "empirical-report",
  "review",
  "method",
  "guideline",
  "dataset",
  "organization",
  "discussion",
  "other",
];
const tabNames: Record<Tab, string> = {
  browse: "Browse sources",
  protocol: "Protocol",
  imports: "Imports and searches",
  reports: "Reports and duplicates",
  screening: "Screening and extraction",
  exports: "Flow and recovery",
};
const empty = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);
const nullable = (value: string | undefined) => value?.trim() || null;
const now = () => new Date().toISOString();
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const short = (value: string) =>
  value.length > 16 ? `${value.slice(0, 12)}…` : value;
const list = (raw: string | undefined): string[] => {
  const value: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw Error(
      "A saved list field must be a JSON array of strings. Its original text is retained below for repair.",
    );
  return value;
};
const para = (text: string, className = "") =>
  h("p", { class: className }, text);
const note = (text: string) => para(text, "sr-note");

/** Mount one private browser workspace. Nothing here sends research work to a server. */
export async function mountStudyRegister(root: HTMLElement): Promise<void> {
  if (root.dataset.studyMounted) return;
  root.dataset.studyMounted = "true";
  const catalogScript = root.querySelector<HTMLScriptElement>(
    "script.study-register-catalog",
  );
  let catalog: CatalogEntry[] = [];
  try {
    catalog = JSON.parse(catalogScript?.textContent || "[]") as CatalogEntry[];
  } catch {
    /* The public bibliography remains usable. */
  }
  const base = (root.dataset.base || "").replace(/\/$/, "");
  const host = h("div", { class: "sr-workspace" });
  const header = h("div", { class: "sr-header" });
  const status = h("p", {
    class: "sr-status",
    role: "status",
    "aria-live": "polite",
    tabindex: "-1",
  });
  const navigation = h("nav", {
    class: "sr-tabs",
    "aria-label": "Study register views",
  });
  const guard = h("div", { class: "sr-guard" });
  const content = h("div", { class: "sr-content" });
  host.append(header, navigation, status, guard, content);
  const mount = root.querySelector(".study-register-mount") || root;
  if (mount !== root) clear(mount);
  mount.append(host);
  const epoch = studyUiGeneration();
  let store: StudyRegisterStore;
  let catalogHash: string | null = null;
  let tab: Tab = root.dataset.view === "review" ? "screening" : "browse";
  let selected: string | null = null;
  let form: OpenForm | null = null;
  let dirty = false;
  let busy = false;
  let renderPending = false;
  let catalogQuery = "",
    reportQuery = "",
    reportClass = "",
    reportStage = "";
  let catalogPage = 0,
    reportPage = 0,
    importPage = 0;
  const catalogSelection = new Set<string>();
  const mergeSelection = new Set<string>();
  let importPreview: ImportPreview | null = null;
  let assignments: AssignmentInput[] = [];
  let importReason = "";
  let csvBytes: Uint8Array | null = null;
  let csvName = "";
  let csvHeaders: string[] = [];
  let columnMap: Partial<Record<CitationColumn, number>> = {};
  let csvSearchRun = "",
    csvProvenance = "";
  let restoredMapping = false;
  let restorePreview: RestorePreview | null = null;
  let clearPreview: ClearPreview | null = null;
  let splitGroups: Record<string, string> = {},
    splitTitles: Record<string, string> = {};
  let splitRetainGroup: string | null = null;
  try {
    store = await createStudyRegisterStore({
      initialState: blankStudyState(uid(), now()),
    });
    const initial = store.snapshot();
    if (initial.state?.draft) {
      if (initial.state.draft.form) tab = initial.state.draft.tab;
      selected = initial.state.draft.selectedReportId;
      form = initial.state.draft.form
        ? structuredClone(initial.state.draft.form)
        : null;
    }
    try {
      catalogHash = await hashStudyValue(catalog);
    } catch {
      /* Read-only bibliography is still available. */
    }
  } catch (error) {
    status.textContent = `The register could not open safely. ${studyErrorMessage(error)} The public bibliography remains available.`;
    return;
  }
  function state(): StudyState {
    const value = store.snapshot().state;
    if (!value)
      throw Error("Secure hashing is unavailable. This register is read-only.");
    return value;
  }
  function writeAllowed() {
    return store.snapshot().canWrite && !busy;
  }
  function say(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle("sr-error", error);
  }
  function touch() {
    dirty = true;
    epoch.invalidate();
    updateHeader();
  }
  function link(label: string, href: string) {
    return h(
      "a",
      { href: href.startsWith("/") ? `${base}${href}` : href },
      label,
    );
  }
  function button(
    label: string,
    action: () => void | Promise<void>,
    options: { write?: boolean; primary?: boolean; disabled?: boolean } = {},
  ) {
    const b = h(
      "button",
      {
        type: "button",
        class: `${options.primary ? "sr-button sr-primary" : "sr-button"}${options.write ? " sr-write-action" : ""}`,
        disabled:
          options.disabled || (options.write && !store.snapshot().canWrite),
      },
      label,
    );
    b.addEventListener("click", () => {
      if (!busy) void action();
    });
    return b;
  }
  async function work(
    action: () => Promise<void>,
    message = "Checking the current workspace…",
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
      say(studyErrorMessage(error), true);
    } finally {
      busy = false;
      controls.forEach(({ el, disabled }) => {
        if (el.isConnected) el.disabled = disabled;
      });
      if (renderPending) {
        renderPending = false;
        render();
      } else updateHeader();
    }
  }
  async function mutate(
    command: StudyCommand,
    success: string,
    after?: () => void,
  ) {
    await work(async () => {
      const snap = store.snapshot();
      if (!snap.canWrite || !snap.state || !snap.hash)
        throw Error(
          snap.message ||
            "Saving is unavailable. Download your current work before recovery.",
        );
      const generation = epoch.current();
      const prepared = await prepareStudyCommand(snap.state, command, {
        expectedStateHash: snap.hash,
        at: now(),
        makeId: uid,
      });
      if (!epoch.matches(generation))
        throw Error(
          "The workspace changed while this action was checked. Review it again; nothing was saved by this action.",
        );
      const saved = await store.commitPrepared(prepared);
      epoch.invalidate();
      dirty = false;
      form = saved.state?.draft.form
        ? structuredClone(saved.state.draft.form)
        : null;
      if (after) after();
      render();
      say(
        saved.unsaved
          ? `${success} It is valid in memory, but browser storage failed. Download a backup or retry saving; do not close this page.`
          : prepared.noOp
            ? `${success} No duplicate history was added.`
            : success,
      );
    });
  }
  function askLeave(
    action: () => void,
    description = "Leave the current form?",
  ) {
    if (busy) return;
    if (!dirty) {
      clear(guard);
      action();
      return;
    }
    clear(guard);
    if (!form) {
      guard.append(
        h("h3", {}, "Leave this uncommitted import?"),
        para(
          "The selected file, preview and reviewed row assignments are still in memory. They are not part of a register backup. Commit the reviewed import first, or discard this preview.",
        ),
        button("Discard import preview and continue", () => {
          dirty = false;
          importPreview = null;
          clear(guard);
          epoch.invalidate();
          action();
        }),
        button("Keep reviewing the import", () => clear(guard)),
      );
      guard.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    guard.append(
      h("h3", {}, description),
      para(
        "Your latest form fields have not been saved. Keep them as a raw draft, download them with a backup, or discard these edits.",
      ),
      button(
        "Save form draft, then continue",
        async () => {
          await saveDraft(false);
          if (!dirty) {
            clear(guard);
            action();
          }
        },
        { write: true },
      ),
      button("Download current work with form fields", downloadBackup),
      button("Discard these form edits", () => {
        dirty = false;
        form = null;
        clear(guard);
        epoch.invalidate();
        action();
      }),
      button("Keep editing", () => {
        clear(guard);
        content
          .querySelector<HTMLElement>("input,select,textarea,button")
          ?.focus();
      }),
    );
    guard.querySelector<HTMLElement>("button")?.focus();
  }
  function goto(next: Tab, reportId: string | null = selected) {
    askLeave(() => {
      tab = next;
      selected = reportId;
      form = null;
      importPreview = null;
      epoch.invalidate();
      render();
      content.focus();
    });
  }
  function openForm(
    kind: FormKind,
    targetId: string | null,
    fields: Fields,
    next: Tab = tab,
  ) {
    askLeave(() => {
      tab = next;
      selected = targetId || selected;
      if (targetId && ["metadata", "split"].includes(kind)) {
        const report = state().reports.find((entry) => entry.id === targetId);
        if (report)
          fields = {
            ...fields,
            reportId: targetId,
            reportRevision: String(report.currentRevision),
          };
      }
      if (
        targetId &&
        ["decision", "resolution", "retrieval", "extraction"].includes(kind)
      ) {
        const view = studyReportView(state(), targetId);
        if (!view.binding) {
          say("Select a frozen protocol before opening this form.", true);
          return;
        }
        fields = {
          ...fields,
          ...Object.fromEntries(
            Object.entries(view.binding).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
        };
        if (kind === "decision") {
          const stage =
            fields.stage === "title-abstract" ? view.title : view.full;
          fields.supersedesId =
            (fields.lane === "A" ? stage.decisionA : stage.decisionB)?.id || "";
          fields.retrievalId =
            fields.stage === "full-report" ? view.retrieval?.id || "" : "";
        }
        if (kind === "resolution") {
          const stage =
            fields.stage === "title-abstract" ? view.title : view.full;
          fields.decisionA = stage.decisionA?.id || "";
          fields.decisionB = stage.decisionB?.id || "";
        }
        if (kind === "retrieval") {
          fields.titleBasisHash = view.title.basisHash || "";
          fields.supersedesId = view.retrieval?.id || "";
        }
        if (kind === "extraction") {
          fields.inclusionHash = view.full.inclusionHash || "";
          fields.supersedesId = view.extraction?.id || "";
        }
      }
      form = { kind, targetId, fields };
      dirty = false;
      epoch.invalidate();
      render();
      content.querySelector<HTMLElement>("input,select,textarea")?.focus();
    });
  }
  function draft(): Draft {
    return {
      tab,
      selectedReportId: selected,
      form: form ? structuredClone(form) : null,
      dirty: Boolean(form),
    };
  }
  async function saveDraft(renderAfter = true) {
    if (!form) {
      say("There is no open form draft to save.");
      return;
    }
    const retained = structuredClone(form);
    await mutate(
      { kind: "draft.replace", draft: draft() },
      "Form draft saved. These fields have not become research records.",
      () => {
        form = retained;
        dirty = false;
      },
    );
    if (renderAfter) render();
  }
  function updateHeader() {
    const snap = store.snapshot();
    clear(header);
    header.append(
      h(
        "div",
        {},
        h("h3", {}, "Your study register"),
        para(
          "Private to this browser and origin. Lane labels and times are self-recorded; they do not establish independent review.",
        ),
      ),
      h(
        "div",
        { class: "sr-save-state" },
        h(
          "strong",
          {},
          snap.readOnly
            ? "Read-only"
            : snap.blocked
              ? "Saved copy protected"
              : snap.unsaved
                ? "Not saved to browser"
                : dirty
                  ? "Uncommitted edits"
                  : "Browser copy ready",
        ),
        note(snap.message || "No account, upload or background source lookup."),
      ),
    );
    if (snap.state)
      header.append(button("Download current work", downloadBackup));
    if (snap.state?.draft.form)
      header.append(
        button(
          "Review discarding the saved raw form",
          () =>
            askLeave(() => {
              clear(guard);
              guard.append(
                h("h3", {}, "Discard only the saved raw form?"),
                para(
                  "The register keeps its protocols, source occurrences and recorded research history. This removes only the saved unfinished form fields.",
                ),
                button(
                  "Discard saved raw form",
                  async () => {
                    await mutate(
                      {
                        kind: "draft.replace",
                        draft: {
                          tab,
                          selectedReportId: selected,
                          form: null,
                          dirty: false,
                        },
                      },
                      "Saved raw form discarded. Research records were unchanged.",
                      () => {
                        form = null;
                        dirty = false;
                        clear(guard);
                      },
                    );
                  },
                  { write: true },
                ),
                button("Keep the saved form", () => clear(guard)),
              );
              guard.querySelector<HTMLElement>("button")?.focus();
            }),
          { write: true },
        ),
      );
    if (!snap.canWrite)
      for (const action of host.querySelectorAll<HTMLButtonElement>(
        ".sr-write-action",
      ))
        action.disabled = true;
  }
  function renderNav() {
    clear(navigation);
    for (const key of Object.keys(tabNames) as Tab[]) {
      const b = button(tabNames[key], () => goto(key));
      b.setAttribute("aria-current", key === tab ? "page" : "false");
      navigation.append(b);
    }
  }
  function render() {
    if (busy) {
      renderPending = true;
      return;
    }
    updateHeader();
    renderNav();
    clear(content);
    content.tabIndex = -1;
    const snap = store.snapshot();
    if (snap.blocked || snap.unsaved || snap.readOnly)
      content.append(
        h(
          "aside",
          { class: "sr-warning" },
          para(
            snap.message ||
              "Writes are disabled. Your readable work and protected saved bytes can still be exported.",
          ),
          button("Open recovery controls", () => goto("exports")),
        ),
      );
    if (
      (snap.code === "corrupt" || snap.code === "read_error") &&
      tab !== "browse" &&
      tab !== "exports"
    ) {
      content.append(
        para(
          "The saved register could not be validated or read. No empty-register totals are being substituted for that protected copy.",
        ),
        button("Review recovery choices", () => goto("exports")),
      );
      return;
    }
    if (form) {
      try {
        renderForm();
      } catch (error) {
        clear(content);
        renderRawFormRepair(error);
      }
      return;
    }
    if (tab === "browse") renderBrowse();
    else if (tab === "protocol") renderProtocol();
    else if (tab === "imports") renderImports();
    else if (tab === "reports") renderReports();
    else if (tab === "screening") renderScreening();
    else renderExports();
  }
  function pager(
    target: HTMLElement,
    page: number,
    pages: number,
    total: number,
    change: (page: number) => void,
  ) {
    const previous = button("Previous page", () => change(page - 1)),
      next = button("Next page", () => change(page + 1));
    previous.disabled = busy || page <= 0;
    next.disabled = busy || page >= pages - 1;
    target.append(
      h(
        "div",
        { class: "sr-pager" },
        previous,
        para(`Page ${page + 1} of ${pages} · ${total} matching rows`),
        next,
      ),
    );
  }
  function searchControl(
    label: string,
    value: string,
    update: (value: string) => void,
  ) {
    const input = h("input", {
      type: "search",
      value,
      "aria-label": label,
      placeholder: label,
    });
    input.addEventListener("change", () => update(input.value));
    return h("label", { class: "sr-search" }, label, input);
  }
  function selectControl(
    label: string,
    value: string,
    choices: [string, string][],
    update: (value: string) => void,
  ) {
    const input = h(
      "select",
      { "aria-label": label },
      choices.map(([key, name]) =>
        h("option", { value: key, selected: key === value }, name),
      ),
    );
    input.addEventListener("change", () => update(input.value));
    return h("label", {}, label, input);
  }
  function renderBrowse() {
    content.append(
      h("h3", {}, "Browse the public bibliography"),
      para(
        "These are citations used on the site, not a completed literature search or a verified empirical-study set. Adding them creates labeled source occurrences in your private register.",
      ),
      searchControl(
        "Find a citation by title, author or publisher",
        catalogQuery,
        (value) => {
          catalogQuery = value;
          catalogPage = 0;
          render();
        },
      ),
    );
    const filtered = catalog.filter((entry) =>
      `${entry.title} ${entry.authors || ""} ${entry.publisher || ""}`
        .toLowerCase()
        .includes(catalogQuery.toLowerCase()),
    );
    const page = studyPage(filtered, catalogPage);
    catalogPage = page.page;
    const results = h("div", { class: "sr-catalog" });
    for (const entry of page.rows) {
      const checkbox = h("input", {
        type: "checkbox",
        checked: catalogSelection.has(entry.entryId),
        "aria-label": `Select citation: ${entry.title}`,
      });
      checkbox.addEventListener("change", () => {
        checkbox.checked
          ? catalogSelection.add(entry.entryId)
          : catalogSelection.delete(entry.entryId);
        updateSelected();
      });
      results.append(
        h(
          "article",
          { class: "sr-card" },
          h(
            "label",
            { class: "sr-check-title" },
            checkbox,
            h("strong", {}, entry.title),
          ),
          note(
            [entry.authors, entry.year ?? entry.originalYear, entry.publisher]
              .filter(Boolean)
              .join(" · ") || "Publication metadata unknown",
          ),
          entry.url
            ? h(
                "a",
                {
                  href: entry.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
                "Open cited source",
              )
            : note("Source URL unknown"),
          entry.backlinks.length
            ? h(
                "p",
                { class: "sr-backlinks" },
                "Cited by: ",
                entry.backlinks.map((backlink) =>
                  link(backlink.title, backlink.href),
                ),
              )
            : null,
        ),
      );
    }
    if (!page.total)
      results.append(
        note("No citations match this search. Try a shorter phrase."),
      );
    content.append(results);
    pager(content, page.page, page.pages, page.total, (value) => {
      catalogPage = value;
      render();
    });
    const selectionText = para("");
    const preview = button(
      "Preview selected bibliography citations",
      async () => {
        await work(async () => {
          const snap = store.snapshot();
          if (!snap.state || !snap.hash || !catalogHash)
            throw Error(
              "Secure import preparation is unavailable. The public bibliography remains readable.",
            );
          const generation = epoch.current();
          const input: CitationImportInput = {
            kind: "site-bibliography",
            entries: catalog.filter((entry) =>
              catalogSelection.has(entry.entryId),
            ),
            catalogHash,
            provenanceNote:
              "Selected from the public Charitology bibliography; no literature search was performed by this import.",
          };
          if (!input.entries.length)
            throw Error("Select at least one citation.");
          const result = await previewCitationImport(
            snap.state,
            input,
            snap.hash,
          );
          if (!epoch.matches(generation))
            throw Error(
              "Selection or workspace changed while preparing. Preview again.",
            );
          setImportPreview(result);
          tab = "imports";
          render();
          say(
            "Bibliography preview ready. Inspect each occurrence and its assignment before committing.",
          );
        });
      },
      { write: true, primary: true },
    );
    const updateSelected = () => {
      selectionText.textContent = `${catalogSelection.size} citation${catalogSelection.size === 1 ? "" : "s"} selected across pages`;
      preview.disabled = !writeAllowed() || !catalogSelection.size;
    };
    content.append(
      h(
        "div",
        { class: "sr-actions" },
        selectionText,
        preview,
        button("Clear citation selection", () => {
          catalogSelection.clear();
          render();
        }),
      ),
    );
    updateSelected();
  }
  function selectedProtocol() {
    const s = state();
    return s.protocols.find((p) => p.id === s.selectedProtocolId) || null;
  }
  function protocolBanner(target: HTMLElement = content) {
    const s = store.snapshot().state;
    const protocol = s?.protocols.find((p) => p.id === s.selectedProtocolId);
    target.append(
      h(
        "aside",
        { class: "sr-protocol-banner" },
        protocol
          ? h(
              "div",
              {},
              h(
                "strong",
                {},
                `Protocol v${protocol.version}: ${protocol.content.title}`,
              ),
              note(`Content SHA-256 ${protocol.hash}`),
              note(
                `Frozen at self-recorded browser time ${protocol.frozenAt}. A local content hash is not an independent registration.`,
              ),
            )
          : para(
              "Select or freeze a protocol before recording screening decisions or interpreting completed-flow counts.",
            ),
      ),
    );
  }
  function renderProtocol() {
    content.append(
      h("h3", {}, "Set the question before screening"),
      para(
        "Freeze explicit eligibility and search plans. Editing a protocol creates a new content version; decisions are never carried into a changed protocol automatically.",
      ),
    );
    if (!store.snapshot().state) return;
    protocolBanner();
    content.append(
      button(
        "Draft a new protocol",
        () => openForm("protocol", null, protocolFields(null)),
        { write: true, primary: true },
      ),
    );
    for (const protocol of state().protocols)
      content.append(
        h(
          "article",
          { class: "sr-card" },
          h("h4", {}, `v${protocol.version} · ${protocol.content.title}`),
          para(protocol.content.question),
          note(`Frozen ${protocol.frozenAt} · ${protocol.hash}`),
          button("Inspect protocol", () => {
            const details = h(
              "details",
              { open: true },
              h("summary", {}, "Frozen protocol content"),
              h("pre", {}, JSON.stringify(protocol.content, null, 2)),
            );
            content.append(details);
            details.focus();
          }),
          button(
            "Select this protocol",
            () =>
              mutate(
                { kind: "protocol.select", protocolId: protocol.id },
                "Selected protocol changed. Counts now use this protocol and current report revisions.",
              ),
            { write: true },
          ),
          button(
            "Draft a version based on this protocol",
            () => openForm("protocol", null, protocolFields(protocol)),
            { write: true },
          ),
        ),
      );
    if (!state().protocols.length)
      content.append(
        note(
          "No protocol has been frozen. A draft can be saved without treating its content as registered.",
        ),
      );
  }
  function protocolFields(
    protocol: StudyState["protocols"][number] | null,
  ): Fields {
    const data = protocol?.content;
    return {
      title: data?.title || "",
      question: data?.question || "",
      population: data?.population || "",
      intervention: data?.intervention || "",
      comparison: data?.comparison || "",
      outcomes: data?.outcomes || "",
      timeHorizon: data?.timeHorizon || "",
      eligibleDesigns: JSON.stringify(data?.eligibleDesigns || ["unknown"]),
      eligibleSourceClasses: JSON.stringify(
        data?.eligibleSourceClasses || ["unknown"],
      ),
      inclusion: data?.inclusion || "",
      exclusion: data?.exclusion || "",
      searchPlan: data?.searchPlan || "",
      basedOnId: protocol?.id || "",
    };
  }
  function setImportPreview(preview: ImportPreview) {
    importPreview = preview;
    importPage = 0;
    assignments = preview.rows.map((row) => ({
      row: row.row,
      existingReportId: null,
      group: `row-${row.row}`,
      canonicalRow: row.row,
    }));
  }
  function renderImports() {
    content.append(
      h("h3", {}, "Keep search and import provenance"),
      para(
        "A saved search run records what you report doing; this page does not query a database or verify that a search occurred.",
      ),
      button(
        "Record a search run",
        () =>
          openForm("search", null, {
            source: "",
            query: "",
            searchedOn: "",
            performed: "unknown",
            provenanceNote: "",
          }),
        { write: true },
      ),
    );
    const s = store.snapshot().state;
    if (!s) return;
    if (s.searchRuns.length) {
      const searchDetails = h(
        "details",
        {},
        h("summary", {}, `${s.searchRuns.length} recorded search runs`),
      );
      for (const run of s.searchRuns)
        searchDetails.append(
          para(
            `${run.source} · ${run.searchedOn || "date unknown"} · ${run.performed} · ${run.id}`,
          ),
          note(run.query || "Query not recorded"),
        );
      content.append(searchDetails);
    }
    const csv = h(
      "section",
      { class: "sr-panel" },
      h("h4", {}, "Import a mapped citation CSV"),
      note(
        "UTF-8 CSV only, at most 1 MiB and 30 columns. Every row is retained or the import is rejected. Raw file bytes stay in memory; keep the original file separately.",
      ),
    );
    const file = h("input", {
      type: "file",
      accept: ".csv,text/csv",
      "aria-label": "Citation CSV file",
      disabled: !store.snapshot().canWrite,
    });
    file.addEventListener("change", () => {
      void work(async () => {
        const selectedFile = file.files?.[0];
        if (!selectedFile) return;
        if (selectedFile.size > 1_048_576)
          throw Error(
            "Choose a CSV file no larger than 1 MiB. Nothing was imported.",
          );
        epoch.invalidate();
        const generation = epoch.current();
        const bytes = new Uint8Array(
          await readStudyFile(() => selectedFile.arrayBuffer()),
        );
        if (!epoch.matches(generation))
          throw Error(
            "The workspace changed while reading this file. Select it again.",
          );
        const parsed = parseCitationCsv(bytes);
        csvBytes = bytes;
        csvName = selectedFile.name;
        csvHeaders = parsed.headers;
        if (!restoredMapping) {
          columnMap = {};
          for (const column of columns) {
            const index = parsed.headers.findIndex(
              (name) => name.trim().toLowerCase() === column,
            );
            if (index >= 0) columnMap[column] = index;
          }
        }
        restoredMapping = false;
        importPreview = null;
        render();
        say(
          "CSV read. Review the explicit column mapping and provenance before preview.",
        );
      }, "Reading the selected CSV…");
    });
    csv.append(h("label", {}, "Citation CSV file", file));
    if (csvBytes) {
      csv.append(
        para(`Selected file: ${csvName} · ${csvBytes.byteLength} bytes`),
      );
      const mapping = h("div", { class: "sr-grid" });
      for (const column of columns)
        mapping.append(
          selectControl(
            `${column} column${column === "title" ? " (required)" : ""}`,
            columnMap[column] === undefined ? "" : String(columnMap[column]),
            [
              ["", "Not mapped"],
              ...csvHeaders.map((name, index): [string, string] => [
                String(index),
                `${index + 1}: ${name}`,
              ]),
            ],
            (value) => {
              if (value === "") delete columnMap[column];
              else columnMap[column] = Number(value);
              importPreview = null;
              epoch.invalidate();
            },
          ),
        );
      csv.append(
        mapping,
        selectControl(
          "Recorded search run (optional)",
          csvSearchRun,
          [
            ["", "No search run — import only"],
            ...s.searchRuns.map((run): [string, string] => [
              run.id,
              `${run.source} · ${run.searchedOn || "date unknown"}`,
            ]),
          ],
          (value) => {
            csvSearchRun = value;
            importPreview = null;
            epoch.invalidate();
          },
        ),
      );
      const provenance = h(
        "textarea",
        { rows: 3, maxlength: 2000, "aria-label": "Import provenance note" },
        csvProvenance,
      );
      provenance.addEventListener("input", () => {
        csvProvenance = provenance.value;
        importPreview = null;
        epoch.invalidate();
      });
      csv.append(
        h("label", {}, "Import provenance note", provenance),
        button(
          "Save mapping and provenance as a raw draft",
          async () => {
            await mutate(
              {
                kind: "draft.replace",
                draft: {
                  tab: "imports",
                  selectedReportId: selected,
                  form: {
                    kind: "import",
                    targetId: null,
                    fields: {
                      columnMap: JSON.stringify(columnMap),
                      searchRunId: csvSearchRun,
                      provenanceNote: csvProvenance,
                      reason: importReason,
                    },
                  },
                  dirty: true,
                },
              },
              "Import mapping draft kept. Original file bytes and preview assignments are not saved; reselect and review the file after reload.",
              () => {
                form = null;
              },
            );
          },
          { write: true, disabled: Boolean(importPreview) },
        ),
        button(
          "Preview mapped CSV",
          async () => {
            await work(async () => {
              const snap = store.snapshot();
              if (!snap.state || !snap.hash || !csvBytes)
                throw Error("Select a current CSV and workspace first.");
              const generation = epoch.current();
              const preview = await previewCitationImport(
                snap.state,
                {
                  kind: "citation-csv",
                  bytes: csvBytes,
                  fileName: csvName,
                  columnMap: { ...columnMap },
                  searchRunId: nullable(csvSearchRun),
                  provenanceNote: nullable(csvProvenance),
                },
                snap.hash,
              );
              if (!epoch.matches(generation))
                throw Error("The mapping or workspace changed. Preview again.");
              setImportPreview(preview);
              render();
              say(
                "Import preview ready. Review rows and assignments; no reports have been added.",
              );
            });
          },
          { write: true, primary: true, disabled: Boolean(importPreview) },
        ),
      );
      if (importPreview) {
        for (const input of csv.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input,select,textarea"))
          input.disabled = true;
        csv.append(
          note(
            "Mapping-only drafts do not contain reviewed row assignments. Commit this import, or explicitly discard its preview before saving only the mapping and notes.",
          ),
          button("Review discarding this import preview", () => {
            clear(guard);
            guard.append(
              h("h3", {}, "Discard reviewed row assignments?"),
              para(
                "The original CSV stays selected and your mapping and reason stay in memory. Row assignments will be discarded. No research records are added or removed.",
              ),
              button("Discard preview assignments", () => {
                importPreview = null;
                assignments = [];
                dirty = true;
                clear(guard);
                epoch.invalidate();
                render();
                say(
                  "Preview assignments discarded. Save mapping notes or prepare and review a fresh preview.",
                );
              }),
              button("Keep the reviewed preview", () => clear(guard)),
            );
          }),
        );
      }
    }
    content.append(csv);
    if (importPreview) renderImportPreview(importPreview);
    const batches = h(
      "details",
      {},
      h("summary", {}, `${s.imports.length} committed import batches`),
    );
    for (const batch of s.imports)
      batches.append(
        para(
          `${batch.kind} · ${batch.fileName || "site bibliography"} · ${batch.assignments.length} occurrences`,
        ),
        note(
          `Source SHA-256 ${batch.sourceHash} · ${batch.searchRunId ? `saved search ${batch.searchRunId}` : "No search run attributed"}`,
        ),
      );
    content.append(batches);
  }
  function renderImportPreview(preview: ImportPreview) {
    const panel = h(
      "section",
      { class: "sr-panel" },
      h("h4", {}, "Review this import"),
      para(
        `${preview.rows.length} retained source rows · ${preview.ignoredBlankLines} ignored blank physical lines · ${preview.input.kind}`,
      ),
      note(`Source SHA-256 ${preview.sourceHash}`),
      note(`Preview SHA-256 ${preview.reviewHash}`),
    );
    if (preview.existingBatchId)
      panel.append(
        h(
          "p",
          { class: "sr-warning" },
          "This exact import identity is already committed. Replaying it does not create new occurrences.",
        ),
      );
    if (preview.issues.length)
      panel.append(
        h(
          "ul",
          { class: "sr-error" },
          preview.issues.map((issue) =>
            h("li", {}, `${issue.path}: ${issue.message}`),
          ),
        ),
      );
    if (preview.duplicateSuggestions.length)
      panel.append(
        h(
          "details",
          {},
          h(
            "summary",
            {},
            `${preview.duplicateSuggestions.length} possible duplicates — suggestions only`,
          ),
          preview.duplicateSuggestions.map((suggestion) =>
            para(
              `${suggestion.reason === "title-year" ? "Weak title/year suggestion" : suggestion.reason}: rows ${suggestion.rows.join(", ")}${suggestion.identifierConflict ? " · identifiers conflict; grouping is blocked until corrected" : ""}. Nothing is merged automatically.`,
            ),
          ),
        ),
      );
    const currentReports = state().reports.filter(
      (report) => report.revisions.at(-1)!.occurrenceIds.length,
    );
    const page = studyPage(preview.rows, importPage);
    importPage = page.page;
    for (const row of page.rows) {
      const assignment = assignments.find((entry) => entry.row === row.row)!;
      const card = h(
        "article",
        { class: "sr-card" },
        h("h5", {}, `Source row ${row.row}: ${row.citation.title}`),
        note(
          [row.citation.authors, row.citation.year ?? row.citation.originalYear]
            .filter(Boolean)
            .join(" · ") || "Author/year unknown",
        ),
        h(
          "details",
          {},
          h("summary", {}, "Inspect original cells and imported citation"),
          h(
            "pre",
            {},
            JSON.stringify(
              { rawCells: row.rawCells, citation: row.citation },
              null,
              2,
            ),
          ),
        ),
      );
      if (row.issues.length)
        card.append(
          h(
            "ul",
            { class: "sr-error" },
            row.issues.map((issue) => h("li", {}, issue.message)),
          ),
        );
      card.append(
        selectControl(
          `Row ${row.row} assignment`,
          assignment.existingReportId || "",
          [
            ["", "New report group — choose label below"],
            ...currentReports.map((report): [string, string] => [
              report.id,
              `${report.revisions.at(-1)!.metadata.title} · rev ${report.currentRevision}`,
            ]),
          ],
          (value) => {
            assignment.existingReportId = nullable(value);
            touch();
          },
        ),
      );
      const group = h("input", {
        value: assignment.group,
        maxlength: 100,
        "aria-label": `Row ${row.row} new group label`,
      });
      const canonical = h("input", {
        type: "number",
        min: 1,
        step: 1,
        value: assignment.canonicalRow,
        "aria-label": `Row ${row.row} canonical source row`,
      });
      group.addEventListener("input", () => {
        assignment.group = group.value;
        touch();
      });
      canonical.addEventListener("input", () => {
        assignment.canonicalRow = Number(canonical.value);
        touch();
      });
      card.append(
        h(
          "div",
          { class: "sr-grid" },
          h("label", {}, `Row ${row.row} new group label`, group),
          h("label", {}, `Row ${row.row} canonical source row`, canonical),
        ),
        note(
          "Different labels keep reports separate. To group rows deliberately, give every member the same label and the same canonical member row. Existing-report attachment keeps its current metadata and revises its occurrence mapping.",
        ),
      );
      panel.append(card);
    }
    pager(panel, page.page, page.pages, page.total, (value) => {
      importPage = value;
      render();
    });
    const reason = h(
      "textarea",
      { rows: 3, maxlength: 2000, "aria-label": "Import assignment reason" },
      importReason,
    );
    reason.addEventListener("input", () => {
      importReason = reason.value;
      touch();
    });
    panel.append(
      h("label", {}, "Why are these assignments appropriate?", reason),
      note(
        "Every row starts separate. Review identifiers, originals and any deliberate group or attachment before committing.",
      ),
      button(
        "Commit reviewed import",
        async () => {
          try {
            if (!importReason.trim())
              throw Error(
                "Record why these assignments are appropriate before committing.",
              );
            const reviewed = studyImportAssignments(
              preview.rows.map((row) => row.row),
              assignments,
              currentReports.map((report) => ({
                id: report.id,
                revision: report.currentRevision,
              })),
            );
            await mutate(
              {
                kind: "import.commit",
                preview,
                assignments: reviewed,
                reason: importReason.trim(),
              },
              "Reviewed import recorded.",
              () => {
                importPreview = null;
                catalogSelection.clear();
                tab = "reports";
              },
            );
          } catch (error) {
            say(studyErrorMessage(error), true);
          }
        },
        { write: true, primary: true },
      ),
    );
    content.append(panel);
  }
  function currentReports() {
    return state().reports.filter(
      (report) => report.revisions.at(-1)!.occurrenceIds.length,
    );
  }
  function renderReports() {
    content.append(
      h("h3", {}, "Keep report identities explicit"),
      para(
        "A report is a source article or document, not a unique study or a participant count. Merge only duplicate reports; different reports of the same underlying study can remain separate.",
      ),
    );
    if (!store.snapshot().state) return;
    content.append(
      searchControl("Find a registered report", reportQuery, (value) => {
        reportQuery = value;
        reportPage = 0;
        render();
      }),
      selectControl(
        "Source classification",
        reportClass,
        [
          ["", "All classifications"],
          ...classes.map((value): [string, string] => [value, value]),
        ],
        (value) => {
          reportClass = value;
          reportPage = 0;
          render();
        },
      ),
    );
    const reports = currentReports().filter((report) => {
      const metadata = report.revisions.at(-1)!.metadata;
      return (
        `${metadata.title} ${metadata.authors || ""} ${metadata.tags.join(" ")}`
          .toLowerCase()
          .includes(reportQuery.toLowerCase()) &&
        (!reportClass || metadata.classification === reportClass)
      );
    });
    const page = studyPage(reports, reportPage);
    reportPage = page.page;
    for (const report of page.rows) {
      const revision = report.revisions.at(-1)!;
      const checkbox = h("input", {
        type: "checkbox",
        checked: mergeSelection.has(report.id),
        "aria-label": `Select for duplicate review: ${revision.metadata.title}`,
      });
      checkbox.addEventListener("change", () => {
        checkbox.checked
          ? mergeSelection.add(report.id)
          : mergeSelection.delete(report.id);
      });
      content.append(
        h(
          "article",
          { class: "sr-card" },
          h(
            "label",
            { class: "sr-check-title" },
            checkbox,
            h("strong", {}, revision.metadata.title),
          ),
          note(
            `${revision.metadata.classification} · ${revision.metadata.design} · revision ${revision.revision} · ${revision.occurrenceIds.length} source occurrences`,
          ),
          button("Inspect report and history", () => {
            selected = report.id;
            renderReportDetail();
          }),
          button(
            "Correct metadata or classification",
            () =>
              openForm(
                "metadata",
                report.id,
                metadataFields(revision.metadata),
              ),
            { write: true },
          ),
          button(
            "Split occurrence group",
            () => openForm("split", report.id, { partitions: "", reason: "" }),
            { write: true },
          ),
          button("Screen this report", () => goto("screening", report.id)),
        ),
      );
    }
    if (!page.total)
      content.append(
        note(
          "No reports match. Add bibliography citations or import a mapped CSV.",
        ),
      );
    pager(content, page.page, page.pages, page.total, (value) => {
      reportPage = value;
      render();
    });
    content.append(
      button(
        "Review selected reports for an explicit merge",
        () => openMerge([...mergeSelection]),
        { write: true },
      ),
    );
    const suggestions = duplicateSuggestions(state());
    const panel = h(
      "details",
      {},
      h(
        "summary",
        {},
        `${suggestions.length} possible duplicate groups (at most 100 shown)`,
      ),
    );
    for (const suggestion of suggestions)
      panel.append(
        h(
          "article",
          { class: "sr-card" },
          para(
            `${suggestion.reason === "title-year" ? "Weak title/year match" : suggestion.reason} · ${suggestion.reportIds.length} reports${suggestion.identifierConflict ? " · conflicting identifiers" : ""}`,
          ),
          button(
            "Inspect a possible merge",
            () => openMerge(suggestion.reportIds),
            { write: true },
          ),
          button(
            "Record why these remain separate",
            () =>
              openForm("merge", null, {
                reportIds: JSON.stringify(suggestion.reportIds),
                targetId: "",
                metadata: "",
                suggestionHash: suggestion.hash,
                reason: "",
              }),
            { write: true },
          ),
        ),
      );
    content.append(panel);
  }
  function openMerge(ids: string[]) {
    if (ids.length < 2 || ids.length > 20) {
      say("Select 2–20 current reports for a deliberate merge.", true);
      return;
    }
    const target = state().reports.find((report) => report.id === ids[0])!;
    openForm("merge", target.id, {
      reportIds: JSON.stringify(ids),
      targetId: target.id,
      metadata: JSON.stringify(
        metadataFields(target.revisions.at(-1)!.metadata),
      ),
      reason: "",
    });
  }
  function renderReportDetail() {
    const report = state().reports.find((entry) => entry.id === selected);
    if (!report) return;
    const panel = h(
      "section",
      { class: "sr-panel" },
      h("h4", {}, report.revisions.at(-1)!.metadata.title),
      note(
        `Stable report ID ${report.id} · current revision ${report.currentRevision}`,
      ),
    );
    for (const revision of [...report.revisions].reverse())
      panel.append(
        h(
          "details",
          { open: revision.revision === report.currentRevision },
          h(
            "summary",
            {},
            `Revision ${revision.revision} · ${revision.recordedAt} · ${revision.reason}`,
          ),
          h("pre", {}, JSON.stringify(revision, null, 2)),
        ),
      );
    const occurrences = state().occurrences.filter(
      (entry) => entry.reportId === report.id,
    );
    panel.append(
      h(
        "details",
        {},
        h("summary", {}, `${occurrences.length} current original occurrences`),
        h("pre", {}, JSON.stringify(occurrences, null, 2)),
      ),
    );
    content.append(panel);
    panel.scrollIntoView({ block: "start" });
    panel.tabIndex = -1;
    panel.focus();
  }
  function renderScreening() {
    content.append(
      h("h3", {}, "Record decisions without inventing independent review"),
      para(
        "A and B are self-recorded lanes. They may describe one person. Two matching entries are not proof of two independent reviewers. An unresolved or undecided lane remains pending.",
      ),
    );
    if (!store.snapshot().state) return;
    protocolBanner();
    const reports = currentReports();
    if (selected && !reports.some((report) => report.id === selected))
      selected = null;
    content.append(
      selectControl(
        "Report to screen",
        selected || "",
        [
          ["", "Select a report"],
          ...reports.map((report): [string, string] => [
            report.id,
            `${report.revisions.at(-1)!.metadata.title} · rev ${report.currentRevision}`,
          ]),
        ],
        (value) => {
          selected = nullable(value);
          epoch.invalidate();
          render();
        },
      ),
      selectControl(
        "Filter screening state",
        reportStage,
        [
          ["", "All current reports"],
          ["pending", "Title/abstract pending"],
          ["conflict", "Title/abstract conflict"],
          ["advance", "Advanced to retrieval/full report"],
          ["include", "Included reports"],
          ["exclude", "Title/abstract exclusions"],
        ],
        (value) => {
          reportStage = value;
          selected = null;
          reportPage = 0;
          render();
        },
      ),
    );
    if (!selected) {
      const rows = reports
        .map((report) => studyReportView(state(), report.id))
        .filter(
          (view) =>
            !reportStage ||
            (reportStage === "include"
              ? view.full.state === "include"
              : view.title.state === reportStage),
        );
      const page = studyPage(rows, reportPage);
      for (const view of page.rows)
        content.append(
          h(
            "article",
            { class: "sr-card" },
            h("strong", {}, view.metadata.title),
            note(
              `Title/abstract: ${view.title.state} · full report: ${view.full.state}`,
            ),
            button("Open screening record", () => {
              selected = view.report.id;
              render();
            }),
          ),
        );
      pager(content, page.page, page.pages, page.total, (value) => {
        reportPage = value;
        render();
      });
      return;
    }
    const view = studyReportView(state(), selected);
    content.append(
      h("h4", {}, view.metadata.title),
      note(
        `${view.metadata.classification} · ${view.metadata.design} · report revision ${view.revision.revision}`,
      ),
      para(
        view.metadata.abstract || "Abstract unknown. No full text was fetched.",
      ),
      h(
        "details",
        {},
        h("summary", {}, "Inspect citation metadata"),
        h("pre", {}, JSON.stringify(view.metadata, null, 2)),
      ),
      button(
        "Correct report metadata",
        () =>
          openForm("metadata", view.report.id, metadataFields(view.metadata)),
        { write: true },
      ),
    );
    for (const message of view.notices) content.append(note(message));
    content.append(
      h(
        "section",
        { class: "sr-panel" },
        h("h4", {}, `Title/abstract: ${view.title.state}`),
        ...screeningButtons(view, "title-abstract"),
      ),
    );
    const retrieval = h(
      "section",
      { class: "sr-panel" },
      h(
        "h4",
        {},
        `Retrieval: ${view.retrieval?.state || "not recorded for this title-decision basis"}`,
      ),
      note(
        "Obtained means you report access to the source; the register has not downloaded or checked it. Not retrieved is distinct from exclusion and from a zero effect.",
      ),
    );
    if (view.retrieval)
      retrieval.append(
        para(
          view.retrieval.reason ||
            view.retrieval.sourceReference ||
            "No retrieval note.",
        ),
      );
    if (view.eligibility.canRetrieve)
      retrieval.append(
        button(
          "Record retrieval state",
          () =>
            openForm("retrieval", view.report.id, {
              state: view.retrieval?.state || "pending",
              reason: "",
              sourceReference: view.retrieval?.sourceReference || "",
            }),
          { write: true },
        ),
      );
    content.append(
      retrieval,
      h(
        "section",
        { class: "sr-panel" },
        h("h4", {}, `Full report: ${view.full.state}`),
        ...screeningButtons(view, "full-report"),
      ),
    );
    if (view.eligibility.canExtract)
      content.append(
        h(
          "section",
          { class: "sr-panel" },
          h(
            "h4",
            {},
            view.extraction
              ? "Current optional extraction"
              : "Optional reported result extraction",
          ),
          note(
            "Blank numbers remain unknown; zero is explicit. Values and denominators are never pooled, and inclusion does not establish a reliable effect.",
          ),
          view.extraction
            ? h("pre", {}, JSON.stringify(view.extraction, null, 2))
            : null,
          button(
            view.extraction
              ? "Record a revised extraction"
              : "Record an extraction",
            () =>
              openForm(
                "extraction",
                view.report.id,
                Object.fromEntries(
                  [
                    "comparison",
                    "population",
                    "outcome",
                    "measure",
                    "unit",
                    "followUp",
                    "estimate",
                    "lower",
                    "upper",
                    "denominator",
                    "sourceReference",
                    "bias",
                    "limitations",
                  ].map((key) => [
                    key,
                    empty(
                      (
                        view.extraction as unknown as Record<
                          string,
                          unknown
                        > | null
                      )?.[key],
                    ),
                  ]),
                ),
              ),
            { write: true },
          ),
        ),
      );
    const s = state();
    content.append(
      h(
        "details",
        {},
        h(
          "summary",
          {},
          "Inspect retained decisions, resolutions, retrievals and extractions",
        ),
        h(
          "pre",
          {},
          JSON.stringify(
            {
              decisions: s.decisions.filter(
                (item) => item.reportId === view.report.id,
              ),
              resolutions: s.resolutions.filter(
                (item) => item.reportId === view.report.id,
              ),
              retrievals: s.retrievals.filter(
                (item) => item.reportId === view.report.id,
              ),
              extractions: s.extractions.filter(
                (item) => item.reportId === view.report.id,
              ),
            },
            null,
            2,
          ),
        ),
      ),
    );
  }
  function screeningButtons(
    view: ReportView,
    stage: "title-abstract" | "full-report",
  ): HTMLElement[] {
    const stageView = stage === "title-abstract" ? view.title : view.full;
    const result: HTMLElement[] = [];
    for (const lane of ["A", "B"] as const) {
      const decision = lane === "A" ? stageView.decisionA : stageView.decisionB;
      result.push(
        h(
          "article",
          { class: "sr-lane" },
          h("h5", {}, `Lane ${lane}`),
          decision
            ? para(
                `${decision.laneLabel}: ${decision.outcome}${decision.reason ? ` · ${decision.reason}` : ""}`,
              )
            : note("No current decision in this lane."),
          button(
            `Record ${stage === "title-abstract" ? "title/abstract" : "full-report"} lane ${lane}`,
            () =>
              openForm("decision", view.report.id, {
                stage,
                lane,
                laneLabel: decision?.laneLabel || "",
                outcome: "undecided",
                reasonCode: "",
                reason: "",
              }),
            { write: true },
          ),
        ),
      );
      (result.at(-1)!.querySelector("button") as HTMLButtonElement).disabled ||=
        stage === "title-abstract"
          ? !view.eligibility.canTitleDecide
          : !view.eligibility.canFullDecide;
    }
    if (stageView.state === "conflict")
      result.push(
        button(
          `Resolve ${stage === "title-abstract" ? "title/abstract" : "full-report"} disagreement`,
          () =>
            openForm("resolution", view.report.id, {
              stage,
              outcome: stage === "title-abstract" ? "advance" : "include",
              resolverLabel: "",
              reason: "",
            }),
          { write: true },
        ),
      );
    if (stageView.resolution)
      result.push(
        note(
          `Current resolution: ${stageView.resolution.outcome} · ${stageView.resolution.resolverLabel} · ${stageView.resolution.reason}`,
        ),
      );
    return result;
  }
  function metadataFields(metadata: Metadata): Fields {
    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key,
        Array.isArray(value) ? JSON.stringify(value) : empty(value),
      ]),
    );
  }
  function readMetadata(fields: Fields): Metadata {
    return {
      title: fields.title || "",
      authors: nullable(fields.authors),
      year: studyNumber(fields.year || "", "Publication year"),
      originalYear: nullable(fields.originalYear),
      doi: nullable(fields.doi),
      pmid: nullable(fields.pmid),
      url: nullable(fields.url),
      abstract: nullable(fields.abstract),
      classification: (fields.classification ||
        "unknown") as Metadata["classification"],
      design: (fields.design || "unknown") as Metadata["design"],
      population: nullable(fields.population),
      intervention: nullable(fields.intervention),
      outcomes: nullable(fields.outcomes),
      tags: list(fields.tags),
      summary: nullable(fields.summary),
    };
  }
  function formInput(
    parent: HTMLElement,
    fields: Fields,
    name: string,
    label: string,
    options: {
      required?: boolean;
      long?: boolean;
      type?: string;
      choices?: string[] | [string, string][];
      max?: number;
      help?: string;
    } = {},
  ) {
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (options.choices) {
      input = h(
        "select",
        {},
        options.choices.map((entry) => {
          const [value, text] =
            typeof entry === "string" ? [entry, entry] : entry;
          return h("option", { value, selected: fields[name] === value }, text);
        }),
      );
    } else if (options.long)
      input = h(
        "textarea",
        { rows: name === "abstract" ? 6 : 3, maxlength: options.max || 2000 },
        fields[name] || "",
      );
    else
      input = h("input", {
        type: options.type || "text",
        value: fields[name] || "",
        maxlength: options.max || 2000,
        ...(options.type === "number" ? { step: "any" } : {}),
      });
    input.name = name;
    input.required = Boolean(options.required);
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => {
      fields[name] = input.value;
      touch();
    });
    input.addEventListener("change", () => {
      fields[name] = input.value;
      touch();
    });
    parent.append(
      h(
        "label",
        {},
        label,
        input,
        options.help ? h("span", { class: "sr-note" }, options.help) : null,
      ),
    );
    return input;
  }
  function formChoices(
    parent: HTMLElement,
    fields: Fields,
    name: string,
    title: string,
    choices: string[],
  ) {
    const group = h("fieldset", {}, h("legend", {}, title));
    const chosen = new Set(list(fields[name]));
    for (const choice of choices) {
      const input = h("input", {
        type: "checkbox",
        checked: chosen.has(choice),
      });
      input.addEventListener("change", () => {
        input.checked ? chosen.add(choice) : chosen.delete(choice);
        fields[name] = JSON.stringify([...chosen]);
        touch();
      });
      group.append(h("label", { class: "sr-check-title" }, input, choice));
    }
    parent.append(group);
  }
  function metadataInputs(target: HTMLElement, fields: Fields) {
    const grid = h("div", { class: "sr-grid" });
    for (const [name, label] of [
      ["title", "Report title"],
      ["authors", "Authors"],
      ["year", "Numeric publication year (unknown if blank)"],
      ["originalYear", "Original declared year/date"],
      ["doi", "DOI"],
      ["pmid", "PMID"],
      ["url", "HTTPS source URL"],
    ] as const)
      formInput(grid, fields, name, label, {
        required: name === "title",
        max:
          name === "title"
            ? 500
            : name === "authors"
              ? 1000
              : name === "url"
                ? 1200
                : 200,
        type: name === "year" ? "number" : "text",
      });
    formInput(
      grid,
      fields,
      "classification",
      "Source classification (self-recorded)",
      { choices: classes },
    );
    formInput(grid, fields, "design", "Study design (self-recorded)", {
      choices: designs,
    });
    target.append(grid);
    for (const [name, label] of [
      ["abstract", "Abstract"],
      ["population", "Population"],
      ["intervention", "Intervention"],
      ["outcomes", "Outcomes"],
      ["summary", "Your source summary"],
    ] as const)
      formInput(target, fields, name, label, {
        long: true,
        max: name === "abstract" ? 8000 : 2000,
      });
    const tags = h("input", {
      value: (() => {
        try {
          return list(fields.tags).join(", ");
        } catch {
          return fields.tags || "";
        }
      })(),
      maxlength: 1700,
      "aria-label": "Tags (comma separated)",
    });
    tags.addEventListener("input", () => {
      fields.tags = JSON.stringify(
        tags.value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      );
      touch();
    });
    target.append(h("label", {}, "Tags (comma separated; at most 20)", tags));
  }
  function renderForm() {
    if (!form) return;
    const active = form,
      fields = active.fields;
    const htmlForm = h("form", { class: "sr-form" });
    htmlForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitForm(active);
    });
    content.append(
      h(
        "h3",
        {},
        {
          protocol: "Draft a protocol version",
          metadata: "Correct report metadata",
          decision: "Record a self-labeled screening decision",
          resolution: "Resolve this exact disagreement",
          retrieval: "Record full-report retrieval",
          extraction: "Record a reported result",
          search: "Record a search run",
          import: "Restore an import draft",
          merge: Boolean(fields.suggestionHash && !fields.targetId)
            ? "Keep possible duplicates separate"
            : "Review a deliberate merge",
          split: "Split original source occurrences",
        }[active.kind],
      ),
      htmlForm,
    );
    if (fields.reportRevision)
      htmlForm.append(
        note(
          `This form targets report revision ${fields.reportRevision}${fields.protocolId ? ` and protocol ${fields.protocolId}` : ""}. It will not be carried into changed source versions automatically. Open a fresh form if that binding has changed.`,
        ),
      );
    if (active.kind === "protocol") {
      for (const [name, label] of [
        ["title", "Protocol title"],
        ["question", "Question"],
        ["population", "Population"],
        ["intervention", "Intervention"],
        ["comparison", "Comparison (optional)"],
        ["outcomes", "Outcomes"],
        ["timeHorizon", "Time horizon (optional)"],
        ["inclusion", "Inclusion rules"],
        ["exclusion", "Exclusion rules"],
        ["searchPlan", "Search plan"],
      ] as const)
        formInput(htmlForm, fields, name, label, {
          required: !["comparison", "timeHorizon"].includes(name),
          long: !["title", "timeHorizon"].includes(name),
          max: name === "title" ? 180 : name === "timeHorizon" ? 500 : 2000,
        });
      formChoices(
        htmlForm,
        fields,
        "eligibleDesigns",
        "Eligible designs — unknown is an explicit choice",
        designs,
      );
      formChoices(
        htmlForm,
        fields,
        "eligibleSourceClasses",
        "Eligible source classes",
        classes,
      );
      htmlForm.append(
        note(
          `Based on: ${fields.basedOnId || "new question"}. Freezing records a browser time and content hash, not an authenticated preregistration.`,
        ),
      );
    } else if (active.kind === "metadata") {
      metadataInputs(htmlForm, fields);
      formInput(htmlForm, fields, "reason", "Why is this correction needed?", {
        required: true,
        long: true,
      });
      htmlForm.append(
        note(
          "A changed report revision makes its old screening, retrieval and extraction historical. Original cells and prior versions remain.",
        ),
      );
    } else if (active.kind === "search") {
      formInput(
        htmlForm,
        fields,
        "source",
        "Database, register or other source",
        { required: true },
      );
      formInput(htmlForm, fields, "query", "Exact query (unknown if blank)", {
        long: true,
      });
      formInput(
        htmlForm,
        fields,
        "searchedOn",
        "Date searched (leave unknown if not recorded)",
        { type: "date" },
      );
      formInput(htmlForm, fields, "performed", "Search activity", {
        choices: ["unknown", "self-reported"],
      });
      formInput(htmlForm, fields, "provenanceNote", "Provenance and limits", {
        long: true,
      });
    } else if (active.kind === "decision") {
      htmlForm.append(
        para(
          `${fields.stage} · lane ${fields.lane}. This label does not prove reviewer identity or independence.`,
        ),
      );
      formInput(htmlForm, fields, "laneLabel", "Self-recorded lane label", {
        required: true,
        max: 200,
      });
      formInput(htmlForm, fields, "outcome", "Decision", {
        choices:
          fields.stage === "title-abstract"
            ? ["advance", "exclude", "undecided"]
            : ["include", "exclude", "undecided"],
      });
      formInput(
        htmlForm,
        fields,
        "reasonCode",
        "Reason code (required for exclusion)",
        { max: 200 },
      );
      formInput(
        htmlForm,
        fields,
        "reason",
        "Reason and limits (required for exclusion)",
        { long: true },
      );
    } else if (active.kind === "resolution") {
      htmlForm.append(
        note(
          "This resolution applies only to the exact current A/B pair. A superseding lane decision invalidates it.",
        ),
      );
      formInput(htmlForm, fields, "outcome", "Resolved outcome", {
        choices:
          fields.stage === "title-abstract"
            ? ["advance", "exclude"]
            : ["include", "exclude"],
      });
      formInput(
        htmlForm,
        fields,
        "resolverLabel",
        "Self-recorded resolver label",
        { required: true, max: 200 },
      );
      formInput(
        htmlForm,
        fields,
        "reason",
        "Why is this resolution appropriate?",
        { required: true, long: true },
      );
    } else if (active.kind === "retrieval") {
      formInput(htmlForm, fields, "state", "Retrieval state", {
        choices: ["pending", "obtained", "not-retrieved"],
      });
      formInput(
        htmlForm,
        fields,
        "sourceReference",
        "Access/source reference (optional)",
        { long: true },
      );
      formInput(
        htmlForm,
        fields,
        "reason",
        "Reason (required when not retrieved)",
        { long: true },
      );
    } else if (active.kind === "extraction") {
      htmlForm.append(
        note(
          "Record what the report says. Unknown fields stay blank; this register does not verify a result or combine effects.",
        ),
      );
      const grid = h("div", { class: "sr-grid" });
      for (const [name, label] of [
        ["comparison", "Comparison"],
        ["population", "Population"],
        ["outcome", "Outcome"],
        ["measure", "Measure"],
        ["unit", "Unit"],
        ["followUp", "Follow-up"],
        ["estimate", "Estimate"],
        ["lower", "Lower bound"],
        ["upper", "Upper bound"],
        ["denominator", "Denominator"],
      ] as const)
        formInput(grid, fields, name, label, {
          type: ["estimate", "lower", "upper", "denominator"].includes(name)
            ? "number"
            : "text",
        });
      htmlForm.append(grid);
      for (const [name, label] of [
        ["sourceReference", "Exact page, table or source reference"],
        ["bias", "Bias considerations"],
        ["limitations", "Limits and uncertainty"],
      ] as const)
        formInput(htmlForm, fields, name, label, { long: true });
    } else if (active.kind === "merge") renderMergeForm(htmlForm, active);
    else if (active.kind === "split") renderSplitForm(htmlForm, active);
    else
      htmlForm.append(
        note(
          "Original file bytes are never stored in a form draft. Select the CSV again and review a fresh preview.",
        ),
      );
    const submitNames: Record<FormKind, string> = {
      protocol: "Freeze this protocol content",
      metadata: "Record metadata correction",
      search: "Record search provenance",
      decision: "Record decision",
      resolution: "Record exact-pair resolution",
      retrieval: "Record retrieval",
      extraction: "Record extraction",
      import: "Return to file selection",
      merge: Boolean(fields.suggestionHash && !fields.targetId)
        ? "Record separate-report reason"
        : "Merge these duplicate reports",
      split: "Record this split",
    };
    const submit = h(
      "button",
      {
        type: "submit",
        class: "sr-button sr-primary sr-write-action",
        disabled: !writeAllowed(),
      },
      submitNames[active.kind],
    );
    htmlForm.append(
      h(
        "div",
        { class: "sr-actions" },
        submit,
        button("Save form draft", () => saveDraft(), { write: true }),
        button("Close form", () =>
          askLeave(() => {
            form = null;
            render();
          }),
        ),
      ),
    );
  }
  function renderRawFormRepair(error: unknown) {
    if (!form) return;
    const active = form;
    content.append(
      h("h3", {}, "Keep and repair the unfinished raw form"),
      para(
        "These saved fields are still an unfinished draft. They have not become active research records. Correct the raw values below, then reopen the labeled form, or download a backup before discarding them.",
      ),
      para(studyErrorMessage(error), "sr-error"),
    );
    for (const [name, value] of Object.entries(active.fields)) {
      const input = h(
        "textarea",
        { rows: 3, maxlength: 8000, "aria-label": `Raw field: ${name}` },
        value,
      );
      input.addEventListener("input", () => {
        active.fields[name] = input.value;
        touch();
      });
      content.append(h("label", {}, `Raw field: ${name}`, input));
    }
    content.append(
      button("Try opening the repaired form", () => render()),
      button("Save repaired raw draft", () => saveDraft(), { write: true }),
      button("Download current work with raw draft", downloadBackup),
      button("Close raw-form view", () =>
        askLeave(() => {
          form = null;
          render();
        }),
      ),
    );
  }
  function renderMergeForm(target: HTMLElement, active: OpenForm) {
    const fields = active.fields;
    const ids = list(fields.reportIds);
    const records = ids
      .map((id) => state().reports.find((report) => report.id === id))
      .filter((report): report is StudyState["reports"][number] =>
        Boolean(report),
      );
    for (const report of records)
      target.append(
        h(
          "details",
          {},
          h("summary", {}, report.revisions.at(-1)!.metadata.title),
          h("pre", {}, JSON.stringify(report.revisions.at(-1), null, 2)),
        ),
      );
    if (!fields.suggestionHash || Boolean(fields.targetId)) {
      target.append(
        selectControl(
          "Stable target report identity",
          fields.targetId || "",
          records.map((report): [string, string] => [
            report.id,
            report.revisions.at(-1)!.metadata.title,
          ]),
          (value) => {
            fields.targetId = value;
            const report = records.find((entry) => entry.id === value)!;
            fields.metadata = JSON.stringify(
              metadataFields(report.revisions.at(-1)!.metadata),
            );
            touch();
            render();
          },
        ),
      );
      const metadata = JSON.parse(fields.metadata || "{}") as Fields;
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata) ||
        Object.values(metadata).some((value) => typeof value !== "string")
      )
        throw Error(
          "Canonical metadata in this unfinished merge must be a JSON object of raw string fields. Repair its original text below.",
        );
      const metadataPanel = h(
        "details",
        { open: true },
        h("summary", {}, "Canonical metadata retained on the target"),
      );
      metadataInputs(metadataPanel, metadata);
      metadataPanel.addEventListener("input", () => {
        fields.metadata = JSON.stringify(metadata);
      });
      metadataPanel.addEventListener("change", () => {
        fields.metadata = JSON.stringify(metadata);
      });
      target.append(metadataPanel);
      target.append(
        note(
          "Every occurrence moves to this target. Other stable report IDs and old revisions remain in history; their current occurrence lists become empty. Existing decisions are not carried forward. Conflicting DOI/PMID values must be corrected first.",
        ),
      );
    }
    formInput(
      target,
      fields,
      "reason",
      "Why should these reports be merged or kept separate?",
      { required: true, long: true },
    );
  }
  function renderSplitForm(target: HTMLElement, active: OpenForm) {
    const report = state().reports.find(
      (entry) => entry.id === active.targetId,
    )!;
    const revision = report.revisions.at(-1)!;
    if (revision.occurrenceIds.length < 2) {
      target.append(
        note(
          "This report has only one occurrence, so there is no nonempty split to record.",
        ),
      );
      return;
    }
    if (active.fields.partitions) {
      const saved = JSON.parse(active.fields.partitions) as {
        label: string;
        occurrenceIds: string[];
        title: string;
        retainOriginal: boolean;
      }[];
      if (
        !Array.isArray(saved) ||
        saved.some(
          (partition) =>
            !partition ||
            typeof partition.label !== "string" ||
            typeof partition.title !== "string" ||
            typeof partition.retainOriginal !== "boolean" ||
            !Array.isArray(partition.occurrenceIds) ||
            partition.occurrenceIds.some((id) => typeof id !== "string"),
        )
      )
        throw Error(
          "The unfinished split must be a JSON list of groups with label, occurrenceIds, title and retainOriginal fields. Its raw text is retained for repair.",
        );
      splitRetainGroup =
        saved.find((partition) => partition.retainOriginal)?.label ?? null;
      for (const partition of saved) {
        for (const id of partition.occurrenceIds)
          splitGroups[id] = partition.label;
        splitTitles[partition.label] = partition.title;
      }
    }
    for (const id of revision.occurrenceIds) {
      const occurrence = state().occurrences.find((entry) => entry.id === id)!;
      splitGroups[id] ??= `group-${revision.occurrenceIds.indexOf(id) + 1}`;
      const group = h("input", {
        value: splitGroups[id],
        maxlength: 100,
        "aria-label": `Group for occurrence ${id}`,
      });
      group.addEventListener("input", () => {
        splitGroups[id] = group.value;
        touch();
        updateSplitDraft(active, revision);
      });
      target.append(
        h(
          "label",
          {},
          `Occurrence ${short(id)} · source row ${occurrence.row} · ${occurrence.imported.title}`,
          group,
        ),
      );
    }
    target.append(
      button("Review split groups", () => {
        updateSplitDraft(active, revision);
        render();
      }),
    );
    const groups = [
      ...new Set(revision.occurrenceIds.map((id) => splitGroups[id])),
    ];
    if (!groups.includes(splitRetainGroup ?? ""))
      splitRetainGroup = groups[0] ?? null;
    target.append(
      selectControl(
        "Group retaining the original report identity",
        splitRetainGroup || "",
        groups.map((group): [string, string] => [
          group,
          group || "(empty group label)",
        ]),
        (value) => {
          splitRetainGroup = value;
          touch();
          updateSplitDraft(active, revision);
          render();
        },
      ),
    );
    for (const [index, group] of groups.entries()) {
      const title = h("input", {
        value: splitTitles[group] ?? revision.metadata.title,
        maxlength: 500,
        "aria-label": `Canonical title for group ${group}`,
      });
      title.addEventListener("input", () => {
        splitTitles[group] = title.value;
        touch();
        updateSplitDraft(active, revision);
      });
      target.append(
        h(
          "label",
          {},
          `Group ${group}${group === splitRetainGroup ? " — retains original report ID" : " — receives a new report ID"}: canonical title`,
          title,
        ),
      );
    }
    target.append(
      note(
        "All occurrences must be assigned to 2–20 nonempty groups. Choose exactly one group to retain the original identity. Other metadata is deliberately copied from the current report; correct each new report separately if its metadata differs. All old revisions and decisions remain historical.",
      ),
    );
    formInput(target, active.fields, "reason", "Why is this split needed?", {
      required: true,
      long: true,
    });
    if (!active.fields.partitions) updateSplitDraft(active, revision);
  }
  function updateSplitDraft(
    active: OpenForm,
    revision: StudyState["reports"][number]["revisions"][number],
  ) {
    const groups = [
      ...new Set(revision.occurrenceIds.map((id) => splitGroups[id])),
    ];
    if (!groups.includes(splitRetainGroup ?? ""))
      splitRetainGroup = groups[0] ?? null;
    active.fields.partitions = JSON.stringify(
      groups.map((label, index) => ({
        label,
        occurrenceIds: revision.occurrenceIds.filter(
          (id) => splitGroups[id] === label,
        ),
        title: splitTitles[label] ?? revision.metadata.title,
        retainOriginal: label === splitRetainGroup,
      })),
    );
  }
  async function submitForm(active: OpenForm) {
    try {
      const f = active.fields;
      let command: StudyCommand;
      if (active.kind === "protocol") {
        const content: ProtocolContent = {
          title: f.title,
          question: f.question,
          population: f.population,
          intervention: f.intervention,
          comparison: nullable(f.comparison),
          outcomes: f.outcomes,
          timeHorizon: nullable(f.timeHorizon),
          eligibleDesigns: list(
            f.eligibleDesigns,
          ) as ProtocolContent["eligibleDesigns"],
          eligibleSourceClasses: list(
            f.eligibleSourceClasses,
          ) as ProtocolContent["eligibleSourceClasses"],
          inclusion: f.inclusion,
          exclusion: f.exclusion,
          searchPlan: f.searchPlan,
        };
        command = {
          kind: "protocol.freeze",
          content,
          basedOnId: nullable(f.basedOnId),
        };
      } else if (active.kind === "search")
        command = {
          kind: "search.record",
          source: f.source,
          query: nullable(f.query),
          searchedOn: nullable(f.searchedOn),
          performed: f.performed as "unknown" | "self-reported",
          provenanceNote: nullable(f.provenanceNote),
        };
      else if (active.kind === "metadata") {
        command = {
          kind: "report.correct",
          reportId: active.targetId!,
          reportRevision: Number(f.reportRevision),
          metadata: readMetadata(f),
          reason: f.reason,
        };
      } else if (active.kind === "merge") {
        command = Boolean(f.suggestionHash && !f.targetId)
          ? {
              kind: "duplicates.decline",
              suggestionHash: f.suggestionHash,
              reportIds: list(f.reportIds),
              reason: f.reason,
            }
          : {
              kind: "duplicates.merge",
              reportIds: list(f.reportIds),
              targetId: f.targetId,
              metadata: readMetadata(JSON.parse(f.metadata)),
              reason: f.reason,
            };
      } else if (active.kind === "split") {
        const report = state().reports.find(
          (entry) => entry.id === active.targetId,
        )!;
        const partitions = JSON.parse(f.partitions || "[]") as {
          occurrenceIds: string[];
          title: string;
          retainOriginal: boolean;
        }[];
        command = {
          kind: "duplicates.split",
          reportId: report.id,
          reportRevision: Number(f.reportRevision),
          partitions: partitions.map((partition) => ({
            retainOriginal: partition.retainOriginal,
            occurrenceIds: partition.occurrenceIds,
            metadata: {
              ...report.revisions.at(-1)!.metadata,
              title: partition.title,
            },
          })),
          reason: f.reason,
        };
      } else if (active.kind === "import") {
        columnMap = studyColumnMap(f.columnMap || "{}");
        csvSearchRun = f.searchRunId || "";
        csvProvenance = f.provenanceNote || "";
        importReason = f.reason || "";
        restoredMapping = true;
        form = null;
        dirty = false;
        tab = "imports";
        render();
        say(
          "Reselect the original CSV and inspect the restored mapping against its headers. Nothing has been imported.",
        );
        return;
      } else {
        if (!active.targetId) throw Error("Select a current report.");
        const view = studyReportView(state(), active.targetId);
        if (
          !view.binding ||
          !f.protocolId ||
          !f.protocolHash ||
          !f.reportRevision
        )
          throw Error(
            "Select the current protocol and open a fresh report form before recording this action.",
          );
        const binding = {
          protocolId: f.protocolId,
          protocolHash: f.protocolHash,
          reportId: active.targetId,
          reportRevision: Number(f.reportRevision),
        };
        if (active.kind === "decision") {
          const stage = f.stage as "title-abstract" | "full-report",
            lane = f.lane as "A" | "B";
          const current = stage === "title-abstract" ? view.title : view.full;
          command = {
            kind: "decision.record",
            ...binding,
            stage,
            lane,
            laneLabel: f.laneLabel,
            outcome: f.outcome as
              "advance" | "include" | "exclude" | "undecided",
            reasonCode: nullable(f.reasonCode),
            reason: nullable(f.reason),
            retrievalId: nullable(f.retrievalId),
            supersedesId: nullable(f.supersedesId),
          };
        } else if (active.kind === "resolution") {
          const stage = f.stage as "title-abstract" | "full-report",
            current = stage === "title-abstract" ? view.title : view.full;
          if (!current.decisionA || !current.decisionB)
            throw Error("Two current completed decisions are required.");
          command = {
            kind: "resolution.record",
            ...binding,
            stage,
            decisionA: f.decisionA,
            decisionB: f.decisionB,
            outcome: f.outcome as "advance" | "include" | "exclude",
            resolverLabel: f.resolverLabel,
            reason: f.reason,
          };
        } else if (active.kind === "retrieval") {
          if (!view.title.basisHash)
            throw Error("A current advanced title/abstract basis is required.");
          command = {
            kind: "retrieval.record",
            ...binding,
            titleBasisHash: f.titleBasisHash,
            state: f.state as "pending" | "obtained" | "not-retrieved",
            reason: nullable(f.reason),
            sourceReference: nullable(f.sourceReference),
            supersedesId: nullable(f.supersedesId),
          };
        } else {
          if (!view.full.inclusionHash)
            throw Error("A current included report is required.");
          const values = {
            comparison: nullable(f.comparison),
            population: nullable(f.population),
            outcome: nullable(f.outcome),
            measure: nullable(f.measure),
            unit: nullable(f.unit),
            followUp: nullable(f.followUp),
            estimate: studyNumber(f.estimate || "", "Estimate"),
            lower: studyNumber(f.lower || "", "Lower bound"),
            upper: studyNumber(f.upper || "", "Upper bound"),
            denominator: studyNumber(f.denominator || "", "Denominator"),
            sourceReference: nullable(f.sourceReference),
            bias: nullable(f.bias),
            limitations: nullable(f.limitations),
          };
          command = {
            kind: "extraction.record",
            ...binding,
            inclusionHash: f.inclusionHash,
            supersedesId: nullable(f.supersedesId),
            values,
          };
        }
      }
      await mutate(command, "Self-recorded research action saved.", () => {
        form = null;
        dirty = false;
        if (active.kind === "protocol") tab = "protocol";
        else if (active.kind === "search") tab = "imports";
        else if (["metadata", "merge", "split"].includes(active.kind))
          tab = "reports";
        else tab = "screening";
      });
    } catch (error) {
      say(studyErrorMessage(error), true);
    }
  }
  async function exportState() {
    const s = structuredClone(state());
    if (form) s.draft = draft();
    return s;
  }
  async function downloadBackup() {
    await work(async () => {
      const text = await makeStudyBackup(await exportState(), now());
      download("charitology-study-register.json", text, "application/json");
      say(
        "Complete local backup downloaded, including the current bounded raw form draft. Review private or licensed text before sharing.",
      );
    });
  }
  function recovered(result: StoreSnapshot, message: string) {
    form = result.state?.draft.form
      ? structuredClone(result.state.draft.form)
      : null;
    selected = result.state?.draft.selectedReportId || null;
    if (form && result.state) tab = result.state.draft.tab;
    dirty = false;
    importPreview = null;
    epoch.invalidate();
    render();
    say(
      result.unsaved
        ? `${message} This change exists only in memory: the saved browser copy was not replaced. Download current work or retry persistence before closing.`
        : message,
    );
  }
  function renderExports() {
    content.append(
      h("h3", {}, "Keep the flow and the evidence copy"),
      para(
        "These counts describe your selected protocol and current report revisions. They do not count unique underlying studies, people or pooled effects. Filters and pages do not alter the totals.",
      ),
    );
    const snapshot = store.snapshot();
    const s =
      snapshot.code === "corrupt" || snapshot.code === "read_error"
        ? null
        : snapshot.state;
    if (s) {
      protocolBanner();
      if (s.selectedProtocolId) {
        const counts = studyCounts(s);
        const labels = {
          occurrences: "Retained source occurrences",
          collapsedOccurrences: "Occurrences collapsed into report groups",
          canonicalReports: "Current canonical reports",
          titleExcluded: "Title/abstract excluded",
          titleAdvanced: "Advanced to retrieval/full report",
          titlePending: "Title/abstract pending",
          titleConflicts: "Title/abstract conflicts (within pending)",
          includedReports: "Included reports",
          fullExcluded: "Full-report excluded",
          notRetrieved: "Not retrieved",
          fullPending: "Full-report pending",
          fullConflicts: "Full-report conflicts (within pending)",
          includedWithExtraction: "Included with current extraction",
        };
        content.append(
          h(
            "dl",
            { class: "sr-counts" },
            Object.entries(labels).map(([key, label]) =>
              h(
                "div",
                {},
                h("dt", {}, label),
                h("dd", {}, counts[key as keyof typeof counts]),
              ),
            ),
          ),
          note(
            `Occurrence conservation: ${counts.occurrences} = ${counts.collapsedOccurrences} + ${counts.canonicalReports}. Title partition: ${counts.canonicalReports} = ${counts.titleExcluded} + ${counts.titleAdvanced} + ${counts.titlePending}. Advanced partition: ${counts.titleAdvanced} = ${counts.includedReports} + ${counts.fullExcluded} + ${counts.notRetrieved} + ${counts.fullPending}.`,
          ),
        );
        content.append(
          button(
            "Record a packet descriptor",
            () =>
              mutate(
                { kind: "packet.record" },
                "Packet descriptor recorded. Download its complete JSON now; the descriptor alone cannot reconstruct earlier state.",
              ),
            { write: true },
          ),
          button("Download current protocol memo", () => {
            try {
              download(
                "charitology-study-memo.md",
                studyMarkdownMemo(state()),
                "text/markdown;charset=utf-8",
              );
              say("Self-recorded protocol memo downloaded.");
            } catch (error) {
              say(studyErrorMessage(error), true);
            }
          }),
        );
        const exports = h("div", { class: "sr-actions" });
        for (const name of [
          "reports",
          "occurrences",
          "decisions",
          "exclusions",
          "extractions",
        ] as const)
          exports.append(
            button(`Download ${name} CSV`, () => {
              try {
                download(
                  `charitology-study-${name}.csv`,
                  studyCsvExports(state())[name],
                  "text/csv;charset=utf-8",
                );
                say(
                  `${name} CSV downloaded with formula-safe text cells. JSON preserves original text.`,
                );
              } catch (error) {
                say(studyErrorMessage(error), true);
              }
            }),
          );
        content.append(exports);
      }
      const packets = h(
        "details",
        {},
        h("summary", {}, `${s.packets.length} compact packet descriptors`),
      );
      for (const packet of s.packets)
        packets.append(
          h(
            "article",
            { class: "sr-card" },
            note(`${packet.recordedAt} · input SHA-256 ${packet.inputHash}`),
            button("Download this packet JSON", async () => {
              await work(async () => {
                const result = await makeStudyPacket(state(), packet.id, now());
                download(
                  `charitology-study-packet-${packet.id}.json`,
                  result.json,
                  "application/json",
                );
                say(
                  "Restorable packet JSON downloaded. Keep this file; its descriptor cannot rebuild a past state.",
                );
              });
            }),
          ),
        );
      content.append(
        packets,
        button("Download complete current backup", downloadBackup, {
          primary: true,
        }),
      );
    }
    const recovery = h(
      "section",
      { class: "sr-panel" },
      h("h4", {}, "Recover without replacing unseen work"),
      note(
        "Recovery affects only charitology.study-register.v1 on this origin. Legacy extraction desks and unrelated tool keys are untouched. Export current work before reloading, restoring, clearing or undoing.",
      ),
    );
    recovery.append(
      button("Download protected saved bytes", () => {
        try {
          const raw = store.rawSavedCopy();
          if (raw === null || raw === undefined)
            throw Error("No readable saved bytes are available.");
          download(
            "charitology-study-protected-saved.txt",
            raw,
            "text/plain;charset=utf-8",
          );
          say(
            "Protected original bytes downloaded. This may need repair before it is a valid backup.",
          );
        } catch (error) {
          say(studyErrorMessage(error), true);
        }
      }),
      button(
        "Retry saving current valid work",
        async () => {
          await work(async () => {
            const result = await store.retryPersist();
            render();
            say(
              result.unsaved
                ? result.message ||
                    "Browser storage still failed. Download your current backup."
                : "Current candidate saved without repeating a research action.",
            );
          });
        },
        { write: true },
      ),
      button(
        "Undo last workspace replacement",
        async () => {
          inlineReview(
            "Undo the last accepted workspace change?",
            "This restores the previous validated workspace under the same observed-byte guard. It does not edit individual historical entries.",
            async () => {
              recovered(
                await store.undo(),
                "Previous validated workspace restored.",
              );
            },
          );
        },
        { write: true },
      ),
      button("Review reload from saved browser copy", () =>
        inlineReview(
          "Reload the saved browser copy?",
          "Unsaved current work and raw form edits will be discarded. Download them first. This also clears the one-level undo.",
          async () => {
            recovered(
              await store.reload({ discardUnsaved: true }),
              "Saved browser copy reloaded.",
            );
          },
        ),
      ),
    );
    const restoreFile = h("input", {
      type: "file",
      accept: ".json,application/json",
      "aria-label": "Complete study register backup to restore",
      disabled: !store.snapshot().canRecover,
    });
    restoreFile.addEventListener("change", () => {
      void work(async () => {
        const file = restoreFile.files?.[0];
        if (!file) return;
        if (file.size > 2_097_152)
          throw Error("Choose a complete backup no larger than 2 MiB.");
        const generation = epoch.current(),
          raw = await readStudyFile(() => file.text());
        if (!epoch.matches(generation))
          throw Error(
            "Workspace changed while reading. Choose the file again.",
          );
        const preview = await store.previewRestore(raw);
        if (!epoch.matches(generation))
          throw Error("Workspace changed while validating. Preview again.");
        restorePreview = preview;
        inlineReview(
          "Replace this register with the validated backup?",
          "All protocol, occurrence, report, decision, history and bounded draft fields in this key will be replaced. No older tool key is changed.",
          async () => {
            if (!restorePreview) throw Error("Preview the backup again.");
            const result = await store.restore(restorePreview);
            restorePreview = null;
            recovered(result, "Validated backup restored.");
          },
        );
      });
    });
    const clearButton = button("Preview clearing this register", async () => {
      await work(async () => {
        clearPreview = await store.previewClear(blankStudyState(uid(), now()));
        inlineReview(
          "Clear only this study register?",
          "The current valid workspace will be replaced with an empty one. This does not remove earlier downloaded copies or change the legacy research desks. Download a backup first.",
          async () => {
            if (!clearPreview) throw Error("Preview clearing again.");
            const result = await store.clear(clearPreview);
            clearPreview = null;
            recovered(
              result,
              "Current register cleared. Other keys were untouched.",
            );
          },
        );
      });
    });
    clearButton.disabled = !store.snapshot().canRecover;
    recovery.append(
      h("label", {}, "Preview a complete backup before restore", restoreFile),
      clearButton,
    );
    content.append(recovery);
  }
  function inlineReview(
    title: string,
    description: string,
    confirm: () => Promise<void>,
  ) {
    clear(guard);
    guard.append(
      h("h3", {}, title),
      para(description),
      button(
        "Confirm this recovery action",
        async () => {
          await work(async () => {
            await confirm();
            clear(guard);
          });
        },
        { primary: true },
      ),
      button("Keep current work", () => clear(guard)),
    );
    guard.querySelector<HTMLElement>("button")?.focus();
  }
  window.addEventListener("storage", (event) => {
    if (event.key === STUDY_STORAGE_KEY || event.key === null) {
      epoch.invalidate();
      store.noticeExternalChange();
      importPreview = null;
      updateHeader();
      say(
        "Another tab changed saved work. Your current draft is retained; export it before explicitly reloading or recovering.",
        true,
      );
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty || store.snapshot().unsaved) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  render();
  const snap = store.snapshot();
  say(
    snap.message ||
      "Study register ready. Work stays in this browser until you deliberately download it.",
  );
}
