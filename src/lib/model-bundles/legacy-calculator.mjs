import { createModelWorkerClient, createModelWorkerClientForTesting, ModelWorkerError } from './worker-client.mjs';
import { cloneLegacyRaw } from './worker-protocol.mjs';
import { histogram, formatMoney, formatNumber, formatMoneyTick } from './legacy-display.mjs';
export { ModelWorkerError, histogram, formatMoney, formatNumber, formatMoneyTick };

function calculator(client) {
  async function calculate(value, job) {
    client.cancel();
    // Capture literal labels/numeric strings synchronously, before any await.
    let raw;
    try { raw = cloneLegacyRaw(value); } catch { throw new ModelWorkerError('protocol'); }
    const epoch = job.epoch, generation = job.formGeneration;
    const result = await client.run({ kind: 'legacy-run', raw }, job);
    let current = false;
    try { current = !job.signal.aborted && job.epoch === epoch && job.formGeneration === generation && job.isCurrent() === true; } catch { /* Trusted callback failure revokes. */ }
    if (!current || result.kind === 'cancelled') return { kind: 'cancelled' };
    if (result.kind !== 'success') return result;
    const { input, recorded } = result;
    const cost = tag => tag.kind === 'no-outcome' ? Infinity : tag.value;
    const summary = (values, convert) => ({ median: convert(values.median), p5: convert(values.p5), p95: convert(values.p95) });
    return {
      kind: 'success', raw, enginePin: result.enginePin, input, recorded,
      model: { ...Object.fromEntries(Object.entries(input.values).map(([key, values]) => [key, [...values]])), discount: input.discount },
      run: { draws: 5000, seed: input.seed, costs: result.costs.slice(), outcomes: result.outcomes.slice(),
        cost: summary(recorded.cost, cost), outcome: summary(recorded.outcome, tag => tag.value), none: recorded.none },
      sensitivity: { base: recorded.sensitivity.base.value, rows: recorded.sensitivity.rows.map(row => ({
        key: row.key, atLow: cost(row.atLow), atHigh: cost(row.atHigh), lo: cost(row.lo), hi: cost(row.hi),
        swing: row.swing.kind === 'unbounded' ? Infinity : row.swing.value,
      })) },
      unit: raw.unit.trim() || 'outcome',
    };
  }
  return Object.freeze({ calculate, histogram, formatMoney, formatNumber, formatMoneyTick,
    cancel: () => client.cancel(), dispose: () => client.dispose() });
}
/** Each calculator/controller owns its lane; bundle work uses a different client. */
export function createLegacyCalculator() { return calculator(createModelWorkerClient()); }
/** Test platform only; all real worker protocol/admission/hash/math stays intact. */
export function createLegacyCalculatorForTesting(platform) { return calculator(createModelWorkerClientForTesting(platform)); }
