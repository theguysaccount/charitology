import assert from "node:assert/strict";
import { build } from "esbuild";
import ts from "typescript";
import {
  osFixture,
  osEnvelope,
  STAMP,
  exactGeneralBoundary,
  exactOsCompact,
} from "../test-fixtures/program-record-recovery/factory.mjs";
async function bundle(contents) {
  const r = await build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    metafile: true,
  });
  return {
    m: await import(
      "data:text/javascript;base64," +
        Buffer.from(r.outputFiles[0].text).toString("base64")
    ),
    inputs: Object.keys(r.metafile.inputs),
  };
}
const { m, inputs } = await bundle(
  'export * from "./src/lib/client/program-record-recovery-schemas.ts";export * from "./src/lib/client/program-record-recovery-formats.ts";',
);
const { m: old } = await bundle(
  'export * from "./src/lib/client/program-workspaces.ts";export {programWorkspaces} from "./src/data/program-workspaces.ts";export {blankWorkspace,validateWorkspace as validateOs,workspaceJson,parseWorkspace as parseOs} from "./src/lib/client/charity-os.ts";',
);
const OS = "charitology.charity-os",
  KEY = "charitology.program-workspace-v1.university-chapters";
const clone = (v) => JSON.parse(JSON.stringify(v)),
  bytes = (s) => Buffer.byteLength(s),
  bad = (fn) => assert.throws(fn, (e) => e instanceof m.PRDataError);
