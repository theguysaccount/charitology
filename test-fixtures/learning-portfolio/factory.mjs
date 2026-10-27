// Excluded fictional self-study fixtures. No real learner, syllabus edition or assessment.
import { createHash } from "node:crypto";
export const at = "2026-10-27T12:00:00.000Z";
const rawHash = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const seq = new WeakMap();
export function criteria(m, edition = 1) {
  const sourceFiles = m.LEARNING_CHAPTER_IDS.map((id, i) => ({
    path: `src/content/principles/${id}.md`,
    rawText: `# FICTIONAL EXCLUDED CRITERIA ${edition}\nSynthetic chapter ${i + 1}; no public review or learner.\n`,
    rawHash: "",
  }));
  for (const s of sourceFiles) s.rawHash = rawHash(s.rawText);
  const body = {
    format: "charitology-course-criteria",
    version: 1,
    id: `fictional-criteria-${edition}`,
    sourceCommit: String(edition).repeat(40),
    sourceFiles,
    units: sourceFiles.map((s, i) => ({
      id: m.LEARNING_CHAPTER_IDS[i],
      chapter: i + 1,
      chapterPath: s.path,
      chapterHash: s.rawHash,
      takeaway: "Fictional system-oriented exercise.",
      exercise:
        "Write hypothetical reasoning, not private beneficiary information.",
      worked: "A synthetic example with explicit unknowns.",
      questions: [0, 1].map((q) => ({
        prompt: `Fictional question ${i + 1}.${q + 1}`,
        options: ["Choice zero", "Choice one", "Choice two"],
        correct: edition === 2 && i === 0 && q === 0 ? 1 : 0,
        explanation: "Public fictional answer explanation.",
      })),
    })),
    capstoneInstructions: "Fictional capstone; self-recorded only.",
    rules: {
      readRequired: true,
      practiceMin: edition === 2 ? 45 : 30,
      capstoneMin: 200,
      nameMax: 120,
      practiceMax: 5000,
      capstoneMax: 12000,
      stringLength: "javascript-utf16",
    },
    limitations: "self-study-v1",
  };
  return { ...body, hash: m.hashLearningSync(body) };
}
export const known = (m) => [criteria(m, 1), criteria(m, 2)];
export function progress(m, c = criteria(m), complete = true) {
  const s = m.learningClone(m.emptyCourseProgress());
  s.name = "Fictional learner code";
  s.capstone = complete
    ? "Hypothetical decision, alternative, causal chain, evidence limitations, moral lenses, community voice, counterfactual and follow-up. ".repeat(
        3,
      )
    : "";
  s.lessons = c.units.map((u) => ({
    read: complete,
    practice: complete
      ? "Fictional practice with reasons and explicit uncertainty."
      : "",
    answers: u.questions.map((q) => (complete ? q.correct : -1)),
  }));
  return s;
}
export function source(input, { saved = false, file = false } = {}) {
  return {
    input,
    origin: {
      kind: file ? "course-file" : "course-memory",
      persistence: file ? "selected-file" : saved ? "saved" : "unsaved-memory",
      rawHash: file || saved ? rawHash(JSON.stringify(input)) : null,
      fileName: file ? "fictional-course.json" : null,
      declaredCompletedAt: input.completedAt,
      historicalCriteria: "unknown",
    },
  };
}
export async function context(m, state, definitions = known(m), digest) {
  return {
    expectedStateHash: await m.learningPortfolioStateHash(state),
    expectedRevision: state.revision,
    at,
    makeId: () => {
      const n = (seq.get(m) ?? 0) + 1;
      seq.set(m, n);
      return `fictional-record-${n}`;
    },
    knownCriteria: definitions,
    ...(digest ? { digest } : {}),
  };
}
export async function command(m, state, cmd, definitions = known(m), digest) {
  return (
    await m.prepareLearningCommand(
      state,
      cmd,
      await context(m, state, definitions, digest),
    )
  ).candidate;
}
export async function withPortfolio(m, { complete = true, edition = 1 } = {}) {
  const c = criteria(m, edition);
  return command(m, m.blankLearningPortfolio("fictional-workspace", at), {
    kind: "record.capture",
    criteriaId: c.id,
    criteriaHash: c.hash,
    source: source(progress(m, c, complete)),
    criteriaAffirmed: true,
  });
}
const cache = new WeakMap();
export async function exactBoundaryState(m) {
  if (cache.has(m)) return m.learningClone(cache.get(m));
  const c = criteria(m);
  let state = m.blankLearningPortfolio("fictional-boundary", at);
  const max = {
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
  for (let i = 0; i < 5; i++)
    state = await command(m, state, {
      kind: "record.capture",
      criteriaId: c.id,
      criteriaHash: c.hash,
      source: source(max),
      criteriaAffirmed: true,
    });
  state = m.learningClone(state);
  state.revision++;
  state.draft = {
    tab: "course",
    recordId: null,
    dirty: true,
    form: {
      kind: "course",
      targetId: null,
      binding: {},
      fields: {},
      course: {
        name: "",
        capstone: "",
        completedAt: "",
        lessons: Array.from({ length: 10 }, () => ({
          read: false,
          practice: "",
          answers: ["", ""],
        })),
      },
    },
  };
  const size = () =>
    Buffer.byteLength(
      JSON.stringify(
        {
          format: "charitology-learning-portfolio-backup",
          version: 1,
          exportedAt: at,
          state,
          checksum: "0".repeat(64),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  const target = m.LEARNING_LIMITS.backupBytes;
  for (const l of state.draft.form.course.lessons) {
    const remaining = target - size();
    if (remaining <= 16000) break;
    const count = Math.min(16000, Math.floor((remaining - 8192) / 6));
    if (count > 0) l.practice = "\u0000".repeat(count);
  }
  const remaining = target - size();
  if (remaining < 0 || remaining >= m.LEARNING_LIMITS.draftFieldChars)
    throw Error(`Boundary fixture padding ${remaining} invalid`);
  state.draft.form.course.capstone = "x".repeat(remaining);
  if (size() !== target) throw Error("Boundary fixture byte count mismatch");
  m.validateLearningPortfolio(state, known(m));
  const text = await m.makeLearningBackup(state, at, known(m));
  if (Buffer.byteLength(text) !== target)
    throw Error("Actual future backup is not exactly2MiB");
  cache.set(m, state);
  return m.learningClone(state);
}
