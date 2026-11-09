/** Private same-client context only. No route, transaction or capacity admission.
 * Caller supplies a trusted operation; no HTTP flag creates authority here.
 */
import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import { visibleRecord, administrators, requireAdmin } from "./access.mjs";
import { rowRecord } from "./database.mjs";
import { ModuleValidationError } from "./modules.mjs";
import { ownGroupValue, groupHash } from "./participation-group-model.mjs";
import { currentGroupMember, groupRestoreEpoch, groupAuthority } from "./participation-group-access.mjs";
import { getGroup } from "./participation-group-store.mjs";
import { readParticipationGroupRowPin, createParticipationGroupInventoryPin } from "./participation-group-pins.mjs";
import { participationChargeJsonSQL, participationIntervalChargeJsonSQL } from "./participation-storage.mjs";
import { targetKind, bookingKind, parentKey, legacyActive } from "./participation-guards.mjs";
import { effectiveRequestedInterval, frozenParticipationInterval } from "./participation-intervals.mjs";
import { participationTerms, readParticipationDomainClock, readParticipationAdmissionEligibility,
  suggestParticipationFromInventory, requireParticipationPromotionReason } from "./participation.mjs";

const OPS = ["read", "replay", "create", "admission-preview", "admit", "cancellation-preview", "cancel", "close"];
const NEW_ADMISSION = new Set(["admission-preview", "admit"]);
const RAW_MAX = 61 * 1024 * 1024;
// Processing only: independently absent interval/reminder families can omit
// their SQL NULL keys from charged rows. Raw pins still retain both exact keys;
// these field/separator widths grant no additional charged storage permission.
const INTERVAL_NULL_BYTES = Buffer.byteLength(', "requested_interval": null');
const REMINDER_NULL_BYTES = Buffer.byteLength(', "reminder_consent": null');
const PROCESSING_MAX = RAW_MAX + 2000 * (INTERVAL_NULL_BYTES + REMINDER_NULL_BYTES);
const TABLE_KEYS = Object.freeze({ os_records: "id", os_participation_targets: "target_id", os_participations: "id", os_intake: "id", os_publications: "id" });
const unavailable = () => fail(404, "participation_group_unavailable", "This group context is unavailable.");
const invalid = () => fail(422, "participation_group_context", "Use the exact internal group context selectors.");
const reconcile = () => fail(409, "participation_group_reconcile", "Current source and saved allocations require reconciliation.");
const need = (v, refuse = unavailable) => { if (!v) refuse(); };
const id = v => need(typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v), invalid);
const isGraphId = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const graphId = v => need(isGraphId(v));
const ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = ids => [...new Set(ids)].sort(ascii);
const closed = (v, keys) => need(v && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), invalid);
function property(v, key) {
  need(v && typeof v === "object" && !isProxy(v), invalid);
  const d = Object.getOwnPropertyDescriptor(v, key);
  need(d?.enumerable && Object.hasOwn(d, "value"), invalid); return d.value;
}
function rows(result, max) {
  const list = property(result, "rows");
  need(Array.isArray(list) && !isProxy(list) && Object.getPrototypeOf(list) === Array.prototype, invalid);
  const size = Object.getOwnPropertyDescriptor(list, "length")?.value;
  need(Number.isSafeInteger(size) && size >= 0 && size <= max, reconcile);
  need(Reflect.ownKeys(list).length === size + 1, invalid);
  return Array.from({ length: size }, (_, n) => property(list, String(n)));
}
function smallRows(result, max) { return rows(result, max).map(row => ownGroupValue(row, 8192)); }
function selectors(input) {
  const v = ownGroupValue(input, 8192); closed(v, ["org", "seed", "operation", "readOnly"]); id(v.org);
  need(OPS.includes(v.operation) && typeof v.readOnly === "boolean", invalid);
  need(!["read","admission-preview","cancellation-preview"].includes(v.operation) || v.readOnly, invalid);
  need(!["create","admit","cancel","close"].includes(v.operation) || !v.readOnly, invalid);
  if (v.seed?.kind === "target") {
    closed(v.seed, ["kind", "targetId", "rosterIds", "coordinatorIntakeId"]); id(v.seed.targetId);
    need(v.operation === "create" && Array.isArray(v.seed.rosterIds) && v.seed.rosterIds.length >= 2 && v.seed.rosterIds.length <= 10, invalid);
    v.seed.rosterIds.forEach(id); need(new Set(v.seed.rosterIds).size === v.seed.rosterIds.length, invalid);
    if (v.seed.coordinatorIntakeId !== null) id(v.seed.coordinatorIntakeId);
  } else if (v.seed?.kind === "group") {
    closed(v.seed, ["kind", "groupId"]); id(v.seed.groupId); need(v.operation !== "create", invalid);
  } else if (v.seed?.kind === "receipt") {
    closed(v.seed, ["kind", "commandHash"]);
    need(v.operation === "replay" && typeof v.seed.commandHash === "string" && /^[a-f0-9]{64}$/.test(v.seed.commandHash), invalid);
  } else invalid();
  return v;
}

