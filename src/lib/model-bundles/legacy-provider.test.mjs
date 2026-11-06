import test from 'node:test';
import assert from 'node:assert/strict';
import { installCalculatorCopyProvider, calculatorCopyProvider } from './calculator-copy-provider.mjs';
const raw = () => ({ name: '\ud800', unit: '\u0000', values: Object.fromEntries(['cost', 'people', 'works', 'effect', 'years', 'anyway'].map(key => [key, [' unfinished ', '', '']])), discount: '', seed: '0x2a' });
test('same-root replacement invalidates old provider and old-owner disposal cannot remove the new one', () => {
  const root = {}, first = raw(); let generation = 0;
  const disposeA = installCalculatorCopyProvider(root, { capture: () => ({ raw: first, formGeneration: generation }), isCurrent: value => value === generation });
  const a = calculatorCopyProvider(root), capture = a.capture(); first.values.cost[0] = 'new';
  assert.equal(capture.raw.values.cost[0], ' unfinished '); assert.equal(capture.raw.name, '\ud800'); assert.equal(capture.raw.unit, '\u0000');
  generation++; assert.equal(a.isCurrent(capture.formGeneration), false);
  const disposeB = installCalculatorCopyProvider(root, { capture: () => ({ raw: raw(), formGeneration: 3 }), isCurrent: value => value === 3 });
  const b = calculatorCopyProvider(root); disposeA(); assert.equal(calculatorCopyProvider(root), b);
  assert.equal(a.isCurrent(0), false); assert.throws(() => a.capture(), /Current calculator inputs are unavailable/);
  assert.equal(b.capture().formGeneration, 3); disposeB(); assert.equal(calculatorCopyProvider(root), null);
});
test('callback failure/reentrant replacement and malformed capture fail closed without private exception text', () => {
  const root = {};
  let dispose = installCalculatorCopyProvider(root, { capture() { throw new Error('private callback payload'); }, isCurrent: () => true });
  assert.throws(() => calculatorCopyProvider(root).capture(), error => !error.message.includes('private'));
  dispose();
  dispose = installCalculatorCopyProvider(root, { capture: () => ({ raw: raw(), formGeneration: 0 }), isCurrent() {
    installCalculatorCopyProvider(root, { capture: () => ({ raw: raw(), formGeneration: 1 }), isCurrent: () => true }); return true;
  } });
  const stale = calculatorCopyProvider(root); assert.throws(() => stale.capture()); dispose();
  assert.equal(calculatorCopyProvider(root).capture().formGeneration, 1);
  dispose = installCalculatorCopyProvider(root, { capture: () => ({ raw: { ...raw(), nativeSavedId: 'forged' }, formGeneration: 0 }), isCurrent: () => true });
  assert.throws(() => calculatorCopyProvider(root).capture()); dispose();
});
