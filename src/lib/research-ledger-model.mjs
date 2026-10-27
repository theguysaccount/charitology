import {
  LEDGER_LIMITS,
  LedgerError,
  fail,
  plain,
  exact,
  text,
  id,
  hash,
  integer,
  choice,
  bool,
  list,
  unique,
  day,
  instant,
  publicUrl,
  refs,
  frozen,
  clone,
  canonicalResearchJson,
  researchSubjectHash,
  researchObjectHash,
  researchRawHash,
  checkHash,
  bytes,
} from "./research-ledger-canonical.mjs";
import {
  captureResearchEntry,
  captureResearchClaim,
} from "./research-ledger-capture.mjs";
export {
  LEDGER_LIMITS,
  LedgerError,
  canonicalResearchJson,
  researchSubjectHash,
  researchObjectHash,
  researchRawHash,
};
const STATES = ["open", "partial", "solved", "under-review"],
  KINDS = [
    "problem",
    "manuscript",
    "case",
    "method",
    "claim",
    "artifact",
    "challenge",
    "decision",
  ],
  SCIENTIFIC = [
    "empirical-result",
    "replication-result",
    "synthesis-result",
    "theoretical-result",
  ],
  GROUPS = [
    "records",
    "versions",
    "events",
    "reviews",
    "actors",
    "observations",
    "editions",
    "sources",
  ];
const validated = new WeakMap(),
  projected = new WeakSet();
