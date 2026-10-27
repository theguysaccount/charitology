import { types } from "node:util";
import {
  LIMITS,
  PACKET_LIMITATIONS,
  DESCRIPTORS,
  QUALIFIER,
} from "./limits.mjs";
import {
  fail,
  bound,
  exact,
  snapshotJSON,
  parseJSON,
  canonicalBytes,
  canonical,
  equal,
  filePin,
  detachedBytes,
} from "./canonical.mjs";
import {
  validateRecord,
  validateSourceNote,
  validateRegistry,
  validateManifest,
  recordPath,
  pinOf,
  keyOf,
  pin,
  file,
  id,
  array,
  unique,
  references,
  typedPins,
  instant,
  coverage as checkCoverage,
} from "./schema.mjs";
const isExport = (p) =>
  /^exports\/[a-z][a-z0-9-]{0,63}\/(?:edition\.(?:json|csv)|coverage\.json)$/.test(
    p,
  );
const isCore = (p) =>
  /^(?:registry\.json|methods\/[a-z][a-z0-9-]{0,63}\/v[1-9]\d*\.json|records\/(?:source|incident|claim)\/[a-z][a-z0-9-]{0,63}\/v[1-9]\d*\.json|notes\/[a-z][a-z0-9-]{0,63}\/v[1-9]\d*\.json|editions\/[a-z][a-z0-9-]{0,63}\.json|artifacts\/[a-z][a-z0-9-]{0,63}\.json)$/.test(
    p,
  );
const fileMax = (p) =>
  p === "registry.json"
    ? LIMITS.registry
    : p.startsWith("notes/")
      ? LIMITS.note
      : p.startsWith("methods/")
        ? LIMITS.method
        : p.startsWith("editions/")
          ? LIMITS.edition
          : p.startsWith("artifacts/")
            ? LIMITS.manifest
            : p.endsWith(".csv")
              ? LIMITS.csv
              : isExport(p)
                ? LIMITS.packet
                : LIMITS.record;
