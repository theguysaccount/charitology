// Actual native producer/admission, SSR and mounted controller. No backend/provider.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler-rs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { pilotDom } from "../test-fixtures/website-pilot/ui-dom.mjs";
const temp = await mkdtemp(join(resolve("node_modules"), ".website-pilot-"));
let groups = 0,
  dispose;
const at = "2026-11-06T12:00:00.000Z";
const check = async (name, run) => {
  await run();
  groups++;
  console.log("✓ " + name);
};
async function bundle(contents, name, resolveDir = process.cwd(), extra = {}) {
  const b = await build({
    stdin: { contents, loader: "ts", resolveDir },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    define: {
      "import.meta.env.BASE_URL": '"/charitology/"',
      "import.meta.env.SITE": '"https://example.invalid"',
    },
    ...extra,
  });
  const file = join(temp, name + ".mjs");
  await writeFile(file, b.outputFiles[0].text);
  return import(pathToFileURL(file));
}
try {
  await check(
    "published source versions, producer and native interpreter inputs stay unchanged",
    async () => {
      const pins = JSON.parse(
        await readFile("test-fixtures/website-pilot/source-pins.json", "utf8"),
      );
      assert.equal(
        pins.baselineCommit,
        "4188b725a0e92c27651aab89680e0e745f1abcbe",
      );
      assert.equal(pins.nativeVersion, 1);
      assert.equal(pins.templateVersion, "0.1");
      for (const p of pins.files)
        assert.equal(
          createHash("sha256")
            .update(await readFile(p.path))
            .digest("hex"),
          p.sha256,
          p.path,
        );
    },
  );
  const m = await bundle(
    [
      "export * from './src/lib/client/website-pilot-model.ts';",
      "export * from './src/lib/client/website-pilot.ts';",
      "export {programWorkspaces,parseWorkspace,partnerBackup} from './src/lib/client/partner-programs.ts';",
      "export {parseRemainingRecordBackup,remainingRecordBackup} from './src/lib/client/remaining-record-recovery-formats.ts';",
    ].join("\n"),
    "actual",
  );
  await check("actual guide modules strict-compile without shims", () => {
    execFileSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--strict",
        "--target",
        "es2022",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--types",
        "node",
        "--lib",
        "es2022,dom,dom.iterable",
        "src/lib/client/website-pilot-model.ts",
        "src/lib/client/website-pilot.ts",
      ],
      { stdio: "pipe" },
    );
  });
  await check(
    "ordinary v1 native roundtrip uses unchanged producer and closed admission",
    () => {
      const state = m.blankWebsitePilot(),
        text = m.websitePilotNative(state);
      assert.equal(state.version, 1);
      assert.equal(state.program, "nonprofit-advisory");
      assert.deepEqual(Object.keys(state.records).sort(), [
        "actions",
        "diagnostics",
        "evidence",
        "learning",
        "readiness",
      ]);
      assert.equal(m.websitePilotCounts(state).records, 10);
      assert.deepEqual(
        m.parseWorkspace(
          JSON.parse(text),
          m.programWorkspaces["nonprofit-advisory"],
        ),
        state,
      );
      assert.deepEqual(
        m.parseRemainingRecordBackup(text, m.WEBSITE_PILOT_KEY),
        state,
      );
      assert.equal(m.websitePilotNative(m.restoreWebsitePilot(text)), text);
      assert.equal(
        m.websitePilotHash(text),
        createHash("sha256").update(text).digest("hex"),
      );
      assert.ok(
        Object.isFrozen(state) && Object.isFrozen(state.records.learning),
      );
    },
  );
  await check(
    "unknown and negative website findings do not become OS results or permissions",
    () => {
      const state = m.blankWebsitePilot(),
        raw = {
          ...m.websitePilotValues(state),
          alias: "Fictional team",
          visitor: "Find the volunteer role",
          finding: "Could not find the existing application route.",
          result:
            "The revised concept was harder to use. Keep the current page.",
          decision: "Stop this change; no favorable outcome measured.",
          publicationStatus: "Evidence recorded locally",
          publication: "Withheld — this version must remain private.",
          recurring: "No recurring messages requested.",
          osChoice: "Website only. No OS trial agreed.",
        };
      const next = m.applyWebsitePilotFields(state, raw, at),
        briefs = m.websitePilotBriefs(next);
      assert.match(briefs["website-preview-brief"], /harder to use/);
      assert.match(briefs["website-preview-brief"], /Withheld/);
      assert.doesNotMatch(briefs["os-pilot-brief"], /harder to use/);
      assert.match(briefs["os-pilot-brief"], /no OS trial is recorded/);
      assert.match(briefs["website-preview-brief"], /not verified approvals/);
      assert.equal(next.updated, at);
      assert.equal(next.context.name, "Fictional team");
      assert.equal(state.context.name, "");
      assert.equal(
        m.applyWebsitePilotFields(
          next,
          m.websitePilotValues(next),
          "2026-11-07T00:00:00Z",
        ).updated,
        at,
      );
    },
  );
  await check(
    "complete native retains extra records and exact text while selected briefs exclude them",
    () => {
      const base = structuredClone(m.blankWebsitePilot()),
        collection = m.programWorkspaces["nonprofit-advisory"].collections.find(
          (c) => c.key === "evidence",
        );
      const extra = structuredClone(base.records.evidence[0]);
      extra.id = "unselected-private-record";
      extra.values.title = "UNSELECTED_PRIVATE_SENTINEL";
      base.records.evidence.push(extra);
      base.context.name = "  Retained exact spelling  ";
      base.records.evidence[0].values.finding = "  recorded text  ";
      const text = JSON.stringify(base, null, 2),
        restored = m.restoreWebsitePilot(text);
      assert.equal(m.websitePilotNative(restored), text);
      assert.equal(restored.context.name, base.context.name);
      const changed = m.applyWebsitePilotFields(
        restored,
        { ...m.websitePilotValues(restored), feedback: "A negative response." },
        at,
      );
      assert.deepEqual(
        changed.records.evidence.find((r) => r.id === extra.id),
        extra,
      );
      assert.equal(m.websitePilotCounts(changed).otherRecords, 1);
      for (const brief of Object.values(m.websitePilotBriefs(changed)))
        assert.ok(!brief.includes("UNSELECTED_PRIVATE_SENTINEL"));
      assert.equal(collection.key, "evidence");
    },
  );
  await check(
    "uncollected hosting, verification, approval and OS-version facts stay unknown",
    () => {
      const state = m.blankWebsitePilot(),
        raw = {
          ...m.websitePilotValues(state),
          publication: "PUBLICATION_NOTE_SENTINEL",
          publicationStatus: "Evidence recorded locally",
          osTask: "OS_WORKFLOW_SENTINEL",
          capacity: "Recorded capacity note",
          voice: "Recorded disagreement route",
        };
      const next = m.applyWebsitePilotFields(state, raw, at),
        briefs = m.websitePilotBriefs(next);
      const answer = (text, label) =>
        text.split(label + "\n\n")[1].split("\n\n")[0];
      for (const label of [
        "Exact preview reviewed:",
        "Approved exact version and changes:",
        "Hosting/domain/editorial owner:",
        "Donation/application route verification:",
        "Backup and rollback method:",
      ]) {
        assert.match(
          answer(briefs["website-preview-brief"], label),
          /Unknown — not separately collected/,
        );
        assert.ok(
          !answer(briefs["website-preview-brief"], label).includes(
            "PUBLICATION_NOTE_SENTINEL",
          ),
        );
      }
      assert.match(
        answer(briefs["os-pilot-brief"], "Proposed change/version:"),
        /Unknown — not separately collected/,
      );
      assert.ok(
        !answer(briefs["os-pilot-brief"], "Proposed change/version:").includes(
          "OS_WORKFLOW_SENTINEL",
        ),
      );
      assert.match(briefs["website-preview-brief"], /Recorded capacity note/);
      assert.match(
        briefs["website-preview-brief"],
        /Recorded disagreement route/,
      );
      for (const brief of Object.values(briefs))
        assert.ok(
          brief.includes(m.websitePilotHash(m.websitePilotNative(next))),
        );
    },
  );
  await check(
    "native field/date/shape/UTF8 limits refuse without repair or truncation",
    () => {
      const state = m.blankWebsitePilot(),
        raw = m.websitePilotValues(state),
        text = m.websitePilotNative(state);
      assert.throws(() =>
        m.applyWebsitePilotFields(state, { ...raw, checked: "2026-02-29" }, at),
      );
      assert.throws(() =>
        m.applyWebsitePilotFields(
          state,
          { ...raw, alias: "x".repeat(501) },
          at,
        ),
      );
      assert.throws(() =>
        m.applyWebsitePilotFields(
          state,
          { ...raw, website: "https://user:pass@example.invalid/" },
          at,
        ),
      );
      assert.throws(() =>
        m.restoreWebsitePilot(
          text.replace('"version": 1', '"version": 1, "version": 1'),
        ),
      );
      assert.throws(() => m.restoreWebsitePilot(new Uint8Array([0xc3, 0x28])));
      const general = structuredClone(state);
      general.records.learning = [];
      assert.throws(
        () => m.restoreWebsitePilot(JSON.stringify(general)),
        /named case records/,
      );
      const foreign = structuredClone(state);
      foreign.context.unrecognized = "must not drop";
      assert.throws(() => m.restoreWebsitePilot(JSON.stringify(foreign)));
      assert.equal(m.websitePilotNative(state), text);
    },
  );
  await check("whole selected file cap is exactly eight million bytes", () => {
    const text = m.websitePilotNative(m.blankWebsitePilot()),
      exact = text + " ".repeat(8_000_000 - Buffer.byteLength(text));
    assert.equal(Buffer.byteLength(exact), 8_000_000);
    assert.deepEqual(m.restoreWebsitePilot(exact), m.blankWebsitePilot());
    assert.throws(() => m.restoreWebsitePilot(exact + " "));
  });
  await check("authored text is literal in both Markdown briefs", () => {
    const state = m.blankWebsitePilot(),
      raw = {
        ...m.websitePilotValues(state),
        feedback:
          "<script>alert(1)</script>\n# Forged approval\n[send](javascript:alert(1))",
        osFeedback: "<img src=x onerror=alert(1)>",
      };
    const briefs = m.websitePilotBriefs(
      m.applyWebsitePilotFields(state, raw, at),
    );
    for (const text of Object.values(briefs)) {
      assert.doesNotMatch(text, /<script>|<img |^\s*# Forged approval/m);
      assert.match(text, /self-recorded/);
    }
  });
  const sourcePath = "src/components/WebsitePilotGuide.astro",
    source = await readFile(sourcePath, "utf8");
  const compiled = await transform(source, {
    filename: resolve(sourcePath),
    internalURL: "astro/compiler-runtime",
    resolvePath: async (s) => s,
  });
  assert.equal(compiled.diagnostics.filter((d) => d.severity === 1).length, 0);
  const component = await bundle(
    compiled.code,
    "component",
    dirname(resolve(sourcePath)),
    {
      packages: "external",
      plugins: [
        {
          name: "ignore-actual-SSR-css",
          setup(b) {
            b.onResolve({ filter: /(?:\?astro&type=style|\.css$)/ }, () => ({
              path: "style",
              namespace: "css",
            }));
            b.onLoad({ filter: /.*/, namespace: "css" }, () => ({
              contents: "",
              loader: "js",
            }));
          },
        },
      ],
    },
  );
  const container = await AstroContainer.create(),
    html = await container.renderToString(component.default);
  await check(
    "actual SSR has disabled unnamed private controls and base-aware local handoff",
    () => {
      const d = pilotDom(html);
      assert.equal(d.$("[data-pilot-controls]").disabled, true);
      for (const control of d.root.querySelectorAll("input,textarea,select"))
        assert.equal(control.name, "");
      assert.equal(d.$("[data-pilot-os-link]").getAttribute("href"), null);
      assert.ok(html.includes("/charitology/programs/nonprofit-advisory/"));
      assert.ok(!html.includes("#learning"));
      assert.match(html, /needs JavaScript/);
      d.noExternal();
    },
  );
  function start() {
    dispose?.();
    const d = pilotDom(html);
    dispose = m.mountWebsitePilotGuide(d.root);
    assert.equal(d.root.dataset.pilotReady, "true");
    d.noExternal();
    d.edit = async (id, value, event = "input") => {
      d.field(id).value = value;
      await d.field(id).fire(event);
    };
    d.choose = async (file) => {
      d.$("[data-pilot-file]").files = file ? [file] : [];
      await d.$("[data-pilot-file]").fire("change");
      await Promise.resolve();
    };
    d.review = () => d.$("[data-pilot-review]").click();
    d.reviewAck = async () => {
      d.$("[data-pilot-reviewed]").checked = true;
      await d.$("[data-pilot-reviewed]").fire("change");
    };
    d.replaceAck = async () => {
      d.$("[data-pilot-replace-ack]").checked = true;
      await d.$("[data-pilot-replace-ack]").fire("change");
    };
    return d;
  }
  await check(
    "actual mounted website-only case produces all three reviewed files with zero external calls",
    async () => {
      const d = start();
      await d.edit("alias", "Fictional local team");
      await d.edit("result", "Unknown — not yet tested.");
      await d.review();
      assert.equal(d.$("[data-pilot-native]").disabled, true);
      await d.reviewAck();
      await d.$("[data-pilot-native]").click();
      await d.$("[data-pilot-website]").click();
      await d.$("[data-pilot-os-brief]").click();
      assert.equal(d.downloads.length, 3);
      const text = await d.downloads[0].text();
      assert.equal(
        m.restoreWebsitePilot(text).context.name,
        "Fictional local team",
      );
      assert.match(d.message(), /Check the saved file/);
      assert.equal(d.$("[data-pilot-os-link]").getAttribute("href"), null);
      d.noExternal();
      const leaving = await d.window.fire("beforeunload");
      assert.equal(
        leaving.defaultPrevented,
        true,
        "download does not pretend persistence",
      );
    },
  );
  await check(
    "stale review and invalid writing remain visible with a separate exact text recovery",
    async () => {
      const d = start();
      await d.review();
      await d.reviewAck();
      d.field("alias").value = "Newer DOM without an event";
      await d.$("[data-pilot-native]").click();
      assert.equal(d.downloads.length, 0);
      assert.equal(d.field("alias").value, "Newer DOM without an event");
      await d.edit("reviewDate", "2026-02-");
      await d.review();
      assert.match(d.message(), /calendar date/);
      assert.equal(d.field("reviewDate").value, "2026-02-");
      await d.$("[data-pilot-raw]").click();
      assert.match(await d.downloads.at(-1).text(), /2026-02-/);
      await d.$("[data-pilot-last-valid]").click();
      assert.equal(
        m.restoreWebsitePilot(await d.downloads.at(-1).text()).context.name,
        "",
      );
      assert.match(d.message(), /excludes later/);
      d.noExternal();
    },
  );
  await check(
    "restore is preview-only until exact fresh replacement acknowledgement",
    async () => {
      const d = start(),
        state = m.applyWebsitePilotFields(
          m.blankWebsitePilot(),
          {
            ...m.websitePilotValues(m.blankWebsitePilot()),
            alias: "Imported fictional case",
          },
          at,
        );
      await d.edit("alias", "Keep current writing");
      await d.choose(d.nativeFile(m.websitePilotNative(state)));
      assert.equal(d.field("alias").value, "Keep current writing");
      assert.equal(d.$("[data-pilot-apply]").disabled, true);
      await d.replaceAck();
      await d.$("[data-pilot-apply]").click();
      assert.equal(d.field("alias").value, "Imported fictional case");
      assert.match(d.message(), /All native records were retained/);
      assert.equal(d.$("[data-pilot-os-choice]").checked, false);
      d.noExternal();
    },
  );
  await check(
    "untouched restored CRLF/input spelling survives native control normalization and no-op review",
    async () => {
      const d = start(),
        state = structuredClone(m.blankWebsitePilot());
      state.context.name = "Line A\r\nLine B";
      state.records.learning[0].values.feedback = "First\r\nSecond";
      const original = m.websitePilotNative(state);
      await d.choose(d.nativeFile(original));
      await d.replaceAck();
      await d.$("[data-pilot-apply]").click();
      assert.equal(d.field("alias").value, "Line ALine B");
      assert.equal(d.field("feedback").value, "First\nSecond");
      await d.review();
      await d.reviewAck();
      await d.$("[data-pilot-native]").click();
      assert.equal(
        await d.downloads.at(-1).text(),
        original,
        "No-op does not normalize stored text or rewrite timestamp",
      );
      await d.edit("capacity", "One explicit change");
      await d.review();
      await d.reviewAck();
      await d.$("[data-pilot-native]").click();
      const changed = m.restoreWebsitePilot(await d.downloads.at(-1).text());
      assert.equal(changed.context.name, "Line A\r\nLine B");
      assert.equal(
        changed.records.learning[0].values.feedback,
        "First\r\nSecond",
      );
      d.noExternal();
    },
  );
  await check(
    "native same-file picker retry creates a fresh preview; opening/cancel revokes old authority and retains writing",
    async () => {
      const d = start(),
        file = d.nativeFile(m.websitePilotNative(m.blankWebsitePilot()));
      await d.edit("alias", "Unfinished alias B");
      assert.equal(await d.pickFile(file), true);
      assert.equal(d.$("[data-pilot-restore]").hidden, false);
      assert.equal(d.field("alias").value, "Unfinished alias B");
      await d.replaceAck();
      await d.edit("current", "Keep this newer current-method note");
      assert.equal(d.$("[data-pilot-restore]").hidden, true);
      assert.equal(
        await d.pickFile(file),
        true,
        "Same saved path must trigger a new admission",
      );
      assert.equal(d.$("[data-pilot-restore]").hidden, false);
      assert.equal(d.$("[data-pilot-replace-ack]").checked, false);
      assert.equal(d.$("[data-pilot-apply]").disabled, true);
      assert.equal(
        d.field("current").value,
        "Keep this newer current-method note",
      );
      await d.replaceAck();
      await d.openPicker();
      assert.equal(d.$("[data-pilot-restore]").hidden, true);
      assert.equal(d.$("[data-pilot-apply]").disabled, true);
      assert.equal(d.$("[data-pilot-file]").files.length, 0);
      await d.finishPicker(null);
      assert.match(d.message(), /cancelled.*writing remains/i);
      assert.equal(d.field("alias").value, "Unfinished alias B");
      assert.equal(
        d.field("current").value,
        "Keep this newer current-method note",
      );
      const held = d.nativeFile(m.websitePilotNative(m.blankWebsitePilot()), {
        held: true,
      });
      await d.pickFile(held);
      const reader = d.readers.at(-1);
      await d.openPicker();
      assert.equal(reader.aborted, true);
      reader.load({ late: true });
      await d.finishPicker(null);
      assert.equal(d.$("[data-pilot-restore]").hidden, true);
      assert.equal(d.field("alias").value, "Unfinished alias B");
      d.noExternal();
    },
  );
  await check(
    "newer form and unannounced file choice cannot use stale Apply",
    async () => {
      const d = start(),
        text = m.websitePilotNative(m.blankWebsitePilot());
      await d.choose(d.nativeFile(text));
      await d.replaceAck();
      d.field("alias").value = "Retain newer B";
      await d.$("[data-pilot-apply]").click();
      assert.equal(d.field("alias").value, "Retain newer B");
      assert.equal(d.$("[data-pilot-restore]").hidden, true);
      await d.choose(d.nativeFile(text));
      await d.replaceAck();
      d.$("[data-pilot-file]").files = [d.nativeFile(text)];
      await d.$("[data-pilot-apply]").click();
      assert.equal(d.field("alias").value, "Retain newer B");
      d.noExternal();
    },
  );
  await check(
    "file A then invalid B/cancel/error cannot resurrect A or lose current writing",
    async () => {
      const d = start(),
        text = m.websitePilotNative(m.blankWebsitePilot());
      await d.edit("alias", "Protected writing");
      await d.choose(d.nativeFile(text, { held: true }));
      const a = d.readers.at(-1);
      await d.choose(d.nativeFile("{bad"));
      assert.equal(a.aborted, true);
      a.load({ late: true });
      assert.equal(d.$("[data-pilot-restore]").hidden, true);
      assert.equal(d.field("alias").value, "Protected writing");
      await d.choose(null);
      assert.equal(d.$("[data-pilot-apply]").disabled, true);
      await d.choose(d.nativeFile(text, { held: true }));
      d.readers.at(-1).fail();
      assert.match(d.message(), /could not be read/);
      d.noExternal();
    },
  );
  await check(
    "read deadlines, repeated replacements and disposal revoke owned reader authority",
    async () => {
      const d = start(),
        text = m.websitePilotNative(m.blankWebsitePilot());
      await d.edit("alias", "Writing survives");
      for (let n = 0; n < 20; n++)
        await d.choose(d.nativeFile(text, { held: true }));
      assert.equal(d.maxActiveReaders, 1);
      const last = d.readers.at(-1);
      d.readDeadline();
      last.load({ late: true });
      assert.equal(d.$("[data-pilot-restore]").hidden, true);
      assert.match(d.message(), /timed out/);
      await d.choose(d.nativeFile(text, { held: true }));
      const held = d.readers.at(-1);
      dispose();
      held.load({ late: true });
      assert.equal(held.aborted, true);
      assert.equal(d.activeReaders(), 0);
      assert.equal(d.field("alias").value, "Writing survives");
      d.noExternal();
    },
  );
  await check(
    "recorded permission never reveals OS link; fresh choice opens only clean published home",
    async () => {
      const d = start();
      await d.edit("osChoice", "Self-recorded evidence exists.");
      assert.equal(d.$("[data-pilot-os-link]").getAttribute("href"), null);
      d.$("[data-pilot-os-choice]").checked = true;
      await d.$("[data-pilot-os-choice]").fire("change");
      assert.equal(
        d.$("[data-pilot-os-link]").href,
        "https://os.charitology.org/",
      );
      await d.edit("feedback", "A later disagreement.");
      assert.equal(d.$("[data-pilot-os-choice]").checked, false);
      assert.equal(d.$("[data-pilot-os-link]").getAttribute("href"), null);
      await d.window.fire("pagehide");
      assert.equal(d.$("[data-pilot-native]").disabled, true);
      d.noExternal();
    },
  );
  console.log(
    "Website pilot guide: " +
      groups +
      " actual groups passed; no native browser/Save or backend claims.",
  );
} finally {
  dispose?.();
  await rm(temp, { recursive: true, force: true });
}
