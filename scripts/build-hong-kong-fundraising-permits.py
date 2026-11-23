#!/usr/bin/env python3
"""Deterministic builder for Hong Kong Approved Charitable Fund-Raising Permits (GovHK PSI JSON).

Reads SHA-256-pinned govhk-fundraising-permits-complete.json + committed Hong Kong Section 88
registry snapshot, strips enquiryContact phone numbers, performs conservative bilingual name
matching against Section 88 parents without guessing, and emits deterministic artifacts.
"""

from __future__ import annotations

import argparse
import collections
import csv
import gzip
import hashlib
import json
import re
from pathlib import Path

EXPECTED_PERMITS_SHA = "b5a062e8f99ed30e509a005444fe3db53c2f22c91f2afa90a7944a32760492ac"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_deterministic(raw: bytes) -> bytes:
    return gzip.compress(raw, compresslevel=9, mtime=0)


def norm_en(s: str | None) -> str:
    s = (s or "").lower().strip()
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def norm_zh(s: str | None) -> str:
    s = (s or "").strip()
    if s in ("沒有中文註册名稱", "沒有中文註冊名稱"):
        return ""
    return re.sub(r"[\s\u3000\-\(\)（）,，\.。・]+", "", s)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--permits-json", required=True, type=Path)
    parser.add_argument("--s88-gz", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    raw_permits = args.permits_json.read_bytes()
    digest = sha256_bytes(raw_permits)
    if digest != EXPECTED_PERMITS_SHA:
        raise SystemExit(f"SHA-256 mismatch for GovHK permits: got {digest}, expected {EXPECTED_PERMITS_SHA}")

    permits_doc = json.loads(raw_permits.decode("utf-8"))
    activities = permits_doc["activities"]
    s88_rows = json.loads(gzip.decompress(args.s88_gz.read_bytes()).decode("utf-8"))

    s88_en: dict[str, list[dict]] = {}
    s88_zh: dict[str, list[dict]] = {}
    for c in s88_rows:
        en = norm_en(c.get("en"))
        zh = norm_zh(c.get("zh"))
        if en:
            s88_en.setdefault(en, []).append(c)
        if zh:
            s88_zh.setdefault(zh, []).append(c)
        if c.get("en") and c["en"].lower().endswith(", the"):
            alt = norm_en("The " + c["en"][:-5])
            if alt:
                s88_en.setdefault(alt, []).append(c)

    records = []
    dept_counts = collections.Counter()
    type_counts = collections.Counter()
    district_counts = collections.Counter()
    match_counts = collections.Counter()
    org_agg: dict[tuple[str, str], dict] = {}
    min_date: str | None = None
    max_date: str | None = None

    for a in activities:
        org_en = (a.get("organisationNameEnglish") or "").strip()
        org_zh = (a.get("organisationNameTChinese") or "").strip()
        if org_zh in ("沒有中文註册名稱", "沒有中文註冊名稱"):
            org_zh = ""
        dept = (a.get("departmentNameEnglish") or "").strip()
        permit_type = (a.get("licencePermitTypeEnglish") or "").strip()
        district = (a.get("districtNameEnglish") or "").strip()
        activity = (a.get("activityNameEnglish") or "").strip()
        permit_no = (a.get("permitNumber") or "").strip()
        location = (a.get("locationNameEnglish") or "").strip()
        sched = a.get("schedule") or []

        dates_from = sorted(str(s.get("dateFrom") or "").strip() for s in sched if s.get("dateFrom"))
        dates_to = sorted(str(s.get("dateTo") or "").strip() for s in sched if s.get("dateTo"))
        first_date = dates_from[0] if dates_from else None
        last_date = dates_to[-1] if dates_to else None
        if first_date and (min_date is None or first_date < min_date):
            min_date = first_date
        if last_date and (max_date is None or last_date > max_date):
            max_date = last_date

        m_en = s88_en.get(norm_en(org_en)) if org_en else None
        m_zh = s88_zh.get(norm_zh(org_zh)) if org_zh else None
        if m_en and m_zh:
            basis = "both_en_and_zh"
            matched = m_en[0]
        elif m_zh:
            basis = "zh_only"
            matched = m_zh[0]
        elif m_en:
            basis = "en_only"
            matched = m_en[0]
        else:
            basis = "unmatched_s88"
            matched = None

        dept_counts[dept] += 1
        type_counts[permit_type] += 1
        district_counts[district] += 1
        match_counts[basis] += 1

        rec = {
            "permitNo": permit_no,
            "orgEn": org_en,
            "orgZh": org_zh,
            "norm": f"{norm_en(org_en)} {norm_zh(org_zh)} {permit_no.lower()}".strip(),
            "dept": dept,
            "permitType": permit_type,
            "activity": activity,
            "district": district,
            "location": location,
            "scheduleDays": len(sched),
            "firstDate": first_date,
            "lastDate": last_date,
            "s88Basis": basis,
            "s88EffectiveDate": matched.get("effectiveDate") if matched else None,
            "s88MatchedEn": matched.get("en") if matched else None,
        }
        records.append(rec)

        okey = (org_en, org_zh)
        if okey not in org_agg:
            org_agg[okey] = {
                "orgEn": org_en,
                "orgZh": org_zh,
                "permits": 0,
                "scheduleDays": 0,
                "s88Basis": basis,
                "s88EffectiveDate": matched.get("effectiveDate") if matched else None,
                "departments": set(),
                "districts": set(),
            }
        org_agg[okey]["permits"] += 1
        org_agg[okey]["scheduleDays"] += len(sched)
        org_agg[okey]["departments"].add(dept)
        org_agg[okey]["districts"].add(district)

    records.sort(key=lambda r: (r["firstDate"] or "", r["permitNo"], r["orgEn"], r["district"], r["location"]))

    top_orgs = sorted(
        (
            {
                "orgEn": v["orgEn"],
                "orgZh": v["orgZh"],
                "permits": v["permits"],
                "scheduleDays": v["scheduleDays"],
                "s88Basis": v["s88Basis"],
                "s88EffectiveDate": v["s88EffectiveDate"],
                "departments": sorted(v["departments"]),
                "districts": sorted(v["districts"]),
            }
            for v in org_agg.values()
        ),
        key=lambda x: (-x["permits"], -x["scheduleDays"], x["orgEn"]),
    )

    unmatched_orgs = [o for o in top_orgs if o["s88Basis"] == "unmatched_s88"]

    args.out_dir.mkdir(parents=True, exist_ok=True)

    json_bytes = (json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    gz_bytes = gzip_deterministic(json_bytes)
    (args.out_dir / "permits.json.gz").write_bytes(gz_bytes)

    csv_path = args.out_dir / "hong-kong-fundraising-permits.csv"
    fieldnames = [
        "permit_number",
        "org_en",
        "org_zh",
        "department",
        "permit_type",
        "activity",
        "district",
        "schedule_days",
        "first_date",
        "last_date",
        "s88_match_basis",
        "s88_effective_date",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in records:
            w.writerow(
                {
                    "permit_number": r["permitNo"],
                    "org_en": r["orgEn"],
                    "org_zh": r["orgZh"],
                    "department": r["dept"],
                    "permit_type": r["permitType"],
                    "activity": r["activity"],
                    "district": r["district"],
                    "schedule_days": r["scheduleDays"],
                    "first_date": r["firstDate"] or "",
                    "last_date": r["lastDate"] or "",
                    "s88_match_basis": r["s88Basis"],
                    "s88_effective_date": r["s88EffectiveDate"] or "",
                }
            )
    csv_bytes = csv_path.read_bytes()

    matched_total = sum(v for k, v in match_counts.items() if k != "unmatched_s88")
    manifest = {
        "format": "charitology-hk-fundraising-permits-v1",
        "jurisdiction": "Hong Kong",
        "publisher": "Office of the Government Chief Information Officer (GovHK) — SWD & HAD Approved Charitable Fund-Raising Activities",
        "capturedOn": "2026-11-23",
        "catalogue": "https://fundraising.one.gov.hk/fundraise_query/webservice/psi/json",
        "sourceCapture": {
            "filename": "govhk-fundraising-permits-complete.json",
            "pagesFetched": permits_doc["pagesFetched"],
            "bytes": len(raw_permits),
            "sha256": digest,
        },
        "counts": {
            "totalPermits": len(records),
            "distinctOrganizations": len(org_agg),
            "totalScheduledDays": sum(r["scheduleDays"] for r in records),
            "earliestScheduledDate": min_date,
            "latestScheduledDate": max_date,
            "s88MatchedPermits": matched_total,
            "s88MatchedSharePct": round(matched_total * 100.0 / len(records), 2) if records else 0.0,
            "s88UnmatchedPermits": match_counts["unmatched_s88"],
            "s88UnmatchedOrganizations": len(unmatched_orgs),
            "byMatchBasis": dict(sorted(match_counts.items())),
            "byDepartment": dict(sorted(dept_counts.items())),
            "byPermitType": dict(sorted(type_counts.items())),
            "byDistrict": dict(sorted(district_counts.items())),
        },
        "top20Organizations": top_orgs[:20],
        "unmatchedOrganizations": unmatched_orgs,
        "artifacts": {
            "permits": {
                "path": "permits.json.gz",
                "bytes": len(gz_bytes),
                "sha256": sha256_bytes(gz_bytes),
                "decodedBytes": len(json_bytes),
                "decodedSha256": sha256_bytes(json_bytes),
                "rows": len(records),
            },
            "csv": {
                "path": "hong-kong-fundraising-permits.csv",
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
                "rows": len(records),
            },
        },
    }
    (args.out_dir / "manifest.json").write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f"Built {len(records)} GovHK permits across {len(org_agg)} orgs (S88 matched: {matched_total}/{len(records)})")


if __name__ == "__main__":
    main()
