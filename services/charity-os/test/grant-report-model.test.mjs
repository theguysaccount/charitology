import test from "node:test";
import assert from "node:assert/strict";
import {
  compileGrantReport,
  finalizeGrantReport,
} from "../lib/grant-report-model.mjs";
import { hash, stable } from "../lib/security.mjs";

const ORG = "synthetic-report-org";
const at = "2026-02-01T10:00:00.000Z";
const member = {
  userId: "report-author",
  role: "owner",
  programIds: [],
  revision: 1,
};
const amount = (minor, currency = "USD", precision = 2) => ({
  minor,
  currency,
  precision,
});
function row(moduleId, id, data, status = "approved") {
  return {
    id,
    orgId: ORG,
    moduleId,
    data: { title: id, ...data },
    status,
    ownerId: "source-editor",
    lastEditedBy: "source-editor",
    revision: 2,
    approval: {
      status: "approved",
      revision: 2,
      actorId: "source-reviewer",
      at,
      reason: "Synthetic fixture approval, not a human accounting review.",
    },
    snapshot: null,
    createdAt: at,
    updatedAt: at,
  };
}
/** Entirely synthetic reporting references. No provider, real organization, person or ledger is used. */
export function grantFixture() {
  const records = [
    row("programs", "program", {
      kind: "program",
      purpose: "Synthetic test program",
    }),
    row(
      "grant-seeking",
      "application",
      {
        kind: "application",
        programId: "program",
        eligibility: "eligible",
        applicationVersion: 1,
        submissionReference: "submitted-v1",
        requested: amount(100000),
        applicationSummary: "PRIVATE_APPLICATION_NARRATIVE",
      },
      "decided",
    ),
    row(
      "grant-delivery",
      "agreement",
      {
        kind: "agreement",
        programId: "program",
        applicationId: "application",
        awarded: amount(100000),
        committed: amount(90000),
        spent: amount(11000),
        restriction: "restricted",
        restrictionCode: "approved-purpose",
        allowedPurpose: "Synthetic program work",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      "active",
    ),
    row("fundraising", "receipt", {
      kind: "gift-reference",
      programId: "program",
      agreementId: "agreement",
      amount: amount(30000),
      receivedDate: "2026-01-15",
      externalSystem: "Synthetic ledger",
      externalId: "PRIVATE_RECEIPT_EXT_ID",
      receiptReference: "PRIVATE_RECEIPT_REFERENCE",
    }),
    row("finance", "budget", {
      kind: "budget",
      programId: "program",
      agreementId: "agreement",
      planned: amount(80000),
      restrictionCode: "approved-purpose",
      purpose: "Synthetic program work",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    }),
    row("finance", "spending", {
      kind: "actual-reference",
      actualClass: "cash-spent",
      actualDate: "2026-01-16",
      programId: "program",
      agreementId: "agreement",
      actual: amount(10000),
      restrictionCode: "approved-purpose",
      purpose: "Synthetic program work",
      externalSystem: "Synthetic ledger",
      externalId: "PRIVATE_SPENDING_EXTERNAL_ID",
    }),
    row("outcomes", "indicator", {
      kind: "indicator",
      programId: "program",
      title: "Synthetic attendance",
      unit: "people",
    }),
    row("outcomes", "observation", {
      kind: "observation",
      programId: "program",
      indicatorId: "indicator",
      value: 0,
      unit: "people",
      denominator: null,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      geography: "Synthetic place",
      method: "administrative",
      evidence: "source-linked",
      sourceUrl: "https://example.invalid/PRIVATE_SOURCE_URL",
      limitations: "Observed attendance does not establish causal impact.",
    }),
    row(
      "reporting",
      "manifest",
      {
        kind: "funder",
        programId: "program",
        agreementId: "agreement",
        assemblyMethod: "grant-report-v1",
        receiptIds: ["receipt"],
        financeIds: ["budget", "spending"],
        outcomeIds: ["observation"],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        summary: "A synthetic source-pinned reporting example.",
        missingness: "Only selected records are covered.",
        visibility: "board",
      },
      "draft",
    ),
  ];
  const historic = structuredClone(records.find((r) => r.id === "application"));
  historic.status = "submitted";
  historic.revision = 1;
  historic.approval.revision = 1;
  historic.snapshot = {
    id: historic.id,
    orgId: ORG,
    moduleId: historic.moduleId,
    data: structuredClone(historic.data),
    status: "submitted",
    revision: 1,
    createdAt: at,
    updatedAt: at,
    files: [],
  };
  return {
    org: ORG,
    member: structuredClone(member),
    records,
    reportingRecordId: "manifest",
    revision: 2,
    submissionEvents: [
      {
        id: "submitted-event-1",
        recordId: "application",
        createdAt: "2026-02-01T10:01:00.000Z",
        record: historic,
      },
    ],
    mode: "prepare",
  };
}
const by = (f, id) => f.records.find((r) => r.id === id);
function prepared(f = grantFixture()) {
  return compileGrantReport(f);
}
function preview(f = grantFixture()) {
  const digest = prepared(f).sourceDigest,
    manifest = by(f, "manifest");
  manifest.data.sourceDigest = digest;
  manifest.status = "approved";
  manifest.revision += 2;
  manifest.approval = {
    status: "approved",
    revision: manifest.revision,
    actorId: "manifest-reviewer",
    at,
  };
  f.revision = manifest.revision;
  f.mode = "preview";
  return { f, compiled: compileGrantReport(f) };
}
const finish = (compiled) =>
  finalizeGrantReport(compiled, {
    id: "immutable-report-1",
    org: ORG,
    user: member.userId,
    member,
    createdAt: "2026-02-02T00:00:00.000Z",
    command: {
      keyHash: hash("synthetic-command"),
      previewId: "synthetic-preview",
      reviewHash: hash(compiled),
    },
  });
const fails = (fn, status, code) =>
  assert.throws(
    fn,
    (e) => (!status || e.status === status) && (!code || e.code === code),
  );

test("award, receipt, spending and planning remain separate externally referenced facts", () => {
  const compiled = prepared(),
    report = compiled.report;
  assert.equal(report.sections.grantContext.awarded.minor, 100000);
  assert.equal(
    report.sections.grantContext.recordedAgreementSpending.minor,
    11000,
  );
  assert.equal(report.sections.finances.receipts.totalMinor, 30000);
  assert.equal(report.sections.finances.spending.totalMinor, 10000);
  assert.equal(report.sections.finances.planning[0].planned.minor, 80000);
  assert.equal(report.sections.observations[0].value, 0);
  assert.equal(report.sections.observations[0].denominator, null);
  assert.equal("total" in report.sections.finances.planning, false);
  assert.equal(
    report.sections.summary,
    "A synthetic source-pinned reporting example.",
  );
});

test("unknown receipts do not become zero or a falsely complete headline", () => {
  const f = grantFixture();
  const second = row("fundraising", "unknown-receipt", {
    ...by(f, "receipt").data,
    amount: amount(null),
    externalId: "unknown-ext",
    receiptReference: "unknown-ref",
  });
  f.records.push(second);
  by(f, "manifest").data.receiptIds.push(second.id);
  const totals = prepared(f).report.sections.finances.receipts;
  assert.equal(totals.totalMinor, null);
  assert.equal(totals.knownSubtotalMinor, 30000);
  assert.equal(totals.unknownCount, 1);
  assert.equal(totals.coverage, "partial");
  second.data.amount = null;
  assert.equal(
    prepared(f).report.sections.finances.receipts.items[1].amount,
    null,
  );
});

test("empty selections are unknown coverage while explicit zero is known", () => {
  const f = grantFixture(),
    m = by(f, "manifest").data;
  m.receiptIds = [];
  m.financeIds = [];
  m.outcomeIds = [];
  const report = prepared(f).report;
  assert.equal(report.sections.finances.receipts.totalMinor, null);
  assert.equal(report.sections.finances.receipts.coverage, "empty");
  assert.equal(report.sections.finances.receipts.knownSubtotalMinor, 0);
  assert.match(report.sections.gaps.notices.join(" "), /not evidence of zero/);
  m.receiptIds = ["receipt"];
  by(f, "receipt").data.amount.minor = 0;
  assert.equal(prepared(f).report.sections.finances.receipts.totalMinor, 0);
});

test("currency precision supports JPY and KWD without conversions", () => {
  for (const [currency, precision] of [
    ["JPY", 0],
    ["KWD", 3],
  ]) {
    const f = grantFixture();
    for (const r of f.records)
      for (const key of [
        "requested",
        "awarded",
        "committed",
        "spent",
        "amount",
        "planned",
        "actual",
      ])
        if (r.data[key]) Object.assign(r.data[key], { currency, precision });
    Object.assign(f.submissionEvents[0].record.data.requested, {
      currency,
      precision,
    });
    Object.assign(f.submissionEvents[0].record.snapshot.data.requested, {
      currency,
      precision,
    });
    const report = prepared(f).report;
    assert.deepEqual(report.currency, { code: currency, precision });
    assert.equal(report.sections.finances.receipts.totalMinor, 30000);
  }
  const f = grantFixture();
  by(f, "receipt").data.amount = amount(null, "EUR");
  fails(() => prepared(f), 422);
  by(f, "receipt").data.amount = amount(-1);
  fails(() => prepared(f), 422);
});

test("unknown award amount retains explicit currency; missing award currency blocks", () => {
  const f = grantFixture();
  by(f, "agreement").data.awarded.minor = null;
  assert.equal(prepared(f).report.sections.grantContext.awarded.minor, null);
  assert.deepEqual(prepared(f).report.currency, { code: "USD", precision: 2 });
  by(f, "agreement").data.awarded = null;
  fails(() => prepared(f), 422);
});

test("safe integer boundary is exact and an overflowing selected subtotal is rejected", () => {
  const f = grantFixture();
  by(f, "receipt").data.amount.minor = Number.MAX_SAFE_INTEGER;
  assert.equal(
    prepared(f).report.sections.finances.receipts.totalMinor,
    Number.MAX_SAFE_INTEGER,
  );
  f.records.push(
    row("fundraising", "one-more", {
      ...by(f, "receipt").data,
      externalId: "one-more",
      receiptReference: "one-more",
      amount: amount(1),
    }),
  );
  by(f, "manifest").data.receiptIds.push("one-more");
  fails(() => prepared(f), 422);
});

test("duplicate source IDs and normalized external identities cannot double-count", () => {
  const f = grantFixture();
  by(f, "manifest").data.receiptIds.push("receipt");
  fails(() => prepared(f), 422);
  by(f, "manifest").data.receiptIds = ["receipt", "copy"];
  f.records.push(
    row("fundraising", "copy", {
      ...by(f, "receipt").data,
      externalSystem: " synthetic LEDGER ",
      externalId: "different-ext",
    }),
  );
  fails(() => prepared(f), 422);
  by(f, "copy").data.receiptReference = "distinct-ref";
  by(f, "copy").data.externalId = "PRIVATE_RECEIPT_EXT_ID";
  fails(() => prepared(f), 422);
});

test("pledges, agreement-free receipts and unclassified actuals never enter cash totals", () => {
  const f = grantFixture();
  by(f, "receipt").data.kind = "pledge";
  fails(() => prepared(f), 422);
  by(f, "receipt").data.kind = "gift-reference";
  by(f, "receipt").data.agreementId = null;
  fails(() => prepared(f), 422);
  by(f, "receipt").data.agreementId = "agreement";
  by(f, "spending").data.actualClass = "unknown";
  const report = prepared(f).report;
  assert.equal(report.sections.finances.spending.totalMinor, null);
  assert.equal(
    report.sections.finances.planning.find((r) => r.source.id === "spending")
      .actual.minor,
    10000,
  );
  assert.match(
    report.sections.gaps.notices.join(" "),
    /not explicitly classified/,
  );
});

test("strict inclusive dates accept leap days and same-day coverage, reject impossible/straddling/missing dates", () => {
  const f = grantFixture();
  by(f, "manifest").data.financeIds = [];
  by(f, "manifest").data.outcomeIds = [];
  by(f, "manifest").data.startDate = "2028-02-29";
  by(f, "manifest").data.endDate = "2028-02-29";
  by(f, "agreement").data.startDate = "2028-01-01";
  by(f, "agreement").data.endDate = "2028-12-31";
  by(f, "receipt").data.receivedDate = "2028-02-29";
  assert.equal(prepared(f).report.sections.finances.receipts.totalMinor, 30000);
  by(f, "receipt").data.receivedDate = "2028-02-30";
  fails(() => prepared(f), 422);
  by(f, "receipt").data.receivedDate = null;
  fails(() => prepared(f), 422);
  const f2 = grantFixture();
  by(f2, "budget").data.endDate = "2026-02-01";
  fails(() => prepared(f2), 422);
  by(f2, "budget").data.endDate = null;
  fails(() => prepared(f2), 422);
});

test("parent budgets are frozen as context, never added to allocation or actual cash", () => {
  const f = grantFixture();
  by(f, "budget").data.endDate = "2026-12-31";
  f.records.push(
    row("finance", "allocation", {
      kind: "allocation",
      programId: "program",
      agreementId: "agreement",
      parentBudgetId: "budget",
      planned: amount(20000),
      allocationBps: 2500,
      purpose: "Synthetic program work",
      restrictionCode: "approved-purpose",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    }),
  );
  by(f, "manifest").data.financeIds = ["allocation", "spending"];
  const report = prepared(f).report;
  assert.equal(report.sections.finances.planning.length, 2);
  assert.equal(
    report.sections.finances.planning.find((r) => r.source.id === "budget")
      .isDependency,
    true,
  );
  assert.equal(report.sections.finances.spending.totalMinor, 10000);
  by(f, "budget").approval = null;
  fails(() => prepared(f), 409);
});

test("observations and harms preserve distinct units, unknowns and populations without pooling", () => {
  const f = grantFixture();
  f.records.push(
    row("outcomes", "rate-indicator", {
      kind: "indicator",
      programId: "program",
      unit: "percent",
    }),
  );
  f.records.push(
    row("outcomes", "harm", {
      kind: "harm",
      programId: "program",
      indicatorId: "rate-indicator",
      unit: "percent",
      value: 20,
      denominator: 5,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      method: "survey",
      evidence: "self-reported",
      limitations: "Synthetic overlapping population.",
    }),
  );
  by(f, "manifest").data.outcomeIds.push("harm");
  const rows = prepared(f).report.sections.observations;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.value),
    [20, 0],
  );
  assert.equal(rows.find((r) => r.kind === "harm").denominator, 5);
  assert.equal("total" in prepared(f).report.sections, false);
  by(f, "harm").data.denominator = 0;
  fails(() => prepared(f), 422);
  by(f, "harm").data.value = null;
  assert.equal(prepared(f).report.sections.observations[0].value, null);
  by(f, "harm").data.unit = "people";
  fails(() => prepared(f), 422);
});

