#!/usr/bin/env python3
"""Deterministic builder for the OpenFEMA 2023-2026 Federal Disaster Captures edition.

Reads three SHA-256-pinned OpenFEMA API captures from --input-dir and emits
reproducible JSON, CSV, and manifest files under --out-dir without touching
immutable src/data/disaster-incidents/ editions.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

EXPECTED_SOURCES = {
    "fema-web-declarations.json": "45fe270ae693fc8df292bcbff286cfaf9387f59f247722d0a6ac34155dceb152",
    "fema-web-summaries.json": "4bed0d2fd425608f0f492a53d88a1a226ba74dca72700b6a805fd4bc11559ee4",
    "fema-declared-areas.json": "6c18b66f4f5d8d3fac1f163f78122e01c27b42c9d49eb5784f2d58edccf79bfd",
}

EVENT_CONTEXT = {
    4724: {
        "slug": "maui-wildfires-2023-fema",
        "commonTitle": "Maui Wildfires & High Winds (Hawaii, 2023 — Federal Benchmark)",
        "cohort": "2023-benchmark",
        "linkedDeskIncident": "/disasters/incidents/maui-wildfires-2023/",
        "officialPortalUrl": "https://www.mauirecovers.org/",
    },
    4827: {
        "slug": "hurricane-helene-nc-2024",
        "commonTitle": "Hurricane Helene (North Carolina, 2024)",
        "cohort": "2024-2026-expansion",
        "linkedDeskIncident": None,
        "officialPortalUrl": "https://www.fema.gov/disaster/4827",
    },
    4856: {
        "slug": "los-angeles-wildfires-2025",
        "commonTitle": "Los Angeles County Wildfires & Winds (California, 2025)",
        "cohort": "2024-2026-expansion",
        "linkedDeskIncident": None,
        "officialPortalUrl": "https://www.ca.gov/lafires/",
    },
    4946: {
        "slug": "super-typhoon-bavi-guam-2026",
        "commonTitle": "Super Typhoon Bavi (Guam, October 2026)",
        "cohort": "2024-2026-expansion",
        "linkedDeskIncident": None,
        "officialPortalUrl": "https://www.fema.gov/disaster/4946",
    },
    4955: {
        "slug": "hurricane-isaias-fl-2026",
        "commonTitle": "Hurricane Isaias (Florida, October 2026)",
        "cohort": "2024-2026-expansion",
        "linkedDeskIncident": None,
        "officialPortalUrl": "https://www.fema.gov/disaster/4955",
    },
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def iso_day(value: str | None) -> str | None:
    if not value:
        return None
    return str(value)[:10]


def round_usd(value: float | int | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    source_pins = []
    loaded = {}
    for fname, expected_sha in sorted(EXPECTED_SOURCES.items()):
        fpath = args.input_dir / fname
        raw = fpath.read_bytes()
        digest = sha256_bytes(raw)
        if digest != expected_sha:
            raise SystemExit(f"SHA-256 mismatch for {fname}: got {digest}, expected {expected_sha}")
        loaded[fname] = json.loads(raw.decode("utf-8"))
        source_pins.append({"filename": fname, "bytes": len(raw), "sha256": digest})

    declarations = loaded["fema-web-declarations.json"]["FemaWebDisasterDeclarations"]
    summaries = {row["disasterNumber"]: row for row in loaded["fema-web-summaries.json"]["FemaWebDisasterSummaries"]}
    area_rows = loaded["fema-declared-areas.json"]["DisasterDeclarationsSummaries"]

    areas_by_num: dict[int, list[str]] = {}
    for row in area_rows:
        num = int(row["disasterNumber"])
        area = str(row.get("designatedArea") or "").strip()
        if area:
            areas_by_num.setdefault(num, []).append(area)
    for num in areas_by_num:
        areas_by_num[num] = sorted(set(areas_by_num[num]))

    records = []
    for dec in sorted(declarations, key=lambda r: int(r["disasterNumber"])):
        num = int(dec["disasterNumber"])
        if num not in EVENT_CONTEXT:
            continue
        ctx = EVENT_CONTEXT[num]
        s = summaries.get(num, {})
        areas = areas_by_num.get(num, [])

        ihp = round_usd(s.get("totalAmountIhpApproved"))
        ha = round_usd(s.get("totalAmountHaApproved"))
        ona = round_usd(s.get("totalAmountOnaApproved"))
        pa = round_usd(s.get("totalObligatedAmountPa"))
        pa_ab = round_usd(s.get("totalObligatedAmountCatAb"))
        pa_cg = round_usd(s.get("totalObligatedAmountCatC2g"))
        hmgp = round_usd(s.get("totalObligatedAmountHmgp"))
        ia_hh = int(s["totalNumberIaApproved"]) if s.get("totalNumberIaApproved") is not None else None

        # Only sum reported non-null programs into a transparent subtotal; preserve null separately.
        reported_parts = [v for v in (ihp, pa, hmgp) if v is not None]
        reported_fema_total = round(sum(reported_parts), 2) if reported_parts else None

        records.append(
            {
                "disasterNumber": num,
                "femaId": f"DR-{num}-{dec['stateCode']}",
                "slug": ctx["slug"],
                "cohort": ctx["cohort"],
                "commonTitle": ctx["commonTitle"],
                "officialDisasterName": dec["disasterName"],
                "declarationType": dec["declarationType"],
                "incidentType": dec["incidentType"],
                "stateCode": dec["stateCode"],
                "stateName": dec["stateName"],
                "declarationDate": iso_day(dec.get("declarationDate")),
                "incidentBeginDate": iso_day(dec.get("incidentBeginDate")),
                "incidentEndDate": iso_day(dec.get("incidentEndDate")),
                "closeoutDate": iso_day(dec.get("closeoutDate")),
                "programsDeclared": {
                    "ih": bool(dec.get("ihProgramDeclared")),
                    "pa": bool(dec.get("paProgramDeclared")),
                    "hm": bool(dec.get("hmProgramDeclared")),
                },
                "designatedAreaCount": len(areas),
                "designatedAreas": areas,
                "financialsUsd": {
                    "iaHouseholdsApproved": ia_hh,
                    "ihpApprovedUsd": ihp,
                    "housingAssistanceUsd": ha,
                    "otherNeedsAssistanceUsd": ona,
                    "paObligatedUsd": pa,
                    "paEmergencyCatAbUsd": pa_ab,
                    "paPermanentCatCgUsd": pa_cg,
                    "hmgpObligatedUsd": hmgp,
                    "reportedFemaSubtotalUsd": reported_fema_total,
                    "iaLoadDate": iso_day(s.get("iaLoadDate")),
                    "paLoadDate": iso_day(s.get("paLoadDate")),
                    "summaryLastRefresh": s.get("lastRefresh"),
                },
                "femaDisasterPageUrl": dec.get("disasterPageUrl"),
                "officialPortalUrl": ctx["officialPortalUrl"],
                "linkedDeskIncident": ctx["linkedDeskIncident"],
            }
        )

    # Sort newest declaration first for editorial display
    records.sort(key=lambda r: (r["declarationDate"] or "", r["disasterNumber"]), reverse=True)

    args.out_dir.mkdir(parents=True, exist_ok=True)

    edition = {
        "format": "charitology-disaster-fema-edition-v2",
        "editionId": "fema-2024-2026-captures",
        "capturedOn": "2026-11-23",
        "publisher": "Federal Emergency Management Agency (OpenFEMA API v1 & v2)",
        "license": "U.S. Government Public Domain (OpenFEMA Terms)",
        "catalogueUrl": "https://www.fema.gov/about/openfema/data-sets",
        "counts": {
            "totalDisasters": len(records),
            "expansion2024to2026Disasters": sum(1 for r in records if r["cohort"] == "2024-2026-expansion"),
            "benchmark2023Disasters": sum(1 for r in records if r["cohort"] == "2023-benchmark"),
            "openWithoutCloseoutDate": sum(1 for r in records if r["closeoutDate"] is None),
            "totalDesignatedAreas": sum(r["designatedAreaCount"] for r in records),
            "totalIaHouseholdsApproved": sum(r["financialsUsd"]["iaHouseholdsApproved"] or 0 for r in records),
            "totalIhpApprovedUsd": round(sum(r["financialsUsd"]["ihpApprovedUsd"] or 0.0 for r in records), 2),
            "totalPaObligatedUsd": round(sum(r["financialsUsd"]["paObligatedUsd"] or 0.0 for r in records), 2),
            "totalHmgpObligatedUsd": round(sum(r["financialsUsd"]["hmgpObligatedUsd"] or 0.0 for r in records), 2),
            "disastersWithNullHmgp": sum(1 for r in records if r["financialsUsd"]["hmgpObligatedUsd"] is None),
        },
        "boundaries": [
            "OpenFEMA figures report U.S. federal FEMA Individual Assistance approvals and Public Assistance / Hazard Mitigation obligations only. They do not measure private charitable giving, insurance payouts, state/local appropriations, total economic loss, or unmet household needs.",
            "Null financial cells (such as HMGP obligations on October 2026 Guam and Florida declarations) mean no obligation has been reported yet in OpenFEMA, distinct from a verified zero.",
            "This edition complements the immutable initial-bounded-capture Disaster Desk edition (Maui 2023 County qualitative note and IFRC MDRTR004 Türkiye final report) without altering any historical record.",
        ],
        "disasters": records,
    }

    edition_path = args.out_dir / "edition.json"
    edition_bytes = (json.dumps(edition, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    edition_path.write_bytes(edition_bytes)

    csv_path = args.out_dir / "fema-2023-2026-summary.csv"
    fieldnames = [
        "fema_id",
        "cohort",
        "common_title",
        "official_disaster_name",
        "incident_type",
        "state_code",
        "declaration_date",
        "incident_begin_date",
        "incident_end_date",
        "closeout_date",
        "designated_area_count",
        "ia_households_approved",
        "ihp_approved_usd",
        "housing_assistance_usd",
        "other_needs_assistance_usd",
        "pa_obligated_usd",
        "pa_emergency_cat_ab_usd",
        "pa_permanent_cat_cg_usd",
        "hmgp_obligated_usd",
        "ia_load_date",
        "pa_load_date",
        "fema_page_url",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for r in records:
            f = r["financialsUsd"]
            writer.writerow(
                {
                    "fema_id": r["femaId"],
                    "cohort": r["cohort"],
                    "common_title": r["commonTitle"],
                    "official_disaster_name": r["officialDisasterName"],
                    "incident_type": r["incidentType"],
                    "state_code": r["stateCode"],
                    "declaration_date": r["declarationDate"] or "",
                    "incident_begin_date": r["incidentBeginDate"] or "",
                    "incident_end_date": r["incidentEndDate"] or "",
                    "closeout_date": r["closeoutDate"] or "",
                    "designated_area_count": r["designatedAreaCount"],
                    "ia_households_approved": "" if f["iaHouseholdsApproved"] is None else f["iaHouseholdsApproved"],
                    "ihp_approved_usd": "" if f["ihpApprovedUsd"] is None else f"{f['ihpApprovedUsd']:.2f}",
                    "housing_assistance_usd": "" if f["housingAssistanceUsd"] is None else f"{f['housingAssistanceUsd']:.2f}",
                    "other_needs_assistance_usd": "" if f["otherNeedsAssistanceUsd"] is None else f"{f['otherNeedsAssistanceUsd']:.2f}",
                    "pa_obligated_usd": "" if f["paObligatedUsd"] is None else f"{f['paObligatedUsd']:.2f}",
                    "pa_emergency_cat_ab_usd": "" if f["paEmergencyCatAbUsd"] is None else f"{f['paEmergencyCatAbUsd']:.2f}",
                    "pa_permanent_cat_cg_usd": "" if f["paPermanentCatCgUsd"] is None else f"{f['paPermanentCatCgUsd']:.2f}",
                    "hmgp_obligated_usd": "" if f["hmgpObligatedUsd"] is None else f"{f['hmgpObligatedUsd']:.2f}",
                    "ia_load_date": f["iaLoadDate"] or "",
                    "pa_load_date": f["paLoadDate"] or "",
                    "fema_page_url": r["femaDisasterPageUrl"] or "",
                }
            )
    csv_bytes = csv_path.read_bytes()

    manifest = {
        "format": "charitology-disaster-fema-manifest-v1",
        "editionId": edition["editionId"],
        "capturedOn": edition["capturedOn"],
        "publisher": edition["publisher"],
        "license": edition["license"],
        "catalogueUrl": edition["catalogueUrl"],
        "counts": edition["counts"],
        "sourceCaptures": source_pins,
        "artifacts": {
            "editionJson": {
                "path": "edition.json",
                "bytes": len(edition_bytes),
                "sha256": sha256_bytes(edition_bytes),
                "rows": len(records),
            },
            "summaryCsv": {
                "path": "fema-2023-2026-summary.csv",
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
                "rows": len(records),
            },
        },
    }
    (args.out_dir / "manifest.json").write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f"Built {len(records)} OpenFEMA disaster captures into {args.out_dir}")


if __name__ == "__main__":
    main()
