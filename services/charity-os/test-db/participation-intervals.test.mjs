import { readFile } from "node:fs/promises";
import { logicalBackupBytes as oldLogicalBackupBytes } from "./fixtures/legacy-participation-accounting.mjs";
import {
  participationVersion,
  PARTICIPATION_LEGACY_SQL,
  participationChargeJsonSQL,
  participationIntervalChargeJsonSQL,
  PARTICIPATION_REMINDER_LEGACY_SQL,
} from "../lib/participation-storage.mjs";
import { buildLearningFixture } from "../test/learning-fixtures.mjs";
import { restoreLearningBridge } from "../lib/learning-backup.mjs";
import { restoredIntake, restoreIntake } from "../lib/intake-backup.mjs";
import { learningWriteCapability } from "../lib/learning-guards.mjs";
import {
  assembleWorkspaceBackup,
  checkWorkspaceExportCapacity,
} from "../lib/workspace-backup.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { measureLearningRestoreCapacity } from "../lib/learning-capacity.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  configured,
  withIntervalFixture,
} from "./fixtures/participation-intervals.mjs";
import {
  allRecords,
  saveRecord,
  audit,
  logicalBackupBytes,
  noteParticipationReceiptReplay,
} from "../lib/database.mjs";
import {
  PARTICIPATION_SAFETY_RESERVE,
  checkParticipationExportCapacity,
} from "../lib/participation-capacity.mjs";
import { participationQuota } from "../lib/participation.mjs";
import { validateRecord, MODULE_MAP } from "../lib/modules.mjs";
import { participationValidationContext } from "../lib/participation-guards.mjs";
import { participationTerms } from "../lib/participation.mjs";
import {
  exportParticipation,
  restoredParticipation,
  restoreParticipation,
} from "../lib/participation-backup.mjs";
import { hash, csrf } from "../lib/security.mjs";
import { membership } from "../lib/access.mjs";
import {
  deliveryRoutes,
  ownDeliveryRoutes,
  DELIVERY_CONSENT_VERSION,
} from "../lib/participation-delivery.mjs";
const options = {
  skip: configured
    ? false
    : "Supply an explicitly owned local interval test database and constrained role.",
  timeout: 180000,
};
const code = (c) => (e) => e.code === c;
const range = (start = "09:00:00", end = "10:00:00") => ({
  version: 1,
  startAt: `2099-01-02T${start}+00:00`,
  endAt: `2099-01-02T${end}+00:00`,
  timeZone: "UTC",
});
const list = async (f, target) =>
  (await f.staffCall(target.id + "/participations")).participations;
const facts = (f) =>
  f.db.tx(
    f.staff,
    f.org,
    async (c) =>
      (
        await c.query(
          "SELECT (SELECT count(*) FROM os_participations WHERE org_id=$1 AND state='confirmed')::int AS confirmed,(SELECT count(*) FROM os_events WHERE org_id=$1 AND action='participation.confirmed')::int AS confirmed_events,(SELECT count(*) FROM os_participation_outbox WHERE org_id=$1)::int AS notices",
          [f.org],
        )
      ).rows[0],
    { readOnly: true },
  );
async function ready(f, target, name, interval, contactId) {
  const candidate = await f.makeCandidate(name, target, contactId);
  const p = await f.associate(target, candidate);
  return f.offlineConsent(target, p, { requestedInterval: interval });
}
async function edit(f, id, data, { status, approved = false } = {}) {
  return f.db.tx(
    f.staff,
    f.org,
    async (c) => {
      const records = await allRecords(c, f.org),
        old = records.find((r) => r.id === id);
      const next = {
        ...old,
        data: { ...old.data, ...data },
        revision: old.revision + 1,
        status: status || old.status,
        approval: approved
          ? {
              status: "approved",
              revision: old.revision + 1,
              actorId: "fictional-reviewer",
            }
          : null,
      };
      next.data = validateRecord(next.moduleId, next.data, {
        orgId: f.org,
        recordId: id,
        status: next.status,
        records,
        participation: await participationValidationContext(c, f.org),
      });
      await saveRecord(c, next);
      return next;
    },
    { lock: true },
  );
}

test(
  "interval PG: adjacent commitments use one peak place and expose cumulative totals separately",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("adjacent", "volunteers");
      await f.adopt(target);
      const a = await ready(f, target, "adjacent-a", range()),
        b = await ready(f, target, "adjacent-b", range("10:00:00", "11:00:00"));
      assert.equal(a.intervalChoiceLocked, true);
      assert.equal(typeof a.allocationHash, "string");
      await Promise.all([
        f.command(target, a, "confirm"),
        f.command(target, b, "confirm"),
      ]);
      const detail = await f.staffCall(target.id);
      assert.equal(detail.target.confirmedCount, 2);
      assert.equal(detail.target.peakOccupied, 1);
      assert.deepEqual((await facts(f)).confirmed, 2);
      const raw = await f.db.tx(
        f.staff,
        f.org,
        (c) =>
          c.query(
            "SELECT requested_interval,frozen FROM os_participations WHERE org_id=$1 ORDER BY id",
            [f.org],
          ),
        { readOnly: true },
      );
      assert.equal(raw.rows.length, 2);
      raw.rows.forEach((r) => {
        assert.deepEqual(r.requested_interval, r.frozen.interval);
        assert.equal(r.frozen.terms.intervalPolicy.mode, "within-shift");
      });
    }),
);

test(
  "interval PG: overlapping concurrent confirmation wins once; exact unknown-result Retry adds no event or notice",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("race", "volunteers");
      await f.adopt(target);
      const a = await ready(f, target, "race-a", range()),
        b = await ready(f, target, "race-b", range("09:30:00", "10:30:00"));
      const ka = f.key(),
        kb = f.key();
      const results = await Promise.allSettled([
        f.command(target, a, "confirm", { idempotencyKey: ka }),
        f.command(target, b, "confirm", { idempotencyKey: kb }),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(
        results.find((x) => x.status === "rejected").reason.code,
        "participation_capacity",
      );
      const winner = results[0].status === "fulfilled" ? a : b,
        key = results[0].status === "fulfilled" ? ka : kb;
      const before = await facts(f),
        replayed = await f.command(target, winner, "confirm", {
          idempotencyKey: key,
        });
      assert.equal(replayed.participation.state, "confirmed");
      assert.deepEqual(await facts(f), before);
      const cancelled = await f.command(
        target,
        replayed.participation,
        "cancel",
        { reason: "Fictional cancellation", idempotencyKey: f.key() },
      );
      assert.equal(cancelled.participation.state, "cancelled");
      assert.equal((await facts(f)).confirmed, 0);
    }),
);

