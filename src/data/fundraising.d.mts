import type { SymbolName } from '../lib/site-symbols';

export interface FundraisingSource {
  review: 'draft';
  id: string;
  title: string;
  url: string;
  kind: string;
  checkedAt: string;
  summary: string;
  limits: string;
}
export type FundraisingNote = readonly [text: string, symbol: SymbolName];

export interface FundraisingMethod {
  review: 'draft';
  id: string;
  title: string;
  summary: string;
  goal: string;
  fit: string;
  costs: readonly FundraisingNote[];
  preflight: readonly FundraisingNote[];
  steps: readonly FundraisingNote[];
  measure: readonly FundraisingNote[];
  experiment: string;
  followup: readonly FundraisingNote[];
  pitfalls: readonly FundraisingNote[];
  sourceIds: readonly string[];
  osModules: readonly string[];
}
export interface FundraisingResult {
  review: 'draft';
  id: string;
  methodId: string;
  title: string;
  design: string;
  context: string;
  comparison: string;
  window: string;
  measurement: {
    caption: string;
    columns: readonly [string, string, ...string[]];
    rows: readonly (readonly [string, string, ...string[]])[];
  };
  finding: string;
  costs: string;
  limits: string;
  sources: readonly { label: string; url: string }[];
}
export const fundraisingLearningFormUrl: string;
export const fundraisingSources: readonly FundraisingSource[];
export const fundraisingMethods: readonly FundraisingMethod[];
export const fundraisingResults: readonly FundraisingResult[];
