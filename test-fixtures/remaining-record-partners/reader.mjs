// A controlled abortable native-reader boundary; not native browser evidence.
import assert from "node:assert/strict";
export function installPartnerReader(d) {
  const packets = new WeakMap(),
    active = new Set();
  d.readers = [];
  d.maxActiveReaders = 0;
  d.nativeFile = (raw, options = {}) => {
    const file = new File([raw], "fictional-partner.json", {
      type: "application/json",
    });
    packets.set(file, { raw, held: !!options.held });
    file.text = file.arrayBuffer = () => {
      throw Error("Unabortable file promise forbidden");
    };
    if (options.size !== undefined)
      Object.defineProperty(file, "size", { value: options.size });
    return file;
  };
  globalThis.FileReader = class {
    result = null;
    error = null;
    onload = null;
    onerror = null;
    onabort = null;
    constructor() {
      this.aborted = false;
      d.readers.push(this);
    }
    readAsArrayBuffer(file) {
      this.packet = packets.get(file);
      assert.ok(this.packet);
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
      active.delete(this);
    }
    load({ late = false } = {}) {
      this.result = new TextEncoder().encode(this.packet.raw).buffer;
      active.delete(this);
      (late ? this.saved.load : this.onload)?.({ target: this });
    }
    fail({ late = false } = {}) {
      active.delete(this);
      (late ? this.saved.error : this.onerror)?.({ target: this });
    }
  };
}
