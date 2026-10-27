import test from "node:test";
import assert from "node:assert/strict";
import {
  commandIntent,
  consentInstant,
  scheduleLabels,
  targetChoices,
  deliverySelection,
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
async function staffHarness({
  managed = false,
  delivery = false,
  admin = true,
  deliveryGate = null,
} = {}) {
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
                : s.startsWith(".")
                  ? (child.attributes.class || "")
                      .split(/\s+/)
                      .includes(s.slice(1))
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
  const model = {
      managed,
      confirmed: false,
      deliveryAvailable: true,
      deliveryGate,
      policy: {
        revision: 1,
        enabled: false,
        templateVersion: "participation-notice-v1",
      },
    },
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
    const deliveryBase = "/api/orgs/org/participation-delivery";
    if (
      delivery &&
      (path === deliveryBase || path.startsWith(deliveryBase + "?"))
    ) {
      if (model.deliveryGate) await model.deliveryGate;
      const second = path.includes("cursor=");
      return {
        ok: true,
        policy: { ...model.policy },
        available: model.deliveryAvailable,
        controlledMode: false,
        canManage: true,
        counts: model.deliveryCounts || {
          paused: 2,
          pending: 0,
          unknown: 1,
          accepted: 0,
          delivered: 1,
          suppressed: 0,
          failed: 0,
          cancelled: 0,
        },
        candidates: Array.from({ length: second ? 1 : 20 }, (_, i) => ({
          participationId: `confirmation-${second ? 20 : i}`,
          label: "Approved fictional occurrence",
          revision: 4,
          state: "confirmed",
          eligible: true,
          reason: null,
        })),
        nextCursor: second ? null : "next-confirmations",
      };
    }
    if (delivery && path.startsWith(deliveryBase + "/outbox"))
      return {
        ok: true,
        outbox: [
          {
            id: path.includes("?") ? "second-outcome" : "first-outcome",
            participationId: "private-internal-reference",
            state: path.includes("?") ? "delivered" : "unknown",
            safeCode: "private-provider-error-must-not-render",
            providerEventAt: path.includes("?") ? "2026-01-01T00:00:00Z" : null,
            email: "must-not-display@example.invalid",
            providerId: "must-not-display-provider",
          },
        ],
        nextCursor: path.includes("?") ? null : "next-outcomes",
      };
    if (delivery && path === deliveryBase + "/preview")
      return {
        ok: true,
        previewId: "exact-preview",
        reviewHash: "a".repeat(64),
        policyRevision: options.body.policyRevision,
        expiresAt: "2099-01-01T00:00:00Z",
        summary: {
          selected: options.body.participationIds.length,
          eligible: options.body.participationIds.length,
          ineligible: 0,
        },
        rows: options.body.participationIds.map((participationId) => ({
          participationId,
          eligible: true,
          reason: null,
        })),
      };
    if (delivery && path === deliveryBase + "/activate") {
      if (model.activationFailure)
        throw Object.assign(new Error("Synthetic stale preview"), {
          status: 409,
        });
      model.policy = {
        ...model.policy,
        revision: model.policy.revision + 1,
        enabled: true,
      };
      return {
        ok: true,
        policy: { ...model.policy },
        queued: 20,
        alreadyRecorded: 0,
      };
    }
    if (delivery && path === deliveryBase + "/disable") {
      model.policy = {
        ...model.policy,
        revision: model.policy.revision + 1,
        enabled: false,
      };
      return { ok: true, policy: { ...model.policy }, cancelled: 2 };
    }

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
    let active = true;
    const root = await createStaffParticipationWorkspace({
      orgId: "org",
      admin,
      isCurrent: () => active,
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
    await flush();
    return {
      root,
      model,
      calls,
      changes,
      flush,
      click,
      cleanup() {
        active = false;
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
    assert.match(picker.children[1].textContent, / · unmanaged$/);
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
    assert.match(picker.children[1].textContent, / · managed$/);
    assert.equal(picker.value, "target");
    await h.click("Refresh occurrence");
    assert.match(picker.children[1].textContent, / · managed$/);
    assert.equal(picker.value, "target");
  } finally {
    h.cleanup();
  }
});

test("refresh reconciles an occurrence adopted elsewhere without losing the selection", async () => {
  const h = await staffHarness();
  try {
    const picker = h.root.querySelector("#participation-target-picker");
    assert.match(picker.children[1].textContent, / · unmanaged$/);
    h.model.managed = true;
    await h.click("Refresh occurrence");
    assert.match(picker.children[1].textContent, / · managed$/);
    assert.equal(picker.value, "target");
    assert.match(h.root.textContent, /Ledger managed/);
  } finally {
    h.cleanup();
  }
});

test("staff confirmation is explicit and carries distinct allocation, source-candidate and consent revisions", async () => {
  const h = await staffHarness({ managed: true });
  try {
    await h.click("Confirm one place");
    assert.match(
      h.root.textContent,
      /A separately authorized operational update may be queued/,
    );
    assert.doesNotMatch(
      h.root.textContent,
      /does not record attendance or send email/,
    );
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
    assert.match(
      h.root.textContent,
      /operational email delivery remain separate/,
    );
  } finally {
    h.cleanup();
  }
});

test("delivery selection is bounded to 1–20 distinct opaque current confirmations", () => {
  const ids = Array.from({ length: 20 }, (_, i) => "confirmation-" + i);
  assert.deepEqual(deliverySelection(ids), ids);
  for (const value of [
    [],
    [...ids, "extra"],
    ["same", "same"],
    ["email@example.invalid"],
    null,
  ])
    assert.throws(() => deliverySelection(value));
});

test("staff activation requires a reviewed bounded preview and does not expose recipient or provider data", async () => {
  const h = await staffHarness({ managed: true, delivery: true });
  try {
    for (let i = 0; i < 20; i++) {
      const input = h.root.querySelector(
        "#delivery-candidate-confirmation-" + i,
      );
      input.checked = true;
      await input.emit("change");
    }
    await h.click("Load more confirmations");
    const extra = h.root.querySelector("#delivery-candidate-confirmation-20");
    extra.checked = true;
    await extra.emit("change");
    assert.equal(extra.checked, false);
    await h.click("Preview selected confirmations");
    const preview = h.calls.find((call) => call.path.endsWith("/preview"));
    assert.equal(preview.body.participationIds.length, 20);
    assert.equal(preview.body.policyRevision, 1);
    const form = h.root.querySelector("#participation-delivery-activation");
    await form.emit("submit");
    await h.flush();
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/activate")),
      false,
    );
    h.root.querySelector("#delivery-activate-confirm").checked = true;
    await Promise.all([form.emit("submit"), form.emit("submit")]);
    await h.flush();
    const calls = h.calls.filter((call) => call.path.endsWith("/activate"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.previewId, "exact-preview");
    assert.equal(calls[0].body.reviewHash, "a".repeat(64));
    assert.equal(calls[0].body.policyRevision, 1);
    assert.ok(calls[0].body.idempotencyKey);
    assert.match(h.root.textContent, /20 new current-state updates queued/);
    await h.click("Load more delivery outcomes");
    assert.match(h.root.textContent, /Delivered to receiving mail server/);
    assert.doesNotMatch(
      h.root.textContent,
      /must-not-display|private-provider-error|private-internal-reference/,
    );
    await h.click("Disable organization email delivery");
    h.root.querySelector("#delivery-disable-confirm").checked = true;
    await h.root
      .querySelector("#participation-delivery-disable")
      .emit("submit");
    await h.flush();
    assert.equal(h.model.policy.enabled, false);
    assert.match(h.root.textContent, /places are unchanged/);
  } finally {
    h.cleanup();
  }
});

test("an unavailable service cannot activate and scoped non-admin staff cannot manage policy", async () => {
  const h = await staffHarness({ delivery: true });
  try {
    h.model.deliveryAvailable = false;
    await h.click("Refresh delivery policy");
    const input = h.root.querySelector("#delivery-candidate-confirmation-0");
    input.checked = true;
    await input.emit("change");
    await h.click("Preview selected confirmations");
    const form = h.root.querySelector("#participation-delivery-activation");
    h.root.querySelector("#delivery-activate-confirm").checked = true;
    await form.emit("submit");
    await h.flush();
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/activate")),
      false,
    );
    assert.match(h.root.textContent, /Booking controls remain available/);
  } finally {
    h.cleanup();
  }
  const writer = await staffHarness({ delivery: true, admin: false });
  try {
    assert.equal(
      writer.root.querySelector("#delivery-candidate-confirmation-0"),
      null,
    );
    assert.match(writer.root.textContent, /Only an organization administrator/);
    assert.match(writer.root.textContent, /Acceptance unknown/);
  } finally {
    writer.cleanup();
  }
});

test("a stale activation is retained without automatic resend and requires a fresh reviewed policy", async () => {
  const h = await staffHarness({ delivery: true });
  try {
    const input = h.root.querySelector("#delivery-candidate-confirmation-0");
    input.checked = true;
    await input.emit("change");
    await h.click("Preview selected confirmations");
    const form = h.root.querySelector("#participation-delivery-activation");
    h.root.querySelector("#delivery-activate-confirm").checked = true;
    h.model.activationFailure = true;
    await form.emit("submit");
    await h.flush();
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/activate")).length,
      1,
    );
    assert.match(form.textContent, /Synthetic stale preview/);
    assert.equal(h.model.policy.enabled, false);
    await h.click("Refresh delivery policy");
    assert.equal(
      h.root.querySelector("#participation-delivery-activation"),
      null,
    );
    assert.equal(
      h.root.querySelector("#delivery-candidate-confirmation-0").checked,
      false,
    );
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/activate")).length,
      1,
    );
  } finally {
    h.cleanup();
  }
});

