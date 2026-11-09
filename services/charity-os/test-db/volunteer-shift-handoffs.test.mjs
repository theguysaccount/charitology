import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { database } from "../lib/database.mjs";
import { createHandler } from "../lib/handler.mjs";
import { intakeSchema } from "../lib/intake.mjs";
import { applicationGrantsSql } from "../lib/migration-grants.mjs";
import { participationTerms } from "../lib/participation.mjs";
import { csrf, hash } from "../lib/security.mjs";
import { volunteerSubstitutionVerifierSql } from "../lib/volunteer-substitution-authority.mjs";
import { createHostedVolunteerSubstitutionRuntime } from "../lib/volunteer-substitution-runtime.mjs";

function local(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1","localhost"].includes(url.hostname)) return null;
  if ([...url.searchParams.keys()].some(key => key !== "sslmode")) return null;
  return url;
}
const ownerUrl = local(process.env.DATABASE_URL), runtimeUrl = local(process.env.OS_DATABASE_URL);
const enabled = process.env.NODE_ENV === "test" && ownerUrl && runtimeUrl &&
  ownerUrl.host === runtimeUrl.host && ownerUrl.pathname === runtimeUrl.pathname && ownerUrl.username !== runtimeUrl.username;
const settings = { origin:"https://handoff.example.invalid",secret:"fictional-handoff-secret-with-thirty-two-characters",volunteerSubstitutionsEnabled:true };
const org = "fictional-handoff", shiftId = "shift-one";
const actor = id => ({ user:{id,email:id+"@example.invalid",emailVerified:true},session:{id:"session-"+id} });
const staff = actor("staff"), leaving = actor("leaving"), joining = actor("joining");
const entry = a => ({ intake:"request-"+a.user.id, participation:"place-"+a.user.id, contact:"contact-"+a.user.id, booking:"assignment-"+a.user.id });

