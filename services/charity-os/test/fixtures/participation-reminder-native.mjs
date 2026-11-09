/** Fictional codec/fake-client fixture; no live consent, approval or SQL proof. */
import { participationTerms, participationAllocationHash } from "../../lib/participation.mjs";
import { hash } from "../../lib/security.mjs";
export function reminderNativeFixture({ intervals = false, reminder = false } = {}) {
  const at = new Date("2026-11-07T09:00:00.000Z"), id = "p00";
  const data = { title: "Fictional shift", kind: "shift", startAt: "2026-11-10T08:00:00Z",
    endAt: "2026-11-10T16:00:00Z", timeZone: "UTC", capacity: 10,
    allowPartialIntervals: intervals, participationPurpose: "Fictional participation for codec checks only.", organizerEmail: "fixture@example.invalid" };
  const terms = participationTerms({ id: "shift", moduleId: "volunteers", data }), termsHash = hash(terms);
  const requested = intervals ? { version: 1, startAt: "2026-11-10T09:00:00Z", endAt: "2026-11-10T10:00:00Z", timeZone: "UTC" } : null;
  const allocationHash = requested ? participationAllocationHash("shift", 4, termsHash, requested) : null;
  const targets = [{ org_id: "org", target_id: "shift", module_id: "volunteers", revision: 1, mode: "managed",
    source_revision: 4, terms, terms_hash: termsHash, recovery_block: false, created_at: at }];
  const participations = [{ org_id: "org", id, target_id: "shift", module_id: "volunteers", booking_record_id: "booking",
    contact_id: "contact", intake_id: "intake", state: "confirmed", revision: 4, source: "intake",
    consent: { revision: 1, sourceRevision: 4, termsHash, at: at.toISOString(), waitlistAllowed: false,
      emailUpdates: true, method: "Fictional codec receipt", evidenceRef: null, withdrawalAcknowledged: true,
      ...(requested ? { allocationHash } : {}) },
    frozen: { terms, sourceRevision: 4, termsHash, programId: null,
      ...(requested ? { interval: requested, allocationHash } : {}) },
    requested_interval: requested, waitlist_sequence: null, confirmed_at: at, cancelled_at: null,
    recovered: false, recovered_state: null, created_at: at, updated_at: at,
    delivery_consent: { never: "export this authority" }, reminder_consent: { never: "export this choice" }, last_command: { never: "export command receipt" } }];
  const outbox = [{ org_id: "org", id: "notice", participation_id: id, event_revision: 1, purpose: "participation", channel: "email",
    state: "paused", payload: { state: "confirmed", participationId: id, revision: 1 }, created_at: at,
    participation_revision: 4, intent_kind: "legacy", consent_revision: 0, consent_copy: null, template_version: null,
    first_attempt_at: null, attempts: 0, last_checked_at: null, safe_code: null, provider_event_at: null, recovered_state: null,
    user_id: "private-user", link_id: "c".repeat(32), link_revision: 9, recipient_hash: "a".repeat(64), policy_epoch: "b".repeat(32), relay_key: "private-key", payload_hash: "d".repeat(64), budget_bytes: 0 }];
  // The reminder marker itself is installed by the test with the reviewed pure helper.
  const records = [{ id: "shift", moduleId: "volunteers", data },
    { id: "booking", moduleId: "volunteers", data: { kind: "assignment", shiftId: "shift", contactId: "contact" } },
    { id: "contact", moduleId: "contacts", data: {} }];
  const calls = [];
  const c = { async query(sql, args) { calls.push({ sql, args });
    if (sql === "SELECT * FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id") return { rows: targets };
    if (sql === "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY created_at,id") return { rows: participations };
    if (sql === "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY created_at,id") return { rows: outbox };
    throw new Error("Unexpected closed codec fixture query");
  } };
  return { c, calls, targets, participations, outbox, records, intake: { submissions: [{ id: "intake" }] } };
}
