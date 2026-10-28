// Repeats the 85 private native-admission observations against the actual unchanged modules in CI.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
test("85 actual native UTF16/export/parser/hash compatibility cases remain unchanged", async (t) => {
  const repo = fileURLToPath(new URL("../../../", import.meta.url)),
    built = await build({
      stdin: {
        contents: `export * as toc from './src/lib/client/theory-of-change.ts';export * as d1s from './src/lib/client/donor-recovery-schemas.ts';export * as d1f from './src/lib/client/donor-recovery-formats.ts';export * as rrs from './src/lib/client/remaining-record-recovery-schemas.ts';export * as rrf from './src/lib/client/remaining-record-recovery-formats.ts';export * as partner from './src/lib/client/partner-programs.ts';export * as compose from './src/lib/client/program-graph-import.ts';export * as graph from './src/lib/client/program-graph-model.ts';`,
        resolveDir: repo,
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      logLevel: "silent",
    });
  const m = await import(
      "data:text/javascript;base64," +
        Buffer.from(built.outputFiles[0].text).toString("base64")
    ),
    enc = new TextEncoder(),
    at = "2026-10-27T12:00:00.000Z",
    sha = (b) => createHash("sha256").update(b).digest("hex"),
    rawJSON = (json, s) => json.replaceAll(JSON.stringify(s).slice(1, -1), s);
  let cases = 0;
  const check = async (name, fn, accept = true) => {
    cases++;
    await t.test(name, () => {
      if (accept) fn();
      else assert.throws(fn);
    });
  };
  for (const [label, s] of [
    ["high", "\ud800"],
    ["low", "\udc00"],
    ["replacement", "\ufffd"],
    ["pair", "\ud800\udc00"],
    ["NUL", "\0"],
  ]) {
    const d = m.toc.emptyDraft(new Date(at));
    Object.assign(d, {
      id: "native-toc",
      name: s,
      problem: s,
      source: s,
      reviewDate: "2026-02-30",
      indicators: [{ what: s, how: s, when: s, baseline: "0", target: s }],
    });
    const exported = m.toc.toJson(d, new Date(at)),
      whole = { v: 1, current: d.id, drafts: [d] };
    await check(
      label +
        ": actual ToC export/cleaning import escaped transport (compatibility only)",
      () => {
        const p = m.toc.parseImport(
          new TextDecoder().decode(enc.encode(exported)),
        );
        assert.equal(p.name, s);
        assert.equal(p.indicators[0].target, s);
        assert.equal(p.indicators[0].baseline, "0");
        assert.equal(p.reviewDate, "2026-02-30");
      },
    );
    await check(
      label + ": actual ToC literal JS JSON transport",
      () => assert.equal(m.toc.parseImport(rawJSON(exported, s)).name, s),
      label !== "NUL",
    );
    await check(label + ": actual strict D1 impact object", () =>
      assert.equal(
        m.d1s.validateD1Value("impact-drafts", whole).drafts[0].name,
        s,
      ),
    );
    const backup = m.d1f.d1IndividualBackup("impact-drafts", whole, at);
    for (const [transport, raw] of [
      ["escaped string", backup],
      ["escaped UTF8", enc.encode(backup)],
      ["literal JS string", rawJSON(backup, s)],
    ])
      await check(
        label + ": D1 " + transport,
        () =>
          assert.equal(
            m.d1f.parseD1IndividualBackup(raw, "impact-drafts").drafts[0].name,
            s,
          ),
        !(label === "NUL" && transport === "literal JS string"),
      );
    const key = "charitology.partner-workspace-v1.nonprofit-advisory",
      config = m.partner.programWorkspaces["nonprofit-advisory"],
      state = m.partner.emptyWorkspace(config);
    state.context.name = s;
    state.context.baseline = "0";
    const c = config.collections.find((c) => c.key === "learning"),
      values = Object.fromEntries(
        c.fields.map((f) => [
          f.key,
          f.kind === "date"
            ? ""
            : f.kind === "select"
              ? (f.value ?? f.options[0])
              : s,
        ]),
      );
    state.records.learning = [{ id: "learning-native", values }];
    await check(
      label + ": original partner repair parser compatibility",
      () => {
        const p = m.partner.parseWorkspace(state, config);
        assert.equal(p.context.name, s);
        assert.equal(p.records.learning[0].values.result, s);
      },
    );
    await check(label + ": actual strict RR native object", () =>
      assert.equal(
        m.rrs.validateRemainingRecordValue(key, state).context.name,
        s,
      ),
    );
    const native = m.partner.partnerBackup(state);
    assert.equal(native, m.rrf.remainingRecordBackup(key, state));
    for (const [transport, raw] of [
      ["escaped string", native],
      ["escaped UTF8", enc.encode(native)],
      ["literal JS string", rawJSON(native, s)],
    ])
      await check(
        label + ": RR " + transport,
        () =>
          assert.equal(
            m.rrf.parseRemainingRecordBackup(raw, key).context.name,
            s,
          ),
        !(
          transport === "literal JS string" &&
          ["high", "low", "NUL"].includes(label)
        ),
      );
    await check(label + ": actual composed whole source", () => {
      const p = m.compose.readProgramGraphSource(
        enc.encode(native),
        "nonprofit-advisory",
      ).source;
      assert.equal(p.context.name, s);
      assert.equal(p.records.learning[0].values.result, s);
      assert.deepEqual(Object.keys(p.records), [
        "diagnostics",
        "evidence",
        "actions",
        "learning",
        "readiness",
      ]);
    });
    await check(
      label + ": composed literal JS JSON transport",
      () =>
        assert.equal(
          m.compose.strictProgramGraphJson(rawJSON(native, s), 8000000).context
            .name,
          s,
        ),
      label !== "NUL",
    );
    await check(
      label +
        ": all three exact canonical codecs distinguish UTF16 before hashing",
      () => {
        const a = m.d1s.canonicalD1Json({ s }),
          b = m.rrs.canonicalRemainingRecordJson({ s }),
          c = m.graph.canonicalProgramGraphJson({ s });
        assert.equal(a, b);
        assert.equal(a, c);
        assert.equal(JSON.parse(a).s, s);
        if (["high", "low", "replacement"].includes(label)) {
          assert.equal(
            sha(enc.encode(s)),
            "83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097",
          );
          assert.notEqual(sha(enc.encode(a)), sha(enc.encode(s)));
        }
      },
    );
  }
  for (const [label, s] of [
    ["high", "\ud800"],
    ["low", "\udc00"],
    ["NUL", "\0"],
  ]) {
    const d = m.toc.emptyDraft(new Date(at));
    d.id = s;
    d.name = "safe";
    await check(label + ": native ToC identity remains literal", () =>
      assert.equal(
        m.d1s.validateD1Value("impact-drafts", {
          v: 1,
          current: s,
          drafts: [d],
        }).drafts[0].id,
        s,
      ),
    );
    const config = m.partner.programWorkspaces["nonprofit-advisory"],
      state = m.partner.emptyWorkspace(config);
    state.context.name = "safe";
    for (const k of ["learning", "diagnostics"]) {
      const c = config.collections.find((c) => c.key === k),
        values = Object.fromEntries(
          c.fields.map((f) => [
            f.key,
            f.kind === "date"
              ? ""
              : f.kind === "select"
                ? (f.value ?? f.options[0])
                : k === "learning"
                  ? "safe"
                  : s,
          ]),
        );
      state.records[k] = [
        {
          id: k === "learning" ? "selected-learning" : "unselected-diagnostic",
          values,
        },
      ];
    }
    const bytes = enc.encode(m.partner.partnerBackup(state));
    await check(
      label + ": actual RR unselected diagnostic preservation",
      () => {
        const p = m.rrf.parseRemainingRecordBackup(
          bytes,
          "charitology.partner-workspace-v1.nonprofit-advisory",
        );
        assert.equal(p.records.diagnostics[0].values.title, s);
        assert.equal(p.records.learning[0].values.title, "safe");
      },
    );
    await check(
      label + ": actual composed unselected diagnostic preservation",
      () => {
        const p = m.compose.readProgramGraphSource(
          bytes,
          "nonprofit-advisory",
        ).source;
        assert.equal(p.records.diagnostics[0].values.title, s);
        assert.equal(p.records.learning[0].values.title, "safe");
      },
    );
  }
  for (const [label, raw] of [
    ["high", Uint8Array.from([0x22, 0xed, 0xa0, 0x80, 0x22])],
    ["low", Uint8Array.from([0x22, 0xed, 0xb0, 0x80, 0x22])],
  ])
    for (const [name, fn] of [
      ["D1", m.d1f.strictD1Json],
      ["RR", m.rrf.strictRemainingRecordJson],
      ["composed", m.compose.strictProgramGraphJson],
    ])
      await check(
        label + ": " + name + " refuses encoded surrogate bytes",
        () => fn(raw, 100),
        false,
      );
  assert.equal(cases, 85);
});
