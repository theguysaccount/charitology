#!/usr/bin/env python3
"""Deterministic builder for Charitology's Poland Global Charity Index edition.

Builds two reproducible public assets from 11 official CC0 1.0 Excel workbooks
published on dane.gov.pl (3 NIW-CRSO eligible OPP lists for tax years 2023-2025
+ 8 Ministry of Finance 1.5% PIT disbursement & taxpayer count workbooks for
tax years 2022-2025, paid 2023-2026):
  1. public/data/charity-registry/poland/
  2. public/data/funding-flows/poland-pit-1-5-percent/

Pure Python 3 standard library only; byte-for-byte deterministic output.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

CAPTURED_ON = "2026-11-22"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
XLSX_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

# 16 canonical Polish voivodeships -> short code & English/Polish labels
VOIVODESHIPS: dict[str, tuple[str, str, str]] = {
    "DOLNOŚLĄSKIE": ("DS", "Dolnośląskie", "Lower Silesian"),
    "KUJAWSKO-POMORSKIE": ("KP", "Kujawsko-Pomorskie", "Kuyavian-Pomeranian"),
    "LUBELSKIE": ("LU", "Lubelskie", "Lublin"),
    "LUBUSKIE": ("LB", "Lubuskie", "Lubusz"),
    "ŁÓDZKIE": ("LD", "Łódzkie", "Łódź"),
    "MAŁOPOLSKIE": ("MA", "Małopolskie", "Lesser Poland"),
    "MAZOWIECKIE": ("MZ", "Mazowieckie", "Masovian"),
    "OPOLSKIE": ("OP", "Opolskie", "Opole"),
    "PODKARPACKIE": ("PK", "Podkarpackie", "Subcarpathian"),
    "PODLASKIE": ("PD", "Podlaskie", "Podlaskie"),
    "POMORSKIE": ("PM", "Pomorskie", "Pomeranian"),
    "ŚLĄSKIE": ("SL", "Śląskie", "Silesian"),
    "ŚWIĘTOKRZYSKIE": ("SK", "Świętokrzyskie", "Świętokrzyskie"),
    "WARMIŃSKO-MAZURSKIE": ("WN", "Warmińsko-Mazurskie", "Warmian-Masurian"),
    "WIELKOPOLSKIE": ("WP", "Wielkopolskie", "Greater Poland"),
    "ZACHODNIOPOMORSKIE": ("ZP", "Zachodniopomorskie", "West Pomeranian"),
}

VOIV_SYNONYMS: dict[str, str] = {
    "MAŁOPOLSKA": "MAŁOPOLSKIE",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_deterministic(raw: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    return buf.getvalue()


def write_json_gz(path: Path, obj: object, row_count: int) -> dict[str, object]:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    gz = gzip_deterministic(raw)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gz)
    return {
        "path": path.name,
        "rows": row_count,
        "bytes": len(gz),
        "decodedBytes": len(raw),
        "sha256": sha256_bytes(gz),
        "decodedSha256": sha256_bytes(raw),
    }


def write_json_file(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def read_xlsx_sheet1(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", XLSX_NS):
                shared.append(
                    "".join(
                        t.text or ""
                        for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    )
                )
        root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in root.findall(".//m:sheetData/m:row", XLSX_NS):
            vals: dict[int, str] = {}
            max_c = 0
            for c in row.findall("m:c", XLSX_NS):
                ref = c.attrib.get("r", "")
                idx = 0
                for ch in ref:
                    if ch.isalpha():
                        idx = idx * 26 + (ord(ch.upper()) - 64)
                    else:
                        break
                idx -= 1
                t = c.attrib.get("t", "")
                v = c.find("m:v", XLSX_NS)
                is_el = c.find("m:is", XLSX_NS)
                val = ""
                if t == "s" and v is not None and v.text is not None:
                    val = shared[int(v.text)]
                elif t == "inlineStr" and is_el is not None:
                    val = "".join(
                        x.text or ""
                        for x in is_el.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    )
                elif v is not None and v.text is not None:
                    val = v.text
                vals[idx] = val.strip()
                if idx + 1 > max_c:
                    max_c = idx + 1
            rows.append([vals.get(i, "") for i in range(max_c)])
        return rows


def clean_ws(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def norm_krs(raw: str) -> str:
    digits = re.sub(r"\D+", "", raw or "")
    if not digits or len(digits) > 10:
        raise ValueError(f"Invalid KRS value: {raw!r}")
    return digits.zfill(10)


def valid_nip(nip: str) -> bool:
    if not re.fullmatch(r"\d{10}", nip):
        return False
    weights = (6, 5, 7, 2, 3, 4, 5, 6, 7)
    check = sum(int(nip[i]) * weights[i] for i in range(9)) % 11
    return check == int(nip[9])


def load_source_pins(repo_root: Path) -> list[dict[str, str]]:
    tsv_path = repo_root / "src" / "data" / "poland-index-sources.tsv"
    with tsv_path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def verify_inputs(source_dir: Path, pins: list[dict[str, str]]) -> dict[str, dict[str, object]]:
    verified: dict[str, dict[str, object]] = {}
    for pin in pins:
        fp = source_dir / pin["filename"]
        if not fp.is_file():
            raise FileNotFoundError(f"Missing pinned capture: {fp}")
        raw = fp.read_bytes()
        got_len = len(raw)
        got_sha = sha256_bytes(raw)
        if got_len != int(pin["bytes"]) or got_sha != pin["sha256"]:
            raise ValueError(
                f"Source mismatch for {pin['filename']}: expected ({pin['bytes']}, {pin['sha256']}), "
                f"got ({got_len}, {got_sha})"
            )
        verified[pin["key"]] = {
            "filename": pin["filename"],
            "publisher": pin["publisher"],
            "datasetUrl": pin["dataset_url"],
            "url": pin["download_url"],
            "bytes": got_len,
            "sha256": got_sha,
        }
    return verified


def parse_niw(path: Path) -> tuple[dict[str, dict[str, str]], list[dict[str, str]], str]:
    rows = read_xlsx_sheet1(path)
    updated_note = clean_ws(rows[1][0]) if len(rows) > 1 and rows[1] else ""
    hdr_idx = next(i for i, r in enumerate(rows) if len(r) >= 4 and "KRS" in r[1].upper())
    out: dict[str, dict[str, str]] = {}
    spelling_fixes: list[dict[str, str]] = []
    for row_num, r in enumerate(rows[hdr_idx + 1 :], start=hdr_idx + 2):
        if not any(r):
            continue
        krs = norm_krs(r[1] if len(r) > 1 else "")
        if krs in out:
            raise ValueError(f"Duplicate KRS {krs} in {path.name} row {row_num}")
        raw_nip = re.sub(r"\D+", "", r[2] if len(r) > 2 else "")
        nip = raw_nip if raw_nip else ""
        if nip and not valid_nip(nip):
            raise ValueError(f"Invalid NIP checksum {nip} for KRS {krs} in {path.name}")
        name = clean_ws(r[3] if len(r) > 3 else "")
        raw_voiv = clean_ws(r[4] if len(r) > 4 else "").upper()
        canon_voiv = VOIV_SYNONYMS.get(raw_voiv, raw_voiv)
        if raw_voiv and raw_voiv != canon_voiv:
            spelling_fixes.append({
                "file": path.name,
                "row": str(row_num),
                "krs": krs,
                "name": name,
                "rawVoivodeship": raw_voiv,
                "canonicalVoivodeship": canon_voiv,
            })
        if canon_voiv not in VOIVODESHIPS:
            raise ValueError(f"Unknown voivodeship {raw_voiv!r} for KRS {krs} in {path.name}")
        city = clean_ws(r[7] if len(r) > 7 else "")
        out[krs] = {
            "krs": krs,
            "nip": nip,
            "name": name,
            "voivCode": VOIVODESHIPS[canon_voiv][0],
            "city": city,
        }
    return out, spelling_fixes, updated_note


def parse_mf_amounts(path: Path) -> tuple[dict[str, tuple[str, int]], int]:
    rows = read_xlsx_sheet1(path)
    hdr = rows[0]
    k_col = next(i for i, h in enumerate(hdr) if "KRS" in h.upper())
    n_col = next(i for i, h in enumerate(hdr) if "NAZWA" in h.upper())
    a_col = next(i for i, h in enumerate(hdr) if "KWOTA" in h.upper())
    out: dict[str, tuple[str, int]] = {}
    total_grosze = 0
    for row_num, r in enumerate(rows[1:], start=2):
        if not any(r):
            continue
        krs = norm_krs(r[k_col] if len(r) > k_col else "")
        if krs in out:
            raise ValueError(f"Duplicate KRS {krs} in {path.name} row {row_num}")
        name = clean_ws(r[n_col] if len(r) > n_col else "")
        raw_amt = (r[a_col] if len(r) > a_col else "").replace(",", ".").replace(" ", "")
        grosze = int((Decimal(raw_amt) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if grosze <= 0:
            raise ValueError(f"Non-positive amount {grosze} for KRS {krs} in {path.name}")
        out[krs] = (name, grosze)
        total_grosze += grosze
    return out, total_grosze


def parse_mf_taxpayers(path: Path) -> tuple[dict[str, int], int]:
    rows = read_xlsx_sheet1(path)
    hdr = rows[0]
    k_col = next(i for i, h in enumerate(hdr) if "KRS" in h.upper())
    c_col = next(i for i, h in enumerate(hdr) if "LICZBA" in h.upper() or "PODATNIK" in h.upper())
    out: dict[str, int] = {}
    total_tenths_k = 0
    for row_num, r in enumerate(rows[1:], start=2):
        if not any(r):
            continue
        krs = norm_krs(r[k_col] if len(r) > k_col else "")
        if krs in out:
            raise ValueError(f"Duplicate KRS {krs} in {path.name} row {row_num}")
        raw_t = (r[c_col] if len(r) > c_col else "").replace(",", ".").replace(" ", "")
        tenths_k = int((Decimal(raw_t) * 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if tenths_k <= 0:
            raise ValueError(f"Non-positive taxpayer count {tenths_k} for KRS {krs} in {path.name}")
        out[krs] = tenths_k
        total_tenths_k += tenths_k
    return out, total_tenths_k


def build(source_dir: Path, out_root: Path, repo_root: Path) -> None:
    pins = load_source_pins(repo_root)
    sources_meta = verify_inputs(source_dir, pins)

    niw_years = [2023, 2024, 2025]
    niw_data: dict[int, dict[str, dict[str, str]]] = {}
    niw_notes: dict[int, str] = {}
    spelling_fixes: list[dict[str, str]] = []
    for yr in niw_years:
        fn = source_dir / f"niw-opp-eligible-{yr}-in-{yr+1}.xlsx"
        data, fixes, note = parse_niw(fn)
        niw_data[yr] = data
        niw_notes[yr] = note
        spelling_fixes.extend(fixes)

    pit_years = [2022, 2023, 2024, 2025]
    mf_amt: dict[int, dict[str, tuple[str, int]]] = {}
    mf_amt_totals: dict[int, int] = {}
    mf_tax: dict[int, dict[str, int]] = {}
    mf_tax_totals: dict[int, int] = {}
    for yr in pit_years:
        a_data, a_tot = parse_mf_amounts(source_dir / f"mf-pit15-amounts-{yr}-in-{yr+1}.xlsx")
        t_data, t_tot = parse_mf_taxpayers(source_dir / f"mf-pit15-taxpayers-{yr}-in-{yr+1}.xlsx")
        extra_tax = set(t_data) - set(a_data)
        if extra_tax:
            raise ValueError(f"Taxpayer sheet {yr} has KRS absent from amounts sheet: {sorted(extra_tax)[:5]}")
        mf_amt[yr] = a_data
        mf_amt_totals[yr] = a_tot
        mf_tax[yr] = t_data
        mf_tax_totals[yr] = t_tot

    all_krs = sorted(
        set().union(*(d.keys() for d in niw_data.values()), *(d.keys() for d in mf_amt.values()))
    )

    # Build unified organization tuples & funding recipient tuples
    org_rows: list[list[object]] = []
    funded_rows: list[list[object]] = []
    voiv_org_counts: Counter[str] = Counter()
    voiv_2025_grosze: Counter[str] = Counter()
    voiv_2025_funded: Counter[str] = Counter()
    elig_mask_counts: Counter[int] = Counter()
    with_nip_count = 0
    zero_all_years_count = 0

    for krs in all_krs:
        # Most recent NIW metadata (prefer 2025 -> 2024 -> 2023)
        niw_rec = niw_data[2025].get(krs) or niw_data[2024].get(krs) or niw_data[2023].get(krs)
        nip: str | None = None
        for yr in (2025, 2024, 2023):
            cand = niw_data[yr].get(krs, {}).get("nip", "")
            if cand:
                nip = cand
                break
        if nip:
            with_nip_count += 1

        # Most recent official name (NIW 2025 -> MF 2025 -> NIW 2024 -> MF 2024 -> NIW 2023 -> MF 2023 -> MF 2022)
        name = ""
        for cand in (
            niw_data[2025].get(krs, {}).get("name"),
            mf_amt[2025].get(krs, ("", 0))[0],
            niw_data[2024].get(krs, {}).get("name"),
            mf_amt[2024].get(krs, ("", 0))[0],
            niw_data[2023].get(krs, {}).get("name"),
            mf_amt[2023].get(krs, ("", 0))[0],
            mf_amt[2022].get(krs, ("", 0))[0],
        ):
            if cand:
                name = cand
                break

        voiv_code: str | None = niw_rec["voivCode"] if niw_rec else None
        city: str | None = (niw_rec["city"] or None) if niw_rec else None
        if voiv_code:
            voiv_org_counts[voiv_code] += 1

        elig_mask = (
            (1 if krs in niw_data[2023] else 0)
            | (2 if krs in niw_data[2024] else 0)
            | (4 if krs in niw_data[2025] else 0)
        )
        elig_mask_counts[elig_mask] += 1

        y_grosze = [mf_amt[yr][krs][1] if krs in mf_amt[yr] else 0 for yr in pit_years]
        y_tax = [mf_tax[yr].get(krs) for yr in pit_years]
        total_4yr = sum(y_grosze)

        latest_yr: int | None = None
        latest_grosze: int | None = None
        latest_tax: int | None = None
        for idx in (3, 2, 1, 0):
            if y_grosze[idx] > 0:
                latest_yr = pit_years[idx]
                latest_grosze = y_grosze[idx]
                latest_tax = y_tax[idx]
                break

        if total_4yr == 0:
            zero_all_years_count += 1
        else:
            funded_rows.append([
                krs,
                name,
                voiv_code,
                elig_mask,
                total_4yr,
                y_grosze[0],
                y_grosze[1],
                y_grosze[2],
                y_grosze[3],
                y_tax[0],
                y_tax[1],
                y_tax[2],
                y_tax[3],
            ])

        if y_grosze[3] > 0:
            vkey = voiv_code or "UN"
            voiv_2025_grosze[vkey] += y_grosze[3]
            voiv_2025_funded[vkey] += 1

        org_rows.append([
            krs,
            nip,
            name,
            voiv_code,
            city,
            elig_mask,
            total_4yr,
            latest_yr,
            latest_grosze,
            latest_tax,
        ])

    # Sort funded rows descending by 4-year total grosze, then KRS
    funded_rows.sort(key=lambda r: (-int(r[4]), str(r[0])))

    # Compute yearly summary & reconciliation
    by_year = []
    paid_outside_niw: dict[str, list[dict[str, object]]] = {}
    for yr in pit_years:
        elig_set = set(niw_data[yr]) if yr in niw_data else None
        paid_set = set(mf_amt[yr])
        elig_count = len(elig_set) if elig_set is not None else None
        elig_zero = len(elig_set - paid_set) if elig_set is not None else None
        paid_not_elig_krs = sorted(paid_set - elig_set) if elig_set is not None else []
        if elig_set is not None:
            paid_outside_niw[str(yr)] = [
                {
                    "krs": k,
                    "name": mf_amt[yr][k][0],
                    "grosze": mf_amt[yr][k][1],
                    "pln": f"{mf_amt[yr][k][1] / 100:.2f}",
                    "taxpayersTenthsK": mf_tax[yr].get(k),
                    "inOtherNiwYear": any(k in niw_data[oy] for oy in niw_years if oy != yr),
                }
                for k in sorted(paid_not_elig_krs, key=lambda x: (-mf_amt[yr][x][1], x))
            ]

        amts_desc = sorted((g for _, g in mf_amt[yr].values()), reverse=True)
        tot = mf_amt_totals[yr]
        top10 = sum(amts_desc[:10])
        top100 = sum(amts_desc[:100])
        by_year.append({
            "taxYear": yr,
            "payoutYear": yr + 1,
            "eligibleNiwCount": elig_count,
            "niwUpdatedNote": niw_notes.get(yr),
            "fundedOrgCount": len(mf_amt[yr]),
            "eligiblePaidZeroCount": elig_zero,
            "paidNotInFinalNiwCount": len(paid_not_elig_krs) if elig_set is not None else None,
            "totalGrosze": tot,
            "taxpayerSheetOrgCount": len(mf_tax[yr]),
            "belowTaxpayerThresholdOrgCount": len(mf_amt[yr]) - len(mf_tax[yr]),
            "disclosedTaxpayersTenthsK": mf_tax_totals[yr],
            "top10SharePct": round(top10 * 100 / tot, 2),
            "top100SharePct": round(top100 * 100 / tot, 2),
        })

    # Top 15 recipients for latest tax year (2025, paid 2026)
    top15_2025 = []
    for krs, (name, grosze) in sorted(mf_amt[2025].items(), key=lambda kv: (-kv[1][1], kv[0]))[:15]:
        tax_tenths = mf_tax[2025].get(krs)
        avg_pln = round((grosze / 100) / (tax_tenths * 100), 2) if tax_tenths else None
        niw25 = niw_data[2025].get(krs)
        g22 = mf_amt[2022].get(krs, ("", 0))[1]
        top15_2025.append({
            "krs": krs,
            "name": name,
            "voivCode": niw25["voivCode"] if niw25 else None,
            "grosze2025": grosze,
            "share2025Pct": round(grosze * 100 / mf_amt_totals[2025], 2),
            "taxpayers2025TenthsK": tax_tenths,
            "avgPlnPerTaxpayer2025": avg_pln,
            "grosze2022": g22,
            "total4yrGrosze": sum(mf_amt[y].get(krs, ("", 0))[1] for y in pit_years),
        })

    voiv_meta = {}
    for canon_pl, (code, pl_label, en_label) in sorted(VOIVODESHIPS.items(), key=lambda kv: kv[1][0]):
        voiv_meta[code] = {
            "pl": pl_label,
            "en": en_label,
            "orgs": voiv_org_counts[code],
            "funded2025": voiv_2025_funded[code],
            "grosze2025": voiv_2025_grosze[code],
        }

    # Write Registry assets
    reg_dir = out_root / "charity-registry" / "poland"
    reg_asset = write_json_gz(reg_dir / "organizations.json.gz", org_rows, len(org_rows))
    reg_manifest = {
        "format": "charitology.poland-opp-registry.v1",
        "capturedOn": CAPTURED_ON,
        "publisher": "NIW-CRSO & Ministerstwo Finansów (Poland) via dane.gov.pl",
        "catalogues": {
            "niw2025": "https://dane.gov.pl/pl/dataset/20137",
            "niw2024": "https://dane.gov.pl/pl/dataset/4628",
            "niw2023": "https://dane.gov.pl/pl/dataset/3564",
            "mfPit15": "https://dane.gov.pl/pl/dataset/171",
        },
        "license": LICENSE_URL,
        "licenseName": "CC0 1.0 Universal (Public Domain Dedication)",
        "sources": sources_meta,
        "counts": {
            "includedOrganizations": len(org_rows),
            "eligible2025": len(niw_data[2025]),
            "eligible2024": len(niw_data[2024]),
            "eligible2023": len(niw_data[2023]),
            "eligibleAllThreeYears": elig_mask_counts[7],
            "eligible2025OnlyNew": elig_mask_counts[4],
            "notEligibleInFinal2025List": len(org_rows) - len(niw_data[2025]),
            "withValidatedNip": with_nip_count,
            "fundedAnyYear2022to2025": len(funded_rows),
            "zeroTransferAllFourYears": zero_all_years_count,
            "total4yrPit15Grosze": sum(mf_amt_totals.values()),
        },
        "voivodeships": voiv_meta,
        "sourceNormalizations": {
            "voivodeshipTypoFixes": spelling_fixes,
            "krsZeroPadding": "NIW workbooks store KRS as unpadded integers; all KRS values are canonicalized to 10 digits with leading zeros to match Ministry of Finance and KRS court identifiers.",
            "nipValidation": "Every non-blank 10-digit NIP passes Poland's official weighted mod-11 check digit.",
            "privacyProjection": "Street addresses and postal codes are excluded; voivodeship and city (miejscowość) only are retained.",
        },
        "fields": [
            "krs", "nip", "name", "voivCode", "city",
            "eligMask", "total4yrGrosze", "latestYr", "latestGrosze", "latestTaxpayersTenthsK",
        ],
        "asset": reg_asset,
    }
    write_json_file(reg_dir / "manifest.json", reg_manifest)

    # Write Funding Flows assets
    flow_dir = out_root / "funding-flows" / "poland-pit-1-5-percent"
    flow_asset = write_json_gz(flow_dir / "recipients.json.gz", funded_rows, len(funded_rows))

    # Write yearly-2022-2025.csv
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow([
        "tax_year", "payout_year", "eligible_niw_orgs", "funded_orgs",
        "eligible_paid_zero_orgs", "paid_not_in_final_niw_orgs",
        "total_pln", "taxpayer_sheet_orgs", "below_0_1k_threshold_orgs",
        "disclosed_taxpayers_thousands", "top10_share_pct", "top100_share_pct",
    ])
    for y in by_year:
        writer.writerow([
            y["taxYear"],
            y["payoutYear"],
            "" if y["eligibleNiwCount"] is None else y["eligibleNiwCount"],
            y["fundedOrgCount"],
            "" if y["eligiblePaidZeroCount"] is None else y["eligiblePaidZeroCount"],
            "" if y["paidNotInFinalNiwCount"] is None else y["paidNotInFinalNiwCount"],
            f"{y['totalGrosze'] / 100:.2f}",
            y["taxpayerSheetOrgCount"],
            y["belowTaxpayerThresholdOrgCount"],
            f"{y['disclosedTaxpayersTenthsK'] / 10:.1f}",
            f"{y['top10SharePct']:.2f}",
            f"{y['top100SharePct']:.2f}",
        ])
    (flow_dir / "yearly-2022-2025.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    # Write reconciliation.json
    reconciliation = {
        "capturedOn": CAPTURED_ON,
        "reportingThresholdNote": (
            "Ministry of Finance publishes exact PLN to the grosz (minimum PLN 0.60 in 2025) for all funded OPPs, "
            "while its companion taxpayer-count workbook reports counts in thousands rounded to 0.1k (100 taxpayers) "
            "and omits OPPs below 0.1k (~50 taxpayers). Zero KRS identifiers appear in any taxpayer sheet without "
            "appearing in the corresponding amounts sheet."
        ),
        "voivodeshipSpellingFixes": spelling_fixes,
        "paidNotInFinalNiwSummary": {
            yr: {
                "count": len(rows),
                "totalGrosze": sum(int(r["grosze"]) for r in rows),
                "inOtherNiwYearCount": sum(1 for r in rows if r["inOtherNiwYear"]),
            }
            for yr, rows in paid_outside_niw.items()
        },
        "paidNotInFinalNiwByTaxYear": paid_outside_niw,
    }
    write_json_file(flow_dir / "reconciliation.json", reconciliation)

    flow_manifest = {
        "format": "charitology.poland-pit-1-5-percent.v1",
        "capturedOn": CAPTURED_ON,
        "publisher": "Ministerstwo Finansów & NIW-CRSO (Poland) via dane.gov.pl",
        "catalogue": "https://dane.gov.pl/pl/dataset/171",
        "license": LICENSE_URL,
        "licenseName": "CC0 1.0 Universal (Public Domain Dedication)",
        "sources": sources_meta,
        "counts": {
            "distinctFundedRecipients": len(funded_rows),
            "fundedAllFourYears": sum(1 for r in funded_rows if all(r[5 + i] > 0 for i in range(4))),
            "total4yrGrosze": sum(mf_amt_totals.values()),
            "total2025Grosze": mf_amt_totals[2025],
            "funded2025Orgs": len(mf_amt[2025]),
            "eligible2025Orgs": len(niw_data[2025]),
            "eligible2025PaidZero": len(set(niw_data[2025]) - set(mf_amt[2025])),
            "paid2025NotInFinalNiw": len(set(mf_amt[2025]) - set(niw_data[2025])),
            "unmappedVoivodeship2025Grosze": voiv_2025_grosze.get("UN", 0),
            "unmappedVoivodeship2025Orgs": voiv_2025_funded.get("UN", 0),
        },
        "byYear": by_year,
        "topRecipients2025": top15_2025,
        "voivodeships": voiv_meta,
        "fields": [
            "krs", "name", "voivCode", "eligMask", "total4yrGrosze",
            "g2022", "g2023", "g2024", "g2025",
            "t2022TenthsK", "t2023TenthsK", "t2024TenthsK", "t2025TenthsK",
        ],
        "asset": flow_asset,
    }
    write_json_file(flow_dir / "manifest.json", flow_manifest)

    print(
        f"Poland built: {len(org_rows)} registry KRS ({reg_asset['bytes']:,} B gz), "
        f"{len(funded_rows)} funded 1.5% PIT recipients ({flow_asset['bytes']:,} B gz), "
        f"4-yr total PLN {sum(mf_amt_totals.values()) / 100:,.2f} "
        f"(2025: PLN {mf_amt_totals[2025] / 100:,.2f}, top10={by_year[-1]['top10SharePct']}%, "
        f"top100={by_year[-1]['top100SharePct']}%)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Charitology Poland Global Charity Index edition")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--out-root", type=Path, required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    build(args.source_dir, args.out_root, repo_root)


if __name__ == "__main__":
    main()
