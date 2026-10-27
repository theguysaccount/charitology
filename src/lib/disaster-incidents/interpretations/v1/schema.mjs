import { LIMITS, HAZARDS, SECTORS, ROLES, DESCRIPTORS } from "./limits.mjs";
import {
  bound,
  text,
  exact,
  snapshotJSON,
  canonicalBytes,
  recordHash,
  fail,
} from "./canonical.mjs";
const KINDS = ["method", "source", "incident", "claim", "edition"];
const BASE = [
  "format",
  "schemaVersion",
  "kind",
  "id",
  "version",
  "previous",
  "hash",
  "review",
];
const FIELDS = {
  method: [
    "sourceCommit",
    "sourceFiles",
    "adapter",
    "canonicalEncoding",
    "taxonomy",
    "rules",
  ],
  source: [
    "descriptor",
    "publisher",
    "title",
    "requestedUrl",
    "finalUrl",
    "retrievedAt",
    "access",
    "original",
    "published",
    "sourceUpdated",
    "documentCreated",
    "documentModified",
    "dateDiscrepancy",
    "literalFields",
    "publicNote",
    "disposition",
    "rights",
    "evidence",
    "limitations",
  ],
  incident: [
    "name",
    "hazard",
    "identifiers",
    "geography",
    "period",
    "lifecycle",
    "editorial",
    "checkedAt",
    "recheckAfter",
    "reviewRationale",
    "refs",
    "limitations",
  ],
  claim: [
    "incidentId",
    "target",
    "attributedSummary",
    "sector",
    "geography",
    "period",
    "content",
    "standing",
    "refs",
    "limitations",
    "evidence",
  ],
  edition: [
    "asOf",
    "capturedAt",
    "interpretation",
    "sourceCommit",
    "incidents",
    "claims",
    "sources",
    "coverage",
    "changes",
    "limitations",
  ],
};
export function one(v, values) {
  if (!values.includes(v)) fail("Unknown enum");
  return v;
}
export function literal(v, want) {
  if (v !== want) fail("Unexpected literal");
  return v;
}
export function id(v) {
  text(v, 64);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(v)) fail("Invalid ID");
  return v;
}
export function hash(v) {
  text(v, 64);
  if (!/^[a-f0-9]{64}$/.test(v)) fail("Invalid SHA-256");
  return v;
}
export function commit(v) {
  text(v, 40);
  if (!/^[a-f0-9]{40}$/.test(v) || /^0+$/.test(v)) fail("Invalid commit");
  return v;
}
export function integer(v, max = Number.MAX_SAFE_INTEGER, min = 1) {
  bound(v, max);
  if (v < min) fail("Integer below minimum");
  return v;
}
export function string(v, max = 1200, empty = true) {
  text(v, max);
  if (!empty && !v.length) fail("Required text is empty");
  return v;
}
export function array(v, max = 8, check = () => {}) {
  if (!Array.isArray(v)) fail("Expected array");
  bound(v.length, max);
  v.forEach(check);
  return v;
}
export function unique(v, key = (x) => JSON.stringify(x)) {
  const seen = new Set();
  for (const x of v) {
    const k = key(x);
    if (seen.has(k)) fail("Duplicate member");
    seen.add(k);
  }
  return v;
}
export function path(v) {
  text(v, 240);
  if (
    !v ||
    v.includes("\\") ||
    v.includes("%") ||
    !v
      .split("/")
      .every((x) => /^[a-zA-Z0-9_@\[\].-]+$/.test(x) && x !== "." && x !== "..")
  )
    fail("Unsafe relative path");
  return v;
}
export function https(v) {
  text(v, 2048);
  let u;
  try {
    u = new URL(v);
  } catch {
    fail("Malformed URL");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.href !== v
  )
    fail("Expected exact HTTPS URL");
  return v;
}
export function instant(v) {
  text(v, 128);
  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail("Invalid canonical instant");
  return v;
}
export function day(v) {
  text(v, 128);
  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T00:00:00.000Z")) ||
    new Date(v + "T00:00:00.000Z").toISOString().slice(0, 10) !== v
  )
    fail("Invalid Gregorian day");
  return v;
}
export function pin(v, kind) {
  exact(v, ["kind", "id", "version", "hash"]);
  one(v.kind, KINDS);
  if (kind) literal(v.kind, kind);
  id(v.id);
  integer(v.version);
  hash(v.hash);
  return v;
}
export function file(v) {
  exact(v, ["path", "bytes", "sha256"]);
  path(v.path);
  integer(v.bytes, LIMITS.prepared, 0);
  hash(v.sha256);
  return v;
}
function nullable(v, check) {
  if (v !== null) check(v);
}
function strings(v, max = 8, length = 1200) {
  array(v, max, (x) => string(x, length));
}
function refs(v) {
  array(v, 16, ref);
  unique(v);
}
export function ref(v) {
  exact(v, ["source", "item", "role"]);
  pin(v.source, "source");
  id(v.item);
  one(v.role, ROLES);
  return v;
}
export function target(v) {
  one(v?.kind, ["incident", "response-operation", "appeal"]);
  exact(
    v,
    v.kind === "incident"
      ? ["kind", "incidentId"]
      : ["kind", "incidentId", "issuer", "code", "originalUrl"],
  );
  id(v.incidentId);
  if (v.kind !== "incident") {
    string(v.issuer, 256, false);
    string(v.code, 256, false);
    https(v.originalUrl);
  }
  return v;
}
export function reportedTime(v) {
  if (v === null) return v;
  one(v?.kind, ["day", "instant"]);
  if (v.kind === "day") {
    exact(v, ["kind", "day", "literal", "mapping"]);
    day(v.day);
    string(v.literal, 128, false);
    one(v.mapping, [
      "iso-day",
      "day-month-year",
      "english-month-day",
      "pdf-metadata-day",
    ]);
    let mapped;
    if (v.mapping === "iso-day") mapped = v.literal;
    if (v.mapping === "day-month-year") {
      const m = /^(\d{2})\/(\d{2})\/([1-9]\d{3})$/.exec(v.literal);
      if (m) mapped = `${m[3]}-${m[2]}-${m[1]}`;
    }
    if (v.mapping === "english-month-day") {
      const months = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ],
        m = /^([A-Z][a-z]+) ([1-9]|[12]\d|3[01]), ([1-9]\d{3})$/.exec(
          v.literal,
        );
      if (m && months.includes(m[1]))
        mapped = `${m[3]}-${String(months.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
    if (v.mapping === "pdf-metadata-day") {
      const m = /^D:([1-9]\d{3})(\d{2})(\d{2})$/.exec(v.literal);
      if (m) mapped = `${m[1]}-${m[2]}-${m[3]}`;
    }
    if (mapped !== v.day) fail("Reported day literal/mapping mismatch");
  } else {
    exact(v, ["kind", "instant", "literal", "reportedOffset", "mapping"]);
    instant(v.instant);
    string(v.literal, 128, false);
    one(v.mapping, ["rfc3339", "pdf-metadata"]);
    if (!/^(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(v.reportedOffset))
      fail("Invalid reported offset");
    let m = (
      v.mapping === "rfc3339"
        ? /^([1-9]\d{3})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/
        : /^([1-9]\d{3})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}(?::\d{2})?)$/
    ).exec(v.literal);
    if (!m && v.mapping === "pdf-metadata") {
      const raw =
        /^D:([1-9]\d{3})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'\d{2}')$/.exec(
          v.literal,
        );
      if (raw)
        m = [
          raw[0],
          ...raw.slice(1, 7),
          "",
          raw[7].replaceAll("'", "").replace(/^([+-]\d{2})(\d{2})$/, "$1:$2"),
        ];
    }
    if (!m) fail("Unsupported reported instant literal");
    const offset = m[8] === "Z" ? "Z" : m[8].length === 3 ? m[8] + ":00" : m[8];
    if (offset !== v.reportedOffset) fail("Reported offset mismatch");
    day(`${m[1]}-${m[2]}-${m[3]}`);
    if (+m[4] > 23 || +m[5] > 59 || +m[6] > 59) fail("Invalid reported clock");
    const ms = Date.parse(
      `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${(m[7] ?? "").padEnd(3, "0")}${offset}`,
    );
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== v.instant)
      fail("Reported instant conversion mismatch");
  }
  return v;
}
export function period(v) {
  exact(v, ["start", "end", "literal"]);
  reportedTime(v.start);
  reportedTime(v.end);
  nullable(v.literal, (x) => string(x));
  if (v.start && v.end) {
    literal(v.start.kind, v.end.kind);
    if ((v.start.day ?? v.start.instant) > (v.end.day ?? v.end.instant))
      fail("Period ends before start");
  }
  return v;
}
function geography(v) {
  exact(v, ["countries", "areas", "note"]);
  array(v.countries, 8, (x) => {
    exact(x, ["code", "reportedName"]);
    string(x.code, 256, false);
    string(x.reportedName, 120, false);
  });
  unique(v.countries, (x) => x.code);
  strings(v.areas, 16);
  string(v.note);
}
function locator(v) {
  one(v?.kind, ["html", "pdf", "json", "metadata"]);
  if (v.kind === "html" || v.kind === "pdf") {
    exact(
      v,
      v.kind === "html"
        ? ["kind", "headings", "paragraph", "shortQuote"]
        : [
            "kind",
            "pdfPage",
            "printedPage",
            "headings",
            "row",
            "column",
            "shortQuote",
          ],
    );
    strings(v.headings, 6);
    nullable(v.shortQuote, (x) => {
      string(x, 240);
      if (x.split(/\s+/).filter(Boolean).length >= 15)
        fail("Locator quotation too long");
    });
    if (v.kind === "html") integer(v.paragraph);
    else {
      integer(v.pdfPage);
      nullable(v.printedPage, (x) => string(x));
      strings(v.row, 6);
      strings(v.column, 6);
    }
  } else if (v.kind === "json") {
    exact(v, ["kind", "pointer", "expectedLiteral"]);
    string(v.pointer, 512);
    if (v.pointer !== "" && !/^(?:\/(?:[^~]|~[01])*)+$/.test(v.pointer))
      fail("Invalid JSON pointer");
    string(v.expectedLiteral);
  } else {
    exact(v, ["kind", "field", "parser", "observedLiteral"]);
    one(v.field, ["pdf-created", "pdf-modified", "http-last-modified"]);
    string(v.parser, 1200, false);
    string(v.observedLiteral, 128, false);
  }
}
function status(v) {
  if (v === null) return;
  exact(v, ["targetKind", "value"]);
  one(v.targetKind, ["incident", "response-operation", "appeal"]);
  one(
    v.value,
    v.targetKind === "incident"
      ? ["ongoing", "recovery", "ended", "unknown"]
      : v.targetKind === "appeal"
        ? ["open", "closed", "unknown"]
        : ["ongoing", "ended", "unknown"],
  );
}
export function validateSourceNote(input) {
  const v = snapshotJSON(input, LIMITS.note);
  exact(v, [
    "format",
    "schemaVersion",
    "sourceId",
    "sourceVersion",
    "originalSha256",
    "items",
    "rights",
    "limitations",
    "review",
  ]);
  literal(v.format, "charitology-disaster-source-note");
  literal(v.schemaVersion, 1);
  id(v.sourceId);
  integer(v.sourceVersion);
  nullable(v.originalSha256, hash);
  array(v.items, 16, (x) => {
    exact(x, [
      "id",
      "target",
      "authoredText",
      "locator",
      "roles",
      "basis",
      "status",
    ]);
    id(x.id);
    target(x.target);
    string(x.authoredText, 800, false);
    locator(x.locator);
    array(x.roles, 8, (r) => one(r, ROLES));
    unique(x.roles);
    one(x.basis, ["source-self-report", "editorial-access-note"]);
    status(x.status);
    if (x.roles.includes("status")) {
      if (!x.status) fail("Status role requires typed observation");
      literal(x.status.targetKind, x.target.kind);
      literal(x.basis, "source-self-report");
    } else literal(x.status, null);
    if (
      x.basis === "editorial-access-note" &&
      x.roles.some((r) => r !== "access")
    )
      fail("Access note cannot establish facts");
  });
  if (!v.items.length)
    fail("At least one authored source-note item is required");
  unique(v.items, (x) => x.id);
  literal(v.rights, "charitology-authored-factual-note-only");
  literal(v.review, "draft");
  strings(v.limitations);
  canonicalBytes(v, LIMITS.note);
  return v;
}
export function coverage(v) {
  exact(v, [
    "geography",
    "hazards",
    "sectors",
    "omitted",
    "accessibilityChecks",
    "worldwideCurrentCoverage",
    "currentNeedsVerification",
  ]);
  strings(v.geography, 32);
  array(v.hazards, 32, (x) => one(x, HAZARDS));
  unique(v.hazards);
  array(v.sectors, 32, (x) => one(x, SECTORS));
  unique(v.sectors);
  strings(v.omitted, 32);
  array(v.accessibilityChecks, 100, (x) => pin(x, "source"));
  unique(v.accessibilityChecks);
  literal(v.worldwideCurrentCoverage, "not-established");
  literal(v.currentNeedsVerification, "not-established");
  return v;
}
function quantity(v) {
  if (v === null) return;
  exact(v, ["reportedText", "unit", "currency", "definition", "refs"]);
  string(v.reportedText);
  nullable(v.unit, (x) => string(x));
  nullable(v.currency, (x) => string(x));
  nullable(v.definition, (x) => string(x));
  refs(v.refs);
}
export function recordPath(r) {
  return r.kind === "edition"
    ? `editions/${r.id}.json`
    : r.kind === "method"
      ? `methods/${r.id}/v${r.version}.json`
      : `records/${r.kind}/${r.id}/v${r.version}.json`;
}
export const pinOf = (r) => ({
  kind: r.kind,
  id: r.id,
  version: r.version,
  hash: r.hash,
});
export const keyOf = (p) => `${p.kind}:${p.id}:${p.version}`;
export function validateRecord(input) {
  const v = snapshotJSON(input, LIMITS.edition);
  one(v?.kind, KINDS);
  exact(v, [...BASE, ...FIELDS[v.kind]]);
  literal(v.format, "charitology-disaster-record");
  literal(v.schemaVersion, 1);
  id(v.id);
  integer(v.version);
  nullable(v.previous, (x) => pin(x, v.kind));
  hash(v.hash);
  literal(v.review, "draft");
  if (v.kind !== "edition") {
    if (v.version === 1) literal(v.previous, null);
    else if (
      !v.previous ||
      v.previous.id !== v.id ||
      v.previous.version !== v.version - 1
    )
      fail("Invalid predecessor identity/version");
  }
  if (recordHash(v.kind, v) !== v.hash) fail("Record hash mismatch");
  if (v.kind === "method") {
    commit(v.sourceCommit);
    array(v.sourceFiles, 64, file);
    unique(v.sourceFiles, (x) => x.path);
    literal(v.adapter, "bounded-issuer-note-v1");
    literal(v.canonicalEncoding, "DI-C14N-1");
    exact(v.taxonomy, ["hazards", "sectors"]);
    array(v.taxonomy.hazards, 7, (x) => one(x, HAZARDS));
    unique(v.taxonomy.hazards);
    array(v.taxonomy.sectors, 9, (x) => one(x, SECTORS));
    unique(v.taxonomy.sectors);
    strings(v.rules);
  }
  if (v.kind === "source") {
    one(v.descriptor, [...Object.keys(DESCRIPTORS), "fictional-private-only"]);
    string(v.publisher, 256, false);
    string(v.title, 256, false);
    https(v.requestedUrl);
    https(v.finalUrl);
    instant(v.retrievedAt);
    one(v.access?.outcome, ["retrieved", "unavailable"]);
    exact(v.access, ["outcome", "httpStatus"]);
    if (v.access.outcome === "retrieved") {
      literal(v.access.httpStatus, 200);
      if (!v.original) fail("Retrieved original metadata required");
    } else nullable(v.access.httpStatus, (x) => integer(x, 599, 100));
    if (v.original !== null) {
      exact(v.original, [
        "mediaType",
        "responseContentType",
        "bytes",
        "sha256",
      ]);
      one(v.original.mediaType, [
        "text/html",
        "application/pdf",
        "application/json",
      ]);
      nullable(v.original.responseContentType, (x) => {
        string(x, 256);
        if (/[\r\n\0]/.test(x)) fail("Malformed Content-Type metadata");
      });
      integer(v.original.bytes, LIMITS.original);
      hash(v.original.sha256);
    }
    for (const k of [
      "published",
      "sourceUpdated",
      "documentCreated",
      "documentModified",
    ])
      reportedTime(v[k]);
    nullable(v.dateDiscrepancy, (x) => string(x));
    array(v.literalFields, 16, (x) => {
      exact(x, ["name", "value"]);
      string(x.name, 120);
      string(x.value);
    });
    unique(v.literalFields, (x) => x.name);
    file(v.publicNote);
    literal(v.publicNote.path, `notes/${v.id}/v${v.version}.json`);
    bound(v.publicNote.bytes, LIMITS.note);
    literal(v.disposition, "external-original-only");
    exact(v.rights, [
      "reuse",
      "publicOriginal",
      "attribution",
      "termsUrl",
      "reason",
    ]);
    literal(v.rights.reuse, "unknown-not-granted");
    literal(v.rights.publicOriginal, false);
    string(v.rights.attribution);
    nullable(v.rights.termsUrl, https);
    string(v.rights.reason);
    literal(v.evidence, "source-self-report");
    strings(v.limitations);
    if (v.access.outcome === "unavailable") {
      for (const k of [
        "original",
        "published",
        "sourceUpdated",
        "documentCreated",
        "documentModified",
        "dateDiscrepancy",
      ])
        literal(v[k], null);
      literal(v.literalFields.length, 0);
    }
  }
  if (v.kind === "incident") {
    string(v.name, 120, false);
    one(v.hazard, HAZARDS);
    array(v.identifiers, 8, (x) => {
      exact(x, ["publisher", "value", "originalUrl", "ref"]);
      string(x.publisher, 256, false);
      string(x.value);
      https(x.originalUrl);
      ref(x.ref);
    });
    geography(v.geography);
    period(v.period);
    exact(v.lifecycle, ["value", "refs", "uncertainty"]);
    one(v.lifecycle.value, ["ongoing", "recovery", "ended", "unknown"]);
    refs(v.lifecycle.refs);
    if (v.lifecycle.value !== "unknown" && !v.lifecycle.refs.length)
      fail("Known lifecycle requires evidence");
    if (v.lifecycle.refs.some((x) => x.role !== "status"))
      fail("Lifecycle requires status refs");
    string(v.lifecycle.uncertainty);
    exact(v.editorial, ["placement", "decidedAt", "reason"]);
    one(v.editorial.placement, ["follow-up", "archive"]);
    instant(v.editorial.decidedAt);
    string(v.editorial.reason);
    instant(v.checkedAt);
    instant(v.recheckAfter);
    if (v.recheckAfter <= v.checkedAt) fail("Recheck must follow check");
    string(v.reviewRationale);
    refs(v.refs);
    strings(v.limitations);
  }
  if (v.kind === "claim") {
    id(v.incidentId);
    target(v.target);
    literal(v.target.incidentId, v.incidentId);
    string(v.attributedSummary, 1200, false);
    exact(v.sector, ["editorial", "literal", "reason"]);
    one(v.sector.editorial, SECTORS);
    nullable(v.sector.literal, (x) => string(x));
    string(v.sector.reason);
    geography(v.geography);
    period(v.period);
    one(v.content?.kind, [
      "reported-need",
      "response-activity",
      "appeal-request",
      "status",
      "correction",
    ]);
    if (["reported-need", "response-activity"].includes(v.content.kind)) {
      exact(v.content, ["kind", "quantity"]);
      quantity(v.content.quantity);
    } else if (v.content.kind === "appeal-request") {
      exact(v.content, ["kind", "terms", "quantity"]);
      literal(v.target.kind, "appeal");
      string(v.content.terms);
      quantity(v.content.quantity);
    } else if (v.content.kind === "status") {
      exact(v.content, ["kind", "value"]);
      one(
        v.content.value,
        v.target.kind === "appeal"
          ? ["open", "closed", "unknown"]
          : v.target.kind === "incident"
            ? ["ongoing", "recovery", "ended", "unknown"]
            : ["ongoing", "ended", "unknown"],
      );
    } else {
      exact(v.content, ["kind", "corrects", "reason"]);
      pin(v.content.corrects, "claim");
      string(v.content.reason);
    }
    exact(v.standing, ["value", "reason", "related"]);
    one(v.standing.value, ["reported", "disputed", "withdrawn", "corrected"]);
    string(v.standing.reason);
    array(v.standing.related, 16, (x) => pin(x, "claim"));
    unique(v.standing.related);
    refs(v.refs);
    if (
      v.content.kind === "status" &&
      v.content.value !== "unknown" &&
      !v.refs.some((x) => x.role === "status")
    )
      fail("Known status requires evidence");
    strings(v.limitations);
    literal(v.evidence, "source-self-report");
  }
  if (v.kind === "edition") {
    literal(v.version, 1);
    instant(v.asOf);
    instant(v.capturedAt);
    if (v.asOf > v.capturedAt) fail("Edition asOf follows capture");
    pin(v.interpretation, "method");
    commit(v.sourceCommit);
    array(v.incidents, 20, (x) => pin(x, "incident"));
    array(v.claims, 500, (x) => pin(x, "claim"));
    array(v.sources, 100, (x) => pin(x, "source"));
    for (const k of ["incidents", "claims"]) unique(v[k], (x) => x.id);
    unique(v.sources, keyOf);
    coverage(v.coverage);
    array(v.changes, 600, (x) => {
      exact(x, ["kind", "before", "after", "reason"]);
      one(x.kind, [
        "added",
        "revised",
        "disputed",
        "withdrawn",
        "access-lost",
        "capture-only",
      ]);
      nullable(x.before, pin);
      nullable(x.after, pin);
      string(x.reason);
    });
    strings(v.limitations);
  }
  canonicalBytes(
    v,
    v.kind === "edition"
      ? LIMITS.edition
      : v.kind === "method"
        ? LIMITS.method
        : LIMITS.record,
  );
  return v;
}
export function validateRegistry(input) {
  const v = snapshotJSON(input, LIMITS.registry);
  exact(v, [
    "format",
    "schemaVersion",
    "bootstrapSourceCommit",
    "selected",
    "editions",
    "hash",
  ]);
  literal(v.format, "charitology-disaster-registry");
  literal(v.schemaVersion, 1);
  commit(v.bootstrapSourceCommit);
  pin(v.selected, "edition");
  array(v.editions, 20, (x) => {
    exact(x, ["edition", "artifacts"]);
    pin(x.edition, "edition");
    file(x.artifacts);
    literal(x.artifacts.path, `artifacts/${x.edition.id}.json`);
    bound(x.artifacts.bytes, LIMITS.manifest);
  });
  if (!v.editions.length) fail("Registry has no edition");
  unique(v.editions, (x) => x.edition.id);
  hash(v.hash);
  if (recordHash("registry", v) !== v.hash) fail("Registry hash mismatch");
  canonicalBytes(v, LIMITS.registry);
  return v;
}
export function validateManifest(input) {
  const v = snapshotJSON(input, LIMITS.manifest);
  exact(v, ["format", "schemaVersion", "edition", "files"]);
  literal(v.format, "charitology-disaster-artifacts");
  literal(v.schemaVersion, 1);
  pin(v.edition, "edition");
  array(v.files, 3, file);
  literal(v.files.length, 3);
  v.files.forEach((x, i) =>
    literal(
      x.path,
      `exports/${v.edition.id}/${["edition.json", "edition.csv", "coverage.json"][i]}`,
    ),
  );
  canonicalBytes(v, LIMITS.manifest);
  return v;
}
export function references(v) {
  const out = [];
  function visit(x) {
    if (!x || typeof x !== "object") return;
    if (x.source?.kind === "source" && typeof x.item === "string") out.push(x);
    for (const y of Object.values(x))
      if (Array.isArray(y)) y.forEach(visit);
      else visit(y);
  }
  visit(v);
  return out;
}
export function typedPins(v) {
  const out = [];
  function visit(x) {
    if (!x || typeof x !== "object") return;
    if (
      Object.keys(x).length === 4 &&
      KINDS.includes(x.kind) &&
      typeof x.id === "string" &&
      typeof x.hash === "string" &&
      typeof x.version === "number"
    )
      out.push(x);
    for (const y of Object.values(x))
      if (Array.isArray(y)) y.forEach(visit);
      else visit(y);
  }
  visit(v);
  return out;
}
