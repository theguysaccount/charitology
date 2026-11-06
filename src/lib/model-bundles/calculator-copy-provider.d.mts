import type { CalculatorCopyProvider } from './types.js';
export function installCalculatorCopyProvider(root: HTMLElement, provider: CalculatorCopyProvider): () => void;
export function calculatorCopyProvider(root: HTMLElement): CalculatorCopyProvider | null;
