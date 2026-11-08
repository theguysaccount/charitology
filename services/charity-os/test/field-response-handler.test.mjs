// Actual Request -> main auth/CSRF -> FIELD transport/transaction dispatch.
// Callbacks stay unexecuted here; real SQL authority/business checks are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.mjs';
import { csrf, hash } from '../lib/security.mjs';
const settings={origin:'https://os.example.invalid',secret:'fictional-field-handler-secret-at-least32'};
const session={session:{id:'field_session'},user:{id:'field_actor',email:'staff@example.invalid'}};
const base='/api/orgs/field_org/field-responses';
function fixture(){
 const calls=[],limits=[];
 const db={async limit(...args){limits.push(args);},async tx(user,org,callback,options){
  assert.equal(user,session.user.id);assert.equal(org,'field_org');assert.equal(typeof callback,'function');calls.push(options);return {boundary:true};
 }};
 const handle=createHandler({settings,db,auth:{api:{async getSession(){return session;}}},send:async()=>{throw Error('No mail');}});
 const request=(suffix,{method='POST',body='{}',headers={},token=true}={})=>new Request(settings.origin+base+suffix,{
  method,headers:{origin:settings.origin,'content-type':'application/json',...(token?{'x-csrf-token':csrf(session.session.id,settings.secret)}:{}),...headers},
  ...(['GET','HEAD'].includes(method)?{}:{body}),
 });
 return {calls,limits,handle,request};
}
test('FIELD context/history dispatch through read-only transactions and the bounded user read limit',async()=>{
 for(const suffix of ['/context','/history','/history/report']){
  const f=fixture(),response=await f.handle(f.request(suffix,{method:'GET'}));
  assert.equal(response.status,200);assert.deepEqual(f.calls,[{readOnly:true}]);
  assert.deepEqual(f.limits,[['field-response-read:'+hash(session.user.id),120,3600]]);
 }
});
test('FIELD inspect preflights staff before its strict reader and remains read-only',async()=>{
 const f=fixture(),response=await f.handle(f.request('/inspect'));
 assert.equal(response.status,200);assert.deepEqual(f.calls,[{readOnly:true},{readOnly:true}]);
 assert.deepEqual(f.limits,[['field-response-write:'+hash(session.user.id),60,3600],['field-response-inspect:'+hash(session.user.id),6,900]]);
});
test('FIELD preview separates the read-only permission preflight from its locked write',async()=>{
 const f=fixture(),response=await f.handle(f.request('/preview'));
 assert.equal(response.status,200);assert.deepEqual(f.calls,[{readOnly:true},{lock:true}]);
});
for(const [name,body] of [['duplicate JSON fields','{"fileBase64":"a","fileBase64":"b"}'],['invalid UTF8',Uint8Array.of(0xc3,0x28)]])
 test('FIELD '+name+' refuses after preflight and before business transaction',async()=>{
  const f=fixture(),response=await f.handle(f.request('/inspect',{body}));assert.equal(response.status,422);assert.deepEqual(f.calls,[{readOnly:true}]);
 });
test('FIELD body cap and unsupported transport refuse before business transaction',async()=>{
 for(const options of [{body:' '.repeat(524289)},{headers:{'content-type':'text/plain'}},{headers:{'content-encoding':'gzip'}}]){
  const f=fixture(),response=await f.handle(f.request('/preview',options));assert([413,415].includes(response.status));assert.deepEqual(f.calls,[{readOnly:true}]);
 }
});
test('FIELD retains global CSRF and rejects HEAD, extra routes and read-body indicators',async()=>{
 for(const [suffix,options,status] of [['/preview',{token:false},403],['/context',{method:'HEAD'},405],['/unknown',{},404],['/history',{method:'GET',headers:{'content-length':'1'}},400]]){
  const f=fixture(),response=await f.handle(f.request(suffix,options));assert.equal(response.status,status);assert.equal(f.calls.length,0);assert.equal(f.limits.length,0);
 }
});
