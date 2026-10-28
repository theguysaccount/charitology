import {
  LEARNING_ROLES, LEARNING_NOTICE, learningHash, stableLearning, sourcePin,
  numericLiteral, closedPeriod, requirePin, learningCommitIntent,
  loadLearningContext, learningSeries, checkedLearningReport, sameHead,
  learningRecordFragment,
} from "./learning-model.js";

const actions = ["continue", "modify", "test", "stop"];
const adminRoles = new Set(["owner", "admin"]);
const unknown = (value) => value === null || value === undefined || value === "" ? "Unknown / not collected" : String(value);
const nullable = (value) => value === "" ? null : value;
const label = (value) => String(value).replaceAll("-", " ");
let workspaceNumber = 0;
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (["disabled", "required", "checked", "selected", "readOnly", "multiple"].includes(key)) element[key] = Boolean(value);
    else if (key === "class") element.className = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false)
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
}
const button = (text, action, attrs = {}) => node("button", { type: "button", class: "button subtle", onclick: action, ...attrs }, text);
const jsonView = (title, value, open = false) => node("details", { open }, node("summary", {}, title), node("pre", { class: "learning-json", tabindex: "0" }, JSON.stringify(value, null, 2)));
function options(select, rows, placeholder, keep = select.value) {
  select.replaceChildren(node("option", { value: "" }, placeholder), ...rows.map(([value, title]) => node("option", { value, selected: value === keep }, title)));
  select.value = rows.some(([value]) => value === keep) ? keep : "";
}
function facts(rows) {
  return node("dl", { class: "learning-facts" }, rows.map(([name, value]) => node("div", {}, node("dt", {}, name), node("dd", {}, unknown(value)))));
}
function panel(title, ...content) { return node("section", { class: "learning-card" }, node("h2", {}, title), ...content); }
export function learningReportView(report, historical = false) {
  return node("article", { class: "learning-report-view" },
    node("h2", {}, report.title),
    node("p", { class: "notice" }, historical ? "Recovered historical source material. This view carries no live approval, report export or print authority." : "Private staff report. The selected observations and account approvals do not establish causal impact."),
    facts([["Prepared", report.createdAt], ["Audience", report.audience], ["Report ID", report.id], ["Checksum", report.checksum], ["Period", `${report.manifest.startDate} through ${report.manifest.endDate}`], ["Summary", report.manifest.summary], ["Missingness", report.manifest.missingness], ["Action", report.approvedEvidence.find((item) => item.pin.recordId === report.selection.selection.decision.recordId)?.snapshot?.data?.decision]]),
    jsonView("Original selected source and exact source pins", report.sources),
    jsonView("Adopted intent, rule, comparison and feedback", report.basis, true),
    jsonView("Rule assessment and actual feedback", { assessment: report.assessment, feedback: report.feedback }, true),
    jsonView("Selected approved evidence and exact selection", { selection: report.selection, approvedEvidence: report.approvedEvidence }, true),
    jsonView("Exclusions, provenance boundaries and prior edition", { exclusions: report.exclusions, boundaries: report.boundaries, supersedes: report.supersedes }, true),
    jsonView("Complete event provenance", report.events));
}

/** No constructor network activity. Every load/upload/preview/save is explicit.
 * Native codecs load only after a deliberate file selection. No native storage is read.
 */
