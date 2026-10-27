import test from "node:test";
import assert from "node:assert/strict";
import { participationMailer } from "../lib/mail.mjs";
import { runOrgJobs } from "../lib/jobs.mjs";
const settings = {
  origin: "https://os.example.invalid",
  relayUrl: "https://mail.example.invalid/api/system/os-mail",
  relaySecret: "fictional-private-relay-secret",
  participationDeliveryEnabled: true,
  participationTestOnly: true,
  participationTestRecipient: "synthetic@example.invalid",
  production: true,
};
const message = {
  purpose: "participation",
  to: "synthetic@example.invalid",
  url: "https://os.example.invalid/participant",
};
const response = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const accepted = {
  ok: true,
  state: "accepted",
  safeCode: "provider_accepted",
  providerEventAt: null,
};
test("participation transport sends only the fixed purpose and clean portal, with a separate keyed status read", async () => {
  const calls = [];
  const transport = participationMailer(settings, {
    fetcher: async (url, options) => {
      calls.push({ url: String(url), options });
      return response({
        ...accepted,
        providerId: "must-not-escape",
        recipient: "must-not-escape",
      });
    },
  });
  assert.deepEqual(
    await transport.sendParticipation(message, "fictional-key-123456"),
    { state: "accepted", safeCode: "provider_accepted", providerEventAt: null },
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), message);
  assert.equal(
    calls[0].options.headers["idempotency-key"],
    "fictional-key-123456",
  );
  assert.equal(calls[0].options.redirect, "error");
  await transport.participationStatus("fictional-key-123456");
  assert.equal(calls[1].url, settings.relayUrl + "/status");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    idempotencyKey: "fictional-key-123456",
  });
  assert.equal(calls[1].options.headers["idempotency-key"], undefined);
});
test("participation client refuses implicit activation, other recipients and unsafe purpose links before network I/O", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return response(accepted);
  };
  assert.equal(
    (
      await participationMailer(
        { ...settings, participationDeliveryEnabled: false },
        { fetcher },
      ).sendParticipation(message, "safe-key")
    ).safeCode,
    "participation_disabled",
  );
  const transport = participationMailer(settings, { fetcher });
  for (const changes of [
    { purpose: "reminder" },
    { title: "arbitrary staff copy" },
    { url: message.url + "?receipt=private" },
    { url: message.url + "#private" },
    { url: "https://other.example.invalid/participant" },
    { to: "other@example.invalid" },
  ]) {
    const result = await transport.sendParticipation(
      { ...message, ...changes },
      "safe-key",
    );
    assert.ok(
      ["invalid_request", "controlled_recipient_required"].includes(
        result.safeCode,
      ),
    );
  }
  assert.equal(calls, 0);
});
test("lost, malformed, contradictory and oversized relay responses remain unknown without internal retries", async () => {
  const cases = [
    async () => {
      throw new Error("synthetic lost response");
    },
    async () => new Response("<html>provider</html>"),
    async () => response({ ...accepted, ok: false }),
    async () => response(accepted, 503),
    async () => response({ ...accepted, safeCode: "private_opaque_error" }),
    async () => response({ ...accepted, providerEventAt: "2026-10-26" }),
    async () => response({ ...accepted, padding: "x".repeat(16384) }),
  ];
  for (const fetcher of cases) {
    let calls = 0;
    const transport = participationMailer(settings, {
      fetcher: async (...args) => {
        calls++;
        return fetcher(...args);
      },
    });
    assert.deepEqual(
      await transport.sendParticipation(message, "same-unchanged-key"),
      {
        state: "unknown",
        safeCode: "response_unconfirmed",
        providerEventAt: null,
      },
    );
    assert.equal(calls, 1);
  }
});
test("typed preflight and missing-intent results stay distinct, and status reads remain usable with send gate off", async () => {
  let calls = 0;
  const transport = participationMailer(
    { ...settings, participationDeliveryEnabled: false },
    {
      fetcher: async () => {
        calls++;
        return response(
          {
            ok: false,
            state: "unknown",
            safeCode: "intent_unknown",
            providerEventAt: null,
          },
          404,
        );
      },
    },
  );
  assert.deepEqual(await transport.participationStatus("historical-key"), {
    state: "unknown",
    safeCode: "intent_unknown",
    providerEventAt: null,
  });
  assert.equal(calls, 1);
  const send = participationMailer(settings, {
    fetcher: async () =>
      response(
        {
          ok: false,
          state: "unavailable",
          safeCode: "preflight_unavailable",
          providerEventAt: null,
        },
        503,
      ),
  });
  assert.equal(
    (await send.sendParticipation(message, "preflight-key")).safeCode,
    "preflight_unavailable",
  );
  const delivered = participationMailer(settings, {
    fetcher: async () =>
      response({
        ok: true,
        state: "delivered",
        safeCode: "provider_delivered",
        providerEventAt: "2026-10-27T00:00:00.000Z",
      }),
  });
  assert.equal(
    (await delivered.participationStatus("delivery-key")).providerEventAt,
    "2026-10-27T00:00:00.000Z",
  );
});
test("one shared job budget bounds cancelled work and unknown job kinds cannot fall through to transport", async () => {
  const states = [];
  let selected = 0,
    sends = 0;
  const budget = { deadline: Date.now() + 45000, remaining: 2 };
  const c = {
    query: async (sql, args) => {
      if (sql.startsWith("SELECT * FROM os_jobs")) {
        selected++;
        return {
          rows: [
            {
              id: "fictional-" + selected,
              kind: "participation",
              payload: message,
            },
          ],
        };
      }
      if (sql.startsWith("UPDATE os_jobs SET status='processing'"))
        return { rows: [] };
      if (sql.startsWith("UPDATE os_jobs SET status=$3")) {
        states.push(args[2]);
        return { rows: [] };
      }
      throw new Error("Unexpected budget query");
    },
  };
  const result = await runOrgJobs({
    db: { tx: async (_u, _o, fn) => fn(c) },
    org: "fictional-org",
    settings,
    send: async () => {
      sends++;
    },
    budget,
  });
  assert.equal(result.operations, 2);
  assert.equal(budget.remaining, 0);
  assert.equal(selected, 2);
  assert.equal(sends, 0);
  assert.deepEqual(states, ["cancelled", "cancelled"]);
});
