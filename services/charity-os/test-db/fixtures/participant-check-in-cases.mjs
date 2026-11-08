/** The same thirteen actual SQL assertions; version authority comes from the adapter. */
import test from "node:test";
import assert from "node:assert/strict";
import { assembleWorkspaceBackup, checkWorkspaceExportCapacity } from "../../lib/workspace-backup.mjs";
import { measureLearningRestoreCapacity } from "../../lib/learning-capacity.mjs";
import { exportParticipation } from "../../lib/participation-backup.mjs";
import { checkInQuota, insertCheckIn, loadCheckInInventory } from "../../lib/participant-check-in-store.mjs";
import { restoredParticipantCheckins, restoreParticipantCheckins } from "../../lib/participant-check-in-backup.mjs";
import { makeCheckInBackup, checkInClaimSha256 } from "../../lib/participant-check-in-model.mjs";
import { checkCheckInCapacity, checkCombinedCheckInCapacity } from "../../lib/participant-check-in-capacity.mjs";
import { checkParticipationExportCapacity } from "../../lib/participation-capacity.mjs";
import { logicalBackupBytes } from "../../lib/database.mjs";
import { makeBackup } from "../../lib/backup.mjs";

export function registerParticipantCheckInCases({ withCheckInFixture, cleanupCount, cleanupsAfter }) {
const names = [];
const pgCase = (name, run) => { names.push(name); return test(name, { timeout: 300000, concurrency: false }, async t => { const before = cleanupCount(); try { await withCheckInFixture(run); } finally { const receipts = cleanupsAfter(before); for (const cleanup of receipts) t.diagnostic(JSON.stringify({kind:"owned-schema-cleanup",...cleanup})); if (!receipts.length) t.diagnostic("No current-case cleanup receipt; no resource-cleanup success inferred."); } }); };
const ownRoot = (f, s) => `/api/participant/orgs/${f.org}/requests/${s.candidate.intakeId}`;
const staffPath = (f, s) => `/api/orgs/${f.org}/participation-targets/${s.target.id}/participations/${s.pid}/check-in`;
const sqlState = state => error => error?.code === state;
async function cancel(f, s) {
  const current = await f.current(s);
  return f.api(ownRoot(f, s) + `/participations/${s.pid}/cancel`, { body: { revision: current.revision, intakeRevision: current.intakeRevision, idempotencyKey: f.key() } });
}
async function emptyOrg(f, org) {
  await f.tx(async c => {
    await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional recovered check-in',$1,'USD','UTC')", [org]);
    await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')", [org, f.staff]);
  }, { org, write: true });
}
const rawCount = (f, org = f.org) => f.tx(async c => Number((await c.query("SELECT count(*) AS n FROM os_participation_checkins WHERE org_id=$1", [org])).rows[0].n), { org });

pgCase("checkin PG01: constrained grants, forced tenant RLS and one terminal transition", async f => {
  const s = await f.seed(), sent = await f.report(s), id = sent.value.result.id;
  const catalog = await f.tx(async c => (await c.query("SELECT t.relforcerowsecurity,p.prosecdef,has_table_privilege(current_user,t.oid,'SELECT') AS can_read,has_table_privilege(current_user,t.oid,'INSERT') AS can_insert,has_table_privilege(current_user,t.oid,'UPDATE') AS table_update,has_table_privilege(current_user,t.oid,'DELETE') AS can_delete,has_table_privilege(current_user,t.oid,'TRUNCATE') AS can_truncate,has_table_privilege(current_user,t.oid,'TRIGGER') AS can_trigger,has_column_privilege(current_user,t.oid,'history','UPDATE') AS history_update,has_column_privilege(current_user,t.oid,'revision','UPDATE') AS revision_update FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_trigger g ON g.tgrelid=t.oid AND g.tgname='terminal_checkin' JOIN pg_proc p ON p.oid=g.tgfoid WHERE n.nspname=current_schema() AND t.relname='os_participation_checkins'")).rows[0]);
  assert.equal(catalog.relforcerowsecurity, true); assert.equal(catalog.prosecdef, false);
  for (const k of ["can_read", "can_insert", "revision_update"]) assert.equal(catalog[k], true);
  for (const k of ["table_update", "can_delete", "can_truncate", "can_trigger", "history_update"]) assert.equal(catalog[k], false);
  for (const org of [null, "different_org"]) assert.equal(await f.db.tx(null, org, async c => Number((await c.query("SELECT count(*) n FROM os_participation_checkins")).rows[0].n), { readOnly: true }), 0);
  await assert.rejects(f.tx(c => c.query("UPDATE os_participation_checkins SET history=history WHERE org_id=$1 AND id=$2", [f.org, id]), { write: true }), sqlState("42501"));
  await assert.rejects(f.tx(c => c.query("DELETE FROM os_participation_checkins WHERE org_id=$1 AND id=$2", [f.org, id]), { write: true }), sqlState("42501"));
  await assert.rejects(f.tx(c => c.query("UPDATE os_participation_checkins SET revision=1 WHERE org_id=$1 AND id=$2", [f.org, id]), { write: true }), sqlState("P0001"));
  const old = (await f.current(s)).report;
  await f.api(s.path + "/withdraw", { body: f.withdrawBody(old) });
  await assert.rejects(f.tx(c => c.query("UPDATE os_participation_checkins SET withdrawn_at=NULL WHERE org_id=$1 AND id=$2", [f.org, id]), { write: true }), sqlState("P0001"));
});

pgCase("checkin PG02: actual handler refuses anonymous, foreign-link, foreign-org and CSRF access", async f => {
  const s = await f.seed(); await f.report(s);
  for (const user of ["anonymous", "fictional-foreign"]) {
    const error = await f.api(s.path, { user, expect: user === "anonymous" ? 401 : 404 });
    assert(!JSON.stringify(error).includes("claimedArrivalAt")); assert(!JSON.stringify(error).includes("claimSha256"));
  }
  await f.api(s.path.replace(f.org, "different_org"), { expect: 404 });
  const bad = await f.api(s.path + "/report", { body: await f.reportBody(s), headers: { "x-csrf-token": "wrong" }, expect: 403 });
  assert.equal(bad.code, "csrf"); assert.equal(await rawCount(f), 1);
});

pgCase("checkin PG03: SQL-current whole and confirmed-interval reports never become attendance or work", async f => {
  const whole = await f.seed({ moduleId: "events", name: "whole" }), partial = await f.seed({ interval: true, name: "partial" });
  const before = await f.domain();
  for (const s of [whole, partial]) {
    const sent = await f.report(s); assert.equal(sent.value.result.action, "reported");
    assert.equal(sent.value.currentDisposition.attendance, null); assert.equal(sent.value.currentDisposition.workedMinutes, null); assert.equal(sent.value.currentDisposition.staffReview, "not-recorded");
    const v = await f.current(s); assert.equal(v.report.claimedArrivalAt, s.a); assert.equal(v.report.currentDisposition.state, "reported");
    if (s.range) assert.deepEqual(v.context.effectiveRange, { startAt: s.range.startAt, endAt: s.range.endAt, timeZone: s.range.timeZone });
  }
  const after = await f.domain(); assert.deepEqual(after.os_participations, before.os_participations); assert.deepEqual(after.os_records, before.os_records);
  assert.deepEqual(after.os_participation_outbox, before.os_participation_outbox); assert.deepEqual(after.os_jobs, before.os_jobs); assert.deepEqual(after.os_job_tenants, before.os_job_tenants);
});

pgCase("checkin PG04: own GET/resolve is SQL read-only and strict raw intake retains no authority", async f => {
  const s = await f.seed(), before = await f.domain(); f.observations.length = 0;
  const v = await f.current(s);
  const resolved = await f.api(s.path + "/resolve-arrival", { body: { revision: v.revision, intakeRevision: v.intakeRevision, commitmentSha256: v.context.commitmentSha256, civil: s.a.slice(0, 23), resolution: null } });
  assert.equal(resolved.kind, "unique"); assert.equal(resolved.claimedArrivalAt, s.a);
  assert(f.observations.length >= 4 && f.observations.every(x => x.readOnly && x.sqlReadOnly));
  assert.deepEqual(await f.domain(), before);
  await f.api(s.path + "/report", { rawBody: '{"revision":1,"\\u0072evision":2}', expect: 422 });
  await f.api(s.path + "/report", { rawBody: Uint8Array.from([123,34,120,34,58,34,255,34,125]), expect: 422 });
  await f.api(s.path + "/report", { rawBody: " ".repeat(4097), expect: 413 });
  assert.equal(await rawCount(f), 0);
});

pgCase("checkin PG05: ignored successful report/withdraw responses reconcile exactly after cancellation", async f => {
  const s = await f.seed(), accepted = await f.report(s); // response deliberately ignored by the simulated caller, not a wire-loss claim
  const first = await f.current(s), body = f.withdrawBody(first.report);
  const withdrawn = await f.api(s.path + "/withdraw", { body }); await cancel(f, s);
  const before = await f.domain();
  const reportRetry = await f.api(s.path + "/report", { body: accepted.body }), withdrawalRetry = await f.api(s.path + "/withdraw", { body });
  assert.equal(reportRetry.replayed, true); assert.deepEqual(reportRetry.result, accepted.value.result); assert.equal(reportRetry.currentDisposition.state, "withdrawn");
  assert.equal(withdrawalRetry.replayed, true); assert.deepEqual(withdrawalRetry.result, withdrawn.result);
  assert.deepEqual(await f.domain(), before); // auth/rate bookkeeping is deliberately outside this domain comparison
});

pgCase("checkin PG06: altered/duplicate intent refuses and permanent own unlink removes Replay access", async f => {
  const s = await f.seed(), accepted = await f.report(s);
  const changed = await f.api(s.path + "/report", { body: { ...accepted.body, claimedArrivalAt: s.s }, expect: 409 }); assert.equal(changed.code, "checkin_intent");
  await f.api(s.path + "/report", { body: { ...accepted.body, idempotencyKey: f.key() }, expect: 409 });
  const v = await f.current(s); await f.api(ownRoot(f, s) + "/unlink", { body: { revision: v.intakeRevision } });
  await f.api(s.path, { expect: 404 }); await f.api(s.path + "/report", { body: accepted.body, expect: 404 }); assert.equal(await rawCount(f), 1);
});

pgCase("checkin PG07: parent loss keeps own withdrawal while current staff scope stays private", async f => {
  const s = await f.seed({ programId: "fictional_program_A" }); await f.report(s);
  await f.owner(c => c.query("UPDATE os_members SET program_ids=$3::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2", [f.org, f.staff, JSON.stringify(["different_program"])]));
  await f.api(staffPath(f, s), { user: f.staff, expect: 404 }); await f.api(staffPath(f, s), { user: "fictional-reader", expect: 403 });
  await f.owner(c => c.query("UPDATE os_members SET program_ids='[]'::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2", [f.org, f.staff]));
  assert((await f.api(staffPath(f, s), { user: f.staff })).report);
  await cancel(f, s); // existing ordinary safety route, not a synthetic check-in state mutation
  await f.owner(c => c.query("UPDATE os_records SET deleted_at=clock_timestamp() WHERE org_id=$1 AND id=$2", [f.org, s.candidate.record.id]));
  const v = await f.current(s); assert.equal(v.context, null); assert.equal(v.canWithdraw, true);
  await f.api(s.path + "/withdraw", { body: f.withdrawBody(v.report) }); await f.api(staffPath(f, s), { user: f.staff, expect: 404 });
});

pgCase("checkin PG08: actual full-backup restore/re-export retains only inactive orphan-capable history", async f => {
  const s = await f.seed(); await f.report(s); const v = await f.current(s); await f.api(s.path + "/withdraw", { body: f.withdrawBody(v.report) });
  const backup = await f.api(`/api/orgs/${f.org}/export`, { user: f.staff });
  const destination = "checkin-destination"; await emptyOrg(f, destination);
  const preview = await f.api(`/api/orgs/${destination}/import/preview`, { user: f.staff, body: { backup } }); assert.equal(preview.summary.participantCheckinsRecovered, 1);
  await f.api(`/api/orgs/${destination}/import/commit`, { user: f.staff, body: { previewId: preview.previewId } });
  const exported = await f.api(`/api/orgs/${destination}/export`, { user: f.staff }); assert.deepEqual(exported.participantCheckins, backup.participantCheckins);
  const rows = await f.tx(c => c.query("SELECT * FROM os_participation_checkins WHERE org_id=$1", [destination]), { org: destination });
  assert.equal(rows.rows[0].origin_mode, "recovered"); for (const key of ["live_participation_id", "report_receipt", "withdrawn_at", "withdrawal_receipt"]) assert.equal(rows.rows[0][key], null);
  assert.equal(Number((await f.tx(c => c.query("SELECT count(*) n FROM os_participant_links WHERE org_id=$1", [destination]), { org: destination })).rows[0].n), 0);
  const orphan = "checkin-orphan-destination"; await emptyOrg(f, orphan);
  await f.tx(c => restoreParticipantCheckins(c, orphan, backup.participantCheckins), { org: orphan, write: true });
  assert.equal((await f.tx(c => c.query("SELECT count(*) n FROM os_records WHERE org_id=$1", [orphan]), { org: orphan })).rows[0].n, "0");
  assert.deepEqual((await f.tx(c => assembleWorkspaceBackup(c, orphan), { org: orphan })).participantCheckins, backup.participantCheckins);
});

pgCase("checkin PG09: actual SQL/native and inactive composite measures compose without duplicate live restore reserve", async f => {
  const s = await f.seed();
  const absent = await f.api(`/api/orgs/${f.org}/export`, { user: f.staff });
  assert.equal(Object.hasOwn(absent, "participantCheckins"), false);
  const { format, version, schemaVersion, organization, createdAt, records, checksum, ...extras } = absent;
  const empty = makeBackup({ name: organization.name, currency: organization.currency, time_zone: organization.timeZone }, records, { ...extras, participantCheckins: { version: 1, entries: [] } });
  for (const [name, input, present] of [["absent-counter-destination", absent, false], ["empty-counter-destination", empty, true]]) {
    await emptyOrg(f, name);
    const v = await f.api(`/api/orgs/${name}/import/preview`, { user: f.staff, body: { backup: input } });
    assert.equal(Object.hasOwn(v.summary, "participantCheckinsRecovered"), present);
    if (present) assert.equal(v.summary.participantCheckinsRecovered, 0);
  }
  await f.report(s);
  const backup = await f.tx(c => assembleWorkspaceBackup(c, f.org));
  const measured = await f.tx(c => measureLearningRestoreCapacity(c, backup));
  const source = await f.tx(c => checkWorkspaceExportCapacity(c, f.org));
  const physical = await f.tx(c => checkInQuota(c, f.org)), checkins = await f.tx(c => checkCheckInCapacity(c, f.org));
  const participation = await f.tx(c => checkParticipationExportCapacity(c, f.org, { legacySafety: true }));
  assert.equal(source.backupBytes, Buffer.byteLength(JSON.stringify(backup))); assert(physical.bytes > Buffer.byteLength(JSON.stringify(backup.participantCheckins)));
  assert(measured.categories.os_participation_checkins.bytes > 0); assert.equal(checkins.pendingWithdrawals, 1);
  checkCombinedCheckInCapacity(source, checkins, participation);
  const dest = "measure-checkin-destination"; await emptyOrg(f, dest);
  await f.tx(c => restoreParticipantCheckins(c, dest, backup.participantCheckins), { org: dest, write: true });
  const recovered = await f.tx(c => checkCheckInCapacity(c, dest), { org: dest }); assert.equal(recovered.pendingWithdrawals, 0); assert.equal(recovered.retainedGrowth, 0);
});

pgCase("checkin PG10: concurrent exact duplicate report/withdraw produce one durable result each", async f => {
  const s = await f.seed(), body = await f.reportBody(s);
  const created = await Promise.all([f.api(s.path + "/report", { body }), f.api(s.path + "/report", { body })]);
  assert.deepEqual(created[0].result, created[1].result); assert.deepEqual(created.map(v => v.replayed).sort(), [false, true]); assert.equal(await rawCount(f), 1);
  const withdrawal = f.withdrawBody((await f.current(s)).report);
  const done = await Promise.all([f.api(s.path + "/withdraw", { body: withdrawal }), f.api(s.path + "/withdraw", { body: withdrawal })]);
  assert.deepEqual(done[0].result, done[1].result); assert.equal((await f.current(s)).checkInRevision, 2);
  assert.equal(Number((await f.tx(c => c.query("SELECT count(*) n FROM os_events WHERE org_id=$1 AND action='participant-checkin.withdrawn'", [f.org]))).rows[0].n), 1);
  const second = await f.seed({ name: "revoked" }), secondBody = await f.reportBody(second), lock = await f.db.pool.connect();
  let committed = false, pending;
  try {
    await lock.query("BEGIN");
    await lock.query("SELECT set_config('app.org_id',$1,true),set_config('app.user_id',$2,true)", [f.org, f.ownSession.user.id]);
    await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [f.org]);
    pending = f.api(second.path + "/report", { body: secondBody, expect: 404 });
    let waiting = false;
    // Bounded lock observation, not a sleep or clock-authority override.
    for (let i = 0; i < 100 && !waiting; i++) waiting = (await lock.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND pid<>pg_backend_pid() AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS waiting")).rows[0].waiting;
    assert.equal(waiting, true);
    await lock.query("UPDATE os_participant_links SET revoked_at=clock_timestamp(),revision=revision+1 WHERE user_id=$1 AND org_id=$2 AND intake_id=$3", [f.ownSession.user.id, f.org, second.candidate.intakeId]);
    await lock.query("COMMIT"); committed = true; await pending;
  } finally { if (!committed) { try { await lock.query("ROLLBACK"); } catch {} } lock.release(); if (pending) await pending; }
  assert.equal(await rawCount(f), 1);
});

pgCase("checkin PG11: genuine current SQL windows and separately labeled fixed-clock operator witness", async f => {
  const future = await f.seed({ window: "future", name: "future" }), expired = await f.seed({ window: "expired", name: "expired" });
  for (const s of [future, expired]) {
    const v = await f.current(s); assert.equal(v.canReport, false);
    const body = await f.reportBody(s); body.claimedArrivalAt = s.s;
    const error = await f.api(s.path + "/report", { body, expect: 409 }); assert.equal(error.code, "checkin_window");
  }
  // CONSTANT-CLOCK SQL OPERATOR WITNESS ONLY. No product clock or global Date
  // is replaced, and this does not claim a handler hit an exact wall instant.
  const bounds = await f.tx(async c => (await c.query("WITH v(s,e) AS(VALUES('2026-11-07T10:00:00Z'::timestamptz,'2026-11-07T11:00:00Z'::timestamptz)), instants(n,expected) AS(VALUES('2026-11-07T10:00:00Z'::timestamptz,true),('2026-11-08T11:00:00Z'::timestamptz,true),('2026-11-08T11:00:00.000001Z'::timestamptz,false),('2026-11-07T09:59:59.999999Z'::timestamptz,false)) SELECT bool_and((n>=s AND n<=e+86400000*interval '1 millisecond')=expected) AS exact FROM v CROSS JOIN instants")).rows[0]);
  assert.equal(bounds.exact, true); assert.equal(await rawCount(f), 0);
});

pgCase("checkin PG12: actual genuine-v2 first activation reserve protects legacy safety and exit", async f => {
  const s = await f.seed(); assert.equal((await f.tx(c => exportParticipation(c, f.org))).version, 2);
  const baseline = await f.stats(), cap = 60 * 1024 * 1024;
  // Structurally valid old immutable journal budget witness, inserted by the
  // fixture owner; not a claim that a current authoring control wrote 60 MiB.
  const pad = Math.max(0, cap - baseline.logicalBytes - 3000);
  await f.owner(c => c.query("INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fixture.historical',jsonb_build_object('preserved',repeat('x',$3::int)))", [f.org, f.staff, pad]));
  const near = await f.stats(); assert(near.logicalBytes < cap); assert(near.nativeBytes <= 64 * 1024 * 1024);
  const body = await f.reportBody(s); await f.api(s.path + "/report", { body, expect: 422 }); assert.equal(await rawCount(f), 0);
  assert.equal((await f.api(`/api/orgs/${f.org}/export`, { user: f.staff })).participation.version, 2);
  await cancel(f, s);
  const now = await f.current(s);
  await f.api(ownRoot(f, s) + `/participations/${s.pid}/preferences`, { body: { revision: now.revision, intakeRevision: now.intakeRevision, emailUpdates: false, idempotencyKey: f.key() } });
  assert.equal((await f.api(`/api/orgs/${f.org}/export`, { user: f.staff })).participation.version, 2);
  // Positive activation is in a separate clean fixture in PG03/PG09. No event
  // is deleted or truncated to turn this near-cap negative into a positive.
});

pgCase("checkin PG13: valid inactive-history count high-water and 2001st-row rollback, not fabricated row padding", async f => {
  const s = await f.seed(); await f.report(s);
  const original = (await f.tx(c => loadCheckInInventory(c, f.org))).records[0];
  const entries = Array.from({ length: 2000 }, (_, i) => {
    const history = { ...original.history, id: "history-" + i, participationId: "historical-parent-" + i, claimSha256: "0".repeat(64) };
    history.claimSha256 = checkInClaimSha256(history); return { id: history.id, history };
  });
  const family = { version: 1, entries }, destination = "checkin-count-highwater"; await emptyOrg(f, destination);
  const recovered = restoredParticipantCheckins(family); assert.equal(recovered.length, 2000);
  await f.tx(c => restoreParticipantCheckins(c, destination, family), { org: destination, write: true });
  const actual = await f.tx(c => checkInQuota(c, destination), { org: destination }); assert.equal(actual.count, 2000); assert(actual.bytes <= 4194304); assert(actual.max_bytes < 8192);
  const nextHistory = { ...original.history, id: "history-extra", participationId: "historical-parent-extra", claimSha256: "0".repeat(64) }; nextHistory.claimSha256 = checkInClaimSha256(nextHistory);
  const extra = restoredParticipantCheckins({ version: 1, entries: [{ id: nextHistory.id, history: nextHistory }] })[0];
  await assert.rejects(f.tx(async c => { await insertCheckIn(c, destination, extra, s.a); await checkInQuota(c, destination); }, { org: destination, write: true }), e => e.code === "checkin_limit");
  assert.equal(await rawCount(f, destination), 2000);
  const reexport = await f.tx(c => assembleWorkspaceBackup(c, destination), { org: destination }); assert.deepEqual(reexport.participantCheckins, makeCheckInBackup([...recovered].sort((a, b) => a.history.id < b.history.id ? -1 : a.history.id > b.history.id ? 1 : 0)));
  // Actual measured bounds are asserted above. This proves a
  // valid count high-water, not an attained 8192-row or exact4MiB boundary.
});

return Object.freeze(names);
}
