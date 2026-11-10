import { test } from "node:test";
import assert from "node:assert/strict";
import { learningTestDOM } from "./learning-test-dom.js";
import { createOwnVolunteerProfilePane } from "./volunteer-profile.js";

const A = "a".repeat(64), B = "b".repeat(64);
const STAMP = "2026-11-09T12:00:00.123456Z";
const PATH = "/api/participant/orgs/fictional-org/requests/fictional-request/volunteer-profile";
const profile = (skills, availability, timeZone = "UTC") => ({ skills, availability, timeZone, updatedAtExact: STAMP });
const view = (revision = 0, saved = null, extra = {}) => ({ ok: true, version: 1, revision, workspaceTimeZone: "UTC",
  profile: saved, scopeSha256: A, replayed: false, ...extra });
const reject = (status, code) => Object.assign(new Error("private response detail"), { status, code });
const readButton = "Read saved volunteer preferences", saveButton = "Save preferences", clearButton = "Clear saved preferences";
const retryButton = "Retry the same preference change", stopButton = "Stop retrying this preference change";

function mounted(t, answer, options = {}) {
  const dom = learningTestDOM();
  const calls = [], dirty = [];
  let accessLosses = 0;
  const pane = createOwnVolunteerProfilePane({
    enabled: true, orgId: "fictional-org", intakeId: "fictional-request", isCurrent: () => true,
    request(path, init) {
      const call = { path, ...init, wire: init.body === undefined ? undefined : JSON.stringify(init.body) };
      calls.push(call);
      return answer(call);
    },
    onDirty: value => dirty.push(value), onAccessLost: () => accessLosses++, ...options,
  });
  dom.mount(pane.element);
  t.after(() => { pane.dispose(); dom.restore(); });
  const button = title => pane.element.querySelectorAll("button").find(entry => entry.textContent === title);
  const input = title => pane.element.querySelectorAll("input").find(entry => entry.getAttribute("aria-label") === title ||
    entry.parentElement.textContent === title);
  const set = async (title, checked = true) => {
    const checkbox = input(title);
    assert.equal(checkbox.parentElement.tagName, "LABEL");
    assert.equal(checkbox.disabled, false);
    checkbox.checked = checked;
    await checkbox.emit("change");
  };
  return { pane, calls, dirty, accessLosses: () => accessLosses, button, input, set, click: title => button(title).click() };
}
const acknowledge = h => h.set("I want to save these optional preferences for my linked request.");
const allowStop = h => h.set("I understand the earlier change may already be saved.");

test("a disabled pane is hidden and its own-only read is deliberate and closed", async t => {
  const h = mounted(t, () => assert.fail("unexpected request"), { enabled: false });
  await h.pane.load();
  assert.equal(h.pane.element.hidden, true);
  assert.equal(h.calls.length, 0);
});

test("fixed named skills and weekday time checkboxes send one acknowledged Save and explicit Clear", async t => {
  const h = mounted(t, call => call.method !== "POST" ? view() : call.body.operation === "clear"
    ? view(2) : view(1, profile(["event-support", "operations"], ["mon-afternoon", "sun-evening"])));
  assert.equal(h.calls.length, 0);
  assert.equal(h.button(saveButton).disabled, true);
  await h.click(readButton);
  assert.equal(h.calls[0].path, PATH);
  assert.equal(h.pane.element.querySelectorAll('input[aria-label]').length, 29);
  assert.match(h.pane.element.textContent, /Work you are interested in.*When you are usually free.*UTC/);
  await h.set("Sunday evening");
  await h.set("Operations");
  await h.set("Monday afternoon");
  await h.set("Event support");
  await h.click(saveButton);
  assert.equal(h.calls.length, 1);
  await acknowledge(h);
  await h.click(saveButton);
  assert.deepEqual(h.calls[1].body, { version: 1, operation: "save", expectedRevision: 0, scopeSha256: A,
    acknowledge: true, skills: ["event-support", "operations"], availability: ["mon-afternoon", "sun-evening"] });
  assert.match(h.pane.element.textContent, /Saved revision 1/);
  assert.equal(h.pane.hasUnsavedChanges(), false);
  await h.click(clearButton);
  assert.equal(h.pane.element.querySelector('[role="region"]').focused, true);
  assert.equal(h.calls.length, 2);
  await h.click("Keep saved preferences");
  assert.equal(h.button(clearButton).focused, true);
  await h.click(clearButton);
  await h.click("Confirm clear");
  assert.deepEqual(h.calls[2].body, { version: 1, operation: "clear", expectedRevision: 1, scopeSha256: A, acknowledge: true });
  assert.match(h.pane.element.textContent, /Saved revision 2.*saved preferences are empty/);
  assert.equal(h.input("Sunday evening").checked, false);
  assert.equal(h.button(clearButton).disabled, true);
});

