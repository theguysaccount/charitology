// Manual directory review. Proofs, exact proposals and retry keys live only in this mount.
import { moneyFromMajor } from "./model.js";
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const own = (v) => JSON.parse(JSON.stringify(v));
const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);
export function directorySelectionFromFragment(fragment) {
  if (typeof fragment !== "string") return null;
  const m = fragment.match(/^#?directory\/(tools|benefits)\/([a-z0-9][a-z0-9-]{0,63})\/([a-f0-9]{64})\/([a-f0-9]{64})$/);
  return m ? { catalogKind: m[1], listingId: m[2], captureId: m[3], entrySha256: m[4] } : null;
}
export function directoryFragment(selection) {
  const value = `#directory/${selection.catalogKind}/${selection.listingId}/${selection.captureId}/${selection.entrySha256}`;
  if (!directorySelectionFromFragment(value)) throw new Error("Choose an exact directory source.");
  return value;
}
export async function directoryHash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
}
const n = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (["disabled", "checked", "selected", "required"].includes(key)) el[key] = !!value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) el.append(typeof child === "object" ? child : document.createTextNode(String(child)));
  return el;
};
const clean = values => values.flat(Infinity).filter(v => v !== null && v !== undefined && v !== false);
const replace = (el, ...children) => el.replaceChildren(...clean(children));
const appendContent = (el, ...children) => el.append(...clean(children));
const button = (text, handler, attrs = {}) => n("button", { type: "button", class: "button", onclick: handler, ...attrs }, text);
let labelId = 0;
const field = (text, control, help) => {
  control.id ||= `directory-field-${++labelId}`;
  return n("div", { class: "field" }, n("label", { for: control.id }, text), control, help ? n("p", { class: "field-help" }, help) : null);
};
const select = (values, current = "") => n("select", {}, values.map(([value, label]) => n("option", { value, selected: value === current }, label)));
const input = (attrs = {}) => n("input", attrs);
const pre = (value) => n("pre", { style: "white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%" }, typeof value === "string" ? value : JSON.stringify(value, null, 2));
const details = (title, body) => n("details", {}, n("summary", {}, title), body);
const sourceLabels = [ ["summary", "Summary"], ["costType", "Cost model"], ["cost", "Cost description"], ["delivery", "Delivery"], ["fit", "Possible fit"], ["eligibility", "Eligibility description"], ["limits", "Limits"] ];
const warningText = {
  "historical-selection": "You selected a historical source version.",
  "source-date-unknown": "The directory source checked date is unknown.",
  "newer-version": "The bundled directory has a changed entry. This preview keeps your exact selection.",
  "listing-absent-from-head": "This listing is absent from the current directory head.",
  "editorial-draft": "Editorial source review is pending.",
  "preserved-old-prose": "Existing limitations retain an older directory block.",
  "unstructured-prose": "Existing limitations are organization text with no mapped prose ownership.",
  "unbound-assessment": "A prior organization declaration is not bound to this working data and source.",
  "working-data-changed": "Working data changed after the prior declaration.",
  "restore-since-assessment": "The Resource was restored after the prior declaration.",
  "renewal-date-passed": "The declared renewal date has passed.",
};

export const DIRECTORY_VISIBILITY_NOTICE = "Resources belong to the whole organization. Program scopes do not narrow Resource visibility; role permissions still decide what each member can read.";

