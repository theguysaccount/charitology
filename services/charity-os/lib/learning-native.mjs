/** Native source receipts. No storage, clocks, identity generation or external reads. */
import manifest from "./learning-native-manifest.json" with { type: "json" };
import {
  inspectLearningNativeValue,
  listLearningNativeSelections as nativeSelections,
  validateLearningSelectedNative,
} from "./learning-native-admission.mjs";
import {
  LearningError,
  learningOwned,
  learningObject,
  learningEnum,
  learningNumber,
  learningText,
  learningId,
  learningInstant,
  learningHashValue,
  learningHash,
  learningCheckedHash,
  learningSeal,
  learningFreeze,
  learningFail,
  LEARNING_LIMITS,
} from "./learning-json.mjs";
function nativeCall(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof LearningError) throw e;
    if (e?.name === "LearningError" && /^learning_[a-z_]+$/.test(e.code))
      throw new LearningError(e.code, e.message, e.issues?.[0]?.field ?? "");
    throw new LearningError(
      "learning_native",
      "Choose a complete supported native source within its original schema.",
    );
  }
}
export function listLearningNativeSelections(bytes, choice) {
  return nativeCall(() => nativeSelections(bytes, choice));
}
export const LEARNING_NATIVE_REGISTRY = learningFreeze({
  format: "charitology-learning-native-registry",
  version: 1,
  mappingVersion: "learning-mapping-v1",
  retainedStringPolicy: "postgres-jsonb-selected-scalars-v1",
  admission: manifest,
  adapters: [
    {
      id: "theory-of-change-native-v1",
      nativeFormat: "charitology-theory-of-change",
      nativeVersion: 1,
      selection: "whole-draft",
    },
    {
      id: "nonprofit-learning-native-v1",
      nativeFormat: "nonprofit-advisory",
      nativeVersion: 1,
      key: "charitology.partner-workspace-v1.nonprofit-advisory",
      composedAdapter: "partner-nonprofit-advisory-v1",
      selection: "context-and-one-learning-row",
    },
  ],
});
// A v1 interpretation is immutable. Regenerating a different bundle/manifest
// must not silently redefine v1 or invalidate its retained receipts/backups.
// Add explicitly versioned historical admission before changing this pin.
export const LEARNING_NATIVE_REGISTRY_SHA256 =
  "9e12453e6178202ea7e47ce7610311c7a5a7d3be09456544902ac524ef88f906";
if (
  learningHash("registry", LEARNING_NATIVE_REGISTRY) !==
  LEARNING_NATIVE_REGISTRY_SHA256
)
  throw new Error(
    "Learning v1 native interpretation changed. Add an explicit new adapter version and historical admission before regenerating this registry.",
  );
const inspections = new WeakSet();
export function inspectLearningNative(bytes, choice) {
  const result = nativeCall(() => inspectLearningNativeValue(bytes, choice));
  inspections.add(result);
  return result;
}
export function validateLearningSourcePin(v) {
  const p = learningOwned(v, { bytes: 2048 });
  learningObject(p, ["originOrgId", "bindingId", "version", "sha256"]);
  learningId(p.originOrgId);
  learningId(p.bindingId);
  learningNumber(p.version, 1, 8);
  learningHashValue(p.sha256);
  return p;
}
export function sourcePin(source) {
  const s = validateLearningSourceCapture(source);
  return learningFreeze({
    originOrgId: s.originOrgId,
    bindingId: s.bindingId,
    version: s.sourceVersion,
    sha256: s.sha256,
  });
}
export function validateLearningSourceCapture(value) {
  const s = learningOwned(value, { bytes: LEARNING_LIMITS.sourceBytes });
  learningObject(s, [
    "format",
    "version",
    "adapter",
    "registrySha256",
    "originOrgId",
    "bindingId",
    "sourceVersion",
    "previousSource",
    "receivedAt",
    "originalBytes",
    "originalSha256",
    "nativeIdentity",
    "selection",
    "selected",
    "sha256",
  ]);
  learningEnum(s.format, ["charitology-learning-source"]);
  learningEnum(s.version, [1]);
  learningEnum(s.adapter, [
    "theory-of-change-native-v1",
    "nonprofit-learning-native-v1",
  ]);
  if (s.registrySha256 !== LEARNING_NATIVE_REGISTRY_SHA256)
    learningFail(
      "learning_registry",
      "This exact native interpretation is unsupported.",
    );
  learningId(s.originOrgId);
  learningId(s.bindingId);
  learningNumber(s.sourceVersion, 1, 8);
  learningInstant(s.receivedAt);
  learningNumber(
    s.originalBytes,
    1,
    s.adapter === "theory-of-change-native-v1" ? 1000000 : 8000000,
  );
  learningHashValue(s.originalSha256);
  learningText(s.nativeIdentity, 100, "nativeIdentity", { nonblank: true });
  if (s.sourceVersion === 1) {
    if (s.previousSource !== null)
      learningFail(
        "learning_source_chain",
        "A first local capture has no local parent.",
      );
  } else {
    const p = validateLearningSourcePin(s.previousSource);
    if (
      p.originOrgId !== s.originOrgId ||
      p.bindingId !== s.bindingId ||
      p.version !== s.sourceVersion - 1
    )
      learningFail(
        "learning_source_chain",
        "Capture versions must form the exact local chain.",
      );
  }
  if (
    new TextEncoder().encode(JSON.stringify(s.selected)).length >
    LEARNING_LIMITS.selectedBytes
  )
    learningFail(
      "learning_limit",
      "The complete retained source exceeds 1 MiB.",
    );
  const identity = nativeCall(() =>
    validateLearningSelectedNative(s.adapter, s.selection, s.selected),
  );
  if (identity !== s.nativeIdentity)
    learningFail("learning_source", "Native source identity differs.");
  learningCheckedHash("source", s);
  return s;
}
export function makeLearningSourceCapture(inspection, settings) {
  if (!inspections.has(inspection))
    learningFail(
      "learning_native",
      "Capture requires the actual owned native inspection.",
    );
  const c = learningOwned(settings, { bytes: 4096 });
  learningObject(c, [
    "originOrgId",
    "bindingId",
    "sourceVersion",
    "previousSource",
    "receivedAt",
  ]);
  const value = learningSeal("source", {
    format: "charitology-learning-source",
    version: 1,
    registrySha256: LEARNING_NATIVE_REGISTRY_SHA256,
    ...inspection,
    ...c,
  });
  return validateLearningSourceCapture(value);
}
