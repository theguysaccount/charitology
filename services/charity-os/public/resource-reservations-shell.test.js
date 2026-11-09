import test from "node:test";
import assert from "node:assert/strict";
import { learningTestDOM } from "./learning-test-dom.js";

const orgA = "fictional_reservation_org_a", orgB = "fictional_reservation_org_b";
const feature = { resourceReservations: true };
const csrfToken = "fictional-staff-csrf";
const scopeSha256 = "a".repeat(64);
const asset = { id: "room_a", revision: 3, title: "Fictional Room A", quantity: 1 };
const session = { id: "session_a", revision: 2, title: "Fictional Session A", interval: {
  startAt: "2027-04-06T10:00:00-04:00", endAt: "2027-04-06T11:00:00-04:00", timeZone: "America/New_York",
} };
const workspace = { ok: true, version: 1, orgId: orgA, scopeSha256,
  assets: [asset], sessions: [session], reservations: [] };
const preview = { previewToken: "fictional-preview." + "p".repeat(43), reviewSha256: "b".repeat(64),
  expiresAtExact: "2027-04-01T12:10:00.000000Z" };
const org = (id, role = "owner", programIds = []) => ({ id, role, programIds, name: id });
const good = json => Response.json({ ok: true, ...json });
const refused = status => Response.json({ ok: false, code: "scope", message: "Current access is unavailable." }, { status });
const deferred = () => { let resolve; const value = new Promise(done => { resolve = done; }); return { value, resolve }; };
let instance = 0;

async function until(check, label = "mounted shell update") {
  for (let turn = 0; turn < 80; turn++) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail("Missing " + label);
}

function installShell({ membership = org(orgA), features = feature, route = "resource-reservations", override } = {}) {
  const dom = learningTestDOM();
  const { document, window, Element } = dom;
  const prototype = Element.prototype, setAttribute = prototype.setAttribute;
  prototype.setAttribute = function (key, value) {
    setAttribute.call(this, key, value);
    if (key.startsWith("data-")) this.dataset[key.slice(5)] = String(value);
  };
  Object.defineProperty(prototype, "dataset", { get() { return this.shellDataset ??= {}; } });
  prototype.prepend = function (...children) { this.replaceChildren(...children, ...this.children); };
  prototype.showModal = function () { this.open = true; };
  prototype.close = function () { this.open = false; return this.emit("close"); };
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => selector.split(" ").reduce((node, part) => node?.querySelector(part), document.body);
  document.documentElement = document.createElement("html");
  for (const id of ["account", "announcement", "auth-screen", "connecting", "content", "editor-cancel",
    "editor-close", "editor-dialog", "editor-form", "module-nav", "module-search", "nav-toggle", "new-org",
    "org-switch", "sidebar", "sign-in-form", "sync-state", "theme-toggle", "toast", "workspace", "workspace-context",
    "confirm-action", "confirm-description", "confirm-dialog", "confirm-title"]) {
    const el = document.createElement(id === "org-switch" ? "select" : "div");
    el.setAttribute("id", id);
    if (id === "module-search") el.value = "";
    dom.mount(el);
  }
  const nav = document.createElement("nav"); nav.className = "secondary-nav"; dom.mount(nav);
  const calls = [], timers = new Set();
  const location = new URL("https://fictional-shell.invalid/#" + route);
  const names = ["fetch", "location", "history", "setTimeout", "innerWidth", "localStorage", "sessionStorage"];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  Object.assign(globalThis, {
    location, history: { replaceState: (_a, _b, path) => { location.hash = path; } }, innerWidth: 900,
    localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout(fn, time, ...args) {
      const timer = previous.setTimeout(fn, time, ...args); timers.add(timer); return timer;
    },
    async fetch(path, options) {
      const method = options.method;
      const call = { path, method, body: options.body, signal: options.signal, headers: options.headers };
      calls.push(call);
      const changed = override?.(call);
      if (changed !== undefined) return changed;
      if (path === "/api/session") return good({ user: { id: "staff_a", email: "staff@example.invalid" },
        csrfToken, orgs: [membership, org(orgB)] });
      if (path === "/api/modules") return good({ modules: ["assets", "events"].map(id => ({
        id, title: id, description: id, roles: { read: ["owner", "admin", "contributor"], write: ["owner", "admin"] },
      })) });
      if (path === "/api/orgs/" + orgA) return good({ org: membership, features });
      if (path === "/api/orgs/" + orgB) return good({ org: org(orgB) });
      if (/^\/api\/orgs\/[^/]+\/members$/.test(path)) return good({ members: [] });
      if (/^\/api\/orgs\/[^/]+\/dashboard$/.test(path)) return good({ counts: { assets: 0, events: 0 } });
      if (path.endsWith("/resource-reservations/workspace")) return Response.json(workspace);
      if (path.endsWith("/resource-reservations/review")) return good({ version: 1, orgId: orgA, scopeSha256,
        state: "ready", input: JSON.parse(call.body), previous: null,
        next: { id: "next_hold", proofSha256: "c".repeat(64), asset, session }, preview });
      return refused(404);
    },
  });
  const query = selector => document.querySelector(selector);
  const button = label => document.querySelectorAll("button").find(item => item.textContent === label);
  const navLink = () => query('[data-nav="resource-reservations"]');
  return {
    query, button, navLink, calls, location, document, window,
    async start() { await import("./app.js?shell-test=" + (++instance)); },
    async changeHash(hash) { location.hash = hash; await window.emit("hashchange"); },
    async selectOrg(id) { const control = query("#org-switch"); control.value = id; await control.emit("change", { target: control }); },
    async choose(key, value) { const el = query('[data-reservation="' + key + '"]'); el.value = value; await el.emit("change"); },
    async checkAck() { const el = query('[data-reservation="ack"]'); el.checked = true; await el.emit("change"); },
    restore() { for (const timer of timers) clearTimeout(timer); Object.assign(globalThis, previous); dom.restore(); },
  };
}

