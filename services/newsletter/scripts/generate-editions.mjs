#!/usr/bin/env node
// Build-time, public data only. This script has no provider or database client.
import {
  readFileSync,
  readdirSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  readPublicationRegistryDirectory,
  PUBLICATION_DATA_DIRECTORY,
} from "../../../src/lib/publication-editions-capture.mjs";
import { generateMailIssueFiles } from "../lib/generate-editions.mjs";
import { validateMailIssueFiles } from "../lib/editions.mjs";
import { exactIssue, issueHash, issueJson } from "../lib/issue-json.mjs";
export function readServiceMailFiles(directory) {
  if (!existsSync(directory)) return null;
  const files = Object.create(null);
  let total = 0;
  const take = (name) => {
    const path = join(directory, name),
      stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (total += stat.size) > 10485760
    )
      throw Error("Invalid service mail file");
    files[name] = readFileSync(path, "utf8");
  };
  for (const name of readdirSync(directory)) {
    if (name === "lineage") {
      const stat = lstatSync(join(directory, name));
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw Error("Invalid lineage directory");
      for (const child of readdirSync(join(directory, name)))
        take("lineage/" + child);
    } else take(name);
  }
  validateMailIssueFiles(files);
  return files;
}
export function runMailGeneration(args = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (
      ![
        "--repository-root",
        "--select-file",
        "--review-hash",
        "--write",
        "--check",
      ].includes(key) ||
      Object.hasOwn(opts, key)
    )
      throw Error("Use each documented mail generation option once");
    if (["--write", "--check"].includes(key)) opts[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw Error("Missing option value");
      opts[key] = args[++i];
    }
  }
  if (
    !opts["--select-file"] ||
    (opts["--write"] && opts["--check"]) ||
    (opts["--write"] && !opts["--review-hash"])
  )
    throw Error(
      "Use --select-file; --write requires the exact reviewed --review-hash",
    );
  const root = resolve(
      opts["--repository-root"] ||
        fileURLToPath(new URL("../../../", import.meta.url)),
    ),
    dir = join(root, "services/newsletter/editions");
  const request = issueJson(readFileSync(opts["--select-file"]), 16384);
  exactIssue(request, ["format", "version", "selections"]);
  if (request.format !== "charitology-mail-selection" || request.version !== 1)
    throw Error("Invalid explicit mail selection");
  const previousFiles = readServiceMailFiles(dir),
    previousRegistry = previousFiles
      ? validateMailIssueFiles(previousFiles)
      : undefined;
  const publicInput = readPublicationRegistryDirectory(
    join(root, PUBLICATION_DATA_DIRECTORY),
  );
  const files = generateMailIssueFiles(publicInput, {
    selections: request.selections,
    previousRegistry,
  });
  validateMailIssueFiles(files, { previousFiles: previousFiles || undefined });
  const reviewHash = issueHash(files),
    same = previousFiles && issueHash(previousFiles) === reviewHash;
  if (opts["--check"] && !same)
    throw Error("Generated service mail artifacts differ");
  if (opts["--write"]) {
    if (opts["--review-hash"] !== reviewHash)
      throw Error("Reviewed generation hash differs");
    const reread = readServiceMailFiles(dir);
    if (issueHash(reread) !== issueHash(previousFiles))
      throw Error("Service mail baseline changed");
    mkdirSync(join(dir, "lineage"), { recursive: true });
    for (const [name, text] of Object.entries(files))
      if (
        name !== "registry.json" &&
        !Object.hasOwn(previousFiles || {}, name)
      ) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), text, { flag: "wx" });
      }
    writeFileSync(join(dir, ".registry-next"), files["registry.json"], {
      flag: "wx",
    });
    renameSync(join(dir, ".registry-next"), join(dir, "registry.json"));
  }
  const report = {
    mode: opts["--write"]
      ? "written"
      : opts["--check"]
        ? "checked"
        : "preview-only",
    reviewHash,
    registryHash: validateMailIssueFiles(files).hash,
    issues: validateMailIssueFiles(files).issues.map((x) => x.id),
    files: Object.keys(files).length,
    bytes: Object.values(files).reduce((n, s) => n + Buffer.byteLength(s), 0),
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runMailGeneration();
  } catch (error) {
    process.stderr.write(String(error.message) + "\n");
    process.exitCode = 1;
  }
}