test("Prepare accepts only an unapproved manifest exception, never unapproved factual data", () => {
  const f = grantFixture();
  by(f, "manifest").approval = null;
  assert.equal(prepared(f).mode, "prepare");
  fails(() => finish(prepared(f)), 422);
  by(f, "receipt").approval = null;
  fails(() => prepared(f), 409, "grant_report_approval");
  by(f, "receipt").approval = {
    status: "approved",
    revision: 2,
    actorId: "source-editor",
    at,
  };
  fails(() => prepared(f), 409);
  by(f, "receipt").approval.actorId = "source-reviewer";
  by(f, "receipt").approval.revision = 1;
  fails(() => prepared(f), 409);
});

test("digest deliberately survives manifest save/review but every factual reapproval invalidates it", () => {
  const { f, compiled } = preview();
  assert.equal(
    compiled.sourceDigest,
    prepared({ ...f, mode: "prepare" }).sourceDigest,
  );
  const old = compiled.sourceDigest;
  by(f, "receipt").approval.at = "2026-02-01T11:00:00.000Z";
  fails(() => compileGrantReport(f), 409, "grant_report_digest");
  assert.notEqual(prepared({ ...f, mode: "prepare" }).sourceDigest, old);
  by(f, "manifest").data.sourceDigest = "a".repeat(64);
  fails(() => compileGrantReport(f), 409);
});

