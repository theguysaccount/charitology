import { id, hash, fail, json } from "./security.mjs";
import { parseBackupJson } from "./backup-json.mjs";
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const CHUNK_BYTES = 1500000;
export async function uploadPart({ c, org, user, input }) {
  if (
    !Number.isInteger(input.index) ||
    !Number.isInteger(input.total) ||
    input.index < 0 ||
    input.total < 1 ||
    input.total > 48 ||
    input.index >= input.total ||
    typeof input.chunk !== "string" ||
    input.chunk.length > 2_000_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.chunk)
  )
    fail(422, "upload", "Invalid backup chunk.");
  const bytes = Buffer.from(input.chunk, "base64");
  if (bytes.length > CHUNK_BYTES)
    fail(413, "size", "This upload chunk is too large.");
  const uploadId = input.uploadId || id();
  if (!/^[a-f0-9]{32}$/.test(uploadId))
    fail(422, "upload", "Invalid upload identity.");
  await c.query("DELETE FROM os_uploads WHERE org_id=$1 AND expires_at<now()", [
    org,
  ]);
  const chunks = (
    await c.query(
      "SELECT part,total,actor_id,checksum FROM os_uploads WHERE org_id=$1 AND id=$2",
      [org, uploadId],
    )
  ).rows;
  if (chunks.some((r) => r.actor_id !== user || r.total !== input.total))
    fail(409, "upload", "This upload belongs to another request.");
  if (
    !chunks.length &&
    Number(
      (
        await c.query(
          "SELECT count(DISTINCT id) AS count FROM os_uploads WHERE org_id=$1",
          [org],
        )
      ).rows[0].count,
    ) >= 2
  )
    fail(429, "uploads", "Finish or wait for the current uploads to expire.");
  const existing = chunks.find((r) => r.part === input.index);
  if (existing && existing.checksum !== hash(bytes))
    fail(409, "upload", "This chunk differs from the saved chunk.");
  await c.query(
    "INSERT INTO os_uploads(org_id,id,part,total,actor_id,bytes,checksum,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '30 minutes') ON CONFLICT(org_id,id,part) DO NOTHING",
    [org, uploadId, input.index, input.total, user, bytes, hash(bytes)],
  );
  return json({ ok: true, uploadId, received: input.index });
}
export async function uploadedBackup(c, org, user, uploadId) {
  const chunks = (
    await c.query(
      "SELECT * FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND expires_at>now() ORDER BY part",
      [org, uploadId, user],
    )
  ).rows;
  if (
    !chunks.length ||
    chunks.length !== chunks[0].total ||
    chunks.some((r, i) => r.part !== i || r.total !== chunks.length)
  )
    fail(409, "upload", "The backup upload is incomplete or expired.");
  const byteLength = chunks.reduce((sum, row) => sum + row.bytes.length, 0);
  if (byteLength > MAX_BACKUP_BYTES)
    fail(413, "size", "Backups must be under64 MiB.");
  const bytes = Buffer.concat(chunks.map((r) => r.bytes), byteLength);
  return parseBackupJson(bytes, MAX_BACKUP_BYTES);
}
export function downloadJson(value, name) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + 65536));
        offset += 65536;
      },
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
