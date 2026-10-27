import {
  RRDataError,
  copyRemainingRecordPlain,
  requireRemainingRecordKey,
  validateRemainingRecordValue,
  rrObject,
  rrCanonicalInstant,
  partnerForRemainingKey,
  researchForRemainingKey,
  remainingRecordCapacity,
  remainingRecordFormFields,
  rrFail,
  type RRKey,
  type RRNative,
  type RRReadonly,
  type RRFormArchive,
  type RRRawArchive,
  type RRFormId,
} from "./remaining-record-recovery-schemas";
export type {
  RRFormArchive,
  RRRawArchive,
  RRRawForm,
} from "./remaining-record-recovery-schemas";
export const REMAINING_RECORD_LIMITS = Object.freeze({
  rawArchiveBytes: 128_000_000,
  formArchiveBytes: 1_000_000,
  jsonDepth: 32,
  fileReadTimeoutMs: 30_000,
  autosaveDelayMs: 250,
  pendingFullReplacements: 1,
} as const);
export { remainingRecordCapacity };
type Obj = Record<string, unknown>;
const encoder = new TextEncoder();
function invalid(message: string, path = "$"): never {
  return rrFail(message, path);
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
    throw new RRDataError(
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
    maxBytes > REMAINING_RECORD_LIMITS.rawArchiveBytes
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
    if (!ArrayBuffer.isView(raw))
      return invalid("Expected genuine Uint8Array bytes");
    backing = nativeBuffer.call(raw);
    length = nativeLength.call(raw);
    nativeArrayBufferLength.call(backing);
    if (nativeResizable?.call(backing))
      invalid("Resizable byte storage is unsupported");
  } catch {
    return invalid("Expected stable plain Uint8Array bytes");
  }
  if (
    Object.getPrototypeOf(raw) !== Uint8Array.prototype ||
    Object.getPrototypeOf(backing) !== ArrayBuffer.prototype
  )
    invalid("Expected plain Uint8Array bytes");
  if (length > maxBytes)
    throw new RRDataError(
      "File exceeds its complete byte limit",
      "$",
      "input_limit",
    );
  const owned = new Uint8Array(length);
  // Byte transport only. Native set ignores named decorations, constructor,
  // species and iterators; models/archive objects still require plain own data.
  try {
    Uint8Array.prototype.set.call(owned, raw);
  } catch {
    return invalid("Detached byte storage is unsupported");
  }
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
export function strictRemainingRecordJson(
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
    if (depth > REMAINING_RECORD_LIMITS.jsonDepth)
      throw new RRDataError(
        "Remaining-record JSON exceeds depth 32",
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

export function remainingRecordBackup<K extends RRKey>(
  key: K,
  native: RRNative<K> | RRReadonly<RRNative<K>>,
): string {
  const own = validateRemainingRecordValue(key, native),
    out = JSON.stringify(own, null, 2);
  boundText(out, remainingRecordCapacity(key).nativeBytes);
  return out;
}
export function parseRemainingRecordBackup<K extends RRKey>(
  raw: string | Uint8Array,
  key: K,
): RRReadonly<RRNative<K>> {
  requireRemainingRecordKey(key);
  const parsed = strictRemainingRecordJson(
    raw,
    remainingRecordCapacity(key).nativeBytes,
  );
  return validateRemainingRecordValue(key, parsed);
}
function rawArchive(input: unknown): RRRawArchive {
  const own = copyRemainingRecordPlain(
      input,
      REMAINING_RECORD_LIMITS.rawArchiveBytes,
    ),
    v = rrObject(own, ["format", "version", "key", "copy", "raw"]);
  if (v.format !== "charitology-remaining-record-raw-copy" || v.version !== 1)
    invalid("Wrong raw recovery format");
  requireRemainingRecordKey(v.key);
  if (
    !["protected", "observed"].includes(v.copy as string) ||
    typeof v.raw !== "string"
  )
    invalid("Invalid raw recovery copy");
  return own as RRRawArchive;
}
export function remainingRecordRawArchive(input: RRRawArchive): string {
  const out = JSON.stringify(rawArchive(input), null, 2);
  boundText(out, REMAINING_RECORD_LIMITS.rawArchiveBytes);
  return out;
}
export function parseRemainingRecordRawArchive(
  raw: string | Uint8Array,
): RRRawArchive {
  const own = rawArchive(
    strictRemainingRecordJson(raw, REMAINING_RECORD_LIMITS.rawArchiveBytes),
  );
  remainingRecordRawArchive(own);
  return own;
}
function formArchive(input: unknown): RRFormArchive {
  const own = copyRemainingRecordPlain(
      input,
      REMAINING_RECORD_LIMITS.formArchiveBytes,
    ),
    v = rrObject(own, ["format", "version", "key", "exportedAt", "forms"]);
  if (v.format !== "charitology-remaining-record-forms" || v.version !== 1)
    invalid("Wrong unfinished-form format");
  requireRemainingRecordKey(v.key);
  rrCanonicalInstant(v.exportedAt, "$.exportedAt");
  const partner = partnerForRemainingKey(v.key),
    research = researchForRemainingKey(v.key);
  const maxForms = partner
    ? 7
    : v.key === "charitology-depth-census-v1"
      ? 2
      : 1;
  if (!Array.isArray(v.forms) || v.forms.length > maxForms)
    invalid("Invalid unfinished-form list");
  const seen = new Set<string>();
  for (const [i, raw] of v.forms.entries()) {
    const p = `$.forms[${i}]`,
      f = rrObject(raw, ["form", "editingId", "values"], p);
    if (typeof f.form !== "string" || seen.has(f.form))
      invalid("Invalid or duplicate form identity", p);
    seen.add(f.form);
    const fields = remainingRecordFormFields(v.key, f.form as RRFormId),
      values = rrObject(f.values, Object.keys(fields), p + ".values");
    const noId =
      ["context", "currency", "manuscript"].includes(f.form) ||
      f.form.startsWith("country:");
    if (noId) {
      if (f.editingId !== null)
        invalid("This form has no editing ID", p + ".editingId");
    } else if (f.editingId !== null) {
      if (
        typeof f.editingId !== "string" ||
        !f.editingId ||
        f.editingId.length > (partner || research ? 100 : 99) ||
        (partner && !/^[A-Za-z0-9_-]{1,100}$/.test(f.editingId))
      )
        invalid("Invalid unfinished editing ID", p + ".editingId");
    }
    for (const [name, max] of Object.entries(fields))
      if (
        typeof values[name] !== "string" ||
        (values[name] as string).length > max
      )
        invalid(
          "Unfinished field exceeds its actual control limit",
          p + ".values." + name,
        );
  }
  return own as RRFormArchive;
}
export function remainingRecordFormArchive(input: RRFormArchive): string {
  const out = JSON.stringify(formArchive(input), null, 2);
  boundText(out, REMAINING_RECORD_LIMITS.formArchiveBytes);
  return out;
}
export function parseRemainingRecordFormArchive(
  raw: string | Uint8Array,
): RRFormArchive {
  const own = formArchive(
    strictRemainingRecordJson(raw, REMAINING_RECORD_LIMITS.formArchiveBytes),
  );
  remainingRecordFormArchive(own);
  return own;
}
