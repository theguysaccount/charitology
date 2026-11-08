// Actual restore projection with an explicit SELECT-only measurement double.
// This observes outgoing audit/wire shape; it does not claim PostgreSQL byte charges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup } from '../lib/backup.mjs';
import { measureLearningRestoreCapacity, LEARNING_RESTORE_CAPACITY as C } from '../lib/learning-capacity.mjs';
import { makeIncubatorBackup } from '../lib/incubator-bridge-model.mjs';
import { sourceFixture, eventFixture, entry } from './incubator-fixtures.mjs';
import { restoreMeasurementFixture } from './restore-capacity-fixture.mjs';

async function project(backup) {
  const {observed,query}=restoreMeasurementFixture();
  const c={query:async(sql,args)=>{const value=query(sql,args);assert.notEqual(value,undefined,'Unexpected SELECT-only projection fixture query');return value;}};
  const result = await measureLearningRestoreCapacity(c,backup);
  const audits = observed.get('os_events').filter(row=>row.action==='backup.restored');
  assert.equal(audits.length,1);
  return {detail:audits[0].detail,result};
}
const organization={name:'Fictional restore counter boundary',currency:'USD',time_zone:'UTC'};
const oldDetail = backup => ({count:0,checksum:backup.checksum,sourceArchiveId:C.archiveId,sourceHistoryCount:4294967295,sourceCommentCount:0,sourceReportCount:0,learningSourcesRecovered:0,learningEventsRetained:0,learningReportsRecovered:0,intakePublicationsClosed:0,intakeRequests:0,participationTargetsRecovered:0,participationsRecovered:0,taskRecurrenceSeriesRecovered:0,taskRecurrenceOccurrencesRetained:0});
for (const [name,extras] of [['legacy',{}],['v3-only',{participation:{version:3,targets:[],participations:[],outbox:[]}}]]) {
  test(`${name} backups keep the released restore audit shape with no Incubator counters`,async()=>{
    const backup=makeBackup(organization,[],extras),{detail,result}=await project(backup);
    assert.deepEqual(detail,oldDetail(backup));
    assert.deepEqual(result.categories.os_incubator_history,{count:0,bytes:0,rawBytes:0});
  });
}
test('an explicitly present empty Incubator envelope retains explicit zero recovery counters',async()=>{
  const backup=makeBackup(organization,[],{incubatorBridge:makeIncubatorBackup({sources:[],events:[]})});
  const {detail}=await project(backup);
  assert.deepEqual(detail,{...oldDetail(backup),incubatorSourcesRecovered:0,incubatorEventsRetained:0});
});
test('retained Incubator history keeps its nonzero counters in the projected audit',async()=>{
  const source=sourceFixture(),event=eventFixture(source);
  const backup=makeBackup(organization,[],{incubatorBridge:makeIncubatorBackup({sources:[source],events:[entry(event)]})});
  const {detail,result}=await project(backup);
  assert.deepEqual(detail,{...oldDetail(backup),incubatorSourcesRecovered:1,incubatorEventsRetained:1});
  assert.equal(result.categories.os_incubator_history.count,2);
});
