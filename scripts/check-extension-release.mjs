// Verify actual generated metadata against version-pinned source and ZIP bytes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXTENSION_FILES,
  PACKAGE_NAMES,
  packageEntries,
  storedZip,
  releaseSite,
  releaseManifest,
  validateReleaseBaseline,
  validateStoredZip,
} from "./lib/extension-package.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const source = new Map(
  EXTENSION_FILES.map((path) => [
    path,
    readFileSync(join(root, "extension", path)),
  ]),
);
const actual = JSON.parse(
  readFileSync(join(root, "public/downloads/extension-release.json"), "utf8"),
);
const uri = new URL(actual.site),
  location = releaseSite(uri.origin, uri.pathname);
assert.equal(actual.site, location.site);
if (process.env.BASE_PATH !== undefined)
  assert.equal(
    location.basePath,
    releaseSite(location.origin, process.env.BASE_PATH || "/").basePath,
  );
const packages = new Map(
  PACKAGE_NAMES.map((path) => [
    path,
    readFileSync(join(root, "public/downloads", path)),
  ]),
);
for (const [name, bytes] of packages) {
  const expected = packageEntries(
    source,
    name.includes("chrome") ? "chrome" : "firefox",
    location.site,
  );
  assert.deepEqual(
    [...validateStoredZip(bytes)],
    [...expected].sort(([a], [b]) => a.localeCompare(b)),
  );
  assert.deepEqual(bytes, storedZip(expected));
}
assert.deepEqual(actual, releaseManifest(source, packages, location));
const registry = JSON.parse(
  readFileSync(
    join(root, "scripts/lib/extension-release-baselines.json"),
    "utf8",
  ),
);
validateReleaseBaseline(actual, registry);
assert.deepEqual(actual.storeListings, []);
assert.equal(actual.installedBrowserAcceptance, "unverified");
console.log(
  `✓ Extension release ${actual.extensionVersion}: 10 pinned source files, 3 exact reproducible packages and current metadata; installed-browser/store acceptance remains unverified.`,
);
