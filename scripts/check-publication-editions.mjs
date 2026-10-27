import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import {
  makeActualPublicationFixture,
  initialPublicationRequests,
  readActualPublicationFixtureSources,
  authoredFutureRequest,
  authoredFutureRaw,
  FIXTURE_COMMIT,
  FIXTURE_CAPTURE_AT,
} from "../test-fixtures/publication-editions/factory.mjs";
import {
  validatePublicationRegistry,
  makePublicationSource,
  makePublicationEdition,
  makeProposalCatalog,
  makeProposalBasisBundle,
  makePublicationDownload,
  projectPublicationEdition,
  comparePublicationEditions,
  publicationRegistryMetadata,
  publicationMailLineage,
  publicationLegacyMailBinding,
  canonicalPublicationJson,
  hashPublicationValue,
  rawPublicationHash,
  strictPublicationJson,
  renderPublicationArtifact,
  checkCommittedPublicationAppendOnly,
} from "../src/lib/publication-editions-model.mjs";
import {
  capturePublicationEditions,
  publicationCapturePaths,
  publicationRegistryFiles,
  publicationRegistryFromFiles,
  readCommittedPublicationCapture,
  prepareCommittedPublicationCapture,
  writePublicationRegistryCapture,
} from "../src/lib/publication-editions-capture.mjs";
import {
  pretty,
  objectHash,
  PUBLICATION_LIMITS,
} from "../src/lib/publication-editions-canonical.mjs";
import { pinnedPublicationResearch } from "../src/lib/publication-editions-projection.mjs";
import {
  generateMailIssueRegistry,
  generateMailIssueFiles,
} from "../services/newsletter/lib/generate-editions.mjs";
import {
  mailIssueFiles,
  validateMailIssueFiles,
} from "../services/newsletter/lib/editions.mjs";
const clone = (v) => structuredClone(v);
let passed = 0;
async function group(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`✓ ${name}\n`);
}
const fixture = makeActualPublicationFixture(),
  base = fixture.input;
await group(
  "inert definitions stay compatible with the existing R4 data review inventory",
  () => {
    const definitions = JSON.parse(
      readFileSync(
        new URL(
          "../src/data/publication-edition-methods.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    let flags = 0;
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value) && Object.hasOwn(value, "review")) {
        flags++;
        assert.ok(
          ["draft", "reviewed"].includes(value.review),
          "A field classification is not a data review declaration.",
        );
      }
      for (const child of Object.values(value))
        if (child && typeof child === "object") visit(child);
    };
    visit(definitions);
    assert.ok(flags > 0);
  },
);
function capture(
  requests,
  rawSources,
  previousInput = base,
  sourceCommit = "b".repeat(40),
  capturedAt = "2026-10-28T12:00:00.000Z",
) {
  return capturePublicationEditions({
    sourceCommit,
    capturedAt,
    requests,
    rawSources,
    previousInput,
  });
}
function stateRequest() {
  return {
    ...clone(initialPublicationRequests()[0]),
    id: "state-second-capture",
    sequence: 2,
  };
}
function rehashEdition(input, index) {
  const e = input.editions[index];
  e.coreHash = hashPublicationValue(e.core);
  for (const a of e.artifacts) {
    const file = input.artifacts.find(
      (x) => x.editionId === e.core.id && x.fileName === a.fileName,
    );
    file.text = renderPublicationArtifact(
      e.core,
      e.coreHash,
      a.fileName.endsWith(".md") ? "markdown" : "text",
    );
    a.byteLength = Buffer.byteLength(file.text);
    a.sha256 = rawPublicationHash(file.text);
  }
  e.hash = objectHash(e);
  input.registry.editionPins.find((p) => p.id === e.core.id).hash = e.hash;
  input.registry.hash = objectHash(input.registry);
}

