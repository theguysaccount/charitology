import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { parseReceipt, typedAnswer } from "./participant.js";

const html = await readFile(
  new URL("./participant.html", import.meta.url),
  "utf8",
);
const source = await readFile(
  new URL("./participant.js", import.meta.url),
  "utf8",
);
const origin = "https://os.example.invalid";
const token = "a".repeat(43);
const code = `org.pub.${token}`;
const verified = {
  id: "synthetic-user",
  email: "fiction@example.invalid",
  emailVerified: true,
};
const detail = () => ({
  orgId: "org",
  id: "request",
  publicationId: "pub",
  organizationName: "Fictional organization",
  title: "Fictional request",
  status: "pending",
  revision: 1,
  erasedAt: null,
  editable: true,
  editUnavailableReason: null,
  linkedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  answers: {
    name: "Fictional Person",
    email: verified.email,
    count: 0,
    available: false,
  },
  publication: {
    title: "Fictional request",
    purpose: "Arrange a reply about this request.",
    retentionUntil: "2099-01-01",
    kind: "contact",
    consentText: "I agree to this collection purpose.",
    questions: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "text", required: true },
      { key: "count", label: "Count", type: "number", required: true },
      { key: "available", label: "Available", type: "boolean", required: true },
    ],
  },
});
const participation = (patch = {}) => ({
  id: "participation",
  state: "requested",
  revision: 1,
  targetRevision: 2,
  sourceRevision: 7,
  termsHash: "a".repeat(64),
  terms: {
    title: "Fictional whole shift",
    kind: "shift",
    startAt: "2099-01-01T23:00:00Z",
    endAt: "2099-01-02T03:00:00Z",
    timeZone: "UTC",
    participationPurpose: "Help with a fictional event.",
    participantInstructions: "Read the organizer's public instructions.",
    organizerEmail: "organizer@example.invalid",
    organizerUrl: "https://example.invalid/contact",
  },
  frozenTerms: null,
  consent: null,
  canConsent: true,
  consentUnavailableReason: null,
  canCancel: true,
  recovered: false,
  notifications: {
    enabled: false,
    preferenceOnly: true,
    requested: false,
    state: "paused",
  },
  ...patch,
});

test("participant receipts accept only the intended same-origin fragment capability", () => {
  for (const value of [
    code,
    `#${code}`,
    `${origin}/p/receipt#${code}`,
    `${origin}/participant#${code}`,
  ])
    assert.deepEqual(parseReceipt(value, origin), ["org", "pub", token]);
  for (const value of [
    `${origin}/participant?receipt=x#${code}`,
    `https://other.example.invalid/p/receipt#${code}`,
    `https://user@os.example.invalid/p/receipt#${code}`,
    `${origin}/p/org.pub#${code}`,
    `${origin}/participant#${code}.extra`,
    code.slice(0, -1),
    `org.pub.${token}a`,
    `${origin}/participant?path=participant#${code}`,
    `${origin}/participant#org.pub.%61${token.slice(1)}`,
  ])
    assert.throws(() => parseReceipt(value, origin));
});

test("participant corrections preserve unknown, zero and false and reject invalid bounded answers", () => {
  for (const [question, value, expected] of [
    [{ type: "number" }, "0", 0],
    [{ type: "boolean" }, "false", false],
    [{ type: "boolean" }, "true", true],
    [{ type: "number" }, "", null],
    [{ type: "number" }, "  ", null],
    [{ type: "number" }, "1e9", 1e9],
    [{ type: "date" }, "2028-02-29", "2028-02-29"],
    [{ type: "select", options: ["A", "B"] }, "B", "B"],
    [{ type: "text", key: "name" }, " Person ", "Person"],
  ])
    assert.equal(
      typedAnswer({ ...question, label: "Answer" }, value),
      expected,
    );
  for (const [question, value] of [
    [{ type: "number" }, "Infinity"],
    [{ type: "number" }, "1000000001"],
    [{ type: "number", required: true }, " "],
    [{ type: "boolean" }, "0"],
    [{ type: "boolean", required: true }, ""],
    [{ type: "date" }, "2027-02-29"],
    [{ type: "date" }, "2026-02-30"],
    [{ type: "select", options: ["A"] }, "B"],
    [{ type: "text", key: "name" }, "x".repeat(181)],
    [{ type: "text", key: "email" }, "x".repeat(255)],
    [{ type: "text", key: "note" }, "x".repeat(301)],
    [{ type: "text", required: true }, " "],
  ])
    assert.throws(() => typedAnswer({ ...question, label: "Answer" }, value));
});

