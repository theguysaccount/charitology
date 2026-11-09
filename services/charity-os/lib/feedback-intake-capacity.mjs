/** Server-owned sizing for the existing intake rows and their portable view. */
import { fail } from "./security.mjs";
import { participationTimestampParameter } from "./participation-timestamp.mjs";
import { feedbackSelection, requireFeedbackPublicationSchema } from "./feedback-intake-model.mjs";

export const FEEDBACK_INTAKE_HISTORY_SQL =
  "EXISTS(SELECT 1 FROM os_publications WHERE org_id=$1 AND kind='feedback')";

const limits = Object.freeze({ publications: 10000, submissions: 50000 });
const physicalTime = "2200-12-31T23:59:59.999999+14:00";
const wireTime = "2200-12-31T23:59:59.999Z";
const statuses = new Set(["pending", "reviewed", "dismissed", "converted", "cancelled"]);
const reviewable = new Set(["pending", "reviewed"]);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const stamp = value => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString() === value;
};
const over = () => fail(422, "feedback_intake_capacity", "The workspace must retain enough room to withdraw feedback forms, cancel requests, and erase answers.");
const need = condition => { if (!condition) over(); };
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const integer = value => {
  need((typeof value === "number" || typeof value === "string" && /^[0-9]+$/.test(value)) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0);
  return Number(value);
};

function inventory(intake) {
  if (!Array.isArray(intake?.publications) || !intake.publications.some(p => p?.kind === "feedback")) return null;
  need(Array.isArray(intake.publications) && intake.publications.length <= limits.publications &&
    Array.isArray(intake.submissions) && intake.submissions.length <= limits.submissions);
  const publications = new Map(), submissions = new Map();
  for (const p of intake.publications) {
    if (p.kind !== "feedback") continue;
    need(id(p.id) && !publications.has(p.id) && p.targetId === null && p.targetModule === null &&
      p.targetRevision === null && (p.withdrawnAt === null || stamp(p.withdrawnAt)));
    try { requireFeedbackPublicationSchema(p.schema); } catch { over(); }
    publications.set(p.id,p);
  }
  for (const s of intake.submissions) {
    if (!publications.has(s.publicationId)) continue;
    need(id(s.id) && !submissions.has(s.id) && statuses.has(s.status) &&
      (s.erasedAt === null || stamp(s.erasedAt)) &&
      (s.cancelledAt === null || stamp(s.cancelledAt)) &&
      (s.cancelledAt !== null) === (s.status === "cancelled") &&
      Array.isArray(s.convertedIds) && s.convertedIds.length <= 1);
    if (s.status === "converted") need(s.convertedIds.length === 1);
    if (s.convertedIds.length) {
      const [link] = s.convertedIds;
      need((s.status === "converted" || s.status === "cancelled") && link?.moduleId === "feedback" &&
        id(link.id) && Object.keys(link).length === 2);
    }
    if (s.erasedAt !== null)
      need(s.answers && typeof s.answers === "object" && !Array.isArray(s.answers) && Object.keys(s.answers).length === 0);
    else { try { feedbackSelection(s.answers); } catch { over(); } }
    submissions.set(s.id,s);
  }
  return { publications, submissions };
}

const physicalSource = {
  publications: `SELECT p.* FROM os_publications p WHERE p.org_id=$1 AND p.kind='feedback'
    ORDER BY p.id COLLATE "C" LIMIT ${limits.publications+1}`,
  submissions: `SELECT i.* FROM os_intake i JOIN os_publications p
    ON p.org_id=i.org_id AND p.id=i.publication_id
    WHERE i.org_id=$1 AND p.kind='feedback' ORDER BY i.id COLLATE "C" LIMIT ${limits.submissions+1}`,
};
const physicalRestore = {
  publications: `SELECT p.* FROM jsonb_array_elements($3::jsonb) j(value)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::os_publications,j.value) p
    WHERE p.org_id=$1 AND p.kind='feedback'`,
  submissions: `SELECT i.* FROM jsonb_array_elements($3::jsonb) j(value)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::os_intake,j.value) i WHERE i.org_id=$1`,
};

