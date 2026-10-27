import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { api, setCsrfToken } from "./api.js";
import { recordTitle, stateLabel, labelFor, formatValue } from "./model.js";

// Executes the actual app.js controller and DOM helpers with fictional transport.
// This is not browser, session, permission, calendar or PostgreSQL evidence.
const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
const controllerSource = appSource.slice(
  appSource.indexOf("function createTaskRecurrencePanel("),
  appSource.indexOf("function renderWorkflow("),
);
const helperSource = appSource.slice(
  appSource.indexOf("function node("),
  appSource.indexOf("const loading ="),
);
const copy = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
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
    this.hidden = false;
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === "id") this.id = String(value);
    if (key === "value") this.value = String(value);
  }
  addEventListener(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }
  append(...children) {
    for (const child of children) {
      this.children.push(child);
      if (child instanceof Element) child.parentElement = this;
    }
    if (this.tagName === "TEXTAREA") this.value = this.textContent;
  }
  replaceChildren(...children) {
    for (const child of this.children)
      if (child instanceof Element) child.parentElement = null;
    this.children = [];
    this.append(...children);
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
  querySelectorAll(selector) {
    const matches = (el) =>
      selector.startsWith("#")
        ? el.id === selector.slice(1)
        : selector.startsWith("[")
          ? Object.hasOwn(el.attributes, selector.slice(1, -1))
          : el.tagName === selector.toUpperCase();
    return this.children.flatMap((child) =>
      child instanceof Element
        ? [
            ...(matches(child) ? [child] : []),
            ...child.querySelectorAll(selector),
          ]
        : [],
    );
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (child) => child !== this,
      );
    this.parentElement = null;
  }
  focus() {}
  async emit(type) {
    if (this.disabled) return;
    for (const handler of this.handlers.get(type) || [])
      await handler({ target: this, currentTarget: this, preventDefault() {} });
  }
  click() {
    return this.emit("click");
  }
}
const record = {
  id: "fictional-root",
  moduleId: "projects",
  revision: 4,
  status: "done",
  ownerId: "former-owner",
  data: { title: "Fictional monthly task", kind: "task" },
};
const module = {
  id: "projects",
  states: [
    { id: "planned", label: "Planned" },
    { id: "done", label: "Done" },
  ],
  workflow: {
    states: [
      { id: "planned", label: "Planned" },
      { id: "done", label: "Done" },
    ],
  },
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "dueAt", label: "Due", type: "text" },
  ],
};
const anchor = {
  frequency: "monthly",
  anchorCivil: "2027-01-31T10:20:30.123",
  anchorInstant: "2027-01-31T15:20:30.123Z",
  originalTimeZone: "America/New_York",
};
const candidate = {
  choice: "unique",
  dueAt: "2027-02-28T10:20:30.123-05:00",
  instant: "2027-02-28T15:20:30.123Z",
  offsetSeconds: -18000,
};
const ready = () => ({
  ok: true,
  kind: "ready",
  previewToken: "fictional-private-memory-token",
  expiresAt: "2027-01-01T00:10:00.000Z",
  preview: {
    sequence: 1,
    sourceApproval: "not-current",
    anchor,
    chosen: candidate,
    candidate: {
      ownerId: "acting-member",
      data: { title: "Fictional copied title", dueAt: candidate.dueAt },
    },
  },
});
const series = () => ({
  id: "fictional-series",
  state: "active",
  revision: 2,
  tipSequence: 1,
  tipRecordId: record.id,
  anchor,
  recoveredState: null,
});
const eligible = () => ({
  ok: true,
  kind: "eligible",
  source: { id: record.id, revision: 4, approval: "not-current" },
  series: null,
});
const inSeries = () => ({ ...eligible(), kind: "series", series: series() });
const activeResult = () => ({
  kind: "active-record",
  seriesId: "fictional-series",
  sequence: 1,
  record: {
    ...record,
    id: "fictional-next",
    revision: 7,
    status: "done",
    data: { title: "Edited later" },
  },
});
function harness(overrides = {}) {
  const calls = [],
    opened = [],
    errors = [];
  let valid = true,
    keys = 0;
  const transport = {};
  for (const [name, fallback] of Object.entries({
    taskRecurrence: eligible,
    previewTaskRecurrence: ready,
    generateTaskRecurrence: () => ({
      ok: true,
      kind: "generated",
      existing: activeResult(),
    }),
    endTaskRecurrence: () => ({
      ok: true,
      kind: "ended",
      series: { ...series(), state: "ended" },
      auditRecorded: true,
    }),
  }))
    transport[name] = async (...args) => {
      calls.push({ name, args: copy(args) });
      return (overrides[name] || fallback)(...args);
    };
  const context = vm.createContext({
    Node: Element,
    document: {
      createElement: (tag) => new Element(tag),
      createTextNode: (text) => String(text),
    },
    api: transport,
    confirmAction: async () => true,
    showError: (error) => {
      errors.push(error);
    },
    notice: (text) => context.node("div", {}, text),
    recordTitle,
    stateLabel,
    labelFor,
    formatValue,
    ownerName: (id) => id,
    recordHref: (mod, id) => `#module/${mod}/${encodeURIComponent(id)}`,
    crypto: { randomUUID: () => `fictional-key-${++keys}` },
  });
  vm.runInContext(helperSource + "\n" + controllerSource, context);
  const panel = context.createTaskRecurrencePanel({
    orgId: "fictional-org",
    record: copy(record),
    module,
    transport,
    isCurrent: () => valid,
    onGenerated:
      overrides.onGenerated ||
      (async (value) => {
        opened.push(value);
      }),
    onTrash: () => {
      opened.push("trash");
    },
    confirm: overrides.confirm || (async () => true),
    newKey: () => `fictional-key-${++keys}`,
  });
  const control = (text) => {
    const found = panel.element
      .querySelectorAll("button")
      .find((el) => el.textContent === text);
    assert.ok(found, `Expected control: ${text}\n${panel.element.textContent}`);
    return found;
  };
  return {
    panel,
    calls,
    opened,
    errors,
    control,
    context,
    invalidateScope() {
      valid = false;
    },
    keys: () => keys,
    text: () => panel.element.textContent,
  };
}