await group(
  "five actual-source families preserve 10 chapters, 3 draft manuscripts and one legacy mail identity",
  () => {
    assert.equal(base.editions.length, 5);
    assert.equal(
      base.editions.find((e) => e.core.family === "principles").core.members
        .length,
      10,
    );
    assert.equal(
      base.editions.find((e) => e.core.family === "journal").core.members
        .length,
      3,
    );
    assert.equal(base.editions.filter((e) => e.core.legacyMail).length, 1);
    assert.ok(
      base.editions.every((e) => e.core.editorial.label === "editorial-draft"),
    );
    assert.deepEqual(
      publicationRegistryMetadata(base).current,
      base.registry.current,
    );
  },
);
await group(
  "legacy ordered content hash, title, HTML/text bytes and public lineage remain exact",
  () => {
    const b = publicationLegacyMailBinding(base);
    assert.equal(
      b.hash,
      "a3206bae9f3497914e7160b58984c5a1c3cea1ed550ddba205344ccf4f18f0f8",
    );
    assert.equal(Buffer.byteLength(b.html), 4640);
    assert.equal(Buffer.byteLength(b.text), 2857);
    const service = generateMailIssueRegistry(base, {
      selections: [{ publicationId: b.publicationId, issueId: "edition-1" }],
    });
    assert.equal(service.issues.length, 1);
    assert.equal(service.issues[0].hash, b.hash);
    assert.equal(service.lineage.length, 1);
  },
);
await group(
  "closed R4 output preserves zero dispositions and unknown January starting baseline",
  () => {
    const e = base.editions.find((e) => e.core.family === "progress-report"),
      p = JSON.parse(e.core.members[0].payload.progressJson);
    assert.equal(p.coverage.baselineKnownFrom, null);
    assert.ok(p.startingStates.every((x) => x.status === null));
    assert.equal(p.counters.currentlySupportedDispositions, 0);
    assert.equal(p.counters.editorialCorrections, 1);
    assert.equal(p.counters.changedClaims, 2);
    assert.equal(e.core.r4.progressInputHash, p.inputHash);
  },
);
await group(
  "State records explicit financial decimals, units, stock/flow and prior-assets payout denominator",
  () => {
    const rows = base.editions.find((e) => e.core.family === "state-of-charity")
      .core.members;
    assert.equal(rows.find((m) => m.id === "us-giving").payload.value, "617.2");
    assert.equal(
      rows.find((m) => m.id === "daf-assets-billions").payload.measure,
      "stock",
    );
    assert.equal(
      rows.find((m) => m.id === "daf-grants-billions").payload.measure,
      "flow",
    );
    assert.equal(
      rows.find((m) => m.id === "daf-payout-rate").payload.denominator,
      "Previous year-end assets",
    );
    assert.equal(
      rows.find((m) => m.id === "registered-description").payload.value,
      null,
    );
  },
);
await group(
  "every deterministic artifact binds core hash without embedding its own final manifest hash",
  () => {
    for (const e of base.editions)
      for (const a of e.artifacts) {
        const text = base.artifacts.find(
          (x) => x.editionId === e.core.id && x.fileName === a.fileName,
        ).text;
        assert.ok(text.includes(e.coreHash));
        assert.ok(!text.includes(e.hash));
        assert.equal(rawPublicationHash(text), a.sha256);
        assert.equal(Buffer.byteLength(text), a.byteLength);
      }
  },
);
await group(
  "actual captured Markdown makes credential/backslash/script links and embeds inert",
  () => {
    const request = {
      ...clone(initialPublicationRequests()[2]),
      id: "principles-unsafe-link-fixture",
      sequence: 2,
    };
    const raw = readActualPublicationFixtureSources([request]),
      chapter = raw.find((s) => s.path.startsWith("src/content/principles/"));
    chapter.rawUtf8 +=
      '\n\n[credential](https://user:password@example.org/private) [slash](https://example.org\\@evil.org/) [script](javascript:alert(1)) [safe](https://example.org/safe) [internal](/record/principles/) ![remote image](https://example.org/image.png) <iframe src="https://example.org/"></iframe>\n';
    const next = capture([request], raw),
      text = next.input.artifacts.find(
        (a) => a.editionId === request.id && a.fileName === "edition.md",
      ).text;
    assert.ok(!text.includes("](https://user:password@example.org/private)"));
    assert.ok(!text.includes("](https://example.org\\@evil.org/)"));
    assert.ok(!text.includes("](javascript:"));
    assert.ok(text.includes("[safe](https://example.org/safe)"));
    assert.ok(text.includes("[internal](/record/principles/)"));
    assert.ok(!text.includes("![remote image]"));
    assert.ok(!text.includes("<iframe"));
  },
);
await group(
  "source file projection rejects unknown frontmatter and nested financial shape changes",
  () => {
    const req = initialPublicationRequests(),
      raw = readActualPublicationFixtureSources(req),
      chapter = raw.find((x) => x.path.startsWith("src/content/principles/"));
    chapter.rawUtf8 = chapter.rawUtf8.replace(
      "---\n",
      "---\nunknownClaim: true\n",
    );
    assert.throws(() => capture(req, raw, null), /classification/);
    const raw2 = readActualPublicationFixtureSources(req),
      fig = raw2.find((x) => x.path === "src/data/figures.json");
    const v = JSON.parse(fig.rawUtf8);
    v.dafs.unclassifiedNumber = 999;
    fig.rawUtf8 = JSON.stringify(v);
    assert.throws(() => capture(req, raw2, null), /exact documented fields/);
  },
);
await group(
  "a new current source cannot use an older R4 projection to assert reviewed manuscript text",
  () => {
    const req = initialPublicationRequests(),
      raw = readActualPublicationFixtureSources(req),
      journal = raw.find(
        (x) => x.path === "src/content/journal/ten-dollars.md",
      );
    journal.rawUtf8 = journal.rawUtf8.replace(
      "---\n",
      "---\nreview: reviewed\n",
    );
    assert.throws(() => capture(req, raw, null), /pinned R4 source/);
  },
);
await group(
  "returned R4 cache inputs cannot be mutated to bless changed manuscript text",
  () => {
    const journal = base.editions.find((e) => e.core.family === "journal"),
      sources = journal.core.sourcePins.map((p) =>
        base.sources.find((s) => s.id === p.id),
      ),
      research = pinnedPublicationResearch(sources, {
        editionId: journal.core.r4.editionId,
      });
    const binding = research.projection.edition.currentSources.find(
        (b) => b.sourceKey === "journal/ten-dollars",
      ),
      source = research.input.sources.find((s) => s.id === binding.sourceId),
      original = source.text;
    assert.ok(Object.isFrozen(research.input));
    assert.ok(Object.isFrozen(source));
    assert.throws(() => {
      source.text = original + "\nUnreviewed changed text.\n";
    }, TypeError);
    const detached = clone(research.input);
    detached.sources.find((s) => s.id === binding.sourceId).text =
      original + "\nUnreviewed changed text.\n";
    const requests = initialPublicationRequests(),
      raw = readActualPublicationFixtureSources(requests);
    raw.find((s) => s.path === "src/content/journal/ten-dollars.md").rawUtf8 =
      original + "\nUnreviewed changed text.\n";
    assert.throws(() => capture(requests, raw, null), /pinned R4 source/);
    assert.equal(
      pinnedPublicationResearch(sources, {
        editionId: journal.core.r4.editionId,
      }).input.sources.find((s) => s.id === binding.sourceId).text,
      original,
    );
  },
);
await group(
  "recomputed enclosing hashes cannot forge a member value or remove its complete source context",
  () => {
    const changed = clone(base),
      index = changed.editions.findIndex(
        (e) => e.core.family === "state-of-charity",
      );
    changed.editions[index].core.members.find(
      (m) => m.id === "us-giving",
    ).payload.value = "999999";
    changed.editions[index].core.members.forEach(
      (m) => (m.contentHash = hashPublicationValue(m.payload)),
    );
    rehashEdition(changed, index);
    assert.throws(() => validatePublicationRegistry(changed), /projection/);
    const omitted = clone(base);
    omitted.sources.pop();
    assert.throws(() => validatePublicationRegistry(omitted), /source pin/);
  },
);
await group(
  "strict JSON rejects decoded duplicate keys, bad UTF-8, wrong depth, accessors and hidden properties",
  () => {
    assert.throws(
      () => strictPublicationJson('{"a":1,"\\u0061":2}'),
      /Duplicate/,
    );
    assert.throws(() => strictPublicationJson(new Uint8Array([0xff])), /UTF-8/);
    assert.throws(
      () => strictPublicationJson("[".repeat(33) + "0" + "]".repeat(33)),
      /depth/,
    );
    assert.doesNotThrow(() =>
      strictPublicationJson("[".repeat(32) + "0" + "]".repeat(32)),
    );
    let reads = 0;
    const obj = {};
    Object.defineProperty(obj, "bad", {
      enumerable: true,
      get() {
        reads++;
        return 1;
      },
    });
    assert.throws(() => canonicalPublicationJson(obj), /Accessor/);
    assert.equal(reads, 0);
    const hidden = {};
    Object.defineProperty(hidden, "hidden", { value: 1 });
    assert.throws(() => canonicalPublicationJson(hidden), /hidden/);
  },
);
await group(
  "raw UTF-16 refusal is distinct from lossless escaped JSON surrogate tokens",
  () => {
    assert.throws(() => strictPublicationJson('"\ud800"'), /UTF-8/);
    assert.equal(strictPublicationJson('"\\ud800"'), "\ud800");
    assert.throws(
      () =>
        makePublicationSource({
          sourceCommit: FIXTURE_COMMIT,
          sourcePath: "src/lib/content.ts",
          rawUtf8: "\ud800",
        }),
      /UTF-8/,
    );
  },
);
await group(
  "direct array subclasses/prototype hooks and index accessors are refused without callbacks",
  () => {
    let calls = 0;
    class HookedArray extends Array {
      map() {
        calls++;
        return ["fabricated-value"];
      }
    }
    assert.throws(
      () => canonicalPublicationJson(new HookedArray("original-value")),
      /ordinary JSON arrays/,
    );
    assert.equal(calls, 0);
    const modified = ["original-value"];
    Object.setPrototypeOf(modified, {
      map() {
        calls++;
        return ["fabricated-value"];
      },
    });
    assert.throws(
      () => canonicalPublicationJson(modified),
      /ordinary JSON arrays/,
    );
    assert.equal(calls, 0);
    const accessed = ["original-value"];
    Object.defineProperty(accessed, "0", {
      enumerable: true,
      get() {
        calls++;
        return "fabricated-value";
      },
    });
    assert.throws(() => canonicalPublicationJson(accessed), /Accessor/);
    assert.equal(calls, 0);
    const hiddenLength = {};
    Object.defineProperty(hiddenLength, "length", { value: 1 });
    assert.throws(() => canonicalPublicationJson(hiddenLength), /hidden/);
    assert.equal(
      canonicalPublicationJson(["original-value"]),
      '["original-value"]',
    );
  },
);
await group(
  "public source citations and authored links reject backslashes before URL normalization",
  () => {
    const payload = JSON.parse(authoredFutureRaw());
    payload.sources = [
      {
        title: "Fictional source",
        url: "https://example.invalid\\@other.invalid/path",
        publisher: null,
        year: null,
        note: null,
      },
    ];
    assert.throws(
      () =>
        makePublicationSource({
          sourceCommit: FIXTURE_COMMIT,
          sourcePath: "src/data/publication-letter-drafts/fictional-test.json",
          rawUtf8: pretty(payload),
        }),
      /Invalid link/,
    );
    payload.sources = [];
    payload.blocks = [
      {
        kind: "links",
        items: [
          {
            label: "Fictional link",
            url: "https://example.invalid\\@other.invalid/path",
          },
        ],
      },
    ];
    assert.throws(
      () =>
        makePublicationSource({
          sourceCommit: FIXTURE_COMMIT,
          sourcePath: "src/data/publication-letter-drafts/fictional-test.json",
          rawUtf8: pretty(payload),
        }),
      /Invalid link/,
    );
  },
);
await group(
  "complete source wrapper admits exactly 2 MiB and refuses one more byte",
  () => {
    const empty = makePublicationSource({
        sourceCommit: FIXTURE_COMMIT,
        sourcePath: "src/lib/content.ts",
        rawUtf8: "",
      }),
      overhead = Buffer.byteLength(pretty(empty)),
      n = PUBLICATION_LIMITS.sourceBytes - overhead;
    const exact = makePublicationSource({
      sourceCommit: FIXTURE_COMMIT,
      sourcePath: "src/lib/content.ts",
      rawUtf8: "x".repeat(n),
    });
    assert.equal(Buffer.byteLength(pretty(exact)), 2097152);
    assert.throws(
      () =>
        makePublicationSource({
          sourceCommit: FIXTURE_COMMIT,
          sourcePath: "src/lib/content.ts",
          rawUtf8: "x".repeat(n + 1),
        }),
      /byte bound/,
    );
  },
);
await group(
  "catalog offers hash exact complete basis bytes and add a base path once",
  () => {
    const c = makeProposalCatalog(base, { basePath: "/charitology/" });
    for (const o of c.basisOffers) {
      const text = makeProposalBasisBundle(base, o.editionId),
        bundle = JSON.parse(text);
      assert.equal(o.byteLength, Buffer.byteLength(text));
      assert.equal(o.sha256, rawPublicationHash(text));
      assert.equal(
        o.href,
        `/charitology/record/editions/${o.editionId}/basis.json`,
      );
      assert.equal(
        bundle.sources.length,
        bundle.edition.core.sourcePins.length,
      );
      assert.ok(!Object.hasOwn(bundle, "artifacts"));
      assert.ok(o.byteLength <= 2097152);
    }
    assert.throws(
      () => makeProposalCatalog(base, { basePath: "https://bad.invalid" }),
      /base path/,
    );
  },
);
await group(
  "download bytes are detached and all archive files roundtrip exact canonical serialization",
  () => {
    const id = base.registry.current.principles,
      bytes = makePublicationDownload(base, id, { format: "json" });
    assert.equal(
      JSON.parse(new TextDecoder().decode(bytes)).hash,
      projectPublicationEdition(base, id).edition.hash,
    );
    bytes[0] = 0;
    assert.equal(makePublicationDownload(base, id, { format: "json" })[0], 123);
    const files = publicationRegistryFiles(base),
      loaded = publicationRegistryFromFiles(files);
    assert.equal(loaded.registry.hash, base.registry.hash);
    const extra = new Map(files);
    extra.set("secret.env", "bad");
    assert.throws(() => publicationRegistryFromFiles(extra), /Unknown path/);
  },
);
await group(
  "future source-A baseline reuses unchanged exact snapshots and retains every old object",
  () => {
    const request = stateRequest(),
      raw = readActualPublicationFixtureSources([request]),
      fig = raw.find((s) => s.path === "src/data/figures.json");
    fig.rawUtf8 = fig.rawUtf8.replace("617.2", "617.3");
    const next = capture([request], raw);
    assert.equal(next.newSourceIds.length, 1);
    assert.equal(next.reusedSourceCount, raw.length - 1);
    assert.equal(next.input.sources.length, base.sources.length + 1);
    for (const s of base.sources)
      assert.deepEqual(
        next.input.sources.find((x) => x.id === s.id),
        s,
      );
    const before = base.registry.current["state-of-charity"],
      after = request.id,
      result = comparePublicationEditions(next.input, {
        fromId: before,
        toId: after,
      });
    assert.ok(
      result.differences.some(
        (d) => d.memberId === "us-giving" && d.code === "editorial-change",
      ),
    );
    assert.ok(
      !result.differences.some((d) => d.code === "qualified-r4-disposition"),
    );
  },
);
await group(
  "cross-family/unknown comparisons never turn incomplete or incompatible records into impact",
  () => {
    const result = comparePublicationEditions(base, {
      fromId: base.registry.current.principles,
      toId: base.registry.current.journal,
    });
    assert.equal(result.differences[0].code, "not-comparable");
    assert.throws(
      () =>
        comparePublicationEditions(base, {
          fromId: "missing",
          toId: base.registry.current.journal,
        }),
      /Unknown/,
    );
  },
);
await group(
  "compatible function counts change descriptively while changed financial periods refuse comparison",
  () => {
    const request = stateRequest(),
      raw = readActualPublicationFixtureSources([request]),
      tool = raw.find(
        (s) =>
          s.path.startsWith("src/content/tools/") &&
          /status: live/.test(s.rawUtf8),
      );
    assert.ok(tool);
    tool.rawUtf8 = tool.rawUtf8.replace("status: live", "status: seeded");
    const changed = capture([request], raw);
    const result = comparePublicationEditions(changed.input, {
      fromId: base.registry.current["state-of-charity"],
      toId: request.id,
    });
    assert.ok(
      result.differences.some(
        (d) =>
          d.code === "count-change" &&
          d.reason.includes("function availability"),
      ),
    );
    const financial = readActualPublicationFixtureSources([request]),
      file = financial.find((s) => s.path === "src/data/figures.json"),
      value = JSON.parse(file.rawUtf8);
    value.usGiving.year = 2024;
    file.rawUtf8 = pretty(value);
    const incompatible = capture([request], financial);
    assert.ok(
      comparePublicationEditions(incompatible.input, {
        fromId: base.registry.current["state-of-charity"],
        toId: request.id,
      }).differences.some(
        (d) => d.memberId === "us-giving" && d.code === "not-comparable",
      ),
    );
  },
);
await group(
  "two clocks and time zones reproduce identical full registry/artifact bytes",
  () => {
    const code =
      "Date.now=()=>Number(process.env.FIXTURE_NOW); const {makeActualPublicationFixture}=await import('./test-fixtures/publication-editions/factory.mjs'); const {publicationRegistryFiles}=await import('./src/lib/publication-editions-capture.mjs');const {hashPublicationValue}=await import('./src/lib/publication-editions-model.mjs');const f=makeActualPublicationFixture();process.stdout.write(hashPublicationValue([...publicationRegistryFiles(f.input)]));";
    const first = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        {
          encoding: "utf8",
          env: { ...process.env, TZ: "Pacific/Honolulu", FIXTURE_NOW: "0" },
        },
      ),
      second = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            TZ: "Asia/Tokyo",
            FIXTURE_NOW: "4102444800000",
          },
        },
      );
    assert.equal(first, second);
  },
);
let future;
await group(
  "future authored Letter capture is functional without a public issue-2 seed or request HTML",
  () => {
    const request = authoredFutureRequest(),
      required = publicationCapturePaths([request]),
      raw = readActualPublicationFixtureSources().filter((s) =>
        required.includes(s.path),
      );
    raw.push({
      path: request.authoredLetterPath,
      rawUtf8: authoredFutureRaw(),
    });
    future = capture([request], raw);
    assert.equal(future.input.editions.length, 6);
    assert.equal(base.editions.length, 5);
    const lineage = publicationMailLineage(future.input, [request.id]);
    assert.equal(lineage.length, 2);
    assert.equal(lineage[1].supersedes.id, "letter-edition-one-preserved");
    assert.equal(lineage[0].supersedes, null);
    const prior = generateMailIssueRegistry(base, {
      selections: [
        { publicationId: "letter-edition-one-preserved", issueId: "edition-1" },
      ],
    });
    const generated = generateMailIssueRegistry(future.input, {
      selections: [
        { publicationId: request.id, issueId: "fictional-test-only" },
      ],
      previousRegistry: prior,
    });
    assert.equal(generated.issues.length, 2);
    assert.equal(generated.lineage.length, 2);
    assert.ok(generated.issues[1].html.includes("Fictional"));
  },
);
await group(
  "correction/sequence/hash edits and prior object deletion fail despite recanonicalization",
  () => {
    const edited = clone(future.input),
      e = edited.editions.find(
        (e) => e.core.id === "letter-fictional-test-correction",
      );
    e.core.supersedes = e.core.id;
    rehashEdition(edited, edited.editions.indexOf(e));
    assert.throws(
      () => validatePublicationRegistry(edited),
      /earlier same-family/,
    );
    const bad = clone(base);
    bad.registry.current.principles = "unknown";
    bad.registry.hash = objectHash(bad.registry);
    assert.throws(() => validatePublicationRegistry(bad), /latest/);
    const removed = clone(future.input);
    removed.sources.shift();
    assert.throws(() =>
      validatePublicationRegistry(removed, { previousObjects: base }),
    );
  },
);
await group(
  "capture rejects accidental private paths, duplicate source identities and old issue aliases",
  () => {
    const req = authoredFutureRequest();
    req.authoredLetterPath = "services/newsletter/.env.local";
    assert.throws(() => publicationCapturePaths([req]), /public authored/);
    const raw = readActualPublicationFixtureSources();
    raw.push(raw[0]);
    assert.throws(
      () => capture(initialPublicationRequests(), raw, null),
      /Duplicate/,
    );
    const alias = {
      ...clone(initialPublicationRequests()[4]),
      id: "legacy-alias",
      sequence: 2,
    };
    assert.throws(
      () => capture([alias], readActualPublicationFixtureSources([alias])),
      /exactly one preserved/,
    );
  },
);

