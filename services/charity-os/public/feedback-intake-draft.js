/** Private staff pane for converting one reviewed anonymous feedback entry. */
const owns=new WeakMap();
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const rev=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const plain=v=>v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
const closed=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const title=v=>typeof v==='string'&&v.length>0&&v.length<=180;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v);
const COMMON=['ok','version','orgId','scopeSha256','state'];
function ready(body,idWanted){
  if(!closed(body,[...COMMON,'submission','proposed','reviewSha256'])||!hex(body.reviewSha256))return false;
  const {submission:s,proposed:p}=body;
  if(!closed(s,['id','revision','status'])||s.id!==idWanted||!rev(s.revision)||s.status!=='reviewed'||
    !closed(p,['moduleId','status','data'])||p.moduleId!=='feedback'||p.status!=='received')return false;
  const d=p.data;
  return closed(d,['title','kind','programId','channel','publicationConsent','responses','receivedDate','respondBy','resolution','publicSummary','change'])
    &&title(d.title)&&d.kind==='feedback-summary'&&d.programId===null&&d.channel==='anonymous'&&d.publicationConsent==='withheld'
    &&d.responses===1&&date(d.receivedDate)&&d.respondBy===null&&d.resolution==='needs-review'&&d.publicSummary===null&&d.change===null;
}
function current(v,submissionId,draftId){
  if(!closed(v,['submission','draft']))return false;
  const {submission:s,draft:d}=v;
  if(s!==null&&(!closed(s,['id','revision','status','erased'])||s.id!==submissionId||!rev(s.revision)||
    !['pending','reviewed','dismissed','converted','cancelled'].includes(s.status)||typeof s.erased!=='boolean'))return false;
  return closed(d,['id','moduleId','status','revision','disposition'])&&id(d.id)&&(!draftId||d.id===draftId)&&d.moduleId==='feedback'&&
    (d.disposition==='missing'?d.status===null&&d.revision===null:['active','trashed'].includes(d.disposition)&&typeof d.status==='string'&&rev(d.revision));
}
function accepted(body,submissionId,pending){
  const extra=pending?['idempotencyKey','replayed']:[];
  if(!closed(body,[...COMMON,'decision','current',...extra]))return false;
  const d=body.decision;
  if(!closed(d,['submissionId','publicationId','sourceRevision','reviewedRevision','submissionRevision','acceptedAtExact','draft'])||
    d.submissionId!==submissionId||!id(d.publicationId)||!rev(d.sourceRevision)||!rev(d.reviewedRevision)||
    !rev(d.submissionRevision)||d.submissionRevision!==d.reviewedRevision+1||!stamp(d.acceptedAtExact))return false;
  const ref=d.draft;
  return closed(ref,['id','moduleId','status','revision'])&&id(ref.id)&&ref.moduleId==='feedback'&&ref.status==='received'&&ref.revision===1&&
    current(body.current,submissionId,ref.id)&&(!pending||body.idempotencyKey===pending.key&&body.scopeSha256===pending.scope&&d.reviewedRevision===pending.revision&&typeof body.replayed==='boolean');
}
function verify(body,orgId,submissionId,pending=null){
  if(!plain(body)||body.ok!==true||body.version!==1||body.orgId!==orgId||!hex(body.scopeSha256))return false;
  if(body.state==='accepted')return accepted(body,submissionId,pending);
  if(pending)return false;
  if(body.state==='ready')return ready(body,submissionId);
  return body.state==='historical'&&closed(body,[...COMMON,'current'])&&current(body.current,submissionId,null);
}
const settledFailure=(r,pending)=>pending&&[409,422].includes(r?.status)&&
  closed(r.body,['ok','code','message','definitive'])&&r.body.ok===false&&r.body.definitive===true&&
  typeof r.body.code==='string'&&typeof r.body.message==='string';

