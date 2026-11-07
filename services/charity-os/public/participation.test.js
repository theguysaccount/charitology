import test from "node:test";
import assert from "node:assert/strict";
import {
  commandIntent,
  consentInstant,
  scheduleLabels,
  targetChoices,
  deliverySelection,
  createStaffParticipationWorkspace,
  intervalOffered,
  requestedIntervalValue,
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
  attendance = false,
  attendanceModule = "events",
  attendanceRequest = null,
  interval = false,
  entryPatch = {},
  bookingRequest = null,
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
    contains(element) {
      return (
        this === element ||
        this.children.some(
          (child) => child instanceof Element && child.contains(element),
        )
      );
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (entry) => entry !== this,
        );
      this.connect(false);
    }
    focus() {
      globalThis.document.activeElement = this;
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
  const priorDocument = globalThis.document,
    priorNode = globalThis.Node;
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createTextNode: (value) => String(value),
  };
  globalThis.Node = Element;
  const terms = {
    title: "Fictional occurrence",
    kind: interval ? "shift" : "session",
    ...(interval
      ? { intervalPolicy: { version: 1, mode: "within-shift" } }
      : {}),
    startAt: "2099-01-01T12:00:00Z",
    endAt: "2099-01-01T14:00:00Z",
    timeZone: "UTC",
    participationPurpose: "Fictional organizing only.",
    participantInstructions: "Review the public details.",
  };
  const model = {
      managed,
      confirmed: false,
      entryPatch,
      deliveryAvailable: true,
      deliveryGate,
      policy: {
        revision: 1,
        enabled: false,
        templateVersion: "participation-notice-v1",
      },
      attendanceSourceRevision: 7,
      knownRegisteredCount: null,
      knownWalkInCount: null,
      attendanceExisting: null,
      attendanceCanPrepare: true,
    },
    calls = [],
    changes = [];
  const target = () => ({
    targetId: "target",
    moduleId: attendance
      ? attendanceModule
      : interval
        ? "volunteers"
        : "events",
    title: terms.title,
    revision: model.managed ? 3 : 0,
    mode: model.managed ? "managed" : "unmanaged",
    currentSourceRevision: 7,
    sourceRevision: 7,
    sourceApproved: true,
    capacity: 5,
    occupied: model.confirmed ? 2 : 1,
    confirmedCount: 2,
    peakOccupied: 1,
    terms,
    termsHash: "b".repeat(64),
  });
  const row = () => ({
    id: "entry",
    state: model.confirmed ? "confirmed" : "requested",
    revision: model.confirmed ? 5 : 4,
    targetId: "target",
    moduleId: interval ? "volunteers" : "events",
    bookingRecordId: "candidate",
    contactId: "opaque-contact",
    source: "intake",
    candidateRevision: 8,
    candidateApproved: true,
    consent: {
      revision: 2,
      sourceRevision: 7,
      termsHash: "b".repeat(64),
      at: "2026-01-01T00:00:00Z",
      waitlistAllowed: true,
    },
    canCancel: true,
    ...model.entryPatch,
  });
  const base = "/api/orgs/org/participation-targets";
  const attendanceSource = () => ({
    method: "whole-occurrence-staff-reported-v1",
    scope: "whole-occurrence",
    targetId: "target",
    moduleId: attendanceModule,
    sourceRevision: model.attendanceSourceRevision,
    sourceStatus: "completed",
    managedRevision: 3,
    termsHash: "b".repeat(64),
    programId: "program",
    title: "Fictional ended occurrence",
    startAt: "2026-01-01T12:00:00Z",
    endAt: "2026-01-01T14:00:00Z",
    timeZone: "UTC",
    confirmedPlaces: 2,
    knownRegisteredCount: model.knownRegisteredCount,
    knownWalkInCount: model.knownWalkInCount,
    ledgerSha256: "b".repeat(64),
    restoreEpochSha256: "c".repeat(64),
  });
  const attendanceContext = () => ({
    ok: true,
    target: {
      id: "target",
      orgId: "org",
      moduleId: attendanceModule,
      programId: "program",
      title: "Fictional ended occurrence",
      status: "completed",
      revision: model.attendanceSourceRevision,
      startAt: "2026-01-01T12:00:00Z",
      endAt: "2026-01-01T14:00:00Z",
      timeZone: "UTC",
    },
    canPrepare: model.attendanceCanPrepare && !model.attendanceExisting,
    contextSha256:
      model.attendanceCanPrepare && !model.attendanceExisting
        ? "a".repeat(64)
        : null,
    sourceContext:
      model.attendanceCanPrepare && !model.attendanceExisting
        ? attendanceSource()
        : null,
    reason: model.attendanceExisting
      ? "Attendance is already recorded."
      : model.attendanceCanPrepare
        ? null
        : "Current occurrence is unavailable.",
    existing: model.attendanceExisting,
  });
  const attendanceCandidate = (body) => ({
    id: "attendance-draft",
    orgId: "org",
    moduleId: attendanceModule,
    status: "draft",
    revision: 1,
    ownerId: "staff-author",
    lastEditedBy: "staff-author",
    approval: null,
    snapshot: null,
    source: null,
    data: {
      title: body.title.trim(),
      kind: "attendance",
      programId: "program",
      contactId: null,
      startAt: null,
      endAt: null,
      timeZone: null,
      ...(attendanceModule === "events"
        ? {
            eventId: "target",
            attendanceCount: body.reportedAttendance,
            registeredCount: body.registeredCount,
            walkInCount: body.walkInCount,
          }
        : {
            shiftId: "target",
            participants: body.reportedAttendance,
            minutes: null,
          }),
    },
  });
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (bookingRequest) {
      const handled = await bookingRequest({ path, options, model, row });
      if (handled !== undefined) return handled;
    }
    if (attendance && path.startsWith(`${base}/target/attendance`)) {
      if (attendanceRequest) {
        const handled = await attendanceRequest({
          path,
          options,
          model,
          context: attendanceContext,
          candidate: attendanceCandidate,
        });
        if (handled !== undefined) return handled;
      }
      if (path === `${base}/target/attendance`) return attendanceContext();
      if (path === `${base}/target/attendance/preview`) {
        model.lastAttendanceCandidate = attendanceCandidate(options.body);
        return {
          ok: true,
          previewToken: "exact-attendance-preview",
          expiresAt: "2099-01-01T00:00:00Z",
          preview: {
            method: "whole-occurrence-staff-reported-v1",
            scope: "whole-occurrence",
            sourceContext: attendanceSource(),
            candidate: model.lastAttendanceCandidate,
          },
        };
      }
      if (path === `${base}/target/attendance/create`)
        return {
          ok: true,
          kind: "created",
          record: model.lastAttendanceCandidate,
          disposition: "active",
        };
    }
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
      return {
        ok: true,
        policy: { ...model.policy },
        cancelled: 2,
        ...(model.auditRetained === false ? { auditRetained: false } : {}),
      };
    }

    if (path === base) return { ok: true, targets: [target()] };
    if (path === `${base}/target`)
      return {
        ok: true,
        target: target(),
        terms,
        termsHash: "b".repeat(64),
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
    if (path === `${base}/target/participations/entry/consent`) {
      const requestedInterval = options.body.requestedInterval || null;
      model.entryPatch = {
        ...model.entryPatch,
        revision: row().revision + 1,
        requestedInterval,
        intervalChoiceLocked: true,
        allocationHash: requestedInterval ? "a".repeat(64) : null,
        consent: {
          revision: 5,
          at: options.body.consentedAt,
          method: options.body.method,
          evidenceRef: options.body.evidenceRef || null,
          sourceRevision: options.body.sourceRevision,
          termsHash: options.body.termsHash,
          waitlistAllowed: options.body.waitlistAllowed,
          ...(requestedInterval ? { allocationHash: "a".repeat(64) } : {}),
        },
      };
      return { ok: true, participation: row() };
    }
    if (path === `${base}/target/participations/entry/confirm`) {
      model.entryPatch = {
        ...model.entryPatch,
        revision: row().revision + 1,
        ...(row().requestedInterval
          ? { frozenInterval: row().requestedInterval }
          : {}),
      };
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
      revoke() {
        active = false;
      },
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

async function enterAttendance(
  h,
  {
    count = "0",
    title = "  Fictional whole attendance 😀  ",
    registered = "",
    walkIn = "",
  } = {},
) {
  await h.click("Load occurrence for attendance");
  for (const [id, value] of [
    ["attendance-title", title],
    ["attendance-reported", count],
    ["attendance-registered", registered],
    ["attendance-walk-in", walkIn],
  ]) {
    const control = h.root.querySelector(`#${id}`);
    if (control && !control.readOnly) {
      control.value = value;
      await control.emit("input");
    }
  }
  const scope = h.root.querySelector("#attendance-whole-check");
  scope.checked = true;
  await scope.emit("change");
  const form = h.root.querySelector("form");
  await form.emit("submit");
  await h.flush();
  return form;
}

test("closing attendance returns focus to its connected current occurrence control", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    const origin = await h.click("Load occurrence for attendance");
    const close = h.root
      .querySelectorAll("button")
      .find((el) => el.textContent === "Close attendance form");
    close.focus();
    await h.click("Close attendance form");
    assert.equal(h.root.querySelector("#attendance-title"), null);
    assert.ok(globalThis.document.activeElement === origin);
    assert.equal(origin.isConnected, true);
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance")).length,
      1,
    );

    await h.click("Load occurrence for attendance");
    const replacementTitle = h.root.querySelector("#attendance-title");
    replacementTitle.focus();
    await close.emit("click");
    assert.ok(
      globalThis.document.activeElement === replacementTitle,
      "A removed old Close control cannot steal focus or close a newer form",
    );
    assert.equal(replacementTitle.isConnected, true);
  } finally {
    h.cleanup();
  }
});

