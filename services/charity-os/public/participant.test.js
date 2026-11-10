import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import {
  parseReceipt,
  typedAnswer,
  deliveryStateLabel,
} from "./participant.js";

const html = await readFile(
  new URL("./participant.html", import.meta.url),
  "utf8",
);
const source = await readFile(
  new URL("./participant.js", import.meta.url),
  "utf8",
);
const checkInSource = await readFile(new URL("./participant-check-in.js", import.meta.url),"utf8");
const reminderSource = await readFile(new URL("./participant-reminders.js", import.meta.url),"utf8");
const substitutionSource = await readFile(new URL("./participant-substitution.js", import.meta.url), "utf8");
const volunteerProfileSource = await readFile(new URL("./volunteer-profile.js", import.meta.url), "utf8");
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
const delivery = (patch = {}) => ({
  enabled: false,
  consentVersion: "participation-email-v1",
  consentRevision: 0,
  consentedAt: null,
  available: false,
  canEnable: true,
  unavailableReason: "Organization delivery is disabled.",
  serviceEnabled: false,
  policyEnabled: false,
  controlledMode: false,
  templateVersion: "participation-notice-v1",
  latest: null,
  ...patch,
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
  requestedInterval: null,
  frozenInterval: null,
  allocationHash: null,
  intervalChoiceLocked: false,
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
  remindersEnabled = false,
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
      substitutionCapability: undefined,
      sessionGate: null,
      detailGate: null,
      profileCapability: undefined,
      profileSessionCapability: undefined,
      csrfToken: "synthetic-csrf",
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
        ...(model.user ? { csrfToken: model.csrfToken } : {}),
        ...(model.profileSessionCapability === undefined ? {} : { volunteerProfile: model.profileSessionCapability }),
        ...(model.substitutionCapability === undefined ? {} : { volunteerSubstitutions: model.substitutionCapability }),
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
    if (path.startsWith(`${participationBase}/participation/check-in`)) {
      if (!model.checkInResponse) throw new Error("Unexpected unchosen synthetic check-in request");
      const value = await model.checkInResponse({path,body,options});
      return response(value.payload || value,value.status || 200);
    }
    if (path.startsWith(`${participationBase}/participation/reminder`)) {
      if(!model.reminderResponse)throw Error("Unexpected unchosen fictional reminder read");
      const value=await model.reminderResponse({path,body,options});return response(value.payload||value,value.status||200);
    }
    if (path === `${participationBase}/participation/substitution-choice`) {
      assert.equal(typeof model.substitutionResponse, "function", "no automatic offer read");
      const value = await model.substitutionResponse({ path, body, options });
      return response(value.payload || value, value.status || 200);
    }
    if (path.startsWith(`${participationBase}/`)) {
      const [, pid, action] = path.slice(participationBase.length).split("/");
      const old = model.participations.find((row) => row.id === pid);
      if (!old) throw new Error("Unknown synthetic participation");
      const overridden = await model.bookingResponse?.({
        pid,
        action,
        old,
        body,
        model,
      });
      if (overridden)
        return response(overridden.payload, overridden.status ?? 200);
      if (action === "consent" && model.consentFailure) {
        if (model.consentFailure === "network")
          throw new Error("Synthetic interrupted consent write");
        return response(
          { message: "Synthetic current source changed", code: "revision" },
          model.consentFailure,
        );
      }
      if (action === "delivery-preference" && model.deliveryFailure) {
        if (model.deliveryFailure === "network")
          throw new Error("Synthetic interrupted preference write");
        if (model.deliveryFailure === 409) {
          model.participations = model.participations.map((row) => ({
            ...row,
            revision: row.revision + 1,
            delivery: { ...row.delivery, canEnable: false },
          }));
        }
        return response(
          { message: "Synthetic preference rejected", code: "revision" },
          model.deliveryFailure,
        );
      }
      const next = { ...old, revision: old.revision + 1 };
      if (action === "delivery-preference") {
        next.delivery = {
          ...old.delivery,
          enabled: body.enabled,
          consentVersion: body.consentVersion,
          consentRevision: (old.delivery.consentRevision || 0) + 1,
          consentedAt: "2026-01-02T00:00:00Z",
        };
        model.participations = model.participations.map((row) =>
          row.id === pid ? next : row,
        );
        return response({
          participationId: pid,
          revision: next.revision,
          intakeRevision: model.detail.revision,
          delivery: next.delivery,
          ...(model.auditRetained === false ? { auditRetained: false } : {}),
        });
      }
      if (action === "cancel") {
        next.state = "cancelled";
        next.canCancel = false;
        next.canConsent = false;
      } else if (action === "consent") {
        next.intervalChoiceLocked = true;
        next.consent = {
          revision: 1,
          at: "2026-01-02T00:00:00.000Z",
          waitlistAllowed: body.waitlistAllowed,
          emailUpdates: body.emailUpdates,
          sourceRevision: body.sourceRevision,
          termsHash: body.termsHash,
        };
        if (Object.hasOwn(body, "requestedInterval")) {
          next.requestedInterval = body.requestedInterval;
          next.intervalChoiceLocked = true;
          next.allocationHash = body.requestedInterval ? "a".repeat(64) : null;
          if (body.requestedInterval)
            next.consent.allocationHash = next.allocationHash;
        }
        next.notifications = {
          ...old.notifications,
          requested: body.emailUpdates,
        };
        if (model.badIntervalResponse) next.requestedInterval = null;
      } else if (action === "preferences") {
        next.notifications = {
          ...old.notifications,
          requested: body.emailUpdates,
        };
      } else throw new Error("Unknown synthetic participation action");
      model.participations = model.participations.map((row) =>
        row.id === pid ? next : row,
      );
      return response({
        participation: next,
        ...(model.auditRetained === false ? { auditRetained: false } : {}),
      });
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
    if (path === "/api/participant/orgs/org/requests/request/volunteer-profile") {
      assert.equal(typeof model.profileReply, "function", "profile request must be deliberate");
      const value = await model.profileReply({ body, options });
      return value instanceof Response ? value : response(value.payload || value, value.status || 200);
    }
    if (path === "/api/participant/orgs/org/requests/request") {
      const snapshot = structuredClone(model.detail),
        wasLinked = model.linked;
      if (model.detailGate) await model.detailGate;
      return wasLinked
        ? response({ request: snapshot,
          ...(model.profileCapability === undefined ? {} : { volunteerProfile: model.profileCapability }) })
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
        const old = windowEvents.get(type);windowEvents.set(type, event=>{old?.(event);fn(event);});
      },
    },
    hostFetch: fetch,
    AbortSignal,
    AbortController,
    TextEncoder,
    URL,
    crypto: webcrypto,
    console,
  });
  const pane = (name, code) => `const ${name} = (() => {\n${code.replace(/^export /gm, "")}\nreturn ${name};})();\n`;
  const portal = source.replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  const localFetch = `async function fetch(...args) {
    const response = await hostFetch(...args);
    return { ok: response.ok, status: response.status, json: async () => JSON.parse(await response.text()) };
  }\n`;
  vm.runInContext(localFetch + checkInSource.replace(/^export /gm, "") +
    pane("createOwnReminderPane", reminderSource) + pane("createOwnSubstitutionPane", substitutionSource) +
    pane("createOwnVolunteerProfilePane", volunteerProfileSource) +
    "const participantRemindersEnabled = " + String(remindersEnabled === true) + ";\n" + portal, context);
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

