import type {AcquisitionInput} from './capture.mjs';
export declare function validatePlanClusterRedirectLocation(value:unknown):string;
export declare function validatePlanClusterMetadataBytes(bytes:Uint8Array):Readonly<Record<string,unknown>>;
export declare function acquirePlanClusterInputs(input:{repo:string;sourceCommit:string;outputRoot:string}):Promise<{readonly outputRoot:string;readonly receiptHash:string;readonly sourceCommit:string;readonly inputs:readonly AcquisitionInput[];readonly complete:true;readonly actualRunEvidence:'local-client-clocks-declared-not-cryptographic';readonly cleanup:{readonly complete:boolean;readonly issues:readonly string[];readonly artifact:unknown}}>;
