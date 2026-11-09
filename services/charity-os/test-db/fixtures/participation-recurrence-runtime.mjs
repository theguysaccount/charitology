/** CI-only definitions are inert. Genuine profile authority precedes every
 * manifest/file read and every temporary exact-source module hook. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isProxy} from 'node:util/types';
import path from 'node:path';
import {requireRecurrenceCi17Profile} from './participation-recurrence-ci17-profile.mjs';
const MANIFEST_SHA='fbc893c3ac2fcb83bc71accc635e9db175fbfd4fb629abe59a35893c676c325a',states=new WeakMap();
const ROOT=path.resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const digest=b=>createHash('sha256').update(b).digest('hex');
// These retained type sources are hashed as data; the hook never executes them.
const DATA_ONLY_TYPE_FILES=Object.freeze(["incubator-bridge-types.ts","incubator-native-entry.ts","learning-native-entry.ts","learning-transport.d.mts","learning-types.ts"]);
function exact(value,keys){
 assert(value&&typeof value==='object'&&!isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 const fields=Object.getOwnPropertyDescriptors(value);
 assert.equal(Reflect.ownKeys(fields).length,keys.length);
 for(const key of keys)assert(fields[key]?.enumerable&&Object.hasOwn(fields[key],'value'));
 return fields;
}
/** Validated data does not mint a profile or permit loading any source. */
export function checkedRecurrenceCi17RuntimeManifest(value){
 assert.equal(arguments.length,1);const fields=exact(value,['format','version','files']);
 assert.equal(fields.format.value,'charitology-recurrence-ci17-runtime-source-manifest');assert.equal(fields.version.value,1);
 const list=fields.files.value;assert(Array.isArray(list)&&!isProxy(list)&&Object.getPrototypeOf(list)===Array.prototype);
 const descriptors=Object.getOwnPropertyDescriptors(list);assert.equal(descriptors.length?.value,161);assert.equal(Reflect.ownKeys(descriptors).length,162);
 const files=[],names=new Set();let previous='';
 for(let i=0;i<161;i++){
  assert(descriptors[String(i)]?.enumerable&&Object.hasOwn(descriptors[String(i)],'value'));
  const row=exact(descriptors[String(i)].value,['name','bytes','sha256']),name=row.name.value,bytes=row.bytes.value,sha256=row.sha256.value;
  assert(typeof name==='string'&&(/^(?:[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:mjs|json)|schema\.sql)$/.test(name)||DATA_ONLY_TYPE_FILES.includes(name))&&!names.has(name)&&name>previous);
  assert(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=2097152);assert(typeof sha256==='string'&&/^[a-f0-9]{64}$/.test(sha256));
  names.add(name);previous=name;files.push(Object.freeze({name,bytes,sha256}));
 }
 return Object.freeze({format:fields.format.value,version:1,files:Object.freeze(files)});
}
async function regular(file,max=2097152){const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max&&await realpath(file)===file);const b=await readFile(file);assert.equal(b.length,s.size);return b;}
export async function loadRecurrenceModules(profile){
 assert.equal(arguments.length,1);requireRecurrenceCi17Profile(profile);assert(!states.has(profile));
 const manifestPath=fileURLToPath(new URL('./participation-recurrence-runtime-manifest-v1.json',import.meta.url)),raw=await regular(manifestPath);assert.equal(digest(raw),MANIFEST_SHA);
 const manifest=checkedRecurrenceCi17RuntimeManifest(JSON.parse(raw.toString('utf8'))),lib=path.join(ROOT,'services/charity-os/lib'),selected=new Map(),cacheTag='?recurrence_source='+MANIFEST_SHA+'&fixture='+randomBytes(16).toString('hex');
 for(const entry of manifest.files){const file=path.join(lib,entry.name),bytes=await regular(file);assert.equal(bytes.length,entry.bytes);assert.equal(digest(bytes),entry.sha256);selected.set(entry.name,{...entry,bytes,virtual:pathToFileURL(file).href+cacheTag,plain:pathToFileURL(file).href});}
 const urls=new Map([...selected.values()].map(e=>[e.virtual,e])),plainUrls=new Map([...selected.values()].map(e=>[e.plain,e])),prefix=pathToFileURL(lib+path.sep).href;
 const hook=registerHooks({resolve(specifier,context,next){
  let url=null;try{if(specifier.startsWith('file:'))url=new URL(specifier);else if(specifier.startsWith('.')&&context.parentURL?.startsWith(prefix))url=new URL(specifier,context.parentURL);}catch{}
  if(url&&url.href.startsWith(prefix)){url.search='';url.hash='';const chosen=plainUrls.get(url.href);assert(chosen,'Unpinned recurrence runtime import');return{url:chosen.virtual,shortCircuit:true};}return next(specifier,context);
 },load(url,context,next){const entry=urls.get(url);if(!entry)return next(url,context);assert(/\.(?:mjs|json)$/.test(entry.name),'Schema is data, never a module');return{format:entry.name.endsWith('.json')?'json':'module',source:entry.bytes,shortCircuit:true};}});
 const state={hook,closed:false};states.set(profile,state);
 try{
  const names={database:'database.mjs',security:'security.mjs',handler:'handler.mjs',backup:'backup.mjs',workspaceBackup:'workspace-backup.mjs',learning:'learning-capacity.mjs',modules:'modules.mjs',access:'access.mjs',participation:'participation.mjs',recurCommands:'participation-recurrence-commands.mjs',recurPackets:'participation-recurrence-packets.mjs',recurCapacity:'participation-recurrence-capacity.mjs',recurRecovery:'participation-recurrence-recovery.mjs',recurStore:'participation-recurrence-store.mjs',recurContext:'participation-recurrence-context.mjs',groupModel:'participation-group-model.mjs',migrationGrants:'migration-grants.mjs',crmContext:'contact-reconciliation-context.mjs'};
  const modules={};for(const [key,name]of Object.entries(names)){assert(selected.has(name));modules[key]=await import(selected.get(name).virtual);}
  const proof=Object.freeze({format:'charitology-recurrence-ci17-runtime-source-proof',version:1,manifestSha256:MANIFEST_SHA,files:manifest.files,mode:'desired-bytes-integrated-in-qualified-CI-commit',wholeCheckoutCommitQualificationSeparate:true});
  return Object.freeze({...modules,sourcePinProof:proof,releaseSourceHook:()=>releaseRecurrenceModules(profile)});
 }catch(error){releaseRecurrenceModules(profile);throw error;}
}
export function releaseRecurrenceModules(profile){assert.equal(arguments.length,1);requireRecurrenceCi17Profile(profile);const state=states.get(profile);if(!state||state.closed)return;state.hook.deregister();state.closed=true;}
