/** Same-client storage. Callers own the existing organization lock, verified
 * authorization, offer issuance, independent approval and outer transaction. */
import { fail } from "./security.mjs";
import { isProxy } from "node:util/types";
import { requireVolunteerSubstitutionAccess } from "./volunteer-substitution-schema.mjs";
import { SUBSTITUTION_RECEIPT_FORMAT, validateLiveVolunteerSubstitutionReceipt } from "./volunteer-substitution-receipt.mjs";

const TABLE = "os_participation_substitution_choices";
const TITLE = "Volunteer shift substitution";
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const LINK = /^[a-f0-9]{32}$/;
const SHA = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^swap_[a-f0-9]{64}$/;
const TIME = /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const TEN_MINUTES = 600000000n;
export const VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS = Object.freeze({
  choices: 256, choiceRowBytes: 2048, choiceFamilyBytes: 512 * 1024,
  receipts: 512, receiptFamilyBytes: 2 * 1024 * 1024, pruneBatch: 32,
});
const L = VOLUNTEER_SUBSTITUTION_STORAGE_LIMITS;
const SELECTOR = ["orgId", "intentId", "party"];
const ORIGINAL = [...SELECTOR, "shiftId", "shiftRevision", "participationId", "participationRevision",
  "userId", "intakeId", "linkId", "linkRevision", "personIdentitySha256", "linkScopeSha256",
  "acceptedAtExact", "expiresAtExact"];
const CHOICE = [...ORIGINAL, "choiceRevision", "withdrawnAtExact"];
const SQL6 = column => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const CHOICE_COLUMNS = `org_id AS "orgId",intent_id AS "intentId",party,shift_id AS "shiftId",shift_revision AS "shiftRevision",
  participation_id AS "participationId",participation_revision AS "participationRevision",user_id AS "userId",intake_id AS "intakeId",
  link_id AS "linkId",link_revision AS "linkRevision",person_identity_sha256 AS "personIdentitySha256",link_scope_sha256 AS "linkScopeSha256",
  ${SQL6("accepted_at")} AS "acceptedAtExact",${SQL6("expires_at")} AS "expiresAtExact",
  (CASE WHEN withdrawn_at IS NULL THEN 1 ELSE 2 END) AS "choiceRevision",${SQL6("withdrawn_at")} AS "withdrawnAtExact"`;
