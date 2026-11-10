const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d\d-\d\d$/, STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const states = {pending:"Pending choice",confirmed:"Renewal confirmed",withdrawn:"Choice withdrawn"};
const refusalCodes = new Set(["membership_assistance_fields","membership_assistance_changed",
  "membership_assistance_conflict","membership_assistance_closed"]);
const notice = "Renew my membership for the dates shown. This term is free to renew. I can ask staff in person to withdraw my choice until they confirm the renewal.";
const id = value => typeof value === "string" && ID.test(value);
const digest = value => typeof value === "string" && SHA.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const date = value => typeof value === "string" && DATE.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const stamp = value => value === null || (typeof value === "string" && STAMP.test(value) && Number.isFinite(Date.parse(value)));
const invalid = () => { throw new Error("The saved in-person renewal review could not be verified."); };
function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value,key))) invalid();
}
function period(value) {
  if (!date(value.startDate) || !date(value.endDate) || value.startDate > value.endDate ||
      (value.renewalDate !== null && (!date(value.renewalDate) ||
        value.renewalDate < value.startDate || value.renewalDate > value.endDate))) invalid();
}
function selectedRecord(value, expectedId) {
  closed(value,["id","title","revision","startDate","endDate","renewalDate"]);
  if (!id(value.id) || value.id !== expectedId || typeof value.title !== "string" || !value.title.trim() ||
      value.title.length > 180 || !revision(value.revision)) invalid();
  period(value);
}
function checkedReview(value, memberId, termId, allowReadOnly) {
  closed(value,["member","term","noticeRevision","reviewSha256"]);
  selectedRecord(value.member,memberId);
  selectedRecord(value.term,termId);
  if (value.noticeRevision !== 1 || !(digest(value.reviewSha256) || (allowReadOnly && value.reviewSha256 === null)))
    invalid();
  return value;
}
function checkedList(value, memberId) {
  closed(value,["ok","version","cases","canStart"]);
  if (value.ok !== true || value.version !== 1 || typeof value.canStart !== "boolean" ||
      !Array.isArray(value.cases) || value.cases.length > 32) invalid();
  const seen = new Set();
  for (const item of value.cases) {
    closed(item,["id","memberId","termId","state","revision"]);
    if (!id(item.id) || item.memberId !== memberId || !id(item.termId) || !Object.hasOwn(states,item.state) ||
        !revision(item.revision) || seen.has(item.id)) invalid();
    seen.add(item.id);
  }
  return value;
}
function checkedCase(value, memberId, caseId, operation, termId) {
  closed(value,["ok","version","case","replayed"]);
  if (value.ok !== true || value.version !== 1 || typeof value.replayed !== "boolean" || (!operation && value.replayed))
    invalid();
  const item = value.case;
  closed(item,["id","memberId","termId","state","revision","witnessedAtExact","actedAtExact","result","review","canConfirm","canWithdraw"]);
  if (!id(item.id) || (caseId && item.id !== caseId) || item.memberId !== memberId || !id(item.termId) ||
      (termId && item.termId !== termId) || !Object.hasOwn(states,item.state) || !revision(item.revision) ||
      !stamp(item.witnessedAtExact) || !stamp(item.actedAtExact) ||
      typeof item.canConfirm !== "boolean" || typeof item.canWithdraw !== "boolean") invalid();
  if (operation && !value.replayed && item.state !== {capture:"pending",confirm:"confirmed",withdraw:"withdrawn"}[operation])
    invalid();
  if (item.state === "confirmed") {
    closed(item.result,["memberRevision","startDate","endDate","renewalDate"]);
    if (!revision(item.result.memberRevision)) invalid();
    period(item.result);
  } else if (item.result !== null) invalid();
  if (item.review !== null) checkedReview(item.review,memberId,item.termId,true);
  if ((item.state !== "pending" && (item.canConfirm || item.canWithdraw)) ||
      (item.canConfirm && (!item.witnessedAtExact || !digest(item.review?.reviewSha256)))) invalid();
  return value;
}
const dates = item => `${item.startDate} through ${item.endDate}`;
const titleOf = item => `${item.title} · revision ${item.revision}`;

/** Mounted only on the exact staff record detail. A pending command lives in
 * this pane and is sent again only by the explicit Retry control. */
