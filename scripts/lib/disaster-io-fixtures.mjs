// Owned temporary repositories and synthetic source bytes only. Never public data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {methodSourcePaths,methodSourceInventory,DISASTER_ROOT} from '../../src/lib/disaster-incidents/git.mjs';
import {canonicalBytes,recordHash,filePin,sha256} from '../../src/lib/disaster-incidents/canonical.mjs';
import {recordPath,pinOf,prepareEditionArtifacts} from '../../src/lib/disaster-incidents/model.mjs';
import {HAZARDS,SECTORS} from '../../src/lib/disaster-incidents/limits.mjs';
import {inspectSourceOriginal} from '../../src/lib/disaster-incidents/source-adapters.mjs';
const primary=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function tempRepository(){
  const repo=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'charitology-disaster-test-')));
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).trim();
  git('init','-q');git('config','user.name','Disaster test');git('config','user.email','disaster-test@example.invalid');
  for(const p of methodSourcePaths()){const from=path.join(primary,p);fs.mkdirSync(path.dirname(path.join(repo,p)),{recursive:true});fs.writeFileSync(path.join(repo,p),fs.existsSync(from)?fs.readFileSync(from):Buffer.from('// Synthetic missing integration fixture only\n'));}
  const commit=message=>{git('add','-A');git('commit','-qm',message);return git('rev-parse','HEAD');};
  const sourceCommit=commit('Synthetic source A, no public disaster root');
  const sourceFiles=methodSourceInventory(repo,sourceCommit);
  const writeInventory=files=>{for(const[p,b]of files){const absolute=path.join(repo,DISASTER_ROOT,p);fs.mkdirSync(path.dirname(absolute),{recursive:true});fs.writeFileSync(absolute,b);}};
  return{repo,git,commit,sourceCommit,sourceFiles,writeInventory,cleanup:()=>fs.rmSync(repo,{recursive:true,force:true})};
}
export async function captureFixture(t){
  const files=new Map(),at='2026-10-27T12:00:00.000Z';
  const body=Buffer.from('<!doctype html><html><body><h1>Recovery projects</h1><p>Long-term recovery from the August 2023 wildfires.</p><h2>Housing</h2><p>Synthetic test section.</p><h2>Infrastructure</h2><p>Synthetic test section.</p><h2>Resilience &amp; Mitigation</h2><p>Synthetic test section.</p></body></html>');
  const material=await inspectSourceOriginal({descriptor:'maui-projects',bytes:body,responseContentType:'text/html; charset=utf-8'});
  const put=(p,v)=>{const b=canonicalBytes(v);files.set(p,b);return filePin(p,b);};
  const seal=(kind,id,fields)=>{const r={format:'charitology-disaster-record',schemaVersion:1,kind,id,version:1,previous:null,...fields,review:'draft'};r.hash=recordHash(kind,r);put(recordPath(r),r);return r;};
  const method=seal('method','test-method',{sourceCommit:t.sourceCommit,sourceFiles:t.sourceFiles,adapter:'bounded-issuer-note-v1',canonicalEncoding:'DI-C14N-1',taxonomy:{hazards:[...HAZARDS],sectors:[...SECTORS]},rules:['Synthetic actual-module test only.']});
  const note={format:'charitology-disaster-source-note',schemaVersion:1,sourceId:'test-source',sourceVersion:1,originalSha256:sha256(body),items:material.items,rights:'charitology-authored-factual-note-only',limitations:['Synthetic HTML only.'],review:'draft'};
  const {items,...sourceFields}=material;
  const source=seal('source','test-source',{...sourceFields,retrievedAt:at,access:{outcome:'retrieved',httpStatus:200},publicNote:put('notes/test-source/v1.json',note)});
  const ref={source:pinOf(source),item:'recovery',role:'status'};
  const incident=seal('incident','maui-wildfires-2023',{name:'Synthetic capture test incident',hazard:'wildfire',identifiers:[],geography:{countries:[],areas:['Synthetic test area'],note:'Not actual event data.'},period:{start:null,end:null,literal:null},lifecycle:{value:'recovery',refs:[ref],uncertainty:'Synthetic fixture only.'},editorial:{placement:'follow-up',decidedAt:at,reason:'Synthetic fixture only.'},checkedAt:at,recheckAfter:'2026-10-28T12:00:00.000Z',reviewRationale:'Synthetic interval.',refs:[],limitations:['Synthetic only.']});
  const edition=seal('edition','test-edition',{asOf:at,capturedAt:at,interpretation:pinOf(method),sourceCommit:t.sourceCommit,incidents:[pinOf(incident)],claims:[],sources:[pinOf(source)],coverage:{geography:['Synthetic only'],hazards:['wildfire'],sectors:['unclassified'],omitted:['All actual current needs uncollected.'],accessibilityChecks:[pinOf(source)],worldwideCurrentCoverage:'not-established',currentNeedsVerification:'not-established'},changes:[{kind:'added',before:null,after:pinOf(incident),reason:'Synthetic only.'}],limitations:['Synthetic test only, never public seed.']});
  const artifacts=prepareEditionArtifacts(files,pinOf(edition));for(const[p,b]of artifacts.files)files.set(p,b);
  const registry={format:'charitology-disaster-registry',schemaVersion:1,bootstrapSourceCommit:t.sourceCommit,selected:pinOf(edition),editions:[{edition:pinOf(edition),artifacts:put('artifacts/test-edition.json',artifacts.manifest)}]};registry.hash=recordHash('registry',registry);put('registry.json',registry);
  const request={interpretationCommit:t.sourceCommit,method:pinOf(method),predecessorRegistryHash:null,candidateId:'test-candidate'};
  return{files,body,request,method,registry};
}
export function writeCandidate(loc,f){const root=path.join(loc.candidates,f.request.candidateId);fs.mkdirSync(path.join(root,'originals'),{recursive:true});fs.writeFileSync(path.join(root,'request.json'),canonicalBytes(f.request));fs.writeFileSync(path.join(root,'originals','synthetic-original'),f.body);for(const[p,b]of f.files){const dest=path.join(root,'proposed',p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);}return root;}
