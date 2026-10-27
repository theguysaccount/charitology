const part = (value) => encodeURIComponent(String(value));
const staffRoles = new Set([
  "owner",
  "admin",
  "program_lead",
  "grants_lead",
  "finance_reviewer",
]);
const hex = /^[a-f0-9]{64}$/;

export function reportMoney(value, currency) {
  const code = value?.currency || currency?.code;
  const precision = value?.precision ?? currency?.precision;
  if (!code || !Number.isInteger(precision) || precision < 0 || precision > 3)
    return "Unknown amount / currency";
  if (value?.minor === null || value?.minor === undefined)
    return `Unknown (${code})`;
  if (!Number.isSafeInteger(value.minor))
    return "Invalid amount — review required";
  const negative = value.minor < 0;
  const minor = BigInt(value.minor) * (negative ? -1n : 1n);
  const scale = 10n ** BigInt(precision);
  const whole = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(minor / scale);
  return `${code} ${negative ? "−" : ""}${whole}${precision ? `.${String(minor % scale).padStart(precision, "0")}` : ""}`;
}

export function checkedGrantReport(
  report,
  { board = false, frozen = false } = {},
) {
  if (
    !report ||
    report.kind !== (board ? "grant-period-board" : "grant-period") ||
    report.methodVersion !== "grant-report-v1" ||
    report.schemaVersion !== 1 ||
    !report.sections?.finances ||
    !report.sections?.gaps ||
    !Array.isArray(report.sections.observations) ||
    !Array.isArray(report.sourceRevisions) ||
    !Array.isArray(report.trace) ||
    report.sourceRevisions.length > 250 ||
    report.sections.observations.length > 100 ||
    ["receipts", "spending"].some(
      (key) => (report.sections.finances[key]?.items?.length || 0) > 100,
    ) ||
    (frozen && (!report.id || !hex.test(report.checksum || "")))
  )
    throw new Error(
      "The grant report response could not be verified. Refresh the saved report.",
    );
  // Never accept a full staff response as a board download or a fallback reader.
  if (new TextEncoder().encode(JSON.stringify(report)).length > 2 * 1024 * 1024)
    throw new Error(
      "The report exceeds the 2 MiB reading bound. Nothing was displayed.",
    );
  if (board) {
    const privateKeys = new Set([
      "modules",
      "boardProjection",
      "authorization",
      "command",
      "createdBy",
      "actorId",
      "ownerId",
      "contactId",
      "externalId",
      "externalSystem",
      "receiptReference",
      "submissionReference",
      "sourceUrl",
      "approval",
      "application",
    ]);
    const privateField = (value) =>
      value &&
      typeof value === "object" &&
      Object.entries(value).some(
        ([key, child]) => privateKeys.has(key) || privateField(child),
      );
    if (privateField(report))
      throw new Error(
        "The board report response includes unavailable fields. Nothing was displayed.",
      );
  }
  return report;
}

export function freezeIntent(makeKey = () => crypto.randomUUID()) {
  let pending = null;
  return {
    body(preview) {
      const identity = JSON.stringify({
        previewId: preview.previewId,
        reviewHash: preview.reviewHash,
      });
      if (pending && pending.identity !== identity)
        throw new Error(
          "Retry the earlier freeze response before changing this preview.",
        );
      if (!pending)
        pending = {
          identity,
          body: {
            previewId: preview.previewId,
            reviewHash: preview.reviewHash,
            idempotencyKey: makeKey(),
          },
        };
      return { ...pending.body };
    },
    rejected(status) {
      if ([400, 401, 403, 404, 409, 413, 422, 429].includes(status))
        pending = null;
    },
    clear() {
      pending = null;
    },
  };
}

function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (["disabled", "required", "selected", "checked"].includes(key))
      element[key] = Boolean(value);
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      element.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return element;
}
function button(text, action, attrs = {}) {
  return node(
    "button",
    { type: "button", class: "button subtle", onclick: action, ...attrs },
    text,
  );
}
function say(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}
const output = (message = "") =>
  node("p", { class: "form-status", role: "status" }, message);
const unknown = (value) =>
  value === null || value === undefined || value === ""
    ? "Not recorded"
    : String(value);
const human = (value) => unknown(value).replaceAll("-", " ");
const dates = (period) =>
  `${unknown(period?.startDate)} through ${unknown(period?.endDate)}`;
