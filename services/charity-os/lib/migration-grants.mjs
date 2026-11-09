// Shared by the real migration entry point and isolated-schema acceptance tests.
// Identifiers are never supplied by an HTTP caller.
function identifiers(role, schema) {
  if (
    ![role, schema].every(
      (value) =>
        typeof value === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(value),
    )
  )
    throw new Error("Invalid migration role or schema.");
  const q = (value) => '"' + value + '"',
    target = q(schema),
    grantee = q(role);
  const table = (name) => target + "." + q(name);
  return { target, grantee, table };
}
/** New-family-only grant surface, also used by the ordinary migration. */
export function participationGroupGrantsSql(role, schema = "public") {
  const { grantee, table } = identifiers(role, schema);
  const family = ["os_participation_groups", "os_participation_group_receipts"].map(table).join(",");
  return `GRANT SELECT,INSERT ON ${family} TO ${grantee};
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON ${family} FROM ${grantee};
GRANT UPDATE(state,revision,last_command_hash,updated_at) ON ${table("os_participation_groups")} TO ${grantee};
REVOKE ALL ON ${family} FROM PUBLIC;`;
}
/** Bound runtime access to the two exclusive resource tables. */
export function resourceReservationGrantsSql(role, schema = "public") {
  const { grantee, table } = identifiers(role, schema);
  const holds = table("os_resource_reservations");
  const commands = table("os_resource_reservation_commands");
  const family = holds + "," + commands;
  return `REVOKE ALL ON ${family} FROM ${grantee}, PUBLIC;
GRANT SELECT,INSERT ON ${family} TO ${grantee};
GRANT UPDATE(state,revision,terminal_command_hash,disposition) ON ${holds} TO ${grantee};`;
}
export function applicationGrantsSql(role, schema = "public") {
  const { target, grantee, table } = identifiers(role, schema);
  return `GRANT USAGE ON SCHEMA ${target} TO ${grantee};
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${target} TO ${grantee};
REVOKE UPDATE,DELETE ON ${["os_events", "os_reports", "os_task_recurrence_occurrences", "os_resource_directory_history", "os_learning_history", "os_incubator_history"].map(table).join(",")} FROM ${grantee};
REVOKE DELETE ON ${table("os_task_recurrence_series")} FROM ${grantee};
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON ${table("os_participation_checkins")} FROM ${grantee};
GRANT UPDATE(revision,withdrawn_at,withdrawal_receipt,updated_at) ON ${table("os_participation_checkins")} TO ${grantee};
REVOKE ALL ON ${table("os_participation_checkins")} FROM PUBLIC;
${participationGroupGrantsSql(role, schema)}
${resourceReservationGrantsSql(role, schema)}
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${target} TO ${grantee};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${target} GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${grantee};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${target} GRANT USAGE,SELECT ON SEQUENCES TO ${grantee};`;
}
