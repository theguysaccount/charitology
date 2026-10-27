import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  canonical,
  canonicalBytes,
  parseJSON,
  recordHash,
  sha256,
  filePin,
  snapshotJSON,
  bound,
} from "../src/lib/disaster-incidents/canonical.mjs";
import { LIMITS } from "../src/lib/disaster-incidents/limits.mjs";
import {
  admitHistory,
  admitProductionHistory,
  assertProductionHistory,
  editionPacket,
  coveragePacket,
  historyJSON,
  historyInventory,
  historyRegistry,
  pinOf,
  recordPath,
  validateRecord,
  validateSourceNote,
  prepareEditionArtifacts,
  interpretationFiles,
  admitPacket,
} from "../src/lib/disaster-incidents/model.mjs";
import {
  packetJSON,
  packetCSV,
} from "../src/lib/disaster-incidents/formats.mjs";
import {
  freshness,
  deviceWarning,
  projectPacket,
} from "../src/lib/disaster-incidents/projection.mjs";
import { disasterFixture } from "./lib/disaster-model-fixtures.mjs";
let groups = 0;
const test = (name, run) => {
  run();
  groups++;
  console.log(`ok ${groups} ${name}`);
};
const refuse = (fn, pattern) => assert.throws(fn, pattern);
const seal = (r) => {
  const c = structuredClone(r);
  c.hash = recordHash(c.kind, c);
  return c;
};
// A separate RFC4180 scanner reconstructs every original typed DTO and array.
function csvPacket(bytes) {
  const s = Buffer.from(bytes).toString("utf8"),
    rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let n = 0; n < s.length; n++) {
    const c = s[n];
    if (quoted) {
      if (c === '"' && s[n + 1] === '"') {
        cell += '"';
        n++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') {
      assert.equal(cell, "");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r") {
      assert.equal(s[++n], "\n");
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  assert.equal(quoted, false);
  assert.equal(cell, "");
  assert.deepEqual(row, []);
  assert.deepEqual(rows.shift(), [
    "row_kind",
    "id",
    "version",
    "path",
    "sha256",
    "json_value",
  ]);
  const decoded = rows.map((r) => {
    assert.equal(r.length, 6);
    return r.map((c) => {
      assert.ok(c.startsWith("j:"));
      const v = JSON.parse(c.slice(2));
      assert.equal(typeof v, "string");
      return v;
    });
  });
  const header = decoded.shift();
  assert.deepEqual(header.slice(0, 5), ["header", "", "", "", ""]);
  const p = {
      ...JSON.parse(header[5]),
      method: null,
      incidents: [],
      claims: [],
      sources: [],
      notes: [],
      boundaryPins: [],
    },
    limits = [];
  for (const [k, id, version, path, hash, raw] of decoded) {
    const v = JSON.parse(raw);
    if (["method", "incident", "claim", "source"].includes(k)) {
      assert.deepEqual(
        [id, version, path, hash],
        [v.id, String(v.version), recordPath(v), v.hash],
      );
      if (k === "method") {
        assert.equal(p.method, null);
        p.method = v;
      } else p[k + "s"].push(v);
    } else if (k === "note") {
      const source = p.sources.find(
        (x) => x.id === id && String(x.version) === version,
      );
      assert.ok(source);
      assert.deepEqual(
        [path, hash],
        [source.publicNote.path, source.publicNote.sha256],
      );
      p.notes.push({ file: source.publicNote, value: v });
    } else if (k === "boundary") {
      assert.deepEqual(
        [id, version, path, hash],
        [v.pin.id, String(v.pin.version), "", v.pin.hash],
      );
      p.boundaryPins.push(v);
    } else {
      assert.equal(k, "limitation");
      assert.equal(id, String(limits.length));
      limits.push(v);
    }
  }
  assert.deepEqual(limits, p.limitations);
  return p;
}
const f = disasterFixture(),
  h = admitHistory(f.files),
  last = pinOf(f.editions.at(-1));
test("fixed immutable module bytes are exact and caller cannot mutate bindings", () => {
  const pins = interpretationFiles();
  assert.equal(pins.length, 4);
  for (const p of pins)
    assert.deepEqual(filePin(p.path, readFileSync(p.path)), p);
  assert.ok(Object.isFrozen(pins));
  refuse(() => pins.pop());
});
test("complete and selected actual serializers", () => {
  const p = editionPacket(h, last);
  assert.deepEqual(parseJSON(packetJSON(p), LIMITS.packet), p);
  assert.ok(packetCSV(p).includes(Buffer.from("j:")));
  const s = editionPacket(h, last, f.incidents[0][0].id);
  assert.equal(
    parseJSON(packetJSON(s), LIMITS.packet).scope.kind,
    "selected-incident",
  );
  assert.ok(packetCSV(s).length > 0);
  assert.deepEqual(csvPacket(packetCSV(p)), p);
  assert.deepEqual(csvPacket(packetCSV(s)), s);
});
test("opaque handles cannot be copied or forged", () => {
  refuse(() => historyRegistry({}));
  refuse(() => historyInventory(Object.create(null)));
  assert.equal(Object.keys(h).length, 0);
});
test("captured bytes, returned data and inventory are detached", () => {
  const before = historyJSON(h),
    inv = historyInventory(h);
  inv.get("registry.json").fill(0);
  historyRegistry(h).editions.pop();
  const p = editionPacket(h, last);
  p.incidents[0].name = "changed";
  assert.deepEqual(historyJSON(h), before);
  assert.notEqual(editionPacket(h, last).incidents[0].name, "changed");
  assert.deepEqual(
    historyJSON(admitHistory(new Map([...f.files].reverse()))),
    before,
  );
});
test("source roots absent before actual A", () =>
  assert.equal(existsSync("src/data/disaster-incidents"), false));
test("fictional structural memory never becomes production history or projection", () => {
  refuse(() => assertProductionHistory(h), /Nonproduction/);
  refuse(() => admitProductionHistory(f.files), /Nonproduction/);
  refuse(() => projectPacket(editionPacket(h, last)), /Nonproduction/);
});
test("all retained history is checked even if selected edition omits old source", () => {
  const real = disasterFixture({ productionShape: true }),
    rh = admitProductionHistory(real.files);
  assert.doesNotThrow(() => assertProductionHistory(rh));
  assert.equal(
    projectPacket(editionPacket(rh, pinOf(real.editions.at(-1)))).incidents
      .length,
    2,
  );
  const mixed = disasterFixture({
    productionShape: true,
    transformRecord: (kind, r) => {
      if (kind === "source" && r.version === 1) {
        r.descriptor = "fictional-private-only";
        r.requestedUrl = r.finalUrl = "https://synthetic.invalid/old";
      }
      if (kind === "edition" && r.id === "synthetic-edition-2") {
        r.claims = [];
        r.sources = r.sources.filter((p) => p.version === 2);
      }
      return r;
    },
  });
  for (const r of mixed.claims.flat(2))
    if (r.version === 2) mixed.files.delete(recordPath(r));
  const mh = admitHistory(mixed.files),
    mp = editionPacket(mh, pinOf(mixed.editions.at(-1)));
  assert.ok(mp.sources.every((s) => s.descriptor === "maui-home"));
  refuse(() => projectPacket(mp), /Nonproduction/);
});
test("record hash domain and ordered nested arrays", () => {
  assert.notEqual(
    recordHash("source", { a: 1 }),
    recordHash("incident", { a: 1 }),
  );
  assert.equal(
    canonical({ z: 1, a: ["b", "a"] }),
    '\u007b"a":["b","a"],"z":1}',
  );
  assert.notEqual(canonical({ a: ["b", "a"] }), canonical({ a: ["a", "b"] }));
});
for (const [name, raw] of [
  ["duplicate-key", '{"a":1,"\\u0061":2}'],
  ["BOM", "\ufeff{}"],
  ["trailing", "{}[]"],
  ["unsafe-key", '{"__proto__":0}'],
  ["unsafe-integer", "9007199254740992"],
  ["negative-zero", "-0"],
  ["fraction", "1.2"],
  ["surrogate", '"\\ud800"'],
])
  test("strict parser refuses " + name, () =>
    refuse(() => parseJSON(Buffer.from(raw))),
  );
test("invalid UTF8 is refused before JSON", () =>
  refuse(() => parseJSON(Uint8Array.of(0xc0, 0xaf))));
for (const [name, value] of [
  ["proxy", new Proxy({}, {})],
  [
    "accessor",
    Object.defineProperty({}, "x", {
      get() {
        throw Error("getter executed");
      },
      enumerable: true,
    }),
  ],
  ["symbol", { [Symbol("hidden")]: 1 }],
  ["sparse", Array(2)],
  ["decorated", Object.assign([], { x: 1 })],
  ["prototype", new Date()],
  [
    "cycle",
    (() => {
      const x = {};
      x.x = x;
      return x;
    })(),
  ],
])
  test("object boundary refuses " + name, () =>
    refuse(() => snapshotJSON(value)),
  );
test("proxy trap and getter are never executed", () => {
  let touched = false;
  refuse(() =>
    snapshotJSON(
      new Proxy(
        {},
        {
          ownKeys() {
            touched = true;
            throw Error();
          },
        },
      ),
    ),
  );
  refuse(() =>
    snapshotJSON(
      Object.defineProperty({}, "x", {
        get() {
          touched = true;
          return 0;
        },
        enumerable: true,
      }),
    ),
  );
  assert.equal(touched, false);
});
test("ordinary Map and byte storage only", () => {
  refuse(() => admitHistory(new Proxy(f.files, {})));
  refuse(() => admitHistory(Object.assign(new Map(f.files), { extra: 1 })));
  const bad = new Map(f.files);
  bad.set("registry.json", new Uint8Array(new SharedArrayBuffer(4)));
  refuse(() => admitHistory(bad));
  if (typeof ArrayBuffer.prototype.resize === "function") {
    bad.set(
      "registry.json",
      new Uint8Array(new ArrayBuffer(4, { maxByteLength: 8 })),
    );
    refuse(() => admitHistory(bad));
  }
});
test("noncanonical file bytes and unknown files refuse", () => {
  for (const p of [
    "../registry.json",
    "Registry.json",
    "original.pdf",
    "exports/synthetic-edition-2/wrong.json",
  ]) {
    const m = new Map(f.files);
    m.set(p, Buffer.from("{}\n"));
    refuse(() => admitHistory(m));
  }
  const m = new Map(f.files);
  m.set(
    "registry.json",
    Buffer.from(JSON.stringify(f.registry, null, 2) + "\n"),
  );
  refuse(() => admitHistory(m), /canonical/);
});
test("artifact bytes must reproduce exactly", () => {
  const m = new Map(f.files),
    path = `exports/${f.editions.at(-1).id}/edition.csv`;
  const bytes = Buffer.from(m.get(path));
  bytes[0] ^= 1;
  m.set(path, bytes);
  refuse(() => admitHistory(m), /Historical derived/);
});
test("missing manifest/source-note/record/derived refuses", () => {
  for (const p of [
    "artifacts/synthetic-edition-1.json",
    "notes/synthetic-source-0/v1.json",
    "records/source/synthetic-source-0/v1.json",
    "exports/synthetic-edition-1/edition.json",
  ]) {
    const m = new Map(f.files);
    m.delete(p);
    refuse(() => admitHistory(m));
  }
});
test("orphan retained records and noncontiguous predecessor authority refuse", () => {
  const m = new Map(f.files),
    extra = seal({ ...f.methods[0], id: "unused-method" });
  m.set(recordPath(extra), canonicalBytes(extra));
  refuse(() => admitHistory(m), /Unreachable/);
  const wrong = structuredClone(f.sources[0][1]);
  wrong.previous.hash = "0".repeat(64);
  const n = new Map(f.files);
  n.set(recordPath(wrong), canonicalBytes(seal(wrong)));
  refuse(() => admitHistory(n), /noncontiguous/);
});
test("registry order and edition.previous remain one exact immutable chain", () => {
  const e = seal({ ...f.editions.at(-1), previous: null }),
    r = structuredClone(f.registry);
  r.selected = pinOf(e);
  r.editions.at(-1).edition = pinOf(e);
  r.hash = recordHash("registry", r);
  const m = new Map(f.files);
  m.set(recordPath(e), canonicalBytes(e));
  m.set("registry.json", canonicalBytes(r));
  refuse(() => admitHistory(m), /previous chain/);
});
test("mutated selected packet and detached selected scope refuse", () => {
  const p = editionPacket(h, last, f.incidents[0][0].id);
  refuse(() => packetJSON(structuredClone(p)), /private complete/);
  p.claims.pop();
  refuse(() => packetJSON(p));
  const q = editionPacket(h, last, f.incidents[0][0].id);
  q.limitations[0] = "Different scope claim";
  refuse(() => packetCSV(q), /changed/);
});
test("complete plain packet re-admission requires all sources", () => {
  const p = structuredClone(editionPacket(h, last));
  p.sources.pop();
  p.notes.pop();
  refuse(() => packetJSON(p));
});
test("standalone complete serializers verify exact internal and repeated boundary hashes", () => {
  const p = structuredClone(editionPacket(h, last));
  p.edition.changes[0].after = { ...pinOf(p.claims[0]), hash: "0".repeat(64) };
  p.edition = seal(p.edition);
  refuse(() => packetJSON(p), /changed exact pin/);
  const q = structuredClone(editionPacket(h, last)),
    index = q.claims.findIndex((c) => c.version === 2);
  const changed = structuredClone(q.claims[index]);
  changed.previous.hash = "0".repeat(64);
  q.claims[index] = seal(changed);
  q.edition.claims = q.edition.claims.map((x) =>
    x.id === changed.id && x.version === changed.version
      ? pinOf(q.claims[index])
      : x,
  );
  q.edition = seal(q.edition);
  refuse(() => packetCSV(q), /changed exact pin/);
  const r = structuredClone(editionPacket(h, last));
  r.edition.changes[0].before = { ...r.edition.previous, hash: "0".repeat(64) };
  r.edition = seal(r.edition);
  refuse(() => packetJSON(r), /changed exact boundary/);
});
test("status evidence cannot change operation/appeal scope to incident ended", () =>
  refuse(
    () =>
      disasterFixture({
        transformRecord: (kind, r) => {
          if (
            kind === "incident" &&
            r.id === "synthetic-incident-0" &&
            r.version === 1
          ) {
            r.lifecycle.value = "ended";
            r.lifecycle.refs[0].item = "operation-status";
          }
          return r;
        },
      }),
    /lifecycle evidence/,
  ));
test("recovery evidence cannot establish incident ended", () =>
  refuse(
    () =>
      disasterFixture({
        transformRecord: (kind, r) => {
          if (
            kind === "incident" &&
            r.id === "synthetic-incident-0" &&
            r.version === 2
          )
            r.lifecycle.value = "ended";
          return r;
        },
      }),
    /lifecycle evidence/,
  ));
test("cross-incident claim correction and related links refuse", () => {
  for (const related of [false, true])
    refuse(
      () =>
        disasterFixture({
          transformRecord: (kind, r) => {
            if (
              kind === "claim" &&
              r.id === "synthetic-claim-1-4" &&
              r.version === 1
            ) {
              const q = pinOf(f.claims[0][0][0]);
              if (related) r.standing.related = [q];
              else r.content.corrects = q;
            }
            return r;
          },
        }),
      /Cross-incident/,
    );
});
test("unknown source-note role, target and typed status refuse", () => {
  for (const mutate of [
    (n) => (n.items[1].status = null),
    (n) => (n.items[1].status.targetKind = "appeal"),
    (n) => n.items[1].roles.push("made-up"),
  ])
    refuse(() =>
      disasterFixture({
        transformNote: (n) => {
          mutate(n);
          return n;
        },
      }),
    );
});
test("empty source notes and unsupported attributed claims refuse", () => {
  refuse(
    () => disasterFixture({ transformNote: (n) => ({ ...n, items: [] }) }),
    /At least one authored/,
  );
  for (const wanted of [
    "reported-need",
    "response-activity",
    "appeal-request",
    "correction",
  ])
    refuse(
      () =>
        disasterFixture({
          transformRecord: (kind, r) => {
            if (kind === "claim" && r.content.kind === wanted) {
              r.refs = [];
              if (r.content.quantity) r.content.quantity.refs = [];
            }
            return r;
          },
        }),
      /matching factual support/,
    );
});
test("actual isolated inventory count +1 refusals use production graph admission", () => {
  for (const kind of [
    "source",
    "incident",
    "claim",
    "method",
    "edition",
    "note",
    "incident-identities",
  ]) {
    const m = new Map(f.files),
      base =
        kind === "source"
          ? f.sources[0][0]
          : kind === "claim"
            ? f.claims[0][0][0]
            : kind === "method"
              ? f.methods[0]
              : kind === "edition"
                ? f.editions[0]
                : f.incidents[0][0];
    const count =
      kind === "source"
        ? 101 - f.sources.flat().length
        : kind === "claim"
          ? 501 - f.claims.flat(2).length
          : kind === "method"
            ? 5 - f.methods.length
            : kind === "edition"
              ? 21 - f.editions.length
              : kind === "note"
                ? 101 - f.sources.flat().length
                : kind === "incident-identities"
                  ? 21 - f.incidents.length
                  : 101 - f.incidents.flat().length;
    for (let n = 0; n < count; n++) {
      if (kind === "note") {
        const note = parseJSON(
          f.files.get("notes/synthetic-source-0/v1.json"),
          LIMITS.note,
        );
        note.sourceId = `additional-note-${n}`;
        m.set(`notes/${note.sourceId}/v1.json`, canonicalBytes(note));
        continue;
      }
      const r = structuredClone(base);
      r.id = `additional-${kind}-${n}`;
      r.version = 1;
      r.previous = null;
      if (kind === "source") {
        const note = parseJSON(
          f.files.get("notes/synthetic-source-0/v1.json"),
          LIMITS.note,
        );
        note.sourceId = r.id;
        note.sourceVersion = 1;
        const p = `notes/${r.id}/v1.json`,
          b = canonicalBytes(note);
        m.set(p, b);
        r.publicNote = filePin(p, b);
      }
      r.hash = recordHash(r.kind, r);
      m.set(recordPath(r), canonicalBytes(r));
    }
    refuse(() => admitHistory(m), /Limit exceeded/);
  }
});
test("per-incident edition51 refuses independently of total500", () =>
  refuse(() => disasterFixture({ claimCount: 51 }), /Limit/));
test("whole core aggregate16MiB refuses with individually valid records", () => {
  const m = new Map(f.files),
    c = structuredClone(f.claims[0][0][0]);
  c.limitations = Array(8).fill("😀".repeat(600));
  c.geography.areas = Array(12).fill("😀".repeat(600));
  c.geography.note = "😀".repeat(600);
  c.attributedSummary = "😀".repeat(600);
  c.sector.reason = "😀".repeat(600);
  assert.doesNotThrow(() => validateRecord(seal(c)));
  for (let n = 0; n < 310; n++) {
    const r = seal({ ...c, id: `large-claim-${n}` });
    m.set(recordPath(r), canonicalBytes(r));
  }
  assert.ok([...m.values()].reduce((n, b) => n + b.length, 0) > LIMITS.core);
  refuse(() => admitHistory(m), /Limit/);
});
test("formula-sensitive and multiline literal strings roundtrip without normalization", () => {
  const text = '\t=SUM(1,2)\r\n+1 -2 @A1 "quoted" 😀',
    sample = disasterFixture({
      transformRecord: (kind, r) =>
        kind === "claim" ? { ...r, attributedSummary: text } : r,
    }),
    handle = admitHistory(sample.files),
    p = editionPacket(handle, pinOf(sample.editions.at(-1)));
  assert.deepEqual(csvPacket(packetCSV(p)), p);
  assert.equal(csvPacket(packetCSV(p)).claims[0].attributedSummary, text);
  assert.ok(
    !Buffer.from(packetCSV(p))
      .toString()
      .split("\r\n")
      .some((line) => /^[=+@-]/.test(line)),
  );
});
test("rights cannot gain original distribution or change evidence label", () => {
  for (const mutate of [
    (r) => (r.rights.publicOriginal = true),
    (r) => (r.rights.reuse = "open"),
    (r) => (r.evidence = "independent-verification"),
  ])
    refuse(() =>
      validateRecord(
        seal(
          (() => {
            const s = structuredClone(f.sources[0][0]);
            mutate(s);
            return s;
          })(),
        ),
      ),
    );
});
test("source-note literal date/offset/day conversion is explicit", () => {
  const s = structuredClone(f.sources[0][0]);
  s.published = {
    kind: "day",
    day: "2025-11-03",
    literal: "03/11/2025",
    mapping: "day-month-year",
  };
  s.documentCreated = {
    kind: "instant",
    instant: "2026-06-01T13:20:49.000Z",
    literal: "2026-06-01T15:20:49+02",
    reportedOffset: "+02:00",
    mapping: "pdf-metadata",
  };
  assert.doesNotThrow(() => validateRecord(seal(s)));
  s.published.day = "2025-03-11";
  refuse(() => validateRecord(seal(s)), /mapping/);
  for (const value of [
    {
      kind: "day",
      day: "2025-11-03",
      literal: "November 3, 2025",
      mapping: "english-month-day",
    },
    {
      kind: "day",
      day: "2025-11-03",
      literal: "D:20251103",
      mapping: "pdf-metadata-day",
    },
  ]) {
    s.published = value;
    assert.doesNotThrow(() => validateRecord(seal(s)));
  }
  s.published = null;
  s.documentCreated = {
    kind: "instant",
    instant: "2026-06-01T13:20:49.000Z",
    literal: "D:20260601152049+02'00'",
    reportedOffset: "+02:00",
    mapping: "pdf-metadata",
  };
  assert.doesNotThrow(() => validateRecord(seal(s)));
});
test("all locator variants and bounded quotation/positions are actual admitted DTOs", () => {
  const original = parseJSON(
    f.files.get("notes/synthetic-source-0/v1.json"),
    LIMITS.note,
  );
  for (const locator of [
    {
      kind: "html",
      headings: ["Title"],
      paragraph: 1,
      shortQuote: "A short attributed locator.",
    },
    {
      kind: "pdf",
      pdfPage: 1,
      printedPage: "i",
      headings: ["Printed title"],
      row: ["Row"],
      column: ["Column"],
      shortQuote: null,
    },
    { kind: "json", pointer: "/a~1b/~0c", expectedLiteral: "0" },
    {
      kind: "metadata",
      field: "pdf-created",
      parser: "pdfinfo-26.10",
      observedLiteral: "2026-06-01T15:20:49+02",
    },
  ]) {
    const n = structuredClone(original);
    n.items[0].locator = locator;
    assert.doesNotThrow(() => validateSourceNote(n));
  }
  for (const locator of [
    { kind: "html", headings: [], paragraph: 0, shortQuote: null },
    {
      kind: "html",
      headings: [],
      paragraph: 1,
      shortQuote: Array(15).fill("word").join(" "),
    },
    { kind: "json", pointer: "/bad~9escape", expectedLiteral: "0" },
  ]) {
    const n = structuredClone(original);
    n.items[0].locator = locator;
    refuse(() => validateSourceNote(n));
  }
});
test("day/instant periods, invalid Gregorian days and mismatched offsets refuse", () => {
  const i = structuredClone(f.incidents[0][0]);
  i.period.end = {
    kind: "instant",
    instant: "2026-10-02T00:00:00.000Z",
    literal: "2026-10-02T00:00:00Z",
    reportedOffset: "Z",
    mapping: "rfc3339",
  };
  refuse(() => validateRecord(seal(i)));
  const s = structuredClone(f.sources[0][0]);
  s.published = {
    kind: "day",
    day: "2025-02-29",
    literal: "2025-02-29",
    mapping: "iso-day",
  };
  refuse(() => validateRecord(seal(s)));
  s.published = null;
  s.documentCreated = {
    kind: "instant",
    instant: "2026-06-01T13:20:49.000Z",
    literal: "2026-06-01T15:20:49+03:00",
    reportedOffset: "+02:00",
    mapping: "rfc3339",
  };
  refuse(() => validateRecord(seal(s)));
});
test("asOf/capture/retrieval/editorial chronology refuses", () => {
  for (const field of ["capturedAt", "asOf"])
    refuse(() =>
      disasterFixture({
        transformRecord: (kind, r) => {
          if (kind === "edition" && r.id === "synthetic-edition-1")
            r[field] =
              field === "capturedAt"
                ? "2026-09-01T00:00:00.000Z"
                : "2026-09-01T00:00:00.000Z";
          return r;
        },
      }),
    );
});
test("method files cap64/+1 and whole bytes32KiB", () => {
  const m = structuredClone(f.methods[0]);
  while (m.sourceFiles.length < 64)
    m.sourceFiles.push({
      path: `src/test-${m.sourceFiles.length}.mjs`,
      bytes: 0,
      sha256: "0".repeat(64),
    });
  assert.doesNotThrow(() => validateRecord(seal(m)));
  m.sourceFiles.push({
    path: "src/test-last.mjs",
    bytes: 0,
    sha256: "0".repeat(64),
  });
  refuse(() => validateRecord(seal(m)));
  refuse(
    () => parseJSON(Buffer.alloc(LIMITS.method + 1, 32), LIMITS.method),
    /Limit/,
  );
});
test("unknown fields, ID lengths and nested array boundaries refuse", () => {
  const i = structuredClone(f.incidents[0][0]);
  i.surprise = true;
  refuse(() => validateRecord(seal(i)));
  delete i.surprise;
  i.name = "x".repeat(121);
  refuse(() => validateRecord(seal(i)));
  i.name = "x".repeat(120);
  assert.doesNotThrow(() => validateRecord(seal(i)));
  i.geography.areas = Array(17).fill("a");
  refuse(() => validateRecord(seal(i)));
});
test("UTF8 whole file limits use complete encoded bytes", () => {
  const i = structuredClone(f.incidents[0][0]);
  i.limitations = Array(8).fill("😀".repeat(600));
  i.geography.areas = Array(16).fill("😀".repeat(600));
  i.geography.note = "😀".repeat(600);
  i.reviewRationale = "😀".repeat(600);
  i.editorial.reason = "😀".repeat(600);
  assert.ok(canonicalBytes(seal(i)).length > LIMITS.record);
  refuse(() => validateRecord(seal(i)), /Limit/);
  const n = parseJSON(
    f.files.get("notes/synthetic-source-0/v1.json"),
    LIMITS.note,
  );
  n.items[0].authoredText = "x".repeat(801);
  refuse(() => validateSourceNote(n));
});
test("depth and structural node boundaries refuse actual values", () => {
  let v = null;
  for (let n = 0; n < 33; n++) v = [v];
  refuse(() => snapshotJSON(v));
  refuse(() => snapshotJSON(Array(200001).fill(null)));
});
test("fixed numeric guard exact/+1 for every frozen aggregate", () => {
  for (const n of Object.values(LIMITS)) {
    assert.equal(bound(n, n), n);
    refuse(() => bound(n + 1, n));
  }
});
test("freshness exact deadline and device warning have no export authority", () => {
  const i = f.incidents[0][1],
    asOf = i.recheckAfter;
  assert.equal(freshness(i, asOf).atCapture, "review-overdue-at-capture");
  const p = editionPacket(h, last),
    before = packetJSON(p);
  assert.equal(
    deviceWarning([i], f.editions.at(-1).asOf, "2030-01-01T00:00:00.000Z").kind,
    "device-after-capture",
  );
  assert.equal(
    deviceWarning([i], f.editions.at(-1).asOf, "2030-01-01T01:00:00+01:00")
      .kind,
    "unassessable",
  );
  assert.equal(
    deviceWarning([i], f.editions.at(-1).asOf, null).kind,
    "unassessable",
  );
  assert.deepEqual(packetJSON(p), before);
});
test("history JSON contains exact all core bytes and ordered registry, no originals/derived bodies", () => {
  const hp = parseJSON(historyJSON(h), LIMITS.history);
  assert.equal(
    hp.files.length,
    [...f.files].filter(
      ([p]) => p !== "registry.json" && !p.startsWith("exports/"),
    ).length,
  );
  for (const x of hp.files)
    assert.deepEqual(filePin(x.file.path, Buffer.from(x.utf8)), x.file);
  assert.deepEqual(hp.registry, f.registry);
  assert.ok(hp.files.every((x) => !x.file.path.startsWith("exports/")));
  assert.deepEqual(coveragePacket(h, last).asOf, f.editions.at(-1).asOf);
});
test("full simultaneous capacity uses actual complete production validators and all historical artifact reproduction", () => {
  const big = disasterFixture({ full: true });
  assert.equal(big.files.size, 905);
  const bh = admitHistory(big.files),
    p = editionPacket(bh, pinOf(big.editions.at(-1)));
  assert.equal(p.incidents.length, 20);
  assert.equal(p.claims.length, 500);
  assert.equal(big.sources.flat().length, 100);
  assert.equal(big.incidents.flat().length, 100);
  assert.equal(big.methods.length, 4);
  assert.equal(big.editions.length, 20);
  assert.equal(historyRegistry(bh).editions.length, 20);
  assert.ok(historyJSON(bh).length < LIMITS.history);
  for (const e of big.editions)
    assert.deepEqual(
      csvPacket(big.files.get(`exports/${e.id}/edition.csv`)),
      editionPacket(bh, pinOf(e)),
    );
  const older = editionPacket(
    bh,
    pinOf(big.editions[5]),
    big.incidents[0][0].id,
  );
  assert.ok(
    older.boundaryPins.some(
      (x) => x.reason === "editorial-change-reference" && x.pin.version === 1,
    ),
  );
  assert.ok(packetJSON(older).length < LIMITS.packet);
  assert.ok(packetCSV(older).length < LIMITS.csv);
  assert.deepEqual(csvPacket(packetCSV(older)), older);
  const q = p.claims.find(
    (x) =>
      x.content.kind === "status" &&
      x.target.kind === "response-operation" &&
      x.content.value === "ended",
  );
  assert.ok(q);
  assert.equal(p.incidents[0].lifecycle.value, "recovery");
  assert.equal(
    p.claims.find((x) => x.id === "synthetic-claim-0-0" && x.version === 1)
      .content.quantity.reportedText,
    "0",
  );
  assert.equal(
    p.claims.find((x) => x.id === "synthetic-claim-0-1" && x.version === 1)
      .content.quantity,
    null,
  );
  refuse(() => assertProductionHistory(bh));
});
console.log(`${groups} Disaster model groups passed.`);