function facts(entries) {
  return node(
    "dl",
    { class: "grant-report-facts" },
    entries.map(([label, value]) =>
      node("div", {}, node("dt", {}, label), node("dd", {}, unknown(value))),
    ),
  );
}
function sourceText(source) {
  return `${unknown(source?.moduleId)} / ${unknown(source?.id)} · revision ${unknown(source?.revision)}`;
}
function sourceLink(url) {
  try {
    const value = new URL(url);
    if (value.protocol !== "https:" || value.username || value.password)
      return null;
    return node(
      "a",
      { href: value.href, target: "_blank", rel: "noopener noreferrer" },
      "Open source",
    );
  } catch {
    return null;
  }
}
function financialSection(title, summary, currency, board) {
  const section = node(
    "section",
    { class: "grant-report-financial" },
    node("h4", {}, title),
  );
  if (!summary)
    return (
      section.append(node("p", {}, "No financial summary was returned.")),
      section
    );
  section.append(
    node(
      "p",
      { class: "grant-report-missingness" },
      summary.notice || "Coverage describes the selected references only.",
    ),
    facts([
      [
        "Total among selected references",
        summary.coverage === "empty"
          ? "No references selected"
          : reportMoney({ minor: summary.totalMinor }, currency),
      ],
      [
        "Known subtotal",
        summary.coverage === "empty"
          ? "Not applicable"
          : reportMoney({ minor: summary.knownSubtotalMinor }, currency),
      ],
      ["Known references", summary.knownCount],
      ["Unknown amounts", summary.unknownCount],
      ["Selected references", summary.selectedCount],
      ["Selected-source coverage", human(summary.coverage)],
    ]),
  );
  const items = Array.isArray(summary.items) ? summary.items : [];
  if (items.length)
    section.append(
      node(
        "details",
        {},
        node("summary", {}, `Inspect ${items.length} financial references`),
        node(
          "div",
          { class: "grant-report-rows" },
          items.map((item) =>
            node(
              "article",
              { class: "grant-report-row" },
              node("p", { class: "fine code" }, sourceText(item.source)),
              facts([
                ["Date", item.date],
                ["Amount", reportMoney(item.amount, currency)],
              ]),
              !board
                ? facts([
                    ["External system", item.externalSystem],
                    ["External record", item.externalId],
                    ["Receipt reference", item.receiptReference],
                  ])
                : null,
            ),
          ),
        ),
      ),
    );
  return section;
}

