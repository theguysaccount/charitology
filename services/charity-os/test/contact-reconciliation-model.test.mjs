import test from "node:test";
import assert from "node:assert/strict";
import { planContactReconciliation, CONTACT_RECONCILIATION_METHOD } from "../lib/contact-reconciliation-model.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";

// All records are fictional pure values, not current user identities or SQL.
const row = (id, title) => ({ id, orgId: "fictional_org", moduleId: "contacts", revision: 1, status: "draft",
  data: validateRecord("contacts", { title, kind: "person-reference", email: null, contactPreference: "permission-needed", purpose: "Fictional scheduling only" }, { records: [] }),
  source: null, approval: null, snapshot: null, deletedAt: null });
const fixture = () => ({ orgId: "fictional_org", pair: [row("left", "Fictional left 🌱"), row("right", "Fictional right")], organizations: [], references: [],
  decision: { operation: "merge", survivorId: "left", fields: { title: "right", displayLabel: "unknown", email: "unknown" }, basis: "record-comparison", reason: "Fictional reviewed duplicate drafts" } });
const ref = (patch = {}) => ({ family: "record", id: "fictional_pledge", moduleId: "fundraising", field: "contactId", contactId: "right", revision: 2, sha256: "a".repeat(64), deleted: false, ...patch });
const rejects = (v, code) => assert.throws(() => planContactReconciliation(v), e => e.name === "ContactReconciliationError" && (!code || e.code === code));