test(
  "interval PG: whole legacy terms stay exact and consent cannot be downgraded, retimed or made invalid",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const whole = await f.makeTarget(
        "whole",
        "volunteers",
        1,
        undefined,
        undefined,
        false,
      );
      const original = participationTerms(whole);
      assert.equal(Object.hasOwn(original, "intervalPolicy"), false);
      await f.adopt(whole);
      const wp = await f.associate(
        whole,
        await f.makeCandidate("whole-candidate", whole),
      );
      await assert.rejects(
        f.offlineConsent(whole, wp, { requestedInterval: range() }),
        code("participation_interval"),
      );
      const consented = await f.offlineConsent(whole, wp);
      assert.equal(consented.requestedInterval, null);
      await f.command(whole, consented, "confirm");
      assert.equal(hash(participationTerms(whole)), hash(original));
      const target = await f.makeTarget("choice", "volunteers");
      await f.adopt(target);
      const candidate = await f.makeCandidate("choice-candidate", target),
        p = await f.associate(target, candidate);
      for (const bad of [
        range("08:59:59", "10:00:00"),
        range("10:00:00", "10:00:00"),
        { ...range(), timeZone: "Etc/UTC" },
        { ...range(), extra: true },
      ])
        await assert.rejects(
          f.offlineConsent(target, p, { requestedInterval: bad }),
          code("participation_interval"),
        );
      const fixed = await f.offlineConsent(target, p, {
        requestedInterval: range(),
      });
      await assert.rejects(
        f.offlineConsent(target, fixed, { requestedInterval: null }),
        code("participation_interval"),
      );
      await assert.rejects(
        f.offlineConsent(target, fixed, {
          requestedInterval: range("10:00:00", "11:00:00"),
        }),
        code("participation_interval"),
      );
      await assert.rejects(
        f.command(target, fixed, "confirm", { allocationHash: null }),
        code("participation_interval"),
      );
      assert.equal((await list(f, target))[0].revision, fixed.revision);
    }),
);

test(
  "interval PG: capacity edits use peak while schedule/policy and generic allocation bypasses remain guarded",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("capacity", "volunteers", 2);
      await f.adopt(target);
      const a = await ready(f, target, "capacity-a", range()),
        b = await ready(f, target, "capacity-b", range("10:00:00", "11:00:00"));
      await f.command(target, a, "confirm");
      await f.command(target, b, "confirm");
      await edit(f, target.id, { capacity: 1 }, { approved: true });
      assert.equal((await f.staffCall(target.id)).target.peakOccupied, 1);
      await assert.rejects(
        edit(f, target.id, { capacity: null }, { status: "review" }),
        code("participation_capacity"),
      );
      await assert.rejects(
        edit(f, target.id, { allowPartialIntervals: false }),
        code("participation_guard"),
      );
      await assert.rejects(
        edit(f, target.id, { startAt: "2099-01-02T08:00:00+00:00" }),
        code("participation_guard"),
      );
      await assert.rejects(
        f.makeCandidate("generic-bypass", target, undefined, { legacy: true }),
        code("participation_gateway"),
      );
      const duplicate = await f.makeCandidate(
        "duplicate-a",
        target,
        "capacity-a-contact",
      );
      await assert.rejects(
        f.associate(target, duplicate),
        code("participation_duplicate"),
      );
    }),
);

test(
  "interval PG: actual managed partial intervals conflict with unmanaged whole assignments in both directions",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("managed", "volunteers");
      await f.adopt(target);
      const p = await ready(f, target, "person", range(), "same-person");
      await f.command(target, p, "confirm");
      const adjacent = await f.makeTarget(
        "unmanaged",
        "volunteers",
        1,
        "2099-01-02T10:00:00+00:00",
        "2099-01-02T11:00:00+00:00",
        false,
      );
      await f.makeCandidate("unmanaged-assignment", adjacent, "same-person", {
        legacy: true,
      });
      await assert.rejects(
        edit(f, adjacent.id, { startAt: "2099-01-02T09:30:00+00:00" }),
        (e) =>
          e.code === "participation_overlap" ||
          /overlap|double-book/i.test(e.message),
      );
      const another = await f.makeTarget("managed-other", "volunteers");
      await f.adopt(another);
      const conflict = await ready(
        f,
        another,
        "same-person-other",
        range("10:30:00", "11:00:00"),
        "same-person",
      );
      await assert.rejects(
        f.command(another, conflict, "confirm"),
        code("participation_overlap"),
      );
    }),
);

test(
  "interval PG: fresh consent follows source changes and waitlist suggestions choose an actually fitting range",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("waiting", "volunteers");
      await f.adopt(target);
      const a = await ready(f, target, "waiting-a", range()),
        b = await ready(f, target, "waiting-b", range()),
        c = await ready(f, target, "waiting-c", range("10:00:00", "11:00:00"));
      await edit(
        f,
        target.id,
        { title: "A newly reviewed fictional title" },
        { approved: true },
      );
      await assert.rejects(
        f.command(target, a, "confirm"),
        code("participation_consent"),
      );
      const aa = await f.offlineConsent(target, a, {
          requestedInterval: range(),
        }),
        bb = await f.offlineConsent(target, b, { requestedInterval: range() }),
        cc = await f.offlineConsent(target, c, {
          requestedInterval: range("10:00:00", "11:00:00"),
        });
      const confirmed = await f.command(target, aa, "confirm"),
        waitedB = (await f.command(target, bb, "waitlist")).participation,
        waitedC = (await f.command(target, cc, "waitlist")).participation;
      const ledger = await f.staffCall(target.id + "/participations");
      assert.equal(ledger.suggestedWaitlistId, waitedC.id);
      await f.command(target, waitedC, "promote");
      assert.equal((await f.staffCall(target.id)).target.peakOccupied, 1);
      await f.command(target, confirmed.participation, "cancel", {
        reason: "Explicit fictional cancellation",
      });
      assert.equal(
        (await list(f, target)).find((p) => p.id === waitedB.id).state,
        "waitlisted",
      );
      assert.equal(
        (await f.staffCall(target.id + "/participations")).suggestedWaitlistId,
        waitedB.id,
      );
    }),
);

test(
  "interval PG: own linked request affirms its exact range without exposing roster or gaining staff authority",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("own", "volunteers");
      await f.adopt(target);
      const candidate = await f.makeCandidate(
        "own-candidate",
        target,
        undefined,
        { withIntake: true },
      );
      const p = await f.associate(target, candidate);
      const own = (await f.ownCall(candidate.intakeId)).participations[0];
      const result = await f.ownCall(candidate.intakeId, p.id, "consent", {
        revision: own.revision,
        targetRevision: own.targetRevision,
        sourceRevision: own.sourceRevision,
        termsHash: own.termsHash,
        intakeRevision: 1,
        consent: true,
        waitlistAllowed: false,
        emailUpdates: false,
        requestedInterval: range(),
        idempotencyKey: f.key(),
      });
      assert.deepEqual(result.participation.requestedInterval, range());
      assert.equal(result.participation.intervalChoiceLocked, true);
      assert.equal(typeof result.participation.allocationHash, "string");
      for (const privateKey of [
        "bookingRecordId",
        "contactId",
        "sourceHistory",
        "candidateRevision",
        "source",
      ])
        assert.equal(Object.hasOwn(result.participation, privateKey), false);
      await assert.rejects(
        f.staffCall(
          target.id + "/participations/" + p.id + "/confirm",
          {},
          f.ownSession.user.id,
        ),
      );
      assert.equal((await facts(f)).confirmed, 0);
      const ownRaw = (await list(f, target))[0];
      await f.command(target, ownRaw, "confirm");
      assert.equal((await facts(f)).confirmed, 1);
      const contextFree = await f.db.tx(
        f.ownSession.user.id,
        null,
        (c) => c.query("SELECT id FROM os_participations"),
        { readOnly: true },
      );
      assert.equal(contextFree.rows.length, 0);
    }),
);

