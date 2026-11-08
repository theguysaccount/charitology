/** Closed fake SELECTs only. No PG/RLS/lock/transaction/session or booking proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { readGroupContext, GROUP_CONTEXT_SQL as SQL } from "../lib/participation-group-context.mjs";
import { projectGroupHistory } from "../lib/participation-group-model.mjs";
import { planGroupAllocation } from "../lib/participation-group-allocation.mjs";
import { validateRecord } from "../lib/modules.mjs";
import { visibleRecord } from "../lib/access.mjs";

import { ORG, USER, SID, SHA, stamp, next, session, result, code, range, fixture } from "./fixtures/group-context.mjs";

test("read/replay scope proves the complete chosen graph and performs no NEW clock/ledger/queue work",async()=>{
  for(const operation of ['read','replay','close','cancel','cancellation-preview']){
    const f=fixture();f.source.status='cancelled';f.source.approval=null;f.source.data.startAt='not-a-current-schedule';f.p1.consent=null;f.p1.state='cancelled';f.t.mode='paused';f.t.recovery_block=true;
    f.person('unrelated','confirmed','other_target').frozen=null;
    const x=await f.read(operation);assert.equal(x.inventory,null);assert.deepEqual(x.roster.map(p=>p.id),['p1','p2']);
    assert.equal(x.source.status,'cancelled');assert.equal(x.group.receipts[0].result.state,'draft');
    assert(!f.calls.some(c=>[SQL.records,SQL.parts,SQL.queue,SQL.targets,SQL.recordBudget,SQL.partBudget].includes(c.sql)||c.sql.startsWith('WITH moment')));
  }
});
test("unselected roster visibility and typed program edges are mandatory, without a same-program rule",async()=>{
  const f=fixture();f.record('program_A','programs',{title:'Fictional A',kind:'program'});f.record('program_B','programs',{title:'Fictional B',kind:'program'});
  f.source.data.programId='program_A';f.tables.os_records.get('p2_booking').data.programId='program_B';
  assert((await f.read()).source);f.member.role='program_lead';f.member.program_ids=['program_A'];
  await assert.rejects(f.read(),code('participation_group_unavailable'));
  f.calls.length=0;f.p1.consent=null;await assert.rejects(f.read('admission-preview'),code('participation_group_unavailable'));
  assert(!f.calls.some(c=>c.sql.startsWith('WITH moment')||c.sql.startsWith('SELECT status,cancelled_at')));
});
test("missing/deleted/retargeted/wrong-kind booking or contact refuses a whole generic view",async()=>{
  for(const change of [f=>f.tables.os_records.delete('p2_booking'),f=>{f.tables.os_records.get('p2_booking').deleted_at=stamp;},
    f=>{f.tables.os_records.get('p2_booking').data.eventId='other';},f=>{f.tables.os_records.get('p2_booking').data.kind='session';},
    f=>{f.tables.os_records.get('p2_contact').module_id='programs';}]){
    const f=fixture();change(f);await assert.rejects(f.read(),code('participation_group_unavailable'));
  }
});
test("preview reads have no row locks; mutation locks follow fixed table rank then ASCII ID",async()=>{
  const ro=fixture();await ro.read('admission-preview');assert(!ro.calls.some(c=>/FOR SHARE|FOR UPDATE/.test(c.sql)));
  const wr=fixture();await wr.read('create');const locks=wr.calls.filter(c=>/FOR UPDATE$/.test(c.sql));
  assert(locks[0].sql.includes('os_participation_targets'));assert(locks[1].sql.includes('os_records'));assert(locks[2].sql.includes('os_participations'));
  assert.deepEqual(locks[1].args[1],[...locks[1].args[1]].sort());assert.deepEqual(locks[2].args[1],['p1','p2']);
  assert.equal(wr.calls[0].sql,SQL.lock);assert.equal(wr.calls[1].sql,SQL.utc);
});
test("NEW drafts admit incomplete review/consent only for distinct nonallocating live roster rows",async()=>{
  const f=fixture();f.source.approval=null;f.p1.consent=null;f.tables.os_records.get('p2_booking').approval=null;
  assert.equal((await f.read('create')).roster.length,2);
  for(const patch of [{state:'confirmed'},{source:'legacy'},{recovered:true},{confirmed_at:stamp},{frozen:{old:true}}]){
    const other=fixture();Object.assign(other.p2,patch);await assert.rejects(other.read('create'),code('participation_group_unavailable'));
  }
});
test("NEW admission uses real shared eligibility but returns private not-ready facts without a token or write",async()=>{
  const f=fixture();f.p2.consent=null;const x=await f.read('admission-preview');
  assert.equal(x.inventory.readiness[0].reason,null);assert.equal(x.inventory.readiness[1].reason,'participation_consent');
  assert.match(x.inventory.inventorySha256,/^[a-f0-9]{64}$/);assert(!JSON.stringify(x).includes('previewToken'));
  assert(f.calls.every(c=>!/^(INSERT|UPDATE|DELETE|BEGIN|COMMIT)/.test(c.sql)));
});
test("raw microsecond row edits change NEW inventory pins even when JS Date values agree",async()=>{
  const f=fixture();const first=await f.read('admission-preview');f.tables.os_records.get('p2_booking').updated_at=next;
  assert.equal(new Date(stamp).getTime(),new Date(next).getTime());const second=await f.read('admission-preview');
  assert.notEqual(first.inventory.inventorySha256,second.inventory.inventorySha256);assert.equal(first.authority.restoreEpochSha256,second.authority.restoreEpochSha256);
});
test("large legal ordinary raw rows cross128KiB without a whole-graph clone or Date fingerprint",async()=>{
  const f=fixture();f.tables.os_records.get('p1_booking').data.notes='€'.repeat(50000);
  const x=await f.read('admission-preview');assert.equal(x.records.find(r=>r.id==='p1_booking').data.notes.length,50000);
  assert(f.calls.some(c=>c.args[1]==='p1_booking'&&c.args[2]===131073));
});
test("same-graph scalar changes retain restore authority, program graph changes and restore IDs revoke it",async()=>{
  const f=fixture();const first=await f.read();f.source.data.title='Later wording';f.p1.revision++;f.source.approval=null;
  assert.equal((await f.read()).authority.restoreEpochSha256,first.authority.restoreEpochSha256);
  f.record('new_program','programs',{title:'Fictional program',kind:'program'});f.source.data.programId='new_program';
  const changed=await f.read();assert.notEqual(changed.authority.restoreEpochSha256,first.authority.restoreEpochSha256);
  f.restored.set('p1_booking','9007199254740993');assert.notEqual((await f.read()).authority.restoreEpochSha256,changed.authority.restoreEpochSha256);
});
test("NEW coordinator provenance is admin-only readable/nonerased/exact-target, later status and erasure ignored",async()=>{
  const f=fixture();f.tables.os_intake.set('coord',{org_id:ORG,id:'coord',publication_id:'publication',erased_at:null,status:'cancelled',answers:{private:'never DTO'},created_at:stamp});
  f.tables.os_publications.set('publication',{org_id:ORG,id:'publication',target_id:'target',target_module:'events',kind:'event-interest',withdrawn_at:stamp});
  const seed={kind:'target',targetId:'target',rosterIds:['p1','p2'],coordinatorIntakeId:'coord'};
  assert((await f.read('create',{seed})).source);f.member.role='program_lead';await assert.rejects(f.read('create',{seed}),e=>e.code==='role');
  f.member.role='owner';f.tables.os_intake.get('coord').erased_at=stamp;await assert.rejects(f.read('create',{seed}),code('participation_group_unavailable'));
  f.group.coordinator_intake_id='coord';f.receipt.result.coordinatorIntakeId='coord';f.tables.os_intake.clear();f.tables.os_publications.clear();
  assert((await f.read('replay')).source);assert(!f.calls.slice(-20).some(c=>c.args[1]==='coord'));
});
test("chosen intake converted IDs and exact publication target are typed, without active own links",async()=>{
  const f=fixture();f.p1.intake_id='intake';f.tables.os_intake.set('intake',{org_id:ORG,id:'intake',publication_id:'pub',status:'converted',erased_at:stamp,
    converted_ids:[{id:'p1_booking',moduleId:'events'},{id:'p1_contact',moduleId:'contacts'}]});
  f.tables.os_publications.set('pub',{org_id:ORG,id:'pub',target_id:'target',target_module:'events',kind:'event-interest'});
  assert((await f.read('replay')).source);f.tables.os_intake.get('intake').converted_ids.pop();
  await assert.rejects(f.read('replay'),code('participation_group_unavailable'));assert(!f.calls.some(c=>c.sql.includes('os_participant_links')));
});
test("an earlier unselected missing intake keeps LEFT JOIN hint semantics; later presence changes pins",async()=>{
  const f=fixture();const earlier=f.person('earlier','waitlisted');earlier.intake_id='missing';f.queue.push('earlier');
  const first=await f.read('admission-preview');assert.equal(first.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}),earlier.id);
  f.tables.os_intake.set('missing',{org_id:ORG,id:'missing',publication_id:'also_missing',status:'converted',cancelled_at:null,converted_ids:[]});
  const second=await f.read('admission-preview');assert.equal(second.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}),earlier.id);
  assert.notEqual(first.inventory.inventorySha256,second.inventory.inventorySha256);
  f.tables.os_publications.set('also_missing',{org_id:ORG,id:'also_missing',target_id:'not_this_target',target_module:'events',kind:'contact'});
  const third=await f.read('admission-preview');assert.equal(third.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}),earlier.id);
  assert.notEqual(third.inventory.inventorySha256,second.inventory.inventorySha256);
});
test("applicable saved ranges use frozen history, not edited current-source fallback",async()=>{
  const f=fixture({moduleId:'volunteers'});const old=f.person('old','confirmed');old.frozen={terms:{...range('09','10'),kind:'shift'}};
  const x=await f.read('admission-preview');assert.deepEqual(x.inventory.confirmed[0].range,{...range('09','10')});
  old.frozen=null;await assert.rejects(f.read('admission-preview'),e=>e.code==='participation_interval');
});
test("source selectors and operation/lock profiles reject getters, proxies and HTTP skip flags before SQL",async()=>{
  let touched=0;const f=fixture(),input=f.args();Object.defineProperty(input,'operation',{enumerable:true,get(){touched++;return'read';}});
  for(const value of [input,new Proxy(f.args(),{ownKeys(){touched++;throw Error('trap');}}),{...f.args(),skip:true},f.args('admission-preview',{readOnly:false}),f.args('create',{readOnly:true})])
    await assert.rejects(readGroupContext(f.c,value));
  assert.equal(touched,0);assert.equal(f.calls.length,0);
});
test("cancellation chosen-graph raw pins notice microseconds while accepted authority stays separate",async()=>{
  const f=fixture();const first=await f.read('cancellation-preview');f.tables.os_records.get('p1_booking').updated_at=next;
  const second=await f.read('cancellation-preview');
  assert.notEqual(first.chosenGraphPinsSha256,second.chosenGraphPinsSha256);assert.equal(first.rosterSha256,second.rosterSha256);
  assert.deepEqual(first.authority,second.authority);assert.equal(second.inventory,null);
});
test("unrelated malformed/recovered commitments and orphan unmanaged rows do not veto admission context",async()=>{
  const f=fixture({moduleId:'volunteers'});const unrelated=f.person('unrelated','confirmed','missing_other_target','unrelated_contact');unrelated.recovered=true;unrelated.recovered_state='confirmed';unrelated.frozen=null;
  f.record('orphan','volunteers',{title:'Fictional unrelated assignment',kind:'assignment',shiftId:'missing_shift',contactId:'unrelated_contact'},'assigned');
  const x=await f.read('admission-preview');assert.deepEqual(x.inventory.confirmed,[]);assert.deepEqual(x.inventory.unmanaged,[]);
  assert(!f.calls.some(c=>c.sql.startsWith('SELECT to_jsonb')&&['unrelated','orphan','missing_other_target','missing_shift'].includes(c.args[1])));
});
test("applicable malformed or recovered managed commitment refuses rather than using current schedule",async()=>{
  for(const recovered of [false,true]){
    const f=fixture({moduleId:'volunteers'});f.record('other_shift','volunteers',{title:'Other fictional shift',kind:'shift',...range()},'open');
    const p=f.person('overlap','confirmed','other_shift','p1_contact');p.recovered=recovered;p.recovered_state=recovered?'confirmed':null;p.frozen=null;
    await assert.rejects(f.read('admission-preview'),e=>['participation_interval','participation_group_reconcile'].includes(e.code));
  }
});
test("a same-target active legacy booking without a participation requires reconciliation",async()=>{
  const f=fixture();f.record('unmapped','events',{title:'Fictional earlier booking',kind:'registration',eventId:'target',contactId:'old_contact'},'scheduled');
  await assert.rejects(f.read('admission-preview'),e=>e.code==='participation_group_reconcile');
  assert((await f.read('replay')).group);
});
test("private complete allocation tuples preserve actual booking IDs and strip only interval projection version",async()=>{
  const f=fixture({moduleId:'volunteers'});const old=f.person('old','confirmed');const interval={version:1,...range('09','10')};
  old.requested_interval=structuredClone(interval);old.frozen={terms:{title:'Earlier shift',kind:'shift',...range(),intervalPolicy:{version:1,mode:'within-shift'}},
    interval:structuredClone(interval),allocationHash:SHA};
  const before=structuredClone(old),x=await f.read('admission-preview'),existing=x.inventory.allocationExisting;
  assert.equal(existing.length,1);assert.equal(existing[0].bookingRecordId,'old_booking');assert.equal(existing[0].id,'old');
  assert.deepEqual(Object.keys(existing[0].range).sort(),['endAt','startAt','timeZone']);assert.equal(x.inventory.confirmed[0].bookingRecordId,'old_booking');assert.deepEqual(old,before);
  const selected=x.roster.map(p=>({orgId:ORG,participationId:p.id,bookingRecordId:p.booking_record_id,contactId:p.contact_id,targetId:p.target_id,moduleId:p.module_id,range:range()}));
  const plan=planGroupAllocation({orgId:ORG,target:{targetId:'target',moduleId:'volunteers',capacity:3,range:range()},rosterIds:['p1','p2'],selection:{mode:'all',items:[]},selected,existing});
  assert.equal(plan.ready,true);
});
test("unmanaged inventory supplies actual org/module/booking identity to combined planner",async()=>{
  const f=fixture({moduleId:'volunteers'});f.record('external_shift','volunteers',{title:'Fictional other shift',kind:'shift',...range('11','12')},'open');
  f.record('external_booking','volunteers',{title:'Fictional other booking',kind:'assignment',shiftId:'external_shift',contactId:'p1_contact'},'assigned');
  const x=await f.read('admission-preview'),row=x.inventory.allocationExisting[0];
  assert.deepEqual(row,{kind:'unmanaged',orgId:ORG,id:'external_booking',bookingRecordId:'external_booking',contactId:'p1_contact',targetId:'external_shift',moduleId:'volunteers',range:range('11','12')});
});
test("recovered opaque history is only available to current unscoped administrators",async()=>{
  const f=fixture();const history=projectGroupHistory({originOrgId:ORG,receipts:[f.receipt]});Object.assign(f.group,{origin_mode:'recovered',state:'archived',revision:1,
    live_target_id:null,roster_ids:[],coordinator_intake_id:null,last_command_hash:null,history});
  f.tables.os_records.clear();f.tables.os_participations.clear();const x=await f.read();
  assert.equal(x.originMode,'recovered');assert.equal(x.authority,null);assert.equal(x.chosenGraphPinsSha256,null);assert.equal(x.inventory,null);
  f.member.program_ids=['some_program'];await assert.rejects(f.read(),code('participation_group_unavailable'));
  f.member.program_ids=[];await assert.rejects(f.read('replay'),code('participation_group_unavailable'));
});
test("fresh session refusal and unexpected SQL failure never become a partial ready context",async()=>{
  const f=fixture();f.missingSession=true;await assert.rejects(f.read(),e=>e.code==='session');assert(!f.calls.some(c=>c.sql.startsWith('SELECT to_jsonb')));
  const other=fixture(),original=other.c.query,failure=new Error('Fictional driver failure');
  other.c.query=async(sql,args)=>{if(sql===SQL.queue)throw failure;return original(sql,args);};
  await assert.rejects(other.read('admission-preview'),e=>e===failure);
});
test("selected processing-size guard refuses before raw JSON/chunks and is not an allocation budget",async()=>{
  const f=fixture(),original=f.c.query;
  f.c.query=async(sql,args)=>sql.startsWith("SELECT count(*)::int AS count,COALESCE(sum(octet_length(convert_to")
    ?result([{count:args[1].length,bytes:String(62*1024*1024)}]):original(sql,args);
  await assert.rejects(f.read('replay'),e=>e.code==='participation_group_reconcile');
  assert(!f.calls.some(c=>c.sql.startsWith('SELECT octet_length')||c.sql.startsWith('SELECT to_jsonb')));
});
test("raw pins are consumed before domain JSON/Date conversion and no row content enters returned hashes",async()=>{
  const f=fixture();await f.read();
  for(let n=0;n<f.calls.length;n++)if(f.calls[n].sql.startsWith('SELECT to_jsonb(t)::text')){
    const key=f.calls[n].args[1];assert(f.calls.slice(0,n).some(c=>c.args[1]===key&&c.sql.startsWith('SELECT octet_length')&&c.args.length===3));
  }
  assert(f.calls.every(c=>!/^SELECT.*os_participant_links/.test(c.sql)));
});
test("ten-person drafts retain the complete graph, while eleven/duplicate selectors fail before SQL",async()=>{
  const f=fixture();for(let i=3;i<=10;i++)f.person('p'+i);
  const ids=[...f.tables.os_participations.keys()],seed={kind:'target',targetId:'target',rosterIds:ids,coordinatorIntakeId:null};
  const x=await f.read('create',{seed});assert.equal(x.roster.length,10);assert.deepEqual(x.roster.map(p=>p.id),[...ids].sort());
  for(const rosterIds of [[...ids,'extra'],['p1','p1']]){
    const invalid=fixture();await assert.rejects(invalid.read('create',{seed:{...seed,rosterIds}}));assert.equal(invalid.calls.length,0);
  }
});
test("session selector ownership preserves access helper's plain-data guard without reading unrelated Date/email fields",async()=>{
  const f=fixture();let touched=0;
  const safe=session();Object.defineProperty(safe.user,'email',{get(){touched++;throw Error('unused');}});safe.session.createdAt=new Date(0);
  assert((await f.read('read',{session:safe})).member);
  const exotic=session();exotic.session=Object.assign([],{id:SID});
  const getter=session();Object.defineProperty(getter.session,'id',{enumerable:true,get(){touched++;return SID;}});
  for(const bad of [exotic,getter]){const isolated=fixture();await assert.rejects(isolated.read('read',{session:bad}));assert.equal(isolated.calls.length,0);}
  assert.equal(touched,0);
});
test("a contributor can preview a valid private safeguarding reference without gaining safeguarding read permission",async()=>{
  const f=fixture({moduleId:'volunteers'});f.member.role='contributor';f.tables.os_records.get('p1_booking').data.safeguardingId='training_ref';
  f.record('training_ref','safeguarding',{title:'Private fictional status',kind:'training',completion:'unknown'},'pending');
  const x=await f.read('admission-preview');assert.equal(x.inventory.readiness[0].reason,null);
  const linked=x.records.find(r=>r.id==='training_ref');assert(linked);assert.equal(visibleRecord(linked,x.member),null);
  const booking=x.records.find(r=>r.id==='p1_booking');
  assert.equal(validateRecord('volunteers',booking.data,{orgId:ORG,recordId:booking.id,status:'draft',records:x.records}).safeguardingId,'training_ref');
  assert(f.calls.some(c=>c.sql.startsWith('WITH selected')&&c.args[1].includes('training_ref')));
});
test("missing/wrong-module chosen safeguarding refs refuse, but source-only refs add no new authority edge",async()=>{
  const f=fixture({moduleId:'volunteers'});f.tables.os_records.get('p1_booking').data.safeguardingId='required_ref';
  await assert.rejects(f.read('admission-preview'),code('participation_group_unavailable'));
  f.record('required_ref','contacts',{title:'Wrong module',kind:'person'});await assert.rejects(f.read('admission-preview'),code('participation_group_unavailable'));
  delete f.tables.os_records.get('p1_booking').data.safeguardingId;const before=await f.read('replay');
  f.source.data.safeguardingId='unused_source_ref';const after=await f.read('replay');
  assert.deepEqual(after.authority,before.authority);assert.notEqual(after.chosenGraphPinsSha256,before.chosenGraphPinsSha256);
  assert(!f.calls.some(c=>c.args[1]==='unused_source_ref'));
});

for(const programPresent of [false,true])test(`safeguarding identity does not follow its ${programPresent?'unreadable':'missing'} own program`,async()=>{
  const f=fixture({moduleId:'volunteers'});f.member.role='contributor';f.member.program_ids=['visible_program'];
  for(const row of f.tables.os_records.values())row.data.programId='visible_program';
  f.record('visible_program','programs',{title:'Visible fictional program',kind:'program'});
  f.tables.os_records.get('p1_booking').data.safeguardingId='training_ref';
  f.record('training_ref','safeguarding',{title:'Restricted fictional training',kind:'training',programId:'other_program'},'pending');
  if(programPresent)f.record('other_program','programs',{title:'Unrelated private program',kind:'program'});
  for(const operation of ['read','replay','cancellation-preview','admission-preview']){
    const x=await f.read(operation),linked=x.records.find(r=>r.id==='training_ref');
    assert(linked);assert.equal(visibleRecord(linked,x.member),null);
    assert(!x.records.some(r=>r.id==='other_program'));
    if(x.inventory)assert.equal(x.inventory.readiness[0].reason,null);
  }
  assert(!f.calls.some(c=>c.sql.startsWith('SELECT to_jsonb')&&c.args[1]==='other_program'));
  assert(!f.calls.some(c=>c.sql.startsWith('WITH selected')&&c.args[1].includes('other_program')));
});

for(const [label,change,missingId] of [
  ['missing booking',f=>f.tables.os_records.delete('earlier_booking'),'earlier_booking'],
  ['deleted booking',f=>{f.tables.os_records.get('earlier_booking').deleted_at=stamp;},'earlier_booking'],
  ['missing contact',f=>f.tables.os_records.delete('earlier_contact'),'earlier_contact'],
  ['deleted contact',f=>{f.tables.os_records.get('earlier_contact').deleted_at=stamp;},'earlier_contact'],
  ['wrong-kind booking',f=>{f.tables.os_records.get('earlier_booking').data.kind='session';},null],
  ['wrong-module contact',f=>{f.tables.os_records.get('earlier_contact').module_id='programs';},null],
])test(`an unselected ${label} is skipped by the actual hint without vetoing the group`,async()=>{
  const f=fixture();f.person('earlier','waitlisted');f.person('later','waitlisted');f.queue.push('earlier','later');change(f);
  for(const operation of ['admission-preview','admit']){
    const x=await f.read(operation);assert.equal(x.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}), 'later');
    assert.deepEqual(x.roster.map(p=>p.id),['p1','p2']);
    assert(x.inventory.readiness.every(r=>r.reason===null));
    if(missingId)assert(!x.records.some(r=>r.id===missingId));
  }
  assert(f.calls.some(c=>c.sql.startsWith('SELECT octet_length')&&c.args[1]===(missingId??'earlier_booking')));
  assert(f.calls.every(c=>!/^(INSERT|UPDATE|DELETE|BEGIN|COMMIT)/.test(c.sql)));
});

test("queue-only missing program references do not become an existence or scope gate",async()=>{
  const f=fixture();f.person('earlier','waitlisted');f.queue.push('earlier');
  f.tables.os_records.get('earlier_booking').data.programId='missing_optional_program';
  const x=await f.read('admission-preview');assert.equal(x.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}), 'earlier');
  assert(!x.records.some(r=>r.id==='missing_optional_program'));
  f.record('missing_optional_program','contacts',{title:'Not a program',kind:'person'});
  const y=await f.read('admission-preview');assert.equal(y.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}), 'earlier');
  assert.notEqual(x.inventory.inventorySha256,y.inventory.inventorySha256);assert.deepEqual(x.authority,y.authority);
});

test("queue-only absence and soft-deleted values remain pinned without entering chosen authority",async()=>{
  const f=fixture();f.person('earlier','waitlisted');f.person('later','waitlisted');f.queue.push('earlier','later');
  const booking=f.tables.os_records.get('earlier_booking');f.tables.os_records.delete('earlier_booking');
  const absent=await f.read('admission-preview');booking.deleted_at=stamp;f.tables.os_records.set(booking.id,booking);
  const deleted=await f.read('admission-preview');booking.data.notes='Later private text';
  const edited=await f.read('admission-preview');
  assert.notEqual(absent.inventory.inventorySha256,deleted.inventory.inventorySha256);
  assert.notEqual(deleted.inventory.inventorySha256,edited.inventory.inventorySha256);
  for(const x of [absent,deleted,edited]){
    assert.equal(x.suggest({removedWaitlistIds:[],prospectiveConfirmed:[]}), 'later');assert(!x.records.some(r=>r.id===booking.id));
    assert.deepEqual(x.authority,absent.authority);assert.equal(x.chosenGraphPinsSha256,absent.chosenGraphPinsSha256);
  }
});

test("missing or deleted applicable confirmed booking/contact remains a reconciliation refusal",async()=>{
  for(const key of ['old_booking','old_contact'])for(const deleted of [false,true]){
    const f=fixture();const old=f.person('old','confirmed');old.frozen={terms:{...range(),kind:'session'}};
    if(deleted)f.tables.os_records.get(key).deleted_at=stamp;else f.tables.os_records.delete(key);
    await assert.rejects(f.read('admission-preview'),e=>e.status===404||e.code==='participation_group_reconcile');
  }
});

import { readGroupTargetAccess } from "../lib/participation-group-context.mjs";
const targetArgs=f=>({org:ORG,session:session(),targetId:f.source.id});
test("a zero-group target collection proves real access without a roster or NEW admission gates",async()=>{
  for(const moduleId of ['events','volunteers']){
    const f=fixture({moduleId});f.tables.os_participations.clear();f.group=null;
    f.source.status='cancelled';f.source.approval=null;f.source.data.startAt='not-a-current-schedule';
    f.t.mode='paused';f.t.recovery_block=true;
    const x=await readGroupTargetAccess(f.c,targetArgs(f));
    assert.deepEqual(Object.keys(x).sort(),['member','source','t']);assert.equal(x.source.id,'target');assert.equal(x.member.role,'owner');
    assert.equal(x.t.recovery_block,true);assert.equal(x.source.status,'cancelled');
    assert.equal(f.calls[0].sql,SQL.lock);assert.equal(f.calls[1].sql,SQL.utc);assert.equal(f.calls[2].sql,SQL.targetSeed);
    assert(!f.calls.some(c=>/os_participations|os_participation_groups|os_intake|os_publications|os_participant_links|os_events/.test(c.sql)||c.sql.startsWith('WITH moment')));
    assert(!f.calls.some(c=>/FOR SHARE|FOR UPDATE|^(INSERT|UPDATE|DELETE|BEGIN|COMMIT)/.test(c.sql)));
  }
});
test("target access requires current membership/session and both module permissions",async()=>{
  const f=fixture();f.missingSession=true;await assert.rejects(readGroupTargetAccess(f.c,targetArgs(f)),e=>e.status===401&&e.code==='session');
  const noMember=fixture(),query=noMember.c.query;
  noMember.c.query=(sql,args)=>sql.startsWith('SELECT user_id,role,program_ids,revision,')?Promise.resolve(result([])):query(sql,args);
  await assert.rejects(readGroupTargetAccess(noMember.c,targetArgs(noMember)),e=>e.status===403&&e.code==='membership');
  const reader=fixture();reader.member.role='board_reader';
  await assert.rejects(readGroupTargetAccess(reader.c,targetArgs(reader)),e=>e.status===403&&e.code==='role');
  const fresh=fixture();const first=await readGroupTargetAccess(fresh.c,targetArgs(fresh));fresh.member.revision++;
  const second=await readGroupTargetAccess(fresh.c,targetArgs(fresh));assert.notEqual(first.member.membershipSha256,second.member.membershipSha256);
  for(const denied of [f,noMember,reader])assert(!denied.calls.some(c=>c.sql.startsWith('SELECT to_jsonb')));
});
test("target access refuses missing/deleted/wrong-kind/module or cross-org source and target rows",async()=>{
  for(const change of [f=>f.tables.os_records.delete('target'),f=>{f.source.deleted_at=stamp;},
    f=>{f.source.module_id='contacts';},f=>{f.source.data.kind='registration';},f=>{f.source.org_id='other_org';},
    f=>f.tables.os_participation_targets.delete('target'),f=>{f.t.module_id='volunteers';},f=>{f.t.org_id='other_org';}]){
    const f=fixture();change(f);await assert.rejects(readGroupTargetAccess(f.c,targetArgs(f)),code('participation_group_unavailable'));
  }
});
test("target access includes the exact current typed program and rejects missing/deleted/wrong/hidden program edges",async()=>{
  const f=fixture();f.source.data.programId='program';f.record('program','programs',{title:'Current fictional program',kind:'assumption'});
  const x=await readGroupTargetAccess(f.c,targetArgs(f));assert.equal(x.source.data.programId,'program');
  assert(f.calls.some(c=>c.sql.startsWith('SELECT to_jsonb')&&c.args[1]==='program'));
  for(const change of [g=>g.tables.os_records.delete('program'),g=>{g.tables.os_records.get('program').deleted_at=stamp;},
    g=>{g.tables.os_records.get('program').module_id='contacts';},g=>{g.tables.os_records.get('program').org_id='other_org';},
    g=>{g.member.role='program_lead';g.member.program_ids=['different_program'];}]){
    const g=fixture();g.source.data.programId='program';g.record('program','programs',{title:'Current fictional program',kind:'program'});change(g);
    await assert.rejects(readGroupTargetAccess(g.c,targetArgs(g)),code('participation_group_unavailable'));
  }
});
test("target access rejects client modes, extra roster fields, traps and getter selectors before SQL",async()=>{
  let touched=0;const f=fixture();const getter=targetArgs(f);Object.defineProperty(getter,'targetId',{enumerable:true,get(){touched++;return'target';}});
  const nested=targetArgs(f);Object.defineProperty(nested.session.user,'id',{enumerable:true,get(){touched++;return USER;}});
  for(const value of [getter,nested,new Proxy(targetArgs(f),{ownKeys(){touched++;throw Error('trap');}}),
    {...targetArgs(f),readOnly:false},{...targetArgs(f),rosterIds:[]},{...targetArgs(f),targetId:'%74arget'}])
    await assert.rejects(readGroupTargetAccess(f.c,value));
  assert.equal(touched,0);assert.equal(f.calls.length,0);
});
test("target raw identity changes and unexpected SQL errors never become a partial collection access",async()=>{
  const f=fixture(),query=f.c.query;
  f.c.query=async(sql,args)=>{const value=await query(sql,args);if(sql.startsWith('SELECT to_jsonb')&&args[1]==='target'){
    const row=JSON.parse(value.rows[0].json_text);row.data.programId='late_program';return result([{json_text:JSON.stringify(row)}]);}return value;};
  await assert.rejects(readGroupTargetAccess(f.c,targetArgs(f)),code('participation_group_unavailable'));
  const broken=fixture(),original=broken.c.query,failure=new Error('Fictional driver refusal');
  broken.c.query=(sql,args)=>{if(sql===SQL.selectedRecords)throw failure;return original(sql,args);};
  await assert.rejects(readGroupTargetAccess(broken.c,targetArgs(broken)),e=>e===failure);
});
