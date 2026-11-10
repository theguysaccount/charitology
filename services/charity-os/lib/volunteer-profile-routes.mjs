import { createHmac } from "node:crypto";
import { readBackupBody } from "./backup-json.mjs";
import { participantEmail, participantQuery, verifiedParticipant } from "./participants.mjs";
import { checkCsrf, equal, fail, hash, json } from "./security.mjs";
import {
  VOLUNTEER_PROFILE_REQUEST_BYTES, ownVolunteerProfileView, planVolunteerProfileChange,
  validateVolunteerProfileCommand, volunteerProfileChanged, volunteerProfileTimeZone, volunteerProfileUnavailable,
} from "./volunteer-profile-model.mjs";
import { createVolunteerProfileStore } from "./volunteer-profile-storage.mjs";

const PATH = /^\/api\/participant\/orgs\/([A-Za-z0-9_-]{1,100})\/requests\/([A-Za-z0-9_-]{1,100})\/volunteer-profile$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/, LINK = /^[a-f0-9]{32}$/;
const LOCK = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";
const DISCOVERY = "volunteer_profile_discovery";
const sql6 = field => "to_char(" + field + " AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')";
const available = result => result?.rowCount === 1 && result.rows?.length === 1 ? result.rows[0] : volunteerProfileUnavailable();

export function volunteerProfileConfiguration(env = process.env) {
  return env.OS_VOLUNTEER_PROFILE_ENABLED === "1"
    ? { applicationSchema: "public", storageSchema: env.OS_VOLUNTEER_PROFILE_STORAGE_SCHEMA } : null;
}

function scopeToken(secret, scope, sessionId) {
  if (typeof secret !== "string" || secret.length < 32)
    fail(503, "volunteer_profile_storage", "Volunteer preferences are temporarily unavailable.");
  return createHmac("sha256", secret).update(JSON.stringify([
    "own-volunteer-profile-v1",scope.orgId,scope.intakeId,scope.userId,sessionId,scope.linkId,
    scope.linkRevision,scope.linkCreatedAt,scope.intakeRevision,scope.intakeCreatedAt,scope.publicationId,
    scope.publicationCreatedAt,scope.workspaceTimeZone,
  ])).digest("hex");
}
async function readCommand(request, session, settings) {
  checkCsrf(request, session, settings);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
    fail(415, "content_type", "Supply JSON.");
  try { return validateVolunteerProfileCommand(await readBackupBody(request, VOLUNTEER_PROFILE_REQUEST_BYTES)); }
  catch (error) {
    if (error.code === "backup_json")
      fail(422, "volunteer_profile_fields", "Use a single valid volunteer preference request.");
    if (error.code === "size")
      fail(413, "size", "This volunteer preference request is too large.");
    throw error;
  }
}

/** This own route is mounted separately after the private schema is qualified.
 * Both identity reads reuse the existing participant access boundary. */
