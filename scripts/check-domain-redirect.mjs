import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const directory = new URL("../services/domain-redirect/", import.meta.url);
const config = JSON.parse(await readFile(new URL("vercel.json", directory), "utf8"));
const path = "/:path(.*)";
const legacyQuery = { type: "query", key: "legacy", value: "1" };
const legacyCookie = { type: "cookie", key: "__Host-charitology-legacy", value: "1" };
const previousHost = { type: "host", value: "charitology.org" };

assert.equal(config.framework, null);
assert.equal(config.buildCommand, "");
assert.equal(config.installCommand, "");
assert.equal(config.outputDirectory, "public");
assert.deepEqual(config.rewrites, [{ source: path, destination: "https://publish.charitology.com/:path" }]);
assert.deepEqual(config.redirects, [
  {
    source: path,
    has: [{ type: "host", value: "www\\.charitology\\.(com|org)" }],
    destination: "https://charitology.com/:path",
    permanent: true,
  },
  {
    source: path,
    has: [previousHost],
    missing: [legacyQuery, legacyCookie],
    destination: "https://charitology.com/:path",
    permanent: true,
  },
]);
assert.deepEqual(config.headers, [
  {
    source: path,
    has: [previousHost, legacyQuery],
    headers: [
      { key: "Set-Cookie", value: "__Host-charitology-legacy=1; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax" },
      { key: "Cache-Control", value: "private, no-store" },
    ],
  },
]);
const html = await readFile(new URL("public/index.html", directory), "utf8");
assert.match(html, /href="https:\/\/charitology\.com\/"/);
assert.doesNotMatch(html, /<script|http-equiv|<iframe/i);
console.log("Domain routing: fixed Pages origin, canonical redirects and legacy export access passed.");
