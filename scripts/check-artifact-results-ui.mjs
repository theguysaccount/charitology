import assert from "node:assert/strict";
import { build } from "esbuild";
import postcss from "postcss";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  installArtifactDom,
  settleArtifactUi,
} from "../test-fixtures/artifact-results/ui-dom.mjs";
import {
  withProject,
  workflow,
  legacyExport,
  protocolContent,
  at,
} from "../test-fixtures/artifact-results/factory.mjs";

const temporary = await mkdtemp(join(tmpdir(), "charitology-artifact-ui-"));
let groups = 0;
try {
  // Check the actual component palette against both published theme palettes, including hover and warnings.
  // This catches light component surfaces inheriting nearly-white site text in dark mode.
  const globalCss = postcss.parse(
    await readFile("src/styles/global.css", "utf8"),
  );
  const localCss = postcss.parse(
    await readFile("src/styles/artifact-results.css", "utf8"),
  );
  const declarations = (tree, selector) => {
    let result = {};
    tree.walkRules((rule) => {
      if (rule.selector === selector)
        rule.walkDecls((d) => (result[d.prop] = d.value));
    });
    return result;
  };
  const baseTheme = declarations(globalCss, ":root"),
    darkTheme = declarations(globalCss, ":root[data-theme='dark']");
  const luminance = (hex) => {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const [theme, values] of [
    ["light", baseTheme],
    ["dark", { ...baseTheme, ...darkTheme }],
  ]) {
    const vars = { ...values, ...declarations(localCss, ".artifact-results") };
    const resolve = (value) =>
      value.replace(/var\((--[a-z0-9-]+)\)/g, (_all, key) => {
        assert.ok(vars[key], key);
        return resolve(vars[key]);
      });
    const declaration = (selector, key) =>
      resolve(declarations(localCss, selector)[key]);
    const contrast = (fg, bg, description) => {
      const pair = [luminance(resolve(fg)), luminance(resolve(bg))].sort(
        (a, b) => b - a,
      );
      assert.ok(
        (pair[0] + 0.05) / (pair[1] + 0.05) >= 4.5,
        `${theme}: ${description} must have at least 4.5:1 text contrast`,
      );
    };
    const surface = declaration(
      ".artifact-results .ar-workspace",
      "background",
    );
    contrast(values["--ink"], surface, "heading on workspace");
    contrast(values["--ink-2"], surface, "body on workspace");
    contrast(
      declaration(".artifact-results .ar-note", "color"),
      surface,
      "small note on workspace",
    );
    contrast(
      declaration(".artifact-results .ar-button", "color"),
      declaration(".artifact-results .ar-button", "background"),
      "ordinary button",
    );
    contrast(
      declaration(".artifact-results .ar-primary", "color"),
      declaration(".artifact-results .ar-primary", "background"),
      "primary button",
    );
    contrast(
      declaration(".artifact-results .ar-primary:hover", "color"),
      declaration(".artifact-results .ar-primary:hover", "background"),
      "primary hover",
    );
    contrast(values["--ink-2"], values["--highlight"], "warning body and note");
    contrast(
      declaration(".artifact-results .ar-error", "color"),
      surface,
      "validation error",
    );
  }
  groups++;

  const outfile = join(temporary, "ui.mjs");
  await build({
    stdin: {
      contents:
        "export * from './src/lib/client/artifact-results-ui.ts';export * from './src/lib/client/artifact-results-ui-helpers.ts';export * from './src/lib/client/artifact-results-model.ts';export * from './src/lib/client/artifact-results-import.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });
  const ui = await import(pathToFileURL(outfile));
  const key = "charitology.artifact-results.v1";
  const epoch = ui.artifactUiGeneration(),
    token = epoch.current();
  epoch.invalidate();
  assert.equal(epoch.matches(token), false);
  assert.equal(ui.artifactNumber("", "Estimate"), null);
  assert.equal(ui.artifactNumber("0", "Estimate"), 0);
  assert.equal(ui.artifactNumber("-1.2", "Estimate"), -1.2);
  assert.throws(() => ui.artifactNumber("Infinity", "Estimate"), /finite/);
  await assert.rejects(
    () => ui.readArtifactFile(() => new Promise(() => {}), 5),
    /fresh local copy/,
  );
  assert.equal(
    ui.artifactPage(
      Array.from({ length: 51 }, (_, i) => i),
      99,
    ).page,
    2,
  );
  groups++;

  let dom = installArtifactDom();
  await ui.mountArtifactResults(dom.root);
  assert.ok(dom.root.querySelector(".artifact-results-mount").children.length);
  await dom.findButton("Draft a Methods protocol").click();
  const content = protocolContent(ui, "methods-lab"),
    adapter = ui.adapterForProgram("methods-lab");
  for (const f of adapter.fields) {
    const el = dom.field(f.label);
    assert.ok(el, f.label);
    el.value = content.values[f.key];
    await el.fire(f.type === "select" ? "change" : "input");
  }
  await dom.findButton("Freeze this protocol").click();
  await settleArtifactUi(() => dom.values.has(key));
  let saved = JSON.parse(dom.values.get(key));
  assert.equal(saved.projects.length, 1);
  assert.equal(
    saved.protocols[0].content.values.title,
    "Synthetic methods-lab",
  );
  assert.equal(saved.results.length, 0);
  groups++;

  await dom.findButton("Artifacts").click();
  await dom.findButton("Describe a first artifact manifest").click();
  for (const [label, value] of [
    ["Artifact 1 title", "Synthetic descriptor"],
    ["Environment and dependencies", "Fictional environment only."],
    ["Run or inspection instructions", "No actual execution."],
    [
      "Deviations from the frozen plan",
      "None reported in this fictional record.",
    ],
  ]) {
    const el = dom.field(label);
    el.value = value;
    await el.fire("input");
  }
  await dom.findButton("Freeze artifact manifest").click();
  await settleArtifactUi(
    () => JSON.parse(dom.values.get(key)).manifests.length === 1,
  );
  saved = JSON.parse(dom.values.get(key));
  assert.equal(saved.manifests[0].content.artifacts[0].checksum, null);
  assert.equal(saved.results.length, 0);
  groups++;

  await dom.findButton("Results").click();
  await dom.findButton("Record a first result").click();
  let checkbox = dom.field("Include later reported estimate");
  checkbox.checked = true;
  await checkbox.fire("change");
  for (const [label, value] of [
    ["Later reported estimate: Estimate", "0"],
    ["Later reported estimate: Denominator", "0"],
    ["Result summary", "No later observation yet."],
    ["Result deviations", "None reported."],
    ["Result limitations", "Synthetic UI test; no evidence claim."],
  ]) {
    const el = dom.field(label);
    el.value = value;
    await el.fire("input");
  }
  // The default not-observed type cannot masquerade as a measured zero.
  const before = dom.values.get(key);
  await dom.findButton("Record this result").click();
  await settleArtifactUi(() =>
    dom.root.querySelector(".ar-status").className.includes("ar-error"),
  );
  assert.equal(dom.values.get(key), before);
  assert.equal(dom.field("Later reported estimate: Estimate").value, "0");
  checkbox = dom.field("Include later reported estimate");
  checkbox.checked = false;
  await checkbox.fire("change");
  await dom.findButton("Record this result").click();
  await settleArtifactUi(
    () => JSON.parse(dom.values.get(key)).results.length === 1,
  );
  saved = JSON.parse(dom.values.get(key));
  assert.equal(saved.results[0].content.reported, null);
  groups++;

  // Malformed descriptor JSON remains exact through mounting, explicit draft-save and backup.
  let source = await withProject(ui, "methods-lab");
  const view = ui.artifactProjectView(source, source.projects[0].id);
  source = {
    ...source,
    draft: {
      tab: "artifacts",
      selectedProjectId: view.project.id,
      form: {
        kind: "manifest",
        targetId: view.project.id,
        fields: {
          projectId: view.project.id,
          protocolId: view.currentProtocol.id,
          protocolHash: view.currentProtocol.hash,
          previousId: "",
          environment: "unfinished",
          runInstructions: "unfinished",
          deviations: "unfinished",
          artifact0: '{unfinished descriptor "text',
        },
      },
      dirty: true,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  assert.equal(
    dom.field("Raw field: artifact0").value,
    '{unfinished descriptor "text',
  );
  await dom.findButton("Save repaired raw form").click();
  await settleArtifactUi(() => dom.root.textContent.includes("Raw form saved"));
  saved = JSON.parse(dom.values.get(key));
  assert.equal(
    saved.draft.form.fields.artifact0,
    '{unfinished descriptor "text',
  );
  assert.equal(
    (await ui.parseArtifactBackup(await ui.makeArtifactBackup(saved, at))).draft
      .form.fields.artifact0,
    '{unfinished descriptor "text',
  );
  groups++;

  // A delayed selected-file read cannot update a different or externally superseded form.
  source = await withProject(ui, "methods-lab");
  source = {
    ...source,
    draft: {
      tab: "projects",
      selectedProjectId: source.projects[0].id,
      form: null,
      dirty: false,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Artifacts").click();
  await dom.findButton("Describe a first artifact manifest").click();
  const file = dom.root
    .querySelectorAll("input")
    .find((x) => x.getAttribute("type") === "file");
  let finish;
  file.files = [
    {
      size: 3,
      name: "fictional.txt",
      arrayBuffer: () => new Promise((resolve) => (finish = resolve)),
    },
  ];
  await file.fire("change");
  const original = dom.values.get(key);
  dom.values.set(key, original + " ");
  await dom.window.fire("storage", { key });
  finish(new TextEncoder().encode("abc").buffer);
  await settleArtifactUi(() =>
    dom.root.textContent.includes("late checksum was discarded"),
  );
  assert.equal(dom.values.get(key), original + " ");
  assert.ok(
    !dom.root.textContent.includes("Self-recorded local-byte checksum:"),
  );
  assert.equal(dom.field("Artifact 1 title").value, "");
  groups++;

  // Fresh imports bind selected bytes; saving mapping/assignments invalidates preview authority and keeps warning.
  dom = installArtifactDom();
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Import old saved work").click();
  const bytes = new TextEncoder().encode(
    JSON.stringify(legacyExport(ui, "methods-lab", "synthetic-row")),
  );
  const importFile = dom.root
    .querySelectorAll("input")
    .find((x) => x.getAttribute("type") === "file");
  importFile.files = [
    {
      size: bytes.length,
      name: "fictional.json",
      arrayBuffer: async () => bytes.buffer,
    },
  ];
  await importFile.fire("change");
  await settleArtifactUi(() =>
    Boolean(
      dom.field("Select saved record: Synthetic methods-lab (synthetic-row)"),
    ),
  );
  checkbox = dom.field(
    "Select saved record: Synthetic methods-lab (synthetic-row)",
  );
  checkbox.checked = true;
  await checkbox.fire("change");
  await dom.findButton("Preview selected saved records").click();
  await settleArtifactUi(() =>
    Boolean(dom.findButton("Commit all reviewed import assignments")),
  );
  await dom
    .findButton("Save import mapping and assignments as a raw draft")
    .click();
  await settleArtifactUi(() => dom.root.textContent.includes("Raw form saved"));
  assert.equal(
    Boolean(dom.findButton("Commit all reviewed import assignments")),
    false,
    "State-revision change invalidates old import preview.",
  );
  const draft = JSON.parse(dom.values.get(key)).draft.form;
  assert.equal(JSON.parse(draft.fields.assignment0).recordId, "synthetic-row");
  let prevented = false;
  await dom.window.fire("beforeunload", {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(
    prevented,
    true,
    "File and preview authority are not durable raw metadata.",
  );
  await dom.findButton("Preview selected saved records").click();
  await settleArtifactUi(() =>
    Boolean(dom.findButton("Commit all reviewed import assignments")),
  );
  await dom.findButton("Commit all reviewed import assignments").click();
  await settleArtifactUi(
    () => JSON.parse(dom.values.get(key)).projects.length === 1,
  );
  groups++;

  // Reopened raw form keeps its exact old protocol binding; foreign writes never silently retarget it.
  source = await workflow(ui);
  const current = ui.artifactProjectView(source, source.projects[0].id);
  source = {
    ...source,
    draft: {
      tab: "compare",
      selectedProjectId: current.project.id,
      form: {
        kind: "comparison",
        targetId: current.project.id,
        fields: {
          resultId: current.latestResult.id,
          resultHash: current.latestResult.hash,
          supersedesId: current.latestComparison.id,
          compatible: "false",
          compatibilityReason: "unfinished compatibility",
          showDifference: "false",
          interpretation: "unfinished",
          limitations: "unfinished",
          nextCheck: "unfinished",
        },
      },
      dirty: true,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  assert.equal(
    dom.field("Compatibility reason").value,
    "unfinished compatibility",
  );
  dom.values.set(key, dom.values.get(key) + " ");
  await dom.window.fire("storage", { key });
  assert.equal(
    dom.field("Compatibility reason").value,
    "unfinished compatibility",
  );
  assert.equal(dom.findButton("Record this comparison").disabled, true);
  groups++;

  // Corrupt-copy fallback has recovery, not invented empty totals; old research keys are not read or changed.
  dom = installArtifactDom("{bad saved bytes");
  dom.values.set("charitology.research.methods-lab", "private legacy sentinel");
  await ui.mountArtifactResults(dom.root);
  assert.ok(
    dom.root.textContent.includes("does not substitute empty-register totals"),
  );
  await dom.findButton("Review recovery choices").click();
  assert.equal(dom.findButton("Review clearing this register").disabled, false);
  assert.equal(
    dom.values.get("charitology.research.methods-lab"),
    "private legacy sentinel",
  );
  groups++;

  // Quota-failed writes retain the valid candidate and explicit unsaved copy.
  dom = installArtifactDom(JSON.stringify(source), { failWrite: true });
  await ui.mountArtifactResults(dom.root);
  const quotaBefore = dom.values.get(key);
  dom.field("Compatibility reason").value = "A newer unsaved reason";
  await dom.field("Compatibility reason").fire("input");
  await dom.findButton("Save raw form draft").click();
  await settleArtifactUi(() => dom.root.textContent.includes("only in memory"));
  assert.equal(dom.values.get(key), quotaBefore);
  assert.equal(
    dom.field("Compatibility reason").value,
    "A newer unsaved reason",
  );
  groups++;

  // Packet disclosure is adjacent to deliberately enabled action, and plain recovery never passes as a backup.
  dom = installArtifactDom(JSON.stringify(await workflow(ui)));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Packets and recovery").click();
  assert.ok(
    dom.root.textContent.includes(
      "Packet JSON contains the whole private register, including unselected projects and saved form fields.",
    ),
  );
  assert.equal(
    dom.findButton("Record packet and download full private JSON").disabled,
    true,
  );
  const raw = ui.rawArtifactFormRecovery(source.draft.form, at);
  assert.ok(
    raw.startsWith(
      "Unfinished raw form recovery; not a valid workspace backup or research record",
    ),
  );
  await assert.rejects(() => ui.parseArtifactBackup(raw));
  groups++;
  // Explicit local bytes produce only a self-recorded descriptor; oversize is rejected before reading.
  source = await withProject(ui, "methods-lab");
  source = {
    ...source,
    draft: {
      tab: "projects",
      selectedProjectId: source.projects[0].id,
      form: null,
      dirty: false,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Artifacts").click();
  await dom.findButton("Describe a first artifact manifest").click();
  let selectedFile = dom.root
    .querySelectorAll("input")
    .find((x) => x.getAttribute("type") === "file");
  let readCalled = false;
  selectedFile.files = [
    {
      size: ui.ARTIFACT_LIMITS.localFileBytes + 1,
      name: "oversize.bin",
      arrayBuffer: async () => {
        readCalled = true;
        return new ArrayBuffer(0);
      },
    },
  ];
  await selectedFile.fire("change");
  await settleArtifactUi(() =>
    dom.root.querySelector(".ar-status").className.includes("ar-error"),
  );
  assert.equal(readCalled, false);
  const abc = new TextEncoder().encode("abc");
  selectedFile.files = [
    { size: 3, name: "fictional.txt", arrayBuffer: async () => abc.buffer },
  ];
  await selectedFile.fire("change");
  await settleArtifactUi(() =>
    dom.root.textContent.includes("Self-recorded local-byte checksum:"),
  );
  assert.ok(
    dom.root.textContent.includes(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ),
  );
  await dom.findButton("Save raw form draft").click();
  await settleArtifactUi(() => dom.values.get(key) !== JSON.stringify(source));
  const storedArtifact = JSON.parse(
    JSON.parse(dom.values.get(key)).draft.form.fields.artifact0,
  );
  assert.equal(storedArtifact.checksum.byteLength, 3);
  assert.equal(storedArtifact.fileName, "fictional.txt");
  assert.equal(Object.hasOwn(storedArtifact, "bytes"), false);
  assert.deepEqual(new Set(dom.reads), new Set([key]));
  groups++;

  // Sourced observed zero and a compatible zero difference remain explicit zero, not missing.
  source = await workflow(ui);
  source = {
    ...source,
    draft: {
      tab: "projects",
      selectedProjectId: source.projects[0].id,
      form: null,
      dirty: false,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Results").click();
  await dom.findButton("Record a superseding result").click();
  assert.equal(dom.field("Later reported estimate: Estimate").value, "0");
  assert.equal(dom.field("Original estimate: Estimate").value, "0");
  dom.field("Later reported estimate: Lower interval endpoint").value = "";
  await dom
    .field("Later reported estimate: Lower interval endpoint")
    .fire("input");
  await dom.findButton("Record this result").click();
  await settleArtifactUi(
    () => JSON.parse(dom.values.get(key)).results.length === 2,
  );
  saved = JSON.parse(dom.values.get(key));
  assert.equal(saved.results.at(-1).content.reported.estimate, 0);
  assert.equal(saved.results.at(-1).content.reported.lower, null);
  assert.equal(saved.results.at(-1).supersedesId, source.results[0].id);
  await dom.findButton("Comparison").click();
  await dom.findButton("Draft a comparison").click();
  for (const label of [
    "I declare these estimates compatible for the stated comparison",
    "Request the simple later-minus-original difference",
  ]) {
    const control = dom.field(label);
    control.checked = true;
    await control.fire("change");
  }
  for (const [label, value] of [
    [
      "Compatibility reason",
      "Same fictional unit, measure, population and horizon.",
    ],
    ["Interpretation", "Only an arithmetic comparison."],
    ["Comparison limitations", "No causal claim."],
    ["Next check", "Read a real source."],
  ]) {
    const control = dom.field(label);
    control.value = value;
    await control.fire("input");
  }
  await dom.findButton("Record this comparison").click();
  await settleArtifactUi(
    () => JSON.parse(dom.values.get(key)).comparisons.length === 2,
  );
  assert.ok(dom.root.textContent.includes("Later minus original: 0"));
  groups++;

  // A current-identical amendment is a no-op, preserving the unsaved open form and warning.
  await dom.findButton("Protocol").click();
  await dom.findButton("Draft an explicit amendment").click();
  dom.field("Reason for this amendment").value =
    "An unfinished reason, identical assumptions.";
  await dom.field("Reason for this amendment").fire("input");
  const exactBefore = dom.values.get(key);
  await dom.findButton("Freeze this protocol").click();
  await settleArtifactUi(() =>
    dom.root.textContent.includes("No duplicate version was added"),
  );
  assert.equal(dom.values.get(key), exactBefore);
  assert.equal(
    dom.field("Reason for this amendment").value,
    "An unfinished reason, identical assumptions.",
  );
  prevented = false;
  await dom.window.fire("beforeunload", {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  groups++;

  // A packet's full JSON contains unselected work; its CSV exports do not claim to contain it.
  source = await workflow(ui);
  source = (
    await ui.prepareArtifactCommand(
      source,
      {
        kind: "protocol.freeze",
        projectId: null,
        expectedProtocolId: null,
        expectedProtocolHash: null,
        content: protocolContent(ui, "methods-lab"),
        amendmentReason: "Synthetic second project.",
      },
      {
        expectedStateHash: await ui.artifactStateHash(source),
        at,
        makeId: (() => {
          let i = 0;
          return () => `second-project-${++i}`;
        })(),
      },
    )
  ).nextState;
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Packets and recovery").click();
  checkbox = dom.field(`Include project: ${source.projects[0].title}`);
  checkbox.checked = true;
  await checkbox.fire("change");
  checkbox = dom.field(
    "I understand that packet JSON also includes unselected projects and saved raw fields",
  );
  checkbox.checked = true;
  await checkbox.fire("change");
  await dom.findButton("Record packet and download full private JSON").click();
  await settleArtifactUi(() => dom.downloads.length === 6);
  const packetJson = await dom.downloads[0].blob.text();
  const packetState = await ui.parseArtifactBackup(packetJson);
  assert.equal(packetState.projects.length, 2);
  assert.deepEqual(packetState.packets.at(-1).projectIds, [
    source.projects[0].id,
  ]);
  const protocolsCsv = await dom.downloads[1].blob.text();
  assert.ok(protocolsCsv.includes(source.projects[0].title));
  assert.ok(!protocolsCsv.includes(source.projects[1].title));
  groups++;

  // A failed clear reports memory-only truth and preserves the protected corrupt bytes.
  dom = installArtifactDom("{protected corrupt", { failWrite: true });
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Review recovery choices").click();
  await dom.findButton("Review clearing this register").click();
  await settleArtifactUi(() =>
    Boolean(dom.findButton("Clear the new artifact/results register")),
  );
  await dom.findButton("Clear the new artifact/results register").click();
  await settleArtifactUi(() =>
    dom.root.textContent.includes("saved bytes were not changed"),
  );
  assert.equal(dom.values.get(key), "{protected corrupt");
  groups++;

  // Read denial never substitutes an empty saved copy or reads either previous desk key.
  dom = installArtifactDom(null, { failRead: true });
  await ui.mountArtifactResults(dom.root);
  assert.ok(
    dom.root.textContent.includes("does not substitute empty-register totals"),
  );
  await dom.findButton("Review recovery choices").click();
  assert.equal(
    dom.findButton("Download protected raw saved bytes (unverified)").disabled,
    true,
  );
  assert.deepEqual(new Set(dom.reads), new Set([key]));
  groups++;

  // Exact imported-identity replay is a no-op and cannot silently discard current unsaved import review.
  let importedState = ui.blankArtifactState("identity-ui-state", at);
  const importedBytes = new TextEncoder().encode(
    JSON.stringify(legacyExport(ui, "methods-lab", "same-source")),
  );
  const importInput = {
    kind: "legacy-research-json",
    bytes: importedBytes,
    fileName: "original.json",
    program: "methods-lab",
    selectedRecordIds: ["same-source"],
  };
  const identityPreview = await ui.previewProtocolImport(
    importedState,
    importInput,
    await ui.artifactStateHash(importedState),
  );
  importedState = (
    await ui.prepareArtifactCommand(
      importedState,
      {
        kind: "protocol.import",
        preview: identityPreview,
        assignments: [{ recordId: "same-source", target: { kind: "new" } }],
      },
      {
        expectedStateHash: await ui.artifactStateHash(importedState),
        at,
        makeId: (() => {
          let id = 0;
          return () => `identity-${++id}`;
        })(),
      },
    )
  ).nextState;
  dom = installArtifactDom(JSON.stringify(importedState));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Import old saved work").click();
  selectedFile = dom.root
    .querySelectorAll("input")
    .find((x) => x.getAttribute("type") === "file");
  selectedFile.files = [
    {
      size: importedBytes.length,
      name: "renamed.json",
      arrayBuffer: async () => importedBytes.buffer,
    },
  ];
  await selectedFile.fire("change");
  await settleArtifactUi(() =>
    Boolean(
      dom.field("Select saved record: Synthetic methods-lab (same-source)"),
    ),
  );
  checkbox = dom.field(
    "Select saved record: Synthetic methods-lab (same-source)",
  );
  checkbox.checked = true;
  await checkbox.fire("change");
  await dom.findButton("Preview selected saved records").click();
  await settleArtifactUi(() =>
    Boolean(dom.findButton("Commit all reviewed import assignments")),
  );
  const replayBefore = dom.values.get(key);
  await dom.findButton("Commit all reviewed import assignments").click();
  await settleArtifactUi(() =>
    dom.root.textContent.includes("No duplicate version was added"),
  );
  assert.equal(dom.values.get(key), replayBefore);
  assert.ok(dom.findButton("Commit all reviewed import assignments"));
  prevented = false;
  await dom.window.fire("beforeunload", {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  groups++;

  // Structured numeric validation failures are surfaced, with raw user input retained and no write.
  source = await workflow(ui);
  source = {
    ...source,
    draft: {
      tab: "projects",
      selectedProjectId: source.projects[0].id,
      form: null,
      dirty: false,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Results").click();
  await dom.findButton("Record a superseding result").click();
  dom.field("Later reported estimate: Estimate").value = "Infinity";
  await dom.field("Later reported estimate: Estimate").fire("input");
  const numericBefore = dom.values.get(key);
  await dom.findButton("Record this result").click();
  await settleArtifactUi(() =>
    dom.root.querySelector(".ar-status").textContent.includes("finite number"),
  );
  assert.equal(dom.values.get(key), numericBefore);
  assert.equal(
    dom.field("Later reported estimate: Estimate").value,
    "Infinity",
  );
  groups++;

  // Blank/missing serialized optional values need explicit repair, never implicit null.
  assert.throws(
    () => ui.artifactJson("", "Original estimate"),
    /unfinished JSON/,
  );
  assert.throws(
    () => ui.artifactJson(undefined, "Original estimate"),
    /unfinished JSON/,
  );
  assert.equal(ui.artifactJson("null", "Original estimate"), null);
  source = await workflow(ui);
  const rawView = ui.artifactProjectView(source, source.projects[0].id);
  source = {
    ...source,
    draft: {
      tab: "results",
      selectedProjectId: rawView.project.id,
      form: {
        kind: "result",
        targetId: rawView.project.id,
        fields: {
          projectId: rawView.project.id,
          protocolId: rawView.currentProtocol.id,
          protocolHash: rawView.currentProtocol.hash,
          manifestId: rawView.currentManifest.id,
          manifestHash: rawView.currentManifest.hash,
          supersedesId: rawView.latestResult.id,
          kind: "not-observed",
          observedOn: "",
          summary: "unfinished",
          original: "",
          reported: "null",
          sourceReferences: "[]",
          deviations: "unfinished",
          limitations: "unfinished",
          conflicts: '{"state":"unknown","note":null}',
        },
      },
      dirty: true,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  assert.equal(dom.field("Raw field: original").value, "");
  assert.ok(!dom.field("Include original estimate"));
  await dom.findButton("Save repaired raw form").click();
  await settleArtifactUi(() => dom.root.textContent.includes("Raw form saved"));
  assert.equal(JSON.parse(dom.values.get(key)).draft.form.fields.original, "");
  groups++;

  // Reload cannot claim validation when the newly read saved bytes are corrupt or unreadable.
  source = await workflow(ui);
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Packets and recovery").click();
  dom.values.set(key, "{new corrupt copy");
  await dom.findButton("Review reloading the browser copy").click();
  await dom.findButton("Discard local edits and reload saved copy").click();
  await settleArtifactUi(() =>
    dom.root
      .querySelector(".ar-status")
      .textContent.includes("could not be opened for writing"),
  );
  assert.ok(
    !dom.root
      .querySelector(".ar-status")
      .textContent.includes("reloaded and validated"),
  );
  assert.equal(dom.values.get(key), "{new corrupt copy");
  dom = installArtifactDom(null, { failRead: true });
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Review recovery choices").click();
  await dom.findButton("Review reloading the browser copy").click();
  await dom.findButton("Discard local edits and reload saved copy").click();
  await settleArtifactUi(() =>
    dom.root
      .querySelector(".ar-status")
      .textContent.includes("could not be opened for writing"),
  );
  assert.equal(
    dom.root.querySelector(".ar-status").className.includes("ar-error"),
    true,
  );
  groups++;

  // Undo restores raw import A without reusing file B or B's preview authority.
  dom = installArtifactDom();
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Import old saved work").click();
  const loadImport = async (recordId, title) => {
    const data = legacyExport(ui, "methods-lab", recordId);
    data.records[0].values.title = title;
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const file = dom.root
      .querySelectorAll("input")
      .find((x) => x.getAttribute("type") === "file");
    file.files = [
      {
        size: bytes.length,
        name: `${recordId}.json`,
        arrayBuffer: async () => bytes.buffer,
      },
    ];
    await file.fire("change");
    await settleArtifactUi(() =>
      Boolean(dom.field(`Select saved record: ${title} (${recordId})`)),
    );
    const selected = dom.field(`Select saved record: ${title} (${recordId})`);
    selected.checked = true;
    await selected.fire("change");
    await dom
      .findButton("Save import mapping and assignments as a raw draft")
      .click();
    await settleArtifactUi(() =>
      dom.root
        .querySelector(".ar-status")
        .textContent.includes("Raw form saved"),
    );
  };
  await loadImport("source-A", "Synthetic source A");
  const hashA = JSON.parse(dom.values.get(key)).draft.form.fields
    .sourceFileHash;
  await dom.findButton("Packets and recovery").click();
  await dom.findButton("Discard these edits and continue").click();
  await dom.findButton("Import old saved work").click();
  await loadImport("source-B", "Synthetic source B");
  assert.notEqual(
    JSON.parse(dom.values.get(key)).draft.form.fields.sourceFileHash,
    hashA,
  );
  await dom.findButton("Packets and recovery").click();
  await dom.findButton("Discard these edits and continue").click();
  await dom.findButton("Review undoing the last local save").click();
  await dom.findButton("Undo the last local save").click();
  await settleArtifactUi(() =>
    dom.root
      .querySelector(".ar-status")
      .textContent.includes("previous local state"),
  );
  assert.equal(
    JSON.parse(dom.values.get(key)).draft.form.fields.sourceFileHash,
    hashA,
  );
  assert.ok(dom.root.textContent.includes(hashA));
  assert.ok(dom.root.textContent.includes("No file bytes are retained"));
  assert.ok(!dom.field("Select saved record: Synthetic source B (source-B)"));
  assert.ok(!dom.findButton("Preview selected saved records"));
  assert.equal(
    dom.findButton("Import old saved work").getAttribute("aria-current"),
    "page",
  );
  groups++;

  // Revealing a structured estimate preserves keyboard focus on the same labeled choice.
  source = await workflow(ui);
  source = {
    ...source,
    draft: {
      tab: "projects",
      selectedProjectId: source.projects[0].id,
      form: null,
      dirty: false,
    },
  };
  dom = installArtifactDom(JSON.stringify(source));
  await ui.mountArtifactResults(dom.root);
  await dom.findButton("Results").click();
  await dom.findButton("Record a superseding result").click();
  checkbox = dom.field("Include original estimate");
  checkbox.focus();
  checkbox.checked = false;
  await checkbox.fire("change");
  assert.equal(
    dom.document.activeElement,
    dom.field("Include original estimate"),
  );
  assert.equal(dom.field("Original estimate: Estimate"), undefined);
  groups++;

  console.log(
    `Artifact/results UI: ${groups} helper and actual mounted-controller scenario groups passed.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
