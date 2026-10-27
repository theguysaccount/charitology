import test from "node:test";
import assert from "node:assert/strict";
import {
  reportMoney,
  checkedGrantReport,
  freezeIntent,
  renderGrantReport,
  createGrantReportWorkspace,
} from "./grant-reports.js";

const hash = "a".repeat(64);
const currency = { code: "USD", precision: 2 };
const money = (minor) => ({ minor, currency: "USD", precision: 2 });
const failure = (message, status = 0) =>
  Object.assign(new Error(message), { status });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function fixtureReport({ board = false, frozen = false } = {}) {
  const summary = {
    totalMinor: null,
    knownSubtotalMinor: 30000,
    knownCount: 1,
    unknownCount: 1,
    selectedCount: 2,
    coverage: "partial",
    notice:
      "One selected receipt amount is unknown; this is not complete ledger coverage.",
    items: [
      {
        source: { moduleId: "fundraising", id: "receipt", revision: 3 },
        date: "2026-10-01",
        amount: money(30000),
        ...(!board
          ? {
              externalSystem: "fictional-ledger",
              receiptReference: "private-receipt-ref",
            }
          : {}),
      },
    ],
  };
  return {
    format: "charitology-os-report",
    kind: board ? "grant-period-board" : "grant-period",
    schemaVersion: 1,
    methodVersion: "grant-report-v1",
    title: "Fictional grant report",
    manifest: {
      id: "manifest",
      revision: 4,
      sourceDigest: hash,
      audience: "board",
    },
    program: { id: "program", revision: 2, title: "Fictional program" },
    agreement: { id: "agreement", revision: 3, programId: "program" },
    period: {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      convention: "inclusive-dates",
    },
    currency,
    sections: {
      summary: "An approved aggregate narrative, not certified accounts.",
      grantContext: {
        awarded: money(100000),
        committed: money(null),
        recordedAgreementSpending: money(10000),
        restriction: {
          status: "restricted",
          code: "food",
          purpose: "Fictional permitted purpose",
        },
      },
      finances: {
        receipts: summary,
        spending: {
          ...summary,
          totalMinor: 10000,
          knownSubtotalMinor: 10000,
          knownCount: 1,
          unknownCount: 0,
          selectedCount: 1,
          coverage: "complete",
          notice: "Selected spending references only.",
          items: [],
        },
        planning: [],
      },
      observations: [
        {
          source: { moduleId: "outcomes", id: "observation", revision: 5 },
          title: "<img src=x onerror=alert(1)>",
          indicator: {
            id: "indicator",
            title: "Fictional observed count",
            unit: "items",
          },
          value: 0,
          unit: "items",
          denominator: null,
          period: { startDate: "2026-10-01", endDate: "2026-10-31" },
          evidence: "self-reported",
          method: "administrative",
          limitations: "Population overlap is unknown.",
          ...(!board ? { sourceUrl: "javascript:alert(1)" } : {}),
        },
      ],
      gaps: {
        declared: "A receipt amount remains unknown.",
        selection: { receiptCount: 2, financeCount: 1, outcomeCount: 1 },
        notices: ["No outcome values are pooled."],
      },
    },
    sourceRevisions: [
      {
        moduleId: "fundraising",
        id: "receipt",
        revision: 3,
        dataHash: hash,
        ...(!board
          ? {
              approval: {
                revision: 3,
                actorId: "private-reviewer",
                at: "2026-10-26T00:00:00Z",
              },
            }
          : {}),
      },
    ],
    trace: [
      {
        outputPath: "sections.finances.receipts.totalMinor",
        operation: "known-minor-sum-v1",
        missingness: "One unknown amount",
        sources: [
          {
            moduleId: "fundraising",
            id: "receipt",
            revision: 3,
            fields: ["data.amount"],
          },
        ],
      },
    ],
    ...(!board
      ? {
          modules: [
            {
              id: "fundraising",
              records: [
                {
                  id: "receipt",
                  revision: 3,
                  data: { contactId: "private-contact", amount: money(30000) },
                },
              ],
            },
          ],
        }
      : {}),
    ...(frozen
      ? { id: "report-1", createdAt: "2026-10-26T00:00:00Z", checksum: hash }
      : {}),
  };
}

