import test from "node:test";
import assert from "node:assert/strict";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { exportVolunteerOrientation, restoredVolunteerOrientation } from "../lib/volunteer-orientation-native.mjs";
import { makeVolunteerOrientationMarkerRow } from "../lib/volunteer-orientation-marker.mjs";

const org = { name: "Fictional workspace", currency: "USD", time_zone: "UTC" };
const program = { id: "program", moduleId: "programs", data: { kind: "program", title: "Program" } };
const shift = { id: "shift", moduleId: "volunteers", data: {
  kind: "shift", title: "Practice shift", startAt: "2026-11-12T13:00:00Z",
  endAt: "2026-11-12T15:00:00Z", timeZone: "UTC", programId: program.id,
} };
const marker = {
  version: 1, moduleId: "volunteers", targetId: shift.id, programId: program.id,
  requirementId: "orientation", policyRevision: 1, sourceRevision: 4,
  termsHash: "a".repeat(64), disposition: "review-needed",
};

test("restoring a marked shift keeps its requirement without live training authority", () => {
  const records = [program, shift];
  const live = makeVolunteerOrientationMarkerRow("source_org", "staff", marker, "live");
  const exported = exportVolunteerOrientation([live], "source_org", records, []);
  const backup = makeBackup(org, records, {
    reports: exported.reports, version: 2, volunteerOrientation: exported.section,
  });
  assert.deepEqual(exported.reports, []);
  const restored = validateBackup(backup, "destination_org", "owner");
  assert.ok(restored.every((record) => record.approval === null && record.revision === 1));
  assert.deepEqual(restoredVolunteerOrientation(backup), { marker, restore: true });

  const row = makeVolunteerOrientationMarkerRow("destination_org", "owner", marker);
  assert.notEqual(row.id, live.id);
  assert.equal(row.payload.originMode, "recovered");
  const next = exportVolunteerOrientation([row], "destination_org", restored, []);
  assert.deepEqual(next.section, exported.section);
});

test("ordinary backups stay v1 and protected metadata must use the v2 section", () => {
  const records = [program, shift];
  const ordinary = makeBackup(org, records);
  assert.equal(ordinary.version, 1);
  assert.equal(restoredVolunteerOrientation(ordinary), null);
  const row = makeVolunteerOrientationMarkerRow("source_org", "staff", marker);
  const section = exportVolunteerOrientation([row], "source_org", records, []).section;
  const invalid = [
    makeBackup(org, records, { reports: [row] }),
    makeBackup(org, records, { volunteerOrientation: section }),
    makeBackup(org, [shift], { version: 2, volunteerOrientation: section }),
    makeBackup(org, records, { version: 2, volunteerOrientation: {
      ...section, marker: { ...marker, disposition: "verified" },
    } }),
  ];
  for (const value of invalid)
    assert.throws(() => validateBackup(value, "destination_org", "owner"), { code: "orientation_backup" });
});

test("a trashed shift keeps its marker in the source archive", () => {
  const row = makeVolunteerOrientationMarkerRow("source_org", "staff", marker);
  const { section } = exportVolunteerOrientation([row], "source_org", [program], [shift]);
  const backup = makeBackup(org, [program], { trash: [shift], version: 2, volunteerOrientation: section });
  assert.deepEqual(restoredVolunteerOrientation(backup), { marker, restore: false });
});