async function seed(c) {
  const startAt = new Date(Date.now()+8*60*1000).toISOString(), endAt = new Date(Date.parse(startAt)+60*60*1000).toISOString();
  const shift = { title:"Fictional volunteer shift",kind:"shift",startAt,endAt,timeZone:"UTC",capacity:1,
    participationPurpose:"Fictional handoff rehearsal.",organizerUrl:"https://organizer.example.invalid" };
  const terms = participationTerms({id:shiftId,orgId:org,moduleId:"volunteers",data:shift}), termsHash = hash(terms);
  const form = {kind:"form",title:"Fictional volunteer request",version:1,purpose:"Fictional volunteer request.",
    definition:JSON.stringify([{key:"email",label:"Email",type:"text",required:true}]),
    retentionUntil:"2099-01-01",consentRequired:true,anonymous:false};
  const save = (id,module,data,status,revision,approved) => c.query(`INSERT INTO os_records
    (org_id,id,module_id,data,status,owner_id,last_editor_id,revision,approval)
    VALUES($1,$2,$3,$4::jsonb,$5,'fixture-editor','fixture-editor',$6,$7::jsonb)`,
    [org,id,module,JSON.stringify(data),status,revision,approved?JSON.stringify({status:"approved",revision,actorId:"fixture-reviewer"}):null]);
  await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional charity',$1,'USD','UTC')",[org]);
  await save(shiftId,"volunteers",shift,"open",3,true);
  await save("form","forms",form,"approved",1,true);
  await c.query(`INSERT INTO os_participation_targets(org_id,target_id,module_id,source_revision,terms,terms_hash,created_by)
    VALUES($1,$2,'volunteers',3,$3::jsonb,$4,'fixture-editor')`,[org,shiftId,JSON.stringify(terms),termsHash]);
  await c.query(`INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,target_id,target_module,target_revision,schema,created_by)
    VALUES($1,'publication','form',1,'volunteer-interest',$2,'volunteers',3,$3::jsonb,'fixture-editor')`,
    [org,shiftId,JSON.stringify(intakeSchema({data:form},"volunteer-interest"))]);
  for(const a of [staff,leaving,joining]) {
    await c.query('INSERT INTO "user"(id,email,"emailVerified") VALUES($1,$2,true)',[a.user.id,a.user.email]);
    await c.query('INSERT INTO "session" VALUES($1,$2,clock_timestamp()+interval \'1 hour\')',[a.session.id,a.user.id]);
  }
  await c.query("INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,'owner')",[org,staff.user.id]);
  for(const [a,confirmed] of [[leaving,true],[joining,false]]) {
    const v=entry(a);
    await save(v.contact,"contacts",{kind:"person-reference",title:"Fictional contact"},"draft",1,false);
    await save(v.booking,"volunteers",{kind:"assignment",title:"Fictional assignment",shiftId,contactId:v.contact},
      confirmed?"assigned":"approved",5,true);
    await c.query(`INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,converted_ids)
      VALUES($1,$2,'publication',$3::jsonb,clock_timestamp(),'converted',$4::jsonb)`,[org,v.intake,
      JSON.stringify({email:a.user.email}),JSON.stringify([{id:v.contact,moduleId:"contacts"},{id:v.booking,moduleId:"volunteers"}])]);
    await c.query("INSERT INTO os_participant_links(id,org_id,intake_id,publication_id,user_id) VALUES($1,$2,$3,'publication',$4)",
      [(confirmed?"a":"b").repeat(32),org,v.intake,a.user.id]);
    const consent={revision:5,sourceRevision:3,termsHash,at:new Date().toISOString(),method:"participant-portal",emailUpdates:false,waitlistAllowed:true};
    const frozen=confirmed?{sourceRevision:3,termsHash,terms,programId:null,candidateRevision:4}:null;
    await c.query(`INSERT INTO os_participations(org_id,id,target_id,module_id,booking_record_id,contact_id,intake_id,
      state,revision,source,consent,frozen,confirmed_at,waitlist_sequence,created_by)
      VALUES($1,$2,$3,'volunteers',$4,$5,$6,$7,7,'intake',$8::jsonb,$9::jsonb,$10,$11,'fixture-editor')`,
      [org,v.participation,shiftId,v.booking,v.contact,v.intake,confirmed?"confirmed":"waitlisted",JSON.stringify(consent),
      frozen?JSON.stringify(frozen):null,confirmed?new Date():null,confirmed?null:1]);
  }
}

