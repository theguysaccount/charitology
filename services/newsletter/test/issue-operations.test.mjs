import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../lib/handler.mjs";
import {
  previewIssueReview,
  acknowledgeIssueReview,
  operateIssue,
} from "../lib/issue-operations.mjs";
import {
  settings,
  dependencies,
  syntheticRegistry,
  activeConsent,
} from "../test-fixtures/issues.mjs";
import { issueHash } from "../lib/issue-json.mjs";
function readOnlyDb({ rows = [], pending = 0, people = [activeConsent] } = {}) {
  const sql = [];
  const c = {
    query: async (text, args) => {
      sql.push(text);
      if (text.startsWith("SELECT * FROM newsletter_campaigns"))
        return { rows: rows.filter((x) => x.edition === args[0]) };
      if (text.startsWith("SELECT edition,")) return { rows };
      if (text.startsWith("SELECT count(*)"))
        return { rows: [{ count: pending }] };
      if (text.startsWith("SELECT email,")) return { rows: people };
      throw Error("Unexpected test SQL " + text);
    },
  };
  return {
    sql,
    exclusive: (fn) => fn(c),
    tx: (fn) => fn(c),
    rate: async () => true,
  };
}
const issue = () => syntheticRegistry(2).issues[1];
test("Preview contains hashes/count only, stable facts despite recomputation clock and no send capability", async () => {
  const d = dependencies(readOnlyDb(), syntheticRegistry(2));
  const a = await previewIssueReview(d.deps, issue().id, {
    phase: "prepare",
    contentHash: issue().hash,
  });
  const b = await previewIssueReview(
    { ...d.deps, now: () => new Date(Date.now() + 1000).toISOString() },
    issue().id,
    { phase: "prepare", contentHash: issue().hash },
  );
  assert.equal(a.previewHash, b.previewHash);
  assert.equal(a.facts.intendedRecipientCount, 1);
  assert.equal(a.facts.nativeDraftHash, null);
  assert.equal(a.previewHash, issueHash(a.facts));
  assert.ok(a.previewToken.length <= 2048);
  const encoded = Buffer.from(
    a.previewToken.split(".")[0],
    "base64url",
  ).toString();
  assert.ok(!encoded.includes("example.invalid"));
  assert.ok(!encoded.includes("fictional-contact"));
  assert.ok(!JSON.stringify(a).includes(d.deps.settings.adminToken));
  assert.equal(d.calls.filter((x) => ["send", "create"].includes(x)).length, 0);
});
test("A preview token is bearer/config/facts-bound and tampering fails before SQL/provider access", async () => {
  const d = dependencies(readOnlyDb(), syntheticRegistry(2)),
    x = issue();
  let gets = 0;
  const preview = await previewIssueReview(d.deps, x.id, {
    phase: "prepare",
    contentHash: x.hash,
  });
  const db = {
    exclusive: () => {
      gets++;
      throw Error("must not access");
    },
  };
  for (const token of [
    preview.previewToken + "x",
    preview.previewToken.slice(0, -2) + "AA",
    "a".repeat(2049),
  ])
    await assert.rejects(
      acknowledgeIssueReview({ ...d.deps, db }, x.id, {
        phase: "prepare",
        contentHash: x.hash,
        previewHash: preview.previewHash,
        previewToken: token,
        acknowledgement:
          "I CHECKED THIS EXACT ISSUE AND INTENDED NEWSLETTER AUDIENCE",
      }),
      (e) => e.issueCode === "review_required",
    );
  assert.equal(gets, 0);
});
test("Pending preferences, outsider, duplicate, invalid or globally-unsubscribed native members stop preview", async () => {
  const reg = syntheticRegistry(2),
    x = reg.issues[1];
  const d = dependencies(readOnlyDb({ pending: 1 }), reg);
  await assert.rejects(
    previewIssueReview(d.deps, x.id, { phase: "prepare", contentHash: x.hash }),
    (e) => e.issueCode === "preference_sync_pending",
  );
  for (const members of [
    [{ id: "x", email: "outsider@example.invalid", unsubscribed: false }],
    [{ id: "x", email: activeConsent.email, unsubscribed: true }],
    [{ id: "x", email: activeConsent.email }],
    [
      { id: "x", email: activeConsent.email, unsubscribed: false },
      { id: "x", email: activeConsent.email, unsubscribed: false },
    ],
  ]) {
    const f = dependencies(readOnlyDb(), reg);
    f.mail.segmentContacts = async () => members;
    await assert.rejects(
      previewIssueReview(f.deps, x.id, {
        phase: "prepare",
        contentHash: x.hash,
      }),
      (e) => e.issueCode === "audience_mismatch",
    );
  }
});
test("Retained accepted and ambiguous local history bypass sending gates without creating new authority", async () => {
  for (const state of [
    "accepted",
    "creating",
    "create_unknown",
    "sending",
    "send_unknown",
  ]) {
    const x = issue(),
      db = readOnlyDb({
        rows: [
          {
            edition: x.id,
            content_hash: x.hash,
            state,
            broadcast_id: state === "create_unknown" ? null : "native-private",
            operation_id: "private-op",
          },
        ],
      }),
      d = dependencies(db, syntheticRegistry(2));
    d.deps.settings.enabled = false;
    d.mail.ready = () => {
      throw Error("must not read provider");
    };
    const r = await operateIssue(d.deps, x.id, {
      action: "prepare",
      input: { contentHash: x.hash },
    });
    assert.equal(r.ok, true);
    assert.equal(r.result, "retained");
    assert.equal(r.campaign.state, state);
    assert.ok(!JSON.stringify(r).includes("native-private"));
    assert.ok(!JSON.stringify(r).includes("private-op"));
    assert.deepEqual(d.calls, []);
  }
});
test("Missing fresh proof and unsupported legacy history cannot create, send or use an arbitrary alias", async () => {
  const reg = syntheticRegistry(2),
    d = dependencies(readOnlyDb(), reg),
    x = reg.issues[1];
  const r = await operateIssue(d.deps, x.id, {
    action: "prepare",
    input: { contentHash: x.hash },
  });
  assert.equal(r.error.code, "review_required");
  assert.deepEqual(d.calls, []);
  const result = await operateIssue(d.deps, "not-registered", {
    action: "prepare",
    input: { contentHash: x.hash },
  });
  assert.equal(result.error.code, "issue_unknown");
  const bad = dependencies(
    readOnlyDb({
      rows: [
        {
          edition: "not-registered",
          content_hash: x.hash,
          state: "accepted",
          broadcast_id: "saved-native",
        },
      ],
    }),
    reg,
  );
  await assert.rejects(
    previewIssueReview(bad.deps, x.id, {
      phase: "prepare",
      contentHash: x.hash,
    }),
    (e) => e.issueCode === "legacy_preflight_failed",
  );
  assert.deepEqual(bad.calls, []);
});
test("Native send review rejects scheduled/non-draft/missing-field drafts without relabeling saved state", async () => {
  const reg = syntheticRegistry(2),
    x = reg.issues[1],
    row = {
      edition: x.id,
      content_hash: x.hash,
      state: "draft",
      broadcast_id: "native-private",
    };
  for (const extra of [
    { status: "sent" },
    { scheduled_at: "2026-12-01T00:00:00Z" },
    {},
  ]) {
    const d = dependencies(readOnlyDb({ rows: [row] }), reg);
    d.mail.getBroadcast = async () => ({
      id: row.broadcast_id,
      status: "draft",
      ...extra,
    });
    await assert.rejects(
      previewIssueReview(d.deps, x.id, { phase: "send", contentHash: x.hash }),
      (e) => e.issueCode === "native_draft_mismatch",
    );
    assert.equal(d.calls.includes("send"), false);
  }
});
test("Issue HTTP authentication, Origin and exact rewrite/query/body guards precede provider mutation", async () => {
  const registry = syntheticRegistry(2),
    configuration = settings();
  let rates = 0;
  const d = readOnlyDb();
  d.rate = async () => {
    rates++;
    return true;
  };
  const h = createHandler({
    db: d,
    mail: {},
    settings: configuration,
    issueRegistry: registry,
    logger: () => {},
  });
  const base =
    "https://mail.charitology.org/api/admin/issues/edition-1/preview";
  assert.equal((await h(new Request(base))).status, 401);
  assert.equal(
    (
      await h(
        new Request(base, {
          headers: {
            authorization: "Bearer " + configuration.adminToken,
            origin: "null",
          },
        }),
      )
    ).status,
    403,
  );
  const auth = { authorization: "Bearer " + configuration.adminToken };
  for (const suffix of [
    "?token=private",
    "?path=wrong",
    "?path=admin/issues/edition-1/preview&path=admin/issues/edition-1/preview",
    "?path=admin/issues/edition-1/preview&token=x",
  ])
    assert.equal(
      (await h(new Request(base + suffix, { headers: auth }))).status,
      400,
    );
  assert.equal(rates, 0);
  assert.equal(
    (
      await h(
        new Request(base + "?path=admin/issues/edition-1/preview", {
          headers: auth,
        }),
      )
    ).status,
    200,
  );
  for (const body of [
    '{"phase":"prepare","phase":"send"}',
    '{"x":"' + "a".repeat(16385) + '"}',
    '{"phase":"prepare"}',
  ]) {
    const r = await h(
      new Request(base.replace("preview", "review-preview"), {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body,
      }),
    );
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, "invalid_request");
  }
});
test("Legacy alias delegates to same reviewed gateway, including a fresh install", async () => {
  const configuration = settings(),
    d = readOnlyDb(),
    registry = syntheticRegistry(2);
  const h = createHandler({
    db: d,
    mail: {
      createBroadcast: () => {
        throw Error("must not call");
      },
    },
    settings: configuration,
    issueRegistry: registry,
    logger: () => {},
  });
  const r = await h(
    new Request(configuration.origin + "/api/admin/campaign/prepare", {
      method: "POST",
      headers: {
        authorization: "Bearer " + configuration.adminToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ contentHash: registry.issues[0].hash }),
    }),
  );
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error.code, "review_required");
});
test("Issue HTTP limits separate read, command and reconcile budgets and omit bearer/address fields", async () => {
  const configuration = settings(),
    registry = syntheticRegistry(2),
    keys = [];
  const db = readOnlyDb();
  db.rate = async (v) => {
    keys.push(v);
    return false;
  };
  const h = createHandler({
      db,
      mail: {},
      settings: configuration,
      issueRegistry: registry,
      logger: () => {},
    }),
    headers = {
      authorization: "Bearer " + configuration.adminToken,
      "content-type": "application/json",
    };
  for (const [action, method] of [
    ["preview", "GET"],
    ["prepare", "POST"],
    ["reconcile", "POST"],
  ]) {
    const r = await h(
      new Request(
        configuration.origin + "/api/admin/issues/edition-1/" + action,
        { method, headers, ...(method === "POST" ? { body: "{}" } : {}) },
      ),
    );
    assert.equal(r.status, 429);
    assert.equal((await r.json()).error.code, "limit_reached");
  }
  assert.deepEqual(
    keys.map((v) => v.map((x) => x.limit)),
    [
      [120, 120],
      [20, 20],
      [20, 20],
    ],
  );
  assert.ok(keys[0][0].key.includes(":read:"));
  assert.ok(keys[1][0].key.includes(":command:"));
  assert.ok(keys[2][0].key.includes(":reconcile:"));
  assert.ok(!JSON.stringify(keys).includes(configuration.adminToken));
});
test("Issue response/logging contract discards arbitrary provider errors and uses exact closed auth failures", async () => {
  const configuration = settings(),
    registry = syntheticRegistry(2),
    db = readOnlyDb(),
    logs = [];
  const h = createHandler({
      db,
      mail: {
        ready: async () => {
          throw Error("PRIVATE ERROR recipient@example.invalid");
        },
      },
      settings: configuration,
      issueRegistry: registry,
      logger: (...args) => logs.push(args),
    }),
    url = configuration.origin + "/api/admin/issues/fixture-002/review-preview";
  const unauthorized = await h(new Request(url));
  assert.deepEqual(await unauthorized.json(), {
    ok: false,
    error: { code: "unauthorized", message: "Authentication required." },
    campaign: null,
  });
  const denied = await h(
    new Request(url, {
      headers: {
        authorization: "Bearer " + configuration.adminToken,
        origin: "null",
      },
    }),
  );
  assert.equal((await denied.json()).error.code, "forbidden_origin");
  const result = await h(
    new Request(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + configuration.adminToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phase: "prepare",
        contentHash: registry.issues[1].hash,
      }),
    }),
  );
  assert.equal(result.status, 503);
  const body = await result.json();
  assert.equal(body.error.code, "provider_unavailable");
  assert.ok(!JSON.stringify(body).includes("PRIVATE"));
  assert.deepEqual(logs, [[]]);
});
