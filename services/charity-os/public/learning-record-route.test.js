import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { api, ApiError } from "./api.js";
import { can } from "./model.js";
import { learningRecordFromFragment, learningRecordFragment, learningRecordMatches, resolveLearningRecordRoute } from "./learning-model.js";
import { learningTestDOM } from "./learning-test-dom.js";

const appSource = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const detailSource = appSource.slice(appSource.indexOf("async function renderDetail("), appSource.indexOf("\n// Tokens and exact interrupted commands"));
const module = { id: "outcomes", title: "Outcomes", fields: [], roles: { read: ["owner", "program_lead"], write: [] } };
const membership = (id, role = "program_lead") => ({ id, role, name: `Fictional ${id}` });

function mountedStandardDetail(t, fetcher) {
  const dom = learningTestDOM(), priorFetch = globalThis.fetch; globalThis.fetch = fetcher;
  const content = dom.document.createElement("main"); dom.document.body.append(content);
  const state = { org: "org-A", session: { user: { id: "staff" } }, epoch: 1, members: [] }, location = { hash: "" };
  function node(tag, attrs = {}, ...children) { const element = dom.document.createElement(tag); for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined) element.setAttribute(key, value); for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) element.append(child instanceof dom.Element ? child : String(child)); return element; }
  const context = {
    state, location, api, ApiError, can, learningRecordMatches,
    safeRoute: () => location.hash.slice(1), moduleById: () => module, role: () => state.currentRole,
    referenceOptions: async () => new Map(), recordTitle: (record) => record.data.title,
    link: (text, href) => node("a", { href }, text), node, tag: (text) => node("span", {}, text),
    stateLabel: (module, state) => state, ownerName: () => "Fictional staff", labelFor: (text) => text,
    renderWorkflow: () => node("p", {}, "Existing ordinary workflow"), renderHistory: () => node("p"), renderComments: () => node("p"), renderReminder: () => node("p"),
    heading: (eyebrow, title) => node("h1", {}, title), formatDate: (text) => text,
    setContent: (...children) => content.replaceChildren(...children),
  };
  vm.runInNewContext(`${detailSource}\nglobalThis.standardDetail = renderDetail;`, context);
  t.after(() => { globalThis.fetch = priorFetch; dom.restore(); });
  return { ...dom, state, location, content, async open(fragment, isCurrent = () => true) {
    location.hash = fragment;
    const resolved = await resolveLearningRecordRoute({ fragment, api, isCurrent, canRead: (id, role) => id === module.id && can(module, "read", role), signal: new AbortController().signal });
    state.org = resolved.target.orgId; state.session = resolved.session; state.currentRole = resolved.org.role;
    await context.standardDetail(resolved.target.moduleId, resolved.target.recordId, state.epoch);
  } };
}

test("org-pinned fragments are closed ASCII identities with exact segments and canonical encoding", () => {
  assert.deepEqual(learningRecordFromFragment("#learning-record/org-A/outcomes/shared-ID"), { orgId: "org-A", moduleId: "outcomes", recordId: "shared-ID" });
  assert.equal(learningRecordFragment("org-A", "outcomes", "shared-ID"), "#learning-record/org-A/outcomes/shared-ID");
  for (const value of ["#learning-record/org-A/outcomes/shared-ID/extra", "#learning-record/org-A/outcomes/shared-ID?org=org-B", "#learning-record/org-A/outcomes/shared-ID#other", "#learning-record/org-A/finance/shared-ID", "#learning-record/org-A/outcomes/", "#learning-record/org-A/outcomes/%73hared-ID", "#learning-record/org%2DA/outcomes/shared-ID", "#learning-record/org-A/outcomes/%2573hared-ID", "#learning-record/org-A/outcomes/a%2Fb", "#learning-record/org-A/outcomes/%ZZ", "#%6cearning-record/org-A/outcomes/shared-ID", "#learning-record//org-A/outcomes/shared-ID"]) assert.throws(() => learningRecordFromFragment(value), /malformed/);
  assert.equal(learningRecordMatches("#learning-record/org-B/outcomes/shared-ID", "org-A", "outcomes", "shared-ID"), false);
});

