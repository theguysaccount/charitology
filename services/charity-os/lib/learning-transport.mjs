/** Closed JSON transport shared by actual browser/native and server learning admission. */
export class LearningError extends Error {
  constructor(code, message, field = "", status = 422) {
    super(message);
    this.name = "LearningError";
    this.status = status;
    this.code = code;
    if (field) this.issues = [{ field, message }];
  }
}
export const learningFail = (
  code,
  message = "Use the documented learning fields.",
  field = "",
  status = 422,
) => {
  throw new LearningError(code, message, field, status);
};
const reserved = new Set(["__proto__", "prototype", "constructor"]);
export function learningRepresentable(s) {
  if (s.includes("\0")) return false;
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = s.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
export function learningCanonical(
  value,
  { nativeStrings = false, maxBytes = 64 * 1024 * 1024 } = {},
) {
  const seen = new Set();
  let nodes = 0;
  const walk = (v, depth) => {
    // Every canonical JSON node consumes at least one UTF-8 byte. The complete
    // byte ceiling bounds retained graphs; the native parser separately has its 200k-node cap.
    if (++nodes > maxBytes || depth > 32)
      learningFail(
        "learning_limit",
        "Learning JSON exceeds its depth or work bound.",
      );
    if (v === null || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "string") {
      if (!nativeStrings && !learningRepresentable(v))
        learningFail(
          "learning_text_unsupported",
          "This text is unsupported by the hosted bridge.",
        );
      return JSON.stringify(v);
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        learningFail("learning_json", "Use finite JSON numbers.");
      return JSON.stringify(v);
    }
    if (
      !v ||
      typeof v !== "object" ||
      seen.has(v) ||
      Object.getOwnPropertySymbols(v).length
    )
      learningFail("learning_json", "Use bounded acyclic plain JSON.");
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      if (
        Object.getPrototypeOf(v) !== Array.prototype ||
        Object.getOwnPropertyNames(v).length !== v.length + 1 ||
        Object.keys(v).length !== v.length
      )
        learningFail(
          "learning_json",
          "Sparse or decorated arrays are unsupported.",
        );
      const cells = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !Object.hasOwn(d, "value"))
          learningFail("learning_json", "Accessors are unsupported.");
        cells.push(walk(d.value, depth + 1));
      }
      out = "[" + cells.join(",") + "]";
    } else {
      if (
        ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
        Object.getOwnPropertyNames(v).length !== Object.keys(v).length
      )
        learningFail("learning_json", "Use plain enumerable objects.");
      out =
        "{" +
        Object.keys(v)
          .sort()
          .map((k) => {
            if (
              reserved.has(k) ||
              (!nativeStrings && !learningRepresentable(k))
            )
              learningFail("learning_key", "Unsupported object key.");
            const d = Object.getOwnPropertyDescriptor(v, k);
            if (!d || !Object.hasOwn(d, "value"))
              learningFail("learning_json", "Accessors are unsupported.");
            return JSON.stringify(k) + ":" + walk(d.value, depth + 1);
          })
          .join(",") +
        "}";
    }
    seen.delete(v);
    return out;
  };
  const result = walk(value, 1);
  if (new TextEncoder().encode(result).length > maxBytes)
    learningFail(
      "learning_limit",
      "Complete learning JSON exceeds its byte bound.",
    );
  return result;
}
export function learningFreeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) learningFreeze(x);
    Object.freeze(v);
  }
  return v;
}
export function learningOwned(
  value,
  { bytes = 64 * 1024 * 1024, nativeStrings = false } = {},
) {
  return learningFreeze(
    JSON.parse(learningCanonical(value, { nativeStrings, maxBytes: bytes })),
  );
}
export function learningBytes(raw, maxBytes) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 64 * 1024 * 1024
  )
    learningFail("learning_limit", "Invalid learning byte limit.");
  if (
    !(raw instanceof Uint8Array) ||
    (Object.getPrototypeOf(raw) !== Uint8Array.prototype &&
      !(typeof Buffer !== "undefined" && Buffer.isBuffer(raw)))
  )
    learningFail("learning_bytes", "Choose actual UTF-8 bytes.");
  let n;
  try {
    n = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength",
    ).get.call(raw);
  } catch {
    learningFail("learning_bytes", "File bytes are unavailable.");
  }
  if (n > maxBytes)
    learningFail("learning_limit", "The complete file exceeds its byte bound.");
  const b = new Uint8Array(n);
  Uint8Array.prototype.set.call(b, raw);
  return b;
}
export function parseLearningTransport(
  raw,
  maxBytes,
  { nativeStrings = false } = {},
) {
  const bytes =
    typeof raw === "string"
      ? new TextEncoder().encode(raw)
      : learningBytes(raw, maxBytes);
  if (bytes.length > maxBytes)
    learningFail("learning_limit", "The complete file exceeds its byte bound.");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    learningFail("learning_utf8", "Choose valid UTF-8 JSON.");
  }
  if (s.charCodeAt(0) === 0xfeff)
    learningFail("learning_json", "A UTF-8 BOM is unsupported.");
  if (typeof raw === "string" && s !== raw)
    learningFail("learning_utf8", "Raw JSON text cannot be encoded exactly.");
  let at = 0,
    nodes = 0;
  const ws = () => {
    while (/[ \n\r\t]/.test(s[at] ?? "x")) at++;
  };
  const bad = () =>
    learningFail("learning_json", "Choose one complete strict JSON value.");
  const str = () => {
    const start = at++;
    while (at < s.length) {
      const c = s.charCodeAt(at++);
      if (c === 34) {
        try {
          return JSON.parse(s.slice(start, at));
        } catch {
          bad();
        }
      }
      if (c < 32) bad();
      if (c === 92) {
        const e = s[at++];
        if (e === "u") {
          if (!/^[a-fA-F0-9]{4}$/.test(s.slice(at, at + 4))) bad();
          at += 4;
        } else if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(e))
          bad();
      }
    }
    bad();
  };
  const val = (depth) => {
    if (++nodes > 200000 || depth > 32)
      learningFail(
        "learning_limit",
        "Learning JSON exceeds its depth or work bound.",
      );
    ws();
    const c = s[at];
    if (c === '"') return str();
    if (c === "{") {
      at++;
      ws();
      const out = {};
      const names = new Set();
      if (s[at] === "}") {
        at++;
        return out;
      }
      for (;;) {
        ws();
        if (s[at] !== '"') bad();
        const k = str();
        if (names.has(k) || reserved.has(k))
          learningFail(
            "learning_json",
            "Duplicate or unsafe JSON object name.",
          );
        names.add(k);
        ws();
        if (s[at++] !== ":") bad();
        Object.defineProperty(out, k, {
          value: val(depth + 1),
          writable: true,
          enumerable: true,
          configurable: true,
        });
        ws();
        const end = s[at++];
        if (end === "}") return out;
        if (end !== ",") bad();
      }
    }
    if (c === "[") {
      at++;
      ws();
      const out = [];
      if (s[at] === "]") {
        at++;
        return out;
      }
      for (;;) {
        out.push(val(depth + 1));
        ws();
        const end = s[at++];
        if (end === "]") return out;
        if (end !== ",") bad();
      }
    }
    for (const [l, v] of [
      ["null", null],
      ["true", true],
      ["false", false],
    ])
      if (s.startsWith(l, at)) {
        at += l.length;
        return v;
      }
    const m = s.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!m) bad();
    at += m[0].length;
    const num = Number(m[0]);
    if (!Number.isFinite(num)) bad();
    return num;
  };
  const v = val(1);
  ws();
  if (at !== s.length) bad();
  return learningOwned(v, { bytes: maxBytes, nativeStrings });
}