test("manifest-data changes and unseen current edits cannot fall back to approved snapshots", () => {
  const { f } = preview();
  by(f, "manifest").data.missingness = "Changed after source preparation";
  fails(() => compileGrantReport(f), 409, "grant_report_digest");
  const g = grantFixture(),
    receipt = by(g, "receipt");
  receipt.snapshot = structuredClone(receipt);
  receipt.data.amount.minor = 999;
  receipt.revision++;
  receipt.approval = null;
  fails(() => prepared(g), 409);
  const missingMethod = grantFixture();
  by(missingMethod, "manifest").data.assemblyMethod = null;
  fails(() => prepared(missingMethod), 422);
});

test("historical submitted application is separate from current decided revision and replacement snapshot", () => {
  const f = grantFixture();
  const current = by(f, "application");
  current.data.applicationSummary = "Changed current summary";
  current.snapshot = { data: { nonsense: true } };
  const report = prepared(f).report;
  assert.equal(report.sections.grantContext.application.current.revision, 2);
  assert.equal(report.sections.grantContext.application.submitted.revision, 1);
  assert.equal(
    report.modules.find((m) => m.id === "grant-seeking").records[0]
      .submittedArtifact.record.data.applicationSummary,
    "PRIVATE_APPLICATION_NARRATIVE",
  );
  f.submissionEvents = [];
  fails(() => prepared(f), 422);
});

