import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDisasterHistory, currentCommit, isAncestor, gitRead } from '../src/lib/disaster-incidents/git.mjs';
import {parseJSON} from '../src/lib/disaster-incidents/canonical.mjs';
import {readBoundedWorkingFile} from '../src/lib/disaster-incidents/git.mjs';

const SHA=/^[a-f0-9]{40}$/;
const exact=v=>typeof v==='string'&&SHA.test(v)&&!/^0+$/.test(v);
export function checkHistoryCLI({repo=process.cwd(),env=process.env}={}) {
  const head=currentCommit(repo);let base;
  if(env.GITHUB_ACTIONS==='true') {
    if(!exact(env.GITHUB_SHA)||env.GITHUB_SHA!==head)throw new Error('Disaster CI requires the exact checked-out GITHUB_SHA');
    if(!['push','pull_request','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))throw new Error('Disaster CI requires a supported explicit event');
    if(!env.GITHUB_EVENT_PATH)throw new Error('Disaster CI event body is unavailable');
    const event=parseJSON(readBoundedWorkingFile(env.GITHUB_EVENT_PATH,1048576),1048576);
    base=env.GITHUB_EVENT_NAME==='push'?event.before:env.GITHUB_EVENT_NAME==='pull_request'?event.pull_request?.base?.sha:event.inputs?.disaster_incidents_base_sha;
    if(!exact(base))throw new Error('Disaster CI requires an explicit nonzero available base');
    // Both existence and ancestry are required. No first-parent or zero-base fallback.
    gitRead(repo,['cat-file','-e',base+'^{commit}']);
    if(!isAncestor(repo,base,head))throw new Error('Disaster CI base is not an ancestor of exact checkout');
  }
  const result=checkDisasterHistory({repo,exactHead:head});
  return {...result,...(base?{base}:{} )};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {if(process.argv.length!==2)throw new Error('This check accepts no fallback ref or skip option');console.log(JSON.stringify(checkHistoryCLI()));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
