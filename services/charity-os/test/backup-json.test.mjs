import test from "node:test";
import assert from "node:assert/strict";
import { parseBackupJson, readBackupBody, MAX_BACKUP_JSON_BYTES, DIRECT_BACKUP_JSON_BYTES } from "../lib/backup-json.mjs";
import { uploadedBackup, MAX_BACKUP_BYTES } from "../lib/uploads.mjs";
import { makeBackup, validateBackup } from "../lib/backup.mjs";
import { exampleRecords } from "../lib/modules.mjs";
import { hash } from "../lib/security.mjs";
const org = { name:"Fictional organization",currency:"USD",time_zone:"UTC" };
const reject = (fn, code="backup_json") => assert.throws(fn,e=>e.status===(code==="size"?413:422)&&e.code===code);
function streamRequest(chunks, headers = {}) {
  let index=0,cancelled=0;
  const body=new ReadableStream({pull(c){if(index===chunks.length)c.close();else c.enqueue(chunks[index++]);},cancel(){cancelled++;}});
  return {request:new Request("https://os.example/api/orgs/fiction/import/preview",{method:"POST",headers,body,duplex:"half"}),cancelled:()=>cancelled,read:()=>index};
}
function uploaded(bytes) {
  const parts=[];for(let i=0;i<bytes.length;i+=1500000)parts.push(bytes.subarray(i,i+1500000));
  return uploadedBackup({query:async()=>({rows:parts.map((bytes,part)=>({part,total:parts.length,bytes}))})},"fiction","actor","fictional-upload");
}

