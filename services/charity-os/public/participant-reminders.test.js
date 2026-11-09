// Mounted client + fictional responses; no browser, authentication or delivery claim.
import test from "node:test";
import assert from "node:assert/strict";
import { learningTestDOM } from "./learning-test-dom.js";
import { checkedOwnReminder, createOwnReminderPane } from "./participant-reminders.js";
const sha = "a".repeat(64), atExact = "2026-11-08T10:00:00.123456Z";
const own = (patch = {}, outer = {}) => ({ok:true,participationId:"entry",revision:4,intakeRevision:3,reminder:{version:"participation-reminder-v1",enabled:false,revision:0,atExact:null,currentCommitmentSha256:sha,canEnable:true,canDisable:false,unavailableReason:null,...patch},...outer});
const saved = (body, patch = {}) => ({ok:true,participationId:"entry",revision:Math.min(2147483647,body.revision+1),intakeRevision:body.intakeRevision,reminder:{version:"participation-reminder-v1",enabled:body.enabled,revision:Math.min(2147483647,body.reminderRevision+1),atExact},auditRetained:true,replayed:false,...patch});
async function mounted(run, config = {}) {
  const dom = learningTestDOM(), calls = [], lost = [], dirties = [];
  let active = true, pins = {revision:4,intakeRevision:3}, handler = async () => own();
  const pane = createOwnReminderPane({orgId:"org",intakeId:"intake",participationId:"entry",getDisplayedPins:()=>pins,isCurrent:()=>active,onAccessLost:e=>lost.push(e.status),onDirty:v=>dirties.push(v),request:async(path,options={})=>{calls.push({path,method:options.method||"GET",wire:options.body?JSON.stringify(options.body):null,body:options.body?structuredClone(options.body):null});return handler(path,options);},...config});
  dom.mount(pane.element);
  const h = {pane,calls,lost,dirties,text:()=>pane.element.textContent,handler:fn=>handler=fn,pins:v=>pins=v,inactive:()=>active=false,all:()=>pane.element.querySelectorAll("button,input"),button:label=>pane.element.querySelectorAll("button").find(b=>b.textContent===label),
    async click(label) {const b=h.button(label);assert.ok(b,label);if(!b.disabled)await b.emit("click");},
    async check(index=0) {const c=pane.element.querySelectorAll("input")[index];assert.ok(c);assert.equal(c.disabled,false);c.checked=true;await c.emit("change");},dom};
  try {await run(h);} finally {pane.dispose();dom.restore();}
}
test("manual read has no automatic request and leaves the separate opt-in unchecked",()=>mounted(async h=>{
  assert.equal(h.calls.length,0);await h.click("Read reminder choice");assert.equal(h.calls.length,1);assert.equal(h.pane.element.querySelector("input").checked,false);assert.equal(h.button("Save reminder choice").disabled,true);assert.match(h.text(),/does not schedule an email/);
}));
test("only explicit opt-in sends exact current pins and a separate command key",()=>mounted(async h=>{
  await h.pane.load();await h.check();h.handler(async(_p,o)=>saved(o.body));await h.click("Save reminder choice");
  const c=h.calls.at(-1);assert.equal(c.path,"/api/participant/orgs/org/requests/intake/participations/entry/reminder-preference");assert.deepEqual(Object.keys(c.body),["version","revision","intakeRevision","reminderRevision","enabled","consentVersion","commandKey","commitmentSha256"]);assert.equal(c.body.enabled,true);assert.equal(c.body.commitmentSha256,sha);assert.match(c.body.commandKey,/^[a-f0-9-]{36}$/);assert.equal(h.pane.hasUnsavedChanges(),false);assert.equal(h.button("Save reminder choice"),undefined);assert.match(h.text(),/original save recorded/);
}));
test("a fresh read cannot authorize opt-in for details that the card has not displayed",()=>mounted(async h=>{
  h.handler(async()=>own({}, {revision:5}));await h.pane.load();assert.equal(h.button("Save reminder choice"),undefined);assert.match(h.text(),/Reload the saved request/);assert.equal(h.calls.filter(c=>c.method==="POST").length,0);
}));
test("displayed pins are checked again inside a delayed global mutation",()=>{
  let enter;
  return mounted(async h=>{await h.pane.load();await h.check();const task=h.click("Save reminder choice");h.pins({revision:5,intakeRevision:3});await enter();await task;assert.equal(h.calls.length,1);},{runMutation:fn=>new Promise(resolve=>{enter=async()=>{await fn();resolve();};})});
});
test("turning off remains possible after card changes and never sends a commitment hash",()=>mounted(async h=>{
  h.handler(async()=>own({enabled:true,revision:2,atExact,canEnable:false,canDisable:true}, {revision:6}));await h.pane.load();h.handler(async(_p,o)=>saved(o.body));await h.click("Turn off reminder");const b=h.calls.at(-1).body;assert.equal(b.enabled,false);assert.equal(b.revision,6);assert.equal(b.reminderRevision,2);assert.equal(Object.hasOwn(b,"commitmentSha256"),false);
}));
test("response loss, read, later429 and explicit retry preserve identical wire bytes",()=>mounted(async h=>{
  await h.pane.load();await h.check();let writes=0;h.handler(async(_p,o)=>{if(!o.method)return own({enabled:true,revision:1,atExact,canEnable:false,canDisable:true},{revision:5});if(++writes===1)throw Error("interrupted");if(writes===2)throw Object.assign(Error("rate"),{status:429});return saved(o.body,{replayed:true});});
  await h.click("Save reminder choice");assert.equal(writes,1);await h.pane.load();assert.equal(writes,1);assert.match(h.text(),/save is retained/);await h.click("Retry the same save");assert.match(h.text(),/save is retained/);await h.click("Retry the same save");const commands=h.calls.filter(c=>c.method==="POST");assert.equal(commands.length,3);assert.equal(new Set(commands.map(c=>c.wire)).size,1);assert.equal(h.button("Retry the same save"),undefined);assert.equal(h.pane.hasUnsavedChanges(),false);
}));
test("malformed successful responses and409 retain the command rather than create a new one",()=>mounted(async h=>{
  await h.pane.load();await h.check();h.handler(async(_p,o)=>saved(o.body,{recipientSha256:sha}));await h.click("Save reminder choice");assert.ok(h.button("Retry the same save"));h.handler(async()=>{throw Object.assign(Error("conflict"),{status:409});});await h.click("Retry the same save");assert.match(h.text(),/could not be reconciled/);assert.equal(h.pane.hasUnsavedChanges(),true);assert.equal(new Set(h.calls.filter(c=>c.wire).map(c=>c.wire)).size,1);
}));
test("stopping retry requires its own acknowledgment, clears local authority and sends nothing",()=>mounted(async h=>{
  await h.pane.load();await h.check();h.handler(async()=>{throw Error("interrupted");});await h.click("Save reminder choice");const count=h.calls.length;assert.equal(h.button("Stop retrying this save").disabled,true);await h.click("Stop retrying this save");assert.ok(h.button("Retry the same save"));await h.check(1);await h.click("Stop retrying this save");assert.equal(h.calls.length,count);assert.equal(h.pane.hasUnsavedChanges(),false);assert.equal(h.button("Save reminder choice"),undefined);assert.match(h.text(),/did not undo a saved choice/);
}));
test("a failed read invalidates previous save authority without exposing server error text",()=>mounted(async h=>{
  await h.pane.load();await h.check();h.handler(async()=>{throw Error("private SQL or provider response");});await h.pane.load();assert.equal(h.button("Save reminder choice"),undefined);assert.doesNotMatch(h.text(),/private SQL/);assert.equal(h.pane.hasUnsavedChanges(),false);
}));
test("pause clears private DOM, retains uncertain save, and read admits explicit same-save retry",()=>mounted(async h=>{
  await h.pane.load();await h.check();let reject;h.handler(()=>new Promise((_r,j)=>reject=j));const task=h.click("Save reminder choice");h.pane.pause();reject(Object.assign(Error("obsolete404"),{status:404}));await task;assert.equal(h.text(),"");assert.equal(h.pane.hasUnsavedChanges(),true);assert.deepEqual(h.lost,[]);
  h.handler(async(_p,o)=>o.method?saved(o.body,{replayed:true}):own());await h.pane.load();await h.click("Retry the same save");assert.equal(h.pane.hasUnsavedChanges(),false);assert.equal(new Set(h.calls.filter(c=>c.wire).map(c=>c.wire)).size,1);
}));
test("current access loss disposes the pane and clears all command authority",()=>mounted(async h=>{
  await h.pane.load();await h.check();h.handler(async()=>{throw Object.assign(Error("denied"),{status:403});});await h.pane.load();assert.deepEqual(h.lost,[403]);assert.equal(h.text(),"");assert.equal(h.pane.hasUnsavedChanges(),false);await h.pane.load();assert.equal(h.calls.length,2);
}));
test("late inactive access failure cannot invoke the parent callback",()=>mounted(async h=>{
  let reject;h.handler(()=>new Promise((_r,j)=>reject=j));const task=h.pane.load();h.inactive();reject(Object.assign(Error("denied"),{status:401}));await task;assert.deepEqual(h.lost,[]);
}));
test("pagehide aborts pending reads and prevents late private rendering",()=>mounted(async h=>{
  let release;h.handler(()=>new Promise(r=>release=r));const task=h.pane.load();await h.dom.window.emit("pagehide");release(own());await task;assert.equal(h.text(),"");assert.equal(h.pane.hasUnsavedChanges(),false);
}));
test("accepted original result is distinct from a later loaded saved choice",()=>mounted(async h=>{
  await h.pane.load();await h.check();h.handler(async(_p,o)=>saved(o.body,{auditRetained:false,replayed:true}));await h.click("Save reminder choice");h.handler(async()=>own({enabled:false,revision:2,atExact,canEnable:true},{revision:6}));await h.pane.load();assert.match(h.text(),/Saved reminder choice: off/);assert.match(h.text(),/original save recorded the reminder choice as on/);assert.match(h.text(),/journal entry was not retained/);
}));
test("terminal OFF response can saturate both revisions without integer wrap",()=>mounted(async h=>{
  h.handler(async()=>own({enabled:true,revision:2147483647,atExact,canEnable:false,canDisable:true},{revision:2147483647}));await h.pane.load();h.handler(async(_p,o)=>saved(o.body));await h.click("Turn off reminder");assert.equal(h.button("Retry the same save"),undefined);assert.match(h.text(),/choice as off/);
}));
test("closed DTO validation rejects authority leaks, nonstring hashes and impossible SQL timestamps",()=>{
  assert.equal(checkedOwnReminder(own(),"entry").ok,true);
  for(const value of [own({}, {recipientSha256:sha}),own({currentCommitmentSha256:[sha]}),own({canEnable:true,currentCommitmentSha256:null}),own({revision:1,atExact:"2026-02-30T10:00:00.123456Z"}),own({revision:1,atExact:"0000-12-08T10:00:00.123456Z"}),own({enabled:true,canDisable:true}),own({unavailableReason:"raw SQL"})])assert.throws(()=>checkedOwnReminder(value,"entry"));
});
