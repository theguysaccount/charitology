// Validate and prepare every byte before replacing any release artifact.
import {
  readFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import assert from "node:assert/strict";
import {
  EXTENSION_FILES,
  PACKAGE_NAMES,
  releaseSite,
  packageEntries,
  storedZip,
  validateStoredZip,
  releaseManifest,
  validateReleaseBaseline,
} from "./lib/extension-package.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  ext = join(root, "extension");
const location = releaseSite(
  process.env.SITE_URL || "https://charitology.org",
  process.env.BASE_PATH || "/",
);
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name),
      stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), "Symlinks are not release inputs");
    return stat.isDirectory()
      ? walk(path)
      : [relative(ext, path).split("\\").join("/")];
  });
assert.deepEqual(
  walk(ext)
    .filter((name) => name !== "README.md")
    .sort(),
  EXTENSION_FILES,
  "Unexpected extension source file",
);
const source = new Map(
  EXTENSION_FILES.map((name) => [name, readFileSync(join(ext, name))]),
);
const checklist = JSON.parse(
  readFileSync(join(root, "src/data/checklist.json"), "utf8"),
);
assert.ok(Array.isArray(checklist) && checklist.length === 10);
source.set(
  "checklist.json",
  Buffer.from(
    JSON.stringify(
      checklist.map(({ question, detail }) => ({ question, detail })),
      null,
      2,
    ) + "\n",
  ),
);
const packages = new Map(
  PACKAGE_NAMES.map((name) => {
    const zip = storedZip(
      packageEntries(
        source,
        name.includes("chrome") ? "chrome" : "firefox",
        location.site,
      ),
    );
    validateStoredZip(zip);
    return [name, zip];
  }),
);
const release = releaseManifest(source, packages, location);
const registry = JSON.parse(
  readFileSync(
    join(root, "scripts/lib/extension-release-baselines.json"),
    "utf8",
  ),
);
validateReleaseBaseline(release, registry);
const metadata = Buffer.from(JSON.stringify(release, null, 2) + "\n");
const out = join(root, "public/downloads");
mkdirSync(out, { recursive: true });
writeFileSync(join(ext, "checklist.json"), source.get("checklist.json"));
for (const [name, bytes] of packages) writeFileSync(join(out, name), bytes);
writeFileSync(join(out, "extension-release.json"), metadata);
console.log(
  `Packaged ${source.size} validated files for ${location.site}; extension ${JSON.parse(source.get("manifest.json")).version}.`,
);
