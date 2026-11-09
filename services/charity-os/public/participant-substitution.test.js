/** Mounted controls over a fictional transport. */
import test from "node:test";
import assert from "node:assert/strict";
import { learningTestDOM } from "./learning-test-dom.js";
import { checkedOwnSubstitutionChoice, createOwnSubstitutionPane } from "./participant-substitution.js";

const sha = "a".repeat(64), sha1 = "b".repeat(64), sha2 = "c".repeat(64);
const expiry = "2026-11-09T13:09:59.654321Z";
const savedAt = "2026-11-09T13:00:00.123456Z", withdrawAt = "2026-11-09T13:01:00.654321Z";
const shift = { title:"Workshop shift", startAt:"2026-11-10T10:00:00-05:00", endAt:"2026-11-10T12:00:00-05:00", timeZone:"America/New_York" };
const route = "/api/participant/orgs/org/requests/intake/participations/entry/substitution-choice";
const own = (patch = {}, outer = {}) => ({ ok:true, replayed:false, choice:{ version:1, party:"leaving",
  shift:{...shift}, offerExpiresAtExact:"2026-11-09T13:30:00.123456Z", state:"unanswered",
  choiceRevision:0, canAccept:true, canWithdraw:false, acceptedAtExact:null, expiresAtExact:null,
  withdrawnAtExact:null, reviewSha256:sha, ...patch }, ...outer });
const accepted = (patch = {}, outer = {}) => own({ state:"accepted", choiceRevision:1, canAccept:false, canWithdraw:true,
  acceptedAtExact:savedAt, expiresAtExact:expiry, reviewSha256:sha1, ...patch },outer);
const withdrawn = (patch = {}, outer = {}) => accepted({ state:"withdrawn", choiceRevision:2, canWithdraw:false,
  withdrawnAtExact:withdrawAt, reviewSha256:sha2, ...patch },outer);
const expired = (patch = {}, outer = {}) => accepted({ state:"expired", canWithdraw:false, ...patch },outer);
const failure = (status, code) => Object.assign(Error("Private response data."), {status,code});

async function mounted(run, extra = {}) {
  const dom = learningTestDOM(), calls = [], accessLost = [], dirties = [];
  let handler = async () => own(), current = true;
  const pane = createOwnSubstitutionPane({
    enabled:true, orgId:"org", intakeId:"intake", participationId:"entry", isCurrent:() => current,
    onAccessLost:error => accessLost.push(error.status), onDirty:value => dirties.push(value),
    request:async(path, options={}) => {
      calls.push({ path, method:options.method || "GET", body:options.body, wire:options.body ? JSON.stringify(options.body) : null,
        signal:options.signal });
      return handler(path, options);
    }, ...extra,
  });
  dom.mount(pane.element);
  const visible = control => {
    for (let node = control; node && node !== pane.element; node = node.parentElement)
      if (node.hidden) return false;
    return true;
  };
  const h = { pane, dom, calls, accessLost, dirties, visible,
    handler(fn) { handler = fn; }, deactivate() { current = false; },
    text() { return pane.element.textContent; },
    button(label) { return pane.element.querySelectorAll("button").find(control => control.textContent === label && visible(control)); },
    checkbox() { return pane.element.querySelectorAll("input").find(visible); },
    async click(label) { const b = h.button(label); assert.ok(b, label); return b.emit("click"); },
    async check(value = true) { const c = h.checkbox(); assert.ok(c); assert.equal(c.disabled, false); c.checked = value; return c.emit("change"); },
    posts() { return calls.filter(call => call.method === "POST"); },
  };
  try { await run(h); } finally { pane.dispose(); dom.restore(); }
}
const review = async h => { await h.pane.load(); await h.check(); };

