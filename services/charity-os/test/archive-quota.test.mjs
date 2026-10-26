import test from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_LIMITS,
  storePreview,
  commitPreview,
} from "../lib/database.mjs";
import { hash } from "../lib/security.mjs";

const org = "synthetic-org",
  actorId = "synthetic-operator";
const empty = {
  format: "charitology-os",
  version: 1,
  records: [],
  privateSource: "Preserve this original source.",
};
function fixture() {
  const rows = new Map(),
    queries = [];
  let forcedUsage;
  const c = {
    query: async (sql, args = []) => {
      queries.push({ sql, args });
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
      if (sql.startsWith("DELETE FROM os_previews")) {
        assert.match(sql, /committed_at IS NULL AND expires_at<=now\(\)/);
        for (const [id, r] of rows)
          if (!r.committed_at && r.expires_at <= Date.now()) rows.delete(id);
        return { rows: [] };
      }
      if (sql.startsWith("SELECT count(*) FILTER")) {
        assert.match(sql, /octet_length\(payload::text\)/);
        assert.match(sql, /octet_length\(\$2::jsonb::text\)/);
        if (forcedUsage) return { rows: [forcedUsage] };
        const pending = [...rows.values()].filter((r) => !r.committed_at),
          committed = [...rows.values()].filter((r) => r.committed_at);
        return {
          rows: [
            {
              pending_count: pending.length,
              pending_bytes: pending.reduce((n, r) => n + r.bytes, 0),
              committed_count: committed.length,
              committed_bytes: committed.reduce((n, r) => n + r.bytes, 0),
              candidate_bytes: Buffer.byteLength(args[1]),
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO os_previews")) {
        const [org_id, id, actor_id, kind, encoded, checksum, base_revision] =
          args;
        assert.equal(org_id, org);
        assert.equal(actor_id, actorId);
        rows.set(id, {
          org_id,
          id,
          actor_id,
          kind,
          payload: JSON.parse(encoded),
          checksum,
          base_revision,
          bytes: Buffer.byteLength(encoded),
          committed_at: null,
          expires_at: Date.now() + 30 * 60000,
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT payload FROM os_previews")) {
        const row = rows.get(args[1]);
        return {
          rows:
            row &&
            row.org_id === args[0] &&
            !row.committed_at &&
            row.expires_at > Date.now()
              ? [{ payload: row.payload }]
              : [],
        };
      }
      if (sql.startsWith("UPDATE os_previews SET committed_at")) {
        rows.get(args[1]).committed_at = Date.now();
        return { rows: [], rowCount: 1 };
      }
      throw new Error("Unexpected preview test query: " + sql);
    },
  };
  const save = (previewId, kind = "backup", payload = empty) =>
    storePreview(c, {
      org,
      previewId,
      actorId,
      kind,
      payload,
      checksum: hash(payload),
      baseRevision: hash([]),
    });
  return {
    c,
    rows,
    queries,
    save,
    usage: (value) => {
      forcedUsage = value;
    },
  };
}

test("Repeated empty backup and integration commits stop at the retained archive count without deleting source payloads", async () => {
  const f = fixture();
  for (let i = 0; i < PREVIEW_LIMITS.committedCount; i++) {
    await f.save("source-" + i, i % 2 ? "integration:synthetic" : "backup");
    await commitPreview(f.c, org, "source-" + i);
  }
  await assert.rejects(
    () => f.save("excess"),
    (error) => error.status === 422 && error.code === "archive_quota",
  );
  assert.equal(f.rows.size, PREVIEW_LIMITS.committedCount);
  assert.ok(
    [...f.rows.values()].every(
      (r) => r.committed_at && r.payload.privateSource === empty.privateSource,
    ),
  );
  assert.equal(
    f.queries.filter((q) => q.sql.startsWith("INSERT INTO os_previews")).length,
    PREVIEW_LIMITS.committedCount,
  );
});

test("Pending count is shared across preview kinds; cleanup never removes committed archives after expiry", async () => {
  const f = fixture();
  await f.save("archived");
  await commitPreview(f.c, org, "archived");
  f.rows.get("archived").expires_at = 0;
  for (let i = 0; i < PREVIEW_LIMITS.pendingCount; i++)
    await f.save("pending-" + i, i % 2 ? "integration:synthetic" : "backup");
  await assert.rejects(
    () => f.save("excess"),
    (error) => error.code === "preview_quota",
  );
  f.rows.get("pending-0").expires_at = 0;
  await f.save("replacement");
  assert.ok(f.rows.has("archived"));
  assert.equal(
    f.rows.get("archived").payload.privateSource,
    empty.privateSource,
  );
  assert.equal(f.rows.has("pending-0"), false);
  assert.ok(f.rows.has("replacement"));
});

test("Projected database JSON bytes reject before insertion and accept the exact archive and pending boundaries", async () => {
  for (const type of ["committed", "pending"]) {
    const f = fixture(),
      usage = {
        pending_count: 0,
        pending_bytes: 0,
        committed_count: 0,
        committed_bytes: 0,
        candidate_bytes: 11,
      };
    usage[type + "_bytes"] = PREVIEW_LIMITS[type + "Bytes"] - 10;
    f.usage(usage);
    await assert.rejects(
      () => f.save("oversized"),
      (error) =>
        error.code ===
        (type === "committed" ? "archive_quota" : "preview_quota"),
    );
    assert.equal(f.rows.size, 0);
    assert.equal(
      f.queries.some((q) => q.sql.startsWith("INSERT INTO os_previews")),
      false,
    );
    usage.candidate_bytes = 10;
    await f.save("exact-boundary");
    assert.ok(f.rows.has("exact-boundary"));
  }
});

test("Committing a preview rechecks retained capacity consumed by another preview and leaves rejected source intact", async () => {
  const f = fixture();
  for (let i = 0; i < PREVIEW_LIMITS.committedCount - 1; i++)
    f.rows.set("old-" + i, {
      org_id: org,
      payload: empty,
      committed_at: 1,
      expires_at: 0,
      bytes: 100,
    });
  await f.save("candidate-a");
  await f.save("candidate-b");
  await commitPreview(f.c, org, "candidate-a");
  await assert.rejects(
    () => commitPreview(f.c, org, "candidate-b"),
    (error) => error.code === "archive_quota",
  );
  assert.equal(f.rows.get("candidate-b").committed_at, null);
  assert.deepEqual(f.rows.get("candidate-b").payload, empty);
  await assert.rejects(
    () => commitPreview(f.c, org, "candidate-a"),
    (error) => error.status === 409,
  );
  assert.ok(
    f.queries.every(
      (q) =>
        !q.sql.startsWith("DELETE") || q.sql.includes("committed_at IS NULL"),
    ),
  );
});
