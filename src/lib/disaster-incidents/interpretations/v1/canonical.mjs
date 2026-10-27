import { createHash } from "node:crypto";
import { types } from "node:util";
import { LIMITS } from "./limits.mjs";

export class DisasterError extends Error {
  constructor(code, message, path = "") {
    super(message);
    this.name = "DisasterError";
    this.code = code;
    this.path = path;
  }
}
export function fail(message, path = "", code = "invalid-data") {
  throw new DisasterError(code, message, path);
}
export function bound(n, max, path = "") {
  if (!Number.isSafeInteger(n) || n < 0 || n > max)
    fail("Limit exceeded", path, "input-limit");
  return n;
}
export function text(v, max = 1200, path = "") {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      v,
    )
  )
    fail("Invalid text", path);
  return v;
}
export function snapshotJSON(value, max = LIMITS.prepared) {
  const active = new Set();
  let nodes = 0,
    bytes = 0;
  function visit(v, depth) {
    bound(++nodes, LIMITS.nodes);
    bound(depth, LIMITS.depth);
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "string") {
      text(v, max);
      bytes += Buffer.byteLength(v);
      bound(bytes, max);
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v) || Object.is(v, -0))
        fail("Expected a safe integer");
      return v;
    }
    if (typeof v !== "object" || types.isProxy(v) || active.has(v))
      fail("Non-JSON, proxy or cyclic input");
    const array = Array.isArray(v),
      proto = Object.getPrototypeOf(v);
    if (
      array
        ? proto !== Array.prototype
        : proto !== Object.prototype && proto !== null
    )
      fail("Custom prototype refused");
    active.add(v);
    const ds = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(ds),
      out = array ? [] : {};
    if (keys.some((k) => typeof k !== "string")) fail("Symbol field refused");
    if (array) {
      bound(v.length, LIMITS.nodes);
      if (keys.length !== v.length + 1)
        fail("Sparse or decorated array refused");
      for (let i = 0; i < v.length; i++) {
        const d = ds[i];
        if (!d || !d.enumerable || !Object.hasOwn(d, "value"))
          fail("Array accessor or hole refused");
        out.push(visit(d.value, depth + 1));
      }
    } else
      for (const k of keys) {
        if (["__proto__", "constructor", "prototype"].includes(k))
          fail("Unsafe key refused");
        text(k, 512);
        bytes += Buffer.byteLength(k);
        bound(bytes, max);
        const d = ds[k];
        if (!d.enumerable || !Object.hasOwn(d, "value"))
          fail("Accessor or hidden field refused");
        out[k] = visit(d.value, depth + 1);
      }
    active.delete(v);
    return out;
  }
  return visit(value, 0);
}
function encode(v) {
  return Array.isArray(v)
    ? "[" + v.map(encode).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + encode(v[k]))
          .join(",") +
        "}"
      : JSON.stringify(v);
}
export function canonical(value, max = LIMITS.prepared) {
  const s = encode(snapshotJSON(value, max));
  bound(Buffer.byteLength(s), max);
  return s;
}
export function canonicalBytes(value, max = LIMITS.prepared) {
  const b = Buffer.from(canonical(value, max) + "\n");
  bound(b.length, max);
  return b;
}
export function freezeJSON(v) {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freezeJSON);
    Object.freeze(v);
  }
  return v;
}
export function detachedBytes(raw, max = LIMITS.prepared) {
  if (types.isProxy(raw)) fail("Proxy bytes refused");
  let b;
  if (typeof raw === "string") {
    text(raw, max);
    bound(Buffer.byteLength(raw), max);
    b = Buffer.from(raw);
  } else {
    if (
      !(raw instanceof Uint8Array) ||
      ![Uint8Array.prototype, Buffer.prototype].includes(
        Object.getPrototypeOf(raw),
      )
    )
      fail("Expected ordinary bytes");
    const ta = Object.getPrototypeOf(Uint8Array.prototype),
      ab = Reflect.apply(
        Object.getOwnPropertyDescriptor(ta, "buffer").get,
        raw,
        [],
      );
    const resize = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "resizable",
    )?.get;
    if (
      types.isSharedArrayBuffer(ab) ||
      (resize && Reflect.apply(resize, ab, []))
    )
      fail("Shared or resizable bytes refused");
    const n = Reflect.apply(
      Object.getOwnPropertyDescriptor(ta, "byteLength").get,
      raw,
      [],
    );
    bound(n, max);
    b = Buffer.alloc(n);
    Reflect.apply(Uint8Array.prototype.set, b, [raw]);
  }
  bound(b.length, max);
  return b;
}
export function sha256(raw) {
  return createHash("sha256").update(detachedBytes(raw)).digest("hex");
}
export function recordHash(kind, value) {
  if (
    ![
      "method",
      "source",
      "incident",
      "claim",
      "edition",
      "registry",
      "prepared",
    ].includes(kind)
  )
    fail("Unknown hash domain");
  const v = snapshotJSON(value);
  if (!v || Array.isArray(v) || typeof v !== "object")
    fail("Hash input must be object");
  delete v.hash;
  if (kind === "prepared") delete v.proposalHash;
  return sha256(
    Buffer.from("charitology-disaster/v1/" + kind + "\n" + canonical(v) + "\n"),
  );
}
export function filePin(path, raw) {
  text(path, 240);
  if (
    !path ||
    path.includes("\\") ||
    path.includes("%") ||
    !path
      .split("/")
      .every((s) => /^[a-zA-Z0-9_@\[\].-]+$/.test(s) && s !== "." && s !== "..")
  )
    fail("Unsafe file pin path");
  const b = detachedBytes(raw);
  return { path, bytes: b.length, sha256: sha256(b) };
}
export function parseJSON(raw, max = LIMITS.record) {
  const b = detachedBytes(raw, max);
  if (b[0] === 239 && b[1] === 187 && b[2] === 191) fail("BOM refused");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(b);
  } catch {
    fail("Malformed UTF-8");
  }
  let at = 0,
    nodes = 0;
  const ws = () => {
    while (/[\x20\x09\x0a\x0d]/.test(s[at] ?? "!")) at++;
  };
  function str() {
    const start = at++;
    while (at < s.length) {
      const c = s[at++];
      if (c === '"') {
        let v;
        try {
          v = JSON.parse(s.slice(start, at));
        } catch {
          fail("Malformed string");
        }
        return text(v, max);
      }
      if (c === "\\") at++;
    }
    fail("Unterminated string");
  }
  function value(depth) {
    bound(++nodes, LIMITS.nodes);
    bound(depth, LIMITS.depth);
    ws();
    if (s[at] === '"') return str();
    if (s[at] === "{" || s[at] === "[") {
      const obj = s[at++] === "{",
        v = obj ? {} : [],
        seen = new Set();
      ws();
      if (s[at] === (obj ? "}" : "]")) {
        at++;
        return v;
      }
      for (;;) {
        ws();
        let k;
        if (obj) {
          if (s[at] !== '"') fail("Expected key");
          k = str();
          if (
            seen.has(k) ||
            ["__proto__", "prototype", "constructor"].includes(k)
          )
            fail("Duplicate or unsafe key");
          seen.add(k);
          ws();
          if (s[at++] !== ":") fail("Expected colon");
        }
        const x = value(depth + 1);
        if (obj) v[k] = x;
        else v.push(x);
        ws();
        if (s[at] === (obj ? "}" : "]")) {
          at++;
          return v;
        }
        if (s[at++] !== ",") fail("Expected comma");
      }
    }
    const m =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        s.slice(at),
      );
    if (!m) fail("Malformed JSON");
    at += m[0].length;
    const v = JSON.parse(m[0]);
    if (typeof v === "number" && (!Number.isSafeInteger(v) || Object.is(v, -0)))
      fail("Invalid structural number");
    return v;
  }
  const v = value(0);
  ws();
  if (at !== s.length) fail("Trailing JSON");
  return v;
}
export function exact(v, keys, path = "") {
  if (
    !v ||
    Array.isArray(v) ||
    typeof v !== "object" ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    fail("Use exactly the documented fields", path);
  return v;
}
export function equal(a, b) {
  return canonical(a) === canonical(b);
}
