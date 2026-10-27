import test from "node:test";
import assert from "node:assert/strict";
import {
  grantReportForReader,
  grantReportRoutes,
  isGrantReport,
} from "../lib/grant-reports.mjs";

function payload() {
  return {
    format: "charitology-os-report",
    kind: "grant-period",
    schemaVersion: 1,
    methodVersion: "grant-report-v1",
    id: "synthetic-report",
    orgId: "synthetic-org",
    manifest: { audience: "board" },
    agreement: { programId: "program-a" },
    modules: [
      {
        id: "programs",
        records: [
          {
            id: "program-a",
            orgId: "synthetic-org",
            moduleId: "programs",
            data: { title: "Synthetic program" },
          },
        ],
      },
      {
        id: "reporting",
        records: [
          {
            id: "manifest-a",
            orgId: "synthetic-org",
            moduleId: "reporting",
            data: { programId: "program-a", title: "Synthetic manifest" },
          },
        ],
      },
    ],
    boardProjection: {
      kind: "grant-period-board",
      id: "synthetic-report",
      orgId: "synthetic-org",
      checksum: "a".repeat(64),
    },
  };
}
test("grant discriminator keeps unsupported versions out of legacy full readers, while current role/scope chooses only the stored allowed projection", () => {
  const report = payload();
  assert.equal(isGrantReport(report), true);
  assert.equal(isGrantReport({ modules: [] }), false);
  const admin = { role: "admin", programIds: [] },
    board = { role: "board_reader", programIds: ["program-a"] };
  assert.equal(grantReportForReader(report, admin), report);
  assert.equal(grantReportForReader(report, board), report.boardProjection);
  for (const member of [
    { role: "external_reviewer", programIds: [] },
    { role: "contributor", programIds: [] },
    { role: "admin", programIds: ["program-b"] },
    { role: "board_reader", programIds: ["program-b"] },
  ])
    assert.equal(grantReportForReader(report, member), null);
  assert.equal(
    grantReportForReader({ ...report, schemaVersion: 2 }, admin),
    null,
  );
  assert.equal(
    grantReportForReader(
      { ...report, manifest: { audience: "funder" } },
      board,
    ),
    null,
  );
  assert.equal(
    grantReportForReader(
      {
        ...report,
        boardProjection: { ...report.boardProjection, id: "another-report" },
      },
      board,
    ),
    null,
  );
});
test("full-reader authority includes every frozen module and explicit program anchor, not historical creator identity", () => {
  const report = payload(),
    admin = { role: "admin", programIds: ["program-a"] };
  for (const record of [
    {
      id: "bad",
      orgId: "other-org",
      moduleId: "reporting",
      data: { programId: "program-a" },
    },
    { id: "bad", orgId: "synthetic-org", moduleId: "reporting", data: {} },
    {
      id: "bad",
      orgId: "synthetic-org",
      moduleId: "reporting",
      data: { programId: "program-b" },
    },
    {
      id: "bad",
      orgId: "synthetic-org",
      moduleId: "outcomes",
      data: { programId: "program-a" },
    },
    { id: "bad", orgId: "synthetic-org", moduleId: "reporting" },
  ]) {
    const changed = structuredClone(report);
    changed.modules[1].records = [record];
    assert.equal(grantReportForReader(changed, admin), null);
  }
  const changed = structuredClone(report);
  changed.modules.push({ id: "accounting", records: [] });
  assert.equal(
    grantReportForReader(changed, {
      role: "program_lead",
      programIds: ["program-a"],
    }),
    null,
  );
});
test("unrelated routes do not query; unknown/private/duplicate capture inputs cannot be interpreted as report authority", async () => {
  const c = {
    query: async () => {
      throw new Error("Unexpected database query");
    },
  };
  assert.equal(
    await grantReportRoutes({ c, tail: "reports", method: "GET" }),
    null,
  );
  const base =
    "https://os.example.invalid/api/orgs/synthetic-org/grant-reports";
  for (const query of [
    "?key=private",
    "?path=wrong",
    "?path=orgs/synthetic-org/grant-reports&path=orgs/synthetic-org/grant-reports",
    "?cursor=a&cursor=b",
  ])
    await assert.rejects(
      grantReportRoutes({
        c,
        org: "synthetic-org",
        user: "synthetic-user",
        tail: "grant-reports",
        method: "GET",
        url: new URL(base + query),
      }),
      (e) => e.status === 400,
    );
});
test("membership is read afresh and oversized commands stop before sources/cache/report reads", async () => {
  let queries = 0;
  const c = {
    query: async (sql) => {
      queries++;
      assert.match(sql, /SELECT \* FROM os_members/);
      return {
        rows: [
          {
            user_id: "synthetic-user",
            role: "admin",
            program_ids: [],
            revision: 2,
          },
        ],
      };
    },
  };
  await assert.rejects(
    grantReportRoutes({
      c,
      org: "synthetic-org",
      user: "synthetic-user",
      member: { role: "admin", revision: 1 },
      tail: "grant-reports/prepare",
      method: "POST",
      input: { reportingRecordId: "x".repeat(17000) },
      url: new URL(
        "https://os.example.invalid/api/orgs/synthetic-org/grant-reports/prepare",
      ),
    }),
    (e) => e.status === 413,
  );
  assert.equal(queries, 1);
});
