import { clean, fail, hash, id } from "./security.mjs";

export const PILOT_FEEDBACK_RECIPIENT = "hello@charitology.org";

export const PILOT_FEEDBACK_CATEGORIES = Object.freeze({
  confusing: "Confusing or hard to use",
  missing_workflow: "Missing workflow",
  bug: "Something broke",
  works_well: "Works well",
});

const ALLOWED_KEYS = new Set([
  "category",
  "message",
  "screen",
  "viewport",
  "theme",
  "allowReply",
]);

function cleanMultiline(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export function validatePilotFeedback(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail(422, "pilot_feedback", "Supply a feedback object.");
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(422, key, "Unknown feedback field.");
    }
  }
  const category = typeof input.category === "string" ? input.category.trim() : "";
  if (!Object.hasOwn(PILOT_FEEDBACK_CATEGORIES, category)) {
    fail(422, "category", "Choose a feedback category.");
  }
  const rawMessage = typeof input.message === "string" ? input.message : "";
  const message = cleanMultiline(rawMessage, 650);
  if (message.length < 10) {
    fail(
      422,
      "message",
      "Share at least 10 characters so we know what to improve.",
    );
  }
  if (rawMessage.trim().length > 650) {
    fail(422, "message", "Keep feedback notes under 650 characters.");
  }

  const rawScreen = clean(input.screen || "home", 80).replace(/[^A-Za-z0-9:/_.-]/g, "");
  const screen = rawScreen || "home";

  const rawViewport = clean(input.viewport || "", 32);
  const viewport = /^\d{2,5}x\d{2,5}$/.test(rawViewport) ? rawViewport : "unknown";

  const rawTheme = clean(input.theme || "", 16).toLowerCase();
  const theme = rawTheme === "dark" || rawTheme === "light" ? rawTheme : "unknown";

  const allowReply = input.allowReply === true;

  return {
    category,
    categoryLabel: PILOT_FEEDBACK_CATEGORIES[category],
    message,
    screen,
    viewport,
    theme,
    allowReply,
  };
}

export function buildPilotFeedbackRelayPayload({ feedback, settings, userEmail }) {
  const to = settings?.pilotFeedbackRecipient || PILOT_FEEDBACK_RECIPIENT;
  const appUrl = new URL("/app", settings.origin).toString();
  const title = clean(
    `Pilot feedback (${feedback.categoryLabel}) — ${feedback.screen}`,
    180,
  );
  const replyLine =
    feedback.allowReply && typeof userEmail === "string" && userEmail.trim()
      ? `Reply contact: ${clean(userEmail, 254)}`
      : "Reply contact: not shared";

  const lines = [
    `Category: ${feedback.categoryLabel}`,
    `Screen: ${feedback.screen}`,
    `Viewport: ${feedback.viewport} · Theme: ${feedback.theme}`,
    replyLine,
    "",
    feedback.message,
  ];
  const bodyText = lines.join("\n").slice(0, 1000);

  return {
    purpose: "reminder",
    to,
    url: appUrl,
    organizationName: "Charity OS Pilot",
    title,
    message: bodyText,
  };
}

export async function sendPilotFeedback({ db, send, settings, session, input }) {
  const feedback = validatePilotFeedback(input);
  await db.limit(`pilot-feedback:${hash(session.user.id)}`, 5, 3600);
  const payload = buildPilotFeedbackRelayPayload({
    feedback,
    settings,
    userEmail: session?.user?.email || "",
  });
  await send(payload, `pilot-feedback-${id()}`);
  return {
    delivered: true,
    category: feedback.category,
    recipient: payload.to,
  };
}