const eq = (a, b) => canonicalResearchJson(a) === canonicalResearchJson(b);
const refKey = (r) => `${r.recordId}/${r.version}`;
function ids(v, max = 20, path = "", min = 0) {
  list(v, max, path, min);
  v.forEach((x) => id(x, path));
  unique(v, path);
  return v;
}
function strings(v, max = 20, length = 4000, path = "") {
  list(v, max, path);
  v.forEach((x) => text(x, length, path));
  unique(v, path);
  return v;
}
function vref(r, path = "") {
  exact(r, ["recordId", "version", "subjectHash"], path);
  id(r.recordId, path);
  integer(r.version, 1, 3000, path);
  hash(r.subjectHash, path);
  return r;
}
function vrefs(v, min = 0) {
  list(v, 20, "version references", min);
  v.forEach((x) => vref(x));
  unique(v.map(refKey));
  return v;
}
function disclosure(d) {
  exact(d, ["state", "note", "refs"], "disclosure");
  choice(d.state, ["unknown", "declared-none", "declared"]);
  text(d.note, 4000, "disclosure.note", true);
  refs(d.refs, "disclosure.refs", d.state === "unknown" ? 0 : 1);
  if (d.state === "declared" && !d.note)
    fail(
      "qualification",
      "A declared conflict/funding disclosure needs an explanation.",
    );
}
function route(v) {
  text(v, 1200, "route");
  if (
    !/^\/(?!\/)[A-Za-z0-9_/%:.-]*\/$/.test(v) ||
    v.includes("..") ||
    /%(?:2f|5c|25)/i.test(v)
  )
    fail("source", "Use a bounded root-relative entry route.");
  return v;
}
function commit(v) {
  if (typeof v !== "string" || !/^[a-f0-9]{40}$/.test(v))
    fail("source", "Use an exact Git commit SHA.");
  return v;
}
function sourcePath(path) {
  text(path, 200, "source path");
  if (
    !/^src\/content\/(problems|journal|cases)\/[a-z0-9][a-z0-9-]{0,99}\.md$/.test(
      path,
    ) &&
    path !== "src/content/record/methodology.md"
  )
    fail("source", "Snapshot path is outside frozen source adapters.");
  return path.slice("src/content/".length, -3);
}
function authorship(a, actorMap) {
  exact(a, ["state", "complete", "actorIds", "refs"], "authorship");
  choice(a.state, ["unknown", "documented"]);
  bool(a.complete);
  ids(a.actorIds);
  refs(a.refs);
  a.actorIds.forEach((x) => {
    if (!actorMap.has(x)) fail("reference", "Author actor is missing.");
  });
  if (a.state === "unknown" && (a.complete || a.actorIds.length))
    fail(
      "qualification",
      "Unknown authorship cannot claim a complete author set.",
    );
  if (a.state === "documented" && (!a.actorIds.length || !a.refs.length))
    fail(
      "qualification",
      "Documented authorship needs identities and public references.",
    );
}
function subjectShape(s) {
  if (!plain(s)) fail("shape", "Subject must be an object.");
  switch (s.type) {
    case "entry":
      exact(s, ["type", "collection", "frontmatter", "body"]);
      choice(s.collection, ["problems", "journal", "cases", "record"]);
      if (!plain(s.frontmatter))
        fail("source", "Entry frontmatter must be a mapping.");
      text(s.body, 32768, "body", false, true);
      break;
    case "claim":
      exact(s, [
        "type",
        "parentId",
        "title",
        "statement",
        "context",
        "evidence",
        "sources",
      ]);
      id(s.parentId);
      text(s.title, 500);
      text(s.statement, 32768);
      text(s.context, 32768, "context", true);
      choice(s.evidence, [
        "established",
        "documented",
        "debated",
        "hypothesis",
        "not-applicable",
      ]);
      refs(s.sources);
      break;
    case "artifact":
      exact(s, [
        "type",
        "kind",
        "title",
        "summary",
        "targets",
        "sources",
        "finding",
        "limitations",
        "funding",
        "conflicts",
      ]);
      choice(s.kind, [
        ...SCIENTIFIC,
        "editorial-correction",
        "proposed-method",
        "software-check",
      ]);
      text(s.title, 500);
      text(s.summary, 4000);
      vrefs(s.targets, 1);
      refs(s.sources, "artifact.sources", 1);
      choice(s.finding, [
        "positive",
        "null",
        "negative",
        "inconclusive",
        "not-applicable",
        "unknown",
      ]);
      if (!SCIENTIFIC.includes(s.kind) && s.finding !== "not-applicable")
        fail(
          "qualification",
          "Editorial/proposed/software artifacts cannot claim a scientific finding.",
        );
      text(s.limitations, 4000);
      disclosure(s.funding);
      disclosure(s.conflicts);
      break;
    case "challenge":
      exact(s, ["type", "target", "title", "argument", "sources", "crux"]);
      vref(s.target);
      text(s.title, 500);
      text(s.argument, 4000);
      refs(s.sources, "challenge sources", 1);
      text(s.crux, 4000);
      break;
    case "decision":
      exact(s, [
        "type",
        "problem",
        "from",
        "to",
        "results",
        "criterion",
        "reason",
        "limitations",
      ]);
      vref(s.problem);
      choice(s.from, STATES);
      choice(s.to, ["open", "partial", "solved"]);
      vrefs(s.results, 1);
      text(s.criterion, 4000);
      text(s.reason, 4000);
      text(s.limitations, 4000);
      break;
    default:
      fail("shape", "Unsupported subject kind.");
  }
}
function sourceBindings(v, ctx) {
  list(
    v.sources,
    10,
    "source bindings",
    ["entry", "claim"].includes(v.subject.type) ? 1 : 0,
  );
  for (const b of v.sources) {
    exact(b, ["sourceId", "selector"], "source binding");
    id(b.sourceId);
    const source = ctx.sources.get(b.sourceId);
    if (!source) fail("reference", "Source snapshot is missing.");
    if (v.subject.type === "entry") {
      exact(b.selector, ["kind"]);
      if (b.selector.kind !== "entry")
        fail("source", "Entry needs the whole-entry selector.");
      if (!eq(ctx.captured.get(source.id).subject, v.subject))
        fail(
          "source",
          "Entry subject differs from the exact archived source projection.",
          v.id,
        );
      const key = sourcePath(source.path),
        prior = ctx.sourceRecords.get(key);
      if (prior && prior !== v.recordId)
        fail("source", "A source key cannot identify different records.");
      ctx.sourceRecords.set(key, v.recordId);
    } else if (v.subject.type === "claim") {
      const expectedKey =
        b.selector?.adapter === "depth-census-knowledge-v1"
          ? "problems/the-depth-census"
          : "journal/ten-dollars";
      if (sourcePath(source.path) !== expectedKey)
        fail(
          "source",
          "Claim selector must use its frozen actual source path.",
        );
      if (b.selector?.kind !== "claim")
        fail("source", "Claim needs an exact supported selector.");
      const claim = captureResearchClaim({
        parentId: v.subject.parentId,
        selector: b.selector,
        rawText: source.text,
      });
      if (!eq(claim, v.subject))
        fail("source", "Claim differs from its exact source slices.", v.id);
    } else {
      if (b.selector?.kind !== "entry")
        fail("source", "Supporting artifact snapshots use an entry selector.");
      exact(b.selector, ["kind"]);
    }
  }
}
function actorGroups(actors) {
  const parent = new Map(actors.map((a) => [a.id, a.id])),
    find = (x) => {
      const p = parent.get(x);
      if (p === undefined) fail("reference", "Actor alias is missing.");
      if (p === x) return x;
      const root = find(p);
      parent.set(x, root);
      return root;
    },
    union = (a, b) => {
      const x = find(a),
        y = find(b);
      if (x !== y) parent.set(x < y ? y : x, x < y ? x : y);
    };
  const profiles = new Map();
  for (const a of actors) {
    for (const alias of a.aliases) union(a.id, alias);
    for (const p of a.profileUrls) {
      if (profiles.has(p)) union(a.id, profiles.get(p));
      else profiles.set(p, a.id);
    }
  }
  return new Map(actors.map((a) => [a.id, find(a.id)]));
}
function contextFor(g) {
  const ctx = {};
  for (const key of GROUPS) ctx[key] = new Map(g[key].map((x) => [x.id, x]));
  ctx.versionRefs = new Map(g.versions.map((v) => [refKey(v), v]));
  ctx.captured = new Map();
  ctx.sourceRecords = new Map();
  ctx.ref = (r) => {
    vref(r);
    const v = ctx.versionRefs.get(refKey(r));
    if (!v || v.subjectHash !== r.subjectHash)
      fail("reference", "Exact subject version is missing.", refKey(r));
    return v;
  };
  return ctx;
}
function validateGraph(g) {
  const ctx = contextFor(g),
    all = new Set();
  for (const key of GROUPS)
    for (const row of g[key]) {
      if (!plain(row)) fail("shape", "Ledger object must be a mapping.");
      id(row.id, key);
      if (all.has(row.id))
        fail("reference", "IDs must be globally unique.", row.id);
      all.add(row.id);
      checkHash(row, row.id);
    }
  for (const r of g.records) {
    exact(r, ["id", "kind", "hash"]);
    choice(r.kind, KINDS);
  }
  for (const a of g.actors) {
    exact(a, [
      "id",
      "kind",
      "publicName",
      "profileUrls",
      "aliases",
      "humanWork",
      "declarationRefs",
      "hash",
    ]);
    choice(a.kind, ["person", "project", "organization", "unknown"]);
    text(a.publicName, 500);
    strings(a.profileUrls, 20, 1200);
    a.profileUrls.forEach((x) => publicUrl(x));
    ids(a.aliases);
    if (a.aliases.includes(a.id))
      fail("reference", "An actor cannot alias itself.");
    a.aliases.forEach((x) => {
      if (!ctx.actors.has(x)) fail("reference", "Alias actor is missing.");
    });
    choice(a.humanWork, ["unknown", "publicly-declared"]);
    refs(
      a.declarationRefs,
      "human declaration",
      a.humanWork === "publicly-declared" || a.aliases.length ? 1 : 0,
    );
    if (a.humanWork === "publicly-declared" && a.kind !== "person")
      fail(
        "qualification",
        "A project or organization cannot count as an independent human.",
      );
  }
  const aliasVisited = new Set(),
    aliasActive = new Set();
  function visitAlias(a) {
    if (aliasActive.has(a.id))
      fail("reference", "Actor alias declarations form a cycle.");
    if (aliasVisited.has(a.id)) return;
    aliasActive.add(a.id);
    a.aliases.forEach((x) => visitAlias(ctx.actors.get(x)));
    aliasActive.delete(a.id);
    aliasVisited.add(a.id);
  }
  g.actors.forEach(visitAlias);
  const gitLocations = new Map();
  for (const s of g.sources) {
    exact(s, ["id", "commit", "path", "sha256", "byteLength", "text", "hash"]);
    commit(s.commit);
    const key = sourcePath(s.path);
    hash(s.sha256);
    integer(s.byteLength, 0, LEDGER_LIMITS.sourceBytes);
    text(s.text, LEDGER_LIMITS.sourceBytes, "source text", false, true);
    if (bytes(s.text) !== s.byteLength || researchRawHash(s.text) !== s.sha256)
      fail(
        "hash",
        "Raw snapshot bytes do not match their SHA-256/length.",
        s.id,
      );
    const location = s.commit + ":" + s.path;
    if (gitLocations.has(location) && gitLocations.get(location) !== s.sha256)
      fail(
        "source",
        "One exact Git commit/path cannot assert different source bytes.",
      );
    gitLocations.set(location, s.sha256);
    ctx.captured.set(
      s.id,
      captureResearchEntry({ sourceKey: key, rawText: s.text }),
    );
  }
  const last = new Map();
  for (const v of [...g.versions].sort(
    (a, b) =>
      (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0) ||
      a.version - b.version,
  )) {
    exact(v, [
      "id",
      "recordId",
      "version",
      "previousId",
      "adapterVersion",
      "subject",
      "subjectHash",
      "authorship",
      "sources",
      "hash",
    ]);
    id(v.recordId);
    integer(v.version, 1, 3000);
    if (v.previousId !== null) id(v.previousId);
    if (v.adapterVersion !== "research-content-v1")
      fail("source", "Unsupported subject adapter version.");
    const r = ctx.records.get(v.recordId),
      prev = last.get(v.recordId);
    if (!r) fail("reference", "Version record is missing.");
    if (
      v.version !== (prev?.version ?? 0) + 1 ||
      v.previousId !== (prev?.id ?? null)
    )
      fail("chain", "Version predecessor sequence is invalid.", v.id);
    subjectShape(v.subject);
    if (v.subjectHash !== researchSubjectHash(v.subject))
      fail("hash", "Substantive subject hash does not match.", v.id);
    const expected = {
      problem: "problems",
      manuscript: "journal",
      case: "cases",
      method: "record",
    };
    if (expected[r.kind]) {
      if (
        v.subject.type !== "entry" ||
        v.subject.collection !== expected[r.kind]
      )
        fail("source", "Entry kind/collection mismatch.");
    } else if (v.subject.type !== r.kind)
      fail("shape", "Record kind does not match its subject.");
    authorship(v.authorship, ctx.actors);
    if (
      prev?.authorship.complete &&
      v.authorship.complete &&
      prev.authorship.actorIds.some(
        (x) => !v.authorship.actorIds.includes(x),
      ) &&
      v.authorship.refs.every((x) => prev.authorship.refs.some((y) => eq(x, y)))
    )
      fail(
        "qualification",
        "Removing a documented author requires a new public explanation.",
      );
    sourceBindings(v, ctx);
    last.set(v.recordId, v);
  }
  for (const r of g.records)
    if (!last.has(r.id))
      fail("reference", "Record has no subject version.", r.id);
  const deps = new Map();
  for (const v of g.versions) {
    const s = v.subject,
      links = [];
    if (s.type === "claim") {
      const parent = ctx.records.get(s.parentId);
      if (
        !parent ||
        !["problem", "manuscript", "case", "method"].includes(parent.kind)
      )
        fail("reference", "Claim parent must be a covered entry.");
      for (const binding of v.sources) {
        const key = sourcePath(ctx.sources.get(binding.sourceId).path);
        if (ctx.sourceRecords.get(key) !== s.parentId)
          fail("source", "Claim source belongs to another parent entry.");
      }
    }
    if (s.type === "artifact") links.push(...s.targets);
    if (s.type === "challenge") links.push(s.target);
    if (s.type === "decision") {
      const p = ctx.ref(s.problem);
      if (
        ctx.records.get(p.recordId).kind !== "problem" ||
        s.criterion !== p.subject.frontmatter.progress
      )
        fail(
          "source",
          "Decision must quote the exact problem progress criterion.",
        );
      for (const r of s.results) {
        const result = ctx.ref(r);
        if (
          result.subject.type !== "artifact" ||
          !SCIENTIFIC.includes(result.subject.kind) ||
          !result.subject.targets.some((t) => eq(t, s.problem))
        )
          fail(
            "qualification",
            "Decision needs explicitly targeted qualifying research-result kinds.",
          );
      }
      links.push(s.problem, ...s.results);
    }
    links.forEach((x) => ctx.ref(x));
    deps.set(
      v.id,
      links.map((x) => ctx.ref(x).id),
    );
  }
  const visited = new Set(),
    active = new Set();
  function visit(v) {
    if (active.has(v)) fail("reference", "Subject dependencies form a cycle.");
    if (visited.has(v)) return;
    active.add(v);
    for (const x of deps.get(v) ?? []) visit(x);
    active.delete(v);
    visited.add(v);
  }
  g.versions.forEach((v) => visit(v.id));
  for (const o of g.observations) {
    exact(o, ["id", "url", "observedAt", "kind", "facts", "hash"]);
    publicUrl(o.url);
    instant(o.observedAt);
    if (o.observedAt > g.manifest.capture.at)
      fail("source", "Observation is after the capture.");
    if (o.kind === "github-pull-request") {
      exact(o.facts, [
        "number",
        "state",
        "draft",
        "base",
        "head",
        "mergeCommit",
        "mergedAt",
      ]);
      integer(o.facts.number, 1, Number.MAX_SAFE_INTEGER);
      choice(o.facts.state, ["open", "closed"]);
      bool(o.facts.draft);
      commit(o.facts.base);
      commit(o.facts.head);
      if (o.facts.mergeCommit !== null) commit(o.facts.mergeCommit);
      if (o.facts.mergedAt !== null) {
        instant(o.facts.mergedAt);
        if (
          o.facts.mergedAt > o.observedAt ||
          o.facts.state !== "closed" ||
          o.facts.mergeCommit === null
        )
          fail("source", "Contradictory PR merge observation.");
      }
    } else if (o.kind === "github-issue") {
      exact(o.facts, ["number", "state", "commentCount"]);
      integer(o.facts.number, 1, Number.MAX_SAFE_INTEGER);
      choice(o.facts.state, ["open", "closed"]);
      integer(o.facts.commentCount, 0, Number.MAX_SAFE_INTEGER);
    } else if (o.kind === "github-review-list") {
      exact(o.facts, ["prNumber", "reviewIds"]);
      integer(o.facts.prNumber, 1, Number.MAX_SAFE_INTEGER);
      strings(o.facts.reviewIds, 2000, 100);
    } else fail("shape", "Unknown public observation kind.");
  }
  for (const r of g.reviews) {
    exact(r, [
      "id",
      "subject",
      "scope",
      "reviewerId",
      "statement",
      "sourcesChecked",
      "statementRefs",
      "occurredAt",
      "independence",
      "conflicts",
      "inspection",
      "disposition",
      "hash",
    ]);
    const v = ctx.ref(r.subject);
    choice(r.scope, [
      "source-framing",
      "research",
      "peer-review",
      "disposition",
    ]);
    if (!ctx.actors.has(r.reviewerId))
      fail("reference", "Reviewer actor is missing.");
    text(r.statement, 4000);
    refs(r.sourcesChecked, "checked sources", 1);
    refs(r.statementRefs, "review statement", 1);
    if (r.occurredAt !== null) instant(r.occurredAt);
    choice(r.independence, [
      "unknown",
      "declared-independent",
      "not-independent",
    ]);
    disclosure(r.conflicts);
    exact(r.inspection, ["by", "at", "refs", "decision", "reason"]);
    if (!ctx.actors.has(r.inspection.by))
      fail("reference", "Review inspector actor is missing.");
    instant(r.inspection.at);
    if (r.inspection.at > g.manifest.capture.at)
      fail("qualification", "Review inspection is after capture.");
    refs(r.inspection.refs, "inspection refs", 1);
    choice(r.inspection.decision, ["eligible", "ineligible", "unknown"]);
    text(r.inspection.reason, 4000);
    choice(r.disposition, ["approve", "request-changes", "comment"]);
    if (
      r.scope === "peer-review" &&
      ctx.records.get(v.recordId).kind !== "manuscript"
    )
      fail("qualification", "Peer review must target a manuscript.");
    if (
      r.scope === "research" &&
      (v.subject.type !== "artifact" || !SCIENTIFIC.includes(v.subject.kind))
    )
      fail("qualification", "Research review needs a research-result subject.");
    if (r.scope === "disposition" && v.subject.type !== "decision")
      fail("qualification", "Disposition review needs an exact decision.");
  }
  validateEvents(g, ctx);
  return ctx;
}
const EVENT_FIELDS = {
  baseline: ["version", "initialProblemState"],
  "version-recorded": ["before", "after"],
  "artifact-recorded": ["artifact", "changes", "challengeIds"],
  response: ["challenge", "response", "dissent"],
  "challenge-disposition": [
    "challenge",
    "responseIds",
    "disposition",
    "resultingClaims",
    "dissent",
  ],
  "review-recorded": ["reviewId"],
  "review-withdrawn": ["reviewId", "replacementReviewId"],
  "artifact-withdrawn": ["artifact", "replacement"],
  "problem-disposition": ["decision", "researchReviewIds", "decisionReviewIds"],
};
const BASE_EVENT = [
  "id",
  "ordinal",
  "recordId",
  "sequence",
  "previousId",
  "previousHash",
  "occurredAt",
  "timeBasis",
  "recordedAt",
  "actorIds",
  "refs",
  "observationIds",
  "reason",
  "hash",
  "type",
];
function validateEvents(g, ctx) {
  let ordinal = 0,
    recordedAt = "";
  const lasts = new Map();
  for (const e of [...g.events].sort((a, b) => a.ordinal - b.ordinal)) {
    if (!Object.hasOwn(EVENT_FIELDS, e.type))
      fail("shape", "Unknown ledger event.");
    exact(e, [...BASE_EVENT, ...EVENT_FIELDS[e.type]], e.id);
    if (!ctx.records.has(e.recordId))
      fail("reference", "Event record is missing.");
    integer(e.ordinal, 1, 5000);
    integer(e.sequence, 1, 5000);
    if (e.ordinal !== ++ordinal)
      fail("chain", "Global event ordinals must be contiguous.");
    const prior = lasts.get(e.recordId);
    if (
      e.sequence !== (prior?.sequence ?? 0) + 1 ||
      e.previousId !== (prior?.id ?? null) ||
      e.previousHash !== (prior?.hash ?? null)
    )
      fail("chain", "Per-record event predecessor is invalid.", e.id);
    instant(e.recordedAt);
    if (e.recordedAt < recordedAt || e.recordedAt > g.manifest.capture.at)
      fail(
        "chain",
        "Recorded event times must be nondecreasing and within capture.",
      );
    recordedAt = e.recordedAt;
    if (e.occurredAt !== null) {
      instant(e.occurredAt);
      if (e.occurredAt > e.recordedAt)
        fail("chain", "Public event time cannot follow its ledger recording.");
    }
    choice(e.timeBasis, ["public-decision", "pr-merge", "undated"]);
    if ((e.timeBasis === "undated") !== (e.occurredAt === null))
      fail("chain", "Undated and known event times disagree.");
    ids(e.actorIds);
    e.actorIds.forEach((x) => {
      if (!ctx.actors.has(x)) fail("reference", "Event actor is missing.");
    });
    refs(e.refs, "event sources", e.type === "baseline" ? 0 : 1);
    ids(e.observationIds);
    e.observationIds.forEach((x) => {
      if (!ctx.observations.has(x))
        fail("reference", "Event observation is missing.");
    });
    text(e.reason, 4000);
    if (e.type === "baseline") {
      ctx.ref(e.version);
      if (
        e.version.recordId !== e.recordId ||
        e.sequence !== 1 ||
        e.timeBasis !== "undated"
      )
        fail("chain", "Baseline establishes its own first undated head.");
      if (ctx.records.get(e.recordId).kind === "problem")
        choice(e.initialProblemState, ["open", "under-review"]);
      else if (e.initialProblemState !== null)
        fail("shape", "Only problem baselines have a problem state.");
    }
    if (e.type === "version-recorded") {
      const after = ctx.ref(e.after);
      if (after.recordId !== e.recordId)
        fail("reference", "Version event changes another record.");
      if (e.before !== null) {
        ctx.ref(e.before);
        if (
          e.before.recordId !== e.recordId ||
          e.after.version <= e.before.version
        )
          fail(
            "chain",
            "A new current version must advance its own prior version.",
          );
      }
    }
    if (e.type === "artifact-recorded") {
      const a = ctx.ref(e.artifact);
      if (a.recordId !== e.recordId || a.subject.type !== "artifact")
        fail("reference", "Artifact event targets its own artifact subject.");
      list(e.changes, 20);
      for (const c of e.changes) {
        exact(c, ["before", "after"]);
        const before = ctx.ref(c.before),
          after = ctx.ref(c.after);
        if (
          before.recordId !== after.recordId ||
          after.version <= before.version ||
          before.subject.type !== "claim" ||
          after.subject.type !== "claim"
        )
          fail(
            "reference",
            "Editorial changes need before/after versions of one claim.",
          );
        if (!a.subject.targets.some((t) => eq(t, c.after)))
          fail(
            "reference",
            "Changed claim is absent from the artifact targets.",
          );
      }
      unique(e.changes.map((x) => x.after.recordId));
      ids(e.challengeIds);
      e.challengeIds.forEach((x) => {
        if (ctx.records.get(x)?.kind !== "challenge")
          fail("reference", "Referenced challenge is missing.");
      });
      if (
        e.timeBasis === "pr-merge" &&
        (a.subject.kind !== "editorial-correction" ||
          !e.observationIds.some((x) => {
            const o = ctx.observations.get(x);
            return (
              o.kind === "github-pull-request" &&
              o.facts.mergedAt === e.occurredAt
            );
          }))
      )
        fail(
          "source",
          "PR merge time needs the exact observed editorial correction.",
        );
    } else if (e.timeBasis === "pr-merge")
      fail("source", "Only editorial artifact events can use a PR merge time.");
    if (e.type === "response" || e.type === "challenge-disposition") {
      const c = ctx.ref(e.challenge);
      if (c.recordId !== e.recordId || c.subject.type !== "challenge")
        fail("reference", "Challenge event must target its own challenge.");
      strings(e.dissent, 20, 4000);
      if (e.type === "response") text(e.response, 4000);
      else {
        ids(e.responseIds, 50, "responses", 1);
        e.responseIds.forEach((x) => {
          const response = ctx.events.get(x);
          if (
            response?.type !== "response" ||
            response.recordId !== e.recordId ||
            response.ordinal >= e.ordinal
          )
            fail(
              "reference",
              "Disposition needs its prior substantive responses.",
            );
        });
        choice(e.disposition, [
          "corrected",
          "scope-narrowed",
          "upheld-with-evidence",
          "unresolved",
          "withdrawn",
          "duplicate",
        ]);
        vrefs(
          e.resultingClaims,
          ["corrected", "scope-narrowed"].includes(e.disposition) ? 1 : 0,
        );
        e.resultingClaims.forEach((x) => {
          if (ctx.ref(x).subject.type !== "claim")
            fail("reference", "Resulting claim is not a claim.");
        });
      }
    }
    if (e.type === "review-recorded" || e.type === "review-withdrawn") {
      const r = ctx.reviews.get(e.reviewId);
      if (!r || r.subject.recordId !== e.recordId)
        fail("reference", "Review event must belong to its reviewed subject.");
      if (
        e.type === "review-withdrawn" &&
        e.replacementReviewId !== null &&
        !ctx.reviews.has(e.replacementReviewId)
      )
        fail("reference", "Replacement review is missing.");
    }
    if (e.type === "artifact-withdrawn") {
      const a = ctx.ref(e.artifact);
      if (a.recordId !== e.recordId || a.subject.type !== "artifact")
        fail("reference", "Artifact withdrawal belongs to its own artifact.");
      if (e.replacement !== null) ctx.ref(e.replacement);
    }
    if (e.type === "problem-disposition") {
      const d = ctx.ref(e.decision);
      if (
        d.subject.type !== "decision" ||
        d.subject.problem.recordId !== e.recordId ||
        e.timeBasis !== "public-decision"
      )
        fail(
          "qualification",
          "Problem disposition needs an exact decision and public decision time.",
        );
      ids(e.researchReviewIds, 20, "research reviews", 1);
      ids(e.decisionReviewIds, 20, "disposition reviews", 1);
      [...e.researchReviewIds, ...e.decisionReviewIds].forEach((x) => {
        if (!ctx.reviews.has(x))
          fail("reference", "Disposition review is missing.");
      });
    }
    lasts.set(e.recordId, e);
  }
}