const ownReminderDTO=()=>({ok:true,participationId:"participation",revision:1,intakeRevision:1,reminder:{version:"participation-reminder-v1",enabled:false,revision:0,atExact:null,currentCommitmentSha256:"a".repeat(64),canEnable:true,canDisable:false,unavailableReason:null}});
async function prepareOwnReminder(h) {
  await h.click("Read participation reminder choice");
  const box=h.root.querySelectorAll("input").find(n=>n.attributes.type==="checkbox"&&n.parentElement.textContent.includes("Email me one reminder before"));assert.ok(box);assert.equal(box.checked,false);box.checked=true;await box.emit("change");
}
test("own reminder remains manual, separate, and readable after portal pause and fresh session admission",async()=>{
  const h=await harness({remindersEnabled:true,participations:[participation({state:"confirmed",canConsent:false})]});h.model.reminderResponse=()=>ownReminderDTO();await h.open();assert.equal(h.calls.filter(c=>c.path.includes("/reminder")).length,0);await prepareOwnReminder(h);
  h.document.visibilityState="hidden";h.events.get("visibilitychange")();assert.doesNotMatch(h.root.textContent,/No reminder choice is recorded/);h.document.visibilityState="visible";await h.refresh();await h.flush();const before=h.calls.filter(c=>c.path.includes("/reminder")).length;await h.click("Read participation reminder choice");assert.equal(h.calls.filter(c=>c.path.includes("/reminder")).length,before+1);assert.match(h.root.textContent,/No reminder choice is recorded/);
});
test("same-request refresh retains uncertain reminder bytes, dirty warning, and explicit retry without an automatic write",async()=>{
  const h=await harness({remindersEnabled:true,participations:[participation({state:"confirmed",canConsent:false})]});let writes=0;h.model.reminderResponse=({path,body})=>{if(path.endsWith("/reminder"))return ownReminderDTO();writes++;if(writes<3)throw Error("Fictional interrupted or refused response");return {ok:true,participationId:"participation",revision:2,intakeRevision:1,reminder:{version:"participation-reminder-v1",enabled:true,revision:1,atExact:"2026-11-08T10:00:00.123456Z"},auditRetained:true,replayed:true};};await h.open();await prepareOwnReminder(h);await h.click("Save reminder choice");assert.equal(writes,1);await h.refresh();assert.equal(writes,1);assert.equal(vm.runInContext("state.dirty",h.context),true);let warned=false;h.windowEvents.get("beforeunload")({preventDefault(){warned=true;}});assert.equal(warned,true);await h.click("Read participation reminder choice");await h.click("Retry the same save");assert.equal(writes,2);await h.click("Retry the same save");const sent=h.calls.filter(c=>c.path.endsWith("/reminder-preference"));assert.equal(new Set(sent.map(c=>JSON.stringify(c.body))).size,1);assert.equal(vm.runInContext("state.dirty",h.context),false);
});
test("sign-out warns that an uncertain reminder save may remain recorded and clears only local retry authority",async()=>{
  const h=await harness({remindersEnabled:true,participations:[participation({state:"confirmed",canConsent:false})]});h.model.reminderResponse=({path})=>{if(path.endsWith("/reminder"))return ownReminderDTO();throw Error("Fictional lost save response");};await h.open();await prepareOwnReminder(h);await h.click("Save reminder choice");await h.get("participant-logout").emit("click");await h.flush();assert.match(h.get("participant-confirmation").textContent,/reminder save may already be recorded/);assert.equal(h.calls.some(c=>c.path==="/api/auth/logout"),false);await h.click("Discard corrections and sign out");assert.equal(vm.runInContext("state.reminderPanes.size",h.context),0);assert.equal(h.model.user,null);assert.equal(h.calls.filter(c=>c.path.endsWith("/reminder-preference")).length,1);
});

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
  assert.equal(h.get("participation-own-email-participation"), null);
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
    /delivery information is unavailable/,
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

for (const action of [
  "consent",
  "cancel",
  "preferences",
  "delivery-preference",
])
  test(`an old participation GET cannot repaint state after ${action}`, async () => {
    const row = participation();
    if (action === "preferences") row.notifications.requested = true;
    if (action === "delivery-preference") {
      row.delivery = delivery();
      row.canConsent = false;
    }
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
    } else if (action === "delivery-preference") {
      h.get("participation-delivery-choice-participation").checked = true;
      await h
        .get("participant-participations")
        .querySelector(".participant-delivery-form")
        .emit("submit");
      await h.flush();
    } else await h.click("Clear earlier preference-only choice");
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
              button.textContent === "Clear earlier preference-only choice",
          ),
        false,
      );
    assert.equal(h.model.detail.status, "pending");
  });