// This lightweight DOM executes the actual module's handlers. It is not browser,
// accounting, authentication, authorization or database evidence.
function installDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.handlers = new Map();
      this.disabled = false;
      this.checked = false;
      this.value = "";
      this.classList = {
        toggle: (name, force) => {
          const names = new Set(
            (this.attributes.class || "").split(/\s+/).filter(Boolean),
          );
          const add = force ?? !names.has(name);
          if (add) names.add(name);
          else names.delete(name);
          this.attributes.class = [...names].join(" ");
        },
        add: (name) => this.classList.toggle(name, true),
        remove: (name) => this.classList.toggle(name, false),
      };
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === "id") this.id = String(value);
      if (key === "value") this.value = String(value);
    }
    addEventListener(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.handlers.get(type)?.delete(fn);
    }
    async emit(type) {
      for (const fn of [...(this.handlers.get(type) || [])])
        await fn({ currentTarget: this, preventDefault() {} });
    }
    append(...values) {
      for (const value of values.flat(Infinity)) {
        this.children.push(value);
        if (value instanceof Element) value.parentElement = this;
      }
    }
    replaceChildren(...values) {
      for (const child of this.children)
        if (child instanceof Element) child.parentElement = null;
      this.children = [];
      this.append(...values);
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (item) => item !== this,
        );
      this.parentElement = null;
    }
    focus() {
      document.activeElement = this;
    }
    querySelectorAll(selector) {
      const selectors = selector.split(",").map((part) => part.trim());
      const matches = (element, s) =>
        s.startsWith("#")
          ? element.id === s.slice(1)
          : s.startsWith(".")
            ? (element.attributes.class || "").split(/\s+/).includes(s.slice(1))
            : element.tagName === s.toUpperCase();
      return this.children.flatMap((child) =>
        child instanceof Element
          ? [
              ...(selectors.some((s) => matches(child, s)) ? [child] : []),
              ...child.querySelectorAll(selector),
            ]
          : [],
      );
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
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
    click() {
      if (!this.disabled) return this.emit("click");
    }
  }
  const document = new Element("document");
  document.visibilityState = "visible";
  document.createElement = (tag) => new Element(tag);
  document.createTextNode = (value) => String(value);
  document.body = new Element("body");
  document.append(document.body);
  const window = new Element("window");
  window.prints = 0;
  window.print = () => {
    window.prints++;
  };
  globalThis.document = document;
  globalThis.window = window;
  globalThis.Node = Element;
  return {
    document,
    window,
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function harness({
  role = "owner",
  intercept = () => undefined,
  pages = null,
} = {}) {
  const dom = installDom();
  const calls = [],
    writes = [],
    dirty = [],
    saved = [],
    opened = [];
  const model = {
    current: true,
    failRead: null,
    manifest: {
      id: "manifest",
      moduleId: "reporting",
      revision: 4,
      status: "approved",
      approval: { status: "approved", revision: 4 },
      data: {
        title: "Fictional manifest",
        assemblyMethod: "grant-report-v1",
        sourceDigest: hash,
        agreementId: "agreement",
        programId: "program",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        financeIds: [],
        outcomeIds: [],
        receiptIds: ["receipt"],
        visibility: "board",
      },
    },
  };
  const report = () =>
    fixtureReport({ board: role === "board_reader", frozen: true });
  const request = async (path, options = {}) => {
    const call = {
      path,
      method: options.method || "GET",
      body: structuredClone(options.body),
    };
    calls.push(call);
    const intercepted = intercept(call, model);
    if (intercepted !== undefined) return await intercepted;
    if (call.method === "GET" && model.failRead) throw model.failRead;
    if (path.endsWith("/prepare"))
      return {
        ok: true,
        sourceDigest: hash,
        report: fixtureReport(),
        issues: [],
      };
    if (path.endsWith("/preview"))
      return {
        ok: true,
        previewId: "preview",
        reviewHash: hash,
        expiresAt: "2099-01-01T00:00:00Z",
        report: fixtureReport(),
        issues: [],
      };
    if (path.endsWith("/freeze")) return { ok: true, report: report() };
    if (path.endsWith("/report-1")) return { ok: true, report: report() };
    const cursor = new URL(path, "https://fictional.invalid").searchParams.get(
      "cursor",
    );
    if (pages) return pages[cursor || "first"];
    return {
      ok: true,
      reports: [
        {
          id: "report-1",
          title: "Fictional grant report",
          period: report().period,
          checksum: hash,
          createdAt: "2026-10-26T00:00:00Z",
          audience: "board",
        },
      ],
      nextCursor: null,
    };
  };
  const api = {
    records: async (...args) => {
      calls.push({ api: "records", args });
      return { records: [structuredClone(model.manifest)] };
    },
    record: async (...args) => {
      calls.push({ api: "record", args });
      return { record: structuredClone(model.manifest) };
    },
    updateRecord: async (...args) => {
      writes.push(args);
      const intercepted = intercept({ api: "updateRecord", args }, model);
      if (intercepted !== undefined) return await intercepted;
      model.manifest = {
        ...model.manifest,
        data: args[3].data,
        revision: model.manifest.revision + 1,
        status: "review",
        approval: null,
      };
      return { record: structuredClone(model.manifest) };
    },
  };
  const root = await createGrantReportWorkspace({
    org: "org",
    role,
    request,
    api,
    isCurrent: () => model.current,
    onDirty: (value) => dirty.push(value),
    onSaved: (...args) => saved.push(args),
    openManifest: (id) => opened.push(id),
  });
  dom.document.body.append(root);
  const find = (text) =>
    root
      .querySelectorAll("button")
      .find((element) => element.textContent === text);
  return {
    ...dom,
    root,
    model,
    calls,
    writes,
    dirty,
    saved,
    opened,
    find,
    async select() {
      const picker = root.querySelector("#grant-report-manifest");
      picker.value = "manifest";
      await picker.emit("change");
    },
    async finalPreview() {
      await this.select();
      await find("Preview approved report").emit("click");
    },
    async freeze() {
      const ack = root.querySelector("#grant-report-freeze-ack");
      ack.checked = true;
      await ack.emit("change");
      await root.querySelector(".grant-report-freeze-form").emit("submit");
    },
    cleanup() {
      root.dispose();
      dom.restore();
    },
  };
}

test("money labels retain exact minor units, unknowns and supported currency precision", () => {
  assert.equal(reportMoney(money(null)), "Unknown (USD)");
  assert.equal(reportMoney(money(0)), "USD 0.00");
  assert.equal(
    reportMoney(money(Number.MAX_SAFE_INTEGER)),
    "USD 90,071,992,547,409.91",
  );
  assert.equal(
    reportMoney({ minor: 1029, currency: "KWD", precision: 3 }),
    "KWD 1.029",
  );
  assert.equal(
    reportMoney({ minor: 1029, currency: "JPY", precision: 0 }),
    "JPY 1,029",
  );
  assert.match(
    reportMoney({ minor: 2 ** 53, currency: "USD", precision: 2 }),
    /Invalid/,
  );
  assert.match(reportMoney(null), /Unknown amount/);
});

test("board readers reject a misrouted staff payload instead of rendering or downloading it", () => {
  const full = fixtureReport({ frozen: true });
  assert.throws(() => checkedGrantReport(full, { board: true, frozen: true }));
  const disguised = { ...full, kind: "grant-period-board" };
  assert.throws(
    () => checkedGrantReport(disguised, { board: true }),
    /unavailable fields/,
  );
  const nested = fixtureReport({ board: true });
  nested.sections.finances.receipts.items[0].contactId = "private-contact";
  assert.throws(
    () => checkedGrantReport(nested, { board: true }),
    /unavailable fields/,
  );
  assert.equal(
    checkedGrantReport(fixtureReport({ board: true, frozen: true }), {
      board: true,
      frozen: true,
    }).id,
    "report-1",
  );
});

test("an ambiguous freeze retries the same command identity and forbids a changed preview", () => {
  let next = 0;
  const intent = freezeIntent(() => `command-${++next}`);
  const preview = { previewId: "one", reviewHash: hash };
  const first = intent.body(preview);
  intent.rejected(0);
  assert.deepEqual(intent.body({ ...preview }), first);
  assert.throws(
    () => intent.body({ previewId: "two", reviewHash: hash }),
    /earlier freeze/,
  );
  intent.rejected(422);
  assert.notEqual(intent.body(preview).idempotencyKey, first.idempotencyKey);
});

test("the reader preserves server partial totals and zero observations without executing stored markup", () => {
  const dom = installDom();
  try {
    const report = renderGrantReport(fixtureReport());
    assert.match(report.textContent, /Unknown \(USD\)/);
    assert.match(report.textContent, /USD 300\.00/);
    assert.match(report.textContent, /USD 1,000\.00/);
    assert.match(report.textContent, /Observed value 0/);
    assert.match(report.textContent, /Denominator Unknown/);
    assert.match(report.textContent, /not pooled/);
    assert.equal(report.querySelector("img"), null);
    assert.equal(report.querySelector("a"), null);
    assert.match(report.textContent, /<img src=x/);
    assert.match(report.textContent, /approved aggregate narrative/);
    const board = renderGrantReport(fixtureReport({ board: true }), {
      board: true,
    });
    assert.doesNotMatch(
      board.textContent,
      /private-contact|private-receipt-ref|Staff only/,
    );
  } finally {
    dom.restore();
  }
});

test("source preparation requires explicit normal revisioned save and never approves a manifest", async () => {
  const h = await harness();
  try {
    await h.select();
    await h.find("Prepare sources").emit("click");
    assert.equal(h.writes.length, 0);
    await h.find("Save these source versions to the manifest").emit("click");
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0][3].revision, 4);
    assert.equal(h.writes[0][3].data.sourceDigest, hash);
    assert.equal(h.writes[0][3].data.agreementId, "agreement");
    assert.equal(h.model.manifest.approval, null);
    assert.match(h.root.textContent, /fresh independent approval/);
    assert.equal(h.find("Preview approved report").disabled, true);
    assert.equal(
      h.calls.some((call) => call.path?.endsWith("/approve")),
      false,
    );
    await h.find("Open manifest for review").emit("click");
    assert.deepEqual(h.opened, ["manifest"]);
  } finally {
    h.cleanup();
  }
});

