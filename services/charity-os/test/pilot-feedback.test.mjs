import test from "node:test";
import assert from "node:assert/strict";
import {
  PILOT_FEEDBACK_RECIPIENT,
  validatePilotFeedback,
  buildPilotFeedbackRelayPayload,
  sendPilotFeedback,
} from "../lib/pilot-feedback.mjs";
import { validateOsMail } from "../../newsletter/lib/os-mail.mjs";

test("validatePilotFeedback enforces category, message length, and allowlisted fields", () => {
  const valid = validatePilotFeedback({
    category: "missing_workflow",
    message: "We need a simple way to log recurring monthly donor pledges.",
    screen: "module/grant-delivery",
    viewport: "1280x800",
    theme: "dark",
    allowReply: false,
  });
  assert.equal(valid.category, "missing_workflow");
  assert.equal(valid.screen, "module/grant-delivery");
  assert.equal(valid.viewport, "1280x800");
  assert.equal(valid.theme, "dark");
  assert.equal(valid.allowReply, false);

  assert.throws(
    () =>
      validatePilotFeedback({
        category: "unknown_kind",
        message: "This message is long enough to pass length check.",
      }),
    /Choose a feedback category/,
  );

  assert.throws(
    () =>
      validatePilotFeedback({
        category: "bug",
        message: "too short",
      }),
    /at least 10 characters/,
  );

  assert.throws(
    () =>
      validatePilotFeedback({
        category: "bug",
        message: "A valid message with enough characters.",
        orgRecords: ["should-never-be-accepted"],
      }),
    /Unknown feedback field/,
  );
});

test("buildPilotFeedbackRelayPayload satisfies live mail.charitology.org os-mail contract and protects user email by default", () => {
  const feedback = validatePilotFeedback({
    category: "confusing",
    message: "It took me a while to understand what Working desks meant on the Overview screen.",
    screen: "home",
    viewport: "390x844",
    theme: "light",
    allowReply: false,
  });

  const payload = buildPilotFeedbackRelayPayload({
    feedback,
    settings: { origin: "https://os.charitology.org" },
    userEmail: "director@example-charity.org",
  });

  assert.equal(payload.purpose, "reminder");
  assert.equal(payload.to, PILOT_FEEDBACK_RECIPIENT);
  assert.equal(payload.url, "https://os.charitology.org/app");
  assert.ok(!payload.message.includes("director@example-charity.org"));
  assert.ok(payload.message.includes("Reply contact: not shared"));

  // Cross-check directly against the live newsletter relay validator
  const validatedByRelay = validateOsMail(payload, {
    osOrigin: "https://os.charitology.org",
  });
  assert.equal(validatedByRelay.purpose, "reminder");
  assert.equal(validatedByRelay.to, PILOT_FEEDBACK_RECIPIENT);

  const optedIn = buildPilotFeedbackRelayPayload({
    feedback: { ...feedback, allowReply: true },
    settings: { origin: "https://os.charitology.org" },
    userEmail: "director@example-charity.org",
  });
  assert.ok(optedIn.message.includes("Reply contact: director@example-charity.org"));
});

test("sendPilotFeedback enforces per-user rate limit and invokes mail relay with bounded idempotency key", async () => {
  const limits = [];
  const sent = [];
  const db = {
    limit: async (key, max, windowSec) => {
      limits.push({ key, max, windowSec });
    },
  };
  const send = async (payload, key) => {
    sent.push({ payload, key });
    return { accepted: true };
  };

  const result = await sendPilotFeedback({
    db,
    send,
    settings: { origin: "https://os.charitology.org" },
    session: { user: { id: "user_123", email: "pilot@example.org" } },
    input: {
      category: "works_well",
      message: "Frozen grant snapshots made our board packet super easy to export.",
      screen: "reports",
      viewport: "1440x900",
      theme: "light",
      allowReply: true,
    },
  });

  assert.deepEqual(result, {
    delivered: true,
    category: "works_well",
    recipient: PILOT_FEEDBACK_RECIPIENT,
  });
  assert.equal(limits.length, 1);
  assert.equal(limits[0].max, 5);
  assert.equal(limits[0].windowSec, 3600);
  assert.ok(limits[0].key.startsWith("pilot-feedback:"));
  assert.equal(sent.length, 1);
  assert.ok(/^pilot-feedback-[A-Za-z0-9_-]{8,80}$/.test(sent[0].key));
  assert.equal(sent[0].payload.purpose, "reminder");
});