test("Keep editing returns to literal attendance writing while stale prompts have no focus authority", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    const origin = await h.click("Load occurrence for attendance");
    const title = h.root.querySelector("#attendance-title"),
      count = h.root.querySelector("#attendance-reported");
    title.value = "  Unfinished fictional attendance 😀  ";
    await title.emit("input");
    count.value = "7";
    await count.emit("input");
    await h.click("Close attendance form");
    const keep = h.root
      .querySelectorAll("button")
      .find((el) => el.textContent === "Keep editing");
    keep.focus();
    await keep.emit("click");
    assert.ok(globalThis.document.activeElement === title);
    assert.equal(title.value, "  Unfinished fictional attendance 😀  ");
    assert.equal(count.value, "7");
    assert.equal(keep.isConnected, false);

    await h.click("Close attendance form");
    await h.click("Discard and continue");
    assert.ok(
      globalThis.document.activeElement === origin,
      "Explicit confirmed Close returns to the same live occurrence",
    );
    await h.click("Load occurrence for attendance");
    const replacementTitle = h.root.querySelector("#attendance-title");
    replacementTitle.focus();
    await keep.emit("click");
    assert.ok(globalThis.document.activeElement === replacementTitle);

    replacementTitle.value = "Newer retained literal";
    await replacementTitle.emit("input");
    await h.click("Close attendance form");
    const revokedKeep = h.root
      .querySelectorAll("button")
      .find((el) => el.textContent === "Keep editing");
    const outside = document.createElement("button");
    outside.focus();
    h.revoke();
    await revokedKeep.emit("click");
    assert.ok(
      globalThis.document.activeElement === outside,
      "A lost current scope cannot reclaim focus",
    );
    assert.equal(replacementTitle.value, "Newer retained literal");
  } finally {
    h.cleanup();
  }
});

