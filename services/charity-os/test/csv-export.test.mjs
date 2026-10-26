import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../lib/backup.mjs";
import { parseCsv } from "../public/model.js";

const module = {
  fields: [
    { key: "title" },
    { key: "note" },
    { key: "missing" },
    { key: "count" },
    { key: "confirmed" },
    { key: "amount" },
  ],
};
const record = (title, extra = {}) => ({
  id: "synthetic-record",
  status: "draft",
  revision: 1,
  data: { title, ...extra },
});

test("server CSV exports defuse spreadsheet operators after whitespace, BOM and control prefixes", () => {
  const values = [
    "=SUM(1,2)",
    "+1",
    "-1",
    "@SUM(1,2)",
    "  =1+1",
    "\t+1",
    "\r\n-1",
    "\u00A0@SUM(1,2)",
    "\uFEFF =1+1",
    "\u0000=1+1",
    "\tordinary text",
    "\rordinary text",
    "\nordinary text",
  ];
  const rows = parseCsv(
    toCsv(
      values.map((value) => record(value)),
      module,
    ),
  );
  assert.equal(rows.length, values.length);
  for (const [index, value] of values.entries())
    assert.equal(rows[index].title, "'" + value);
});

test("actual server CSV serialization retains quoted multiline content, missingness, measured zero and false", () => {
  const title = '  =HYPERLINK("https://example.invalid", "Example")\n+1';
  const note = 'A "quoted" note, with a newline\nthat remains one cell.';
  const amount = { minor: 0, currency: "USD", precision: 2 };
  const [row] = parseCsv(
    toCsv(
      [
        record(title, {
          note,
          missing: null,
          count: 0,
          confirmed: false,
          amount,
        }),
      ],
      module,
    ),
  );
  assert.equal(row.title, "'" + title);
  assert.equal(row.note, note);
  assert.equal(row.missing, "");
  assert.equal(row.count, "0");
  assert.equal(row.confirmed, "false");
  assert.deepEqual(JSON.parse(row.amount), amount);
  assert.equal(row.revision, "1");
});

test("server CSV keeps ordinary text literal and also protects envelope cells", () => {
  const values = ["Ordinary work", "  ordinary work", "a = b", "0", ""];
  const rows = parseCsv(
    toCsv(
      values.map((title) => record(title)),
      module,
    ),
  );
  assert.deepEqual(
    rows.map((row) => row.title),
    values,
  );
  const [envelope] = parseCsv(
    toCsv(
      [
        {
          ...record("Safe title"),
          id: '  =IMPORTXML("https://example.invalid")',
          status: "\uFEFF@unsafe",
        },
      ],
      module,
    ),
  );
  assert.equal(envelope.id, '\'  =IMPORTXML("https://example.invalid")');
  assert.equal(envelope.status, "'\uFEFF@unsafe");
});