export function captureFiles(input) {
  if (
    types.isProxy(input) ||
    !(input instanceof Map) ||
    Object.getPrototypeOf(input) !== Map.prototype ||
    Reflect.ownKeys(input).length
  )
    fail("Expected an ordinary file Map");
  const size = Reflect.apply(
    Object.getOwnPropertyDescriptor(Map.prototype, "size").get,
    input,
    [],
  );
  bound(size, LIMITS.files);
  const files = new Map();
  let total = 0;
  for (const [p, b] of Reflect.apply(Map.prototype.entries, input, [])) {
    if (typeof p !== "string" || p.length > 240 || (!isCore(p) && !isExport(p)))
      fail("Unknown inventory path", String(p));
    const bytes = detachedBytes(b, fileMax(p));
    total += bytes.length;
    bound(total, LIMITS.public);
    files.set(p, bytes);
  }
  return files;
}
function read(files, p, validate) {
  const b = files.get(p);
  if (!b) fail("Missing required file", p);
  const v = validate(parseJSON(b, fileMax(p)));
  if (!Buffer.from(canonicalBytes(v, fileMax(p))).equals(b))
    fail("File must use exact canonical JSON plus LF", p);
  return v;
}
export function candidateState(input) {
  const files = captureFiles(input),
    records = new Map(),
    notes = new Map(),
    manifests = new Map();
  let core = 0,
    derived = 0,
    coreCount = 0,
    derivedCount = 0;
  for (const [p, b] of files) {
    if (isExport(p)) {
      derived += b.length;
      derivedCount++;
      continue;
    }
    core += b.length;
    coreCount++;
    if (p === "registry.json") continue;
    if (p.startsWith("notes/")) {
      const n = read(files, p, validateSourceNote);
      if (p !== `notes/${n.sourceId}/v${n.sourceVersion}.json`)
        fail("Note path mismatch");
      notes.set(p, n);
    } else if (p.startsWith("artifacts/")) {
      const m = read(files, p, validateManifest);
      if (p !== `artifacts/${m.edition.id}.json`)
        fail("Manifest path mismatch");
      manifests.set(p, m);
    } else {
      const r = read(files, p, validateRecord);
      if (recordPath(r) !== p || records.has(keyOf(r)))
        fail("Record path/identity mismatch");
      records.set(keyOf(r), r);
    }
  }
  bound(core, LIMITS.core);
  bound(derived, LIMITS.derived);
  bound(core + derived, LIMITS.public);
  bound(coreCount, LIMITS.coreFiles);
  bound(derivedCount, LIMITS.derivedFiles);
  const state = {
    files,
    records,
    notes,
    manifests,
    coreBytes: core,
    derivedBytes: derived,
  };
  validateGraph(state);
  return state;
}
export function resolve(state, p) {
  const r = state.records.get(keyOf(p));
  if (!r || r.hash !== p.hash) fail("Missing or changed exact pin", keyOf(p));
  return r;
}
function refItem(state, x) {
  const s = resolve(state, x.source),
    n = state.notes.get(s.publicNote.path),
    item = n?.items.find((i) => i.id === x.item);
  if (!item || !item.roles.includes(x.role))
    fail("Missing source-note role/item");
  return { source: s, item };
}
function validateFacts(state, r) {
  const all = references(r);
  if (r.kind === "claim") {
    if (r.content.kind !== "status" && !all.length)
      fail("Attributed claim requires matching factual support");
    const sourceKeys = new Set(all.map((x) => keyOf(x.source)));
    bound(sourceKeys.size, 8);
    for (const p of [
      ...(r.content.kind === "correction" ? [r.content.corrects] : []),
      ...r.standing.related,
    ])
      if (resolve(state, p).incidentId !== r.incidentId)
        fail("Cross-incident claim relationship");
  }
  for (const x of all) {
    const { source, item } = refItem(state, x);
    if (
      source.access.outcome !== "retrieved" ||
      item.basis !== "source-self-report" ||
      x.role === "access"
    )
      fail("Access-only evidence cannot establish facts");
    if (r.kind === "claim" && !equal(item.target, r.target))
      fail("Claim evidence target mismatch");
    if (r.kind === "incident" && item.target.incidentId !== r.id)
      fail("Incident evidence identity mismatch");
    if (x.role === "status") {
      if (!item.status || item.status.targetKind !== item.target.kind)
        fail("Missing typed status");
      if (
        r.kind === "incident" &&
        (item.target.kind !== "incident" ||
          item.status.value !== r.lifecycle.value)
      )
        fail("Incident lifecycle evidence value/scope mismatch");
      if (
        r.kind === "claim" &&
        r.content.kind === "status" &&
        item.status.value !== r.content.value
      )
        fail("Claim status evidence value mismatch");
    }
  }
}
export function claimClosure(state, pins) {
  const out = [],
    seen = new Set();
  function add(p) {
    if (seen.has(keyOf(p))) return;
    seen.add(keyOf(p));
    const c = resolve(state, p);
    if (c.kind !== "claim") fail("Expected claim");
    out.push(c);
    for (const q of [
      ...(c.content.kind === "correction" ? [c.content.corrects] : []),
      ...c.standing.related,
    ])
      add(q);
  }
  pins.forEach(add);
  return out;
}
function neededSources(incidents, claims, checks) {
  const wanted = new Set(checks.map(keyOf));
  for (const r of [...incidents, ...claims])
    for (const x of references(r)) wanted.add(keyOf(x.source));
  return wanted;
}
function validateEdition(state, e) {
  const method = resolve(state, e.interpretation);
  if (e.sourceCommit !== method.sourceCommit)
    fail("Edition interpretation commit mismatch");
  const inc = e.incidents.map((p) => resolve(state, p)),
    claims = claimClosure(state, e.claims),
    sources = e.sources.map((p) => resolve(state, p)),
    ids = new Set(inc.map((i) => i.id)),
    counts = new Map();
  for (const c of claims)
    if (!ids.has(c.incidentId)) fail("Claim incident missing from edition");
  for (const p of e.claims) {
    const c = resolve(state, p);
    counts.set(c.incidentId, (counts.get(c.incidentId) ?? 0) + 1);
  }
  for (const n of counts.values()) bound(n, 50);
  for (const i of inc)
    if (i.checkedAt > e.asOf || i.editorial.decidedAt > e.asOf)
      fail("Incident observation follows edition asOf");
  for (const s of sources)
    if (s.retrievedAt > e.asOf) fail("Source retrieval follows edition asOf");
  const wanted = neededSources(inc, claims, e.coverage.accessibilityChecks);
  if (
    wanted.size !== sources.length ||
    sources.some((s) => !wanted.has(keyOf(s)))
  )
    fail("Edition source inventory must exactly close facts and access checks");
  for (const p of e.coverage.accessibilityChecks) resolve(state, p);
  for (const c of e.changes) {
    if (c.before) resolve(state, c.before);
    if (c.after) resolve(state, c.after);
  }
  return { incidents: inc, claims, sources };
}
function validateGraph(state) {
  const counts = { source: 0, incident: 0, claim: 0, method: 0, edition: 0 },
    identities = new Map();
  for (const r of state.records.values()) {
    counts[r.kind]++;
    const k = r.kind + ":" + r.id;
    if (!identities.has(k)) identities.set(k, []);
    identities.get(k).push(r);
  }
  for (const [k, max] of Object.entries({
    source: LIMITS.sources,
    incident: LIMITS.incidents,
    claim: LIMITS.claims,
    method: LIMITS.methods,
    edition: LIMITS.editions,
  }))
    bound(counts[k], max);
  bound(
    [...identities.keys()].filter((k) => k.startsWith("incident:")).length,
    LIMITS.incidentIdentities,
  );
  bound(state.notes.size, LIMITS.notes);
  if (state.notes.size !== counts.source)
    fail("Exactly one source note per source version required");
  for (const group of identities.values()) {
    if (group[0].kind === "edition") {
      if (group.length !== 1) fail("Edition identity repeated");
      continue;
    }
    group.sort((a, b) => a.version - b.version);
    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      if (
        r.version !== i + 1 ||
        !equal(r.previous, i ? pinOf(group[i - 1]) : null)
      )
        fail("Missing, changed or noncontiguous predecessor");
    }
  }
  const expectedNotes = new Set();
  for (const r of state.records.values()) {
    for (const p of typedPins(r)) resolve(state, p);
    if (r.kind === "source") {
      const n = state.notes.get(r.publicNote.path);
      if (!n) fail("Missing source note");
      expectedNotes.add(r.publicNote.path);
      if (
        !equal(
          filePin(r.publicNote.path, state.files.get(r.publicNote.path)),
          r.publicNote,
        ) ||
        n.sourceId !== r.id ||
        n.sourceVersion !== r.version ||
        n.originalSha256 !== (r.original?.sha256 ?? null)
      )
        fail("Source note byte/original pin mismatch");
      if (
        r.access.outcome === "unavailable" &&
        n.items.some(
          (x) =>
            x.basis !== "editorial-access-note" ||
            x.roles.some((role) => role !== "access") ||
            x.status !== null,
        )
      )
        fail("Unavailable source requires access-only note");
    }
    if (r.kind === "incident" || r.kind === "claim") validateFacts(state, r);
  }
  for (const p of state.notes.keys())
    if (!expectedNotes.has(p)) fail("Orphan source note");
  for (const r of state.records.values())
    if (r.kind === "edition") validateEdition(state, r);
}
export function packetFromState(state, e, incidentId) {
  if (incidentId !== undefined) id(incidentId);
  resolve(state, pinOf(e));
  validateEdition(state, e);
  if (incidentId !== undefined && !e.incidents.some((p) => p.id === incidentId))
    fail("Incident is not a member of this edition");
  const inc = e.incidents
      .map((p) => resolve(state, p))
      .filter((i) => incidentId === undefined || i.id === incidentId),
    claims = claimClosure(
      state,
      e.claims.filter(
        (p) =>
          incidentId === undefined ||
          resolve(state, p).incidentId === incidentId,
      ),
    );
  const checks = e.coverage.accessibilityChecks.filter(
      (p) =>
        incidentId === undefined ||
        state.notes
          .get(resolve(state, p).publicNote.path)
          .items.some((x) => x.target.incidentId === incidentId),
    ),
    wanted = neededSources(inc, claims, checks),
    sources = e.sources
      .map((p) => resolve(state, p))
      .filter((s) => wanted.has(keyOf(s))),
    method = resolve(state, e.interpretation),
    inside = new Set([e, method, ...inc, ...claims, ...sources].map(keyOf)),
    boundary = new Map();
  const edge = (p, reason) => {
    if (p && !inside.has(keyOf(p)) && !boundary.has(keyOf(p)))
      boundary.set(keyOf(p), { pin: p, reason });
  };
  for (const r of [e, method, ...inc, ...claims, ...sources])
    edge(r.previous, "historical-predecessor");
  for (const p of [...e.incidents, ...e.claims, ...e.sources])
    edge(p, "unselected-edition-member");
  for (const c of e.changes) {
    edge(c.before, "editorial-change-reference");
    edge(c.after, "editorial-change-reference");
  }
  const packet = {
    format: "charitology-disaster-packet",
    schemaVersion: 1,
    scope:
      incidentId === undefined
        ? { kind: "complete-edition" }
        : { kind: "selected-incident", incidentId },
    edition: e,
    method,
    incidents: inc,
    claims,
    sources,
    notes: sources.map((s) => ({
      file: s.publicNote,
      value: state.notes.get(s.publicNote.path),
    })),
    boundaryPins: [...boundary.values()],
    limitations: [...PACKET_LIMITATIONS],
  };
  for (const p of typedPins(packet))
    if (!inside.has(keyOf(p)) && !boundary.has(keyOf(p)))
      fail("Unclassified external typed pin");
  const paths = new Set([
    recordPath(e),
    recordPath(method),
    ...inc.map(recordPath),
    ...claims.map(recordPath),
    ...sources.map(recordPath),
    ...sources.map((s) => s.publicNote.path),
  ]);
  let bytes = 0;
  for (const p of paths) bytes += state.files.get(p).length;
  bound(bytes, LIMITS.closure);
  canonicalBytes(packet, LIMITS.packet);
  return snapshotJSON(packet, LIMITS.packet);
}
export function coverageFromEdition(e) {
  return {
    format: "charitology-disaster-coverage",
    schemaVersion: 1,
    edition: pinOf(e),
    asOf: e.asOf,
    coverage: snapshotJSON(e.coverage),
    incidentIds: e.incidents.map((p) => p.id),
    limitations: [...e.limitations],
  };
}
export function packetCSVBytes(p) {
  const rows = [],
    add = (kind, id, version, path, hash, value) =>
      rows.push([kind, id, version, path, hash, canonical(value)]);
  add("header", "", "", "", "", {
    format: p.format,
    schemaVersion: 1,
    scope: p.scope,
    edition: p.edition,
    limitations: p.limitations,
  });
  for (const [kind, list] of [
    ["method", [p.method]],
    ["incident", p.incidents],
    ["claim", p.claims],
    ["source", p.sources],
  ])
    for (const r of list)
      add(kind, r.id, String(r.version), recordPath(r), r.hash, r);
  for (const n of p.notes)
    add(
      "note",
      n.value.sourceId,
      String(n.value.sourceVersion),
      n.file.path,
      n.file.sha256,
      n.value,
    );
  for (const b of p.boundaryPins)
    add("boundary", b.pin.id, String(b.pin.version), "", b.pin.hash, b);
  p.limitations.forEach((v, i) => add("limitation", String(i), "", "", "", v));
  const cell = (v) =>
    '"' + ("j:" + JSON.stringify(v)).replaceAll('"', '""') + '"';
  const bytes = Buffer.from(
    "row_kind,id,version,path,sha256,json_value\r\n" +
      rows.map((r) => r.map(cell).join(",")).join("\r\n") +
      "\r\n",
  );
  bound(bytes.length, LIMITS.csv);
  return bytes;
}
export function artifactsFromState(state, e) {
  const packet = packetFromState(state, e),
    files = new Map([
      [`exports/${e.id}/edition.json`, canonicalBytes(packet, LIMITS.packet)],
      [`exports/${e.id}/edition.csv`, packetCSVBytes(packet)],
      [
        `exports/${e.id}/coverage.json`,
        canonicalBytes(coverageFromEdition(e), LIMITS.packet),
      ],
    ]);
  return {
    packet,
    manifest: {
      format: "charitology-disaster-artifacts",
      schemaVersion: 1,
      edition: pinOf(e),
      files: [...files].map(([p, b]) => filePin(p, b)),
    },
    files,
  };
}
export function completeState(input) {
  const state = candidateState(input),
    registry = read(state.files, "registry.json", validateRegistry),
    editions = registry.editions.map((x) => resolve(state, x.edition));
  resolve(state, registry.selected);
  if (!registry.editions.some((x) => equal(x.edition, registry.selected)))
    fail("Selected edition missing from registry");
  if (state.manifests.size !== editions.length)
    fail("Orphan or missing manifest");
  let expectedExports = 0;
  for (let i = 0; i < editions.length; i++) {
    const e = editions[i],
      member = registry.editions[i];
    if (!equal(e.previous, i ? pinOf(editions[i - 1]) : null))
      fail("Edition previous chain/order mismatch");
    const manifest = state.manifests.get(member.artifacts.path);
    if (
      !manifest ||
      !equal(manifest.edition, pinOf(e)) ||
      !equal(
        filePin(member.artifacts.path, state.files.get(member.artifacts.path)),
        member.artifacts,
      )
    )
      fail("Registry artifact manifest mismatch");
    const generated = artifactsFromState(state, e);
    if (!equal(manifest, generated.manifest))
      fail("Historical artifact manifest reproduction failed");
    for (const [p, b] of generated.files) {
      const actual = state.files.get(p);
      if (!actual || !actual.equals(b))
        fail("Historical derived bytes changed or missing", p);
      expectedExports++;
    }
  }
  if ([...state.files.keys()].filter(isExport).length !== expectedExports)
    fail("Orphan derived file");
  const reachable = new Set();
  function visit(p) {
    if (reachable.has(keyOf(p))) return;
    const r = resolve(state, p);
    reachable.add(keyOf(p));
    for (const q of typedPins(r)) visit(q);
  }
  for (const e of editions) visit(pinOf(e));
  if (reachable.size !== state.records.size)
    fail("Unreachable retained record");
  return { ...state, registry };
}
// Packet re-admission deliberately has no history/selection capability. Every
// internal factual edge must close; only the exact declared provenance edges
// may be absent. Source-note context can be broader than the selected incident.
export function packetState(input) {
  const p = snapshotJSON(input, LIMITS.packet);
  exact(p, [
    "format",
    "schemaVersion",
    "scope",
    "edition",
    "method",
    "incidents",
    "claims",
    "sources",
    "notes",
    "boundaryPins",
    "limitations",
  ]);
  if (p.format !== "charitology-disaster-packet" || p.schemaVersion !== 1)
    fail("Invalid packet format");
  if (
    !p.scope ||
    !["complete-edition", "selected-incident"].includes(p.scope.kind)
  )
    fail("Invalid scope");
  exact(
    p.scope,
    p.scope.kind === "selected-incident" ? ["kind", "incidentId"] : ["kind"],
  );
  if (p.scope.kind === "selected-incident") id(p.scope.incidentId);
  const e = validateRecord(p.edition),
    method = validateRecord(p.method);
  if (
    e.kind !== "edition" ||
    method.kind !== "method" ||
    !equal(pinOf(method), e.interpretation) ||
    e.sourceCommit !== method.sourceCommit
  )
    fail("Packet interpretation mismatch");
  array(p.incidents, 20);
  array(p.claims, 500);
  array(p.sources, 100);
  array(p.notes, 100);
  array(p.boundaryPins, 1000);
  array(p.limitations, 8, (x) => {
    if (typeof x !== "string" || x.length > 1200) fail("Invalid limitation");
  });
  const state = {
    records: new Map([
      [keyOf(e), e],
      [keyOf(method), method],
    ]),
    notes: new Map(),
    files: new Map(),
  };
  for (const [kind, list] of [
    ["incident", p.incidents],
    ["claim", p.claims],
    ["source", p.sources],
  ])
    for (const value of list) {
      const r = validateRecord(value);
      if (r.kind !== kind || state.records.has(keyOf(r)))
        fail("Packet kind/duplicate mismatch");
      state.records.set(keyOf(r), r);
    }
  for (const r of state.records.values())
    state.files.set(recordPath(r), canonicalBytes(r));
  for (const n of p.notes) {
    exact(n, ["file", "value"]);
    file(n.file);
    const value = validateSourceNote(n.value);
    if (
      state.notes.has(n.file.path) ||
      n.file.path !== `notes/${value.sourceId}/v${value.sourceVersion}.json`
    )
      fail("Packet note path/duplicate");
    const bytes = canonicalBytes(value, LIMITS.note);
    if (!equal(filePin(n.file.path, bytes), n.file))
      fail("Packet note hash mismatch");
    state.notes.set(n.file.path, value);
    state.files.set(n.file.path, bytes);
  }
  const boundary = new Map();
  for (const b of p.boundaryPins) {
    exact(b, ["pin", "reason"]);
    pin(b.pin);
    if (
      ![
        "historical-predecessor",
        "unselected-edition-member",
        "editorial-change-reference",
      ].includes(b.reason) ||
      state.records.has(keyOf(b.pin)) ||
      boundary.has(keyOf(b.pin))
    )
      fail("Invalid boundary");
    boundary.set(keyOf(b.pin), b);
  }
  const expectedBoundary = new Map(),
    edge = (q, reason) => {
      if (q && !state.records.has(keyOf(q)) && !expectedBoundary.has(keyOf(q)))
        expectedBoundary.set(keyOf(q), { pin: q, reason });
    };
  for (const r of [e, method, ...p.incidents, ...p.claims, ...p.sources])
    edge(r.previous, "historical-predecessor");
  for (const q of [...e.incidents, ...e.claims, ...e.sources])
    edge(q, "unselected-edition-member");
  for (const c of e.changes) {
    edge(c.before, "editorial-change-reference");
    edge(c.after, "editorial-change-reference");
  }
  if (!equal([...expectedBoundary.values()], p.boundaryPins))
    fail("Exact boundary closure/order mismatch");
  for (const q of typedPins(p)) {
    if (state.records.has(keyOf(q))) resolve(state, q);
    else if (!boundary.has(keyOf(q)) || !equal(boundary.get(keyOf(q)).pin, q))
      fail("Unclassified or changed exact boundary pin");
  }
  for (const r of [...p.incidents, ...p.claims]) validateFacts(state, r);
  for (const s of p.sources) {
    const n = state.notes.get(s.publicNote.path);
    if (
      !n ||
      !equal(
        s.publicNote,
        filePin(s.publicNote.path, state.files.get(s.publicNote.path)),
      ) ||
      n.originalSha256 !== (s.original?.sha256 ?? null)
    )
      fail("Packet source/note mismatch");
    if (
      s.access.outcome === "unavailable" &&
      n.items.some(
        (x) =>
          x.basis !== "editorial-access-note" ||
          x.roles.some((role) => role !== "access") ||
          x.status !== null,
      )
    )
      fail("Unavailable packet note establishes facts");
    if (s.retrievedAt > e.asOf) fail("Source after asOf");
  }
  if (state.notes.size !== p.sources.length) fail("Orphan packet note");
  const selected =
    p.scope.kind === "selected-incident" ? p.scope.incidentId : undefined;
  const expectedInc = e.incidents.filter(
    (x) => selected === undefined || x.id === selected,
  );
  if (
    !equal(expectedInc, p.incidents.map(pinOf)) ||
    (!expectedInc.length && selected !== undefined)
  )
    fail("Packet incident scope mismatch");
  if (selected === undefined && !equal(e.sources, p.sources.map(pinOf)))
    fail("Complete packet omits edition source members");
  const selectedClaims =
    selected === undefined
      ? e.claims
      : e.claims.filter((q) =>
          p.claims.some((c) => equal(pinOf(c), q) && c.incidentId === selected),
        );
  if (
    !equal(claimClosure(state, selectedClaims).map(pinOf), p.claims.map(pinOf))
  )
    fail("Packet claims closure/order mismatch");
  for (const c of p.claims)
    if (!p.incidents.some((i) => i.id === c.incidentId))
      fail("Packet claim incident missing");
  const checks = e.coverage.accessibilityChecks.filter(
      (q) =>
        state.records.has(keyOf(q)) &&
        (selected === undefined ||
          state.notes
            .get(resolve(state, q).publicNote.path)
            .items.some((x) => x.target.incidentId === selected)),
    ),
    wanted = neededSources(p.incidents, p.claims, checks);
  if (
    !equal(
      e.sources.filter((q) => wanted.has(keyOf(q))),
      p.sources.map(pinOf),
    )
  )
    fail("Packet sources scope/order mismatch");
  for (const i of p.incidents)
    if (i.checkedAt > e.asOf || i.editorial.decidedAt > e.asOf)
      fail("Incident after asOf");
  let closure = 0;
  for (const b of state.files.values()) closure += b.length;
  bound(closure, LIMITS.closure);
  canonicalBytes(p, LIMITS.packet);
  return { packet: p, state };
}
export function assertProductionState(state) {
  for (const s of state.records.values())
    if (s.kind === "source") {
      const wanted = DESCRIPTORS[s.descriptor];
      if (!wanted || s.requestedUrl !== wanted || s.finalUrl !== wanted)
        fail("Nonproduction source descriptor or URL");
    }
  function scan(v) {
    if (typeof v === "string" && /^https:\/\//.test(v)) {
      const host = new URL(v).hostname.toLowerCase();
      if (host === "invalid" || host.endsWith(".invalid"))
        fail("Fictional URL cannot enter production");
    } else if (v && typeof v === "object") Object.values(v).forEach(scan);
  }
  for (const r of state.records.values()) scan(r);
  for (const n of state.notes.values()) scan(n);
}
export function freshnessValue(incident, asOf) {
  const i = validateRecord(incident);
  if (i.kind !== "incident") fail("Expected incident");
  instant(asOf);
  if (i.checkedAt > asOf || i.editorial.decidedAt > asOf)
    fail("Observation after asOf");
  return {
    asOf,
    checkedAt: i.checkedAt,
    recheckAfter: i.recheckAfter,
    atCapture:
      i.recheckAfter <= asOf
        ? "review-overdue-at-capture"
        : "not-due-at-capture",
  };
}
export function deviceWarningValue(incidents, asOf, device) {
  const captured = snapshotJSON(incidents, LIMITS.packet);
  array(captured, 20);
  instant(asOf);
  const values = captured.map((x) => {
    const r = validateRecord(x);
    if (r.kind !== "incident") fail("Expected incident");
    freshnessValue(r, asOf);
    return r;
  });
  let valid = false;
  try {
    instant(device);
    valid = device >= asOf;
  } catch {}
  return valid
    ? {
        kind: "device-after-capture",
        displayedDeviceInstant: device,
        overdueIncidentIds: values
          .filter((i) => i.recheckAfter <= device)
          .map((i) => i.id),
        qualifier: QUALIFIER,
      }
    : {
        kind: "unassessable",
        displayedDeviceInstant: null,
        overdueIncidentIds: [],
        qualifier: QUALIFIER,
      };
}
