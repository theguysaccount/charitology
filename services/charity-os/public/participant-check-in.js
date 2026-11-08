/** Deliberate unverified arrival only. No authentication, attendance, storage or automatic Retry. */
const CI_ID = /^[A-Za-z0-9_-]{1,100}$/, CI_SHA = /^[a-f0-9]{64}$/;
const CI_AFFIRMATION = "I am reporting my own arrival. The organization can retain and review this unverified report. This does not record attendance or time worked.";
const ciFail = () => { throw new Error("The self-report response could not be verified. Your writing and any uncertain exact command are kept."); };
const ciKeys = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...keys].sort().join("|")) ciFail(); };
const ciId = v => typeof v === "string" && CI_ID.test(v);
const ciSha = v => typeof v === "string" && CI_SHA.test(v);
const ciInt = (v, min = 1) => Number.isSafeInteger(v) && v >= min && v <= 2147483647;
const ciInstant = v => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const ciUtc = v => ciInstant(v) && new Date(v).toISOString() === v;
function ciDisposition(v) {
  ciKeys(v, ["originMode", "state", "originalState", "revision", "staffReview", "attendance", "workedMinutes"]);
  if (v.originMode !== "live" || !["reported", "withdrawn"].includes(v.state) || v.originalState !== v.state || v.revision !== (v.state === "reported" ? 1 : 2) || v.staffReview !== "not-recorded" || v.attendance !== null || v.workedMinutes !== null) ciFail();
  return v;
}
function ciSummary(v) {
  if (v === null) return null;
  ciKeys(v, ["id", "claimedArrivalAt", "submittedAt", "withdrawnAt", "claimSha256", "currentDisposition"]);ciDisposition(v.currentDisposition);
  if (!ciId(v.id) || !ciInstant(v.claimedArrivalAt) || !ciUtc(v.submittedAt) || !ciSha(v.claimSha256) || !(v.withdrawnAt === null || ciUtc(v.withdrawnAt)) || (v.withdrawnAt === null) !== (v.currentDisposition.state === "reported") || (v.withdrawnAt && Date.parse(v.withdrawnAt) < Date.parse(v.submittedAt))) ciFail();
  return v;
}
function ciRange(v) {
  ciKeys(v, ["startAt", "endAt", "timeZone"]);
  if (!ciInstant(v.startAt) || !ciInstant(v.endAt) || Date.parse(v.startAt) >= Date.parse(v.endAt) || typeof v.timeZone !== "string" || v.timeZone.length > 100) ciFail();
  try { new Intl.DateTimeFormat("en", { timeZone: v.timeZone }); } catch { ciFail(); }
}
export function checkedOwnCheckIn(v, pid) {
  ciKeys(v, ["ok", "participationId", "revision", "intakeRevision", "checkInRevision", "context", "window", "serverNow", "canReport", "canWithdraw", "unavailableReason", "report"]);
  if (v.ok !== true || v.participationId !== pid || !ciInt(v.revision) || !ciInt(v.intakeRevision) || !ciInt(v.checkInRevision, 0) || !ciUtc(v.serverNow) || typeof v.canReport !== "boolean" || typeof v.canWithdraw !== "boolean" || ![null, "before-start", "after-window", "not-confirmed", "unsupported-origin", "parent-unavailable", "commitment-changed", "history-exists"].includes(v.unavailableReason)) ciFail();
  ciSummary(v.report);
  if (v.report ? v.checkInRevision !== v.report.currentDisposition.revision : v.checkInRevision !== 0) ciFail();
  if (v.context !== null) {
    ciKeys(v.context, ["title", "kind", "occurrence", "effectiveRange", "participationPurpose", "participantInstructions", "organizerEmail", "organizerUrl", "sourceRevision", "termsHash", "commitmentSha256"]);
    ciRange(v.context.occurrence);ciRange(v.context.effectiveRange);
    for (const key of ["title", "participationPurpose", "participantInstructions", "organizerEmail", "organizerUrl"]) if (!(v.context[key] === null || typeof v.context[key] === "string" && v.context[key].length <= 4096)) ciFail();
    if (!["session", "shift"].includes(v.context.kind) || !ciInt(v.context.sourceRevision) || !ciSha(v.context.termsHash) || !ciSha(v.context.commitmentSha256)) ciFail();
  }
  if (v.window !== null) { ciKeys(v.window, ["opensAt", "closesAt"]);if (!ciUtc(v.window.opensAt) || !ciUtc(v.window.closesAt)) ciFail(); }
  if ((v.context === null) !== (v.window === null) || v.canReport && (!v.context || v.report || v.unavailableReason !== null) || v.canWithdraw && (!v.report || v.report.currentDisposition.state !== "reported")) ciFail();
  return v;
}
export function checkInCivil(date, time) {
  const d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(date), t = /^(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?$/.exec(time);
  if (!d || !t || +d[1] < 1900 || +d[1] > 2200 || +t[1] > 23 || +t[2] > 59 || +(t[3] || 0) > 59) throw new Error("Enter a complete local date and time in the displayed zone. Nothing is filled automatically.");
  const day = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
  if (day.toISOString().slice(0, 10) !== date) throw new Error("Enter a real local calendar date.");
  return `${date}T${t[1]}:${t[2]}:${t[3] || "00"}.${(t[4] || "").padEnd(3, "0")}`;
}
function ciResolved(v, model, civil, choice, pid) {
  ciKeys(v, ["ok", "participationId", "revision", "intakeRevision", "commitmentSha256", "civil", "timeZone", "kind", "reason", "candidates", "claimedArrivalAt"]);
  if (v.ok !== true || v.participationId !== pid || v.revision !== model.revision || v.intakeRevision !== model.intakeRevision || v.commitmentSha256 !== model.context.commitmentSha256 || v.civil !== civil || v.timeZone !== model.context.effectiveRange.timeZone || !["unique", "fold", "gap", "unsupported"].includes(v.kind) || ![null, "date-range", "zone", "offset", "multiplicity"].includes(v.reason) || !Array.isArray(v.candidates) || v.candidates.length !== (v.kind === "unique" ? 1 : v.kind === "fold" ? 2 : 0)) ciFail();
  const names = v.kind === "unique" ? ["unique"] : v.kind === "fold" ? ["earlier", "later"] : [];
  v.candidates.forEach((c, i) => { ciKeys(c, ["choice", "claimedArrivalAt"]);if (c.choice !== names[i] || !ciInstant(c.claimedArrivalAt)) ciFail(); });
  const expected = v.kind === "unique" ? v.candidates[0].claimedArrivalAt : v.candidates.find(c => c.choice === choice)?.claimedArrivalAt ?? null;
  if (v.claimedArrivalAt !== expected) ciFail();return v;
}
function ciOutcome(v, pending) {
  ciKeys(v, ["ok", "result", "currentDisposition", "replayed"]);ciKeys(v.result, ["action", "id", "revision", "claimSha256", "at", "auditRetained"]);ciDisposition(v.currentDisposition);
  const r = v.result;
  if (v.ok !== true || typeof v.replayed !== "boolean" || r.action !== (pending.action === "report" ? "reported" : "withdrawn") || r.revision !== (pending.action === "report" ? 1 : 2) || !ciId(r.id) || !ciSha(r.claimSha256) || !ciUtc(r.at) || typeof r.auditRetained !== "boolean" || pending.action === "withdraw" && (r.id !== pending.claimId || r.claimSha256 !== pending.body.reportSha256 || v.currentDisposition.state !== "withdrawn")) ciFail();
  return v;
}
function ciNode(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") n.setAttribute("class", v);else if (["disabled", "checked", "hidden", "required"].includes(k)) n[k] = !!v;else n.setAttribute(k, String(v)); }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
function ciSaved(host, report, currentState = null) {
  host.replaceChildren();if (!report) { host.append(ciNode("p", {}, "No live self-report is available here. This is not a record of absence or zero attendance."));return; }
  host.append(ciNode("p", {}, "Unverified self-reported arrival — not attendance or time worked."),ciNode("p", {}, `Claimed arrival: ${report.claimedArrivalAt}`),ciNode("p", {}, `Submitted by the service: ${report.submittedAt}`),ciNode("p", {}, report.withdrawnAt ? `Assertion withdrawn: ${report.withdrawnAt}. Original history remains.` : currentState === "withdrawn" ? "Assertion withdrawn; its exact withdrawal time has not been reloaded." : "Assertion currently reported; staff verification is not recorded."));
}
export function createOwnCheckInPane({ orgId, intakeId, participationId, request, isCurrent = () => true, onDirty = () => {}, onAccessLost = () => {}, runMutation = fn => fn() }) {
  for (const v of [orgId, intakeId, participationId]) if (!ciId(v)) ciFail();
  const base = `/api/participant/orgs/${encodeURIComponent(orgId)}/requests/${encodeURIComponent(intakeId)}/participations/${encodeURIComponent(participationId)}/check-in`;
  let disposed = false, paused = false, accessAdmitted = false, generation = 0, busy = false, model = null, resolved = null, pending = null, accepted = null, acceptedCurrent = false, focusRequested = false, dateValue = "", timeValue = "", choiceValue = "", affirmed = false, withdrawalConfirmed = false;
  const owned = new Set(), element = ciNode("section", { class: "participant-checkin" }), contextHost = ciNode("div"), savedHost = ciNode("div"), actions = ciNode("div", { class: "actions" }), status = ciNode("p", { class: "form-status", role: "status", tabindex: "-1" }), fields = ciNode("form"), date = ciNode("input", { type: "date", required: true, "aria-label": "Local arrival date" }), time = ciNode("input", { type: "time", step: "0.001", required: true, "aria-label": "Local arrival time" }), choice = ciNode("select", { "aria-label": "Repeated local time choice" },ciNode("option", { value: "" }, "Choose earlier or later…"),ciNode("option", { value: "earlier" }, "Earlier occurrence"),ciNode("option", { value: "later" }, "Later occurrence")), affirmation = ciNode("input", { type: "checkbox" }), withdrawAck = ciNode("input", { type: "checkbox" });
  const reviewHost = ciNode("div"), foldLabel = ciNode("label", {}, "This local time occurs twice; choose explicitly",choice);
  const live = () => !disposed && !paused && isCurrent();
  const dirty = () => onDirty(!!(dateValue || timeValue || pending || affirmed));
  const notify = (text, error = false, focus = false) => { if (!live()) return;status.textContent = text;status.classList.toggle("error", error);if (focus) { focusRequested = true;if (!busy) render(); } };
  const button = (text, fn) => { const b = ciNode("button", { type: "button", class: "button subtle" }, text);b.addEventListener("click", () => { if (live() && !busy) void fn(); });return b; };
  const loadButton = button("Reload self-report", () => load());
  const resolveButton = button("Resolve entered local time", () => resolve());
  const reportButton = button("Record unverified arrival", () => send("report"));
  const withdrawButton = button("Withdraw this assertion", () => send("withdraw"));
  const retryButton = button("Retry exact command", () => send(pending?.action));
  const invalidate = () => { generation++;resolved = null;affirmed = false;affirmation.checked = false;choiceValue = "";choice.value = "";dirty();renderResolution(); };
  date.addEventListener("input", () => { if (!live() || !accessAdmitted || busy || pending) return;dateValue = date.value;invalidate(); });
  time.addEventListener("input", () => { if (!live() || !accessAdmitted || busy || pending) return;timeValue = time.value;invalidate(); });
  choice.addEventListener("change", () => { if (!live() || !accessAdmitted || busy || pending) return;choiceValue = choice.value;resolved = null;affirmed = false;affirmation.checked = false;generation++;dirty();renderResolution(); });
  affirmation.addEventListener("change", () => { if (!live() || !accessAdmitted || busy || pending) return;affirmed = affirmation.checked;dirty();syncControls(); });
  withdrawAck.addEventListener("change", () => { if (!live() || !accessAdmitted || busy || pending) return;withdrawalConfirmed = withdrawAck.checked;syncControls(); });
  fields.addEventListener("submit", e => e.preventDefault());
  async function transport(path, options = {}) { const controller = new AbortController();owned.add(controller);try { return await request(path,{...options,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])}); } finally { owned.delete(controller); } }
  function render() {
    if (!live()) return;
    if (!accessAdmitted) {
      actions.replaceChildren(loadButton);loadButton.disabled = busy;
      element.replaceChildren(ciNode("h5", {}, "Arrival self-report"),ciNode("p", {}, "Current own access must be checked before private self-report content or commands are shown."),actions,status);
      if (focusRequested && element.isConnected && status.isConnected) { focusRequested = false;status.focus(); }
      return;
    }
    element.replaceChildren(ciNode("h5", {}, "Arrival self-report"),ciNode("p", { class: "fine" }, "One unverified assertion. Booking, participation consent, operational email and attendance remain separate."),contextHost,savedHost,fields,actions,status);
    contextHost.replaceChildren();fields.replaceChildren();actions.replaceChildren(loadButton);
    if (model?.context) { const c = model.context;contextHost.append(ciNode("p", {}, c.title),ciNode("p", {}, `Frozen commitment: ${c.effectiveRange.startAt} – ${c.effectiveRange.endAt} · ${c.effectiveRange.timeZone}`),ciNode("p", {}, c.participationPurpose),ciNode("p", {}, c.participantInstructions)); }
    if (model?.report) ciSaved(savedHost,model.report,acceptedCurrent ? accepted?.currentDisposition.state : null);else if (!accepted) ciSaved(savedHost,null);else savedHost.replaceChildren();
    if (accepted) savedHost.append(ciNode("p", { class: "notice" }, `Exact ${accepted.result.action} command accepted at ${accepted.result.at}. Response disposition: ${accepted.currentDisposition.state}; a later loaded state may differ.${accepted.result.auditRetained ? "" : " Its journal entry was not retained; the assertion remains saved."}`));
    if (model?.canReport && !accepted) {
      fields.append(ciNode("label", {}, "Local arrival date",date),ciNode("label", {}, "Local arrival time",time),ciNode("p", { class: "fine" }, "Blank until you enter it. A minute-only choice is reviewed with seconds and milliseconds zero; your device timezone is not used."),resolveButton,foldLabel,reviewHost);
      renderResolution();
    } else if (model && !model.report && !accepted) contextHost.append(ciNode("p", { class: "notice" }, `New reporting is unavailable: ${model.unavailableReason || "current state"}.`));
    const savedClaim = model?.report;
    if (model?.canWithdraw && savedClaim && accepted?.currentDisposition.state !== "withdrawn") fields.append(ciNode("label", { class: "intake-consent" },withdrawAck,"I want to withdraw only this unverified arrival assertion. Its original history remains; this does not cancel participation."),withdrawButton);
    if (pending) { actions.append(retryButton);contextHost.append(ciNode("p", { class: "notice" }, "An earlier response may be unknown. Retry only this exact command; a read alone cannot verify its receipt or audit outcome.")); }
    syncControls();
    if (focusRequested && element.isConnected && status.isConnected) { focusRequested = false;status.focus(); }
  }
  function syncControls() {
    for (const control of [date,time,choice,affirmation,withdrawAck,resolveButton,reportButton,withdrawButton]) control.disabled = busy || !!pending || !accessAdmitted;
    reportButton.disabled ||= !affirmed || !resolved?.claimedArrivalAt;withdrawButton.disabled ||= !withdrawalConfirmed;
    retryButton.disabled = busy || !accessAdmitted;loadButton.disabled = busy;
  }
  function renderResolution() {
    foldLabel.hidden = !(resolved?.kind === "fold" || choiceValue);reviewHost.replaceChildren();
    if (resolved?.claimedArrivalAt) reviewHost.append(ciNode("p", { class: "notice" }, `Review exact arrival: ${resolved.claimedArrivalAt} · ${resolved.timeZone}`),ciNode("label", { class: "intake-consent" },affirmation,CI_AFFIRMATION),reportButton);
    else if (resolved) reviewHost.append(ciNode("p", { class: "notice" },resolved.kind === "fold" ? "Choose earlier or later, then resolve again. Neither is selected automatically." : "That local time cannot be resolved. Your entries are kept; choose a real time in the displayed zone."));
    syncControls();
  }
  async function load() {
    if (disposed || busy || !isCurrent()) return;paused = false;const n = ++generation;busy = true;if (!accessAdmitted) status.textContent = "Checking current own access…";render();
    try { const value = checkedOwnCheckIn(await transport(base),participationId);if (!live() || n !== generation) return;model = value;accessAdmitted = true;acceptedCurrent = false;resolved = null;choiceValue = "";choice.value = "";affirmed = false;affirmation.checked = false;withdrawalConfirmed = false;withdrawAck.checked = false;notify("Current own access and saved self-report loaded. Arrival is not filled automatically.",false,true); }
    catch (error) { if (n !== generation || !live()) return;if ([401,403,404].includes(error.status)) { dispose();onAccessLost(error);return; }notify(error.message,true,true); }
    finally { if (n === generation) { busy = false;render(); } }
  }
  async function resolve() {
    if (!live() || !accessAdmitted || busy || pending || !model?.canReport) return;
    let civil;try { civil = checkInCivil(dateValue,timeValue); } catch (e) { notify(e.message,true,true);return; }
    const snapshot = model, selected = choiceValue || null, n = ++generation;busy = true;render();
    try { const result = ciResolved(await transport(base+"/resolve-arrival",{method:"POST",body:{revision:snapshot.revision,intakeRevision:snapshot.intakeRevision,commitmentSha256:snapshot.context.commitmentSha256,civil,resolution:selected}}),snapshot,civil,selected,participationId);if (!live() || n !== generation) return;resolved = result;affirmed = false;affirmation.checked = false;notify(result.claimedArrivalAt ? "Review the exact resolved arrival and make the separate affirmation." : "Review the time resolution before reporting.",false,true); }
    catch (error) { if (n === generation && live()) { if ([401,403,404].includes(error.status)) { dispose();onAccessLost(error); } else notify(error.message,true,true); } }
    finally { if (n === generation) { busy = false;render(); } }
  }
  async function send(action) {
    if (!live() || !accessAdmitted || busy || !["report","withdraw"].includes(action)) return;
    if (!pending && (action === "report" ? !model?.canReport || !resolved?.claimedArrivalAt || !affirmed : !model?.canWithdraw || !model.report || !withdrawalConfirmed)) return;
    try { await runMutation(async () => {
      if (!live() || busy) return;
      if (!pending) {
        const body = action === "report" ? {revision:model.revision,intakeRevision:model.intakeRevision,checkInRevision:0,commitmentSha256:model.context.commitmentSha256,claimedArrivalAt:resolved.claimedArrivalAt,reportConsent:true,consentVersion:"arrival-self-report-v1",idempotencyKey:crypto.randomUUID()} : {checkInRevision:model.report.currentDisposition.revision,reportSha256:model.report.claimSha256,withdraw:true,idempotencyKey:crypto.randomUUID()};
        pending = {action,body,serialized:JSON.stringify(body),claimId:model.report?.id,uncertain:false};
      }
      const command = pending,n = generation;busy = true;dirty();render();
      try {
        const value = await transport(base+"/"+command.action,{method:"POST",body:JSON.parse(command.serialized)});
        if (!live() || n !== generation || pending !== command) { command.uncertain = true;return; }
        command.uncertain = true;const outcome = ciOutcome(value,command);accepted = outcome;acceptedCurrent = true;pending = null;
        if (command.action === "report" && outcome.currentDisposition.state === "reported") model = {...model,canReport:false,canWithdraw:true,checkInRevision:1,report:{id:outcome.result.id,claimedArrivalAt:command.body.claimedArrivalAt,submittedAt:outcome.result.at,withdrawnAt:null,claimSha256:outcome.result.claimSha256,currentDisposition:outcome.currentDisposition}};
        else if (command.action === "withdraw") model = {...model,canWithdraw:false,checkInRevision:2,report:{...model.report,withdrawnAt:outcome.result.at,currentDisposition:outcome.currentDisposition}};
        else model = {...model,canReport:false,canWithdraw:false};
        dateValue = timeValue = "";date.value = time.value = "";affirmed = false;withdrawalConfirmed = false;affirmation.checked = withdrawAck.checked = false;dirty();notify("Exact command accepted. The saved assertion remains separate from attendance and booking.",false,true);
      } catch (error) {
        if (pending !== command || disposed) return;
        if (!live() || n !== generation) { command.uncertain = true;return; }
        const known = [400,401,403,404,413,415,422,429].includes(error.status) || error.status === 409 && ["checkin_context","checkin_window","checkin_exists","checkin_intent"].includes(error.code);
        if (!command.uncertain && known) pending = null;else command.uncertain = true;
        if ([401,403,404].includes(error.status)) { dispose();onAccessLost(error);return; }
        if (live() && n === generation) notify(error.message || "The response is unknown. Use explicit exact Retry.",true,true);
      } finally { if (!disposed && n === generation) { busy = false;dirty();render(); } }
    },status); } finally { if (live()) syncControls(); }
  }
  function pause() { if (disposed) return;paused = true;accessAdmitted = false;focusRequested = false;status.textContent = "";generation++;busy = false;resolved = null;affirmed = false;if (pending) pending.uncertain = true;for (const c of owned) c.abort();element.replaceChildren(); }
  function dispose() { if (disposed) return;pause();disposed = true;model = resolved = pending = accepted = null;dateValue = timeValue = choiceValue = "";date.value = time.value = "";affirmation.checked = withdrawAck.checked = false;withdrawalConfirmed = false;onDirty(false);globalThis.window?.removeEventListener?.("pagehide",dispose); }
  globalThis.window?.addEventListener?.("pagehide",dispose);
  return {element,load,pause,dispose,hasUnsavedChanges:()=>!!(dateValue||timeValue||pending||affirmed)};
}
export function createStaffCheckInPane({ orgId,targetId,participationId,request,isCurrent = () => true }) {
  for (const v of [orgId,targetId,participationId]) if (!ciId(v)) ciFail();
  let disposed = false,generation = 0;const owned = new Set(),element = ciNode("section",{class:"participant-checkin"}),status = ciNode("p",{role:"status",tabindex:"-1"}),host = ciNode("div");element.append(host,status);
  const dispose = () => { disposed = true;generation++;for (const c of owned) c.abort();element.replaceChildren();globalThis.window?.removeEventListener?.("pagehide",dispose); };
  async function load() { if (disposed || !isCurrent()) return;const n = ++generation,c = new AbortController();owned.add(c);host.replaceChildren();status.textContent = "Loading scoped unverified claim…";
    try { const v = await request(`/api/orgs/${encodeURIComponent(orgId)}/participation-targets/${encodeURIComponent(targetId)}/participations/${encodeURIComponent(participationId)}/check-in`,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(30000)])});ciKeys(v,["ok","participationId","report"]);if (v.ok !== true || v.participationId !== participationId) ciFail();ciSummary(v.report);if (disposed || !isCurrent() || n !== generation) return;ciSaved(host,v.report);status.textContent = "Scoped read only. No staff verification, attendance, work time or booking changed."; }
    catch { if (!disposed && isCurrent() && n === generation) { host.replaceChildren();status.textContent = "This self-report is unavailable. No earlier claim is displayed.";if (status.isConnected && element.isConnected) status.focus(); } }
    finally { owned.delete(c); }
  }
  globalThis.window?.addEventListener?.("pagehide",dispose);return {element,load,dispose};
}
