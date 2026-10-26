import { courseLessons } from "../../data/program-course";
import { load, save } from "./store";
export const COURSE_KEY = "principles-course-v1";
export type CourseState = {
  version: 1;
  name: string;
  capstone: string;
  completedAt: string;
  lessons: { read: boolean; practice: string; answers: number[] }[];
};
export const emptyCourse = (): CourseState => ({
  version: 1,
  name: "",
  capstone: "",
  completedAt: "",
  lessons: courseLessons.map(() => ({
    read: false,
    practice: "",
    answers: [-1, -1],
  })),
});
export function validCourse(value: unknown): CourseState {
  const s = value as CourseState;
  if (
    !s ||
    s.version !== 1 ||
    typeof s.name !== "string" ||
    s.name.length > 120 ||
    typeof s.capstone !== "string" ||
    s.capstone.length > 12000 ||
    typeof s.completedAt !== "string" ||
    (s.completedAt &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(s.completedAt) ||
        !Number.isFinite(Date.parse(s.completedAt)) ||
        new Date(`${s.completedAt}T12:00:00Z`).toISOString().slice(0, 10) !==
          s.completedAt)) ||
    !Array.isArray(s.lessons) ||
    s.lessons.length !== 10
  )
    throw new Error("Choose a version 1 Principles course export.");
  for (const lesson of s.lessons)
    if (
      !lesson ||
      typeof lesson.read !== "boolean" ||
      typeof lesson.practice !== "string" ||
      lesson.practice.length > 5000 ||
      !Array.isArray(lesson.answers) ||
      lesson.answers.length !== 2 ||
      lesson.answers.some((n) => !Number.isInteger(n) || n < -1 || n > 2)
    )
      throw new Error("A lesson record is invalid. Nothing was imported.");
  return {
    version: 1,
    name: s.name,
    capstone: s.capstone,
    completedAt: s.completedAt,
    lessons: s.lessons.map((l) => ({
      read: l.read,
      practice: l.practice,
      answers: [...l.answers],
    })),
  };
}
export const lessonPassed = (state: CourseState, index: number) =>
  state.lessons[index].read &&
  state.lessons[index].practice.trim().length >= 30 &&
  courseLessons[index].questions.every(
    (q, i) => state.lessons[index].answers[i] === q.correct,
  );
export const completedLessons = (s: CourseState) =>
  courseLessons.filter((_, i) => lessonPassed(s, i)).length;
export const coursePassed = (s: CourseState) =>
  completedLessons(s) === 10 && s.capstone.trim().length >= 200;
export function readCourse(): CourseState {
  try {
    return validCourse(load(COURSE_KEY, emptyCourse()));
  } catch {
    return emptyCourse();
  }
}
export const writeCourse = (state: CourseState) => save(COURSE_KEY, state);
