// The release format is deliberately small: ten allowlisted, stored ZIP entries.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const EXTENSION_FILES = Object.freeze([
  "checklist.json",
  "content.js",
  "icons/icon-128.png",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js",
]);
export const PACKAGE_NAMES = Object.freeze([
  "charitology-extension.zip",
  "charitology-firefox.zip",
  "charitology-chrome.zip",
]);
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function releaseSite(
  siteInput = "https://charitology.org",
  baseInput = "/",
) {
  assert.equal(typeof siteInput, "string");
  assert.equal(typeof baseInput, "string");
  assert.ok(
    siteInput.length <= 200 && !/[\s\u0000-\u001f\u007f?#]/.test(siteInput),
    "Invalid release origin",
  );
  const parsed = new URL(siteInput);
  assert.ok(
    ["https://charitology.org", "https://theguysaccount.github.io"].includes(
      parsed.origin,
    ),
    "Release origin must be an approved Charitology HTTPS origin",
  );
  assert.ok(
    !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname === "/",
    "Use an origin without credentials, path, query or fragment",
  );
  assert.ok(
    baseInput.length <= 200 &&
      !baseInput.includes("//") &&
      /^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*\/?$/.test(baseInput),
    "Invalid release base path",
  );
  assert.ok(
    !baseInput.split("/").some((part) => part === "." || part === ".."),
    "Relative path segments are not allowed",
  );
  const basePath = baseInput.replace(/\/$/, "");
  return Object.freeze({
    origin: parsed.origin,
    basePath,
    site: parsed.origin + basePath,
  });
}
function bake(source, site) {
  const token = /\bconst SITE_SETTING = (['"])__CHARITOLOGY_SITE__\1;/g;
  const text = source.toString("utf8");
  assert.equal(
    [...text.matchAll(token)].length,
    1,
    "Expected exactly one literal site setting",
  );
  const result = text.replace(
    token,
    `const SITE_SETTING = ${JSON.stringify(site)};`,
  );
  assert.ok(
    !result.includes("__CHARITOLOGY_SITE__"),
    "Unbaked release setting",
  );
  return Buffer.from(result);
}
export function packageEntries(source, target, site) {
  assert.deepEqual([...source.keys()].sort(), EXTENSION_FILES);
  for (const data of source.values())
    assert.ok(
      Buffer.isBuffer(data) && data.length <= 1024 * 1024,
      "Invalid extension source size",
    );
  const entries = new Map(
    [...source].map(([name, data]) => [name, Buffer.from(data)]),
  );
  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.permissions, ["activeTab", "storage"]);
  for (const field of [
    "background",
    "host_permissions",
    "optional_permissions",
    "optional_host_permissions",
    "web_accessible_resources",
    "externally_connectable",
  ])
    assert.equal(manifest[field], undefined, `Unexpected capability: ${field}`);
  assert.deepEqual(manifest.content_scripts, [
    {
      matches: [
        "https://www.gofundme.com/f/*",
        "https://gofundme.com/f/*",
        "https://www.justgiving.com/*",
        "https://www.every.org/*",
      ],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ]);
  if (target === "chrome") delete manifest.browser_specific_settings;
  else assert.equal(target, "firefox");
  entries.set(
    "manifest.json",
    Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
  );
  for (const name of ["content.js", "popup.js"])
    entries.set(name, bake(entries.get(name), site));
  return entries;
}
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
export function storedZip(entries) {
  assert.deepEqual([...entries.keys()].sort(), EXTENSION_FILES);
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const name of EXTENSION_FILES) {
    const data = entries.get(name),
      nameBytes = Buffer.from(name),
      crc = crc32(data);
    assert.ok(data.length <= 1024 * 1024, "Extension entry too large");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...locals, ...centrals, end]);
  assert.ok(zip.length <= 2 * 1024 * 1024, "Extension package too large");
  return zip;
}
export function validateStoredZip(zip) {
  assert.ok(
    Buffer.isBuffer(zip) && zip.length >= 22 && zip.length <= 2 * 1024 * 1024,
    "Invalid ZIP size",
  );
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50, "Missing exact ZIP end");
  assert.equal(zip.readUInt16LE(end + 4), 0);
  assert.equal(zip.readUInt16LE(end + 6), 0);
  const count = zip.readUInt16LE(end + 10),
    centralStart = zip.readUInt32LE(end + 16);
  assert.equal(count, EXTENSION_FILES.length);
  assert.equal(zip.readUInt16LE(end + 8), count);
  assert.equal(zip.readUInt16LE(end + 20), 0);
  assert.equal(centralStart + zip.readUInt32LE(end + 12), end);
  const entries = new Map();
  let centralOffset = centralStart,
    localOffset = 0;
  for (let i = 0; i < count; i++) {
    assert.ok(centralOffset + 46 <= end, "Truncated central entry");
    assert.equal(zip.readUInt32LE(centralOffset), 0x02014b50);
    assert.equal(zip.readUInt16LE(centralOffset + 4), 20);
    assert.equal(zip.readUInt16LE(centralOffset + 6), 20);
    assert.equal(zip.readUInt16LE(centralOffset + 8), 0x0800);
    assert.equal(zip.readUInt16LE(centralOffset + 10), 0);
    assert.equal(zip.readUInt16LE(centralOffset + 12), 0);
    assert.equal(zip.readUInt16LE(centralOffset + 14), DOS_DATE);
    const crc = zip.readUInt32LE(centralOffset + 16),
      size = zip.readUInt32LE(centralOffset + 24);
    assert.ok(size <= 1024 * 1024, "Extension entry too large");
    assert.equal(zip.readUInt32LE(centralOffset + 20), size);
    const nameSize = zip.readUInt16LE(centralOffset + 28);
    assert.equal(zip.readUInt16LE(centralOffset + 30), 0);
    assert.equal(zip.readUInt16LE(centralOffset + 32), 0);
    assert.equal(zip.readUInt16LE(centralOffset + 34), 0);
    assert.equal(zip.readUInt16LE(centralOffset + 36), 0);
    assert.equal(zip.readUInt32LE(centralOffset + 38), 0);
    assert.equal(zip.readUInt32LE(centralOffset + 42), localOffset);
    assert.ok(centralOffset + 46 + nameSize <= end, "Truncated name");
    const nameBytes = zip.subarray(
        centralOffset + 46,
        centralOffset + 46 + nameSize,
      ),
      name = nameBytes.toString("utf8");
    assert.equal(
      name,
      EXTENSION_FILES[i],
      "Unexpected, duplicate or reordered ZIP path",
    );
    assert.deepEqual(Buffer.from(name), nameBytes);
    assert.ok(localOffset + 30 <= centralStart, "Truncated local entry");
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50);
    assert.equal(zip.readUInt16LE(localOffset + 4), 20);
    assert.equal(zip.readUInt16LE(localOffset + 6), 0x0800);
    assert.equal(zip.readUInt16LE(localOffset + 8), 0);
    assert.equal(zip.readUInt16LE(localOffset + 10), 0);
    assert.equal(zip.readUInt16LE(localOffset + 12), DOS_DATE);
    assert.equal(zip.readUInt32LE(localOffset + 14), crc);
    assert.equal(zip.readUInt32LE(localOffset + 18), size);
    assert.equal(zip.readUInt32LE(localOffset + 22), size);
    assert.equal(zip.readUInt16LE(localOffset + 26), nameSize);
    assert.equal(zip.readUInt16LE(localOffset + 28), 0);
    assert.deepEqual(
      zip.subarray(localOffset + 30, localOffset + 30 + nameSize),
      nameBytes,
    );
    const dataStart = localOffset + 30 + nameSize,
      next = dataStart + size;
    assert.ok(next <= centralStart, "Overlapping ZIP data");
    const data = zip.subarray(dataStart, next);
    assert.equal(crc32(data), crc, `CRC mismatch: ${name}`);
    entries.set(name, Buffer.from(data));
    localOffset = next;
    centralOffset += 46 + nameSize;
  }
  assert.equal(localOffset, centralStart);
  assert.equal(centralOffset, end);
  return entries;
}
export function releaseManifest(source, packages, location) {
  const manifest = JSON.parse(source.get("manifest.json").toString("utf8"));
  const sourceFiles = EXTENSION_FILES.map((path) => ({
    path,
    bytes: source.get(path).length,
    sha256: sha256(source.get(path)),
  }));
  return {
    format: "charitology-extension-release",
    version: 1,
    extensionVersion: manifest.version,
    site: location.site,
    checklistSha256: sha256(source.get("checklist.json")),
    supportedPatterns: manifest.content_scripts.flatMap(
      (script) => script.matches,
    ),
    declaredEngines: manifest.browser_specific_settings,
    sourceSha256: sha256(JSON.stringify(sourceFiles)),
    sourceFiles,
    packages: PACKAGE_NAMES.map((path) => ({
      path,
      bytes: packages.get(path).length,
      sha256: sha256(packages.get(path)),
    })),
    storeListings: [],
    installedBrowserAcceptance: "unverified",
  };
}