test("fresh operational email consent is separate from historical preference and preserves frozen confirmation terms", async () => {
  const row = participation({
    state: "confirmed",
    canConsent: false,
    delivery: delivery(),
    notifications: { requested: true },
  });
  row.frozenTerms = { ...row.terms, title: "Frozen confirmed occurrence" };
  row.terms = { ...row.terms, title: "Later working draft" };
  const h = await harness({ participations: [row] });
  await h.open();
  const input = h.get("participation-delivery-choice-participation");
  assert.equal(input.checked, false);
  assert.match(
    h.get("participant-participations").textContent,
    /Frozen confirmed occurrence/,
  );
  assert.doesNotMatch(
    h.get("participant-participations").textContent,
    /Later working draft/,
  );
  assert.match(
    h.get("participant-participations").textContent,
    /does not authorize operational email/,
  );
  assert.match(
    h.get("participant-participations").textContent,
    /participation-email-v1/,
  );
  assert.equal(h.get("participation-own-consent-participation"), null);
  input.checked = true;
  await h
    .get("participant-participations")
    .querySelector(".participant-delivery-form")
    .emit("submit");
  await h.flush();
  const call = h.calls.find((call) =>
    call.path.endsWith("/delivery-preference"),
  );
  assert.deepEqual(
    Object.keys(call.body).sort(),
    [
      "consentVersion",
      "enabled",
      "idempotencyKey",
      "intakeRevision",
      "revision",
    ].sort(),
  );
  assert.equal(call.body.enabled, true);
  assert.equal(call.body.consentVersion, "participation-email-v1");
  assert.equal(call.options.headers["X-CSRF-Token"], "synthetic-csrf");
  assert.equal(h.model.participations[0].state, "confirmed");
  assert.equal(h.model.detail.revision, 1);
  assert.match(
    h.get("participant-status").textContent,
    /No message was sent by this preference change/,
  );
  assert.match(
    h.get("participant-participations").textContent,
    /delivery is currently unavailable/,
  );
});

test("a failed email preference write keeps its unsaved choice and a definitive rejection allows correction", async () => {
  const h = await harness({
    participations: [
      participation({ delivery: delivery(), canConsent: false }),
    ],
  });
  await h.open();
  const input = h.get("participation-delivery-choice-participation"),
    form = h
      .get("participant-participations")
      .querySelector(".participant-delivery-form");
  input.checked = true;
  await form.emit("change");
  h.model.deliveryFailure = 422;
  await form.emit("submit");
  await h.flush();
  assert.equal(input.checked, true);
  assert.equal(h.model.participations[0].delivery.enabled, false);
  assert.match(form.textContent, /Synthetic preference rejected/);
  h.model.deliveryFailure = null;
  input.checked = false;
  await form.emit("submit");
  await h.flush();
  const calls = h.calls.filter((call) =>
    call.path.endsWith("/delivery-preference"),
  );
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].body.idempotencyKey, calls[1].body.idempotencyKey);
  assert.match(h.get("participant-status").textContent, /updates disabled/);
});

test("a stale email preference re-reads authority and explicitly discards the unsaved choice", async () => {
  const h = await harness({
    participations: [
      participation({ delivery: delivery(), canConsent: false }),
    ],
  });
  await h.open();
  const input = h.get("participation-delivery-choice-participation"),
    form = h
      .get("participant-participations")
      .querySelector(".participant-delivery-form");
  input.checked = true;
  await form.emit("change");
  h.model.deliveryFailure = 409;
  await form.emit("submit");
  await h.flush();
  assert.equal(h.get("participation-delivery-choice-participation"), null);
  assert.match(
    h.get("participant-status").textContent,
    /choice was not saved.*current state has been reloaded/,
  );
  assert.match(h.get("participant-participations").textContent, /Revision 2/);
});

test("email opt-out remains available without enable authority and does not cancel participation", async () => {
  const h = await harness({
    participations: [
      participation({
        state: "confirmed",
        canConsent: false,
        delivery: delivery({
          enabled: true,
          consentRevision: 2,
          canEnable: false,
          available: false,
        }),
      }),
    ],
  });
  await h.open();
  const input = h.get("participation-delivery-choice-participation");
  assert.equal(input.checked, true);
  input.checked = false;
  await h
    .get("participant-participations")
    .querySelector(".participant-delivery-form")
    .emit("submit");
  await h.flush();
  assert.equal(h.model.participations[0].state, "confirmed");
  assert.equal(h.model.participations[0].delivery.enabled, false);
  assert.match(
    h.get("participant-status").textContent,
    /already attempted may still arrive/,
  );
});

test("delivery evidence labels distinguish unknown, provider acceptance and receiving-server delivery", () => {
  assert.match(deliveryStateLabel("unknown"), /unknown.*no automatic resend/);
  assert.equal(deliveryStateLabel("accepted"), "Accepted by email provider");
  assert.equal(
    deliveryStateLabel("delivered"),
    "Delivered to receiving mail server",
  );
  assert.equal(deliveryStateLabel("leased"), "Queued / in progress");
  assert.equal(
    deliveryStateLabel("constructor"),
    "Delivery status unavailable",
  );
  assert.equal(
    deliveryStateLabel("<script>private provider error"),
    "Delivery status unavailable",
  );
});

test("saving participation does not silently discard a different unsaved email choice", async () => {
  const h = await harness({
    participations: [participation({ delivery: delivery() })],
  });
  await h.open();
  const email = h.get("participation-delivery-choice-participation");
  email.checked = true;
  await h
    .get("participant-participations")
    .querySelector(".participant-delivery-form")
    .emit("change");
  h.get("participation-own-consent-participation").checked = true;
  await h
    .get("participant-participations")
    .querySelector(".participant-participation-consent")
    .emit("submit");
  await h.flush();
  assert.equal(h.model.participations[0].delivery.enabled, false);
  assert.match(
    h.get("participant-status").textContent,
    /Other unsaved participation choices were discarded because the saved revision changed/,
  );
  assert.equal(
    h.calls.some((call) => call.path.endsWith("/delivery-preference")),
    false,
  );
});

function intervalParticipation(patch = {}) {
  const row = participation();
  row.terms.intervalPolicy = { version: 1, mode: "within-shift" };
  return { ...row, ...patch };
}
async function enterOwnInterval(h) {
  const prefix = "participation-own-interval-participation";
  const choice = h.get(`${prefix}-choice`);
  choice.value = "interval";
  await choice.emit("change");
  const start = "2099-01-01T23:30:00+00:00",
    end = "2099-01-02T01:30:00+00:00";
  for (const [part, value] of [
    ["start", start],
    ["end", end],
  ]) {
    const c = h.get(`${prefix}-${part}`);
    c.value = value;
    await c.emit("input");
  }
  return {
    choice,
    start,
    end,
    ack: h.get("participation-own-consent-participation"),
    form: h
      .get("participant-participations")
      .querySelector(".participant-participation-consent"),
  };
}

