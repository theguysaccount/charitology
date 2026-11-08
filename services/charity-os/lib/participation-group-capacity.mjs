/** Group-family SELECT projection only. Complete workspace admission is separate. */
import { isProxy } from "node:util/types";
import {
  GROUP_LIMITS as L, ParticipationGroupError, ownGroupValue, groupCanonical,
  validateGroupExactStamp, validateGroupReceipt, projectGroupHistory,
} from "./participation-group-model.mjs";
import { loadGroupInventory } from "./participation-group-store.mjs";
import { makeParticipationGroupsBackup } from "./participation-group-backup.mjs";
import { projectGroupFutureExit } from "./participation-group-exit-projection.mjs";

const groupsTable = "os_participation_groups", receiptsTable = "os_participation_group_receipts";
const columns = Object.freeze({
  [groupsTable]: Object.freeze({ org_id: "text", id: "text", origin_mode: "text", module_id: "text",
    live_target_id: "text", roster_ids: "jsonb", coordinator_intake_id: "text", state: "text",
    revision: "integer", last_command_hash: "text", history: "jsonb",
    created_at: "timestamp with time zone", updated_at: "timestamp with time zone" }),
  [receiptsTable]: Object.freeze({ org_id: "text", command_hash: "text", group_id: "text", receipt: "jsonb" }),
});
const fail = (code = "participation_group_capacity_measure") => { throw new ParticipationGroupError(code, 422); };
const need = (value, code) => { if (!value) fail(code); };
const exact = (value, keys) => need(value && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const count = value => {
  need(typeof value === "number" || (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)));
  const n = Number(value); need(Number.isSafeInteger(n) && n >= 0); return n;
};
const add = (a, b) => { const n = a + b; need(Number.isSafeInteger(n) && n >= 0); return n; };
const bytes = value => value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value));
const same = (a, b) => groupCanonical(a) === groupCanonical(b);
const freeze = value => {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
};

// The pg Result may have its own class prototype. Never read an accessor or
// clone an entire 100-group inventory through the model's 128KiB graph bound.
function rows(result, maximum) {
  need(result && typeof result === "object" && !isProxy(result));
  const property = Object.getOwnPropertyDescriptor(result, "rows");
  need(property && Object.hasOwn(property, "value"));
  const list = property.value;
  need(list && !isProxy(list) && Array.isArray(list) && Object.getPrototypeOf(list) === Array.prototype);
  const length = Object.getOwnPropertyDescriptor(list, "length")?.value;
  need(Number.isSafeInteger(length) && length >= 0 && length <= maximum);
  const indices = new Set(Array.from({ length }, (_, index) => String(index)));
  const keys = Reflect.ownKeys(list);
  need(keys.length === length + 1 && keys.every(key => key === "length" || indices.has(key)));
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(list, String(index));
    need(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
    return ownGroupValue(descriptor.value);
  });
}

export const GROUP_CAPACITY_SQL = Object.freeze({
  schema: "SELECT t.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum",
  headers: "SELECT id,to_jsonb(t) AS row,octet_length(to_jsonb(t)::text)::text AS bytes,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at_exact FROM os_participation_groups t WHERE org_id=$1 ORDER BY id LIMIT 101",
  futureHeaders: "SELECT item.ordinality::int AS position,p.id AS key,octet_length(to_jsonb(p)::text)::text AS bytes FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY item(value,ordinality) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participation_groups,item.value) p ORDER BY item.ordinality",
  futureReceipts: "SELECT item.ordinality::int AS position,p.command_hash AS key,octet_length(to_jsonb(p)::text)::text AS bytes FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY item(value,ordinality) CROSS JOIN LATERAL jsonb_populate_record(NULL::os_participation_group_receipts,item.value) p ORDER BY item.ordinality",
});

async function checkSchema(c) {
  const expected = Object.entries(columns).flatMap(([table, fields]) => Object.entries(fields).map(([column, type]) => [table + ":" + column, type]));
  const found = rows(await c.query(GROUP_CAPACITY_SQL.schema, [Object.keys(columns)]), expected.length);
  need(found.length === expected.length, "participation_group_capacity_schema");
  const actual = new Map();
  for (const value of found) {
    exact(value, ["table_name", "column_name", "type"]);
    need(typeof value.table_name === "string" && typeof value.column_name === "string" && typeof value.type === "string", "participation_group_capacity_schema");
    const key = value.table_name + ":" + value.column_name;
    need(!actual.has(key), "participation_group_capacity_schema"); actual.set(key, value.type);
  }
  need(expected.every(([key, type]) => actual.get(key) === type), "participation_group_capacity_schema");
}

function matchHeader(value, group, org) {
  exact(value, ["id", "row", "bytes", "created_at_exact", "updated_at_exact"]);
  exact(value.row, Object.keys(columns[groupsTable]));
  const r = value.row;
  need(value.id === group.id && r.org_id === org && r.id === group.id && r.origin_mode === group.originMode &&
    r.module_id === group.moduleId && r.live_target_id === group.liveTargetId && same(r.roster_ids, group.rosterIds) &&
    r.coordinator_intake_id === group.coordinatorIntakeId && r.state === group.state && r.revision === group.revision &&
    r.last_command_hash === group.lastCommandHash && same(r.history, group.originMode === "live" ? null : group.history));
  validateGroupExactStamp(value.created_at_exact); validateGroupExactStamp(value.updated_at_exact);
  need(value.created_at_exact === group.createdAtExact && value.updated_at_exact === group.updatedAtExact &&
    typeof r.created_at === "string" && typeof r.updated_at === "string");
  const size = count(value.bytes); need(size > 0); return size;
}

