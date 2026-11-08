import { fail } from "./security.mjs";
import { readLearningBytes } from "./learning-requests.mjs";
import {
  parseIncubatorJSON,
  incubatorObject as object,
  incubatorEnum as choice,
  incubatorId as id,
  incubatorHashValue,
  incubatorNumber,
} from "./incubator-bridge-json.mjs";
import { INCUBATOR_ADAPTER } from "./incubator-native.mjs";
import {
  validateIncubatorProgramPin,
  validateIncubatorHeadPin,
} from "./incubator-bridge-model.mjs";

export async function readIncubatorJSON(request, limit = 131072) {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") || "",
    )
  )
    fail(415, "incubator_content_type", "Use the documented JSON request.");
  try {
    return parseIncubatorJSON(await readLearningBytes(request, limit), limit);
  } catch (error) {
    if (typeof error.code === "string" && error.code.startsWith("learning_"))
      fail(
        error.status || 422,
        error.code.replace(/^learning_/, "incubator_"),
        "This source request exceeded its bound or was cancelled.",
      );
    throw error;
  }
}
export function incubatorQuery(url, allowed = []) {
  const query = new URLSearchParams(url.search);
  if (
    query.getAll("path").length === 1 &&
    query.get("path") === url.pathname.slice(5)
  )
    query.delete("path");
  for (const key of query.keys())
    if (!allowed.includes(key) || query.getAll(key).length !== 1)
      fail(
        422,
        "incubator_query",
        "Use only the documented source-history cursor.",
      );
  return query;
}
export function incubatorMetadata(value) {
  object(value, ["version", "adapter", "selection", "target"]);
  choice(value.version, [1]);
  choice(value.adapter, [INCUBATOR_ADAPTER]);
  object(value.selection, ["projectId", "milestoneId"]);
  id(value.selection.projectId);
  id(value.selection.milestoneId);
  const target = value.target;
  if (target?.kind === "new") {
    object(target, ["kind", "program", "duplicatePolicy"]);
    choice(target.duplicatePolicy, ["refuse", "create-separate-copy"]);
  } else {
    object(target, ["kind", "program", "head"]);
    choice(target.kind, ["refresh"]);
    validateIncubatorHeadPin(target.head);
  }
  validateIncubatorProgramPin(target.program);
  if (Buffer.byteLength(JSON.stringify(value)) > 8192)
    fail(
      413,
      "incubator_metadata",
      "This complete source metadata exceeds 8 KiB.",
    );
  return value;
}
export function incubatorCommitInput(value) {
  object(value, ["previewId", "reviewSha256", "commandKey"]);
  id(value.previewId);
  incubatorHashValue(value.reviewSha256);
  if (
    typeof value.commandKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value.commandKey,
    )
  )
    fail(422, "incubator_command", "Use one lowercase UUIDv4 command key.");
  return value;
}
export function incubatorUploadPointer(value) {
  object(value, ["metadata", "upload"]);
  incubatorMetadata(value.metadata);
  object(value.upload, ["uploadId", "byteLength", "sha256"]);
  if (!/^[a-f0-9]{32}$/.test(value.upload.uploadId))
    fail(422, "incubator_upload", "Use the complete original native upload.");
  incubatorNumber(value.upload.byteLength, 1, 8000000);
  incubatorHashValue(value.upload.sha256);
  return value;
}
