// Actual-module acceptance; all review/challenge actors and recording metadata
// constructed below are excluded fictional fixtures, never public ledger data.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, symlinkSync, unlinkSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { readLedgerInput } from "../src/lib/research-ledger-data.mjs";
import { captureEncyclopediaEntry, captureResearchEntry, captureResearchSource, ENCYCLOPEDIA_ADAPTER } from "../src/lib/research-ledger-capture.mjs";
import { prepareEncyclopediaCoverage, ENCYCLOPEDIA_INITIAL_PATHS, researchArchiveOptions, researchLedgerFiles } from "../src/lib/research-ledger-extension.mjs";
import { validateResearchLedger, projectResearchLedger, researchLedgerExport, canonicalResearchJson, researchObjectHash, researchSubjectHash } from "../src/lib/research-ledger-model.mjs";
import { rebuildPreparation, applyPreparedCoverage, assertPriorFiles, captureGitEnvironment, readEncyclopediaGit, assertSourceCaptureMetadata } from "./capture-encyclopedia-review-coverage.mjs";
import { initialSeedInput } from "../test-fixtures/research-ledger/initial-seed.mjs";
import { fixture, obj, source, version, event, repin, actor, fullAuth, review, ref, evidence } from "../test-fixtures/research-ledger/factory.mjs";

let groups = 0;
const check = (name, run) => { run(); groups++; console.log("✓ " + name); };
const prior = initialSeedInput(readLedgerInput());
const sourceFiles = ENCYCLOPEDIA_INITIAL_PATHS.map((path) => ({ path, rawText: readFileSync(path, "utf8") }));
// These are explicit fictional preparation metadata. No actual capture is written.
const settings = { sourceCommit: "f".repeat(40), captureAt: "2026-11-08T00:00:00.000Z",
  captureId: "capture:fictional-encyclopedia", editionId: "edition:fictional-encyclopedia", sourceFiles };
const prepare = (overrides = {}) => prepareEncyclopediaCoverage(prior, { ...settings, ...overrides });
const prepared = prepare();
function assembled(preparation) {
  const input = structuredClone(prior);
  input.manifest = JSON.parse(preparation.replacementManifest.text);
  for (const file of preparation.addedFiles) input[file.path.split("/")[0]].push(JSON.parse(file.text));
  for (const [key, value] of Object.entries(input)) if (Array.isArray(value)) value.sort((a, b) => a.id < b.id ? -1 : 1);
  return input;
}
const validate = (input) => validateResearchLedger(input, researchArchiveOptions(input));
const current = (input) => projectResearchLedger(validate(input), { editionId: input.manifest.currentEditionId });
const raw = (extra = "", body = "\nA fictional definition.\n") =>
  "---\ntitle: Fictional concept\nsummary: Fictional summary\n" + extra + "---\n" + body;
