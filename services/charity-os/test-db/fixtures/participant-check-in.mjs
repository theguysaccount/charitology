/** Actual handler and SQL with explicitly fictional sessions and historical seeds. */
import assert from "node:assert/strict";
import { withIntervalFixture } from "./participation-intervals.mjs";
import { requireCheckInCi17Profile } from "./participant-check-in-ci17-profile.mjs";
import { createHandler } from "../../lib/handler.mjs";
import { participationTerms, participationAllocationHash } from "../../lib/participation.mjs";
import { csrf, hash } from "../../lib/security.mjs";
import { logicalBackupBytes, saveRecord, allRecords } from "../../lib/database.mjs";
import { validateRecord } from "../../lib/modules.mjs";
import { assembleWorkspaceBackup } from "../../lib/workspace-backup.mjs";

export function makeParticipantCheckInFixture(profile) {
requireCheckInCi17Profile(profile);
// No raw driver/client/config/assertion values escape the test wrapper.
const safeFailure = error => {
  const code = error?.code === "ERR_ASSERTION" ? "ASSERTION" : /^[0-9A-Z]{5}$/.test(error?.code || "") ? "SQLSTATE_" + error.code : "REFUSAL";
  return Error("CHECKIN_PG_CASE_" + code);
};
async function withCheckInFixture(run) {
  try {
    return await withIntervalFixture(async f => {
      const observations = [], actors = new Map([
        [f.ownSession.user.id, f.ownSession],
        [f.staff, { user: { id: f.staff, email: "staff@example.invalid", emailVerified: true }, session: { id: "fictional-staff-session" } }],
        ["fictional-reader", { user: { id: "fictional-reader", email: "reader@example.invalid", emailVerified: true }, session: { id: "fictional-reader-session" } }],
        ["fictional-foreign", { user: { id: "fictional-foreign", email: "foreign@example.invalid", emailVerified: true }, session: { id: "fictional-foreign-session" } }],
        ["anonymous", null],
      ]);
      const tracked = { ...f.db, tx: (user, org, callback, options) => f.db.tx(user, org, async c => {
        const state = (await c.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0].read_only;
        observations.push({ org, readOnly: options?.readOnly === true, sqlReadOnly: state === "on" });
        return callback(c);
      }, options) };
      const handlers = new Map();
      const settings = { ...f.settings, production: false, participationDeliveryEnabled: false, participationTestOnly: true };
      const allowed = /^\/api\/(?:participant\/orgs\/[A-Za-z0-9_-]+\/requests\/[A-Za-z0-9_-]+(?:\/(?:unlink|participations(?:\/[A-Za-z0-9_-]+\/(?:check-in(?:\/(?:report|withdraw|resolve-arrival))?|cancel|preferences))?))?|orgs\/[A-Za-z0-9_-]+\/(?:export|import\/(?:preview|commit)|participation-targets\/[A-Za-z0-9_-]+\/participations\/[A-Za-z0-9_-]+\/check-in))$/;
      async function api(path, { body, rawBody, user = f.ownSession.user.id, expect = 200, headers: supplied = {} } = {}) {
        assert(allowed.test(path)); assert(actors.has(user));
        if (!handlers.has(user)) handlers.set(user, createHandler({ settings, db: tracked,
          auth: { api: { getSession: async () => actors.get(user) } },
          send: async () => { throw Error("NO_MAIL_PROVIDER_IN_CHECKIN_FIXTURE"); } }));
        const session = actors.get(user), method = body === undefined && rawBody === undefined ? "GET" : "POST";
        const headers = { "x-forwarded-for": "198.51.100.91", ...supplied };
        if (method === "POST") Object.assign(headers, { origin: settings.origin, "content-type": "application/json", "x-csrf-token": session ? csrf(session.session.id, settings.secret) : "fictional-anonymous" }, supplied);
        const response = await handlers.get(user)(new Request(settings.origin + path, { method, headers, ...(method === "POST" ? { body: rawBody ?? JSON.stringify(body) } : {}) }));
        const value = await response.json(); assert.equal(response.status, expect, "actual-handler status"); return value;
      }
      const tx = (fn, { org = f.org, user = f.staff, write = false } = {}) => f.db.tx(user, org, fn, { lock: write, readOnly: !write });
      const owner = async fn => {
        const c = await f.migration.pool.connect();
        try { await c.query("BEGIN"); const result = await fn(c); await c.query("COMMIT"); return result; }
        catch (e) { try { await c.query("ROLLBACK"); } catch {} throw e; }
        finally { c.release(); }
      };
      async function seed({ moduleId = "volunteers", interval = false, window = "current", name = "one", programId = null } = {}) {
        const clock = await tx(async c => (await c.query("WITH instant AS MATERIALIZED(SELECT clock_timestamp() n) SELECT to_char(date_trunc('milliseconds',n-interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') s,to_char(date_trunc('milliseconds',n+interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') e,to_char(date_trunc('milliseconds',n-interval '5 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') a,to_char(date_trunc('milliseconds',n-interval '2 hours') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') before FROM instant")).rows[0]);
        const start = window === "future" ? new Date(Date.parse(clock.e) + 3600000).toISOString() : window === "expired" ? new Date(Date.parse(clock.s) - 3 * 86400000).toISOString() : clock.s;
        const end = window === "future" ? new Date(Date.parse(start) + 3600000).toISOString() : window === "expired" ? new Date(Date.parse(start) + 3600000).toISOString() : clock.e;
        const originalBefore = new Date(Math.min(Date.parse(clock.before), Date.parse(start) - 3600000)).toISOString();
        const target = await f.makeTarget("checkin-target-" + name, moduleId, 4, start, end, interval);
        const candidate = await f.makeCandidate("checkin-booking-" + name, target, "checkin-contact-" + name, { withIntake: true });
        if (programId) {
          await tx(async c => {
            const records = await allRecords(c, f.org);
            if (!records.some(r => r.id === programId)) await saveRecord(c, { id: programId, orgId: f.org, moduleId: "programs", status: "draft", revision: 1, ownerId: f.staff, lastEditedBy: f.staff, approval: null, snapshot: null, source: null,
              data: validateRecord("programs", { title: "Fictional program", kind: "program" }, { records, orgId: f.org, recordId: programId, status: "draft" }) });
          }, { write: true });
          await owner(c => c.query("UPDATE os_records SET data=jsonb_set(data,'{programId}',to_jsonb($3::text)) WHERE org_id=$1 AND id=ANY($2::text[])", [f.org, [target.id, candidate.record.id], programId]));
          target.data.programId = programId; candidate.record.data.programId = programId;
        }
        const terms = participationTerms(target), termsHash = hash(terms), pid = "checkin-participation-" + name;
        const range = interval ? { version: 1, startAt: new Date(Date.parse(start) + 15 * 60000).toISOString(), endAt: new Date(Date.parse(end) - 15 * 60000).toISOString(), timeZone: "UTC" } : null;
        const allocationHash = range ? participationAllocationHash(target.id, target.revision, termsHash, range) : null;
        const candidateApproval = { ...candidate.record.approval, reason: "Declared fictional historical approval", at: originalBefore };
        const frozen = { terms, sourceRevision: target.revision, termsHash, candidateRevision: candidate.record.revision, candidateApproval, programId, ...(range ? { interval: range, allocationHash } : {}) };
        const consent = { revision: 2, sourceRevision: target.revision, termsHash, at: originalBefore, waitlistAllowed: false, emailUpdates: false, method: "verified-participant", evidenceRef: null, actorHash: hash(f.ownSession.user.id), recipientHash: hash(f.ownSession.user.email), withdrawalAcknowledged: false,
          ...(terms.intervalPolicy ? { terms } : {}), ...(range ? { allocationHash } : {}) };
        // Historical confirmations are fixture facts, never an attempt to call
        // the real pre-start confirmation route after its start time.
        await owner(async c => {
          await c.query("UPDATE os_records SET approval=$3::jsonb WHERE org_id=$1 AND id=$2", [f.org, candidate.record.id, JSON.stringify(candidateApproval)]);
          await c.query("UPDATE os_records SET created_at=$2,updated_at=$2 WHERE org_id=$1", [f.org, originalBefore]);
          await c.query("UPDATE os_intake SET created_at=$2,updated_at=$2,consent_at=$2 WHERE org_id=$1 AND id=$3", [f.org, originalBefore, candidate.intakeId]);
          await c.query("UPDATE os_publications SET created_at=$2 WHERE org_id=$1", [f.org, originalBefore]);
          await c.query("UPDATE os_participant_links SET created_at=$2,updated_at=$2 WHERE org_id=$1", [f.org, originalBefore]);
          await c.query("INSERT INTO os_participation_targets(org_id,target_id,module_id,revision,mode,source_revision,terms,terms_hash,recovery_block,created_by,created_at,updated_at) VALUES($1,$2,$3,1,'paused',$4,$5::jsonb,$6,false,$7,$8,$8)", [f.org, target.id, moduleId, target.revision, JSON.stringify(terms), termsHash, f.staff, originalBefore]);
          await c.query("INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,state,revision,source,consent,frozen,requested_interval,created_by,confirmed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'confirmed',3,'intake',$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$12,$12)", [f.org, pid, target.id, moduleId, candidate.record.id, candidate.record.data.contactId, candidate.intakeId, JSON.stringify(consent), JSON.stringify(frozen), range ? JSON.stringify(range) : null, f.staff, originalBefore]);
        });
        const path = `/api/participant/orgs/${f.org}/requests/${candidate.intakeId}/participations/${pid}/check-in`;
        return { ...clock, before: originalBefore, target, candidate, pid, path, range, frozen };
      }
      const current = s => api(s.path);
      const reportBody = async (s, key = f.key()) => { const v = await current(s); assert(v.context); return { revision: v.revision, intakeRevision: v.intakeRevision, checkInRevision: 0, commitmentSha256: v.context.commitmentSha256, claimedArrivalAt: s.a, reportConsent: true, consentVersion: "arrival-self-report-v1", idempotencyKey: key }; };
      const report = async s => { const body = await reportBody(s); return { body, value: await api(s.path + "/report", { body }) }; };
      const withdrawBody = summary => ({ checkInRevision: summary.currentDisposition.revision, reportSha256: summary.claimSha256, withdraw: true, idempotencyKey: f.key() });
      const domain = () => tx(async c => {
        const result = {};
        for (const table of ["os_records", "os_participations", "os_participation_checkins", "os_events", "os_participation_outbox", "os_jobs", "os_job_tenants"])
          result[table] = (await c.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) value FROM ${table} t WHERE org_id=$1`, [f.org])).rows[0].value;
        return result;
      });
      const stats = () => tx(async c => ({ logicalBytes: await logicalBackupBytes(c, f.org), nativeBytes: Buffer.byteLength(JSON.stringify(await assembleWorkspaceBackup(c, f.org))) }));
      await run({ ...f, api, tx, owner, seed, current, reportBody, report, withdrawBody, domain, stats, observations, hash });
    }, { checkInCi17: profile });
  } catch (error) { throw safeFailure(error); }
}

return Object.freeze({ withCheckInFixture, cleanupCount: profile.cleanupCount, cleanupsAfter: profile.cleanupsAfter });
}
