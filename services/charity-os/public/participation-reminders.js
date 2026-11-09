// Staff review of one explicitly selected audience; no automatic scheduling.
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const need = value => { if (!value) throw new Error("The reminder response could not be verified. Any retained scheduling command is kept."); };
const id = value => typeof value === "string" && ID.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function exact(value, keys) { need(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|")); }
function stamp(value) {
  need(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value) && +value.slice(0,4)>0);
  const ms = value.slice(0,23) + "Z";need(Number.isFinite(Date.parse(ms)) && new Date(ms).toISOString() === ms);
  return BigInt(Date.parse(ms)) * 1000n + BigInt(value.slice(23,26));
}
function targetValue(value) {
  exact(value,["moduleId","targetId","targetRevision","sourceRevision","title"]);
  need(["events","volunteers"].includes(value.moduleId) && id(value.targetId) && integer(value.targetRevision) && integer(value.sourceRevision) && typeof value.title === "string" && value.title.length <= 180);
  return {...value};
}
function candidateValues(values) {
  need(Array.isArray(values) && values.length <= 2000);const seen = new Set();
  return values.map(value=>{exact(value,["participationId","revision","intakeRevision","label"]);need(id(value.participationId) && integer(value.revision) && integer(value.intakeRevision) && typeof value.label === "string" && value.label.length <= 180 && !seen.has(value.participationId));seen.add(value.participationId);return {...value};});
}
export function reminderReviewTemplate(portalUrl) {
  const url = new URL(portalUrl);need(url.protocol === "https:" && portalUrl === url.origin+"/participant" && !url.username && !url.password && !url.port && portalUrl.length<=512);
  const subject="Reminder: review your participation";
  const message="You asked for a reminder about your participation. Sign in to check the current details. This best-effort reminder does not confirm a place or record attendance.";
  const choice="This operational reminder does not subscribe you to The Charitology Letter. Manage participation email choices after signing in to your portal.";
  const footer="Charitology · 938 Peacock Station Rd, McLean, VA 22102";
  const escaped=portalUrl.replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return {variant:"pre-occurrence-v1",templateVersion:"participation-reminder-notice-v1",subject,text:`${subject}. ${message} Open your participant portal: ${portalUrl} ${choice} ${footer}`,html:`<h1>${subject}</h1><p>${message}</p><p><a href="${escaped}">Open your participant portal</a></p><p>${choice}</p><p>${footer}</p>`,url:portalUrl};
}
function agreesWithZone(instant, timeZone) {
  try {
    const parts=new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant));
    const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${v.year.padStart(4,"0")}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}`===instant.slice(0,19) && +instant.slice(0,4)>0;
  } catch {return false;}
}
function previewValue(value, request, portalUrl) {
  exact(value,["ok","previewId","expiresAtExact","review"]);need(value.ok === true && id(value.previewId));stamp(value.expiresAtExact);
  exact(value.review,["template","items","bestEffort"]);need(value.review.bestEffort === true);
  const t = value.review.template;exact(t,["variant","templateVersion","subject","text","html","url"]);
  const expected=reminderReviewTemplate(portalUrl);need(Object.keys(expected).every(key=>t[key]===expected[key]));
  for (const key of ["text","html"]) need(typeof t[key] === "string" && t[key].length > 0 && new TextEncoder().encode(t[key]).length <= 8192);
  need(Array.isArray(value.review.items) && value.review.items.length === request.participations.length);
  const selected = request.participations.map(p=>p.participationId).sort();
  value.review.items.forEach((item,n)=>{
    exact(item,["participationId","range","dueAtExact"]);exact(item.range,["startAt","endAt","timeZone"]);
    need(item.participationId === selected[n]);
    for(const key of ["startAt","endAt"]) need(typeof item.range[key] === "string" && item.range[key].length <= 80 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(item.range[key]) && +item.range[key].slice(0,4)>=1900 && +item.range[key].slice(0,4)<=2200 && Number.isFinite(Date.parse(item.range[key])));
    need(Date.parse(item.range.startAt) < Date.parse(item.range.endAt) && typeof item.range.timeZone === "string" && item.range.timeZone.length <= 100);
    need(agreesWithZone(item.range.startAt,item.range.timeZone) && agreesWithZone(item.range.endAt,item.range.timeZone));
    need(stamp(item.dueAtExact) === BigInt(Date.parse(item.range.startAt))*1000n-86400000000n);
  });
  return structuredClone(value);
}
function acceptedValue(value, pending) {
  exact(value,["ok","previewId","scheduledCount","scheduled","replayed"]);
  need(value.ok === true && value.previewId === pending.body.previewId && typeof value.replayed === "boolean" && value.scheduledCount === pending.review.review.items.length && Array.isArray(value.scheduled) && value.scheduled.length === value.scheduledCount);
  const outboxes = new Set();value.scheduled.forEach((item,n)=>{
    exact(item,["participationId","outboxId","commitmentSha256","dueAtExact"]);const reviewed = pending.review.review.items[n];
    need(item.participationId === reviewed.participationId && item.dueAtExact === reviewed.dueAtExact && id(item.outboxId) && !outboxes.has(item.outboxId) && typeof item.commitmentSha256 === "string" && SHA.test(item.commitmentSha256));outboxes.add(item.outboxId);stamp(item.dueAtExact);
  });return structuredClone(value);
}
function node(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);for(const [k,v] of Object.entries(attrs)) {if(["disabled","checked"].includes(k)) n[k]=!!v;else n.setAttribute(k,String(v));}
  for(const child of children.flat(Infinity)) if(child !== null && child !== undefined) n.append(child instanceof Node ? child : document.createTextNode(String(child)));return n;
}
export function createStaffReminderPane({orgId,target,candidates=[],portalUrl,admin=false,request,isCurrent=()=>true,canMutate=()=>true,onDirty=()=>{},onChanged=()=>{}}) {
  need(id(orgId) && admin === true && typeof request === "function");
  const portal = new URL(portalUrl);need(portal.protocol === "https:" && portalUrl === portal.origin+"/participant" && !portal.username && !portal.password && !portal.port);
  let currentTarget = targetValue(target), rows = candidateValues(candidates), disposed = false, paused = false, fresh = true, busy = false, generation = 0, candidatePage = 0, selected = new Set(), review = null, pending = null, accepted = null, acknowledged = false, abandon = false, focusRequested = false;
  const base = `/api/orgs/${encodeURIComponent(orgId)}/participation-reminders`, owned = new Set();
  const element = node("section",{class:"participation-reminders-pane","aria-label":"Staff participation reminders"}), host = node("div"), status = node("p",{role:"status",tabindex:"-1"}), controls = node("div",{class:"actions"});
  const ack = node("input",{type:"checkbox"}), stopAck = node("input",{type:"checkbox"});
  const live = () => !disposed && !paused && fresh && !globalThis.document?.hidden && isCurrent();
  const dirty = () => onDirty(!!(selected.size || pending || acknowledged || abandon));
  const notify = (text,error=false) => {if(!live()) return;status.textContent=text;status.classList.toggle("error",error);focusRequested=true;};
  const permitted=()=>{if(canMutate())return true;notify("Reconcile the other participation command before preparing or scheduling reminders.",true);render();return false;};
  const button = (label,fn) => {const b=node("button",{type:"button",class:"button subtle"},label);b.addEventListener("click",async()=>{if(live()&&!busy)await fn();});return b;};
  const preview = button("Preview selected reminders",previewSelected), schedule = button("Schedule these reminders",scheduleSelected), retry = button("Retry the same schedule",scheduleSelected), stop = button("Stop retrying this schedule",stopRetrying);
  ack.addEventListener("change",()=>{if(!live()||busy||pending||!review)return;acknowledged=ack.checked;dirty();sync();});
  stopAck.addEventListener("change",()=>{if(!live()||busy||!pending)return;abandon=stopAck.checked;dirty();sync();});
  async function transport(path,body) {const c=new AbortController();owned.add(c);try{return await request(base+path,{method:"POST",body,signal:AbortSignal.any([c.signal,AbortSignal.timeout(30000)])});}finally{owned.delete(c);}}
  function sync() {
    preview.disabled=busy||!!pending||selected.size<1||selected.size>20;
    schedule.disabled=busy||!!pending||!review||!acknowledged;
    ack.disabled=busy||!!pending||!review;
    retry.disabled=busy||!pending;stopAck.disabled=busy||!pending;stop.disabled=stopAck.disabled||!abandon;
    for(const c of host.querySelectorAll("input[data-reminder-person]"))c.disabled=busy||!!pending||selected.size>=20&&!selected.has(c.getAttribute("data-reminder-person"));
  }
  function render() {
    if(!live())return;host.replaceChildren();controls.replaceChildren(preview);
    host.append(node("h3",{},"Review participation reminders"),node("p",{},currentTarget.title),node("p",{class:"fine"},"Select up to 20 confirmed participants from the loaded list. Each needs a current operational email opt-in and a separate reminder choice. Nothing is selected automatically."));
    if(!rows.length)host.append(node("p",{},"No confirmed participation with a linked request revision is loaded. Load more participants or refresh the occurrence."));
    // Page the already scoped list so the form never mounts 2,000 controls.
    const visible = rows.slice(candidatePage*20,candidatePage*20+20);
    for(const row of visible) {
      const input=node("input",{type:"checkbox",checked:selected.has(row.participationId),"data-reminder-person":row.participationId});
      input.addEventListener("change",()=>{if(!live()||busy||pending)return;if(input.checked&&selected.size>=20){input.checked=false;return;}if(input.checked)selected.add(row.participationId);else selected.delete(row.participationId);review=null;acknowledged=false;ack.checked=false;accepted=null;dirty();render();host.querySelector(`input[data-reminder-person="${row.participationId}"]`)?.focus();});
      host.append(node("label",{class:"intake-consent"},input,row.label));
    }
    if(rows.length>20) {
      const previous=button("Previous reminder candidates",()=>{if(pending)return;candidatePage--;render();}),next=button("Next reminder candidates",()=>{if(pending)return;candidatePage++;render();});
      previous.disabled=busy||!!pending||candidatePage===0;next.disabled=busy||!!pending||(candidatePage+1)*20>=rows.length;
      host.append(node("p",{class:"fine"},`Candidate page ${candidatePage+1} of ${Math.ceil(rows.length/20)}. Selections on other pages are kept.`),node("div",{class:"actions"},previous,next));
    }
    host.append(node("p",{},`${selected.size} explicitly selected.`));
    const reviewed = pending?.review || review;
    if(reviewed) {
      const t=reviewed.review.template;
      host.append(node("h4",{},"Exact message and audience"),node("p",{},`Subject: ${t.subject}`),node("pre",{tabindex:"0",class:"learning-json"},t.text),node("details",{},node("summary",{},"Email HTML source"),node("pre",{tabindex:"0",class:"learning-json"},t.html)));
      const list=node("ul");for(const item of reviewed.review.items)list.append(node("li",{},`${rows.find(r=>r.participationId===item.participationId)?.label || "Participant "+item.participationId}: ${item.range.startAt} – ${item.range.endAt} · ${item.range.timeZone}. Reminder due ${item.dueAtExact}.`));host.append(list,node("p",{class:"fine"},`Review expires ${reviewed.expiresAtExact}. Delivery is best effort and may be missed. Scheduling does not confirm participation or record attendance.`));
      if(!pending) {host.append(node("label",{class:"intake-consent"},ack,"I reviewed this exact message, audience, and reminder times."));controls.append(schedule);}
    }
    if(pending) {host.append(node("p",{class:"notice"},"This scheduling command is retained and may already be saved. Retry sends only the same command. Refreshing the list does not settle its result."),node("label",{class:"intake-consent"},stopAck,"I understand that stopping retries does not cancel reminders that may already be scheduled."));controls.append(retry,stop);}
    if(accepted)host.append(node("p",{class:"notice"},`The original command scheduled ${accepted.scheduledCount} reminder${accepted.scheduledCount===1?"":"s"}. This is not delivery confirmation. Current choices and delivery checks can still prevent sending.`));
    element.replaceChildren(host,controls,status);sync();if(focusRequested&&status.isConnected){focusRequested=false;status.focus();}
  }
  async function previewSelected() {
    if(!live()||busy||pending||selected.size<1||selected.size>20||!permitted())return;
    const input={version:1,target:{moduleId:currentTarget.moduleId,targetId:currentTarget.targetId,targetRevision:currentTarget.targetRevision,sourceRevision:currentTarget.sourceRevision},participations:[...selected].sort().map(pid=>{const row=rows.find(r=>r.participationId===pid);need(row);return {participationId:pid,revision:row.revision,intakeRevision:row.intakeRevision};})};
    const n=++generation;busy=true;review=null;acknowledged=false;ack.checked=false;render();
    try {const value=previewValue(await transport("/preview",input),input,portalUrl);if(!live()||n!==generation)return;review=value;accepted=null;notify("Review the exact message, selected participants, and reminder times before scheduling.");}
    catch {if(live()&&n===generation)notify("The selected reminders could not be previewed. Refresh the occurrence and check each participant’s choices before trying again.",true);}
    finally{if(!disposed&&n===generation){busy=false;dirty();render();}}
  }
  async function scheduleSelected() {
    if(!live()||busy||!pending&&(!review||!acknowledged)||!permitted())return;
    if(!pending)pending={body:Object.freeze({previewId:review.previewId,commandKey:crypto.randomUUID()}),review:structuredClone(review)};
    const command=pending,n=generation;busy=true;dirty();render();
    try {const value=acceptedValue(await transport("/schedule",command.body),command);if(!live()||n!==generation||pending!==command)return;accepted=value;pending=null;review=null;selected.clear();acknowledged=abandon=false;ack.checked=stopAck.checked=false;notify("The original scheduling command was accepted. Delivery will recheck current consent and eligibility.");onChanged();}
    catch {if(live()&&n===generation&&pending===command)notify("The scheduling result is uncertain. Explicitly retry this same command or stop retrying it; no new command was submitted.",true);}
    finally{if(!disposed&&n===generation){busy=false;dirty();render();}}
  }
  function stopRetrying(){if(!live()||busy||!pending||!abandon)return;pending=review=accepted=null;selected.clear();acknowledged=abandon=false;ack.checked=stopAck.checked=false;dirty();notify("Retries stopped in this tab. Scheduled reminders were not cancelled. Refresh the occurrence before preparing another selection.");fresh=false;element.replaceChildren(status);}
  function pause(){if(disposed)return;paused=true;fresh=false;generation++;busy=false;review=accepted=null;acknowledged=abandon=false;ack.checked=stopAck.checked=false;status.textContent="";focusRequested=false;for(const c of owned)c.abort();element.replaceChildren();}
  function setCandidates(nextRows,nextTarget){if(disposed)return;const t=targetValue(nextTarget),r=candidateValues(nextRows);need(t.targetId===currentTarget.targetId&&t.moduleId===currentTarget.moduleId);const changed=!same(t,currentTarget)||!same(r,rows);currentTarget=t;rows=r;candidatePage=Math.min(candidatePage,Math.max(0,Math.ceil(rows.length/20)-1));fresh=true;if(changed&&!pending){selected.clear();review=null;acknowledged=false;ack.checked=false;}dirty();if(!paused)render();}
  function resume(){if(disposed||!fresh||!isCurrent())return;paused=false;render();}
  function dispose(){if(disposed)return;pause();disposed=true;pending=review=accepted=null;selected.clear();rows=[];onDirty(false);globalThis.window?.removeEventListener?.("pagehide",pause);}
  globalThis.window?.addEventListener?.("pagehide",pause);
  render();return {element,setCandidates,resume,pause,dispose,hasPendingCommand:()=>!!pending,hasUnsavedChanges:()=>!!(selected.size||pending||acknowledged||abandon)};
}
