import {
  PRDataError,
  copyProgramRecordPlain,
  requireProgramRecordKey,
  validateProgramRecordValue,
  prObject,
  prCanonicalInstant,
  programForRecordKey,
  programRecordFormFields,
  prFail,
  type PRKey,
  type PRNative,
  type PRReadonly,
  type PROsEnvelope,
  type PRFormArchive,
  type PRRawArchive,
  type PRFormId,
} from "./program-record-recovery-schemas";
export type {
  PRFormArchive,
  PRRawArchive,
  PRRawForm,
} from "./program-record-recovery-schemas";
export const PROGRAM_RECORD_LIMITS = Object.freeze({
  nativeBackupBytes: 8_000_000,
  osCompactWorkspaceBytes: 4_500_000,
  rawArchiveBytes: 64_000_000,
  formArchiveBytes: 524_288,
  jsonDepth: 32,
  fileReadTimeoutMs: 30_000,
  pendingFullReplacements: 1,
} as const);
type Obj = Record<string, unknown>;
const encoder = new TextEncoder();
function invalid(message: string, path = "$"): never {
  return prFail(message, path);
}
function freezeOwned<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) freezeOwned((value as Obj)[k]);
    Object.freeze(value);
  }
  return value;
}
function boundText(text: string, maxBytes: number): void {
  if (text.length > maxBytes || encoder.encode(text).byteLength > maxBytes)
    throw new PRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit",
    );
}
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeBuffer = Object.getOwnPropertyDescriptor(
  typedPrototype,
  "buffer",
)!.get!;
const nativeLength = Object.getOwnPropertyDescriptor(
  typedPrototype,
  "byteLength",
)!.get!;
const nativeArrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;
const nativeResizable = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "resizable",
)?.get;
function inputText(raw: string | Uint8Array, maxBytes: number): string {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > PROGRAM_RECORD_LIMITS.rawArchiveBytes
  )
    invalid("Invalid file bound");
  if (typeof raw === "string") {
    boundText(raw, maxBytes);
    const owned = encoder.encode(raw);
    if (
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        owned,
      ) !== raw
    )
      invalid("Raw input string cannot be represented exactly as UTF-8");
    return raw;
  }
  let length: number, backing: ArrayBuffer;
  try {
    backing = nativeBuffer.call(raw);
    length = nativeLength.call(raw);
    nativeArrayBufferLength.call(backing);
    if (nativeResizable?.call(backing))
      invalid("Resizable byte storage is unsupported");
  } catch {
    return invalid("Expected stable plain Uint8Array bytes");
  }
  if (Object.getPrototypeOf(raw) !== Uint8Array.prototype)
    invalid("Expected plain Uint8Array bytes");
  if (length > maxBytes)
    throw new PRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit",
    );
  const owned = new Uint8Array(length);
  Uint8Array.prototype.set.call(owned, raw);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      owned,
    );
  } catch {
    return invalid("File is not valid UTF-8");
  }
}
/** Strict JSON parser for legacy saved values as well as controlled wrappers.
 * Decoded duplicate names, including escaped aliases, are refused at every level. */
