import type {ObservationScopeRecord, ObservationMeasureRecord, ObservationLocator, ObservationEdition} from '../src/lib/observation-types';
declare const scope:ObservationScopeRecord;
if(scope.scopeKind==='humanitarian-plan-cluster'){const plan:'1185'=scope.planCluster.planId;const year:2024=scope.planCluster.referenceYear;void plan;void year;}
const family:ObservationMeasureRecord['family']='humanitarian-plan-funding';void family;
const locator:ObservationLocator={kind:'csv',recordNumber:2,firstLine:2,lastLine:2,byteStart:1,byteEnd:2,rawSha256:'',column:'funding',matches:[{column:'id',expected:'1185'}]};void locator;
// @ts-expect-error unknown columns are not part of the fixed CSV grammar
const bad:ObservationLocator={kind:'csv',recordNumber:2,firstLine:2,lastLine:2,byteStart:1,byteEnd:2,rawSha256:'',column:'invented',matches:[]};void bad;
const method:ObservationEdition['method']['id']='observation-plan-cluster-append-v1';void method;