test("mismatched/multiple submission history cannot invent provenance", () => {
  for (const change of [
    (f) => f.submissionEvents[0].record.snapshot.revision++,
    (f) =>
      (f.submissionEvents[0].record.snapshot.data.submissionReference =
        "different"),
    (f) => (f.submissionEvents[0].record.orgId = "other-org"),
    (f) => f.submissionEvents.push(structuredClone(f.submissionEvents[0])),
  ]) {
    const f = grantFixture();
    change(f);
    fails(() => prepared(f), 422);
  }
});

test("current creator/scope authority is checked before hidden source eligibility or private content", () => {
  for (const role of ["contributor", "board_reader", "external_reviewer"]) {
    const f = grantFixture();
    f.member.role = role;
    fails(() => prepared(f), 403);
  }
  const f = grantFixture();
  f.member.programIds = ["another-program"];
  by(f, "receipt").approval = null;
  assert.throws(
    () => prepared(f),
    (e) => e.status === 403 && !e.message.includes("receipt"),
  );
  const wrong = grantFixture();
  by(wrong, "receipt").orgId = "other-org";
  fails(() => prepared(wrong), 403);
  const unscoped = grantFixture();
  by(unscoped, "receipt").data.programId = null;
  fails(() => prepared(unscoped), 403);
  const deleted = grantFixture();
  by(deleted, "receipt").deletedAt = at;
  fails(() => prepared(deleted), 403);
});