test("recurrence API uses encoded paths, same-origin CSRF and JSON bodies; tokens never enter URLs", async () => {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return new Response('{"ok":true}');
  };
  try {
    setCsrfToken("fictional-csrf");
    await api.taskRecurrence("org A", "task/B");
    await api.previewTaskRecurrence("org A", "task/B", {
      sourceRevision: 4,
      seriesRevision: null,
      resolution: null,
    });
    await api.generateTaskRecurrence("org A", "task/B", {
      previewToken: "private-token",
      idempotencyKey: "fixed-key",
    });
    await api.endTaskRecurrence("org A", "series/B", {
      seriesRevision: 2,
      idempotencyKey: "end-key",
      reason: "private reason",
    });
    assert.equal(
      calls[0].path,
      "/api/orgs/org%20A/task-recurrence/tasks/task%2FB",
    );
    for (const call of calls) {
      assert.equal(call.options.credentials, "same-origin");
      assert.equal(call.options.cache, "no-store");
      assert.doesNotMatch(
        call.path,
        /private-token|private reason|fixed-key|\?/,
      );
    }
    for (const call of calls.slice(1))
      assert.equal(call.options.headers["X-CSRF-Token"], "fictional-csrf");
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      previewToken: "private-token",
      idempotencyKey: "fixed-key",
    });
    assert.equal(
      calls[3].path,
      "/api/orgs/org%20A/task-recurrence/series/series%2FB/end",
    );
  } finally {
    globalThis.fetch = original;
    setCsrfToken("");
  }
});

test("saved-only preview shows exact local, offset, UTC, anchor, owner and unapproved copying policy", async () => {
  const h = harness();
  await h.panel.load();
  await h.control("Preview next draft").click();
  assert.deepEqual(h.calls[1].args, [
    "fictional-org",
    record.id,
    { sourceRevision: 4, seriesRevision: null, resolution: null },
  ]);
  for (const text of [
    candidate.dueAt,
    candidate.instant,
    anchor.anchorCivil,
    anchor.anchorInstant,
    anchor.originalTimeZone,
    "acting-member",
    "original anchor",
    "Planned · no approval",
    "Unsaved editor values",
    "Parent and dependency IDs stay unchanged",
  ])
    assert.ok(h.text().includes(text), text);
  assert.doesNotMatch(h.text(), /fictional-private-memory-token/);
  assert.equal(h.panel.element.querySelectorAll("form").length, 0);
});

