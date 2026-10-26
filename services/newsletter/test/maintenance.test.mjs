import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSubscribers } from '../lib/operations.mjs';
test('Expired reconciliation budget performs no database or provider work', async () => {
  const fail = new Proxy({}, { get: () => { throw new Error('unexpected work'); } });
  assert.deepEqual(await reconcileSubscribers(fail, fail, {}, { deadline: Date.now()-1 }), { completed: 0, failed: 0, stoppedForBudget: true });
});
test('Bounded maintenance continues past one failed row while manual reconciliation still stops', async () => {
  let attempted = 0; let deferred = 0;
  const db = { tx: async action => action({ query: async (sql, values) => {
    if (sql.startsWith('UPDATE')) { assert.equal(values[0], 'a@example.invalid'); deferred++; return { rowCount: 1 }; }
    assert.equal(values[0], 2); return { rows: [{ email: 'a@example.invalid' }, { email: 'b@example.invalid' }] };
  } }), exclusive: async () => { attempted++; if (attempted === 1) throw new Error('one preference failed'); } };
  assert.deepEqual(await reconcileSubscribers(db, {}, {}, { limit: 2, continueOnError: true, deadline: Date.now()+1000 }), { completed: 1, failed: 1, stoppedForBudget: false });
  assert.equal(deferred, 1, 'failed row moves behind older pending work for the next bounded run');
  attempted = 0;
  await assert.rejects(reconcileSubscribers(db, {}, {}, { limit: 2 }), /one preference failed/);
});
