import { fail } from "./security.mjs";
/** Complete only this owned latest-command receipt; it does not advance business revision. */
export async function retainParticipationAuditOutcome(
  c,
  org,
  p,
  auditRetained,
) {
  const last = { ...p.last_command, auditRetained: auditRetained === true };
  const row = (
    await c.query(
      "UPDATE os_participations SET last_command=$3 WHERE org_id=$1 AND id=$2 AND last_command->>'intentHash'=$4 RETURNING last_command",
      [org, p.id, JSON.stringify(last), p.last_command.intentHash],
    )
  ).rows[0];
  if (!row)
    fail(
      409,
      "participation_intent",
      "This saved command changed. Reload its current result.",
    );
  return { ...p, last_command: row.last_command };
}
