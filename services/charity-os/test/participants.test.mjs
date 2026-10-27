import test from "node:test";
import assert from "node:assert/strict";
import {
  participantEmail,
  verifiedParticipant,
  participantQuery,
  participantEditReason,
  participantRequest,
  participantRoutes,
} from "../lib/participants.mjs";
import { csrf } from "../lib/security.mjs";

const settings = {
  origin: "https://os.example.invalid",
  secret: "synthetic-participant-secret-at-least-32-characters",
};
const session = {
  user: {
    id: "participant-one",
    email: "person+own@example.invalid",
    emailVerified: true,
  },
  session: { id: "synthetic-participant-session" },
};
const user = verifiedParticipant(session),
  stamp = new Date("2030-01-01T00:00:00Z");
const publication = {
  kind: "contact",
  schema: {
    title: "Operational request",
    purpose: "Review an operational request.",
    retentionUntil: "2099-01-01",
    questions: [
      { key: "email", type: "text", label: "Email", required: true },
      { key: "count", type: "number", label: "Count" },
      { key: "choice", type: "boolean", label: "Choice" },
    ],
  },
};
const row = () => ({
  id: "intake-one",
  publication_id: "publication",
  status: "pending",
  revision: 1,
  answers: { email: session.user.email, count: 0, choice: false },
  consent_at: stamp,
  created_at: stamp,
  erased_at: null,
});
const error = (code) => (e) => e.code === code;
const request = (path, input, headers = {}) =>
  new Request(
    settings.origin + path,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            origin: settings.origin,
            "content-type": "application/json",
            "x-csrf-token": csrf(session.session.id, settings.secret),
            ...headers,
          },
          body: JSON.stringify(input),
        },
  );

test("participant identity requires a trusted verified session and preserves email alias distinctions", () => {
  assert.equal(
    participantEmail(" Person+Own@Example.Invalid "),
    "person+own@example.invalid",
  );
  assert.notEqual(participantEmail("person@example.invalid"), user.email);
  assert.notEqual(participantEmail("per.son+own@example.invalid"), user.email);
  for (const flag of [false, "true", 1, undefined])
    assert.throws(
      () =>
        verifiedParticipant({
          ...session,
          user: { ...session.user, emailVerified: flag },
        }),
      error("participant_verification"),
    );
  assert.throws(() => verifiedParticipant(null), error("session"));
});

test("participant queries accept exactly the canonical hosting capture and one documented cursor", () => {
  const path = "/api/participant/requests",
    capture = path.slice(5);
  assert.equal(
    participantQuery(
      new URL(
        `${settings.origin}${path}?path=${encodeURIComponent(capture)}&cursor=abc`,
      ),
      ["cursor"],
    ).get("cursor"),
    "abc",
  );
  for (const query of [
    "path=wrong",
    `path=${capture}&path=${capture}`,
    `path=${capture}&receipt=secret`,
    `path=${capture}&token=secret`,
    "cursor=a&cursor=b",
    "email=person@example.invalid",
  ])
    assert.throws(
      () =>
        participantQuery(new URL(`${settings.origin}${path}?${query}`), [
          "cursor",
        ]),
      error("participant_query"),
    );
});

test("own-request serializer contains only approved public questions and the linked person's answers", () => {
  const input = {
    ...row(),
    reviewed_by: "private-reviewer",
    receipt_hash: "private-receipt",
    ip_hash: "private-ip",
    converted_ids: [{ id: "private-contact" }],
    staff_notes: "private-notes",
    answers: { ...row().answers, internalNote: "private-answer-column" },
  };
  const result = participantRequest(input, publication, {
    org: "org",
    organizationName: "Org",
    linkedAt: stamp,
    accepting: true,
    user,
  });
  assert.deepEqual(result.answers, {
    email: user.email,
    count: 0,
    choice: false,
  });
  assert.equal(result.editable, true);
  assert.equal(result.linkedAt, stamp.toISOString());
  for (const forbidden of [
    "private-reviewer",
    "private-receipt",
    "private-ip",
    "private-contact",
    "private-notes",
    "private-answer-column",
    "convertedIds",
    "reviewedAt",
    "ownerId",
  ])
    assert.equal(JSON.stringify(result).includes(forbidden), false);
});