export const GROUP_CONTEXT_SQL = Object.freeze({
  lock: "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
  utc: "SET LOCAL TIME ZONE 'UTC'",
  targetSeed: "SELECT id,module_id FROM os_records WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL",
  groupSeed: "SELECT id,module_id,live_target_id,origin_mode FROM os_participation_groups WHERE org_id=$1 AND id=$2",
  receiptSeed: "SELECT g.id,g.module_id,g.live_target_id,g.origin_mode FROM os_participation_group_receipts r JOIN os_participation_groups g ON g.org_id=r.org_id AND g.id=r.group_id WHERE r.org_id=$1 AND r.command_hash=$2",
  records: "SELECT id,module_id,status,data->>'kind' AS kind,data->>'programId' AS program_id,data->>'contactId' AS contact_id,data->>'eventId' AS event_id,data->>'shiftId' AS shift_id,data->>'safeguardingId' AS safeguarding_id FROM os_records WHERE org_id=$1 AND deleted_at IS NULL ORDER BY id COLLATE \"C\" LIMIT 2001",
  selectedRecords: "SELECT id,module_id,status,data->>'kind' AS kind,data->>'programId' AS program_id,data->>'contactId' AS contact_id,data->>'eventId' AS event_id,data->>'shiftId' AS shift_id,data->>'safeguardingId' AS safeguarding_id FROM os_records WHERE org_id=$1 AND deleted_at IS NULL AND id=ANY($2::text[]) ORDER BY id COLLATE \"C\" LIMIT 65",
  parts: "SELECT id,target_id,module_id,booking_record_id,contact_id,intake_id,state,recovered,recovered_state FROM os_participations WHERE org_id=$1 ORDER BY id COLLATE \"C\" LIMIT 2001",
  roster: "SELECT id,target_id,module_id,booking_record_id,contact_id,intake_id,state,recovered,recovered_state FROM os_participations WHERE org_id=$1 AND id=ANY($2::text[]) ORDER BY id COLLATE \"C\" LIMIT 11",
  queue: "SELECT id FROM os_participations WHERE org_id=$1 AND target_id=$2 AND state='waitlisted' AND recovered=false ORDER BY waitlist_sequence NULLS LAST,created_at,id LIMIT 2001",
  targets: "SELECT target_id FROM os_participation_targets WHERE org_id=$1 ORDER BY target_id COLLATE \"C\" LIMIT 501",
  recordBudget: "SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_records t WHERE org_id=$1 AND deleted_at IS NULL",
  partBudget: `SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes,COALESCE(sum(octet_length(${participationIntervalChargeJsonSQL("t")}::text)),0)::text AS interval_charged_bytes,COALESCE(sum(octet_length(${participationChargeJsonSQL("t")}::text)),0)::text AS charged_bytes FROM os_participations t WHERE org_id=$1`,
});
async function budget(c, org, sql, max, familyBytes) {
  const found = smallRows(await c.query(sql, [org]), 1); need(found.length === 1, reconcile);
  const r = found[0], size = Number(r.bytes), charge = Number(r.charged_bytes ?? r.bytes), interval = Number(r.interval_charged_bytes ?? r.bytes);
  closed(r,sql===GROUP_CONTEXT_SQL.partBudget?["count","bytes","interval_charged_bytes","charged_bytes"]:["count","bytes"]);
  need(Number.isSafeInteger(r.count) && r.count >= 0 && r.count <= max &&
    typeof r.bytes === "string" && /^(0|[1-9][0-9]*)$/.test(r.bytes) && Number.isSafeInteger(size) && size <= RAW_MAX &&
    (r.charged_bytes === undefined || (typeof r.charged_bytes === "string" && /^(0|[1-9][0-9]*)$/.test(r.charged_bytes))) &&
    Number.isSafeInteger(charge) && charge >= 0 && charge <= familyBytes, reconcile);
  if(sql===GROUP_CONTEXT_SQL.partBudget)
    need(typeof r.interval_charged_bytes === "string" && /^(0|[1-9][0-9]*)$/.test(r.interval_charged_bytes) &&
      Number.isSafeInteger(interval) && size >= interval && interval >= charge &&
      size - interval <= r.count * INTERVAL_NULL_BYTES && interval - charge <= r.count * REMINDER_NULL_BYTES,reconcile);
}
async function processingBytes(c, org, table, ids, processing) {
  if (!ids.length) return;
  const found = smallRows(await c.query(`SELECT count(*)::int AS count,COALESCE(sum(octet_length(convert_to(to_jsonb(t)::text,'UTF8'))),0)::text AS bytes FROM ${table} t WHERE org_id=$1 AND ${TABLE_KEYS[table]}=ANY($2::text[])`, [org,sorted(ids)]),1);
  need(found.length===1,reconcile); const row=found[0]; closed(row,["count","bytes"]);
  need(Number.isSafeInteger(row.count)&&row.count>=0&&row.count<=new Set(ids).size&&typeof row.bytes==="string"&&/^(0|[1-9][0-9]*)$/.test(row.bytes),reconcile);
  const bytes=Number(row.bytes);need(Number.isSafeInteger(bytes)&&bytes>=0&&processing.bytes+bytes<=PROCESSING_MAX,reconcile);
  processing.bytes+=bytes;
}
async function seedRead(c, v) {
  const sql = v.seed.kind === "target" ? GROUP_CONTEXT_SQL.targetSeed : v.seed.kind === "group" ? GROUP_CONTEXT_SQL.groupSeed : GROUP_CONTEXT_SQL.receiptSeed;
  const key = v.seed.targetId ?? v.seed.groupId ?? v.seed.commandHash;
  const found = smallRows(await c.query(sql, [v.org, key]), 1); need(found.length === 1);
  const seed = found[0]; graphId(seed.id); need((v.seed.kind === "receipt" || seed.id === key) && ["events", "volunteers"].includes(seed.module_id)); return seed;
}
async function lockRows(c, org, table, ids, requiredIds = ids) {
  if (!ids.length) return;
  const key = TABLE_KEYS[table]; need(key, invalid);
  const found = smallRows(await c.query(`SELECT ${key} FROM ${table} WHERE org_id=$1 AND ${key}=ANY($2::text[]) ORDER BY ${key} COLLATE "C" FOR UPDATE`, [org, sorted(ids)]), ids.length);
  const actual = found.map(row => row[key]), expected = sorted(ids);
  need(new Set(actual).size === actual.length && actual.every((key,i) => expected.includes(key) && (!i || ascii(actual[i-1],key) < 0)));
  need(requiredIds.every(key => actual.includes(key)));
}
async function rawRow(c, org, table, key, pins, optional = false) {
  const sha256 = await readParticipationGroupRowPin(c, { orgId: org, table, id: key });
  if (sha256 === null) {
    need(optional);
    // An actual zero-row read, distinctly domain-separated from raw row bytes.
    pins.push(Object.freeze({ table, id: key, sha256: groupHash("pins", { orgId: org, table, id: key, absent: true }) }));
    return null;
  }
  const result = rows(await c.query(`SELECT to_jsonb(t)::text AS json_text FROM ${table} t WHERE org_id=$1 AND ${TABLE_KEYS[table]}=$2`, [org, key]), 1);
  need(result.length === 1);
  const text = property(result[0], "json_text"); need(typeof text === "string" && Buffer.byteLength(text) <= RAW_MAX, reconcile);
  // PostgreSQL itself produced this JSONB text. No generic small graph clone,
  // Date conversion or application serialization participates in its raw pin.
  const value = JSON.parse(text); need(value.org_id === org && value[TABLE_KEYS[table]] === key);
  pins.push(Object.freeze({ table, id: key, sha256 })); return value;
}
function typed(records, key, moduleId, member) {
  const r = records.find(row => row.id === key);
  need(r && r.data && typeof r.data === "object" && !Array.isArray(r.data) && r.moduleId === moduleId && visibleRecord(r, member)); return r;
}
function programs(record, records, member) {
  const program = record.data.programId;
  if (program != null && program !== "") { graphId(program); typed(records, program, "programs", member); return program; }
  return null;
}
function intakeRelationship(p, intakes, publications, source) {
  if (p.intake_id == null) return;
  const row = intakes.get(p.intake_id), publication = row && publications.get(row.publication_id);
  need(row && publication && publication.target_id === source.id && publication.target_module === source.moduleId &&
    publication.kind === (source.moduleId === "events" ? "event-interest" : "volunteer-interest") && Array.isArray(row.converted_ids) &&
    row.converted_ids.some(x => x?.id === p.booking_record_id && x.moduleId === p.module_id) &&
    row.converted_ids.some(x => x?.id === p.contact_id && x.moduleId === "contacts"));
}
const rangeOnly=range=>Object.freeze({startAt:range.startAt,endAt:range.endAt,timeZone:range.timeZone});
function projection(p, range) {
  return { participationId: p.id, bookingRecordId: p.booking_record_id, contactId: p.contact_id,
    targetId: p.target_id, moduleId: p.module_id, range:rangeOnly(range) };
}
function inventoryDigest(pins) {
  const accumulator=createParticipationGroupInventoryPin();
  for(const row of [...pins].sort((a,b)=>ascii(a.table,b.table)||ascii(a.id,b.id)))accumulator.add(row);
  return accumulator.digest();
}