async function restoreIntoFreshOrg(f, backup) {
  const org =
      f.org.length > 80 ? "recovered-" + f.org.slice(10) : f.org + "-recovered",
    normalized = restoredParticipation(backup);
  await f.db.tx(
    f.staff,
    org,
    async (c) => {
      await c.query(
        "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional recovered organization',$1,'USD','UTC')",
        [org],
      );
      await c.query(
        "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'admin')",
        [org, f.staff],
      );
      const records = backup.format
        ? validateBackup(backup, org, f.staff)
        : backup.records.map((r) => ({
            ...r,
            orgId: org,
            status: MODULE_MAP[r.moduleId].workflow.initial,
            revision: 1,
            approval: null,
            snapshot: null,
          }));
      const capability = learningWriteCapability("restore", records);
      for (const r of records) {
        r.data = validateRecord(r.moduleId, r.data, {
          orgId: org,
          recordId: r.id,
          status: r.status,
          records,
        });
        await saveRecord(c, r, { learningCapability: capability });
      }
      await restoreIntake(c, org, f.staff, restoredIntake(backup));
      await restoreParticipation(c, org, f.staff, normalized);
      if (backup.learningBridge)
        await restoreLearningBridge(c, org, backup.learningBridge, {
          records: backup.records,
          trash: backup.trash || [],
          legacyReports: backup.reports || [],
        });
    },
    { lock: true },
  );
  return { org, normalized };
}
test(
  "interval PG: inactive unconfirmed recovery retains history, reserves nothing and cannot confirm before fresh consent",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("recover", "volunteers");
      await f.adopt(target);
      await ready(f, target, "recover-candidate", range());
      const backup = await f.db.tx(
        f.staff,
        f.org,
        async (c) => ({
          records: await allRecords(c, f.org),
          participation: await exportParticipation(c, f.org),
        }),
        { readOnly: true },
      );
      const { org, normalized } = await restoreIntoFreshOrg(f, backup);
      const restored = await f.db.tx(
        f.staff,
        org,
        (c) =>
          c.query("SELECT * FROM os_participations WHERE org_id=$1", [org]),
        { readOnly: true },
      );
      assert.equal(restored.rows.length, 1);
      const p = restored.rows[0];
      assert.deepEqual(p.requested_interval, range());
      assert.equal(p.frozen.allocationKnown, false);
      assert.equal(p.frozen.sourceHistory.state, "requested");
      assert.equal(p.consent, null);
      assert.equal(p.last_command, null);
      assert.equal(p.delivery_consent, null);
      assert.equal(p.state, "requested");
      assert.equal(normalized.participations[0].recoveredState, "requested");
      const counts = await f.db.tx(
        f.staff,
        org,
        (c) =>
          c.query(
            "SELECT (SELECT count(*) FROM os_participations WHERE org_id=$1 AND state='confirmed')::int AS confirmed,(SELECT count(*) FROM os_participant_links WHERE org_id=$1)::int AS links,(SELECT count(*) FROM os_participation_outbox WHERE org_id=$1 AND state=ANY($2::text[]))::int AS eligible",
            [org, ["pending", "leased", "accepted", "delivered"]],
          ),
        { readOnly: true },
      );
      assert.deepEqual(counts.rows[0], { confirmed: 0, links: 0, eligible: 0 });
      const again = await f.db.tx(
        f.staff,
        org,
        (c) => exportParticipation(c, org),
        { readOnly: true },
      );
      const readmitted = restoredParticipation({
        ...backup,
        participation: again,
      });
      assert.deepEqual(readmitted.participations[0].frozen, p.frozen);
      const restoredFixture = { ...f, org };
      await edit(
        restoredFixture,
        target.id,
        {},
        { status: "open", approved: true },
      );
      await edit(
        restoredFixture,
        p.booking_record_id,
        {},
        { status: "approved", approved: true },
      );
      const call = (tail, input) => f.staffCall(tail, input, f.staff, org);
      let view = await call(target.id);
      await call(target.id + "/adopt", {
        targetRevision: view.currentSourceRevision,
        expectedLegacyHash: view.preview.legacyHash,
        idempotencyKey: f.key(),
      });
      let current = (await call(target.id + "/participations"))
        .participations[0];
      view = await call(target.id);
      const command = {
        revision: current.revision,
        targetRevision: view.target.revision,
        candidateRevision: current.candidateRevision,
        consentRevision: 0,
        idempotencyKey: f.key(),
      };
      await assert.rejects(
        call(target.id + "/participations/" + current.id + "/confirm", command),
        code("participation_consent"),
      );
      current = (
        await call(target.id + "/participations/" + current.id + "/consent", {
          revision: current.revision,
          targetRevision: view.target.revision,
          sourceRevision: view.currentSourceRevision,
          termsHash: view.termsHash,
          requestedInterval: range(),
          consent: true,
          waitlistAllowed: false,
          emailUpdates: false,
          method: "Fresh fictional evidence",
          evidenceRef: "fresh-after-recovery",
          consentedAt: new Date().toISOString(),
          idempotencyKey: f.key(),
        })
      ).participation;
      const confirmed = await call(
        target.id + "/participations/" + current.id + "/confirm",
        {
          revision: current.revision,
          targetRevision: view.target.revision,
          candidateRevision: current.candidateRevision,
          consentRevision: current.consent.revision,
          allocationHash: current.allocationHash,
          idempotencyKey: f.key(),
        },
      );
      assert.equal(confirmed.participation.state, "confirmed");
    }),
);

test(
  "interval PG: the new small column rejects oversized JSON without changing existing participation facts",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("column", "volunteers");
      await f.adopt(target);
      const p = await ready(f, target, "column-candidate", range());
      const before = await f.db.tx(
        f.staff,
        f.org,
        (c) =>
          c.query(
            "SELECT to_jsonb(p) AS value FROM os_participations p WHERE org_id=$1",
            [f.org],
          ),
        { readOnly: true },
      );
      await assert.rejects(
        f.db.tx(
          f.staff,
          f.org,
          (c) =>
            c.query(
              "UPDATE os_participations SET requested_interval=$3 WHERE org_id=$1 AND id=$2",
              [f.org, p.id, JSON.stringify({ padding: "x".repeat(1024) })],
            ),
          { lock: true },
        ),
        (e) => e.code === "23514",
      );
      const after = await f.db.tx(
        f.staff,
        f.org,
        (c) =>
          c.query(
            "SELECT to_jsonb(p) AS value FROM os_participations p WHERE org_id=$1",
            [f.org],
          ),
        { readOnly: true },
      );
      assert.deepEqual(after.rows, before.rows);
      const flags = (
        await f.db.pool.query(
          "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='os_participations'::regclass",
        )
      ).rows[0];
      assert.deepEqual(flags, {
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    }),
);

test(
  "interval PG: a new whole choice under newly opted-in terms stays v3 without target re-adoption",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget(
        "new-whole",
        "volunteers",
        1,
        undefined,
        undefined,
        false,
      );
      await f.adopt(target);
      await edit(
        f,
        target.id,
        { allowPartialIntervals: true },
        { approved: true },
      );
      const p = await f.associate(
        target,
        await f.makeCandidate("new-whole-candidate", target),
      );
      const consented = await f.offlineConsent(target, p);
      assert.equal(consented.requestedInterval, null);
      const pending = await f.db.tx(
        f.staff,
        f.org,
        (c) => exportParticipation(c, f.org),
        { readOnly: true },
      );
      assert.equal(pending.version, 3);
      assert.equal(
        pending.participations[0].frozen.sourceHistory.terms.intervalPolicy
          .mode,
        "within-shift",
      );
      await f.command(target, consented, "confirm");
      const confirmed = await f.db.tx(
        f.staff,
        f.org,
        (c) => exportParticipation(c, f.org),
        { readOnly: true },
      );
      assert.equal(confirmed.version, 3);
      assert.equal(
        confirmed.participations[0].frozen.terms.intervalPolicy.mode,
        "within-shift",
      );
    }),
);

