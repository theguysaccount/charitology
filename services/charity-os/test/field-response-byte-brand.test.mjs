// Resource-free hostile-byte fixtures; these must be refused without invoking hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFieldAggregateFile, FieldResponseError } from '../lib/field-response-model.mjs';
const actualBytes=()=>Buffer.from('{"format":"charitology-aggregate-service-visits","version":1,"formId":"aggregate-service-visits-v1","schemaVersion":1,"responses":[]}');
function refusesInert(value,readCalls){assert.throws(()=>inspectFieldAggregateFile(value),e=>e instanceof FieldResponseError&&e.code==='field_json');assert.equal(readCalls(),0,'byte admission must not traverse attacker prototypes');}
test('ordinary non-byte object with Proxy prototype cannot invoke getPrototypeOf',()=>{let calls=0;const p=new Proxy({}, {getPrototypeOf(){calls++;return null;}});refusesInert(Object.create(p),()=>calls);});
test('throwing Proxy prototype cannot throw through byte admission',()=>{let calls=0;const p=new Proxy({}, {getPrototypeOf(){calls++;throw new Error('fixture prototype hook must stay inert');}});refusesInert(Object.create(p),()=>calls);});
test('native byte brand with substituted Proxy prototype is refused without traversal',()=>{let calls=0;const p=new Proxy({}, {getPrototypeOf(){calls++;return null;}});const bytes=new Uint8Array(actualBytes());Object.setPrototypeOf(bytes,p);refusesInert(bytes,()=>calls);});
test('exact Uint8Array and Buffer prototypes accept; subclasses and fake brands refuse inertly',()=>{assert.equal(inspectFieldAggregateFile(actualBytes()).file.sourceRows,0);assert.equal(inspectFieldAggregateFile(new Uint8Array(actualBytes())).file.sourceRows,0);class Bytes extends Uint8Array{}refusesInert(new Bytes(actualBytes()),()=>0);let calls=0;const fake={get [Symbol.toStringTag](){calls++;return 'Uint8Array';}};refusesInert(fake,()=>calls);});
