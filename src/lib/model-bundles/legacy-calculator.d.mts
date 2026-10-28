import type { LegacyCalculatorAPI } from './types.js';
import type { ModelWorkerPlatform } from './worker-client.mjs';
export { ModelWorkerError } from './worker-client.mjs';
export { histogram, formatMoney, formatNumber, formatMoneyTick } from './legacy-display.mjs';
export type LegacyCalculator = LegacyCalculatorAPI & { cancel(): void; dispose(): void };
/** calculate rejects only bounded ModelWorkerError codes for timeout/unavailable/protocol failures. */
export function createLegacyCalculator(): LegacyCalculator;
export function createLegacyCalculatorForTesting(platform: ModelWorkerPlatform): LegacyCalculator;
