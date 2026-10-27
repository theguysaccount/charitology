#!/usr/bin/env node
// Default is a read-only explicit-source preview. No provider/network operation.
import { readFileSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  strictPublicationJson,
  PUBLICATION_LIMITS,
} from "../src/lib/publication-editions-canonical.mjs";
import {
  prepareCommittedPublicationCapture,
  writePublicationRegistryCapture,
  readPublicationRegistryDirectory,
  PUBLICATION_DATA_DIRECTORY,
  publicationRegistryFiles,
} from "../src/lib/publication-editions-capture.mjs";
export async function runPublicationCaptureCli(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (
      ![
        "--repository-root",
        "--baseline-ref",
        "--captured-at",
        "--request-file",
        "--proposal-hash",
        "--write",
      ].includes(key) ||
      Object.hasOwn(options, key)
    )
      throw new Error("Use each documented capture option once.");
    if (key === "--write") options[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("Missing capture option value.");
      options[key] = args[++i];
    }
  }
  if (
    !options["--baseline-ref"] ||
    !options["--captured-at"] ||
    !options["--request-file"]
  )
    throw new Error(
      "Capture requires explicit --baseline-ref, --captured-at and --request-file.",
    );
  if (options["--write"] && !options["--proposal-hash"])
    throw new Error(
      "Writing requires the exact --proposal-hash from a reviewed preview.",
    );
  const root = resolve(options["--repository-root"] || process.cwd());
  const requestInfo = lstatSync(options["--request-file"]);
  if (
    !requestInfo.isFile() ||
    requestInfo.isSymbolicLink() ||
    requestInfo.size > PUBLICATION_LIMITS.totalBytes
  )
    throw new Error("Use a bounded regular request file.");
  const request = strictPublicationJson(
    readFileSync(options["--request-file"]),
    PUBLICATION_LIMITS.totalBytes,
  );
  if (
    !request ||
    request.format !== "charitology-publication-capture-request" ||
    request.schemaVersion !== 1 ||
    Object.keys(request).sort().join(",") !== "format,requests,schemaVersion"
  )
    throw new Error("Use the exact version-1 capture request wrapper.");
  const previousInput = readPublicationRegistryDirectory(
    resolve(root, PUBLICATION_DATA_DIRECTORY),
  );
  const prepared = prepareCommittedPublicationCapture({
    repositoryRoot: root,
    sourceCommit: options["--baseline-ref"],
    capturedAt: options["--captured-at"],
    requests: request.requests,
    previousInput,
  });
  if (options["--write"])
    writePublicationRegistryCapture({
      repositoryRoot: root,
      capture: prepared,
      expectedProposalHash: options["--proposal-hash"],
    });
  const files = publicationRegistryFiles(prepared.input);
  const report = {
    mode: options["--write"] ? "written" : "preview-only",
    sourceCommit: prepared.sourceCommit,
    capturedAt: prepared.capturedAt,
    proposalHash: prepared.proposalHash,
    registryHash: prepared.input.registry.hash,
    newEditionIds: prepared.newEditionIds,
    newSourceCount: prepared.newSourceIds.length,
    reusedSourceCount: prepared.reusedSourceCount,
    files: files.size,
    bytes: [...files.values()].reduce((n, s) => n + Buffer.byteLength(s), 0),
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runPublicationCaptureCli().catch((error) => {
    process.stderr.write(
      (error?.code ? `${error.code}: ` : "") + String(error.message) + "\n",
    );
    process.exitCode = 1;
  });
}
