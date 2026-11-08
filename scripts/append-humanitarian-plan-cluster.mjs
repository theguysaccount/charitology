/** Explicit private request preparation, offline review, then reviewed write. */
import path from "node:path";
import { strictObservationJson } from "../src/lib/observation-canonical.mjs";
import { readBoundedObservationFile } from "../src/lib/observation-capture-io.mjs";
import { preparePlanClusterAppendRequest, previewPlanClusterAppend, writeReviewedPlanClusterAppend } from "../src/lib/humanitarian-plan-cluster/capture-io.mjs";
try {
  const args=process.argv.slice(2),v={};
  const flags=["--repo","--prepare-request","--retained-root","--source-commit","--previous-commit","--edition-id","--request","--write-reviewed-hash"];
  for(let i=0;i<args.length;i++){const k=args[i];if(!flags.includes(k)||Object.hasOwn(v,k)||!args[i+1]||args[i+1].startsWith("--"))throw Error("FLAGS");v[k]=args[++i];}
  if(!v["--retained-root"])throw Error("FLAGS");const repo=path.resolve(v["--repo"]??"."),retainedRoot=path.resolve(v["--retained-root"]);let result;
  if(v["--prepare-request"]){
    if(v["--request"]||v["--write-reviewed-hash"]||!v["--source-commit"]||!v["--previous-commit"]||!v["--edition-id"])throw Error("FLAGS");
    result=await preparePlanClusterAppendRequest({repo,retainedRoot,sourceCommit:v["--source-commit"],previousCommit:v["--previous-commit"],editionId:v["--edition-id"],outputFile:path.resolve(v["--prepare-request"])});
  }else{
    if(!v["--request"]||v["--source-commit"]||v["--previous-commit"]||v["--edition-id"])throw Error("FLAGS");
    const request=strictObservationJson(readBoundedObservationFile(path.resolve(v["--request"]),16384),16384);
    const preview=await previewPlanClusterAppend({repo,retainedRoot,request});
    result=v["--write-reviewed-hash"]?await writeReviewedPlanClusterAppend(preview,v["--write-reviewed-hash"]):preview;
  }
  console.log(JSON.stringify({ok:true,...result},null,2));
} catch(error) {
  console.error(JSON.stringify({ok:false,code:"PLAN_CLUSTER_APPEND_REFUSED",...(typeof error?.committed==="boolean"?{committed:error.committed}:{}),...(error?.cleanupErrors?{cleanupErrors:error.cleanupErrors}:{}),...(error?.result?{result:error.result}:{})}));process.exitCode=1;
}
