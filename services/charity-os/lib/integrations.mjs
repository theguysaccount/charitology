import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireAdmin } from "./access.mjs";
import { getModule, validateRecord } from "./modules.mjs";
import {
  allRecords,
  saveRecord,
  audit,
  storePreview,
  commitPreview,
} from "./database.mjs";
import { id, hash, encrypt, decrypt, clean, fail, json } from "./security.mjs";
const okay = (value) => json({ ok: true, ...value });
const providers = ["civicrm", "openproject", "kobo", "csv"];
export function publicAddress(value) {
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return (
      a > 0 &&
      a < 224 &&
      a !== 10 &&
      a !== 127 &&
      !(a === 169 && b === 254) &&
      !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 192 && (b === 168 || b === 0 || b === 2)) &&
      !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 198 && (b === 18 || b === 19 || b === 51)) &&
      !(a === 203 && b === 0)
    );
  }
  if (isIP(value) === 6)
    return (
      /^2[0-9a-f]{3}:/i.test(value) && !/^2001:(?:db8|0|10|20):/i.test(value)
    );
  return false;
}
export function integrationUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    fail(422, "url", "Enter the HTTPS origin of your service.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    isIP(u.hostname) ||
    !u.hostname.includes(".") ||
    u.hostname.endsWith(".local")
  )
    fail(
      422,
      "url",
      "Use a public HTTPS origin without a path, query, credentials or custom port.",
    );
  return u.origin;
}
export async function readRemote(
  url,
  headers,
  { resolver = lookup, requester = https.request } = {},
) {
  const u = new URL(url),
    addresses = await resolver(u.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((x) => !publicAddress(x.address)))
    fail(
      422,
      "host",
      "This host does not resolve exclusively to public addresses.",
    );
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const req = requester(
      u,
      {
        method: "GET",
        headers: { accept: "application/json", ...headers },
        servername: u.hostname,
        lookup: (_host, options, cb) =>
          cb(null, options?.all ? [chosen] : chosen.address, chosen.family),
        timeout: 12000,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error("Remote authentication or endpoint failed."));
        }
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024)
            res.destroy(new Error("Remote preview exceeds2 MiB."));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Remote endpoint did not return JSON."));
          }
        });
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Remote service timed out.")),
    );
    req.on("error", reject);
    req.end();
  });
}
export function providerRequest(integration, token) {
  const base = integration.config.baseUrl;
  switch (integration.provider) {
    case "civicrm": {
      const u = new URL("/civicrm/ajax/api4/Contact/get", base);
      u.searchParams.set(
        "params",
        JSON.stringify({
          select: ["id", "display_name", "contact_type"],
          limit: 100,
        }),
      );
      return {
        url: u.toString(),
        headers: {
          "X-Civi-Auth": `Bearer ${token}`,
          "X-Requested-With": "XMLHttpRequest",
        },
      };
    }
    case "openproject":
      return {
        url: new URL("/api/v3/work_packages?pageSize=100", base).toString(),
        headers: {
          authorization: `Basic ${Buffer.from("apikey:" + token).toString("base64")}`,
        },
      };
    case "kobo":
      return {
        url: new URL("/api/v2/assets/?limit=100", base).toString(),
        headers: { authorization: `Token ${token}` },
      };
    default:
      fail(422, "provider", "CSV imports do not contact an external service.");
  }
}
function safe(r) {
  return {
    id: r.id,
    provider: r.provider,
    name: r.name,
    config: r.config,
    status: r.status,
    lastCheckedAt: r.last_checked_at,
    lastError: r.last_error,
    revision: r.revision,
    credentialsConfigured: !!r.encrypted_token,
  };
}
function rowsOf(provider, data) {
  const rows =
    provider === "civicrm"
      ? data.values
      : provider === "openproject"
        ? data._embedded?.elements
        : data.results;
  if (!Array.isArray(rows))
    throw new Error("Remote collection shape was not recognized.");
  return rows;
}
export function mapRows(rows, integration, records, org, user) {
  if (!Array.isArray(rows) || rows.length > 1000)
    fail(422, "rows", "Import at most1,000 rows per preview.");
  const m = getModule(integration.config.moduleId),
    map = integration.config.fieldMap || {},
    out = [],
    issues = [],
    seen = new Set();
  let skipped = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    try {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error("Use object rows.");
      const externalId = String(row.id ?? row._id ?? "");
      if (!externalId || externalId.length > 160)
        throw new Error("Each row needs a stable external id.");
      if (seen.has(externalId)) throw new Error("Duplicate source identity.");
      seen.add(externalId);
      const externalSystem = `${integration.provider}:${integration.id}`;
      const existing = records.find(
        (r) =>
          r.moduleId === m.id &&
          r.source?.integrationId === integration.id &&
          r.source?.externalId === externalId,
      );
      if (existing) {
        if (existing.source.checksum === hash(row)) skipped++;
        else
          issues.push({
            row: index + 1,
            field: "externalId",
            message:
              "Existing source record changed; reconcile it explicitly before reimporting.",
          });
        continue;
      }
      const data = {
        title: clean(
          row.title ||
            row.subject ||
            row.display_name ||
            row.name ||
            `Imported ${externalId}`,
          180,
        ),
        kind: m.fields.find((f) => f.key === "kind").options[0].value,
      };
      for (const [source, target] of Object.entries(map)) {
        if (!Object.hasOwn(row, source)) continue;
        data[target] = row[source];
      }
      const keys = new Set(m.fields.map((f) => f.key));
      if (keys.has("externalSystem"))
        Object.assign(data, {
          externalSystem,
          externalId,
          externalUrl: integration.config.baseUrl || null,
        });
      const record = {
        id: id(),
        orgId: org,
        moduleId: m.id,
        data,
        status: m.workflow.initial,
        ownerId: user,
        lastEditedBy: user,
        source: {
          integrationId: integration.id,
          externalId,
          checksum: hash(row),
        },
        revision: 1,
        approval: null,
        snapshot: null,
      };
      record.data = validateRecord(m.id, data, {
        records: [...records, ...out, record],
        orgId: org,
        recordId: record.id,
        status: record.status,
      });
      out.push(record);
    } catch (e) {
      issues.push({
        row: index + 1,
        field: e.issues?.[0]?.field || "row",
        message: e.issues?.[0]?.message || e.message,
      });
    }
  }
  return {
    records: out,
    issues,
    summary: {
      accepted: out.length,
      rejected: issues.length,
      skipped,
      conflicts: issues.filter((x) => x.field === "externalId").length,
    },
  };
}
export async function integrationRoutes({
  c,
  org,
  user,
  member,
  tail,
  method,
  input,
  settings,
}) {
  if (!tail.startsWith("integrations")) return null;
  requireAdmin(member);
  if (tail === "integrations" && method === "GET")
    return okay({
      integrations: (
        await c.query(
          "SELECT * FROM os_integrations WHERE org_id=$1 ORDER BY created_at",
          [org],
        )
      ).rows.map(safe),
    });
  if (tail === "integrations" && method === "POST") {
    if (
      Number(
        (
          await c.query(
            "SELECT count(*) AS count FROM os_integrations WHERE org_id=$1",
            [org],
          )
        ).rows[0].count,
      ) >= 30
    )
      fail(422, "quota", "This workspace reached its30 connection limit.");
    if (!providers.includes(input.provider))
      fail(422, "provider", "Choose CiviCRM, OpenProject, KoboToolbox or CSV.");
    const name = clean(input.name, 180);
    if (!name) fail(422, "name", "Enter a connection name.");
    const moduleId =
        input.moduleId ||
        {
          civicrm: "contacts",
          openproject: "projects",
          kobo: "forms",
          csv: "projects",
        }[input.provider],
      m = getModule(moduleId),
      map = input.fieldMap || {};
    if (
      !map ||
      typeof map !== "object" ||
      Array.isArray(map) ||
      Object.entries(map).length > 50 ||
      Object.entries(map).some(
        ([k, v]) =>
          !/^[A-Za-z0-9_ -]{1,100}$/.test(k) ||
          !m.fields.some((f) => f.key === v) ||
          ["__proto__", "constructor", "prototype"].includes(v),
      )
    )
      fail(422, "mapping", "Use a simple source-to-field mapping.");
    const config = {
      baseUrl: input.provider === "csv" ? null : integrationUrl(input.baseUrl),
      moduleId,
      fieldMap: map,
    };
    const token = clean(input.token, 4000),
      connection = id();
    await c.query(
      "INSERT INTO os_integrations(org_id,id,provider,name,config,encrypted_token) VALUES($1,$2,$3,$4,$5,$6)",
      [
        org,
        connection,
        input.provider,
        name,
        JSON.stringify(config),
        token ? encrypt(token, settings.encryptionKey) : null,
      ],
    );
    await audit(c, org, user, "integration.created", null, {
      id: connection,
      provider: input.provider,
    });
    return okay({
      integration: {
        id: connection,
        provider: input.provider,
        name,
        config,
        status: "unconfigured",
        revision: 1,
        credentialsConfigured: !!token,
      },
    });
  }
  const connectionMatch = tail.match(/^integrations\/([A-Za-z0-9_-]+)$/);
  if (connectionMatch && ["PATCH", "DELETE"].includes(method)) {
    const connection = (
      await c.query(
        "SELECT * FROM os_integrations WHERE org_id=$1 AND id=$2 FOR UPDATE",
        [org, connectionMatch[1]],
      )
    ).rows[0];
    if (!connection) fail(404, "integration", "Connection not found.");
    if (connection.revision !== input.revision)
      fail(409, "revision", "This connection changed. Refresh before saving.");
    if (method === "DELETE") {
      await c.query(
        "UPDATE os_integrations SET encrypted_token=NULL,status='disabled',revision=revision+1,last_error=NULL WHERE org_id=$1 AND id=$2",
        [org, connection.id],
      );
      await audit(c, org, user, "integration.disabled", null, {
        id: connection.id,
      });
      return okay({ disabled: true });
    }
    const token = clean(input.token, 4000),
      name = clean(input.name || connection.name, 180);
    if (!token && input.clearCredentials !== true)
      fail(
        422,
        "credentials",
        "Enter the replacement API token or explicitly remove the saved credential.",
      );
    await c.query(
      "UPDATE os_integrations SET name=$3,encrypted_token=$4,status='unconfigured',revision=revision+1,last_error=NULL,last_checked_at=NULL WHERE org_id=$1 AND id=$2",
      [
        org,
        connection.id,
        name,
        token ? encrypt(token, settings.encryptionKey) : null,
      ],
    );
    await audit(c, org, user, "integration.credentials_changed", null, {
      id: connection.id,
      credentialRemoved: !token,
    });
    return okay({ updated: true });
  }
  const match = tail.match(
    /^integrations\/([A-Za-z0-9_-]+)\/(test|preview|import)$/,
  );
  if (!match || method !== "POST")
    fail(404, "integration", "This integration action is unavailable.");
  const row = (
    await c.query("SELECT * FROM os_integrations WHERE org_id=$1 AND id=$2", [
      org,
      match[1],
    ])
  ).rows[0];
  if (!row) fail(404, "integration", "Connection not found.");
  if (row.status === "disabled")
    fail(409, "disabled", "This connection is disabled.");
  const integration = safe(row),
    action = match[2];
  if (action === "import") {
    const preview = (
      await c.query(
        "SELECT * FROM os_previews WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind=$4 AND expires_at>now() FOR UPDATE",
        [org, input.previewId, user, `integration:${row.id}`],
      )
    ).rows[0];
    if (!preview || preview.committed_at)
      fail(409, "preview", "This import preview expired or was already used.");
    const current = await allRecords(c, org);
    if (hash(current.map((r) => [r.id, r.revision])) !== preview.base_revision)
      fail(
        409,
        "revision",
        "Workspace records changed. Preview the import again.",
      );
    if (preview.payload.issues.length)
      fail(
        422,
        "conflicts",
        "Resolve every rejected or conflicting row before importing.",
      );
    await commitPreview(c, org, preview.id);
    for (const record of preview.payload.records) {
      record.data = validateRecord(record.moduleId, record.data, {
        records: [...current, ...preview.payload.records],
        orgId: org,
        recordId: record.id,
        status: record.status,
      });
      await saveRecord(c, record);
      await audit(c, org, user, "record.imported", record, {
        record,
        sourceChecksum: preview.checksum,
      });
    }
    await audit(c, org, user, "integration.imported", null, {
      id: row.id,
      count: preview.payload.records.length,
      checksum: preview.checksum,
    });
    return okay({ imported: preview.payload.records.length });
  }
  let rows;
  try {
    if (row.provider === "csv") {
      rows = input.rows || [];
      if (action === "test")
        return okay({
          result: {
            connected: true,
            message:
              "CSV mode is ready for a local preview; no remote account is connected.",
            checkedAt: new Date().toISOString(),
          },
        });
    } else {
      if (!row.encrypted_token)
        fail(
          422,
          "credentials",
          "Add a service API token in a new connection.",
        );
      const { url, headers } = providerRequest(
        integration,
        decrypt(row.encrypted_token, settings.encryptionKey),
      );
      rows = rowsOf(row.provider, await readRemote(url, headers));
    }
    await c.query(
      "UPDATE os_integrations SET status='verified',last_checked_at=now(),last_error=NULL WHERE org_id=$1 AND id=$2",
      [org, row.id],
    );
    if (action === "test")
      return okay({
        result: {
          connected: true,
          message: `Read-only connection succeeded. Preview is limited to the first100 records.`,
          checkedAt: new Date().toISOString(),
        },
      });
  } catch (e) {
    if (e.status) throw e;
    await c.query(
      "UPDATE os_integrations SET status='error',last_checked_at=now(),last_error='Remote request failed. Check credentials, permissions and endpoint.' WHERE org_id=$1 AND id=$2",
      [org, row.id],
    );
    return json(
      {
        ok: false,
        code: "remote",
        message:
          "Remote request failed. Check credentials, permissions and endpoint.",
      },
      502,
    );
  }
  const current = await allRecords(c, org),
    preview = mapRows(rows, integration, current, org, user),
    previewId = id();
  await storePreview(c, {
    org,
    previewId,
    actorId: user,
    kind: `integration:${row.id}`,
    payload: preview,
    checksum: hash(rows),
    baseRevision: hash(current.map((r) => [r.id, r.revision])),
  });
  return okay({ previewId, ...preview });
}
