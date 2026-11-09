/** Same-client reminder journal. No clock is minted by retained-result lookup. */
import { REMINDER_OUTBOX_COLUMNS } from './participation-reminder-outbox.mjs';
import { hash } from './security.mjs';
import { compareGroupExactStamps } from './participation-group-model.mjs';
import { validateReminderPreviewPacket, validateReminderReceipt } from './participation-reminder-model.mjs';
import { reminderNeed as need, reminderOwn as own, reminderExact as exact, reminderId as id,
  reminderSha as sha, reminderStamp as stamp, reminderRows as rows, reminderSame as same } from './participation-reminder-choice.mjs';

export const REMINDER_PREVIEW_KIND = 'participation-reminder-v1';
const SQL6 = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const SELECT = `SELECT t.org_id,t.id,t.actor_id,t.kind,t.payload,t.checksum,t.base_revision,${SQL6('t.created_at')} AS created_exact,${SQL6('t.expires_at')} AS expires_exact,${SQL6('t.committed_at')} AS committed_exact,(t.expires_at-t.created_at=interval '10 minutes') AS window_valid FROM os_previews t WHERE t.org_id=$1 AND t.kind=$2`;
export const REMINDER_STORE_SQL = Object.freeze({
  lookup: SELECT + ` AND t.actor_id=$3 AND (t.id=$4 OR (t.committed_at IS NOT NULL AND t.payload#>>'{receipt,commandSha256}'=$5)) ORDER BY t.id COLLATE "C" LIMIT 3`,
  worker: SELECT + ` AND t.committed_at IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(t.payload#>'{receipt,result,scheduled}') x WHERE x->>'outboxId'=$3) ORDER BY t.id COLLATE "C" LIMIT 2`,
  usage: `SELECT count(*) FILTER(WHERE committed_at IS NULL) AS pending_count,count(*) FILTER(WHERE committed_at IS NOT NULL) AS committed_count,COALESCE(sum(octet_length(payload::text)) FILTER(WHERE committed_at IS NOT NULL),0) AS committed_bytes,octet_length($2::jsonb::text) AS candidate_bytes FROM os_previews WHERE org_id=$1`,
  insert: 'INSERT INTO os_previews(org_id,id,actor_id,kind,payload,checksum,base_revision,expires_at,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::timestamptz,$9::timestamptz)',
  accept: 'UPDATE os_previews SET payload=$5::jsonb,checksum=$6,committed_at=$7::timestamptz WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND committed_at IS NULL AND expires_at>clock_timestamp() AND checksum=$8 AND payload=$9::jsonb AND base_revision=$10',
  cancelOwn: "UPDATE os_participation_outbox SET state='cancelled',safe_code='preference_off',lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND participation_id=$2 AND intent_kind='reminder' AND first_attempt_at IS NULL AND state IN ('paused','pending','leased')",
  sequence: 'SELECT COALESCE(max(event_revision),0)+1 AS sequence FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2',
  duplicate: "SELECT id FROM os_participation_outbox WHERE org_id=$1 AND participation_id=$2 AND intent_kind='reminder' AND payload#>>'{reminder,commitmentSha256}'=$3 LIMIT 1",
  insertOutbox: 'INSERT INTO os_participation_outbox(' + REMINDER_OUTBOX_COLUMNS.join(',') + ') VALUES(' + REMINDER_OUTBOX_COLUMNS.map((key, index) => '$' + (index + 1) + (key === 'payload' ? '::jsonb' : '')).join(',') + ')',
});
export function validateReminderAccess(input) {
  const value = own(input, 1024); exact(value, ['moduleId', 'targetId', 'incarnationSha256']);
  need(['events', 'volunteers'].includes(value.moduleId)); id(value.targetId); sha(value.incarnationSha256); return value;
}
export function validateReminderEnvelope(input) {
  const value = own(input, 65536); need(value?.state === 'pending' || value?.state === 'accepted');
  exact(value, ['version', 'state', value.state === 'pending' ? 'packet' : 'receipt', 'access']); need(value.version === 1);
  const access = validateReminderAccess(value.access);
  if (value.state === 'pending') {
    const packet = validateReminderPreviewPacket(value.packet);
    need(access.moduleId === packet.target.moduleId && access.targetId === packet.target.targetId);
  } else { validateReminderReceipt(value.receipt); own(value, 16384); }
  return value;
}
export function validateReminderStoredRow(input) {
  const value = own(input, 131072);
  exact(value, ['org_id', 'id', 'actor_id', 'kind', 'payload', 'checksum', 'base_revision', 'created_exact',
    'expires_exact', 'committed_exact', 'window_valid']);
  id(value.org_id); id(value.id); id(value.actor_id); need(value.kind === REMINDER_PREVIEW_KIND && value.window_valid === true);
  stamp(value.created_exact); stamp(value.expires_exact); sha(value.checksum); sha(value.base_revision);
  const envelope = validateReminderEnvelope(value.payload);
  need(hash(envelope) === value.checksum && hash(envelope.access) === value.base_revision);
  const packet = envelope.state === 'pending' ? envelope.packet : envelope.receipt;
  need(packet.orgId === value.org_id && packet.previewId === value.id && packet.actorId === value.actor_id);
  if (envelope.state === 'pending') need(value.committed_exact === null && value.created_exact === packet.issuedAtExact && value.expires_exact === packet.expiresAtExact);
  else {
    stamp(value.committed_exact); need(value.committed_exact === packet.acceptedAtExact &&
      compareGroupExactStamps(value.created_exact, value.committed_exact) <= 0 &&
      compareGroupExactStamps(value.committed_exact, value.expires_exact) < 0);
  }
  return value;
}
function contextRow(raw, org, actorId = null) {
  const row = validateReminderStoredRow(raw); need(row.org_id === org && (actorId === null || row.actor_id === actorId), 'intent', 409); return row;
}
export async function lookupReminderIntent(c, { org, actorId, previewId, commandSha256, write = false }) {
  id(org); id(actorId); id(previewId); sha(commandSha256); need(typeof write === 'boolean');
  const found = rows(await c.query(REMINDER_STORE_SQL.lookup + (write ? ' FOR UPDATE OF t' : ''),
    [org, REMINDER_PREVIEW_KIND, actorId, previewId, commandSha256]), 3);
  need(found.length <= 1, 'intent', 409);
  return found.length ? contextRow(found[0], org, actorId) : null;
}
/** Later worker seam: caller rechecks CURRENT scheduling actor membership,
 * member incarnation and complete admin/module/scope. It must not require the
 * original staff browser session to survive until delivery. No send authority
 * or current delivery eligibility is returned by this historical lookup. */
