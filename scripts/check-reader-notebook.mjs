// Actual Astro markup and inline script with fictional storage/DOM.
// This checks recoverability and persistence, not native browser downloads.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { compileCaller } from "../test-fixtures/remaining-record-other-callers/runtime.mjs";
import { installToolDom } from "../test-fixtures/donor-recovery/tool-dom.mjs";

const temp = await mkdtemp(join(resolve("node_modules"), ".reader-notebook-"));
const key = "charitology-reading-fictional-chapter";
const original = { read: true, notes: "  Fictional notes\nQuestions and objections 😀  " };
let groups = 0;
const check = async (name, run) => {
  await run();
  groups++;
  console.log("✓ " + name);
};
try {
  const caller = await compileCaller("src/components/ReaderNotebook.astro", temp);
  const container = await AstroContainer.create();
  const html = await container.renderToString(caller.component, {
    props: { id: "fictional-chapter", title: "Fictional chapter" },
  });
  async function mount(raw = JSON.stringify(original), options = {}) {
    const d = installToolDom(html);
    d.values.set(key, raw);
    d.flags.failRead = Boolean(options.failRead);
    await caller.run();
    const notes = d.$("[data-notes]"), read = d.$("[data-read]");
    const clear = d.$("[data-clear]"), status = d.$("[data-status]");
    assert.ok(notes && read && clear && status, "Actual component controls mount");
    return { ...d, notes, read, clear, status };
  }
  async function exported(d) {
    const before = d.downloads.length;
    const writes = d.operations.filter(([op]) => op !== "get").length;
    await d.$("[data-export]").click();
    assert.equal(d.downloads.length, before + 1);
    assert.equal(d.operations.filter(([op]) => op !== "get").length, writes);
    return d.downloads.at(-1).text();
  }
  function preserved(d, raw, notes, read) {
    assert.equal(d.values.get(key), raw);
    assert.equal(d.notes.value, notes);
    assert.equal(d.read.checked, read);
    assert.equal(d.values.get("unrelated.private.key"), "unchanged");
    assert.ok(d.operations.every(([, changedKey]) => changedKey === key));
  }
  async function confirmClear(d) {
    const before = d.operations.length;
    await d.clear.click();
    assert.equal(d.clear.textContent, "Confirm clear notes");
    assert.equal(d.operations.length, before, "Arming is not a storage operation");
    await d.clear.click();
    assert.equal(d.clear.textContent, "Clear this chapter’s notes");
  }

  await check("quota refusal preserves current notes/read flag, old storage and downloadable text", async () => {
    const d = await mount(), raw = d.values.get(key);
    d.flags.failWrite = true;
    await confirmClear(d);
    preserved(d, raw, original.notes, true);
    assert.match(d.status.textContent, /not cleared/i);
    assert.match(d.status.textContent, /Download/);
    const text = await exported(d);
    assert.ok(text.includes(original.notes));
    assert.ok(text.includes("Read: Yes"));
    d.flags.failWrite = false;
    await d.clear.click();
    preserved(d, raw, original.notes, true);
    await d.clear.click();
    assert.equal(d.notes.value, "");
    assert.deepEqual(JSON.parse(d.values.get(key)), { read: true, notes: "" });
  });

  await check("another tab's version survives refused clear while newer unsaved draft remains exportable", async () => {
    const d = await mount();
    const other = JSON.stringify({ read: false, notes: "Other tab's fictional revision" });
    d.values.set(key, other);
    d.notes.value = "  Newer unsaved questions\nLiteral text 😀 ";
    await d.notes.fire("input");
    d.read.checked = false;
    await d.read.fire("change");
    const notes = d.notes.value;
    await confirmClear(d);
    preserved(d, other, notes, false);
    assert.match(d.status.textContent, /Another tab changed/);
    assert.match(d.status.textContent, /not cleared/i);
    const text = await exported(d);
    assert.ok(text.includes(notes));
    assert.ok(text.includes("Read: Not marked"));
    assert.equal(d.operations.filter(([op]) => op === "set").length, 0);
  });

  for (const [name, raw, options] of [
    ["malformed stored notes", "{fictional-corrupt", {}],
    ["blocked initial storage read", JSON.stringify(original), { failRead: true }],
  ]) await check(name + " does not authorize clear or destroy a new recoverable draft", async () => {
    const d = await mount(raw, options);
    d.flags.failRead = false;
    d.notes.value = "New fictional notes kept for download";
    await d.notes.fire("input");
    d.read.checked = true;
    await d.read.fire("change");
    await confirmClear(d);
    preserved(d, raw, "New fictional notes kept for download", true);
    assert.match(d.status.textContent, /not cleared/i);
    assert.ok((await exported(d)).includes("New fictional notes kept for download"));
    assert.equal(d.operations.filter(([op]) => op === "set").length, 0);
  });

  await check("successful clear preserves the legacy key/shape and reading marker without an unconfirmed write", async () => {
    const d = await mount();
    preserved(d, JSON.stringify(original), original.notes, true);
    assert.equal(d.operations.filter(([op]) => op !== "get").length, 0);
    await confirmClear(d);
    assert.equal(d.notes.value, "");
    assert.equal(d.read.checked, true);
    assert.equal(d.values.get(key), JSON.stringify({ read: true, notes: "" }));
    assert.match(d.status.textContent, /Saved in this browser/);
    assert.equal(d.operations.filter(([op]) => op === "set").length, 1);
    assert.ok((await exported(d)).endsWith("Private reading notes; not independent review or course certification."));
  });

  await check("editing after first Clear disarms confirmation and retains the new ordinary autosave", async () => {
    const d = await mount();
    await d.clear.click();
    d.notes.value = "Fictional edit after arming";
    await d.notes.fire("input");
    assert.equal(d.clear.textContent, "Clear this chapter’s notes");
    const saved = d.values.get(key);
    await d.clear.click();
    preserved(d, saved, "Fictional edit after arming", true);
    assert.equal(d.clear.textContent, "Confirm clear notes");
  });
  console.log(`${groups} mounted reader notebook groups passed.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