test("restricted PostgreSQL: verified staff selects the saved waitlist, two own choices settle once and protect history",{
  skip:enabled?false:"Requires isolated test PostgreSQL URLs on loopback",timeout:60000,
},async()=>{
  const suffix=randomBytes(7).toString("hex"), schema="os_handoff_"+suffix, verifierRole="handoff_verify_"+suffix;
  const owner=database(ownerUrl.href);
  let migration,db,schemaCreated=false,installed=false,providerAttempts=0;
  try {
    assert.equal((await owner.pool.query(`SELECT rolsuper AS allowed FROM pg_roles WHERE rolname=current_user`)).rows[0].allowed,true);
    await owner.pool.query(`CREATE SCHEMA "${schema}"`); schemaCreated=true;
    migration=database(ownerUrl.href,{schema});
    await migration.pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,email text NOT NULL,"emailVerified" boolean NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),"updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE "session"(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "user"(id),"expiresAt" timestamptz NOT NULL)`);
    await migration.migrate();
    const role=decodeURIComponent(runtimeUrl.username), authorityOptions={schema,verifierRole};
    await migration.pool.query(applicationGrantsSql(role,schema));
    await seed(migration.pool);
    db=database(runtimeUrl.href,{schema});
    const handle=createHandler({db,settings,
      auth:{api:{getSession:async({headers})=>[staff,leaving,joining].find(a=>a.user.id===headers.get("x-fixture-actor"))??null}},
      send:async()=>{providerAttempts++;throw Error("No mail during handoff tests");},
      participationTransport:async()=>{providerAttempts++;throw Error("No mail during handoff tests");},
      volunteerSubstitutionRuntime:createHostedVolunteerSubstitutionRuntime({db,settings,authorityOptions}),
    });
    const call=async(a,path,{body,method=body===undefined?"GET":"POST",status=200}={})=>{
      const response=await handle(new Request(settings.origin+path,{method,
        headers:{"x-fixture-actor":a.user.id,origin:settings.origin,"content-type":"application/json",
          "x-csrf-token":csrf(a.session.id,settings.secret)},...(body===undefined?{}:{body:JSON.stringify(body)})}));
      const value=await response.json();
      assert.equal(response.status,status,`${method} ${path}: ${value.code??""}`);
      return value;
    };
    assert.equal((await call(staff,"/api/session")).volunteerSubstitutions,undefined);
    await migration.pool.query(volunteerSubstitutionVerifierSql(role,authorityOptions)); installed=true;
    assert.equal((await call(staff,"/api/session")).volunteerSubstitutions,true);
    assert.equal((await call(leaving,"/api/session")).volunteerSubstitutions,undefined);
    assert.equal((await call(joining,"/api/participant/session")).volunteerSubstitutions,true);
    const base=`/api/orgs/${org}/volunteer-substitutions`, optionsPath=`${base}/shifts/${shiftId}/${entry(leaving).participation}`;
    await call(leaving,optionsPath,{status:403});
    const opts=(await call(staff,optionsPath)).options;
    assert.equal(opts.replacement.id,entry(joining).participation);
    assert.equal(opts.offer,null);
    const leg=({id,revision})=>({id,revision});
    const offer=(await call(staff,base+"/offers",{status:201,body:{version:1,shiftId,shiftRevision:opts.shift.revision,
      outgoing:leg(opts.outgoing),replacement:leg(opts.replacement)}})).offer;
    assert.deepEqual((await call(staff,optionsPath)).options.offer,offer);
    const reviewPath=base+"/"+offer.intentId+"/review",confirmPath=base+"/"+offer.intentId+"/confirm";
    assert.equal((await call(staff,reviewPath)).review.ready,false);
    const own=a=>`/api/participant/orgs/${org}/requests/${entry(a).intake}/participations/${entry(a).participation}/substitution-choice`;
    await call(leaving,own(joining),{status:404});
    for(const [a,party] of [[leaving,"leaving"],[joining,"joining"]]) {
      const {choice}=await call(a,own(a));
      assert.equal(choice.party,party);
      assert(!JSON.stringify(choice).includes(offer.intentId));
      const accepted=await call(a,own(a),{body:{version:1,choice:"accept",reviewSha256:choice.reviewSha256,
        expectedChoiceRevision:choice.choiceRevision,acknowledge:true}});
      assert.equal(accepted.choice.state,"accepted");
    }
    const {review}=await call(staff,reviewPath);
    assert.equal(review.ready,true);
    const body={version:1,reviewSha256:review.reviewSha256,idempotencyKey:"fictional-handoff-command",acknowledge:true};
    const accepted=await call(staff,confirmPath,{body});
    assert.equal(accepted.replayed,false);
    await migration.pool.query("DELETE FROM os_previews WHERE org_id=$1 AND id=$2",[org,offer.intentId]);
    assert.deepEqual(await call(staff,confirmPath,{body}),{...accepted,replayed:true});
    assert.deepEqual((await migration.pool.query("SELECT id,state FROM os_participations WHERE org_id=$1 ORDER BY id",[org])).rows,
      [{id:entry(joining).participation,state:"confirmed"},{id:entry(leaving).participation,state:"cancelled"}]);
    const refused=await call(staff,`/api/orgs/${org}/modules/contacts/records/${entry(leaving).contact}`,
      {method:"DELETE",body:{revision:1},status:409});
    assert.equal(refused.code,"substitution_source_retained");
    assert.equal(providerAttempts,0);
  } finally {
    if(db) await db.close();
    if(migration) await migration.close();
    try {
      if(schemaCreated) await owner.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      if(installed) await owner.pool.query(`DROP ROLE "${verifierRole}"`);
    } finally { await owner.close(); }
  }
});
