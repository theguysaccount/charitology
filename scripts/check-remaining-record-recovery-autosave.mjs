// Actual RR autosaver + closed production engine; no browser or provider proof.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import {
  installRemainingDom,
  settle,
  spin,
  fakeClock,
} from "../test-fixtures/remaining-record-controls/ui-dom.mjs";
import { strict } from "../test-fixtures/program-record-recovery/engine-harness.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const built = await build({
  stdin: {
    contents:
      'export * from "./src/lib/client/remaining-record-recovery.ts";export * from "./src/lib/client/remaining-record-recovery-controls.ts";export * from "./src/lib/client/remaining-record-recovery-schemas.ts";export * from "./src/lib/client/remaining-record-recovery-formats.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
const KEY = "charitology-manuscript-v1",
  COUNTRY = "charitology-country-notes-v1";
const clone = (v) => JSON.parse(JSON.stringify(v));
let groups = 0;
const mounts = [];
const value = (name = "Fictional A", key = KEY) => {
  const v = clone(m.defaultRemainingRecordValue(key));
  if (key === KEY) v.title = name;
  return v;
};
const raw = (name = "Fictional A", key = KEY) =>
  m.remainingRecordBackup(key, value(name, key));
async function mount(opts = {}) {
  const key = opts.key ?? KEY,
    d = installRemainingDom({ [key]: opts.raw ?? raw("Fictional A", key) });
  d.key = key;
  d.view = m.createRemainingRecordView(key);
  d.session = await m.openRemainingRecordSession(key, { view: d.view });
  d.raw = value("Fictional draft", key);
  d.results = [];
  d.errors = [];
  d.reads = 0;
  d.form = opts.form ?? "manuscript";
  d.autosaver = m.createRemainingRecordDraftAutosaver({
    session: d.session,
    view: d.view,
    form: d.form,
    readCandidate: () => {
      assert.equal(d.lockDepth, 0);
      d.reads++;
      if (opts.readCandidate) return opts.readCandidate(d);
      return clone(d.raw);
    },
    onResult: (r) => {
      assert.equal(d.lockDepth, 0);
      assert.ok(Object.isFrozen(r));
      d.results.push(r);
      opts.onResult?.(r, d);
    },
    onError: (e) => {
      assert.equal(d.lockDepth, 0);
      d.errors.push(e);
      opts.onError?.(e, d);
    },
  });
  d.input = () => {
    d.view.changedForm(d.form);
    d.autosaver.noteInput();
  };
  mounts.push(d);
  return d;
}
function gate() {
  let started, release;
  const ready = new Promise((r) => (started = r)),
    wait = new Promise((r) => (release = r));
  return { started, release, ready, wait };
}
async function check(name, run) {
  if (
    process.env.REMAINING_RECORD_AUTOSAVE_CASE &&
    !name.includes(process.env.REMAINING_RECORD_AUTOSAVE_CASE)
  )
    return;
  try {
    await run();
    groups++;
    console.log("✓ " + name);
  } catch (e) {
    e.message = name + ": " + e.message;
    throw e;
  }
}
try {
  await check(
    "fixed owner and autosave family/form checks reject foreign tracker, partner and wrong form before any candidate read",
    async () => {
      const d = await mount();
      const other = m.createRemainingRecordView(KEY);
      assert.throws(
        () =>
          m.createRemainingRecordDraftAutosaver({
            session: d.session,
            view: other,
            form: "manuscript",
            readCandidate() {
              throw Error("not reached");
            },
            onResult() {},
            onError() {},
          }),
        (e) => e.code === "foreign_owner",
      );
      const key = "charitology.partner-workspace-v1.the-charitology-fund",
        view = m.createRemainingRecordView(key),
        session = await m.openRemainingRecordSession(key, { view });
      assert.throws(
        () =>
          m.createRemainingRecordDraftAutosaver({
            session,
            view,
            form: "context",
            readCandidate() {
              throw Error("not reached");
            },
            onResult() {},
            onError() {},
          }),
        /limited to/,
      );
      session.dispose();
      other.dispose();
    },
  );
  await check(
    "ten thousand raw input notifications retain one 250ms timer, read nothing early, then save only the latest complete candidate",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        for (let i = 0; i < 10000; i++) {
          d.raw.title = "Fictional " + i;
          d.input();
        }
        assert.equal(d.reads, 0);
        assert.equal(clock.count(250), 1);
        assert.equal(clock.maxDebounce(), 1);
        assert.equal(d.autosaver.hasPending(), true);
        await clock.tick(249);
        assert.equal(d.reads, 0);
        await clock.tick(1);
        await settle(() => !d.autosaver.hasPending());
        assert.equal(d.reads, 1);
        assert.equal(d.results.length, 1);
        assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional 9999");
        assert.equal(d.view.snapshot().generation, 10001);
        assert.deepEqual(d.view.snapshot().dirtyForms, ["manuscript"]);
        assert.equal(d.values.get("unrelated.private.key"), "unchanged");
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "flush consumes a timer immediately and awaits the exact same current unresolved request without rereading fields",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        const release = await d.hold(KEY);
        d.input();
        const one = d.autosaver.flush();
        await spin();
        const two = d.autosaver.flush();
        assert.equal(one, two);
        assert.equal(d.reads, 1);
        assert.equal(clock.count(250), 0);
        assert.equal(d.autosaver.hasPending(), true);
        release();
        const r = await one;
        assert.equal(r.outcome, "saved");
        assert.equal(d.autosaver.hasPending(), false);
        assert.equal(d.results.length, 1);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "an exact saved/no-op result owns its current token and only the caller may mark its submitted form clean",
    async () => {
      const d = await mount({
        onResult: (r, owner) => {
          assert.equal(owner.view.isCurrent(r.view), true);
          owner.view.markClean("manuscript", r.view);
        },
      });
      d.raw = value("Fictional A");
      d.input();
      const r = await d.autosaver.flush();
      assert.equal(r.outcome, "no-op");
      assert.deepEqual(d.view.snapshot().dirtyForms, []);
      assert.equal(d.operations.filter((o) => o[0] === "set").length, 0);
    },
  );
  await check(
    "view change before debounce or explicit flush suppresses the stale candidate read instead of reading a new source",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        d.input();
        d.view.changedView();
        await clock.tick(250);
        assert.equal(d.reads, 0);
        assert.equal(d.results.length, 0);
        assert.equal(d.errors.length, 0);
        assert.equal(d.autosaver.hasPending(), false);
        d.input();
        d.view.changedView();
        assert.equal(await d.autosaver.flush(), null);
        assert.equal(d.reads, 0);
        assert.equal(clock.count(250), 0);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "cancel drops unstarted timer work and suppresses a held operation response while hasPending still covers that unresolved save",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        d.input();
        d.autosaver.cancel();
        assert.equal(d.autosaver.hasPending(), false);
        await clock.tick(250);
        assert.equal(d.reads, 0);
        const release = await d.hold(KEY);
        d.input();
        const pending = d.autosaver.flush();
        await spin();
        d.view.changedView();
        d.autosaver.cancel();
        assert.equal(d.autosaver.hasPending(), true);
        release();
        const r = await pending;
        assert.equal(r.outcome, "superseded");
        assert.equal(d.autosaver.hasPending(), false);
        assert.equal(d.results.length, 0);
        assert.equal(d.errors.length, 0);
        assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional A");
        assert.deepEqual(d.view.snapshot().dirtyForms, ["manuscript"]);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "dispose drops unstarted timer and revokes helper notifications, without claiming an unresolved engine operation rolled back",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        d.input();
        d.autosaver.dispose();
        await clock.tick(250);
        assert.equal(d.reads, 0);
        assert.equal(await d.autosaver.flush(), null);
        const b = await mount();
        const release = await b.hold(KEY);
        b.input();
        const p = b.autosaver.flush();
        await spin();
        b.autosaver.dispose();
        assert.equal(b.autosaver.hasPending(), true);
        release();
        assert.equal((await p).outcome, "saved");
        assert.equal(b.autosaver.hasPending(), false);
        assert.equal(b.results.length, 0);
        assert.equal(b.errors.length, 0);
        assert.equal(JSON.parse(b.values.get(KEY)).title, "Fictional draft");
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "failed candidate persists exactly through newer raw typing, ordinary autosave refuses it, Retry never rereads the newer form",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        d.behavior.failWrite = true;
        d.raw.title = "Fictional exact failed";
        d.input();
        const failed = await d.autosaver.flush();
        assert.equal(failed.outcome, "unsaved");
        assert.equal(d.session.snapshot().pendingPersist, true);
        const exact = d.session.exportNative().text;
        d.raw.title = "Fictional newer raw";
        d.input();
        await clock.tick(250);
        assert.equal(d.errors.length, 1);
        assert.equal(d.session.exportNative().text, exact);
        assert.equal(d.raw.title, "Fictional newer raw");
        assert.equal(
          d.session.snapshot().value.title,
          "Fictional exact failed",
        );
        d.behavior.failWrite = false;
        const reads = d.reads;
        const retry = await d.session.retryPersist();
        assert.equal(retry.outcome, "saved");
        assert.equal(d.reads, reads);
        assert.equal(
          JSON.parse(d.values.get(KEY)).title,
          "Fictional exact failed",
        );
        assert.equal(d.raw.title, "Fictional newer raw");
        assert.deepEqual(d.view.snapshot().dirtyForms, ["manuscript"]);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "held native lock plus repeated timer fires coalesce engine work; only the newest owned result can notify",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        const release = await d.hold(KEY);
        for (let i = 0; i < 12; i++) {
          d.raw.title = "Fictional held " + i;
          d.input();
          await clock.tick(250);
        }
        assert.equal(d.autosaver.hasPending(), true);
        assert.equal(d.results.length, 0);
        assert.equal(d.errors.length, 0);
        assert.equal(d.operations.filter((o) => o[0] === "set").length, 0);
        release();
        await settle(() => !d.autosaver.hasPending());
        assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional held 11");
        assert.equal(d.operations.filter((o) => o[0] === "set").length, 1);
        assert.equal(d.results.length, 1);
        assert.equal(d.results[0].snapshot.value.title, "Fictional held 11");
        assert.equal(d.errors.length, 0);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "late actual lock rejection after newer input cannot show an obsolete error or reset raw fields",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount();
        const g = gate();
        d.rejectGate = g;
        d.input();
        const p = d.autosaver.flush();
        await g.ready;
        d.raw.title = "newer untouched raw";
        d.input();
        g.release();
        await p;
        assert.equal(d.errors.length, 0);
        assert.equal(d.results.length, 0);
        assert.equal(d.raw.title, "newer untouched raw");
        await clock.tick(250);
        await settle(() => !d.autosaver.hasPending());
        // Native pre-entry lock rejection makes this session read-only. The
        // later request may truthfully report its own failure, never the old one.
        assert.equal(d.results.length, 0);
        assert.equal(d.errors.length, 1);
        assert.match(d.errors[0].message, /read-only|Web Locks/);
        assert.equal(d.raw.title, "newer untouched raw");
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "late actual lock rejection after cancel or dispose suppresses stale onError",
    async () => {
      for (const action of ["cancel", "dispose"]) {
        const d = await mount();
        const g = gate();
        d.rejectGate = g;
        d.input();
        const p = d.autosaver.flush();
        await g.ready;
        d.autosaver[action]();
        g.release();
        assert.equal(await p, null);
        assert.equal(d.errors.length, 0);
        assert.equal(d.results.length, 0);
        assert.equal(d.autosaver.hasPending(), false);
      }
    },
  );
  await check(
    "synchronous candidate callback edit/throw invalidates that read; error notification never acquires newer ownership",
    async () => {
      const d = await mount({
        readCandidate: (owner) => {
          owner.view.changedForm("manuscript");
          throw Error("old error");
        },
      });
      d.input();
      assert.equal(await d.autosaver.flush(), null);
      assert.equal(d.errors.length, 0);
      assert.equal(d.results.length, 0);
      assert.equal(d.operations.filter((o) => o[0] === "set").length, 0);
      const b = await mount({
        readCandidate: () => {
          throw Error("current error");
        },
      });
      b.input();
      assert.equal(await b.autosaver.flush(), null);
      assert.equal(b.errors.length, 1);
      assert.match(b.errors[0].message, /current error/);
    },
  );
  await check(
    "reentrant input while reading discards old candidate without dirty-generation duplication then saves the latest timer",
    async () => {
      const clock = fakeClock();
      try {
        let once = false;
        const d = await mount({
          readCandidate: (owner) => {
            if (!once) {
              once = true;
              owner.raw.title = "Fictional reentrant latest";
              owner.input();
            }
            return clone(owner.raw);
          },
        });
        d.input();
        assert.equal(await d.autosaver.flush(), null);
        assert.equal(d.results.length, 0);
        assert.equal(d.errors.length, 0);
        await clock.tick(250);
        await settle(() => !d.autosaver.hasPending());
        assert.equal(
          JSON.parse(d.values.get(KEY)).title,
          "Fictional reentrant latest",
        );
        assert.equal(d.reads, 2);
        assert.equal(d.results.length, 1);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "notification exceptions cannot relabel actual persistence or lose dirty forms and admitted errors",
    async () => {
      const d = await mount({
        onResult: () => {
          throw Error("render failed");
        },
      });
      d.input();
      const r = await d.autosaver.flush();
      assert.equal(r.outcome, "saved");
      assert.equal(d.session.snapshot().persistence, "saved");
      assert.equal(JSON.parse(d.values.get(KEY)).title, "Fictional draft");
      assert.deepEqual(d.view.snapshot().dirtyForms, ["manuscript"]);
      const b = await mount({
        readCandidate: () => {
          throw Error("invalid current");
        },
        onError: () => {
          throw Error("bad notice");
        },
      });
      b.input();
      assert.equal(await b.autosaver.flush(), null);
      assert.equal(b.errors.length, 1);
      assert.deepEqual(b.view.snapshot().dirtyForms, ["manuscript"]);
    },
  );
  await check(
    "all seven research autosavers preserve sparse unfinished native strings without normalizing required partial fields",
    async () => {
      for (const key of m.RR_KEYS.filter((k) =>
        k.startsWith("charitology.research-program."),
      )) {
        const d = await mount({ key, form: "draft" });
        const program = key.slice(29, -3),
          field = m.RR_RESEARCH_SCHEMAS[program].fields[0].key;
        d.raw.draft = { [field]: "  partial\r\n0e+  " };
        d.input();
        const r = await d.autosaver.flush();
        assert.equal(r.outcome, "saved");
        assert.deepEqual(JSON.parse(d.values.get(key)).draft, {
          [field]: "  partial\r\n0e+  ",
        });
        assert.equal(d.results.length, 1);
        assert.equal(
          d.lockNames.every((k) => k === key),
          true,
        );
      }
    },
  );
  await check(
    "country helper binds its constructor form and current candidate; compare-only reading does not replace primary note identity",
    async () => {
      const clock = fakeClock();
      try {
        const d = await mount({ key: COUNTRY, form: "country:USA" });
        d.raw = {
          USA: { voices: "  primary\r\n", institutions: "", gaps: "unknown" },
        };
        d.input();
        await clock.tick(250);
        await settle(() => !d.autosaver.hasPending());
        assert.deepEqual(JSON.parse(d.values.get(COUNTRY)), d.raw);
        d.raw.USA.voices = "new unsaved primary";
        d.input();
        d.view.changedView();
        d.autosaver.cancel();
        d.raw = {
          CAN: { voices: "different country", institutions: "", gaps: "" },
        };
        await clock.tick(250);
        assert.equal(
          JSON.parse(d.values.get(COUNTRY)).USA.voices,
          "  primary\r\n",
        );
        assert.equal(d.reads, 1);
      } finally {
        clock.restore();
      }
    },
  );
  await check(
    "every frozen declared function is present on actual concrete runtime exports",
    async () => {
      const doc = await readFile(
        "docs/REMAINING_RECORDS_RECOVERY_INTERFACES.md",
        "utf8",
      );
      const names = [...doc.matchAll(/^declare function (\w+)/gm)].map(
        (match) => match[1],
      );
      assert.equal(names.length, 16);
      for (const name of names) assert.equal(typeof m[name], "function", name);
    },
  );
  await check(
    "frozen manuscript autosave example strict-compiles against actual concrete exports with no declared export shims",
    async () => {
      const doc = await readFile(
          "docs/REMAINING_RECORDS_RECOVERY_INTERFACES.md",
          "utf8",
        ),
        match = doc.match(
          /```ts\n(async function exampleManuscriptAutosave\([\s\S]*?)\n```/,
        );
      assert.ok(match);
      const dir = await mkdtemp(join(tmpdir(), "charitology-rr-interface-"));
      try {
        const path = join(dir, "example.ts"),
          actual = resolve(
            "src/lib/client/remaining-record-recovery-controls.ts",
          ),
          core = resolve("src/lib/client/remaining-record-recovery.ts");
        await writeFile(
          path,
          `import {createRemainingRecordDraftAutosaver} from ${JSON.stringify(actual.replace(/\.ts$/, ""))};\nimport {createRemainingRecordView,openRemainingRecordSession,type RRManuscript,type RRManuscriptField} from ${JSON.stringify(core.replace(/\.ts$/, ""))};\n${match[1]}\nvoid exampleManuscriptAutosave;\n`,
        );
        const declarations = [...doc.matchAll(/```ts\n([\s\S]*?)\n```/g)]
          .map((part) => part[1])
          .filter(
            (part) =>
              !part.startsWith("async function exampleManuscriptAutosave"),
          );
        assert.equal(declarations.length, 6);
        const contract = join(dir, "frozen-contract.ts");
        await writeFile(
          contract,
          declarations
            .join("\n")
            .replace(/"\.\.\/src\/lib\/client\/([^"\n]+)"/g, (_all, name) =>
              JSON.stringify(resolve("src/lib/client", name)),
            ),
        );
        // Separate contract declarations do not supply shims to the example:
        // the example imports only real exports, checked above at runtime too.
        await strict([
          "src/lib/client/remaining-record-recovery-controls.ts",
          "src/lib/client/remaining-record-recovery-autosave.ts",
          contract,
          path,
        ]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
  console.log(
    `Remaining-record autosaver: ${groups} actual groups; strict zero. Fake clock and actual closed core; browser/Save remain separate.`,
  );
} finally {
  for (const d of mounts) {
    d.autosaver?.dispose();
    d.session?.dispose();
  }
}
