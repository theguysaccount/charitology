import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDisasterHistory, currentCommit, isAncestor, gitRead } from '../src/lib/disaster-incidents/git.mjs';
import {parseJSON} from '../src/lib/disaster-incidents/canonical.mjs';
import {readBoundedWorkingFile} from '../src/lib/disaster-incidents/git.mjs';

// Intentional policy copy: the source-pinned Disaster CLI has no new runtime dependency.
// Pure selection policy. The caller supplies already strictly parsed event data,
// the actual checkout head and a bounded, local-only Git reader. No IO on import.
const ZERO = "0".repeat(40);
const MAIN = "refs/remotes/origin/main";
const commit = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value) && value !== ZERO;
const need = (ok, message) => { if (!ok) throw Error(message); };
const manualInputs = new Set([
  "observations_base_sha",
  "directory_resources_base_sha",
  "disaster_incidents_base_sha",
]);

export function selectDisasterHistoryComparisonBase({ eventName, event, head, githubSha, githubRef, dispatchInput }, readGit) {
  need(commit(head) && githubSha === head, "Checkout differs from the exact event head.");
  need(event && typeof event === "object" && !Array.isArray(event), "An explicit event object is required.");
  let base, policy, reference = null, branchRef = null;
  if (eventName === "pull_request") {
    base = event.pull_request?.base?.sha;
    policy = "event.pull_request.base.sha";
  } else if (eventName === "workflow_dispatch") {
    need(manualInputs.has(dispatchInput), "An exact supported manual base input is required.");
    base = event.inputs?.[dispatchInput];
    policy = "event.inputs." + dispatchInput;
  } else if (eventName === "push") {
    if (commit(event.before)) {
      base = event.before;
      policy = "event.before";
    } else {
      need(event.created === true && event.before === ZERO && event.deleted === false,
        "A missing push base is admitted only for an explicitly created, nondeleted branch.");
      need(typeof event.ref === "string" && event.ref.length <= 1024 && event.ref.startsWith("refs/heads/") && event.ref.length > 11 && githubRef === event.ref,
        "A created push requires its exact matching branch ref.");
      need(event.after === head, "Created push after differs from the exact checkout head.");
      need(typeof readGit === "function", "A local Git reader is required for a created branch.");
      const git = args => {
        let value;
        try { value = readGit(Object.freeze([...args])); }
        catch { throw Error("Required local Git history is unavailable; no fallback or fetch is allowed."); }
        need(typeof value === "string" && value.length <= 1024, "Invalid local Git response.");
        return value.trim();
      };
      branchRef = event.ref;
      need(git(["check-ref-format", branchRef]) === "", "Invalid created branch ref.");
      const main = git(["rev-parse", "--verify", MAIN + "^{commit}"]);
      need(commit(main), "The existing local origin/main commit is unavailable.");
      // Pin the locally read reference before deriving the comparison. Never
      // use an arbitrary parent, a caller base override or an inferred before.
      base = git(["merge-base", head, main]);
      need(commit(base), "The local created-branch merge-base is unavailable.");
      need(git(["rev-parse", "--verify", base + "^{commit}"]) === base,
        "The exact local comparison commit is unavailable.");
      need(git(["merge-base", "--is-ancestor", base, head]) === "" &&
        git(["merge-base", "--is-ancestor", base, main]) === "",
        "The comparison is not an available common ancestor.");
      policy = "created-branch.merge-base-with-local-origin-main";
      reference = Object.freeze({ ref: MAIN, commit: main });
    }
  } else throw Error("Unsupported immutable history event.");
  need(commit(base), "The actual nonzero committed base is required; it cannot be inferred or skipped.");
  return Object.freeze({
    comparisonBase: base,
    comparisonBasePolicy: policy,
    event: Object.freeze({ name: eventName, before: eventName === "push" ? event.before : null }),
    comparisonReference: reference,
    createdBranchRef: branchRef,
  });
}
// End of exact shared policy copy; the same14cases test both exports.

const SHA=/^[a-f0-9]{40}$/;
const exact=v=>typeof v==='string'&&SHA.test(v)&&!/^0+$/.test(v);
export function checkHistoryCLI({repo=process.cwd(),env=process.env}={}) {
  const head=currentCommit(repo);let base,selection;
  if(env.GITHUB_ACTIONS==='true') {
    if(!exact(env.GITHUB_SHA)||env.GITHUB_SHA!==head)throw new Error('Disaster CI requires the exact checked-out GITHUB_SHA');
    if(!['push','pull_request','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))throw new Error('Disaster CI requires a supported explicit event');
    if(!env.GITHUB_EVENT_PATH)throw new Error('Disaster CI event body is unavailable');
    const event=parseJSON(readBoundedWorkingFile(env.GITHUB_EVENT_PATH,1048576),1048576);
    selection=selectDisasterHistoryComparisonBase({eventName:env.GITHUB_EVENT_NAME,event,head,githubSha:env.GITHUB_SHA,githubRef:env.GITHUB_REF,dispatchInput:'disaster_incidents_base_sha'},args=>gitRead(repo,args,1024).toString('utf8').trim());
    base=selection.comparisonBase;
    // Both existence and ancestry remain required for every selected base.
    gitRead(repo,['cat-file','-e',base+'^{commit}']);
    if(!isAncestor(repo,base,head))throw new Error('Disaster CI base is not an ancestor of exact checkout');
  }
  const result=checkDisasterHistory({repo,exactHead:head});
  return {...result,...(base?{base,...selection}:{} )};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {if(process.argv.length!==2)throw new Error('This check accepts no fallback ref or skip option');console.log(JSON.stringify(checkHistoryCLI()));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
