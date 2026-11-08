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


/** Separate method vector. The historical14 and observationMethodPins above stay exact. */
export const OBSERVATION_PLAN_CLUSTER_METHOD = "observation-plan-cluster-append-v1";
export const OBSERVATION_PLAN_CLUSTER_BASELINE_PATHS = Object.freeze([...OBSERVATION_BASELINE_PATHS,
  "package-lock.json", "src/lib/humanitarian-funding/model.mjs",
  "src/lib/humanitarian-plan-cluster/definition.json", "src/lib/humanitarian-plan-cluster/model.mjs",
  "src/lib/humanitarian-plan-cluster/interpretation.mjs", "src/lib/humanitarian-plan-cluster/source.mjs",
  "src/lib/humanitarian-plan-cluster/acquire.mjs", "src/lib/humanitarian-plan-cluster/capture.mjs",
  "src/lib/humanitarian-plan-cluster/capture-io.mjs", "src/lib/humanitarian-plan-cluster/public.mjs",
  "scripts/acquire-humanitarian-plan-cluster.mjs", "scripts/append-humanitarian-plan-cluster.mjs",
].sort());
export function observationBaselinePaths(methodId = "observation-capture-v1") {
  if (methodId === "observation-capture-v1") return OBSERVATION_BASELINE_PATHS;
  if (methodId === OBSERVATION_PLAN_CLUSTER_METHOD) return OBSERVATION_PLAN_CLUSTER_BASELINE_PATHS;
  observationFail("invalid_baseline", "Unknown observation interpretation method");
}
import {types as planClusterNative} from "node:util";
function ownPlanClusterBaseline(input) {
  const object = (value, keys) => {
    if (!value || planClusterNative.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
      observationFail("invalid_baseline", "Plain owned baseline objects required");
    const ds = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(ds).length !== keys.length || keys.some(k => !ds[k]?.enumerable || !Object.hasOwn(ds[k], "value")))
      observationFail("invalid_baseline", "Closed data-only baseline objects required");
    return Object.fromEntries(keys.map(k => [k, ds[k].value]));
  };
  const value = object(input, ["commit","files"]), array = value.files;
  if (!Array.isArray(array) || planClusterNative.isProxy(array) || Object.getPrototypeOf(array) !== Array.prototype)
    observationFail("invalid_baseline", "Owned baseline array required");
  const ds = Object.getOwnPropertyDescriptors(array), length = ds.length?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > 100 || Reflect.ownKeys(ds).length !== length + 1)
    observationFail("invalid_baseline", "Dense bounded baseline array required");
  let total = 0;
  const native = Object.getPrototypeOf(Uint8Array.prototype), get = name => Object.getOwnPropertyDescriptor(native,name).get;
  const files = [];
  for (let i = 0; i < length; i++) {
    if (!ds[i]?.enumerable || !Object.hasOwn(ds[i], "value")) observationFail("invalid_baseline", "Sparse/accessor baseline refused");
    const file = object(ds[i].value, ["path","sha256","bytes"]), bytes = file.bytes;
    if (!bytes || planClusterNative.isProxy(bytes) || !planClusterNative.isUint8Array(bytes) ||
      ![Uint8Array.prototype,Buffer.prototype].includes(Object.getPrototypeOf(bytes)))
      observationFail("invalid_baseline", "Native baseline bytes required");
    const backing = get("buffer").call(bytes), n = get("byteLength").call(bytes), offset = get("byteOffset").call(bytes);
    total += n;
    if (planClusterNative.isSharedArrayBuffer(backing) || Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,"resizable")?.get.call(backing) || total > 5*1024*1024)
      observationFail("invalid_baseline", "Bounded immutable baseline bytes required");
    files.push({...file,bytes:new Uint8Array(new Uint8Array(backing,offset,n))});
  }
  return {...value,files};
}
export function observationMethodPinsFor(methodId, baseline) {
  if (methodId === "observation-capture-v1") return observationMethodPins(baseline);
  const paths = observationBaselinePaths(methodId);
  baseline = ownPlanClusterBaseline(baseline);
  if (!baseline || typeof baseline.commit !== "string" || !/^[a-f0-9]{40}$/.test(baseline.commit) || /^0+$/.test(baseline.commit) ||
    !Array.isArray(baseline.files) || baseline.files.length !== paths.length)
    observationFail("invalid_baseline", "Exact complete plan-cluster source baseline required");
  let total = 0;
  const pins = baseline.files.map((file, i) => {
    if (!file || file.path !== paths[i] || !(file.bytes instanceof Uint8Array))
      observationFail("invalid_baseline", "Plan-cluster baseline files must use exact method order");
    const sha256 = observationRawHash(file.bytes); total += file.bytes.byteLength;
    if (sha256 !== file.sha256 || total > 5 * 1024 * 1024)
      observationFail("invalid_baseline", "Plan-cluster baseline bytes/hash/whole limit mismatch");
    return {path:file.path,sha256,bytes:file.bytes.byteLength};
  });
  return Object.freeze({id:OBSERVATION_PLAN_CLUSTER_METHOD,
    definitionSha256:pins.find(p => p.path === "src/lib/humanitarian-plan-cluster/definition.json").sha256,
    adapterSha256:observationRawHash(canonicalObservationJson(pins))});
}