test(
  "interval PG: mixed actual Learning and interval state keeps the new column through exact restore measurement and re-export",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("mixed", "volunteers");
      await f.adopt(target);
      await f.command(
        target,
        await ready(f, target, "mixed-candidate", range()),
        "confirm",
      );
      const learning = buildLearningFixture({ orgId: f.org, actorId: f.staff });
      await f.db.tx(
        f.staff,
        f.org,
        async (c) => {
          const input = makeBackup(
            {
              name: "Fictional mixed fixture",
              currency: "USD",
              time_zone: "UTC",
            },
            learning.records,
            { learningBridge: learning.backup },
          );
          const records = validateBackup(input, f.org, f.staff),
            capability = learningWriteCapability("restore", records);
          for (const r of records)
            await saveRecord(c, r, { learningCapability: capability });
          await restoreLearningBridge(c, f.org, learning.backup, {
            records: learning.records,
            trash: [],
            legacyReports: [],
          });
        },
        { lock: true },
      );
      await edit(
        f,
        target.id,
        { title: "A mixed fixture working revision" },
        { approved: true },
      );
      const backup = await f.db.tx(
        f.staff,
        f.org,
        (c) => assembleWorkspaceBackup(c, f.org),
        { readOnly: true },
      );
      assert(backup.learningBridge);
      assert.equal(backup.participation.version, 3);
      const measured = await f.db.tx(
        f.staff,
        f.org,
        (c) => measureLearningRestoreCapacity(c, backup),
        { readOnly: true },
      );
      assert(measured.categories.os_participations.bytes > 0);
      const { org } = await restoreIntoFreshOrg(f, backup);
      const restored = await f.db.tx(
        f.staff,
        org,
        (c) => assembleWorkspaceBackup(c, org),
        { readOnly: true },
      );
      assert.equal(restored.participation.version, 3);
      assert.deepEqual(
        restored.participation.participations[0].requestedInterval,
        range(),
      );
      assert.deepEqual(
        restored.participation.participations[0].frozen.interval,
        range(),
      );
      assert.equal(restored.participation.participations[0].consent, null);
      assert.deepEqual(
        restored.learningBridge.reports.map((x) => x.payload || x),
        backup.learningBridge.reports.map((x) => x.payload || x),
      );
      const exact = await f.db.tx(
        f.staff,
        org,
        (c) => checkWorkspaceExportCapacity(c, org),
        { readOnly: true },
      );
      assert(exact.restore.categories.os_participations.bytes > 0);
    }),
);