function publicationsSql(source) {
  return `WITH source AS (${source})
    SELECT p.id,p.withdrawn_at IS NULL AS can_withdraw,
      p.target_id IS NULL AND p.target_module IS NULL AND p.target_revision IS NULL AS targets_clear,
      octet_length(to_jsonb(p)::text) AS actual_bytes,
      CASE WHEN p.withdrawn_at IS NULL
      THEN GREATEST(0,octet_length(to_jsonb(f)::text)-octet_length(to_jsonb(p)::text)) ELSE 0 END AS growth_bytes
    FROM source p CROSS JOIN LATERAL jsonb_populate_record(NULL::os_publications,
      to_jsonb(p)||jsonb_build_object('withdrawn_at',$2::timestamptz)) f ORDER BY p.id COLLATE "C"`;
}

function submissionsSql(source) {
  return `WITH source AS (${source}), base AS (
    SELECT i.*,i.receipt_hash IS NOT NULL AND i.status<>'cancelled' AS can_cancel,
      i.erased_at IS NULL AS can_erase,to_jsonb(i) AS actual
    FROM source i
  )
  SELECT b.id,b.publication_id,b.status,b.can_cancel,b.can_erase,
    b.revision::bigint+b.can_cancel::int+b.can_erase::int<=2147483647 AS revision_room,
    (b.status='cancelled')=(b.cancelled_at IS NOT NULL) AS cancellation_shape,
    (b.ip_hash IS NULL AND
     (b.erased_at IS NULL OR (b.answers='{}'::jsonb AND b.payload_hash IS NULL)) AND
     ((b.receipt_hash IS NULL AND b.idempotency_hash IS NULL AND b.payload_hash IS NULL) OR
      (b.receipt_hash~'^[a-f0-9]{64}$' AND b.idempotency_hash~'^[a-f0-9]{64}$' AND
       (b.erased_at IS NOT NULL OR b.payload_hash~'^[a-f0-9]{64}$')))) IS TRUE AS anonymous_shape,
    octet_length(b.actual::text) AS actual_bytes,
    GREATEST(0,v.future_bytes-octet_length(b.actual::text)) AS growth_bytes
  FROM base b CROSS JOIN LATERAL (
    SELECT MAX(octet_length(to_jsonb(f)::text)) AS future_bytes
    FROM (VALUES (true,false),(false,true),(true,true)) v(cancel,erase)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::os_intake,b.actual||jsonb_build_object(
      'status',CASE WHEN v.cancel THEN 'cancelled' WHEN v.erase AND b.status IN ('pending','reviewed') THEN 'dismissed' ELSE b.status END,
      'revision',LEAST(b.revision::bigint+v.cancel::int+v.erase::int,2147483647)::int,
      'answers',CASE WHEN v.erase THEN '{}'::jsonb ELSE b.answers END,
      'payload_hash',CASE WHEN v.erase THEN NULL ELSE b.payload_hash END,
      'erased_at',CASE WHEN v.erase THEN $2::timestamptz ELSE b.erased_at END,
      'cancelled_at',CASE WHEN v.cancel THEN $2::timestamptz ELSE b.cancelled_at END,
      'updated_at',$2::timestamptz)) f
    WHERE (NOT v.cancel OR b.can_cancel) AND (NOT v.erase OR b.can_erase)
  ) v ORDER BY b.id COLLATE "C"`;
}

export const FEEDBACK_INTAKE_CAPACITY_SQL = Object.freeze({
  sourcePublications: publicationsSql(physicalSource.publications),
  sourceSubmissions: submissionsSql(physicalSource.submissions),
  restorePublications: publicationsSql(physicalRestore.publications),
  restoreSubmissions: submissionsSql(physicalRestore.submissions),
});