test("failed digest writes keep the prepared view and stale manifest revisions are not overwritten", async () => {
  let fail = true;
  const h = await harness({
    intercept: (call) =>
      call.api === "updateRecord" && fail
        ? Promise.reject(failure("Interrupted save"))
        : undefined,
  });
  try {
    await h.select();
    await h.find("Prepare sources").emit("click");
    await h.find("Save these source versions to the manifest").emit("click");
    assert.match(h.root.textContent, /Prepared sources/);
    assert.match(h.root.textContent, /Interrupted save/);
    assert.ok(h.find("Save these source versions to the manifest"));
    fail = false;
    h.model.manifest.revision++;
    await h.find("Save these source versions to the manifest").emit("click");
    assert.equal(h.writes.length, 1, "No second stale PATCH was issued.");
    assert.match(h.root.textContent, /nothing was overwritten/);
  } finally {
    h.cleanup();
  }
});

test("a freeze needs deliberate acknowledgement and an interrupted response exposes same-key retry only", async () => {
  let attempts = 0;
  const h = await harness({
    intercept: (call) =>
      call.path?.endsWith("/freeze") && ++attempts === 1
        ? Promise.reject(failure("Response interrupted"))
        : undefined,
  });
  try {
    await h.finalPreview();
    await h.root.querySelector(".grant-report-freeze-form").emit("submit");
    assert.equal(attempts, 0);
    await h.freeze();
    assert.match(h.root.textContent, /response unresolved/);
    assert.equal(h.find("Prepare sources").disabled, true);
    assert.equal(h.root.querySelector("#grant-report-manifest").disabled, true);
    await h.find("Retry the same freeze command").emit("click");
    const freezes = h.calls.filter((call) => call.path?.endsWith("/freeze"));
    assert.equal(freezes.length, 2);
    assert.deepEqual(freezes[0].body, freezes[1].body);
    assert.match(h.root.textContent, /Immutable grant report saved/);
    assert.ok(h.find("Download report JSON"));
    assert.equal(h.dirty.at(-1), false);
  } finally {
    h.cleanup();
  }
});

