// Bounded DOM for actual SSR tool markup and real inline scripts. No layout or browser claim.
import { parse as parseHtml, parseFragment } from "parse5";
const nativeSetTimeout = globalThis.setTimeout,
  nativeClearTimeout = globalThis.clearTimeout;
let activeTimers = new Set();
function pieces(selector) {
  return selector.match(/(?:[^\s\[\]]|\[[^\]]*\])+/g) || [];
}
function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
export class ToolElement {
  constructor(tag = "#text", text = "") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this._text = text;
    this._value = "";
    this._valueSet = false;
    this.dataset = {};
    this.style = {
      setProperty(k, v) {
        this[k] = v;
      },
    };
    this.className = "";
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.inert = false;
    this.files = null;
    this.classList = {
      add: (...v) =>
        (this.className = [...new Set([...this.className.split(" "), ...v])]
          .filter(Boolean)
          .join(" ")),
      remove: (...v) =>
        (this.className = this.className
          .split(" ")
          .filter((k) => !v.includes(k))
          .join(" ")),
      contains: (v) => this.className.split(" ").includes(v),
      toggle: (v, on) => {
        const exists = this.classList.contains(v);
        const yes = on === undefined ? !exists : on;
        yes ? this.classList.add(v) : this.classList.remove(v);
        return yes;
      },
    };
  }
  get parentElement() {
    return this.parentNode;
  }
  get ownerDocument() {
    return globalThis.document;
  }
  get elements() {
    if (this.tagName !== "FORM") return undefined;
    const controls = this.querySelectorAll("input,select,textarea,button");
    Object.defineProperty(controls, "namedItem", {
      value: (name) =>
        controls.find(
          (control) => control.name === name || control.id === name,
        ) ?? null,
    });
    return controls;
  }
  get id() {
    return this.attributes.get("id") || "";
  }
  set id(v) {
    this.attributes.set("id", String(v));
  }
  get type() {
    return this.attributes.get("type") || "";
  }
  set type(v) {
    this.attributes.set("type", String(v));
  }
  get name() {
    return this.attributes.get("name") || "";
  }
  set name(v) {
    this.attributes.set("name", String(v));
  }
  get value() {
    if (this._valueSet) return this._value;
    if (this.tagName === "SELECT")
      return (
        this.querySelectorAll("option").find((o) => o.selected)?.value ??
        this.querySelector("option")?.value ??
        ""
      );
    return this.tagName === "TEXTAREA"
      ? this.textContent
      : (this.attributes.get("value") ?? "");
  }
  set value(v) {
    this._value = String(v);
    this._valueSet = true;
  }
  get valueAsNumber() {
    return this.value.trim() === "" ? NaN : Number(this.value);
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this.children.forEach((c) => (c.parentNode = null));
    this.children = [];
    this._text = String(v ?? "");
  }
  get innerHTML() {
    return this.textContent;
  }
  set innerHTML(raw) {
    this.textContent = "";
    const tree = parseFragment(String(raw));
    for (const n of tree.childNodes) this.append(convert(n));
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  get firstElementChild() {
    return this.children.find((c) => !c.tagName.startsWith("#")) ?? null;
  }
  get options() {
    return this.querySelectorAll("option");
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n.tagName === "#DOCUMENT";
  }
  append(...nodes) {
    for (let n of nodes) {
      if (!(n instanceof ToolElement)) n = new ToolElement("#text", String(n));
      n.parentNode?.removeChild(n);
      n.parentNode = this;
      this.children.push(n);
    }
  }
  after(n) {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    n.parentNode?.removeChild(n);
    n.parentNode = p;
    p.children.splice(i + 1, 0, n);
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  replaceChildren(...n) {
    this.textContent = "";
    this.append(...n);
  }
  insertBefore(n, b) {
    if (!b) return this.append(n);
    const i = this.children.indexOf(b);
    n.parentNode?.removeChild(n);
    n.parentNode = this;
    this.children.splice(i, 0, n);
  }
  setAttribute(k, v) {
    v = String(v);
    this.attributes.set(k, v);
    if (k === "class") this.className = v;
    if (k === "checked") this.checked = true;
    if (k === "selected") this.selected = true;
    if (k === "hidden") this.hidden = true;
    if (k === "disabled") this.disabled = true;
    if (k.startsWith("data-")) this.dataset[camel(k.slice(5))] = v;
  }
  getAttribute(k) {
    if (k === "class") return this.className || null;
    return this.attributes.get(k) ?? null;
  }
  hasAttribute(k) {
    return this.attributes.has(k);
  }
  removeAttribute(k) {
    this.attributes.delete(k);
    if (k === "disabled") this.disabled = false;
    if (k === "checked") this.checked = false;
    if (k === "hidden") this.hidden = false;
  }
  matches(selector) {
    return selector.split(",").some((s) => {
      const ps = pieces(s.trim());
      if (!ps.length) return false;
      let n = this;
      if (!simple(n, ps.pop())) return false;
      while (ps.length) {
        const sel = ps.pop();
        n = n.parentNode;
        while (n && !simple(n, sel)) n = n.parentNode;
        if (!n) return false;
      }
      return true;
    });
  }
  querySelectorAll(selector) {
    const out = [];
    function visit(n) {
      for (const c of n.children) {
        if (c.matches(selector)) out.push(c);
        visit(c);
      }
    }
    visit(this);
    return out;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }
  contains(n) {
    for (; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  cloneNode(deep = false) {
    const n = new ToolElement(this.tagName, this._text);
    for (const [k, v] of this.attributes) n.setAttribute(k, v);
    n.value = this.value;
    n.checked = this.checked;
    n.selected = this.selected;
    if (deep) for (const c of this.children) n.append(c.cloneNode(true));
    if (this.content) n.content = this.content.cloneNode(true);
    return n;
  }
  addEventListener(name, fn, options) {
    const list = this.listeners.get(name) || [];
    list.push({ fn, capture: options === true || options?.capture === true });
    this.listeners.set(name, list);
  }
  removeEventListener(name, fn) {
    this.listeners.set(
      name,
      (this.listeners.get(name) || []).filter((x) => x.fn !== fn),
    );
  }
  async fire(name, extra = {}) {
    const path = [];
    for (let n = this; n; n = n.parentNode) path.push(n);
    const event = {
      type: name,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      ...extra,
    };
    for (const n of [...path].reverse()) {
      event.currentTarget = n;
      for (const x of n.listeners.get(name) || [])
        if (x.capture) await x.fn(event);
    }
    for (const n of path) {
      event.currentTarget = n;
      for (const x of n.listeners.get(name) || [])
        if (!x.capture) await x.fn(event);
      if (event.stopped) break;
    }
    return event;
  }
  click() {
    if (this.disabled || this.closest("[inert]")) return Promise.resolve();
    return this.fire("click");
  }
  focus() {
    globalThis.document.activeElement = this;
  }
  scrollIntoView() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 500, height: 200 };
  }
  reset() {
    for (const el of this.querySelectorAll("input,textarea,select")) {
      el._valueSet = false;
      el._value = "";
      el.checked = el.attributes.has("checked");
    }
  }
}
function simple(n, s) {
  if (s === "*") return true;
  const not = [...s.matchAll(/:not\(([^()]*)\)/g)];
  for (const m of not) {
    if (simple(n, m[1])) return false;
    s = s.replace(m[0], "");
  }
  if (s.includes(":checked")) {
    if (!n.checked) return false;
    s = s.replace(":checked", "");
  }
  if (s.includes(":empty")) {
    if (n.textContent) return false;
    s = s.replace(":empty", "");
  }
  const tag = /^[A-Za-z][\w-]*/.exec(s)?.[0];
  if (tag && n.tagName !== tag.toUpperCase()) return false;
  const id = /#([\w-]+)/.exec(s)?.[1];
  if (id && n.id !== id) return false;
  for (const m of s.matchAll(/\.([\w-]+)/g))
    if (!n.className.split(" ").includes(m[1])) return false;
  for (const m of s.matchAll(
    /\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g,
  )) {
    const k = m[1],
      value = m[2] ?? m[3] ?? m[4];
    const found = k.startsWith("data-")
      ? n.dataset[camel(k.slice(5))]
      : n.getAttribute(k);
    if (value === undefined ? found == null : found !== value) return false;
  }
  return true;
}
function convert(n) {
  const el = new ToolElement(
    n.tagName || n.nodeName,
    n.nodeName === "#text" ? n.value : "",
  );
  for (const a of n.attrs || []) el.setAttribute(a.name, a.value);
  for (const c of n.childNodes || []) el.append(convert(c));
  if (n.content) el.content = convert(n.content);
  return el;
}
export function installToolDom(html, initial = {}, opts = {}) {
  for (const t of activeTimers) nativeClearTimeout(t);
  activeTimers = new Set();
  const schedule = (fn, ms, ...args) => {
    let t;
    t = nativeSetTimeout(() => {
      activeTimers.delete(t);
      fn(...args);
    }, ms);
    activeTimers.add(t);
    return t;
  };
  const cancel = (t) => {
    activeTimers.delete(t);
    nativeClearTimeout(t);
  };
  const document = convert(parseHtml("<main>" + html + "</main>"));
  document.createElement = (t) => new ToolElement(t);
  document.createTextNode = (t) => new ToolElement("#text", t);
  document.createElementNS = (_n, t) => new ToolElement(t);
  document.getElementById = (id) => document.querySelector("#" + id);
  document.body = document.querySelector("body");
  document.fonts = { ready: Promise.resolve() };
  const values = new Map(
    Object.entries(initial).map(([k, v]) => [
      "charitology." + k,
      typeof v === "string" ? v : JSON.stringify(v),
    ]),
  );
  values.set("unrelated.private.key", "unchanged");
  const operations = [];
  const flags = { failRead: false, failWrite: false, failRemove: false };
  const storage = {
    getItem(k) {
      operations.push(["get", k]);
      if (flags.failRead) throw Error("synthetic read denial");
      return values.get(k) ?? null;
    },
    setItem(k, v) {
      operations.push(["set", k, v]);
      if (flags.failWrite) throw Error("synthetic quota");
      values.set(k, v);
    },
    removeItem(k) {
      operations.push(["remove", k]);
      if (flags.failRemove) throw Error("synthetic remove denial");
      values.delete(k);
    },
  };
  const queues = new Map();
  const locks = {
    request(k, _o, action) {
      const next = (queues.get(k) || Promise.resolve()).then(action);
      queues.set(
        k,
        next.catch(() => {}),
      );
      return next;
    },
  };
  const win = new ToolElement("window");
  win.setTimeout = schedule;
  win.clearTimeout = cancel;
  win.confirm = () => true;
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  win.innerWidth = 1200;
  win.requestAnimationFrame = (f) => setTimeout(f, 0);
  const downloads = [];
  URL.createObjectURL = (b) => {
    downloads.push(b);
    return "blob:synthetic/" + downloads.length;
  };
  URL.revokeObjectURL = () => {};
  Object.assign(globalThis, {
    setTimeout: schedule,
    clearTimeout: cancel,
    document,
    window: win,
    Node: ToolElement,
    HTMLElement: ToolElement,
    HTMLInputElement: ToolElement,
    HTMLSelectElement: ToolElement,
    HTMLButtonElement: ToolElement,
    HTMLFormElement: ToolElement,
    HTMLTextAreaElement: ToolElement,
    localStorage: storage,
    isSecureContext: true,
    confirm: () => true,
    CSS: { escape: (s) => String(s) },
    location: {
      origin: "https://example.invalid",
      pathname: "/tools/fictional/",
      search: "",
      hash: "",
      reload() {},
    },
    history: {
      replaceState(_a, _b, next) {
        globalThis.location.hash = String(next).startsWith("#")
          ? String(next)
          : "";
      },
    },
    requestAnimationFrame: (f) => setTimeout(f, 0),
    getComputedStyle: () => ({
      getPropertyValue: () => "",
      fontFamily: "sans-serif",
    }),
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: opts.unsupported ? undefined : locks,
      clipboard: { writeText: async () => {} },
    },
  });
  const hold = async (key) => {
    let release, entered;
    const gate = new Promise((r) => (release = r)),
      ready = new Promise((r) => (entered = r));
    void locks.request("charitology." + key, {}, async () => {
      entered();
      await gate;
    });
    await ready;
    return release;
  };
  return {
    hold,
    document,
    root: document.querySelector("section.tool"),
    values,
    operations,
    flags,
    storage,
    locks,
    downloads,
    window: win,
    $: (s) => document.querySelector(s),
    set: async (s, v, event = "input") => {
      const el = document.querySelector(s);
      if (typeof v === "boolean") el.checked = v;
      else el.value = v;
      await el.fire(event);
    },
    get: (s) => document.querySelector(s)?.value,
  };
}
export async function settleTools(fn) {
  for (let n = 0; n < 200; n++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Actual tool script did not settle.");
}
