import assert from "node:assert/strict";
import {test} from "node:test";
import {csrf,hash} from "../lib/security.mjs";
import {volunteerSubstitutionStaffRoutes as route} from "../lib/volunteer-substitution-routes.mjs";

const origin="https://staff-fixture.invalid", secret="fictional-volunteer-substitution-test-secret";
const session={session:{id:"fictional-session"},user:{id:"fictional-staff",emailVerified:true}};
const orgId="fixture-org", intentId="a".repeat(32), base=`${origin}/api/orgs/${orgId}/volunteer-substitutions`;
const token=csrf(session.session.id,secret);
const wire={version:1,reviewSha256:"c".repeat(64),idempotencyKey:"private-exact-fixture-v1",acknowledge:true};
const args=()=>{
  const commands=[],limits=[];
  return {enabled:true,session,settings:{origin,secret},commands,limits,
    db:{async limit(...v){limits.push(v);},tx(){throw Error("No offer is issued by this transport fixture.");}},
    staff:{async review(v){commands.push(["review",v]);return {ok:true,review:{version:1,ready:false}};},
      async confirm(v){commands.push(["confirm",v]);return {ok:true,decision:{version:1},replayed:true};}}};
};
const post=(path,body,headers={})=>new Request(base+path,{method:"POST",headers:{
  origin,"x-csrf-token":token,"content-type":"application/json",...headers},body});

test("disabled, query-bearing, wrong-method and unsigned requests never reach the staff service",async()=>{
  const a=args(), target=new Request(`${base}/${intentId}/review`);
  assert.equal(await route({...a,request:target,enabled:false}),null);
  await assert.rejects(route({...a,request:new Request(target.url+"?staff=other")}),{code:"substitution_path"});
  await assert.rejects(route({...a,request:post(`/${intentId}/review`,"{}")}),{code:"substitution_method"});
  await assert.rejects(route({...a,request:target,session:null}),{status:401});
  await assert.rejects(route({...a,request:post(`/${intentId}/confirm`,JSON.stringify(wire),{origin:"https://foreign.invalid"})}),{code:"origin"});
  assert.deepEqual(a.commands,[]);
  assert.deepEqual(a.limits,[]);
});

test("closed, bounded UTF-8 requests refuse repeated fields and client-selected subjects",async()=>{
  const a=args(),url=`/${intentId}/confirm`;
  await assert.rejects(route({...a,request:post(url,'{"version":1,"version":1}') }),{code:"substitution_json"});
  await assert.rejects(route({...a,request:post(url,JSON.stringify({...wire,contactId:"do-not-accept"}))}),{code:"substitution_fields"});
  await assert.rejects(route({...a,request:post(url,JSON.stringify({data:"x".repeat(1200)}))}),{status:413});
  await assert.rejects(route({...a,request:post(url,"{}",{"content-type":"text/plain"})}),{status:415});
  assert.deepEqual(a.commands,[]);
});

test("one review and one confirmation pass the exact route scope and request once",async()=>{
  const a=args(),get=await route({...a,request:new Request(`${base}/${intentId}/review`)});
  assert.equal(get.status,200);
  assert.equal(get.headers.get("referrer-policy"),"no-referrer");
  assert.deepEqual(await get.json(),{ok:true,review:{version:1,ready:false}});
  const result=await route({...a,request:post(`/${intentId}/confirm`,JSON.stringify(wire))});
  assert.deepEqual(await result.json(),{ok:true,decision:{version:1},replayed:true});
  assert.deepEqual(a.commands,[["review",{orgId,intentId,session}],["confirm",{orgId,intentId,session,request:wire}]]);
  const actorScope=hash([orgId,session.user.id]);
  assert.deepEqual(a.limits,[
    ["shift-substitution:read:"+actorScope,120,3600],
    ["shift-substitution:confirm:"+actorScope,120,3600],
  ]);
});
