import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { database } from "../lib/database.mjs";
import { verifiedNeonConnectionString } from "../lib/connection.mjs";
import { CONSENT_VERSION } from "../lib/config.mjs";
import { campaign } from "../lib/operations.mjs";
import { createHandler } from "../lib/handler.mjs";
import { issueHash } from "../lib/issue-json.mjs";
import {
  ISSUE_ACKNOWLEDGEMENT,
  previewIssueReview,
  acknowledgeIssueReview,
  operateIssue,
  listIssueCampaigns,
} from "../lib/issue-operations.mjs";
import { syntheticRegistry, dependencies } from "../test-fixtures/issues.mjs";
test("Actual Postgres: immutable reviews and once-only issue gateway, fresh random schema", async (t) => {
  assert.ok(process.env.DATABASE_URL, "Private test DATABASE_URL required");
  const schema = "newsletter_test_" + randomBytes(10).toString("hex");
  assert.match(schema, /^newsletter_test_[a-f0-9]{20}$/);
  const owner = new pg.Client({
    connectionString: verifiedNeonConnectionString(process.env.DATABASE_URL),
  });
  let db;
  const registry = syntheticRegistry(20),
    find = (n) =>
      registry.issues.find(
        (x) =>
          x.id ===
          (n === 1 ? "edition-1" : `fixture-${String(n).padStart(3, "0")}`),
      );
  const ddl = await readFile(new URL("../schema.sql", import.meta.url), "utf8");
  try {
    await owner.connect();
    await owner.query(`CREATE SCHEMA ${schema}`);
    await owner.query(`SET search_path TO ${schema}`);
    await owner.query(ddl.split("-- R5 is additive:")[0]);
    for (const [n, state, id] of [
      [1, "accepted", "legacy-native-1"],
      [18, "create_unknown", null],
      [19, "send_unknown", "legacy-native-19"],
    ])
      await owner.query(
        "INSERT INTO newsletter_campaigns(edition,content_hash,state,broadcast_id,provider_status,operation_id)VALUES($1,$2,$3,$4,$3,$5)",
        [find(n).id, find(n).hash, state, id, "legacy-op-" + n],
      );
    await owner.query(
      "INSERT INTO newsletter_subscribers(email,state,generation,consent_version,consent_at,unsubscribed_at)VALUES('legacy-optout@example.invalid','unsubscribed','old-generation',$1,now(),now())",
      [CONSENT_VERSION],
    );
    await owner.query(
      "INSERT INTO newsletter_tokens(token_hash,email,generation,kind)VALUES($1,'legacy-optout@example.invalid','old-generation','unsubscribe')",
      ["a".repeat(64)],
    );
    await owner.query(
      "INSERT INTO newsletter_webhook_events(id,type)VALUES('old-hook','contact.updated')",
    );
    for (const [i, purpose] of [
      "login",
      "invitation",
      "reminder",
      "participation",
    ].entries())
      await owner.query(
        "INSERT INTO newsletter_os_mail_intents(key_hash,payload_hash,purpose,recipient_hash,state,provider_id)VALUES($1,$2,$3,$4,$5,$6)",
        [
          String(i + 1).repeat(64),
          "b".repeat(64),
          purpose,
          "c".repeat(64),
          "accepted",
          "old-native-" + i,
        ],
      );
    const snap = async () => {
      const value = {};
      for (const table of [
        "newsletter_campaigns",
        "newsletter_subscribers",
        "newsletter_tokens",
        "newsletter_webhook_events",
        "newsletter_os_mail_intents",
      ])
        value[table] = (
          await owner.query(
            `SELECT row_to_json(r)AS value FROM(SELECT * FROM ${table} ORDER BY 1)r`,
          )
        ).rows.map((r) => r.value);
      return value;
    };
    const before = await snap();
    await owner.query(ddl);
    await owner.query(ddl);
    const after = await snap();
    await t.test(
      "Migration twice preserves all old values and leaves unrecorded review/attempt evidence null",
      () => {
        for (const table of Object.keys(before))
          for (let i = 0; i < before[table].length; i++)
            for (const [key, value] of Object.entries(before[table][i]))
              assert.deepEqual(after[table][i][key], value, table + "." + key);
        for (const row of after.newsletter_campaigns)
          for (const k of [
            "publication_id",
            "prepare_review_id",
            "send_review_id",
            "creating_at",
            "send_attempted_at",
            "accepted_at",
          ])
            assert.equal(row[k], null);
      },
    );
    db = database(process.env.DATABASE_URL, { schema });
    const q = (text, args) => db.tx((c) => c.query(text, args));
    const d = dependencies(db, registry),
      deps = d.deps;
    await q(
      "INSERT INTO newsletter_subscribers(email,state,generation,consent_generation,consent_version,consent_at)VALUES($1,'active','current-generation','current-generation',$2,now())",
      [deps.settings.testRecipient, CONSENT_VERSION],
    );
    const fresh = (extra) => ({
      ...deps,
      deadline: Date.now() + 45000,
      ...extra,
    });
    async function proof(n, phase = "prepare", extra = {}) {
      const x = find(n),
        context = fresh(extra),
        preview = await previewIssueReview(context, x.id, {
          phase,
          contentHash: x.hash,
        }),
        input = {
          phase,
          contentHash: x.hash,
          previewHash: preview.previewHash,
          previewToken: preview.previewToken,
          acknowledgement: ISSUE_ACKNOWLEDGEMENT,
        };
      return {
        preview,
        input,
        proof: await acknowledgeIssueReview(context, x.id, input),
      };
    }
    const command = (n, p, action = "prepare", extra = {}) =>
      operateIssue(fresh(extra), find(n).id, {
        action,
        input: {
          contentHash: find(n).hash,
          reviewId: p.reviewId,
          reviewHash: p.reviewHash,
          ...(action === "send" ? { confirm: "SEND THIS REVIEWED ISSUE" } : {}),
        },
      });
    await t.test(
      "Disabled legacy accepted/stopped aliases retain history; fresh alias has no proof bypass",
      async () => {
        for (const n of [1, 18, 19])
          assert.equal(
            (
              await campaign(
                db,
                d.mail,
                { ...deps.settings, enabled: false },
                find(n),
                "prepare",
                { contentHash: find(n).hash },
                { registry },
              )
            ).result,
            "retained",
          );
        assert.equal(
          (
            await campaign(
              db,
              d.mail,
              deps.settings,
              find(2),
              "prepare",
              { contentHash: find(2).hash },
              { registry },
            )
          ).error.code,
          "review_required",
        );
        assert.ok(!d.calls.includes("create"));
      },
    );
    let first;
    await t.test(
      "Repeated signed acknowledgement stores one proof without raw token/address/bearer",
      async () => {
        first = await proof(2);
        assert.deepEqual(
          await acknowledgeIssueReview(fresh(), find(2).id, first.input),
          first.proof,
        );
        const rows = (await q("SELECT * FROM newsletter_issue_reviews")).rows;
        assert.equal(rows.length, 1);
        for (const secret of [
          first.preview.previewToken,
          "@example.invalid",
          deps.settings.adminToken,
        ])
          assert.ok(!JSON.stringify(rows).includes(secret));
      },
    );
    await t.test(
      "Three concurrent prepares create once with atomically consumed durable proof",
      async () => {
        const results = await Promise.all(
          [1, 2, 3].map(() => command(2, first.proof)),
        );
        assert.ok(results.some((r) => r.ok && r.campaign.state === "draft"));
        assert.equal(d.calls.filter((x) => x === "create").length, 1);
        const row = (
            await q("SELECT * FROM newsletter_campaigns WHERE edition=$1", [
              find(2).id,
            ])
          ).rows[0],
          p = (
            await q("SELECT * FROM newsletter_issue_reviews WHERE id=$1", [
              first.proof.reviewId,
            ])
          ).rows[0];
        assert.equal(row.prepare_review_id, p.id);
        assert.equal(row.reserved_bytes, 8192);
        assert.ok(p.consumed_at);
        assert.equal(p.consumed_operation_id, row.operation_id);
      },
    );
    await t.test(
      "Separate send-phase native proof queues once; acceptance cannot authorize another send",
      async () => {
        assert.equal(
          (await command(2, first.proof, "send")).error.code,
          "review_required",
        );
        const { proof: p } = await proof(2, "send"),
          results = await Promise.all(
            [1, 2, 3].map(() => command(2, p, "send")),
          );
        assert.ok(results.some((r) => r.ok && r.campaign.state === "accepted"));
        assert.equal(d.calls.filter((x) => x === "send").length, 1);
        assert.equal((await command(2, p, "send")).result, "retained");
        assert.equal(d.calls.filter((x) => x === "send").length, 1);
      },
    );
    await t.test(
      "Ambiguous create survives rollback and cannot be adopted or retried",
      async () => {
        const { proof: p } = await proof(3);
        d.setMode("create-error");
        const r = await command(3, p);
        assert.equal(r.error.code, "provider_ambiguous");
        assert.equal(r.campaign.state, "create_unknown");
        d.setMode(null);
        const count = d.calls.filter((x) => x === "create").length;
        assert.equal((await command(3, p)).result, "retained");
        assert.equal(d.calls.filter((x) => x === "create").length, count);
        await assert.rejects(
          q(
            "UPDATE newsletter_campaigns SET state='draft',broadcast_id='adopted' WHERE edition=$1",
            [find(3).id],
          ),
        );
      },
    );
    await t.test(
      "Malformed send stops unknown; reported-sent reconciliation cannot restore eligibility",
      async () => {
        const { proof: p } = await proof(4);
        assert.equal((await command(4, p)).campaign.state, "draft");
        const { proof: s } = await proof(4, "send");
        d.setMode("send-malformed");
        const r = await command(4, s, "send");
        assert.equal(r.error.code, "provider_ambiguous");
        assert.equal(r.campaign.state, "send_unknown");
        d.setMode(null);
        d.drafts.get("native-" + find(4).id).status = "sent";
        const observed = await operateIssue(fresh(), find(4).id, {
          action: "reconcile",
          input: {},
        });
        assert.equal(observed.campaign.state, "send_unknown");
        assert.equal(
          observed.campaign.providerObservation.classification,
          "reported-sent",
        );
        assert.equal(
          (await command(4, s, "send")).error.code,
          "stopped_uncertain",
        );
      },
    );
    await t.test(
      "Changed consent generation invalidates audience proof without consuming it",
      async () => {
        const { proof: p } = await proof(5);
        await q(
          "UPDATE newsletter_subscribers SET consent_generation=$2 WHERE email=$1",
          [deps.settings.testRecipient, "renewed-generation"],
        );
        assert.equal((await command(5, p)).error.code, "facts_changed");
        assert.equal(
          (
            await q(
              "SELECT consumed_at FROM newsletter_issue_reviews WHERE id=$1",
              [p.reviewId],
            )
          ).rows[0].consumed_at,
          null,
        );
        assert.equal(
          (
            await q("SELECT * FROM newsletter_campaigns WHERE edition=$1", [
              find(5).id,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "Expiry and shared bearer rotation stop new attempts",
      async () => {
        const { proof: p } = await proof(6);
        assert.equal(
          (
            await command(6, p, "prepare", {
              now: () => new Date(Date.now() + 901000).toISOString(),
            })
          ).error.code,
          "review_expired",
        );
        assert.equal(
          (
            await command(6, p, "prepare", {
              settings: { ...deps.settings, adminToken: "z".repeat(40) },
            })
          ).error.code,
          "review_required",
        );
      },
    );
    await t.test(
      "Non-mailed intermediate lineage still blocks an uncertain ancestor",
      async () => {
        const value = structuredClone(registry),
          parent = value.lineage.find(
            (x) => x.publicationId === find(3).publicationId,
          ),
          target = value.lineage.find(
            (x) => x.publicationId === find(8).publicationId,
          ),
          node = {
            format: parent.format,
            version: 1,
            publicationId: "fictional-non-mailed",
            publicationHash: "e".repeat(64),
            sequence: 7,
            supersedes: {
              id: parent.publicationId,
              hash: parent.publicationHash,
            },
          };
        value.lineage = value.lineage.filter(
          (x) => x.publicationId !== find(7).publicationId,
        );
        value.issues = value.issues.filter((x) => x.id !== find(7).id);
        value.lineage.push({ ...node, hash: issueHash(node) });
        target.supersedes = {
          id: node.publicationId,
          hash: node.publicationHash,
        };
        delete target.hash;
        target.hash = issueHash(target);
        value.lineage.sort((a, b) => a.sequence - b.sequence);
        delete value.hash;
        value.hash = issueHash(value);
        await assert.rejects(
          previewIssueReview(fresh({ registry: value }), find(8).id, {
            phase: "prepare",
            contentHash: find(8).hash,
          }),
          (e) => e.issueCode === "stopped_uncertain",
        );
      },
    );
    await t.test(
      "Durable checkpoint refusal rolls proof consumption back before provider mutation",
      async () => {
        const { proof: p } = await proof(9);
        await owner.query(
          `CREATE FUNCTION ${schema}.fixture_refuse()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.edition='fixture-009' THEN RAISE EXCEPTION 'synthetic checkpoint refusal';END IF;RETURN NEW;END$$;CREATE TRIGGER fixture_refuse BEFORE INSERT ON newsletter_campaigns FOR EACH ROW EXECUTE FUNCTION ${schema}.fixture_refuse()`,
        );
        const count = d.calls.filter((x) => x === "create").length;
        assert.equal((await command(9, p)).error.code, "provider_unavailable");
        assert.equal(d.calls.filter((x) => x === "create").length, count);
        assert.equal(
          (
            await q(
              "SELECT consumed_at FROM newsletter_issue_reviews WHERE id=$1",
              [p.reviewId],
            )
          ).rows[0].consumed_at,
          null,
        );
        await owner.query(
          "DROP TRIGGER fixture_refuse ON newsletter_campaigns",
        );
      },
    );
    await t.test(
      "Failed original finalization becomes unknown with proof retained, never a retry",
      async () => {
        const { proof: p } = await proof(10);
        await owner.query(
          `CREATE FUNCTION ${schema}.fixture_finalize()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.edition='fixture-010' AND NEW.state='draft' THEN RAISE EXCEPTION 'synthetic finalization refusal';END IF;RETURN NEW;END$$;CREATE TRIGGER fixture_finalize BEFORE UPDATE ON newsletter_campaigns FOR EACH ROW EXECUTE FUNCTION ${schema}.fixture_finalize()`,
        );
        const r = await command(10, p);
        assert.equal(r.error.code, "provider_ambiguous");
        assert.equal(r.campaign.state, "create_unknown");
        assert.ok(
          (
            await q(
              "SELECT consumed_at FROM newsletter_issue_reviews WHERE id=$1",
              [p.reviewId],
            )
          ).rows[0].consumed_at,
        );
        await owner.query(
          "DROP TRIGGER fixture_finalize ON newsletter_campaigns",
        );
      },
    );
    await t.test(
      "SQL protects identities, proof metadata and terminal stops; lists omit provider/operation IDs",
      async () => {
        for (const sql of [
          "DELETE FROM newsletter_campaigns WHERE edition='edition-1'",
          "UPDATE newsletter_campaigns SET state='draft' WHERE edition='edition-1'",
          "UPDATE newsletter_campaigns SET content_hash=repeat('f',64)WHERE edition='edition-1'",
          "UPDATE newsletter_campaigns SET broadcast_id='different' WHERE edition='edition-1'",
          "UPDATE newsletter_campaigns SET accepted_at=now()WHERE edition='edition-1'",
          "UPDATE newsletter_issue_reviews SET facts='{}' WHERE consumed_at IS NOT NULL",
          "DELETE FROM newsletter_issue_reviews WHERE consumed_at IS NOT NULL",
        ])
          await assert.rejects(q(sql));
        const list = await listIssueCampaigns({ db, registry }, null);
        assert.equal(list.issues.length, 20);
        assert.equal(list.nextCursor, null);
        assert.ok(!JSON.stringify(list).includes("native-"));
        assert.ok(!JSON.stringify(list).includes("legacy-op"));
      },
    );
    await t.test(
      "Actual HTTP issue preview/acknowledge/prepare/send retains a >1000-character token under strict JSON",
      async () => {
        const h = createHandler({
            db,
            mail: d.mail,
            settings: deps.settings,
            issueRegistry: registry,
            logger: () => {},
          }),
          x = find(13),
          headers = {
            authorization: "Bearer " + deps.settings.adminToken,
            "content-type": "application/json",
          };
        const post = async (action, input) => {
          const response = await h(
            new Request(
              deps.settings.origin + "/api/admin/issues/" + x.id + "/" + action,
              { method: "POST", headers, body: JSON.stringify(input) },
            ),
          );
          const body = await response.json();
          assert.equal(response.status, 200, JSON.stringify(body));
          return body;
        };
        for (const phase of ["prepare", "send"]) {
          const preview = await post("review-preview", {
            phase,
            contentHash: x.hash,
          });
          assert.ok(preview.previewToken.length > 1000);
          const p = await post("review", {
            phase,
            contentHash: x.hash,
            previewHash: preview.previewHash,
            previewToken: preview.previewToken,
            acknowledgement: ISSUE_ACKNOWLEDGEMENT,
          });
          const operation = await post(phase, {
            contentHash: x.hash,
            reviewId: p.reviewId,
            reviewHash: p.reviewHash,
            ...(phase === "send"
              ? { confirm: "SEND THIS REVIEWED ISSUE" }
              : {}),
          });
          assert.equal(
            operation.campaign.state,
            phase === "send" ? "accepted" : "draft",
          );
          assert.ok(!JSON.stringify(operation).includes("@example.invalid"));
        }
      },
    );
    await t.test(
      "Live-proof count and actual PostgreSQL row-byte quotas stop new proofs",
      async () => {
        const live = (
          await q(
            "SELECT count(*)::int AS n FROM newsletter_issue_reviews WHERE consumed_at IS NULL AND expires_at>now()",
          )
        ).rows[0].n;
        for (let i = live; i < 20; i++)
          await proof(11, "prepare", {
            now: () => new Date(Date.now() + i * 10).toISOString(),
          });
        await assert.rejects(proof(12), (e) => e.issueCode === "limit_reached");
        await q(
          "UPDATE newsletter_issue_reviews SET consumed_at=now(),consumed_operation_id='synthetic-quota' WHERE consumed_at IS NULL",
        );
        await q(
          "INSERT INTO newsletter_issue_reviews(id,method,issue_id,phase,preview_hash,proof_hash,facts,acknowledgement_hash,bearer_hash,preview_token_hash,created_at,expires_at,consumed_at,consumed_operation_id)SELECT lpad(i::text,43,'x'),'newsletter-issue-review-v1','fixture-012','prepare',md5(i::text)||md5(i::text),md5(i::text)||md5(i::text),jsonb_build_object('padding',(SELECT string_agg(md5((i*1000+n)::text),'')FROM generate_series(1,115)n)),repeat('a',64),repeat('b',64),md5('quota'||i)||md5('quota'||i),now(),now()+interval '15 minutes',now(),'synthetic-quota' FROM generate_series(1,650)i",
        );
        assert.ok(
          Number(
            (
              await q(
                "SELECT sum(pg_column_size(r))::bigint AS bytes FROM newsletter_issue_reviews r",
              )
            ).rows[0].bytes,
          ) > 2097152,
        );
        await assert.rejects(proof(12), (e) => e.issueCode === "limit_reached");
      },
    );
  } finally {
    if (db) await db.close();
    await owner.query("RESET search_path").catch(() => {});
    await owner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    assert.equal(
      (
        await owner.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schema,
        ])
      ).rows.length,
      0,
    );
    await owner.end();
  }
});
test("Actual Postgres: duplicate legacy native IDs fail additive migration without rewriting history", async () => {
  assert.ok(process.env.DATABASE_URL);
  const schema = "newsletter_test_" + randomBytes(10).toString("hex"),
    client = new pg.Client({
      connectionString: verifiedNeonConnectionString(process.env.DATABASE_URL),
    });
  const ddl = await readFile(new URL("../schema.sql", import.meta.url), "utf8");
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(ddl.split("-- R5 is additive:")[0]);
    await client.query(
      "INSERT INTO newsletter_campaigns(edition,content_hash,state,broadcast_id,operation_id)VALUES('edition-1',repeat('a',64),'accepted','duplicate-native','old-one'),('legacy-ambiguous',repeat('b',64),'send_unknown','duplicate-native','old-two')",
    );
    const before = (
      await client.query("SELECT * FROM newsletter_campaigns ORDER BY edition")
    ).rows;
    await client.query("BEGIN");
    await assert.rejects(client.query(ddl), (e) => e.code === "23505");
    await client.query("ROLLBACK");
    assert.deepEqual(
      (
        await client.query(
          "SELECT * FROM newsletter_campaigns ORDER BY edition",
        )
      ).rows,
      before,
    );
  } finally {
    await client.query("RESET search_path").catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    assert.equal(
      (
        await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schema,
        ])
      ).rows.length,
      0,
    );
    await client.end();
  }
});
