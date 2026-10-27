import { createHash } from "node:crypto";

export const PUBLICATION_LIMITS = Object.freeze({
  editions: 100,
  sources: 1000,
  pins: 1000,
  sourceBytes: 2097152,
  manifestBytes: 2097152,
  artifactBytes: 2097152,
  totalBytes: 20971520,
  depth: 32,
});
export class PublicationError extends Error {
  constructor(code, message, path = "") {
    super(message);
    this.name = "PublicationError";
    this.code = code;
    this.path = path;
  }
}
export function fail(code, message, path = "") {
  throw new PublicationError(code, message, path);
}
export const plain = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
export function exact(v, keys, path = "") {
  if (
    !plain(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    fail("shape", "Use the exact documented fields.", path);
  for (const d of Object.values(Object.getOwnPropertyDescriptors(v)))
    if (!Object.hasOwn(d, "value"))
      fail("shape", "Accessors are not plain JSON.", path);
  return v;
}
export function str(v, max = 500, empty = false) {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()))
    fail("shape", "Use bounded text.");
  return v;
}
export function id(v) {
  if (typeof v !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(v))
    fail("identity", "Use a stable publication ID.");
  return v;
}
export function hash(v) {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    fail("hash", "Use a complete lowercase SHA-256.");
  return v;
}
export function commit(v) {
  if (typeof v !== "string" || !/^[a-f0-9]{40}$/.test(v))
    fail("source", "Use an exact committed Git object.");
  return v;
}
export function integer(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail("shape", "Use a bounded whole number.");
  return v;
}
export function choice(v, allowed) {
  if (!allowed.includes(v)) fail("shape", "Unsupported versioned value.");
  return v;
}
export function array(v, max = 1000, min = 0) {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    fail("limit", "Array exceeds the documented bound.");
  return v;
}
export function unique(v) {
  if (new Set(v).size !== v.length) fail("identity", "Duplicate identity.");
}
export function day(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T00:00:00.000Z")) ||
    new Date(v + "T00:00:00.000Z").toISOString().slice(0, 10) !== v
  )
    fail("date", "Use a real calendar date.");
  return v;
}
export function instant(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v ||
    v < "1900-" ||
    v >= "2201-"
  )
    fail("date", "Use a real canonical UTC instant from 1900 through 2200.");
  return v;
}
export function path(v) {
  str(v, 500);
  if (
    v.startsWith("/") ||
    v.includes("\\") ||
    v.split("/").some((p) => !p || p === "." || p === "..") ||
    !/^[a-zA-Z0-9_./-]+$/.test(v)
  )
    fail("source", "Use an allowlisted regular repository path.");
  return v;
}
export function url(v, internal = false) {
  str(v, 1200);
  if (/[\\\u0000-\u0020\u007f]/.test(v)) fail("source", "Invalid link.");
  if (internal && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\"))
    return v;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname)
      throw Error();
  } catch {
    fail("source", "Use HTTPS without credentials.");
  }
  return v;
}
export function freeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function canonicalPublicationJson(value) {
  const seen = new Set();
  const walk = (v, depth) => {
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "string") return v; // JSON escaped surrogate tokens are retained losslessly.
    if (typeof v === "number") {
      if (!Number.isFinite(v)) fail("shape", "Numbers must be finite.");
      return v;
    }
    if (!v || typeof v !== "object" || seen.has(v))
      fail("shape", "Use acyclic plain JSON.");
    if (depth > PUBLICATION_LIMITS.depth)
      fail("limit", "JSON container depth exceeds 32.");
    if (
      Reflect.ownKeys(v).some(
        (k) =>
          typeof k !== "string" ||
          (!(Array.isArray(v) && k === "length") &&
            !Object.getOwnPropertyDescriptor(v, k).enumerable),
      )
    )
      fail("shape", "Use JSON properties without symbols or hidden fields.");
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype)
        fail("shape", "Use ordinary JSON arrays without subclass hooks.");
      if (
        Object.keys(v).length !== v.length ||
        Object.keys(v).some((k, i) => k !== String(i))
      )
        fail("shape", "Use dense arrays without extra properties.");
      for (const d of Object.values(Object.getOwnPropertyDescriptors(v)))
        if (!Object.hasOwn(d, "value"))
          fail("shape", "Accessors are not plain JSON.");
      out = [];
      for (let i = 0; i < v.length; i++)
        out.push(
          walk(Object.getOwnPropertyDescriptor(v, String(i)).value, depth + 1),
        );
    } else {
      if (!plain(v)) fail("shape", "Use plain JSON objects.");
      out = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => {
            if (["__proto__", "prototype", "constructor"].includes(k))
              fail("shape", "Reserved JSON key.");
            const d = Object.getOwnPropertyDescriptor(v, k);
            if (!Object.hasOwn(d, "value"))
              fail("shape", "Accessors are not plain JSON.");
            return [k, walk(d.value, depth + 1)];
          }),
      );
    }
    seen.delete(v);
    return out;
  };
  return JSON.stringify(walk(value, 1));
}
export const rawPublicationHash = (v) =>
  createHash("sha256").update(v).digest("hex");