test("a first stale conflict keeps writing and requires a fresh read before another save", async t => {
  let reads = 0, writes = 0;
  const h = mounted(t, call => {
    if (call.method !== "POST") return ++reads === 1 ? view() : view(1, profile(["technology"], []), { scopeSha256: B });
    if (++writes === 1) throw reject(409, "volunteer_profile_changed");
    return view(2, profile(["operations"], ["wed-evening"]), { scopeSha256: B });
  });
  await h.click(readButton);
  await h.set("Operations");
  await h.set("Wednesday evening");
  await acknowledge(h);
  await h.click(saveButton);
  assert.equal(h.pane.hasPendingCommand(), false);
  assert.equal(h.pane.hasUnsavedChanges(), true);
  assert.equal(h.input("Operations").checked, true);
  assert.equal(h.button(saveButton).disabled, true);
  assert.doesNotMatch(h.pane.element.textContent, /private response detail/);
  await h.click(readButton);
  assert.match(h.pane.element.textContent, /Saved revision 1.*unsaved selections/);
  assert.equal(h.input("Wednesday evening").checked, true);
  assert.equal(h.input("Technology").checked, false);
  assert.equal(h.button(saveButton).disabled, true);
  await acknowledge(h);
  await h.click(saveButton);
  assert.deepEqual(h.calls.at(-1).body, { version: 1, operation: "save", expectedRevision: 1, scopeSha256: B,
    acknowledge: true, skills: ["operations"], availability: ["wed-evening"] });
  assert.equal(h.pane.hasUnsavedChanges(), false);
});

test("a read cannot settle a lost save and only deliberate Retry reuses its exact body", async t => {
  let reads = 0, writes = 0;
  const desired = profile(["logistics"], ["mon-morning"]);
  const h = mounted(t, call => {
    if (call.method !== "POST") return ++reads === 1 ? view() : view(1, desired);
    if (++writes === 1) throw reject(0, "connection_interrupted");
    return view(1, desired, { replayed: true });
  });
  await h.click(readButton);
  await h.set("Monday morning");
  await h.set("Logistics");
  await acknowledge(h);
  await h.click(saveButton);
  assert.equal(h.pane.hasPendingCommand(), true);
  await h.click(readButton);
  assert.equal(writes, 1);
  assert.equal(h.pane.hasPendingCommand(), true);
  assert.equal(h.button(saveButton).disabled, true);
  await h.click(retryButton);
  const posts = h.calls.filter(call => call.method === "POST");
  assert.equal(posts.length, 2);
  assert.equal(posts[0].wire, posts[1].wire);
  assert.equal(posts[0].body, posts[1].body);
  assert.ok(Object.isFrozen(posts[0].body) && Object.isFrozen(posts[0].body.availability));
  assert.equal(h.pane.hasPendingCommand(), false);
  assert.match(h.pane.element.textContent, /Saved revision 1/);
});

test("a new scope or time zone never borrows the prior Retry and can keep the authored selections", async t => {
  let reads = 0;
  const h = mounted(t, call => {
    if (call.method === "POST") return view(1, profile(["operations"], []), { scopeSha256: B });
    if (++reads === 1) return view();
    return view(0, null, { scopeSha256: B, workspaceTimeZone: "America/New_York" });
  });
  await h.click(readButton);
  await h.set("Operations");
  await acknowledge(h);
  await h.click(saveButton);
  assert.equal(h.pane.hasPendingCommand(), true, "wrong-scope success cannot settle");
  h.pane.pause();
  assert.equal(h.pane.element.hidden, true);
  assert.equal(h.input("Operations").checked, false);
  h.pane.resume();
  assert.equal(h.input("Operations").checked, true);
  assert.equal(h.button(retryButton).disabled, true);
  await h.click(readButton);
  assert.equal(h.button(retryButton).disabled, true);
  assert.equal(h.button(stopButton).disabled, true);
  await allowStop(h);
  await h.click(stopButton);
  assert.equal(h.pane.hasPendingCommand(), false);
  assert.equal(h.input("Operations").checked, true);
  await h.click(readButton);
  await h.click("Use saved selections");
  assert.equal(h.input("Operations").checked, false);
  assert.equal(h.pane.hasUnsavedChanges(), false);
  assert.equal(h.calls.filter(call => call.method === "POST").length, 1);
});

test("extra response fields fail closed and lost access clears all visible choices and Retry", async t => {
  let calls = 0;
  const h = mounted(t, () => {
    if (++calls === 1) return view(1, { ...profile(["operations"], []), email: "unapproved@example.invalid" });
    if (calls === 2) return view();
    if (calls === 3) throw reject(0, "connection_interrupted");
    throw reject(404, "volunteer_profile");
  });
  await h.click(readButton);
  assert.equal(h.button(saveButton).disabled, true);
  assert.doesNotMatch(h.pane.element.textContent, /unapproved@example/);
  await h.click(readButton);
  await h.set("Operations");
  await acknowledge(h);
  await h.click(saveButton);
  await h.click(retryButton);
  assert.equal(h.pane.hasPendingCommand(), false);
  assert.equal(h.pane.element.hidden, true);
  assert.equal(h.pane.element.textContent, "");
  assert.equal(h.accessLosses(), 1);
});
