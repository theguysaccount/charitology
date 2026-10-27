import { MODULE_MAP, SCHEMA_VERSION, validateRecord } from "./modules.mjs";
import { hash, fail } from "./security.mjs";
import { restoredIntake } from "./intake-backup.mjs";
import { restoredParticipation } from "./participation-backup.mjs";
import { restoredDelivery } from "./participation-delivery-backup.mjs";
export const FORMAT = "charitology-os";
export function makeBackup(org, records, extras = {}) {
  const payload = {
    format: FORMAT,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    organization: {
      name: org.name,
      currency: org.currency,
      timeZone: org.time_zone,
    },
    createdAt: new Date().toISOString(),
    records,
    ...extras,
  };
  return { ...payload, checksum: hash(payload) };
}
export function validateBackup(input, orgId, userId) {
  if (
    !input ||
    input.format !== FORMAT ||
    input.version !== 1 ||
    input.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(input.records)
  )
    fail(422, "backup", "Use a version1 Charity OS backup.");
  if (input.records.length > 2000)
    fail(422, "backup", "A backup may contain at most2,000 records.");
  const { checksum, ...payload } = input;
  if (!checksum || hash(payload) !== checksum)
    fail(
      422,
      "checksum",
      "The backup checksum does not match. Nothing was imported.",
    );
  const connections = restoredIntegrations(input);
  restoredIntake(input);
  restoredParticipation(input);
  restoredDelivery(input);
  const seen = new Set();
  const records = input.records.map((r) => {
    if (
      !r ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(r.id) ||
      seen.has(r.id) ||
      !MODULE_MAP[r.moduleId]
    )
      fail(422, "backup_record", "Invalid or duplicate record identity.");
    seen.add(r.id);
    return {
      id: r.id,
      orgId,
      moduleId: r.moduleId,
      data: r.data,
      status: MODULE_MAP[r.moduleId].workflow.initial,
      ownerId: userId,
      revision: 1,
      approval: null,
      snapshot: null,
      source: restoreSource(r.source),
    };
  });
  for (const r of records) {
    if (r.source && !connections.some((c) => c.id === r.source.integrationId))
      fail(
        422,
        "source",
        "A source identity needs its disabled connection metadata.",
      );
  }
  for (const r of records)
    r.data = validateRecord(r.moduleId, r.data, {
      records,
      orgId,
      recordId: r.id,
      status: r.status,
    });
  return records;
}
export function toCsv(records, module) {
  const fields = [
    "id",
    "status",
    "revision",
    ...module.fields.map((x) => x.key),
  ];
  const cell = (value) => {
    let text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (/^(?:[\s\u0000-\u0020]*[=+@-]|[\t\r\n])/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    fields,
    ...records.map((r) => fields.map((k) => (k in r ? r[k] : r.data[k]))),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

function restoreSource(value) {
  if (value == null) return null;
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some(
      (k) => !["integrationId", "externalId", "checksum"].includes(k),
    ) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(value.integrationId) ||
    typeof value.externalId !== "string" ||
    !value.externalId ||
    value.externalId.length > 160 ||
    !/^[a-f0-9]{64}$/.test(value.checksum)
  )
    fail(422, "source", "Invalid source provenance.");
  return { ...value };
}
export function restoredIntegrations(backup) {
  const rows = backup.integrations || [];
  if (!Array.isArray(rows) || rows.length > 30)
    fail(422, "integrations", "Invalid connection metadata.");
  const seen = new Set();
  return rows.map((r) => {
    if (
      !r ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(r.id) ||
      seen.has(r.id) ||
      !["csv", "civicrm", "openproject", "kobo"].includes(r.provider) ||
      typeof r.name !== "string" ||
      !r.name.trim() ||
      r.name.length > 180 ||
      !MODULE_MAP[r.config?.moduleId]
    )
      fail(422, "integration", "Invalid restored connection metadata.");
    seen.add(r.id);
    const config = r.config;
    let baseUrl = null;
    if (r.provider !== "csv") {
      let u;
      try {
        u = new URL(config.baseUrl);
      } catch {
        fail(422, "integration", "Invalid restored origin.");
      }
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        u.search ||
        u.hash ||
        (u.port && u.port !== "443")
      )
        fail(422, "integration", "Invalid restored origin.");
      baseUrl = u.origin;
    }
    const map = config.fieldMap || {};
    if (
      !map ||
      typeof map !== "object" ||
      Array.isArray(map) ||
      Object.keys(map).length > 50 ||
      Object.entries(map).some(
        ([k, v]) =>
          !/^[A-Za-z0-9_ -]{1,100}$/.test(k) ||
          !MODULE_MAP[config.moduleId].fields.some((f) => f.key === v),
      )
    )
      fail(422, "integration", "Invalid restored field mapping.");
    return {
      id: r.id,
      name: r.name,
      provider: r.provider,
      config: { baseUrl, moduleId: config.moduleId, fieldMap: map },
      status: "unconfigured",
    };
  });
}
