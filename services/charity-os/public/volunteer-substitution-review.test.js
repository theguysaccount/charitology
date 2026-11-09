import { test } from "node:test";
import assert from "node:assert/strict";
import { setCsrfToken } from "./api.js";
import { learningTestDOM } from "./learning-test-dom.js";
import { createVolunteerSubstitutionReviewPane } from "./volunteer-substitution-review.js";

const ORG = "fictional-workspace", INTENT = "7".repeat(32);
const PATH = `/api/orgs/${ORG}/volunteer-substitutions/${INTENT}`;
const KEY = "fictional-command-key-001";
const DIGEST = "a".repeat(64);
const START = "2027-11-07T05:30:00.000011Z", END = "2027-11-07T06:30:00.000022Z";
const SAVED_AT = "2027-11-07T04:30:00.000033Z";
const review = () => ({ ok: true, review: {
  version: 1, shift: { title: "Fictional packing shift", startsAt: START, endsAt: END, timeZone: "America/New_York" },
  outgoing: { label: "Volunteer A <em>", state: "confirmed", nextState: "cancelled" },
  replacement: { label: "Volunteer B", state: "waitlisted", nextState: "confirmed" },
  confirmedPlaces: { before: 2, after: 2 }, ready: true, reviewSha256: DIGEST,
} });
const decision = (replayed = false) => ({ ok: true, decision: {
  version: 1, acceptedAtExact: SAVED_AT, shift: { startsAtExact: START, endsAtExact: END },
  outgoing: { fromState: "confirmed", toState: "cancelled" },
  replacement: { fromState: "waitlisted", toState: "confirmed" },
  confirmedPlaces: { before: 2, after: 2 },
}, replayed });
const problem = (status, code) => Object.assign(new Error("private service detail"), { status, code });
const requestBody = { version: 1, reviewSha256: DIGEST, idempotencyKey: KEY, acknowledge: true };

function mounted(t, reply, options = {}) {
  const dom = learningTestDOM();
  const requests = [], dirty = [];
  let keyCount = 0, changes = 0, accessLosses = 0;
  const pane = createVolunteerSubstitutionReviewPane({
    enabled: true, orgId: ORG, intentId: INTENT, isCurrent: () => true,
    request(path, init) {
      const call = { path, ...init, wire: init.body === undefined ? undefined : JSON.stringify(init.body) };
      requests.push(call);
      return reply(call);
    },
    makeCommandKey: () => { keyCount++; return KEY; },
    onDirty: value => dirty.push(value), onChanged: () => changes++, onAccessLost: () => accessLosses++,
    ...options,
  });
  t.after(() => { pane.dispose(); dom.restore(); });
  dom.mount(pane.element);
  return { dom, pane, requests, dirty, counts: () => ({ keyCount, changes, accessLosses }) };
}

function visible(element) {
  for (let parent = element; parent; parent = parent.parentElement) {
    if (parent.hidden) return false;
  }
  return !!element?.isConnected;
}

function button(pane, title) {
  return pane.element.querySelectorAll("button").find(control => control.textContent === title);
}

const read = pane => button(pane, "Read handoff review").click();
const confirm = pane => button(pane, "Confirm handoff");
const retry = pane => button(pane, "Retry the same confirmation");
const stop = pane => button(pane, "Stop retrying this confirmation");
const status = pane => pane.element.querySelector('[role="status"]');

async function check(pane) {
  const box = pane.element.querySelectorAll('input[type="checkbox"]').find(visible);
  assert.ok(box && !box.disabled);
  box.checked = true;
  await box.emit("change");
}

async function confirmReview(pane) {
  await read(pane);
  await check(pane);
  await confirm(pane).click();
}

test("disabled scope mounts empty and makes no request", async t => {
  const { pane, requests } = mounted(t, () => assert.fail("unexpected request"), { enabled: false });
  assert.equal(pane.element.hidden, true);
  assert.equal(pane.element.textContent, "");
  await pane.load();
  pane.pause();
  pane.resume();
  assert.equal(requests.length, 0);
  assert.equal(pane.hasPendingCommand(), false);
});

