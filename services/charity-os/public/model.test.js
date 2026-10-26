import test from "node:test";
import assert from "node:assert/strict";
import {
  moneyFromMajor,
  moneyToMajor,
  formatMoney,
  formatDate,
  formatValue,
  filterRecords,
  calendarCells,
  recordsCsv,
  csvCell,
  can,
  permittedTransitions,
  safeFilename,
  parseCsv,
  typedCsvRows,
} from "./model.js";
import { MODULES, exampleRecords } from "../lib/modules.mjs";

test("money preserves exact cents, zero, negative amounts and currency precision", () => {
  assert.deepEqual(moneyFromMajor("123456.78", "USD", 2), {
    minor: 12345678,
    currency: "USD",
    precision: 2,
  });
  assert.deepEqual(moneyFromMajor("0", "JPY", 0), {
    minor: 0,
    currency: "JPY",
    precision: 0,
  });
  assert.deepEqual(moneyFromMajor("-0.001", "KWD", 3), {
    minor: -1,
    currency: "KWD",
    precision: 3,
  });
  assert.equal(
    moneyToMajor({ minor: 1, currency: "KWD", precision: 3 }),
    "0.001",
  );
  assert.equal(
    formatMoney({ minor: 0, currency: "USD", precision: 2 }),
    "USD 0.00",
  );
});
test("unknown money stays unknown and unsafe values never round silently", () => {
  assert.equal(moneyFromMajor("", "USD", 2), null);
  assert.equal(
    formatMoney({ minor: null, currency: "USD", precision: 2 }),
    "Unknown",
  );
  for (const value of [
    "0.001",
    "1e3",
    "NaN",
    "Infinity",
    "9,000",
    "90071992547409.92",
  ])
    assert.throws(() => moneyFromMajor(value, "USD", 2));
  assert.throws(() => moneyFromMajor("1", "usd", 2));
  assert.throws(() => moneyFromMajor("1", "USD", -1));
});
test("formatting keeps measured zero and explicit false distinct from missing data", () => {
  assert.equal(formatValue({ type: "number" }, 0), "0");
  assert.equal(formatValue({ type: "boolean" }, false), "No");
  assert.equal(formatValue({ type: "boolean" }, null), "Not recorded");
  assert.equal(
    formatValue({ type: "reference" }, "unknown-id", new Map()),
    "unknown-id",
  );
  assert.equal(
    formatValue(
      { type: "references" },
      ["a"],
      new Map([["a", "Linked program"]]),
    ),
    "Linked program",
  );
});
test("calendar uses complete Sunday-to-Saturday weeks across leap-day and year boundaries", () => {
  const feb = calendarCells(2028, 1);
  assert.equal(feb.length, 42);
  assert.equal(feb[0].date, "2028-01-30");
  assert.ok(feb.some((c) => c.date === "2028-02-29" && c.current));
  assert.equal(feb.at(-1).date, "2028-03-11");
  const jan = calendarCells(2027, 0);
  assert.equal(jan[0].date, "2026-12-27");
  assert.equal(jan.filter((c) => c.current).length, 31);
  assert.match(formatDate("2028-02-29"), /2028/);
});
test("search and status/owner filters operate together without changing source order", () => {
  const source = [
    {
      id: "a",
      data: { title: "School meals", note: "Evidence pending" },
      status: "draft",
      ownerId: "u1",
      updatedAt: "2026-10-01",
      createdAt: "2026-01-01",
    },
    {
      id: "b",
      data: { title: "Community garden" },
      status: "active",
      ownerId: null,
      updatedAt: "2026-10-03",
      createdAt: "2026-02-01",
    },
    {
      id: "c",
      data: { title: "Meals follow-up" },
      status: "active",
      ownerId: "u1",
      updatedAt: "2026-10-02",
      createdAt: "2026-03-01",
    },
  ];
  assert.deepEqual(
    filterRecords(source, {
      query: "meals",
      status: "active",
      owner: "u1",
    }).map((r) => r.id),
    ["c"],
  );
  assert.deepEqual(
    filterRecords(source, { owner: "unassigned" }).map((r) => r.id),
    ["b"],
  );
  assert.deepEqual(
    filterRecords(source, { query: "evidence" }).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(
    source.map((r) => r.id),
    ["a", "b", "c"],
  );
});
test("CSV preserves quotes/newlines and defuses formula prefixes including leading whitespace", () => {
  assert.equal(
    csvCell('  =HYPERLINK("https://example.invalid")'),
    '"\'  =HYPERLINK(""https://example.invalid"")"',
  );
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell(null), '""');
  const csv = recordsCsv({ fields: [{ key: "title" }] }, [
    {
      id: "r",
      status: "draft",
      ownerId: null,
      revision: 1,
      createdAt: "a",
      updatedAt: "b",
      data: { title: "=1+1" },
    },
  ]);
  assert.match(csv, /"'=[^"]+"/);
  assert.match(csv, /"revision"/);
});
test("metadata permissions and transitions reflect roles and current state", () => {
  const module = MODULES.find((m) => m.id === "programs");
  assert.equal(can(module, "write", "board_reader"), false);
  assert.equal(can(module, "write", "owner"), true);
  const transitions = permittedTransitions(
    module,
    { status: "draft" },
    "contributor",
  );
  assert.ok(transitions.every((t) => t.from === "draft"));
  assert.ok(transitions.some((t) => t.to === "review"));
  assert.equal(
    permittedTransitions(module, { status: "closed" }, "contributor").length,
    0,
  );
});
test("all registry examples can be formatted without inventing values", () => {
  const supported = new Set([
    "text",
    "textarea",
    "integer",
    "number",
    "select",
    "boolean",
    "date",
    "datetime",
    "timezone",
    "money",
    "reference",
    "references",
  ]);
  const fixtures = exampleRecords();
  for (const module of MODULES) {
    const record = fixtures.find((r) => r.moduleId === module.id);
    assert.ok(record, `${module.id} example`);
    for (const field of module.fields) {
      assert.ok(
        supported.has(field.type),
        `${module.id}.${field.key} supported`,
      );
      assert.equal(typeof formatValue(field, record.data[field.key]), "string");
    }
  }
  assert.equal(safeFilename("../private\\file\nname"), "..-private-file-name");
});
test("CSV import handles BOM, escaped quotes, multiline values and rejects malformed headers/rows", () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFid,title,note\r\n1,"A ""quoted"" title","line1\nline2"\r\n',
    ),
    [{ id: "1", title: 'A "quoted" title', note: "line1\nline2" }],
  );
  for (const text of [
    "id,id\n1,2",
    "id,title\n1",
    'id,title\n1,"open',
    "__proto__,title\n1,test",
  ])
    assert.throws(() => parseCsv(text));
  assert.throws(() => parseCsv("id,title\n1,a\n2,b", 1), /at most 1 rows/);
});
test("mapped CSV fields preserve numbers, false and structured money without evaluating expressions", () => {
  const module = {
    fields: [
      { key: "quantity", type: "integer" },
      { key: "confirmed", type: "boolean" },
      { key: "amount", type: "money" },
    ],
  };
  const rows = typedCsvRows(
    [
      {
        id: "s1",
        qty: "0",
        yes: "false",
        cash: '{"minor":100,"currency":"USD","precision":2}',
        title: "=1+1",
      },
    ],
    { qty: "quantity", yes: "confirmed", cash: "amount" },
    module,
  );
  assert.equal(rows[0].qty, 0);
  assert.equal(rows[0].yes, false);
  assert.deepEqual(rows[0].cash, { minor: 100, currency: "USD", precision: 2 });
  assert.equal(rows[0].title, "=1+1");
});
