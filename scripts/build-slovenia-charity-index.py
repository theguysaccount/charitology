#!/usr/bin/env python3
"""Deterministic builder for the Slovenia FURS 1% income-tax assignment charity index & funding flow.

Reads the captured official Financial Administration of the Republic of Slovenia (FURS)
7-year preliminary payout workbooks (`slovenia-furs-2019.xlsx` through `slovenia-furs-2025.xlsx`)
using pure Python stdlib (zipfile + xml.etree.ElementTree) and writes byte-reproducible artifacts
under:
  - public/data/charity-registry/slovenia/
  - public/data/funding-flows/slovenia-dohodnina-1-percent/
  - src/data/slovenia-index-sources.tsv
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

SOURCES_META = {
    2019: (
        "slovenia-furs-2019.xlsx",
        "https://podatki.gov.si/dataset/3ea7706b-4385-4460-aba6-a2ab7ff0922d/resource/30ab5c38-23f4-4ee1-8e44-476dfb5187cc/download/seznamprejemnikovzaleto2019preliminarnipodatki.xlsx",
        "0.5%",
    ),
    2020: (
        "slovenia-furs-2020.xlsx",
        "https://podatki.gov.si/dataset/3ea7706b-4385-4460-aba6-a2ab7ff0922d/resource/bf608a76-3bd2-4052-b737-69c78bfcd817/download/seznamprejemnikovzaleto2020preliminarnipodatki.xlsx",
        "1.0%",
    ),
    2021: (
        "slovenia-furs-2021.xlsx",
        "https://podatki.gov.si/dataset/3ea7706b-4385-4460-aba6-a2ab7ff0922d/resource/feee92de-c334-4c21-859e-3ca555535e36/download/seznamprejemnikovzaleto2021preliminarnipodatki.xlsx",
        "1.0%",
    ),
    2022: (
        "slovenia-furs-2022.xlsx",
        "https://podatki.gov.si/dataset/3ea7706b-4385-4460-aba6-a2ab7ff0922d/resource/a04cbd0d-1b7f-4507-b57f-a691dd060f06/download/seznamprejemnikovzaleto2022preliminarnipodatki.xlsx",
        "1.0%",
    ),
    2023: (
        "slovenia-furs-2023.xlsx",
        "https://podatki.gov.si/dataset/3ea7706b-4385-4460-aba6-a2ab7ff0922d/resource/0a0d030a-efe6-4461-9d7d-a16e61c010da/download/seznamprejemnikovzaleto2023preliminarnipodatki.xlsx",
        "1.0%",
    ),
    2024: (
        "slovenia-furs-2024.xlsx",
        "https://www.fu.gov.si/fileadmin/Internet/Davki_in_druge_dajatve/Podrocja/Dohodnina/Letna_odmera_dohodnine/Opis/Seznam_prejemnikov_za_leto_2024-preliminarni_podatki.xlsx",
        "1.0%",
    ),
    2025: (
        "slovenia-furs-2025.xlsx",
        "https://www.fu.gov.si/fileadmin/Internet/Davki_in_druge_dajatve/Podrocja/Dohodnina/Letna_odmera_dohodnine/Opis/Seznam_prejemnikov_za_leto_2025-preliminarni_podatki.xlsx",
        "1.0%",
    ),
}


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
    s = name.lower().replace("đ", "dj")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def slovenia_tin_valid(s: str) -> bool:
    if not re.fullmatch(r"\d{8}", s):
        return False
    weights = [8, 7, 6, 5, 4, 3, 2]
    rem = sum(int(d) * w for d, w in zip(s[:7], weights)) % 11
    chk = 11 - rem
    if chk == 10:
        chk = 0
    if chk == 11:
        return False
    return int(s[7]) == chk


def csv_safe_cell(val: object) -> str:
    if val is None:
        return ""
    s = str(val)
    if s and s.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        return "'" + s
    return s


def read_xlsx(raw_bytes: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
        names = zf.namelist()
        ss: list[str] = []
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall(f"{ns}si"):
                ss.append("".join(t.text or "" for t in si.iter(f"{ns}t")))
        sheet = sorted(n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))[0]
        root = ET.fromstring(zf.read(sheet))
        rows: list[list[str]] = []
        for row in root.iter(f"{ns}row"):
            cells: dict[str, str] = {}
            for c in row.findall(f"{ns}c"):
                ref = c.attrib.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                t = c.attrib.get("t")
                v = c.find(f"{ns}v")
                if v is not None and v.text is not None:
                    val = ss[int(v.text)] if t == "s" else v.text
                else:
                    is_el = c.find(f"{ns}is")
                    val = "".join(x.text or "" for x in is_el.iter(f"{ns}t")) if is_el is not None else ""
                cells[col] = val
            rows.append([cells.get(k, "") for k in ("A", "B", "C", "D")])
        return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Slovenia FURS 1% charity index & funding flow.")
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument(
        "--registry-dir",
        default=pathlib.Path("public/data/charity-registry/slovenia"),
        type=pathlib.Path,
    )
    parser.add_argument(
        "--flow-dir",
        default=pathlib.Path("public/data/funding-flows/slovenia-dohodnina-1-percent"),
        type=pathlib.Path,
    )
    parser.add_argument("--captured-on", default="2026-11-25")
    args = parser.parse_args()

    annual_series: list[dict] = []
    source_captures: list[dict] = []
    # TIN-keyed records across 2023–2025
    by_tin: dict[str, dict] = {}
    shared_tin_rows: list[dict] = []
    name_changes: list[dict] = []

    for yr in range(2019, 2026):
        fname, url, rate_cap = SOURCES_META[yr]
        raw = (args.input_dir / fname).read_bytes()
        sha = sha256_bytes(raw)
        rows = read_xlsx(raw)
        hdr = [h.strip() for h in rows[0]]
        data = [r for r in rows[1:] if any(x.strip() for x in r)]
        has_tin = hdr[0] == "DS_UPR"

        disclosed_rows = 0
        redacted_rows = 0
        donors_sum = 0
        cents_sum = 0
        year_tin_rows: dict[str, list[dict]] = defaultdict(list)

        for r in data:
            if has_tin:
                tin = r[0].strip().zfill(8)
                assert slovenia_tin_valid(tin), f"Invalid Slovenian TIN {tin} in {yr}"
                name = re.sub(r"\s+", " ", r[1].strip())
                cnt_s, amt_s = r[2].strip(), r[3].strip()
            else:
                tin = None
                name = re.sub(r"\s+", " ", r[0].strip())
                cnt_s, amt_s = r[1].strip(), r[2].strip()

            assert name, f"Empty recipient name in {yr}"
            is_redacted = "manj kot" in cnt_s.lower() or amt_s == ""
            if is_redacted:
                redacted_rows += 1
                donors = None
                cents = None
            else:
                disclosed_rows += 1
                donors = int(round(float(cnt_s)))
                cents = int(round(float(amt_s) * 100))
                donors_sum += donors
                cents_sum += cents

            if has_tin and tin is not None:
                year_tin_rows[tin].append({
                    "year": yr,
                    "tin": tin,
                    "name": name,
                    "donors": donors,
                    "cents": cents,
                    "redacted": is_redacted,
                })

        if has_tin:
            for tin, entries in sorted(year_tin_rows.items()):
                if len(entries) > 1:
                    shared_tin_rows.append({
                        "year": yr,
                        "tin": tin,
                        "entries": [
                            {
                                "name": e["name"],
                                "donors": e["donors"],
                                "amountEur": None if e["cents"] is None else round(e["cents"] / 100, 2),
                                "privacyRedacted": e["redacted"],
                            }
                            for e in entries
                        ],
                    })
                rec = by_tin.setdefault(
                    tin,
                    {
                        "tin": tin,
                        "name": entries[0]["name"],
                        "altNames": [],
                        "years": {},
                        "sharedTinSubEntities": {},
                    },
                )
                # Prefer most recent non-abbreviated/latest year primary name, keep prior variants in altNames
                latest_primary = entries[0]["name"]
                if latest_primary != rec["name"]:
                    if rec["name"] not in rec["altNames"]:
                        rec["altNames"].append(rec["name"])
                    rec["name"] = latest_primary
                for e in entries[1:]:
                    if e["name"] != rec["name"] and e["name"] not in rec["altNames"]:
                        rec["altNames"].append(e["name"])

                all_redacted = all(e["redacted"] for e in entries)
                any_redacted = any(e["redacted"] for e in entries)
                if all_redacted:
                    rec["years"][str(yr)] = {"donors": None, "eur": None, "redacted": True}
                else:
                    tot_d = sum(e["donors"] or 0 for e in entries)
                    tot_c = sum(e["cents"] or 0 for e in entries)
                    rec["years"][str(yr)] = {
                        "donors": tot_d,
                        "eur": round(tot_c / 100, 2),
                        "redacted": any_redacted,
                    }
                if len(entries) > 1:
                    rec["sharedTinSubEntities"][str(yr)] = [
                        {
                            "name": e["name"],
                            "donors": e["donors"],
                            "eur": None if e["cents"] is None else round(e["cents"] / 100, 2),
                        }
                        for e in entries
                    ]

        # Concentration stats for this year (using raw rows sorted desc)
        disclosed_amts = sorted(
            [
                int(round(float((r[3] if has_tin else r[2]).strip()) * 100))
                for r in data
                if not ("manj kot" in (r[2] if has_tin else r[1]).strip().lower() or (r[3] if has_tin else r[2]).strip() == "")
            ],
            reverse=True,
        )
        top1_pct = round(disclosed_amts[0] / cents_sum * 100, 2) if cents_sum else 0.0
        top10_pct = round(sum(disclosed_amts[:10]) / cents_sum * 100, 2) if cents_sum else 0.0
        top50_pct = round(sum(disclosed_amts[:50]) / cents_sum * 100, 2) if cents_sum else 0.0

        annual_series.append({
            "year": yr,
            "statutoryCap": rate_cap,
            "includesTaxNumbers": has_tin,
            "totalRows": len(data),
            "uniqueTaxNumbers": len(year_tin_rows) if has_tin else None,
            "disclosedRows": disclosed_rows,
            "privacyRedactedRows": redacted_rows,
            "disclosedTaxpayerChoices": donors_sum,
            "disclosedTotalEur": round(cents_sum / 100, 2),
            "disclosedTotalCents": cents_sum,
            "avgEurPerChoice": round((cents_sum / 100) / donors_sum, 2) if donors_sum else 0.0,
            "top1SharePct": top1_pct,
            "top10SharePct": top10_pct,
            "top50SharePct": top50_pct,
        })
        source_captures.append({
            "year": yr,
            "filename": fname,
            "url": url,
            "bytes": len(raw),
            "sha256": sha,
            "rows": len(data),
            "includesTaxNumbers": has_tin,
        })

    organizations: list[dict] = []
    for tin, rec in by_tin.items():
        y25 = rec["years"].get("2025")
        y24 = rec["years"].get("2024")
        y23 = rec["years"].get("2023")
        total_3yr_cents = sum(
            int(round((rec["years"][y]["eur"] or 0.0) * 100))
            for y in ("2023", "2024", "2025")
            if y in rec["years"] and rec["years"][y]["eur"] is not None
        )
        total_3yr_donors = sum(
            rec["years"][y]["donors"] or 0
            for y in ("2023", "2024", "2025")
            if y in rec["years"] and rec["years"][y]["donors"] is not None
        )
        alt_clean = [a for a in rec["altNames"] if a != rec["name"]]
        if alt_clean:
            name_changes.append({"tin": tin, "latestName": rec["name"], "priorNames": alt_clean})

        in_2025 = y25 is not None
        redacted_2025 = bool(y25 and y25["redacted"] and y25["eur"] is None)

        organizations.append({
            "tin": tin,
            "name": rec["name"],
            "altNames": alt_clean,
            "norm": normalize_name(" ".join([rec["name"], *alt_clean])),
            "in2025": in_2025,
            "redacted2025": redacted_2025,
            "donors2025": y25["donors"] if y25 else None,
            "eur2025": y25["eur"] if y25 else None,
            "donors2024": y24["donors"] if y24 else None,
            "eur2024": y24["eur"] if y24 else None,
            "donors2023": y23["donors"] if y23 else None,
            "eur2023": y23["eur"] if y23 else None,
            "yearsPresent": sorted(int(k) for k in rec["years"].keys()),
            "total3yrEur": round(total_3yr_cents / 100, 2) if total_3yr_cents > 0 else None,
            "total3yrDonors": total_3yr_donors if total_3yr_donors > 0 else None,
            "sharedTin": bool(rec["sharedTinSubEntities"]),
        })

    organizations.sort(
        key=lambda o: (
            -(o["eur2025"] if o["eur2025"] is not None else -1.0),
            -(o["total3yrEur"] if o["total3yrEur"] is not None else -1.0),
            o["tin"],
        )
    )

    in_all_3 = sum(1 for o in organizations if len(o["yearsPresent"]) == 3)
    in_2025_only = sum(1 for o in organizations if o["yearsPresent"] == [2025])
    exited_before_2025 = sum(1 for o in organizations if not o["in2025"])
    seven_yr_cents = sum(a["disclosedTotalCents"] for a in annual_series)
    seven_yr_choices = sum(a["disclosedTaxpayerChoices"] for a in annual_series)
    three_yr_cents = sum(a["disclosedTotalCents"] for a in annual_series if a["year"] >= 2023)
    three_yr_choices = sum(a["disclosedTaxpayerChoices"] for a in annual_series if a["year"] >= 2023)

    reg_dir = args.registry_dir
    flow_dir = args.flow_dir
    reg_dir.mkdir(parents=True, exist_ok=True)
    flow_dir.mkdir(parents=True, exist_ok=True)

    # 1. organizations.json.gz
    orgs_payload = json.dumps(organizations, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    orgs_art = write_deterministic_gzip(reg_dir / "organizations.json.gz", orgs_payload)
    orgs_art["rows"] = len(organizations)

    # 2. slovenia-furs-charities.csv (UTF-8 BOM + formula safe)
    csv_buf = io.StringIO()
    w = csv.writer(csv_buf, lineterminator="\r\n")
    w.writerow([
        "tin_ds_upr",
        "recipient_name",
        "prior_or_sub_names",
        "years_present_2023_2025",
        "in_2025",
        "privacy_redacted_2025",
        "donors_2025",
        "eur_2025",
        "donors_2024",
        "eur_2024",
        "donors_2023",
        "eur_2023",
        "total_3yr_donors",
        "total_3yr_eur",
    ])
    for o in organizations:
        w.writerow([
            o["tin"],
            csv_safe_cell(o["name"]),
            csv_safe_cell("; ".join(o["altNames"])),
            ",".join(str(y) for y in o["yearsPresent"]),
            "true" if o["in2025"] else "false",
            "true" if o["redacted2025"] else "false",
            "" if o["donors2025"] is None else o["donors2025"],
            "" if o["eur2025"] is None else f"{o['eur2025']:.2f}",
            "" if o["donors2024"] is None else o["donors2024"],
            "" if o["eur2024"] is None else f"{o['eur2024']:.2f}",
            "" if o["donors2023"] is None else o["donors2023"],
            "" if o["eur2023"] is None else f"{o['eur2023']:.2f}",
            "" if o["total3yrDonors"] is None else o["total3yrDonors"],
            "" if o["total3yrEur"] is None else f"{o['total3yrEur']:.2f}",
        ])
    csv_bytes = ("\ufeff" + csv_buf.getvalue()).encode("utf-8")
    csv_path = reg_dir / "slovenia-furs-charities.csv"
    csv_path.write_bytes(csv_bytes)
    csv_art = {
        "path": csv_path.name,
        "bytes": len(csv_bytes),
        "sha256": sha256_bytes(csv_bytes),
        "rows": len(organizations),
    }

    # 3. anomalies.json
    anomalies = {
        "format": "charitology-slovenia-anomalies-v1",
        "capturedOn": args.captured_on,
        "summary": {
            "distinctTins2023To2025": len(organizations),
            "modulo11ValidTinRate": "100%",
            "privacyRedacted2025Rows": annual_series[-1]["privacyRedactedRows"],
            "sharedTinInstances2023To2025": len(shared_tin_rows),
            "nameVariantsAcross2023To2025": len(name_changes),
            "historicalYearsWithoutTinColumn": [2019, 2020, 2021, 2022],
        },
        "notes": [
            "FURS suppresses exact donor counts and EUR amounts ('manj kot 5' / blank EUR) for recipients chosen by fewer than 5 taxpayers in a given year to protect taxpayer confidentiality. Those values remain null (never 0).",
            "In 2023, 2024, and 2025, Slovenian TIN 42192790 appears twice each year because Škofijska gimnazija Vipava (ŠGV) and its statutory school fund (SKLAD - ŠKOFIJSKA GIMNAZIJA VIPAVA) share one tax number. Their totals are combined on TIN 42192790 with both sub-entities preserved verbatim below.",
            "FURS workbooks for 2019–2022 omit the DS_UPR tax-number column and therefore feed the 7-year funding-flow aggregate series rather than entity-level TIN joins.",
            "Preliminary FURS payout tables reflect September annual-assessment settlements; late assessments or appeals are not retroactively folded into preliminary releases.",
        ],
        "sharedTinRows": shared_tin_rows,
        "nameChangesSample": name_changes[:25],
    }
    anom_bytes = (json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    anom_path = reg_dir / "anomalies.json"
    anom_path.write_bytes(anom_bytes)
    anom_art = {
        "path": anom_path.name,
        "bytes": len(anom_bytes),
        "sha256": sha256_bytes(anom_bytes),
    }

    # 4. Registry manifest.json
    top_20_2025 = [
        {
            "tin": o["tin"],
            "name": o["name"],
            "donors2025": o["donors2025"],
            "eur2025": o["eur2025"],
            "donors2024": o["donors2024"],
            "eur2024": o["eur2024"],
            "eur2023": o["eur2023"],
        }
        for o in organizations[:20]
    ]
    reg_manifest = {
        "format": "charitology-slovenia-registry-v1",
        "jurisdiction": "Slovenia",
        "asOf": "2025",
        "capturedOn": args.captured_on,
        "currency": "EUR",
        "publisher": "Financial Administration of the Republic of Slovenia (FURS)",
        "catalogues": {
            "fursDohodninaPortal": "https://www.gov.si/teme/namenitev-dela-dohodnine-za-donacije/",
            "opsiDataset": "https://podatki.gov.si/dataset/prejemniki-namenitve-dela-dohodnine-za-donacije",
            "furs2025Xlsx": SOURCES_META[2025][1],
            "furs2024Xlsx": SOURCES_META[2024][1],
            "ajpesPublicInterestPortal": "https://www.ajpes.si/Registri/Drugi_registri/Evidenca_nevladnih_organizacij/Splosno",
        },
        "sourceCaptures": source_captures,
        "counts": {
            "includedOrganizations": len(organizations),
            "uniqueTaxNumbers2023To2025": len(organizations),
            "modulo11ValidTins": len(organizations),
            "recipientsIn2025": annual_series[-1]["uniqueTaxNumbers"],
            "disclosedIn2025": annual_series[-1]["disclosedRows"],
            "privacyRedactedIn2025": annual_series[-1]["privacyRedactedRows"],
            "presentInAllThreeTinYears": in_all_3,
            "newIn2025Only": in_2025_only,
            "present2023Or2024Only": exited_before_2025,
            "sevenYearDisclosedChoices": seven_yr_choices,
            "sevenYearDisclosedEur": round(seven_yr_cents / 100, 2),
            "threeYearTinDisclosedChoices": three_yr_choices,
            "threeYearTinDisclosedEur": round(three_yr_cents / 100, 2),
        },
        "annualSeries": annual_series,
        "top20In2025": top_20_2025,
        "artifacts": {
            "organizations": orgs_art,
            "csv": csv_art,
            "anomalies": anom_art,
        },
    }
    (reg_dir / "manifest.json").write_bytes((json.dumps(reg_manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    # 5. Funding-flow artifacts
    annual_csv_buf = io.StringIO()
    aw = csv.writer(annual_csv_buf, lineterminator="\r\n")
    aw.writerow([
        "year",
        "statutory_cap",
        "includes_tax_numbers",
        "total_rows",
        "unique_tax_numbers",
        "disclosed_rows",
        "privacy_redacted_rows",
        "disclosed_taxpayer_choices",
        "disclosed_total_eur",
        "avg_eur_per_choice",
        "top1_share_pct",
        "top10_share_pct",
        "top50_share_pct",
    ])
    for a in annual_series:
        aw.writerow([
            a["year"],
            a["statutoryCap"],
            "true" if a["includesTaxNumbers"] else "false",
            a["totalRows"],
            "" if a["uniqueTaxNumbers"] is None else a["uniqueTaxNumbers"],
            a["disclosedRows"],
            a["privacyRedactedRows"],
            a["disclosedTaxpayerChoices"],
            f"{a['disclosedTotalEur']:.2f}",
            f"{a['avgEurPerChoice']:.2f}",
            f"{a['top1SharePct']:.2f}",
            f"{a['top10SharePct']:.2f}",
            f"{a['top50SharePct']:.2f}",
        ])
    annual_csv_bytes = ("\ufeff" + annual_csv_buf.getvalue()).encode("utf-8")
    annual_csv_path = flow_dir / "annual-totals.csv"
    annual_csv_path.write_bytes(annual_csv_bytes)

    top_250 = organizations[:250]
    top250_payload = json.dumps(top_250, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    top250_art = write_deterministic_gzip(flow_dir / "top-250.json.gz", top250_payload)
    top250_art["rows"] = len(top_250)

    flow_manifest = {
        "format": "charitology-slovenia-dohodnina-flow-v1",
        "jurisdiction": "Slovenia",
        "capturedOn": args.captured_on,
        "years": [2019, 2020, 2021, 2022, 2023, 2024, 2025],
        "currency": "EUR",
        "publisher": "Financial Administration of the Republic of Slovenia (FURS)",
        "sevenYearTotals": {
            "disclosedTaxpayerChoices": seven_yr_choices,
            "disclosedTotalEur": round(seven_yr_cents / 100, 2),
            "disclosedTotalCents": seven_yr_cents,
            "rateDoublingJumpPct2019To2020": round(
                (annual_series[1]["disclosedTotalCents"] - annual_series[0]["disclosedTotalCents"])
                / annual_series[0]["disclosedTotalCents"]
                * 100,
                2,
            ),
        },
        "annualSeries": annual_series,
        "artifacts": {
            "annualCsv": {
                "path": annual_csv_path.name,
                "bytes": len(annual_csv_bytes),
                "sha256": sha256_bytes(annual_csv_bytes),
                "rows": len(annual_series),
            },
            "top250": top250_art,
        },
    }
    (flow_dir / "manifest.json").write_bytes((json.dumps(flow_manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    # 6. src/data/slovenia-index-sources.tsv
    tsv_lines = ["filename\turl\tbytes\tsha256\tcaptured_on\tlicense\tnote"]
    for sc in source_captures:
        tsv_lines.append(
            f"{sc['filename']}\t{sc['url']}\t{sc['bytes']}\t{sc['sha256']}\t{args.captured_on}\t"
            f"Slovenian Open Government Data (OPSI / FURS — Finančna uprava Republike Slovenije)\t"
            f"Preliminary {sc['year']} income-tax assignment payout list ({sc['rows']} rows; TIN column={'yes' if sc['includesTaxNumbers'] else 'no'})"
        )
    pathlib.Path("src/data/slovenia-index-sources.tsv").write_text("\n".join(tsv_lines) + "\n", encoding="utf-8")

    print(
        f"Built Slovenia FURS 1% index & flow: {len(organizations):,} unique mod-11 TINs (2023–2025), "
        f"7-yr total EUR {seven_yr_cents/100:,.2f} across {seven_yr_choices:,} choices, "
        f"2025 EUR {annual_series[-1]['disclosedTotalEur']:,.2f} ({annual_series[-1]['disclosedTaxpayerChoices']:,} choices), "
        f"orgs.json.gz={orgs_art['bytes']:,} B."
    )


if __name__ == "__main__":
    main()