test("closing attendance refuses a removed originating control or detached workspace as focus targets", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    const origin = await h.click("Load occurrence for attendance");
    const outside = document.createElement("button");
    outside.focus();
    origin.remove();
    await h.click("Close attendance form");
    assert.ok(globalThis.document.activeElement === outside);
    assert.equal(h.root.querySelector("#attendance-title"), null);
  } finally {
    h.cleanup();
  }

  const detached = await staffHarness({ managed: true, attendance: true });
  try {
    await detached.click("Load occurrence for attendance");
    const close = detached.root
      .querySelectorAll("button")
      .find((el) => el.textContent === "Close attendance form");
    const outside = document.createElement("button");
    outside.focus();
    detached.root.connect(false);
    await close.emit("click");
    assert.ok(globalThis.document.activeElement === outside);
  } finally {
    detached.cleanup();
  }
});

test("attendance context reload is usable immediately after opening, before any field edits", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    await h.click("Load occurrence for attendance");
    const reload = h.root
      .querySelectorAll("button")
      .find((el) => el.textContent === "Reload current attendance context");
    assert.ok(reload);
    assert.equal(
      reload.disabled,
      false,
      "New controls must be resynchronized after the opening work finishes",
    );
    assert.equal(h.root.querySelector("#attendance-reported").value, "");
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance")).length,
      1,
    );
    h.model.attendanceSourceRevision++;
    h.model.knownRegisteredCount = 5;
    await h.click("Reload current attendance context");
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance")).length,
      2,
      "The immediately enabled control performs the real context read",
    );
    assert.match(
      h.root.textContent,
      /Registrations already recorded in the occurrence: 5/,
    );
    assert.match(
      h.root.textContent,
      /Current occurrence context loaded\. Your literal entries are kept/,
    );
    assert.equal(h.root.querySelector("#attendance-reported").value, "");
    assert.equal(reload.disabled, false);
    assert.equal(
      h.calls.some(
        (call) =>
          call.path.endsWith("/attendance/preview") ||
          call.path.endsWith("/attendance/create"),
      ),
      false,
    );
  } finally {
    h.cleanup();
  }
});

test("whole-occurrence attendance explicitly reviews zero/null values and creates only one unapproved ordinary draft", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    await enterAttendance(h);
    const preview = h.calls.find((call) =>
      call.path.endsWith("/attendance/preview"),
    );
    assert.deepEqual(preview.body, {
      contextSha256: "a".repeat(64),
      title: "  Fictional whole attendance 😀  ",
      reportedAttendance: 0,
      registeredCount: null,
      walkInCount: null,
      wholeOccurrence: true,
    });
    assert.match(h.root.textContent, /Whole-occurrence attendance: 0/);
    assert.match(
      h.root.textContent,
      /Registrations: Unknown \/ not recorded\. Walk-ins: Unknown/,
    );
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/attendance/create")),
      false,
    );
    const create = h.root
      .querySelectorAll("button")
      .find((el) => el.textContent === "Create unapproved attendance draft");
    assert.equal(create.disabled, true);
    const ack = h.root.querySelector("#attendance-review-check");
    ack.checked = true;
    await ack.emit("change");
    await Promise.all([create.emit("click"), create.emit("click")]);
    await h.flush();
    const calls = h.calls.filter((call) =>
      call.path.endsWith("/attendance/create"),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.previewToken, "exact-attendance-preview");
    assert.ok(calls[0].body.idempotencyKey);
    const link = h.root
      .querySelectorAll("a")
      .find((el) => el.attributes.href === "#module/events/attendance-draft");
    assert.ok(link);
    assert.match(h.root.textContent, /Unapproved attendance draft created/);
    assert.equal(h.changes.length, 1);
    assert.equal(
      h.calls.some((call) =>
        /\/approve|\/transition|\/confirm|\/activate/.test(call.path),
      ),
      false,
    );
  } finally {
    h.cleanup();
  }
});

test("whole attendance may exceed confirmations, while explicit event zero counts remain distinct from unknown", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    const form = await enterAttendance(h, { count: "7" });
    assert.equal(
      h.calls.find((call) => call.path.endsWith("/attendance/preview")).body
        .reportedAttendance,
      7,
    );
    const registered = h.root.querySelector("#attendance-registered"),
      walkIn = h.root.querySelector("#attendance-walk-in"),
      count = h.root.querySelector("#attendance-reported");
    count.value = "0";
    await count.emit("input");
    registered.value = "0";
    await registered.emit("input");
    walkIn.value = "0";
    await walkIn.emit("input");
    assert.equal(
      h.root.querySelector("#attendance-review-check"),
      null,
      "Editing removes the previous acknowledged proposal",
    );
    const scope = h.root.querySelector("#attendance-whole-check");
    scope.checked = true;
    await scope.emit("change");
    await form.emit("submit");
    await h.flush();
    const body = h.calls
      .filter((call) => call.path.endsWith("/attendance/preview"))
      .at(-1).body;
    assert.equal(body.registeredCount, 0);
    assert.equal(body.walkInCount, 0);
    assert.match(h.root.textContent, /Registrations: 0\. Walk-ins: 0/);
  } finally {
    h.cleanup();
  }
});

test("volunteer attendance preserves unknown minutes and has no event-count or scheduled-hours inputs", async () => {
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceModule: "volunteers",
  });
  try {
    await enterAttendance(h, { count: "3" });
    const body = h.calls.find((call) =>
      call.path.endsWith("/attendance/preview"),
    ).body;
    assert.equal(body.reportedAttendance, 3);
    assert.equal(body.registeredCount, null);
    assert.equal(body.walkInCount, null);
    assert.equal(h.root.querySelector("#attendance-registered"), null);
    assert.match(
      h.root.textContent,
      /Recorded minutes: Unknown \/ not recorded/,
    );
    assert.equal(h.model.lastAttendanceCandidate.data.minutes, null);
    assert.equal(h.model.lastAttendanceCandidate.data.startAt, null);
    assert.equal(h.model.lastAttendanceCandidate.data.endAt, null);
  } finally {
    h.cleanup();
  }
});

