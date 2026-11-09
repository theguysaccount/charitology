/** Passive CRM interpretation of the volunteer handoff. It does not consult
 * an own account, link, current willingness or staff command authority. */
import { hash, stable } from "./security.mjs";
import { validateBackup } from "./backup.mjs";
import { restoredIntake } from "./intake-backup.mjs";
import { restoredParticipation } from "./participation-backup.mjs";
import { restoredDelivery } from "./participation-delivery-backup.mjs";
import { restoredTaskRecurrence } from "./task-recurrence-backup.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";
import { VOLUNTEER_SUBSTITUTION_OFFER_KIND } from "./volunteer-substitution-offer.mjs";
import { VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS } from "./volunteer-substitution-store.mjs";
import { inspectStoredVolunteerSubstitutionReport, planRestoredVolunteerSubstitutionReports } from "./volunteer-substitution-native.mjs";

export const CONTACT_SUBSTITUTION_CHOICE_TABLE = "os_participation_substitution_choices";
export const CONTACT_SUBSTITUTION_AUDIT = "participation.substituted";
export const CONTACT_SUBSTITUTION_METHOD = "volunteer-substitution-typed-closure-v1";
const ARCHIVE_LISTS = ["comments", "events", "reports", "files", "trash", "trashFiles", "integrations"];
const ARCHIVE_KEYS = ["format", "version", "schemaVersion", "organization", "createdAt", "records", "checksum",
  ...ARCHIVE_LISTS, "intake", "participation", "delivery", "taskRecurrence", "volunteerSubstitutions"];
const columns = ["org_id", "intent_id", "party", "shift_id", "shift_revision", "participation_id",
  "participation_revision", "intake_id"];