test("a definitive stale freeze cannot claim success or reuse its old final preview", async () => {
  const h = await harness({
    intercept: (call) =>
      call.path?.endsWith("/freeze")
        ? Promise.reject(failure("Source versions changed", 409))
        : undefined,
  });
  try {
    await h.finalPreview();
    await h.freeze();
    assert.match(h.root.textContent, /preview cannot be frozen/);
    assert.equal(h.find("Retry the same freeze command"), undefined);
    assert.equal(h.root.querySelector(".grant-report-freeze-form"), null);
    assert.doesNotMatch(h.root.textContent, /Immutable grant report saved/);
    assert.equal(h.find("Prepare sources").disabled, false);
  } finally {
    h.cleanup();
  }
});

test("natural edition reuse opens the existing report without claiming a new command receipt", async () => {
  const h = await harness({
    intercept: (call) =>
      call.path?.endsWith("/freeze")
        ? {
            ok: true,
            report: fixtureReport({ frozen: true }),
            reused: true,
            commandRecorded: false,
          }
        : undefined,
  });
  try {
    await h.finalPreview();
    await h.freeze();
    assert.match(h.root.textContent, /Opened the existing approved edition/);
    assert.match(
      h.root.textContent,
      /No new report or command receipt was created/,
    );
    assert.equal(h.dirty.at(-1), false);
    assert.ok(h.find("Download report JSON"));
  } finally {
    h.cleanup();
  }
});

