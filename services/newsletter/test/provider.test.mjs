import test from "node:test";
import assert from "node:assert/strict";
import { provider } from "../lib/provider.mjs";
import { config } from "../lib/config.mjs";
const settings = config({
  NEWSLETTER_SEND_ENABLED: "true",
  RESEND_DOMAIN_ID: "domain",
  RESEND_SEGMENT_ID: "segment",
  RESEND_TOPIC_ID: "topic",
});
test("Confirmation transport is one-recipient, stable idempotency, no credentials in body", async () => {
  const calls = [];
  const mail = provider(settings, {
    credential: async () => "private-token",
    fetcher: async (url, options) => {
      calls.push({ url, ...options });
      return Response.json({ id: "sent" });
    },
  });
  await mail.sendConfirmation(
    {
      email: "a@example.invalid",
      generation: "g1",
      confirm: "a".repeat(43),
      unsubscribe: "b".repeat(43),
    },
    settings.origin,
    (x) => x,
  );
  const call = calls[0];
  const body = JSON.parse(call.body);
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.headers["Idempotency-Key"], "doi-g1");
  assert.deepEqual(body.to, ["a@example.invalid"]);
  assert.equal(
    body.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.ok(!call.body.includes("private-token"));
  assert.ok(!body.html.includes("unsubscribed=false"));
});
test("Campaign creates an unsent native scoped Broadcast, never a transactional letter", async () => {
  let call;
  const mail = provider(settings, {
    credential: async () => "token",
    fetcher: async (url, options) => {
      call = { url, ...options };
      return Response.json({ id: "draft" });
    },
  });
  await mail.createBroadcast({
    id: "edition-1",
    hash: "a".repeat(64),
    subject: "Letter",
    html: "{{{RESEND_UNSUBSCRIBE_URL}}}",
    text: "{{{RESEND_UNSUBSCRIBE_URL}}}",
  });
  assert.equal(call.url, "https://api.resend.com/broadcasts");
  const body = JSON.parse(call.body);
  assert.equal(body.send, false);
  assert.equal(body.topic_id, "topic");
  assert.equal(body.segment_id, "segment");
  assert.deepEqual(body.reply_to, ["hello@charitology.org"]);
  assert.equal(call.headers["Idempotency-Key"], undefined);
});
test("Readiness checks actual sender verification and explicit-opt-in topic semantics", async () => {
  const mail = provider(settings, {
    credential: async () => "token",
    fetcher: async (url) =>
      Response.json(
        url.includes("/domains/")
          ? { name: "charitology.org", status: "pending" }
          : {},
      ),
  });
  await assert.rejects(mail.ready(), /not verified/);
});
test("Readiness requires actual false tracking settings, including absent/unknown fields", async () => {
  for (const tracking of [
    {},
    { open_tracking: true, click_tracking: false },
    { open_tracking: false, click_tracking: true },
  ]) {
    const mail = provider(settings, {
      credential: async () => "token",
      fetcher: async () =>
        Response.json({
          name: "charitology.org",
          status: "verified",
          ...tracking,
        }),
    });
    await assert.rejects(mail.ready(), /tracking disabled/);
  }
  const mail = provider(settings, {
    credential: async () => "token",
    fetcher: async () =>
      Response.json({
        name: "charitology.org",
        status: "verified",
        open_tracking: false,
        click_tracking: false,
      }),
  });
  await mail.ready();
});
test("Non-idempotent mutation timeout is reported ambiguous, never retried automatically", async () => {
  let attempts = 0;
  const mail = provider(settings, {
    credential: async () => "token",
    fetcher: async () => {
      attempts++;
      throw new Error("network timeout");
    },
  });
  await assert.rejects(
    mail.createBroadcast({ id: "x", hash: "a".repeat(64) }),
    (error) => error.ambiguous === true,
  );
  assert.equal(attempts, 1);
});
test("New-contact isolation fails closed for unrelated opt-in or unknown topic defaults", async () => {
  for (const topic of [
    { id: "other", default_subscription: "opt_in" },
    { id: "other" },
  ]) {
    const mail = provider(settings, {
      credential: async () => "token",
      fetcher: async () => Response.json({ data: [topic], has_more: false }),
    });
    await assert.rejects(mail.assertNewContactIsolation(), /Unrelated/);
  }
  const mail = provider(settings, {
    credential: async () => "token",
    fetcher: async () =>
      Response.json({
        data: [
          { id: "topic", default_subscription: "opt_out" },
          { id: "other", default_subscription: "opt_out" },
        ],
        has_more: false,
      }),
  });
  await mail.assertNewContactIsolation();
});
test("New contact path uses native multipart skip import and never unsafe global contact upsert", async () => {
  let call;
  const mail = provider(settings, {
    credential: async () => "token",
    fetcher: async (url, options) => {
      call = { url, ...options };
      return Response.json({ id: "import-job" });
    },
  });
  await mail.startContactImport("a@example.invalid");
  assert.equal(call.url, "https://api.resend.com/contacts/imports");
  assert.equal(
    call.headers["content-type"],
    undefined,
    "fetch must generate its multipart boundary",
  );
  assert.equal(call.body.get("on_conflict"), "skip");
  assert.deepEqual(JSON.parse(call.body.get("column_map")), { email: "Email" });
  assert.equal(
    await call.body.get("file").text(),
    "Email\na@example.invalid\n",
  );
  assert.equal(call.body.has("topics"), false);
  assert.equal(call.body.has("segments"), false);
  assert.equal(call.body.has("unsubscribed"), false);
});
test("Topic update wire body is a top-level array scoped to one configured topic for either preference", async () => {
  const calls = [];
  const mail = provider(settings, {
    credential: async () => "private-token",
    fetcher: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.ok(
        Array.isArray(body),
        "HTTP PATCH requires the array itself, not the SDK topics wrapper",
      );
      calls.push({ url, ...options, parsedBody: body });
      return Response.json({ object: "contact_topics", data: body });
    },
  });
  for (const subscription of ["opt_in", "opt_out"]) {
    await mail.setTopic("contact/with space", subscription);
    const call = calls.at(-1);
    assert.equal(
      call.url,
      "https://api.resend.com/contacts/contact%2Fwith%20space/topics",
    );
    assert.equal(call.method, "PATCH");
    assert.equal(call.headers["content-type"], "application/json");
    assert.deepEqual(call.parsedBody, [{ id: settings.topicId, subscription }]);
    assert.equal(call.headers["Idempotency-Key"], undefined);
    assert.ok(!call.body.includes("private-token"));
    assert.equal(call.body.includes("unsubscribed"), false);
  }
  assert.equal(
    calls.length,
    2,
    "one mutation per explicit call; no implicit retry",
  );
});
test("Provider maintenance deadline bounds credential retrieval and prevents calls after expiry", async () => {
  let fetched = 0;
  const mail = provider(settings, {
    credential: async () => new Promise(() => {}),
    fetcher: async () => {
      fetched++;
      return Response.json({});
    },
  });
  await assert.rejects(
    mail.withDeadline(Date.now() + 15).ready(),
    /time budget/,
  );
  assert.equal(fetched, 0);
  await assert.rejects(
    mail.withDeadline(Date.now() - 1).ready(),
    /time budget/,
  );
  assert.equal(fetched, 0);
});
test("Shared deadline bounds fetchers ignoring abort and stalled native response streams", async () => {
  let attempted = 0;
  const p = provider(settings, {
      credential: async () => "private",
      fetcher: async () => {
        attempted++;
        return new Promise(() => {});
      },
    }),
    at = Date.now();
  await assert.rejects(
    p
      .withDeadline(Date.now() + 25)
      .createBroadcast({ id: "fixture", hash: "a".repeat(64) }),
    (e) => e.ambiguous === true,
  );
  assert.equal(attempted, 1);
  assert.ok(Date.now() - at < 500);
  let canceled = false;
  const b = provider(settings, {
    credential: async () => "private",
    fetcher: async () =>
      new Response(
        new ReadableStream({
          pull: () => new Promise(() => {}),
          cancel: () => {
            canceled = true;
          },
        }),
      ),
  });
  await assert.rejects(
    b.withDeadline(Date.now() + 25).getBroadcast("fixture-native"),
    (e) => e.status === 502,
  );
  assert.equal(canceled, true);
});
test("Native bodies have strict UTF8/JSON and success/error/segment byte limits without content-length trust", async () => {
  for (const [status, bytes] of [
    [200, 2097153],
    [500, 16385],
  ]) {
    const p = provider(settings, {
      credential: async () => "private",
      fetcher: async () => new Response("x".repeat(bytes), { status }),
    });
    await assert.rejects(
      p.createBroadcast({ id: "fixture", hash: "a".repeat(64) }),
      (e) =>
        e.ambiguous === true && e.message === "Mail provider operation failed",
    );
  }
  for (const body of ['{"id":"one","id":"two"}', new Uint8Array([0xff])]) {
    const p = provider(settings, {
      credential: async () => "private",
      fetcher: async () => new Response(body),
    });
    await assert.rejects(p.getBroadcast("one"), (e) => e.status === 502);
  }
  const page = provider(settings, {
    credential: async () => "private",
    fetcher: async () => new Response("x".repeat(524289)),
  });
  await assert.rejects(page.segmentContacts(), (e) => e.status === 502);
});
test("Native pages require unique bounded IDs and exact has_more, with a thirty-page maximum", async () => {
  for (const payload of [
    { data: [{ id: "one" }] },
    { data: [], has_more: true },
    { data: [{ id: "same" }, { id: "same" }], has_more: false },
    {
      data: Array.from({ length: 101 }, (_, i) => ({ id: "id-" + i })),
      has_more: false,
    },
  ]) {
    const p = provider(settings, {
      credential: async () => "private",
      fetcher: async () => Response.json(payload),
    });
    await assert.rejects(p.segmentContacts());
  }
  let pages = 0;
  const p = provider(settings, {
    credential: async () => "private",
    fetcher: async () =>
      Response.json({ data: [{ id: "page-" + ++pages }], has_more: true }),
  });
  await assert.rejects(p.segmentContacts(), /safety limit/);
  assert.equal(pages, 30);
  let page = 0;
  const q = provider(settings, {
    credential: async () => "private",
    fetcher: async () =>
      Response.json({ data: [{ id: "repeat" }], has_more: ++page < 2 }),
  });
  await assert.rejects(q.segmentContacts());
  assert.equal(page, 2);
});
