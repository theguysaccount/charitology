import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, storePreview, commitPreview } from "../lib/database.mjs";
import { hash } from "../lib/security.mjs";

const configured = Boolean(
  process.env.DATABASE_URL && process.env.OS_DATABASE_URL,
);
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
function direct(value) {
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech"))
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  return url.toString();
}

test(
  "actual Postgres source archives use database JSON sizing, serialize the last slot and roll back failed imports",
  {
    skip: configured
      ? false
      : "Set isolated test owner and constrained app database URLs.",
    timeout: 180000,
  },
  async () => {
    const schema = "os_archive_" + randomBytes(8).toString("hex"),
      org = "synthetic-archive-org",
      user = "synthetic-operator";
    const owner = database(process.env.DATABASE_URL);
    let migration, db;
    try {
      await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
      migration = database(direct(process.env.DATABASE_URL), { schema });
      await migration.migrate();
      const appRole = decodeURIComponent(
        new URL(process.env.OS_DATABASE_URL).username,
      );
      assert.notEqual(
        appRole,
        decodeURIComponent(new URL(process.env.DATABASE_URL).username),
      );
      await owner.pool.query(
        `GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(appRole)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quote(schema)} TO ${quote(appRole)}`,
      );
      db = database(direct(process.env.OS_DATABASE_URL), { schema });
      const role = (
        await db.pool.query(
          "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      assert.equal(role.rolsuper, false);
      assert.equal(role.rolbypassrls, false);
      await migration.tx(user, org, (c) =>
        c.query(
          "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Synthetic archive test','synthetic-archive-test','USD','UTC')",
          [org],
        ),
      );
      const payload = {
          records: [],
          source: "日本語 and café",
          values: [1, 2, 3],
        },
        encoded = JSON.stringify(payload);
      await db.tx(user, org, (c) =>
        c.query(
          "INSERT INTO os_previews(org_id,id,actor_id,kind,payload,checksum,base_revision,expires_at,committed_at) SELECT $1,'retained-'||n,$2,'backup',$3,$4,$5,now()-interval '1 hour',now()-interval '1 hour' FROM generate_series(1,31) n",
          [org, user, encoded, hash(payload), hash([])],
        ),
      );
      const save = (previewId) =>
        db.tx(user, org, (c) =>
          storePreview(c, {
            org,
            previewId,
            actorId: user,
            kind: "backup",
            payload,
            checksum: hash(payload),
            baseRevision: hash([]),
          }),
        );
      await save("candidate-a");
      await save("candidate-b");
      const sized = await db.tx(
        user,
        org,
        async (c) =>
          (
            await c.query(
              "SELECT octet_length(payload::text) AS stored_bytes,octet_length($2::jsonb::text) AS candidate_bytes FROM os_previews WHERE org_id=$1 AND id='candidate-a'",
              [org, encoded],
            )
          ).rows[0],
      );
      assert.equal(sized.stored_bytes, sized.candidate_bytes);
      assert.ok(
        sized.stored_bytes > Buffer.byteLength(encoded),
        "Postgres JSON whitespace differs from compact application JSON.",
      );
      await assert.rejects(
        () =>
          db.tx(user, org, async (c) => {
            await commitPreview(c, org, "candidate-a");
            throw new Error("Synthetic later import failure");
          }),
        /Synthetic later import failure/,
      );
      assert.equal(
        (
          await db.tx(
            user,
            org,
            async (c) =>
              (
                await c.query(
                  "SELECT committed_at FROM os_previews WHERE org_id=$1 AND id='candidate-a'",
                  [org],
                )
              ).rows[0],
          )
        ).committed_at,
        null,
      );
      const outcomes = await Promise.allSettled(
        ["candidate-a", "candidate-b"].map((previewId) =>
          db.tx(user, org, (c) => commitPreview(c, org, previewId)),
        ),
      );
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        outcomes.find((r) => r.status === "rejected").reason.code,
        "archive_quota",
      );
      await assert.rejects(
        () => save("excess-empty-source"),
        (error) => error.status === 422 && error.code === "archive_quota",
      );
      const retained = await db.tx(
        user,
        org,
        async (c) =>
          (
            await c.query(
              "SELECT payload,committed_at,expires_at FROM os_previews WHERE org_id=$1",
              [org],
            )
          ).rows,
      );
      assert.equal(retained.filter((r) => r.committed_at).length, 32);
      assert.equal(retained.length, 33);
      assert.ok(retained.every((r) => r.payload.source === payload.source));
      assert.equal(
        (await db.pool.query("SELECT id FROM os_previews")).rowCount,
        0,
        "The app role has no archive access without tenant context.",
      );
      console.log(
        "Archive integration used a temporary schema, tiny synthetic payloads and no mail/provider calls.",
      );
    } finally {
      await db?.close();
      await migration?.close();
      try {
        await owner.pool.query(
          `DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`,
        );
      } finally {
        await owner.close();
      }
    }
  },
);
