import { cloneLegacyRaw } from './worker-protocol.mjs';
const providers = new WeakMap();
const unavailable = () => { throw new Error('Current calculator inputs are unavailable.'); };
/** Trusted same-tab installation after the calculator's own initialization. */
export function installCalculatorCopyProvider(root, provider) {
  if (!root || typeof root !== 'object' || typeof provider?.capture !== 'function' || typeof provider?.isCurrent !== 'function') throw new TypeError('A calculator root and provider are required.');
  const entry = { provider }, current = () => providers.get(root) === entry;
  entry.view = Object.freeze({
    capture() {
      if (!current()) unavailable();
      let captured;
      try { captured = provider.capture(); } catch { unavailable(); }
      if (!current() || !Number.isSafeInteger(captured?.formGeneration) || captured.formGeneration < 0) unavailable();
      let raw; try { raw = cloneLegacyRaw(captured.raw); } catch { unavailable(); }
      if (!current() || !entry.view.isCurrent(captured.formGeneration)) unavailable();
      return Object.freeze({ raw, formGeneration: captured.formGeneration });
    },
    isCurrent(generation) {
      try { return current() && Number.isSafeInteger(generation) && generation >= 0 && provider.isCurrent(generation) === true && current(); }
      catch { return false; }
    },
  });
  providers.set(root, entry);
  return () => { if (current()) providers.delete(root); };
}
export function calculatorCopyProvider(root) { return providers.get(root)?.view ?? null; }
