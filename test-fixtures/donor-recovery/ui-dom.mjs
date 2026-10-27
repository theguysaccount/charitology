// Synthetic DOM/storage for actual D1 controllers; no browser/layout claims.
import {
  Element,
  installArtifactDom,
  settleArtifactUi,
} from "../artifact-results/ui-dom.mjs";
export { Element, settleArtifactUi as settle };
Element.prototype.removeEventListener = function (type, listener) {
  this.listeners.set(
    type,
    (this.listeners.get(type) || []).filter((fn) => fn !== listener),
  );
};
Element.prototype.contains = function (target) {
  for (let node = target; node; node = node.parentNode)
    if (node === this) return true;
  return false;
};
Element.prototype.insertBefore = function (node, before) {
  if (!before) return this.append(node);
  const index = this.children.indexOf(before);
  if (index < 0) throw Error("Synthetic insert target absent");
  node.parentNode?.removeChild(node);
  node.parentNode = this;
  this.children.splice(index, 0, node);
};
export function installD1Dom(initial = {}) {
  const dom = installArtifactDom();
  dom.document.createTextNode = (text) => new Element("#text", text);
  dom.root.textContent = "";
  dom.editor = new Element("form");
  dom.editor.inert = false;
  dom.host = new Element("div");
  dom.root.append(dom.editor, dom.host);
  for (const [key, value] of Object.entries(initial))
    dom.values.set(
      `charitology.${key}`,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  dom.values.set("unrelated.private.key", "unchanged");
  dom.behavior = { failRead: false, failWrite: false, failRemove: false };
  dom.operations = [];
  dom.lockNames = [];
  const queues = new Map();
  dom.locks = {
    request(name, options, action) {
      dom.lockNames.push(name);
      const prior = queues.get(name) || Promise.resolve(),
        next = prior.then(action);
      queues.set(
        name,
        next.catch(() => {}),
      );
      return next;
    },
  };
  dom.hold = async (name) => {
    let ready, release;
    const started = new Promise((resolve) => {
      ready = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    void dom.locks.request(name, {}, async () => {
      ready();
      await gate;
    });
    await started;
    return release;
  };
  dom.storage = {
    getItem(key) {
      dom.operations.push(["get", key]);
      if (dom.behavior.failRead) throw Error("Synthetic denied read");
      return dom.values.get(key) ?? null;
    },
    setItem(key, raw) {
      dom.operations.push(["set", key, raw]);
      if (dom.behavior.failWrite) throw Error("Synthetic quota");
      dom.values.set(key, raw);
    },
    removeItem(key) {
      dom.operations.push(["remove", key]);
      if (dom.behavior.failRemove) throw Error("Synthetic removal denial");
      dom.values.delete(key);
    },
  };
  globalThis.localStorage = dom.storage;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks: dom.locks },
  });
  dom.reloads = 0;
  globalThis.location = {
    reload() {
      dom.reloads++;
    },
  };
  dom.action = (id) =>
    dom.host
      .querySelectorAll("button")
      .find((button) => button.dataset.d1Action === id);
  dom.field = (name) =>
    dom.host
      .querySelectorAll("input,select")
      .find((field) => field.dataset[name] === "true");
  dom.fileInput = () =>
    dom.host.querySelectorAll("input").find((field) => field.type === "file");
  dom.say = () =>
    dom.host.querySelectorAll("p").find((p) => p.dataset.d1Result === "true")
      ?.textContent || "";
  dom.choose = async (file) => {
    const input = dom.fileInput();
    input.files = file ? [file] : [];
    await input.fire("change");
  };
  return dom;
}
export function fileOf(raw) {
  return new File([raw], "fictional-donor-backup.json", {
    type: "application/json",
  });
}
export function delayedFile(raw) {
  const file = fileOf(raw);
  let finish;
  const ready = new Promise((resolve) => {
    finish = resolve;
  });
  file.arrayBuffer = () => ready;
  return {
    file,
    finish() {
      finish(new TextEncoder().encode(raw).buffer);
    },
  };
}
