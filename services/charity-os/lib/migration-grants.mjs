// Shared by the real migration entry point and isolated-schema acceptance tests.
// Identifiers are never supplied by an HTTP caller.
export function applicationGrantsSql(role, schema = "public") {
  if (![role, schema].every((value) => typeof value === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(value)))
    throw new Error("Invalid migration role or schema.");
  const q = (value) => '"' + value + '"', target = q(schema), grantee = q(role);
  const table = (name) => target + "." + q(name);
  return `GRANT USAGE ON SCHEMA ${target} TO ${grantee};
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${target} TO ${grantee};
REVOKE UPDATE,DELETE ON ${["os_events", "os_reports", "os_task_recurrence_occurrences", "os_resource_directory_history", "os_learning_history"].map(table).join(",")} FROM ${grantee};
REVOKE DELETE ON ${table("os_task_recurrence_series")} FROM ${grantee};
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${target} TO ${grantee};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${target} GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${grantee};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${target} GRANT USAGE,SELECT ON SEQUENCES TO ${grantee};`;
}