test("own interval choice is explicit, revokes the prior checkbox and echoes exact range without a reservation or hours", async () => {
  const h = await harness({ participations: [intervalParticipation()] });
  await h.open();
  const f = await enterOwnInterval(h);
  assert.equal(f.ack.checked, false);
  f.ack.checked = true;
  await h.get("participation-own-interval-participation-end").emit("input");
  assert.equal(f.ack.checked, false);
  await f.form.emit("submit");
  await h.flush();
  assert.equal(
    h.calls.some((c) => c.path.endsWith("/consent")),
    false,
  );
  f.ack.checked = true;
  await f.form.emit("submit");
  await h.flush();
  const call = h.calls.find((c) => c.path.endsWith("/consent"));
  assert.deepEqual(call.body.requestedInterval, {
    version: 1,
    startAt: f.start,
    endAt: f.end,
    timeZone: "UTC",
  });
  assert.equal(Object.hasOwn(call.body, "minutes"), false);
  assert.equal(Object.hasOwn(call.body, "attendance"), false);
  assert.match(h.get("participant-status").textContent, /No place is reserved/);
  assert.equal(
    h.get("participation-own-interval-participation-choice").disabled,
    true,
  );
  assert.equal(
    h.get("participation-own-interval-participation-start").readOnly,
    true,
  );
  assert.equal(h.get("participation-own-consent-participation").checked, false);
});

test("own interval stale/unknown responses preserve literal fields and an explicit retry reuses exactly one intent", async () => {
  const h = await harness({ participations: [intervalParticipation()] });
  await h.open();
  const f = await enterOwnInterval(h);
  f.ack.checked = true;
  h.model.consentFailure = 409;
  await f.form.emit("submit");
  await h.flush();
  assert.equal(
    h
      .get("participant-participations")
      .querySelector(".participant-participation-consent"),
    f.form,
  );
  assert.equal(
    h.get("participation-own-interval-participation-start").value,
    f.start,
  );
  assert.equal(
    h.get("participation-own-interval-participation-end").value,
    f.end,
  );
  const first = h.calls.find((c) => c.path.endsWith("/consent"));
  h.model.consentFailure = "network";
  await f.form.emit("submit");
  await h.flush();
  h.model.consentFailure = null;
  await f.form.emit("submit");
  await h.flush();
  const calls = h.calls.filter((c) => c.path.endsWith("/consent"));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].body, first.body);
  assert.deepEqual(calls[2].body, first.body);
  assert.equal(h.model.participations[0].state, "requested");
});

test("own malformed interval success keeps writing unresolved instead of downgrading to a whole shift", async () => {
  const h = await harness({ participations: [intervalParticipation()] });
  await h.open();
  const f = await enterOwnInterval(h);
  f.ack.checked = true;
  h.model.badIntervalResponse = true;
  await f.form.emit("submit");
  await h.flush();
  assert.equal(
    h
      .get("participant-participations")
      .querySelector(".participant-participation-consent"),
    f.form,
  );
  assert.equal(
    h.get("participation-own-interval-participation-start").value,
    f.start,
  );
  assert.match(
    h.get("participant-participations").textContent,
    /saved interval could not be verified/,
  );
  assert.equal(
    h.get("participation-own-interval-participation-choice").disabled,
    false,
  );
});

test("a restored whole choice stays immutable and a confirmed interval uses its frozen range with no new consent", async () => {
  const h = await harness({
    participations: [intervalParticipation({ intervalChoiceLocked: true })],
  });
  await h.open();
  const choice = h.get("participation-own-interval-participation-choice");
  assert.equal(choice.disabled, true);
  assert.equal(choice.value, "whole");
  const saved = {
    version: 1,
    startAt: "2099-01-01T23:30:01.123Z",
    endAt: "2099-01-02T00:30:02.456Z",
    timeZone: "UTC",
  };
  const row = intervalParticipation({
    state: "confirmed",
    canConsent: false,
    requestedInterval: saved,
    frozenInterval: saved,
    allocationHash: "a".repeat(64),
    intervalChoiceLocked: true,
  });
  row.frozenTerms = { ...row.terms, title: "Original approved shift" };
  row.terms = { ...row.terms, title: "Later changed occurrence" };
  const confirmed = await harness({ participations: [row] });
  await confirmed.open();
  const host = confirmed.get("participant-participations");
  assert.match(host.textContent, /Recorded interval commitment/);
  assert.ok(host.textContent.includes(saved.startAt));
  assert.ok(host.textContent.includes(saved.endAt));
  assert.match(host.textContent, /Original approved shift/);
  assert.doesNotMatch(host.textContent, /Later changed occurrence/);
  assert.equal(host.querySelector("form"), null);
  assert.match(host.textContent, /not recorded attendance or worked minutes/);
});

test("invalid own interval text stays literal and does not make a consent request", async () => {
  const h = await harness({ participations: [intervalParticipation()] });
  await h.open();
  const f = await enterOwnInterval(h),
    literal = " 2099-01-01T23:30:00Z <unfinished> 😀 ";
  const start = h.get("participation-own-interval-participation-start");
  start.value = literal;
  await start.emit("input");
  f.ack.checked = true;
  await f.form.emit("submit");
  await h.flush();
  assert.equal(start.value, literal);
  assert.equal(
    h.calls.some((c) => c.path.endsWith("/consent")),
    false,
  );
  assert.match(
    h.get("participant-participations").textContent,
    /Your writing is kept/,
  );
});

test("malformed interval metadata cannot render as a whole-request consent", async () => {
  const h = await harness({
    participations: [
      intervalParticipation({
        requestedInterval: false,
        allocationHash: "a".repeat(64),
      }),
    ],
  });
  await h.open();
  assert.equal(h.get("participation-own-consent-participation"), null);
  assert.equal(h.get("participation-own-interval-participation-choice"), null);
  assert.match(
    h.get("participant-participations").textContent,
    /interval response could not be verified/,
  );
  assert.equal(
    h.calls.some((c) => c.path.endsWith("/consent")),
    false,
  );
});

