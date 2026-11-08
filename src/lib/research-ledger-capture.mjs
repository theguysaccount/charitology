import yaml from "js-yaml";
import {
  LEDGER_LIMITS,
  fail,
  plain,
  exact,
  text,
  id,
  integer,
  choice,
  list,
  unique,
  day,
  publicUrl,
  canonicalResearchJson,
  frozen,
} from "./research-ledger-canonical.mjs";

const KEYS = {
  problems: [
    "title",
    "number",
    "statement",
    "progress",
    "conditions",
    "bounty",
    "sources",
  ],
  journal: ["title", "author", "date", "summary", "volume", "issue", "sources"],
  cases: [
    "title",
    "summary",
    "kind",
    "era",
    "place",
    "depth",
    "lessons",
    "conditions",
    "sources",
  ],
  record: [
    "title",
    "group",
    "order",
    "summary",
    "status",
    "statusNote",
    "conditions",
    "firstMilestone",
    "help",
    "related",
    "sources",
  ],
};
const OPTIONAL = new Set(["bounty", "statusNote", "firstMilestone"]);
const ARRAYS = new Set(["conditions", "sources", "help", "related"]);
function containers(v, seen = new Set(), depth = 0) {
  if (depth > 20) fail("limit", "Frontmatter nesting exceeds twenty.");
  if (v && typeof v === "object") {
    if (!Array.isArray(v) && !plain(v))
      fail("source", "Frontmatter contains unsupported data.");
    if (seen.has(v))
      fail("source", "Repeated or cyclic container aliases are not allowed.");
    seen.add(v);
    for (const [key, x] of Object.entries(v)) {
      if (["__proto__", "constructor", "prototype", "<<"].includes(key))
        fail("source", "Reserved or merge keys are not allowed.");
      containers(x, seen, depth + 1);
    }
  }
}
function parse(rawText) {
  if (typeof rawText !== "string")
    fail("source", "Source text must be a string.");
  if (
    rawText.length > LEDGER_LIMITS.sourceBytes ||
    Buffer.byteLength(rawText, "utf8") > LEDGER_LIMITS.sourceBytes
  )
    fail("limit", "Source exceeds 128 KiB.");
  text(rawText, LEDGER_LIMITS.sourceBytes, "rawText", false, true);
  canonicalResearchJson(rawText);
  const raw = rawText.startsWith("\uFEFF") ? rawText.slice(1) : rawText;
  const opening = /^---(?:\r\n|\n)/.exec(raw);
  if (!opening) fail("source", "Source must start with YAML frontmatter.");
  const rest = raw.slice(opening[0].length),
    closing = /(?:^|\n)---(?:\r?\n|$)/m.exec(rest);
  if (!closing) fail("source", "Source frontmatter is not closed.");
  const header = rest.slice(0, closing.index),
    body = rest.slice(closing.index + closing[0].length);
  let fm;
  try {
    fm = yaml.load(header, {
      schema: yaml.JSON_SCHEMA,
      json: false,
      maxDepth: 20,
      maxTotalMergeKeys: 0,
    });
  } catch {
    fail("source", "Frontmatter is not valid bounded single-document YAML.");
  }
  if (!plain(fm)) fail("source", "Frontmatter must be a mapping.");
  containers(fm);
  text(body, 32768, "body", false, true);
  return { fm, body };
}
function sourceKey(value) {
  if (
    typeof value !== "string" ||
    (!/^(problems|journal|cases)\/[a-z0-9][a-z0-9-]{0,99}$/.test(value) &&
      value !== "record/methodology")
  )
    fail("source", "Source key is outside the frozen coverage adapters.");
  return value.split("/")[0];
}
function sources(values) {
  list(values, 20, "sources");
  return values.map((s) => {
    if (
      !plain(s) ||
      !Object.hasOwn(s, "title") ||
      !Object.hasOwn(s, "url") ||
      Object.keys(s).some(
        (k) => !["title", "url", "publisher", "year", "note"].includes(k),
      )
    )
      fail("source", "Unknown source fields.");
    text(s.title, 500);
    publicUrl(s.url);
    for (const k of ["publisher", "note"])
      if (s[k] !== undefined) text(s[k], 4000, k, true);
    if (
      s.year !== undefined &&
      s.year !== null &&
      typeof s.year !== "string" &&
      (!Number.isSafeInteger(s.year) || s.year < 0)
    )
      fail("source", "Invalid source year.");
    if (typeof s.year === "string") text(s.year, 500, "year");
    return {
      title: s.title,
      url: s.url,
      publisher: s.publisher ?? null,
      year: s.year ?? null,
      note: s.note ?? null,
    };
  });
}
export function captureResearchEntry(input) {
  exact(input, ["sourceKey", "rawText"], "capture");
  const collection = sourceKey(input.sourceKey),
    { fm, body } = parse(input.rawText),
    allowed = [
      ...KEYS[collection],
      "review",
      ...(collection === "problems" ? ["status"] : []),
    ];
  if (Object.keys(fm).some((k) => !allowed.includes(k)))
    fail("source", "Unknown substantive frontmatter field.", input.sourceKey);
  const f = {};
  for (const k of KEYS[collection]) {
    if (Object.hasOwn(fm, k)) f[k] = fm[k];
    else if (OPTIONAL.has(k)) f[k] = null;
    else if (ARRAYS.has(k)) f[k] = [];
    else fail("source", "Missing required source field.", k);
  }
  text(f.title, 500, "title");
  f.sources = sources(f.sources);
  list(f.conditions ?? [], 20, "conditions");
  if (f.conditions)
    f.conditions = f.conditions.map((v) => {
      text(v, 100, "condition");
      if (!/^[a-z0-9-]+$/.test(v))
        fail("source", "Invalid condition reference.");
      return { collection: "conditions", id: v };
    });
  for (const k of [
    "statement",
    "progress",
    "summary",
    "author",
    "era",
    "place",
    "group",
  ])
    if (Object.hasOwn(f, k)) text(f[k], k === "author" ? 500 : 4000, k);
  for (const k of OPTIONAL) if (Object.hasOwn(f, k)) text(f[k], 4000, k, true);
  if (collection === "problems") integer(f.number, 1, 10000, "number");
  if (collection === "journal") {
    day(f.date, "date");
    integer(f.volume, 0, 10000, "volume");
    integer(f.issue, 1, 10000, "issue");
  }
  if (collection === "cases") {
    choice(f.kind, ["success", "failure", "mixed"], "kind");
    integer(f.depth, 0, 4, "depth");
    list(f.lessons, 20, "lessons", 1);
    f.lessons.forEach((v) => text(v, 4000, "lesson"));
  }
  if (collection === "record") {
    if (typeof f.order !== "number" || !Number.isFinite(f.order))
      fail("source", "Invalid record order.");
    choice(f.status, ["live", "seeded", "designed", "partners"], "status");
    for (const k of ["help", "related"]) {
      list(f[k], 20, k);
      f[k].forEach((v) => {
        text(v, 4000, k);
        if (k === "related" && !/^\/(?!\/)[a-zA-Z0-9\/_#.-]*$/.test(v))
          fail("source", "Invalid related route.");
      });
    }
  }
  const declaredReview = choice(
      fm.review ?? "draft",
      ["draft", "reviewed"],
      "review",
    ),
    declaredProblemState =
      collection === "problems"
        ? choice(
            fm.status ?? "open",
            ["open", "partial", "solved", "under-review"],
            "status",
          )
        : null;
  return frozen({
    subject: { type: "entry", collection, frontmatter: f, body },
    declaredReview,
    declaredProblemState,
  });
}

// A separate additive profile: the original four collection projections above
// and the two claim selectors below retain their frozen v1 meaning.
export const ENCYCLOPEDIA_ADAPTER = "research-encyclopedia-v1";
export function researchAdapterForSourceKey(value) {
  if (typeof value === "string" && /^encyclopedia\/[a-z0-9][a-z0-9-]{0,99}$/.test(value))
    return ENCYCLOPEDIA_ADAPTER;
  sourceKey(value);
  return "research-content-v1";
}
export function captureEncyclopediaEntry(input) {
  exact(input, ["sourceKey", "rawText"], "encyclopedia capture");
  if (researchAdapterForSourceKey(input.sourceKey) !== ENCYCLOPEDIA_ADAPTER)
    fail("source", "The encyclopedia profile cannot reinterpret another family.");
  const { fm, body } = parse(input.rawText);
  const keys = ["title", "summary", "aliases", "conditions", "related", "sources"];
  if (Object.keys(fm).some((key) => ![...keys, "review"].includes(key)))
    fail("source", "Unknown substantive encyclopedia frontmatter field.");
  text(fm.title, 500, "title");
  text(fm.summary, 4000, "summary");
  const aliases = fm.aliases ?? [], conditions = fm.conditions ?? [], related = fm.related ?? [];
  for (const [key, values] of [["aliases", aliases], ["conditions", conditions], ["related", related]]) {
    // Only an absent optional array defaults. Explicit null does not match Astro.
    if (Object.hasOwn(fm, key) && fm[key] === null) fail("source", "Optional arrays cannot be null.");
    list(values, 20, key);
  }
  aliases.forEach((value) => text(value, 500, "alias"));
  conditions.forEach((value) => {
    text(value, 100, "condition");
    if (!/^[a-z0-9-]+$/.test(value)) fail("source", "Invalid condition reference.");
  });
  related.forEach((value) => {
    text(value, 1200, "related route");
    if (!/^\/(?!\/)[A-Za-z0-9_/#.-]*$/.test(value) || value.includes("..") || value.split("#").length > 2)
      fail("source", "Use a bounded root-relative route and optional fragment.");
  });
  if (Array.isArray(fm.sources)) for (const source of fm.sources)
    if (plain(source) && ["publisher", "year", "note"].some((key) => Object.hasOwn(source, key) && source[key] === null))
      fail("source", "Optional raw source properties cannot be null under the encyclopedia schema.");
  return frozen({
    subject: { type: "entry", collection: "encyclopedia", frontmatter: {
      title: fm.title, summary: fm.summary, aliases,
      conditions: conditions.map((value) => ({ collection: "conditions", id: value })),
      related, sources: sources(Object.hasOwn(fm, "sources") ? fm.sources : []),
    }, body },
    declaredReview: choice(Object.hasOwn(fm, "review") ? fm.review : "draft", ["draft", "reviewed"], "review"),
    declaredProblemState: null,
  });
}
export function captureResearchSource(input) {
  return researchAdapterForSourceKey(input?.sourceKey) === ENCYCLOPEDIA_ADAPTER
    ? captureEncyclopediaEntry(input)
    : captureResearchEntry(input);
}
export function captureResearchSelector(input) {
  exact(input, ["adapter", "rawText"], "selector");
  const { fm, body } = parse(input.rawText);
  if (input.adapter === "depth-census-knowledge-v1") {
    const heading = "## Why it matters",
      lines = body.split(/\r?\n/),
      hits = lines.flatMap((x, i) => (x === heading ? [i] : []));
    if (hits.length !== 1)
      fail("source", "Expected one exact Why it matters section.");
    const after = lines.slice(hits[0] + 1);
    while (after[0] === "") after.shift();
    const end = after.findIndex((x) => x === "" || x.startsWith("## "));
    const excerpt = after
      .slice(0, end === -1 ? after.length : end)
      .join(input.rawText.includes("\r\n") ? "\r\n" : "\n");
    if (!excerpt.trim() || body.split(excerpt).length !== 2)
      fail("source", "Claim excerpt is missing or ambiguous.");
    return frozen({
      kind: "claim",
      adapter: input.adapter,
      frontmatterKeys: [],
      bodyExcerpt: excerpt,
    });
  }
  if (input.adapter === "ten-dollars-framing-v1") {
    text(fm.summary, 4000, "summary");
    const paragraphs = body.split(/\r?\n\s*\r?\n/),
      notes = paragraphs.filter((x) => x.trim().startsWith("*Editorial note:"));
    if (notes.length > 1) fail("source", "Editorial context is ambiguous.");
    const excerpt = notes.length ? notes[0].trim() : null;
    if (excerpt && body.split(excerpt).length !== 2)
      fail("source", "Editorial context is ambiguous.");
    return frozen({
      kind: "claim",
      adapter: input.adapter,
      frontmatterKeys: ["summary"],
      bodyExcerpt: excerpt,
    });
  }
  fail("source", "Unsupported claim selector.");
}
export function captureResearchClaim(input) {
  exact(input, ["parentId", "selector", "rawText"], "claim capture");
  id(input.parentId, "parentId");
  exact(
    input.selector,
    ["kind", "adapter", "frontmatterKeys", "bodyExcerpt"],
    "selector",
  );
  const expected = captureResearchSelector({
    adapter: input.selector.adapter,
    rawText: input.rawText,
  });
  if (canonicalResearchJson(expected) !== canonicalResearchJson(input.selector))
    fail("source", "Claim selector differs from the exact captured slices.");
  const depth = expected.adapter === "depth-census-knowledge-v1",
    entry = captureResearchEntry({
      sourceKey: depth ? "problems/the-depth-census" : "journal/ten-dollars",
      rawText: input.rawText,
    });
  return frozen({
    type: "claim",
    parentId: input.parentId,
    title: depth
      ? "Scope of the Depth Census knowledge claim"
      : "Framing of the founding poem",
    statement: depth ? expected.bodyExcerpt : entry.subject.frontmatter.summary,
    context: depth ? "Why it matters" : expected.bodyExcerpt,
    evidence: "not-applicable",
    sources: entry.subject.frontmatter.sources.map((s) => ({
      url: s.url,
      title: s.title,
      locator: s.note,
    })),
  });
}
