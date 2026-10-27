import { rawStorageRecoveryDownload } from "./raw-storage-recovery";
import {
  PROGRAM_GRAPH_LIMITS,
  PROGRAM_GRAPH_FORM_NAMES,
  blankProgramGraphState,
  canonicalProgramGraphJson,
  hashProgramGraphValue,
  makeProgramGraphBackup,
  prepareProgramGraphCommand,
  programGraphAllowedRelations,
  programGraphCommandForm,
  programGraphFormMatchesCommand,
  programGraphCounts,
  programGraphLinkState,
  programGraphNodeView,
  programGraphPacket,
  programGraphRequiredReappearanceIds,
  type CaptureInput,
  type CapturePreview,
  type CaptureSelection,
  type GraphCommand,
  type GraphDraft,
  type GraphLink,
  type GraphNode,
  type Program,
  type ProgramGraphState,
  type RelationKind,
  type SourceInstance,
  type Tab,
  type LinkVersion,
} from "./program-graph-model";
import {
  adapterForProgram,
  previewProgramCapture,
} from "./program-graph-import";
import {
  createProgramGraphStore,
  PROGRAM_GRAPH_STORAGE_KEY,
  type ClearPreview,
  type RestorePreview,
  type StoreSnapshot,
} from "./program-graph-store";
import { download } from "./files";
import {
  PROGRAM_GRAPH_PROGRAMS,
  graphConnected,
  graphIndexes,
  graphPage,
  graphRawJson,
  graphRawRecovery,
  graphSame,
  graphStringIds,
  knownProgram,
  programGraphLabel,
  programGraphSourceKey,
  readGraphFile,
} from "./program-graph-ui-helpers";

type RawForm = NonNullable<GraphDraft["form"]>;
const mounted = new WeakSet<HTMLElement>();
const tabs: Tab[] = [
  "sources",
  "records",
  "links",
  "connected",
  "import",
  "exports",
  "recovery",
];
const relations: RelationKind[] = [
  "related-to",
  "depends-on",
  "planned-work-for",
  "evidence-note-for",
  "decision-note-for",
  "conflict-note-for",
];
const clone = <T>(value: T): T => structuredClone(value);
const at = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const json = canonicalProgramGraphJson;
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const paragraph = (text: string, kind = "pg-note") => el("p", text, kind);