test("explicit merge proposes only selected fields and retained loser, with exact provenance", () => {
  const v = fixture(), before = structuredClone(v), p = planContactReconciliation(v);
  assert.equal(p.proposal.survivorData.title, v.pair[1].data.title);
  assert.equal(p.proposal.survivorData.email, null);
  assert.equal(p.proposal.survivorStatus, "draft");
  assert.deepEqual(p.proposal.retire, { id: "right", operation: "soft-delete" });
  assert.equal(p.proposal.fieldProvenance[0].contactId, "right");
  assert.equal(p.proposal.fieldProvenance[0].contactRevision, 1);
  assert.equal(p.proposal.fieldProvenance[2].contactId, null);
  for (const f of p.proposal.unchangedFields) assert.deepEqual(p.proposal.survivorData[f], v.pair[0].data[f]);
  assert.deepEqual(v, before); assert(Object.isFrozen(p.proposal.survivorData));
  assert.equal(p.authority, "none-data-only"); assert.equal(p.dependencyCompleteness, "caller-must-establish");
});
test("all five explicit keep-separate assertions preserve different people, household and role boundaries", () => {
  for (const assertion of ["distinct-people", "same-person-kept-separate", "shared-household-distinct-people", "separate-role-records", "unresolved"]) {
    const v = fixture(); v.decision = { operation: "no-merge", assertion, basis: "unknown", reason: "Fictional uncertainty retained" };
    const p = planContactReconciliation(v); assert.equal(p.proposal, null); assert.deepEqual(p.refusals, []); assert.equal(p.decision.assertion, assertion);
  }
});
test("equal email/title never chooses identity or merges without an explicit operation and choices", () => {
  const v = fixture(); v.pair[1].data = structuredClone(v.pair[0].data); delete v.decision.fields.email; rejects(v);
  v.decision = { operation: "auto-merge", assertion: "distinct-people", basis: "unknown", reason: "No automatic decision" }; rejects(v);
});
test("local field source ownership refuses imported and external contacts without changing history", () => {
  for (const f of ["source", "externalSystem", "externalId", "externalUrl"]) {
    const v = fixture();
    if (f === "source") v.pair[1].source = { integrationId: "fictional_connection", externalId: "external_1", checksum: "b".repeat(64) };
    else { v.pair[1].data[f] = f === "externalUrl" ? "https://example.invalid/fictional" : "fictional_source"; if (f === "externalId") v.pair[1].data.externalSystem = "fictional_source"; }
    const p = planContactReconciliation(v); assert.equal(p.proposal, null); assert(p.refusals.includes("source-owned-contact"));
  }
});
test("different relationship or purpose/preference/review date refuses consent or role union", () => {
  for (const [f, value] of [["relationship", "volunteer"], ["purpose", "Different fictional purpose"], ["contactPreference", "do-not-contact"], ["reviewDate", "2026-11-08"]]) {
    const v = fixture(); v.pair[1].data[f] = value; const p = planContactReconciliation(v);
    assert.equal(p.proposal, null); assert(p.refusals.includes("role-or-preference-conflict"));
  }
});
test("verified/active contacts and approval/snapshot refuse merge rather than resetting approval", () => {
  for (const patch of [{ status: "verified" }, { status: "active" }, { approval: { historical: true } }, { snapshot: { historical: true } }]) {
    const v = fixture(); Object.assign(v.pair[0], patch); const p = planContactReconciliation(v);
    assert.equal(p.proposal, null); assert(p.refusals.includes("not-unapproved-drafts"));
  }
});
test("incoming losing-ID references including trash refuse, survivor references stay unchanged", () => {
  for (const deleted of [false, true]) { const v = fixture(); v.references = [ref({ deleted })]; const p = planContactReconciliation(v); assert.equal(p.proposal, null); assert(p.refusals.includes("losing-id-reference")); }
  const v = fixture(); v.references = [ref({ contactId: "left" })]; const p = planContactReconciliation(v);
  assert(p.proposal); assert.deepEqual(p.references, v.references); assert.equal(p.proposal.retire.id, "right");
});
test("intake/participation/delivery/immutable linkage to either side refuses without transfer", () => {
  for (const family of ["intake", "participation", "delivery", "immutable-history"]) for (const contactId of ["left", "right"]) {
    const v = fixture(); v.references = [ref({ family, moduleId: null, field: null, contactId })]; const p = planContactReconciliation(v);
    assert.equal(p.proposal, null); assert(p.refusals.includes("linked-private-or-immutable-history"));
  }
});
test("reference grammar admits only actual Contacts target fields and rejects invented modules/fields", () => {
  for (const patch of [{ moduleId: "outcomes" }, { field: "title" }, { moduleId: "households" }, { contactId: "foreign_contact" }, { revision: null }]) {
    const v = fixture(); v.references = [ref(patch)]; rejects(v);
  }
  const v = fixture(); v.references = [ref(), ref()]; rejects(v);
});
test("same related organization is typed/current, and differing affiliations stay separate", () => {
  const v = fixture(); v.organizations = [{ id: "fictional_organization", orgId: v.orgId, moduleId: "contacts", revision: 3, kind: "organization", deletedAt: null }];
  for (const r of v.pair) r.data.organizationId = "fictional_organization";
  assert(planContactReconciliation(v).proposal);
  v.pair[1].data.organizationId = null; assert(planContactReconciliation(v).refusals.includes("role-or-preference-conflict"));
  v.organizations[0].orgId = "foreign_org"; rejects(v);
});
test("foreign/same/deleted/nonperson pairs are refused before any proposal", () => {
  for (const change of [v => v.pair[1].orgId = "foreign_org", v => v.pair[1].id = "left", v => v.pair[1].deletedAt = "2026-11-08T00:00:00Z", v => v.pair[1].data.kind = "organization"]) {
    const v = fixture(); change(v); rejects(v);
  }
});
test("normalized null is preserved, free values/empty-title/unknown keys cannot be smuggled", () => {
  const v = fixture(); v.pair[1].data.email = "fictional@example.invalid"; v.decision.fields.email = "right";
  assert.equal(planContactReconciliation(v).proposal.survivorData.email, "fictional@example.invalid");
  v.decision.fields.email = "fictional@other.invalid"; rejects(v);
  for (const change of [x => x.decision.fields.title = "unknown", x => x.pair[0].data.email = "", x => x.pair[1].data.title = "  trimmed  ", x => x.decision.override = true]) { const x = fixture(); change(x); rejects(x); }
});
test("canonical checksum is deterministic, source/revision/decision-bound, and domain-separated", () => {
  const v = fixture(), p = planContactReconciliation(v), { sha256, ...body } = p;
  assert.equal(sha256, hash({ method: CONTACT_RECONCILIATION_METHOD, kind: "plan", value: body }));
  assert.notEqual(sha256, hash(body)); assert.equal(planContactReconciliation(structuredClone(v)).sha256, sha256);
  for (const change of [x => x.pair[0].revision++, x => x.decision.reason += " changed", x => x.decision.fields.title = "left"]) { const x = structuredClone(v); change(x); assert.notEqual(planContactReconciliation(x).sha256, sha256); }
});
test("reference input order has one canonical plan, while pair orientation remains explicit", () => {
  const v = fixture(); v.references = [ref({ id: "z", contactId: "left" }), ref({ id: "a", contactId: "left" })];
  const p = planContactReconciliation(v); v.references.reverse(); assert.deepEqual(planContactReconciliation(v), p);
  v.pair.reverse(); assert.notEqual(planContactReconciliation(v).sha256, p.sha256);
});
test("valid multiline purpose and Unicode remain exact with no invented contact details", () => {
  const v = fixture(); for (const r of v.pair) r.data.purpose = "Fictional scheduling\nSecond line 🌱";
  const p = planContactReconciliation(v); assert.equal(p.proposal.survivorData.purpose, v.pair[0].data.purpose);
  assert.equal(p.proposal.survivorData.email, null); assert.equal(p.proposal.survivorData.displayLabel, null);
});
test("work bounds refuse oversize comparisons rather than pretending a complete inventory", () => {
  const v = fixture(); v.references = Array.from({ length: 129 }, (_, i) => ref({ id: "reference_" + i })); rejects(v, "contact_reconciliation_limit");
  const x = fixture(); x.decision.reason = "x".repeat(501); rejects(x);
});
test("hostile owned values reject with zero proxy/getter/prototype hook invocations", () => {
  let hooks = 0; const traps = new Proxy({}, { getPrototypeOf() { hooks++; throw Error("trap"); }, ownKeys() { hooks++; throw Error("trap"); }, get() { hooks++; throw Error("trap"); } });
  rejects(traps, "contact_reconciliation_owned");
  const v = fixture(); Object.defineProperty(v.decision, "reason", { enumerable: true, get() { hooks++; throw Error("getter"); } }); rejects(v, "contact_reconciliation_owned");
  const inherited = Object.create(traps); rejects(inherited, "contact_reconciliation_owned"); assert.equal(hooks, 0);
});
test("sparse compensated arrays, symbols, hidden data and cycles refuse inertly", () => {
  for (const key of ["4294967295", "999999999999999999999999", "01", "-0", "1e0"]) { const v = fixture(), a = Array(1); Object.defineProperty(a, key, { value: ref(), enumerable: true }); v.references = a; rejects(v, "contact_reconciliation_owned"); }
  for (const mutate of [v => Object.defineProperty(v, "hidden", { value: 1 }), v => v[Symbol("x")] = 1, v => v.loop = v]) { const v = fixture(); mutate(v); rejects(v, "contact_reconciliation_owned"); }
});
