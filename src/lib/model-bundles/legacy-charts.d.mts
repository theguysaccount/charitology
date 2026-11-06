import type { LegacyHistogram } from './types.js';
import type { sensitivityChartDomain } from './legacy-display.mjs';
export function buildLegacyHistogram(plan: LegacyHistogram, options: { total: number; label: string; xTitle: string; tip(bin: {x0:number;x1:number;count:number}, share: number): string }): HTMLElement;
export function buildLegacySensitivity(domain: ReturnType<typeof sensitivityChartDomain>, rows: {label:string;lo:number;hi:number;display:string;tip:string}[], label:string): HTMLElement;