test("known occurrence zero counts are visible read-only facts, while count inputs retain native labels and constraints", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    h.model.knownRegisteredCount = 0;
    h.model.knownWalkInCount = 0;
    await enterAttendance(h);
    const registered = h.root.querySelector("#attendance-registered"),
      walkIn = h.root.querySelector("#attendance-walk-in");
    assert.equal(registered.value, "0");
    assert.equal(walkIn.value, "0");
    assert.equal(registered.readOnly, true);
    assert.equal(walkIn.readOnly, true);
    const body = h.calls.find((call) =>
      call.path.endsWith("/attendance/preview"),
    ).body;
    assert.equal(body.registeredCount, 0);
    assert.equal(body.walkInCount, 0);
    assert.ok(
      h.root
        .querySelectorAll("label")
        .some((el) => el.attributes.for === "attendance-reported"),
    );
    assert.equal(h.root.querySelector("#attendance-reported").required, true);
    assert.match(
      h.root.textContent,
      /Registrations already recorded in the occurrence: 0/,
    );
  } finally {
    h.cleanup();
  }
});

test("blank/fractional/out-of-range attendance and missing whole-scope acknowledgment never request review", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    await h.click("Load occurrence for attendance");
    const form = h.root.querySelector("form"),
      count = h.root.querySelector("#attendance-reported"),
      scope = h.root.querySelector("#attendance-whole-check");
    for (const value of ["", " ", "-1", "1.5", "1000000001", "not a number"]) {
      count.value = value;
      await count.emit("input");
      scope.checked = true;
      await scope.emit("change");
      await form.emit("submit");
      await h.flush();
      assert.equal(
        h.calls.some((call) => call.path.endsWith("/attendance/preview")),
        false,
      );
      assert.equal(globalThis.document.activeElement.attributes.role, "status");
    }
    count.value = "0";
    await count.emit("input");
    await form.emit("submit");
    await h.flush();
    assert.match(
      h.root.textContent,
      /Confirm that this is an observed count for the whole occurrence/,
    );
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/attendance/preview")),
      false,
    );
    assert.equal(
      h.root.querySelector("#attendance-title").attributes.maxlength,
      "180",
    );
    assert.equal(count.attributes.min, "0");
    assert.equal(count.attributes.step, "1");
  } finally {
    h.cleanup();
  }
});

test("a stale create preserves literal form, requires fresh context and keeps changed known source counts explicit", async () => {
  let refused = false;
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceRequest: ({ path }) => {
      if (path.endsWith("/create") && !refused) {
        refused = true;
        throw Object.assign(new Error("Source changed"), {
          status: 409,
          code: "attendance_stale",
        });
      }
    },
  });
  try {
    await enterAttendance(h, { count: "4", registered: "8" });
    const ack = h.root.querySelector("#attendance-review-check");
    ack.checked = true;
    await ack.emit("change");
    await h.click("Create unapproved attendance draft");
    assert.equal(
      h.root.querySelector("#attendance-title").value,
      "  Fictional whole attendance 😀  ",
    );
    assert.equal(h.root.querySelector("#attendance-reported").value, "4");
    assert.equal(h.root.querySelector("#attendance-registered").value, "8");
    assert.equal(h.root.querySelector("#attendance-review-check"), null);
    assert.equal(
      h.root
        .querySelectorAll("button")
        .find((el) => el.textContent === "Review exact attendance draft")
        .disabled,
      true,
    );
    h.model.attendanceSourceRevision = 8;
    h.model.knownRegisteredCount = 9;
    await h.click("Reload current attendance context");
    assert.equal(
      h.root.querySelector("#attendance-registered").value,
      "8",
      "Refreshing source does not silently replace literal input",
    );
    assert.match(
      h.root.textContent,
      /Registrations already recorded in the occurrence: 9/,
    );
    await h.click("Use recorded registrations value");
    assert.equal(h.root.querySelector("#attendance-registered").value, "9");
    assert.equal(h.root.querySelector("#attendance-registered").readOnly, true);
    assert.equal(
      h.root.querySelector("#attendance-whole-check").checked,
      false,
    );
  } finally {
    h.cleanup();
  }
});

test("unknown create then rate refusal retains one exact command and blocks replacement proposals until explicit Retry resolves it", async () => {
  let attempts = 0;
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceRequest: ({ path, model }) => {
      if (!path.endsWith("/create")) return;
      if (++attempts === 1)
        throw Object.assign(new Error("Interrupted"), {
          status: 0,
          code: "connection_interrupted",
        });
      if (attempts === 2)
        throw Object.assign(new Error("Wait"), { status: 429, code: "rate" });
      return {
        ok: true,
        kind: "already-created",
        disposition: "active",
        record: {
          ...model.lastAttendanceCandidate,
          revision: 3,
          status: "review",
        },
      };
    },
  });
  try {
    await enterAttendance(h, { count: "1" });
    const ack = h.root.querySelector("#attendance-review-check");
    ack.checked = true;
    await ack.emit("change");
    await h.click("Create unapproved attendance draft");
    assert.equal(h.root.querySelector("#attendance-reported").disabled, true);
    assert.equal(
      h.root
        .querySelectorAll("button")
        .find((el) => el.textContent === "Create unapproved attendance draft")
        .disabled,
      true,
    );
    await h.click("Refresh occurrence");
    assert.match(h.root.textContent, /Resolve the earlier attendance create/);
    await h.click("Retry exact attendance create");
    await h.click("Retry exact attendance create");
    const calls = h.calls.filter((call) =>
      call.path.endsWith("/attendance/create"),
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0].body, calls[1].body);
    assert.deepEqual(calls[1].body, calls[2].body);
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance/preview"))
        .length,
      1,
    );
    assert.match(h.root.textContent, /review · revision 3/);
    assert.match(h.root.textContent, /No second draft or approval/);
    assert.equal(h.changes.length, 1);
  } finally {
    h.cleanup();
  }
});

