#!/usr/bin/env python3
"""
Deterministic stdlib-only builder for Estonia (Jurisdiction #18):
  1. public/data/charity-registry/estonia/   (RIK nonprofits + EMTA TMNSN + 2023-2025 XBRL financials)
  2. public/data/funding-flows/estonia-eu-funds/ (RTK EU Cohesion, JTF, RRF & EEA/Norway projects)

Usage:
  python3 scripts/build-estonia-charity-index.py <input-dir> <output-public-data-dir>

All 8 pinned inputs are verified by SHA-256 against src/data/estonia-index-sources.tsv.
Zero personal data, zero street addresses, zero fabricated fields; null stays distinct from 0.
"""
from __future__ import annotations

import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CAPTURED_ON = "2026-11-22"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

FORM_MAP = {
    "Mittetulundusühing": ("MTU", "Mittetulundusühing (Nonprofit Association)"),
    "Sihtasutus": ("SA", "Sihtasutus (Foundation)"),
    "Ametiühing": ("AU", "Ametiühing (Trade Union)"),
}

STATUS_MAP = {
    "R": "active",
    "L": "liquidation",
    "N": "bankrupt",
}

ESTONIAN_COUNTIES = [
    "Harju maakond",
    "Tartu maakond",
    "Ida-Viru maakond",
    "Pärnu maakond",
    "Lääne-Viru maakond",
    "Viljandi maakond",
    "Rapla maakond",
    "Võru maakond",
    "Saare maakond",
    "Jõgeva maakond",
    "Järva maakond",
    "Valga maakond",
    "Põlva maakond",
    "Lääne maakond",
    "Hiiu maakond",
]


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