test("fold has no preselected choice and requires a second explicit exact preview", async () => {
  const candidates = ["earlier", "later"].map((choice, index) => ({
    ...candidate,
    choice,
    dueAt: `2027-11-07T01:30:00.000-0${index ? 5 : 4}:00`,
    instant: `2027-11-07T0${index ? 6 : 5}:30:00.000Z`,
  }));
  const h = harness({
    previewTaskRecurrence: (_o, _r, body) =>
      body.resolution === null
        ? {
            ok: true,
            kind: "needs-resolution",
            resolution: {
              kind: "fold",
              civil: "2027-11-07T01:30:00.000",
              candidates,
            },
          }
        : ready(),
  });
  await h.panel.load();
  await h.control("Preview next draft").click();
  const radios = h.panel.element.querySelectorAll("input");
  assert.equal(radios.length, 2);
  assert.equal(
    radios.some((el) => el.checked),
    false,
  );
  await h.control("Preview next draft").click();
  assert.equal(h.calls.length, 2);
  await radios[1].emit("change");
  await h.control("Preview selected instant").click();
  assert.equal(h.calls[2].args[2].resolution, "later");
  assert.equal(h.keys(), 0);
  h.control("Generate one unapproved draft");
});

test("gap refusal retains the exact missing local time and exposes no Generate", async () => {
  const h = harness({
    previewTaskRecurrence: () => ({
      ok: true,
      kind: "unavailable",
      message: "Missing local time.",
      resolution: {
        kind: "gap",
        civil: "2027-03-14T02:30:00.000",
        candidates: [],
      },
    }),
  });
  await h.panel.load();
  await h.control("Preview next draft").click();
  assert.match(h.text(), /2027-03-14T02:30:00.000.*does not exist/);
  assert.equal(
    h.panel.element
      .querySelectorAll("button")
      .some((el) => el.textContent.includes("Generate")),
    false,
  );
  assert.equal(h.calls.length, 2);
  assert.equal(h.keys(), 0);
});

test("interrupted Generate retains one exact token/key and cannot start a duplicate or new preview", async () => {
  const gate = deferred();
  let requests = 0;
  const h = harness({
    generateTaskRecurrence: () =>
      ++requests === 1
        ? gate.promise
        : { kind: "existing", existing: activeResult() },
  });
  await h.panel.load();
  await h.control("Preview next draft").click();
  const old = h.control("Generate one unapproved draft"),
    pending = old.click();
  await old.click();
  assert.equal(requests, 1);
  gate.reject(new Error("Fictional response interrupted."));
  await pending;
  assert.match(h.text(), /exact command is retained/);
  assert.equal(h.keys(), 1);
  assert.equal(h.control("Preview next draft").disabled, true);
  await h.control("Retry exact command").click();
  const requestsSent = h.calls.filter(
    (call) => call.name === "generateTaskRecurrence",
  );
  assert.deepEqual(requestsSent[0].args, requestsSent[1].args);
  assert.equal(h.keys(), 1);
  assert.equal(h.opened.length, 0);
  assert.match(h.text(), /existing saved result was found/);
});

test("new editor/view intent invalidates held GET and Preview successes and errors", async () => {
  for (const stage of ["load", "preview"])
    for (const reject of [false, true]) {
      const gate = deferred();
      const h = harness({
        [stage === "load" ? "taskRecurrence" : "previewTaskRecurrence"]: () =>
          gate.promise,
      });
      if (stage === "preview") await h.panel.load();
      const pending =
        stage === "load"
          ? h.panel.load()
          : h.control("Preview next draft").click();
      h.panel.invalidate();
      if (reject) gate.reject(new Error("Old response must not appear"));
      else gate.resolve(stage === "load" ? eligible() : ready());
      await pending;
      assert.match(h.text(), /source view or editor changed/);
      assert.doesNotMatch(
        h.text(),
        /Old response must not appear|Next draft · sequence/,
      );
    }
});