test("an unreadable successful create remains unresolved until an explicit current-record read reconciles it", async () => {
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceRequest: ({ path }) => {
      if (path.endsWith("/create")) return { ok: true, record: null };
    },
  });
  try {
    await enterAttendance(h, { count: "2" });
    const ack = h.root.querySelector("#attendance-review-check");
    ack.checked = true;
    await ack.emit("change");
    await h.click("Create unapproved attendance draft");
    assert.match(h.root.textContent, /response is unresolved/);
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance/create")).length,
      1,
    );
    h.model.attendanceExisting = {
      disposition: "active",
      record: h.model.lastAttendanceCandidate,
    };
    await h.click("Reload current attendance context");
    assert.match(
      h.root.textContent,
      /A saved attendance record is present\. No create was repeated/,
    );
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance/create")).length,
      1,
    );
    assert.equal(h.root.querySelector("#attendance-reported").value, "2");
    assert.equal(h.changes.length, 1);
  } finally {
    h.cleanup();
  }
});

test("a mismatched subset preview is refused without losing the whole-occurrence authored draft", async () => {
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceRequest: ({ path, options, context, candidate }) => {
      if (path.endsWith("/preview"))
        return {
          ok: true,
          previewToken: "wrong-scope",
          expiresAt: "2099-01-01T00:00:00Z",
          preview: {
            method: "whole-occurrence-staff-reported-v1",
            scope: "confirmed-only",
            sourceContext: context().sourceContext,
            candidate: candidate(options.body),
          },
        };
    },
  });
  try {
    await enterAttendance(h, { count: "3" });
    assert.match(h.root.textContent, /preview could not be verified/);
    assert.equal(h.root.querySelector("#attendance-review-check"), null);
    assert.equal(
      h.root.querySelector("#attendance-title").value,
      "  Fictional whole attendance 😀  ",
    );
    assert.equal(h.root.querySelector("#attendance-reported").value, "3");
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/attendance/create")),
      false,
    );
  } finally {
    h.cleanup();
  }
});

test("an accepted-key payload conflict requires reconciliation rather than a replacement command", async () => {
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceRequest: ({ path }) => {
      if (path.endsWith("/create"))
        throw Object.assign(new Error("Different accepted request"), {
          status: 409,
          code: "attendance_command",
        });
    },
  });
  try {
    await enterAttendance(h);
    const ack = h.root.querySelector("#attendance-review-check");
    ack.checked = true;
    await ack.emit("change");
    await h.click("Create unapproved attendance draft");
    assert.match(h.root.textContent, /different accepted request/);
    assert.equal(
      h.root
        .querySelectorAll("button")
        .find((el) => el.textContent === "Retry exact attendance create")
        .disabled,
      true,
    );
    assert.equal(h.root.querySelector("#attendance-reported").disabled, true);
    await h.click("Reload current attendance context");
    assert.match(
      h.root.textContent,
      /does not prove the earlier create failed/,
    );
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance/create")).length,
      1,
    );
    assert.equal(
      h.calls.filter((call) => call.path.endsWith("/attendance/preview"))
        .length,
      1,
    );
  } finally {
    h.cleanup();
  }
});

test("ineligible/existing contexts do not expose a second create, and trashed records use ordinary recovery", async () => {
  const h = await staffHarness({ managed: true, attendance: true });
  try {
    h.model.attendanceCanPrepare = false;
    await h.click("Load occurrence for attendance");
    assert.match(h.root.textContent, /Current occurrence is unavailable/);
    assert.equal(
      h.root
        .querySelectorAll("button")
        .find((el) => el.textContent === "Review exact attendance draft")
        .disabled,
      true,
    );
    h.model.attendanceExisting = {
      disposition: "trash",
      record: {
        id: "old-attendance",
        orgId: "org",
        moduleId: "events",
        status: "cancelled",
        revision: 4,
      },
    };
    await h.click("Reload current attendance context");
    assert.match(h.root.textContent, /An attendance record is in Trash/);
    assert.ok(
      h.root
        .querySelectorAll("a")
        .find((el) => el.attributes.href === "#module/events"),
    );
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/attendance/create")),
      false,
    );
  } finally {
    h.cleanup();
  }
});

test("completed preview delivery after current scope is lost cannot restore a review or authorize create", async () => {
  let release, entered;
  const started = new Promise((resolve) => {
      entered = resolve;
    }),
    gate = new Promise((resolve) => {
      release = resolve;
    });
  const h = await staffHarness({
    managed: true,
    attendance: true,
    attendanceRequest: async ({ path }) => {
      if (path.endsWith("/preview")) {
        entered();
        await gate;
      }
    },
  });
  try {
    await h.click("Load occurrence for attendance");
    const count = h.root.querySelector("#attendance-reported");
    count.value = "6";
    await count.emit("input");
    const scope = h.root.querySelector("#attendance-whole-check");
    scope.checked = true;
    await scope.emit("change");
    const pending = h.root.querySelector("form").emit("submit");
    await started;
    h.revoke();
    release();
    await pending;
    await h.flush();
    assert.equal(h.root.querySelector("#attendance-review-check"), null);
    assert.equal(count.value, "6");
    assert.equal(
      h.calls.some((call) => call.path.endsWith("/attendance/create")),
      false,
    );
  } finally {
    release();
    h.cleanup();
  }
});

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

test("requested interval UI preserves explicit offsets and never offers intervals on a whole-only occurrence", () => {
  const terms = {
    kind: "shift",
    startAt: "2099-01-01T12:00:00Z",
    endAt: "2099-01-01T14:00:00Z",
    timeZone: "UTC",
    intervalPolicy: { version: 1, mode: "within-shift" },
  };
  const start = "2099-01-01T12:15:00+00:00",
    end = "2099-01-01T13:15:00+00:00";
  assert.deepEqual(
    requestedIntervalValue("interval", start, end, "UTC", terms),
    { version: 1, startAt: start, endAt: end, timeZone: "UTC" },
  );
  assert.equal(intervalOffered({ ...terms, kind: "session" }), false);
  assert.throws(
    () =>
      requestedIntervalValue("interval", start, end, "UTC", {
        ...terms,
        intervalPolicy: null,
      }),
    /does not offer/,
  );
  assert.throws(
    () =>
      requestedIntervalValue(
        "interval",
        " 2099-01-01T12:15:00Z ",
        end,
        "UTC",
        terms,
      ),
    /writing is kept/,
  );
  assert.throws(
    () =>
      requestedIntervalValue(
        "interval",
        start,
        "2099-01-01T15:00:00Z",
        "UTC",
        terms,
      ),
    /within/,
  );
});

