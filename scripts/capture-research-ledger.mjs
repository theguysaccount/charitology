// Explicit initial editorial capture. Public builds never execute Git/network I/O.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalResearchJson,
  researchObjectHash,
  researchRawHash,
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
import {
  DATA_ROOT,
  LEDGER_GROUPS,
  readLedgerInput,
  readLedgerJson,
} from "../src/lib/research-ledger-data.mjs";
export {
  DATA_ROOT,
  LEDGER_GROUPS,
  readLedgerInput,
} from "../src/lib/research-ledger-data.mjs";

export const BASELINE_COMMIT = "8df2d0ddbc6d91b9841c6bbb94dbde1fc7c00137";
export const BEFORE_COMMIT = "905bdd27bb5f16027c3b3ad3c0f5ee3fc18e3e45";
export const AFTER_COMMIT = "510320528e89f45caa9c42eb5a6eda3d6ad1bede";
export const INITIAL_EDITION_ID = "edition:2026-10-27-initial";
const repository = fileURLToPath(new URL("..", import.meta.url));
const prUrl = "https://github.com/theguysaccount/charitology/pull/3";
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a, b) => compare(a.id, b.id);
const object = (value) => ({ ...value, hash: researchObjectHash(value) });
const reference = (value) => ({
  recordId: value.recordId,
  version: value.version,
  subjectHash: value.subjectHash,
});
const unknown = () => ({
  state: "unknown",
  complete: false,
  actorIds: [],
  refs: [],
});
const disclosure = () => ({ state: "unknown", note: null, refs: [] });
const evidence = (url, title) => ({ url, title, locator: null });
const blobUrl = (commit, path) =>
  `https://github.com/theguysaccount/charitology/blob/${commit}/${path}`;
const kinds = {
  problems: "problem",
  journal: "manuscript",
  cases: "case",
  record: "method",
};
export const HISTORICAL = [
  {
    suffix: "depth-census",
    sourceKey: "problems/the-depth-census",
    parentId: "problem:the-depth-census",
    claimId: "claim:depth-census-knowledge",
    adapter: "depth-census-knowledge-v1",
    before: "722a15f583ff361c70c6758503d12a7464746bd013d8276b9f1b896cf42654c0",
    after: "ebd0d4239ba1e1fabc871238a4436d82e1eacc0401bd61a78cdb2952cd8b7a9e",
  },
  {
    suffix: "ten-dollars",
    sourceKey: "journal/ten-dollars",
    parentId: "manuscript:ten-dollars",
    claimId: "claim:ten-dollars-framing",
    adapter: "ten-dollars-framing-v1",
    before: "1f407ef28ac61ca314088257f038e88df97e2f9910e2edfc1d077a0013c7ab91",
    after: "6fe57d6f550cf879a73c6fd0ba51f4e9e2b75fb3edbc2ee33d124ed335ac5aae",
  },
];

function decode(bytes) {
  assert.ok(
    Buffer.isBuffer(bytes) && bytes.length <= 131072,
    "Source exceeds 128 KiB",
  );
  const text = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  assert.deepEqual(
    Buffer.from(text, "utf8"),
    bytes,
    "UTF-8 source bytes changed during decode",
  );
  return text;
}
function gitBytes(commit, path) {
  // Fixed commits/own-repository paths only; no fetch and no shell interpolation.
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.match(
    path,
    /^src\/content\/(?:problems|journal|cases|record)\/[a-z0-9-]+\.md$/,
  );
  return execFileSync("git", ["-C", repository, "show", `${commit}:${path}`], {
    maxBuffer: 131073,
  });
}
export function baselineSourcePaths(baselineCommit = BASELINE_COMMIT) {
  assert.match(baselineCommit, /^[a-f0-9]{40}$/);
  const paths = execFileSync(
    "git",
    [
      "-C",
      repository,
      "ls-tree",
      "-r",
      "--name-only",
      baselineCommit,
      "--",
      "src/content/problems",
      "src/content/journal",
      "src/content/cases",
      "src/content/record/methodology.md",
    ],
    { encoding: "utf8", maxBuffer: 65536 },
  )
    .trim()
    .split("\n")
    .sort();
  assert.equal(
    paths.length,
    40,
    "Pinned public baseline must contain the exact 40 covered files",
  );
  for (const [collection, count] of [
    ["problems", 23],
    ["journal", 3],
    ["cases", 13],
    ["record", 1],
  ])
    assert.equal(
      paths.filter((path) => path.startsWith(`src/content/${collection}/`))
        .length,
      count,
    );
  return paths;
}
export function seedOptions(input, { currentFiles = false } = {}) {
  return {
    currentContent: input.manifest.currentSources.map((binding) => {
      const snapshot = input.sources.find(
        (source) => source.id === binding.sourceId,
      );
      const rawText = currentFiles
        ? decode(
            readFileSync(
              join(repository, `src/content/${binding.sourceKey}.md`),
            ),
          )
        : snapshot.text;
      return {
        sourceKey: binding.sourceKey,
        href: binding.href,
        rawText,
        ...captureResearchEntry({ sourceKey: binding.sourceKey, rawText }),
      };
    }),
    // The full Astro adapter separately scans all uncovered collection entries.
    uncoveredReviews: [],
  };
}