test("without JavaScript the manual receipt cannot become a native GET query parameter", () => {
  const input = html.match(
    /<input\b[^>]*\bid="participant-receipt"[^>]*>/,
  )?.[0];
  const submit = html.match(
    /<button\b[^>]*\bid="participant-use-receipt"[^>]*>/,
  )?.[0];
  assert.ok(input && submit);
  assert.doesNotMatch(
    input,
    /\bname\s*=/i,
    "A raw receipt must never be a successful native form control.",
  );
  assert.match(input, /\bdisabled\b/);
  assert.match(submit, /\bdisabled\b/);
  assert.match(html, /<noscript\b/);
});

// This is an actual-client state harness, not a browser or authentication test.
// It supplies a minimal DOM and synthetic transport; native validation/layout,
// Better Auth verification and Postgres ownership require separate acceptance.
async function harness({
  user = verified,
  linked = true,
  fragment = false,
  participations = [],
} = {}) {
  let document;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.handlers = new Map();
      this.disabled = false;
      this.hidden = false;
      this.checked = false;
      this.selected = false;
      this.readOnly = false;
      this._value = undefined;
      this.isConnected = false;
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === "id") this.id = String(value);
      if (key === "value") this.value = value;
      if (
        [
          "disabled",
          "hidden",
          "checked",
          "selected",
          "required",
          "readOnly",
        ].includes(key)
      )
        this[key] = true;
    }
    get classList() {
      const element = this;
      return {
        contains(name) {
          return (element.attributes.class || "").split(/\s+/).includes(name);
        },
        toggle(name, enabled) {
          const values = new Set(
            (element.attributes.class || "").split(/\s+/).filter(Boolean),
          );
          if (enabled) values.add(name);
          else values.delete(name);
          element.attributes.class = [...values].join(" ");
        },
      };
    }
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.tagName === "SELECT") {
        const options = this.querySelectorAll("option");
        return (
          (options.find((option) => option.selected) || options[0])?.value || ""
        );
      }
      return "";
    }
    set value(value) {
      this._value = String(value);
    }
    connect(on) {
      this.isConnected = on;
      for (const child of this.children)
        if (child instanceof Element) child.connect(on);
    }
    append(...children) {
      for (const child of children.flat(Infinity)) {
        if (child instanceof Element) {
          if (child.parentElement)
            child.parentElement.children = child.parentElement.children.filter(
              (entry) => entry !== child,
            );
          child.parentElement = this;
          child.connect(this.isConnected);
        }
        this.children.push(child);
      }
    }
    prepend(...children) {
      const tail = [...this.children];
      this.replaceChildren(...children, ...tail);
    }
    replaceChildren(...children) {
      for (const child of this.children)
        if (child instanceof Element) {
          child.connect(false);
          child.parentElement = null;
        }
      this.children = [];
      this.append(...children);
    }
    addEventListener(type, fn) {
      const listeners = this.handlers.get(type) || [];
      listeners.push(fn);
      this.handlers.set(type, listeners);
    }
    async emit(type, fields = {}) {
      const event = { currentTarget: this, preventDefault() {}, ...fields };
      for (const listener of this.handlers.get(type) || [])
        await listener(event);
    }
    querySelectorAll(selector) {
      const selectors = selector.split(",").map((entry) => entry.trim());
      const matches = (element, simple) =>
        simple.startsWith("#")
          ? element.id === simple.slice(1)
          : simple.startsWith(".")
            ? element.classList.contains(simple.slice(1))
            : element.tagName === simple.toUpperCase();
      const result = [];
      const visit = (element) => {
        for (const child of element.children)
          if (child instanceof Element) {
            if (
              selectors.some((entry) => {
                const parts = entry.split(/\s+/);
                if (!matches(child, parts.at(-1))) return false;
                let ancestor = child.parentElement;
                for (let n = parts.length - 2; n >= 0; n--) {
                  while (ancestor && !matches(ancestor, parts[n]))
                    ancestor = ancestor.parentElement;
                  if (!ancestor) return false;
                  ancestor = ancestor.parentElement;
                }
                return true;
              })
            )
              result.push(child);
            visit(child);
          }
      };
      visit(this);
      return result;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (entry) => entry !== this,
        );
      this.parentElement = null;
      this.connect(false);
    }
    focus() {
      document.activeElement = this;
    }
    scrollIntoView() {}
    reportValidity() {
      return true;
    }
    get textContent() {
      return this.children
        .map((child) =>
          child instanceof Element ? child.textContent : String(child),
        )
        .join(" ");
    }
    set textContent(value) {
      this.replaceChildren(String(value));
    }
  }
  const root = new Element("document");
  root.connect(true);
  const stack = [root],
    voidTags = new Set(["meta", "link", "input", "img", "br", "hr"]);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g)) {
    const text = match[0];
    if (text.startsWith("<!")) continue;
    if (text.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (!text.startsWith("<")) {
      stack.at(-1).append(text);
      continue;
    }
    const opening = /^<([\w-]+)([\s\S]*?)\/?\s*>$/.exec(text);
    if (!opening) continue;
    const element = new Element(opening[1]);
    for (const attribute of opening[2].matchAll(
      /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    ))
      element.setAttribute(
        attribute[1],
        attribute[2] ?? attribute[3] ?? attribute[4] ?? "",
      );
    stack.at(-1).append(element);
    if (!voidTags.has(opening[1].toLowerCase()) && !text.endsWith("/>"))
      stack.push(element);
  }
  const events = new Map();
  document = {
    visibilityState: "visible",
    activeElement: null,
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => String(text),
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    addEventListener(type, fn) {
      events.set(type, fn);
    },
  };
  const location = new URL(
    `${origin}/participant${fragment ? `#${code}` : ""}`,
  );
  const calls = [],
    model = {
      user: user && structuredClone(user),
      linked,
      detail: detail(),
      sessionFailure: false,
      sessionGate: null,
      detailGate: null,
      participations: structuredClone(participations),
      participationGate: null,
    };
  const response = (value, status = 200) =>
    new Response(JSON.stringify({ ok: status < 400, ...value }), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetch = async (path, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, options, body });
    if (path === "/api/participant/session") {
      if (model.sessionGate) await model.sessionGate;
      if (model.sessionFailure)
        throw new Error("Synthetic connection interrupted");
      return response({
        user: model.user,
        ...(model.user ? { csrfToken: "synthetic-csrf" } : {}),
      });
    }
    if (path === "/api/auth/request-link") return response({ accepted: true });
    if (path === "/api/auth/logout") {
      model.user = null;
      return response({});
    }
    if (path.startsWith("/api/participant/requests"))
      return response({
        requests: model.linked
          ? [{ ...model.detail, answers: undefined, publication: undefined }]
          : [],
        nextCursor: null,
      });
    const participationBase =
      "/api/participant/orgs/org/requests/request/participations";
    if (path === participationBase) {
      const snapshot = structuredClone(model.participations);
      if (model.participationGate) await model.participationGate;
      return response({ participations: snapshot });
    }
    if (path.startsWith(`${participationBase}/`)) {
      const [, pid, action] = path.slice(participationBase.length).split("/");
      const old = model.participations.find((row) => row.id === pid);
      if (!old) throw new Error("Unknown synthetic participation");
      const next = { ...old, revision: old.revision + 1 };
      if (action === "cancel") {
        next.state = "cancelled";
        next.canCancel = false;
        next.canConsent = false;
      } else if (action === "consent") {
        next.consent = {
          revision: 1,
          at: "2026-01-02T00:00:00.000Z",
          waitlistAllowed: body.waitlistAllowed,
          emailUpdates: body.emailUpdates,
          sourceRevision: body.sourceRevision,
          termsHash: body.termsHash,
        };
        next.notifications = {
          ...old.notifications,
          requested: body.emailUpdates,
        };
      } else if (action === "preferences") {
        next.notifications = {
          ...old.notifications,
          requested: body.emailUpdates,
        };
      } else throw new Error("Unknown synthetic participation action");
      model.participations = model.participations.map((row) =>
        row.id === pid ? next : row,
      );
      return response({ participation: next });
    }
    if (path.endsWith("/link")) {
      model.linked = true;
      return response({ request: model.detail });
    }
    if (path.endsWith("/correct")) {
      model.detail = {
        ...model.detail,
        answers: body.answers,
        revision: model.detail.revision + 1,
      };
      return response({ request: model.detail });
    }
    if (path.endsWith("/withdraw")) {
      model.detail = {
        ...model.detail,
        status: "cancelled",
        editable: false,
        revision: model.detail.revision + 1,
      };
      return response({ request: model.detail });
    }
    if (path.endsWith("/erase")) {
      model.detail = {
        ...model.detail,
        answers: {},
        erasedAt: "2026-01-02T00:00:00.000Z",
        status: "dismissed",
        editable: false,
        revision: model.detail.revision + 1,
      };
      return response({ request: model.detail });
    }
    if (path.endsWith("/unlink")) {
      model.linked = false;
      return response({ unlinked: true });
    }
    if (path === "/api/participant/orgs/org/requests/request") {
      const snapshot = structuredClone(model.detail),
        wasLinked = model.linked;
      if (model.detailGate) await model.detailGate;
      return wasLinked
        ? response({ request: snapshot })
        : response({ code: "request", message: "Unavailable" }, 404);
    }
    throw new Error(`Unexpected synthetic endpoint ${path}`);
  };
  const windowEvents = new Map();
  const context = vm.createContext({
    document,
    Node: Element,
    location,
    history: {
      replaceState(_state, _title, path) {
        location.href = new URL(path, location).href;
      },
    },
    window: {
      addEventListener(type, fn) {
        windowEvents.set(type, fn);
      },
    },
    fetch,
    AbortSignal,
    TextEncoder,
    URL,
    crypto: webcrypto,
    console,
  });
  vm.runInContext(source.replace(/^export /gm, ""), context);
  const flush = async () => {
    for (let n = 0; n < 12; n++)
      await new Promise((resolve) => setImmediate(resolve));
  };
  await flush();
  const get = (id) => document.querySelector(`#${id}`);
  const click = async (label, inElement = root) => {
    const button = inElement
      .querySelectorAll("button")
      .find((entry) => entry.textContent.trim() === label);
    assert.ok(button, `Button exists: ${label}`);
    await button.emit("click");
    await flush();
    return button;
  };
  const open = () => click("Open this request");
  const refresh = () => vm.runInContext("refreshSession(true)", context);
  return {
    get,
    root,
    model,
    calls,
    document,
    location,
    context,
    flush,
    click,
    open,
    refresh,
    events,
    windowEvents,
  };
}

