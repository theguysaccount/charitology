// Controlled DOM/native-reader boundaries. These are not layout/browser proofs.
import assert from "node:assert/strict";
import { installToolDom, ToolElement } from "../donor-recovery/tool-dom.mjs";
const nativeValue = Object.getOwnPropertyDescriptor(
  ToolElement.prototype,
  "value",
);
export function pilotDom(html) {
  Object.defineProperty(ToolElement.prototype, "value", {
    ...nativeValue,
    set(value) {
      let text = String(value);
      if (this.tagName === "INPUT" && this.type === "file") {
        if (text !== "") throw Error("File input value can only be cleared");
        this.files = [];
      }
      if (this.tagName === "TEXTAREA") text = text.replace(/\r\n?/g, "\n");
      if (
        this.tagName === "INPUT" &&
        ["text", "search", "url", "email", "tel", "password"].includes(
          this.type || "text",
        )
      )
        text = text.replace(/[\r\n]/g, "");
      nativeValue.set.call(this, text);
    },
  });
  const d = installToolDom(html);
  d.root = d.$("[data-pilot-guide]");
  const packets = new WeakMap(),
    active = new Set();
  d.readers = [];
  d.maxActiveReaders = 0;
  d.nativeFile = (raw, options = {}) => {
    const bytes =
      typeof raw === "string"
        ? new TextEncoder().encode(raw)
        : new Uint8Array(raw);
    const file = new File([bytes], options.name || "fictional-pilot.json", {
      type: "application/json",
    });
    packets.set(file, {
      bytes,
      held: !!options.held,
      throws: !!options.throws,
    });
    file.text = file.arrayBuffer = () => {
      throw Error("Unabortable file promise forbidden");
    };
    if (options.size !== undefined)
      Object.defineProperty(file, "size", { value: options.size });
    return file;
  };
  globalThis.FileReader = class {
    readyState = 0;
    result = null;
    onload = null;
    onerror = null;
    onabort = null;
    constructor() {
      d.readers.push(this);
      this.aborted = false;
    }
    readAsArrayBuffer(file) {
      this.packet = packets.get(file);
      assert.ok(this.packet);
      if (this.packet.throws) throw Error("Synthetic read start failure");
      this.readyState = 1;
      this.saved = {
        load: this.onload,
        error: this.onerror,
        abort: this.onabort,
      };
      active.add(this);
      d.maxActiveReaders = Math.max(d.maxActiveReaders, active.size);
      if (!this.packet.held)
        queueMicrotask(() => {
          if (!this.aborted) this.load();
        });
    }
    abort() {
      assert.equal(this.onload, null);
      assert.equal(this.onerror, null);
      assert.equal(this.onabort, null);
      this.aborted = true;
      this.readyState = 2;
      active.delete(this);
    }
    load({ late = false } = {}) {
      this.result = this.packet.bytes.slice().buffer;
      this.readyState = 2;
      active.delete(this);
      (late ? this.saved.load : this.onload)?.({ target: this });
    }
    fail({ late = false } = {}) {
      this.readyState = 2;
      active.delete(this);
      (late ? this.saved.error : this.onerror)?.({ target: this });
    }
  };
  const schedule = globalThis.setTimeout,
    cancel = globalThis.clearTimeout,
    timers = new Map();
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = schedule(fn, ms, ...args);
    timers.set(id, { fn, ms, args });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
    cancel(id);
  };
  d.readDeadline = () => {
    const entry = [...timers].find(([, v]) => v.ms === 30_000);
    assert.ok(entry);
    entry[1].fn(...entry[1].args);
  };
  Object.defineProperty(ToolElement.prototype, "href", {
    configurable: true,
    get() {
      return this.getAttribute("href") || "";
    },
    set(v) {
      this.setAttribute("href", v);
    },
  });
  d.field = (id) => d.$('[data-pilot-field="' + id + '"]');
  // Native picker behavior is separate from arbitrary synthetic change events:
  // reopening the same selected path emits cancel, not a new change. An owned
  // empty-value reset clears the FileList, allowing that file to be chosen anew.
  d.openPicker = () => d.$("[data-pilot-file]").click();
  d.finishPicker = async (file) => {
    const input = d.$("[data-pilot-file]"),
      previous = input.files?.[0];
    if (
      !file ||
      (previous &&
        previous.name === file.name &&
        previous.size === file.size &&
        previous.lastModified === file.lastModified)
    ) {
      await input.fire("cancel");
      return false;
    }
    input.files = [file];
    nativeValue.set.call(input, "C:\\fakepath\\" + file.name);
    await input.fire("change");
    await Promise.resolve();
    return true;
  };
  d.pickFile = async (file) => {
    await d.openPicker();
    return d.finishPicker(file);
  };
  d.message = () => d.$("[data-pilot-status]").textContent;
  d.activeReaders = () => active.size;
  d.noExternal = () => {
    assert.equal(d.operations.length, 0, "No browser storage reads/writes");
    assert.equal(d.network.length, 0, "No backend/OS requests");
  };
  d.network = [];
  globalThis.fetch = (...args) => {
    d.network.push(["fetch", ...args]);
    throw Error("Network forbidden");
  };
  globalThis.XMLHttpRequest = class {
    constructor() {
      d.network.push(["xhr"]);
      throw Error("Network forbidden");
    }
  };
  globalThis.WebSocket = class {
    constructor() {
      d.network.push(["websocket"]);
      throw Error("Network forbidden");
    }
  };
  navigator.sendBeacon = (...args) => {
    d.network.push(["beacon", ...args]);
    throw Error("Network forbidden");
  };
  return d;
}
