// Actual pure-module tests with excluded fictional criteria/learners. No storage/provider calls.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash, webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  at,
  criteria,
  known,
  progress,
  source,
  context,
  command,
  withPortfolio,
  exactBoundaryState,
} from "../test-fixtures/learning-portfolio/factory.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
globalThis.crypto ??= webcrypto;
const built = await build({
  stdin: {
    contents:
      "export * from './src/lib/client/learning-portfolio-model.ts'; export {validCourse,coursePassed,lessonPassed} from './src/lib/client/program-course.ts'; export {courseLessons} from './src/data/program-course.ts';",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "es2022",
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
let checks = 0;
const check = async (name, run) => {
  await run();
  checks++;
  console.log(`✓ ${name}`);
};
const clone = m.learningClone;
const c = criteria(m),
  definitions = known(m);
const rehash = (r) => ({ ...r, hash: m.learningEntryHash(r) });
const capture = (input = progress(m), edition = c) => ({
  kind: "record.capture",
  criteriaId: edition.id,
  criteriaHash: edition.hash,
  source: source(input),
  criteriaAffirmed: true,
});
const rejects = (run, code) =>
  assert.rejects(run, (e) => {
    assert.ok(e instanceof m.LearningPortfolioError, e?.stack);
    if (code) assert.equal(e.code, code);
    return true;
  });
const throws = (run, code) =>
  assert.throws(run, (e) => {
    assert.ok(e instanceof m.LearningPortfolioError, e?.stack);
    if (code) assert.equal(e.code, code);
    return true;
  });
const bytes = (s) => new TextEncoder().encode(s);
const gate = () => {
  let release;
  const wait = new Promise((r) => (release = r));
  return {
    release,
    digest: async (b) => {
      await wait;
      return createHash("sha256").update(b).digest("hex");
    },
  };
};
const full = (state, exportedAt = at) => {
  const body = {
    format: "charitology-learning-portfolio-backup",
    version: 1,
    exportedAt,
    state,
  };
  return (
    JSON.stringify({ ...body, checksum: m.hashLearningSync(body) }, null, 2) +
    "\n"
  );
};
await check(
  "actual pure TypeScript passes strict checking with no declarations or API shims",
  () => {
    execFileSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--strict",
        "--noEmit",
        "--skipLibCheck",
        "--target",
        "ES2022",
        "--module",
        "ESNext",
        "--moduleResolution",
        "Bundler",
        "--lib",
        "ES2022,DOM",
        "--types",
        "node",
        "src/lib/client/learning-portfolio-model.ts",
      ],
      { cwd: root, stdio: "pipe" },
    );
  },
);
await check(
  "canonical SHA matches Web Crypto and Node across UTF-8 and multiple blocks",
  async () => {
    for (const value of [
      null,
      "abc",
      "漢😀é\ud800",
      { b: "z".repeat(140000), a: [0, false, ""] },
    ]) {
      const expected = createHash("sha256")
        .update(m.canonicalLearningJson(value))
        .digest("hex");
      assert.equal(m.hashLearningSync(value), expected);
      assert.equal(await m.hashLearningValue(value), expected);
    }
    await rejects(
      () => m.hashLearningValue("abc", async () => "0".repeat(64)),
      "digest",
    );
  },
);
await check(
  "strict plain data rejects accessors, cycles, symbols, decoration and sparse arrays before execution",
  () => {
    let called = 0;
    const value = {};
    Object.defineProperty(value, "name", {
      enumerable: true,
      get() {
        called++;
        return "bad";
      },
    });
    throws(() => m.canonicalLearningJson(value), "json");
    assert.equal(called, 0);
    const circular = {};
    circular.self = circular;
    throws(() => m.canonicalLearningJson(circular), "json");
    throws(() => m.canonicalLearningJson({ [Symbol("x")]: 1 }), "json");
    throws(() => m.canonicalLearningJson([, 1]), "json");
    throws(
      () => m.canonicalLearningJson(new (class extends Array {})(1, 2)),
      "json",
    );
    throws(() => m.canonicalLearningJson({ n: Infinity }), "json");
    throws(() => m.canonicalLearningJson(JSON.parse('{"__proto__":1}')), "key");
  },
);
await check(
  "known v1 maximum writer shape is exactly373881 bytes and old/new validators agree",
  async () => {
    const s = {
      version: 1,
      name: "\u0000".repeat(120),
      capstone: "\u0000".repeat(12000),
      completedAt: "9999-12-31",
      lessons: Array.from({ length: 10 }, () => ({
        read: false,
        practice: "\u0000".repeat(5000),
        answers: [-1, -1],
      })),
    };
    assert.deepEqual(m.validCourse(s), m.validateCourseProgress(s));
    const text = m.makeCourseProgressExport(s);
    assert.equal(Buffer.byteLength(text), 373881);
    assert.deepEqual((await m.parseCourseProgressExport(text)).input, s);
    for (const fill of ["漢", "\ud800", '"']) {
      const v = clone(s);
      v.name = fill.repeat(120);
      v.capstone = fill.repeat(12000);
      for (const l of v.lessons) l.practice = fill.repeat(5000);
      assert.deepEqual(m.validCourse(v), m.validateCourseProgress(v));
      assert.ok(Buffer.byteLength(m.makeCourseProgressExport(v)) <= 400000);
    }
  },
);
await check(
  "v1 shape, zero versus unanswered, calendar and non-lossy unknown-field refusal",
  () => {
    for (const day of [
      "",
      "0000-01-01",
      "0099-02-28",
      "1900-02-28",
      "2000-02-29",
      "9999-12-31",
      "2025-02-29",
      "2024-02-30",
    ]) {
      const s = clone(m.emptyCourseProgress());
      s.completedAt = day;
      let old = true;
      try {
        m.validCourse(s);
      } catch {
        old = false;
      }
      if (old) assert.deepEqual(m.validateCourseProgress(s), s);
      else throws(() => m.validateCourseProgress(s), "day");
    }
    const s = clone(m.emptyCourseProgress());
    s.lessons[0].answers = [0, -1];
    assert.deepEqual(m.validateCourseProgress(s).lessons[0].answers, [0, -1]);
    s.extra = "Do not strip";
    assert.ok(!Object.hasOwn(m.validCourse(s), "extra"));
    throws(() => m.validateCourseProgress(s), "shape");
    for (const edit of [
      (x) => x.lessons.pop(),
      (x) => x.lessons[0].answers.push(0),
      (x) => (x.lessons[0].answers[0] = 3),
      (x) => (x.name = "x".repeat(121)),
    ]) {
      const v = clone(m.emptyCourseProgress());
      edit(v);
      throws(() => m.validateCourseProgress(v));
    }
  },
);
await check(
  "strict file bytes refuse duplicate escaped keys, deep containers, invalid UTF-8 and oversized subclasses",
  () => {
    throws(
      () => m.strictLearningJson('{"name":1,"na\\u006de":2}', 400000),
      "duplicate_key",
    );
    throws(
      () => m.strictLearningJson("[".repeat(33) + "0" + "]".repeat(33), 400000),
      "depth",
    );
    assert.doesNotThrow(() =>
      m.strictLearningJson("[".repeat(32) + "0" + "]".repeat(32), 400000),
    );
    assert.deepEqual(
      m.strictLearningJson('{"literal":"{[} and \\" braces"}', 400000),
      { literal: '{[} and " braces' },
    );
    throws(() => m.strictLearningJson(Uint8Array.from([0xff]), 400000), "utf8");
    throws(() => m.strictLearningJson('{"x":1} trailing', 400000), "json");
    class Large extends Uint8Array {
      get byteLength() {
        return 0;
      }
      get [Symbol.iterator]() {
        throw Error("iterator must not run");
      }
      slice() {
        throw Error("slice must not run");
      }
    }
    throws(() => m.strictLearningJson(new Large(400001), 400000), "byte_limit");
    throws(
      () => m.strictLearningJson(" ".repeat(400001), 400000),
      "byte_limit",
    );
  },
);
await check(
  "exact400000-byte course files admit, +1 refuses before hashing, and raw surrogate replacement is forbidden",
  async () => {
    const base = m.makeCourseProgressExport(progress(m)),
      exact = base + " ".repeat(400000 - Buffer.byteLength(base));
    let digests = 0;
    assert.equal(Buffer.byteLength(exact), 400000);
    assert.deepEqual(
      (await m.parseCourseProgressExport(exact)).input,
      progress(m),
    );
    await rejects(
      () =>
        m.parseCourseProgressExport(exact + " ", async (b) => {
          digests++;
          return createHash("sha256").update(b).digest("hex");
        }),
      "byte_limit",
    );
    assert.equal(digests, 0);
    const raw =
      '{"version":1,"name":"' +
      String.fromCharCode(0xd800) +
      '","capstone":"","completedAt":"","lessons":' +
      JSON.stringify(m.emptyCourseProgress().lessons) +
      "}";
    throws(() => m.strictLearningJson(raw, 400000), "utf8");
    await rejects(() => m.parseCourseProgressExport(raw), "utf8");
    const escaped = JSON.stringify({
      ...m.emptyCourseProgress(),
      name: String.fromCharCode(0xd800),
    });
    assert.equal(
      (await m.parseCourseProgressExport(escaped)).input.name,
      String.fromCharCode(0xd800),
    );
    const state = await withPortfolio(m),
      backup = full(state).replace(
        "Fictional learner code",
        String.fromCharCode(0xd800),
      );
    await rejects(() => m.parseLearningBackup(backup, definitions), "utf8");
  },
);
await check(
  "course source hash covers exact selected bytes while equal parsed data remains distinct",
  async () => {
    const input = progress(m),
      a = JSON.stringify(input),
      b = JSON.stringify(input, null, 2) + "\n";
    const aa = await m.parseCourseProgressExport(a),
      bb = await m.parseCourseProgressExport(bytes(b));
    assert.deepEqual(aa.input, bb.input);
    assert.notEqual(aa.rawHash, bb.rawHash);
    assert.equal(bb.rawHash, createHash("sha256").update(b).digest("hex"));
  },
);
await check(
  "criteria validate exact source bytes, ten chapter bindings, ordered choices and known complete definitions",
  () => {
    assert.equal(m.validateCourseCriteria(c, [c]).hash, c.hash);
    assert.equal(c.sourceFiles.length, 10);
    assert.equal(
      c.units.reduce((n, u) => n + u.questions.length, 0),
      20,
    );
    const cases = [
      (x) => (x.sourceFiles[0].rawText += "changed"),
      (x) => (x.units[0].chapter = 2),
      (x) => (x.units[0].chapterPath = "elsewhere.md"),
      (x) => (x.units[0].questions[0].correct = 3),
      (x) => x.units[0].questions[0].options.pop(),
      (x) => (x.rules.stringLength = "graphemes"),
      (x) => (x.sourceCommit = "unknown"),
      (x) => (x.units[0].extra = "bad"),
    ];
    for (const edit of cases) {
      const v = clone(c);
      edit(v);
      v.hash = m.learningEntryHash(v);
      throws(() => m.validateCourseCriteria(v, [v]));
    }
    const altered = clone(c);
    altered.units[0].questions[0].options.reverse();
    altered.hash = m.learningEntryHash(altered);
    throws(() => m.validateCourseCriteria(altered, [c]), "criteria_unknown");
    throws(() => m.validateCourseCriteria(c, [c, c]), "criteria_duplicate");
  },
);
await check(
  "criteria and all retained source data are owned and deeply frozen without inventing original dates",
  () => {
    const valid = m.validateCourseCriteria(c, definitions);
    assert.ok(Object.isFrozen(valid.units[0].questions[0].options));
    const blank = m.blankLearningPortfolio("blank", at);
    assert.equal(blank.revision, 0);
    assert.equal(blank.records.length, 0);
    assert.ok(Object.isFrozen(blank.draft));
    assert.equal(m.emptyCourseProgress().completedAt, "");
  },
);
await check(
  "real course gates remain identical and evaluate only read, public answers and trimmed lengths",
  () => {
    const real = {
      ...clone(c),
      units: c.units.map((u, i) => ({
        ...clone(u),
        takeaway: m.courseLessons[i].takeaway,
        exercise: m.courseLessons[i].exercise,
        worked: m.courseLessons[i].worked,
        questions: clone(m.courseLessons[i].questions),
      })),
    };
    real.hash = m.learningEntryHash(real);
    const s = progress(m, real);
    assert.equal(m.coursePassed(s), true);
    assert.equal(m.evaluateCourseProgress(s, real).complete, true);
    for (const edit of [
      (x) => (x.lessons[0].read = false),
      (x) => (x.lessons[0].practice = " ".repeat(40)),
      (x) => (x.lessons[0].practice = "x".repeat(29)),
      (x) => (x.lessons[0].answers[0] = -1),
      (x) => (x.capstone = " ".repeat(300)),
      (x) => (x.capstone = "x".repeat(199)),
    ]) {
      const x = clone(s);
      edit(x);
      assert.equal(
        m.coursePassed(x),
        m.evaluateCourseProgress(x, real).complete,
      );
      assert.equal(m.evaluateCourseProgress(x, real).complete, false);
    }
    const x = clone(s);
    x.completedAt = "9999-12-31";
    assert.equal(m.evaluateCourseProgress(x, real).complete, true);
  },
);
await check(
  "two fictional pinned editions can disagree while original snapshot bytes stay unchanged",
  async () => {
    let s = await withPortfolio(m);
    const first = JSON.stringify(s.records[0]);
    assert.equal(
      m.evaluateCourseProgress(s.records[0].input, definitions[0]).complete,
      true,
    );
    assert.equal(
      m.evaluateCourseProgress(s.records[0].input, definitions[1]).complete,
      false,
    );
    s = await command(m, s, capture(s.records[0].input, definitions[1]));
    assert.equal(JSON.stringify(s.records[0]), first);
    assert.equal(s.records[1].evaluation.complete, false);
    assert.equal(s.criteria.length, 2);
  },
);
await check(
  "explicit partial and complete records have separate capture time and declared unknown legacy day",
  async () => {
    const partial = await withPortfolio(m, { complete: false }),
      complete = await withPortfolio(m);
    assert.equal(partial.records[0].evaluation.complete, false);
    assert.equal(complete.records[0].evaluation.complete, true);
    assert.equal(complete.records[0].input.completedAt, "");
    assert.equal(complete.records[0].recordedAt, at);
    assert.equal(complete.records[0].origin.historicalCriteria, "unknown");
    assert.equal(complete.records[0].origin.persistence, "unsaved-memory");
    assert.equal(complete.records[0].origin.rawHash, null);
  },
);
await check(
  "origin combinations never label absent/unsaved memory as saved or file hashes as identities",
  async () => {
    const blank = m.blankLearningPortfolio("blank", at),
      s = capture(m.emptyCourseProgress());
    const recorded = await command(m, blank, s);
    assert.equal(recorded.records[0].origin.persistence, "unsaved-memory");
    for (const edit of [
      (x) => (x.source.origin.persistence = "saved"),
      (x) => (x.source.origin.rawHash = "a".repeat(64)),
      (x) => (x.source.origin.historicalCriteria = "verified"),
      (x) => (x.source.origin.declaredCompletedAt = "2026-01-01"),
      (x) => {
        x.source.origin.kind = "course-file";
        x.source.origin.persistence = "selected-file";
        x.source.origin.fileName = "../secret.json";
        x.source.origin.rawHash = "a".repeat(64);
      },
    ]) {
      const bad = clone(s);
      edit(bad);
      await rejects(async () =>
        m.prepareLearningCommand(blank, bad, await context(m, blank)),
      );
    }
  },
);
await check(
  "amendment appends exact predecessor hash and cannot branch or change criteria",
  async () => {
    let s = await withPortfolio(m);
    const first = clone(s.records[0]),
      input = clone(first.input);
    input.capstone += " A dated hypothetical follow-up.";
    s = await command(m, s, {
      kind: "record.amend",
      criteriaId: c.id,
      criteriaHash: c.hash,
      expectedRecordId: first.id,
      expectedRecordHash: first.hash,
      source: source(input),
      criteriaAffirmed: true,
      reason: "  Correct a hypothetical detail.  ",
    });
    const amended = s.records[1];
    assert.equal(amended.previousId, first.id);
    assert.equal(amended.previousHash, first.hash);
    assert.equal(amended.revision, 2);
    assert.equal(amended.amendmentReason, "Correct a hypothetical detail.");
    assert.deepEqual(s.records[0], first);
    assert.equal(
      m.learningRecordView(s, first.id, definitions).currentInSeries,
      false,
    );
    await rejects(
      async () =>
        m.prepareLearningCommand(
          s,
          {
            kind: "record.amend",
            criteriaId: c.id,
            criteriaHash: c.hash,
            expectedRecordId: first.id,
            expectedRecordHash: first.hash,
            source: source(input),
            criteriaAffirmed: true,
            reason: "Do not branch.",
          },
          await context(m, s),
        ),
      "stale_record",
    );
    await rejects(
      async () =>
        m.prepareLearningCommand(
          s,
          {
            kind: "record.amend",
            criteriaId: definitions[1].id,
            criteriaHash: definitions[1].hash,
            expectedRecordId: amended.id,
            expectedRecordHash: amended.hash,
            source: source(input),
            criteriaAffirmed: true,
            reason: "Different criteria need another series.",
          },
          await context(m, s),
        ),
      "stale_record",
    );
  },
);
await check(
  "rehashed impossible chain/evaluation/source envelopes are rejected rather than repaired",
  async () => {
    let s = await withPortfolio(m);
    s = await command(m, s, {
      kind: "record.amend",
      criteriaId: c.id,
      criteriaHash: c.hash,
      expectedRecordId: s.records[0].id,
      expectedRecordHash: s.records[0].hash,
      source: source(s.records[0].input),
      criteriaAffirmed: true,
      reason: "A deliberate second observation.",
    });
    const edits = [
      (x) => (x.records[1].previousHash = "f".repeat(64)),
      (x) => (x.records[1].revision = 3),
      (x) => (x.records[1].criteriaHash = definitions[1].hash),
      (x) => (x.records[1].seriesId = x.records[1].id),
      (x) => (x.records[0].previousHash = "f".repeat(64)),
      (x) => (x.records[1].evaluation.complete = false),
      (x) => (x.records[1].origin.persistence = "saved"),
      (x) => (x.records[1].criteriaAffirmed = false),
      (x) => (x.records[1].limitations = "accredited"),
    ];
    for (const edit of edits) {
      const bad = clone(s);
      edit(bad);
      bad.records = bad.records.map(rehash);
      throws(() => m.validateLearningPortfolio(bad, definitions));
    }
  },
);
await check(
  "workspace references, unknown keys, global IDs and unreferenced curricula are strict",
  async () => {
    const s = await withPortfolio(m);
    for (const edit of [
      (x) => (x.records[0].id = x.id),
      (x) => (x.records[0].extra = "bad"),
      (x) => x.criteria.push(definitions[1]),
      (x) => (x.draft.recordId = "missing"),
      (x) => (x.records[0].input.extra = "Do not strip"),
      (x) => (x.updatedAt = "2020-01-01T00:00:00.000Z"),
    ]) {
      const bad = clone(s);
      edit(bad);
      if (bad.records[0]) bad.records[0] = rehash(bad.records[0]);
      throws(() => m.validateLearningPortfolio(bad, definitions));
    }
  },
);
await check(
  "raw form preserves invalid day/answers, whitespace and partial bindings without authority",
  async () => {
    let s = m.blankLearningPortfolio("raw", at);
    const raw = {
      tab: "course",
      recordId: null,
      dirty: true,
      form: {
        kind: "course",
        targetId: null,
        binding: { sourceGeneration: "not-yet-valid" },
        fields: {},
        course: {
          name: "  private draft  ",
          capstone: "",
          completedAt: "2026-02-not-finished",
          lessons: Array.from({ length: 10 }, () => ({
            read: false,
            practice: "  raw  ",
            answers: ["", "repair me"],
          })),
        },
      },
    };
    s = await command(m, s, { kind: "draft.replace", draft: raw });
    assert.deepEqual(s.draft, raw);
    assert.deepEqual(
      (
        await m.parseLearningBackup(
          await m.makeLearningBackup(s, at, definitions),
          definitions,
        )
      ).draft,
      raw,
    );
    const extra = clone(s);
    extra.draft.form.fields.notAllowed = "x";
    throws(() => m.validateLearningPortfolio(extra, definitions), "draft");
    const tooLong = clone(s);
    tooLong.draft.form.course.completedAt = "x".repeat(16385);
    throws(() => m.validateLearningPortfolio(tooLong, definitions), "text");
  },
);
await check(
  "shared exact command form clears matching draft only and preserves generation-bound or unrelated forms",
  async () => {
    const cmd = capture();
    assert.ok(
      !Object.hasOwn(
        m.learningCommandForm(cmd).binding,
        "sourceObservedRawHash",
      ),
    );
    let s = m.blankLearningPortfolio("forms", at);
    s = await command(m, s, {
      kind: "draft.replace",
      draft: {
        tab: "portfolio",
        recordId: null,
        dirty: true,
        form: m.learningCommandForm(cmd),
      },
    });
    s = await command(m, s, cmd);
    assert.equal(s.draft.form, null);
    for (const edit of [
      (f) => (f.binding.sourceGeneration = "0"),
      (f) => (f.binding.sourceObservedRawHash = "missing"),
      (f) => (f.binding.criteriaHash = "f".repeat(64)),
      (f) => (f.course.completedAt = "unfinished"),
      (f) => (f.fields.criteriaAffirmed = "false"),
    ]) {
      let b = m.blankLearningPortfolio("forms", at);
      const f = clone(m.learningCommandForm(cmd));
      edit(f);
      assert.equal(m.learningFormMatchesCommand(f, cmd), false);
      b = await command(m, b, {
        kind: "draft.replace",
        draft: { tab: "portfolio", recordId: null, dirty: true, form: f },
      });
      const next = await command(m, b, cmd);
      assert.deepEqual(next.draft.form, f);
    }
  },
);
await check(
  "draft no-op preserves revision, raw form and ID generator without an append",
  async () => {
    const s = await withPortfolio(m),
      ctx = await context(m, s);
    ctx.makeId = () => {
      throw Error("ID must not run");
    };
    const p = await m.prepareLearningCommand(
      s,
      { kind: "draft.replace", draft: s.draft },
      ctx,
    );
    assert.equal(p.noOp, true);
    assert.equal(p.version, 1);
    assert.equal(p.commandKind, "draft.replace");
    assert.equal(p.expectedRevision, s.revision);
    assert.equal(p.candidate.revision, s.revision);
    assert.deepEqual(p.candidate, s);
    assert.ok(Object.isFrozen(p.candidate.records[0].input.lessons));
  },
);
await check(
  "prepared exact replay, wrong revisions/hashes and backdating fail before a second append",
  async () => {
    const s = await withPortfolio(m),
      ctx = await context(m, s),
      cmd = capture();
    const p = await m.prepareLearningCommand(s, cmd, ctx);
    await rejects(
      async () => m.prepareLearningCommand(p.candidate, cmd, ctx),
      "stale_revision",
    );
    const wrong = await context(m, s);
    wrong.expectedStateHash = "0".repeat(64);
    await rejects(
      async () => m.prepareLearningCommand(s, cmd, wrong),
      "stale_state",
    );
    const old = await context(m, s);
    old.at = "2020-01-01T00:00:00.000Z";
    await rejects(
      async () => m.prepareLearningCommand(s, cmd, old),
      "chronology",
    );
  },
);
await check(
  "async preparation defends state, command and context input mutations including no-op paths",
  async () => {
    for (const kind of ["state", "command", "context", "known", "function"]) {
      const s = clone(await withPortfolio(m)),
        cmd = { kind: "draft.replace", draft: clone(s.draft) },
        g = gate(),
        ctx = await context(m, s, known(m), g.digest);
      const p = m.prepareLearningCommand(s, cmd, ctx);
      if (kind === "state") s.draft.dirty = true;
      if (kind === "command") cmd.draft.dirty = true;
      if (kind === "context") ctx.at = "2026-10-28T12:00:00.000Z";
      if (kind === "known")
        ctx.knownCriteria[0].capstoneInstructions += "changed";
      if (kind === "function") ctx.makeId = () => "different";
      g.release();
      await rejects(() => p, "input_changed");
    }
  },
);
await check(
  "context accessors are rejected without running and invalid digest cannot manufacture a candidate",
  async () => {
    const s = await withPortfolio(m);
    let called = 0;
    for (const field of ["at", "makeId", "digest", "knownCriteria"]) {
      const ctx = await context(m, s);
      Object.defineProperty(ctx, field, {
        enumerable: true,
        get() {
          called++;
          return at;
        },
      });
      await rejects(
        async () => m.prepareLearningCommand(s, capture(), ctx),
        "context",
      );
    }
    assert.equal(called, 0);
    for (const edit of [
      (x) => (x[Symbol("extra")] = 1),
      (x) => Object.defineProperty(x, "hidden", { value: 1 }),
    ]) {
      const ctx = await context(m, s);
      edit(ctx);
      await rejects(
        async () => m.prepareLearningCommand(s, capture(), ctx),
        "context",
      );
    }
    const bad = await context(m, s, definitions, async () => "1".repeat(64));
    await rejects(
      async () => m.prepareLearningCommand(s, capture(), bad),
      "digest",
    );
  },
);
await check(
  "async file hashing and backup validation detect byte mutation after admission",
  async () => {
    const raw = bytes(m.makeCourseProgressExport(progress(m))),
      g = gate(),
      p = m.parseCourseProgressExport(raw, g.digest);
    raw[raw.length - 2] ^= 1;
    g.release();
    await rejects(() => p, "input_changed");
    const s = await withPortfolio(m),
      saved = bytes(await m.makeLearningBackup(s, at, definitions)),
      g2 = gate(),
      p2 = m.parseLearningBackup(saved, definitions, g2.digest);
    saved[saved.length - 2] ^= 1;
    g2.release();
    await rejects(() => p2, "input_changed");
  },
);
await check(
  "complete backup includes export time and all private draft data and verifies without truncation",
  async () => {
    let s = await withPortfolio(m);
    s = await command(m, s, {
      kind: "draft.replace",
      draft: {
        tab: "portfolio",
        recordId: s.records[0].id,
        dirty: true,
        form: {
          kind: "amend",
          targetId: s.records[0].id,
          binding: { expectedRecordHash: "unfinished" },
          fields: { amendmentReason: "PRIVATE RAW RECOVERY" },
          course: null,
        },
      },
    });
    const a = await m.makeLearningBackup(s, at, definitions),
      b = await m.makeLearningBackup(
        s,
        "2026-10-28T12:00:00.000Z",
        definitions,
      );
    assert.notEqual(JSON.parse(a).checksum, JSON.parse(b).checksum);
    assert.deepEqual(await m.parseLearningBackup(a, definitions), s);
    assert.ok(a.endsWith("\n"));
    const bad = JSON.parse(a);
    bad.state.records[0].input.name = "tampered";
    await rejects(
      () => m.parseLearningBackup(JSON.stringify(bad), definitions),
      "backup_hash",
    );
  },
);
await check(
  "full backup rechecks record hashes/evaluation/known definitions even when wrapper is recomputed",
  async () => {
    const s = await withPortfolio(m);
    for (const edit of [
      (x) => (x.records[0].input.capstone = "short"),
      (x) => (x.records[0].evaluation.complete = false),
      (x) => (x.records[0].previousHash = "a".repeat(64)),
      (x) => (x.criteria[0].units[0].questions[0].correct = 2),
    ]) {
      const bad = clone(s);
      edit(bad);
      await rejects(() => m.parseLearningBackup(full(bad), definitions));
    }
  },
);
await check(
  "selected packet excludes other learners/ancestors/raw drafts and retains predecessor hash without recovery claims",
  async () => {
    let s = await withPortfolio(m);
    const first = clone(s.records[0]);
    const edited = clone(first.input);
    edited.name = "SELECTED PRIVATE CURRENT";
    s = await command(m, s, {
      kind: "record.amend",
      criteriaId: c.id,
      criteriaHash: c.hash,
      expectedRecordId: first.id,
      expectedRecordHash: first.hash,
      source: source(edited),
      criteriaAffirmed: true,
      reason: "A fictional amendment.",
    });
    const other = progress(m);
    other.name = "UNSELECTED PRIVATE OTHER";
    s = await command(m, s, capture(other));
    s = await command(m, s, {
      kind: "draft.replace",
      draft: {
        tab: "portfolio",
        recordId: null,
        dirty: true,
        form: {
          kind: "capture",
          targetId: null,
          binding: {},
          fields: { criteriaAffirmed: "PRIVATE RAW DRAFT" },
          course: null,
        },
      },
    });
    const p = await m.makeLearningPacket(
        s,
        s.records[1].id,
        "fellowship-planning",
        definitions,
      ),
      body = JSON.parse(p.json);
    assert.equal(body.record.previousId, first.id);
    assert.equal(body.record.previousHash, first.hash);
    assert.equal(body.record.id, s.records[1].id);
    assert.equal(body.records, undefined);
    for (const text of [p.json, p.markdown, p.csv]) {
      assert.ok(!text.includes("UNSELECTED PRIVATE OTHER"));
      assert.ok(!text.includes("PRIVATE RAW DRAFT"));
      assert.ok(!text.includes("Fictional learner code"));
    }
    assert.ok(p.markdown.includes("Unknown"));
    assert.ok(p.markdown.includes("has not been submitted"));
    assert.ok(p.markdown.includes("cannot restore"));
    await rejects(() => m.parseLearningBackup(p.json, definitions), "shape");
  },
);
await check(
  "selected packet bytes stay stable when later series heads or unrelated raw work change",
  async () => {
    let state = await withPortfolio(m);
    const first = state.records[0];
    const before = await m.makeLearningPacket(
      state,
      first.id,
      "personal-study",
      definitions,
    );
    state = await command(m, state, {
      kind: "record.amend",
      criteriaId: c.id,
      criteriaHash: c.hash,
      expectedRecordId: first.id,
      expectedRecordHash: first.hash,
      source: source(first.input),
      criteriaAffirmed: true,
      reason: "Fictional later capture.",
    });
    state = await command(m, state, {
      kind: "draft.replace",
      draft: { ...state.draft, dirty: true },
    });
    assert.deepEqual(
      await m.makeLearningPacket(
        state,
        first.id,
        "personal-study",
        definitions,
      ),
      before,
    );
    assert.ok(
      before.markdown.includes("does not establish the current series head"),
    );
  },
);
await check(
  "packet exports deterministic values, formula-safe CSV and fenced hostile text with explicit limitations",
  async () => {
    const input = progress(m);
    input.name = "<script>private</script>";
    input.lessons[0].practice = ' =HYPERLINK("https://example.invalid","x")';
    input.capstone =
      "```\n<script>do not execute</script>\n" +
      "Hypothetical reasoning. ".repeat(20);
    const s = await command(
      m,
      m.blankLearningPortfolio("packet", at),
      capture(input),
    );
    const p = await m.makeLearningPacket(
      s,
      s.records[0].id,
      "credential-proposal",
      definitions,
    );
    assert.deepEqual(
      await m.makeLearningPacket(
        s,
        s.records[0].id,
        "credential-proposal",
        definitions,
      ),
      p,
    );
    assert.ok(p.csv.includes("' =HYPERLINK"));
    assert.ok(p.markdown.includes("````text"));
    assert.ok(p.markdown.includes("Nonaccredited"));
    assert.ok(
      p.markdown.includes(
        "Identity, reading, learning and reasoning are not independently assessed",
      ),
    );
    assert.equal(JSON.parse(p.json).checksum, p.packetHash);
  },
);
await check(
  "export and packet asynchronous stale work cannot substitute a newer state or registry",
  async () => {
    for (const packet of [false, true]) {
      const s = clone(await withPortfolio(m)),
        g = gate();
      const p = packet
        ? m.makeLearningPacket(
            s,
            s.records[0].id,
            "personal-study",
            definitions,
            g.digest,
          )
        : m.makeLearningBackup(s, at, definitions, g.digest);
      s.records[0].input.name = "changed while hashing";
      g.release();
      await rejects(() => p, "input_changed");
    }
  },
);
await check(
  "record count, workspace revision exhaustion and raw draft byte limits reject without modifying input",
  async () => {
    let s = m.blankLearningPortfolio("caps", at);
    for (let i = 0; i < 10; i++)
      s = await command(m, s, capture(m.emptyCourseProgress()));
    const before = JSON.stringify(s);
    await rejects(
      async () => m.prepareLearningCommand(s, capture(), await context(m, s)),
      "record_limit",
    );
    assert.equal(JSON.stringify(s), before);
    const max = clone(await withPortfolio(m));
    max.revision = Number.MAX_SAFE_INTEGER;
    await rejects(
      async () =>
        m.prepareLearningCommand(
          max,
          { kind: "draft.replace", draft: { ...max.draft, dirty: true } },
          await context(m, max),
        ),
      "revision",
    );
    const over = clone(await withPortfolio(m));
    over.draft.form = {
      kind: "course",
      targetId: null,
      binding: {},
      fields: {},
      course: {
        name: "\u0000".repeat(16384),
        capstone: "\u0000".repeat(16384),
        completedAt: "\u0000".repeat(16384),
        lessons: Array.from({ length: 10 }, () => ({
          read: false,
          practice: "\u0000".repeat(16384),
          answers: ["", ""],
        })),
      },
    };
    over.draft.dirty = true;
    throws(() => m.validateLearningPortfolio(over, definitions), "draft_limit");
  },
);
await check(
  "actual complete2MiB backup round-trips and one additional valid raw byte is refused before assignment",
  async () => {
    const s = await exactBoundaryState(m),
      text = await m.makeLearningBackup(s, at, definitions);
    assert.equal(Buffer.byteLength(text), 2097152);
    assert.deepEqual(await m.parseLearningBackup(text, definitions), s);
    const plus = clone(s);
    plus.draft.form.course.capstone += "x";
    assert.ok(plus.draft.form.course.capstone.length <= 16384);
    throws(
      () => m.validateLearningPortfolio(plus, definitions),
      "backup_limit",
    );
    assert.equal(Buffer.byteLength(full(plus)), 2097153);
    assert.equal(Buffer.byteLength(text), 2097152);
  },
);
console.log(
  `Learning portfolio: ${checks} actual model/strict groups passed. All learners and alternate criteria are excluded fictional fixtures; no independent assessment or browser proof.`,
);
