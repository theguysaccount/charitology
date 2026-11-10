import assert from "node:assert/strict";
import test from "node:test";
import {
  VOLUNTEER_PROFILE_MAX_REVISION as MAX, VOLUNTEER_PROFILE_SKILLS, VOLUNTEER_PROFILE_WINDOWS,
  ownVolunteerProfileView, planVolunteerProfileChange, validateVolunteerProfileCommand,
} from "../lib/volunteer-profile-model.mjs";

const acceptedAt = "2026-11-09T12:00:00.123456Z";
const common = {version:1,scopeSha256:"a".repeat(64),acknowledge:true};
const save = (expectedRevision, extra={}) => ({...common,operation:"save",expectedRevision,
  skills:["operations","event-support"],availability:["sun-evening","mon-afternoon"],...extra});
const clear = expectedRevision => ({...common,operation:"clear",expectedRevision});
const plan = (current,raw) => planVolunteerProfileChange(current,validateVolunteerProfileCommand(raw),"America/New_York");
const recorded = write => ({...write,updatedAtExact:acceptedAt});

test("fixed selections have stable semantic order, explicit workspace time zone and no identity fields",()=>{
  const stored=recorded(plan(null,save(0)).write);
  assert.deepEqual(ownVolunteerProfileView(stored,"UTC"),{
    revision:1,workspaceTimeZone:"UTC",profile:{skills:["event-support","operations"],
      availability:["mon-afternoon","sun-evening"],timeZone:"America/New_York",updatedAtExact:acceptedAt},
  });
  assert.equal(VOLUNTEER_PROFILE_SKILLS.length,8);
  assert.equal(VOLUNTEER_PROFILE_WINDOWS.length,21);
});

test("unknown, repeated, missing, injected and empty selections refuse",()=>{
  for(const input of [save(0,{skills:["certified"]}),save(0,{skills:["operations","operations"]}),
    save(0,{availability:["mon-08:00"]}),save(0,{skills:["operations"],email:"hidden@example.invalid"}),
    save(0,{skills:[],availability:[]}),save(0,{skills:new Array(2)}),save(-1),save(0,{acknowledge:false}),
    save(0,{scopeSha256:"other"}),{...clear(0),availability:[]},Object.create(save(0))]){
    assert.throws(()=>validateVolunteerProfileCommand(input),{code:"volunteer_profile_fields"});
  }
});

test("save Retry preserves the accepted revision and conflicts on a changed value",()=>{
  const current=recorded(plan(null,save(0)).write);
  assert.deepEqual(plan(current,save(0)),{write:null,replayed:true});
  assert.deepEqual(plan(current,save(1)),{write:null,replayed:false});
  assert.throws(()=>plan(current,save(0,{skills:["research"]})),{code:"volunteer_profile_changed"});
});

test("clear removes both masks and zone, and stale input cannot recreate preferences",()=>{
  const initial=recorded(plan(null,save(0)).write), empty=recorded(plan(initial,clear(1)).write);
  assert.deepEqual(empty,{revision:2,skills:0,availability:0,timeZone:null,updatedAtExact:acceptedAt});
  assert.deepEqual(ownVolunteerProfileView(empty,"UTC"),{revision:2,workspaceTimeZone:"UTC",profile:null});
  assert.deepEqual(plan(empty,clear(1)),{write:null,replayed:true});
  assert.throws(()=>plan(empty,save(0)),{code:"volunteer_profile_changed"});
  assert.equal(plan(empty,save(2)).write.revision,3);
  assert.deepEqual(plan(null,clear(0)),{write:null,replayed:false});
});

test("the final revision is available for privacy clear",()=>{
  const current=recorded({...plan(null,save(0)).write,revision:MAX-1});
  assert.throws(()=>plan(current,save(MAX-1,{skills:["logistics"]})),{code:"volunteer_profile_revision"});
  assert.equal(plan(current,clear(MAX-1)).write.revision,MAX);
  assert.throws(()=>ownVolunteerProfileView({...current,availability:-1},"UTC"),{code:"volunteer_profile_storage"});
});