async function measureRows(c, sql, values, key) {
  if (!values.length) return [];
  const found = rows(await c.query(sql, [JSON.stringify(values)]), values.length);
  need(found.length === values.length);
  return found.map((value, index) => {
    exact(value, ["position", "key", "bytes"]);
    need(count(value.position) === index + 1 && value.key === values[index][key]);
    const size = count(value.bytes); need(size > 0); return size;
  });
}

/** Requires the caller's consistent, authorized tenant transaction/lock. SELECT
 * composite casts measure the sizing template, not its live attainability. */
export async function measureGroupCapacity(c, org) {
  need(typeof org === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(org));
  await checkSchema(c);
  const inventory = await loadGroupInventory(c, org), actual = inventory.quota;
  const ordered = inventory.groups.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const raw = rows(await c.query(GROUP_CAPACITY_SQL.headers, [org]), L.groups);
  need(raw.length === ordered.length);
  const byId = new Map();
  for (const value of raw) { need(typeof value.id === "string" && !byId.has(value.id)); byId.set(value.id, value); }
  let headerBytes = 0;
  for (const group of ordered) { const value = byId.get(group.id); need(value); headerBytes = add(headerBytes, matchHeader(value, group, org)); }
  need(headerBytes === actual.groupBytes);

  // Synthetic receipt keys are globally unique for the actual tenant PK, not
  // only within each history. Their fixed width supplies no command authority.
  const used = new Set(ordered.flatMap(group => group.receipts.map(receipt => receipt.commandHash)));
  need(used.size === actual.receipts);
  let slot = 0;
  const nextCommand = () => {
    while (slot < L.groups * L.receipts * 2) {
      const value = "f".repeat(56) + (slot++).toString(16).padStart(8, "0");
      if (!used.has(value)) { used.add(value); return value; }
    }
    fail();
  };
  const futureHeaders = [], futureReceipts = [], futureHistories = [], baseHeaderSizes = [];
  let maxProjectedReceiptsPerGroup = 0;
  for (const group of ordered) {
    const projection = projectGroupFutureExit({ originMode: group.originMode, orgId: org, history: group.history, receipts: group.receipts });
    const future = projection.futureReceipts.map(receipt => validateGroupReceipt({ ...receipt, commandHash: nextCommand() }));
    const complete = [...group.receipts, ...future];
    need(complete.length <= L.receipts); maxProjectedReceiptsPerGroup = Math.max(maxProjectedReceiptsPerGroup, complete.length);
    futureHistories.push(future.length ? projectGroupHistory({ originOrgId: org, receipts: complete }) : group.history);
    if (future.length) {
      const original = byId.get(group.id), last = future.at(-1);
      futureHeaders.push({ ...original.row, state: last.result.state, revision: last.result.groupRevision,
        last_command_hash: last.commandHash, updated_at: last.acceptedAtExact });
      baseHeaderSizes.push(count(original.bytes));
      for (const receipt of future) futureReceipts.push({ org_id: org, command_hash: receipt.commandHash, group_id: group.id, receipt });
    }
  }
  need(actual.receipts + futureReceipts.length <= L.groups * L.receipts);
  const projectedHeaderSizes = await measureRows(c, GROUP_CAPACITY_SQL.futureHeaders, futureHeaders, "id");
  const projectedReceiptSizes = await measureRows(c, GROUP_CAPACITY_SQL.futureReceipts, futureReceipts, "command_hash");
  let retainedGrowthBytes = 0;
  for (let index = 0; index < projectedHeaderSizes.length; ++index)
    retainedGrowthBytes = add(retainedGrowthBytes, Math.max(0, projectedHeaderSizes[index] - baseHeaderSizes[index]));
  for (const size of projectedReceiptSizes) retainedGrowthBytes = add(retainedGrowthBytes, size);
  const projectedRetainedBytes = add(actual.bytes, retainedGrowthBytes);
  const actualNativeBytes = bytes(makeParticipationGroupsBackup(ordered.map(group => group.history)));
  const projectedNativeBytes = bytes(makeParticipationGroupsBackup(futureHistories));
  if (projectedRetainedBytes > L.familyBytes || actualNativeBytes > L.familyBytes || projectedNativeBytes > L.familyBytes)
    fail("participation_group_capacity");
  return freeze({ groups: actual.groups, liveGroups: ordered.filter(group => group.originMode === "live").length,
    recoveredGroups: ordered.filter(group => group.originMode === "recovered").length,
    retainedReceipts: actual.receipts, futureReceiptCount: futureReceipts.length,
    headerProjectionCount: futureHeaders.length, maxProjectedReceiptsPerGroup,
    actualGroupBytes: actual.groupBytes, actualReceiptBytes: actual.receiptBytes, actualRetainedBytes: actual.bytes,
    projectedRetainedBytes, retainedGrowthBytes, actualNativeBytes, projectedNativeBytes,
    nativeGrowthBytes: Math.max(0, projectedNativeBytes - actualNativeBytes) });
}

export const GROUP_CAPACITY_CONTRACT = freeze({
  integrated: false, input: "Actual consistent authorized tenant c/org only; no public capacity flag or measurement override.",
  sql: "SELECT-only complete actual group composites and typed prospective group/receipt composite casts.",
  future: "Reviewed synthetic sizing shape; all original histories/receipts retained, org-wide fake key uniqueness. Never persist.",
  limits: "Independent current/future group SQL and inactive-native namespace limits; no global cap increase.",
  notImplemented: ["NEW pre-ID admission", "prospective child/outbox writes", "whole workspace composition", "inactive SQL restore", "optional audit admission", "transaction classification"],
  notClaimed: ["actual PG evidence from fake-SQL units", "attained maximum", "live eligibility", "complete safe-exit or 60/64MiB workspace admission"],
});
