import {
  MODULES,
  ROLES,
  CURRENCIES,
  getModule,
  validateRecord,
  validateTransition,
  ModuleValidationError,
} from "./modules.mjs";
import {
  body,
  checkOrigin,
  checkCsrf,
  csrf,
  id,
  hash,
  clean,
  email,
  dateZone,
  fail,
  HttpError,
  json,
  escape,
  equal,
  streamText,
} from "./security.mjs";
import {
  audit,
  allRecords,
  rowRecord,
  saveRecord,
  storePreview,
  commitPreview,
} from "./database.mjs";
import {
  membership,
  administrators,
  requireAdmin,
  requirePermission,
  inScope,
  visibleRecord,
} from "./access.mjs";
import {
  makeBackup,
  validateBackup,
  toCsv,
  restoredIntegrations,
} from "./backup.mjs";
import {
  isLocalOsBackup,
  previewLocalOsMigration,
  MigrationError,
} from "./migration.mjs";
import { validateFile, FILE_QUOTA } from "./files.mjs";
import { uploadPart, uploadedBackup, downloadJson } from "./uploads.mjs";
import { memberRoutes, acceptInvite } from "./members.mjs";
import { integrationRoutes } from "./integrations.mjs";
import { publicIntakeRoutes, intakeRoutes } from "./intake.mjs";
import { participantRoutes } from "./participants.mjs";
import {
  participationRoutes,
  participantParticipationRoutes,
} from "./participation.mjs";
import { guardParticipationWrite } from "./participation-guards.mjs";
import {
  deliveryRoutes,
  ownDeliveryRoutes,
  runParticipationDelivery,
} from "./participation-delivery.mjs";
import {
  exportDelivery,
  restoredDelivery,
  restoreDelivery,
} from "./participation-delivery-backup.mjs";
import { participationMailer } from "./mail.mjs";
import {
  grantReportRoutes,
  isGrantReport,
  grantReportForReader,
} from "./grant-reports.mjs";
import {
  exportParticipation,
  restoredParticipation,
  restoreParticipation,
} from "./participation-backup.mjs";
import {
  authDestination,
  confirmDestination,
  confirmForm,
} from "./auth-return.mjs";
import {
  exportIntake,
  restoredIntake,
  restoreIntake,
} from "./intake-backup.mjs";
import { runJobs, runOrgJobs, enqueue } from "./jobs.mjs";
const okay = (value) => json({ ok: true, ...value });
const iso = (x) => x?.toISOString?.() || x;
const stale = (input, record) => {
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision !== record.revision
  )
    fail(
      409,
      "revision",
      "This record changed in another session. Reload it before saving.",
    );
};
const snapshot = (r) => ({
  id: r.id,
  orgId: r.orgId,
  moduleId: r.moduleId,
  data: r.data,
  status: r.status,
  ownerId: r.ownerId,
  revision: r.revision,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  files: r.snapshot?.files || [],
});
export function createHandler({
  settings,
  db,
  auth,
  send,
  participationTransport = participationMailer(settings),
}) {
  return async function handle(request) {
    try {
      const url = new URL(request.url),
        path = url.pathname,
        method = request.method;
      if (path === "/api/health")
        return okay({
          service: "charitology-os",
          authenticationConfigured: true,
          emailConfigured: !!settings.relaySecret,
          version: 1,
        });
      if (path === "/api/cron/maintenance") {
        if (
          !settings.cronSecret ||
          !equal(
            request.headers.get("authorization"),
            `Bearer ${settings.cronSecret}`,
          )
        )
          fail(401, "cron", "Unauthorized.");
        const budget = { deadline: Date.now() + 45000, remaining: 20 };
        const jobs = await runJobs({ db, send, settings, budget });
        const participation = await runParticipationDelivery({
          db,
          transport: participationTransport,
          settings,
          budget,
        });
        return okay({ ...jobs, participation });
      }
      if (path === "/auth/confirm" && method === "GET") {
        const token = url.searchParams.get("token") || "";
        const destination = confirmDestination(url.searchParams);
        if (!/^[A-Za-z0-9_-]{20,300}$/.test(token))
          fail(400, "token", "This sign-in link is invalid.");
        return new Response(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/os.css"><title>Confirm sign in · Charity OS</title><main class="auth-card"><img src="/mark.svg" width="54" height="54" alt=""><h1>Sign in to ${destination.name === "participant" ? "your requests" : "Charity OS"}</h1><p>Continue only if you requested this link. It expires after 10 minutes and can be used once.</p><form method="post" action="/auth/confirm"><input type="hidden" name="token" value="${escape(token)}"><input type="hidden" name="destination" value="${destination.name}"><button type="submit">Confirm sign in</button></form></main></html>`,
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
              "referrer-policy": "no-referrer",
              "content-security-policy":
                "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'",
            },
          },
        );
      }
      if (path === "/auth/confirm" && method === "POST") {
        const origin = request.headers.get("origin");
        if (origin !== settings.origin && origin !== "null")
          fail(403, "origin", "Return to the sign-in link in your email.");
        const form = await confirmForm(request);
        const destination = confirmDestination(form);
        const token = String(form.get("token") || "");
        if (!/^[A-Za-z0-9_-]{20,300}$/.test(token))
          fail(400, "token", "Invalid sign-in link.");
        const target = new URL("/api/auth/magic-link/verify", settings.origin);
        target.searchParams.set("token", token);
        target.searchParams.set("callbackURL", destination.path);
        const headers = new Headers(request.headers);
        headers.set("origin", settings.origin);
        headers.delete("content-length");
        headers.delete("content-type");
        return await auth.handler(new Request(target, { headers }));
      }
      if (path === "/api/auth/request-link" && method === "POST") {
        checkOrigin(request, settings.origin);
        const input = await body(request, 2000);
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).some((k) => !["email", "destination"].includes(k))
        )
          fail(
            400,
            "login_fields",
            "Use only email and a supported sign-in destination.",
          );
        const destination = authDestination(input.destination);
        const address = email(input.email);
        await db.limit(`login:${hash(address)}`, 4, 900);
        await db.limit(
          `login-ip:${hash(request.headers.get("x-forwarded-for")?.split(",")[0] || "local")}`,
          30,
          3600,
        );
        await auth.api.signInMagicLink({
          body: {
            email: address,
            callbackURL: destination.path,
            metadata: { destination: destination.name },
          },
          headers: request.headers,
        });
        return okay({
          accepted: true,
          message: "Check your inbox for a sign-in link.",
        });
      }
      if (path === "/api/auth/ok" && method === "GET")
        return json({ status: "ok" });
      // Better Auth's consuming GET is intentionally not exposed. Email scanners only see the confirmation page.
      if (path.startsWith("/api/auth/") && path !== "/api/auth/logout")
        fail(404, "route", "This route is unavailable.");
      const publicIntakeResponse = await publicIntakeRoutes({
        request,
        url,
        db,
        settings,
      });
      if (publicIntakeResponse) return publicIntakeResponse;
      const session = await auth.api.getSession({ headers: request.headers });
      if (path === "/api/participant/session" && method === "GET") {
        const query = new URLSearchParams(url.search);
        if (
          query.getAll("path").length === 1 &&
          query.get("path") === path.slice(5)
        )
          query.delete("path");
        if ([...query.keys()].length)
          fail(
            400,
            "participant_query",
            "Do not include private data in query parameters.",
          );
        return okay(
          session
            ? {
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  emailVerified: session.user.emailVerified === true,
                },
                csrfToken: csrf(session.session.id, settings.secret),
              }
            : { user: null },
        );
      }
      if (path === "/api/session" && method === "GET") {
        if (!session) return okay({ user: null });
        const orgs = await db.tx(session.user.id, null, async (c) =>
          (
            await c.query(
              "SELECT o.id,o.name,o.slug,o.currency,o.time_zone,m.role,m.program_ids FROM os_orgs o JOIN os_members m ON m.org_id=o.id WHERE m.user_id=$1 ORDER BY o.name",
              [session.user.id],
            )
          ).rows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            currency: r.currency,
            timeZone: r.time_zone,
            role: r.role,
            programIds: r.program_ids,
          })),
        );
        return okay({
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
          orgs,
          csrfToken: csrf(session.session.id, settings.secret),
        });
      }
      if (!session) fail(401, "session", "Sign in to continue.");
      if (!["GET", "HEAD"].includes(method))
        checkCsrf(request, session, settings);
      if (path === "/api/auth/logout" && method === "POST") {
        const response = await auth.handler(
          new Request(new URL("/api/auth/sign-out", settings.origin), {
            method: "POST",
            headers: request.headers,
          }),
        );
        if (!response.ok) return response;
        const headers = new Headers({
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        for (const cookie of response.headers.getSetCookie())
          headers.append("set-cookie", cookie);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
      if (path === "/api/modules" && method === "GET")
        return okay({ modules: MODULES, roles: ROLES, currencies: CURRENCIES });
      const input = ["GET", "HEAD"].includes(method)
        ? {}
        : await body(
            request,
            path.startsWith("/api/participant/") ||
              /^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/grant-reports(?:\/|$)/.test(
                path,
              )
              ? 16384
              : 8 * 1024 * 1024,
          );
      if (
        /^\/api\/orgs\/[A-Za-z0-9_-]{1,100}\/grant-reports(?:\/|$)/.test(path)
      ) {
        const read = ["GET", "HEAD"].includes(method);
        await db.limit(
          `grant-report-${read ? "read" : "write"}:${hash(session.user.id)}`,
          read ? 120 : 60,
          3600,
        );
      }
      if (path.startsWith("/api/participant/")) {
        const bucket = hash(session.user.id);
        if (method === "GET")
          await db.limit(`participant-read:${bucket}`, 120, 3600);
        else if (/\/link$/.test(path)) {
          await db.limit(`participant-link:${bucket}`, 10, 3600);
          await db.limit(
            `participant-link-ip:${hash(request.headers.get("x-forwarded-for")?.split(",")[0] || "local")}`,
            30,
            3600,
          );
        } else await db.limit(`participant-write:${bucket}`, 60, 3600);
        const deliveryResponse = await ownDeliveryRoutes({
          request,
          url,
          db,
          settings,
          session,
          input,
        });
        if (deliveryResponse) return deliveryResponse;
        const participationResponse = await participantParticipationRoutes({
          request,
          url,
          db,
          settings,
          session,
          input,
        });
        if (participationResponse) return participationResponse;
        const response = await participantRoutes({
          request,
          url,
          db,
          settings,
          session,
          input,
        });
        if (response) return response;
        fail(404, "route", "This route is unavailable.");
      }
      if (path === "/api/invitations/accept" && method === "POST")
        return okay(await acceptInvite({ db, session, input }));
      if (path === "/api/orgs" && method === "POST") {
        const name = clean(input.name, 180);
        if (!name) fail(422, "name", "Enter an organization name.");
        const currency = input.currency || "USD";
        if (!(currency in CURRENCIES))
          fail(422, "currency", "Choose a supported planning currency.");
        const zone = dateZone(input.timeZone || "UTC");
        const org = id(),
          slug =
            clean(
              input.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              60,
            ).replace(/^-|-$/g, "") +
            "-" +
            org.slice(0, 6);
        await db.limit(`orgs:${session.user.id}`, 10, 86400);
        await db.tx(session.user.id, org, async (c) => {
          await c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$2,$3,$4,$5)",
            [org, name, slug, currency, zone],
          );
          await c.query(
            "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,$3)",
            [org, session.user.id, "owner"],
          );
          await c.query("INSERT INTO os_job_tenants(org_id) VALUES($1)", [org]);
          await audit(c, org, session.user.id, "organization.created");
        });
        return okay({
          org: { id: org, name, slug, currency, timeZone: zone, role: "owner" },
        });
      }
      const match = path.match(
        /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})(?:\/(.*))?$/,
      );
      if (!match) fail(404, "route", "This route is unavailable.");
      const [, org, tail = ""] = match;
      const response = await db.tx(
        session.user.id,
        org,
        async (c) => {
          const member = await membership(c, org, session.user.id),
            user = session.user.id;
          const organization = (
            await c.query("SELECT * FROM os_orgs WHERE id=$1", [org])
          ).rows[0];
          if (!organization)
            fail(404, "organization", "Organization not found.");
          if (tail === "") {
            if (method === "GET")
              return okay({
                org: {
                  ...organization,
                  timeZone: organization.time_zone,
                  role: member.role,
                },
              });
            if (method === "PATCH") {
              requireAdmin(member);
              stale(input, organization);
              const name = clean(input.name, 180);
              if (!name) fail(422, "name", "Enter an organization name.");
              await c.query(
                "UPDATE os_orgs SET name=$2,revision=revision+1 WHERE id=$1",
                [org, name],
              );
              await audit(c, org, user, "organization.updated");
              return okay({ updated: true });
            }
          }
          const memberResponse = await memberRoutes({
            c,
            org,
            user,
            session,
            member,
            tail,
            method,
            input,
            settings,
          });
          if (memberResponse) return memberResponse;
          const integrationResponse = await integrationRoutes({
            c,
            org,
            user,
            member,
            tail,
            method,
            input,
            settings,
          });
          if (integrationResponse) return integrationResponse;
          const intakeResponse = await intakeRoutes({
            c,
            org,
            user,
            member,
            tail,
            method,
            input,
            url,
            settings,
          });
          if (intakeResponse) return intakeResponse;
          const deliveryResponse = await deliveryRoutes({
            c,
            org,
            user,
            member,
            tail,
            method,
            input,
            url,
            settings,
          });
          if (deliveryResponse) return deliveryResponse;
          const participationResponse = await participationRoutes({
            c,
            org,
            user,
            member,
            tail,
            method,
            input,
            url,
            settings,
          });
          if (participationResponse) return participationResponse;
          const grantReportResponse = await grantReportRoutes({
            c,
            org,
            user,
            member,
            tail,
            method,
            input,
            url,
            settings,
          });
          if (grantReportResponse) return grantReportResponse;
          const records = await allRecords(c, org),
            visible = records
              .map((r) => visibleRecord(r, member))
              .filter(Boolean);
          if (tail === "dashboard" && method === "GET") {
            const counts = Object.fromEntries(
              MODULES.map((m) => [
                m.id,
                visible.filter((r) => r.moduleId === m.id).length,
              ]),
            );
            const due = visible
              .filter((r) => {
                const f = getModule(r.moduleId).dateField;
                return (
                  f &&
                  r.data[f] &&
                  new Date(r.data[f]) < new Date(Date.now() + 7 * 86400000) &&
                  !["done", "closed", "cancelled", "archived"].includes(
                    r.status,
                  )
                );
              })
              .slice(0, 50);
            const jobs = administrators(member.role)
              ? (
                  await c.query(
                    "SELECT id,kind,status,attempts,next_at,last_error FROM os_jobs WHERE org_id=$1 ORDER BY created_at DESC LIMIT30".replace(
                      "LIMIT30",
                      "LIMIT 30",
                    ),
                    [org],
                  )
                ).rows
              : [];
            return okay({
              counts,
              recent: visible
                .slice()
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 12),
              due,
              jobs,
            });
          }
          if (tail === "audit" && method === "GET") {
            requireAdmin(member);
            return okay({
              events: (
                await c.query(
                  'SELECT id,actor_id AS "actorId",action,record_id AS "recordId",module_id AS "moduleId",detail,created_at AS "createdAt" FROM os_events WHERE org_id=$1 ORDER BY id DESC LIMIT500'.replace(
                    "LIMIT500",
                    "LIMIT 500",
                  ),
                  [org],
                )
              ).rows,
            });
          }
          if (tail === "export" && method === "GET") {
            requireAdmin(member);
            const comments = (
              await c.query("SELECT * FROM os_comments WHERE org_id=$1", [org])
            ).rows;
            const events = (
              await c.query(
                "SELECT * FROM os_events WHERE org_id=$1 ORDER BY id",
                [org],
              )
            ).rows;
            const reports = (
              await c.query("SELECT * FROM os_reports WHERE org_id=$1", [org])
            ).rows;
            const files = (
              await c.query(
                "SELECT id,record_id AS \"recordId\",name,mime,checksum,size,encode(bytes,'base64') AS content FROM os_files WHERE org_id=$1 AND record_id IN (SELECT id FROM os_records WHERE org_id=$1 AND deleted_at IS NULL)",
                [org],
              )
            ).rows;
            const trash = (
              await c.query(
                "SELECT * FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL",
                [org],
              )
            ).rows.map(rowRecord);
            const trashFiles = (
              await c.query(
                "SELECT id,record_id AS \"recordId\",name,mime,checksum,size,encode(bytes,'base64') AS content FROM os_files WHERE org_id=$1 AND record_id IN (SELECT id FROM os_records WHERE org_id=$1 AND deleted_at IS NOT NULL)",
                [org],
              )
            ).rows;
            const integrations = (
              await c.query(
                "SELECT id,provider,name,config FROM os_integrations WHERE org_id=$1",
                [org],
              )
            ).rows;
            const backup = makeBackup(organization, records, {
              comments,
              events,
              reports,
              files,
              trash,
              trashFiles,
              integrations,
              intake: await exportIntake(c, org),
              participation: await exportParticipation(c, org),
              delivery: await exportDelivery(c, org),
            });
            await audit(c, org, user, "backup.exported", null, {
              count: records.length,
              checksum: backup.checksum,
            });
            return downloadJson(backup, "charitology-os-backup.json");
          }
          if (tail === "import/upload" && method === "POST") {
            requireAdmin(member);
            return uploadPart({ c, org, user, input });
          }
          if (tail === "import/preview" && method === "POST") {
            requireAdmin(member);
            let backup = input.uploadId
              ? await uploadedBackup(c, org, user, input.uploadId)
              : input.backup;
            const migration = isLocalOsBackup(backup)
              ? previewLocalOsMigration(backup, { organization })
              : null;
            if (migration) backup = migration.backup;
            const imported = validateBackup(backup, org, user);
            const intake = restoredIntake(backup);
            const participation = restoredParticipation(backup);
            const delivery = restoredDelivery(backup);
            const issues = [];
            const existingIntake = Number(
              (
                await c.query(
                  "SELECT (SELECT count(*) FROM os_publications WHERE org_id=$1)+(SELECT count(*) FROM os_intake WHERE org_id=$1) AS count",
                  [org],
                )
              ).rows[0].count,
            );
            if (
              Number(
                (
                  await c.query(
                    "SELECT count(*) AS count FROM os_records WHERE org_id=$1",
                    [org],
                  )
                ).rows[0].count,
              ) ||
              existingIntake
            )
              issues.push({
                field: "organization",
                message:
                  "Restore into an empty organization, including its trash, to preserve existing records.",
              });
            const previewId = id(),
              base = hash(records.map((r) => [r.id, r.revision]));
            await storePreview(c, {
              org,
              previewId,
              actorId: user,
              kind: "backup",
              payload: backup,
              checksum: backup.checksum,
              baseRevision: base,
            });
            return okay({
              previewId,
              summary: {
                accepted: imported.length,
                rejected: issues.length,
                skipped: 0,
                approvalsReset: imported.length,
                intakePublicationsClosed: intake.publications.length,
                intakeRequests: intake.submissions.length,
                participationTargetsRecovered: participation.targets.length,
                participationsRecovered: participation.participations.length,
                participationDeliveryDisabled: !!delivery.policy,
                ...(migration ? { migration: migration.summary } : {}),
              },
              issues,
              warnings: [
                ...(migration?.warnings || []),
                ...participation.warnings,
                ...(intake.publications.length
                  ? [
                      {
                        field: "intake",
                        message:
                          "Publications restore closed, all receipt links are disabled and earlier reviews confer no authority. Request answers stay private to administrators. Publish a newly approved form for new requests; handle recovered requests manually.",
                      },
                    ]
                  : []),
              ],
            });
          }
          if (tail === "import/commit" && method === "POST") {
            requireAdmin(member);
            const p = (
              await c.query(
                "SELECT * FROM os_previews WHERE org_id=$1 AND id=$2 AND actor_id=$3 AND kind='backup' AND expires_at>now() FOR UPDATE",
                [org, input.previewId, user],
              )
            ).rows[0];
            if (!p || p.committed_at)
              fail(
                409,
                "preview",
                "This preview expired or has already been imported.",
              );
            if (
              Number(
                (
                  await c.query(
                    "SELECT count(*) AS count FROM os_records WHERE org_id=$1",
                    [org],
                  )
                ).rows[0].count,
              ) ||
              p.base_revision !== hash(records.map((r) => [r.id, r.revision]))
            )
              fail(
                409,
                "restore_conflict",
                "Restore requires an empty, unchanged organization.",
              );
            const imported = validateBackup(p.payload, org, user);
            const connections = restoredIntegrations(p.payload);
            const intake = restoredIntake(p.payload);
            const participation = restoredParticipation(p.payload);
            const delivery = restoredDelivery(p.payload);
            if (
              Number(
                (
                  await c.query(
                    "SELECT count(*) FROM os_integrations WHERE org_id=$1",
                    [org],
                  )
                ).rows[0].count,
              )
            )
              fail(
                409,
                "restore_conflict",
                "Restore requires an organization without existing connections.",
              );
            if (
              Number(
                (
                  await c.query(
                    "SELECT (SELECT count(*) FROM os_publications WHERE org_id=$1)+(SELECT count(*) FROM os_intake WHERE org_id=$1) AS count",
                    [org],
                  )
                ).rows[0].count,
              )
            )
              fail(
                409,
                "restore_conflict",
                "Restore requires an organization without existing public intake records.",
              );
            await commitPreview(c, org, p.id);
            for (const connection of connections)
              await c.query(
                "INSERT INTO os_integrations(org_id,id,provider,name,config,status) VALUES($1,$2,$3,$4,$5,'unconfigured')",
                [
                  org,
                  connection.id,
                  connection.provider,
                  connection.name,
                  JSON.stringify(connection.config),
                ],
              );
            if ((p.payload.files || []).length > 1000)
              fail(
                422,
                "quota",
                "The backup exceeds this workspace’s1,000 file limit.",
              );
            let restoredFileBytes = 0;
            for (const record of imported) {
              await saveRecord(c, record);
              await audit(c, org, user, "record.restored", record, {
                record,
                sourceChecksum: p.checksum,
              });
            }
            for (const file of p.payload.files || []) {
              if (
                !imported.some(
                  (r) => r.id === file.recordId && r.moduleId === "documents",
                )
              )
                fail(422, "file", "An attached file has no document record.");
              const verified = validateFile(file),
                bytes = verified.bytes;
              restoredFileBytes += bytes.length;
              if (restoredFileBytes > FILE_QUOTA)
                fail(
                  422,
                  "quota",
                  "The backup exceeds this workspace’s25 MiB file quota.",
                );
              await c.query(
                "INSERT INTO os_files(org_id,id,record_id,name,mime,checksum,size,bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                [
                  org,
                  id(),
                  file.recordId,
                  clean(file.name, 180),
                  clean(file.mime, 100),
                  file.checksum,
                  bytes.length,
                  bytes,
                  user,
                ],
              );
            }
            await restoreIntake(c, org, user, intake);
            await restoreParticipation(c, org, user, participation);
            await restoreDelivery(c, org, user, delivery);
            await audit(c, org, user, "backup.restored", null, {
              count: imported.length,
              checksum: p.checksum,
              sourceArchiveId: p.id,
              sourceHistoryCount: p.payload.events?.length || 0,
              sourceCommentCount: p.payload.comments?.length || 0,
              sourceReportCount: p.payload.reports?.length || 0,
              intakePublicationsClosed: intake.publications.length,
              intakeRequests: intake.submissions.length,
              participationTargetsRecovered: participation.targets.length,
              participationsRecovered: participation.participations.length,
            });
            return okay({ imported: imported.length });
          }
          if (tail === "backups/imports" && method === "GET") {
            requireAdmin(member);
            return okay({
              imports: (
                await c.query(
                  'SELECT id,checksum,created_at AS "createdAt",committed_at AS "committedAt" FROM os_previews WHERE org_id=$1 AND kind=\'backup\' AND committed_at IS NOT NULL ORDER BY created_at DESC',
                  [org],
                )
              ).rows,
            });
          }
          const archiveMatch = tail.match(
            /^backups\/imports\/([A-Za-z0-9_-]+)$/,
          );
          if (archiveMatch && method === "GET") {
            requireAdmin(member);
            const archive = (
              await c.query(
                "SELECT payload FROM os_previews WHERE org_id=$1 AND id=$2 AND kind='backup' AND committed_at IS NOT NULL",
                [org, archiveMatch[1]],
              )
            ).rows[0];
            if (!archive) fail(404, "backup", "Import archive not found.");
            return downloadJson(
              archive.payload,
              "charitology-os-source-backup.json",
            );
          }
          if (tail === "reports" && method === "GET") {
            const rows = (
              await c.query(
                'SELECT id,title,checksum,payload,created_by AS "createdBy",created_at AS "createdAt" FROM os_reports WHERE org_id=$1 ORDER BY created_at DESC',
                [org],
              )
            ).rows;
            return okay({
              reports: rows
                .filter(
                  (r) =>
                    !isGrantReport(r.payload) &&
                    (administrators(member.role) ||
                      [
                        "program_lead",
                        "grants_lead",
                        "finance_reviewer",
                      ].includes(member.role)) &&
                    r.payload.modules.every(
                      (m) =>
                        getModule(m.id).roles.read.includes(member.role) &&
                        m.records.every((record) => inScope(record, member)),
                    ),
                )
                .map(({ payload, ...r }) => r),
            });
          }
          if (tail === "reports" && method === "POST") {
            const moduleIds = Array.isArray(input.moduleIds)
              ? input.moduleIds
              : [];
            if (!moduleIds.length)
              fail(422, "modules", "Choose at least one module.");
            for (const m of moduleIds) requirePermission(m, member, "export");
            const title = clean(input.title, 180);
            if (!title) fail(422, "title", "Enter a report title.");
            const selected = visible.filter((r) =>
              moduleIds.includes(r.moduleId),
            );
            const report = {
              id: id(),
              title,
              createdBy: user,
              createdAt: new Date().toISOString(),
              modules: moduleIds.map((m) => ({
                id: m,
                title: getModule(m).title,
                records: selected.filter((r) => r.moduleId === m).map(snapshot),
              })),
              sourceRevisions: selected.map((r) => ({
                id: r.id,
                revision: r.revision,
              })),
              missingness:
                "Unknown fields remain null. This is a private snapshot of recorded inputs, not an independently verified impact claim.",
            };
            report.checksum = hash(report);
            await c.query(
              "INSERT INTO os_reports(org_id,id,created_by,title,checksum,payload) VALUES($1,$2,$3,$4,$5,$6)",
              [
                org,
                report.id,
                user,
                title,
                report.checksum,
                JSON.stringify(report),
              ],
            );
            await audit(c, org, user, "report.frozen", null, {
              id: report.id,
              checksum: report.checksum,
              sourceRevisions: report.sourceRevisions,
            });
            return okay({ report });
          }
          const reportMatch = tail.match(/^reports\/([A-Za-z0-9_-]+)$/);
          if (reportMatch && method === "GET") {
            if (
              !administrators(member.role) &&
              !["program_lead", "grants_lead", "finance_reviewer"].includes(
                member.role,
              )
            )
              fail(
                403,
                "role",
                "Your role cannot read full organization reports.",
              );
            const r = (
              await c.query(
                "SELECT payload FROM os_reports WHERE org_id=$1 AND id=$2",
                [org, reportMatch[1]],
              )
            ).rows[0];
            if (!r) fail(404, "report", "Report not found.");
            if (isGrantReport(r.payload)) {
              const report = grantReportForReader(r.payload, member);
              if (!report)
                fail(
                  403,
                  "role",
                  "This report is unavailable to your current role or program scope.",
                );
              return okay({ report });
            }
            for (const m of r.payload.modules) {
              requirePermission(m.id, member, "read");
              if (m.records.some((r) => !inScope(r, member)))
                fail(
                  403,
                  "scope",
                  "This report includes programs outside your scope.",
                );
            }
            return okay({ report: r.payload });
          }
          const downloadMatch = tail.match(/^files\/([A-Za-z0-9_-]+)$/);
          if (downloadMatch && method === "GET") {
            const file = (
              await c.query(
                "SELECT * FROM os_files WHERE org_id=$1 AND id=$2",
                [org, downloadMatch[1]],
              )
            ).rows[0];
            const record = file && records.find((r) => r.id === file.record_id);
            const view = record && visibleRecord(record, member);
            if (!view) fail(404, "file", "File not found.");
            if (
              ["board_reader", "external_reviewer"].includes(member.role) &&
              !view.files?.some(
                (f) => f.id === file.id && f.checksum === file.checksum,
              )
            )
              fail(404, "file", "This file is outside the approved snapshot.");
            return new Response(file.bytes, {
              headers: {
                "content-type": file.mime,
                "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
                "content-security-policy": "sandbox; default-src 'none'",
              },
            });
          }
          const trashMatch = tail.match(/^modules\/([a-z-]+)\/trash$/);
          if (trashMatch && method === "GET") {
            requirePermission(trashMatch[1], member, "write");
            return okay({
              records: (
                await c.query(
                  "SELECT * FROM os_records WHERE org_id=$1 AND module_id=$2 AND deleted_at IS NOT NULL",
                  [org, trashMatch[1]],
                )
              ).rows
                .map(rowRecord)
                .filter((r) => inScope(r, member)),
            });
          }
          const restoreMatch = tail.match(
            /^modules\/([a-z-]+)\/records\/([A-Za-z0-9_-]+)\/restore$/,
          );
          if (restoreMatch && method === "POST") {
            requirePermission(restoreMatch[1], member, "write");
            const deleted = (
              await c.query(
                "SELECT * FROM os_records WHERE org_id=$1 AND id=$2 AND module_id=$3 AND deleted_at IS NOT NULL",
                [org, restoreMatch[2], restoreMatch[1]],
              )
            ).rows[0];
            if (!deleted) fail(404, "record", "Deleted record not found.");
            const r = rowRecord(deleted);
            if (!inScope(r, member)) fail(403, "scope", "Outside your scope.");
            stale(input, r);
            const module = getModule(r.moduleId);
            r.status =
              module.workflow.states.find((s) => s.id === "review")?.id ||
              module.workflow.initial;
            r.data = validateRecord(r.moduleId, r.data, {
              orgId: org,
              recordId: r.id,
              records,
              status: r.status,
            });
            checkReferences(module, r.data, records, member);
            await guardParticipationWrite(c, r, { operation: "restore" });
            await c.query(
              "UPDATE os_records SET deleted_at=NULL WHERE org_id=$1 AND id=$2",
              [org, r.id],
            );
            r.revision++;
            r.approval = null;
            r.snapshot = null;
            r.lastEditedBy = user;
            await saveRecord(c, r);
            await audit(c, org, user, "record.restored", r, { record: r });
            return okay({ restored: true, record: r });
          }
          const rm = tail.match(
            /^modules\/([a-z-]+)\/(records|export)(?:\/([A-Za-z0-9_-]+)(?:\/(transition|approve|comments|reminder|files))?)?$/,
          );
          if (!rm) fail(404, "route", "This route is unavailable.");
          const [, moduleId, kind, recordId, action] = rm,
            m = getModule(moduleId);
          requirePermission(
            moduleId,
            member,
            method === "GET"
              ? "read"
              : action === "approve"
                ? "approve"
                : "write",
          );
          if (kind === "export" && method === "GET") {
            requirePermission(moduleId, member, "export");
            const rows = visible.filter((r) => r.moduleId === moduleId);
            return url.searchParams.get("format") === "csv"
              ? new Response(streamText(toCsv(rows, m)), {
                  headers: {
                    "content-type": "text/csv; charset=utf-8",
                    "content-disposition": `attachment; filename="${moduleId}.csv"`,
                    "cache-control": "no-store",
                  },
                })
              : okay({ records: rows });
          }
          if (!recordId) {
            if (method === "GET")
              return okay({
                records: visible.filter((r) => r.moduleId === moduleId),
              });
            if (method === "POST") {
              const record = {
                id: id(),
                orgId: org,
                moduleId,
                data: input.data,
                status: m.workflow.initial,
                ownerId: input.ownerId || user,
                lastEditedBy: user,
                revision: 1,
                approval: null,
                snapshot: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              if (records.length >= 2000)
                fail(
                  422,
                  "quota",
                  "This workspace reached its2,000 active record limit.",
                );
              await checkOwner(c, org, record.ownerId);
              record.data = validateRecord(moduleId, record.data, {
                orgId: org,
                recordId: record.id,
                status: record.status,
                records,
              });
              if (!inScope(record, member))
                fail(
                  403,
                  "scope",
                  "This program is outside your access scope.",
                );
              checkReferences(m, record.data, records, member);
              await saveRecord(c, record);
              await audit(c, org, user, "record.created", record, { record });
              return okay({ record });
            }
          }
          const record = records.find(
            (r) => r.id === recordId && r.moduleId === moduleId,
          );
          if (!record || !inScope(record, member))
            fail(404, "record", "Record not found.");
          if (action === "files" && method === "GET") {
            if (!visibleRecord(record, member))
              fail(404, "record", "Record unavailable.");
            const files = (
              await c.query(
                'SELECT id,name,mime,size,checksum,created_at AS \"createdAt\" FROM os_files WHERE org_id=$1 AND record_id=$2',
                [org, record.id],
              )
            ).rows;
            return okay({
              files: ["board_reader", "external_reviewer"].includes(member.role)
                ? files.filter((f) =>
                    record.snapshot?.files?.some(
                      (s) => s.id === f.id && s.checksum === f.checksum,
                    ),
                  )
                : files,
            });
          }
          if (method === "GET") {
            const view = visibleRecord(record, member);
            if (!view)
              fail(404, "record", "No approved snapshot is available.");
            const restricted = ["board_reader", "external_reviewer"].includes(
              member.role,
            );
            const history = restricted
              ? []
              : (
                  await c.query(
                    'SELECT action,actor_id AS "actorId",detail,created_at AS "createdAt" FROM os_events WHERE org_id=$1 AND record_id=$2 ORDER BY id DESC LIMIT100'.replace(
                      "LIMIT100",
                      "LIMIT 100",
                    ),
                    [org, record.id],
                  )
                ).rows;
            const comments = restricted
              ? []
              : (
                  await c.query(
                    'SELECT id,actor_id AS "actorId",body,created_at AS "createdAt" FROM os_comments WHERE org_id=$1 AND record_id=$2 ORDER BY created_at',
                    [org, record.id],
                  )
                ).rows;
            return okay({ record: view, history, comments });
          }
          if (action === "comments" && method === "POST") {
            const text = clean(input.body, 4000);
            if (!text) fail(422, "comment", "Write a comment.");
            const comment = {
              id: id(),
              actorId: user,
              body: text,
              createdAt: new Date().toISOString(),
            };
            await c.query(
              "INSERT INTO os_comments(org_id,id,record_id,actor_id,body) VALUES($1,$2,$3,$4,$5)",
              [org, comment.id, record.id, user, text],
            );
            await audit(c, org, user, "comment.added", record, {
              commentId: comment.id,
            });
            return okay({ comment });
          }
          if (action === "reminder" && method === "POST") {
            const when = new Date(input.at);
            if (
              !Number.isFinite(+when) ||
              +when < Date.now() ||
              +when > Date.now() + 366 * 86400000
            )
              fail(422, "date", "Choose a future reminder within one year.");
            const jobId = await enqueue(
              c,
              org,
              "reminder",
              `reminder:${record.id}:${user}:${when.toISOString()}`,
              {
                userId: user,
                recordId: record.id,
                title: record.data.title,
                organizationName: organization.name,
              },
              when,
            );
            await audit(c, org, user, "reminder.scheduled", record, {
              jobId,
              at: when.toISOString(),
            });
            return okay({ jobId });
          }
          if (action === "files")
            return await fileRoute({ c, org, user, record, input, method });
          stale(input, record);
          if (method === "DELETE") {
            await guardParticipationWrite(c, record, { operation: "delete" });
            const linked = records.some(
              (r) =>
                r.id !== record.id &&
                getModule(r.moduleId).fields.some((f) =>
                  f.type === "reference"
                    ? r.data[f.key] === record.id
                    : f.type === "references" &&
                      r.data[f.key]?.includes(record.id),
                ),
            );
            if (linked)
              fail(
                409,
                "references",
                "Other records still link to this record. Archive its workflow or remove those links first.",
              );
            if (record.data.legalHold === true)
              fail(409, "retention", "A retention hold prevents deletion.");
            await c.query(
              "UPDATE os_records SET deleted_at=now(),revision=revision+1 WHERE org_id=$1 AND id=$2",
              [org, record.id],
            );
            await audit(c, org, user, "record.deleted", record, { record });
            return okay({ deleted: true, recoverable: true });
          }
          if (action === "approve" && method === "POST") {
            checkReferences(m, record.data, records, member);
            const reason = clean(input.reason, 2000);
            if (!reason) fail(422, "reason", "Record the approval reason.");
            if (record.lastEditedBy === user)
              fail(
                403,
                "independent_approval",
                "Ask another authorized reviewer to approve this record.",
              );
            record.revision++;
            record.approval = {
              status: "approved",
              revision: record.revision,
              actorId: user,
              reason,
              at: new Date().toISOString(),
            };
            record.snapshot = {
              ...snapshot(record),
              files: (
                await c.query(
                  "SELECT id,name,mime,size,checksum FROM os_files WHERE org_id=$1 AND record_id=$2",
                  [org, record.id],
                )
              ).rows,
            };
            await saveRecord(c, record);
            await audit(c, org, user, "record.approved", record, { record });
            return okay({ record });
          }
          if (action === "transition" && method === "POST") {
            checkReferences(m, record.data, records, member);
            const to = clean(input.to, 50),
              reason = clean(input.reason, 2000);
            if (!reason) fail(422, "reason", "Explain the workflow change.");
            const validApproval = record.approval?.revision === record.revision;
            if (
              m.workflow.transitions.some(
                (t) => t.to === record.status && t.requiresApproval,
              ) &&
              !validApproval
            )
              fail(
                409,
                "approval",
                "This revision needs a fresh independent approval before advancing.",
              );
            validateTransition(moduleId, record.status, to, {
              role: member.role,
              actorId: user,
              ownerId: record.lastEditedBy,
              approved: validApproval,
              snapshotApproved: validApproval,
            });
            record.data = validateRecord(moduleId, record.data, {
              orgId: org,
              recordId: record.id,
              status: to,
              records,
              previous: record.data,
            });
            const from = record.status;
            record.status = to;
            record.revision++;
            if (validApproval)
              record.approval = {
                ...record.approval,
                revision: record.revision,
              };
            if (
              m.workflow.transitions.find((t) => t.from === from && t.to === to)
                ?.requiresSnapshot
            )
              record.snapshot = snapshot(record);
            await saveRecord(c, record);
            await audit(c, org, user, "record.transitioned", record, {
              record,
              reason,
            });
            return okay({ record });
          }
          if (!action && method === "PATCH") {
            const next = {
              ...record,
              data: input.data,
              ownerId: input.ownerId || record.ownerId,
              status:
                record.approval || record.snapshot
                  ? m.workflow.states.find((s) => s.id === "review")?.id ||
                    m.workflow.initial
                  : record.status,
              revision: record.revision + 1,
              lastEditedBy: user,
              approval: null,
            };
            await checkOwner(c, org, next.ownerId);
            next.data = validateRecord(moduleId, next.data, {
              orgId: org,
              recordId: record.id,
              status: next.status,
              records,
              previous: record.data,
            });
            if (!inScope(next, member))
              fail(403, "scope", "This program is outside your scope.");
            checkReferences(m, next.data, records, member);
            await saveRecord(c, next);
            await audit(c, org, user, "record.updated", next, { record: next });
            return okay({ record: next });
          }
          fail(405, "method", "This action is unavailable.");
        },
        { lock: !["GET", "HEAD"].includes(method) },
      );
      if (method === "POST" && tail === "invitations")
        await runOrgJobs({ db, org, send, settings });
      return response;
    } catch (error) {
      if (error instanceof MigrationError)
        return json(
          {
            ok: false,
            code: error.code,
            message: error.message,
            issues: error.issues.map((i) => ({
              field: i.field,
              message: i.reason,
            })),
          },
          422,
        );
      if (error instanceof ModuleValidationError)
        return json(
          {
            ok: false,
            code: "validation",
            message: "Review the highlighted fields.",
            issues: error.issues,
          },
          422,
        );
      if (error instanceof HttpError)
        return json(
          {
            ok: false,
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
          error.status,
        );
      if (error.code === "23505")
        return json(
          {
            ok: false,
            code: "conflict",
            message: "This identity already exists. Refresh and try again.",
          },
          409,
        );
      console.error("charity-os request failed", {
        name: error.name,
        code: error.code || "internal",
      });
      return json(
        {
          ok: false,
          code: "internal",
          message:
            "The service could not complete this action. Please try again.",
        },
        500,
      );
    }
  };
}
async function checkOwner(c, org, user) {
  if (
    !(
      await c.query(
        "SELECT1 FROM os_members WHERE org_id=$1 AND user_id=$2".replace(
          "SELECT1",
          "SELECT 1",
        ),
        [org, user],
      )
    ).rowCount
  )
    fail(422, "owner", "Choose an active organization member as owner.");
}
async function fileRoute({ c, org, user, record, input, method }) {
  if (record.moduleId !== "documents" || method !== "POST")
    fail(405, "files", "Files attach to document records.");
  const verified = validateFile(input),
    { bytes, mime } = verified;
  const fileUsage = (
    await c.query(
      "SELECT COALESCE(sum(size),0) AS size,count(*) AS count FROM os_files WHERE org_id=$1",
      [org],
    )
  ).rows[0];
  const total = Number(fileUsage.size);
  if (Number(fileUsage.count) >= 1000)
    fail(422, "quota", "This workspace reached its1,000 file limit.");
  if (total + bytes.length > 25 * 1024 * 1024)
    fail(422, "quota", "This workspace reached its25 MiB file limit.");
  const file = {
    id: id(),
    name: verified.name,
    mime,
    size: verified.size,
    checksum: verified.checksum,
  };
  await c.query(
    "INSERT INTO os_files(org_id,id,record_id,name,mime,checksum,bytes,size,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      org,
      file.id,
      record.id,
      file.name,
      mime,
      file.checksum,
      bytes,
      file.size,
      user,
    ],
  );
  record.revision++;
  if (record.approval || record.snapshot)
    record.status =
      getModule(record.moduleId).workflow.states.find((s) => s.id === "review")
        ?.id || getModule(record.moduleId).workflow.initial;
  record.approval = null;
  record.lastEditedBy = user;
  await saveRecord(c, record);
  await audit(c, org, user, "file.attached", record, { file, record });
  return okay({ file, record });
}

function checkReferences(module, data, records, member) {
  for (const field of module.fields.filter((f) =>
    ["reference", "references"].includes(f.type),
  )) {
    const ids =
      field.type === "reference" ? [data[field.key]] : data[field.key] || [];
    for (const id of ids.filter(Boolean)) {
      const target = records.find((r) => r.id === id);
      if (!target || !visibleRecord(target, member))
        fail(
          403,
          "reference_scope",
          "A linked record is outside your readable program or module scope.",
        );
    }
  }
}
