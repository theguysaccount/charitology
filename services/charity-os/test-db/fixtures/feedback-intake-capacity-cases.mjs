/** Focused physical reserve assertions on an already-owned PostgreSQL. */
import assert from "node:assert/strict";
import { logicalBackupBytes, saveRecord } from "../../lib/database.mjs";
import { validateBackup } from "../../lib/backup.mjs";
import { restoredIntake, restoreIntake } from "../../lib/intake-backup.mjs";
import { checkLearningRestoreCapacity } from "../../lib/learning-capacity.mjs";
import { feedbackPublicationSchema } from "../../lib/feedback-intake-model.mjs";
import { proposedFeedbackForm } from "../../lib/feedback-intake-form.mjs";
import { validateRecord } from "../../lib/modules.mjs";
import { assembleWorkspaceBackup, checkWorkspaceExportCapacity } from "../../lib/workspace-backup.mjs";
import { measureFeedbackIntakeRemaining } from "../../lib/feedback-intake-capacity.mjs";
import { checkWorkspaceExitCapacity, canRetainWorkspaceExitAudit } from "../../lib/resource-reservation-capacity.mjs";

const source = "fixture-feedback-capacity", restored = "fixture-feedback-restored", actor = "fixture-actor";
const publication = "fixture-publication", form = "fixture-form", first = "fixture-first";
const time = "2200-12-31T23:59:59.999999+14:00";
const wireTime = "2200-12-31T23:59:59.999Z";
const schema = feedbackPublicationSchema("2099-01-01");
const sha = ch => ch.repeat(64);
const answers = { topic:"Using a form",experience:"Clear" };
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const json = value => JSON.parse(JSON.stringify(value));

