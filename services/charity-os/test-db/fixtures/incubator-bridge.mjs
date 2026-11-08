/** Explicit isolated fixture only. No env-file loading, provider or real login. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { magicLink } from "better-auth/plugins/magic-link";
import { database } from "../../lib/database.mjs";
import { applicationGrantsSql } from "../../lib/migration-grants.mjs";
import { createHandler } from "../../lib/handler.mjs";
import { csrf, hash } from "../../lib/security.mjs";
import { incubatorHash as H } from "../../lib/incubator-bridge-json.mjs";
import { INCUBATOR_ADAPTER } from "../../lib/incubator-native.mjs";
import {
  nativeFixture,
  mapping,
  selection,
  encode,
} from "../../test/incubator-fixtures.mjs";

export const configured = Boolean(
  process.env.DATABASE_URL && process.env.OS_DATABASE_URL,
);
const q = (value) => '"' + value.replaceAll('"', '""') + '"';
const roles = [
  "owner",
  "admin",
  "program_lead",
  "grants_lead",
  "finance_reviewer",
  "contributor",
  "board_reader",
  "external_reviewer",
];
export async function withIncubatorFixture(run) {
  const urls = [process.env.DATABASE_URL, process.env.OS_DATABASE_URL].map(
    (value) => new URL(value),
  );
  for (const url of urls) {
    assert(["postgres:", "postgresql:"].includes(url.protocol));
    assert(
      process.env.CI === "true" || url.hostname === "127.0.0.1",
      "Only the explicitly owned loopback test database is accepted.",
    );
    assert(
      [...url.searchParams].every(
        ([key, value]) => key === "sslmode" && value === "disable",
      ),
      "Refuse target and runtime query overrides.",
    );
    if (process.env.CI !== "true")
      assert(
        /^\/(?:charitology_interval_fixture|os_interval_[a-f0-9]{14})$/.test(
          url.pathname,
        ),
      );
  }
  assert.equal(urls[0].hostname, urls[1].hostname);
  assert.equal(urls[0].port, urls[1].port);
  assert.equal(urls[0].pathname, urls[1].pathname);
  assert.notEqual(urls[0].username, urls[1].username);
  const schema = "os_incubator_" + randomBytes(8).toString("hex"),
    owner = database(urls[0].toString());
  let migration,
    db,
    created = false,
    driverFailure = false;
  const watch = (pool) => {
    const seen = new WeakSet(),
      client = (c) => {
        if (!seen.has(c)) {
          seen.add(c);
          c.on("error", () => {
            driverFailure = true;
          });
        }
      };
    pool.on("error", () => {
      driverFailure = true;
    });
    pool.on("connect", client);
    pool.on("acquire", client);
  };
  watch(owner.pool);
  const org = "fictional-incubator",
    destination = "fictional-recovered",
    author = "fictional-owner";
  const settings = {
    origin: "https://os.example.invalid",
    secret: "fictional-incubator-secret-more-than-thirty-two-characters",
    production: false,
    encryptionKey: "fictional-unused-key",
  };
  const sessions = new Map(
    roles.map((role) => [
      "fictional-" + role,
      {
        user: {
          id: "fictional-" + role,
          email: "fictional-" + role + "@example.invalid",
          emailVerified: true,
        },
        session: { id: "fictional-incubator-session-" + role },
      },
    ]),
  );
  const handlers = new Map();
  try {
    if (process.env.CI !== "true")
      await owner.tx(
        null,
        null,
        async (c) => {
          const row = (
            await c.query(
              "SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,(SELECT system_identifier::text FROM pg_control_system()) AS system,floor(extract(epoch FROM pg_postmaster_start_time()))::bigint::text AS started,current_setting('server_version_num')::int AS version",
            )
          ).rows[0];
          assert.equal(
            row.database,
            decodeURIComponent(urls[0].pathname.slice(1)),
          );
          assert.equal(row.host, "127.0.0.1");
          assert.equal(row.port, Number(process.env.OS_INTERVAL_EXPECTED_PORT));
          assert.equal(
            row.directory,
            process.env.OS_INTERVAL_EXPECTED_DATA_DIRECTORY,
          );
          assert.equal(row.system, process.env.OS_INTERVAL_EXPECTED_SYSTEM_ID);
          assert.equal(row.started, process.env.OS_INTERVAL_EXPECTED_STARTED);
          assert.equal(row.version, 170011);
        },
        { readOnly: true },
      );
    await owner.pool.query(`CREATE SCHEMA ${q(schema)}`);
    created = true;
    migration = database(urls[0].toString(), { schema });
    watch(migration.pool);
    const auth = await getMigrations({
      database: migration.pool,
      rateLimit: { enabled: true, storage: "database" },
      plugins: [
        magicLink({
          storeToken: "hashed",
          sendMagicLink: async () => {
            throw Error("No mail is allowed in this fixture.");
          },
        }),
      ],
      logger: { disabled: true },
    });
    await auth.runMigrations();
    await migration.migrate();
    await migration.pool.query(
      applicationGrantsSql(decodeURIComponent(urls[1].username), schema),
    );
    for (const [user, session] of sessions) {
      await migration.pool.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())',
        [user, session.user.email],
      );
      await migration.pool.query(
        'INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',
        [session.session.id, "fictional-token-" + user, user],
      );
    }
    db = database(urls[1].toString(), { schema });
    watch(db.pool);
    const role = (
      await db.pool.query(
        "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,(SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
    if (process.env.CI !== "true") {
      for (const key of [
        "rolcreatedb",
        "rolcreaterole",
        "rolreplication",
        "rolinherit",
      ])
        assert.equal(role[key], false);
      assert.equal(role.memberships, 0);
    }
    const tx = (
      fn,
      { organization = org, user = author, readOnly = false } = {},
    ) => db.tx(user, organization, fn, { lock: !readOnly, readOnly });
    for (const organization of [org, destination])
      await tx(
        async (c) => {
          await c.query(
            "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional Incubator test',$1,'USD','UTC')",
            [organization],
          );
          for (const role of roles)
            await c.query(
              "INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,$3)",
              [organization, "fictional-" + role, role],
            );
        },
        { organization },
      );
    async function call(
      tail,
      {
        method = "GET",
        body,
        user = author,
        organization = org,
        expect = 200,
        omitCsrf = false,
      } = {},
    ) {
      const session = sessions.get(user);
      assert(session);
      if (!handlers.has(user))
        handlers.set(
          user,
          createHandler({
            settings,
            db,
            auth: { api: { getSession: async () => session } },
            send: async () => {
              throw Error("No mail/provider calls in this fixture.");
            },
          }),
        );
      const headers = { "x-forwarded-for": "198.51.100.81" };
      if (method !== "GET") {
        headers.origin = settings.origin;
        headers["content-type"] = "application/json";
        if (!omitCsrf)
          headers["x-csrf-token"] = csrf(session.session.id, settings.secret);
      }
      const response = await handlers.get(user)(
        new Request(settings.origin + `/api/orgs/${organization}/${tail}`, {
          method,
          headers,
          ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
        }),
      );
      const value = await response.json();
      assert.equal(
        response.status,
        expect,
        `${method} ${tail}: ${value.code || ""}`,
      );
      return value;
    }
    const post = (tail, body, options = {}) =>
      call(tail, { ...options, method: "POST", body });
    const program = async (options = {}) =>
      (
        await post(
          "modules/programs/records",
          {
            data: {
              title: "Fictional editable program",
              kind: "program",
              evidence: null,
            },
          },
          options,
        )
      ).record;
    const programPin = (record) => ({
      recordId: record.id,
      revision: record.revision,
      dataSha256: H("program-data", record.data),
    });
    async function inspect(
      record,
      {
        native = nativeFixture(),
        target,
        organization = org,
        user = author,
      } = {},
    ) {
      const bytes = encode(native),
        total = Math.ceil(bytes.length / 1500000);
      let uploadId;
      for (let index = 0; index < total; index++) {
        const result = await post(
          "incubator-bridge/uploads",
          {
            ...(uploadId ? { uploadId } : {}),
            index,
            total,
            chunk: Buffer.from(
              bytes.subarray(index * 1500000, (index + 1) * 1500000),
            ).toString("base64"),
          },
          { organization, user },
        );
        uploadId = result.uploadId;
      }
      return post(
        "incubator-bridge/source/inspect",
        {
          metadata: {
            version: 1,
            adapter: INCUBATOR_ADAPTER,
            selection,
            target: target ?? {
              kind: "new",
              program: programPin(record),
              duplicatePolicy: "refuse",
            },
          },
          upload: {
            uploadId,
            byteLength: bytes.length,
            sha256: hash(Buffer.from(bytes)),
          },
        },
        { organization, user },
      );
    }
    const intent = (preview) => ({
      previewId: preview.previewId,
      reviewSha256: preview.reviewSha256,
      commandKey: randomUUID(),
    });
    async function copy(record, options = {}) {
      const inspected = await inspect(record, options),
        preview = await post(
          "incubator-bridge/copy/preview",
          {
            mode: options.target?.kind === "refresh" ? "refresh-copy" : "copy",
            inspectionId: inspected.inspectionId,
            mapping,
          },
          options,
        ),
        input = intent(preview);
      const result = await post("incubator-bridge/commit", input, options);
      return { inspected, preview, input, result };
    }
    const fixture = {
      org,
      destination,
      author,
      schema,
      db,
      migration,
      sessions,
      call,
      post,
      tx,
      program,
      programPin,
      inspect,
      intent,
      copy,
      nativeFixture,
      mapping,
    };
    const value = await run(fixture);
    assert.equal(
      driverFailure,
      false,
      "All fixture pool/client error boundaries stayed clean.",
    );
    return value;
  } finally {
    await db?.pool.end();
    await migration?.pool.end();
    if (created) await owner.pool.query(`DROP SCHEMA ${q(schema)} CASCADE`);
    await owner.pool.end();
  }
}