test("scope with an invalid intent path fails before making a request", t => {
  const dom = learningTestDOM();
  t.after(() => dom.restore());
  assert.throws(() => createVolunteerSubstitutionReviewPane({
    enabled: true, orgId: ORG, intentId: "../invalid", request: () => assert.fail("unexpected request"),
  }), /could not be verified/);
});

test("an enabled pane also requires an explicitly current shell scope", async t => {
  const { pane, requests } = mounted(t, () => assert.fail("unexpected request"), { isCurrent: undefined });
  await pane.load();
  assert.equal(pane.element.hidden, true);
  assert.equal(pane.element.textContent, "");
  assert.equal(requests.length, 0);
});

test("explicit read shows the two effects, the repeated hour and the conserved count", async t => {
  const { pane, requests, counts } = mounted(t, () => review());
  assert.equal(requests.length, 0);
  assert.equal(visible(confirm(pane)), false);
  await read(pane);
  assert.deepEqual(requests.map(({ path, wire }) => [path, wire]), [[PATH + "/review", undefined]]);
  assert.match(pane.element.textContent, /Volunteer A <em> · Confirmed → Canceled/);
  assert.match(pane.element.textContent, /Volunteer B · Waitlisted → Confirmed/);
  assert.match(pane.element.textContent, /2 before · 2 after/);
  assert.match(pane.element.textContent, /GMT-4.*05:30:00.000011 UTC.*GMT-5.*06:30:00.000022 UTC/);
  assert.equal(pane.element.querySelectorAll("em").length, 0);
  assert.equal(pane.element.querySelectorAll("time").filter(node => node.getAttribute("datetime") === START).length, 2);
  assert.equal(pane.element.textContent.includes(DIGEST), false);
  assert.equal(status(pane).focused, true);
  assert.equal(status(pane).getAttribute("aria-atomic"), "true");
  assert.equal(confirm(pane).disabled, true);
  await confirm(pane).click();
  assert.deepEqual(counts(), { keyCount: 0, changes: 0, accessLosses: 0 });
});

test("a closed blocked review gives no confirmation and an unexpected identity fails closed", async t => {
  let result = review();
  result.review.ready = false;
  delete result.review.reviewSha256;
  const { pane, requests } = mounted(t, () => result);
  await read(pane);
  assert.match(pane.element.textContent, /handoff is blocked/);
  assert.equal(visible(confirm(pane)), false);
  result.review.reviewSha256 = DIGEST;
  await read(pane);
  assert.match(status(pane).textContent, /could not verify/);
  assert.doesNotMatch(pane.element.textContent, /Volunteer A/);
  result = review();
  result.review.replacement.contactId = "private-id";
  await read(pane);
  await confirm(pane).click();
  assert.equal(requests.length, 3);
  assert.doesNotMatch(pane.element.textContent, /private-id|Volunteer B/);
  assert.equal(visible(confirm(pane)), false);
});

test("refresh clears prior acknowledgement before the request settles", async t => {
  let finish, calls = 0;
  const { pane, requests, dirty } = mounted(t, () => ++calls === 1 ? review() : new Promise(resolve => { finish = resolve; }));
  await read(pane);
  await check(pane);
  assert.equal(pane.hasUnsavedChanges(), true);
  const refreshing = read(pane);
  await confirm(pane).click();
  assert.equal(requests.length, 2);
  assert.equal(visible(confirm(pane)), false);
  assert.doesNotMatch(pane.element.textContent, /Volunteer A/);
  finish(review());
  await refreshing;
  assert.equal(confirm(pane).disabled, true);
  assert.deepEqual(dirty, [true, false]);
});