test("Cancel preview invalidates a late preview and sends no command", async () => {
  const gate = deferred(),
    h = harness({ previewTaskRecurrence: () => gate.promise });
  await h.panel.load();
  const pending = h.control("Preview next draft").click();
  await h.control("Cancel preview").click();
  gate.resolve(ready());
  await pending;
  assert.doesNotMatch(h.text(), /Next draft · sequence/);
  assert.equal(h.keys(), 0);
  assert.match(h.text(), /Reload recurrence state/);
});

test("late Generate cannot navigate a newer selection; confirmed GET finds current edited result", async () => {
  const gate = deferred();
  let reads = 0;
  const h = harness({
    taskRecurrence: () =>
      ++reads === 1 ? eligible() : { ...inSeries(), existing: activeResult() },
    generateTaskRecurrence: () => gate.promise,
  });
  await h.panel.load();
  await h.control("Preview next draft").click();
  const pending = h.control("Generate one unapproved draft").click();
  h.panel.invalidate();
  gate.resolve({ kind: "generated", existing: activeResult() });
  await pending;
  assert.equal(h.opened.length, 0);
  assert.equal(h.control("Retry exact command").disabled, true);
  await h.control("Reload recurrence state").click();
  assert.match(h.text(), /Edited later/);
  assert.match(h.text(), /Later edits and workflow changes/);
  assert.equal(
    h.panel.element
      .querySelectorAll("button")
      .some((el) => el.textContent === "Retry exact command"),
    false,
  );
  assert.equal(h.keys(), 1);
});

test("permanent End requires confirmation, keeps raw reason and retries its exact command", async () => {
  let ends = 0,
    confirmations = 0;
  const h = harness({
    taskRecurrence: inSeries,
    confirm: async (title, text, action) => {
      confirmations++;
      assert.match(title, /Permanently/);
      assert.match(text, /cannot resume/);
      assert.equal(action, "End recurrence permanently");
      return true;
    },
    endTaskRecurrence: () => {
      if (++ends === 1) throw new Error("Fictional interruption");
      return {
        kind: "ended",
        series: { ...series(), state: "ended" },
        auditRecorded: false,
      };
    },
  });
  await h.panel.load();
  const input = h.panel.element.querySelector("textarea");
  input.value = "  Exact private reason\nwith spacing  ";
  await input.emit("input");
  assert.equal(
    h.panel.element.querySelector("textarea"),
    input,
    "Typing must keep the same textarea/caret.",
  );
  assert.equal(h.panel.isDirty(), true);
  await h.control("End recurrence…").click();
  await h.control("Retry exact command").click();
  const sent = h.calls.filter((call) => call.name === "endTaskRecurrence");
  assert.deepEqual(sent[0].args, sent[1].args);
  assert.equal(sent[0].args[2].reason, input.value);
  assert.equal(sent[0].args[2].seriesRevision, 2);
  assert.equal(confirmations, 1);
  assert.equal(h.keys(), 1);
  assert.match(h.text(), /permanently ended/);
  assert.match(h.text(), /event was not recorded/);
  assert.equal(h.panel.isDirty(), false);
});

test("cancelled or obsolete End confirmation cannot send a command", async () => {
  for (const invalidate of [false, true]) {
    const gate = deferred(),
      h = harness({ taskRecurrence: inSeries, confirm: () => gate.promise });
    await h.panel.load();
    const pending = h.control("End recurrence…").click();
    if (invalidate) h.panel.invalidate();
    gate.resolve(invalidate);
    await pending;
    assert.equal(
      h.calls.filter((call) => call.name === "endTaskRecurrence").length,
      0,
    );
    assert.equal(h.keys(), 0);
  }
});

