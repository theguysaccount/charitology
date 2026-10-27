import {
  PUBLICATION_LIMITS,
  PublicationError,
  fail,
  plain,
  exact,
  str,
  id,
  hash,
  commit,
  integer,
  choice,
  array,
  unique,
  day,
  instant,
  path,
  url,
  freeze,
  canonicalPublicationJson,
  rawPublicationHash,
  hashPublicationValue,
  objectHash,
  checkHash,
  pretty,
  boundedPretty,
  strictPublicationJson,
  validUnicode,
} from "./publication-editions-canonical.mjs";
import {
  PUBLICATION_FAMILIES,
  PUBLICATION_DEFINITION_PATH,
  publicationMethod,
  publicationSourceProjection,
  projectPublicationMembers,
  pinnedPublicationResearch,
} from "./publication-editions-projection.mjs";
import { renderPublicationArtifact } from "./publication-editions-render.mjs";
export {
  PUBLICATION_LIMITS,
  PublicationError,
  canonicalPublicationJson,
  rawPublicationHash,
  hashPublicationValue,
  strictPublicationJson,
  PUBLICATION_FAMILIES,
  PUBLICATION_DEFINITION_PATH,
  publicationMethod,
  renderPublicationArtifact,
};
const validated = new WeakSet();
const equal = (a, b) =>
  canonicalPublicationJson(a) === canonicalPublicationJson(b);
