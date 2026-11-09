import { reservationSchemaSql, legacyReservationLayout } from "./fixtures/resource-reservation-schema.mjs";
/** Actual db.tx with a closed fake pg client; no socket or SQL engine. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { database, audit, noteParticipationReceiptReplay } from "../lib/database.mjs";

async function fixture(run) {
  const calls = []; let sum = 0, safetyAudit = false;
  const c = { release() { calls.push("RELEASE"); }, async query(sql) {
    calls.push(sql);
    if (sql === reservationSchemaSql.layout) return legacyReservationLayout;
    if (sql.startsWith("SELECT sum(size)")) { sum++; if (sum > 1) throw Error("ORDINARY_FINAL_GATE"); return { rows: [{ size: safetyAudit ? 61 * 1024 * 1024 : 0 }] }; }
    if (sql.includes(" AS checkins")) return { rows: [{ present: false, participation: false, incubator: false, checkins: true }] };
    if (sql.startsWith("SELECT t.* FROM os_participation_checkins")) throw Error("SAFETY_ACTUAL_AND_REMAINING_GATE");
    if (sql.startsWith("INSERT INTO os_events")) return { rows: [] };
    return { rows: [] };
  } };
  const Original = pg.Pool, warn = console.warn;
  pg.Pool = class { async connect() { return c; } async end() {} };
  // The existing generic reserve-exhaustion warning carries no test/private data.
  console.warn = () => {};
  try { await run(database("postgres://fictional.invalid/checkin-unit"), calls, () => { safetyAudit = true; }); }
  finally { pg.Pool = Original; console.warn = warn; }
}
test("omitted withdrawal audit still classifies the actual domain write as safety", async () => {
  await fixture(async (db, calls, exhaust) => {
    await assert.rejects(db.tx("actor", "org", async c => {
      exhaust(); assert.equal(await audit(c, "org", "actor", "participant-checkin.withdrawn", null, { checkInId: "claim" }), false);
    }, { lock: true }), /SAFETY_ACTUAL_AND_REMAINING_GATE/);
    assert(!calls.some(q => q.startsWith("INSERT INTO os_events")));
    assert.deepEqual(calls.slice(-2), ["ROLLBACK", "RELEASE"]);
  });
});
test("accepted receipt marker reaches remaining-withdrawal hard checks, never a new ordinary reserve", async () => {
  await fixture(async db => {
    await assert.rejects(db.tx("actor", "org", c => { noteParticipationReceiptReplay(c, "org"); return "accepted"; }, { lock: true }), /SAFETY_ACTUAL_AND_REMAINING_GATE/);
  });
});
test("ordinary audit takes precedence over accepted receipt marker", async () => {
  await fixture(async db => {
    await assert.rejects(db.tx("actor", "org", async c => {
      noteParticipationReceiptReplay(c, "org"); await audit(c, "org", "actor", "record.changed");
    }, { lock: true }), /ORDINARY_FINAL_GATE/);
  });
});
test("caller result cannot supply trusted receipt/safety classification", async () => {
  await fixture(async (db, calls) => {
    await assert.rejects(db.tx("actor", "org", () => ({ receiptReplay: true, safety: true }), { lock: true }), /ORDINARY_FINAL_GATE|This organization is unavailable/);
    // Ordinary enters the complete exporter; it never treats the response as authority.
    assert(!calls.some(q => q.startsWith("SELECT t.* FROM os_participation_checkins")));
  });
});
