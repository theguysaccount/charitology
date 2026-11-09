/** Fixed, IO-free copy. Rendering never establishes recipient or origin authority. */
import { hash, stable, escape } from "./security.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";

export const PARTICIPATION_REMINDER_VARIANT = "pre-occurrence-v1";
export const PARTICIPATION_REMINDER_TEMPLATE_VERSION = "participation-reminder-notice-v1";
export const PARTICIPATION_REMINDER_SUBJECT = "Reminder: review your participation";
const MESSAGE = "You asked for a reminder about your participation. Sign in to check the current details. This best-effort reminder does not confirm a place or record attendance.";
const CHOICE = "This operational reminder does not subscribe you to The Charitology Letter. Manage participation email choices after signing in to your portal.";
const FOOTER = "Charitology · 938 Peacock Station Rd, McLean, VA 22102";

function portal(value) {
  if (typeof value !== "string" || value.length > 512) throw new TypeError("Use the configured clean HTTPS participant portal URL.");
  let url;
  try { url = new URL(value); } catch { throw new TypeError("Use the configured clean HTTPS participant portal URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/participant" ||
      url.search || url.hash || url.href !== value || value !== url.origin + "/participant") throw new TypeError("Use the configured clean HTTPS participant portal URL.");
  return value;
}

/** The caller must prove url equals its current configured OS origin + path.
 * No address, occurrence name/location, participant answer or caller text enters copy. */
export function renderParticipationReminderTemplate(portalUrl) {
  const url = portal(portalUrl);
  return Object.freeze({
    variant: PARTICIPATION_REMINDER_VARIANT,
    templateVersion: PARTICIPATION_REMINDER_TEMPLATE_VERSION,
    subject: PARTICIPATION_REMINDER_SUBJECT,
    text: `${PARTICIPATION_REMINDER_SUBJECT}. ${MESSAGE} Open your participant portal: ${url} ${CHOICE} ${FOOTER}`,
    html: `<h1>${PARTICIPATION_REMINDER_SUBJECT}</h1><p>${MESSAGE}</p><p><a href="${escape(url)}">Open your participant portal</a></p><p>${CHOICE}</p><p>${FOOTER}</p>`,
    url,
  });
}

export function validateParticipationReminderTemplate(input) {
  const value = ownGroupValue(input, 8192);
  if (!value || Array.isArray(value) || Object.keys(value).length !== 6 ||
      !["variant", "templateVersion", "subject", "text", "html", "url"].every(k => Object.hasOwn(value, k)) ||
      stable(value) !== stable(renderParticipationReminderTemplate(value.url))) throw new TypeError("Use the exact fixed reminder template.");
  return value;
}

export function participationReminderTemplateSha256(input) {
  return hash({ method: "participation-reminder-v1", kind: "fixed-template", value: validateParticipationReminderTemplate(input) });
}
