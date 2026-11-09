/** Staff display and command bindings. The server checks approval, scope and capacity. */
const OPERATIONS = Object.freeze({ reserve: "Reserve", release: "Release", replace: "Replace" });
const BLOCKED = Object.freeze({
  conflict: "The selected item has a conflicting hold. Choose another item or session.",
  unchanged: "The same item and session interval are already held. Choose a different replacement.",
  "recovery-required": "A recovered claim needs reconciliation before this item can be reserved.",
});
const REFUSED = Object.freeze({
  ...BLOCKED,
  stale: "A saved record changed. Refresh, then review your selection again.",
  expired: "The review expired. Refresh, then review your selection again.",
  capacity: "The workspace could not retain the new hold. Refresh and review the saved holds.",
});
const PAGE = 20;
const need = value => {
  if (!value) throw new TypeError("The reservation response could not be verified.");
};
const id = value => typeof value === "string" && value.length >= 1 &&
  value.length <= 100 && !/[^A-Za-z0-9_-]/.test(value);
const sha = value => typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value);
const revision = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
const reasonText = value => typeof value === "string" && value.length <= 300 &&
  value.trim().length > 0 && !/[\p{Cc}\p{Cs}]/u.test(value);
const writtenTime = value => typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));

function exact(value, keys) {
  need(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable && Object.hasOwn(descriptor, "value");
    }));
}
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}
function stamp(value) {
  need(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value) &&
    Number(value.slice(0, 4)) > 0);
  const millis = value.slice(0, 23) + "Z";
  need(Number.isFinite(Date.parse(millis)) && new Date(millis).toISOString() === millis);
}
function interval(value) {
  exact(value, ["startAt", "endAt", "timeZone"]);
  need(writtenTime(value.startAt) && writtenTime(value.endAt) &&
    Date.parse(value.startAt) < Date.parse(value.endAt) &&
    typeof value.timeZone === "string" && value.timeZone.length > 0 &&
    value.timeZone.length <= 100 && !/[^A-Za-z0-9_+./-]/.test(value.timeZone) &&
    !/^[+-]/.test(value.timeZone));
}
function source(value, kind) {
  exact(value, ["id", "revision", "title", kind === "asset" ? "quantity" : "interval"]);
  need(id(value.id) && revision(value.revision) && typeof value.title === "string" &&
    value.title.length > 0 && value.title.length <= 180);
  if (kind === "asset") need(value.quantity === 1);
  else interval(value.interval);
}
function retainedHold(row) {
  exact(row, ["id", "revision", "originMode", "state", "sourceState", "assetId", "assetRevision",
    "sessionId", "sessionRevision", "interval", "proofSha256", "original", "terminal", "disposition"]);
  need(id(row.id) && id(row.assetId) && id(row.sessionId) && row.assetId !== row.sessionId &&
    revision(row.assetRevision) && revision(row.sessionRevision) && sha(row.proofSha256));
  interval(row.interval);
  const { original, terminal, disposition } = row;
  exact(original, ["operation", "acceptedAtExact", "replacesId"]);
  need(original.operation === "reserve" && original.replacesId === null ||
    original.operation === "replace" && id(original.replacesId) && original.replacesId !== row.id);
  stamp(original.acceptedAtExact);
  if (terminal !== null) {
    exact(terminal, ["operation", "acceptedAtExact", "reason", "replacedById"]);
    need(reasonText(terminal.reason) &&
      (terminal.operation === "release" && terminal.replacedById === null ||
        terminal.operation === "replace" && id(terminal.replacedById) && terminal.replacedById !== row.id));
    stamp(terminal.acceptedAtExact);
    need(terminal.acceptedAtExact >= original.acceptedAtExact);
  }
  need(row.sourceState === (terminal ? "released" : "reserved"));
  if (disposition !== null) {
    exact(disposition, ["acceptedAtExact", "reason"]);
    stamp(disposition.acceptedAtExact);
    need(row.originMode === "recovered" && !terminal && reasonText(disposition.reason) &&
      disposition.acceptedAtExact >= original.acceptedAtExact);
  }
  need(row.originMode === "live" || row.originMode === "recovered");
  need(row.state === (disposition ? "released" : row.sourceState) &&
    row.revision === (disposition || row.originMode === "live" && terminal ? 2 : 1));
}
const activeHold = row => row.originMode === "live" && row.state === "reserved";
const pin = row => row && { id: row.id, revision: row.revision };

