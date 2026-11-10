import { settings as readSettings } from "../lib/security.mjs";
import { database } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
import { mailer } from "../lib/mail.mjs";
import { createHandler } from "../lib/handler.mjs";
import { createHostedVolunteerSubstitutionRuntime } from "../lib/volunteer-substitution-runtime.mjs";
import { volunteerProfileConfiguration } from "../lib/volunteer-profile-routes.mjs";
import { membershipRenewalConfiguration } from "../lib/membership-renewal-storage.mjs";
let handler;
function route(request) {
  if (!handler) {
    const settings = readSettings(),
      db = database(settings.databaseUrl),
      send = mailer(settings),
      auth = authentication({ settings, db, send });
    handler = createHandler({ settings, db, send, auth,
      volunteerSubstitutionRuntime:createHostedVolunteerSubstitutionRuntime({
        db,enabled:process.env.OS_VOLUNTEER_SUBSTITUTIONS_ENABLED==="1",
      }),
      volunteerProfileConfig:volunteerProfileConfiguration(),
      volunteerOrientationEnabled:process.env.OS_VOLUNTEER_ORIENTATION_ENABLED==="1",
      membershipRenewalConfig:membershipRenewalConfiguration() });
  }
  return handler(request);
}
export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
export const OPTIONS = route;
