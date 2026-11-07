# Humanitarian funding reference

This bounded Gap Map addition compares reported humanitarian funding with published plan requirements. It preserves the existing U.S. giving figures and private depth census. It does not measure all charitable giving, independently assessed need, impact, cause funding or giving by depth. It supplies no country or worldwide funding total because source rows can overlap. All interpretation remains draft; AI assistance is disclosed in the release PR.

## Source and rights

The source is OCHA FTS’s [Global - Requirements and Funding Data](https://data.humdata.org/dataset/global-requirements-and-funding-data), distributed through HDX. The captured bulk CSV is 279,894 bytes, SHA-256 `ad5cb07e4f70a528e51b66b865f798ff2ef95e5a8b0d77ad3b8a303b58bb364d`. Its successful response carried HTTP Date `Sat, 07 Nov 2026 14:29:08 GMT`. The publisher’s separate resource-modified string is `2026-11-06T11:16:07.816493`; no timezone is invented for that field.

The [contextual HAPI guide](https://hdx-hapi.readthedocs.io/en/latest/data_usage_guides/coordination_and_context/) explains USD units and appeal requirements. Its processed endpoint has a narrower scope than the downloaded bulk file. [OCHA’s FTS guidance](https://knowledge.base.unocha.org/wiki/spaces/imtoolbox/pages/2359263233) describes donor/recipient reporting and curation. These primary sources and the [CC BY 3.0 IGO legal terms](https://creativecommons.org/licenses/by/3.0/igo/legalcode) were read on November 7, 2026.

Source data retain CC BY 3.0 IGO, the original title and canonical URLs. Attribution, license and a modification notice accompany the page, complete API, retained original-CSV evidence envelope and every selected export, including an empty selection. The complete original CSV is wrapped in that separately licensed JSON envelope. The publisher’s full metadata response remains private; only the closed source metadata fields are published. The interpretation implies no publisher endorsement.

## Data contract

The complete source has 3,875 data records. The fixed 2025 selection contains 195 rows across 109 country codes: 86 identified plan-country rows, three blank funding fields, three explicit funding zeros and 84 rows with positive requirements and known funding. A blank plan ID means no ID was supplied; it is not an inferred country total. Repeated plan IDs under different countries remain separate records. All twelve decoded source strings, order, raw record numbers, physical lines, UTF-8 byte spans and raw-record hashes are retained.

Missing values remain distinct from zero. Signed funding adjustments, source-rounded percentages and overfunding remain intact. Derived coverage uses reduced exact integer fractions; displayed percentages round to two decimals, with exact halves away from zero. Zero requirements do not produce a ratio. No amount is converted to a floating-point number for calculation.

JSON is the canonical representation of the original field strings. CSV adds a marked provenance row and fixed metadata columns. For plan-name, plan-code and type-name text only, it prefixes an apostrophe when the original begins with an apostrophe or its first non-whitespace character is `=`, `+`, `@` or `-`. Removing that one prefix under the recorded rule recovers the original text. Signed numeric funding is unchanged. This transformed CSV is not described as byte-exact raw source text.

## Reproducible capture

Commit reviewed interpreter code A before making data B. The capture pins `scripts/capture-humanitarian-funding.mjs`, `src/lib/humanitarian-funding/model.mjs` and `src/lib/humanitarian-funding/source.mjs` to that exact ancestor commit and current bytes. Both Git children explicitly prohibit lazy fetching and interactive prompts. A missing local object or uncommitted interpreter change refuses capture.

The explicit capture command accepts only reviewed local CSV, metadata and sanitized capture-receipt files plus a source commit:

```sh
node scripts/capture-humanitarian-funding.mjs --plan --metadata METADATA_FILE --receipt RECEIPT_FILE --csv CSV_FILE --source-commit CODE_A
```

`--write` creates only missing immutable artifacts after checking every target; differing existing bytes refuse. `--check` regenerates in memory and requires exact existing bytes. No network request occurs. Source and metadata input hashes are fixed before interpretation. The public build loader re-admits the original source, checks current interpreter bytes and recursively freezes the admitted edition before caching it. There is no environment-controlled replacement dataset or live refresh.

## Verification and limits

The source-only candidate passed 13 focused model/capture/export groups, eight actual Astro SSR/mounted-controller/build-helper groups and strict client TypeScript compilation. Cases include quoted multiline Unicode, BOM/CRLF/LF byte spans, malformed/unselected records, duplicate country-plan-year keys, missing and signed amounts, half rounding, zero denominators, resealed omission/tampering, empty licensed exports, reversible formula-like text, Git child refusal settings and cached immutability. Mounted actions exercise the production controller, Blob contents, conjunctive filtering, no storage/network calls, refusal paths and owned URL cleanup. A separately implemented Python Fraction comparison matched every one of the 84 comparable source rows’ exact fractions and displayed percentages.

These are engineering checks, not independent human source review or evidence of humanitarian need. Source-only code A reports unavailable data honestly. Data B, complete build/check, actual browser layout/keyboard/downloads, CI and publication must retain their own actual receipts before they are claimed. Native file-save behavior and independent accessibility review are not established by the mounted harness. This slice does not complete the broader cause/geography/period funding-and-need ambition in the original mega list.
