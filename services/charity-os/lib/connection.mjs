// Make Neon's intended certificate AND hostname verification independent of
// legacy pg sslmode aliases. Local/other-host URLs keep their existing settings.
export function verifiedNeonConnectionString(value) {
  if (typeof value !== "string") return value;
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) return value;
  // node-postgres honors the final host query parameter over URL hostname.
  const host = (url.searchParams.getAll("host").at(-1) || url.hostname)
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host.endsWith(".neon.tech")) return value;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
