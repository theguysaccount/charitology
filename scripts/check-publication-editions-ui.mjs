// Real mounted private controller; synthetic DOM is not layout/browser proof.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  Element,
  installArtifactDom,
  settleArtifactUi,
} from "../test-fixtures/artifact-results/ui-dom.mjs";
import {
  fixture,
  at,
  context,
  command,
} from "../test-fixtures/publication-editions/proposal-factory.mjs";
import { strict } from "../test-fixtures/publication-editions/proposal-harness.mjs";
const result = await build({
    stdin: {
      contents:
        "export * from './src/lib/client/publication-editions-ui.ts';export * from './src/lib/client/publication-editions-model.ts';",
      resolveDir: process.cwd(),
    },
    platform: "node",
    format: "esm",
    bundle: true,
    write: false,
    logLevel: "silent",
  }),
  dir = await mkdtemp(join(tmpdir(), "charitology-proposal-ui-")),
  file = join(dir, "ui.mjs");
await writeFile(file, result.outputFiles[0].text);
process.on("exit", () => {
  void rm(dir, { recursive: true, force: true });
});
const m = await import(pathToFileURL(file));
const f = fixture(m),
  key = "charitology.publication-editions.v1";
let groups = 0;
Element.prototype.replaceChildren = function (...children) {
  this.textContent = "";
  this.append(...children);
};
Element.prototype.removeEventListener = function (name, listener) {
  this.listeners.set(
    name,
    (this.listeners.get(name) || []).filter((f) => f !== listener),
  );
};
const check = async (name, fn) => {
  try {
    await fn();
    groups++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
};
function dom(saved = null, options = {}) {
  const d = installArtifactDom(null, options);
  d.root.querySelector(".artifact-results-mount").className =
    "publication-proposal-mount";
  const script = d.root.querySelector(".artifact-results-catalog");
  script.className = "publication-proposal-catalog";
  script.textContent = JSON.stringify(f.catalog);
  if (saved !== null)
    d.values.set(
      key,
      typeof saved === "string"
        ? saved
        : m.canonicalPublicationProposalJson(saved),
    );
  globalThis.location = {
    href: "https://charitology.org/record/editions/",
    origin: "https://charitology.org",
  };
  d.calls = [];
  globalThis.fetch = async (url, opts) => {
    d.calls.push({ url, opts });
    return new Response(f.bundle, {
      headers: { "Content-Type": "application/json" },
    });
  };
  return d;
}
const settle = () =>
  settleArtifactUi(
    () =>
      globalThis.document.querySelector(".pp-status")?.textContent !==
      "Working…",
  );
async function click(d, label) {
  const b = d.findButton(label);
  assert.ok(b, "Button " + label);
  assert.equal(b.disabled, false, "Enabled " + label);
  await b.click();
  await settle();
}
async function set(d, label, value, event = "input") {
  const f = d.field(label);
  assert.ok(f, "Field " + label);
  if (typeof value === "boolean") f.checked = value;
  else f.value = value;
  await f.fire(event);
}
async function fileChoice(d, text, name = "fictional.json") {
  const input = d.field("Choose a full proposal backup JSON"),
    bytes = new TextEncoder().encode(text);
  input.files = [
    { name, size: bytes.length, arrayBuffer: async () => bytes.buffer },
  ];
  await input.fire("change");
  await settle();
}
const basisAff =
  "I reviewed this complete public basis and its source scope. Retain this exact copy locally.";
const freezeAff =
  "I reviewed this exact local proposal and selected public basis. Freezing does not publish or establish independent review.";
async function capture(d) {
  await click(d, "Sources");
  await set(d, "Offered fixed public edition", f.edition.core.id, "change");
  await click(d, "Fetch selected public basis for review");
  await set(d, basisAff, true, "change");
  await click(d, "Retain reviewed public basis");
}
async function write(d) {
  await click(d, "Proposals");
  await click(d, "Begin new proposal");
  await set(d, "Proposal title", "Fictional local proposal");
  await set(d, "Proposal summary", "Draft software check.");
  await click(d, "Add paragraph");
  await set(d, "Block 1 text", "Fictional text, not research results.");
}
const saved = (d) => JSON.parse(d.values.get(key));
async function downloadText(d, label) {
  const n = d.downloads.length;
  await click(d, label);
  assert.equal(d.downloads.length, n + 1);
  return d.downloads.at(-1).blob.text();
}
await check(
  "actual UI/model/store strict TypeScript and inert Astro serialization",
  async () => {
    await strict(["src/lib/client/publication-editions-ui.ts"]);
    const text = await readFile(
      "src/components/PublicationProposal.astro",
      "utf8",
    );
    const expression = /const serialized = ([^\n]+);/.exec(text)?.[1];
    assert.ok(expression, "Component serializer expression exists");
    const { runInNewContext } = await import("node:vm");
    const sentinel = { text: "</script><svg>\u2028" };
    const serialized = runInNewContext(expression, { fixedCatalog: sentinel });
    assert.equal(serialized.includes("<"), false);
    assert.deepEqual(JSON.parse(serialized), sentinel);
    const { transform } = await import("@astrojs/compiler");
    await transform(text, { filename: "PublicationProposal.astro" });
  },
);
await check(
  "mount is private/new-key only and never fetches automatically",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    assert.equal(d.calls.length, 0);
    assert.ok(d.reads.every((k) => k === key));
    assert.equal(d.values.has(key), false);
    assert.ok(d.root.textContent.includes("0 local proposals"));
  },
);
await check(
  "explicit known same-origin selected fetch and acknowledgement before capture",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await click(d, "Sources");
    await set(d, "Offered fixed public edition", f.edition.core.id, "change");
    await click(d, "Fetch selected public basis for review");
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].opts.credentials, "omit");
    await click(d, "Retain reviewed public basis");
    assert.equal(d.values.has(key), false);
    await set(d, basisAff, true, "change");
    await click(d, "Retain reviewed public basis");
    assert.equal(saved(d).bases.length, 1);
  },
);
await check(
  "visual blocks freeze only with fresh form acknowledgement; preview remains draft",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(d, freezeAff, true, "change");
    await set(d, "Proposal title", "Newer fictional title");
    assert.equal(d.field(freezeAff).checked, false);
    /* Fresh review is visibly unchecked without rerendering the text editor. */ await click(
      d,
      "Freeze reviewed local proposal",
    );
    assert.equal(saved(d).versions.length, 0);
    await set(d, freezeAff, true, "change");
    await click(d, "Freeze reviewed local proposal");
    assert.equal(saved(d).versions.length, 1);
    assert.equal(saved(d).versions[0].title, "Newer fictional title");
    assert.ok(
      d.root.textContent.includes("not published or independently reviewed"),
    );
  },
);
await check(
  "full backup includes open raw work without silently saving it",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(
      d,
      "Proposed publication day (optional YYYY-MM-DD)",
      "unfinished-day",
    );
    const old = d.values.get(key),
      raw = await downloadText(
        d,
        "Download full private backup with open form",
      );
    assert.equal(d.values.get(key), old);
    const state = await m.parsePublicationProposalBackup(raw, f.catalog);
    assert.equal(
      state.draft.form.fields.declaredPublicationDate,
      "unfinished-day",
    );
    assert.ok(d.root.textContent.includes("Saved bytes were not changed"));
  },
);
await check(
  "no-op freeze retains unfinished reason and beforeunload warning",
  async () => {
    const d = dom();
    const { store } = await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(d, freezeAff, true, "change");
    await click(d, "Freeze reviewed local proposal");
    const title = saved(d).versions[0].title;
    await click(d, "Proposals");
    await click(d, "Amend " + title);
    await set(
      d,
      "Amendment reason (required for a new version)",
      "Reason alone is unfinished work",
    );
    await set(d, freezeAff, true, "change");
    const old = d.values.get(key);
    await click(d, "Freeze reviewed local proposal");
    assert.equal(d.values.get(key), old);
    assert.equal(
      d.field("Amendment reason (required for a new version)").value,
      "Reason alone is unfinished work",
    );
    let prevented = false;
    await d.window.fire("beforeunload", {
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
    assert.equal(store.snapshot().state.versions.length, 1);
  },
);
await check(
  "quota candidate is valid/exportable and copy never says saved",
  async () => {
    const d = dom(null, { failWrite: true });
    await m.mountPublicationProposal(d.root);
    await capture(d);
    assert.ok(d.root.textContent.includes("only in memory"));
    assert.equal(d.values.has(key), false);
    const raw = await downloadText(
      d,
      "Download full private backup with open form",
    );
    assert.equal(
      (await m.parsePublicationProposalBackup(raw, f.catalog)).bases.length,
      1,
    );
  },
);
await check(
  "protected corrupt A and observed foreign B get separate raw recovery copies",
  async () => {
    const d = dom("CORRUPT A");
    const { store } = await m.mountPublicationProposal(d.root);
    assert.ok(d.root.textContent.includes("no blank workspace"));
    d.values.set(key, "CORRUPT B");
    await click(d, "Recovery");
    await click(d, "Review clearing this proposal desk");
    assert.equal(store.rawSavedCopy(), "CORRUPT A");
    assert.equal(store.snapshot().observedRaw, "CORRUPT B");
    assert.equal(
      await downloadText(d, "Download protected original saved text"),
      "CORRUPT A",
    );
    assert.equal(
      await downloadText(d, "Download latest observed saved text"),
      "CORRUPT B",
    );
  },
);
await check(
  "valid recovery A then invalid B revokes old Apply/Clear authority",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    const backup = await downloadText(
      d,
      "Download full private backup with open form",
    );
    await click(d, "Recovery");
    await fileChoice(d, backup);
    assert.ok(d.findButton("Apply reviewed backup replacement"));
    await fileChoice(d, "invalid B");
    assert.equal(d.findButton("Apply reviewed backup replacement"), undefined);
    await click(d, "Review clearing this proposal desk");
    assert.ok(d.findButton("Apply reviewed clear of this desk"));
    await fileChoice(d, "invalid C");
    assert.equal(d.findButton("Apply reviewed clear of this desk"), undefined);
    assert.equal(saved(d).bases.length, 1);
  },
);
await check(
  "tab-only form discard is explicit and save-empty uses ordinary draft command",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await click(d, "Save unfinished form locally");
    assert.ok(saved(d).draft.form);
    await click(d, "Discard unfinished form in this tab");
    await click(d, "Confirm tab-only form discard");
    assert.ok(saved(d).draft.form);
    assert.ok(d.root.textContent.includes("saved copy is unchanged"));
    await click(d, "Save unfinished form locally");
    assert.equal(saved(d).draft.form, null);
    assert.equal(saved(d).bases.length, 1);
  },
);
await check(
  "malformed raw structured fields render repair controls without coercing or losing them",
  async () => {
    const s = m.blankPublicationProposals("repair-test", at),
      bad = structuredClone(s);
    bad.draft = {
      tab: "proposals",
      proposalId: null,
      dirty: true,
      form: {
        kind: "proposal",
        targetId: null,
        binding: {},
        fields: {
          blocks: '[{"kind":"paragraph","text":{"bad":1}}]',
          basisPins: "[]",
          selectedMembers: "[]",
          title: "Retained invalid form",
        },
      },
    };
    const d = dom(bad);
    await m.mountPublicationProposal(d.root);
    assert.equal(
      d.field("Raw authored blocks repair").value,
      bad.draft.form.fields.blocks,
    );
    const raw = await downloadText(d, "Download unfinished form recovery text");
    assert.ok(raw.includes("bad"));
  },
);
await check(
  "selected packet notes default off and unrelated raw work omitted",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(
      d,
      "Private operator notes (excluded from selected packets by default)",
      "PRIVATE NOTE",
    );
    await set(d, freezeAff, true, "change");
    await click(d, "Freeze reviewed local proposal");
    assert.equal(
      d.field(
        "Include this version’s private operator notes in its selected packet",
      ).checked,
      false,
    );
    const packet = await downloadText(d, "Download selected proposal JSON");
    assert.ok(!packet.includes("PRIVATE NOTE"));
    assert.ok(packet.includes(f.source.rawUtf8));
  },
);
await check(
  "external storage change preserves newer DOM and blocks save",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(d, "Proposal title", "NEWER OPEN WORK");
    d.values.set(key, "FOREIGN");
    await d.window.fire("storage", { key });
    assert.equal(d.field("Proposal title").value, "NEWER OPEN WORK");
    assert.equal(d.findButton("Save unfinished form locally").disabled, true);
    const raw = await downloadText(d, "Download unfinished form recovery text");
    assert.ok(raw.includes("NEWER OPEN WORK"));
    assert.equal(d.values.get(key), "FOREIGN");
  },
);

