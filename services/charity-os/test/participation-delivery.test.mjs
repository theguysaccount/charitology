import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_CONSENT_VERSION,
  DELIVERY_TEMPLATE_VERSION,
  deliveryConsentValid,
  deliveryMessage,
  deliveryOutcome,
  resolveDeliveryRecipient,
  deliveryRoutes,
  ownDeliveryRoutes,
  runParticipationDelivery,
} from "../lib/participation-delivery.mjs";
import {
  restoredDelivery,
  restoreDelivery,
} from "../lib/participation-delivery-backup.mjs";
import { hash } from "../lib/security.mjs";
const email = "synthetic@example.invalid";
const consent = () => ({
  version: DELIVERY_CONSENT_VERSION,
  enabled: true,
  revision: 1,
  at: "2026-10-26T12:00:00.000Z",
  userId: "synthetic-user",
  linkId: "a".repeat(32),
  linkRevision: 1,
  recipientHash: hash(email),
});
const error = (code) => (e) => e.code === code;

test("live delivery requires the new exact verified consent binding; preference-only history is inert", () => {
  assert.equal(
    deliveryConsentValid({ emailUpdates: true, recipientHash: hash(email) }),
    false,
  );
  assert.equal(deliveryConsentValid(consent()), true);
  for (const change of [
    { enabled: false },
    { version: "old-copy" },
    { linkRevision: 0 },
    { recipientHash: email },
    { userId: null },
    { at: "yesterday" },
    { linkId: "not-a-link" },
  ])
    assert.equal(deliveryConsentValid({ ...consent(), ...change }), false);
});
test("fixed delivery payload has only one verified recipient and clean participant URL", () => {
  assert.deepEqual(
    deliveryMessage(
      { origin: "https://os.example.invalid" },
      " SYNTHETIC@example.invalid ",
    ),
    {
      purpose: "participation",
      to: email,
      url: "https://os.example.invalid/participant",
    },
  );
  assert.throws(
    () => deliveryMessage({ origin: "https://os.example.invalid" }, "invalid"),
    error("participation_delivery_recipient"),
  );
});
test("only exact SEND preflight proof permits a same-key defer; status absence never permits resend", () => {
  const proof = {
    state: "unavailable",
    safeCode: "preflight_unavailable",
    providerEventAt: null,
  };
  assert.deepEqual(deliveryOutcome(proof), {
    state: "pending",
    safeCode: "preflight_unavailable",
    providerEventAt: null,
    provenNoAttempt: true,
  });
  assert.equal(deliveryOutcome(proof, { status: true }).state, "unknown");
  for (const state of ["creating", "unknown", "unavailable"])
    assert.equal(
      deliveryOutcome({
        state,
        safeCode: "intent_unknown",
        providerEventAt: null,
      }).state,
      "unknown",
    );
  assert.deepEqual(
    deliveryOutcome({
      state: "limited",
      safeCode: "rate_limited",
      providerEventAt: null,
    }),
    { state: "failed", safeCode: "rate_limited", providerEventAt: null },
  );
});
test("status reduction rejects raw codes, contradictory facts and invented timestamps", () => {
  for (const value of [
    null,
    [],
    { state: "accepted", safeCode: "private@example.invalid" },
    { state: "accepted", safeCode: "provider_failed" },
    { state: "unknown", safeCode: "provider_bounced", providerEventAt: null },
    {
      state: "creating",
      safeCode: "provider_suppressed",
      providerEventAt: null,
    },
    {
      state: "delivered",
      safeCode: "provider_delivered",
      providerEventAt: "yesterday",
    },
  ])
    assert.deepEqual(deliveryOutcome(value), {
      state: "unknown",
      safeCode: "response_unconfirmed",
      providerEventAt: null,
    });
  const at = "2026-10-26T12:01:00.000Z";
  assert.deepEqual(
    deliveryOutcome({
      state: "delivered",
      safeCode: "provider_delivered",
      providerEventAt: at,
    }),
    { state: "delivered", safeCode: "provider_delivered", providerEventAt: at },
  );
});
test("saved-user recipient resolver restores caller RLS context and never uses staff/contact input", async () => {
  const calls = [];
  const c = {
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes("current_setting"))
        return { rows: [{ user_id: "staff" }] };
      if (sql.startsWith("SELECT l.id"))
        return {
          rows: [
            {
              id: "a".repeat(32),
              revision: 1,
              user_id: "synthetic-user",
              email,
              verified: true,
            },
          ],
        };
      return { rows: [] };
    },
  };
  assert.deepEqual(
    await resolveDeliveryRecipient(c, {
      org: "synthetic-org",
      participation: {
        intake_id: "synthetic-intake",
        delivery_consent: consent(),
      },
    }),
    {
      email,
      userId: "synthetic-user",
      linkId: "a".repeat(32),
      linkRevision: 1,
    },
  );
  assert.deepEqual(
    calls.filter((c) => c.sql.includes("set_config")).map((c) => c.args),
    [["synthetic-user"], ["staff"]],
  );
  assert.ok(
    calls
      .find((c) => c.sql.includes('JOIN "user"'))
      .sql.includes("i.erased_at IS NULL"),
  );
  calls.length = 0;
  assert.equal(
    await resolveDeliveryRecipient(c, {
      org: "synthetic-org",
      participation: {
        intake_id: "synthetic-intake",
        delivery_consent: { emailUpdates: true },
      },
    }),
    null,
  );
  assert.equal(calls.length, 0);
});
test("recipient resolver restores RLS context even on a failed private lookup", async () => {
  const calls = [];
  const c = {
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes("current_setting"))
        return { rows: [{ user_id: "staff" }] };
      if (sql.startsWith("SELECT l.id")) throw new Error("synthetic failure");
      return { rows: [] };
    },
  };
  await assert.rejects(
    resolveDeliveryRecipient(c, {
      org: "synthetic-org",
      participation: {
        intake_id: "synthetic-intake",
        delivery_consent: consent(),
      },
    }),
    /synthetic failure/,
  );
  assert.deepEqual(calls.at(-1).args, ["staff"]);
});
test("staff delivery routes reject snapshot-only readers before a tenant read", async () => {
  await assert.rejects(
    deliveryRoutes({
      c: {
        query() {
          throw new Error("unexpected read");
        },
      },
      org: "o",
      user: "reader",
      member: { role: "board_reader", programIds: [] },
      tail: "participation-delivery",
      method: "GET",
      url: new URL(
        "https://os.example.invalid/api/orgs/o/participation-delivery",
      ),
      settings: {},
    }),
    error("role"),
  );
});
test("own delivery query rejects token leakage and mutation refuses missing same-origin CSRF before database", async () => {
  const path =
      "https://os.example.invalid/api/participant/orgs/o/requests/i/participations/p/delivery",
    session = {
      user: { id: "synthetic-user", email, emailVerified: true },
      session: { id: "synthetic-session" },
    },
    db = {
      tx() {
        throw new Error("unexpected database");
      },
    };
  await assert.rejects(
    ownDeliveryRoutes({
      request: new Request(path + "?token=private"),
      db,
      session,
      settings: { origin: "https://os.example.invalid" },
    }),
    error("participant_query"),
  );
  await assert.rejects(
    ownDeliveryRoutes({
      request: new Request(path.replace(/delivery$/, "delivery-preference"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      db,
      session,
      settings: {
        origin: "https://os.example.invalid",
        secret: "synthetic-secret",
      },
    }),
    error("origin"),
  );
});
test("delivery policy backup strips authority, refuses injected fields and restores a fresh disabled epoch", async () => {
  const source = {
    delivery: {
      version: 1,
      policy: {
        revision: 8,
        enabled: true,
        activatedAt: "2026-10-26T12:00:00.000Z",
        templateVersion: DELIVERY_TEMPLATE_VERSION,
        updatedAt: "2026-10-26T12:00:01.000Z",
      },
    },
  };
  const normalized = restoredDelivery(source);
  assert.equal(normalized.policy.enabled, false);
  assert.throws(
    () =>
      restoredDelivery({
        delivery: {
          ...source.delivery,
          policy: { ...source.delivery.policy, relayKey: "private" },
        },
      }),
    error("participation_delivery_backup"),
  );
  assert.throws(
    () =>
      restoredDelivery({
        delivery: { version: 1, policy: null, previews: [] },
      }),
    error("participation_delivery_backup"),
  );
  const calls = [];
  await restoreDelivery(
    { query: async (sql, args) => calls.push({ sql, args }) },
    "restored-org",
    "restored-admin",
    normalized,
  );
  assert.match(calls[0].sql, /VALUES\(\$1,1,false,\$2,NULL,\$3\)/);
  assert.match(calls[0].args[1], /^[a-f0-9]{32}$/);
  assert.deepEqual(restoredDelivery({}), { version: 1, policy: null });
});
test("dispatcher respects exhausted shared budget without database or transport", async () => {
  const budget = { remaining: 0, deadline: Date.now() + 45000 };
  assert.equal(
    (
      await runParticipationDelivery({
        db: {
          pool: {
            query() {
              throw new Error("unexpected database");
            },
          },
        },
        transport: {
          sendParticipation() {
            throw new Error("unexpected send");
          },
          participationStatus() {
            throw new Error("unexpected status");
          },
        },
        settings: {},
        budget,
      })
    ).attempted,
    0,
  );
  assert.equal(budget.remaining, 0);
});
