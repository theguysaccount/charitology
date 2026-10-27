import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import {
  donorFixtures,
  grantBundle,
  STAMP,
  GRANT_DIMS,
} from "../test-fixtures/donor-recovery/factory.mjs";

const compiled = await build({
  stdin: {
    contents: `export * from './src/lib/client/donor-recovery-schemas.ts';export * from './src/lib/client/donor-recovery-formats.ts';export {allocateShares,allocateBest,tiltToSources,normalize} from './src/lib/compass.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  metafile: true,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
const oldCompiled = await build({
  stdin: {
    contents: `export {toolBackup} from './src/lib/client/durable-store.ts';export {sanitizeGift,giftsToJson,parseGiftFile} from './src/lib/client/gifts.ts';export {cleanCard,emptyCard} from './src/lib/client/giftcard.ts';export {newOrg} from './src/lib/client/diligence.ts';export {emptyDraft,cleanDraft} from './src/lib/client/theory-of-change.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const old = await import(
  `data:text/javascript;base64,${Buffer.from(oldCompiled.outputFiles[0].text).toString("base64")}`
);
let groups = 0;
function check(name, run) {
  try {
    run();
    groups++;
    process.stdout.write(`✓ ${name}\n`);
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const bytes = (s) => new TextEncoder().encode(s).byteLength;
const bad = (run) => assert.throws(run, (e) => e instanceof m.D1DataError);

check(
  "fourteen exact real-key fixtures are detached/frozen and roundtrip compatible v1 wrappers",
  () => {
    const f = donorFixtures();
    assert.deepEqual(Object.keys(f), m.D1_KEYS);
    for (const key of m.D1_KEYS) {
      const value = m.validateD1Value(key, f[key]);
      assert.deepEqual(value, f[key]);
      assert.notEqual(value, f[key]);
      assert.ok(Object.isFrozen(value));
      const backup = m.d1IndividualBackup(key, value, STAMP);
      assert.equal(backup.endsWith("\n"), false);
      assert.deepEqual(m.parseD1IndividualBackup(backup, key), f[key]);
      assert.deepEqual(
        m.parseD1IndividualBackup(new TextEncoder().encode(backup), key),
        f[key],
      );
    }
  },
);
check(
  "all fourteen canonical absent defaults validate without shared mutable nested state",
  () => {
    for (const key of m.D1_KEYS) {
      const a = m.d1DefaultValue(key),
        b = m.d1DefaultValue(key);
      assert.deepEqual(m.validateD1Value(key, a), a);
      if (a !== null) {
        assert.notEqual(a, b);
        assert.ok(Object.isFrozen(a));
      }
    }
    assert.equal(m.d1DefaultValue("grant-draft"), null);
    assert.deepEqual(
      m.d1DefaultValue("grant-weights"),
      Object.fromEntries(GRANT_DIMS.map((k) => [k, 5])),
    );
  },
);
check(
  "only saved grant draft null is valid; meaningful empty states stay empty",
  () => {
    for (const key of m.D1_KEYS) {
      if (key === "grant-draft")
        assert.equal(m.validateD1Value(key, null), null);
      else bad(() => m.validateD1Value(key, null));
    }
    for (const key of ["gifts", "ce-models", "grant-proposals"])
      assert.deepEqual(m.validateD1Value(key, []), []);
    assert.deepEqual(
      m.validateD1Value("due-diligence", { v: 1, current: "", orgs: [] }),
      { v: 1, current: "", orgs: [] },
    );
    bad(() =>
      m.validateD1Value("impact-drafts", { v: 1, current: "", drafts: [] }),
    );
    bad(() => m.validateD1Value("wrapped", {}));
  },
);
check(
  "gift calendar/cents/catalog/unknown-zero semantics and canonical optional fields",
  () => {
    const gift = donorFixtures().gifts[0];
    assert.equal(m.validateD1Value("gifts", [gift])[0].depth, null);
    assert.equal(
      m.validateD1Value("gifts", [{ ...gift, depth: 0 }])[0].depth,
      0,
    );
    assert.equal(
      m.validateD1Value("gifts", [{ ...gift, date: "2024-02-29" }])[0].date,
      "2024-02-29",
    );
    for (const edit of [
      { date: "2026-02-30" },
      { date: "2026-13-01" },
      { depth: 5 },
      { depth: "" },
      { amount: 0 },
      { amount: 0.001 },
      { amount: 1e10 },
      { cause: "invented" },
      { organization: "  altered  " },
      { note: "" },
      { sample: false },
    ])
      bad(() => m.validateD1Value("gifts", [{ ...gift, ...edit }]));
    assert.deepEqual(
      m.validateD1Value("gifts", [{ ...gift, note: "A note", sample: true }]),
      [{ ...gift, note: "A note", sample: true }],
    );
  },
);
check(
  "duplicate saved identities refuse rather than regenerate or drop records",
  () => {
    const f = donorFixtures();
    for (const key of ["gifts", "ce-models", "grant-proposals"])
      bad(() => m.validateD1Value(key, [f[key][0], clone(f[key][0])]));
    for (const [key, collection] of [
      ["legacy", "gifts"],
      ["split", "rows"],
      ["due-diligence", "orgs"],
      ["impact-drafts", "drafts"],
    ]) {
      const v = clone(f[key]);
      v[collection].push(clone(v[collection][0]));
      bad(() => m.validateD1Value(key, v));
      assert.equal(v[collection].length, 2);
    }
  },
);
check(
  "actual portfolio allocator and full signed tilt range survive both canonical and historical branches",
  () => {
    const f = donorFixtures().portfolio,
      w = m.normalize({ welfare: 1 });
    for (const tilt of [-100, 0, 100]) {
      const v = {
        ...f,
        allocation: m.tiltToSources(m.allocateShares(w), tilt / 100),
        alternative: m.tiltToSources(m.allocateBest(w), tilt / 100),
        state: { ...f.state, t: tilt },
      };
      assert.deepEqual(m.validateD1Value("portfolio", v), v);
    }
    assert.deepEqual(
      m.validateD1Value("portfolio", {
        allocation: { "global-health": 0.3333 },
        budget: 0,
      }),
      { allocation: { "global-health": 0.3333 }, budget: 0 },
    );
    assert.deepEqual(
      m.validateD1Value("portfolio", {
        ...f,
        method: "best",
        savedAt: "old date text",
      }),
      { ...f, method: "best", savedAt: "old date text" },
    );
    for (const edit of [
      { state: null },
      { alternative: null },
      { method: "" },
      { savedAt: "" },
      { allocation: { other: 1 } },
      { allocation: { "global-health": Infinity } },
    ])
      bad(() => m.validateD1Value("portfolio", { ...f, ...edit }));
  },
);
check(
  "legacy keeps unfinished worksheet values and old arbitrary savedAt without cleaning",
  () => {
    const f = donorFixtures().legacy;
    f.savedAt = "old text";
    f.gifts[0].amount = "unfinished $";
    f.gifts[0].ein = "pending";
    assert.deepEqual(m.validateD1Value("legacy", f), f);
    for (const edit of [
      { gifts: [] },
      { name: "x".repeat(101) },
      { savedAt: "" },
      { savedAt: "x".repeat(41) },
    ])
      bad(() => m.validateD1Value("legacy", { ...f, ...edit }));
    f.gifts[0].id = "not a slug";
    bad(() => m.validateD1Value("legacy", f));
  },
);
check(
  "card reasons retain legitimate duplicates but reject inherited enum names and limits",
  () => {
    const f = donorFixtures()["gift-card"];
    f.reasons = ["depth", "depth"];
    assert.deepEqual(m.validateD1Value("gift-card", f), f);
    for (const edit of [
      { style: "constructor" },
      { reasons: ["constructor"] },
      { reasons: ["toString"] },
      { reasons: ["depth", "voice", "cost", "harm"] },
      { message: "x".repeat(421) },
    ])
      bad(() => m.validateD1Value("gift-card", { ...f, ...edit }));
  },
);
check(
  "CE preserves long unfinished raw strings and old parseable timestamps without numeric execution",
  () => {
    const f = donorFixtures()["ce-models"];
    f[0].values.cost = ["-unfinished", "x".repeat(500), "1e"];
    f[0].discount = "d".repeat(100);
    f[0].seed = "s".repeat(100);
    f[0].savedAt = "January 1, 2020";
    assert.deepEqual(
      m.parseD1IndividualBackup(
        m.d1IndividualBackup("ce-models", f, STAMP),
        "ce-models",
      ),
      f,
    );
    bad(() =>
      m.validateD1Value("ce-models", [
        { ...f[0], values: { ...f[0].values, cost: ["1", "2"] } },
      ]),
    );
  },
);
check(
  "diligence retains sparse unknown/empty notes, exact catalogs and valid empty current",
  () => {
    const f = donorFixtures()["due-diligence"];
    f.current = "";
    f.orgs[0].notes = { outcomes: "   ", voice: "" };
    f.orgs[0].answers = { outcomes: "unknown", voice: "na", evidence: "no" };
    assert.deepEqual(m.validateD1Value("due-diligence", f), f);
    for (const edit of [
      { current: "missing" },
      { orgs: [{ ...f.orgs[0], id: "" }] },
      { orgs: [{ ...f.orgs[0], name: "n".repeat(161) }] },
      { orgs: [{ ...f.orgs[0], answers: { invented: "yes" } }] },
    ])
      bad(() => m.validateD1Value("due-diligence", { ...f, ...edit }));
  },
);
check(
  "grants retain null/zero scores, zero weights, unrestricted IDs/timestamps and orphan draft identity",
  () => {
    const f = donorFixtures();
    const p = f["grant-draft"];
    p.id = "arbitrary long id ".repeat(100);
    p.savedAt = "";
    p.scores.depth = 0;
    assert.deepEqual(m.validateD1Value("grant-draft", p), p);
    const blank = { ...p, id: "" };
    assert.deepEqual(m.validateD1Value("grant-draft", blank), blank);
    bad(() => m.validateD1Value("grant-proposals", [blank]));
    const weights = Object.fromEntries(GRANT_DIMS.map((k) => [k, 0]));
    assert.deepEqual(m.validateD1Value("grant-weights", weights), weights);
    bad(() => m.validateD1Value("grant-weights", { ...weights, harm: 11 }));
    const missing = { ...p.scores };
    delete missing.harm;
    bad(() => m.validateD1Value("grant-draft", { ...p, scores: missing }));
  },
);
check(
  "measurement preserves regex review dates, empty indicators and unknown depth without import reidentity",
  () => {
    const f = donorFixtures()["impact-drafts"];
    f.drafts[0].reviewDate = "2026-99-99";
    f.drafts[0].indicators = [];
    const copy = m.validateD1Value("impact-drafts", f);
    assert.deepEqual(copy, f);
    assert.equal(copy.drafts[0].id, "fictional-impact");
    bad(() => m.validateD1Value("impact-drafts", { ...f, current: "missing" }));
    f.drafts[0].depth = 0;
    assert.equal(m.validateD1Value("impact-drafts", f).drafts[0].depth, 0);
  },
);
check(
  "split keeps unknown budget, known zero/over100 shares and stored URL text independent of navigation",
  () => {
    const f = donorFixtures().split;
    f.rows[0].share = 0;
    f.rows[0].url = "unfinished link";
    f.savedAt = "old note";
    assert.deepEqual(m.validateD1Value("split", f), f);
    f.rows[0].share = 150;
    assert.deepEqual(m.validateD1Value("split", f), f);
    for (const total of [0, 0.5, 1e10])
      bad(() => m.validateD1Value("split", { ...f, total }));
  },
);
check(
  "compass complete producer maps must match fractional answers; aliases cannot bless missing maps",
  () => {
    const f = donorFixtures().compass;
    f.answers.d[0] = 50.5;
    f.position.horizon = 0.505;
    assert.deepEqual(m.validateD1Value("compass", f), f);
    bad(() => m.validateD1Value("compass", { answers: f.answers }));
    bad(() =>
      m.validateD1Value("compass", {
        ...f,
        weights: { ...f.weights, welfare: 4 },
      }),
    );
  },
);
check(
  "disaster zero/strict shares and old wrapped year preferences remain exact",
  () => {
    const d = donorFixtures()["disaster-plan"];
    d.what = "  preserve  ";
    assert.deepEqual(m.validateD1Value("disaster-plan", d), d);
    bad(() =>
      m.validateD1Value("disaster-plan", {
        ...d,
        shares: { relief: 50, recovery: 30, preparedness: 19 },
      }),
    );
    assert.deepEqual(
      m.validateD1Value("wrapped", {
        year: "old unavailable year",
        hide: true,
      }),
      { year: "old unavailable year", hide: true },
    );
  },
);
check(
  "only named optional own undefined object fields are omitted; required/null/array meanings persist",
  () => {
    const f = donorFixtures();
    f.legacy.savedAt = undefined;
    f.split.savedAt = undefined;
    f["grant-proposals"][0].savedAt = undefined;
    f["grant-draft"].savedAt = undefined;
    f.gifts[0].note = undefined;
    f.gifts[0].sample = undefined;
    for (const key of [
      "legacy",
      "split",
      "grant-proposals",
      "grant-draft",
      "gifts",
    ])
      assert.deepEqual(m.validateD1Value(key, f[key]), clone(f[key]));
    bad(() =>
      m.validateD1Value("wrapped", {
        year: "",
        hide: false,
        unknown: undefined,
      }),
    );
    bad(() => m.validateD1Value("gifts", [undefined]));
    bad(() =>
      m.validateD1Value("gifts", [{ ...f.gifts[0], depth: undefined }]),
    );
    const bundle = grantBundle(f);
    assert.equal(
      m.validateD1GrantBundle(bundle).members[0].value[0].savedAt,
      undefined,
    );
    bad(() =>
      m.validateD1GrantBundle({
        ...bundle,
        "members[0].value[0].savedAt": undefined,
      }),
    );
  },
);
check(
  "direct unsafe objects fail without getter/toJSON/array callback or identity generation",
  () => {
    let calls = 0;
    const getter = {
      year: "",
      get hide() {
        calls++;
        return false;
      },
    };
    bad(() => m.validateD1Value("wrapped", getter));
    class Evil extends Array {
      map() {
        calls++;
        return [];
      }
    }
    bad(() => m.canonicalD1Json(new Evil("x")));
    const callback = {
      year: "",
      hide: false,
      toJSON() {
        calls++;
        return {};
      },
    };
    bad(() => m.validateD1Value("wrapped", callback));
    const hidden = { year: "", hide: false };
    Object.defineProperty(hidden, "secret", { value: 1 });
    bad(() => m.validateD1Value("wrapped", hidden));
    const symbol = { year: "", hide: false, [Symbol("x")]: 1 };
    bad(() => m.validateD1Value("wrapped", symbol));
    bad(() =>
      m.validateD1Value(
        "wrapped",
        Object.assign(Object.create({}), { year: "", hide: false }),
      ),
    );
    const sparse = [];
    sparse.length = 2;
    bad(() => m.canonicalD1Json(sparse));
    const decorated = [];
    decorated.extra = true;
    bad(() => m.canonicalD1Json(decorated));
    const cycle = {};
    cycle.self = cycle;
    bad(() => m.canonicalD1Json(cycle));
    for (const v of [Infinity, NaN, 1n, () => {}, new Date()])
      bad(() => m.canonicalD1Json(v));
    assert.equal(calls, 0);
  },
);
check(
  "saved validation does not consult current time or generate an identity on refusal",
  () => {
    const RealDate = globalThis.Date,
      crypto = globalThis.crypto,
      descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
    let calls = 0;
    class ControlledDate extends RealDate {
      constructor(...args) {
        if (!args.length) {
          calls++;
          throw Error("unexpected current time");
        }
        super(...args);
      }
    }
    globalThis.Date = ControlledDate;
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => {
        calls++;
        throw Error("unexpected identity generation");
      },
    });
    try {
      const f = donorFixtures();
      for (const key of m.D1_KEYS) m.validateD1Value(key, f[key]);
      f.legacy.gifts[0].id = "";
      bad(() => m.validateD1Value("legacy", f.legacy));
      f.gifts[0].id = "";
      bad(() => m.validateD1Value("gifts", f.gifts));
      f["impact-drafts"].drafts[0].createdAt = "invalid";
      bad(() => m.validateD1Value("impact-drafts", f["impact-drafts"]));
      assert.equal(calls, 0);
    } finally {
      globalThis.Date = RealDate;
      if (descriptor) Object.defineProperty(crypto, "randomUUID", descriptor);
      else delete crypto.randomUUID;
    }
  },
);
check(
  "strict JSON rejects escaped duplicate names, excess depth, syntax and fatal UTF8",
  () => {
    for (const raw of [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '{"x":{"k":1,"k":2}}',
      "[1,]",
      "01",
      "true false",
      "1e999",
      '{"a":undefined}',
    ])
      bad(() => m.strictD1Json(raw, 1000));
    const exact = "[".repeat(32) + "null" + "]".repeat(32);
    assert.ok(m.strictD1Json(exact, 1000));
    bad(() => m.strictD1Json("[" + exact + "]", 1000));
    bad(() => m.strictD1Json(new Uint8Array([0xc3, 0x28]), 100));
    bad(() => m.strictD1Json(new Uint8Array([0xef, 0xbb, 0xbf, 0x31]), 100));
    assert.deepEqual(
      m.strictD1Json('{"__proto__":{"polluted":true}}', 1000),
      JSON.parse('{"__proto__":{"polluted":true}}'),
    );
    assert.equal({}.polluted, undefined);
  },
);
check(
  "fixed wrappers reject wrong key/version/extras and compact input that cannot be re-exported",
  () => {
    const base = JSON.parse(
      m.d1IndividualBackup("wrapped", donorFixtures().wrapped, STAMP),
    );
    for (const edit of [
      { key: "gifts" },
      { version: 2 },
      { extra: true },
      { exportedAt: "not a date" },
    ])
      bad(() =>
        m.parseD1IndividualBackup(
          JSON.stringify({ ...base, ...edit }),
          "wrapped",
        ),
      );
    bad(() => m.validateD1Value("constructor", {}));
    const compact = JSON.parse(
      m.d1IndividualBackup("ce-models", donorFixtures()["ce-models"], STAMP),
    );
    compact.value[0].values.cost[0] = "x".repeat(
      8_000_000 - bytes(JSON.stringify(compact)),
    );
    const fullCompact = JSON.stringify(compact);
    assert.equal(bytes(fullCompact), 8_000_000);
    assert.ok(bytes(JSON.stringify(compact, null, 2)) > 8_000_000);
    bad(() => m.parseD1IndividualBackup(fullCompact, "ce-models"));
  },
);
check(
  "actual old serializer exact 8,000,000 byte backup imports and re-exports with no newline; +1 refuses",
  () => {
    const f = donorFixtures()["ce-models"];
    const base = old.toolBackup("ce-models", f);
    f[0].values.cost[0] = "x".repeat(
      m.D1_LIMITS.individualBackupBytes - bytes(base),
    );
    const raw = old.toolBackup("ce-models", f);
    assert.equal(bytes(raw), 8_000_000);
    assert.equal(raw.endsWith("\n"), false);
    const value = m.parseD1IndividualBackup(raw, "ce-models");
    assert.equal(value[0].values.cost[0].length, f[0].values.cost[0].length);
    assert.equal(
      m.d1IndividualBackup("ce-models", value, JSON.parse(raw).exportedAt),
      raw,
    );
    bad(() => m.parseD1IndividualBackup(raw + " ", "ce-models"));
    f[0].values.cost[0] += "x";
    bad(() => m.d1IndividualBackup("ce-models", f, STAMP));
  },
);
check(
  "multibyte wrapper capacity uses actual UTF8 bytes, not character count",
  () => {
    const f = donorFixtures()["ce-models"];
    f[0].values.cost[0] = "é".repeat(4_000_000);
    bad(() => m.d1IndividualBackup("ce-models", f, STAMP));
    const raw = m.d1RawRecovery(
      "legacy",
      "protected",
      "é😀\ud800\udfff\r\n{bad",
    );
    assert.equal(
      m.parseD1RawRecovery(new TextEncoder().encode(raw)).raw,
      "é😀\ud800\udfff\r\n{bad",
    );
  },
);
check(
  "raw recovery preserves exact UTF16 protected/observed text and supports inert oversize copies",
  () => {
    const original = " \t{bad JSON\r\n\ud800 end\udfff";
    for (const kind of ["protected", "observed"]) {
      const raw = m.d1RawRecovery("legacy", kind, original);
      const out = m.parseD1RawRecovery(raw);
      assert.equal(out.raw, original);
      assert.equal(out.copy, kind);
      assert.ok(Object.isFrozen(out));
    }
    const oversize = "x".repeat(8_000_001);
    assert.equal(
      m.parseD1RawRecovery(m.d1RawRecovery("gifts", "observed", oversize)).raw
        .length,
      oversize.length,
    );
    bad(() =>
      m.parseD1IndividualBackup(
        m.d1RawRecovery("legacy", "protected", original),
        "legacy",
      ),
    );
  },
);
check(
  "raw-only complete wrapper exact 64,000,000 limit and +1 reject without truncation",
  () => {
    const overhead = bytes(m.d1RawRecovery("legacy", "protected", ""));
    const raw = "x".repeat(m.D1_RAW_ARCHIVE_BYTES - overhead);
    const body = m.d1RawRecovery("legacy", "protected", raw);
    assert.equal(bytes(body), 64_000_000);
    assert.equal(m.parseD1RawRecovery(body).raw.length, raw.length);
    bad(() => m.d1RawRecovery("legacy", "protected", raw + "x"));
    bad(() => m.parseD1RawRecovery(body + " "));
  },
);
check(
  "grant complete sources distinguish saved null/absence and reject orphan/unknown/duplicate order",
  () => {
    const bundle = grantBundle();
    const parsed = m.parseD1GrantBundle(m.d1GrantBundle(bundle));
    assert.deepEqual(parsed, bundle);
    const absent = clone(bundle);
    absent.members[2] = {
      key: "grant-draft",
      presence: "absent",
      persistence: "saved",
    };
    assert.equal(m.validateD1GrantBundle(absent).members[2].presence, "absent");
    const nullable = clone(bundle);
    nullable.members[2].value = null;
    assert.equal(m.validateD1GrantBundle(nullable).members[2].value, null);
    const orphan = clone(bundle);
    orphan.members[2].value.id = "missing";
    bad(() => m.validateD1GrantBundle(orphan));
    assert.equal(orphan.members[2].value.id, "missing");
    const wrong = clone(bundle);
    wrong.members.reverse();
    bad(() => m.validateD1GrantBundle(wrong));
    const dup = clone(bundle);
    dup.members[2] = clone(dup.members[1]);
    bad(() => m.validateD1GrantBundle(dup));
  },
);
check(
  "whole grant input exact 24,008,192 bytes is admitted, +1 refused, all member caps still enforced",
  () => {
    const body = m.d1GrantBundle(grantBundle());
    const padded =
      body + " ".repeat(m.D1_LIMITS.grantBundleBytes - bytes(body));
    assert.equal(bytes(padded), 24_008_192);
    assert.deepEqual(m.parseD1GrantBundle(padded), grantBundle());
    bad(() => m.parseD1GrantBundle(padded + " "));
    const b = grantBundle();
    b.members[2].value.savedAt = "x".repeat(8_000_000);
    bad(() => m.validateD1GrantBundle(b));
  },
);
check(
  "actual loose/native constructors are compatible only after their explicit construction, with no load cleaner",
  () => {
    const g = old.sanitizeGift({
      id: "fictional",
      date: "10/27/2026",
      organization: " Fictional  organization ",
      amount: "$12.50",
      depth: "unknown",
    });
    assert.deepEqual(m.validateD1Value("gifts", [g]), [g]);
    assert.deepEqual(
      m.validateD1Value("gift-card", old.emptyCard()),
      old.emptyCard(),
    );
    const org = old.newOrg("Fictional organization", new Date(STAMP));
    assert.deepEqual(
      m.validateD1Value("due-diligence", { v: 1, current: org.id, orgs: [org] })
        .orgs[0],
      org,
    );
    const d = old.emptyDraft(new Date(STAMP));
    assert.deepEqual(
      m.validateD1Value("impact-drafts", { v: 1, current: d.id, drafts: [d] })
        .drafts[0],
      d,
    );
  },
);
check(
  "canonical hashing JSON is order-stable, exact-value-sensitive and pure modules have no storage runtime import",
  () => {
    assert.equal(
      m.canonicalD1Json({ b: null, a: 0 }),
      m.canonicalD1Json({ a: 0, b: null }),
    );
    assert.notEqual(
      m.canonicalD1Json({ a: 0 }),
      m.canonicalD1Json({ a: null }),
    );
    for (const source of Object.keys(compiled.metafile.inputs))
      assert.equal(
        /client\/(gifts|durable-store|donor-recovery)\.ts$/.test(source),
        false,
        source,
      );
  },
);
const options = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  resolveJsonModule: true,
  esModuleInterop: true,
  skipLibCheck: true,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
};
const program = ts.createProgram(
  [
    "src/lib/client/donor-recovery-schemas.ts",
    "src/lib/client/donor-recovery-formats.ts",
  ],
  options,
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  process.stdout.write(
    `Donor schema/format checks: ${groups} groups; strict TypeScript 0 diagnostics.\n`,
  );
