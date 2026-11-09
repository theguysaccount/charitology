import { VOLUNTEER_SUBSTITUTION_CATALOG_SQL } from "../../lib/volunteer-substitution-schema.mjs";

// Legacy capacity and transaction fixtures model a workspace with no handoff
// schema or history. All other queries continue through their original fakes.
export function legacyVolunteerSubstitutions(sql) {
  if (sql === VOLUNTEER_SUBSTITUTION_CATALOG_SQL.layout) {
    return { rowCount: 1, rows: [{
      core: true, choices: false, accepted: false, expiry: false, guard: false, shaped: false,
    }] };
  }
  if (sql.startsWith("\n  /*volunteer-substitution:retention*/")) {
    return { rowCount: 1, rows: [{ blocked: false }] };
  }
}