export function createLearningWorkspace({
  org, role, api, isCurrent = () => true, onDirty = () => {}, onChanged = () => {},
  onOpenRecord = () => {}, canWrite = true, canExport = true,
  nativeLoader = () => import("./learning-native-admission.js"),
  makeCommandKey, download: downloadOutput, print: printOutput, initialReportId = "",
} = {}) {
  if (!LEARNING_ROLES.has(role)) throw new Error("Learning work is available only to authorized staff.");
  const idPrefix = `learning-${++workspaceNumber}-`;
  let disposed = false, generation = 0, serial = 0, busy = false, dirty = false;
  let context = null, contextStale = false, series = null, inspection = null, mappingMode = "new", mappingSource = null;
  let programResolution = null, uploadBytes = null, nativeChoices = [], nativeModule = null;
  let preview = null, previewSerial = 0, manifestRecord = null, prepared = null, finalSelection = null;
  let recovered = null, listCursors = {}, verifiedReport = null, printFrame = null, printInProgress = false;
  const requests = new Set(), urls = new Set(), intent = learningCommitIntent(makeCommandKey);
  const status = node("p", { role: "status", "aria-live": "polite", class: "learning-status", "data-learning": "status" });
  const privateBody = node("div", { class: "learning-body" });
  const root = node("section", { class: "learning-workspace" },
    node("h1", { tabindex: "-1" }, "Learning and review"),
    node("p", {}, "Connect an explicit theory of change or nonprofit experiment to indicators, repeated observations, a review decision and a private report."),
    node("p", { class: "notice" }, LEARNING_NOTICE), status, privateBody);
  const writeArea = node("fieldset", { class: "learning-write-area", disabled: !canWrite }, node("legend", {}, "Author learning work"));
  const previewHost = node("div", { "data-learning": "preview" });
  const savedHost = node("div", { "data-learning": "saved" });
  const reportHost = node("div", { "data-learning": "report" });
  const contextHost = node("div", { "data-learning": "context" });
  function current() { return !disposed && isCurrent(); }
  function assertCurrent(token = generation) {
    if (!current() || token !== generation) throw Object.assign(new Error("This learning view is no longer current."), { name: "AbortError" });
  }
  function say(message, error = false) {
    if (!current()) return;
    status.textContent = message;
    status.classList.toggle("error", error);
  }
  function changed() {
    dirty = true; serial++; onDirty(true);
    if (!intent.pending) { preview = null; previewHost.replaceChildren(); prepared = null; finalSelection = null; }
  }
  function setWriteState() {
    writeArea.disabled = !canWrite || !!intent.pending;
    programChoice.disabled = !!intent.pending;
    bindingChoice.disabled = !!intent.pending;
  }
  function cleanupPrint() {
    printFrame?.remove(); printFrame = null; printInProgress = false;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }
  function invalidate({ clear = false } = {}) {
    generation++;
    for (const request of requests) request.abort();
    requests.clear(); busy = false; cleanupPrint();
    root.setAttribute("aria-busy", "false");
    preview = null; prepared = null; finalSelection = null; contextStale = true;
    if (clear) { uploadBytes = null; context = null; inspection = null; mappingSource = null; recovered = null; verifiedReport = null; privateBody.replaceChildren(); }
    else { previewHost.replaceChildren(); say(intent.pending ? "A command response is unresolved. Use the exact Retry before doing other work." : "This view was suspended. Reload its context explicitly before submitting. Your form is kept."); }
  }
  async function step(promise, token) { const value = await promise; assertCurrent(token); return value; }
  async function call(name, args, token) {
    assertCurrent(token);
    const controller = new AbortController(); requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    try { return await step(api[name](...args, { signal: controller.signal }), token); }
    finally { clearTimeout(timer); requests.delete(controller); }
  }
  async function perform(action, { unresolved = false } = {}) {
    if (!current() || busy) return;
    if (intent.pending && !unresolved) { say("Retry the unresolved command with its original key before starting another action.", true); return; }
    const token = generation; busy = true; root.setAttribute("aria-busy", "true");
    try { await action(token); assertCurrent(token); }
    catch (error) {
      if (!current() || token !== generation) return;
      if ([401, 403].includes(error.status)) { invalidate({ clear: true }); say("Current access is unavailable. Reopen the workspace after signing in and confirming organization access.", true); return; }
      if (error.status === 404) {
        contextStale = true; contextHost.replaceChildren(); sourceHost.replaceChildren(); retainedSourceHost.replaceChildren(); recoveredHost.replaceChildren(); reportHost.replaceChildren(); cleanupPrint();
        for (const editor of Object.values(basis)) editor.hideOriginal();
        preview = null; prepared = null; finalSelection = null; previewHost.replaceChildren();
      }
      if (error.name === "AbortError") say(intent.pending ? "The command response is unresolved. Use exact Retry; it may already have completed." : "The request was cancelled or timed out. Your form is kept.", true);
      else say(error.message || "The learning action could not be completed. Your form is kept.", true);
    } finally {
      if (current() && token === generation) { busy = false; root.setAttribute("aria-busy", "false"); setWriteState(); }
    }
  }
  const action = (fn, config) => () => perform(fn, config);
  const makeButton = (text, fn, attrs = {}, config) => button(text, action(fn, config), attrs);
  function input(name, title, { type = "text", max = 4000, value = "", help = "", required = false, choices = null } = {}) {
    const control = choices ? node("select", {}) : node(type === "textarea" ? "textarea" : "input", { type: type === "textarea" ? null : type });
    control.setAttribute("id", idPrefix + name); control.setAttribute("data-learning", name);
    if (choices) {
      for (const item of choices) { const [v, text] = Array.isArray(item) ? item : [item, label(item)]; control.append(node("option", { value: v, selected: v === value }, text)); }
    }
    control.value = value;
    if (type !== "file") control.setAttribute("maxlength", max);
    if (type === "date") { control.setAttribute("min", "1900-01-01"); control.setAttribute("max", "2200-12-31"); }
    control.required = required;
    control.addEventListener("input", changed); control.addEventListener("change", changed);
    const wrapper = node("div", { class: "learning-field" }, node("label", { for: control.id }, title), control, help && node("small", {}, help));
    return { control, wrapper, read: () => control.value };
  }
  function form(name, title, content, submitText, submit) {
    const element = node("form", { method: "post", "data-learning": name });
    element.addEventListener("submit", (event) => { event.preventDefault(); if (element.reportValidity()) return perform(submit); });
    element.append(...content, node("button", { type: "submit", class: "button primary" }, submitText));
    return panel(title, element);
  }
  function openRecord(moduleId, recordId) {
    assertCurrent(); onOpenRecord(moduleId, recordId);
  }
  function recordLink(moduleId, recordId, title = recordId) {
    return node("a", { href: learningRecordFragment(org, moduleId, recordId), target: "_blank", rel: "noopener noreferrer", onclick: (event) => { event.preventDefault(); openRecord(moduleId, recordId); } }, title);
  }
  function needContext() {
    if (!context || contextStale || context.binding.originMode !== "live" || context.binding.bindingId !== bindingChoice.value) throw new Error("Load the current live binding context explicitly. Historical recovery cannot authorize a live action.");
    return context;
  }
  function resolved(id) { return context?.records.find((row) => row.recordId === id); }
  function pointPin(point) { return requirePin(point?.resolution); }
  function historicalPointPin(point) {
    if (point?.resolution?.eligibility?.eligible) return requirePin(point.resolution);
    // Only typed immutable event pins are offered as historical correction input.
    for (const event of context.events.slice().reverse()) {
      const p = event.payload;
      const pins = p.kind === "corrected" ? [p.input.replaces] : p.kind === "correction-applied" ? [p.replaces, p.replacement] : p.kind === "decided" ? p.input.observations : [];
      const pin = pins.find((pin) => pin.recordId === point.recordId);
      if (pin) return pin;
    }
    throw new Error("This point has no retained approved proof for a correction. A never-approved draft can be explicitly trashed in its ordinary workflow.");
  }
  async function workingProgram(token) {
    const selectedId = programChoice.value;
    if (!selectedId) throw new Error("Choose the existing program explicitly.");
    const response = await call("learningApproval", [org, selectedId], token);
    programResolution = response.resolution;
    const record = programResolution?.record;
    if (record?.moduleId !== "programs" || record.data.kind !== "program" || record.orgId !== org) throw new Error("Choose a current program record in this organization.");
    const dataSha256 = await step(learningHash("data", record.data), token);
    if (selectedId !== programChoice.value) throw new Error("The program choice changed. Inspect or preview it again.");
    return { moduleId: "programs", recordId: record.id, revision: record.revision, dataSha256 };
  }
  async function showPreview(response, token, expectedSerial) {
    assertCurrent(token);
    if (expectedSerial !== serial) throw new Error("The form changed while preparing its preview. Your literal input is kept; preview it again.");
    if (!response?.previewId || !/^[a-f0-9]{64}$/.test(response.reviewSha256 || "") || !response.operation || !response.expiresAt) throw new Error("The preview response is incomplete.");
    if (response.operation === "freeze") await step(checkedLearningReport(response.report), token);
    else if (!response.plan?.event || !Array.isArray(response.plan.candidates) || !Array.isArray(response.plan.samePeriodRecordIds) || !Array.isArray(response.plan.approvedEvidence)) throw new Error("The complete learning plan was not returned.");
    if (expectedSerial !== serial) throw new Error("The form changed during verification. Preview it again.");
    preview = response; previewSerial = serial;
    renderPreview(); say("Review the complete prepared bytes, source, targets and exclusions, then explicitly commit this preview.");
  }
  function renderPreview() {
    if (!preview) return previewHost.replaceChildren();
    const ack = node("input", { type: "checkbox", "data-learning": "preview-ack" });
    const confirm = makeButton("Commit reviewed preview", commitPreview, { class: "button primary", disabled: true, "data-learning": "commit" });
    ack.addEventListener("change", () => { confirm.disabled = !ack.checked; });
    const content = preview.operation === "freeze" ? learningReportView(preview.report) : [
      preview.plan.source && jsonView("Exact retained source", preview.plan.source, true),
      jsonView("Complete authored ordinary target records", preview.plan.candidates, true),
      jsonView("Exact event and approved evidence", { event: preview.plan.event, approvedEvidence: preview.plan.approvedEvidence }, true),
      preview.plan.samePeriodRecordIds.length ? node("p", { class: "notice" }, `Repeated period: existing record IDs ${preview.plan.samePeriodRecordIds.join(", ")}. This creates another explicit measurement; it does not overwrite them.`) : null,
    ];
    previewHost.replaceChildren(panel("Review prepared changes", facts([["Operation", preview.operation], ["Prepared", preview.report?.createdAt || preview.plan.event.recordedAt], ["Preview expires", preview.expiresAt], ["Review SHA-256", preview.reviewSha256]]), node("p", { class: "notice" }, LEARNING_NOTICE), content,
      node("label", { class: "learning-check" }, ack, "I reviewed this complete plan, its repeated-period warning if present, source text, authored target visibility and exact selected evidence."), confirm,
      makeButton("Hide this preview locally", async () => { const expiresAt = preview.expiresAt; preview = null; previewHost.replaceChildren(); say(`Preview hidden in this tab. The service retains its counted preview slot until ${expiresAt}. Your form is kept.`); })));
  }
  async function commitPreview(token) {
    if (!preview || previewSerial !== serial) throw new Error("Preview the current form before committing.");
    const body = intent.prepare(preview); setWriteState(); await sendCommit(body, token);
  }
  async function sendCommit(body, token) {
    try {
      const result = await call("commitLearning", [org, body], token);
      if (!result?.result?.head || !["committed", "already-committed"].includes(result.kind) || !["active", "trash", "historical-only"].includes(result.disposition) || !Array.isArray(result.result.records)) throw new Error("The command response is incomplete. Use exact Retry; acceptance is unknown.");
      intent.clear(); preview = null; previewHost.replaceChildren(); dirty = false; onDirty(false); contextStale = true; prepared = null; finalSelection = null;
      savedHost.replaceChildren(panel("Saved result", node("p", {}, `${label(result.result.outcome)} · ${label(result.kind)} · ${label(result.disposition)}. Reload the current binding context before continuing.`), facts([["Binding", result.result.head.bindingId], ["Accepted result head sequence", result.result.head.sequence]]), result.disposition === "active" && makeButton("Load this saved live binding context", async (nextToken) => {
        const id = result.result.head.bindingId;
        if (!Array.from(bindingChoice.children).some((option) => option.value === id)) bindingChoice.append(node("option", { value: id }, id));
        bindingChoice.value = id; await refreshContext(nextToken);
      }), result.result.records.map((pin) => node("p", {}, recordLink(pin.moduleId, pin.recordId, `Open ${pin.moduleId} / ${pin.recordId} for its ordinary workflow and final-state approval`))), result.result.report && node("p", {}, `Private report ${result.result.report.id} · ${result.result.report.checksum}`)));
      onChanged(); say("The exact command was resolved. New draft targets need the existing separate-account final-state approval workflow.");
    } catch (error) {
      intent.rejected(error);
      if (intent.pending) {
        onDirty(true);
        previewHost.replaceChildren(panel("Unresolved command response", node("p", {}, "The operation may already have completed. Retry sends the exact original preview ID, review hash and command key, including after preview expiry. Do not create a replacement command."), facts(Object.entries(intent.pending)), makeButton("Retry exact command", async (nextToken) => sendCommit(intent.pending, nextToken), { "data-learning": "retry" }, { unresolved: true })));
      } else { preview = null; previewHost.replaceChildren(); }
      throw error;
    } finally { setWriteState(); }
  }

  const programChoice = node("select", { "data-learning": "program", required: true });
  options(programChoice, [], "Load saved work, then choose a program…");
  programChoice.addEventListener("change", () => { changed(); inspection = null; programResolution = null; });
  const bindingChoice = node("select", { "data-learning": "binding" }); options(bindingChoice, [], "Load saved work, then choose a binding…");
  bindingChoice.addEventListener("change", () => { changed(); contextStale = true; });
  const reportChoice = node("select", { "data-learning": "report-choice" }); options(reportChoice, [], "Load saved reports…");
  if (initialReportId) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(initialReportId)) throw new Error("Choose an exact saved learning report ID.");
    reportChoice.append(node("option", { value: initialReportId }, `Known report ${initialReportId}`)); reportChoice.value = initialReportId;
  }
  reportChoice.addEventListener("change", () => { verifiedReport = null; reportHost.replaceChildren(); });
  const programLabel = node("label", {}, "Existing program", programChoice);
  const bindingLabel = node("label", {}, "Live binding", bindingChoice);
  const listHost = node("div");
  async function loadPage(kind, append, token) {
    const apiName = { bindings: "learningBindings", reports: "learningReports", recovered: "learningRecovered" }[kind];
    const cursor = append ? listCursors[kind] : null;
    const page = await call(apiName, [org, cursor], token);
    const rows = page[kind === "reports" ? "reports" : "bindings"];
    if (!Array.isArray(rows) || rows.length > 20 || (page.nextCursor && page.nextCursor === cursor)) throw new Error("Repeated or incomplete learning list page.");
    listCursors[kind] = page.nextCursor;
    const target = { bindings: bindingChoice, reports: reportChoice, recovered: recoveredChoice }[kind];
    if (!append) options(target, [], "Choose explicitly…");
    const values = new Set(Array.from(target.children).map((row) => row.value));
    for (const row of rows) {
      const value = kind === "reports" ? row.id : kind === "recovered" ? row.head.eventSha256 : row.bindingId;
      if (values.has(value)) throw new Error("A learning list returned a repeated item.");
      values.add(value);
      target.append(node("option", { value }, kind === "reports" ? `${row.title} · ${row.id}` : `${row.programId} · ${row.bindingId} · ${row.disposition}`));
    }
    return rows;
  }
  async function loadPrograms(token) {
    const records = [], seen = new Set(); let cursor = null;
    do {
      const page = await call("records", [org, "programs", cursor], token);
      if (!Array.isArray(page.records) || page.records.length > 100) throw new Error("The ordinary program list was incomplete.");
      records.push(...page.records.filter((record) => record.data.kind === "program"));
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error("Repeated ordinary program cursor.");
      if (cursor) seen.add(cursor);
      if (records.length > 2000 || seen.size > 100) throw new Error("The program list exceeds its supported reading bound.");
    } while (cursor);
    options(programChoice, records.map((record) => [record.id, `${record.data.title} · ${record.status} · ${record.id}`]), "Choose an existing program…");
  }
  async function refreshContext(token) {
    if (!bindingChoice.value) throw new Error("Choose a live binding explicitly.");
    contextStale = true; contextHost.replaceChildren(); preview = null; prepared = null; finalSelection = null; previewHost.replaceChildren();
    const bindingId = bindingChoice.value;
    const controller = new AbortController(); requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    let loaded;
    try { loaded = await loadLearningContext(api, org, bindingId, controller.signal, () => assertCurrent(token)); }
    finally { clearTimeout(timer); requests.delete(controller); }
    assertCurrent(token);
    if (bindingId !== bindingChoice.value) throw new Error("The binding choice changed while loading.");
    context = loaded; contextStale = false; series = learningSeries(context);
    programChoice.value = context.binding.programId;
    prepared = null; finalSelection = null; preview = null; previewHost.replaceChildren();
    renderContext(); renderEvidenceChoices();
    say("Current context loaded. Literal authored form values are kept. Preview will recheck current source, scope, head and approvals.");
  }
  function renderContext() {
    const rows = [context.program, ...context.records];
    contextHost.replaceChildren(panel("Current source and approval context", facts([["Binding", context.binding.bindingId], ["Head sequence", context.binding.head.sequence], ["Mapping", context.mapping.payload.mappingNumber], ["Source received", context.source.receivedAt], ["Original uploaded bytes SHA-256", context.source.originalSha256]]),
      jsonView("Complete retained source; dates are source metadata, not observation periods", context.source),
      jsonView("Current adopted mapping and protocol", context.mapping.payload.mapping, true),
      node("ul", {}, rows.map((resolution) => node("li", {}, resolution.record ? recordLink(resolution.record.moduleId, resolution.record.id, `${resolution.record.data.title} · ${resolution.record.status} · revision ${resolution.record.revision}`) : resolution.recordId, ` — ${resolution.eligibility.message}`))),
      node("p", {}, "Approve the exact final workflow state in the normal record view using an eligible different account. Reload this context afterward. A carried approval from an earlier state is insufficient."),
      jsonView("Complete retained lifecycle events", context.events)));
    renderCorrections();
  }
  const overview = panel("Saved work", node("p", {}, "Ordinary workflow links open separately in the exact organization after current membership is checked, so this learning form stays here. Complete the normal workflow there, then return and explicitly reload this context."), makeButton("Load saved work and programs", async (token) => {
    await loadPrograms(token); await loadPage("bindings", false, token);
    if (canExport) await loadPage("reports", false, token);
    say(canExport ? "Programs, binding summaries and report summaries loaded. Choose a specific context or report explicitly." : "Programs and binding summaries loaded. Private reports require current export permission on all four source modules.");
  }, { "data-learning": "load" }), programLabel, bindingLabel,
  makeButton("Load / reload binding context", refreshContext, { "data-learning": "load-context" }),
  makeButton("More bindings", async (token) => { if (!listCursors.bindings) throw new Error("No next binding page. Load the list first."); await loadPage("bindings", true, token); }), listHost);

  const adapter = input("adapter", "Native tool", { value: "theory-of-change-native-v1", choices: [["theory-of-change-native-v1", "Theory of change native export"], ["nonprofit-learning-native-v1", "Nonprofit learning native export"]] });
  const file = input("native-file", "Choose a native JSON export", { type: "file", help: "The complete original file is validated locally. Only an explicit inspection uploads it; the file name is not sent." });
  file.control.setAttribute("accept", ".json,application/json");
  const sourceChoice = input("source-choice", "Exact native selection", { choices: [["", "Choose a native file first…"]] });
  const uploadMode = input("upload-mode", "Receipt destination", { value: "new", choices: [["new", "New binding"], ["refresh", "Refresh the loaded live binding"]] });
  const sourceHost = node("div", { "data-learning": "source-inspection" });
  function cancelSourceRequest() {
    if (busy && !intent.pending) {
      generation++; for (const request of requests) request.abort(); requests.clear(); busy = false; root.setAttribute("aria-busy", "false");
    }
  }
  adapter.control.addEventListener("change", () => { cancelSourceRequest(); uploadBytes = null; nativeChoices = []; inspection = null; file.control.value = ""; options(sourceChoice.control, [], "Choose a native file…"); sourceHost.replaceChildren(); });
  file.control.addEventListener("change", () => {
    uploadBytes = null; inspection = null; nativeChoices = []; sourceHost.replaceChildren();
    cancelSourceRequest();
    return perform(async (token) => {
    const selectedFile = file.control.files?.[0], selectedAdapter = adapter.read();
    if (!selectedFile) return;
    const cap = selectedAdapter === "theory-of-change-native-v1" ? 1_000_000 : 8_000_000;
    if (selectedFile.size > cap) throw new Error(`This native adapter admits at most ${cap.toLocaleString()} original bytes. Nothing was uploaded.`);
    const bytes = new Uint8Array(await step(selectedFile.arrayBuffer(), token));
    nativeModule ||= await step(nativeLoader(), token);
    const choices = await step(nativeModule.listLearningNativeSelections(bytes, { adapter: selectedAdapter }), token);
    if (file.control.files?.[0] !== selectedFile || adapter.read() !== selectedAdapter) throw new Error("The file choice changed. Choose it again explicitly.");
    if (!Array.isArray(choices) || choices.length > 250) throw new Error("The complete native chooser response is invalid.");
    uploadBytes = bytes; nativeChoices = choices;
    options(sourceChoice.control, choices.map((choice, index) => [String(index), `${choice.title} · ${choice.selection.recordId || "whole draft"}`]), "Choose the exact retained source…");
    say(`${choices.length} selectable source${choices.length === 1 ? "" : "s"} passed the complete actual native codec locally. Choose one, then inspect the full upload.`);
    });
  });
  sourceChoice.control.addEventListener("change", () => { cancelSourceRequest(); inspection = null; sourceHost.replaceChildren(); });
  const sourceForm = form("source-form", "1. Inspect an explicit native source", [adapter.wrapper, file.wrapper, sourceChoice.wrapper, uploadMode.wrapper,
    node("p", {}, "Theory of change retains the whole export. Nonprofit learning validates all collections but retains nine context fields and exactly one complete learning row. Large files are temporarily stored in full as private upload parts. Successful inspection removes those parts; interrupted parts become unavailable after 30 minutes and are deleted on a later upload cleanup. Only the selected source enters learning history and backups. Source notes, baseline, results and dates do not become measurements or approvals.")], "Inspect selected source with the service", async (token) => {
    if (!uploadBytes || sourceChoice.read() === "") throw new Error("Choose a complete native file and its exact selection first.");
    const ownSerial = serial, selected = nativeChoices[Number(sourceChoice.read())], selectedAdapter = adapter.read();
    if (!selected) throw new Error("Choose an exact native selection.");
    const local = await step(nativeModule.inspectLearningNativeValue(uploadBytes, { adapter: selectedAdapter, selection: selected.selection }), token);
    const program = await workingProgram(token);
    const target = uploadMode.read() === "refresh" ? { kind: "refresh", program, head: needContext().binding.head } : { kind: "new", program };
    const response = await call("inspectLearningSource", [org, { version: 1, adapter: selectedAdapter, selection: selected.selection, target }, uploadBytes], token);
    if (ownSerial !== serial) throw new Error("Source inputs changed during inspection. Inspect them again; your original file is kept.");
    if (!response.source || response.source.originalSha256 !== local.originalSha256 || response.source.originalBytes !== local.originalBytes || response.source.nativeIdentity !== local.nativeIdentity || stableLearning(response.source.selected) !== stableLearning(local.selected) || stableLearning(response.source.selection) !== stableLearning(local.selection)) throw new Error("The service selection differs from the exact local native inspection. No mapping was accepted.");
    inspection = response; mappingMode = target.kind === "refresh" ? "refresh" : "new"; mappingSource = response.source; recovered = null;
    renderSource(response.source); configureBasisSource(response.source);
    sourceHost.replaceChildren(facts([["Inspection expires", response.expiresAt], ["Retained scope", response.retainedScope], ["Original bytes", response.source.originalBytes], ["Native identity", response.source.nativeIdentity]]), jsonView("Exact server-retained source", response.source, true));
    say("Source inspected. It is an expiring proposal until an explicitly reviewed mapping is committed.");
  });
  sourceForm.append(sourceHost);
  const retainedSourceHost = node("div");
  function renderSource(source) {
    retainedSourceHost.replaceChildren(jsonView("Original retained source alongside adopted intent", source, true));
  }
  function sourceFields(source, kind) {
    const toc = source?.selected.kind === "theory-of-change";
    const data = toc ? source.selected.value.draft : source?.selected.value;
    if (!data) return [];
    const rows = toc ? {
      intendedOutcome: [["toc.outcomeShort", data.outcomeShort], ["toc.outcomeMedium", data.outcomeMedium], ["toc.outcomeLong", data.outcomeLong]],
      rule: [["toc.stopRule", data.stopRule]], comparison: [["toc.comparison", data.comparison]],
      feedback: [["toc.feedbackMethod", data.feedbackMethod], ["toc.feedbackFrequency", data.feedbackFrequency], ["toc.feedbackMethod|toc.feedbackFrequency", `Method: ${data.feedbackMethod}\nFrequency: ${data.feedbackFrequency}`]],
    } : {
      intendedOutcome: [["np.learning.outcome", data.learning.values.outcome], ["np.context.change", data.context.change]],
      rule: [["np.learning.rule", data.learning.values.rule]], comparison: [], feedback: [["np.learning.feedback", data.learning.values.feedback]],
    };
    return rows[kind];
  }
  function basisForm(kind, title) {
    const disposition = input(`${kind}-disposition`, `${title}: treatment`, { value: "uncollected", choices: ["adopted", "adapted", "uncollected", "not-adopted"] });
    const field = input(`${kind}-source`, "Explicit source field (optional for adapted author text)", { choices: [["", "No source field chosen"]] });
    const text = input(`${kind}-text`, "Adopted or adapted text", { type: "textarea", max: 700, help: "Adopted text must equal the exact chosen source. Adapted text is deliberately authored; explain the change." });
    const reason = input(`${kind}-reason`, "Reason for adapting, missing or not adopting", { type: "textarea", max: 2000 });
    const original = node("p", { class: "learning-verbatim" });
    field.control.addEventListener("change", () => {
      const row = sourceFields(mappingSource, kind).find(([key]) => key === field.read());
      original.textContent = row ? row[1] : "No source field chosen.";
    });
    const copy = makeButton("Use this exact source text", async () => {
      const row = sourceFields(mappingSource, kind).find(([key]) => key === field.read());
      if (!row || row[1] === "") throw new Error("Choose a nonempty source field explicitly.");
      if (row[1].length > 700) throw new Error("This complete source text exceeds the 700-unit adopted basis limit. The source is unchanged; author an explicit adapted interpretation with a reason.");
      text.control.value = row[1]; disposition.control.value = "adopted"; changed();
    });
    return { wrapper: node("fieldset", { class: "learning-basis" }, node("legend", {}, title), disposition.wrapper, field.wrapper, original, copy, text.wrapper, reason.wrapper),
      configure(source) {
        options(field.control, sourceFields(source, kind).map(([key]) => [key, key.replaceAll("|", " + ")]), "No source field chosen");
        const row = sourceFields(source, kind).find(([key]) => key === field.read());
        original.textContent = row ? row[1] : "No source field chosen.";
      },
      hideOriginal() { original.textContent = "Source display unavailable; explicitly inspect or reload its current authorized context."; },
      source: field.control, read() {
        const treatment = disposition.read();
        return { disposition: treatment, sourceFields: field.read() ? field.read().split("|") : [], text: ["adopted", "adapted"].includes(treatment) ? text.read() : null, reason: treatment === "adopted" ? null : reason.read() };
      } };
  }
  const basis = {
    intendedOutcome: basisForm("intendedOutcome", "Intended outcome"), rule: basisForm("rule", "Stop or decision rule"),
    comparison: basisForm("comparison", "Comparison or rival explanation"), feedback: basisForm("feedback", "Planned feedback"),
  };
  function configureBasisSource(source) {
    for (const editor of Object.values(basis)) editor.configure(source);
    for (const indicator of indicatorEditors) indicator.configure(source);
  }
  const whenMet = input("when-met", "Planned action when rule is met", { choices: [["", "Unknown / no planned action"], ...actions] });
  const whenNotMet = input("when-not-met", "Planned action when rule is not met", { choices: [["", "Unknown / no planned action"], ...actions] });
  const indicatorEditors = [], indicatorsHost = node("div", { class: "learning-indicators" });
  function addIndicator() {
    if (indicatorEditors.length >= 10) { say("A mapping supports at most 10 indicators.", true); return; }
    const number = indicatorEditors.length + 1, name = `indicator-${number}-`;
    const origin = input(name + "origin", "Indicator origin", { choices: [["", "Choose explicitly…"], ["author-defined", "Author-defined indicator"]] });
    const originReason = input(name + "origin-reason", "Reason for an author-defined indicator", { type: "textarea", max: 2000 });
    const title = input(name + "title", "Indicator title", { max: 180, required: true });
    const unitKind = input(name + "unit-kind", "Unit knowledge", { value: "unknown", choices: [["unknown", "Unknown unit; actual measurement blocked"], ["defined", "Explicitly defined unit"]] });
    const unitText = input(name + "unit-text", "Unit text", { max: 240 });
    const quantity = input(name + "quantity", "Quantity kind", { value: "count", choices: ["count", "amount", "percentage", "rate", "other"] });
    const definition = input(name + "unit-definition", "Unit definition", { type: "textarea", max: 2000 });
    const denominatorDefinition = input(name + "denominator-definition", "Denominator definition (required for percentage / rate)", { type: "textarea", max: 2000 });
    const population = input(name + "population", "Population", { max: 700, required: true });
    const geography = input(name + "geography", "Geography (empty means unknown)", { max: 700 });
    const planned = input(name + "period", "Planned period knowledge", { value: "unknown", choices: [["unknown", "Unknown planned period"], ["closed-days", "Known planned closed-day period"]] });
    const start = input(name + "start", "Planned period starts", { type: "date" }), end = input(name + "end", "Planned period ends", { type: "date" });
    const limitations = input(name + "limitations", "Definition limitations", { type: "textarea", max: 2000, required: true });
    const editor = {
      configure(source) {
        const rows = source.selected.kind === "theory-of-change" ? source.selected.value.draft.indicators.map((item, index) => [`toc:${index}`, `Exact source indicator ${index + 1}: ${item.what}`]) : [["learning-checkpoint", "Exact selected nonprofit learning checkpoint"]];
        options(origin.control, [...rows, ["author-defined", "Author-defined indicator"]], "Choose explicitly…");
      },
      read() {
        let selectedOrigin;
        if (origin.read().startsWith("toc:")) selectedOrigin = { kind: "toc-indicator", index: Number(origin.read().slice(4)) };
        else if (origin.read() === "learning-checkpoint") selectedOrigin = { kind: "learning-checkpoint" };
        else if (origin.read() === "author-defined") selectedOrigin = { kind: "author-defined", reason: originReason.read() };
        else throw new Error(`Indicator ${number}: choose its origin explicitly.`);
        return { slot: number, origin: selectedOrigin, title: title.read(), unit: unitKind.read() === "unknown" ? { kind: "unknown" } : { kind: "defined", text: unitText.read(), quantityKind: quantity.read(), definition: definition.read(), denominatorDefinition: nullable(denominatorDefinition.read()) }, population: population.read(), geography: nullable(geography.read()), plannedPeriod: planned.read() === "unknown" ? { kind: "unknown" } : closedPeriod(start.read(), end.read()), limitations: limitations.read() };
      },
    };
    indicatorEditors.push(editor);
    indicatorsHost.append(node("fieldset", { class: "learning-indicator" }, node("legend", {}, `Indicator slot ${number}`), origin.wrapper, originReason.wrapper, title.wrapper, unitKind.wrapper, unitText.wrapper, quantity.wrapper, definition.wrapper, denominatorDefinition.wrapper, population.wrapper, geography.wrapper, planned.wrapper, start.wrapper, end.wrapper, limitations.wrapper));
    if (mappingSource) editor.configure(mappingSource);
  }
  addIndicator();
  const protocolTitle = input("protocol-title", "Protocol title", { max: 180, required: true });
  const question = input("protocol-question", "Review question", { type: "textarea", max: 500, required: true });
  const protocolMethod = input("protocol-method", "Planned method", { value: "unknown", choices: ["unknown", "before-after", "comparison", "randomized", "contribution-analysis", "qualitative"] });
  const protocolUncertainty = input("protocol-uncertainty", "Planned uncertainty and rival explanations", { type: "textarea", required: true });
  const protocolHarms = input("protocol-harms", "Possible harms and safeguards", { type: "textarea", required: true });
  const reviewDate = input("protocol-review", "Planned review date (empty means unknown)", { type: "date" });
  function readMapping() {
    const ruleBasis = basis.rule.read();
    const unknownRule = ["uncollected", "not-adopted"].includes(ruleBasis.disposition);
    if (unknownRule && (whenMet.read() || whenNotMet.read())) throw new Error("An uncollected or not-adopted rule cannot have planned met/not-met actions. Choose Unknown explicitly.");
    return { mappingVersion: "learning-mapping-v1", basis: { intendedOutcome: basis.intendedOutcome.read(), rule: { basis: ruleBasis, whenMet: nullable(whenMet.read()), whenNotMet: nullable(whenNotMet.read()) }, comparison: basis.comparison.read(), feedback: basis.feedback.read() }, indicators: indicatorEditors.map((editor) => editor.read()), protocol: { title: protocolTitle.read(), question: question.read(), method: protocolMethod.read(), uncertainty: protocolUncertainty.read(), harms: protocolHarms.read(), reviewDate: nullable(reviewDate.read()) } };
  }
  const mappingForm = form("mapping-form", "2. Map intent, indicators and protocol", [
    node("p", {}, "Choose the source explicitly below. A refresh or remap creates new definitions and protocol records; it never silently changes a measured series."),
    makeButton("Use the loaded retained source for a fresh remap", async () => { needContext(); mappingMode = "remap"; mappingSource = context.source; inspection = null; recovered = null; configureBasisSource(mappingSource); renderSource(mappingSource); changed(); say("Retained source chosen for an explicit remap. Author and review the complete new mapping."); }),
    retainedSourceHost, ...Object.values(basis).map((editor) => editor.wrapper), whenMet.wrapper, whenNotMet.wrapper,
    indicatorsHost, makeButton("Add another indicator (maximum 10)", async () => { addIndicator(); changed(); }),
    makeButton("Remove the last indicator slot", async () => { if (indicatorEditors.length <= 1) throw new Error("Keep at least one indicator."); indicatorEditors.pop(); indicatorsHost.children[indicatorsHost.children.length - 1].remove(); changed(); }),
    protocolTitle.wrapper, question.wrapper, protocolMethod.wrapper, protocolUncertainty.wrapper, protocolHarms.wrapper, reviewDate.wrapper,
  ], "Preview this complete mapping", async (token) => {
    if (!mappingSource) throw new Error("Inspect a new native source, choose the loaded source for remap, or explicitly choose recovered adoption first.");
    const ownSerial = serial, program = await workingProgram(token), mapping = readMapping();
    let proposal;
    if (mappingMode === "new" || mappingMode === "refresh") {
      if (!inspection) throw new Error("Inspect the original native upload again explicitly.");
      proposal = { mode: mappingMode, inspectionId: inspection.inspectionId, ...(mappingMode === "refresh" ? { head: needContext().binding.head } : {}), program, mapping };
    } else if (mappingMode === "remap") proposal = { mode: "remap", head: needContext().binding.head, source: sourcePin(mappingSource), program, mapping };
    else if (mappingMode === "adopt-recovered" && recovered) proposal = { mode: "adopt-recovered", recoveredHead: recovered.binding.head, source: sourcePin(mappingSource), program, mapping };
    else throw new Error("Choose an explicit mapping source mode.");
    await showPreview(await call("previewLearningMapping", [org, proposal], token), token, ownSerial);
  });

  const definitionChoice = input("measurement-definition", "Exact approved indicator definition", { choices: [["", "Load a binding context…"]] });
  const measurementTitle = input("measurement-title", "Observation title", { max: 180, required: true });
  const value = input("measurement-value", "Measured value (empty means missing; 0 is known zero)", { max: 100 });
  const denominator = input("measurement-denominator", "Measured denominator (empty means unknown)", { max: 100 });
  const actualStart = input("measurement-start", "Actual observation period starts", { type: "date", required: true });
  const actualEnd = input("measurement-end", "Actual observation period ends", { type: "date", required: true });
  const actualMethod = input("measurement-method", "Actual collection method", { value: "unknown", choices: ["unknown", "administrative", "survey", "observation", "experiment"] });
  const evidence = input("measurement-evidence", "Actual evidence description", { value: "unknown", choices: ["unknown", "self-reported", "source-linked"] });
  const measurementUrl = input("measurement-url", "Source HTTPS URL (empty means unknown)", { type: "url", max: 1200 });
  const locatorKind = input("measurement-locator-kind", "Source locator knowledge", { value: "not-collected", choices: [["not-collected", "Not collected in this observation"], ["known", "Known exact locator"]] });
  const locator = input("measurement-locator", "Exact page, table or other source locator", { max: 512 });
  const missingReason = input("measurement-missing", "Reason for a missing value", { type: "textarea", max: 2000 });
  const measurementLimits = input("measurement-limits", "Actual measurement limitations", { type: "textarea", required: true });
  const replacesChoice = input("measurement-replaces", "Correction target (optional; leaves value history intact)", { choices: [["", "New repeated observation, no correction"]] });
  const correctionReason = input("measurement-correction-reason", "Reason for correcting the selected point", { type: "textarea", max: 2000 });
  function measurementInput() {
    const ctx = needContext(), definition = series.definitions.find((row) => row.recordId === definitionChoice.read());
    const input = { head: ctx.binding.head, mappingEventSha256: ctx.mapping.sha256, program: requirePin(ctx.program), protocol: requirePin(series.protocol), definition: requirePin(definition), title: measurementTitle.read(), value: numericLiteral(value.read(), "Measured value"), denominator: numericLiteral(denominator.read(), "Denominator"), period: closedPeriod(actualStart.read(), actualEnd.read()), method: actualMethod.read(), evidence: evidence.read(), sourceUrl: nullable(measurementUrl.read()), locator: locatorKind.read() === "known" ? { kind: "known", text: locator.read() } : { kind: "not-collected" }, missingReason: value.read() === "" ? missingReason.read() : null, limitations: measurementLimits.read() };
    const slot = series.definitionSlots.get(definitionChoice.read()), unit = ctx.mapping.payload.mapping.indicators[slot]?.unit;
    if (unit?.kind !== "defined") throw new Error("This indicator has an unknown unit. Make an explicit new mapping before actual measurement.");
    if (unit.quantityKind === "count" && input.value !== null && (!Number.isInteger(input.value) || input.value < 0)) throw new Error("A count must be a nonnegative integer.");
    if (unit.quantityKind === "percentage" && input.value !== null && (input.value < 0 || input.value > 100)) throw new Error("A percentage must be from 0 through 100.");
    if (unit.quantityKind === "rate" && input.value !== null && input.value < 0) throw new Error("A rate must be nonnegative.");
    if (["rate", "percentage"].includes(unit.quantityKind) && (!unit.denominatorDefinition || input.denominator === null || input.denominator <= 0)) throw new Error("A rate or percentage needs its approved denominator definition and an explicit positive measured denominator, including when the value is missing.");
    if (input.denominator !== null && input.denominator < 0) throw new Error("A measured denominator cannot be negative.");
    if (input.value !== null && missingReason.read() !== "") throw new Error("Known values use no missing reason. Keep 0 as a known zero.");
    if (input.value === null && !input.missingReason?.trim()) throw new Error("A missing value requires an explicit reason.");
    return input;
  }
  const measurementForm = form("measurement-form", "3. Enter a repeated observation or a correction draft", [
    node("p", {}, "Every point is explicitly authored. Actual periods differ from source update, review, export and receipt dates. Source narratives and baseline strings are never parsed into numbers."),
    definitionChoice.wrapper, measurementTitle.wrapper, value.wrapper, denominator.wrapper, actualStart.wrapper, actualEnd.wrapper, actualMethod.wrapper, evidence.wrapper, measurementUrl.wrapper, locatorKind.wrapper, locator.wrapper, missingReason.wrapper, measurementLimits.wrapper, replacesChoice.wrapper, correctionReason.wrapper,
  ], "Preview observation / correction draft", async (token) => {
    const ownSerial = serial, measurement = measurementInput(); let body;
    if (replacesChoice.read()) {
      const point = series.points.find((point) => point.recordId === replacesChoice.read());
      if (!point) throw new Error("Choose a retained point from this exact mapping.");
      body = { kind: "correction", input: { measurement, replaces: historicalPointPin(point), reason: correctionReason.read() } };
    } else body = { kind: "measurement", input: measurement };
    await showPreview(await call("previewLearningMeasurement", [org, body], token), token, ownSerial);
  });
  const correctionHost = node("div"), correctionReasons = new Map();
  function renderCorrections() {
    correctionHost.replaceChildren(panel("Pending correction attempts", node("p", {}, "A correction draft does not replace a point. A wrong or trashed draft can be deliberately abandoned without approving it. After abandonment, trash that ordinary draft explicitly; then create a fresh attempt. Only an independently approved supported candidate can be applied."),
      series.pending.length ? series.pending.map((event) => {
        const candidate = resolved(event.payload.record.recordId);
        const currentMapping = event.payload.input.measurement.mappingEventSha256 === context.mapping.sha256;
        if (!correctionReasons.has(event.sha256)) correctionReasons.set(event.sha256, input(`abandon-${event.sha256}`, "Reason for deliberately abandoning this attempt", { type: "textarea", max: 2000 }));
        const reason = correctionReasons.get(event.sha256);
        return node("section", { class: "learning-attempt" }, facts([["Attempt SHA-256", event.sha256], ["Questioned point", event.payload.input.replaces.recordId], ["Candidate", event.payload.record.recordId]]), recordLink("outcomes", event.payload.record.recordId, "Open candidate for the ordinary workflow"),
          !currentMapping && node("p", {}, "This attempt belongs to an earlier mapping. It can be deliberately abandoned; it cannot be applied to the current mapping."),
          jsonView("Exact pending correction", event.payload), reason.wrapper,
          makeButton("Preview deliberate abandonment", async (token) => { const ownSerial = serial; await showPreview(await call("previewLearningCorrectionAbandon", [org, { head: needContext().binding.head, correctionEventSha256: event.sha256, reason: reason.read() }], token), token, ownSerial); }),
          makeButton("Preview applying this approved replacement", async (token) => { if (!currentMapping) throw new Error("An earlier-mapping attempt can only be deliberately abandoned."); const ownSerial = serial; await showPreview(await call("previewLearningCorrectionApply", [org, { head: needContext().binding.head, correctionEventSha256: event.sha256, replacement: requirePin(candidate) }], token), token, ownSerial); }, { disabled: !currentMapping || !candidate?.eligibility?.eligible }));
      }) : node("p", {}, "No active pending correction attempts in this loaded context."),
      [...series.abandoned].map((id) => {
        const record = resolved(id)?.record;
        if (!record) return node("p", {}, `${id} — abandoned candidate currently unavailable.`);
        const trashAck = node("input", { type: "checkbox" });
        const trash = makeButton("Trash this abandoned ordinary draft", async (token) => {
          needContext();
          await call("deleteRecord", [org, "outcomes", id, record.revision], token);
          onChanged(); contextStale = true; say("The abandoned candidate was explicitly trashed. Reload context before entering a fresh correction.");
        }, { disabled: true });
        trashAck.addEventListener("change", () => { trash.disabled = !trashAck.checked; });
        return node("div", { class: "learning-attempt" }, recordLink("outcomes", id, record.data.title), node("label", { class: "learning-check" }, trashAck, "I deliberately want to trash this abandoned ordinary candidate."), trash);
      })));
  }
  const decisionPoints = node("div", { class: "learning-check-list", "data-learning": "decision-points" });
  const discussionDefinitions = node("div", { class: "learning-check-list", "data-learning": "discussion-definitions" });
  let pointChecks = [], definitionChecks = [];
  const decisionTitle = input("decision-title", "Review decision title", { max: 180, required: true });
  const decisionAction = input("decision-action", "Deliberate action", { value: "", choices: [["", "Choose the action…"], ...actions] });
  const ruleResult = input("decision-rule-result", "Authored rule assessment", { value: "unassessable", choices: ["met", "not-met", "unassessable", "not-adopted"] });
  const ruleExplanation = input("decision-rule-explanation", "Rule assessment explanation", { type: "textarea", required: true });
  const departure = input("decision-departure", "Reason for departing from a declared planned action", { type: "textarea", max: 2000 });
  const feedbackStatus = input("decision-feedback-status", "Actual feedback status", { value: "unknown", choices: ["collected", "not-collected", "unknown"] });
  const feedbackSummary = input("decision-feedback", "Actual feedback summary and limitations", { type: "textarea", required: true });
  const feedbackUrl = input("decision-feedback-url", "Actual feedback HTTPS source (empty means unknown)", { type: "url", max: 1200 });
  const decisionUncertainty = input("decision-uncertainty", "Review uncertainty and rival explanations", { type: "textarea", required: true });
  const decisionHarms = input("decision-harms", "Observed or possible harms and safeguards", { type: "textarea", required: true });
  const followUp = input("decision-follow-up", "Explicit follow-up day", { type: "date", required: true });
  const noEvidenceReason = input("decision-no-evidence", "Reason for selecting no observations", { type: "textarea", max: 2000, help: "Required for a zero-observation decision. A real measured 0 is an observation." });
  function readDecision() {
    const ctx = needContext();
    const chosenPoints = pointChecks.filter(({ control }) => control.checked);
    const points = chosenPoints.map(({ point }) => point);
    if (points.length > 100) throw new Error("Select at most 100 observations.");
    if (points.some((point) => !series.selectable.some((current) => current.recordId === point.recordId))) throw new Error("A previously chosen observation is no longer an eligible leaf in this loaded context. Deliberately deselect it; the earlier choice was kept.");
    const observations = chosenPoints.map(({ point, chosenPin }) => {
      const currentPin = pointPin(point);
      if (!chosenPin || stableLearning(chosenPin) !== stableLearning(currentPin)) throw new Error("An observation approval changed after selection. Deliberately deselect and reselect its exact current revision; your earlier choice was kept.");
      if (stableLearning(point.input.protocol) !== stableLearning(requirePin(series.protocol))) throw new Error("An observation's measurement-time protocol approval is no longer current. An explicit supported correction is required; the point is not silently retargeted.");
      return currentPin;
    });
    let discussedDefinitions;
    if (points.length) {
      const selected = new Map(points.map((point) => [point.input.definition.recordId, point.input.definition]));
      discussedDefinitions = series.definitions.filter((row) => selected.has(row.recordId)).map((row) => {
        const exact = selected.get(row.recordId);
        if (stableLearning(requirePin(row)) !== stableLearning(exact)) throw new Error("A measurement's approved definition pin is no longer current. Create an explicit compatible correction or remap; the old measurement is not silently retargeted.");
        return exact;
      });
      if (discussedDefinitions.length !== selected.size) throw new Error("The selected points include an unavailable definition.");
    } else discussedDefinitions = definitionChecks.filter(({ control }) => control.checked).map(({ resolution, chosenPin }) => {
      if (!series.definitions.some((current) => current.recordId === resolution.recordId)) throw new Error("A previously discussed definition is outside this mapping. Deliberately deselect it before a new decision.");
      const pin = requirePin(resolution);
      if (!chosenPin || stableLearning(pin) !== stableLearning(chosenPin)) throw new Error("A discussed definition approval changed. Deliberately deselect and reselect its exact current revision.");
      return pin;
    });
    if (!discussedDefinitions.length || discussedDefinitions.length > 10) throw new Error("Choose one to ten approved definitions to discuss. With selected points their exact measurement-time definition pins determine the set.");
    if (!points.length && !noEvidenceReason.read().trim()) throw new Error("A zero-observation decision needs an explicit no-evidence reason.");
    const rule = ctx.mapping.payload.mapping.basis.rule;
    const expected = ruleResult.read() === "met" ? rule.whenMet : ruleResult.read() === "not-met" ? rule.whenNotMet : null;
    const departureReason = expected && expected !== decisionAction.read() ? departure.read() : null;
    if (expected && expected !== decisionAction.read() && !departureReason.trim()) throw new Error("The selected action departs from the declared plan. Explain the departure explicitly.");
    return { head: ctx.binding.head, mappingEventSha256: ctx.mapping.sha256, program: requirePin(ctx.program), protocol: requirePin(series.protocol), observations, discussedDefinitions, title: decisionTitle.read(), action: decisionAction.read(), assessment: { result: ruleResult.read(), explanation: ruleExplanation.read(), departureReason }, feedback: { status: feedbackStatus.read(), summary: feedbackSummary.read(), sourceUrl: nullable(feedbackUrl.read()) }, uncertainty: decisionUncertainty.read(), harms: decisionHarms.read(), followUp: closedPeriod(followUp.read(), followUp.read()).startDate, noEvidenceReason: points.length ? null : noEvidenceReason.read() };
  }
  const decisionForm = form("decision-form", "4. Review evidence and record a deliberate decision", [
    node("p", {}, "Read the original source rule, adopted intent and planned actions in the current context. Assess the rule explicitly; no threshold, causal finding or community consent is inferred from prose."),
    node("h3", {}, "Select current eligible leaf observations (0–100)"), decisionPoints,
    node("h3", {}, "Definitions discussed (explicitly choose for zero observations)"), discussionDefinitions,
    decisionTitle.wrapper, decisionAction.wrapper, ruleResult.wrapper, ruleExplanation.wrapper, departure.wrapper, feedbackStatus.wrapper, feedbackSummary.wrapper, feedbackUrl.wrapper, decisionUncertainty.wrapper, decisionHarms.wrapper, followUp.wrapper, noEvidenceReason.wrapper,
  ], "Preview this review decision", async (token) => {
    const ownSerial = serial, input = readDecision();
    await showPreview(await call("previewLearningDecision", [org, input], token), token, ownSerial);
  });
  const approvedDecision = input("report-decision", "Exact independently approved decision", { choices: [["", "Load a binding context…"]] });
  function renderEvidenceChoices() {
    options(definitionChoice.control, series.definitions.map((resolution) => [resolution.recordId, `${resolution.record.data.title} · ${resolution.eligibility.eligible ? "eligible" : resolution.eligibility.message}`]), "Choose exact indicator definition…");
    const pendingTargets = new Set(series.pending.flatMap((event) => [event.payload.input.replaces.recordId, event.payload.record.recordId]));
    options(replacesChoice.control, series.points.filter((point) => !series.replaced.has(point.recordId) && !series.abandoned.has(point.recordId) && !pendingTargets.has(point.recordId)).map((point) => [point.recordId, `${point.resolution?.record?.data.title || point.recordId} · ${point.input.period.startDate}–${point.input.period.endDate} · ${point.resolution?.eligibility?.eligible ? "current approved" : "historical proof required"}`]), "New repeated observation, no correction");
    const previousPoints = pointChecks.filter(({ control }) => control.checked);
    const checkedPoints = new Set(previousPoints.map(({ point }) => point.recordId));
    const previousDefinitions = definitionChecks.filter(({ control }) => control.checked);
    const checkedDefinitions = new Set(previousDefinitions.map(({ resolution }) => resolution.recordId));
    const selectable = new Set(series.selectable.map((point) => point.recordId));
    const displayedPoints = [...series.selectable, ...previousPoints.map(({ point }) => point).filter((point) => !selectable.has(point.recordId))];
    pointChecks = displayedPoints.map((point) => {
      const control = node("input", { type: "checkbox", checked: checkedPoints.has(point.recordId), "data-learning-point": point.recordId });
      const previous = previousPoints.find((row) => row.point.recordId === point.recordId);
      const row = { point, control, chosenPin: previous?.chosenPin || null };
      control.addEventListener("change", () => { row.chosenPin = control.checked ? point.resolution?.pin : null; changed(); });
      return row;
    });
    decisionPoints.replaceChildren(...(pointChecks.length ? pointChecks.map(({ point, control }) => node("label", { class: "learning-check" }, control, `${point.resolution?.record?.data.title || point.recordId} · ${point.input.period.startDate}–${point.input.period.endDate} · value ${point.input.value === null ? "Missing" : point.input.value} · ${point.recordId}${selectable.has(point.recordId) ? "" : " — prior choice kept; no longer eligible here; deliberately deselect"}`)) : [node("p", {}, "No current eligible leaf observations. Explicitly discuss definitions and state the no-evidence reason if proceeding without observations.")]));
    const currentDefinitionIds = new Set(series.definitions.map((row) => row.recordId));
    const displayedDefinitions = [...series.definitions, ...previousDefinitions.map((row) => row.resolution).filter((row) => !currentDefinitionIds.has(row.recordId))];
    definitionChecks = displayedDefinitions.map((resolution) => {
      const checked = checkedDefinitions.has(resolution.recordId);
      const control = node("input", { type: "checkbox", checked, disabled: !resolution.eligibility.eligible && !checked, "data-learning-definition": resolution.recordId });
      const row = { resolution, control, chosenPin: previousDefinitions.find((old) => old.resolution.recordId === resolution.recordId)?.chosenPin || null };
      control.addEventListener("change", () => { row.chosenPin = control.checked ? resolution.pin : null; changed(); });
      return row;
    });
    discussionDefinitions.replaceChildren(...definitionChecks.map(({ resolution, control }) => node("label", { class: "learning-check" }, control, `${currentDefinitionIds.has(resolution.recordId) ? `Slot ${series.definitionSlots.get(resolution.recordId) + 1}` : "Prior choice outside this mapping; deliberately deselect"}: ${resolution.record.data.title} · ${resolution.recordId} · revision ${resolution.record.revision} · ${resolution.eligibility.message}`)));
    options(approvedDecision.control, series.decisions.filter((row) => row.resolution?.eligibility.eligible).map((row) => [row.resolution.recordId, `${row.resolution.record.data.title} · ${row.resolution.recordId}`]), "Choose exact approved review decision…");
  }
  function selection(manifestRecordId) {
    const ctx = needContext(), row = series.decisions.find((item) => item.resolution?.recordId === approvedDecision.read());
    const decision = requirePin(row?.resolution), input = row.event.payload.input;
    for (const pin of [...input.observations, ...input.discussedDefinitions]) {
      if (stableLearning(requirePin(resolved(pin.recordId))) !== stableLearning(pin)) throw new Error("The approved decision's exact evidence pins are no longer current. A fresh supported decision is required; selection cannot silently substitute revisions.");
    }
    if (!sameHead(input.head, ctx.binding.head)) {
      // A later decision/freeze advances the head without changing the approved
      // discussion. Server verifies the immutable decision's mapping and closure.
      if (input.mappingEventSha256 !== ctx.mapping.sha256) throw new Error("Choose a decision from this exact mapping.");
    }
    return { head: ctx.binding.head, mappingEventSha256: ctx.mapping.sha256, program: requirePin(ctx.program), source: sourcePin(ctx.source), protocol: requirePin(series.protocol), definitions: input.discussedDefinitions, observations: input.observations, decision, manifestRecordId };
  }
  const manifestTitle = input("manifest-title", "Private report title", { max: 180, required: true });
  const manifestStart = input("manifest-start", "Report period starts", { type: "date", required: true });
  const manifestEnd = input("manifest-end", "Report period ends", { type: "date", required: true });
  const manifestSummary = input("manifest-summary", "Report summary", { type: "textarea", required: true });
  const manifestMissing = input("manifest-missingness", "Report missingness and limitations", { type: "textarea", required: true });
  const manifestIssue = input("manifest-issue", "Declared issue day (optional; this report is never issued automatically)", { type: "date" });
  const priorEdition = input("manifest-prior-edition", "Explicit previous report edition (optional)", { choices: [["", "First edition; no previous report"]] });
  const revisionReason = input("manifest-revision-reason", "Reason for a new edition", { type: "textarea", max: 2000 });
  const manifestId = input("manifest-id", "Existing learning manifest record ID", { max: 100, help: "Load a known ordinary reporting record after its standard approval. This is a record ID, never a pasted approval pin." });
  const manifestHost = node("div", { "data-learning": "manifest-state" });
  let reportSummaries = [], manifestUnknown = false;
  function manifestData() {
    const selected = selection(manifestRecord?.id || "pending");
    closedPeriod(manifestStart.read(), manifestEnd.read());
    return { title: manifestTitle.read(), kind: "template", programId: context.binding.programId, agreementId: null, outcomeIds: selected.observations.map((pin) => pin.recordId), financeIds: [], receiptIds: [], assemblyMethod: "learning-review-v1", sourceDigest: null, supersedesReportId: nullable(priorEdition.read()), revisionReason: priorEdition.read() ? revisionReason.read() : null, startDate: manifestStart.read(), endDate: manifestEnd.read(), summary: manifestSummary.read(), missingness: manifestMissing.read(), visibility: "private", issueDate: nullable(manifestIssue.read()) };
  }
  function showManifest(resolution) {
    const record = resolution.record;
    if (!record || record.moduleId !== "reporting" || record.data.assemblyMethod !== "learning-review-v1" || record.data.kind !== "template" || record.data.visibility !== "private") throw new Error("This is not an available private learning manifest.");
    manifestRecord = record; manifestId.control.value = record.id; manifestUnknown = false;
    manifestHost.replaceChildren(facts([["Manifest", record.id], ["State", record.status], ["Revision", record.revision], ["Current approval", resolution.eligibility.message], ["Source digest", record.data.sourceDigest]]), recordLink("reporting", record.id, "Open the standard reporting workflow for final-state approval"), jsonView("Complete saved manifest data", record.data, true));
  }
  const reportForm = form("manifest-form", "5. Prepare, save, approve and freeze a private report", [
    node("p", {}, "A report uses one exact approved decision and its approved discussion and observation pins. Preparation computes a digest without saving it. Save the digest explicitly, complete ordinary final-state approval using an eligible different account, reload that manifest, then review and freeze the complete report."),
    approvedDecision.wrapper, manifestTitle.wrapper, manifestStart.wrapper, manifestEnd.wrapper, manifestSummary.wrapper, manifestMissing.wrapper, manifestIssue.wrapper, priorEdition.wrapper, revisionReason.wrapper,
  ], "Create a new ordinary learning manifest draft", async (token) => {
    if (manifestUnknown) throw new Error("The earlier ordinary create response is unresolved. Load the ordinary Reporting records and explicitly select its saved manifest before another create; ordinary create has no learning command Retry key.");
    const ownSerial = serial, data = manifestData();
    try {
      const result = await call("createRecord", [org, "reporting", { data, ownerId: null }], token);
      if (!result.record?.id) { manifestUnknown = true; throw new Error("The ordinary manifest create response was incomplete. Discover the saved record before another create."); }
      manifestRecord = result.record; manifestId.control.value = result.record.id; prepared = null; finalSelection = null; onChanged();
      manifestHost.replaceChildren(node("p", {}, `Ordinary draft ${result.record.id} was saved${ownSerial === serial ? "" : "; your form changed during the request and remains unsaved"}.`), recordLink("reporting", result.record.id, "Open its ordinary reporting workflow"), jsonView("Exact saved manifest", result.record.data, true));
      say("Manifest draft saved. Explicitly prepare its exact selected evidence next; no digest or approval was invented.");
    } catch (error) {
      if (!error.status || error.status >= 500 || error.code === "invalid_response") manifestUnknown = true;
      throw error;
    }
  });
  reportForm.append(manifestId.wrapper,
    makeButton("Load known manifest and its exact approval", async (token) => {
      const selectedId = manifestId.read(); if (!selectedId) throw new Error("Enter the known ordinary manifest ID.");
      const result = await call("learningApproval", [org, selectedId], token);
      if (manifestId.read() !== selectedId) throw new Error("The manifest ID changed during loading.");
      showManifest(result.resolution); prepared = null; finalSelection = null;
      say("Current manifest and exact approval eligibility loaded. Its literal authored fields above are kept.");
    }),
    makeButton("Save authored fields to this draft as a new ordinary revision", async (token) => {
      if (!manifestRecord) throw new Error("Load the exact manifest first.");
      if (manifestUnknown) throw new Error("Resolve the earlier ordinary save by explicitly loading its current record before saving again.");
      const data = manifestData(), id = manifestRecord.id;
      try {
        const result = await call("updateRecord", [org, "reporting", id, { revision: manifestRecord.revision, data, ownerId: manifestRecord.ownerId }], token);
        if (!result.record?.id) throw new Error("The ordinary save response is incomplete. Reload its known record before saving again.");
        manifestRecord = result.record; prepared = null; finalSelection = null; onChanged();
        manifestHost.replaceChildren(node("p", {}, `Saved ordinary revision ${result.record.revision}. Approval is required again.`), recordLink("reporting", id));
        say("Authored manifest fields saved. Prepare its exact selection again.");
      } catch (error) { if (!error.status || error.status >= 500 || error.code === "invalid_response") manifestUnknown = true; throw error; }
    }),
    makeButton("Prepare exact selection digest (does not save)", async (token) => {
      if (!manifestRecord || manifestUnknown) throw new Error("Load a known current manifest first.");
      const ownSerial = serial, selected = selection(manifestRecord.id);
      const result = await call("prepareLearningReport", [org, { selection: selected, manifestRevision: manifestRecord.revision }], token);
      if (ownSerial !== serial) throw new Error("The selection changed during preparation. Prepare it again.");
      if (!/^[a-f0-9]{64}$/.test(result.sourceDigest || "") || !result.manifest || typeof result.requiresSave !== "boolean" || typeof result.requiresApproval !== "boolean" || !Array.isArray(result.exclusions)) throw new Error("The preparation response is incomplete.");
      prepared = { ...result, selection: selected, serial: ownSerial }; finalSelection = null;
      manifestHost.replaceChildren(facts([["Computed source digest", result.sourceDigest], ["Requires explicit save", result.requiresSave], ["Requires final-state approval", result.requiresApproval]]), jsonView("Exact prepared selection and exclusions", { selection: selected, exclusions: result.exclusions }, true), recordLink("reporting", manifestRecord.id, "Open standard final-state approval after explicitly saving this digest"));
      say(result.requiresSave ? "Prepared only. Save this exact digest explicitly, then approve the new final-state revision." : "Prepared only. Load the exact eligible final-state manifest approval before the final preview.");
    }, { "data-learning": "prepare-report" }),
    makeButton("Save this prepared digest as an ordinary new revision", async (token) => {
      if (!prepared || prepared.serial !== serial || !manifestRecord) throw new Error("Prepare the current exact selection first.");
      if (manifestUnknown) throw new Error("Reload the known manifest after its unresolved ordinary save before trying again.");
      const ownPrepared = prepared;
      try {
        const result = await call("updateRecord", [org, "reporting", manifestRecord.id, { revision: manifestRecord.revision, ownerId: manifestRecord.ownerId, data: { ...manifestRecord.data, sourceDigest: ownPrepared.sourceDigest } }], token);
        if (!result.record?.id) throw new Error("The digest save response is incomplete. Reload the known manifest before another save.");
        manifestRecord = result.record; prepared = null; finalSelection = null; onChanged();
        manifestHost.replaceChildren(node("p", {}, `Digest saved in ordinary revision ${result.record.revision}. Complete final-state approval, then explicitly reload this known manifest.`), recordLink("reporting", result.record.id));
        say("Digest saved explicitly. Final-state approval is still required; no approval was granted here.");
      } catch (error) { if (!error.status || error.status >= 500 || error.code === "invalid_response") manifestUnknown = true; throw error; }
    }),
    makeButton("Preview the complete report with current approved manifest", async (token) => {
      if (!manifestRecord || manifestUnknown) throw new Error("Load the exact current approved manifest first.");
      const ownSerial = serial, selected = selection(manifestRecord.id);
      const response = await call("learningApproval", [org, manifestRecord.id], token);
      const manifest = requirePin(response.resolution);
      if (response.resolution.record.data.sourceDigest === null) throw new Error("Prepare and explicitly save the exact digest before approval and freeze.");
      finalSelection = { selection: selected, manifest, sourceDigest: response.resolution.record.data.sourceDigest };
      await showPreview(await call("previewLearningReport", [org, finalSelection], token), token, ownSerial);
    }, { "data-learning": "preview-report" }), manifestHost);

  const outputPanel = panel("Saved private reports", node("label", {}, "Exact report", reportChoice),
    makeButton("Load / refresh report summaries", async (token) => {
      reportSummaries = await loadPage("reports", false, token);
      options(priorEdition.control, reportSummaries.map((row) => [row.id, `${row.title} · ${row.id} · ${row.checksum}`]), "First edition; no previous report");
    }),
    makeButton("More reports", async (token) => {
      if (!listCursors.reports) throw new Error("No next report page. Load the list first.");
      reportSummaries.push(...await loadPage("reports", true, token));
      options(priorEdition.control, reportSummaries.map((row) => [row.id, `${row.title} · ${row.id} · ${row.checksum}`]), "First edition; no previous report");
    }),
    makeButton("Read selected private report", async (token) => {
      const id = reportChoice.value; if (!id) throw new Error("Choose the exact saved report.");
      verifiedReport = null; reportHost.replaceChildren(); cleanupPrint();
      const result = await call("learningReport", [org, id], token);
      const report = await step(checkedLearningReport(result.report), token);
      if (id !== reportChoice.value || report.orgId !== org || report.id !== id) throw new Error("The report choice changed or its identity does not match.");
      verifiedReport = report; reportHost.replaceChildren(learningReportView(report)); say("Saved private report checksum verified and displayed as text.");
    }),
    makeButton("Download selected private report JSON", async (token) => {
      if (!canExport) throw new Error("Current role does not allow export of all required source modules.");
      const id = reportChoice.value; if (!id) throw new Error("Choose the exact saved report.");
      verifiedReport = null; reportHost.replaceChildren(); cleanupPrint();
      const report = await step(checkedLearningReport(await call("exportLearningReport", [org, id], token)), token);
      if (id !== reportChoice.value || report.id !== id || report.orgId !== org) throw new Error("The exact report selection changed.");
      const text = `${JSON.stringify(report, null, 2)}\n`;
      if (downloadOutput) downloadOutput(`learning-${report.id}.json`, text);
      else {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" })); urls.add(url);
        const link = node("a", { href: url, download: `learning-${report.id}.json` }); document.body.append(link); link.click(); link.remove();
        setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 10000);
      }
      say("Private JSON download requested from the verified saved report. Selected report JSON is not a full workspace restore input.");
    }, { disabled: !canExport, "data-learning": "export-report" }),
    makeButton("Print selected private report", async (token) => {
      if (!canExport) throw new Error("Current role does not allow private report output.");
      const id = reportChoice.value; if (!id) throw new Error("Choose an exact saved report.");
      verifiedReport = null; reportHost.replaceChildren(); cleanupPrint();
      // Reauthorize a fresh saved read. The old on-screen response is not print authority.
      const result = await call("learningReport", [org, id], token);
      const report = await step(checkedLearningReport(result.report), token);
      if (id !== reportChoice.value || report.id !== id || report.orgId !== org) throw new Error("The report choice changed.");
      if (printOutput) printOutput(report);
      else {
        cleanupPrint();
        printFrame = node("iframe", { title: "Private learning report print", class: "learning-print-frame" }); document.body.append(printFrame);
        const target = printFrame.contentDocument;
        if (!target?.body) throw new Error("The private print surface could not be opened.");
        target.title = report.title;
        target.body.append(learningReportView(report));
        const style = target.createElement("style"); style.textContent = "body{font:12pt/1.5 system-ui;color:#111;margin:18mm}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:9pt/1.4 monospace}details{display:block}summary{font-weight:700}dt{font-weight:700}dd{margin:0 0 8pt}h2,h3{break-after:avoid}a{color:inherit}"; target.head.append(style);
        for (const details of target.querySelectorAll("details")) details.open = true;
        const win = printFrame.contentWindow; win.addEventListener("afterprint", cleanupPrint, { once: true });
        assertCurrent(token); printInProgress = true;
        try { win.print(); } finally { printInProgress = false; }
      }
      say("Private print requested from a freshly authorized, verified report.");
    }, { disabled: !canExport, "data-learning": "print-report" }), reportHost);

  const recoveredChoice = node("select", { "data-learning": "recovered-choice" }); options(recoveredChoice, [], "Load historical recovery summaries…");
  const recoveredHost = node("div");
  const recoveredPanel = adminRoles.has(role) ? panel("Inactive full-backup recovery", node("p", {}, "Full workspace backup and native Save/restore remain in Data and backups. Imported learning history is historical-only; it does not revive approvals, reservations, measurements or report authority. Adoption explicitly creates a fresh live binding and fresh draft definitions/protocols."),
    node("a", { href: "#data" }, "Open full workspace backup and restore"),
    makeButton("Load recovered-only summaries", async (token) => { await loadPage("recovered", false, token); }),
    node("label", {}, "Exact recovered head", recoveredChoice),
    makeButton("More recovered summaries", async (token) => { if (!listCursors.recovered) throw new Error("No next recovered page."); await loadPage("recovered", true, token); }),
    makeButton("Read exact recovered closure", async (token) => {
      const hash = recoveredChoice.value; if (!hash) throw new Error("Choose an exact recovered head.");
      recovered = null; recoveredHost.replaceChildren();
      const result = await call("learningRecoveredHead", [org, hash], token);
      if (hash !== recoveredChoice.value || result.binding?.head?.eventSha256 !== hash || result.binding.originMode !== "recovered" || !result.mapping?.payload?.mapping || !result.source || !result.history) throw new Error("The recovered closure identity is incomplete.");
      if (new TextEncoder().encode(JSON.stringify(result)).length > 64 * 1024 * 1024) throw new Error("The historical closure exceeds its 64 MiB reader bound.");
      recovered = result;
      recoveredHost.replaceChildren(node("p", { class: "notice" }, "Historical-only material. No active approval or print/export authority is restored."), facts([["Recovered head", hash], ["Original program", result.binding.programId], ["Original source receipt", result.source.receivedAt]]), jsonView("Historical source", result.source, true), jsonView("Historical mapping", result.mapping, true), jsonView("Complete recovered provenance (inactive)", result.history));
      say("Exact historical closure loaded. Select its source for a fresh adoption deliberately below.");
    }),
    makeButton("Use this historical source for fresh draft adoption", async () => {
      if (!recovered || recovered.binding.head.eventSha256 !== recoveredChoice.value) throw new Error("Read the exact recovered closure first.");
      mappingMode = "adopt-recovered"; mappingSource = recovered.source; inspection = null; configureBasisSource(mappingSource); renderSource(mappingSource); changed();
      say("Historical source selected for a fresh adoption. Explicitly choose the destination program and re-enter or adapt all mapping fields; no old point or approval is reused.");
    }), recoveredHost) : null;

  writeArea.append(sourceForm, mappingForm, measurementForm, correctionHost, decisionForm);
  if (canExport) writeArea.append(reportForm);
  privateBody.append(overview, contextHost, writeArea, previewHost, savedHost);
  privateBody.append(canExport ? outputPanel : panel("Private report permission", node("p", {}, "Report preparation, reading, download and print require current read and export permission on programs, outcomes, evaluation and reporting. The contributor role does not gain export authority.")));
  if (recoveredPanel) privateBody.append(recoveredPanel);
  if (!canWrite) say("Current role can read authorized learning material. Authored changes require the existing outcomes and evaluation write permissions.");
  if (typeof document !== "undefined" && document.head && !document.querySelector('link[data-learning-style]')) document.head.append(node("link", { rel: "stylesheet", href: "./learning.css", "data-learning-style": "true" }));
  const onPageHide = () => invalidate({ clear: true });
  const onPageShow = (event) => { if (event.persisted && current()) { invalidate({ clear: true }); say("This private view was restored from browser history. Reopen Learning and review to reauthorize it."); } };
  // The browser's own print dialog can blur its opener. Keep the document until
  // afterprint; later focus/blur, navigation and disposal clean any fallback.
  const onBlur = () => { if (printFrame && !printInProgress) cleanupPrint(); };
  const onFocus = () => { if (printFrame && !printInProgress) cleanupPrint(); };
  globalThis.window?.addEventListener("pagehide", onPageHide);
  globalThis.window?.addEventListener("pageshow", onPageShow);
  globalThis.window?.addEventListener("blur", onBlur);
  globalThis.window?.addEventListener("focus", onFocus);
  root.invalidate = () => invalidate();
  root.dispose = () => {
    if (disposed) return;
    invalidate({ clear: true }); disposed = true;
    globalThis.window?.removeEventListener("pagehide", onPageHide);
    globalThis.window?.removeEventListener("pageshow", onPageShow);
    globalThis.window?.removeEventListener("blur", onBlur);
    globalThis.window?.removeEventListener("focus", onFocus);
    onDirty(false);
  };
  return root;
}
