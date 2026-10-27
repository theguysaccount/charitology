// Actual authored criteria and server-loader checks; no learner records or clock.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import ts from "typescript";
const root = process.cwd(),
  directory = join(root, "src/data/course-criteria");
const temporary = mkdtempSync(join(tmpdir(), "charitology-criteria-"));
let groups = 0;
function check(name, fn) {
  fn();
  groups++;
  console.log("✓ " + name);
}
async function loadModule(loaderRoot) {
  const output = await build({
    stdin: {
      contents:
        "export * from './src/lib/course-criteria.ts';export {hashLearningSync,canonicalLearningJson,validateCourseCriteria,emptyCourseProgress,evaluateCourseProgress} from './src/lib/client/learning-portfolio-model.ts';",
      resolveDir: root,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    define: { "process.cwd": "__criteriaCwd" },
    banner: {
      js: `const __criteriaCwd = () => ${JSON.stringify(loaderRoot)};`,
    },
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
}
try {
  const m = await loadModule(root),
    bundle = m.loadCourseCriteria(),
    { currentCriteria: criteria } = bundle;
  check(
    "actual immutable registry, ten bindings and all twenty questions validate",
    () => {
      assert.equal(
        bundle.criteriaRegistry.format,
        "charitology-course-criteria-registry",
      );
      assert(
        bundle.knownCriteria.length >= 1 && bundle.knownCriteria.length <= 20,
      );
      assert.equal(criteria.units.length, 10);
      assert.equal(criteria.sourceFiles.length, 10);
      assert.equal(
        criteria.units.reduce((n, u) => n + u.questions.length, 0),
        20,
      );
      assert(
        Object.isFrozen(bundle) &&
          Object.isFrozen(criteria) &&
          Object.isFrozen(criteria.units),
      );
      for (const source of criteria.sourceFiles) {
        const bytes = readFileSync(join(root, source.path));
        assert.equal(bytes.toString("utf8"), source.rawText);
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          source.rawHash,
        );
      }
    },
  );
  check(
    "current question order, rubric, chapter text and capstone cannot drift silently",
    () => {
      for (const change of [
        (c) => c.units[0].questions[0].options.reverse(),
        (c) => (c.units[0].worked += " changed"),
        (c) => (c.sourceFiles[0].rawText += " changed"),
        (c) => c.rules.practiceMin++,
        (c) => (c.capstoneInstructions += " changed"),
        (c) => c.units.reverse(),
      ]) {
        const c = structuredClone(criteria);
        change(c);
        assert.throws(() => m.verifyCurrentCourseCriteria(c));
      }
    },
  );
  check(
    "checks are self-recorded, zero answer is a real choice and blank date stays unknown",
    () => {
      const progress = structuredClone(m.emptyCourseProgress());
      assert.equal(
        m.evaluateCourseProgress(progress, criteria).complete,
        false,
      );
      for (const [i, u] of criteria.units.entries()) {
        progress.lessons[i] = {
          read: true,
          practice: "Fictional study practice. ".repeat(2),
          answers: u.questions.map((q) => q.correct),
        };
      }
      progress.capstone = "Fictional study, not assessed. ".repeat(10);
      const evaluation = m.evaluateCourseProgress(progress, criteria);
      assert.equal(evaluation.complete, true);
      assert.equal(progress.completedAt, "");
      assert(!("completedAt" in evaluation));
      progress.lessons[0].read = false;
      assert.equal(
        m.evaluateCourseProgress(progress, criteria).complete,
        false,
      );
    },
  );
  const fixture = join(temporary, "fixture");
  mkdirSync(join(fixture, "src/content"), { recursive: true });
  mkdirSync(join(fixture, "src/data"), { recursive: true });
  cpSync(
    join(root, "src/content/principles"),
    join(fixture, "src/content/principles"),
    { recursive: true },
  );
  cpSync(directory, join(fixture, "src/data/course-criteria"), {
    recursive: true,
  });
  const f = await loadModule(fixture);
  f.loadCourseCriteria();
  const registryFile = join(fixture, "src/data/course-criteria/registry.json"),
    registryText = readFileSync(registryFile, "utf8");
  check(
    "real loader refuses unknown registry fields and duplicate decoded keys",
    () => {
      const reg = JSON.parse(registryText);
      reg.unexpected = true;
      writeFileSync(registryFile, JSON.stringify(reg));
      assert.throws(() => f.loadCourseCriteria());
      writeFileSync(
        registryFile,
        registryText.replace(
          '"version": 1',
          '"version": 1, "ver\\u0073ion": 1',
        ),
      );
      assert.throws(() => f.loadCourseCriteria());
      writeFileSync(registryFile, registryText);
    },
  );
  check(
    "real loader refuses unregistered or missing criteria and altered pinned artifacts",
    () => {
      const stray = join(fixture, "src/data/course-criteria/unregistered.json");
      writeFileSync(stray, "{}");
      assert.throws(() => f.loadCourseCriteria());
      rmSync(stray);
      const path = join(
          fixture,
          "src/data/course-criteria",
          bundle.criteriaRegistry.entries[0].path,
        ),
        text = readFileSync(path, "utf8");
      writeFileSync(path, text.replace('"hash": "', '"hash": "x'));
      assert.throws(() => f.loadCourseCriteria());
      rmSync(path);
      assert.throws(() => f.loadCourseCriteria());
      writeFileSync(path, text);
    },
  );
  check(
    "real loader rejects changed current chapter bytes and malformed UTF-8",
    () => {
      const path = join(fixture, criteria.sourceFiles[0].path),
        bytes = readFileSync(path);
      writeFileSync(path, Buffer.concat([bytes, Buffer.from(" changed")]));
      assert.throws(() => f.loadCourseCriteria());
      writeFileSync(path, Buffer.from([0xc3, 0x28]));
      assert.throws(() => f.loadCourseCriteria());
      writeFileSync(path, bytes);
    },
  );
  check(
    "source file and ancestor symlinks are refused without reading their targets",
    () => {
      const path = join(fixture, criteria.sourceFiles[0].path),
        held = join(temporary, "held-chapter.md");
      renameSync(path, held);
      symlinkSync(join(root, criteria.sourceFiles[0].path), path);
      assert.throws(() => f.loadCourseCriteria());
      rmSync(path);
      renameSync(held, path);
      const parent = join(fixture, "src/content/principles"),
        heldParent = parent + "-held";
      renameSync(parent, heldParent);
      symlinkSync(join(root, "src/content/principles"), parent, "dir");
      assert.throws(() => f.loadCourseCriteria());
      rmSync(parent);
      renameSync(heldParent, parent);
    },
  );
  const config = ts.readConfigFile(
    join(root, "tsconfig.json"),
    ts.sys.readFile,
  );
  assert(!config.error);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const compiler = ts.createProgram(
    [
      join(root, "src/lib/course-criteria.ts"),
      join(root, "node_modules/astro/client.d.ts"),
    ],
    { ...parsed.options, strict: true, noEmit: true },
  );
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(compiler)];
  for (const d of diagnostics)
    console.log(
      (d.file?.fileName ?? "tsconfig") +
        ": " +
        ts.flattenDiagnosticMessageText(d.messageText, " "),
    );
  assert.equal(
    diagnostics.length,
    0,
    "Actual server criteria and transitive model must pass strict TypeScript",
  );
  groups++;
  console.log(
    `Course criteria: ${groups} real artifact/current-source/loader groups passed; strict types 0 diagnostics. No learner, independent review or accreditation is seeded.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
