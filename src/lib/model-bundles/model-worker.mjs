import { AdmissionError, NumericalError, normalizeRaw, validateInput, evaluateInput } from './interpretations/v1/arithmetic.mjs';
import { makeRecordedRun, sha256, hashValue } from './interpretations/v1/encoding.mjs';
import { knownEnginePin, verifyRegistry } from './registry.mjs';
import { WORKER_FORMAT, WORKER_VERSION, exactObject, cloneWorkerRequest, cloneBinding, requestBytes, admissionErrors } from './worker-protocol.mjs';

let used = false;
self.addEventListener('message', event => {
  if (used) return;
  used = true;
  void execute(event.data).catch(() => {
    self.postMessage({ format: WORKER_FORMAT, version: WORKER_VERSION, kind: 'fatal', code: 'protocol' });
    self.close();
  });
});

async function execute(message) {
  exactObject(message, ['format', 'version', 'request', 'requestSha256', 'enginePin', 'binding']);
  if (message.format !== WORKER_FORMAT || message.version !== WORKER_VERSION) throw new TypeError();
  await verifyRegistry();
  const request = cloneWorkerRequest(message.request), binding = cloneBinding(message.binding), enginePin = knownEnginePin();
  if (JSON.stringify(message.enginePin) !== JSON.stringify(enginePin) || message.requestSha256 !== await sha256(requestBytes(request))) throw new TypeError();
  const frame = { format: WORKER_FORMAT, version: WORKER_VERSION, kind: 'result',
    requestSha256: message.requestSha256, enginePin, binding };
  let input;
  try {
    input = request.kind === 'legacy-run' ? normalizeRaw({ parser: 'legacy-amount-strip-v1', ...request.raw }) : validateInput(request.input);
    const evaluation = evaluateInput(input), recorded = await makeRecordedRun(enginePin, input, evaluation);
    const runSha256 = await hashValue('run', recorded);
    self.postMessage({ ...frame, outcome: { kind: 'success', input, recorded, runSha256,
      costs: evaluation.costs, outcomes: evaluation.outcomes } }, [evaluation.costs.buffer, evaluation.outcomes.buffer]);
  } catch (error) {
    if (error instanceof AdmissionError) self.postMessage({ ...frame, outcome: { kind: 'invalid', errors: admissionErrors(error.field, error.reason) } });
    else if (error instanceof NumericalError) self.postMessage({ ...frame, outcome: { kind: 'refused', issue: error.issue } });
    else throw error;
  }
  self.close();
}
