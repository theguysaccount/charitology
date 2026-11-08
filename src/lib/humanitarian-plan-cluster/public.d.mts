import type {
  ValidatedObservationRegistry, ObservationEdition, ObservationEditionPin,
  ObservationEntityRecord, ObservationScopeRecord, ObservationMeasureRecord,
  ObservationRecord, ObservationCoverageRecord, ObservationSourceRecord,
} from '../observation-types';
import type { PlanClusterProjection, ParsedPlanClusterSource } from './model.mjs';
export interface PlanClusterObservationProjection {
  readonly format: 'charitology-humanitarian-plan-cluster-projection';
  readonly version: 1;
  readonly edition: ObservationEditionPin;
  readonly capturedAt: string;
  readonly code: Readonly<{commit: string; method: ObservationEdition['method']}>;
  readonly selection: PlanClusterProjection['selection'];
  readonly causeBinding: PlanClusterProjection['causeBinding'];
  readonly entity: ObservationEntityRecord;
  readonly scope: Extract<ObservationScopeRecord, {scopeKind: 'humanitarian-plan-cluster'}>;
  readonly measures: readonly ObservationMeasureRecord[];
  readonly observations: readonly ObservationRecord[];
  readonly coverage: ObservationCoverageRecord;
  readonly row: ParsedPlanClusterSource['selected'];
  readonly derived: PlanClusterProjection['derived'];
  readonly source: ObservationSourceRecord & {
    payload: Extract<ObservationSourceRecord['payload'], {kind: 'public-csv'}>;
  };
  readonly licenseSource: ObservationSourceRecord;
  readonly limitations: readonly string[];
  readonly review: 'draft';
  readonly sha256: string;
}
export function planClusterObservationProjection(input: ValidatedObservationRegistry, editionId: string): PlanClusterObservationProjection | null;
export const PLAN_CLUSTER_CSV_TEXT_POLICY: string;
export function planClusterObservationExport(input: ValidatedObservationRegistry, editionId: string, format: 'json' | 'csv'): Readonly<{
  mediaType: 'application/json' | 'text/csv'; filename: string; body: string;
  bytes: number; sha256: string; edition: ObservationEditionPin;
}> | null;
