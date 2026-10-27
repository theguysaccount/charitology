import { createHash } from "node:crypto";

export const LEDGER_LIMITS = Object.freeze({
  records: 1000,
  versions: 3000,
  events: 5000,
  reviews: 2000,
  actors: 500,
  observations: 500,
  sources: 250,
  editions: 10,
  inputBytes: 5242880,
  exportBytes: 8388608,
  sourceBytes: 131072,
  text: 32768,
  prose: 4000,
  refs: 20,
});
export class LedgerError extends Error {
  constructor(code, message, path = "") {
    super(message);
    this.name = "LedgerError";
    this.code = code;
    this.issues = Object.freeze([{ code, path, message }]);
  }
}
export function fail(code, message, path = "") {
  throw new LedgerError(code, message, path);
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
    Object.keys(v).some(
      (k) =>
        !keys.includes(k) ||
        ["__proto__", "constructor", "prototype"].includes(k),
    )
  )
    fail("shape", "Use the exact documented object fields.", path);
}
export function text(v, max, path = "", nullable = false, empty = false) {
  if (nullable && v === null) return v;
  if (
    typeof v !== "string" ||
    v.length > max ||
    (!empty && !v.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)
  )
    fail(
      "shape",
      `Use ${nullable ? "null or " : ""}bounded text (maximum ${max} characters).`,
      path,
    );
  return v;
}
export function id(v, path = "") {
  if (
    typeof v !== "string" ||
    !/^[a-z][a-z0-9-]{0,38}:[a-z0-9][a-z0-9-]{0,59}$/.test(v)
  )
    fail("shape", "Use a valid stable namespaced ID.", path);
  return v;
}
export function hash(v, path = "") {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    fail("hash", "Use a complete SHA-256 hash.", path);
  return v;
}
export function integer(v, min, max, path = "") {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail("shape", `Use an integer from ${min} to ${max}.`, path);
  return v;
}
export function choice(v, values, path = "") {
  if (!values.includes(v)) fail("shape", "Choose a documented value.", path);
  return v;
}
export function bool(v, path = "") {
  if (typeof v !== "boolean") fail("shape", "Use an explicit boolean.", path);
  return v;
}
export function list(v, max, path = "", min = 0) {
  if (!Array.isArray(v) || v.length > max || v.length < min)
    fail("limit", `Use ${min} to ${max} entries.`, path);
  return v;
}
export function unique(values, path = "") {
  if (new Set(values).size !== values.length)
    fail("reference", "Duplicate entries are not allowed.", path);
}
export function day(v, path = "") {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T00:00:00.000Z")) ||
    new Date(v + "T00:00:00.000Z").toISOString().slice(0, 10) !== v
  )
    fail("shape", "Use a real calendar date.", path);
  return v;
}
export function instant(v, path = "") {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail("shape", "Use a canonical UTC instant.", path);
  return v;
}
export function publicUrl(v, path = "") {
  text(v, 1200, path);
  try {
    if (/[\u0000-\u0020\u007f]/.test(v)) throw Error();
    const u = new URL(v);
    if (
      !v.startsWith("https://") ||
      u.protocol !== "https:" ||
      !u.hostname ||
      u.username ||
      u.password
    )
      throw Error();
  } catch {
    fail(
      "source",
      "Use an absolute HTTPS URL without credentials or controls.",
      path,
    );
  }
  return v;
}
export function refs(v, path = "", min = 0) {
  list(v, 20, path, min);
  for (const r of v) {
    exact(r, ["url", "title", "locator"], path);
    publicUrl(r.url, path);
    text(r.title, 500, path);
    text(r.locator, 500, path, true);
  }
  return v;
}
export function frozen(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
export const clone = (v) => structuredClone(v);
export function canonicalResearchJson(value) {
  const seen = new Set();
  const walk = (v, depth) => {
    if (depth > 40) fail("limit", "JSON nesting exceeds the ledger bound.");
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "string") {
      for (let i = 0; i < v.length; i++) {
        const n = v.charCodeAt(i);
        if (n >= 0xd800 && n <= 0xdbff) {
          const next = v.charCodeAt(++i);
          if (!(next >= 0xdc00 && next <= 0xdfff))
            fail("shape", "Invalid Unicode text.");
        } else if (n >= 0xdc00 && n <= 0xdfff)
          fail("shape", "Invalid Unicode text.");
      }
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) fail("shape", "Numbers must be finite.");
      return v;
    }
    if (!v || typeof v !== "object" || seen.has(v))
      fail("shape", "Use acyclic plain JSON.");
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (
        Object.keys(v).length !== v.length ||
        Object.keys(v).some((k, i) => k !== String(i))
      )
        fail("shape", "Use dense JSON arrays without extra fields.");
      out = v.map((x) => walk(x, depth + 1));
    } else {
      if (!plain(v)) fail("shape", "Use plain JSON objects.");
      out = Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => {
            if (["__proto__", "constructor", "prototype"].includes(k))
              fail("shape", "Reserved object key.");
            return [k, walk(v[k], depth + 1)];
          }),
      );
    }
    seen.delete(v);
    return out;
  };
  return JSON.stringify(walk(value, 0));
}
export const researchRawHash = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
export const researchSubjectHash = (subject) =>
  researchRawHash(canonicalResearchJson(subject));
export const researchObjectHash = (object) => {
  if (!plain(object)) fail("shape", "Hash an object.");
  const { hash, ...rest } = object;
  return researchSubjectHash(rest);
};
export function checkHash(v, path = "") {
  hash(v.hash, path);
  if (v.hash !== researchObjectHash(v))
    fail("hash", "Object checksum does not match its exact content.", path);
}
export function bytes(v) {
  return Buffer.byteLength(v, "utf8");
}
