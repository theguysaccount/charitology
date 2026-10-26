import { getMigrations } from "better-auth/db/migration";
import { settings as readSettings } from "../lib/security.mjs";
import { database } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
const settings = readSettings(),
  db = database(process.env.DATABASE_URL),
  auth = authentication({
    settings,
    db,
    send: async () => {
      throw new Error("No mail during migrations.");
    },
  });
try {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await db.migrate();
  const role = process.env.OS_DATABASE_URL
    ? new URL(process.env.OS_DATABASE_URL).username
    : null;
  if (role) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(role))
      throw new Error("Invalid application role.");
    await db.pool.query(
      `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}; REVOKE UPDATE,DELETE ON os_events,os_reports FROM ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${role}; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${role};`,
    );
  }
  console.log("Authentication and OS schema migrations completed.");
} finally {
  await db.close();
}
