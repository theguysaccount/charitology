import { api, allRecords, ApiError, setCsrfToken } from "./api.js";
import {
  blank,
  recordTitle,
  labelFor,
  optionsFor,
  can,
  stateLabel,
  permittedTransitions,
  moneyFromMajor,
  moneyToMajor,
  formatDate,
  formatValue,
  filterRecords,
  calendarCells,
  safeFilename,
  parseCsv,
  typedCsvRows,
} from "./model.js";

const $ = (selector) => document.querySelector(selector);
const INSTANT_PATTERN = String.raw`[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?(Z|\+[0-9]{2}:[0-9]{2}|-[0-9]{2}:[0-9]{2})`;
const state = {
  session: null,
  modules: [],
  roles: [],
  currencies: {},
  orgs: [],
  org: null,
  details: null,
  members: [],
  cache: new Map(),
  route: "home",
  epoch: 0,
  query: "",
  status: "",
  owner: "",
  sort: "updated",
  view: "table",
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  editor: null,
  dirty: false,
  pageDirty: false,
  activeRecords: [],
  module: null,
  importPreview: null,
  invitation: null,
};
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function")
      element.addEventListener(key.slice(2), value);
    else if (key === "class") element.className = value;
    else if (
      [
        "checked",
        "disabled",
        "required",
        "selected",
        "multiple",
        "readOnly",
      ].includes(key)
    )
      element[key] = Boolean(value);
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined && child !== false)
      element.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return element;
}
const button = (text, handler, kind = "", attrs = {}) =>
  node(
    "button",
    {
      type: "button",
      class: `button ${kind}`,
      onclick: async (event) => {
        try {
          await handler(event);
        } catch (error) {
          showError(error);
        }
      },
      ...attrs,
    },
    text,
  );
const tag = (text, kind = "") => node("span", { class: `tag ${kind}` }, text);
let labelIndex = 0;
const field = (label, control, help = "") => {
  const native = ["INPUT", "SELECT", "TEXTAREA"].includes(control.tagName);
  const labelId = `field-label-${++labelIndex}`;
  if (!control.id) control.id = `field-control-${labelIndex}`;
  if (!native) control.setAttribute("aria-labelledby", labelId);
  if (help) {
    control.setAttribute("aria-describedby", `${control.id}-help`);
    if (!native)
      for (const input of control.querySelectorAll("input,select,textarea"))
        input.setAttribute("aria-describedby", `${control.id}-help`);
  }
  return node(
    "div",
    { class: "field" },
    node(
      native ? "label" : "div",
      { for: native ? control.id : null, id: labelId, class: "field-label" },
      label,
    ),
    control,
    help
      ? node("p", { class: "field-help", id: `${control.id}-help` }, help)
      : null,
  );
};
const link = (text, href, attrs = {}) => node("a", { href, ...attrs }, text);
const loading = (text = "Loading saved records…") =>
  node(
    "div",
    { class: "page-loading", role: "status" },
    node("span", { class: "eyebrow" }, "Shared workspace"),
    node("p", {}, text),
    node("span", { class: "loading-line", "aria-hidden": "true" }),
  );
