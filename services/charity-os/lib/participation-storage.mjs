/** One closed marker specification for serializer version and SQL accounting.
 * No DB, environment, model, callbacks or request-provided budget mode. */
const paths = Object.freeze([
  Object.freeze(["frozen", Object.freeze(["interval"])]),
  Object.freeze(["frozen", Object.freeze(["allocationHash"])]),
  Object.freeze(["frozen", Object.freeze(["allocationKnown"])]),
  Object.freeze(["consent", Object.freeze(["allocationHash"])]),
  Object.freeze(["consent", Object.freeze(["terms", "intervalPolicy"])]),
  Object.freeze(["frozen", Object.freeze(["terms", "intervalPolicy"])]),
]);
const own = (value, key) => Object.hasOwn(value ?? {}, key);
const hasPath = (value, path) => {
  for (let i = 0; i < path.length - 1; i++) value = value?.[path[i]];
  return own(value, path.at(-1));
};
// Source rows are admitted by the column object-only CHECK: JSONB null is
// refused, so a JS null from pg represents SQL NULL, never an interval marker.
// Pre-upgrade rows can omit the not-yet-added column. This is classification,
// not semantic source/restore admission.
export function participationVersion(targets, rows) {
  return targets.some((t) => own(t.terms, "intervalPolicy")) ||
    rows.some(
      (p) =>
        p.requested_interval != null ||
        paths.some(([column, path]) => hasPath(p[column], path)),
    )
    ? 3
    : 2;
}
/** Native version is separate from interval basis; caller supplies only its
 * descriptor-checked actual outbox presence, never a capacity/authority flag. */
export function participationEnvelopeVersion(targets, rows, reminderPresent) {
  if (typeof reminderPresent !== "boolean") throw new Error("Invalid reminder presence.");
  const basis = participationVersion(targets, rows);
  return reminderPresent ? { version: 4, basisVersion: basis } : { version: basis };
}
const sqlMarker = (base, path) => {
  const key = path.at(-1),
    parent = path
      .slice(0, -1)
      .reduce((sql, segment) => `(${sql}->'${segment}')`, base);
  return `(jsonb_typeof(${parent})='object' AND ${parent} ? '${key}')`;
};
// All identifiers, paths and the organization parameter are server constants.
const legacyPredicate = `NOT EXISTS(SELECT 1 FROM os_participation_targets ps_target WHERE ps_target.org_id=$1 AND ${sqlMarker("ps_target.terms", ["intervalPolicy"])}) AND NOT EXISTS(SELECT 1 FROM os_participations ps_row WHERE ps_row.org_id=$1 AND (ps_row.requested_interval IS NOT NULL OR ${paths.map(([column, path]) => sqlMarker(`ps_row.${column}`, path)).join(" OR ")}))`;
export const PARTICIPATION_LEGACY_SQL = `(${legacyPredicate})`;
export function participationIntervalChargeJsonSQL(alias) {
  if (!["t", "p", "r"].includes(alias))
    throw new Error("Unknown internal participation row alias.");
  return `(CASE WHEN ${PARTICIPATION_LEGACY_SQL} THEN to_jsonb(${alias})-'requested_interval' ELSE to_jsonb(${alias}) END)`;
}
// Deliberate upgrade policy: only a whole-org absence proof can credit the
// new SQL NULL column. Full raw rows remain observable and independently measured.
export const PARTICIPATION_REMINDER_LEGACY_SQL = `(NOT EXISTS(SELECT 1 FROM os_participations pr_row WHERE pr_row.org_id=$1 AND (pr_row.reminder_consent IS NOT NULL OR pr_row.last_command->>'format'='charitology-participation-reminder-choice' OR pr_row.last_command->>'method'='participation-reminder-v1')) AND NOT EXISTS(SELECT 1 FROM os_participation_outbox pr_outbox WHERE pr_outbox.org_id=$1 AND (pr_outbox.intent_kind='reminder' OR pr_outbox.payload ? 'reminder')) AND NOT EXISTS(SELECT 1 FROM os_previews pr_preview WHERE pr_preview.org_id=$1 AND pr_preview.kind='participation-reminder-v1'))`;
export function participationChargeJsonSQL(alias) {
  const interval = participationIntervalChargeJsonSQL(alias);
  return `(CASE WHEN ${PARTICIPATION_REMINDER_LEGACY_SQL} THEN (${interval})-'reminder_consent' ELSE ${interval} END)`;
}
/** Called only after restoredParticipation strictly admitted the complete input.
 * Interval basis3 always charges its requested_interval key, including NULL. */
export function legacyRecoveredParticipation(backup, normalized) {
  const basis = backup.participation?.version === 4 ? backup.participation.basisVersion : backup.participation?.version;
  if (![1, 2].includes(basis)) return false;
  return (
    participationVersion(
      normalized.targets,
      normalized.participations.map((p) => ({
        requested_interval: p.requestedInterval ?? null,
        frozen: p.frozen,
        consent: p.consent,
      })),
    ) === 2
  );
}
