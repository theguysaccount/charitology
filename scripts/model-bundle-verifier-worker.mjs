// Fixed installed code only. Engine source supplied in the selected JSON stays inert.
import { parentPort } from 'node:worker_threads';
import { parseSelected } from '../src/lib/model-bundles/graph.mjs';
import { ModelBundleError, sha256Bytes, equal } from '../src/lib/model-bundles/codec.mjs';
import { RUN_FIELDS, runFingerprint, validateNumericalIssue } from '../src/lib/model-bundles/content.mjs';
import { AdmissionError, NumericalError, evaluateInput } from '../src/lib/model-bundles/interpretations/v1/arithmetic.mjs';
import { makeRecordedRun } from '../src/lib/model-bundles/interpretations/v1/encoding.mjs';
import { verificationResult, CLI_LIMITS } from './model-bundle-verifier.mjs';

parentPort.once('message', async message => {
  let chosenFileSha256 = null;
  try {
    if (!message || Object.keys(message).length !== 3 || message.format !== 'charitology-model-cli-job' || message.version !== 1 || !(message.bytes instanceof Uint8Array) || message.bytes.byteLength > CLI_LIMITS.bytes) throw new TypeError();
    const bytes = message.bytes; chosenFileSha256 = await sha256Bytes(bytes);
    let bundle;
    try { bundle = await parseSelected(bytes); }
    catch (error) {
      if (error instanceof ModelBundleError && error.code === 'unsupported-engine') parentPort.postMessage(verificationResult('unsupported', { chosenFileSha256 }));
      else if (error instanceof ModelBundleError && !error.code.startsWith('installed-') || error instanceof AdmissionError || error instanceof NumericalError) parentPort.postMessage(verificationResult('invalid', { chosenFileSha256 }));
      else parentPort.postMessage(verificationResult('unavailable', { chosenFileSha256 }));
      return;
    }
    const { hash: versionHash, content } = bundle.modelVersion;
    const values = { chosenFileSha256, versionHash, enginePin: content.enginePin, declared: await runFingerprint(content.run) };
    try {
      const recorded = await makeRecordedRun(content.enginePin, content.input, evaluateInput(content.input));
      const recalculated = await runFingerprint(recorded), differences = RUN_FIELDS.filter(field => !equal(content.run[field], recorded[field]));
      parentPort.postMessage(verificationResult(differences.length ? 'mismatched' : 'matched', { ...values, recalculated, differences }));
    } catch (error) {
      if (!(error instanceof NumericalError)) throw error;
      parentPort.postMessage(verificationResult('numeric-refusal', { ...values, issue: validateNumericalIssue(error.issue) }));
    }
  } catch { parentPort.postMessage(verificationResult('unavailable', { chosenFileSha256 })); }
  finally { parentPort.close(); }
});