for (const action of ["cancel", "preferences", "delivery-preference"])
  test(`saved ${action} keeps its success and warns truthfully when the journal was not retained`, async () => {
    const row = participation();
    if (action === "preferences") row.notifications.requested = true;
    if (action === "delivery-preference") {
      row.delivery = delivery();
      row.canConsent = false;
    }
    const h = await harness({ participations: [row] });
    await h.open();
    h.model.auditRetained = false;
    if (action === "cancel") {
      await h.click("Cancel participation");
      await h.click("Confirm participation cancellation");
    } else if (action === "preferences")
      await h.click("Clear earlier preference-only choice");
    else {
      h.get("participation-delivery-choice-participation").checked = false;
      await h
        .get("participant-participations")
        .querySelector(".participant-delivery-form")
        .emit("submit");
      await h.flush();
    }
    assert.match(
      h.get("participant-status").textContent,
      /change is saved, but some journal entries could not be retained/,
    );
    assert.equal(h.model.participations[0].revision, 2);
    if (action === "cancel")
      assert.equal(h.model.participations[0].state, "cancelled");
  });

test("own malformed success then rate refusal retains the literal form and exact original command", async () => {
  const h = await harness({ participations: [intervalParticipation()] });
  await h.open();
  const f = await enterOwnInterval(h);
  f.ack.checked = true;
  h.model.badIntervalResponse = true;
  await f.form.emit("submit");
  await h.flush();
  assert.equal(
    h
      .get("participant-participations")
      .querySelector(".participant-participation-consent"),
    f.form,
  );
  h.model.badIntervalResponse = false;
  h.model.consentFailure = 429;
  await f.form.emit("submit");
  await h.flush();
  assert.equal(
    h.get("participation-own-interval-participation-start").value,
    f.start,
  );
  h.model.consentFailure = null;
  await f.form.emit("submit");
  await h.flush();
  const calls = h.calls.filter((c) => c.path.endsWith("/consent"));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].body, calls[0].body);
  assert.deepEqual(calls[2].body, calls[0].body);
  assert.match(
    h.get("participant-status").textContent,
    /Specific participation request recorded/,
  );
});

test("own id-only cancel success then rate refusal keeps the original command until its complete saved result", async () => {
  const h = await harness({ participations: [participation()] });
  let n = 0,
    saved;
  h.model.bookingResponse = ({ pid, action, old, model }) => {
    if (action !== "cancel") return;
    saved ??= {
      ...old,
      revision: old.revision + 1,
      state: "cancelled",
      canCancel: false,
      canConsent: false,
    };
    if (++n === 1) {
      model.participations = [saved];
      return { payload: { participation: { id: pid } } };
    }
    if (n === 2)
      return {
        status: 429,
        payload: { message: "Synthetic rate refusal", code: "rate" },
      };
    return { payload: { participation: saved, auditRetained: false } };
  };
  await h.open();
  await h.click("Cancel participation");
  for (let i = 0; i < 2; i++) {
    await h.click("Confirm participation cancellation");
    assert(h.get("participant-confirmation"));
    assert.match(h.get("participant-participations").textContent, /Revision 1/);
  }
  await h.click("Confirm participation cancellation");
  const calls = h.calls.filter((c) => c.path.endsWith("/cancel"));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].body, calls[0].body);
  assert.deepEqual(calls[2].body, calls[0].body);
  assert.equal(h.model.participations[0].revision, 2);
  assert.match(
    h.get("participant-status").textContent,
    /Participation cancelled/,
  );
  assert.match(
    h.get("participant-status").textContent,
    /some journal entries could not be retained/,
  );
});

test("a legitimate unchanged own email opt-out result keeps its same revision", async () => {
  const row = participation({ delivery: delivery(), canConsent: false });
  const h = await harness({ participations: [row] });
  h.model.bookingResponse = ({ pid, action, old, model }) =>
    action === "delivery-preference"
      ? {
          payload: {
            participationId: pid,
            revision: old.revision,
            intakeRevision: model.detail.revision,
            delivery: old.delivery,
          },
        }
      : undefined;
  await h.open();
  h.get("participation-delivery-choice-participation").checked = false;
  await h
    .get("participant-participations")
    .querySelector(".participant-delivery-form")
    .emit("submit");
  await h.flush();
  assert.match(
    h.get("participant-status").textContent,
    /Operational email updates disabled/,
  );
  assert.equal(h.model.participations[0].revision, 1);
});


test("arrival pane is manually opened, separate from booking keys, and pagehide clears its private DOM", async () => {
  const h = await harness({participations:[participation({state:"confirmed",canConsent:false})]});
  await h.open();assert.equal(h.calls.filter(c=>c.path.includes("/check-in")).length,0);
  h.model.checkInResponse=()=>({ok:true,participationId:"participation",revision:1,intakeRevision:1,checkInRevision:0,context:null,window:null,serverNow:"2026-11-07T10:30:00.000Z",canReport:false,canWithdraw:false,unavailableReason:"parent-unavailable",report:null});
  await h.click("Arrival self-report");assert.equal(h.calls.filter(c=>c.path.includes("/check-in")).length,1);
  assert.match(h.root.textContent,/Arrival self-report/);
  h.windowEvents.get("pagehide")({persisted:true});
  const values=vm.runInContext("state.checkInPanes.size",h.context);assert.equal(values,0);
  assert.doesNotMatch(h.root.textContent,/New reporting is unavailable/);
});

