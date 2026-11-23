#!/usr/bin/env python3
"""
Deterministic stdlib-only builder for Czechia (Jurisdiction #19):
  1. public/data/charity-registry/czechia/    (Ministry of Justice Public Registers 2026: 6 nonprofit forms across 7 courts)
  2. public/data/funding-flows/czechia-eu-funds/ (Ministry for Regional Development DotaceEU 2021-2027 List of Operations)

Usage:
  python3 scripts/build-czechia-charity-index.py <input-dir> <output-public-data-dir>

All 43 pinned inputs are verified by SHA-256 against src/data/czechia-index-sources.tsv.
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
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CAPTURED_ON = "2026-11-22"
EU_AS_OF = "2026-11-01"
XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

FORM_LABELS = {
    "spolek": "Spolek (Association)",
    "pobspolek": "Pobočný spolek (Branch Association)",
    "nad": "Nadace (Foundation)",
    "nadf": "Nadační fond (Endowment Fund)",
    "ustav": "Ústav (Institute)",
    "ops": "Obecně prospěšná společnost (Public Benefit Company)",
}

COURT_LABELS = {
    "MSPH": "Městský soud v Praze",
    "KSBR": "Krajský soud v Brně",
    "KSCB": "Krajský soud v Českých Budějovicích",
    "KSHK": "Krajský soud v Hradci Králové",
    "KSOS": "Krajský soud v Ostravě",
    "KSPL": "Krajský soud v Plzni",
    "KSUL": "Krajský soud v Ústí nad Labem",
}

FILE_COURT_FALLBACK = {
    "praha": "MSPH",
    "brno": "KSBR",
    "ceske_budejovice": "KSCB",
    "hradec_kralove": "KSHK",
    "ostrava": "KSOS",
    "plzen": "KSPL",
    "usti_nad_labem": "KSUL",
}

NONPROFIT_EU_FORM_LABELS = {
    "Spolek",
    "Pobočný spolek",
    "Obecně prospěšná společnost",
    "Ústav",
    "Nadační fond",
    "Nadace",
}

FUND_SHORT = {
    "Evropský sociální fond plus(ESF+)": "ESF+",
    "Evropský sociální fond plus (ESF+)": "ESF+",
    "Evropský fond regionálního rozvoje (EFRR)": "ERDF",
    "Fond soudržnosti (FS)": "CF",
    "Azylový, migrační a integrační fond (AMIF)": "AMIF",
    "Fond pro spravedlivou transformaci (FST)": "JTF",
    "Evropský námořní, rybářský a akvakulturní fond (ENRAF)": "EMFAF",
}


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


def fold_czech(text: str) -> str:
    s = unicodedata.normalize("NFKD", text.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def name_shard_key(name: str) -> str:
    folded = fold_czech(name)
    if not folded:
        return "0-9"
    ch = folded[0]
    return ch if "a" <= ch <= "z" else "0-9"


def parse_haler(val: str) -> int | None:
    s = (val or "").strip().replace(" ", "").replace("\u00a0", "").replace(",", ".")
    if not s:
        return None
    try:
        dec = Decimal(s)
        return int((dec * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return None


def parse_excel_date(val: str) -> str | None:
    s = (val or "").strip()
    if not s:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    try:
        serial = int(float(s))
        if 20000 <= serial <= 80000:
            return (dt.date(1899, 12, 30) + dt.timedelta(days=serial)).isoformat()
    except ValueError:
        pass
    return None


def verify_pinned_sources(input_dir: pathlib.Path, tsv_path: pathlib.Path) -> list[dict]:
    sources = []
    with tsv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            fp = input_dir / row["file"]
            if not fp.is_file():
                raise SystemExit(f"Missing pinned source file: {fp}")
            actual_bytes = fp.stat().st_size
            expected_bytes = int(row["bytes"])
            if actual_bytes != expected_bytes:
                raise SystemExit(f"Byte mismatch on {row['file']}: actual={actual_bytes} expected={expected_bytes}")
            actual_sha = sha256_file(fp)
            if actual_sha != row["sha256"]:
                raise SystemExit(f"SHA-256 mismatch on {row['file']}: actual={actual_sha} expected={row['sha256']}")
            sources.append(row)
    return sources


def load_vr_nonprofits(input_dir: pathlib.Path, vr_rows: list[dict]) -> tuple[dict[str, dict], dict]:
    orgs: dict[str, dict] = {}
    stats = {
        "vrFilesScanned": len(vr_rows),
        "rawSubjectsScanned": 0,
        "duplicateIcoCount": 0,
        "missingIcoCount": 0,
        "byForm": Counter(),
        "byStatus": Counter(),
        "byCourt": Counter(),
        "withCapitalByForm": Counter(),
        "capitalHalerByForm": defaultdict(int),
        "nonCzkCapitalCount": 0,
        "nonCzkCapitalExamples": [],
    }

    for row in sorted(vr_rows, key=lambda r: r["file"]):
        fp = input_dir / row["file"]
        fn = fp.name
        parts = fn.replace("-2026.xml.gz", "").split("-actual-")
        form, file_court = parts[0], parts[1]
        fallback_court = FILE_COURT_FALLBACK[file_court]

        with gzip.open(fp, "rb") as f:
            for _, el in ET.iterparse(f, events=("end",)):
                if el.tag != "Subjekt":
                    continue
                stats["rawSubjectsScanned"] += 1
                ico_raw = (el.findtext("ico") or "").strip()
                if not ico_raw or not ico_raw.isdigit():
                    stats["missingIcoCount"] += 1
                    el.clear()
                    continue
                ico = ico_raw.zfill(8)
                if ico in orgs:
                    stats["duplicateIcoCount"] += 1
                    el.clear()
                    continue

                name = re.sub(r"\s+", " ", (el.findtext("nazev") or "").strip())
                reg_date = (el.findtext("zapisDatum") or "").strip() or None
                del_date = (el.findtext("vymazDatum") or "").strip() or None

                court = fallback_court
                muni = ""
                district = ""
                cap_haler: int | None = None
                has_liq = False
                has_ins = False

                for u in el.findall("./udaje/Udaj"):
                    kod = (u.findtext("./udajTyp/kod") or "").strip()
                    if kod == "SPIS_ZN":
                        c_kod = (u.findtext("./spisZn/soud/kod") or "").strip()
                        if c_kod:
                            court = c_kod
                    elif kod == "SIDLO":
                        # Privacy: municipality and district only — omit street, building number and postcode
                        o_txt = re.sub(r"\s+", " ", (u.findtext("./adresa/obec") or "").strip())
                        d_txt = re.sub(r"\s+", " ", (u.findtext("./adresa/okres") or "").strip())
                        if o_txt:
                            muni = o_txt
                        if d_txt:
                            district = d_txt
                    elif kod == "ZAKLADNI_KAPITAL":
                        typ = (u.findtext("./hodnotaUdaje/vklad/typ") or "").strip().upper()
                        tv = (u.findtext("./hodnotaUdaje/vklad/textValue") or "").strip()
                        if typ == "KORUNY" and tv:
                            val = parse_haler(tv)
                            if val is not None:
                                cap_haler = val
                        elif typ and tv:
                            stats["nonCzkCapitalCount"] += 1
                            if len(stats["nonCzkCapitalExamples"]) < 10:
                                stats["nonCzkCapitalExamples"].append({
                                    "ico": ico, "name": name, "form": form, "currencyType": typ, "rawValue": tv
                                })
                    elif "LIKVID" in kod:
                        has_liq = True
                    elif "INSOLV" in kod or "KONKURS" in kod or "UPADEK" in kod:
                        has_ins = True

                if del_date:
                    status = "deleted"
                elif has_ins:
                    status = "insolvency"
                elif has_liq:
                    status = "liquidation"
                else:
                    status = "active"

                orgs[ico] = {
                    "ico": ico,
                    "name": name,
                    "form": form,
                    "status": status,
                    "court": court,
                    "regDate": reg_date,
                    "delDate": del_date,
                    "muni": muni,
                    "district": district,
                    "capHaler": cap_haler,
                    "euCount": 0,
                    "euCostHaler": 0,
                    "euSupportHaler": 0,
                    "euPaidHaler": 0,
                }
                stats["byForm"][form] += 1
                stats["byStatus"][status] += 1
                stats["byCourt"][court] += 1
                if cap_haler is not None:
                    stats["withCapitalByForm"][form] += 1
                    stats["capitalHalerByForm"][form] += cap_haler

                el.clear()

    return orgs, stats


def load_eu_operations(xlsx_path: pathlib.Path, orgs: dict[str, dict]) -> tuple[list[dict], dict, dict]:
    z = zipfile.ZipFile(xlsx_path)
    ss = [
        "".join(t.text or "" for t in si.iter(XLSX_NS + "t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(XLSX_NS + "si")
    ]

    raw_rows = 0
    unique_projects: dict[str, dict] = {}
    multi_row_projects = Counter()
    wanted_cols = {
        "A", "B", "G", "H", "I", "L", "M", "N", "O", "P",
        "R", "S", "T", "U", "V", "W", "Y", "AA", "AB", "AC", "AD", "AE", "AF", "AG"
    }

    with z.open("xl/worksheets/sheet1.xml") as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != XLSX_NS + "row":
                continue
            rnum = int(el.attrib.get("r", "0"))
            if rnum >= 6:
                raw_rows += 1
                vals = {}
                for c in el.findall(XLSX_NS + "c"):
                    ref = "".join(ch for ch in c.attrib.get("r", "") if ch.isalpha())
                    if ref not in wanted_cols:
                        continue
                    t = c.attrib.get("t")
                    v = c.find(XLSX_NS + "v")
                    val = v.text if v is not None else ""
                    if t == "s" and val.isdigit():
                        val = ss[int(val)]
                    vals[ref] = val.strip()
                pid = vals.get("H", "")
                if pid:
                    multi_row_projects[pid] += 1
                    if pid not in unique_projects:
                        unique_projects[pid] = vals
            el.clear()

    multi_proc_proj_count = sum(1 for c in multi_row_projects.values() if c > 1)
    extra_proc_rows = sum(c - 1 for c in multi_row_projects.values() if c > 1)

    matched_projects = []
    unmatched_nonprofit_labeled = []
    by_form = defaultdict(lambda: {
        "projects": 0, "distinctOrgs": set(), "costHaler": 0, "eligibleHaler": 0,
        "euHaler": 0, "natPubHaler": 0, "privHaler": 0, "paidEligibleHaler": 0, "paidEuHaler": 0,
    })
    by_fund = defaultdict(lambda: {
        "fundName": "", "projects": 0, "distinctOrgs": set(), "costHaler": 0, "euHaler": 0, "paidEligibleHaler": 0,
    })
    by_program = defaultdict(lambda: {
        "programCode": "", "programName": "", "projects": 0, "distinctOrgs": set(),
        "costHaler": 0, "euHaler": 0, "paidEligibleHaler": 0,
    })
    by_region = defaultdict(lambda: {
        "projects": 0, "distinctOrgs": set(), "costHaler": 0, "euHaler": 0,
    })
    by_org = defaultdict(lambda: {
        "ico": "", "name": "", "form": "", "status": "", "muni": "", "capHaler": None,
        "projects": 0, "costHaler": 0, "euHaler": 0, "paidEligibleHaler": 0,
    })
    status_counts = Counter()

    for pid in sorted(unique_projects.keys()):
        v = unique_projects[pid]
        raw_ico = re.sub(r"\D+", "", v.get("O", ""))
        ico = raw_ico.zfill(8) if raw_ico and len(raw_ico) <= 8 else ""
        eu_form_label = re.sub(r"\s+", " ", v.get("P", "")).strip()

        if not ico or ico not in orgs:
            if eu_form_label in NONPROFIT_EU_FORM_LABELS:
                unmatched_nonprofit_labeled.append({
                    "projectId": pid,
                    "rawIco": v.get("O", ""),
                    "beneficiaryName": v.get("N", ""),
                    "euLegalForm": eu_form_label,
                    "programme": v.get("B", ""),
                    "costHaler": parse_haler(v.get("AA", "")) or 0,
                    "euHaler": parse_haler(v.get("AC", "")) or 0,
                })
            continue

        org = orgs[ico]
        cost_h = parse_haler(v.get("AA", "")) or 0
        elig_h = parse_haler(v.get("AB", "")) or 0
        eu_h = parse_haler(v.get("AC", "")) or 0
        nat_h = parse_haler(v.get("AD", "")) or 0
        priv_h = parse_haler(v.get("AE", "")) or 0
        paid_elig_h = parse_haler(v.get("AF", "")) or 0
        paid_eu_h = parse_haler(v.get("AG", "")) or 0

        fund_full = re.sub(r"\s+", " ", v.get("G", "")).strip()
        fund_code = FUND_SHORT.get(fund_full, fund_full or "Unknown")
        prog_code = v.get("A", "").strip()
        prog_name = re.sub(r"\s+", " ", v.get("B", "")).strip()
        region = re.sub(r"\s+", " ", v.get("W", "")).strip() or "Unspecified"
        status_code = v.get("L", "").strip()
        status_text = re.sub(r"\s+", " ", v.get("M", "")).strip()
        signed = parse_excel_date(v.get("R", ""))
        start = parse_excel_date(v.get("S", ""))
        end_exp = parse_excel_date(v.get("T", ""))
        end_act = parse_excel_date(v.get("U", ""))
        interv = re.sub(r"\s+", " ", v.get("Y", "")).strip()

        org["euCount"] += 1
        org["euCostHaler"] += cost_h
        org["euSupportHaler"] += eu_h
        org["euPaidHaler"] += paid_elig_h

        proj_rec = {
            "id": pid,
            "ico": ico,
            "orgName": org["name"],
            "form": org["form"],
            "orgStatus": org["status"],
            "title": re.sub(r"\s+", " ", v.get("I", "")).strip(),
            "progCode": prog_code,
            "prog": prog_name,
            "fund": fund_code,
            "region": region,
            "statusCode": status_code,
            "status": status_text,
            "signed": signed,
            "start": start,
            "end": end_act or end_exp,
            "interv": interv,
            "costHaler": cost_h,
            "eligibleHaler": elig_h,
            "euHaler": eu_h,
            "natPubHaler": nat_h,
            "privHaler": priv_h,
            "paidEligibleHaler": paid_elig_h,
            "paidEuHaler": paid_eu_h,
        }
        matched_projects.append(proj_rec)
        status_counts[status_text] += 1

        bf = by_form[org["form"]]
        bf["projects"] += 1
        bf["distinctOrgs"].add(ico)
        bf["costHaler"] += cost_h
        bf["eligibleHaler"] += elig_h
        bf["euHaler"] += eu_h
        bf["natPubHaler"] += nat_h
        bf["privHaler"] += priv_h
        bf["paidEligibleHaler"] += paid_elig_h
        bf["paidEuHaler"] += paid_eu_h

        bfu = by_fund[fund_code]
        bfu["fundName"] = fund_full
        bfu["projects"] += 1
        bfu["distinctOrgs"].add(ico)
        bfu["costHaler"] += cost_h
        bfu["euHaler"] += eu_h
        bfu["paidEligibleHaler"] += paid_elig_h

        bpr = by_program[prog_code]
        bpr["programCode"] = prog_code
        bpr["programName"] = prog_name
        bpr["projects"] += 1
        bpr["distinctOrgs"].add(ico)
        bpr["costHaler"] += cost_h
        bpr["euHaler"] += eu_h
        bpr["paidEligibleHaler"] += paid_elig_h

        bre = by_region[region]
        bre["projects"] += 1
        bre["distinctOrgs"].add(ico)
        bre["costHaler"] += cost_h
        bre["euHaler"] += eu_h

        bo = by_org[ico]
        bo["ico"] = ico
        bo["name"] = org["name"]
        bo["form"] = org["form"]
        bo["status"] = org["status"]
        bo["muni"] = org["muni"]
        bo["capHaler"] = org["capHaler"]
        bo["projects"] += 1
        bo["costHaler"] += cost_h
        bo["euHaler"] += eu_h
        bo["paidEligibleHaler"] += paid_elig_h

    matched_projects.sort(key=lambda r: (-r["costHaler"], r["id"]))
    top_recipients = sorted(by_org.values(), key=lambda r: (-r["costHaler"], r["ico"]))[:20]

    flow_summary = {
        "rawExcelRowsScanned": raw_rows,
        "uniqueOperationsTotal": len(unique_projects),
        "multiProcurementOperationsDeduplicated": multi_proc_proj_count,
        "duplicateProcurementRowsCollapsed": extra_proc_rows,
        "nonprofitProjects": len(matched_projects),
        "distinctNonprofitRecipients": len(by_org),
        "totalCostHaler": sum(r["costHaler"] for r in matched_projects),
        "totalEligibleHaler": sum(r["eligibleHaler"] for r in matched_projects),
        "totalEuSupportHaler": sum(r["euHaler"] for r in matched_projects),
        "totalNatPublicHaler": sum(r["natPubHaler"] for r in matched_projects),
        "totalPrivateHaler": sum(r["privHaler"] for r in matched_projects),
        "totalPaidEligibleHaler": sum(r["paidEligibleHaler"] for r in matched_projects),
        "totalPaidEuHaler": sum(r["paidEuHaler"] for r in matched_projects),
        "byForm": {
            k: {
                "label": FORM_LABELS[k],
                "projects": v["projects"],
                "distinctOrgs": len(v["distinctOrgs"]),
                "costHaler": v["costHaler"],
                "eligibleHaler": v["eligibleHaler"],
                "euHaler": v["euHaler"],
                "natPubHaler": v["natPubHaler"],
                "privHaler": v["privHaler"],
                "paidEligibleHaler": v["paidEligibleHaler"],
                "paidEuHaler": v["paidEuHaler"],
            }
            for k, v in sorted(by_form.items())
        },
        "byFund": {
            k: {
                "fundName": v["fundName"],
                "projects": v["projects"],
                "distinctOrgs": len(v["distinctOrgs"]),
                "costHaler": v["costHaler"],
                "euHaler": v["euHaler"],
                "paidEligibleHaler": v["paidEligibleHaler"],
            }
            for k, v in sorted(by_fund.items())
        },
        "byProgram": {
            k: {
                "programCode": v["programCode"],
                "programName": v["programName"],
                "projects": v["projects"],
                "distinctOrgs": len(v["distinctOrgs"]),
                "costHaler": v["costHaler"],
                "euHaler": v["euHaler"],
                "paidEligibleHaler": v["paidEligibleHaler"],
            }
            for k, v in sorted(by_program.items())
        },
        "byRegion": {
            k: {
                "projects": v["projects"],
                "distinctOrgs": len(v["distinctOrgs"]),
                "costHaler": v["costHaler"],
                "euHaler": v["euHaler"],
            }
            for k, v in sorted(by_region.items())
        },
        "topRecipients": top_recipients,
    }

    anomalies = {
        "format": "charitology-czechia-eu-funds-anomalies-v1",
        "capturedOn": CAPTURED_ON,
        "asOf": EU_AS_OF,
        "multiProcurementRowExpansion": {
            "rawExcelRows": raw_rows,
            "uniqueOperations": len(unique_projects),
            "operationsWithMultipleProcurementRows": multi_proc_proj_count,
            "collapsedProcurementRows": extra_proc_rows,
            "note": "DotaceEU Seznam operací repeats operation-level CZK totals on each public procurement sub-row (column AJ). Deduplicating by unique registration number (column H) prevents double-counting project budgets.",
        },
        "unmatchedNonprofitLabeledOperations": {
            "count": len(unmatched_nonprofit_labeled),
            "note": "Operations labeled with one of the 6 Czech nonprofit legal forms in DotaceEU whose beneficiary IČO is blank or absent from the 2026 Czech Public Register dumps (for example, cross-border Interreg foreign beneficiaries).",
            "records": sorted(unmatched_nonprofit_labeled, key=lambda r: r["projectId"]),
        },
        "excludedPublicRegisterForms": {
            "note": "Housing unit-owners associations (SVJ / Společenství vlastníků jednotek), commercial companies (s.r.o., a.s., v.o.s., k.s.), cooperatives (družstvo), state enterprises, trade unions (odborová organizace), and church legal entities registered under the Ministry of Culture are outside this 6-form Ministry of Justice civil-society scope.",
        },
    }

    return matched_projects, flow_summary, anomalies


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-czechia-charity-index.py <input-dir> <output-public-data-dir>")

    input_dir = pathlib.Path(sys.argv[1]).resolve()
    out_root = pathlib.Path(sys.argv[2]).resolve()
    tsv_path = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "czechia-index-sources.tsv"

    sources = verify_pinned_sources(input_dir, tsv_path)
    vr_sources = [s for s in sources if s["file"].startswith("vr/")]
    eu_source = [s for s in sources if s["file"].endswith(".xlsx")][0]

    orgs, vr_stats = load_vr_nonprofits(input_dir, vr_sources)
    matched_projects, flow_summary, anomalies = load_eu_operations(input_dir / eu_source["file"], orgs)

    # Write sharded Czechia nonprofit registry
    reg_dir = out_root / "charity-registry" / "czechia"
    reg_dir.mkdir(parents=True, exist_ok=True)

    name_buckets: dict[str, list[dict]] = defaultdict(list)
    id_buckets: dict[str, list[dict]] = defaultdict(list)

    for ico in sorted(orgs.keys()):
        row = orgs[ico]
        name_buckets[name_shard_key(row["name"])].append(row)
        id_buckets[ico[0]].append(row)

    name_shards = {}
    for bkt in sorted(name_buckets.keys()):
        rows = sorted(name_buckets[bkt], key=lambda r: (fold_czech(r["name"]), r["ico"]))
        rel = f"names/{bkt}.json.gz"
        meta = write_gz_json(reg_dir / rel, rows)
        name_shards[bkt] = {"path": rel, "rows": len(rows), **meta}

    id_shards = {}
    for pfx in sorted(id_buckets.keys()):
        rows = sorted(id_buckets[pfx], key=lambda r: r["ico"])
        rel = f"ids/{pfx}.json.gz"
        meta = write_gz_json(reg_dir / rel, rows)
        id_shards[pfx] = {"path": rel, "rows": len(rows), **meta}

    top_foundations = sorted(
        (
            {
                "ico": r["ico"],
                "name": r["name"],
                "form": r["form"],
                "status": r["status"],
                "muni": r["muni"],
                "capHaler": r["capHaler"],
            }
            for r in orgs.values()
            if r["capHaler"] is not None
        ),
        key=lambda r: (-r["capHaler"], r["ico"]),
    )[:15]

    total_cap_haler = sum(vr_stats["capitalHalerByForm"].values())
    reg_manifest = {
        "format": "charitology-czechia-registry-v1",
        "jurisdiction": "CZ",
        "capturedOn": CAPTURED_ON,
        "asOf": "2026-11-22",
        "publisher": "Ministry of Justice of the Czech Republic (Ministerstvo spravedlnosti ČR) & Ministry for Regional Development (DotaceEU)",
        "catalogues": {
            "justiceVr": "https://dataor.justice.cz/",
            "dotaceEu": "https://www.dotaceeu.cz/cs/statistiky-a-analyzy/seznam-operaci-(prijemcu)",
            "liveLookup": "https://or.justice.cz/ias/ui/rejstrik",
        },
        "currency": "CZK",
        "counts": {
            "vrFilesScanned": vr_stats["vrFilesScanned"],
            "rawSubjectsScanned": vr_stats["rawSubjectsScanned"],
            "includedOrganizations": len(orgs),
            "duplicateIcoCount": vr_stats["duplicateIcoCount"],
            "missingIcoCount": vr_stats["missingIcoCount"],
            "byForm": dict(sorted(vr_stats["byForm"].items())),
            "byStatus": dict(sorted(vr_stats["byStatus"].items())),
            "byCourt": dict(sorted(vr_stats["byCourt"].items())),
            "withRegisteredCapital": sum(vr_stats["withCapitalByForm"].values()),
            "withRegisteredCapitalByForm": dict(sorted(vr_stats["withCapitalByForm"].items())),
            "totalRegisteredCapitalHaler": total_cap_haler,
            "registeredCapitalHalerByForm": dict(sorted(vr_stats["capitalHalerByForm"].items())),
            "nonCzkCapitalCount": vr_stats["nonCzkCapitalCount"],
            "withEuProjects2021to2027": flow_summary["distinctNonprofitRecipients"],
            "euProjectsMatched": flow_summary["nonprofitProjects"],
            "euTotalCostHaler": flow_summary["totalCostHaler"],
        },
        "topEndowedFoundations": top_foundations,
        "privacyBoundary": "Personal board member names, dates of birth, street addresses and postcodes are omitted; only municipality (obec), district (okres) and registering court are retained.",
        "sourcesCount": len(sources),
        "sourcesPinnedIn": "src/data/czechia-index-sources.tsv",
        "shards": {
            "names": name_shards,
            "ids": id_shards,
        },
    }
    (reg_dir / "manifest.json").write_text(
        json.dumps(reg_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    # Write Czechia EU Cohesion Policy 2021-2027 funding flows
    flow_dir = out_root / "funding-flows" / "czechia-eu-funds"
    flow_dir.mkdir(parents=True, exist_ok=True)

    proj_meta = write_gz_json(flow_dir / "projects.json.gz", matched_projects)

    csv_buf = io.StringIO()
    w = csv.writer(csv_buf, lineterminator="\n")
    w.writerow(["fund_code", "fund_name", "projects", "distinct_nonprofits", "total_cost_czk", "eu_support_czk", "paid_eligible_czk"])
    for code, info in sorted(flow_summary["byFund"].items(), key=lambda x: -x[1]["costHaler"]):
        w.writerow([
            code,
            info["fundName"],
            info["projects"],
            info["distinctOrgs"],
            f"{info['costHaler'] / 100:.2f}",
            f"{info['euHaler'] / 100:.2f}",
            f"{info['paidEligibleHaler'] / 100:.2f}",
        ])
    (flow_dir / "funds-summary.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    (flow_dir / "anomalies.json").write_text(
        json.dumps(anomalies, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    flow_manifest = {
        "format": "charitology-czechia-eu-funds-v1",
        "jurisdiction": "CZ",
        "capturedOn": CAPTURED_ON,
        "asOf": EU_AS_OF,
        "currency": "CZK",
        "publisher": "Ministry for Regional Development of the Czech Republic (Ministerstvo pro místní rozvoj ČR / DotaceEU)",
        "catalogue": "https://www.dotaceeu.cz/cs/statistiky-a-analyzy/seznam-operaci-(prijemcu)",
        "source": {
            "file": eu_source["file"],
            "bytes": int(eu_source["bytes"]),
            "sha256": eu_source["sha256"],
            "url": eu_source["url"],
            "generatedAt": "2026-11-01 04:08:42",
        },
        "counts": flow_summary,
        "artifacts": {
            "projects": {"path": "projects.json.gz", "rows": len(matched_projects), **proj_meta},
            "fundsSummaryCsv": "funds-summary.csv",
            "anomalies": "anomalies.json",
        },
    }
    (flow_dir / "manifest.json").write_text(
        json.dumps(flow_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(
        f"Built Czechia #19: {len(orgs):,} nonprofits "
        f"({reg_manifest['counts']['withRegisteredCapital']:,} with registered CZK capital totaling CZK {total_cap_haler / 100:,.2f}) + "
        f"{len(matched_projects):,} EU 2021-2027 projects across {flow_summary['distinctNonprofitRecipients']:,} nonprofits "
        f"(CZK {flow_summary['totalCostHaler'] / 100:,.2f} total cost / CZK {flow_summary['totalEuSupportHaler'] / 100:,.2f} EU support)."
    )


if __name__ == "__main__":
    main()
