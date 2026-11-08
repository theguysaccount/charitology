import test from "node:test";
import assert from "node:assert/strict";
import {
  participationVersion,
  PARTICIPATION_LEGACY_SQL,
  participationChargeJsonSQL,
  legacyRecoveredParticipation,
} from "../lib/participation-storage.mjs";
const base = () => ({
  targets: [{ terms: { kind: "shift" } }],
  rows: [{ requested_interval: null, consent: null, frozen: null }],
});
test("one closed marker spec distinguishes absent legacy fields from every present-null interval marker", () => {
  const cases = [
    (f) => {
      f.targets[0].terms.intervalPolicy = null;
    },
    (f) => {
      f.rows[0].requested_interval = {};
    },
    ...["interval", "allocationHash", "allocationKnown"].map((key) => (f) => {
      f.rows[0].frozen = { [key]: null };
    }),
    (f) => {
      f.rows[0].consent = { allocationHash: null };
    },
    (f) => {
      f.rows[0].consent = { terms: { intervalPolicy: null } };
    },
    (f) => {
      f.rows[0].frozen = { terms: { intervalPolicy: null } };
    },
  ];
  assert.equal(participationVersion(base().targets, base().rows), 2);
  for (const mutate of cases) {
    const f = base();
    mutate(f);
    assert.equal(participationVersion(f.targets, f.rows), 3);
  }
  const old = base();
  delete old.rows[0].requested_interval;
  assert.equal(participationVersion(old.targets, old.rows), 2);
  assert.match(PARTICIPATION_LEGACY_SQL, /requested_interval IS NOT NULL/);
  assert.match(PARTICIPATION_LEGACY_SQL, /ps_target.org_id=\$1/);
  assert.match(PARTICIPATION_LEGACY_SQL, /ps_row.org_id=\$1/);
  assert.throws(() => participationChargeJsonSQL("p;DROP TABLE os_records"));
});
test("strictly normalized legacy restore may omit only its new NULL key; declared v3 never uses that charge", () => {
  const normalized = {
    targets: base().targets,
    participations: [{ requestedInterval: null, consent: null, frozen: null }],
  };
  assert.equal(
    legacyRecoveredParticipation({ participation: { version: 2 } }, normalized),
    true,
  );
  assert.equal(
    legacyRecoveredParticipation({ participation: { version: 1 } }, normalized),
    true,
  );
  assert.equal(
    legacyRecoveredParticipation({ participation: { version: 3 } }, normalized),
    false,
  );
  const marked = structuredClone(normalized);
  marked.participations[0].frozen = { allocationKnown: false };
  assert.equal(
    legacyRecoveredParticipation({ participation: { version: 2 } }, marked),
    false,
  );
});