export function strictProgramRecordJson(
  raw: string | Uint8Array,
  maxBytes: number,
): unknown {
  const source = inputText(raw, maxBytes);
  let at = 0;
  function ws() {
    while (
      at < source.length &&
      (source[at] === " " ||
        source[at] === "\n" ||
        source[at] === "\r" ||
        source[at] === "\t")
    )
      at++;
  }
  function str(): string {
    const start = at++;
    while (at < source.length) {
      const c = source.charCodeAt(at++);
      if (c === 34) {
        try {
          return JSON.parse(source.slice(start, at)) as string;
        } catch {
          return invalid("Invalid JSON string");
        }
      }
      if (c < 32) invalid("Unescaped JSON control character");
      if (c === 92) {
        if (at >= source.length) invalid("Unterminated JSON escape");
        const escaped = source[at++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(at, at + 4)))
            invalid("Invalid Unicode escape");
          at += 4;
        } else if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped))
          invalid("Invalid JSON escape");
      }
    }
    return invalid("Unterminated JSON string");
  }
  function value(depth: number): unknown {
    if (depth > PROGRAM_RECORD_LIMITS.jsonDepth)
      throw new PRDataError(
        "Program-record JSON exceeds depth 32",
        "$",
        "input_limit",
      );
    ws();
    const c = source[at];
    if (c === '"') return str();
    if (c === "{") {
      at++;
      ws();
      const out: Obj = {};
      const names = new Set<string>();
      if (source[at] === "}") {
        at++;
        return out;
      }
      for (;;) {
        ws();
        if (source[at] !== '"') invalid("Expected JSON object name");
        const name = str();
        if (names.has(name)) invalid("Duplicate JSON object name");
        names.add(name);
        ws();
        if (source[at++] !== ":") invalid("Expected JSON colon");
        Object.defineProperty(out, name, {
          value: value(depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
        ws();
        const end = source[at++];
        if (end === "}") return out;
        if (end !== ",") invalid("Expected JSON comma");
      }
    }
    if (c === "[") {
      at++;
      ws();
      const out: unknown[] = [];
      if (source[at] === "]") {
        at++;
        return out;
      }
      for (;;) {
        out.push(value(depth + 1));
        ws();
        const end = source[at++];
        if (end === "]") return out;
        if (end !== ",") invalid("Expected JSON comma");
      }
    }
    for (const [literal, decoded] of [
      ["null", null],
      ["true", true],
      ["false", false],
    ] as const) {
      if (source.startsWith(literal, at)) {
        at += literal.length;
        return decoded;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(at),
    );
    if (!number) return invalid("Invalid JSON value");
    at += number[0].length;
    const decoded = Number(number[0]);
    if (!Number.isFinite(decoded)) invalid("Nonfinite JSON number");
    return decoded;
  }
  const result = value(0);
  ws();
  if (at !== source.length) invalid("Trailing JSON content");
  return freezeOwned(result);
}

function nativeValue<K extends PRKey>(
  key: K,
  input: unknown,
): PRReadonly<PRNative<K>> {
  requireProgramRecordKey(key);
  const own = copyProgramRecordPlain(
    input,
    PROGRAM_RECORD_LIMITS.nativeBackupBytes,
  );
  if (programForRecordKey(key)) {
    return validateProgramRecordValue(key, own) as unknown as PRReadonly<
      PRNative<K>
    >;
  }
  const envelope = prObject(own, [
    "format",
    "version",
    "exportedAt",
    "workspace",
  ]);
  if (envelope.format !== "charitology.charity-os" || envelope.version !== 1)
    invalid("Choose a Charity OS version 1 native backup");
  prCanonicalInstant(envelope.exportedAt, "$.exportedAt");
  validateProgramRecordValue(key, envelope.workspace);
  return own as unknown as PRReadonly<PRNative<K>>;
}
export function programRecordBackup<K extends PRKey>(
  key: K,
  native: PRNative<K> | PRReadonly<PRNative<K>>,
): string {
  const owned = nativeValue(key, native);
  const result = JSON.stringify(owned, null, 2);
  boundText(result, PROGRAM_RECORD_LIMITS.nativeBackupBytes);
  return result;
}
export function parseProgramRecordBackup<K extends PRKey>(
  raw: string | Uint8Array,
  key: K,
): PRReadonly<PRNative<K>> {
  requireProgramRecordKey(key);
  const parsed = strictProgramRecordJson(
      raw,
      PROGRAM_RECORD_LIMITS.nativeBackupBytes,
    ),
    value = nativeValue(key, parsed);
  // Whole pretty native output must also fit; passing compact input is insufficient.
  programRecordBackup(key, value);
  return value;
}
function rawArchive(input: unknown): PRRawArchive {
  const owned = copyProgramRecordPlain(
      input,
      PROGRAM_RECORD_LIMITS.rawArchiveBytes,
    ),
    v = prObject(owned, ["format", "version", "key", "copy", "raw"]);
  if (v.format !== "charitology-program-record-raw-copy" || v.version !== 1)
    invalid("Wrong raw recovery format");
  requireProgramRecordKey(v.key);
  if (
    !["protected", "observed"].includes(v.copy as string) ||
    typeof v.raw !== "string"
  )
    invalid("Invalid raw recovery copy");
  return owned as PRRawArchive;
}
export function programRecordRawArchive(input: PRRawArchive): string {
  const owned = rawArchive(input),
    out = JSON.stringify(owned, null, 2);
  boundText(out, PROGRAM_RECORD_LIMITS.rawArchiveBytes);
  return out;
}
export function parseProgramRecordRawArchive(
  raw: string | Uint8Array,
): PRRawArchive {
  const own = rawArchive(
    strictProgramRecordJson(raw, PROGRAM_RECORD_LIMITS.rawArchiveBytes),
  );
  programRecordRawArchive(own);
  return own;
}
function formArchive(input: unknown): PRFormArchive {
  const own = copyProgramRecordPlain(
      input,
      PROGRAM_RECORD_LIMITS.formArchiveBytes,
    ),
    v = prObject(own, ["format", "version", "key", "exportedAt", "forms"]);
  if (v.format !== "charitology-program-record-forms" || v.version !== 1)
    invalid("Wrong unfinished-form format");
  requireProgramRecordKey(v.key);
  prCanonicalInstant(v.exportedAt, "$.exportedAt");
  if (
    !Array.isArray(v.forms) ||
    v.forms.length > (programForRecordKey(v.key) ? 5 : 2)
  )
    invalid("Invalid unfinished-form list");
  const seen = new Set<string>();
  let editors = 0;
  for (const [i, raw] of v.forms.entries()) {
    const p = `$.forms[${i}]`,
      f = prObject(raw, ["form", "editingId", "values"], p);
    if (typeof f.form !== "string" || seen.has(f.form))
      invalid("Invalid or duplicate form identity", p);
    seen.add(f.form);
    const fields = programRecordFormFields(v.key, f.form as PRFormId),
      values = prObject(f.values, Object.keys(fields), p + ".values");
    if (f.form === "context") {
      if (f.editingId !== null)
        invalid("Context cannot have a record ID", p + ".editingId");
    } else {
      if (
        f.editingId !== null &&
        (typeof f.editingId !== "string" ||
          !(
            programForRecordKey(v.key)
              ? /^[A-Za-z0-9_-]{1,100}$/
              : /^[A-Za-z0-9_-]{1,80}$/
          ).test(f.editingId))
      )
        invalid("Invalid unfinished editing ID", p + ".editingId");
      if (!programForRecordKey(v.key) && ++editors > 1)
        invalid("Only one local OS editor can be open");
    }
    for (const [name, max] of Object.entries(fields))
      if (
        typeof values[name] !== "string" ||
        (values[name] as string).length > max
      )
        invalid(
          "Unfinished raw field exceeds its actual control limit",
          p + ".values." + name,
        );
  }
  return own as PRFormArchive;
}
export function programRecordFormArchive(input: PRFormArchive): string {
  const owned = formArchive(input),
    out = JSON.stringify(owned, null, 2);
  boundText(out, PROGRAM_RECORD_LIMITS.formArchiveBytes);
  return out;
}
export function parseProgramRecordFormArchive(
  raw: string | Uint8Array,
): PRFormArchive {
  const own = formArchive(
    strictProgramRecordJson(raw, PROGRAM_RECORD_LIMITS.formArchiveBytes),
  );
  programRecordFormArchive(own);
  return own;
}