// These repositories are unique disposable Git-object fixtures, with no remotes.
// They never change the public checkout's refs, index, configuration or files.
const directory = mkdtempSync(join(tmpdir(), "charitology-r5-committed-"));
const git = (...args) =>
  execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 30 * 1024 * 1024,
  });
const commitFixture = (message) => {
  git("add", "--all");
  git(
    "-c",
    "user.name=Charitology test fixture",
    "-c",
    "user.email=charitology-test@example.invalid",
    "commit",
    "-q",
    "-m",
    message,
  );
  return git("rev-parse", "HEAD").trim();
};
const put = (relative, text) => {
  const p = join(directory, relative);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};
const writeTrees = (input) => {
  for (const [p, text] of publicationRegistryFiles(input))
    put("src/data/publication-editions/" + p, text);
  const mail = generateMailIssueFiles(input, {
    selections: [
      { publicationId: "letter-edition-one-preserved", issueId: "edition-1" },
    ],
  });
  for (const [p, text] of Object.entries(mail))
    put("services/newsletter/editions/" + p, text);
};
try {
  git("init", "-q");
  const requests = initialPublicationRequests(),
    raw = readActualPublicationFixtureSources(requests);
  for (const s of raw) put(s.path, s.rawUtf8);
  const A = commitFixture("Fictional source A");
  let committed;
  await group(
    "real committed source preview proves every raw path and refuses dirty current bytes",
    () => {
      const read = readCommittedPublicationCapture({
        repositoryRoot: directory,
        sourceCommit: A,
        requests,
      });
      assert.equal(read.length, raw.length);
      committed = prepareCommittedPublicationCapture({
        repositoryRoot: directory,
        sourceCommit: A,
        capturedAt: FIXTURE_CAPTURE_AT,
        requests,
        previousInput: null,
      });
      assert.equal(
        existsSync(join(directory, "src/data/publication-editions")),
        false,
      );
      const changed = raw.find((s) => s.path === "src/data/figures.json");
      put(changed.path, changed.rawUtf8 + "\n");
      assert.throws(
        () =>
          readCommittedPublicationCapture({
            repositoryRoot: directory,
            sourceCommit: A,
            requests,
          }),
        /differs/,
      );
      put(changed.path, changed.rawUtf8);
    },
  );
  await group(
    "explicit capture write needs its exact proposal hash and writes only the public registry",
    () => {
      assert.throws(
        () =>
          writePublicationRegistryCapture({
            repositoryRoot: directory,
            capture: committed,
            expectedProposalHash: "0".repeat(64),
          }),
        /proposal hash/,
      );
      writePublicationRegistryCapture({
        repositoryRoot: directory,
        capture: committed,
        expectedProposalHash: committed.proposalHash,
      });
      assert.ok(
        existsSync(
          join(directory, "src/data/publication-editions/registry.json"),
        ),
      );
      assert.equal(
        existsSync(join(directory, "services/newsletter/editions")),
        false,
      );
    },
  );
  writeTrees(committed.input);
  const B = commitFixture("Fictional capture B");
  await group(
    "actual Git bootstrap proves exact available base, complete public/mail closure and source baseline",
    async () => {
      const report = await checkCommittedPublicationAppendOnly({
        repositoryRoot: directory,
        headCommit: B,
        baseCommit: A,
        mode: "ci",
      });
      assert.equal(report.status, "bootstrap-verified");
      assert.equal(report.baseCommit, A);
      assert.equal(report.headCommit, B);
      assert.equal(report.checkedHistoricalFiles, 1);
    },
  );
  await group(
    "a bootstrap cannot join internally valid mail to a false public publication pin",
    async () => {
      const registry = clone(
        generateMailIssueRegistry(committed.input, {
          selections: [
            {
              publicationId: "letter-edition-one-preserved",
              issueId: "edition-1",
            },
          ],
        }),
      );
      registry.issues[0].publicationHash = "f".repeat(64);
      registry.lineage[0].publicationHash = "f".repeat(64);
      registry.lineage[0].hash = objectHash(registry.lineage[0]);
      registry.hash = objectHash(registry);
      const files = mailIssueFiles(registry);
      assert.doesNotThrow(() => validateMailIssueFiles(files));
      for (const [p, text] of Object.entries(files))
        put("services/newsletter/editions/" + p, text);
      const falseBinding = commitFixture(
        "Fictional internally valid but false public mail pin",
      );
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: falseBinding,
          baseCommit: A,
          mode: "ci",
        }),
        /Historical mail issue|binding|publication/,
      );
      writeTrees(committed.input);
      commitFixture("Restore exact public and mail binding for later fixtures");
    },
  );
  await group(
    "CI/release refuse absent/unavailable bases while local mode reports unavailable honestly",
    async () => {
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: B,
          baseCommit: null,
          mode: "ci",
        }),
        /requires/,
      );
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: B,
          baseCommit: "0".repeat(40),
          mode: "release",
        }),
        /unavailable/,
      );
      const report = await checkCommittedPublicationAppendOnly({
        repositoryRoot: directory,
        headCommit: B,
        baseCommit: null,
        mode: "local",
      });
      assert.equal(report.status, "unavailable");
      assert.equal(report.checkedHistoricalFiles, 0);
    },
  );
  await group(
    "an actual shallow history boundary cannot pass mandatory base ancestry",
    async () => {
      put(".git/shallow", B + "\n");
      try {
        await assert.rejects(
          checkCommittedPublicationAppendOnly({
            repositoryRoot: directory,
            headCommit: B,
            baseCommit: A,
            mode: "ci",
          }),
          /unavailable|invalid/,
        );
      } finally {
        rmSync(join(directory, ".git/shallow"));
      }
    },
  );
  const request = stateRequest(),
    fig = raw.find((s) => s.path === "src/data/figures.json");
  put(fig.path, fig.rawUtf8.replace("617.2", "617.3"));
  const C = commitFixture("Fictional next source A");
  const next = prepareCommittedPublicationCapture({
    repositoryRoot: directory,
    sourceCommit: C,
    capturedAt: "2026-10-28T12:00:00.000Z",
    requests: [request],
    previousInput: committed.input,
  });
  writePublicationRegistryCapture({
    repositoryRoot: directory,
    capture: next,
    expectedProposalHash: next.proposalHash,
  });
  const D = commitFixture("Fictional appended capture B");
  await group(
    "a genuine append preserves exact old blobs and re-proves reused sources against new baseline",
    async () => {
      const report = await checkCommittedPublicationAppendOnly({
        repositoryRoot: directory,
        headCommit: D,
        baseCommit: B,
        mode: "release",
      });
      assert.equal(report.status, "verified");
      assert.equal(report.previousRegistryHash, committed.input.registry.hash);
      assert.ok(report.checkedHistoricalFiles > 420);
      assert.equal(next.newSourceIds.length, 1);
    },
  );
  await group(
    "an unrelated committed tree cannot replace an ancestor base",
    async () => {
      const tree = git("rev-parse", D + "^{tree}").trim(),
        unrelated = execFileSync(
          "git",
          [
            "-C",
            directory,
            "-c",
            "user.name=Charitology test fixture",
            "-c",
            "user.email=charitology-test@example.invalid",
            "commit-tree",
            tree,
          ],
          { input: "Unrelated fixture\n", encoding: "utf8" },
        ).trim();
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: unrelated,
          baseCommit: B,
          mode: "ci",
        }),
        /unavailable|invalid/,
      );
    },
  );
  const sourcePath =
      "src/data/publication-editions/sources/" +
      committed.input.sources[0].id +
      ".json",
    original = readFileSync(join(directory, sourcePath), "utf8");
  put(sourcePath, original + "\n");
  const whitespace = commitFixture("Fictional old source whitespace edit");
  await group(
    "changing old source whitespace cannot evade exact committed byte policy",
    async () => {
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: whitespace,
          baseCommit: D,
          mode: "ci",
        }),
        /serialization|bytes/,
      );
    },
  );
  put(sourcePath, original);
  const mailPath =
      "services/newsletter/editions/lineage/letter-edition-one-preserved.json",
    mailOriginal = readFileSync(join(directory, mailPath), "utf8");
  put(mailPath, mailOriginal + "\n");
  const mailEdit = commitFixture("Fictional old mail lineage edit");
  await group(
    "changing an immutable mail/lineage blob fails the complete service closure gate",
    async () => {
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: mailEdit,
          baseCommit: D,
          mode: "ci",
        }),
      );
    },
  );
  put(mailPath, mailOriginal);
  rmSync(
    join(
      directory,
      "src/data/publication-editions/artifacts/principles-initial-capture/edition.txt",
    ),
  );
  const missing = commitFixture("Fictional missing historical artifact");
  await group(
    "missing historical artifact closure is an error rather than an empty bootstrap",
    async () => {
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: missing,
          baseCommit: D,
          mode: "ci",
        }),
        /artifact/,
      );
    },
  );
  const dTree = git("rev-parse", D + "^{tree}").trim(),
    repaired = execFileSync(
      "git",
      [
        "-C",
        directory,
        "-c",
        "user.name=Charitology test fixture",
        "-c",
        "user.email=charitology-test@example.invalid",
        "commit-tree",
        dTree,
        "-p",
        missing,
      ],
      {
        input: "Restored head over invalid previous closure\n",
        encoding: "utf8",
      },
    ).trim();
  await group(
    "a malformed previous registry cannot be replaced with a caller-supplied valid head",
    async () => {
      await assert.rejects(
        checkCommittedPublicationAppendOnly({
          repositoryRoot: directory,
          headCommit: repaired,
          baseCommit: missing,
          mode: "release",
        }),
        /artifact/,
      );
    },
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
process.stdout.write(
  `Publication editions: ${passed} actual server/source/Git groups passed.\n`,
);