test("the original signed-out tab keeps its fragment and sends only the allowlisted login destination", async () => {
  const h = await harness({ user: null, linked: false, fragment: true });
  assert.deepEqual(
    h.calls.map((call) => call.path),
    ["/api/participant/session"],
  );
  h.get("participant-email").value = verified.email;
  await h.get("participant-login-form").emit("submit");
  await h.flush();
  const login = h.calls.find((call) => call.path === "/api/auth/request-link");
  assert.deepEqual(login.body, {
    email: verified.email,
    destination: "participant",
  });
  assert.equal(h.location.hash, `#${code}`);
  assert.equal(h.get("participant-claim-button").disabled, true);
  assert.equal(
    h.calls.some((call) => call.path.endsWith("/link")),
    false,
  );
  assert.equal(JSON.stringify(login).includes(token), false);
});

test("a verified session still needs explicit claim consent; success clears the capability and renders zero/false", async () => {
  const h = await harness({ linked: false, fragment: true });
  await h.get("participant-claim-button").emit("click");
  await h.flush();
  assert.equal(
    h.calls.some((call) => call.path.endsWith("/link")),
    false,
  );
  h.get("participant-claim-consent").checked = true;
  await h.get("participant-claim-button").emit("click");
  await h.flush();
  const claim = h.calls.find((call) => call.path.endsWith("/link"));
  assert.deepEqual(claim.body, { receipt: token, consent: true });
  assert.equal(claim.options.headers["X-CSRF-Token"], "synthetic-csrf");
  assert.equal(claim.options.credentials, "same-origin");
  assert.equal(h.location.hash, "");
  assert.equal(h.get("participant-receipt").value, "");
  assert.match(h.get("participant-detail").textContent, /Count\s+0/);
  assert.match(h.get("participant-detail").textContent, /Available\s+No/);
  assert.equal(
    h.calls.some(
      (call) =>
        call.path.startsWith("/api/orgs/") || call.path === "/api/session",
    ),
    false,
  );
});

