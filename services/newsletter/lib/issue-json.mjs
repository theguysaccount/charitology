import { createHash } from "node:crypto";

export function issueJson(input, maximum = 16384) {
  if (typeof input === "string" && !input.isWellFormed())
    throw new Error("Invalid JSON Unicode");
  const bytes = typeof input === "string" ? Buffer.from(input) : input;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maximum)
    throw new Error("JSON byte limit");
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let i = 0;
  const ws = () => {
    while (/\s/.test(raw[i] || "") && i < raw.length) {
      if (!/[\x20\x09\x0a\x0d]/.test(raw[i]))
        throw new Error("Invalid JSON whitespace");
      i++;
    }
  };
  const string = () => {
    const start = i++;
    let escaped = false;
    while (i < raw.length) {
      const c = raw[i++];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === '"') {
        const v = JSON.parse(raw.slice(start, i));
        if (!v.isWellFormed()) throw new Error("Invalid JSON Unicode");
        return v;
      }
    }
    throw new Error("Unterminated JSON string");
  };
  const value = (depth) => {
    ws();
    if (depth > 32) throw new Error("JSON depth limit");
    if (raw[i] === '"') return string();
    if (raw[i] === "{") {
      i++;
      ws();
      const seen = new Set();
      const out = Object.create(null);
      if (raw[i] === "}") {
        i++;
        return out;
      }
      while (true) {
        ws();
        if (raw[i] !== '"') throw new Error("JSON key required");
        const k = string();
        if (seen.has(k)) throw new Error("Duplicate JSON key");
        seen.add(k);
        ws();
        if (raw[i++] !== ":") throw new Error("JSON colon required");
        out[k] = value(depth + 1);
        ws();
        if (raw[i] === "}") {
          i++;
          return out;
        }
        if (raw[i++] !== ",") throw new Error("Invalid JSON object");
      }
    }
    if (raw[i] === "[") {
      i++;
      ws();
      const out = [];
      if (raw[i] === "]") {
        i++;
        return out;
      }
      while (true) {
        out.push(value(depth + 1));
        ws();
        if (raw[i] === "]") {
          i++;
          return out;
        }
        if (raw[i++] !== ",") throw new Error("Invalid JSON array");
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        raw.slice(i),
      );
    if (!token) throw new Error("Invalid JSON value");
    i += token[0].length;
    const v = JSON.parse(token[0]);
    if (typeof v === "number" && !Number.isFinite(v))
      throw new Error("Nonfinite JSON number");
    return v;
  };
  const out = value(1);
  ws();
  if (i !== raw.length) throw new Error("Trailing JSON");
  return out;
}

export function plainIssueValue(
  input,
  depth = 1,
  seen = new Set(),
  budget = { bytes: 16777216, nodes: 100000 },
) {
  if (--budget.nodes < 0) throw new Error("Plain data node limit");
  if (depth > 32) throw new Error("Plain data depth limit");
  if (input === null || typeof input === "boolean") return input;
  if (typeof input === "string") {
    if (!input.isWellFormed() || (budget.bytes -= Buffer.byteLength(input)) < 0)
      throw new Error("Invalid or oversized Unicode");
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Nonfinite number");
    return input;
  }
  if (!input || typeof input !== "object" || seen.has(input))
    throw new Error("Plain JSON required");
  if (
    !Array.isArray(input) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw new Error("Plain JSON required");
  const keys = Reflect.ownKeys(input);
  if (
    keys.length > budget.nodes ||
    (budget.bytes -= keys.reduce(
      (n, k) => n + (typeof k === "string" ? Buffer.byteLength(k) : 0),
      0,
    )) < 0
  )
    throw new Error("Plain data key limit");
  const desc = Object.getOwnPropertyDescriptors(input);
  if (
    keys.some(
      (k) =>
        typeof k !== "string" ||
        (!(Array.isArray(input) && k === "length") &&
          (!desc[k].enumerable || !Object.hasOwn(desc[k], "value"))),
    )
  )
    throw new Error("Decorated JSON refused");
  if (
    Array.isArray(input) &&
    (keys.length !== input.length + 1 ||
      keys.some((k) => k !== "length" && !/^(0|[1-9]\d*)$/.test(k)))
  )
    throw new Error("Sparse/decorated array refused");
  seen.add(input);
  const out = Array.isArray(input) ? [] : Object.create(null);
  for (const k of keys)
    if (k !== "length" || !Array.isArray(input))
      out[k] = plainIssueValue(desc[k].value, depth + 1, seen, budget);
  seen.delete(input);
  return out;
}
export function canonicalIssueJson(input) {
  const encode = (v) =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? "[" + v.map(encode).join(",") + "]"
        : "{" +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ":" + encode(v[k]))
            .join(",") +
          "}";
  return encode(plainIssueValue(input));
}
export const issueHash = (value) =>
  createHash("sha256").update(canonicalIssueJson(value)).digest("hex");
export function exactIssue(value, names) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).sort().join("\0") !== [...names].sort().join("\0")
  )
    throw new Error("Unexpected issue fields");
  return value;
}
export const issueId = (value) => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(value))
    throw new Error("Invalid issue ID");
  return value;
};
export const issueDigest = (value) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new Error("Invalid issue checksum");
  return value;
};
export function freezeIssue(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freezeIssue(v);
    Object.freeze(value);
  }
  return value;
}