const timestamps = ["accepted_at", "expires_at", "withdrawn_at"];
const sql6 = name => `to_char(t.${name} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const CONTACT_SUBSTITUTION_CHOICE_PROJECTION = `jsonb_build_object(${[
  ...columns.map(name => `'${name}',t.${name}`), ...timestamps.map(name => `'${name}',${sql6(name)}`),
].join(",")})`;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const INTENT = /^[a-f0-9]{32}$/;
const SHA = /^[a-f0-9]{64}$/;
const PARTY = { leaving: "outgoing", joining: "replacement" };
const id = value => typeof value === "string" && ID.test(value);
const intent = value => typeof value === "string" && INTENT.test(value);
const sha = value => typeof value === "string" && SHA.test(value);
const rev = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
const key = (shift, outgoing, replacement) => JSON.stringify([shift, outgoing, replacement]);
const proofKey = (scope, decision) => JSON.stringify([scope, decision]);
const same = (left, right) => stable(left) === stable(right);
const need = condition => { if (!condition) throw new Error("Invalid retained volunteer substitution provenance."); };
function exact(value, keys) {
  // Only parsed rows from the tenant's bounded catalog reader reach here.
  need(value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length && keys.every(name => Object.hasOwn(value, name)));
  return value;
}
function storedExact(raw) {
  const value = typeof raw === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d{1,6}))?(?:Z|[+-]\d\d:\d\d)$/.exec(raw);
  need(value && Number.isFinite(Date.parse(raw)));
  return validateGroupExactStamp(new Date(raw).toISOString().slice(0, 23) + (value[1] ?? "").padEnd(6, "0").slice(3) + "Z");
}
function micros(value) {
  return BigInt(Date.parse(validateGroupExactStamp(value).slice(0, 23) + "Z")) * 1000n + BigInt(value.slice(23, 26));
}
function boundedWindow(from, until) {
  const duration = micros(until) - micros(from);
  need(duration > 0n && duration <= 600000000n);
}
export function contactSubstitutionChoice(row, rowKey) {
  exact(row, [...columns, ...timestamps]);
  need(intent(row.intent_id) && Object.hasOwn(PARTY, row.party) && rowKey === row.intent_id + ":" + row.party &&
    [row.shift_id, row.participation_id, row.intake_id].every(id) && [row.shift_revision, row.participation_revision].every(rev));
  boundedWindow(row.accepted_at, row.expires_at);
  if (row.withdrawn_at !== null) need(micros(row.withdrawn_at) >= micros(row.accepted_at));
  return row;
}

// The live offer reader also checks issuer, current approval and roster. The
// stored envelope can outlive those permissions and carries no CRM authority.
export function contactSubstitutionOffer(row, rowKey, stamps) {
  const p = exact(row.payload, ["format", "version", "state", "orgId", "intentId", "shiftId", "shiftRevision",
    "outgoing", "replacement", "scopeSha256", "issuerMembershipSha256", "issuedAtExact", "expiresAtExact"]);
  const leg = value => { const r = exact(value, ["id", "revision"]); need(id(r.id) && rev(r.revision)); return r; };
  need(row.kind === VOLUNTEER_SUBSTITUTION_OFFER_KIND && p.format === "charitology-volunteer-substitution-offer" &&
    p.version === 1 && p.state === "pending" && p.orgId === row.org_id && intent(p.intentId) && row.id === p.intentId &&
    rowKey === row.id && id(row.actor_id) && id(p.shiftId) && rev(p.shiftRevision) && sha(p.scopeSha256) &&
    sha(p.issuerMembershipSha256) && row.base_revision === p.scopeSha256 && row.checksum === hash(p) &&
    p.issuedAtExact === stamps.created && p.expiresAtExact === stamps.expires && stamps.committed === null &&
    storedExact(row.created_at) === stamps.created && storedExact(row.expires_at) === stamps.expires &&
    row.committed_at === null && leg(p.outgoing).id !== leg(p.replacement).id &&
    Buffer.byteLength(JSON.stringify(p)) <= 2048);
  boundedWindow(p.issuedAtExact, p.expiresAtExact);
  return p;
}
export function contactSubstitutionReport(row, rowKey, createdExact) {
  const { org_id, id: reportId, created_by, title, checksum, payload } = row;
  need(reportId === rowKey);
  const admitted = inspectStoredVolunteerSubstitutionReport({
    org_id, id: reportId, created_by, title, checksum, payload, created_exact: createdExact,
  }, org_id);
  const intentId = admitted.source === "recorded" ? payload.scope.intentId : null;
  need(intentId === null || intent(intentId));
  return { ...admitted, intentId, createdAtExact: createdExact };
}
export function contactSubstitutionAudit(row) {
  const d = exact(row.detail, ["outgoingId", "replacementId"]);
  need(row.action === CONTACT_SUBSTITUTION_AUDIT && row.module_id === "volunteers" &&
    [row.actor_id, row.record_id, d.outgoingId, d.replacementId].every(id) && d.outgoingId !== d.replacementId);
  storedExact(row.created_at);
  return { key: key(row.record_id, d.outgoingId, d.replacementId), actorId: row.actor_id };
}

// A generic backup can retain arbitrary other history. This exception is only
// for the committed, bounded native substitution profile whose audit and
// destination reports can all be reconciled. Mixed archives keep the refusal.
export function contactSubstitutionArchive(row, rowKey, stamps) {
  const a = exact(row.payload, ARCHIVE_KEYS);
  need(row.kind === "backup" && intent(row.id) && rowKey === row.id && id(row.actor_id) &&
    row.base_revision === hash([]) && sha(row.checksum) && row.checksum === a.checksum);
  need(storedExact(row.created_at) === stamps.created && storedExact(row.expires_at) === stamps.expires &&
    storedExact(row.committed_at) === stamps.committed &&
    micros(stamps.expires) - micros(stamps.created) === 1800000000n &&
    stamps.created <= stamps.committed && stamps.committed < stamps.expires);
  need(ARCHIVE_LISTS.filter(name => name !== "events").every(name => Array.isArray(a[name]) && !a[name].length) &&
    Array.isArray(a.events) && a.events.length <= 2000);
  const records = validateBackup(a, row.org_id, row.actor_id);
  const reports = planRestoredVolunteerSubstitutionReports(a, { orgId: row.org_id, actorId: row.actor_id,
    createdAtExact: stamps.committed });
  const intake = restoredIntake(a), participation = restoredParticipation(a);
  const taskRecurrence = restoredTaskRecurrence(a.taskRecurrence, { records: a.records, trash: [] });
  need(reports.present && !restoredDelivery(a).policy && !taskRecurrence.series.length && !taskRecurrence.occurrences.length);
  const summary = {
    count: records.length, checksum: a.checksum, sourceArchiveId: row.id, sourceHistoryCount: a.events.length,
    sourceCommentCount: 0, sourceReportCount: 0, volunteerSubstitutionsRecovered: reports.reports.length,
    learningSourcesRecovered: 0, learningEventsRetained: 0, learningReportsRecovered: 0,
    intakePublicationsClosed: intake.publications.length, intakeRequests: intake.submissions.length,
    participationTargetsRecovered: participation.targets.length, participationsRecovered: participation.participations.length,
    taskRecurrenceSeriesRecovered: 0, taskRecurrenceOccurrencesRetained: 0,
  };
  return { actorId: row.actor_id, at: stamps.committed, records, sourceOrgId: a.volunteerSubstitutions.sourceOrgId,
    originalRecords: a.records, originalEvents: a.events,
    reports: reports.reports, summary };
}
export function isContactSubstitutionRestoreAudit(row) {
  return row.action === "backup.restored" && Object.hasOwn(row.detail ?? {}, "volunteerSubstitutionsRecovered") ||
    row.action === "record.restored" && Object.hasOwn(row.detail ?? {}, "sourceChecksum");
}
export function closeContactSubstitutionRestore(archives, audits, reports) {
  if (!archives.length && !audits.length) return null;
  need(archives.length === 1);
  const a = archives[0].value;
  const recovered = new Map(reports.filter(r => r.value.source === "recovered").map(r => [r.reportId, r]));
  need(recovered.size === a.reports.length && a.reports.every(expected => {
    const r = recovered.get(expected.id);
    return r?.value.actorId === expected.created_by && r.checksum === expected.checksum &&
      r.value.createdAtExact === expected.created_at;
  }));
  const remaining = new Map(a.records.map(r => [r.id, r]));
  let summary = false;
  for (const { value: row } of audits) {
    need(row.actor_id === a.actorId && storedExact(row.created_at) === a.at);
    if (row.action === "backup.restored") {
      need(!summary && row.record_id === null && row.module_id === null && same(row.detail, a.summary));
      summary = true;
      continue;
    }
    const detail = exact(row.detail, ["record", "sourceChecksum"]), expected = remaining.get(row.record_id);
    need(expected?.moduleId === row.module_id && detail.sourceChecksum === a.summary.checksum);
    const { updatedAt, ...record } = detail.record;
    storedExact(updatedAt);
    need(same(record, expected));
    remaining.delete(row.record_id);
  }
  need(summary && remaining.size === 0);
  return archives[0];
}

export function contactSubstitutionGraph() {
  return { choices: [], offers: [], reports: [], audits: [], archives: [], restoreAudits: [], targets: new Map(), participants: new Map(),
    intake: new Map(), publications: new Map() };
}
export function collectContactSubstitutionSource(graph, table, row) {
  if (table === "os_participation_targets" && row.module_id === "volunteers") graph.targets.set(row.target_id, row);
  if (table === "os_participations" && row.module_id === "volunteers") graph.participants.set(row.id, row);
  if (table === "os_intake") graph.intake.set(row.id, row);
  if (table === "os_publications" && row.kind === "volunteer-interest") graph.publications.set(row.id, row);
}
export function closeContactSubstitutions(graph, currentRecords) {
  const { choices, offers, reports, audits, targets, participants, intake, publications } = graph;
  if (!choices.length && !offers.length && !reports.length && !audits.length) return null;
  need(choices.length <= VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS.choices &&
    reports.length <= VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS.receipts && audits.length <= reports.length);
  const records = new Map(currentRecords.map(r => [r.id, r]));
  const record = (value, moduleId, kind) => {
    const r = records.get(value);
    need(r?.moduleId === moduleId && (kind === undefined || r.data?.kind === kind));
    return r;
  };
  const shift = (shiftId, revision, recovered = false) => {
    const r = record(shiftId, "volunteers", "shift"), t = targets.get(shiftId);
    need(t && (recovered || r.revision >= revision));
    return r;
  };
  const participant = (participantId, shiftId, revision, recovered = false) => {
    const p = participants.get(participantId);
    need(p?.target_id === shiftId && p.requested_interval === null && rev(p.revision) && (recovered || p.revision >= revision));
    const booking = record(p.booking_record_id, "volunteers", "assignment");
    const person = record(p.contact_id, "contacts");
    const entry = intake.get(p.intake_id), publication = publications.get(entry?.publication_id);
    need(booking.data.shiftId === shiftId && booking.data.contactId === person.id &&
      publication?.target_module === "volunteers" && publication.target_id === shiftId &&
      entry.converted_ids.some(r => r.id === booking.id && r.moduleId === "volunteers") &&
      entry.converted_ids.some(r => r.id === person.id && r.moduleId === "contacts"));
    record(publication.record_id, "forms", "form");
    return { p, booking, contactId: person.id };
  };
  const pair = (shiftId, outId, outRevision, inId, inRevision, recovered = false) => {
    const outgoing = participant(outId, shiftId, outRevision, recovered);
    const replacement = participant(inId, shiftId, inRevision, recovered);
    need(outgoing.contactId !== replacement.contactId && outgoing.p.intake_id !== replacement.p.intake_id);
    return { outgoing, replacement };
  };
  const ids = ({ outgoing, replacement }) => [outgoing.contactId, replacement.contactId];
  const affected = [], byOffer = new Map(), byDecision = new Map(), liveAudits = new Map(), origins = new Set();
  for (const entry of offers) {
    const o = entry.value;
    shift(o.shiftId, o.shiftRevision);
    const parties = pair(o.shiftId, o.outgoing.id, o.outgoing.revision, o.replacement.id, o.replacement.revision);
    need(!byOffer.has(o.intentId));
    byOffer.set(o.intentId, o);
    affected.push({ ...entry, contactIds: ids(parties) });
  }
  for (const entry of reports) {
    const { source, history: h, actorId, intentId } = entry.value;
    const recovered = source === "recovered";
    shift(h.shift.id, h.shift.revision, recovered);
    const parties = pair(h.shift.id, h.outgoing.participationId, h.outgoing.afterRevision,
      h.replacement.participationId, h.replacement.afterRevision, recovered);
    for (const name of ["outgoing", "replacement"]) {
      const { p, booking } = parties[name], leg = h[name], terms = p.frozen?.terms;
      need(booking.id === leg.assignmentId && p.frozen?.sourceRevision === h.shift.revision &&
        terms?.kind === "shift" && storedExact(terms.startAt) === h.shift.startsAtExact &&
        storedExact(terms.endAt) === h.shift.endsAtExact);
      if (!recovered) need(p.source === "intake" && p.recovered === false && booking.revision >= leg.assignmentAfterRevision &&
        storedExact(name === "outgoing" ? p.cancelled_at : p.confirmed_at) === h.acceptedAtExact);
      if (recovered && name === "outgoing")
        need(p.source === "recovered" && p.recovered === true && p.recovered_state === "cancelled");
    }
    const origin = proofKey(h.originOrgId, h.decisionId);
    need(!origins.has(origin));
    origins.add(origin);
    if (!recovered) {
      const match = key(h.shift.id, h.outgoing.participationId, h.replacement.participationId);
      need(!liveAudits.has(match) && !byDecision.has(intentId));
      liveAudits.set(match, actorId);
      byDecision.set(intentId, h);
      const o = byOffer.get(intentId);
      if (o) need(o.shiftId === h.shift.id && o.shiftRevision === h.shift.revision &&
        o.outgoing.id === h.outgoing.participationId && o.outgoing.revision === h.outgoing.beforeRevision &&
        o.replacement.id === h.replacement.participationId && o.replacement.revision === h.replacement.beforeRevision &&
        o.issuedAtExact <= h.acceptedAtExact && h.acceptedAtExact < o.expiresAtExact);
    }
    affected.push({ ...entry, contactIds: ids(parties) });
  }
  const byChoiceIntent = new Map();
  for (const entry of choices) {
    const choice = entry.value, party = PARTY[choice.party];
    shift(choice.shift_id, choice.shift_revision);
    const { p, contactId } = participant(choice.participation_id, choice.shift_id, choice.participation_revision);
    need(p.intake_id === choice.intake_id);
    const prior = byChoiceIntent.get(choice.intent_id);
    if (prior) need(prior.party !== choice.party && prior.shift_id === choice.shift_id &&
      prior.shift_revision === choice.shift_revision && prior.participation_id !== choice.participation_id &&
      prior.intake_id !== choice.intake_id && prior.expires_at === choice.expires_at);
    byChoiceIntent.set(choice.intent_id, choice);
    const offer = byOffer.get(choice.intent_id), h = byDecision.get(choice.intent_id);
    if (offer) need(offer.shiftId === choice.shift_id && offer.shiftRevision === choice.shift_revision &&
      offer[party].id === choice.participation_id && offer[party].revision === choice.participation_revision &&
      offer.issuedAtExact <= choice.accepted_at && offer.expiresAtExact === choice.expires_at);
    if (h) need(h.shift.id === choice.shift_id && h.shift.revision === choice.shift_revision &&
      h[party].participationId === choice.participation_id && h[party].beforeRevision === choice.participation_revision &&
      choice.accepted_at <= h.acceptedAtExact && h.acceptedAtExact < choice.expires_at);
    affected.push({ ...entry, contactIds: [contactId] });
  }
  for (const { value: { key: auditKey, actorId } } of audits) {
    need(liveAudits.get(auditKey) === actorId);
    liveAudits.delete(auditKey);
  }
  need(liveAudits.size === 0);
  return affected;
}