test("a failed session refresh hides private answers before awaiting and keeps them hidden until recovery", async () => {
  const h = await harness();
  await h.open();
  assert.equal(h.get("participant-private").hidden, false);
  let release;
  h.model.sessionGate = new Promise((resolve) => {
    release = resolve;
  });
  h.model.sessionFailure = true;
  const checking = h.refresh();
  assert.equal(
    h.get("participant-private").hidden,
    true,
    "No old private display while access is being checked.",
  );
  release();
  await checking;
  assert.equal(h.get("participant-private").hidden, true);
  assert.equal(h.get("participant-retry-session").hidden, false);
  h.model.sessionGate = null;
  h.model.sessionFailure = false;
  await h.refresh();
  assert.equal(h.get("participant-private").hidden, false);
  assert.match(h.get("participant-detail").textContent, /Fictional Person/);
});

test("unchanged saved access preserves a dirty correction; a changed revision explicitly explains its removal", async () => {
  const h = await harness();
  await h.open();
  h.get("participant-answer-name").value = "Unsaved correction";
  await h.get("participant-detail").querySelector("form").emit("input");
  await h.refresh();
  assert.equal(h.get("participant-answer-name").value, "Unsaved correction");
  h.model.detail = {
    ...h.model.detail,
    revision: 2,
    status: "reviewed",
    editable: false,
    editUnavailableReason: "The organization already reviewed it.",
  };
  await h.refresh();
  assert.equal(h.get("participant-answer-name"), null);
  assert.match(
    h.get("participant-detail").textContent,
    /unsaved corrections were discarded/,
  );
  assert.doesNotMatch(
    h.get("participant-detail").textContent,
    /Unsaved correction/,
  );
});

