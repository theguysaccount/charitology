#!/usr/bin/env python3
"""Deterministic builder for the Denmark Skattestyrelsen approved charities index.

Reads the captured official Skattestyrelsen Den juridiske vejledning 2026-2
section C.A.4.3.5.9 HTML file (LL § 8 A, LL § 12 stk. 3, and BAL § 3 stk. 2)
from an input directory outside Git and writes byte-reproducible JSON/gzip/CSV
artifacts under public/data/charity-registry/denmark/.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import pathlib
import re
import unicodedata
from collections import Counter
from html.parser import HTMLParser


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_deterministic_gzip(path: pathlib.Path, payload: bytes) -> dict:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(payload)
    gz_bytes = buf.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gz_bytes)
    return {
        "path": path.name,
        "bytes": len(gz_bytes),
        "sha256": sha256_bytes(gz_bytes),
        "decodedBytes": len(payload),
        "decodedSha256": sha256_bytes(payload),
    }


def normalize_name(name: str) -> str:
    s = name.lower()
    # Fold Danish-specific characters so ASCII searches match Æ/Ø/Å cleanly.
    s = s.replace("æ", "ae").replace("ø", "o").replace("å", "aa")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


class TopTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self.cur_table: list[list[str]] | None = None
        self.cur_row: list[str] | None = None
        self.cur_cell: list[str] | None = None
        self.depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self.depth += 1
            if self.depth == 1:
                self.cur_table = []
        elif self.depth == 1 and tag == "tr":
            self.cur_row = []
        elif self.depth == 1 and tag in ("td", "th") and self.cur_row is not None:
            self.cur_cell = []

    def handle_data(self, data: str) -> None:
        if self.cur_cell is not None:
            self.cur_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self.cur_cell is not None and self.cur_row is not None:
            self.cur_row.append(re.sub(r"\s+", " ", "".join(self.cur_cell)).strip())
            self.cur_cell = None
        elif tag == "tr" and self.cur_row is not None and self.depth == 1:
            if any(self.cur_row) and self.cur_table is not None:
                self.cur_table.append(self.cur_row)
            self.cur_row = None
        elif tag == "table":
            if self.depth == 1 and self.cur_table is not None:
                self.tables.append(self.cur_table)
                self.cur_table = None
            self.depth = max(0, self.depth - 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument("--out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--captured-on", default="2026-11-23")
    args = parser.parse_args()

    html_path = args.input_dir / "skat-ca4359-2026-2.html"
    raw_bytes = html_path.read_bytes()
    raw_sha = sha256_bytes(raw_bytes)
    text = raw_bytes.decode("utf-8", "replace")

    pub_match = re.search(r'<meta[^>]+name="pubDate"[^>]+content="(\d{8})', text)
    pub_date = (
        f"{pub_match.group(1)[:4]}-{pub_match.group(1)[4:6]}-{pub_match.group(1)[6:8]}"
        if pub_match
        else "2026-07-31"
    )

    tp = TopTableParser()
    tp.feed(text)
    tbl = max(tp.tables, key=len)
    header = tbl[0]
    assert header[:5] == ["CVR nummer", "Navn", "1) § 8 A", "2) §12 stk. 3", "3) BAL"], f"Unexpected header: {header}"

    records: list[dict] = []
    seen_cvrs: set[str] = set()
    combos = Counter()
    s8a_full = s8a_partial = 0
    s12_full = s12_partial = 0
    bal_count = 0
    ceased_count = 0

    for row in tbl[1:]:
        assert len(row) == 5, f"Unexpected row width: {row}"
        cvr, raw_name, col8a, col12, colbal = row
        assert re.fullmatch(r"\d{8}", cvr), f"Invalid 8-digit CVR: {cvr}"
        assert cvr not in seen_cvrs, f"Duplicate CVR: {cvr}"
        seen_cvrs.add(cvr)
        assert raw_name.strip(), f"Empty name for CVR {cvr}"

        ceased = raw_name.upper().startswith("OPHØRT:")
        if ceased:
            ceased_count += 1
        clean_name = re.sub(r"^OPHØRT:\s*", "", raw_name, flags=re.I).strip()

        assert col8a in ("", "1", "1*"), f"Unexpected §8A marker: {col8a}"
        assert col12 in ("", "2", "2*"), f"Unexpected §12 marker: {col12}"
        assert colbal in ("", "3"), f"Unexpected BAL marker: {colbal}"

        has_8a = bool(col8a)
        partial_8a = col8a == "1*"
        has_12 = bool(col12)
        partial_12 = col12 == "2*"
        has_bal = bool(colbal)

        if has_8a:
            if partial_8a:
                s8a_partial += 1
            else:
                s8a_full += 1
        if has_12:
            if partial_12:
                s12_partial += 1
            else:
                s12_full += 1
        if has_bal:
            bal_count += 1

        combo_key = "+".join(
            [k for k, ok in (("s8a", has_8a), ("s12", has_12), ("bal", has_bal)) if ok]
        )
        combos[combo_key] += 1

        records.append(
            {
                "cvr": cvr,
                "name": clean_name,
                "rawName": raw_name,
                "norm": normalize_name(clean_name),
                "s8a": has_8a,
                "s8aPartial": partial_8a,
                "s12": has_12,
                "s12Partial": partial_12,
                "bal": has_bal,
                "ceased2025": ceased,
            }
        )

    records.sort(key=lambda r: (r["norm"], r["cvr"]))

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    payload_bytes = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    artifact = write_deterministic_gzip(out_dir / "organizations.json.gz", payload_bytes)
    artifact["rows"] = len(records)

    # Also write clean UTF-8 CSV for direct researcher download
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow(
        [
            "cvr",
            "name",
            "source_label",
            "ll_8a_approved",
            "ll_8a_partial_year",
            "ll_12_3_approved",
            "ll_12_3_partial_year",
            "bal_3_2_listed",
            "ceased_in_2025",
        ]
    )
    for r in records:
        writer.writerow(
            [
                r["cvr"],
                r["name"],
                r["rawName"],
                "true" if r["s8a"] else "false",
                "true" if r["s8aPartial"] else "false",
                "true" if r["s12"] else "false",
                "true" if r["s12Partial"] else "false",
                "true" if r["bal"] else "false",
                "true" if r["ceased2025"] else "false",
            ]
        )
    csv_bytes = csv_buf.getvalue().encode("utf-8")
    csv_path = out_dir / "denmark-approved-charities.csv"
    csv_path.write_bytes(csv_bytes)

    manifest = {
        "format": "charitology-denmark-registry-v1",
        "jurisdiction": "Denmark",
        "publisher": "Skattestyrelsen (Danish Tax Agency)",
        "editionTitle": "Den juridiske vejledning 2026-2 · C.A.4.3.5.9 Liste over godkendte foreninger",
        "asOf": pub_date,
        "approvalCalendarYear": 2025,
        "capturedOn": args.captured_on,
        "catalogues": {
            "skatApprovedList": "https://info.skat.dk/data.aspx?oid=2061734",
            "cvrRegister": "https://datacvr.virk.dk/",
            "indsamlingsnaevnet": "https://www.civilstyrelsen.dk/sagsomraader/indsamlingsnaevnet",
        },
        "sourceCapture": {
            "filename": html_path.name,
            "bytes": len(raw_bytes),
            "sha256": raw_sha,
            "url": "https://info.skat.dk/data.aspx?oid=2061734",
        },
        "deductionThresholdsDkk": {
            "ll8aCap2025": 19000,
            "ll8aCap2026": 20000,
        },
        "counts": {
            "includedOrganizations": len(records),
            "uniqueCvrs": len(seen_cvrs),
            "ll8aTotal": s8a_full + s8a_partial,
            "ll8aFullYear": s8a_full,
            "ll8aPartialYear": s8a_partial,
            "ll12Total": s12_full + s12_partial,
            "ll12FullYear": s12_full,
            "ll12PartialYear": s12_partial,
            "balListedTotal": bal_count,
            "ceased2025": ceased_count,
            "byCombination": dict(sorted(combos.items())),
        },
        "artifacts": {
            "organizations": artifact,
            "csv": {
                "path": csv_path.name,
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
                "rows": len(records),
            },
        },
        "notableEntries": {
            "ceased2025": [
                {"cvr": r["cvr"], "name": r["name"], "rawName": r["rawName"]}
                for r in records
                if r["ceased2025"]
            ],
            "allThreeStatutes": [
                {"cvr": r["cvr"], "name": r["name"]}
                for r in records
                if r["s8a"] and r["s12"] and r["bal"]
            ],
        },
    }

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Built Denmark index: {len(records)} orgs (LL §8A={s8a_full + s8a_partial}, "
        f"LL §12.3={s12_full + s12_partial}, BAL={bal_count}, ceased={ceased_count})."
    )


if __name__ == "__main__":
    main()
