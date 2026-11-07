// Fictional engineering data only; never a published FTS capture or research result.
import { FUNDING_HEADERS, FUNDING_LICENSE, parseFundingCsv, makeFundingEdition, makeFundingSource } from "../../src/lib/humanitarian-funding/model.mjs";
const cell = s => /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
export const fixtureRows = () => [
  ["AAA", "101", "Fictional plan alpha", "FALPHA25", "5", "Flash appeal", "2025-01-01", "2025-12-31", "2025", "3", "1", "33"],
  ["BBB", "101", "Fictional plan beta", "FBETA25", "111", "Regional response plan", "2025-01-01", "2025-12-31", "2025", "4.00", "5.00", "125"],
  ["AAA", "", "Not specified", "", "", "", "", "", "2025", "", "0", ""],
  ["CCC", "", "Fictional prior adjustment", "", "", "", "", "", "2024", "", "-0.25", ""],
];
export const csvFixture = (rows = fixtureRows(), ending = "\r\n") => [FUNDING_HEADERS, ...rows].map(row => row.map(cell).join(",")).join(ending) + ending;
export function fundingFixture(rows = fixtureRows()) {
  const text = csvFixture(rows), parsed = parseFundingCsv(new TextEncoder().encode(text));
  const source = {
    publisher: "Fictional engineering source", title: "Fictional CSV fixture, not OCHA data",
    csvSha256: parsed.sourceSha256, csvBytes: parsed.sourceBytes,
    resourceUrl: "https://example.invalid/fictional-funding.csv", datasetUrl: "https://example.invalid/fictional-funding/",
    resourceModified: "Fixture only", httpDate: "Sat, 07 Nov 2026 14:29:08 GMT", asOf: "2026-11-07T14:29:08.000Z",
    evidenceUrl: "/fictional-funding-source.json", attribution: "Fictional software fixture; no actual humanitarian funding claim.",
    license: { ...FUNDING_LICENSE },
  };
  const code = { format: "charitology-funding-source-code", version: 1, commit: "a".repeat(40), files: [] };
  return { text, parsed, source, code, edition: makeFundingEdition(parsed, source, code), envelope: makeFundingSource(text, source, code) };
}
