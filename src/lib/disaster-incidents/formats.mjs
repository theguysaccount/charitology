import { admitPacket } from "./model.mjs";
import { canonicalBytes } from "./interpretations/v1/canonical.mjs";
import { packetCSVBytes } from "./interpretations/v1/runtime.mjs";
import { LIMITS } from "./interpretations/v1/limits.mjs";
/** @param {import('./types').Packet} packet @returns {Uint8Array} */
export function packetJSON(packet) {
  return canonicalBytes(admitPacket(packet), LIMITS.packet);
}
/** @param {import('./types').Packet} packet @returns {Uint8Array} */
export function packetCSV(packet) {
  return packetCSVBytes(admitPacket(packet));
}
export { historyJSON } from "./model.mjs";
