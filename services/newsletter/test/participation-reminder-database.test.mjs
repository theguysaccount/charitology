import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {hashToken} from '../lib/security.mjs';
import {mergeProviderFacts, isParticipationMailPurpose} from '../lib/os-mail.mjs';
import {verifiedNeonConnectionString} from '../lib/connection.mjs';

// Exercise the exact database factory's JS callbacks with a closed fake pool.
// Only its seven static import lines and export marker are removed. No pg,
// provider, environment, connection, timer, SQL server or credentials are used.
async function fixture(){
  const text=await readFile(new URL('../lib/database.mjs',import.meta.url),'utf8');
  const imports=text.match(/^import .*;\n/gm);assert.equal(imports.length,7);assert.equal((text.match(/^export /gm)||[]).length,1);
  const calls=[],rows=new Map(),rates=new Map();let snapshot=null,ended=0,releases=0,pools=0;
  const client={release:()=>{releases++;},query:async(sql,args=[])=>{
    assert.equal(typeof sql,'string');calls.push({sql,args});
    if(sql==='BEGIN'){snapshot={rows:structuredClone(rows),rates:structuredClone(rates)};return {rows:[]};}
    if(sql==='COMMIT'){snapshot=null;return {rows:[]};}
    if(sql==='ROLLBACK'){rows.clear();for(const x of snapshot.rows)rows.set(...x);rates.clear();for(const x of snapshot.rates)rates.set(...x);snapshot=null;return {rows:[]};}
    if(sql.startsWith("SELECT set_config('statement_timeout'"))return {rows:[]};
    if(sql==='SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired')return {rows:[{acquired:true}]};
    if(sql.startsWith('INSERT INTO newsletter_os_mail_intents(')){
      if(rows.has(args[0]))return {rowCount:0,rows:[]};
      rows.set(args[0],{key_hash:args[0],payload_hash:args[1],purpose:args[2],recipient_hash:args[3],state:'creating',correlation_hash:args[4],provider_id:null,provider_facts:{},attempted_at:null});return {rowCount:1,rows:[{key_hash:args[0]}]};
    }
    if(sql.startsWith('SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1')){
      const row=rows.get(args[0]);if(!row)return {rows:[]};
      if(sql.includes('AND purpose=$3')&&(row.purpose!==args[2]||row.provider_id!==args[1]))return {rows:[]};
      if(sql.includes("AND purpose='participation'")&&(row.purpose!=='participation'||row.provider_id!==args[1]))return {rows:[]};
      return {rows:[structuredClone(row)]};
    }
    if(sql.startsWith('INSERT INTO newsletter_rate_limits(')){const hits=(rates.get(args[0])||0)+1;rates.set(args[0],hits);return {rows:[{hits}]};}
    const row=rows.get(args[0]);
    if(sql.startsWith("UPDATE newsletter_os_mail_intents SET state='creating',safe_code=NULL")){row.state='creating';row.safe_code=null;return {rows:[]};}
    if(sql.startsWith('UPDATE newsletter_os_mail_intents SET attempted_at=now()')){row.attempted_at='2030-01-01T00:00:00.000Z';row.safe_code='provider_attempt_started';return {rows:[structuredClone(row)]};}
    if(sql.startsWith("UPDATE newsletter_os_mail_intents SET state='limited'")){row.state='limited';return {rows:[structuredClone(row)]};}
    if(sql.startsWith('UPDATE newsletter_os_mail_intents SET state=$3,safe_code=$4')){assert.equal(row.payload_hash,args[1]);Object.assign(row,{state:args[2],safe_code:args[3],provider_id:row.provider_id||args[4],provider_facts:JSON.parse(args[5])});return {rows:[structuredClone(row)]};}
    if(sql.startsWith("UPDATE newsletter_os_mail_intents SET state=CASE WHEN state IN ('creating','unknown')")){if(['creating','unknown'].includes(row.state))row.state='accepted';row.provider_facts=JSON.parse(args[2]);return {rows:[structuredClone(row)]};}
    throw new Error('Unexpected isolated database callback query');
  }};
  class Pool{constructor(){pools++;}async connect(){return client;}async end(){ended++;}}
  const unexpected=()=>{throw new Error('Unexpected external operation in isolated source test');};
  const source=text.replace(/^import .*;\n/gm,'').replace('export function database(','function database(')+'\ndatabase;';
  const factory=runInNewContext(source,{pg:{Pool},attachDatabasePool:unexpected,randomUUID:unexpected,CONSENT_VERSION:'fictional',hashToken,newToken:unexpected,verifiedNeonConnectionString,mergeProviderFacts,isParticipationMailPurpose,process:Object.freeze({env:Object.freeze({})}),setTimeout:unexpected,clearTimeout:unexpected},{timeout:1000,filename:'isolated-exact-database-factory.mjs'});
  const db=factory('postgres://fictional.example.invalid/never-connected');assert.equal(pools,1);
  return {db,rows,rates,calls,get releases(){return releases;},get ended(){return ended;}};
}
const entry=(key,purpose='participation-reminder-v1')=>({keyHash:hashToken(key),payloadHash:hashToken('payload:'+key),recipientHash:hashToken('recipient'),correlationHash:hashToken('correlation:'+key),purpose,rateKeys:[]});
test('actual database callbacks reserve each typed purpose and reopen only its own unattempted preflight',async()=>{
  const f=await fixture();try{
    for(const purpose of ['participation','participation-reminder-v1']){
      const e=entry(purpose,purpose);assert.equal((await f.db.reserveOsMail(e)).reserved,true);assert.equal(f.rows.get(e.keyHash).purpose,purpose);
      await f.db.finishParticipationMail(e.keyHash,e.payloadHash,'preflight','preflight_unavailable');assert.equal(f.rows.get(e.keyHash).attempted_at,null);
      assert.equal((await f.db.reserveOsMail(e)).reserved,true);assert.equal(f.rows.get(e.keyHash).state,'creating');
    }
    assert.equal(f.rates.size,0);assert.equal(f.calls.filter(x=>x.sql.startsWith("UPDATE newsletter_os_mail_intents SET state='creating'")).length,2);
  }finally{await f.db.close();}assert.equal(f.ended,1);assert.ok(f.releases>0);
});
test('preflight row cannot be reclaimed as the other typed purpose even with the same supplied hash',async()=>{
  const f=await fixture();try{const e=entry('same','participation');await f.db.reserveOsMail(e);await f.db.finishParticipationMail(e.keyHash,e.payloadHash,'preflight','preflight_unavailable');const r=await f.db.reserveOsMail({...e,purpose:'participation-reminder-v1'});assert.equal(r.reserved,false);assert.equal(f.rows.get(e.keyHash).purpose,'participation');assert.equal(f.rows.get(e.keyHash).state,'preflight');}finally{await f.db.close();}
});
test('typed reminder attempt charges the same rates once and only matching payload can finish',async()=>{
  const f=await fixture();try{
    for(const purpose of ['participation','participation-reminder-v1']){
      const e=entry(purpose,purpose);await f.db.reserveOsMail(e);const keys=[{key:'fictional-global',limit:200},{key:'fictional-recipient',limit:10}];
      assert.equal((await f.db.markOsMailAttempt({...e,rateKeys:keys})).attempt,true);assert.equal((await f.db.markOsMailAttempt({...e,rateKeys:keys})).attempt,false);
      await assert.rejects(f.db.finishParticipationMail(e.keyHash,hashToken('wrong'),'accepted','provider_accepted',{providerId:'provider-wrong'}),/Unbound participation outcome/);
      assert.equal(f.rows.get(e.keyHash).provider_id,null);await f.db.finishParticipationMail(e.keyHash,e.payloadHash,'accepted','provider_accepted',{providerId:'provider-'+purpose});assert.equal(f.rows.get(e.keyHash).state,'accepted');
    }
    assert.deepEqual([...f.rates.values()],[2,2]);
    const login=entry('login','login');await f.db.reserveOsMail(login);await assert.rejects(f.db.markOsMailAttempt({...login,rateKeys:[]}),/Unbound participation attempt/);await assert.rejects(f.db.finishParticipationMail(login.keyHash,login.payloadHash,'preflight','preflight_unavailable'),/Unbound participation outcome/);
  }finally{await f.db.close();}
});
test('provider observation locks the exact persisted purpose and preserves payload-hash binding',async()=>{
  const f=await fixture();try{
    const e=entry('observe');await f.db.reserveOsMail(e);await f.db.markOsMailAttempt({...e,rateKeys:[]});await f.db.finishParticipationMail(e.keyHash,e.payloadHash,'accepted','provider_accepted',{providerId:'provider-one'});
    await assert.rejects(f.db.observeParticipationMail(e.keyHash,'provider-one','delivered',{purpose:'participation',payloadHash:e.payloadHash}),/Unbound provider observation/);
    await assert.rejects(f.db.observeParticipationMail(e.keyHash,'provider-one','delivered',{purpose:e.purpose,payloadHash:hashToken('wrong')}),/Unbound provider observation/);assert.deepEqual(f.rows.get(e.keyHash).provider_facts,{});
    const observed=await f.db.observeParticipationMail(e.keyHash,'provider-one','delivered',{purpose:e.purpose,payloadHash:e.payloadHash});assert.equal(observed.provider_facts.delivered,null);assert.deepEqual(Array.from(f.calls.find(x=>x.sql.includes('AND purpose=$3')).args),[e.keyHash,'provider-one','participation']);
  }finally{await f.db.close();}
});
test('schema source keeps the populated legacy prefix and old indexes while adding typed preflight and union uniqueness',async()=>{
  const sql=await readFile(new URL('../schema.sql',import.meta.url),'utf8'),golden=JSON.parse(await readFile(new URL('./fixtures/participation-legacy-golden-v1.json',import.meta.url),'utf8'));
  assert.equal(createHash('sha256').update(sql.slice(0,sql.indexOf('-- Widen deployed'))).digest('hex'),golden.schemaLegacyPrefixSha256);
  assert.ok(sql.includes("CHECK(purpose IN ('login','invitation','reminder','participation','participation-reminder-v1'))"));
  assert.ok(sql.includes("CHECK(state<>'preflight' OR(purpose IN ('participation','participation-reminder-v1') AND attempted_at IS NULL))"));
  for(const line of golden.oldParticipationIndexLines)assert.ok(sql.includes(line));
  for(const column of ['correlation_hash','provider_id'])assert.ok(sql.includes(`ON newsletter_os_mail_intents(${column}) WHERE purpose IN ('participation','participation-reminder-v1') AND ${column} IS NOT NULL`));
  assert.doesNotMatch(sql,/DROP INDEX|UPDATE newsletter_os_mail_intents|DELETE FROM newsletter_os_mail_intents/);
});
