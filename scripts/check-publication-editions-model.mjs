import assert from "node:assert/strict";
import {
  actual,
  strict,
  gateDigest,
} from "../test-fixtures/publication-editions/proposal-harness.mjs";
import {
  at,
  fixture,
  command,
  context,
  captured,
  wrapper,
  exactBoundaryState,
} from "../test-fixtures/publication-editions/proposal-factory.mjs";
const m = await actual(),
  f = fixture(m);
let groups = 0;
const check = async (name, fn) => {
  try {
    await fn();
    groups++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
};
const bad = (fn) => assert.throws(fn);
await check("strict TypeScript on actual browser model/types", () =>
  strict([
    "src/lib/client/publication-editions-model.ts",
    "src/lib/publication-editions-types.ts",
  ]),
);
await check(
  "exact offered selected wrapper, raw bytes and complete source closure",
  async () => {
    assert.deepEqual(
      m.parsePublicationProposalBasis(f.bundle, f.catalog),
      f.basis,
    );
    bad(() => m.parsePublicationProposalBasis(f.bundle + " ", f.catalog));
    const b = structuredClone(f.basis);
    b.sources = [];
    await assert.rejects(async () =>
      m.preparePublicationProposalCommand(
        m.blankPublicationProposals("x", at),
        { kind: "basis.capture", basis: b },
        context(m, m.blankPublicationProposals("x", at), f.catalog),
      ),
    );
  },
);
await check(
  "catalog fixed paths, closed schema, root and one-to-one offers",
  () => {
    for (const mutate of [
      (c) => (c.extra = true),
      (c) => (c.hash = "a".repeat(64)),
      (c) => (c.basisOffers[0].href = "https://example.invalid/evil"),
      (c) => c.entries.push(c.entries[0]),
    ]) {
      const c = structuredClone(f.catalog);
      mutate(c);
      bad(() => m.validateProposalCatalog(c));
    }
  },
);
await check(
  "duplicate escaped keys, malformed UTF8, raw surrogate, reserved/accessor/depth admission",
  () => {
    bad(() => m.strictPublicationProposalJson('{"a":1,"\\u0061":2}', 100));
    bad(() =>
      m.strictPublicationProposalJson(new Uint8Array([0xc0, 0xaf]), 100),
    );
    bad(() => m.strictPublicationProposalJson('"\ud800"', 100));
    assert.equal(m.strictPublicationProposalJson('"\\ud800"', 100), "\ud800");
    bad(() =>
      m.strictPublicationProposalJson(
        "[".repeat(33) + "0" + "]".repeat(33),
        100,
      ),
    );
    bad(() =>
      m.canonicalPublicationProposalJson(
        Object.defineProperty({}, "x", {
          get() {
            throw Error("never");
          },
          enumerable: true,
        }),
      ),
    );
    bad(() =>
      m.canonicalPublicationProposalJson(JSON.parse('{"__proto__":0}')),
    );
  },
);
await check(
  "whole state source/hash/history closure cannot be rebound or orphaned",
  async () => {
    const s = await captured(m, f);
    for (const edit of [
      (s) => (s.sources[0].rawUtf8 += "x"),
      (s) => (s.bases[0].core.members[0].payload.body += "x"),
      (s) => (s.sources = []),
      (s) => s.sources.push(s.sources[0]),
    ]) {
      const x = structuredClone(s);
      edit(x);
      bad(() => m.validatePublicationProposalState(x, f.catalog));
    }
  },
);
await check(
  "capture appends once and exact duplicate is no-op without draft clearing",
  async () => {
    let s = await captured(m, f);
    s = structuredClone(s);
    s.draft.form = m.publicationProposalCommandForm(
      { kind: "basis.capture", basis: f.basis },
      { catalogHash: f.catalog.hash },
    );
    s.draft.dirty = true;
    const p = await m.preparePublicationProposalCommand(
      s,
      { kind: "basis.capture", basis: f.basis },
      context(m, s, f.catalog),
    );
    assert.equal(p.noOp, true);
    assert.deepEqual(p.candidate, s);
  },
);
await check(
  "proposal frozen version, exact current no-op and ancestor-identical amendment chain",
  async () => {
    let s = await captured(m, f),
      cmd = command(m, f.basis);
    s = (
      await m.preparePublicationProposalCommand(
        s,
        cmd,
        context(m, s, f.catalog),
      )
    ).candidate;
    const a = s.versions[0],
      p = s.proposals[0];
    cmd = {
      ...cmd,
      proposalId: p.id,
      expectedVersionId: a.id,
      expectedVersionHash: a.hash,
      amendmentReason: "Different reason only",
    };
    assert.equal(
      (
        await m.preparePublicationProposalCommand(
          s,
          cmd,
          context(m, s, f.catalog),
        )
      ).noOp,
      true,
    );
    cmd.title = "Different title";
    s = (
      await m.preparePublicationProposalCommand(
        s,
        cmd,
        context(m, s, f.catalog),
      )
    ).candidate;
    const b = s.versions[1];
    cmd = {
      ...cmd,
      title: a.title,
      expectedVersionId: b.id,
      expectedVersionHash: b.hash,
      amendmentReason: "Restore former wording",
    };
    s = (
      await m.preparePublicationProposalCommand(
        s,
        cmd,
        context(m, s, f.catalog),
      )
    ).candidate;
    assert.equal(s.versions.length, 3);
    assert.equal(s.versions[2].previousHash, b.hash);
    assert.equal(s.versions[2].title, a.title);
    const x = structuredClone(s);
    x.versions[2].previousHash = a.hash;
    bad(() => m.validatePublicationProposalState(x, f.catalog));
  },
);
await check(
  "null date stays unknown and invalid calendar dates are refused",
  async () => {
    const s = await captured(m, f),
      p = await m.preparePublicationProposalCommand(
        s,
        command(m, f.basis),
        context(m, s, f.catalog),
      );
    assert.equal(p.candidate.versions[0].declaredPublicationDate, null);
    await assert.rejects(async () =>
      m.preparePublicationProposalCommand(
        s,
        command(m, f.basis, { declaredPublicationDate: "2026-02-30" }),
        context(m, s, f.catalog),
      ),
    );
  },
);
await check(
  "fresh command and digest input mutation cannot silently alter pending candidate",
  async () => {
    const s = await captured(m, f),
      cmd = command(m, f.basis),
      gate = gateDigest();
    const pause = gate.pause();
    const pending = m.preparePublicationProposalCommand(
      s,
      cmd,
      context(m, s, f.catalog, { digest: gate.digest }),
    );
    await pause.started;
    cmd.title = "Changed after await";
    pause.release();
    await assert.rejects(async () => pending);
  },
);
await check(
  "exact saved raw form bindings only; unrelated/partial forms retained",
  async () => {
    const s = structuredClone(await captured(m, f)),
      cmd = command(m, f.basis);
    s.draft.form = m.publicationProposalCommandForm(cmd, {
      catalogHash: f.catalog.hash,
    });
    s.draft.dirty = true;
    const p = await m.preparePublicationProposalCommand(
      s,
      cmd,
      context(m, s, f.catalog),
    );
    assert.equal(p.candidate.draft.form, null);
    const x = structuredClone(s);
    x.draft.form.fields.title = "Newer raw work";
    const q = await m.preparePublicationProposalCommand(
      x,
      cmd,
      context(m, x, f.catalog),
    );
    assert.equal(q.candidate.draft.form.fields.title, "Newer raw work");
  },
);
await check(
  "complete backup roundtrip rejects checksum/unknown state and malformed raw UTF16",
  async () => {
    const s = await captured(m, f),
      b = await m.makePublicationProposalBackup(s, at, f.catalog);
    assert.deepEqual(await m.parsePublicationProposalBackup(b, f.catalog), s);
    const x = JSON.parse(b);
    x.state.draft.dirty = true;
    await assert.rejects(async () =>
      m.parsePublicationProposalBackup(JSON.stringify(x), f.catalog),
    );
    await assert.rejects(async () =>
      m.parsePublicationProposalBackup('"\ud800"', f.catalog),
    );
  },
);
await check(
  "selected packet excludes unrelated private work/raw notes unless explicit and labels full public context",
  async () => {
    let s = await captured(m, f);
    s = (
      await m.preparePublicationProposalCommand(
        s,
        command(m, f.basis),
        context(m, s, f.catalog),
      )
    ).candidate;
    const a = s.versions[0];
    s = (
      await m.preparePublicationProposalCommand(
        s,
        command(m, f.basis, {
          title: "Other private proposal",
          operatorNotes: "UNRELATED SECRET",
        }),
        context(m, s, f.catalog),
      )
    ).candidate;
    s = structuredClone(s);
    s.draft.form = {
      kind: "proposal",
      targetId: null,
      binding: {},
      fields: { title: "UNFINISHED SECRET" },
    };
    const p = await m.makePublicationProposalPacket(
      s,
      { versionId: a.id, includeOperatorNotes: false },
      f.catalog,
    );
    assert.ok(!p.json.includes("PRIVATE OPERATOR NOTE"));
    assert.ok(!p.json.includes("UNRELATED SECRET"));
    assert.ok(!p.json.includes("UNFINISHED SECRET"));
    assert.ok(p.json.includes(f.source.rawUtf8));
    assert.equal(JSON.parse(p.json).operatorNotesIncluded, false);
    assert.ok(
      (
        await m.makePublicationProposalPacket(
          s,
          { versionId: a.id, includeOperatorNotes: true },
          f.catalog,
        )
      ).json.includes("PRIVATE OPERATOR NOTE"),
    );
  },
);
await check(
  "exact 2 MiB pretty backup admission and one-byte refusal",
  async () => {
    const { state, catalog } = await exactBoundaryState(m);
    assert.equal(Buffer.byteLength(wrapper(m, state)), 2_097_152);
    assert.equal(
      Buffer.byteLength(
        await m.makePublicationProposalBackup(state, at, catalog),
      ),
      2_097_152,
    );
    assert.deepEqual(
      await m.parsePublicationProposalBackup(wrapper(m, state), catalog),
      state,
    );
    const x = structuredClone(state);
    x.draft.form.fields.editionId += "x";
    bad(() => m.validatePublicationProposalState(x, catalog));
  },
);

await check(
  "context reassignment/accessor/unknown fields and allocator reuse are refused",
  async () => {
    const state = await captured(m, f);
    for (const alter of [
      (c) => {
        c.extra = true;
      },
      (c) => {
        Object.defineProperty(c, "at", {
          get() {
            throw Error("must not invoke accessor");
          },
        });
      },
    ]) {
      const ctx = context(m, state, f.catalog);
      alter(ctx);
      await assert.rejects(async () =>
        m.preparePublicationProposalCommand(state, command(m, f.basis), ctx),
      );
    }
    const gate = gateDigest(),
      pause = gate.pause(),
      ctx = context(m, state, f.catalog, { digest: gate.digest }),
      pending = m.preparePublicationProposalCommand(
        state,
        command(m, f.basis),
        ctx,
      );
    await pause.started;
    ctx.knownCatalog = structuredClone(f.catalog);
    pause.release();
    await assert.rejects(async () => pending);
    await assert.rejects(async () =>
      m.preparePublicationProposalCommand(
        state,
        command(m, f.basis),
        context(m, state, f.catalog, { makeId: () => state.id }),
      ),
    );
  },
);
await check(
  "post-final-digest mutation and false digest cannot pass admission",
  async () => {
    const state = await captured(m, f),
      cmd = command(m, f.basis);
    let calls = 0;
    const digest = async (bytes) => {
      calls++;
      if (calls === 3) cmd.title = "Late change";
      return (await import("node:crypto"))
        .createHash("sha256")
        .update(bytes)
        .digest("hex");
    };
    await assert.rejects(async () =>
      m.preparePublicationProposalCommand(
        state,
        cmd,
        context(m, state, f.catalog, { digest }),
      ),
    );
    await assert.rejects(async () =>
      m.preparePublicationProposalCommand(
        state,
        command(m, f.basis),
        context(m, state, f.catalog, { digest: async () => "f".repeat(64) }),
      ),
    );
  },
);
await check(
  "source and member collisions, unsupported public identities and revision lineage refuse",
  async () => {
    let state = await captured(m, f);
    state = (
      await m.preparePublicationProposalCommand(
        state,
        command(m, f.basis),
        context(m, state, f.catalog),
      )
    ).candidate;
    for (const edit of [
      (s) => {
        s.revision = 0;
      },
      (s) => {
        s.versions[0].recordedAt = "2026-02-30T00:00:00.000Z";
      },
      (s) => {
        s.proposals[0].currentVersionId = "orphan";
      },
      (s) => {
        s.versions.push(structuredClone(s.versions[0]));
      },
      (s) => {
        s.versions[0].selectedMembers[0].contentHash = "f".repeat(64);
      },
    ]) {
      const x = structuredClone(state);
      edit(x);
      bad(() => m.validatePublicationProposalState(x, f.catalog));
    }
    const b = fixture(m, "new unsupported edition", "two");
    await assert.rejects(async () =>
      m.preparePublicationProposalCommand(
        state,
        { kind: "basis.capture", basis: b.basis },
        context(m, state, f.catalog),
      ),
    );
  },
);
await check(
  "raw form closed names/character/UTF8 limits are distinct from typed validation",
  async () => {
    const state = await captured(m, f);
    for (const form of [
      {
        kind: "proposal",
        targetId: null,
        binding: { unrecognized: "x" },
        fields: {},
      },
      {
        kind: "basis",
        targetId: null,
        binding: {},
        fields: { editionId: "x".repeat(65537) },
      },
      {
        kind: "proposal",
        targetId: null,
        binding: {},
        fields: {
          title: "😀".repeat(32768),
          summary: "😀".repeat(32768),
          blocks: "😀".repeat(32768),
          selectedMembers: "😀".repeat(32768),
          basisPins: "😀".repeat(32768),
        },
      },
    ]) {
      await assert.rejects(async () =>
        m.preparePublicationProposalCommand(
          state,
          {
            kind: "draft.replace",
            draft: { ...state.draft, form, dirty: true },
          },
          context(m, state, f.catalog),
        ),
      );
    }
    const partial = {
      kind: "proposal",
      targetId: null,
      binding: {},
      fields: {
        declaredPublicationDate: "unfinished-date",
        blocks: "[unfinished",
      },
    };
    const result = await m.preparePublicationProposalCommand(
      state,
      {
        kind: "draft.replace",
        draft: { ...state.draft, form: partial, dirty: true },
      },
      context(m, state, f.catalog),
    );
    assert.deepEqual(result.candidate.draft.form, partial);
  },
);
await check(
  "typed authored blocks reject unsafe links and complete-block excess without clearing raw work",
  async () => {
    const state = await captured(m, f);
    for (const blocks of [
      [
        {
          kind: "links",
          items: [{ label: "bad", url: "https://user:pass@example.invalid/" }],
        },
      ],
      [{ kind: "paragraph", text: "x".repeat(5001) }],
      Array.from({ length: 14 }, () => ({
        kind: "paragraph",
        text: "x".repeat(5000),
      })),
    ])
      await assert.rejects(async () =>
        m.preparePublicationProposalCommand(
          state,
          command(m, f.basis, { blocks }),
          context(m, state, f.catalog),
        ),
      );
  },
);
await check(
  "selection scope is explicit across two bases with same member IDs",
  async () => {
    const other = fixture(m, "Second fictional source.", "two"),
      catalog = structuredClone(f.catalog);
    catalog.entries.push(...other.catalog.entries);
    catalog.basisOffers.push(...other.catalog.basisOffers);
    catalog.hash = m.hashPublicationProposalSync(
      Object.fromEntries(Object.entries(catalog).filter(([k]) => k !== "hash")),
    );
    let state = m.blankPublicationProposals("multi-basis", at);
    for (const b of [f.basis, other.basis])
      state = (
        await m.preparePublicationProposalCommand(
          state,
          { kind: "basis.capture", basis: b },
          context(m, state, catalog),
        )
      ).candidate;
    const cmd = command(m, f.basis, {
      basisPins: [...catalog.entries],
      selectedMembers: [
        ...command(m, f.basis).selectedMembers,
        ...command(m, other.basis).selectedMembers,
      ],
    });
    const p = await m.preparePublicationProposalCommand(
      state,
      cmd,
      context(m, state, catalog),
    );
    assert.equal(p.candidate.versions[0].selectedMembers.length, 2);
    assert.equal(p.candidate.bases.length, 2);
  },
);

await check(
  "browser bundle has no Node server/R4 reducer dependency",
  async () => {
    const { build } = await import("esbuild");
    const result = await build({
      entryPoints: [
        "src/lib/client/publication-editions-model.ts",
        "src/lib/client/publication-editions-store.ts",
      ],
      outdir: "/synthetic-unused",
      platform: "browser",
      bundle: true,
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    assert.ok(
      Object.keys(result.metafile.inputs).every(
        (path) =>
          !path.includes("research-ledger") &&
          !path.includes("publication-editions-model.mjs"),
      ),
    );
    assert.ok(
      result.outputFiles.every((file) => !file.text.includes("node:crypto")),
    );
  },
);
await check(
  "public null and explicit zero tokens are retained without a numerical claim",
  async () => {
    const x = fixture(m),
      payload = {
        kind: "figure-input-v1",
        key: "synthetic",
        label: "Synthetic only",
        value: null,
        unit: "declared source token",
        currency: null,
        geography: "Project only",
        sourcePeriodLabel: null,
        measure: "source-description",
        denominator: null,
        sources: [],
        limitations: ["No empirical assertion."],
      };
    const test = (value) => {
      const b = structuredClone(x.basis);
      b.edition.core.members[0] = {
        ...b.edition.core.members[0],
        kind: "figure-input",
        payload: { ...payload, value },
        contentHash: m.hashPublicationProposalSync({ ...payload, value }),
      };
      b.edition.coreHash = m.hashPublicationProposalSync(b.edition.core);
      b.edition.hash = m.hashPublicationProposalSync(
        Object.fromEntries(
          Object.entries(b.edition).filter(([k]) => k !== "hash"),
        ),
      );
      const c = structuredClone(x.catalog);
      c.entries[0].hash = b.edition.hash;
      c.basisOffers[0].editionHash = b.edition.hash;
      const raw =
        JSON.stringify(
          {
            format: "charitology-publication-proposal-basis",
            version: 1,
            ...b,
          },
          null,
          2,
        ) + "\n";
      c.basisOffers[0].byteLength = Buffer.byteLength(raw);
      c.basisOffers[0].sha256 = createHash("sha256").update(raw).digest("hex");
      c.hash = m.hashPublicationProposalSync(
        Object.fromEntries(Object.entries(c).filter(([k]) => k !== "hash")),
      );
      return m.parsePublicationProposalBasis(raw, c).edition.core.members[0]
        .payload.value;
    };
    const { createHash } = await import("node:crypto");
    assert.equal(test(null), null);
    assert.equal(test("0"), "0");
  },
);

await check(
  "actual source-backed five server bundles each fit capture plus useful proposal/full backup",
  async () => {
    const { makeActualPublicationFixture, FIXTURE_CAPTURE_AT } =
      await import("../test-fixtures/publication-editions/factory.mjs");
    const { makeProposalCatalog, makeProposalBasisBundle } =
      await import("../src/lib/publication-editions-model.mjs");
    const fixture = makeActualPublicationFixture(),
      catalog = makeProposalCatalog(fixture.input, {
        basePath: "/charitology",
      });
    assert.equal(m.validateProposalCatalog(catalog).entries.length, 5);
    let seq = 0;
    for (const entry of catalog.entries) {
      const raw = makeProposalBasisBundle(fixture.input, entry.id),
        basis = m.parsePublicationProposalBasis(raw, catalog);
      let s = m.blankPublicationProposals(
        "server-compat-" + ++seq,
        FIXTURE_CAPTURE_AT,
      );
      s = (
        await m.preparePublicationProposalCommand(
          s,
          { kind: "basis.capture", basis },
          context(m, s, catalog, { at: FIXTURE_CAPTURE_AT }),
        )
      ).candidate;
      s = (
        await m.preparePublicationProposalCommand(
          s,
          command(m, basis, {
            family: basis.edition.core.family,
            summary: "Self-recorded software fixture only.",
            operatorNotes: "",
            blocks: [
              {
                kind: "paragraph",
                text: "Review this complete fixed basis; no qualification is inferred.",
              },
            ],
          }),
          context(m, s, catalog, { at: FIXTURE_CAPTURE_AT }),
        )
      ).candidate;
      const backup = await m.makePublicationProposalBackup(
        s,
        FIXTURE_CAPTURE_AT,
        catalog,
      );
      assert.ok(Buffer.byteLength(backup) <= 2_097_152);
      assert.deepEqual(
        await m.parsePublicationProposalBackup(backup, catalog),
        s,
      );
      const packet = await m.makePublicationProposalPacket(
        s,
        { versionId: s.versions[0].id, includeOperatorNotes: false },
        catalog,
      );
      assert.equal(
        JSON.parse(packet.json).sources.length,
        basis.sources.length,
      );
      console.log(
        "  " +
          basis.edition.core.family +
          ": " +
          Buffer.byteLength(raw) +
          "B transfer, " +
          Buffer.byteLength(backup) +
          "B proposal backup",
      );
    }
  },
);
await check(
  "large inert public code markers do not overflow packet fence computation",
  async () => {
    const x = fixture(m, "`x".repeat(100_000), "markers");
    let s = await captured(m, x);
    s = (
      await m.preparePublicationProposalCommand(
        s,
        command(m, x.basis),
        context(m, s, x.catalog),
      )
    ).candidate;
    const p = await m.makePublicationProposalPacket(
      s,
      { versionId: s.versions[0].id, includeOperatorNotes: false },
      x.catalog,
    );
    assert.ok(p.markdown.includes("```json"));
    assert.ok(p.json.includes("`x`x"));
  },
);

await check(
  "future authored server bundle accepts public citation years through 9999 while instants stay bounded",
  async () => {
    const {
      makeActualPublicationFixture,
      authoredFutureRequest,
      authoredFutureRaw,
      readActualPublicationFixtureSources,
    } = await import("../test-fixtures/publication-editions/factory.mjs");
    const { capturePublicationEditions, publicationCapturePaths } =
      await import("../src/lib/publication-editions-capture.mjs");
    const { makeProposalCatalog, makeProposalBasisBundle } =
      await import("../src/lib/publication-editions-model.mjs");
    const base = makeActualPublicationFixture().input,
      req = authoredFutureRequest(),
      required = publicationCapturePaths([req]),
      raw = readActualPublicationFixtureSources().filter((s) =>
        required.includes(s.path),
      ),
      authored = JSON.parse(authoredFutureRaw());
    authored.sources = [
      {
        title: "Synthetic future-year citation schema fixture",
        url: "https://example.invalid/fictional-source",
        publisher: null,
        year: 9999,
        note: "Schema test only; not an empirical claim.",
      },
    ];
    raw.push({
      path: req.authoredLetterPath,
      rawUtf8: JSON.stringify(authored),
    });
    const future = capturePublicationEditions({
        sourceCommit: "b".repeat(40),
        capturedAt: "2026-10-28T12:00:00.000Z",
        requests: [req],
        rawSources: raw,
        previousInput: base,
      }),
      catalog = makeProposalCatalog(future.input),
      basis = m.parsePublicationProposalBasis(
        makeProposalBasisBundle(future.input, req.id),
        catalog,
      );
    assert.equal(basis.edition.core.members[0].payload.sources[0].year, 9999);
    bad(() =>
      m.blankPublicationProposals("bad-instant", "2500-01-01T00:00:00.000Z"),
    );
  },
);

await check(
  "literal backslash/control URLs are refused in authored blocks and pinned citation shapes",
  async () => {
    const state = await captured(m, f);
    for (const url of [
      "https://example.invalid\\@other.invalid/path",
      "https://example.invalid/has space",
      "https://example.invalid/\npath",
    ])
      await assert.rejects(async () =>
        m.preparePublicationProposalCommand(
          state,
          command(m, f.basis, {
            blocks: [{ kind: "links", items: [{ label: "Synthetic", url }] }],
          }),
          context(m, state, f.catalog),
        ),
      );
    const x = fixture(m),
      b = structuredClone(x.basis);
    b.edition.core.members[0].payload.sources = [
      {
        title: "Fictional malformed URL",
        url: "https://example.invalid\\@other.invalid/path",
        publisher: null,
        year: null,
        note: null,
      },
    ];
    b.edition.core.members[0].contentHash = m.hashPublicationProposalSync(
      b.edition.core.members[0].payload,
    );
    b.edition.coreHash = m.hashPublicationProposalSync(b.edition.core);
    b.edition.hash = m.hashPublicationProposalSync(
      Object.fromEntries(
        Object.entries(b.edition).filter(([k]) => k !== "hash"),
      ),
    );
    const c = structuredClone(x.catalog);
    c.entries[0].hash = b.edition.hash;
    c.basisOffers[0].editionHash = b.edition.hash;
    const raw =
      JSON.stringify(
        { format: "charitology-publication-proposal-basis", version: 1, ...b },
        null,
        2,
      ) + "\n";
    c.basisOffers[0].byteLength = Buffer.byteLength(raw);
    c.basisOffers[0].sha256 = (await import("node:crypto"))
      .createHash("sha256")
      .update(raw)
      .digest("hex");
    c.hash = m.hashPublicationProposalSync(
      Object.fromEntries(Object.entries(c).filter(([k]) => k !== "hash")),
    );
    bad(() => m.parsePublicationProposalBasis(raw, c));
  },
);
console.log(`${groups} publication proposal model groups passed.`);
