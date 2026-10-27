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

const PARTICIPATION_STATES = new Set([
  "accepted",
  "delivered",
  "suppressed",
  "failed",
  "unknown",
  "limited",
  "creating",
  "unavailable",
]);
const PARTICIPATION_CODES = new Set([
  "accepted",
  "delivered",
  "suppressed",
  "failed",
  "unknown",
  "creating",
  "limited",
  "preflight_unavailable",
  "participation_disabled",
  "controlled_recipient_required",
  "rate_limited",
  "status_rate_limited",
  "intent_not_found",
  "attempt_unconfirmed",
  "recipient_suppressed",
  "provider_accepted",
  "provider_delivered",
  "provider_failed",
  "provider_suppressed",
  "provider_bounced",
  "provider_complained",
  "provider_delayed",
  "payload_conflict",
  "invalid_request",
  "transport_unavailable",
  "response_unconfirmed",
  "intent_unknown",
  "intent_in_progress",
  "intent_lookup_unavailable",
  "intent_conflict",
  "reservation_unconfirmed",
  "provider_rejected",
  "provider_sent",
  "provider_delivery_delayed",
  "provider_canceled",
  "authentication_required",
  "server_only",
  "status_unavailable",
]);
const outcome = (state, safeCode, providerEventAt = null) => ({
  state,
  safeCode,
  providerEventAt,
});
async function boundedRelayOutcome(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!/^application\/json(?:;|$)/i.test(contentType))
    return outcome("unknown", "response_unconfirmed");
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of response.body || []) {
      size += chunk.byteLength;
      if (size > 16384) return outcome("unknown", "response_unconfirmed");
      chunks.push(chunk);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !PARTICIPATION_STATES.has(value.state) ||
      typeof value.ok !== "boolean" ||
      !PARTICIPATION_CODES.has(value.safeCode)
    )
      return outcome("unknown", "response_unconfirmed");
    const stamp = value.providerEventAt;
    if (
      stamp !== null &&
      stamp !== undefined &&
      (typeof stamp !== "string" ||
        !Number.isFinite(Date.parse(stamp)) ||
        new Date(stamp).toISOString() !== stamp)
    )
      return outcome("unknown", "response_unconfirmed");
    const code = PARTICIPATION_CODES.has(value.safeCode)
      ? value.safeCode
      : "response_unconfirmed";
    if (
      ["accepted", "delivered"].includes(value.state) &&
      (!response.ok || value.ok !== true)
    )
      return outcome("unknown", "response_unconfirmed");
    return outcome(value.state, code, stamp || null);
  } catch {
    return outcome("unknown", "response_unconfirmed");
  }
}

// Separate typed transport: legacy login/invitation/reminder callers retain their
// existing response contract. No address or provider payload is retained here.
export function participationMailer(settings, { fetcher = fetch } = {}) {
  async function operation(path, input, key, { deadline } = {}) {
    if (!settings.relaySecret)
      return outcome("unavailable", "transport_unavailable");
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key || ""))
      return outcome("failed", "invalid_request");
    let target;
    try {
      target = new URL(settings.relayUrl);
      if (
        target.search ||
        target.hash ||
        target.username ||
        target.password ||
        target.pathname !== "/api/system/os-mail"
      )
        return outcome("unavailable", "transport_unavailable");
      const local =
        !settings.production &&
        target.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(target.hostname);
      if (target.protocol !== "https:" && !local)
        return outcome("unavailable", "transport_unavailable");
      if (path) target.pathname += path;
    } catch {
      return outcome("unavailable", "transport_unavailable");
    }
    const milliseconds = Math.floor(
      Math.min(20000, (deadline || Date.now() + 23000) - Date.now() - 3000),
    );
    if (milliseconds <= 0)
      return outcome(
        "unavailable",
        path ? "status_unavailable" : "preflight_unavailable",
      );
    try {
      const response = await fetcher(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${settings.relaySecret}`,
          ...(path ? {} : { "idempotency-key": key }),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(milliseconds),
        redirect: "error",
      });
      return await boundedRelayOutcome(response);
    } catch {
      return outcome("unknown", "response_unconfirmed");
    }
  }
  return {
    async sendParticipation(message, key, options) {
      if (!settings.participationDeliveryEnabled)
        return outcome("unavailable", "participation_disabled");
      if (
        !message ||
        Object.keys(message).some(
          (field) => !["purpose", "to", "url"].includes(field),
        ) ||
        message.purpose !== "participation" ||
        typeof message.to !== "string" ||
        message.to.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)
      )
        return outcome("failed", "invalid_request");
      let expected;
      try {
        expected = new URL("/participant", settings.origin).toString();
      } catch {
        return outcome("failed", "invalid_request");
      }
      if (message.url !== expected) return outcome("failed", "invalid_request");
      if (
        settings.participationTestOnly &&
        (!settings.participationTestRecipient ||
          message.to.trim().toLowerCase() !==
            settings.participationTestRecipient)
      )
        return outcome("unavailable", "controlled_recipient_required");
      return operation("", message, key, options);
    },
    participationStatus(key, options) {
      return operation("/status", { idempotencyKey: key }, key, options);
    },
  };
}