const REPORT_COLUMNS = `org_id,id,created_by,title,checksum,payload,${SQL6("created_at")} AS created_exact`;
const SQL = Object.freeze({
  choice: `SELECT ${CHOICE_COLUMNS} FROM ${TABLE} WHERE org_id=$1 AND intent_id=$2 AND party=$3 LIMIT 2`,
  prune: `DELETE FROM ${TABLE} WHERE org_id=$1 AND (intent_id,party) IN (
    SELECT intent_id,party FROM ${TABLE} WHERE org_id=$1 AND expires_at<=statement_timestamp()
    ORDER BY expires_at,intent_id,party LIMIT $2)`,
  insertChoice: `INSERT INTO ${TABLE}(org_id,intent_id,party,shift_id,shift_revision,participation_id,
    participation_revision,user_id,intake_id,link_id,link_revision,person_identity_sha256,link_scope_sha256,accepted_at,expires_at)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz,$15::timestamptz
    WHERE (SELECT count(*) FROM ${TABLE} WHERE org_id=$1)<$16
      AND NOT EXISTS(SELECT 1 FROM os_reports WHERE org_id=$1 AND payload->>'format'='${SUBSTITUTION_RECEIPT_FORMAT}'
        AND payload#>>'{scope,intentId}'=$2)
    RETURNING ${CHOICE_COLUMNS}`,
  withdraw: `UPDATE ${TABLE} SET withdrawn_at=$7::timestamptz
    WHERE org_id=$1 AND intent_id=$2 AND party=$3 AND participation_id=$4 AND user_id=$5 AND link_id=$6
      AND withdrawn_at IS NULL RETURNING ${CHOICE_COLUMNS}`,
  receipt: `SELECT ${REPORT_COLUMNS} FROM os_reports WHERE org_id=$1 AND id=$2 LIMIT 2`,
  insertReceipt: `WITH proposed AS (
    SELECT $1::text AS org_id,$2::text AS id,$3::text AS created_by,$4::text AS title,$5::text AS checksum,
      $6::jsonb AS payload,$7::timestamptz AS created_at
  ), usage AS (
    SELECT count(*) AS count,COALESCE(sum(octet_length(to_jsonb(r)::text)),0) AS bytes
    FROM os_reports r WHERE r.org_id=$1 AND r.payload->>'format' IN ('${SUBSTITUTION_RECEIPT_FORMAT}','charitology-volunteer-substitution-recovered')
  )
  INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload,created_at)
  SELECT q.* FROM proposed q,usage
  WHERE usage.count<$8 AND usage.bytes+octet_length(to_jsonb(q)::text)<=$9
    AND q.org_id=current_setting('app.org_id',true) AND q.created_by=current_setting('app.user_id',true)
    AND q.created_at>=transaction_timestamp() AND q.created_at<=clock_timestamp()
    AND (SELECT count(*)=2 AND count(DISTINCT a.user_id)=2 FROM jsonb_each(q.payload->'history') item(party,leg)
      JOIN ${TABLE} a ON a.org_id=q.org_id AND a.intent_id=q.payload#>>'{scope,intentId}'
        AND a.party=CASE item.party WHEN 'outgoing' THEN 'leaving' WHEN 'replacement' THEN 'joining' END
      JOIN os_participations p ON p.org_id=a.org_id AND p.id=a.participation_id
      JOIN os_records b ON b.org_id=p.org_id AND b.id=p.booking_record_id
      JOIN os_records s ON s.org_id=a.org_id AND s.id=a.shift_id
      WHERE a.shift_id=q.payload#>>'{history,shift,id}'
        AND a.shift_revision=(q.payload#>>'{history,shift,revision}')::integer
        AND a.participation_id=item.leg->>'participationId'
        AND a.participation_revision=(item.leg->>'beforeRevision')::integer
        AND a.withdrawn_at IS NULL AND a.accepted_at<=q.created_at AND a.expires_at>clock_timestamp()
        AND s.module_id='volunteers' AND s.status='open' AND s.deleted_at IS NULL AND s.revision=a.shift_revision
        AND s.data->>'kind'='shift' AND (s.data->>'startAt')::timestamptz>clock_timestamp()
        AND p.target_id=a.shift_id AND p.module_id='volunteers' AND p.source='intake' AND NOT p.recovered
        AND p.intake_id=a.intake_id AND p.requested_interval IS NULL AND p.revision=(item.leg->>'afterRevision')::integer
        AND p.state=item.leg->>'toState'
        AND CASE a.party WHEN 'leaving' THEN p.cancelled_at ELSE p.confirmed_at END=q.created_at
        AND b.id=item.leg->>'assignmentId' AND b.module_id='volunteers' AND b.deleted_at IS NULL
        AND b.data->>'kind'='assignment' AND b.data->>'shiftId'=a.shift_id AND b.data->>'contactId'=p.contact_id
        AND b.revision=(item.leg->>'assignmentAfterRevision')::integer
        AND b.status=CASE a.party WHEN 'leaving' THEN 'cancelled' ELSE 'assigned' END)
  RETURNING ${REPORT_COLUMNS}`,
});
const invalid = () => fail(422, "substitution_storage_fields", "Use the exact substitution storage fields.");
const conflict = () => fail(409, "substitution_storage_changed", "The substitution choice, source or retained decision changed.");
const limit = () => fail(422, "substitution_storage_limit", "The bounded substitution workspace could not retain this decision.");
const unavailable = () => fail(404, "substitution_storage_unavailable", "This substitution choice is unavailable.");
const need = (condition, reject = invalid) => { if (!condition) reject(); };
const matches = (value, pattern) => typeof value === "string" && value.length <= 100 && pattern.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
function shape(value, keys) {
  need(value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length);
  return Object.fromEntries(keys.map(key => {
    const data = Object.getOwnPropertyDescriptor(value, key);
    need(data?.enumerable && Object.hasOwn(data, "value"));
    return [key, data.value];
  }));
}
function micros(value) {
  need(matches(value, TIME));
  const head = value.slice(0,23) + "Z", parsed = new Date(head);
  need(Number.isFinite(+parsed) && parsed.toISOString() === head);
  return BigInt(+parsed) * 1000n + BigInt(value.slice(23,26));
}
function validSelector(value) {
  need(matches(value.orgId, ID) && matches(value.intentId, ID) && ["leaving","joining"].includes(value.party));
  return value;
}
function validOriginal(value) {
  validSelector(value);
  need(["shiftId","participationId","userId","intakeId"].every(key => matches(value[key], ID)) &&
    ["shiftRevision","participationRevision","linkRevision"].every(key => revision(value[key])) &&
    matches(value.linkId, LINK) && matches(value.personIdentitySha256, SHA) && matches(value.linkScopeSha256, SHA));
  const duration = micros(value.expiresAtExact) - micros(value.acceptedAtExact);
  need(duration > 0n && duration <= TEN_MINUTES);
  return value;
}
function validChoice(raw) {
  const value = validOriginal(shape(raw, CHOICE));
  if (value.withdrawnAtExact === null) need(value.choiceRevision === 1);
  else need(value.choiceRevision === 2 && micros(value.withdrawnAtExact) >= micros(value.acceptedAtExact));
  return Object.freeze(value);
}
function found(result, max = 1) {
  need(Array.isArray(result?.rows) && result.rows.length === result.rowCount && result.rows.length <= max);
  return result.rows;
}
const selectParams = choice => SELECTOR.map(key => choice[key]);
async function assertCurrentActor(c, orgId, userId) {
  const [row] = found(await c.query(
    "SELECT current_setting('app.org_id',true)=$1 AND current_setting('app.user_id',true)=$2 AS own", [orgId,userId]));
  need(row?.own === true, unavailable);
}
async function readChoice(c, value) {
  const [raw] = found(await c.query(SQL.choice, selectParams(value)));
  if (!raw) return null;
  const choice = validChoice(raw);
  need(SELECTOR.every(key => choice[key] === value[key]), unavailable);
  return choice;
}

