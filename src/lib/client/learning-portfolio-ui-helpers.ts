import {
  LEARNING_LIMITS,
  canonicalLearningJson,
  validateCourseProgress,
  type CourseCriteria,
  type CourseEvaluation,
  type CourseRawForm,
  type CourseState,
  type CriteriaRegistry,
  type LearningDraft,
} from "./learning-portfolio-model";

export interface LearningMountProps {
  criteriaRegistry: CriteriaRegistry;
  currentCriteria: CourseCriteria;
  knownCriteria: readonly CourseCriteria[];
  mode: "course" | "completion";
  base: string;
}
export function rawCourse(input: CourseState): CourseRawForm {
  return {
    name: input.name,
    capstone: input.capstone,
    completedAt: input.completedAt,
    lessons: input.lessons.map((lesson) => ({
      read: lesson.read,
      practice: lesson.practice,
      answers: [String(lesson.answers[0]), String(lesson.answers[1])],
    })),
  };
}
/** Ordinary study saves cannot change the declared day. Its raw editor remains separately recoverable. */
export function courseFromRaw(
  raw: CourseRawForm,
  currentDay: string,
): CourseState {
  return validateCourseProgress({
    version: 1,
    name: raw.name,
    capstone: raw.capstone,
    completedAt: currentDay,
    lessons: raw.lessons.map((lesson) => ({
      read: lesson.read,
      practice: lesson.practice,
      answers: lesson.answers.map((answer) => {
        if (!/^(?:-1|0|1|2)$/.test(answer))
          throw Error(
            "An unfinished answer needs repair. Choose Unanswered or one of the three listed choices.",
          );
        return Number(answer);
      }),
    })),
  });
}
export const learningSame = (a: unknown, b: unknown) =>
  canonicalLearningJson(a) === canonicalLearningJson(b);
export const rawMatchesCourse = (raw: CourseRawForm, input: CourseState) =>
  learningSame(raw, rawCourse(input));
export const learningCompletionLabel = (evaluation: CourseEvaluation) =>
  evaluation.complete
    ? "Self-recorded completion of these checks"
    : "Incomplete self-recorded study";
export function learningRawRecovery(draft: LearningDraft): string {
  return (
    "Charitology learning portfolio — unfinished raw form recovery\nThis plain recovery text is NOT a validated portfolio backup. It contains private unfinished course text, declared-day text and original bindings. It supplies no capture authority, accreditation or independent assessment.\n\n" +
    JSON.stringify(draft, null, 2) +
    "\n"
  );
}
export async function readLearningFile(
  file: File,
  limit: number = LEARNING_LIMITS.courseBytes,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit)
    throw Error(
      `Choose a file no larger than ${limit.toLocaleString()} bytes. Nothing was replaced.`,
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bytes = await Promise.race([
      file.arrayBuffer(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "The file could not be read within 30 seconds. Choose a fresh local copy. Nothing was replaced.",
              ),
            ),
          30_000,
        );
      }),
    ]);
    if (bytes.byteLength > limit)
      throw Error(
        "The selected file exceeds the allowed byte bound. Nothing was replaced.",
      );
    return new Uint8Array(bytes).slice();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Blob(string) replaces lone UTF-16 surrogates. JSON quoting preserves every saved code unit. */
export function learningSavedTextRecovery(
  raw: string,
  workspace: string,
): string {
  return (
    JSON.stringify(
      {
        format: "charitology-saved-text-recovery",
        version: 1,
        workspace,
        notice:
          "Raw JavaScript storage text, not a validated workspace backup. Extract the raw string exactly for specialist recovery; JSON quoting preserves malformed UTF-16.",
        raw,
      },
      null,
      2,
    ) + "\n"
  );
}

/** Safe inert JSON preserves the exact criteria text after JSON.parse, even closing script text. */
export function learningMountJson(props: LearningMountProps): string {
  return JSON.stringify(props)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