check("all 26 real encyclopedia sources have complete exact field/default/body profiles", () => {
  assert.equal(sourceFiles.length, 26);
  assert.equal(sourceFiles.reduce((sum, file) => sum + Buffer.byteLength(file.rawText), 0), 108688);
  for (const file of sourceFiles) {
    const captured = captureEncyclopediaEntry({ sourceKey: file.path.slice(12, -3), rawText: file.rawText });
    assert.equal(captured.declaredReview, "draft");
    assert.equal(captured.declaredProblemState, null);
    assert.deepEqual(Object.keys(captured.subject.frontmatter), ["title", "summary", "aliases", "conditions", "related", "sources"]);
    assert(Object.isFrozen(captured.subject.frontmatter));
    assert.equal(canonicalResearchJson(captured), canonicalResearchJson(captureResearchSource({ sourceKey: file.path.slice(12, -3), rawText: file.rawText })));
  }
});
check("the original capture profile remains closed and cannot reinterpret encyclopedia sources", () => {
  assert.throws(() => captureResearchEntry({ sourceKey: "encyclopedia/fictional", rawText: raw() }));
  assert.throws(() => captureEncyclopediaEntry({ sourceKey: "problems/fictional", rawText: raw() }));
});
check("absent arrays default, source properties normalize and BOM/CRLF/body stay exact", () => {
  const first = captureEncyclopediaEntry({ sourceKey: "encyclopedia/fictional", rawText: raw() });
  for (const key of ["aliases", "conditions", "related", "sources"]) assert.deepEqual(first.subject.frontmatter[key], []);
  const input = "\uFEFF" + raw("conditions: [measurement-gap]\nsources:\n  - title: Fictional source\n    url: https://example.invalid/source\n").replaceAll("\n", "\r\n");
  const captured = captureEncyclopediaEntry({ sourceKey: "encyclopedia/fictional", rawText: input });
  assert.equal(captured.subject.body, "\r\nA fictional definition.\r\n");
  assert.deepEqual(captured.subject.frontmatter.conditions, [{ collection: "conditions", id: "measurement-gap" }]);
  assert.deepEqual(captured.subject.frontmatter.sources[0], { title: "Fictional source", url: "https://example.invalid/source", publisher: null, year: null, note: null });
});
check("every substantive field changes identity while review-only compatibility does not", () => {
  const capture = (text) => captureEncyclopediaEntry({ sourceKey: "encyclopedia/fictional", rawText: text });
  const base = researchSubjectHash(capture(raw()).subject);
  for (const changed of [
    raw().replace("Fictional concept", "Changed concept"),
    raw().replace("Fictional summary", "Changed summary"),
    raw("aliases: [Another name]\n"), raw("conditions: [measurement-gap]\n"),
    raw("related: [/record/lexicon/#word]\n"),
    raw("sources:\n  - title: Fictional source\n    url: https://example.invalid/source\n"),
    raw("", "\nA changed fictional definition.\n"),
  ]) assert.notEqual(researchSubjectHash(capture(changed).subject), base);
  assert.equal(researchSubjectHash(capture(raw("review: reviewed\n")).subject), base);
  assert.notEqual(canonicalResearchJson(capture(raw("review: reviewed\n"))), canonicalResearchJson(capture(raw())));
  const ordered = capture(raw("aliases: [first, second]\n")).subject;
  assert.notEqual(researchSubjectHash(ordered), researchSubjectHash(capture(raw("aliases: [second, first]\n")).subject));
});
check("unknown/null/malformed YAML and route/container/size boundaries refuse", () => {
  const bad = [
    raw("status: live\n"), raw("title: Duplicate\n"), raw("aliases: null\n"),
    raw("conditions: [{}]\n"), raw("sources: null\n"), raw("review: null\n"), raw("aliases: [*missing]\n"),
    raw("sources:\n  - title: Fictional\n    url: https://example.invalid/source\n    publisher: null\n"),
    raw("aliases: &a [one]\nrelated: *a\n"), raw("<<: {}\n"),
    raw("aliases: [!custom value]\n"), raw("aliases: " + JSON.stringify(Array(21).fill("x")) + "\n"),
    raw().replace("Fictional summary", "x".repeat(4001)),
    raw("", "x".repeat(32769)),
  ];
  for (const route of ["//example.invalid/", "https://example.invalid/", "/a/../b/", "/a\\b/", "/a##b", "/%2e%2e/"])
    bad.push(raw("related: " + JSON.stringify([route]) + "\n"));
  for (const rawText of bad) assert.throws(() => captureEncyclopediaEntry({ sourceKey: "encyclopedia/fictional", rawText }));
});
check("complete preparation adds exactly one draft family without mutating old objects", () => {
  assert.deepEqual(prepared.counts, { records: 69, versions: 71, events: 69, reviews: 0, actors: 0, observations: 4, editions: 2, sources: 70 });
  assert.equal(prepared.addedFiles.length, 105);
  assert.equal(prepared.priorFiles.length, 181);
  const input = assembled(prepared), projection = current(input);
  assert.equal(projection.views.filter((view) => view.kind === "concept").length, 26);
  assert.equal(projection.edition.currentSources.length, 66);
  assert(projection.views.every((view) => view.qualification.sourceReview === "draft"));
  assert.equal(projection.counters.qualifyingResearchResults, 0);
  assert.equal(projection.counters.correctionArtifacts, 1);
  assert.equal(projection.counters.changedClaims, 2);
  const events = input.events.filter((value) => value.recordId.startsWith("concept:")).sort((a, b) => a.ordinal - b.ordinal);
  assert.deepEqual(events.map((value) => value.ordinal), Array.from({ length: 26 }, (_, i) => 44 + i));
  assert(events.every((value) => value.occurredAt === null && value.timeBasis === "undated" && value.recordedAt === settings.captureAt));
  const oldFiles = new Map(researchLedgerFiles(prior).map((file) => [file.path, file.text]));
  for (const file of researchLedgerFiles(input)) if (oldFiles.has(file.path) && file.path !== "manifest.json") assert.equal(file.text, oldFiles.get(file.path));
});
check("initial edition JSON, CSV, projection and exact pinned qualification stay identical", () => {
  const before = projectResearchLedger(validate(prior), { editionId: prior.manifest.currentEditionId });
  const after = projectResearchLedger(validate(assembled(prepared)), { editionId: prior.manifest.currentEditionId });
  assert.deepEqual(after, before);
  for (const format of ["json", "csv"]) assert.equal(researchLedgerExport(after, { format, eventIds: null }).text, researchLedgerExport(before, { format, eventIds: null }).text);
});
check("preparation is deterministic across input order and refuses incomplete/duplicate/stale coverage", () => {
  assert.deepEqual(prepare({ sourceFiles: [...sourceFiles].reverse() }), prepared);
  for (const sourceFiles of [settings.sourceFiles.slice(1), [...settings.sourceFiles.slice(1), settings.sourceFiles[1]],
    settings.sourceFiles.map((file, i) => i ? file : { ...file, path: "src/content/encyclopedia/nested/first.md" })])
    assert.throws(() => prepare({ sourceFiles }));
  assert.throws(() => prepare({ captureAt: prior.manifest.capture.at }));
  assert.throws(() => prepare({ sourceCommit: "main" }));
  assert.throws(() => prepare({ sourceFiles: sourceFiles.map((file, i) => i ? file : { ...file, rawText: file.rawText.replace("---\n", "---\nreview: reviewed\n") }) }));
});
check("profile downgrade and source/subject/hash drift cannot pass rehashed envelopes", () => {
  const input = assembled(prepared);
  input.versions.find((value) => value.recordId.startsWith("concept:")).adapterVersion = "research-content-v1";
  assert.throws(() => validate(repin(input, { capture: settings.captureAt })));
  const downgrade = assembled(prepared); downgrade.manifest.adapterVersion = "research-content-v1"; assert.throws(() => validate(downgrade));
  const hidden = assembled(prepared);
  hidden.manifest.adapterVersion = "research-content-v1";
  hidden.manifest.currentSources = structuredClone(prior.manifest.currentSources);
  hidden.manifest.coverage.includedSourceKeys = [...prior.manifest.coverage.includedSourceKeys];
  assert.throws(() => validate(repin(hidden, { capture: settings.captureAt })), /original manifest cannot carry/);
  const changed = assembled(prepared); changed.sources.find((value) => value.id.startsWith("source:encyclopedia-")).text += "\n";
  assert.throws(() => validate(changed));
  const mismatch = assembled(prepared); mismatch.versions.find((value) => value.recordId.startsWith("concept:")).subject.body += "changed";
  assert.throws(() => validate(repin(mismatch, { capture: settings.captureAt })));
});
function conceptFixture({ reviewed = false } = {}) {
  const input = fixture(), key = "encyclopedia/fictional", author = actor("concept-author"), reviewer = actor("concept-reviewer");
  const rawText = raw("review: draft\n"), snapshot = source("source:concept-draft", rawText, key);
  const v = obj({ ...version("concept:fictional", captureEncyclopediaEntry({ sourceKey: key, rawText }).subject,
    [{ sourceId: snapshot.id, selector: { kind: "entry" } }], fullAuth(author.id)), adapterVersion: ENCYCLOPEDIA_ADAPTER });
  input.records = [obj({ id: v.recordId, kind: "concept" })]; input.versions = [v]; input.sources = [snapshot]; input.events = [];
  input.actors = reviewed ? [author, reviewer] : [author]; input.manifest.adapterVersion = "research-content-v2"; input.manifest.coverage.includedSourceKeys = [key];
  input.manifest.currentSources = [{ sourceKey: key, recordId: v.recordId, sourceId: snapshot.id, currentVersion: ref(v), href: "/record/encyclopedia/fictional/" }];
  event(input, { type: "baseline", recordId: v.recordId, version: ref(v), initialProblemState: null });
  if (reviewed) {
    const r = review(v, "source-framing", reviewer.id, author.id, "concept-source"); input.reviews.push(r);
    event(input, { type: "review-recorded", recordId: v.recordId, reviewId: r.id });
    const compatible = source("source:concept-reviewed", rawText.replace("review: draft", "review: reviewed"), key);
    input.sources.push(compatible); input.manifest.currentSources[0].sourceId = compatible.id;
  }
  return repin(input);
}
check("fictional exact-source human declarations qualify only under existing gates", () => {
  const input = conceptFixture({ reviewed: true });
  assert.equal(current(input).views[0].qualification.sourceReview, "reviewed");
  assert.equal(current(input).views[0].qualification.peerReview, "not-applicable");
  for (const edit of [
    (v) => { v.reviews[0].independence = "unknown"; },
    (v) => { v.reviews[0].reviewerId = v.actors[0].id; },
    (v) => { v.versions[0].authorship.complete = false; },
    (v) => { v.reviews[0].inspection.decision = "unknown"; },
  ]) { const changed = conceptFixture({ reviewed: true }); edit(changed); assert.throws(() => validate(repin(changed))); }
});
check("a substantive new concept version and public review withdrawal revoke old qualification", () => {
  const input = conceptFixture({ reviewed: true }), before = input.versions[0], key = "encyclopedia/fictional";
  const changed = source("source:concept-corrected", raw("review: draft\n", "\nA corrected fictional definition.\n"), key);
  const after = obj({ ...version(before.recordId, captureEncyclopediaEntry({ sourceKey: key, rawText: changed.text }).subject,
    [{ sourceId: changed.id, selector: { kind: "entry" } }], before.authorship, 2, before.id), adapterVersion: ENCYCLOPEDIA_ADAPTER });
  input.sources.push(changed); input.versions.push(after);
  event(input, { type: "version-recorded", recordId: before.recordId, before: ref(before), after: ref(after) });
  input.manifest.currentSources[0].sourceId = changed.id; input.manifest.currentSources[0].currentVersion = ref(after);
  assert.equal(current(repin(input)).views[0].qualification.sourceReview, "draft");
  const withdrawn = conceptFixture({ reviewed: true });
  event(withdrawn, { type: "review-withdrawn", recordId: before.recordId, reviewId: withdrawn.reviews[0].id, replacementReviewId: null });
  const snapshot = source("source:concept-withdrawn", raw("review: draft\n"), key);
  withdrawn.sources.push(snapshot); withdrawn.manifest.currentSources[0].sourceId = snapshot.id;
  assert.equal(current(repin(withdrawn)).views[0].qualification.sourceReview, "draft");
});
check("fictional concept challenge, response and exact corrected version preserve dissent without a claim disposition", () => {
  const input = conceptFixture(), before = input.versions[0], key = "encyclopedia/fictional";
  const challenge = version("challenge:concept-scope", { type: "challenge", target: ref(before),
    title: "Fictional scope challenge", argument: "Fictional request to narrow the definition.", sources: [evidence], crux: "A fictional source distinction." });
  input.records.push(obj({ id: challenge.recordId, kind: "challenge" })); input.versions.push(challenge);
  event(input, { type: "baseline", recordId: challenge.recordId, version: ref(challenge), initialProblemState: null });
  event(input, { type: "response", recordId: challenge.recordId, challenge: ref(challenge), response: "Fictional response linking the next exact version.", dissent: ["Fictional disagreement retained."] });
  const snapshot = source("source:concept-response", raw("", "\nA narrowed fictional definition.\n"), key);
  const after = obj({ ...version(before.recordId, captureEncyclopediaEntry({ sourceKey: key, rawText: snapshot.text }).subject,
    [{ sourceId: snapshot.id, selector: { kind: "entry" } }], before.authorship, 2, before.id), adapterVersion: ENCYCLOPEDIA_ADAPTER });
  input.sources.push(snapshot); input.versions.push(after);
  event(input, { type: "version-recorded", recordId: before.recordId, before: ref(before), after: ref(after), reason: "Fictional source correction in response to the preserved challenge." });
  input.manifest.currentSources[0].sourceId = snapshot.id; input.manifest.currentSources[0].currentVersion = ref(after);
  const projection = current(repin(input));
  assert.equal(projection.counters.changedClaims, 0); assert.equal(projection.counters.correctionArtifacts, 0);
  assert.equal(projection.counters.qualifyingResearchResults, 0); assert.equal(projection.counters.unresolvedChallenges, 1);
  assert.equal(projection.graph.events.find((value) => value.type === "response").dissent[0], "Fictional disagreement retained.");
  event(input, { type: "challenge-disposition", recordId: challenge.recordId, challenge: ref(challenge),
    responseIds: [input.events.find((value) => value.type === "response").id], disposition: "corrected", resultingClaims: [ref(after)], dissent: [] });
  assert.throws(() => validate(repin(input)), /Resulting claim is not a claim/);
});
check("prepared derivation rejects altered hashes, payloads, old objects and unsupported extra files", () => {
  assert.deepEqual(rebuildPreparation(prior, prepared), prepared);
  for (const edit of [
    (p) => { p.addedFiles[0].text += "\n"; },
    (p) => { p.addedFiles[0].path = "../elsewhere.json"; },
    (p) => { p.replacementManifest.text += "\n"; },
    (p) => { p.priorFiles[0].sha256 = "0".repeat(64); },
    (p) => { p.checksum = "0".repeat(64); },
  ]) { const changed = structuredClone(prepared); edit(changed); assert.throws(() => rebuildPreparation(prior, changed)); }
});
function writePrior(dir) {
  for (const file of researchLedgerFiles(prior)) { mkdirSync(join(dir, file.path, ".."), { recursive: true }); writeFileSync(join(dir, file.path), file.text); }
}
const walk = (root, prefix = "") => readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(root, entry.name), prefix + entry.name + "/") : [prefix + entry.name]).sort();
check("explicit application writes only 105 new regular objects and replaces manifest last", () => {
  const dir = mkdtempSync(join(tmpdir(), "charitology-encyclopedia-apply-"));
  try {
    writePrior(dir); assertPriorFiles(prior, dir);
    assert.equal(applyPreparedCoverage(prior, prepared, dir).added, 105);
    assert.equal(walk(dir).length, 286);
    const input = readLedgerInput(dir); assert.deepEqual(current(input), current(assembled(prepared)));
    for (const file of researchLedgerFiles(prior)) if (file.path !== "manifest.json") assert.equal(readFileSync(join(dir, file.path), "utf8"), file.text);
    assert.throws(() => applyPreparedCoverage(prior, prepared, dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
check("stale historical bytes, orphaned output and symlink files refuse before application writes", () => {
  for (const mutation of ["changed", "orphan", "symlink"]) {
    const dir = mkdtempSync(join(tmpdir(), "charitology-encyclopedia-refuse-"));
    try {
      writePrior(dir);
      if (mutation === "changed") writeFileSync(join(dir, "manifest.json"), "{}");
      if (mutation === "orphan") writeFileSync(join(dir, prepared.addedFiles[0].path), prepared.addedFiles[0].text);
      if (mutation === "symlink") { rmSync(join(dir, "manifest.json")); symlinkSync(join(dir, researchLedgerFiles(prior).find((file) => file.path !== "manifest.json").path), join(dir, "manifest.json")); }
      const paths = walk(dir);
      assert.throws(() => applyPreparedCoverage(prior, prepared, dir));
      assert.deepEqual(walk(dir), paths);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
check("CLI refuses omitted explicit capture options before preparing or changing the real ledger", () => {
  const child = spawnSync(process.execPath, ["scripts/capture-encyclopedia-review-coverage.mjs"], { cwd: process.cwd(), encoding: "utf8", timeout: 20000, maxBuffer: 65536 });
  assert.notEqual(child.status, 0);
  assertPriorFiles(readLedgerInput(), "src/data/research-ledger");
});
+check("source commit time, exact final HEAD and all staged/working/untracked code gates stay explicit", () => {
  const metadata = { sourceCommit: "f".repeat(40), head: "f".repeat(40),
    committedAt: "2026-11-07T10:00:00-03:00", captureAt: "2026-11-07T13:00:00.000Z", worktreeStatus: "" };
  assert.equal(assertSourceCaptureMetadata(metadata).committedInstant, metadata.captureAt);
  assert.throws(() => assertSourceCaptureMetadata({ ...metadata, captureAt: "2026-11-07T12:59:59.999Z" }));
  assert.throws(() => assertSourceCaptureMetadata({ ...metadata, head: "a".repeat(40) }));
  for (const worktreeStatus of ["?? missing-required-source.mjs\n", "A  new-profile.mjs\n", " M runtime.mjs\n"])
    assert.throws(() => assertSourceCaptureMetadata({ ...metadata, worktreeStatus }));
  const env = captureGitEnvironment({ PATH: "/fixture-bin", GIT_DIR: "/not-the-repository", GIT_WORK_TREE: "/elsewhere",
    GIT_INDEX_FILE: "/fixture-index", GIT_CONFIG_COUNT: "1", GIT_SSH_COMMAND: "unwanted-fixture-command" });
  assert.deepEqual(env, { PATH: "/fixture-bin", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" });
});
check("actual missing promisor blob refuses without invoking even a local fetch helper", () => {
  const dir = mkdtempSync(join(tmpdir(), "charitology-encyclopedia-offline-git-"));
  const marker = join(dir, "fetch-marker");
  const env = { ...captureGitEnvironment(process.env), GIT_AUTHOR_NAME: "theguysaccount",
    GIT_AUTHOR_EMAIL: "35159900+theguysaccount@users.noreply.github.com", GIT_COMMITTER_NAME: "theguysaccount",
    GIT_COMMITTER_EMAIL: "35159900+theguysaccount@users.noreply.github.com" };
  const run = (args, options = {}) => execFileSync("git", ["-C", dir, "-c", "core.hooksPath=/dev/null", ...args],
    { env, stdio: ["ignore", "pipe", "pipe"], timeout: 20000, ...options });
  try {
    run(["init", "--quiet"]);
    writeFileSync(join(dir, "only.md"), "Fictional offline source fixture.\n");
    run(["add", "--", "only.md"]);
    run(["commit", "--quiet", "--no-gpg-sign", "-m", "Fictional isolated offline fixture", "-m", "Co-Authored-By: Codex <noreply@openai.com>"]);
    const head = run(["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const blob = run(["rev-parse", "HEAD:only.md"], { encoding: "utf8" }).trim();
    const helper = join(dir, "local-fetch-helper");
    assert(!/\s/.test(helper), "The fixture helper path must be unambiguous");
    writeFileSync(helper, '#!/bin/sh\nmarker="${0%/*}/fetch-marker"\nprintf "attempt\\n" > "$marker"\nexit 1\n');
    chmodSync(helper, 0o700);
    run(["config", "extensions.partialClone", "origin"]);
    run(["config", "remote.origin.promisor", "true"]);
    run(["config", "remote.origin.partialclonefilter", "blob:none"]);
    run(["config", "remote.origin.url", "ext::" + helper]);
    run(["config", "protocol.ext.allow", "always"]);
    unlinkSync(join(dir, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    assert.throws(() => readEncyclopediaGit(dir, ["show", head + ":only.md"]));
    assert.equal(existsSync(marker), false, "The guarded read must not invoke a lazy fetch");
    // Positive control invokes ONLY this local marker program. No network
    // endpoint exists; the helper returns failure without supplying any object.
    const unguarded = { ...env }; delete unguarded.GIT_NO_LAZY_FETCH;
    assert.throws(() => run(["show", head + ":only.md"], { env: unguarded }));
    assert.equal(existsSync(marker), true, "The fixture must demonstrate a real would-be lazy fetch");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
console.log(`Encyclopedia review coverage: ${groups} groups passed; original edition and human-review limits preserved. Preparation/review metadata above are fictional fixtures, not a published capture.`);
