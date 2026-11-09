// Pure mocked local-Git selection only. No subprocess, repository, env or IO.
import test from "node:test";
import assert from "node:assert/strict";
import { selectHistoryComparisonBase as selectSharedHistoryComparisonBase } from "./history-event-base.mjs";
import { selectDisasterHistoryComparisonBase } from "./check-disaster-history.mjs";

const HEAD = "a".repeat(40), MAIN = "b".repeat(40), BASE = "c".repeat(40), ZERO = "0".repeat(40);
const REF = "refs/heads/finite-history-check";
const created = () => ({ eventName: "push", head: HEAD, githubSha: HEAD, githubRef: REF,
  event: { before: ZERO, after: HEAD, created: true, deleted: false, ref: REF } });
function localGit({ fault = -1, outputs = {} } = {}) {
  const expected = [["check-ref-format", REF], ["rev-parse", "--verify", "refs/remotes/origin/main^{commit}"],
    ["merge-base", HEAD, MAIN], ["rev-parse", "--verify", BASE + "^{commit}"],
    ["merge-base", "--is-ancestor", BASE, HEAD], ["merge-base", "--is-ancestor", BASE, MAIN]];
  const values = ["", MAIN, BASE, BASE, "", ""], calls = [];
  return { calls, read(args) { const n = calls.length; calls.push([...args]); assert.deepEqual([...args], expected[n]);
    if (n === fault) throw Error("Fictional unavailable local history"); return outputs[n] ?? values[n]; } };
}
const noGit = () => { throw Error("This exact-event path must not choose another base"); };