const cancel = row => ({ ...row,status:"cancelled",cancelledAt:wireTime });
const erase = row => ({ ...row,answers:{},erasedAt:wireTime,status:reviewable.has(row.status)?"dismissed":row.status });
function intakeGrowth(row, canCancel, canErase) {
  const actual = bytes(row), variants = [actual];
  if (canCancel) variants.push(bytes(cancel(row)));
  if (canErase) variants.push(bytes(erase(row)));
  if (canCancel && canErase) variants.push(bytes(erase(cancel(row))));
  return Math.max(...variants)-actual;
}

async function measure(c, org, wire, restore) {
  need(id(org));
  const typed = restore !== null;
  const measureRows = async (query, values, expected) => {
    if (!expected.size) return [];
    if (typed) need(Array.isArray(values) && values.length === expected.size);
    const sqlRows = typed ? values.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [
      key,typeof value === "string" && key.endsWith("_at") ? participationTimestampParameter(value) : value,
    ]))) : null;
    const result = await c.query(query, [org,physicalTime,...(typed?[JSON.stringify(sqlRows)]:[])]);
    need(Array.isArray(result.rows) && result.rows.length === expected.size);
    const remaining = new Set(expected.keys());
    for (const row of result.rows) need(remaining.delete(row.id));
    return result.rows;
  };
  const pubs = await measureRows(
    typed?FEEDBACK_INTAKE_CAPACITY_SQL.restorePublications:FEEDBACK_INTAKE_CAPACITY_SQL.sourcePublications,
    restore?.publications,wire.publications);
  const subs = await measureRows(
    typed?FEEDBACK_INTAKE_CAPACITY_SQL.restoreSubmissions:FEEDBACK_INTAKE_CAPACITY_SQL.sourceSubmissions,
    restore?.submissions,wire.submissions);
  const metric = { publications:pubs.length,submissions:subs.length,retainedBytes:0,nativeBytes:0,
    retainedGrowthBytes:0,nativeGrowthBytes:0,pendingWithdrawals:0,pendingCancellations:0,pendingErasures:0 };
  const account = (sql, raw, nativeGrowth) => {
    metric.retainedBytes += integer(sql.actual_bytes);
    metric.retainedGrowthBytes += integer(sql.growth_bytes);
    metric.nativeBytes += bytes(raw);
    metric.nativeGrowthBytes += nativeGrowth;
  };
  for (const row of pubs) {
    const actual = wire.publications.get(row.id), open = actual.withdrawnAt === null;
    need(row.can_withdraw === open && row.targets_clear === true && (!typed || !open));
    account(row,actual,open?bytes({ ...actual,withdrawnAt:wireTime })-bytes(actual):0);
    metric.pendingWithdrawals += Number(open);
  }
  for (const row of subs) {
    const actual = wire.submissions.get(row.id);
    need(row.publication_id === actual.publicationId && row.status === actual.status &&
      typeof row.can_cancel === "boolean" && (!row.can_cancel || actual.status !== "cancelled" && !typed) &&
      row.can_erase === (actual.erasedAt === null) &&
      row.anonymous_shape === true && row.cancellation_shape === true && row.revision_room === true);
    account(row,actual,intakeGrowth(actual,row.can_cancel,row.can_erase));
    metric.pendingCancellations += Number(row.can_cancel);
    metric.pendingErasures += Number(row.can_erase);
  }
  for (const value of Object.values(metric)) integer(value);
  return Object.freeze(metric);
}

export async function measureFeedbackIntakeRemaining(c, org, intake, { expected = false } = {}) {
  const wire = inventory(intake);
  if (wire === null) { need(!expected); return null; }
  return measure(c,org,wire,null);
}

export async function measureFeedbackIntakeRestore(c, org, intake, { publications,submissions }) {
  const wire = inventory(intake);
  if (wire === null) return null;
  return measure(c,org,wire,{
    publications:publications.filter(row=>wire.publications.has(row.id)),
    submissions:submissions.filter(row=>wire.submissions.has(row.id)),
  });
}
