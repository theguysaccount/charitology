import { fail } from "./security.mjs";
import {
  isVolunteerOrientationMarkerRow,
  orientationData,
  readVolunteerOrientationMarker,
  validateOrientationRecoveryMarker,
  validateVolunteerOrientationMarkerRow,
} from "./volunteer-orientation-marker.mjs";

const FORMAT = "charitology-os-volunteer-orientation-recovery";
const invalid = () => fail(422, "orientation_backup",
  "Use a complete volunteer orientation marker with its shift and program.");

function markerInRecords(marker, records, trash) {
  if (!Array.isArray(records) || !Array.isArray(trash)) invalid();
  const active = new Set(records.map((record) => record?.id));
  const sources = [...records, ...trash];
  const shifts = sources.filter((record) => record?.id === marker.targetId);
  const programs = sources.filter((record) => record?.id === marker.programId);
  if (shifts.length !== 1 || programs.length !== 1 ||
      shifts[0].moduleId !== "volunteers" || shifts[0].data?.kind !== "shift" ||
      shifts[0].data.programId !== marker.programId ||
      programs[0].moduleId !== "programs" || programs[0].data?.kind !== "program" ||
      (active.has(marker.targetId) && !active.has(marker.programId))) invalid();
  return active.has(marker.targetId);
}

export function orientationBackupSection(marker) {
  return { format: FORMAT, version: 1, marker };
}

// A dedicated v2 section makes older readers refuse the protected backup.
export function restoredVolunteerOrientation(backup) {
  if (Array.isArray(backup.reports) && backup.reports.some(isVolunteerOrientationMarkerRow))
    invalid();
  const present = Object.hasOwn(backup, "volunteerOrientation");
  if (backup.version === 1 && !present) return null;
  if (backup.version !== 2 || !present) invalid();
  const section = orientationData(backup.volunteerOrientation, ["format", "version", "marker"]);
  if (!section || section.format !== FORMAT || section.version !== 1) invalid();
  let marker;
  try { marker = validateOrientationRecoveryMarker(section.marker); }
  catch { invalid(); }
  return { marker, restore: markerInRecords(marker, backup.records, backup.trash ?? []) };
}

export function exportVolunteerOrientation(rows, org, records, trash) {
  const markers = rows.filter(isVolunteerOrientationMarkerRow);
  if (!markers.length) return { reports: rows };
  if (markers.length !== 1) invalid();
  const { marker } = validateVolunteerOrientationMarkerRow(markers[0], org);
  markerInRecords(marker, records, trash);
  return {
    reports: rows.filter((row) => row !== markers[0]),
    section: orientationBackupSection(marker),
  };
}

export async function guardOrientationSource(c, record, deleting = false) {
  if (!["programs", "volunteers"].includes(record.moduleId)) return;
  // New records, including those in an empty-workspace restore, do not have
  // an earlier active requirement. The restore installs its marker afterward.
  if (!deleting && record.revision === 1) return;
  const declaration = await readVolunteerOrientationMarker(c, record.orgId);
  if (!declaration) return;
  const { marker } = declaration;
  const changedShift = record.id === marker.targetId &&
    (deleting || record.moduleId !== "volunteers" ||
      record.data.kind !== "shift" || record.data.programId !== marker.programId);
  const changedProgram = record.id === marker.programId &&
    (deleting || record.moduleId !== "programs" || record.data.kind !== "program");
  if (changedShift || changedProgram) fail(409, "volunteer_orientation_retention",
    "Keep the shift and program linked to their saved orientation requirement.");
}
