import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCsv } from "../client/csv.ts";
import { FUNDING_HEADERS, FUNDING_LIMITS, FUNDING_LICENSE, FUNDING_CSV_TEXT_POLICY,
  parseFundingCsv, fundingCoverage, fundingDecimal, fundingSummary, fundingUsd,
  validateFundingEdition, validateFundingProjection, fundingObjectHash,
  fundingSelectionJson, fundingSelectionCsv, selectFundingRows } from "./model.mjs";
import { fundingFixture, fixtureRows, csvFixture } from "../../../test-fixtures/humanitarian-funding/fixture.mjs";
import { captureCode } from "../../../scripts/capture-humanitarian-funding.mjs";
import { freezeFundingEdition } from "./public.mjs";
const encode = s => new TextEncoder().encode(s);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const clone = v => JSON.parse(JSON.stringify(v));
function reseal(v) { delete v.sha256; v.sha256 = fundingObjectHash(v); return v; }

test("same plan ID in different countries retains separate raw rows, missingness and signed prior-year source", () => {
  const f = fundingFixture();
  assert.equal(f.parsed.totalRecords, 4);
  assert.deepEqual(f.edition.rows.map(r => r.key), ["AAA:101:2025", "BBB:101:2025", "AAA:no-plan:2025"]);
  assert.equal(f.parsed.rows[3].raw.funding, "-0.25");
  assert.deepEqual(fundingSummary(f.edition.rows), { rows: 3, countryCodes: 2, identifiedPlanCountryRows: 2, missingFundingRows: 0, explicitZeroFundingRows: 1, comparableRows: 2 });
  assert.equal(f.edition.rows[2].raw.requirements, "");
  assert.equal(f.edition.rows[2].raw.funding, "0");
  assert.equal(f.edition.rows[2].coverage.status, "requirements-missing");
  assert.equal(validateFundingEdition(f.edition, f.envelope), f.edition);
});
test("quoted multiline Unicode, escaped quotes, CRLF and BOM preserve independent byte spans/hashes", () => {
  const rows = fixtureRows(); rows[0][2] = '  A "quote", café\r\nline 😀  ';
  const text = csvFixture(rows), bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
  const p = parseFundingCsv(bytes), first = p.rows[0], prefix = Buffer.from(FUNDING_HEADERS.join(",") + "\r\n");
  assert.equal(first.raw.name, rows[0][2]);
  assert.equal(first.locator.byteStart, 3 + prefix.length);
  assert.equal(first.locator.firstLine, 2); assert.equal(first.locator.lastLine, 3);
  assert.equal(p.rows[1].locator.firstLine, 4);
  for (const r of p.rows) assert.equal(r.locator.rawSha256, hash(bytes.subarray(r.locator.byteStart, r.locator.byteEnd)));
  assert.equal(p.sourceSha256, hash(bytes)); assert.equal(p.rows.at(-1).locator.byteEnd, bytes.length);
  const lf = parseFundingCsv(encode(csvFixture(fixtureRows(), "\n")));
  assert.equal(lf.rows[0].locator.firstLine, 2);
});
test("exact decimal ratios, half rounding, signed funding and overage never become floating-point sums", () => {
  assert.deepEqual(fundingCoverage("3", "1"), { status: "comparable", numerator: "1", denominator: "3", displayPercent: "33.33" });
  assert.deepEqual(fundingCoverage("4.00", "5.00"), { status: "comparable", numerator: "5", denominator: "4", displayPercent: "125.00" });
  assert.equal(fundingCoverage("1", "-0.00005").displayPercent, "-0.01");
  assert.equal(fundingCoverage("1", "0.00005").displayPercent, "0.01");
  assert.equal(fundingCoverage("1", "-0.000049").displayPercent, "0.00");
  assert.equal(fundingCoverage("900719925474099312345.01", "900719925474099312345.02").numerator, "90071992547409931234502");
  assert.equal(fundingUsd("900719925474099312345.01"), "USD 900,719,925,474,099,312,345.01");
  assert.equal(fundingDecimal("-0.25").coefficient, -25n);
});
test("blank funding, reported zero and a zero requirements denominator remain different", () => {
  assert.equal(fundingCoverage("1", "").status, "funding-missing");
  assert.equal(fundingCoverage("", "0").status, "requirements-missing");
  assert.equal(fundingCoverage("", "").status, "both-missing");
  assert.deepEqual(fundingCoverage("1", "0"), { status: "comparable", numerator: "0", denominator: "1", displayPercent: "0.00" });
  assert.equal(fundingCoverage("0", "0").status, "zero-requirements");
  assert.equal(fundingCoverage("0", "10").numerator, null);
  assert.equal(fundingUsd(""), "Not reported"); assert.equal(fundingUsd("0"), "USD 0");
  for (const raw of [" ", "1e3", "Infinity", "1,000", "+1", "1.2.3"]) assert.throws(() => fundingDecimal(raw));
});
test("strict whole-source CSV refusal catches malformed and unselected records before a projection", () => {
  const text = csvFixture();
  const bad = [text.replace("countryCode,id", "id,countryCode"), text.replace('Fictional plan alpha', 'bad"quote'), text + "AAA,short\r\n", text.replace('Fictional plan alpha', '"unclosed'), text.replace('Fictional plan alpha', '"closed"x'), text.replaceAll("\r\n", "\r"), text.replace("Fictional", "Fictional\u0000")];
  for (const s of bad) assert.throws(() => parseFundingCsv(encode(s)));
  assert.throws(() => parseFundingCsv(Uint8Array.of(0xc0, 0xaf)), /UTF-8/);
  assert.throws(() => parseFundingCsv(new Uint8Array(FUNDING_LIMITS.bytes + 1)), /bounded/);
  const rows = fixtureRows(); rows[3][6] = "2024-02-30";
  assert.throws(() => parseFundingCsv(encode(csvFixture(rows))), /date/);
  rows[3][6] = ""; rows[3][2] = "a".repeat(FUNDING_LIMITS.field + 1);
  assert.throws(() => parseFundingCsv(encode(csvFixture(rows))), /too long/);
  const short = "AAA,,x,,,,,,2025,,,\r\n";
  assert.throws(() => parseFundingCsv(encode(FUNDING_HEADERS.join(",") + "\r\n" + short.repeat(FUNDING_LIMITS.records + 1))), /too many/);
});
test("duplicate composite identities refuse, including an unselected year's duplicate", () => {
  const rows = fixtureRows();
  assert.throws(() => parseFundingCsv(encode(csvFixture([...rows, [...rows[0]]]))), /Duplicate/);
  assert.throws(() => parseFundingCsv(encode(csvFixture([...rows, [...rows[3]]]))), /Duplicate/);
});
test("edition re-admission detects source omission, reordered records and regenerated-wrapper tamper", () => {
  const f = fundingFixture();
  const changed = clone(f.edition); changed.rows[0].raw.funding = "2";
  assert.throws(() => validateFundingProjection(changed), /checksum/);
  reseal(changed); assert.throws(() => validateFundingProjection(changed), /coverage/);
  const dropped = clone(f.edition); dropped.rows.pop(); dropped.summary = fundingSummary(dropped.rows); reseal(dropped);
  assert.throws(() => validateFundingEdition(dropped, f.envelope), /complete captured source/);
  const reordered = clone(f.edition); reordered.rows.reverse(); reseal(reordered);
  assert.throws(() => validateFundingProjection(reordered), /locator/);
  const envelope = clone(f.envelope); envelope.csvUtf8 += "\r\n";
  assert.throws(() => validateFundingEdition(f.edition, envelope), /checksum/);
});
test("country/type/search selection is conjunctive and never treats an unidentified row as a country total", () => {
  const f = fundingFixture();
  assert.equal(selectFundingRows(f.edition, { country: "AAA" }).length, 2);
  assert.deepEqual(selectFundingRows(f.edition, { country: "AAA", type: "5", search: "ＡＬＰＨＡ" }).map(r => r.key), ["AAA:101:2025"]);
  assert.deepEqual(selectFundingRows(f.edition, { type: "no-type" }).map(r => r.raw.name), ["Not specified"]);
  assert.equal(selectFundingRows(f.edition, { search: "no such plan" }).length, 0);
  assert.equal(selectFundingRows(f.edition).length, 3);
});
test("selected/empty JSON retains exact twelve raw fields, publisher license and original percent separately", () => {
  const f = fundingFixture(), row = f.edition.rows[0];
  const out = JSON.parse(fundingSelectionJson(f.edition, [row], { kind: "filtered", search: "alpha" }));
  assert.deepEqual(Object.keys(out.rows[0].raw), FUNDING_HEADERS);
  assert.deepEqual(out.rows[0].raw, Object.fromEntries(FUNDING_HEADERS.map((h, i) => [h, fixtureRows()[0][i]])));
  assert.equal(out.rows[0].raw.percentFunded, "33"); assert.equal(out.rows[0].coverage.displayPercent, "33.33");
  assert.deepEqual(out.source.license, FUNDING_LICENSE); assert.match(out.modification, /not endorsed/);
  assert.equal(JSON.parse(fundingSelectionJson(f.edition, [], { kind: "filtered" })).selectedRows, 0);
  assert.throws(() => fundingSelectionJson(f.edition, [clone(row)], { kind: "filtered" }), /not part/);
});
test("CSV has a full-width licensed provenance row for empty selection and reversible text protection", () => {
  const rows = fixtureRows(); rows[0][2] = " \t=1+1"; rows[1][2] = "'already quoted";
  const f = fundingFixture(rows), output = parseCsv(fundingSelectionCsv(f.edition, f.edition.rows, { kind: "complete" })), [head, provenance, ...data] = output;
  assert.deepEqual(head.slice(0, 12), FUNDING_HEADERS);
  assert.ok(output.every(row => row.length === head.length));
  const at = k => head.indexOf(k); assert.equal(provenance[at("record_type")], "provenance");
  assert.equal(provenance[at("license")], FUNDING_LICENSE.id); assert.equal(provenance[at("license_url")], FUNDING_LICENSE.url);
  assert.equal(provenance[at("units")], f.edition.units); assert.equal(provenance[at("reference_year")], "2025");
  assert.equal(provenance[at("source_code_commit")], f.code.commit); assert.equal(provenance[at("csv_text_policy")], FUNDING_CSV_TEXT_POLICY);
  assert.equal(data[0][2], "'" + rows[0][2]); assert.equal(data[1][2], "'" + rows[1][2]);
  for (const i of [0, 1]) assert.equal(data[i][2].slice(1), rows[i][2]);
  assert.equal(JSON.parse(fundingSelectionJson(f.edition, f.edition.rows, {})).rows[0].raw.name, rows[0][2]);
  const empty = parseCsv(fundingSelectionCsv(f.edition, [], { kind: "filtered", search: "=a" }));
  assert.equal(empty.length, 2); assert.equal(empty[1].length, empty[0].length);
  assert.equal(empty[1][at("license_url")], FUNDING_LICENSE.url);
});
test("capture cannot falsely bind newly implemented code to the old published commit", () => {
  assert.throws(() => captureCode("5610309a177b1985961636631dbb40ad4e7ae631"), /does not contain this capture interpreter/);
});
test("the production freezer rejects nested row/source/license mutations without changing the valid edition", () => {
  const f = fundingFixture(), admitted = freezeFundingEdition(f.edition);
  assert.equal(admitted, f.edition);
  assert.throws(() => { admitted.rows[0].raw.funding = "999"; }, TypeError);
  assert.throws(() => { admitted.source.license.id = "Different terms"; }, TypeError);
  assert.throws(() => { admitted.rows.pop(); }, TypeError);
  assert.throws(() => { admitted.sourceCode.commit = "b".repeat(40); }, TypeError);
  assert.equal(validateFundingEdition(admitted, f.envelope), admitted);
});
test("every actual capture Git child overrides hostile inherited lazy-fetch/prompt flags", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "charitology-funding-git-env-"));
  try {
    // Owned protocol stub, not a real commit/provider/promisor-network acceptance claim.
    await writeFile(path.join(temp, "git"), `#!/bin/sh\n[ "$GIT_NO_LAZY_FETCH" = "1" ] || exit 71\n[ "$GIT_TERMINAL_PROMPT" = "0" ] || exit 72\ncase "$1" in\nmerge-base) exit 0 ;;\nshow) funding_relative_path="\${2#*:}"; case "$funding_relative_path" in scripts/capture-humanitarian-funding.mjs|src/lib/humanitarian-funding/model.mjs|src/lib/humanitarian-funding/source.mjs) exec /bin/cat "$FUNDING_TEST_REPO/$funding_relative_path" ;; *) exit 73 ;; esac ;;\n*) exit 74 ;;\nesac\n`, { mode: 0o700 });
    const code = `import {captureCode} from './scripts/capture-humanitarian-funding.mjs'; console.log(JSON.stringify(captureCode('a'.repeat(40))));`;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd(), encoding: "utf8", env: {
      PATH: `${temp}:${path.dirname(process.execPath)}:/usr/bin:/bin`, ...(process.env.HOME ? { HOME: process.env.HOME } : {}), LANG: "C", LC_ALL: "C",
      GIT_NO_LAZY_FETCH: "0", GIT_TERMINAL_PROMPT: "1", FUNDING_TEST_REPO: process.cwd(),
    } });
    const result = JSON.parse(stdout); assert.equal(result.files.length, 3); assert.equal(result.commit, "a".repeat(40));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
