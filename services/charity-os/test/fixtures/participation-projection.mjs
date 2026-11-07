/** Closed fictional whole-only projection; importing it opens no connection. */
import { participationTerms } from "../../lib/participation.mjs";
import { hash } from "../../lib/security.mjs";
export function projectionFixture({
  count = 1998,
  intervalAware = false,
} = {}) {
  const at = new Date("2026-11-07T00:00:00.000Z");
  const data = {
    title: "界".repeat(180),
    kind: "shift",
    startAt: "2099-01-02T09:00:00+00:00",
    endAt: "2099-01-02T11:00:00+00:00",
    timeZone: "UTC",
    capacity: 1,
    allowPartialIntervals: intervalAware,
    participationPurpose: "界".repeat(600),
    participantInstructions: "界".repeat(600),
    organizerEmail: "a".repeat(240) + "@a.invalid",
    organizerUrl: "https://example.invalid/" + "a".repeat(476),
  };
  const terms = participationTerms({
      id: "shift",
      moduleId: "volunteers",
      data,
    }),
    termsHash = hash(terms);
  const targets = [
    {
      org_id: "org",
      target_id: "shift",
      module_id: "volunteers",
      revision: 1,
      mode: "managed",
      source_revision: 4,
      terms,
      terms_hash: termsHash,
      recovery_block: false,
      created_at: at,
    },
  ];
  const participations = Array.from({ length: count }, (_, i) => ({
    org_id: "org",
    id: `p${i}`,
    target_id: "shift",
    module_id: "volunteers",
    booking_record_id: `b${i}`,
    contact_id: "contact",
    intake_id: null,
    state: "cancelled",
    revision: 1,
    source: "staff",
    consent: {
      revision: 1,
      sourceRevision: 4,
      termsHash,
      at: at.toISOString(),
      waitlistAllowed: false,
      emailUpdates: false,
      method: "Fictional offline receipt",
      evidenceRef: "fixture",
      withdrawalAcknowledged: false,
    },
    frozen: null,
    requested_interval: null,
    created_at: at,
    updated_at: at,
    confirmed_at: null,
    cancelled_at: at,
    last_command: null,
    recovered: false,
    recovered_state: null,
  }));
  const row = (id, module_id, data) => ({
    id,
    org_id: "org",
    module_id,
    data,
    status: "draft",
    revision: 1,
    created_at: at,
    updated_at: at,
    owner_id: "fictional-owner",
    last_editor_id: "fictional-owner",
    approval: null,
    snapshot: null,
    source: null,
  });
  const records = [
    row("shift", "volunteers", data),
    row("contact", "contacts", {}),
    ...participations.map((p) =>
      row(p.booking_record_id, "volunteers", {
        kind: "assignment",
        shiftId: "shift",
        contactId: "contact",
      }),
    ),
  ];
  const used = Buffer.byteLength(JSON.stringify(participations));
  const calls = [];
  const c = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT * FROM os_participation_targets"))
        return { rows: targets };
      if (sql.startsWith("SELECT * FROM os_participations"))
        return { rows: participations };
      if (
        sql.startsWith("SELECT * FROM os_participation_outbox") ||
        sql.startsWith("SELECT id FROM os_intake")
      )
        return { rows: [] };
      if (sql.startsWith("SELECT * FROM os_records")) return { rows: records };
      if (sql.includes("sum(octet_length(to_jsonb(t)::text))"))
        return { rows: [{ bytes: used }] };
      throw Error("Unexpected closed fixture query");
    },
  };
  return { c, calls, targets, participations, records, used };
}