test("actual mounted standard detail and API use exact org when two authorized tenants share one restored record ID", async (t) => {
  const requests = [];
  const h = mountedStandardDetail(t, async (path) => {
    requests.push(path);
    assert.notEqual(path, "/api/orgs", "The actual service has no organization-list GET endpoint.");
    const body = path === "/api/session" ? { user: { id: "staff" }, csrfToken: "current", orgs: [membership("org-A"), membership("org-B")] } : { record: { id: "shared-ID", orgId: path.includes("org-B") ? "org-B" : "org-A", moduleId: "outcomes", data: { title: path.includes("org-B") ? "B exact target" : "A exact target" }, status: "approved", revision: 3, createdAt: "2026-10-27", updatedAt: "2026-10-27" } };
    return { ok: true, async json() { return body; } };
  });
  await h.open("#learning-record/org-B/outcomes/shared-ID");
  assert.equal(h.state.org, "org-B"); assert.match(h.content.textContent, /B exact target/); assert.doesNotMatch(h.content.textContent, /A exact target/);
  assert.equal(requests.at(-1), "/api/orgs/org-B/modules/outcomes/records/shared-ID");
  await h.open("#learning-record/org-A/outcomes/shared-ID"); assert.match(h.content.textContent, /A exact target/); assert.equal(requests.at(-1), "/api/orgs/org-A/modules/outcomes/records/shared-ID");
  assert.equal(requests.filter((path) => path === "/api/session").length, 2, "Each pinned navigation reloads actual session memberships.");
});

test("stale/revoked/unknown membership or role refuses before any ordinary record lookup and never falls back", async (t) => {
  const requests = [], h = mountedStandardDetail(t, async (path) => {
    requests.push(path); assert.equal(path, "/api/session");
    return { ok: true, async json() { return { user: { id: "staff" }, orgs: [membership("org-A"), membership("org-B", "unknown-role")] }; } };
  });
  for (const fragment of ["#learning-record/org-B/outcomes/shared-ID", "#learning-record/no-membership/outcomes/shared-ID"]) await assert.rejects(h.open(fragment), (error) => error.status === 403);
  assert.equal(requests.some((path) => path.includes("/modules/")), false); assert.equal(h.state.org, "org-A"); assert.equal(h.content.textContent, "");
});

test("actual standard record permission and backend refusal remain authoritative after route membership resolution", async (t) => {
  const h = mountedStandardDetail(t, async (path) => {
    if (path.includes("/modules/")) return { ok: false, status: 403, async json() { return { ok: false, code: "forbidden", message: "Standard record permission refused" }; } };
    assert.equal(path, "/api/session");
    return { ok: true, async json() { return { user: { id: "staff" }, orgs: [membership("org-B")] }; } };
  });
  await assert.rejects(h.open("#learning-record/org-B/outcomes/shared-ID"), (error) => error.status === 403 && error.message === "Standard record permission refused");
  assert.equal(h.content.textContent, "");
});

test("late membership response cannot select org or mount a detail under a new route/auth epoch", async (t) => {
  let current = true, resolve;
  const h = mountedStandardDetail(t, async (path) => {
    assert.equal(path, "/api/session");
    return new Promise((done) => { resolve = () => done({ ok: true, async json() { return { user: { id: "staff" }, orgs: [membership("org-B")] }; } }); });
  });
  const pending = h.open("#learning-record/org-B/outcomes/shared-ID", () => current);
  while (!resolve) await Promise.resolve(); current = false; resolve(); await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(h.state.org, "org-A"); assert.equal(h.content.textContent, "");
  assert.match(appSource, /window\.open\(learningRecordFragment\(org, moduleId, recordId\), "_blank", "noopener,noreferrer"\)/);
  assert.match(appSource, /await renderDetail\(resolved\.target\.moduleId, resolved\.target\.recordId, current\)/);
});

test("missing or malformed fresh session memberships never fall back to a remembered organization", async (t) => {
  const requests = [];
  let memberships;
  const h = mountedStandardDetail(t, async (path) => {
    requests.push(path); assert.equal(path, "/api/session");
    return { ok: true, async json() { return { user: { id: "staff" }, ...(memberships === undefined ? {} : { orgs: memberships }) }; } };
  });
  for (memberships of [undefined, null, {}, [membership("org-B"), membership("org-B")]]) {
    await assert.rejects(h.open("#learning-record/org-B/outcomes/shared-ID"), /memberships could not be verified|unavailable to your current membership/);
    assert.equal(h.state.org, "org-A"); assert.equal(h.content.textContent, "");
  }
  assert.equal(requests.length, 4);
});
