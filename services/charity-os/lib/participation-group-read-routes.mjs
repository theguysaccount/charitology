/** Staff reads and stateless reviews only. The main handler owns authentication,
 * CSRF, strict original-byte admission and ONE correctly classified transaction.
 * The handler classifies its exact preview paths as SQL read-only. */
import { fail, json, HttpError } from "./security.mjs";
import { ownGroupValue, GROUP_LIMITS } from "./participation-group-model.mjs";
import { participantQuery } from "./participants.mjs";
import { readGroupContext, readGroupTargetAccess } from "./participation-group-context.mjs";
import { groupDetailDTO, groupSummaryDTO } from "./participation-group-dto.mjs";
import { prepareGroupReview } from "./participation-group-review.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const ROUTE = /^participation-groups(?:\/([A-Za-z0-9_-]{1,100})(?:\/(preview-admission|preview-cancellation|admit|cancel|close))?)?$/;
const reply = value => json(value, 200, { "referrer-policy": "no-referrer" });
export const GROUP_COLLECTION_SQL = 'SELECT id FROM os_participation_groups WHERE org_id=$1 AND origin_mode=\'live\' AND live_target_id=$2 AND ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") ORDER BY id COLLATE "C" LIMIT 101';
const selector = value => {
  if (typeof value !== "string" || !ID.test(value))
    fail(400, "participation_group_query", "Choose one occurrence and its documented page cursor.");
  return value;
};
function candidates(result) {
  if (!result || !Array.isArray(result.rows) || result.rows.length > GROUP_LIMITS.groups || result.rowCount !== result.rows.length)
    fail(409, "participation_group_reconcile", "Group history needs reconciliation before it can be listed.");
  const values = result.rows.map(value => {
    const row = ownGroupValue(value, 512);
    if (Object.keys(row).length !== 1 || !Object.hasOwn(row, "id"))
      fail(409, "participation_group_reconcile", "Group history needs reconciliation before it can be listed.");
    return selector(row.id);
  });
  if (values.some((id, index) => index && id <= values[index - 1]))
    fail(409, "participation_group_reconcile", "Group history needs reconciliation before it can be listed.");
  return values;
}

export async function participationGroupReadRoutes({ c, org, session, tail, method, input = {}, url, settings }) {
  if (!tail.startsWith("participation-groups")) return null;
  const match = ROUTE.exec(tail);
  if (!match) fail(404, "route", "This group action is unavailable.");
  const [, groupId, action] = match;
  // A separate write coordinator implements these commands. No stub or dry-run
  // path here can save a group, allocate a child or return accepted success.
  if (method === "POST" && (!groupId || ["admit", "cancel", "close"].includes(action))) return null;
  const readCollection = method === "GET" && !groupId;
  if (method === "HEAD") fail(405, "group_method", "Use GET to read a group view.");
  if (!readCollection && !(method === "GET" && groupId && !action) &&
      !(method === "POST" && groupId && ["preview-admission", "preview-cancellation"].includes(action)))
    fail(405, "group_method", "Use the documented group read or review action.");
  const query = participantQuery(url || new URL(`https://os.invalid/api/orgs/${org}/${tail}`), readCollection ? ["targetId", "cursor"] : []);
  if (readCollection) {
    const targetId = selector(query.get("targetId"));
    const cursor = query.has("cursor") ? selector(query.get("cursor")) : null;
    await readGroupTargetAccess(c, { org, session, targetId });
    const ids = candidates(await c.query(GROUP_COLLECTION_SQL, [org, targetId, cursor]));
    const groups = []; let more = false;
    for (const id of ids) {
      let context;
      try { context = await readGroupContext(c, { org, session, seed: { kind: "group", groupId: id }, operation: "read", readOnly: true }); }
      catch (error) {
        // The entire group is concealed if any chosen identity is unavailable.
        // Session/membership loss and SQL/model failures always stop the view.
        if (error instanceof HttpError && error.status === 404 && error.code === "participation_group_unavailable") continue;
        throw error;
      }
      if (context.originMode !== "live" || context.group.liveTargetId !== targetId)
        fail(409, "participation_group_reconcile", "The group target changed. Reload the occurrence.");
      const summary = groupSummaryDTO(context);
      if (groups.length === 20) { more = true; break; }
      groups.push(summary);
    }
    // Never expose a scanned hidden ID or an organization-wide total/cursor.
    return reply({ ok: true, targetId, groups, nextCursor: more ? groups.at(-1).groupId : null });
  }
  if (method === "GET" && groupId && !action) {
    const context = await readGroupContext(c, { org, session, seed: { kind: "group", groupId }, operation: "read", readOnly: true });
    return reply(groupDetailDTO(context));
  }
  if (method === "POST" && groupId && ["preview-admission", "preview-cancellation"].includes(action)) {
    const admission = action === "preview-admission";
    const context = await readGroupContext(c, { org, session, seed: { kind: "group", groupId },
      operation: admission ? "admission-preview" : "cancellation-preview", readOnly: true });
    const review = await prepareGroupReview({ c, org, context, operation: admission ? "admit" : "cancel", input, secret: settings.secret });
    return reply(review.publicReview);
  }
  fail(405, "group_method", "Use the documented group read or review action.");
}
