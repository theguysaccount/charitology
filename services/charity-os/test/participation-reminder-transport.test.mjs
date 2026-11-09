import test from 'node:test';
import assert from 'node:assert/strict';
import {participationMailer} from '../lib/mail.mjs';
const settings={origin:'https://os.example.invalid',relayUrl:'https://mail.example.invalid/api/system/os-mail',relaySecret:'fictional-secret',participationDeliveryEnabled:true,participationTestOnly:true,participationTestRecipient:'owner@example.invalid',production:true};
const legacy={purpose:'participation',to:'owner@example.invalid',url:settings.origin+'/participant'};
const reminder={...legacy,variant:'pre-occurrence-v1'};
const reply=()=>Response.json({ok:true,state:'accepted',safeCode:'provider_accepted',providerEventAt:null});
test('legacy participation transport keeps its exact three-field wire and key when variant is omitted',async()=>{
  const calls=[];const t=participationMailer(settings,{fetcher:async(url,options)=>{calls.push({url:String(url),...options});return reply();}});
  assert.equal((await t.sendParticipation(legacy,'fictional-exact-key')).state,'accepted');assert.equal(calls.length,1);assert.equal(calls[0].body,JSON.stringify(legacy));assert.equal(calls[0].headers['idempotency-key'],'fictional-exact-key');
});
test('explicit fixed reminder variant is accepted with one exact four-field transport request',async()=>{
  const calls=[];const t=participationMailer(settings,{fetcher:async(url,options)=>{calls.push({url:String(url),...options});return reply();}});
  assert.equal((await t.sendParticipation(reminder,'fictional-exact-key')).state,'accepted');assert.equal(calls.length,1);assert.equal(calls[0].body,JSON.stringify(reminder));assert.equal(calls[0].url,settings.relayUrl);assert.equal(calls[0].redirect,'error');
});
test('transport rejects unknown present variants, internal purpose and extra caller copy before fetch',async()=>{
  let calls=0;const t=participationMailer(settings,{fetcher:async()=>{calls++;return reply();}});
  for(const input of [null,undefined,'','pre-occurrence-v2',{},[]].map(variant=>({...legacy,variant})).concat([{...reminder,purpose:'participation-reminder-v1'},{...reminder,message:'private copy'},{...reminder,title:'private details'},{...reminder,consent:true}]))assert.equal((await t.sendParticipation(input,'fictional-key')).safeCode,'invalid_request');
  assert.equal(calls,0);
});
test('reminder canonical HTTPS restriction and current controlled-recipient gate cannot be bypassed',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return reply();};
  const t=participationMailer(settings,{fetcher});assert.equal((await t.sendParticipation({...reminder,to:'other@example.invalid'},'fictional-key')).safeCode,'controlled_recipient_required');
  for(const origin of ['http://127.0.0.1:4444','https://os.example.invalid:4444'])assert.equal((await participationMailer({...settings,origin},{fetcher}).sendParticipation({...reminder,url:origin+'/participant'},'fictional-key')).safeCode,'invalid_request');
  assert.equal(calls,0);const origin='http://127.0.0.1:4444';assert.equal((await participationMailer({...settings,origin},{fetcher}).sendParticipation({...legacy,url:origin+'/participant'},'fictional-key')).state,'accepted');assert.equal(calls,1);
});