export function createInitialLedger({
  captureAt,
  observations,
  paths,
  baselineCommit = BASELINE_COMMIT,
  readSource = gitBytes,
}) {
  assert.match(baselineCommit, /^[a-f0-9]{40}$/);
  assert.ok(
    typeof captureAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(captureAt) &&
      new Date(captureAt).toISOString() === captureAt,
    "Supply an explicit canonical capture instant",
  );
  assert.equal(
    observations.length,
    4,
    "Use the four inspected public metadata observations only",
  );
  const sourceKeys = paths
    .map((path) => path.slice("src/content/".length, -3))
    .sort();
  const limitations = [
    "This initial capture establishes current draft coverage, not a known January baseline or an earlier status history.",
    "The one PR-backed artifact is an editorial correction to two claim subjects; it is not a scientific result, independent review or problem resolution.",
    "Source-derived case descriptions and manuscript bylines do not establish performed Charitology fieldwork or documented complete human authorship.",
    "Public GitHub observations describe only the named objects at their recorded inspection time. An empty returned review list is not proof about reviews elsewhere.",
  ];
  const input = {
    manifest: {
      schemaVersion: 1,
      adapterVersion: "research-content-v1",
      currentEditionId: INITIAL_EDITION_ID,
      capture: {
        id: "capture:2026-10-27-initial",
        at: captureAt,
        commit: baselineCommit,
      },
      coverage: {
        includedSourceKeys: sourceKeys,
        excludedKinds: [
          "Private local research registers",
          "Other content collections and unregistered method claims",
          "Unprovided scientific review and disposition records",
        ],
        limitations,
      },
      currentSources: [],
      aliases: [
        {
          sourceKey: "manifesto/ten-dollars",
          recordId: "manuscript:ten-dollars",
          href: "/manifesto/",
        },
      ],
    },
    records: [],
    versions: [],
    events: [],
    reviews: [],
    actors: [],
    observations: observations.map(object),
    editions: [],
    sources: [],
  };
  const snapshot = (sourceId, commit, path) => {
    const bytes = readSource(commit, path),
      text = decode(bytes);
    const value = object({
      id: sourceId,
      commit,
      path,
      sha256: researchRawHash(bytes),
      byteLength: bytes.length,
      text,
    });
    input.sources.push(value);
    return value;
  };
  const version = (
    recordId,
    subject,
    sources,
    number = 1,
    previousId = null,
  ) => {
    const value = object({
      id: `version:${recordId.replace(":", "-")}-v${number}`,
      recordId,
      version: number,
      previousId,
      adapterVersion: "research-content-v1",
      subject,
      subjectHash: researchSubjectHash(subject),
      authorship: unknown(),
      sources,
    });
    input.versions.push(value);
    return value;
  };
  const append = (recordId, fields) => {
    const prior = input.events
      .filter((event) => event.recordId === recordId)
      .at(-1);
    const value = object({
      id: `event:${recordId.replace(":", "-")}-${(prior?.sequence ?? 0) + 1}`,
      ordinal: input.events.length + 1,
      recordId,
      sequence: (prior?.sequence ?? 0) + 1,
      previousId: prior?.id ?? null,
      previousHash: prior?.hash ?? null,
      occurredAt: null,
      timeBasis: "undated",
      recordedAt: captureAt,
      actorIds: [],
      refs: [],
      observationIds: [],
      reason:
        "Initial capture of current source wording; no earlier independent review or historical event time is asserted.",
      ...fields,
    });
    input.events.push(value);
    return value;
  };
  for (const path of paths) {
    const sourceKey = path.slice("src/content/".length, -3),
      [collection, slug] = sourceKey.split("/"),
      recordId = `${kinds[collection]}:${slug}`;
    const source = snapshot(
      `source:current-${collection}-${slug}`,
      baselineCommit,
      path,
    );
    const captured = captureResearchEntry({ sourceKey, rawText: source.text });
    assert.equal(
      captured.declaredReview,
      "draft",
      "Do not seed uninspected reviewed entries",
    );
    if (collection === "problems")
      assert.equal(captured.declaredProblemState, "open");
    const current = version(recordId, captured.subject, [
      { sourceId: source.id, selector: { kind: "entry" } },
    ]);
    input.records.push(object({ id: recordId, kind: kinds[collection] }));
    const href =
      collection === "problems"
        ? `/open-problems/${slug}/`
        : collection === "cases"
          ? `/record/case-studies/${slug}/`
          : collection === "journal"
            ? `/record/journal/${slug}/`
            : `/record/${slug}/`;
    input.manifest.currentSources.push({
      sourceKey,
      recordId,
      sourceId: source.id,
      currentVersion: reference(current),
      href,
    });
    append(recordId, {
      type: "baseline",
      version: reference(current),
      initialProblemState: collection === "problems" ? "open" : null,
    });
  }
  const changes = [],
    sourceRefs = [
      evidence(
        prUrl,
        "PR #3: editorial scope and founding-poem framing correction",
      ),
    ];
  for (const historical of HISTORICAL) {
    const path = `src/content/${historical.sourceKey}.md`;
    const before = snapshot(
      `source:pr-3-before-${historical.suffix}`,
      BEFORE_COMMIT,
      path,
    );
    const after = snapshot(
      `source:pr-3-after-${historical.suffix}`,
      AFTER_COMMIT,
      path,
    );
    assert.equal(
      before.sha256,
      historical.before,
      "Historical before bytes differ from inspected PR source",
    );
    assert.equal(
      after.sha256,
      historical.after,
      "Historical after bytes differ from inspected PR source",
    );
    const selected = (source) => {
      const selector = captureResearchSelector({
        adapter: historical.adapter,
        rawText: source.text,
      });
      return {
        selector,
        subject: captureResearchClaim({
          parentId: historical.parentId,
          selector,
          rawText: source.text,
        }),
      };
    };
    const old = selected(before),
      next = selected(after);
    const first = version(historical.claimId, old.subject, [
      { sourceId: before.id, selector: old.selector },
    ]);
    const second = version(
      historical.claimId,
      next.subject,
      [{ sourceId: after.id, selector: next.selector }],
      2,
      first.id,
    );
    input.records.push(object({ id: historical.claimId, kind: "claim" }));
    append(historical.claimId, {
      type: "baseline",
      version: reference(second),
      initialProblemState: null,
      reason:
        "Capture the corrected claim as the current baseline while retaining its archived predecessor. The later-listed editorial artifact records the actual PR merge; this baseline does not invent an earlier ledger receipt.",
    });
    changes.push({ before: reference(first), after: reference(second) });
    sourceRefs.push(
      evidence(
        blobUrl(BEFORE_COMMIT, path),
        `PR #3 before: ${historical.sourceKey}`,
      ),
      evidence(
        blobUrl(AFTER_COMMIT, path),
        `PR #3 after: ${historical.sourceKey}`,
      ),
    );
  }
  const artifactId = "artifact:pr-3-editorial-framing";
  const artifact = version(
    artifactId,
    {
      type: "artifact",
      kind: "editorial-correction",
      title: "PR #3: bounded knowledge claim and founding-poem context",
      summary:
        "The Depth Census paragraph replaced a claim that nobody had checked with a statement about what Charitology has established. The founding poem received a narrower summary and an editorial note distinguishing literary framing from a history of philanthropy.",
      targets: changes.map((change) => change.after),
      sources: sourceRefs,
      finding: "not-applicable",
      limitations:
        "This source-backed editorial change does not verify the underlying research claims, establish independent human review or solve an open problem. No challenge submission is asserted. Historical poem source files declare October 26; the separately captured current manuscript declares October 25, so the whole manuscripts are not byte-identical.",
      funding: disclosure(),
      conflicts: disclosure(),
    },
    [],
  );
  input.records.push(object({ id: artifactId, kind: "artifact" }));
  const pr = input.observations.find(
    (entry) => entry.id === "observation:pr-3",
  );
  assert.ok(pr?.facts.mergedAt, "Inspected PR merge instant required");
  append(artifactId, {
    type: "artifact-recorded",
    artifact: reference(artifact),
    changes,
    challengeIds: [],
    occurredAt: pr.facts.mergedAt,
    timeBasis: "pr-merge",
    observationIds: ["observation:pr-3", "observation:pr-3-reviews"],
    refs: sourceRefs,
    reason:
      "Record the genuine merged editorial correction and its two exact before/after claim subjects. No reviewer, challenge, research finding or scientific disposition is inferred from the merge or the observed empty review-submission list.",
  });
  for (const key of ["records", "versions", "sources", "observations"])
    input[key].sort(byId);
  input.manifest.currentSources.sort((a, b) =>
    compare(a.sourceKey, b.sourceKey),
  );
  const pin = (values) =>
    values.map(({ id, hash }) => ({ id, hash })).sort(byId);
  const last = new Map(input.events.map((event) => [event.recordId, event]));
  input.editions.push(
    object({
      id: INITIAL_EDITION_ID,
      capturedAt: captureAt,
      period: { from: "2026-01-01T00:00:00.000Z", to: captureAt },
      recordPins: pin(input.records),
      versionPins: pin(input.versions),
      eventPins: pin(input.events),
      reviewPins: [],
      sourcePins: pin(input.sources),
      actorPins: [],
      observationPins: pin(input.observations),
      heads: input.records.map((record) => {
        const event = last.get(record.id);
        return {
          recordId: record.id,
          version: event.type === "baseline" ? event.version : event.artifact,
          eventId: event.id,
          eventHash: event.hash,
        };
      }),
      currentSources: structuredClone(input.manifest.currentSources),
      coverage: { sourceKeys, baselineKnownFrom: null, limitations },
    }),
  );
  input.events.sort(byId);
  validateResearchLedger(input, seedOptions(input));
  return input;
}

