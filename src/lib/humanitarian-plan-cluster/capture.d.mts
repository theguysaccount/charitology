export interface EditionPin { readonly id:string; readonly hash:string; readonly sequence:number }
export interface SourceFilePin { readonly path:string; readonly sha256:string; readonly bytes:number }
export interface PlanClusterMethod { readonly id:'observation-plan-cluster-append-v1'; readonly definitionSha256:string; readonly adapterSha256:string }
export interface PlanClusterBaseline { readonly commit:string; readonly files:readonly {readonly path:string;readonly sha256:string;readonly bytes:Uint8Array}[] }
export interface AcquisitionOperation { readonly phase:'metadata-before'|'hdx-resource-redirect'|'csv'|'metadata-after';readonly url:string;readonly status:200|302;readonly mediaType:string;readonly declaredLength:number|null;readonly bytes:number;readonly sha256:string;readonly startedAt:string;readonly completedAt:string;readonly elapsedNanoseconds:number;readonly httpDate:string|null;readonly etag:string|null;readonly lastModified:string|null;readonly settled:true }
export interface AcquisitionInput { readonly name:'metadata-before'|'cluster-csv'|'metadata-after';readonly sha256:string;readonly bytes:number;readonly startedAt:string;readonly completedAt:string;readonly httpDate:string|null }
export interface PlanClusterAcquisitionReceipt { readonly format:'charitology-plan-cluster-acquisition';readonly version:1;readonly sourceCommit:string;readonly method:PlanClusterMethod;readonly sourceFiles:readonly SourceFilePin[];readonly previousRegistryHash:string;readonly expectedPrevious:EditionPin;readonly operations:readonly AcquisitionOperation[];readonly inputs:readonly AcquisitionInput[];readonly complete:true;readonly hash:string }
export interface PlanClusterPreparedInput { readonly receipt:PlanClusterAcquisitionReceipt;readonly metadataBefore:Uint8Array;readonly csv:Uint8Array;readonly metadataAfter:Uint8Array }
export interface PlanClusterAppendRequest { readonly format:'charitology-plan-cluster-append-request';readonly version:1;readonly sourceCommit:string;readonly previousCommit:string;readonly editionId:string;readonly capturedAt:string;readonly assemblyElapsedNanoseconds:number;readonly expectedPrevious:EditionPin;readonly previousRegistryHash:string;readonly preparedInputManifestHash:string;readonly requestHash:string }
declare const ownedCandidate:unique symbol;
export interface PlanClusterAppendPreview { readonly [ownedCandidate]:true;readonly format:'charitology-plan-cluster-append-preview';readonly version:1;readonly request:PlanClusterAppendRequest;readonly proposalHash:string;readonly candidateRegistryHash:string;readonly files:readonly SourceFilePin[];readonly sourceFiles:readonly SourceFilePin[];readonly historyBytes:number;readonly editionBytes:number;readonly acquisitionReceiptHash:string }
export declare const PLAN_CLUSTER_S3_URL:string;
export declare const PLAN_CLUSTER_INPUT_NAMES:readonly string[];
export declare const PLAN_CLUSTER_INPUT_FILES:readonly string[];
export declare function copyPlanClusterBaseline(input:unknown):PlanClusterBaseline;
export declare function copyPlanClusterAcquisitionReceipt(input:unknown):PlanClusterAcquisitionReceipt;
export declare function copyPlanClusterPreparedInput(input:unknown):PlanClusterPreparedInput;
export declare function planClusterAppendRequestHash(input:unknown):string;
export declare function makePlanClusterAppendRequest(input:Omit<PlanClusterAppendRequest,'requestHash'>):PlanClusterAppendRequest;
export declare function buildPlanClusterAppendCandidate(previousFiles:Readonly<Record<string,string|Uint8Array>>,prepared:unknown,baseline:unknown,request:unknown):PlanClusterAppendPreview;
export declare function planClusterAppendCandidateFiles(preview:PlanClusterAppendPreview):Readonly<Record<string,string>>;
export declare function planClusterAppendCandidateReport(preview:PlanClusterAppendPreview):unknown;
