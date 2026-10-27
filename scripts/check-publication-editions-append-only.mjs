#!/usr/bin/env node
import { checkCommittedPublicationAppendOnly } from "../src/lib/publication-editions-append-only.mjs";
const args = process.argv.slice(2),
  options = {};
try {
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (
      !["--mode", "--head-ref", "--base-ref", "--repository-root"].includes(
        k,
      ) ||
      Object.hasOwn(options, k) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Use each exact committed-base option once.");
    options[k] = args[++i];
  }
  if (!options["--mode"] || !options["--head-ref"])
    throw new Error("Supply explicit --mode and --head-ref.");
  const report = await checkCommittedPublicationAppendOnly({
    repositoryRoot: options["--repository-root"] || process.cwd(),
    headCommit: options["--head-ref"],
    baseCommit: options["--base-ref"] ?? null,
    mode: options["--mode"],
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} catch (error) {
  process.stderr.write(
    (error?.code ? `${error.code}: ` : "") + String(error.message) + "\n",
  );
  process.exitCode = 1;
}
