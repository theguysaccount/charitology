import type {ObservationEntityRecord,ObservationAnyRecord,ObservationInstant} from '../observation-types';
export interface PlanClusterDeclaredReceipt {bytes:Uint8Array;startedAt:ObservationInstant;completedAt:ObservationInstant;httpDate:string|null}
export interface PlanClusterRecordPreparation {
 readonly format:'charitology-plan-cluster-record-preparation';readonly version:1;
 readonly records:readonly ObservationAnyRecord[];readonly files:Readonly<Record<string,string>>;
 readonly report:Readonly<{newCaptureProved:false;declaredClocksOnly:true;selectedTuple:string;csvSha256:string;csvBytes:number;records:number;
 metadataBefore:Readonly<{sha256:string;bytes:number;startedAt:string;completedAt:string}>;
 metadataAfter:Readonly<{sha256:string;bytes:number;startedAt:string;completedAt:string}>;
 fullMetadataPublic:false;publicEvidenceBytes:number}>;
}
/** Pure Node preparation. Actual acquisition/previous-registry/source-commit proof belongs to future capture I/O. */
export function preparePlanClusterObservationRecords(input:{csv:PlanClusterDeclaredReceipt;metadataBefore:PlanClusterDeclaredReceipt;metadataAfter:PlanClusterDeclaredReceipt;entity:ObservationEntityRecord},previousRecords?:readonly ObservationAnyRecord[]):PlanClusterRecordPreparation;
