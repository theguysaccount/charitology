// Test-only historical manifest and its exact pinned object closure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { researchRawHash } from "../../src/lib/research-ledger-model.mjs";
export function initialSeedInput(current) {
  const raw = readFileSync(new URL("./initial-manifest.json", import.meta.url));
  assert.equal(researchRawHash(raw), "51aed3c3923cf3d61d01eefb90ad4eacc5afd673a232ac44db4ea8c72a7dd942");
  const manifest = JSON.parse(raw), edition = current.editions.find((value) => value.id === manifest.currentEditionId);
  assert(edition, "The immutable initial edition must remain available");
  const input = { manifest, editions: [edition] };
  for (const [group, key] of Object.entries({ records: "recordPins", versions: "versionPins", events: "eventPins", reviews: "reviewPins", actors: "actorPins", observations: "observationPins", sources: "sourcePins" })) {
    const selected = new Map(edition[key].map((pin) => [pin.id, pin.hash]));
    input[group] = current[group].filter((value) => selected.has(value.id));
    assert.equal(input[group].length, selected.size, "Initial edition closure disappeared");
    for (const value of input[group]) assert.equal(value.hash, selected.get(value.id));
  }
  return structuredClone(input);
}