export async function readReminderScheduleForOutbox(c, { org, outboxId }) {
  id(org); id(outboxId);
  const found = rows(await c.query(REMINDER_STORE_SQL.worker, [org, REMINDER_PREVIEW_KIND, outboxId]), 2);
  need(found.length <= 1, 'intent', 409);
  if (!found.length) return null;
  const row = contextRow(found[0], org); need(row.payload.state === 'accepted' &&
    row.payload.receipt.result.scheduled.some(item => item.outboxId === outboxId), 'intent', 409);
  return row;
}
function counter(value) {
  need((typeof value === 'string' && /^(?:0|[1-9][0-9]{0,15})$/.test(value)) || Number.isSafeInteger(value), 'sql', 500);
  const number = Number(value); need(Number.isSafeInteger(number) && number >= 0, 'sql', 500); return number;
}
export async function requireReminderArchiveRoom(c, { org, payload, pending }) {
  id(org); const encoded = JSON.stringify(payload); const found = rows(await c.query(REMINDER_STORE_SQL.usage, [org, encoded]), 1);
  need(found.length === 1, 'sql', 500); const usage = found[0];
  need(counter(usage.committed_count) + 1 <= 32 && counter(usage.committed_bytes) + counter(usage.candidate_bytes) <= 128 * 1024 * 1024, 'archive_quota');
  need(counter(usage.candidate_bytes) <= (pending ? 65536 : 16384), 'preview_quota');
  if (pending) need(counter(usage.pending_count) + 1 <= 4, 'preview_quota');
}
export async function insertReminderPreview(c, { org, actorId, packet, access }) {
  const envelope = validateReminderEnvelope({ version: 1, state: 'pending', packet, access });
  need(packet.orgId === org && packet.actorId === actorId);
  // A genuinely new preview may discard only this purpose's expired pending
  // rows. Accepted lookup never enters this path or purchases new capacity.
  await c.query('DELETE FROM os_previews WHERE org_id=$1 AND kind=$2 AND committed_at IS NULL AND expires_at<=clock_timestamp()', [org, REMINDER_PREVIEW_KIND]);
  await requireReminderArchiveRoom(c, { org, payload: envelope, pending: true });
  const result = await c.query(REMINDER_STORE_SQL.insert, [org, packet.previewId, actorId, REMINDER_PREVIEW_KIND,
    JSON.stringify(envelope), hash(envelope), hash(access), packet.expiresAtExact, packet.issuedAtExact]);
  need(result.rowCount === 1, 'preview_write'); return envelope;
}
export async function retainReminderAccepted(c, { row, receipt }) {
  const envelope = validateReminderEnvelope({ version: 1, state: 'accepted', receipt, access: row.payload.access });
  need(row.payload.state === 'pending' && receipt.orgId === row.org_id && receipt.previewId === row.id && receipt.actorId === row.actor_id);
  await requireReminderArchiveRoom(c, { org: row.org_id, payload: envelope, pending: false });
  const result = await c.query(REMINDER_STORE_SQL.accept, [row.org_id, row.id, row.actor_id, REMINDER_PREVIEW_KIND,
    JSON.stringify(envelope), hash(envelope), receipt.acceptedAtExact, row.checksum, JSON.stringify(row.payload), row.base_revision]);
  need(result.rowCount === 1, 'preview', 409); return envelope;
}
export async function cancelOwnUnattemptedReminders(c, org, participationId) {
  id(org); id(participationId); return (await c.query(REMINDER_STORE_SQL.cancelOwn, [org, participationId])).rowCount;
}
export async function requireReminderOriginalAvailable(c, org, item) {
  const found = rows(await c.query(REMINDER_STORE_SQL.duplicate, [org, item.participationId, item.commitmentSha256]), 1);
  need(found.length === 0, 'original_already_recorded', 409);
}
export async function nextReminderJournalSequence(c, org, participationId) {
  const found = rows(await c.query(REMINDER_STORE_SQL.sequence, [org, participationId]), 1);
  need(found.length === 1, 'sql', 500); const sequence = counter(found[0].sequence);
  need(sequence >= 1 && sequence <= 2147483647, 'sequence_exhausted', 409); return sequence;
}
