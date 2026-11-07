// Minimal mounted DOM, deliberately not a browser/native Save/permission test.
export function learningTestDOM() {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.handlers = new Map();
      this.disabled = false; this.checked = false; this.hidden = false; this.selected = false; this.isConnected = false; this._value = undefined;
      this.className = "";
      this.classList = { toggle: (name, value) => { const names = new Set(this.className.split(" ").filter(Boolean)); if (value) names.add(name); else names.delete(name); this.className = [...names].join(" "); }, remove() {} };
    }
    set value(value) { this._value = String(value); }
    get value() { return this._value ?? (this.tagName === "SELECT" ? (this.children.find((row) => row.selected) || this.children[0])?.value || "" : ""); }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key === "id") this.id = String(value); if (key === "value") this.value = value; if (key === "class") this.className = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    connect(value) { this.isConnected = value; for (const child of this.children) if (child instanceof Element) child.connect(value); }
    append(...children) { for (const child of children) { this.children.push(child instanceof Element ? child : String(child)); if (child instanceof Element) { child.parentElement = this; child.connect(this.isConnected); } } }
    replaceChildren(...children) { for (const child of this.children) if (child instanceof Element) child.connect(false); this.children = []; this.append(...children); }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) || []).filter((row) => row !== fn)); }
    async emit(type, extra = {}) { const event = { preventDefault() {}, currentTarget: this, ...extra }; for (const fn of this.handlers.get(type) || []) await fn(event); }
    click() { return this.emit("click"); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((row) => row !== this); this.connect(false); }
    focus() { this.focused = true; }
    reportValidity() { return true; }
    get textContent() { return this.children.map((child) => child instanceof Element ? child.textContent : child).join(""); }
    set textContent(value) { this.replaceChildren(String(value)); }
    matches(selector) {
      const attr = selector.match(/^(?:([a-z]+))?\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/i);
      if (attr) return (!attr[1] || this.tagName === attr[1].toUpperCase()) && Object.hasOwn(this.attributes, attr[2]) && (!attr[3] || this.attributes[attr[2]] === attr[3]);
      if (selector.startsWith("#")) return this.id === selector.slice(1);
      if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
      return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) { const selectors = selector.split(",").map((value) => value.trim()); const result = []; const visit = (element) => { for (const child of element.children) if (child instanceof Element) { if (selectors.some((value) => child.matches(value))) result.push(child); visit(child); } }; visit(this); return result; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const body = new Element("body"), head = new Element("head"); body.connect(true); head.connect(true);
  const document = { body, head, createElement: (tag) => new Element(tag), createTextNode: (text) => String(text), querySelector: (selector) => head.querySelector(selector) || body.querySelector(selector) };
  const window = new Element("window");
  const previous = { document: globalThis.document, window: globalThis.window, Node: globalThis.Node };
  globalThis.document = document; globalThis.window = window; globalThis.Node = Element;
  return { document, window, Element, restore() { Object.assign(globalThis, previous); }, mount(view) { body.append(view); return view; } };
}
