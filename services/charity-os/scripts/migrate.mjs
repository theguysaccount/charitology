import { getMigrations } from "better-auth/db/migration";
import { settings as readSettings } from "../lib/security.mjs";
import { database } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
import { applicationGrantsSql } from "../lib/migration-grants.mjs";
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
    await db.pool.query(applicationGrantsSql(role));
  }
  console.log("Authentication and OS schema migrations completed.");
} finally {
  await db.close();
}
