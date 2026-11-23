export const PILOT_FEEDBACK_RECIPIENT = "hello@charitology.org";
export const PILOT_GITHUB_ISSUE_URL =
  "https://github.com/theguysaccount/charitology/issues/new";

export const PILOT_FEEDBACK_CATEGORIES = Object.freeze([
  { id: "confusing", label: "Confusing or hard to use" },
  { id: "missing_workflow", label: "Missing workflow" },
  { id: "bug", label: "Something broke" },
  { id: "works_well", label: "Works well" },
]);

export const PILOT_STARTER_TRACKS = Object.freeze([
  {
    id: "grants",
    title: "Grants & funder reports",
    summary:
      "Track applications, active grant terms, supporting files, and frozen snapshots.",
    modules: ["grant-seeking", "grant-delivery", "reporting", "documents"],
  },
  {
    id: "volunteers",
    title: "Volunteers & events",
    summary:
      "Coordinate shifts, public events, contacts, and team follow-ups.",
    modules: ["volunteers", "events", "contacts", "communications"],
  },
  {
    id: "programs",
    title: "Programs & approvals",
    summary:
      "Connect a program to its projects, outcomes, and review decisions.",
    modules: ["programs", "projects", "outcomes", "governance"],
  },
]);

const categoryLabel = (id) =>
  PILOT_FEEDBACK_CATEGORIES.find((item) => item.id === id)?.label ||
  "Pilot feedback";

export function formatPilotContextSummary({ screen, viewport, theme }) {
  const safeScreen = String(screen || "home").slice(0, 80);
  const safeViewport = String(viewport || "unknown").slice(0, 32);
  const safeTheme = theme === "dark" || theme === "light" ? theme : "unknown";
  return `Screen: ${safeScreen} · Viewport: ${safeViewport} · Theme: ${safeTheme}`;
}

