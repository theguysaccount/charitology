/** Private pure proposal; these values confer no source-origin, capture or business authority. */
export type Sha256 = string;
export type PlanClusterRow = Readonly<{
 countryCode:string; id:string; name:string; code:string; startDate:string; endDate:string; year:string;
 clusterCode:string; cluster:string; requirements:string; funding:string; percentFunded:string;
}>;
export type PlanClusterLocator = Readonly<{recordNumber:number;firstLine:number;lastLine:number;byteStart:number;byteEnd:number;rawSha256:Sha256}>;
export type PlanClusterSelection = Readonly<{countryCode:'AFG';planId:'1185';planCode:'HAFG24';planName:'Afghanistan Humanitarian Needs and Response Plan 2024';clusterCode:'7415';clusterName:'Education';referenceYear:2024;start:'2024-01-01';end:'2024-12-31'}>;
export type PlanClusterCauseBinding = Readonly<{method:'plan-cluster-cause-map-v1';causeId:'education';sourceClusterName:'Education';basis:'explicit-selected-source-cluster';review:'draft'}>;
export type PlanClusterSourceDescriptor = Readonly<{
 datasetId:string;resourceId:string;resourceName:string;resourceUrl:string;resourceBytes:number;
 resourceModified:string;metadataModified:string;publisherHashLiteral:string;
 license:Readonly<{id:'cc-by-igo';title:string;url:string}>;attribution:string;
}>;
export type ParsedPlanClusterSource = Readonly<{
 format:'charitology-plan-cluster-parsed-source';version:1;sourceBytes:number;sourceSha256:Sha256;totalRecords:number;
 selected:Readonly<{key:'AFG:1185:2024:7415';raw:PlanClusterRow;locator:PlanClusterLocator}>;
}>;
export type PlanClusterAmount = Readonly<{state:'present'|'missing';token:string;decimal:null|Readonly<{coefficient:string;scale:number}>;unit:'USD'}>;
export type PlanClusterProjection = Readonly<{
 format:'charitology-plan-cluster-pure-projection';version:1;method:'ocha-fts-plan-cluster-v1';definitionSha256:Sha256;
 selection:PlanClusterSelection;causeBinding:PlanClusterCauseBinding;
 source:Readonly<{csvSha256:Sha256;csvBytes:number;records:number;descriptor:PlanClusterSourceDescriptor}>;
 row:ParsedPlanClusterSource['selected'];values:Readonly<{requirements:PlanClusterAmount;funding:PlanClusterAmount}>;
 derived:Readonly<{status:'comparable'|'both-missing'|'requirements-missing'|'funding-missing'|'zero-requirements';numerator:string|null;denominator:string|null;displayPercent:string|null;differenceUSD:string|null}>;
 review:'draft';limitations:readonly string[];sha256:Sha256;
}>;
export const PLAN_CLUSTER_DEFINITION:Readonly<Record<string,unknown>>;
export const PLAN_CLUSTER_DEFINITION_SHA256:Sha256;
export const PLAN_CLUSTER_SELECTION:PlanClusterSelection;
export const PLAN_CLUSTER_CAUSE_BINDING:PlanClusterCauseBinding;
export const PLAN_CLUSTER_HEADERS:readonly string[];
export const PLAN_CLUSTER_LIMITS:Readonly<{bytes:1048576;records:10000;field:2000;objectBytes:65536;nodes:4000;depth:24}>;
export const PLAN_CLUSTER_LICENSE:Readonly<{metadataLicenseId:'cc-by-igo';title:string;termsUrl:string;attribution:string}>;
export const PLAN_CLUSTER_KEY:'AFG:1185:2024:7415';
/** Only exact native Uint8Array/Buffer prototypes; shared/resizable/decorated values refuse. */
export function parsePlanClusterCsv(input:Uint8Array):ParsedPlanClusterSource;
/** Declared metadata shape only. Does not authenticate license, host or retrieval time. */
export function validatePlanClusterSourceDescriptor(input:unknown):PlanClusterSourceDescriptor;
/** Requires this module's actual branded parse result, not a rehydrated object. */
export function makePlanClusterPureProjection(parsed:ParsedPlanClusterSource,sourceDescriptor:unknown):PlanClusterProjection;
/** Validates closed data/math/seal. Raw source SHA/locator still require actual-byte verification. */
export function validatePlanClusterPureProjection(input:unknown):PlanClusterProjection;
export function verifyPlanClusterProjectionAgainstCsv(projection:unknown,input:Uint8Array):PlanClusterProjection;