export async function runFeedbackIntakeCapacityCases({ owner, runtime }) {
  const cases = [];
  const check = async (label,run) => {
    try { await run(); cases.push(label); } catch (cause) { throw new Error(label,{cause}); }
  };
  const read = (org,run) => runtime.tx(actor,org,run,{readOnly:true});
  const write = (org,run) => runtime.tx(actor,org,run,{lock:true});
  const snapshot = (org = source) => read(org,async c=>({
    backup:json(await assembleWorkspaceBackup(c,org)), capacity:await checkWorkspaceExportCapacity(c,org),
  }));
  const direct = async (sql,args=[]) => (await owner.query(sql,args)).rows;
  const physical = async org => (await direct(`SELECT
    COALESCE((SELECT sum(octet_length(to_jsonb(p)::text)) FROM os_publications p WHERE org_id=$1),0)::int +
    COALESCE((SELECT sum(octet_length(to_jsonb(i)::text)) FROM os_intake i WHERE org_id=$1),0)::int AS bytes`,[org]))[0].bytes;

  for (const org of [source,restored]) await owner.query(
    "INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,$1,$1,'USD','UTC')",[org]);
  const formData = validateRecord("forms",proposedFeedbackForm("2099-01-01").data);
  await owner.query(`INSERT INTO os_records(org_id,id,module_id,data,status,owner_id,last_editor_id,revision)
    VALUES($1,$2,'forms',$3::jsonb,'draft',$4,$4,1)`,[source,form,JSON.stringify(formData),actor]);
  let absent, live;
  await check("Feedback absence preserves the previous capacity and native categories",async()=>{
    absent=await snapshot();
    assert.equal(Object.hasOwn(absent.capacity,"feedbackIntake"),false);
    assert.equal(await read(source,c=>measureFeedbackIntakeRemaining(c,source,absent.backup.intake)),null);
    assert.equal(await read(source,c=>checkWorkspaceExitCapacity(c,source)),null);
    assert.equal(await read(source,c=>canRetainWorkspaceExitAudit(c,source,{})),null);
    const projection=await read(source,c=>checkLearningRestoreCapacity(c,absent.backup));
    assert.equal(Object.hasOwn(projection,"feedbackIntake"),false);
  });

  await check("Actual SQL charges and separate native exit deltas are each counted once",async()=>{
    await owner.query(`INSERT INTO os_publications(org_id,id,record_id,source_revision,kind,schema,created_by)
      VALUES($1,$2,$3,1,'feedback',$4::jsonb,$5)`,[source,publication,form,JSON.stringify(schema),actor]);
    await owner.query(`INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,revision,
      idempotency_hash,payload_hash,receipt_hash,ip_hash)
      VALUES($1,$2,$3,$4::jsonb,now(),'pending',9,$5,$6,$7,NULL)`,
    [source,first,publication,JSON.stringify(answers),sha("a"),sha("b"),sha("c")]);
    live=await snapshot();
    const metric=live.capacity.feedbackIntake, used=await physical(source);
    assert.deepEqual([metric.publications,metric.submissions,metric.pendingWithdrawals,metric.pendingCancellations,metric.pendingErasures],[1,1,1,1,1]);
    assert.equal(metric.retainedBytes,used);
    assert.equal(live.capacity.usage-absent.capacity.usage,used);
    assert.equal(live.capacity.requiredUsage-live.capacity.usage,metric.retainedGrowthBytes);
    assert.equal(live.capacity.requiredBackupBytes-live.capacity.backupBytes,metric.nativeGrowthBytes);
    assert.ok(metric.retainedGrowthBytes>0 && metric.nativeGrowthBytes>0);
    const safety=await read(source,c=>checkWorkspaceExitCapacity(c,source));
    assert.deepEqual(safety,{requiredUsage:live.capacity.requiredUsage,requiredBackupBytes:live.capacity.requiredBackupBytes});
    const event={org_id:source,actor_id:actor,action:"intake.cancelled",record_id:null,module_id:null,detail:{intakeId:first,converted:false}};
    const plus=await read(source,c=>checkWorkspaceExitCapacity(c,source,{extraAudit:event}));
    const sql=(await direct("SELECT octet_length(to_jsonb(e)::text) AS n FROM jsonb_populate_record(NULL::os_events,$1::jsonb) e",
      [JSON.stringify({...event,id:"9223372036854775807",created_at:"2200-12-31T23:59:59.999999Z"})]))[0].n;
    assert.equal(plus.requiredUsage-safety.requiredUsage,sql);
    assert.equal(plus.requiredBackupBytes-safety.requiredBackupBytes,bytes({...event,id:"9223372036854775807",created_at:wireTime})+2);
  });

  await check("Projected inactive recovery holds only erasure and matches the persisted typed rows",async()=>{
    const projection=await read(restored,c=>checkLearningRestoreCapacity(c,live.backup,{orgId:restored,actorId:actor}));
    await write(restored,async c=>{
      for(const record of validateBackup(live.backup,restored,actor)) await saveRecord(c,record);
      await restoreIntake(c,restored,actor,restoredIntake(live.backup));
    });
    const after=await snapshot(restored), metrics=after.capacity.feedbackIntake;
    assert.deepEqual([metrics.pendingWithdrawals,metrics.pendingCancellations,metrics.pendingErasures],[0,0,1]);
    assert.equal(projection.feedbackIntake.retainedBytes,projection.categories.os_publications.bytes+projection.categories.os_intake.bytes);
    assert.ok(projection.feedbackIntake.retainedBytes>=await physical(restored));
    assert.equal(after.backup.intake.submissions[0].status,"dismissed");
    const row=(await direct(`SELECT receipt_hash,payload_hash,ip_hash,idempotency_hash FROM os_intake WHERE org_id=$1`,[restored]))[0];
    assert.deepEqual(row,{receipt_hash:null,payload_hash:null,ip_hash:null,idempotency_hash:null});
    assert.equal(await read(restored,c=>logicalBackupBytes(c,restored)),after.capacity.usage);
  });

  await check("Full-width cancel and withdraw consume their prepaid room, then erasure shrinks storage",async()=>{
    await owner.query("UPDATE os_publications SET withdrawn_at=$3::timestamptz WHERE org_id=$1 AND id=$2",[source,publication,time]);
    await owner.query(`UPDATE os_intake SET status='cancelled',cancelled_at=$3::timestamptz,
      revision=revision+1,updated_at=$3::timestamptz WHERE org_id=$1 AND id=$2`,[source,first,time]);
    const cancelled=await snapshot();
    assert.deepEqual([cancelled.capacity.feedbackIntake.pendingWithdrawals,cancelled.capacity.feedbackIntake.pendingCancellations,
      cancelled.capacity.feedbackIntake.pendingErasures],[0,0,1]);
    assert.equal(cancelled.capacity.usage,live.capacity.requiredUsage);
    assert.equal(cancelled.capacity.backupBytes,live.capacity.requiredBackupBytes);
    assert.ok(cancelled.capacity.requiredUsage<=live.capacity.requiredUsage);
    await owner.query(`UPDATE os_intake SET answers='{}'::jsonb,erased_at=$3::timestamptz,
      payload_hash=NULL,revision=revision+1,updated_at=$3::timestamptz WHERE org_id=$1 AND id=$2`,[source,first,time]);
    const erased=await snapshot();
    assert.equal(erased.capacity.feedbackIntake.pendingErasures,0);
    assert.equal(erased.capacity.feedbackIntake.retainedGrowthBytes,0);
    assert.equal(erased.capacity.feedbackIntake.nativeGrowthBytes,0);
    assert.ok(erased.capacity.requiredUsage<cancelled.capacity.requiredUsage);
    assert.ok(erased.capacity.requiredBackupBytes<=cancelled.capacity.requiredBackupBytes);
  });

  await check("Admission refuses a row whose reachable exits cannot both increment safely",async()=>{
    await owner.query(`INSERT INTO os_intake(org_id,id,publication_id,answers,consent_at,status,revision,
      idempotency_hash,payload_hash,receipt_hash) VALUES($1,'fixture-frontier',$2,$3::jsonb,now(),'pending',2147483646,$4,$5,$6)`,
    [source,publication,JSON.stringify(answers),sha("d"),sha("e"),sha("f")]);
    try {
      await assert.rejects(snapshot(),{code:"feedback_intake_capacity"});
      assert.equal(await read(source,c=>canRetainWorkspaceExitAudit(c,source,{
        org_id:source,actor_id:actor,action:"intake.cancelled",record_id:null,module_id:null,detail:{},
      })),false);
    } finally { await owner.query("DELETE FROM os_intake WHERE org_id=$1 AND id='fixture-frontier'",[source]); }
  });
  return { count:cases.length,cases };
}
