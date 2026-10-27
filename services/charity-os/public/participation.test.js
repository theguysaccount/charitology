import test from "node:test";
import assert from "node:assert/strict";
import {
  commandIntent,
  consentInstant,
  scheduleLabels,
  targetChoices,
  createStaffParticipationWorkspace,
} from "./participation.js";

test("an interrupted participation command retains exactly one intent and refuses a changed action or payload", () => {
  let next = 0;
  const intent = commandIntent(() => `synthetic-command-${++next}`);
  const payload = {
    revision: 3,
    targetRevision: 2,
    candidateRevision: 7,
    consentRevision: 0,
    reason: "",
  };
  const first = intent.prepare("/confirm", payload);
  intent.rejected(0);
  assert.deepEqual(intent.prepare("/confirm", structuredClone(payload)), first);
  assert.equal(next, 1);
  assert.throws(
    () => intent.prepare("/confirm", { ...payload, revision: 4 }),
    /Refresh/,
  );
  assert.throws(() => intent.prepare("/waitlist", payload), /Refresh/);
  intent.rejected(409);
  assert.throws(
    () => intent.prepare("/confirm", { ...payload, reason: "Changed" }),
    /Refresh/,
  );
  assert.equal(
    first.consentRevision,
    0,
    "Missing consent cannot become an invented approval.",
  );
});

test("a definitive validation rejection permits correction while a confirmed read or success clears old intent", () => {
  let next = 0;
  const intent = commandIntent(() => `synthetic-command-${++next}`);
  const first = intent.prepare("/consent", {
    revision: 1,
    waitlistAllowed: false,
    emailUpdates: false,
  });
  intent.rejected(422);
  const corrected = intent.prepare("/consent", {
    revision: 1,
    waitlistAllowed: true,
    emailUpdates: false,
  });
  assert.notEqual(corrected.idempotencyKey, first.idempotencyKey);
  assert.equal(corrected.emailUpdates, false);
  intent.clear();
  assert.notEqual(
    intent.prepare("/cancel", { revision: 2 }).idempotencyKey,
    corrected.idempotencyKey,
  );
});

test("offline consent instants retain the actual offset and reject rollover dates or missing offsets", () => {
  assert.equal(
    consentInstant("2026-10-26T23:30:00-04:00"),
    "2026-10-27T03:30:00.000Z",
  );
  assert.equal(
    consentInstant("2028-02-29T00:00:00Z"),
    "2028-02-29T00:00:00.000Z",
  );
  for (const value of [
    "2027-02-29T12:00:00Z",
    "2026-02-30T12:00:00Z",
    "2026-10-26T24:00:00Z",
    "2026-10-26T12:60:00Z",
    "2026-10-26T12:00:00",
    "2026-10-26",
    "not a date",
  ])
    assert.throws(() => consentInstant(value));
});

test("overnight schedule labels keep their declared zone and never turn unknown schedule data into zero", () => {
  const schedule = scheduleLabels({
    startAt: "2026-10-26T23:00:00-04:00",
    endAt: "2026-10-27T03:00:00-04:00",
    timeZone: "America/New_York",
  });
  assert.equal(schedule.zone, "America/New_York");
  assert.notEqual(schedule.start, schedule.end);
  assert.doesNotMatch(schedule.start, /Not recorded|Invalid/);
  assert.deepEqual(
    scheduleLabels({ startAt: null, endAt: null, timeZone: null }),
    { start: "Not recorded", end: "Not recorded", zone: "Not recorded" },
  );
  assert.match(
    scheduleLabels({
      startAt: "2026-10-26T12:00:00Z",
      timeZone: "Invalid/Zone",
    }).start,
    /Invalid/,
  );
});