export const hashPublicationValue = (v) =>
  rawPublicationHash(canonicalPublicationJson(v));
export function objectHash(v) {
  const { hash: _, ...rest } = v;
  return hashPublicationValue(rest);
}
export function checkHash(v) {
  hash(v.hash);
  if (objectHash(v) !== v.hash) fail("hash", "Exact object checksum differs.");
}
export const pretty = (v) => JSON.stringify(v, null, 2) + "\n";
export function boundedPretty(v, max) {
  const text = pretty(v);
  if (Buffer.byteLength(text) > max)
    fail("limit", "Complete pretty JSON exceeds its byte bound.");
  return text;
}
export function validUnicode(v) {
  for (let i = 0; i < v.length; i++) {
    const a = v.charCodeAt(i);
    if (a >= 0xd800 && a <= 0xdbff) {
      const b = v.charCodeAt(++i);
      if (!(b >= 0xdc00 && b <= 0xdfff)) return false;
    } else if (a >= 0xdc00 && a <= 0xdfff) return false;
  }
  return true;
}
export function strictPublicationJson(
  input,
  maxBytes = PUBLICATION_LIMITS.manifestBytes,
) {
  let raw;
  if (typeof input === "string") {
    if (!validUnicode(input))
      fail("utf8", "Raw text is not representable as UTF-8.");
    if (Buffer.byteLength(input) > maxBytes)
      fail("limit", "Input exceeds its byte bound.");
    raw = input;
  } else if (input instanceof Uint8Array) {
    const n = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength",
    ).get.call(input);
    if (n > maxBytes) fail("limit", "Input exceeds its byte bound.");
    const copy = new Uint8Array(n);
    Uint8Array.prototype.set.call(copy, input);
    try {
      raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        copy,
      );
    } catch {
      fail("utf8", "Input is not valid UTF-8.");
    }
  } else fail("shape", "Use raw JSON text or bytes.");
  let at = 0;
  const ws = () => {
    while (at < raw.length && /[\x20\t\r\n]/.test(raw[at])) at++;
  };
  const string = () => {
    const start = at++;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === '"') {
        try {
          return JSON.parse(raw.slice(start, at));
        } catch {
          fail("json", "Invalid JSON string.");
        }
      }
      if (c === "\\") at++;
    }
    fail("json", "Unclosed JSON string.");
  };
  const parse = (depth) => {
    ws();
    const c = raw[at];
    if (c === "{" || c === "[") {
      if (depth > 32) fail("limit", "JSON container depth exceeds 32.");
      const obj = c === "{";
      at++;
      ws();
      if (raw[at] === (obj ? "}" : "]")) {
        at++;
        return;
      }
      const keys = new Set();
      while (true) {
        if (obj) {
          if (raw[at] !== '"') fail("json", "Invalid object key.");
          const k = string();
          if (keys.has(k)) fail("json", "Duplicate decoded JSON key.");
          keys.add(k);
          ws();
          if (raw[at++] !== ":") fail("json", "Missing colon.");
        }
        parse(depth + 1);
        ws();
        const end = raw[at++];
        if (end === (obj ? "}" : "]")) return;
        if (end !== ",") fail("json", "Invalid JSON separator.");
        ws();
      }
    } else if (c === '"') string();
    else {
      const m =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          raw.slice(at),
        );
      if (!m) fail("json", "Invalid JSON value.");
      at += m[0].length;
    }
  };
  parse(1);
  ws();
  if (at !== raw.length) fail("json", "Trailing JSON input.");
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    fail("json", "Invalid JSON.");
  }
  canonicalPublicationJson(v);
  return v;
}
