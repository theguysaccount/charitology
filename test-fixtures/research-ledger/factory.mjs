// Fictional declarations/results only. Never imported by a public loader.
import {
  researchObjectHash,
  researchSubjectHash,
  researchRawHash,
} from "../../src/lib/research-ledger-model.mjs";
import {
  captureResearchEntry,
  captureResearchSelector,
  captureResearchClaim,
} from "../../src/lib/research-ledger-capture.mjs";
export const at = "2026-10-27T10:00:00.000Z",
  recorded = "2026-10-27T09:00:00.000Z",
  evidence = {
    url: "https://example.invalid/fictional-proof",
    title: "Fictional fixture evidence; no human review occurred",
    locator: null,
  };
export const obj = (v) => ({
  ...structuredClone(v),
  hash: researchObjectHash(v),
});
export const ref = (v) => ({
  recordId: v.recordId,
  version: v.version,
  subjectHash: v.subjectHash,
});
export const unknown = () => ({
  state: "unknown",
  complete: false,
  actorIds: [],
  refs: [],
});
export const declared = () => ({
  state: "declared-none",
  note: null,
  refs: [evidence],
});
export function rawProblem(
  status = "open",
  review = "draft",
  body = "A fictional research question.",
) {
  return `---\ntitle: Fictional problem\nnumber: 1\nstatement: Fictional question\nprogress: A fictional exact criterion\nstatus: ${status}\nreview: ${review}\n---\n\n${body}\n`;
}
export function source(id, rawText, key = "problems/fictional") {
  return obj({
    id,
    commit: researchRawHash(id).slice(0, 40),
    path: `src/content/${key}.md`,
    text: rawText,
    byteLength: Buffer.byteLength(rawText),
    sha256: researchRawHash(rawText),
  });
}
export function version(
  recordId,
  subject,
  sources = [],
  authorship = unknown(),
  number = 1,
  previousId = null,
) {
  return obj({
    id: `version:${recordId.replace(":", "-")}-${number}`,
    recordId,
    version: number,
    previousId,
    adapterVersion: "research-content-v1",
    subject,
    subjectHash: researchSubjectHash(subject),
    authorship,
    sources,
  });
}
export function event(input, extra) {
  const prior = input.events
    .filter((e) => e.recordId === extra.recordId)
    .at(-1);
  const e = obj({
    id: `event:fictional-${input.events.length + 1}`,
    ordinal: input.events.length + 1,
    sequence: (prior?.sequence ?? 0) + 1,
    previousId: prior?.id ?? null,
    previousHash: prior?.hash ?? null,
    occurredAt: null,
    timeBasis: "undated",
    recordedAt: recorded,
    actorIds: [],
    refs: extra.type === "baseline" ? [] : [evidence],
    observationIds: [],
    reason: "Fictional fixture activity; not public research.",
    ...extra,
  });
  input.events.push(e);
  return e;
}
const pin = (values) =>
  values
    .map((v) => ({ id: v.id, hash: v.hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
export function repin(input, { newEditionId = null, capture = at } = {}) {
  for (const key of [
    "records",
    "versions",
    "reviews",
    "actors",
    "sources",
    "observations",
  ])
    input[key] = input[key].map(obj);
  const lasts = new Map();
  input.events = input.events.map((e) => {
    const p = lasts.get(e.recordId),
      next = obj({ ...e, previousHash: p?.hash ?? null });
    lasts.set(e.recordId, next);
    return next;
  });
  const heads = new Map();
  for (const e of input.events) {
    if (e.type === "baseline") heads.set(e.recordId, e.version);
    if (e.type === "version-recorded") heads.set(e.recordId, e.after);
    if (e.type === "artifact-recorded") heads.set(e.recordId, e.artifact);
  }
  const editionId = newEditionId ?? input.manifest.currentEditionId,
    edition = obj({
      id: editionId,
      capturedAt: capture,
      period: { from: "2026-01-01T00:00:00.000Z", to: capture },
      recordPins: pin(input.records),
      versionPins: pin(input.versions),
      eventPins: pin(input.events),
      reviewPins: pin(input.reviews),
      sourcePins: pin(input.sources),
      actorPins: pin(input.actors),
      observationPins: pin(input.observations),
      heads: [...heads]
        .map(([recordId, version]) => ({
          recordId,
          version,
          eventId: lasts.get(recordId).id,
          eventHash: lasts.get(recordId).hash,
        }))
        .sort((a, b) => a.recordId.localeCompare(b.recordId)),
      currentSources: structuredClone(input.manifest.currentSources),
      coverage: {
        sourceKeys: [...input.manifest.coverage.includedSourceKeys],
        baselineKnownFrom: null,
        limitations: ["Synthetic fixture only; no real research/review."],
      },
    });
  input.editions = input.editions.filter((x) => x.id !== editionId);
  input.editions.push(edition);
  input.manifest.currentEditionId = editionId;
  input.manifest.capture.at = capture;
  return input;
}
export function fixture() {
  const raw = rawProblem(),
    s = source("source:fictional-open", raw),
    captured = captureResearchEntry({
      sourceKey: "problems/fictional",
      rawText: raw,
    }),
    v = version("problem:fictional", captured.subject, [
      { sourceId: s.id, selector: { kind: "entry" } },
    ]),
    input = {
      manifest: {
        schemaVersion: 1,
        adapterVersion: "research-content-v1",
        currentEditionId: "edition:fictional-one",
        capture: { id: "capture:fictional-one", at, commit: "a".repeat(40) },
        coverage: {
          includedSourceKeys: ["problems/fictional"],
          excludedKinds: ["Private local registers"],
          limitations: ["Synthetic fixture only."],
        },
        currentSources: [
          {
            sourceKey: "problems/fictional",
            recordId: v.recordId,
            sourceId: s.id,
            currentVersion: ref(v),
            href: "/open-problems/fictional/",
          },
        ],
        aliases: [],
      },
      records: [obj({ id: v.recordId, kind: "problem" })],
      versions: [v],
      events: [],
      reviews: [],
      actors: [],
      observations: [],
      editions: [],
      sources: [s],
    };
  event(input, {
    type: "baseline",
    recordId: v.recordId,
    version: ref(v),
    initialProblemState: "open",
  });
  return repin(input);
}
export function options(input) {
  return {
    currentContent: input.manifest.currentSources.map((b) => {
      const s = input.sources.find((x) => x.id === b.sourceId);
      return {
        sourceKey: b.sourceKey,
        href: b.href,
        rawText: s.text,
        ...captureResearchEntry({ sourceKey: b.sourceKey, rawText: s.text }),
      };
    }),
    uncoveredReviews: [],
  };
}
export function actor(name) {
  return obj({
    id: `actor:${name}`,
    kind: "person",
    publicName: `Fictional ${name}`,
    profileUrls: [`https://example.invalid/people/${name}`],
    aliases: [],
    humanWork: "publicly-declared",
    declarationRefs: [evidence],
  });
}
export function fullAuth(actorId) {
  return {
    state: "documented",
    complete: true,
    actorIds: [actorId],
    refs: [evidence],
  };
}
export function review(
  v,
  scope,
  who,
  by,
  suffix,
  when = "2026-10-27T08:00:00.000Z",
) {
  return obj({
    id: `review:${suffix}`,
    subject: ref(v),
    scope,
    reviewerId: who,
    statement:
      "Fictional full-source independent review; no real person performed this work.",
    sourcesChecked: [evidence],
    statementRefs: [evidence],
    occurredAt: when,
    independence: "declared-independent",
    conflicts: declared(),
    inspection: {
      by,
      at: recorded,
      refs: [evidence],
      decision: "eligible",
      reason: "Fictional inspected declaration for a synthetic test only.",
    },
    disposition: "approve",
  });
}
export function setCompatibility(
  input,
  status,
  reviewState = "draft",
  name = "latest",
) {
  const b = input.manifest.currentSources[0],
    raw = rawProblem(status, reviewState),
    s = source(`source:fictional-${name}`, raw);
  input.sources.push(s);
  b.sourceId = s.id;
  return input;
}
export function scientificFixture() {
  const input = fixture(),
    author = actor("author"),
    a = actor("researcher"),
    b = actor("disposition-reviewer");
  input.actors.push(author, a, b);
  input.versions[0].authorship = fullAuth(author.id);
  input.versions[0] = obj(input.versions[0]);
  const p = input.versions[0],
    result = version(
      "artifact:fictional-result",
      {
        type: "artifact",
        kind: "theoretical-result",
        title: "Fictional theoretical result",
        summary: "No theorem was proved or research performed.",
        targets: [ref(p)],
        sources: [evidence],
        finding: "unknown",
        limitations: "Synthetic example only.",
        funding: declared(),
        conflicts: declared(),
      },
      [],
      fullAuth(author.id),
    );
  input.records.push(obj({ id: result.recordId, kind: "artifact" }));
  input.versions.push(result);
  event(input, {
    type: "artifact-recorded",
    recordId: result.recordId,
    artifact: ref(result),
    changes: [],
    challengeIds: [],
  });
  const decision = version(
    "decision:fictional-solved",
    {
      type: "decision",
      problem: ref(p),
      from: "open",
      to: "solved",
      results: [ref(result)],
      criterion: p.subject.frontmatter.progress,
      reason: "Fictional disposition only.",
      limitations: "No real problem was solved.",
    },
    [],
    fullAuth(author.id),
  );
  input.records.push(obj({ id: decision.recordId, kind: "decision" }));
  input.versions.push(decision);
  event(input, {
    type: "baseline",
    recordId: decision.recordId,
    version: ref(decision),
    initialProblemState: null,
  });
  const rr = review(result, "research", a.id, author.id, "fictional-research"),
    dr = review(decision, "disposition", b.id, author.id, "fictional-decision");
  input.reviews.push(rr, dr);
  event(input, {
    type: "review-recorded",
    recordId: result.recordId,
    reviewId: rr.id,
  });
  event(input, {
    type: "review-recorded",
    recordId: decision.recordId,
    reviewId: dr.id,
  });
  event(input, {
    type: "problem-disposition",
    recordId: p.recordId,
    decision: ref(decision),
    researchReviewIds: [rr.id],
    decisionReviewIds: [dr.id],
    occurredAt: "2026-10-27T08:30:00.000Z",
    timeBasis: "public-decision",
  });
  setCompatibility(input, "solved");
  return repin(input);
}

export function journalFixture() {
  const input = fixture(),
    key = "journal/fictional",
    raw =
      "---\ntitle: Fictional manuscript\nauthor: Fictional author\ndate: 2026-10-27\nsummary: Fictional method proposal\nvolume: 0\nissue: 1\nreview: draft\n---\n\nNo real research or reviews.\n",
    author = actor("journal-author"),
    a = actor("journal-reviewer-a"),
    b = actor("journal-reviewer-b"),
    s = source("source:journal-draft", raw, key),
    v = version(
      "manuscript:fictional",
      captureResearchEntry({ sourceKey: key, rawText: raw }).subject,
      [{ sourceId: s.id, selector: { kind: "entry" } }],
      fullAuth(author.id),
    );
  input.records = [obj({ id: v.recordId, kind: "manuscript" })];
  input.versions = [v];
  input.events = [];
  input.sources = [s];
  input.actors = [author, a, b];
  input.manifest.coverage.includedSourceKeys = [key];
  input.manifest.currentSources = [
    {
      sourceKey: key,
      recordId: v.recordId,
      sourceId: s.id,
      currentVersion: ref(v),
      href: "/record/journal/fictional/",
    },
  ];
  event(input, {
    type: "baseline",
    recordId: v.recordId,
    version: ref(v),
    initialProblemState: null,
  });
  for (const [scope, who, suffix] of [
    ["source-framing", a.id, "journal-framing"],
    ["peer-review", a.id, "journal-peer-a"],
    ["peer-review", b.id, "journal-peer-b"],
  ]) {
    const r = review(v, scope, who, author.id, suffix);
    input.reviews.push(r);
    event(input, {
      type: "review-recorded",
      recordId: v.recordId,
      reviewId: r.id,
    });
  }
  const latest = source(
    "source:journal-reviewed",
    raw.replace("review: draft", "review: reviewed"),
    key,
  );
  input.sources.push(latest);
  input.manifest.currentSources[0].sourceId = latest.id;
  return repin(input);
}
export function challengeFixture() {
  const input = fixture(),
    key = "problems/the-depth-census",
    parent = "problem:fictional",
    before = rawProblem(
      "open",
      "draft",
      "## Why it matters\n\nFictional earlier scope claim.",
    ),
    after = rawProblem(
      "open",
      "draft",
      "## Why it matters\n\nFictional later scope claim.",
    ),
    s1 = source("source:claim-before", before, key),
    s2 = source("source:claim-after", after, key);
  input.sources = [s1, s2];
  input.versions[0] = version(
    parent,
    captureResearchEntry({ sourceKey: key, rawText: after }).subject,
    [{ sourceId: s2.id, selector: { kind: "entry" } }],
  );
  input.events = [];
  input.manifest.coverage.includedSourceKeys = [key];
  input.manifest.currentSources = [
    {
      sourceKey: key,
      recordId: parent,
      sourceId: s2.id,
      currentVersion: ref(input.versions[0]),
      href: "/open-problems/the-depth-census/",
    },
  ];
  event(input, {
    type: "baseline",
    recordId: parent,
    version: ref(input.versions[0]),
    initialProblemState: "open",
  });
  const selector1 = captureResearchSelector({
      adapter: "depth-census-knowledge-v1",
      rawText: before,
    }),
    selector2 = captureResearchSelector({
      adapter: "depth-census-knowledge-v1",
      rawText: after,
    }),
    claim1 = version(
      "claim:fictional",
      captureResearchClaim({
        parentId: parent,
        selector: selector1,
        rawText: before,
      }),
      [{ sourceId: s1.id, selector: selector1 }],
    ),
    claim2 = version(
      "claim:fictional",
      captureResearchClaim({
        parentId: parent,
        selector: selector2,
        rawText: after,
      }),
      [{ sourceId: s2.id, selector: selector2 }],
      unknown(),
      2,
      claim1.id,
    );
  input.records.push(obj({ id: claim1.recordId, kind: "claim" }));
  input.versions.push(claim1, claim2);
  event(input, {
    type: "baseline",
    recordId: claim1.recordId,
    version: ref(claim2),
    initialProblemState: null,
  });
  const challenge = version("challenge:fictional", {
    type: "challenge",
    target: ref(claim1),
    title: "Fictional challenge",
    argument: "Fictional scope objection.",
    sources: [evidence],
    crux: "Check exact scope.",
  });
  input.records.push(obj({ id: challenge.recordId, kind: "challenge" }));
  input.versions.push(challenge);
  event(input, {
    type: "baseline",
    recordId: challenge.recordId,
    version: ref(challenge),
    initialProblemState: null,
  });
  const response = event(input, {
      type: "response",
      recordId: challenge.recordId,
      challenge: ref(challenge),
      response: "Fictional response narrows the scope.",
      dissent: ["Fictional dissent retained."],
    }),
    artifact = version("artifact:fictional-correction", {
      type: "artifact",
      kind: "editorial-correction",
      title: "Fictional correction",
      summary: "No real contribution took place.",
      targets: [ref(claim2)],
      sources: [evidence],
      finding: "not-applicable",
      limitations: "Fictional only.",
      funding: { state: "unknown", note: null, refs: [] },
      conflicts: { state: "unknown", note: null, refs: [] },
    });
  input.records.push(obj({ id: artifact.recordId, kind: "artifact" }));
  input.versions.push(artifact);
  event(input, {
    type: "artifact-recorded",
    recordId: artifact.recordId,
    artifact: ref(artifact),
    changes: [{ before: ref(claim1), after: ref(claim2) }],
    challengeIds: [challenge.recordId],
  });
  event(input, {
    type: "challenge-disposition",
    recordId: challenge.recordId,
    challenge: ref(challenge),
    responseIds: [response.id],
    disposition: "scope-narrowed",
    resultingClaims: [ref(claim2)],
    dissent: ["Fictional dissent retained."],
  });
  return repin(input);
}