function envelope(value, orgId, keys) {
  exact(value, ["ok", "version", "orgId", "scopeSha256", ...keys]);
  need(value.ok === true && value.version === 1 && value.orgId === orgId && sha(value.scopeSha256));
}
function workspace(value, orgId) {
  envelope(value, orgId, ["assets", "sessions", "reservations"]);
  const { assets, sessions, reservations } = value;
  need(Array.isArray(assets) && Array.isArray(sessions) && assets.length + sessions.length <= 2000 &&
    Array.isArray(reservations) && reservations.length <= 1000);
  for (const row of assets) source(row, "asset");
  for (const row of sessions) source(row, "session");
  for (const row of reservations) retainedHold(row);
  need(new Set([...assets, ...sessions].map(row => row.id)).size === assets.length + sessions.length &&
    new Set(reservations.map(row => row.id)).size === reservations.length);
  return structuredClone(value);
}
function reviewResponse(value, orgId, input, prior, asset, session) {
  envelope(value, orgId, ["state", "input", "previous", "next", "preview"]);
  need(value.scopeSha256 === input.scopeSha256 && same(value.input, input));
  const ready = value.state === "ready";
  need(ready || Object.hasOwn(BLOCKED, value.state));
  if (prior) retainedHold(value.previous);
  need(same(value.previous, prior));
  if (input.operation === "release") {
    need(ready && value.next === null && value.preview === null);
  } else {
    exact(value.next, ["id", "proofSha256", "asset", "session"]);
    source(value.next.asset, "asset");
    source(value.next.session, "session");
    need(sha(value.next.proofSha256) && same(value.next.asset, asset) &&
      same(value.next.session, session) && (ready ? id(value.next.id) : value.next.id === null));
    if (ready) {
      need(value.next.id !== prior?.id);
      exact(value.preview, ["previewToken", "reviewSha256", "expiresAtExact"]);
      need(typeof value.preview.previewToken === "string" && value.preview.previewToken.length <= 8192 &&
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.preview.previewToken) &&
        sha(value.preview.reviewSha256));
      stamp(value.preview.expiresAtExact);
    } else need(value.preview === null);
  }
  return structuredClone(value);
}
function effect(value, expected, state, expectedRevision) {
  if (!expected) {
    need(value === null);
    return;
  }
  exact(value, ["id", "proofSha256", "state", "revision"]);
  need(value.id === expected.id && value.proofSha256 === expected.proofSha256 &&
    value.state === state && value.revision === expectedRevision);
}
function commitResponse(value, orgId, pending) {
  const { body, review } = pending;
  if (value?.state === "refused") {
    envelope(value, orgId, ["state", "idempotencyKey", "reasonCode"]);
    need(Object.hasOwn(REFUSED, value.reasonCode));
  } else {
    envelope(value, orgId, ["state", "idempotencyKey", "replayed", "decision", "current"]);
    need(value.state === "accepted" && typeof value.replayed === "boolean");
    const { decision, current } = value;
    exact(decision, ["operation", "acceptedAtExact", "previous", "next", "reason"]);
    need(decision.operation === body.operation && decision.reason === review.input.reason);
    stamp(decision.acceptedAtExact);
    effect(decision.previous, review.previous, "released", 2);
    effect(decision.next, review.next, "reserved", 1);
    const effects = [decision.previous, decision.next].filter(Boolean);
    need(Array.isArray(current) && current.length === effects.length);
    for (const expected of effects) {
      const rows = current.filter(row => row?.id === expected.id);
      need(rows.length === 1);
      const row = rows[0];
      effect(row, expected, row.state, row.state === "released" ? 2 : 1);
      need(row.state === "released" || row.state === "reserved" && expected.state === "reserved");
    }
  }
  need(value.scopeSha256 === body.scopeSha256 && value.idempotencyKey === body.request.idempotencyKey);
  return structuredClone(value);
}

