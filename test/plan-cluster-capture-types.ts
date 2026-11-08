import { acquirePlanClusterInputs } from '../src/lib/humanitarian-plan-cluster/acquire.mjs';
import { preparePlanClusterAppendRequest, writeReviewedPlanClusterAppend } from '../src/lib/humanitarian-plan-cluster/capture-io.mjs';
acquirePlanClusterInputs({repo:'/fictional/repo',sourceCommit:'a'.repeat(40),outputRoot:'/fictional/private'});
// @ts-expect-error Transport URL is never a caller override.
acquirePlanClusterInputs({repo:'/fictional/repo',sourceCommit:'a'.repeat(40),outputRoot:'/fictional/private',url:'https://example.invalid'});
// @ts-expect-error Real request creation does not accept a caller clock.
preparePlanClusterAppendRequest({repo:'/fictional/repo',retainedRoot:'/fictional/raw',sourceCommit:'a'.repeat(40),previousCommit:'b'.repeat(40),editionId:'fictional',outputFile:'/fictional/request.json',capturedAt:'2000-01-01T00:00:00.000Z'});
// @ts-expect-error A plain rehydrated preview has no opaque owner marker.
writeReviewedPlanClusterAppend({format:'charitology-plan-cluster-append-preview',version:1,proposalHash:'a'.repeat(64)},'a'.repeat(64));