export function mountFeedbackIntakeDraft(root,{
  orgId,submissionId,ownerKey,load,send,onPending=()=>{},isCurrent=()=>true,pendingHandle=null,
  makeKey=()=>globalThis.crypto.randomUUID(),draftHref=()=>null,onObserved=()=>{},
}) {
  if(!id(orgId)||!id(submissionId)||typeof ownerKey!=='string'||!ownerKey||typeof load!=='function'||typeof send!=='function')
    throw TypeError('An authenticated feedback request is required.');
  let handle=pendingHandle;
  let pending=owns.get(handle)??null;
  if(pending&&(pending.orgId!==orgId||pending.submissionId!==submissionId||pending.ownerKey!==ownerKey)) {
    pending=null;handle=null;
  }
  let active=true, waiting=false, currentView=null, status='', acknowledged=false;
  const doc=root.ownerDocument;
  const el=(tag,text=null)=>{
    const e=doc.createElement(tag);
    if(text!==null)e.textContent=text;
    return e;
  };
  const alive=()=>active&&isCurrent();
  const changePending=value=>{
    pending=value;
    handle=pending?Object.freeze({}):null;
    if(handle)owns.set(handle,pending);
    onPending(handle);
  };
  const render=()=>{
    if(!alive())return;
    const activeElement=doc.activeElement;
    const restoreFocus=activeElement&&root.contains?.(activeElement);
    const head=el('h2','Prepare a private feedback draft');
    const intro=el('p','The draft keeps the anonymous selections private. This action creates no contact and sends no message.');
    const live=el('p',status);
    live.className='form-status';
    live.setAttribute('role','status');
    live.tabIndex=-1;
    const refresh=el('button','Read current feedback state');
    refresh.className='button small subtle';
    refresh.type='button';refresh.disabled=waiting;
    refresh.addEventListener('click',refreshRead);
    const nodes=[head,intro,refresh,live];
    if(pending) {
      const b=el('button','Retry the same feedback draft');
      b.className='button small';
      b.type='button';b.disabled=waiting;
      b.addEventListener('click',()=>void transmit());
      nodes.push(el('p','This decision may already have been recorded. Retry checks the same request.'),b);
    }
    const view=currentView;
    if(view?.state==='ready') {
      const d=view.proposed.data;
      nodes.push(el('h3','Review the exact draft'),el('p',d.title),
        el('p','Received '+d.receivedDate+' · One response · Publication withheld'));
      if(!pending){
        const label=el('label'), check=el('input');
        label.className='feedback-draft-confirm';
        check.type='checkbox';check.checked=acknowledged;check.disabled=waiting;
        label.append(check,el('span','I reviewed the exact draft and want to save it for private follow-up.'));
        const save=el('button','Record reviewed feedback draft');
        save.className='button primary';
        save.type='button';save.disabled=waiting||!acknowledged;
        check.addEventListener('change',()=>{acknowledged=check.checked;save.disabled=waiting||!acknowledged;});
        save.addEventListener('click',start);
        nodes.push(label,save);
      }
    }
    if(view?.state==='accepted'||view?.state==='historical'){
      if(view.state==='accepted')nodes.push(el('h3','Original decision'),el('p','Draft '+view.decision.draft.id+' was recorded.'));
      else nodes.push(el('h3','Recovered feedback history'),el('p','This link is history and carries no permission to repeat the original decision.'));
      const d=view.current.draft;
      nodes.push(el('h3','Current draft state'),el('p','Draft '+d.id+' · '+({active:'available',trashed:'in Trash',missing:'no current record'}[d.disposition])));
      const href=d.disposition==='active'?draftHref(d.id):null;
      if(typeof href==='string'&&href.startsWith('#module/feedback/')){
        const link=el('a','Open Community feedback draft');
        link.href=href;
        link.className='button small subtle';
        nodes.push(link);
      }
    }
    root.replaceChildren(...nodes);
    if(restoreFocus)live.focus?.({preventScroll:true});
  };
  async function refreshRead() {
    if(waiting||!alive())return;
    waiting=true;acknowledged=false;render();
    try {
      const r=await load();
      if(!alive())return;
      if(r?.status!==200||!verify(r.body,orgId,submissionId)) {
        currentView=null;status='The current feedback state is unavailable. Check access and try again.';
      } else {
        currentView=r.body;
        onObserved(currentView);
        status=pending?'Read current state. Retry remains available for the original request.':'Current feedback state loaded.';
      }
    } catch {
      if(alive()){currentView=null;status='The current feedback state could not be read.';}
    } finally {
      waiting=false;render();
    }
  }
  function start() {
    if(!alive()||waiting||pending||!acknowledged||currentView?.state!=='ready')return;
    const view=currentView,key=makeKey();
    if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw TypeError('Use a safe review key.');
    const raw=JSON.stringify({version:1,revision:view.submission.revision,scopeSha256:view.scopeSha256,
      reviewSha256:view.reviewSha256,idempotencyKey:key,acknowledge:true});
    changePending(Object.freeze({orgId,submissionId,ownerKey,key,scope:view.scopeSha256,revision:view.submission.revision,raw}));
    void transmit();
  }
  async function transmit() {
    if(waiting||!pending||!alive())return;
    const exact=pending;
    waiting=true;status='Checking the original request.';render();
    try{
      const r=await send(exact.raw);
      if(!alive()||pending!==exact)return;
      if(r?.status===200&&verify(r.body,orgId,submissionId,exact)){
        currentView=r.body;changePending(null);acknowledged=false;status='The reviewed private draft was recorded.';
        onObserved(currentView);
      } else if(settledFailure(r,exact)){
        changePending(null);currentView=null;acknowledged=false;status='The earlier decision was refused. Read the current state before reviewing again.';
      } else status='The result is not confirmed. Retry the same request or read the current state.';
    } catch {
      if(alive()&&pending===exact)status='The result is not confirmed. Retry the same request or read the current state.';
    } finally {
      waiting=false;render();
    }
  }
  render();
  return Object.freeze({
    pending:()=>handle,
    dispose(){active=false;root.replaceChildren();},
  });
}
