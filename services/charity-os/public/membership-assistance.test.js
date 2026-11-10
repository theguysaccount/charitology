import assert from "node:assert/strict";
import { setImmediate as flush } from "node:timers/promises";
import test from "node:test";
import { learningTestDOM } from "./learning-test-dom.js";
import { mountMembershipAssistance } from "./membership-assistance.js";

const orgId = "fictional-workspace", memberId = "fictional-member", termId = "fictional-term", caseId = "fictional-case";
const base = "/api/orgs/" + orgId + "/membership-assistance";
const memberPath = base + "/members/" + memberId, casePath = base + "/cases/" + caseId;
const member = {id:memberId,title:"Fictional member",revision:4,startDate:"2026-01-01",endDate:"2026-12-31",renewalDate:"2026-11-01"};
const term = {id:termId,title:"Fictional successor",revision:7,startDate:"2027-01-01",endDate:"2027-12-31",renewalDate:"2027-11-01"};
const review = {member,term,noticeRevision:1,reviewSha256:"b".repeat(64)};
const confirmReview = {...review,reviewSha256:"c".repeat(64)};
const witnessedAtExact = "2026-11-09T17:31:00.000002Z", actedAtExact = "2026-11-09T17:42:00.000004Z";
const notice = "Renew my membership for the dates shown. This term is free to renew. I can ask staff in person to withdraw my choice until they confirm the renewal.";
const retryLabel = "Retry the same change", startLabel = "Choose an approved term";
const saved = (state, extra = {}) => {
  const active = state === "pending";
  return {id:caseId,memberId,termId,state,revision:active ? 1 : 2,
    witnessedAtExact:state === "withdrawn" ? null : witnessedAtExact,actedAtExact:active ? null : actedAtExact,
    result:state === "confirmed" ? {memberRevision:5,startDate:member.startDate,endDate:term.endDate,renewalDate:term.renewalDate} : null,
    review:active ? {...review,reviewSha256:null} : null,canConfirm:false,canWithdraw:active,...extra};
};
const envelope = (item,replayed = false) => ({ok:true,version:1,case:item,replayed});
const caseList = (item,canStart = !item) => ({ok:true,version:1,canStart,cases:item ? [
  {id:item.id,memberId:item.memberId,termId:item.termId,state:item.state,revision:item.revision},
] : []});
const failure = (status,code,message = "The service refused this action.") => Object.assign(new Error(message),{status,code});

function fixture(t,options,dom = learningTestDOM()) {
  t.after(() => dom.restore());
  const node = (tag,attrs = {},...children) => {
    const element = dom.document.createElement(tag);
    for (const [name,value] of Object.entries(attrs)) {
      if (typeof value === "boolean") element[name] = value;
      else element.setAttribute(name,value);
    }
    element.append(...children.flat(Infinity));
    return element;
  };
  const host = dom.mount(node("section"));
  const control = mountMembershipAssistance(host,{orgId,memberId,node,current:() => true,
    loadTerms:async () => [{id:termId,title:term.title,revision:term.revision}],...options});
  t.after(control.dispose);
  const button = label => host.querySelectorAll("button").find(element => element.textContent === label);
  return {host,button,control,
    async click(label,acknowledge = false) {
      const target = button(label);
      assert.ok(target,"Missing control " + label);
      if (acknowledge) {
        const siblings = target.parentElement.children;
        const check = siblings[siblings.indexOf(target)-1]?.querySelector("input");
        assert.ok(check,"Missing explicit acknowledgement for " + label);
        check.checked = true;
      }
      await target.click();
      await flush();
    },
    async wait(text) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (host.textContent.includes(text)) return;
        await flush();
      }
      assert.fail("Missing mounted text " + text + " in " + host.textContent);
    },
    select() {
      const input = host.querySelector('select[aria-label="Approved renewal term"]');
      assert.ok(input);
      assert.ok(input.children.some(option => option.value === termId));
      input.value = termId;
    },
  };
}
const writeFields = body => Object.keys(body).sort();