test("slow delivery readiness never prevents the booking workspace from opening", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const h = await staffHarness({ delivery: true, deliveryGate: gate });
  try {
    assert.match(h.root.textContent, /Not yet adopted/);
    assert.match(h.root.textContent, /Reading operational email policy/);
    await h.click("Preview legacy adoption");
    assert.match(h.root.textContent, /Review exact legacy occupancy/);
    release();
    await h.flush();
    assert.match(h.root.textContent, /Organization delivery policy/);
  } finally {
    release();
    await h.flush();
    h.cleanup();
  }
});

test("refreshing delivery outcomes reconciles summary counts without losing a current selection or preview", async () => {
  const h = await staffHarness({ delivery: true });
  try {
    const choice = h.root.querySelector("#delivery-candidate-confirmation-0");
    choice.checked = true;
    await choice.emit("change");
    await h.click("Preview selected confirmations");
    h.model.deliveryCounts = {
      paused: 0,
      pending: 0,
      leased: 0,
      unknown: 0,
      accepted: 1,
      delivered: 0,
      suppressed: 0,
      failed: 0,
      cancelled: 0,
    };
    await h.click("Refresh delivery outcomes");
    assert.match(
      h.root.querySelector(".participation-delivery-counts").textContent,
      /Accepted by email provider 1/,
    );
    assert.match(
      h.root.querySelector(".participation-delivery-counts").textContent,
      /Queued 0/,
    );
    assert.equal(
      h.root.querySelector("#delivery-candidate-confirmation-0").checked,
      true,
    );
    assert.ok(h.root.querySelector("#participation-delivery-activation"));
  } finally {
    h.cleanup();
  }
});