async function fillOfflineInterval(h) {
  await h.click("Record offline participation consent");
  const choice = h.root.querySelector("#participation-offline-interval-choice");
  choice.value = "interval";
  await choice.emit("change");
  const values = {
    "participation-offline-interval-start": "2099-01-01T12:15:00+00:00",
    "participation-offline-interval-end": "2099-01-01T13:15:00+00:00",
    "participation-consent-method": "Fictional in-person agreement",
    "participation-consent-reference": "fictional-receipt",
    "participation-consent-at": "2026-11-07T12:00:00Z",
  };
  for (const [id, value] of Object.entries(values)) {
    const c = h.root.querySelector(`#${id}`);
    c.value = value;
    await c.emit("input");
  }
  return {
    form: h.root.querySelector("form"),
    choice,
    values,
    ack: h.root.querySelector("#participation-offline-consent"),
  };
}

test("staff interval consent starts fresh, preserves the entered range and records no attendance or email choice", async () => {
  const h = await staffHarness({
    managed: true,
    interval: true,
    entryPatch: { consent: null, intervalChoiceLocked: false },
  });
  try {
    const f = await fillOfflineInterval(h);
    assert.equal(f.ack.checked, false);
    assert.equal(
      h.root.querySelector("#participation-offline-interval-zone").value,
      "UTC",
    );
    f.ack.checked = true;
    await h.root
      .querySelector("#participation-offline-interval-end")
      .emit("input");
    assert.equal(
      f.ack.checked,
      false,
      "Changing schedule requires a fresh specific agreement.",
    );
    await f.form.emit("submit");
    await h.flush();
    assert.equal(h.calls.filter((c) => c.path.endsWith("/consent")).length, 0);
    f.ack.checked = true;
    await f.form.emit("submit");
    await h.flush();
    const call = h.calls.find((c) => c.path.endsWith("/consent"));
    assert.deepEqual(call.body.requestedInterval, {
      version: 1,
      startAt: f.values["participation-offline-interval-start"],
      endAt: f.values["participation-offline-interval-end"],
      timeZone: "UTC",
    });
    assert.equal(call.body.emailUpdates, false);
    assert.equal(call.body.consent, true);
    assert.equal(Object.hasOwn(call.body, "minutes"), false);
    assert.equal(Object.hasOwn(call.body, "attendance"), false);
    await h.click("Record offline participation consent");
    assert.equal(
      h.root.querySelector("#participation-offline-interval-choice").disabled,
      true,
    );
    assert.equal(
      h.root.querySelector("#participation-offline-interval-start").readOnly,
      true,
    );
    assert.equal(
      h.root.querySelector("#participation-offline-consent").checked,
      false,
    );
    assert.match(h.root.textContent, /different range requires cancellation/);
  } finally {
    h.cleanup();
  }
});

test("staff stale interval consent retains exact writing and unknown Retry sends the same range and intent", async () => {
  let mode = 409;
  const h = await staffHarness({
    managed: true,
    interval: true,
    entryPatch: { consent: null, intervalChoiceLocked: false },
    bookingRequest: ({ path }) => {
      if (path.endsWith("/consent") && mode)
        throw Object.assign(
          new Error(
            mode === 409
              ? "Current source changed; writing kept"
              : "Synthetic response lost",
          ),
          mode === 409 ? { status: 409 } : {},
        );
    },
  });
  try {
    const f = await fillOfflineInterval(h);
    f.ack.checked = true;
    await f.form.emit("submit");
    await h.flush();
    assert.equal(h.root.querySelector("form"), f.form);
    for (const [id, value] of Object.entries(f.values))
      assert.equal(h.root.querySelector(`#${id}`).value, value);
    const first = h.calls.find((c) => c.path.endsWith("/consent"));
    mode = "network";
    await f.form.emit("submit");
    await h.flush();
    mode = null;
    await f.form.emit("submit");
    await h.flush();
    const calls = h.calls.filter((c) => c.path.endsWith("/consent"));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].body, first.body);
    assert.deepEqual(calls[2].body, first.body);
    assert.match(h.root.textContent, /Offline consent recorded/);
  } finally {
    h.cleanup();
  }
});

test("staff confirms the saved interval pin, distinguishes total commitments from peak, and cannot edit a recorded whole choice", async () => {
  const requestedInterval = {
    version: 1,
    startAt: "2099-01-01T12:15:01.123Z",
    endAt: "2099-01-01T13:15:02.456Z",
    timeZone: "UTC",
  };
  const h = await staffHarness({
    managed: true,
    interval: true,
    entryPatch: {
      requestedInterval,
      allocationHash: "a".repeat(64),
      intervalChoiceLocked: true,
    },
  });
  try {
    assert.match(h.root.textContent, /Confirmed commitments 2/);
    assert.match(h.root.textContent, /Peak concurrent places 1/);
    assert.doesNotMatch(h.root.textContent, /Available now/);
    await h.click("Confirm one place");
    assert.match(
      h.root.querySelector("form").textContent,
      /displayed requested interval/,
    );
    assert.ok(
      h.root
        .querySelector("form")
        .textContent.includes(requestedInterval.startAt),
    );
    assert.ok(
      h.root
        .querySelector("form")
        .textContent.includes(requestedInterval.endAt),
    );
    assert.equal(
      h.root.querySelector("#participation-decision-check").checked,
      false,
    );
    h.root.querySelector("#participation-decision-check").checked = true;
    await h.root.querySelector("form").emit("submit");
    await h.flush();
    assert.equal(
      h.calls.find((c) => c.path.endsWith("/confirm")).body.allocationHash,
      "a".repeat(64),
    );
    assert.match(
      h.root.textContent,
      /not recorded attendance or worked minutes/,
    );
  } finally {
    h.cleanup();
  }
  const whole = await staffHarness({
    managed: true,
    interval: true,
    entryPatch: { intervalChoiceLocked: true, requestedInterval: null },
  });
  try {
    await whole.click("Record offline participation consent");
    assert.equal(
      whole.root.querySelector("#participation-offline-interval-choice")
        .disabled,
      true,
    );
    assert.equal(
      whole.root.querySelector("#participation-offline-interval-choice").value,
      "whole",
    );
  } finally {
    whole.cleanup();
  }
});

