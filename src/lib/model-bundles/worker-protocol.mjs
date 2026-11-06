// Fixed worker transport only. No supplied code, URL, validator or callback crosses it.
import { validateInput } from './interpretations/v1/arithmetic.mjs';
export const WORKER_FORMAT = 'charitology-model-worker';
export const WORKER_VERSION = 1;
export const ROWS = Object.freeze(['cost', 'people', 'works', 'effect', 'years', 'anyway']);
export const workerBad = () => { throw new TypeError('Invalid model worker transport.'); };
export function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) workerBad();
  const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'))) workerBad();
}
export function cloneLegacyRaw(raw) {
  exactObject(raw, ['name', 'unit', 'values', 'discount', 'seed']);
  exactObject(raw.values, ROWS);
  for (const key of ['name', 'unit', 'discount', 'seed']) if (typeof raw[key] !== 'string' || raw[key].length > 16384) workerBad();
  const values = {};
  for (const row of ROWS) {
    const triple = raw.values[row];
    if (!Array.isArray(triple) || Object.getPrototypeOf(triple) !== Array.prototype || triple.length !== 3 || Reflect.ownKeys(triple).length !== 4) workerBad();
    const descriptors = Object.getOwnPropertyDescriptors(triple);
    if (['0', '1', '2'].some(key => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value') || typeof descriptors[key].value !== 'string' || descriptors[key].value.length > 16384)) workerBad();
    values[row] = Object.freeze(triple.slice());
  }
  return Object.freeze({ name: raw.name, unit: raw.unit, values: Object.freeze(values), discount: raw.discount, seed: raw.seed });
}
export function cloneWorkerRequest(request) {
  if (request?.kind === 'legacy-run') {
    exactObject(request, ['kind', 'raw']);
    return Object.freeze({ kind: 'legacy-run', raw: cloneLegacyRaw(request.raw) });
  }
  exactObject(request, ['kind', 'input']);
  if (request.kind !== 'normalized-run') workerBad();
  return Object.freeze({ kind: 'normalized-run', input: validateInput(request.input) });
}
export function cloneBinding(binding) {
  exactObject(binding, ['epoch', 'formGeneration', 'storeGeneration']);
  if (!Number.isSafeInteger(binding.epoch) || binding.epoch < 1 || !Number.isSafeInteger(binding.formGeneration) || binding.formGeneration < 0 ||
      binding.storeGeneration !== null && (!Number.isSafeInteger(binding.storeGeneration) || binding.storeGeneration < 1)) workerBad();
  return Object.freeze({ epoch: binding.epoch, formGeneration: binding.formGeneration, storeGeneration: binding.storeGeneration });
}
export function requestBytes(request) {
  // Escaped JSON preserves exact legacy UTF-16 label code units, including a
  // lone surrogate that is valid writing in the old calculator but no bundle.
  return new TextEncoder().encode('charitology-model-worker/v1/request\n' + JSON.stringify(cloneWorkerRequest(request)) + '\n');
}
export function admissionErrors(field, reason) {
  const key = [...ROWS, 'discount', 'seed'].includes(field) ? field : 'cost';
  let message = 'Use complete plain numeric inputs within this calculator’s supported limits.';
  if (key === 'seed') message = 'Use a whole number from 1 to 4294967295.';
  else if (key === 'discount') message = 'Use a discount rate from 0% up to, but below, 100%.';
  else if (reason === 'order') message = 'Put the values in order: low, then likely, then high.';
  else if (reason === 'positive-mode') message = 'The likely value must be above zero, or the likely case has no outcome to count.';
  else if (key === 'cost' && reason === 'positive') message = 'Costs must be above zero.';
  else if (key === 'people' && reason === 'positive') message = 'Enter a number of people above zero.';
  else if (key === 'effect' && reason === 'range') message = 'Use 0 or more. This kit cannot model harm.';
  else if (key === 'years' && reason === 'range') message = 'Use 0 or more years.';
  else if (key === 'works' && reason === 'range') message = 'Use percentages from 0 to 100.';
  else if (key === 'anyway' && reason === 'range') message = 'Use percentages from 0 to 99.';
  return { [key]: message };
}