test("one pending Generate also blocks End and reload until its response settles", async () => {
  const gate = deferred(),
    h = harness({
      taskRecurrence: inSeries,
      generateTaskRecurrence: () => gate.promise,
    });
  await h.panel.load();
  await h.control("Preview next draft").click();
  const pending = h.control("Generate one unapproved draft").click();
  assert.equal(h.control("End recurrence…").disabled, true);
  assert.equal(h.control("Reload recurrence state").disabled, true);
  gate.resolve({ kind: "generated", existing: activeResult() });
  await pending;
  assert.equal(h.opened.length, 1);
  assert.equal(h.calls.length, 3);
});

test("existing active result reflects later workflow and revision rather than relabeling it a fresh draft", async () => {
  const h = harness({
    taskRecurrence: () => ({ ...inSeries(), existing: activeResult() }),
  });
  await h.panel.load();
  assert.match(h.text(), /Edited later/);
  assert.match(h.text(), /Current revision 7/);
  assert.equal(
    h.panel.element.querySelectorAll("a")[0].attributes.href,
    "#module/projects/fictional-next",
  );
  assert.equal(
    h.panel.element
      .querySelectorAll("button")
      .some((el) => el.textContent.includes("Preview next")),
    false,
  );
  assert.equal(h.calls.length, 1);
});

test("current trash and archived-only history have separate honest recovery actions", async () => {
  for (const kind of ["trashed-record", "historical-only"]) {
    const h = harness({
      taskRecurrence: () => ({
        ...inSeries(),
        existing: { kind, sequence: 2 },
      }),
    });
    await h.panel.load();
    if (kind === "trashed-record") {
      await h.control("Open Projects trash").click();
      assert.deepEqual(h.opened, ["trash"]);
    } else {
      assert.match(h.text(), /no current task or ordinary trash link/);
      assert.equal(h.panel.element.querySelectorAll("a").length, 0);
    }
    assert.equal(h.keys(), 0);
  }
});

test("ended and recovered series never offer generation or reactivation", async () => {
  for (const state of ["ended", "recovered"]) {
    const h = harness({
      taskRecurrence: () => ({
        ...inSeries(),
        series: { ...series(), state, recoveredState: "active" },
      }),
    });
    await h.panel.load();
    assert.match(
      h.text(),
      state === "recovered"
        ? /recovered as inactive history/
        : /permanently ended/,
    );
    assert.equal(
      h.panel.element
        .querySelectorAll("button")
        .some((el) =>
          /Preview next|Generate|End recurrence/.test(el.textContent),
        ),
      false,
    );
    assert.equal(h.calls.length, 1);
  }
});

test("newer saved source revision cannot silently become the old detail's preview source", async () => {
  const h = harness({
    taskRecurrence: () => ({
      ...eligible(),
      source: { id: record.id, revision: 5, approval: "current" },
    }),
  });
  await h.panel.load();
  assert.match(h.text(), /newer saved source revision exists/);
  assert.equal(
    h.panel.element
      .querySelectorAll("button")
      .some((el) => el.textContent === "Preview next draft"),
    false,
  );
  assert.equal(h.calls.length, 1);
});

test("dispose or lost organization ownership prevents late result adoption and navigation", async () => {
  for (const dispose of [false, true]) {
    const gate = deferred(),
      h = harness({ generateTaskRecurrence: () => gate.promise });
    await h.panel.load();
    await h.control("Preview next draft").click();
    const pending = h.control("Generate one unapproved draft").click();
    const before = h.text();
    if (dispose) h.panel.dispose();
    else h.invalidateScope();
    gate.resolve({ kind: "generated", existing: activeResult() });
    await pending;
    assert.equal(h.text(), before);
    assert.equal(h.opened.length, 0);
  }
});

test("source text is created as DOM text; token is never rendered or stored", async () => {
  const value = ready();
  value.preview.candidate.data.title = '<img src=x onerror="fictional">';
  const h = harness({ previewTaskRecurrence: () => value });
  await h.panel.load();
  await h.control("Preview next draft").click();
  assert.match(h.text(), /<img src=x/);
  assert.equal(h.panel.element.querySelectorAll("img").length, 0);
  assert.doesNotMatch(h.text(), /fictional-private-memory-token/);
  assert.doesNotMatch(
    controllerSource,
    /localStorage|sessionStorage|innerHTML|location\./,
  );
});

