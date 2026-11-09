/** Actual commands/store/outbox/clock/routes with explicitly fictional authority,
 * audit/capacity modules and a strict in-memory SQL transaction model. Never PG,
 * session/role, measured capacity, durable COMMIT or delivery acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as security from '../lib/security.mjs';
import { reminderActorSha256, reminderCommitmentSha256, REMINDER_METHOD } from '../lib/participation-reminder-model.mjs';
import { renderParticipationReminderTemplate } from '../lib/participation-reminder-template.mjs';
import { compareGroupExactStamps } from '../lib/participation-group-model.mjs';

let active;
const clone = structuredClone, H = 'a'.repeat(64), ORG = 'fictional-org', ADMIN = 'fictional-admin', OWN = 'fictional-own';
const NOW = '2029-12-28T09:00:00.000001Z', CREATED = '2029-12-01T00:00:00.000001Z';
const ownSession = { session: { id: 'fictional-own-session' }, user: { id: OWN } };
const adminSession = { session: { id: 'fictional-admin-session' }, user: { id: ADMIN } };
const settings = { origin: 'https://fixture.invalid', secret: 'fictional-secret-'.repeat(4), participationDeliveryEnabled: true,
  participationTestOnly: false, relaySecret: '', cronSecret: '' };
const reject = (code, status = 409) => security.fail(status, 'fictional_' + code, 'Fictional protocol refusal');
const result = rows => ({ rows, rowCount: rows.length });
const missing = () => assert.fail('Unexpected database helper, not a real database');
mock.module(new URL('../lib/security.mjs', import.meta.url).href, { namedExports: { ...security,
  id: () => { assert(active); active.minted++; return (500 + active.minted).toString(16).padStart(32, '0'); } } });
mock.module(new URL('../lib/database.mjs', import.meta.url).href, { namedExports: {
  database: missing, rowRecord: missing, allRecords: missing, saveRecord: missing, logicalBackupBytes: missing,
  storePreview: missing, commitPreview: missing, noteParticipationReceiptReplay: missing, noteContactReconciliationReceiptReplay: missing,
  PREVIEW_LIMITS: { pendingCount: 4, committedCount: 32, pendingBytes: 134217728, committedBytes: 134217728 },
  audit: async (c, org, actor, action, record, detail) => {
    assert.equal(c, active.c); assert.equal(org, ORG); assert.equal(record, null); assert([OWN, ADMIN].includes(actor));
    assert(['participation.reminder.preference_enabled', 'participation.reminder.preference_off', 'participation.reminder.scheduled'].includes(action));
    active.events.push('audit:' + action);
    if (action === 'participation.reminder.scheduled' && active.transientAuditQuota) {
      // Explicit fake charge fixture: actual commands/store execute, while this
      // models only the generic audit's ordinary60 +1000 headroom rule.
      const pending = active.state.previews.filter(row => row.committed_exact === null).length;
      const outboxBudget = active.state.outbox.reduce((total, row) => total + row.budget_bytes, 0);
      const limit = 60 * 1024 * 1024, usage = active.transientAuditQuota.base + outboxBudget + pending * 4096;
      active.scheduleAuditWitness = { pending, accepted: active.state.previews.filter(row => row.payload.state === 'accepted').length,
        outbox: active.state.outbox.length, usage, limit };
      if (usage + 1000 > limit) security.fail(422, 'quota', 'Fictional transient pending-preview audit charge.');
    }
    if (active.auditFalse) return false;
    active.state.audits.push({ org, actor, action, detail: clone(detail) }); return true;
  },
} });
mock.module(new URL('../lib/participation-reminder-capacity.mjs', import.meta.url).href, { namedExports: {
  requireReminderMeasuredCapacity: async (c, org, args) => {
    assert.equal(c, active.c); assert.equal(org, ORG); active.events.push('MOCK-capacity:' + args.phase);
    assert(['choice-before-write', 'choice-final', 'preview-before-id', 'preview-final', 'schedule-before-id', 'schedule-final'].includes(args.phase));
    if (active.capacityFail === args.phase) reject('capacity');
  },
} });
mock.module(new URL('../lib/participation-reminder-context.mjs', import.meta.url).href, { namedExports: {
  readReminderWorkerContext: () => assert.fail('Worker authority is outside this mocked command/route fixture'),
  ownReminderPreflight: async (c, args) => { active.events.push('MOCK-own-authorized'); assert.equal(args.org, ORG); if (active.unauthorized) reject('own', 403); },
  reminderAdminPreflight: async (c, args) => { active.events.push('MOCK-admin-authorized'); assert.equal(args.org, ORG); if (active.unauthorized) reject('admin', 403); },
  readOwnReminderContext: async (c, args) => {
    active.events.push('MOCK-own-context'); assert.equal(args.org, ORG); assert.equal(args.participationId, 'own-p');
    if (active.unauthorized) reject('own', 403); return clone(active.own);
  },
  ownReminderEnableBinding: async () => { active.events.push('MOCK-own-enable-binding'); if (active.bindingUnavailable) reject('binding'); return clone(active.ownBinding); },
  reminderOwnSummary: async () => ({ version: REMINDER_METHOD, enabled: active.own.preference?.enabled === true,
    revision: active.own.preference?.revision ?? 0, atExact: active.own.preference?.atExact ?? null,
    currentCommitmentSha256: active.ownBinding.commitmentSha256, canEnable: true,
    canDisable: active.own.preference?.enabled === true, unavailableReason: null }),
  readReminderAdminContext: async (c, args) => {
    active.events.push(args.eligible === false ? 'MOCK-current-accepted-scope' : 'MOCK-current-eligibility');
    assert.equal(args.org, ORG); if (active.unauthorized) reject('admin', 403);
    if (args.eligible === false) return clone({ member: active.context.member, access: active.context.access, authority: active.context.authority });
    if (active.bindingUnavailable) reject('binding'); return clone(active.context);
  },
} });
const commands = await import('../lib/participation-reminder-commands.mjs');
const routes = await import('../lib/participation-reminder-routes.mjs');
const { REMINDER_STORE_SQL, REMINDER_PREVIEW_KIND, readReminderScheduleForOutbox } = await import('../lib/participation-reminder-store.mjs');
const { REMINDER_OUTBOX_COLUMNS } = await import('../lib/participation-reminder-outbox.mjs');
const { reminderChoiceRevisions } = await import('../lib/participation-reminder-choice.mjs');
const participationSource = readFileSync(new URL('../lib/participation.mjs', import.meta.url), 'utf8');
const clockStart = participationSource.indexOf('`WITH moment AS MATERIALIZED'), clockEnd = participationSource.indexOf('`', clockStart + 1);
assert(clockStart >= 0 && clockEnd > clockStart); const CLOCK_SQL = participationSource.slice(clockStart + 1, clockEnd);
function addTen(stamp) { return new Date(Date.parse(stamp.slice(0, 23) + 'Z') + 600000).toISOString().slice(0, -1) + stamp.slice(23, 26) + 'Z'; }
function epoch(stamp) { return (BigInt(Date.parse(stamp.slice(0, 23) + 'Z')) * 1000n + BigInt(stamp.slice(23, 26))).toString(); }
function original(person) {
  return { format: 'charitology-participation-reminder-commitment', version: 1, method: REMINDER_METHOD,
    orgId: ORG, moduleId: 'events', targetId: 'target', participationId: person, bookingRecordId: 'booking-' + person,
    intakeId: 'intake-' + person, contactId: 'contact-' + person, confirmedAtExact: '2029-12-27T00:00:00.000001Z',
    frozenSourceRevision: 3, frozenSha256: H, frozenTermsSha256: H,
    range: { startAt: '2030-01-01T09:00:00.000Z', endAt: '2030-01-01T10:00:00.000Z', timeZone: 'UTC' } };
}
function recipient(person = 'participant') { return { email: person + '@example.invalid', userId: person, linkId: 'b'.repeat(32), linkRevision: 1 }; }
function preference(commitment, person = 'participant') { const r = recipient(person); return { version: REMINDER_METHOD,
  enabled: true, revision: 1, atExact: CREATED, userId: r.userId, linkId: r.linkId, linkRevision: r.linkRevision,
  recipientSha256: security.hash(r.email), commitmentSha256: reminderCommitmentSha256(commitment) }; }
function fixture(count = 1) {
  const ownCommitment = original('own-p'), ownRecipient = recipient(OWN);
  const own = { actor: { id: OWN, email: ownRecipient.email }, intake: { id: 'own-intake', revision: 1 },
    p: { org_id: ORG, id: 'own-p', revision: 4, reminder_consent: null, last_command: null }, preference: null,
    authority: { actorSha256: reminderActorSha256(OWN), sessionSha256: H, linkSha256: H } };
  const items = Array.from({ length: count }, (_, n) => {
    const participationId = 'p' + String(n).padStart(2, '0'), commitment = original(participationId);
    return { participationId, participationRevision: 4, intakeRevision: 1, participationSha256: H, intakeSha256: H,
      deliveryConsentSha256: H, reminderConsentSha256: H, recipientBindingSha256: H, linkBindingSha256: H,
      commitment, commitmentSha256: reminderCommitmentSha256(commitment), recipient: recipient(), preference: preference(commitment) };
  });
  const context = { member: { userId: ADMIN }, authority: { actorSha256: reminderActorSha256(ADMIN), sessionSha256: H,
    membershipSha256: H, memberCreatedAtExact: CREATED, restoreEpochSha256: H }, access: { moduleId: 'events', targetId: 'target', incarnationSha256: H },
    target: { moduleId: 'events', targetId: 'target', targetRevision: 1, sourceRevision: 3, sourceSha256: H },
    policy: { epoch: 'policy-epoch', revision: 1, enabled: true }, template: renderParticipationReminderTemplate(settings.origin + '/participant'), items };
  const f = { own, context, ownBinding: { recipient: ownRecipient, commitment: ownCommitment, commitmentSha256: reminderCommitmentSha256(ownCommitment) },
    state: { previews: [], outbox: [], audits: [], jobs: [] }, events: [], queries: [], transactions: [], minted: 0, now: NOW, readOnly: false };
  f.c = { async query(sql, args = []) {
    f.queries.push({ sql, args: clone(args) });
    const write = /^(?:INSERT|UPDATE|DELETE)\b/.test(sql); assert(!f.readOnly || !write, 'Fictional READ ONLY tx refuses domain writes');
    if (sql === CLOCK_SQL) {
      if (f.noClock) assert.fail('Accepted Replay must not read a new domain clock');
      assert(args.length === 2); const valid = args[0] === null || compareGroupExactStamps(args[0], f.now) <= 0 && compareGroupExactStamps(f.now, args[1]) < 0;
      return result([{ at_exact: f.now, expires_at_exact: addTen(f.now), epoch_microseconds: epoch(f.now), within_window: valid }]);
    }
    if (sql === REMINDER_STORE_SQL.lookup || sql === REMINDER_STORE_SQL.lookup + ' FOR UPDATE OF t') {
      const [org, kind, actor, preview, command] = args; assert.equal(org, ORG); assert.equal(kind, REMINDER_PREVIEW_KIND);
      return result(clone(f.state.previews.filter(row => row.actor_id === actor && (row.id === preview || row.committed_exact !== null && row.payload.receipt.commandSha256 === command))));
    }
    if (sql === REMINDER_STORE_SQL.worker) {
      assert.deepEqual(args.slice(0, 2), [ORG, REMINDER_PREVIEW_KIND]); return result(clone(f.state.previews.filter(row => row.payload.state === 'accepted' && row.payload.receipt.result.scheduled.some(item => item.outboxId === args[2]))));
    }
    if (sql === REMINDER_STORE_SQL.usage) { assert.equal(args[0], ORG); return result([{ pending_count: f.state.previews.filter(r => r.committed_exact === null).length,
      committed_count: f.archiveFull ? 32 : f.state.previews.filter(r => r.committed_exact !== null).length,
      committed_bytes: 0, candidate_bytes: Buffer.byteLength(args[1]) }]); }
    if (sql === 'DELETE FROM os_previews WHERE org_id=$1 AND kind=$2 AND committed_at IS NULL AND expires_at<=clock_timestamp()') {
      assert.deepEqual(args, [ORG, REMINDER_PREVIEW_KIND]); f.state.previews = f.state.previews.filter(r => r.committed_exact !== null || compareGroupExactStamps(r.expires_exact, f.now) > 0); return { rows: [], rowCount: 0 };
    }
    if (sql === REMINDER_STORE_SQL.insert) {
      const [org, id, actor, kind, payload, checksum, base, expires, created] = args; assert.equal(org, ORG); assert.equal(kind, REMINDER_PREVIEW_KIND);
      assert(!f.state.previews.some(r => r.id === id)); f.state.previews.push({ org_id: org, id, actor_id: actor, kind, payload: JSON.parse(payload), checksum,
        base_revision: base, expires_exact: expires, created_exact: created, committed_exact: null, window_valid: expires === addTen(created) }); return { rows: [], rowCount: 1 };
    }
    if (sql === REMINDER_STORE_SQL.accept) {
      const [org, id, actor, kind, payload, checksum, at, oldHash, oldPayload, base] = args;
      const row = f.state.previews.find(r => r.org_id === org && r.id === id && r.actor_id === actor && r.kind === kind && r.committed_exact === null && r.checksum === oldHash && r.base_revision === base && JSON.stringify(r.payload) === oldPayload && compareGroupExactStamps(f.now, r.expires_exact) < 0);
      if (!row || f.receiptRace) return { rows: [], rowCount: 0 }; row.payload = JSON.parse(payload); row.checksum = checksum; row.committed_exact = at; return { rows: [], rowCount: 1 };
    }
    if (sql === REMINDER_STORE_SQL.duplicate) { assert.equal(args[0], ORG); return result(f.state.outbox.filter(r => r.participation_id === args[1] && r.intent_kind === 'reminder' && r.payload.reminder.commitmentSha256 === args[2]).map(r => ({ id: r.id }))); }
    if (sql === REMINDER_STORE_SQL.sequence) { assert.equal(args[0], ORG); return result([{ sequence: 1 + Math.max(0, ...f.state.outbox.filter(r => r.participation_id === args[1]).map(r => r.event_revision)) }]); }
    if (sql === 'SELECT octet_length($1::jsonb::text) AS bytes') return result([{ bytes: Buffer.byteLength(args[0]) + 64 }]); // explicitly fake SQL/jsonb measurement
    if (sql === 'SELECT id FROM os_participation_outbox WHERE org_id=$1 AND (id=ANY($2::text[]) OR relay_key=ANY($3::text[])) LIMIT 1') {
      assert.equal(args[0], ORG); return result(f.state.outbox.filter(r => args[1].includes(r.id) || args[2].includes(r.relay_key)).slice(0, 1).map(r => ({ id: r.id })));
    }
    if (sql === REMINDER_STORE_SQL.insertOutbox) {
      assert.equal(args.length, REMINDER_OUTBOX_COLUMNS.length); const row = Object.fromEntries(REMINDER_OUTBOX_COLUMNS.map((key, n) => [key, key === 'payload' ? JSON.parse(args[n]) : args[n]]));
      assert.equal(row.org_id, ORG); assert.equal(row.intent_kind, 'reminder'); assert.equal(row.budget_bytes, 8192);
      f.state.outbox.push(row); if (f.insertFailure) reject('insert'); return { rows: [], rowCount: 1 };
    }
    if (sql === REMINDER_STORE_SQL.cancelOwn) {
      assert.deepEqual(args, [ORG, 'own-p']); let changed = 0;
      for (const row of f.state.outbox) if (row.participation_id === args[1] && row.intent_kind === 'reminder' && row.first_attempt_at === null && ['paused', 'pending', 'leased'].includes(row.state)) { row.state = 'cancelled'; row.safe_code = 'preference_off'; row.lease_owner = null; row.lease_until = null; changed++; }
      return { rows: [], rowCount: changed };
    }
    if (sql === 'UPDATE os_participations SET reminder_consent=$3::jsonb,revision=$4,last_command=$5::jsonb,updated_at=$6::timestamptz WHERE org_id=$1 AND id=$2 AND revision=$7 AND reminder_consent IS NOT DISTINCT FROM $8::jsonb') {
      const [org, id, preference, revision, receipt, at, previous, oldPreference] = args; assert.equal(org, ORG); assert.equal(id, 'own-p');
      if (f.own.p.revision !== previous || JSON.stringify(f.own.p.reminder_consent) !== JSON.stringify(oldPreference === null ? null : JSON.parse(oldPreference))) return { rows: [], rowCount: 0 };
      f.own.p.reminder_consent = JSON.parse(preference); f.own.preference = clone(f.own.p.reminder_consent); f.own.p.revision = revision; f.own.p.last_command = JSON.parse(receipt); f.own.p.updated_at = at; return { rows: [], rowCount: 1 };
    }
    if (sql === 'INSERT INTO os_job_tenants(org_id) VALUES($1) ON CONFLICT(org_id) DO NOTHING') { assert.deepEqual(args, [ORG]); f.state.jobs = [ORG]; return { rows: [], rowCount: 1 }; }
    assert.fail('Unexpected fictional SQL: ' + sql);
  } };
  f.db = { async limit() {}, async tx(user, org, fn, options = {}) {
    f.transactions.push({ user, org, ...options }); const before = clone({ state: f.state, own: f.own }); f.readOnly = !!options.readOnly;
    let value; try { value = await fn(f.c); } catch (error) { f.state = before.state; f.own = before.own; throw error; } finally { f.readOnly = false; }
    if (!options.readOnly && f.loseCommitResponse) { f.loseCommitResponse = false; throw Error('Fictional retained commit response lost'); } return value;
  } };
  active = f; return f;
}
function ownRequest(f, enabled, key = 'fictional-choice-command-0001') { return { version: 1, revision: f.own.p.revision,
  intakeRevision: f.own.intake.revision, reminderRevision: f.own.preference?.revision ?? 0, enabled,
  consentVersion: REMINDER_METHOD, commandKey: key, ...(enabled ? { commitmentSha256: f.ownBinding.commitmentSha256 } : {}) }; }
function ownArgs(f, input) { return { org: ORG, session: ownSession, settings, intakeId: 'own-intake', participationId: 'own-p', input }; }
function adminReview(f) { return { version: 1, target: { moduleId: 'events', targetId: 'target', targetRevision: 1, sourceRevision: 3 },
  participations: f.context.items.map(item => ({ participationId: item.participationId, revision: item.participationRevision, intakeRevision: item.intakeRevision })).reverse() }; }
async function preview(f) { return f.db.tx(ADMIN, ORG, c => commands.previewParticipationReminder(c, { org: ORG, session: adminSession, settings, input: adminReview(f) }), { lock: true }); }
function scheduleArgs(previewId) { return { org: ORG, session: adminSession, settings, input: { previewId, commandKey: 'fictional-schedule-key-0001' } }; }
async function schedule(f, previewId) { return f.db.tx(ADMIN, ORG, c => commands.scheduleParticipationReminder(c, scheduleArgs(previewId)), { lock: true }); }
function request(path, body, session = adminSession) { return new Request(settings.origin + path, { method: 'POST',
  headers: { Origin: settings.origin, 'Content-Type': 'application/json', 'X-CSRF-Token': security.csrf(session.session.id, settings.secret) }, body: JSON.stringify(body) }); }

test('default mounting remains closed and malformed measured-capacity phases refuse before SQL', async () => {
  assert.equal(routes.PARTICIPATION_REMINDERS_ENABLED, false);
  const actual = await import('../lib/participation-reminder-capacity.mjs?readiness-proof');
  await assert.rejects(actual.requireReminderMeasuredCapacity({query:()=>assert.fail('No SQL for an unknown capacity phase')},ORG,{phase:'unknown'}), e => e.status === 422);
});
test('approved integer policy reserves ON room and saturates enabled OFF', () => {
  assert.deepEqual(reminderChoiceRevisions(2147483645, 2147483645, true, false), { participation: 2147483646, preference: 2147483646 });
  assert.throws(() => reminderChoiceRevisions(2147483646, 1, true, false));
  assert.deepEqual(reminderChoiceRevisions(2147483647, 1, false, true), { participation: 2147483647, preference: 2 });
  assert.throws(() => reminderChoiceRevisions(4, 0, false, false));
});
test('NULL OFF refuses before domain clock/capacity/audit/write', async () => {
  const f = fixture(); await assert.rejects(f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, ownRequest(f, false))), { lock: true }), e => e.code === 'participation_reminder_already_off');
  assert.equal(f.queries.length, 0); assert(!f.events.some(e => e.startsWith('MOCK-capacity:') || e.startsWith('audit:'))); assert.equal(f.own.p.last_command, null);
});
test('own ON stores exact original result; latest Replay bypasses later eligibility/revision/clock', async () => {
  const f = fixture(), input = ownRequest(f, true); const first = await f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, input)), { lock: true });
  assert.equal(first.reminder.enabled, true); assert.equal(first.revision, 5); assert.equal(f.own.preference.recipientSha256, security.hash(f.ownBinding.recipient.email));
  f.bindingUnavailable = true; f.noClock = true; f.own.p.revision++; const before = clone(f.state);
  const replay = await f.db.tx(OWN, ORG, c => commands.acceptedOwnReminderChoice(c, ownArgs(f, input)), { readOnly: true, lock: true });
  assert.deepEqual(replay, { ...first, replayed: true }); assert.deepEqual(f.state, before);
  await assert.rejects(commands.acceptedOwnReminderChoice(f.c, ownArgs(f, { ...input, intakeRevision: input.intakeRevision + 1 })), e => e.status === 409);
});
test('enabled OFF works with missing future binding and cancels only its unattempted reminder', async () => {
  const f = fixture(); await f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, ownRequest(f, true))), { lock: true });
  f.bindingUnavailable = true; f.auditFalse = true;
  f.state.outbox = [
    { id: 'cancel', participation_id: 'own-p', intent_kind: 'reminder', first_attempt_at: null, state: 'pending' },
    { id: 'notice', participation_id: 'own-p', intent_kind: 'transition', first_attempt_at: null, state: 'pending' },
    { id: 'attempted', participation_id: 'own-p', intent_kind: 'reminder', first_attempt_at: CREATED, state: 'unknown' },
  ];
  const input = ownRequest(f, false, 'fictional-choice-off-0002'), value = await f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, input)), { lock: true });
  assert.equal(value.reminder.enabled, false); assert.equal(value.auditRetained, false); assert.equal(f.state.outbox[0].state, 'cancelled');
  assert.equal(f.state.outbox[1].state, 'pending'); assert.equal(f.state.outbox[2].state, 'unknown');
  assert.deepEqual(Object.keys(f.own.preference), ['version', 'enabled', 'revision', 'atExact']);
});
test('new ON matching the saved exact binding must not invalidate its one-time reminder', async () => {
  const f = fixture(); await f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, ownRequest(f, true))), { lock: true });
  const before = clone(f.own), clocks = f.queries.filter(q => q.sql === CLOCK_SQL).length;
  await assert.rejects(f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, ownRequest(f, true, 'fictional-redundant-on-0002'))), { lock: true }), e => e.code === 'participation_reminder_already_enabled');
  assert.deepEqual(f.own, before); assert.equal(f.queries.filter(q => q.sql === CLOCK_SQL).length, clocks);
});
test('twenty explicit selections produce exact SQL6 preview and private address-free review', async () => {
  const f = fixture(20), value = await preview(f); assert.equal(value.review.items.length, 20);
  assert.equal(value.expiresAtExact, addTen(NOW)); assert.equal(f.state.previews[0].created_exact, NOW);
  assert.deepEqual(value.review.items.map(i => i.participationId), f.context.items.map(i => i.participationId));
  assert(!JSON.stringify(value).includes('participant@example.invalid')); assert.equal(f.state.outbox.length, 0);
});
test('schedule stores all actual rows and original receipt; later Replay has no domain clock or new identity', async () => {
  const f = fixture(2), p = await preview(f), first = await schedule(f, p.previewId);
  assert.equal(first.scheduledCount, 2); assert.equal(f.state.outbox.length, 2); assert.equal(f.state.previews[0].payload.state, 'accepted');
  for (const row of f.state.outbox) { assert.deepEqual(Object.keys(row.payload), ['state', 'participationId', 'revision', 'reminder']); assert.equal(row.next_at, row.payload.reminder.dueAtExact); assert.equal(row.budget_bytes, 8192); }
  const minted = f.minted, before = clone(f.state); f.bindingUnavailable = true; f.noClock = true; f.now = '2030-01-02T00:00:00.000000Z';
  const replay = await f.db.tx(ADMIN, ORG, c => commands.acceptedParticipationReminder(c, scheduleArgs(p.previewId)), { readOnly: true, lock: true });
  assert.deepEqual(replay, { ...first, replayed: true }); assert.equal(f.minted, minted); assert.deepEqual(f.state, before);
  const row = await readReminderScheduleForOutbox(f.c, { org: ORG, outboxId: first.scheduled[0].outboxId }); assert.equal(row.payload.receipt.actorId, ADMIN);
});
for (const auditFalse of [false, true]) test('schedule replaces pending charge before mandatory audit; fake rollback=' + auditFalse, async () => {
  const f = fixture(2), p = await preview(f), before = clone(f.state), limit = 60 * 1024 * 1024;
  f.transientAuditQuota = { base: limit - 2 * 8192 - 1001 }; f.auditFalse = auditFalse;
  if (auditFalse) {
    await assert.rejects(schedule(f, p.previewId), e => e.code === 'participation_reminder_audit');
    assert.deepEqual(f.state, before, 'Mandatory audit refusal rolls back the already-written receipt and outbox in this fake transaction');
  } else {
    const value = await schedule(f, p.previewId); assert.equal(value.scheduledCount, 2);
    assert.equal(f.state.previews[0].payload.state, 'accepted'); assert.equal(f.state.audits.length, 1);
  }
  assert.deepEqual(f.scheduleAuditWitness, { pending: 0, accepted: 1, outbox: 2, usage: limit - 1001, limit });
  assert.equal(f.transactions.at(-1).lock, true); assert(!f.transactions.at(-1).readOnly);
});
for (const failure of ['insertFailure', 'auditFalse', 'receiptRace']) test('fake atomic rollback preserves pending review on ' + failure, async () => {
  const f = fixture(2), p = await preview(f), before = clone(f.state); f[failure] = true;
  await assert.rejects(schedule(f, p.previewId)); assert.deepEqual(f.state, before, 'Fake tx rollback is not actual PostgreSQL acceptance');
});
test('final mocked capacity refusal also rolls back all retained effects', async () => {
  const f = fixture(), p = await preview(f), before = clone(f.state); f.capacityFail = 'schedule-final';
  await assert.rejects(schedule(f, p.previewId)); assert.deepEqual(f.state, before);
});
test('changed selected proof refuses before new clock or identity', async () => {
  const f = fixture(), p = await preview(f), minted = f.minted; f.context.items[0].participationRevision++;
  const before = f.queries.filter(q => q.sql === CLOCK_SQL).length;
  await assert.rejects(schedule(f, p.previewId), e => e.code === 'participation_reminder_stale');
  assert.equal(f.minted, minted); assert.equal(f.queries.filter(q => q.sql === CLOCK_SQL).length, before);
});
test('route lost fictional retention response reconciles exact original result without second insert', async () => {
  const f = fixture(), p = await preview(f); f.loseCommitResponse = true;
  const body = scheduleArgs(p.previewId).input, path = '/api/orgs/' + ORG + '/participation-reminders/schedule';
  const response = await routes.participationReminderRoutes({ request: request(path, body), db: f.db, settings, session: adminSession });
  assert.equal(response.status, 200); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const value = await response.json(); assert.equal(value.replayed, true); assert.equal(f.state.outbox.length, 1);
  const minted = f.minted;
  const again = await routes.participationReminderRoutes({ request: request(path, body), db: f.db, settings, session: adminSession });
  assert.equal((await again.json()).replayed, true); assert.equal(f.minted, minted); assert.equal(f.state.outbox.length, 1);
});
test('denied current route authorization precedes body, clock and mutation', async () => {
  const f = fixture(); f.unauthorized = true;
  await assert.rejects(routes.participationReminderRoutes({ request: request('/api/orgs/' + ORG + '/participation-reminders/preview', adminReview(f)), db: f.db, settings, session: adminSession }), e => e.status === 403);
  assert.equal(f.queries.length, 0); assert.equal(f.minted, 0); assert.equal(f.state.previews.length, 0);
});

for (const change of ['new-original', 'new-link']) test('stale binding permits explicit ON for ' + change, async () => {
  const f = fixture(); await f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, ownRequest(f, true))), { lock: true });
  if (change === 'new-original') {
    f.ownBinding.commitment.confirmedAtExact = '2029-12-27T00:00:00.000002Z';
    f.ownBinding.commitmentSha256 = reminderCommitmentSha256(f.ownBinding.commitment);
  } else f.ownBinding.recipient.linkRevision++;
  const value = await f.db.tx(OWN, ORG, c => commands.changeOwnReminderChoice(c, ownArgs(f, ownRequest(f, true, 'fictional-fresh-reoptin-0002'))), { lock: true });
  assert.equal(value.reminder.enabled, true); assert.equal(value.revision, 6); assert.equal(value.reminder.revision, 2);
  assert.equal(f.state.outbox.length, 0, 'A fresh choice still queues nothing');
});
