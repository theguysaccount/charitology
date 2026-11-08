// Fictional source facts only; no account, approval or database authority.
import { hash } from "../lib/security.mjs";
import { checkInCommitmentSha256, reportCheckIn, withdrawCheckIn } from "../lib/participant-check-in-model.mjs";
export const at = "2026-11-07T10:30:00.000Z";
export function context() {
  const terms = { title: "Fictional occurrence", kind: "shift", startAt: "2026-11-07T09:00:00Z", endAt: "2026-11-07T12:00:00Z", timeZone: "UTC", participationPurpose: "Arrange fictional participation", participantInstructions: null, organizerEmail: null, organizerUrl: "https://organizer.example.invalid/" };
  return { id: "claim_1", orgId: "org_A", participationId: "participation_1", moduleId: "volunteers", bookingRecordId: "booking_1", revision: 4, intakeRevision: 3,
    frozen: { terms, sourceRevision: 7, termsHash: hash(terms), candidateRevision: 2, candidateApproval: { status: "approved", revision: 2, actorId: "reviewer", reason: "Fictional review", at: "2026-11-01T00:00:00.000Z" }, programId: null }, requestedInterval: null };
}
export function reportRequest(c = context()) {
  return { revision: c.revision, intakeRevision: c.intakeRevision, checkInRevision: 0, commitmentSha256: checkInCommitmentSha256(c), claimedArrivalAt: "2026-11-07T10:10:00Z", reportConsent: true, consentVersion: "arrival-self-report-v1", idempotencyKey: "fictional_report_command_01" };
}
export const reported = () => reportCheckIn({ record: null, request: reportRequest(), context: context(), actorId: "own_actor", serverNow: at, auditRetained: true }).record;
export const withdrawalRequest = r => ({ checkInRevision: r.revision, reportSha256: r.history.claimSha256, withdraw: true, idempotencyKey: "fictional_withdraw_command_01" });
export const withdrawn = () => { const record = reported(); return withdrawCheckIn({ record, request: withdrawalRequest(record), actorId: "own_actor", serverNow: "2026-12-01T12:00:00.000Z", auditRetained: false }).record; };
