/**
 * Optional, inactive group history only; no live state or receipt authority.
 * Closed v1: {format,version,method,groups,checksum}. Groups are strictly sorted
 * by ASCII id. The checksum covers the fixed domain plus the canonical body
 * without checksum; it is content integrity, not authentication or consent.
 * Absent input returns null; an explicit empty input remains an empty envelope.
 * Empty export returns undefined so existing group-free packets stay unchanged.
 * Limits are nominal JSON bounds, not measured SQL/native recovery capacity.
 */
import { isProxy } from "node:util/types";
import { hash, stable } from "./security.mjs";
import {
  GROUP_METHOD,
  GROUP_LIMITS,
  ParticipationGroupError,
  validateGroupHistory,
} from "./participation-group-model.mjs";

export const PARTICIPATION_GROUP_BACKUP_FORMAT = "charitology-participation-groups";
export const PARTICIPATION_GROUP_BACKUP_DOMAIN = "charitology:participation-groups-backup:v1\0";
export const PARTICIPATION_GROUP_BACKUP_LIMITS = Object.freeze({
  groups: GROUP_LIMITS.groups,
  bytes: GROUP_LIMITS.familyBytes,
  historyBytes: GROUP_LIMITS.historyBytes,
});
const KEYS = ["format", "version", "method", "groups", "checksum"];
const SHA = /^[a-f0-9]{64}$/;
const invalid = (code = "participation_group_backup") => {
  throw new ParticipationGroupError(code);
};

// Admit only the shallow container here. The model owns each history separately;
// its 128 KiB generic graph bound must never become a whole-family limit.
function historiesArray(input) {
  if (!input || typeof input !== "object" || isProxy(input) ||
      !Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(input, "length");
  if (!length || !Object.hasOwn(length, "value") || !Number.isSafeInteger(length.value) ||
      length.value < 0 || length.value > PARTICIPATION_GROUP_BACKUP_LIMITS.groups)
    invalid("participation_group_limit");
  const keys = Reflect.ownKeys(input), expected = new Set(["length"]);
  for (let i = 0; i < length.value; ++i) expected.add(String(i));
  if (keys.length !== expected.size || !keys.every(key => expected.has(key))) invalid();
  const values = [];
  for (let i = 0; i < length.value; ++i) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
    values.push(descriptor.value);
  }
  return values;
}

function envelopeFields(input) {
  if (!input || typeof input !== "object" || isProxy(input) ||
      Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== KEYS.length || !keys.every(key => KEYS.includes(key))) invalid();
  const result = {};
  for (const key of KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) invalid();
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
  }
  return result;
}

function admittedHistories(input, sort) {
  const groups = historiesArray(input).map(value => validateGroupHistory(value));
  const ids = new Set();
  for (const group of groups) {
    if (ids.has(group.id)) invalid("participation_group_duplicate");
    ids.add(group.id);
  }
  if (sort) groups.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  else for (let i = 1; i < groups.length; ++i) if (groups[i - 1].id >= groups[i].id) invalid();
  return Object.freeze(groups);
}

function sealed(groups, expectedChecksum) {
  // Only model-admitted detached histories reach stable/hash. This uses the
  // existing canonicalizer without re-cloning the complete family through the
  // generic model bound. Include the checksum field in the family byte budget.
  const body = { format: PARTICIPATION_GROUP_BACKUP_FORMAT, version: 1, method: GROUP_METHOD, groups };
  if (Buffer.byteLength(stable({ ...body, checksum: "0".repeat(64) })) > PARTICIPATION_GROUP_BACKUP_LIMITS.bytes)
    invalid("participation_group_limit");
  const checksum = hash(PARTICIPATION_GROUP_BACKUP_DOMAIN + stable(body));
  if (expectedChecksum !== undefined && checksum !== expectedChecksum) invalid();
  return Object.freeze({ ...body, checksum });
}

export function validateParticipationGroupsBackup(input) {
  if (input === undefined) return null;
  const fields = envelopeFields(input);
  if (fields.format !== PARTICIPATION_GROUP_BACKUP_FORMAT || fields.version !== 1 ||
      fields.method !== GROUP_METHOD || typeof fields.checksum !== "string" || !SHA.test(fields.checksum)) invalid();
  return sealed(admittedHistories(fields.groups, false), fields.checksum);
}

/** Callers explicitly project live receipts with projectGroupHistory first. */
export function makeParticipationGroupsBackup(histories) {
  const groups = admittedHistories(histories, true);
  return groups.length ? sealed(groups) : undefined;
}