test("own check-in unknown receipt survives ordinary participation reload with byte-identical explicit Retry", async () => {
  const h=await harness({participations:[participation({state:"confirmed",canConsent:false})]});await h.open();
  const digest="a".repeat(64),range={startAt:"2026-11-07T10:00:00Z",endAt:"2026-11-07T11:00:00Z",timeZone:"UTC"};
  const dto={ok:true,participationId:"participation",revision:1,intakeRevision:1,checkInRevision:0,context:{title:"Fictional arrival",kind:"shift",occurrence:range,effectiveRange:range,participationPurpose:"Original purpose",participantInstructions:"Original instruction",organizerEmail:"organizer@example.invalid",organizerUrl:null,sourceRevision:7,termsHash:digest,commitmentSha256:digest},window:{opensAt:"2026-11-07T10:00:00.000Z",closesAt:"2026-11-08T11:00:00.000Z"},serverNow:"2026-11-07T10:30:00.000Z",canReport:true,canWithdraw:false,unavailableReason:null,report:null};
  h.model.checkInResponse=({path,body})=>{
    if(path.endsWith("/resolve-arrival"))return {ok:true,participationId:"participation",revision:1,intakeRevision:1,commitmentSha256:digest,civil:body.civil,timeZone:"UTC",kind:"unique",reason:null,candidates:[{choice:"unique",claimedArrivalAt:"2026-11-07T10:10:00Z"}],claimedArrivalAt:"2026-11-07T10:10:00Z"};
    if(path.endsWith("/report"))throw Error("Synthetic response lost");return dto;
  };
  await h.click("Arrival self-report");
  for(const [label,value]of [["Local arrival date","2026-11-07"],["Local arrival time","10:10"]]){const input=h.root.querySelectorAll("input").find(n=>n.attributes["aria-label"]===label);input.value=value;await input.emit("input");}
  await h.click("Resolve entered local time");const checkbox=h.root.querySelectorAll("input").find(n=>n.attributes.type==="checkbox"&&n.parentElement.textContent.includes("reporting my own arrival"));checkbox.checked=true;await checkbox.emit("change");await h.click("Record unverified arrival");
  const first=h.calls.find(c=>c.path.endsWith("/check-in/report"));assert.ok(first);
  assert(h.root.querySelectorAll("input").filter(n=>n.attributes["aria-label"]?.startsWith("Local arrival")).every(n=>n.disabled));
  assert(h.root.querySelectorAll("button").find(n=>n.textContent==="Record unverified arrival").disabled);
  assert.equal(h.root.querySelectorAll("button").find(n=>n.textContent==="Retry exact command").disabled,false);
  await vm.runInContext("loadOwnParticipations(state.current,{preserveDraft:true})",h.context);await h.flush();
  assert.equal(vm.runInContext("state.checkInPanes.size",h.context),1);
  await h.click("Retry exact command");const writes=h.calls.filter(c=>c.path.endsWith("/check-in/report"));assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);
  h.windowEvents.get("pagehide")({persisted:true});assert.equal(vm.runInContext("state.checkInPanes.size",h.context),0);
});


test("portal outer mutation restoration leaves an uncertain withdrawal disabled under its ordinary label", async()=>{
 const h=await harness({participations:[participation({state:"confirmed",canConsent:false})]});await h.open();const digest="a".repeat(64),stamp="2026-11-07T10:30:00.000Z",currentDisposition={originMode:"live",state:"reported",originalState:"reported",revision:1,staffReview:"not-recorded",attendance:null,workedMinutes:null};
 h.model.checkInResponse=({path})=>{if(path.endsWith("/withdraw"))throw Error("Synthetic lost withdrawal response");return {ok:true,participationId:"participation",revision:1,intakeRevision:1,checkInRevision:1,context:null,window:null,serverNow:stamp,canReport:false,canWithdraw:true,unavailableReason:"parent-unavailable",report:{id:"claim",claimedArrivalAt:"2026-11-07T10:10:00Z",submittedAt:stamp,withdrawnAt:null,claimSha256:digest,currentDisposition}};};
 await h.click("Arrival self-report");const ack=h.root.querySelectorAll("input").find(n=>n.attributes.type==="checkbox"&&n.parentElement.textContent.includes("withdraw only this unverified"));ack.checked=true;await ack.emit("change");await h.click("Withdraw this assertion");
 const normal=h.root.querySelectorAll("button").find(n=>n.textContent==="Withdraw this assertion"),retry=h.root.querySelectorAll("button").find(n=>n.textContent==="Retry exact command");assert(normal.disabled);assert(ack.disabled);assert.equal(retry.disabled,false);assert.equal(h.calls.filter(c=>c.path.endsWith("/check-in/withdraw")).length,1);
 h.windowEvents.get("pagehide")({persisted:true});
});

const handoffReads = harness => harness.calls.filter(call => call.path.endsWith("/substitution-choice"));
const handoffWrites = harness => handoffReads(harness).filter(call => call.options.method === "POST");
const portalButton = (harness, title) => harness.root.querySelectorAll("button").find(button => button.textContent.trim() === title);
async function openHandoffRequest(h, ...capability) {
  h.model.substitutionCapability = capability.length ? capability[0] : true;
  h.model.detail = { ...h.model.detail, status: "converted", editable: false,
    publication: { ...h.model.detail.publication, kind: "volunteer-interest" } };
  await h.refresh();
  await h.open();
}
const handoffDate = "2099-01-01T22:00:00.000001Z";
const handoffExpiry = "2099-01-01T22:04:00.000001Z";
const offerExpiry = "2099-01-01T22:08:00.000001Z";
function ownHandoffDTO(state = "unanswered", replayed = false) {
  const choiceRevision = state === "unanswered" ? 0 : state === "accepted" ? 1 : 2;
  return { ok: true, replayed, choice: { version: 1, party: "leaving",
    shift: { title: "Fictional whole shift", startAt: "2099-01-01T23:00:00Z", endAt: "2099-01-02T03:00:00Z", timeZone: "UTC" },
    offerExpiresAtExact: offerExpiry, state, choiceRevision, canAccept: state === "unanswered", canWithdraw: state === "accepted",
    acceptedAtExact: choiceRevision ? handoffDate : null, expiresAtExact: choiceRevision ? handoffExpiry : null,
    withdrawnAtExact: choiceRevision === 2 ? "2099-01-01T22:01:00.000001Z" : null,
    reviewSha256: "abc"[choiceRevision].repeat(64),
  } };
}
async function acknowledgeShiftChoice(h) {
  const checkbox = h.root.querySelector(".participant-substitution").querySelector("input");
  assert.equal(checkbox.parentElement.tagName, "LABEL");
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.emit("change");
}

test("the actual portal requires an explicit true session capability and a linked full volunteer row", async () => {
  for (const [capability, row] of [
    [undefined, participation({ state: "confirmed" })], ["true", participation({ state: "confirmed" })],
    [true, participation({ state: "requested" })], [true, participation({ state: "confirmed", recovered: true })],
  ]) {
    const h = await harness({ participations: [row] });
    await openHandoffRequest(h, capability);
    assert.equal(portalButton(h, "Read shift substitution offer"), undefined);
    assert.deepEqual(handoffReads(h), []);
  }
  const h = await harness({ participations: [participation({ state: "waitlisted" })] });
  await openHandoffRequest(h);
  assert.ok(portalButton(h, "Read shift substitution offer"));
  assert.deepEqual(handoffReads(h), []);
});