function heading(eyebrow, title, description, actions = []) {
  return node(
    "div",
    { class: "page-heading" },
    node(
      "div",
      {},
      node("span", { class: "eyebrow" }, eyebrow),
      node("h1", { tabindex: "-1" }, title),
      description ? node("p", {}, description) : null,
    ),
    actions.length ? node("div", { class: "actions" }, actions) : null,
  );
}
function notice(text, neutral = false) {
  return node("div", { class: `notice${neutral ? " neutral" : ""}` }, text);
}
function empty(title, text, action) {
  return node(
    "div",
    { class: "empty-state" },
    node("span", { class: "eyebrow" }, "A clear place to begin"),
    node("h2", {}, title),
    node("p", {}, text),
    action || null,
  );
}
function toast(text) {
  const target = $("#toast");
  target.textContent = text;
  target.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    target.hidden = true;
  }, 6000);
}
function announce(text) {
  const target = $("#announcement");
  target.textContent = text;
  target.hidden = !text;
}
function showError(error, target) {
  const text =
    error instanceof Error
      ? error.message
      : "The request could not be completed.";
  if (target) {
    target.replaceChildren(node("span", {}, text));
    target.classList.add("error");
  } else announce(text);
  if (target && Array.isArray(error.issues) && error.issues.length) {
    target.append(
      node(
        "ul",
        {},
        error.issues
          .slice(0, 100)
          .map((issue) =>
            node(
              "li",
              {},
              `${issue.field ? `${issue.field}: ` : ""}${issue.message || "Review this value."}`,
            ),
          ),
      ),
    );
    let first;
    for (const issue of error.issues) {
      const key = String(issue.field || "").replace(/^data\./, "");
      const input = document.getElementById(`record-field-${key}`);
      if (input) {
        input.setAttribute("aria-invalid", "true");
        first ||= input;
      }
    }
    first?.focus();
  }
  if (error.status === 401)
    announce(
      "Your session has expired. Keep any unsaved form open, then sign in again in another tab. Reload after saving a separate copy of unsaved text.",
    );
  if (error.status === 409 && target)
    target.append(
      node(
        "span",
        { class: "block-message" },
        "A newer saved version may exist. Your form is still here; copy it before reloading the latest record.",
      ),
    );
}
async function action(fn, control, statusTarget) {
  if (control?.disabled) return;
  if (control) control.disabled = true;
  if (statusTarget) {
    statusTarget.textContent = "Saving…";
    statusTarget.classList.remove("error");
  }
  $("#sync-state").textContent = "Working…";
  $("#sync-state").dataset.state = "working";
  let successful = false;
  try {
    const result = await fn();
    successful = true;
    if (control?.type === "submit") state.pageDirty = false;
    return result;
  } catch (error) {
    showError(error, statusTarget);
    return undefined;
  } finally {
    if (control?.isConnected) control.disabled = false;
    $("#sync-state").textContent = successful ? "Connected" : "Needs attention";
    $("#sync-state").dataset.state = successful ? "connected" : "error";
  }
}
function activeOrg() {
  return state.orgs.find((org) => org.id === state.org);
}
function role() {
  return activeOrg()?.role || "";
}
function admin() {
  return ["owner", "admin", "administrator"].includes(role());
}
function readable() {
  return state.modules.filter((module) => can(module, "read", role()));
}
function ownerName(id) {
  if (!id) return "Unassigned";
  const member = state.members.find((m) => (m.userId || m.id) === id);
  return (
    member?.name ||
    member?.email ||
    (id === state.session?.user?.id
      ? state.session.user.name || state.session.user.email
      : "Member")
  );
}
function moduleById(id) {
  return state.modules.find((module) => module.id === id);
}
function recordHref(module, id) {
  return `#module/${encodeURIComponent(module)}/${encodeURIComponent(id)}`;
}
function rememberOrg(id) {
  try {
    sessionStorage.setItem(`charity-os.org.${state.session.user.id}`, id);
  } catch {}
}
function rememberedOrg() {
  try {
    return sessionStorage.getItem(`charity-os.org.${state.session.user.id}`);
  } catch {
    return null;
  }
}
function safeRoute() {
  try {
    return decodeURIComponent(location.hash.slice(1) || "home");
  } catch {
    return "home";
  }
}
function setContent(...content) {
  $("#content").replaceChildren(
    ...content
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== false),
  );
}
function focusHeading() {
  $("#content h1")?.focus({ preventScroll: true });
}
function download(name, content, type = "application/json") {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = node("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function confirmAction(title, description, label = "Continue") {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-description").textContent = description;
  $("#confirm-action").textContent = label;
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    );
    dialog.returnValue = "cancel";
    dialog.showModal();
  });
}
async function discardEditor() {
  if (
    state.dirty &&
    !(await confirmAction(
      "Leave this unsaved form?",
      "Your unsaved changes will be lost. Save or copy them before leaving.",
      "Discard changes",
    ))
  )
    return false;
  state.dirty = false;
  state.editor = null;
  $("#editor-dialog").close();
  return true;
}
async function discardPage() {
  if (!state.pageDirty) return true;
  if (
    !(await confirmAction(
      "Leave this unsaved form?",
      "This page contains unsaved form changes. Save or copy them before leaving.",
      "Discard changes",
    ))
  )
    return false;
  state.pageDirty = false;
  return true;
}
function configureEditor(eyebrow, title, saveLabel, fields, onSave) {
  state.dirty = false;
  $("#editor-eyebrow").textContent = eyebrow;
  $("#editor-title").textContent = title;
  $("#editor-save").textContent = saveLabel;
  $("#editor-status").replaceChildren();
  $("#editor-status").classList.remove("error");
  $("#editor-fields").replaceChildren(
    ...fields
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== false),
  );
  state.editor = { onSave };
  $("#editor-dialog").showModal();
  setTimeout(
    () =>
      $(
        "#editor-fields input, #editor-fields select, #editor-fields textarea",
      )?.focus(),
    0,
  );
}
function closeSavedEditor() {
  state.dirty = false;
  state.editor = null;
  $("#editor-dialog").close();
}
async function loadMembers() {
  try {
    const result = await api.members(state.org);
    state.members = result.members || [];
  } catch (error) {
    if (error.status === 401) throw error;
    state.members = [];
  }
}
async function recordsFor(module, refresh = false) {
  const key = `${state.org}:${module}`;
  if (!refresh && state.cache.has(key)) return state.cache.get(key);
  const org = state.org;
  const result = await allRecords(org, module);
  if (org === state.org) state.cache.set(key, result);
  return result;
}
async function pool(items, operation, limit = 4) {
  const results = Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = { ok: true, value: await operation(items[i]) };
        } catch (error) {
          results[i] = { ok: false, error };
        }
      }
    }),
  );
  return results;
}
function renderAccount() {
  const target = $("#account");
  target.hidden = !state.session?.user;
  if (!state.session?.user) return;
  const user = state.session.user;
  target.replaceChildren(
    node(
      "div",
      { class: "account-box" },
      node(
        "span",
        { class: "account-avatar", "aria-hidden": "true" },
        (user.name || user.email || "?").slice(0, 1).toUpperCase(),
      ),
      node("span", { class: "email" }, user.email),
      button(
        "Sign out",
        async (event) => {
          if (!(await discardEditor())) return;
          await action(async () => {
            await api.logout();
            state.cache.clear();
            state.session = null;
            setCsrfToken("");
            showSignedOut();
            toast("Signed out.");
          }, event.currentTarget);
        },
        "small subtle",
      ),
    ),
  );
}
function renderOrgControl() {
  const select = $("#org-switch");
  select.replaceChildren(
    ...state.orgs.map((org) =>
      node(
        "option",
        { value: org.id, selected: org.id === state.org },
        org.name,
      ),
    ),
  );
  select.disabled = !state.orgs.length;
  $("#workspace-context").textContent = activeOrg()
    ? `${activeOrg().name} / ${labelFor(role())}`
    : "Create your first organization";
  renderNav();
}
function renderNav() {
  const q = $("#module-search").value.trim().toLocaleLowerCase();
  const modules = readable().filter((m) =>
    `${m.title} ${m.description}`.toLocaleLowerCase().includes(q),
  );
  const groups = [
    ...new Set(
      modules.map((m) => m.category || m.group || "Workspace modules"),
    ),
  ];
  const nav = $("#module-nav");
  nav.replaceChildren(
    ...groups.map((group) =>
      node(
        "section",
        { class: "module-group" },
        node("h2", {}, group),
        modules
          .filter(
            (m) => (m.category || m.group || "Workspace modules") === group,
          )
          .map((module) => {
            const count =
              state.cache.get(`${state.org}:${module.id}`)?.length ??
              state.counts?.[module.id];
            const a = link(
              module.title,
              `#module/${encodeURIComponent(module.id)}`,
              {
                "aria-current": state.route.startsWith(`module/${module.id}`)
                  ? "page"
                  : null,
              },
            );
            if (count !== undefined)
              a.append(node("span", { class: "module-count" }, count));
            return a;
          }),
      ),
    ),
  );
  if (!modules.length)
    nav.append(node("p", { class: "fine" }, "No matching modules."));
  for (const a of document.querySelectorAll("[data-nav]"))
    a.setAttribute(
      "aria-current",
      a.dataset.nav === state.route ? "page" : "false",
    );
}
function showSignedOut() {
  $("#connecting").hidden = true;
  $("#workspace").hidden = true;
  $("#auth-screen").hidden = false;
  renderAccount();
  if (state.invitation)
    announce(
      "You have an organization invitation. Sign in with the invited email address, then return to this tab and refresh to review it.",
    );
}
async function loadWorkspace() {
  $("#auth-screen").hidden = true;
  $("#connecting").hidden = true;
  $("#workspace").hidden = false;
  renderAccount();
  renderOrgControl();
  if (!state.org) return renderCreateOrganization();
  await route();
}
async function boot() {
  try {
    state.session = await api.session();
    setCsrfToken(state.session.csrfToken);
    if (!state.session.user) {
      showSignedOut();
      if (safeRoute() === "privacy") showPrivacy();
      return;
    }
    const registry = await api.modules();
    state.modules = registry.modules || [];
    state.roles = registry.roles || [];
    state.currencies = registry.currencies || {};
    state.orgs = state.session.orgs || (await api.orgs()).orgs || [];
    const preferred = rememberedOrg();
    state.org = state.orgs.some((o) => o.id === preferred)
      ? preferred
      : state.orgs[0]?.id || null;
    await loadMembersIfOrg();
    await loadWorkspace();
    if (state.invitation) showInvitation();
  } catch (error) {
    $("#connecting").replaceChildren(
      node("span", { class: "eyebrow" }, "Connection needed"),
      node("h1", {}, "The workspace could not be opened."),
      node("p", {}, error.message),
      button("Try again", () => location.reload(), "primary"),
    );
  }
}
async function loadMembersIfOrg() {
  if (state.org) await loadMembers();
}
async function route() {
  const current = ++state.epoch;
  state.route = safeRoute();
  renderNav();
  $("#sidebar").classList.remove("open");
  $("#nav-toggle").setAttribute("aria-expanded", "false");
  announce("");
  if (state.route === "privacy") return showPrivacy();
  if (!state.org) return renderCreateOrganization();
  setContent(loading());
  try {
    if (state.route.startsWith("module/")) {
      const [, module, id] = state.route.split("/");
      if (id) await renderDetail(module, id, current);
      else await renderModule(module, current);
    } else if (state.route === "reports") await renderReports(current);
    else if (state.route === "data") renderData();
    else if (state.route === "members") await renderMembers(current);
    else if (state.route === "integrations") await renderIntegrations(current);
    else if (state.route === "settings") await renderSettings(current);
    else await renderHome(current);
    if (current === state.epoch) focusHeading();
  } catch (error) {
    if (current !== state.epoch) return;
    setContent(
      heading("Workspace", "This view could not be loaded.", error.message),
      button("Try again", () => route(), "primary"),
    );
    if (error.status === 401) showError(error);
  }
}
function renderCreateOrganization() {
  const name = node("input", {
    id: "create-org-name",
    name: "name",
    required: true,
    maxlength: 160,
    autocomplete: "organization",
  });
  const slug = node("input", {
    id: "create-org-slug",
    name: "slug",
    pattern: "[a-z0-9]+(?:-[a-z0-9]+)*",
    maxlength: 80,
    placeholder: "optional-short-name",
  });
  const currency = node("input", {
    id: "create-org-currency",
    name: "currency",
    value: "USD",
    required: true,
    pattern: "[A-Z]{3}",
    maxlength: 3,
  });
  const timezone = node("input", {
    id: "create-org-zone",
    name: "timeZone",
    value: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    required: true,
  });
  const status = node("p", { class: "form-status", role: "alert" });
  const submit = node(
    "button",
    { class: "button primary", type: "submit" },
    "Create shared workspace",
  );
  const form = node(
    "form",
    {
      onsubmit: (event) => {
        event.preventDefault();
        action(
          async () => {
            const result = await api.createOrg({
              name: name.value.trim(),
              ...(slug.value.trim() ? { slug: slug.value.trim() } : {}),
              currency: currency.value.toUpperCase(),
              timeZone: timezone.value.trim(),
            });
            const org = result.org || result.organization;
            if (!org?.id)
              throw new ApiError(
                "The organization was saved but its response is incomplete. Reload to find it.",
              );
            const refreshed = await api.session();
            state.session = refreshed;
            setCsrfToken(refreshed.csrfToken);
            state.orgs = refreshed.orgs || (await api.orgs()).orgs || [];
            state.org = org.id;
            rememberOrg(org.id);
            await loadMembers();
            renderOrgControl();
            location.hash = "home";
            await route();
            toast("Organization created.");
          },
          submit,
          status,
        );
      },
    },
    node(
      "div",
      { class: "form-grid" },
      field("Organization name", name),
      field(
        "Short name",
        slug,
        "Lowercase letters, numbers and hyphens. Leave blank to generate one.",
      ),
      field(
        "Planning currency",
        currency,
        "Amounts always retain their own currency.",
      ),
      field(
        "Organization time zone",
        timezone,
        "An IANA name such as America/New_York.",
      ),
    ),
    status,
    submit,
  );
  setContent(
    heading(
      "A place for your team",
      "Create an organization.",
      "Start with an empty shared workspace. You can invite people and choose their roles after creating it.",
    ),
    node("section", { class: "panel" }, form),
  );
}
async function renderHome(epoch) {
  const dashboard = await api.dashboard(state.org);
  if (epoch !== state.epoch) return;
  const modules = readable();
  state.counts = dashboard.counts || {};
  const countKnown = modules.every((module) =>
    Number.isFinite(state.counts[module.id]),
  );
  const total = countKnown
    ? modules.reduce((sum, module) => sum + state.counts[module.id], 0)
    : "—";
  const now = new Date().toISOString().slice(0, 10);
  const due = (dashboard.due || [])
    .map((record) => ({ record, module: moduleById(record.moduleId) }))
    .filter((x) => x.module);
  const recent = (dashboard.recent || [])
    .map((record) => ({ record, module: moduleById(record.moduleId) }))
    .filter((x) => x.module);
  const metrics = node(
    "div",
    { class: "metrics" },
    [
      ["Working desks", modules.length, "Available to your role"],
      ["Saved records", total, "Visible to your role"],
      ["Dated handoffs", due.length, "Within seven days or overdue"],
      ["Organizations", state.orgs.length, "Your active memberships"],
    ].map(([label, value, detail]) =>
      node(
        "article",
        { class: "metric" },
        node("span", { class: "label" }, label),
        node("strong", { class: "value" }, value),
        node("span", { class: "detail" }, detail),
      ),
    ),
  );
  const next = node(
    "section",
    { class: "panel" },
    node(
      "div",
      { class: "section-header" },
      node("h2", {}, "The next handoffs"),
      tag("Your accessible records"),
    ),
    due.length
      ? node(
          "ul",
          { class: "list-plain" },
          due.slice(0, 8).map(({ module, record }) => {
            const date = record.data[module.dateField];
            return node(
              "li",
              {},
              node(
                "div",
                { class: "row" },
                link(recordTitle(record), recordHref(module.id, record.id)),
                tag(
                  String(date).slice(0, 10) < now
                    ? "Earlier date"
                    : "Scheduled",
                  String(date).slice(0, 10) < now ? "danger" : "",
                ),
              ),
              node(
                "small",
                {},
                `${module.title} · ${formatDate(date, module.fields.find((f) => f.key === module.dateField)?.type === "datetime")} · ${ownerName(record.ownerId)}`,
              ),
            );
          }),
        )
      : node(
          "p",
          { class: "fine" },
          "No upcoming or earlier open deadlines were returned for your accessible records.",
        ),
  );
  const activity = node(
    "section",
    { class: "panel" },
    node(
      "div",
      { class: "section-header" },
      node("h2", {}, "Recently changed"),
    ),
    recent.length
      ? node(
          "ul",
          { class: "list-plain" },
          recent
            .slice(0, 6)
            .map(({ module, record }) =>
              node(
                "li",
                {},
                link(recordTitle(record), recordHref(module.id, record.id)),
                node(
                  "small",
                  {},
                  `${module.title} · Revision ${record.revision} · ${formatDate(record.updatedAt, true)}`,
                ),
              ),
            ),
        )
      : node(
          "p",
          { class: "fine" },
          "Your first saved records will appear here.",
        ),
  );
  const jobs = admin()
    ? node(
        "section",
        { class: "panel section-gap" },
        node(
          "div",
          { class: "section-header" },
          node("h2", {}, "Service jobs"),
          tag((dashboard.jobs || []).length),
        ),
        (dashboard.jobs || []).length
          ? node(
              "ul",
              { class: "list-plain" },
              dashboard.jobs
                .slice(0, 10)
                .map((job) =>
                  node(
                    "li",
                    {},
                    node(
                      "div",
                      { class: "row" },
                      node("span", {}, labelFor(job.kind)),
                      tag(labelFor(job.status)),
                    ),
                    node(
                      "small",
                      {},
                      `${job.attempts || 0} attempts${job.next_at ? ` · Next ${formatDate(job.next_at, true)}` : ""}`,
                    ),
                    job.last_error
                      ? node("p", { class: "fine error-text" }, job.last_error)
                      : null,
                  ),
                ),
            )
          : node(
              "p",
              { class: "fine" },
              "No queued or completed service jobs are returned.",
            ),
      )
    : null;
  setContent(
    heading(
      "Workspace overview",
      activeOrg().name,
      "Connect the promise, the work, the evidence and the next decision.",
      [
        button("Refresh", () => route(), "subtle"),
        button("New record", () => openModuleChooser(), "primary"),
      ],
    ),
    metrics,
    node("div", { class: "split-layout" }, next, activity),
    node(
      "section",
      { class: "section-gap" },
      node(
        "div",
        { class: "section-header" },
        node("h2", {}, "Your working desks"),
        tag(`${modules.length} modules`),
      ),
      node(
        "div",
        { class: "card-grid" },
        modules.map((module) =>
          link(
            [
              node("h3", {}, module.title),
              node("p", {}, module.description),
              node(
                "div",
                { class: "card-meta" },
                node("span", {}, module.group || "Workspace"),
                node("span", {}, `${state.counts[module.id] ?? "—"} records →`),
              ),
            ],
            `#module/${module.id}`,
            { class: "module-card" },
          ),
        ),
      ),
    ),
    jobs,
  );
  renderNav();
}
function openModuleChooser() {
  const modules = readable().filter((m) => can(m, "write", role()));
  const select = node(
    "select",
    { id: "new-record-module", required: true },
    node("option", { value: "" }, "Choose a module"),
    modules.map((m) => node("option", { value: m.id }, m.title)),
  );
  configureEditor(
    "Start with a clear home",
    "What kind of record?",
    "Continue",
    [field("Module", select)],
    async () => {
      const module = moduleById(select.value);
      closeSavedEditor();
      await openRecordEditor(module);
    },
  );
}
async function renderModule(id, epoch) {
  const module = moduleById(id);
  if (!module || !can(module, "read", role()))
    throw new ApiError("This module is not available to your role.", 403);
  if (state.module?.id !== id) {
    state.status = "";
    state.owner = "";
  }
  const records = await recordsFor(id, true);
  if (epoch !== state.epoch) return;
  state.module = module;
  state.activeRecords = records;
  if (!module.views?.includes(state.view))
    state.view = module.views?.[0] || "table";
  const exportButton = can(module, "export", role())
    ? button(
        "Export module CSV",
        (event) =>
          action(async () => {
            const file = await api.exportModuleCsv(state.org, module.id);
            download(`${safeFilename(module.id)}.csv`, file);
            toast(
              "Module CSV downloaded. It includes the server-authorized saved records.",
            );
          }, event.currentTarget),
        "subtle",
      )
    : null;
  const controls = [
    button("Refresh", () => route(), "subtle"),
    exportButton,
    can(module, "write", role())
      ? button("Trash", () => showTrash(module), "subtle")
      : null,
    can(module, "write", role())
      ? button("+ New record", () => openRecordEditor(module), "primary")
      : null,
  ].filter(Boolean);
  const search = node("input", {
    id: "record-search",
    type: "search",
    placeholder: "Search saved text…",
    value: state.query,
    oninput: (event) => {
      state.query = event.target.value;
      renderRecordResults();
    },
  });
  const status = node(
    "select",
    {
      id: "record-status",
      onchange: (event) => {
        state.status = event.target.value;
        renderRecordResults();
      },
    },
    node("option", { value: "" }, "All states"),
    (module.workflow?.states || []).map((s) =>
      node("option", { value: s.id, selected: state.status === s.id }, s.label),
    ),
  );
  const owners = [...new Set(records.map((r) => r.ownerId).filter(Boolean))];
  const owner = node(
    "select",
    {
      id: "record-owner",
      onchange: (event) => {
        state.owner = event.target.value;
        renderRecordResults();
      },
    },
    node("option", { value: "" }, "Everyone"),
    node(
      "option",
      { value: "unassigned", selected: state.owner === "unassigned" },
      "Unassigned",
    ),
    owners.map((id) =>
      node(
        "option",
        { value: id, selected: state.owner === id },
        ownerName(id),
      ),
    ),
  );
  const sort = node(
    "select",
    {
      id: "record-sort",
      onchange: (event) => {
        state.sort = event.target.value;
        renderRecordResults();
      },
    },
    [
      ["updated", "Recently updated"],
      ["title", "Title A–Z"],
      ["oldest", "Oldest first"],
    ].map(([value, label]) =>
      node("option", { value, selected: state.sort === value }, label),
    ),
  );
  const tabs = node(
    "div",
    { class: "view-tabs", role: "group", "aria-label": "Record view" },
    (module.views || ["table"]).map((view) =>
      button(
        labelFor(view),
        () => {
          state.view = view;
          for (const b of tabs.children)
            b.setAttribute(
              "aria-pressed",
              b.dataset.view === view ? "true" : "false",
            );
          renderRecordResults();
        },
        "",
        {
          "data-view": view,
          "aria-pressed": state.view === view ? "true" : "false",
        },
      ),
    ),
  );
  setContent(
    heading(
      module.category || module.group || "Workspace module",
      module.title,
      module.description,
      controls,
    ),
    module.sensitivity && module.sensitivity !== "public"
      ? notice(
          `Record access: ${labelFor(module.sensitivity)}. Use the organization’s agreed data boundaries.`,
          true,
        )
      : null,
    node(
      "div",
      { class: "toolbar" },
      field("Search", search),
      field("Workflow state", status),
      field("Owner", owner),
      field("Sort", sort),
      tabs,
    ),
    node("div", { id: "record-results" }),
    module.invariants?.length
      ? node(
          "details",
          { class: "module-boundary" },
          node("summary", {}, "Working rules for this module"),
          node(
            "ul",
            {},
            module.invariants.map((rule) => node("li", {}, rule)),
          ),
        )
      : null,
  );
  renderRecordResults();
  renderNav();
}
async function showTrash(module) {
  const org = state.org,
    result = await api.trashRecords(org, module.id);
  if (org !== state.org) return;
  const content = node(
    "div",
    { class: "full-width" },
    node(
      "p",
      { class: "fine" },
      "Restore a record to review. Previous approvals are cleared; its activity history remains.",
    ),
    node(
      "ul",
      { class: "list-plain" },
      (result.records || []).map((record) =>
        node(
          "li",
          {},
          node(
            "div",
            { class: "row" },
            node("span", {}, recordTitle(record)),
            button(
              "Restore record",
              async (event) =>
                action(async () => {
                  if (
                    !(await confirmAction(
                      "Restore this record?",
                      `Return “${recordTitle(record)}” to review?`,
                      "Restore record",
                    ))
                  )
                    return;
                  await api.restoreRecord(
                    org,
                    module.id,
                    record.id,
                    record.revision,
                  );
                  closeSavedEditor();
                  state.cache.clear();
                  toast("Record restored for review.");
                  await route();
                }, event.currentTarget),
              "small",
            ),
          ),
        ),
      ),
    ),
  );
  if (!(result.records || []).length)
    content.append(node("p", {}, "No records are in this module’s trash."));
  configureEditor(
    module.title,
    "Recoverable trash",
    "Close",
    [content],
    async () => closeSavedEditor(),
  );
}
function renderRecordResults() {
  const container = $("#record-results");
  if (!container) return;
  const module = state.module;
  const records = filterRecords(state.activeRecords, state);
  container.replaceChildren(
    node(
      "p",
      { class: "results-meta", role: "status" },
      `${records.length} of ${state.activeRecords.length} saved records${state.query || state.status || state.owner ? " match these filters" : ""}.`,
    ),
  );
  if (!state.activeRecords.length) {
    container.append(
      empty(
        "Give this work a clear record.",
        `No ${module.title.toLowerCase()} records yet. Start with a title and what is known; leave unknown optional values empty.`,
        can(module, "write", role())
          ? button(
              "+ Create the first record",
              () => openRecordEditor(module),
              "primary",
            )
          : null,
      ),
    );
    return;
  }
  if (!records.length) {
    container.append(
      empty(
        "No records match.",
        "Try another search or remove a filter.",
        button(
          "Clear filters",
          () => {
            state.query = "";
            state.status = "";
            state.owner = "";
            renderModule(module.id, state.epoch);
          },
          "subtle",
        ),
      ),
    );
    return;
  }
  if (state.view === "board") renderBoard(container, module, records);
  else if (state.view === "calendar")
    renderCalendar(container, module, records);
  else renderTable(container, module, records);
}
function renderTable(container, module, records) {
  const columns = (module.fields || [])
    .filter(
      (f) => f.key !== "title" && !["textarea", "references"].includes(f.type),
    )
    .slice(0, 3);
  container.append(
    node(
      "div",
      { class: "table-wrap" },
      node(
        "table",
        {},
        node(
          "thead",
          {},
          node(
            "tr",
            {},
            node("th", { scope: "col" }, "Record"),
            node("th", { scope: "col" }, "Workflow"),
            columns.map((f) => node("th", { scope: "col" }, f.label)),
            node("th", { scope: "col" }, "Owner / updated"),
          ),
        ),
        node(
          "tbody",
          {},
          records.map((record) =>
            node(
              "tr",
              {},
              node(
                "td",
                {},
                link(recordTitle(record), recordHref(module.id, record.id), {
                  class: "record-link",
                }),
                node("small", {}, `Revision ${record.revision}`),
              ),
              node(
                "td",
                {},
                tag(stateLabel(module, record.status)),
                record.approval
                  ? node(
                      "small",
                      {},
                      `Approval: ${labelFor(record.approval.status || "recorded")}`,
                    )
                  : null,
              ),
              columns.map((f) =>
                node("td", {}, formatValue(f, record.data[f.key])),
              ),
              node(
                "td",
                {},
                ownerName(record.ownerId),
                node("small", {}, formatDate(record.updatedAt, true)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
function renderBoard(container, module, records) {
  const states = [...(module.workflow?.states || [])];
  for (const record of records)
    if (!states.some((s) => s.id === record.status))
      states.push({
        id: record.status,
        label: stateLabel(module, record.status),
      });
  container.append(
    node(
      "div",
      { class: "board", "aria-label": `${module.title} workflow board` },
      states.map((status) => {
        const group = records.filter((r) => r.status === status.id);
        return node(
          "section",
          { class: "board-column" },
          node("h3", {}, status.label, tag(group.length)),
          group.map((record) =>
            link(
              [
                node("h4", {}, recordTitle(record)),
                node("p", {}, ownerName(record.ownerId)),
                module.dateField
                  ? node("p", {}, formatDate(record.data[module.dateField]))
                  : null,
                node("p", {}, `Revision ${record.revision}`),
              ],
              recordHref(module.id, record.id),
              { class: "board-card" },
            ),
          ),
        );
      }),
    ),
  );
  container.append(
    node(
      "p",
      { class: "fine" },
      "Open a card to change its workflow state, record a reason or request an approval.",
    ),
  );
}
function renderCalendar(container, module, records) {
  if (!module.dateField) {
    container.append(
      notice(
        "This module does not define a calendar date. Use the table or board view.",
      ),
    );
    return;
  }
  const label = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(state.year, state.month, 1)));
  const change = (delta) => {
    const d = new Date(Date.UTC(state.year, state.month + delta, 1));
    state.year = d.getUTCFullYear();
    state.month = d.getUTCMonth();
    renderRecordResults();
  };
  container.append(
    node(
      "div",
      { class: "calendar-header" },
      button("←", () => change(-1), "small", {
        "aria-label": "Previous month",
      }),
      node("h2", {}, label),
      node(
        "div",
        { class: "actions" },
        button(
          "Today",
          () => {
            state.year = new Date().getFullYear();
            state.month = new Date().getMonth();
            renderRecordResults();
          },
          "small",
        ),
        button("→", () => change(1), "small", { "aria-label": "Next month" }),
      ),
    ),
  );
  const today = new Date().toISOString().slice(0, 10);
  const cells = calendarCells(state.year, state.month);
  const noDates = records.filter((r) => !r.data[module.dateField]).length;
  container.append(
    node(
      "div",
      { class: "calendar-grid", "aria-label": label },
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) =>
        node("div", { class: "calendar-weekday" }, day),
      ),
      cells.map((cell) =>
        node(
          "div",
          {
            class: `calendar-day${cell.current ? "" : " outside"}${cell.date === today ? " today" : ""}`,
          },
          node("span", { "aria-label": cell.date }, cell.day),
          records
            .filter(
              (r) =>
                String(r.data[module.dateField] || "").slice(0, 10) ===
                cell.date,
            )
            .map((record) =>
              link(recordTitle(record), recordHref(module.id, record.id), {
                class: "calendar-record",
              }),
            ),
        ),
      ),
    ),
  );
  container.append(
    node(
      "p",
      { class: "fine" },
      `Dates use each record’s written calendar date; open a record for its time zone. ${noDates} record${noDates === 1 ? " has" : "s have"} no ${module.fields.find((f) => f.key === module.dateField)?.label.toLowerCase() || "date"} and appear only in the other views.`,
    ),
  );
}

async function referenceOptions(module, record) {
  const targets = [
    ...new Set(
      module.fields
        .filter((f) => ["reference", "references"].includes(f.type))
        .map((f) => f.target),
    ),
  ];
  const result = new Map();
  await pool(targets, async (target) => {
    const linked = moduleById(target);
    if (!linked || !can(linked, "read", role())) {
      result.set(target, []);
      return;
    }
    try {
      result.set(target, await recordsFor(target));
    } catch {
      result.set(target, []);
    }
  });
  return result;
}
async function openRecordEditor(module, record = null) {
  if (!can(module, "write", role()))
    return toast("Your role can read this module but cannot edit it.");
  const org = state.org;
  const references = await referenceOptions(module, record);
  if (org !== state.org) return;
  const controls = new Map();
  const fields = module.fields.map((spec) => {
    const id = `record-field-${spec.key}`;
    const value = record?.data?.[spec.key] ?? spec.default ?? null;
    let control;
    let read;
    const common = {
      id,
      name: spec.key,
      required: spec.required,
      ...(spec.maxLength ? { maxlength: spec.maxLength } : {}),
      "aria-describedby": spec.help ? `${id}-help` : null,
    };
    if (spec.type === "textarea") {
      control = node("textarea", { ...common, rows: 5 }, value ?? "");
      read = () => control.value.trim() || null;
    } else if (spec.type === "select") {
      control = node(
        "select",
        common,
        node(
          "option",
          { value: "" },
          spec.required ? "Choose…" : "Not recorded",
        ),
        optionsFor(spec).map((o) =>
          node(
            "option",
            { value: o.value, selected: value === o.value },
            o.label,
          ),
        ),
      );
      read = () => control.value || null;
    } else if (spec.type === "boolean") {
      control = node(
        "select",
        common,
        node("option", { value: "", selected: blank(value) }, "Unknown"),
        node("option", { value: "true", selected: value === true }, "Yes"),
        node("option", { value: "false", selected: value === false }, "No"),
      );
      read = () => (control.value === "" ? null : control.value === "true");
    } else if (spec.type === "money") {
      const currencies = Object.keys(state.currencies).length
        ? state.currencies
        : {
            USD: 2,
            EUR: 2,
            GBP: 2,
            CAD: 2,
            AUD: 2,
            NZD: 2,
            CHF: 2,
            JPY: 0,
            KWD: 3,
          };
      const selected =
        value?.currency ||
        state.details?.currency ||
        activeOrg()?.currency ||
        "USD";
      const amount = node("input", {
        id,
        name: spec.key,
        inputmode: "decimal",
        placeholder: "Unknown",
        value: moneyToMajor(value),
        required: spec.required,
      });
      const currency = node(
        "select",
        { id: `${id}-currency` },
        Object.entries(currencies).map(([code]) =>
          node("option", { value: code, selected: code === selected }, code),
        ),
      );
      const precision = node("input", {
        id: `${id}-precision`,
        type: "number",
        min: 0,
        max: 4,
        step: 1,
        value: value?.precision ?? currencies[selected] ?? 2,
        required: true,
      });
      currency.addEventListener("change", () => {
        precision.value = String(currencies[currency.value]);
      });
      control = node(
        "div",
        { id: `${id}-group`, class: "money-inputs", role: "group" },
        field("Amount", amount),
        field("Currency", currency),
        field("Decimals", precision),
      );
      read = () =>
        amount.value.trim() === "" && value?.minor === null
          ? {
              minor: null,
              currency: currency.value,
              precision: Number(precision.value),
            }
          : moneyFromMajor(
              amount.value,
              currency.value,
              Number(precision.value),
            );
    } else if (spec.type === "reference" || spec.type === "references") {
      const choices = (references.get(spec.target) || []).filter(
        (r) => r.id !== record?.id,
      );
      const selected =
        spec.type === "references"
          ? Array.isArray(value)
            ? value
            : []
          : value
            ? [value]
            : [];
      for (const id of selected)
        if (!choices.some((r) => r.id === id))
          choices.push({ id, data: { title: `Current reference (${id})` } });
      if (spec.type === "reference") {
        control = node(
          "select",
          common,
          node(
            "option",
            { value: "" },
            spec.required ? "Choose a saved record…" : "None recorded",
          ),
          choices.map((r) =>
            node(
              "option",
              { value: r.id, selected: r.id === value },
              recordTitle(r),
            ),
          ),
        );
        read = () => control.value || null;
      } else {
        const unknown = node("input", {
          type: "checkbox",
          checked: value === null,
          "data-reference-unknown": "true",
        });
        control = node(
          "div",
          {
            id,
            class: "reference-list",
            role: "group",
            "aria-label": spec.label,
          },
          node("label", {}, unknown, "References not yet known"),
          choices.length
            ? choices.map((r) => {
                const checkbox = node("input", {
                  type: "checkbox",
                  value: r.id,
                  checked: selected.includes(r.id),
                  "data-reference-choice": "true",
                  onchange: () => {
                    unknown.checked = false;
                  },
                });
                return node("label", {}, checkbox, recordTitle(r));
              })
            : node(
                "p",
                { class: "fine" },
                "No accessible saved records in the related module.",
              ),
        );
        unknown.addEventListener("change", () => {
          if (unknown.checked)
            for (const input of control.querySelectorAll(
              "[data-reference-choice]",
            ))
              input.checked = false;
        });
        read = () =>
          unknown.checked
            ? null
            : [
                ...control.querySelectorAll("[data-reference-choice]:checked"),
              ].map((i) => i.value);
      }
    } else if (spec.type === "integer" || spec.type === "number") {
      control = node("input", {
        ...common,
        type: "number",
        step: spec.type === "integer" ? 1 : "any",
        ...(spec.min !== undefined ? { min: spec.min } : {}),
        ...(spec.max !== undefined ? { max: spec.max } : {}),
        value: blank(value) ? "" : value,
        placeholder: "Unknown",
      });
      read = () => (control.value === "" ? null : Number(control.value));
    } else {
      control = node("input", {
        ...common,
        type:
          spec.type === "date"
            ? "date"
            : spec.format === "https"
              ? "url"
              : "text",
        value: value ?? "",
        ...(spec.type === "date"
          ? { min: "1900-01-01", max: "2200-12-31" }
          : {}),
        ...(spec.type === "datetime"
          ? {
              placeholder: "2026-10-26T14:00:00-04:00",
              pattern: INSTANT_PATTERN,
            }
          : {}),
        ...(spec.format === "https" ? { pattern: "https://.*" } : {}),
      });
      read = () => control.value.trim() || null;
    }
    controls.set(spec.key, { spec, read, control });
    const wrap = field(
      `${spec.label}${spec.required ? " *" : ""}`,
      control,
      spec.help ||
        (module.id === "casework" && spec.key === "title"
          ? "Use the same opaque coordination code as the coordination-code field. Do not enter a person’s name or service narrative."
          : ["reference", "references"].includes(spec.type)
            ? `Links to saved ${moduleById(spec.target)?.title.toLowerCase() || spec.target} records.`
            : ""),
    );
    if (["textarea", "money", "references"].includes(spec.type))
      wrap.classList.add("full-width");
    return wrap;
  });
  const chosenOwner = record?.ownerId || state.session.user.id;
  const assignee = node(
    "select",
    { id: "record-owner-field", required: true },
    state.members.map((m) => {
      const id = m.userId || m.user?.id || m.id;
      return node(
        "option",
        { value: id, selected: id === chosenOwner },
        m.name || m.user?.name || m.email || m.user?.email || id,
      );
    }),
  );
  if (![...assignee.options].some((o) => o.value === chosenOwner))
    assignee.append(
      node(
        "option",
        { value: chosenOwner, selected: true },
        chosenOwner === state.session.user.id ? "Me" : "Current owner",
      ),
    );
  if (
    record?.ownerId &&
    ![...assignee.options].some((o) => o.value === record.ownerId)
  )
    assignee.append(
      node(
        "option",
        { value: record.ownerId, selected: true },
        "Current owner",
      ),
    );
  fields.push(
    field(
      "Responsible person",
      assignee,
      "Assignment does not change access permissions.",
    ),
  );
  if (record?.approval)
    fields.unshift(
      node(
        "div",
        { class: "full-width" },
        notice(
          "Saving changes creates a new revision. Review the new version and any approval requirements before advancing its workflow.",
          true,
        ),
      ),
    );
  configureEditor(
    `${module.title}${record ? ` / Revision ${record.revision}` : ""}`,
    record ? "Edit this record" : "A clear record for the work",
    record ? "Save new revision" : "Create record",
    fields,
    async () => {
      const data = {};
      for (const { spec, read } of controls.values()) {
        try {
          const value = read();
          if (spec.required && blank(value))
            throw new Error("A value is required.");
          data[spec.key] = value;
        } catch (error) {
          throw new Error(`${spec.label}: ${error.message}`);
        }
      }
      const payload = { data, ownerId: assignee.value || null };
      const result = record
        ? await api.updateRecord(org, module.id, record.id, {
            ...payload,
            revision: record.revision,
          })
        : await api.createRecord(org, module.id, payload);
      const saved = result.record;
      if (!saved?.id)
        throw new ApiError(
          "The record may be saved, but its response is incomplete. Reload the list before retrying.",
        );
      closeSavedEditor();
      state.cache.delete(`${org}:${module.id}`);
      toast(record ? "New revision saved." : "Record saved.");
      location.hash = recordHref(module.id, saved.id);
      if (state.route === `module/${module.id}/${saved.id}`) await route();
    },
  );
}
async function renderDetail(moduleId, id, epoch) {
  const module = moduleById(moduleId);
  if (!module || !can(module, "read", role()))
    throw new ApiError("This record is not available to your role.", 403);
  const result = await api.record(state.org, moduleId, id);
  if (epoch !== state.epoch) return;
  const record = result.record;
  if (!record) throw new ApiError("This record could not be found.", 404);
  const references = await referenceOptions(module, record);
  if (epoch !== state.epoch) return;
  const titles = new Map();
  for (const list of references.values())
    for (const r of list) titles.set(r.id, recordTitle(r));
  const remove = can(module, "write", role())
    ? button(
        "Move to trash",
        async (event) => {
          if (
            !(await confirmAction(
              "Move this record to trash?",
              `Move “${recordTitle(record)}” to recoverable trash? Linked records and retention holds must be resolved first.`,
              "Move to trash",
            ))
          )
            return;
          await action(async () => {
            await api.deleteRecord(state.org, moduleId, id, record.revision);
            state.cache.delete(`${state.org}:${moduleId}`);
            location.hash = `#module/${moduleId}`;
            toast("Record moved to recoverable trash.");
          }, event.currentTarget);
        },
        "danger",
      )
    : null;
  const controls = [
    link("← All records", `#module/${moduleId}`, { class: "button subtle" }),
    can(module, "write", role())
      ? button("Edit", () => openRecordEditor(module, record), "primary")
      : null,
    remove,
  ].filter(Boolean);
  const details = node(
    "dl",
    { class: "detail-fields" },
    module.fields.map((spec) => {
      const value = record.data?.[spec.key];
      let display = formatValue(spec, value, titles);
      if (
        spec.type === "reference" &&
        value &&
        moduleById(spec.target) &&
        can(moduleById(spec.target), "read", role())
      )
        display = link(
          titles.get(value) || "Open related record",
          recordHref(spec.target, value),
        );
      return node(
        "div",
        { class: spec.type === "textarea" ? "full-width" : "" },
        node("dt", {}, spec.label),
        node("dd", {}, display),
      );
    }),
  );
  const meta = node(
    "div",
    { class: "pill-row" },
    tag(stateLabel(module, record.status), "accent"),
    tag(`Revision ${record.revision}`),
    tag(ownerName(record.ownerId)),
    record.approval
      ? tag(`Approval: ${labelFor(record.approval.status || "recorded")}`)
      : null,
  );
  const workflow = renderWorkflow(module, record);
  const history = node(
    "section",
    { class: "panel" },
    node(
      "div",
      { class: "section-header" },
      node("h2", {}, "Activity and revisions"),
    ),
    renderHistory(result.history || []),
  );
  const comments = renderComments(module, record, result.comments || []);
  const attachmentPanel =
    module.id === "documents" ? await renderFiles(module, record) : null;
  if (epoch !== state.epoch) return;
  setContent(
    heading(
      module.title,
      recordTitle(record),
      `Created ${formatDate(record.createdAt, true)} · Updated ${formatDate(record.updatedAt, true)}`,
      controls,
    ),
    meta,
    node(
      "div",
      { class: "detail-layout section-gap" },
      node(
        "div",
        { class: "stack" },
        node("section", { class: "panel" }, details),
        attachmentPanel,
        comments,
        record.snapshot
          ? node(
              "section",
              { class: "panel" },
              node("h2", {}, "Frozen workflow snapshot"),
              node(
                "p",
                { class: "fine" },
                "This snapshot preserves the approved/submitted version. It does not replace the current record.",
              ),
              node("pre", {}, JSON.stringify(record.snapshot, null, 2)),
            )
          : null,
      ),
      node(
        "div",
        { class: "stack" },
        workflow,
        renderReminder(module, record),
        history,
      ),
    ),
  );
}
function renderWorkflow(module, record) {
  const transitions = permittedTransitions(module, record, role());
  const status = node("p", { class: "form-status", role: "alert" });
  const select = node(
    "select",
    { id: "transition-to", required: true },
    node("option", { value: "" }, "Choose next state…"),
    transitions.map((t) =>
      node(
        "option",
        { value: t.to },
        `${stateLabel(module, t.to)}${t.requiresApproval ? " · approval required" : ""}${t.requiresSnapshot ? " · freezes a snapshot" : ""}`,
      ),
    ),
  );
  const reason = node("textarea", {
    id: "transition-reason",
    required: true,
    maxlength: 2000,
    rows: 3,
    placeholder: "Why is this the right next step?",
  });
  const submit = node(
    "button",
    { type: "submit", class: "button primary" },
    "Record transition",
  );
  const panel = node(
    "section",
    { class: "panel" },
    node("h2", {}, "Workflow"),
    node("p", {}, tag(stateLabel(module, record.status), "accent")),
    transitions.length
      ? node(
          "form",
          {
            onsubmit: (event) => {
              event.preventDefault();
              action(
                async () => {
                  await api.transition(state.org, module.id, record.id, {
                    revision: record.revision,
                    to: select.value,
                    reason: reason.value.trim(),
                  });
                  state.cache.delete(`${state.org}:${module.id}`);
                  toast("Workflow transition recorded.");
                  await route();
                },
                submit,
                status,
              );
            },
          },
          field("Next state", select),
          field("Decision reason", reason),
          status,
          submit,
        )
      : node(
          "p",
          { class: "fine" },
          "No further transition is available to your current role from this state.",
        ),
  );
  if (can(module, "approve", role()))
    panel.append(
      node("hr"),
      button(
        "Record approval",
        () => {
          const explanation = node("textarea", {
            id: "approve-reason",
            required: true,
            maxlength: 2000,
            rows: 4,
          });
          configureEditor(
            module.title,
            `Approve revision ${record.revision}`,
            "Record approval",
            [
              node(
                "p",
                { class: "full-width fine" },
                "Approval applies to this saved revision. The service checks your authority and any independent-review rule.",
              ),
              field("Review reason", explanation),
            ],
            async () => {
              await api.approve(state.org, module.id, record.id, {
                revision: record.revision,
                reason: explanation.value.trim(),
              });
              closeSavedEditor();
              toast("Approval recorded.");
              await route();
            },
          );
        },
        "subtle",
      ),
    );
  return panel;
}
function renderHistory(history) {
  if (!history.length)
    return node(
      "p",
      { class: "fine" },
      "No earlier changes are available to this role.",
    );
  return node(
    "ol",
    { class: "timeline" },
    history.map((event) => {
      const version = event.detail?.record || event.data || event.detail;
      const revision = event.revision || version?.revision;
      const reason =
        event.reason ||
        event.detail?.reason ||
        event.message ||
        event.summary ||
        (revision ? `Saved revision ${revision}` : "");
      return node(
        "li",
        {},
        node(
          "strong",
          {},
          event.action || event.type || `Revision ${revision || ""}`,
        ),
        node(
          "time",
          { datetime: event.createdAt || event.at || "" },
          formatDate(event.createdAt || event.at, true),
        ),
        node("p", {}, reason),
        version
          ? node(
              "details",
              {},
              node("summary", { class: "fine" }, "Inspect recorded version"),
              node("pre", {}, JSON.stringify(version, null, 2)),
            )
          : null,
      );
    }),
  );
}
function renderComments(module, record, comments) {
  const panel = node(
    "section",
    { class: "panel" },
    node("h2", {}, "Discussion"),
    comments.length
      ? comments.map((comment) =>
          node(
            "article",
            { class: "comment" },
            node(
              "small",
              {},
              `${comment.authorName || comment.user?.name || ownerName(comment.userId || comment.authorId || comment.actorId)} · ${formatDate(comment.createdAt, true)}`,
            ),
            node("p", {}, comment.body),
          ),
        )
      : node(
          "p",
          { class: "fine" },
          "Keep a question, disagreement or handoff with the record.",
        ),
  );
  if (can(module, "write", role()) || can(module, "approve", role())) {
    const body = node("textarea", {
      id: "comment-body",
      required: true,
      maxlength: 4000,
      rows: 3,
    });
    const status = node("p", { class: "form-status", role: "alert" });
    const submit = node(
      "button",
      { type: "submit", class: "button" },
      "Add comment",
    );
    panel.append(
      node(
        "form",
        {
          class: "section-gap",
          onsubmit: (event) => {
            event.preventDefault();
            action(
              async () => {
                await api.comment(
                  state.org,
                  module.id,
                  record.id,
                  body.value.trim(),
                );
                toast("Comment saved.");
                await route();
              },
              submit,
              status,
            );
          },
        },
        field("Comment", body),
        status,
        submit,
      ),
    );
  }
  return panel;
}
function renderReminder(module, record) {
  if (!can(module, "write", role())) return null;
  const at = node("input", {
    id: "reminder-at",
    type: "text",
    required: true,
    placeholder: "2026-11-02T09:00:00-05:00",
    pattern: INSTANT_PATTERN,
  });
  const status = node("p", { class: "form-status", role: "alert" });
  const submit = node(
    "button",
    { type: "submit", class: "button" },
    "Schedule my reminder",
  );
  return node(
    "section",
    { class: "panel" },
    node("h2", {}, "A reminder for you"),
    node(
      "p",
      { class: "fine" },
      "Queue a reminder for your own member email. A saved reminder is not proof of inbox delivery.",
    ),
    node(
      "form",
      {
        onsubmit: (event) => {
          event.preventDefault();
          action(
            async () => {
              await api.reminder(
                state.org,
                module.id,
                record.id,
                at.value.trim(),
              );
              at.value = "";
              status.textContent =
                "Reminder queued. It will be handled by the service’s scheduled job.";
              state.pageDirty = false;
              toast("Your reminder was queued.");
            },
            submit,
            status,
          );
        },
      },
      field(
        "When, with an explicit UTC offset",
        at,
        "A future instant within one year. Example: 2026-11-02T09:00:00-05:00.",
      ),
      status,
      submit,
    ),
  );
}
async function renderFiles(module, record) {
  const result = await api.files(state.org, module.id, record.id);
  const files = result.files || [];
  const panel = node(
    "section",
    { class: "panel" },
    node("h2", {}, "Private attachments"),
  );
  panel.append(
    files.length
      ? node(
          "ul",
          { class: "list-plain" },
          files.map((file) =>
            node(
              "li",
              {},
              node(
                "div",
                { class: "row" },
                node("strong", {}, file.name),
                button(
                  "Download",
                  (event) =>
                    action(async () => {
                      const blob = await api.downloadFile(state.org, file.id);
                      download(safeFilename(file.name), blob);
                      toast("Attachment downloaded.");
                    }, event.currentTarget),
                  "small",
                ),
              ),
              node(
                "small",
                {},
                `${file.mime} · ${Math.ceil(file.size / 1024)} KiB · ${formatDate(file.createdAt, true)}`,
              ),
              file.checksum
                ? node("small", { class: "code" }, `SHA-256 ${file.checksum}`)
                : null,
            ),
          ),
        )
      : node(
          "p",
          { class: "fine" },
          "No files attached to this document record.",
        ),
  );
  if (can(module, "write", role())) {
    const input = node("input", {
      id: "document-attachment",
      type: "file",
      accept:
        ".pdf,.txt,.csv,.png,.jpg,.jpeg,application/pdf,text/plain,text/csv,image/png,image/jpeg",
      required: true,
    });
    const status = node("p", { class: "form-status", role: "alert" });
    const submit = node(
      "button",
      { class: "button", type: "submit" },
      "Attach file",
    );
    panel.append(
      node(
        "form",
        {
          class: "section-gap",
          onsubmit: (event) => {
            event.preventDefault();
            action(
              async () => {
                const file = input.files?.[0];
                if (!file) throw new Error("Choose a file first.");
                if (file.size > 2 * 1024 * 1024)
                  throw new Error("Use a file no larger than 2 MiB.");
                const extensions = {
                  pdf: "application/pdf",
                  txt: "text/plain",
                  csv: "text/csv",
                  png: "image/png",
                  jpg: "image/jpeg",
                  jpeg: "image/jpeg",
                };
                const mime =
                  extensions[file.name.split(".").pop().toLowerCase()] ||
                  file.type;
                if (!Object.values(extensions).includes(mime))
                  throw new Error("Use a PDF, text, CSV, PNG or JPEG file.");
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = "";
                for (let i = 0; i < bytes.length; i += 0x8000)
                  binary += String.fromCharCode(
                    ...bytes.subarray(i, i + 0x8000),
                  );
                await api.attachFile(state.org, module.id, record.id, {
                  name: file.name,
                  mime,
                  content: btoa(binary),
                });
                toast("Private attachment saved.");
                state.pageDirty = false;
                await route();
              },
              submit,
              status,
            );
          },
        },
        field(
          "Attach a private document",
          input,
          "PDF, plain text, CSV, PNG or JPEG; up to 2 MiB per file and 25 MiB per organization.",
        ),
        status,
        submit,
      ),
    );
  }
  return panel;
}
function clearInvitation() {
  state.invitation = null;
  try {
    sessionStorage.removeItem("charity-os.invitation");
  } catch {}
}
function showInvitation() {
  const token = state.invitation;
  if (!token) return;
  configureEditor(
    "Organization invitation",
    "Join the invited workspace?",
    "Accept invitation",
    [
      node(
        "p",
        { class: "full-width" },
        "Accepting grants the organization membership attached to this private invitation. The service verifies that the invitation belongs to your signed-in email and has not expired or been revoked.",
      ),
      node(
        "div",
        { class: "full-width" },
        button(
          "Dismiss this invitation",
          () => {
            clearInvitation();
            closeSavedEditor();
            toast("Invitation dismissed in this tab.");
          },
          "subtle",
        ),
      ),
    ],
    async () => {
      const result = await api.acceptInvitation(token);
      clearInvitation();
      closeSavedEditor();
      const refreshed = await api.session();
      state.session = refreshed;
      setCsrfToken(refreshed.csrfToken);
      state.orgs = refreshed.orgs || [];
      state.org = result.orgId || result.org?.id || state.orgs[0]?.id || null;
      if (state.org) rememberOrg(state.org);
      state.cache.clear();
      await loadMembersIfOrg();
      renderAccount();
      renderOrgControl();
      toast("Organization invitation accepted.");
      await loadWorkspace();
    },
  );
}

async function renderReports(epoch) {
  const result = await api.reports(state.org);
  if (epoch !== state.epoch) return;
  const reports = result.reports || [];
  const allowed = readable().filter((m) => can(m, "export", role()));
  const title = node("input", {
    id: "report-title",
    required: true,
    maxlength: 180,
    placeholder: "Board review · October 2026",
  });
  const selections = node(
    "div",
    { class: "checklist" },
    allowed.map((module) =>
      node(
        "label",
        {},
        node("input", {
          type: "checkbox",
          name: "moduleIds",
          value: module.id,
        }),
        module.title,
      ),
    ),
  );
  const status = node("p", { class: "form-status", role: "alert" });
  const submit = node(
    "button",
    { type: "submit", class: "button primary" },
    "Freeze report",
  );
  const form = allowed.length
    ? node(
        "form",
        {
          onsubmit: (event) => {
            event.preventDefault();
            action(
              async () => {
                const moduleIds = [
                  ...selections.querySelectorAll("input:checked"),
                ].map((i) => i.value);
                if (!moduleIds.length)
                  throw new Error(
                    "Choose at least one module for the snapshot.",
                  );
                await api.freezeReport(state.org, {
                  title: title.value.trim(),
                  moduleIds,
                });
                toast("Report snapshot frozen.");
                await route();
              },
              submit,
              status,
            );
          },
        },
        field("Report title", title),
        node(
          "fieldset",
          { class: "section-gap" },
          node("legend", {}, "Include accessible modules"),
          selections,
        ),
        status,
        submit,
      )
    : node(
        "p",
        { class: "permission-note" },
        "Your role can read available reports but cannot freeze a new export.",
      );
  const reportList = node(
    "section",
    { class: "section-gap" },
    node(
      "div",
      { class: "section-header" },
      node("h2", {}, "Saved snapshots"),
      tag(reports.length),
    ),
    reports.length
      ? node(
          "div",
          { class: "stack" },
          reports.map((report) =>
            node(
              "article",
              { class: "snapshot" },
              node(
                "div",
                { class: "section-header" },
                node("h3", {}, report.title),
                tag("Frozen"),
              ),
              node(
                "p",
                { class: "meta" },
                `${formatDate(report.createdAt, true)} · ${report.modules?.length ?? "—"} modules`,
              ),
              report.checksum
                ? node(
                    "p",
                    { class: "fine code" },
                    `SHA-256 ${report.checksum}`,
                  )
                : null,
              node(
                "div",
                { class: "actions" },
                button("Inspect", () => showReport(report.id), "small"),
                button(
                  "Export JSON",
                  async (event) =>
                    action(async () => {
                      const data = await api.report(state.org, report.id);
                      download(
                        `${safeFilename(report.title)}.json`,
                        JSON.stringify(data.report, null, 2),
                      );
                      toast("Frozen report downloaded.");
                    }, event.currentTarget),
                  "small",
                ),
              ),
            ),
          ),
        )
      : empty(
          "No frozen reports yet.",
          "Freeze a dated view of the saved work. Future edits will not change that report.",
        ),
  );
  setContent(
    heading(
      "Reporting",
      "Keep the version you shared.",
      "Freeze an inspectable report with record IDs, source revisions and unknowns preserved.",
    ),
    node(
      "section",
      { class: "panel" },
      node("h2", {}, "A report from saved work"),
      node(
        "p",
        { class: "fine" },
        "A frozen snapshot records what was saved when it was created. It does not certify the claims, reconcile an external ledger or publish the report.",
      ),
      form,
    ),
    reportList,
  );
}
async function showReport(id) {
  const org = state.org;
  const result = await api.report(org, id);
  if (org !== state.org) return;
  const report = result.report;
  const content = node(
    "div",
    { class: "full-width" },
    tag("Immutable snapshot"),
    node(
      "p",
      { class: "fine" },
      `${formatDate(report.createdAt, true)} · ${report.checksum || "No checksum returned"}`,
    ),
  );
  for (const module of report.modules || []) {
    const list = node("ul", { class: "list-plain" });
    for (const record of module.records || [])
      list.append(
        node(
          "li",
          {},
          node("strong", {}, recordTitle(record)),
          node(
            "small",
            {},
            `ID ${record.id} · Revision ${record.revision} · ${labelFor(record.status)}`,
          ),
          node(
            "details",
            {},
            node("summary", { class: "fine" }, "Inspect frozen fields"),
            node("pre", {}, JSON.stringify(record.data, null, 2)),
          ),
        ),
      );
    content.append(
      node(
        "section",
        { class: "section-gap" },
        node("h3", {}, module.title || module.id),
        node("p", { class: "fine" }, `${module.records?.length || 0} records`),
        list,
      ),
    );
  }
  const fields = [content];
  if (report.missingness)
    fields.push(
      node(
        "div",
        { class: "full-width" },
        node("h3", {}, "Missingness"),
        node("pre", {}, JSON.stringify(report.missingness, null, 2)),
      ),
    );
  if (report.sourceRevisions)
    fields.push(
      node(
        "div",
        { class: "full-width" },
        node(
          "details",
          {},
          node("summary", {}, "Source revisions"),
          node("pre", {}, JSON.stringify(report.sourceRevisions, null, 2)),
        ),
      ),
    );
  configureEditor(
    "Frozen report",
    report.title,
    "Download JSON",
    fields,
    async () => {
      download(
        `${safeFilename(report.title)}.json`,
        JSON.stringify(report, null, 2),
      );
      closeSavedEditor();
    },
  );
}
function renderData() {
  const status = node("p", { class: "form-status", role: "status" });
  const previewTarget = node("div", {});
  state.importPreview = null;
  const backup = button(
    "Download organization JSON",
    async (event) =>
      action(
        async () => {
          const data = await api.exportOrg(state.org);
          download(
            `${safeFilename(activeOrg().slug || activeOrg().name)}-backup-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(data, null, 2),
          );
          toast("Organization backup downloaded.");
        },
        event.currentTarget,
        status,
      ),
    "primary",
  );
  const file = node("input", {
    id: "backup-file",
    type: "file",
    accept: ".json,application/json",
  });
  const preview = button(
    "Preview this backup",
    async (event) =>
      action(
        async () => {
          state.importPreview = null;
          previewTarget.replaceChildren();
          const selected = file.files?.[0];
          if (!selected)
            throw new Error("Choose a JSON organization backup first.");
          if (selected.size > 64 * 1024 * 1024)
            throw new Error("The backup exceeds the 64 MiB import limit.");
          let backup;
          try {
            backup = JSON.parse(await selected.text());
          } catch {
            throw new Error(
              "This file is not valid JSON. The saved workspace has not changed.",
            );
          }
          if (
            new TextEncoder().encode(JSON.stringify({ backup })).byteLength >
            64 * 1024 * 1024
          )
            throw new Error(
              "The parsed import request exceeds the service’s 64 MiB limit.",
            );
          const result = await api.previewImport(state.org, { backup });
          state.importPreview = { org: state.org, id: result.previewId };
          renderImportPreview(previewTarget, result, async () => {
            const context = state.importPreview;
            if (!context || context.org !== state.org)
              throw new Error(
                "Choose and preview the backup again for this organization.",
              );
            if (
              !(await confirmAction(
                "Apply this reviewed import?",
                `Import the previewed records into ${activeOrg().name}? Keep a current organization backup before applying it.`,
                "Import reviewed backup",
              ))
            )
              return;
            const committed = await api.commitImport(context.org, {
              previewId: context.id,
            });
            state.cache.clear();
            state.importPreview = null;
            previewTarget.replaceChildren(
              notice(
                `Import completed. ${typeof committed.imported === "number" ? `${committed.imported} records imported.` : "The service recorded the imported result."}`,
              ),
            );
            file.value = "";
            toast("Reviewed backup imported.");
          });
        },
        event.currentTarget,
        status,
      ),
    "",
  );
  file.addEventListener("change", () => {
    state.importPreview = null;
    previewTarget.replaceChildren();
  });
  const archiveTarget = node("div", {});
  const archives = button(
    "Show original import archives",
    (event) =>
      action(async () => {
        const result = await api.importArchives(state.org);
        archiveTarget.replaceChildren(
          node(
            "p",
            { class: "fine" },
            "These private source files preserve original history, trashed-file bytes and browser-only migration fields. They are separate from the current workspace export.",
          ),
          node(
            "ul",
            { class: "list-plain" },
            (result.imports || []).map((item) =>
              node(
                "li",
                {},
                node("span", {}, formatDate(item.committedAt, true)),
                button(
                  "Download original source JSON",
                  async (event) =>
                    action(async () => {
                      const source = await api.importArchive(
                        state.org,
                        item.id,
                      );
                      download(
                        `charity-os-source-${item.id}.json`,
                        JSON.stringify(source, null, 2),
                      );
                    }, event.currentTarget),
                  "small",
                ),
              ),
            ),
          ),
        );
        if (!(result.imports || []).length)
          archiveTarget.append(node("p", {}, "No completed import archives."));
      }, event.currentTarget),
    "subtle",
  );

  setContent(
    heading(
      "Data and recovery",
      "Your records. A clear way out.",
      "Download a full organization backup, review an import before applying it, and keep a separate recovery copy.",
    ),
    admin()
      ? node(
          "div",
          { class: "stack" },
          node(
            "section",
            { class: "panel" },
            node("h2", {}, "Organization backup"),
            node(
              "p",
              {},
              "The JSON export preserves the server’s supported organization data and stable references. It may contain private information; store it under your organization’s access rules.",
            ),
            backup,
            status,
            archives,
            archiveTarget,
          ),
          node(
            "section",
            { class: "panel" },
            node("h2", {}, "Preview an import"),
            node(
              "p",
              { class: "fine" },
              "Restore into an empty organization. Maximum file size: 64 MiB. A preview changes no records. Restored records start in their initial workflow state with new ownership and approvals reset; source history remains import provenance. Browser-only Charity OS backups are converted with explicit warnings; original fields remain in the private source archive. Review the summary before applying it.",
            ),
            field("Organization or browser-only Charity OS JSON backup", file),
            preview,
            previewTarget,
          ),
        )
      : notice(
          "Full organization backup and import require an owner or administrator. Module exports remain available where your role permits them.",
          true,
        ),
  );
}
function renderImportPreview(target, result, commit) {
  const issues = [
    ...(result.issues || []),
    ...(result.warnings || []).map((w) => ({
      ...w,
      severity: "warning",
      message: w.reason || w.message,
    })),
  ];
  const hasErrors = issues.some(
    (issue) => !["warning", "info"].includes(issue.severity),
  );
  const summary = node(
    "dl",
    { class: "detail-fields" },
    Object.entries(result.summary || {}).map(([key, value]) =>
      node(
        "div",
        {},
        node("dt", {}, labelFor(key)),
        node(
          "dd",
          {},
          typeof value === "object" ? JSON.stringify(value) : String(value),
        ),
      ),
    ),
  );
  const status = node("p", { class: "form-status", role: "alert" });
  const save = button(
    "Apply reviewed import",
    (event) => action(commit, event.currentTarget, status),
    "primary",
    { disabled: !result.previewId || hasErrors },
  );
  target.replaceChildren(
    node(
      "section",
      { class: "import-preview" },
      node("h3", {}, "Import preview"),
      summary,
      issues.length
        ? node(
            "div",
            { class: "section-gap" },
            node("h4", {}, "Issues to review"),
            node(
              "ul",
              {},
              issues
                .slice(0, 100)
                .map((issue) =>
                  node(
                    "li",
                    { class: issue.severity === "warning" ? "" : "error-text" },
                    `${issue.collection ? `Collection ${issue.collection}: ` : ""}${issue.sourceId !== undefined && issue.sourceId !== null ? `Source ${issue.sourceId}: ` : ""}${issue.row !== undefined ? `Row ${issue.row}: ` : ""}${issue.field ? `${issue.field}: ` : ""}${issue.message || String(issue)}`,
                  ),
                ),
            ),
            issues.length > 100
              ? node(
                  "p",
                  { class: "fine" },
                  `${issues.length - 100} additional issues are included in the downloadable preview.`,
                )
              : null,
          )
        : node("p", { class: "fine" }, "No validation issues returned."),
      result.records?.length
        ? node(
            "details",
            { class: "section-gap" },
            node(
              "summary",
              {},
              `Inspect ${result.records.length} previewed records`,
            ),
            node("pre", {}, JSON.stringify(result.records, null, 2)),
          )
        : null,
      node(
        "div",
        { class: "actions section-gap" },
        save,
        button(
          "Download preview",
          () =>
            download(
              "charity-os-import-preview.json",
              JSON.stringify(result, null, 2),
            ),
          "subtle",
        ),
      ),
      status,
    ),
  );
}
function roleOptions(value, allowOwner = false) {
  return state.roles
    .filter((r) => allowOwner || (typeof r === "string" ? r : r.id) !== "owner")
    .map((r) => {
      const id = typeof r === "string" ? r : r.id;
      return node(
        "option",
        { value: id, selected: id === value },
        typeof r === "string" ? labelFor(r) : r.label || labelFor(id),
      );
    });
}
async function renderMembers(epoch) {
  const result = await api.members(state.org);
  if (epoch !== state.epoch) return;
  state.members = result.members || [];
  const invitations = result.invitations || [];
  const rows = state.members.map((member) => {
    const id = member.userId || member.id;
    const actions = [];
    if (admin())
      actions.push(
        button(
          "Change role",
          async () => {
            const programs = await recordsFor("programs");
            const select = node(
              "select",
              { id: "member-role", required: true },
              roleOptions(member.role, true),
            );
            const scope = node(
              "div",
              { id: "member-programs", class: "reference-list", role: "group" },
              programs.map((program) =>
                node(
                  "label",
                  {},
                  node("input", {
                    type: "checkbox",
                    value: program.id,
                    checked: member.programIds?.includes(program.id),
                  }),
                  recordTitle(program),
                ),
              ),
            );
            configureEditor(
              "Organization access",
              `Role for ${member.name || member.email}`,
              "Save role",
              [
                field("Role", select),
                field(
                  "Program scope",
                  scope,
                  "Leave every program unchecked for organization scope. Owners and administrators retain their administrative boundary.",
                ),
                node(
                  "p",
                  { class: "full-width fine" },
                  "Changing access applies immediately. The service protects the last owner and checks your authority.",
                ),
              ],
              async () => {
                await api.updateMember(state.org, id, {
                  role: select.value,
                  revision: member.revision,
                  programIds: [...scope.querySelectorAll("input:checked")].map(
                    (i) => i.value,
                  ),
                });
                closeSavedEditor();
                const session = await api.session();
                state.session = session;
                state.orgs = session.orgs || state.orgs;
                setCsrfToken(session.csrfToken);
                renderOrgControl();
                toast("Membership role updated.");
                await route();
              },
            );
          },
          "small",
        ),
        button(
          "Remove",
          async (event) => {
            if (
              !(await confirmAction(
                "Remove organization access?",
                `${member.name || member.email} will no longer be a member of this organization. Existing records remain. The service checks owner protections.`,
                "Remove access",
              ))
            )
              return;
            await action(async () => {
              await api.removeMember(state.org, id);
              toast("Membership removed.");
              await route();
            }, event.currentTarget);
          },
          "small danger",
        ),
      );
    return node(
      "tr",
      {},
      node(
        "td",
        {},
        node("strong", {}, member.name || member.email),
        member.name ? node("small", {}, member.email) : null,
      ),
      node("td", {}, tag(labelFor(member.role))),
      node(
        "td",
        {},
        member.programIds?.length
          ? `${member.programIds.length} scoped programs`
          : "Organization scope",
      ),
      node("td", {}, node("div", { class: "cell-actions" }, actions)),
    );
  });
  const email = node("input", {
    id: "invite-email",
    type: "email",
    required: true,
    maxlength: 254,
    autocomplete: "off",
  });
  const selectedRole = node(
    "select",
    { id: "invite-role", required: true },
    roleOptions("contributor"),
  );
  const status = node("p", { class: "form-status", role: "alert" });
  const submit = node(
    "button",
    { class: "button primary", type: "submit" },
    "Send invitation",
  );
  const invite = admin()
    ? node(
        "section",
        { class: "panel section-gap" },
        node("h2", {}, "Invite a teammate"),
        node(
          "p",
          { class: "fine" },
          "Choose the least access needed for their work. An invitation does not subscribe someone to a newsletter.",
        ),
        node(
          "form",
          {
            onsubmit: (event) => {
              event.preventDefault();
              action(
                async () => {
                  await api.invite(state.org, {
                    email: email.value.trim(),
                    role: selectedRole.value,
                  });
                  toast("Invitation created.");
                  await route();
                },
                submit,
                status,
              );
            },
          },
          node(
            "div",
            { class: "inline-fields" },
            field("Email address", email),
            field("Organization role", selectedRole),
            submit,
          ),
          status,
        ),
      )
    : null;
  const pending = invitations.length
    ? node(
        "section",
        { class: "panel section-gap" },
        node("h2", {}, "Invitations"),
        node(
          "ul",
          { class: "list-plain" },
          invitations.map((invitation) =>
            node(
              "li",
              {},
              node(
                "div",
                { class: "row" },
                node("span", {}, invitation.email),
                tag(invitation.status || "pending"),
              ),
              node(
                "small",
                {},
                `${labelFor(invitation.role)} · ${invitation.expiresAt ? `Expires ${formatDate(invitation.expiresAt, true)}` : formatDate(invitation.createdAt, true)}`,
              ),
              admin() &&
                !["accepted", "revoked", "expired"].includes(invitation.status)
                ? button(
                    "Revoke invitation",
                    async (event) =>
                      action(async () => {
                        if (
                          !(await confirmAction(
                            "Revoke this invitation?",
                            `Remove the outstanding invitation for ${invitation.email}?`,
                            "Revoke invitation",
                          ))
                        )
                          return;
                        await api.revokeInvitation(state.org, invitation.id);
                        toast("Invitation revoked.");
                        await route();
                      }, event.currentTarget),
                    "small danger",
                  )
                : null,
            ),
          ),
        ),
      )
    : null;
  setContent(
    heading(
      "People and access",
      "A clear role for each person.",
      "Membership controls the organization boundary. Module and record permissions are enforced by the service.",
    ),
    node(
      "div",
      { class: "table-wrap" },
      node(
        "table",
        {},
        node(
          "thead",
          {},
          node(
            "tr",
            {},
            ["Person", "Role", "Program scope", "Actions"].map((t) =>
              node("th", { scope: "col" }, t),
            ),
          ),
        ),
        node("tbody", {}, rows),
      ),
    ),
    invite,
    pending,
  );
}
async function renderIntegrations(epoch) {
  const result = await api.integrations(state.org);
  if (epoch !== state.epoch) return;
  const integrations = result.integrations || [];
  const cards = integrations.map((integration) => {
    const output = node("div", {});
    const status = node("p", { class: "form-status", role: "alert" });
    const csvFile =
      integration.provider === "csv"
        ? node("input", {
            id: `csv-source-${integration.id}`,
            type: "file",
            accept: ".csv,text/csv",
          })
        : null;
    const test = button(
      "Test read access",
      (event) =>
        action(
          async () => {
            const response = await api.testIntegration(
              state.org,
              integration.id,
            );
            output.replaceChildren(
              notice(
                response.result?.message ||
                  (response.result?.connected
                    ? "Connection succeeded."
                    : "Connection was not confirmed."),
                !response.result?.connected,
              ),
            );
          },
          event.currentTarget,
          status,
        ),
      "small",
    );
    const preview = button(
      "Preview records",
      (event) =>
        action(
          async () => {
            let body = {};
            if (csvFile) {
              const file = csvFile.files?.[0];
              if (!file)
                throw new Error(
                  "Choose a CSV file before previewing this import.",
                );
              if (file.size > 2 * 1024 * 1024)
                throw new Error("Use a CSV file no larger than 2 MiB.");
              const rows = parseCsv(await file.text());
              body = {
                rows: typedCsvRows(
                  rows,
                  integration.config?.fieldMap,
                  moduleById(integration.config?.moduleId),
                ),
              };
            }
            const response = await api.previewIntegration(
              state.org,
              integration.id,
              body,
            );
            renderImportPreview(output, response, async () => {
              if (
                !(await confirmAction(
                  "Import this connector preview?",
                  "Apply the reviewed connector records to this organization? Existing field-ownership and validation rules still apply.",
                  "Import reviewed records",
                ))
              )
                return;
              await api.importIntegration(
                state.org,
                integration.id,
                response.previewId,
              );
              state.cache.clear();
              output.replaceChildren(notice("Connector import completed."));
              toast("Connector records imported.");
            });
          },
          event.currentTarget,
          status,
        ),
      "small",
    );
    return node(
      "article",
      { class: "panel" },
      node(
        "div",
        { class: "section-header" },
        node("h2", {}, integration.name),
        tag(labelFor(integration.status || "not tested")),
      ),
      node(
        "p",
        { class: "fine" },
        `${labelFor(integration.provider)}${integration.config?.moduleId ? ` → ${moduleById(integration.config.moduleId)?.title || integration.config.moduleId}` : ""}`,
      ),
      integration.config?.baseUrl
        ? node("p", { class: "fine" }, integration.config.baseUrl)
        : null,
      integration.lastCheckedAt
        ? node(
            "p",
            { class: "fine" },
            `Last checked ${formatDate(integration.lastCheckedAt, true)}`,
          )
        : null,
      integration.lastError ? notice(integration.lastError) : null,
      csvFile
        ? field(
            "Source CSV",
            csvFile,
            "Header row and up to 1,000 data rows, maximum 2 MiB. Include a stable id column. Use the saved field map; booleans use true/false, and money uses a JSON minor/currency/precision object.",
          )
        : null,
      admin()
        ? node(
            "div",
            { class: "actions" },
            test,
            preview,
            integration.provider !== "csv"
              ? button(
                  "Set API token",
                  () => editIntegrationCredential(integration),
                  "small",
                )
              : null,
            button(
              "Disable connection",
              (event) =>
                action(
                  async () => {
                    if (
                      !(await confirmAction(
                        "Disable this connection?",
                        "Remove its saved credential and stop new reads or imports. Source identities remain in your records. Remote credentials must be revoked with their provider.",
                        "Disable connection",
                      ))
                    )
                      return;
                    await api.disableIntegration(
                      state.org,
                      integration.id,
                      integration.revision,
                    );
                    await route();
                  },
                  event.currentTarget,
                  status,
                ),
              "small danger",
            ),
          )
        : null,
      status,
      output,
    );
  });
  setContent(
    heading(
      "Connections",
      "Connect with a clear boundary.",
      "Test access, inspect a preview and import deliberately. A saved connection is not proof that another system has synchronized.",
      admin()
        ? [button("+ Add connection", () => openIntegrationEditor(), "primary")]
        : [],
    ),
    integrations.length
      ? node("div", { class: "stack" }, cards)
      : empty(
          "No connections configured.",
          "Your shared records work without a connector. Add one only when its field ownership and access are agreed.",
          admin()
            ? button(
                "Add a connection",
                () => openIntegrationEditor(),
                "primary",
              )
            : null,
        ),
    notice(
      "Provider credentials are sent only to this authenticated service when you save a connection. Credentials are not returned in connection lists or exports.",
      true,
    ),
  );
}
function editIntegrationCredential(integration) {
  const token = node("input", {
    id: "replacement-token",
    type: "password",
    required: true,
    autocomplete: "off",
    maxlength: 4000,
  });
  configureEditor(
    "Private connection",
    `Set token for ${integration.name}`,
    "Save API token",
    [
      node(
        "p",
        { class: "full-width fine" },
        `Credential is bound to ${integration.config?.baseUrl || integration.provider}. The saved value is never returned to this interface.`,
      ),
      field("Replacement API token", token),
    ],
    async () => {
      await api.updateIntegration(state.org, integration.id, {
        revision: integration.revision,
        token: token.value,
      });
      closeSavedEditor();
      toast("Credential saved. Test read access before importing.");
      await route();
    },
  );
}
function openIntegrationEditor() {
  const provider = node(
    "select",
    { id: "connector-provider", required: true },
    [
      ["civicrm", "CiviCRM"],
      ["openproject", "OpenProject"],
      ["kobo", "KoboToolbox"],
      ["csv", "CSV import"],
    ].map(([value, label]) => node("option", { value }, label)),
  );
  const name = node("input", {
    id: "connector-name",
    required: true,
    maxlength: 160,
  });
  const url = node("input", {
    id: "connector-url",
    type: "url",
    placeholder: "https://your-organization.example",
    pattern: "https://.*",
  });
  const token = node("input", {
    id: "connector-token",
    type: "password",
    autocomplete: "off",
    maxlength: 4000,
  });
  const module = node(
    "select",
    { id: "connector-module" },
    node("option", { value: "" }, "Choose a target module"),
    readable()
      .filter((m) => can(m, "write", role()))
      .map((m) => node("option", { value: m.id }, m.title)),
  );
  const mapping = node("textarea", {
    id: "connector-map",
    rows: 5,
    placeholder: '{"external_title":"title"}',
  });
  configureEditor(
    "Data and integrations",
    "Add a connection",
    "Save connection",
    [
      field("Provider", provider),
      field("Connection name", name),
      field("HTTPS base URL", url),
      field(
        "API token",
        token,
        "Enter only the credential approved for this connection. It will not be displayed again.",
      ),
      field("Import target module", module),
      node(
        "div",
        { class: "full-width" },
        field(
          "Field map JSON",
          mapping,
          "Map external field names to the selected module’s field keys. No scripts or expressions.",
        ),
      ),
    ],
    async () => {
      let fieldMap;
      try {
        fieldMap = mapping.value.trim() ? JSON.parse(mapping.value) : undefined;
      } catch {
        throw new Error("The field map must be valid JSON.");
      }
      if (fieldMap && (Array.isArray(fieldMap) || typeof fieldMap !== "object"))
        throw new Error("The field map must be a JSON object.");
      await api.createIntegration(state.org, {
        provider: provider.value,
        name: name.value.trim(),
        ...(url.value.trim() ? { baseUrl: url.value.trim() } : {}),
        ...(token.value ? { token: token.value } : {}),
        ...(module.value ? { moduleId: module.value } : {}),
        ...(fieldMap ? { fieldMap } : {}),
      });
      token.value = "";
      closeSavedEditor();
      toast("Connection saved. Test access before importing.");
      await route();
    },
  );
}
async function renderSettings(epoch) {
  const result = await api.org(state.org);
  if (epoch !== state.epoch) return;
  const org = result.org || result.organization || result;
  state.details = org;
  const name = node("input", {
    id: "settings-name",
    required: true,
    maxlength: 160,
    value: org.name || activeOrg().name,
  });
  const currency = node("input", {
    id: "settings-currency",
    readOnly: true,
    value: org.currency || "USD",
  });
  const timeZone = node("input", {
    id: "settings-zone",
    readOnly: true,
    value: org.timeZone || "UTC",
  });
  const status = node("p", { class: "form-status", role: "alert" });
  const submit = node(
    "button",
    { type: "submit", class: "button primary" },
    "Save organization name",
  );
  name.disabled = !admin();
  const form = node(
    "form",
    {
      onsubmit: (event) => {
        event.preventDefault();
        action(
          async () => {
            await api.updateOrg(state.org, {
              name: name.value.trim(),
              ...(org.revision !== undefined ? { revision: org.revision } : {}),
            });
            const current = activeOrg();
            current.name = name.value.trim();
            renderOrgControl();
            toast("Organization name saved.");
            await route();
          },
          submit,
          status,
        );
      },
    },
    node(
      "div",
      { class: "form-grid" },
      field("Organization name", name),
      field(
        "Planning currency",
        currency,
        "Fixed when the organization is created. Records keep their own explicit currency.",
      ),
      field(
        "Named time zone",
        timeZone,
        "Fixed when the organization is created. Record deadlines retain their own time zones.",
      ),
    ),
    status,
    admin()
      ? submit
      : node(
          "p",
          { class: "permission-note" },
          "An owner or administrator can change the organization name.",
        ),
  );
  const auditPanel = node(
    "section",
    { class: "panel section-gap" },
    node("h2", {}, "Organization audit"),
    node(
      "p",
      { class: "fine" },
      "Account, record, import and export actions retain the service’s audit evidence.",
    ),
    button(
      "Load audit history",
      async (event) =>
        action(async () => {
          const result = await api.audit(state.org);
          auditPanel.replaceChildren(
            node("h2", {}, "Organization audit"),
            renderHistory(result.events || []),
          );
        }, event.currentTarget),
      "subtle",
    ),
  );
  setContent(
    heading(
      "Organization settings",
      "The context behind the records.",
      "Organization defaults guide new work. Existing records keep their own currencies, dates and history.",
    ),
    node("section", { class: "panel" }, form),
    admin() ? auditPanel : null,
  );
}
function showPrivacy() {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";
  dialog.setAttribute("aria-labelledby", "privacy-title");
  dialog.append(
    node("h2", { id: "privacy-title" }, "Workspace data and access"),
    node(
      "p",
      {},
      "Sign-in links use your email address to open your account. Signing in does not join a newsletter.",
    ),
    node(
      "p",
      {},
      "Organization records are saved on the shared service and shown according to organization membership and role. They are separate from the public Charitology Record and static API.",
    ),
    node(
      "p",
      {},
      "Organization administrators manage access and exports. An export can contain private records; keep it under your organization’s access rules. Ask your organization administrator about correction, retention or account access.",
    ),
    node(
      "p",
      {},
      "Browser settings keep the color-theme preference, this tab’s organization selection and any pending invitation token until you accept or dismiss it. This interface does not cache private records for offline use.",
    ),
    node(
      "div",
      { class: "dialog-actions" },
      button("Close", () => dialog.close(), "primary"),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      if (safeRoute() === "privacy") history.replaceState(null, "", "#home");
    },
    { once: true },
  );
  dialog.showModal();
}

$("#sign-in-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button");
  action(
    async () => {
      const result = await api.signIn($("#sign-in-email").value.trim());
      $("#sign-in-status").replaceChildren(
        node(
          "p",
          {},
          result.message ||
            "If this address can receive sign-in mail, a private link will arrive. Open it and use the confirmation button.",
        ),
        state.invitation
          ? node(
              "p",
              {},
              "If the link opens another tab, return here after signing in to accept your invitation.",
            )
          : null,
        button(
          "I’ve signed in — refresh this tab",
          () => location.reload(),
          "small subtle",
        ),
      );
    },
    submit,
    $("#sign-in-status"),
  );
});
$("#editor-form").addEventListener("input", () => {
  if (state.editor) state.dirty = true;
});
$("#editor-form").addEventListener("change", () => {
  if (state.editor) state.dirty = true;
});
$("#editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.editor) return;
  action(() => state.editor.onSave(), $("#editor-save"), $("#editor-status"));
});
$("#editor-close").addEventListener("click", () => discardEditor());
$("#editor-cancel").addEventListener("click", () => discardEditor());
$("#editor-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  discardEditor();
});
$("#org-switch").addEventListener("change", async (event) => {
  const next = event.target.value;
  if (next === state.org) return;
  if (!(await discardEditor()) || !(await discardPage())) {
    event.target.value = state.org;
    return;
  }
  state.org = next;
  state.cache.clear();
  state.counts = {};
  state.details = null;
  state.importPreview = null;
  rememberOrg(next);
  await loadMembers();
  renderOrgControl();
  location.hash = "home";
  await route();
});
$("#new-org").addEventListener("click", async () => {
  if (!(await discardEditor()) || !(await discardPage())) return;
  renderCreateOrganization();
  $("#sidebar").classList.remove("open");
  focusHeading();
});
$("#module-search").addEventListener("input", renderNav);
$("#nav-toggle").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#nav-toggle").setAttribute("aria-expanded", String(open));
});
$("#content").addEventListener("click", () => {
  if (innerWidth < 761) {
    $("#sidebar").classList.remove("open");
    $("#nav-toggle").setAttribute("aria-expanded", "false");
  }
});
$("#content").addEventListener("input", (event) => {
  if (event.target.closest("form")) state.pageDirty = true;
});
$("#content").addEventListener("change", (event) => {
  if (event.target.closest("form")) state.pageDirty = true;
});
window.addEventListener("hashchange", async () => {
  if ((state.editor && !(await discardEditor())) || !(await discardPage())) {
    history.replaceState(null, "", `#${state.route}`);
    return;
  }
  if (state.session?.user) route();
  else if (safeRoute() === "privacy") showPrivacy();
});
window.addEventListener("beforeunload", (event) => {
  if (state.dirty || state.pageDirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function applyTheme(value) {
  document.documentElement.dataset.theme = value;
  $(".brand img").src = value === "dark" ? "/mark-dark.svg" : "/mark.svg";
  $("#theme-toggle").setAttribute(
    "aria-label",
    `Use ${value === "dark" ? "light" : "dark"} color theme`,
  );
}
$("#theme-toggle").addEventListener("click", () => {
  const value =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(value);
  try {
    localStorage.setItem("charitology.theme", value);
  } catch {}
});
try {
  const theme = localStorage.getItem("charitology.theme");
  if (["light", "dark"].includes(theme)) applyTheme(theme);
} catch {}
const invitationQuery = new URLSearchParams(location.search);
const incomingInvitation = invitationQuery.get("token");
if (
  location.pathname === "/invite" &&
  incomingInvitation &&
  /^[A-Za-z0-9_.-]{20,500}$/.test(incomingInvitation)
) {
  state.invitation = incomingInvitation;
  try {
    sessionStorage.setItem("charity-os.invitation", incomingInvitation);
  } catch {}
  history.replaceState(null, "", "/#home");
} else {
  try {
    state.invitation = sessionStorage.getItem("charity-os.invitation");
  } catch {}
}
boot();
