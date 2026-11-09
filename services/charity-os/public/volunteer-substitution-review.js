import { request as staffRequest } from "./api.js";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const INTENT = /^[a-f0-9]{32}$/;
const COMMAND_KEY = /^[A-Za-z0-9_-]{16,100}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EXACT_TIME = /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const ACCESS_LOSS = new Set(["substitution_unavailable", "substitution_receipt_scope"]);
const invalid = () => { throw new Error("The shift handoff response could not be verified."); };
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
const label = value => typeof value === "string" && value.trim().length > 0 && value.length <= 180;

function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length ||
      keys.some(key => !fields[key]?.enumerable || !Object.hasOwn(fields[key], "value"))) invalid();
}

function exactTime(value) {
  if (!matches(EXACT_TIME, value)) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value.slice(0, 23) + "Z";
}

function placeCount(places) {
  closed(places, ["before", "after"]);
  if (!Number.isSafeInteger(places.before) || places.before < 1 || places.before !== places.after) invalid();
}

function clock(timeZone) {
  if (typeof timeZone !== "string" || !timeZone || timeZone.length > 100) invalid();
  return new Intl.DateTimeFormat(undefined, {
    timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric",
    minute: "2-digit", second: "2-digit", timeZoneName: "shortOffset",
  });
}

function checkedReview(value) {
  closed(value, ["ok", "review"]);
  const review = value.review;
  const keys = ["version", "shift", "outgoing", "replacement", "confirmedPlaces", "ready"];
  const ready = Object.getOwnPropertyDescriptor(review ?? {}, "ready")?.value;
  if (ready === true) keys.push("reviewSha256");
  closed(review, keys);
  const { shift, outgoing, replacement, confirmedPlaces } = review;
  closed(shift, ["title", "startsAt", "endsAt", "timeZone"]);
  closed(outgoing, ["label", "state", "nextState"]);
  closed(replacement, ["label", "state", "nextState"]);
  placeCount(confirmedPlaces);
  if (value.ok !== true || review.version !== 1 || typeof ready !== "boolean" ||
      (ready && !matches(SHA256, review.reviewSha256)) ||
      !label(shift.title) || !exactTime(shift.startsAt) || !exactTime(shift.endsAt) || shift.startsAt >= shift.endsAt ||
      !label(outgoing.label) || outgoing.state !== "confirmed" || outgoing.nextState !== "cancelled" ||
      !label(replacement.label) || replacement.state !== "waitlisted" || replacement.nextState !== "confirmed") invalid();
  clock(shift.timeZone);
  return structuredClone(review);
}

function checkedDecision(value, expected) {
  closed(value, ["ok", "decision", "replayed"]);
  const decision = value.decision;
  closed(decision, ["version", "acceptedAtExact", "shift", "outgoing", "replacement", "confirmedPlaces"]);
  const { shift, outgoing, replacement, confirmedPlaces } = decision;
  closed(shift, ["startsAtExact", "endsAtExact"]);
  closed(outgoing, ["fromState", "toState"]);
  closed(replacement, ["fromState", "toState"]);
  placeCount(confirmedPlaces);
  if (value.ok !== true || typeof value.replayed !== "boolean" || decision.version !== 1 ||
      shift.startsAtExact !== expected.startsAt || shift.endsAtExact !== expected.endsAt ||
      !exactTime(decision.acceptedAtExact) || decision.acceptedAtExact >= expected.startsAt ||
      outgoing.fromState !== "confirmed" || outgoing.toState !== "cancelled" ||
      replacement.fromState !== "waitlisted" || replacement.toState !== "confirmed" ||
      confirmedPlaces.before !== expected.places) invalid();
  return structuredClone(value);
}

function node(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  for (const child of children) element.append(typeof child === "string" ? document.createTextNode(child) : child);
  return element;
}

function fact(labelText, ...value) { return node("div", {}, node("dt", {}, labelText), node("dd", {}, ...value)); }

function utc(value) { return node("time", { datetime: value }, value.replace("T", " ").replace("Z", " UTC")); }

function local(value, formatter) {
  return node("span", {}, node("time", { datetime: value }, formatter.format(new Date(value))), " (", utc(value), ")");
}

