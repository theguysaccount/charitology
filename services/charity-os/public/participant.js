const $ = (selector) => document.querySelector(selector);
const receiptPattern =
  /^([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{43})$/;
const statusLabels = {
  pending: "Awaiting review",
  reviewed: "Reviewed by the organization",
  converted: "Prepared for follow-up",
  dismissed: "Closed by the organization",
  cancelled: "Withdrawn",
};
const state = {
  user: null,
  csrf: "",
  receipt: null,
  requests: [],
  cursor: null,
  current: null,
  sessionBusy: false,
  mutationBusy: false,
  listBusy: false,
  dirty: false,
  privateSuspended: true,
  sessionVersion: 0,
  detailVersion: 0,
  accessVersion: 0,
  lastSessionAt: 0,
  autoRefreshStopped: false,
  pendingRefresh: false,
};

export function parseReceipt(value, origin) {
  let text = String(value || "").trim();
  if (text.length > 1800)
    throw new Error("Use the complete private receipt from this service.");
  if (text.includes("://")) {
    let url;
    try {
      url = new URL(text);
    } catch {
      throw new Error("Use a valid private receipt link.");
    }
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      !["/p/receipt", "/participant"].includes(url.pathname.replace(/\/$/, ""))
    )
      throw new Error(
        "Use a private receipt link from this Charity OS service, without query parameters.",
      );
    text = url.hash;
  }
  const match = receiptPattern.exec(text.replace(/^#/, ""));
  if (!match)
    throw new Error(
      "Use the complete private receipt link or organization.publication.code saved after submitting.",
    );
  return match.slice(1);
}

export function typedAnswer(question, value) {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    (question.type === "number" && typeof value === "string" && !value.trim())
  ) {
    if (question.required) throw new Error(`Answer “${question.label}”.`);
    return null;
  }
  if (question.type === "boolean") {
    if (!["true", "false"].includes(value))
      throw new Error(`Choose Yes or No for “${question.label}”.`);
    return value === "true";
  }
  if (question.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > 1e9)
      throw new Error(
        `Use a finite number between −1 billion and 1 billion for “${question.label}”.`,
      );
    return number;
  }
  if (question.type === "date") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new Error(`Use a valid date for “${question.label}”.`);
    return value;
  }
  if (question.type === "select") {
    if (!question.options?.includes(value))
      throw new Error(`Choose a listed answer for “${question.label}”.`);
    return value;
  }
  if (question.type !== "text")
    throw new Error("This question type cannot be edited here.");
  const maximum =
    question.key === "email" ? 254 : question.key === "name" ? 180 : 300;
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error(
      `Use at most ${maximum} characters of plain text for “${question.label}”.`,
    );
  const text = value.trim();
  if (question.required && !text)
    throw new Error(`Answer “${question.label}”.`);
  return text || null;
}

function node(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (
      ["required", "disabled", "readOnly", "checked", "selected"].includes(key)
    )
      element[key] = Boolean(value);
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      element.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return element;
}
function message(target, text = "", error = false) {
  target.textContent = text;
  target.classList.toggle("error", error);
}
const dateLabel = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not recorded";
const part = (value) => encodeURIComponent(String(value));
const detailPath = (item) =>
  `/api/participant/orgs/${part(item.orgId)}/requests/${part(item.id)}`;
