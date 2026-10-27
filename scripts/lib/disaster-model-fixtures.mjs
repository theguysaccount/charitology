// Explicit synthetic fixtures. No HTTP request, source dataset or artifact seed.
import {
  canonicalBytes,
  recordHash,
  filePin,
  sha256,
} from "../../src/lib/disaster-incidents/canonical.mjs";
import {
  prepareEditionArtifacts,
  interpretationFiles,
  recordPath,
  pinOf,
} from "../../src/lib/disaster-incidents/model.mjs";
import { HAZARDS, SECTORS } from "../../src/lib/disaster-incidents/limits.mjs";
export function disasterFixture({
  full = false,
  productionShape = false,
  claimCount,
  sourceCommit,
  sourceFiles,
  bootstrapSourceCommit,
  transformRecord = (_, record) => record,
  transformNote = (note) => note,
} = {}) {
  const count = full ? 20 : 2,
    vintages = full ? 5 : 2,
    methodsN = full ? 4 : 1,
    editionsN = full ? 20 : 2,
    claimsN = claimCount ?? (full ? 20 : 5);
  const files = new Map(),
    all = [],
    sources = [],
    incidents = [],
    claims = [],
    methods = [],
    editions = [];
  const at = (n) => `2026-10-${String(n).padStart(2, "0")}T12:00:00.000Z`,
    day = (d) => ({ kind: "day", day: d, literal: d, mapping: "iso-day" });
  const put = (p, v) => {
    const b = canonicalBytes(v);
    files.set(p, b);
    return filePin(p, b);
  };
  const seal = (kind, id, version, previous, fields) => {
    const r = transformRecord(kind, {
      format: "charitology-disaster-record",
      schemaVersion: 1,
      kind,
      id,
      version,
      previous,
      ...fields,
      review: "draft",
    });
    r.hash = recordHash(kind, r);
    all.push(r);
    put(recordPath(r), r);
    return r;
  };
  for (let v = 1; v <= methodsN; v++)
    methods.push(
      seal(
        "method",
        "synthetic-method",
        v,
        v === 1 ? null : pinOf(methods.at(-1)),
        {
          sourceCommit: sourceCommit ?? String(v).repeat(40),
          sourceFiles: sourceFiles ?? interpretationFiles(),
          adapter: "bounded-issuer-note-v1",
          canonicalEncoding: "DI-C14N-1",
          taxonomy: { hazards: [...HAZARDS], sectors: [...SECTORS] },
          rules: ["Synthetic test only."],
        },
      ),
    );
  for (let i = 0; i < count; i++) {
    const id = `synthetic-incident-${i}`,
      target = { kind: "incident", incidentId: id },
      op = {
        kind: "response-operation",
        incidentId: id,
        issuer: "Synthetic issuer",
        code: "SYNTHETIC-OP",
        originalUrl: productionShape
          ? "https://mauirecovers.org/"
          : "https://synthetic.invalid/operation",
      },
      ap = {
        kind: "appeal",
        incidentId: id,
        issuer: "Synthetic issuer",
        code: "SYNTHETIC-APPEAL",
        originalUrl: productionShape
          ? "https://mauirecovers.org/"
          : "https://synthetic.invalid/appeal",
      },
      sv = [],
      iv = [],
      cv = [];
    const url = productionShape
      ? "https://mauirecovers.org/"
      : `https://synthetic.invalid/${i}`;
    for (let v = 1; v <= vintages; v++) {
      const unavailable = full && i === 0 && v === 4,
        original = Buffer.from(
          `Synthetic private body ${i}/${v}; never a real source.`,
        ),
        value =
          i === 1 && v === vintages
            ? "ended"
            : i === 3
              ? "unknown"
              : i === 4
                ? "ongoing"
                : v === 1
                  ? "ongoing"
                  : v === 4
                    ? "unknown"
                    : "recovery";
      const locator = {
        kind: "html",
        headings: ["Synthetic source"],
        paragraph: 1,
        shortQuote: null,
      };
      const item = (id, target, roles, status = null) => ({
        id,
        target,
        authoredText: "Synthetic attributed source note; no actual event.",
        locator,
        roles,
        basis: "source-self-report",
        status,
      });
      const note = transformNote({
        format: "charitology-disaster-source-note",
        schemaVersion: 1,
        sourceId: `synthetic-source-${i}`,
        sourceVersion: v,
        originalSha256: unavailable ? null : sha256(original),
        items: unavailable
          ? [
              {
                id: "access",
                target,
                authoredText:
                  "Synthetic unavailable source; needs remain unknown.",
                locator,
                roles: ["access"],
                basis: "editorial-access-note",
                status: null,
              },
            ]
          : [
              item("identity", target, ["identity", "geography"]),
              item("incident-status", target, ["status"], {
                targetKind: "incident",
                value,
              }),
              item("operation-status", op, ["status", "period"], {
                targetKind: "response-operation",
                value: v === 1 ? "ongoing" : "ended",
              }),
              item("appeal-status", ap, ["status", "statement"], {
                targetKind: "appeal",
                value: "closed",
              }),
              item("need", target, ["statement"]),
              item("incident-unknown", target, ["status"], {
                targetKind: "incident",
                value: "unknown",
              }),
            ],
        rights: "charitology-authored-factual-note-only",
        limitations: ["Synthetic only."],
        review: "draft",
      });
      const publicNote = put(`notes/synthetic-source-${i}/v${v}.json`, note);
      sv.push(
        seal(
          "source",
          `synthetic-source-${i}`,
          v,
          v === 1 ? null : pinOf(sv.at(-1)),
          {
            descriptor: productionShape
              ? "maui-home"
              : "fictional-private-only",
            publisher: "Synthetic issuer",
            title: "Synthetic source",
            requestedUrl: url,
            finalUrl: url,
            retrievedAt: at(v),
            access: unavailable
              ? { outcome: "unavailable", httpStatus: 503 }
              : { outcome: "retrieved", httpStatus: 200 },
            original: unavailable
              ? null
              : {
                  mediaType: "text/html",
                  responseContentType: "application/octet-stream",
                  bytes: original.length,
                  sha256: sha256(original),
                },
            published: null,
            sourceUpdated: null,
            documentCreated: null,
            documentModified: null,
            dateDiscrepancy: null,
            literalFields: [],
            publicNote,
            disposition: "external-original-only",
            rights: {
              reuse: "unknown-not-granted",
              publicOriginal: false,
              attribution: "Synthetic issuer",
              termsUrl: null,
              reason: "No permission claimed.",
            },
            evidence: "source-self-report",
            limitations: ["Synthetic test only."],
          },
        ),
      );
    }
    const ref = (s, item, role = "statement") => ({
      source: pinOf(s),
      item,
      role,
    });
    for (let v = 1; v <= vintages; v++) {
      const s = sv[full && i === 0 && v === 4 ? 2 : v - 1],
        value =
          i === 1 && v === vintages
            ? "ended"
            : i === 3
              ? "unknown"
              : i === 4
                ? "ongoing"
                : v === 1
                  ? "ongoing"
                  : v === 4
                    ? "unknown"
                    : "recovery";
      iv.push(
        seal("incident", id, v, v === 1 ? null : pinOf(iv.at(-1)), {
          name: `Synthetic incident ${i}`,
          hazard: HAZARDS[i % HAZARDS.length],
          identifiers: [
            {
              publisher: "Synthetic issuer",
              value: `SYNTHETIC-${i}`,
              originalUrl: url,
              ref: ref(s, "identity", "identity"),
            },
          ],
          geography: {
            countries: [{ code: "ZZ", reportedName: "Synthetic" }],
            areas: ["First synthetic area", "Second synthetic area"],
            note: "Synthetic geography.",
          },
          period: {
            start: day("2023-02-07"),
            end: value === "ended" ? day("2025-02-28") : null,
            literal: null,
          },
          lifecycle: {
            value,
            refs:
              value === "unknown" ? [] : [ref(s, "incident-status", "status")],
            uncertainty: "Source self-reporting only.",
          },
          editorial: {
            placement: i === 1 || i === 3 || i === 4 ? "archive" : "follow-up",
            decidedAt: at(v),
            reason: "Editorial placement does not close recovery.",
          },
          checkedAt: at(v),
          recheckAfter: at(v + 1),
          reviewRationale: "Synthetic interval.",
          refs: [ref(s, "identity", "geography")],
          limitations: ["Synthetic only."],
        }),
      );
    }
    for (let j = 0; j < claimsN; j++) {
      const versions = [];
      for (let v = 1; v <= (j < 5 ? 2 : 1); v++) {
        const t =
            j % 5 === 2 || j === 8
              ? ap
              : j === 13
                ? target
                : j % 5 === 3
                  ? op
                  : target,
          item =
            j % 5 === 2 || j === 8
              ? "appeal-status"
              : j === 13
                ? "incident-unknown"
                : j % 5 === 3
                  ? "operation-status"
                  : "need",
          s = sv[v - 1],
          q =
            j % 3 === 0
              ? {
                  reportedText: "0",
                  unit: null,
                  currency: null,
                  definition: "Explicit zero, not unknown.",
                  refs: [ref(s, item)],
                }
              : j % 3 === 1
                ? null
                : {
                    reportedText: "about 12",
                    unit: "synthetic units",
                    currency: null,
                    definition: "Literal approximation.",
                    refs: [ref(s, item)],
                  };
        const content =
          j % 5 === 0
            ? { kind: "reported-need", quantity: q }
            : j % 5 === 1
              ? { kind: "response-activity", quantity: q }
              : j % 5 === 2
                ? {
                    kind: "appeal-request",
                    terms: `Synthetic terms vintage${v}`,
                    quantity: q,
                  }
                : j % 5 === 3
                  ? {
                      kind: "status",
                      value:
                        j === 8
                          ? "closed"
                          : j === 13
                            ? "unknown"
                            : v === 1
                              ? "ongoing"
                              : "ended",
                    }
                  : {
                      kind: "correction",
                      corrects: v === 1 ? pinOf(cv[0][0]) : pinOf(versions[0]),
                      reason: "Synthetic correction.",
                    };
        versions.push(
          seal(
            "claim",
            `synthetic-claim-${i}-${j}`,
            v,
            v === 1 ? null : pinOf(versions.at(-1)),
            {
              incidentId: id,
              target: t,
              attributedSummary: `Synthetic statement ${i}/${j}/${v}`,
              sector: {
                editorial: SECTORS[j % SECTORS.length],
                literal: null,
                reason: "Navigation only.",
              },
              geography: {
                countries: [],
                areas: ["First", "Second"],
                note: "Synthetic only.",
              },
              period: { start: null, end: null, literal: null },
              content,
              standing: {
                value:
                  v === 1
                    ? "reported"
                    : j === 0
                      ? "disputed"
                      : j === 1
                        ? "withdrawn"
                        : j === 4
                          ? "corrected"
                          : "reported",
                reason: "Synthetic review.",
                related: v === 2 ? [pinOf(versions[0])] : [],
              },
              refs: [ref(s, item, j % 5 === 3 ? "status" : "statement")],
              limitations: ["No actual event."],
              evidence: "source-self-report",
            },
          ),
        );
      }
      cv.push(versions);
    }
    sources.push(sv);
    incidents.push(iv);
    claims.push(cv);
  }
  const byKey = new Map(
    all.map((r) => [r.kind + ":" + r.id + ":" + r.version, r]),
  );
  const close = (initial) => {
    const result = [],
      seen = new Set();
    function add(r) {
      const k = r.kind + ":" + r.id + ":" + r.version;
      if (seen.has(k)) return;
      seen.add(k);
      result.push(r);
      for (const p of [
        ...(r.content.kind === "correction" ? [r.content.corrects] : []),
        ...r.standing.related,
      ])
        add(byKey.get(p.kind + ":" + p.id + ":" + p.version));
    }
    initial.forEach(add);
    return result;
  };
  for (let n = 1; n <= editionsN; n++) {
    const vintage = Math.min(n, vintages),
      inc = incidents.map((v) => v[vintage - 1]),
      cl = claims.flatMap((row) =>
        row.map((v) => v[Math.min(n, v.length) - 1]),
      ),
      fullClaims = close(cl),
      checks = sources.map((v) => pinOf(v[vintage - 1])),
      needed = new Set(
        checks.map((p) => p.kind + ":" + p.id + ":" + p.version),
      );
    function refs(v) {
      if (!v || typeof v !== "object") return;
      if (v.source?.kind === "source")
        needed.add(v.source.kind + ":" + v.source.id + ":" + v.source.version);
      Object.values(v).forEach((x) =>
        Array.isArray(x) ? x.forEach(refs) : refs(x),
      );
    }
    for (const r of [...inc, ...fullClaims]) refs(r);
    const src = sources
        .flat()
        .filter((s) => needed.has(s.kind + ":" + s.id + ":" + s.version)),
      method = methods[Math.min(n, methodsN) - 1];
    const edition = seal(
      "edition",
      `synthetic-edition-${n}`,
      1,
      n === 1 ? null : pinOf(editions.at(-1)),
      {
        asOf: at(n),
        capturedAt: at(n),
        interpretation: pinOf(method),
        sourceCommit: method.sourceCommit,
        incidents: inc.map(pinOf),
        claims: cl.map(pinOf),
        sources: src.map(pinOf),
        coverage: {
          geography: ["Synthetic only"],
          hazards: [...HAZARDS],
          sectors: [...SECTORS],
          omitted: ["Worldwide current needs uncollected."],
          accessibilityChecks: checks,
          worldwideCurrentCoverage: "not-established",
          currentNeedsVerification: "not-established",
        },
        changes:
          n === 6
            ? [
                {
                  kind: "revised",
                  before: pinOf(incidents[0][0]),
                  after: pinOf(inc[0]),
                  reason: "Non-immediate historical comparison.",
                },
              ]
            : [
                {
                  kind: n === 1 ? "added" : "capture-only",
                  before: null,
                  after: n === 1 ? pinOf(inc[0]) : null,
                  reason: "Synthetic capture.",
                },
              ],
        limitations: ["Not live. Synthetic only."],
      },
    );
    editions.push(edition);
    const out = prepareEditionArtifacts(files, pinOf(edition));
    for (const [p, b] of out.files) files.set(p, b);
    put(`artifacts/${edition.id}.json`, out.manifest);
  }
  const registry = {
    format: "charitology-disaster-registry",
    schemaVersion: 1,
    bootstrapSourceCommit: bootstrapSourceCommit ?? methods[0].sourceCommit,
    selected: pinOf(editions.at(-1)),
    editions: editions.map((e) => ({
      edition: pinOf(e),
      artifacts: filePin(
        `artifacts/${e.id}.json`,
        files.get(`artifacts/${e.id}.json`),
      ),
    })),
  };
  registry.hash = recordHash("registry", registry);
  put("registry.json", registry);
  return {
    files,
    records: all,
    methods,
    sources,
    incidents,
    claims,
    editions,
    registry,
    put,
    seal,
    at,
  };
}
