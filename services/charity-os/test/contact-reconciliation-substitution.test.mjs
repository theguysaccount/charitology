import assert from "node:assert/strict";
import test from "node:test";
import { hash } from "../lib/security.mjs";
import { getModule, validateRecord } from "../lib/modules.mjs";
import { archivedContactSubstitutionRestoreRecords, CONTACT_SUBSTITUTION_CHOICE_PROJECTION, closeContactSubstitutions, collectContactSubstitutionSource,
  contactSubstitutionAudit, contactSubstitutionChoice, contactSubstitutionGraph, contactSubstitutionOffer,
} from "../lib/contact-reconciliation-substitution.mjs";

const org = "fictional_shift_workspace";
const intentId = "a".repeat(32);
const issued = "2026-11-08T12:00:00.123456Z";
const deadline = "2026-11-08T12:10:00.123456Z";
const shiftId = "fixture-shift";
const choice = {
  org_id: org, intent_id: intentId, party: "leaving", shift_id: shiftId, shift_revision: 2,
  participation_id: "place-out", participation_revision: 4, intake_id: "entry-out",
  accepted_at: "2026-11-08T12:01:00.123456Z", expires_at: deadline, withdrawn_at: "2026-11-08T12:12:00.000000Z",
};
const offer = {
  format: "charitology-volunteer-substitution-offer", version: 1, state: "pending", orgId: org, intentId, shiftId,
  shiftRevision: 2, outgoing: { id: "place-out", revision: 4 }, replacement: { id: "place-in", revision: 3 },
  scopeSha256: "b".repeat(64), issuerMembershipSha256: "c".repeat(64), issuedAtExact: issued, expiresAtExact: deadline,
};
const preview = p => ({
  org_id: org, id: intentId, actor_id: "staff", kind: "volunteer-substitution-offer-v1", payload: p, checksum: hash(p),
  base_revision: p.scopeSha256, created_at: p.issuedAtExact.replace("Z", "+00:00"),
  expires_at: p.expiresAtExact.replace("Z", "+00:00"), committed_at: null,
});
const stamps = { created: issued, expires: deadline, committed: null };
const ref = (value, table) => ({ value, table, rowKey: "fixture-key", pin: "fixture-pin" });
function graphFixture() {
  const g = contactSubstitutionGraph(), records = [];
  const add = (id, moduleId, data) => records.push({ id, moduleId, data, revision: 8 });
  const row = (table, data) => collectContactSubstitutionSource(g, table, { org_id: org, ...data });
  add(shiftId, "volunteers", { kind: "shift" });
  add("form", "forms", { kind: "form" });
  // Equal account spellings are deliberately unrelated to the typed record edges.
  add("staff", "contacts", { kind: "person-reference" });
  row("os_participation_targets", { target_id: shiftId, module_id: "volunteers" });
  row("os_publications", { id: "form-publication", kind: "volunteer-interest", target_module: "volunteers",
    target_id: shiftId, record_id: "form" });
  for (const party of ["out", "in"]) {
    const contactId = "person-" + party, booking = "assignment-" + party, intake = "entry-" + party;
    add(contactId, "contacts", { kind: "person-reference" });
    add(booking, "volunteers", { kind: "assignment", shiftId, contactId });
    row("os_intake", { id: intake, publication_id: "form-publication",
      converted_ids: [{ id: booking, moduleId: "volunteers" }, { id: contactId, moduleId: "contacts" }] });
    row("os_participations", { id: "place-" + party, module_id: "volunteers", target_id: shiftId,
      requested_interval: null, revision: 8, contact_id: contactId, booking_record_id: booking, intake_id: intake });
  }
  return { g, records };
}

test("choice inventory omits account and authority columns and validates one exact projected row", () => {
  for (const excluded of ["user_id", "link_id", "link_revision", "person_identity_sha256", "link_scope_sha256", "own_authority_sha256"])
    assert(!CONTACT_SUBSTITUTION_CHOICE_PROJECTION.includes(excluded));
  assert.deepEqual(contactSubstitutionChoice(choice, intentId + ":leaving"), choice);
  for (const changed of [{ user_id: "unexpected-account" }, { party: "other" }, { accepted_at: deadline },
    { withdrawn_at: issued }, { participation_revision: 0 }])
    assert.throws(() => contactSubstitutionChoice({ ...choice, ...changed }, intentId + ":leaving"));
});

test("offer checks stored SQL microseconds and never admits an extended or committed packet", () => {
  assert.deepEqual(contactSubstitutionOffer(preview(offer), intentId, stamps), offer);
  const extended = { ...offer, expiresAtExact: "2026-11-08T12:10:00.123457Z" };
  assert.throws(() => contactSubstitutionOffer(preview(extended), intentId, { ...stamps, expires: extended.expiresAtExact }));
  assert.throws(() => contactSubstitutionOffer({ ...preview(offer), committed_at: issued }, intentId, { ...stamps, committed: issued }));
  assert.throws(() => contactSubstitutionOffer(preview({ ...offer, contactId: "staff" }), intentId, stamps));
  assert.throws(() => contactSubstitutionOffer({ ...preview(offer), created_at: issued.replace("456", "457") }, intentId, stamps));
});

