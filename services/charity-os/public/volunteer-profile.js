const SKILLS = [
  ["event-support", "Event support"], ["operations", "Operations"],
  ["communications", "Communications"], ["translation", "Translation"],
  ["technology", "Technology"], ["fundraising", "Fundraising"],
  ["research", "Research"], ["logistics", "Logistics"],
];
const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];
const TIMES = [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]];
const WINDOWS = DAYS.flatMap(([day]) => TIMES.map(([time]) => day + "-" + time));
const MAX = 2147483647;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const EXACT = /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
const invalid = () => { throw new Error("The saved preferences could not be verified."); };
const currentView = value => value?.profile || { skills: [], availability: [] };
const sameSelections = (left, right) =>
  ["skills", "availability"].every(key => left[key].length === right[key].length &&
    left[key].every((value, index) => value === right[key][index]));

function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length ||
      keys.some(key => !fields[key]?.enumerable || !Object.hasOwn(fields[key], "value"))) invalid();
}
function orderedSelections(values, choices) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype ||
      values.length > choices.length || Reflect.ownKeys(values).length !== values.length + 1) invalid();
  let previous = -1;
  for (let index = 0; index < values.length; index++) {
    const field = Object.getOwnPropertyDescriptor(values, String(index));
    if (!field?.enumerable || !Object.hasOwn(field, "value")) invalid();
    const selected = choices.indexOf(field.value);
    if (selected <= previous) invalid();
    previous = selected;
  }
  return Object.freeze([...values]);
}
function timeZone(value) {
  if (!matches(/^[A-Za-z0-9_+/:.-]{1,100}$/, value)) invalid();
  new Intl.DateTimeFormat("en", { timeZone: value });
  return value;
}
function checkedView(value) {
  closed(value, ["ok", "version", "revision", "workspaceTimeZone", "profile", "scopeSha256", "replayed"]);
  if (value.ok !== true || value.version !== 1 || !Number.isInteger(value.revision) || value.revision < 0 ||
      value.revision > MAX || !matches(SHA, value.scopeSha256) || typeof value.replayed !== "boolean") invalid();
  timeZone(value.workspaceTimeZone);
  let profile = null;
  if (value.profile !== null) {
    closed(value.profile, ["skills", "availability", "timeZone", "updatedAtExact"]);
    const { updatedAtExact } = value.profile;
    const skills = orderedSelections(value.profile.skills, SKILLS.map(([id]) => id));
    const availability = orderedSelections(value.profile.availability, WINDOWS);
    if (!value.revision || !(skills.length || availability.length) || !matches(EXACT, updatedAtExact) ||
        !Number.isFinite(Date.parse(updatedAtExact)) ||
        new Date(updatedAtExact).toISOString() !== updatedAtExact.slice(0, 23) + "Z") invalid();
    profile = Object.freeze({ skills, availability, timeZone: timeZone(value.profile.timeZone), updatedAtExact });
  }
  return Object.freeze({ ...value, profile });
}
function checkedOutcome(value, command) {
  const saved = checkedView(value), { body, workspaceTimeZone, noOp } = command;
  if (saved.scopeSha256 !== body.scopeSha256 || saved.workspaceTimeZone !== workspaceTimeZone ||
      saved.revision !== body.expectedRevision + (noOp ? 0 : 1) || (noOp && saved.replayed)) invalid();
  if (body.operation === "clear" ? saved.profile !== null :
    !saved.profile || saved.profile.timeZone !== workspaceTimeZone || !sameSelections(saved.profile, body)) invalid();
  return saved;
}
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  for (const child of children) element.append(typeof child === "string" ? document.createTextNode(child) : child);
  return element;
}

