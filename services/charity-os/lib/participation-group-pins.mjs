/** Private row fingerprints. The caller owns the real tenant transaction,
 * authorization, complete typed graph and advisory/row locks. No DTO authority. */
import { createHash } from "node:crypto";
import { fail } from "./security.mjs";
import { ownGroupValue } from "./participation-group-model.mjs";

const TABLE_KEYS = Object.freeze({
  os_records: "id",
  os_participation_targets: "target_id",
  os_participations: "id",
  os_intake: "id",
  os_publications: "id",
});
const CHUNK_BYTES = 65536;
// A single raw row cannot exceed the existing complete emergency SQL budget.
// This is a processing ceiling, not permission to spend that budget on a row.
const MAX_BYTES = 61 * 1024 * 1024;
const bad = () => fail(422, "participation_group_pin", "Use exact private row pin selectors.");
const stale = () => fail(409, "participation_group_stale", "The group context changed. Reload and review it.");
const id = value => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) bad();
};
const exact = (value, keys) => {
  if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) bad();
};
function table(value) {
  if (typeof value !== "string" || !Object.hasOwn(TABLE_KEYS, value)) bad();
}
function frame(hash, value) {
  const bytes = Buffer.from(value, "utf8"), size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length); hash.update(size); hash.update(bytes);
}
function resultRows(result) {
  if (!result || !Array.isArray(result.rows) || result.rows.length > 1 || result.rowCount !== result.rows.length) stale();
  return result.rows;
}

/** Hash exact PostgreSQL JSONB bytes before any JS Date/record conversion.
 * Large rows are read in fixed byte chunks, including split UTF-8 sequences.
 * Every query uses the same supplied client and only literal table/key names.
 * Normal app writers must be excluded by the caller's organization lock. */
export async function readParticipationGroupRowPin(c, input) {
  const selected = ownGroupValue(input, 512);
  exact(selected, ["orgId", "table", "id"]);
  id(selected.orgId); table(selected.table); id(selected.id);
  const key = TABLE_KEYS[selected.table], from = `${selected.table} t WHERE org_id=$1 AND ${key}=$2`;
  const args = [selected.orgId, selected.id];
  const found = resultRows(await c.query(`SELECT octet_length(convert_to(to_jsonb(t)::text,'UTF8')) AS bytes FROM ${from}`, args));
  if (!found.length) return null;
  const row = ownGroupValue(found[0], 128); exact(row, ["bytes"]);
  const length = row.bytes;
  if (!Number.isSafeInteger(length) || length < 2 || length > MAX_BYTES) stale();
  const hash = createHash("sha256").update("charitology:participation-group-row-pin:v1\0");
  for (const value of [selected.table, selected.orgId, selected.id, String(length)]) frame(hash, value);
  for (let offset = 0; offset < length; offset += CHUNK_BYTES) {
    const chunks = resultRows(await c.query(
      `SELECT octet_length(convert_to(to_jsonb(t)::text,'UTF8')) AS bytes,substring(convert_to(to_jsonb(t)::text,'UTF8') FROM $3::integer FOR 65536) AS chunk FROM ${from}`,
      [...args, offset + 1],
    ));
    if (chunks.length !== 1) stale();
    const current = chunks[0];
    if (current.bytes !== length || !Buffer.isBuffer(current.chunk) ||
        current.chunk.length !== Math.min(CHUNK_BYTES, length - offset)) stale();
    hash.update(current.chunk);
  }
  return hash.digest("hex");
}

/** Incremental private inventory digest. Feed actual row pins in literal ASCII
 * table/id order; no whole-inventory generic clone or hidden-data DTO is made.
 * The loader separately proves complete applicable inventory and count limits. */
export function createParticipationGroupInventoryPin() {
  const hash = createHash("sha256").update("charitology:participation-group-inventory-pin:v1\0");
  let previous = null, count = 0, bytes = 0, finished = false;
  return Object.freeze({
    add(input) {
      if (finished) bad();
      const row = ownGroupValue(input, 512); exact(row, ["table", "id", "sha256"]);
      table(row.table); id(row.id);
      if (typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)) bad();
      const next = row.table + "\0" + row.id;
      if (previous !== null && next <= previous) bad();
      const added = Buffer.byteLength(row.table) + Buffer.byteLength(row.id) + 64 + 12;
      if (bytes + added > MAX_BYTES) bad();
      for (const value of [row.table, row.id, row.sha256]) frame(hash, value);
      previous = next; bytes += added; count++;
    },
    digest() {
      if (finished) bad();
      finished = true; frame(hash, String(count)); return hash.digest("hex");
    },
  });
}