const pin = (v) => ({ id: v.id ?? v.core.id, hash: v.hash });
const sortPins = (v) => v.map(pin).sort((a, b) => a.id.localeCompare(b.id));
function pins(value, max = PUBLICATION_LIMITS.pins) {
  array(value, max);
  for (const p of value) {
    exact(p, ["id", "hash"]);
    id(p.id);
    hash(p.hash);
  }
  unique(value.map((p) => p.id));
  if (
    !equal(
      value,
      [...value].sort((a, b) => a.id.localeCompare(b.id)),
    )
  )
    fail("reference", "Pins must be in stable ID order.");
  return value;
}
function strings(value, max = 100, length = 5000) {
  array(value, max);
  value.forEach((x) => str(x, length));
}
export function makePublicationSource({ sourceCommit, sourcePath, rawUtf8 }) {
  commit(sourceCommit);
  path(sourcePath);
  if (!validUnicode(rawUtf8))
    fail("utf8", "Raw source is not valid UTF-8 text.");
  const { adapterId, projection } = publicationSourceProjection(
    sourcePath,
    rawUtf8,
  );
  const identity = {
    adapterId,
    adapterVersion: 1,
    commit: sourceCommit,
    path: sourcePath,
    rawSha256: rawPublicationHash(rawUtf8),
    projectionHash: hashPublicationValue(projection),
  };
  const source = {
    id: "source-" + hashPublicationValue(identity),
    ...identity,
    rawUtf8,
  };
  source.hash = objectHash(source);
  boundedPretty(source, PUBLICATION_LIMITS.sourceBytes);
  return freeze(source);
}
export function validatePublicationSource(value) {
  exact(value, [
    "id",
    "adapterId",
    "adapterVersion",
    "commit",
    "path",
    "rawUtf8",
    "rawSha256",
    "projectionHash",
    "hash",
  ]);
  id(value.id);
  id(value.adapterId);
  choice(value.adapterVersion, [1]);
  commit(value.commit);
  path(value.path);
  hash(value.rawSha256);
  hash(value.projectionHash);
  checkHash(value);
  const expected = makePublicationSource({
    sourceCommit: value.commit,
    sourcePath: value.path,
    rawUtf8: value.rawUtf8,
  });
  if (!equal(expected, value))
    fail(
      "source",
      "Exact source identity/projection does not match captured raw bytes.",
    );
  return value;
}
function validateCore(core, sources) {
  exact(core, [
    "format",
    "schemaVersion",
    "id",
    "family",
    "sequence",
    "title",
    "declaredPublicationDate",
    "sourceLabel",
    "provenance",
    "capturedAt",
    "sourceCommit",
    "method",
    "coverage",
    "sourcePins",
    "members",
    "editorial",
    "r4",
    "legacyMail",
    "supersedes",
    "correction",
  ]);
  choice(core.format, ["charitology-publication-edition-core"]);
  choice(core.schemaVersion, [1]);
  id(core.id);
  choice(core.family, PUBLICATION_FAMILIES);
  integer(core.sequence, 1, 100);
  str(core.title, 500);
  if (core.declaredPublicationDate !== null) day(core.declaredPublicationDate);
  if (core.sourceLabel !== null) str(core.sourceLabel, 500);
  choice(core.provenance, [
    "new-source-capture",
    "preserved-artifact",
    "reconstruction",
  ]);
  instant(core.capturedAt);
  commit(core.sourceCommit);
  exact(core.method, ["id", "version", "definitionHash"]);
  id(core.method.id);
  choice(core.method.version, [1]);
  hash(core.method.definitionHash);
  exact(core.coverage, [
    "scope",
    "geography",
    "period",
    "completeness",
    "limitations",
  ]);
  str(core.coverage.scope, 5000);
  str(core.coverage.geography, 500);
  choice(core.coverage.completeness, ["declared-scope-only"]);
  strings(core.coverage.limitations);
  if (core.coverage.period !== null) {
    const p = core.coverage.period;
    exact(p, ["from", "to", "convention"]);
    choice(p.convention, ["calendar-period", "utc-half-open"]);
    if (p.convention === "utc-half-open") {
      instant(p.from);
      instant(p.to);
      if (p.to > core.capturedAt)
        fail("date", "Period ends after this capture.");
    } else {
      day(p.from);
      day(p.to);
    }
    if (p.from >= p.to) fail("date", "Use an increasing explicit interval.");
  }
  exact(core.editorial, ["label", "aiAssistance", "limitations"]);
  choice(core.editorial.label, ["editorial-draft"]);
  str(core.editorial.aiAssistance, 5000);
  strings(core.editorial.limitations);
  if (core.supersedes !== null) id(core.supersedes);
  if ((core.supersedes === null) !== (core.correction === null))
    fail(
      "correction",
      "A correction requires its exact predecessor and reason.",
    );
  if (core.correction) {
    exact(core.correction, ["reason", "sourceRefs"]);
    str(core.correction.reason, 5000);
    strings(core.correction.sourceRefs, 100, 500);
  }
  if (core.r4 !== null) {
    exact(core.r4, [
      "editionId",
      "editionHash",
      "factualHash",
      "progressInputHash",
    ]);
    str(core.r4.editionId, 200);
    hash(core.r4.editionHash);
    hash(core.r4.factualHash);
    hash(core.r4.progressInputHash);
  }
  if (core.legacyMail !== null) {
    exact(core.legacyMail, ["id", "algorithm", "contentHash"]);
    choice(core.legacyMail.id, ["edition-1"]);
    choice(core.legacyMail.algorithm, ["ordered-json-mail-v1"]);
    hash(core.legacyMail.contentHash);
  }
  pins(core.sourcePins);
  if (!equal(core.sourcePins, sortPins(sources)))
    fail("source", "Edition source closure is not exact.");
  array(core.members, 1000, 1);
  unique(core.members.map((m) => m.id));
  for (const m of core.members) {
    exact(m, ["id", "kind", "sourcePins", "contentHash", "payload"]);
    id(m.id);
    choice(m.kind, [
      "figure-input",
      "project-census",
      "chapter",
      "manuscript",
      "r4-progress",
      "authored-letter",
      "legacy-letter",
    ]);
    pins(m.sourcePins);
    hash(m.contentHash);
    if (
      hashPublicationValue(m.payload) !== m.contentHash ||
      m.payload?.kind !== m.kind + "-v1"
    )
      fail("hash", "Exact member payload hash/kind differs.");
    if (m.sourcePins.some((p) => !core.sourcePins.some((x) => equal(x, p))))
      fail("source", "Member pin is outside complete edition closure.");
  }
  const projected = projectPublicationMembers(core, sources);
  if (
    !equal(core.members, projected.members) ||
    !equal(core.r4, projected.r4) ||
    !equal(core.legacyMail, projected.legacyMail)
  )
    fail(
      "projection",
      "Edition members/qualification differ from the exact versioned source projection.",
    );
  if (core.family !== "letter" && core.provenance !== "new-source-capture")
    fail(
      "provenance",
      "This adapter supports a new source capture, not reconstructed served bytes.",
    );
}
export function makePublicationEdition(core, sources) {
  canonicalPublicationJson(core);
  validateCore(core, sources);
  const coreHash = hashPublicationValue(core),
    artifacts = ["markdown", "text"].map((format) => {
      const text = renderPublicationArtifact(core, coreHash, format),
        fileName = format === "markdown" ? "edition.md" : "edition.txt";
      return {
        editionId: core.id,
        fileName,
        mediaType:
          format === "markdown"
            ? "text/markdown;charset=utf-8"
            : "text/plain;charset=utf-8",
        text,
      };
    });
  const edition = {
    format: "charitology-publication-edition",
    schemaVersion: 1,
    core,
    coreHash,
    artifacts: artifacts.map((a, i) => ({
      id: i === 0 ? "edition-markdown" : "edition-text",
      fileName: a.fileName,
      mediaType: a.mediaType,
      byteLength: Buffer.byteLength(a.text),
      sha256: rawPublicationHash(a.text),
    })),
  };
  edition.hash = objectHash(edition);
  boundedPretty(edition, PUBLICATION_LIMITS.manifestBytes);
  validateCore(core, sources);
  return freeze({ edition, artifacts });
}
export function validatePublicationRegistry(input, options = {}) {
  exact(options, Object.keys(options));
  if (
    Object.keys(options).some(
      (k) => !["previousRegistry", "previousObjects"].includes(k),
    )
  )
    fail("shape", "Unknown previous-closure option.");
  // Validate descriptors/accessors/depth before cloning or semantic field reads.
  const canonical = canonicalPublicationJson(input);
  if (Buffer.byteLength(canonical) > PUBLICATION_LIMITS.totalBytes)
    fail("limit", "Combined registry input exceeds 20 MiB.");
  const out = JSON.parse(canonical);
  exact(out, ["registry", "sources", "editions", "artifacts"]);
  array(out.sources, PUBLICATION_LIMITS.sources);
  array(out.editions, PUBLICATION_LIMITS.editions, 5);
  array(out.artifacts, PUBLICATION_LIMITS.editions * 100);
  unique(out.sources.map((s) => s.id));
  unique(out.editions.map((e) => e.core.id));
  unique(out.sources.map((s) => s.commit + ":" + s.path));
  for (const s of out.sources) validatePublicationSource(s);
  const sourceMap = new Map(out.sources.map((s) => [s.id, s])),
    usedSources = new Set(),
    usedArtifacts = new Set(),
    memberIdentities = new Map(),
    methodIdentities = new Map();
  for (const edition of out.editions) {
    exact(edition, [
      "format",
      "schemaVersion",
      "core",
      "coreHash",
      "artifacts",
      "hash",
    ]);
    choice(edition.format, ["charitology-publication-edition"]);
    choice(edition.schemaVersion, [1]);
    hash(edition.coreHash);
    if (hashPublicationValue(edition.core) !== edition.coreHash)
      fail("hash", "Core hash differs.");
    checkHash(edition);
    boundedPretty(edition, PUBLICATION_LIMITS.manifestBytes);
    const sources = edition.core.sourcePins.map((p) => {
      const s = sourceMap.get(p.id);
      if (!s || s.hash !== p.hash)
        fail("reference", "Missing exact source pin.");
      usedSources.add(s.id);
      return s;
    });
    validateCore(edition.core, sources);
    const mk = edition.core.method.id + ":" + edition.core.method.version,
      prior = methodIdentities.get(mk);
    if (prior && prior !== edition.core.method.definitionHash)
      fail("adapter", "Immutable method identity was rebound.");
    methodIdentities.set(mk, edition.core.method.definitionHash);
    for (const m of edition.core.members) {
      const key = m.id + ":" + m.contentHash,
        value = canonicalPublicationJson(m.payload);
      if (memberIdentities.has(key) && memberIdentities.get(key) !== value)
        fail("hash", "Member identity/hash rebound.");
      memberIdentities.set(key, value);
    }
    array(edition.artifacts, 100, 1);
    unique(edition.artifacts.map((a) => a.id));
    unique(edition.artifacts.map((a) => a.fileName));
    for (const a of edition.artifacts) {
      exact(a, ["id", "fileName", "mediaType", "byteLength", "sha256"]);
      id(a.id);
      if (!["edition.md", "edition.txt"].includes(a.fileName))
        fail("artifact", "Unsupported inert artifact basename.");
      choice(a.mediaType, [
        "text/markdown;charset=utf-8",
        "text/plain;charset=utf-8",
      ]);
      integer(a.byteLength, 0, PUBLICATION_LIMITS.artifactBytes);
      hash(a.sha256);
      const matches = out.artifacts.filter(
        (x) => x.editionId === edition.core.id && x.fileName === a.fileName,
      );
      if (matches.length !== 1)
        fail("artifact", "Missing or duplicate artifact bytes.");
      const actual = matches[0];
      exact(actual, ["editionId", "fileName", "mediaType", "text"]);
      const format = a.fileName === "edition.md" ? "markdown" : "text";
      if (
        actual.mediaType !== a.mediaType ||
        typeof actual.text !== "string" ||
        !validUnicode(actual.text) ||
        Buffer.byteLength(actual.text) !== a.byteLength ||
        rawPublicationHash(actual.text) !== a.sha256 ||
        actual.text !==
          renderPublicationArtifact(edition.core, edition.coreHash, format)
      )
        fail("artifact", "Artifact bytes or deterministic renderer differ.");
      usedArtifacts.add(actual);
    }
    if (
      edition.artifacts.length !== 2 ||
      !edition.artifacts.some((a) => a.fileName === "edition.md") ||
      !edition.artifacts.some((a) => a.fileName === "edition.txt")
    )
      fail("artifact", "Both fixed text artifacts are required.");
  }
  if (
    usedSources.size !== out.sources.length ||
    usedArtifacts.size !== out.artifacts.length
  )
    fail("reference", "Orphan source/artifact is outside the closed registry.");
  const registry = out.registry;
  exact(registry, [
    "format",
    "schemaVersion",
    "editionPins",
    "sourcePins",
    "current",
    "hash",
  ]);
  choice(registry.format, ["charitology-publication-registry"]);
  choice(registry.schemaVersion, [1]);
  pins(registry.editionPins, 100);
  pins(registry.sourcePins, 1000);
  checkHash(registry);
  if (
    !equal(registry.editionPins, sortPins(out.editions)) ||
    !equal(registry.sourcePins, sortPins(out.sources))
  )
    fail("reference", "Registry pins do not enumerate the full closure.");
  exact(registry.current, PUBLICATION_FAMILIES);
  if (out.editions.filter((e) => e.core.legacyMail !== null).length !== 1)
    fail("legacy", "Keep exactly one preserved legacy Letter mail identity.");
  for (const family of PUBLICATION_FAMILIES) {
    const editions = out.editions
      .filter((e) => e.core.family === family)
      .sort((a, b) => a.core.sequence - b.core.sequence);
    if (!editions.length || editions.some((e, i) => e.core.sequence !== i + 1))
      fail(
        "sequence",
        "Family sequences must start at one and remain consecutive.",
      );
    if (registry.current[family] !== editions.at(-1).core.id)
      fail(
        "sequence",
        "Current pointer must select the latest registered family sequence.",
      );
    for (const e of editions) {
      if (e.core.supersedes) {
        const before = editions.find((x) => x.core.id === e.core.supersedes);
        if (!before || before.core.sequence >= e.core.sequence)
          fail(
            "correction",
            "Correction needs an earlier same-family edition.",
          );
      }
      if (
        e.core.sequence > 1 &&
        e.core.capturedAt < editions[e.core.sequence - 2].core.capturedAt
      )
        fail("date", "Captures cannot move backward within a family.");
    }
  }
  if (options.previousObjects) {
    const previous = validatePublicationRegistry(options.previousObjects);
    assertPublicationSemanticAppend(previous, out);
  } else if (options.previousRegistry) {
    const prev = options.previousRegistry;
    checkHash(prev);
    for (const p of prev.editionPins)
      if (!registry.editionPins.some((x) => equal(x, p)))
        fail("immutable", "Prior edition pin removed or changed.");
    for (const p of prev.sourcePins)
      if (!registry.sourcePins.some((x) => equal(x, p)))
        fail("immutable", "Prior source pin removed or changed.");
  }
  let total = Buffer.byteLength(pretty(registry));
  for (const s of out.sources) total += Buffer.byteLength(pretty(s));
  for (const e of out.editions) total += Buffer.byteLength(pretty(e));
  for (const a of out.artifacts) total += Buffer.byteLength(a.text);
  for (const e of out.editions) {
    const bundle = pretty({
      format: "charitology-publication-proposal-basis",
      version: 1,
      edition: e,
      sources: e.core.sourcePins.map((p) => sourceMap.get(p.id)),
    });
    total += Buffer.byteLength(bundle);
  }
  if (total > PUBLICATION_LIMITS.totalBytes)
    fail(
      "limit",
      "Complete registry, snapshots, artifacts and shipped basis bundles exceed 20 MiB.",
    );
  freeze(out);
  validated.add(out);
  return out;
}
function requireValidated(v) {
  if (!validated.has(v))
    fail("shape", "Validate the exact public registry before projection.");
  return v;
}
export function assertPublicationSemanticAppend(previous, next) {
  for (const e of previous.editions) {
    const after = next.editions.find((x) => x.core.id === e.core.id);
    if (!after || !equal(e, after))
      fail("immutable", "Historical edition removed or changed.");
  }
  for (const s of previous.sources) {
    const after = next.sources.find((x) => x.id === s.id);
    if (!after || !equal(s, after))
      fail("immutable", "Historical source removed or changed.");
  }
  for (const a of previous.artifacts) {
    const after = next.artifacts.find(
      (x) => x.editionId === a.editionId && x.fileName === a.fileName,
    );
    if (!after || !equal(a, after))
      fail("immutable", "Historical artifact removed or changed.");
  }
  for (const f of PUBLICATION_FAMILIES) {
    const p = previous.editions.find(
        (e) => e.core.id === previous.registry.current[f],
      ),
      n = next.editions.find((e) => e.core.id === next.registry.current[f]);
    if (!p || !n || n.core.sequence < p.core.sequence)
      fail("immutable", "Current pointer moved backward.");
  }
}
export function projectPublicationEdition(value, idValue) {
  const v = requireValidated(value);
  id(idValue);
  const edition = v.editions.find((e) => e.core.id === idValue);
  if (!edition) fail("reference", "Unknown fixed edition.");
  return freeze(
    structuredClone({
      edition,
      supersededBy: v.editions
        .filter((e) => e.core.supersedes === idValue)
        .map(pin)
        .sort((a, b) => a.id.localeCompare(b.id)),
      artifacts: edition.artifacts,
    }),
  );
}
export function makePublicationDownload(value, idValue, options) {
  exact(options, ["format"]);
  choice(options.format, ["json", "markdown"]);
  const v = requireValidated(value),
    { edition } = projectPublicationEdition(v, idValue);
  const text =
    options.format === "json"
      ? boundedPretty(edition, PUBLICATION_LIMITS.manifestBytes)
      : v.artifacts.find(
          (a) => a.editionId === idValue && a.fileName === "edition.md",
        ).text;
  return new TextEncoder().encode(text);
}
export function makeProposalBasisBundle(value, idValue) {
  const v = requireValidated(value),
    { edition } = projectPublicationEdition(v, idValue),
    sources = edition.core.sourcePins.map((p) =>
      v.sources.find((s) => s.id === p.id),
    );
  return pretty({
    format: "charitology-publication-proposal-basis",
    version: 1,
    edition,
    sources,
  });
}
export function makeProposalCatalog(value, { basePath = "" } = {}) {
  const v = requireValidated(value);
  if (
    typeof basePath !== "string" ||
    (basePath !== "" &&
      basePath !== "/" &&
      !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(basePath))
  )
    fail("path", "Use a safe root-relative base path.");
  const base = basePath.replace(/\/$/, "");
  const entries = sortPins(v.editions),
    basisOffers = entries.map((p) => {
      const text = makeProposalBasisBundle(v, p.id);
      return {
        editionId: p.id,
        editionHash: p.hash,
        href: `${base}/record/editions/${p.id}/basis.json`,
        byteLength: Buffer.byteLength(text),
        sha256: rawPublicationHash(text),
      };
    });
  const catalog = {
    format: "charitology-publication-proposal-catalog",
    version: 1,
    registryHash: v.registry.hash,
    entries,
    basisOffers,
  };
  return freeze({ ...catalog, hash: hashPublicationValue(catalog) });
}
export function publicationRegistryMetadata(value) {
  const v = requireValidated(value);
  return freeze({
    registryHash: v.registry.hash,
    editionCount: v.editions.length,
    sourceCount: v.sources.length,
    artifactCount: v.artifacts.length,
    current: structuredClone(v.registry.current),
    editions: v.editions
      .map((e) => ({
        id: e.core.id,
        hash: e.hash,
        coreHash: e.coreHash,
        family: e.core.family,
        sequence: e.core.sequence,
        title: e.core.title,
        capturedAt: e.core.capturedAt,
        declaredPublicationDate: e.core.declaredPublicationDate,
        provenance: e.core.provenance,
        editorialLabel: e.core.editorial.label,
        memberCount: e.core.members.length,
        sourceCount: e.core.sourcePins.length,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function comparePublicationEditions(value, selection) {
  exact(selection, ["fromId", "toId"]);
  const v = requireValidated(value),
    from = projectPublicationEdition(v, selection.fromId).edition,
    to = projectPublicationEdition(v, selection.toId).edition,
    differences = [];
  const diff = (memberId, code, before, after, reason, r4EventIds = []) =>
    differences.push({ memberId, code, before, after, reason, r4EventIds });
  if (from.core.family !== to.core.family) {
    diff(
      "edition",
      "not-comparable",
      from.core.family,
      to.core.family,
      "These editions describe different publication families.",
    );
    return freeze({ from: pin(from), to: pin(to), differences });
  }
  for (const after of to.core.members) {
    const before = from.core.members.find((x) => x.id === after.id);
    if (!before) {
      diff(
        after.id,
        "unknown-baseline",
        null,
        after.contentHash,
        "No matching earlier member was recorded.",
      );
      continue;
    }
    if (before.contentHash === after.contentHash) continue;
    const a = before.payload,
      b = after.payload;
    if (a.kind === "figure-input-v1" && b.kind === a.kind) {
      const keys = [
        "unit",
        "currency",
        "geography",
        "sourcePeriodLabel",
        "measure",
        "denominator",
      ];
      if (a.value === null || b.value === null)
        diff(
          after.id,
          "unknown-baseline",
          a.value,
          b.value,
          "A missing source value remains unknown.",
        );
      else if (
        keys.some((k) => !equal(a[k], b[k])) ||
        !equal(from.core.coverage, to.core.coverage) ||
        !equal(from.core.method, to.core.method)
      )
        diff(
          after.id,
          "not-comparable",
          a.value,
          b.value,
          "Units, source period, scope, denominator or interpretation differ; no subtraction is justified.",
        );
      else
        diff(
          after.id,
          "editorial-change",
          a.value,
          b.value,
          "A compatible recorded source value changed; this is not measured causal impact.",
        );
    } else if (a.kind === "project-census-v1" && b.kind === a.kind) {
      const counts = (p) =>
        new Map([
          ...p.collections.flatMap((x) => [
            [`collection ${x.collection} entries`, x.entries],
            [`collection ${x.collection} declared drafts`, x.drafts],
          ]),
          ...p.evidence.map((x) => [`evidence ${x.code}`, x.count]),
          ...p.availability.map((x) => [
            `function availability ${x.status}`,
            x.count,
          ]),
          ...p.declaredProblemStatuses.map((x) => [
            `literal problem declaration ${x.status}`,
            x.count,
          ]),
        ]);
      const oldCounts = counts(a),
        newCounts = counts(b);
      for (const [name, count] of newCounts) {
        const old = oldCounts.get(name);
        if (old === undefined)
          diff(
            after.id,
            "unknown-baseline",
            null,
            String(count),
            "No earlier matching project count was recorded.",
          );
        else if (old !== count) {
          if (
            from.core.coverage.scope !== to.core.coverage.scope ||
            from.core.coverage.geography !== to.core.coverage.geography ||
            !equal(from.core.method, to.core.method)
          )
            diff(
              after.id,
              "not-comparable",
              String(old),
              String(count),
              "Project census coverage/method differs.",
            );
          else
            diff(
              after.id,
              "count-change",
              String(old),
              String(count),
              `Recorded ${name}; a count change is not charity-sector improvement or a research disposition.`,
            );
        }
      }
    } else if (a.kind === "r4-progress-v1" && b.kind === a.kind) {
      const old = strictPublicationJson(a.progressJson),
        next = strictPublicationJson(b.progressJson);
      if (
        old.coverage.baselineKnownFrom === null ||
        next.coverage.baselineKnownFrom === null
      )
        diff(
          after.id,
          "unknown-baseline",
          null,
          null,
          "The pinned ledger has no recorded January starting baseline.",
        );
      const fromSources = to.core.sourcePins.map((p) =>
        v.sources.find((s) => s.id === p.id),
      );
      const oldProjection = pinnedPublicationResearch(
          from.core.sourcePins.map((p) => v.sources.find((s) => s.id === p.id)),
          { editionId: from.core.r4.editionId },
        ).projection,
        newProjection = pinnedPublicationResearch(fromSources, {
          editionId: to.core.r4.editionId,
        }).projection;
      if (oldProjection.edition.capturedAt < newProjection.edition.capturedAt) {
        const progress = pinnedPublicationResearch(fromSources, {
          editionId: to.core.r4.editionId,
          period: {
            from: oldProjection.edition.capturedAt,
            to: newProjection.edition.capturedAt,
          },
        }).progress;
        if (progress.currentlySupportedDispositionIds.length)
          diff(
            after.id,
            "qualified-r4-disposition",
            null,
            null,
            "Exact dated dispositions remain currently supported in the new pinned R4 projection.",
            progress.currentlySupportedDispositionIds,
          );
      }
      if (!equal(old.editorialCorrections, next.editorialCorrections))
        diff(
          after.id,
          "editorial-change",
          String(old.editorialCorrections.length),
          String(next.editorialCorrections.length),
          "Editorial correction counts are separate from qualified research results.",
        );
    } else
      diff(
        after.id,
        "editorial-change",
        before.contentHash,
        after.contentHash,
        "Exact text/source content changed; no new independent qualification is inferred.",
      );
  }
  for (const before of from.core.members)
    if (!to.core.members.some((x) => x.id === before.id))
      diff(
        before.id,
        "not-comparable",
        before.contentHash,
        null,
        "The later edition has no matching member.",
      );
  return freeze({ from: pin(from), to: pin(to), differences });
}
export function publicationMailLineage(value, publicationIds) {
  const v = requireValidated(value);
  array(publicationIds, 100);
  unique(publicationIds);
  const needed = new Map();
  const walk = (idValue) => {
    const e = v.editions.find((e) => e.core.id === idValue);
    if (!e || e.core.family !== "letter")
      fail("lineage", "Expected a registered Letter edition.");
    if (needed.has(idValue)) return;
    const node = {
      format: "charitology-letter-publication-lineage",
      version: 1,
      publicationId: e.core.id,
      publicationHash: e.hash,
      sequence: e.core.sequence,
      supersedes: e.core.supersedes
        ? (() => {
            const p = v.editions.find((x) => x.core.id === e.core.supersedes);
            return { id: p.core.id, hash: p.hash };
          })()
        : null,
    };
    needed.set(idValue, { ...node, hash: hashPublicationValue(node) });
    if (e.core.supersedes) walk(e.core.supersedes);
  };
  publicationIds.forEach(walk);
  return freeze([...needed.values()].sort((a, b) => a.sequence - b.sequence));
}
export function publicationLegacyMailBinding(value) {
  const v = requireValidated(value),
    editions = v.editions.filter((e) => e.core.legacyMail?.id === "edition-1");
  if (editions.length !== 1)
    fail("legacy", "Exactly one immutable legacy Letter binding is required.");
  const edition = editions[0],
    p = edition.core.members.find(
      (m) => m.payload.kind === "legacy-letter-v1",
    ).payload;
  return freeze({
    publicationId: edition.core.id,
    publicationHash: edition.hash,
    id: p.id,
    subject: p.subject,
    title: p.title,
    html: p.html,
    text: p.text,
    hash: p.legacyContentHash,
  });
}
export async function checkCommittedPublicationAppendOnly(options) {
  return (
    await import("./publication-editions-append-only.mjs")
  ).checkCommittedPublicationAppendOnly(options);
}
