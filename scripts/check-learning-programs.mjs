// Run with `node scripts/check-learning-programs.mjs` after npm ci.
// Exercise planning decisions, invalid imports and completion gates without a DOM.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const result = await build({
  stdin: {
    contents: `export * from './src/lib/client/program-workspaces.ts'; export * from './src/lib/client/program-course.ts'; export { courseLessons } from './src/data/program-course.ts';`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "es2022",
});
const p = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
let checks = 0;
const check = (name, test) => {
  test();
  checks++;
  console.log(`✓ ${name}`);
};
check(
  "A capped match can exhaust the budget even when employee participation is rounded down",
  () => {
    const r = p.matchScenario(10, {
      participation: "35",
      gift: "100",
      ratio: "2",
      cap: "150",
      budget: "400",
      admin: "50",
    });
    assert.deepEqual(r, {
      participants: 3,
      employeeGifts: 300,
      matchPerPerson: 150,
      match: 450,
      employerTotal: 500,
      shortfall: 100,
      headroom: 0,
    });
  },
);
check(
  "Zero participation does not erase administration costs or create a match",
  () => {
    const r = p.matchScenario(100, {
      participation: "0",
      gift: "200",
      ratio: "1",
      cap: "100",
      budget: "30",
      admin: "50",
    });
    assert.equal(r.match, 0);
    assert.equal(r.employeeGifts, 0);
    assert.equal(r.employerTotal, 50);
    assert.equal(r.shortfall, 20);
  },
);
check(
  "Travel and preparation can make a volunteer plan infeasible; staff time stays separate",
  () => {
    const config = p.programWorkspaces["time-charitology"];
    const s = p.sampleWorkspace(config);
    s.context.available = "4.5";
    s.context.wage = "20";
    s.records.roles[0].values = {
      ...s.records.roles[0].values,
      hours: "4",
      travel: "1",
      prep: "0.5",
      staff: "2",
      cost: "12",
    };
    const r = p.volunteerTotals(s.records.roles[0].values, 20);
    assert.deepEqual(r, {
      commitment: 5.5,
      service: 4,
      staff: 2,
      cost: 12,
      personalCost: 122,
    });
    const summary = p.workspaceSummary(config, s);
    assert.equal(summary.metrics[1].label, "Over capacity / week");
    assert.equal(summary.metrics[1].value, "1");
    s.records.roles[0].values.status = "Exploring";
    assert.equal(p.workspaceSummary(config, s).metrics[0].value, "0");
  },
);
check(
  "A zero discount rate retains all year-end flows and subtracts upfront cost once",
  () => {
    assert.deepEqual(
      p.policyScenario(2, 0, {
        upfront: "100",
        annualCost: "30",
        annualLow: "50",
        annualHigh: "80",
      }),
      {
        factor: 2,
        costs: 160,
        lowBenefits: 100,
        highBenefits: 160,
        lowNet: -60,
        highNet: 0,
      },
    );
  },
);
check(
  "Discounting changes future flows, not the year-zero cost; negative scenarios remain visible",
  () => {
    const r = p.policyScenario(2, 100, {
      upfront: "100",
      annualCost: "30",
      annualLow: "50",
      annualHigh: "80",
    });
    assert.equal(r.factor, 0.75);
    assert.equal(r.lowNet, -85);
    assert.equal(r.highNet, -62.5);
    assert.ok(
      Number.isFinite(
        p.policyScenario(100, 0, {
          upfront: "1e12",
          annualCost: "1e12",
          annualLow: "0",
          annualHigh: "1e12",
        }).lowNet,
      ),
    );
  },
);
check(
  "Every dedicated example round-trips and produces a complete, honest draft and CSV",
  () => {
    for (const config of Object.values(p.programWorkspaces)) {
      const s = p.sampleWorkspace(config);
      assert.deepEqual(
        p.parseWorkspace(JSON.parse(JSON.stringify(s)), config),
        s,
      );
      const draft = p.workspaceMarkdown(config, s);
      assert.ok(draft.includes("No source check, human review"));
      assert.ok(draft.includes(config.guide[0].title));
      assert.ok(p.workspaceCsv(config, s).startsWith('"section","record_id"'));
      const empty = p.emptyWorkspace(config);
      assert.ok(
        p
          .workspaceMarkdown(config, empty)
          .includes("No records entered. This remains a gap."),
      );
    }
  },
);
check(
  "Imports cannot silently switch programs, accept impossible dates, unsafe links or duplicate records",
  () => {
    const config = p.programWorkspaces["policy-program"];
    const base = p.sampleWorkspace(config);
    const bad = (change) => {
      const next = structuredClone(base);
      change(next);
      assert.throws(() => p.parseWorkspace(next, config));
    };
    bad((s) => (s.program = "corporate-program"));
    bad((s) => (s.context.years = "2.5"));
    bad((s) => (s.context.years = "0"));
    bad((s) => (s.context.years = ""));
    bad((s) => (s.context.discount = ""));
    bad((s) => (s.context.discount = "Infinity"));
    bad((s) => (s.records.options[0].values.annualHigh = "1"));
    bad((s) => s.records.options.push(structuredClone(s.records.options[0])));
    bad((s) =>
      s.records.evidence.push({
        id: "claim1",
        values: {
          title: "Claim",
          option: "Option",
          source: "javascript:alert(1)",
          evidence: "Hypothesis",
          finding: "Finding",
          limits: "Limits",
          date: "2026-01-01",
        },
      }),
    );
    assert.equal(p.validProgramDate("2024-02-29"), true);
    assert.equal(p.validProgramDate("2026-02-29"), false);
    assert.equal(p.validProgramDate("2026-04-31"), false);
    for (const [id, field] of [
      ["corporate-program", "employees"],
      ["time-charitology", "available"],
    ]) {
      const c = p.programWorkspaces[id];
      const s = p.sampleWorkspace(c);
      s.context[field] = "";
      assert.throws(() => p.parseWorkspace(s, c));
    }
  },
);
check(
  "Spreadsheet exports preserve user text without executing formula-like cells",
  () => {
    const config = p.programWorkspaces["local-charitology"];
    const s = p.sampleWorkspace(config);
    s.context.name = ' =HYPERLINK("https://example.org/")';
    const csv = p.workspaceCsv(config, s);
    assert.ok(csv.includes("' =HYPERLINK"));
    assert.ok(csv.includes('""https://example.org/""'));
  },
);
check(
  "Course completion requires every answer, reading confirmation, substantive-length practice and capstone",
  () => {
    const s = p.emptyCourse();
    assert.equal(p.coursePassed(s), false);
    assert.equal(p.completedLessons(s), 0);
    assert.equal(p.courseLessons.length, 10);
    s.lessons = p.courseLessons.map((lesson) => {
      assert.equal(lesson.questions.length, 2);
      return {
        read: true,
        practice:
          "A worked practice exercise with reasoning and an explicit uncertainty.",
        answers: lesson.questions.map((q) => q.correct),
      };
    });
    assert.equal(p.completedLessons(s), 10);
    assert.equal(p.coursePassed(s), false);
    s.capstone =
      "A hypothetical decision with its alternative, evidence, mechanism, moral perspectives, community voice and follow-up. ".repeat(
        3,
      );
    assert.equal(p.coursePassed(s), true);
    assert.deepEqual(p.validCourse(JSON.parse(JSON.stringify(s))), s);
    s.lessons[9].answers[1] = (p.courseLessons[9].questions[1].correct + 1) % 3;
    s.completedAt = "2026-01-01";
    assert.equal(p.coursePassed(s), false);
    s.lessons[9].answers[1] = p.courseLessons[9].questions[1].correct;
    s.lessons[4].read = false;
    assert.equal(p.coursePassed(s), false);
    s.lessons[4].read = true;
    s.lessons[4].practice = " ".repeat(50);
    assert.equal(p.coursePassed(s), false);
  },
);
check(
  "Invalid course data cannot bypass the completion gates; blocked storage does not throw",
  () => {
    const s = p.emptyCourse();
    s.completedAt = "2026-02-30";
    assert.throws(() => p.validCourse(s));
    s.completedAt = "";
    s.lessons[0].answers[0] = 3;
    assert.throws(() => p.validCourse(s));
    assert.equal(p.coursePassed(p.readCourse()), false);
    assert.equal(p.writeCourse(p.emptyCourse()), false);
  },
);
console.log(
  `Learning and planning programs: ${checks} scenario groups passed.`,
);