export function mountMembershipAssistance(host, {
  orgId, memberId, node, current, request, loadTerms, closureOnly = false,
  runMutation = work => work(), onChanged = () => {}, onObserved = () => {}, onAccessLost = () => {},
}) {
  if (!id(orgId) || !id(memberId)) throw new TypeError("Use the exact saved membership.");
  const base = `/api/orgs/${encodeURIComponent(orgId)}/membership-assistance`;
  const listPath = base + "/members/" + encodeURIComponent(memberId);
  const pathFor = caseId => base + "/cases/" + encodeURIComponent(caseId);
  const content = node("div",{class:"stack"}), controls = node("div",{class:"actions"});
  const retry = node("div",{class:"stack"});
  const status = node("p",{class:"form-status",role:"status","aria-atomic":"true",tabindex:"-1"});
  let view = null, list = null, selected = "", pending = null, op = null, disposed = false, unavailable = false;
  const live = () => !disposed && host.isConnected && current() === true;
  const active = operation => live() && op === operation;

  function dispose() {
    disposed = true;
    op?.abort();
    op = view = list = pending = null;
    selected = "";
    host.replaceChildren();
  }
  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? "form-status error" : "form-status";
    if (text && live() && status.isConnected) status.focus();
  }
  function button(label, work, primary = false, attrs = {}) {
    const control = node("button",{type:"button",class:primary ? "button primary" : "button subtle",...attrs},label);
    control.disabled = !!op;
    control.addEventListener("click", () => {
      if (control.isConnected && live() && !op && !control.disabled) void work();
    });
    return control;
  }
  function checkedAction(label, explanation, work, primary = false) {
    const check = node("input",{type:"checkbox",autocomplete:"off"});
    check.disabled = !!op;
    return [node("label",{class:"check-row"},check,explanation),button(label,() => {
      if (!check.checked) { message("Acknowledge this action before continuing.",true); check.focus(); return; }
      return work();
    },primary)];
  }
  function showError(error, fromWrite = false) {
    if ([401,403,404].includes(error?.status)) {
      view = list = pending = null;
      selected = "";
      unavailable = true;
      render();
      message("This in-person renewal review is unavailable. Refresh your access and reopen the membership.",true);
      onAccessLost(error);
      return;
    }
    if (fromWrite && pending && refusalCodes.has(error?.code) && [409,422].includes(error.status)) {
      pending = view = list = null;
      selected = "";
      render();
      message((error.message || "The service refused this review.") + " Read saved cases before making another change.",true);
      return;
    }
    message(pending ? "The change may already be saved. Use Retry to send the exact same request, or read saved cases." :
      error?.message || "Read the saved in-person renewal review again.",true);
  }
  async function operate(work, wrapped = false) {
    if (!live() || op || unavailable) return;
    const operation = new AbortController();
    op = operation;
    const signal = AbortSignal.any([operation.signal,AbortSignal.timeout(30000)]);
    render();
    try {
      if (wrapped) await runMutation(() => {
        if (active(operation)) return work(operation,signal);
      },status);
      else await work(operation,signal);
    } catch (error) {
      if (active(operation)) showError(error);
    } finally {
      if (op === operation) {
        op = null;
        if (!live()) dispose();
        else render();
      }
    }
  }
  const readList = () => operate(async (operation,signal) => {
    const value = checkedList(await request(listPath,{signal}),memberId);
    if (!active(operation)) return;
    list = value;
    view = {type:"list"};
    selected = "";
    message("Saved renewal cases loaded.");
  });
  const readCase = caseId => operate(async (operation,signal) => {
    const value = checkedCase(await request(pathFor(caseId),{signal}),memberId,caseId);
    if (!active(operation)) return;
    view = {type:"case",item:value.case};
    message("Saved renewal case loaded.");
    onObserved(value.case);
  });
  const chooseTerm = () => operate(async (operation,signal) => {
    const terms = await loadTerms(signal);
    if (!active(operation)) return;
    if (!Array.isArray(terms) || terms.length > 2000) invalid();
    const seen = new Set();
    for (const term of terms) {
      closed(term,["id","title","revision"]);
      if (!id(term.id) || seen.has(term.id) || typeof term.title !== "string" || !term.title.trim() ||
          term.title.length > 180 || !revision(term.revision)) invalid();
      seen.add(term.id);
    }
    view = {type:"choose",terms};
    selected = "";
    message("");
  });
  const reviewTerm = termId => operate(async (operation,signal) => {
    const body = {version:1,memberId,termId};
    const value = await request(base+"/review",{method:"POST",body,signal});
    closed(value,["ok","version","review"]);
    if (value.ok !== true || value.version !== 1) invalid();
    const review = checkedReview(value.review,memberId,termId,false);
    if (!active(operation)) return;
    view = {type:"review",review};
    message("Read the dates and notice with the member.");
  });
  const send = command => operate(async (operation,signal) => {
    pending = command;
    render();
    let response;
    try {
      response = await request(command.path,{method:"POST",body:command.body,signal});
    } catch (error) {
      if (active(operation)) showError(error,true);
      return;
    }
    const value = checkedCase(response,memberId,command.caseId,command.operation,command.termId);
    if (!active(operation)) return;
    pending = list = null;
    view = {type:"case",item:value.case};
    message(value.replayed ? "The earlier change was already recorded." : states[value.case.state] + ".");
    onChanged(value.case);
  },true);
  function write(operation,path,body,{caseId,termId} = {}) {
    return send(Object.freeze({operation,path,caseId,termId,body:Object.freeze({
      version:1,...body,idempotencyKey:crypto.randomUUID(),acknowledge:true,
    })}));
  }

  function renderReview(review) {
    content.append(
      node("p",{},`Current coverage for ${titleOf(review.member)}. ${dates(review.member)}.`),
      node("p",{},`Proposed coverage from ${titleOf(review.term)}. ${dates(review.term)}.`),
      node("h4",{},"In-person renewal notice"),
      node("blockquote",{},notice),
      node("p",{class:"fine"},`Notice revision ${review.noticeRevision}.`),
    );
  }
  function renderCase(item) {
    content.append(node("h4",{},states[item.state]),node("p",{class:"fine"},`Case revision ${item.revision}.`));
    if (item.witnessedAtExact && item.state !== "withdrawn")
      content.append(node("p",{class:"fine"},"Choice recorded ",node("time",{datetime:item.witnessedAtExact},item.witnessedAtExact),"."));
    if (item.actedAtExact)
      content.append(node("p",{class:"fine"},"Decision recorded ",node("time",{datetime:item.actedAtExact},item.actedAtExact),"."));
    if (item.state === "pending" && item.review) renderReview(item.review);
    if (item.result)
      content.append(node("p",{},`Recorded coverage ${dates(item.result)}. Membership revision ${item.result.memberRevision}.`));
    if (pending || item.state !== "pending") return;
    if (!closureOnly && item.canConfirm)
      content.append(...checkedAction("Confirm renewal","I reviewed the witnessed choice and the exact dates.",
        () => write("confirm",pathFor(item.id)+"/confirm",
          {revision:item.revision,reviewSha256:item.review.reviewSha256}, {caseId:item.id,termId:item.termId}),true));
    else if (!closureOnly)
      content.append(node("p",{class:"fine"},"A different authorized staff member can confirm when the exact review is current."));
    if (item.canWithdraw)
      content.append(...checkedAction("Withdraw pending choice","I received the member’s in-person request to withdraw this choice.",
        () => write("withdraw",pathFor(item.id)+"/withdraw",{revision:item.revision},{caseId:item.id,termId:item.termId})));
  }
  function render() {
    content.replaceChildren();
    controls.replaceChildren();
    retry.replaceChildren();
    if (unavailable || disposed) return;
    controls.append(button("Read saved cases",readList));
    if (view?.type === "list") {
      if (list.cases.length)
        content.append(node("ul",{class:"stack"},list.cases.map((item,index) => node("li",{},
          node("span",{},`Case ${index+1}. ${states[item.state]}. `),
          button("Open case",() => readCase(item.id),false,{"aria-label":`Open case ${index+1}. ${states[item.state]}`})))));
      else content.append(node("p",{},"No in-person renewal case is recorded for this member."));
      if (!closureOnly && !pending && list.canStart && !list.cases.some(item => item.state === "pending"))
        content.append(button("Choose an approved term",chooseTerm,true));
      else if (closureOnly || !list.canStart)
        content.append(node("p",{class:"fine"},"New in-person reviews are unavailable for this membership."));
    } else if (view?.type === "choose" && !pending) {
      if (!view.terms.length) content.append(node("p",{},"No approved renewal term was found for this membership."));
      else {
        const select = node("select",{"aria-label":"Approved renewal term"},
          node("option",{value:""},"Choose a renewal term"),
          view.terms.map(term => node("option",{value:term.id,selected:term.id === selected},titleOf(term))));
        select.disabled = !!op;
        content.append(node("label",{},"Approved renewal term",select),button("Review selected term",() => {
          selected = select.value;
          if (!view.terms.some(term => term.id === selected)) { message("Choose an approved renewal term.",true); return; }
          return reviewTerm(selected);
        },true));
      }
    } else if (view?.type === "review") {
      const review = view.review;
      renderReview(review);
      if (!pending) content.append(...checkedAction("Record witnessed choice",
        "I checked the member in person and heard them affirm this notice.",
        () => write("capture",base+"/cases",{memberId,termId:review.term.id,
          noticeRevision:review.noticeRevision,reviewSha256:review.reviewSha256},{termId:review.term.id}),true));
    } else if (view?.type === "case") {
      renderCase(view.item);
      controls.append(button("Read this case again",() => readCase(view.item.id)));
    }
    if (pending) retry.append(
      node("p",{class:"fine"},"The change may already be saved. Retry stays in this open review."),
      button("Retry the same change",() => send(pending),true),
      ...checkedAction("Stop retrying and read saved cases","I understand the earlier change may already be saved.",() => {
        pending = view = list = null;
        return readList();
      }),
    );
  }
  host.replaceChildren(
    node("h3",{},"In-person membership renewal"),
    node("p",{class:"fine"},"Follow your organization’s in-person identity check and withdrawal process. Ask another authorized staff member to handle your own membership."),
    content,controls,retry,status,
  );
  void readList();
  return Object.freeze({dispose});
}