export function createOwnVolunteerProfilePane({
  enabled = false, orgId, intakeId, request, isCurrent = () => false,
  onDirty = () => {}, onAccessLost = () => {}, runMutation = fn => fn(),
} = {}) {
  if (enabled === true && (!matches(ID, orgId) || !matches(ID, intakeId) || typeof request !== "function")) invalid();
  const path = enabled === true ? `/api/participant/orgs/${orgId}/requests/${intakeId}/volunteer-profile` : null;
  let model = null, draft = null, pending = null, work = null, needsRead = true;
  let askingClear = false, paused = false, disposed = false;
  const live = () => enabled === true && !disposed && !paused && isCurrent() === true;
  const element = node("section", { class: "participant-checkin volunteer-profile", "aria-label": "Your volunteer preferences" });
  const summary = node("p", { class: "fine" }), zone = node("p", { class: "fine" });
  const status = node("p", { class: "form-status", role: "status", "aria-atomic": "true", tabindex: "-1" });
  const agree = node("input", { type: "checkbox", autocomplete: "off" });
  const abandon = node("input", { type: "checkbox", autocomplete: "off" });
  const consent = node("label", { class: "intake-consent" }, agree,
    "I want to save these optional preferences for my linked request.");
  const reload = button("Read saved volunteer preferences", load);
  const useSaved = button("Use saved selections", () => {
    draft = null;
    agree.checked = false;
    render();
    notify("This tab now shows the saved selections.");
  });
  const save = button("Save preferences", () => send("save"));
  const clear = button("Clear saved preferences", () => {
    askingClear = true;
    agree.checked = false;
    render();
    clearPrompt.focus();
  });
  const confirmClear = button("Confirm clear", () => send("clear"));
  const cancelClear = button("Keep saved preferences", () => {
    askingClear = false;
    render();
    clear.focus();
  });
  const retry = button("Retry the same preference change", () => send(pending?.body.operation, true));
  const stop = button("Stop retrying this preference change", () => {
    pending = null;
    abandon.checked = false;
    agree.checked = false;
    needsRead = true;
    render();
    notify("This tab stopped retrying. Read the saved preferences before making another change.");
  });
  const clearPrompt = node("div", { class: "notice", role: "region", "aria-label": "Clear saved volunteer preferences", tabindex: "-1" },
    node("p", {}, "Clear the saved skills and typical times for this request?"),
    node("div", { class: "actions" }, confirmClear, cancelClear));
  const pendingNote = node("p", {});
  const pendingBox = node("div", { class: "snapshot" }, pendingNote,
    node("label", { class: "intake-consent" }, abandon, "I understand the earlier change may already be saved."),
    node("div", { class: "actions" }, retry, stop));

  function choice(id, label, fullLabel = label) {
    const input = node("input", { type: "checkbox", "aria-label": fullLabel, autocomplete: "off" });
    input.addEventListener("change", () => {
      if (!live() || input.disabled) return;
      const values = { skills: selected(skills), availability: selected(availability) };
      draft = sameSelections(values, currentView(model)) ? null : values;
      agree.checked = false;
      sync();
    });
    return { id, input, label: node("label", {}, input, label) };
  }
  const selected = controls => controls.filter(({ input }) => input.checked).map(({ id }) => id);
  const skills = SKILLS.map(([id, label]) => choice(id, label));
  const availability = [];
  const week = DAYS.map(([day, label]) => {
    const choices = TIMES.map(([time, name]) => choice(day + "-" + time, name, label + " " + name.toLowerCase()));
    availability.push(...choices);
    return node("fieldset", {}, node("legend", {}, label), ...choices.map(entry => entry.label));
  });
  const editor = node("div", { class: "volunteer-profile-editor" }, summary,
    node("fieldset", {}, node("legend", {}, "Work you are interested in"),
      node("div", { class: "volunteer-profile-grid" }, ...skills.map(entry => entry.label))),
    node("fieldset", {}, node("legend", {}, "When you are usually free"), zone,
      node("div", { class: "volunteer-profile-grid" }, ...week)),
    consent, node("div", { class: "actions" }, save, clear, useSaved), clearPrompt);
  element.append(node("h3", {}, "Your volunteer preferences"),
    node("p", {}, "Choose any work you are interested in and the times you are usually free. These preferences are optional."),
    reload, editor, pendingBox, status);

  function button(text, invoke) {
    const control = node("button", { type: "button", class: "button subtle" }, text);
    control.addEventListener("click", async () => {
      if (live() && control.isConnected && !control.disabled) await invoke();
    });
    return control;
  }
  function hasUnsavedChanges() { return !!pending || !!draft || agree.checked || askingClear; }
  function retryIsCurrent() {
    return !needsRead && model && pending && model.scopeSha256 === pending.body.scopeSha256 &&
      model.workspaceTimeZone === pending.workspaceTimeZone;
  }
  function sync() {
    const editable = live() && !!model && !needsRead && !work && !pending && !askingClear;
    for (const { input } of [...skills, ...availability]) input.disabled = !editable;
    const values = draft || currentView(model);
    const canSave = editable && model.revision < MAX - 1 && (values.skills.length > 0 || values.availability.length > 0);
    agree.disabled = !canSave;
    save.disabled = !canSave || !agree.checked;
    clear.disabled = !editable || !model?.profile || model.revision >= MAX;
    useSaved.hidden = !draft || !model;
    useSaved.disabled = !editable || !draft;
    clearPrompt.hidden = !askingClear;
    cancelClear.disabled = confirmClear.disabled = !askingClear || !!work;
    reload.disabled = !!work;
    pendingBox.hidden = !pending;
    retry.disabled = !!work || !retryIsCurrent();
    abandon.disabled = !pending || !!work;
    stop.disabled = abandon.disabled || !abandon.checked;
    onDirty(hasUnsavedChanges());
  }
  agree.addEventListener("change", sync);
  abandon.addEventListener("change", sync);
  function render() {
    element.hidden = !live();
    const view = live() ? model : null;
    const values = live() ? draft || currentView(view) : currentView(null);
    for (const [controls, selection] of [[skills, values.skills], [availability, values.availability]])
      for (const { id, input } of controls) input.checked = selection.includes(id);
    editor.hidden = !live() || (!view && !draft);
    summary.textContent = view
      ? `${needsRead ? "Last read" : "Saved"} revision ${view.revision}.` +
        (draft ? " The controls show your unsaved selections." : view.profile ? "" : " Your saved preferences are empty.")
      : "Your unsaved selections are kept in this tab. Read the saved preferences to continue.";
    zone.textContent = view
      ? `Typical times use the workspace time zone ${view.workspaceTimeZone}. Leave times unspecified by keeping them unchecked.` +
        (view.profile && view.profile.timeZone !== view.workspaceTimeZone ? ` The last save used ${view.profile.timeZone}.` : "")
      : "Read the saved preferences to check the workspace time zone.";
    pendingNote.textContent = pending && !retryIsCurrent()
      ? "Read the current saved preferences before retrying. If the request changed, stop retrying to prepare a new change."
      : "The earlier change may already be saved. Retry sends the same request from this tab.";
    sync();
  }
  function notify(text, error = false) {
    status.textContent = text;
    status.classList.toggle("error", error);
    if (live() && status.isConnected) status.focus();
  }
  function begin() {
    work = new AbortController();
    render();
    return work;
  }
  function current(controller) {
    if (work !== controller) return false;
    if (!live()) { dispose(); return false; }
    return true;
  }
  function finish(controller) {
    if (work === controller) { work = null; render(); }
  }
  function transport(controller, options = {}) {
    return request(path, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
  }
  function accessEnded(error) {
    if (![401, 403, 404].includes(error?.status)) return false;
    dispose();
    onAccessLost(error);
    return true;
  }
  async function load() {
    if (!live() || work || !element.isConnected) return;
    needsRead = true;
    agree.checked = abandon.checked = askingClear = false;
    const controller = begin();
    notify("Reading your saved preferences…");
    try {
      const view = checkedView(await transport(controller));
      if (!current(controller)) return;
      if (view.replayed) invalid();
      model = view;
      needsRead = false;
      if (draft && sameSelections(draft, currentView(model))) draft = null;
      notify(pending ? "Saved preferences loaded. The earlier change still needs a response." :
        draft ? "Saved preferences loaded. Your unsaved selections are kept for review." : "Saved preferences loaded.");
    } catch (error) {
      if (current(controller) && !accessEnded(error)) notify("The saved preferences could not be read. Try the read again.", true);
    } finally { finish(controller); }
  }
  async function send(operation, retrying = false) {
    if (!live() || work || !model || needsRead) return;
    if (retrying ? !retryIsCurrent() : pending || (operation === "save" ? save.disabled : !askingClear)) return;
    const values = draft || currentView(model);
    const command = pending || {
      body: Object.freeze({ version: 1, operation, expectedRevision: model.revision,
        scopeSha256: model.scopeSha256, acknowledge: true, ...(operation === "save" ? {
          skills: Object.freeze([...values.skills]), availability: Object.freeze([...values.availability]),
        } : {}) }),
      workspaceTimeZone: model.workspaceTimeZone,
      noOp: operation === "save" && model.profile?.timeZone === model.workspaceTimeZone &&
        sameSelections(model.profile, values),
    };
    const controller = begin();
    try {
      await runMutation(async () => {
        if (!current(controller)) return;
        pending = command;
        agree.checked = abandon.checked = askingClear = false;
        render();
        notify(operation === "clear" ? "Clearing your saved preferences…" : "Checking your preference save…");
        try {
          const result = checkedOutcome(await transport(controller, { method: "POST", body: command.body }), command);
          if (!current(controller)) return;
          model = result;
          draft = pending = null;
          notify(operation === "clear" ? "Saved preferences cleared." : "Your preferences were saved.");
        } catch (error) {
          if (!current(controller) || accessEnded(error)) return;
          if (!retrying && error?.status === 409 &&
              ["volunteer_profile_changed", "volunteer_profile_revision"].includes(error.code)) {
            pending = null;
            needsRead = true;
            notify("The saved preferences changed or reached their revision limit. Read them again to review your selections.", true);
          } else notify("The result is uncertain. Use Retry to check the same request.", true);
        }
      }, status);
    } catch {
      if (current(controller)) notify(pending
        ? "The result is uncertain. Use Retry to check the same request."
        : "Your selections are kept. Try saving them again.", true);
    } finally { finish(controller); }
  }
  function pause() {
    paused = true;
    work?.abort();
    work = model = null;
    needsRead = true;
    agree.checked = abandon.checked = askingClear = false;
    status.textContent = "";
    render();
  }
  function resume() {
    if (!disposed && isCurrent() === true) { paused = false; render(); }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    draft = pending = null;
    pause();
    element.replaceChildren();
  }
  render();
  return { element, load, pause, resume, dispose, hasUnsavedChanges, hasPendingCommand: () => !!pending };
}
