import test from "node:test";
import assert from "node:assert/strict";
import {
  participationTerms,
  participationAllocationHash,
} from "../lib/participation.mjs";
import {
  restoredParticipation,
  exportParticipation,
  restoreParticipation,
} from "../lib/participation-backup.mjs";
import { hash } from "../lib/security.mjs";
const at = "2026-11-07T00:00:00.000Z";
const range = (start = "09", end = "10") => ({
  version: 1,
  startAt: `2099-01-10T${start}:00:00Z`,
  endAt: `2099-01-10T${end}:00:00Z`,
  timeZone: "UTC",
});
function fixture() {
  const source = {
    id: "shift",
    moduleId: "volunteers",
    data: {
      title: "Fictional shift",
      kind: "shift",
      startAt: "2099-01-10T08:00:00Z",
      endAt: "2099-01-10T16:00:00Z",
      timeZone: "UTC",
      capacity: 1,
      allowPartialIntervals: true,
      participationPurpose: "Arrange one fictional volunteer commitment.",
      organizerEmail: "fixture@example.invalid",
    },
  };
  const terms = participationTerms(source),
    termsHash = hash(terms);
  const rows = [range(), range("10", "11")].map((requestedInterval, i) => {
    const allocationHash = participationAllocationHash(
      "shift",
      4,
      termsHash,
      requestedInterval,
    );
    return {
      id: `p${i}`,
      targetId: "shift",
      moduleId: "volunteers",
      bookingRecordId: `b${i}`,
      contactId: `c${i}`,
      intakeId: null,
      state: "confirmed",
      revision: 3,
      source: "staff",
      createdAt: at,
      confirmedAt: at,
      requestedInterval,
      consent: {
        revision: 2,
        sourceRevision: 4,
        termsHash,
        allocationHash,
        at,
        waitlistAllowed: false,
        emailUpdates: false,
        method: "Fictional offline receipt",
        evidenceRef: "fixture-only",
        withdrawalAcknowledged: false,
      },
      frozen: {
        terms,
        sourceRevision: 4,
        termsHash,
        interval: requestedInterval,
        allocationHash,
      },
    };
  });
  const records = [
    source,
    ...rows.flatMap((p) => [
      {
        id: p.bookingRecordId,
        moduleId: "volunteers",
        data: {
          title: "Fictional candidate",
          kind: "assignment",
          shiftId: "shift",
          contactId: p.contactId,
        },
      },
      { id: p.contactId, moduleId: "contacts", data: {} },
    ]),
  ];
  return {
    records,
    participation: {
      version: 3,
      targets: [
        {
          targetId: "shift",
          moduleId: "volunteers",
          sourceRevision: 4,
          terms,
          termsHash,
          createdAt: at,
        },
      ],
      participations: rows,
      outbox: [],
    },
  };
}
const refused = (fn) =>
  assert.throws(fn, (e) => e.code === "participation_backup");
