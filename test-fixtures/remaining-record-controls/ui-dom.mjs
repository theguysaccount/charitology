// Controlled native FileReader boundary and fictional DOM, never browser proof.
import assert from "node:assert/strict";
import { installProgramRecordDom } from "../program-record-recovery/ui-dom.mjs";
import {
  setImmediate as nextTurn,
  setTimeout as nativePause,
} from "node:timers/promises";
import { performance } from "node:perf_hooks";
export async function spin() {
  await Promise.resolve();
  await nextTurn();
}
export async function settle(test, message = "condition") {
  // Native Web Crypto completes on a worker thread. A fixed number of immediate
  // turns can finish before that worker is scheduled on a busy CI runner.
  // Retain the actual condition and a bounded deadline, yielding real time.
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    if (test()) return;
    await spin();
    await nativePause(1);
  }
  throw Error("Timed out: " + message);
}
export function installRemainingDom(initial = {}, options = {}) {
  const d = installProgramRecordDom(initial);
  d.action = (name) =>
    d.host
      .querySelectorAll("button")
      .find((el) => el.dataset.rrAction === name);
  d.field = (name) =>
    d.host.querySelectorAll("input").find((el) => el.dataset[name] === "true");
  d.say = () =>
    d.host.querySelectorAll("p").find((el) => el.dataset.rrResult === "true")
      ?.textContent ?? "";
  d.state = () =>
    d.host.querySelectorAll("p").find((el) => el.dataset.rrStatus === "true")
      ?.textContent ?? "";
  d.previewText = () =>
    d.host.querySelectorAll("p").find((el) => el.dataset.rrPreview === "true")
      ?.textContent ?? "";
  const packets = new WeakMap(),
    active = new Set();
  d.readers = [];
  d.maxActive = 0;
  d.file = (raw, { held = false, size } = {}) => {
    const file = new File([raw], "fictional-local-native.json", {
      type: "application/json",
    });
    packets.set(file, { raw, held });
    // Ensure production never falls back to either unabortable promise method.
    file.text = () => {
      throw Error("File.text forbidden");
    };
    file.arrayBuffer = () => {
      throw Error("File.arrayBuffer forbidden");
    };
    if (size !== undefined)
      Object.defineProperty(file, "size", { value: size });
    return file;
  };
  class ControlledFileReader {
    result = null;
    error = null;
    onload = null;
    onerror = null;
    onabort = null;
    constructor() {
      d.readers.push(this);
      this.aborted = false;
      this.packet = null;
      this.saved = {};
    }
    readAsArrayBuffer(file) {
      const packet = packets.get(file);
      assert.ok(packet, "only declared fictional file accepted");
      this.packet = packet;
      this.saved = {
        load: this.onload,
        error: this.onerror,
        abort: this.onabort,
      };
      active.add(this);
      d.maxActive = Math.max(d.maxActive, active.size);
      if (!packet.held)
        queueMicrotask(() => {
          if (!this.aborted) this.load();
        });
    }
    abort() {
      assert.equal(this.onload, null, "load detached before native abort");
      assert.equal(this.onerror, null, "error detached before native abort");
      assert.equal(this.onabort, null, "abort detached before native abort");
      this.aborted = true;
      active.delete(this);
    }
    load({ late = false, bytes } = {}) {
      this.result = bytes ?? new TextEncoder().encode(this.packet.raw).buffer;
      active.delete(this);
      (late ? this.saved.load : this.onload)?.({ target: this });
    }
    fail({ late = false } = {}) {
      active.delete(this);
      (late ? this.saved.error : this.onerror)?.({ target: this });
    }
    emitAbort({ late = false } = {}) {
      active.delete(this);
      (late ? this.saved.abort : this.onabort)?.({ target: this });
    }
  }
  globalThis.FileReader = options.noReader ? undefined : ControlledFileReader;
  d.activeReaders = () => active.size;
  const request = d.locks.request.bind(d.locks);
  d.hold = async (name) => {
    let ready, release;
    const started = new Promise((resolve) => {
      ready = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    void request(name, { mode: "exclusive" }, async () => {
      ready();
      await gate;
    });
    await started;
    return release;
  };
  d.lockDepth = 0;
  d.locks.request = (name, settings, run) =>
    request(name, settings, async () => {
      d.lockDepth++;
      try {
        if (d.rejectGate) {
          const gate = d.rejectGate;
          d.rejectGate = null;
          gate.started();
          await gate.wait;
          throw Error("Synthetic rejected native lock");
        }
        return await run();
      } finally {
        d.lockDepth--;
      }
    });
  return d;
}
export function fakeClock() {
  const oldSet = globalThis.setTimeout,
    oldClear = globalThis.clearTimeout;
  let now = 0,
    id = 0;
  const tasks = new Map();
  let maxDebounce = 0;
  globalThis.setTimeout = (run, ms = 0, ...args) => {
    const n = ++id;
    tasks.set(n, { at: now + ms, ms, run: () => run(...args) });
    maxDebounce = Math.max(
      maxDebounce,
      [...tasks.values()].filter((t) => t.ms === 250).length,
    );
    return n;
  };
  globalThis.clearTimeout = (n) => tasks.delete(n);
  return {
    tasks,
    maxDebounce: () => maxDebounce,
    count: (ms) => [...tasks.values()].filter((t) => t.ms === ms).length,
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...tasks]
          .filter(([, v]) => v.at <= until)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        now = due[1].at;
        tasks.delete(due[0]);
        due[1].run();
        await spin();
      }
      now = until;
      await spin();
    },
    restore() {
      globalThis.setTimeout = oldSet;
      globalThis.clearTimeout = oldClear;
      tasks.clear();
    },
  };
}
