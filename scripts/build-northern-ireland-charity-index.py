#!/usr/bin/env python3
"""Deterministic builder for the Northern Ireland CCNI charity index.

Reads the captured official Charity Commission for Northern Ireland (CCNI)
Register of Charities CSV export (`ccni-register.csv`, captured 2026-11-25)
from an input directory outside Git and writes byte-reproducible JSON/gzip/CSV
artifacts under public/data/charity-registry/northern-ireland/.

Privacy projection: strips Public address, Email, and Telephone so small-charity
trustees' residential addresses and personal contact details are never republished.
Every row links directly to its official CCNI statutory profile by Reg charity number.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import pathlib
import re
import unicodedata
from collections import Counter

# Official 12 statutory charitable purposes under the Charities Act (Northern Ireland) 2008
# as emitted in CCNI's "What the charity does" column.
PURPOSE_CATALOG: list[dict[str, str]] = [
    {
        "code": "education",
        "label": "The advancement of education",
        "short": "Education",
    },
    {
        "code": "community",
        "label": "The advancement of citizenship or community development",
        "short": "Citizenship & community development",
    },
    {
        "code": "need",
        "label": "The relief of those in need by reason of youth, age, ill-health, disability, financial hardship or other disadvantage",
        "short": "Relief of those in need",
    },
    {
        "code": "religion",
        "label": "The advancement of religion",
        "short": "Religion",
    },
    {
        "code": "health",
        "label": "The advancement of health or the saving of lives",
        "short": "Health or saving of lives",
    },
    {
        "code": "arts",
        "label": "The advancement of the arts, culture, heritage or science",
        "short": "Arts, culture, heritage & science",
    },
    {
        "code": "poverty",
        "label": "The prevention or relief of poverty",
        "short": "Prevention or relief of poverty",
    },
    {
        "code": "other",
        "label": "Other charitable purposes (including recreational/ leisure facilities)",
        "short": "Other charitable purposes & recreation",
    },
    {
        "code": "human_rights",
        "label": "The advancement of human rights conflict resolution or reconciliation or the promotion of religious or racial harmony and equality or diversity",
        "short": "Human rights, reconciliation & equality",
    },
    {
        "code": "sport",
        "label": "The advancement of amateur sport",
        "short": "Amateur sport",
    },
    {
        "code": "environment",
        "label": "The advancement of environmental protection or improvement",
        "short": "Environmental protection",
    },
    {
        "code": "animals",
        "label": "The advancement of animal welfare",
        "short": "Animal welfare",
    },
]

# Handle slight comma variations in the human rights phrase if CCNI changes punctuation.
PURPOSE_ALIASES: list[tuple[str, str]] = [
    (
        "The advancement of human rights, conflict resolution or reconciliation or the promotion of religious or racial harmony or equality and diversity",
        "human_rights",
    ),
    (
        "The advancement of human rights, conflict resolution or reconciliation or the promotion of religious or racial harmony and equality or diversity",
        "human_rights",
    ),
]


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


def parse_uk_slash_date(value: str) -> str:
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", value.strip())
    assert m, f"Invalid DD/MM/YYYY date: {value!r}"
    dd, mm, yyyy = m.groups()
    dt.date(int(yyyy), int(mm), int(dd))
    return f"{yyyy}-{mm}-{dd}"


def parse_long_uk_date(value: str) -> str | None:
    s = value.strip()
    if not s:
        return None
    parsed = dt.datetime.strptime(s, "%d %B %Y").date()
    return parsed.isoformat()


def parse_int(value: str | None) -> int:
    s = (value or "").strip().replace(",", "")
    if not s:
        return 0
    return int(s)


def parse_status(raw: str) -> tuple[str, int | None, bool]:
    s = raw.strip()
    if s == "Removed":
        return "removed", None, False
    if s == "Registered":
        return "registered_no_return_due", None, True
    if s == "Received: on time":
        return "received_on_time", 0, True
    m_late = re.fullmatch(r"Received:\s*(\d+)\s*days?\s*late", s)
    if m_late:
        return "received_late", int(m_late.group(1)), True
    m_over = re.fullmatch(r"Overdue:\s*(\d+)\s*days?", s)
    if m_over:
        return "overdue", int(m_over.group(1)), True
    raise AssertionError(f"Unrecognized CCNI status value: {raw!r}")


def parse_purposes(raw: str) -> tuple[list[str], str]:
    rem = raw.strip()
    found: list[str] = []
    for p in PURPOSE_CATALOG:
        if p["label"] in rem:
            found.append(p["code"])
            rem = rem.replace(p["label"], "")
    for alias, code in PURPOSE_ALIASES:
        if alias in rem:
            if code not in found:
                found.append(code)
            rem = rem.replace(alias, "")
    leftover = re.sub(r"[,\s]+", " ", rem).strip()
    return found, leftover


def sanitize_website(raw: str) -> str | None:
    s = raw.strip()
    if not s or " " in s or "@" in s:
        return None
    low = s.lower()
    if low in ("n/a", "na", "none", "nil", "-", "tbc", "tba", "http://", "https://"):
        return None
    if low.startswith(("javascript:", "data:", "vbscript:", "mailto:")):
        return None
    if not low.startswith(("http://", "https://")):
        if "." not in s:
            return None
        s = "https://" + s
    if not re.match(r"^https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/.*)?$", s):
        return None
    return s


def csv_safe_cell(val: object) -> str:
    if val is None:
        return ""
    s = str(val)
    if s and s.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        return "'" + s
    return s


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Northern Ireland CCNI charity index artifacts.")
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument(
        "--output-dir",
        default=pathlib.Path("public/data/charity-registry/northern-ireland"),
        type=pathlib.Path,
    )
    parser.add_argument("--captured-on", default="2026-11-25")
    args = parser.parse_args()

    csv_path = args.input_dir / "ccni-register.csv"
    raw_bytes = csv_path.read_bytes()
    raw_sha256 = sha256_bytes(raw_bytes)
    text = raw_bytes.decode("utf-8-sig")

    reader = csv.DictReader(io.StringIO(text))
    fieldnames = reader.fieldnames or []
    rows_raw = list(reader)

    trailing_empty_col = fieldnames[-1] == "" if fieldnames else False
    trailing_non_empty = sum(1 for r in rows_raw if trailing_empty_col and (r.get("") or "").strip())
    assert trailing_non_empty == 0, f"Unexpected values in trailing column: {trailing_non_empty}"

    organizations: list[dict] = []
    seen_ids: set[str] = set()
    status_counts: Counter[str] = Counter()
    gov_doc_counts: Counter[str] = Counter()
    purpose_counts: Counter[str] = Counter()
    reg_year_counts: Counter[str] = Counter()
    fye_year_counts: Counter[str] = Counter()
    name_counts: Counter[str] = Counter()
    unrecognized_purposes: Counter[str] = Counter()

    negative_financial_rows: list[dict] = []
    unfiled_with_nonzero_financials: list[dict] = []
    suspicious_outliers: list[dict] = []
    website_dropped_count = 0
    company_num_nonzero = 0
    prev_income_nonzero = 0
    net_assets_pos = 0
    net_assets_neg = 0
    net_assets_zero = 0
    income_endowment_matches = 0
    income_endowment_total = 0

    for r in rows_raw:
        reg_id = r["Reg charity number"].strip()
        assert re.fullmatch(r"\d{6}", reg_id), f"Invalid regId: {reg_id!r}"
        assert reg_id not in seen_ids, f"Duplicate regId: {reg_id}"
        seen_ids.add(reg_id)

        name = re.sub(r"\s+", " ", r["Charity name"].strip())
        assert name, f"Empty name for {reg_id}"
        name_counts[name] += 1

        reg_date = parse_uk_slash_date(r["Date registered"])
        reg_year_counts[reg_date[:4]] += 1

        raw_status = r["Status"].strip()
        bucket, days_val, active = parse_status(raw_status)
        status_counts[bucket] += 1

        fye = parse_long_uk_date(r["Date for financial year ending"])
        if fye:
            fye_year_counts[fye[:4]] += 1

        inc_raw = parse_int(r["Total income"])
        spend_raw = parse_int(r["Total spending"])
        exp_char_raw = parse_int(r["Expenditure on Charitable activities"])
        exp_raise_raw = parse_int(r["Expenditure on Raising funds"])
        exp_gov_raw = parse_int(r["Expenditure on Governance"])
        staff_raw = parse_int(r["Employed staff"])
        vol_raw = parse_int(r["UK and Ireland volunteers"])
        inc_endow = parse_int(r["Total income and endowments"])
        net_assets = parse_int(r["Total net assets and liabilities"])

        if inc_endow > 0:
            income_endowment_total += 1
            if inc_endow == inc_raw:
                income_endowment_matches += 1

        if net_assets > 0:
            net_assets_pos += 1
        elif net_assets < 0:
            net_assets_neg += 1
        else:
            net_assets_zero += 1

        if (r["Company number"] or "").strip() not in ("", "0"):
            company_num_nonzero += 1
        if (r["Total income. Previous financial period."] or "").strip() not in ("", "0"):
            prev_income_nonzero += 1

        if fye is None:
            if any(x != 0 for x in (inc_raw, spend_raw, staff_raw, vol_raw)):
                unfiled_with_nonzero_financials.append({
                    "nic": f"NIC{reg_id}",
                    "name": name,
                    "status": raw_status,
                    "income": inc_raw,
                    "spending": spend_raw,
                    "staff": staff_raw,
                    "volunteers": vol_raw,
                })
                income = inc_raw
                spending = spend_raw
                staff = staff_raw
                volunteers = vol_raw
                charitable_exp = exp_char_raw
            else:
                income = None
                spending = None
                staff = None
                volunteers = None
                charitable_exp = None
        else:
            income = inc_raw
            spending = spend_raw
            staff = staff_raw
            volunteers = vol_raw
            charitable_exp = exp_char_raw

        if inc_raw < 0 or spend_raw < 0:
            negative_financial_rows.append({
                "nic": f"NIC{reg_id}",
                "name": name,
                "status": raw_status,
                "fye": fye,
                "totalIncomeGbp": inc_raw,
                "totalSpendingGbp": spend_raw,
            })

        # Flag huge unverified outlier where income > £50M yet charitable activities expenditure == 0 and staff == 0
        if inc_raw >= 50_000_000 and exp_char_raw == 0 and staff_raw == 0:
            suspicious_outliers.append({
                "nic": f"NIC{reg_id}",
                "name": name,
                "status": raw_status,
                "fye": fye,
                "totalIncomeGbp": inc_raw,
                "totalSpendingGbp": spend_raw,
                "charitableExpenditureGbp": exp_char_raw,
                "employedStaff": staff_raw,
                "volunteers": vol_raw,
                "note": "Reported verbatim from CCNI CSV without adjustment; >£50M reported income with 0 employed staff and 0 itemized charitable expenditure may reflect a source filing scale/unit or diocesan aggregation anomaly.",
            })

        gov_doc = r["Type of governing document"].strip() or None
        gov_doc_counts[gov_doc or "(Not stated)"] += 1

        purposes, leftover = parse_purposes(r["What the charity does"])
        if leftover:
            unrecognized_purposes[leftover] += 1
        for p in purposes:
            purpose_counts[p] += 1

        raw_web = r["Website"].strip()
        website = sanitize_website(raw_web)
        if raw_web and website is None:
            website_dropped_count += 1

        other_name = re.sub(r"\s+", " ", r["Other name"].strip()) or None
        if other_name and other_name.lower() == name.lower():
            other_name = None

        organizations.append({
            "regId": reg_id,
            "nic": f"NIC{reg_id}",
            "name": name,
            "otherName": other_name,
            "norm": normalize_name(name + (" " + other_name if other_name else "")),
            "registered": reg_date,
            "active": active,
            "statusBucket": bucket,
            "statusRaw": raw_status,
            "days": days_val,
            "fye": fye,
            "income": income,
            "spending": spending,
            "charitableExp": charitable_exp,
            "staff": staff,
            "volunteers": volunteers,
            "govDoc": gov_doc,
            "purposes": purposes,
            "website": website,
        })

    assert len(unrecognized_purposes) == 0, f"Unrecognized purpose text: {unrecognized_purposes.most_common(5)}"

    # Sort deterministically by active desc, income desc (nulls last), regId asc
    organizations.sort(
        key=lambda o: (
            0 if o["active"] else 1,
            -(o["income"] if o["income"] is not None else -10**18),
            int(o["regId"]),
        )
    )

    active_orgs = [o for o in organizations if o["active"]]
    removed_orgs = [o for o in organizations if not o["active"]]
    filed_orgs = [o for o in organizations if o["fye"] is not None]
    active_filed = [o for o in active_orgs if o["fye"] is not None]

    total_income_all = sum(o["income"] for o in organizations if o["income"] is not None)
    total_spending_all = sum(o["spending"] for o in organizations if o["spending"] is not None)
    total_income_active = sum(o["income"] for o in active_orgs if o["income"] is not None)
    total_spending_active = sum(o["spending"] for o in active_orgs if o["spending"] is not None)
    total_staff_active = sum(o["staff"] for o in active_orgs if o["staff"] is not None)
    total_volunteers_active = sum(o["volunteers"] for o in active_orgs if o["volunteers"] is not None)
    total_staff_all = sum(o["staff"] for o in organizations if o["staff"] is not None)
    total_volunteers_all = sum(o["volunteers"] for o in organizations if o["volunteers"] is not None)

    # Top 20 active charities by reported income
    top_20_active = [
        {
            "regId": o["regId"],
            "nic": o["nic"],
            "name": o["name"],
            "fye": o["fye"],
            "incomeGbp": o["income"],
            "spendingGbp": o["spending"],
            "staff": o["staff"],
            "volunteers": o["volunteers"],
            "statusRaw": o["statusRaw"],
            "govDoc": o["govDoc"],
        }
        for o in active_orgs[:20]
    ]

    purpose_summary = []
    for p in PURPOSE_CATALOG:
        code = p["code"]
        tot = sum(1 for o in organizations if code in o["purposes"])
        act = sum(1 for o in active_orgs if code in o["purposes"])
        rem = tot - act
        purpose_summary.append({
            "code": code,
            "label": p["label"],
            "short": p["short"],
            "total": tot,
            "active": act,
            "removed": rem,
        })
    purpose_summary.sort(key=lambda x: (-x["total"], x["code"]))

    gov_doc_summary = []
    for label, tot in gov_doc_counts.most_common():
        key = None if label == "(Not stated)" else label
        act = sum(1 for o in active_orgs if o["govDoc"] == key)
        gov_doc_summary.append({
            "type": label,
            "total": tot,
            "active": act,
            "removed": tot - act,
        })

    duplicate_names = [
        {
            "name": nm,
            "count": cnt,
            "nics": [o["nic"] for o in organizations if o["name"] == nm],
        }
        for nm, cnt in sorted(name_counts.items(), key=lambda kv: (-kv[1], kv[0]))
        if cnt > 1
    ]

    out_dir = args.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    # Write organizations.json.gz
    orgs_payload = json.dumps(organizations, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    orgs_art = write_deterministic_gzip(out_dir / "organizations.json.gz", orgs_payload)
    orgs_art["rows"] = len(organizations)

    # Write PII-stripped CSV with UTF-8 BOM and formula protection
    csv_buf = io.StringIO()
    csv_writer = csv.writer(csv_buf, lineterminator="\r\n")
    csv_writer.writerow([
        "nic_number",
        "reg_charity_number",
        "charity_name",
        "other_name",
        "date_registered",
        "active",
        "status_bucket",
        "status_raw",
        "financial_year_ending",
        "total_income_gbp",
        "total_spending_gbp",
        "charitable_expenditure_gbp",
        "employed_staff",
        "uk_ireland_volunteers",
        "governing_document",
        "statutory_purposes",
        "website",
        "ccni_profile_url",
    ])
    for o in organizations:
        csv_writer.writerow([
            o["nic"],
            o["regId"],
            csv_safe_cell(o["name"]),
            csv_safe_cell(o["otherName"]),
            o["registered"],
            "true" if o["active"] else "false",
            o["statusBucket"],
            csv_safe_cell(o["statusRaw"]),
            o["fye"] or "",
            "" if o["income"] is None else o["income"],
            "" if o["spending"] is None else o["spending"],
            "" if o["charitableExp"] is None else o["charitableExp"],
            "" if o["staff"] is None else o["staff"],
            "" if o["volunteers"] is None else o["volunteers"],
            csv_safe_cell(o["govDoc"]),
            "; ".join(o["purposes"]),
            o["website"] or "",
            f"https://www.charitycommissionni.org.uk/charity-details/?regId={o['regId']}&subId=0",
        ])
    csv_bytes = ("\ufeff" + csv_buf.getvalue()).encode("utf-8")
    csv_out_path = out_dir / "northern-ireland-ccni-charities.csv"
    csv_out_path.write_bytes(csv_bytes)
    csv_art = {
        "path": csv_out_path.name,
        "bytes": len(csv_bytes),
        "sha256": sha256_bytes(csv_bytes),
        "rows": len(organizations),
    }

    # Write anomalies.json verbatim
    anomalies_doc = {
        "format": "charitology-northern-ireland-anomalies-v1",
        "capturedOn": args.captured_on,
        "sourceFile": "ccni-register.csv",
        "sourceSha256": raw_sha256,
        "summary": {
            "totalRows": len(organizations),
            "trailingEmptyHeaderColumnPresent": trailing_empty_col,
            "companyNumberAllZeroCount": len(organizations) - company_num_nonzero,
            "previousPeriodIncomeAllZeroCount": len(organizations) - prev_income_nonzero,
            "negativeFinancialRowsCount": len(negative_financial_rows),
            "unfiledWithNonzeroFinancialsCount": len(unfiled_with_nonzero_financials),
            "largeUnverifiedOutliersCount": len(suspicious_outliers),
            "activeWithoutFinancialYearEndCount": sum(1 for o in active_orgs if o["fye"] is None),
            "removedWithHistoricalFinancialYearEndCount": sum(1 for o in removed_orgs if o["fye"] is not None),
            "duplicateExactCharityNamesCount": len(duplicate_names),
            "duplicateExactCharityNameRows": sum(d["count"] for d in duplicate_names),
            "netAssetsPositiveRows": net_assets_pos,
            "netAssetsNegativeRows": net_assets_neg,
            "netAssetsZeroRows": net_assets_zero,
            "droppedInvalidWebsiteStrings": website_dropped_count,
            "privacyStrippedColumns": ["Public address", "Email", "Telephone"],
        },
        "notes": [
            "CCNI exports 'Company number' as '0' and 'Total income. Previous financial period.' as '0' across all 8,396 rows, plus a trailing blank 39th CSV column.",
            "CCNI's 'Charitable spending' and 'Income generation and governance' summary columns are rounded percentages of income (pence per £1), whereas 'Expenditure on Charitable activities' and 'Total expenditure' are integer GBP. We display integer GBP fields only.",
            "CCNI's 'Total net assets and liabilities' column is negative for 921 charities (including major universities and housing associations) and positive for only 51 charities, reflecting an inverted sign convention in CCNI's export; it is omitted from headline sums.",
            "When 'Date for financial year ending' is blank and all financial columns are 0 (newly registered or unfiled charities), financial fields are stored as null rather than £0.",
            "Public address, Email, and Telephone are stripped to avoid republishing small-charity trustees' residential addresses and personal contact details.",
        ],
        "negativeFinancialRows": negative_financial_rows,
        "unfiledWithNonzeroFinancials": unfiled_with_nonzero_financials,
        "largeUnverifiedOutliers": suspicious_outliers,
        "duplicateExactNamesSample": duplicate_names[:20],
    }
    anomalies_bytes = (json.dumps(anomalies_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    anomalies_path = out_dir / "anomalies.json"
    anomalies_path.write_bytes(anomalies_bytes)
    anomalies_art = {
        "path": anomalies_path.name,
        "bytes": len(anomalies_bytes),
        "sha256": sha256_bytes(anomalies_bytes),
    }

    # Write manifest.json
    manifest = {
        "format": "charitology-northern-ireland-registry-v1",
        "jurisdiction": "Northern Ireland (United Kingdom)",
        "asOf": args.captured_on,
        "capturedOn": args.captured_on,
        "currency": "GBP",
        "publisher": "Charity Commission for Northern Ireland (CCNI)",
        "catalogues": {
            "ccniCharitySearch": "https://www.charitycommissionni.org.uk/charity-search/",
            "ccniBulkCsv": "https://www.charitycommissionni.org.uk/api/charity-search/exportSearchResultsToCsv/?pageNumber=1&include=Linked&include=Removed",
            "openDataNi": "https://admin.opendatani.gov.uk/dataset/register-of-charities",
            "ccniCharityDetailsPrefix": "https://www.charitycommissionni.org.uk/charity-details/?regId=",
        },
        "sourceCapture": {
            "filename": "ccni-register.csv",
            "bytes": len(raw_bytes),
            "sha256": raw_sha256,
            "capturedOn": args.captured_on,
            "rawRows": len(rows_raw),
        },
        "counts": {
            "includedOrganizations": len(organizations),
            "uniqueCharityNumbers": len(seen_ids),
            "distinctExactNames": len(name_counts),
            "activeOrganizations": len(active_orgs),
            "removedOrganizations": len(removed_orgs),
            "byStatusBucket": {
                "received_on_time": status_counts["received_on_time"],
                "received_late": status_counts["received_late"],
                "overdue": status_counts["overdue"],
                "registered_no_return_due": status_counts["registered_no_return_due"],
                "removed": status_counts["removed"],
            },
            "withFinancialYearEnd": len(filed_orgs),
            "activeWithFinancialYearEnd": len(active_filed),
            "activeWithoutFinancialYearEnd": len(active_orgs) - len(active_filed),
            "withWebsite": sum(1 for o in organizations if o["website"] is not None),
            "earliestRegistration": min(o["registered"] for o in organizations),
            "latestRegistration": max(o["registered"] for o in organizations),
            "registrationsByYear": dict(sorted(reg_year_counts.items())),
            "financialYearEndsByYear": dict(sorted(fye_year_counts.items())),
            "incomeEndowmentMatches": income_endowment_matches,
            "incomeEndowmentNonZeroRows": income_endowment_total,
        },
        "financialTotalsGbp": {
            "activeTotalIncomeGbp": total_income_active,
            "activeTotalSpendingGbp": total_spending_active,
            "allTotalIncomeGbp": total_income_all,
            "allTotalSpendingGbp": total_spending_all,
            "activeEmployedStaff": total_staff_active,
            "activeUkIrelandVolunteers": total_volunteers_active,
            "allEmployedStaff": total_staff_all,
            "allUkIrelandVolunteers": total_volunteers_all,
        },
        "purposes": purpose_summary,
        "governingDocuments": gov_doc_summary,
        "top20ActiveByIncome": top_20_active,
        "artifacts": {
            "organizations": orgs_art,
            "csv": csv_art,
            "anomalies": anomalies_art,
        },
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (out_dir / "manifest.json").write_bytes(manifest_bytes)

    # Also write src/data/northern-ireland-index-sources.tsv
    sources_tsv = pathlib.Path("src/data/northern-ireland-index-sources.tsv")
    sources_tsv.write_text(
        "filename\turl\tbytes\tsha256\tcaptured_on\tlicense\tnote\n"
        f"ccni-register.csv\thttps://www.charitycommissionni.org.uk/api/charity-search/exportSearchResultsToCsv/?pageNumber=1&include=Linked&include=Removed\t{len(raw_bytes)}\t{raw_sha256}\t{args.captured_on}\tOpen Government Licence v3.0 (Charity Commission for Northern Ireland / Open Data NI)\tComplete CCNI Register of Charities CSV export ({len(organizations)} unique NIC charities: {len(active_orgs)} active across on-time/late/overdue/registered statuses and {len(removed_orgs)} removed; GBP 3.30B active reported income; PII columns stripped)\n",
        encoding="utf-8",
    )

    print(
        f"Built Northern Ireland CCNI index: {len(organizations):,} charities "
        f"({len(active_orgs):,} active, {len(removed_orgs):,} removed), "
        f"active income £{total_income_active:,}, active spending £{total_spending_active:,}, "
        f"staff {total_staff_active:,}, volunteers {total_volunteers_active:,}, "
        f"orgs.json.gz={orgs_art['bytes']:,} B, csv={csv_art['bytes']:,} B."
    )
    print(f"Unfiled with nonzero financials: {len(unfiled_with_nonzero_financials)}")
    print(f"Negative financial rows: {len(negative_financial_rows)}")
    print(f"Large unverified outliers: {len(suspicious_outliers)}")


if __name__ == "__main__":
    main()