const privateCalls = shell => shell.calls.filter(call => call.path.includes("/resource-reservations/"));
const isMounted = shell => !!shell.query(".resource-reservations");
const isDenied = shell => shell.query("#content").textContent.includes("This view could not be loaded.");
const refresh = "Refresh saved holds", commit = "Record reviewed reservation decision";
const retry = "Retry the same reservation command";

test("direct hash and menu require an exact fresh flag plus unrestricted local membership", async () => {
  for (const options of [
    { features: {} }, { features: { resourceReservations: "true" } },
    { membership: org(orgA, "owner", ["fictional_program"]) }, { membership: org(orgA, "contributor") },
  ]) {
    const shell = installShell(options);
    try {
      await shell.start();
      await until(() => isDenied(shell));
      assert.equal(shell.navLink().hidden, true);
      assert.equal(isMounted(shell), false);
      assert.deepEqual(privateCalls(shell), []);
      assert.equal(shell.calls.some(call => call.path === "/api/orgs/" + orgA), !options.membership);
    } finally { shell.restore(); }
  }
});

test("actual shell protects exact pending Retry across hash, organization and visibility changes until access is lost", async () => {
  let attempts = 0;
  const shell = installShell({ override: call => {
    if (!call.path.endsWith("/resource-reservations/commit")) return;
    if (++attempts === 1) return Promise.reject(new TypeError("Fictional lost response."));
    return refused(403);
  } });
  try {
    await shell.start();
    await until(() => isMounted(shell));
    assert.equal(shell.navLink().hidden, false);
    assert.equal(shell.navLink().getAttribute("aria-current"), "page");
    assert.deepEqual(privateCalls(shell), []);
    await shell.button(refresh).click();
    await shell.choose("asset", asset.id);
    await shell.choose("session", session.id);
    await shell.button("Review selected decision").click();
    await shell.checkAck();
    await shell.button(commit).click();
    assert.equal(attempts, 1);
    assert.match(shell.query("#content").textContent, /result is uncertain/i);
    await shell.changeHash("#home");
    assert.equal(shell.location.hash, "#resource-reservations");
    await shell.selectOrg(orgB);
    assert.equal(shell.query("#org-switch").value, orgA);
    assert.equal(isMounted(shell), true);
    await shell.window.emit("pagehide");
    assert.equal(shell.button(retry)?.disabled ?? true, true);
    assert.doesNotMatch(shell.query("#content").textContent, /Fictional Room A/);
    await shell.window.emit("pageshow");
    assert.equal(attempts, 1);
    await shell.button(refresh).click();
    await shell.button(retry).click();
    assert.equal(attempts, 2);
    const commits = privateCalls(shell).filter(call => call.path.endsWith("/commit"));
    assert.equal(commits[0].body, commits[1].body);
    assert.equal(commits[1].headers["X-CSRF-Token"], csrfToken);
    assert.equal(isMounted(shell), false);
    assert.equal(shell.navLink().hidden, true);
    assert.match(shell.query("#content").textContent, /Reservation access changed/);
    assert.doesNotMatch(shell.query("#content").textContent, /Fictional Room A|Retry the same/);
    await shell.selectOrg(orgB);
    assert.equal(shell.query("#workspace-context").textContent, orgB + " / Owner");
  } finally { shell.restore(); }
});