export function renderGrantReport(
  report,
  { board = false, stage = "Frozen report" } = {},
) {
  checkedGrantReport(report, { board });
  const { sections, currency } = report;
  const context = sections.grantContext || {};
  const gaps = sections.gaps;
  const document = node(
    "article",
    { class: "grant-report-document", tabindex: "-1" },
    node("p", { class: "eyebrow" }, stage),
    node("h3", {}, report.title || "Grant period report"),
    facts([
      ["Program", report.program?.title],
      ["Period (inclusive dates)", dates(report.period)],
      ["Method", report.methodVersion],
      ["Frozen at", report.createdAt],
    ]),
    node(
      "p",
      { class: "grant-report-boundary" },
      "This report records approved inputs. It does not certify accounts, reconcile a bank, establish causal impact or publish the report. Awards and commitments are separate from cash received.",
    ),
    sections.summary
      ? node(
          "section",
          {},
          node("h4", {}, "Approved report narrative"),
          node("p", {}, sections.summary),
        )
      : null,
    node(
      "section",
      { class: "grant-report-gaps" },
      node("h4", {}, "Missing data and coverage"),
      node(
        "p",
        {},
        gaps.declared ||
          "No additional gaps were described in the manifest. This is not a claim of complete evidence.",
      ),
      facts([
        ["Selected receipt records", gaps.selection?.receiptCount],
        ["Selected finance records", gaps.selection?.financeCount],
        ["Selected outcome records", gaps.selection?.outcomeCount],
      ]),
      node(
        "ul",
        {},
        (gaps.notices || []).map((notice) => node("li", {}, notice)),
      ),
    ),
    node(
      "section",
      {},
      node("h4", {}, "Award and agreement context"),
      facts([
        [
          "Award amount (agreement context)",
          reportMoney(context.awarded, currency),
        ],
        [
          "Planned commitments (agreement context)",
          reportMoney(context.committed, currency),
        ],
        [
          "Externally recorded spending (agreement context)",
          reportMoney(context.recordedAgreementSpending, currency),
        ],
        ["Restriction", human(context.restriction?.status)],
        ["Approved restriction code", context.restriction?.code],
        ["Permitted use", context.restriction?.purpose],
      ]),
      !board && context.application
        ? node(
            "details",
            {},
            node("summary", {}, "Application and submitted version"),
            facts([
              [
                "Current application",
                sourceText({
                  ...context.application.current,
                  moduleId: "grant-seeking",
                }),
              ],
              ["Current state", human(context.application.current?.status)],
              [
                "Submission reference",
                context.application.submitted?.submissionReference,
              ],
              [
                "Historical submitted revision",
                context.application.submitted?.revision,
              ],
              [
                "Submission recorded at",
                context.application.submitted?.createdAt,
              ],
              [
                "Submitted data SHA-256",
                context.application.submitted?.dataHash,
              ],
            ]),
            node(
              "p",
              { class: "fine" },
              "The submitted artifact is historical; its revision can differ from the current approved application.",
            ),
          )
        : null,
    ),
    node(
      "div",
      { class: "grant-report-finances" },
      financialSection(
        "Cash received in this period",
        sections.finances.receipts,
        currency,
        board,
      ),
      financialSection(
        "Referenced cash spending in this period",
        sections.finances.spending,
        currency,
        board,
      ),
    ),
  );
  if (sections.finances.planning?.length)
    document.append(
      node(
        "section",
        {},
        node("h4", {}, "Planning references — not added to cash totals"),
        node(
          "div",
          { class: "grant-report-rows" },
          sections.finances.planning.map((row) =>
            node(
              "article",
              { class: "grant-report-row" },
              node("p", { class: "fine code" }, sourceText(row.source)),
              facts([
                ["Record type", human(row.kind)],
                ["Period", dates(row.period)],
                ["Planned", reportMoney(row.planned, currency)],
                ["External actual", reportMoney(row.actual, currency)],
                ["Actual classification", human(row.actualClass)],
              ]),
            ),
          ),
        ),
      ),
    );
  document.append(
    node(
      "section",
      {},
      node("h4", {}, "Outcome observations"),
      node(
        "p",
        { class: "fine" },
        "Observations are shown individually. Values, populations and denominators are not pooled, and no causal effect is inferred.",
      ),
      sections.observations.length
        ? node(
            "div",
            { class: "grant-report-rows" },
            sections.observations.map((row) =>
              node(
                "article",
                { class: "grant-report-row" },
                node(
                  "h5",
                  {},
                  row.title || row.indicator?.title || "Observation",
                ),
                node("p", { class: "fine code" }, sourceText(row.source)),
                facts([
                  ["Indicator", row.indicator?.title],
                  [
                    "Observed value",
                    row.value === null || row.value === undefined
                      ? "Unknown"
                      : row.value,
                  ],
                  ["Unit", row.unit],
                  [
                    "Denominator",
                    row.denominator === null || row.denominator === undefined
                      ? "Unknown"
                      : row.denominator,
                  ],
                  ["Period", dates(row.period)],
                  ["Geography", row.geography],
                  ["Method", human(row.method)],
                  ["Evidence label", human(row.evidence)],
                ]),
                node(
                  "p",
                  { class: "fine" },
                  row.limitations || "No additional limitations recorded.",
                ),
                !board ? sourceLink(row.sourceUrl) : null,
              ),
            ),
          )
        : node(
            "p",
            {},
            "No outcome observations selected. This does not mean no outcomes occurred.",
          ),
    ),
  );
  if (report.supersedes)
    document.append(
      node(
        "section",
        {},
        node("h4", {}, "Correction of an earlier edition"),
        facts([
          ["Earlier report", report.supersedes.id],
          ["Earlier checksum", report.supersedes.checksum],
          ["Reason", report.supersedes.reason],
        ]),
      ),
    );
  document.append(
    node(
      "section",
      { class: "grant-report-provenance" },
      node("h4", {}, "Source versions and traceability"),
      node(
        "p",
        { class: "fine" },
        "A checksum detects changed content; it is not certification by an accountant or independent researcher.",
      ),
      report.checksum
        ? facts([
            ["Report ID", report.id],
            ["Report SHA-256", report.checksum],
          ])
        : null,
      node(
        "div",
        { class: "grant-report-rows" },
        report.sourceRevisions.map((source) =>
          node(
            "article",
            { class: "grant-report-row" },
            node("p", { class: "fine code" }, sourceText(source)),
            facts([
              ["Data SHA-256", source.dataHash],
              ...(!board
                ? [
                    ["Approval revision", source.approval?.revision],
                    ["Approval recorded at", source.approval?.at],
                  ]
                : []),
            ]),
          ),
        ),
      ),
      node(
        "details",
        { class: "grant-report-trace" },
        node("summary", {}, "Inspect field-to-source trace"),
        node(
          "div",
          { class: "grant-report-rows" },
          report.trace.map((entry) =>
            node(
              "article",
              { class: "grant-report-row" },
              node("h5", { class: "code" }, entry.outputPath),
              node("p", { class: "fine" }, human(entry.operation)),
              node(
                "p",
                { class: "fine" },
                typeof entry.missingness === "string"
                  ? entry.missingness
                  : JSON.stringify(entry.missingness ?? null),
              ),
              node(
                "ul",
                {},
                (entry.sources || []).map((source) =>
                  node(
                    "li",
                    { class: "fine code" },
                    `${sourceText(source)} · ${(source.fields || []).join(", ")}`,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  if (!board && report.modules?.length)
    document.append(
      node(
        "details",
        { class: "grant-report-source-raw" },
        node("summary", {}, "Inspect frozen source fields (staff only)"),
        report.modules.map((module) =>
          node(
            "section",
            {},
            node("h4", {}, module.title || module.id),
            (module.records || []).map((record) =>
              node(
                "details",
                {},
                node(
                  "summary",
                  {},
                  sourceText({ ...record, moduleId: module.id }),
                ),
                node("pre", {}, JSON.stringify(record.data, null, 2)),
              ),
            ),
          ),
        ),
      ),
    );
  return document;
}

function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const name =
    (report.title || "grant-report")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 100) || "grant-report";
  const link = node("a", { href: url, download: `${name}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function printReport(report, board) {
  const surface = node(
    "div",
    { class: "grant-report-print-surface" },
    renderGrantReport(report, { board }),
  );
  for (const detail of surface.querySelectorAll("details"))
    detail.setAttribute("open", "");
  const cleanup = () => {
    surface.remove();
    document.body.classList.remove("grant-report-printing");
  };
  document.body.append(surface);
  document.body.classList.add("grant-report-printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}

export async function createGrantReportWorkspace({
  org,
  role,
  request,
  api,
  isCurrent = () => true,
  onSaved = () => {},
  onDirty = () => {},
  openManifest,
}) {
  const staff = staffRoles.has(role);
  const board = role === "board_reader";
  const base = `/api/orgs/${part(org)}/grant-reports`;
  const intent = freezeIntent();
  const state = {
    generation: 0,
    disposed: false,
    busy: false,
    suspended: false,
    manifests: [],
    selected: null,
    prepared: null,
    preview: null,
    pending: false,
    reports: [],
    cursor: null,
    loadedCursors: new Set(),
    currentReportId: null,
  };
  let printCleanup = null;
  let expiryTimer = null;
  function clearExpiry() {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  const root = node("section", {
    class: "grant-report-workspace panel",
    "aria-labelledby": "grant-report-heading",
  });
  const notice = output("Loading available grant reports…");
  const picker = node("select", { id: "grant-report-manifest" });
  const selectionStatus = node("div", { class: "grant-report-selection" });
  const stage = node("div", { class: "grant-report-stage" });
  const list = node("div", { class: "grant-report-list stack" });
  const reader = node("div", { class: "grant-report-reader" });
  const readStatus = output();
  const listStatus = output();
  const refreshButton = button("Refresh grant reports", () => refresh());
  const moreButton = button("Load more reports", () => loadMore());
  const prepareButton = button("Prepare sources", () => prepare());
  const previewButton = button("Preview approved report", () => preview());
  const editButton = button("Open selected manifest", () => {
    if (!alive() || state.busy || state.pending || !state.selected) return;
    openManifest?.(state.selected.id);
  });
  const controls = [
    picker,
    refreshButton,
    moreButton,
    prepareButton,
    previewButton,
    editButton,
  ];
  const alive = () => !state.disposed && isCurrent();
  function guard(generation) {
    if (!alive()) {
      dispose();
      return false;
    }
    return generation === state.generation && !state.suspended;
  }
  function dirty(value) {
    onDirty(Boolean(value));
  }
  function clearPrivate(message) {
    clearExpiry();
    printCleanup?.();
    printCleanup = null;
    state.generation++;
    state.manifests = [];
    state.selected = null;
    state.prepared = null;
    state.preview = null;
    state.reports = [];
    state.cursor = null;
    state.loadedCursors.clear();
    state.currentReportId = null;
    picker.replaceChildren(
      node("option", { value: "" }, "Select a saved grant-report manifest"),
    );
    selectionStatus.replaceChildren();
    stage.replaceChildren();
    list.replaceChildren();
    reader.replaceChildren();
    say(readStatus, "");
    say(listStatus, "");
    say(notice, message);
    dirty(state.pending);
    sync();
  }
  function dispose() {
    if (state.disposed) return;
    clearPrivate("Grant-report view closed.");
    state.disposed = true;
    state.pending = false;
    intent.clear();
    dirty(false);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    document.removeEventListener("visibilitychange", visibility);
    root.replaceChildren();
  }
  function suspend() {
    if (!alive()) return dispose();
    state.suspended = true;
    clearPrivate(
      "Private report details are hidden until access is checked again.",
    );
  }
  function resume() {
    if (!alive()) return dispose();
    if (document.visibilityState === "hidden") return;
    if (!state.busy) void refresh();
  }
  function visibility() {
    if (document.visibilityState === "hidden") suspend();
    else resume();
  }
  function sync() {
    const disabled = state.busy || state.suspended || !alive();
    for (const control of root.querySelectorAll("button,input,select"))
      control.disabled = disabled;
    for (const control of controls) control.disabled = disabled;
    picker.disabled = disabled || state.pending;
    editButton.disabled = disabled || state.pending || !state.selected;
    prepareButton.disabled = disabled || state.pending || !state.selected;
    previewButton.disabled =
      disabled ||
      state.pending ||
      !state.selected ||
      !currentApproval(state.selected);
    moreButton.hidden = !state.cursor;
    const freezeButton = root.querySelector("#grant-report-freeze-submit");
    if (freezeButton)
      freezeButton.disabled = disabled || !state.preview || state.pending;
    const acknowledgement = root.querySelector("#grant-report-freeze-ack");
    if (acknowledgement)
      acknowledgement.disabled = disabled || !state.preview || state.pending;
    root.setAttribute("aria-busy", String(state.busy));
  }
  function currentApproval(record) {
    return Boolean(
      record?.approval?.status === "approved" &&
      record.approval.revision === record.revision &&
      ["approved", "frozen", "issued"].includes(record.status),
    );
  }
  function updateManifestOption(record) {
    if (!record?.id) return;
    state.manifests = state.manifests.map((saved) =>
      saved.id === record.id ? record : saved,
    );
    for (const option of picker.querySelectorAll("option"))
      if (option.value === record.id)
        option.textContent = `${record.data.title || record.id} · revision ${record.revision} · ${human(record.status)}`;
  }
  function errorMessage(error) {
    const issues = (error.issues || []).map(
      (issue) =>
        `${issue.field || issue.path || "Source"}: ${issue.message || "Review this input."}`,
    );
    return [
      error.message || "The operation could not be completed.",
      ...issues,
    ].join(" ");
  }
  function failure(error, target) {
    if ([401, 403, 404].includes(error.status)) {
      clearPrivate(
        "This report view is unavailable. Refresh to check your current access.",
      );
      say(notice, errorMessage(error), true);
      return;
    }
    say(target, errorMessage(error), true);
  }
  async function action(target, fn, privateRead = false) {
    if (!alive() || state.busy || state.suspended) return;
    const generation = state.generation;
    state.busy = true;
    sync();
    try {
      await fn(generation);
    } catch (error) {
      if (guard(generation)) {
        if (privateRead) {
          clearPrivate(
            "Private report data is hidden because current access could not be checked.",
          );
          say(notice, errorMessage(error), true);
          if (state.pending) renderPendingFreeze();
        } else failure(error, target);
      }
    } finally {
      state.busy = false;
      if (alive()) {
        sync();
        if (state.suspended && document.visibilityState !== "hidden")
          void refresh();
      }
    }
  }
  function manifestDescription() {
    const record = state.selected;
    selectionStatus.replaceChildren();
    if (!record) return;
    selectionStatus.append(
      facts([
        ["Manifest", record.data.title],
        ["Saved revision", record.revision],
        ["Workflow state", human(record.status)],
        ["Period", dates(record.data)],
        ["Agreement", record.data.agreementId],
        [
          "Source versions",
          hex.test(record.data.sourceDigest || "")
            ? "Digest saved"
            : "Prepare and save a source digest",
        ],
        [
          "Current approval",
          currentApproval(record)
            ? "Independent record approval recorded"
            : "Fresh independent approval and approved status required before final preview",
        ],
      ]),
    );
  }
  function renderList() {
    list.replaceChildren();
    for (const report of state.reports)
      list.append(
        node(
          "article",
          { class: "snapshot" },
          node("h4", {}, report.title || "Grant report"),
          node(
            "p",
            { class: "fine" },
            `${dates(report.period)} · ${unknown(report.createdAt)} · ${human(report.audience)}`,
          ),
          node(
            "p",
            { class: "fine code" },
            `SHA-256 ${unknown(report.checksum)}`,
          ),
          button("Read report", () => readReport(report.id), {
            "data-report-id": report.id,
          }),
        ),
      );
    if (!state.reports.length)
      list.append(
        node(
          "p",
          {},
          "No frozen grant reports are available in your current scope.",
        ),
      );
    sync();
  }
  function checkPage(result) {
    if (!Array.isArray(result.reports) || result.reports.length > 20)
      throw new Error(
        "The report page could not be verified. Refresh the list.",
      );
    return result.reports;
  }
  async function refresh() {
    if (!alive() || state.busy) return;
    const selectedId = state.selected?.id || picker.value;
    const pending = state.pending;
    state.suspended = false;
    clearPrivate("Checking current access and saved grant reports…");
    const generation = state.generation;
    state.busy = true;
    sync();
    try {
      const results = await Promise.allSettled([
        request(base),
        ...(staff ? [api.records(org, "reporting")] : []),
      ]);
      if (!guard(generation)) return;
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
      const saved = results[0].value;
      state.reports = checkPage(saved);
      state.cursor = saved.nextCursor || null;
      if (staff) {
        const records = results[1].value.records;
        if (!Array.isArray(records) || records.length > 2000)
          throw new Error("The manifest list could not be verified.");
        state.manifests = records.filter(
          (record) =>
            record.moduleId === "reporting" &&
            record.data?.assemblyMethod === "grant-report-v1",
        );
        picker.replaceChildren(
          node("option", { value: "" }, "Select a saved grant-report manifest"),
          ...state.manifests.map((record) =>
            node(
              "option",
              { value: record.id },
              `${record.data.title || record.id} · revision ${record.revision} · ${human(record.status)}`,
            ),
          ),
        );
        if (state.manifests.some((record) => record.id === selectedId)) {
          picker.value = selectedId;
          state.selected = state.manifests.find(
            (record) => record.id === selectedId,
          );
        }
        manifestDescription();
      }
      renderList();
      say(
        notice,
        pending
          ? "The earlier freeze response is unresolved. Retry it with the original command below, or inspect saved reports."
          : "Saved grant reports and current access refreshed.",
      );
      if (pending) renderPendingFreeze();
    } catch (error) {
      if (!guard(generation)) return;
      clearPrivate(
        "Private report data is hidden because current access could not be checked.",
      );
      say(notice, errorMessage(error), true);
      if (state.pending) renderPendingFreeze();
    } finally {
      state.busy = false;
      if (alive()) {
        sync();
        if (state.suspended && document.visibilityState !== "hidden")
          void refresh();
      }
    }
  }
  async function loadMore() {
    if (!state.cursor) return;
    const cursor = state.cursor;
    await action(
      listStatus,
      async (generation) => {
        if (state.loadedCursors.has(cursor))
          throw new Error(
            "This page cursor repeated. Refresh the report list.",
          );
        const result = await request(`${base}?cursor=${part(cursor)}`);
        if (!guard(generation)) return;
        const rows = checkPage(result);
        state.loadedCursors.add(cursor);
        const ids = new Set(state.reports.map((report) => report.id));
        state.reports.push(...rows.filter((report) => !ids.has(report.id)));
        state.cursor = result.nextCursor || null;
        renderList();
        say(listStatus, `${rows.length} report entries checked.`);
      },
      true,
    );
  }
  async function selectedFresh(generation) {
    if (!state.selected)
      throw new Error("Select a saved grant-report manifest first.");
    const selected = state.selected;
    const result = await api.record(org, "reporting", selected.id);
    if (!guard(generation)) return null;
    if (result.record?.revision !== selected.revision) {
      state.selected = result.record;
      updateManifestOption(result.record);
      state.prepared = null;
      state.preview = null;
      clearExpiry();
      stage.replaceChildren();
      manifestDescription();
      throw new Error(
        "The manifest changed. Its current saved version is shown; prepare or preview it again.",
      );
    }
    state.selected = result.record;
    updateManifestOption(result.record);
    return result.record;
  }
  async function prepare() {
    if (state.pending) return;
    await action(notice, async (generation) => {
      const record = await selectedFresh(generation);
      if (!record || !guard(generation)) return;
      state.prepared = null;
      state.preview = null;
      clearExpiry();
      stage.replaceChildren();
      dirty(false);
      const result = await request(`${base}/prepare`, {
        method: "POST",
        body: { reportingRecordId: record.id, revision: record.revision },
      });
      if (!guard(generation)) return;
      if (!hex.test(result.sourceDigest || ""))
        throw new Error("The prepared source digest could not be verified.");
      checkedGrantReport(result.report);
      state.prepared = { ...result, record };
      renderPrepared();
      say(
        notice,
        "Sources prepared. Inspect the report, then explicitly save its digest before independent manifest approval.",
      );
    });
  }
  function renderPrepared() {
    clearExpiry();
    const prepared = state.prepared;
    if (!prepared) return;
    const status = output();
    const save = button(
      "Save these source versions to the manifest",
      () => saveDigest(prepared, status),
      { class: "button primary" },
    );
    stage.replaceChildren(
      node("h3", {}, "Prepared sources — not approved or frozen"),
      node(
        "p",
        { class: "fine code" },
        `Source digest ${prepared.sourceDigest}`,
      ),
      node(
        "p",
        {},
        "Saving updates the manifest through its normal revision check and clears any earlier approval. Ask a different authorized contributor to review and approve the saved manifest, then set its workflow state to Approved.",
      ),
      renderGrantReport(prepared.report, {
        stage: "Source preparation preview",
      }),
      node("div", { class: "actions grant-report-controls" }, save),
      status,
    );
  }
  async function saveDigest(prepared, status) {
    if (state.pending || state.prepared !== prepared) return;
    await action(status, async (generation) => {
      const fresh = await api.record(org, "reporting", prepared.record.id);
      if (!guard(generation)) return;
      if (fresh.record?.revision !== prepared.record.revision)
        throw new Error(
          "The manifest changed since source preparation. Refresh and prepare it again; nothing was overwritten.",
        );
      const result = await api.updateRecord(
        org,
        "reporting",
        prepared.record.id,
        {
          revision: prepared.record.revision,
          data: {
            ...prepared.record.data,
            sourceDigest: prepared.sourceDigest,
          },
        },
      );
      if (!guard(generation)) return;
      if (
        !result.record?.id ||
        result.record.data?.sourceDigest !== prepared.sourceDigest
      )
        throw new Error(
          "The saved digest response could not be verified. Refresh the manifest before saving again.",
        );
      state.selected = result.record;
      updateManifestOption(result.record);
      state.prepared = null;
      state.preview = null;
      dirty(false);
      manifestDescription();
      stage.replaceChildren(
        node("h3", {}, "Source versions saved"),
        node(
          "p",
          {},
          "The manifest needs fresh independent approval and an Approved workflow state. Open it for review, then refresh this workspace before the final preview.",
        ),
        button("Open manifest for review", () => {
          if (alive()) openManifest?.(result.record.id);
        }),
      );
      say(
        notice,
        `Source digest saved at manifest revision ${result.record.revision}. No report was frozen.`,
      );
      await onSaved(result.record);
      if (!guard(generation)) return;
    });
  }
  async function preview() {
    if (state.pending) return;
    await action(notice, async (generation) => {
      const record = await selectedFresh(generation);
      if (!record || !guard(generation)) return;
      state.prepared = null;
      state.preview = null;
      clearExpiry();
      stage.replaceChildren();
      dirty(false);
      const result = await request(`${base}/preview`, {
        method: "POST",
        body: { reportingRecordId: record.id, revision: record.revision },
      });
      if (!guard(generation)) return;
      if (
        !result.previewId ||
        !hex.test(result.reviewHash || "") ||
        !(Date.parse(result.expiresAt) > Date.now())
      )
        throw new Error(
          "The final preview identity or expiry could not be verified. Request a fresh preview.",
        );
      checkedGrantReport(result.report);
      state.preview = result;
      renderPreview();
      say(
        notice,
        "Final preview ready. Review this exact version before freezing it.",
      );
    });
  }
  function renderPreview() {
    clearExpiry();
    const preview = state.preview;
    if (!preview) return;
    const acknowledgement = node("input", {
      type: "checkbox",
      id: "grant-report-freeze-ack",
      required: true,
      onchange: () => dirty(acknowledgement.checked),
    });
    const status = output();
    const form = node(
      "form",
      {
        class: "grant-report-freeze-form grant-report-controls",
        onsubmit: (event) => {
          event.preventDefault();
          if (!acknowledgement.checked || state.busy) return;
          if (!(Date.parse(preview.expiresAt) > Date.now())) {
            state.preview = null;
            dirty(false);
            sync();
            say(
              status,
              "This preview expired. Request and review a fresh approved preview.",
              true,
            );
            return;
          }
          return freeze(preview, status);
        },
      },
      node(
        "p",
        { class: "fine" },
        `Preview expires ${preview.expiresAt}. Freezing rechecks current sources and access.`,
      ),
      node(
        "label",
        { class: "grant-report-ack", for: acknowledgement.id },
        acknowledgement,
        "Store exactly this reviewed period and these approved source versions as an immutable report.",
      ),
      node(
        "button",
        {
          type: "submit",
          class: "button primary",
          id: "grant-report-freeze-submit",
        },
        "Freeze this reviewed version",
      ),
      status,
    );
    stage.replaceChildren(
      renderGrantReport(preview.report, {
        stage: "Final approved preview — not frozen",
      }),
      form,
    );
    const expire = () => {
      if (!alive() || state.preview !== preview || state.pending) return;
      const remaining = Date.parse(preview.expiresAt) - Date.now();
      if (remaining > 0) {
        expiryTimer = setTimeout(expire, Math.min(remaining, 2147483647));
        return;
      }
      state.preview = null;
      acknowledgement.disabled = true;
      dirty(false);
      sync();
      say(
        status,
        "This preview expired and cannot be frozen. Request a fresh approved preview.",
        true,
      );
    };
    expiryTimer = setTimeout(
      expire,
      Math.min(Date.parse(preview.expiresAt) - Date.now(), 2147483647),
    );
  }
  let retryPreview = null;
  function renderPendingFreeze() {
    const status = output();
    stage.replaceChildren(
      node("h3", {}, "Freeze response unresolved"),
      node(
        "p",
        {},
        "The service may already have frozen the report. Keep this view open and retry the same command; a different preview is blocked. Refreshing the saved list can show completed reports.",
      ),
      button(
        "Retry the same freeze command",
        () => freeze(retryPreview, status),
        { class: "button primary", disabled: !retryPreview },
      ),
      status,
    );
  }
  async function freeze(preview, status) {
    if (!preview) return;
    await action(status, async (generation) => {
      const body = intent.body(preview);
      state.pending = true;
      retryPreview = {
        previewId: preview.previewId,
        reviewHash: preview.reviewHash,
      };
      dirty(true);
      sync();
      let result;
      try {
        result = await request(`${base}/freeze`, { method: "POST", body });
        if (!guard(generation)) return;
        checkedGrantReport(result.report, { frozen: true });
      } catch (error) {
        intent.rejected(error.status);
        if (!guard(generation)) return;
        const definitive = [400, 401, 403, 404, 409, 413, 422, 429].includes(
          error.status,
        );
        if (definitive) {
          clearExpiry();
          state.pending = false;
          retryPreview = null;
          state.preview = null;
          dirty(false);
          stage.replaceChildren(
            node("h3", {}, "This preview cannot be frozen"),
            node(
              "p",
              {},
              "Refresh the manifest and request a new approved preview. No new report is claimed by this response.",
            ),
            preview.report
              ? renderGrantReport(preview.report, {
                  stage: "Historical preview — cannot be frozen",
                })
              : null,
          );
        } else {
          clearPrivate(
            "The freeze response is unresolved. Earlier private report details are hidden until current access is verified.",
          );
          renderPendingFreeze();
          say(notice, errorMessage(error), true);
        }
        throw error;
      }
      if (!guard(generation)) return;
      intent.clear();
      clearExpiry();
      state.pending = false;
      retryPreview = null;
      state.preview = null;
      dirty(false);
      stage.replaceChildren(
        node(
          "p",
          {},
          "This report is frozen. Later corrections require a newly prepared and independently approved manifest with the earlier report ID and a revision reason.",
        ),
      );
      renderReader(result.report);
      say(
        notice,
        result.reused && result.commandRecorded === false
          ? "Opened the existing approved edition. No new report or command receipt was created; it was not published or sent."
          : "Immutable grant report saved. It was not published or sent.",
      );
      await onSaved();
      if (!guard(generation)) return;
      const report = result.report;
      state.reports = [
        {
          id: report.id,
          title: report.title,
          period: report.period,
          createdAt: report.createdAt,
          checksum: report.checksum,
          audience: report.manifest?.audience,
        },
        ...state.reports.filter((saved) => saved.id !== report.id),
      ];
      renderList();
    });
  }
  function renderReader(report) {
    const readBoard = board;
    state.currentReportId = report.id;
    reader.replaceChildren(
      node(
        "div",
        { class: "actions grant-report-controls" },
        button("Download report JSON", () => exportCurrent(report.id, false)),
        button("Print report", () => exportCurrent(report.id, true)),
      ),
      renderGrantReport(report, { board: readBoard }),
    );
  }
  async function readReport(id) {
    await action(
      readStatus,
      async (generation) => {
        reader.replaceChildren();
        say(readStatus, "Checking access to this frozen report…");
        const result = await request(`${base}/${part(id)}`);
        if (!guard(generation)) return;
        checkedGrantReport(result.report, { board, frozen: true });
        renderReader(result.report);
        say(
          readStatus,
          "Frozen report loaded. Your current permissions determine the view.",
        );
      },
      true,
    );
  }
  async function exportCurrent(id, printing) {
    await action(
      readStatus,
      async (generation) => {
        const result = await request(`${base}/${part(id)}`);
        if (!guard(generation)) return;
        const report = checkedGrantReport(result.report, {
          board,
          frozen: true,
        });
        if (printing) {
          printCleanup?.();
          printCleanup = printReport(report, board);
        } else downloadReport(report);
        say(
          readStatus,
          printing
            ? "Print view opened for the current authorized report."
            : "Report JSON downloaded with its source versions and checksum.",
        );
      },
      true,
    );
  }
  picker.addEventListener("change", () => {
    if (!alive() || state.busy || state.pending) return;
    state.generation++;
    state.selected =
      state.manifests.find((record) => record.id === picker.value) || null;
    state.prepared = null;
    state.preview = null;
    clearExpiry();
    stage.replaceChildren();
    dirty(false);
    manifestDescription();
    sync();
  });
  root.append(
    node("h2", { id: "grant-report-heading" }, "Grant reports"),
    node(
      "p",
      {},
      board
        ? "Read approved board reports within your current program scope. The full staff source records remain private."
        : "Prepare one agreement and period from explicit sources, obtain independent manifest approval, then freeze a traceable report.",
    ),
    node("div", { class: "actions grant-report-controls" }, refreshButton),
    notice,
  );
  if (staff)
    root.append(
      node(
        "section",
        { class: "grant-report-authoring" },
        node("h3", {}, "Prepare and review a manifest"),
        node(
          "p",
          { class: "fine" },
          "In Reporting, save a board, funder or private manifest with Grant report v1, an explicit agreement/program/period and selected receipt, finance and outcome references. No draft becomes approved in this workspace.",
        ),
        node(
          "a",
          { href: "#module/reporting", class: "button subtle" },
          "Open Reporting records",
        ),
        node(
          "div",
          { class: "field" },
          node("label", { for: picker.id }, "Saved grant-report manifest"),
          picker,
        ),
        selectionStatus,
        node(
          "div",
          { class: "actions grant-report-controls" },
          editButton,
          prepareButton,
          previewButton,
        ),
        stage,
      ),
    );
  root.append(
    node(
      "section",
      { class: "grant-report-saved" },
      node("h3", {}, "Frozen grant reports"),
      list,
      moreButton,
      listStatus,
    ),
    readStatus,
    reader,
  );
  root.dispose = dispose;
  root.suspend = suspend;
  if (!staff && !board) {
    say(
      notice,
      "Your role does not have access to grant-report assembly or approved board reports.",
    );
    refreshButton.disabled = true;
    return root;
  }
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", visibility);
  await refresh();
  return root;
}