// Source fixtures are written only in this case's new disposable schema. These
// are fictional bounded legacy histories, not inferred real confirmations.
test(
  "interval PG: near-cap legacy whole history keeps v2 export, cancellation, opt-out and inactive restore",
  options,
  (t) =>
    withIntervalFixture(
      async (f) => {
        const target = await f.makeTarget(
          "legacy-cap",
          "volunteers",
          1,
          undefined,
          undefined,
          false,
        );
        await edit(
          f,
          target.id,
          {
            title: "界".repeat(180),
            participationPurpose: "界".repeat(600),
            participantInstructions: "界".repeat(600),
            organizerUrl: "https://example.invalid/" + "a".repeat(470),
          },
          { approved: true },
        );
        await f.adopt(target);
        const candidate = await f.makeCandidate(
          "legacy-cap-booking",
          target,
          undefined,
          { withIntake: true },
        );
        let p = await f.offlineConsent(
          target,
          await f.associate(target, candidate),
          { requestedInterval: null },
        );
        p = (await f.command(target, p, "confirm")).participation;
        const before = await f.migration.tx(f.staff, f.org, async (c) => {
          const partial = await assembleWorkspaceBackup(c, f.org);
          assert.equal(partial.participation.version, 2);
          const normalized = restoredParticipation(partial).participations[0];
          const template = {
            ...normalized.frozen,
            sourceHistory: {
              ...normalized.frozen.sourceHistory,
              state: "cancelled",
            },
          };
          // Isolate the interval-column migration. The later reminder NULL
          // column stays present; its separate compatibility credit is measured
          // below. Original data and typed history remain intact.
          await c.query(
            "ALTER TABLE os_participations DROP COLUMN requested_interval",
          );
          await c.query(
            "UPDATE os_participations SET last_command=NULL WHERE org_id=$1 AND id=$2",
            [f.org, p.id],
          );
          const original = (
            await c.query(
              "SELECT * FROM os_participations WHERE org_id=$1 AND id=$2",
              [f.org, p.id],
            )
          ).rows[0];
          const sample = {
            ...original,
            id: "history-" + "0".repeat(28),
            booking_record_id: "booking-" + "0".repeat(28),
            state: "cancelled",
            intake_id: null,
            revision: 8,
            source: "recovered",
            consent: null,
            frozen: template,
            recovered: true,
            recovered_state: "cancelled",
            last_command: null,
            cancelled_at: new Date().toISOString(),
          };
          const existing = Number(
            (
              await c.query(
                "SELECT sum(octet_length(to_jsonb(t)::text))::int AS bytes FROM os_participations t WHERE org_id=$1",
                [f.org],
              )
            ).rows[0].bytes,
          );
          // Measure the same physical JSONB encoding that participationQuota uses.
          const measured = Number(
            (
              await c.query(
                "SELECT octet_length(to_jsonb(jsonb_populate_record(NULL::os_participations,$1))::text)::int AS bytes",
                [JSON.stringify(sample)],
              )
            ).rows[0].bytes,
          );
          // The old-schema oracle still measures raw rows. Calibrate the
          // fixture against the independently proved, whole-org reminder NULL
          // credit so this remains a genuine charged-cap frontier.
          assert.equal(
            (await c.query(`SELECT ${PARTICIPATION_REMINDER_LEGACY_SQL} AS legacy`, [f.org])).rows[0].legacy,
            true,
          );
          const reminderNullKeyBytes = (
            await c.query(
              "SELECT octet_length(to_jsonb(p)::text)-octet_length((to_jsonb(p)-'reminder_consent')::text) AS bytes FROM jsonb_populate_record(NULL::os_participations,$1) p",
              [JSON.stringify(sample)],
            )
          ).rows[0].bytes;
          assert.equal(reminderNullKeyBytes, 26);
          const existingCount = Number((await c.query(
            "SELECT count(*) AS count FROM os_participations WHERE org_id=$1", [f.org],
          )).rows[0].count);
          assert.equal(existingCount, 1);
          const count = Math.min(
            1900,
            Math.floor((8 * 1024 * 1024 - 1000 - (existing - reminderNullKeyBytes * existingCount)) / (measured - reminderNullKeyBytes)),
          );
          assert(count > 1000);
          await c.query(
            "INSERT INTO os_records SELECT (jsonb_populate_record(NULL::os_records,to_jsonb(r)||jsonb_build_object('id','booking-'||lpad(i::text,28,'0'),'status','cancelled','revision',8,'approval',NULL))).* FROM os_records r CROSS JOIN generate_series(1,$3::int) i WHERE org_id=$1 AND id=$2",
            [f.org, candidate.record.id, count],
          );
          await c.query(
            "INSERT INTO os_participations SELECT (jsonb_populate_record(NULL::os_participations,$1::jsonb||jsonb_build_object('id','history-'||lpad(i::text,28,'0'),'booking_record_id','booking-'||lpad(i::text,28,'0')))).* FROM generate_series(1,$2::int) i",
            [JSON.stringify(sample), count],
          );
          const used = Number(
            (
              await c.query(
                "SELECT sum(octet_length(to_jsonb(t)::text))::int AS bytes FROM os_participations t WHERE org_id=$1",
                [f.org],
              )
            ).rows[0].bytes,
          );
          const reminderNullCredit = reminderNullKeyBytes * (count + existingCount),
            chargedUsed = used - reminderNullCredit;
          assert(
            chargedUsed > 8 * 1024 * 1024 - 8000 && chargedUsed <= 8 * 1024 * 1024 - 1000,
          );
          const oldGlobalBase = await oldLogicalBackupBytes(c, f.org);
          await c.query(
            "INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fixture.historical',jsonb_build_object('preserved',repeat('x',$3::int)))",
            [f.org, f.staff, 60 * 1024 * 1024 - (oldGlobalBase - reminderNullCredit) - 1000],
          );
          const oldGlobal = await oldLogicalBackupBytes(c, f.org);
          assert(
            oldGlobal - reminderNullCredit > 60 * 1024 * 1024 - 2000 &&
            oldGlobal - reminderNullCredit < 60 * 1024 * 1024,
          );
          const oldNative = await exportParticipation(c, f.org),
            oldNativeHash = hash(JSON.stringify(oldNative));
          assert.equal(oldNative.version, 2);
          restoredParticipation({
            records: await allRecords(c, f.org),
            intake: partial.intake,
            participation: oldNative,
          });
          const schema = await readFile(
            new URL("../lib/schema.sql", import.meta.url),
            "utf8",
          );
          const additive =
            /ALTER TABLE os_participations ADD COLUMN IF NOT EXISTS requested_interval jsonb[\s\S]*?;/.exec(
              schema,
            )?.[0];
          assert(additive && additive.includes("<=1024"));
          await c.query(additive);
          const accounting = await checkParticipationExportCapacity(c, f.org, {
            reserve: false,
          });
          assert.equal(accounting.version, 2);
          assert.equal(accounting.reminderNullCompatibilityCreditBytes, reminderNullCredit);
          assert.equal(accounting.chargedRetainedBytes, chargedUsed);
          assert.equal(accounting.chargedRetainedBytes + accounting.reminderNullCompatibilityCreditBytes, used);
          assert.equal(accounting.intervalCompatibilityCreditBytes, 28 * (count + 1));
          assert.equal(accounting.rawRetainedBytes - used, 28 * (count + 1));
          assert(accounting.rawRetainedBytes > 8 * 1024 * 1024);
          const rawGlobalAfter = await oldLogicalBackupBytes(c, f.org),
            chargedGlobalAfter = await logicalBackupBytes(c, f.org);
          assert.equal(chargedGlobalAfter + accounting.reminderNullCompatibilityCreditBytes, oldGlobal);
          assert.equal(rawGlobalAfter - chargedGlobalAfter, accounting.intervalCompatibilityCreditBytes + accounting.reminderNullCompatibilityCreditBytes);
          assert.equal(rawGlobalAfter - oldGlobal, 28 * (count + 1));
          assert(rawGlobalAfter > 60 * 1024 * 1024);
          assert.equal(
            hash(JSON.stringify(await exportParticipation(c, f.org))),
            oldNativeHash,
          );
          await participationQuota(c, f.org);
          const bookingBytes = Number(
            (
              await c.query(
                "SELECT octet_length(to_jsonb(r)::text)::int AS bytes FROM os_records r WHERE org_id=$1 AND id=$2",
                [f.org, candidate.record.id],
              )
            ).rows[0].bytes,
          );
          return {
            used,
            chargedUsed,
            rawAfterMigration: accounting.rawRetainedBytes,
            oldGlobal,
            rawGlobalAfter,
            chargedGlobalAfter,
            count: count + 1,
            physical: original,
            bookingBytes,
            originalNativeBytes: Buffer.byteLength(
              JSON.stringify(partial.participation.participations[0]),
            ),
          };
        });
        const current = p;
        const cancelled = await f.command(target, current, "cancel", {
          reason: "Fictional explicit cancellation",
        });
        assert.equal(cancelled.participation.state, "cancelled");
        const after = await f.db.tx(
          f.staff,
          f.org,
          async (c) => {
            await participationQuota(c, f.org);
            const used = Number(
              (
                await c.query(
                  `SELECT sum(octet_length(${participationChargeJsonSQL("t")}::text))::int AS bytes FROM os_participations t WHERE org_id=$1`,
                  [f.org],
                )
              ).rows[0].bytes,
            );
            const booking = Number(
              (
                await c.query(
                  "SELECT octet_length(to_jsonb(r)::text)::int AS bytes FROM os_records r WHERE org_id=$1 AND id=$2",
                  [f.org, candidate.record.id],
                )
              ).rows[0].bytes,
            );
            assert(used - before.chargedUsed <= PARTICIPATION_SAFETY_RESERVE.retained);
            assert(
              booking - before.bookingBytes <=
                PARTICIPATION_SAFETY_RESERVE.bookingRetained,
            );
            return assembleWorkspaceBackup(c, f.org);
          },
          { readOnly: true },
        );
        assert.equal(after.participation.version, 2);
        assert(
          Buffer.byteLength(
            JSON.stringify(
              after.participation.participations.find((x) => x.id === p.id),
            ),
          ) -
            before.originalNativeBytes <=
            PARTICIPATION_SAFETY_RESERVE.native,
        );
        assert.equal(after.participation.participations.length, before.count);
        const own = (
          await f.ownCall(candidate.intakeId, null, null)
        ).participations.find((x) => x.id === p.id);
        const off = await f.ownCall(candidate.intakeId, p.id, "preferences", {
          revision: own.revision,
          intakeRevision: 1,
          emailUpdates: false,
          idempotencyKey: f.key(),
        });
        assert.equal(off.participation.notifications.requested, false);
        const updated = await f.db.tx(
          f.staff,
          f.org,
          (c) => assembleWorkspaceBackup(c, f.org),
          { readOnly: true },
        );
        const restored = await restoreIntoFreshOrg(f, updated);
        const round = await f.db.tx(
          f.staff,
          restored.org,
          async (c) => {
            await participationQuota(c, restored.org);
            return exportParticipation(c, restored.org);
          },
          { readOnly: true },
        );
        assert.equal(round.version, 2);
        assert.equal(round.participations.length, before.count);
        assert(
          round.participations.every((x) => x.recovered && x.consent === null),
        );
        t.diagnostic(
          JSON.stringify({
            fixtureOnly: true,
            legacyRows: before.count,
            legacyRawBytes: before.used,
            legacyChargedBytes: before.chargedUsed,
            rawAfterNullableMigration: before.rawAfterMigration,
            oldGlobal: before.oldGlobal,
            rawGlobalAfter: before.rawGlobalAfter,
            chargedGlobalAfter: before.chargedGlobalAfter,
            legacyNativeBytes: Buffer.byteLength(
              JSON.stringify(updated.participation),
            ),
            restoredRows: round.participations.length,
          }),
        );

        await t.test(
          "separate v3 full-row overflow cannot use legacy compatibility, including reserve:false",
          async () => {
            // Measure the exact target-row write after the real safety exits.
            // The raw historical oracle and reminder credit remain separate;
            // a fixture that misses this frontier must fail before the command.
            const ordinaryBoundary = await f.migration.tx(f.staff, f.org, async (c) => {
              const currentUsage = await logicalBackupBytes(c, f.org);
              await c.query("SAVEPOINT ordinary_target_size_probe");
              await c.query(
                "UPDATE os_records SET data=jsonb_set(data,'{allowPartialIntervals}','true'::jsonb),revision=revision+1,approval=jsonb_set(approval,'{revision}',to_jsonb(revision+1)),updated_at=now() WHERE org_id=$1 AND id=$2",
                [f.org, target.id],
              );
              const targetWriteUsage = await logicalBackupBytes(c, f.org);
              await c.query("ROLLBACK TO ordinary_target_size_probe");
              await c.query("RELEASE ordinary_target_size_probe");
              assert(currentUsage > 60 * 1024 * 1024 - 2000 && currentUsage < 61 * 1024 * 1024);
              assert(targetWriteUsage > 60 * 1024 * 1024);
              return { currentUsage, targetWriteUsage };
            });
            t.diagnostic(JSON.stringify({ fixtureOnly: true, ordinaryBoundary }));
            // A new ordinary opt-in still refuses atomically, code unchanged.
            await assert.rejects(
              edit(
                f,
                target.id,
                { allowPartialIntervals: true },
                { approved: true },
              ),
              code("quota"),
            );
            assert.equal(
              (
                await f.db.tx(
                  f.staff,
                  f.org,
                  (c) => exportParticipation(c, f.org),
                  { readOnly: true },
                )
              ).version,
              2,
            );
            // Force only this clearly out-of-band, individually valid v3 shape in
            // the disposable fixture to witness the hard full-row check directly.
            await f.migration.tx(f.staff, f.org, async (c) => {
              const records = await allRecords(c, f.org),
                oldSource = records.find((r) => r.id === target.id),
                source = {
                  ...oldSource,
                  revision: oldSource.revision + 1,
                  data: { ...oldSource.data, allowPartialIntervals: true },
                };
              source.data = validateRecord(source.moduleId, source.data, {
                orgId: f.org,
                recordId: source.id,
                status: source.status,
                records,
                participation: await participationValidationContext(c, f.org),
              });
              const terms = participationTerms(source);
              await c.query(
                "UPDATE os_records SET data=$3,revision=$4 WHERE org_id=$1 AND id=$2",
                [
                  f.org,
                  source.id,
                  JSON.stringify(source.data),
                  source.revision,
                ],
              );
              await c.query(
                "UPDATE os_participation_targets SET terms=$3,terms_hash=$4,source_revision=$5 WHERE org_id=$1 AND target_id=$2",
                [
                  f.org,
                  target.id,
                  JSON.stringify(terms),
                  hash(terms),
                  source.revision,
                ],
              );
            });
            await f.db.tx(
              f.staff,
              f.org,
              async (c) => {
                const packet = await exportParticipation(c, f.org),
                  measuredV3 = (
                    await c.query(
                      `SELECT sum(octet_length(to_jsonb(p)::text))::int AS raw,sum(octet_length(${participationIntervalChargeJsonSQL("p")}::text))::int AS interval_charged,sum(octet_length(${participationChargeJsonSQL("p")}::text))::int AS charged FROM os_participations p WHERE org_id=$1`,
                      [f.org],
                    )
                  ).rows[0],
                  raw = measuredV3.raw;
                assert.equal(packet.version, 3);
                assert.equal(measuredV3.raw, measuredV3.interval_charged);
                assert.equal(measuredV3.interval_charged - measuredV3.charged, 26 * before.count);
                assert(measuredV3.charged > 8 * 1024 * 1024);
                assert(
                  Buffer.byteLength(JSON.stringify(packet.participations)) <
                    8 * 1024 * 1024,
                );
                await assert.rejects(
                  checkParticipationExportCapacity(c, f.org, {
                    reserve: false,
                  }),
                  code("participation_backup_size"),
                );
                t.diagnostic(
                  JSON.stringify({
                    fixtureOnly: true,
                    deliberateV3RawOverflow: raw,
                    deliberateV3ChargedOverflow: measuredV3.charged,
                    refusedWithoutReserve: true,
                  }),
                );
              },
              { readOnly: true },
            );
          },
        );
      },
      { orgId: "o".repeat(100), staffId: "u".repeat(100) },
    ),
);
test(
  "interval PG: repeated v3 safety actions preserve future cancellation and a durable skipped-journal Retry",
  options,
  (t) =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("safety-cap", "volunteers");
      await f.adopt(target);
      const candidate = await f.makeCandidate(
        "safety-booking",
        target,
        undefined,
        { withIntake: true },
      );
      let p = await f.offlineConsent(
        target,
        await f.associate(target, candidate),
        { requestedInterval: range() },
      );
      p = (await f.command(target, p, "confirm")).participation;
      const ordinaryCandidate = await ready(
          f,
          target,
          "ordinary-replay",
          range("10:00:00", "11:00:00"),
        ),
        ordinaryKey = f.key();
      const ordinaryCommitted = await f.command(
        target,
        ordinaryCandidate,
        "confirm",
        { idempotencyKey: ordinaryKey },
      );
      const base = await f.db.tx(
        f.staff,
        f.org,
        async (c) => {
          await c.query(
            "UPDATE os_participations SET last_command=NULL WHERE org_id=$1 AND id=$2",
            [f.org, p.id],
          );
          return {
            part: await checkParticipationExportCapacity(c, f.org),
            usage: await logicalBackupBytes(c, f.org),
          };
        },
        { lock: true },
      );
      // This explicit fictional historical audit fills only this disposable tenant.
      // No product request can supply this SQL or change its capacity accounting.
      const budget =
        61 * 1024 * 1024 - base.part.safetyRetained - base.usage - 1400;
      await f.migration.tx(f.staff, f.org, (c) =>
        c.query(
          "INSERT INTO os_events(org_id,actor_id,action,detail) VALUES($1,$2,'fixture.historical',jsonb_build_object('preserved',repeat('x',$3::int)))",
          [f.org, f.staff, budget],
        ),
      );
      const retained = [];
      for (let i = 0; i < 12; i++)
        retained.push(
          await f.db.tx(
            f.staff,
            f.org,
            (c) =>
              audit(c, f.org, f.staff, "participation.preferences", null, {
                participationId: p.id,
                targetId: target.id,
                emailUpdates: false,
              }),
            { lock: true },
          ),
        );
      assert(retained.includes(true));
      assert(retained.includes(false));
      const firstSkipped = retained.indexOf(false);
      assert(retained.slice(firstSkipped).every((x) => x === false));
      const prior = await f.db.tx(
        f.staff,
        f.org,
        async (c) => ({
          events: (
            await c.query(
              "SELECT id FROM os_events WHERE org_id=$1 ORDER BY id",
              [f.org],
            )
          ).rows,
          rows: (
            await c.query(
              "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY id",
              [f.org],
            )
          ).rows,
          outbox: (
            await c.query(
              "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY id",
              [f.org],
            )
          ).rows,
        }),
        { readOnly: true },
      );
      const ordinaryReplay = await f.command(
        target,
        ordinaryCandidate,
        "confirm",
        { idempotencyKey: ordinaryKey },
      );
      assert.deepEqual(ordinaryReplay, ordinaryCommitted);
      const replayed = await f.db.tx(
        f.staff,
        f.org,
        async (c) => ({
          events: (
            await c.query(
              "SELECT id FROM os_events WHERE org_id=$1 ORDER BY id",
              [f.org],
            )
          ).rows,
          rows: (
            await c.query(
              "SELECT * FROM os_participations WHERE org_id=$1 ORDER BY id",
              [f.org],
            )
          ).rows,
          outbox: (
            await c.query(
              "SELECT * FROM os_participation_outbox WHERE org_id=$1 ORDER BY id",
              [f.org],
            )
          ).rows,
        }),
        { readOnly: true },
      );
      assert.deepEqual(replayed, prior);
      await assert.rejects(
        f.command(target, ordinaryCandidate, "confirm", {
          idempotencyKey: ordinaryKey,
          reason: "changed exact payload",
        }),
        code("participation_intent"),
      );
      await assert.rejects(
        f.command(target, ordinaryCandidate, "confirm", {
          idempotencyKey: f.key(),
        }),
        code("revision"),
      );
      await assert.rejects(
        f.db.tx(
          f.staff,
          f.org,
          async (c) => {
            noteParticipationReceiptReplay(c, f.org);
            await audit(c, f.org, f.staff, "record.updated", null, {});
          },
          { lock: true },
        ),
        code("quota"),
      );
      const original = (await list(f, target)).find((x) => x.id === p.id),
        key = f.key();
      const result = await f.command(target, original, "cancel", {
        idempotencyKey: key,
        reason: "Fictional explicit cancellation",
      });
      assert.equal(result.participation.state, "cancelled");
      assert.equal(result.auditRetained, false);
      const counts = await f.db.tx(
        f.staff,
        f.org,
        async (c) => ({
          events: Number(
            (
              await c.query(
                "SELECT count(*)::int AS n FROM os_events WHERE org_id=$1",
                [f.org],
              )
            ).rows[0].n,
          ),
          row: (
            await c.query(
              "SELECT p.*,octet_length(to_jsonb(p)::text)::int AS bytes FROM os_participations p WHERE org_id=$1 AND id=$2",
              [f.org, p.id],
            )
          ).rows[0],
          backup: await assembleWorkspaceBackup(c, f.org),
          usage: await logicalBackupBytes(c, f.org),
        }),
        { readOnly: true },
      );
      assert.equal(counts.row.last_command.auditRetained, false);
      assert(counts.usage <= 61 * 1024 * 1024);
      assert(
        Buffer.byteLength(JSON.stringify(counts.backup)) <= 64 * 1024 * 1024,
      );
      const retried = await f.command(target, original, "cancel", {
        idempotencyKey: key,
        reason: "Fictional explicit cancellation",
      });
      assert.equal(retried.auditRetained, false);
      assert.equal(
        retried.participation.revision,
        result.participation.revision,
      );
      const final = await f.db.tx(
        f.staff,
        f.org,
        async (c) => ({
          events: Number(
            (
              await c.query(
                "SELECT count(*)::int AS n FROM os_events WHERE org_id=$1",
                [f.org],
              )
            ).rows[0].n,
          ),
          row: (
            await c.query(
              "SELECT last_command FROM os_participations WHERE org_id=$1 AND id=$2",
              [f.org, p.id],
            )
          ).rows[0],
        }),
        { readOnly: true },
      );
      assert.equal(final.events, counts.events);
      assert.deepEqual(final.row.last_command, counts.row.last_command);
      const preference = {
        revision: result.participation.revision,
        intakeRevision: 1,
        emailUpdates: false,
        idempotencyKey: f.key(),
      };
      const off = await f.ownCall(
        candidate.intakeId,
        p.id,
        "preferences",
        preference,
      );
      assert.equal(off.auditRetained, false);
      assert.deepEqual(
        await f.ownCall(candidate.intakeId, p.id, "preferences", preference),
        off,
      );
      const deliveryPreference = {
        revision: off.participation.revision,
        intakeRevision: 1,
        enabled: false,
        consentVersion: DELIVERY_CONSENT_VERSION,
        idempotencyKey: f.key(),
      };
      const deliveryRequest = () =>
        new Request(
          f.settings.origin +
            `/api/participant/orgs/${f.org}/requests/${candidate.intakeId}/participations/${p.id}/delivery-preference`,
          {
            method: "POST",
            headers: {
              origin: f.settings.origin,
              "content-type": "application/json",
              "x-csrf-token": csrf(f.ownSession.session.id, f.settings.secret),
            },
            body: JSON.stringify(deliveryPreference),
          },
        );
      const deliveryCall = async () => {
        const response = await ownDeliveryRoutes({
          request: deliveryRequest(),
          db: f.db,
          settings: f.settings,
          session: f.ownSession,
        });
        assert.equal(response.status, 200);
        return response.json();
      };
      const deliveryOff = await deliveryCall();
      assert.equal(deliveryOff.auditRetained, false);
      assert.deepEqual(await deliveryCall(), deliveryOff);
      const disable = { policyRevision: 1, idempotencyKey: f.key() };
      const disableCall = () =>
        f.db.tx(
          f.staff,
          f.org,
          async (c) => {
            const response = await deliveryRoutes({
              c,
              org: f.org,
              user: f.staff,
              member: await membership(c, f.org, f.staff),
              tail: "participation-delivery/disable",
              method: "POST",
              input: disable,
              url: new URL(
                f.settings.origin +
                  `/api/orgs/${f.org}/participation-delivery/disable`,
              ),
              settings: f.settings,
            });
            assert.equal(response.status, 200);
            return response.json();
          },
          { lock: true },
        );
      const disabled = await disableCall();
      assert.equal(disabled.auditRetained, false);
      assert.deepEqual(await disableCall(), disabled);
      const safetyFinal = await f.db.tx(
        f.staff,
        f.org,
        async (c) => ({
          events: Number(
            (
              await c.query(
                "SELECT count(*)::int AS n FROM os_events WHERE org_id=$1",
                [f.org],
              )
            ).rows[0].n,
          ),
          usage: await logicalBackupBytes(c, f.org),
          backup: await assembleWorkspaceBackup(c, f.org),
        }),
        { readOnly: true },
      );
      assert.equal(safetyFinal.events, counts.events);
      assert(safetyFinal.usage <= 61 * 1024 * 1024);
      assert(
        Buffer.byteLength(JSON.stringify(safetyFinal.backup)) <=
          64 * 1024 * 1024,
      );
      t.diagnostic(
        JSON.stringify({
          fixtureOnly: true,
          auditsRetained: retained.filter(Boolean).length,
          auditsSkipped: retained.filter((x) => !x).length,
          retainedBytes: safetyFinal.usage,
          nativeBytes: Buffer.byteLength(JSON.stringify(safetyFinal.backup)),
          cancelPreferenceDeliveryAndDisableRetryPreserved: true,
        }),
      );
    }),
);