function eventReferences(e) {
  if (e.type === "baseline") return [e.version];
  if (e.type === "version-recorded")
    return [e.after, ...(e.before ? [e.before] : [])];
  if (e.type === "artifact-recorded")
    return [e.artifact, ...e.changes.flatMap((c) => [c.before, c.after])];
  if (e.type === "response" || e.type === "challenge-disposition")
    return [e.challenge, ...(e.resultingClaims ?? [])];
  if (e.type === "artifact-withdrawn")
    return [e.artifact, ...(e.replacement ? [e.replacement] : [])];
  if (e.type === "problem-disposition") return [e.decision];
  return [];
}
function subjectReferences(s) {
  if (s.type === "artifact") return s.targets;
  if (s.type === "challenge") return [s.target];
  if (s.type === "decision") return [s.problem, ...s.results];
  return [];
}
const asRef = (v) => ({
  recordId: v.recordId,
  version: v.version,
  subjectHash: v.subjectHash,
});
function reduceEdition(g, ctx) {
  const state = {
    heads: new Map(),
    lastEvents: new Map(),
    known: new Set(),
    actors: new Set(),
    reviews: new Set(),
    withdrawnReviews: new Set(),
    withdrawnArtifacts: new Set(),
    problems: new Map(),
    dispositions: [],
    withdrawals: [],
    challengeStates: new Map(),
    snapshots: [],
    groups: new Map(),
  };
  const activate = (values) => {
    for (const value of values)
      if (!ctx.actors.has(value))
        fail("reference", "Recorded actor is not pinned.");
    const together = new Set([...state.actors, ...values]);
    for (const value of values)
      for (const alias of ctx.actors.get(value).aliases)
        if (!together.has(alias))
          fail(
            "chain",
            "Alias targets must already be recorded or introduced by the same event.",
          );
    values.forEach((x) => state.actors.add(x));
    state.groups = actorGroups([...state.actors].map((x) => ctx.actors.get(x)));
  };
  const sameActor = (a, b) => state.groups.get(a) === state.groups.get(b);
  const human = (a) => {
    const actor = ctx.actors.get(a);
    return (
      state.actors.has(a) &&
      actor?.kind === "person" &&
      actor.humanWork === "publicly-declared" &&
      actor.declarationRefs.length > 0
    );
  };
  const eligible = (review, scope, extraAuthors = []) => {
    if (
      !review ||
      !state.reviews.has(review.id) ||
      state.withdrawnReviews.has(review.id) ||
      review.scope !== scope ||
      review.disposition !== "approve" ||
      review.independence !== "declared-independent" ||
      review.inspection.decision !== "eligible" ||
      review.conflicts.state === "unknown"
    )
      return false;
    const v = ctx.ref(review.subject);
    if (
      state.heads.get(v.recordId) !== v.id ||
      !v.authorship.complete ||
      v.authorship.state !== "documented" ||
      state.withdrawnArtifacts.has(v.id)
    )
      return false;
    if (
      !human(review.reviewerId) ||
      !human(review.inspection.by) ||
      sameActor(review.reviewerId, review.inspection.by)
    )
      return false;
    return ![...v.authorship.actorIds, ...extraAuthors].some(
      (a) => !state.actors.has(a) || sameActor(a, review.reviewerId),
    );
  };
  const decisionEligible = (e) => {
    const d = ctx.ref(e.decision),
      s = d.subject,
      p = ctx.ref(s.problem);
    if (
      state.heads.get(d.recordId) !== d.id ||
      state.heads.get(p.recordId) !== p.id
    )
      return false;
    const results = s.results.map((r) => ctx.ref(r));
    if (
      results.some(
        (r) =>
          state.heads.get(r.recordId) !== r.id ||
          state.withdrawnArtifacts.has(r.id) ||
          !r.authorship.complete ||
          r.authorship.state !== "documented",
      ) ||
      !d.authorship.complete
    )
      return false;
    const authors = [
        ...d.authorship.actorIds,
        ...p.authorship.actorIds,
        ...results.flatMap((r) => r.authorship.actorIds),
      ],
      rr = e.researchReviewIds.map((x) => ctx.reviews.get(x)),
      dr = e.decisionReviewIds.map((x) => ctx.reviews.get(x));
    if (
      rr.some(
        (r) =>
          !eligible(r, "research", authors) ||
          r.occurredAt === null ||
          r.occurredAt > e.occurredAt,
      ) ||
      dr.some(
        (r) =>
          !eligible(r, "disposition", authors) ||
          r.occurredAt === null ||
          r.occurredAt > e.occurredAt,
      )
    )
      return false;
    if (
      results.some((v) => !rr.some((r) => eq(r.subject, asRef(v)))) ||
      !dr.every((r) => eq(r.subject, e.decision))
    )
      return false;
    return rr.some((r) =>
      dr.some((d) => !sameActor(r.reviewerId, d.reviewerId)),
    );
  };
  const refresh = () => {
    for (const p of state.problems.values()) {
      if (!p.event) continue;
      const okay = decisionEligible(p.event);
      p.effectiveStatus = okay ? p.lastRecordedStatus : "under-review";
      p.support = okay
        ? "current"
        : p.event.researchReviewIds.some((x) =>
              state.withdrawnReviews.has(x),
            ) ||
            p.event.decisionReviewIds.some((x) =>
              state.withdrawnReviews.has(x),
            ) ||
            ctx
              .ref(p.event.decision)
              .subject.results.some((x) =>
                state.withdrawnArtifacts.has(ctx.ref(x).id),
              )
          ? "withdrawn"
          : "ineligible";
    }
  };
  const knownRef = (r) => {
    const v = ctx.ref(r);
    if (!state.known.has(v.id))
      fail(
        "chain",
        "Cross-record subject dependency was not yet recorded.",
        v.id,
      );
    return v;
  };
  const register = (v) => {
    const chain = [];
    let current = v;
    while (current && !state.known.has(current.id)) {
      chain.unshift(current);
      current = current.previousId
        ? ctx.versions.get(current.previousId)
        : null;
    }
    activate([...new Set(chain.flatMap((item) => item.authorship.actorIds))]);
    for (const item of chain) {
      for (const dependency of subjectReferences(item.subject))
        knownRef(dependency);
      if (
        item.subject.type === "claim" &&
        !state.heads.has(item.subject.parentId)
      )
        fail("chain", "Claim parent must be recorded before the claim.");
      state.known.add(item.id);
    }
  };
  for (const e of [...g.events].sort((a, b) => a.ordinal - b.ordinal)) {
    const introduced = [...e.actorIds];
    for (const r of eventReferences(e)) {
      const v = ctx.ref(r);
      if (
        ["baseline", "version-recorded", "artifact-recorded"].includes(
          e.type,
        ) &&
        r.recordId === e.recordId
      )
        introduced.push(...v.authorship.actorIds);
    }
    if (e.type === "review-recorded") {
      const review = ctx.reviews.get(e.reviewId);
      introduced.push(review.reviewerId, review.inspection.by);
    }
    activate([...new Set(introduced)]);
    if (e.type === "baseline") {
      if (state.heads.has(e.recordId))
        fail("chain", "A baseline cannot overwrite an existing current head.");
      const v = ctx.ref(e.version);
      register(v);
      state.heads.set(e.recordId, v.id);
      if (ctx.records.get(e.recordId).kind === "problem")
        state.problems.set(e.recordId, {
          recordId: e.recordId,
          lastRecordedDisposition: null,
          lastRecordedStatus: e.initialProblemState,
          effectiveStatus: e.initialProblemState,
          support: "baseline",
          event: null,
        });
    } else if (e.type === "version-recorded") {
      const prior = state.heads.get(e.recordId);
      if ((e.before === null ? undefined : ctx.ref(e.before).id) !== prior)
        fail("chain", "Version event has a stale prior current head.");
      const v = ctx.ref(e.after);
      register(v);
      state.heads.set(e.recordId, v.id);
    } else if (e.type === "artifact-recorded") {
      const v = ctx.ref(e.artifact);
      if (state.heads.has(e.recordId) && state.heads.get(e.recordId) !== v.id)
        fail(
          "chain",
          "Record a new artifact version explicitly before its event.",
        );
      register(v);
      state.heads.set(e.recordId, v.id);
      for (const c of e.changes) {
        knownRef(c.before);
        knownRef(c.after);
      }
      for (const c of e.challengeIds)
        if (!state.heads.has(c))
          fail("chain", "Artifact challenge reference is not recorded.");
    } else if (e.type === "review-recorded") {
      const r = ctx.reviews.get(e.reviewId);
      knownRef(r.subject);
      if (state.reviews.has(r.id))
        fail("chain", "A review can be recorded only once.");
      if (
        (r.occurredAt !== null && r.occurredAt > e.recordedAt) ||
        r.inspection.at > e.recordedAt
      )
        fail("chain", "Review/inspection time follows its recording.");
      state.reviews.add(r.id);
    } else if (e.type === "review-withdrawn") {
      if (!state.reviews.has(e.reviewId))
        fail("chain", "Withdraw only an already recorded review.");
      if (
        e.replacementReviewId !== null &&
        !state.reviews.has(e.replacementReviewId)
      )
        fail("chain", "Replacement review must already be recorded.");
      state.withdrawnReviews.add(e.reviewId);
      state.withdrawals.push(e.id);
    } else if (e.type === "artifact-withdrawn") {
      knownRef(e.artifact);
      if (e.replacement !== null) knownRef(e.replacement);
      state.withdrawnArtifacts.add(ctx.ref(e.artifact).id);
      state.withdrawals.push(e.id);
    } else if (e.type === "response" || e.type === "challenge-disposition") {
      knownRef(e.challenge);
      if (e.type === "response")
        state.challengeStates.set(e.recordId, "response-recorded");
      else {
        e.resultingClaims.forEach(knownRef);
        state.challengeStates.set(e.recordId, e.disposition);
      }
    } else if (e.type === "problem-disposition") {
      knownRef(e.decision);
      const p = state.problems.get(e.recordId);
      if (
        !p ||
        ctx.ref(e.decision).subject.from !== p.effectiveStatus ||
        !decisionEligible(e)
      )
        fail(
          "qualification",
          "Disposition lacks current independently reviewed research/decision support.",
          e.id,
        );
      p.lastRecordedDisposition = clone(e.decision);
      p.lastRecordedStatus = ctx.ref(e.decision).subject.to;
      p.event = e;
      p.effectiveStatus = p.lastRecordedStatus;
      p.support = "current";
      state.dispositions.push(e.id);
    }
    state.lastEvents.set(e.recordId, e.id);
    refresh();
    state.snapshots.push({
      eventId: e.id,
      ordinal: e.ordinal,
      recordedAt: e.recordedAt,
      problems: [...state.problems.values()].map(({ event, ...p }) => clone(p)),
    });
  }
  if (state.actors.size !== g.actors.length)
    fail(
      "chain",
      "Every pinned actor needs a traceable first recorded event use.",
    );
  state.eligible = eligible;
  return state;
}