test("unmanaged occurrence choices do not inherit the smaller managed-target metadata cap", () => {
  const unmanaged = Array.from({ length: 501 }, (_, index) => ({
    targetId: `occurrence-${index}`,
    mode: "unmanaged",
  }));
  assert.equal(targetChoices(unmanaged).length, 501);
  assert.equal(
    targetChoices(
      Array.from({ length: 2000 }, (_, index) => ({
        targetId: `record-${index}`,
      })),
    ).length,
    2000,
  );
  assert.throws(() => targetChoices(Array.from({ length: 2001 })), /2,000/);
  assert.throws(() => targetChoices(null));
});

// Executes the actual staff helper with synthetic DOM/transport. This checks
// client intent and payloads; it is not a browser, permission or database test.
async function staffHarness({ managed = false } = {}) {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.handlers = new Map();
      this.disabled = false;
      this.hidden = false;
      this.checked = false;
      this.value = "";
      this.isConnected = false;
      this.classList = { toggle() {} };
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === "id") this.id = String(value);
      if (key === "value") this.value = String(value);
      if (key === "hidden") this.hidden = true;
    }
    connect(value) {
      this.isConnected = value;
      for (const child of this.children)
        if (child instanceof Element) child.connect(value);
    }
    append(...children) {
      for (const child of children) {
        this.children.push(child instanceof Element ? child : String(child));
        if (child instanceof Element) {
          child.parentElement = this;
          child.connect(this.isConnected);
        }
      }
    }
    replaceChildren(...children) {
      for (const child of this.children)
        if (child instanceof Element) child.connect(false);
      this.children = [];
      this.append(...children);
    }
    addEventListener(type, fn) {
      this.handlers.set(type, fn);
    }
    async emit(type) {
      await this.handlers.get(type)?.({
        preventDefault() {},
        currentTarget: this,
      });
    }
    querySelectorAll(selector) {
      const selectors = selector.split(",").map((part) => part.trim());
      const found = [];
      for (const child of this.children)
        if (child instanceof Element) {
          if (
            selectors.some((s) =>
              s.startsWith("#")
                ? child.id === s.slice(1)
                : child.tagName === s.toUpperCase(),
            )
          )
            found.push(child);
          found.push(...child.querySelectorAll(selector));
        }
      return found;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (entry) => entry !== this,
        );
      this.connect(false);
    }
    focus() {}
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
  const priorDocument = globalThis.document,
    priorNode = globalThis.Node;
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createTextNode: (value) => String(value),
  };
  globalThis.Node = Element;
  const terms = {
    title: "Fictional occurrence",
    kind: "session",
    startAt: "2099-01-01T12:00:00Z",
    endAt: "2099-01-01T14:00:00Z",
    timeZone: "UTC",
    participationPurpose: "Fictional organizing only.",
    participantInstructions: "Review the public details.",
  };
  const model = { managed, confirmed: false },
    calls = [],
    changes = [];
  const target = () => ({
    targetId: "target",
    moduleId: "events",
    title: terms.title,
    revision: model.managed ? 3 : 0,
    mode: model.managed ? "managed" : "unmanaged",
    currentSourceRevision: 7,
    sourceRevision: 7,
    sourceApproved: true,
    capacity: 5,
    occupied: model.confirmed ? 2 : 1,
    terms,
    termsHash: "h".repeat(64),
  });
  const row = () => ({
    id: "entry",
    state: model.confirmed ? "confirmed" : "requested",
    revision: model.confirmed ? 5 : 4,
    targetId: "target",
    moduleId: "events",
    bookingRecordId: "candidate",
    contactId: "opaque-contact",
    source: "intake",
    candidateRevision: 8,
    candidateApproved: true,
    consent: {
      revision: 2,
      sourceRevision: 7,
      termsHash: "h".repeat(64),
      at: "2026-01-01T00:00:00Z",
      waitlistAllowed: true,
    },
    canCancel: true,
  });
  const base = "/api/orgs/org/participation-targets";
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path === base) return { ok: true, targets: [target()] };
    if (path === `${base}/target`)
      return {
        ok: true,
        target: target(),
        terms,
        termsHash: "h".repeat(64),
        currentSourceRevision: 7,
        sourceApproved: true,
        capacity: 5,
        occupied: target().occupied,
        canAdopt: true,
        preview: {
          legacyHash: "frozen-preview",
          occupants: [
            { bookingRecordId: "legacy", contactId: "opaque-legacy" },
          ],
          issues: [],
        },
      };
    if (path === `${base}/target/adopt`) {
      model.managed = true;
      return { ok: true, target: target(), adopted: 1 };
    }
    if (path === `${base}/target/participations`)
      return {
        ok: true,
        participations: managed ? [row()] : [],
        nextCursor: null,
      };
    if (path === `${base}/target/participations/entry/confirm`) {
      model.confirmed = true;
      return { ok: true, participation: row() };
    }
    throw new Error(`Unexpected synthetic staff endpoint ${path}`);
  };
  try {
    const root = await createStaffParticipationWorkspace({
      orgId: "org",
      admin: true,
      request,
      loadRecords: async () => [],
      initialTargetId: "target",
      onChanged: () => changes.push(true),
    });
    root.connect(true);
    const flush = async () => {
      for (let n = 0; n < 12; n++)
        await new Promise((resolve) => setImmediate(resolve));
    };
    const click = async (text) => {
      const button = root
        .querySelectorAll("button")
        .find((entry) => entry.textContent === text);
      assert.ok(button, text);
      await button.emit("click");
      await flush();
      return button;
    };
    return {
      root,
      model,
      calls,
      changes,
      flush,
      click,
      cleanup() {
        globalThis.document = priorDocument;
        globalThis.Node = priorNode;
      },
    };
  } catch (error) {
    globalThis.document = priorDocument;
    globalThis.Node = priorNode;
    throw error;
  }
}

