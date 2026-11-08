import { fail } from "./security.mjs";
import {
  makeIncubatorBackup,
  validateIncubatorBackup,
} from "./incubator-bridge-model.mjs";
import {
  loadIncubatorInventory,
  insertIncubatorHistory,
} from "./incubator-bridge-store.mjs";

export function restoredIncubatorBridge(value, context = {}) {
  return value === undefined ? null : validateIncubatorBackup(value, context);
}
export async function exportIncubatorBridge(c, org, context = {}) {
  const inventory = await loadIncubatorInventory(c, org);
  if (!inventory.rows.length) return undefined;
  return makeIncubatorBackup(
    { sources: inventory.sources, events: inventory.events },
    context,
  );
}
export async function restoreIncubatorBridge(c, org, value, context = {}) {
  const admitted = restoredIncubatorBridge(value, context);
  if (admitted === null) return { sources: 0, events: 0 };
  if (
    Number(
      (
        await c.query(
          "SELECT count(*) AS count FROM os_incubator_history WHERE org_id=$1",
          [org],
        )
      ).rows[0].count,
    )
  )
    fail(
      409,
      "restore_conflict",
      "Restore requires a destination without Incubator history.",
    );
  for (const source of admitted.sources)
    await insertIncubatorHistory(c, org, "source", source, {
      mode: "recovered",
    });
  for (const entry of admitted.events)
    await insertIncubatorHistory(c, org, "event", entry.event, {
      mode: "recovered",
      receipt: entry.acceptedReceipt,
    });
  await loadIncubatorInventory(c, org);
  return { sources: admitted.sources.length, events: admitted.events.length };
}

/** SELECT-only actual JSONB charges, shared by inactive SQL projection. */
export async function measureIncubatorBackup(c, value, context = {}) {
  const admitted = restoredIncubatorBridge(value, context);
  if (admitted === null) return null;
  const inputs = [
    ...admitted.sources.map((payload) => ({
      kind: "source",
      payload,
      receipt: null,
    })),
    ...admitted.events.map((entry) => ({
      kind: "event",
      payload: entry.event,
      receipt: entry.acceptedReceipt,
    })),
  ];
  const measured = (
    await c.query(
      "SELECT item.ordinality::integer AS position,octet_length((item.value->'payload')::text) AS payload_bytes,CASE WHEN item.value->'receipt'='null'::jsonb THEN 0 ELSE octet_length((item.value->'receipt')::text) END AS receipt_bytes FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS item(value,ordinality) ORDER BY item.ordinality",
      [JSON.stringify(inputs)],
    )
  ).rows;
  if (measured.length !== inputs.length)
    fail(
      422,
      "incubator_capacity",
      "The exact hosted history projection is unavailable.",
    );
  const rows = inputs.map((input, index) => {
    const size = measured[index],
      payload = input.payload;
    if (
      Number(size.position) !== index + 1 ||
      Number(size.payload_bytes) >
        (input.kind === "source" ? 1056768 : 131072) ||
      Number(size.receipt_bytes) > 8192
    )
      fail(
        422,
        "incubator_capacity",
        "This retained history exceeds its hosted representation bound.",
      );
    return {
      id: payload.sha256,
      rowKind: input.kind,
      originOrgId: payload.originOrgId,
      bindingId: payload.bindingId,
      sequence: input.kind === "event" ? payload.sequence : null,
      sourceVersion: input.kind === "source" ? payload.sourceVersion : null,
      programId: input.kind === "event" ? payload.program.recordId : null,
      payload,
      receipt: input.receipt,
      budgetBytes:
        Number(size.payload_bytes) + Number(size.receipt_bytes) + 4096,
    };
  });
  if (
    rows.length > 1000 ||
    rows.reduce((sum, row) => sum + row.budgetBytes, 0) > 16777216
  )
    fail(
      422,
      "incubator_quota",
      "This complete retained source and history cannot fit the 1,000-row and 16 MiB bounds.",
    );
  return { admitted, rows };
}
