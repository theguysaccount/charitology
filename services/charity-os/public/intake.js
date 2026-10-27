const $ = (selector) => document.querySelector(selector);
const scopePattern = /^([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{1,100})$/;
const receiptPattern =
  /^([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{43})$/;
let publication,
  scope,
  attempt,
  receiptScope,
  receiptBusy = false,
  formBusy = false;
const controls = new Map();
document.querySelector(".skip")?.addEventListener("click", (event) => {
  const main = $("#intake-main");
  if (!main) return;
  event.preventDefault();
  main.focus({ preventScroll: true });
  main.scrollIntoView({ block: "start" });
});
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
function status(target, message, error = false) {
  target.textContent = message;
  target.classList.toggle("error", error);
}
function endpoint(parts = scope) {
  return `/api/public/intake/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
}
async function request(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      body === undefined
        ? "The form could not be reached. Try again when your connection is available."
        : "The response was interrupted. Your request may have arrived. Retry with the same answers to check this attempt; it will not create a second copy.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The service returned an unreadable response. Keep this page open before trying again.",
    );
  }
  if (!response.ok || result.ok === false) {
    const details = Array.isArray(result.issues)
      ? result.issues
          .slice(0, 4)
          .map(
            (issue) =>
              `${issue.field || issue.key || "Answer"}: ${issue.message}`,
          )
          .join(" ")
      : "";
    const error = new Error(
      `${result.message || "This request could not be completed."}${details ? ` ${details}` : ""}`,
    );
    error.status = response.status;
    throw error;
  }
  return result;
}
function showError(error) {
  $("#intake-loading").hidden = true;
  $("#intake-workspace").hidden = true;
  $("#intake-error").hidden = false;
  $("#intake-error").replaceChildren(
    node("span", { class: "eyebrow" }, "Form unavailable"),
    node("h1", {}, "This form could not be opened."),
    node("p", {}, error.message),
    node(
      "button",
      { type: "button", class: "button", onclick: () => location.reload() },
      "Try again",
    ),
  );
}
function questionControl(question) {
  const id = `answer-${question.key}`;
  const attributes = {
    id,
    name: question.key,
    required: Boolean(question.required),
  };
  let control;
  if (question.type === "select" || question.type === "boolean") {
    control = node(
      "select",
      attributes,
      node("option", { value: "" }, "Choose an answer"),
      question.type === "boolean"
        ? [
            node("option", { value: "true" }, "Yes"),
            node("option", { value: "false" }, "No"),
          ]
        : (question.options || []).map((option) =>
            node(
              "option",
              { value: typeof option === "string" ? option : option.value },
              typeof option === "string" ? option : option.label,
            ),
          ),
    );
  } else
    control = node("input", {
      ...attributes,
      type:
        question.type === "number"
          ? "number"
          : question.type === "date"
            ? "date"
            : question.key === "email"
              ? "email"
              : "text",
      ...(question.type === "number"
        ? { step: "any", inputmode: "decimal" }
        : question.type === "text"
          ? {
              maxlength:
                question.key === "name"
                  ? 180
                  : question.key === "email"
                    ? 254
                    : publication.limits?.text || 300,
            }
          : {}),
      autocomplete:
        question.key === "email"
          ? "email"
          : question.key === "name"
            ? "name"
            : "off",
    });
  controls.set(question.key, { question, control });
  return node(
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
  );
}
function answers() {
  const result = Object.create(null);
  for (const [key, { question, control }] of controls) {
    const value = control.value;
    if (value === "") result[key] = null;
    else if (question.type === "boolean") result[key] = value === "true";
    else if (question.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number))
        throw new Error(`Enter a finite number for “${question.label}”.`);
      result[key] = number;
    } else result[key] = value;
  }
  return result;
}
async function copy(text, output) {
  try {
    await navigator.clipboard.writeText(text);
    status(output, "Copied. Keep this private.");
  } catch {
    status(
      output,
      "Copy is unavailable here. Select the receipt link above and copy it manually.",
      true,
    );
  }
}
function receiptLink(parts, token) {
  return `${location.origin}/p/receipt#${parts[0]}.${parts[1]}.${token}`;
}
function received(result) {
  $("#intake-workspace").hidden = true;
  const target = $("#intake-received");
  target.hidden = false;
  target.replaceChildren(
    node("span", { class: "eyebrow" }, "Request recorded"),
    node(
      "h1",
      { tabindex: "-1" },
      result.status === "pending"
        ? "Thank you. The next step is review."
        : "Your request was already recorded.",
    ),
    node(
      "p",
      { class: "intake-result-state" },
      statusLabels[result.status] || "The service recorded this request.",
    ),
    node(
      "p",
      {},
      "This status does not confirm a booking, place or assignment. Only the organization can confirm the next operational step.",
    ),
  );
  if (
    typeof result.receipt === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(result.receipt)
  ) {
    const url = receiptLink(scope, result.receipt),
      output = node("p", { class: "form-status", role: "status" });
    const input = node("input", {
      id: "saved-receipt-link",
      value: url,
      readOnly: true,
      spellcheck: "false",
    });
    target.append(
      node("h2", {}, "Keep your private receipt."),
      node(
        "p",
        {},
        "This receipt is shown only on the first accepted response. Save the link now. Anyone with it can check status or cancel your request; it does not reveal your answers. The organization cannot show this private code again.",
      ),
      node("label", { for: input.id }, "Private receipt link"),
      input,
      node(
        "div",
        { class: "actions section-gap" },
        node(
          "button",
          {
            type: "button",
            class: "button primary",
            onclick: () => copy(url, output),
          },
          "Copy private link",
        ),
        node("a", { class: "button", href: url }, "Check status or cancel"),
        publication?.questions?.some(
          (question) => question.key === "email" && question.type === "text",
        )
          ? node(
              "a",
              {
                class: "button subtle",
                href: `/participant#${scope[0]}.${scope[1]}.${result.receipt}`,
              },
              "Manage through your account",
            )
          : null,
      ),
      output,
      publication?.questions?.some(
        (question) => question.key === "email" && question.type === "text",
      )
        ? node(
            "p",
            { class: "fine" },
            "If you supplied an email for this request, you can separately verify that same email and deliberately link the saved receipt to read or manage your own answers. Signing in does not find requests by email alone.",
          )
        : null,
    );
  } else
    target.append(
      node(
        "p",
        { class: "notice" },
        "The service recognized this request as an earlier attempt. It does not repeat the private receipt. If you saved the first receipt link, use it to check status or cancel.",
      ),
      node("a", { href: "/p/receipt" }, "Use a saved receipt"),
    );
  $("#intake-form").reset();
  $("#intake-questions").replaceChildren();
  controls.clear();
  attempt = null;
  target.querySelector("h1").focus();
}
$("#intake-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (formBusy || !event.currentTarget.reportValidity()) return;
  const output = $("#intake-form-status"),
    submit = $("#intake-submit");
  formBusy = true;
  submit.disabled = true;
  try {
    const values = answers(),
      canonical = JSON.stringify(values);
    if (attempt && attempt.canonical !== canonical)
      throw new Error(
        "A previous submission may already have arrived. Restore the same answers to retry that request. Reload this page only if you intend to begin a separate request.",
      );
    const key = attempt?.key || crypto.randomUUID();
    const body = {
      answers: values,
      consent: $("#intake-consent").checked,
      website: $("#intake-website").value,
      idempotencyKey: key,
    };
    if (
      new TextEncoder().encode(JSON.stringify(body)).byteLength >
      (publication.limits?.requestBytes || 16384)
    )
      throw new Error(
        "These answers are too long. Shorten them before sending.",
      );
    if (!attempt) attempt = { canonical, key };
    status(output, "Sending your request… Keep this page open.");
    const result = await request(`${endpoint()}/submissions`, body);
    received(result);
  } catch (error) {
    if ([400, 413, 422].includes(error.status)) attempt = null;
    status(output, error.message, true);
  } finally {
    formBusy = false;
    submit.disabled = false;
  }
});
function readReceipt(value) {
  let text = value.trim();
  if (text.includes("://")) {
    const url = new URL(text);
    if (
      url.origin !== location.origin ||
      url.pathname !== "/p/receipt" ||
      url.search
    )
      throw new Error(
        "Use a private receipt link for this Charity OS service.",
      );
    text = url.hash.slice(1);
  }
  const match = receiptPattern.exec(text.replace(/^#/, ""));
  if (!match)
    throw new Error(
      "Use the complete private receipt link or code saved after submitting.",
    );
  return match.slice(1);
}
const statusLabels = {
  pending: "Waiting for the organization’s review",
  reviewed: "Reviewed by the organization",
  dismissed: "Closed by the organization",
  converted: "Reviewed and linked for follow-up",
  cancelled: "Cancelled",
};
function confirmCancellation(target, trigger, parts) {
  if (receiptBusy) return;
  const existing = target.querySelector("#receipt-cancel-panel");
  if (existing) {
    existing.focus();
    return;
  }
  const keep = node(
    "button",
    { type: "button", class: "button" },
    "Keep request",
  );
  const confirmButton = node(
    "button",
    { type: "button", class: "button danger" },
    "Confirm cancellation",
  );
  const panel = node(
    "section",
    {
      id: "receipt-cancel-panel",
      class: "notice section-gap",
      role: "region",
      "aria-labelledby": "receipt-cancel-title",
      tabindex: "-1",
    },
    node("h3", { id: "receipt-cancel-title" }, "Cancel this request?"),
    node(
      "p",
      {},
      "The organization will see that you withdrew this original request. This does not cancel a separately confirmed place or volunteer assignment. Use Cancel participation in your verified account, or contact the organizer, for that action. Submitted answers and previously prepared contacts and drafts remain for separate retention review. Earlier archives and downloaded backups are not changed.",
    ),
    node("div", { class: "actions" }, confirmButton, keep),
  );
  trigger.disabled = true;
  trigger.setAttribute("aria-expanded", "true");
  trigger.setAttribute("aria-controls", "receipt-cancel-panel");
  keep.addEventListener("click", () => {
    if (receiptBusy) return;
    panel.remove();
    if (trigger.isConnected) {
      trigger.disabled = false;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
      trigger.focus();
    }
  });
  confirmButton.addEventListener("click", async () => {
    if (receiptBusy || confirmButton.disabled) return;
    confirmButton.disabled = true;
    keep.disabled = true;
    const completed = await checkReceipt(parts, "cancel");
    if (!completed && panel.isConnected) {
      confirmButton.disabled = false;
      keep.disabled = false;
      keep.textContent = "Close confirmation";
      confirmButton.focus();
    }
  });
  target.append(panel);
  panel.focus();
}
async function checkReceipt(parts, action = "status") {
  if (receiptBusy) return false;
  receiptBusy = true;
  const activeButtons = [
    ...$("#receipt-result").querySelectorAll("button"),
  ].map((button) => ({ button, disabled: button.disabled }));
  for (const { button } of activeButtons) button.disabled = true;
  const output = $("#receipt-status");
  const entryButton = $("#receipt-entry-form button");
  entryButton.disabled = true;
  try {
    status(
      output,
      action === "cancel"
        ? "Cancelling this request…"
        : "Checking the request’s status…",
    );
    const result = await request(`${endpoint(parts)}/receipt`, {
      receipt: parts[2],
      action,
    });
    receiptScope = parts;
    $("#receipt-entry-form").hidden = true;
    $("#receipt-entry").value = "";
    const target = $("#receipt-result");
    target.replaceChildren(
      node(
        "h2",
        { tabindex: "-1" },
        statusLabels[result.status] || "Status received",
      ),
      node(
        "p",
        {},
        "A receipt status is not a booking confirmation. Only the organization can confirm an event place or volunteer assignment.",
      ),
    );
    const actions = node("div", { class: "actions" });
    actions.append(
      node(
        "button",
        {
          type: "button",
          class: "button",
          onclick: () => checkReceipt(receiptScope),
        },
        "Refresh status",
      ),
    );
    if (["pending", "reviewed", "converted"].includes(result.status))
      actions.append(
        node(
          "button",
          {
            type: "button",
            class: "button danger",
            "aria-expanded": "false",
            onclick: (event) =>
              confirmCancellation(target, event.currentTarget, [
                ...receiptScope,
              ]),
          },
          "Cancel this request",
        ),
      );
    if (result.participantClaimAvailable === true)
      actions.append(
        node(
          "a",
          { class: "button subtle", href: `/participant#${parts.join(".")}` },
          "Manage through your account",
        ),
      );
    target.append(
      actions,
      node(
        "p",
        { class: "fine section-gap" },
        "Keep the private receipt link. This page does not display your answers or email address. Cancellation withdraws the original request; it does not cancel a separately confirmed participation or erase submitted answers, contacts or drafts. Use your verified account's separate Cancel participation control, or contact the organizer, to cancel a place. Ask the organization about its retention process.",
      ),
    );
    status(
      output,
      action === "cancel"
        ? "The service recorded the cancellation."
        : "Status checked.",
    );
    if (action === "cancel") target.querySelector("h2").focus();
    return true;
  } catch (error) {
    status(
      output,
      action === "cancel" && !error.status
        ? "The cancellation response was interrupted. The service may have recorded it. Refresh status before deciding whether to confirm cancellation again; repeating cancellation does not create another request."
        : error.message,
      true,
    );
    return false;
  } finally {
    receiptBusy = false;
    entryButton.disabled = false;
    for (const { button, disabled } of activeButtons)
      if (button.isConnected) button.disabled = disabled;
  }
}
$("#receipt-entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const parts = readReceipt($("#receipt-entry").value);
    history.replaceState(null, "", `/p/receipt#${parts.join(".")}`);
    await checkReceipt(parts);
  } catch (error) {
    status($("#receipt-status"), error.message, true);
  }
});
async function boot() {
  if (location.search)
    throw new Error(
      "Use the original form or private receipt link without query parameters.",
    );
  if (location.pathname.replace(/\/$/, "") === "/p/receipt") {
    $("#intake-loading").hidden = true;
    $("#intake-receipt").hidden = false;
    if (location.hash) {
      try {
        await checkReceipt(readReceipt(location.hash));
      } catch (error) {
        status($("#receipt-status"), error.message, true);
      }
    }
    return;
  }
  const match = scopePattern.exec(
    decodeURIComponent(
      location.pathname.split("/").filter(Boolean).at(-1) || "",
    ),
  );
  if (!match)
    throw new Error("Use the complete form link supplied by the organization.");
  scope = match.slice(1);
  const result = await request(endpoint());
  publication = result.publication;
  if (
    !publication ||
    !Array.isArray(publication.questions) ||
    publication.questions.length > 30
  )
    throw new Error("This form’s question list could not be verified.");
  document.title = `${publication.title} · Charity OS`;
  $("#intake-title").textContent = publication.title;
  $("#intake-organization").textContent = publication.organizationName;
  $("#intake-purpose").textContent = publication.purpose;
  $("#intake-consent-text").textContent =
    publication.consentText ||
    `I agree that ${publication.organizationName} may use these answers for the purpose described above.`;
  $("#intake-retention").textContent = publication.retentionUntil
    ? `This form closes to new requests after ${publication.retentionUntil}, its retention review date. Submitted answers are not automatically deleted on that date. Ask the organization about corrections or its separate retention process.`
    : "Ask the organization about corrections and how long it keeps responses.";
  $("#intake-questions").replaceChildren(
    ...publication.questions.map(questionControl),
  );
  $("#intake-loading").hidden = true;
  $("#intake-workspace").hidden = false;
}
boot().catch(showError);
