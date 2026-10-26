import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export class HttpError extends Error {
  constructor(status, code, message, issues) {
    super(message);
    Object.assign(this, { status, code, issues });
  }
}
export const fail = (status, code, message, issues) => {
  throw new HttpError(status, code, message, issues);
};
export const id = () => randomBytes(16).toString("hex");
export const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : stable(value),
    )
    .digest("hex");
export function stable(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function equal(a, b) {
  const aa = Buffer.from(String(a || "")),
    bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export const csrf = (sessionId, secret) =>
  createHmac("sha256", secret)
    .update(`os-csrf:${sessionId}`)
    .digest("base64url");
export function checkOrigin(request, origin) {
  if (request.headers.get("origin") !== origin)
    fail(403, "origin", "Open this action from the Charity OS.");
}
export function checkCsrf(request, session, settings) {
  checkOrigin(request, settings.origin);
  if (
    !equal(
      request.headers.get("x-csrf-token"),
      csrf(session.session.id, settings.secret),
    )
  )
    fail(403, "csrf", "Refresh the page before trying again.");
}
export async function body(request, limit = 8 * 1024 * 1024) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    fail(413, "size", "This request is too large.");
  let bytes = 0;
  const chunks = [];
  if (request.body) {
    for await (const chunk of request.body) {
      bytes += chunk.byteLength;
      if (bytes > limit) fail(413, "size", "This request is too large.");
      chunks.push(chunk);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    fail(400, "json", "Supply valid JSON.");
  }
}
export function clean(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function email(value) {
  const v = clean(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    fail(422, "email", "Enter a valid email address.");
  return v;
}
export function settings(env = process.env) {
  const origin = env.BETTER_AUTH_URL || "http://localhost:4344";
  if (
    (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") &&
    !env.OS_DATABASE_URL
  )
    throw new Error("Production requires the constrained OS_DATABASE_URL.");
  const secret = env.BETTER_AUTH_SECRET || "";
  if (secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least32 characters.");
  return {
    origin: new URL(origin).origin,
    secret,
    databaseUrl: env.OS_DATABASE_URL || env.DATABASE_URL,
    relayUrl:
      env.OS_MAIL_RELAY_URL ||
      "https://mail.charitology.org/api/system/os-mail",
    relaySecret: env.OS_MAIL_RELAY_SECRET || "",
    encryptionKey: env.OS_ENCRYPTION_KEY || "",
    cronSecret: env.CRON_SECRET || "",
    production: env.NODE_ENV === "production",
  };
}
export function encrypt(value, key) {
  if (!key)
    fail(
      503,
      "configuration",
      "Private integration storage has not been configured.",
    );
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(key).digest(),
      iv,
    );
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((x) => x.toString("base64url"))
    .join(".");
}
export function decrypt(value, key) {
  const [iv, tag, data] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(key).digest(),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function streamText(text) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + 65536));
      offset += 65536;
    },
  });
}
export function json(value, status = 200, headers = {}) {
  return new Response(streamText(JSON.stringify(value)), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
export function dateZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    fail(422, "timezone", "Enter a valid IANA time zone.");
  }
}
