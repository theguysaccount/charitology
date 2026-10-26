import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/lib/client/partner-programs.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const p = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
let checks = 0;
function check(name, test) {
  test();
  checks++;
  console.log("✓ " + name);
}
const all = Object.values(p.programWorkspaces),
  fund = p.programWorkspaces["the-charitology-fund"],
  summit = p.programWorkspaces["charitology-summit"];
check(
  "All nine workspaces have distinct collections, complete fictional examples and separate readiness records",
  () => {
    assert.equal(all.length, 9);
    let total = 0;
    for (const config of all) {
      assert.ok(config.collections.length >= 5);
      assert.ok(config.readiness.length >= 3);
      assert.ok(config.limits.length > 100);
      const sample = p.sampleWorkspace(config);
      p.validValues(sample.context, config.context);
      assert.deepEqual(
        p.parseWorkspace(JSON.parse(JSON.stringify(sample)), config),
        sample,
      );
      assert.deepEqual(
        p.parseWorkspace(
          JSON.parse(JSON.stringify(p.emptyWorkspace(config))),
          config,
        ),
        p.emptyWorkspace(config),
      );
      assert.ok(sample.context.name.toLowerCase().includes("fictional"));
      total += Object.values(sample.records).reduce((n, r) => n + r.length, 0);
      assert.ok(
        p
          .workspaceMarkdown(config, sample)
          .includes("No source check, independent review"),
      );
      assert.ok(
        p.workspaceCsv(config, sample).startsWith('"section","record_id"'),
      );
    }
    assert.equal(total, 68);
  },
);
check(
  "Optional missing amounts remain unknown while explicit zero remains known",
  () => {
    const rows = [
      { values: { currency: "USD", amount: "" } },
      { values: { currency: "USD", amount: "0" } },
      { values: { currency: "usd", amount: "100.10" } },
      { values: { currency: "USD", amount: "0.20" } },
      { values: { currency: "EUR", amount: "5" } },
    ];
    assert.deepEqual(p.planningAmounts(rows), [
      { currency: "USD", amount: 100.3, known: 3, unknown: 1 },
      { currency: "EUR", amount: 5, known: 1, unknown: 0 },
    ]);
    const empty = p.emptyWorkspace(fund);
    assert.ok(
      p
        .workspaceSummary(fund, empty)
        .notes.some((n) => n.includes("envelope unknown")),
    );
    const field = fund.collections
      .find((c) => c.key === "allocations")
      .fields.find((f) => f.key === "amount");
    assert.equal(p.validValues({ amount: "" }, [field]).amount, "");
    assert.equal(p.validValues({ amount: "0" }, [field]).amount, "0");
  },
);
check(
  "Conditional fund envelopes combine currency case variants but never add pipeline stages",
  () => {
    const s = p.sampleWorkspace(fund);
    s.context.budget = "150";
    s.context.currency = "USD";
    s.records.allocations = [
      {
        id: "a",
        values: {
          amount: "100",
          currency: "USD",
          status: "Conditional recommendation",
        },
      },
      {
        id: "b",
        values: {
          amount: "100",
          currency: "usd",
          status: "Conditional recommendation",
        },
      },
    ];
    const notes = p.workspaceSummary(fund, s).notes.join("\n");
    assert.match(notes, /known conditional plans 200/);
    assert.match(notes, /never added together/);
    assert.ok(!notes.includes("available cash"));
  },
);
check(
  "Withdrawn and illustrative pledges are not treated as funded prizes",
  () => {
    const rows = [
      "Illustrative only",
      "Withdrawn",
      "Unverified conditional",
    ].map((status, i) => ({
      values: { amount: String(100 + i), currency: "USD", status },
    }));
    assert.deepEqual(p.planningAmounts(rows, ["Unverified conditional"]), [
      { currency: "USD", amount: 102, known: 1, unknown: 0 },
    ]);
  },
);
check(
  "Monetary and duration inputs reject impossible precision, negatives, infinities and unsafe URLs",
  () => {
    const money = {
      key: "amount",
      label: "Amount",
      kind: "number",
      optional: true,
      min: 0,
      max: 1e12,
    };
    for (const amount of [
      "-1",
      "Infinity",
      "NaN",
      "0.001",
      "1000000001",
      "1e-300",
      "1e-1000",
    ])
      assert.throws(() => p.validValues({ amount }, [money]));
    const url = { key: "source", label: "Source", kind: "url" };
    for (const source of [
      "javascript:alert(1)",
      "http://example.org",
      "https://user:pass@example.org",
    ])
      assert.throws(() => p.validValues({ source }, [url]));
    assert.throws(() =>
      p.validValues({ minutes: "1.5" }, [
        { key: "minutes", label: "Duration", kind: "number" },
      ]),
    );
    assert.throws(() =>
      p.validValues({ start: "24:00" }, [{ key: "start", label: "UTC time" }]),
    );
  },
);
check(
  "CRUD preserves record identity, keeps undo snapshots intact and refuses stale edit ids",
  () => {
    const s = p.sampleWorkspace(fund),
      before = structuredClone(s),
      collection = fund.collections[0],
      first = s.records[collection.key][0];
    const edited = p.savePartnerRecord(
      s,
      fund,
      collection.key,
      { ...first.values, title: "Fictional revised proposal" },
      first.id,
    );
    assert.equal(edited.records[collection.key][0].id, first.id);
    assert.deepEqual(s, before);
    const removed = p.deletePartnerRecord(edited, collection.key, first.id);
    assert.equal(removed.records[collection.key].length, 0);
    assert.equal(edited.records[collection.key].length, 1);
    assert.throws(
      () =>
        p.savePartnerRecord(
          removed,
          fund,
          collection.key,
          first.values,
          first.id,
        ),
      /removed/,
    );
    assert.equal(
      p.savePartnerRecord(removed, fund, collection.key, first.values).records[
        collection.key
      ].length,
      1,
    );
  },
);
check(
  "Imports reject wrong programs, invalid enums, duplicate ids, dates and excessive record lists",
  () => {
    const sample = p.sampleWorkspace(fund);
    const bad = (change) => {
      const s = structuredClone(sample);
      change(s);
      assert.throws(() => p.parseWorkspace(s, fund));
    };
    bad((s) => (s.program = "charity-incubator"));
    bad((s) => (s.version = 2));
    bad((s) => (s.records.allocations[0].values.status = "Paid"));
    bad((s) => (s.records.allocations[0].values.date = "2026-02-30"));
    bad((s) =>
      s.records.allocations.push(structuredClone(s.records.allocations[0])),
    );
    bad(
      (s) =>
        (s.records.allocations = Array(251).fill(s.records.allocations[0])),
    );
  },
);
check(
  "Import sanitizes unrecognized fields without treating local statuses as independent approval",
  () => {
    const sample = p.sampleWorkspace(fund);
    sample.verified = true;
    sample.context.hidden = "remove";
    sample.records.allocations[0].values.approvedByCharitology = "remove";
    const restored = p.parseWorkspace(sample, fund);
    assert.equal(restored.verified, undefined);
    assert.equal(restored.context.hidden, undefined);
    assert.equal(
      restored.records.allocations[0].values.approvedByCharitology,
      undefined,
    );
    assert.match(
      p.workspaceMarkdown(fund, restored),
      /No source check, independent review/,
    );
  },
);
check(
  "Selected-field transparency packets omit internal conflict and intake records",
  () => {
    const s = p.sampleWorkspace(fund);
    s.records.conflicts[0].values.connection =
      "INTERNAL-DETAIL-MUST-NOT-EXPORT";
    s.records.proposals[0].values.evidence = "INTERNAL-PROPOSAL-NOTE";
    const packet = p.fundTransparency(s);
    assert.ok(!packet.includes("INTERNAL-DETAIL"));
    assert.ok(!packet.includes("INTERNAL-PROPOSAL"));
    assert.match(packet, /No legal fund/);
    assert.match(packet, /Nonpayment authorization/);
  },
);
check(
  "CSV and Markdown exports preserve unknowns and protect formula-like user text",
  () => {
    const s = p.sampleWorkspace(fund);
    s.context.name = ' =HYPERLINK("https://example.org/")';
    s.records.allocations[0].values.amount = "0";
    const csv = p.workspaceCsv(fund, s);
    assert.ok(csv.includes("' =HYPERLINK"));
    assert.ok(csv.includes('"amount","Conditional amount; blank unknown","0"'));
    assert.match(p.workspaceMarkdown(fund, s), /Unknown \/ not recorded/);
  },
);
check(
  "UTC planning calendars cross midnight, remain tentative and escape structural injection",
  () => {
    const s = p.sampleWorkspace(summit);
    s.records.sessions[0].values.date = "2027-01-15";
    s.records.sessions[0].values.start = "23:30";
    s.records.sessions[0].values.minutes = "120";
    s.records.sessions[0].values.title = "Draft\nBEGIN:VEVENT,unsafe; text\\x";
    s.records.sessions[0].values.question = "é".repeat(300);
    const result = p.summitCalendar(s, new Date("2026-10-25T00:00:00Z"));
    assert.equal(result.included, 1);
    assert.match(result.text, /DTSTART:20270115T233000Z/);
    assert.match(result.text, /DTEND:20270116T013000Z/);
    assert.match(result.text, /STATUS:TENTATIVE/);
    assert.equal((result.text.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length, 1);
    assert.ok(!result.text.includes("ATTENDEE:"));
    assert.ok(!result.text.includes("ORGANIZER:"));
    for (const line of result.text.split("\r\n"))
      assert.ok(Buffer.byteLength(line) <= 75);
  },
);
check(
  "Incomplete/cancelled sessions stay outside calendars and overlapping slots are disclosed",
  () => {
    const s = p.sampleWorkspace(summit),
      row = s.records.sessions[0];
    s.records.sessions.push({
      id: "overlap",
      values: { ...row.values, title: "Overlap", start: "15:30" },
    });
    assert.equal(p.scheduleConflicts(s).length, 1);
    s.records.sessions.push(
      { id: "unknown", values: { ...row.values, start: "" } },
      { id: "cancelled", values: { ...row.values, status: "Cancelled" } },
    );
    const c = p.summitCalendar(s);
    assert.equal(c.included, 2);
    assert.equal(c.excluded, 2);
    s.records.sessions[1].values.start = "16:00";
    assert.equal(p.scheduleConflicts(s).length, 0);
  },
);
check(
  "Actual partner storage namespace refuses stale saved edits, clears and imports",
  () => {
    const previous = Object.getOwnPropertyDescriptor(
        globalThis,
        "localStorage",
      ),
      data = new Map();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => data.set(k, v),
      },
    });
    try {
      const a = p.partnerStorage(fund.id),
        b = p.partnerStorage(fund.id);
      assert.equal(
        a.key,
        "charitology.partner-workspace-v1.the-charitology-fund",
      );
      a.guard.read();
      b.guard.read();
      const sample = p.sampleWorkspace(fund);
      a.guard.write(JSON.stringify(sample));
      const expected = data.get(a.key);
      for (const state of [
        p.emptyWorkspace(fund),
        p.sampleWorkspace(fund),
        sample,
      ]) {
        assert.throws(
          () => b.guard.write(JSON.stringify(state)),
          /Another tab/,
        );
        assert.equal(data.get(a.key), expected);
      }
      b.guard.read();
      b.guard.write(JSON.stringify(p.emptyWorkspace(fund)));
      assert.throws(() => a.guard.write(expected), /Another tab/);
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else delete globalThis.localStorage;
    }
  },
);
check(
  "Backup capacity round-trips valid files above 2 MB and refuses oversized mutations before state changes",
  () => {
    const sample = p.sampleWorkspace(fund),
      base = sample.records.proposals[0].values;
    const large = p.emptyWorkspace(fund);
    large.context = sample.context;
    large.records.proposals = Array.from({ length: 140 }, (_, i) => ({
      id: "large-" + i,
      values: {
        ...base,
        mechanism: "m".repeat(5000),
        evidence: "e".repeat(5000),
        voice: "v".repeat(5000),
      },
    }));
    const backup = p.partnerBackup(large);
    assert.ok(Buffer.byteLength(backup) > 2_000_000);
    assert.ok(Buffer.byteLength(backup) <= p.MAX_PARTNER_BACKUP_BYTES);
    assert.deepEqual(p.parseWorkspace(JSON.parse(backup), fund), large);
    const worst = {
      ...base,
      mechanism: "\0".repeat(5000),
      evidence: "\0".repeat(5000),
      voice: "\0".repeat(5000),
    };
    const bounded = p.emptyWorkspace(fund);
    bounded.context = sample.context;
    bounded.records.proposals = Array.from({ length: 100 }, (_, i) => ({
      id: "bounded-" + i,
      values: { ...worst },
    }));
    assert.throws(() => p.parseWorkspace(bounded, fund), /8 MB/);
    while (
      Buffer.byteLength(JSON.stringify(bounded, null, 2)) >
      p.MAX_PARTNER_BACKUP_BYTES
    )
      bounded.records.proposals.pop();
    const atLimit = structuredClone(bounded);
    atLimit.updated = "";
    for (const field of fund.context.filter((f) => f.kind === "textarea")) {
      if (
        Buffer.byteLength(JSON.stringify(atLimit, null, 2)) ===
        p.MAX_PARTNER_BACKUP_BYTES
      )
        break;
      atLimit.context[field.key] = "";
      const gap =
        p.MAX_PARTNER_BACKUP_BYTES -
        Buffer.byteLength(JSON.stringify(atLimit, null, 2));
      const controls = Math.min(5000, Math.floor(gap / 6)),
        plain = Math.min(5000 - controls, gap - controls * 6);
      atLimit.context[field.key] = "\0".repeat(controls) + "x".repeat(plain);
    }
    assert.equal(
      Buffer.byteLength(JSON.stringify(atLimit, null, 2)),
      p.MAX_PARTNER_BACKUP_BYTES,
    );
    assert.throws(
      () => p.parseWorkspace(atLimit, fund),
      /8 MB/,
      "Imports reserve capacity for the next ISO save timestamp",
    );
    const before = structuredClone(bounded);
    assert.throws(
      () => p.savePartnerRecord(bounded, fund, "proposals", worst),
      /8 MB/,
    );
    assert.deepEqual(bounded, before);
    const giantContext = { ...bounded.context };
    fund.context
      .filter((f) => f.kind === "textarea")
      .forEach((f) => (giantContext[f.key] = "\0".repeat(5000)));
    assert.throws(
      () => p.savePartnerContext(bounded, fund, giantContext),
      /8 MB/,
    );
    assert.deepEqual(bounded, before);
  },
);
check(
  "Loading a new storage version invalidates prior undo and failed writes remain unsaved after form reset",
  () => {
    const session = new p.PartnerSession(),
      original = p.sampleWorkspace(fund);
    session.remember(original);
    original.context.name = "Later local change";
    assert.notEqual(session.undo.context.name, original.context.name);
    session.failed();
    assert.equal(
      session.needsDiscard(0),
      true,
      "Failed save must warn even when forms have reset",
    );
    assert.equal(session.unsavedInMemory, true);
    session.loaded();
    assert.equal(
      session.undo,
      undefined,
      "An unrelated prior snapshot must never survive an explicit reload",
    );
    assert.equal(session.needsDiscard(0), false);
    assert.equal(session.needsDiscard(1), true);
    session.failed();
    session.persisted();
    assert.equal(session.needsDiscard(0), false);
  },
);
check(
  "Partner engine and actual Astro browser module pass strict TypeScript",
  () => {
    const name = path.resolve(
        "src/components/programs/PartnerWorkspace.astro.inline.ts",
      ),
      source =
        fs
          .readFileSync(
            "src/components/programs/PartnerWorkspace.astro",
            "utf8",
          )
          .match(/<script>([\s\S]*?)<\/script>/)[1] + "\nexport {};";
    const file = ts.readConfigFile("tsconfig.json", ts.sys.readFile),
      parsed = ts.parseJsonConfigFileContent(
        file.config,
        ts.sys,
        process.cwd(),
      ),
      options = {
        ...parsed.options,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        noEmit: true,
      };
    const host = ts.createCompilerHost(options),
      get = host.getSourceFile.bind(host);
    host.getSourceFile = (file, ...args) =>
      file === name
        ? ts.createSourceFile(file, source, args[0], true)
        : get(file, ...args);
    const program = ts.createProgram(
      [name, path.resolve("node_modules/astro/client.d.ts")],
      options,
      host,
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      diagnostics
        .map(
          (d) =>
            `${d.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        )
        .join("\n"),
    );
  },
);
console.log(
  `Partner program models: ${checks} groups passed across nine workspaces.`,
);
