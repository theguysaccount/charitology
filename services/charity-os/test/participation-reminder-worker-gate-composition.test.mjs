/** Exact held context leaf with actual configuration gate and error helper.
 * Source/composition control only: not the full SQL authority loader or worker. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const unexpected = () => assert.fail('No database helper permitted in source-leaf composition test');
mock.module(new URL('../lib/database.mjs', import.meta.url).href, { namedExports: {
  rowRecord: unexpected, audit: unexpected, database: unexpected, allRecords: unexpected, saveRecord: unexpected,
  logicalBackupBytes: unexpected, storePreview: unexpected, commitPreview: unexpected,
  noteParticipationReceiptReplay: unexpected, noteContactReconciliationReceiptReplay: unexpected, notePublicFeedbackReceiptReplay: unexpected,
  PREVIEW_LIMITS: { pendingCount: 4, committedCount: 32, pendingBytes: 134217728, committedBytes: 134217728 },
} });
const { participationDeliveryGate } = await import('../lib/participation-delivery.mjs');
const { reminderNeed: need } = await import('../lib/participation-reminder-choice.mjs');
const source = readFileSync(new URL('../lib/participation-reminder-context.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('    need(policy.enabled === true'), end = source.indexOf('    items.push(', begin);
assert(begin >= 0 && end > begin); const guard = source.slice(begin, end);
function evaluate(deferTransportGate, enabled = true) {
  return vm.runInNewContext(guard, { need, policy: { enabled }, deferTransportGate,
    participationDeliveryGate, recipient: { email: 'fictional@example.invalid' },
    settings: { participationDeliveryEnabled: false, participationTestOnly: false, relaySecret: '' } }, { timeout: 1000 });
}
test('worker defers transient transport after current authority instead of context cancellation', () => {
  assert.doesNotThrow(() => evaluate(true));
});
test('staff admission still refuses transient transport and worker still refuses disabled policy', () => {
  assert.throws(() => evaluate(false), e => e.status === 409);
  assert.throws(() => evaluate(true, false), e => e.status === 409);
});
