/** Closed data-only Events attendance worksheet. */
import { parseBackupJson } from "./backup-json.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";
import { agreesWithZone, validInstant, validZone } from "./schedule.mjs";
import { fail, hash, id } from "./security.mjs";

export const OFFLINE_ATTENDANCE_PACKET = "charitology-os-offline-events-attendance";
export const OFFLINE_ATTENDANCE_BYTES = 2048;
export const OFFLINE_ATTENDANCE_COVERAGE = "whole-occurrence";
const MAX_COUNT = 1_000_000_000;
const ID = /^[A-Za-z0-9_-]{1,100}$/, PACKET_ID = /^[a-f0-9]{32}$/, SHA = /^[a-f0-9]{64}$/;
const PIN_FIELDS = [
  "orgId","targetId","moduleId","kind","sourceRevision","managedRevision","termsSha256",
  "startAt","endAt","timeZone","restoreEpochSha256",
];
const COUNT_FIELDS = ["reportedAttendance","registeredCount","walkInCount"];
const FILE_FIELDS = ["format","version","packetId","coverage","occurrence","counts","issueSeal"];
const ISSUE_SEAL = /^[A-Za-z0-9_-]{43}$/;
const EVIDENCE = ["packetId","fileSha256","scopeSha256","restoreEpochSha256"];

const matches = (value,pattern) => typeof value==="string" && pattern.test(value);
const revision = value => Number.isInteger(value) && value>=1 && value<=2147483647;
export const invalidOfflineAttendance = () => fail(422,"offline_attendance_fields","Use the bounded aggregate Events attendance packet.");
export function closedAttendanceValue(value,fields) {
  let own;
  try { own=ownGroupValue(value,OFFLINE_ATTENDANCE_BYTES); } catch { invalidOfflineAttendance(); }
  if (!own || Array.isArray(own) || Object.keys(own).length!==fields.length ||
      !fields.every(key=>Object.hasOwn(own,key))) invalidOfflineAttendance();
  return own;
}
export function offlineAttendanceOccurrence(input) {
  const pins=closedAttendanceValue(input,PIN_FIELDS);
  if (!matches(pins.orgId,ID) || !matches(pins.targetId,ID) || pins.moduleId!=="events" || pins.kind!=="session" ||
      !revision(pins.sourceRevision) || !revision(pins.managedRevision) ||
      !matches(pins.termsSha256,SHA) || !matches(pins.restoreEpochSha256,SHA) ||
      !validInstant(pins.startAt) || !validInstant(pins.endAt) || Date.parse(pins.startAt)>=Date.parse(pins.endAt) ||
      typeof pins.timeZone!=="string" || !/^[A-Za-z]/.test(pins.timeZone) || !validZone(pins.timeZone) ||
      !agreesWithZone(pins.startAt,pins.timeZone) || !agreesWithZone(pins.endAt,pins.timeZone)) invalidOfflineAttendance();
  return pins;
}
function checkedPacket(input) {
  const p=closedAttendanceValue(input,FILE_FIELDS);
  if (p.format!==OFFLINE_ATTENDANCE_PACKET || p.version!==1 || !matches(p.packetId,PACKET_ID) ||
      p.coverage!==OFFLINE_ATTENDANCE_COVERAGE || !matches(p.issueSeal,ISSUE_SEAL)) invalidOfflineAttendance();
  const pins=offlineAttendanceOccurrence(p.occurrence);
  const counts=closedAttendanceValue(p.counts,COUNT_FIELDS);
  if (COUNT_FIELDS.some(key=>{
    const count=counts[key];
    return count!==null && (!Number.isSafeInteger(count) || Object.is(count,-0) || count<0 || count>MAX_COUNT);
  })) invalidOfflineAttendance();
  return Object.freeze({...p,occurrence:pins,counts});
}

/** The scope is copied from a trusted server or the fictional worksheet. */
export function makeOfflineAttendanceTemplate(pins,signIssue) {
  const occurrence=offlineAttendanceOccurrence(pins), packetId=id();
  return checkedPacket({
    format:OFFLINE_ATTENDANCE_PACKET,version:1,packetId,coverage:OFFLINE_ATTENDANCE_COVERAGE,
    occurrence,issueSeal:signIssue({packetId,occurrence}),
    counts:{reportedAttendance:null,registeredCount:null,walkInCount:null},
  });
}

export function offlineAttendanceBytes(packet) {
  const bytes=Buffer.from(JSON.stringify(checkedPacket(packet),null,2)+"\n","utf8");
  if (bytes.length>OFFLINE_ATTENDANCE_BYTES) fail(413,"offline_attendance_size","Keep the attendance file under 2 KiB.");
  return bytes;
}

/** The exact bytes matter even when a JSON editor only changes whitespace. */
export function readOfflineAttendancePacket(encoded) {
  if (typeof encoded!=="string" || !encoded.length || encoded.length>4*Math.ceil(OFFLINE_ATTENDANCE_BYTES/3))
    invalidOfflineAttendance();
  const bytes=Buffer.from(encoded,"base64");
  if (bytes.length>OFFLINE_ATTENDANCE_BYTES || bytes.toString("base64")!==encoded) invalidOfflineAttendance();
  try {
    return Object.freeze({packet:checkedPacket(parseBackupJson(bytes,OFFLINE_ATTENDANCE_BYTES)),fileSha256:hash(bytes)});
  } catch {
    invalidOfflineAttendance();
  }
}

export const offlineOccurrenceHash = pins => hash([OFFLINE_ATTENDANCE_PACKET,1,pins]);
export function offlineAttendanceEvidence(input) {
  const value=closedAttendanceValue(input,EVIDENCE);
  if (!matches(value.packetId,PACKET_ID) ||
      !["fileSha256","scopeSha256","restoreEpochSha256"].every(key=>matches(value[key],SHA))) invalidOfflineAttendance();
  return value;
}
