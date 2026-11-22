#!/usr/bin/env python3
"""Deterministic builder for Charitology's Latvia Global Charity Index edition.

Builds two reproducible public assets from 12 official CC0 1.0 CSV files
published on data.gov.lv (Enterprise Register UR, State Revenue Service VID
Public Benefit Organizations SLO register, and CFLA EU Funds 2014-2020,
2021-2027 and Recovery & Resilience Facility projects, partners & locations):
  1. public/data/charity-registry/latvia/
  2. public/data/funding-flows/latvia-eu-funds/

Pure Python 3 standard library only; byte-for-byte deterministic output.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

CAPTURED_ON = "2026-11-22"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"

FORM_LABELS: dict[str, tuple[str, str]] = {
    "BDR": ("Biedrība", "Association"),
    "NOD": ("Nodibinājums", "Foundation"),
    "ARB": ("Arodbiedrība", "Trade union"),
    "ARV": ("Arodbiedrības patstāvīgā vienība", "Trade union independent unit"),
    "ARA": ("Arodbiedrību apvienība", "Trade union federation"),
    "DRZ": ("Draudze", "Religious parish"),
    "KAT": ("Katoļu baznīcas publisko tiesību juridiskā persona", "Catholic public-law entity"),
    "ROI": ("Reliģiskās organizācijas iestāde", "Religious institution"),
    "BAZ": ("Baznīca", "Church"),
    "SAV": ("Reliģisko organizāciju savienība", "Union of religious organizations"),
    "MIS": ("Misija", "Mission"),
    "KLO": ("Klosteris", "Monastery"),
    "DIE": ("Diecēze", "Diocese"),
    "RON": ("Reliģiskās organizācijas nodaļa", "Religious organization branch"),
    "REL": ("Reliģiska organizācija (VID SLO)", "Religious organization (VID SLO only)"),
}

SLO_STATUS_MAP: dict[str, str] = {
    "Spēkā esošs": "A",
    "Atņemts": "R",
    "Organizācija likvidēta": "L",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_deterministic(raw: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    return buf.getvalue()


def write_json_gz(path: Path, rel_path: str, obj: object, row_count: int) -> dict[str, object]:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    gz = gzip_deterministic(raw)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gz)
    return {
        "path": rel_path,
        "rows": row_count,
        "bytes": len(gz),
        "decodedBytes": len(raw),
        "sha256": sha256_bytes(gz),
        "decodedSha256": sha256_bytes(raw),
    }


def write_json_file(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def clean_ws(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def norm_latvian(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value).lower()
    stripped = "".join(ch for ch in nfkd if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", stripped).strip()


def name_bucket(name: str) -> str:
    norm = norm_latvian(name)
    if not norm:
        return "other"
    first = norm[0]
    if "a" <= first <= "z":
        return first
    if "0" <= first <= "9":
        return "0-9"
    return "other"


def parse_lv_date(raw: str | None) -> str | None:
    s = clean_ws(raw)
    if not s:
        return None
    m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m2 = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2}).*", s)
    if m2:
        return f"{m2.group(1)}-{m2.group(2)}-{m2.group(3)}"
    return None


def dec_cents(raw: str | None) -> int:
    s = clean_ws(raw).replace(",", ".").replace(" ", "")
    if not s:
        return 0
    return int((Decimal(s) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def load_source_pins(repo_root: Path) -> list[dict[str, str]]:
    tsv_path = repo_root / "src" / "data" / "latvia-index-sources.tsv"
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


def build(source_dir: Path, out_root: Path, repo_root: Path) -> None:
    pins = load_source_pins(repo_root)
    sources_meta = verify_inputs(source_dir, pins)

    # 1. Read Enterprise Register (UR) nonprofits (regtype B & R)
    ur_total_rows = 0
    orgs: dict[str, dict[str, object]] = {}
    form_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()

    with (source_dir / "ur-register.csv").open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            ur_total_rows += 1
            regtype = clean_ws(r.get("regtype"))
            if regtype not in {"B", "R"}:
                continue
            rc = clean_ws(r.get("regcode"))
            if not re.fullmatch(r"\d{11}", rc):
                raise ValueError(f"Invalid 11-digit UR regcode: {rc!r}")
            ftype = clean_ws(r.get("type"))
            if ftype not in FORM_LABELS:
                raise ValueError(f"Unexpected UR nonprofit type {ftype!r} for {rc}")
            closed = clean_ws(r.get("closed"))
            status = "L" if closed == "L" else ("R" if closed == "R" else "A")
            orgs[rc] = {
                "regcode": rc,
                "name": clean_ws(r.get("name")),
                "form": ftype,
                "regtype": regtype,
                "status": status,
                "registered": parse_lv_date(r.get("registered")),
                "terminated": parse_lv_date(r.get("terminated")),
                "sloStatus": None,
                "sloSince": None,
                "sloUntil": None,
                "sloFields": [],
                "urAreas": [],
            }
            form_counts[ftype] += 1
            status_counts[status] += 1

    # 2. Read UR statutory areas of activity for associations/foundations
    ur_area_counts: Counter[str] = Counter()
    orgs_with_ur_area: set[str] = set()
    with (source_dir / "ur-areas-of-activity.csv").open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            rc = clean_ws(r.get("regcode"))
            area = clean_ws(r.get("area_of_activity"))
            if rc in orgs and area:
                areas_list = orgs[rc]["urAreas"]
                assert isinstance(areas_list, list)
                if area not in areas_list:
                    areas_list.append(area)
                orgs_with_ur_area.add(rc)
                ur_area_counts[area] += 1

    # 3. Read VID Public Benefit Organizations (SLO) register
    slo_rows_total = 0
    slo_grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    with (source_dir / "vid-slo-register.csv").open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            slo_rows_total += 1
            rc = re.sub(r"\D+", "", r.get("Registracijas_kods") or "")
            if not re.fullmatch(r"\d{11}", rc):
                raise ValueError(f"Invalid SLO regcode: {rc!r}")
            slo_grouped[rc].append(r)

    slo_status_counts: Counter[str] = Counter()
    slo_field_counts: Counter[str] = Counter()
    slo_absent_from_ur: list[dict[str, object]] = []

    for rc, rows in sorted(slo_grouped.items()):
        raw_statuses = {clean_ws(r.get("Statuss")) for r in rows}
        if len(raw_statuses) != 1:
            raise ValueError(f"Conflicting SLO statuses for {rc}: {raw_statuses}")
        raw_st = next(iter(raw_statuses))
        slo_code = SLO_STATUS_MAP[raw_st]
        slo_status_counts[slo_code] += 1

        since_dates = sorted(d for d in (parse_lv_date(r.get("Speka_no")) for r in rows) if d)
        until_dates = sorted(d for d in (parse_lv_date(r.get("Speka_lidz")) for r in rows) if d)
        fields = sorted({clean_ws(r.get("Darbibas_jomas_nosaukums")) for r in rows if clean_ws(r.get("Darbibas_jomas_nosaukums"))})
        for fld in fields:
            slo_field_counts[fld] += 1

        if rc not in orgs:
            name0 = clean_ws(rows[0].get("Organizacijas_nosaukums"))
            orgs[rc] = {
                "regcode": rc,
                "name": name0,
                "form": "REL",
                "regtype": "SLO",
                "status": "U",
                "registered": None,
                "terminated": None,
                "sloStatus": slo_code,
                "sloSince": since_dates[0] if since_dates else None,
                "sloUntil": until_dates[-1] if until_dates else None,
                "sloFields": fields,
                "urAreas": [],
            }
            form_counts["REL"] += 1
            status_counts["U"] += 1
            slo_absent_from_ur.append({
                "regcode": rc,
                "name": name0,
                "vidOrgType": clean_ws(rows[0].get("Organizacijas_veids")),
                "sloStatus": raw_st,
                "sloSince": since_dates[0] if since_dates else None,
                "sloUntil": until_dates[-1] if until_dates else None,
                "decisionCount": len(rows),
            })
        else:
            orgs[rc]["sloStatus"] = slo_code
            orgs[rc]["sloSince"] = since_dates[0] if since_dates else None
            orgs[rc]["sloUntil"] = until_dates[-1] if until_dates else None
            orgs[rc]["sloFields"] = fields

    np_codes = set(orgs.keys())

    # 4. Read CFLA EU Funds 2014-2020, 2021-2027 & RRF 2021-2026
    programs_spec = [
        (
            "EU1420",
            "EU Funds 2014–2020",
            "cfla-eu1420-projects.csv",
            "cfla-eu1420-partners.csv",
            "cfla-eu1420-locations.csv",
            "KopejaisFinansejums",
            "EsFonduLidzfinansejums",
            "NacionalaisPubliskaisFinansejums",
            "NacionalaisPrivataisFinansejums",
            "EsFonds",
            "SakumaDatums",
            "BeiguDatums",
        ),
        (
            "EU2127",
            "EU Funds 2021–2027",
            "cfla-eu2127-projects.csv",
            "cfla-eu2127-partners.csv",
            "cfla-eu2127-locations.csv",
            "ProjektaKopejasIzmaksas",
            "ProjektamPieskirtaisESFonduLidzfinansejums",
            "NacionalaisPubliskaisFinansejums",
            "NacionalaisPrivataisFinansejums",
            "Fonds",
            "ProjektaIeviesanasSakumaDatums",
            "ProjektaIeviesanasBeiguDatums",
        ),
        (
            "RRF",
            "Recovery & Resilience Facility (2021–2026)",
            "cfla-rrf-projects.csv",
            "cfla-rrf-partners.csv",
            "cfla-rrf-locations.csv",
            "KopejaisFinansejums",
            "EsFonduLidzfinansejums",
            "NacionalaisPubliskaisFinansejums",
            "NacionalaisPrivataisFinansejums",
            "EsFonds",
            "SakumaDatums",
            "BeiguDatums",
        ),
    ]

    lead_projects: list[list[object]] = []
    partner_rows_out: list[list[object]] = []
    lead_stats_by_org: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])  # count, totCents, euCents
    partner_count_by_org: Counter[str] = Counter()
    prog_summary: list[dict[str, object]] = []
    fund_summary: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"projects": 0, "totalCents": 0, "euCents": 0, "natPubCents": 0, "natPrivCents": 0})
    region_counts: Counter[str] = Counter()
    region_total_cents: Counter[str] = Counter()
    lead_status_counts: Counter[str] = Counter()
    lead_by_slo: dict[str, dict[str, int]] = defaultdict(lambda: {"projects": 0, "orgs": 0, "totalCents": 0, "euCents": 0})
    lead_orgs_by_slo: dict[str, set[str]] = defaultdict(set)
    total_cfla_all_projects = 0

    for prog_code, prog_label, p_fn, pt_fn, loc_fn, c_tot, c_eu, c_pub, c_priv, c_fund, c_start, c_end in programs_spec:
        # Load locations by project number
        locs_by_proj: dict[str, set[str]] = defaultdict(set)
        with (source_dir / loc_fn).open("r", encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                pnum = clean_ws(r.get("ProjektaNumurs"))
                reg = clean_ws(r.get("Regions"))
                if pnum and reg:
                    locs_by_proj[pnum].add(reg)

        # Load all projects in this program (need lead metadata for partner rows too)
        proj_meta: dict[str, tuple[str, str, str, int]] = {}
        prog_lead_count = 0
        prog_lead_orgs: set[str] = set()
        prog_tot = 0
        prog_eu = 0
        prog_pub = 0
        prog_priv = 0

        # Count nonprofit partners per project first
        np_partners_per_proj: Counter[str] = Counter()
        prog_partner_rows_raw: list[dict[str, str]] = []
        with (source_dir / pt_fn).open("r", encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                pt_rc = re.sub(r"\D+", "", r.get("RegNr") or "")
                if pt_rc in np_codes:
                    pnum = clean_ws(r.get("ProjektaNumurs"))
                    np_partners_per_proj[pnum] += 1
                    prog_partner_rows_raw.append(r)

        with (source_dir / p_fn).open("r", encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                total_cfla_all_projects += 1
                pnum = clean_ws(r.get("ProjektaNumurs"))
                lead_rc = re.sub(r"\D+", "", r.get("IesniedzejaRegNo") or "")
                lead_name = clean_ws(r.get("IesniedzejaNosaukums"))
                title = clean_ws(r.get("ProjektaNosaukums"))
                tot = dec_cents(r.get(c_tot))
                eu = dec_cents(r.get(c_eu))
                pub = dec_cents(r.get(c_pub))
                priv = dec_cents(r.get(c_priv))
                proj_meta[pnum] = (lead_rc, lead_name, title, tot)

                if lead_rc not in np_codes:
                    continue

                fund = clean_ws(r.get(c_fund))
                pstatus = clean_ws(r.get("ProjektaStatuss"))
                signed = parse_lv_date(r.get("LigumaNoslegsanasDatums"))
                start_d = parse_lv_date(r.get(c_start))
                end_d = parse_lv_date(r.get(c_end))
                impl_regions = sorted(locs_by_proj.get(pnum, set()))
                org_rec = orgs[lead_rc]
                slo_st = org_rec["sloStatus"]
                slo_bucket = "activeSlo" if slo_st == "A" else ("revokedOrLiquidatedSlo" if slo_st in {"R", "L"} else "nonSloNonprofit")

                lead_projects.append([
                    pnum,
                    prog_code,
                    fund,
                    pstatus,
                    lead_rc,
                    str(org_rec["name"]),
                    str(org_rec["form"]),
                    slo_st,
                    title,
                    signed,
                    start_d,
                    end_d,
                    tot,
                    eu,
                    pub,
                    priv,
                    "|".join(impl_regions),
                    np_partners_per_proj[pnum],
                ])

                prog_lead_count += 1
                prog_lead_orgs.add(lead_rc)
                prog_tot += tot
                prog_eu += eu
                prog_pub += pub
                prog_priv += priv

                lead_stats_by_org[lead_rc][0] += 1
                lead_stats_by_org[lead_rc][1] += tot
                lead_stats_by_org[lead_rc][2] += eu

                fs = fund_summary[(prog_code, fund)]
                fs["projects"] += 1
                fs["totalCents"] += tot
                fs["euCents"] += eu
                fs["natPubCents"] += pub
                fs["natPrivCents"] += priv

                lead_status_counts[pstatus] += 1
                lead_by_slo[slo_bucket]["projects"] += 1
                lead_by_slo[slo_bucket]["totalCents"] += tot
                lead_by_slo[slo_bucket]["euCents"] += eu
                lead_orgs_by_slo[slo_bucket].add(lead_rc)

                for reg in (impl_regions or ["Unspecified"]):
                    region_counts[reg] += 1
                    region_total_cents[reg] += tot

        # Record nonprofit partner participations
        prog_partner_orgs: set[str] = set()
        prog_partner_projs: set[str] = set()
        for r in prog_partner_rows_raw:
            pnum = clean_ws(r.get("ProjektaNumurs"))
            pt_rc = re.sub(r"\D+", "", r.get("RegNr") or "")
            org_rec = orgs[pt_rc]
            lead_rc, lead_name, title, tot = proj_meta.get(pnum, ("", "", "", 0))
            partner_rows_out.append([
                pnum,
                prog_code,
                pt_rc,
                str(org_rec["name"]),
                org_rec["sloStatus"],
                lead_rc,
                lead_name,
                title,
                tot,
            ])
            partner_count_by_org[pt_rc] += 1
            prog_partner_orgs.add(pt_rc)
            prog_partner_projs.add(pnum)

        prog_summary.append({
            "programCode": prog_code,
            "programLabel": prog_label,
            "leadProjects": prog_lead_count,
            "leadOrganizations": len(prog_lead_orgs),
            "totalCents": prog_tot,
            "euCents": prog_eu,
            "natPubCents": prog_pub,
            "natPrivCents": prog_priv,
            "partnerParticipations": len(prog_partner_rows_raw),
            "partnerOrganizations": len(prog_partner_orgs),
            "projectsWithNonprofitPartners": len(prog_partner_projs),
        })

    for k, s in lead_orgs_by_slo.items():
        lead_by_slo[k]["orgs"] = len(s)

    # Sort projects descending by totalCents, then projectNo
    lead_projects.sort(key=lambda r: (-int(r[12]), str(r[0])))
    partner_rows_out.sort(key=lambda r: (-int(r[8]), str(r[0]), str(r[2])))

    # Top 15 lead nonprofit recipients
    top15_lead = []
    for rc, (cnt, tot, eu) in sorted(lead_stats_by_org.items(), key=lambda kv: (-kv[1][1], kv[0]))[:15]:
        rec = orgs[rc]
        top15_lead.append({
            "regcode": rc,
            "name": rec["name"],
            "form": rec["form"],
            "sloStatus": rec["sloStatus"],
            "projects": cnt,
            "totalCents": tot,
            "euCents": eu,
        })

    # 5. Build sharded Latvia registry assets
    reg_dir = out_root / "charity-registry" / "latvia"
    names_buckets: dict[str, list[list[object]]] = defaultdict(list)
    ids_buckets: dict[str, list[list[str]]] = defaultdict(list)

    for rc in sorted(orgs.keys()):
        rec = orgs[rc]
        bkt = name_bucket(str(rec["name"]))
        l_cnt, l_tot, _ = lead_stats_by_org.get(rc, [0, 0, 0])
        p_cnt = partner_count_by_org.get(rc, 0)
        ur_areas = rec["urAreas"]
        slo_fields = rec["sloFields"]
        assert isinstance(ur_areas, list) and isinstance(slo_fields, list)
        row = [
            rc,
            rec["name"],
            rec["form"],
            rec["status"],
            rec["registered"],
            rec["terminated"],
            rec["sloStatus"],
            rec["sloSince"],
            rec["sloUntil"],
            "|".join(slo_fields) if slo_fields else None,
            ur_areas[0] if ur_areas else None,
            l_cnt,
            l_tot,
            p_cnt,
        ]
        names_buckets[bkt].append(row)
        ids_buckets[rc[:2]].append([rc, bkt])

    name_shards_meta: dict[str, dict[str, object]] = {}
    for bkt in sorted(names_buckets.keys()):
        rows = sorted(names_buckets[bkt], key=lambda r: (norm_latvian(str(r[1])), str(r[0])))
        name_shards_meta[bkt] = write_json_gz(reg_dir / "names" / f"{bkt}.json.gz", f"names/{bkt}.json.gz", rows, len(rows))

    id_shards_meta: dict[str, dict[str, object]] = {}
    for pfx in sorted(ids_buckets.keys()):
        rows = sorted(ids_buckets[pfx], key=lambda r: r[0])
        id_shards_meta[pfx] = write_json_gz(reg_dir / "ids" / f"{pfx}.json.gz", f"ids/{pfx}.json.gz", rows, len(rows))

    reg_manifest = {
        "format": "charitology.latvia-nonprofit-registry.v1",
        "capturedOn": CAPTURED_ON,
        "publisher": "Uzņēmumu reģistrs & Valsts ieņēmumu dienests (Latvia) via data.gov.lv",
        "catalogues": {
            "urRegister": "https://data.gov.lv/dati/lv/dataset/uz",
            "urAreas": "https://data.gov.lv/dati/lv/dataset/biedribu-un-nodibinajumu-darbibas-jomas",
            "vidSlo": "https://data.gov.lv/dati/lv/dataset/sabiedriska-labuma-organizacijas",
        },
        "license": LICENSE_URL,
        "licenseName": "CC0 1.0 Universal (Public Domain Dedication)",
        "sources": {k: sources_meta[k] for k in ("urRegister", "urAreas", "vidSlo")},
        "counts": {
            "urTotalEntitiesScanned": ur_total_rows,
            "includedOrganizations": len(orgs),
            "byStatus": {
                "active": status_counts["A"],
                "liquidated": status_counts["L"],
                "reorganized": status_counts["R"],
                "absentFromUr": status_counts["U"],
            },
            "byForm": dict(sorted(form_counts.items())),
            "withUrAreaOfActivity": len(orgs_with_ur_area),
            "housingManagementAssociations": ur_area_counts.get("Mājokļu apsaimniekošana", 0),
            "vidSloSourceRows": slo_rows_total,
            "vidSloDistinctOrganizations": len(slo_grouped),
            "vidSloByStatus": {
                "activeSlo": slo_status_counts["A"],
                "revokedSlo": slo_status_counts["R"],
                "liquidatedSlo": slo_status_counts["L"],
            },
            "withEuFundsLeadProject": len(lead_stats_by_org),
            "withEuFundsPartnerRole": len(partner_count_by_org),
        },
        "topUrAreas": [{"area": a, "count": c} for a, c in ur_area_counts.most_common(12)],
        "topSloFields": [{"field": a, "count": c} for a, c in slo_field_counts.most_common(12)],
        "forms": {k: {"lv": v[0], "en": v[1], "count": form_counts.get(k, 0)} for k, v in FORM_LABELS.items() if form_counts.get(k, 0) > 0},
        "fields": [
            "regcode", "name", "form", "status", "registered", "terminated",
            "sloStatus", "sloSince", "sloUntil", "sloFields", "primaryUrArea",
            "euLeadProjects", "euLeadTotalCents", "euPartnerRoles",
        ],
        "names": name_shards_meta,
        "ids": id_shards_meta,
    }
    write_json_file(reg_dir / "manifest.json", reg_manifest)

    # 6. Write Latvia EU Funds funding-flows assets
    flow_dir = out_root / "funding-flows" / "latvia-eu-funds"
    proj_asset = write_json_gz(flow_dir / "projects.json.gz", "projects.json.gz", lead_projects, len(lead_projects))
    part_asset = write_json_gz(flow_dir / "partners.json.gz", "partners.json.gz", partner_rows_out, len(partner_rows_out))

    # Write programs-summary.csv
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow([
        "program", "fund", "nonprofit_lead_projects",
        "total_eur", "eu_cofinancing_eur", "national_public_eur", "national_private_eur",
    ])
    for (pcode, fund), vals in sorted(fund_summary.items()):
        writer.writerow([
            pcode,
            fund,
            vals["projects"],
            f"{vals['totalCents'] / 100:.2f}",
            f"{vals['euCents'] / 100:.2f}",
            f"{vals['natPubCents'] / 100:.2f}",
            f"{vals['natPrivCents'] / 100:.2f}",
        ])
    (flow_dir / "programs-summary.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    anomalies = {
        "capturedOn": CAPTURED_ON,
        "sloAbsentFromEnterpriseRegister": slo_absent_from_ur,
        "nonprofitLeadBySloStatus": dict(lead_by_slo),
        "doubleCountingGuard": (
            "Cooperation-partner participations (260 nonprofit rows across 79 projects) are stored in partners.json.gz "
            "and never added to lead-beneficiary EUR totals (EUR 233,473,700.90 across 292 nonprofit-led projects) "
            "because CFLA publishes project budgets at the lead-beneficiary level rather than per partner."
        ),
        "implementationRegionNote": (
            "Multi-region projects appear once per listed implementation region in regional project counts; "
            "summing regional project totals double-counts multi-region projects, so national totals come strictly from the 292 distinct projects."
        ),
    }
    write_json_file(flow_dir / "anomalies.json", anomalies)

    total_lead_cents = sum(int(r[12]) for r in lead_projects)
    total_eu_cents = sum(int(r[13]) for r in lead_projects)
    total_pub_cents = sum(int(r[14]) for r in lead_projects)
    total_priv_cents = sum(int(r[15]) for r in lead_projects)

    flow_manifest = {
        "format": "charitology.latvia-eu-funds.v1",
        "capturedOn": CAPTURED_ON,
        "publisher": "Centrālā finanšu un līgumu aģentūra (CFLA) via data.gov.lv",
        "catalogues": {
            "eu1420": "https://data.gov.lv/dati/lv/dataset/es-lidzfinansetie-projekti",
            "eu2127": "https://data.gov.lv/dati/lv/dataset/eiropas-savienibas-fondu-21-27-perioda-lidzfinansetie-projekti",
            "rrf": "https://data.gov.lv/dati/lv/dataset/eiropas-savienibas-atveselosanas-fonda-lidzfinansetie-projekti",
        },
        "license": LICENSE_URL,
        "licenseName": "CC0 1.0 Universal (Public Domain Dedication)",
        "sources": {k: v for k, v in sources_meta.items() if k.startswith("cfla")},
        "counts": {
            "allCflaProjectsScanned": total_cfla_all_projects,
            "nonprofitLeadProjects": len(lead_projects),
            "distinctLeadNonprofits": len(lead_stats_by_org),
            "completedLeadProjects": lead_status_counts.get("Pabeigts", 0),
            "activeContractLeadProjects": lead_status_counts.get("Līgums", 0),
            "totalLeadCents": total_lead_cents,
            "euCofinancingCents": total_eu_cents,
            "nationalPublicCents": total_pub_cents,
            "nationalPrivateCents": total_priv_cents,
            "nonprofitPartnerParticipations": len(partner_rows_out),
            "distinctPartnerNonprofits": len(partner_count_by_org),
        },
        "byProgram": prog_summary,
        "bySloStatus": dict(lead_by_slo),
        "byImplementationRegion": [
            {"region": reg, "projects": cnt, "sumOfLeadProjectTotalsCents": region_total_cents[reg]}
            for reg, cnt in region_counts.most_common()
        ],
        "topLeadRecipients": top15_lead,
        "projectFields": [
            "projectNo", "program", "fund", "status", "regcode", "orgName", "form", "sloStatus",
            "title", "signedDate", "startDate", "endDate", "totalCents", "euCents",
            "natPubCents", "natPrivCents", "implRegions", "nonprofitPartnerCount",
        ],
        "partnerFields": [
            "projectNo", "program", "partnerRegcode", "partnerName", "partnerSloStatus",
            "leadRegcode", "leadName", "projectTitle", "projectTotalCents",
        ],
        "projectsAsset": proj_asset,
        "partnersAsset": part_asset,
    }
    write_json_file(flow_dir / "manifest.json", flow_manifest)

    print(
        f"Latvia built: {len(orgs):,} nonprofits ({slo_status_counts['A']:,} active SLO, "
        f"{slo_status_counts['R']:,} revoked SLO) + {len(lead_projects):,} nonprofit-led EU projects "
        f"(EUR {total_lead_cents / 100:,.2f} total, EUR {total_eu_cents / 100:,.2f} EU co-financing; "
        f"{len(partner_rows_out):,} partner roles)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Charitology Latvia Global Charity Index edition")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--out-root", type=Path, required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    build(args.source_dir, args.out_root, repo_root)


if __name__ == "__main__":
    main()
