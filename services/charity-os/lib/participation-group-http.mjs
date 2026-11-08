/** HTTP admission only; these classifiers grant no route or actor authority. */
import { readBackupBody } from "./backup-json.mjs";
import { fail, HttpError } from "./security.mjs";

const groupPrefix = /^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/participation-groups(?:\/|$)/;
const previewPath = /^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/participation-groups\/[A-Za-z0-9_-]{1,100}\/(?:preview-admission|preview-cancellation)$/;

/** Select the strict reader even for an unknown suffix in this route family. */
export const isParticipationGroupPath = fullNormalizedPath =>
  typeof fullNormalizedPath === "string" && groupPrefix.test(fullNormalizedPath);

/** Only the two exact POST previews qualify for a future read-only transaction. */
export const isParticipationGroupPreview = (fullNormalizedPath, method) =>
  method === "POST" && typeof fullNormalizedPath === "string" && previewPath.test(fullNormalizedPath);

/** Preserve lexical evidence before domain validation; never use the generic reader.
 * The future handler must separately refuse GET/HEAD bodies before skipping readers.
 */
export async function readParticipationGroupBody(request) {
  if (request.method === "GET" || request.method === "HEAD")
    fail(405, "group_method", "Read group views without a request body.");
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
    fail(415, "content_type", "Supply JSON.");
  try {
    return await readBackupBody(request, 16384);
  } catch (error) {
    if (error instanceof HttpError && error.status === 422 && error.code === "backup_json")
      fail(422, "group_json", "Supply valid group JSON without duplicate fields or nonfinite numbers.");
    if (error instanceof HttpError && error.status === 413 && error.code === "size")
      fail(413, "group_size", "This group request is too large.");
    throw error;
  }
}
