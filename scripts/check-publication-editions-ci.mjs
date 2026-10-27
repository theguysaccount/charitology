// Mandatory exact committed-base gate, separate from offline build validation.
// Checkout must supply full local history; this command never fetches or skips.
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkCommittedPublicationAppendOnly } from "../src/lib/publication-editions-append-only.mjs";

const sha = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{40}$/.test(value) &&
  !/^0+$/.test(value);
const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8192,
  }).trim();
try {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    !process.env.GITHUB_EVENT_PATH ||
    !sha(process.env.GITHUB_SHA)
  )
    throw Error(
      "Use this gate in GitHub Actions with an exact available checkout and event.",
    );
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!statSync(eventPath).isFile() || statSync(eventPath).size > 1_048_576)
    throw Error("GitHub event metadata is unavailable or oversized.");
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const headCommit = git(["rev-parse", "--verify", "HEAD^{commit}"]);
  if (headCommit !== process.env.GITHUB_SHA)
    throw Error("The checkout differs from the exact event head.");
  let baseCommit;
  if (process.env.GITHUB_EVENT_NAME === "pull_request")
    baseCommit = event.pull_request?.base?.sha;
  else if (process.env.GITHUB_EVENT_NAME === "push") {
    if (sha(event.before)) baseCommit = event.before;
    else if (event.created === true && event.before === "0".repeat(40))
      baseCommit = git(["merge-base", headCommit, "refs/remotes/origin/main"]);
    else throw Error("The push event must identify its exact previous commit.");
  } else if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch")
    baseCommit = event.inputs?.publication_base_sha;
  else throw Error("Unsupported publication release event.");
  if (!sha(baseCommit))
    throw Error(
      "An exact nonempty committed base is required; missing history cannot be skipped.",
    );
  const report = await checkCommittedPublicationAppendOnly({
    repositoryRoot: process.cwd(),
    headCommit,
    baseCommit,
    mode: "ci",
  });
  if (!["verified", "bootstrap-verified"].includes(report.status))
    throw Error("Committed publication history was not verified.");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} catch (error) {
  process.stderr.write(
    `Publication committed-base gate failed: ${error.message}\n`,
  );
  process.exitCode = 1;
}
