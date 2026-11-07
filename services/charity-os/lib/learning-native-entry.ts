// Actual existing native codecs, bundled for server and deliberate browser file inspection.
// Do not replace these with parseImport/cleanDraft/parseWorkspace repair functions.
import { validateD1Value } from "../../../src/lib/client/donor-recovery-schemas";
import {
  parseRemainingRecordBackup,
  remainingRecordBackup,
} from "../../../src/lib/client/remaining-record-recovery-formats";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  learningBytes,
  learningFail,
  learningFreeze,
  learningOwned,
  learningRepresentable,
  parseLearningTransport,
} from "./learning-transport.mjs";

const KEY = "charitology.partner-workspace-v1.nonprofit-advisory" as const;
type Adapter = "theory-of-change-native-v1" | "nonprofit-learning-native-v1";
function complete(bytes: Uint8Array, adapter: Adapter): any {
  if (
    !["theory-of-change-native-v1", "nonprofit-learning-native-v1"].includes(
      adapter,
    )
  )
    learningFail("learning_adapter", "Choose a supported native source.");
  const limit = adapter === "theory-of-change-native-v1" ? 1000000 : 8000000;
  const owned = learningBytes(bytes, limit);
  const parsed: any = parseLearningTransport(owned, limit, {
    nativeStrings: true,
  });
  if (adapter === "theory-of-change-native-v1") {
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !==
        "draft,exportedAt,format,version" ||
      parsed.format !== "charitology-theory-of-change" ||
      parsed.version !== 1 ||
      typeof parsed.exportedAt !== "string" ||
      parsed.exportedAt.length > 100 ||
      !Number.isFinite(Date.parse(parsed.exportedAt))
    )
      learningFail(
        "learning_native",
        "Choose the native single-draft ToC export.",
      );
    validateD1Value("impact-drafts", {
      v: 1,
      current: parsed.draft?.id,
      drafts: [parsed.draft],
    });
  } else parseRemainingRecordBackup(owned, KEY);
  return parsed;
}
export function listLearningNativeSelections(
  bytes: Uint8Array,
  { adapter }: { adapter: Adapter },
) {
  const v = complete(bytes, adapter);
  return learningFreeze(
    adapter === "theory-of-change-native-v1"
      ? [{ selection: { kind: "whole-draft" }, title: v.draft.name }]
      : v.records.learning.map((row: any) => ({
          selection: { kind: "learning-row", recordId: row.id },
          title: row.values.title,
        })),
  );
}
export function validateLearningSelectedNative(
  adapter: Adapter,
  selection: any,
  selected: any,
) {
  if (adapter === "theory-of-change-native-v1") {
    if (
      !selection ||
      Object.keys(selection).join(",") !== "kind" ||
      selection.kind !== "whole-draft" ||
      selected?.kind !== "theory-of-change" ||
      Object.keys(selected).sort().join(",") !== "kind,value"
    )
      learningFail(
        "learning_selection",
        "Choose the complete native ToC draft.",
      );
    const b = new TextEncoder().encode(JSON.stringify(selected.value));
    complete(b, adapter);
    return selected.value.draft.id;
  }
  if (
    adapter !== "nonprofit-learning-native-v1" ||
    !selection ||
    Object.keys(selection).sort().join(",") !== "kind,recordId" ||
    selection.kind !== "learning-row" ||
    selected?.kind !== "nonprofit-learning" ||
    Object.keys(selected).sort().join(",") !== "kind,value"
  )
    learningFail(
      "learning_selection",
      "Choose one native nonprofit learning row.",
    );
  const v = selected.value;
  if (
    !v ||
    Object.keys(v).sort().join(",") !==
      "context,learning,program,updated,version" ||
    v.learning?.id !== selection.recordId
  )
    learningFail(
      "learning_selection",
      "The selected learning identity differs.",
    );
  const native = {
    version: v.version,
    program: v.program,
    updated: v.updated,
    context: v.context,
    records: {
      diagnostics: [],
      evidence: [],
      actions: [],
      learning: [v.learning],
      readiness: [],
    },
  };
  // Actual original complete codec; selected validation is not a substitute for full-file admission.
  parseRemainingRecordBackup(remainingRecordBackup(KEY, native), KEY);
  return v.learning.id;
}
function representable(v: any, path = "selected") {
  if (typeof v === "string" && !learningRepresentable(v))
    learningFail(
      "learning_native_text_unsupported",
      "Valid native source; selected text is unsupported by this hosted bridge. The original file was not changed. Keep the original file and its native recovery; to continue here, edit an explicit copy in the original tool and export it again.",
      path,
    );
  if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) representable(x, path + "." + k);
}
export function inspectLearningNativeValue(
  bytes: Uint8Array,
  { adapter, selection }: { adapter: Adapter; selection: any },
) {
  const owned = learningBytes(
      bytes,
      adapter === "theory-of-change-native-v1" ? 1000000 : 8000000,
    ),
    v = complete(owned, adapter);
  let selected: any;
  if (adapter === "theory-of-change-native-v1")
    selected = { kind: "theory-of-change", value: v };
  else {
    const row = v.records.learning.find(
      (r: any) => r.id === selection?.recordId,
    );
    if (!row)
      learningFail(
        "learning_selection",
        "Choose an existing native learning row.",
      );
    selected = {
      kind: "nonprofit-learning",
      value: {
        version: v.version,
        program: v.program,
        updated: v.updated,
        context: v.context,
        learning: row,
      },
    };
  }
  const nativeIdentity = validateLearningSelectedNative(
    adapter,
    selection,
    selected,
  );
  representable({ selection, selected, nativeIdentity });
  return learningOwned(
    {
      adapter,
      nativeIdentity,
      selection,
      selected,
      originalBytes: owned.length,
      originalSha256: bytesToHex(sha256(owned)),
    },
    { bytes: 1056768 },
  );
}
