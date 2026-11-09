/** Synthetic permission/approval fixtures only; never historical admission authority. */
import {compileGrantReport,finalizeGrantReport} from '../lib/grant-report-model.mjs';
import {hash} from '../lib/security.mjs';
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
export function syntheticReport(f=grantFixture(),id='immutable-report-1') {
 const prepared=compileGrantReport(f);const m=f.records.find(r=>r.id==='manifest');m.data.sourceDigest=prepared.sourceDigest;m.status='approved';m.revision+=2;m.approval={status:'approved',revision:m.revision,actorId:'manifest-reviewer',at};f.revision=m.revision;f.mode='preview';
 const compiled=compileGrantReport(f);return finalizeGrantReport(compiled,{id,org:f.org,user:f.member.userId,member:f.member,createdAt:'2026-02-02T00:00:00.000Z',command:{keyHash:hash('synthetic-command-'+id),previewId:'synthetic-preview',reviewHash:hash(compiled)}});
}
