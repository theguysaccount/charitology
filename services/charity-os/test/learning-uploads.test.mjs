import test from 'node:test';
import assert from 'node:assert/strict';
import {learningUploadPart,learningUploadActor,assembledLearningUpload,storeLearningUploadPart} from '../lib/learning-uploads.mjs';
import {hash} from '../lib/security.mjs';
const member={userId:'fictional-author',createdAtExact:'2026-10-27T00:00:00.000001Z'};
const session={session:{id:'fictional-session'}};
const metadata={version:1,adapter:'nonprofit-learning-native-v1',selection:{kind:'learning-row',recordId:'learning-row'},target:{kind:'new',program:{}}};
const id='a'.repeat(32);
test('native chunk byte boundaries and canonical base64 are closed before persistence',()=>{
 const full=Buffer.alloc(1500000,120).toString('base64');
 assert.equal(learningUploadPart({uploadId:id,index:0,total:6,chunk:full}).total,6);
 assert.equal(learningUploadPart({uploadId:id,index:5,total:6,chunk:Buffer.alloc(500000).toString('base64')}).index,5);
 for(const input of [
  {uploadId:id,index:0,total:7,chunk:full},{uploadId:id,index:0,total:2,chunk:'eA=='},
  {index:1,total:2,chunk:'eA=='},{uploadId:id,index:1,total:2,chunk:''},
  {uploadId:id,index:0,total:1,chunk:'eB=='},{uploadId:id,index:0,total:1,chunk:'eA'},
  {uploadId:id,index:5,total:6,chunk:Buffer.alloc(500001).toString('base64')},
  {uploadId:id,index:0,total:1,chunk:'eA==',actorId:'forged'}])assert.throws(()=>learningUploadPart(input));
});
test('native uploads are purpose and session/member-incarnation separated',()=>{
 const actor=learningUploadActor(member,session);
 assert.match(actor,/^[a-f0-9]{64}$/);assert.notEqual(actor,member.userId);
 assert.notEqual(actor,learningUploadActor(member,{session:{id:'another-session'}}));
 assert.notEqual(actor,learningUploadActor({...member,createdAtExact:'2026-10-27T00:00:00.000002Z'},session));
});
test('native assembly requires exact full bytes, all part checksums and source adapter limit',async()=>{
 const native=Buffer.alloc(1500001,120),parts=[native.subarray(0,1500000),native.subarray(1500000)];
 let rows=parts.map((bytes,part)=>({part,total:2,bytes,checksum:hash(bytes)}));
 const c={query:async(sql,args)=>{assert.match(sql,/actor_id=\$3 AND expires_at>now/);assert.deepEqual(args,['org',id,learningUploadActor(member,session)]);return{rows};}};
 const input={metadata,upload:{uploadId:id,byteLength:native.length,sha256:hash(native)}};
 const assembled=await assembledLearningUpload(c,{org:'org',member,session,input});
 assert.deepEqual(assembled.native,native);assert.deepEqual(assembled.metadata,metadata);
 for(const changed of [{...input,unexpected:true},{...input,upload:{...input.upload,sha256:'f'.repeat(64)}},
   {...input,upload:{...input.upload,byteLength:native.length+1}},
   {...input,metadata:{...metadata,adapter:'theory-of-change-native-v1',selection:{kind:'whole-draft'}}}])
   await assert.rejects(assembledLearningUpload(c,{org:'org',member,session,input:changed}));
 const original=rows;for(const changed of [rows.slice(1),[rows[1],rows[0]],rows.map(r=>({...r,checksum:'0'.repeat(64)})),rows.map(r=>({...r,total:3}))]){
  rows=changed;await assert.rejects(assembledLearningUpload(c,{org:'org',member,session,input}),e=>e.code==='learning_upload');
 }rows=original;
});
test('a later native part cannot allocate a new slot or bypass the start gate',async()=>{
 let queries=0;
 await assert.rejects(storeLearningUploadPart({query:async()=>{queries++;return{rows:[],rowCount:0};}},
  {org:'org',member,session,input:{uploadId:id,index:1,total:2,chunk:'eA=='}}),e=>e.code==='learning_upload'&&e.status===409);
 assert.equal(queries,1);
});