let groups = 0;
function check(name, fn) {
  try {
    fn();
    console.log("✓ " + name);
    groups++;
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
check(
  "pure production bundle has only new schema/format inputs, no storage, DOM or runtime producer import",
  () => {
    assert.equal(inputs.filter((p) => p !== "<stdin>").length, 2);
    assert.ok(
      inputs
        .filter((p) => p !== "<stdin>")
        .every((p) =>
          /program-record-recovery-(?:schemas|formats)\.ts$/.test(p),
        ),
    );
  },
);
check(
  "fixed exactly six final keys; null, wrong key and wrong version cannot become defaults",
  () => {
    assert.equal(m.PR_KEYS.length, 6);
    for (const key of m.PR_KEYS) {
      bad(() => m.validateProgramRecordValue(key, null));
      assert.ok(Object.isFrozen(m.defaultProgramRecordValue(key)));
      assert.notEqual(
        m.defaultProgramRecordValue(key),
        m.defaultProgramRecordValue(key),
      );
    }
    bad(() => m.defaultProgramRecordValue("charitology.gifts"));
    bad(() =>
      m.validateProgramRecordValue(KEY, {
        ...m.defaultProgramRecordValue(KEY),
        version: 2,
      }),
    );
  },
);
check(
  "frozen five v1 field/collection/choice/default/bounds definitions match actual current producer configs",
  () => {
    const pick = (f) =>
      Object.fromEntries(
        ["key", "kind", "optional", "min", "max", "value", "options"]
          .filter((k) => f[k] !== undefined)
          .map((k) => [k, f[k]]),
      );
    for (const c of Object.values(old.programWorkspaces))
      assert.deepEqual(m.PR_PROGRAM_SCHEMAS[c.id], {
        context: c.context.map(pick),
        collections: c.collections.map((x) => ({
          key: x.key,
          fields: x.fields.map(pick),
        })),
      });
  },
);
check(
  "all five actual empty and fictional sample native exports roundtrip with legacy shape and no terminal newline",
  () => {
    for (const c of Object.values(old.programWorkspaces)) {
      const key = "charitology.program-workspace-v1." + c.id;
      for (const value of [old.emptyWorkspace(c), old.sampleWorkspace(c)]) {
        const admitted = m.validateProgramRecordValue(key, value);
        assert.deepEqual(admitted, value);
        assert.notEqual(admitted, value);
        const raw = JSON.stringify(value, null, 2);
        assert.equal(m.programRecordBackup(key, value), raw);
        assert.equal(raw.endsWith("\n"), false);
        assert.deepEqual(m.parseProgramRecordBackup(raw, key), value);
        assert.deepEqual(
          m.parseProgramRecordBackup(new TextEncoder().encode(raw), key),
          value,
        );
      }
    }
  },
);
check(
  "program free text, numeric strings and present whitespace stay exact, not trimmed into a different saved value",
  () => {
    const value = old.sampleWorkspace(old.programWorkspaces["policy-program"]);
    value.context.name = "  Fictional retained  ";
    value.context.years = " 10 ";
    value.records.options[0].values.uncertainty = "\n  uncertain  \n";
    const v = m.validateProgramRecordValue(
      "charitology.program-workspace-v1.policy-program",
      value,
    );
    assert.deepEqual(v, value);
  },
);
check(
  "program requiredness, real dates, exact enums, numeric bounds, integer controls and high-low relation remain enforced",
  () => {
    for (const c of Object.values(old.programWorkspaces)) {
      const base = old.sampleWorkspace(c),
        key = "charitology.program-workspace-v1." + c.id;
      for (const f of c.context) {
        const v = clone(base);
        if (f.kind === "number") {
          v.context[f.key] = "";
          bad(() => m.validateProgramRecordValue(key, v));
          v.context[f.key] = "Infinity";
          bad(() => m.validateProgramRecordValue(key, v));
          v.context[f.key] = String((f.max ?? 1e12) + 1);
          bad(() => m.validateProgramRecordValue(key, v));
        }
      }
      for (const col of c.collections) {
        if (!base.records[col.key].length)
          base.records[col.key].push({
            id: "synthetic-" + col.key,
            values: Object.fromEntries(
              col.fields.map((f) => [
                f.key,
                f.kind === "number"
                  ? (f.value ?? "0")
                  : f.kind === "select"
                    ? f.options[0]
                    : f.kind === "date"
                      ? "2026-10-27"
                      : f.kind === "url"
                        ? "https://example.invalid/source"
                        : f.optional
                          ? ""
                          : "Fictional",
              ]),
            ),
          });
        for (const f of col.fields) {
          const v = clone(base);
          if (f.kind === "date")
            v.records[col.key][0].values[f.key] = "2026-02-30";
          else if (f.kind === "select")
            v.records[col.key][0].values[f.key] = "invented";
          else if (f.kind === "number")
            v.records[col.key][0].values[f.key] = "-1";
          else if (!f.optional) v.records[col.key][0].values[f.key] = "";
          else continue;
          bad(() => m.validateProgramRecordValue(key, v));
        }
      }
    }
    const p = old.sampleWorkspace(old.programWorkspaces["policy-program"]);
    p.context.years = "1.5";
    bad(() =>
      m.validateProgramRecordValue(
        "charitology.program-workspace-v1.policy-program",
        p,
      ),
    );
    p.context.years = "10";
    p.records.options[0].values.annualHigh = "0";
    p.records.options[0].values.annualLow = "1";
    bad(() =>
      m.validateProgramRecordValue(
        "charitology.program-workspace-v1.policy-program",
        p,
      ),
    );
  },
);
check(
  "unknown future fields at each level protect the complete source; no field or collection is silently discarded",
  () => {
    const a = old.sampleWorkspace(old.programWorkspaces["university-chapters"]);
    for (const edit of [
      (v) => (v.future = true),
      (v) => (v.context.future = "kept"),
      (v) => (v.records.future = []),
      (v) => (v.records.sessions[0].future = "kept"),
      (v) => (v.records.sessions[0].values.future = "kept"),
    ]) {
      const v = clone(a);
      edit(v);
      bad(() => m.validateProgramRecordValue(KEY, v));
      assert.ok(JSON.stringify(v).includes("future"));
    }
  },
);
check(
  "general duplicate IDs are global while OS duplicate IDs are scoped per collection",
  () => {
    const v = old.sampleWorkspace(old.programWorkspaces["university-chapters"]);
    v.records.roles[0].id = v.records.sessions[0].id;
    bad(() => m.validateProgramRecordValue(KEY, v));
    const os = osFixture();
    assert.deepEqual(m.validateProgramRecordValue(OS, os), os);
    os.tasks.push(clone(os.tasks[0]));
    bad(() => m.validateProgramRecordValue(OS, os));
  },
);
check(
  "exact per-collection and total count ceilings refuse extra records without truncation or ID repair",
  () => {
    const v = old.sampleWorkspace(old.programWorkspaces["university-chapters"]);
    const row = v.records.sessions[0];
    v.records.sessions = Array.from({ length: 251 }, (_, i) => ({
      id: "s" + i,
      values: clone(row.values),
    }));
    bad(() => m.validateProgramRecordValue(KEY, v));
    v.records.sessions.pop();
    const role = v.records.roles[0];
    v.records.roles = Array.from({ length: 250 }, (_, i) => ({
      id: "r" + i,
      values: clone(role.values),
    }));
    v.records.tasks = [];
    assert.equal(
      Object.values(m.validateProgramRecordValue(KEY, v).records).flat().length,
      500,
    );
    v.records.tasks = [
      {
        id: "extra",
        values: {
          title: "Fictional",
          owner: "",
          date: "",
          status: "To do",
          notes: "",
        },
      },
    ];
    bad(() => m.validateProgramRecordValue(KEY, v));
    const os = osFixture();
    os.projects = [];
    os.grants = [];
    os.outcomes = [];
    const task = { ...os.tasks[0], projectId: "" };
    os.tasks = Array.from({ length: 2000 }, (_, i) => ({
      ...task,
      id: "t" + i,
    }));
    assert.equal(m.validateProgramRecordValue(OS, os).tasks.length, 2000);
    os.tasks.push({ ...task, id: "extra" });
    bad(() => m.validateProgramRecordValue(OS, os));
  },
);
check(
  "general historical updated text accepted by the old parser remains byte-exact metadata",
  () => {
    const v = old.emptyWorkspace(old.programWorkspaces["university-chapters"]);
    v.updated = "January 1, 2020";
    assert.deepEqual(
      old.parseWorkspace(v, old.programWorkspaces["university-chapters"]),
      v,
    );
    assert.equal(m.validateProgramRecordValue(KEY, v).updated, v.updated);
    assert.equal(
      m.parseProgramRecordBackup(m.programRecordBackup(KEY, v), KEY).updated,
      v.updated,
    );
  },
);

check(
  "OS full native envelope and unknown-zero-negative semantics survive without new ID/date/source assertions",
  () => {
    const v = osFixture(),
      n = osEnvelope(v),
      raw = JSON.stringify(n, null, 2),
      owned = m.parseProgramRecordBackup(raw, OS);
    assert.deepEqual(owned, n);
    assert.equal(owned.workspace.projects[0].depth, null);
    assert.deepEqual(
      owned.workspace.outcomes.map((o) => o.value),
      [null, 0, -1.25],
    );
    assert.equal(owned.workspace.projects[0].notes, "  retained text  ");
    assert.equal(m.programRecordBackup(OS, owned), raw);
    assert.ok(Object.isFrozen(owned.workspace.outcomes));
  },
);
check(
  "OS missing project references, unknown fields, noncanonical identity/currency and impossible dates are refused without repair",
  () => {
    const base = osFixture();
    for (const edit of [
      (v) => (v.tasks[0].projectId = "missing"),
      (v) => (v.tasks[0].id = " shared "),
      (v) => (v.currency = "usd"),
      (v) => (v.projects[0].due = "2026-02-30"),
      (v) => (v.projects[0].depth = 5),
      (v) => (v.projects[0].budget = -1),
      (v) => (v.outcomes[0].value = "0"),
      (v) => (v.tasks[0].future = true),
    ]) {
      const v = clone(base);
      edit(v);
      bad(() => m.validateProgramRecordValue(OS, v));
    }
    for (const edit of [
      (v) => delete v.exportedAt,
      (v) => (v.exportedAt = "2026-02-30T00:00:00.000Z"),
      (v) => (v.future = true),
    ]) {
      const v = osEnvelope();
      edit(v);
      bad(() => m.parseProgramRecordBackup(JSON.stringify(v), OS));
    }
  },
);
check(
  "public HTTP general sources stay readable; credentials, controls, backslashes and non-HTTPS OS sources are refused",
  () => {
    const c = old.programWorkspaces["local-charitology"],
      v = old.sampleWorkspace(c),
      key = "charitology.program-workspace-v1.local-charitology";
    v.records.needs[0].values.source = "http://example.invalid/public";
    assert.equal(
      m.validateProgramRecordValue(key, v).records.needs[0].values.source,
      "http://example.invalid/public",
    );
    for (const url of [
      "https://user:secret@example.invalid/",
      "https://example.invalid\\@other.invalid/x",
      "https://example.invalid/\nprivate",
      "javascript:alert(1)",
    ]) {
      v.records.needs[0].values.source = url;
      bad(() => m.validateProgramRecordValue(key, v));
    }
    const o = osFixture();
    o.outcomes[0].source = "http://example.invalid/";
    bad(() => m.validateProgramRecordValue(OS, o));
  },
);
check(
  "raw input JSON duplicates/decoded aliases/prototype names, depth32, malformed UTF8 and BOM are admitted or refused explicitly",
  () => {
    for (const raw of [
      '{"version":1,"version":1}',
      '{"x":1,"\\u0078":2}',
      "[1,]",
      "1e999",
      "{} trailing",
      "\ufeff{}",
    ])
      bad(() => m.strictProgramRecordJson(raw, 8_000_000));
    bad(() => m.strictProgramRecordJson(Uint8Array.from([0xff]), 8_000_000));
    assert.equal(
      Object.getPrototypeOf(
        m.strictProgramRecordJson('{"__proto__":{"x":1}}', 8_000_000),
      ),
      Object.prototype,
    );
    assert.equal({}.x, undefined);
    let v = "0";
    for (let i = 0; i < 32; i++) v = "[" + v + "]";
    assert.ok(m.strictProgramRecordJson(v, 8_000_000));
    bad(() => m.strictProgramRecordJson("[" + v + "]", 8_000_000));
  },
);
check(
  "literal unpaired UTF16 is not silently replaced; escaped JSON surrogate roundtrips and raw-copy archive preserves original code units",
  () => {
    bad(() => m.strictProgramRecordJson('"\ud800"', 8_000_000));
    assert.equal(m.strictProgramRecordJson('"\\ud800"', 8_000_000), "\ud800");
    const a = {
      format: "charitology-program-record-raw-copy",
      version: 1,
      key: OS,
      copy: "protected",
      raw: "\ud800\u0000\r\n { broken",
    };
    assert.deepEqual(
      m.parseProgramRecordRawArchive(m.programRecordRawArchive(a)),
      a,
    );
    bad(() => m.parseProgramRecordBackup(m.programRecordRawArchive(a), OS));
  },
);
check(
  "direct descriptor/accessor checks refuse callback-shaped inputs; no trap-free transparent Proxy claim",
  () => {
    let calls = 0;
    const v = clone(m.defaultProgramRecordValue(KEY));
    Object.defineProperty(v, "context", {
      get() {
        calls++;
        return {};
      },
      enumerable: true,
    });
    bad(() => m.validateProgramRecordValue(KEY, v));
    assert.equal(calls, 0);
    const a = [];
    a.map = () => {
      calls++;
      return [];
    };
    bad(() => m.copyProgramRecordPlain(a));
    const b = new (class extends Array {})();
    bad(() => m.copyProgramRecordPlain(b));
    bad(() => m.copyProgramRecordPlain(new Array(2)));
    const hidden = {};
    Object.defineProperty(hidden, "x", { value: 1 });
    bad(() => m.copyProgramRecordPlain(hidden));
    const cyc = {};
    cyc.self = cyc;
    bad(() => m.copyProgramRecordPlain(cyc));
    bad(() => m.copyProgramRecordPlain({ x: undefined }));
    assert.equal(calls, 0);
  },
);
check(
  "byte input uses native owned bytes, not shadowed byteLength, iterator, slice or toJSON",
  () => {
    const raw = new TextEncoder().encode(JSON.stringify(osEnvelope()));
    let calls = 0;
    Object.defineProperty(raw, "byteLength", {
      get() {
        calls++;
        return 0;
      },
    });
    raw[Symbol.iterator] = () => {
      calls++;
      throw Error();
    };
    raw.slice = () => {
      calls++;
      throw Error();
    };
    assert.deepEqual(m.parseProgramRecordBackup(raw, OS), osEnvelope());
    assert.equal(calls, 0);
  },
);
check(
  "whole 8,000,000-byte valid native fixture roundtrips actual old producer semantics; one additional valid character is refused",
  () => {
    const value = exactGeneralBoundary(old),
      raw = JSON.stringify(value, null, 2);
    assert.equal(bytes(raw), 8_000_000);
    assert.deepEqual(
      old.parseWorkspace(value, old.programWorkspaces["university-chapters"]),
      value,
    );
    assert.equal(m.programRecordBackup(KEY, value), raw);
    assert.deepEqual(m.parseProgramRecordBackup(raw, KEY), value);
    const plus = clone(value);
    plus.context.name += "x";
    assert.equal(bytes(JSON.stringify(plus, null, 2)), 8_000_001);
    bad(() => m.validateProgramRecordValue(KEY, plus));
    bad(() => m.parseProgramRecordBackup(raw + " ", KEY));
  },
);
check(
  "OS 4,500,000-byte compact limit remains additional to native whole limit and fits complete pretty export",
  () => {
    const value = exactOsCompact(old);
    assert.equal(bytes(JSON.stringify(value)), 4_500_000);
    assert.deepEqual(m.validateProgramRecordValue(OS, value), value);
    const raw = m.programRecordBackup(OS, osEnvelope(value));
    assert.ok(bytes(raw) < 8_000_000);
    assert.deepEqual(m.parseProgramRecordBackup(raw, OS).workspace, value);
    value.tasks[0].notes += "x";
    bad(() => m.validateProgramRecordValue(OS, value));
  },
);
check(
  "exact 64,000,000-byte whole raw archive and one extra code unit use the raw cap rather than native cap",
  () => {
    const a = {
      format: "charitology-program-record-raw-copy",
      version: 1,
      key: OS,
      copy: "observed",
      raw: "",
    };
    const base = bytes(m.programRecordRawArchive(a));
    a.raw = "x".repeat(64_000_000 - base);
    const text = m.programRecordRawArchive(a);
    assert.equal(bytes(text), 64_000_000);
    assert.equal(m.parseProgramRecordRawArchive(text).raw.length, a.raw.length);
    a.raw += "x";
    bad(() => m.programRecordRawArchive(a));
  },
);
check(
  "all five maximal escaped unfinished control sets fit the complete form archive and retain invalid numeric/date strings",
  () => {
    for (const c of Object.values(old.programWorkspaces)) {
      const key = "charitology.program-workspace-v1." + c.id,
        forms = [
          "context",
          ...c.collections.map((x) => "collection:" + x.key),
        ].map((form) => ({
          form,
          editingId: null,
          values: Object.fromEntries(
            Object.entries(m.programRecordFormFields(key, form)).map(
              ([k, n]) => [k, "\u0000".repeat(n)],
            ),
          ),
        }));
      const archive = {
        format: "charitology-program-record-forms",
        version: 1,
        key,
        exportedAt: STAMP,
        forms,
      };
      const text = m.programRecordFormArchive(archive);
      assert.ok(bytes(text) < 524288);
      assert.deepEqual(m.parseProgramRecordFormArchive(text), archive);
      const padded = text + " ".repeat(524288 - bytes(text));
      assert.equal(bytes(padded), 524288);
      assert.deepEqual(m.parseProgramRecordFormArchive(padded), archive);
      bad(() => m.parseProgramRecordFormArchive(padded + " "));
    }
  },
);
check(
  "raw form ownership/field names/editing IDs differ from native records; OS has only one editor and no body coerces invalid values",
  () => {
    const values = Object.fromEntries(
      Object.keys(m.programRecordFormFields(OS, "editor:outcomes")).map((k) => [
        k,
        "",
      ]),
    );
    values.value = "not-a-number";
    values.date = "2026-99-99";
    const a = {
      format: "charitology-program-record-forms",
      version: 1,
      key: OS,
      exportedAt: STAMP,
      forms: [{ form: "editor:outcomes", editingId: "shared", values }],
    };
    assert.deepEqual(
      m.parseProgramRecordFormArchive(m.programRecordFormArchive(a)),
      a,
    );
    bad(() => m.parseProgramRecordBackup(m.programRecordFormArchive(a), OS));
    for (const edit of [
      (x) => x.forms.push(clone(x.forms[0])),
      (x) => (x.forms[0].form = "collection:sessions"),
      (x) => (x.forms[0].values.future = "private"),
      (x) => (x.forms[0].editingId = "bad id"),
    ]) {
      const v = clone(a);
      edit(v);
      bad(() => m.programRecordFormArchive(v));
    }
  },
);
check(
  "OS controls without maxlength preserve long invalid raw text up to exact whole524288 archive, not an invented field cap",
  () => {
    const values = Object.fromEntries(
      Object.keys(m.programRecordFormFields(OS, "editor:outcomes")).map((k) => [
        k,
        "",
      ]),
    );
    const archive = {
      format: "charitology-program-record-forms",
      version: 1,
      key: OS,
      exportedAt: STAMP,
      forms: [{ form: "editor:outcomes", editingId: null, values }],
    };
    values.value = "9".repeat(
      524288 - bytes(m.programRecordFormArchive(archive)),
    );
    const text = m.programRecordFormArchive(archive);
    assert.equal(bytes(text), 524288);
    assert.deepEqual(m.parseProgramRecordFormArchive(text), archive);
    values.value += "9";
    bad(() => m.programRecordFormArchive(archive));
  },
);

check(
  "canonical text is stable, detached and cannot be poisoned through original or returned nested objects",
  () => {
    const value = osFixture(),
      before = m.canonicalProgramRecordJson(value),
      frozen = m.validateProgramRecordValue(OS, value);
    value.projects[0].notes = "changed";
    assert.notEqual(m.canonicalProgramRecordJson(value), before);
    assert.equal(frozen.projects[0].notes, "  retained text  ");
    assert.throws(() => (frozen.projects[0].notes = "poison"), TypeError);
    assert.equal(m.canonicalProgramRecordJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  },
);
check(
  "actual schema/format TypeScript compiles strict with real producer types and no declaration shims",
  () => {
    const p = ts.createProgram(
      [
        "src/lib/client/program-record-recovery-schemas.ts",
        "src/lib/client/program-record-recovery-formats.ts",
      ],
      {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      },
    );
    assert.deepEqual(
      ts
        .getPreEmitDiagnostics(p)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
      [],
    );
  },
);
console.log(groups + " program-record schema/format groups passed.");
