import {
  fail,
  hashPublicationValue,
  canonicalPublicationJson,
  PUBLICATION_LIMITS,
} from "./publication-editions-canonical.mjs";

const inline = (v) =>
  String(v)
    .replace(/\\/g, "\\\\")
    .replace(/[\r\n]/g, " ")
    .replace(/([`*_{}\[\]<>#|])/g, "\\$1");
function fence(text) {
  let n = 3;
  for (const m of text.matchAll(/`+/g)) n = Math.max(n, m[0].length + 1);
  return "`".repeat(n);
}
function safeLinkTarget(target) {
  if (/[\\\u0000-\u0020\u007f]/.test(target)) return false;
  const internal = /^\/(?!\/)/.test(target);
  if (!internal && !target.startsWith("https://")) return false;
  try {
    const parsed = new URL(target, "https://charitology.org");
    return (
      parsed.protocol === "https:" &&
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      (!internal || parsed.origin === "https://charitology.org")
    );
  } catch {
    return false;
  }
}
function inertBody(text) {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/!\[/g, "[Image omitted: ")
    .replace(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (whole, target) =>
      safeLinkTarget(target) ? whole : "] (link omitted)",
    );
}
function sources(payload) {
  if (!payload.sources?.length) return [];
  return [
    "",
    "Sources:",
    ...payload.sources.map(
      (s) =>
        `- ${inline(s.title)}${s.publisher ? ` — ${inline(s.publisher)}` : ""}${s.year !== null ? ` (${s.year})` : ""}: ${s.url}${s.note ? ` — ${inline(s.note)}` : ""}`,
    ),
  ];
}
export function renderPublicationArtifact(core, coreHash, format = "markdown") {
  if (hashPublicationValue(core) !== coreHash)
    fail("hash", "Render only an exact core/hash pair.");
  if (!["markdown", "text"].includes(format))
    fail("format", "Unsupported inert artifact format.");
  const lines = [
    `# ${inline(core.title)}`,
    "",
    `Edition: ${core.id} · ${core.family} · sequence ${core.sequence}`,
    `Core SHA-256: ${coreHash}`,
    `Captured: ${core.capturedAt}`,
    `Source commit: ${core.sourceCommit}`,
    `Declared publication date: ${core.declaredPublicationDate ?? "unknown"}`,
    `Provenance: ${core.provenance}`,
    "",
    "Editorial draft. Fixed bytes are not independent source review, peer review, performed research or an operating institution.",
    core.editorial.aiAssistance,
    "",
    core.coverage.scope,
    `Geography: ${core.coverage.geography}`,
    ...(core.coverage.period
      ? [
          `Period: ${core.coverage.period.from} to ${core.coverage.period.to} (${core.coverage.period.convention})`,
        ]
      : ["Period: not specified"]),
    ...core.coverage.limitations.map((x) => `- ${inline(x)}`),
    ...core.editorial.limitations.map((x) => `- ${inline(x)}`),
  ];
  if (core.supersedes)
    lines.push(
      "",
      `Supersedes: ${core.supersedes}`,
      `Correction: ${inline(core.correction.reason)}`,
      ...core.correction.sourceRefs.map((x) => `- ${inline(x)}`),
    );
  if (core.r4)
    lines.push(
      "",
      "## Pinned research qualification",
      `Ledger: ${core.r4.editionId}`,
      `Ledger edition hash: ${core.r4.editionHash}`,
      `Factual projection hash: ${core.r4.factualHash}`,
      `Progress input hash: ${core.r4.progressInputHash}`,
      "Member references are exact recorded qualifications; this edition remains editorial-draft.",
    );
  for (const m of core.members) {
    const p = m.payload;
    lines.push(
      "",
      `## ${inline(p.title ?? p.label ?? m.id)}`,
      `Member: ${m.id} · ${m.contentHash}`,
    );
    if (p.kind === "chapter-v1" || p.kind === "manuscript-v1") {
      if (p.kind === "chapter-v1")
        lines.push(`Chapter ${p.chapter} · ${p.license}`);
      else
        lines.push(
          `Byline: ${inline(p.attribution)}`,
          `Declared date: ${p.declaredDate} · volume ${p.volume}, issue ${p.issue}`,
        );
      lines.push(
        `Source review declaration: ${p.declaredReview}`,
        p.qualification
          ? `Exact qualification reference: ${canonicalPublicationJson(p.qualification)}`
          : "No independent qualification is claimed.",
        `Summary: ${inline(p.summary)}`,
        "",
        inertBody(p.body),
        ...sources(p),
      );
    } else if (p.kind === "figure-input-v1")
      lines.push(
        `Value: ${p.value ?? "unknown"} · unit: ${inline(p.unit)}`,
        `Measure: ${p.measure} · currency: ${p.currency ?? "unspecified"}`,
        `Geography: ${inline(p.geography)} · source period: ${p.sourcePeriodLabel ?? "unknown"}`,
        `Denominator: ${p.denominator ?? "not supplied"}`,
        ...p.limitations.map((x) => `- ${inline(x)}`),
        ...sources(p),
      );
    else if (p.kind === "project-census-v1") {
      lines.push(
        "Counts describe this project, not the charitable sector.",
        "",
        ...p.collections.map(
          (x) =>
            `- ${x.collection}: ${x.entries} entries; ${x.drafts} declared drafts`,
        ),
        "",
        ...p.evidence.map((x) => `- ${x.label}: ${x.count}`),
        "",
        ...p.availability.map(
          (x) => `- Function availability ${x.status}: ${x.count}`,
        ),
        "",
        ...p.declaredProblemStatuses.map(
          (x) => `- Literal problem frontmatter ${x.status}: ${x.count}`,
        ),
        "Effective problem states from the pinned R4 projection:",
        ...p.problemStates.counts.map((x) => `- ${x.state}: ${x.count}`),
      );
    } else if (p.kind === "r4-progress-v1") {
      const f = fence(p.progressJson);
      lines.push(
        `Exact interval: ${p.from} to ${p.to} (UTC half-open)`,
        `Progress JSON SHA-256: ${p.progressSha256}`,
        "Absent starting evidence remains unknown; editorial changes are not scientific results.",
        "",
        `${f}json`,
        p.progressJson,
        f,
      );
    } else if (p.kind === "legacy-letter-v1") {
      const f = fence(p.html);
      lines.push(
        `Subject: ${inline(p.subject)}`,
        `Original mail ID: ${p.id}`,
        `Original ordered mail hash: ${p.legacyContentHash}`,
        "Original HTML is retained below as inert code; its native unsubscribe placeholder is not a live link.",
        "",
        `${f}html`,
        p.html,
        f,
        "",
        "### Original plain text",
        "",
        p.text,
      );
    } else if (p.kind === "authored-letter-v1") {
      lines.push(
        p.summary,
        `Byline: ${inline(p.publicByline)}`,
        p.aiAssistance,
      );
      for (const b of p.blocks) {
        if (b.kind === "heading") lines.push("", `### ${inline(b.text)}`);
        else if (b.kind === "paragraph") lines.push("", inline(b.text));
        else if (b.kind === "list")
          lines.push("", ...b.items.map((x) => `- ${inline(x)}`));
        else
          lines.push(
            "",
            ...b.items.map((x) => `- ${inline(x.label)}: ${x.url}`),
          );
      }
      lines.push(...sources(p));
    }
    lines.push(
      "",
      "Source snapshot pins:",
      ...m.sourcePins.map((p) => `- ${p.id} · ${p.hash}`),
    );
  }
  lines.push(
    "",
    "## Complete source closure",
    "The edition manifest pins these exact inert source snapshots. Raw source files are separate downloads.",
    ...core.sourcePins.map((p) => `- ${p.id} · ${p.hash}`),
    "",
  );
  const text = lines.join("\n");
  if (Buffer.byteLength(text) > PUBLICATION_LIMITS.artifactBytes)
    fail("limit", "Complete text artifact exceeds 2 MiB.");
  return text;
}
