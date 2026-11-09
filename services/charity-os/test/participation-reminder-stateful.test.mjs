/** Fictional strict SQL client and actual unchanged rowRecord function body.
 * No driver, actual SQL/session/account, capacity, provider or network proof. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { hash } from '../lib/security.mjs';

const databaseSource = readFileSync(new URL('../lib/database.mjs', import.meta.url), 'utf8');
const start = databaseSource.indexOf('export function rowRecord('), end = databaseSource.indexOf('export async function allRecords', start);
assert(start >= 0 && end > start);
const rowRecord = vm.runInThisContext('(' + databaseSource.slice(start, end).replace(/^export /, '').trim() + ')');
const unexpected = () => { throw Error('Unexpected database helper in fictional test'); };
mock.module(new URL('../lib/database.mjs', import.meta.url).href, { namedExports: {
  rowRecord, audit: unexpected, database: unexpected, allRecords: unexpected, saveRecord: unexpected,
  logicalBackupBytes: unexpected, storePreview: unexpected, commitPreview: unexpected,
  noteParticipationReceiptReplay: unexpected, noteContactReconciliationReceiptReplay: unexpected,
  PREVIEW_LIMITS: Object.freeze({ pendingCount: 4, committedCount: 32, pendingBytes: 134217728, committedBytes: 134217728 }),
} });
const { ownReminderEnableBinding, REMINDER_CONTEXT_SQL } = await import('../lib/participation-reminder-context.mjs');
const { participationTerms } = await import('../lib/participation.mjs');

const ORG = 'fictional-org', ACTOR = 'fictional-own-user', INTAKE = 'fictional-intake', PID = 'fictional-participation';
const CREATED = '2026-11-08T08:00:00.000001Z', LINK = 'b'.repeat(32), EMAIL = 'person@example.invalid';
const SQL = {
  own: 'SELECT l.id,l.revision,l.user_id,u.email,u."emailVerified" AS verified FROM os_participant_links l JOIN "user" u ON u.id=l.user_id WHERE l.org_id=$1 AND l.intake_id=$2 AND l.publication_id=$3 AND l.user_id=$4 AND l.revoked_at IS NULL',
  recipient: 'SELECT l.id,l.revision,l.user_id,u.email,u."emailVerified" AS verified FROM os_participant_links l JOIN "user" u ON u.id=l.user_id JOIN os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id WHERE l.org_id=$1 AND l.intake_id=$2 AND l.user_id=$3 AND l.id=$4 AND l.revision=$5 AND l.revoked_at IS NULL AND i.erased_at IS NULL',
  previous: "SELECT current_setting('app.user_id',true) AS user_id",
  configure: "SELECT set_config('app.user_id',$1,true)",
};
const result = rows => ({ rows, rowCount: rows.length });
function fictionalOwnContext() {
  const raw = { org_id: ORG, id: 'fictional-session', module_id: 'events', data: {
    title: 'Fictional reminder fixture', kind: 'session', programId: null, startAt: '2030-01-01T09:00:00.000Z',
    endAt: '2030-01-01T10:00:00.000Z', timeZone: 'UTC', capacity: 3,
    participationPurpose: 'Fictional private test only', participantInstructions: null, organizerEmail: 'organizer@example.invalid', organizerUrl: null,
  }, status: 'approved', revision: 3, owner_id: 'fictional-editor', last_editor_id: 'fictional-editor',
    approval: { status: 'approved', revision: 3, actorId: 'fictional-reviewer' }, snapshot: null, source: null,
    deleted_at: null, created_at: '2026-11-08T08:00:00.000001+00:00', updated_at: '2026-11-08T08:00:00.000002+00:00' };
  // Positive actual-codec control uses the pg-Date shape it really requires.
  const source = rowRecord({ ...raw, created_at: new Date(raw.created_at), updated_at: new Date(raw.updated_at) });
  const terms = participationTerms(source), intake = { org_id: ORG, id: INTAKE, revision: 1,
    publication_id: 'fictional-publication', erased_at: null, answers: { email: EMAIL } };
  const p = { org_id: ORG, id: PID, intake_id: INTAKE, target_id: raw.id, module_id: 'events',
    booking_record_id: 'fictional-booking', contact_id: 'fictional-contact', state: 'confirmed', revision: 4,
    source: 'intake', recovered: false, requested_interval: null,
    frozen: { sourceRevision: 3, termsHash: hash(terms), terms },
    delivery_consent: { version: 'participation-email-v1', enabled: true, revision: 1,
      at: '2026-11-08T08:00:00.000Z', userId: ACTOR, linkId: LINK, linkRevision: 1, recipientHash: hash(EMAIL) } };
  const calls = [];
  const c = { async query(sql, args = []) {
    calls.push({ sql, args: structuredClone(args) });
    if (sql === SQL.own) { assert.deepEqual(args, [ORG, INTAKE, intake.publication_id, ACTOR]); return result([{ id: LINK, revision: 1, user_id: ACTOR, email: EMAIL, verified: true }]); }
    if (sql === SQL.previous) { assert.deepEqual(args, []); return result([{ user_id: ACTOR }]); }
    if (sql === SQL.configure) { assert.deepEqual(args, [ACTOR]); return result([{ set_config: ACTOR }]); }
    if (sql === SQL.recipient) { assert.deepEqual(args, [ORG, INTAKE, ACTOR, LINK, 1]); return result([{ id: LINK, revision: 1, user_id: ACTOR, email: EMAIL, verified: true }]); }
    if (sql === REMINDER_CONTEXT_SQL.target) { assert.deepEqual(args, [ORG, raw.id]); return result([{ target: { mode: 'managed', recovery_block: false }, created_exact: CREATED }]); }
    if (sql === REMINDER_CONTEXT_SQL.records) { assert.deepEqual(args, [ORG, [raw.id]]); return result([{ record: structuredClone(raw), created_exact: CREATED }]); }
    assert.fail('Unexpected fictional SQL: ' + sql);
  } };
  return { c, calls, raw, context: { actor: { id: ACTOR, email: EMAIL }, p, intake, confirmedAtExact: CREATED } };
}
test('actual row codec accepts SQL-jsonb source timestamps through reminder context', async () => {
  const fixture = fictionalOwnContext();
  const binding = await ownReminderEnableBinding(fixture.c, { org: ORG, context: fixture.context });
  assert.equal(binding.recipient.email, EMAIL);
  assert.equal(binding.commitment.confirmedAtExact, CREATED, 'SQL6 identity is preserved independently of record DTO milliseconds');
  assert.equal(binding.commitment.range.startAt, fixture.raw.data.startAt);
  assert.equal(fixture.calls.filter(call => call.sql === SQL.configure).length, 2, 'Actual recipient helper restores prior user context');
});