function registerPolicyCases(label, selectHistoryComparisonBase) {
  const testCase = (name, body) => test(label + ": " + name, body);
testCase("PR retains its exact event base while checkout is the synthetic merge head", () => {
  const value = selectHistoryComparisonBase({ eventName: "pull_request", head: HEAD, githubSha: HEAD,
    event: { pull_request: { base: { sha: BASE }, head: { sha: MAIN } } } }, noGit);
  assert.equal(value.comparisonBase, BASE); assert.equal(value.comparisonBasePolicy, "event.pull_request.base.sha");
  assert.equal(value.event.before, null); assert.equal(value.comparisonReference, null);
});
testCase("ordinary push retains exact nonzero before without consulting origin/main", () => {
  const value = selectHistoryComparisonBase({ ...created(), event: { before: BASE } }, noGit);
  assert.equal(value.comparisonBase, BASE); assert.equal(value.comparisonBasePolicy, "event.before");
  assert.equal(value.event.before, BASE); assert.equal(value.comparisonReference, null);
});
testCase("all three manual gates use only their exact named base input", () => {
  for (const dispatchInput of ["observations_base_sha", "directory_resources_base_sha", "disaster_incidents_base_sha"]) {
    const value = selectHistoryComparisonBase({ eventName: "workflow_dispatch", head: HEAD, githubSha: HEAD,
      dispatchInput, event: { inputs: { [dispatchInput]: BASE } } }, noGit);
    assert.equal(value.comparisonBase, BASE); assert.equal(value.comparisonBasePolicy, "event.inputs." + dispatchInput);
  }
});
testCase("created branch uses available local committed merge-base and labels zero before separately", () => {
  const git = localGit(), value = selectHistoryComparisonBase(created(), git.read);
  assert.equal(value.comparisonBase, BASE); assert.equal(value.event.before, ZERO);
  assert.equal(value.comparisonBasePolicy, "created-branch.merge-base-with-local-origin-main");
  assert.deepEqual(value.comparisonReference, { ref: "refs/remotes/origin/main", commit: MAIN });
  assert.equal(value.createdBranchRef, REF); assert.equal(git.calls.length, 6);
  assert(Object.isFrozen(value) && Object.isFrozen(value.event) && Object.isFrozen(value.comparisonReference));
});
testCase("zero before has no fallback without exact created and nondeleted booleans", () => {
  for (const change of [{ created: false }, { created: undefined }, { created: "true" }, { deleted: true }, { deleted: undefined }, { deleted: "false" }])
    assert.throws(() => selectHistoryComparisonBase({ ...created(), event: { ...created().event, ...change } }, noGit));
});
testCase("missing malformed or almost-zero before never gains a merge-base policy", () => {
  for (const before of [undefined, null, "", "0", "0".repeat(39), ZERO + "\n", "g".repeat(40)])
    assert.throws(() => selectHistoryComparisonBase({ ...created(), event: { ...created().event, before } }, noGit));
});
testCase("created branch requires a matching branch ref rather than a tag or absent ref", () => {
  for (const ref of [undefined, "", "refs/tags/release", "refs/heads/", "refs/heads/" + "x".repeat(1024)])
    assert.throws(() => selectHistoryComparisonBase({ ...created(), githubRef: ref, event: { ...created().event, ref } }, noGit));
  assert.throws(() => selectHistoryComparisonBase({ ...created(), githubRef: "refs/heads/other" }, noGit));
});
testCase("actual local Git must admit the full created branch ref grammar", () => {
  const input = created(); input.event.ref = input.githubRef = "refs/heads/not..a-ref"; let calls = 0;
  assert.throws(() => selectHistoryComparisonBase(input, args => { calls++; assert.deepEqual([...args], ["check-ref-format", input.event.ref]); throw Error("Invalid ref"); }), /local Git/);
  assert.equal(calls, 1);
});
testCase("mismatched declared checkout head and created after refuse before Git selection", () => {
  assert.throws(() => selectHistoryComparisonBase({ ...created(), githubSha: MAIN }, noGit), /head/);
  assert.throws(() => selectHistoryComparisonBase({ ...created(), event: { ...created().event, after: MAIN } }, noGit), /head/);
});
testCase("every unavailable local history step refuses without fallback", () => {
  for (let fault = 0; fault < 6; fault++) {
    const git = localGit({ fault }); assert.throws(() => selectHistoryComparisonBase(created(), git.read), /local Git/);
    assert.equal(git.calls.length, fault + 1);
  }
});
testCase("malformed unavailable or mismatching main and base responses refuse", () => {
  for (const [at, value] of [[1, ZERO], [1, "missing"], [1, MAIN + "\n" + BASE], [2, ZERO], [2, ""], [2, BASE + "\n" + MAIN], [3, MAIN], [4, "not-proven"], [5, "not-proven"]]) {
    const git = localGit({ outputs: { [at]: value } }); assert.throws(() => selectHistoryComparisonBase(created(), git.read));
  }
});
testCase("existing valid before is never relabeled an inferred created-branch base", () => {
  const value = selectHistoryComparisonBase({ ...created(), event: { ...created().event, before: BASE } }, noGit);
  assert.equal(value.comparisonBasePolicy, "event.before"); assert.equal(value.comparisonReference, null);
});
testCase("manual or PR missing base cannot borrow before or another input", () => {
  assert.throws(() => selectHistoryComparisonBase({ eventName: "pull_request", head: HEAD, githubSha: HEAD, event: { before: BASE } }, noGit));
  assert.throws(() => selectHistoryComparisonBase({ eventName: "workflow_dispatch", head: HEAD, githubSha: HEAD,
    dispatchInput: "observations_base_sha", event: { before: BASE, inputs: { disaster_incidents_base_sha: BASE } } }, noGit));
  assert.throws(() => selectHistoryComparisonBase({ eventName: "workflow_dispatch", head: HEAD, githubSha: HEAD,
    dispatchInput: "caller_override", event: { inputs: { caller_override: BASE } } }, noGit));
});
testCase("unsupported event and malformed event/head fail closed", () => {
  for (const event of [null, undefined, [], "push"]) assert.throws(() => selectHistoryComparisonBase({ ...created(), event }, noGit));
  assert.throws(() => selectHistoryComparisonBase({ ...created(), eventName: "workflow_run" }, noGit));
  for (const head of [ZERO, "HEAD", "A".repeat(40), "a".repeat(39)]) assert.throws(() => selectHistoryComparisonBase({ ...created(), head, githubSha: head }, noGit));
});
}
registerPolicyCases("shared", selectSharedHistoryComparisonBase);
registerPolicyCases("Disaster inline", selectDisasterHistoryComparisonBase);
