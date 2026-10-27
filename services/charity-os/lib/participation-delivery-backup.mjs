import { fail, id } from "./security.mjs";
import { DELIVERY_TEMPLATE_VERSION } from "./participation-delivery.mjs";
const plain = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const iso = (v) => v?.toISOString?.() || v || null;
const stamp = (v) =>
  v === null ||
  (typeof v === "string" &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v);
const bad = () =>
  fail(
    422,
    "participation_delivery_backup",
    "Invalid delivery policy history. No delivery authority was imported.",
  );
export async function exportDelivery(c, org) {
  const p = (
    await c.query(
      "SELECT revision,enabled,activated_at,template_version,updated_at FROM os_participation_delivery_policies WHERE org_id=$1",
      [org],
    )
  ).rows[0];
  return {
    version: 1,
    policy: p
      ? {
          revision: p.revision,
          enabled: p.enabled,
          activatedAt: iso(p.activated_at),
          templateVersion: p.template_version,
          updatedAt: iso(p.updated_at),
        }
      : null,
  };
}
export function restoredDelivery(backup) {
  if (!plain(backup)) bad();
  const value = backup.delivery;
  if (value === undefined) return { version: 1, policy: null };
  if (
    !plain(value) ||
    value.version !== 1 ||
    Object.keys(value).some((k) => !["version", "policy"].includes(k)) ||
    Buffer.byteLength(JSON.stringify(value)) > 4096
  )
    bad();
  const p = value.policy;
  if (p === null) return { version: 1, policy: null };
  if (
    !plain(p) ||
    Object.keys(p).some(
      (k) =>
        ![
          "revision",
          "enabled",
          "activatedAt",
          "templateVersion",
          "updatedAt",
        ].includes(k),
    ) ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < 1 ||
    typeof p.enabled !== "boolean" ||
    p.templateVersion !== DELIVERY_TEMPLATE_VERSION ||
    !stamp(p.activatedAt) ||
    !stamp(p.updatedAt) ||
    p.updatedAt === null
  )
    bad();
  return { version: 1, policy: { ...p, enabled: false } };
}
export async function restoreDelivery(c, org, user, normalized) {
  if (!normalized?.policy) return;
  // The complete source remains in the private import archive. A working policy
  // receives a new epoch and no actor/preview/recipient/send authority.
  await c.query(
    "INSERT INTO os_participation_delivery_policies(org_id,revision,enabled,epoch,activated_at,template_version) VALUES($1,1,false,$2,NULL,$3)",
    [org, id(), DELIVERY_TEMPLATE_VERSION],
  );
}
