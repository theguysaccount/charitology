import {
  D1DataError,
  D1_GRANT_KEYS,
  copyD1Plain,
  isD1Key,
  validateD1Value,
  type D1Key,
  type D1ValueMap,
  type D1GrantKey,
} from "./donor-recovery-schemas";

export const D1_LIMITS = Object.freeze({
  individualBackupBytes: 8_000_000,
  grantBundleBytes: 24_008_192,
  jsonDepth: 32,
  fileReadTimeoutMs: 30_000,
  pendingFullReplacements: 1,
} as const);
export const D1_RAW_ARCHIVE_BYTES = 64_000_000;
export interface D1IndividualBackup<T> {
  format: "charitology-local-draft";
  version: 1;
  key: D1Key;
  exportedAt: string;
  value: T;
}
export interface D1RawRecovery {
  format: "charitology-raw-saved-copy";
  version: 1;
  key: D1Key;
  copy: "protected" | "observed";
  raw: string;
}
export type D1GrantValues = Pick<D1ValueMap, D1GrantKey>;
export type D1GrantMember = {
  [K in D1GrantKey]:
    | {
        readonly key: K;
        readonly presence: "absent";
        readonly persistence: "saved" | "unsaved-memory";
      }
    | {
        readonly key: K;
        readonly presence: "value";
        readonly persistence: "saved" | "unsaved-memory";
        readonly value: D1GrantValues[K];
      };
}[D1GrantKey];
export interface D1GrantBundle {
  format: "charitology-grant-workspace";
  version: 1;
  exportedAt: string;
  members: readonly D1GrantMember[];
}
type Obj = Record<string, unknown>;
function invalid(message: string, path = "$"): never {
  throw new D1DataError(message, path);
}
const encoder = new TextEncoder();
// Internal only: its arguments were constructed by the parser/admission above.
function freezeD1<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const name of Object.keys(value)) freezeD1((value as Obj)[name]);
    Object.freeze(value);
  }
  return value;
}

function boundText(text: string, maxBytes: number): void {
  if (text.length > maxBytes || encoder.encode(text).byteLength > maxBytes)
    throw new D1DataError(
      "Donor file exceeds its complete byte limit",
      "$",
      "input_limit",
    );
}
function inputText(raw: string | Uint8Array, maxBytes: number): string {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > D1_RAW_ARCHIVE_BYTES
  )
    invalid("Invalid file bound");
  if (typeof raw === "string") {
    boundText(raw, maxBytes);
    return raw;
  }
  if (
    !raw ||
    Object.getPrototypeOf(raw) !== Uint8Array.prototype ||
    !ArrayBuffer.isView(raw)
  )
    invalid("Expected text or plain Uint8Array");
  const length = raw.byteLength;
  if (length > maxBytes)
    throw new D1DataError(
      "Donor file exceeds its complete byte limit",
      "$",
      "input_limit",
    );
  // Own data bytes only: no caller iterator, species or slice method is invoked.
  if (Reflect.ownKeys(raw).length !== length)
    invalid("Decorated byte arrays are unsupported");
  const owned = new Uint8Array(length);
  for (let i = 0; i < length; i++) owned[i] = raw[i];
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
export function strictD1Json(
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
    if (depth > D1_LIMITS.jsonDepth)
      throw new D1DataError("Donor JSON exceeds depth 32", "$", "input_limit");
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
  return freezeD1(result);
}

function object(input: unknown, fields: readonly string[]): Obj {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("Expected a backup object");
  const r = input as Obj;
  const keys = Object.keys(r);
  if (
    keys.length !== fields.length ||
    fields.some((k) => !Object.hasOwn(r, k)) ||
    keys.some((k) => !fields.includes(k))
  )
    invalid("Unknown or missing backup field");
  return r;
}
function exportStamp(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid("Invalid exportedAt timestamp");
}
function key(value: unknown): asserts value is D1Key {
  if (!isD1Key(value)) invalid("Unknown donor tool key");
}

export function d1IndividualBackup<K extends D1Key>(
  target: K,
  input: D1ValueMap[K],
  exportedAt: string,
): string {
  key(target);
  exportStamp(exportedAt);
  const value = validateD1Value(target, input);
  const body = JSON.stringify(
    {
      format: "charitology-local-draft",
      version: 1,
      key: target,
      exportedAt,
      value,
    },
    null,
    2,
  );
  boundText(body, D1_LIMITS.individualBackupBytes);
  return body; // Legacy convention: no terminal newline.
}
export function parseD1IndividualBackup<K extends D1Key>(
  raw: string | Uint8Array,
  target: K,
): D1ValueMap[K] {
  key(target);
  const r = object(strictD1Json(raw, D1_LIMITS.individualBackupBytes), [
    "format",
    "version",
    "key",
    "exportedAt",
    "value",
  ]);
  if (
    r.format !== "charitology-local-draft" ||
    r.version !== 1 ||
    r.key !== target
  )
    invalid("Backup format, version or tool key does not match");
  exportStamp(r.exportedAt);
  const value = validateD1Value(target, r.value);
  // Imported compact files must still be exportable in the original pretty format.
  d1IndividualBackup(target, value, r.exportedAt);
  return value;
}

