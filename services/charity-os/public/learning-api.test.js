import test from "node:test";
import assert from "node:assert/strict";
import { api, setCsrfToken } from "./api.js";
import {createHash} from 'node:crypto';

test("learning source transport sends only exact multipart parts, fixed filename, CSRF and abort signal", async (t) => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; setCsrfToken(""); });
  const controller = new AbortController(), metadata = { version: 1, adapter: "theory-of-change-native-v1", selection: { kind: "whole-draft" }, target: { kind: "new", program: { recordId: "program" } } }, bytes = new Uint8Array([123, 125]);
  let captured;
  globalThis.fetch = async (path, options) => { captured = { path, options }; return { ok: true, async json() { return { inspectionId: "inspection" }; } }; };
  setCsrfToken("synthetic-csrf");
  await api.inspectLearningSource("org with space", metadata, bytes, { signal: controller.signal });
  assert.equal(captured.path, "/api/orgs/org%20with%20space/learning/source/inspect");
  assert.equal(captured.options.method, "POST"); assert.equal(captured.options.signal, controller.signal); assert.equal(captured.options.cache, "no-store"); assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.headers["X-CSRF-Token"], "synthetic-csrf"); assert.equal(captured.options.headers["Content-Type"], undefined);
  assert.deepEqual([...captured.options.body.keys()], ["metadata", "native"]);
  assert.deepEqual(JSON.parse(captured.options.body.get("metadata")), metadata);
  const native = captured.options.body.get("native"); assert.equal(native.name, "source.json"); assert.deepEqual(new Uint8Array(await native.arrayBuffer()), bytes);
});

test('large native source requests stay below hosted limits and reconstruct every original byte',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;setCsrfToken('');});
 const native=new Uint8Array(8000000);for(let i=0;i<native.length;i++)native[i]=i%251;
 const signal=new AbortController().signal,requests=[];
 globalThis.fetch=async(path,options)=>{
  const input=JSON.parse(options.body);requests.push({path,options,input});
  assert.ok(Buffer.byteLength(options.body)<4500000);assert.equal(options.signal,signal);
  return{ok:true,json:async()=>path.endsWith('/upload')?{ok:true,uploadId:input.uploadId}:{ok:true,inspectionId:'complete'}};
 };
 setCsrfToken('fictional-upload-csrf');
 const metadata={version:1,adapter:'nonprofit-learning-native-v1'};
 assert.equal((await api.inspectLearningSource('org',metadata,native,{signal})).inspectionId,'complete');
 assert.equal(requests.length,7);const chunks=requests.slice(0,-1);
 assert.equal(new Set(chunks.map(x=>x.input.uploadId)).size,1);
 assert.deepEqual(Buffer.concat(chunks.map(x=>Buffer.from(x.input.chunk,'base64'))),Buffer.from(native));
 assert.deepEqual(requests.at(-1).input,{metadata,upload:{uploadId:chunks[0].input.uploadId,byteLength:native.length,sha256:createHash('sha256').update(native).digest('hex')}});
 for(const [index,item]of chunks.entries()){assert.equal(item.input.index,index);assert.equal(item.input.total,6);assert.equal(item.options.headers['X-CSRF-Token'],'fictional-upload-csrf');}
});

test('lost first chunk response keeps its original upload identity; cancellation sends no later parts',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 const native=new Uint8Array(3000001),requests=[];let lose=true;
 globalThis.fetch=async(path,options)=>{const input=JSON.parse(options.body);requests.push({path,input});
  if(lose){lose=false;throw Error('fictional response loss');}
  return{ok:true,json:async()=>path.endsWith('/upload')?{uploadId:input.uploadId}:{inspectionId:'retried'}};
 };
 await assert.rejects(api.inspectLearningSource('org',{},native));
 const first=requests[0].input.uploadId;
 await api.inspectLearningSource('org',{},native);
 assert.equal(requests[1].input.uploadId,first);assert.equal(requests[1].input.index,0);
 const controller=new AbortController();let calls=0;
 globalThis.fetch=async(path,options)=>{calls++;controller.abort();return{ok:true,json:async()=>({uploadId:JSON.parse(options.body).uploadId})};};
 await assert.rejects(api.inspectLearningSource('org',{},new Uint8Array(3000001),{signal:controller.signal}),e=>e.name==='AbortError');
 assert.equal(calls,1);
});

test('deliberate native inspection retry resumes from the first unconfirmed part',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 const native=new Uint8Array(3000001),parts=[];let lose=true;
 globalThis.fetch=async(path,options)=>{const input=JSON.parse(options.body);
  if(path.endsWith('/upload')){parts.push(input);if(input.index===1&&lose){lose=false;throw Error('fictional second response loss');}}
  return{ok:true,json:async()=>path.endsWith('/upload')?{uploadId:input.uploadId}:{inspectionId:'resumed'}};
 };
 await assert.rejects(api.inspectLearningSource('resume-org',{},native));
 await api.inspectLearningSource('resume-org',{},native);
 assert.deepEqual(parts.map(part=>part.index),[0,1,1,2]);assert.equal(new Set(parts.map(part=>part.uploadId)).size,1);
});

test("learning API preserves exact command DTO and documented cursor-only routes", async (t) => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const requests = [], signal = new AbortController().signal;
  globalThis.fetch = async (path, options) => { requests.push({ path, options }); return { ok: true, async json() { return { ok: true }; } }; };
  const body = { previewId: "preview", reviewSha256: "a".repeat(64), commandKey: "11111111-1111-4111-8111-111111111111" };
  await api.commitLearning("org", body, { signal });
  await api.learningContext("org", "binding/id", "opaque + cursor", { signal });
  await api.learningApproval("org", "known/id", { signal });
  await api.learningRecoveredHead("org", "b".repeat(64), { signal });
  assert.deepEqual(JSON.parse(requests[0].options.body), body); assert.equal(requests[0].options.signal, signal);
  assert.equal(requests[1].path, "/api/orgs/org/learning/bindings/binding%2Fid/context?cursor=opaque%20%2B%20cursor");
  assert.equal(requests[2].path, "/api/orgs/org/learning/records/known%2Fid/approval");
  assert.equal(requests[3].path, `/api/orgs/org/learning/recovered/${"b".repeat(64)}`);
  for (const request of requests.slice(1)) { assert.equal(request.options.method, "GET"); assert.equal(request.options.body, undefined); }
});