test("explicit acknowledgement sends one minimized body and displays a separate historical decision", async t => {
  const { pane, requests, counts, dirty } = mounted(t, call => call.method === "POST" ? decision() : review());
  await confirmReview(pane);
  assert.deepEqual(requests.map(({ path, method, wire }) => [path, method, wire]), [
    [PATH + "/review", undefined, undefined],
    [PATH + "/confirm", "POST", JSON.stringify(requestBody)],
  ]);
  assert.equal(Object.isFrozen(requests[1].body), true);
  assert.equal(pane.hasPendingCommand(), false);
  assert.deepEqual(counts(), { keyCount: 1, changes: 1, accessLosses: 0 });
  assert.deepEqual(dirty, [true, false]);
  assert.match(pane.element.textContent, /Original saved decision.*04:30:00.000033 UTC.*2 before · 2 after/);
  assert.doesNotMatch(pane.element.textContent, /Volunteer A|Volunteer B|fictional-command-key/);
  await read(pane);
  assert.match(pane.element.textContent, /Proposed handoff.*Original saved decision/);
  assert.equal(visible(confirm(pane)), false);
  assert.equal(requests.filter(call => call.method === "POST").length, 1);
});

test("a missing live review and a stale response preserve only the exact deliberate retry", async t => {
  let reads = 0, writes = 0;
  const { pane, requests, counts } = mounted(t, call => {
    if (call.method !== "POST") {
      if (++reads === 1) return review();
      throw problem(404, "substitution_offer_unavailable");
    }
    if (++writes === 1) throw problem(0, "connection_interrupted");
    if (writes === 2) throw problem(409, "substitution_stale");
    return decision(true);
  });
  await confirmReview(pane);
  assert.equal(pane.hasPendingCommand(), true);
  assert.equal(visible(retry(pane)), true);
  assert.doesNotMatch(pane.element.textContent, /Volunteer A|private service detail/);
  await read(pane);
  assert.match(status(pane).textContent, /no longer available/);
  assert.equal(visible(confirm(pane)), false);
  assert.equal(writes, 1);
  await retry(pane).click();
  assert.equal(pane.hasPendingCommand(), true);
  await retry(pane).click();
  assert.equal(pane.hasPendingCommand(), false);
  assert.match(pane.element.textContent, /decision from the earlier confirmation/);
  assert.deepEqual(counts(), { keyCount: 1, changes: 1, accessLosses: 0 });
  const posts = requests.filter(call => call.method === "POST");
  assert.equal(posts.length, 3);
  assert.deepEqual([...new Set(posts.map(call => call.wire))], [JSON.stringify(requestBody)]);
  assert.equal(posts.every(call => call.body === posts[0].body), true);
});

test("wrong effect, shift microsecond or extra identity cannot settle a command", async t => {
  const responses = [decision(), decision(), decision(), decision(true)];
  responses[0].decision.replacement.toState = "waitlisted";
  responses[1].decision.shift.endsAtExact = "2027-11-07T06:30:00.000021Z";
  responses[2].decision.replacement.linkId = "unapproved-private-link";
  const { pane, requests, counts } = mounted(t, call => call.method === "POST" ? responses.shift() : review());
  await confirmReview(pane);
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(pane.hasPendingCommand(), true);
    assert.doesNotMatch(pane.element.textContent, /Original saved decision|unapproved-private-link/);
    await retry(pane).click();
  }
  assert.equal(pane.hasPendingCommand(), false);
  assert.equal(counts().changes, 1);
  assert.equal(new Set(requests.filter(call => call.method === "POST").map(call => call.wire)).size, 1);
});

test("stopping a retry is acknowledged separately and requires a fresh read", async t => {
  const { pane, requests } = mounted(t, call => {
    if (call.method === "POST") throw problem(500, "unknown");
    return review();
  });
  await confirmReview(pane);
  await read(pane);
  assert.equal(visible(confirm(pane)), false);
  assert.equal(stop(pane).disabled, true);
  await stop(pane).click();
  assert.equal(pane.hasPendingCommand(), true);
  await check(pane);
  await stop(pane).click();
  assert.equal(pane.hasPendingCommand(), false);
  assert.equal(visible(confirm(pane)), false);
  assert.equal(requests.filter(call => call.method === "POST").length, 1);
  await read(pane);
  assert.equal(confirm(pane).disabled, true);
});

