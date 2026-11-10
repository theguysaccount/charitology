/** Runtime-only tracked binding; whole Git identity is qualified separately.
 * Import is inert. Every returned value is data, never fixture authority. */
import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isProxy} from 'node:util/types';
import path from 'node:path';
const FILE=fileURLToPath(new URL('./participation-reminder-source-binding-v4.json',import.meta.url));
const MANIFEST=fileURLToPath(new URL('./participation-reminder-runtime-manifest-v4.json',import.meta.url));
export const REMINDER_RUNTIME_SOURCE_LIMITS=Object.freeze({filesMin:140,filesMax:200,fileBytes:2097152,totalBytes:16777216});
export const REMINDER_RUNTIME_DATA_FILES=Object.freeze(['incubator-bridge-types.ts','incubator-native-entry.ts','learning-native-entry.ts','learning-transport.d.mts','learning-types.ts']);
export const REMINDER_RUNTIME_MODULES=Object.freeze({database:'database.mjs',security:'security.mjs',handler:'handler.mjs',modules:'modules.mjs',access:'access.mjs',intake:'intake.mjs',participation:'participation.mjs',guards:'participation-guards.mjs',delivery:'participation-delivery.mjs',routes:'participation-reminder-routes.mjs',commands:'participation-reminder-commands.mjs',context:'participation-reminder-context.mjs',store:'participation-reminder-store.mjs',model:'participation-reminder-model.mjs',choice:'participation-reminder-choice.mjs',outbox:'participation-reminder-outbox.mjs',groupModel:'participation-group-model.mjs',migrationGrants:'migration-grants.mjs',reminderCapacity:'participation-reminder-capacity.mjs',participationStorage:'participation-storage.mjs',workspaceBackup:'workspace-backup.mjs',learningCapacity:'learning-capacity.mjs',participationBackup:'participation-backup.mjs',checkInModel:'participant-check-in-model.mjs',checkInStore:'participant-check-in-store.mjs',checkInCapacity:'participant-check-in-capacity.mjs',groupStore:'participation-group-store.mjs',groupBackup:'participation-group-backup.mjs',groupCapacity:'participation-group-capacity.mjs',groupSafetyCapacity:'participation-group-safety-capacity.mjs',groupExitProjection:'participation-group-exit-projection.mjs',reminderWorker:'participation-reminder-worker.mjs'});
const digest=b=>createHash('sha256').update(b).digest('hex');
function exact(input,keys){
 assert(input&&typeof input==='object'&&!isProxy(input)&&Object.getPrototypeOf(input)===Object.prototype);
 const names=Reflect.ownKeys(input);assert.equal(names.length,keys.length);assert(names.every(k=>typeof k==='string'&&keys.includes(k)));
 const d=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(input,k)]));for(const key of keys)assert(d[key]?.enumerable&&Object.hasOwn(d[key],'value'));
 return Object.fromEntries(keys.map(k=>[k,d[k].value]));
}
export function checkedReminderRuntimeBinding(input){
 const v=exact(input,['format','version','status','runtimeManifestSha256']);
 assert.equal(v.format,'charitology-reminder-pg-runtime-binding');assert.equal(v.version,1);
 assert(['UNBOUND','BOUND'].includes(v.status));
 if(v.status==='UNBOUND')assert.equal(v.runtimeManifestSha256,null);else assert(typeof v.runtimeManifestSha256==='string'&&/^[a-f0-9]{64}$/.test(v.runtimeManifestSha256));
 return Object.freeze(v);
}
export function checkedReminderRuntimeManifest(input){
 const v=exact(input,['format','version','files']);assert.equal(v.format,'charitology-reminder-pg-runtime-manifest');assert.equal(v.version,1);
 assert(Array.isArray(v.files)&&!isProxy(v.files)&&Object.getPrototypeOf(v.files)===Array.prototype);
 const count=Object.getOwnPropertyDescriptor(v.files,'length')?.value;assert(Number.isSafeInteger(count)&&count>=REMINDER_RUNTIME_SOURCE_LIMITS.filesMin&&count<=REMINDER_RUNTIME_SOURCE_LIMITS.filesMax);const d=Object.getOwnPropertyDescriptors(v.files);assert.equal(Reflect.ownKeys(d).length,count+1);
 const files=[];let previous='',total=0;
 for(let i=0;i<count;i++){
  assert(d[String(i)]?.enumerable&&Object.hasOwn(d[String(i)],'value'));const row=exact(d[String(i)].value,['name','bytes','sha256']);
  assert(typeof row.name==='string'&&(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:mjs|json)$/.test(row.name)||row.name==='schema.sql'||REMINDER_RUNTIME_DATA_FILES.includes(row.name))&&row.name>previous);previous=row.name;
  assert(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=REMINDER_RUNTIME_SOURCE_LIMITS.fileBytes);total+=row.bytes;assert(total<=REMINDER_RUNTIME_SOURCE_LIMITS.totalBytes);
  assert(typeof row.sha256==='string'&&/^[a-f0-9]{64}$/.test(row.sha256));files.push(Object.freeze(row));
 }
 const names=new Set(files.map(r=>r.name));for(const name of [...Object.values(REMINDER_RUNTIME_MODULES),'schema.sql'])assert(names.has(name),'Required named module absent from exact runtime manifest');
 return Object.freeze({format:v.format,version:1,files:Object.freeze(files)});
}
export async function reminderRegularSource(file,max=REMINDER_RUNTIME_SOURCE_LIMITS.fileBytes){
 const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max&&await realpath(file)===file);
 const b=await readFile(file);assert.equal(b.length,s.size);return b;
}
/** Pure filesystem qualification only. Fixed factories never accept this proof
 * from callers; they read it themselves before descriptor/driver access. */
export async function readReminderRuntimeSource(sourceRoot){
 assert.equal(arguments.length,1);assert(typeof sourceRoot==='string'&&sourceRoot.length>0&&sourceRoot.length<=4096&&!sourceRoot.includes('\0')&&path.isAbsolute(sourceRoot)&&path.resolve(sourceRoot)===sourceRoot);
 const raw=await reminderRegularSource(FILE,8192),binding=checkedReminderRuntimeBinding(JSON.parse(raw.toString('utf8')));
 if(binding.status!=='BOUND')throw Object.assign(Error('REMINDER_PG_SOURCE_UNBOUND'),{code:'REMINDER_PG_SOURCE_UNBOUND'});
 const root=await lstat(sourceRoot);assert(root.isDirectory()&&!root.isSymbolicLink()&&await realpath(sourceRoot)===sourceRoot);
 const bytes=await reminderRegularSource(MANIFEST);assert.equal(digest(bytes),binding.runtimeManifestSha256);
 const manifest=checkedReminderRuntimeManifest(JSON.parse(bytes.toString('utf8')));let sourceBytes=0;
 for(const row of manifest.files){const file=path.join(sourceRoot,'services/charity-os/lib',row.name),body=await reminderRegularSource(file);assert.equal(body.length,row.bytes);assert.equal(digest(body),row.sha256);sourceBytes+=body.length;assert(sourceBytes<=REMINDER_RUNTIME_SOURCE_LIMITS.totalBytes);}
 return Object.freeze({format:'charitology-qualified-reminder-runtime-data',version:1,sourceRoot,bindingSha256:digest(raw),manifestSha256:digest(bytes),files:manifest.files,fileCount:manifest.files.length,sourceBytes,filesSha256:digest(JSON.stringify(manifest.files))});
}
