/** Independent retained pre-reminder golden; strict fake SELECT, not PG bytes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from './fixtures/field-legacy-restore-projection-v1.json' with {type:'json'};
import {restoreMeasurementFixture} from './restore-capacity-fixture.mjs';
import {measureLearningRestoreCapacity} from '../lib/learning-capacity.mjs';
test('reminder-absent full inactive categories retain the unchanged pre-reminder golden object',async()=>{
 const fixture=restoreMeasurementFixture();
 const client={async query(sql,args){const result=fixture.query(sql,args);if(result===undefined)throw new Error('Unexpected closed legacy category query: '+sql);return result;}};
 const result=await measureLearningRestoreCapacity(client,structuredClone(legacy.input));
 assert.deepEqual(result.categories,legacy.result.categories);
});