test("an unreadable accepted-response shape stays ambiguous and retries its original key", async () => {
  let attempts = 0;
  const h = await harness({
    intercept: (call) =>
      call.path?.endsWith("/freeze") && ++attempts === 1
        ? { ok: true, report: { title: "Unverified response" } }
        : undefined,
  });
  try {
    await h.finalPreview();
    await h.freeze();
    assert.match(h.root.textContent, /response unresolved/);
    assert.doesNotMatch(h.root.textContent, /Immutable grant report saved/);
    await h.find("Retry the same freeze command").emit("click");
    const freezes = h.calls.filter((call) => call.path?.endsWith("/freeze"));
    assert.deepEqual(freezes[0].body, freezes[1].body);
  } finally {
    h.cleanup();
  }
});

test("expired previews stay inspectable but cannot issue a freeze command", async () => {
  const now = Date.now;
  const expires = now() + 60000;
  const h = await harness({
    intercept: (call) =>
      call.path?.endsWith("/preview")
        ? {
            ok: true,
            previewId: "short-preview",
            reviewHash: hash,
            expiresAt: new Date(expires).toISOString(),
            report: fixtureReport(),
          }
        : undefined,
  });
  try {
    await h.finalPreview();
    Date.now = () => expires + 1;
    await h.freeze();
    assert.match(h.root.textContent, /This preview expired/);
    assert.match(
      h.root.querySelector(".grant-report-stage").textContent,
      /Fictional program/,
    );
    assert.equal(
      h.root.querySelector("#grant-report-freeze-submit").disabled,
      true,
    );
    assert.equal(
      h.root.querySelector("#grant-report-freeze-ack").disabled,
      true,
    );
    assert.equal(
      h.calls.some((call) => call.path?.endsWith("/freeze")),
      false,
    );
  } finally {
    Date.now = now;
    h.cleanup();
  }
});

test("a downgraded-role replay shape clears previously visible staff sources while preserving same-key recovery", async () => {
  const h = await harness({
    intercept: (call) =>
      call.path?.endsWith("/freeze")
        ? { ok: true, report: fixtureReport({ board: true, frozen: true }) }
        : undefined,
  });
  try {
    await h.find("Read report").emit("click");
    assert.match(
      h.root.querySelector(".grant-report-reader").textContent,
      /private-contact/,
    );
    await h.finalPreview();
    await h.freeze();
    assert.equal(h.root.querySelector(".grant-report-reader").textContent, "");
    assert.doesNotMatch(
      h.root.textContent,
      /private-contact|private-receipt-ref|approved aggregate narrative/,
    );
    assert.ok(h.find("Retry the same freeze command"));
    await h.find("Retry the same freeze command").emit("click");
    const freezes = h.calls.filter((call) => call.path?.endsWith("/freeze"));
    assert.deepEqual(freezes[0].body, freezes[1].body);
    assert.equal(h.dirty.at(-1), true);
  } finally {
    h.cleanup();
  }
});

