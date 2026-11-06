import type { KnownEngine, EnginePin, GoldenVectors, Hash } from './types.js';
export function knownEngine(): KnownEngine;
export function knownEnginePin(): EnginePin;
export function knownGoldenVectors(): GoldenVectors;
export function verifyRegistry(): Promise<void>;
export function assertKnownEngine(value: unknown): Promise<void>;
export function validateInertEngineEnvelope(value: unknown): Promise<void>;
export function verifyGoldenVectors(): Promise<Readonly<{ cases: number; definitionHash: Hash; goldenVectorsHash: Hash }>>;