test("a pending correction sends typed answers, renewed consent and the displayed revision", async () => {
  const h = await harness();
  await h.open();
  assert.equal(h.get("participant-answer-email").readOnly, true);
  h.get("participant-answer-name").value = "Corrected Person";
  h.get("participant-answer-count").value = "0";
  h.get("participant-answer-available").value = "false";
  h.get("participant-correction-consent").checked = true;
  await h.get("participant-detail").querySelector("form").emit("submit");
  await h.flush();
  const correction = h.calls.find((call) => call.path.endsWith("/correct"));
  assert.equal(correction.body.revision, 1);
  assert.equal(correction.body.consent, true);
  assert.equal(correction.body.answers.count, 0);
  assert.equal(correction.body.answers.available, false);
  assert.equal(correction.body.answers.email, verified.email);
  assert.match(h.get("participant-detail").textContent, /Revision 2/);
});

test("unlink requires a separate inline confirmation, sends one revision and removes displayed answers", async () => {
  const h = await harness();
  await h.open();
  await h.click("Unlink account access");
  assert.equal(
    h.calls.some((call) => call.path.endsWith("/unlink")),
    false,
  );
  assert.match(
    h.get("participant-confirmation").textContent,
    /cannot link it again/,
  );
  assert.match(
    h.get("participant-confirmation").textContent,
    /does not cancel participation, withdraw the request or erase submitted answers/,
  );
  await h.click("Permanently unlink this request");
  assert.deepEqual(h.calls.find((call) => call.path.endsWith("/unlink")).body, {
    revision: 1,
  });
  assert.doesNotMatch(
    h.get("participant-detail").textContent,
    /Fictional Person|fiction@example/,
  );
  assert.match(
    h.get("participant-list-status").textContent,
    /0 linked requests/,
  );
});

