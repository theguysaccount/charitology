// Bounded DOM fixture for the actual controller. It does not simulate a browser
// layout or replace the separately required browser acceptance journey.
export class Element {
  constructor(tag = "#text", text = "") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this._text = text;
    this._value = "";
    this.disabled = false;
    this.checked = false;
    this.files = null;
    this.className = "";
    this.classList = {
      toggle: (name, enabled) => {
        const values = new Set(this.className.split(" ").filter(Boolean));
        enabled ? values.add(name) : values.delete(name);
        this.className = [...values].join(" ");
      },
    };
  }
  append(...children) {
    for (let child of children) {
      if (!(child instanceof Element))
        child = new Element("#text", String(child));
      child.parentNode = this;
      this.children.push(child);
    }
  }
  get firstChild() {
    return this.children[0] || null;
  }
  removeChild(child) {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = null;
    return child;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node.tagName === "#DOCUMENT";
  }
  set textContent(value) {
    this.children.forEach((child) => (child.parentNode = null));
    this.children = [];
    this._text = String(value);
  }
  get textContent() {
    return (
      this._text + this.children.map((child) => child.textContent).join("")
    );
  }
  get value() {
    if (this._valueSet) return this._value;
    if (this.tagName === "SELECT") {
      const options = this.children.filter(
        (child) => child.tagName === "OPTION",
      );
      return (
        this._value ||
        options.find((option) => option.attributes.has("selected"))?.value ||
        options[0]?.value ||
        ""
      );
    }
    return this._value || (this.tagName === "TEXTAREA" ? this.textContent : "");
  }
  set value(value) {
    this._value = String(value);
    this._valueSet = true;
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key === "disabled") this.disabled = true;
    if (key === "checked") this.checked = true;
    if (key === "value") this.value = value;
    if (key === "class") this.className = value;
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  addEventListener(name, listener) {
    const list = this.listeners.get(name) || [];
    list.push(listener);
    this.listeners.set(name, list);
  }
  async fire(name, extra = {}) {
    const event = {
      type: name,
      target: this,
      currentTarget: this,
      preventDefault() {},
      ...extra,
    };
    for (const listener of this.listeners.get(name) || [])
      await listener(event);
  }
  click() {
    if (!this.disabled) return this.fire("click");
  }
  focus() {
    globalThis.document.activeElement = this;
  }
  scrollIntoView() {}
  get dataset() {
    return (this._dataset ||= {});
  }
  matches(selector) {
    if (selector.startsWith("#"))
      return this.getAttribute("id") === selector.slice(1);
    if (selector.startsWith("."))
      return this.className.split(" ").includes(selector.slice(1));
    const [tag, className] = selector.split(".");
    return (
      this.tagName === tag.toUpperCase() &&
      (!className || this.className.split(" ").includes(className))
    );
  }
  querySelectorAll(selector) {
    const selectors = selector.split(",").map((value) => value.trim());
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.some((part) => child.matches(part))) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

export function installStudyDom(
  saved = null,
  { locks = true, failWrite = false } = {},
) {
  const document = new Element("#document");
  document.createElement = (tag) => new Element(tag);
  document.body = new Element("body");
  document.append(document.body);
  const root = new Element("section");
  root.dataset.view = "review";
  root.dataset.base = "/example";
  const mount = new Element("div");
  mount.className = "study-register-mount";
  const script = new Element("script");
  script.className = "study-register-catalog";
  script.textContent = "[]";
  root.append(mount, script);
  document.body.append(root);
  const values = new Map(
    saved === null ? [] : [["charitology.study-register.v1", saved]],
  );
  let pending = Promise.resolve();
  const fakeLocks = {
    request: (_name, _options, action) => {
      const next = pending.then(action);
      pending = next.catch(() => {});
      return next;
    },
  };
  const window = new Element("window");
  Object.assign(globalThis, {
    document,
    Node: Element,
    HTMLElement: Element,
    window,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrite) throw Error("Synthetic quota failure");
        values.set(key, value);
      },
      removeItem: (key) => {
        if (failWrite) throw Error("Synthetic removal failure");
        values.delete(key);
      },
    },
    isSecureContext: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks: locks ? fakeLocks : undefined },
  });
  return {
    root,
    values,
    window,
    document,
    findButton: (text) =>
      root
        .querySelectorAll("button")
        .find((element) => element.textContent === text),
    field: (label) =>
      root
        .querySelectorAll("input,select,textarea")
        .find((element) => element.getAttribute("aria-label") === label),
    form: () => root.querySelector("form"),
  };
}

export async function settleStudyUi(predicate) {
  for (let n = 0; n < 150; n++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Mounted UI did not reach the expected state.");
}
