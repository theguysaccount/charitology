import { fail } from "./security.mjs";
import { logicalBackupBytes } from "./database.mjs";
import {
  INCUBATOR_LIMITS as L,
  incubatorSame as same,
  incubatorCanonical,
  incubatorHash as H,
} from "./incubator-bridge-json.mjs";
import { validateIncubatorSourceCapture } from "./incubator-native.mjs";
import {
  validateIncubatorEvent,
  validateIncubatorReceipt,
  foldIncubatorHistory,
} from "./incubator-bridge-model.mjs";
import {
  incubatorSessionHash,
  requireIncubatorScope,
  incubatorUnavailable,
  incubatorStale,
} from "./incubator-bridge-access.mjs";

export const INCUBATOR_INSPECTION = "incubator-source-inspection-v1";
export const INCUBATOR_PREVIEW = "incubator-copy-preview-v1";
export const INCUBATOR_PREVIEW_KINDS = Object.freeze([
  INCUBATOR_INSPECTION,
  INCUBATOR_PREVIEW,
]);
const bad = () =>
  fail(
    422,
    "incubator_history",
    "The retained source and planning history is inconsistent.",
  );

export async function loadIncubatorInventory(c, org) {
  const rows = (
    await c.query(
      "SELECT t.*,octet_length(to_jsonb(t)::text) AS incubator_row_bytes FROM os_incubator_history t WHERE org_id=$1 ORDER BY origin_org_id,binding_id,sequence NULLS FIRST,id LIMIT 1001",
      [org],
    )
  ).rows;
  const usage = {
    count: rows.length,
    bytes: rows.reduce(
      (sum, row) =>
        sum +
        Math.max(Number(row.incubator_row_bytes), Number(row.budget_bytes)),
      0,
    ),
  };
  if (
    !Number.isSafeInteger(usage.bytes) ||
    usage.count > L.history ||
    usage.bytes > L.historyBytes
  )
    fail(
      422,
      "incubator_quota",
      "This retained planning history exceeds its supported count or byte bound.",
    );
  const sources = [],
    events = [];
  for (const row of rows) {
    if (!["source", "event"].includes(row.row_kind)) bad();
    const value =
      row.row_kind === "source"
        ? validateIncubatorSourceCapture(row.payload)
        : validateIncubatorEvent(row.payload);
    if (
      value.sha256 !== row.id ||
      value.originOrgId !== row.origin_org_id ||
      value.bindingId !== row.binding_id ||
      (row.row_kind === "source"
        ? row.sequence !== null ||
          row.program_id !== null ||
          value.sourceVersion !== row.source_version ||
          row.receipt !== null
        : row.source_version !== null ||
          value.sequence !== row.sequence ||
          value.program.recordId !== row.program_id) ||
      !["live", "recovered"].includes(row.origin_mode)
    )
      bad();
    if (row.row_kind === "source") sources.push(value);
    else {
      const receipt =
        row.receipt === null
          ? null
          : validateIncubatorReceipt(row.receipt, value);
      if (
        row.origin_mode === "live" &&
        (receipt === null || value.originOrgId !== org)
      )
        bad();
      events.push({
        event: value,
        originMode: row.origin_mode,
        acceptedReceipt: receipt,
      });
    }
  }
  const folded = foldIncubatorHistory({ sources, events });
  for (const row of rows)
    if (row.row_kind === "source") {
      const binding = folded.bindings.find(
        (value) =>
          value.originOrgId === row.origin_org_id &&
          value.bindingId === row.binding_id,
      );
      if (!binding || binding.originMode !== row.origin_mode) bad();
    }
  return {
    ...folded,
    rows,
    usage: { count: Number(usage.count), bytes: Number(usage.bytes) },
  };
}
export function incubatorBinding(
  inventory,
  org,
  pin,
  { recovered = false } = {},
) {
  const matches = inventory.bindings.filter(
    (binding) =>
      binding.bindingId === pin.bindingId &&
      binding.originOrgId === pin.originOrgId &&
      binding.originMode === (recovered ? "recovered" : "live") &&
      (recovered || binding.originOrgId === org),
  );
  if (matches.length !== 1) incubatorUnavailable();
  const binding = matches[0];
  if (!same(binding.head, pin)) incubatorStale();
  return binding;
}
export function incubatorSource(inventory, pin) {
  const source = inventory.sources.find((value) => value.sha256 === pin.sha256);
  if (
    !source ||
    source.originOrgId !== pin.originOrgId ||
    source.bindingId !== pin.bindingId ||
    source.sourceVersion !== pin.sourceVersion
  )
    bad();
  return source;
}
export function duplicateIncubatorBindings(
  inventory,
  { org, programId, source },
) {
  return inventory.bindings.filter(
    (binding) =>
      binding.originMode === "live" &&
      binding.originOrgId === org &&
      binding.programId === programId &&
      same(binding.selection, source.selection) &&
      (binding.nativeSources.some(
        (value) => value.originalSha256 === source.originalSha256,
      ) ||
        inventory.sources.some(
          (value) =>
            value.sha256 === binding.source.sha256 &&
            value.originalSha256 === source.originalSha256,
        )),
  );
}

