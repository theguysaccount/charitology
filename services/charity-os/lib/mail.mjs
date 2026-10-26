import { fail, hash } from "./security.mjs";
export function mailer(settings) {
  return async function send(message, key, { deadline } = {}) {
    if (!settings.relaySecret)
      fail(503, "mail_configuration", "Email delivery is not configured.");
    const response = await fetch(settings.relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.relaySecret}`,
        "idempotency-key": key || `os-${hash(message)}`,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(
        Math.max(
          1,
          Math.min(20000, (deadline || Date.now() + 23000) - Date.now() - 3000),
        ),
      ),
    });
    if (!response.ok)
      fail(
        503,
        "mail_delivery",
        "Email delivery is temporarily unavailable. Please try again later.",
      );
    return { accepted: true };
  };
}
