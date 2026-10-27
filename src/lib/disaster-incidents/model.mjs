import { LIMITS } from "./interpretations/v1/limits.mjs";
import {
  fail,
  snapshotJSON,
  canonicalBytes,
  equal,
  freezeJSON,
} from "./interpretations/v1/canonical.mjs";
import {
  pin,
  validateRecord,
  validateSourceNote,
  validateRegistry,
  validateManifest,
  recordPath,
  pinOf,
} from "./interpretations/v1/schema.mjs";
import {
  candidateState,
  completeState,
  resolve,
  packetFromState,
  coverageFromEdition,
  artifactsFromState,
  packetState,
  assertProductionState,
} from "./interpretations/v1/runtime.mjs";

// Precommitted immutable interpreter bytes only; no method or commit hash is
// hardcoded here. Source A/Git admission separately verifies the larger current
// semantic inventory. B can supply data, never executable registrations.
const INTERPRETATION_FILES = [
  {
    path: "src/lib/disaster-incidents/interpretations/v1/canonical.mjs",
    bytes: 8336,
    sha256: "3af242b5c968ece537163b7d5589c3c26536cebe8b82279e743ad6ca8173b3dc",
  },
  {
    path: "src/lib/disaster-incidents/interpretations/v1/limits.mjs",
    bytes: 1848,
    sha256: "f914fb10d0bf6328b4fa558366005e86567cb3603caac0716e6bf9c371735a7c",
  },
  {
    path: "src/lib/disaster-incidents/interpretations/v1/runtime.mjs",
    bytes: 25774,
    sha256: "422ac5c23c7d2ca92fe637a58182bd120b6b078aeb98ea9f2e5a7ebc718ea782",
  },
  {
    path: "src/lib/disaster-incidents/interpretations/v1/schema.mjs",
    bytes: 22913,
    sha256: "eca051807b8798653de7e15cc8bf71a58c0598f7778846c031da1801c4ffb606",
  },
];
const handles = new WeakMap(),
  packetContexts = new WeakMap();
function binding(method) {
  if (method.adapter !== "bounded-issuer-note-v1")
    fail("Unavailable historical interpreter");
  for (const required of INTERPRETATION_FILES)
    if (!method.sourceFiles.some((f) => equal(f, required)))
      fail(
        "Method omits or changes immutable interpreter bytes",
        required.path,
      );
}
function bindings(state) {
  for (const r of state.records.values()) if (r.kind === "method") binding(r);
}
function stateOf(handle) {
  const state = handles.get(handle);
  if (!state) fail("Expected admitted history capability");
  return state;
}
/** @param {ReadonlyMap<string, Uint8Array>} files @returns {import('./types').AdmittedHistory} */
export function admitHistory(files) {
  const state = completeState(files);
  bindings(state);
  const handle = Object.freeze(Object.create(null));
  handles.set(handle, state);
  return handle;
}
/** @param {import('./types').AdmittedHistory} handle */
export function assertProductionHistory(handle) {
  assertProductionState(stateOf(handle));
}
/** @param {ReadonlyMap<string, Uint8Array>} files @returns {import('./types').AdmittedHistory} */
export function admitProductionHistory(files) {
  const handle = admitHistory(files);
  assertProductionHistory(handle);
  return handle;
}
/** @returns {readonly import('./types').FilePin[]} */
export function interpretationFiles() {
  return freezeJSON(snapshotJSON(INTERPRETATION_FILES));
}
/** @param {import('./types').AdmittedHistory} handle @returns {Map<string, Uint8Array>} */
export function historyInventory(handle) {
  return new Map(
    [...stateOf(handle).files].map(([p, b]) => [p, new Uint8Array(b)]),
  );
}
/** @param {import('./types').AdmittedHistory} handle @returns {import('./types').Registry} */
export function historyRegistry(handle) {
  return snapshotJSON(stateOf(handle).registry, LIMITS.registry);
}
/** @param {import('./types').AdmittedHistory} handle @param {import('./types').Pin<'edition'>} edition @param {string} [incidentId] @returns {import('./types').Packet} */
export function editionPacket(handle, edition, incidentId) {
  const captured = snapshotJSON(edition);
  pin(captured, "edition");
  const state = stateOf(handle),
    packet = packetFromState(state, resolve(state, captured), incidentId);
  packetContexts.set(packet, { state, edition: captured, incidentId });
  return packet;
}
/** @param {import('./types').AdmittedHistory} handle @param {import('./types').Pin<'edition'>} edition @returns {import('./types').CoveragePacket} */
export function coveragePacket(handle, edition) {
  const captured = snapshotJSON(edition);
  pin(captured, "edition");
  const state = stateOf(handle);
  return coverageFromEdition(resolve(state, captured));
}
/** @param {import('./types').AdmittedHistory} handle @returns {Uint8Array} */
export function historyJSON(handle) {
  const state = stateOf(handle);
  return canonicalBytes(
    {
      format: "charitology-disaster-history",
      schemaVersion: 1,
      registry: state.registry,
      files: [...state.files]
        .filter(([p]) => p !== "registry.json" && !p.startsWith("exports/"))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([p, b]) => ({
          file: { path: p, bytes: b.length, sha256: stateFileHash(b) },
          utf8: b.toString("utf8"),
        })),
    },
    LIMITS.history,
  );
}
import { sha256 as stateFileHash } from "./interpretations/v1/canonical.mjs";
/** @param {import('./types').Packet} packet @returns {import('./types').Packet} */
export function admitPacket(packet) {
  const context = packetContexts.get(packet),
    admitted = packetState(packet);
  binding(admitted.packet.method);
  if (admitted.packet.scope.kind === "selected-incident" && !context)
    fail("Selected packet requires its private complete edition context");
  if (context) {
    const expected = packetFromState(
      context.state,
      resolve(context.state, context.edition),
      context.incidentId,
    );
    if (!equal(admitted.packet, expected))
      fail("Packet changed from its exact admitted edition closure");
  }
  return admitted.packet;
}
/** @param {import('./types').Packet} packet @returns {import('./types').Packet} */
export function assertProductionPacket(packet) {
  const context = packetContexts.get(packet);
  if (!context)
    fail("Production projection requires an admitted full-history packet");
  const admitted = admitPacket(packet);
  assertProductionState(context.state);
  return admitted;
}
/** @param {ReadonlyMap<string, Uint8Array>} files @param {import('./types').Pin<'edition'>} edition @returns {{packet:import('./types').Packet,manifest:import('./types').ArtifactManifest,files:Map<string,Uint8Array>}} */
export function prepareEditionArtifacts(files, edition) {
  const captured = snapshotJSON(edition);
  pin(captured, "edition");
  const state = candidateState(files);
  bindings(state);
  return artifactsFromState(state, resolve(state, captured));
}
export {
  validateRecord,
  validateSourceNote,
  validateRegistry,
  validateManifest,
  recordPath,
  pinOf,
};
