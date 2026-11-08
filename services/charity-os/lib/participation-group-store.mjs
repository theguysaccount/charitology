/** Candidate tenant storage only. Caller owns c/transaction/locks/authority. */
import {
  GROUP_LIMITS as L, ParticipationGroupError, ownGroupValue,
  validateGroupExactStamp, compareGroupExactStamps,
  validateGroupReceipt, validateGroupHistory, projectGroupHistory,
} from "./participation-group-model.mjs";

const columns = "org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at_exact";
const rowKeys = ["org_id", "id", "origin_mode", "module_id", "live_target_id", "roster_ids", "coordinator_intake_id", "state", "revision", "last_command_hash", "history", "created_at_exact", "updated_at_exact"];
const receiptKeys = ["org_id", "command_hash", "group_id", "receipt"];
const bad = (code = "participation_group_storage", status = 409) => { throw new ParticipationGroupError(code, status); };
const need = (condition, code, status) => { if (!condition) bad(code, status); };
const id = v => need(typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v));
const sha = v => need(typeof v === "string" && /^[a-f0-9]{64}$/.test(v));
const exact = (v, keys) => need(v && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
const revision = v => need(Number.isSafeInteger(v) && v >= 1 && v <= 2147483647);
const freeze = v => {
  if (v && typeof v === "object") { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
};
function count(v) {
  need(typeof v === "number" || typeof v === "string");
  if (typeof v === "string") need(/^(?:0|[1-9][0-9]*)$/.test(v));
  const n = Number(v); need(Number.isSafeInteger(n) && n >= 0); return n;
}
function rows(result, cap) { need(result && Array.isArray(result.rows) && result.rows.length <= cap); return result.rows; }
function one(result) { const list = rows(result, 1); need(list.length === 1); return list[0]; }
function changed(result) { need(result?.rowCount === 1, "participation_group_revision"); }
function receiptRow(raw, org) {
  const r = ownGroupValue(raw); exact(r, receiptKeys); need(r.org_id === org); sha(r.command_hash); id(r.group_id);
  const value = validateGroupReceipt(r.receipt); need(value.commandHash === r.command_hash && value.groupId === r.group_id); return value;
}
function groupFromRows(raw, rawReceipts, org) {
  const r = ownGroupValue(raw); exact(r, rowKeys); need(r.org_id === org); id(r.id);
  need(["events", "volunteers"].includes(r.module_id)); revision(r.revision);
  validateGroupExactStamp(r.created_at_exact); validateGroupExactStamp(r.updated_at_exact);
  need(compareGroupExactStamps(r.updated_at_exact, r.created_at_exact) >= 0);
  need(Array.isArray(rawReceipts) && rawReceipts.length <= L.receipts);
  const receipts = rawReceipts.map(x => receiptRow(x, org)); need(receipts.every(x => x.groupId === r.id));
  let history;
  if (r.origin_mode === "live") {
    id(r.live_target_id); sha(r.last_command_hash); need(r.history === null);
    if (r.coordinator_intake_id !== null) id(r.coordinator_intake_id);
    need(["draft", "admitted", "closed"].includes(r.state) && r.revision <= L.receipts);
    need(receipts.length === r.revision);
    receipts.sort((a, b) => a.result.groupRevision - b.result.groupRevision);
    history = projectGroupHistory({ originOrgId: org, receipts });
    const latest = receipts.at(-1), first = receipts[0];
    need(history.id === r.id && history.moduleId === r.module_id && history.targetId === r.live_target_id && history.coordinatorIntakeId === r.coordinator_intake_id);
    need(Array.isArray(r.roster_ids) && r.roster_ids.length === history.rosterIds.length && r.roster_ids.every((x, i) => x === history.rosterIds[i]));
    need(latest.commandHash === r.last_command_hash && latest.result.state === r.state && latest.result.groupRevision === r.revision);
    need(first.acceptedAtExact === r.created_at_exact && latest.acceptedAtExact === r.updated_at_exact);
  } else {
    need(r.origin_mode === "recovered" && r.state === "archived" && r.revision === 1 && r.live_target_id === null && r.coordinator_intake_id === null && r.last_command_hash === null);
    need(Array.isArray(r.roster_ids) && r.roster_ids.length === 0 && receipts.length === 0);
    history = validateGroupHistory(r.history); need(history.id === r.id && history.moduleId === r.module_id);
  }
  return freeze({ orgId: org, id: r.id, originMode: r.origin_mode, moduleId: r.module_id, liveTargetId: r.live_target_id, rosterIds: r.roster_ids, coordinatorIntakeId: r.coordinator_intake_id,
    state: r.state, revision: r.revision, lastCommandHash: r.last_command_hash, history, receipts, createdAtExact: r.created_at_exact, updatedAtExact: r.updated_at_exact });
}

/** Actual complete SQL composites, including both table wrappers and receipts. */
export async function groupQuota(c, org) {
  id(org);
  const groups = ownGroupValue(one(await c.query("SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_groups t WHERE org_id=$1", [org])));
  const receipts = ownGroupValue(one(await c.query("SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM os_participation_group_receipts t WHERE org_id=$1", [org])));
  exact(groups, ["count", "bytes"]); exact(receipts, ["count", "bytes"]);
  const groupCount = count(groups.count), receiptCount = count(receipts.count), groupBytes = count(groups.bytes), receiptBytes = count(receipts.bytes);
  const per = rows(await c.query("SELECT group_id,count(*)::int AS count FROM os_participation_group_receipts WHERE org_id=$1 GROUP BY group_id ORDER BY group_id LIMIT 101", [org]), L.groups + 1).map(x => ownGroupValue(x));
  let total = 0, maxPerGroup = 0; const seen = new Set();
  for (const x of per) { exact(x, ["group_id", "count"]); id(x.group_id); need(!seen.has(x.group_id)); seen.add(x.group_id); const n = count(x.count); need(n >= 1); total += n; maxPerGroup = Math.max(maxPerGroup, n); }
  need(total === receiptCount && seen.size <= groupCount);
  need(groupCount <= L.groups && receiptCount <= L.groups * L.receipts && maxPerGroup <= L.receipts && groupBytes + receiptBytes <= L.familyBytes, "participation_group_quota", 422);
  return freeze({ groups: groupCount, receipts: receiptCount, groupBytes, receiptBytes, bytes: groupBytes + receiptBytes, maxPerGroup });
}
export async function groupStateCount(c, org) {
  id(org); const r = ownGroupValue(one(await c.query("SELECT count(*)::int AS count FROM os_participation_groups WHERE org_id=$1", [org]))); exact(r, ["count"]); return count(r.count);
}
export async function loadGroupInventory(c, org) {
  id(org); const quota = await groupQuota(c, org);
  const containers = rows(await c.query("SELECT " + columns + " FROM os_participation_groups WHERE org_id=$1 ORDER BY id LIMIT 101", [org]), L.groups + 1);
  const receipts = rows(await c.query("SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 ORDER BY group_id,command_hash LIMIT 1201", [org]), L.groups * L.receipts + 1);
  need(containers.length === quota.groups && receipts.length === quota.receipts);
  const byId = new Map();
  for (const raw of containers) { const r = ownGroupValue(raw); id(r.id); need(!byId.has(r.id)); byId.set(r.id, { row: r, receipts: [] }); }
  for (const raw of receipts) { const value = receiptRow(raw, org); need(byId.has(value.groupId)); byId.get(value.groupId).receipts.push(raw); }
  const groups = [...byId.values()].map(x => groupFromRows(x.row, x.receipts, org));
  return freeze({ groups, quota });
}
export async function getGroup(c, org, groupId, options = { forUpdate: false }) {
  id(org); id(groupId); const o = ownGroupValue(options, 128); exact(o, ["forUpdate"]); need(typeof o.forUpdate === "boolean");
  const found = rows(await c.query("SELECT " + columns + " FROM os_participation_groups WHERE org_id=$1 AND id=$2" + (o.forUpdate ? " FOR UPDATE" : ""), [org, groupId]), 1);
  if (!found.length) return null;
  const receipts = rows(await c.query("SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND group_id=$2 ORDER BY command_hash LIMIT 13", [org, groupId]), L.receipts + 1);
  const group = groupFromRows(found[0], receipts, org); need(group.id === groupId); return group;
}
export async function findGroupReceipt(c, org, commandHash) {
  id(org); sha(commandHash);
  const found = rows(await c.query("SELECT org_id,command_hash,group_id,receipt FROM os_participation_group_receipts WHERE org_id=$1 AND command_hash=$2", [org, commandHash]), 1);
  if (!found.length) return null;
  const value = receiptRow(found[0], org); need(value.commandHash === commandHash);
  const group = await getGroup(c, org, value.groupId); need(group?.originMode === "live");
  const retained = group.receipts.find(x => x.commandHash === commandHash); need(retained !== undefined); return retained;
}
async function insertReceipt(c, org, value) {
  changed(await c.query("INSERT INTO os_participation_group_receipts(org_id,command_hash,group_id,receipt) VALUES($1,$2,$3,$4::jsonb)", [org, value.commandHash, value.groupId, JSON.stringify(value)]));
}
export async function insertDraftGroup(c, org, input) {
  id(org); const v = ownGroupValue(input); exact(v, ["receipt"]); const r = validateGroupReceipt(v.receipt); need(r.operation === "create"); const target = r.result.target;
  changed(await c.query("INSERT INTO os_participation_groups(org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,created_at,updated_at) VALUES($1,$2,'live',$3,$4,$5::jsonb,$6,'draft',1,$7,NULL,$8::timestamptz,$8::timestamptz)", [org, r.groupId, target.moduleId, target.targetId, JSON.stringify(r.result.rosterIds), r.result.coordinatorIntakeId, r.commandHash, r.acceptedAtExact]));
  await insertReceipt(c, org, r); await groupQuota(c, org);
  const group = await getGroup(c, org, r.groupId); need(group !== null); return group;
}
export async function appendGroupDecision(c, org, input) {
  id(org); const v = ownGroupValue(input); exact(v, ["expectedRevision", "receipt"]); revision(v.expectedRevision);
  const r = validateGroupReceipt(v.receipt); need(r.operation !== "create");
  const group = await getGroup(c, org, r.groupId, { forUpdate: true });
  need(group?.originMode === "live" && group.revision === v.expectedRevision && r.result.groupRevision === group.revision + 1, "participation_group_revision");
  // Validate lifetime/no-op history BEFORE either insertion or update. A failed
  // SQL statement still requires the owning outer transaction to roll back.
  projectGroupHistory({ originOrgId: org, receipts: [...group.receipts, r] });
  await insertReceipt(c, org, r);
  changed(await c.query("UPDATE os_participation_groups SET state=$3,revision=$4,last_command_hash=$5,updated_at=$6::timestamptz WHERE org_id=$1 AND id=$2 AND origin_mode='live' AND revision=$7 AND last_command_hash=$8", [org, r.groupId, r.result.state, r.result.groupRevision, r.commandHash, r.acceptedAtExact, group.revision, group.lastCommandHash]));
  await groupQuota(c, org); const saved = await getGroup(c, org, r.groupId); need(saved !== null); return saved;
}
export async function insertRecoveredGroup(c, org, input) {
  id(org); const v = ownGroupValue(input); exact(v, ["history", "storedAtExact"]); const h = validateGroupHistory(v.history); validateGroupExactStamp(v.storedAtExact);
  changed(await c.query("INSERT INTO os_participation_groups(org_id,id,origin_mode,module_id,live_target_id,roster_ids,coordinator_intake_id,state,revision,last_command_hash,history,created_at,updated_at) VALUES($1,$2,'recovered',$3,NULL,'[]'::jsonb,NULL,'archived',1,NULL,$4::jsonb,$5::timestamptz,$5::timestamptz)", [org, h.id, h.moduleId, JSON.stringify(h), v.storedAtExact]));
  await groupQuota(c, org); const group = await getGroup(c, org, h.id); need(group !== null); return group;
}

export const GROUP_STORE_CONTRACT = freeze({
  candidateOnly: true, integrated: false, ddlExecuted: false,
  tables: ["os_participation_groups", "os_participation_group_receipts"],
  caller: "Own one tenant transaction, org advisory lock, current authorization, typed relationships, SQL clock, IDs, complete capacity/exit reserves and Replay classification; roll back on ANY error.",
  timestamps: "Exact UTC six-digit SQL text on load; all write timestamps supplied by caller, never minted here.",
  groupReturnKeys: ["orgId", "id", "originMode", "moduleId", "liveTargetId", "rosterIds", "coordinatorIntakeId", "state", "revision", "lastCommandHash", "history", "receipts", "createdAtExact", "updatedAtExact"],
  inputs: { getGroup: ["forUpdate"], insertDraftGroup: ["receipt"], appendGroupDecision: ["expectedRevision", "receipt"], insertRecoveredGroup: ["history", "storedAtExact"] },
  readConsistency: "Caller must hold shared org authority/lock or a consistent snapshot; partial or racing histories refuse, never return filtered fragments.",
  quota: "Actual SQL to_jsonb full composites of BOTH families; independent100 containers/12 receipts per container/8MiB refusal bounds. No measured maximum or full-workspace reserve proof.",
  recovery: "Recovered archive has no live links or receipt rows. Local storage times are separate from original historical times. No Replay/adoption authority.",
});