test("witness and independent confirmation show the exact notice and preserve one byte-identical Retry",async t => {
  let item = null, confirmed = 0;
  const calls = [];
  const transport = actor => async (path,{method="GET",body} = {}) => {
    calls.push({actor,path,method,body,wire:JSON.stringify(body)});
    if (path === memberPath) return caseList(item);
    if (path === base+"/review") return {ok:true,version:1,review};
    if (path === base+"/cases") { item = saved("pending"); return envelope(item); }
    if (path === casePath) {
      const current = item.state === "pending" && actor === "reviewer"
        ? {...item,review:confirmReview,canConfirm:true} : item;
      return envelope(current);
    }
    if (path === casePath+"/confirm") {
      if (confirmed) return envelope(item,true);
      confirmed++;
      item = saved("confirmed");
      throw failure(0,"connection_interrupted");
    }
    assert.fail("Unexpected route " + path);
  };
  const dom = learningTestDOM(), recorder = fixture(t,{request:transport("recorder")},dom);
  await recorder.wait(startLabel);
  assert.match(recorder.host.textContent,/organization’s in-person identity check and withdrawal process/);
  assert.match(recorder.host.textContent,/another authorized staff member to handle your own membership/);
  await recorder.click(startLabel);
  recorder.select();
  await recorder.click("Review selected term");
  await recorder.wait(notice);
  assert.match(recorder.host.textContent,/revision 7. 2027-01-01 through 2027-12-31/);
  assert.deepEqual(calls[1].body,{version:1,memberId,termId});
  await recorder.click("Record witnessed choice");
  await recorder.wait("Acknowledge this action before continuing.");
  assert.equal(calls.length,2);
  await recorder.click("Record witnessed choice",true);
  await recorder.wait("Pending choice");
  assert.equal(recorder.button("Confirm renewal"),undefined);
  assert.deepEqual(writeFields(calls[2].body),
    ["acknowledge","idempotencyKey","memberId","noticeRevision","reviewSha256","termId","version"]);
  assert.equal(calls[2].body.noticeRevision,1);
  assert.equal(calls[2].body.reviewSha256,review.reviewSha256);
  recorder.control.dispose();

  const updates = [], observed = [];
  const confirmer = fixture(t,{request:transport("reviewer"),onChanged:item => updates.push(item.state),
    onObserved:item => observed.push(item.state)},dom);
  await confirmer.wait("Open case");
  await confirmer.click("Open case");
  await confirmer.wait(notice);
  await confirmer.click("Confirm renewal",true);
  await confirmer.wait(retryLabel);
  assert.equal(confirmed,1);
  assert.equal(confirmer.button("Confirm renewal"),undefined);
  await confirmer.click("Read saved cases");
  await confirmer.wait("Renewal confirmed");
  assert.ok(confirmer.button(retryLabel));
  assert.deepEqual(updates,[]);
  await confirmer.click("Open case");
  await confirmer.wait("Recorded coverage");
  assert.deepEqual(observed,["pending","confirmed"]);
  assert.ok(confirmer.button(retryLabel));
  await confirmer.click(retryLabel);
  await confirmer.wait("The earlier change was already recorded.");
  assert.match(confirmer.host.textContent,/Recorded coverage 2026-01-01 through 2027-12-31/);
  const posts = calls.filter(call => call.path === casePath+"/confirm");
  assert.equal(posts.length,2);
  assert.equal(posts[0].wire,posts[1].wire);
  assert.equal(posts[0].body.reviewSha256,confirmReview.reviewSha256);
  assert.deepEqual(updates,["confirmed"]);
  assert.equal(confirmer.button(retryLabel),undefined);
});

test("a paused stale review can withdraw with explicit assent and an exact rate-limited Retry",async t => {
  const pending = saved("pending",{review:null}), calls = [];
  let withdraws = 0;
  const pane = fixture(t,{async request(path,{body} = {}) {
    if (path === memberPath) return caseList(pending,false);
    if (path === casePath) return envelope(pending);
    assert.equal(path,casePath+"/withdraw");
    calls.push(JSON.stringify(body));
    assert.deepEqual(writeFields(body),["acknowledge","idempotencyKey","revision","version"]);
    if (++withdraws === 1) throw failure(429,"rate");
    return envelope(saved("withdrawn"));
  }});
  await pane.wait("New in-person reviews are unavailable");
  assert.equal(pane.button(startLabel),undefined);
  await pane.click("Open case");
  assert.equal(pane.button("Confirm renewal"),undefined);
  assert.doesNotMatch(pane.host.textContent,/In-person renewal notice/);
  await pane.click("Withdraw pending choice");
  assert.equal(withdraws,0);
  await pane.click("Withdraw pending choice",true);
  await pane.wait(retryLabel);
  await pane.click(retryLabel);
  await pane.wait("Choice withdrawn");
  assert.deepEqual(calls,[calls[0],calls[0]]);
  assert.doesNotMatch(pane.host.textContent,/Choice recorded|Fictional successor/);
});