test("own portal retains exact choice through a current-session recheck and withdraws only after a new read", async () => {
  const h = await harness({ participations: [participation({ state: "confirmed", canConsent: false })] });
  let writes = 0;
  h.model.substitutionResponse = ({ options }) => {
    if (options.method !== "POST") return ownHandoffDTO(writes ? "accepted" : "unanswered");
    if (++writes === 1) throw new Error("Fictional lost response");
    return ownHandoffDTO(writes === 2 ? "accepted" : "withdrawn", writes === 2);
  };
  await openHandoffRequest(h);
  await h.click("Read shift substitution offer");
  const pane = h.root.querySelector(".participant-substitution");
  assert.equal(h.document.activeElement.attributes.role, "status");
  assert.equal(h.document.activeElement.attributes["aria-atomic"], "true");
  assert.match(pane.textContent, /Leave your confirmed place/);
  assert.equal(portalButton(h, "Save my agreement").disabled, true);
  await acknowledgeShiftChoice(h);
  await h.click("Save my agreement");
  assert.equal(handoffWrites(h).length, 1);
  assert.equal(vm.runInContext("state.dirty", h.context), true);
  await h.refresh();
  assert.equal(handoffReads(h).length, 2, "session recheck did not read or write the offer");
  await h.click("Read shift substitution offer");
  await h.click("Retry the same choice");
  const posts = handoffWrites(h);
  assert.equal(posts[0].options.body, posts[1].options.body);
  assert.equal(posts[0].options.headers["X-CSRF-Token"], "synthetic-csrf");
  assert.deepEqual(posts[0].body, { version: 1, choice: "accept", reviewSha256: "a".repeat(64),
    expectedChoiceRevision: 0, acknowledge: true });
  await h.click("Read shift substitution offer");
  await acknowledgeShiftChoice(h);
  await h.click("Withdraw my agreement");
  assert.deepEqual(handoffWrites(h).at(-1).body, { version: 1, choice: "withdraw", reviewSha256: "b".repeat(64),
    expectedChoiceRevision: 1, acknowledge: true });
  assert.match(pane.textContent, /withdrew your agreement/);
  assert.doesNotMatch(pane.textContent, /counterpart|other volunteer|waitlist position/i);
  h.windowEvents.get("pagehide")({ persisted: true });
  assert.equal(vm.runInContext("state.substitutionPanes.size", h.context), 0);
});

test("own portal gives an absent offer a deliberate recheck and clears an uncertain choice when capability ends", async () => {
  const h = await harness({ participations: [participation({ state: "confirmed", canConsent: false })] });
  h.model.substitutionResponse = () => ({ payload: { code: "substitution_unavailable" }, status: 404 });
  await openHandoffRequest(h);
  await h.click("Read shift substitution offer");
  assert.match(h.root.querySelector(".participant-substitution").textContent, /offer is unavailable/);
  assert.equal(handoffReads(h).length, 1);
  h.model.substitutionResponse = ({ options }) => {
    if (options.method === "POST") throw new Error("Fictional lost response");
    return ownHandoffDTO();
  };
  await h.click("Reload saved request");
  assert.equal(handoffReads(h).length, 1);
  await h.click("Read shift substitution offer");
  await acknowledgeShiftChoice(h);
  await h.click("Save my agreement");
  assert.equal(vm.runInContext("state.substitutionPanes.size", h.context), 1);
  h.model.substitutionCapability = undefined;
  await h.refresh();
  assert.equal(vm.runInContext("state.substitutionPanes.size", h.context), 0);
  assert.equal(h.root.querySelector(".participant-substitution"), null);
  assert.equal(handoffWrites(h).length, 1);
});

const profileScope = "a".repeat(64);
const profileCalls = h => h.calls.filter(call => call.path.endsWith("/volunteer-profile"));
const profileWrites = h => profileCalls(h).filter(call => call.options.method === "POST");
const profileView = (revision = 0, stored = null, replayed = false) => ({ ok: true, version: 1, revision,
  workspaceTimeZone: "America/New_York", profile: stored, scopeSha256: profileScope, replayed });
const preferences = { skills: ["event-support"], availability: ["mon-morning"], timeZone: "America/New_York",
  updatedAtExact: "2026-11-09T12:00:00.123456Z" };
function profileRequest(h, status = "pending", kind = "volunteer-interest") {
  h.model.detail = { ...h.model.detail, status, publication: { ...h.model.detail.publication, kind } };
}
async function editVolunteerProfile(h) {
  const pane = h.root.querySelector(".volunteer-profile");
  for (const label of ["Event support", "Monday morning"]) {
    const option = pane.querySelectorAll("input").find(input => input.attributes["aria-label"] === label);
    option.checked = true;
    await option.emit("change");
  }
  const agree = pane.querySelectorAll("input").find(input =>
    input.parentElement.textContent.includes("I want to save these optional preferences"));
  assert.equal(agree.checked, false);
  agree.checked = true;
  await agree.emit("change");
}

test("My requests admits preferences only from an exact fresh own detail capability", async () => {
  for (const [capability, status, kind] of [
    [undefined, "pending", "volunteer-interest"], ["true", "reviewed", "volunteer-interest"],
    [true, "cancelled", "volunteer-interest"], [true, "pending", "contact"],
  ]) {
    const h = await harness({});
    h.model.profileSessionCapability = true;
    h.model.profileCapability = capability;
    profileRequest(h, status, kind);
    await h.refresh();
    await h.open();
    assert.equal(h.get("participant-volunteer-profile").hidden, true);
    assert.equal(profileCalls(h).length, 0);
  }
  for (const status of ["pending", "reviewed", "converted"]) {
    const h = await harness({});
    h.model.profileCapability = true;
    profileRequest(h, status);
    await h.open();
    assert.equal(h.get("participant-volunteer-profile").hidden, false);
    assert.match(h.get("participant-volunteer-profile").textContent, /Your volunteer preferences/);
    assert.equal(profileCalls(h).length, 0);
  }
});

