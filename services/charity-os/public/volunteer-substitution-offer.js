import { createVolunteerSubstitutionReviewPane } from "./volunteer-substitution-review.js";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const INTENT = /^[a-f0-9]{32}$/;
const TIME = /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const MATCH = ["shiftId", "shiftRevision", "outgoingId", "outgoingRevision"];
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
const displayText = value => typeof value === "string" && value.trim().length > 0 && value.length <= 180;
const invalid = () => { throw new Error("The shift handoff options could not be verified."); };
const sameScope = (a, b) => !!a && !!b && MATCH.every(key => a[key] === b[key]);

export function staffSubstitutionScope(target, detail, row) {
  if (target?.moduleId !== "volunteers" || target.mode !== "managed" || target.recoveryBlock ||
      detail?.sourceApproved !== true || (detail.terms || target.terms)?.kind !== "shift" ||
      !matches(ID, target.targetId) || !revision(detail.currentSourceRevision) ||
      row?.targetId !== target.targetId || row.moduleId !== "volunteers" || row.state !== "confirmed" ||
      row.source !== "intake" || row.recovered !== false || row.requestedInterval != null ||
      !matches(ID, row.intakeId) || !matches(ID, row.id) || !revision(row.revision)) return null;
  return Object.freeze({ shiftId: target.targetId, shiftRevision: detail.currentSourceRevision,
    outgoingId: row.id, outgoingRevision: row.revision });
}

function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length ||
      keys.some(key => !fields[key]?.enumerable || !Object.hasOwn(fields[key], "value"))) invalid();
}

function exactTime(value) {
  return matches(TIME, value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value.slice(0, 23) + "Z";
}

function formatter(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.length || timeZone.length > 100) invalid();
  return new Intl.DateTimeFormat(undefined, { timeZone, year: "numeric", month: "short",
    day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "shortOffset" });
}

function offer(value, startsAt) {
  closed(value, ["version", "intentId", "expiresAtExact"]);
  if (value.version !== 1 || !matches(INTENT, value.intentId) || !exactTime(value.expiresAtExact) ||
      value.expiresAtExact > startsAt) invalid();
  return structuredClone(value);
}

function checkedOptions(result, expected) {
  closed(result, ["ok", "options"]);
  const value = result.options;
  closed(value, ["version", "shift", "outgoing", "replacement", "offer"]);
  const { shift, outgoing, replacement } = value;
  closed(shift, ["id", "revision", "title", "startsAt", "endsAt", "timeZone"]);
  const checkLeg = leg => {
    closed(leg, ["id", "revision", "label"]);
    if (!matches(ID, leg.id) || !revision(leg.revision) || !displayText(leg.label)) invalid();
  };
  checkLeg(outgoing);
  if (replacement !== null) checkLeg(replacement);
  if (result.ok !== true || value.version !== 1 || !displayText(shift.title) ||
      !exactTime(shift.startsAt) || !exactTime(shift.endsAt) || shift.startsAt >= shift.endsAt ||
      shift.id !== expected.shiftId || shift.revision !== expected.shiftRevision ||
      outgoing.id !== expected.outgoingId || outgoing.revision !== expected.outgoingRevision ||
      replacement?.id === outgoing.id || (value.offer !== null && replacement === null)) invalid();
  formatter(shift.timeZone);
  if (value.offer !== null) offer(value.offer, shift.startsAt);
  return structuredClone(value);
}

function issueBody({ shift, outgoing, replacement }) {
  const leg = ({ id, revision }) => Object.freeze({ id, revision });
  return Object.freeze({ version: 1, shiftId: shift.id, shiftRevision: shift.revision,
    outgoing: leg(outgoing), replacement: leg(replacement) });
}

function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  for (const child of children) element.append(typeof child === "string" ? document.createTextNode(child) : child);
  return element;
}

const fact = (label, value) => node("div", {}, node("dt", {}, label), node("dd", {}, value));
const utc = value => value.replace("T", " ").replace("Z", " UTC");
const sameBody = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The server alone supplies the eligible replacement. The browser sends the
 * two reviewed selector/revision pairs and never guesses from the visible queue. */
