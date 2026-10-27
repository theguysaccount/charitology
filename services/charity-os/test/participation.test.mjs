import test from "node:test";
import assert from "node:assert/strict";
import {
  participationTerms,
  participationIntent,
  participationReplay,
  participationQuota,
  PARTICIPATION_LIMITS,
  ownObject,
  participantParticipationRoutes,
  participationRoutes,
} from "../lib/participation.mjs";
import {
  guardParticipationWrite,
  intervalsOverlap,
} from "../lib/participation-guards.mjs";
import { restoredParticipation } from "../lib/participation-backup.mjs";
import { hash } from "../lib/security.mjs";
const source = (moduleId = "events") => ({
  id: "target",
  orgId: "org",
  moduleId,
  status: moduleId === "events" ? "scheduled" : "open",
  revision: 4,
  lastEditedBy: "author",
  approval: { status: "approved", revision: 4, actorId: "reviewer" },
  data: {
    title: "Fictional full occurrence",
    kind: moduleId === "events" ? "session" : "shift",
    startAt: "2099-01-02T09:00:00+00:00",
    endAt: "2099-01-02T11:00:00+00:00",
    timeZone: "UTC",
    capacity: 1,
    participationPurpose: "Arrange this fictional operational activity.",
    participantInstructions: "Bring an ordinary notebook.",
    organizerEmail: "organizer@example.invalid",
    organizerUrl: null,
    joiningUrl: "https://private.example.invalid/never-copy",
  },
});
const code = (c) => (e) => e.code === c;
test("participation terms deliberately allowlist approved publication fields and validate typed instants", () => {
  const s = source(),
    terms = participationTerms(s);
  assert.equal(terms.joiningUrl, undefined);
  assert.equal(terms.capacity, undefined);
  assert.equal(terms.organizerEmail, "organizer@example.invalid");
  assert.throws(
    () =>
      participationTerms({ ...s, data: { ...s.data, organizerEmail: null } }),
    code("participation_terms"),
  );
  assert.throws(() =>
    participationTerms({
      ...s,
      data: { ...s.data, startAt: "2099-02-30T09:00:00Z" },
    }),
  );
  assert.throws(() =>
    participationTerms({
      ...s,
      data: {
        ...s.data,
        organizerUrl: "https://person:secret@example.invalid",
      },
    }),
  );
});
test("latest-command replay binds actor action key and exact canonical payload", () => {
  const input = {
      revision: 4,
      idempotencyKey: "random-intent-123456",
      consent: true,
    },
    intent = participationIntent(input, "actor", "confirm");
  assert.equal(
    participationReplay(
      intent,
      participationIntent({ ...input }, "actor", "confirm"),
    ),
    true,
  );
  assert.equal(
    participationReplay(
      intent,
      participationIntent(input, "another", "confirm"),
    ),
    false,
  );
  assert.equal(
    participationReplay(intent, participationIntent(input, "actor", "cancel")),
    false,
  );
  assert.throws(
    () =>
      participationReplay(
        intent,
        participationIntent({ ...input, revision: 5 }, "actor", "confirm"),
      ),
    code("participation_intent"),
  );
  assert.throws(() =>
    participationIntent(
      { ...input, idempotencyKey: "short" },
      "actor",
      "confirm",
    ),
  );
  assert.ok(!JSON.stringify(intent).includes(input.idempotencyKey));
});
test("half-open overlap accepts adjacency and detects overnight commitments", () => {
  const a = { startAt: "2099-01-02T23:00:00Z", endAt: "2099-01-03T02:00:00Z" };
  assert.equal(
    intervalsOverlap(a, { startAt: a.endAt, endAt: "2099-01-03T04:00:00Z" }),
    false,
  );
  assert.equal(
    intervalsOverlap(a, {
      startAt: "2099-01-03T01:59:00Z",
      endAt: "2099-01-03T03:00:00Z",
    }),
    true,
  );
  assert.equal(intervalsOverlap(a, { startAt: null, endAt: null }), false);
});
function guardDb({
  old,
  targets = [],
  history = [],
  commitments = [],
  shift = null,
  assignments = [],
} = {}) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_advisory")) return { rows: [] };
      if (sql.startsWith("SELECT data,status"))
        return { rows: old ? [old] : [] };
      if (sql.startsWith("SELECT * FROM os_participation_targets"))
        return { rows: targets };
      if (sql.startsWith("SELECT * FROM os_participations"))
        return { rows: history };
      if (sql.includes("count(*)"))
        return {
          rows: [
            { count: history.filter((p) => p.state === "confirmed").length },
          ],
        };
      if (sql.includes("SELECT booking_record_id"))
        return { rows: commitments };
      if (sql.startsWith("SELECT data FROM os_records"))
        return { rows: shift ? [{ data: shift }] : [] };
      if (sql.startsWith("SELECT id,data FROM os_records"))
        return { rows: assignments };
      throw Error("Unhandled guard query");
    },
  };
}
test("central guard costs no query outside event/volunteer modules", async () => {
  const c = guardDb();
  await guardParticipationWrite(c, { moduleId: "contacts" });
  assert.equal(c.calls.length, 0);
});
test("managed generic activation cannot allocate while content review retains a ledger seat", async () => {
  const r = {
      ...source(),
      id: "candidate",
      status: "scheduled",
      data: {
        kind: "registration",
        eventId: "target",
        contactId: "contact",
        title: "Candidate",
      },
    },
    c = guardDb({
      old: { data: r.data, status: "approved" },
      targets: [{ target_id: "target" }],
      history: [
        {
          booking_record_id: "candidate",
          target_id: "target",
          state: "confirmed",
        },
      ],
    });
  await assert.rejects(
    guardParticipationWrite(c, r),
    code("participation_gateway"),
  );
  await guardParticipationWrite(c, {
    ...r,
    status: "review",
    data: { ...r.data, title: "Edited wording" },
  });
  await assert.rejects(
    guardParticipationWrite(c, {
      ...r,
      status: "review",
      data: { ...r.data, contactId: "different" },
    }),
    code("participation_guard"),
  );
  await assert.rejects(
    guardParticipationWrite(c, r, { operation: "delete" }),
    code("participation_guard"),
  );
});
test("cancelled booking identity stays terminal and requires a new typed candidate", async () => {
  const r = {
      ...source(),
      id: "candidate",
      status: "review",
      data: { kind: "registration", eventId: "target", contactId: "contact" },
    },
    c = guardDb({
      old: { data: r.data, status: "cancelled" },
      history: [
        { booking_record_id: r.id, target_id: "target", state: "cancelled" },
      ],
    });
  await guardParticipationWrite(c, r);
  await assert.rejects(
    guardParticipationWrite(c, {
      ...r,
      data: { ...r.data, eventId: "another" },
    }),
    code("participation_guard"),
  );
  await assert.rejects(
    guardParticipationWrite(c, { ...r, status: "scheduled" }),
    code("participation_guard"),
  );
});
test("managed parent edits/cancellation and capacity reductions cannot silently invalidate occupancy", async () => {
  const s = source(),
    c = guardDb({
      old: { data: s.data, status: s.status },
      targets: [{ target_id: s.id }],
      history: [
        { target_id: s.id, booking_record_id: "book", state: "confirmed" },
      ],
    });
  await guardParticipationWrite(c, {
    ...s,
    status: "review",
    data: { ...s.data, title: "Content review" },
  });
  await assert.rejects(
    guardParticipationWrite(c, { ...s, data: { ...s.data, capacity: 0 } }),
    code("participation_capacity"),
  );
  await assert.rejects(
    guardParticipationWrite(c, { ...s, status: "cancelled" }),
    code("participation_guard"),
  );
  await assert.rejects(
    guardParticipationWrite(c, {
      ...s,
      data: { ...s.data, endAt: "2099-01-02T12:00:00+00:00" },
    }),
    code("participation_guard"),
  );
});
test("unmanaged volunteer allocation also respects frozen managed commitments", async () => {
  const s = source("volunteers"),
    r = {
      ...s,
      id: "assignment",
      status: "assigned",
      data: {
        kind: "assignment",
        shiftId: "unmanaged-shift",
        contactId: "contact",
      },
    },
    c = guardDb({
      old: { data: r.data, status: "approved" },
      shift: s.data,
      commitments: [
        {
          booking_record_id: "other",
          contact_id: "contact",
          target_id: "managed-shift",
          frozen: { terms: participationTerms(s) },
        },
      ],
    });
  await assert.rejects(
    guardParticipationWrite(c, r),
    code("participation_overlap"),
  );
});
test("own serialization hides working edits, roster and staff provenance", () => {
  const s = source(),
    terms = participationTerms(s),
    t = {
      revision: 1,
      mode: "managed",
      source_revision: 4,
      terms,
      terms_hash: hash(terms),
    },
    p = {
      id: "participation",
      state: "confirmed",
      revision: 3,
      contact_id: "private",
      booking_record_id: "private",
      created_by: "staff",
      frozen: { terms, candidateApproval: { actorId: "private" } },
    };
  const edited = {
      ...s,
      status: "review",
      approval: null,
      data: { ...s.data, participantInstructions: "Unpublished internal edit" },
    },
    own = ownObject(p, t, edited, { status: "cancelled", cancelled_at: null });
  assert.equal(
    own.terms.participantInstructions,
    terms.participantInstructions,
  );
  assert.equal(own.canConsent, false);
  assert.equal(own.contactId, undefined);
  assert.equal(own.frozen, undefined);
  assert.equal(own.withdrawalAcknowledgementRequired, true);
  assert.equal(own.notifications.enabled, false);
  assert.equal(own.notifications.preferenceOnly, true);
});
test("participation storage uses actual PostgreSQL row bytes with exact inclusive bounds", async () => {
  for (const [table, count, bytes] of [
    ["os_participation_targets", 500, PARTICIPATION_LIMITS.targetBytes],
    ["os_participations", 2000, PARTICIPATION_LIMITS.participationBytes],
    ["os_participation_outbox", 8000, PARTICIPATION_LIMITS.outboxBytes],
  ]) {
    const c = {
      query: async (sql) => ({
        rows: [
          sql.includes(`FROM ${table} `)
            ? { count, bytes }
            : { count: 0, bytes: 0 },
        ],
      }),
    };
    await participationQuota(c, "org");
    const bad = {
      query: async (sql) => ({
        rows: [
          sql.includes(`FROM ${table} `)
            ? { count, bytes: bytes + 1 }
            : { count: 0, bytes: 0 },
        ],
      }),
    };
    await assert.rejects(
      participationQuota(bad, "org"),
      code("participation_quota"),
    );
  }
});
function backup() {
  const s = source(),
    terms = participationTerms(s);
  return {
    records: [
      s,
      {
        id: "candidate",
        moduleId: "events",
        data: { kind: "registration", eventId: s.id, contactId: "contact" },
      },
      { id: "contact", moduleId: "contacts", data: {} },
    ],
    participation: {
      version: 1,
      targets: [
        {
          targetId: s.id,
          moduleId: s.moduleId,
          sourceRevision: 4,
          terms,
          termsHash: hash(terms),
          createdAt: "2026-10-26T00:00:00.000Z",
        },
      ],
      participations: [
        {
          id: "p",
          targetId: s.id,
          moduleId: s.moduleId,
          bookingRecordId: "candidate",
          contactId: "contact",
          intakeId: null,
          state: "confirmed",
          source: "staff",
          revision: 5,
          frozen: { terms, sourceRevision: 4, termsHash: hash(terms) },
          createdAt: "2026-10-26T00:00:00.000Z",
        },
      ],
      outbox: [],
    },
  };
}
test("recovery retains prior confirmed occupancy as blocked nonreserving provenance", () => {
  const b = backup(),
    n = restoredParticipation(b);
  assert.equal(n.participations[0].state, "requested");
  assert.equal(n.participations[0].recoveredState, "confirmed");
  assert.equal(n.participations[0].consent, undefined);
  assert.ok(n.warnings.length);
  assert.throws(
    () =>
      restoredParticipation({
        ...b,
        records: b.records.filter((r) => r.id !== "contact"),
      }),
    code("participation_backup"),
  );
  const canceled = structuredClone(b);
  canceled.participation.participations[0].state = "cancelled";
  canceled.records = canceled.records.filter((r) => r.id !== "contact");
  assert.equal(restoredParticipation(canceled).participations.length, 0);
  assert.match(
    restoredParticipation(canceled).warnings[0].message,
    /private source archive/,
  );
});
test("malformed recovery envelopes and null referenced records return a bounded validation error", () => {
  for (const bad of [
    null,
    [],
    { ...backup(), records: [null] },
    { ...backup(), records: null },
    {
      ...backup(),
      records: [{ id: "target", moduleId: "events", data: null }],
    },
    { ...backup(), intake: { submissions: [null] } },
  ])
    assert.throws(
      () => restoredParticipation(bad),
      code("participation_backup"),
    );
  const b = backup();
  b.records.find((r) => r.id === "candidate").data = null;
  assert.throws(() => restoredParticipation(b), code("participation_backup"));
});
test("participant query/CSRF/session failures occur before any tenant access", async () => {
  let calls = 0;
  const db = {
      tx: async () => {
        calls++;
        throw Error("Unexpected tenant read");
      },
    },
    settings = { origin: "https://os.example.invalid", secret: "a".repeat(40) },
    session = {
      session: { id: "session" },
      user: { id: "user", email: "u@example.invalid", emailVerified: true },
    },
    url =
      settings.origin +
      "/api/participant/orgs/org/requests/intake/participations";
  await assert.rejects(
    participantParticipationRoutes({
      request: new Request(url + "?receipt=private"),
      db,
      settings,
      session,
    }),
    code("participant_query"),
  );
  await assert.rejects(
    participantParticipationRoutes({
      request: new Request(url + "/p/cancel", {
        method: "POST",
        headers: {
          origin: settings.origin,
          "content-type": "application/json",
        },
        body: "{}",
      }),
      db,
      settings,
      session,
    }),
    code("csrf"),
  );
  assert.equal(calls, 0);
});