export function createDirectoryCatalogPicker({ api, isCurrent = () => true, hash = directoryHash }) {
  const status = n("p", { role: "status" });
  const host = n("div", { class: "stack" });
  const element = n("section", { class: "panel stack", "data-directory-catalog-picker": "true" },
    n("h2", {}, "Copy from the public directory"),
    n("p", {}, DIRECTORY_VISIBILITY_NOTICE),
    n("p", {}, "Choose a current frozen listing, inspect its full source, then choose the destination organization and preview a Resource copy."),
    button("Browse current directory listings", load), status, host);
  let busy = false;
  async function load() {
    if (busy || !isCurrent()) return;
    busy = true;
    status.textContent = "Reading bundled directory listings…";
    replace(host);
    try {
      let cursor, registryHash, headId, capture;
      const cursors = new Set();
      do {
        const result = await api.directoryCatalogs(cursor);
        if (!isCurrent()) return;
        if (!HEX.test(result.registrySha256 || "") || !HEX.test(result.head?.captureId || "")) throw new Error("The directory index could not be verified.");
        if (registryHash && (registryHash !== result.registrySha256 || headId !== result.head.captureId)) throw new Error("The directory changed while it was being read. Browse it again.");
        registryHash = result.registrySha256;
        headId = result.head.captureId;
        capture = result.captures?.find(item => item.captureId === headId);
        cursor = result.nextCursor;
        if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new Error("The directory index repeated a page. Browse it again.");
        if (cursor) cursors.add(cursor);
      } while (!capture && cursor);
      if (!capture?.core || !Array.isArray(capture.core.catalogs)) throw new Error("The current bundled directory capture is unavailable.");
      const digest = await hash({ namespace: "charitology:directory-capture:v1", core: capture.core });
      if (!isCurrent()) return;
      if (digest !== headId) throw new Error("The directory capture hash did not match.");
      const choices = capture.core.catalogs.flatMap(catalog => catalog.entries.map(entry => {
        const selection = { captureId: headId, catalogKind: catalog.kind, listingId: entry.listingId, entrySha256: entry.entrySha256 };
        return [directoryFragment(selection), `${catalog.kind === "tools" ? "Tool" : "Benefit"} · ${entry.listingId}`];
      }));
      const listing = select([["", "Choose a listing…"], ...choices]);
      listing.setAttribute("data-directory-catalog-selection", "true");
      const review = n("a", { class: "button", "aria-disabled": "true" }, "Review selected listing for an organization");
      listing.addEventListener("change", () => {
        if (isCurrent() && choices.some(([value]) => value === listing.value)) {
          review.setAttribute("href", listing.value);
          review.setAttribute("aria-disabled", "false");
        } else { review.removeAttribute("href"); review.setAttribute("aria-disabled", "true"); }
      });
      replace(host, field("Current frozen listing", listing, "The exact listing ID appears here. The next screen shows its complete source and name."), review);
      status.textContent = `${choices.length} listings in the current bundled capture, saved ${capture.core.capturedAt}. Nothing has been copied.`;
    } catch (error) { if (isCurrent()) status.textContent = error.message; }
    finally { busy = false; }
  }
  return { element };
}

