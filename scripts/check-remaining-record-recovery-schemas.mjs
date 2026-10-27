import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actual,
  producers,
  bundle,
  strict,
  clone,
  researchValue,
  researchValues,
  maximalCountry,
  maximalManuscript,
  maximalNominations,
  maximalDepth,
  exactResearch,
  exactPartner,
  STAMP,
} from "../test-fixtures/remaining-record-recovery/harness.mjs";
const m = await actual(),
  { old, research, cases } = await producers();
let groups = 0;
const bytes = (s) => Buffer.byteLength(s),
  bad = (fn, code) =>
    assert.throws(
      fn,
      (e) =>
        (!code || e.code === code) &&
        ["invalid_data", "input_limit"].includes(e.code),
    );
async function check(name, fn) {
  try {
    await fn();
    groups++;
    console.log("PASS " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
await check(
  "strict actual inert schemas and formats have no runtime producer or storage dependency",
  async () => {
    await strict([
      "src/lib/client/remaining-record-recovery-schemas.ts",
      "src/lib/client/remaining-record-recovery-formats.ts",
    ]);
    const { inputs } = await bundle(
      'export * from "./src/lib/client/remaining-record-recovery-schemas.ts";export * from "./src/lib/client/remaining-record-recovery-formats.ts";',
    );
    assert.deepEqual(
      inputs.filter((p) => p !== "<stdin>").sort(),
      [
        "src/data/program-graph-adapters.ts",
        "src/lib/client/remaining-record-recovery-formats.ts",
        "src/lib/client/remaining-record-recovery-schemas.ts",
      ].sort(),
    );
  },
);
await check(
  "exactly20 closed final keys, native defaults and no cross-family archive admission",
  () => {
    assert.equal(m.RR_KEYS.length, 20);
    for (const key of m.RR_KEYS) {
      const v = m.defaultRemainingRecordValue(key);
      assert.ok(Object.isFrozen(v));
      assert.deepEqual(
        m.parseRemainingRecordBackup(m.remainingRecordBackup(key, v), key),
        v,
      );
      bad(() => m.validateRemainingRecordValue(key, null));
      bad(() =>
        m.validateRemainingRecordValue(key, {
          format: "charitology-remaining-record-forms",
          version: 1,
          key,
          exportedAt: STAMP,
          forms: [],
        }),
      );
    }
    bad(() => m.defaultRemainingRecordValue("charitology.program-graph.v1"));
    bad(() =>
      m.defaultRemainingRecordValue(
        "charitology.program-workspace-v1.the-charitology-fund",
      ),
    );
  },
);
await check(
  "all7 actual research producer configs match all102 frozen semantic fields and dynamic IDs",
  () => {
    let count = 0;
    for (const [program, config] of Object.entries(research)) {
      const normalize = (f) => ({
        key: f.key,
        kind: f.type ?? "text",
        required: !!f.required,
        maxLength: f.maxLength ?? 8000,
        ...(f.options ? { options: f.options.map((o) => o.value) } : {}),
        ...(f.min !== undefined ? { min: f.min } : {}),
        ...(f.max !== undefined ? { max: f.max } : {}),
        ...(f.step === "1" ? { integer: true } : {}),
      });
      assert.deepEqual(m.RR_RESEARCH_SCHEMAS[program], {
        freeze: !!config.freeze,
        fields: config.fields.map(normalize),
      });
      count += config.fields.length;
      const v = researchValue(m, program);
      assert.ok(old.validateResearchState(v, config));
      assert.deepEqual(
        m.validateRemainingRecordValue(
          `charitology.research-program.${program}.v1`,
          v,
        ),
        v,
      );
    }
    assert.equal(count, 102);
    assert.deepEqual(
      m.RR_RESEARCH_SCHEMAS["history-of-charity"].fields.find(
        (f) => f.key === "first",
      ).options,
      cases.map((c) => c.id),
    );
  },
);
await check(
  "all9 actual partner producer configs match46 frozen collections and native samples/defaults",
  () => {
    let count = 0;
    const normalize = (f) => ({
      key: f.key,
      kind: f.kind ?? "text",
      optional: !!f.optional,
      maxLength: f.kind === "textarea" ? 5000 : 500,
      options: f.options ?? [],
      min: f.min ?? null,
      max: f.max ?? null,
      value: f.value ?? null,
    });
    for (const spec of m.RR_PARTNER_SCHEMAS) {
      const config = old.programWorkspaces[spec.program],
        key = `charitology.partner-workspace-v1.${spec.program}`;
      assert.deepEqual(
        spec.context.map(({ label, hint, ...f }) => f),
        config.context.map(normalize),
      );
      assert.deepEqual(
        spec.collections.map((c) => ({
          key: c.key,
          fields: c.fields.map(({ label, hint, ...f }) => f),
        })),
        config.collections.map((c) => ({
          key: c.key,
          fields: c.fields.map(normalize),
        })),
      );
      count += config.collections.length;
      assert.deepEqual(
        m.defaultRemainingRecordValue(key),
        old.emptyWorkspace(config),
      );
      const sample = old.sampleWorkspace(config);
      assert.deepEqual(m.validateRemainingRecordValue(key, sample), sample);
      assert.deepEqual(
        JSON.parse(old.partnerBackup(sample)),
        JSON.parse(m.remainingRecordBackup(key, sample)),
      );
    }
    assert.equal(count, 46);
  },
);
await check(
  "four other native producers retain shapes, fields and original identity rules",
  () => {
    assert.deepEqual(m.RR_MANUSCRIPT_FIELDS, old.manuscriptFields);
    assert.deepEqual(m.RR_MANUSCRIPT_KINDS, old.manuscriptKinds);
    assert.deepEqual(m.RR_NOMINATION_FIELDS, old.nominationFields);
    assert.deepEqual(m.RR_NOMINATION_DEPTHS, old.nominationDepths);
    const countries = JSON.parse(
      readFileSync("src/data/countries.json", "utf8"),
    );
    assert.deepEqual(
      m.RR_COUNTRY_CODES,
      countries.countries.map((c) => c.id),
    );
    for (const [key, value, validator] of [
      [
        "charitology-manuscript-v1",
        maximalManuscript(m),
        old.validateManuscript,
      ],
      [
        "charitology-nominations-v1",
        maximalNominations(m).slice(0, 1),
        old.validateNominations,
      ],
      [
        "charitology-depth-census-v1",
        maximalDepth().rows.length
          ? { currency: "USD", rows: maximalDepth().rows.slice(0, 1) }
          : null,
        old.validateDepthSample,
      ],
    ]) {
      assert.ok(validator(value));
      assert.deepEqual(m.validateRemainingRecordValue(key, value), value);
    }
  },
);
await check(
  "strict own data detaches frozen inputs and refuses getters, toJSON, exotic/sparse/symbol/cyclic data",
  () => {
    const key = "charitology-country-notes-v1",
      v = { AFG: { voices: " \r\n raw \ud800 ", institutions: "", gaps: "" } };
    const owned = m.validateRemainingRecordValue(key, v);
    v.AFG.voices = "changed";
    assert.equal(owned.AFG.voices, " \r\n raw \ud800 ");
    let called = 0;
    const getter = {};
    Object.defineProperty(getter, "AFG", {
      get() {
        called++;
        return {};
      },
      enumerable: true,
    });
    bad(() => m.validateRemainingRecordValue(key, getter));
    bad(() =>
      m.validateRemainingRecordValue(key, {
        toJSON() {
          called++;
        },
      }),
    );
    bad(() => m.validateRemainingRecordValue(key, Object.create(null)));
    const sym = {};
    sym[Symbol()] = 1;
    bad(() => m.validateRemainingRecordValue(key, sym));
    bad(() =>
      m.validateRemainingRecordValue(
        "charitology-nominations-v1",
        new Array(1),
      ),
    );
    const cycle = {};
    cycle.x = cycle;
    bad(() => m.copyRemainingRecordPlain(cycle));
    assert.equal(called, 0);
  },
);
await check(
  "research sparse invalid drafts, exact arbitrary IDs/timestamps/order survive without fill or normalization",
  () => {
    for (const program of Object.keys(research)) {
      const key = `charitology.research-program.${program}.v1`,
        v = researchValue(m, program);
      v.records[0].id = "  arbitrary 🧭 / \ud800  ";
      v.records[0].values.title = " \r\n retained title  ";
      v.draft = {
        title: "  unfinished  ",
        source: "https://",
        ...(m.RR_RESEARCH_SCHEMAS[program].fields.some(
          (f) => f.kind === "number",
        )
          ? {
              [m.RR_RESEARCH_SCHEMAS[program].fields.find(
                (f) => f.kind === "number",
              ).key]: "-e",
            }
          : {}),
      };
      v.editing = program === "replication-program" ? null : v.records[0].id;
      assert.deepEqual(
        m.parseRemainingRecordBackup(m.remainingRecordBackup(key, v), key),
        v,
      );
      const invalid = clone(v);
      invalid.draft.unknown = "";
      bad(() => m.validateRemainingRecordValue(key, invalid));
      delete invalid.draft.unknown;
      delete invalid.records[0].values.title;
      bad(() => m.validateRemainingRecordValue(key, invalid));
    }
    const freeze = researchValue(m);
    freeze.editing = freeze.records[0].id;
    bad(() =>
      m.validateRemainingRecordValue(
        "charitology.research-program.replication-program.v1",
        freeze,
      ),
    );
  },
);
await check(
  "research saved semantic constraints reject equal comparisons/reversed intervals/invalid dates/URLs",
  () => {
    const moral = researchValue(m, "moral-frameworks-program");
    moral.records[0].values.second = moral.records[0].values.first;
    bad(() =>
      m.validateRemainingRecordValue(
        "charitology.research-program.moral-frameworks-program.v1",
        moral,
      ),
    );
    const methods = researchValue(m, "methods-lab");
    methods.records[0].values.costLow = "2";
    methods.records[0].values.costHigh = "1";
    bad(() =>
      m.validateRemainingRecordValue(
        "charitology.research-program.methods-lab.v1",
        methods,
      ),
    );
    const v = researchValue(m);
    for (const [slot, val] of [
      ["due", "2026-02-29"],
      ["source", "https://example.invalid/\nfoo"],
      ["source", "https://name:pass@example.invalid"],
      ["source", "https:\\example.invalid"],
    ]) {
      const c = clone(v);
      c.records[0].values[slot] = val;
      bad(() =>
        m.validateRemainingRecordValue(
          "charitology.research-program.replication-program.v1",
          c,
        ),
      );
    }
  },
);
await check(
  "partner noncanonical free text and numeric strings retained; effective ceiling, cents/minutes/start enforced",
  () => {
    const key = "charitology.partner-workspace-v1.the-charitology-fund",
      v = clone(m.defaultRemainingRecordValue(key));
    v.context.name = "  exact context \r\n ";
    v.context.budget = "  000.10  ";
    assert.deepEqual(m.validateRemainingRecordValue(key, v), v);
    v.context.budget = "1000000001";
    bad(() => m.validateRemainingRecordValue(key, v));
    v.context.budget = "1.001";
    bad(() => m.validateRemainingRecordValue(key, v));
    v.context.budget = "";
    assert.equal(m.validateRemainingRecordValue(key, v).context.budget, "");
    v.context.budget = "0";
    assert.equal(m.validateRemainingRecordValue(key, v).context.budget, "0");
    const sk = "charitology.partner-workspace-v1.charitology-summit",
      s = old.sampleWorkspace(old.programWorkspaces["charitology-summit"]);
    s.records.sessions[0].values.minutes = "1.5";
    bad(() => m.validateRemainingRecordValue(sk, s));
    s.records.sessions[0].values.minutes = "60";
    s.records.sessions[0].values.start = "24:00";
    bad(() => m.validateRemainingRecordValue(sk, s));
  },
);
await check(
  "country subset/explicit empty/unknown and zero/unknown depth remain distinct",
  () => {
    const key = "charitology-country-notes-v1";
    assert.deepEqual(m.validateRemainingRecordValue(key, {}), {});
    const one = { XKX: { voices: "", institutions: "", gaps: "" } };
    assert.deepEqual(m.validateRemainingRecordValue(key, one), one);
    bad(() => m.validateRemainingRecordValue(key, { ZZZ: one.XKX }));
    bad(() =>
      m.validateRemainingRecordValue(key, { XKX: { ...one.XKX, extra: "" } }),
    );
    const d = {
      currency: "USD",
      rows: [
        {
          id: "  id  ",
          activity: "  activity ",
          amount: 0,
          depth: "unknown",
          source: "  rationale ",
        },
      ],
    };
    assert.deepEqual(
      m.validateRemainingRecordValue("charitology-depth-census-v1", d),
      d,
    );
    d.rows[0].amount = 0.001;
    bad(() => m.validateRemainingRecordValue("charitology-depth-census-v1", d));
  },
);
await check(
  "strict raw parser rejects decoded duplicate keys, BOM, invalid UTF8, trailing data and depth33",
  () => {
    for (const raw of [
      '{"AFG":{},"\\u0041FG":{}}',
      "\ufeff{}",
      "{}null",
      "[1,]",
      '{"x":NaN}',
      '{"x":01}',
    ])
      bad(() => m.strictRemainingRecordJson(raw, 1000));
    bad(() => m.strictRemainingRecordJson(Uint8Array.of(0xff), 1000));
    bad(() => m.strictRemainingRecordJson("\ud800", 1000));
    bad(
      () =>
        m.strictRemainingRecordJson(
          "[".repeat(34) + "0" + "]".repeat(34),
          1000,
        ),
      "input_limit",
    );
    assert.deepEqual(m.strictRemainingRecordJson('{"raw":"\\ud800"}', 1000), {
      raw: "\ud800",
    });
  },
);
await check(
  "byte transport ignores throwing named decorations without calling constructor, species, iterator or getter",
  () => {
    const bytes = new TextEncoder().encode("{}");
    let called = 0;
    for (const k of ["constructor", "toJSON", "buffer", "byteLength"])
      Object.defineProperty(bytes, k, {
        get() {
          called++;
          throw Error("must not run");
        },
        configurable: true,
      });
    Object.defineProperty(bytes, Symbol.iterator, {
      get() {
        called++;
        throw Error("must not run");
      },
    });
    assert.deepEqual(
      m.parseRemainingRecordBackup(bytes, "charitology-country-notes-v1"),
      {},
    );
    assert.equal(called, 0);
    for (const badBytes of [
      new Proxy(new Uint8Array(2), {}),
      new (class extends Uint8Array {})(2),
      new Uint8Array(new SharedArrayBuffer(2)),
      new Uint8Array(new (class extends ArrayBuffer {})(2)),
      new Uint8Array(new ArrayBuffer(2, { maxByteLength: 4 })),
    ])
      bad(() => m.strictRemainingRecordJson(badBytes, 100));
    const detached = new Uint8Array([123, 125]);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    bad(() => m.strictRemainingRecordJson(detached, 100));
  },
);
await check(
  "native and raw-form hydration are separate exact-string operations",
  () => {
    assert.equal(
      m.remainingRecordHydratedString("", {
        original: "2026-02-30",
        display: "",
      }),
      "2026-02-30",
    );
    assert.equal(m.remainingRecordHydratedString("", null), "");
    assert.equal(m.remainingRecordHydratedString("abc", null), "abc");
    const key = "charitology.research-program.replication-program.v1",
      fields = m.remainingRecordFormFields(key, "draft"),
      forms = [
        {
          form: "draft",
          editingId: null,
          values: Object.fromEntries(
            Object.keys(fields).map((k) => [k, k === "due" ? "" : ""]),
          ),
        },
      ];
    assert.equal(
      m.parseRemainingRecordFormArchive(
        m.remainingRecordFormArchive({
          format: "charitology-remaining-record-forms",
          version: 1,
          key,
          exportedAt: STAMP,
          forms,
        }),
      ).forms[0].values.due,
      "",
    );
    bad(() => m.remainingRecordFormFields(key, "context"));
    bad(() =>
      m.remainingRecordFormFields(
        "charitology.partner-workspace-v1.the-charitology-fund",
        "collection:sessions",
      ),
    );
  },
);
await check(
  "all20 raw form field sets and family editing identities are bounded without native normalization",
  () => {
    for (const key of m.RR_KEYS) {
      const research = m.researchForRemainingKey(key),
        partner = m.partnerForRemainingKey(key),
        forms = research
          ? ["draft"]
          : partner
            ? [
                "context",
                ...m
                  .remainingRecordPartnerSchema(key)
                  .collections.map((c) => "collection:" + c.key),
              ]
            : key === "charitology-manuscript-v1"
              ? ["manuscript"]
              : key === "charitology-nominations-v1"
                ? ["nomination"]
                : key === "charitology-depth-census-v1"
                  ? ["activity", "currency"]
                  : ["country:AFG"];
      const archive = {
        format: "charitology-remaining-record-forms",
        version: 1,
        key,
        exportedAt: STAMP,
        forms: forms.map((form) => ({
          form,
          editingId: null,
          values: Object.fromEntries(
            Object.keys(m.remainingRecordFormFields(key, form)).map((f) => [
              f,
              "",
            ]),
          ),
        })),
      };
      assert.deepEqual(
        m.parseRemainingRecordFormArchive(
          m.remainingRecordFormArchive(archive),
        ),
        archive,
      );
      archive.forms[0].values.extra = "";
      bad(() => m.remainingRecordFormArchive(archive));
    }
  },
);
await check(
  "whole1MB raw-form boundary exact/+1 and lossless raw-copy surrogate/empty are distinct formats",
  () => {
    const key = "charitology-depth-census-v1",
      v = {
        format: "charitology-remaining-record-forms",
        version: 1,
        key,
        exportedAt: STAMP,
        forms: [
          {
            form: "activity",
            editingId: "raw id",
            values: { activity: "", amount: "", depth: "", source: "" },
          },
        ],
      },
      overhead = bytes(JSON.stringify(v, null, 2));
    v.forms[0].values.amount = "x".repeat(1000000 - overhead);
    assert.equal(bytes(m.remainingRecordFormArchive(v)), 1000000);
    v.forms[0].values.amount += "x";
    bad(() => m.remainingRecordFormArchive(v), "input_limit");
    for (const raw of ["", "\ud800\udfff\ud800\r\n"]) {
      const a = {
        format: "charitology-remaining-record-raw-copy",
        version: 1,
        key,
        copy: "protected",
        raw,
      };
      assert.deepEqual(
        m.parseRemainingRecordRawArchive(m.remainingRecordRawArchive(a)),
        a,
      );
      bad(() =>
        m.parseRemainingRecordBackup(m.remainingRecordRawArchive(a), key),
      );
    }
  },
);
await check(
  "all200 complete ordinary research records and exact32MB/+1 meaningful native boundary",
  () => {
    const key = "charitology.research-program.replication-program.v1",
      ordinary = researchValue(m, "replication-program", 200, true);
    assert.ok(bytes(m.remainingRecordBackup(key, ordinary)) > 24000000);
    const v = exactResearch(m);
    assert.equal(bytes(m.remainingRecordBackup(key, v)), 32000000);
    const raw = JSON.stringify(v, null, 2);
    assert.deepEqual(
      m.parseRemainingRecordBackup(new TextEncoder().encode(raw), key),
      v,
    );
    bad(
      () => m.remainingRecordBackup(key, exactResearch(m, 32000001)),
      "input_limit",
    );
    const over = researchValue(m, "replication-program", 200, true);
    for (const r of over.records) r.values.claim = "\u0001".repeat(8000);
    assert.ok(bytes(JSON.stringify(over, null, 2)) > 32000000);
    bad(() => m.validateRemainingRecordValue(key, over), "input_limit");
  },
);
await check(
  "full217country39.1MB native transport/roundtrip and maximal manuscript/nominations/Depth",
  () => {
    const v = maximalCountry(m),
      key = "charitology-country-notes-v1",
      raw = m.remainingRecordBackup(key, v);
    assert.equal(bytes(raw), 39075843);
    assert.deepEqual(
      m.parseRemainingRecordBackup(new TextEncoder().encode(raw), key),
      v,
    );
    assert.equal(Object.keys(v).length, 217);
    for (const [k, value, validate] of [
      [
        "charitology-manuscript-v1",
        maximalManuscript(m),
        old.validateManuscript,
      ],
      [
        "charitology-nominations-v1",
        maximalNominations(m),
        old.validateNominations,
      ],
      ["charitology-depth-census-v1", maximalDepth(), old.validateDepthSample],
    ]) {
      assert.ok(validate(value));
      const text = m.remainingRecordBackup(k, value);
      assert.ok(bytes(text) <= m.remainingRecordCapacity(k).nativeBytes);
      assert.deepEqual(m.parseRemainingRecordBackup(text, k), value);
    }
  },
);
await check(
  "partner8MB exact boundary and24character later timestamp reservation match actual serializer",
  () => {
    const key = "charitology.partner-workspace-v1.the-charitology-fund",
      v = exactPartner(m);
    assert.equal(bytes(m.remainingRecordBackup(key, v)), 8000000);
    assert.equal(old.partnerBackup(v), m.remainingRecordBackup(key, v));
    const blank = exactPartner(m, 7999976, "");
    assert.equal(bytes(m.remainingRecordBackup(key, blank)), 7999976);
    const too = exactPartner(m, 7999977, "");
    bad(() => m.remainingRecordBackup(key, too), "input_limit");
    assert.throws(() => old.partnerBackup(too));
  },
);
console.log(`Remaining-record schemas/formats: ${groups} groups passed.`);