test("backup lexer admits ordinary JSON values without changing parsed semantics",()=>{
  for(const text of ['{}','[]','null','true','false','0','-0','1.25e+2','"literal \\u003csource\\u003e"','{"a":[null,0,false,{"same":1}],"b":{"same":2}}'])assert.deepEqual(parseBackupJson(text),JSON.parse(text));
  assert.equal(Object.is(parseBackupJson('-0'),-0),true);
  assert.deepEqual(parseBackupJson(Buffer.from('{"unicode":"同じ 🌍"}')),{unicode:"同じ 🌍"});
});
test("decoded duplicate fields are rejected inside nested packets, source descriptors and unrelated old backup objects",()=>{
  for(const text of [
    '{"directoryResources":{"bindings":[{"events":[{"packet":{"selection":{"captureId":"a","\\u0063aptureId":"b"}}}]}]}}',
    '{"directoryResources":{"captures":[{"core":{"catalogs":[{"entries":[{"entrySha256":"a","entry\\u0053ha256":"b"}]}]}}]}}',
    '{"records":[{"snapshot":{"data":{"title":"first","t\\u0069tle":"last"}}}]}',
    '{"x":{"\\ud834\\udd1e":1,"𝄞":2}}',
    '{"__proto__":1,"\\u005f_proto__":2}',
  ]) reject(()=>parseBackupJson(text));
  assert.deepEqual(parseBackupJson('{"first":{"same":1},"second":{"same":2}}'),{first:{same:1},second:{same:2}});
});
test("strict syntax rejects malformed strings, leading zeros, comma holes, trailing values and BOM",()=>{
  for(const text of ['', ' ', '\ufeff{}','{a:1}','{"a":1,}','[1,]','[,1]','{"a" 1}','[01]','[-]','[1.]','[1e]','[1e+]','[+1]','{} {}','true false','"raw\nline"','"\\x01"','"\\u00zz"','"unterminated','[NaN]','[Infinity]','{"a":undefined}'])reject(()=>parseBackupJson(text));
  reject(()=>parseBackupJson(Buffer.from([0xef,0xbb,0xbf,123,125])));
});
test("nonfinite numeric aliases fail before complete JSON.parse and cannot borrow a null checksum",()=>{
  const backup=makeBackup(org,[],{legacyUnknown:null});
  const aliased=JSON.stringify(backup).replace('"legacyUnknown":null','"legacyUnknown":1e999');
  const lossy=JSON.parse(aliased);
  assert.equal(lossy.legacyUnknown,Infinity);
  assert.equal(validateBackup(lossy,"dest","restorer").length,0,"the historical checksum hashes Infinity like null");
  reject(()=>parseBackupJson(aliased));
  for(const value of ['1e309','-1e309','9'.repeat(400)])reject(()=>parseBackupJson(`{"nested":[${value}]}`));
  assert.equal(parseBackupJson('1.7976931348623157e308'),Number.MAX_VALUE);
  assert.equal(parseBackupJson('1e-999'),0);
});
test("fatal UTF-8 refuses an invalid byte sequence that replacement decoding would let pass a semantic checksum",async()=>{
  const backup=makeBackup({...org,name:"Fictional � organization"},[]);
  const encoded=Buffer.from(JSON.stringify(backup)),position=encoded.indexOf(Buffer.from([0xef,0xbf,0xbd]));
  assert.ok(position>=0);
  const malformed=Buffer.concat([encoded.subarray(0,position),Buffer.from([0x80]),encoded.subarray(position+3)]);
  assert.equal(validateBackup(JSON.parse(malformed.toString("utf8")),"dest","restorer").length,0);
  reject(()=>parseBackupJson(malformed));
  await assert.rejects(()=>uploaded(malformed),e=>e.code==="backup_json");
  const request=streamRequest([malformed]).request;
  await assert.rejects(()=>readBackupBody(request),e=>e.code==="backup_json");
  for(const malformed of [Buffer.from([0xc0,0xaf]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xf4,0x90,0x80,0x80]),Buffer.from([0xe2,0x82])])reject(()=>parseBackupJson(malformed));
});
test("whole-backup parser has no directory depth8 or150000-node admission ceiling",()=>{
  const depth=10000,text='['.repeat(depth)+'0'+']'.repeat(depth);
  let parsed=parseBackupJson(text);for(let i=0;i<depth;i++)parsed=parsed[0];assert.equal(parsed,0);
  const broad=Array.from({length:160001},(_,i)=>i%3?null:{retained:i});
  assert.equal(parseBackupJson(JSON.stringify(broad)).length,160001);
});
test("actual request reader enforces streamed bytes and cancels overflow independently of Content-Length",async()=>{
  for(const headers of [{},{"content-length":"1"}]){
    const stream=streamRequest([Buffer.alloc(16,32),Buffer.from('{}'),...Array.from({length:8},()=>Buffer.alloc(16,32))],headers);
    await assert.rejects(()=>readBackupBody(stream.request,17),e=>e.code==="size"&&e.status===413);
    assert.equal(stream.cancelled(),1);assert.ok(stream.read()<10);
  }
  const early=streamRequest([Buffer.from('{}')],{"content-length":"18"});
  await assert.rejects(()=>readBackupBody(early.request,17),e=>e.code==="size");assert.equal(early.cancelled(),1);
  const exact=streamRequest([Buffer.from(' {"name":"'),Buffer.from('🌍'),Buffer.from('"} ')]);
  assert.deepEqual(await readBackupBody(exact.request),{name:"🌍"});
  assert.deepEqual(await readBackupBody(new Request("https://os.example/import",{method:"POST"})),{});
});
test("direct request retains its actual8MiB envelope bound",async()=>{
  assert.equal(DIRECT_BACKUP_JSON_BYTES,8*1024*1024);
  const exact=Buffer.alloc(DIRECT_BACKUP_JSON_BYTES,32);exact.write('{}');
  assert.deepEqual(await readBackupBody(streamRequest([exact]).request),{});
  const over=streamRequest([exact,Buffer.from(' '),Buffer.from(' ')]);
  await assert.rejects(()=>readBackupBody(over.request),e=>e.code==="size");assert.equal(over.cancelled(),1);
});
test("uploaded JSON uses the same lexical rules for duplicate fields and nonfinite values",async()=>{
  for(const text of ['{"records":[{"data":{"source":"one","sour\\u0063e":"two"}}]}','{"unrelated":{"value":1e999}}'])await assert.rejects(()=>uploaded(Buffer.from(text)),e=>e.code==="backup_json");
  assert.deepEqual(await uploaded(Buffer.from('{"legacyUnknown":{"source":"literal"}}')),{legacyUnknown:{source:"literal"}});
});
test("an exactly64MiB padded generated old backup remains uploadable and restorable",async()=>{
  assert.equal(MAX_BACKUP_JSON_BYTES,MAX_BACKUP_BYTES);
  const legacy=makeBackup(org,exampleRecords("source"));
  const json=Buffer.from(JSON.stringify(legacy));
  const exact=Buffer.alloc(MAX_BACKUP_BYTES,32);json.copy(exact);
  const parsed=await uploaded(exact);
  assert.equal(parsed.checksum,legacy.checksum);assert.equal(validateBackup(parsed,"dest","restorer").length,26);
  reject(()=>parseBackupJson(Buffer.alloc(MAX_BACKUP_BYTES+1,32)),"size");
});
test("near-quota generated old backup with2000actual records, full snapshots and24MiB files survives lexical intake",async(t)=>{
  const base=exampleRecords("source").find(r=>r.moduleId==="resources");
  const data={...base.data,title:"Resource "+"t".repeat(170),providerName:"p".repeat(240),confirmationReference:"r".repeat(240),catalogUrl:"https://directory.example/"+"c".repeat(575),sourceUrl:"https://source.example/"+"s".repeat(575),limitations:"l".repeat(4000)};
  const records=Array.from({length:2000},(_,i)=>({...base,id:`resource-${i}`,ownerId:"fictional-owner",revision:2,data:{...data},approval:null,snapshot:{revision:1,status:"active",data:{...data},files:[]},createdAt:"2026-10-27T00:00:00.000Z",updatedAt:"2026-10-27T00:00:00.000Z"}));
  const fileBytes=Buffer.alloc(2*1024*1024,97),content=fileBytes.toString("base64"),checksum=hash(fileBytes);
  const files=Array.from({length:12},(_,i)=>({id:`file-${i}`,recordId:`resource-${i}`,name:`fictional-${i}.txt`,mime:"text/plain",checksum,size:fileBytes.length,content}));
  const backup=makeBackup(org,records,{files,trash:[],events:[],comments:[],reports:[]});
  const encoded=Buffer.from(JSON.stringify(backup));
  t.diagnostic(`Generated near-quota backup: ${encoded.length} UTF-8 bytes, 2000 records, 2000 snapshots and 12 complete files.`);
  assert.ok(encoded.length>54*1024*1024,`fixture ${encoded.length} bytes should exercise near-quota full intake`);
  assert.ok(encoded.length<60*1024*1024);
  const parsed=await uploaded(encoded);
  assert.equal(parsed.records.length,2000);assert.equal(parsed.records[1999].snapshot.data.limitations,data.limitations);assert.equal(parsed.files[11].content,content);
  const restored=validateBackup(parsed,"dest","restorer");assert.equal(restored.length,2000);assert.equal(restored[1999].snapshot,null);assert.equal(parsed.checksum,backup.checksum);
});
test("legacy unknown-field behavior remains solely with unchanged downstream validation",()=>{
  const legacy=makeBackup(org,exampleRecords("source"),{oldUnknownExtension:{kept:true}});
  assert.equal(validateBackup(parseBackupJson(JSON.stringify(legacy)),"dest","restorer").length,26);
  const records=exampleRecords("source");records[0].data.unknownField="not admitted";
  const invalid=makeBackup(org,records);
  const parsed=parseBackupJson(JSON.stringify(invalid));
  assert.throws(()=>validateBackup(parsed,"dest","restorer"));
  assert.equal(parsed.records[0].data.unknownField,"not admitted","lexical intake must not silently drop schema evidence");
});
