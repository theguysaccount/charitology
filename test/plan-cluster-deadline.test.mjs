/** Real local 45s deadline with an early timer callback and mocked hanging HTTPS. */
import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { withPlanClusterCaptureFixture } from "../test-fixtures/observations/plan-cluster-capture-factory.mjs";
import { acquirePlanClusterInputs } from "../src/lib/humanitarian-plan-cluster/acquire.mjs";
test("MOCK HTTPS 45s deadline rechecks an early timer and waits for terminal close",{timeout:60000},async t=>{
 const receipt=await withPlanClusterCaptureFixture(async f=>{
  const original=https.request;let calls=0,reqClosed=false,socketClosed=false;
  const originalTimeout = globalThis.setTimeout;
  let deliveredEarly = false;
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
   if (delay !== 45_000 || deliveredEarly) return originalTimeout(callback, delay, ...args);
   deliveredEarly = true;
   return originalTimeout(callback, 1, ...args);
  });
  https.request=()=>{calls++;const req=new EventEmitter(),socket=new EventEmitter();req.destroyed=false;socket.destroyed=false;
   const close=()=>{if(req.destroyed)return;req.destroyed=true;socket.destroyed=true;setImmediate(()=>{reqClosed=true;req.emit("close");socketClosed=true;socket.emit("close");});};req.destroy=close;socket.destroy=close;req.end=()=>{setImmediate(()=>req.emit("socket",socket));return req;};return req;};
  try{let error;try{await acquirePlanClusterInputs({repo:f.repo,sourceCommit:f.sourceCommit,outputRoot:path.join(f.root,"deadline-output")});}catch(e){error=e;}
   assert.equal(deliveredEarly,true);assert.equal(calls,1);assert.equal(reqClosed,true);assert.equal(socketClosed,true);assert.equal(error.reason,"DEADLINE");assert.equal(error.failedOperation.phase,"metadata-before");assert.equal(error.failedOperation.bodyComplete,false);assert.equal(error.failedOperation.sha256,null);assert.equal(error.failedOperation.completedAt,null);assert.equal(error.failedOperation.closedVerified,true);assert(error.failedOperation.terminalElapsedNanoseconds>=45000000000);assert.equal(error.artifactPersistence.complete,true);assert.equal(fs.existsSync(path.join(f.root,"deadline-output")),false);
  }finally{t.mock.restoreAll();https.request=original;}
 });assert.equal(receipt.cleanup,true);t.diagnostic(JSON.stringify({kind:"owned-deadline-fixture-cleanup",complete:receipt.cleanup,actualPublicHTTPS:false,clockOverride:false}));
});