test("cross-program/unavailable document identity blocks without copying document content", () => {
  const f = grantFixture();
  f.records.push(
    row("documents", "private-doc", {
      kind: "document",
      title: "PRIVATE_FILE_TITLE",
      programId: "program",
    }),
  );
  by(f, "application").data.documentIds = ["private-doc"];
  f.submissionEvents[0].record.data.documentIds = ["private-doc"];
  f.submissionEvents[0].record.snapshot.data.documentIds = ["private-doc"];
  const report = prepared(f).report;
  assert.equal(
    report.modules.some((m) => m.id === "documents"),
    false,
  );
  assert.equal(stable(report).includes("PRIVATE_FILE_TITLE"), false);
  by(f, "private-doc").orgId = "other-org";
  fails(() => prepared(f), 403);
});

test("pending amendments and conflicting restrictions block without choosing precedence", () => {
  const f = grantFixture();
  f.records.push(
    row(
      "grant-delivery",
      "amendment",
      { kind: "amendment", programId: "program", agreementId: "agreement" },
      "draft",
    ),
  );
  fails(() => prepared(f), 409, "grant_report_amendment");
  by(f, "amendment").status = "cancelled";
  assert.doesNotThrow(() => prepared(f));
  by(f, "amendment").status = "draft";
  by(f, "amendment").data.kind = "restriction";
  by(f, "amendment").data.restrictionCode = "different";
  fails(() => prepared(f), 409, "grant_report_restriction");
});