function pins(value, objects, path) {
  list(value, objects.size, path);
  const seen = new Set();
  let prior = "";
  return value.map((p) => {
    exact(p, ["id", "hash"], path);
    id(p.id);
    hash(p.hash);
    const obj = objects.get(p.id);
    if (!obj || obj.hash !== p.hash || seen.has(p.id) || p.id < prior)
      fail("edition", "Pin is missing, duplicated, changed or unsorted.", path);
    seen.add(p.id);
    prior = p.id;
    return obj;
  });
}
function coverage(c, current = false) {
  exact(
    c,
    current
      ? ["includedSourceKeys", "excludedKinds", "limitations"]
      : ["sourceKeys", "baselineKnownFrom", "limitations"],
    "coverage",
  );
  strings(current ? c.includedSourceKeys : c.sourceKeys, 1000, 200);
  strings(c.limitations, 20, 4000);
  if (current) strings(c.excludedKinds, 20, 100);
  else if (c.baselineKnownFrom !== null) instant(c.baselineKnownFrom);
}
function currentBindings(bindings, ctx) {
  list(bindings, 1000, "current sources");
  const keys = new Set(),
    records = new Set();
  for (const b of bindings) {
    exact(
      b,
      ["sourceKey", "recordId", "sourceId", "currentVersion", "href"],
      "current source binding",
    );
    text(b.sourceKey, 200);
    id(b.recordId);
    id(b.sourceId);
    route(b.href);
    const source = ctx.sources.get(b.sourceId),
      v = ctx.ref(b.currentVersion);
    if (
      !source ||
      sourcePath(source.path) !== b.sourceKey ||
      v.recordId !== b.recordId ||
      v.subject.type !== "entry" ||
      !eq(
        captureResearchEntry({ sourceKey: b.sourceKey, rawText: source.text })
          .subject,
        v.subject,
      )
    )
      fail(
        "source",
        "Current source capture differs from its exact entry version.",
      );
    if (keys.has(b.sourceKey) || records.has(b.recordId))
      fail(
        "reference",
        "Current sources must map one-to-one to entry records.",
      );
    keys.add(b.sourceKey);
    records.add(b.recordId);
  }
  return keys;
}
function validateEdition(edition, g, full) {
  exact(edition, [
    "id",
    "capturedAt",
    "period",
    "recordPins",
    "versionPins",
    "eventPins",
    "reviewPins",
    "sourcePins",
    "actorPins",
    "observationPins",
    "heads",
    "currentSources",
    "coverage",
    "hash",
  ]);
  instant(edition.capturedAt);
  if (edition.capturedAt > g.manifest.capture.at)
    fail("edition", "Edition capture follows the current capture.");
  exact(edition.period, ["from", "to"]);
  period(edition.period.from, edition.period.to, edition.capturedAt);
  coverage(edition.coverage);
  const sub = {};
  for (const [key, pinKey] of Object.entries({
    records: "recordPins",
    versions: "versionPins",
    events: "eventPins",
    reviews: "reviewPins",
    sources: "sourcePins",
    actors: "actorPins",
    observations: "observationPins",
  }))
    sub[key] = pins(edition[pinKey], full[key], pinKey);
  sub.editions = [];
  const ctx = contextFor(sub);
  const refsNeeded = [];
  for (const v of sub.versions) {
    if (
      !ctx.records.has(v.recordId) ||
      (v.previousId !== null && !ctx.versions.has(v.previousId))
    )
      fail("edition", "Edition omits version identity/predecessor closure.");
    v.sources.forEach((s) => {
      if (!ctx.sources.has(s.sourceId))
        fail("edition", "Edition omits a pinned source dependency.");
    });
    v.authorship.actorIds.forEach((a) => {
      if (!ctx.actors.has(a)) fail("edition", "Edition omits an author actor.");
    });
    refsNeeded.push(...subjectReferences(v.subject));
    if (v.subject.type === "claim" && !ctx.records.has(v.subject.parentId))
      fail("edition", "Edition omits a claim parent.");
  }
  for (const r of sub.reviews) {
    refsNeeded.push(r.subject);
    if (!ctx.actors.has(r.reviewerId) || !ctx.actors.has(r.inspection.by))
      fail("edition", "Edition omits a review identity.");
  }
  for (const a of sub.actors)
    a.aliases.forEach((x) => {
      if (!ctx.actors.has(x))
        fail("edition", "Edition omits an alias dependency.");
    });
  refsNeeded.forEach((r) => ctx.ref(r));
  const sortedEvents = [...sub.events].sort((a, b) => a.ordinal - b.ordinal);
  if (
    sortedEvents.some(
      (e, i) => e.ordinal !== i + 1 || e.recordedAt > edition.capturedAt,
    )
  )
    fail(
      "edition",
      "Edition must pin a complete recorded-order prefix within capture.",
    );
  for (const e of sub.events) {
    if (
      !ctx.records.has(e.recordId) ||
      e.actorIds.some((x) => !ctx.actors.has(x)) ||
      e.observationIds.some((x) => !ctx.observations.has(x))
    )
      fail("edition", "Edition omits event dependencies.");
    eventReferences(e).forEach((r) => ctx.ref(r));
    if (
      (e.reviewId && !ctx.reviews.has(e.reviewId)) ||
      (e.replacementReviewId && !ctx.reviews.has(e.replacementReviewId)) ||
      [...(e.researchReviewIds ?? []), ...(e.decisionReviewIds ?? [])].some(
        (x) => !ctx.reviews.has(x),
      )
    )
      fail("edition", "Edition omits exact reviews.");
  }
  for (const o of sub.observations)
    if (o.observedAt > edition.capturedAt)
      fail("edition", "Edition includes a future observation.");
  const reduction = reduceEdition(sub, ctx);
  if (reduction.heads.size !== sub.records.length)
    fail("edition", "Each pinned record needs a recorded current head.");
  list(edition.heads, 1000, "heads");
  unique(edition.heads.map((h) => h.recordId));
  if (edition.heads.length !== sub.records.length)
    fail("edition", "Edition head inventory is incomplete.");
  for (const h of edition.heads) {
    exact(h, ["recordId", "version", "eventId", "eventHash"]);
    const v = ctx.ref(h.version),
      e = ctx.events.get(h.eventId);
    if (
      h.recordId !== v.recordId ||
      reduction.heads.get(h.recordId) !== v.id ||
      reduction.lastEvents.get(h.recordId) !== h.eventId ||
      !e ||
      e.hash !== h.eventHash
    )
      fail(
        "edition",
        "Edition current head differs from its reduced event chain.",
      );
  }
  const keys = currentBindings(edition.currentSources, ctx);
  if (!eq([...keys].sort(), [...edition.coverage.sourceKeys].sort()))
    fail("edition", "Edition source coverage differs from actual bindings.");
  for (const b of edition.currentSources)
    if (reduction.heads.get(b.recordId) !== ctx.ref(b.currentVersion).id)
      fail("edition", "Current source does not bind the reduced current head.");
  if (sub.reviews.some((r) => !reduction.reviews.has(r.id)))
    fail("edition", "Pinned reviews need their recorded event.");
  return { sub, ctx, reduction };
}
function period(from, to, capture) {
  instant(from);
  instant(to);
  if (from >= to || to > capture)
    fail(
      "edition",
      "Use an explicit UTC interval ending no later than capture.",
    );
}

