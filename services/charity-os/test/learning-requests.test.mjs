import test from 'node:test';
import assert from 'node:assert/strict';
import {readLearningBytes,readLearningJSON,readLearningUpload,learningCommitInput,learningQuery} from '../lib/learning-requests.mjs';
const json=body=>new Request('http://localhost/learning',{method:'POST',headers:{'content-type':'application/json'},body});
test('learning requests reject decoded duplicate names, invalid UTF-8 and nonfinite numbers before ordinary JSON admission',async()=>{
 for(const bytes of ['{"a":1,"\\u0061":2}','{"x":1e999}',new Uint8Array([0xff]),'\ufeff{}'])
  await assert.rejects(readLearningJSON(json(bytes)),error=>error.code?.startsWith('learning_'));
});
test('learning stream overrun cancels the underlying reader and preserves the documented size error',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(65));},cancel(){cancelled=true;throw Error('provider cancel failed');}});
 const request=new Request('http://localhost/learning',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(readLearningBytes(request,64),error=>error.status===413&&error.code==='learning_size');
 assert.equal(cancelled,true);
});
test('learning aborted request refuses before reading the native source',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(readLearningJSON(new Request('http://localhost/learning',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:controller.signal})),e=>e.status===408);
});
test('deadline cancels a never-closed stream without accepting its complete JSON prefix',async t=>{
 let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled=true;}});
 const request=new Request('http://localhost/learning',{method:'POST',body:stream,duplex:'half'});
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=readLearningBytes(request,64);
 const rejected=assert.rejects(pending,e=>e.status===408&&e.code==='learning_request');
 await new Promise(setImmediate);
 t.mock.timers.tick(30000);
 await rejected;assert.equal(cancelled,true);
});
test('learning JSON uses its exact media type and complete content-length bound',async()=>{
 await assert.rejects(readLearningJSON(new Request('http://localhost/learning',{method:'POST',body:'{}'})),e=>e.status===415);
 await assert.rejects(readLearningBytes(new Request('http://localhost/learning',{method:'POST',headers:{'content-length':'65'},body:'{}'}),64),e=>e.status===413);
 assert.deepEqual(await readLearningJSON(json('{"value":0,"missing":null}')),{value:0,missing:null});
});
test('multipart admits exactly metadata and native; filenames and MIME grant no provenance',async()=>{
 const metadata={version:1,adapter:'theory-of-change-native-v1',selection:{kind:'whole-draft'},target:{kind:'new',program:{}}};
 const data=new FormData();data.append('metadata',JSON.stringify(metadata));data.append('native',new Blob(['{}'],{type:'image/png'}),'private-name.png');
 const admitted=await readLearningUpload(new Request('http://localhost/learning',{method:'POST',body:data}));
 assert.deepEqual(Object.keys(admitted).sort(),['metadata','native']);assert.equal(new TextDecoder().decode(admitted.native),'{}');
 data.append('metadata',JSON.stringify(metadata));
 await assert.rejects(readLearningUpload(new Request('http://localhost/learning',{method:'POST',body:data})),e=>e.code==='learning_multipart');
});
test('commit and query admission reject extra authority, repeated parameters and noncanonical command keys',()=>{
 const valid={previewId:'p',reviewSha256:'a'.repeat(64),commandKey:'01234567-89ab-4cde-8fab-0123456789ab'};
 assert.deepEqual(learningCommitInput(valid),valid);
 for(const invalid of [{...valid,source:{}},{...valid,commandKey:valid.commandKey.toUpperCase()}])assert.throws(()=>learningCommitInput(invalid));
 for(const query of ['?cursor=a&cursor=b','?source=private','?path=wrong'])assert.throws(()=>learningQuery(new URL('http://localhost/api/orgs/o/learning/bindings'+query),['cursor']));
 assert.equal(learningQuery(new URL('http://localhost/api/orgs/o/learning/bindings?cursor=abc'),['cursor']).get('cursor'),'abc');
});