/** Private projection. Staff may see both stored selectors; own routes must
 * match the actor and disclose only their own narrow public DTO. */
export async function readVolunteerSubstitutionChoice(c, raw) {
  const value = validSelector(shape(raw, SELECTOR));
  await requireVolunteerSubstitutionAccess(c);
  return readChoice(c, value);
}

/** First acceptance fixes this party's consent for this issued intent. An
 * exact retry returns the retained time and never extends its validity. */
export async function recordVolunteerSubstitutionChoice(c, raw) {
  const value = validOriginal(shape(raw, ORIGINAL));
  await requireVolunteerSubstitutionAccess(c);
  await assertCurrentActor(c, value.orgId, value.userId);
  const retained = await readChoice(c, value);
  if (retained) {
    need(ORIGINAL.slice(0,-2).every(key => retained[key] === value[key]), conflict);
    return retained;
  }
  await c.query(SQL.prune, [value.orgId,L.pruneBatch]);
  const [rawChoice] = found(await c.query(SQL.insertChoice, [...ORIGINAL.map(key => value[key]),L.choices]));
  need(rawChoice, limit);
  const inserted = validChoice(rawChoice);
  need(ORIGINAL.every(key => inserted[key] === value[key]) && inserted.choiceRevision === 1, conflict);
  return inserted;
}

export async function withdrawVolunteerSubstitutionChoice(c, raw) {
  const value = validSelector(shape(raw, [...SELECTOR,"participationId","userId","linkId","expectedRevision","atExact"]));
  need(matches(value.participationId, ID) && matches(value.userId, ID) && matches(value.linkId, LINK) && value.expectedRevision === 1);
  micros(value.atExact);
  await requireVolunteerSubstitutionAccess(c);
  await assertCurrentActor(c, value.orgId, value.userId);
  const prior = await readChoice(c, value);
  need(prior && ["participationId","userId","linkId"].every(key => prior[key] === value[key]), unavailable);
  if (prior.choiceRevision === 2) return prior;
  const [changed] = found(await c.query(SQL.withdraw, [...selectParams(value),value.participationId,value.userId,value.linkId,value.atExact]));
  need(changed, conflict);
  const next = validChoice(changed);
  need(ORIGINAL.every(key => prior[key] === next[key]) && next.choiceRevision === 2 && next.withdrawnAtExact === value.atExact, conflict);
  return next;
}
function report(raw, orgId, id) {
  const row = shape(raw, ["org_id","id","created_by","title","checksum","payload","created_exact"]);
  const receipt = validateLiveVolunteerSubstitutionReceipt(row.payload);
  need(row.org_id === orgId && receipt.scope.orgId === orgId && row.id === id && receipt.id === id &&
    matches(row.created_by, ID) && row.title === TITLE && row.checksum === receipt.sha256 &&
    row.created_exact === receipt.history.acceptedAtExact, conflict);
  return Object.freeze({ actorId: row.created_by, receipt });
}

/** Only the immutable local command namespace. Recovered history has a
 * different key and payload and cannot be found by this selector. */
export async function readVolunteerSubstitutionReceipt(c, raw) {
  const value = shape(raw, ["orgId","receiptId"]);
  need(matches(value.orgId, ID) && matches(value.receiptId, RECEIPT_ID));
  await requireVolunteerSubstitutionAccess(c);
  const [row] = found(await c.query(SQL.receipt, [value.orgId,value.receiptId]));
  return row ? report(row,value.orgId,value.receiptId) : null;
}

/** The caller already wrote both expected rows on this client. Receipt SQL
 * re-reads both states, assignment revisions and both own-choice windows. */
export async function retainVolunteerSubstitutionReceipt(c, raw) {
  const value = shape(raw, ["orgId","actorId","receipt"]);
  const receipt = validateLiveVolunteerSubstitutionReceipt(value.receipt);
  need(matches(value.orgId, ID) && value.orgId === receipt.scope.orgId && matches(value.actorId, ID));
  await requireVolunteerSubstitutionAccess(c);
  await assertCurrentActor(c,value.orgId,value.actorId);
  const [row] = found(await c.query(SQL.insertReceipt, [value.orgId,receipt.id,value.actorId,TITLE,receipt.sha256,
    JSON.stringify(receipt),receipt.history.acceptedAtExact,L.receipts,L.receiptFamilyBytes]));
  need(row, conflict);
  return report(row,value.orgId,receipt.id);
}
export const VOLUNTEER_SUBSTITUTION_STORE_SQL = SQL;