export function validateResearchLedger(input, options) {
  exact(input, ["manifest", ...GROUPS], "ledger");
  for (const key of GROUPS) list(input[key], LEDGER_LIMITS[key], key);
  for (const s of input.sources) {
    if (
      !plain(s) ||
      typeof s.text !== "string" ||
      s.text.length > LEDGER_LIMITS.sourceBytes ||
      bytes(s.text) > LEDGER_LIMITS.sourceBytes
    )
      fail("limit", "Raw source exceeds its admission bound.");
  }
  const raw = canonicalResearchJson(input);
  if (bytes(raw) > LEDGER_LIMITS.inputBytes)
    fail("limit", "Combined canonical ledger input exceeds 5 MiB.");
  const g = JSON.parse(raw),
    m = g.manifest;
  exact(m, [
    "schemaVersion",
    "adapterVersion",
    "currentEditionId",
    "capture",
    "coverage",
    "currentSources",
    "aliases",
  ]);
  if (m.schemaVersion !== 1 || m.adapterVersion !== "research-content-v1")
    fail("shape", "Unsupported ledger schema/capture adapter.");
  id(m.currentEditionId);
  exact(m.capture, ["id", "at", "commit"]);
  id(m.capture.id);
  instant(m.capture.at);
  commit(m.capture.commit);
  coverage(m.coverage, true);
  const full = validateGraph(g);
  currentBindings(m.currentSources, full);
  list(m.aliases, 1000, "aliases");
  const aliasKeys = new Set();
  for (const a of m.aliases) {
    exact(a, ["sourceKey", "recordId", "href"]);
    text(a.sourceKey, 200);
    id(a.recordId);
    route(a.href);
    if (
      !full.records.has(a.recordId) ||
      aliasKeys.has(a.sourceKey) ||
      m.currentSources.some(
        (b) => b.sourceKey === a.sourceKey && b.recordId !== a.recordId,
      )
    )
      fail("source", "Source alias is duplicated or reuses another identity.");
    aliasKeys.add(a.sourceKey);
  }
  const editions = new Map();
  for (const edition of g.editions)
    editions.set(edition.id, validateEdition(edition, g, full));
  const current = editions.get(m.currentEditionId),
    e = full.editions.get(m.currentEditionId);
  if (
    !current ||
    e.capturedAt !== m.capture.at ||
    !eq(e.currentSources, m.currentSources) ||
    !eq(
      [...e.coverage.sourceKeys].sort(),
      [...m.coverage.includedSourceKeys].sort(),
    )
  )
    fail("edition", "Current manifest differs from its exact edition.");
  if (
    current.sub.events.length !== g.events.length ||
    current.sub.records.length !== g.records.length ||
    current.sub.versions.length !== g.versions.length ||
    current.sub.actors.length !== g.actors.length ||
    current.sub.reviews.length !== g.reviews.length ||
    current.sub.sources.length !== g.sources.length ||
    current.sub.observations.length !== g.observations.length
  )
    fail(
      "edition",
      "Current edition must include every recorded public input, not hide later metadata.",
    );
  exact(options, ["currentContent", "uncoveredReviews"], "validation options");
  list(options.currentContent, 1000);
  list(options.uncoveredReviews, 10000);
  const seen = new Set();
  for (const c of options.currentContent) {
    exact(c, [
      "sourceKey",
      "href",
      "rawText",
      "subject",
      "declaredReview",
      "declaredProblemState",
    ]);
    if (seen.has(c.sourceKey)) fail("source", "Duplicate current content key.");
    seen.add(c.sourceKey);
    const binding = m.currentSources.find((b) => b.sourceKey === c.sourceKey);
    if (!binding || binding.href !== c.href)
      fail(
        "source",
        "Current collection inventory differs from manifest coverage.",
      );
    const captured = captureResearchEntry({
      sourceKey: c.sourceKey,
      rawText: c.rawText,
    });
    if (
      !eq(captured, {
        subject: c.subject,
        declaredReview: c.declaredReview,
        declaredProblemState: c.declaredProblemState,
      }) ||
      c.rawText !== full.sources.get(binding.sourceId).text ||
      !eq(c.subject, full.ref(binding.currentVersion).subject)
    )
      fail(
        "source",
        "Current source/subject/compatibility fields differ from their capture.",
      );
  }
  if (!eq([...seen].sort(), [...m.coverage.includedSourceKeys].sort()))
    fail("source", "A covered entry is missing from current inventory.");
  for (const c of options.uncoveredReviews) {
    exact(c, ["sourceKey", "review"]);
    text(c.sourceKey, 200);
    choice(c.review, ["draft", "reviewed"]);
    if (seen.has(c.sourceKey))
      fail("source", "Covered entry was repeated as uncovered.");
    if (c.review === "reviewed")
      fail(
        "qualification",
        "Uncovered reviewed content must be registered before publishing that claim.",
        c.sourceKey,
      );
  }
  const out = frozen(clone(g));
  validated.set(out, { editions, full });
  const projection = projectResearchLedger(out, {
    editionId: m.currentEditionId,
  });
  for (const c of options.currentContent) {
    const b = m.currentSources.find((x) => x.sourceKey === c.sourceKey),
      v = projection.views.find((x) => x.id === b.recordId),
      p = projection.problemStates.find((x) => x.recordId === b.recordId);
    if (c.declaredReview !== v.qualification.sourceReview)
      fail(
        "qualification",
        "Current review frontmatter must match exact current qualification.",
        c.sourceKey,
      );
    if (p && c.declaredProblemState !== p.effectiveStatus)
      fail(
        "status",
        "Current problem frontmatter must match effective status, including under-review.",
        c.sourceKey,
      );
  }
  return out;
}
function modelContext(graph, editionId) {
  const model = validated.get(graph);
  if (!model) fail("shape", "Validate the exact graph before projecting.");
  id(editionId);
  const e = model.full.editions.get(editionId),
    data = model.editions.get(editionId);
  if (!e || !data) fail("edition", "Pinned edition is missing.");
  return { edition: e, ...data };
}
export function projectResearchLedger(graph, { editionId }) {
  const { edition, sub, ctx, reduction: r } = modelContext(graph, editionId),
    views = [];
  for (const record of [...sub.records].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const v = ctx.versions.get(r.heads.get(record.id)),
      reviews = sub.reviews.filter((review) => eq(review.subject, asRef(v))),
      source = reviews.filter((x) => r.eligible(x, "source-framing")),
      peer = reviews.filter((x) => r.eligible(x, "peer-review")),
      problem = r.problems.get(record.id),
      blocked =
        problem?.effectiveStatus === "under-review" &&
        problem.support !== "baseline";
    const reviewed = !blocked && source.length > 0,
      peerIds = new Set(peer.map((x) => r.groups.get(x.reviewerId))),
      qualification = {
        sourceReview: reviewed ? "reviewed" : "draft",
        peerReview:
          record.kind !== "manuscript"
            ? "not-applicable"
            : reviewed && peerIds.size >= 2
              ? "peer-reviewed"
              : "not-peer-reviewed",
        reviewIds: reviews
          .filter((x) => r.eligible(x, x.scope))
          .map((x) => x.id)
          .sort(),
        reasons: reviewed
          ? [
              "Qualified from the exact recorded public declarations; human work remains a source/merge responsibility.",
            ]
          : [
              "No current qualifying whole-entry source/framing review is recorded.",
            ],
      };
    views.push({
      id: record.id,
      kind: record.kind,
      currentVersion: asRef(v),
      versionIds: sub.versions
        .filter((x) => x.recordId === record.id)
        .sort((a, b) => a.version - b.version)
        .map((x) => x.id),
      eventIds: sub.events
        .filter((x) => x.recordId === record.id)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((x) => x.id),
      qualification,
    });
  }
  const problemStates = [...r.problems.values()]
      .map(({ event, ...p }) => clone(p))
      .sort((a, b) =>
        a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0,
      ),
    qualifyingResearchResultIds = [...r.heads.values()]
      .map((x) => ctx.versions.get(x))
      .filter(
        (v) =>
          v.subject.type === "artifact" &&
          SCIENTIFIC.includes(v.subject.kind) &&
          sub.reviews.some(
            (x) => eq(x.subject, asRef(v)) && r.eligible(x, "research"),
          ),
      )
      .map((v) => v.recordId)
      .sort(),
    corrections = sub.events.filter(
      (e) =>
        e.type === "artifact-recorded" &&
        ctx.ref(e.artifact).subject.kind === "editorial-correction",
    ),
    unresolved = sub.records.filter(
      (x) =>
        x.kind === "challenge" &&
        ![
          "corrected",
          "scope-narrowed",
          "upheld-with-evidence",
          "withdrawn",
          "duplicate",
        ].includes(r.challengeStates.get(x.id)),
    ).length;
  const counters = {
    records: sub.records.length,
    versions: sub.versions.length,
    events: sub.events.length,
    reviews: sub.reviews.length,
    qualifiedSourceReviews: views.filter(
      (x) => x.qualification.sourceReview === "reviewed",
    ).length,
    peerReviewedManuscripts: views.filter(
      (x) => x.qualification.peerReview === "peer-reviewed",
    ).length,
    qualifyingResearchResults: qualifyingResearchResultIds.length,
    correctionArtifacts: new Set(corrections.map((x) => x.artifact.recordId))
      .size,
    changedClaims: new Set(
      corrections.flatMap((x) => x.changes.map((c) => c.after.recordId)),
    ).size,
    open: problemStates.filter((p) => p.effectiveStatus === "open").length,
    partial: problemStates.filter((p) => p.effectiveStatus === "partial")
      .length,
    solved: problemStates.filter((p) => p.effectiveStatus === "solved").length,
    underReview: problemStates.filter(
      (p) => p.effectiveStatus === "under-review",
    ).length,
    unresolvedChallenges: unresolved,
  };
  const payload = {
      schemaVersion: 1,
      edition: clone(edition),
      graph: Object.fromEntries(
        Object.entries(sub)
          .filter(([k]) => k !== "editions")
          .map(([k, v]) => [
            k,
            [...v]
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
              .map(clone),
          ]),
      ),
      views,
      problemStates,
      qualifyingResearchResultIds,
      counters,
    },
    out = frozen({ ...payload, factualHash: researchSubjectHash(payload) });
  if (bytes(canonicalResearchJson(out)) > LEDGER_LIMITS.exportBytes - 1024)
    fail(
      "limit",
      "Public projection cannot fit the complete 8 MiB export envelope.",
    );
  projected.add(out);
  return out;
}
export function researchProgress(graph, { editionId, from, to }) {
  const { edition, sub, ctx, reduction: r } = modelContext(graph, editionId);
  period(from, to, edition.capturedAt);
  const inPeriod = (e) =>
      e.occurredAt !== null && e.occurredAt >= from && e.occurredAt < to,
    selected = sub.events.filter(inPeriod),
    at = (instant) => {
      const snapshot = r.snapshots
        .filter((s) => s.recordedAt <= instant)
        .at(-1);
      return sub.records
        .filter((x) => x.kind === "problem")
        .map((x) => ({
          recordId: x.id,
          status:
            snapshot?.problems.find((p) => p.recordId === x.id)
              ?.effectiveStatus ?? null,
        }));
    },
    dispositionsRecorded = selected
      .filter((e) => r.dispositions.includes(e.id))
      .map((e) => e.id),
    currentlySupportedDispositionIds = dispositionsRecorded.filter(
      (x) =>
        r.problems.get(ctx.events.get(x).recordId)?.event?.id === x &&
        r.problems.get(ctx.events.get(x).recordId)?.support === "current",
    ),
    editorial = selected.filter(
      (e) =>
        e.type === "artifact-recorded" &&
        ctx.ref(e.artifact).subject.kind === "editorial-correction",
    ),
    payload = {
      editionId,
      editionHash: edition.hash,
      period: { from, to },
      coverage: clone(edition.coverage),
      startingStates: at(from),
      endingStates: at(to),
      dispositionsRecorded,
      currentlySupportedDispositionIds,
      supportWithdrawals: selected
        .filter((e) => r.withdrawals.includes(e.id))
        .map((e) => e.id),
      editorialCorrections: [
        ...new Set(editorial.map((e) => e.artifact.recordId)),
      ].sort(),
      changedClaimIds: [
        ...new Set(
          editorial.flatMap((e) => e.changes.map((c) => c.after.recordId)),
        ),
      ].sort(),
      reviewEvents: selected
        .filter((e) => e.type.startsWith("review-"))
        .map((e) => e.id),
      undatedEvents: sub.events
        .filter((e) => e.occurredAt === null)
        .map((e) => e.id),
      lateBackfills: selected
        .filter((e) => e.recordedAt > e.occurredAt)
        .map((e) => e.id),
      counters: {
        dispositionsRecorded: dispositionsRecorded.length,
        currentlySupportedDispositions: currentlySupportedDispositionIds.length,
        editorialCorrections: new Set(editorial.map((e) => e.artifact.recordId))
          .size,
        changedClaims: new Set(
          editorial.flatMap((e) => e.changes.map((c) => c.after.recordId)),
        ).size,
      },
      limitations: [
        ...edition.coverage.limitations,
        "Counts describe this pinned ledger; absent starting evidence is unknown, not an assumed January baseline.",
      ],
    };
  return frozen({ ...payload, inputHash: researchSubjectHash(payload) });
}
function csvCell(v) {
  let t = v === null || v === undefined ? "" : String(v);
  if (
    typeof v !== "number" &&
    (/^[\s\u0000-\u001f]*[=+@-]/.test(t) || /^[\t\r\n]/.test(t))
  )
    t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}
