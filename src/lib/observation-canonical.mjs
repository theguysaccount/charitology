import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export class ObservationError extends Error {
  constructor(code, message, path = "") {
    super(message);
    this.name = "ObservationError";
    this.code = code;
    this.path = path;
  }
}
export function observationFail(code, message, path = "") {
  throw new ObservationError(code, message, path);
}
const bad = (message, path = "") =>
  observationFail("invalid_data", message, path);
export const OBSERVATION_LIMITS = Object.freeze({
  entities: 1000,
  scopes: 1000,
  measures: 100,
  sources: 200,
  observations: 10000,
  coverageRecords: 100,
  coverageCellsPerRecord: 2000,
  coverageCellsAllHistory: 20000,
  editions: 20,
  files: 14000,
  rawSourceBytes: 1048576,
  privateOriginalBytes: 4194304,
  structuredObjectBytes: 2097152,
  editionClosureBytes: 8388608,
  historyBytes: 20971520,
  editionExportBytes: 12582912,
  historyExportBytes: 33554432,
  preparedInputBytes: 33554432,
  jsonDepth: 32,
  sourceRefsPerField: 20,
  attachmentsPerSource: 4,
  requestDeadlineMs: 45000,
});
export function observationText(s, max = 4096, path = "", empty = true) {
  if (
    typeof s !== "string" ||
    s.length > max ||
    (!empty && !s.length) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      s,
    )
  )
    bad("Invalid text", path);
  return s;
}
function detachedBytes(raw, max) {
  if (
    !Number.isSafeInteger(max) ||
    max < 1 ||
    max > OBSERVATION_LIMITS.preparedInputBytes
  )
    bad("Invalid byte bound");
  if (utilTypes.isProxy(raw)) bad("Proxy input refused");
  let b;
  if (typeof raw === "string") {
    observationText(raw, max * 2);
    b = Buffer.from(raw, "utf8");
  } else if (
    raw instanceof Uint8Array &&
    (Object.getPrototypeOf(raw) === Uint8Array.prototype ||
      Object.getPrototypeOf(raw) === Buffer.prototype)
  ) {
    const getBuffer = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "buffer",
    ).get;
    const buffer = Reflect.apply(getBuffer, raw, []);
    const resizable = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "resizable",
    )?.get;
    if (
      utilTypes.isSharedArrayBuffer(buffer) ||
      (resizable && Reflect.apply(resizable, buffer, []))
    )
      bad("Shared or resizable byte storage refused");
    const getLength = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength",
    ).get;
    const length = Reflect.apply(getLength, raw, []);
    if (length > max)
      observationFail("input_limit", "Whole input byte limit exceeded");
    b = Buffer.alloc(length);
    Reflect.apply(Uint8Array.prototype.set, b, [raw]);
  } else bad("Expected exact string or byte array");
  if (b.length > max)
    observationFail("input_limit", "Whole input byte limit exceeded");
  return b;
}
export function observationBytes(raw, max = OBSERVATION_LIMITS.historyBytes) {
  const b = detachedBytes(raw, max);
  if (b.length > max)
    observationFail("input_limit", "Whole input byte limit exceeded");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    bad("Invalid UTF-8");
  }
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) bad("UTF-8 BOM refused");
  observationText(s, max * 2);
  return { bytes: b, text: s };
}
export function observationRawHash(raw) {
  const bytes = detachedBytes(raw, OBSERVATION_LIMITS.preparedInputBytes);
  return createHash("sha256").update(bytes).digest("hex");
}
export function observationClone(input, maxDepth = 32) {
  const active = new Set();
  let count = 0,
    textBytes = 0;
  function own(v, depth, path) {
    if (++count > 2000000)
      observationFail("input_limit", "Too many input values", path);
    if (depth > maxDepth) bad("JSON nesting limit exceeded", path);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "string") {
      observationText(v, OBSERVATION_LIMITS.historyBytes * 2, path);
      textBytes += Buffer.byteLength(v);
      if (textBytes > OBSERVATION_LIMITS.preparedInputBytes)
        observationFail(
          "input_limit",
          "Whole captured text byte limit exceeded",
          path,
        );
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) bad("Nonfinite value", path);
      return v;
    }
    if (typeof v !== "object") bad("Unsupported JSON value", path);
    if (utilTypes.isProxy(v)) bad("Proxy input refused", path);
    if (active.has(v)) bad("Cyclic input", path);
    active.add(v);
    const array = Array.isArray(v);
    const proto = Object.getPrototypeOf(v);
    if (
      array
        ? proto !== Array.prototype
        : proto !== Object.prototype && proto !== null
    )
      bad("Custom prototype", path);
    const desc = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(desc);
    if (keys.some((k) => typeof k !== "string")) bad("Symbol field", path);
    const out = array ? [] : {};
    if (array) {
      if (!Number.isSafeInteger(v.length) || v.length > 200000)
        bad("Array limit", path);
      if (keys.length !== v.length + 1) bad("Decorated or sparse array", path);
      for (let i = 0; i < v.length; i++) {
        const d = desc[String(i)];
        if (!d || !d.enumerable || !Object.hasOwn(d, "value"))
          bad("Array accessor or hole", path);
        out.push(own(d.value, depth + 1, `${path}/${i}`));
      }
    } else
      for (const key of keys) {
        const d = desc[key];
        if (!d.enumerable || !Object.hasOwn(d, "value"))
          bad("Accessor or hidden field", path);
        observationText(key, 1024, path);
        Object.defineProperty(out, key, {
          value: own(d.value, depth + 1, `${path}/${key}`),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    active.delete(v);
    return out;
  }
  return own(input, 0, "");
}
export function observationFreeze(v) {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) observationFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}
export function canonicalObservationJson(input) {
  const value = observationClone(input);
  function c(v) {
    if (Array.isArray(v)) return "[" + v.map(c).join(",") + "]";
    if (v && typeof v === "object")
      return (
        "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + c(v[k]))
          .join(",") +
        "}"
      );
    if (typeof v === "number" && !Number.isSafeInteger(v))
      bad("Structural numbers must be safe integers");
    return JSON.stringify(v);
  }
  const result = c(value);
  if (Buffer.byteLength(result) > OBSERVATION_LIMITS.preparedInputBytes)
    observationFail("input_limit", "Whole canonical JSON byte limit exceeded");
  return result;
}
export function observationObjectHash(input) {
  const owned = observationClone(input);
  if (!owned || typeof owned !== "object" || Array.isArray(owned))
    bad("Hash input must be an object");
  delete owned.hash;
  return createHash("sha256")
    .update(canonicalObservationJson(owned))
    .digest("hex");
}
export function observationPrettyJson(input) {
  const v = observationClone(input);
  canonicalObservationJson(v);
  return JSON.stringify(v, null, 2) + "\n";
}
export function observationJsonTokens(
  raw,
  maxBytes = OBSERVATION_LIMITS.rawSourceBytes,
) {
  const { text } = observationBytes(raw, maxBytes),
    tokens = new Map();
  let at = 0,
    nodes = 0;
  const ws = () => {
    while (/[\x20\x09\x0a\x0d]/.test(text[at] ?? "!")) at++;
  };
  const ptr = (p, k) =>
    p + "/" + String(k).replaceAll("~", "~0").replaceAll("/", "~1");
  function string() {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '"') {
        let v;
        try {
          v = JSON.parse(text.slice(start, at));
        } catch {
          bad("Malformed JSON string");
        }
        return observationText(v, maxBytes * 2);
      }
      if (c === "\\") {
        at++;
      } else if (c < " ") bad("Control in JSON string");
    }
    bad("Unterminated string");
  }
  function value(depth, path) {
    if (++nodes > 2000000 || depth > 32) bad("JSON nesting/value limit", path);
    ws();
    const c = text[at];
    if (c === '"') return string();
    if (c === "{") {
      at++;
      const out = {};
      const seen = new Set();
      ws();
      if (text[at] === "}") {
        at++;
        return out;
      }
      for (;;) {
        ws();
        if (text[at] !== '"') bad("Expected JSON key", path);
        const key = string();
        if (seen.has(key)) bad("Duplicate decoded JSON key", ptr(path, key));
        seen.add(key);
        ws();
        if (text[at++] !== ":") bad("Expected colon", path);
        Object.defineProperty(out, key, {
          value: value(depth + 1, ptr(path, key)),
          enumerable: true,
          writable: true,
          configurable: true,
        });
        ws();
        const sep = text[at++];
        if (sep === "}") return out;
        if (sep !== ",") bad("Expected object separator", path);
      }
    }
    if (c === "[") {
      at++;
      const out = [];
      ws();
      if (text[at] === "]") {
        at++;
        return out;
      }
      for (;;) {
        out.push(value(depth + 1, ptr(path, out.length)));
        ws();
        const sep = text[at++];
        if (sep === "]") return out;
        if (sep !== ",") bad("Expected array separator", path);
      }
    }
    for (const [word, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ])
      if (text.startsWith(word, at)) {
        at += word.length;
        return v;
      }
    const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      text.slice(at),
    );
    if (!m) bad("Malformed JSON value", path);
    const token = m[0];
    if (token.length > 128) bad("Numeric token limit", path);
    tokens.set(path, token);
    at += token.length;
    const v = Number(token);
    if (!Number.isFinite(v)) bad("Nonfinite JSON number", path);
    return v;
  }
  const parsed = value(0, "");
  ws();
  if (at !== text.length) bad("Trailing JSON input");
  return { value: observationFreeze(parsed), tokens };
}
export function strictObservationJson(
  raw,
  maxBytes = OBSERVATION_LIMITS.structuredObjectBytes,
) {
  return observationJsonTokens(raw, maxBytes).value;
}