test("board navigation fetches only safe grant pages and never asks for manifest records", async () => {
  const h = await harness({
    role: "board_reader",
    pages: {
      first: {
        reports: [
          { id: "report-1", title: "First", period: {}, checksum: hash },
        ],
        nextCursor: "page two",
      },
      "page two": {
        reports: [
          { id: "report-1", title: "Duplicate", period: {}, checksum: hash },
          { id: "report-2", title: "Second", period: {}, checksum: hash },
        ],
        nextCursor: null,
      },
    },
  });
  try {
    assert.equal(
      h.calls.some((call) => call.api),
      false,
    );
    assert.equal(h.root.querySelector("#grant-report-manifest"), null);
    await h.find("Load more reports").emit("click");
    assert.match(h.calls.at(-1).path, /cursor=page%20two$/);
    assert.equal(
      h.root
        .querySelectorAll("button")
        .filter((button) => button.textContent === "Read report").length,
      2,
    );
    assert.doesNotMatch(h.root.textContent, /Duplicate/);
    await h.find("Read report").emit("click");
    assert.match(
      h.root.querySelector(".grant-report-reader").textContent,
      /approved aggregate narrative/,
    );
    assert.doesNotMatch(
      h.root.querySelector(".grant-report-reader").textContent,
      /private-contact|private-receipt-ref/,
    );
  } finally {
    h.cleanup();
  }
});

test("failed read/export rechecks hide prior private output rather than retaining an authorized-looking stale report", async () => {
  const h = await harness({ role: "board_reader" });
  try {
    await h.find("Read report").emit("click");
    assert.match(
      h.root.querySelector(".grant-report-reader").textContent,
      /Fictional program/,
    );
    h.model.failRead = failure("Membership ended", 403);
    await h.find("Download report JSON").emit("click");
    assert.equal(h.root.querySelector(".grant-report-reader").textContent, "");
    assert.doesNotMatch(h.root.textContent, /approved aggregate narrative/);
    assert.match(h.root.textContent, /Membership ended/);
  } finally {
    h.cleanup();
  }
});

test("a late private report response cannot repaint after the parent's epoch or session changes", async () => {
  const gate = deferred();
  const h = await harness({
    role: "board_reader",
    intercept: (call) =>
      call.path?.endsWith("/report-1") ? gate.promise : undefined,
  });
  try {
    const reading = h.find("Read report").emit("click");
    h.model.current = false;
    gate.resolve({
      ok: true,
      report: fixtureReport({ board: true, frozen: true }),
    });
    await reading;
    assert.equal(h.root.textContent, "");
  } finally {
    h.cleanup();
  }
});

test("focus refresh checks authority before repainting and failed checks leave private content hidden", async () => {
  const h = await harness();
  try {
    await h.find("Read report").emit("click");
    h.model.failRead = failure("Session check failed");
    await h.window.emit("focus");
    await flush();
    assert.equal(h.root.querySelector(".grant-report-reader").textContent, "");
    assert.doesNotMatch(h.root.textContent, /approved aggregate narrative/);
    assert.match(h.root.textContent, /Session check failed/);
  } finally {
    h.cleanup();
  }
});

test("returning to a hidden tab while a read is pending rechecks instead of repainting its obsolete private response", async () => {
  const gate = deferred();
  const h = await harness({
    role: "board_reader",
    intercept: (call) =>
      call.path?.endsWith("/report-1") ? gate.promise : undefined,
  });
  try {
    const reading = h.find("Read report").emit("click");
    h.document.visibilityState = "hidden";
    await h.document.emit("visibilitychange");
    h.document.visibilityState = "visible";
    await h.document.emit("visibilitychange");
    gate.resolve({
      ok: true,
      report: fixtureReport({ board: true, frozen: true }),
    });
    await reading;
    await flush();
    assert.equal(h.root.querySelector(".grant-report-reader").textContent, "");
    assert.match(
      h.root.textContent,
      /Saved grant reports and current access refreshed/,
    );
    assert.ok(h.find("Read report"));
  } finally {
    h.cleanup();
  }
});

test("print uses a fresh authorized report and its private print surface is removed on dispose", async () => {
  const h = await harness({ role: "board_reader" });
  try {
    await h.find("Read report").emit("click");
    await h.find("Print report").emit("click");
    assert.equal(h.window.prints, 1);
    assert.equal(
      h.calls.filter((call) => call.path?.endsWith("/report-1")).length,
      2,
    );
    const surface = h.document.body.querySelector(
      ".grant-report-print-surface",
    );
    assert.ok(surface);
    assert.doesNotMatch(
      surface.textContent,
      /private-contact|private-receipt-ref/,
    );
    h.root.dispose();
    assert.equal(
      h.document.body.querySelector(".grant-report-print-surface"),
      null,
    );
  } finally {
    h.cleanup();
  }
});