test("erased and closed requests remain serializable without recreating answers or permission", () => {
  const erased = participantRequest(
    { ...row(), erased_at: stamp, answers: {} },
    publication,
    {
      org: "org",
      organizationName: "Org",
      linkedAt: stamp,
      accepting: false,
      user,
    },
  );
  assert.deepEqual(erased.answers, {});
  assert.equal(erased.editable, false);
  assert.equal(erased.erasedAt, stamp.toISOString());
  const closed = participantRequest(row(), publication, {
    org: "org",
    organizationName: "Org",
    linkedAt: stamp,
    accepting: false,
    user,
  });
  assert.equal(closed.answers.email, user.email);
  assert.equal(closed.editable, false);
});

test("correction requires pending state, current collection and the original currently verified email", () => {
  assert.equal(participantEditReason(row(), publication, true, user), null);
  for (const state of ["reviewed", "converted", "cancelled", "dismissed"])
    assert.ok(
      participantEditReason(
        { ...row(), status: state },
        publication,
        true,
        user,
      ),
    );
  assert.ok(participantEditReason(row(), publication, false, user));
  assert.ok(
    participantEditReason(row(), publication, true, {
      ...user,
      email: "changed@example.invalid",
    }),
  );
  assert.ok(
    participantEditReason(
      { ...row(), erased_at: stamp, answers: {} },
      publication,
      true,
      user,
    ),
  );
});

test("authenticated participant mutations retain exact origin, CSRF and body-only receipts before storage", async () => {
  const db = {
    tx: async () => {
      throw new Error("Storage must remain untouched.");
    },
  };
  const path = "/api/participant/intake/org/publication/link";
  for (const headers of [
    { origin: "https://other.example.invalid" },
    { origin: "null" },
    { "x-csrf-token": "wrong" },
  ])
    await assert.rejects(
      participantRoutes({
        request: request(
          path,
          { receipt: "x".repeat(43), consent: true },
          headers,
        ),
        db,
        settings,
        session,
      }),
      error(headers["x-csrf-token"] ? "csrf" : "origin"),
    );
  await assert.rejects(
    participantRoutes({
      request: request(path + "?receipt=secret", { consent: true }),
      db,
      settings,
      session,
    }),
    error("participant_query"),
  );
});

test("claim requires deliberate consent and a receipt, never an email-only lookup", async () => {
  const db = {
      tx: async () => {
        throw new Error("Storage must remain untouched.");
      },
    },
    path = "/api/participant/intake/org/publication/link";
  for (const [input, code] of [
    [{ receipt: "x".repeat(43), consent: false }, "participant_consent"],
    [{ email: user.email, consent: true }, "participant_fields"],
    [{ consent: true }, "participant_request"],
    [{ receipt: "short", consent: true }, "participant_request"],
  ])
    await assert.rejects(
      participantRoutes({
        request: request(path, input),
        db,
        settings,
        session,
      }),
      error(code),
    );
});

test("account-wide empty listing reads only the own index without setting organization context", async () => {
  const db = {
    tx: async (id, org, fn) => {
      assert.equal(id, user.id);
      assert.equal(org, null);
      return fn({
        query: async (sql) => {
          assert.ok(sql.includes("os_participant_links"));
          assert.equal(sql.includes("JOIN"), false);
          assert.equal(sql.includes("os_intake"), false);
          return { rows: [] };
        },
      });
    },
  };
  const response = await participantRoutes({
    request: request("/api/participant/requests"),
    db,
    settings,
    session,
  });
  assert.deepEqual(await response.json(), {
    ok: true,
    requests: [],
    nextCursor: null,
  });
});

test("a foreign own-list cursor stops before any private tenant read", async () => {
  const db = {
    tx: async (_id, org, fn) => {
      assert.equal(org, null);
      return fn({ query: async () => ({ rows: [] }) });
    },
  };
  await assert.rejects(
    participantRoutes({
      request: request("/api/participant/requests?cursor=" + "a".repeat(32)),
      db,
      settings,
      session,
    }),
    error("participant_cursor"),
  );
});

test("participant intake body is bounded independently of the wider staff API", async () => {
  const db = {
    tx: async () => {
      throw new Error("Storage must remain untouched.");
    },
  };
  await assert.rejects(
    participantRoutes({
      request: request("/api/participant/intake/org/publication/link", {
        receipt: "x".repeat(17000),
        consent: true,
      }),
      db,
      settings,
      session,
    }),
    error("size"),
  );
});
