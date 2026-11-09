/** A deliberately opened, own-only choice for one issued shift substitution. */
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const WIRE_TIME = /^(?:19|20|21|22)\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/;
const EXACT_TIME = /^(?!0000)\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/;
const states = {
  unanswered: "You have not recorded a choice for this offer.",
  accepted: "You agreed to this proposed change. An organizer still needs to review it.",
  expired: "Your earlier agreement has expired.",
  withdrawn: "You withdrew your agreement for this offer.",
};
const actions = {
  leaving: "I agree to give up my place if the organizer approves this change.",
  joining: "I agree to take this place if the organizer approves this change.",
  withdraw: "I want to withdraw my agreement for this offer.",
};
const invalid = () => { throw new Error("This shift substitution response could not be verified."); };
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
function closed(value, keys) {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length ||
      keys.some(key => !fields[key]?.enumerable || !Object.hasOwn(fields[key], "value"))) invalid();
}
function instant(value, pattern) {
  if (!matches(pattern, value) || !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  return new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
}
function exactOf(value) {
  return new Date(value).toISOString().slice(0, -1) + "000Z";
}
function formatter(timeZone, value) {
  const fraction = value?.match(/\.(\d{1,3})/)?.[1];
  return new Intl.DateTimeFormat(undefined, { timeZone, year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "shortOffset",
    ...(fraction && Number(fraction) !== 0 ? { fractionalSecondDigits: fraction.length } : {}) });
}
function checkShift(shift) {
  closed(shift, ["title", "startAt", "endAt", "timeZone"]);
  if (typeof shift.title !== "string" || !shift.title.trim() || shift.title.length > 180 ||
      !instant(shift.startAt, WIRE_TIME) || !instant(shift.endAt, WIRE_TIME) ||
      +shift.startAt.slice(0,4) > 2200 || +shift.endAt.slice(0,4) > 2200 ||
      Date.parse(shift.startAt) >= Date.parse(shift.endAt) || typeof shift.timeZone !== "string" ||
      !shift.timeZone || shift.timeZone.length > 100) invalid();
  let wallClock;
  try {
    wallClock = new Intl.DateTimeFormat("en-CA", { timeZone: shift.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch { invalid(); }
  for (const value of [shift.startAt, shift.endAt]) {
    const parts = Object.fromEntries(wallClock.formatToParts(new Date(value)).map(part => [part.type, part.value]));
    if (value.slice(0, 19) !== `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`) invalid();
  }
}
export function checkedOwnSubstitutionChoice(value) {
  closed(value, ["ok", "choice", "replayed"]);
  const choice = value.choice;
  closed(choice, ["version", "party", "shift", "offerExpiresAtExact", "state", "choiceRevision", "canAccept", "canWithdraw",
    "acceptedAtExact", "expiresAtExact", "withdrawnAtExact", "reviewSha256"]);
  if (value.ok !== true || typeof value.replayed !== "boolean" || choice.version !== 1 ||
      !["leaving", "joining"].includes(choice.party) || typeof choice.state !== "string" || !Object.hasOwn(states, choice.state) ||
      !matches(SHA, choice.reviewSha256) || !instant(choice.offerExpiresAtExact, EXACT_TIME) ||
      choice.canAccept !== (choice.state === "unanswered") || choice.canWithdraw !== (choice.state === "accepted")) invalid();
  checkShift(choice.shift);
  if (choice.state === "unanswered") {
    if (choice.choiceRevision !== 0 || choice.acceptedAtExact !== null ||
        choice.expiresAtExact !== null || choice.withdrawnAtExact !== null) invalid();
  } else {
    if (!instant(choice.acceptedAtExact, EXACT_TIME) || !instant(choice.expiresAtExact, EXACT_TIME) ||
        choice.acceptedAtExact >= choice.expiresAtExact || choice.expiresAtExact > choice.offerExpiresAtExact ||
        choice.expiresAtExact > exactOf(choice.shift.startAt)) invalid();
    if (choice.state === "withdrawn") {
      if (choice.choiceRevision !== 2 || !instant(choice.withdrawnAtExact, EXACT_TIME) ||
          choice.withdrawnAtExact < choice.acceptedAtExact || choice.withdrawnAtExact >= choice.expiresAtExact) invalid();
    } else if (choice.choiceRevision !== 1 || choice.withdrawnAtExact !== null) invalid();
  }
  return value;
}
const snapshot = choice => Object.freeze({ ...choice, shift: Object.freeze({ ...choice.shift }) });
function checkedSaved(value, { review, body }) {
  const { choice } = checkedOwnSubstitutionChoice(value);
  const withdrawing = body.choice === "withdraw";
  if (choice.choiceRevision !== body.expectedChoiceRevision + 1 || choice.party !== review.party ||
      choice.offerExpiresAtExact !== review.offerExpiresAtExact || choice.reviewSha256 === review.reviewSha256 ||
      Object.keys(review.shift).some(key => review.shift[key] !== choice.shift[key]) ||
      (withdrawing ? choice.state !== "withdrawn" || choice.acceptedAtExact !== review.acceptedAtExact ||
        choice.expiresAtExact !== review.expiresAtExact : !["accepted", "expired"].includes(choice.state)) ||
      (choice.state === "expired" && !value.replayed)) invalid();
  return snapshot(choice);
}
function node(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  for (const child of children) element.append(typeof child === "string" ? document.createTextNode(child) : child);
  return element;
}
function localTime(value, zone) {
  return node("time", { datetime: value }, formatter(zone, value).format(new Date(value)));
}
function exactTime(value) {
  return node("time", { datetime: value }, value.replace("T", " ").replace("Z", " UTC"));
}
function fact(label, value) { return node("div", {}, node("dt", {}, label), node("dd", {}, value)); }

export function createOwnSubstitutionPane({
  enabled = false, orgId, intakeId, participationId, request, isCurrent = () => true,
  onDirty = () => {}, onAccessLost = () => {}, runMutation = fn => fn(), disposeOnPageHide = true,
}) {
  if (![orgId, intakeId, participationId].every(value => matches(ID, value)) || typeof request !== "function") invalid();
  const path = `/api/participant/orgs/${orgId}/requests/${intakeId}/participations/${participationId}/substitution-choice`;
  let paused = false, disposed = false, missing = false, showing = false, admitted = false, reviewed = false;
  let work = null, model = null, pending = null;
  const controllers = new Set();
  const element = node("section", { class: "participant-checkin participant-substitution", "aria-label": "Shift substitution" });
  const heading = node("h5", {}, "Shift substitution"), facts = node("div");
  const status = node("p", { class: "form-status", role: "status", "aria-atomic": "true", tabindex: "-1" });
  const agree = node("input", { type: "checkbox" }), stopAgree = node("input", { type: "checkbox" });
  const agreement = node("span");
  const agreeLabel = node("label", { class: "intake-consent" }, agree, agreement);
  const stopLabel = node("label", { class: "intake-consent" }, stopAgree, "I understand that my choice may already be saved.");
  const live = () => enabled === true && !disposed && !paused && isCurrent();
  const dirty = () => onDirty(!!pending || agree.checked || stopAgree.checked);
  const button = (text, invoke) => {
    const control = node("button", { type: "button", class: "button subtle" }, text);
    control.addEventListener("click", async () => { if (live() && !work && !control.disabled) await invoke(); });
    return control;
  };
  const read = button("Read shift substitution offer", load);
  const submit = button("Save my choice", () => send(false));
  const retry = button("Retry the same choice", () => send(true));
  const stop = button("Stop retrying this choice", stopRetrying);
  const retryBox = node("div", {}, node("p", { class: "notice" },
    "This tab kept the exact choice. It may already be saved. Reading the current offer leaves the earlier choice unresolved."),
  stopLabel, node("div", { class: "actions" }, retry, stop));
  const controls = node("div", { class: "actions" }, read, submit);
  const action = () => !reviewed ? null : model?.canAccept ? "accept" : model?.canWithdraw ? "withdraw" : null;
  const notify = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle("error", error);
    if (live() && status.isConnected) status.focus();
  };
  function sync() {
    const fresh = !!action() && admitted && !pending && !missing;
    read.hidden = missing;
    read.disabled = missing || !!work;
    agreeLabel.hidden = submit.hidden = !fresh;
    agree.disabled = !fresh || !!work;
    submit.disabled = agree.disabled || !agree.checked;
    retryBox.hidden = !pending || !admitted || missing;
    retry.disabled = stopAgree.disabled = retryBox.hidden || !!work;
    stop.disabled = stopAgree.disabled || !stopAgree.checked;
  }
  agree.addEventListener("change", () => { if (live() && !agree.disabled) { dirty(); sync(); } });
  stopAgree.addEventListener("change", () => { if (live() && !stopAgree.disabled) { dirty(); sync(); } });
  function render() {
    element.hidden = !live();
    if (!live()) { element.replaceChildren(); showing = false; return; }
    if (!showing) { element.replaceChildren(heading, facts, agreeLabel, controls, retryBox, status); showing = true; }
    facts.replaceChildren();
    if (model) {
      const { shift, state, party, offerExpiresAtExact, expiresAtExact } = model;
      const details = node("dl", {},
        fact("Shift", shift.title), fact("Starts", localTime(shift.startAt, shift.timeZone)),
        fact("Ends", localTime(shift.endAt, shift.timeZone)), fact("Time zone", shift.timeZone),
        fact("Your role", party === "leaving" ? "Leave your confirmed place" : "Offer to take the place if approved"),
        fact("Offer closes", exactTime(offerExpiresAtExact)));
      if (state === "accepted") details.append(fact("Your agreement expires", exactTime(expiresAtExact)));
      facts.append(details, node("p", {}, states[state]));
    } else if (!missing) facts.append(node("p", { class: "fine" },
      "Read this offer to review the shift and your own choice. An organizer reviews any change to places separately."));
    if (action()) {
      agreement.textContent = actions[action() === "withdraw" ? "withdraw" : model.party];
      submit.textContent = action() === "withdraw" ? "Withdraw my agreement" : "Save my agreement";
    }
    sync();
  }
  async function transport(options) {
    const controller = new AbortController();
    controllers.add(controller);
    try { return await request(path, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) }); }
    finally { controllers.delete(controller); }
  }
  const begin = () => { work = {}; sync(); return work; };
  const current = token => live() && work === token;
  function finish(token) {
    if (work !== token) return;
    work = null; dirty(); render();
  }
  function clearReview() { model = null; reviewed = false; agree.checked = stopAgree.checked = false; }
  function accessBoundary(error) {
    if ([401, 403].includes(error?.status)) { dispose(); onAccessLost(error); return true; }
    if (error?.status !== 404) return false;
    missing = true; admitted = false; pending = null; clearReview(); render();
    notify("This shift substitution offer is unavailable. Refresh your linked request.", true);
    return true;
  }
  async function load() {
    if (enabled !== true || disposed || missing || work || !isCurrent()) return;
    paused = false;
    clearReview();
    const token = begin();
    render(); notify("Reading the shift substitution offer.");
    try {
      const value = checkedOwnSubstitutionChoice(await transport({}));
      if (!current(token)) return;
      if (value.replayed) invalid();
      model = snapshot(value.choice); admitted = reviewed = true;
      notify(pending ? "The current offer was read. Your earlier choice still needs its own response." : "The offer is ready to review.");
    } catch (error) {
      if (!current(token) || accessBoundary(error)) return;
      notify("The offer could not be read. Read it again before making a new choice.", true);
    } finally { finish(token); }
  }
  async function send(retrying) {
    if (!live() || work || !admitted || missing ||
        (retrying ? !pending : pending || !action() || !agree.checked)) return;
    const token = begin();
    try {
      await runMutation(async () => {
        if (!current(token) || (retrying ? !pending : !action() || !agree.checked)) return;
        const command = pending ?? {
          review: model,
          body: Object.freeze({ version: 1, choice: action(), reviewSha256: model.reviewSha256,
            expectedChoiceRevision: model.choiceRevision, acknowledge: true }),
        };
        pending = command;
        dirty(); render();
        if (!current(token)) return;
        try {
          const saved = checkedSaved(await transport({ method: "POST", body: command.body }), command);
          if (!current(token)) return;
          pending = null; clearReview(); model = saved;
          notify(saved.state === "expired" ? "Your earlier agreement was recorded and has expired." :
            "Your choice was saved. Read the offer again before making another change.");
        } catch (error) {
          if (!current(token) || accessBoundary(error)) return;
          if (!retrying && error?.status === 409 && error.code === "substitution_choice_changed") {
            pending = null; clearReview();
            notify("The offer changed. Read it again before saving a choice.", true);
          } else notify("The save response is uncertain. Retry the same choice or stop retrying.", true);
        }
      }, status);
    } catch {
      if (current(token)) notify("The choice could not be completed. Review the available controls.", true);
    } finally { finish(token); }
  }
  function stopRetrying() {
    if (!live() || work || !admitted || !pending || !stopAgree.checked) return;
    pending = null; clearReview(); dirty(); render();
    notify("This tab stopped retrying. Read the offer to check its current state.");
  }
  function pause() {
    if (disposed) return;
    paused = true; admitted = false; work = null; clearReview();
    status.textContent = "";
    for (const controller of controllers) controller.abort();
    controllers.clear();
    render(); dirty();
  }
  function resume() {
    if (enabled !== true || disposed || !isCurrent() || (!paused && !missing)) return;
    paused = missing = false;
    render();
  }
  function dispose() {
    if (disposed) return;
    pending = null; pause(); disposed = true;
    if (disposeOnPageHide) globalThis.window?.removeEventListener?.("pagehide", dispose);
  }
  if (enabled === true && disposeOnPageHide) globalThis.window?.addEventListener?.("pagehide", dispose);
  render();
  return { element, load, pause, resume, dispose, hasPendingCommand: () => !!pending,
    hasUnsavedChanges: () => !!pending || agree.checked || stopAgree.checked };
}