export function createVolunteerProfileRoute({ applicationSchema, storageSchema }) {
  const store = createVolunteerProfileStore({ applicationSchema, storageSchema });
  // Store construction has already validated the exact identifier.
  const app = '"' + applicationSchema + '".';
  const ownLink = "SELECT id FROM " + app + "os_participant_links WHERE user_id=$1 AND org_id=$2 AND intake_id=$3 AND revoked_at IS NULL LIMIT 2";
  const currentScope = `SELECT l.id AS "linkId",l.revision AS "linkRevision",${sql6("l.created_at")} AS "linkCreatedAt",
    i.revision AS "intakeRevision",${sql6("i.created_at")} AS "intakeCreatedAt",
    f.id AS "publicationId",${sql6("f.created_at")} AS "publicationCreatedAt",
    o.time_zone AS "workspaceTimeZone",u.email AS "verifiedEmail",i.answers->>'email' AS "requestEmail"
    FROM ${app}os_participant_links l
    JOIN ${app}os_intake i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id
    JOIN ${app}os_publications f ON f.org_id=i.org_id AND f.id=i.publication_id AND f.kind='volunteer-interest'
    JOIN ${app}os_orgs o ON o.id=l.org_id
    JOIN ${app}"user" u ON u.id=l.user_id AND u."emailVerified"
    JOIN ${app}"session" s ON s."userId"=u.id AND s.id=$5 AND s."expiresAt">statement_timestamp()
    WHERE l.org_id=$1 AND l.intake_id=$2 AND l.user_id=$3 AND l.id=$4 AND l.revoked_at IS NULL
    AND i.status IN ('pending','reviewed','converted') AND i.erased_at IS NULL AND i.cancelled_at IS NULL`;

  async function readScope(c, { orgId, intakeId, actor, linkId, sessionId, write }) {
    const row = available(await c.query(currentScope + (write ? " FOR UPDATE OF l,i FOR SHARE OF f,o,u,s" : ""),
      [orgId,intakeId,actor.id,linkId,sessionId]));
    if (row.linkId !== linkId || !ID.test(row.publicationId) ||
        !Number.isInteger(row.linkRevision) || row.linkRevision < 1 ||
        !Number.isInteger(row.intakeRevision) || row.intakeRevision < 1 ||
        participantEmail(row.verifiedEmail) !== actor.email || participantEmail(row.requestEmail) !== actor.email)
      volunteerProfileUnavailable();
    return {
      orgId,intakeId,userId:actor.id,linkId,
      linkRevision:row.linkRevision,linkCreatedAt:row.linkCreatedAt,intakeRevision:row.intakeRevision,
      intakeCreatedAt:row.intakeCreatedAt,publicationId:row.publicationId,publicationCreatedAt:row.publicationCreatedAt,
      workspaceTimeZone:volunteerProfileTimeZone(row.workspaceTimeZone),
    };
  }
  async function route({ request, url = new URL(request.url), db, session, settings }) {
    const match = PATH.exec(url.pathname);
    if (!match) return null;
    const actor = verifiedParticipant(session);
    const sessionId = session.session.id;
    if (typeof sessionId !== "string" || !ID.test(sessionId)) fail(401, "session", "Sign in again to open these preferences.");
    participantQuery(url);
    const write = request.method === "POST";
    if (!write && request.method !== "GET")
      fail(405, "volunteer_profile_method", "Use GET or POST for volunteer preferences.");
    if (!write && (request.body !== null || request.headers.has("transfer-encoding") ||
        (request.headers.has("content-length") && request.headers.get("content-length") !== "0")))
      fail(400, "volunteer_profile_body", "Read volunteer preferences without a request body.");
    const command = write ? await readCommand(request, session, settings) : null;
    const bucket = command?.operation ?? "read";
    await db.limit("own-volunteer-profile-" + bucket + ":" + hash(actor.id), write ? 60 : 120, 3600);

    const [,orgId,intakeId] = match;
    const linkId = await db.tx(actor.id, null, async c => {
      const link = available(await c.query(ownLink,[actor.id,orgId,intakeId]));
      if (!LINK.test(link.id)) volunteerProfileUnavailable();
      return link.id;
    }, { readOnly: true });
    return db.tx(actor.id, orgId, async c => {
      // This private sidecar has its own one-row-per-link storage bound and
      // writes no workspace export state. Acquire the same tenant lock as
      // intake exits, independent of ordinary workspace admission.
      if (write) await c.query(LOCK,[orgId]);
      const scope = await readScope(c,{ orgId,intakeId,actor,linkId,sessionId,write });
      const scopeSha256 = scopeToken(settings.secret,scope,sessionId);
      if (command && !equal(command.scopeSha256,scopeSha256)) volunteerProfileChanged();
      await store.requireReady(c);
      let profile = await store.read(c,scope);
      let replayed = false;
      if (command) {
        const decision = planVolunteerProfileChange(profile,command,scope.workspaceTimeZone);
        if (decision.write) profile = await store.write(c,scope,command.expectedRevision,decision.write);
        replayed = decision.replayed;
      }
      return json({ok:true,version:1,...ownVolunteerProfileView(profile,scope.workspaceTimeZone),scopeSha256,replayed},
        200,{"referrer-policy":"no-referrer"});
    }, { readOnly: !write });
  }
  // The existing detail read supplies its own link inside the tenant read
  // transaction. Keep discovery passive even when an optional SQL probe fails.
  return Object.freeze(Object.assign(route, {
    async available(c, { orgId, intakeId, linkId, linkRevision, intakeRevision, publicationId, session, settings }) {
      const actor = verifiedParticipant(session), sessionId = session.session.id;
      if (typeof sessionId !== "string" || !ID.test(sessionId) || typeof linkId !== "string" || !LINK.test(linkId) ||
          typeof settings.secret !== "string" || settings.secret.length < 32) return false;
      await c.query("SAVEPOINT " + DISCOVERY);
      try {
        const scope = await readScope(c,{ orgId,intakeId,actor,linkId,sessionId,write:false });
        if (scope.linkRevision !== linkRevision || scope.intakeRevision !== intakeRevision || scope.publicationId !== publicationId)
          return false;
        await store.requireReady(c);
        return true;
      } catch {
        await c.query("ROLLBACK TO SAVEPOINT " + DISCOVERY);
        return false;
      } finally {
        await c.query("RELEASE SAVEPOINT " + DISCOVERY);
      }
    },
  }));
}
