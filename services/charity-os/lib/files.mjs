import { clean, hash, fail } from "./security.mjs";
export const FILE_QUOTA = 25 * 1024 * 1024;
export function validateFile(input) {
  if (typeof input.content !== "string")
    fail(422, "file", "Supply an encoded file.");
  const encoded = input.content.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1)
    fail(422, "file", "Invalid file encoding.");
  const bytes = Buffer.from(encoded, "base64"),
    mime = input.mime;
  if (
    ![
      "application/pdf",
      "text/plain",
      "text/csv",
      "image/png",
      "image/jpeg",
    ].includes(mime) ||
    !bytes.length ||
    bytes.length > 2 * 1024 * 1024
  )
    fail(422, "file", "Use a PDF, text, CSV, PNG or JPEG file under2 MiB.");
  if (
    mime === "application/pdf" &&
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    fail(422, "file", "The PDF signature is invalid.");
  if (
    mime === "image/png" &&
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    fail(422, "file", "The PNG signature is invalid.");
  if (
    mime === "image/jpeg" &&
    bytes.subarray(0, 3).toString("hex") !== "ffd8ff"
  )
    fail(422, "file", "The JPEG signature is invalid.");
  if (mime.startsWith("text/")) {
    try {
      new TextDecoder("utf8", { fatal: true }).decode(bytes);
    } catch {
      fail(422, "file", "Use UTF-8 text or CSV.");
    }
  }
  const checksum = hash(bytes);
  if (input.checksum && input.checksum !== checksum)
    fail(422, "file", "The file checksum does not match.");
  const name = clean(input.name, 180).replace(/[\\/\r\n\u0000-\u001f]/g, "_");
  if (!name) fail(422, "file", "Enter a file name.");
  return { bytes, mime, name, checksum, size: bytes.length };
}
