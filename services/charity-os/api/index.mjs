import { settings as readSettings } from "../lib/security.mjs";
import { database } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
import { mailer } from "../lib/mail.mjs";
import { createHandler } from "../lib/handler.mjs";
let handler;
function route(request) {
  if (!handler) {
    const settings = readSettings(),
      db = database(settings.databaseUrl),
      send = mailer(settings),
      auth = authentication({ settings, db, send });
    handler = createHandler({ settings, db, send, auth });
  }
  return handler(request);
}
export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
export const OPTIONS = route;
