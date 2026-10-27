import {
  LEARNING_LIMITS,
  LEARNING_FORM_NAMES,
  blankLearningPortfolio,
  emptyCourseProgress,
  evaluateCourseProgress,
  learningCommandForm,
  learningFormMatchesCommand,
  learningRecordView,
  makeCourseProgressExport,
  makeLearningBackup,
  makeLearningPacket,
  prepareLearningCommand,
  strictLearningJson,
  validateCourseCriteria,
  type CourseEvaluation,
  type CourseRawForm,
  type CourseState,
  type LearningCommand,
  type LearningDraft,
  type LearningPacketPurpose,
  type LearningPortfolioState,
  type LearningRecord,
} from "./learning-portfolio-model";
import {
  COURSE_PROGRESS_STORAGE_KEY,
  createCourseProgressStore,
  type CourseMutationBinding,
  type CourseStoreSnapshot,
  type CourseRestorePreview,
  type CourseClearPreview,
} from "./course-progress-store";
import {
  LEARNING_PORTFOLIO_STORAGE_KEY,
  createLearningPortfolioStore,
  type CaptureIntent,
  type CaptureCommitOptions,
  type LearningStoreSnapshot,
  type LiveCourseCapturePreview,
  type FileCourseCapturePreview,
  type LearningRestorePreview,
  type LearningClearPreview,
} from "./learning-portfolio-store";
import {
  courseFromRaw,
  learningCompletionLabel,
  learningRawRecovery,
  learningSame,
  learningSavedTextRecovery,
  rawCourse,
  rawMatchesCourse,
  readLearningFile,
  type LearningMountProps,
} from "./learning-portfolio-ui-helpers";
import { download } from "./files";

type Form = NonNullable<LearningDraft["form"]>;
type Capture = LiveCourseCapturePreview | FileCourseCapturePreview;
type Tab = LearningDraft["tab"];
type ButtonScope =
  "course" | "portfolio" | "course-recovery" | "portfolio-recovery";
const mounted = new WeakSet<HTMLElement>();
const clone = <T>(value: T): T => structuredClone(value);
const clock = () => new Date().toISOString();
const makeId = () => crypto.randomUUID();
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const note = (text: string, className = "lp-note") => el("p", text, className);
const labels: Record<Tab, string> = {
  course: "Course",
  portfolio: "Portfolio",
  criteria: "Criteria",
  exports: "Exports",
  recovery: "Recovery",
};
const limitations =
  "Self-study with public answers. Identity, reasoning and competence are not independently assessed. Nonaccredited; no professional credential, admission or permission to rate charities.";

