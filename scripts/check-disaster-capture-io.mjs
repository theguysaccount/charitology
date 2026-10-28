import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {tempRepository,captureFixture,writeCandidate} from './lib/disaster-io-fixtures.mjs';
import {createDisasterCaptureService} from '../src/lib/disaster-incidents/capture-io.mjs';
import {readWorkingDisasterInventory,methodSourcePaths} from '../src/lib/disaster-incidents/git.mjs';
import {canonicalBytes} from '../src/lib/disaster-incidents/canonical.mjs';
let passed=0;
async function test(name,run){if(process.env.DISASTER_IO_GROUP&&!name.includes(process.env.DISASTER_IO_GROUP))return;const t=tempRepository();try{const f=await captureFixture(t),s=createDisasterCaptureService({repo:t.repo}),root=writeCandidate(s.locations,f);await run({t,f,s,root});console.log('ok '+ ++passed+' '+name);}finally{t.cleanup();}}
function assertAbsentJournal(s){assert(!fs.existsSync(s.locations.journal));assert(!fs.existsSync(s.locations.lock));}
function observeJournal(s,predicate,action){let observed=false,error;const timer=setInterval(()=>{try{if(observed||!fs.existsSync(s.locations.journal))return;const e=JSON.parse(fs.readFileSync(s.locations.journal));if(predicate(e)){observed=true;action(e);}}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))error=e;}},1);return()=>{clearInterval(timer);if(error)throw error;assert(observed,'actual journal phase was observed');};}
await test('prepare stays private; exact hash installs; Retry binds request and is idempotent',async({t,f,s,root})=>{const p=await s.prepareCapture(f.request);assert.equal(readWorkingDisasterInventory(t.repo).size,0);assert(p.totals.preparedBytes>p.totals.coreHistoryBytes+p.totals.generatedArtifactBytes);const r=await s.installCapture(p.proposalHash);assert.equal(r.outcome,'installed');const actual=readWorkingDisasterInventory(t.repo);assert.equal(actual.size,f.files.size);for(const[file,bytes]of f.files)assert.deepEqual(actual.get(file),Buffer.from(bytes));fs.writeFileSync(path.join(root,'request.json'),canonicalBytes({...f.request,interpretationCommit:'f'.repeat(40)}));assert.equal((await s.retryCapture(p.proposalHash)).outcome,'stale');fs.writeFileSync(path.join(root,'request.json'),canonicalBytes(f.request));assert.equal((await s.retryCapture(p.proposalHash)).outcome,'already-installed');assertAbsentJournal(s);});
await test('explicit hash and closed request are mandatory',async({f,s})=>{await assert.rejects(s.installCapture('no'));await assert.rejects(s.cancelCapture('no'));await assert.rejects(s.prepareCapture({...f.request,extra:true}));assert.equal((await s.cancelCapture('a'.repeat(64))).outcome,'canceled');assertAbsentJournal(s);});
await test('changed raw private original cannot be resealed',async({f,s,root})=>{fs.appendFileSync(path.join(root,'originals/synthetic-original'),'altered');await assert.rejects(s.prepareCapture(f.request),/exact private original/);assertAbsentJournal(s);});
await test('unlisted candidate file and candidate symlink refuse',async({f,s,root})=>{fs.writeFileSync(path.join(root,'receipt.json'),'{}');await assert.rejects(s.prepareCapture(f.request),/unlisted file/);fs.unlinkSync(path.join(root,'receipt.json'));fs.symlinkSync(path.join(root,'request.json'),path.join(root,'originals/symlink'));await assert.rejects(s.prepareCapture(f.request));assertAbsentJournal(s);});
await test('post-preview candidate bytes and semantic working bytes return stale without activation',async({t,f,s,root})=>{const p=await s.prepareCapture(f.request);const target=path.join(root,'proposed/notes/test-source/v1.json');fs.appendFileSync(target,' ');assert.equal((await s.installCapture(p.proposalHash)).outcome,'stale');fs.writeFileSync(target,f.files.get('notes/test-source/v1.json'));const semantic=path.join(t.repo,methodSourcePaths()[0]);fs.appendFileSync(semantic,'\n// changed after preview');assert.equal((await s.installCapture(p.proposalHash)).outcome,'stale');assert.equal(readWorkingDisasterInventory(t.repo).size,0);assertAbsentJournal(s);});
await test('another live maintainer lock refuses without touching it',async({f,s})=>{fs.writeFileSync(s.locations.lock,canonicalBytes({version:1,pid:process.pid,nonce:'attempt-live'}));await assert.rejects(s.prepareCapture(f.request),/live maintainer/);assert(fs.existsSync(s.locations.lock));fs.unlinkSync(s.locations.lock);});
await test('preaborted prepare and install cannot activate data',async({t,f,s})=>{await assert.rejects(s.prepareCapture(f.request,AbortSignal.abort(new Error('Canceled'))));const p=await s.prepareCapture(f.request);await assert.rejects(s.installCapture(p.proposalHash,AbortSignal.abort(new Error('Canceled'))));assert.equal(readWorkingDisasterInventory(t.repo).size,0);assertAbsentJournal(s);});
await test('actual fixed fetch adapter handles mocked transport bounds and cross-process lock',async({t,f,s})=>{
  const realFetch=globalThis.fetch;let active=0,peak=0;
  const selection={descriptor:'maui-projects',candidateId:'fetch-test'};
  try{
    globalThis.fetch=async(url,options)=>{assert.equal(url,'https://www.mauirecovers.org/recoveryprojects');assert.equal(options.redirect,'manual');return new Response(f.body,{status:200,headers:{'content-type':'text/html'}});};
    const a=await s.fetchDescriptorOriginal(selection),original=path.join(s.locations.candidates,'fetch-test',a.original.privatePath);
    assert(fs.readFileSync(original).equals(f.body));
    globalThis.fetch=async()=>new Response('failure',{status:503});
    assert.equal((await s.fetchDescriptorOriginal(selection)).original.status,503);
    globalThis.fetch=async()=>{throw new TypeError('Injected transport failure');};
    const unavailable=await s.fetchDescriptorOriginal(selection);assert.equal(unavailable.original.status,null);assert.equal(unavailable.original.original,null);assert.match(unavailable.original.attemptedAt,/^202\d-/);
    globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.error(new Error('Injected body failure'));}}),{status:200});
    assert.equal((await s.fetchDescriptorOriginal(selection)).original.status,null);
    assert(fs.readFileSync(original).equals(f.body));
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://foreign.invalid/'}});
    await assert.rejects(s.fetchDescriptorOriginal(selection),/exact reviewed descriptor/);
    globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8*1024*1024+1));c.close();}}),{status:200});
    await assert.rejects(s.fetchDescriptorOriginal(selection),/streamed original exceeds/);
    globalThis.fetch=async(url,options)=>{active++;peak=Math.max(peak,active);return await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{active--;reject(options.signal.reason);},{once:true}));};
    for(const invalid of[{descriptor:'not-allowed',candidateId:'fetch-test'},{descriptor:'maui-projects',candidateId:''},null]){
      const first=s.fetchDescriptorOriginal(selection),rejection=assert.rejects(first,/Superseded/);while(!active)await new Promise(r=>setTimeout(r,1));
      const other=createDisasterCaptureService({repo:t.repo});await assert.rejects(other.fetchDescriptorOriginal(selection),/live maintainer/);
      const module=pathToFileURL(path.resolve('src/lib/disaster-incidents/capture-io.mjs')).href;
      const code=`import{createDisasterCaptureService}from ${JSON.stringify(module)};globalThis.fetch=()=>{throw new Error('Transport must not run');};try{await createDisasterCaptureService({repo:${JSON.stringify(t.repo)}}).fetchDescriptorOriginal(${JSON.stringify(selection)});process.exitCode=3;}catch(e){process.exitCode=e.message.includes('live maintainer')?0:2;}`;
      const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:'ignore'});assert.equal((await once(child,'close'))[0],0);
      await assert.rejects(s.fetchDescriptorOriginal(invalid));await rejection;assert.equal(active,0);
    }
    const first=s.fetchDescriptorOriginal(selection),firstRejected=assert.rejects(first,/Superseded/);while(!active)await new Promise(r=>setTimeout(r,1));const second=s.fetchDescriptorOriginal(selection),secondRejected=assert.rejects(second,/Superseded/),third=s.fetchDescriptorOriginal(null),thirdRejected=assert.rejects(third);await Promise.all([firstRejected,secondRejected,thirdRejected]);assert.equal(active,0);
    assert.equal(peak,1);
    const full=path.join(s.locations.candidates,'full-private','originals');fs.mkdirSync(full,{recursive:true});for(let i=0;i<4;i++)fs.writeFileSync(path.join(full,'full-'+i),Buffer.alloc(8*1024*1024));
    globalThis.fetch=async()=>new Response(f.body,{status:200});
    await assert.rejects(s.fetchDescriptorOriginal({...selection,candidateId:'full-private'}),/new original would exceed/);assert.equal(fs.readdirSync(full).length,4);
    assert.equal(readWorkingDisasterInventory(t.repo).size,0);
  }finally{globalThis.fetch=realFetch;}
});
await test('actual30-second transport deadline yields access loss without body replacement',async({f,s})=>{const realFetch=globalThis.fetch,keepAlive=setInterval(()=>{},1000);try{globalThis.fetch=async(url,options)=>await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));const at=performance.now(),receipt=await s.fetchDescriptorOriginal({descriptor:'maui-projects',candidateId:'deadline-test'}),elapsed=performance.now()-at;assert(elapsed>=29000&&elapsed<40000);assert.equal(receipt.original.status,null);assert.equal(receipt.original.original,null);assert.equal(receipt.material,null);assert.equal(fs.readdirSync(path.join(s.locations.candidates,'deadline-test')).length,0);}finally{clearInterval(keepAlive);globalThis.fetch=realFetch;}});
await test('actual held final-inventory and owned-write boundaries revoke stale fetch authority',async({f,s})=>{
  const realFetch=globalThis.fetch,realOpen=fsp.open,realOpendir=fsp.opendir,realUnlink=fsp.unlink;
  try{globalThis.fetch=async()=>new Response(f.body,{status:200});
    for(const boundary of['scan','write','delivery']){let enter,release,scans=0;const entered=new Promise(r=>enter=r),barrier=new Promise(r=>release=r),candidateId='boundary-'+boundary,root=path.join(s.locations.candidates,candidateId);
      fsp.opendir=async function(p,...args){if(boundary==='scan'&&p===root&&++scans===2){enter();await barrier;}return await realOpendir.call(this,p,...args);};
      fsp.open=async function(p,...args){const fd=await realOpen.call(this,p,...args);if(boundary==='write'&&String(p).startsWith(path.join(root,'originals','original-'))){enter();await barrier;}return fd;};
      fsp.unlink=async function(p,...args){if(boundary==='delivery'&&p===s.locations.lock){enter();await barrier;}return await realUnlink.call(this,p,...args);};
      const held=s.fetchDescriptorOriginal({descriptor:'maui-projects',candidateId}),rejected=assert.rejects(held,/Superseded/);await entered;const invalid=s.fetchDescriptorOriginal(null),invalidRejected=assert.rejects(invalid);release();await Promise.all([rejected,invalidRejected]);
      const originals=path.join(root,'originals');assert.equal(fs.existsSync(originals)?fs.readdirSync(originals).length:0,0);fsp.open=realOpen;fsp.opendir=realOpendir;fsp.unlink=realUnlink;
    }
  }finally{globalThis.fetch=realFetch;fsp.open=realOpen;fsp.opendir=realOpendir;fsp.unlink=realUnlink;}
});
await test('actual adding-phase cancellation removes only proven owned additions',async({t,f,s})=>{const p=await s.prepareCapture(f.request),controller=new AbortController();const stop=observeJournal(s,e=>e.journal.phase==='adding'&&e.journal.ownedAdditions.length>=1,()=>controller.abort(new Error('Canceled during actual adding')));let r;try{r=await s.installCapture(p.proposalHash,controller.signal);}finally{stop();}assert.equal(r.outcome,'canceled');assert.equal(readWorkingDisasterInventory(t.repo).size,0);assertAbsentJournal(s);assert.equal((await s.retryCapture(p.proposalHash)).outcome,'installed');});
await test('actual post-commit cancellation retains exact head and returns already-installed',async({t,f,s})=>{const p=await s.prepareCapture(f.request),controller=new AbortController(),stop=observeJournal(s,e=>e.journal.phase==='head-committed',()=>controller.abort(new Error('Canceled after actual atomic registry replacement')));let r;try{r=await s.installCapture(p.proposalHash,controller.signal);}finally{stop();}assert.equal(r.outcome,'already-installed');assert(readWorkingDisasterInventory(t.repo).has('registry.json'));assertAbsentJournal(s);});
await test('actual adding-phase private-body mutation returns stale and cannot activate',async({t,f,s,root})=>{const p=await s.prepareCapture(f.request),stop=observeJournal(s,e=>e.journal.phase==='adding'&&e.journal.ownedAdditions.length>=1,()=>fs.appendFileSync(path.join(root,'originals/synthetic-original'),'changed after seal'));try{assert.equal((await s.installCapture(p.proposalHash)).outcome,'stale');}finally{stop();}assert.equal(readWorkingDisasterInventory(t.repo).size,0);assertAbsentJournal(s);});
await test('same-byte foreign replacement is preserved and requires recovery',async({f,s})=>{const p=await s.prepareCapture(f.request),controller=new AbortController();let foreign;const stop=observeJournal(s,e=>e.journal.phase==='adding'&&e.journal.ownedAdditions.length>=1,e=>{foreign=path.join(s.locations.active,e.journal.ownedAdditions[0].file.path);const bytes=fs.readFileSync(foreign);fs.unlinkSync(foreign);fs.writeFileSync(foreign,bytes);controller.abort(new Error('Canceled after foreign replacement'));});let r;try{r=await s.installCapture(p.proposalHash,controller.signal);}finally{stop();}assert.equal(r.outcome,'recovery-required');assert(fs.existsSync(foreign));assert(fs.existsSync(s.locations.journal));await assert.rejects(s.cancelCapture(p.proposalHash),/replaced|changed|uncertain/);assert(fs.existsSync(foreign));});
async function crashAt(s,hash,boundary){
  assert(['before-next-addition','after-staged-unlink'].includes(boundary));
  const module=pathToFileURL(path.resolve('src/lib/disaster-incidents/capture-io.mjs')).href;
  // A parent polling timer cannot stop the child at an exact journal boundary:
  // it may already be creating the next unjournaled file when SIGKILL arrives.
  // Hold the actual next exclusive active-file open before creating that file.
  const code=`import fsp from 'node:fs/promises';import fs from 'node:fs';import path from 'node:path';import {constants} from 'node:fs';
  const locations=${JSON.stringify({active:s.locations.active,journal:s.locations.journal,stage:s.locations.stage})},realOpen=fsp.open,realUnlink=fsp.unlink;
  if(${JSON.stringify(boundary==='before-next-addition')})fsp.open=async function(file,flags,...rest){
    if(typeof file==='string'&&file.startsWith(locations.active+path.sep)&&(flags&constants.O_CREAT)){
      const env=JSON.parse(fs.readFileSync(locations.journal,'utf8'));
      if(env.journal.phase==='adding'&&env.journal.ownedAdditions.length>=1){fs.writeSync(1,'held-next-active-open\\n');process.kill(process.pid,'SIGKILL');await new Promise(()=>{});}
    }
    return realOpen.call(this,file,flags,...rest);
  };
  if(${JSON.stringify(boundary==='after-staged-unlink')})fsp.unlink=async function(file,...rest){
    const result=await realUnlink.call(this,file,...rest);
    if(typeof file==='string'&&file.startsWith(locations.stage+path.sep)&&file.includes(path.sep+'proposed'+path.sep)){
      const env=JSON.parse(fs.readFileSync(locations.journal,'utf8'));
      if(env.journal.phase==='head-committed'){fs.writeSync(1,'held-after-staged-unlink\\n');process.kill(process.pid,'SIGKILL');await new Promise(()=>{});}
    }
    return result;
  };
  const {createDisasterCaptureService}=await import(${JSON.stringify(module)});await createDisasterCaptureService({repo:${JSON.stringify(s.locations.repo)}}).installCapture(${JSON.stringify(hash)});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let stderr='',stdout='';child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',b=>stdout+=b);const closed=once(child,'close');const stop=()=>assert(stdout.includes(boundary==='before-next-addition'?'held-next-active-open':'held-after-staged-unlink'),stderr);
  const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);try{const[,signal]=await closed;stop();assert.equal(signal,'SIGKILL',stderr);}finally{clearTimeout(timeout);}
}
await test('actual pre-head crash refuses third head/unlogged files, then explicit Retry installs',async({t,f,s})=>{const p=await s.prepareCapture(f.request);await crashAt(s,p.proposalHash,'before-next-addition');assert(fs.existsSync(s.locations.journal));const head=path.join(s.locations.active,'registry.json');fs.writeFileSync(head,canonicalBytes({foreign:true}));await assert.rejects(s.retryCapture(p.proposalHash),/neither exact predecessor/);assert(fs.existsSync(head));assert(fs.existsSync(s.locations.journal));fs.unlinkSync(head);const foreign=path.join(s.locations.active,'foreign.json');fs.writeFileSync(foreign,'foreign');await assert.rejects(s.retryCapture(p.proposalHash),/unjournaled or foreign/);assert(fs.existsSync(foreign));assert(fs.existsSync(s.locations.journal));fs.unlinkSync(foreign);const r=await s.retryCapture(p.proposalHash);assert.equal(r.outcome,'installed');assert(readWorkingDisasterInventory(t.repo).has('registry.json'));assertAbsentJournal(s);});
await test('actual crash during post-head staged cleanup verifies whole inventory and Retry',async({t,f,s})=>{const p=await s.prepareCapture(f.request);await crashAt(s,p.proposalHash,'after-staged-unlink');assert(fs.existsSync(s.locations.journal));assert(readWorkingDisasterInventory(t.repo).has('registry.json'));const foreign=path.join(s.locations.active,'foreign.json');fs.writeFileSync(foreign,'foreign');await assert.rejects(s.retryCapture(p.proposalHash),/exact approved staged/);assert(fs.existsSync(foreign));assert(fs.existsSync(s.locations.journal));fs.unlinkSync(foreign);assert.equal((await s.retryCapture(p.proposalHash)).outcome,'already-installed');assertAbsentJournal(s);});
console.log(`${passed} actual maintainer I/O groups passed; synthetic owned repositories only.`);
