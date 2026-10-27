import { fail } from "./security.mjs";
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
/** Reject duplicate decoded names and depth before ordinary JSON.parse loses evidence. */
export function parseDirectoryResourceJson(text, limit = 32768) {
  if (typeof text !== "string" || Buffer.byteLength(text) > limit)
    fail(413, "size", "This directory review request is too large.");
  if (text.charCodeAt(0) === 0xfeff)
    fail(
      422,
      "directory_resource_json",
      "Supply strict UTF-8 JSON without a byte-order mark.",
    );
  let i = 0;
  const bad = () =>
    fail(
      422,
      "directory_resource_json",
      "Supply strict JSON without duplicate fields.",
    );
  const space = () => {
    while (/[\x20\t\r\n]/.test(text[i] || "!")) i++;
  };
  const string = () => {
    let start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        try {
          return JSON.parse(text.slice(start, i));
        } catch {
          bad();
        }
      }
      if (c === "\\") {
        if (text[i] === "u") {
          i++;
          if (!/^[a-fA-F0-9]{4}$/.test(text.slice(i, i + 4))) bad();
          i += 4;
        } else {
          if (!/["\\/bfnrt]/.test(text[i] || "!")) bad();
          i++;
        }
      } else if (c.charCodeAt(0) < 32) bad();
    }
    bad();
  };
  const value = (depth) => {
    if (depth > 8) bad();
    space();
    const ch = text[i];
    if (ch === '"') {
      string();
      return;
    }
    if (ch === "{") {
      i++;
      space();
      const seen = new Set();
      if (text[i] === "}") {
        i++;
        return;
      }
      while (true) {
        space();
        if (text[i] !== '"') bad();
        const key = string();
        if (seen.has(key)) bad();
        seen.add(key);
        space();
        if (text[i++] !== ":") bad();
        value(depth + 1);
        space();
        if (text[i] === "}") {
          i++;
          return;
        }
        if (text[i++] !== ",") bad();
      }
    } else if (ch === "[") {
      i++;
      space();
      if (text[i] === "]") {
        i++;
        return;
      }
      while (true) {
        value(depth + 1);
        space();
        if (text[i] === "]") {
          i++;
          return;
        }
        if (text[i++] !== ",") bad();
      }
    } else {
      const found =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          text.slice(i),
        );
      if (!found) bad();
      i += found[0].length;
    }
  };
  value(1);
  space();
  if (i !== text.length) bad();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    bad();
  }
  if (!plain(parsed)) bad();
  const finite = (value) => {
    if (typeof value === "number" && !Number.isFinite(value)) bad();
    if (value !== null && typeof value === "object")
      for (const item of Object.values(value)) finite(item);
  };
  finite(parsed);
  return parsed;
}
export async function readDirectoryResourceBody(request) {
  if (Number(request.headers.get("content-length") || 0) > 32768)
    fail(413, "size", "This directory review request is too large.");
  const chunks = [];
  let bytes = 0;
  const reader = request.body?.getReader();
  try {
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 32768) {
          await reader.cancel();
          fail(413, "size", "This directory review request is too large.");
        }
        chunks.push(value);
      }
  } finally {
    reader?.releaseLock();
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    fail(422, "directory_resource_json", "Supply valid UTF-8 JSON.");
  }
  return parseDirectoryResourceJson(text || "{}");
}