/** Collection access needs a real target graph even when no group exists.
 * This is not a create selector, eligibility preview or allocation inventory. */
export async function readGroupTargetAccess(c, input) {
  need(input && typeof input === "object" && !isProxy(input) && Object.getPrototypeOf(input) === Object.prototype, invalid);
  need(Reflect.ownKeys(input).length === 3 && ["org","session","targetId"].every(k => Object.hasOwn(input,k)), invalid);
  const selected = ownGroupValue({org:property(input,"org"),targetId:property(input,"targetId")},512);
  id(selected.org); id(selected.targetId);
  const supplied=property(input,"session");
  need(supplied&&typeof supplied==="object"&&!isProxy(supplied)&&Object.getPrototypeOf(supplied)===Object.prototype,invalid);
  const suppliedSession=property(supplied,"session"),suppliedUser=property(supplied,"user");
  for(const value of [suppliedSession,suppliedUser])need(value&&typeof value==="object"&&!isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,invalid);
  const session={session:{id:property(suppliedSession,"id")},user:{id:property(suppliedUser,"id")}};
  id(session.session.id); id(session.user.id);
  const {org,targetId}=selected;
  await c.query(GROUP_CONTEXT_SQL.lock,[org]); await c.query(GROUP_CONTEXT_SQL.utc);
  const initial=await seedRead(c,{org,seed:{kind:"target",targetId}});
  const member=await currentGroupMember(c,org,session,{moduleId:initial.module_id,readOnly:true});
  const metadata=smallRows(await c.query(GROUP_CONTEXT_SQL.selectedRecords,[org,[targetId]]),1);
  need(metadata.length===1&&metadata[0].id===targetId&&metadata[0].module_id===initial.module_id&&metadata[0].kind===targetKind(initial.module_id));
  const programId=metadata[0].program_id,recordIds=[targetId];
  if(programId!=null&&programId!==""){
    graphId(programId); need(programId!==targetId);
    const program=smallRows(await c.query(GROUP_CONTEXT_SQL.selectedRecords,[org,[programId]]),1);
    need(program.length===1&&program[0].id===programId);metadata.push(program[0]);recordIds.push(programId);
  }
  const processing={bytes:0};await processingBytes(c,org,"os_records",recordIds,processing);
  await processingBytes(c,org,"os_participation_targets",[targetId],processing);
  const pins=[],records=[];
  for(const key of sorted(recordIds)){
    const row=await rawRow(c,org,"os_records",key,pins);need(row.deleted_at==null);
    records.push(rowRecord({...row,created_at:new Date(row.created_at),updated_at:new Date(row.updated_at)}));
  }
  for(const row of records){const meta=metadata.find(r=>r.id===row.id);
    need(meta&&meta.module_id===row.moduleId&&(row.data?.programId??null)===meta.program_id);}
  const source=typed(records,targetId,initial.module_id,member);need(source.data.kind===targetKind(source.moduleId));
  programs(source,records,member);
  const t=await rawRow(c,org,"os_participation_targets",targetId,pins);need(t.module_id===source.moduleId);
  return Object.freeze({member,source,t});
}

