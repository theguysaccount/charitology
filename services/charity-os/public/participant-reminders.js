// One separate reminder choice. Reads never resolve an uncertain save.
const VERSION = "participation-reminder-v1";
const COPY = "Email me one reminder before this confirmed participation starts. I can turn it off here.";
const MAX = 2147483647;
const id = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const integer = (v, min = 1) => Number.isSafeInteger(v) && v >= min && v <= MAX;
const sha = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function fail() { throw new Error("The reminder response could not be verified. Any uncertain save is kept for an explicit retry."); }
function keys(v, names) {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...names].sort().join("|")) fail();
}
function instant(v) {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v) || +v.slice(0,4)<=0) return false;
  const ms = v.slice(0, 23) + "Z";
  return Number.isFinite(Date.parse(ms)) && new Date(ms).toISOString() === ms;
}
function choice(v) {
  if (v.version !== VERSION || typeof v.enabled !== "boolean" || !integer(v.revision, 0) || !(v.atExact === null || instant(v.atExact)) || (v.revision === 0) !== (v.atExact === null) || v.enabled && !v.revision) fail();
}
export function checkedOwnReminder(v, pid) {
  keys(v, ["ok", "participationId", "revision", "intakeRevision", "reminder"]);
  keys(v.reminder, ["version", "enabled", "revision", "atExact", "currentCommitmentSha256", "canEnable", "canDisable", "unavailableReason"]);
  const r = v.reminder;choice(r);
  if (v.ok !== true || v.participationId !== pid || !integer(v.revision) || !integer(v.intakeRevision) || !(r.currentCommitmentSha256 === null || sha(r.currentCommitmentSha256)) || typeof r.canEnable !== "boolean" || typeof r.canDisable !== "boolean" || ![null, "current_binding_required", "revision_exhausted"].includes(r.unavailableReason) || r.canEnable && !sha(r.currentCommitmentSha256) || r.canDisable && !r.enabled) fail();
  return v;
}
function checkedSaved(v, pending, pid) {
  keys(v, ["ok", "participationId", "revision", "intakeRevision", "reminder", "auditRetained", "replayed"]);
  keys(v.reminder, ["version", "enabled", "revision", "atExact"]);choice(v.reminder);
  const b = pending.body;
  if (v.ok !== true || v.participationId !== pid || v.revision !== Math.min(MAX, b.revision + 1) || v.intakeRevision !== b.intakeRevision || v.reminder.revision !== Math.min(MAX, b.reminderRevision + 1) || v.reminder.enabled !== b.enabled || !instant(v.reminder.atExact) || typeof v.auditRetained !== "boolean" || typeof v.replayed !== "boolean") fail();
  return v;
}
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (["disabled", "checked"].includes(key)) element[key] = !!value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
}
export function createOwnReminderPane({ orgId, intakeId, participationId, request, getDisplayedPins,
  isCurrent = () => true, onDirty = () => {}, onAccessLost = () => {}, runMutation = fn => fn() }) {
  if (![orgId, intakeId, participationId].every(id) || typeof request !== "function" || typeof getDisplayedPins !== "function") fail();
  const base = `/api/participant/orgs/${encodeURIComponent(orgId)}/requests/${encodeURIComponent(intakeId)}/participations/${encodeURIComponent(participationId)}`;
  let disposed = false, paused = false, admitted = false, generation = 0, busy = false, model = null, pending = null, accepted = null, affirmed = false, abandon = false, focusRequested = false;
  const owned = new Set(), element = node("section", { class: "participant-checkin participant-reminder" });
  const host = node("div"), actions = node("div", { class: "actions" }), status = node("p", { class: "form-status", role: "status", tabindex: "-1" });
  const affirmation = node("input", { type: "checkbox" }), stopAck = node("input", { type: "checkbox" });
  const live = () => !disposed && !paused && isCurrent();
  const dirty = () => onDirty(!!(pending || affirmed || abandon));
  const matchesDisplay = () => { const p = getDisplayedPins();return !!model && p?.revision === model.revision && p?.intakeRevision === model.intakeRevision; };
  const button = (label, fn) => { const b = node("button", { type: "button", class: "button subtle" }, label);b.addEventListener("click", async () => { if (live() && !busy) await fn(); });return b; };
  const read = button("Read reminder choice", load), save = button("Save reminder choice", () => send(true)), off = button("Turn off reminder", () => send(false)), retry = button("Retry the same save", () => send(pending?.body.enabled)), stop = button("Stop retrying this save", stopRetrying);
  affirmation.addEventListener("change", () => { if (!live() || busy || pending || !admitted) return;affirmed = affirmation.checked;dirty();sync(); });
  stopAck.addEventListener("change", () => { if (!live() || busy || !pending || !admitted) return;abandon = stopAck.checked;dirty();sync(); });
  const notify = (text, error = false) => { if (!live()) return;status.textContent = text;status.classList.toggle("error", error);focusRequested = true; };
  async function transport(path, options = {}) {
    const controller = new AbortController();owned.add(controller);
    try { return await request(path, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) }); }
    finally { owned.delete(controller); }
  }
  function sync() {
    read.disabled = busy;
    affirmation.disabled = busy || !!pending || !admitted || !model?.reminder.canEnable || !matchesDisplay();
    save.disabled = affirmation.disabled || !affirmed;
    off.disabled = busy || !!pending || !admitted || !model?.reminder.canDisable;
    retry.disabled = busy || !admitted || !pending;
    stopAck.disabled = busy || !admitted || !pending;
    stop.disabled = stopAck.disabled || !abandon;
  }
  function render() {
    if (!live()) return;
    host.replaceChildren();actions.replaceChildren(read);
    element.replaceChildren(node("h5", {}, "Participation reminder"));
    if (admitted) {
      host.append(node("p", { class: "fine" }, "Choose one best-effort email about 24 hours before the confirmed start. Saving this choice does not schedule an email; staff must review it separately."));
      if (model) {
        const r = model.reminder;
        host.append(node("p", {}, r.enabled ? "Saved reminder choice: on." : r.revision ? "Saved reminder choice: off." : "No reminder choice is recorded."));
        if (!matchesDisplay()) host.append(node("p", { class: "notice" }, "The saved participation or request has changed. Reload the saved request and review its details before enabling a reminder."));
        if (r.canEnable && matchesDisplay()) host.append(node("label", { class: "intake-consent" }, affirmation, COPY), save);
        if (r.canDisable) host.append(off);
        if (!r.canEnable && !r.canDisable) host.append(node("p", { class: "fine" }, "A reminder cannot be changed in the current participation state."));
      }
      if (accepted) host.append(node("p", { class: "notice" }, `The original save recorded the reminder choice as ${accepted.reminder.enabled ? "on" : "off"} at ${accepted.reminder.atExact}. Read the choice again to check its current state.${accepted.auditRetained ? "" : " Its journal entry was not retained."}`));
      if (pending) {
        host.append(node("p", { class: "notice" }, "A save is retained in this tab and may already be recorded. Reading the current choice does not settle that save. Retry sends only the same choice and command."), node("label", { class: "intake-consent" }, stopAck, "I understand that stopping retries does not undo the save or turn off an email reminder."));
        actions.append(retry, stop);
      }
    } else host.append(node("p", {}, "Read the current reminder choice to check your access before changing it."));
    element.append(host, actions, status);sync();
    if (focusRequested && status.isConnected) { focusRequested = false;status.focus(); }
  }
  async function load() {
    if (disposed || busy || !isCurrent()) return;
    paused = false;const n = ++generation;busy = true;render();
    try {
      const value = checkedOwnReminder(await transport(base + "/reminder"), participationId);
      if (!live() || n !== generation) return;
      model = value;admitted = true;affirmed = false;affirmation.checked = false;
      notify(pending ? "The current choice was read. The retained save still needs its exact response or an explicit decision to stop retrying." : "The current choice was read. No email was scheduled.");
    } catch (error) {
      if (!live() || n !== generation) return;
      if ([401,403,404].includes(error.status)) { dispose();onAccessLost(error);return; }
      // Failed reads revoke the earlier snapshot's permission to make a new save.
      model = null;affirmed = false;affirmation.checked = false;
      notify("The current reminder choice could not be read. Try reading it again.", true);
    } finally { if (!disposed && n === generation) { busy = false;dirty();render(); } }
  }
  async function send(enabled) {
    if (!live() || !admitted || busy || typeof enabled !== "boolean") return;
    if (!pending && (enabled ? !model?.reminder.canEnable || !matchesDisplay() || !affirmed : !model?.reminder.canDisable)) return;
    try { await runMutation(async () => {
      if (!live() || busy) return;
      if (!pending) {
        if (!model || (enabled ? !model.reminder.canEnable || !matchesDisplay() || !affirmed : !model.reminder.canDisable)) return;
        const body = { version: 1, revision: model.revision, intakeRevision: model.intakeRevision, reminderRevision: model.reminder.revision, enabled, consentVersion: VERSION, commandKey: crypto.randomUUID() };
        if (enabled) body.commitmentSha256 = model.reminder.currentCommitmentSha256;
        pending = { body: Object.freeze(body), serialized: JSON.stringify(body) };
      }
      const command = pending, n = generation;busy = true;dirty();render();
      try {
        const outcome = checkedSaved(await transport(base + "/reminder-preference", { method: "POST", body: command.body }), command, participationId);
        if (!live() || n !== generation || pending !== command) return;
        accepted = outcome;pending = null;model = null;affirmed = abandon = false;affirmation.checked = stopAck.checked = false;
        notify("The original reminder choice save was accepted. Read the choice again before another change.");
      } catch (error) {
        if (disposed || pending !== command || !live() || n !== generation) return;
        if ([401,403,404].includes(error.status)) { dispose();onAccessLost(error);return; }
        // Even a later 429 or conflict cannot disprove an earlier interrupted acceptance.
        notify(error.status === 409 ? "The retained save could not be reconciled. Read the current choice, then explicitly retry or stop retrying this save." : "The save response is uncertain. Use the explicit retry or stop retrying controls.", true);
      } finally { if (!disposed && n === generation) { busy = false;dirty();render(); } }
    }, status); } finally { if (live()) sync(); }
  }
  function stopRetrying() {
    if (!live() || busy || !admitted || !pending || !abandon) return;
    pending = null;model = null;accepted = null;affirmed = abandon = false;affirmation.checked = stopAck.checked = false;dirty();
    notify("Retries stopped in this tab. This did not undo a saved choice. Read the current choice before making another change.");render();
  }
  function pause() {
    if (disposed) return;
    paused = true;admitted = false;generation++;busy = false;model = accepted = null;affirmed = abandon = false;affirmation.checked = stopAck.checked = false;status.textContent = "";focusRequested = false;
    for (const controller of owned) controller.abort();element.replaceChildren();dirty();
  }
  function dispose() {
    if (disposed) return;
    pause();disposed = true;pending = model = accepted = null;onDirty(false);globalThis.window?.removeEventListener?.("pagehide", dispose);
  }
  globalThis.window?.addEventListener?.("pagehide", dispose);
  render();
  return { element, load, pause, dispose, hasPendingCommand: () => !!pending, hasUnsavedChanges: () => !!(pending || affirmed || abandon) };
}