test("all current factual states and independent approval timestamps are mandatory", () => {
  for (const id of [
    "program",
    "application",
    "agreement",
    "receipt",
    "budget",
    "spending",
    "indicator",
    "observation",
  ]) {
    const f = grantFixture();
    by(f, id).status = "review";
    fails(() => prepared(f), 409);
    by(f, id).status = id === "application" ? "decided" : "approved";
    by(f, id).approval.at = "not-a-date";
    fails(() => prepared(f), 409);
  }
});

test("board projection has no private envelopes, actors, application narrative, external identities or source URLs", () => {
  const { compiled } = preview(),
    full = finish(compiled),
    board = full.boardProjection,
    json = stable(board);
  for (const secret of [
    "PRIVATE_APPLICATION_NARRATIVE",
    "PRIVATE_RECEIPT_EXT_ID",
    "PRIVATE_RECEIPT_REFERENCE",
    "PRIVATE_SPENDING_EXTERNAL_ID",
    "PRIVATE_SOURCE_URL",
    "source-reviewer",
    "source-editor",
    "manifest-reviewer",
    "report-author",
  ])
    assert.equal(json.includes(secret), false, secret);
  for (const key of ["modules", "authorization", "command", "createdBy"])
    assert.equal(Object.hasOwn(board, key), false);
  assert.equal(board.sections.finances.receipts.totalMinor, 30000);
  assert.equal(board.sections.summary, full.sections.summary);
  assert.equal(
    board.sourceRevisions.every((r) => !Object.hasOwn(r, "approval")),
    true,
  );
  assert.equal(
    full.modules
      .find((m) => m.id === "outcomes")
      .records.find((r) => r.id === "observation").data.sourceUrl,
    "https://example.invalid/PRIVATE_SOURCE_URL",
  );
});

test("trace paths resolve and bind every derived financial/measurement source to its frozen hash", () => {
  const report = prepared().report,
    refs = new Map(report.sourceRevisions.map((r) => [r.id, r]));
  const frozen = new Map(
    report.modules.flatMap((m) => m.records.map((r) => [r.id, r])),
  );
  for (const entry of report.trace) {
    let value = report;
    for (const key of entry.outputPath.split("/").slice(1)) value = value[key];
    assert.notEqual(value, undefined, entry.outputPath);
    for (const ref of entry.sources) {
      assert.equal(refs.get(ref.id).dataHash, ref.dataHash);
      assert.equal(refs.get(ref.id).revision, ref.revision);
      assert.ok(ref.fields.length);
      for (const field of ref.fields) {
        let source = frozen.get(ref.id);
        for (const key of field.split(".")) source = source?.[key];
        assert.notEqual(source, undefined, `${ref.id}.${field}`);
      }
    }
  }
  assert.ok(report.trace.some((t) => t.operation === "sum-known-minor-v1"));
  assert.ok(
    report.trace.some((t) => t.operation === "observation-unpooled-v1"),
  );
});

test("canonical checksums have no cycle, deterministic assembly does not mutate inputs", () => {
  const f = grantFixture(),
    before = stable(f);
  const first = prepared(f),
    second = prepared(f);
  assert.equal(stable(first), stable(second));
  assert.equal(stable(f), before);
  const { compiled } = preview();
  const compiledBefore = stable(compiled);
  const report = finish(compiled);
  const { checksum, ...full } = report;
  assert.equal(hash(full), checksum);
  const { checksum: boardChecksum, ...board } = report.boardProjection;
  assert.equal(hash(board), boardChecksum);
  assert.notEqual(checksum, boardChecksum);
  assert.equal(Object.hasOwn(board, "fullChecksum"), false);
  assert.equal(stable(compiled), compiledBefore);
  assert.equal(report.command.actorId, member.userId);
});