export function createDirectoryResourceWorkspace({
  orgId, api, initialSelection = null, record = null, currencies = {}, canExport = false,
  isCurrent = () => true, editorOpen = () => false, onDirty = () => {},
  onSaved = () => {}, onTrash = () => {}, onError = () => {}, onReload = null, download = () => {},
  confirmSourceChange = async () => false,
  now = () => Date.now(), randomUUID = () => crypto.randomUUID(), hash = directoryHash,
}) {
  let version = 0, disposed = false, busy = false, inspectionRequired = false, selected = null, source = null,
    panel = null, ready = null, pending = null, timer = null, nextCursor = null, staleRecord = false, draftDirty = false;
  const element = n("section", { class: "panel stack", "data-directory-workspace": "true" });
  const status = n("p", { role: "status", "aria-live": "polite", style: "overflow-wrap:anywhere" });
  const sourceHost = n("div", { class: "stack" }), evidenceHost = n("div", { class: "stack" }),
    formHost = n("div", { class: "stack" }), previewHost = n("div", { class: "stack" });
  const valid = (epoch = version) => !disposed && epoch === version && isCurrent() && !editorOpen();
  let readProposal = null;
  const clearProof = () => { ready = null; pending = null; clearTimeout(timer); timer = null; replace(previewHost, ); };
  const invalidate = () => { ++version; clearProof(); if (staleRecord && !disposed) showReload(); };
  const changed = () => {
    draftDirty = true;
    invalidate(); onDirty(true);
    status.textContent = staleRecord
      ? "The saved Resource changed. Your notes are still shown; copy them before reloading."
      : "Changes require a fresh preview. Nothing has been saved.";
  };
  // Input invalidates synchronously, before asynchronous digest/network continuations.
  formHost.addEventListener("input", changed);
  formHost.addEventListener("change", changed);
  function showReload() {
    replace(previewHost,
      n("p", {}, "Your unsaved directory choices and notes are still shown. Copy any text you need before reloading the saved Resource."),
      button("Reload current Resource", async () => { if (valid() && onReload) await onReload(); }, { "data-directory-reload": "true" }));
  }
  function failure(error) {
    if (record && error.status === 409) { staleRecord = true; showReload(); }
    status.textContent = error.message || "This review could not be completed.";
    if (error.status === 401 || error.status === 403) { invalidate(); replace(evidenceHost); replace(sourceHost); replace(formHost); }
    onError(error);
  }
  function lock(value) {
    busy = value;
    for (const control of element.querySelectorAll("input,select,textarea,button")) control.disabled = value;
  }
  function disposition(value) {
    const host = n("div", { class: "notice neutral", "data-directory-disposition": value?.kind || "unavailable" });
    if (value?.kind === "active-record" && value.record?.id) host.append(n("p", {}, "This directory identity already has a Resource. Open its current saved version to review it."), n("a", { href: `#module/resources/${encodeURIComponent(value.record.id)}`, class: "button" }, "Open current Resource"));
    else if (value?.kind === "trash") host.append(n("p", {}, "This directory identity is in recoverable trash. Review and restore the existing Resource before rechecking it."), button("Open Resource trash", onTrash));
    else host.append(n("p", {}, "Only historical provenance remains. It cannot be opened or restored as a current Resource here."));
    return host;
  }
  function renderSource(draft = null) {
    const l = source.entry.listing, c = source.comparison;
    const age = c.checkedAgeDays === null ? "Source checked age unknown." : `Source checked ${c.checkedAgeDays} ${c.checkedAgeDays === 1 ? "day" : "days"} before today's UTC date.`;
    replace(sourceHost, 
      n("h3", {}, l.name), n("p", {}, `${l.category} · ${selected.catalogKind === "tools" ? "Tool" : "Benefit"}`),
      n("p", { class: "fine" }, `${age} ${l.review === "reviewed" ? "Editorially reviewed." : "Editorial source review pending."}`),
      c.absentFromHead ? n("div", { class: "notice neutral" }, "This listing is absent from the current directory head. Availability is unknown.") : c.newerVersion ? n("div", { class: "notice neutral" }, "A changed entry is in the current directory head. Your selected source has not changed.") : null,
      n("dl", { class: "detail-fields" }, sourceLabels.map(([key, title]) => n("div", { class: "full-width" }, n("dt", {}, title), n("dd", {}, l[key])))), n("div", {}, n("a", { href: l.url, rel: "noopener" }, "Open listing provider link")),
      n("ul", {}, l.sources.map(s => n("li", {}, n("a", { href: s.url, rel: "noopener" }, s.label)))),
      details("Exact source identity", pre({ selection: selected, sourceCommit: source.core.sourceCommit, capturedAt: source.core.capturedAt, directoryChecked: l.checked, editorialReview: l.review })),
      button("Inspect this exact source again", async () => {
        if (busy) return;
        if (staleRecord) { status.textContent = "The saved Resource changed. Copy any unsaved text, then use Reload current Resource."; return; }
        await inspect(selected);
      }),
    );
    if (c.newerVersion && HEX.test(c.headEntrySha256 || "")) appendContent(sourceHost, button("Inspect current directory entry", async () => {
      if (busy) return;
      const selection = own(selected);
      invalidate(); inspectionRequired = true;
      const epoch = version;
      try {
        const catalogs = await api.directoryCatalogs();
        if (!valid(epoch)) return;
        await inspect({ ...selection, captureId: catalogs.head.captureId, entrySha256: c.headEntrySha256 });
      } catch (error) { if (valid(epoch)) failure(error); }
    }));
    renderForm(draft);
  }
  let captureDraft = () => null;
  function renderForm(draft = null) {
    clearProof();
    const copying = !record, l = source.entry.listing;
    const historical = input({ type: "checkbox", "data-directory-historical": "true" });
    const sourceChoice = select([["none", copying ? "No selected source URL" : "Clear source URL (only if selected below)"], ["listing", "Listing provider URL"], ...l.sources.map((s, i) => [`source:${i}`, `${s.label} — ${s.url}`])]);
    sourceChoice.setAttribute("data-directory-source-choice", "true");
    const mappedFields = new Map(["title", "catalogUrl", "sourceUrl"].map(k => [k, input({ type: "checkbox", checked: copying, "data-directory-copy-field": k })]));
    const ownership = select([["keep-current", "Keep the complete current limitations"], ["replace-mapped", "Replace the last mapped directory block"], ["replace-all", "Replace all limitations with this directory block and explicit notes"]], "keep-current");
    ownership.setAttribute("data-directory-ownership", "true");
    const notesMode = select([["keep", "Keep the stored organization notes"], ["set", "Set organization notes explicitly (blank clears them)"]], "keep");
    notesMode.setAttribute("data-directory-notes-mode", "true");
    const notes = n("textarea", { rows: 4, maxlength: 4000, "data-directory-notes": "true" });
    const assess = input({ type: "checkbox", "data-directory-assess": "true" });
    const provider = input({ maxlength: 240, "data-directory-provider": "true" });
    const eligibility = select([["unknown", "Unknown"], ["eligible", "Eligible (organization declaration)"], ["ineligible", "Ineligible (organization declaration)"]], "unknown");
    eligibility.setAttribute("data-directory-eligibility", "true");
    const reviewed = input({ type: "date", "data-directory-reviewed": "true" });
    const renewal = input({ type: "date", "data-directory-renewal": "true" });
    const reference = input({ maxlength: 240, "data-directory-reference": "true" });
    const costKind = select([["none", "No cost recorded"], ["unknown", "Unknown amount in a selected currency"], ["amount", "Exact amount (zero is allowed)"]], "none");
    costKind.setAttribute("data-directory-cost-kind", "true");
    const amount = input({ inputmode: "decimal", "data-directory-amount": "true" });
    const currency = select([["", "Choose a currency"], ...Object.keys(currencies).map(k => [k, k])]);
    currency.setAttribute("data-directory-currency", "true");
    const values = { sourceChoice, ownership, notesMode, notes, provider, eligibility, reviewed, renewal, reference, costKind, amount, currency };
    const checks = { historical, assess, ...Object.fromEntries([...mappedFields].map(([key, control]) => [`copy:${key}`, control])) };
    if (draft) {
      for (const [key, control] of Object.entries(values)) control.value = draft.values[key];
      for (const [key, control] of Object.entries(checks)) control.checked = draft.checks[key];
    }
    captureDraft = () => ({
      values: Object.fromEntries(Object.entries(values).map(([key, control]) => [key, control.value])),
      checks: Object.fromEntries(Object.entries(checks).map(([key, control]) => [key, control.checked])),
    });
    readProposal = () => {
      if (!valid()) throw new Error("This view changed. Inspect the Resource again.");
      if (source.comparison.historical && !historical.checked) throw new Error("Acknowledge this historical or absent directory version before previewing.");
      const copiedFields = copying ? ["title", "catalogUrl", "sourceUrl"] : [...mappedFields].filter(([, control]) => control.checked).map(([key]) => key);
      let choice = sourceChoice.value === "listing" ? { kind: "listing-url" } : sourceChoice.value.startsWith("source:") ? { kind: "source", index: Number(sourceChoice.value.slice(7)) } : null;
      if (!copiedFields.includes("sourceUrl")) choice = null;
      let assessment = null;
      if (!copying && assess.checked) {
        if (!copiedFields.includes("sourceUrl") || !choice) throw new Error("Select source URL and an exact provider source for an organization declaration.");
        if (!reviewed.value) throw new Error("Enter the organization's actual review date.");
        let cost = null;
        if (costKind.value !== "none") {
          const precision = currencies[currency.value];
          if (!Number.isInteger(precision)) throw new Error("Choose a supported currency for the cost declaration.");
          cost = costKind.value === "unknown" ? { minor: null, currency: currency.value, precision } : moneyFromMajor(amount.value, currency.value, precision);
        }
        assessment = { providerName: provider.value.trim() || null, eligibility: eligibility.value, reviewedDate: reviewed.value, renewalDate: renewal.value || null, cost, confirmationReference: reference.value.trim() || null };
      }
      const limitations = copying ? { kind: "replace-all", adoptionNotes: null } : ownership.value === "keep-current" ? { kind: "keep-current" } : ownership.value === "replace-all" ? { kind: "replace-all", adoptionNotes: notes.value.trim() || null } : { kind: "replace-mapped", notes: notesMode.value === "keep" ? { kind: "keep" } : { kind: "set", text: notes.value.trim() || null } };
      return { intent: copying ? "copy" : panel.binding.originMode === "recovered" ? "adopt-recovered" : "recheck", selection: own(selected), acceptHistoricalVersion: historical.checked, target: copying ? null : { recordId: record.id, revision: record.revision, historyHeadSha256: panel.binding.historyHeadSha256 }, copiedFields, sourceChoice: choice, limitations, assessment };
    };
    const form = n("form", { onsubmit: e => { e.preventDefault(); runPreview(); } },
      source.comparison.historical ? field("I deliberately selected this historical or absent version", historical) : null,
      field("Source URL to copy", sourceChoice, "Links are displayed for your review. The bridge does not fetch provider pages."),
      copying ? n("p", { class: "fine" }, "The copy starts discovered, with unknown eligibility. Provider name, organization review date, renewal date, cost and confirmation reference are empty. The directory date and cost text remain source prose.") : n("div", { class: "stack" },
        n("h3", {}, panel.binding.originMode === "recovered" ? "Adopt recovered provenance" : "Recheck this Resource"),
        n("p", {}, "Choose every mapped field to change. The Resource keeps its kind and owner. Existing approval is cleared; any frozen snapshot stays unchanged."),
        [...mappedFields].map(([k, control]) => field(`Replace ${k}`, control)),
        field("Limitations ownership choice", ownership, "Replacing a mapped block requires the complete current text to equal its last mapped rendering. Replacing all text requires an explicit choice and shows the full before and after."),
        field("Notes when replacing a mapped block", notesMode), field("Explicit organization adoption notes", notes, "For replace-all, blank means no notes. Notes are never inferred from existing text."),
        field("Record a fresh organization declaration", assess, "This is your organization's assessment. A directory listing supplies no eligibility, enrollment or provider verification."),
        details("Organization declaration fields", n("div", { class: "stack" }, field("Legal provider name, if known", provider), field("Declared eligibility", eligibility), field("Actual organization review date", reviewed), field("Renewal or deadline, if applicable", renewal), field("Confirmation reference, if any", reference), field("Cost declaration", costKind), field("Exact amount", amount), field("Currency", currency))),
      ),
      button("Preview Resource changes", runPreview, { class: "button primary", "data-directory-preview": "true" }),
    );
    replace(formHost, form);
  }
  async function inspect(selection) {
    if (!valid()) return false;
    const nextSelection = own(selection), identity = stable(nextSelection);
    const sameSource = selected && stable(selected) === identity;
    const needsDiscard = !sameSource && (draftDirty || ready || pending);
    invalidate(); inspectionRequired = true;
    let epoch = version;
    try {
      if (needsDiscard) {
        const confirmed = await confirmSourceChange();
        if (!valid(epoch)) return false;
        if (confirmed !== true) {
          status.textContent = "The source switch was canceled. Your exact directory choices and notes are still shown. Inspect the source before previewing again.";
          return false;
        }
      }
      const draft = sameSource ? captureDraft() : null;
      // Keep the existing form while reading. A failed or superseded inspection
      // must not destroy the user's only copy of unfinished organization text.
      invalidate(); epoch = version;
      status.textContent = "Inspecting the exact bundled directory entry…";
      const result = await api.directoryEntry(nextSelection);
      if (!valid(epoch)) return false;
      if (stable(result.selection) !== identity || result.entrySha256 !== nextSelection.entrySha256 || result.entry?.catalogKind !== nextSelection.catalogKind || result.entry?.listing?.id !== nextSelection.listingId || !result.comparison || !result.core) throw new Error("The service did not return this exact source. Nothing was previewed.");
      const digest = await hash({ namespace: "charitology:directory-entry:v1", entry: result.entry });
      if (!valid(epoch)) return false;
      if (digest !== nextSelection.entrySha256) throw new Error("The frozen source hash did not match. Nothing was previewed.");
      selected = nextSelection; source = own(result); inspectionRequired = false;
      if (!sameSource) draftDirty = false;
      renderSource(draft); status.textContent = "Source inspected. Review the proposal before making a copy or recheck.";
      return true;
    } catch (error) { if (valid(epoch)) failure(error); return false; }
  }
  async function runPreview() {
    if (busy || !readProposal || !valid()) return;
    if (staleRecord) { status.textContent = "The saved Resource changed. Copy any unsaved text, then use Reload current Resource."; return; }
    if (inspectionRequired) { status.textContent = "Inspect this exact source again before preparing another preview."; return; }
    clearProof();
    let proposal;
    try { proposal = own(readProposal()); } catch (error) { failure(error); return; }
    const epoch = version, identity = stable(proposal);
    lock(true); status.textContent = "Preparing a reviewable preview…";
    try {
      const result = await api.previewDirectoryResource(orgId, proposal);
      if (!valid(epoch) || stable(readProposal()) !== identity) return;
      if (result.kind === "existing") { replace(previewHost, disposition(result.disposition)); return; }
      const p = result.plan, expiry = Date.parse(result.expiresAt);
      if (result.kind !== "ready" || !p || p.method !== "directory-resource-v1" || p.mappingVersion !== "directory-resource-map-v1" || p.orgId !== orgId || p.intent !== proposal.intent || stable(p.selection) !== stable(proposal.selection) || p.candidate?.moduleId !== "resources" || (record && p.before?.revision !== record.revision) || typeof result.previewToken !== "string" || result.previewToken.length > 4096 || !result.previewToken || !Number.isFinite(expiry) || expiry <= now() || expiry > now() + 600000 || !HEX.test(p.planSha256 || "")) throw new Error("The preview response could not be verified. Inspect it again.");
      const withoutHash = own(p); delete withoutHash.planSha256;
      const digest = await hash({ namespace: "charitology:directory-resource:plan:v1", value: withoutHash });
      if (!valid(epoch) || stable(readProposal()) !== identity) return;
      if (digest !== p.planSha256) throw new Error("The preview hash did not match. Inspect it again.");
      ready = { proposal, identity, previewToken: result.previewToken, expiry, plan: own(p), epoch };
      draftDirty = true; onDirty(true);
      timer = setTimeout(() => { if (ready?.epoch === epoch) { invalidate(); inspectionRequired = true; status.textContent = "The ten-minute proof expired. Inspect and preview again."; } }, Math.max(1, expiry - now()));
      timer?.unref?.();
      replace(previewHost, n("h3", {}, "Review every change"), n("p", {}, `Resource state: ${p.candidate.status} · Revision ${p.candidate.revision}. This preview expires at ${result.expiresAt}. It creates no approval or provider action.`),
        p.warnings?.length ? n("ul", {}, p.warnings.map(w => n("li", {}, warningText[w] || w))) : null,
        n("dl", { class: "detail-fields" }, (p.changes || []).map(d => n("div", { class: "full-width" }, n("dt", {}, `${d.field} · ${d.origin}`), n("dd", {}, n("p", {}, "Before"), pre(d.before), n("p", {}, "After"), pre(d.after))))),
        details("Complete resulting Resource fields", pre(p.candidate.data)),
        details("Full limitations before and after", n("div", {}, n("p", {}, "Before"), pre(record?.data?.limitations ?? null), n("p", {}, "After"), pre(p.candidate.data.limitations))),
        button(proposal.intent === "copy" ? "Copy to a Resource" : proposal.intent === "adopt-recovered" ? "Adopt recovered source history" : "Save this recheck", commit, { class: "button primary", "data-directory-commit": "true" }));
      status.textContent = "Preview ready. Saving is a separate deliberate action.";
    } catch (error) { if (valid(epoch)) failure(error); }
    finally { if (!disposed) lock(false); }
  }
  async function commit() {
    if (busy || !ready || !valid(ready.epoch)) return;
    if (now() >= ready.expiry) { invalidate(); inspectionRequired = true; status.textContent = "The proof expired. Inspect and preview again."; return; }
    try {
      if (stable(readProposal()) !== ready.identity) { invalidate(); throw new Error("The form changed. Preview it again."); }
      if (!pending) {
        const key = randomUUID();
        if (!UUID.test(key)) throw new Error("A secure UUIDv4 command key could not be created. Nothing was sent.");
        pending = { previewToken: ready.previewToken, commandKey: key, proposal: own(ready.proposal) };
      }
      const exact = pending, epoch = version;
      lock(true); status.textContent = "Saving this exact reviewed command…";
      try {
        const result = await api.commitDirectoryResource(orgId, exact);
        if (!valid(epoch) || pending !== exact) return;
        if (!["copied", "rechecked", "adopted", "existing"].includes(result.kind) || !result.disposition) throw Object.assign(new Error("The save response was incomplete. Retry the exact command to inspect its current result."), { code: "invalid_response" });
        clearProof(); draftDirty = false; onDirty(false);
        replace(previewHost, disposition(result.disposition));
        status.textContent = "The command was accepted. Open the current saved Resource to continue its ordinary review workflow.";
        await onSaved(result.disposition);
      } catch (error) {
        if (!valid(epoch) || pending !== exact) return;
        if (!error.status || error.code === "invalid_response" || error.code === "connection_interrupted") {
          status.textContent = "The response was interrupted; the command may have completed. Retry retains this exact proof, proposal and command key.";
          appendContent(previewHost, button("Retry exact command", commit, { "data-directory-retry": "true" }));
        } else {
          invalidate(); inspectionRequired = true; failure(error);
          status.append(document.createTextNode(" Inspect the current Resource and prepare a fresh preview."));
        }
      } finally { if (!disposed) lock(false); }
    } catch (error) { failure(error); }
  }
  async function renderEvidence(append = false) {
    const epoch = version;
    const result = await api.directoryResource(orgId, record.id, append ? nextCursor : undefined);
    if (!valid(epoch)) return;
    if (!append) { panel = own(result); replace(evidenceHost, ); }
    nextCursor = result.nextCursor;
    const binding = result.binding;
    if (!binding) {
      replace(evidenceHost, n("p", {}, "This Resource has no directory source binding. Review a public directory card to copy a separate Resource."), n("a", { href: "https://charitology.org/for-charities/tools/" }, "Tools directory"), n("a", { href: "https://charitology.org/for-charities/benefits/" }, "Benefits directory"));
      return;
    }
    if (!append) {
      appendContent(evidenceHost, n("p", {}, binding.originMode === "recovered" ? "Recovered history is inert. A fresh adoption requires current organization authority and a new preview." : "Directory source history records selected source versions and organization declarations."),
        result.assessment?.assessment ? n("p", {}, `Organization declaration dated ${result.assessment.assessment.reviewedDate}: ${result.assessment.kind === "current" ? "matches this working data and selected source" : result.assessment.kind === "historical" ? "historical recovered declaration" : "does not match the current working basis"}. Declared eligibility: ${result.assessment.assessment.eligibility}.`) : n("p", {}, "No organization eligibility declaration is recorded in this source history."),
        result.assessment ? details("Organization declaration basis", pre(result.assessment)) : null,
        n("p", { class: "fine" }, "Declarations are dated organization records, not provider verification or a guarantee of current eligibility. Generic edits and restores can detach their basis."),
        canExport === true ? button("Download partial source evidence JSON", async () => {
          const ownedEpoch = version;
          try { const file = await api.exportDirectoryResource(orgId, record.id); if (valid(ownedEpoch)) download(`resource-${record.id}-partial-directory-evidence.json`, file); }
          catch (error) { if (valid(ownedEpoch)) failure(error); }
        }) : null, n("p", { class: "fine" }, "A selected Resource export is partial evidence. Use an administrator's full organization backup for recovery. CSV does not retain complete source history."));
    }
    for (const event of result.events || []) appendContent(evidenceHost, details(`Source event ${event.packet.sequence}: ${event.packet.event} · ${event.provenance} · ${event.packet.recordedAt}`, n("div", {}, pre(event), button("Inspect this event's exact source", async () => {
      if (busy) return;
      await inspect(event.packet.selection);
    }))));
    if (nextCursor) {
      const more = button("Load more source history", async () => {
        const ownedEpoch = version;
        more.disabled = true;
        try { if (await renderEvidence(true)) more.remove(); }
        catch (error) { if (valid(ownedEpoch)) failure(error); }
        finally { if (!disposed) more.disabled = false; }
      });
      appendContent(evidenceHost, more);
    }
    if (!append) {
      if (result.disposition?.kind !== "active-record") { replace(formHost, disposition(result.disposition)); return; }
      await inspect(binding.selection);
    }
    return true;
  }
  const leave = () => { invalidate(); inspectionRequired = true; status.textContent = "This review left the active page. Inspect the source again before previewing."; };
  const visibility = () => { if (document.visibilityState === "hidden") leave(); };
  if (typeof window !== "undefined") window.addEventListener("pagehide", leave);
  document.addEventListener?.("visibilitychange", visibility);
  element.append(n("p", { class: "notice neutral", "data-directory-visibility": "true" }, DIRECTORY_VISIBILITY_NOTICE), n("h2", {}, record ? "Directory source and organization review" : "Review a directory Resource copy"), n("p", {}, "Directory prose is a retained public source. Your organization decides what to adopt. This flow saves only after you inspect and confirm a preview."), status, evidenceHost, sourceHost, formHost, previewHost);
  return {
    element,
    load: async () => {
      const ownedEpoch = version;
      try { if (record) await renderEvidence(); else if (initialSelection) await inspect(initialSelection); else throw new Error("Choose a frozen source using a public directory card."); }
      catch (error) { if (valid(ownedEpoch)) failure(error); }
    },
    invalidate: () => { invalidate(); status.textContent = "The context changed. Inspect and preview again."; },
    dispose: () => { disposed = true; invalidate(); if (typeof window !== "undefined") window.removeEventListener("pagehide", leave); document.removeEventListener?.("visibilitychange", visibility); },
    isDirty: () => draftDirty || !!ready || !!pending,
  };
}
