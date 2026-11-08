import { uploadPart } from "./uploads.mjs";
import { fail, hash } from "./security.mjs";
import { incubatorActorHash } from "./incubator-bridge-access.mjs";
import {
  incubatorHash as H,
  incubatorObject,
  incubatorNumber,
} from "./incubator-bridge-json.mjs";
import { incubatorUploadPointer } from "./incubator-bridge-requests.mjs";

export const INCUBATOR_CHUNK_BYTES = 1500000;
const bad = () =>
  fail(422, "incubator_upload", "Use the documented complete native upload.");
export const incubatorUploadActor = (org, member, session) =>
  H("source-upload", {
    orgId: org,
    actorBindingHash: incubatorActorHash(member, session),
  });
export function incubatorUploadPart(input) {
  incubatorObject(
    input,
    Object.hasOwn(input ?? {}, "uploadId")
      ? ["uploadId", "index", "total", "chunk"]
      : ["index", "total", "chunk"],
  );
  if (
    Object.hasOwn(input, "uploadId") &&
    !/^[a-f0-9]{32}$/.test(input.uploadId)
  )
    bad();
  incubatorNumber(input.total, 1, 6);
  incubatorNumber(input.index, 0, input.total - 1);
  if (input.index > 0 && !input.uploadId) bad();
  if (
    typeof input.chunk !== "string" ||
    input.chunk.length > 2000000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.chunk)
  )
    bad();
  const bytes = Buffer.from(input.chunk, "base64");
  if (
    bytes.toString("base64") !== input.chunk ||
    bytes.length < 1 ||
    bytes.length > INCUBATOR_CHUNK_BYTES ||
    (input.index < input.total - 1 && bytes.length !== INCUBATOR_CHUNK_BYTES) ||
    (input.index === input.total - 1 &&
      bytes.length > 8000000 - (input.total - 1) * INCUBATOR_CHUNK_BYTES)
  )
    bad();
  return input;
}
export async function storeIncubatorUploadPart(
  c,
  { org, member, session, input },
) {
  incubatorUploadPart(input);
  const actor = incubatorUploadActor(org, member, session);
  if (
    input.index > 0 &&
    !(
      await c.query(
        "SELECT 1 FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND part=0 AND total=$4 AND expires_at>now()",
        [org, input.uploadId, actor, input.total],
      )
    ).rowCount
  )
    fail(
      409,
      "incubator_upload",
      "Start this native upload with its first part.",
    );
  return uploadPart({ c, org, user: actor, input });
}
export async function assembledIncubatorUpload(
  c,
  { org, member, session, input },
) {
  incubatorUploadPointer(input);
  const { metadata, upload } = input,
    actor = incubatorUploadActor(org, member, session);
  const rows = (
    await c.query(
      "SELECT * FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND expires_at>now() ORDER BY part",
      [org, upload.uploadId, actor],
    )
  ).rows;
  const total = Math.ceil(upload.byteLength / INCUBATOR_CHUNK_BYTES);
  if (
    rows.length !== total ||
    rows.some(
      (row, index) =>
        row.part !== index ||
        row.total !== total ||
        hash(row.bytes) !== row.checksum ||
        row.bytes.length !==
          (index === total - 1
            ? upload.byteLength - index * INCUBATOR_CHUNK_BYTES
            : INCUBATOR_CHUNK_BYTES),
    )
  )
    fail(
      409,
      "incubator_upload",
      "This upload is incomplete, expired or belongs to another session. Choose the original file again.",
    );
  const native = Buffer.concat(
    rows.map((row) => row.bytes),
    upload.byteLength,
  );
  if (native.length !== upload.byteLength || hash(native) !== upload.sha256)
    fail(
      409,
      "incubator_upload",
      "The uploaded bytes differ from the selected file. Choose the original file again.",
    );
  return { metadata, native, uploadId: upload.uploadId, uploadActor: actor };
}
export async function removeIncubatorUpload(c, org, value) {
  await c.query(
    "DELETE FROM os_uploads WHERE org_id=$1 AND id=$2 AND actor_id=$3",
    [org, value.uploadId, value.uploadActor],
  );
}
