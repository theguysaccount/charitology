#!/usr/bin/env node
/** CI-only qualification, never a calculator or bundle admission capability. */
import { qualifyModelRuntime } from './model-runtime-qualification.mjs';
if (process.argv.length !== 2) {
  process.stderr.write('Use check-model-runtime.mjs without arguments; the actual runtime selects its reviewed profile.\n');
  process.exitCode = 2;
} else {
  try { process.stdout.write(JSON.stringify(await qualifyModelRuntime()) + '\n'); }
  catch (error) { process.stderr.write(`Model runtime qualification refused: ${error.message}\n`); process.exitCode = 1; }
}