test("version-two delivery recovery keeps outcome provenance but removes send and recipient authority", () => {
  const b = backup();
  b.participation.version = 2;
  b.participation.participations[0].delivery_consent = {
    enabled: true,
    userId: "untrusted-source-user",
  };
  b.participation.outbox = [
    {
      id: "historical-notice",
      participationId: "p",
      eventRevision: 42,
      participationRevision: 5,
      purpose: "participation",
      channel: "email",
      state: "unknown",
      payload: { state: "confirmed", participationId: "p", revision: 42 },
      createdAt: "2026-10-26T00:00:00.000Z",
      intentKind: "snapshot",
      consentRevision: 1,
      consentCopy: "participation-email-v1",
      templateVersion: "participation-notice-v1",
      attemptedAt: "2026-10-26T00:01:00.000Z",
      attempts: 1,
      lastCheckedAt: null,
      safeCode: "attempt_unconfirmed",
      providerEventAt: null,
      recoveredState: null,
      relayKey: "untrusted-source-relay-key",
      userId: "untrusted-source-user",
      recipientHash: "untrusted-source-recipient",
    },
  ];
  const normalized = restoredParticipation(b),
    row = normalized.outbox[0];
  assert.equal(row.eventRevision, 42);
  assert.equal(row.participationRevision, 5);
  assert.equal(row.state, "cancelled");
  assert.equal(row.recoveredState, "unknown");
  assert.equal(row.intentKind, "legacy");
  assert.equal(row.safeCode, "attempt_unconfirmed");
  assert.equal(row.relayKey, undefined);
  assert.equal(row.userId, undefined);
  assert.equal(row.recipientHash, undefined);
  assert.equal(normalized.participations[0].delivery_consent, undefined);
  for (const patch of [
    { attempts: -1 },
    { participationRevision: null },
    { state: "send-again" },
    { providerEventAt: "2026-10-26" },
  ]) {
    const forged = structuredClone(b);
    Object.assign(forged.participation.outbox[0], patch);
    assert.throws(
      () => restoredParticipation(forged),
      code("participation_backup"),
    );
  }
});
