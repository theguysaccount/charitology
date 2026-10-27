import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Webhook} from 'svix';
import {database} from '../lib/database.mjs';
import {verifiedNeonConnectionString} from '../lib/connection.mjs';
import {config,FROM} from '../lib/config.mjs';
import {createHandler} from '../lib/handler.mjs';
import {handleOsMail,handleOsMailStatus,osMailKeyHash,PARTICIPATION_SUBJECT} from '../lib/os-mail.mjs';
import {hashToken} from '../lib/security.mjs';
const settings=config({OS_MAIL_RELAY_SECRET:'r'.repeat(40),OS_ORIGIN:'https://os.example.invalid',OS_PARTICIPATION_DELIVERY_ENABLED:'true',OS_PARTICIPATION_TEST_RECIPIENT:'owner@example.invalid',RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.alloc(32,8).toString('base64')});
const payload={purpose:'participation',to:'owner@example.invalid',url:settings.osOrigin+'/participant'};
const sendRequest=(key,value=payload)=>new Request('https://mail.example.invalid/api/system/os-mail',{method:'POST',headers:{authorization:`Bearer ${settings.osMailSecret}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(value)});
const statusRequest=key=>new Request('https://mail.example.invalid/api/system/os-mail/status',{method:'POST',headers:{authorization:`Bearer ${settings.osMailSecret}`,'content-type':'application/json'},body:JSON.stringify({idempotencyKey:key})});
test('Actual isolated Postgres: participation preflight, attempts, feedback and status retain durable no-resend boundaries',{timeout:300000},async t=>{
  assert.ok(process.env.DATABASE_URL);
  const schema='newsletter_test_'+randomBytes(8).toString('hex'),owner=new pg.Client({connectionString:verifiedNeonConnectionString(process.env.DATABASE_URL)});
  let db;let sends=0;
  try{
    await owner.connect();await owner.query(`CREATE SCHEMA ${schema}`);
    const sql=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
    // Apply the old constraints with a populated accepted legacy row first.
    await owner.query(`BEGIN; SET LOCAL search_path TO ${schema}; ${sql.slice(0,sql.indexOf('-- Widen deployed'))} COMMIT;`);
    await owner.query('BEGIN');await owner.query(`SET LOCAL search_path TO ${schema}`);await owner.query("INSERT INTO newsletter_os_mail_intents(key_hash,payload_hash,purpose,recipient_hash,state,provider_id) VALUES($1,$2,'login',$3,'accepted','legacy-provider')",[hashToken('legacy'),hashToken('legacy-payload'),hashToken('legacy-recipient')]);await owner.query('COMMIT');
    for(let i=0;i<2;i++)await owner.query(`BEGIN; SET LOCAL search_path TO ${schema}; ${sql} COMMIT;`);
    db=database(process.env.DATABASE_URL,{schema});
    const query=(text,values)=>db.tx(c=>c.query(text,values));
    const mail={ready:async()=>{},suppression:async()=>null,sendOsMail:async(message,key)=>{sends++;return {id:'provider-'+hashToken(key).slice(0,24)};}};
    const send=(key,value=payload,options=settings)=>handleOsMail(sendRequest(key,value),{db,mail,settings:options});
    const status=key=>handleOsMailStatus(statusRequest(key),{db,mail,settings});
    const signed=(event,id)=>{const raw=JSON.stringify(event),at=new Date();return new Request('https://mail.example.invalid/api/webhook',{method:'POST',headers:{'content-type':'application/json','svix-id':id,'svix-timestamp':String(Math.floor(+at/1000)),'svix-signature':new Webhook(settings.webhookSecret).sign(id,at,raw)},body:raw});};
    await t.test('populated legacy migration is repeatable and preflight is constrained to unattempted participation',async()=>{
      const row=(await query('SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1',[hashToken('legacy')])).rows[0];assert.equal(row.state,'accepted');assert.equal(row.purpose,'login');assert.equal(row.provider_id,'legacy-provider');
      await assert.rejects(query("UPDATE newsletter_os_mail_intents SET state='preflight' WHERE key_hash=$1",[row.key_hash]),error=>error.code==='23514');
      assert.equal((await query('SELECT state FROM newsletter_os_mail_intents WHERE key_hash=$1',[row.key_hash])).rows[0].state,'accepted');
    });
    await t.test('readiness defers without charging rates; exact concurrent retry attempts once and charges current windows',async()=>{
      mail.ready=async()=>{throw new Error('synthetic unready');};
      const deferred=await send('deferred');assert.deepEqual(deferred.body,{ok:false,state:'unavailable',safeCode:'preflight_unavailable',providerEventAt:null});
      assert.equal((await query('SELECT count(*)::int AS n FROM newsletter_rate_limits')).rows[0].n,0);
      assert.equal((await query('SELECT attempted_at FROM newsletter_os_mail_intents WHERE key_hash=$1',[osMailKeyHash('deferred')])).rows[0].attempted_at,null);
      mail.ready=async()=>{};const before=sends,responses=await Promise.all(Array.from({length:3},()=>send('deferred')));assert.equal(sends-before,1);assert.equal(responses.filter(r=>r.status===202).length,1);
      const counters=(await query('SELECT hits FROM newsletter_rate_limits')).rows;assert.equal(counters.length,2);assert.ok(counters.every(r=>r.hits===1));
      assert.equal((await send('deferred',payload,{...settings,participationEnabled:false})).body.state,'accepted');assert.equal(sends-before,1);
      await assert.rejects(query("UPDATE newsletter_os_mail_intents SET state='preflight' WHERE key_hash=$1",[osMailKeyHash('deferred')]),error=>error.code==='23514');
    });
    await t.test('an ambiguous attempt stays stopped beyond the native cache and payload conflict cannot replace it',async()=>{
      const original=mail.sendOsMail;mail.sendOsMail=async()=>{sends++;throw {ambiguous:true};};
      assert.equal((await send('uncertain')).body.state,'unknown');const before=sends;
      await query("UPDATE newsletter_os_mail_intents SET created_at='2001-01-01',attempted_at='2001-01-01' WHERE key_hash=$1",[osMailKeyHash('uncertain')]);
      assert.equal((await send('uncertain')).body.state,'unknown');assert.equal(sends,before);
      const changed=await send('uncertain',{...payload,to:'different@example.invalid'});assert.equal(changed.status,409);assert.equal(changed.body.safeCode,'intent_conflict');assert.equal(sends,before);
      mail.sendOsMail=original;
    });
    await t.test('signed early delivery binds the opaque tag before provider response; duplicate callbacks and late failures cannot downgrade',async()=>{
      const original=mail.sendOsMail;
      mail.sendOsMail=async(message,key,options)=>{
        sends++;const event={type:'email.delivered',created_at:'2026-10-26T09:00:00.123456Z',data:{email_id:'early-provider',from:FROM,to:[payload.to],subject:PARTICIPATION_SUBJECT,tags:{os_delivery:options.correlationTag}}};
        const handler=createHandler({db,mail,settings,logger:()=>{}});assert.equal((await handler(signed(event,'early-delivery'))).status,200);assert.equal((await handler(signed(event,'early-delivery'))).status,200);
        return {id:'early-provider'};
      };
      const result=await send('early');assert.deepEqual(result.body,{ok:true,state:'delivered',safeCode:'provider_delivered',providerEventAt:'2026-10-26T09:00:00.123Z'});
      const row=(await query('SELECT * FROM newsletter_os_mail_intents WHERE key_hash=$1',[osMailKeyHash('early')])).rows[0];assert.equal(row.provider_id,'early-provider');assert.equal(row.state,'accepted');assert.ok(row.attempted_at);
      await db.finishParticipationMail(row.key_hash,row.payload_hash,'unknown','attempt_unconfirmed');assert.equal((await status('early')).body.state,'delivered');
      assert.equal((await query("SELECT count(*)::int AS n FROM newsletter_webhook_events WHERE id='early-delivery'")).rows[0].n,1);
      mail.sendOsMail=original;
    });
    await t.test('OS feedback and newsletter suppression roll back together with dedupe, then one signed replay applies both',async()=>{
      await query("INSERT INTO newsletter_subscribers(email,state,generation) VALUES($1,'confirmed','synthetic')",[payload.to]);
      const event={type:'email.bounced',created_at:'2026-10-26T10:00:00.000Z',data:{email_id:'early-provider',from:FROM,to:[payload.to],subject:PARTICIPATION_SUBJECT,tags:{}}};
      let fail=true;const failing={...db,tx:(action,options)=>db.tx(client=>action({query:async(sql,values)=>{if(fail&&sql.startsWith('UPDATE newsletter_subscribers')){fail=false;throw new Error('synthetic downstream failure');}return client.query(sql,values);}}),options)};
      const failedHandler=createHandler({db:failing,mail,settings,logger:()=>{}});assert.equal((await failedHandler(signed(event,'atomic-bounce'))).status,503);
      assert.equal((await query("SELECT count(*)::int AS n FROM newsletter_webhook_events WHERE id='atomic-bounce'")).rows[0].n,0);
      assert.equal((await query('SELECT provider_facts FROM newsletter_os_mail_intents WHERE key_hash=$1',[osMailKeyHash('early')])).rows[0].provider_facts.bounced,undefined);
      assert.equal((await query('SELECT state FROM newsletter_subscribers WHERE email=$1',[payload.to])).rows[0].state,'confirmed');
      const handler=createHandler({db,mail,settings,logger:()=>{}});assert.equal((await handler(signed(event,'atomic-bounce'))).status,200);assert.equal((await handler(signed(event,'atomic-bounce'))).status,200);
      assert.equal((await status('early')).body.state,'suppressed');assert.equal((await query('SELECT state FROM newsletter_subscribers WHERE email=$1',[payload.to])).rows[0].state,'blocked');
      assert.equal((await query("SELECT count(*)::int AS n FROM newsletter_webhook_events WHERE id='atomic-bounce'")).rows[0].n,1);
    });
    await t.test('status is private, missing keys stay unknown, and durable status limits never charge a send',async()=>{
      const before=(await query("SELECT sum(hits)::int AS n FROM newsletter_rate_limits WHERE key LIKE 'os-mail:global:%'")).rows[0].n;
      const missing=await status('never-created');assert.deepEqual(missing.body,{ok:true,state:'unknown',safeCode:'intent_unknown',providerEventAt:null});
      const bucket=`os-mail:status:minute:${Math.floor(Date.now()/60000)}`;
      await query("INSERT INTO newsletter_rate_limits(key,hits,expires_at) VALUES($1,60,now()+interval '2 days') ON CONFLICT(key) DO UPDATE SET hits=60",[bucket]);
      assert.equal((await status('early')).status,429);
      assert.equal((await query("SELECT sum(hits)::int AS n FROM newsletter_rate_limits WHERE key LIKE 'os-mail:global:%'")).rows[0].n,before);
      const stored=JSON.stringify((await query('SELECT * FROM newsletter_os_mail_intents')).rows);assert.doesNotMatch(stored,/owner@example|participant\b|whsec_|private-token/);
      await db.cleanup();assert.equal((await query('SELECT state FROM newsletter_os_mail_intents WHERE key_hash=$1',[osMailKeyHash('uncertain')])).rows[0].state,'unknown');
    });
    console.log('Participation mail tested only synthetic example.invalid rows in a temporary schema, signed local callbacks and a mocked provider. No real emails/provider calls.');
  }finally{
    await db?.close();await owner.query('ROLLBACK').catch(()=>{});await owner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await owner.end();
  }
});
