import test from "node:test";
import assert from "node:assert/strict";
import { setCsrfToken } from "./api.js";
import { resourceReservationsAPI } from "./resource-reservations-api.js";
import { createResourceReservationsWorkspace } from "./resource-reservations.js";
import { learningTestDOM } from "./learning-test-dom.js";

const orgId = "fictional_org";
const scopeSha256 = "a".repeat(64);
const oldProof = "b".repeat(64);
const newProof = "c".repeat(64);
const recordedAt = "2026-11-09T09:00:00.000001Z";
const later = "2026-11-09T09:05:00.000001Z";
const range = { startAt: "2026-12-08T10:00:00-05:00", endAt: "2026-12-08T11:00:00-05:00", timeZone: "America/New_York" };
const laterRange = { ...range, startAt: range.endAt, endAt: "2026-12-08T12:00:00-05:00" };
const assetA = { id: "room_a", revision: 3, title: "Room A", quantity: 1 };
const assetB = { id: "projector_b", revision: 7, title: "Projector B", quantity: 1 };
const sessionA = { id: "session_a", revision: 2, title: "Morning session", interval: range };
const sessionB = { id: "session_b", revision: 4, title: "Later session", interval: laterRange };
const previous = {
  id: "saved_hold", revision: 1, originMode: "live", state: "reserved", sourceState: "reserved",
  assetId: assetA.id, assetRevision: assetA.revision, sessionId: sessionA.id, sessionRevision: sessionA.revision,
  interval: range, proofSha256: oldProof, original: { operation: "reserve", acceptedAtExact: recordedAt, replacesId: null },
  terminal: null, disposition: null,
};
const recovered = {
  ...previous, id: "recovered_hold", originMode: "recovered",
  interval: { ...range, timeZone: "Retired/Example" },
};
const released = { ...previous, revision: 2, state: "released", sourceState: "released",
  terminal: { operation: "release", acceptedAtExact: later, reason: "Ended the original internal hold.", replacedById: null } };
const preview = {
  previewToken: "fictional-review." + "z".repeat(43),
  reviewSha256: "d".repeat(64),
  expiresAtExact: "2026-11-09T09:15:00.000001Z",
};
const success = body => ({ ok: true, version: 1, orgId, scopeSha256, ...body });
const byPath = "/api/orgs/" + orgId + "/resource-reservations";
const buttonText = Object.freeze({
  read: "Refresh saved holds", review: "Review selected decision", commit: "Record reviewed reservation decision",
  retry: "Retry the same reservation command", stop: "Stop retrying this command",
});

function accepted(body, { replayed = false, nextState = "reserved" } = {}) {
  const { request, operation } = body;
  const previousEffect = operation === "reserve" ? null :
    { id: previous.id, proofSha256: oldProof, state: "released", revision: 2 };
  const nextEffect = operation === "release" ? null :
    { id: "new_hold", proofSha256: newProof, state: "reserved", revision: 1 };
  const effects = [previousEffect, nextEffect].filter(Boolean);
  return success({ state: "accepted", idempotencyKey: request.idempotencyKey, replayed,
    decision: { operation, acceptedAtExact: later, previous: previousEffect, next: nextEffect, reason: request.reason ?? null },
    current: effects.map(effect => effect === nextEffect && nextState === "released"
      ? { ...effect, state: "released", revision: 2 } : effect) });
}

async function harness(run) {
  const dom = learningTestDOM();
  const oldFetch = globalThis.fetch;
  let context = success({ assets: [assetA, assetB], sessions: [sessionA, sessionB], reservations: [previous, recovered] });
  let lost = 0, keys = 0;
  const calls = [], changed = [];
  function makeReview(input, state = "ready") {
    return success({
      state, input,
      previous: input.previous ? context.reservations.find(row => row.id === input.previous.id) : null,
      next: input.asset ? {
        id: state === "ready" ? "new_hold" : null, proofSha256: newProof,
        asset: context.assets.find(row => row.id === input.asset.id),
        session: context.sessions.find(row => row.id === input.session.id),
      } : null,
      preview: state === "ready" && input.asset ? preview : null,
    });
  }
  const handlers = {
    workspace: () => context,
    review: ({ body }) => makeReview(body),
    commit: ({ body }) => accepted(body),
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(typeof url, "string");
    assert(url.startsWith(byPath + "/"));
    const route = url.slice(byPath.length + 1);
    assert(Object.hasOwn(handlers, route));
    assert.equal(options.method, route === "workspace" ? "GET" : "POST");
    assert.equal(options.credentials, "same-origin");
    if (route !== "workspace") assert.equal(options.headers["X-CSRF-Token"], "fictional-csrf");
    const call = { route, wire: options.body, body: options.body === undefined ? null : JSON.parse(options.body) };
    calls.push(call);
    const response = await handlers[route](call);
    if (response instanceof Response) return response;
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  };
  setCsrfToken("fictional-csrf");
  const view = createResourceReservationsWorkspace({ orgId, api: resourceReservationsAPI(orgId),
    onChanged: operation => changed.push(operation), onAccessLost: () => lost++,
    makeCommandKey: () => "fictional-command-" + ++keys });
  dom.mount(view);
  const get = name => view.querySelector('[data-reservation="' + name + '"]');
  const control = label => view.querySelectorAll("button").find(row => row.textContent === label);
  const click = async label => {
    const button = control(label);
    assert(button, label);
    assert.equal(button.disabled, false, label);
    await button.emit("click");
  };
  const write = async (name, value, event = "change") => {
    const field = get(name);
    assert(field, name);
    assert.equal(field.disabled, false, name);
    if (typeof value === "boolean") field.checked = value;
    else field.value = value;
    await field.emit(event);
  };
  const choose = async (operation, asset = assetB, session = sessionB, reason = "  Move the equipment.  ") => {
    await write("operation", operation);
    if (operation !== "reserve") {
      await write("hold", previous.id);
      await write("reason", reason, "input");
    }
    if (operation !== "release") {
      await write("asset", asset.id);
      await write("session", session.id);
    }
  };
  try {
    await run({ view, calls, handlers, click, write, choose, control, get, changed, makeReview,
      context: patch => { context = { ...context, ...patch }; }, keyCount: () => keys, lost: () => lost });
  } finally {
    view.dispose();
    setCsrfToken("");
    globalThis.fetch = oldFetch;
    dom.restore();
  }
}