export async function mountLearningPortfolio(root: HTMLElement): Promise<void> {
  if (mounted.has(root)) return;
  mounted.add(root);
  const host = root.querySelector<HTMLElement>(".learning-portfolio-mount");
  const config = root.querySelector<HTMLScriptElement>(
    ".learning-portfolio-config",
  );
  if (!host || !config)
    throw Error("The learning portfolio configuration is missing.");
  const props = strictLearningJson(
    config.textContent ?? "",
    LEARNING_LIMITS.backupBytes,
  ) as LearningMountProps;
  if (
    !props ||
    !Array.isArray(props.knownCriteria) ||
    props.knownCriteria.length < 1 ||
    props.knownCriteria.length > LEARNING_LIMITS.criteria ||
    !["course", "completion"].includes(props.mode) ||
    typeof props.base !== "string" ||
    !props.base.startsWith("/") ||
    props.base.startsWith("//") ||
    /[?#\\]/.test(props.base)
  )
    throw Error("Choose the published learning configuration.");
  const known = props.knownCriteria.map((criteria) =>
    validateCourseCriteria(criteria, props.knownCriteria),
  );
  const current = validateCourseCriteria(props.currentCriteria, known);
  if (
    props.criteriaRegistry.currentId !== current.id ||
    !props.criteriaRegistry.entries.some(
      (entry) => entry.id === current.id && entry.hash === current.hash,
    )
  )
    throw Error("The current criteria registry does not match this course.");
  const [course, portfolio] = await Promise.all([
    createCourseProgressStore({ initialState: emptyCourseProgress() }),
    createLearningPortfolioStore({
      initialState: blankLearningPortfolio(makeId(), clock()),
      knownCriteria: known,
    }),
  ]);
  let cs = course.snapshot(),
    ps = portfolio.snapshot();
  let raw: CourseRawForm | null = cs.state ? rawCourse(cs.state) : null;
  let courseBinding: CourseMutationBinding | null = cs.hash
    ? { expectedGeneration: cs.generation, expectedStateHash: cs.hash }
    : null;
  let form: LearningDraft["form"] = clone(ps.state?.draft.form ?? null);
  let tab: Tab =
    props.mode === "completion"
      ? "portfolio"
      : (ps.state?.draft.tab ?? "course");
  let recordId: string | null = ps.state?.draft.recordId ?? null;
  let criteriaId = current.id,
    targetId = "";
  let epoch = 0,
    courseEpoch = 0,
    fileEpoch = 0,
    busy = false,
    committing = false;
  let status: HTMLElement,
    message = "",
    isError = false,
    buttons: HTMLButtonElement[] = [],
    editors: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] =
      [];
  let pendingFocus: HTMLElement | null = null;
  let preview: Capture | null = null,
    previewEpoch = -1,
    affirmed = false,
    amendmentReason = "";
  let sourceBytes: Uint8Array | null = null,
    reviewedFileBytes: Uint8Array | null = null,
    sourceName = "",
    filePending = false;
  let courseRestore: CourseRestorePreview | null = null,
    courseClear: CourseClearPreview | null = null,
    portfolioRestore: LearningRestorePreview | null = null,
    portfolioClear: LearningClearPreview | null = null;
  let courseRecoveryEpoch = -1,
    portfolioRecoveryEpoch = -1;
  let courseRecoveryBytes: Uint8Array | null = null,
    portfolioRecoveryBytes: Uint8Array | null = null;
  let confirmation: {
    message: string;
    epoch: number;
    run: () => void | Promise<void>;
  } | null = null;
  let packet: Awaited<ReturnType<typeof makeLearningPacket>> | null = null,
    packetGeneration = 0,
    packetHash: string | null = null;
  let purpose: LearningPacketPurpose = "personal-study";
  let printRecord: LearningRecord | null = null;

  const portfolioState = (): LearningPortfolioState => {
    if (!ps.state)
      throw Error(
        "No validated portfolio is available. Preserve raw bytes and use Recovery.",
      );
    return ps.state;
  };
  const courseState = (): CourseState => {
    if (!cs.state)
      throw Error(
        "No validated course progress is available. Preserve raw bytes and use Recovery.",
      );
    return cs.state;
  };
  const courseDirty = () =>
    !!raw && (!cs.state || !rawMatchesCourse(raw, cs.state));
  const hasWork = () =>
    courseDirty() ||
    !!form ||
    cs.unsaved ||
    ps.unsaved ||
    !!ps.state?.draft.dirty ||
    filePending ||
    !!courseRecoveryBytes ||
    !!portfolioRecoveryBytes;
  const draft = (): LearningDraft => ({
    tab,
    recordId,
    form: clone(form),
    dirty: !!form,
  });
  function invalidate() {
    epoch++;
    preview = null;
    affirmed = false;
    packet = null;
    packetGeneration++;
    courseRestore = null;
    courseClear = null;
    portfolioRestore = null;
    portfolioClear = null;
  }
  function courseTouch() {
    courseEpoch++;
    invalidate();
    paint();
  }
  function say(text: string, error = false) {
    message = text;
    isError = error;
    paint();
  }
  function can(scope: ButtonScope) {
    return scope === "course"
      ? cs.canWrite
      : scope === "portfolio"
        ? ps.canWrite
        : scope === "course-recovery"
          ? cs.canRecover
          : ps.canRecover;
  }
  function paint() {
    if (!status) return;
    status.textContent = busy
      ? "Working…"
      : message ||
        (hasWork()
          ? "Unfinished work remains in this tab. Preserve raw recovery before leaving."
          : "Browser copies ready.");
    status.className = `lp-status${isError ? " lp-error" : ""}`;
    status.setAttribute("role", isError ? "alert" : "status");
    for (const button of buttons)
      button.disabled =
        busy ||
        (!!button.dataset.scope && !can(button.dataset.scope as ButtonScope)) ||
        button.dataset.fixedDisabled === "true";
    for (const editor of editors)
      editor.disabled = committing || editor.dataset.fixedDisabled === "true";
  }
  async function action(run: () => void | Promise<void>) {
    if (busy) return;
    busy = true;
    paint();
    try {
      await run();
    } catch (error) {
      cs = course.snapshot();
      ps = portfolio.snapshot();
      say(
        error instanceof Error
          ? error.message
          : "The action could not finish. Current work is retained.",
        true,
      );
      render();
    } finally {
      busy = false;
      committing = false;
      paint();
      if (pendingFocus?.isConnected) pendingFocus.focus();
      pendingFocus = null;
    }
  }
  function button(
    label: string,
    run: () => void | Promise<void>,
    scope?: ButtonScope,
    primary = false,
  ) {
    const button = el(
      "button",
      label,
      `lp-button${primary ? " lp-primary" : ""}`,
    );
    button.type = "button";
    if (scope) button.dataset.scope = scope;
    buttons.push(button);
    button.addEventListener("click", () => void action(run));
    return button;
  }
  function field(
    parent: HTMLElement,
    label: string,
    value: string,
    change: (value: string) => void,
    options: { long?: boolean; max?: number; touch?: boolean } = {},
  ) {
    const wrap = el("label", undefined, "lp-field");
    wrap.append(el("span", label));
    const input = options.long ? el("textarea") : el("input");
    input.value = value;
    input.maxLength = options.max ?? LEARNING_LIMITS.draftFieldChars;
    input.setAttribute("aria-label", label);
    editors.push(input);
    input.addEventListener("input", () => {
      change(input.value);
      if (options.touch !== false) invalidate();
      paint();
    });
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function select(
    parent: HTMLElement,
    label: string,
    value: string,
    options: [string, string][],
    change: (value: string) => void,
  ) {
    const wrap = el("label", undefined, "lp-field");
    wrap.append(el("span", label));
    const input = el("select");
    input.setAttribute("aria-label", label);
    for (const [key, text] of options) {
      const option = el("option", text);
      option.value = key;
      input.append(option);
    }
    input.value = value;
    editors.push(input);
    input.addEventListener("change", () => change(input.value));
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function check(
    parent: HTMLElement,
    label: string,
    value: boolean,
    change: (value: boolean) => void,
  ) {
    const wrap = el("label", undefined, "lp-check"),
      input = el("input");
    input.type = "checkbox";
    input.checked = value;
    input.setAttribute("aria-label", label);
    editors.push(input);
    input.addEventListener("change", () => change(input.checked));
    wrap.append(input, el("span", label));
    parent.append(wrap);
    return input;
  }
  function details(
    parent: HTMLElement,
    title: string,
    draw: (body: HTMLElement) => void,
  ) {
    const d = el("details"),
      body = el("div");
    d.append(el("summary", title), body);
    draw(body);
    parent.append(d);
    return d;
  }
  function facts(parent: HTMLElement, entries: [string, string][]) {
    const dl = el("dl");
    for (const [label, value] of entries)
      dl.append(
        el("dt", label),
        el("dd", value === "" ? "Unknown / not supplied" : value),
      );
    parent.append(dl);
  }
  function confirm(message: string, run: () => void | Promise<void>) {
    confirmation = { message, epoch, run };
    render();
  }
  function clearCaptureFile() {
    sourceBytes = null;
    reviewedFileBytes = null;
    sourceName = "";
    filePending = false;
    fileEpoch++;
    preview = null;
    affirmed = false;
  }
  function currentIntent(): CaptureIntent {
    const criteria = known.find((c) => c.id === criteriaId);
    if (!criteria) throw Error("Choose a known criteria edition.");
    const target = targetId
      ? portfolioState().records.find((r) => r.id === targetId)
      : null;
    if (targetId && !target)
      throw Error("The chosen amendment target is unavailable.");
    return {
      criteriaId: criteria.id,
      criteriaHash: criteria.hash,
      target: target ? { recordId: target.id, recordHash: target.hash } : null,
    };
  }
  async function savePortfolioDraft(next: LearningDraft) {
    const before = portfolio.snapshot();
    if (!before.state || !before.hash)
      throw Error(
        "No validated portfolio is available for a raw draft. Download plain recovery text instead.",
      );
    const version = epoch,
      prepared = await prepareLearningCommand(
        before.state,
        { kind: "draft.replace", draft: next },
        {
          expectedStateHash: before.hash,
          expectedRevision: before.state.revision,
          at: clock(),
          makeId,
          knownCriteria: known,
        },
      );
    ps = await portfolio.commitPrepared(prepared);
    preview = null;
    affirmed = false;
    packet = null;
    packetGeneration++;
    if (epoch === version && !prepared.noOp)
      form = clone(ps.state?.draft.form ?? null);
    say(
      prepared.noOp
        ? "This exact raw draft is already present. Uncommitted file and newer editor choices remain."
        : ps.unsaved
          ? "The valid raw draft exists only in memory. Saved bytes are unchanged; export or retry saving."
          : "The unfinished raw form was saved. It is recovery text, not capture authority.",
    );
  }
  function render() {
    const active = document.activeElement as HTMLElement | null;
    let cursor: Node | null = active,
      inside = false;
    while (cursor) {
      if (cursor === root) {
        inside = true;
        break;
      }
      cursor = cursor.parentNode;
    }
    const label = inside ? active?.getAttribute("aria-label") : null,
      buttonText =
        inside && active?.tagName === "BUTTON" ? active.textContent : null;
    buttons = [];
    editors = [];
    host!.replaceChildren();
    const wrap = el("div", undefined, "lp-workspace");
    host!.append(wrap);
    status = el("p", undefined, "lp-status");
    status.setAttribute("aria-live", "polite");
    wrap.append(status);
    if (cs.message) wrap.append(note(`Course: ${cs.message}`, "lp-warning"));
    if (ps.message) wrap.append(note(`Portfolio: ${ps.message}`, "lp-warning"));
    if (cs.state) {
      const evaluation = evaluateCourseProgress(cs.state, current);
      wrap.append(
        note(
          `Current validated course: ${evaluation.unitsComplete} / 10 units pass these checks · capstone ${evaluation.capstoneSufficient ? "meets" : "does not meet"} the length check. ${cs.unsaved ? "Memory only; not saved." : ""}`,
        ),
      );
    } else
      wrap.append(
        note(
          "No validated course progress is available. No blank progress or completion count has been substituted.",
          "lp-warning",
        ),
      );
    if (ps.state)
      wrap.append(
        note(
          `${ps.state.records.length} immutable self-recorded portfolio records. No independent assessment is recorded.`,
        ),
      );
    else
      wrap.append(
        note(
          "No validated portfolio is available. Protected saved bytes remain recoverable.",
          "lp-warning",
        ),
      );
    const nav = el("nav", undefined, "lp-tabs");
    nav.setAttribute("aria-label", "Learning views");
    for (const [key, title] of Object.entries(labels)) {
      const b = button(title, () => {
        epoch++;
        tab = key as Tab;
        render();
      });
      if (tab === key) b.setAttribute("aria-current", "page");
      nav.append(b);
    }
    wrap.append(nav);
    if (confirmation) {
      const review = confirmation,
        box = el("div", undefined, "lp-warning");
      box.append(
        note(review.message),
        button("Continue with reviewed action", async () => {
          if (review.epoch !== epoch)
            throw Error(
              "Unfinished input changed after this review. Review the action again.",
            );
          confirmation = null;
          await review.run();
        }),
        button("Keep current work", () => {
          confirmation = null;
          render();
        }),
      );
      wrap.append(box);
    }
    if (tab === "course") renderCourse(wrap);
    if (tab === "portfolio") renderPortfolio(wrap);
    if (tab === "criteria") renderCriteria(wrap);
    if (tab === "exports") renderExports(wrap);
    if (tab === "recovery") renderRecovery(wrap);
    renderRaw(wrap);
    renderPrint(wrap);
    paint();
    if (label) {
      const next = [
        ...host!.querySelectorAll<HTMLElement>("input,select,textarea"),
      ].find((n) => n.getAttribute("aria-label") === label);
      next?.focus();
    } else if (buttonText) {
      const next = buttons.find(
        (b) =>
          b.textContent === buttonText && b.dataset.fixedDisabled !== "true",
      );
      if (next) {
        if (busy) pendingFocus = next;
        else next.focus();
      }
    }
  }

  function renderCourse(parent: HTMLElement) {
    parent.append(
      el("h3", "Current course editor"),
      note(
        `These checks use criteria ${current.id}. Legacy progress has no historical criteria binding. This is a present evaluation of the saved answers, not proof of which edition you studied before.`,
      ),
    );
    if (!raw || !cs.state) return;
    if (
      !courseBinding ||
      courseBinding.expectedGeneration !== cs.generation ||
      courseBinding.expectedStateHash !== cs.hash
    )
      parent.append(
        note(
          "The visible raw editor is not bound to the current validated memory. Review rebinding explicitly before saving it. Its original raw text remains recoverable.",
          "lp-warning",
        ),
        button(
          "Review rebinding current raw study form",
          () => {
            const version = courseEpoch;
            confirm(
              "Bind these exact visible raw fields to the current validated course memory for a later deliberate save? This does not itself save, validate or change the declared day. Preserve raw recovery first.",
              () => {
                if (courseEpoch !== version)
                  throw Error(
                    "The visible editor changed; review binding again.",
                  );
                courseBinding = cs.hash
                  ? {
                      expectedGeneration: cs.generation,
                      expectedStateHash: cs.hash,
                    }
                  : null;
                invalidate();
                render();
              },
            );
          },
          "course",
        ),
      );
    if (courseDirty())
      parent.append(
        note(
          "The visible course fields differ from validated course memory. Portfolio capture will not silently save them.",
          "lp-warning",
        ),
      );
    for (const [index, unit] of current.units.entries()) {
      const panel = el("details");
      panel.open = index === 0;
      panel.append(
        el(
          "summary",
          `${unit.chapter}. ${unit.id.replace(/^\d+-/, "").replaceAll("-", " ")}`,
        ),
      );
      const body = el("div");
      body.append(note(unit.takeaway));
      const readLink = el(
        "a",
        props.mode === "course"
          ? "Read the full current chapter below"
          : "Open the current full chapter",
      );
      readLink.href =
        props.mode === "course"
          ? `#lp-reading-${unit.id}`
          : `${props.base.replace(/\/$/, "")}/record/principles/${unit.id}/`;
      body.append(readLink);
      check(
        body,
        `I have read chapter ${unit.chapter}`,
        raw.lessons[index].read,
        (value) => {
          raw!.lessons[index].read = value;
          courseTouch();
        },
      );
      field(
        body,
        `Practice ${unit.chapter}: ${unit.exercise}`,
        raw.lessons[index].practice,
        (value) => {
          raw!.lessons[index].practice = value;
          courseEpoch++;
        },
        { long: true, max: current.rules.practiceMax },
      );
      body.append(
        note(
          `At least ${current.rules.practiceMin} trimmed JavaScript characters to pass this local check; at most ${current.rules.practiceMax} to save. Length does not judge reasoning.`,
        ),
      );
      details(body, `Worked example ${unit.chapter}`, (box) =>
        box.append(note(unit.worked)),
      );
      for (const [qi, q] of unit.questions.entries()) {
        const fs = el("fieldset");
        fs.append(el("legend", q.prompt));
        select(
          fs,
          `Chapter ${unit.chapter}, question ${qi + 1}`,
          raw.lessons[index].answers[qi],
          [
            ["-1", "Unanswered"],
            ...q.options.map(
              (text, i) => [String(i), text] as [string, string],
            ),
          ],
          (value) => {
            raw!.lessons[index].answers[qi] = value;
            courseTouch();
          },
        );
        details(fs, `Answer and explanation ${unit.chapter}.${qi + 1}`, (box) =>
          box.append(
            note(`Correct answer: ${q.options[q.correct]}`),
            note(q.explanation),
          ),
        );
        body.append(fs);
      }
      body.append(
        button(
          `Check and save unit ${unit.chapter}`,
          async () => {
            const baseline = courseState(),
              only = rawCourse(baseline);
            only.lessons[index] = clone(raw!.lessons[index]);
            await saveCourse(courseFromRaw(only, baseline.completedAt), index);
          },
          "course",
        ),
      );
      const evaluation = evaluateCourseProgress(cs.state, current).units[index];
      body.append(
        note(
          `Validated memory: ${evaluation.passed ? "all unit checks pass" : "unit incomplete"}; answers ${evaluation.answers.join(", ")}.`,
        ),
      );
      panel.append(body);
      parent.append(panel);
    }
    parent.append(
      el("h4", "Your capstone decision"),
      note(current.capstoneInstructions),
    );
    field(
      parent,
      "Name on your self-study record (optional)",
      raw.name,
      (value) => {
        raw!.name = value;
        courseEpoch++;
      },
      { max: current.rules.nameMax },
    );
    field(
      parent,
      "Capstone decision and reasoning",
      raw.capstone,
      (value) => {
        raw!.capstone = value;
        courseEpoch++;
      },
      { long: true, max: current.rules.capstoneMax },
    );
    parent.append(
      note(
        `At least ${current.rules.capstoneMin} trimmed JavaScript characters to pass this local check; nobody independently assesses this text here.`,
      ),
      button(
        "Save all current study edits",
        async () => {
          await saveCourse(courseFromRaw(raw!, courseState().completedAt));
        },
        "course",
        true,
      ),
    );
    field(
      parent,
      "Self-reported completion day (YYYY-MM-DD or blank)",
      raw.completedAt,
      (value) => {
        raw!.completedAt = value;
        courseEpoch++;
      },
    );
    parent.append(
      note(
        `Validated declared day: ${cs.state.completedAt || "Unknown / not supplied"}. Saving units or capstone does not change this date. A supplied day is not independent evidence of completion.`,
      ),
      button(
        "Review declared-day change",
        () => {
          const day = raw!.completedAt,
            version = courseEpoch;
          confirm(
            `Record ${day || "an unknown day"} as your self-reported source day? This changes only the day field; it does not pass any course check.`,
            async () => {
              if (courseEpoch !== version)
                throw Error("The day input changed. Review it again.");
              const binding = requiredCourseBinding();
              const prepared = await course.prepareCompletionDay(day, binding);
              const result = await course.commitPrepared(prepared);
              cs = result;
              if (courseEpoch === version) {
                courseBinding = cs.hash
                  ? {
                      expectedGeneration: cs.generation,
                      expectedStateHash: cs.hash,
                    }
                  : null;
                raw!.completedAt = cs.state!.completedAt;
              }
              invalidate();
              say(
                result.unsaved
                  ? "The declared day changed only in memory; saved bytes are unchanged."
                  : "The self-reported day was saved. No completion check or assessment was added.",
              );
              render();
            },
          );
        },
        "course",
      ),
    );
    parent.append(
      button(
        "Keep unfinished course form in portfolio",
        () => {
          const next: Form = {
            kind: "course",
            targetId: null,
            binding: {
              sourceInputHash: courseBinding?.expectedStateHash ?? "",
              sourceGeneration: String(courseBinding?.expectedGeneration ?? ""),
            },
            fields: {},
            course: clone(raw),
          };
          const save = async () => {
            form = next;
            await savePortfolioDraft(draft());
            render();
          };
          if (form && !learningSame(form, next))
            confirm(
              "Replace the portfolio’s currently open unfinished form with this exact course raw form? Both are private; download raw recovery first if needed.",
              save,
            );
          else return save();
        },
        "portfolio",
      ),
    );
    parent.append(
      button(
        "Preview validated course in portfolio",
        async () => {
          tab = "portfolio";
          await previewLive();
          render();
        },
        "portfolio",
      ),
    );
  }
  function requiredCourseBinding(): CourseMutationBinding {
    if (!courseBinding)
      throw Error(
        "The course form has no valid source binding. Reload explicitly before saving.",
      );
    return { ...courseBinding };
  }
  async function saveCourse(candidate: CourseState, unit?: number) {
    const version = courseEpoch,
      previous = cs.state,
      prepared = await course.prepareReplace(
        candidate,
        requiredCourseBinding(),
      );
    const result = await course.commitPrepared(prepared);
    cs = result;
    if (courseEpoch === version && raw && cs.state) {
      courseBinding = cs.hash
        ? { expectedGeneration: cs.generation, expectedStateHash: cs.hash }
        : null;
      if (unit === undefined) {
        const pendingDay = raw.completedAt;
        raw = rawCourse(cs.state);
        raw.completedAt = pendingDay;
      } else raw.lessons[unit] = rawCourse(cs.state).lessons[unit];
    }
    if (previous !== cs.state) {
      preview = null;
      affirmed = false;
      epoch++;
    }
    say(
      result.unsaved
        ? "The valid study edits exist only in memory. Saved progress is unchanged; export or retry saving."
        : prepared.noOp
          ? "These exact study edits are already present. Newer or unrelated raw fields remain."
          : "Study edits saved. Completion and reasoning remain self-recorded.",
    );
    render();
  }

  function renderPortfolio(parent: HTMLElement) {
    parent.append(
      el("h3", "Deliberately preserve a study record"),
      note(
        "Opening this page or passing a check creates no portfolio record. Choose the exact criteria and input; every new preview needs a fresh affirmation. Partial study is welcome and stays labeled incomplete.",
      ),
    );
    select(
      parent,
      "Criteria for present evaluation",
      criteriaId,
      known.map((c) => [
        c.id,
        c.id + (c.id === current.id ? " (current)" : " (archived)"),
      ]),
      (value) => {
        criteriaId = value;
        targetId = "";
        invalidate();
        render();
      },
    );
    if (ps.state) {
      const heads = ps.state.records.filter(
        (record) =>
          record.criteriaId === criteriaId &&
          !ps.state!.records.some((next) => next.previousId === record.id),
      );
      select(
        parent,
        "New series or amendment",
        targetId,
        [
          ["", "Start a separate series"],
          ...heads.map(
            (record) =>
              [
                record.id,
                `Amend ${record.id} · version ${record.revision}`,
              ] as [string, string],
          ),
        ],
        (value) => {
          targetId = value;
          invalidate();
          render();
        },
      );
    }
    parent.append(
      button(
        "Preview current validated course memory",
        async () => {
          await previewLive();
          render();
        },
        "portfolio",
      ),
    );
    const input = el("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.setAttribute(
      "aria-label",
      "Choose legacy course JSON for portfolio capture",
    );
    editors.push(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      invalidate();
      const generation = ++fileEpoch,
        version = epoch;
      filePending = true;
      void action(async () => {
        const bytes = await readLearningFile(file);
        if (fileEpoch !== generation || epoch !== version)
          throw Error(
            "The source choice or form changed while reading. Select the file again.",
          );
        sourceBytes = bytes;
        sourceName = file.name;
        await previewFile();
        render();
      });
    });
    parent.append(input);
    if (sourceBytes) {
      parent.append(
        note(
          `${sourceBytes.byteLength.toLocaleString()} selected file bytes · ${sourceName}. This selection does not change course progress.`,
        ),
        button(
          "Review selected course file again",
          async () => {
            await previewFile();
            render();
          },
          "portfolio",
        ),
        button("Download selected course bytes unchanged", () =>
          download(
            "charitology-course-selected-recovery.json",
            new Blob([new Uint8Array(sourceBytes!)]),
          ),
        ),
        button("Discard selected course file", () => {
          clearCaptureFile();
          say(
            "Selected bytes and their preview discarded. Unfinished raw forms remain.",
          );
          render();
        }),
      );
    }
    if (preview) renderPreview(parent, preview);
    if (!ps.state) return;
    parent.append(el("h4", "Immutable self-recorded history"));
    if (!ps.state.records.length)
      parent.append(
        note(
          "No portfolio record has been captured. The current course remains separate.",
        ),
      );
    for (const record of [...ps.state.records].reverse()) {
      const card = el("article", undefined, "lp-card");
      card.append(
        el(
          "h4",
          `${learningCompletionLabel(record.evaluation)} · version ${record.revision}`,
        ),
        note(
          `${record.id} · criteria ${record.criteriaId} · captured locally ${record.recordedAt}`,
        ),
        button("Read record " + record.id, () => {
          recordId = record.id;
          render();
        }),
      );
      parent.append(card);
    }
    if (recordId && ps.state.records.some((record) => record.id === recordId))
      renderRecord(parent, recordId);
  }
  async function installPreview(next: Capture, version: number) {
    if (epoch !== version)
      throw Error(
        "The criteria, target or form changed while preparing preview. Review it again.",
      );
    const command: LearningCommand = next.intent.target
      ? {
          kind: "record.amend",
          criteriaId: next.intent.criteriaId,
          criteriaHash: next.intent.criteriaHash,
          expectedRecordId: next.intent.target.recordId,
          expectedRecordHash: next.intent.target.recordHash,
          source: next.source,
          criteriaAffirmed: true,
          reason: amendmentReason || "Unfinished amendment reason",
        }
      : {
          kind: "record.capture",
          criteriaId: next.intent.criteriaId,
          criteriaHash: next.intent.criteriaHash,
          source: next.source,
          criteriaAffirmed: true,
        };
    const nextForm = clone(learningCommandForm(command)!);
    nextForm.fields.criteriaAffirmed = "false";
    if (next.kind === "live") {
      nextForm.binding.sourceGeneration = String(next.course.generation);
      nextForm.binding.sourceObservedRawHash =
        next.course.observedRawHash ?? "missing";
    }
    if (next.intent.target) nextForm.fields.amendmentReason = amendmentReason;
    if (
      form &&
      !learningSame(
        { ...form, fields: { ...form.fields, criteriaAffirmed: "false" } },
        nextForm,
      )
    )
      throw Error(
        "An unfinished raw portfolio form is retained. Download it, then explicitly discard or replace it before starting a different preview.",
      );
    form = nextForm;
    preview = next;
    reviewedFileBytes =
      next.kind === "file" && sourceBytes ? new Uint8Array(sourceBytes) : null;
    previewEpoch = epoch;
    affirmed = false;
    tab = "portfolio";
    say(
      "Review this exact input, criteria edition and current evaluation. The affirmation starts unchecked.",
    );
  }
  async function previewLive() {
    if (!raw || !cs.state || !rawMatchesCourse(raw, cs.state))
      throw Error(
        "Visible course fields differ from validated memory. Explicitly save/apply the study edits and declared day first, or deliberately choose a separate file. Capture does not save them.",
      );
    const version = epoch,
      next = await portfolio.previewCourseCapture(course, currentIntent());
    await installPreview(next, version);
  }
  async function previewFile() {
    if (!sourceBytes) throw Error("Choose course file bytes first.");
    const version = epoch,
      next = await portfolio.previewFileCapture(
        new Uint8Array(sourceBytes),
        sourceName,
        currentIntent(),
      );
    await installPreview(next, version);
  }
  function renderEvaluation(parent: HTMLElement, evaluation: CourseEvaluation) {
    parent.append(
      note(
        `${learningCompletionLabel(evaluation)} · ${evaluation.unitsComplete}/10 units · capstone ${evaluation.capstoneSufficient ? "sufficient for this length check" : "below this length check"}.`,
      ),
    );
    for (const [index, unit] of evaluation.units.entries())
      parent.append(
        note(
          `${index + 1}. ${unit.passed ? "Checks pass" : "Incomplete"} · reading ${unit.read ? "asserted" : "not asserted"} · ${unit.practiceCharacters} practice characters · answers ${unit.answers.join(", ")}`,
        ),
      );
  }
  function renderPreview(parent: HTMLElement, p: Capture) {
    const box = el("section", undefined, "lp-card");
    box.append(el("h4", "Exact capture preview"));
    facts(box, [
      ["Criteria", `${p.intent.criteriaId}\n${p.intent.criteriaHash}`],
      ["Input hash", p.inputHash],
      ["Origin", `${p.source.origin.kind} · ${p.source.origin.persistence}`],
      [
        "Source byte hash",
        p.source.origin.rawHash ?? "Unavailable for unsaved memory",
      ],
      [
        "Declared source day",
        p.source.input.completedAt || "Unknown / not supplied",
      ],
      ["Historical criteria binding", "Unknown; this is a present evaluation"],
      [
        "Target",
        p.intent.target
          ? `Amend ${p.intent.target.recordId}\n${p.intent.target.recordHash}`
          : "New separate series",
      ],
    ]);
    renderEvaluation(box, p.evaluation);
    details(box, "Inspect exact captured course text", (body) =>
      courseFacts(body, p.source.input),
    );
    if (p.intent.target)
      field(
        box,
        "Reason for this amendment",
        amendmentReason,
        (value) => {
          amendmentReason = value;
          if (form) form.fields.amendmentReason = value;
        },
        { long: true, max: 2000, touch: false },
      );
    check(
      box,
      "I inspected this exact criteria edition and input for this present self-recorded evaluation.",
      affirmed,
      (value) => {
        affirmed = value;
        if (form) form.fields.criteriaAffirmed = String(value);
        paint();
      },
    );
    box.append(
      note(limitations),
      button(
        "Append reviewed self-recorded record",
        async () => {
          await captureRecord(p);
          render();
        },
        "portfolio",
        true,
      ),
    );
    parent.append(box);
  }
  async function captureRecord(p: Capture) {
    if (!affirmed || preview !== p || previewEpoch !== epoch)
      throw Error(
        "Review a fresh preview and affirm the exact criteria and input.",
      );
    const version = epoch,
      rawVersion = courseEpoch,
      fileVersion = fileEpoch,
      existing = new Set(ps.state?.records.map((r) => r.id) ?? []),
      formBefore = clone(form),
      reason = p.intent.target ? amendmentReason : null;
    const options: CaptureCommitOptions = {
      criteriaAffirmed: true,
      reason,
      at: clock(),
      makeId,
      assertUiCurrent: () => {
        if (
          epoch !== version ||
          preview !== p ||
          previewEpoch !== version ||
          courseEpoch !== rawVersion ||
          fileEpoch !== fileVersion ||
          !affirmed ||
          (p.intent.target && amendmentReason !== reason) ||
          !learningSame(currentIntent(), p.intent)
        )
          throw Error(
            "The reviewed form changed before capture. Nothing may be silently retargeted.",
          );
        if (
          p.kind === "file" &&
          (!sourceBytes ||
            !reviewedFileBytes ||
            sourceBytes.length !== reviewedFileBytes.length ||
            !sourceBytes.every(
              (byte, index) => byte === reviewedFileBytes![index],
            ))
        )
          throw Error(
            "The selected file bytes changed. Review a fresh file preview.",
          );
        if (
          p.kind === "live" &&
          (!raw || !rawMatchesCourse(raw, p.source.input))
        )
          throw Error("The live course editor no longer matches this preview.");
        return undefined;
      },
    };
    committing = true;
    paint();
    try {
      const result =
        p.kind === "live"
          ? await portfolio.commitCourseCapture(p, options)
          : await portfolio.commitFileCapture(p, options);
      ps = result;
      const command: LearningCommand = p.intent.target
        ? {
            kind: "record.amend",
            criteriaId: p.intent.criteriaId,
            criteriaHash: p.intent.criteriaHash,
            expectedRecordId: p.intent.target.recordId,
            expectedRecordHash: p.intent.target.recordHash,
            source: p.source,
            criteriaAffirmed: true,
            reason: reason!,
          }
        : {
            kind: "record.capture",
            criteriaId: p.intent.criteriaId,
            criteriaHash: p.intent.criteriaHash,
            source: p.source,
            criteriaAffirmed: true,
          };
      if (
        epoch === version &&
        form &&
        formBefore &&
        learningSame(form, formBefore)
      ) {
        if (learningFormMatchesCommand(form, command) || preview === p)
          form = clone(result.state?.draft.form ?? null);
        clearCaptureFile();
        recordId =
          result.state?.records.find((r) => !existing.has(r.id))?.id ??
          recordId;
      }
      say(
        result.unsaved
          ? "The self-recorded record exists once in valid memory only. Saved bytes are unchanged; export or retry saving without capturing again."
          : "The self-recorded record was appended. Any unrelated saved raw form remains available.",
      );
    } finally {
      committing = false;
      preview = null;
      affirmed = false;
    }
  }

  function courseFacts(parent: HTMLElement, input: CourseState) {
    facts(parent, [
      ["Learner-supplied name", input.name],
      ["Declared source day", input.completedAt || "Unknown / not supplied"],
      ["Capstone", input.capstone],
    ]);
    for (const [index, unit] of input.lessons.entries())
      details(parent, `Unit ${index + 1} retained input`, (body) =>
        facts(body, [
          ["Reading assertion", String(unit.read)],
          ["Practice", unit.practice],
          ["Answer indexes", unit.answers.join(", ")],
        ]),
      );
  }
  function renderRecord(parent: HTMLElement, key: string) {
    const view = learningRecordView(portfolioState(), key, known),
      record = view.record,
      box = el("section", undefined, "lp-card");
    box.append(
      el("h3", learningCompletionLabel(record.evaluation)),
      note(
        view.currentInSeries
          ? "Current head of this self-recorded series."
          : "Historical record; later amendments do not rewrite it.",
      ),
    );
    facts(box, [
      ["Record ID", record.id],
      ["Series/version", `${record.seriesId} / ${record.revision}`],
      ["Record hash", record.hash],
      ["Criteria ID/hash", `${record.criteriaId}\n${record.criteriaHash}`],
      ["Input hash", record.inputHash],
      ["Captured locally", record.recordedAt],
      [
        "Self-reported source day",
        record.input.completedAt || "Unknown / not supplied",
      ],
      [
        "Prior record",
        record.previousId
          ? `${record.previousId}\n${record.previousHash}`
          : "None; initial record",
      ],
      ["Amendment reason", record.amendmentReason ?? "Initial record"],
      [
        "Historical criteria binding",
        "Unknown in the v1 source; evaluated against the selected frozen criteria now",
      ],
    ]);
    renderEvaluation(box, record.evaluation);
    details(box, "Complete private input", (body) =>
      courseFacts(body, record.input),
    );
    box.append(note(limitations));
    box.append(
      button("Inspect frozen criteria for this record", () => {
        criteriaId = record.criteriaId;
        tab = "criteria";
        render();
      }),
      button(
        "Review restoring this input to current course",
        async () => {
          const version = epoch,
            token = await course.previewRestore(
              makeCourseProgressExport(record.input),
            );
          if (version !== epoch)
            throw Error(
              "The editor changed while preparing restoration. Review again.",
            );
          courseRestore = token;
          courseRecoveryEpoch = version;
          tab = "recovery";
          render();
        },
        "course-recovery",
      ),
      button("Prepare print of this record", () => {
        printRecord = record;
        render();
      }),
    );
    if (view.currentInSeries)
      box.append(
        button("Choose this record for an amendment", () => {
          criteriaId = record.criteriaId;
          targetId = record.id;
          invalidate();
          tab = "portfolio";
          render();
        }),
      );
    for (const old of view.history)
      box.append(
        button(`Read series version ${old.revision}`, () => {
          recordId = old.id;
          render();
        }),
      );
    parent.append(box);
  }
  function renderCriteria(parent: HTMLElement) {
    select(
      parent,
      "Reading criteria edition",
      criteriaId,
      known.map((c) => [
        c.id,
        c.id === current.id ? `${c.id} (current)` : `${c.id} (archived)`,
      ]),
      (value) => {
        criteriaId = value;
        invalidate();
        render();
      },
    );
    const criteria = known.find((c) => c.id === criteriaId)!;
    parent.append(
      el("h3", "Frozen criteria and exact reading sources"),
      note(
        "Archived source is inert text, including any Markdown or HTML. Links to the current textbook are labeled current. A hash identifies bytes and establishes no independent review.",
      ),
    );
    facts(parent, [
      ["Criteria ID", criteria.id],
      ["Criteria hash", criteria.hash],
      ["Source Git baseline", criteria.sourceCommit],
      [
        "Practice/capstone thresholds",
        `${criteria.rules.practiceMin} / ${criteria.rules.capstoneMin} trimmed JavaScript UTF-16 code units`,
      ],
    ]);
    parent.append(note(criteria.capstoneInstructions));
    for (const unit of criteria.units)
      details(
        parent,
        `${unit.chapter}. ${unit.id} · archived checks`,
        (body) => {
          body.append(
            note(unit.takeaway),
            note(unit.exercise),
            note(unit.worked),
          );
          for (const q of unit.questions) {
            facts(body, [
              ["Question", q.prompt],
              [
                "Options",
                q.options
                  .map((value, index) => `${index}: ${value}`)
                  .join("\n"),
              ],
              ["Public correct index", String(q.correct)],
              ["Explanation", q.explanation],
            ]);
          }
          const source = criteria.sourceFiles.find(
            (source) => source.path === unit.chapterPath,
          )!;
          facts(body, [["Exact chapter source hash", source.rawHash]]);
          body.append(el("pre", source.rawText));
        },
      );
  }

  function currentRawDraft(): LearningDraft {
    if (courseDirty()) {
      if (form && (form.kind !== "course" || !learningSame(form.course, raw)))
        throw Error(
          "The current course editor and another portfolio raw form both contain unfinished work. Download plain raw recovery for both, or explicitly save one before a complete backup. No fields were silently omitted.",
        );
      if (form) return draft();
      return {
        tab,
        recordId,
        dirty: true,
        form: {
          kind: "course",
          targetId: null,
          binding: {
            sourceInputHash: courseBinding?.expectedStateHash ?? "",
            sourceGeneration: String(courseBinding?.expectedGeneration ?? ""),
          },
          fields: {},
          course: clone(raw),
        },
      };
    }
    return draft();
  }
  function plainRecovery(): string {
    return (
      learningRawRecovery(draft()) +
      "\nAdditional current course editor and original opening binding (plain recovery only):\n" +
      JSON.stringify({ course: raw, binding: courseBinding }, null, 2) +
      "\n"
    );
  }
  function renderExports(parent: HTMLElement) {
    parent.append(
      el("h3", "Private downloads"),
      note(
        "Complete portfolio JSON includes every retained record, full frozen criteria and saved unfinished raw fields. It may include study text unrelated to the record selected below. Plain raw recovery is separate and is not a validated backup.",
        "lp-warning",
      ),
    );
    parent.append(
      button("Download complete portfolio with current raw form", async () => {
        const version = epoch,
          s = clone(portfolioState());
        s.draft = currentRawDraft();
        const text = await makeLearningBackup(s, clock(), known);
        if (epoch !== version)
          throw Error("The raw form changed during export. Try again.");
        download(
          "charitology-learning-portfolio-backup.json",
          text,
          "application/json",
        );
        say(
          "A complete validated portfolio download was requested. Nothing was saved or submitted.",
        );
      }),
    );
    parent.append(
      button(
        "Download canonical portfolio without newer DOM edits",
        async () => {
          download(
            "charitology-learning-portfolio-canonical.json",
            await portfolio.backup(clock()),
            "application/json",
          );
          say(
            "A canonical portfolio download was requested. Newer DOM edits are excluded; preserve their plain raw recovery separately.",
          );
        },
      ),
    );
    if (cs.state) {
      parent.append(
        button("Download validated course v1 JSON", async () => {
          download(
            "charitology-principles-progress.json",
            await course.backup(),
            "application/json",
          );
          say(
            "A version 1 course-progress download was requested. Its supplied day is preserved; no criteria binding is invented.",
          );
        }),
      );
    }
    if (raw && cs.state) {
      parent.append(
        button("Download current course edits as separate v1 candidate", () => {
          const candidate = courseFromRaw(raw!, courseState().completedAt);
          download(
            "charitology-principles-unsaved-candidate.json",
            makeCourseProgressExport(candidate),
            "application/json",
          );
          say(
            "An unsaved v1 candidate download was requested. The separate unsaved day input is excluded; preserve its raw recovery or apply it explicitly.",
          );
        }),
        button("Download current study notes", () => {
          const candidate = courseFromRaw(raw!, courseState().completedAt);
          const lines = [
            "Principles of Charitology — private self-study notes",
            limitations,
            `Present criteria: ${current.id} / ${current.hash}`,
            `Self-reported day: ${candidate.completedAt || "Unknown / not supplied"}`,
          ];
          for (const [index, lesson] of candidate.lessons.entries())
            lines.push(
              `\nUNIT ${index + 1}\n${lesson.practice}\nAnswers: ${lesson.answers.join(", ")}`,
            );
          lines.push(`\nCAPSTONE\n${candidate.capstone}`);
          download(
            "charitology-principles-study-notes.txt",
            lines.join("\n") + "\n",
          );
        }),
      );
    }
    if (!ps.state?.records.length) return;
    select(
      parent,
      "Selected record for packet",
      recordId ?? "",
      [
        ["", "Choose a record"],
        ...ps.state.records.map(
          (r) => [r.id, `${r.id} · version ${r.revision}`] as [string, string],
        ),
      ],
      (value) => {
        recordId = value || null;
        packet = null;
        packetGeneration++;
        render();
      },
    );
    select(
      parent,
      "Packet purpose",
      purpose,
      [
        ["personal-study", "Personal study"],
        ["credential-proposal", "Credential proposal discussion"],
        ["fellowship-planning", "Fellowship planning discussion"],
      ],
      (value) => {
        purpose = value as LearningPacketPurpose;
        packet = null;
        packetGeneration++;
        render();
      },
    );
    parent.append(
      note(
        "A selected packet contains exactly one record and its complete frozen criteria. Predecessor ID/hash are provenance only; ancestors, other records and raw forms are omitted. It cannot restore the complete workspace and is not submitted to a credential or fellowship process.",
      ),
    );
    parent.append(
      button("Review selected record packet", async () => {
        if (!recordId) throw Error("Choose one record.");
        const version = ++packetGeneration,
          before = ps.hash,
          result = await makeLearningPacket(
            portfolioState(),
            recordId,
            purpose,
            known,
          );
        if (
          version !== packetGeneration ||
          portfolio.snapshot().hash !== before
        )
          throw Error(
            "Packet selection or saved memory changed. Review again.",
          );
        packet = result;
        packetHash = before;
        render();
      }),
    );
    if (packet && packetHash === ps.hash) {
      facts(parent, [["Selected packet checksum", packet.packetHash]]);
      for (const [label, key, type] of [
        ["JSON", "json", "application/json"],
        ["CSV", "csv", "text/csv"],
        ["Markdown", "markdown", "text/markdown"],
      ] as const)
        parent.append(
          button(`Download selected packet ${label}`, () => {
            if (!packet || portfolio.snapshot().hash !== packetHash)
              throw Error("Review the current packet selection again.");
            download(
              `charitology-learning-selected.${key === "markdown" ? "md" : key}`,
              packet[key],
              type,
            );
          }),
        );
    }
  }

  function renderRaw(parent: HTMLElement) {
    parent.append(
      button("Download all unfinished raw recovery text", () =>
        download(
          "charitology-learning-unfinished-recovery.txt",
          plainRecovery(),
        ),
      ),
    );
    const clearSaved = () =>
      confirm(
        "Remove the unfinished form saved in the portfolio? Captured records and criteria remain. Current course edits are separate and retained.",
        async () => {
          await savePortfolioDraft({ tab, recordId, form: null, dirty: false });
          render();
        },
      );
    if (!form) {
      if (ps.state?.draft.form)
        parent.append(
          note(
            "A raw form remains in the saved portfolio until you explicitly remove it.",
          ),
          button("Save empty portfolio form state", clearSaved, "portfolio"),
        );
      return;
    }
    const box = el("section", undefined, "lp-card");
    box.append(
      el("h3", "Retained unfinished portfolio form"),
      note(
        `Form ${form.kind}; original bindings remain exact. A restored affirmation never authorizes a renewed capture.`,
      ),
    );
    box.append(
      button(
        "Save retained raw form in portfolio",
        async () => {
          await savePortfolioDraft(draft());
          render();
        },
        "portfolio",
      ),
    );
    if (form.kind !== "course")
      box.append(
        button("Review resuming retained capture choices", () => {
          const retained = clone(form!);
          const criterion = known.find(
            (c) =>
              c.id === retained.binding.criteriaId &&
              c.hash === retained.binding.criteriaHash,
          );
          if (!criterion)
            throw Error(
              "This raw form has no exact known criteria binding. Repair it or preserve raw recovery.",
            );
          const target =
            retained.kind === "amend"
              ? portfolioState().records.find(
                  (r) =>
                    r.id === retained.targetId &&
                    r.id === retained.binding.expectedRecordId &&
                    r.hash === retained.binding.expectedRecordHash,
                )
              : null;
          if (retained.kind === "amend" && !target)
            throw Error(
              "The exact amendment target is unavailable. The form was not retargeted.",
            );
          criteriaId = criterion.id;
          targetId = target?.id ?? "";
          amendmentReason = retained.fields.amendmentReason ?? "";
          invalidate();
          tab = "portfolio";
          say(
            "Retained choices resumed without authority. Choose and review the exact course source again; the affirmation remains unchecked.",
          );
          render();
        }),
      );
    if (form.course)
      box.append(
        button("Review resuming raw course text in editor", () => {
          const saved = clone(form!.course!);
          confirm(
            "Copy this retained raw course form into the visible editor only? No course progress is saved; original bindings remain visible for repair.",
            () => {
              raw = clone(saved);
              courseBinding = null;
              courseEpoch++;
              invalidate();
              tab = "course";
              render();
            },
          );
        }),
      );
    details(box, "Inspect or repair exact saved raw form", (body) => {
      for (const key of LEARNING_FORM_NAMES[form!.kind].binding)
        if (!(key in form!.binding))
          body.append(
            button(`Add missing raw binding ${key}`, () => {
              form!.binding[key] = "";
              invalidate();
              render();
            }),
          );
      for (const key of LEARNING_FORM_NAMES[form!.kind].fields)
        if (!(key in form!.fields))
          body.append(
            button(`Add missing raw field ${key}`, () => {
              form!.fields[key] = "";
              invalidate();
              render();
            }),
          );
      for (const [key, value] of Object.entries(form!.binding))
        field(body, `Raw binding ${key}`, value ?? "", (next) => {
          const name = key as keyof Form["binding"];
          form!.binding[name] = next;
        });
      for (const [key, value] of Object.entries(form!.fields))
        field(
          body,
          `Raw field ${key}`,
          value ?? "",
          (next) => {
            const name = key as keyof Form["fields"];
            form!.fields[name] = next;
          },
          { long: true },
        );
      if (form!.course) {
        field(
          body,
          "Raw retained name",
          form!.course.name,
          (next) => (form!.course!.name = next),
        );
        field(
          body,
          "Raw retained completion day",
          form!.course.completedAt,
          (next) => (form!.course!.completedAt = next),
        );
        field(
          body,
          "Raw retained capstone",
          form!.course.capstone,
          (next) => (form!.course!.capstone = next),
          { long: true },
        );
        for (const [index, lesson] of form!.course.lessons.entries()) {
          check(
            body,
            `Raw retained reading ${index + 1}`,
            lesson.read,
            (next) => {
              lesson.read = next;
              invalidate();
              paint();
            },
          );
          field(
            body,
            `Raw retained practice ${index + 1}`,
            lesson.practice,
            (next) => (lesson.practice = next),
            { long: true },
          );
          for (const qi of [0, 1] as const)
            field(
              body,
              `Raw retained answer ${index + 1}.${qi + 1}`,
              lesson.answers[qi],
              (next) => (lesson.answers[qi] = next),
            );
        }
      }
    });
    box.append(
      button("Discard raw form in this tab", () =>
        confirm(
          "Discard the displayed portfolio raw form in this tab? The saved form is unchanged until you explicitly save the empty form state.",
          () => {
            form = null;
            invalidate();
            say(
              "Raw form discarded in this tab. Save the empty form state explicitly if you also want the saved draft removed.",
            );
            render();
          },
        ),
      ),
      button("Save empty portfolio form state", clearSaved, "portfolio"),
    );
    parent.append(box);
  }
  function renderPrint(parent: HTMLElement) {
    root.classList.toggle("lp-print-ready", !!printRecord);
    let ancestor: HTMLElement | null = root.parentElement;
    while (ancestor) {
      ancestor.classList.toggle("lp-print-path", !!printRecord);
      ancestor = ancestor.parentElement;
    }
    if (!printRecord) return;
    const box = el("section", undefined, "lp-print");
    box.append(
      el("h2", learningCompletionLabel(printRecord.evaluation)),
      note(limitations),
    );
    facts(box, [
      ["Learner-supplied name", printRecord.input.name],
      [
        "Criteria ID/hash",
        `${printRecord.criteriaId}\n${printRecord.criteriaHash}`,
      ],
      ["Record/input hash", `${printRecord.hash}\n${printRecord.inputHash}`],
      [
        "Captured locally (not a witnessed learning time)",
        printRecord.recordedAt,
      ],
      [
        "Self-reported source day",
        printRecord.input.completedAt || "Unknown / not supplied",
      ],
      [
        "Historical criteria used by v1 source",
        "Unknown; evaluated against selected frozen criteria now",
      ],
    ]);
    parent.append(box);
    const actions = el("div", undefined, "lp-actions");
    actions.append(
      note("Print shows the selected immutable record and its limitations."),
      button("Print selected self-study record", () => window.print()),
      button("Close print preparation", () => {
        printRecord = null;
        render();
      }),
    );
    parent.append(actions);
  }

  function renderRecovery(parent: HTMLElement) {
    parent.append(
      el("h3", "Separate course and portfolio recovery"),
      note(
        "These are two independent saved workspaces. Restoring one changes no other key. Preserve raw fields before replacing memory; old already-open course tabs must be reloaded or closed because they do not honor the new guarded save protocol.",
      ),
    );
    const renderStore = (kind: "course" | "portfolio") => {
      const s = kind === "course" ? cs : ps,
        box = el("section", undefined, "lp-card");
      box.append(
        el(
          "h4",
          kind === "course"
            ? "Course progress (legacy v1)"
            : "Learning portfolio",
        ),
      );
      box.append(
        button(`Download protected saved ${kind} bytes`, () => {
          const bytes =
            kind === "course"
              ? course.rawSavedCopy()
              : portfolio.rawSavedCopy();
          if (bytes === undefined)
            throw Error(
              "Saved bytes could not be read. No empty recovery copy was substituted.",
            );
          if (bytes === null)
            throw Error("No saved bytes exist for this workspace.");
          download(
            `charitology-${kind}-saved-text-recovery.json`,
            learningSavedTextRecovery(bytes, kind),
            "application/json",
          );
          say(
            "A JSON recovery wrapper containing the exact saved JavaScript text was requested. Its raw field preserves malformed UTF-16 too; this is not a validated workspace backup.",
          );
        }),
      );
      const protectedRaw =
        kind === "course" ? course.rawSavedCopy() : portfolio.rawSavedCopy();
      if (s.observedRaw !== undefined && s.observedRaw !== protectedRaw) {
        const observed = s.observedRaw;
        box.append(
          note(
            "The originally protected copy and latest observed storage text differ. Neither is assumed valid; preserve both before recovery.",
            "lp-warning",
          ),
        );
        if (observed === null)
          box.append(
            note(
              "The latest observation was that this saved key was absent. The protected earlier copy remains separate.",
            ),
          );
        else
          box.append(
            button(`Download latest observed ${kind} text`, () => {
              download(
                `charitology-${kind}-latest-observed-recovery.json`,
                learningSavedTextRecovery(observed, kind),
                "application/json",
              );
              say(
                "A JSON wrapper of the latest observed storage text was requested. It is separate from the originally protected copy and is not a validated backup.",
              );
            }),
          );
      } else if (s.observedRaw === undefined)
        box.append(
          note(
            "Current saved bytes are unreadable. Any available protected copy is the last captured text, not a claim about current storage.",
            "lp-warning",
          ),
        );
      const input = el("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.setAttribute("aria-label", `Choose ${kind} recovery JSON`);
      editors.push(input);
      input.addEventListener("change", () => {
        invalidate();
        if (kind === "course") courseRecoveryBytes = null;
        else portfolioRecoveryBytes = null;
        const file = input.files?.[0];
        if (!file) {
          render();
          return;
        }
        const generation = ++fileEpoch,
          version = epoch;
        void action(async () => {
          const bytes = await readLearningFile(
            file,
            kind === "course"
              ? LEARNING_LIMITS.courseBytes
              : LEARNING_LIMITS.backupBytes,
          );
          if (generation !== fileEpoch) throw Error("A newer file was chosen.");
          if (kind === "course") courseRecoveryBytes = bytes;
          else portfolioRecoveryBytes = bytes;
          if (version !== epoch)
            throw Error(
              "Raw input changed while reading replacement. Review the selected bytes explicitly again.",
            );
          await previewRecovery(kind);
          render();
        });
      });
      box.append(input);
      const bytes =
        kind === "course" ? courseRecoveryBytes : portfolioRecoveryBytes;
      if (bytes)
        box.append(
          button(`Download selected ${kind} recovery bytes unchanged`, () =>
            download(
              `charitology-${kind}-selected-recovery.json`,
              new Blob([new Uint8Array(bytes)]),
            ),
          ),
          button(
            `Preview selected ${kind} replacement again`,
            async () => {
              await previewRecovery(kind);
              render();
            },
            `${kind}-recovery`,
          ),
        );
      const token = kind === "course" ? courseRestore : portfolioRestore;
      if (token) {
        box.append(
          note(
            `Validated ${kind} replacement preview. Applying it replaces that workspace and can discard its currently visible unsaved fields. Other workspace data stays separate.`,
            "lp-warning",
          ),
          button(
            `Apply reviewed ${kind} replacement`,
            async () => {
              if (
                (kind === "course"
                  ? courseRecoveryEpoch
                  : portfolioRecoveryEpoch) !== epoch
              )
                throw Error(
                  "Unfinished input changed after replacement review. Preview again.",
                );
              const version = epoch;
              if (kind === "course") {
                const result = await course.restore(
                  token as CourseRestorePreview,
                );
                adoptCourseRecovery(result, version);
                say(
                  result.unsaved
                    ? "Course replacement is valid only in memory; saved bytes are unchanged."
                    : "The reviewed course v1 input was restored; its supplied day was preserved.",
                );
              } else {
                const result = await portfolio.restore(
                  token as LearningRestorePreview,
                );
                adoptPortfolioRecovery(result, version);
                say(
                  result.unsaved
                    ? "Portfolio replacement is valid only in memory; saved bytes are unchanged."
                    : "The reviewed portfolio was restored. Course progress was unchanged.",
                );
              }
              render();
            },
            `${kind}-recovery`,
          ),
        );
      }
      box.append(
        button(
          `Preview clearing ${kind}`,
          async () => {
            invalidate();
            const version = epoch;
            if (kind === "course") {
              const token = await course.previewClear(emptyCourseProgress());
              if (version !== epoch)
                throw Error("Raw input changed during clear preview.");
              courseClear = token;
              courseRestore = null;
              courseRecoveryEpoch = version;
            } else {
              const token = await portfolio.previewClear(
                blankLearningPortfolio(makeId(), clock()),
              );
              if (version !== epoch)
                throw Error("Raw input changed during clear preview.");
              portfolioClear = token;
              portfolioRestore = null;
              portfolioRecoveryEpoch = version;
            }
            render();
          },
          `${kind}-recovery`,
        ),
      );
      const clear = kind === "course" ? courseClear : portfolioClear;
      if (clear)
        box.append(
          note(
            `Clear only ${kind}. Export it first. This is not an atomic two-workspace reset.`,
            "lp-warning",
          ),
          button(
            `Confirm clear of ${kind}`,
            async () => {
              if (
                (kind === "course"
                  ? courseRecoveryEpoch
                  : portfolioRecoveryEpoch) !== epoch
              )
                throw Error(
                  "Raw input changed after clear review. Review again.",
                );
              const version = epoch;
              if (kind === "course") {
                const result = await course.clear(clear as CourseClearPreview);
                adoptCourseRecovery(result, version);
                say(
                  result.unsaved
                    ? "Course was cleared only in memory; saved bytes could not be removed."
                    : "Course progress cleared. Portfolio histories remain.",
                );
              } else {
                const result = await portfolio.clear(
                  clear as LearningClearPreview,
                );
                adoptPortfolioRecovery(result, version);
                say(
                  result.unsaved
                    ? "Portfolio was cleared only in memory; saved bytes could not be removed."
                    : "Portfolio cleared. Course progress remains.",
                );
              }
              render();
            },
            `${kind}-recovery`,
          ),
        );
      if (s.canRetryPersist)
        box.append(
          button(
            `Retry saving valid ${kind} memory`,
            async () => {
              if (kind === "course") {
                const before = cs,
                  binding = courseBinding;
                cs = await course.retryPersist();
                if (
                  binding &&
                  binding.expectedGeneration === before.generation &&
                  binding.expectedStateHash === before.hash &&
                  cs.hash === before.hash
                )
                  courseBinding = {
                    expectedGeneration: cs.generation,
                    expectedStateHash: cs.hash!,
                  };
              } else ps = await portfolio.retryPersist();
              say(
                (kind === "course" ? cs : ps).unsaved
                  ? "Saving still failed. Valid memory remains available for backup."
                  : "The exact candidate was saved without replaying a capture or date action.",
              );
              render();
            },
            kind,
          ),
        );
      const undo = button(
        `Review undo for ${kind}`,
        () =>
          confirm(
            `Undo the last ${kind} change and replace its visible unfinished fields? Preserve raw recovery first.`,
            async () => {
              const version = epoch;
              if (kind === "course")
                adoptCourseRecovery(await course.undo(), version);
              else adoptPortfolioRecovery(await portfolio.undo(), version);
              const result = kind === "course" ? cs : ps;
              say(
                result.unsaved
                  ? "Undo exists only in memory; saved bytes are unchanged."
                  : "Last guarded change undone. File capture/replacement must be reselected and reviewed.",
              );
              render();
            },
          ),
        kind,
      );
      undo.dataset.fixedDisabled = String(!s.canUndo);
      box.append(undo);
      box.append(
        button(`Review reload of ${kind}`, () =>
          confirm(
            `Explicitly reload ${kind} from browser storage? Newer unfinished ${kind} fields may be discarded only after a successful validation.`,
            async () => {
              const version = epoch;
              if (kind === "course") {
                const result = await course.reload({ discardUnsaved: true });
                if (
                  result.code === "ready" ||
                  (result.code === "unsupported" && result.state)
                )
                  adoptCourseRecovery(result, version);
                else cs = result;
              } else {
                const result = await portfolio.reload({ discardUnsaved: true });
                if (
                  result.code === "ready" ||
                  (result.code === "unsupported" && result.state)
                )
                  adoptPortfolioRecovery(result, version);
                else ps = result;
              }
              const result = kind === "course" ? cs : ps;
              say(
                result.code === "ready" ||
                  (result.code === "unsupported" && result.state)
                  ? "The readable saved copy was reloaded and validated. File authority was discarded; reselect files."
                  : result.message ||
                      "Saved bytes could not be validated. Current valid memory and raw work are retained.",
                result.code !== "ready" && result.code !== "unsupported",
              );
              render();
            },
          ),
        ),
      );
      parent.append(box);
    };
    renderStore("course");
    renderStore("portfolio");
  }
  async function previewRecovery(kind: "course" | "portfolio") {
    invalidate();
    const version = epoch;
    if (kind === "course") {
      if (!courseRecoveryBytes) throw Error("Choose course recovery bytes.");
      const token = await course.previewRestore(courseRecoveryBytes);
      if (version !== epoch)
        throw Error("Raw input changed during replacement preview.");
      courseRestore = token;
      courseClear = null;
      courseRecoveryEpoch = version;
    } else {
      if (!portfolioRecoveryBytes)
        throw Error("Choose portfolio recovery bytes.");
      const token = await portfolio.previewRestore(portfolioRecoveryBytes);
      if (version !== epoch)
        throw Error("Raw input changed during replacement preview.");
      portfolioRestore = token;
      portfolioClear = null;
      portfolioRecoveryEpoch = version;
    }
  }
  function adoptCourseRecovery(result: CourseStoreSnapshot, version: number) {
    cs = result;
    if (epoch === version) {
      courseBinding = cs.hash
        ? { expectedGeneration: cs.generation, expectedStateHash: cs.hash }
        : null;
      raw = cs.state ? rawCourse(cs.state) : null;
      courseEpoch++;
      clearCaptureFile();
      courseRecoveryBytes = null;
    }
    invalidate();
    courseRestore = null;
    courseClear = null;
  }
  function adoptPortfolioRecovery(
    result: LearningStoreSnapshot,
    version: number,
  ) {
    ps = result;
    if (epoch === version) {
      form = clone(ps.state?.draft.form ?? null);
      recordId = ps.state?.draft.recordId ?? null;
      clearCaptureFile();
      portfolioRecoveryBytes = null;
    }
    invalidate();
    portfolioRestore = null;
    portfolioClear = null;
  }
  window.addEventListener("beforeunload", (event) => {
    if (hasWork()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === COURSE_PROGRESS_STORAGE_KEY || event.key === null)
      cs = course.noticeExternalChange();
    if (event.key === LEARNING_PORTFOLIO_STORAGE_KEY || event.key === null)
      ps = portfolio.noticeExternalChange();
    if (
      event.key === COURSE_PROGRESS_STORAGE_KEY ||
      event.key === LEARNING_PORTFOLIO_STORAGE_KEY ||
      event.key === null
    ) {
      invalidate();
      say(
        "Another tab changed saved learning work. Current raw fields remain. Preserve them before an explicit reload or replacement.",
        true,
      );
      render();
    }
  });
  render();
}
