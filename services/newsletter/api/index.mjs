import { config } from '../lib/config.mjs';
import { database } from '../lib/database.mjs';
import { provider } from '../lib/provider.mjs';
import { createHandler } from '../lib/handler.mjs';
const settings = config();
let handler;
function route(request) {
  handler ||= createHandler({ settings, db: database(settings.databaseUrl), mail: provider(settings) });
  return handler(request);
}
export const GET = route;
export const POST = route;
export const OPTIONS = route;
