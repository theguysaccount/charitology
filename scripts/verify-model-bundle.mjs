#!/usr/bin/env node
import { parseArguments, verifyExplicitFile, verificationResult, ModelBundleFileError, formatVerification, exitCode } from './model-bundle-verifier.mjs';

process.stdout.on('error', () => { process.exitCode = 4; });
let json = process.argv.slice(2).includes('--json'), result;
try {
  const choice = parseArguments(process.argv.slice(2)); json = choice.json;
  result = await verifyExplicitFile(choice.file);
} catch (error) {
  result = verificationResult(error instanceof ModelBundleFileError ? error.status : 'unavailable', {}, error instanceof ModelBundleFileError ? error.message : undefined);
}
process.exitCode = exitCode(result);
process.stdout.write(formatVerification(result, json));