test("My requests keeps exact pending preferences across a current same-account refresh", async () => {
  const h = await harness({});
  h.model.profileCapability = true;
  profileRequest(h);
  let writes = 0;
  h.model.profileReply = ({ options }) => {
    if (options.method !== "POST") return writes ? profileView(1, preferences) : profileView();
    if (++writes === 1) throw new Error("Fictional response lost");
    return profileView(1, preferences, true);
  };
  await h.open();
  await h.click("Your volunteer preferences");
  assert.match(h.root.querySelector(".volunteer-profile").textContent, /America\/New_York/);
  assert.equal(h.document.activeElement.attributes.role, "status");
  await editVolunteerProfile(h);
  await h.click("Save preferences");
  await h.refresh();
  assert.equal(profileCalls(h).length, 2);
  assert.equal(vm.runInContext("volunteerProfilePending() && state.dirty", h.context), true);
  const retry = h.root.querySelector(".volunteer-profile").querySelectorAll("button")
    .find(button => button.textContent.trim() === "Retry the same preference change");
  assert.equal(retry.disabled, true);
  await h.click("Read saved volunteer preferences");
  await h.click("Retry the same preference change");
  const posts = profileWrites(h);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].options.body, posts[1].options.body);
  assert.equal(posts[0].options.headers["X-CSRF-Token"], "synthetic-csrf");
  assert.deepEqual(posts[0].body, { version: 1, operation: "save", expectedRevision: 0, scopeSha256: profileScope,
    acknowledge: true, skills: ["event-support"], availability: ["mon-morning"] });
  assert.match(h.root.querySelector(".volunteer-profile").textContent, /Saved revision 1/);
  assert.equal(vm.runInContext("state.dirty", h.context), false);
});

test("a fresh session token or capability withdrawal discards an old pending preference", async () => {
  for (const changed of ["csrf", "capability"]) {
    const h = await harness({});
    h.model.profileCapability = true;
    profileRequest(h);
    h.model.profileReply = ({ options }) => {
      if (options.method === "POST") throw new Error("Fictional response lost");
      return profileView();
    };
    await h.open();
    await h.click("Your volunteer preferences");
    await editVolunteerProfile(h);
    await h.click("Save preferences");
    assert.equal(vm.runInContext("volunteerProfilePending()", h.context), true);
    if (changed === "csrf") h.model.csrfToken = "replacement-synthetic-csrf";
    else h.model.profileCapability = undefined;
    await h.refresh();
    assert.equal(vm.runInContext("state.volunteerProfile === null && !volunteerProfilePending()", h.context), true);
    assert.equal(h.root.querySelector(".volunteer-profile"), null);
    assert.equal(h.get("participant-volunteer-profile").hidden, changed === "capability");
    assert.equal(profileWrites(h).length, 1);
  }
});

test("a fresh detail read keeps preference writing and asks for the latest profile before another save", async () => {
  const h = await harness({});
  h.model.profileCapability = true;
  profileRequest(h);
  h.model.profileReply = () => profileView();
  await h.open();
  await h.click("Your volunteer preferences");
  await editVolunteerProfile(h);
  await h.click("Reload saved request");
  assert.equal(profileCalls(h).length, 1);
  const pane = h.root.querySelector(".volunteer-profile");
  const field = pane.querySelectorAll("input").find(input => input.attributes["aria-label"] === "Monday morning");
  assert.equal(field.checked, true);
  assert.equal(field.disabled, true);
  await h.click("Read saved volunteer preferences");
  assert.equal(field.checked, true);
  assert.equal(field.disabled, false);
  assert.equal(profileWrites(h).length, 0);
});

test("missing profile access clears only that panel while non-JSON authorization loss clears the private portal", async () => {
  for (const status of [404, 401]) {
    const h = await harness({});
    h.model.profileCapability = true;
    profileRequest(h);
    h.model.profileReply = () => new Response("Fictional denial", { status });
    await h.open();
    await h.click("Your volunteer preferences");
    assert.equal(h.root.querySelector(".volunteer-profile"), null);
    assert.equal(h.get("participant-private").hidden, status === 401);
    assert.equal(vm.runInContext("state.volunteerProfileAccess", h.context), null);
  }
});

test("profile and handoff share one pending change while preserving the second panel's reviewed writing", async () => {
  for (const first of ["profile", "handoff"]) {
    const h = await harness({ participations: [participation({ state: "confirmed", canConsent: false })] });
    h.model.profileCapability = h.model.substitutionCapability = true;
    profileRequest(h, "converted");
    let profileAttempts = 0, handoffAttempts = 0;
    h.model.profileReply = ({ options }) => {
      if (options.method !== "POST") return profileView();
      if (++profileAttempts === 1 && first === "profile") throw new Error("Fictional profile response lost");
      return profileView(1, preferences, profileAttempts > 1);
    };
    h.model.substitutionResponse = ({ options }) => {
      if (options.method !== "POST") return ownHandoffDTO();
      if (++handoffAttempts === 1 && first === "handoff") throw new Error("Fictional handoff response lost");
      return ownHandoffDTO("accepted", handoffAttempts > 1);
    };
    await h.refresh();
    await h.open();
    await h.click("Your volunteer preferences");
    await h.click("Read shift substitution offer");
    await editVolunteerProfile(h);
    await acknowledgeShiftChoice(h);
    const firstSave = first === "profile" ? "Save preferences" : "Save my agreement";
    const secondSave = first === "profile" ? "Save my agreement" : "Save preferences";
    const firstRetry = first === "profile" ? "Retry the same preference change" : "Retry the same choice";
    await h.click(firstSave);
    await h.click(secondSave);
    assert.equal(profileWrites(h).length + handoffWrites(h).length, 1);
    assert.match(h.root.textContent, /Check or stop retrying the earlier volunteer change/);
    assert.equal(vm.runInContext("volunteerProfilePending()", h.context), first === "profile");
    assert.equal(vm.runInContext("substitutionPending()", h.context), first === "handoff");
    await h.click(firstRetry);
    await h.click(secondSave);
    assert.equal(profileWrites(h).length, first === "profile" ? 2 : 1);
    assert.equal(handoffWrites(h).length, first === "handoff" ? 2 : 1);
    assert.equal(vm.runInContext("volunteerProfilePending() || substitutionPending()", h.context), false);
  }
});
