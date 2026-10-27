import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../lib/handler.mjs";
import { csrf, fail, hash } from "../lib/security.mjs";

const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-report-wiring-secret-more-than-thirty-two-characters",
};
const session = {
  user: { id: "synthetic-private-account", email: "nobody@example.invalid" },
  session: { id: "synthetic-report-session" },
};
function fixture(signedIn = true) {
  const calls = [];
  const handle = createHandler({
    settings,
    auth: { api: { getSession: async () => (signedIn ? session : null) } },
    db: {
      limit: async (...args) => {
        calls.push(args);
        fail(429, "rate", "Synthetic exhausted request allowance.");
      },
      tx: async () => {
        assert.fail(
          "Rejected grant-report requests must not open a tenant transaction.",
        );
      },
    },
    send: async () => assert.fail("Report requests must not send email."),
  });
  return { handle, calls };
}
function request(method, payload = "{}", extra = {}) {
  return new Request(
    settings.origin + "/api/orgs/synthetic-org/grant-reports/preview",
    {
      method,
      headers: {
        origin: settings.origin,
        "x-csrf-token": csrf(session.session.id, settings.secret),
        "content-type": "application/json",
        ...extra,
      },
      ...(["GET", "HEAD"].includes(method) ? {} : { body: payload }),
    },
  );
}

test("Unsigned report commands fail before consuming a body or a request allowance", async () => {
  const { handle, calls } = fixture(false);
  const response = await handle(request("POST", "{invalid-json"));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "session");
  assert.deepEqual(calls, []);
});

test("Report commands require the current origin and session CSRF before body parsing", async () => {
  for (const [headers, code] of [
    [{ origin: "https://another.example.invalid" }, "origin"],
    [{ "x-csrf-token": "wrong-session" }, "csrf"],
  ]) {
    const { handle, calls } = fixture();
    const response = await handle(request("POST", "{invalid-json", headers));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, code);
    assert.deepEqual(calls, []);
  }
});

test("Actual report body bytes are bounded even without a truthful Content-Length", async () => {
  const payload = JSON.stringify({ title: "x".repeat(16384) });
  for (const headers of [{}, { "content-length": "2" }]) {
    const { handle, calls } = fixture();
    const response = await handle(request("POST", payload, headers));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "size");
    assert.deepEqual(calls, []);
  }
});

test("Report reads and commands have independent durable hashed-account allowances", async () => {
  for (const [method, bucket, maximum] of [
    ["GET", "read", 120],
    ["HEAD", "read", 120],
    ["POST", "write", 60],
  ]) {
    const { handle, calls } = fixture();
    const response = await handle(request(method));
    assert.equal(response.status, 429);
    assert.deepEqual(calls, [
      [`grant-report-${bucket}:${hash(session.user.id)}`, maximum, 3600],
    ]);
    assert.equal(calls[0][0].includes(session.user.id), false);
    assert.equal(calls[0][0].includes("mail"), false);
  }
});