test("dirty-form sign-out confirmation executes once and clears private answers and corrections", async () => {
  const h = await harness();
  await h.open();
  h.get("participant-answer-name").value = "Unsaved private correction";
  await h.get("participant-detail").querySelector("form").emit("input");
  await h.click("Sign out");
  assert.equal(
    h.calls.some((call) => call.path === "/api/auth/logout"),
    false,
  );
  await h.click("Discard corrections and sign out");
  assert.equal(
    h.calls.filter((call) => call.path === "/api/auth/logout").length,
    1,
  );
  assert.equal(h.get("participant-private").hidden, true);
  assert.doesNotMatch(
    h.get("participant-detail").textContent,
    /Fictional Person|Unsaved private correction/,
  );
  assert.equal(h.get("participant-auth").hidden, false);
});

test("a delayed pre-erasure read cannot repaint answers after successful answer erasure", async () => {
  const h = await harness();
  await h.open();
  let release;
  h.model.detailGate = new Promise((resolve) => {
    release = resolve;
  });
  const staleRead = vm.runInContext(
    "openRequest(state.current,{focus:false})",
    h.context,
  );
  await h.click("Erase submitted answers");
  await h.click("Erase submitted answers", h.get("participant-confirmation"));
  assert.match(
    h.get("participant-detail").textContent,
    /Submitted answers were erased/,
  );
  release();
  await staleRead;
  assert.doesNotMatch(
    h.get("participant-detail").textContent,
    /Fictional Person|fiction@example/,
  );
  assert.match(
    h.get("participant-detail").textContent,
    /Submitted answers were erased/,
  );
});

test("a delayed old read cannot replace a newer saved correction", async () => {
  const h = await harness();
  await h.open();
  let release;
  h.model.detailGate = new Promise((resolve) => {
    release = resolve;
  });
  const staleRead = vm.runInContext(
    "openRequest(state.current,{focus:false})",
    h.context,
  );
  h.get("participant-answer-name").value = "Corrected Person";
  h.get("participant-correction-consent").checked = true;
  await h.get("participant-detail").querySelector("form").emit("submit");
  await h.flush();
  release();
  await staleRead;
  assert.match(h.get("participant-detail").textContent, /Corrected Person/);
  assert.doesNotMatch(
    h.get("participant-detail").textContent,
    /Fictional Person/,
  );
  assert.match(h.get("participant-detail").textContent, /Revision 2/);
});

test("specific participation consent starts unchecked and binds the exact schedule without claiming a place or delivery", async () => {
  const h = await harness({
    participations: [
      participation({ withdrawalAcknowledgementRequired: true }),
    ],
  });
  await h.open();
  assert.equal(h.get("participation-own-consent-participation").checked, false);
  assert.equal(
    h.get("participation-own-waitlist-participation").checked,
    false,
  );
  assert.equal(h.get("participation-own-email-participation").checked, false);
  assert.equal(
    h.get("participation-own-withdrawal-participation").checked,
    false,
  );
  const form = h.get("participant-participations").querySelector("form");
  await form.emit("submit");
  await h.flush();
  assert.equal(
    h.calls.some((call) => call.path.endsWith("/consent")),
    false,
  );
  h.get("participation-own-consent-participation").checked = true;
  h.get("participation-own-withdrawal-participation").checked = true;
  await form.emit("submit");
  await h.flush();
  const call = h.calls.find((entry) => entry.path.endsWith("/consent"));
  assert.equal(call.body.revision, 1);
  assert.equal(call.body.intakeRevision, 1);
  assert.equal(call.body.targetRevision, 2);
  assert.equal(call.body.sourceRevision, 7);
  assert.equal(call.body.termsHash, "a".repeat(64));
  assert.equal(call.body.consent, true);
  assert.equal(call.body.waitlistAllowed, false);
  assert.equal(call.body.emailUpdates, false);
  assert.equal(call.body.withdrawalAcknowledged, true);
  assert.equal(call.options.headers["X-CSRF-Token"], "synthetic-csrf");
  assert.match(
    h.get("participant-participations").textContent,
    /no place reserved/,
  );
  assert.match(
    h.get("participant-participations").textContent,
    /not active in this release/,
  );
  assert.equal(
    h.model.detail.status,
    "pending",
    "Participation consent does not change the original request.",
  );
});

