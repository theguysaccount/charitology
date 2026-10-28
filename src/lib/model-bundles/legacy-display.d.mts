import type { LegacyRunProjection, LegacyHistogram, LegacySensitivityProjection } from './types.js';
export function histogram(run: LegacyRunProjection): LegacyHistogram;
export function formatMoney(value: number): string;
export function formatNumber(value: number): string;
export function formatMoneyTick(value: number, step: number): string;
export type DisplayTicks = { kind: 'available'; ticks: number[]; step: number }
  | { kind: 'unavailable'; reason: 'numeric-display-range' };
export function displayTicks(min: number, max: number, count?: number): DisplayTicks;
export function sensitivityChartDomain(value: LegacySensitivityProjection):
  { kind: 'available'; min: number; max: number; ticks: number[]; step: number }
  | { kind: 'unavailable'; reason: 'numeric-display-range' };