await check(
  "delayed public basis response cannot authorize a newer choice/form",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await click(d, "Sources");
    await set(d, "Offered fixed public edition", f.edition.core.id, "change");
    let release;
    globalThis.fetch = async () => {
      await new Promise((r) => (release = r));
      return new Response(f.bundle);
    };
    const pending = d
      .findButton("Fetch selected public basis for review")
      .click();
    await new Promise((r) => setTimeout(r, 0));
    await set(d, "Offered fixed public edition", "", "change");
    release();
    await pending;
    await settle();
    assert.equal(d.field(basisAff), undefined);
    assert.equal(d.values.has(key), false);
  },
);
await check(
  "tampered/oversized basis bytes and same-origin violations do not capture",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await click(d, "Sources");
    await set(d, "Offered fixed public edition", f.edition.core.id, "change");
    globalThis.fetch = async () => new Response(f.bundle + " ");
    await click(d, "Fetch selected public basis for review");
    assert.equal(d.field(basisAff), undefined);
    assert.equal(d.values.has(key), false);
    await assert.rejects(async () =>
      m.readPublicationBasis(
        { ...f.catalog.basisOffers[0], href: "https://example.invalid/remote" },
        f.catalog,
        globalThis.fetch,
      ),
    );
    await assert.rejects(async () =>
      m.readPublicationBasis(
        { ...f.catalog.basisOffers[0], byteLength: 2_097_153 },
        f.catalog,
        globalThis.fetch,
      ),
    );
  },
);
await check(
  "saving/freezing newer text never silently reopens older saved raw form",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await click(d, "Save unfinished form locally");
    await set(d, "Proposal title", "NEWER SUBMITTED TITLE");
    await set(d, freezeAff, true, "change");
    await click(d, "Freeze reviewed local proposal");
    assert.equal(saved(d).versions[0].title, "NEWER SUBMITTED TITLE");
    assert.equal(saved(d).draft.form.fields.title, "Fictional local proposal");
    assert.equal(d.field("Proposal title").value, "NEWER SUBMITTED TITLE");
    assert.ok(
      d.root.textContent.includes("older saved unfinished form remains"),
    );
  },
);
await check(
  "reload refuses corrupt replacement without saying validated or dropping current form",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(d, "Proposal title", "KEEP OPEN WORK");
    d.values.set(key, "CORRUPT FOREIGN");
    await click(d, "Review reload of saved copy");
    await click(d, "Confirm reload and discard this tab’s unsaved work");
    assert.equal(d.field("Proposal title").value, "KEEP OPEN WORK");
    assert.ok(
      !d.root
        .querySelector(".pp-status")
        .textContent.includes("validated and loaded"),
    );
    assert.equal(d.values.get(key), "CORRUPT FOREIGN");
  },
);
await check(
  "restored raw strings remain text sinks, never executable markup",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    await capture(d);
    await write(d);
    await set(d, "Proposal title", "<img src=x onerror=alert(1)>");
    await set(d, "Block 1 text", "<script>not executable</script>");
    await set(d, freezeAff, true, "change");
    await click(d, "Freeze reviewed local proposal");
    assert.ok(d.root.textContent.includes("<script>not executable</script>"));
    assert.equal(d.root.querySelectorAll("img").length, 0);
    assert.equal(d.root.querySelectorAll("script").length, 1);
  },
);