test("feature-off and inactive panes never call transport or display controls", () => mounted(async h => {
  assert.equal(h.text(), "");
  await h.pane.load();
  assert.equal(h.calls.length, 0);
  assert.equal(h.pane.hasUnsavedChanges(), false);
}, {enabled:false}));
test("opening needs a deliberate GET and an unchecked accessible agreement", () => mounted(async h => {
  assert.equal(h.calls.length,0);
  assert.match(h.text(), /An organizer reviews any change to places separately/);
  await h.click("Read shift substitution offer");
  assert.equal(h.calls.length,1);
  assert.deepEqual([h.calls[0].path,h.calls[0].method,h.calls[0].body],[route,"GET",undefined]);
  assert.equal(h.checkbox().parentElement.tagName,"LABEL");
  assert.equal(h.checkbox().checked,false);
  assert.equal(h.button("Save my agreement").disabled,true);
  assert.equal(h.pane.element.querySelector('[role="status"]').getAttribute("aria-atomic"),"true");
  assert.equal(h.pane.element.querySelector('[role="status"]').focused,true);
  assert.match(h.text(), /Leave your confirmed place/);
  assert.deepEqual(h.pane.element.querySelectorAll("time").map(n => n.getAttribute("datetime")),
    [shift.startAt,shift.endAt,own().choice.offerExpiresAtExact]);
  assert.equal(h.posts().length,0);
}));
test("two repeated local hours retain distinct offsets and exact instants", () => mounted(async h => {
  const repeated = {title:"Evening workshop",startAt:"2027-11-07T01:30:00-04:00",endAt:"2027-11-07T01:30:00-05:00",
    timeZone:"America/New_York"};
  h.handler(async()=>own({party:"joining",shift:repeated}));
  await h.pane.load();
  const [start,end]=h.pane.element.querySelectorAll("time");
  assert.equal(start.getAttribute("datetime"),repeated.startAt);
  assert.equal(end.getAttribute("datetime"),repeated.endAt);
  assert.notEqual(start.textContent,end.textContent);
  assert.match(h.checkbox().parentElement.textContent,/I agree to take this place if the organizer approves/);
  assert.doesNotMatch(h.text(), /Leave your confirmed place/);
}));
test("explicit own agreement and separate fresh withdrawal post only the closed wire", () => mounted(async h => {
  await h.pane.load();
  await h.click("Save my agreement");
  assert.equal(h.posts().length,0);
  const focused=h.checkbox(); focused.focus(); await h.check();
  assert.equal(h.checkbox(),focused);
  assert.equal(focused.focused,true);
  assert.equal(h.pane.hasUnsavedChanges(),true);
  h.handler(async()=>accepted());
  await h.click("Save my agreement");
  assert.deepEqual(h.posts().map(c=>[c.path,c.body]),[[route,
    {version:1,choice:"accept",reviewSha256:sha,expectedChoiceRevision:0,acknowledge:true}]]);
  assert.equal(h.button("Withdraw my agreement"),undefined);
  assert.equal(h.pane.hasUnsavedChanges(),false);
  assert.match(h.text(), /An organizer still needs to review it/);
  await h.pane.load();
  assert.equal(h.checkbox().checked,false);
  assert.equal(h.button("Withdraw my agreement").disabled,true);
  await h.check();
  h.handler(async()=>withdrawn());
  await h.click("Withdraw my agreement");
  assert.deepEqual(h.posts().at(-1).body,
    {version:1,choice:"withdraw",reviewSha256:sha1,expectedChoiceRevision:1,acknowledge:true});
  assert.match(h.text(),/You withdrew your agreement for this offer/);
  assert.equal(h.pane.hasPendingCommand(),false);
}));
test("re-read clears the old acknowledgement and a first verified stale refusal needs a new review", () => mounted(async h => {
  await review(h);
  h.handler(async()=>own({reviewSha256:sha2}));
  await h.pane.load();
  assert.equal(h.checkbox().checked,false);
  await h.click("Save my agreement");
  assert.equal(h.posts().length,0);
  await h.check();
  h.handler(async()=>{ throw failure(409,"substitution_choice_changed"); });
  await h.click("Save my agreement");
  assert.equal(h.posts()[0].body.reviewSha256,sha2);
  assert.equal(h.pane.hasPendingCommand(),false);
  assert.equal(h.button("Save my agreement"),undefined);
  assert.match(h.text(),/The offer changed. Read it again/);
}));
test("lost response, GET, malformed result and later conflict retain exactly the same current-tab request", () => mounted(async h => {
  await review(h);
  let posts=0;
  h.handler(async(_p,o)=>{
    if (o.method!=="POST") return accepted();
    if (++posts===1) throw Error("Interrupted");
    if (posts===2) return {...accepted(),counterpart:"private-person"};
    if (posts===3) throw failure(409,"substitution_choice_changed");
    return accepted({}, {replayed:true});
  });
  await h.click("Save my agreement");
  assert.equal(h.pane.hasPendingCommand(),true);
  await h.pane.load();
  assert.equal(posts,1);
  assert.equal(h.pane.hasPendingCommand(),true);
  assert.equal(h.button("Withdraw my agreement"),undefined);
  for (let i=0;i<3;i++) await h.click("Retry the same choice");
  assert.equal(posts,4);
  assert.equal(new Set(h.posts().map(c=>c.wire)).size,1);
  assert.equal(new Set(h.posts().map(c=>c.body)).size,1);
  assert.equal(h.pane.hasPendingCommand(),false);
  assert.doesNotMatch(h.text(),/private-person|Private response data/);
}));
test("expired replay settles the original agreement without a new save", () => mounted(async h => {
  await review(h);
  let calls=0;
  h.handler(async()=>{ if (++calls===1) throw Error("Interrupted"); return expired({}, {replayed:true}); });
  await h.click("Save my agreement");
  await h.click("Retry the same choice");
  assert.equal(h.pane.hasPendingCommand(),false);
  assert.match(h.text(),/earlier agreement was recorded and has expired/);
  assert.equal(h.button("Withdraw my agreement"),undefined);
}));
test("stop retrying is acknowledged locally and requires a fresh read for future actions", () => mounted(async h => {
  await review(h);
  h.handler(async()=>{ throw Error("Interrupted"); });
  await h.click("Save my agreement");
  assert.equal(h.button("Stop retrying this choice").disabled,true);
  await h.click("Stop retrying this choice");
  assert.equal(h.pane.hasPendingCommand(),true);
  await h.check();
  const count=h.calls.length;
  await h.click("Stop retrying this choice");
  assert.equal(h.calls.length,count);
  assert.equal(h.pane.hasUnsavedChanges(),false);
  assert.equal(h.button("Save my agreement"),undefined);
  assert.match(h.text(),/Read the offer to check its current state/);
}));
test("pause aborts work, hides private details and requires a new own read before Retry", () => mounted(async h => {
  await review(h);
  let reject;
  h.handler(()=>new Promise((_resolve,refuse)=>reject=refuse));
  const pending=h.click("Save my agreement");
  await Promise.resolve();
  const sent=h.posts()[0];
  assert.ok(sent);
  h.pane.pause();
  assert.equal(sent.signal.aborted,true);
  assert.equal(h.text(),"");
  reject(failure(401,"session"));
  await pending;
  assert.deepEqual(h.accessLost,[]);
  assert.equal(h.pane.hasPendingCommand(),true);
  h.handler(async(_p,o)=>o.method==="POST" ? accepted({}, {replayed:true}) : own());
  await h.pane.load();
  await h.click("Retry the same choice");
  assert.equal(h.posts()[1].wire,sent.wire);
  assert.equal(h.pane.hasPendingCommand(),false);
}));
test("authorization loss erases uncertain commands and closes the pane", () => mounted(async h => {
  await review(h);
  h.handler(async()=>{ throw Error("Interrupted"); });
  await h.click("Save my agreement");
  h.handler(async()=>{ throw failure(403,"participant_verification"); });
  await h.click("Retry the same choice");
  assert.deepEqual(h.accessLost,[403]);
  assert.equal(h.pane.hasUnsavedChanges(),false);
  assert.equal(h.text(),"");
  const count=h.calls.length;
  await h.pane.load();
  assert.equal(h.calls.length,count);
}));
test("pagehide with in-flight POST clears the private tab and cancels the transport", () => mounted(async h => {
  await review(h);
  let resolve;
  h.handler(()=>new Promise(done=>resolve=done));
  const sent=h.click("Save my agreement");
  await Promise.resolve();
  const current=h.posts()[0];
  await h.dom.window.emit("pagehide");
  assert.equal(current.signal.aborted,true);
  assert.equal(h.pane.hasPendingCommand(),false);
  resolve(accepted());
  await sent;
  assert.equal(h.text(),"");
  assert.equal(h.pane.hasUnsavedChanges(),false);
}));
test("unavailable offer clears old details and sends no follow-up requests", () => mounted(async h => {
  await review(h);
  h.handler(async()=>{ throw failure(404,"substitution_unavailable"); });
  await h.pane.load();
  assert.doesNotMatch(h.text(), /Workshop shift|Private response data/);
  assert.match(h.text(), /This shift substitution offer is unavailable/);
  assert.equal(h.button("Read shift substitution offer"),undefined);
  assert.equal(h.pane.hasPendingCommand(),false);
  const count=h.calls.length;
  await h.pane.load();
  assert.equal(h.calls.length,count);
}));
test("a delayed global mutation loses authority when the current portal scope closes", () => {
  let enter;
  return mounted(async h => {
    await review(h);
    const task=h.click("Save my agreement");
    h.deactivate();
    await enter();
    await task;
    assert.equal(h.posts().length,0);
    assert.equal(h.text(),"");
    assert.equal(h.pane.hasPendingCommand(),false);
  },{runMutation:fn=>new Promise(resolve=>{enter=async()=>{await fn();resolve();};})});
});
test("closed response validator rejects private extras, coercions, impossible time and status", () => {
  assert.equal(checkedOwnSubstitutionChoice(own()).ok,true);
  assert.equal(checkedOwnSubstitutionChoice(withdrawn()).ok,true);
  for (const value of [
    own({party:"counterpart"}), own({reviewSha256:[sha]}), own({choiceRevision:"0"}), own({state:["unanswered"]}),
    own({canAccept:1}), own({linkId:"a".repeat(32)}), own({}, {intentId:"private"}),
    own({shift:{...shift,counterpart:"private-person"}}), own({shift:{...shift,timeZone:"Fictional/Zone"}}),
    own({shift:{...shift,startAt:"2026-02-31T15:00:00Z"}}), own({shift:{...shift,endAt:shift.startAt}}),
    own({shift:{...shift,startAt:"2026-11-10T10:00:00-04:00"}}),
    own({offerExpiresAtExact:"2026-11-31T10:00:00.123456Z"}), accepted({expiresAtExact:savedAt}),
    accepted({expiresAtExact:"2026-12-09T13:00:00.123456Z"}),
    withdrawn({withdrawnAtExact:"2026-11-09T13:10:00.123456Z"}),
  ]) assert.throws(()=>checkedOwnSubstitutionChoice(value));
});
test("an acceptance for a different shift or party stays uncertain and is never displayed", () => mounted(async h => {
  await review(h);
  h.handler(async()=>accepted({shift:{...shift,title:"Other shift"},party:"joining"}));
  await h.click("Save my agreement");
  assert.equal(h.pane.hasPendingCommand(),true);
  assert.doesNotMatch(h.text(), /Other shift|Offer to take the place/);
  assert.match(h.text(), /The save response is uncertain/);
}));
