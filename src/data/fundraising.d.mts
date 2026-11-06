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
export interface FundraisingMethod {
  review: 'draft';
  id: string;
  title: string;
  summary: string;
  goal: string;
  fit: string;
  costs: readonly string[];
  preflight: readonly string[];
  steps: readonly string[];
  measure: readonly string[];
  experiment: string;
  followup: readonly string[];
  pitfalls: readonly string[];
  sourceIds: readonly string[];
  osModules: readonly string[];
}
export const fundraisingSources: readonly FundraisingSource[];
export const fundraisingMethods: readonly FundraisingMethod[];
