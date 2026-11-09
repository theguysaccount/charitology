import assert from "node:assert/strict";
import { test } from "node:test";
import { createVolunteerSubstitutionRuntime, isVolunteerSubstitutionRuntime } from "../lib/volunteer-substitution-runtime.mjs";
import { createHandler } from "../lib/handler.mjs";
import { hash } from "../lib/security.mjs";

const origin="https://local-fixture.invalid";
const session={user:{id:"fictional-operator",emailVerified:true},session:{id:"fictional-session"}};
const intent="a".repeat(32);
const url=part=>new Request(origin+part);
const blocked=()=>{throw Error("A database write/read port was used before readiness.");};
const db={tx:blocked,limit:blocked};
const ports={db,readPairedOwnAuthority:blocked,checkProspectiveCapacity:blocked,checkFinalCapacity:blocked};

test("only a reviewed runtime dependency can be mounted; there is no environment boolean fallback",()=>{
  const settings={origin,secret:"fictional-runtime-test-secret",volunteerSubstitutionsEnabled:true};
  assert.equal(isVolunteerSubstitutionRuntime({route:blocked}),false);
  assert.throws(()=>createVolunteerSubstitutionRuntime(ports),/readiness check/);
  assert.throws(()=>createHandler({settings,db,auth:{},participationTransport:blocked,volunteerSubstitutionRuntime:{route:blocked}}),/reviewed shift handoff runtime/);
  assert.equal(typeof createHandler({settings,db,auth:{},participationTransport:blocked}),"function");
});

test("each actor's transport is bounded before readiness; unready routes never touch domain storage",async()=>{
  const seen=[], limits=[], bound={...db,limit:async (...args)=>{limits.push(args);}};
  const runtime=createVolunteerSubstitutionRuntime({...ports,db:bound,async verifyReadiness(v){seen.push(v);return false;}});
  assert.equal(isVolunteerSubstitutionRuntime(runtime),true);
  const args={session,db:bound,settings:{origin,secret:"fictional-runtime-test-secret"}};
  assert.equal(await runtime.route({...args,request:url("/api/orgs/example/other")}),null);
  const staff=url(`/api/orgs/fixture-org/volunteer-substitutions/${intent}/review`);
  const own=url("/api/participant/orgs/fixture-org/requests/test/participations/place/substitution-choice");
  await assert.rejects(runtime.route({...args,request:staff}),{status:503,code:"substitution_unavailable"});
  await assert.rejects(runtime.route({...args,request:own}),{status:503,code:"substitution_unavailable"});
  await assert.rejects(runtime.route({...args,db:{},request:staff}),/database does not match/);
  assert.deepEqual(seen,[{db:bound,orgId:"fixture-org",session},{db:bound,orgId:"fixture-org",session}]);
  assert.deepEqual(limits,[
    [`shift-substitution:staff-transport:${hash(session.user.id)}`,180,3600],
    [`participant-read:${hash(session.user.id)}`,120,3600],
  ]);
});
