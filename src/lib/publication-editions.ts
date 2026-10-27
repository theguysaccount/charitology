/** Checked-in public archive only. No Git, clock, provider or browser data at build. */
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  makeProposalCatalog,
  makeProposalBasisBundle,
  PUBLICATION_LIMITS,
} from "./publication-editions-model.mjs";
import { publicationRegistryFromFiles } from "./publication-editions-capture.mjs";
import type {
  Registry,
  Source,
  Edition,
  Artifact,
  ProposalCatalog,
} from "./publication-editions-types";

export interface PublicationArchive {
  registry: Registry;
  sources: Source[];
  editions: Edition[];
  artifacts: {
    editionId: string;
    fileName: string;
    mediaType: Artifact["mediaType"];
    text: string;
  }[];
}
export interface PublicationArchiveBundle {
  input: PublicationArchive;
  catalog: ProposalCatalog;
  inventory: {
    files: number;
    storedBytes: number;
    basisBytes: number;
    shippedBytes: number;
  };
}
let cached: PublicationArchiveBundle | undefined;

export function loadPublicationEditions(): PublicationArchiveBundle {
  if (cached) return cached;
  const root = join(process.cwd(), "src/data/publication-editions");
  const rows = new Map<string, { text: string; bytes: number }>();
  let storedBytes = 0;
  const walk = (directory: string, relative: string, depth: number) => {
    if (depth > 3)
      throw Error("Publication archive: unexpected directory depth.");
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw Error("Publication archive: regular directories required.");
    for (const name of readdirSync(directory).sort()) {
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(name))
        throw Error("Publication archive: unexpected filename.");
      const file = join(directory, name),
        path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(file);
      if (stat.isSymbolicLink())
        throw Error("Publication archive: symlinks are unsupported.");
      if (stat.isDirectory()) {
        if (
          !/^(?:sources|editions|artifacts|artifacts\/[a-z][a-z0-9-]{0,79})$/.test(
            path,
          )
        )
          throw Error("Publication archive: unexpected directory.");
        walk(file, path, depth + 1);
        continue;
      }
      if (!stat.isFile() || stat.size > PUBLICATION_LIMITS.manifestBytes)
        throw Error("Publication archive: bounded regular files required.");
      const bytes = readFileSync(file);
      storedBytes += bytes.byteLength;
      if (
        bytes.byteLength > PUBLICATION_LIMITS.manifestBytes ||
        storedBytes > PUBLICATION_LIMITS.totalBytes
      )
        throw Error("Publication archive: byte limit exceeded.");
      rows.set(path, {
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        bytes: bytes.byteLength,
      });
      if (rows.size > 1401)
        throw Error(
          "Publication archive: file inventory exceeds fixed bounds.",
        );
    }
  };
  // Also reject symlinked ancestors inside the checkout.
  for (const directory of [
    join(process.cwd(), "src"),
    join(process.cwd(), "src/data"),
  ]) {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("Publication archive: regular source ancestors required.");
  }
  walk(root, "", 0);
  const input = publicationRegistryFromFiles(
    new Map([...rows].map(([path, row]) => [path, row.text])),
  ) as PublicationArchive;
  const catalog = makeProposalCatalog(input, {
    basePath: import.meta.env.BASE_URL.replace(/\/$/, ""),
  }) as ProposalCatalog;
  let basisBytes = 0;
  for (const edition of input.editions)
    basisBytes += Buffer.byteLength(
      makeProposalBasisBundle(input, edition.core.id),
    );
  if (storedBytes + basisBytes > PUBLICATION_LIMITS.totalBytes)
    throw Error(
      "Publication archive: complete shipped files and basis downloads exceed 20 MiB.",
    );
  cached = Object.freeze({
    input,
    catalog,
    inventory: Object.freeze({
      files: rows.size,
      storedBytes,
      basisBytes,
      shippedBytes: storedBytes + basisBytes,
    }),
  });
  return cached;
}