test(
  "interval PG: physical JSONB casts independently bound the full safe audit and related booking changes",
  options,
  (t) =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget("bound", "volunteers");
      await f.adopt(target);
      const consented = await ready(f, target, "bound-booking", range());
      const confirmed = (await f.command(target, consented, "confirm"))
        .participation;
      await f.db.tx(
        f.staff,
        f.org,
        async (c) => {
          const command = {
            intentHash: "f".repeat(64),
            payloadHash: "f".repeat(64),
            action: "delivery.preference",
            actorHash: "f".repeat(64),
            resultRevision: 2147483647,
            notificationQueued: false,
            auditRetained: false,
          };
          const projection = (
            await c.query(
              "SELECT octet_length(to_jsonb(p)::text)::int AS before,octet_length((to_jsonb(p)||jsonb_build_object('last_command',$3::jsonb,'delivery_consent',$4::jsonb,'cancelled_at',$5::timestamptz,'updated_at',$5::timestamptz,'revision',2147483647,'state','cancelled','consent',COALESCE(consent,'{}'::jsonb)||jsonb_build_object('emailUpdates',false)))::text)::int AS after FROM os_participations p WHERE org_id=$1 AND id=$2",
              [
                f.org,
                confirmed.id,
                JSON.stringify(command),
                JSON.stringify({
                  version: DELIVERY_CONSENT_VERSION,
                  enabled: false,
                  revision: 2147483647,
                  at: "2200-12-31T23:59:59.999Z",
                }),
                "2200-12-31T23:59:59.999999+14:00",
              ],
            )
          ).rows[0];
          assert(
            projection.after - projection.before <=
              PARTICIPATION_SAFETY_RESERVE.retained,
          );
          const booking = (
            await c.query(
              "SELECT octet_length(to_jsonb(r)::text)::int AS before,octet_length((to_jsonb(r)||jsonb_build_object('status','cancelled','revision',2147483647,'last_editor_id',$3::text,'updated_at',$4::timestamptz,'approval',NULL))::text)::int AS after FROM os_records r WHERE org_id=$1 AND id=$2",
              [
                f.org,
                confirmed.bookingRecordId,
                "u".repeat(100),
                "2200-12-31T23:59:59.999999+14:00",
              ],
            )
          ).rows[0];
          assert(
            booking.after - booking.before <=
              PARTICIPATION_SAFETY_RESERVE.bookingRetained,
          );
          const fullEvent = {
            org_id: "o".repeat(100),
            id: "9223372036854775807",
            actor_id: "u".repeat(100),
            action: "participation.delivery.preference_off",
            record_id: "r".repeat(100),
            module_id: "volunteers",
            detail: {
              participationId: "p".repeat(100),
              targetId: "t".repeat(100),
              notificationQueued: false,
              emailUpdates: false,
            },
            created_at: "2200-12-31T23:59:59.999999+14:00",
          };
          const physical = Number(
            (
              await c.query(
                "SELECT octet_length(to_jsonb(jsonb_populate_record(NULL::os_events,$1))::text)::int AS bytes",
                [JSON.stringify(fullEvent)],
              )
            ).rows[0].bytes,
          );
          assert(physical <= 807);
          assert(physical > 700);
          t.diagnostic(
            JSON.stringify({
              fixtureOnly: true,
              measuredParticipationGrowth: projection.after - projection.before,
              measuredBookingGrowth: booking.after - booking.before,
              measuredAuditEnvelope: physical,
              participationReserve: PARTICIPATION_SAFETY_RESERVE.retained,
              bookingReserve: PARTICIPATION_SAFETY_RESERVE.bookingRetained,
            }),
          );
        },
        { readOnly: true },
      );
    }),
);

