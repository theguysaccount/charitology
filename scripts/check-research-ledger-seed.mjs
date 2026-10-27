// Checks the real inert seed without Git objects, a network or a build clock.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  BASELINE_COMMIT,
  BEFORE_COMMIT,
  AFTER_COMMIT,
  DATA_ROOT,
  HISTORICAL,
  INITIAL_EDITION_ID,
  assertWorkingMatchesBaseline,
  createInitialLedger,
  readLedgerInput,
  seedFiles,
  seedOptions,
  seedReport,
  writeInitialSeed,
} from "./capture-research-ledger.mjs";
import {
  readLedgerInput as readDataLedgerInput,
  DATA_ROOT as SHARED_DATA_ROOT,
  LEDGER_GROUPS as SHARED_LEDGER_GROUPS,
} from "../src/lib/research-ledger-data.mjs";
import { LEDGER_GROUPS as CLI_LEDGER_GROUPS } from "./capture-research-ledger.mjs";
import {
  LEDGER_LIMITS,
  canonicalResearchJson,
  researchObjectHash,
  researchSubjectHash,
  validateResearchLedger,
  projectResearchLedger,
  researchProgress,
  researchLedgerExport,
} from "../src/lib/research-ledger-model.mjs";
import {
  captureResearchEntry,
  captureResearchClaim,
  captureResearchSelector,
} from "../src/lib/research-ledger-capture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const input = readLedgerInput();
const graph = validateResearchLedger(
  input,
  seedOptions(input, { currentFiles: true }),
);
const projection = projectResearchLedger(graph, {
  editionId: INITIAL_EDITION_ID,
});
const edition = input.editions.find((entry) => entry.id === INITIAL_EDITION_ID);
const progress = researchProgress(graph, {
  editionId: INITIAL_EDITION_ID,
  ...edition.period,
});
const report = seedReport(input);
const sha = (value) => createHash("sha256").update(value).digest("hex");

