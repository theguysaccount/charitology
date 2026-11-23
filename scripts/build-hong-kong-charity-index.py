#!/usr/bin/env python3
"""Deterministic builder for Hong Kong's Inland Revenue Department (IRD)
Section 88 Approved Charitable Institutions & Trusts registry.

Reads s88list.csv from an input directory outside Git, collapses parent +
subsidiary rows into distinct parent charitable institutions (preserving all
bilingual names, aliases, effective dates and subsidiary operating bodies),
and emits byte-reproducible artifacts under public/data/charity-registry/hong-kong/.
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


def normalize_en(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def parse_dmy(s: str) -> str:
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", s.strip())
    assert m, f"Unexpected HK date token: {s!r}"
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument("--out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--captured-on", default="2026-11-23")
    args = parser.parse_args()

    csv_path = args.input_dir / "s88list.csv"
    raw_bytes = csv_path.read_bytes()
    raw_sha = sha256_bytes(raw_bytes)
    text = raw_bytes.decode("utf-8-sig")
    rows = list(csv.reader(text.splitlines()))
    header, data = rows[0], rows[1:]
    assert len(header) == 11, f"Unexpected HK CSV column count: {len(header)}"

    as_of_iso = parse_dmy(data[0][0])
    parents: dict[tuple[str, str], dict] = {}
    total_sub_rows = 0

    for idx, r in enumerate(data, start=1):
        assert len(r) == 11, f"Unexpected row width at row {idx}: {len(r)}"
        pos_iso = parse_dmy(r[0])
        assert pos_iso == as_of_iso, f"Inconsistent position date {pos_iso}"
        en = r[1].strip()
        zh = r[2].strip()
        assert en or zh, f"Empty both EN and ZH names at row {idx}"
        en_a1 = r[3].strip()
        en_a2 = r[4].strip()
        zh_a = r[5].strip()
        eff_iso = parse_dmy(r[6])
        sub_en = r[7].strip()
        sub_zh = r[8].strip()
        sub2_en = r[9].strip()
        sub2_zh = r[10].strip()

        key = (en, zh)
        rec = parents.get(key)
        if rec is None:
            rec = {
                "en": en,
                "zh": zh,
                "aliasesEn": [],
                "aliasesZh": [],
                "effectiveDate": eff_iso,
                "subsidiaries": [],
                "sourceRows": 0,
            }
            parents[key] = rec

        rec["sourceRows"] += 1
        if eff_iso < rec["effectiveDate"]:
            rec["effectiveDate"] = eff_iso
        for a in (en_a1, en_a2):
            if a and a not in rec["aliasesEn"]:
                rec["aliasesEn"].append(a)
        if zh_a and zh_a not in rec["aliasesZh"]:
            rec["aliasesZh"].append(zh_a)

        if sub_en or sub_zh or sub2_en or sub2_zh:
            total_sub_rows += 1
            label = " / ".join([x for x in (sub_en, sub_zh, sub2_en, sub2_zh) if x])
            if label and label not in rec["subsidiaries"]:
                rec["subsidiaries"].append(label)

    records: list[dict] = []
    decade_counts = Counter()
    bilingual = en_only = zh_only = with_subs = 0

    for (en, zh), rec in parents.items():
        if en and zh:
            bilingual += 1
        elif en:
            en_only += 1
        else:
            zh_only += 1
        if rec["subsidiaries"]:
            with_subs += 1
        yr = int(rec["effectiveDate"][:4])
        decade = f"{(yr // 10) * 10}s"
        decade_counts[decade] += 1
        records.append(
            {
                "en": en,
                "zh": zh,
                "norm": normalize_en(en or zh),
                "aliasesEn": rec["aliasesEn"],
                "aliasesZh": rec["aliasesZh"],
                "effectiveDate": rec["effectiveDate"],
                "subsidiaryCount": len(rec["subsidiaries"]),
                "subsidiaries": rec["subsidiaries"][:25],
            }
        )

    records.sort(key=lambda r: (r["norm"] or "zzz", r["en"], r["zh"]))
    top_multi_sub = sorted(records, key=lambda r: (-r["subsidiaryCount"], r["en"], r["zh"]))[:15]

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    art = write_deterministic_gzip(out_dir / "charities.json.gz", payload)
    art["rows"] = len(records)

    csv_buf = io.StringIO()
    w = csv.writer(csv_buf, lineterminator="\n")
    w.writerow(["english_name", "chinese_name", "english_aliases", "chinese_aliases", "effective_date", "subsidiary_count"])
    for r in records:
        w.writerow(
            [
                r["en"],
                r["zh"],
                "; ".join(r["aliasesEn"]),
                "; ".join(r["aliasesZh"]),
                r["effectiveDate"],
                r["subsidiaryCount"],
            ]
        )
    csv_bytes = csv_buf.getvalue().encode("utf-8")
    csv_out = out_dir / "hong-kong-section-88-charities.csv"
    csv_out.write_bytes(csv_bytes)

    manifest = {
        "format": "charitology-hong-kong-registry-v1",
        "jurisdiction": "Hong Kong",
        "publisher": "Inland Revenue Department, Government of the Hong Kong Special Administrative Region",
        "asOf": as_of_iso,
        "capturedOn": args.captured_on,
        "catalogues": {
            "irdIndex": "https://www.ird.gov.hk/eng/tax/ach_index.htm",
            "irdCsv": "https://www.ird.gov.hk/charity/csv/s88list.csv",
            "govHkFundraising": "https://fundraising.one.gov.hk/fundraise_query/webservice/psi/json",
        },
        "sourceCapture": {
            "filename": csv_path.name,
            "bytes": len(raw_bytes),
            "sha256": raw_sha,
            "url": "https://www.ird.gov.hk/charity/csv/s88list.csv",
        },
        "counts": {
            "sourceRows": len(data),
            "subsidiaryRows": total_sub_rows,
            "includedOrganizations": len(records),
            "bilingualOrganizations": bilingual,
            "englishOnlyOrganizations": en_only,
            "chineseOnlyOrganizations": zh_only,
            "organizationsWithSubsidiaries": with_subs,
            "earliestEffectiveDate": min(r["effectiveDate"] for r in records),
            "latestEffectiveDate": max(r["effectiveDate"] for r in records),
            "byDecade": dict(sorted(decade_counts.items())),
        },
        "topParentNetworks": [
            {
                "en": r["en"],
                "zh": r["zh"],
                "effectiveDate": r["effectiveDate"],
                "subsidiaryCount": r["subsidiaryCount"],
            }
            for r in top_multi_sub
        ],
        "artifacts": {
            "charities": art,
            "csv": {
                "path": csv_out.name,
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
                "rows": len(records),
            },
        },
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Built Hong Kong index: {len(records):,} distinct Section 88 charities "
        f"(collapsed from {len(data):,} rows incl. {total_sub_rows:,} subsidiary rows; "
        f"{bilingual:,} bilingual, {with_subs:,} with subsidiaries)."
    )


if __name__ == "__main__":
    main()