test("exact cancellation Retry remains successful and exposes the retained missing-journal warning", async () => {
  let attempts = 0,
    saved;
  const h = await staffHarness({
    managed: true,
    bookingRequest: ({ path, model, row }) => {
      if (!path.endsWith("/cancel")) return;
      if (!saved) {
        saved = { ...row(), state: "cancelled", revision: row().revision + 1 };
        model.entryPatch = { ...model.entryPatch, ...saved };
      }
      if (++attempts === 1)
        throw new Error("Synthetic committed response lost");
      return {
        ok: true,
        participation: saved,
        notificationQueued: false,
        auditRetained: false,
      };
    },
  });
  try {
    await h.click("Cancel participation");
    const form = h.root.querySelector("form");
    form.querySelector("textarea").value = "Fictional explicit cancellation";
    await form.querySelector("textarea").emit("input");
    const ack = form.querySelector("input");
    ack.checked = true;
    await ack.emit("change");
    await form.emit("submit");
    await h.flush();
    assert.equal(h.root.querySelector("form"), form);
    await form.emit("submit");
    await h.flush();
    const calls = h.calls.filter((c) => c.path.endsWith("/cancel"));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].body, calls[1].body);
    assert.match(h.root.textContent, /Cancellation recorded/);
    assert.match(
      h.root.textContent,
      /change is saved, but some journal entries could not be retained/,
    );
    assert.equal(h.root.querySelector("form"), null);
  } finally {
    h.cleanup();
  }
});

test("delivery policy disable remains a success with a truthful missing-journal warning", async () => {
  const h = await staffHarness({ managed: true, delivery: true });
  try {
    h.model.auditRetained = false;
    h.model.policy.enabled = true;
    await h.click("Refresh delivery policy");
    await h.click("Disable organization email delivery");
    const ack = h.root.querySelector("#delivery-disable-confirm");
    ack.checked = true;
    await ack.emit("change");
    await h.root
      .querySelector("#participation-delivery-disable")
      .emit("submit");
    await h.flush();
    assert.match(h.root.textContent, /Organization delivery disabled/);
    assert.match(
      h.root.textContent,
      /change is saved, but some journal entries could not be retained/,
    );
  } finally {
    h.cleanup();
  }
});

test("an already uncertain command survives later rate and validation refusals with exactly its original key", () => {
  let n = 0;
  const intent = commandIntent(() => `closed-intent-${++n}`),
    payload = { revision: 1 };
  const first = intent.prepare("/cancel", payload);
  intent.rejected();
  for (const code of [429, 422, 403, 409]) {
    assert.deepEqual(intent.prepare("/cancel", payload), first);
    intent.rejected(code);
  }
  assert.deepEqual(intent.prepare("/cancel", payload), first);
  assert.equal(n, 1);
  assert.throws(
    () => intent.prepare("/cancel", { revision: 2 }),
    /earlier response/,
  );
  const malformed = commandIntent(() => `closed-intent-${++n}`),
    original = malformed.prepare("/confirm", payload);
  // A successful HTTP response whose DTO failed admission did not clear it.
  malformed.prepare("/confirm", payload);
  malformed.rejected(429);
  assert.deepEqual(malformed.prepare("/confirm", payload), original);
});

test("known saved cancellation and missing-journal warning survive a failed follow-up read", async () => {
  let committed = false;
  const h = await staffHarness({
    managed: true,
    bookingRequest: ({ path, options, row }) => {
      if (path.endsWith("/cancel")) {
        committed = true;
        return {
          ok: true,
          participation: {
            ...row(),
            revision: row().revision + 1,
            state: "cancelled",
          },
          auditRetained: false,
        };
      }
      if (committed && options.method !== "POST" && path.endsWith("/target"))
        throw new Error("Synthetic follow-up unavailable");
    },
  });
  try {
    await h.click("Cancel participation");
    const form = h.root.querySelector("form");
    form.querySelector("textarea").value = "Explicit fictional cancel";
    form.querySelector("input").checked = true;
    await form.emit("submit");
    await h.flush();
    assert.match(h.root.textContent, /Cancellation recorded/);
    assert.match(
      h.root.textContent,
      /some journal entries could not be retained/,
    );
    assert.match(h.root.textContent, /saved view could not be refreshed/);
    assert.equal(h.root.querySelector("form"), null);
    assert.equal(h.calls.filter((c) => c.path.endsWith("/cancel")).length, 1);
  } finally {
    h.cleanup();
  }
});

test("decision errors focus the connected message and preserve literal writing", async () => {
  const h = await staffHarness({
    managed: true,
    bookingRequest: ({ path }) => {
      if (path.endsWith("/confirm"))
        throw Object.assign(new Error("Fictional capacity refusal"), { status: 409 });
    },
  });
  try {
    await h.click("Confirm one place");
    const form = h.root.querySelector("form");
    const reason = form.querySelector("textarea");
    reason.value = "  Literal overlap — 保留\nsecond line  ";
    form.querySelector("input").checked = true;
    reason.focus();
    await form.emit("submit");
    await h.flush();
    const message = form.querySelectorAll("p").find((entry) => entry.attributes.role === "status");
    assert.match(message.textContent, /Fictional capacity refusal/);
    assert.equal(globalThis.document.activeElement, message);
    assert.equal(message.attributes.tabindex, "-1");
    assert.equal(reason.value, "  Literal overlap — 保留\nsecond line  ");
    assert.equal(reason.disabled, false);
  } finally {
    h.cleanup();
  }
});