if (process.argv.includes("--offline-summary")) {
  // The parent launches this with an empty tool PATH and different UTC clocks.
  Date.now = () => Number(process.env.LEDGER_TEST_CLOCK);
  const again = seedReport(readLedgerInput());
  console.log(JSON.stringify(again));
} else {
  let groups = 0;
  const check = (name, run) => {
    run();
    groups++;
    console.log(`✓ ${name}`);
  };
  const snapshot = (id) => input.sources.find((entry) => entry.id === id);
  const version = (recordId, number) =>
    input.versions.find(
      (entry) => entry.recordId === recordId && entry.version === number,
    );
  const options = () => seedOptions(input);
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      )
      .sort();

  check(
    "Exact public seed inventory has no reviewer, challenge or scientific disposition seed",
    () => {
      assert.deepEqual(report.counts, {
        records: 43,
        versions: 45,
        events: 43,
        reviews: 0,
        actors: 0,
        observations: 4,
        editions: 1,
        sources: 44,
      });
      const counts = Object.fromEntries(
        ["problem", "manuscript", "case", "method", "claim", "artifact"].map(
          (kind) => [
            kind,
            input.records.filter((entry) => entry.kind === kind).length,
          ],
        ),
      );
      assert.deepEqual(counts, {
        problem: 23,
        manuscript: 3,
        case: 13,
        method: 1,
        claim: 2,
        artifact: 1,
      });
      assert.equal(
        input.versions.filter((entry) => entry.subject.type === "artifact")
          .length,
        1,
      );
      assert.ok(
        input.versions.every(
          (entry) =>
            canonicalResearchJson(entry.authorship) ===
            canonicalResearchJson({
              state: "unknown",
              complete: false,
              actorIds: [],
              refs: [],
            }),
        ),
      );
      assert.ok(input.events.every((entry) => entry.actorIds.length === 0));
    },
  );
  check(
    "Forty current source files exactly match pinned UTF-8 bytes and current adapter output",
    () => {
      assert.equal(input.manifest.capture.commit, BASELINE_COMMIT);
      const actualKeys = ["problems", "journal", "cases"]
        .flatMap((collection) =>
          readdirSync(join(root, "src/content", collection))
            .filter((name) => name.endsWith(".md"))
            .map((name) => `${collection}/${name.slice(0, -3)}`),
        )
        .concat("record/methodology")
        .sort();
      assert.deepEqual(input.manifest.coverage.includedSourceKeys, actualKeys);
      assert.equal(input.manifest.currentSources.length, 40);
      let currentBytes = 0;
      for (const binding of input.manifest.currentSources) {
        const source = snapshot(binding.sourceId),
          raw = readFileSync(join(root, source.path));
        assert.equal(source.commit, BASELINE_COMMIT);
        assert.deepEqual(Buffer.from(source.text, "utf8"), raw);
        assert.equal(source.byteLength, raw.length);
        assert.equal(source.sha256, sha(raw));
        currentBytes += raw.length;
        const captured = captureResearchEntry({
          sourceKey: binding.sourceKey,
          rawText: source.text,
        });
        assert.deepEqual(
          captured.subject,
          version(binding.recordId, binding.currentVersion.version).subject,
        );
        assert.equal(captured.declaredReview, "draft");
      }
      assert.equal(currentBytes, 99558);
    },
  );
  check(
    "Historical PR sources preserve exact inspected before/after hashes and claim slices",
    () => {
      for (const item of HISTORICAL) {
        for (const [label, commit] of [
          ["before", BEFORE_COMMIT],
          ["after", AFTER_COMMIT],
        ]) {
          const source = snapshot(`source:pr-3-${label}-${item.suffix}`),
            number = label === "before" ? 1 : 2;
          assert.equal(source.commit, commit);
          assert.equal(source.sha256, item[label]);
          assert.equal(sha(Buffer.from(source.text, "utf8")), item[label]);
          const selector = captureResearchSelector({
            adapter: item.adapter,
            rawText: source.text,
          });
          assert.deepEqual(
            version(item.claimId, number).subject,
            captureResearchClaim({
              parentId: item.parentId,
              selector,
              rawText: source.text,
            }),
          );
          assert.deepEqual(version(item.claimId, number).sources, [
            { sourceId: source.id, selector },
          ]);
        }
        assert.equal(
          version(item.claimId, 2).previousId,
          version(item.claimId, 1).id,
        );
      }
      assert.match(
        version("claim:depth-census-knowledge", 1).subject.statement,
        /Nobody has checked\./,
      );
      assert.match(
        version("claim:depth-census-knowledge", 2).subject.statement,
        /Charitology has not established the current mix\./,
      );
      assert.equal(
        version("claim:ten-dollars-framing", 1).subject.context,
        null,
      );
      assert.match(
        version("claim:ten-dollars-framing", 2).subject.context,
        /^\*Editorial note:/,
      );
    },
  );
  check(
    "Poem calendar change is separate from historical claim correction and manuscript identity",
    () => {
      const before = snapshot("source:pr-3-before-ten-dollars"),
        after = snapshot("source:pr-3-after-ten-dollars"),
        current = snapshot("source:current-journal-ten-dollars");
      assert.equal(
        captureResearchEntry({
          sourceKey: "journal/ten-dollars",
          rawText: before.text,
        }).subject.frontmatter.date,
        "2026-10-26",
      );
      assert.equal(
        captureResearchEntry({
          sourceKey: "journal/ten-dollars",
          rawText: after.text,
        }).subject.frontmatter.date,
        "2026-10-26",
      );
      assert.equal(
        version("manuscript:ten-dollars", 1).subject.frontmatter.date,
        "2026-10-25",
      );
      assert.equal(
        current.sha256,
        "51c37101479c8357fd2d69e9e14483fa31dbd7d8661aa3f4e1fde2b32d0130df",
      );
      assert.notEqual(current.sha256, after.sha256);
      assert.deepEqual(
        captureResearchClaim({
          parentId: "manuscript:ten-dollars",
          selector: captureResearchSelector({
            adapter: "ten-dollars-framing-v1",
            rawText: current.text,
          }),
          rawText: current.text,
        }),
        version("claim:ten-dollars-framing", 2).subject,
      );
      assert.deepEqual(input.manifest.aliases, [
        {
          sourceKey: "manifesto/ten-dollars",
          recordId: "manuscript:ten-dollars",
          href: "/manifesto/",
        },
      ]);
    },
  );
  check(
    "Forty current baselines, two after-claim baselines and one genuine editorial event",
    () => {
      const events = [...input.events].sort((a, b) => a.ordinal - b.ordinal);
      assert.ok(
        events
          .slice(0, 40)
          .every(
            (entry) =>
              entry.type === "baseline" && !entry.recordId.startsWith("claim:"),
          ),
      );
      assert.ok(
        events
          .slice(40, 42)
          .every(
            (entry) =>
              entry.type === "baseline" &&
              entry.version.version === 2 &&
              entry.recordId.startsWith("claim:"),
          ),
      );
      assert.ok(
        events
          .slice(0, 42)
          .every(
            (entry) =>
              entry.occurredAt === null && entry.timeBasis === "undated",
          ),
      );
      const event = events[42];
      assert.equal(event.type, "artifact-recorded");
      assert.equal(event.occurredAt, "2026-10-26T05:24:43.000Z");
      assert.equal(event.timeBasis, "pr-merge");
      assert.deepEqual(event.challengeIds, []);
      assert.equal(event.changes.length, 2);
      assert.equal(
        version(event.recordId, 1).subject.kind,
        "editorial-correction",
      );
      assert.equal(
        version(event.recordId, 1).subject.finding,
        "not-applicable",
      );
      assert.ok(
        events.every((entry) => entry.recordedAt === input.manifest.capture.at),
      );
      assert.deepEqual(
        events.map((entry) => entry.ordinal),
        Array.from({ length: 43 }, (_, index) => index + 1),
      );
    },
  );
  check(
    "Only the four approved public GitHub facts enter observation records",
    () => {
      assert.deepEqual(
        input.observations.map((entry) => entry.id).sort(),
        [
          "observation:pr-15",
          "observation:pr-3",
          "observation:pr-3-reviews",
          "observation:review-call-1",
        ].sort(),
      );
      const pr = input.observations.find(
        (entry) => entry.id === "observation:pr-3",
      );
      assert.deepEqual(pr.facts, {
        number: 3,
        state: "closed",
        draft: false,
        base: BEFORE_COMMIT,
        head: AFTER_COMMIT,
        mergeCommit: "3a57d24acc6efd4eb3ae60c59da36ea17c023fb9",
        mergedAt: "2026-10-26T05:24:43.000Z",
      });
      assert.deepEqual(
        input.observations.find(
          (entry) => entry.id === "observation:pr-3-reviews",
        ).facts.reviewIds,
        [],
      );
      assert.equal(
        input.observations.find((entry) => entry.id === "observation:pr-15")
          .facts.mergeCommit,
        BASELINE_COMMIT,
      );
      assert.deepEqual(
        input.observations.find(
          (entry) => entry.id === "observation:review-call-1",
        ).facts,
        { number: 1, state: "open", commentCount: 0 },
      );
      for (const value of input.observations) {
        assert.deepEqual(Object.keys(value).sort(), [
          "facts",
          "hash",
          "id",
          "kind",
          "observedAt",
          "url",
        ]);
        assert.equal(value.observedAt, "2026-10-27T08:20:16.587Z");
      }
    },
  );
  check(
    "Edition pins are sorted full closure and source pins use enclosing object hashes",
    () => {
      for (const [group, pins] of [
        ["records", "recordPins"],
        ["versions", "versionPins"],
        ["events", "eventPins"],
        ["reviews", "reviewPins"],
        ["actors", "actorPins"],
        ["observations", "observationPins"],
        ["sources", "sourcePins"],
      ]) {
        const expected = input[group]
          .map(({ id, hash }) => ({ id, hash }))
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        assert.deepEqual(edition[pins], expected);
      }
      for (const pin of edition.sourcePins) {
        assert.equal(pin.hash, snapshot(pin.id).hash);
        assert.notEqual(pin.hash, snapshot(pin.id).sha256);
      }
      assert.equal(edition.heads.length, 43);
      assert.equal(
        new Set(edition.heads.map((entry) => entry.recordId)).size,
        43,
      );
      assert.equal(edition.hash, researchObjectHash(edition));
    },
  );
  check(
    "Current drafts/open problems stay distinct from unknown January coverage and dated correction",
    () => {
      assert.deepEqual(projection.counters, {
        records: 43,
        versions: 45,
        events: 43,
        reviews: 0,
        qualifiedSourceReviews: 0,
        peerReviewedManuscripts: 0,
        qualifyingResearchResults: 0,
        correctionArtifacts: 1,
        changedClaims: 2,
        open: 23,
        partial: 0,
        solved: 0,
        underReview: 0,
        unresolvedChallenges: 0,
      });
      assert.ok(
        projection.views.every(
          (entry) => entry.qualification.sourceReview === "draft",
        ),
      );
      assert.ok(
        projection.views
          .filter((entry) => entry.kind === "manuscript")
          .every(
            (entry) => entry.qualification.peerReview === "not-peer-reviewed",
          ),
      );
      assert.equal(progress.coverage.baselineKnownFrom, null);
      assert.ok(
        progress.startingStates.every((entry) => entry.status === null),
      );
      assert.ok(
        progress.endingStates.every((entry) => entry.status === "open"),
      );
      assert.equal(progress.editorialCorrections.length, 1);
      assert.equal(progress.changedClaimIds.length, 2);
      assert.deepEqual(progress.dispositionsRecorded, []);
      assert.equal(progress.undatedEvents.length, 42);
      assert.equal(progress.lateBackfills.length, 1);
    },
  );
  check(
    "Complete canonical input and lossless JSON export fit actual 5 MiB/8 MiB admission",
    () => {
      assert.ok(report.canonicalInputBytes <= LEDGER_LIMITS.inputBytes);
      assert.ok(report.exportBytes <= LEDGER_LIMITS.exportBytes);
      const exported = researchLedgerExport(projection, {
        format: "json",
        eventIds: null,
      });
      const parsed = JSON.parse(exported.text),
        { checksum, ...payload } = parsed;
      assert.equal(checksum, sha(canonicalResearchJson(payload)));
      assert.deepEqual(parsed.data, projection);
      assert.equal(Buffer.byteLength(exported.text), report.exportBytes);
      assert.equal(exported.text, canonicalResearchJson(parsed) + "\n");
      assert.equal(Object.hasOwn(parsed, "exportedAt"), false);
      const csv = researchLedgerExport(projection, {
        format: "csv",
        eventIds: [],
      });
      assert.equal(csv.metadata.selectedCount, 0);
      assert.equal(csv.metadata.omittedCount, 43);
      assert.match(csv.text, /"metadata"/);
      assert.throws(() =>
        researchLedgerExport(projection, { format: "json", eventIds: [] }),
      );
    },
  );
  check(
    "Initial seed exactly regenerates from retained snapshots without historical Git objects",
    () => {
      const sources = new Map(
        input.sources.map((entry) => [
          `${entry.commit}:${entry.path}`,
          Buffer.from(entry.text, "utf8"),
        ]),
      );
      const regenerated = createInitialLedger({
        captureAt: input.manifest.capture.at,
        baselineCommit: BASELINE_COMMIT,
        observations: input.observations,
        paths: input.manifest.currentSources
          .map((entry) => `src/content/${entry.sourceKey}.md`)
          .sort(),
        readSource: (commit, path) => {
          const raw = sources.get(`${commit}:${path}`);
          assert.ok(raw);
          return raw;
        },
      });
      assert.equal(
        canonicalResearchJson(regenerated),
        canonicalResearchJson(input),
      );
      assert.deepEqual(seedReport(regenerated), report);
    },
  );
  check(
    "The write preflight proves every covered byte against the committed baseline",
    () => {
      const sources = new Map(
        input.manifest.currentSources.map((binding) => {
          const source = snapshot(binding.sourceId);
          return [source.path, Buffer.from(source.text, "utf8")];
        }),
      );
      const touched = [];
      const readCommitted = (commit, path) => {
        assert.equal(commit, BASELINE_COMMIT);
        touched.push(path);
        return sources.get(path);
      };
      assertWorkingMatchesBaseline(input, {
        readWorking: (path) => readFileSync(join(root, path)),
        readCommitted,
      });
      assert.equal(touched.length, 40);
      assert.equal(new Set(touched).size, 40);
      const changed = input.manifest.currentSources[39],
        changedPath = snapshot(changed.sourceId).path;
      assert.throws(
        () =>
          assertWorkingMatchesBaseline(input, {
            readWorking: (path) =>
              path === changedPath
                ? Buffer.concat([sources.get(path), Buffer.from("\n")])
                : sources.get(path),
            readCommitted,
          }),
        /Working source differs from committed baseline/,
      );
      const altered = structuredClone(input);
      altered.sources.find((entry) => entry.id === changed.sourceId).text +=
        "\n";
      assert.throws(
        () =>
          assertWorkingMatchesBaseline(altered, {
            readWorking: (path) => sources.get(path),
            readCommitted,
          }),
        /Captured source differs from committed baseline/,
      );
    },
  );
  check(
    "File-per-object outputs are exact and immutable replacement refusal is all-before-write",
    () => {
      const expected = seedFiles(input),
        actual = walk(DATA_ROOT)
          .map((path) => path.slice(DATA_ROOT.length + 1))
          .sort();
      assert.deepEqual(actual, [...expected.keys()].sort());
      assert.equal(expected.size, 181);
      for (const [path, bytes] of expected)
        assert.equal(readFileSync(join(DATA_ROOT, path), "utf8"), bytes);
      const dir = mkdtempSync(join(tmpdir(), "charitology-ledger-write-"));
      try {
        assert.equal(writeInitialSeed(input, dir), 181);
        assert.equal(writeInitialSeed(input, dir), 181);
        assert.equal(
          canonicalResearchJson(readLedgerInput(dir)),
          canonicalResearchJson(input),
        );
        const extra = join(dir, "sources/unregistered.json");
        writeFileSync(extra, "{}");
        const withExtra = walk(dir).map((path) => [
          path,
          sha(readFileSync(path)),
        ]);
        assert.throws(
          () => writeInitialSeed(input, dir),
          /Refusing to ignore an existing ledger output/,
        );
        assert.deepEqual(
          walk(dir).map((path) => [path, sha(readFileSync(path))]),
          withExtra,
        );
        rmSync(extra);
        writeFileSync(join(dir, "manifest.json"), "protected-existing-capture");
        const before = walk(dir).map((path) => [path, sha(readFileSync(path))]);
        assert.throws(
          () => writeInitialSeed(input, dir),
          /Refusing to replace/,
        );
        assert.deepEqual(
          walk(dir).map((path) => [path, sha(readFileSync(path))]),
          before,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
  check(
    "Read-only file loader refuses oversized, malformed UTF-8 and symbolic-link JSON before parsing",
    () => {
      assert.equal(readLedgerInput, readDataLedgerInput);
      assert.equal(DATA_ROOT, SHARED_DATA_ROOT);
      assert.equal(CLI_LEDGER_GROUPS, SHARED_LEDGER_GROUPS);
      assert.ok(Object.isFrozen(SHARED_LEDGER_GROUPS));
      const dir = mkdtempSync(join(tmpdir(), "charitology-ledger-read-"));
      const path = join(dir, "manifest.json");
      try {
        writeFileSync(path, JSON.stringify(input.manifest));
        const absent = readDataLedgerInput(dir);
        for (const group of SHARED_LEDGER_GROUPS)
          assert.deepEqual(absent[group], []);
        assert.throws(() => validateResearchLedger(absent, options()));
        writeFileSync(join(dir, "unexpected.json"), "{}");
        assert.throws(
          () => readDataLedgerInput(dir),
          /Unknown ledger input path/,
        );
        rmSync(join(dir, "unexpected.json"));
        mkdirSync(join(dir, "reviews"));
        writeFileSync(join(dir, "reviews/.gitkeep"), "");
        assert.throws(
          () => readDataLedgerInput(dir),
          /Unknown reviews input file/,
        );
        rmSync(join(dir, "reviews/.gitkeep"));
        rmSync(join(dir, "reviews"), { recursive: true });
        symlinkSync(join(DATA_ROOT, "sources"), join(dir, "actors"));
        assert.throws(
          () => readDataLedgerInput(dir),
          /regular actors data directory/,
        );
        rmSync(join(dir, "actors"));
        writeFileSync(path, Buffer.alloc(LEDGER_LIMITS.exportBytes + 1, 0x20));
        assert.throws(() => readLedgerInput(dir), /bounded regular JSON/);
        writeFileSync(path, Buffer.from([0x22, 0xff, 0x22]));
        assert.throws(() => readLedgerInput(dir), TypeError);
        rmSync(path);
        symlinkSync(join(DATA_ROOT, "manifest.json"), path);
        assert.throws(() => readLedgerInput(dir), /bounded regular JSON/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
  check(
    "Real-source byte tampering and raw-hash substitution in edition pins fail",
    () => {
      const altered = structuredClone(input);
      altered.sources[0].text += "tamper";
      assert.throws(() => validateResearchLedger(altered, options()));
      const pins = structuredClone(input);
      pins.editions[0].sourcePins[0].hash = snapshot(
        pins.editions[0].sourcePins[0].id,
      ).sha256;
      pins.editions[0].hash = researchObjectHash(pins.editions[0]);
      assert.throws(() => validateResearchLedger(pins, options()));
    },
  );
  check(
    "Offline/two-clock/time-zone validation is byte-identical and CLI writes require explicit source ref",
    () => {
      for (const [TZ, clock] of [
        ["Pacific/Honolulu", "1"],
        ["Asia/Tokyo", "4102444800000"],
      ]) {
        const child = spawnSync(
          process.execPath,
          [fileURLToPath(import.meta.url), "--offline-summary"],
          {
            cwd: root,
            env: {
              ...process.env,
              PATH: "/no-git-or-tools",
              TZ,
              LEDGER_TEST_CLOCK: clock,
            },
            encoding: "utf8",
            timeout: 20_000,
            maxBuffer: 65536,
          },
        );
        assert.equal(child.status, 0, child.stderr);
        assert.deepEqual(JSON.parse(child.stdout), report);
      }
      const before = walk(DATA_ROOT).map((path) => [
        path,
        sha(readFileSync(path)),
      ]);
      const child = spawnSync(
        process.execPath,
        [join(root, "scripts/capture-research-ledger.mjs"), "--write"],
        {
          cwd: root,
          env: { ...process.env, PATH: "/no-git-or-tools" },
          encoding: "utf8",
          timeout: 20_000,
          maxBuffer: 65536,
        },
      );
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /requires explicit committed --baseline-ref/);
      assert.deepEqual(
        walk(DATA_ROOT).map((path) => [path, sha(readFileSync(path))]),
        before,
      );
    },
  );
  console.log(
    `Research ledger real seed: ${groups} groups passed; ${report.canonicalInputBytes} input bytes, ${report.exportBytes} complete export bytes; 0 qualifying research/review/disposition records.`,
  );
}
