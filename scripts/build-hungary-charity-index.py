#!/usr/bin/env python3
"""Deterministic builder for Hungary's NAV 1%+1% SZJA civil-organization registry
(2024-2026) and paired 1%+1% income-tax allocation funding flows explorer.

Reads the 4 official NAV XLSX captures from an input directory outside Git and
emits byte-reproducible sharded gzip JSON, manifests and CSVs under:
  - public/data/charity-registry/hungary/
  - public/data/funding-flows/hungary-szja-1-percent/

Privacy boundary: street-level addresses (utca, házszám, emelet, ajtó) are
stripped at build time; only the 4-digit postal code and municipality name are retained.
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
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict


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
    s = unicodedata.normalize("NFKD", name.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def read_xlsx_rows(path: pathlib.Path) -> list[list[str]]:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as zf:
        ss: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", ns):
                ss.append("".join(t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        out: list[list[str]] = []
        for row in root.findall(".//m:sheetData/m:row", ns):
            vals: list[str] = []
            for c in row.findall("m:c", ns):
                t = c.attrib.get("t")
                v = c.find("m:v", ns)
                if v is None:
                    is_el = c.find("m:is", ns)
                    vals.append(
                        "".join(x.text or "" for x in is_el.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
                        if is_el is not None
                        else ""
                    )
                elif t == "s":
                    vals.append(ss[int(v.text or "0")])
                else:
                    vals.append(v.text or "")
            out.append(vals)
        return out


def extract_municipality(raw_addr: str) -> str:
    """Strip all street/building detail and keep only municipality name (plus Budapest district prefix when present)."""
    s = re.sub(r"\s+", " ", raw_addr).strip()
    if not s:
        return ""
    m = re.match(r"^(\d{4})\s+(.+)$", s)
    if not m:
        return ""
    zcode, rest = m.group(1), m.group(2)
    if zcode.startswith("1") and rest.upper().startswith("BUDAPEST"):
        return "Budapest"
    # Take the first token (town name) before street address tokens
    # Handle known multi-word Hungarian town names cleanly if second word is not a street marker
    toks = rest.split()
    if not toks:
        return ""
    city = toks[0].rstrip(",.")
    return city.capitalize() if city.isupper() else city


def classify_name_hint(name: str) -> str:
    n = normalize_name(name)
    if "alapitvany" in n:
        return "foundation_named"
    if "egyesulet" in n or "egylet" in n or "szovetseg" in n or "sportkor" in n or "sportclub" in n:
        return "association_named"
    if "korhaz" in n or "mento" in n or "daganat" in n or "egeszseg" in n:
        return "health_named"
    if "iskola" in n or "ovoda" in n or "gimnazium" in n or "egyetem" in n or "diak" in n:
        return "education_named"
    if "allat" in n or "kutya" in n or "menhely" in n or "termeszet" in n:
        return "animal_env_named"
    return "other_civil"


def bucket_for(norm: str) -> str:
    first = norm[0] if norm else ""
    return first if "a" <= first <= "z" else "0-9"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument("--reg-out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--flow-out-dir", required=True, type=pathlib.Path)
    parser.add_argument("--captured-on", default="2026-11-23")
    args = parser.parse_args()

    in_dir = args.input_dir
    years = [2024, 2025, 2026]
    orgs: dict[str, dict] = {}
    yearly_stats: dict[str, dict] = {}

    for yr in years:
        fpath = in_dir / f"hu-civil-1pct-{yr}.xlsx"
        rows = read_xlsx_rows(fpath)[2:]
        seen_yr: set[str] = set()
        yr_huf = 0
        yr_donors = 0
        for r in rows:
            if len(r) < 8 or not r[1].strip():
                continue
            t8 = re.sub(r"\D+", "", r[1]).zfill(8)
            assert re.fullmatch(r"\d{8}", t8), f"Invalid 8-digit tax ID {t8} in {yr}"
            assert t8 not in seen_yr, f"Duplicate tax ID {t8} in {yr}"
            seen_yr.add(t8)

            vat_code = re.sub(r"\D+", "", r[2])[:1]
            county_code = re.sub(r"\D+", "", r[3]).zfill(2)[:2]
            full_tax = f"{t8}-{vat_code}-{county_code}"
            name = re.sub(r"\s+", " ", r[4]).strip()
            muni = extract_municipality(r[5])
            huf = int(round(float(r[6])))
            donors = int(round(float(r[7])))

            yr_huf += huf
            yr_donors += donors

            rec = orgs.get(t8)
            if rec is None:
                rec = {
                    "tax8": t8,
                    "taxFull": full_tax,
                    "name": name,
                    "norm": normalize_name(name),
                    "muni": muni,
                    "nameHint": classify_name_hint(name),
                    "yearly": {},
                }
                orgs[t8] = rec
            else:
                # Always keep the latest year's official name & municipality
                rec["taxFull"] = full_tax
                rec["name"] = name
                rec["norm"] = normalize_name(name)
                rec["nameHint"] = classify_name_hint(name)
                if muni:
                    rec["muni"] = muni
            rec["yearly"][str(yr)] = {"huf": huf, "donors": donors}

        yearly_stats[str(yr)] = {
            "year": yr,
            "distinctOrganizations": len(seen_yr),
            "totalHuf": yr_huf,
            "totalDonors": yr_donors,
            "avgHufPerDonor": round(yr_huf / yr_donors) if yr_donors else 0,
        }

    # Finalize organization summaries
    records: list[dict] = []
    hint_counts = Counter()
    hint_2026_huf = Counter()
    all_3y_count = 0
    active_2026_count = 0

    for t8, rec in orgs.items():
        yrs_present = sorted(int(y) for y in rec["yearly"].keys())
        tot_huf = sum(v["huf"] for v in rec["yearly"].values())
        tot_don = sum(v["donors"] for v in rec["yearly"].values())
        y26 = rec["yearly"].get("2026")
        y25 = rec["yearly"].get("2025")
        y24 = rec["yearly"].get("2024")
        if len(yrs_present) == 3:
            all_3y_count += 1
        if y26:
            active_2026_count += 1
            hint_2026_huf[rec["nameHint"]] += y26["huf"]
        hint_counts[rec["nameHint"]] += 1

        records.append(
            {
                "tax8": t8,
                "taxFull": rec["taxFull"],
                "name": rec["name"],
                "norm": rec["norm"],
                "muni": rec["muni"],
                "nameHint": rec["nameHint"],
                "yearsCount": len(yrs_present),
                "total3yHuf": tot_huf,
                "total3yDonors": tot_don,
                "y2026Huf": y26["huf"] if y26 else None,
                "y2026Donors": y26["donors"] if y26 else None,
                "y2025Huf": y25["huf"] if y25 else None,
                "y2025Donors": y25["donors"] if y25 else None,
                "y2024Huf": y24["huf"] if y24 else None,
                "y2024Donors": y24["donors"] if y24 else None,
            }
        )

    records.sort(key=lambda r: (r["norm"], r["tax8"]))

    # Parse 2026 Technical-Number 1% recipients (churches + National Talent Program)
    tech_raw = read_xlsx_rows(in_dir / "hu-tech-1pct-2026.xlsx")[2:]
    tech_rows: list[dict] = []
    cur_section = "priority_budget"
    for r in tech_raw:
        if r and "VALLÁSI KÖZÖSSÉGEK" in r[0].upper():
            cur_section = "religious_community"
            continue
        if len(r) < 6:
            continue
        code = re.sub(r"\D+", "", r[1]).zfill(4)
        if not re.fullmatch(r"\d{4}", code) or not re.fullmatch(r"\d+", r[4].strip()):
            continue
        huf = int(r[4].strip())
        donors = int(r[5].strip())
        tech_rows.append(
            {
                "techCode": code,
                "category": cur_section,
                "name": re.sub(r"\s+", " ", r[2]).strip(),
                "muni": extract_municipality(r[3]),
                "huf2026": huf,
                "donors2026": donors,
                "avgHufPerDonor": round(huf / donors) if donors else 0,
            }
        )
    tech_rows.sort(key=lambda r: (-r["huf2026"], r["techCode"]))
    tech_total_huf = sum(r["huf2026"] for r in tech_rows)
    tech_total_donors = sum(r["donors2026"] for r in tech_rows)

    # Write sharded registry files (names/ and ids/)
    reg_out = args.reg_out_dir
    (reg_out / "names").mkdir(parents=True, exist_ok=True)
    (reg_out / "ids").mkdir(parents=True, exist_ok=True)

    by_name: dict[str, list[dict]] = defaultdict(list)
    by_id: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_name[bucket_for(r["norm"])].append(r)
        by_id[r["tax8"][:2]].append(r)

    name_shards: dict[str, dict] = {}
    for bkt in sorted(by_name.keys()):
        brows = by_name[bkt]
        payload = json.dumps(brows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        meta = write_deterministic_gzip(reg_out / "names" / f"{bkt}.json.gz", payload)
        meta["path"] = f"names/{bkt}.json.gz"
        meta["rows"] = len(brows)
        name_shards[bkt] = meta

    id_shards: dict[str, dict] = {}
    for pfx in sorted(by_id.keys()):
        brows = sorted(by_id[pfx], key=lambda x: x["tax8"])
        payload = json.dumps(brows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        meta = write_deterministic_gzip(reg_out / "ids" / f"{pfx}.json.gz", payload)
        meta["path"] = f"ids/{pfx}.json.gz"
        meta["rows"] = len(brows)
        id_shards[pfx] = meta

    total_3y_huf = sum(v["totalHuf"] for v in yearly_stats.values())
    total_3y_donors = sum(v["totalDonors"] for v in yearly_stats.values())

    top_civil_2026 = sorted(
        [r for r in records if r["y2026Huf"] is not None],
        key=lambda r: (-(r["y2026Huf"] or 0), r["tax8"]),
    )
    top10_2026_huf = sum(r["y2026Huf"] or 0 for r in top_civil_2026[:10])
    top50_2026_huf = sum(r["y2026Huf"] or 0 for r in top_civil_2026[:50])
    y26_civil_huf = yearly_stats["2026"]["totalHuf"]

    reg_manifest = {
        "format": "charitology-hungary-registry-v1",
        "jurisdiction": "Hungary",
        "publisher": "Nemzeti Adó- és Vámhivatal (NAV — National Tax and Customs Administration of Hungary)",
        "asOf": "2026-09-15",
        "yearsCovered": years,
        "capturedOn": args.captured_on,
        "catalogues": {
            "navSzjaPortal": "https://nav.gov.hu/ado/szja1_1",
            "navCivil2026": "https://nav.gov.hu/ado/szja1_1/kimutatasok_elszamolasok/civil-szervezetek/egyszaz_kiut_2026/kozlemeny-a-2026.-evben-szja-1-os-felajanlasban-reszesult-civil-kedvezmenyezettekrol",
            "navTech2026": "https://nav.gov.hu/ado/szja1_1/kimutatasok_elszamolasok/technikai-szammal-rendelkezok/-felajanlasban-reszesultek-2026/Kozlemeny_a_2026._evben_szja_1_-os_felajanlasban_reszesult_technikai_szamos_kedvezmenyezettekrol",
        },
        "counts": {
            "includedOrganizations": len(records),
            "active2026Organizations": active_2026_count,
            "presentAll3Years": all_3y_count,
            "total3YearCivilHuf": total_3y_huf,
            "total3YearCivilDonors": total_3y_donors,
            "total2026CivilHuf": y26_civil_huf,
            "total2026CivilDonors": yearly_stats["2026"]["totalDonors"],
            "technicalNumber2026Count": len(tech_rows),
            "technicalNumber2026Huf": tech_total_huf,
            "technicalNumber2026Donors": tech_total_donors,
            "byNameHint": dict(sorted(hint_counts.items())),
            "byNameHint2026Huf": dict(sorted(hint_2026_huf.items())),
        },
        "yearly": yearly_stats,
        "shards": {
            "names": name_shards,
            "ids": id_shards,
        },
    }
    (reg_out / "manifest.json").write_text(
        json.dumps(reg_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Emit paired funding-flows artifacts
    flow_out = args.flow_out_dir
    flow_out.mkdir(parents=True, exist_ok=True)

    explorer_payload = json.dumps(
        {
            "topCivil250": top_civil_2026[:250],
            "technicalNumbers2026": tech_rows,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    explorer_gz = write_deterministic_gzip(flow_out / "recipients-2024-2026.json.gz", explorer_payload)

    # Yearly CSV
    ycsv = io.StringIO()
    yw = csv.writer(ycsv, lineterminator="\n")
    yw.writerow(["year", "civil_recipients", "civil_huf", "civil_donors", "avg_huf_per_donor"])
    for yr in years:
        s = yearly_stats[str(yr)]
        yw.writerow([yr, s["distinctOrganizations"], s["totalHuf"], s["totalDonors"], s["avgHufPerDonor"]])
    ycsv_bytes = ycsv.getvalue().encode("utf-8")
    (flow_out / "yearly-summary.csv").write_bytes(ycsv_bytes)

    # Tech CSV
    tcsv = io.StringIO()
    tw = csv.writer(tcsv, lineterminator="\n")
    tw.writerow(["tech_code", "category", "name", "municipality", "huf_2026", "donors_2026", "avg_huf_per_donor"])
    for tr in tech_rows:
        tw.writerow([tr["techCode"], tr["category"], tr["name"], tr["muni"], tr["huf2026"], tr["donors2026"], tr["avgHufPerDonor"]])
    tcsv_bytes = tcsv.getvalue().encode("utf-8")
    (flow_out / "technical-numbers-2026.csv").write_bytes(tcsv_bytes)

    flow_manifest = {
        "format": "charitology-hungary-szja-1-percent-v1",
        "jurisdiction": "Hungary",
        "publisher": reg_manifest["publisher"],
        "asOf": "2026-09-15",
        "capturedOn": args.captured_on,
        "catalogue": reg_manifest["catalogues"]["navSzjaPortal"],
        "counts": {
            "yearsCovered": years,
            "distinctCivilOrganizations3y": len(records),
            "active2026CivilOrganizations": active_2026_count,
            "total3YearCivilHuf": total_3y_huf,
            "total3YearCivilDonors": total_3y_donors,
            "total2026CivilHuf": y26_civil_huf,
            "total2026CivilDonors": yearly_stats["2026"]["totalDonors"],
            "top10Share2026Pct": round((top10_2026_huf / y26_civil_huf) * 100.0, 2),
            "top50Share2026Pct": round((top50_2026_huf / y26_civil_huf) * 100.0, 2),
            "technicalNumber2026Count": len(tech_rows),
            "technicalNumber2026Huf": tech_total_huf,
            "technicalNumber2026Donors": tech_total_donors,
            "combined2026Huf": y26_civil_huf + tech_total_huf,
            "combined2026Designations": yearly_stats["2026"]["totalDonors"] + tech_total_donors,
            "topCivilExplorerRows": 250,
        },
        "yearly": yearly_stats,
        "top20Civil2026": top_civil_2026[:20],
        "top10Tech2026": tech_rows[:10],
        "artifacts": {
            "recipients": explorer_gz,
            "yearlyCsv": {
                "path": "yearly-summary.csv",
                "bytes": len(ycsv_bytes),
                "sha256": sha256_bytes(ycsv_bytes),
                "rows": len(years),
            },
            "techCsv": {
                "path": "technical-numbers-2026.csv",
                "bytes": len(tcsv_bytes),
                "sha256": sha256_bytes(tcsv_bytes),
                "rows": len(tech_rows),
            },
        },
    }
    (flow_out / "manifest.json").write_text(
        json.dumps(flow_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(
        f"Built Hungary index: {len(records):,} distinct civil orgs (2024-2026, {all_3y_count:,} all 3y; "
        f"2026 civil HUF {y26_civil_huf:,} / {yearly_stats['2026']['totalDonors']:,} donors) + "
        f"{len(tech_rows)} technical-number 2026 recipients (HUF {tech_total_huf:,})."
    )


if __name__ == "__main__":
    main()