export function buildPilotMailtoUrl({
  category = "confusing",
  message = "",
  screen = "home",
  viewport = "unknown",
  theme = "unknown",
} = {}) {
  const subject = `[Charity OS Pilot · ${categoryLabel(category)}] ${screen || "home"}`;
  const body = [
    formatPilotContextSummary({ screen, viewport, theme }),
    "",
    String(message || "").trim() ||
      "Describe what you were trying to do and what got in the way:",
  ].join("\n");
  return `mailto:${PILOT_FEEDBACK_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildPilotGithubIssueUrl({
  category = "confusing",
  message = "",
  screen = "home",
  viewport = "unknown",
  theme = "unknown",
} = {}) {
  const title = `Charity OS pilot (${categoryLabel(category)}): ${screen || "home"}`;
  const body = [
    "### Context (non-sensitive)",
    formatPilotContextSummary({ screen, viewport, theme }),
    "",
    "### What happened or what is missing",
    String(message || "").trim() ||
      "*(Please do not include private beneficiary or donor records.)*",
  ].join("\n");
  return `${PILOT_GITHUB_ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export function selectAccessibleStarterTracks(modules = []) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  return PILOT_STARTER_TRACKS.map((track) => ({
    ...track,
    accessibleModules: track.modules
      .map((id) => byId.get(id))
      .filter(Boolean),
  })).filter((track) => track.accessibleModules.length > 0);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

export function renderPilotStarterPanel({ modules, onOpenFeedback }) {
  const tracks = selectAccessibleStarterTracks(modules);
  if (!tracks.length) return null;
  return el(
    "section",
    {
      class: "panel starter-panel section-gap",
      "aria-labelledby": "starter-heading",
    },
    el(
      "div",
      { class: "section-header" },
      el(
        "div",
        {},
        el("span", { class: "eyebrow" }, "First-run starter"),
        el(
          "h2",
          { id: "starter-heading" },
          "Start with one workflow — ignore the rest for now",
        ),
      ),
      el(
        "button",
        {
          type: "button",
          class: "button subtle",
          onclick: () => onOpenFeedback?.("missing_workflow"),
        },
        "Missing a workflow? Tell us",
      ),
    ),
    el(
      "p",
      { class: "fine starter-scope" },
      "Charity OS coordinates programs, grants, volunteers, approvals, and exportable snapshots. Keep bookkeeping, payroll, and online donation checkout in QuickBooks, Xero, or Stripe.",
    ),
    el(
      "div",
      { class: "starter-tracks" },
      tracks.map((track) =>
        el(
          "article",
          { class: "starter-track" },
          el("h3", {}, track.title),
          el("p", {}, track.summary),
          el(
            "div",
            { class: "starter-links" },
            track.accessibleModules.map((module) =>
              el(
                "a",
                { class: "starter-chip", href: `#module/${module.id}` },
                `${module.title} →`,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function wirePilotFeedbackDialog({
  dialog,
  trigger,
  api,
  getContext,
  isSignedIn,
  getUserEmail,
  toast,
}) {
  if (!dialog) return { open: () => {} };
  const form = dialog.querySelector("#pilot-feedback-form");
  const categoryInput = dialog.querySelector("#pilot-feedback-category");
  const messageInput = dialog.querySelector("#pilot-feedback-message");
  const replyWrap = dialog.querySelector("#pilot-feedback-reply-wrap");
  const replyInput = dialog.querySelector("#pilot-feedback-reply");
  const replyLabel = dialog.querySelector("#pilot-feedback-reply-label");
  const contextLine = dialog.querySelector("#pilot-feedback-context");
  const statusLine = dialog.querySelector("#pilot-feedback-status");
  const submitButton = dialog.querySelector("#pilot-feedback-submit");
  const closeButton = dialog.querySelector("#pilot-feedback-close");
  const cancelButton = dialog.querySelector("#pilot-feedback-cancel");
  const mailtoLink = dialog.querySelector("#pilot-feedback-mailto");
  const githubLink = dialog.querySelector("#pilot-feedback-github");
  const signedOutNote = dialog.querySelector("#pilot-feedback-signed-out-note");

  let currentContext = { screen: "home", viewport: "unknown", theme: "light" };

  const syncLinks = () => {
    const payload = {
      category: categoryInput?.value || "confusing",
      message: messageInput?.value || "",
      ...currentContext,
    };
    if (mailtoLink) mailtoLink.href = buildPilotMailtoUrl(payload);
    if (githubLink) githubLink.href = buildPilotGithubIssueUrl(payload);
  };

  const open = (initialCategory = "") => {
    currentContext = getContext?.() || currentContext;
    if (
      initialCategory &&
      categoryInput &&
      PILOT_FEEDBACK_CATEGORIES.some((item) => item.id === initialCategory)
    ) {
      categoryInput.value = initialCategory;
    }
    const signedIn = Boolean(isSignedIn?.());
    const userEmail = getUserEmail?.() || "";
    if (contextLine) {
      contextLine.textContent = `Included context (no records or private data): ${formatPilotContextSummary(currentContext)}`;
    }
    if (replyWrap) replyWrap.hidden = !signedIn || !userEmail;
    if (replyLabel && userEmail) {
      replyLabel.textContent = `You may email me back at ${userEmail}`;
    }
    if (signedOutNote) signedOutNote.hidden = signedIn;
    if (submitButton) {
      submitButton.textContent = signedIn
        ? "Send pilot feedback"
        : "Open pre-filled email";
    }
    if (statusLine) {
      statusLine.textContent = "";
      statusLine.classList.remove("error-text");
    }
    syncLinks();
    if (typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    }
    messageInput?.focus();
  };

  const close = () => {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
  };

  trigger?.addEventListener("click", () => open());
  closeButton?.addEventListener("click", close);
  cancelButton?.addEventListener("click", close);
  categoryInput?.addEventListener("change", syncLinks);
  messageInput?.addEventListener("input", syncLinks);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncLinks();
    const message = String(messageInput?.value || "").trim();
    if (message.length < 10) {
      if (statusLine) {
        statusLine.textContent =
          "Share at least 10 characters so we know what to improve.";
        statusLine.classList.add("error-text");
      }
      messageInput?.focus();
      return;
    }
    if (!isSignedIn?.()) {
      window.location.href = buildPilotMailtoUrl({
        category: categoryInput?.value || "confusing",
        message,
        ...currentContext,
      });
      close();
      return;
    }
    if (submitButton) submitButton.disabled = true;
    if (statusLine) {
      statusLine.textContent = "Sending feedback…";
      statusLine.classList.remove("error-text");
    }
    try {
      await api.pilotFeedback({
        category: categoryInput?.value || "confusing",
        message,
        screen: currentContext.screen,
        viewport: currentContext.viewport,
        theme: currentContext.theme,
        allowReply: Boolean(replyInput?.checked),
      });
      if (messageInput) messageInput.value = "";
      if (replyInput) replyInput.checked = false;
      close();
      toast?.("Pilot feedback sent to Charitology. Thank you.");
    } catch (error) {
      if (statusLine) {
        statusLine.textContent =
          error?.message ||
          "Could not send directly right now. Use the pre-filled email or GitHub link below.";
        statusLine.classList.add("error-text");
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  return { open, close };
}