test("participation cancellation is deliberate and distinct from original request withdrawal", async () => {
  const row = participation({ state: "confirmed", canConsent: false });
  row.frozenTerms = { ...row.terms };
  const h = await harness({ participations: [row] });
  await h.open();
  await h.click("Cancel participation");
  assert.equal(
    h.calls.some((call) => call.path.endsWith("/cancel")),
    false,
  );
  assert.match(
    h.get("participant-confirmation").textContent,
    /does not erase your request/,
  );
  await h.click("Confirm participation cancellation");
  const call = h.calls.find((entry) => entry.path.endsWith("/cancel"));
  assert.equal(call.body.revision, 1);
  assert.equal(call.body.intakeRevision, 1);
  assert.ok(call.body.idempotencyKey);
  assert.equal(h.model.detail.status, "pending");
  assert.equal(h.model.detail.revision, 1);
  assert.match(
    h.get("participant-participations").textContent,
    /Participation cancelled/,
  );
  assert.doesNotMatch(
    h.get("participant-participations").textContent,
    /Participation confirmed by/,
  );
});

test("a confirmed participation keeps its frozen schedule without offering a new consent and unlink supplies an organizer route", async () => {
  const row = participation({ state: "confirmed" });
  row.frozenTerms = { ...row.terms, title: "Original confirmed occurrence" };
  row.terms = { ...row.terms, title: "Current details for consent" };
  const h = await harness({ participations: [row] });
  await h.open();
  assert.match(
    h.get("participant-participations").textContent,
    /Original confirmed occurrence/,
  );
  assert.equal(h.get("participant-participations").querySelector("form"), null);
  assert.doesNotMatch(
    h.get("participant-participations").textContent,
    /Current details for consent/,
  );
  await h.click("Unlink account access");
  assert.match(
    h.get("participant-confirmation").textContent,
    /active participation is still recorded/,
  );
  assert.ok(
    h
      .get("participant-confirmation")
      .querySelectorAll("a")
      .some(
        (entry) => entry.attributes.href === "mailto:organizer@example.invalid",
      ),
  );
});

for (const action of ["consent", "cancel", "preferences"])
  test(`an old participation GET cannot repaint state after ${action}`, async () => {
    const row = participation();
    if (action === "preferences") row.notifications.requested = true;
    const h = await harness({ participations: [row] });
    await h.open();
    let release;
    h.model.participationGate = new Promise((resolve) => {
      release = resolve;
    });
    const stale = vm.runInContext(
      "loadOwnParticipations(state.current)",
      h.context,
    );
    if (action === "consent") {
      h.get("participation-own-consent-participation").checked = true;
      h.get("participation-own-waitlist-participation").checked = true;
      await h
        .get("participant-participations")
        .querySelector("form")
        .emit("submit");
      await h.flush();
    } else if (action === "cancel") {
      await h.click("Cancel participation");
      await h.click("Confirm participation cancellation");
    } else await h.click("Disable stored email preference");
    release();
    await stale;
    assert.match(h.get("participant-participations").textContent, /Revision 2/);
    if (action === "consent")
      assert.match(
        h.get("participant-participations").textContent,
        /waitlist allowed/,
      );
    if (action === "cancel")
      assert.match(
        h.get("participant-participations").textContent,
        /Participation cancelled/,
      );
    if (action === "preferences")
      assert.equal(
        h
          .get("participant-participations")
          .querySelectorAll("button")
          .some(
            (button) =>
              button.textContent === "Disable stored email preference",
          ),
        false,
      );
    assert.equal(h.model.detail.status, "pending");
  });