test("a changed session review cannot authorize Commit and a new choice requires another exact acknowledgment", () =>
  harness(async h => {
    assert.equal(h.calls.length, 0);
    await h.click(buttonText.read);
    assert.equal(h.control(buttonText.review).disabled, true);
    await h.choose("reserve");
    h.handlers.review = ({ body }) => {
      const result = h.makeReview(body);
      result.next = { ...result.next, session: { ...result.next.session, interval: range } };
      return result;
    };
    await h.click(buttonText.review);
    assert.equal(h.control(buttonText.commit), undefined);
    assert.match(h.view.textContent, /review could not be verified/);
    h.handlers.review = ({ body }) => h.makeReview(body);
    await h.click(buttonText.review);
    assert.match(h.view.textContent, /Projector B · projector_b · revision 7/);
    assert.match(h.view.textContent, /Starts 2026-12-08T11:00:00-05:00/);
    assert.equal(h.control(buttonText.commit).disabled, true);
    await h.write("ack", true);
    await h.write("session", sessionA.id);
    assert.equal(h.control(buttonText.commit), undefined);
    assert.equal(h.keyCount(), 0);
    await h.click(buttonText.review);
    assert.equal(h.get("ack").checked, false);
    await h.write("ack", true);
    await h.click(buttonText.commit);
    assert.deepEqual(h.calls.at(-1).body, { version: 1, scopeSha256, operation: "reserve",
      request: { version: 1, idempotencyKey: "fictional-command-1", previewToken: preview.previewToken,
        reviewSha256: preview.reviewSha256, acknowledge: true } });
    assert.deepEqual(h.changed, ["reserve"]);
    assert.equal(h.view.hasPendingCommand(), false);
    assert.equal(h.view.hasUnsavedChanges(), false);
    assert.match(h.view.textContent, /Original effect on new_hold · reserved · revision 1/);
  }));

test("replacement keeps its exact wire through lost response, Refresh and 429, then shows original and current states", () =>
  harness(async h => {
    await h.click(buttonText.read);
    await h.choose("replace");
    await h.click(buttonText.review);
    assert.match(h.view.textContent, /Hold to release.*saved_hold · revision 1/);
    assert.match(h.view.textContent, /New internal hold.*Projector B/);
    await h.write("ack", true);
    let attempts = 0;
    h.handlers.commit = ({ body }) => {
      attempts++;
      if (attempts === 1) throw new Error("Fictional response lost.");
      if (attempts === 2) return new Response(JSON.stringify({ ok: false }), { status: 429 });
      return accepted(body, { replayed: true, nextState: "released" });
    };
    await h.click(buttonText.commit);
    assert.equal(h.view.hasPendingCommand(), true);
    assert.equal(h.get("reason").disabled, true);
    h.context({ reservations: [released, recovered] });
    await h.click(buttonText.read);
    assert.equal(attempts, 1);
    assert.equal(h.view.hasPendingCommand(), true);
    await h.click(buttonText.retry);
    assert.equal(h.view.hasPendingCommand(), true);
    await h.click(buttonText.retry);
    const writes = h.calls.filter(row => row.route === "commit");
    assert.equal(writes.length, 3);
    assert.equal(new Set(writes.map(row => row.wire)).size, 1);
    assert.deepEqual(writes[0].body.request, { version: 1, idempotencyKey: "fictional-command-1",
      reservationId: previous.id, reservationRevision: 1, reason: "Move the equipment.",
      previewToken: preview.previewToken, reviewSha256: preview.reviewSha256, acknowledge: true });
    assert.equal(h.keyCount(), 1);
    assert.equal(h.view.hasPendingCommand(), false);
    assert.match(h.view.textContent, /Original effect on new_hold · reserved · revision 1/);
    assert.match(h.view.textContent, /Current disposition.*new_hold · released · revision 2/);
  }));

