import test from "node:test";
import assert from "node:assert/strict";
import {
  authDestination,
  confirmDestination,
  confirmForm,
} from "../lib/auth-return.mjs";
import { createHandler } from "../lib/handler.mjs";

const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-auth-return-secret-long-enough",
};
const token = "a".repeat(43);
function fixture() {
  const calls = [];
  const handle = createHandler({
    settings,
    db: { limit: async (...args) => calls.push({ limit: args }) },
    auth: {
      api: {
        signInMagicLink: async (input) => calls.push({ signIn: input }),
        getSession: async () => null,
      },
      handler: async (request) => {
        calls.push({ verification: request.url });
        return new Response(null, {
          status: 302,
          headers: { location: "/participant" },
        });
      },
    },
  });
  return { calls, handle };
}
test("sign-in destination is an exact allowlist, never an arbitrary return URL", () => {
  for (const value of [undefined, null, "workspace"])
    assert.deepEqual(authDestination(value), { name: "workspace", path: "/" });
  assert.deepEqual(authDestination("participant"), {
    name: "participant",
    path: "/participant",
  });
  for (const value of [
    "",
    "/participant",
    "https://evil.example.invalid",
    "//evil.example.invalid",
    "participant#receipt",
    [],
    {},
    true,
  ])
    assert.throws(
      () => authDestination(value),
      (e) => e.code === "destination",
    );
  assert.throws(
    () =>
      confirmDestination(
        new URLSearchParams("destination=participant&destination=workspace"),
      ),
    (e) => e.code === "destination",
  );
});
test("login request carries only server-chosen destination metadata and rejects receipt injection before sending", async () => {
  const f = fixture();
  const call = (input) =>
    f.handle(
      new Request(`${settings.origin}/api/auth/request-link`, {
        method: "POST",
        headers: {
          origin: settings.origin,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    );
  assert.equal(
    (
      await call({
        email: " Person@Example.invalid ",
        destination: "participant",
      })
    ).status,
    200,
  );
  assert.deepEqual(f.calls.find((c) => c.signIn).signIn.body, {
    email: "person@example.invalid",
    callbackURL: "/participant",
    metadata: { destination: "participant" },
  });
  for (const input of [
    { email: "p@example.invalid", destination: "//elsewhere" },
    { email: "p@example.invalid", receipt: token },
    {
      email: "p@example.invalid",
      destination: "participant",
      callbackURL: "/",
    },
  ])
    assert.equal((await call(input)).status, 400);
  assert.equal(f.calls.filter((c) => c.signIn).length, 1);
});
test("confirmation GET stays non-consuming and POST forwards only an allowlisted landing", async () => {
  const f = fixture();
  const get = await f.handle(
    new Request(
      `${settings.origin}/auth/confirm?token=${token}&destination=participant`,
    ),
  );
  assert.equal(get.status, 200);
  assert.match(await get.text(), /name="destination" value="participant"/);
  assert.equal(f.calls.length, 0);
  const post = (form, origin = settings.origin) =>
    f.handle(
      new Request(`${settings.origin}/auth/confirm`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      }),
    );
  assert.equal(
    (await post(new URLSearchParams({ token, destination: "participant" })))
      .status,
    302,
  );
  const target = new URL(f.calls.find((c) => c.verification).verification);
  assert.equal(target.searchParams.get("callbackURL"), "/participant");
  assert.deepEqual([...target.searchParams.keys()].sort(), [
    "callbackURL",
    "token",
  ]);
  for (const form of [
    `token=${token}&destination=//elsewhere`,
    `token=${token}&token=${token}`,
    `token=${token}&receipt=private`,
    `token=${token}&destination=participant&destination=workspace`,
  ])
    assert.equal((await post(form)).status, 400);
  assert.equal(
    (
      await post(
        new URLSearchParams({ token }),
        "https://other.example.invalid",
      )
    ).status,
    403,
  );
  assert.equal(f.calls.filter((c) => c.verification).length, 1);
});
test("confirmation form enforces a bounded urlencoded body", async () => {
  await assert.rejects(
    confirmForm(
      new Request(settings.origin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    ),
    (e) => e.code === "form",
  );
  await assert.rejects(
    confirmForm(
      new Request(settings.origin, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "token=" + "a".repeat(4097),
      }),
    ),
    (e) => e.status === 413,
  );
});