export async function insertIncubatorHistory(
  c,
  org,
  kind,
  payload,
  { mode = "live", receipt = null } = {},
) {
  if (
    !["source", "event"].includes(kind) ||
    !["live", "recovered"].includes(mode)
  )
    bad();
  const value =
    kind === "source"
      ? validateIncubatorSourceCapture(payload)
      : validateIncubatorEvent(payload);
  if (kind === "source" && receipt !== null) bad();
  if (kind === "event") {
    if (receipt !== null) validateIncubatorReceipt(receipt, value);
    if (mode === "live" && (receipt === null || value.originOrgId !== org))
      bad();
  }
  const existing = (
    await c.query(
      "SELECT * FROM os_incubator_history WHERE org_id=$1 AND id=$2",
      [org, value.sha256],
    )
  ).rows[0];
  if (existing) {
    if (
      existing.row_kind !== kind ||
      existing.origin_mode !== mode ||
      !same(existing.payload, value) ||
      !same(existing.receipt, receipt)
    )
      fail(
        409,
        "incubator_identity",
        "This retained identity already refers to different history or authority.",
      );
    return false;
  }
  const row = (
    await c.query(
      "INSERT INTO os_incubator_history(org_id,id,row_kind,origin_mode,origin_org_id,binding_id,sequence,source_version,program_id,payload,receipt,budget_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,octet_length($10::jsonb::text)+COALESCE(octet_length($11::jsonb::text),0)+4096) RETURNING budget_bytes,octet_length(to_jsonb(os_incubator_history)::text) AS actual",
      [
        org,
        value.sha256,
        kind,
        mode,
        value.originOrgId,
        value.bindingId,
        kind === "event" ? value.sequence : null,
        kind === "source" ? value.sourceVersion : null,
        kind === "event" ? value.program.recordId : null,
        JSON.stringify(value),
        receipt === null ? null : JSON.stringify(receipt),
      ],
    )
  ).rows[0];
  if (Number(row.actual) > Number(row.budget_bytes))
    fail(
      422,
      "incubator_quota",
      "The retained row exceeds its bounded SQL representation.",
    );
  return true;
}
export async function acceptedIncubatorCommand(c, org, commandHash) {
  const row = (
    await c.query(
      "SELECT payload,receipt FROM os_incubator_history WHERE org_id=$1 AND row_kind='event' AND origin_mode='live' AND receipt->>'commandHash'=$2",
      [org, commandHash],
    )
  ).rows[0];
  if (!row) return null;
  const event = validateIncubatorEvent(row.payload),
    receipt = validateIncubatorReceipt(row.receipt, event);
  return { event, receipt };
}

/** Replace only this verified session's feature authority, never another actor's
 * pending work, a committed archive or a recovered historical receipt. */
