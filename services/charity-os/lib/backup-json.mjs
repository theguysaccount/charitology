import { fail } from "./security.mjs";

export const MAX_BACKUP_JSON_BYTES = 64 * 1024 * 1024;
export const DIRECT_BACKUP_JSON_BYTES = 8 * 1024 * 1024;
const bad = (message = "Supply valid backup JSON without duplicate fields or nonfinite numbers.") => fail(422, "backup_json", message);
const tooLarge = () => fail(413, "size", "This backup request is too large.");
function checkedLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BACKUP_JSON_BYTES)
    throw new TypeError("Use a backup JSON byte limit from 1 through 64 MiB.");
  return limit;
}

/**
 * Lexical admission for complete backups and their direct request envelopes.
 * The byte bound is the structural bound: this iterative scanner adds no small
 * depth, node or directory-section limit to a legitimate older full backup.
 * Downstream backup validators retain ownership of schemas and checksums.
 */
export function parseBackupJson(input, limit = MAX_BACKUP_JSON_BYTES) {
  checkedLimit(limit);
  let text;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > limit) tooLarge();
    text = input;
  } else {
    if (!(input instanceof Uint8Array)) bad("Supply UTF-8 backup JSON bytes or text.");
    if (input.byteLength > limit) tooLarge();
    try {
      // Preserve BOM so that it fails exact JSON syntax rather than disappearing.
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
    } catch {
      bad("Supply valid UTF-8 backup JSON.");
    }
  }
  let at = 0, started = false;
  const frames = [];
  const digit = (code) => code >= 48 && code <= 57;
  const hex = (code) => digit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
  const space = () => {
    while (at < text.length) {
      const code = text.charCodeAt(at);
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
      ++at;
    }
  };
  const string = (key = false) => {
    const start = at++;
    while (at < text.length) {
      const code = text.charCodeAt(at++);
      if (code === 34) return key ? JSON.parse(text.slice(start, at)) : undefined;
      if (code < 32) bad();
      if (code !== 92) continue;
      if (at >= text.length) bad();
      const escape = text.charCodeAt(at++);
      if (escape === 117) {
        if (at + 4 > text.length) bad();
        for (let i = 0; i < 4; ++i) if (!hex(text.charCodeAt(at++))) bad();
      } else if (![34, 92, 47, 98, 102, 110, 114, 116].includes(escape)) bad();
    }
    bad();
  };
  const number = () => {
    const start = at;
    if (text.charCodeAt(at) === 45) ++at;
    if (text.charCodeAt(at) === 48) ++at;
    else {
      const first = text.charCodeAt(at);
      if (first < 49 || first > 57 || !Number.isFinite(first)) bad();
      do { ++at; } while (digit(text.charCodeAt(at)));
    }
    if (text.charCodeAt(at) === 46) {
      ++at;
      if (!digit(text.charCodeAt(at))) bad();
      do { ++at; } while (digit(text.charCodeAt(at)));
    }
    if (text.charCodeAt(at) === 101 || text.charCodeAt(at) === 69) {
      ++at;
      if (text.charCodeAt(at) === 43 || text.charCodeAt(at) === 45) ++at;
      if (!digit(text.charCodeAt(at))) bad();
      do { ++at; } while (digit(text.charCodeAt(at)));
    }
    if (!Number.isFinite(Number(text.slice(start, at)))) bad();
  };
  const value = () => {
    const parent = frames.at(-1);
    if (parent) parent.state = "after";
    else started = true;
    const code = text.charCodeAt(at);
    if (code === 123) { ++at; frames.push({ type: "object", state: "first", keys: new Set() }); }
    else if (code === 91) { ++at; frames.push({ type: "array", state: "first" }); }
    else if (code === 34) string();
    else if (code === 45 || digit(code)) number();
    else if (text.startsWith("true", at)) at += 4;
    else if (text.startsWith("false", at)) at += 5;
    else if (text.startsWith("null", at)) at += 4;
    else bad();
  };
  while (true) {
    space();
    const frame = frames.at(-1);
    if (!frame) {
      if (started) { if (at !== text.length) bad(); break; }
      value();
      continue;
    }
    const code = text.charCodeAt(at);
    if (frame.type === "object") {
      if (frame.state === "first" && code === 125) { ++at; frames.pop(); }
      else if (frame.state === "first" || frame.state === "key") {
        if (code !== 34) bad();
        const key = string(true);
        if (frame.keys.has(key)) bad("Duplicate decoded backup JSON field names are not accepted.");
        frame.keys.add(key);
        frame.state = "colon";
      } else if (frame.state === "colon") {
        if (code !== 58) bad();
        ++at; frame.state = "value";
      } else if (frame.state === "value") value();
      else if (code === 125) { ++at; frames.pop(); }
      else { if (code !== 44) bad(); ++at; frame.state = "key"; }
    } else {
      if (frame.state === "first" && code === 93) { ++at; frames.pop(); }
      else if (frame.state === "first" || frame.state === "value") value();
      else if (code === 93) { ++at; frames.pop(); }
      else { if (code !== 44) bad(); ++at; frame.state = "value"; }
    }
  }
  try { return JSON.parse(text); }
  catch { bad(); }
}

/** Read the direct envelope before JSON.parse can erase lexical evidence. */
export async function readBackupBody(request, limit = DIRECT_BACKUP_JSON_BYTES) {
  checkedLimit(limit);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) {
    try { await request.body?.cancel(); } catch {}
    tooLarge();
  }
  const chunks = [];
  let length = 0;
  const reader = request.body?.getReader();
  try {
    if (reader) while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        try { await reader.cancel(); } catch {}
        bad("Supply UTF-8 backup JSON bytes.");
      }
      length += value.byteLength;
      if (length > limit) {
        try { await reader.cancel(); } catch {}
        tooLarge();
      }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  // Preserve the old generic reader's empty-envelope behavior for downstream validation.
  return parseBackupJson(length ? Buffer.concat(chunks, length) : "{}", limit);
}