/** Trusted closed server selectors. Mutable records are deliberately private:
 * the same array is passed to actual sequential child commands, never a DTO. */
export async function readGroupContext(c, input) {
  need(input && typeof input === "object" && !isProxy(input) && Object.getPrototypeOf(input) === Object.prototype, invalid);
  need(Reflect.ownKeys(input).length === 5 && ["org","session","seed","operation","readOnly"].every(k => Object.hasOwn(input,k)), invalid);
  const v = selectors({ org: property(input,"org"), seed: property(input,"seed"), operation: property(input,"operation"), readOnly: property(input,"readOnly") });
  const { org, seed, operation, readOnly } = v, supplied = property(input,"session");
  need(supplied&&typeof supplied==="object"&&!isProxy(supplied)&&Object.getPrototypeOf(supplied)===Object.prototype,invalid);
  const suppliedSession=property(supplied,"session"),suppliedUser=property(supplied,"user");
  for(const value of [suppliedSession,suppliedUser])need(value&&typeof value==="object"&&!isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,invalid);
  const session = { session: { id: property(suppliedSession,"id") }, user: { id: property(suppliedUser,"id") } };
  id(session.session.id); id(session.user.id);
  await c.query(GROUP_CONTEXT_SQL.lock, [org]); await c.query(GROUP_CONTEXT_SQL.utc);
  const initial = await seedRead(c, v), member = await currentGroupMember(c, org, session, { moduleId: initial.module_id, readOnly });
  const group = seed.kind === "target" ? null : await getGroup(c, org, initial.id, { forUpdate: !readOnly });
  if (group?.originMode === "recovered") {
    need(operation === "read" && administrators(member.role) && member.programIds.length === 0);
    return Object.freeze({ originMode: "recovered", group, member, authority: null, source: null, records: [], roster: [], inventory: null,
      chosenGraphPinsSha256:null,rosterSha256:null });
  }
  need(seed.kind === "target" || (group && group.originMode === "live" && group.moduleId === initial.module_id && group.liveTargetId === initial.live_target_id));
  const targetId = group?.liveTargetId ?? seed.targetId, rosterIds = group?.rosterIds ?? sorted(seed.rosterIds), admission = NEW_ADMISSION.has(operation);
  if (!readOnly) await lockRows(c, org, "os_participation_targets", [targetId]);
  if (admission) {
    await budget(c, org, GROUP_CONTEXT_SQL.recordBudget, 2000, RAW_MAX);
    await budget(c, org, GROUP_CONTEXT_SQL.partBudget, 2000, 8 * 1024 * 1024);
  }
  const partMeta = smallRows(await c.query(admission ? GROUP_CONTEXT_SQL.parts : GROUP_CONTEXT_SQL.roster, admission ? [org] : [org, rosterIds]), admission ? 2000 : 10);
  const byPart = new Map(partMeta.map(p => [p.id, p])); need(byPart.size === partMeta.length);
  if (!admission) need(partMeta.length===rosterIds.length&&partMeta.every(p=>rosterIds.includes(p.id)));
  const chosen = rosterIds.map(key => byPart.get(key)); need(chosen.every(Boolean) && chosen.length >= 2 && chosen.length <= 10);
  let metadata;
  if (admission) metadata = smallRows(await c.query(GROUP_CONTEXT_SQL.records, [org]), 2000);
  else {
    const direct = sorted([targetId,...chosen.flatMap(p => [p.booking_record_id,p.contact_id])]); direct.forEach(graphId);
    metadata = smallRows(await c.query(GROUP_CONTEXT_SQL.selectedRecords, [org,direct]), 64);
    const bookingIds=new Set(chosen.map(p=>p.booking_record_id));
    const refs=sorted([...metadata.map(r=>r.program_id),...metadata.filter(r=>initial.module_id==="volunteers"&&bookingIds.has(r.id)).map(r=>r.safeguarding_id)]
      .filter(key=>key!=null&&key!==""&&!direct.includes(key)));refs.forEach(graphId);
    if(refs.length)metadata.push(...smallRows(await c.query(GROUP_CONTEXT_SQL.selectedRecords,[org,refs]),64));
  }
  const byRecord = new Map(metadata.map(r => [r.id, r])); need(byRecord.size === metadata.length);
  const sourceMeta = byRecord.get(targetId); need(sourceMeta && sourceMeta.module_id === initial.module_id && sourceMeta.kind === targetKind(initial.module_id));
  const queueIds = admission ? smallRows(await c.query(GROUP_CONTEXT_SQL.queue, [org, targetId]), 2000).map(r => r.id) : [];
  need(new Set(queueIds).size === queueIds.length && queueIds.every(key => byPart.has(key)));
  const contacts = new Set([...chosen, ...queueIds.map(key => byPart.get(key))].map(p => p.contact_id));
  const applicable = admission ? partMeta.filter(p => rosterIds.includes(p.id) || queueIds.includes(p.id) ||
    ((p.state === "confirmed" || (p.recovered && p.recovered_state === "confirmed")) &&
      (p.target_id === targetId || (initial.module_id === "volunteers" && p.module_id === "volunteers" && contacts.has(p.contact_id))))) : chosen;
  const recordIds = new Set([targetId]), requiredRecordIds = new Set([targetId]);
  for (const p of applicable) {
    graphId(p.id); graphId(p.target_id);
    // Queue-only candidates retain the actual old hint's try/skip policy.
    // Chosen rows and applicable saved commitments are never optional.
    const required = rosterIds.includes(p.id) || p.state === "confirmed" || (p.recovered && p.recovered_state === "confirmed");
    for (const key of [p.booking_record_id,p.contact_id]) {
      if (required) graphId(key);
      if (isGraphId(key)) { recordIds.add(key); if (required) requiredRecordIds.add(key); }
    }
    if (admission && required) { recordIds.add(p.target_id); requiredRecordIds.add(p.target_id); }
  }
  if(initial.module_id==="volunteers")for(const p of chosen){const ref=byRecord.get(p.booking_record_id)?.safeguarding_id;
    if(ref!=null&&ref!==""){graphId(ref);recordIds.add(ref);requiredRecordIds.add(ref);}}
  const managedIds = admission ? smallRows(await c.query(GROUP_CONTEXT_SQL.targets, [org]), 500).map(t => t.target_id) : [];
  const unmanagedMeta = admission && initial.module_id === "volunteers" ? metadata.filter(r => r.module_id === "volunteers" && r.kind === "assignment" &&
    contacts.has(r.contact_id) && legacyActive("volunteers", r.status) && !managedIds.includes(r.shift_id)) : [];
  for (const r of unmanagedMeta) { recordIds.add(r.id); requiredRecordIds.add(r.id); graphId(r.shift_id); recordIds.add(r.shift_id); requiredRecordIds.add(r.shift_id); }
  if (admission) {
    const mapped = new Set(partMeta.map(p => p.booking_record_id));
    if (metadata.some(r => r.module_id === initial.module_id && r.kind === bookingKind(initial.module_id) &&
      (initial.module_id === "events" ? r.event_id : r.shift_id) === targetId && legacyActive(initial.module_id,r.status) && !mapped.has(r.id))) reconcile();
  }
  for (const key of [...recordIds]) {
    const r = byRecord.get(key), required = requiredRecordIds.has(key); if (required) need(r);
    // A chosen booking's safeguarding row is a module-identity dependency,
    // not permission to traverse that restricted row's own program graph.
    if (!r || r.module_id === "safeguarding" || r.program_id == null || r.program_id === "") continue;
    if (required) graphId(r.program_id);
    if (isGraphId(r.program_id)) { recordIds.add(r.program_id); if (required) requiredRecordIds.add(r.program_id); }
  }
  const intakeIds = sorted(applicable.map(p => p.intake_id).filter(v => v != null)), requiredIntakes = sorted(chosen.map(p => p.intake_id).filter(v => v != null));
  intakeIds.forEach(graphId);
  if (operation === "create" && seed.coordinatorIntakeId !== null) { requireAdmin(member); intakeIds.push(seed.coordinatorIntakeId); requiredIntakes.push(seed.coordinatorIntakeId); }
  // Discovery contains no answers or raw temporal fields. Lock one complete
  // fixed-rank/ASCII graph, then pin/read it; never acquire a later lower rank.
  if (!readOnly) { await lockRows(c, org, "os_records", sorted(recordIds),sorted(requiredRecordIds)); await lockRows(c, org, "os_participations", sorted(applicable.map(p => p.id))); await lockRows(c, org, "os_intake", sorted(intakeIds),requiredIntakes); }
  // Chosen-only processing metadata on read/Replay is not a current allocation
  // inventory or eligibility gate. Admit uses the complete applicable graph.
  const processing={bytes:0};
  for(const [table,ids] of [["os_records",sorted(recordIds)],["os_participations",applicable.map(p=>p.id)],["os_participation_targets",[targetId]],["os_intake",sorted(intakeIds)]])
    await processingBytes(c,org,table,ids,processing);
  const pins = [], intakes = new Map(), publications = new Map();
  for (const key of sorted(intakeIds)) { const row = await rawRow(c, org, "os_intake", key, pins,!requiredIntakes.includes(key)); if (row) intakes.set(key,row); }
  const publicationIds = sorted([...intakes.values()].map(i => i.publication_id)); publicationIds.forEach(graphId);
  const requiredPublications = sorted(requiredIntakes.map(key => intakes.get(key)?.publication_id)); requiredPublications.forEach(graphId);
  if (!readOnly) await lockRows(c, org, "os_publications", publicationIds,requiredPublications);
  await processingBytes(c,org,"os_publications",publicationIds,processing);
  for (const key of publicationIds) { const row = await rawRow(c, org, "os_publications", key, pins,!requiredPublications.includes(key)); if (row) publications.set(key,row); }
  const rawRecords = [];
  for (const key of sorted(recordIds)) {
    const required = requiredRecordIds.has(key), row = await rawRow(c, org, "os_records", key, pins,!required);
    if (required) need(row && row.deleted_at == null);
    // Pin actual absence/deleted content privately, but do not feed a deleted
    // candidate/contact to the real legacy hint as though it were live.
    if (row && row.deleted_at == null) rawRecords.push(row);
  }
  const records = rawRecords.map(r => rowRecord({ ...r, created_at: new Date(r.created_at), updated_at: new Date(r.updated_at) }));
  const source = typed(records, targetId, initial.module_id, member); need(source.data.kind === targetKind(source.moduleId));
  const t = await rawRow(c, org, "os_participation_targets", targetId, pins); need(t.module_id === source.moduleId);
  if (operation === "create") need(t.mode === "managed" && !t.recovery_block);
  const actualParts = new Map();
  for (const p of [...applicable].sort((a,b) => ascii(a.id,b.id))) actualParts.set(p.id, await rawRow(c, org, "os_participations", p.id, pins));
  const roster = rosterIds.map(key => actualParts.get(key)), restoreIds = new Set([source.id]);
  for (const p of roster) {
    need(p && p.target_id === source.id && p.module_id === source.moduleId);
    const booking = typed(records, p.booking_record_id, source.moduleId, member), contact = typed(records, p.contact_id, "contacts", member);
    need(booking.data.kind === bookingKind(source.moduleId) && booking.data[parentKey(source.moduleId)] === source.id && booking.data.contactId === p.contact_id);
    for (const record of [source, booking, contact]) { restoreIds.add(record.id); const program = programs(record, records, member); if (program) restoreIds.add(program); }
    if(source.moduleId==="volunteers"&&booking.data.safeguardingId!=null&&booking.data.safeguardingId!==""){
      const ref=booking.data.safeguardingId;graphId(ref);const linked=records.find(r=>r.id===ref);
      // Exactly the actual child validator's module-identity dependency. Never
      // a new permission to read training/status data or an approval predicate.
      need(linked?.moduleId==="safeguarding");restoreIds.add(ref);
    }
    intakeRelationship(p, intakes, publications, source);
    if (operation === "create") need(["requested", "waitlisted"].includes(p.state) && ["staff", "intake"].includes(p.source) && !p.recovered && !p.confirmed_at && p.frozen == null);
  }
  need(new Set(roster.map(p => p.booking_record_id)).size === roster.length && new Set(roster.map(p => p.contact_id)).size === roster.length &&
    new Set(roster.map(p => p.intake_id).filter(v => v != null)).size === roster.filter(p => p.intake_id != null).length);
  if (operation === "create" && seed.coordinatorIntakeId !== null) {
    const coordinator = intakes.get(seed.coordinatorIntakeId), publication = coordinator && publications.get(coordinator.publication_id);
    need(coordinator && coordinator.erased_at == null && publication && publication.target_id === source.id && publication.target_module === source.moduleId &&
      publication.kind === (source.moduleId === "events" ? "event-interest" : "volunteer-interest"));
  }
  // Re-read identity closure after locks. A changed reference must not add a
  // late, unlocked graph edge or substitute current editable allocation data.
  for (const r of records) { const meta = byRecord.get(r.id); need(meta && meta.module_id === r.moduleId && (r.data?.programId ?? null) === meta.program_id &&
    (r.data?.safeguardingId??null)===meta.safeguarding_id); }
  for (const p of actualParts.values()) { const meta = byPart.get(p.id); need(meta && ["target_id","module_id","booking_record_id","contact_id","intake_id"].every(k => (meta[k] ?? null) === (p[k] ?? null))); }
  const chosenKeys={os_records:restoreIds,os_participations:new Set(rosterIds),os_participation_targets:new Set([targetId]),
    os_intake:new Set(requiredIntakes),os_publications:new Set(requiredPublications)};
  const chosenGraphPinsSha256=inventoryDigest(pins.filter(row=>chosenKeys[row.table].has(row.id)));
  const rosterSha256=groupHash("roster",{targetId:source.id,moduleId:source.moduleId,rosterIds});
  const epoch = await groupRestoreEpoch(c, org, sorted(restoreIds)), authority = groupAuthority(member, session, epoch);
  if (!admission) return Object.freeze({ originMode: "live", group, member, source, t, records, roster, authority, restoreEpochSha256: epoch, inventory: null,
    chosenGraphPinsSha256,rosterSha256 });
  const terms = participationTerms(source), serverClock = await readParticipationDomainClock(c), readiness = [];
  for (const p of roster) {
    const action = p.state === "waitlisted" ? "promote" : "confirm", booking = records.find(r => r.id === p.booking_record_id);
    try {
      const eligible = await readParticipationAdmissionEligibility({ c, org, member, source, t, records, p, action, serverClock,
        input: { revision: p.revision, targetRevision: t.revision, candidateRevision: booking.revision, consentRevision: p.consent?.revision || 0,
          ...(p.requested_interval != null ? { allocationHash: p.consent?.allocationHash } : {}) } });
      readiness.push(Object.freeze({ participationId: p.id, action, reason: null, eligible }));
    } catch (error) {
      const expected = ["revision","participation_reconcile","participation_approval","participation_started","participation_candidate","participation_consent","participation_withdrawn","participation_interval","participation_state"];
      if (error instanceof ModuleValidationError) readiness.push(Object.freeze({ participationId: p.id, action, reason: "participation_terms", eligible: null }));
      else if (expected.includes(error.code)) readiness.push(Object.freeze({ participationId: p.id, action, reason: error.code, eligible: null }));
      else throw error;
    }
  }
  const confirmed = [], unmanaged = [], allocationExisting=[];
  for (const p of actualParts.values()) {
    if (p.state !== "confirmed" && !(p.recovered && p.recovered_state === "confirmed")) continue;
    if (p.target_id!==source.id && !(source.moduleId==="volunteers" && p.module_id==="volunteers" && contacts.has(p.contact_id))) continue;
    const booking = records.find(r => r.id === p.booking_record_id), contact = records.find(r => r.id === p.contact_id), target = records.find(r => r.id === p.target_id);
    need(target && target.moduleId === p.module_id && target.data.kind === targetKind(p.module_id) && booking &&
      booking.moduleId === p.module_id && booking.data.kind === bookingKind(p.module_id) && booking.data[parentKey(p.module_id)] === p.target_id &&
      booking.data.contactId === p.contact_id && contact?.moduleId === "contacts",reconcile);
    if (p.recovered) reconcile();
    const value = projection(p, frozenParticipationInterval(p)); confirmed.push(value);
    allocationExisting.push({kind:"managed",orgId:p.org_id,id:p.id,bookingRecordId:p.booking_record_id,contactId:p.contact_id,
      targetId:p.target_id,moduleId:p.module_id,range:value.range});
  }
  for (const r of unmanagedMeta) {
    const assignment = records.find(x => x.id === r.id), shift = records.find(x => x.id === r.shift_id);
    need(assignment && shift && shift.moduleId === "volunteers" && shift.data.kind === "shift", reconcile);
    const value={ bookingRecordId: assignment.id, contactId: assignment.data.contactId, targetId: shift.id,
      range: rangeOnly(effectiveRequestedInterval({ module_id: "volunteers", requested_interval: null }, shift.data)) };
    unmanaged.push(value);
    allocationExisting.push({kind:"unmanaged",orgId:org,id:assignment.id,bookingRecordId:assignment.id,contactId:value.contactId,
      targetId:shift.id,moduleId:"volunteers",range:value.range});
  }
  const orderedWaitlist = queueIds.map(key => {
    const p = actualParts.get(key); need(p && p.state === "waitlisted" && !p.recovered && p.target_id === source.id);
    const intake = intakes.get(p.intake_id); return { ...p, intake_status: intake?.status, intake_cancelled_at: intake?.cancelled_at };
  });
  const inventorySha256=inventoryDigest(pins);
  return Object.freeze({ originMode: "live", group, member, source, t, records, roster, authority, restoreEpochSha256: epoch,
    chosenGraphPinsSha256,rosterSha256,
    inventory: Object.freeze({ confirmed, unmanaged, allocationExisting, orderedWaitlist, readiness: Object.freeze(readiness), serverClock, inventorySha256 }),
    // Private deterministic simulation convenience; no Response or write path.
    suggest: ({ removedWaitlistIds, prospectiveConfirmed }) => suggestParticipationFromInventory({ source, records, member, orderedWaitlist,
      removedWaitlistIds, confirmed: [...confirmed, ...prospectiveConfirmed], unmanaged }),
    requirePromotionReason: requireParticipationPromotionReason,
  });
}