test("version-three adjacent confirmations preserve exact ranges and restore only inactive claims", () => {
  const b = fixture(),
    before = structuredClone(b),
    n = restoredParticipation(b);
  assert.deepEqual(b, before);
  assert.equal(n.participations.length, 2);
  n.participations.forEach((p, i) => {
    assert.equal(p.state, "requested");
    assert.equal(p.recoveredState, "confirmed");
    assert.deepEqual(
      p.requestedInterval,
      b.participation.participations[i].requestedInterval,
    );
    assert.deepEqual(p.frozen.interval, p.requestedInterval);
    assert.equal(
      p.frozen.allocationHash,
      b.participation.participations[i].frozen.allocationHash,
    );
    assert.equal(p.consent, undefined);
    assert.equal(p.lastCommand, undefined);
    assert.equal(p.deliveryConsent, undefined);
  });
});
test("overlapping, unknown-capacity, changed-hash and changed-frozen-range backups refuse atomically", () => {
  for (const change of [
    (b) => {
      b.participation.participations[1].requestedInterval = range();
    },
    (b) => {
      b.records[0].data.capacity = null;
    },
    (b) => {
      b.participation.participations[0].frozen.allocationHash = "0".repeat(64);
    },
    (b) => {
      b.participation.participations[0].consent.allocationHash = "0".repeat(64);
    },
    (b) => {
      b.participation.participations[0].frozen.interval = range("10", "11");
    },
  ]) {
    const b = fixture();
    change(b);
    refused(() => restoredParticipation(b));
  }
  const b = fixture(),
    p = b.participation.participations[1],
    requested = range("09", "11"),
    h = participationAllocationHash("shift", 4, p.consent.termsHash, requested);
  p.requestedInterval = requested;
  p.frozen.interval = requested;
  p.frozen.allocationHash = h;
  p.consent.allocationHash = h;
  refused(() => restoredParticipation(b));
});
test("unconfirmed and cancelled interval writing survives without gaining a reservation", () => {
  const b = fixture();
  b.participation.participations[0].state = "requested";
  b.participation.participations[0].frozen = null;
  b.participation.participations[1].state = "cancelled";
  b.participation.participations[1].cancelledAt = at;
  const n = restoredParticipation(b);
  assert.deepEqual(n.participations[0].requestedInterval, range());
  assert.equal(n.participations[0].frozen.allocationKnown, false);
  assert.equal(n.participations[0].frozen.sourceHistory.state, "requested");
  assert.equal(n.participations[0].recoveredState, "requested");
  assert.equal(n.participations[1].state, "cancelled");
});
test("old sub-versions preserve whole terms, refuse interval smuggling and do not infer opt-in", () => {
  const source = fixture().records[0];
  delete source.data.allowPartialIntervals;
  const original = participationTerms(source),
    digest = hash(original);
  for (const v of [1, 2]) {
    const b = fixture();
    b.participation.version = v;
    b.participation.targets[0].terms = original;
    b.participation.targets[0].termsHash = digest;
    b.records[0] = source;
    b.participation.participations = b.participation.participations
      .slice(0, 1)
      .map((p) => {
        const q = {
          ...p,
          consent: null,
          frozen: { terms: original, sourceRevision: 4, termsHash: digest },
        };
        delete q.requestedInterval;
        return q;
      });
    assert.equal(
      restoredParticipation(b).participations[0].requestedInterval,
      null,
    );
    b.participation.participations[0].requestedInterval = null;
    refused(() => restoredParticipation(b));
  }
  assert.equal(Object.hasOwn(original, "intervalPolicy"), false);
  assert.equal(
    hash(
      participationTerms({
        ...source,
        data: { ...source.data, allowPartialIntervals: false },
      }),
    ),
    digest,
  );
});
test("actual export carries v3 choice and restore SQL clears authority while retaining that choice", async () => {
  const b = fixture(),
    rows = b.participation.participations.map((p) => ({
      id: p.id,
      target_id: p.targetId,
      module_id: p.moduleId,
      booking_record_id: p.bookingRecordId,
      contact_id: p.contactId,
      intake_id: null,
      state: p.state,
      revision: p.revision,
      source: p.source,
      consent: p.consent,
      requested_interval: p.requestedInterval,
      frozen: p.frozen,
      created_at: at,
      confirmed_at: at,
    }));
  const exported = await exportParticipation(
    {
      query: async (sql) => ({
        rows: sql.includes("os_participation_targets")
          ? b.participation.targets.map((t) => ({
              target_id: t.targetId,
              module_id: t.moduleId,
              source_revision: t.sourceRevision,
              terms: t.terms,
              terms_hash: t.termsHash,
              created_at: at,
            }))
          : sql.includes("os_participations")
            ? rows
            : [],
      }),
    },
    "org",
  );
  assert.equal(exported.version, 3);
  assert.deepEqual(exported.participations[0].requestedInterval, range());
  assert.equal(
    exported.participations[0].consent.allocationHash,
    rows[0].consent.allocationHash,
  );
  const normalized = restoredParticipation({ ...b, participation: exported }),
    calls = [];
  await restoreParticipation(
    {
      query: async (sql, args) => {
        calls.push({ sql, args });
        return {
          rows: sql.includes("count(*)") ? [{ count: 0, bytes: 0 }] : [],
        };
      },
    },
    "org",
    "user",
    normalized,
  );
  const inserted = calls.filter((c) =>
    c.sql.startsWith("INSERT INTO os_participations("),
  );
  assert.equal(inserted.length, 2);
  assert.match(inserted[0].sql, /'recovered',NULL/);
  assert.match(inserted[0].sql, /requested_interval/);
  assert.deepEqual(JSON.parse(inserted[0].args[13]), range());
});

