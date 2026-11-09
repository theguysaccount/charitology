import { audit, notePublicFeedbackReceiptReplay, rowRecord } from "./database.mjs";
import { requireFeedbackIntakeStaff } from "./feedback-intake-access.mjs";
import { proposedFeedbackForm } from "./feedback-intake-form.mjs";
import { recordFeedbackPublication } from "./feedback-intake-publication.mjs";
import { feedbackIntakeSchemaReady } from "./feedback-intake-schema.mjs";
import { publicationAccepting } from "./intake.mjs";
import { fail, hash, json } from "./security.mjs";
import { parseBackupJson, readBackupBodyBytes } from "./backup-json.mjs";

const path = /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/intake\/feedback\/(template|publications)$/;
const headers = { "referrer-policy": "no-referrer" };
const clearQuery = url => {
  const query = new URLSearchParams(url.search);
  if (query.getAll("path").length === 1 && query.get("path") === url.pathname.slice(5))
    query.delete("path");
  return query;
};
const expected = new Set([
  "feedback_retention", "feedback_form_profile", "feedback_publication_fields",
  "feedback_staff_authority", "feedback_publication_revision", "feedback_publication_approval",
  "feedback_publication_previous", "feedback_publication_capacity", "intake_daily",
]);

export async function feedbackIntakeStaffSetup({ request, url, db, session, settings, admitWorkspace }) {
  const match = path.exec(url.pathname);
  if (!match) return null;
  const [, org, operation] = match;
  const template = operation === "template";
  if (request.method !== (template ? "GET" : "POST"))
    fail(405, "feedback_setup_method", "Read a form template or publish an approved feedback form.");
  const query = clearQuery(url);
  if (template
    ? (query.size !== 1 || !query.has("retentionUntil") || request.body !== null ||
       request.headers.has("transfer-encoding") ||
       (request.headers.has("content-length") && request.headers.get("content-length") !== "0"))
    : query.size !== 0)
    fail(400, "feedback_setup_request", "Use the documented feedback setup fields.");
  const actor = session.user.id;
  await db.limit("feedback-setup:" + hash(actor), 60, 3600);
  let input;
  if (!template) {
    await db.tx(actor, org, c => requireFeedbackIntakeStaff(c, org, session, { readOnly: true }), { readOnly: true });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
      fail(415, "feedback_setup_type", "Send the reviewed form and revision as JSON.");
    const bytes = await readBackupBodyBytes(request, 4096);
    try { input = parseBackupJson(bytes, 4096); }
    catch { fail(400, "feedback_setup_json", "Use valid JSON with each field once."); }
  }
  try {
    return await db.tx(actor, org, async c => {
      await requireFeedbackIntakeStaff(c, org, session, { readOnly: template });
      if (!(await feedbackIntakeSchemaReady(c)))
        fail(503, "feedback_setup_storage", "Anonymous feedback is not available for new forms.");
      if (template) {
        const date = query.get("retentionUntil");
        const form = proposedFeedbackForm(date);
        const today = (await c.query(
          "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day",
        )).rows[0]?.day;
        if (!today || date < today)
          fail(422, "feedback_retention", "Choose today or a later retention review date.");
        return json({ ok: true, form }, 200, headers);
      }
      const result = await recordFeedbackPublication(c, {
        orgId: org, input,
        authenticate: async () =>
          (await requireFeedbackIntakeStaff(c, org, session, { readOnly: false })).member.userId,
        loadSource: async (_, orgId, id) => {
          const row = (await c.query(
            "SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND module_id='forms' AND deleted_at IS NULL FOR SHARE",
            [orgId, id],
          )).rows[0];
          return row ? rowRecord(row) : null;
        },
        isAccepting: publicationAccepting,
        saveAudit: (_, event) => audit(c, org, actor, event.action, event.record, event.detail),
        admit: admitWorkspace,
        urlFor: (orgId, id) => `${settings.origin}/p/${orgId}.${id}`,
      });
      if (result.replayed) notePublicFeedbackReceiptReplay(c, org);
      return json({ ok: true, ...result }, result.replayed ? 200 : 201, headers);
    }, { lock: true, readOnly: template });
  } catch (error) {
    if (expected.has(error?.code)) fail(error.status, error.code, error.message);
    throw error;
  }
}
