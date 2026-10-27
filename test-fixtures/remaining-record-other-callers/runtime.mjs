// Actual SSR caller harness, fictional storage/DOM and controlled native reader.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler";
import { installToolDom, ToolElement } from "../donor-recovery/tool-dom.mjs";
import { spin } from "../remaining-record-controls/ui-dom.mjs";
import { setTimeout as pause } from "node:timers/promises";
export async function settle(test, message = "condition") {
  for (let i = 0; i < 200; i++) {
    if (test()) return;
    await pause(5);
  }
  throw Error("Timed out: " + message);
}
export { spin, ToolElement };
ToolElement.prototype.createTBody = function () {
  const el = new ToolElement("tbody");
  this.append(el);
  return el;
};
ToolElement.prototype.createTHead = function () {
  const el = new ToolElement("thead");
  this.append(el);
  return el;
};
ToolElement.prototype.createCaption = function () {
  const el = new ToolElement("caption");
  this.append(el);
  return el;
};
ToolElement.prototype.insertRow = function () {
  const el = new ToolElement("tr");
  this.append(el);
  return el;
};
ToolElement.prototype.insertCell = function () {
  const el = new ToolElement("td");
  this.append(el);
  return el;
};
ToolElement.prototype.validity = { badInput: false };
let serial = 0;
export async function compileCaller(path, temp) {
  const source = await readFile(path, "utf8");
  let ssr = source;
  if (
    path.includes("journal.astro") ||
    path.includes("charitology-100.astro")
  ) {
    const id = path.includes("journal.astro") ? "journal-desk" : "hundred-lab",
      start = source.indexOf(`<section id="${id}">`),
      end = source.indexOf("</section>", start) + 10;
    ssr =
      '---\nimport {url} from "../../lib/site";\n---\n' +
      source.slice(start, end);
  }
  const output = await transform(ssr, {
    filename: path,
    internalURL: "astro/compiler-runtime",
    renderScript: true,
    resolvePath: async (value) => value,
  });
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === 1),
    [],
  );
  const file = join(temp, "ssr-" + serial++ + ".mjs");
  await build({
    stdin: {
      contents: output.code.replace(
        /^import\s+"[^"]+\?astro&type=style[^"]*";$/gm,
        "",
      ),
      loader: "ts",
      resolveDir: dirname(resolve(path)),
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    define: {
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  const component = (await import(pathToFileURL(file))).default;
  const contents = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const script = await build({
    stdin: { contents, loader: "ts", resolveDir: dirname(resolve(path)) },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    define: {
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    logLevel: "silent",
  });
  return {
    source,
    contents,
    component,
    async run() {
      const out = join(temp, "run-" + serial++ + ".mjs");
      await writeFile(out, script.outputFiles[0].text);
      return import(pathToFileURL(out));
    },
  };
}
export function installCaller(html, key, raw, options = {}) {
  const d = installToolDom(html, {}, options);
  if (raw !== undefined) d.values.set(key, raw);
  d.key = key;
  const packets = new WeakMap();
  d.readers = [];
  d.nativeFile = (text, held = false) => {
    const file = new File([text], "fictional-complete-backup.json", {
      type: "application/json",
    });
    packets.set(file, { text, held });
    file.text = () => {
      throw Error("unbounded text forbidden");
    };
    file.arrayBuffer = () => {
      throw Error("unbounded buffer forbidden");
    };
    return file;
  };
  class Reader {
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
      this.late = this.onload;
      if (!this.packet.held)
        queueMicrotask(() => {
          if (!this.aborted) this.finish();
        });
    }
    abort() {
      assert.equal(this.onload, null);
      assert.equal(this.onerror, null);
      assert.equal(this.onabort, null);
      this.aborted = true;
    }
    finish(late = false) {
      this.result = new TextEncoder().encode(this.packet.text).buffer;
      (late ? this.late : this.onload)?.();
    }
  }
  globalThis.FileReader = Reader;
  d.host = () => d.$("[data-rr-recovery]");
  d.action = (name) =>
    d
      .host()
      ?.querySelectorAll("button")
      .find((el) => el.dataset.rrAction === name);
  d.recoveryField = (name) =>
    d
      .host()
      ?.querySelectorAll("input")
      .find((el) => el.dataset[name] === "true");
  d.recoveryResult = () =>
    d
      .host()
      ?.querySelectorAll("p")
      .find((el) => el.dataset.rrResult === "true")?.textContent ?? "";
  d.choose = async (file) => {
    const el = d.recoveryField("rrFile");
    el.files = file ? [file] : [];
    await el.fire("change");
  };
  d.holdExact = async () => {
    let entered, release;
    const gate = new Promise((r) => (release = r)),
      ready = new Promise((r) => (entered = r));
    void d.locks.request(key, {}, async () => {
      entered();
      await gate;
    });
    await ready;
    return release;
  };
  d.saved = () => JSON.parse(d.values.get(key));
  return d;
}

// Deterministic value-boundary simulation; actual Chrome remains separate.
export async function simulatedNativeStrings(run) {
  const own = Object.getOwnPropertyDescriptor(ToolElement.prototype, "value");
  Object.defineProperty(ToolElement.prototype, "value", {
    ...own,
    set(value) {
      let text = String(value);
      if (this.tagName === "TEXTAREA") text = text.replace(/\r\n?/g, "\n");
      if (
        this.tagName === "INPUT" &&
        ["", "text", "search", "url", "email"].includes(this.type)
      )
        text = text.replace(/[\r\n]/g, "");
      own.set.call(this, text);
    },
  });
  try {
    return await run();
  } finally {
    Object.defineProperty(ToolElement.prototype, "value", own);
  }
}
