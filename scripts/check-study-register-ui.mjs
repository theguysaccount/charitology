import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  installStudyDom,
  settleStudyUi,
} from "../test-fixtures/study-register/ui-dom.mjs";
import {
  imported,
  command,
  protocol,
} from "../test-fixtures/study-register/factory.mjs";

const temporary = await mkdtemp(join(tmpdir(), "charitology-study-ui-"));
try {
  const outfile = join(temporary, "helpers.mjs");
  await build({
    entryPoints: ["src/lib/client/study-register-ui-helpers.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });
  const {
    studyUiGeneration,
    studyPage,
    studyNumber,
    studyColumnMap,
    readStudyFile,
    studyImportAssignments,
  } = await import(pathToFileURL(outfile));
  const epoch = studyUiGeneration();
  const pending = epoch.current();
  epoch.invalidate(); // A new edit or another tab's save arrives during hashing.
  assert.equal(
    epoch.matches(pending),
    false,
    "A late preview may not replace newly edited work.",
  );
  const next = epoch.current();
  assert.equal(epoch.matches(next), true);
  assert.equal(studyNumber("", "Estimate"), null);
  assert.equal(studyNumber("0", "Estimate"), 0);
  assert.equal(studyNumber("-1.25", "Estimate"), -1.25);
  assert.throws(() => studyNumber("Infinity", "Estimate"), /finite/);
  assert.deepEqual(studyColumnMap('{"title":0,"abstract":2}'), {
    title: 0,
    abstract: 2,
  });
  assert.throws(() => studyColumnMap('{"__proto__":0}'), /invalid/);
  assert.throws(() => studyColumnMap('{"title":30}'), /invalid/);
  await assert.rejects(
    () => readStudyFile(() => new Promise(() => {}), 5),
    /fresh local copy/,
  );
  const page = studyPage(
    Array.from({ length: 52 }, (_, id) => id),
    99,
  );
  assert.deepEqual(page.rows, [50, 51]);
  assert.equal(page.page, 2);
  assert.equal(studyPage([], -1).pages, 1);
  const inputs = [
    { row: 2, existingReportId: null, group: "reviewed-pair", canonicalRow: 4 },
    { row: 4, existingReportId: null, group: "reviewed-pair", canonicalRow: 4 },
    { row: 6, existingReportId: "existing", group: "", canonicalRow: 6 },
  ];
  const assignments = studyImportAssignments([2, 4, 6], inputs, [
    { id: "existing", revision: 7 },
  ]);
  assert.equal(assignments[1].target.canonicalRow, 4);
  assert.equal(
    assignments[2].target.reportRevision,
    7,
    "Attachment binds the exact existing revision.",
  );
  assert.throws(
    () =>
      studyImportAssignments([2, 4, 6], inputs.slice(1), [
        { id: "existing", revision: 7 },
      ]),
    /exactly one/,
  );
  assert.throws(
    () =>
      studyImportAssignments(
        [2, 4, 6],
        [inputs[0], { ...inputs[1], canonicalRow: 2 }, inputs[2]],
        [{ id: "existing", revision: 7 }],
      ),
    /same canonical/,
  );
  assert.throws(
    () => studyImportAssignments([2, 4, 6], inputs, []),
    /no longer current/,
  );
  assert.throws(
    () => studyImportAssignments([2], [{ ...inputs[0], canonicalRow: 4 }], []),
    /own rows/,
  );
  const uiFile = join(temporary, "ui.mjs");
  await build({
    stdin: {
      contents:
        "export * from './src/lib/client/study-register-ui.ts'; export * from './src/lib/client/study-register-model.ts'; export * from './src/lib/client/study-register-import.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: uiFile,
    logLevel: "silent",
  });
  const ui = await import(pathToFileURL(uiFile));
  const key = "charitology.study-register.v1";
  let dom = installStudyDom();
  await ui.mountStudyRegister(dom.root);
  assert.ok(
    dom.root.textContent.includes(
      "Record decisions without inventing independent review",
    ),
    "Review route must open Review rather than the blank draft’s Browse default.",
  );
  assert.ok(
    dom.root.querySelector(".study-register-mount").children.length,
    "Mount preserves the shell and catalog script.",
  );
  await dom.findButton("Protocol").click();
  await dom.findButton("Draft a new protocol").click();
  for (const [label, value] of [
    ["Protocol title", "Synthetic draft question"],
    ["Question", "What is being tested?"],
    ["Population", "Fictional examples"],
    ["Intervention", "Fictional intervention"],
    ["Outcomes", "Reported measurements"],
    ["Inclusion rules", "Explicit synthetic inclusion"],
    ["Exclusion rules", "Explicit synthetic exclusion"],
    ["Search plan", "No actual search performed"],
  ]) {
    const input = dom.field(label);
    assert.ok(input, label);
    input.value = value;
    await input.fire("input");
  }
  await dom.findButton("Save form draft").click();
  await settleStudyUi(
    () =>
      dom.values.has(key) &&
      !dom.findButton("Freeze this protocol content")?.disabled,
  );
  const draft = JSON.parse(dom.values.get(key));
  assert.equal(
    draft.protocols.length,
    0,
    "Saving raw form fields must not freeze a protocol.",
  );
  assert.equal(draft.draft.form.fields.question, "What is being tested?");
  assert.equal(
    dom.field("Question").value,
    "What is being tested?",
    "Busy save/re-render must retain field values and re-enable controls.",
  );
  dom = installStudyDom(JSON.stringify(draft));
  await ui.mountStudyRegister(dom.root);
  assert.equal(
    dom.field("Question").value,
    "What is being tested?",
    "The other view/reload reopens the same bounded raw draft.",
  );
  await dom.form().fire("submit");
  await settleStudyUi(
    () =>
      JSON.parse(dom.values.get(key)).protocols.length === 1 &&
      !!dom.findButton("Draft a new protocol"),
  );
  const frozen = JSON.parse(dom.values.get(key));
  assert.equal(frozen.draft.form, null);
  assert.equal(frozen.protocols[0].content.question, "What is being tested?");

  const invalidRaw = structuredClone(frozen);
  invalidRaw.draft = structuredClone(draft.draft);
  invalidRaw.draft.form.fields.eligibleDesigns = "{unfinished raw list";
  dom = installStudyDom(JSON.stringify(invalidRaw));
  await ui.mountStudyRegister(dom.root);
  assert.equal(
    dom.field("Raw field: eligibleDesigns").value,
    "{unfinished raw list",
    "Invalid raw text is restored exactly rather than coerced or discarded.",
  );
  assert.equal(JSON.parse(dom.values.get(key)).protocols.length, 1);
  dom.field("Raw field: eligibleDesigns").value = '["unknown"]';
  await dom.field("Raw field: eligibleDesigns").fire("input");
  await dom.findButton("Try opening the repaired form").click();
  assert.equal(dom.field("Question").value, "What is being tested?");
  assert.equal(
    JSON.parse(dom.values.get(key)).draft.form.fields.eligibleDesigns,
    "{unfinished raw list",
    "Repair is not persisted until explicitly saved.",
  );

  let splitState = await imported(ui);
  const pair = splitState.reports.slice(0, 2),
    target = pair[0];
  splitState = await command(
    ui,
    splitState,
    {
      kind: "duplicates.merge",
      reportIds: pair.map((row) => row.id),
      targetId: target.id,
      metadata: target.revisions.at(-1).metadata,
      reason: "Synthetic explicit duplicate merge.",
    },
    "split-fixture",
  );
  const merged = splitState.reports.find((row) => row.id === target.id);
  splitState = {
    ...splitState,
    draft: {
      tab: "reports",
      selectedReportId: target.id,
      form: {
        kind: "split",
        targetId: target.id,
        fields: {
          reportId: target.id,
          reportRevision: String(merged.currentRevision),
          partitions: "{unfinished partition text",
          reason: "Unfinished split draft.",
        },
      },
      dirty: true,
    },
  };
  dom = installStudyDom(JSON.stringify(splitState));
  await ui.mountStudyRegister(dom.root);
  assert.equal(
    dom.field("Raw field: partitions").value,
    "{unfinished partition text",
  );
  await dom.findButton("Save repaired raw draft").click();
  await settleStudyUi(() => dom.root.textContent.includes("Form draft saved"));
  const preservedSplit = JSON.parse(dom.values.get(key));
  assert.equal(
    preservedSplit.draft.form.fields.partitions,
    "{unfinished partition text",
  );
  assert.equal(
    (
      await ui.parseStudyBackup(
        await ui.makeStudyBackup(preservedSplit, "2026-10-26T12:00:00.000Z"),
      )
    ).draft.form.fields.partitions,
    "{unfinished partition text",
  );
  const partitions = merged.revisions
    .at(-1)
    .occurrenceIds.map((id, index) => ({
      label: `g${index}`,
      occurrenceIds: [id],
      title: index === 0 ? "" : "Synthetic alternate",
      retainOriginal: index === 1,
    }));
  preservedSplit.draft.form.fields.partitions = JSON.stringify(partitions);
  dom = installStudyDom(JSON.stringify(preservedSplit));
  await ui.mountStudyRegister(dom.root);
  assert.equal(
    dom.field("Canonical title for group g0").value,
    "",
    "A deliberate empty raw title must stay empty.",
  );
  assert.equal(
    dom.field("Group retaining the original report identity").value,
    "g1",
  );
  await dom.findButton("Save form draft").click();
  await settleStudyUi(() => dom.root.textContent.includes("Form draft saved"));
  assert.equal(
    JSON.parse(JSON.parse(dom.values.get(key)).draft.form.fields.partitions)[0]
      .title,
    "",
  );

  // A persisted screening form must keep its old binding after another source
  // revision; reloading does not grant authority to move its answers forward.
  let sample = await imported(ui);
  sample = await command(
    ui,
    sample,
    { kind: "protocol.freeze", content: protocol, basedOnId: null },
    "ui-protocol",
  );
  const report = sample.reports.find(
    (row) => row.revisions.at(-1).occurrenceIds.length,
  );
  sample = {
    ...sample,
    draft: {
      tab: "screening",
      selectedReportId: report.id,
      form: null,
      dirty: false,
    },
  };
  dom = installStudyDom(JSON.stringify(sample));
  await ui.mountStudyRegister(dom.root);
  await dom.findButton("Record title/abstract lane A").click();
  dom.field("Self-recorded lane label").value = "One synthetic local lane";
  await dom.field("Self-recorded lane label").fire("input");
  await dom.findButton("Save form draft").click();
  await settleStudyUi(
    () => JSON.parse(dom.values.get(key)).draft.form?.fields.protocolId,
  );
  const bound = JSON.parse(dom.values.get(key));
  const originalRevision = bound.draft.form.fields.reportRevision;
  const changed = await command(
    ui,
    bound,
    {
      kind: "report.correct",
      reportId: report.id,
      reportRevision: report.currentRevision,
      metadata: {
        ...report.revisions.at(-1).metadata,
        summary: "Source changed after the saved decision draft.",
      },
      reason: "Synthetic revision invalidation check.",
    },
    "ui-revision",
  );
  dom = installStudyDom(JSON.stringify(changed));
  await ui.mountStudyRegister(dom.root);
  assert.equal(
    dom.root
      .querySelector("form")
      .textContent.includes(`report revision ${originalRevision}`),
    true,
  );
  await dom.form().fire("submit");
  await settleStudyUi(
    () =>
      dom.root.textContent.includes("changed") ||
      dom.root.textContent.includes("current"),
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    JSON.parse(dom.values.get(key)).decisions.length,
    0,
    "Stale saved draft must fail rather than silently bind to the changed source.",
  );
  assert.equal(
    dom.field("Self-recorded lane label").value,
    "One synthetic local lane",
  );
  await dom.window.fire("storage", { key });
  assert.equal(
    dom.findButton("Record decision").disabled,
    true,
    "External-save guard disables mutations without replacing the dirty form.",
  );
  assert.equal(
    dom.field("Self-recorded lane label").value,
    "One synthetic local lane",
  );

  dom = installStudyDom("{not valid JSON");
  await ui.mountStudyRegister(dom.root);
  await dom.findButton("Flow and recovery").click();
  assert.equal(
    dom.root.querySelector(".sr-counts"),
    null,
    "Corrupt protected bytes must not be presented as a saved empty flow.",
  );
  assert.equal(
    dom.findButton("Preview clearing this register").disabled,
    false,
    "Reviewed recovery remains available for a protected corrupt store.",
  );
  await dom.findButton("Preview clearing this register").click();
  await settleStudyUi(() => !!dom.findButton("Confirm this recovery action"));
  assert.equal(
    dom.findButton("Confirm this recovery action").disabled,
    false,
    "An asynchronous recovery preview must not leave its new confirmation disabled.",
  );
  await dom.findButton("Keep current work").click();
  assert.equal(dom.values.get(key), "{not valid JSON");

  const priorBytes = JSON.stringify(frozen);
  dom = installStudyDom(priorBytes, { failWrite: true });
  await ui.mountStudyRegister(dom.root);
  await dom.findButton("Flow and recovery").click();
  await dom.findButton("Preview clearing this register").click();
  await settleStudyUi(() => !!dom.findButton("Confirm this recovery action"));
  await dom.findButton("Confirm this recovery action").click();
  await settleStudyUi(() =>
    dom.root.textContent.includes("This change exists only in memory"),
  );
  assert.equal(
    dom.values.get(key),
    priorBytes,
    "A failed removal leaves the protected saved copy unchanged.",
  );
  assert.ok(
    dom.root.textContent.includes("saved browser copy was not replaced"),
  );

  // Mapping a column and then deliberately unmapping it is a normal workflow,
  // and must not leak an undefined value into the hashed import input.
  dom = installStudyDom();
  await ui.mountStudyRegister(dom.root);
  await dom.findButton("Imports and searches").click();
  const csv = new TextEncoder().encode(
    "title,authors\nA fictional citation,Unmapped author\nAnother fictional citation,Another author",
  );
  dom.field("Citation CSV file").files = [
    {
      name: "fictional.csv",
      size: csv.byteLength,
      arrayBuffer: async () => csv.buffer,
    },
  ];
  await dom.field("Citation CSV file").fire("change");
  await settleStudyUi(() => !!dom.field("authors column"));
  dom.field("authors column").value = "";
  await dom.field("authors column").fire("change");
  await dom.findButton("Preview mapped CSV").click();
  await settleStudyUi(() => !!dom.field("Import assignment reason"));
  dom.field("Import assignment reason").value =
    "Keep each fictional source separate after inspecting the rows.";
  await dom.field("Import assignment reason").fire("input");
  dom.field("Row 2 new group label").value = "reviewed-group";
  await dom.field("Row 2 new group label").fire("input");
  let warned = 0;
  await dom.window.fire("beforeunload", {
    preventDefault() {
      warned++;
    },
  });
  assert.equal(warned, 1);
  assert.equal(
    dom.findButton("Save mapping and provenance as a raw draft").disabled,
    true,
  );
  await dom.findButton("Save mapping and provenance as a raw draft").click();
  await dom.window.fire("beforeunload", {
    preventDefault() {
      warned++;
    },
  });
  assert.equal(
    warned,
    2,
    "Saving only mapping must not hide uncommitted row-assignment warnings.",
  );
  await dom.findButton("Review discarding this import preview").click();
  await dom.findButton("Discard preview assignments").click();
  await dom.findButton("Save mapping and provenance as a raw draft").click();
  await settleStudyUi(
    () =>
      dom.values.has(key) &&
      JSON.parse(dom.values.get(key)).draft.form?.kind === "import",
  );
  assert.equal(
    JSON.parse(dom.values.get(key)).draft.form.fields.reason,
    "Keep each fictional source separate after inspecting the rows.",
  );
  await dom.findButton("Preview mapped CSV").click();
  await settleStudyUi(() => !!dom.field("Import assignment reason"));
  assert.equal(
    dom.field("Import assignment reason").value,
    "Keep each fictional source separate after inspecting the rows.",
    "Fresh preview retains the restored/saved reason.",
  );
  await dom.findButton("Commit reviewed import").click();
  await settleStudyUi(
    () =>
      dom.values.has(key) &&
      JSON.parse(dom.values.get(key)).imports.length === 1,
  );
  const csvSaved = JSON.parse(dom.values.get(key));
  assert.equal(csvSaved.reports.length, 2);
  assert.equal(csvSaved.occurrences[0].imported.authors, null);
  assert.equal(csvSaved.occurrences[0].rawCells[1], "Unmapped author");
  assert.equal(Object.hasOwn(csvSaved.imports[0].columnMap, "authors"), false);
  assert.equal(
    dom.findButton("Review selected reports for an explicit merge").disabled,
    false,
  );

  dom = installStudyDom(null, { locks: false });
  await ui.mountStudyRegister(dom.root);
  await dom.findButton("Protocol").click();
  assert.equal(
    dom.findButton("Draft a new protocol").disabled,
    true,
    "Unsupported Web Locks never fall back to an optimistic write.",
  );
  console.log(
    "Study register UI: helper invariants and 11 actual-controller scenarios passed (route/mount, draft/save/reload/freeze, invalid raw draft repair, split raw/title preservation, stale revision, external save, corrupt recovery, failed clear, mapped import/unmapping, mapping-only dirty guard, unsupported locks).",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
