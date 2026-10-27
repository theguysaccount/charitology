import { assertProductionPacket } from "./model.mjs";
import { snapshotJSON } from "./interpretations/v1/canonical.mjs";
import {
  freshnessValue,
  deviceWarningValue,
} from "./interpretations/v1/runtime.mjs";
/** @param {import('./types').Incident} incident @param {string} asOf @returns {import('./types').FreshnessView} */
export function freshness(incident, asOf) {
  return freshnessValue(incident, asOf);
}
/** @param {readonly import('./types').Incident[]} incidents @param {string} asOf @param {unknown} deviceInstant @returns {import('./types').DeviceWarning} */
export function deviceWarning(incidents, asOf, deviceInstant) {
  return deviceWarningValue(incidents, asOf, deviceInstant);
}
/** Server/build projection: refuses fictional data, retains captured dates. */
export function projectPacket(packet) {
  const p = assertProductionPacket(packet);
  return {
    packet: p,
    editionId: p.edition.id,
    asOf: p.edition.asOf,
    capturedAt: p.edition.capturedAt,
    scope: snapshotJSON(p.scope),
    incidents: [...p.incidents]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((i) => ({
        incident: i,
        freshness: freshness(i, p.edition.asOf),
        claims: p.claims.filter((c) => c.incidentId === i.id),
      })),
    coverage: snapshotJSON(p.edition.coverage),
    warning:
      "Not live. These attributed source reports do not establish current worldwide needs or independent verification.",
  };
}