export function validateReleaseBaseline(metadata, registry) {
  assert.deepEqual(Object.keys(metadata).sort(), [
    "checklistSha256",
    "declaredEngines",
    "extensionVersion",
    "format",
    "installedBrowserAcceptance",
    "packages",
    "site",
    "sourceFiles",
    "sourceSha256",
    "storeListings",
    "supportedPatterns",
    "version",
  ]);
  assert.equal(metadata.format, "charitology-extension-release");
  assert.equal(metadata.version, 1);
  assert.match(metadata.extensionVersion, /^\d+\.\d+\.\d+$/);
  const parsedSite = new URL(metadata.site);
  const location = releaseSite(parsedSite.origin, parsedSite.pathname);
  assert.equal(metadata.site, location.site, "Invalid metadata release site");
  assert.match(metadata.checklistSha256, /^[a-f0-9]{64}$/);
  assert.match(metadata.sourceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(metadata.storeListings, []);
  assert.equal(metadata.installedBrowserAcceptance, "unverified");
  assert.deepEqual(
    metadata.sourceFiles.map((row) => row.path),
    EXTENSION_FILES,
  );
  for (const row of metadata.sourceFiles) {
    assert.deepEqual(Object.keys(row).sort(), ["bytes", "path", "sha256"]);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.ok(
      Number.isSafeInteger(row.bytes) &&
        row.bytes > 0 &&
        row.bytes <= 1024 * 1024,
    );
  }
  assert.equal(
    metadata.sourceSha256,
    sha256(
      JSON.stringify(
        metadata.sourceFiles.map(({ path, bytes, sha256 }) => ({
          path,
          bytes,
          sha256,
        })),
      ),
    ),
    "Metadata source digest mismatch",
  );
  assert.deepEqual(
    metadata.packages.map((row) => row.path),
    PACKAGE_NAMES,
  );
  for (const row of metadata.packages) {
    assert.deepEqual(Object.keys(row).sort(), ["bytes", "path", "sha256"]);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.ok(
      Number.isSafeInteger(row.bytes) &&
        row.bytes > 0 &&
        row.bytes <= 2 * 1024 * 1024,
    );
  }
  assert.deepEqual(Object.keys(registry).sort(), [
    "format",
    "releases",
    "version",
  ]);
  assert.equal(registry.format, "charitology-extension-source-baselines");
  assert.equal(registry.version, 1);
  assert.ok(
    Array.isArray(registry.releases) &&
      registry.releases.length >= 1 &&
      registry.releases.length <= 100,
  );
  const seen = new Set();
  for (const release of registry.releases) {
    assert.deepEqual(Object.keys(release).sort(), [
      "extensionVersion",
      "productionPackages",
      "productionSite",
      "sourceSha256",
    ]);
    assert.match(release.extensionVersion, /^\d+\.\d+\.\d+$/);
    assert.ok(
      !seen.has(release.extensionVersion),
      "Duplicate release baseline",
    );
    seen.add(release.extensionVersion);
    assert.match(release.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(release.productionSite, "https://charitology.org");
    assert.deepEqual(
      release.productionPackages.map((p) => p.path),
      PACKAGE_NAMES,
    );
    for (const pkg of release.productionPackages) {
      assert.deepEqual(Object.keys(pkg).sort(), ["bytes", "path", "sha256"]);
      assert.match(pkg.sha256, /^[a-f0-9]{64}$/);
      assert.ok(
        Number.isSafeInteger(pkg.bytes) &&
          pkg.bytes > 0 &&
          pkg.bytes <= 2 * 1024 * 1024,
      );
    }
  }
  const release = registry.releases.find(
    (item) => item.extensionVersion === metadata.extensionVersion,
  );
  assert.ok(release, "Register a new extension version before packaging");
  assert.equal(
    metadata.sourceSha256,
    release.sourceSha256,
    "Source drift under the same extension version; publish a new version and reviewed baseline",
  );
  if (metadata.site === release.productionSite)
    assert.deepEqual(
      metadata.packages,
      release.productionPackages,
      "Production package drift under the same extension version",
    );
  return true;
}