test("expired/withdrawn packets project typed contact provenance, and a contradictory intake or unpaired audit refuses", () => {
  const { g, records } = graphFixture();
  assert.equal(closeContactSubstitutions(g, records), null);
  g.offers.push(ref(offer, "os_previews"));
  g.choices.push(ref(choice, "os_participation_substitution_choices"));
  assert.deepEqual(closeContactSubstitutions(g, records).map(row => row.contactIds), [["person-out", "person-in"], ["person-out"]]);
  g.choices[0].value = { ...choice, intake_id: "entry-in" };
  assert.throws(() => closeContactSubstitutions(g, records));
  g.choices[0].value = choice;
  const audit = { action: "participation.substituted", module_id: "volunteers", record_id: shiftId, actor_id: "staff",
    created_at: issued, detail: { outgoingId: "place-out", replacementId: "place-in" } };
  assert.throws(() => contactSubstitutionAudit({ ...audit, detail: { ...audit.detail, contactId: "staff" } }));
  g.audits.push(ref(contactSubstitutionAudit(audit), "os_events"));
  assert.throws(() => closeContactSubstitutions(g, records));
});

function priorJournalFixture() {
  const { g, records } = graphFixture();
  const actorId = "previous-restoring-staff", archivedAt = "2026-11-08T12:30:00.125Z", checksum = "d".repeat(64);
  const restored = records.map(({ id, moduleId, data }) => ({
    id, orgId: org, moduleId, data: { title: "Fixture " + id, ...data },
    status: getModule(moduleId).workflow.initial, ownerId: actorId, revision: 1,
    approval: null, snapshot: null, source: null, updatedAt: archivedAt,
  }));
  for (const record of restored) record.data = validateRecord(record.moduleId, record.data, {
    orgId: org, recordId: record.id, status: record.status, records: restored,
  });
  const summary = { count: restored.length, checksum, sourceArchiveId: "e".repeat(32), sourceHistoryCount: 0,
    sourceCommentCount: 0, sourceReportCount: 0, volunteerSubstitutionsRecovered: 1,
    learningSourcesRecovered: 0, learningEventsRetained: 0, learningReportsRecovered: 0,
    intakePublicationsClosed: 1, intakeRequests: 2, participationTargetsRecovered: 1, participationsRecovered: 2,
    taskRecurrenceSeriesRecovered: 0, taskRecurrenceOccurrencesRetained: 0 };
  const audit = (action, record_id, module_id, detail) =>
    ({ org_id: org, actor_id: actorId, created_at: archivedAt, action, record_id, module_id, detail });
  return { sourceOrgId: org, summary, originalRecords: restored.map(record=>({ ...record })),
    originalEvents: [...restored.map(record=>audit("record.restored",record.id,record.moduleId,{ record, sourceChecksum: checksum })),
      audit("backup.restored", null, null, { ...summary })],
    priorHistories: [{ shift: { id: shiftId }, acceptedAtExact: issued,
      outgoing: { participationId: "place-out", assignmentId: "assignment-out" },
      replacement: { participationId: "place-in", assignmentId: "assignment-in" } }],
    intake: { submissions: [...g.intake.values()].map(r=>({ id: r.id, publicationId: r.publication_id })),
      publications: [...g.publications.values()].map(r=>({ id: r.id, recordId: r.record_id })) },
    participation: { participations: [...g.participants.values()].map(r=>({ id: r.id, intakeId: r.intake_id, contactId: r.contact_id })) },
  };
}

test("a prior inactive native restore journal binds typed records and refuses duplicates, a private family or mismatches", () => {
  const archive = priorJournalFixture();
  assert.deepEqual(archivedContactSubstitutionRestoreRecords(archive).map(row=>row.id), archive.originalRecords.map(row=>row.id));
  for (const change of [
    x=>x.originalEvents.push(structuredClone(x.originalEvents.at(-1))),
    x=>x.originalEvents.push(structuredClone(x.originalEvents[0])),
    x=>{ x.originalEvents.at(-1).detail.participantCheckinsRecovered = 1; },
    x=>{ x.originalEvents[0].detail.sourceChecksum = "f".repeat(64); },
    x=>{ x.originalEvents[0].org_id = "different-tenant"; },
    x=>{ x.originalEvents[0].created_at = "2026-11-08T12:30:00.126Z"; },
    x=>{ x.originalEvents.find(row=>row.record_id==="assignment-out").detail.record.data.contactId = "staff"; },
    x=>{ x.priorHistories[0].acceptedAtExact = "2026-11-08T12:30:00.126000Z"; },
    x=>{ x.priorHistories = []; },
  ]) {
    const altered = structuredClone(archive);
    change(altered);
    assert.throws(() => archivedContactSubstitutionRestoreRecords(altered));
  }
});