function sameRequest(a, b) {
  return a?.orgId === b?.orgId && a?.id === b?.id;
}
function alive(user, version) {
  return state.user?.id === user && state.accessVersion === version;
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && state.csrf) headers["X-CSRF-Token"] = state.csrf;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      method === "GET"
        ? "The service could not be reached. Check your connection and refresh."
        : "The response was interrupted. The change may have completed. Refresh the saved request before deciding whether to try again.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The service returned an unreadable response. Refresh before repeating a change.",
    );
  }
  if (!response.ok || result.ok !== true) {
    const error = new Error(
      result.message || "This request could not be completed.",
    );
    error.status = response.status;
    error.code = result.code;
    error.issues = Array.isArray(result.issues) ? result.issues : [];
    throw error;
  }
  return result;
}
function clearPrivate() {
  state.accessVersion++;
  state.detailVersion++;
  state.requests = [];
  state.cursor = null;
  state.current = null;
  state.dirty = false;
  $("#participant-list").replaceChildren();
  $("#participant-detail").replaceChildren(
    node("h2", {}, "Choose a linked request."),
    node("p", {}, "Your submitted answers and available controls appear here."),
  );
  $("#participant-identity").textContent = "";
  $("#participant-private").hidden = true;
}
function clearReceipt() {
  state.receipt = null;
  $("#participant-receipt").value = "";
  $("#participant-claim-consent").checked = false;
  history.replaceState(null, "", "/participant");
  renderClaim();
}
function renderClaim() {
  const hasReceipt = Boolean(state.receipt),
    verified = state.user?.emailVerified === true;
  $("#participant-receipt-badge").textContent = hasReceipt
    ? "Private receipt ready"
    : "Receipt needed";
  $("#participant-claim").hidden = !hasReceipt;
  $("#participant-claim-consent").disabled =
    !verified || state.mutationBusy || state.sessionBusy;
  $("#participant-claim-button").disabled =
    !verified || state.mutationBusy || state.sessionBusy;
  if (hasReceipt && !verified)
    message(
      $("#participant-receipt-status"),
      "The receipt is ready in this original tab. Sign in with its submitted email, then return here and refresh your session before linking.",
    );
}
function renderSession() {
  $("#participant-auth").hidden = Boolean(state.user);
  $("#participant-private").hidden = !state.user || state.privateSuspended;
  if (state.user) {
    $("#participant-identity").textContent = state.user.email;
    $("#participant-verification").textContent =
      state.user.emailVerified === true
        ? "Email verified. Only your explicitly linked requests are listed."
        : "This session’s email is not verified. Sign out and request a new sign-in link before linking or opening requests.";
    $("#participant-request-layout").hidden = state.user.emailVerified !== true;
  }
  renderClaim();
}
function denyIfAccessLost(error) {
  if ([401, 403].includes(error.status)) {
    clearPrivate();
    state.user = null;
    state.csrf = "";
    state.privateSuspended = false;
    renderSession();
    message(
      $("#participant-status"),
      "Your access needs to be checked again. Sign in or refresh your session to continue.",
      true,
    );
  }
}
async function mutation(fn, output) {
  if (state.mutationBusy) return false;
  if (state.sessionBusy) {
    message(
      output,
      "Wait for the session and access check to finish before changing a request.",
    );
    return false;
  }
  state.mutationBusy = true;
  state.detailVersion++;
  const controls = [
    ...document.querySelectorAll(
      "button, #participant-private input, #participant-private select, #participant-private textarea",
    ),
  ].map((control) => ({ control, disabled: control.disabled }));
  for (const { control } of controls) control.disabled = true;
  try {
    await fn();
    return true;
  } catch (error) {
    denyIfAccessLost(error);
    if (output.isConnected) message(output, error.message, true);
    else message($("#participant-status"), error.message, true);
    return false;
  } finally {
    state.mutationBusy = false;
    for (const { control, disabled } of controls)
      if (control.isConnected) control.disabled = disabled;
    renderClaim();
    if (state.pendingRefresh && !state.autoRefreshStopped) {
      state.pendingRefresh = false;
      void refreshSession(true);
    }
  }
}
function renderList() {
  $("#participant-list").replaceChildren(
    ...state.requests.map((item) =>
      node(
        "article",
        { class: "participant-request-card" },
        node(
          "span",
          { class: "eyebrow" },
          item.organizationName || "Organization",
        ),
        node("h3", {}, item.title || "Your request"),
        node(
          "p",
          { class: "fine" },
          statusLabels[item.status] || "Status unavailable",
          item.erasedAt ? " · Answers erased" : "",
        ),
        node(
          "button",
          {
            type: "button",
            class: "button subtle small",
            "aria-pressed": sameRequest(item, state.current) ? "true" : "false",
            onclick: () => chooseRequest(item),
          },
          "Open this request",
        ),
      ),
    ),
  );
  if (!state.requests.length)
    $("#participant-list").append(
      node(
        "p",
        { class: "fine" },
        "No requests are linked to this account. Use a saved private receipt above to link an eligible request. An email address alone does not search for requests.",
      ),
    );
  $("#participant-list-status").textContent =
    `${state.requests.length} linked request${state.requests.length === 1 ? "" : "s"} shown${state.cursor ? "; more are available" : ""}.`;
  $("#participant-more").hidden = !state.cursor;
}
async function loadList(append = false) {
  if (state.listBusy || !state.user || state.user.emailVerified !== true)
    return;
  state.listBusy = true;
  const user = state.user.id,
    version = state.accessVersion;
  $("#participant-more").disabled = true;
  try {
    const result = await request(
      `/api/participant/requests${append && state.cursor ? `?cursor=${part(state.cursor)}` : ""}`,
    );
    if (!alive(user, version)) return;
    if (!Array.isArray(result.requests) || result.requests.length > 20)
      throw new Error(
        "The saved-request page could not be verified. Refresh your session.",
      );
    state.requests = [
      ...new Map(
        [...(append ? state.requests : []), ...result.requests].map((item) => [
          `${item.orgId}.${item.id}`,
          item,
        ]),
      ).values(),
    ];
    state.cursor = result.nextCursor || null;
    renderList();
  } finally {
    state.listBusy = false;
    $("#participant-more").disabled = false;
  }
}
async function openRequest(item, { preserveDraft = false, focus = true } = {}) {
  const version = ++state.detailVersion,
    user = state.user?.id,
    access = state.accessVersion;
  const result = await request(detailPath(item));
  if (version !== state.detailVersion || !alive(user, access)) return;
  if (!result.request || !sameRequest(result.request, item))
    throw new Error(
      "The selected request could not be verified. Refresh your request list.",
    );
  if (
    sameRequest(state.current, result.request) &&
    result.request.revision < state.current.revision
  )
    return;
  const keepDraft =
    preserveDraft &&
    state.dirty &&
    sameRequest(state.current, result.request) &&
    state.current.revision === result.request.revision &&
    result.request.editable;
  const discardedDraft = preserveDraft && state.dirty && !keepDraft;
  if (!keepDraft) renderDetail(result.request);
  else state.current = result.request;
  if (discardedDraft)
    $("#participant-detail").prepend(
      node(
        "p",
        { class: "notice", role: "status" },
        "The saved request or its editing permission changed. Your unsaved corrections were discarded; the current saved answers are shown below.",
      ),
    );
  renderList();
  if (focus && !keepDraft) $("#participant-detail h2")?.focus();
}
function chooseRequest(item) {
  if (state.mutationBusy) return;
  const open = () =>
    openRequest(item).catch((error) => {
      if (error.status === 404 && sameRequest(item, state.current)) {
        state.current = null;
        state.dirty = false;
        state.detailVersion++;
        $("#participant-detail").replaceChildren(
          node(
            "h2",
            { tabindex: "-1" },
            "This request is no longer available.",
          ),
          node(
            "p",
            {},
            "Its displayed answers were cleared. Refresh your linked requests to check current access.",
          ),
        );
        void loadList().catch(() => {});
      }
      denyIfAccessLost(error);
      message($("#participant-status"), error.message, true);
    });
  if (state.dirty)
    confirmPanel(
      "Discard unsaved corrections?",
      "These corrections have not been saved. Open the saved request without them?",
      "Discard corrections and continue",
      open,
    );
  else void open();
}
function confirmPanel(
  title,
  description,
  label,
  onConfirm,
  trigger = document.activeElement,
) {
  if (state.mutationBusy) return;
  const target = $("#participant-detail");
  target.querySelector("#participant-confirmation")?.remove();
  const heading = node("h3", { id: "participant-confirmation-title" }, title),
    output = node("p", { class: "form-status", role: "status" }),
    keep = node(
      "button",
      { type: "button", class: "button subtle" },
      "Keep things as they are",
    ),
    confirm = node("button", { type: "button", class: "button danger" }, label),
    panel = node(
      "section",
      {
        id: "participant-confirmation",
        class: "participant-confirmation notice",
        role: "region",
        tabindex: "-1",
        "aria-labelledby": heading.id,
      },
      heading,
      node("p", {}, description),
      node("div", { class: "actions" }, confirm, keep),
      output,
    );
  keep.addEventListener("click", () => {
    if (state.mutationBusy) return;
    panel.remove();
    if (trigger?.isConnected) trigger.focus();
  });
  confirm.addEventListener("click", () => {
    if (!state.mutationBusy) void mutation(() => onConfirm(output), output);
  });
  target.append(panel);
  panel.focus();
  panel.scrollIntoView({ block: "nearest" });
}
function valueLabel(value) {
  return value == null
    ? "Not provided"
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : String(value);
}
function questionInput(question, value) {
  const id = `participant-answer-${question.key}`;
  let control;
  if (["boolean", "select"].includes(question.type))
    control = node(
      "select",
      { id, required: question.required },
      node("option", { value: "" }, "Choose an answer"),
      (question.type === "boolean"
        ? [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : (question.options || []).map((option) => ({
            value: option,
            label: option,
          }))
      ).map((option) =>
        node(
          "option",
          {
            value: option.value,
            selected: value != null && String(value) === option.value,
          },
          option.label,
        ),
      ),
    );
  else
    control = node("input", {
      id,
      required: question.required,
      type:
        question.type === "number"
          ? "number"
          : question.type === "date"
            ? "date"
            : question.key === "email"
              ? "email"
              : "text",
      value: value == null ? "" : String(value),
      autocomplete: question.key === "email" ? "email" : "off",
      ...(question.type === "number"
        ? { min: -1e9, max: 1e9, step: "any" }
        : question.type === "text"
          ? {
              maxlength:
                question.key === "email"
                  ? 254
                  : question.key === "name"
                    ? 180
                    : 300,
            }
          : {}),
      readOnly: question.key === "email",
    });
  return {
    control,
    field: node(
      "div",
      { class: "field" },
      node(
        "label",
        { for: id },
        question.label,
        question.required
          ? node("small", { class: "intake-required" }, " required")
          : null,
      ),
      control,
      question.key === "email"
        ? node(
            "p",
            { class: "fine" },
            "The email used to establish this link stays unchanged. A correction cannot transfer this request to another account.",
          )
        : null,
    ),
  };
}
function renderDetail(item) {
  state.current = item;
  state.dirty = false;
  const target = $("#participant-detail"),
    publication = item.publication || {},
    heading = node(
      "h2",
      { tabindex: "-1" },
      item.title || publication.title || "Your request",
    ),
    output = node("p", { class: "form-status", role: "status" });
  const refresh = node(
    "button",
    {
      type: "button",
      class: "button subtle small",
      onclick: () => chooseRequest(item),
    },
    "Reload saved request",
  );
  target.replaceChildren(
    node("span", { class: "eyebrow" }, item.organizationName || "Organization"),
    heading,
    node(
      "div",
      { class: "section-header" },
      node(
        "span",
        { class: "tag" },
        statusLabels[item.status] || "Status unavailable",
      ),
      refresh,
    ),
    node(
      "p",
      { class: "fine section-gap" },
      `Revision ${item.revision} · received ${dateLabel(item.createdAt)} · linked ${dateLabel(item.linkedAt)}`,
    ),
    node(
      "p",
      {},
      publication.purpose ||
        "Contact the organization about this request’s purpose.",
    ),
    node(
      "p",
      { class: "fine" },
      "This portal shows your submitted answers and status, without staff notes or separate contacts and operational drafts. This status does not confirm a place or assignment.",
    ),
    publication.retentionUntil
      ? node(
          "p",
          { class: "fine" },
          `The form’s retention review date is ${publication.retentionUntil}. It closes new collection; it does not automatically delete submitted answers.`,
        )
      : null,
  );
  if (item.erasedAt)
    target.append(
      node(
        "p",
        { class: "notice" },
        `Submitted answers were erased ${dateLabel(item.erasedAt)}. The request’s status and minimal history remain. Separate records and earlier recovery copies are not changed.`,
      ),
    );
  else {
    const questions = Array.isArray(publication.questions)
      ? publication.questions
      : [];
    target.append(
      node("h3", { class: "section-gap" }, "Your submitted answers"),
      node(
        "dl",
        { class: "participant-answers" },
        questions.map((question) =>
          node(
            "div",
            {},
            node("dt", {}, question.label),
            node("dd", {}, valueLabel(item.answers?.[question.key])),
          ),
        ),
      ),
    );
    if (item.editable && item.status === "pending")
      renderCorrection(item, questions, target, output);
    else
      target.append(
        node(
          "p",
          { class: "notice fine" },
          item.editUnavailableReason ||
            "Answers can be corrected only while the request is awaiting review and its approved form remains open. Contact the organization if a reviewed request needs a correction.",
        ),
      );
  }
  target.append(
    node("h3", { class: "section-gap" }, "Manage this request"),
    node(
      "p",
      { class: "fine" },
      "Choose the action that matches what you want. These actions do not change separate contacts, drafts, historical source archives or downloaded backups.",
    ),
  );
  const actions = node("div", { class: "actions participant-privacy-actions" });
  if (["pending", "reviewed", "converted"].includes(item.status))
    actions.append(
      node(
        "button",
        {
          type: "button",
          class: "button danger",
          onclick: (event) =>
            confirmPanel(
              "Withdraw this request?",
              "The organization will see that you withdrew. Your submitted answers and any separately prepared contacts or drafts remain for retention review. Earlier source archives and downloaded backups are not changed.",
              "Confirm withdrawal",
              () => changeRequest(item, "withdraw", output),
              event.currentTarget,
            ),
        },
        "Withdraw request",
      ),
    );
  if (!item.erasedAt)
    actions.append(
      node(
        "button",
        {
          type: "button",
          class: "button danger",
          onclick: (event) =>
            confirmPanel(
              "Erase your submitted answers?",
              "This clears the answers in this request and closes an active request. Its status and minimal history remain. Separately prepared contacts or drafts, earlier source archives, recovery copies and downloaded backups are not changed.",
              "Erase submitted answers",
              () => changeRequest(item, "erase", output),
              event.currentTarget,
            ),
        },
        "Erase submitted answers",
      ),
    );
  actions.append(
    node(
      "button",
      {
        type: "button",
        class: "button subtle",
        onclick: (event) =>
          confirmPanel(
            "Permanently unlink account access?",
            "This permanently removes this account’s access to this request. This account cannot link it again with the same receipt. Unlinking does not withdraw the request or erase submitted answers, separate records or earlier backups. Your saved private receipt retains only its limited status and withdrawal controls.",
            "Permanently unlink this request",
            () => changeRequest(item, "unlink", output),
            event.currentTarget,
          ),
      },
      "Unlink account access",
    ),
  );
  target.append(actions, output);
}
function renderCorrection(item, questions, target, output) {
  const controls = new Map(),
    form = node("form", { class: "participant-correction" }),
    consent = node("input", {
      type: "checkbox",
      id: "participant-correction-consent",
      required: true,
    });
  form.append(
    node("h3", {}, "Correct pending answers"),
    node(
      "p",
      { class: "fine" },
      "These changes apply to this pending request only. They do not update separate contacts or drafts. Save before leaving; corrections are not stored in your browser.",
    ),
  );
  for (const question of questions) {
    const field = questionInput(question, item.answers?.[question.key]);
    controls.set(question.key, { question, control: field.control });
    form.append(field.field);
  }
  form.append(
    node(
      "label",
      { class: "intake-consent", for: consent.id },
      consent,
      node(
        "span",
        {},
        item.publication.consentText ||
          "I agree that this organization may use these corrected answers for the stated collection purpose.",
      ),
    ),
    node(
      "button",
      { type: "submit", class: "button primary" },
      "Save corrected answers",
    ),
  );
  form.addEventListener("input", () => {
    state.dirty = true;
  });
  form.addEventListener("change", () => {
    state.dirty = true;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.mutationBusy || !form.reportValidity()) return;
    void mutation(async () => {
      const answers = Object.create(null);
      for (const [key, { question, control }] of controls)
        answers[key] = typedAnswer(question, control.value);
      const body = {
        revision: item.revision,
        answers,
        consent: consent.checked,
      };
      if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 16384)
        throw new Error(
          "These corrected answers are too large. Shorten them before saving.",
        );
      const user = state.user.id,
        version = state.accessVersion;
      message(output, "Saving corrected answers…");
      const result = await request(`${detailPath(item)}/correct`, {
        method: "POST",
        body,
      });
      if (!alive(user, version)) return;
      if (!result.request)
        throw new Error(
          "The saved response is incomplete. Reload the request before trying again.",
        );
      renderDetail(result.request);
      await loadList();
      message(
        $("#participant-status"),
        "Corrected answers saved. The request still needs organizational review.",
      );
      $("#participant-detail h2")?.focus();
    }, output);
  });
  target.append(form);
}
async function changeRequest(item, action, output) {
  const user = state.user.id,
    version = state.accessVersion;
  message(
    output,
    action === "unlink"
      ? "Removing account access…"
      : action === "erase"
        ? "Erasing submitted answers…"
        : "Withdrawing the request…",
  );
  const result = await request(`${detailPath(item)}/${action}`, {
    method: "POST",
    body: { revision: item.revision },
  });
  if (!alive(user, version)) return;
  if (action === "unlink") {
    if (result.unlinked !== true)
      throw new Error(
        "Access removal could not be confirmed. Refresh your saved requests.",
      );
    state.detailVersion++;
    state.current = null;
    state.dirty = false;
    state.requests = state.requests.filter(
      (entry) => !sameRequest(entry, item),
    );
    renderList();
    $("#participant-detail").replaceChildren(
      node("h2", { tabindex: "-1" }, "Account access permanently unlinked."),
      node(
        "p",
        {},
        "This request can no longer be opened by this account or re-linked with its receipt. Unlinking did not change its withdrawal or erasure state. Separate records and earlier copies remain governed by the organization. Contact the organization through another channel if needed.",
      ),
    );
  } else {
    if (!result.request)
      throw new Error(
        "The response is incomplete. Reload the request before trying again.",
      );
    renderDetail(result.request);
  }
  await loadList();
  message(
    $("#participant-status"),
    action === "unlink"
      ? "Account access permanently unlinked."
      : action === "erase"
        ? "Submitted answers erased. Separate records and earlier archives remain unchanged."
        : "Request withdrawn. Submitted answers remain until separately erased.",
  );
  $("#participant-detail h2")?.focus();
}
async function refreshSession(force = false) {
  if (state.autoRefreshStopped && !force) return;
  if (state.sessionBusy || state.mutationBusy) {
    state.pendingRefresh = true;
    return;
  }
  if (
    !force &&
    !state.privateSuspended &&
    Date.now() - state.lastSessionAt < 5000
  )
    return;
  state.sessionBusy = true;
  suspendPrivate();
  renderClaim();
  const version = ++state.sessionVersion,
    previous = state.current;
  try {
    message(
      $("#participant-status"),
      "Checking your session and saved access…",
    );
    const result = await request("/api/participant/session");
    if (version !== state.sessionVersion) return;
    const next = result.user || null;
    if (state.user?.id !== next?.id) clearPrivate();
    state.user = next;
    state.csrf =
      next && typeof result.csrfToken === "string" ? result.csrfToken : "";
    state.lastSessionAt = Date.now();
    state.autoRefreshStopped = false;
    if (next?.emailVerified === true) {
      await loadList();
      if (previous && sameRequest(previous, state.current)) {
        try {
          await openRequest(previous, { preserveDraft: true, focus: false });
        } catch (error) {
          clearPrivate();
          if ([401, 403].includes(error.status)) throw error;
          message(
            $("#participant-status"),
            "The selected request is no longer available to this account. Its displayed answers were cleared.",
            true,
          );
          await loadList();
        }
      }
    } else if (next) clearPrivate();
    state.privateSuspended = document.visibilityState === "hidden";
    renderSession();
    $("#participant-retry-session").hidden = true;
    if (!$("#participant-status").classList.contains("error"))
      message(
        $("#participant-status"),
        next?.emailVerified === true
          ? "Your session is current. Requests appear only after you deliberately link them."
          : next
            ? "Verify this account’s email before opening requests."
            : "Sign in and deliberately link a saved receipt to open your own request.",
      );
  } catch (error) {
    suspendPrivate();
    denyIfAccessLost(error);
    message(
      $("#participant-status"),
      `${error.message} Use “refresh this tab” to check again.`,
      true,
    );
    $("#participant-retry-session").hidden = false;
    if (!state.user) {
      $("#participant-auth").hidden = false;
      $("#participant-private").hidden = true;
    }
  } finally {
    state.sessionBusy = false;
    state.pendingRefresh = false;
    renderClaim();
  }
}
function suspendPrivate() {
  state.privateSuspended = true;
  $("#participant-private").hidden = true;
}
function install() {
  document.querySelector(".skip")?.addEventListener("click", (event) => {
    event.preventDefault();
    $("#participant-main").focus({ preventScroll: true });
    $("#participant-main").scrollIntoView({ block: "start" });
  });
  $("#participant-receipt-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.mutationBusy) return;
    try {
      state.receipt = parseReceipt(
        $("#participant-receipt").value,
        location.origin,
      );
      history.replaceState(null, "", `/participant#${state.receipt.join(".")}`);
      $("#participant-receipt").value = "";
      $("#participant-claim-consent").checked = false;
      renderClaim();
      message(
        $("#participant-receipt-status"),
        state.user?.emailVerified === true
          ? "Receipt ready. Read the linking purpose and choose whether to link."
          : "Receipt ready. Keep this tab open while you confirm sign-in in the email tab.",
      );
    } catch (error) {
      message($("#participant-receipt-status"), error.message, true);
    }
  });
  $("#participant-clear-receipt").addEventListener("click", () => {
    clearReceipt();
    message(
      $("#participant-receipt-status"),
      "Receipt cleared from this tab. Any saved copy elsewhere is unchanged.",
    );
  });
  $("#participant-login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (state.mutationBusy || !form.reportValidity()) return;
    const address = $("#participant-email").value.trim();
    void mutation(async () => {
      message(
        $("#participant-login-status"),
        "Requesting a sign-in link… Keep this original tab open.",
      );
      await request("/api/auth/request-link", {
        method: "POST",
        body: { email: address, destination: "participant" },
      });
      $("#participant-email").value = "";
      message(
        $("#participant-login-status"),
        "If accepted, your sign-in email has a short-lived confirmation link. Confirm it, then return to this original tab and refresh. Your receipt is not in the email.",
      );
    }, $("#participant-login-status"));
  });
  $("#participant-claim-button").addEventListener("click", () => {
    const output = $("#participant-receipt-status");
    if (!state.receipt || state.user?.emailVerified !== true) {
      message(
        output,
        "Sign in with a verified matching email and use a saved receipt before linking.",
        true,
      );
      return;
    }
    if (!$("#participant-claim-consent").checked) {
      message(
        output,
        "Read and agree to the account-linking purpose before continuing.",
        true,
      );
      $("#participant-claim-consent").focus();
      return;
    }
    const parts = [...state.receipt],
      user = state.user.id,
      version = state.accessVersion;
    void mutation(async () => {
      message(output, "Checking this receipt and the verified account…");
      const result = await request(
        `/api/participant/intake/${part(parts[0])}/${part(parts[1])}/link`,
        { method: "POST", body: { receipt: parts[2], consent: true } },
      );
      if (!alive(user, version)) return;
      if (!result.request?.orgId || !result.request?.id)
        throw new Error(
          "The linking response is incomplete. Refresh your linked requests before retrying.",
        );
      clearReceipt();
      renderDetail(result.request);
      await loadList();
      message(
        output,
        "Request linked. Its private receipt was cleared from this tab; any copy you saved elsewhere remains private.",
      );
      message(
        $("#participant-status"),
        "Your request is linked. Review its answers and available controls below.",
      );
      $("#participant-detail h2")?.focus();
    }, output);
  });
  for (const id of [
    "participant-check-session",
    "participant-refresh",
    "participant-retry-session",
  ])
    $(`#${id}`).addEventListener("click", () => {
      state.autoRefreshStopped = false;
      void refreshSession(true);
    });
  $("#participant-more").addEventListener("click", () => {
    void loadList(true).catch((error) => {
      denyIfAccessLost(error);
      message($("#participant-list-status"), error.message, true);
    });
  });
  $("#participant-logout").addEventListener("click", (event) => {
    const logout = async () => {
      const output = $("#participant-status");
      let error;
      try {
        await request("/api/auth/logout", { method: "POST", body: {} });
      } catch (caught) {
        error = caught;
      }
      clearPrivate();
      state.user = null;
      state.csrf = "";
      state.privateSuspended = false;
      state.autoRefreshStopped = true;
      renderSession();
      if (error) {
        $("#participant-retry-session").hidden = false;
        throw new Error(
          "Displayed private answers were cleared, but server sign-out could not be confirmed. Refresh the session and try signing out again, or close this tab.",
        );
      }
      message(
        output,
        "Signed out. Displayed private answers were cleared. Any saved receipt in this original tab remains until you clear it.",
      );
    };
    if (state.dirty)
      confirmPanel(
        "Sign out without saving corrections?",
        "Unsaved corrections will be discarded. The saved request remains unchanged.",
        "Discard corrections and sign out",
        logout,
        event.currentTarget,
      );
    else void mutation(logout, $("#participant-status"));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") suspendPrivate();
    else if (!state.autoRefreshStopped) void refreshSession();
  });
  window.addEventListener("focus", () => {
    if (document.visibilityState !== "hidden" && !state.autoRefreshStopped)
      void refreshSession();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      suspendPrivate();
      if (!state.autoRefreshStopped) void refreshSession(true);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  if (location.search) {
    message(
      $("#participant-status"),
      "Open the portal without query parameters. Keep private receipts in the fragment only.",
      true,
    );
    $("#participant-auth").hidden = false;
    return;
  }
  if (location.hash) {
    try {
      state.receipt = parseReceipt(location.hash, location.origin);
    } catch (error) {
      message($("#participant-receipt-status"), error.message, true);
    }
  }
  $("#participant-receipt").disabled = false;
  $("#participant-use-receipt").disabled = false;
  renderClaim();
  void refreshSession(true);
}
if (typeof document !== "undefined") install();