export function researchLedgerExport(projection, { format, eventIds }) {
  if (!projected.has(projection))
    fail("shape", "Export a validated model projection.");
  choice(format, ["json", "csv"]);
  if (eventIds !== null) ids(eventIds, 5000, "export event IDs");
  if (format === "json" && eventIds !== null)
    fail("shape", "JSON exports are always the complete pinned projection.");
  const events =
    eventIds === null
      ? [...projection.graph.events]
      : projection.graph.events.filter((e) => eventIds.includes(e.id));
  if (eventIds !== null && events.length !== eventIds.length)
    fail("reference", "Export selection includes a missing event.");
  const metadata = {
    editionId: projection.edition.id,
    editionHash: projection.edition.hash,
    complete: eventIds === null,
    selectedEventIds: eventIds === null ? null : [...eventIds].sort(),
    selectedCount: events.length,
    omittedCount: projection.graph.events.length - events.length,
  };
  let output;
  if (format === "json") {
    const data = {
      format: "charitology-research-ledger",
      version: 1,
      editionId: metadata.editionId,
      editionHash: metadata.editionHash,
      data: projection,
    };
    output =
      canonicalResearchJson({ ...data, checksum: researchSubjectHash(data) }) +
      "\n";
  } else {
    const headers = [
        "rowType",
        "editionId",
        "editionHash",
        "complete",
        "filter",
        "selectedCount",
        "omittedCount",
        "id",
        "recordId",
        "type",
        "ordinal",
        "occurredAt",
        "recordedAt",
        "reason",
        "refs",
        "reviews",
      ],
      rows = [
        {
          rowType: "metadata",
          ...metadata,
          filter: canonicalResearchJson(metadata.selectedEventIds),
        },
        ...events
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((e) => ({
            rowType: "event",
            editionId: metadata.editionId,
            editionHash: metadata.editionHash,
            id: e.id,
            recordId: e.recordId,
            type: e.type,
            ordinal: e.ordinal,
            occurredAt: e.occurredAt,
            recordedAt: e.recordedAt,
            reason: e.reason,
            refs: canonicalResearchJson(e.refs),
            reviews: canonicalResearchJson([
              ...(e.researchReviewIds ?? []),
              ...(e.decisionReviewIds ?? []),
              ...(e.reviewId ? [e.reviewId] : []),
            ]),
          })),
      ];
    output =
      [
        headers.map(csvCell).join(","),
        ...rows.map((row) => headers.map((k) => csvCell(row[k])).join(",")),
      ].join("\r\n") + "\r\n";
  }
  if (bytes(output) > LEDGER_LIMITS.exportBytes)
    fail("limit", "Complete public export exceeds 8 MiB.");
  return frozen({
    text: output,
    mime:
      format === "json"
        ? "application/json;charset=utf-8"
        : "text/csv;charset=utf-8",
    fileName: `charitology-${projection.edition.id.replace(":", "-")}.${format}`,
    metadata,
  });
}
export function ledgerHref(value, version) {
  id(value);
  if (version !== undefined) integer(version, 1, 3000);
  return `/research-ledger/${encodeURIComponent(value)}/${version === undefined ? "" : `#version-${version}`}`;
}