function reviewView(review) {
  const { shift, outgoing, replacement, confirmedPlaces, ready } = review;
  const formatter = clock(shift.timeZone);
  return node("div", { class: "snapshot" },
    node("h4", {}, "Proposed handoff"),
    node("dl", {},
      fact("Shift", shift.title), fact("Starts", local(shift.startsAt, formatter)),
      fact("Ends", local(shift.endsAt, formatter)), fact("Time zone", shift.timeZone),
      fact("Volunteer giving up the place", outgoing.label, " · Confirmed → Canceled"),
      fact("Volunteer taking the place", replacement.label, " · Waitlisted → Confirmed"),
      fact("Confirmed places", `${confirmedPlaces.before} before · ${confirmedPlaces.after} after`)),
    node("p", {}, ready ? "The organizer can confirm this exact change." :
      "This handoff is blocked. Read the review again after the requirements are met."));
}

function decisionView({ decision, replayed }) {
  const { shift, confirmedPlaces } = decision;
  return node("div", { class: "snapshot" },
    node("h4", {}, "Original saved decision"),
    node("p", {}, replayed ? "The service returned the decision from the earlier confirmation." :
      "The service saved this handoff."),
    node("dl", {},
      fact("Saved at", utc(decision.acceptedAtExact)),
      fact("Shift start", utc(shift.startsAtExact)), fact("Shift end", utc(shift.endsAtExact)),
      fact("Volunteer giving up the place", "Confirmed → Canceled"),
      fact("Volunteer taking the place", "Waitlisted → Confirmed"),
      fact("Confirmed places at confirmation", `${confirmedPlaces.before} before · ${confirmedPlaces.after} after`)));
}

