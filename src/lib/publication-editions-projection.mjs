// Server-only source interpretation. The existing research ledger is the sole
// qualification/progress reducer; this module does not invent a second one.
import yaml from "js-yaml";
import definitions from "../data/publication-edition-methods.json" with { type: "json" };
import { edition as legacyEdition } from "../../services/newsletter/lib/content.mjs";
import { captureResearchEntry } from "./research-ledger-capture.mjs";
import {
  validateResearchLedger,
  projectResearchLedger,
  researchProgress,
} from "./research-ledger-model.mjs";
import {
  PUBLICATION_LIMITS,
  fail,
  plain,
  exact,
  str,
  choice,
  array,
  unique,
  path,
  hash,
  day,
  url,
  integer,
  rawPublicationHash,
  hashPublicationValue,
  canonicalPublicationJson,
  strictPublicationJson,
  freeze,
} from "./publication-editions-canonical.mjs";

export const PUBLICATION_FAMILIES = Object.freeze([
  "state-of-charity",
  "progress-report",
  "principles",
  "journal",
  "letter",
]);
export const PUBLICATION_DEFINITION_PATH =
  "src/data/publication-edition-methods.json";
const knownMethods = new Map(definitions.methods.map((m) => [m.id, m]));
export function publicationMethod(id) {
  const m = knownMethods.get(id);
  if (!m) fail("adapter", "Unsupported publication interpretation.");
  return freeze(structuredClone(m));
}
export function validatePublicationDefinitions(input) {
  exact(input, ["format", "schemaVersion", "methods"]);
  choice(input.format, ["charitology-publication-methods"]);
  choice(input.schemaVersion, [1]);
  array(input.methods, 100, 5);
  unique(input.methods.map((m) => m.id));
  for (const m of input.methods) {
    const known = knownMethods.get(m.id);
    if (
      !known ||
      canonicalPublicationJson(m) !== canonicalPublicationJson(known)
    )
      fail(
        "adapter",
        "Unknown or changed immutable interpretation definition.",
      );
  }
  for (const family of PUBLICATION_FAMILIES)
    if (!input.methods.some((x) => x.family === family))
      fail("adapter", "Missing required family interpretation.");
  return input;
}
function parseMarkdown(raw, fields) {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const opening = /^---(?:\r\n|\n)/.exec(text);
  if (!opening) fail("source", "Markdown must start with bounded frontmatter.");
  const rest = text.slice(opening[0].length),
    closing = /(?:^|\n)---(?:\r?\n|$)/m.exec(rest);
  if (!closing) fail("source", "Unclosed Markdown frontmatter.");
  let fm;
  try {
    fm = yaml.load(rest.slice(0, closing.index), {
      schema: yaml.JSON_SCHEMA,
      json: false,
      maxDepth: 32,
      maxTotalMergeKeys: 0,
    });
  } catch {
    fail("source", "Invalid or duplicate YAML keys.");
  }
  if (!plain(fm) || Object.keys(fm).some((k) => !fields.includes(k)))
    fail("source", "Frontmatter field has no versioned classification.");
  const seen = new Set();
  const visit = (v, d = 1) => {
    if (v && typeof v === "object") {
      if (d > 32 || seen.has(v))
        fail("source", "Aliases, cycles or excessive YAML depth.");
      seen.add(v);
      if (!Array.isArray(v) && !plain(v))
        fail("source", "Use inert frontmatter.");
      for (const [k, x] of Object.entries(v)) {
        if (["__proto__", "constructor", "prototype", "<<"].includes(k))
          fail("source", "Merge/reserved keys are refused.");
        visit(x, d + 1);
      }
    }
  };
  visit(fm);
  canonicalPublicationJson(fm);
  return {
    frontmatter: fm,
    body: rest.slice(closing.index + closing[0].length),
  };
}
function shapeMatches(v, s) {
  if (typeof s === "string") {
    if (s === "null" ? v !== null : typeof v !== s)
      fail("source", "Figure type differs from its versioned schema.");
    return;
  }
  if (Object.hasOwn(s, "array")) {
    array(v, 1000);
    for (const x of v) {
      if (s.array === null) fail("source", "Unexpected array member.");
      shapeMatches(x, s.array);
    }
    return;
  }
  exact(v, Object.keys(s));
  for (const [k, x] of Object.entries(s)) shapeMatches(v[k], x);
}
function mappedFrontmatter(collection, parsed) {
  const f = parsed.frontmatter;
  str(collection === "charities" ? f.name : f.title, 1000);
  if (f.review !== undefined) choice(f.review, ["draft", "reviewed"]);
  if (["programs", "tools", "record"].includes(collection))
    choice(f.status, ["live", "seeded", "designed", "partners"]);
  if (collection === "conditions")
    choice(f.evidence, ["established", "documented", "debated", "hypothesis"]);
  if (collection === "problems")
    choice(f.status ?? "open", ["open", "partial", "solved", "under-review"]);
  if (f.sources !== undefined) {
    array(f.sources, 100);
    citations(f.sources);
  }
  if (collection === "principles") {
    integer(f.chapter, 1, 10);
    str(f.summary, 5000);
  }
  if (collection === "journal") {
    integer(f.volume, 0, 10000);
    integer(f.issue, 1, 10000);
    str(f.author, 1000);
    str(f.summary, 5000);
    day(f.date);
  }
  return parsed;
}
export function publicationSourceProjection(sourcePath, rawUtf8) {
  path(sourcePath);
  str(rawUtf8, PUBLICATION_LIMITS.sourceBytes, true);
  if (Buffer.byteLength(rawUtf8) > PUBLICATION_LIMITS.sourceBytes)
    fail("limit", "Raw source exceeds 2 MiB.");
  if (sourcePath === PUBLICATION_DEFINITION_PATH)
    return {
      adapterId: "publication-methods-v1",
      projection: validatePublicationDefinitions(
        strictPublicationJson(rawUtf8),
      ),
    };
  const content = /^src\/content\/([^/]+)\/.+\.md$/.exec(sourcePath);
  if (content) {
    const state = knownMethods.get("state-of-charity-capture-v1");
    const fields = state.mapping.fields[content[1]];
    if (!fields || !state.mapping.content[content[1]].includes(sourcePath))
      fail("source", "Source path is outside the fixed content inventory.");
    return {
      adapterId: "publication-markdown-v1",
      projection: mappedFrontmatter(content[1], parseMarkdown(rawUtf8, fields)),
    };
  }
  if (sourcePath === "src/data/figures.json") {
    const p = strictPublicationJson(rawUtf8);
    shapeMatches(
      p,
      knownMethods.get("state-of-charity-capture-v1").mapping.figureSchema,
    );
    return { adapterId: "publication-figures-v1", projection: p };
  }
  if (
    sourcePath.startsWith("src/data/research-ledger/") &&
    knownMethods
      .get("progress-report-capture-v1")
      .mapping.ledgerPaths.includes(sourcePath)
  )
    return {
      adapterId: "publication-r4-json-v1",
      projection: strictPublicationJson(rawUtf8),
    };
  if (sourcePath === "src/data/newsletter.json") {
    const p = strictPublicationJson(rawUtf8);
    exact(p, ["title", "issues"]);
    str(p.title);
    array(p.issues, 100, 1);
    for (const i of p.issues) {
      exact(i, ["id", "title", "date", "summary", "path"]);
    }
    return { adapterId: "publication-newsletter-v1", projection: p };
  }
  if (
    new RegExp(
      knownMethods.get("letter-authored-capture-v1").mapping
        .authoredLetterPathPattern,
    ).test(sourcePath)
  ) {
    const p = strictPublicationJson(rawUtf8);
    exact(p, knownMethods.get("letter-authored-capture-v1").mapping.fields);
    choice(p.kind, ["authored-letter-v1"]);
    str(p.title, 500);
    str(p.summary, 2000);
    str(p.publicByline, 500);
    str(p.aiAssistance, 5000);
    day(p.declaredDate);
    array(p.sources, 100);
    for (const s of p.sources) {
      exact(s, ["title", "url", "publisher", "year", "note"]);
      str(s.title, 500);
      url(s.url);
      if (s.publisher !== null) str(s.publisher, 500);
      if (
        s.year !== null &&
        (!Number.isSafeInteger(s.year) || s.year < 1 || s.year > 9999)
      )
        fail("source", "Use an explicit source year or null.");
      if (s.note !== null) str(s.note, 5000);
    }
    array(p.blocks, 100, 1);
    for (const b of p.blocks) {
      if (b.kind === "heading" || b.kind === "paragraph") {
        exact(b, ["kind", "text"]);
        str(b.text, 5000);
      } else if (b.kind === "list") {
        exact(b, ["kind", "items"]);
        array(b.items, 20, 1);
        b.items.forEach((x) => str(x, 5000));
      } else if (b.kind === "links") {
        exact(b, ["kind", "items"]);
        array(b.items, 20, 1);
        for (const l of b.items) {
          exact(l, ["label", "url"]);
          str(l.label, 180);
          url(l.url);
        }
      } else fail("source", "Unsupported authored Letter block.");
    }
    if (canonicalPublicationJson(p.blocks).length > 65536)
      fail("limit", "Authored blocks exceed the complete text bound.");
    return { adapterId: "publication-authored-letter-v1", projection: p };
  }
  if (sourcePath === "services/newsletter/lib/content.mjs") {
    if (
      rawPublicationHash(rawUtf8) !==
      knownMethods.get("letter-capture-v1").mapping.legacyModuleSha256
    )
      fail("legacy", "Legacy mail source bytes changed.");
    return {
      adapterId: "publication-legacy-mail-v1",
      projection: {
        id: legacyEdition.id,
        subject: legacyEdition.subject,
        title: legacyEdition.title,
        html: legacyEdition.html,
        text: legacyEdition.text,
        hash: legacyEdition.hash,
      },
    };
  }
  const allowed = new Set(definitions.methods.flatMap((m) => m.sourcePaths));
  if (!allowed.has(sourcePath))
    fail("source", "Source path is not explicitly allowlisted.");
  return {
    adapterId: "publication-method-text-v1",
    projection: { path: sourcePath, rawSha256: rawPublicationHash(rawUtf8) },
  };
}
function pins(sources) {
  return sources
    .map((s) => ({ id: s.id, hash: s.hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
function citations(sources = []) {
  return sources.map((s) => {
    if (
      !plain(s) ||
      Object.keys(s).some(
        (k) => !["title", "url", "publisher", "year", "note"].includes(k),
      )
    )
      fail("source", "Unclassified source citation field.");
    str(s.title, 1000);
    url(s.url);
    if (s.publisher !== undefined) str(s.publisher, 1000);
    if (s.note !== undefined) str(s.note, 5000);
    if (s.year !== undefined && typeof s.year !== "string")
      integer(s.year, 1, 9999);
    if (typeof s.year === "string") str(s.year, 100);
    return {
      title: s.title,
      url: s.url,
      publisher: s.publisher ?? null,
      year: typeof s.year === "number" ? s.year : null,
      note:
        typeof s.year === "string"
          ? `${s.note ? s.note + " " : ""}Source year label: ${s.year}`
          : (s.note ?? null),
    };
  });
}
function numberTokens(raw) {
  // A separate token projection retains original decimal spelling. No currency
  // conversion or binary floating-point arithmetic is used for these values.
  let transformed = "",
    at = 0;
  while (at < raw.length) {
    if (raw[at] === '"') {
      const start = at++;
      while (at < raw.length) {
        const c = raw[at++];
        if (c === "\\") at++;
        else if (c === '"') break;
      }
      transformed += raw.slice(start, at);
    } else {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
        raw.slice(at),
      );
      if (match) {
        transformed += JSON.stringify({ decimal: match[0] });
        at += match[0].length;
      } else transformed += raw[at++];
    }
  }
  return JSON.parse(transformed);
}
const ledgerCache = new Map();
export function pinnedPublicationResearch(sources, selection) {
  const byPath = new Map(sources.map((s) => [s.path, s]));
  const method = knownMethods.get("progress-report-capture-v1");
  const key = hashPublicationValue(
    method.mapping.ledgerPaths.map((p) => [p, byPath.get(p)?.rawSha256]),
  );
  let cached = ledgerCache.get(key);
  if (!cached) {
    const input = {};
    for (const group of [
      "records",
      "versions",
      "events",
      "reviews",
      "actors",
      "observations",
      "editions",
      "sources",
    ])
      input[group] = [];
    for (const p of method.mapping.ledgerPaths) {
      const s = byPath.get(p);
      if (!s) fail("source", "Incomplete R4 closure.");
      const value = strictPublicationJson(s.rawUtf8);
      const relative = p.slice("src/data/research-ledger/".length);
      if (relative === "manifest.json") input.manifest = value;
      else input[relative.split("/")[0]].push(value);
    }
    const currentContent = input.manifest.currentSources.map((b) => {
      const source = input.sources.find((s) => s.id === b.sourceId);
      if (!source) fail("source", "Missing R4 current source.");
      const rawText = source.text;
      return {
        sourceKey: b.sourceKey,
        href: b.href,
        rawText,
        ...captureResearchEntry({ sourceKey: b.sourceKey, rawText }),
      };
    });
    cached = {
      input: freeze(input),
      graph: validateResearchLedger(input, {
        currentContent,
        uncoveredReviews: [],
      }),
    };
    if (ledgerCache.size >= 16)
      ledgerCache.delete(ledgerCache.keys().next().value);
    ledgerCache.set(key, cached);
  }
  const projection = projectResearchLedger(cached.graph, {
    editionId: selection.editionId,
  });
  const interval = selection.period ?? projection.edition.period;
  const progress = researchProgress(cached.graph, {
    editionId: selection.editionId,
    ...interval,
  });
  return { ...cached, projection, progress };
}
function assertCurrentR4Source(research, source) {
  const sourceKey = source.path.slice("src/content/".length, -3);
  const binding = research.projection.edition.currentSources.find(
    (b) => b.sourceKey === sourceKey,
  );
  if (!binding)
    fail("qualification", "Exact content has no pinned R4 binding.");
  const captured = research.input.sources.find(
    (s) => s.id === binding.sourceId,
  );
  if (!captured || captured.text !== source.rawUtf8)
    fail("qualification", "Content differs from its pinned R4 source.");
  return binding;
}
function member(id, kind, payload, sourcePins) {
  return {
    id,
    kind,
    sourcePins: [...sourcePins].sort((a, b) => a.id.localeCompare(b.id)),
    contentHash: hashPublicationValue(payload),
    payload,
  };
}
export function projectPublicationMembers(core, sources) {
  const m = publicationMethod(core.method.id);
  if (
    m.family !== core.family ||
    core.method.version !== 1 ||
    hashPublicationValue(m) !== core.method.definitionHash
  )
    fail("adapter", "Wrong immutable family interpretation.");
  const byPath = new Map(sources.map((s) => [s.path, s]));
  const expectedPaths = [...m.sourcePaths];
  if (m.id === "letter-authored-capture-v1") {
    const authored = sources.filter((s) =>
      new RegExp(m.mapping.authoredLetterPathPattern).test(s.path),
    );
    if (authored.length !== 1)
      fail(
        "source",
        "Select exactly one closed public authored Letter source.",
      );
    expectedPaths.push(authored[0].path);
    expectedPaths.sort();
  }
  if (
    canonicalPublicationJson([...byPath.keys()].sort()) !==
    canonicalPublicationJson(expectedPaths)
  )
    fail(
      "source",
      "Edition source inventory is incomplete or includes unrelated inputs.",
    );
  const methodSource = byPath.get(PUBLICATION_DEFINITION_PATH);
  const defs = validatePublicationDefinitions(
    strictPublicationJson(methodSource.rawUtf8),
  );
  if (
    !defs.methods.some(
      (x) => canonicalPublicationJson(x) === canonicalPublicationJson(m),
    )
  )
    fail("adapter", "Captured interpretation differs.");
  const get = (p) => {
    const s = byPath.get(p);
    if (!s) fail("source", "Missing exact source.");
    return s;
  };
  const ref = (p) => {
    const s = get(p);
    return { id: s.id, hash: s.hash };
  };
  let research = null,
    r4 = null;
  if (m.mapping.ledgerPaths) {
    if (!core.r4)
      fail("qualification", "This family requires a pinned closed R4 edition.");
    research = pinnedPublicationResearch(sources, {
      editionId: core.r4.editionId,
      period:
        core.family === "progress-report"
          ? core.coverage.period
            ? { from: core.coverage.period.from, to: core.coverage.period.to }
            : undefined
          : undefined,
    });
    r4 = {
      editionId: research.projection.edition.id,
      editionHash: research.projection.edition.hash,
      factualHash: research.projection.factualHash,
      progressInputHash: research.progress.inputHash,
    };
  }
  const members = [];
  if (core.family === "principles") {
    for (const p of m.mapping.chapterPaths) {
      const s = get(p),
        { frontmatter: f, body } = publicationSourceProjection(
          p,
          s.rawUtf8,
        ).projection;
      members.push(
        member(
          `chapter-${String(f.chapter).padStart(2, "0")}`,
          "chapter",
          {
            kind: "chapter-v1",
            chapter: f.chapter,
            title: f.title,
            summary: f.summary,
            body,
            sources: citations(f.sources),
            declaredReview: f.review ?? "draft",
            qualification: null,
            license: m.mapping.license,
          },
          [ref(p)],
        ),
      );
    }
    members.sort((a, b) => a.payload.chapter - b.payload.chapter);
    if (
      members.length !== 10 ||
      members.some(
        (x, i) =>
          x.payload.chapter !== i + 1 || x.payload.declaredReview !== "draft",
      )
    )
      fail(
        "qualification",
        "Initial Principles requires ten consecutive unqualified draft chapters.",
      );
  } else if (core.family === "journal") {
    for (const p of m.mapping.manuscriptPaths) {
      const s = get(p),
        { frontmatter: f, body } = publicationSourceProjection(
          p,
          s.rawUtf8,
        ).projection,
        b = assertCurrentR4Source(research, s);
      members.push(
        member(
          p.split("/").at(-1).slice(0, -3),
          "manuscript",
          {
            kind: "manuscript-v1",
            title: f.title,
            summary: f.summary,
            body,
            attribution: f.author,
            declaredDate: f.date,
            volume: f.volume,
            issue: f.issue,
            sources: citations(f.sources),
            declaredReview: f.review ?? "draft",
            qualification: {
              ...b.currentVersion,
              ledgerEditionId: r4.editionId,
              ledgerEditionHash: r4.editionHash,
            },
          },
          [ref(p)],
        ),
      );
    }
    members.sort(
      (a, b) =>
        a.payload.volume - b.payload.volume ||
        a.payload.issue - b.payload.issue ||
        a.id.localeCompare(b.id),
    );
  } else if (core.family === "progress-report") {
    members.push(
      member(
        "pinned-research-progress",
        "r4-progress",
        {
          kind: "r4-progress-v1",
          ledgerEditionId: r4.editionId,
          ledgerEditionHash: r4.editionHash,
          from: research.progress.period.from,
          to: research.progress.period.to,
          progressJson: canonicalPublicationJson(research.progress),
          progressSha256: hashPublicationValue(research.progress),
        },
        pins(
          sources.filter((s) => s.path.startsWith("src/data/research-ledger/")),
        ),
      ),
    );
  } else if (
    core.family === "letter" &&
    m.id === "letter-authored-capture-v1"
  ) {
    const s = sources.find(
        (s) => s.adapterId === "publication-authored-letter-v1",
      ),
      payload = publicationSourceProjection(s.path, s.rawUtf8).projection;
    if (
      core.provenance !== "new-source-capture" ||
      core.declaredPublicationDate !== payload.declaredDate
    )
      fail(
        "source",
        "Authored Letter date/provenance differs from the committed draft source.",
      );
    members.push(
      member("authored-letter", "authored-letter", payload, [ref(s.path)]),
    );
  } else if (core.family === "letter") {
    const expected = m.mapping,
      feed = publicationSourceProjection(
        expected.newsletterPath,
        get(expected.newsletterPath).rawUtf8,
      ).projection;
    const item = feed.issues.find((x) => x.id === expected.legacyId);
    if (
      !item ||
      item.date !== expected.declaredDate ||
      item.path !== expected.path ||
      legacyEdition.hash !== expected.legacyContentHash
    )
      fail("legacy", "Legacy Letter identity/date/path changed.");
    if (
      core.provenance !== "preserved-artifact" ||
      core.declaredPublicationDate !== expected.declaredDate
    )
      fail("legacy", "Preserve the actual legacy artifact/date.");
    members.push(
      member(
        "legacy-letter-1",
        "legacy-letter",
        {
          kind: "legacy-letter-v1",
          id: "edition-1",
          title: legacyEdition.title,
          subject: legacyEdition.subject,
          html: legacyEdition.html,
          text: legacyEdition.text,
          legacyContentHash: legacyEdition.hash,
        },
        [ref(expected.contentPath), ref(expected.newsletterPath)],
      ),
    );
  } else {
    const rows = Object.fromEntries(
      m.mapping.collections.map((c) => [
        c,
        m.mapping.content[c].map((p) => ({
          source: get(p),
          ...publicationSourceProjection(p, get(p).rawUtf8).projection,
        })),
      ]),
    );
    for (const c of ["problems", "journal", "cases"])
      for (const x of rows[c]) assertCurrentR4Source(research, x.source);
    for (const [c, entries] of Object.entries(rows))
      for (const x of entries)
        if (
          !["problems", "journal", "cases"].includes(c) &&
          x.source.path !== "src/content/record/methodology.md" &&
          (x.frontmatter.review ?? "draft") !== "draft"
        )
          fail(
            "qualification",
            "Unregistered source review cannot be reported as qualified.",
          );
    members.push(
      member(
        "project-census",
        "project-census",
        {
          kind: "project-census-v1",
          collections: m.mapping.collections.map((collection) => ({
            collection,
            entries: rows[collection].length,
            drafts: rows[collection].filter(
              (x) => (x.frontmatter.review ?? "draft") === "draft",
            ).length,
          })),
          evidence: m.mapping.evidence.map((e) => ({
            ...e,
            count: rows.conditions.filter(
              (x) => x.frontmatter.evidence === e.code,
            ).length,
          })),
          availability: m.mapping.availability.map((status) => ({
            status,
            count: ["programs", "tools", "record"]
              .flatMap((c) => rows[c])
              .filter((x) => x.frontmatter.status === status).length,
          })),
          declaredProblemStatuses: m.mapping.declaredProblemStatuses.map(
            (status) => ({
              status,
              count: rows.problems.filter(
                (x) => (x.frontmatter.status ?? "open") === status,
              ).length,
            }),
          ),
          problemStates: {
            basis: "pinned-r4-projection",
            ledgerEditionId: r4.editionId,
            ledgerEditionHash: r4.editionHash,
            counts: ["open", "partial", "solved", "under-review"].map(
              (state) => ({
                state,
                count: research.projection.problemStates.filter(
                  (x) => x.effectiveStatus === state,
                ).length,
              }),
            ),
          },
        },
        pins(
          sources.filter(
            (s) =>
              s.path.startsWith("src/content/") ||
              s.path.startsWith("src/data/research-ledger/"),
          ),
        ),
      ),
    );
    const figureSource = get("src/data/figures.json"),
      f = publicationSourceProjection(
        figureSource.path,
        figureSource.rawUtf8,
      ).projection,
      t = numberTokens(figureSource.rawUtf8),
      figurePins = [ref(figureSource.path)];
    const add = (
      key,
      label,
      value,
      unit,
      currency,
      period,
      measure,
      denominator,
      sources,
      limitations = [],
    ) =>
      members.push(
        member(
          key,
          "figure-input",
          {
            kind: "figure-input-v1",
            key,
            label,
            value,
            unit,
            currency,
            geography: "United States",
            sourcePeriodLabel: period,
            measure,
            denominator,
            sources: citations(sources),
            limitations,
          },
          figurePins,
        ),
      );
    add(
      "us-giving",
      f.usGiving.label,
      t.usGiving.billions.decimal,
      "billion USD",
      "USD",
      String(f.usGiving.year),
      "flow",
      null,
      f.usGiving.sources,
      [f.usGiving.growth],
    );
    f.bySource.rows.forEach((r, i) => {
      add(
        `giving-source-${i + 1}`,
        r.name,
        t.bySource.rows[i].billions.decimal,
        "billion USD",
        "USD",
        String(f.bySource.year),
        "flow",
        null,
        f.usGiving.sources,
        [f.bySource.note],
      );
      add(
        `giving-source-share-${i + 1}`,
        `${r.name}: rounded share`,
        t.bySource.rows[i].share.decimal,
        "percent",
        null,
        String(f.bySource.year),
        "ratio",
        "Estimated annual U.S. giving",
        f.usGiving.sources,
        [f.bySource.note],
      );
    });
    f.byRecipient.rows.forEach((r, i) =>
      add(
        `giving-recipient-${i + 1}`,
        r.name,
        t.byRecipient.rows[i].billions.decimal,
        "billion USD",
        "USD",
        String(f.byRecipient.year),
        "flow",
        null,
        f.byRecipient.sources,
        [f.byRecipient.note],
      ),
    );
    for (const [k, label, measure] of [
      ["assetsBillions", "Donor-advised fund assets", "stock"],
      ["grantsBillions", "Donor-advised fund grants", "flow"],
      ["contributionsBillions", "Donor-advised fund contributions", "flow"],
    ])
      add(
        `daf-${k.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase())}`,
        label,
        t.dafs[k].decimal,
        "billion USD",
        "USD",
        String(f.dafs.year),
        measure,
        null,
        f.dafs.sources,
        [f.dafs.note],
      );
    add(
      "daf-payout-rate",
      "Aggregate donor-advised fund payout rate",
      t.dafs.payoutRate.decimal,
      "percent",
      null,
      String(f.dafs.year),
      "ratio",
      "Previous year-end assets",
      f.dafs.sources,
      [f.dafs.note],
    );
    for (const bound of ["low", "high"])
      add(
        `cost-per-life-${bound}`,
        `${f.costPerLife.label}: ${bound} modeled estimate`,
        t.costPerLife[bound].decimal,
        "USD per modeled life saved",
        "USD",
        f.costPerLife.asOf,
        "ratio",
        "Modeled lives saved",
        f.costPerLife.sources,
        ["Model estimates are not observed impact or a Charitology rating."],
      );
    add(
      "registered-description",
      f.registered.label,
      null,
      "source description",
      null,
      null,
      "source-description",
      null,
      f.registered.sources,
      [
        f.registered.text,
        "This is the preserved source description, not a newly counted registry total.",
      ],
    );
  }
  return freeze({
    members,
    r4,
    legacyMail:
      core.family === "letter" && m.id === "letter-capture-v1"
        ? {
            id: "edition-1",
            algorithm: "ordered-json-mail-v1",
            contentHash: legacyEdition.hash,
          }
        : null,
  });
}