export function createVolunteerSubstitutionOfferPane({
  orgId, scope, currentScope, request, isCurrent, canMutate,
  onDirty = () => {}, onAccessLost = () => {}, onChanged = () => {},
}) {
  if (!matches(ID, orgId) || !matches(ID, scope?.shiftId) || !matches(ID, scope?.outgoingId) ||
      !revision(scope.shiftRevision) || !revision(scope.outgoingRevision)) invalid();
  const base = `/api/orgs/${orgId}/volunteer-substitutions`;
  const selection = `${base}/shifts/${scope.shiftId}/${scope.outgoingId}`;
  let pending = null, model = null, review = null, activeOffer = null, work = null, paused = false, disposed = false;
  const element = node("section", { class: "participant-checkin volunteer-substitution-offer", "aria-label": "Prepare a volunteer shift handoff" });
  const details = node("div"), reviewHost = node("div");
  const status = node("p", { class: "form-status", role: "status", "aria-atomic": "true", tabindex: "-1" });
  const agree = node("input", { type: "checkbox", autocomplete: "off" });
  const stopAgree = node("input", { type: "checkbox", autocomplete: "off" });
  const label = node("label", { class: "intake-consent" }, agree, "I reviewed the shift and these two volunteer roles.");
  const stopLabel = node("label", { class: "intake-consent" }, stopAgree, "I understand the offer may already be prepared.");
  const read = button("Check handoff options", load);
  const issue = button("Prepare this handoff offer", start);
  const stop = button("Stop checking this offer", stopChecking);
  const pendingBox = node("div", { class: "snapshot" }, node("p", {},
    "The offer may already be prepared. Check the saved offer for this exact pair before starting another one."), stopLabel, stop);
  const live = () => !disposed && !paused && isCurrent() === true;
  const fresh = () => live() && sameScope(scope, currentScope());

  function button(text, invoke) {
    const control = node("button", { type: "button", class: "button subtle" }, text);
    control.addEventListener("click", async () => {
      if (live() && control.isConnected && !control.disabled) await invoke();
    });
    return control;
  }
  function notify(text, error = false, focus = true) {
    status.textContent = text;
    status.classList.toggle("error", error);
    if (focus && status.isConnected && live()) status.focus();
  }
  function hasPendingCommand() { return !!pending || review?.hasPendingCommand() === true; }
  function hasUnsavedChanges() { return !!pending || agree.checked || review?.hasUnsavedChanges() === true; }
  function sync() {
    const canPrepare = fresh() && model?.replacement && !activeOffer && !pending;
    read.textContent = pending ? "Check saved handoff offer" : "Check handoff options";
    read.hidden = !!activeOffer;
    read.disabled = !fresh() || !!work;
    label.hidden = issue.hidden = !canPrepare;
    agree.disabled = !canPrepare || !!work;
    issue.disabled = agree.disabled || !agree.checked;
    pendingBox.hidden = !pending;
    stopAgree.disabled = !pending || !!work;
    stop.disabled = stopAgree.disabled || !stopAgree.checked;
    onDirty(hasUnsavedChanges());
  }
  agree.addEventListener("change", sync);
  stopAgree.addEventListener("change", sync);
  element.append(node("h3", {}, "Prepare a volunteer shift handoff"),
    node("p", {}, "Review one confirmed place and the first eligible person on the waiting list. Each volunteer makes their own choice in their linked request."),
    details, label, node("div", { class: "actions" }, read, issue), pendingBox, reviewHost, status);

  function render() {
    element.hidden = !live();
    details.replaceChildren();
    if (live() && model) {
      const { shift, outgoing, replacement } = model;
      const time = formatter(shift.timeZone);
      details.append(node("dl", { class: "snapshot" },
        fact("Shift", shift.title),
        fact("Starts", time.format(new Date(shift.startsAt)) + " · " + utc(shift.startsAt)),
        fact("Ends", time.format(new Date(shift.endsAt)) + " · " + utc(shift.endsAt)),
        fact("Time zone", shift.timeZone), fact("Confirmed volunteer", outgoing.label),
        fact("First eligible replacement", replacement?.label || "No eligible waiting volunteer")));
    }
    if (live() && activeOffer) details.append(node("p", { class: "notice" },
      "Offer closes " + utc(activeOffer.expiresAtExact) + ". Ask both volunteers to check their own linked request."));
    sync();
  }
  function scopedError(error) {
    if (![401, 403].includes(error?.status) &&
        !["substitution_unavailable", "substitution_receipt_scope"].includes(error?.code)) return false;
    dispose();
    onAccessLost();
    return true;
  }
  function attach(saved) {
    activeOffer = saved;
    review = createVolunteerSubstitutionReviewPane({
      enabled: true, orgId, intentId: saved.intentId, request,
      canMutate,
      isCurrent: () => live() && activeOffer?.intentId === saved.intentId,
      onDirty: sync, onAccessLost: () => { dispose(); onAccessLost(); }, onChanged,
    });
    reviewHost.replaceChildren(review.element);
  }
  async function operation(path, options, accept, unavailableText) {
    const controller = new AbortController();
    work = controller;
    sync();
    const current = () => live() && work === controller && !controller.signal.aborted;
    try {
      const result = await request(path, {
        ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (current()) {
        if (fresh()) accept(result);
        else notify("The saved shift or selected place changed. Review its current ledger.", true);
      }
    } catch (error) {
      if (current() && !scopedError(error)) notify(unavailableText, true);
    } finally {
      if (work === controller) {
        work = null;
        render();
      }
    }
  }
  async function load() {
    if (!fresh() || activeOffer || work || !element.isConnected) return;
    model = null;
    agree.checked = stopAgree.checked = false;
    render();
    notify("Checking the current shift and waiting list…", false, false);
    await operation(selection, {}, result => {
      const checked = checkedOptions(result, scope);
      if (pending && (!checked.offer || !checked.replacement || !sameBody(pending, issueBody(checked)))) {
        notify("A saved offer for the earlier request could not be verified. Check again or stop checking it.", true);
        return;
      }
      model = checked;
      if (checked.offer) {
        pending = null;
        attach(checked.offer);
        notify("The saved handoff offer is ready to review.");
      } else notify(checked.replacement ? "Review the exact shift and both volunteers." : "This shift has no eligible replacement.");
    }, "The handoff options could not be checked. Read them again before preparing an offer.");
  }
  async function start() {
    if (!fresh() || work || pending || activeOffer || !model?.replacement || !agree.checked) return;
    if (canMutate() !== true) {
      notify("Finish the other participation change before preparing this offer.", true);
      return;
    }
    const reviewed = model, body = issueBody(reviewed);
    pending = body;
    agree.checked = false;
    model = null;
    render();
    notify("Preparing the reviewed handoff offer…", false, false);
    await operation(base + "/offers", { method: "POST", body }, result => {
      closed(result, ["ok", "offer"]);
      if (result.ok !== true) invalid();
      const saved = offer(result.offer, reviewed.shift.startsAt);
      pending = null;
      attach(saved);
      notify("Handoff offer prepared. Both volunteers can review their own choice.");
    }, "The offer response is uncertain. Check the saved offer for this exact pair.");
  }
  function stopChecking() {
    if (!pending || work || !stopAgree.checked) return;
    pending = model = null;
    stopAgree.checked = false;
    render();
    notify("This tab stopped checking the earlier request. Read current options before preparing an offer.");
  }
  function pause() {
    if (paused || disposed) return;
    paused = true;
    work?.abort();
    work = model = null;
    agree.checked = stopAgree.checked = false;
    review?.pause();
    notify("", false, false);
    render();
  }
  function resume() {
    if (disposed || isCurrent() !== true) return;
    paused = false;
    review?.resume();
    render();
  }
  function dispose() {
    if (disposed) return;
    pause();
    disposed = true;
    pending = activeOffer = null;
    review?.dispose();
    review = null;
    element.replaceChildren();
    sync();
  }
  render();
  return { element, load, pause, resume, dispose, hasPendingCommand, hasUnsavedChanges };
}