test("a locked stale refusal settles Release but preserves its untrimmed writing", () =>
  harness(async h => {
    await h.click(buttonText.read);
    const reason = "  Return the key.  ";
    await h.choose("release", null, null, reason);
    await h.click(buttonText.review);
    assert.match(h.view.textContent, /Hold to release.*saved_hold · revision 1/);
    assert.match(h.view.textContent, /Return the key\./);
    await h.write("ack", true);
    h.handlers.commit = ({ body }) => success({ state: "refused", idempotencyKey: body.request.idempotencyKey,
      reasonCode: "stale" });
    await h.click(buttonText.commit);
    assert.deepEqual(h.calls.at(-1).body.request, { version: 1, idempotencyKey: "fictional-command-1",
      reservationId: previous.id, reservationRevision: 1, reason: "Return the key." });
    assert.equal(h.view.hasPendingCommand(), false);
    assert.equal(h.view.hasUnsavedChanges(), true);
    h.context({ reservations: [released, recovered] });
    await h.click(buttonText.read);
    assert.equal(h.get("reason").value, reason);
    assert.match(h.get("hold").textContent, /Earlier selection unavailable/);
    assert.equal(h.control(buttonText.review).disabled, true);
  }));

test("blocked capacity reviews show each state without a command and retain literal recovered history", () =>
  harness(async h => {
    await h.click(buttonText.read);
    assert.match(h.view.textContent, /Recovered claim needs reconciliation/);
    assert.match(h.view.textContent, /Time zone Retired\/Example/);
    await h.choose("replace");
    assert.doesNotMatch(h.get("hold").textContent, /recovered_hold/);
    for (const [state, visible] of [["conflict", /conflicting hold/],
      ["unchanged", /same item and session interval/], ["recovery-required", /recovered claim needs reconciliation/]]) {
      h.handlers.review = ({ body }) => h.makeReview(body, state);
      await h.click(buttonText.review);
      assert.match(h.view.textContent, visible);
      assert.equal(h.control(buttonText.commit), undefined);
    }
    assert.equal(h.calls.filter(row => row.route === "commit").length, 0);
    assert.equal(h.keyCount(), 0);
  }));

test("hidden state suppresses a late response and a changed scope removes retained Retry and private writing", () =>
  harness(async h => {
    await h.click(buttonText.read);
    await h.choose("replace");
    await h.click(buttonText.review);
    await h.write("ack", true);
    let complete;
    h.handlers.commit = ({ body }) => new Promise(resolve => { complete = () => resolve(accepted(body)); });
    const waiting = h.click(buttonText.commit);
    assert.equal(h.view.hasPendingCommand(), true);
    h.view.pause();
    assert.doesNotMatch(h.view.textContent, /Move the equipment|Projector B|saved_hold/);
    complete();
    await waiting;
    assert.equal(h.view.hasPendingCommand(), true);
    assert.equal(h.changed.length, 0);
    h.view.resume();
    h.context({ scopeSha256: "f".repeat(64), assets: [], sessions: [], reservations: [] });
    await h.click(buttonText.read);
    assert.equal(h.view.hasPendingCommand(), false);
    assert.equal(h.view.hasUnsavedChanges(), false);
    assert.equal(h.get("reason").value, "");
    assert.equal(h.control(buttonText.retry), undefined);
    assert.match(h.view.textContent, /Current access changed/);
  }));

test("an authorization refusal clears Retry and a malformed refusal preserves it", () =>
  harness(async h => {
    await h.click(buttonText.read);
    await h.choose("reserve");
    await h.click(buttonText.review);
    await h.write("ack", true);
    h.handlers.commit = () => success({ state: "refused", idempotencyKey: "different-command", reasonCode: "expired" });
    await h.click(buttonText.commit);
    assert.equal(h.view.hasPendingCommand(), true);
    h.handlers.commit = () => new Response(JSON.stringify({ ok: false }), { status: 403 });
    await h.click(buttonText.retry);
    assert.equal(h.view.hasPendingCommand(), false);
    assert.equal(h.view.hasUnsavedChanges(), false);
    assert.equal(h.lost(), 1);
    assert.doesNotMatch(h.view.textContent, /Projector B/);
  }));

test("source search and history page keep the rendered lists bounded", () =>
  harness(async h => {
    h.context({ assets: Array.from({ length: 45 }, (_, index) =>
      ({ ...assetA, id: "room_" + index, title: "Room " + index })),
      reservations: Array.from({ length: 23 }, (_, index) => ({ ...released, id: "history_" + index })) });
    await h.click(buttonText.read);
    assert.equal(h.get("asset").querySelectorAll("option").length, 21);
    assert.equal(h.view.querySelectorAll("details").length, 20);
    await h.write("asset-search", "room_44", "input");
    await h.write("asset", "room_44");
    await h.write("asset-search", "room_0", "input");
    assert.equal(h.get("asset").value, "room_44");
    await h.click("Next history page");
    assert.equal(h.view.querySelectorAll("details").length, 3);
  }));