test("staff adoption requires explicit review and sends source revision plus the exact frozen preview", async () => {
  const h = await staffHarness();
  try {
    const picker = h.root.querySelector("#participation-target-picker");
    assert.equal(picker.children.length, 2);
    assert.equal(picker.children[1].tagName, "OPTION");
    assert.equal(picker.children[1].value, "target");
    await h.click("Preview legacy adoption");
    const form = h.root.querySelector("form");
    await form.emit("submit");
    await h.flush();
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/adopt")),
      false,
    );
    h.root.querySelector("#participation-adopt-consent").checked = true;
    await form.emit("submit");
    await h.flush();
    const call = h.calls.find((entry) => entry.path.endsWith("/adopt"));
    assert.equal(
      call.body.targetRevision,
      7,
      "Adoption binds the typed source revision, not unmanaged config revision zero.",
    );
    assert.equal(call.body.expectedLegacyHash, "frozen-preview");
    assert.ok(call.body.idempotencyKey);
    assert.match(h.root.textContent, /no consent was invented/);
  } finally {
    h.cleanup();
  }
});

test("staff confirmation is explicit and carries distinct allocation, source-candidate and consent revisions", async () => {
  const h = await staffHarness({ managed: true });
  try {
    await h.click("Confirm one place");
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/confirm")),
      false,
    );
    h.root.querySelector("#participation-decision-check").checked = true;
    const form = h.root.querySelector("form");
    await Promise.all([form.emit("submit"), form.emit("submit")]);
    await h.flush();
    const calls = h.calls.filter((entry) => entry.path.endsWith("/confirm"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.revision, 4);
    assert.equal(calls[0].body.targetRevision, 3);
    assert.equal(calls[0].body.candidateRevision, 8);
    assert.equal(calls[0].body.consentRevision, 2);
    assert.equal(h.changes.length, 1);
    assert.match(h.root.textContent, /Confirmation recorded/);
    assert.match(h.root.textContent, /email updates remain paused/);
  } finally {
    h.cleanup();
  }
});