test("a post-save navigation error cannot become a second command or an invented ambiguous result", async () => {
  const h = harness({
    onGenerated: async () => {
      throw new Error("Fictional navigation error");
    },
  });
  await h.panel.load();
  await h.control("Preview next draft").click();
  await h.control("Generate one unapproved draft").click();
  assert.match(h.text(), /saved task exists/);
  assert.doesNotMatch(h.text(), /exact command is retained/);
  assert.equal(
    h.panel.element
      .querySelectorAll("button")
      .some((el) => el.textContent === "Retry exact command"),
    false,
  );
  assert.equal(h.keys(), 1);
});

test("mounted detail and pre-await app lifecycle retain recurrence invalidation seams", () => {
  assert.match(
    appSource,
    /moduleId === "projects" && can\(module, "write", role\(\)\)/,
  );
  assert.match(
    appSource,
    /state\.taskRecurrencePanel = recurrence;\s+recurrence\?\.load\(\)/,
  );
  for (const marker of [
    "async function openRecordEditor(",
    "function configureEditor(",
    "async function route() {",
  ])
    assert.match(
      appSource.slice(
        appSource.indexOf(marker),
        appSource.indexOf(marker) + 220,
      ),
      /taskRecurrencePanel\?\.invalidate\(\)/,
    );
  assert.match(
    appSource,
    /function setContent\(\.\.\.content\) \{\s+state\.taskRecurrencePanel\?\.dispose\(\)/,
  );
  assert.match(
    appSource,
    /state\.dirty \|\| state\.pageDirty \|\| state\.taskRecurrencePanel\?\.isDirty\(\)/,
  );
});

async function mountedDetail(overrides = {}) {
  const h = harness(overrides);
  h.panel.dispose();
  const context = h.context;
  const content = new Element("main");
  context.state = {
    org: "fictional-org",
    epoch: 9,
    route: `module/projects/${record.id}`,
    session: {
      user: { id: "fictional-user", email: "fictional@example.invalid" },
    },
  };
  context.location = { hash: `#module/projects/${record.id}` };
  context.moduleById = () => module;
  context.can = () => true;
  context.role = () => "staff";
  context.referenceOptions = async () => new Map();
  context.formatDate = () => "Fictional saved time";
  context.renderWorkflow = () => null;
  context.renderHistory = () => null;
  context.renderComments = () => null;
  context.renderReminder = () => null;
  context.renderFiles = async () => null;
  context.heading = (_eyebrow, title) => context.node("h1", {}, title);
  context.setContent = (...nodes) => content.replaceChildren(...nodes);
  context.invalidations = 0;
  context.invalidateModules = () => {
    context.invalidations++;
  };
  context.route = async () =>
    assert.fail("The old source must not reroute a newly selected hash.");
  context.showTrash = async () => {};
  context.api.record =
    overrides.record || (async () => ({ record: copy(record) }));
  vm.runInContext(
    appSource.slice(
      appSource.indexOf("function safeRoute()"),
      appSource.indexOf("function setContent("),
    ) +
      "\n" +
      appSource.slice(
        appSource.indexOf("async function renderDetail("),
        appSource.indexOf("// Tokens and exact interrupted commands"),
      ),
    context,
  );
  await context.renderDetail("projects", record.id, 9);
  await new Promise((resolve) => setImmediate(resolve));
  const mountedPanel = context.state.taskRecurrencePanel;
  const control = (text) => {
    const found = mountedPanel.element
      .querySelectorAll("button")
      .find((el) => el.textContent === text);
    assert.ok(found, `Expected mounted control: ${text}`);
    return found;
  };
  return { ...h, mountedPanel, content, control };
}

test("actual detail rejects a held Generate after the hash changes, before hashchange or epoch dispatch", async () => {
  for (const nextHash of ["#home", "#module/projects/fictional-other-task"]) {
    const gate = deferred();
    const h = await mountedDetail({
      generateTaskRecurrence: () => gate.promise,
    });
    await h.control("Preview next draft").click();
    const pending = h.control("Generate one unapproved draft").click();
    const before = h.mountedPanel.element.textContent;
    h.context.location.hash = nextHash;
    assert.equal(h.context.state.epoch, 9);
    assert.equal(h.context.state.route, `module/projects/${record.id}`);
    gate.resolve({ kind: "generated", existing: activeResult() });
    await pending;
    assert.equal(
      h.context.location.hash,
      nextHash,
      "The newer requested route must survive before hashchange dispatch.",
    );
    assert.equal(
      h.context.invalidations,
      0,
      "No stale generated callback may touch app state.",
    );
    assert.equal(
      h.mountedPanel.element.textContent,
      before,
      "No stale result may repaint the old detail.",
    );
  }
});

test("actual detail's ordinary read also checks the immediate hash before mounting recurrence", async () => {
  // Change the captured route while the actual record read is held; no
  // hashchange dispatch or epoch mutation has happened yet.
  const h = harness();
  h.panel.dispose();
  const context = h.context;
  context.state = {
    org: "fictional-org",
    epoch: 9,
    route: `module/projects/${record.id}`,
  };
  context.location = { hash: `#module/projects/${record.id}` };
  context.moduleById = () => module;
  context.can = () => true;
  context.role = () => "staff";
  const held = deferred();
  context.api.record = () => held.promise;
  context.referenceOptions = () =>
    assert.fail("A stale route must not load references.");
  context.setContent = () =>
    assert.fail("A stale route must not mount a detail.");
  vm.runInContext(
    appSource.slice(
      appSource.indexOf("function safeRoute()"),
      appSource.indexOf("function setContent("),
    ) +
      "\n" +
      appSource.slice(
        appSource.indexOf("async function renderDetail("),
        appSource.indexOf("// Tokens and exact interrupted commands"),
      ),
    context,
  );
  const pending = context.renderDetail("projects", record.id, 9);
  context.location.hash = "#home";
  held.resolve({ record: copy(record) });
  await pending;
  assert.equal(context.state.taskRecurrencePanel, undefined);
});

test("Sign out revokes pending recurrence before its unsaved-page confirmation awaits", async () => {
  const generation = deferred(),
    discard = deferred();
  const h = await mountedDetail({
    generateTaskRecurrence: () => generation.promise,
  });
  const account = new Element("div");
  h.context.$ = () => account;
  h.context.discardEditor = () => discard.promise;
  h.context.discardPage = async () => false;
  vm.runInContext(
    appSource.slice(
      appSource.indexOf("function renderAccount()"),
      appSource.indexOf("function renderOrgControl()"),
    ),
    h.context,
  );
  h.context.renderAccount();
  await h.control("Preview next draft").click();
  const pending = h.control("Generate one unapproved draft").click();
  const signOut = account
    .querySelectorAll("button")
    .find((el) => el.textContent === "Sign out");
  const leaving = signOut.click();
  generation.resolve({ kind: "generated", existing: activeResult() });
  await pending;
  assert.equal(h.context.invalidations, 0);
  assert.equal(h.context.location.hash, `#module/projects/${record.id}`);
  assert.match(
    h.mountedPanel.element.textContent,
    /source view or editor changed/,
  );
  discard.resolve(false);
  await leaving;
});

test("New organization revokes pending recurrence before its discard confirmation awaits", async () => {
  const generation = deferred(),
    discard = deferred();
  const h = await mountedDetail({
    generateTaskRecurrence: () => generation.promise,
  });
  const newOrg = new Element("button");
  h.context.$ = () => newOrg;
  h.context.discardEditor = () => discard.promise;
  h.context.discardPage = async () => false;
  vm.runInContext(
    appSource.slice(
      appSource.indexOf('$("#new-org").addEventListener'),
      appSource.indexOf('$("#module-search").addEventListener'),
    ),
    h.context,
  );
  await h.control("Preview next draft").click();
  const pending = h.control("Generate one unapproved draft").click();
  const leaving = newOrg.click();
  generation.resolve({ kind: "generated", existing: activeResult() });
  await pending;
  assert.equal(h.context.invalidations, 0);
  assert.equal(h.context.location.hash, `#module/projects/${record.id}`);
  assert.match(
    h.mountedPanel.element.textContent,
    /source view or editor changed/,
  );
  discard.resolve(false);
  await leaving;
});
