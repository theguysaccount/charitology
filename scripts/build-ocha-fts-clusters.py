#!/usr/bin/env python3
"""
Deterministic stdlib-only builder for OCHA FTS Global Humanitarian Plan-Cluster Funding Gaps (2019-2026):
  public/data/funding-flows/ocha-fts-global-clusters/

Usage:
  python3 scripts/build-ocha-fts-clusters.py <input-dir> <output-public-data-dir>

Verifies fts_requirements_funding_cluster_global.csv (CC BY 3.0 IGO) by SHA-256 against
src/data/ocha-fts-clusters-sources.tsv. Preserves exact original OCHA cluster names alongside a
transparent normalized sector grouping so English/French/Spanish response plans can be compared
without erasing original labels or inventing missing requirements.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import pathlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CAPTURED_ON = "2026-11-22"
MIN_YEAR = 2019
MAX_YEAR = 2026


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_gz_json(path: pathlib.Path, obj: object) -> dict:
    raw = (json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    comp = buf.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(comp)
    return {
        "bytes": len(comp),
        "decodedBytes": len(raw),
        "sha256": sha256_bytes(comp),
        "decodedSha256": sha256_bytes(raw),
    }


def fold(text: str) -> str:
    s = unicodedata.normalize("NFKD", (text or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip()


def parse_usd_int(val: str) -> int | None:
    s = (val or "").strip()
    if not s:
        return None
    try:
        return int(Decimal(s).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return None


def parse_pct(val: str) -> float | None:
    s = (val or "").strip()
    if not s:
        return None
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def normalize_sector(cluster_raw: str) -> str:
    c = fold(cluster_raw)
    if not c or "not specified" in c or "multiple clusters" in c or "unspecified" in c:
        return "Unspecified / Shared"
    if any(k in c for k in ("food security", "securite alimentaire", "seguridad alimentaria", "agriculture", "fsl")):
        return "Food Security & Agriculture"
    if any(k in c for k in ("nutrition", "nutricion")):
        return "Nutrition"
    if any(k in c for k in ("health", "sante", "salud", "covid")):
        return "Health"
    if any(k in c for k in ("water", "wash", "eau", "hygiene", "agua", "saneamiento", "assainissement", "eha")):
        return "WASH (Water, Sanitation & Hygiene)"
    if any(k in c for k in ("education", "educacion")):
        return "Education"
    if any(k in c for k in ("protection", "proteccion", "gbv", "child protection", "mine action", "vbg")):
        return "Protection"
    if any(k in c for k in ("shelter", "nfi", "abri", "ame", "alojamiento", "non-food", "bien", "cccm", "camp")):
        return "Shelter, NFI & Camp Coordination"
    if any(k in c for k in ("refugee", "refugie", "migration", "migrant", "displacement", "rmrp")):
        return "Refugee & Migration Response"
    if any(k in c for k in ("cash", "mpc", "transfert", "efectivo")):
        return "Multi-Purpose Cash"
    if any(k in c for k in ("coordination", "logistics", "logistique", "telecom", "etc", "common services", "aviation")):
        return "Coordination, Logistics & Telecom"
    if any(k in c for k in ("early recovery", "livelihood", "resilience", "recuperacion", "relevement")):
        return "Early Recovery & Livelihoods"
    return "Other Named Clusters"


def verify_source(input_dir: pathlib.Path, tsv_path: pathlib.Path) -> dict:
    with tsv_path.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    if len(rows) != 1:
        raise SystemExit("Expected exactly 1 pinned OCHA FTS source row.")
    row = rows[0]
    fp = input_dir / row["file"]
    if not fp.is_file():
        raise SystemExit(f"Missing pinned OCHA FTS CSV: {fp}")
    actual_b = fp.stat().st_size
    if actual_b != int(row["bytes"]):
        raise SystemExit(f"Byte mismatch: {actual_b} != {row['bytes']}")
    actual_sha = sha256_file(fp)
    if actual_sha != row["sha256"]:
        raise SystemExit(f"SHA-256 mismatch: {actual_sha} != {row['sha256']}")
    return row


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-ocha-fts-clusters.py <input-dir> <output-public-data-dir>")

    input_dir = pathlib.Path(sys.argv[1]).resolve()
    out_root = pathlib.Path(sys.argv[2]).resolve()
    tsv_path = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "ocha-fts-clusters-sources.tsv"

    src = verify_source(input_dir, tsv_path)
    fp = input_dir / src["file"]

    total_csv_rows = 0
    hxl_tag_rows = 0
    pre_2019_rows = 0
    missing_req_rows = 0
    unspecified_cluster_rows = 0
    records = []

    by_year = defaultdict(lambda: {
        "rows": 0, "plans": set(), "countries": set(),
        "reqUsd": 0, "fundUsd": 0, "namedClusterReqUsd": 0, "namedClusterFundUsd": 0,
        "unspecifiedFundUsd": 0,
    })
    by_sector_2025 = defaultdict(lambda: {"rows": 0, "plans": set(), "reqUsd": 0, "fundUsd": 0})
    by_sector_all = defaultdict(lambda: {"rows": 0, "plans": set(), "reqUsd": 0, "fundUsd": 0})
    plans_2025 = defaultdict(lambda: {
        "planId": "", "planCode": "", "planName": "", "countryCode": "",
        "rows": 0, "reqUsd": 0, "fundUsd": 0, "unspecifiedFundUsd": 0,
    })
    plans_2026 = defaultdict(lambda: {
        "planId": "", "planCode": "", "planName": "", "countryCode": "",
        "rows": 0, "reqUsd": 0, "fundUsd": 0, "unspecifiedFundUsd": 0,
    })

    with fp.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_csv_rows += 1
            cc = (row.get("countryCode") or "").strip()
            if cc.startswith("#"):
                hxl_tag_rows += 1
                continue
            y_str = (row.get("year") or "").strip()
            if not y_str.isdigit():
                continue
            year = int(y_str)
            if year < MIN_YEAR or year > MAX_YEAR:
                pre_2019_rows += 1
                continue

            plan_id = (row.get("id") or "").strip()
            plan_name = re.sub(r"\s+", " ", (row.get("name") or "").strip())
            plan_code = (row.get("code") or "").strip()
            cl_code = (row.get("clusterCode") or "").strip()
            cl_name = re.sub(r"\s+", " ", (row.get("cluster") or "").strip()) or "Not specified"
            sector = normalize_sector(cl_name)

            req = parse_usd_int(row.get("requirements") or "")
            fund = parse_usd_int(row.get("funding") or "")
            src_pct = parse_pct(row.get("percentFunded") or "")

            if req is None or req == 0:
                missing_req_rows += 1
            if sector == "Unspecified / Shared":
                unspecified_cluster_rows += 1

            req_n = req or 0
            fund_n = fund or 0
            gap = (req - fund_n) if (req is not None and req > 0) else None
            calc_pct = round(fund_n * 100.0 / req, 2) if (req is not None and req > 0) else None

            rec = {
                "y": year,
                "cc": cc,
                "pid": plan_id,
                "pcode": plan_code,
                "plan": plan_name,
                "clCode": cl_code,
                "cluster": cl_name,
                "sector": sector,
                "req": req,
                "fund": fund,
                "gap": gap,
                "pct": calc_pct,
                "srcPct": src_pct,
            }
            records.append(rec)

            dy = by_year[year]
            dy["rows"] += 1
            dy["plans"].add(plan_id)
            dy["countries"].add(cc)
            dy["reqUsd"] += req_n
            dy["fundUsd"] += fund_n
            if sector == "Unspecified / Shared":
                dy["unspecifiedFundUsd"] += fund_n
            else:
                dy["namedClusterReqUsd"] += req_n
                dy["namedClusterFundUsd"] += fund_n

            sa = by_sector_all[sector]
            sa["rows"] += 1
            sa["plans"].add(plan_id)
            sa["reqUsd"] += req_n
            sa["fundUsd"] += fund_n

            if year == 2025:
                s25 = by_sector_2025[sector]
                s25["rows"] += 1
                s25["plans"].add(plan_id)
                s25["reqUsd"] += req_n
                s25["fundUsd"] += fund_n

                p25 = plans_2025[plan_id]
                p25["planId"] = plan_id
                p25["planCode"] = plan_code
                p25["planName"] = plan_name
                p25["countryCode"] = cc
                p25["rows"] += 1
                p25["reqUsd"] += req_n
                p25["fundUsd"] += fund_n
                if sector == "Unspecified / Shared":
                    p25["unspecifiedFundUsd"] += fund_n

            if year == 2026:
                p26 = plans_2026[plan_id]
                p26["planId"] = plan_id
                p26["planCode"] = plan_code
                p26["planName"] = plan_name
                p26["countryCode"] = cc
                p26["rows"] += 1
                p26["reqUsd"] += req_n
                p26["fundUsd"] += fund_n
                if sector == "Unspecified / Shared":
                    p26["unspecifiedFundUsd"] += fund_n

    records.sort(key=lambda r: (-r["y"], -(r["req"] or 0), r["cc"], r["pid"], r["cluster"]))

    out_dir = out_root / "funding-flows" / "ocha-fts-global-clusters"
    out_dir.mkdir(parents=True, exist_ok=True)

    clusters_meta = write_gz_json(out_dir / "clusters.json.gz", records)

    yearly_out = {}
    csv_buf = io.StringIO()
    w = csv.writer(csv_buf, lineterminator="\n")
    w.writerow([
        "year", "plans", "country_codes", "cluster_rows",
        "requirements_usd", "reported_funding_usd", "funding_coverage_pct",
        "unfunded_gap_usd", "unspecified_or_shared_funding_usd",
    ])
    for y in sorted(by_year.keys()):
        d = by_year[y]
        pct = round(d["fundUsd"] * 100.0 / d["reqUsd"], 2) if d["reqUsd"] else None
        gap = d["reqUsd"] - d["fundUsd"]
        yearly_out[str(y)] = {
            "year": y,
            "plans": len(d["plans"]),
            "countryCodes": len(d["countries"]),
            "rows": d["rows"],
            "reqUsd": d["reqUsd"],
            "fundUsd": d["fundUsd"],
            "gapUsd": gap,
            "coveragePct": pct,
            "namedClusterReqUsd": d["namedClusterReqUsd"],
            "namedClusterFundUsd": d["namedClusterFundUsd"],
            "unspecifiedFundUsd": d["unspecifiedFundUsd"],
        }
        w.writerow([
            y, len(d["plans"]), len(d["countries"]), d["rows"],
            d["reqUsd"], d["fundUsd"], f"{pct:.2f}" if pct is not None else "",
            gap, d["unspecifiedFundUsd"],
        ])
    (out_dir / "yearly-summary.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    def pack_sectors(src_map):
        out = []
        for name, d in sorted(src_map.items(), key=lambda x: (-x[1]["reqUsd"], x[0])):
            pct = round(d["fundUsd"] * 100.0 / d["reqUsd"], 2) if d["reqUsd"] else None
            out.append({
                "sector": name,
                "rows": d["rows"],
                "plans": len(d["plans"]),
                "reqUsd": d["reqUsd"],
                "fundUsd": d["fundUsd"],
                "gapUsd": d["reqUsd"] - d["fundUsd"] if d["reqUsd"] else None,
                "coveragePct": pct,
            })
        return out

    def pack_plans(src_map):
        out = []
        for d in sorted(src_map.values(), key=lambda x: (-x["reqUsd"], x["planId"])):
            if d["reqUsd"] <= 0:
                continue
            out.append({
                **d,
                "gapUsd": d["reqUsd"] - d["fundUsd"],
                "coveragePct": round(d["fundUsd"] * 100.0 / d["reqUsd"], 2),
            })
        return out

    all_countries = sorted({r["cc"] for r in records if r["cc"]})
    all_plans = {r["pid"] for r in records if r["pid"]}
    total_req = sum(r["req"] or 0 for r in records)
    total_fund = sum(r["fund"] or 0 for r in records)

    anomalies = {
        "format": "charitology-ocha-fts-clusters-anomalies-v1",
        "capturedOn": CAPTURED_ON,
        "notes": [
            "OCHA FTS reports cluster-level requirements and reported funding in nominal USD without inflation adjustment; 'reported funding' reflects donor/agency reports to FTS rather than audited cash spent or verified beneficiary receipt.",
            "Rows with cluster='Not specified' or 'Multiple clusters/sectors (shared)' carry plan funding that donors did not earmark to a single cluster. Those dollars are retained in plan and yearly totals while kept separate from named-sector coverage ratios.",
            "Normalized sector groupings map English, French and Spanish OCHA cluster labels (e.g., Health / Santé / Salud) for side-by-side filtering while preserving every row's exact original OCHA cluster string.",
            "2026 figures are partial year-to-date captures as of 2026-11-22 and must not be read as full-year final funding.",
        ],
        "counts": {
            "totalCsvRows": total_csv_rows,
            "hxlTagRowsSkipped": hxl_tag_rows,
            "pre2019RowsExcluded": pre_2019_rows,
            "included2019to2026Rows": len(records),
            "rowsWithoutPositiveRequirement": missing_req_rows,
            "unspecifiedOrSharedClusterRows": unspecified_cluster_rows,
        },
    }
    (out_dir / "anomalies.json").write_text(
        json.dumps(anomalies, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    manifest = {
        "format": "charitology-ocha-fts-global-clusters-v1",
        "capturedOn": CAPTURED_ON,
        "yearsCovered": list(range(MIN_YEAR, MAX_YEAR + 1)),
        "currency": "USD",
        "license": "Creative Commons Attribution 3.0 IGO (CC BY 3.0 IGO)",
        "publisher": "UN OCHA Financial Tracking Service (FTS) via Humanitarian Data Exchange (HDX)",
        "catalogue": "https://data.humdata.org/dataset/global-requirements-and-funding-data",
        "source": {
            "file": src["file"],
            "bytes": int(src["bytes"]),
            "sha256": src["sha256"],
            "url": src["url"],
        },
        "counts": {
            "rows": len(records),
            "distinctPlans": len(all_plans),
            "distinctCountryCodes": len(all_countries),
            "totalRequirementsUsd": total_req,
            "totalReportedFundingUsd": total_fund,
            "overallCoveragePct": round(total_fund * 100.0 / total_req, 2) if total_req else None,
        },
        "yearly": yearly_out,
        "sectors2025": pack_sectors(by_sector_2025),
        "sectorsAll2019to2026": pack_sectors(by_sector_all),
        "topPlans2025": pack_plans(plans_2025)[:20],
        "topPlans2026": pack_plans(plans_2026)[:15],
        "countryCodes": all_countries,
        "artifacts": {
            "clusters": {"path": "clusters.json.gz", "rows": len(records), **clusters_meta},
            "yearlySummaryCsv": "yearly-summary.csv",
            "anomalies": "anomalies.json",
        },
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(
        f"Built OCHA FTS Global Clusters (2019-2026): {len(records):,} plan-cluster rows across "
        f"{len(all_plans)} plans and {len(all_countries)} country codes "
        f"(${total_req / 1e9:.2f}B required / ${total_fund / 1e9:.2f}B funded; {manifest['counts']['overallCoveragePct']}%)."
    )


if __name__ == "__main__":
    main()