export function d1RawRecovery(
  target: D1Key,
  copy: "protected" | "observed",
  raw: string,
): string {
  key(target);
  if ((copy !== "protected" && copy !== "observed") || typeof raw !== "string")
    invalid("Invalid raw recovery copy");
  // JSON.stringify escapes lone surrogates; unlike a text Blob, this preserves code units.
  const body = JSON.stringify(
    {
      format: "charitology-raw-saved-copy",
      version: 1,
      key: target,
      copy,
      raw,
    },
    null,
    2,
  );
  boundText(body, D1_RAW_ARCHIVE_BYTES);
  return body;
}
export function parseD1RawRecovery(raw: string | Uint8Array): D1RawRecovery {
  const r = object(strictD1Json(raw, D1_RAW_ARCHIVE_BYTES), [
    "format",
    "version",
    "key",
    "copy",
    "raw",
  ]);
  if (
    r.format !== "charitology-raw-saved-copy" ||
    r.version !== 1 ||
    (r.copy !== "protected" && r.copy !== "observed") ||
    typeof r.raw !== "string"
  )
    invalid("Invalid raw recovery wrapper");
  key(r.key);
  return freezeD1(r as unknown as D1RawRecovery);
}

function grantReferences(members: readonly D1GrantMember[]): void {
  const draft = members.find((m) => m.key === "grant-draft");
  const library = members.find((m) => m.key === "grant-proposals");
  if (draft?.presence === "value" && draft.value && draft.value.id) {
    if (
      library?.presence !== "value" ||
      !library.value.some((p) => p.id === draft.value!.id)
    )
      invalid(
        "Draft ID has no matching proposal in this complete source",
        "$.members",
      );
  }
}
export function validateD1GrantBundle(input: unknown): D1GrantBundle {
  // Each member is separately admitted below so its named optional projection remains exact.
  const r = object(
    copyD1Plain(input, D1_LIMITS.grantBundleBytes, "grant-bundle"),
    ["format", "version", "exportedAt", "members"],
  );
  if (r.format !== "charitology-grant-workspace" || r.version !== 1)
    invalid("Unsupported grant workspace format/version");
  exportStamp(r.exportedAt);
  if (!Array.isArray(r.members) || r.members.length !== 3)
    invalid("Grant workspace requires exactly three members");
  const members: D1GrantMember[] = [];
  for (let i = 0; i < 3; i++) {
    const source = r.members[i];
    if (!source || typeof source !== "object" || Array.isArray(source))
      invalid("Invalid grant member");
    const preliminary = source as Obj;
    const m = object(
      source,
      preliminary.presence === "value"
        ? ["key", "presence", "persistence", "value"]
        : ["key", "presence", "persistence"],
    );
    if (
      m.key !== D1_GRANT_KEYS[i] ||
      (m.presence !== "value" && m.presence !== "absent") ||
      (m.persistence !== "saved" && m.persistence !== "unsaved-memory")
    )
      invalid("Invalid grant member identity, order or presence");
    const target = D1_GRANT_KEYS[i];
    if (m.presence === "value") {
      const value = validateD1Value(target, m.value);
      d1IndividualBackup(target, value, r.exportedAt);
      members.push({
        key: target,
        presence: "value",
        persistence: m.persistence,
        value,
      } as D1GrantMember);
    } else
      members.push({
        key: target,
        presence: "absent",
        persistence: m.persistence,
      });
  }
  grantReferences(members);
  const result = {
    format: "charitology-grant-workspace",
    version: 1,
    exportedAt: r.exportedAt,
    members,
  } as D1GrantBundle;
  boundText(JSON.stringify(result, null, 2), D1_LIMITS.grantBundleBytes);
  return freezeD1(result);
}
export function d1GrantBundle(bundle: D1GrantBundle): string {
  const value = validateD1GrantBundle(bundle);
  const body = JSON.stringify(value, null, 2);
  boundText(body, D1_LIMITS.grantBundleBytes);
  return body;
}
export function parseD1GrantBundle(raw: string | Uint8Array): D1GrantBundle {
  return validateD1GrantBundle(strictD1Json(raw, D1_LIMITS.grantBundleBytes));
}
export function assertD1GrantReferences(
  members: readonly D1GrantMember[],
): void {
  validateD1GrantBundle({
    format: "charitology-grant-workspace",
    version: 1,
    exportedAt: "2000-01-01T00:00:00.000Z",
    members,
  });
}
