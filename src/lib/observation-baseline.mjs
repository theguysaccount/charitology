import {
  canonicalObservationJson,
  observationRawHash,
  observationFail,
} from "./observation-canonical.mjs";

export const OBSERVATION_ROOT = "src/data/observations";
export const OBSERVATION_BASELINE_PATHS = Object.freeze([
  "scripts/capture-observations.mjs",
  "scripts/check-observations-history.mjs",
  "scripts/prepare-observations.mjs",
  "src/data/countries.json",
  "src/data/observation-definitions.json",
  "src/data/observation-source-inputs.json",
  "src/lib/observation-baseline.mjs",
  "src/lib/observation-canonical.mjs",
  "src/lib/observation-capture-io.mjs",
  "src/lib/observation-capture.mjs",
  "src/lib/observation-git.mjs",
  "src/lib/observation-model.mjs",
  "src/lib/observation-sources.mjs",
  "src/lib/observation-types.ts",
]);

export function observationMethodPins(baseline) {
  if (
    !baseline ||
    !/^[0-9a-f]{40}$/.test(baseline.commit) ||
    /^0+$/.test(baseline.commit)
  ) {
    observationFail(
      "invalid_baseline",
      "An exact committed source baseline is required",
    );
  }
  if (
    !Array.isArray(baseline.files) ||
    baseline.files.length !== OBSERVATION_BASELINE_PATHS.length
  ) {
    observationFail(
      "invalid_baseline",
      "The complete declared source baseline is required",
    );
  }
  const pins = [];
  let total = 0;
  for (let i = 0; i < OBSERVATION_BASELINE_PATHS.length; i++) {
    const file = baseline.files[i];
    if (
      !file ||
      file.path !== OBSERVATION_BASELINE_PATHS[i] ||
      !(file.bytes instanceof Uint8Array)
    ) {
      observationFail(
        "invalid_baseline",
        "Source baseline files must be in exact declared order",
      );
    }
    const sha256 = observationRawHash(file.bytes);
    if (sha256 !== file.sha256)
      observationFail(
        "invalid_baseline",
        "Source baseline byte hash disagrees",
        file.path,
      );
    total += file.bytes.byteLength;
    if (total > 5 * 1024 * 1024)
      observationFail("input_limit", "Source baseline exceeds 5 MiB");
    pins.push({ path: file.path, sha256, bytes: file.bytes.byteLength });
  }
  return Object.freeze({
    id: "observation-capture-v1",
    definitionSha256: pins.find(
      (p) => p.path === "src/data/observation-definitions.json",
    ).sha256,
    adapterSha256: observationRawHash(canonicalObservationJson(pins)),
  });
}
