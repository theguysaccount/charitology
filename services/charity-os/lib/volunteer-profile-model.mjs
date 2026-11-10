import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import { validateGroupExactStamp } from "./participation-group-model.mjs";

export const VOLUNTEER_PROFILE_SKILLS = Object.freeze([
  "event-support", "operations", "communications", "translation",
  "technology", "fundraising", "research", "logistics",
]);
const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const bands = ["morning", "afternoon", "evening"];
export const VOLUNTEER_PROFILE_WINDOWS = Object.freeze(days.flatMap(day => bands.map(band => day + "-" + band)));
export const VOLUNTEER_PROFILE_REQUEST_BYTES = 1536;
export const VOLUNTEER_PROFILE_MAX_REVISION = 2147483647;
const MAX = VOLUNTEER_PROFILE_MAX_REVISION;
const bounds = list => (1 << list.length) - 1;
export const VOLUNTEER_PROFILE_MASKS = Object.freeze({
  skills: bounds(VOLUNTEER_PROFILE_SKILLS),
  availability: bounds(VOLUNTEER_PROFILE_WINDOWS),
});
const FIELDS = ["version", "operation", "expectedRevision", "scopeSha256", "acknowledge"];
const bad = () => fail(422, "volunteer_profile_fields", "Use the listed skills and typical times.");
export const volunteerProfileChanged = () => fail(409, "volunteer_profile_changed", "Reload your volunteer preferences before saving again.");
export const volunteerProfileUnavailable = () => fail(404, "volunteer_profile", "These volunteer preferences are unavailable.");
const malformed = () => fail(503, "volunteer_profile_storage", "Volunteer preferences are temporarily unavailable.");
const plain = value => value && typeof value === "object" && !isProxy(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const within = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
function exact(value, fields) {
  if (!plain(value) || Reflect.ownKeys(value).length !== fields.length) bad();
  return Object.fromEntries(fields.map(key => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property?.enumerable || !Object.hasOwn(property, "value")) bad();
    return [key, property.value];
  }));
}
function encodeSelections(value, choices) {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > choices.length || Reflect.ownKeys(value).length !== value.length + 1) bad();
  let mask = 0;
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property?.enumerable || !Object.hasOwn(property, "value")) bad();
    const choiceIndex = choices.indexOf(property.value);
    if (choiceIndex < 0 || (mask & (1 << choiceIndex))) bad();
    mask |= 1 << choiceIndex;
  }
  return mask;
}
const selected = (choices, mask) => choices.filter((_, index) => (mask & (1 << index)) !== 0);

export function volunteerProfileTimeZone(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_+/:.-]{1,100}$/.test(value)) malformed();
  try { new Intl.DateTimeFormat("en", { timeZone: value }); }
  catch { malformed(); }
  return value;
}

export function validateVolunteerProfileCommand(raw) {
  const operation = plain(raw) && Object.getOwnPropertyDescriptor(raw, "operation")?.value;
  if (operation !== "save" && operation !== "clear") bad();
  const value = exact(raw, operation === "save" ? [...FIELDS, "skills", "availability"] : FIELDS);
  if (value.version !== 1 || value.acknowledge !== true || !within(value.expectedRevision, MAX) ||
      typeof value.scopeSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.scopeSha256)) bad();
  const skills = operation === "save" ? encodeSelections(value.skills, VOLUNTEER_PROFILE_SKILLS) : 0;
  const availability = operation === "save" ? encodeSelections(value.availability, VOLUNTEER_PROFILE_WINDOWS) : 0;
  if (operation === "save" && !(skills || availability)) bad();
  return Object.freeze({ operation, expectedRevision: value.expectedRevision, scopeSha256: value.scopeSha256, skills, availability });
}

export function storedVolunteerProfile(raw) {
  if (raw === null) return null;
  const { revision, skills, availability, timeZone, updatedAtExact } = raw ?? {};
  if (!within(revision, MAX) || !revision || !within(skills, VOLUNTEER_PROFILE_MASKS.skills) ||
      !within(availability, VOLUNTEER_PROFILE_MASKS.availability) || ((skills || availability) ? timeZone === null : timeZone !== null)) malformed();
  if (timeZone !== null) volunteerProfileTimeZone(timeZone);
  try { validateGroupExactStamp(updatedAtExact); } catch { malformed(); }
  return Object.freeze({ revision, skills, availability, timeZone, updatedAtExact });
}

/** Exact Retry compares the immediately following retained revision and value.
 * A clear keeps only the revision and write time. Older saves cannot recreate it. */
export function planVolunteerProfileChange(rawCurrent, input, workspaceTimeZone) {
  const current = storedVolunteerProfile(rawCurrent);
  const revision = current?.revision ?? 0;
  const next = {
    skills: input.skills,
    availability: input.availability,
    timeZone: input.operation === "save" ? volunteerProfileTimeZone(workspaceTimeZone) : null,
  };
  const unchanged = next.skills === (current?.skills ?? 0) &&
    next.availability === (current?.availability ?? 0) && next.timeZone === (current?.timeZone ?? null);
  if (revision !== input.expectedRevision) {
    if (unchanged && revision === input.expectedRevision + 1)
      return Object.freeze({ write: null, replayed: true });
    volunteerProfileChanged();
  }
  if (unchanged) return Object.freeze({ write: null, replayed: false });
  // Save reserves the final revision for Clear even at the typed maximum.
  if (revision >= MAX || (input.operation === "save" && revision >= MAX - 1))
    fail(409, "volunteer_profile_revision", "This request has reached its preference revision limit.");
  return Object.freeze({ write: Object.freeze({ revision: revision + 1, ...next }), replayed: false });
}

export function ownVolunteerProfileView(raw, workspaceTimeZone) {
  const value = storedVolunteerProfile(raw);
  return {
    revision: value?.revision ?? 0,
    workspaceTimeZone: volunteerProfileTimeZone(workspaceTimeZone),
    profile: value && (value.skills || value.availability) ? {
      skills: selected(VOLUNTEER_PROFILE_SKILLS, value.skills),
      availability: selected(VOLUNTEER_PROFILE_WINDOWS, value.availability),
      timeZone: value.timeZone,
      updatedAtExact: value.updatedAtExact,
    } : null,
  };
}
