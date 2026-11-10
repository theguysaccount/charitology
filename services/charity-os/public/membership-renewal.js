const part = encodeURIComponent;
const termText = (term) => term ? `${term.startDate} through ${term.endDate}` : "Unavailable";
const renewalLabels = {
  open: "Renewal is open for review",
  "request-recorded": "Renewal request received",
  "review-again": "The renewal needs a fresh review",
  "renewal-recorded": "Renewal recorded",
  unavailable: "No current renewal is available",
};
const directoryLabels = {
  withheld: "No choice recorded",
  "opt-in-recorded": "Opt-in recorded",
  withdrawn: "Choice withdrawn",
  "review-again": "Your earlier choice needs a fresh review",
};

export function mountMembershipRenewal(host, {
  orgId, intakeId, staff = false, request, node, current,
  loadRecords, runMutation = (fn) => fn(), onChanged = () => {},
  onAccessLost = () => {},
}) {
  const path = staff ? `/api/orgs/${part(orgId)}/membership-renewals/${part(intakeId)}`
    : `/api/participant/orgs/${part(orgId)}/requests/${part(intakeId)}/membership-renewal`;
  const content = node("div", { class: "stack" });
  const status = node("p", { class: "form-status", role: "status" });
  const retry = node("div", { class: "actions" });
  const live = () => host.isConnected && current();
  let pending = null;
  let busy = false;
  let view = null;
  let selection = null;

  function action(label, fn, primary = false) {
    const control = node("button", { type: "button", class: primary ? "button primary" : "button subtle" }, label);
    control.addEventListener("click", () => { if (live() && !busy) void fn(); });
    return control;
  }
  function message(text, problem = false) {
    status.textContent = text;
    status.className = problem ? "form-status error" : "form-status";
  }
  function checkedAction(label, explanation, callback) {
    const check = node("input", { type: "checkbox" });
    return [
      node("label", { class: "check-row" }, check, explanation),
      action(label, () => {
        if (pending) { message("Resolve the previous change with Retry first.", true); return; }
        if (!check.checked) { message("Acknowledge the review before continuing.", true); return; }
        return callback();
      }, true),
    ];
  }
  function assertView(value) {
    const states = staff ? ["offered", "bound"] : ["unlinked", "offered", "bound"];
    if (value?.ok !== true || value.version !== 1 || !states.includes(value.state))
      throw new Error("The saved membership review could not be verified.");
    return value;
  }
  function showError(error) {
    if (!live()) return;
    if (error.status === 401 || error.status === 403 || (error.status === 404 && (!staff || view))) {
      view = null;
      selection = null;
      pending = null;
      content.replaceChildren();
      retry.replaceChildren();
      onAccessLost(error);
    }
    message(error.message || "Reload the membership review.", true);
  }
  async function load() {
    if (pending || busy || !live()) return;
    busy = true;
    try {
      const value = assertView(await request(path));
      if (!live()) return;
      view = value;
      selection = null;
      render();
      message("");
    } catch (error) { showError(error); }
    finally { busy = false; }
  }
  function showRetry() {
    retry.replaceChildren();
    if (pending) retry.append(action("Retry the same membership change", () => send(pending)));
  }
  async function send(command) {
    if (busy || !live()) return;
    busy = true;
    try {
      await runMutation(async () => {
        if (!live()) return;
        pending = command;
        showRetry();
        try {
          const value = assertView(await request(path + command.suffix, {
            method: "POST", body: command.body,
          }));
          if (!live()) return;
          pending = null;
          selection = null;
          view = value;
          render();
          showRetry();
          onChanged();
          message(value.replayed ? "The earlier change was already saved." : "Membership review saved.");
        } catch (error) {
          if (error.status >= 400 && error.status < 500 && error.status !== 429) pending = null;
          showRetry();
          showError(error);
        }
      }, status);
    } catch (error) { showError(error); }
    finally { busy = false; }
  }
  const renewalBody = (reviewSha256) => ({
    version: 1, reviewSha256, idempotencyKey: crypto.randomUUID(), acknowledge: true,
  });
  const write = (suffix, body) => send({ suffix, body });

  function renderRenewal(item) {
    if (!item) return;
    content.append(node("p", {}, `Current coverage: ${termText(item.current)}.`),
      node("p", { class: "fine" }, item.dues === "reference-recorded-unverified"
        ? "A dues reference is recorded. Payment status is unverified."
        : "Dues payment status is unknown."));
    if (item.proposed) content.append(node("p", {}, `Proposed term: ${termText(item.proposed)}.`));
    if (item.decision) content.append(node("p", {}, `Recorded term: ${termText(item.decision.period)}.`));
    if (!staff && item.state) content.append(node("p", {}, renewalLabels[item.state] || "Renewal status unavailable."));
    if (item.reviewSha256) {
      content.append(...checkedAction(staff ? "Confirm membership renewal" : "Request membership renewal",
        staff ? "I reviewed the member’s request and the approved term shown here."
          : "I request the proposed term shown here. Staff will review my request.",
        () => write(staff ? "/confirm" : "/request", renewalBody(item.reviewSha256))));
    }
  }
  function renderDirectory(item) {
    if (!item) return;
    content.append(node("h3", {}, "Directory choice"),
      node("p", {}, directoryLabels[item.state] || "Directory choice unavailable."));
    const change = (operation, reviewSha256) => write("/directory", {
      version: 1, operation, reviewSha256, expectedRevision: item.revision, acknowledge: true,
    });
    if (item.optInReviewSha256)
      content.append(...checkedAction("Record directory opt-in",
        "I choose to share my display name with members of this organization if it offers a directory.",
        () => change("opt-in", item.optInReviewSha256)));
    if (item.withdrawReviewSha256)
      content.append(...checkedAction("Withdraw directory choice", "I withdraw my directory choice.",
        () => change("withdraw", item.withdrawReviewSha256)));
  }
  async function chooseBinding() {
    if (busy || pending) return;
    busy = true;
    try {
      const records = await loadRecords();
      if (!live()) return;
      const select = (kind, label) => node("select", { "aria-label": label },
        node("option", { value: "" }, `Choose ${label.toLowerCase()}`),
        records.filter((record) => record.data?.kind === kind)
          .map((record) => node("option", { value: record.id }, record.data.title || record.id)));
      const member = select("member", "Membership record"), term = select("renewal", "Approved term");
      selection = node("div", { class: "stack" },
        node("label", {}, "Membership record", member), node("label", {}, "Approved term", term),
        action("Review this binding", async () => {
          if (!member.value || !term.value) { message("Choose both records.", true); return; }
          const ids = { version: 1, memberId: member.value, termId: term.value };
          busy = true;
          try {
            const result = await request(path + "/binding-review", { method: "POST", body: ids });
            if (!live()) return;
            if (result?.ok !== true || result.version !== 1 || result.member?.id !== ids.memberId ||
                result.term?.id !== ids.termId || typeof result.reviewSha256 !== "string")
              throw new Error("The exact binding review could not be verified.");
            selection.replaceChildren(
              node("p", {}, `${result.member.title} · ${termText(result.member)}`),
              node("p", {}, `${result.term.title} · ${termText(result.term)}`),
              ...checkedAction("Bind this reviewed membership",
                "I reviewed the exact contact request, member record and approved term.",
                () => write("/bind", { ...ids, ...renewalBody(result.reviewSha256) })),
              action("Choose different records", chooseBinding));
            message("");
          } catch (error) { showError(error); }
          finally { busy = false; }
        }, true));
      render();
    } catch (error) { showError(error); }
    finally { busy = false; }
  }
  function render() {
    content.replaceChildren();
    if (!view) return;
    if (view.state === "unlinked" && view.offerReviewSha256)
      content.append(...checkedAction("Ask staff to review my membership",
        "I let staff review this linked contact request and connect it to my membership if they verify the match.",
        () => write("/offer", renewalBody(view.offerReviewSha256))));
    if (view.state === "offered") {
      content.append(node("p", {}, "A membership binding is awaiting staff review."));
      if (staff) content.append(selection || action("Choose records to review", chooseBinding, true));
    }
    renderRenewal(view.renewal);
    if (!staff) renderDirectory(view.directory);
  }

  host.replaceChildren(node("h3", {}, staff ? "Membership renewal review" : "Your membership renewal"),
    content, status, retry, action("Reload membership review", load));
  void load();
}