export function createVolunteerSubstitutionReviewPane({
  enabled = false, orgId, intentId, request = staffRequest, isCurrent = () => false,
  onDirty = () => {}, onAccessLost = () => {}, onChanged = () => {},
  canMutate = () => true,
  makeCommandKey = () => crypto.randomUUID(),
} = {}) {
  if (enabled === true && (!matches(ID, orgId) || !matches(INTENT, intentId) ||
      typeof request !== "function" || typeof isCurrent !== "function")) invalid();
  const path = enabled === true ? `/api/orgs/${orgId}/volunteer-substitutions/${intentId}` : null;
  const element = node("section", { class: "participant-checkin volunteer-substitution-review", "aria-label": "Volunteer shift handoff" });
  element.hidden = true;
  const reviewDetails = node("div"), history = node("div");
  const status = node("p", { class: "form-status", role: "status", "aria-atomic": "true", tabindex: "-1" });
  const acknowledge = node("input", { type: "checkbox", autocomplete: "off" });
  const stopAcknowledge = node("input", { type: "checkbox", autocomplete: "off" });
  const acknowledgement = node("label", { class: "intake-consent" }, acknowledge,
    "I reviewed both changes, the shift time and the confirmed place count. I want to confirm this handoff.");
  const stopAcknowledgement = node("label", { class: "intake-consent" }, stopAcknowledge,
    "I understand that the earlier confirmation may already be saved.");
  let model = null, saved = null, pending = null, work = null, paused = false, disposed = false;
  let dirtyState = false;

  const read = button("Read handoff review", load);
  const confirm = button("Confirm handoff", startConfirmation);
  const retry = button("Retry the same confirmation", send);
  const stop = button("Stop retrying this confirmation", stopRetrying);
  const retryBox = node("div", { class: "snapshot" },
    node("p", {}, "The earlier confirmation may already be saved. Retry sends the same request from this tab."),
    stopAcknowledgement, node("div", { class: "actions" }, retry, stop));
  const contents = [
    node("h3", {}, "Volunteer shift handoff"),
    node("p", {}, "Review who would give up a place and who would take it on this shift."),
    reviewDetails, acknowledgement, node("div", { class: "actions" }, read, confirm), retryBox, history, status,
  ];

  function button(text, invoke) {
    const control = node("button", { type: "button", class: "button subtle" }, text);
    control.addEventListener("click", async () => {
      if (hasScope() && control.isConnected && !control.disabled) await invoke();
    });
    return control;
  }

  function hasScope() {
    if (enabled !== true || disposed || paused) return false;
    if (isCurrent() === true) return true;
    dispose();
    return false;
  }

  function sync() {
    const fresh = model?.ready === true && !pending && !saved;
    acknowledgement.hidden = confirm.hidden = !fresh;
    acknowledge.disabled = !fresh || !!work;
    confirm.disabled = acknowledge.disabled || !acknowledge.checked;
    read.disabled = !!work;
    retryBox.hidden = !pending;
    retry.disabled = stopAcknowledge.disabled = !pending || !!work;
    stop.disabled = stopAcknowledge.disabled || !stopAcknowledge.checked;
    const dirty = !!pending || acknowledge.checked;
    if (dirty !== dirtyState) {
      dirtyState = dirty;
      onDirty(dirty);
    }
  }

  acknowledge.addEventListener("change", () => {
    if (hasScope() && !acknowledge.disabled) sync();
  });
  stopAcknowledge.addEventListener("change", () => {
    if (hasScope() && !stopAcknowledge.disabled) sync();
  });

  function render() {
    reviewDetails.replaceChildren(...(model ? [reviewView(model)] : []));
    history.replaceChildren(...(saved ? [decisionView(saved)] : []));
    sync();
  }

  function notify(text, error = false, focus = true) {
    status.textContent = text;
    status.classList.toggle("error", error);
    if (focus && status.isConnected) status.focus();
  }

  function begin() {
    work = new AbortController();
    sync();
    return work;
  }

  function current(controller) { return work === controller && hasScope(); }

  function finish(controller) {
    if (work !== controller) return;
    work = null;
    sync();
  }

  function transport(suffix, controller, options) {
    return request(`${path}/${suffix}`, {
      ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    });
  }

  function accessEnded(error) {
    if (![401, 403].includes(error?.status) && !ACCESS_LOSS.has(error?.code)) return false;
    dispose();
    onAccessLost();
    return true;
  }

  async function load() {
    if (!hasScope() || !element.isConnected || work) return;
    model = null;
    acknowledge.checked = stopAcknowledge.checked = false;
    const controller = begin();
    render();
    notify("Reading the current handoff review…", false, false);
    try {
      const value = await transport("review", controller);
      if (!current(controller)) return;
      model = checkedReview(value);
      render();
      notify(pending ? "The earlier confirmation is still unresolved." : "Handoff review loaded.");
    } catch (error) {
      if (!current(controller) || accessEnded(error)) return;
      notify(error?.status === 404 ? "The handoff review is no longer available." :
        "The service could not verify the handoff review. Read it again before confirming.", true);
    } finally {
      finish(controller);
    }
  }

  async function startConfirmation() {
    if (!model?.ready || pending || saved || !acknowledge.checked) return;
    if (canMutate() !== true) {
      notify("Finish the other participation change before confirming this handoff.", true);
      return;
    }
    let idempotencyKey;
    try {
      idempotencyKey = makeCommandKey();
      if (!matches(COMMAND_KEY, idempotencyKey)) invalid();
    } catch {
      notify("This tab could not start a confirmation. Try again to create one request.", true);
      return;
    }
    pending = {
      body: Object.freeze({ version: 1, reviewSha256: model.reviewSha256, idempotencyKey, acknowledge: true }),
      startsAt: model.shift.startsAt, endsAt: model.shift.endsAt, places: model.confirmedPlaces.before,
    };
    model = null;
    acknowledge.checked = false;
    await send();
  }

  async function send() {
    if (!pending) return;
    if (canMutate() !== true) {
      notify("Finish the other participation change before retrying the confirmation.", true);
      return;
    }
    const command = pending;
    const controller = begin();
    stopAcknowledge.checked = false;
    render();
    notify("Checking the confirmation…", false, false);
    let changed = false;
    try {
      const value = await transport("confirm", controller, { method: "POST", body: command.body });
      if (!current(controller)) return;
      saved = checkedDecision(value, command);
      pending = model = null;
      render();
      notify("The original saved decision is shown.");
      changed = true;
    } catch (error) {
      if (!current(controller) || accessEnded(error)) return;
      model = null;
      render();
      notify("The service could not confirm the result. Retry the same confirmation to check the original request.", true);
    } finally {
      finish(controller);
    }
    if (changed) onChanged();
  }

  function stopRetrying() {
    if (!pending || !stopAcknowledge.checked) return;
    pending = model = null;
    acknowledge.checked = stopAcknowledge.checked = false;
    render();
    notify("This tab removed the retry. Read a fresh review to see if the handoff is still available.");
  }

  function clearView() {
    const controller = work;
    work = model = saved = null;
    controller?.abort();
    acknowledge.checked = stopAcknowledge.checked = false;
    element.hidden = true;
    element.replaceChildren();
    notify("", false, false);
    render();
  }

  function pause() {
    if (disposed || paused) return;
    paused = true;
    clearView();
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (!hasScope()) return;
    element.replaceChildren(...contents);
    element.hidden = false;
    render();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pending = null;
    window.removeEventListener("pagehide", dispose);
    clearView();
  }

  if (enabled === true && hasScope()) {
    element.append(...contents);
    element.hidden = false;
    window.addEventListener("pagehide", dispose);
    render();
  }
  return { element, load, pause, resume, dispose, hasPendingCommand: () => !!pending, hasUnsavedChanges: () => dirtyState };
}