test("switching organizations aborts and scrubs an old read before a late result can appear", async () => {
  const late = deferred();
  const shell = installShell({ override: call => call.path.endsWith("/resource-reservations/workspace") ? late.value : undefined });
  try {
    await shell.start();
    await until(() => isMounted(shell));
    const read = shell.button(refresh).click();
    await until(() => privateCalls(shell).length === 1);
    await shell.selectOrg(orgB);
    assert.equal(privateCalls(shell)[0].signal.aborted, true);
    assert.equal(isMounted(shell), false);
    late.resolve(Response.json(workspace));
    await read;
    assert.doesNotMatch(shell.query("#content").textContent, /Fictional Room A/);
    await shell.changeHash("#resource-reservations");
    await until(() => isDenied(shell));
    assert.equal(shell.navLink().hidden, true);
    assert.equal(privateCalls(shell).length, 1);
  } finally { late.resolve(Response.json(workspace)); shell.restore(); }
});

test("actual staff app opens the handoff path only from a true verified session capability and unrestricted Volunteers role", async () => {
  const rosterPath = "/api/orgs/" + orgA + "/participation-targets";
  const optionsPath = "/api/orgs/" + orgA + "/volunteer-substitutions/shifts/shift_a/confirmed_a";
  const terms = { title: "Fictional shift", kind: "shift", startAt: "2099-01-01T12:00:00Z",
    endAt: "2099-01-01T13:00:00Z", timeZone: "UTC", participationPurpose: "Fictional organizers" };
  const target = { targetId: "shift_a", moduleId: "volunteers", mode: "managed", revision: 2, terms };
  const confirmed = { id: "confirmed_a", targetId: target.targetId, moduleId: target.moduleId, state: "confirmed",
    source: "intake", revision: 3, recovered: false, intakeId: "intake_a", requestedInterval: null };
  for (const [capability, programs, permitted] of [[undefined, [], false], ["true", [], false],
    [true, ["restricted_program"], false], [true, [], true]]) {
    const membership = org(orgA, "program_lead", programs);
    const shell = installShell({ membership, route: "participation/shift_a", override: call => {
      if (call.path === "/api/session") return good({ user: { id: "fictional_staff", email: "fictional@example.invalid" },
        csrfToken, orgs: [membership], ...(capability === undefined ? {} : { volunteerSubstitutions: capability }) });
      if (call.path === "/api/modules") return good({ modules: [{ id: "volunteers", title: "Volunteers",
        description: "Fictional volunteers", roles: { read: ["program_lead"], write: ["program_lead"] } }] });
      if (call.path === rosterPath) return good({ targets: [target] });
      if (call.path === rosterPath + "/shift_a") return good({ target, terms, currentSourceRevision: 7, sourceApproved: true, occupied: 1 });
      if (call.path === rosterPath + "/shift_a/participations") return good({ participations: [confirmed] });
      if (call.path === optionsPath) return good({ options: { version: 1, shift: { id: target.targetId,
        revision: 7, title: terms.title, startsAt: "2099-01-01T12:00:00.000000Z", endsAt: "2099-01-01T13:00:00.000000Z",
        timeZone: "UTC" }, outgoing: { id: confirmed.id, revision: confirmed.revision, label: "Fictional confirmed" },
        replacement: null, offer: null } });
    } });
    try {
      await shell.start();
      await until(() => shell.query("#content").textContent.includes("Participation ledger"));
      const open = shell.button("Review shift handoff options");
      assert.equal(!!open, permitted);
      assert.equal(shell.calls.some(call => call.path.includes("/volunteer-substitutions/")), false);
      if (permitted) {
        await open.click();
        assert.match(shell.query("#content").textContent, /no eligible replacement/);
        assert.equal(shell.calls.filter(call => call.path === optionsPath).length, 1);
      }
    } finally { shell.restore(); }
  }
});