function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (["checked", "disabled", "hidden"].includes(key)) element[key] = !!value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}
const card = (label, ...children) => node("section", { class: "snapshot stack" }, node("h2", {}, label), ...children);
const notify = (callback, value) => { try { callback(value); } catch {} };
const blank = () => ({ operation: "reserve", asset: "", session: "", hold: "", reason: "",
  assetSearch: "", sessionSearch: "", holdSearch: "" });
const literalInterval = value => [
  node("p", {}, "Starts " + value.startAt),
  node("p", {}, "Ends " + value.endAt),
  node("p", {}, "Time zone " + value.timeZone),
];
const holdPins = row => [
  node("p", {}, "Asset " + row.assetId + " · revision " + row.assetRevision),
  node("p", {}, "Session " + row.sessionId + " · revision " + row.sessionRevision),
  ...literalInterval(row.interval),
];
const holdLabel = row => row.id + " · " + row.assetId + " · " + row.sessionId;
let serial = 0;

export function createResourceReservationsWorkspace({
  orgId, api, isCurrent = () => true, onAccessLost = () => {}, onDirty = () => {},
  onChanged = () => {}, makeCommandKey = () => crypto.randomUUID(),
} = {}) {
  need(id(orgId) && ["workspace", "review", "commit"].every(key => typeof api?.[key] === "function"));
  const prefix = "resource-reservations-" + (++serial) + "-";
  const root = node("section", { class: "resource-reservations stack", "aria-label": "Room and equipment reservations" });
  const status = node("p", { role: "status", tabindex: "-1", class: "form-status" });
  const privateHost = node("div", { class: "stack", hidden: true });
  const reviewHost = node("div"), savedHost = node("div"), historyHost = node("div", { class: "stack" });
  let draft = blank(), binding = null, current = null, review = null, pending = null, saved = null;
  let acknowledged = false, confirmedStop = false, savedAdmitted = false, page = 0;
  let paused = false, disposed = false, controller = null;
  const busy = () => controller !== null;
  const dirty = () => !!pending || draft.operation !== "reserve" ||
    !!(draft.asset || draft.session || draft.hold || draft.reason);
  const mark = () => notify(onDirty, dirty());
  function say(message, error = false, focus = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
    if (focus && root.isConnected) status.focus();
  }
  function input(tag, key, attrs = {}) {
    return node(tag, { id: prefix + key, "data-reservation": key, ...attrs });
  }
  const field = (label, control, help = null) => node("div", { class: "field" },
    node("label", { for: control.id }, label), control, help);
  const button = (label, run, kind = "subtle") => {
    const control = node("button", { type: "button", class: "button " + kind }, label);
    control.addEventListener("click", async () => { if (!control.disabled) await run(); });
    return control;
  };
  const operation = input("select", "operation");
  for (const [key, label] of Object.entries(OPERATIONS)) operation.append(node("option", { value: key }, label));
  const reason = input("input", "reason", { type: "text", maxlength: "300" });
  const ack = input("input", "ack", { type: "checkbox" });
  const stopAck = input("input", "stop-ack", { type: "checkbox" });
  const refresh = button("Refresh saved holds", load);
  const prepare = button("Review selected decision", requestReview);
  const commit = button("Record reviewed reservation decision", () => record(false), "primary");
  const retry = button("Retry the same reservation command", () => record(true), "primary");
  const stop = button("Stop retrying this command", stopRetrying);
  const back = button("Previous history page", () => { page--; renderHistory(); sync(); });
  const more = button("Next history page", () => { page++; renderHistory(); sync(); });
  const pickers = {
    hold: picker("hold", "Saved internal hold", row => holdLabel(row), () => current.reservations.filter(activeHold)),
    asset: picker("asset", "Approved room or equipment", row => row.title + " · " + row.id, () => current.assets),
    session: picker("session", "Approved Events session", row => row.title + " · " + row.id, () => current.sessions),
  };
  const oldFields = node("div", { class: "stack" }, pickers.hold.element,
    field("Reason for release", reason, node("p", { class: "field-help" }, "Record a short operational reason.")));
  const newFields = node("div", { class: "stack" }, pickers.asset.element, pickers.session.element);
  privateHost.append(card("Choose the reservation decision", field("Action", operation),
    oldFields, newFields, node("div", { class: "actions" }, prepare)), reviewHost,
    card("Saved holds and history", historyHost, node("div", { class: "actions" }, back, more)));
  root.append(node("h1", { tabindex: "-1" }, "Room and equipment reservations"),
    node("p", {}, "Reserve one approved item for the whole approved session. Release ends the internal hold. Replace releases the old hold and records the new hold together."),
    node("p", { class: "fine" }, "The hold records your workspace decision. Arrange physical access through your usual process."),
    node("div", { class: "actions" }, refresh), status, savedHost, privateHost);

  function picker(key, label, labelRow, getRows) {
    const search = input("input", key + "-search", { type: "search", maxlength: "180" });
    const select = input("select", key);
    const hint = node("p", { class: "field-help" });
    const searchKey = key + "Search";
    function render() {
      search.value = draft[searchKey];
      const rows = current ? getRows() : [];
      const needle = draft[searchKey].trim().toLowerCase();
      const matches = rows.filter(row => labelRow(row).toLowerCase().includes(needle));
      const chosen = rows.find(row => row.id === draft[key]);
      const visible = matches.filter(row => row !== chosen).slice(0, chosen ? PAGE - 1 : PAGE);
      if (chosen) visible.unshift(chosen);
      const options = visible.map(row => node("option", { value: row.id }, labelRow(row)));
      if (draft[key] && !chosen)
        options.push(node("option", { value: draft[key], disabled: true }, "Earlier selection unavailable · " + draft[key]));
      select.replaceChildren(node("option", { value: "" }, "Choose explicitly"), ...options);
      select.value = draft[key];
      hint.textContent = matches.length > PAGE ? "Showing the first matches. Search by title or ID to narrow the list."
        : matches.length ? String(matches.length) + " matching choices." : "No matching choices.";
    }
    search.addEventListener("input", () => {
      if (!readyToEdit()) return;
      draft[searchKey] = search.value;
      render();
    });
    select.addEventListener("change", () => {
      if (!readyToEdit()) return;
      draft[key] = select.value;
      changed();
    });
    return { element: node("div", {}, field("Search " + label.toLowerCase(), search), field(label, select, hint)),
      render, search, select, hint };
  }
  const owned = () => !disposed && isCurrent();
  const live = () => owned() && !paused && !document.hidden;
  const readyToEdit = () => live() && !!current && !pending && !busy();
  function clearReview() {
    review = null;
    acknowledged = false;
    ack.checked = false;
  }
  function changed() {
    clearReview();
    renderReview();
    mark();
    sync();
  }
  operation.addEventListener("change", () => {
    if (!readyToEdit() || !Object.hasOwn(OPERATIONS, operation.value)) return;
    draft.operation = operation.value;
    changed();
  });
  reason.addEventListener("input", () => { if (readyToEdit()) { draft.reason = reason.value; changed(); } });
  ack.addEventListener("change", () => {
    if (readyToEdit() && review?.state === "ready") acknowledged = ack.checked;
    sync();
  });
  stopAck.addEventListener("change", () => {
    if (live() && current && pending && !busy()) confirmedStop = stopAck.checked;
    sync();
  });

  function selection() {
    if (!current) return null;
    const previous = draft.operation === "reserve" ? null :
      current.reservations.find(row => row.id === draft.hold && activeHold(row));
    const asset = draft.operation === "release" ? null : current.assets.find(row => row.id === draft.asset);
    const session = draft.operation === "release" ? null : current.sessions.find(row => row.id === draft.session);
    const writing = draft.operation === "reserve" ? null : draft.reason.trim();
    if (draft.operation !== "reserve" && (!previous || !reasonText(writing)) ||
        draft.operation !== "release" && (!asset || !session)) return null;
    const input = {
      version: 1, scopeSha256: binding, operation: draft.operation,
      previous: pin(previous), asset: pin(asset), session: pin(session), reason: writing,
    };
    return { input, previous, asset, session };
  }
  function sync() {
    const editing = readyToEdit();
    refresh.disabled = !live() || busy();
    operation.disabled = reason.disabled = !editing;
    for (const picker of Object.values(pickers)) picker.search.disabled = picker.select.disabled = !editing;
    oldFields.hidden = draft.operation === "reserve";
    newFields.hidden = draft.operation === "release";
    prepare.disabled = !editing || !selection();
    ack.disabled = !editing || review?.state !== "ready";
    commit.disabled = ack.disabled || !acknowledged;
    retry.disabled = stopAck.disabled = !live() || !current || !pending || busy();
    stop.disabled = stopAck.disabled || !confirmedStop;
    back.disabled = !live() || !current || page === 0 || busy();
    more.disabled = !live() || !current || (page + 1) * PAGE >= current.reservations.length || busy();
  }
  function renderReview() {
    const visible = pending?.review ?? review;
    if (!visible || !current) {
      reviewHost.replaceChildren();
      return;
    }
    const before = visible.previous;
    const after = visible.next;
    const parts = [
      node("p", {}, OPERATIONS[visible.input.operation] + " · " +
        (visible.state === "ready" ? "Ready for your decision" : "Review needs a change")),
      before ? node("div", {}, node("h3", {}, "Hold to release"),
        node("p", {}, before.id + " · revision " + before.revision),
        ...holdPins(before), node("pre", { tabindex: "0" }, visible.input.reason)) : null,
      after ? node("div", {}, node("h3", {}, "New internal hold"),
        node("p", {}, after.asset.title + " · " + after.asset.id + " · revision " + after.asset.revision),
        node("p", {}, "One item · whole session"),
        node("p", {}, after.session.title + " · " + after.session.id + " · revision " + after.session.revision),
        ...literalInterval(after.session.interval)) : null,
      visible.preview ? node("p", { class: "fine" }, "Review expires " + visible.preview.expiresAtExact + ".") : null,
    ];
    if (pending) parts.push(node("p", { class: "notice" },
      "The original decision may already be recorded. Retry sends the same command."),
      field("I understand this command may already have been recorded.", stopAck),
      node("div", { class: "actions" }, retry, stop));
    else if (visible.state === "ready") parts.push(
      field("I reviewed the exact records, time and effect of this decision.", ack),
      node("div", { class: "actions" }, commit));
    else parts.push(node("p", { class: "notice" }, BLOCKED[visible.state]));
    reviewHost.replaceChildren(card("Review the exact decision", ...parts));
  }
  function renderSaved() {
    if (!savedAdmitted || !saved) { savedHost.replaceChildren(); return; }
    const decision = saved.decision;
    const rows = [decision.previous, decision.next].filter(Boolean);
    savedHost.replaceChildren(card("Recorded decision",
      node("p", {}, OPERATIONS[decision.operation] + " recorded " + decision.acceptedAtExact +
        (saved.replayed ? " · Original result retrieved" : "")),
      ...rows.map(row => node("p", {}, "Original effect on " + row.id + " · " + row.state +
        " · revision " + row.revision)),
      decision.reason ? node("pre", { tabindex: "0" }, decision.reason) : null,
      node("h3", {}, "Current disposition"),
      ...rows.map(row => {
        const now = saved.current.find(value => value.id === row.id);
        return node("p", {}, now ? now.id + " · " + now.state + " · revision " + now.revision :
          row.id + " · Current disposition unavailable");
      })));
  }
  function renderHistory() {
    if (!current) { historyHost.replaceChildren(); return; }
    const all = current.reservations;
    page = Math.max(0, Math.min(page, Math.ceil(all.length / PAGE) - 1));
    historyHost.replaceChildren(
      node("p", {}, all.length ? "Page " + (page + 1) + " of " + Math.ceil(all.length / PAGE) : "No saved holds."),
      ...all.slice(page * PAGE, (page + 1) * PAGE).map(row => node("details", {},
        node("summary", {}, row.id + " · " + (activeHold(row) ? "Live internal hold"
          : row.originMode === "recovered" && row.state === "reserved" ? "Recovered claim needs reconciliation"
            : row.originMode === "recovered" ? "Inactive recovered history" : "Released internal hold")),
        node("h3", {}, "Frozen records and interval"), ...holdPins(row),
        node("p", {}, "Original decision " + OPERATIONS[row.original.operation] + " · " + row.original.acceptedAtExact +
          (row.original.replacesId ? " · Replaces " + row.original.replacesId : "")),
        node("p", {}, "Source state " + row.sourceState),
        row.terminal ? node("p", {}, "Terminal decision " + OPERATIONS[row.terminal.operation] + " · " +
          row.terminal.acceptedAtExact + (row.terminal.replacedById ? " · Successor " + row.terminal.replacedById : "")) : null,
        row.terminal ? node("pre", { tabindex: "0" }, row.terminal.reason) : null,
        row.disposition ? node("p", {}, "Recovery disposition recorded " + row.disposition.acceptedAtExact) : null,
        row.disposition ? node("pre", { tabindex: "0" }, row.disposition.reason) : null,
        node("p", {}, "Current disposition " + row.state + " · revision " + row.revision))));
  }
  function render() {
    privateHost.hidden = !current;
    operation.value = current ? draft.operation : "reserve";
    reason.value = current ? draft.reason : "";
    for (const picker of Object.values(pickers)) {
      if (current) picker.render();
      else {
        picker.search.value = "";
        picker.select.replaceChildren();
        picker.hint.textContent = "";
      }
    }
    renderReview();
    renderSaved();
    renderHistory();
    sync();
  }
  function reset() {
    controller?.abort();
    controller = null;
    draft = blank();
    binding = current = pending = saved = null;
    savedAdmitted = false;
    clearReview();
    confirmedStop = stopAck.checked = false;
    page = 0;
    mark();
    render();
  }
  function lost() {
    reset();
    say("Access changed. Read the current organization workspace to continue.", true, true);
    notify(onAccessLost);
  }
  async function run(task, failed) {
    if (!owned()) { if (!disposed) lost(); return; }
    if (!live() || busy()) return;
    const active = new AbortController();
    controller = active;
    sync();
    const valid = () => controller === active && live();
    try {
      await task({ signal: AbortSignal.any([active.signal, AbortSignal.timeout(30000)]) }, valid);
    } catch (error) {
      if (!valid()) return;
      if ([401, 403].includes(error?.status)) lost();
      else failed();
    } finally {
      if (controller === active) {
        controller = null;
        if (!owned()) { if (!disposed) lost(); }
        else sync();
      }
    }
  }
  async function load() {
    await run(async (options, valid) => {
      const raw = await api.workspace(options);
      if (!valid()) return;
      const next = workspace(raw, orgId);
      const changedScope = binding && next.scopeSha256 !== binding;
      if (changedScope) reset();
      binding = next.scopeSha256;
      current = next;
      clearReview();
      if (saved) {
        const byId = new Map(current.reservations.map(row => [row.id, row]));
        saved.current = [saved.decision.previous, saved.decision.next].filter(Boolean).flatMap(effect => {
          const row = byId.get(effect.id);
          if (row?.proofSha256 !== effect.proofSha256) return [];
          const { id, proofSha256, state, revision } = row;
          return [{ id, proofSha256, state, revision }];
        });
        savedAdmitted = true;
      }
      render();
      say(changedScope ? "Current access changed. Earlier selections and Retry were cleared."
        : pending ? "Saved holds refreshed. Reconcile the original command with deliberate Retry."
          : "Saved holds and eligible sources are ready.");
    }, () => {
      current = null;
      savedAdmitted = false;
      clearReview();
      render();
      say("Saved holds could not be read. Your writing is kept. Refresh to continue.", true, true);
    });
  }
  function responseScopeChanged(value) {
    if (value?.ok === true && value.orgId === orgId && sha(value.scopeSha256) && value.scopeSha256 !== binding) {
      lost();
      return true;
    }
    return false;
  }
  async function requestReview() {
    if (!readyToEdit()) return;
    const selected = selection();
    if (!selected) return;
    clearReview();
    renderReview();
    await run(async (options, valid) => {
      const { input, previous, asset, session } = selected;
      const raw = await api.review(input, options);
      if (!valid() || responseScopeChanged(raw)) return;
      const candidate = reviewResponse(raw, orgId, input, previous, asset, session);
      need(candidate.next?.id == null || !current.reservations.some(row => row.id === candidate.next.id));
      review = candidate;
      renderReview();
      say(candidate.state === "ready" ? "Read the exact records and times, then acknowledge the decision."
        : BLOCKED[candidate.state], candidate.state !== "ready", true);
    }, () => {
      clearReview();
      renderReview();
      say("The review could not be verified. Your writing is kept. Refresh and review again.", true, true);
    });
  }
  async function record(replaying) {
    if (!live() || !current || busy()) return;
    if (!replaying) {
      if (pending || !acknowledged || review?.state !== "ready" || !same(review.input, selection()?.input)) return;
      const idempotencyKey = makeCommandKey();
      if (!id(idempotencyKey) || idempotencyKey.length < 16) {
        say("The command key could not be prepared. Review again before recording.", true, true);
        return;
      }
      const request = { version: 1, idempotencyKey };
      if (review.previous) Object.assign(request, {
        reservationId: review.previous.id, reservationRevision: review.previous.revision, reason: review.input.reason,
      });
      if (review.preview) Object.assign(request, {
        previewToken: review.preview.previewToken, reviewSha256: review.preview.reviewSha256, acknowledge: true,
      });
      pending = { review, body: Object.freeze({
        version: 1, scopeSha256: binding, operation: review.input.operation, request: Object.freeze(request),
      }) };
      mark();
      renderReview();
    }
    const retained = pending;
    if (!retained) return;
    await run(async (options, valid) => {
      const raw = await api.commit(retained.body, options);
      if (!valid() || pending !== retained || responseScopeChanged(raw)) return;
      const result = commitResponse(raw, orgId, retained);
      pending = null;
      clearReview();
      confirmedStop = stopAck.checked = false;
      current = null;
      if (result.state === "refused") {
        savedAdmitted = false;
        render();
        mark();
        say(REFUSED[result.reasonCode], true, true);
        return;
      }
      saved = result;
      savedAdmitted = true;
      draft = blank();
      render();
      mark();
      say("Recorded the original decision. Refresh saved holds before preparing another decision.", false, true);
      notify(onChanged, result.decision.operation);
    }, () => {
      say("The result is uncertain. Use deliberate Retry for the original command.", true, true);
    });
  }
  function stopRetrying() {
    if (!live() || busy() || !pending || !confirmedStop) return;
    pending = current = null;
    savedAdmitted = false;
    clearReview();
    confirmedStop = stopAck.checked = false;
    render();
    mark();
    say("Local Retry stopped. Refresh saved holds to review the current disposition.", false, true);
  }
  function pause() {
    if (disposed) return;
    paused = true;
    controller?.abort();
    controller = current = null;
    savedAdmitted = false;
    clearReview();
    confirmedStop = stopAck.checked = false;
    render();
    say("");
  }
  function resume() {
    if (!owned()) { if (!disposed) lost(); return; }
    paused = false;
    sync();
  }
  const visibility = () => document.hidden ? pause() : resume();
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", resume);
  document.addEventListener?.("visibilitychange", visibility);
  root.load = load;
  root.pause = pause;
  root.resume = resume;
  root.invalidate = lost;
  root.hasUnsavedChanges = dirty;
  root.hasPendingCommand = () => !!pending;
  root.dispose = () => {
    if (disposed) return;
    disposed = true;
    reset();
    window.removeEventListener("pagehide", pause);
    window.removeEventListener("pageshow", resume);
    document.removeEventListener?.("visibilitychange", visibility);
    root.replaceChildren();
  };
  render();
  say("Read saved holds and current approved sources to begin.");
  return root;
}