test("corrections append a same-agreement checksum-bound predecessor with reviewed reason", () => {
  const previous = finish(preview().compiled),
    f = grantFixture();
  by(f, "manifest").data.supersedesReportId = previous.id;
  by(f, "manifest").data.revisionReason =
    "Correct a synthetic source omission.";
  f.previousReport = previous;
  assert.deepEqual(prepared(f).report.supersedes, {
    id: previous.id,
    checksum: previous.checksum,
    reason: "Correct a synthetic source omission.",
  });
  by(f, "manifest").data.revisionReason = null;
  fails(() => prepared(f), 422);
  by(f, "manifest").data.revisionReason = "Correct";
  f.previousReport = {
    ...previous,
    agreement: { ...previous.agreement, id: "other" },
  };
  fails(() => prepared(f), 422);
  f.previousReport = { ...previous, title: "tampered" };
  fails(() => prepared(f), 422);
});

test("selection/count limits, public audience and stale final authority fail closed", () => {
  const f = grantFixture();
  by(f, "manifest").data.visibility = "public";
  fails(() => prepared(f), 422);
  by(f, "manifest").data.visibility = "board";
  by(f, "manifest").data.receiptIds = Array.from(
    { length: 101 },
    (_, i) => `receipt-${i}`,
  );
  fails(() => prepared(f), 422);
  const { compiled } = preview();
  assert.throws(
    () =>
      finalizeGrantReport(compiled, {
        id: "final",
        org: ORG,
        user: "wrong-user",
        member,
        createdAt: at,
        command: {
          keyHash: hash("x"),
          previewId: "preview",
          reviewHash: hash(compiled),
        },
      }),
    (e) => e.status === 422,
  );
  assert.throws(
    () =>
      finalizeGrantReport(compiled, {
        id: "final",
        org: ORG,
        user: member.userId,
        member: { ...member, programIds: ["another-program"] },
        createdAt: at,
        command: {
          keyHash: hash("x"),
          previewId: "preview",
          reviewHash: hash(compiled),
        },
      }),
    (e) => e.status === 403,
  );
});

test("reference order is still manifest data; changing it requires preparation again", () => {
  const { f } = preview();
  by(f, "manifest").data.financeIds.reverse();
  fails(() => compileGrantReport(f), 409, "grant_report_digest");
});

test("clock skew does not replace submitted revision lineage, while impossible timestamps fail", () => {
  const f = grantFixture();
  f.submissionEvents[0].createdAt = "2026-02-01T09:59:59.999Z";
  assert.equal(
    prepared(f).report.sections.grantContext.application.submitted.createdAt,
    "2026-02-01T09:59:59.999Z",
  );
  by(f, "receipt").approval.at = "2026-02-31T10:00:00.000Z";
  fails(() => prepared(f), 409);
});

test("unrelated malformed private data does not block or enter a used-source closure", () => {
  const f = grantFixture();
  f.records.push({
    id: "unrelated",
    orgId: ORG,
    moduleId: "contacts",
    data: null,
  });
  assert.equal(
    prepared(f).report.modules.some((m) => m.id === "contacts"),
    false,
  );
});

test("recursive closure and UTF-8 complete-report bounds reject before any freeze", () => {
  const f = grantFixture();
  by(f, "manifest").data.financeIds = ["budget"];
  for (let i = 0; i < 250; i++) {
    const id = `parent-${i}`;
    const previous = i ? by(f, `parent-${i - 1}`) : by(f, "budget");
    previous.data.parentBudgetId = id;
    f.records.push(
      row("finance", id, {
        ...by(f, "budget").data,
        parentBudgetId: null,
        title: id,
      }),
    );
  }
  fails(() => prepared(f), 422);
  const big = grantFixture();
  by(big, "manifest").data.financeIds = [];
  by(big, "manifest").data.receiptIds = [];
  by(big, "manifest").data.outcomeIds = [];
  for (let i = 0; i < 100; i++) {
    const indicatorId = `large-indicator-${i}`,
      observationId = `large-observation-${i}`;
    big.records.push(
      row("outcomes", indicatorId, {
        kind: "indicator",
        programId: "program",
        unit: "people",
        limitations: "量".repeat(4000),
      }),
    );
    big.records.push(
      row("outcomes", observationId, {
        ...by(big, "observation").data,
        indicatorId,
        limitations: "量".repeat(4000),
      }),
    );
    by(big, "manifest").data.outcomeIds.push(observationId);
  }
  fails(() => prepared(big), 422, "grant_report_size");
});