test("Trash uses a fresh case read and only offers withdrawal even if the record is restored elsewhere",async t => {
  const pending = saved("pending",{review:confirmReview,canConfirm:true}), calls = [];
  let reads = 0;
  const pane = fixture(t,{closureOnly:true,async request(path,{body} = {}) {
    calls.push(path);
    if (path === memberPath) return caseList(++reads === 1 ? null : pending,true);
    if (path === casePath) return envelope(pending);
    assert.equal(path,casePath+"/withdraw");
    assert.equal(body.revision,1);
    return envelope(saved("withdrawn"));
  }});
  await pane.wait("No in-person renewal case is recorded");
  assert.equal(pane.button(startLabel),undefined);
  await pane.click("Read saved cases");
  await pane.click("Open case");
  assert.equal(pane.button("Confirm renewal"),undefined);
  await pane.click("Withdraw pending choice",true);
  await pane.wait("Choice withdrawn");
  assert.deepEqual(calls,[memberPath,memberPath,casePath,casePath+"/withdraw"]);
});

test("an uncertain write survives an ordinary read refusal, but its own stale refusal requires a fresh read",async t => {
  let reads = 0, attempts = 0;
  const pending = saved("pending",{review:confirmReview,canConfirm:true}), wire = [];
  const pane = fixture(t,{async request(path,{body} = {}) {
    if (path === memberPath) {
      if (++reads === 2) throw failure(409,"membership_assistance_changed","The saved list changed.");
      return caseList(pending,false);
    }
    if (path === casePath) return envelope(pending);
    assert.equal(path,casePath+"/confirm");
    wire.push(JSON.stringify(body));
    if (++attempts === 1) throw failure(502,"invalid_response");
    throw failure(409,"membership_assistance_changed","This case review changed.");
  }});
  await pane.wait("Open case");
  await pane.click("Open case");
  await pane.click("Confirm renewal",true);
  await pane.wait(retryLabel);
  await pane.click("Read saved cases");
  assert.ok(pane.button(retryLabel));
  await pane.click(retryLabel);
  await pane.wait("Read saved cases before making another change.");
  assert.deepEqual(wire,[wire[0],wire[0]]);
  assert.equal(pane.button(retryLabel),undefined);
  assert.doesNotMatch(pane.host.textContent,/Fictional successor|2027-12-31/);
  await pane.click("Read saved cases");
  await pane.wait("Open case");
});

test("scope loss clears private details, pending Retry and detached actions",async t => {
  const calls = [], denied = [], pending = saved("pending",{review:confirmReview,canConfirm:true});
  const pane = fixture(t,{onAccessLost:error => denied.push(error.status),async request(path) {
    calls.push(path);
    if (path === memberPath) return caseList(pending,false);
    if (path === casePath) return envelope(pending);
    if (calls.length === 3) throw failure(0,"connection_interrupted");
    throw failure(404,"membership_assistance_unavailable");
  }});
  await pane.wait("Open case");
  await pane.click("Open case");
  const stale = pane.button("Confirm renewal");
  await pane.click("Confirm renewal",true);
  await pane.wait(retryLabel);
  await pane.click(retryLabel);
  await pane.wait("This in-person renewal review is unavailable.");
  assert.deepEqual(denied,[404]);
  assert.doesNotMatch(pane.host.textContent,/Fictional member|2027-12-31|In-person renewal notice|Retry the same change/);
  assert.equal(stale.isConnected,false);
  await stale.click();
  await flush();
  assert.equal(calls.length,4);
});

test("a delayed mutation wrapper or disposed pane cannot send a command",async t => {
  let scope = true, resolve, wrapperEntered = false;
  const gate = new Promise(done => { resolve = done; }), calls = [];
  const pane = fixture(t,{current:() => scope,async runMutation(work) {
    wrapperEntered = true;
    await gate;
    return work();
  },async request(path) {
    calls.push(path);
    if (path === memberPath) return caseList(null,true);
    if (path === base+"/review") return {ok:true,version:1,review};
    assert.fail("A stale pane sent a mutation.");
  }});
  await pane.wait(startLabel);
  await pane.click(startLabel);
  pane.select();
  await pane.click("Review selected term");
  await pane.click("Record witnessed choice",true);
  assert.equal(wrapperEntered,true);
  scope = false;
  resolve();
  await flush();
  assert.deepEqual(calls,[memberPath,base+"/review"]);
  assert.equal(pane.host.textContent,"");
});

test("cross-member and oversized case lists fail closed",async t => {
  const foreign = saved("pending",{memberId:"fictional-other-member"});
  let calls = 0;
  const pane = fixture(t,{async request() {
    if (++calls === 1) return caseList(foreign,true);
    const item = caseList(saved("pending"),true).cases[0];
    return {ok:true,version:1,canStart:true,cases:Array.from({length:33},(_,index) => ({...item,id:"fictional-case-"+index}))};
  }});
  await pane.wait("The saved in-person renewal review could not be verified.");
  await pane.click("Read saved cases");
  assert.equal(calls,2);
  assert.equal(pane.button("Open case"),undefined);
  assert.equal(pane.button(startLabel),undefined);
});
