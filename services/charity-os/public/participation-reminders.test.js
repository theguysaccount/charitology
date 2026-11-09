// Mounted staff controller + fictional transport. No real authority, SQL or mail.
import test from "node:test";
import assert from "node:assert/strict";
import { learningTestDOM } from "./learning-test-dom.js";
import { createStaffReminderPane, reminderReviewTemplate } from "./participation-reminders.js";
import { renderParticipationReminderTemplate } from "../lib/participation-reminder-template.mjs";
const portalUrl="https://os.example.invalid/participant",sha="a".repeat(64);
const target={moduleId:"events",targetId:"event",targetRevision:2,sourceRevision:7,title:"Fictional community session"};
const candidates=n=>Array.from({length:n},(_,i)=>({participationId:"person_"+String(i).padStart(4,"0"),revision:4,intakeRevision:3,label:"Fictional participant "+i}));
const preview=input=>({ok:true,previewId:"preview",expiresAtExact:"2026-12-08T10:10:00.000000Z",review:{template:renderParticipationReminderTemplate(portalUrl),bestEffort:true,items:input.participations.map(p=>({participationId:p.participationId,range:{startAt:"2026-12-10T10:00:00Z",endAt:"2026-12-10T11:00:00Z",timeZone:"UTC"},dueAtExact:"2026-12-09T10:00:00.000000Z"}))}});
const accepted=review=>({ok:true,previewId:review.previewId,scheduledCount:review.review.items.length,replayed:false,scheduled:review.review.items.map((p,i)=>({participationId:p.participationId,outboxId:"outbox_"+i,commitmentSha256:sha,dueAtExact:p.dueAtExact}))});
async function mounted(run,{count=2,...options}={}) {
  const dom=learningTestDOM(),calls=[],dirty=[],changes=[];let active=true,handler=async(_p,o)=>preview(o.body);
  const pane=createStaffReminderPane({orgId:"org",target,candidates:candidates(count),portalUrl,admin:true,isCurrent:()=>active,onDirty:v=>dirty.push(v),onChanged:()=>changes.push(true),request:async(path,options)=>{calls.push({path,body:structuredClone(options.body),wire:JSON.stringify(options.body)});return handler(path,options);},...options});dom.mount(pane.element);
  const h={pane,calls,dirty,changes,dom,handler:f=>handler=f,inactive:()=>active=false,text:()=>pane.element.textContent,button:label=>pane.element.querySelectorAll("button").find(b=>b.textContent===label),
    async click(label){const b=h.button(label);assert.ok(b,label);if(!b.disabled)await b.emit("click");},
    async select(pid,enabled=true){const c=pane.element.querySelectorAll("input").find(c=>c.getAttribute("data-reminder-person")===pid);assert.ok(c,pid);assert.equal(c.disabled,false);c.checked=enabled;await c.emit("change");},
    async ack(){const c=pane.element.querySelectorAll("input").find(c=>!c.getAttribute("data-reminder-person"));assert.ok(c);assert.equal(c.disabled,false);c.checked=true;await c.emit("change");},
    async prepare(){await h.select("person_0000");await h.click("Preview selected reminders");await h.ack();}};
  try{await run(h);}finally{pane.dispose();dom.restore();}
}
test("staff starts with no selected audience, no read or schedule, and requires explicit preview",()=>mounted(async h=>{
  assert.equal(h.calls.length,0);assert.equal(h.button("Preview selected reminders").disabled,true);assert.equal(h.pane.element.querySelectorAll("input").some(c=>c.checked),false);assert.equal(h.button("Schedule these reminders"),undefined);
}));
test("explicit selection previews exact current revisions and displays actual message as text",()=>mounted(async h=>{
  await h.select("person_0001");await h.click("Preview selected reminders");assert.deepEqual(h.calls[0].body,{version:1,target:{moduleId:"events",targetId:"event",targetRevision:2,sourceRevision:7},participations:[{participationId:"person_0001",revision:4,intakeRevision:3}]});assert.match(h.text(),/Reminder: review your participation/);assert.match(h.text(),/2026-12-09T10:00:00.000000Z/);assert.match(h.text(),/<h1>Reminder/);assert.equal(h.pane.element.querySelector("h1"),null);assert.equal(h.button("Schedule these reminders").disabled,true);assert.equal(h.calls.length,1);
}));
test("schedule requires separate review acknowledgment and labels its original result without delivery claim",()=>mounted(async h=>{
  await h.prepare();const review=preview(h.calls[0].body);h.handler(async()=>accepted(review));await h.click("Schedule these reminders");assert.deepEqual(Object.keys(h.calls[1].body),["previewId","commandKey"]);assert.match(h.calls[1].body.commandKey,/^[a-f0-9-]{36}$/);assert.equal(h.pane.hasPendingCommand(),false);assert.equal(h.pane.hasUnsavedChanges(),false);assert.equal(h.changes.length,1);assert.match(h.text(),/original command scheduled 1 reminder/);assert.match(h.text(),/not delivery confirmation/);
}));
test("a changed audience invalidates the prior message review and acknowledgment",()=>mounted(async h=>{
  await h.prepare();await h.select("person_0001");assert.equal(h.button("Schedule these reminders"),undefined);assert.match(h.text(),/2 explicitly selected/);assert.equal(h.calls.length,1);
}));
test("paging makes every loaded candidate reachable while retaining explicit choices",()=>mounted(async h=>{
  assert.equal(h.pane.element.querySelectorAll("input").length,20);await h.select("person_0000");await h.click("Next reminder candidates");assert.equal(h.pane.element.querySelectorAll("input").length,7);await h.select("person_0026");await h.click("Preview selected reminders");assert.deepEqual(h.calls[0].body.participations.map(p=>p.participationId),["person_0000","person_0026"]);await h.click("Previous reminder candidates");assert.equal(h.pane.element.querySelectorAll("input").find(c=>c.getAttribute("data-reminder-person")==="person_0000").checked,true);
},{count:27}));
test("audience bound20 prevents an accidental21st selection",()=>mounted(async h=>{
  for(let i=0;i<20;i++)await h.select("person_"+String(i).padStart(4,"0"));await h.click("Next reminder candidates");assert.equal(h.pane.element.querySelectorAll("input").every(c=>c.disabled),true);assert.match(h.text(),/20 explicitly selected/);await h.click("Preview selected reminders");assert.equal(h.calls[0].body.participations.length,20);
},{count:21}));
test("unknown scheduling response, refresh,429 and replay preserve exact same command bytes",()=>mounted(async h=>{
  await h.prepare();const review=preview(h.calls[0].body);let writes=0;h.handler(async()=>{if(++writes===1)throw Error("response interrupted");if(writes===2)throw Object.assign(Error("rate"),{status:429});return {...accepted(review),replayed:true};});await h.click("Schedule these reminders");h.pane.pause();h.pane.setCandidates(candidates(2),target);h.pane.resume();assert.equal(writes,1);assert.match(h.text(),/command is retained/);await h.click("Retry the same schedule");assert.match(h.text(),/command is retained/);await h.click("Retry the same schedule");const sends=h.calls.filter(c=>c.path.endsWith("/schedule"));assert.equal(sends.length,3);assert.equal(new Set(sends.map(c=>c.wire)).size,1);assert.equal(h.pane.hasPendingCommand(),false);
}));
test("malformed schedule success retains the command and never calls onChanged",()=>mounted(async h=>{
  await h.prepare();const review=preview(h.calls[0].body);h.handler(async()=>({...accepted(review),scheduled:[{...accepted(review).scheduled[0],participationId:"someone_else"}]}));await h.click("Schedule these reminders");assert.equal(h.pane.hasPendingCommand(),true);assert.equal(h.changes.length,0);assert.ok(h.button("Retry the same schedule"));
}));
test("malformed preview cannot acquire schedule authority or run supplied HTML",()=>mounted(async h=>{
  await h.select("person_0000");h.handler(async(_p,o)=>{const v=preview(o.body);v.review.template.url="https://evil.example/participant";return v;});await h.click("Preview selected reminders");assert.equal(h.button("Schedule these reminders"),undefined);assert.match(h.text(),/could not be previewed/);assert.equal(h.pane.hasPendingCommand(),false);
}));
test("stopping retry is separately acknowledged and does not issue cancellation or a new schedule",()=>mounted(async h=>{
  await h.prepare();h.handler(async()=>{throw Error("unknown");});await h.click("Schedule these reminders");assert.equal(h.button("Stop retrying this schedule").disabled,true);const count=h.calls.length;await h.ack();await h.click("Stop retrying this schedule");assert.equal(h.calls.length,count);assert.equal(h.pane.hasPendingCommand(),false);assert.equal(h.pane.hasUnsavedChanges(),false);assert.match(h.text(),/Scheduled reminders were not cancelled/);h.pane.resume();assert.equal(h.button("Preview selected reminders"),undefined);h.pane.setCandidates(candidates(2),target);h.pane.resume();assert.equal(h.button("Preview selected reminders").disabled,true);
}));
test("stale paused completion cannot remove an uncertain command or reveal private context",()=>mounted(async h=>{
  await h.prepare();let reject;h.handler(()=>new Promise((_r,j)=>reject=j));const task=h.click("Schedule these reminders");h.pane.pause();reject(Object.assign(Error("obsolete403"),{status:403}));await task;assert.equal(h.text(),"");assert.equal(h.pane.hasPendingCommand(),true);h.pane.resume();assert.equal(h.text(),"");
}));
test("new candidate revisions invalidate unsaved review but cannot silently replace a retained command",()=>mounted(async h=>{
  await h.prepare();h.pane.setCandidates(candidates(2).map(p=>({...p,revision:5})),target);assert.equal(h.button("Schedule these reminders"),undefined);assert.equal(h.pane.hasUnsavedChanges(),false);
}));
test("pagehide clears private DOM and dispose prevents late preview rendering",()=>mounted(async h=>{
  await h.select("person_0000");let release;h.handler((_p,o)=>new Promise(r=>release=()=>r(preview(o.body))));const task=h.click("Preview selected reminders");await h.dom.window.emit("pagehide");h.pane.dispose();release();await task;assert.equal(h.text(),"");assert.equal(h.pane.hasPendingCommand(),false);
}));
test("construction refuses a nonadmin or mixed/duplicated candidate context",()=>{
  const dom=learningTestDOM();try{const config={orgId:"org",target,candidates:candidates(2),portalUrl,admin:true,request:async()=>{}};assert.throws(()=>createStaffReminderPane({...config,admin:false}));assert.throws(()=>createStaffReminderPane({...config,candidates:[candidates(1)[0],candidates(1)[0]]}));assert.throws(()=>createStaffReminderPane({...config,portalUrl:portalUrl+"?"}));}finally{dom.restore();}
});
test("browser review copy matches the canonical server template at supported clean origins",()=>{
  for(const origin of ["https://os.example.invalid","https://charitology.org","https://xn--bcher-kva.example"])
    assert.deepEqual(reminderReviewTemplate(origin+"/participant"),renderParticipationReminderTemplate(origin+"/participant"));
});
test("changed text or HTML with valid headers cannot acquire schedule authority",()=>mounted(async h=>{
  await h.select("person_0000");for(const field of ["text","html"]){h.handler(async(_p,o)=>{const value=preview(o.body);value.review.template={...value.review.template,[field]:"Changed email body"};return value;});await h.click("Preview selected reminders");assert.equal(h.button("Schedule these reminders"),undefined);}assert.equal(h.calls.length,2);
}));
test("inconsistent named-zone offsets and year-zero SQL stamps cannot be reviewed",()=>mounted(async h=>{
  await h.select("person_0000");h.handler(async(_p,o)=>{const value=preview(o.body);value.review.items[0].range={startAt:"2026-12-10T10:00:00+14:00",endAt:"2026-12-10T11:00:00+14:00",timeZone:"UTC"};value.review.items[0].dueAtExact="2026-12-08T20:00:00.000000Z";return value;});await h.click("Preview selected reminders");assert.equal(h.button("Schedule these reminders"),undefined);h.handler(async(_p,o)=>({...preview(o.body),expiresAtExact:"0000-12-08T10:10:00.000000Z"}));await h.click("Preview selected reminders");assert.equal(h.button("Schedule these reminders"),undefined);
}));
test("workspace exclusion prevents a new preview or schedule without fabricating a pending command",()=>{
  let allowed=true;return mounted(async h=>{await h.prepare();allowed=false;await h.click("Schedule these reminders");assert.equal(h.calls.length,1);assert.equal(h.pane.hasPendingCommand(),false);assert.match(h.text(),/other participation command/);await h.click("Preview selected reminders");assert.equal(h.calls.length,1);},{canMutate:()=>allowed});
});
test("range review uses the server1900–2200 calendar bound while retaining its valid upper boundary",()=>mounted(async h=>{
  await h.select("person_0000");for(const year of [2300,2200]){h.handler(async(_p,o)=>{const value=preview(o.body);value.review.items[0].range={startAt:`${year}-12-10T10:00:00Z`,endAt:`${year}-12-10T11:00:00Z`,timeZone:"UTC"};value.review.items[0].dueAtExact=`${year}-12-09T10:00:00.000000Z`;return value;});await h.click("Preview selected reminders");assert.equal(!!h.button("Schedule these reminders"),year===2200);}
}));