function exportedDb(b, rows) {
  return {
    query: async (sql) => ({
      rows: sql.includes("os_participation_targets")
        ? b.participation.targets.map((t) => ({
            target_id: t.targetId,
            module_id: t.moduleId,
            source_revision: t.sourceRevision,
            terms: t.terms,
            terms_hash: t.termsHash,
            created_at: at,
          }))
        : sql.includes("os_participations")
          ? rows
          : [],
    }),
  };
}
function recoveredRows(n) {
  return n.participations.map((p) => ({
    id: p.id,
    target_id: p.targetId,
    module_id: p.moduleId,
    booking_record_id: p.bookingRecordId,
    contact_id: p.contactId,
    intake_id: null,
    state: p.state,
    revision: 1,
    source: "recovered",
    consent: null,
    requested_interval: p.requestedInterval,
    frozen: p.frozen,
    recovered: true,
    recovered_state: p.recoveredState,
    created_at: at,
  }));
}
test("repeated inactive export and restore preserves the exact nonallocating original request history", async () => {
  const b = fixture();
  b.participation.participations = b.participation.participations.slice(0, 1);
  const p = b.participation.participations[0];
  p.state = "waitlisted";
  p.frozen = null;
  const first = restoredParticipation(b),
    original = structuredClone(first.participations[0].frozen);
  assert.equal(original.allocationKnown, false);
  assert.equal(original.sourceHistory.state, "waitlisted");
  assert.deepEqual(
    original.sourceHistory.terms,
    b.participation.targets[0].terms,
  );
  assert.deepEqual(original.sourceHistory.consent, p.consent);
  for (let i = 0; i < 3; i++) {
    const exported = await exportParticipation(
      exportedDb(b, recoveredRows(first)),
      "org",
    );
    const again = restoredParticipation({ ...b, participation: exported });
    assert.deepEqual(again.participations[0].frozen, original);
    assert.equal(again.participations[0].consent, undefined);
    assert.deepEqual(
      again.participations[0].requestedInterval,
      p.requestedInterval,
    );
  }
});
test("unavailable legacy original terms remain null rather than substituting changed snapshots", () => {
  const b = fixture();
  b.participation.participations = b.participation.participations.slice(0, 1);
  const p = b.participation.participations[0];
  p.state = "requested";
  p.requestedInterval = null;
  p.frozen = null;
  delete p.consent.allocationHash;
  const originalTerms = structuredClone(b.participation.targets[0].terms);
  delete originalTerms.intervalPolicy;
  p.consent.termsHash = hash(originalTerms);
  b.records[0].data.title = "A later working title";
  const n = restoredParticipation(b),
    h = n.participations[0].frozen.sourceHistory;
  assert.equal(h.terms, null);
  assert.equal(h.termsHash, p.consent.termsHash);
  assert.equal(h.sourceRevision, p.consent.sourceRevision);
  assert.deepEqual(h.consent, p.consent);
  const matching = structuredClone(b);
  matching.participation.targets[0].terms = originalTerms;
  matching.participation.targets[0].termsHash = hash(originalTerms);
  assert.deepEqual(
    restoredParticipation(matching).participations[0].frozen.sourceHistory
      .terms,
    originalTerms,
  );
});
test("nonallocating envelopes cannot masquerade as confirmed or carry extra authority", () => {
  const b = fixture();
  b.participation.participations = b.participation.participations.slice(0, 1);
  const p = b.participation.participations[0];
  p.state = "requested";
  p.frozen = null;
  const n = restoredParticipation(b),
    envelope = n.participations[0].frozen;
  for (const change of [
    (x) => {
      x.state = "confirmed";
    },
    (x) => {
      x.recovered = true;
      x.recoveredState = "confirmed";
    },
    (x) => {
      x.frozen.approval = { status: "approved" };
    },
    (x) => {
      x.frozen.terms = b.participation.targets[0].terms;
    },
    (x) => {
      x.frozen.sourceHistory.state = "confirmed";
    },
    (x) => {
      x.frozen.sourceHistory.consent.userId = "forged";
    },
  ]) {
    const bad = structuredClone(b),
      row = bad.participation.participations[0];
    row.frozen = structuredClone(envelope);
    change(row);
    refused(() => restoredParticipation(bad));
  }
});

test("expanded inactive history is bounded before restore instead of partially admitting an oversized prepared graph", () => {
  const b = fixture(),
    source = b.records[0];
  source.data.title = "界".repeat(180);
  source.data.participationPurpose = "界".repeat(600);
  source.data.participantInstructions = "界".repeat(600);
  source.data.organizerEmail = "a".repeat(240) + "@a.invalid";
  source.data.organizerUrl = "https://example.invalid/" + "a".repeat(476);
  const t = participationTerms(source),
    h = hash(t),
    template = b.participation.participations[0];
  b.participation.targets[0].terms = t;
  b.participation.targets[0].termsHash = h;
  b.participation.participations = Array.from({ length: 1998 }, (_, i) => ({
    ...template,
    id: `p${i}`,
    bookingRecordId: `b${i}`,
    contactId: "shared",
    state: "cancelled",
    cancelledAt: at,
    requestedInterval: null,
    frozen: null,
    consent: { ...template.consent, termsHash: h },
  }));
  b.participation.participations.forEach(
    (p) => delete p.consent.allocationHash,
  );
  b.records = [
    source,
    { id: "shared", moduleId: "contacts", data: {} },
    ...b.participation.participations.map((p) => ({
      id: p.bookingRecordId,
      moduleId: "volunteers",
      data: { kind: "assignment", shiftId: "shift", contactId: "shared" },
    })),
  ];
  assert.equal(b.records.length, 2000);
  assert(
    Buffer.byteLength(JSON.stringify(b.participation.participations)) <
      8 * 1024 * 1024,
  );
  refused(() => restoredParticipation(b));
});
