// CI event orchestration stays outside the captured interpretation.
// It always runs the complete immutable validator; captured source remains exact.
// Required exact-event history gate. Only explicit created branches may use a
// labeled merge-base against existing local origin/main; never fetch or skip.
import { readFileSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkObservationAppendOnly } from "../src/lib/observation-git.mjs";
import { strictObservationJson } from "../src/lib/observation-canonical.mjs";
import { selectHistoryComparisonBase } from "./history-event-base.mjs";

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
  const selection = selectHistoryComparisonBase({
    eventName: process.env.GITHUB_EVENT_NAME, event, head,
    githubSha: process.env.GITHUB_SHA, githubRef: process.env.GITHUB_REF,
    dispatchInput: "observations_base_sha",
  }, args => execFileSync("git", ["--no-replace-objects", ...args], {
    encoding: "utf8", maxBuffer: 1024, timeout: 10_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  }).trim());
  const proof = checkObservationAppendOnly({
    repo: process.cwd(),
    exactBase: selection.comparisonBase,
    exactHead: head,
  });
  process.stdout.write(JSON.stringify({ ...proof, ...selection }, null, 2) + "\n");
} catch (error) {
  process.stderr.write(`Observation history gate failed: ${error.message}\n`);
  process.exitCode = 1;
}