test("late decision errors cannot reclaim focus from a removed form or lost workspace", async () => {
  for (const scope of ["removed-form", "detached-workspace", "revoked-scope"]) {
    let reject;
    const h = await staffHarness({
      managed: true,
      bookingRequest: ({ path }) => {
        if (path.endsWith("/confirm"))
          return new Promise((_resolve, no) => { reject = no; });
      },
    });
    try {
      await h.click("Confirm one place");
      const form = h.root.querySelector("form");
      form.querySelector("input").checked = true;
      await form.emit("submit");
      await h.flush();
      assert.equal(typeof reject, "function");
      if (scope === "removed-form") form.remove();
      else if (scope === "detached-workspace") h.root.connect(false);
      else h.revoke();
      const outside = globalThis.document.createElement("button");
      outside.connect(true);
      outside.focus();
      reject(new Error("Late fictional refusal"));
      await h.flush();
      assert.equal(globalThis.document.activeElement, outside, scope);
    } finally {
      h.cleanup();
    }
  }
});

test("a malformed cancellation result then rate refusal keeps the form and original exact Retry", async () => {
  let n = 0,
    saved;
  const h = await staffHarness({
    managed: true,
    bookingRequest: ({ path, row }) => {
      if (!path.endsWith("/cancel")) return;
      saved ??= { ...row(), revision: row().revision + 1, state: "cancelled" };
      if (++n === 1) return { ok: true };
      if (n === 2)
        throw Object.assign(new Error("Synthetic rate refusal"), {
          status: 429,
        });
      return { ok: true, participation: saved, auditRetained: false };
    },
  });
  try {
    await h.click("Cancel participation");
    const form = h.root.querySelector("form");
    const reason = form.querySelector("textarea");
    reason.value = "  Literal unchanged reason <界>  ";
    form.querySelector("input").checked = true;
    for (let i = 0; i < 2; i++) {
      await form.emit("submit");
      await h.flush();
      assert.equal(h.root.querySelector("form"), form);
      assert.equal(reason.value, "  Literal unchanged reason <界>  ");
    }
    await form.emit("submit");
    await h.flush();
    const calls = h.calls.filter((c) => c.path.endsWith("/cancel"));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].body, calls[0].body);
    assert.deepEqual(calls[2].body, calls[0].body);
    assert.match(h.root.textContent, /Cancellation recorded/);
    assert.match(
      h.root.textContent,
      /some journal entries could not be retained/,
    );
  } finally {
    h.cleanup();
  }
});

test("known disabled policy and missing-journal warning survive a failed follow-up read", async () => {
  let disabled = false;
  const h = await staffHarness({
    managed: true,
    delivery: true,
    bookingRequest: ({ path, options }) => {
      if (path.endsWith("/participation-delivery/disable")) disabled = true;
      else if (
        disabled &&
        options.method !== "POST" &&
        path.endsWith("/participation-delivery")
      )
        throw new Error("Synthetic policy refresh unavailable");
    },
  });
  try {
    h.model.auditRetained = false;
    h.model.policy.enabled = true;
    await h.click("Refresh delivery policy");
    await h.click("Disable organization email delivery");
    h.root.querySelector("#delivery-disable-confirm").checked = true;
    await h.root
      .querySelector("#participation-delivery-disable")
      .emit("submit");
    await h.flush();
    assert.match(h.root.textContent, /Organization delivery disabled/);
    assert.match(
      h.root.textContent,
      /some journal entries could not be retained/,
    );
    assert.match(h.root.textContent, /saved view could not be refreshed/);
    assert.equal(h.root.querySelector("#participation-delivery-disable"), null);
    assert(
      !h.root
        .querySelectorAll("button")
        .some(
          (button) =>
            button.textContent === "Disable organization email delivery",
        ),
    );
    assert.equal(
      h.calls.filter((c) => c.path.endsWith("/disable") && c.method === "POST")
        .length,
      1,
    );
  } finally {
    h.cleanup();
  }
});

test("staff malformed consent without saved pins then rate refusal keeps the exact range and Retry key", async () => {
  let attempts = 0,
    saved;
  const h = await staffHarness({
    managed: true,
    interval: true,
    entryPatch: { consent: null, intervalChoiceLocked: false },
    bookingRequest: ({ path, options, row }) => {
      if (!path.endsWith("/consent")) return;
      const b = options.body;
      saved ??= {
        ...row(),
        revision: row().revision + 1,
        requestedInterval: {
          timeZone: b.requestedInterval.timeZone,
          endAt: b.requestedInterval.endAt,
          version: 1,
          startAt: b.requestedInterval.startAt,
        },
        intervalChoiceLocked: true,
        allocationHash: "a".repeat(64),
        consent: {
          revision: 1,
          at: b.consentedAt,
          sourceRevision: b.sourceRevision,
          termsHash: b.termsHash,
          waitlistAllowed: b.waitlistAllowed,
          method: b.method,
          evidenceRef: b.evidenceRef || null,
          allocationHash: "a".repeat(64),
        },
      };
      if (++attempts === 1) {
        const malformed = { ...saved };
        delete malformed.consent;
        delete malformed.allocationHash;
        return { ok: true, participation: malformed };
      }
      if (attempts === 2)
        throw Object.assign(new Error("Synthetic rate refusal"), {
          status: 429,
        });
      return { ok: true, participation: saved };
    },
  });
  try {
    const f = await fillOfflineInterval(h);
    f.ack.checked = true;
    for (let i = 0; i < 2; i++) {
      await f.form.emit("submit");
      await h.flush();
      assert.equal(h.root.querySelector("form"), f.form);
      for (const [id, value] of Object.entries(f.values))
        assert.equal(h.root.querySelector(`#${id}`).value, value);
    }
    await f.form.emit("submit");
    await h.flush();
    const calls = h.calls.filter((c) => c.path.endsWith("/consent"));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].body, calls[0].body);
    assert.deepEqual(calls[2].body, calls[0].body);
    assert.match(h.root.textContent, /Offline consent recorded/);
  } finally {
    h.cleanup();
  }
});
