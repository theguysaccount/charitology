/** Explicit maintainer invocation only; no ordinary build imports this entry. */
import path from "node:path";
import { acquirePlanClusterInputs } from "../src/lib/humanitarian-plan-cluster/acquire.mjs";
try {
  const args=process.argv.slice(2),v={};
  for(let i=0;i<args.length;i++){const k=args[i];if(!["--repo","--source-commit","--out"].includes(k)||Object.hasOwn(v,k)||!args[i+1]||args[i+1].startsWith("--"))throw Error("FLAGS");v[k]=args[++i];}
  if(!v["--source-commit"]||!v["--out"])throw Error("FLAGS");
  const result=await acquirePlanClusterInputs({repo:path.resolve(v["--repo"]??"."),sourceCommit:v["--source-commit"],outputRoot:path.resolve(v["--out"])});
  console.log(JSON.stringify({ok:true,...result},null,2));
} catch(error) {
  // Never print a raw transport error/stack/Location/signed URL or request.
  console.error(JSON.stringify({ok:false,code:"PLAN_CLUSTER_ACQUISITION_REFUSED",phase:error?.phase??"entry",reason:error?.reason??"REFUSED",failedOperation:error?.failedOperation??null,completedOperations:error?.completedOperations??[],artifactPersistence:error?.artifactPersistence??{attempted:false,complete:false},artifactDirectory:error?.artifactDirectory??null,...(error?.failureArtifact?{failureArtifact:error.failureArtifact}:{}),...(error?.cleanup?{cleanup:error.cleanup}:{})}));process.exitCode=1;
}
