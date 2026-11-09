/** Exact library bytes follow independent clean-commit/profile qualification. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {requireReminderProfile} from './participation-reminder-profile.mjs';
import {readReminderRuntimeSource,reminderRegularSource,REMINDER_RUNTIME_MODULES as NAMES,REMINDER_RUNTIME_SOURCE_LIMITS} from './participation-reminder-binding.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),states=new WeakMap();
export async function loadReminderModules(profile){
 assert.equal(arguments.length,1);requireReminderProfile(profile);assert(!states.has(profile));
 // Both calls are real closed qualification, never a caller-supplied proof.
 await profile.assertSource();const binding=await readReminderRuntimeSource(profile.sourceRoot);assert.deepEqual(binding,profile.runtimeSourceProof);
 const lib=path.join(profile.sourceRoot,'services/charity-os/lib'),selected=new Map(),tag='?reminder_pg='+binding.manifestSha256+'&fixture='+randomBytes(16).toString('hex');let total=0;
 for(const row of binding.files){
  const source=path.join(lib,row.name),bytes=await reminderRegularSource(source);assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.sha256);total+=bytes.length;assert(total<=REMINDER_RUNTIME_SOURCE_LIMITS.totalBytes);
  selected.set(row.name,{...row,bytes,plain:pathToFileURL(source).href,virtual:pathToFileURL(source).href+tag});
 }
 assert.equal(total,binding.sourceBytes);
 const prefix=pathToFileURL(lib+path.sep).href,plain=new Map([...selected.values()].map(v=>[v.plain,v])),virtual=new Map([...selected.values()].map(v=>[v.virtual,v]));
 const hook=registerHooks({resolve(specifier,context,next){
  let url;try{if(specifier.startsWith('file:'))url=new URL(specifier);else if(specifier.startsWith('.')&&context.parentURL?.startsWith(prefix))url=new URL(specifier,context.parentURL);}catch{}
  if(url?.href.startsWith(prefix)){url.search='';url.hash='';const entry=plain.get(url.href);assert(entry,'Unpinned reminder application import');return{url:entry.virtual,shortCircuit:true};}return next(specifier,context);
 },load(url,context,next){const entry=virtual.get(url);if(!entry)return next(url,context);assert(/\.(?:mjs|json)$/.test(entry.name),'Retained schema/types are data only');return{format:entry.name.endsWith('.json')?'json':'module',source:entry.bytes,shortCircuit:true};}});
 states.set(profile,{hook,closed:false});
 try{
  const modules={};for(const [key,name]of Object.entries(NAMES))modules[key]=await import(selected.get(name).virtual);
  assert.equal(modules.routes.PARTICIPATION_REMINDERS_ENABLED,false,'Product feature gate must stay closed in this pre-mount suite');
  return Object.freeze({...modules,sourceProof:Object.freeze({...binding,sourceCommit:profile.sourceCommit,sourceTree:profile.sourceTree}),releaseSourceHook:()=>releaseReminderModules(profile)});
 }catch(error){releaseReminderModules(profile);throw error;}
}
export function releaseReminderModules(profile){requireReminderProfile(profile);const s=states.get(profile);if(s&&!s.closed){s.hook.deregister();s.closed=true;}}