test(
  "interval PG: one marker specification has exact SQL parity and scopes the legacy NULL-only charge",
  options,
  () =>
    withIntervalFixture(async (f) => {
      const target = await f.makeTarget(
        "classifier",
        "volunteers",
        1,
        undefined,
        undefined,
        false,
      );
      await f.adopt(target);
      const candidate = await f.makeCandidate("classifier-booking", target),
        p = await f.associate(target, candidate);
      const cases = [
        {},
        { targetTerms: { intervalPolicy: null } },
        { requested: {} },
        ...["interval", "allocationHash", "allocationKnown"].map((key) => ({
          frozen: { [key]: null },
        })),
        { consent: { allocationHash: null } },
        { consent: { terms: { intervalPolicy: null } } },
        { frozen: { terms: { intervalPolicy: null } } },
      ];
      await f.migration.tx(f.staff, f.org, async (c) => {
        await c.query("SAVEPOINT json_null_refusal");
        await assert.rejects(
          c.query(
            "UPDATE os_participations SET requested_interval='null'::jsonb WHERE org_id=$1 AND id=$2",
            [f.org, p.id],
          ),
          (e) => e.code === "23514",
        );
        await c.query("ROLLBACK TO json_null_refusal");
        const original = (
          await c.query(
            "SELECT terms FROM os_participation_targets WHERE org_id=$1 AND target_id=$2",
            [f.org, target.id],
          )
        ).rows[0].terms;
        for (let i = 0; i < cases.length; i++) {
          const item = cases[i];
          await c.query("SAVEPOINT marker_case");
          await c.query(
            "UPDATE os_participation_targets SET terms=$3 WHERE org_id=$1 AND target_id=$2",
            [
              f.org,
              target.id,
              JSON.stringify({ ...original, ...item.targetTerms }),
            ],
          );
          await c.query(
            "UPDATE os_participations SET requested_interval=$3,consent=$4,frozen=$5 WHERE org_id=$1 AND id=$2",
            [
              f.org,
              p.id,
              item.requested ? JSON.stringify(item.requested) : null,
              item.consent ? JSON.stringify(item.consent) : null,
              item.frozen ? JSON.stringify(item.frozen) : null,
            ],
          );
          const targets = (
              await c.query(
                "SELECT terms FROM os_participation_targets WHERE org_id=$1",
                [f.org],
              )
            ).rows,
            rows = (
              await c.query("SELECT * FROM os_participations WHERE org_id=$1", [
                f.org,
              ])
            ).rows;
          const sql = (
            await c.query(`SELECT ${PARTICIPATION_LEGACY_SQL} AS legacy`, [
              f.org,
            ])
          ).rows[0].legacy;
          assert.equal(sql, i === 0);
          assert.equal(participationVersion(targets, rows), sql ? 2 : 3);
          assert.equal(
            (await exportParticipation(c, f.org)).version,
            sql ? 2 : 3,
          );
          const bytes = (
            await c.query(
              `SELECT octet_length(to_jsonb(p)::text)::int AS raw,octet_length(${participationIntervalChargeJsonSQL("p")}::text)::int AS interval_charged,octet_length(${participationChargeJsonSQL("p")}::text)::int AS charged,${PARTICIPATION_REMINDER_LEGACY_SQL} AS reminder_absent FROM os_participations p WHERE org_id=$1 AND id=$2`,
              [f.org, p.id],
            )
          ).rows[0];
          // Preserve the original interval golden and prove the separate NULL
          // reminder credit even when an interval marker makes the basis v3.
          assert.equal(bytes.raw - bytes.interval_charged, sql ? 28 : 0);
          assert.equal(bytes.reminder_absent, true);
          assert.equal(bytes.interval_charged - bytes.charged, 26);
          await c.query("ROLLBACK TO marker_case");
        }
      });
    }),
);