export async function clearIncubatorPending(
  c,
  org,
  member,
  session,
  { previewsOnly = false } = {},
) {
  await c.query(
    "DELETE FROM os_previews WHERE org_id=$1 AND actor_id=$2 AND committed_at IS NULL AND kind=ANY($3::text[]) AND payload->>'sessionSha256'=$4",
    [
      org,
      member.userId,
      previewsOnly ? [INCUBATOR_PREVIEW] : INCUBATOR_PREVIEW_KINDS,
      incubatorSessionHash(session),
    ],
  );
}
export async function storeIncubatorPending(
  c,
  org,
  member,
  kind,
  payload,
  { id, reviewSha256 },
) {
  if (!INCUBATOR_PREVIEW_KINDS.includes(kind)) bad();
  await c.query(
    "DELETE FROM os_previews WHERE org_id=$1 AND committed_at IS NULL AND expires_at<=clock_timestamp()",
    [org],
  );
  const encoded = JSON.stringify(payload),
    wire = Buffer.byteLength(encoded);
  if (wire > L.previewBytes)
    fail(
      413,
      "incubator_preview_size",
      "This complete selected preview exceeds 2 MiB.",
    );
  const measured = (
    await c.query("SELECT octet_length($1::jsonb::text) AS bytes", [encoded])
  ).rows[0];
  // The actual os_previews composite is checked after insertion too.
  if (Number(measured.bytes) > L.previewBytes)
    fail(
      413,
      "incubator_preview_size",
      "This selected preview exceeds its 2 MiB hosted representation.",
    );
  const usage = (
    await c.query(
      "SELECT count(*) AS count,COALESCE(sum(octet_length(payload::text)),0) AS bytes FROM os_previews WHERE org_id=$1 AND committed_at IS NULL",
      [org],
    )
  ).rows[0];
  if (
    Number(usage.count) >= 4 ||
    Number(usage.bytes) + Number(measured.bytes) > 128 * 1024 * 1024
  )
    fail(
      422,
      "incubator_preview_quota",
      "The shared pending-preview count or byte budget is in use. Finish a preview or wait for expiry.",
    );
  const row = (
    await c.query(
      "INSERT INTO os_previews(org_id,id,actor_id,kind,payload,checksum,base_revision,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,1,clock_timestamp()+interval '10 minutes') RETURNING expires_at,octet_length(to_jsonb(os_previews)::text) AS bytes",
      [org, id, member.userId, kind, encoded, reviewSha256],
    )
  ).rows[0];
  if (
    Number(row.bytes) > L.previewBytes ||
    (await logicalBackupBytes(c, org)) > 60 * 1024 * 1024
  )
    fail(
      422,
      "incubator_quota",
      "This complete pending preview cannot fit the current workspace budget. Existing history remains exportable.",
    );
  return {
    previewId: id,
    reviewSha256,
    expiresAt: row.expires_at.toISOString(),
  };
}
export async function readIncubatorPending(c, org, id, kind, member, session) {
  const row = (
    await c.query(
      "SELECT *,expires_at>clock_timestamp() AS current FROM os_previews WHERE org_id=$1 AND id=$2 AND committed_at IS NULL",
      [org, id],
    )
  ).rows[0];
  if (
    !row ||
    row.kind !== kind ||
    !row.current ||
    row.actor_id !== member.userId ||
    row.payload?.sessionSha256 !== incubatorSessionHash(session)
  )
    fail(
      409,
      "incubator_preview",
      "This source review expired or was replaced. Inspect the file and review again.",
    );
  if (
    H(kind === INCUBATOR_INSPECTION ? "inspection" : "review", row.payload) !==
    row.checksum
  )
    bad();
  return row;
}
export async function currentIncubatorDisposition(c, org, event, member) {
  requireIncubatorScope(member, event.program.recordId);
  const values = [];
  for (const candidate of event.candidates) {
    const row = (
      await c.query(
        "SELECT module_id,data,revision,deleted_at FROM os_records WHERE org_id=$1 AND id=$2",
        [org, candidate.id],
      )
    ).rows[0];
    const disposition =
      !row || row.module_id !== "projects"
        ? "unavailable"
        : row.deleted_at
          ? "trash"
          : row.revision === 1 &&
              H("candidate-data", row.data) ===
                H("candidate-data", candidate.data)
            ? "original"
            : "modified";
    values.push({
      id: candidate.id,
      moduleId: "projects",
      disposition,
      ...(row?.module_id === "projects" ? { revision: row.revision } : {}),
    });
  }
  return values;
}
export const encodeIncubatorCursor = (value) =>
  Buffer.from(incubatorCanonical(value)).toString("base64url");