def fold_estonian(text: str) -> str:
    s = unicodedata.normalize("NFKD", text.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def name_shard_key(name: str) -> str:
    folded = fold_estonian(name)
    if not folded:
        return "0-9"
    ch = folded[0]
    if "a" <= ch <= "z":
        return ch
    return "0-9"


def parse_dmy(s: str) -> str | None:
    s = (s or "").strip()
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{y:04d}-{mo:02d}-{d:02d}"


def parse_excel_date(val: str) -> str | None:
    s = (val or "").strip()
    if not s:
        return None
    iso = parse_dmy(s)
    if iso:
        return iso
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    try:
        serial = int(float(s))
        if 20000 <= serial <= 80000:
            base = dt.date(1899, 12, 30) + dt.timedelta(days=serial)
            return base.isoformat()
    except ValueError:
        pass
    return None


def parse_cents(val: str) -> int | None:
    s = (val or "").strip().replace(" ", "").replace("\u00a0", "").replace(",", ".")
    if not s:
        return None
    try:
        dec = Decimal(s)
        return int((dec * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return None


def parse_eur_int(val: str) -> int | None:
    s = (val or "").strip().replace(" ", "").replace("\u00a0", "").replace(",", ".")
    if not s:
        return None
    try:
        dec = Decimal(s)
        return int(dec.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return None


def extract_county(ehak_text: str) -> str:
    s = (ehak_text or "").strip()
    for county in ESTONIAN_COUNTIES:
        if county.lower() in s.lower():
            return county
    if not s:
        return ""
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return parts[-1] if parts else ""


def extract_pdf_text(pdf_path: pathlib.Path) -> str:
    txt_sibling = pdf_path.with_suffix(".txt")
    swift_code = (
        "import Foundation; import PDFKit; "
        "let url = URL(fileURLWithPath: CommandLine.arguments[1]); "
        "guard let doc = PDFDocument(url: url) else { exit(1) }; "
        "for i in 0..<doc.pageCount { if let s = doc.page(at: i)?.string { print(s) } }"
    )
    try:
        out = subprocess.check_output(
            ["swift", "-e", swift_code, str(pdf_path)],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        if out.strip():
            return out
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    if txt_sibling.exists():
        return txt_sibling.read_text(encoding="utf-8")
    raise RuntimeError(f"Cannot extract PDF text for {pdf_path} (need macOS swift/PDFKit or sibling .txt)")


def parse_emta_active(text: str) -> dict[str, dict]:
    """Parse active EMTA TMNSN list: returns regcode -> {name, since, county}."""
    results: dict[str, dict] = {}
    for line in text.splitlines():
        line_clean = re.sub(r"\s+", " ", line).strip()
        m = re.search(r"^(.*?)\s+([89]\d{7})\s+(\d{2}\.\d{2}\.\d{4})(?:\s+(.*))?$", line_clean)
        if not m:
            continue
        raw_name = m.group(1).strip()
        code = m.group(2)
        since = parse_dmy(m.group(3)) or m.group(3)
        tail = (m.group(4) or "").strip()
        county = extract_county(tail)
        results[code] = {
            "name": raw_name,
            "since": since,
            "county": county,
        }
    return results


def parse_emta_removed(text: str) -> dict[str, dict]:
    """Parse 2025 removed EMTA TMNSN list: returns regcode -> {name, since, removed}."""
    results: dict[str, dict] = {}
    for line in text.splitlines():
        line_clean = re.sub(r"\s+", " ", line).strip()
        m = re.search(r"^(.*?)\s+(\d{8})\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})$", line_clean)
        if not m:
            continue
        results[m.group(2)] = {
            "name": m.group(1).strip(),
            "since": parse_dmy(m.group(3)) or m.group(3),
            "removed": parse_dmy(m.group(4)) or m.group(4),
        }
    return results


def read_rtk_xlsx(zip_path: pathlib.Path) -> list[list[str]]:
    outer = zipfile.ZipFile(zip_path)
    target_xlsx = [n for n in outer.namelist() if "31.08.2026" in n][0]
    zf = zipfile.ZipFile(io.BytesIO(outer.read(target_xlsx)))
    shared: list[str] = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    s0 = wb.findall(".//m:sheet", NS)[0]
    rid = s0.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
    rels = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))}
    target = "xl/" + rels[rid].lstrip("/")
    if target.startswith("xl/xl/"):
        target = target[3:]
    rows: list[list[str]] = []
    with zf.open(target) as sf:
        for _, elem in ET.iterparse(sf, events=("end",)):
            if elem.tag == "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row":
                row: list[str] = []
                for c in elem:
                    ref = c.attrib.get("r", "")
                    m = re.match(r"([A-Z]+)", ref)
                    col_idx = 0
                    if m:
                        for ch in m.group(1):
                            col_idx = col_idx * 26 + (ord(ch) - 64)
                        col_idx -= 1
                    while len(row) <= col_idx:
                        row.append("")
                    t = c.attrib.get("t", "")
                    v = c.find("m:v", NS)
                    if t == "s" and v is not None:
                        row[col_idx] = shared[int(v.text)]
                    elif t == "inlineStr":
                        row[col_idx] = "".join(x.text or "" for x in c.findall(".//m:t", NS))
                    elif v is not None:
                        row[col_idx] = v.text or ""
                rows.append(row)
                elem.clear()
    return rows


def verify_sources(in_dir: pathlib.Path, repo_root: pathlib.Path) -> list[dict]:
    tsv_path = repo_root / "src" / "data" / "estonia-index-sources.tsv"
    sources: list[dict] = []
    with tsv_path.open("r", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            p = in_dir / row["local_filename"]
            if not p.exists():
                raise FileNotFoundError(f"Missing pinned input: {p}")
            actual_bytes = p.stat().st_size
            actual_sha = sha256_file(p)
            if actual_bytes != int(row["bytes"]) or actual_sha != row["sha256"]:
                raise ValueError(
                    f"Hash/size mismatch for {p.name}: got {actual_bytes}/{actual_sha}, "
                    f"expected {row['bytes']}/{row['sha256']}"
                )
            sources.append(row)
    return sources


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: build-estonia-charity-index.py <input-dir> <output-public-data-dir>", file=sys.stderr)
        sys.exit(2)

    in_dir = pathlib.Path(sys.argv[1]).resolve()
    out_data = pathlib.Path(sys.argv[2]).resolve()
    repo_root = pathlib.Path(__file__).resolve().parent.parent

    sources = verify_sources(in_dir, repo_root)

    # 1. Parse EMTA Tax-Incentive Charity Lists (active + 2025 removed)
    emta_active = parse_emta_active(extract_pdf_text(in_dir / "emta-tmnsn-active.pdf"))
    emta_removed = parse_emta_removed(extract_pdf_text(in_dir / "emta-tmnsn-removed.pdf"))

    # 2. Load RIK lihtandmed (nonprofits: Mittetulundusühing, Sihtasutus, Ametiühing; count excluded Korteriühistu)
    orgs: dict[str, dict] = {}
    rik_total_scanned = 0
    rik_ku_excluded = 0
    by_form_counts = Counter()
    by_subform_counts = Counter()
    by_status_counts = Counter()
    by_county_counts = Counter()

    with zipfile.ZipFile(in_dir / "rik-lihtandmed.csv.zip") as zf:
        with zf.open(zf.namelist()[0]) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace"), delimiter=";")
            for row in reader:
                rik_total_scanned += 1
                lf = (row.get("ettevotja_oiguslik_vorm") or "").strip()
                if lf == "Korteriühistu":
                    rik_ku_excluded += 1
                    continue
                if lf not in FORM_MAP:
                    continue
                code = (row.get("ariregistri_kood") or "").strip()
                if not re.match(r"^\d{8}$", code):
                    continue
                form_code, _ = FORM_MAP[lf]
                subform = (row.get("ettevotja_oigusliku_vormi_alaliik") or "").strip()
                raw_status = (row.get("ettevotja_staatus") or "").strip()
                status = STATUS_MAP.get(raw_status, "active")
                reg_date = parse_dmy(row.get("ettevotja_esmakande_kpv") or "")
                county = extract_county(row.get("asukoha_ehak_tekstina") or "")
                name = (row.get("nimi") or "").strip()

                tmnsn_status = "none"
                tmnsn_since = None
                tmnsn_removed = None
                if code in emta_active:
                    tmnsn_status = "active"
                    tmnsn_since = emta_active[code]["since"]
                elif code in emta_removed:
                    tmnsn_status = "removed_2025"
                    tmnsn_since = emta_removed[code]["since"]
                    tmnsn_removed = emta_removed[code]["removed"]

                orgs[code] = {
                    "reg": code,
                    "name": name,
                    "form": form_code,
                    "subform": subform,
                    "status": status,
                    "regDate": reg_date,
                    "county": county,
                    "tmnsn": tmnsn_status,
                    "tmnsnSince": tmnsn_since,
                    "tmnsnRemoved": tmnsn_removed,
                    "fin": [],
                    "euCount": 0,
                    "euBudgetCents": 0,
                    "euGrantCents": 0,
                    "euPaidCents": 0,
                }
                by_form_counts[form_code] += 1
                if subform:
                    by_subform_counts[subform] += 1
                by_status_counts[status] += 1
                if county:
                    by_county_counts[county] += 1

    # Add EMTA active tax-incentive charities absent from active RIK snapshot (cross-register anomaly)
    emta_only_anomalies = []
    for code, info in sorted(emta_active.items()):
        if code in orgs:
            continue
        form_code = "SA" if code.startswith("9") else "MTU"
        orgs[code] = {
            "reg": code,
            "name": info["name"],
            "form": form_code,
            "subform": "",
            "status": "absent_from_rik",
            "regDate": None,
            "county": info["county"],
            "tmnsn": "active",
            "tmnsnSince": info["since"],
            "tmnsnRemoved": None,
            "fin": [],
            "euCount": 0,
            "euBudgetCents": 0,
            "euGrantCents": 0,
            "euPaidCents": 0,
        }
        by_form_counts[form_code] += 1
        by_status_counts["absent_from_rik"] += 1
        if info["county"]:
            by_county_counts[info["county"]] += 1
        emta_only_anomalies.append({
            "reg": code,
            "name": info["name"],
            "tmnsnSince": info["since"],
            "county": info["county"],
            "note": "Listed on EMTA 2026-11-01 active income-tax-incentive list (TMNSN) but absent from 2026-11-22 RIK active/liquidating/bankrupt snapshot.",
        })

    # 3. Parse RIK Annual Report Metadata (2023, 2024, 2025) for our nonprofits
    # Keep latest filed non-consolidated report per (reg, year) if multiple exist (or consolidated if only consolidated).
    rep_meta: dict[str, dict] = {}
    org_year_rids: dict[tuple[str, int], list[dict]] = defaultdict(list)

    with zipfile.ZipFile(in_dir / "rik-aruannete-yldandmed.zip") as zf:
        with zf.open(zf.namelist()[0]) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace"), delimiter=";")
            for row in reader:
                reg = (row.get("registrikood") or "").strip()
                if reg not in orgs:
                    continue
                yr_str = (row.get("aruandeaasta") or "").strip()
                if yr_str not in ("2023", "2024", "2025"):
                    continue
                yr = int(yr_str)
                rid = (row.get("report_id") or "").strip()
                if not rid:
                    continue
                cons = (row.get("kas konsolideeritud?") or "").strip().lower() == "jah"
                audited = (row.get("kas auditeeritud?") or "").strip().lower() == "jah"
                opinion = (row.get("audiitori otsuse tüüp") or "").strip()
                filed = parse_dmy(row.get("esitatud_kpv") or "") or ""
                meta = {
                    "rid": rid,
                    "reg": reg,
                    "year": yr,
                    "cons": cons,
                    "audited": audited,
                    "opinion": opinion,
                    "filed": filed,
                }
                org_year_rids[(reg, yr)].append(meta)

    selected_rids: dict[str, dict] = {}
    for (reg, yr), candidates in org_year_rids.items():
        # Prefer non-consolidated (standalone) first, then latest filing date, then highest report_id
        candidates.sort(key=lambda m: (1 if not m["cons"] else 0, m["filed"], int(m["rid"]) if m["rid"].isdigit() else 0))
        chosen = candidates[-1]
        selected_rids[chosen["rid"]] = chosen

    # 4. Stream XBRL financial elements for 2023, 2024, 2025
    # Map element names carefully keeping Bilanss / Tulemiaruanne / Lisa: Tööjõukulud distinct
    fin_vals: dict[str, dict[str, int | float | None]] = {
        rid: {
            "rev": None,
            "biz": None,
            "surplus": None,
            "assets": None,
            "netAssets": None,
            "cash": None,
            "labor": None,
            "fte": None,
        }
        for rid in selected_rids
    }

    for yr_fn in ["rik-elemendid-2023.zip", "rik-elemendid-2024.zip", "rik-elemendid-2025.zip"]:
        with zipfile.ZipFile(in_dir / yr_fn) as zf:
            with zf.open(zf.namelist()[0]) as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace"), delimiter=";")
                for row in reader:
                    rid = (row.get("report_id") or "").strip()
                    if rid not in fin_vals:
                        continue
                    tabel = (row.get("tabel") or "").strip()
                    el = (row.get("elemendi_nimetus") or "").strip()
                    val_str = (row.get("vaartus") or "").strip()
                    if not val_str:
                        continue
                    slot = fin_vals[rid]
                    if tabel == "Tulemiaruanne":
                        if el == "TotalRevenue" and slot["rev"] is None:
                            slot["rev"] = parse_eur_int(val_str)
                        elif el == "BusinessIncome" and slot["biz"] is None:
                            slot["biz"] = parse_eur_int(val_str)
                        elif el == "NetSurplusDeficitForPeriod" and slot["surplus"] is None:
                            slot["surplus"] = parse_eur_int(val_str)
                        elif el == "EmployeeExpense" and slot["labor"] is None:
                            slot["labor"] = parse_eur_int(val_str)
                    elif tabel == "Bilanss":
                        if el == "Assets" and slot["assets"] is None:
                            slot["assets"] = parse_eur_int(val_str)
                        elif el == "NetAssets" and slot["netAssets"] is None:
                            slot["netAssets"] = parse_eur_int(val_str)
                        elif el == "CashAndCashEquivalents" and slot["cash"] is None:
                            slot["cash"] = parse_eur_int(val_str)
                    elif tabel == "Lisa: Tööjõukulud":
                        if el == "LaborExpense" and slot["labor"] is None:
                            slot["labor"] = parse_eur_int(val_str)
                        elif el == "AverageNumberOfEmployeesInFullTimeEquivalentUnits" and slot["fte"] is None:
                            slot["fte"] = parse_eur_int(val_str)

    fin_reports_by_year = Counter()
    audited_reports_by_year = Counter()
    orgs_with_fin = set()
    orgs_with_2024_fin = set()
    orgs_with_2025_fin = set()
    total_2024_rev_eur = 0
    total_2025_rev_eur = 0
    total_2024_assets_eur = 0
    total_2025_assets_eur = 0

    for rid, meta in selected_rids.items():
        vals = fin_vals[rid]
        # Only attach if at least one structured XBRL numeric field was reported
        if all(vals[k] is None for k in ("rev", "biz", "surplus", "assets", "netAssets", "cash", "labor", "fte")):
            continue
        rec = {
            "y": meta["year"],
            "rev": vals["rev"],
            "biz": vals["biz"],
            "surplus": vals["surplus"],
            "assets": vals["assets"],
            "netAssets": vals["netAssets"],
            "cash": vals["cash"],
            "labor": vals["labor"],
            "fte": vals["fte"],
            "audited": meta["audited"],
            "cons": meta["cons"],
        }
        if meta["opinion"]:
            rec["opinion"] = meta["opinion"]
        if meta["filed"]:
            rec["filed"] = meta["filed"]
        orgs[meta["reg"]]["fin"].append(rec)
        orgs_with_fin.add(meta["reg"])
        fin_reports_by_year[str(meta["year"])] += 1
        if meta["audited"]:
            audited_reports_by_year[str(meta["year"])] += 1
        if meta["year"] == 2024:
            orgs_with_2024_fin.add(meta["reg"])
            if vals["rev"] is not None:
                total_2024_rev_eur += vals["rev"]
            if vals["assets"] is not None:
                total_2024_assets_eur += vals["assets"]
        elif meta["year"] == 2025:
            orgs_with_2025_fin.add(meta["reg"])
            if vals["rev"] is not None:
                total_2025_rev_eur += vals["rev"]
            if vals["assets"] is not None:
                total_2025_assets_eur += vals["assets"]

    for o in orgs.values():
        o["fin"].sort(key=lambda r: r["y"], reverse=True)

    # 5. Parse RTK EU Structural Funds, JTF, RRF & EEA/Norway Projects
    rtk_rows = read_rtk_xlsx(in_dir / "rtk-toetatud-projektid.zip")
    projects: list[dict] = []
    rtk_total_scanned = 0
    unmatched_89_codes: dict[str, dict] = {}
    by_period = defaultdict(lambda: {"projects": 0, "budgetCents": 0, "grantCents": 0, "paidCents": 0})
    by_fund = defaultdict(lambda: {"projects": 0, "budgetCents": 0, "grantCents": 0, "paidCents": 0})
    by_region = defaultdict(lambda: {"projects": 0, "budgetCents": 0, "grantCents": 0, "paidCents": 0})
    by_sector = defaultdict(lambda: {"projects": 0, "budgetCents": 0, "grantCents": 0, "paidCents": 0})
    by_status_proj = Counter()
    by_tmnsn_form = defaultdict(lambda: {"projects": 0, "orgs": set(), "budgetCents": 0, "grantCents": 0, "paidCents": 0})

    for r in rtk_rows[4:]:
        if len(r) <= 14 or not (r[14] or "").strip():
            continue
        rtk_total_scanned += 1
        code = re.sub(r"\D", "", r[14].strip())
        if code not in orgs:
            if len(code) == 8 and code[0] in ("8", "9"):
                entry = unmatched_89_codes.setdefault(code, {"reg": code, "name": (r[13] or "").strip(), "projects": 0, "budgetCents": 0})
                entry["projects"] += 1
                entry["budgetCents"] += parse_cents(r[22] if len(r) > 22 else "") or 0
            continue

        o = orgs[code]
        period = (r[0] or "").strip()
        fund = (r[1] or "").strip()
        measure = (r[6] or "").strip()
        region = (r[10] or "").strip()
        proj_num = (r[11] or "").strip()
        proj_name = (r[12] or "").strip()
        start_dt = parse_excel_date(r[17] if len(r) > 17 else "")
        end_dt = parse_excel_date(r[18] if len(r) > 18 else "")
        p_status = (r[19] or "").strip()
        sector = (r[20] or "").strip()
        budget_c = parse_cents(r[22] if len(r) > 22 else "") or 0
        grant_c = parse_cents(r[23] if len(r) > 23 else "") or 0
        paid_c = parse_cents(r[29] if len(r) > 29 else "") or 0
        paid_ext_c = parse_cents(r[30] if len(r) > 30 else "") or 0

        o["euCount"] += 1
        o["euBudgetCents"] += budget_c
        o["euGrantCents"] += grant_c
        o["euPaidCents"] += paid_c

        projects.append({
            "num": proj_num,
            "title": proj_name,
            "reg": code,
            "org": o["name"],
            "form": o["form"],
            "tmnsn": o["tmnsn"],
            "period": period,
            "fund": fund,
            "measure": measure,
            "region": region,
            "sector": sector,
            "status": p_status,
            "start": start_dt,
            "end": end_dt,
            "budgetCents": budget_c,
            "grantCents": grant_c,
            "paidCents": paid_c,
            "paidExtCents": paid_ext_c,
        })

        for bucket, key in ((by_period, period), (by_fund, fund), (by_region, region or "Unspecified"), (by_sector, sector or "Unspecified")):
            bucket[key]["projects"] += 1
            bucket[key]["budgetCents"] += budget_c
            bucket[key]["grantCents"] += grant_c
            bucket[key]["paidCents"] += paid_c
        by_status_proj[p_status] += 1

        tf_key = f"{o['tmnsn']}|{o['form']}"
        by_tmnsn_form[tf_key]["projects"] += 1
        by_tmnsn_form[tf_key]["orgs"].add(code)
        by_tmnsn_form[tf_key]["budgetCents"] += budget_c
        by_tmnsn_form[tf_key]["grantCents"] += grant_c
        by_tmnsn_form[tf_key]["paidCents"] += paid_c

    projects.sort(key=lambda p: (-p["budgetCents"], p["num"], p["reg"]))

    # 6. Write Registry Shards (`public/data/charity-registry/estonia/`)
    reg_out = out_data / "charity-registry" / "estonia"
    name_buckets: dict[str, list[dict]] = defaultdict(list)
    id_buckets: dict[str, list[dict]] = defaultdict(list)

    all_orgs_sorted = sorted(orgs.values(), key=lambda o: (fold_estonian(o["name"]), o["reg"]))
    for o in all_orgs_sorted:
        name_buckets[name_shard_key(o["name"])].append(o)
        id_buckets[o["reg"][:2]].append(o)

    name_shards_meta = {}
    for key in sorted(name_buckets):
        rows_sorted = name_buckets[key]
        info = write_gz_json(reg_out / "names" / f"{key}.json.gz", rows_sorted)
        name_shards_meta[key] = {"path": f"names/{key}.json.gz", "rows": len(rows_sorted), **info}

    id_shards_meta = {}
    for key in sorted(id_buckets):
        rows_sorted = sorted(id_buckets[key], key=lambda o: o["reg"])
        info = write_gz_json(reg_out / "ids" / f"{key}.json.gz", rows_sorted)
        id_shards_meta[key] = {"path": f"ids/{key}.json.gz", "rows": len(rows_sorted), **info}

    tmnsn_counts = Counter(o["tmnsn"] for o in all_orgs_sorted)
    orgs_with_eu = sum(1 for o in all_orgs_sorted if o["euCount"] > 0)
    religious_subforms = {"kogudus", "kirik", "koguduste liit", "klooster", "välislepingu alusel tegutseva kiriku institutsioon", "Usuühing"}
    religious_count = sum(1 for o in all_orgs_sorted if o["subform"] in religious_subforms)

    reg_manifest = {
        "format": "charitology-estonia-registry-v1",
        "jurisdiction": "Estonia",
        "capturedOn": CAPTURED_ON,
        "publisher": "Centre of Registers and Information Systems (RIK) and Estonian Tax and Customs Board (EMTA)",
        "catalogues": {
            "rik": "https://avaandmed.ariregister.rik.ee/en/downloading-open-data",
            "emtaTmnsn": "https://andmed.eesti.ee/et/datasets/tulumaksusoodustusega-uhingute-nimekiri",
            "rtk": "https://rtk.ee/toetusfondid-ja-programmid/euroopa-liidu-valisvahendid/toetatud-projektid",
        },
        "currency": "EUR",
        "counts": {
            "rikTotalEntitiesScanned": rik_total_scanned,
            "rikApartmentAssociationsExcluded": rik_ku_excluded,
            "includedOrganizations": len(all_orgs_sorted),
            "byForm": dict(sorted(by_form_counts.items())),
            "byStatus": dict(sorted(by_status_counts.items())),
            "byTmnsn": {
                "active": tmnsn_counts["active"],
                "removed2025": tmnsn_counts["removed_2025"],
                "none": tmnsn_counts["none"],
            },
            "emtaActiveAbsentFromRik": len(emta_only_anomalies),
            "religiousOrganizationsTaggedBySubform": religious_count,
            "withFinancialReports2023to2025": len(orgs_with_fin),
            "with2024FinancialReport": len(orgs_with_2024_fin),
            "with2025FinancialReport": len(orgs_with_2025_fin),
            "financialReportsByYear": dict(sorted(fin_reports_by_year.items())),
            "auditedReportsByYear": dict(sorted(audited_reports_by_year.items())),
            "total2024ReportedRevenueEUR": total_2024_rev_eur,
            "total2025ReportedRevenueEUR": total_2025_rev_eur,
            "total2024ReportedAssetsEUR": total_2024_assets_eur,
            "total2025ReportedAssetsEUR": total_2025_assets_eur,
            "withEuEeaProjects": orgs_with_eu,
            "topCounties": dict(by_county_counts.most_common(15)),
        },
        "sources": sources,
        "shards": {
            "names": name_shards_meta,
            "ids": id_shards_meta,
        },
    }
    (reg_out / "manifest.json").write_text(
        json.dumps(reg_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    # 7. Write Funding Flows Artifacts (`public/data/funding-flows/estonia-eu-funds/`)
    ff_out = out_data / "funding-flows" / "estonia-eu-funds"
    ff_out.mkdir(parents=True, exist_ok=True)
    proj_gz = write_gz_json(ff_out / "projects.json.gz", projects)

    total_budget_c = sum(p["budgetCents"] for p in projects)
    total_grant_c = sum(p["grantCents"] for p in projects)
    total_paid_c = sum(p["paidCents"] for p in projects)
    total_paid_ext_c = sum(p["paidExtCents"] for p in projects)

    # Top 15 recipients by total project budget
    top15_orgs = sorted(
        [o for o in all_orgs_sorted if o["euCount"] > 0],
        key=lambda o: (-o["euBudgetCents"], o["reg"]),
    )[:15]
    top15 = [
        {
            "reg": o["reg"],
            "name": o["name"],
            "form": o["form"],
            "tmnsn": o["tmnsn"],
            "county": o["county"],
            "projects": o["euCount"],
            "budgetCents": o["euBudgetCents"],
            "grantCents": o["euGrantCents"],
            "paidCents": o["euPaidCents"],
        }
        for o in top15_orgs
    ]

    # Write programs-summary.csv
    csv_buf = io.StringIO()
    w = csv.writer(csv_buf)
    w.writerow(["fund", "projects", "total_budget_eur", "eu_eea_grant_eur", "total_paid_eur"])
    for fund, stats in sorted(by_fund.items(), key=lambda kv: -kv[1]["budgetCents"]):
        w.writerow([
            fund,
            stats["projects"],
            f"{stats['budgetCents'] / 100:.2f}",
            f"{stats['grantCents'] / 100:.2f}",
            f"{stats['paidCents'] / 100:.2f}",
        ])
    (ff_out / "programs-summary.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    anomalies = {
        "capturedOn": CAPTURED_ON,
        "emtaActiveAbsentFromRik": {
            "count": len(emta_only_anomalies),
            "note": "Thirteen organizations listed on EMTA's 2026-11-01 active income-tax-incentive charity list (TMNSN) did not appear in RIK's 2026-11-22 active/liquidating/bankrupt entity export (likely struck off or dissolved in the intervening weeks). All 13 are preserved in the registry with status 'absent_from_rik'.",
            "records": emta_only_anomalies,
        },
        "unmatchedRtkNonprofitPrefixCodes": {
            "distinctCodes": len(unmatched_89_codes),
            "totalProjects": sum(v["projects"] for v in unmatched_89_codes.values()),
            "totalBudgetCents": sum(v["budgetCents"] for v in unmatched_89_codes.values()),
            "note": "RTK project recipients with 8-digit codes starting in 8 or 9 that are not in the active MTÜ/SA/AÜ set are primarily Korteriühistu (apartment associations receiving KredEx building-renovation grants) or previously dissolved entities. They are excluded from the charity/nonprofit funding totals.",
            "topExamples": sorted(unmatched_89_codes.values(), key=lambda x: -x["budgetCents"])[:10],
        },
        "stateFoundationConcentration": {
            "note": "Non-TMNSN Sihtasutus (foundations) — primarily state innovation agencies (e.g., Enterprise Estonia / KredEx) and public regional hospitals organized as foundations — account for over 80% of nonprofit-form EU/EEA project budgets in Estonia, whereas active tax-incentive MTÜ grassroots charities receive 1.3%. Legal form alone does not distinguish state agencies from charities.",
        },
    }
    (ff_out / "anomalies.json").write_text(
        json.dumps(anomalies, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    tmnsn_form_serialized = {
        k: {
            "projects": v["projects"],
            "distinctOrgs": len(v["orgs"]),
            "budgetCents": v["budgetCents"],
            "grantCents": v["grantCents"],
            "paidCents": v["paidCents"],
        }
        for k, v in sorted(by_tmnsn_form.items())
    }

    ff_manifest = {
        "format": "charitology-estonia-eu-funds-v1",
        "jurisdiction": "Estonia",
        "capturedOn": CAPTURED_ON,
        "asOf": "2026-08-31",
        "publisher": "State Shared Service Centre of Estonia (RTK — Riigi Tugiteenuste Keskus)",
        "catalogue": "https://rtk.ee/toetusfondid-ja-programmid/euroopa-liidu-valisvahendid/toetatud-projektid",
        "currency": "EUR",
        "counts": {
            "allRtkRowsScanned": rtk_total_scanned,
            "nonprofitProjects": len(projects),
            "distinctNonprofitRecipients": orgs_with_eu,
            "completedProjects": by_status_proj["Lõpetatud"],
            "activeProjects": by_status_proj["Rahastatud"],
            "totalBudgetCents": total_budget_c,
            "totalGrantCents": total_grant_c,
            "totalPaidCents": total_paid_c,
            "totalPaidExternalCents": total_paid_ext_c,
            "byPeriod": dict(sorted(by_period.items())),
            "byFund": dict(sorted(by_fund.items())),
            "byRegion": dict(sorted(by_region.items(), key=lambda kv: -kv[1]["budgetCents"])),
            "bySector": dict(sorted(by_sector.items(), key=lambda kv: -kv[1]["budgetCents"])),
            "byTmnsnAndForm": tmnsn_form_serialized,
        },
        "topRecipients": top15,
        "artifacts": {
            "projects": {"path": "projects.json.gz", "rows": len(projects), **proj_gz},
            "programsSummaryCsv": "programs-summary.csv",
            "anomaliesJson": "anomalies.json",
        },
    }
    (ff_out / "manifest.json").write_text(
        json.dumps(ff_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(
        f"Built Estonia release: {len(all_orgs_sorted):,} nonprofits "
        f"({tmnsn_counts['active']:,} active TMNSN, {tmnsn_counts['removed_2025']} removed 2025, "
        f"{len(emta_only_anomalies)} EMTA-only; {len(orgs_with_fin):,} with 2023-2025 XBRL financials) + "
        f"{len(projects):,} EU/EEA projects across {orgs_with_eu:,} nonprofits "
        f"(EUR {total_budget_c / 100:,.2f} budget / EUR {total_grant_c / 100:,.2f} EU+EEA grant / EUR {total_paid_c / 100:,.2f} paid)."
    )


if __name__ == "__main__":
    main()
