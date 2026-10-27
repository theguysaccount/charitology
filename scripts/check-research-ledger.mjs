import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "../src/lib/research-ledger-model.mjs";
import {
  captureResearchEntry,
  captureResearchSelector,
  captureResearchClaim,
} from "../src/lib/research-ledger-capture.mjs";
import {
  fixture,
  options,
  repin,
  scientificFixture,
  event,
  actor,
  obj,
  ref,
  review,
  setCompatibility,
  evidence,
  at,
  rawProblem,
  source,
  version,
  fullAuth,
  journalFixture,
  challengeFixture,
} from "../test-fixtures/research-ledger/factory.mjs";
let count = 0;
function check(label, fn) {
  fn();
  count++;
  console.log("✓ " + label);
}
function reject(fn, code) {
  assert.throws(
    fn,
    (e) => e instanceof m.LedgerError && (!code || e.code === code),
  );
}
const valid = (input) => m.validateResearchLedger(input, options(input)),
  project = (g, id = g.manifest.currentEditionId) =>
    m.projectResearchLedger(g, { editionId: id });
check(
  "all40 actual current sources capture with exact schema/default/body boundaries",
  () => {
    let n = 0;
    for (const collection of ["problems", "journal", "cases"])
      for (const f of readdirSync(`src/content/${collection}`).filter((x) =>
        x.endsWith(".md"),
      )) {
        const c = captureResearchEntry({
          sourceKey: `${collection}/${f.slice(0, -3)}`,
          rawText: readFileSync(`src/content/${collection}/${f}`, "utf8"),
        });
        assert.equal(c.declaredReview, "draft");
        n++;
      }
    captureResearchEntry({
      sourceKey: "record/methodology",
      rawText: readFileSync("src/content/record/methodology.md", "utf8"),
    });
    assert.equal(n + 1, 40);
  },
);
check(
  "compatibility fields alone avoid the subject-hash cycle; body/source/date edits do not",
  () => {
    const a = captureResearchEntry({
        sourceKey: "problems/fictional",
        rawText: rawProblem(),
      }),
      b = captureResearchEntry({
        sourceKey: "problems/fictional",
        rawText: rawProblem("solved", "reviewed"),
      });
    assert.equal(
      m.researchSubjectHash(a.subject),
      m.researchSubjectHash(b.subject),
    );
    const c = captureResearchEntry({
      sourceKey: "problems/fictional",
      rawText: rawProblem(
        "open",
        "draft",
        "Literal review: reviewed in substantive body.",
      ),
    });
    assert.notEqual(
      m.researchSubjectHash(a.subject),
      m.researchSubjectHash(c.subject),
    );
  },
);
check(
  "YAML duplicate/merge/unknown/custom/alias/depth inputs fail without source execution",
  () => {
    for (const raw of [
      rawProblem().replace("number: 1", "number: 1\nnumber: 2"),
      rawProblem().replace("number: 1", "number: 1\nunknown: x"),
      rawProblem().replace("number: 1", "number: 1\n<<: {title: other}"),
      rawProblem().replace(
        "title: Fictional problem",
        "title: !!js/function 'function(){}'",
      ),
      rawProblem().replace(
        "number: 1",
        "number: 1\nconditions: &a [x]\nsources: *a",
      ),
    ])
      reject(() =>
        captureResearchEntry({ sourceKey: "problems/fictional", rawText: raw }),
      );
    reject(
      () =>
        captureResearchEntry({
          sourceKey: "record/other",
          rawText: rawProblem(),
        }),
      "source",
    );
  },
);
check(
  "frozen exact selectors capture the real historical correction without creating reviews",
  () => {
    for (const [key, adapter, parent] of [
      [
        "problems/the-depth-census",
        "depth-census-knowledge-v1",
        "problem:the-depth-census",
      ],
      [
        "journal/ten-dollars",
        "ten-dollars-framing-v1",
        "manuscript:ten-dollars",
      ],
    ]) {
      const raw = readFileSync(`src/content/${key}.md`, "utf8"),
        s = captureResearchSelector({ adapter, rawText: raw }),
        c = captureResearchClaim({
          parentId: parent,
          selector: s,
          rawText: raw,
        });
      assert.equal(c.type, "claim");
      reject(
        () =>
          captureResearchClaim({
            parentId: parent,
            selector: { ...s, bodyExcerpt: "Unrelated invented text" },
            rawText: raw,
          }),
        "source",
      );
    }
  },
);
check(
  "draft baseline projection/progress/export are deterministic and January coverage is unknown",
  () => {
    const input = fixture(),
      g = valid(input),
      p = project(g),
      progress = m.researchProgress(g, {
        editionId: g.manifest.currentEditionId,
        from: "2026-01-01T00:00:00.000Z",
        to: at,
      });
    assert.equal(p.counters.open, 1);
    assert.equal(p.counters.qualifyingResearchResults, 0);
    assert.equal(progress.startingStates[0].status, null);
    assert.equal(progress.counters.dispositionsRecorded, 0);
    assert.equal(
      m.researchLedgerExport(p, { format: "json", eventIds: null }).text,
      m.researchLedgerExport(project(g), { format: "json", eventIds: null })
        .text,
    );
    assert.ok(
      m
        .researchLedgerExport(p, { format: "csv", eventIds: [] })
        .text.includes('"metadata"'),
    );
  },
);
check(
  "rehashed raw-byte/substantive projection drift and uncovered-reviewed flips fail",
  () => {
    let input = fixture();
    input.sources[0].text += "Changed";
    input = repin(input);
    reject(() => valid(input), "hash");
    input = fixture();
    input.versions[0].subject.body += "Changed";
    input.versions[0].subjectHash = m.researchSubjectHash(
      input.versions[0].subject,
    );
    input.events[0].version = ref(input.versions[0]);
    input.manifest.currentSources[0].currentVersion = ref(input.versions[0]);
    input = repin(input);
    reject(() => valid(input), "source");
    const good = fixture(),
      o = options(good);
    o.uncoveredReviews = [
      { sourceKey: "traditions/unregistered", review: "reviewed" },
    ];
    reject(() => m.validateResearchLedger(good, o), "qualification");
  },
);
check(
  "baseline cannot mint solved status and graph/ordinal/pin tampering fail closed",
  () => {
    const input = fixture();
    input.events[0].initialProblemState = "solved";
    repin(input);
    reject(() => valid(input));
    for (const mutate of [
      (g) => (g.events[0].ordinal = 2),
      (g) => (g.editions[0].sourcePins = []),
      (g) => (g.versions[0].previousId = g.versions[0].id),
    ]) {
      const bad = fixture();
      mutate(bad);
      for (const key of ["events", "versions", "editions"])
        bad[key] = bad[key].map(obj);
      reject(() => valid(bad));
    }
  },
);
check(
  "synthetic two-human theoretical research/disposition qualifies with no empirical claim",
  () => {
    const input = scientificFixture(),
      p = project(valid(input));
    assert.equal(p.counters.solved, 1);
    assert.equal(p.counters.qualifyingResearchResults, 1);
    assert.equal(
      p.graph.versions.find((v) => v.recordId === "artifact:fictional-result")
        .subject.kind,
      "theoretical-result",
    );
    assert.equal(p.counters.qualifiedSourceReviews, 0);
  },
);
check(
  "same-person/self/conflicted/unknown/wrong-version/scientifically-ineligible review paths refuse disposition",
  () => {
    for (const change of [
      (g) => (g.reviews[1].reviewerId = g.reviews[0].reviewerId),
      (g) => (g.reviews[0].reviewerId = "actor:author"),
      (g) =>
        (g.reviews[0].conflicts = { state: "unknown", note: null, refs: [] }),
      (g) => (g.reviews[0].independence = "unknown"),
      (g) => (g.reviews[0].occurredAt = null),
      (g) => (g.reviews[0].subject = { ...g.reviews[0].subject, version: 99 }),
      (g) =>
        (g.versions.find(
          (v) => v.recordId === "artifact:fictional-result",
        ).subject.kind = "editorial-correction"),
    ]) {
      const bad = scientificFixture();
      change(bad);
      repin(bad);
      reject(() => valid(bad));
    }
  },
);
check(
  "review withdrawal publishes immediately as under-review and preserves previous edition bytes",
  () => {
    const input = scientificFixture(),
      before = valid(input),
      oldId = input.manifest.currentEditionId,
      old = m.researchLedgerExport(project(before), {
        format: "json",
        eventIds: null,
      }).text;
    event(input, {
      type: "review-withdrawn",
      recordId: "artifact:fictional-result",
      reviewId: input.reviews[0].id,
      replacementReviewId: null,
      occurredAt: "2026-10-27T08:45:00.000Z",
      timeBasis: "public-decision",
    });
    setCompatibility(input, "under-review", "draft", "withdrawn");
    repin(input, { newEditionId: "edition:fictional-two" });
    const g = valid(input),
      p = project(g);
    assert.equal(p.counters.underReview, 1);
    assert.equal(p.problemStates[0].lastRecordedStatus, "solved");
    assert.equal(p.problemStates[0].support, "withdrawn");
    assert.equal(
      m.researchLedgerExport(project(g, oldId), {
        format: "json",
        eventIds: null,
      }).text,
      old,
    );
    const progress = m.researchProgress(g, {
      editionId: g.manifest.currentEditionId,
      from: "2026-01-01T00:00:00.000Z",
      to: at,
    });
    assert.equal(progress.dispositionsRecorded.length, 1);
    assert.equal(progress.currentlySupportedDispositionIds.length, 0);
    assert.equal(progress.supportWithdrawals.length, 1);
  },
);
check(
  "late alias identity evidence alone invalidates current support without rewriting earlier eligibility",
  () => {
    const input = scientificFixture(),
      old = valid(input),
      oldId = input.manifest.currentEditionId,
      oldHash = project(old).factualHash,
      alias = obj({
        ...actor("linked-human"),
        aliases: ["actor:researcher", "actor:disposition-reviewer"],
      });
    input.actors.push(alias);
    const comment = review(
      input.versions.find((v) => v.recordId === "artifact:fictional-result"),
      "research",
      alias.id,
      "actor:author",
      "alias-evidence",
    );
    comment.disposition = "comment";
    input.reviews.push(obj(comment));
    event(input, {
      type: "review-recorded",
      recordId: "artifact:fictional-result",
      reviewId: comment.id,
    });
    setCompatibility(input, "under-review", "draft", "alias");
    repin(input, { newEditionId: "edition:fictional-alias" });
    const g = valid(input);
    assert.equal(project(g).counters.underReview, 1);
    assert.equal(project(g).problemStates[0].support, "ineligible");
    assert.equal(project(g, oldId).factualHash, oldHash);
    assert.equal(
      m.researchProgress(g, {
        editionId: g.manifest.currentEditionId,
        from: "2026-01-01T00:00:00.000Z",
        to: at,
      }).dispositionsRecorded.length,
      1,
    );
  },
);
check("unused alias actor cannot silently become edition authority", () => {
  const input = scientificFixture();
  input.actors.push(
    obj({ ...actor("unused-alias"), aliases: ["actor:researcher"] }),
  );
  repin(input);
  reject(() => valid(input), "chain");
});
check(
  "CSV neutralizes formula-leading strings and JSON remains lossless; route IDs encode once",
  () => {
    const input = fixture();
    input.events[0].reason = "  =SUM(1,2)\n<svg>fictional</svg>";
    repin(input);
    const p = project(valid(input)),
      csv = m.researchLedgerExport(p, { format: "csv", eventIds: null }).text,
      json = m.researchLedgerExport(p, { format: "json", eventIds: null }).text;
    assert.ok(csv.includes("'  =SUM"));
    assert.equal(
      JSON.parse(json).data.graph.events[0].reason,
      input.events[0].reason,
    );
    assert.equal(
      m.ledgerHref("problem:fictional", 1),
      "/research-ledger/problem%3Afictional/#version-1",
    );
    reject(() => m.ledgerHref("../bad"));
  },
);
check(
  "journal peer-review needs two distinct eligible people beyond ordinary source review",
  () => {
    const input = journalFixture(),
      p = project(valid(input));
    assert.equal(p.views[0].qualification.sourceReview, "reviewed");
    assert.equal(p.views[0].qualification.peerReview, "peer-reviewed");
    const bad = journalFixture();
    bad.reviews[2].reviewerId = bad.reviews[1].reviewerId;
    bad.actors = bad.actors.filter((a) => a.id !== "actor:journal-reviewer-b");
    repin(bad);
    assert.equal(
      project(valid(bad)).views[0].qualification.peerReview,
      "not-peer-reviewed",
    );
  },
);
check(
  "challenge response, correction and retained dissent never manufacture scientific progress",
  () => {
    const p = project(valid(challengeFixture()));
    assert.equal(p.counters.correctionArtifacts, 1);
    assert.equal(p.counters.changedClaims, 1);
    assert.equal(p.counters.qualifyingResearchResults, 0);
    assert.equal(p.counters.unresolvedChallenges, 0);
    assert.ok(JSON.stringify(p).includes("Fictional dissent retained"));
    const bad = challengeFixture();
    bad.events.at(-1).responseIds = [];
    repin(bad);
    reject(() => valid(bad));
  },
);
check(
  "current-source semantic edit invalidates old whole-entry review without erasing it",
  () => {
    const input = journalFixture(),
      oldVersion = input.versions[0],
      oldId = input.manifest.currentEditionId,
      old = valid(input),
      raw = input.sources
        .at(-1)
        .text.replace("review: reviewed", "review: draft")
        .replace(
          "No real research or reviews.",
          "Changed fictional substantive body.",
        ),
      s = source("source:journal-amended", raw, "journal/fictional"),
      v = version(
        oldVersion.recordId,
        captureResearchEntry({ sourceKey: "journal/fictional", rawText: raw })
          .subject,
        [{ sourceId: s.id, selector: { kind: "entry" } }],
        oldVersion.authorship,
        2,
        oldVersion.id,
      );
    input.sources.push(s);
    input.versions.push(v);
    event(input, {
      type: "version-recorded",
      recordId: v.recordId,
      before: ref(oldVersion),
      after: ref(v),
    });
    input.manifest.currentSources[0].sourceId = s.id;
    input.manifest.currentSources[0].currentVersion = ref(v);
    repin(input, { newEditionId: "edition:journal-amendment" });
    const g = valid(input);
    assert.equal(project(g).views[0].qualification.sourceReview, "draft");
    assert.equal(
      project(g, oldId).views[0].qualification.peerReview,
      "peer-reviewed",
    );
    assert.equal(project(g).graph.reviews.length, 3);
  },
);
check(
  "metadata-only Git anchors cannot assert differing bytes for one commit/path",
  () => {
    const input = fixture(),
      copy = source(
        "source:contradictory",
        rawProblem("open", "draft", "Different bytes"),
      );
    copy.commit = input.sources[0].commit;
    input.sources.push(obj(copy));
    repin(input);
    reject(() => valid(input), "source");
  },
);
check(
  "unsafe URLs, bad calendar instants and sparse/nonfinite/prototype JSON never coerce",
  () => {
    for (const url of [
      "javascript:alert(1)",
      "https://user:password@example.invalid/",
      "https://example.invalid/\nsecret",
    ]) {
      const bad = scientificFixture();
      bad.reviews[0].statementRefs[0].url = url;
      repin(bad);
      reject(() => valid(bad));
    }
    for (const value of [
      Array(1),
      { n: Infinity },
      JSON.parse('{"__proto__":{}}'),
    ])
      reject(() => m.canonicalResearchJson(value));
    const bad = fixture();
    bad.events[0].recordedAt = "2026-02-30T10:00:00.000Z";
    repin(bad);
    reject(() => valid(bad));
  },
);
check(
  "input source/count/complete5MiB refusal precedes graph admission and preserves caller data",
  () => {
    const input = fixture(),
      before = m.canonicalResearchJson(input);
    const huge = fixture();
    huge.sources[0].text = "x".repeat(131073);
    reject(() => m.validateResearchLedger(huge, options(input)), "limit");
    const total = fixture();
    for (let i = 0; i < 28; i++)
      total.observations.push({
        id: `observation:oversized-${i}`,
        kind: "github-review-list",
        url: "https://example.invalid/oversized",
        observedAt: at,
        facts: {
          prNumber: 1,
          reviewIds: Array.from({ length: 2000 }, (_, n) =>
            String(n).padEnd(100, "x"),
          ),
        },
        hash: "0".repeat(64),
      });
    assert.ok(
      Buffer.byteLength(m.canonicalResearchJson(total)) >
        m.LEDGER_LIMITS.inputBytes,
    );
    reject(() => valid(total), "limit");
    const tooMany = fixture();
    tooMany.records = Array.from({ length: 1001 }, (_, i) =>
      obj({ id: `problem:count-${i}`, kind: "problem" }),
    );
    reject(() => valid(tooMany), "limit");
    assert.equal(m.canonicalResearchJson(input), before);
  },
);
check(
  "periods and exact filtered exports refuse malformed or falsely complete requests",
  () => {
    const g = valid(scientificFixture()),
      p = project(g);
    reject(() =>
      m.researchProgress(g, {
        editionId: g.manifest.currentEditionId,
        from: at,
        to: "2026-10-27T09:00:00.000Z",
      }),
    );
    const empty = m.researchProgress(g, {
      editionId: g.manifest.currentEditionId,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });
    assert.equal(empty.currentlySupportedDispositionIds.length, 0);
    reject(() => m.researchLedgerExport(p, { format: "json", eventIds: [] }));
    reject(() =>
      m.researchLedgerExport(p, { format: "csv", eventIds: ["event:missing"] }),
    );
    reject(() =>
      m.projectResearchLedger(JSON.parse(JSON.stringify(g)), {
        editionId: g.manifest.currentEditionId,
      }),
    );
  },
);
check(
  "different process time zones and later wall clock values cannot alter factual bytes",
  () => {
    const code =
      "import {fixture,options} from './test-fixtures/research-ledger/factory.mjs';import * as m from './src/lib/research-ledger-model.mjs';const i=fixture();const g=m.validateResearchLedger(i,options(i));console.log(m.researchLedgerExport(m.projectResearchLedger(g,{editionId:g.manifest.currentEditionId}),{format:'json',eventIds:null}).text);";
    const a = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        { env: { ...process.env, TZ: "UTC" }, encoding: "utf8" },
      ),
      b = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, TZ: "Pacific/Auckland" },
        encoding: "utf8",
      });
    assert.equal(a, b);
  },
);
check(
  "withdrawal can be followed by a fresh independently reviewed reopening without erasing the old result",
  () => {
    const input = scientificFixture(),
      old = valid(input),
      firstId = input.manifest.currentEditionId;
    event(input, {
      type: "review-withdrawn",
      recordId: "artifact:fictional-result",
      reviewId: input.reviews[0].id,
      replacementReviewId: null,
      occurredAt: "2026-10-27T08:45:00.000Z",
      timeBasis: "public-decision",
    });
    const previous = input.versions.find(
        (v) => v.recordId === "artifact:fictional-result",
      ),
      newResult = version(
        previous.recordId,
        {
          ...previous.subject,
          summary: "Fictional revised theoretical result.",
          finding: "negative",
        },
        [],
        previous.authorship,
        2,
        previous.id,
      );
    input.versions.push(newResult);
    event(input, {
      type: "version-recorded",
      recordId: newResult.recordId,
      before: ref(previous),
      after: ref(newResult),
    });
    const problem = input.versions[0],
      newDecision = version(
        "decision:fictional-reopened",
        {
          type: "decision",
          problem: ref(problem),
          from: "under-review",
          to: "open",
          results: [ref(newResult)],
          criterion: problem.subject.frontmatter.progress,
          reason: "Fictional reviewed reopening, not a real finding.",
          limitations: "Synthetic only.",
        },
        [],
        fullAuth("actor:author"),
      );
    input.records.push(obj({ id: newDecision.recordId, kind: "decision" }));
    input.versions.push(newDecision);
    event(input, {
      type: "baseline",
      recordId: newDecision.recordId,
      version: ref(newDecision),
      initialProblemState: null,
    });
    const rr = review(
        newResult,
        "research",
        "actor:researcher",
        "actor:author",
        "reopening-result",
        "2026-10-27T08:50:00.000Z",
      ),
      dr = review(
        newDecision,
        "disposition",
        "actor:disposition-reviewer",
        "actor:author",
        "reopening-decision",
        "2026-10-27T08:50:00.000Z",
      );
    input.reviews.push(rr, dr);
    event(input, {
      type: "review-recorded",
      recordId: newResult.recordId,
      reviewId: rr.id,
    });
    event(input, {
      type: "review-recorded",
      recordId: newDecision.recordId,
      reviewId: dr.id,
    });
    event(input, {
      type: "problem-disposition",
      recordId: problem.recordId,
      decision: ref(newDecision),
      researchReviewIds: [rr.id],
      decisionReviewIds: [dr.id],
      occurredAt: "2026-10-27T08:55:00.000Z",
      timeBasis: "public-decision",
    });
    setCompatibility(input, "open", "draft", "reopened");
    repin(input, { newEditionId: "edition:fictional-reopened" });
    const g = valid(input),
      p = project(g);
    assert.equal(p.counters.open, 1);
    assert.equal(
      p.problemStates[0].lastRecordedDisposition.recordId,
      newDecision.recordId,
    );
    assert.equal(
      p.graph.versions.filter((v) => v.recordId === previous.recordId).length,
      2,
    );
    assert.equal(project(g, firstId).factualHash, project(old).factualHash);
  },
);
check(
  "actual source baseline anchoring is independent of its later ledger metadata",
  () => {
    const input = fixture(),
      key = "problems/the-depth-census",
      raw = readFileSync(
        "test-fixtures/research-ledger/depth-census-source-at-8df.md.txt",
        "utf8",
      ),
      s = source("source:actual-anchor", raw, key);
    s.commit = "8df2d0ddbc6d91b9841c6bbb94dbde1fc7c00137";
    assert.equal(
      s.sha256,
      "ebd0d4239ba1e1fabc871238a4436d82e1eacc0401bd61a78cdb2952cd8b7a9e",
    );
    const pinned = obj(s),
      v = version(
        "problem:fictional",
        captureResearchEntry({ sourceKey: key, rawText: raw }).subject,
        [{ sourceId: pinned.id, selector: { kind: "entry" } }],
      );
    input.sources = [pinned];
    input.versions = [v];
    input.events = [];
    input.manifest.capture.commit = pinned.commit;
    input.manifest.coverage.includedSourceKeys = [key];
    input.manifest.currentSources = [
      {
        sourceKey: key,
        recordId: v.recordId,
        sourceId: pinned.id,
        currentVersion: ref(v),
        href: "/open-problems/the-depth-census/",
      },
    ];
    event(input, {
      type: "baseline",
      recordId: v.recordId,
      version: ref(v),
      initialProblemState: "open",
    });
    repin(input);
    const first = project(valid(input)),
      sourceHash = first.graph.sources[0].sha256;
    input.manifest.capture.id = "capture:later-ledger-metadata";
    repin(input, { newEditionId: "edition:later-ledger-metadata" });
    const later = project(valid(input));
    assert.equal(later.graph.sources[0].sha256, sourceHash);
    assert.equal(later.graph.sources[0].commit, pinned.commit);
    assert.notEqual(later.factualHash, first.factualHash);
    assert.equal(later.graph.sources[0].text, raw);
  },
);
check(
  "quoted dates, CRLF/BOM, genuine duplicate-container aliases and deep YAML remain explicit",
  () => {
    const raw = rawProblem(),
      bom = "\uFEFF" + raw.replaceAll("\n", "\r\n"),
      captured = captureResearchEntry({
        sourceKey: "problems/fictional",
        rawText: bom,
      });
    assert.ok(captured.subject.body.includes("\r\n"));
    const alias = raw.replace(
      "number: 1",
      "number: 1\nconditions: &a []\nsources: *a",
    );
    reject(
      () =>
        captureResearchEntry({
          sourceKey: "problems/fictional",
          rawText: alias,
        }),
      "source",
    );
    const deep = raw.replace(
      "number: 1",
      "number: 1\nconditions: " + "[".repeat(25) + "x" + "]".repeat(25),
    );
    reject(() =>
      captureResearchEntry({ sourceKey: "problems/fictional", rawText: deep }),
    );
    const journal = journalFixture(),
      s = journal.sources[0],
      changed = s.text.replace("2026-10-27", "2026-10-26");
    assert.notEqual(
      m.researchSubjectHash(
        captureResearchEntry({
          sourceKey: "journal/fictional",
          rawText: s.text,
        }).subject,
      ),
      m.researchSubjectHash(
        captureResearchEntry({
          sourceKey: "journal/fictional",
          rawText: changed,
        }).subject,
      ),
    );
  },
);
console.log(
  `Research ledger: ${count} actual-module groups passed. Scientific/human-review scenarios are fictional excluded fixtures only.`,
);
