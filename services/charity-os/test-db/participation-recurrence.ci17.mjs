/** Explicit recurrence closed GitHub PostgreSQL17.11 entry. Import is inert; only this zero-argument
 * function may mint its dedicated profile and open owned resources later. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, lstat, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRecurrenceCi17Profile, requireRecurrenceCi17Profile } from "./fixtures/participation-recurrence-ci17-profile.mjs";
import { openRecurrenceFixture, closeRecurrenceFixture, requireRecurrenceFixture } from "./fixtures/participation-recurrence.mjs";
import { RECURRENCE_CASE_NAMES, runRecurrenceCases } from "./fixtures/participation-recurrence-cases.mjs";
import sql from "./fixtures/participation-recurrence-sql.json" with { type: "json" };
import catalogVectors from "./fixtures/participation-recurrence-catalog-v1.json" with { type: "json" };
import absentGolden from "./fixtures/participation-recurrence-absence-v1.json" with { type: "json" };
const MAX=2097152,TOTAL=33554432;
const digest=v=>createHash("sha256").update(v).digest("hex");
const safe=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v)?v:null;
const CHECKOUT=path.resolve(fileURLToPath(new URL("../../../",import.meta.url)));
const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative===""||(!path.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(".."+path.sep));};
/** Pure output-path data validation is never profile authority. */
export function checkedRecurrenceCi17OutputRoot(declared,runnerTemp,checkout){
 assert.equal(arguments.length,3);
 for(const value of [declared,runnerTemp,checkout])assert(typeof value==="string"&&value.length>0&&value.length<=4096&&!value.includes("\0")&&path.isAbsolute(value)&&path.resolve(value)===value);
 assert.equal(declared,runnerTemp);assert(!inside(checkout,declared)&&!inside(declared,checkout));return declared;
}
async function outputDirectoryFacts(file,privateMode=false){
 const value=await lstat(file);assert(value.isDirectory()&&!value.isSymbolicLink()&&value.uid===process.getuid()&&await realpath(file)===file);
 if(privateMode)assert.equal(value.mode&0o777,0o700);return{dev:value.dev,ino:value.ino};
}
async function createOutputDirectory(profile){
 requireRecurrenceCi17Profile(profile);
 const root=checkedRecurrenceCi17OutputRoot(process.env.RECURRENCE_RESULTS_ROOT,process.env.RUNNER_TEMP,CHECKOUT);
 assert.equal(await realpath(CHECKOUT),CHECKOUT);const rootIdentity=await outputDirectoryFacts(root);
 const directory=path.join(root,"charitology-recurrence-ci17-"+randomBytes(8).toString("hex"));
 await mkdir(directory,{mode:0o700});const directoryIdentity=await outputDirectoryFacts(directory,true);
 return Object.freeze({root,rootIdentity:Object.freeze(rootIdentity),directory,directoryIdentity:Object.freeze(directoryIdentity)});
}
async function assertOutputDirectory(output){
 assert.deepEqual(await outputDirectoryFacts(output.root),output.rootIdentity);
 assert.deepEqual(await outputDirectoryFacts(output.directory,true),output.directoryIdentity);
}
async function saveOutputArtifact(output,name,encoded){
 await assertOutputDirectory(output);const file=path.join(output.directory,name),handle=await open(file,"wx+",0o600);let saved;
 try{
  const initial=await handle.stat();assert(initial.isFile()&&initial.uid===process.getuid()&&(initial.mode&0o777)===0o600&&initial.size===0);
  await handle.writeFile(encoded);await handle.sync();const actual=await handle.stat();assert(actual.dev===initial.dev&&actual.ino===initial.ino&&actual.size===encoded.length&&(actual.mode&0o777)===0o600);
  const bytes=Buffer.alloc(encoded.length);let offset=0;while(offset<bytes.length){const result=await handle.read(bytes,offset,bytes.length-offset,offset);assert(result.bytesRead>0);offset+=result.bytesRead;}
  assert.deepEqual(bytes,encoded);const current=await lstat(file);assert(current.isFile()&&!current.isSymbolicLink()&&current.dev===initial.dev&&current.ino===initial.ino&&current.uid===process.getuid()&&(current.mode&0o777)===0o600&&current.size===bytes.length);
  await assertOutputDirectory(output);saved={name,bytes:bytes.length,sha256:digest(bytes)};
 }finally{await handle.close();}
 return saved;
}
export async function runRecurrenceCi17(){
 assert.equal(arguments.length,0);
 let profile,fixture,caps,caseWork,result,primary=null,cleanup=null,final=null,output=null,artifactBytes=0;
 const cases=[],artifacts=[],names=new Set();
 const emit=value=>{const text=JSON.stringify(value);assert(Buffer.byteLength(text)<=MAX);process.stdout.write(text+"\n");};
 const retain=async(name,value)=>{assert(output&&/^[a-z0-9-]+\.json$/.test(name)&&!names.has(name));const encoded=Buffer.from(JSON.stringify(value)+"\n","utf8"),bytes=encoded.length;assert(bytes<=MAX);artifactBytes+=bytes;assert(artifactBytes<=TOTAL);names.add(name);const ref=await saveOutputArtifact(output,name,encoded);artifacts.push(ref);return ref;};
 try{
  profile=await createRecurrenceCi17Profile();
  assert.equal(profile.expectedServerVersionNum,170011);
  assert.equal(RECURRENCE_CASE_NAMES.length,18);assert.equal(new Set(RECURRENCE_CASE_NAMES).size,18);
  output=await createOutputDirectory(profile);emit({format:"recurrence-business-ci17-evidence-directory",directory:output.directory,savedFileMode:"0600",directoryMode:"0700",outsideQualifiedCheckout:true});
  fixture=await openRecurrenceFixture(profile);caps=requireRecurrenceFixture(fixture);
  caseWork=runRecurrenceCases({...caps,modules:caps.modules,sql,absentGolden,catalogVectors,expectedServerVersionNum:170011,
   onCase:async value=>{assert(value.number===cases.length+1&&value.name===RECURRENCE_CASE_NAMES[value.number-1]);cases.push(value);const ref=await retain("case-"+String(value.number).padStart(2,"0")+".json",value);emit({format:"recurrence-business-ci17-case",number:value.number,name:value.name,status:value.status,code:safe(value.code),artifact:ref});},
   onArtifact:async(name,value)=>{const ref=await retain(name,value);emit({format:"recurrence-business-ci17-artifact-digest",...ref,bodyRetainedInLog:false});}
  });caps.track(caseWork);result=await caseWork;
  assert.equal(result.tests,18);assert.equal(result.pass,18);assert.equal(result.caseWorkSettled,true);assert.equal(result.providerCalls,0);assert.equal(cases.length,18);assert(cases.every((v,i)=>v.number===i+1&&v.name===RECURRENCE_CASE_NAMES[i]&&v.status==="PASS"));
 }catch(error){primary=error;}
 finally{
  // Never race teardown ahead of still-running handler/transaction work.
  if(caseWork)await Promise.allSettled([caseWork]);
  try{if(fixture)cleanup=await closeRecurrenceFixture(fixture,primary);}catch(error){primary??=error;}
  try{if(profile)final=await profile.finish();}catch(error){primary??=error;}
  finally{try{if(profile)await profile.abandon();}catch(error){primary??=error;}}
 }
 const report={format:"recurrence-business-ci17-final",version:1,status:primary?"FAIL":"PASS",businessGroups:18,completed:cases.length,pass:cases.filter(v=>v.status==="PASS").length,fail:cases.filter(v=>v.status==="FAIL").length,priorFailureCode:safe(primary?.code),actualOutcomeNotInferredFromCleanup:true,syntheticAuthNotRealSignIn:true,expiredRowSqlSeamNotNaturalExpiry:true,postCommitSuppressedValueNotSocket:true,actualNative64Attainment:false,cleanup,profile:final,artifacts,outputDirectory:output?output.directory:null};
 if(output)await retain("result.json",report);emit(report);
 if(primary)throw Object.assign(Error("RECURRENCE_CI17_JOURNEY_REFUSED"),{code:"RECURRENCE_CI17_JOURNEY_REFUSED",resultsDirectory:report.outputDirectory});
 return Object.freeze(report);
}
