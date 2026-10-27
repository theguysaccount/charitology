// Required exact-event history gate. No fetch, automatic base choice or skip.
import { readFileSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkObservationAppendOnly } from "../src/lib/observation-git.mjs";
import { strictObservationJson } from "../src/lib/observation-canonical.mjs";

try {
  const valid = (v) =>
    typeof v === "string" && /^[a-f0-9]{40}$/.test(v) && !/^0+$/.test(v);
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    !process.env.GITHUB_EVENT_PATH ||
    !valid(process.env.GITHUB_SHA)
  )
    throw Error(
      "Use an exact checked-out GitHub event and available local history.",
    );
  const path = process.env.GITHUB_EVENT_PATH,
    stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 1_048_576)
    throw Error("Event metadata is unavailable or oversized.");
  const event = strictObservationJson(readFileSync(path), 1_048_576);
  const head = execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
    encoding: "utf8",
    maxBuffer: 1024,
    timeout: 10_000,
  }).trim();
  if (head !== process.env.GITHUB_SHA)
    throw Error("Checkout differs from the event head.");
  let base;
  if (process.env.GITHUB_EVENT_NAME === "pull_request")
    base = event.pull_request?.base?.sha;
  else if (process.env.GITHUB_EVENT_NAME === "push") base = event.before;
  else if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch")
    base = event.inputs?.observations_base_sha;
  else throw Error("Unsupported observation release event.");
  if (!valid(base))
    throw Error(
      "The actual nonzero committed base is required; it cannot be inferred or skipped.",
    );
  const proof = checkObservationAppendOnly({
    repo: process.cwd(),
    exactBase: base,
    exactHead: head,
  });
  process.stdout.write(JSON.stringify(proof, null, 2) + "\n");
} catch (error) {
  process.stderr.write(`Observation history gate failed: ${error.message}\n`);
  process.exitCode = 1;
}