export function seedReport(input) {
  const valid = validateResearchLedger(input, seedOptions(input));
  const projection = projectResearchLedger(valid, {
    editionId: INITIAL_EDITION_ID,
  });
  const edition = input.editions.find(
    (value) => value.id === INITIAL_EDITION_ID,
  );
  const progress = researchProgress(valid, {
    editionId: INITIAL_EDITION_ID,
    ...edition.period,
  });
  const exported = researchLedgerExport(projection, {
    format: "json",
    eventIds: null,
  });
  return {
    baseline: input.manifest.capture.commit,
    capture: input.manifest.capture,
    counts: Object.fromEntries(
      LEDGER_GROUPS.map((key) => [key, input[key].length]),
    ),
    rawSourceBytes: input.sources.reduce(
      (sum, source) => sum + source.byteLength,
      0,
    ),
    canonicalInputBytes: Buffer.byteLength(canonicalResearchJson(input)),
    exportBytes: Buffer.byteLength(exported.text),
    inputHash: researchSubjectHash(input),
    editionHash: edition.hash,
    factualHash: projection.factualHash,
    progressHash: progress.inputHash,
    counters: projection.counters,
  };
}
export function seedFiles(input) {
  const result = new Map([["manifest.json", input.manifest]]);
  for (const key of LEDGER_GROUPS)
    for (const entry of input[key])
      result.set(`${key}/${entry.id.replace(":", "--")}.json`, entry);
  return new Map(
    [...result].map(([path, value]) => [
      path,
      JSON.stringify(value, null, 2) + "\n",
    ]),
  );
}
export function assertWorkingMatchesBaseline(
  input,
  {
    readWorking = (path) => readFileSync(join(repository, path)),
    readCommitted = gitBytes,
  } = {},
) {
  for (const binding of input.manifest.currentSources) {
    const source = input.sources.find((value) => value.id === binding.sourceId);
    const committed = readCommitted(input.manifest.capture.commit, source.path);
    assert.deepEqual(
      Buffer.from(source.text, "utf8"),
      committed,
      `Captured source differs from committed baseline: ${source.path}`,
    );
    assert.deepEqual(
      readWorking(source.path),
      committed,
      `Working source differs from committed baseline: ${source.path}`,
    );
  }
}
export function writeInitialSeed(input, dataRoot = DATA_ROOT) {
  seedReport(input);
  const files = seedFiles(input);
  const existingPaths = (dir, prefix = "") =>
    existsSync(dir)
      ? readdirSync(dir).flatMap((name) => {
          const path = join(dir, name),
            relative = `${prefix}${name}`,
            info = lstatSync(path);
          assert.ok(
            !info.isSymbolicLink(),
            "Refusing a symbolic-link output path",
          );
          return info.isDirectory()
            ? existingPaths(path, `${relative}/`)
            : [relative];
        })
      : [];
  for (const path of existingPaths(dataRoot))
    assert.ok(
      files.has(path),
      `Refusing to ignore an existing ledger output: ${path}`,
    );
  // Validate all outputs and old immutable bytes before creating any file.
  for (const [path, text] of files)
    if (existsSync(join(dataRoot, path)))
      assert.equal(
        readFileSync(join(dataRoot, path), "utf8"),
        text,
        `Refusing to replace existing capture: ${path}`,
      );
  for (const [path, text] of files) {
    const target = join(dataRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, text, { flag: "wx" });
  }
  return files.size;
}
function main(args) {
  const options = { write: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--write") options.write = true;
    else if (
      ["--capture-at", "--observations", "--baseline-ref"].includes(args[i])
    ) {
      const key = args[i].slice(2);
      assert.ok(
        !Object.hasOwn(options, key),
        `Duplicate capture option: ${args[i]}`,
      );
      assert.ok(
        args[i + 1] && !args[i + 1].startsWith("--"),
        `Value required for ${args[i]}`,
      );
      options[key] = args[++i];
    } else if (args[i] === "--help") {
      console.log(
        "Preview only by default. Initial capture: node scripts/capture-research-ledger.mjs --baseline-ref <committed-source-ref> --capture-at <explicit-UTC> --observations <inspected-public-observations.json> [--write]. Every write requires explicit --baseline-ref and byte equality with the working covered files. Later previews reuse pinned metadata. For future changes commit sources as A, then append the ledger in B; capture.commit identifies A, not B. This initial-seed tool refuses historical replacements. No fetch/API/build clock.",
      );
      return;
    } else throw Error(`Unknown capture option: ${args[i]}`);
  }
  const existing = existsSync(join(DATA_ROOT, "manifest.json"))
    ? readLedgerInput()
    : null;
  if (options.write)
    assert.ok(
      options["baseline-ref"],
      "--write requires explicit committed --baseline-ref",
    );
  const baselineRef =
    options["baseline-ref"] ??
    existing?.manifest.capture.commit ??
    BASELINE_COMMIT;
  assert.ok(
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(baselineRef) &&
      !baselineRef.includes(".."),
    "Use a bounded committed Git reference",
  );
  const baselineCommit = execFileSync(
    "git",
    [
      "-C",
      repository,
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${baselineRef}^{commit}`,
    ],
    { encoding: "utf8", maxBuffer: 1024 },
  ).trim();
  assert.match(baselineCommit, /^[a-f0-9]{40}$/);
  const captureAt = options["capture-at"] ?? existing?.manifest.capture.at;
  assert.ok(
    captureAt,
    "Initial capture requires explicit --capture-at; never use a build clock",
  );
  const observations = options.observations
    ? readLedgerJson(resolve(options.observations)).observations
    : existing?.observations;
  assert.ok(
    observations,
    "Initial capture requires inspected sanitized --observations input",
  );
  const input = createInitialLedger({
    captureAt,
    observations,
    baselineCommit,
    paths: baselineSourcePaths(baselineCommit),
  });
  const report = seedReport(input);
  if (options.write) {
    // Exact source equality is required before any output changes. A captures
    // committed source bytes; the later ledger commit B cannot name itself.
    assertWorkingMatchesBaseline(input);
    report.writtenOrIdenticalFiles = writeInitialSeed(input);
  }
  console.log(
    JSON.stringify(
      {
        mode: options.write ? "explicit-write" : "preview-no-write",
        ...report,
      },
      null,
      2,
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(
      `Research ledger capture refused (${error.code ?? "capture"}): ${error.message}`,
    );
    process.exitCode = 1;
  }
}