/** The only automatic storage access is the graph key; source reads require the explicit capture button. */
export async function mountProgramGraph(root: HTMLElement): Promise<void> {
  if (mounted.has(root)) return;
  mounted.add(root);
  const program = root.dataset.initialProgram;
  if (!knownProgram(program))
    throw Error("Unknown program graph configuration.");
  const initialProgram: Program = program;
  const host = root.querySelector<HTMLElement>(".program-graph-mount");
  if (!host) throw Error("The program graph mount is missing.");
  const store = await createProgramGraphStore({
    initialState: blankProgramGraphState(id(), at()),
  });
  let snap = store.snapshot();
  let tab: Tab = snap.state?.draft.tab ?? "sources";
  let sourceId: string | null = snap.state?.draft.sourceId ?? null;
  let nodeId: string | null = snap.state?.draft.nodeId ?? null;
  let form: RawForm | null = clone(snap.state?.draft.form ?? null);
  let dirty = false,
    epoch = 0,
    fileEpoch = 0,
    packetEpoch = 0,
    busy = false;
  let message = "",
    error = false;
  let status: HTMLElement,
    controls: HTMLButtonElement[] = [];
  let pendingFocus: HTMLElement | null = null;
  let pages: Record<string, number> = {};
  let filter = "",
    collectionFilter = "",
    presenceFilter = "",
    sourceFilter = "",
    linkFilter = "";
  let selectedLink: string | null = null,
    connectedStart = "";
  let includeStates = new Set(["current", "stale", "unresolved"]);
  let importProgram: Program = initialProgram,
    targetId = "";
  let selectedBytes: Uint8Array | null = null,
    selectedOrigin: CaptureInput["origin"] | null = null;
  let savedSourceRaw: string | null = null,
    capture: CapturePreview | null = null,
    pendingSource = false;
  let restore: RestorePreview | null = null,
    clear: ClearPreview | null = null;
  let recoveryReviewEpoch = -1;
  let recoveryBytes: Uint8Array | null = null;
  let packet: Awaited<ReturnType<typeof programGraphPacket>> | null = null,
    packetHash: string | null = null;
  const selectedNodes = new Set<string>(),
    selectedLinks = new Set<string>();
  let pendingReplace: (() => void | Promise<void>) | null = null;

  const state = (): ProgramGraphState => {
    if (!snap.state)
      throw Error(
        "No validated graph is available. Preserve the saved raw copy and use Recovery.",
      );
    return snap.state;
  };
  const hasWork = () =>
    dirty ||
    !!form ||
    !!snap.state?.draft.dirty ||
    snap.unsaved ||
    pendingSource ||
    !!recoveryBytes ||
    !!restore ||
    !!clear;
  const draft = (): GraphDraft => ({
    tab,
    sourceId,
    nodeId,
    form: clone(form),
    dirty: !!form,
  });
  const touch = () => {
    epoch++;
    dirty = true;
    restore = null;
    clear = null;
    packet = null;
    packetEpoch++;
    paintStatus();
  };
  const say = (text: string, isError = false) => {
    message = text;
    error = isError;
    paintStatus();
  };
  function paintStatus() {
    if (!status) return;
    status.textContent = busy
      ? "Working…"
      : message ||
        (hasWork()
          ? "Unfinished work is kept in this tab. Save its raw form or download a recovery copy before leaving."
          : "Browser copy ready.");
    status.className = `pg-status${error ? " pg-error" : ""}`;
    status.setAttribute("role", error ? "alert" : "status");
    controls.forEach((button) => {
      const write = button.dataset.write === "true",
        recover = button.dataset.recover === "true";
      button.disabled =
        busy ||
        (write && !snap.canWrite) ||
        (recover && !snap.canRecover) ||
        button.dataset.fixedDisabled === "true";
    });
  }
  function button(
    label: string,
    run: () => void | Promise<void>,
    options: { write?: boolean; recover?: boolean; primary?: boolean } = {},
  ) {
    const b = el(
      "button",
      label,
      `pg-button${options.primary ? " pg-primary" : ""}`,
    );
    b.type = "button";
    b.dataset.write = String(!!options.write);
    b.dataset.recover = String(!!options.recover);
    controls.push(b);
    b.addEventListener("click", () => void action(run));
    return b;
  }
  async function action(run: () => void | Promise<void>) {
    if (busy) return;
    busy = true;
    paintStatus();
    try {
      await run();
    } catch (e) {
      snap = store.snapshot();
      say(
        e instanceof Error
          ? e.message
          : "The action could not finish. Your previous work is retained.",
        true,
      );
      render();
    } finally {
      busy = false;
      paintStatus();
      if (pendingFocus?.isConnected) pendingFocus.focus();
      pendingFocus = null;
    }
  }
  function field(
    parent: HTMLElement,
    label: string,
    value: string,
    change: (value: string) => void,
    options: {
      long?: boolean;
      max?: number;
      readonly?: boolean;
      view?: boolean;
    } = {},
  ) {
    const wrap = el("label", undefined, "pg-field");
    wrap.append(el("span", label));
    const input = options.long ? el("textarea") : el("input");
    input.value = value;
    input.setAttribute("aria-label", label);
    input.maxLength = options.max ?? PROGRAM_GRAPH_LIMITS.draftFieldChars;
    input.readOnly = !!options.readonly;
    input.addEventListener("input", () => {
      change(input.value);
      if (!options.view) touch();
    });
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function select(
    parent: HTMLElement,
    label: string,
    value: string,
    options: [string, string][],
    change: (value: string) => void,
  ) {
    const wrap = el("label", undefined, "pg-field");
    wrap.append(el("span", label));
    const input = el("select");
    input.setAttribute("aria-label", label);
    for (const [key, text] of options) {
      const option = el("option", text);
      option.value = key;
      input.append(option);
    }
    input.value = value;
    input.addEventListener("change", () => change(input.value));
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function check(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    change: (value: boolean) => void,
    disabled = false,
  ) {
    const wrap = el("label", undefined, "pg-check"),
      input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = disabled;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => change(input.checked));
    wrap.append(input, el("span", label));
    parent.append(wrap);
    return input;
  }
  function details(
    parent: HTMLElement,
    title: string,
    run: (body: HTMLElement) => void,
  ) {
    const d = el("details"),
      s = el("summary", title),
      body = el("div");
    d.append(s, body);
    run(body);
    parent.append(d);
    return d;
  }
  function facts(parent: HTMLElement, values: [string, string][]) {
    const dl = el("dl");
    for (const [label, value] of values)
      dl.append(
        el("dt", label),
        el("dd", value === "" ? "Unknown / blank in this copy" : value),
      );
    parent.append(dl);
  }
  function pager<T>(
    parent: HTMLElement,
    key: string,
    items: T[],
    draw: (item: T, index: number) => void,
  ) {
    const p = graphPage(items, pages[key] ?? 0);
    pages[key] = p.page;
    for (let i = 0; i < p.rows.length; i++) draw(p.rows[i], p.page * 25 + i);
    if (!items.length) parent.append(paragraph("No records match this view."));
    if (p.pages > 1) {
      const nav = el("div", undefined, "pg-pager");
      const previous = button("Previous 25", () => {
        pages[key]--;
        render();
      });
      previous.disabled = p.page === 0;
      previous.dataset.fixedDisabled = String(p.page === 0);
      const next = button("Next 25", () => {
        pages[key]++;
        render();
      });
      next.disabled = p.page === p.pages - 1;
      next.dataset.fixedDisabled = String(p.page === p.pages - 1);
      nav.append(
        previous,
        paragraph(`Page ${p.page + 1} of ${p.pages} · ${items.length} records`),
        next,
      );
      parent.append(nav);
    }
  }
  function title(n: GraphNode) {
    const v = programGraphNodeView(state(), n.id);
    const values = v.current.values ?? v.lastPresent.values!;
    const collection = adapterForProgram(v.source.program).collections.find(
      (c) => c.key === n.collection,
    )!;
    return values.title || values.name || collection.singular;
  }
  function nodeLabel(n: GraphNode) {
    const s = state().sources.find((s) => s.id === n.sourceId)!;
    return `${s.alias} · ${n.collection} · ${title(n)} [${n.recordId}]`;
  }
  function sourceCapture(source: SourceInstance) {
    return state().captures.find((c) => c.id === source.currentCaptureId)!;
  }
  function emptyTransient() {
    fileEpoch++;
    packetEpoch++;
    selectedBytes = null;
    selectedOrigin = null;
    savedSourceRaw = null;
    capture = null;
    pendingSource = false;
    packet = null;
    packetHash = null;
    restore = null;
    clear = null;
    recoveryBytes = null;
  }
  function adopt(
    result: StoreSnapshot,
    oldEpoch: number,
    command?: GraphCommand,
    noOp = false,
  ) {
    snap = result;
    packet = null;
    packetEpoch++;
    restore = null;
    clear = null;
    if (epoch === oldEpoch && !noOp) {
      const matched = command && programGraphFormMatchesCommand(form, command);
      if (matched || command?.kind === "draft.replace") {
        form = clone(result.state?.draft.form ?? null);
        dirty = false;
      }
    }
  }
  async function mutate(
    command: GraphCommand,
  ): Promise<{ noOp: boolean; result: StoreSnapshot }> {
    const before = store.snapshot();
    if (!before.state || !before.hash || !before.canWrite)
      throw Error(before.message || "Saving is unavailable. Use Recovery.");
    const version = epoch;
    const prepared = await prepareProgramGraphCommand(before.state, command, {
      expectedStateHash: before.hash,
      at: at(),
      makeId: id,
    });
    if (
      command.kind === "source.capture" &&
      command.preview.origin.kind === "saved-key"
    ) {
      let current: string | null;
      try {
        current = localStorage.getItem(programGraphSourceKey(initialProgram));
      } catch {
        throw Error(
          "The original workspace could not be re-read. No capture was committed.",
        );
      }
      if (current !== savedSourceRaw)
        throw Error(
          "The saved source changed after preview. Recapture it and review the new copy. Nothing was committed.",
        );
    }
    const result = await store.commitPrepared(prepared);
    adopt(result, version, command, prepared.noOp);
    say(
      prepared.noOp
        ? "This is identical to the current entry. No change was made; unfinished form and file choices remain."
        : result.unsaved
          ? "The valid change exists only in this tab. The saved copy is unchanged; download it or retry saving."
          : prepared.summary.message,
    );
    return { noOp: prepared.noOp, result };
  }
  function replaceForm(next: RawForm, go: Tab) {
    const version = epoch;
    const apply = () => {
      if (version !== epoch)
        throw Error(
          "The unfinished form changed after this choice. Review replacement again.",
        );
      form = clone(next);
      tab = go;
      touch();
      pendingReplace = null;
      render();
    };
    if (form && !graphSame(form, next)) {
      pendingReplace = apply;
      render();
    } else apply();
  }
  function rawTools(parent: HTMLElement) {
    if (!form) return;
    const panel = el("div", undefined, "pg-card");
    panel.append(
      el("h3", "Unfinished form"),
      paragraph(
        `Saved bindings remain exact. Form: ${form.kind}. A raw form is not permission to use an old preview or current record versions.`,
      ),
    );
    panel.append(
      button("Resume unfinished form", () => {
        if (!form) return;
        tab =
          form.kind === "capture"
            ? "import"
            : form.kind === "link" ||
                form.kind === "review" ||
                form.kind === "retire-link"
              ? "links"
              : "sources";
        if (
          (form.kind === "rename-source" || form.kind === "retire-source") &&
          state().sources.some((source) => source.id === form!.targetId)
        )
          sourceId = form.targetId;
        epoch++;
        render();
      }),
      button(
        "Save unfinished form in graph",
        async () => {
          await mutate({ kind: "draft.replace", draft: draft() });
          render();
        },
        { write: true },
      ),
      button("Download unfinished raw form", () =>
        download(
          "charitology-program-graph-raw-form.txt",
          graphRawRecovery(draft()),
        ),
      ),
    );
    details(panel, "Inspect or repair exact raw fields", (body) => {
      body.append(
        paragraph(
          "These are recovery fields. Repairing them does not authorize a capture or a relationship; every command is checked again. Missing fields stay missing until you add them explicitly.",
        ),
      );
      for (const group of ["binding", "fields"] as const) {
        for (const key of PROGRAM_GRAPH_FORM_NAMES[form!.kind][group]) {
          if (Object.hasOwn(form![group], key))
            field(
              body,
              `${group}.${key}`,
              form![group][key],
              (value) => {
                form![group][key] = value;
              },
              { long: true },
            );
          else
            body.append(
              button(`Add missing ${group}.${key}`, () => {
                form![group][key] = "";
                touch();
                render();
              }),
            );
        }
      }
    });
    panel.append(
      button("Discard unfinished form in this tab", () => {
        const version = epoch;
        pendingReplace = () => {
          if (version !== epoch)
            throw Error(
              "The form changed after the discard review. Review it again.",
            );
          form = null;
          dirty = true;
          epoch++;
          pendingReplace = null;
          say(
            "The form was discarded in this tab. Its saved copy is unchanged until you explicitly save the discarded form state.",
          );
          render();
        };
        render();
      }),
    );
    parent.append(panel);
  }
  function render() {
    const active = document.activeElement as HTMLElement | null;
    let cursor: Node | null = active,
      inside = false;
    while (cursor) {
      if (cursor === root) {
        inside = true;
        break;
      }
      cursor = cursor.parentNode;
    }
    const focusLabel = inside ? active?.getAttribute("aria-label") : null;
    const focusButton =
      inside && active?.tagName === "BUTTON" ? active.textContent : null;
    controls = [];
    host!.replaceChildren();
    const wrap = el("div", undefined, "pg-workspace");
    host!.append(wrap);
    status = el("p", undefined, "pg-status");
    status.setAttribute("aria-live", "polite");
    wrap.append(status);
    if (snap.message)
      wrap.append(
        paragraph(
          snap.message,
          snap.blocked || snap.unsaved ? "pg-warning" : "pg-note",
        ),
      );
    if (snap.state) {
      const c = programGraphCounts(snap.state);
      wrap.append(
        paragraph(
          `${c.sources} source copies · ${c.nodes} tracked records (${c.present} present, ${c.missing} missing) · ${c.links} links: ${c.current} current, ${c.stale} stale, ${c.unresolved} unresolved, ${c.retired} retired`,
          "pg-counts",
        ),
      );
    } else
      wrap.append(
        paragraph(
          "No validated graph is available. Saved bytes have not been replaced. Recovery and raw-copy download remain available.",
          "pg-warning",
        ),
      );
    const nav = el("nav", undefined, "pg-tabs");
    nav.setAttribute("aria-label", "Program graph views");
    for (const name of tabs) {
      const b = button(programGraphLabel(name), () => {
        epoch++;
        tab = name;
        pages = {};
        render();
      });
      if (tab === name) b.setAttribute("aria-current", "page");
      nav.append(b);
    }
    wrap.append(nav);
    if (pendingReplace) {
      const warning = el("div", undefined, "pg-warning");
      warning.append(
        paragraph(
          "The next action can replace unfinished work. Save or download a recovery copy before continuing.",
        ),
        button("Download current raw form", () =>
          download(
            "charitology-program-graph-raw-form.txt",
            graphRawRecovery(draft()),
          ),
        ),
        button("Continue and replace unfinished form", () =>
          pendingReplace?.(),
        ),
        button("Keep unfinished form", () => {
          pendingReplace = null;
          render();
        }),
      );
      wrap.append(warning);
    }
    if (snap.state) {
      if (tab === "sources") renderSources(wrap);
      if (tab === "records") renderRecords(wrap);
      if (tab === "links") renderLinks(wrap);
      if (tab === "connected") renderConnected(wrap);
      if (tab === "import") renderImport(wrap);
      if (tab === "exports") renderExports(wrap);
    }
    if (tab === "recovery" || !snap.state) renderRecovery(wrap);
    if (!form && dirty && snap.state) {
      wrap.append(
        paragraph(
          "The displayed form was discarded or changed only in this tab. Save this form state explicitly to remove an older saved form; captured records and histories remain.",
        ),
        button(
          "Save discarded form state",
          async () => {
            const version = epoch;
            const result = await mutate({
              kind: "draft.replace",
              draft: { tab, sourceId, nodeId, form: null, dirty: false },
            });
            if (version === epoch && form === null) dirty = false;
            say(
              result.result.unsaved
                ? "The discarded form state exists only in memory. The saved copy is unchanged; export or retry saving."
                : "The empty form state is saved. Captured records and histories remain.",
            );
            render();
          },
          { write: true },
        ),
      );
    }
    rawTools(wrap);
    paintStatus();
    controls.forEach((b) => {
      if (b.dataset.fixedDisabled === "true") b.disabled = true;
    });
    if (focusLabel) {
      const control = [
        ...host!.querySelectorAll<HTMLElement>("input,select,textarea"),
      ].find((n) => n.getAttribute("aria-label") === focusLabel);
      control?.focus();
    } else if (focusButton) {
      const next = controls.find(
        (b) =>
          b.textContent === focusButton && b.dataset.fixedDisabled !== "true",
      );
      if (next) {
        if (busy) pendingFocus = next;
        else next.focus();
      }
    }
  }

  function renderSources(parent: HTMLElement) {
    parent.append(
      el("h3", "Source copies"),
      paragraph(
        "A source is an explicitly chosen copy of one program workspace. Retired sources and missing rows stay in history; their records cannot make a link current.",
      ),
    );
    parent.append(
      button("Choose a source to capture", () => {
        tab = "import";
        render();
      }),
    );
    pager(parent, "sources", state().sources, (source) => {
      const card = el("article", undefined, "pg-card"),
        cap = sourceCapture(source);
      card.append(
        el("h4", source.alias),
        paragraph(
          `${programGraphLabel(source.program)} · ${source.retirement ? "Retired" : "Active"} · capture ${cap.sequence}`,
        ),
      );
      card.append(
        button("Inspect source " + source.alias, () => {
          sourceId = source.id;
          render();
        }),
      );
      parent.append(card);
    });
    const source = state().sources.find((s) => s.id === sourceId);
    if (!source) return;
    const cap = sourceCapture(source),
      panel = el("section", undefined, "pg-card");
    panel.append(el("h3", source.alias));
    const href = el("a", "Open original program workspace");
    href.href = `${root.dataset.base ?? ""}/programs/${source.program}/`;
    panel.append(
      href,
      paragraph(
        "This opens the program page, not the captured record or a historical version. Captures do not write back to that workspace.",
      ),
    );
    facts(panel, [
      ["Graph source ID", source.id],
      ["Current capture", cap.id],
      ["Captured locally", cap.capturedAt],
      ["Source asserted update", cap.sourceUpdated],
      ["Adapter hash", source.adapterHash],
      ["Original byte hash", cap.sourceRawHash],
      ["Whole source canonical hash", cap.sourceCanonicalHash],
      [
        "Retirement",
        source.retirement
          ? `${source.retirement.at}\n${source.retirement.reason}`
          : "Not currently retired",
      ],
    ]);
    details(panel, "Complete captured context", (body) =>
      contextFacts(body, source.program, cap.context),
    );
    details(
      panel,
      `Complete source ID inventory (${cap.inventory.length}; unselected values are not stored)`,
      (body) => {
        for (const row of cap.inventory)
          body.append(paragraph(`${row.collection} / ${row.recordId}`));
      },
    );
    panel.append(
      button("Rename source alias", () =>
        replaceForm(
          {
            kind: "rename-source",
            targetId: source.id,
            binding: { sourceId: source.id },
            fields: { alias: source.alias },
          },
          "sources",
        ),
      ),
      button(
        source.retirement
          ? "Refresh and explicitly resume source"
          : "Refresh this source",
        () => {
          importProgram = source.program;
          targetId = source.id;
          tab = "import";
          capture = null;
          render();
        },
      ),
      button("Retire source", () =>
        replaceForm(
          {
            kind: "retire-source",
            targetId: source.id,
            binding: {
              sourceId: source.id,
              expectedCaptureId: source.currentCaptureId,
            },
            fields: { reason: "" },
          },
          "sources",
        ),
      ),
    );
    details(panel, "Capture history (self-recorded)", (body) => {
      for (const c of state()
        .captures.filter((c) => c.sourceId === source.id)
        .toReversed()) {
        facts(body, [
          ["Capture", `${c.sequence} · ${c.id}`],
          ["Captured locally", c.capturedAt],
          ["Whole inventory rows", String(c.inventory.length)],
          ["Hash", c.hash],
        ]);
        details(body, "Context at this capture", (b) =>
          contextFacts(b, source.program, c.context),
        );
      }
    });
    parent.append(panel);
    if (form?.kind === "rename-source") {
      const f = form;
      field(
        parent,
        "New display alias",
        f.fields.alias ?? "",
        (v) => (f.fields.alias = v),
        { max: 160 },
      );
      parent.append(
        button(
          "Save source alias",
          async () => {
            await mutate({
              kind: "source.rename",
              sourceId: f.binding.sourceId,
              alias: f.fields.alias,
            });
            render();
          },
          { write: true },
        ),
      );
    }
    if (form?.kind === "retire-source") {
      const f = form;
      field(
        parent,
        "Reason for retiring this source",
        f.fields.reason ?? "",
        (v) => (f.fields.reason = v),
        { long: true, max: 2000 },
      );
      parent.append(
        paragraph(
          "Retirement retains captured values and histories. Alias and retirement are current metadata; this notebook does not reconstruct earlier alias or retirement intervals.",
        ),
        button(
          "Confirm source retirement",
          async () => {
            await mutate({
              kind: "source.retire",
              sourceId: f.binding.sourceId,
              expectedCaptureId: f.binding.expectedCaptureId,
              reason: f.fields.reason,
            });
            render();
          },
          { write: true },
        ),
      );
    }
  }
  function contextFacts(
    parent: HTMLElement,
    program: Program,
    context: Record<string, string>,
  ) {
    facts(
      parent,
      adapterForProgram(program).context.map((f) => [f.label, context[f.key]]),
    );
  }
  function renderRecords(parent: HTMLElement) {
    parent.append(el("h3", "Tracked record copies"));
    const filters = el("div", undefined, "pg-grid");
    select(
      filters,
      "Source filter",
      sourceFilter,
      [
        ["", "All sources"],
        ...state().sources.map((s) => [s.id, s.alias] as [string, string]),
      ],
      (v) => {
        sourceFilter = v;
        pages.records = 0;
        render();
      },
    );
    select(
      filters,
      "Presence filter",
      presenceFilter,
      [
        ["", "Any presence"],
        ["present", "Present"],
        ["missing", "Missing in this capture"],
      ],
      (v) => {
        presenceFilter = v;
        pages.records = 0;
        render();
      },
    );
    const collections = [...new Set(state().nodes.map((n) => n.collection))];
    select(
      filters,
      "Collection filter",
      collectionFilter,
      [
        ["", "All collections"],
        ...collections.map((v) => [v, v] as [string, string]),
      ],
      (v) => {
        collectionFilter = v;
        pages.records = 0;
        render();
      },
    );
    field(
      filters,
      "Find record text",
      filter,
      (v) => {
        filter = v;
      },
      { max: 500, view: true },
    );
    filters.append(
      button("Apply record filters", () => {
        pages.records = 0;
        render();
      }),
    );
    parent.append(filters);
    const nodes = state().nodes.filter(
      (n) =>
        (!sourceFilter || n.sourceId === sourceFilter) &&
        (!collectionFilter || n.collection === collectionFilter) &&
        (!presenceFilter ||
          programGraphNodeView(state(), n.id).current.presence ===
            presenceFilter) &&
        nodeLabel(n).toLowerCase().includes(filter.toLowerCase()),
    );
    pager(parent, "records", nodes, (n) => {
      const card = el("article", undefined, "pg-card");
      card.append(
        el("h4", nodeLabel(n)),
        paragraph(
          programGraphNodeView(state(), n.id).current.presence === "missing"
            ? "Not present in this capture; old values remain historical."
            : "Present in this captured copy.",
        ),
        button("Inspect record " + n.recordId, () => {
          nodeId = n.id;
          render();
        }),
      );
      parent.append(card);
    });
    if (nodeId && state().nodes.some((n) => n.id === nodeId))
      renderNode(parent, nodeId);
  }
  function renderNode(parent: HTMLElement, key: string) {
    const v = programGraphNodeView(state(), key),
      panel = el("section", undefined, "pg-card");
    panel.append(el("h3", nodeLabel(v.node)));
    if (v.current.presence === "missing")
      panel.append(
        paragraph(
          "This row was not present in the selected source capture. This is not proof that it was deleted elsewhere. The following retained values are historical.",
          "pg-warning",
        ),
      );
    if (v.history.some((h) => h.reappeared))
      panel.append(
        paragraph(
          "This source ID reappeared after an absence. Identity continuity is unknown. A new link review requires a separate acknowledgement.",
          "pg-warning",
        ),
      );
    const present = v.current.values ? v.current : v.lastPresent,
      collection = adapterForProgram(v.source.program).collections.find(
        (c) => c.key === v.node.collection,
      )!;
    facts(panel, [
      ["Graph node", v.node.id],
      ["Source record ID", v.node.recordId],
      ["Current node version", v.current.id],
      ["Presence", v.current.presence],
      ["Current context hash", v.current.contextHash],
    ]);
    facts(
      panel,
      collection.fields.map((f) => [f.label, present.values![f.key]]),
    );
    const cap = state().captures.find((c) => c.id === present.captureId)!;
    details(panel, "Exact context for these values", (body) =>
      contextFacts(body, v.source.program, cap.context),
    );
    details(panel, "Immutable version history", (body) => {
      for (const h of v.history.toReversed()) {
        facts(body, [
          ["Version", `${h.version} · ${h.id}`],
          ["Presence", h.presence],
          ["Capture", h.captureId],
          ["Hash", h.hash],
        ]);
        if (h.values)
          facts(
            body,
            collection.fields.map((f) => [f.label, h.values![f.key]]),
          );
      }
    });
    panel.append(
      button("Connect this record", () => startLink(v.node.id)),
      button("Explore connections from this record", () => {
        connectedStart = v.node.id;
        tab = "connected";
        render();
      }),
    );
    details(
      panel,
      `Incoming (${v.incoming.length}) and outgoing (${v.outgoing.length}) links`,
      (body) => {
        for (const linkId of [...new Set([...v.incoming, ...v.outgoing])]) {
          const link = state().links.find((l) => l.id === linkId)!;
          body.append(
            button(
              `${link.kind} · ${programGraphLinkState(state(), link.id).state}`,
              () => {
                selectedLink = link.id;
                tab = "links";
                render();
              },
            ),
          );
        }
      },
    );
    parent.append(panel);
  }

  function renderLinks(parent: HTMLElement) {
    parent.append(
      el("h3", "Explanations between records"),
      paragraph(
        "Links pin two exact record versions and your reason. Current means those copies still match, not that an explanation, decision or result was independently checked.",
      ),
    );
    parent.append(button("Start a new link", () => startLink()));
    select(
      parent,
      "Link state filter",
      linkFilter,
      [
        ["", "All link states"],
        ...["current", "stale", "unresolved", "retired"].map(
          (v) => [v, programGraphLabel(v)] as [string, string],
        ),
      ],
      (v) => {
        linkFilter = v;
        pages.links = 0;
        render();
      },
    );
    const links = state().links.filter(
      (l) =>
        !linkFilter ||
        programGraphLinkState(state(), l.id).state === linkFilter,
    );
    pager(parent, "links", links, (l) => {
      const card = el("article", undefined, "pg-card");
      card.append(
        el("h4", `${l.kind} · ${programGraphLinkState(state(), l.id).state}`),
        paragraph(
          `${nodeLabel(state().nodes.find((n) => n.id === l.from)!)} → ${nodeLabel(state().nodes.find((n) => n.id === l.to)!)}`,
        ),
        button("Inspect link " + l.id, () => {
          selectedLink = l.id;
          render();
        }),
      );
      parent.append(card);
    });
    const link = state().links.find((l) => l.id === selectedLink);
    if (link) renderLinkDetail(parent, link);
    if (form?.kind === "link" || form?.kind === "review")
      renderLinkForm(parent, form);
    if (form?.kind === "retire-link") {
      const f = form;
      field(
        parent,
        "Reason for retiring this link",
        f.fields.reason ?? "",
        (v) => (f.fields.reason = v),
        { long: true, max: 2000 },
      );
      parent.append(
        button(
          "Confirm link retirement",
          async () => {
            await mutate({
              kind: "link.retire",
              linkId: f.binding.linkId,
              expectedLinkVersionId: f.binding.expectedLinkVersionId,
              reason: f.fields.reason,
            });
            render();
          },
          { write: true },
        ),
      );
    }
  }
  function renderLinkDetail(parent: HTMLElement, link: GraphLink) {
    const panel = el("section", undefined, "pg-card"),
      view = programGraphLinkState(state(), link.id);
    panel.append(el("h3", `${link.kind} · ${view.state}`));
    for (const reason of view.reasons)
      panel.append(paragraph(reason, "pg-warning"));
    const versions = state()
      .linkVersions.filter((v) => v.linkId === link.id)
      .toReversed();
    for (const v of versions)
      details(panel, `Link version ${v.version} · ${v.action}`, (body) => {
        facts(body, [
          ["Recorded locally", v.recordedAt],
          ["Reason", v.reason],
          ["From pinned version", v.fromVersionId],
          ["To pinned version", v.toVersionId],
          ["Link hash", v.hash],
        ]);
        for (const [label, versionId] of [
          ["From", v.fromVersionId],
          ["To", v.toVersionId],
        ]) {
          const version = state().nodeVersions.find((n) => n.id === versionId)!;
          const n = state().nodes.find((n) => n.id === version.nodeId)!;
          details(body, `${label} exact reviewed copy`, (b) => {
            facts(b, Object.entries(version.values ?? {}));
            const source = state().sources.find((s) => s.id === n.sourceId)!;
            contextFacts(
              b,
              source.program,
              state().captures.find((c) => c.id === version.captureId)!.context,
            );
          });
        }
        if (v.legacyField) {
          const version = state().nodeVersions.find(
            (n) =>
              n.id ===
              (v.legacyField!.nodeId === link.from
                ? v.fromVersionId
                : v.toVersionId),
          )!;
          facts(body, [
            ["Existing free-text field", v.legacyField.field],
            ["Exact retained text", version.values![v.legacyField.field]],
            ["Exact string hash", v.legacyField.rawValueHash],
          ]);
          body.append(
            paragraph(
              "This records your choice of reference field and endpoint. The original text was not edited or externally reconciled.",
            ),
          );
        }
        if (v.reappearanceAcknowledged.length)
          body.append(
            paragraph(
              `Reappearance acknowledged for: ${v.reappearanceAcknowledged.join(", ")}. Identity remains self-recorded.`,
            ),
          );
      });
    panel.append(
      button(
        view.state === "retired"
          ? "Review and reopen this link"
          : "Review against current copies",
        () => startLink(undefined, link),
      ),
      button("Retire this link", () =>
        replaceForm(
          {
            kind: "retire-link",
            targetId: link.id,
            binding: {
              linkId: link.id,
              expectedLinkVersionId: link.currentVersionId,
            },
            fields: { reason: "" },
          },
          "links",
        ),
      ),
    );
    parent.append(panel);
  }
  function startLink(from = "", link?: GraphLink) {
    if (link) {
      const c: GraphCommand = {
        kind: "link.review",
        linkId: link.id,
        expectedLinkVersionId: link.currentVersionId,
        from: link.from,
        to: link.to,
        fromVersionId: state().nodes.find((n) => n.id === link.from)!
          .currentVersionId,
        toVersionId: state().nodes.find((n) => n.id === link.to)!
          .currentVersionId,
        kindOfRelation: link.kind,
        reason: "",
        legacyField: null,
        reappearanceAcknowledged: [],
      };
      replaceForm(programGraphCommandForm(c)!, "links");
    } else
      replaceForm(
        {
          kind: "link",
          targetId: null,
          binding: {
            linkId: "",
            expectedLinkVersionId: "",
            from,
            to: "",
            fromVersionId: "",
            toVersionId: "",
          },
          fields: {
            kindOfRelation: "related-to",
            reason: "",
            legacyField: "null",
            reappearanceAcknowledged: "[]",
          },
        },
        "links",
      );
  }
  function renderLinkForm(parent: HTMLElement, f: RawForm) {
    const panel = el("section", undefined, "pg-card");
    panel.append(
      el(
        "h3",
        f.kind === "review" ? "Review fixed link endpoints" : "New link",
      ),
    );
    const options: [string, string][] = [
      ["", "Choose a record"],
      ...state().nodes.map((n) => [n.id, nodeLabel(n)] as [string, string]),
    ];
    const endpoint = (name: "from" | "to") =>
      select(
        panel,
        `${name === "from" ? "From" : "To"} record`,
        f.binding[name] ?? "",
        options,
        (value) => {
          f.binding[name] = value;
          f.binding.fromVersionId = "";
          f.binding.toVersionId = "";
          f.fields.legacyField = "null";
          f.fields.reappearanceAcknowledged = "[]";
          touch();
          render();
        },
      );
    const from = endpoint("from"),
      to = endpoint("to");
    from.disabled = f.kind === "review";
    to.disabled = f.kind === "review";
    const kinds =
      f.kind === "review"
        ? relations
        : state().nodes.some((n) => n.id === f.binding.from)
          ? programGraphAllowedRelations(state(), f.binding.from)
          : relations;
    const type = select(
      panel,
      "Relationship kind",
      f.fields.kindOfRelation ?? "",
      kinds.map((k) => [k, k]),
      (value) => {
        f.fields.kindOfRelation = value;
        f.binding.fromVersionId = "";
        f.binding.toVersionId = "";
        touch();
        render();
      },
    );
    type.disabled = f.kind === "review";
    panel.append(
      button("Bind and inspect current endpoint versions", () => {
        let a = state().nodes.find((n) => n.id === f.binding.from),
          b = state().nodes.find((n) => n.id === f.binding.to);
        if (!a || !b || a.id === b.id)
          throw Error("Choose two distinct tracked records.");
        if (f.fields.kindOfRelation === "related-to" && a.id > b.id)
          [a, b] = [b, a];
        f.binding.from = a.id;
        f.binding.to = b.id;
        f.binding.fromVersionId = a.currentVersionId;
        f.binding.toVersionId = b.currentVersionId;
        f.fields.legacyField = "null";
        f.fields.reappearanceAcknowledged = "[]";
        touch();
        render();
      }),
    );
    facts(panel, [
      ["Bound from version", f.binding.fromVersionId ?? ""],
      ["Bound to version", f.binding.toVersionId ?? ""],
    ]);
    const a = state().nodes.find((n) => n.id === f.binding.from),
      b = state().nodes.find((n) => n.id === f.binding.to);
    if (a && b && f.binding.fromVersionId && f.binding.toVersionId) {
      const current =
        a.currentVersionId === f.binding.fromVersionId &&
        b.currentVersionId === f.binding.toVersionId;
      if (!current)
        panel.append(
          paragraph(
            "A bound endpoint changed. Your form stays pinned to the old version; inspect and explicitly bind current versions before recording a review.",
            "pg-warning",
          ),
        );
      for (const [label, n, versionId] of [
        ["From", a, f.binding.fromVersionId],
        ["To", b, f.binding.toVersionId],
      ] as const) {
        const version = state().nodeVersions.find(
          (v) => v.id === versionId && v.nodeId === n.id,
        );
        if (version)
          details(panel, `${label}: exact bound values and context`, (body) => {
            facts(body, Object.entries(version.values ?? {}));
            const source = state().sources.find((s) => s.id === n.sourceId)!;
            contextFacts(
              body,
              source.program,
              state().captures.find((c) => c.id === version.captureId)!.context,
            );
          });
      }
      let required: string[] = [];
      try {
        required = programGraphRequiredReappearanceIds(
          state(),
          a.id,
          b.id,
          f.binding.linkId || null,
        );
      } catch (e) {
        panel.append(
          paragraph(
            e instanceof Error ? e.message : "Check link identity.",
            "pg-warning",
          ),
        );
      }
      let acknowledged: string[] = [];
      try {
        acknowledged = graphRawJson(
          f.fields.reappearanceAcknowledged,
          graphStringIds,
        );
      } catch {
        panel.append(
          paragraph(
            "The saved reappearance field needs raw repair. It has not been normalized.",
            "pg-warning",
          ),
        );
      }
      for (const key of required)
        check(
          panel,
          `I reviewed the reappeared source ID for ${nodeLabel(state().nodes.find((n) => n.id === key)!)}; identity continuity is unknown.`,
          acknowledged.includes(key),
          (value) => {
            const set = new Set(acknowledged);
            value ? set.add(key) : set.delete(key);
            f.fields.reappearanceAcknowledged = json([...set].sort());
            touch();
            render();
          },
        );
      const legacyOptions: [string, string][] = [
        ["", "No existing text reference"],
      ];
      for (const n of [a, b]) {
        const version = state().nodeVersions.find(
          (v) =>
            v.id ===
            (n.id === a.id ? f.binding.fromVersionId : f.binding.toVersionId),
        );
        if (version?.values)
          for (const field of Object.keys(version.values))
            legacyOptions.push([
              `${n.id}/${field}`,
              `${nodeLabel(n)} · ${field}`,
            ]);
      }
      let selected = "";
      try {
        const value = JSON.parse(f.fields.legacyField);
        if (value?.nodeId && value?.field)
          selected = `${value.nodeId}/${value.field}`;
      } catch {
        panel.append(
          paragraph(
            "The saved legacy-reference field needs raw repair. Blank is not null.",
            "pg-warning",
          ),
        );
      }
      select(
        panel,
        "Existing free-text reference (optional)",
        selected,
        legacyOptions,
        (value) => {
          void action(async () => {
            const inputEpoch = ++epoch;
            if (!value) {
              f.fields.legacyField = "null";
              dirty = true;
              render();
              return;
            }
            const [key, field] = value.split("/"),
              version = state().nodeVersions.find(
                (v) =>
                  v.id ===
                  (key === f.binding.from
                    ? f.binding.fromVersionId
                    : f.binding.toVersionId),
              );
            if (!version?.values || !Object.hasOwn(version.values, field))
              throw Error("The exact reference field is unavailable.");
            const hash = await hashProgramGraphValue(version.values[field]);
            if (epoch !== inputEpoch || form !== f) return;
            f.fields.legacyField = json({
              nodeId: key,
              field,
              rawValueHash: hash,
            });
            dirty = true;
            render();
          });
        },
      );
    }
    field(
      panel,
      "Reason for this exact relationship review",
      f.fields.reason ?? "",
      (value) => (f.fields.reason = value),
      { long: true, max: 2000 },
    );
    panel.append(
      paragraph(
        "A reason records your interpretation. A decision-note link does not supply approval, and a dependency is not evidence of causation.",
      ),
      button(
        f.kind === "review"
          ? "Record review of exact versions"
          : "Record new link",
        async () => {
          const legacy = graphRawJson(
            f.fields.legacyField,
            (v): v is LinkVersion["legacyField"] =>
              v === null || (!!v && typeof v === "object" && !Array.isArray(v)),
          );
          const command: GraphCommand = {
            kind: "link.review",
            linkId: f.binding.linkId || null,
            expectedLinkVersionId: f.binding.expectedLinkVersionId || null,
            from: f.binding.from,
            to: f.binding.to,
            fromVersionId: f.binding.fromVersionId,
            toVersionId: f.binding.toVersionId,
            kindOfRelation: f.fields.kindOfRelation as RelationKind,
            reason: f.fields.reason,
            legacyField: legacy,
            reappearanceAcknowledged: graphRawJson(
              f.fields.reappearanceAcknowledged,
              graphStringIds,
            ),
          };
          await mutate(command);
          render();
        },
        { write: true, primary: true },
      ),
    );
    parent.append(panel);
  }

  function renderConnected(parent: HTMLElement) {
    parent.append(
      el("h3", "Connected work"),
      paragraph(
        "Explore up to two undirected hops and 200 records. This is a bounded reading view, not a causal diagram or a storage/export limit.",
      ),
    );
    select(
      parent,
      "Start record",
      connectedStart,
      [
        ["", "Choose a starting record"],
        ...state().nodes.map((n) => [n.id, nodeLabel(n)] as [string, string]),
      ],
      (value) => {
        connectedStart = value;
        pages.connected = 0;
        render();
      },
    );
    for (const kind of ["current", "stale", "unresolved", "retired"])
      check(
        parent,
        `Include ${kind} links`,
        includeStates.has(kind),
        (value) => {
          value ? includeStates.add(kind) : includeStates.delete(kind);
          pages.connected = 0;
          render();
        },
      );
    if (!connectedStart) return;
    const view = graphConnected(state(), connectedStart, [...includeStates]);
    parent.append(
      paragraph(
        `${view.nodeIds.length} records, ${view.linkIds.length} links in this view.`,
      ),
    );
    if (view.truncated)
      parent.append(
        paragraph(
          "This view reached its 200-record cap. Other stored connections are omitted here and remain available in the full lists and explicit exports.",
          "pg-warning",
        ),
      );
    pager(parent, "connected", view.nodeIds, (key) => {
      const n = state().nodes.find((n) => n.id === key)!;
      const card = el("div", undefined, "pg-card");
      card.append(
        el("h4", nodeLabel(n)),
        button("Inspect connected record " + n.recordId, () => {
          nodeId = n.id;
          tab = "records";
          render();
        }),
      );
      for (const linkId of view.linkIds) {
        const l = state().links.find((l) => l.id === linkId)!;
        if (l.from === key || l.to === key)
          card.append(
            paragraph(
              `${l.kind} · ${programGraphLinkState(state(), l.id).state} · ${l.from === key ? "outgoing" : "incoming"} → ${nodeLabel(state().nodes.find((n) => n.id === (l.from === key ? l.to : l.from))!)}`,
            ),
          );
      }
      parent.append(card);
    });
  }

  function renderImport(parent: HTMLElement) {
    parent.append(
      el("h3", "Capture a chosen workspace"),
      paragraph(
        "Choose one known source. Every field and row is validated, including rows you do not track. The graph retains complete source IDs and context; only chosen records’ values are stored.",
      ),
    );
    const saved = button(
      "Preview this page’s saved workspace",
      async () => {
        const generation = ++fileEpoch;
        let raw: string | null;
        try {
          raw = localStorage.getItem(programGraphSourceKey(initialProgram));
        } catch {
          throw Error(
            "This page’s saved workspace could not be read. No source was invented or changed.",
          );
        }
        if (raw === null)
          throw Error(
            "No saved workspace was found for this page. Save work in the original workspace or choose its exported file.",
          );
        const bytes = new TextEncoder().encode(raw);
        if (bytes.byteLength > PROGRAM_GRAPH_LIMITS.sourceBytes)
          throw Error(
            "The saved source exceeds the 8,000,000-byte capture bound.",
          );
        importProgram = initialProgram;
        if (
          targetId &&
          state().sources.find((s) => s.id === targetId)?.program !==
            initialProgram
        )
          targetId = "";
        selectedBytes = bytes;
        selectedOrigin = {
          kind: "saved-key",
          key: programGraphSourceKey(initialProgram),
        };
        savedSourceRaw = raw;
        pendingSource = true;
        await previewSelected(generation);
        render();
      },
      { write: true },
    );
    parent.append(
      saved,
      paragraph(
        `This button reads only ${programGraphSourceKey(initialProgram)}, after you click. It never discovers or edits other program keys.`,
      ),
    );
    select(
      parent,
      "Program represented by the file",
      importProgram,
      PROGRAM_GRAPH_PROGRAMS.map((p) => [p, programGraphLabel(p)]),
      (value) => {
        if (!knownProgram(value)) return;
        importProgram = value;
        targetId = "";
        fileEpoch++;
        capture = null;
        touch();
        render();
      },
    );
    const input = el("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.setAttribute("aria-label", "Choose original program workspace JSON");
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const generation = ++fileEpoch;
      pendingSource = true;
      capture = null;
      touch();
      const inputEpoch = epoch;
      void action(async () => {
        const bytes = await readGraphFile(file);
        if (generation !== fileEpoch || inputEpoch !== epoch) {
          say(
            "The form changed while the file was being read. Select the file again for the current choice.",
          );
          return;
        }
        selectedBytes = bytes;
        selectedOrigin = { kind: "file", fileName: file.name };
        savedSourceRaw = null;
        await previewSelected(generation);
        render();
      });
    });
    parent.append(input);
    select(
      parent,
      "Capture as",
      targetId,
      [
        ["", "New separate source instance"],
        ...state()
          .sources.filter((s) => s.program === importProgram)
          .map(
            (s) =>
              [
                s.id,
                `Refresh ${s.alias}${s.retirement ? " (retired; resume separately)" : ""}`,
              ] as [string, string],
          ),
      ],
      (value) => {
        targetId = value;
        fileEpoch++;
        capture = null;
        touch();
        render();
      },
    );
    if (selectedBytes && selectedOrigin) {
      parent.append(
        paragraph(
          `${selectedBytes.byteLength.toLocaleString()} selected bytes · ${selectedOrigin.kind === "file" ? selectedOrigin.fileName : "explicit saved-key copy"}`,
        ),
        button(
          "Rebuild preview for this source choice",
          async () => {
            await previewSelected(++fileEpoch);
            render();
          },
          { write: true },
        ),
        button("Download selected source bytes unchanged", () =>
          download(
            "program-source-recovery.json",
            new Blob([new Uint8Array(selectedBytes!)], {
              type: "application/json",
            }),
          ),
        ),
        button("Discard selected source file and preview", () => {
          emptyTransient();
          say(
            "Selected file and preview discarded. Any saved unfinished form remains available.",
          );
          render();
        }),
      );
    }
    if (!capture) {
      if (form?.kind === "capture")
        parent.append(
          paragraph(
            "A capture form is retained, but it cannot revive file bytes or an old preview. Reselect the exact file or explicitly capture this page’s saved key, then inspect the new review.",
            "pg-warning",
          ),
        );
      return;
    }
    const p = capture,
      f = form?.kind === "capture" ? form : null;
    if (!f) return;
    parent.append(el("h4", "Complete capture preview"));
    facts(parent, [
      ["Program", programGraphLabel(p.program)],
      [
        "Target",
        p.target
          ? state().sources.find((s) => s.id === p.target!.sourceId)!.alias
          : "New separate source instance",
      ],
      ["Original byte hash", p.sourceRawHash],
      ["Whole source canonical hash", p.sourceCanonicalHash],
      ["Review hash", p.reviewHash],
      ["Complete inventory rows", String(p.rows.length)],
    ]);
    contextFacts(parent, p.program, p.context);
    if (p.missingNodeIds.length)
      parent.append(
        paragraph(
          `${p.missingNodeIds.length} tracked rows are absent from this complete copy. They will gain missing-history entries; old values remain.`,
          "pg-warning",
        ),
      );
    for (const overlap of p.overlap)
      parent.append(
        paragraph(
          `${overlap.count} IDs overlap with ${state().sources.find((s) => s.id === overlap.sourceId)?.alias}. A new source remains a separate instance.`,
          "pg-warning",
        ),
      );
    let indexes: number[];
    try {
      indexes = graphRawJson(f.fields.selectedIndexes, graphIndexes);
    } catch {
      parent.append(
        paragraph(
          "Selected indexes need raw repair. No selections were silently replaced.",
          "pg-warning",
        ),
      );
      return;
    }
    const selected = new Set(indexes);
    pager(parent, "capture", p.rows, (row) => {
      const card = el("div", undefined, "pg-card");
      card.append(
        el("h4", `${row.title} · ${row.collection}/${row.recordId}`),
        paragraph(
          `${row.change}${row.trackedNodeId ? " · already tracked; refreshed regardless of checkbox selection" : ""}`,
        ),
      );
      if (row.trackedNodeId)
        card.append(paragraph("Always refresh this tracked record."));
      else
        check(
          card,
          `Track row ${row.index + 1}: ${row.title}`,
          selected.has(row.index),
          (value) => {
            value ? selected.add(row.index) : selected.delete(row.index);
            f.fields.selectedIndexes = json(
              [...selected].sort((a, b) => a - b),
            );
            touch();
          },
        );
      parent.append(card);
    });
    if (!p.target)
      field(
        parent,
        "Alias for this new source copy",
        f.fields.alias ?? "",
        (v) => (f.fields.alias = v),
        { max: 160 },
      );
    check(
      parent,
      "I reviewed the complete source context and inventory, including missing rows. This is the complete chosen copy, not a filtered export.",
      f.fields.completeCopyAcknowledged === "true",
      (v) => {
        f.fields.completeCopyAcknowledged = String(v);
        touch();
      },
    );
    if (!p.target && p.overlap.length)
      check(
        parent,
        "I intend a separate copy even though source IDs overlap another instance.",
        f.fields.separateCopyAcknowledged === "true",
        (v) => {
          f.fields.separateCopyAcknowledged = String(v);
          touch();
        },
      );
    if (
      p.target &&
      state().sources.find((s) => s.id === p.target!.sourceId)?.retirement
    )
      check(
        parent,
        "Resume this retired source using this new complete capture.",
        f.fields.resumeRetired === "true",
        (v) => {
          f.fields.resumeRetired = String(v);
          touch();
        },
      );
    parent.append(
      button(
        "Commit reviewed capture",
        async () => {
          if (capture !== p)
            throw Error(
              "This preview is no longer current. Rebuild and review it.",
            );
          if (f.fields.completeCopyAcknowledged !== "true")
            throw Error("Review and acknowledge the complete chosen copy.");
          const selection: CaptureSelection = {
            selectedIndexes: graphRawJson(
              f.fields.selectedIndexes,
              graphIndexes,
            ),
            alias: p.target ? null : f.fields.alias,
            completeCopyAcknowledged: true,
            separateCopyAcknowledged:
              f.fields.separateCopyAcknowledged === "true",
            resumeRetired: f.fields.resumeRetired === "true",
          };
          const version = epoch,
            result = await mutate({
              kind: "source.capture",
              preview: p,
              selection,
            });
          if (!result.noOp && epoch === version) {
            emptyTransient();
            if (form?.kind === "capture")
              say(
                `${result.result.unsaved ? "The capture exists only in memory." : "Capture saved."} An older or unmatched capture form remains available; discard it explicitly when no longer needed.`,
              );
          }
          render();
        },
        { write: true, primary: true },
      ),
    );
  }
  async function previewSelected(generation: number) {
    const before = store.snapshot(),
      inputEpoch = epoch;
    if (!before.state || !before.hash || !selectedBytes || !selectedOrigin)
      throw Error("Choose readable source bytes first.");
    const target = targetId
      ? before.state.sources.find((s) => s.id === targetId)
      : null;
    if (targetId && !target) throw Error("The chosen source no longer exists.");
    const targetCapture = target
      ? before.state.captures.find((c) => c.id === target.currentCaptureId)!
      : null;
    const p = await previewProgramCapture(
      before.state,
      {
        bytes: new Uint8Array(selectedBytes),
        program: importProgram,
        origin: clone(selectedOrigin),
        target:
          target && targetCapture
            ? {
                sourceId: target.id,
                expectedCaptureId: targetCapture.id,
                expectedCaptureHash: targetCapture.hash,
              }
            : null,
      },
      before.hash,
    );
    if (
      generation !== fileEpoch ||
      inputEpoch !== epoch ||
      store.snapshot().hash !== before.hash
    )
      throw Error(
        "The file, form or graph changed during preview. Your previous form is retained; preview the current choice again.",
      );
    const retained =
      form?.kind === "capture" &&
      form.targetId === (p.target?.sourceId ?? null) &&
      form.binding.sourceRawHash === p.sourceRawHash &&
      form.binding.program === p.program &&
      (form.binding.targetSourceId ?? "") === (p.target?.sourceId ?? "")
        ? clone(form.fields)
        : null;
    const command: GraphCommand = {
      kind: "source.capture",
      preview: p,
      selection: {
        selectedIndexes: p.rows
          .filter((r) => !r.trackedNodeId)
          .map((r) => r.index),
        alias: target ? null : `${programGraphLabel(p.program)} copy`,
        completeCopyAcknowledged: true,
        separateCopyAcknowledged: false,
        resumeRetired: false,
      },
    };
    const next = clone(programGraphCommandForm(command)!);
    next.fields.completeCopyAcknowledged = "false";
    if (retained) {
      next.fields = {
        ...retained,
        completeCopyAcknowledged: "false",
        separateCopyAcknowledged: "false",
        resumeRetired: "false",
      };
    }
    if (form && form.kind !== "capture") {
      capture = null;
      throw Error(
        "An unfinished non-capture form is still open. Save or download it, then explicitly discard it before reviewing a new source.",
      );
    }
    if (form?.kind === "capture" && !retained) {
      capture = null;
      throw Error(
        "This file/program/target differs from the retained capture form. Download or discard that form explicitly before starting a different capture.",
      );
    }
    form = next;
    capture = p;
    pendingSource = true;
    tab = "import";
    epoch++;
    dirty = true;
    say(
      "Review the exact context, complete inventory and chosen rows before committing.",
    );
  }

  async function exportState(): Promise<ProgramGraphState> {
    const current = clone(state());
    current.draft = draft();
    return current;
  }
  function renderExports(parent: HTMLElement) {
    parent.append(el("h3", "Back up or share a selected packet"));
    parent.append(
      paragraph(
        "Complete JSON backup includes ALL stored graph records, histories, retired/missing records, context, complete source ID inventories and unfinished raw form. It may contain private text from work you did not select below. Original file bytes and unselected source values are not embedded.",
        "pg-warning",
      ),
    );
    parent.append(
      button("Download complete graph JSON backup", async () => {
        const version = epoch;
        const text = await makeProgramGraphBackup(await exportState(), at());
        if (version !== epoch)
          throw Error(
            "The unfinished form changed while preparing backup. Try again.",
          );
        download(
          "charitology-program-graph-backup.json",
          text,
          "application/json",
        );
        say(
          "A download of the complete validated graph backup was requested. It is incompatible with the original partner-workspace import.",
        );
      }),
    );
    parent.append(
      button("Download saved canonical graph without newer form", async () => {
        const before = store.snapshot();
        if (!before.state)
          throw Error("No valid canonical graph is available.");
        const text = await makeProgramGraphBackup(before.state, at());
        download(
          "charitology-program-graph-canonical-backup.json",
          text,
          "application/json",
        );
        say(
          "A download of the canonical graph was requested. Any newer unfinished form is excluded; download its plain raw recovery separately.",
        );
      }),
    );
    parent.append(
      el("h4", "Selected CSV and Markdown packet"),
      paragraph(
        "Choose record and link IDs deliberately. Selected links include their endpoints, exact reviewed historical values and captured context, which may contain additional user-entered text. Unrelated graph records, full inventories and raw forms are excluded. A packet cannot restore the graph.",
      ),
    );
    pager(parent, "exportnodes", state().nodes, (n) =>
      check(
        parent,
        `Include record: ${nodeLabel(n)}`,
        selectedNodes.has(n.id),
        (value) => {
          value ? selectedNodes.add(n.id) : selectedNodes.delete(n.id);
          packet = null;
          packetEpoch++;
          say(
            "Packet selection changed. Review the current selection before downloading.",
          );
          render();
        },
      ),
    );
    pager(parent, "exportlinks", state().links, (l) =>
      check(
        parent,
        `Include link: ${l.kind} ${l.id}`,
        selectedLinks.has(l.id),
        (value) => {
          value ? selectedLinks.add(l.id) : selectedLinks.delete(l.id);
          packet = null;
          packetEpoch++;
          say(
            "Packet selection changed. Review the current selection before downloading.",
          );
          render();
        },
      ),
    );
    parent.append(
      button("Review selected packet", async () => {
        const generation = ++packetEpoch,
          before = store.snapshot();
        if (!before.state) throw Error("No valid graph is available.");
        const result = await programGraphPacket(before.state, {
          nodeIds: [...selectedNodes].sort(),
          linkIds: [...selectedLinks].sort(),
        });
        if (generation !== packetEpoch || store.snapshot().hash !== before.hash)
          throw Error(
            "Packet selection or graph changed. Review the current selection again.",
          );
        packet = result;
        packetHash = before.hash;
        render();
      }),
    );
    if (packet && packetHash === snap.hash) {
      facts(parent, [["Selected closure hash", packet.selectionHash]]);
      for (const notice of packet.omissions) parent.append(paragraph(notice));
      parent.append(
        button("Download selected CSV packet", () => {
          if (!packet || packetHash !== store.snapshot().hash)
            throw Error("Review this packet again.");
          download(
            "charitology-program-graph-selected.csv",
            packet!.csv,
            "text/csv",
          );
        }),
        button("Download selected Markdown packet", () => {
          if (!packet || packetHash !== store.snapshot().hash)
            throw Error("Review this packet again.");
          download(
            "charitology-program-graph-selected.md",
            packet!.markdown,
            "text/markdown",
          );
        }),
      );
    }
  }
  function renderRecovery(parent: HTMLElement) {
    parent.append(
      el("h3", "Recovery"),
      paragraph(
        "Preserve your current tab and the saved bytes separately before replacing either. A preview binds the exact current memory and saved copy; another tab’s change invalidates it.",
      ),
    );
    parent.append(
      button("Download protected saved bytes unchanged", () => {
        const raw = store.rawSavedCopy();
        if (raw === undefined)
          throw Error(
            "The saved bytes could not be read. No replacement was attempted.",
          );
        if (raw === null) throw Error("There is no saved graph copy.");
        const recovery = rawStorageRecoveryDownload(raw);
        download(
          `charitology-program-graph-saved-recovery.${recovery.wrapped ? "json" : "txt"}`,
          recovery.text,
        );
        say(
          recovery.wrapped
            ? "The protected UTF-16 text was JSON-wrapped to preserve every code unit. This recovery file is not a graph backup."
            : "A raw-copy download was requested. These bytes are not claimed to be a validated backup.",
        );
      }),
    );
    const observedCopy = store.snapshot().observedRaw;
    if (
      typeof observedCopy === "string" &&
      observedCopy !== store.rawSavedCopy()
    ) {
      parent.append(
        paragraph(
          "The last observed saved text differs from the protected original. Preserve both before replacing either.",
        ),
        button("Download last observed saved text", () => {
          const recovery = rawStorageRecoveryDownload(observedCopy);
          download(
            `charitology-program-graph-last-observed.${recovery.wrapped ? "json" : "txt"}`,
            recovery.text,
          );
          say(
            "A last-observed text recovery download was requested. The protected original remains separately available; no replacement was made.",
          );
        }),
      );
    }
    const previewRestore = async () => {
      const version = epoch;
      const token = await store.previewRestore(recoveryBytes!);
      if (version !== epoch)
        throw Error(
          "Your form changed while previewing replacement. Review it again.",
        );
      restore = token;
      recoveryReviewEpoch = version;
      clear = null;
      render();
    };
    const input = el("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.setAttribute("aria-label", "Choose graph backup to restore");
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const version = ++fileEpoch,
        inputEpoch = epoch;
      void action(async () => {
        const bytes = await readGraphFile(
          file,
          PROGRAM_GRAPH_LIMITS.backupBytes,
        );
        if (version !== fileEpoch) return;
        recoveryBytes = bytes;
        if (inputEpoch !== epoch)
          throw Error(
            "Your form changed while reading the backup. Preview the selected bytes explicitly again.",
          );
        await previewRestore();
      });
    });
    parent.append(input);
    if (recoveryBytes)
      parent.append(
        button("Download selected restore bytes unchanged", () =>
          download(
            "charitology-program-graph-restore-recovery.json",
            new Blob([new Uint8Array(recoveryBytes!)]),
          ),
        ),
        button("Preview selected restore again", previewRestore, {
          recover: true,
        }),
      );
    if (restore) {
      const token = restore;
      const c = programGraphCounts(token.state);
      parent.append(
        paragraph(
          `Validated replacement preview: ${c.sources} sources, ${c.nodes} records and ${c.links} links. Applying it replaces this graph, including unfinished work. No original workspace key is changed.`,
          "pg-warning",
        ),
        button(
          "Replace graph with this reviewed backup",
          async () => {
            if (recoveryReviewEpoch !== epoch)
              throw Error(
                "Unfinished fields changed after replacement review. Preview the backup again.",
              );
            const version = epoch,
              result = await store.restore(token);
            if (version === epoch) {
              emptyTransient();
              snap = result;
              form = clone(result.state?.draft.form ?? null);
              tab = result.state?.draft.tab ?? "recovery";
              sourceId = result.state?.draft.sourceId ?? null;
              nodeId = result.state?.draft.nodeId ?? null;
              dirty = false;
            } else snap = result;
            say(
              result.unsaved
                ? "The replacement is valid only in memory; the saved copy is unchanged. Download or retry saving."
                : "The reviewed graph backup was restored.",
            );
            render();
          },
          { recover: true },
        ),
      );
    }
    parent.append(
      button(
        "Preview clearing this graph",
        async () => {
          const version = epoch,
            token = await store.previewClear(
              blankProgramGraphState(id(), at()),
            );
          if (version !== epoch)
            throw Error(
              "Your form changed while previewing clear. Review it again.",
            );
          clear = token;
          recoveryReviewEpoch = version;
          restore = null;
          render();
        },
        { recover: true },
      ),
    );
    if (clear) {
      const token = clear;
      parent.append(
        paragraph(
          "This clears the saved companion graph only. Captured records, links and histories are removed from this graph. Back it up first. Original workspaces are not changed.",
          "pg-warning",
        ),
        button(
          "Confirm clear of companion graph",
          async () => {
            if (recoveryReviewEpoch !== epoch)
              throw Error(
                "Unfinished fields changed after the clear review. Review clear again.",
              );
            const version = epoch,
              result = await store.clear(token);
            snap = result;
            if (version === epoch) {
              emptyTransient();
              form = null;
              dirty = false;
              sourceId = null;
              nodeId = null;
            }
            say(
              result.unsaved
                ? "The graph is cleared only in memory. Saved bytes could not be removed; preserve this state and retry."
                : "The companion graph was cleared. Original workspace keys were not changed.",
            );
            render();
          },
          { recover: true },
        ),
      );
    }
    const undo = button(
      "Undo last graph change",
      async () => {
        const version = epoch;
        const apply = async () => {
          if (version !== epoch)
            throw Error(
              "Unfinished work changed after undo review. Review undo again.",
            );
          const result = await store.undo();
          snap = result;
          if (version === epoch) {
            emptyTransient();
            form = clone(result.state?.draft.form ?? null);
            dirty = false;
            tab = result.state?.draft.tab ?? "recovery";
            sourceId = result.state?.draft.sourceId ?? null;
            nodeId = result.state?.draft.nodeId ?? null;
          }
          pendingReplace = null;
          say(
            result.unsaved
              ? "Undo is valid only in memory; the saved copy is unchanged."
              : "Last graph change undone. Any capture file must be reselected and reviewed.",
          );
          render();
        };
        if (hasWork()) {
          pendingReplace = apply;
          render();
        } else await apply();
      },
      { write: true },
    );
    undo.dataset.fixedDisabled = String(!snap.canUndo);
    parent.append(undo);
    if (snap.canRetryPersist)
      parent.append(
        button(
          "Retry saving current valid memory",
          async () => {
            snap = await store.retryPersist();
            say(
              snap.unsaved
                ? "Saving still failed. Valid current memory remains available for backup."
                : "Current memory was saved without replaying a command.",
            );
            render();
          },
          { write: true },
        ),
      );
    parent.append(
      button("Review reload from browser copy", () => {
        const reviewEpoch = epoch;
        pendingReplace = async () => {
          if (reviewEpoch !== epoch)
            throw Error(
              "Unfinished work changed after reload review. Review reload again.",
            );
          pendingReplace = null;
          const version = epoch,
            result = await store.reload({ discardUnsaved: true });
          snap = result;
          if (
            result.code === "ready" ||
            (result.code === "unsupported" && result.state)
          ) {
            if (version === epoch) {
              emptyTransient();
              form = clone(result.state?.draft.form ?? null);
              dirty = false;
              tab = result.state?.draft.tab ?? "recovery";
              sourceId = result.state?.draft.sourceId ?? null;
              nodeId = result.state?.draft.nodeId ?? null;
            }
            say(
              "The readable browser copy was reloaded and validated. Any file must be reselected before capture.",
            );
          } else
            say(
              result.message ||
                "The saved copy could not be validated. Previous valid memory and unfinished fields remain available; no replacement was made.",
              true,
            );
          render();
        };
        render();
      }),
    );
  }
  window.addEventListener("beforeunload", (event) => {
    if (hasWork()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === PROGRAM_GRAPH_STORAGE_KEY || event.key === null) {
      snap = store.noticeExternalChange();
      capture = null;
      packet = null;
      restore = null;
      clear = null;
      fileEpoch++;
      packetEpoch++;
      say(
        "Another tab changed the graph. Your unfinished form and selected bytes are retained. Back them up before explicitly reloading or replacing the saved copy.",
        true,
      );
      render();
    }
  });
  render();
}