await check(
  "forged same-origin offer and accessor are refused before any fetch; queued mutations cannot retarget",
  async () => {
    const d = dom();
    await m.mountPublicationProposal(d.root);
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return new Response(f.bundle);
    };
    await assert.rejects(async () =>
      m.readPublicationBasis(
        { ...f.catalog.basisOffers[0], href: "/other-path" },
        f.catalog,
        fetcher,
      ),
    );
    assert.equal(calls, 0);
    let getterReads = 0;
    const accessor = { ...f.catalog.basisOffers[0] };
    Object.defineProperty(accessor, "href", {
      get() {
        getterReads++;
        return "/other-path";
      },
      enumerable: true,
    });
    await assert.rejects(async () =>
      m.readPublicationBasis(accessor, f.catalog, fetcher),
    );
    assert.equal(getterReads, 0);
    assert.equal(calls, 0);
    let release, started;
    const entered = new Promise((r) => (started = r)),
      offer = structuredClone(f.catalog.basisOffers[0]),
      catalog = structuredClone(f.catalog);
    const pending = m.readPublicationBasis(offer, catalog, async (url) => {
      calls++;
      assert.equal(
        url,
        "https://charitology.org" + f.catalog.basisOffers[0].href,
      );
      started();
      await new Promise((r) => (release = r));
      return new Response(f.bundle);
    });
    await entered;
    offer.href = "/retarget";
    catalog.basisOffers[0].sha256 = "f".repeat(64);
    release();
    await assert.rejects(async () => pending);
    assert.equal(calls, 1);
  },
);
console.log(`${groups} publication proposal UI groups passed.`);
