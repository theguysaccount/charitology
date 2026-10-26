import test from "node:test";
import assert from "node:assert/strict";
import { api, request, allRecords, setCsrfToken, ApiError } from "./api.js";
const json = (value) =>
  new Response(JSON.stringify({ ok: true, ...value }), {
    headers: { "content-type": "application/json" },
  });

test("mutations send same-origin credentials, explicit CSRF and the saved revision", async () => {
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (path, options) => {
    captured = { path, options };
    return json({ record: { id: "r1" } });
  };
  try {
    setCsrfToken("synthetic-csrf");
    await api.updateRecord("org A", "projects", "r1", {
      revision: 7,
      data: { title: "A real revision" },
    });
    assert.equal(
      captured.path,
      "/api/orgs/org%20A/modules/projects/records/r1",
    );
    assert.equal(captured.options.credentials, "same-origin");
    assert.equal(captured.options.cache, "no-store");
    assert.equal(captured.options.headers["X-CSRF-Token"], "synthetic-csrf");
    assert.equal(JSON.parse(captured.options.body).revision, 7);
    await api.deleteRecord("org A", "projects", "r1", 7);
    assert.equal(captured.options.method, "DELETE");
    assert.equal(JSON.parse(captured.options.body).revision, 7);
  } finally {
    globalThis.fetch = original;
    setCsrfToken("");
  }
});
test("stale-revision and validation errors retain server status and field issues", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        message: "A newer version exists.",
        code: "revision",
        issues: [{ field: "title", message: "Required" }],
      }),
      { status: 409 },
    );
  try {
    await assert.rejects(
      () => request("/test", { method: "PATCH", body: {} }),
      (error) =>
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === "revision" &&
        error.issues[0].field === "title",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("interrupted mutations warn about possible completion and are never retried automatically", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("offline");
  };
  try {
    await assert.rejects(
      () => api.createRecord("o", "projects", { data: { title: "Task" } }),
      /may have completed/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("paginated reads complete all pages and stop a repeating cursor", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? json({ records: [{ id: "one" }], cursor: "next" })
      : json({ records: [{ id: "two" }] });
  try {
    assert.deepEqual(
      (await allRecords("o", "projects")).map((r) => r.id),
      ["one", "two"],
    );
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return json({ records: [], cursor: "same" });
    };
    await assert.rejects(
      () => allRecords("o", "projects"),
      /Pagination stopped/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("backup preview and commit preserve the reviewed preview identity", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, options) => {
    requests.push({ path, body: JSON.parse(options.body) });
    return json({ previewId: "preview1", imported: 1 });
  };
  try {
    const preview = await api.previewImport("o", {
      backup: { format: "charitology-os" },
    });
    await api.commitImport("o", { previewId: preview.previewId });
    assert.equal(requests[0].path, "/api/orgs/o/import/preview");
    assert.deepEqual(requests[0].body, {
      backup: { format: "charitology-os" },
    });
    assert.deepEqual(requests[1].body, { previewId: "preview1" });
  } finally {
    globalThis.fetch = original;
  }
});