for (const [code, httpStatus] of [
  ["expired", 401], ["denied", 403], ["substitution_unavailable", 404], ["substitution_receipt_scope", 404],
]) {
  test(`${httpStatus} ${code} clears existing review and pending command`, async t => {
    let writes = 0;
    const { pane, requests, counts } = mounted(t, call => {
      if (call.method !== "POST") return review();
      throw ++writes === 1 ? problem(0, "connection_interrupted") : problem(httpStatus, code);
    });
    await confirmReview(pane);
    await read(pane);
    await retry(pane).click();
    assert.equal(pane.element.hidden, true);
    assert.equal(pane.element.textContent, "");
    assert.equal(pane.hasPendingCommand(), false);
    assert.equal(pane.hasUnsavedChanges(), false);
    assert.equal(counts().accessLosses, 1);
    pane.resume();
    await pane.load();
    assert.equal(requests.length, 4);
  });
}

test("in-flight response cannot update the pane after its shell context changes", async t => {
  let current = true, finish;
  const { pane, requests, counts } = mounted(t, call => call.method === "POST" ?
    new Promise(resolve => { finish = resolve; }) : review(), { isCurrent: () => current });
  await read(pane);
  await check(pane);
  const posting = confirm(pane).click();
  await confirm(pane).click();
  assert.equal(requests.length, 2);
  assert.equal(pane.hasPendingCommand(), true);
  current = false;
  finish(decision());
  await posting;
  assert.equal(pane.element.textContent, "");
  assert.equal(pane.hasPendingCommand(), false);
  assert.equal(counts().changes, 0);
  assert.equal(counts().accessLosses, 0);
});

test("same-document pause aborts display work and preserves retry until pagehide", async t => {
  let finish, writes = 0;
  const { dom, pane, requests, counts } = mounted(t, call => {
    if (call.method !== "POST") return review();
    if (++writes === 1) return new Promise(resolve => { finish = resolve; });
    throw problem(0, "connection_interrupted");
  });
  await read(pane);
  await check(pane);
  const posting = confirm(pane).click();
  pane.pause();
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(pane.element.hidden, true);
  assert.equal(pane.element.textContent, "");
  assert.equal(pane.hasPendingCommand(), true);
  pane.resume();
  assert.equal(pane.element.hidden, false);
  assert.equal(visible(retry(pane)), true);
  assert.equal(requests.length, 2);
  finish(decision());
  await posting;
  assert.equal(counts().changes, 0);
  await retry(pane).click();
  assert.equal(requests[1].wire, requests[2].wire);
  await dom.window.emit("pagehide");
  assert.equal(pane.element.textContent, "");
  assert.equal(pane.hasPendingCommand(), false);
});

test("default transport uses the existing same-origin CSRF sender and exact bytes", async t => {
  const fetchBefore = globalThis.fetch;
  const calls = [];
  setCsrfToken("fictional-csrf");
  globalThis.fetch = async (path, init) => {
    calls.push({ path, ...init });
    return new Response(JSON.stringify(init.method === "POST" ? decision() : review()));
  };
  t.after(() => { globalThis.fetch = fetchBefore; setCsrfToken(""); });
  const { pane } = mounted(t, () => assert.fail("use default request"), { request: undefined });
  await confirmReview(pane);
  assert.deepEqual(calls.map(call => [call.path, call.method, call.credentials, call.cache]), [
    [PATH + "/review", "GET", "same-origin", "no-store"], [PATH + "/confirm", "POST", "same-origin", "no-store"],
  ]);
  assert.equal(calls[0].headers["X-CSRF-Token"], undefined);
  assert.equal(calls[1].headers["X-CSRF-Token"], "fictional-csrf");
  assert.equal(calls[1].body, JSON.stringify(requestBody));
});
