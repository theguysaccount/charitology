// Bounded synthetic DOM/API harness for actual entry points. No extension is installed.
import vm from "node:vm";

export class FixtureNode {
  constructor(tag = "text", value = "") {
    this.tagName = tag.toLowerCase();
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.listeners = new Map();
    this._text = value;
    this.value = "";
    this.checked = false;
    this.hidden = false;
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get textContent() {
    return (
      this._text +
      this.children
        .map((x) => (typeof x === "string" ? x : x.textContent))
        .join("")
    );
  }
  set innerHTML(_value) {
    throw Error("Protected HTML sink: markup must never be assigned.");
  }
  get innerHTML() {
    throw Error("Protected markup read.");
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === "id") this.id = String(value);
    if (key === "href") this.href = String(value);
    if (key === "src" || key === "srcset") this[key] = String(value);
  }
  getAttribute(key) {
    return this.attrs[key] ?? null;
  }
  append(...items) {
    for (const item of items) {
      this.children.push(item);
      if (typeof item !== "string") item.parent = this;
    }
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  addEventListener(name, fn) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(fn);
    this.listeners.set(name, listeners);
  }
  async dispatch(name, extra = {}) {
    const event = {
      preventDefault() {},
      target: this,
      currentTarget: this,
      ...extra,
    };
    return Promise.all((this.listeners.get(name) || []).map((fn) => fn(event)));
  }
  focus() {
    this.focused = true;
  }
  select() {
    this.selected = true;
  }
  attachShadow({ mode }) {
    if (mode !== "closed") throw Error("Content shadow must stay closed.");
    const root = new FixtureNode("shadow");
    this.fixtureShadow = root;
    return root;
  }
  querySelectorAll(selector) {
    if (selector !== 'input[type="checkbox"]')
      throw Error(`Unexpected fixture selector ${selector}`);
    return descendants(this).filter(
      (x) => x.tagName === "input" && x.type === "checkbox",
    );
  }
}
export function descendants(node) {
  return node.children.flatMap((x) =>
    typeof x === "string" ? [] : [x, ...descendants(x)],
  );
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export const tick = () => new Promise((resolve) => setImmediate(resolve));
export async function flush() {
  await tick();
  await tick();
}
const deny = (calls, label) => {
  calls.protected.push(label);
  throw Error(`Protected field read: ${label}`);
};

export function extensionFixture({
  kind = "popup",
  title = "Donate to Fictional Aid | GoFundMe",
  hostname = "www.gofundme.com",
  tabMode = "normal",
  createMode = "normal",
  storage = new Map(),
  getMode = "normal",
  setMode = "normal",
  apiFamily = "browser",
  checklist = [],
  fetchMode = "normal",
} = {}) {
  const calls = {
    protected: [],
    fetch: [],
    network: [],
    query: [],
    created: [],
    get: [],
    set: [],
    title: 0,
    tabTitle: 0,
    closed: 0,
  };
  const ids = new Map();
  for (const id of [
    "checklist",
    "count",
    "q",
    "method",
    "lookup",
    "lookup-status",
    "lookup-manual",
  ]) {
    const node = new FixtureNode(
      id === "lookup" ? "form" : id === "q" ? "input" : "div",
    );
    node.id = id;
    ids.set(id, node);
  }
  ids.get("lookup-manual").hidden = true;
  const html = new FixtureNode("html");
  const createdNode = (tag) => {
    const node = new FixtureNode(tag);
    for (const attr of ["src", "srcset"])
      Object.defineProperty(node, attr, {
        set: (value) => {
          calls.network.push(`${tag}.${attr}:${value}`);
          throw Error("Unexpected resource loading sink");
        },
      });
    return node;
  };
  Object.defineProperty(html, "textContent", {
    get: () => deny(calls, "documentElement.textContent"),
  });
  Object.defineProperty(html, "innerText", {
    get: () => deny(calls, "documentElement.innerText"),
  });
  html.querySelector = () => deny(calls, "documentElement.querySelector");
  html.querySelectorAll = () => deny(calls, "documentElement.querySelectorAll");
  const document = {
    documentElement: html,
    createElement: createdNode,
    getElementById: (id) => {
      if (
        (kind === "content" && id !== "charitology-before-you-give") ||
        (kind === "popup" && !ids.has(id))
      )
        return deny(calls, `document.getElementById(${id})`);
      return ids.get(id) || descendants(html).find((x) => x.id === id) || null;
    },
  };
  for (const key of ["body", "forms", "cookie", "URL", "referrer"])
    Object.defineProperty(document, key, {
      get: () => deny(calls, `document.${key}`),
    });
  Object.defineProperty(document, "title", {
    get() {
      calls.title++;
      if (kind === "popup") return deny(calls, "popup document.title");
      return typeof title === "function" ? title() : title;
    },
  });
  document.querySelector = () => deny(calls, "document.querySelector");
  document.querySelectorAll = () => deny(calls, "document.querySelectorAll");
  const location = {};
  Object.defineProperty(location, "hostname", { get: () => hostname });
  for (const key of ["href", "search", "hash", "pathname", "origin"])
    Object.defineProperty(location, key, {
      get: () => deny(calls, `location.${key}`),
    });
  const tab = {};
  Object.defineProperty(tab, "title", {
    get() {
      calls.tabTitle++;
      return title;
    },
  });
  Object.defineProperty(tab, "url", { get: () => deny(calls, "tab.url") });
  const api = {
    tabs: {
      query: async (options) => {
        calls.query.push(options);
        if (tabMode === "denied") throw Error("Synthetic restricted page");
        if (tabMode && typeof tabMode === "object") await tabMode.promise;
        return tabMode === "empty" ? [] : [tab];
      },
      create: (options) => {
        calls.created.push(options);
        if (createMode === "denied")
          return Promise.reject(Error("Synthetic create denied"));
        if (createMode && typeof createMode === "object")
          return createMode.promise;
        return Promise.resolve({ id: 42 });
      },
    },
    storage: {
      local: {
        get: async (key) => {
          calls.get.push(key);
          if (kind === "popup") return deny(calls, "popup storage.get");
          if (getMode === "denied")
            throw Error("Synthetic denied preference read");
          if (getMode && typeof getMode === "object") {
            await getMode.promise;
          }
          return { [key]: storage.get(key) };
        },
        set: async (values) => {
          calls.set.push(values);
          if (kind === "popup") return deny(calls, "popup storage.set");
          if (setMode === "denied")
            throw Error("Synthetic denied preference save");
          if (setMode && typeof setMode === "object") await setMode.promise;
          for (const [key, value] of Object.entries(values))
            storage.set(key, value);
        },
      },
    },
  };
  if (tabMode === "missing") delete api.tabs.query;
  const outbound = (kind) =>
    function () {
      calls.network.push(kind);
      throw Error(`Outbound ${kind} prohibited`);
    };
  const globals = {
    document,
    location,
    window: { close: () => calls.closed++ },
    fetch: async (url) => {
      calls.fetch.push(url);
      if (kind !== "popup" || url !== "checklist.json") {
        calls.network.push(String(url));
        throw Error("Only bundled checklist fetch allowed");
      }
      if (fetchMode === "denied") throw Error("Synthetic bundle read failed");
      return {
        json: async () => {
          if (fetchMode === "bad-json") throw Error("Synthetic invalid JSON");
          return checklist;
        },
      };
    },
    XMLHttpRequest: outbound("XHR"),
    WebSocket: outbound("WebSocket"),
    EventSource: outbound("EventSource"),
    Image: outbound("Image"),
    navigator: { sendBeacon: outbound("beacon") },
    console,
  };
  if (apiFamily !== "none") globals[apiFamily] = api;
  Object.defineProperty(globals, "localStorage", {
    get: () => deny(calls, "page localStorage"),
  });
  const context = vm.createContext(globals);
  const run = (source) =>
    new vm.Script(source, { filename: `extension/${kind}.js` }).runInContext(
      context,
    );
  return {
    context,
    run,
    calls,
    ids,
    document,
    html,
    storage,
    api,
    all: () => descendants(html),
    card: () =>
      descendants(html).find((x) => x.id === "charitology-before-you-give"),
    shadow: () =>
      descendants(html).find((x) => x.id === "charitology-before-you-give")
        ?.fixtureShadow,
  };
}
