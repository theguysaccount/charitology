#!/usr/bin/env python3
"""Build reproducible Norway Global Charity Index editions from pinned NLOD 2.0 captures.

Inputs in <source_dir>:
  - enheter_alle.json.gz   (Brønnøysundregistrene Enhetsregisteret / Frivillighetsregisteret)
  - moms-2023.xlsx         (Lottstift Momskompensasjon 2023)
  - moms-2024.xlsx         (Lottstift Momskompensasjon 2024)
  - moms-2025.xlsx         (Lottstift Momskompensasjon 2025)

Usage:
  python3 scripts/build-norway-charity-index.py <source_dir> <out_dir>
"""
import csv
import gzip
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

CAPTURED_ON = "2026-11-22"
BRREG_LAST_MODIFIED = "2026-11-21"
LICENSE_URL = "https://data.norge.no/nlod/en/2.0"

SOURCES = {
    "enheter_alle.json.gz": {
        "publisher": "Brønnøysundregistrene",
        "catalogue": "https://data.norge.no/datasets/4f87729a-1ef3-4f79-9866-832df00dc075",
        "url": "https://data.brreg.no/enhetsregisteret/api/enheter/lastned",
        "bytes": 211233116,
        "sha256": "a81e11dbdd8bbbbce67066ff96f3fa34ffdc217065c25c2dd89aad63f34c3bd8",
    },
    "moms-2023.xlsx": {
        "publisher": "Lotteri- og stiftelsestilsynet",
        "catalogue": "https://lottstift.no/nb/om-oss/apne-data/",
        "url": "https://lottstift.no/app/uploads/2023/12/Oversikt-over-mottakere-og-tildelt-belop-2023.xlsx",
        "bytes": 1580329,
        "sha256": "eed22d5b2386f0ba4e339e2a47f9bce908247ec0cc8d7f008b4128db238755be",
    },
    "moms-2024.xlsx": {
        "publisher": "Lotteri- og stiftelsestilsynet",
        "catalogue": "https://lottstift.no/nb/om-oss/apne-data/",
        "url": "https://lottstift.no/app/uploads/2026/06/Oversikt-over-tildelinger-momskompensasjon-2024.xlsx",
        "bytes": 1299787,
        "sha256": "eff005abc6230e79da010dff3900afa84b9310e321b7cafadb5892fb2e918543",
    },
    "moms-2025.xlsx": {
        "publisher": "Lotteri- og stiftelsestilsynet",
        "catalogue": "https://lottstift.no/for-frivilligheten/nokkeltal-momskompensasjon-pa-varer-og-tenester/",
        "url": "https://lottstift.no/app/uploads/2026/01/Oversikt-utbetalinger-momskompensasjon-2025-1-1.xlsx",
        "bytes": 2022639,
        "sha256": "2289609a3b9bce8ebf55bdeca2ec669fac3d58d3e6a70e2f27d5855d409b1b02",
    },
}

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CELL_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str):
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
            size += len(chunk)
    return size, h.hexdigest()


def gzip_deterministic(data: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(data)
    return buf.getvalue()


def compact_json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def pretty_json(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def mod11_ok(orgnr: str) -> bool:
    if not (isinstance(orgnr, str) and len(orgnr) == 9 and orgnr.isdigit()):
        return False
    weights = (3, 2, 7, 6, 5, 4, 3, 2)
    total = sum(int(orgnr[i]) * weights[i] for i in range(8))
    rem = 11 - (total % 11)
    if rem == 11:
        rem = 0
    if rem == 10:
        return False
    return rem == int(orgnr[8])


def normalize_name(value: str) -> str:
    # Matches JS normalizeFinancialName: NFKD -> lower -> strip combining marks -> non-alnum to space
    decomposed = unicodedata.normalize("NFKD", value).lower()
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    # Preserve Norwegian ø/æ/å folding consistently with JS: keep letters/digits, collapse whitespace
    out = []
    prev_space = True
    for ch in stripped:
        cat = unicodedata.category(ch)
        if cat[0] in ("L", "N"):
            out.append(ch)
            prev_space = False
        else:
            if not prev_space:
                out.append(" ")
                prev_space = True
    return "".join(out).strip()


def bucket_for_name(name: str) -> str:
    norm = normalize_name(name)
    if not norm:
        return "other"
    first = norm[0]
    if "a" <= first <= "z":
        return first
    if "0" <= first <= "9":
        return "0-9"
    return "other"


def safe_csv_cell(value):
    s = "" if value is None else str(value)
    if s and re.match(r"^(?:\s*[=+\-@]|[\t\r\n])", s):
        return "'" + s
    return s


def col_index(ref: str) -> int:
    idx = 0
    for ch in ref:
        if ch.isalpha():
            idx = idx * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return idx - 1


def read_xlsx_sheet(path: str, sheet_index: int):
    with zipfile.ZipFile(path) as z:
        ss = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("s:si", NS):
                ss.append("".join(t.text or "" for t in si.iter(CELL_NS + "t")))
        sroot = ET.fromstring(z.read(f"xl/worksheets/sheet{sheet_index}.xml"))
        rows = []
        for r in sroot.findall(".//s:sheetData/s:row", NS):
            rnum = int(r.attrib["r"])
            row = {}
            max_c = -1
            for c in r.findall("s:c", NS):
                ci = col_index(c.attrib["r"])
                max_c = max(max_c, ci)
                t = c.attrib.get("t")
                v = c.find("s:v", NS)
                val = v.text if v is not None else ""
                if t == "s" and val.isdigit():
                    val = ss[int(val)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(CELL_NS + "t"))
                row[ci] = val
            if max_c >= 0:
                rows.append((rnum, [row.get(i, "") for i in range(max_c + 1)]))
        return rows


def parse_opt_int(raw: str):
    s = raw.strip()
    if not s:
        return None
    val = float(s)
    rounded = int(round(val))
    assert abs(val - rounded) < 1e-6, f"Non-integer NOK amount: {raw!r}"
    assert rounded >= 0, f"Negative NOK amount: {raw!r}"
    return rounded


def write_shard(root_dir: str, rel_path: str, rows: list):
    decoded = compact_json(rows)
    packed = gzip_deterministic(decoded)
    full = os.path.join(root_dir, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as f:
        f.write(packed)
    return {
        "path": rel_path,
        "rows": len(rows),
        "bytes": len(packed),
        "decodedBytes": len(decoded),
        "sha256": sha256_bytes(packed),
        "decodedSha256": sha256_bytes(decoded),
    }


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: python3 scripts/build-norway-charity-index.py <source_dir> <out_dir>")
    src_dir, out_dir = sys.argv[1], sys.argv[2]

    # 1. Verify exact SHA-256 and byte counts of all four pinned source captures
    for fname, meta in SOURCES.items():
        fpath = os.path.join(src_dir, fname)
        size, digest = sha256_file(fpath)
        assert size == meta["bytes"], f"{fname}: size {size} != {meta['bytes']}"
        assert digest == meta["sha256"], f"{fname}: sha256 {digest} != {meta['sha256']}"

    # 2. Load Brønnøysundregistrene Enhetsregisteret + Frivillighetsregisteret
    with gzip.open(os.path.join(src_dir, "enheter_alle.json.gz"), "rt", encoding="utf-8") as f:
        enheter = json.load(f)
    total_enheter = len(enheter)

    all_orgnrs = set()
    friv_map = {}
    by_form = Counter()
    by_sector = Counter()
    stift_overlap = 0
    mva_overlap = 0
    liquidating = 0
    bankrupt = 0
    unknown_muni = 0
    norm_name_counts = Counter()

    for e in enheter:
        orgnr = (e.get("organisasjonsnummer") or "").strip()
        if orgnr:
            all_orgnrs.add(orgnr)
        if e.get("registrertIFrivillighetsregisteret") is True:
            assert mod11_ok(orgnr), f"Invalid Frivillighetsregisteret orgnr: {orgnr}"
            assert orgnr not in friv_map, f"Duplicate orgnr: {orgnr}"
            name = re.sub(r"\s+", " ", (e.get("navn") or "")).strip()
            assert name, f"Blank name for {orgnr}"
            form = (e.get("organisasjonsform") or {}).get("kode") or ""
            sector = (e.get("institusjonellSektorkode") or {}).get("kode") or None
            nace = (e.get("naeringskode1") or {}).get("kode") or None
            addr = e.get("forretningsadresse") or e.get("postadresse") or {}
            muni_code = (addr.get("kommunenummer") or "").strip() or None
            muni_name = re.sub(r"\s+", " ", (addr.get("kommune") or "")).strip() or None
            if not muni_code:
                unknown_muni += 1
            friv_date = (e.get("registreringsdatoFrivillighetsregisteret") or "").strip() or None
            is_stift = bool(e.get("registrertIStiftelsesregisteret"))
            is_mva = bool(e.get("registrertIMvaregisteret"))
            is_liq = bool(e.get("underAvvikling") or e.get("underTvangsavviklingEllerTvangsopplosning"))
            is_bank = bool(e.get("konkurs"))
            if is_stift:
                stift_overlap += 1
            if is_mva:
                mva_overlap += 1
            if is_liq:
                liquidating += 1
            if is_bank:
                bankrupt += 1
            by_form[form] += 1
            if sector:
                by_sector[sector] += 1
            flags = ("S" if is_stift else "") + ("M" if is_mva else "") + ("L" if is_liq else "") + ("K" if is_bank else "")
            norm_name_counts[normalize_name(name)] += 1
            friv_map[orgnr] = {
                "orgnr": orgnr,
                "name": name,
                "form": form,
                "sector": sector,
                "nace": nace,
                "muniCode": muni_code,
                "muniName": muni_name,
                "frivDate": friv_date,
                "flags": flags,
            }

    # 3. Parse Lottstift Momskompensasjon 2023, 2024, and 2025
    # Track per-orgnr multi-year totals & exact per-year counts
    recipients = {}

    def ensure_recipient(orgnr: str):
        rec = recipients.get(orgnr)
        if rec is None:
            rec = {
                "orgnr": orgnr,
                "name": "",
                "nameYear": 0,
                "role2025": None,
                "umbrella2025": None,
                "icnpo2025": None,
                "nok2023": None,
                "nok2024": None,
                "nok2025T1": None,
                "nok2025Supp": None,
                "nok2025Total": None,
                "rows2023": 0,
                "rows2024": 0,
                "rows2025": 0,
            }
            recipients[orgnr] = rec
        return rec

    blank_orgnr_rows = []
    duplicate_orgnr_notes = {"2023": [], "2025": []}

    # --- 2023 ---
    s23 = read_xlsx_sheet(os.path.join(src_dir, "moms-2023.xlsx"), 1)
    assert s23[0][1][:10] == [
        "Saksnummer", "Org.nr", "Org.navn", "Søkartype", "Org.nr søkar",
        "Org.navn søkar", "Kommunenr", "Kommune", "Kategori", "Tildelt beløp",
    ]
    d23 = s23[1:]
    c23_org = Counter()
    y23_stats = {
        "year": 2023,
        "inputRows": len(d23),
        "validOrgnrRows": 0,
        "blankOrgnrRows": 0,
        "distinctOrgnrs": 0,
        "duplicateOrgnrs": 0,
        "byRole": Counter(),
        "blankAmountRows": 0,
        "zeroAmountRows": 0,
        "positiveAmountRows": 0,
        "totalAwardedNOK": 0,
        "inFrivillighetsregisteret": 0,
        "inEnhetsregisteretOnly": 0,
        "absentFromBrreg": 0,
    }
    rows23_by_org = defaultdict(list)
    for rnum, row in d23:
        case_id = row[0].strip() if len(row) > 0 else ""
        orgnr = row[1].strip() if len(row) > 1 else ""
        name = re.sub(r"\s+", " ", row[2]).strip() if len(row) > 2 else ""
        role = row[3].strip() if len(row) > 3 else ""
        app_orgnr = row[4].strip() if len(row) > 4 else ""
        app_name = re.sub(r"\s+", " ", row[5]).strip() if len(row) > 5 else ""
        amt = parse_opt_int(row[9] if len(row) > 9 else "")
        y23_stats["byRole"][role] += 1
        if amt is None:
            y23_stats["blankAmountRows"] += 1
        elif amt == 0:
            y23_stats["zeroAmountRows"] += 1
        else:
            y23_stats["positiveAmountRows"] += 1
            y23_stats["totalAwardedNOK"] += amt
        if not (len(orgnr) == 9 and orgnr.isdigit()):
            y23_stats["blankOrgnrRows"] += 1
            blank_orgnr_rows.append({
                "year": 2023, "excelRow": rnum, "caseNumber": case_id,
                "reportedName": name or None, "role": role,
                "applicantOrgnr": app_orgnr or None, "applicantName": app_name or None,
                "awardedNOK": amt,
            })
            continue
        assert mod11_ok(orgnr), f"2023 invalid mod11 orgnr at row {rnum}: {orgnr}"
        y23_stats["validOrgnrRows"] += 1
        c23_org[orgnr] += 1
        rows23_by_org[orgnr].append((rnum, case_id, role, app_orgnr, amt))
        rec = ensure_recipient(orgnr)
        rec["rows2023"] += 1
        if name and rec["nameYear"] <= 2023:
            rec["name"] = name
            rec["nameYear"] = 2023
        if amt is not None:
            rec["nok2023"] = (rec["nok2023"] or 0) + amt

    y23_stats["distinctOrgnrs"] = len(c23_org)
    y23_stats["duplicateOrgnrs"] = sum(1 for v in c23_org.values() if v > 1)
    y23_stats["inFrivillighetsregisteret"] = sum(1 for o in c23_org if o in friv_map)
    y23_stats["inEnhetsregisteretOnly"] = sum(1 for o in c23_org if o not in friv_map and o in all_orgnrs)
    y23_stats["absentFromBrreg"] = sum(1 for o in c23_org if o not in all_orgnrs)
    y23_stats["byRole"] = dict(sorted(y23_stats["byRole"].items()))
    for orgnr in sorted(o for o, v in c23_org.items() if v > 1):
        duplicate_orgnr_notes["2023"].append({
            "orgnr": orgnr,
            "name": recipients[orgnr]["name"],
            "rows": [
                {"excelRow": rn, "caseNumber": cid, "role": rl, "applicantOrgnr": aorg, "awardedNOK": a}
                for rn, cid, rl, aorg, a in rows23_by_org[orgnr]
            ],
        })

    # --- 2024 ---
    s24 = read_xlsx_sheet(os.path.join(src_dir, "moms-2024.xlsx"), 1)
    assert s24[0][1][:6] == [
        "Tilskuddsordning", "Organisasjonsnummer", "Organisasjonsnavn",
        "Kommune", "Kategori", "Tildelt",
    ]
    d24 = s24[1:]
    c24_org = Counter()
    y24_stats = {
        "year": 2024,
        "inputRows": len(d24),
        "validOrgnrRows": 0,
        "blankOrgnrRows": 0,
        "distinctOrgnrs": 0,
        "duplicateOrgnrs": 0,
        "blankAmountRows": 0,
        "zeroAmountRows": 0,
        "positiveAmountRows": 0,
        "totalAwardedNOK": 0,
        "inFrivillighetsregisteret": 0,
        "inEnhetsregisteretOnly": 0,
        "absentFromBrreg": 0,
    }
    for rnum, row in d24:
        orgnr = row[1].strip() if len(row) > 1 else ""
        name = re.sub(r"\s+", " ", row[2]).strip() if len(row) > 2 else ""
        amt = parse_opt_int(row[5] if len(row) > 5 else "")
        assert len(orgnr) == 9 and orgnr.isdigit() and mod11_ok(orgnr), f"2024 bad orgnr row {rnum}: {orgnr}"
        assert amt is not None and amt > 0, f"2024 unexpected amt row {rnum}: {amt}"
        y24_stats["validOrgnrRows"] += 1
        y24_stats["positiveAmountRows"] += 1
        y24_stats["totalAwardedNOK"] += amt
        c24_org[orgnr] += 1
        rec = ensure_recipient(orgnr)
        rec["rows2024"] += 1
        if name and rec["nameYear"] <= 2024:
            rec["name"] = name
            rec["nameYear"] = 2024
        rec["nok2024"] = (rec["nok2024"] or 0) + amt

    y24_stats["distinctOrgnrs"] = len(c24_org)
    y24_stats["duplicateOrgnrs"] = sum(1 for v in c24_org.values() if v > 1)
    y24_stats["inFrivillighetsregisteret"] = sum(1 for o in c24_org if o in friv_map)
    y24_stats["inEnhetsregisteretOnly"] = sum(1 for o in c24_org if o not in friv_map and o in all_orgnrs)
    y24_stats["absentFromBrreg"] = sum(1 for o in c24_org if o not in all_orgnrs)

    # --- 2025 Sheet 1 (Alle søknader) & Sheet 2 (Alle organisasjoner) ---
    s25_1 = read_xlsx_sheet(os.path.join(src_dir, "moms-2025.xlsx"), 1)
    assert s25_1[0][1][:7] == [
        "Org.nr.", "Namn", "Søknadstype", "Søknadsmodell", "Avgjerd", "Godkjent beløp", "Organisasjonar",
    ]
    s25_2 = read_xlsx_sheet(os.path.join(src_dir, "moms-2025.xlsx"), 2)
    assert s25_2[0][1][:11] == [
        "organisasjonsnummer", "Navn mottaker", "Type organisasjon", "Organisasjonsnummer søker",
        "Navn søker", "Søknadsmodell", "Avgjørelse", "Tildelt beløp utbetaling 1",
        "org_icnpo1_code", "Tilleggsutbetaling", "Totalt utbetalt",
    ]

    d25_2 = s25_2[1:]
    c25_org = Counter()
    by_app_s2 = defaultdict(lambda: {"rows": 0, "t1": 0, "supp": 0, "total": 0, "excelRows": []})
    y25_stats = {
        "year": 2025,
        "inputRows": len(d25_2),
        "validOrgnrRows": 0,
        "blankOrgnrRows": 0,
        "distinctOrgnrs": 0,
        "duplicateOrgnrs": 0,
        "byRole": Counter(),
        "byDecision": Counter(),
        "tranche1NOK": 0,
        "supplementaryNOK": 0,
        "totalDisbursedNOK": 0,
        "zeroDisbursedRows": 0,
        "positiveDisbursedRows": 0,
        "inFrivillighetsregisteret": 0,
        "inEnhetsregisteretOnly": 0,
        "absentFromBrreg": 0,
    }
    rows25_by_org = defaultdict(list)
    for rnum, row in d25_2:
        orgnr = row[0].strip() if len(row) > 0 else ""
        name = re.sub(r"\s+", " ", row[1]).strip() if len(row) > 1 else ""
        role = row[2].strip() if len(row) > 2 else ""
        app_orgnr = row[3].strip() if len(row) > 3 else ""
        app_name = re.sub(r"\s+", " ", row[4]).strip() if len(row) > 4 else ""
        model = row[5].strip() if len(row) > 5 else ""
        decision = row[6].strip() if len(row) > 6 else ""
        t1 = parse_opt_int(row[7] if len(row) > 7 else "")
        icnpo = row[8].strip() if len(row) > 8 else ""
        supp = parse_opt_int(row[9] if len(row) > 9 else "")
        tot = parse_opt_int(row[10] if len(row) > 10 else "")
        t1_val = t1 or 0
        supp_val = supp or 0
        tot_val = tot or 0
        assert t1_val + supp_val == tot_val, f"2025 row {rnum} arithmetic mismatch: {t1_val}+{supp_val}!={tot_val}"
        y25_stats["byRole"][role] += 1
        y25_stats["byDecision"][decision] += 1
        y25_stats["tranche1NOK"] += t1_val
        y25_stats["supplementaryNOK"] += supp_val
        y25_stats["totalDisbursedNOK"] += tot_val
        if tot_val > 0:
            y25_stats["positiveDisbursedRows"] += 1
        else:
            y25_stats["zeroDisbursedRows"] += 1

        if app_orgnr:
            agg = by_app_s2[app_orgnr]
            agg["rows"] += 1
            agg["t1"] += t1_val
            agg["supp"] += supp_val
            agg["total"] += tot_val
            if len(agg["excelRows"]) < 5:
                agg["excelRows"].append(rnum)

        if not (len(orgnr) == 9 and orgnr.isdigit()):
            y25_stats["blankOrgnrRows"] += 1
            blank_orgnr_rows.append({
                "year": 2025, "excelRow": rnum,
                "reportedName": name or None, "role": role,
                "applicantOrgnr": app_orgnr or None, "applicantName": app_name or None,
                "decision": decision, "tranche1NOK": t1, "supplementaryNOK": supp, "totalDisbursedNOK": tot,
            })
            continue

        assert mod11_ok(orgnr), f"2025 invalid mod11 orgnr at row {rnum}: {orgnr}"
        y25_stats["validOrgnrRows"] += 1
        c25_org[orgnr] += 1
        rows25_by_org[orgnr].append((rnum, role, app_orgnr, decision, t1_val, supp_val, tot_val))
        rec = ensure_recipient(orgnr)
        rec["rows2025"] += 1
        if name:
            rec["name"] = name
            rec["nameYear"] = 2025
        # Prefer the approved / positive-disbursement row when an org appears twice (e.g. standalone rejected + umbrella approved)
        if rec["role2025"] is None or (tot_val > 0 and (rec["nok2025Total"] or 0) == 0):
            rec["role2025"] = role
            rec["umbrella2025"] = app_orgnr if role == "Underledd" else None
            rec["icnpo2025"] = icnpo or None
        rec["nok2025T1"] = (rec["nok2025T1"] or 0) + t1_val
        rec["nok2025Supp"] = (rec["nok2025Supp"] or 0) + supp_val
        rec["nok2025Total"] = (rec["nok2025Total"] or 0) + tot_val

    y25_stats["distinctOrgnrs"] = len(c25_org)
    y25_stats["duplicateOrgnrs"] = sum(1 for v in c25_org.values() if v > 1)
    y25_stats["inFrivillighetsregisteret"] = sum(1 for o in c25_org if o in friv_map)
    y25_stats["inEnhetsregisteretOnly"] = sum(1 for o in c25_org if o not in friv_map and o in all_orgnrs)
    y25_stats["absentFromBrreg"] = sum(1 for o in c25_org if o not in all_orgnrs)
    y25_stats["byRole"] = dict(sorted(y25_stats["byRole"].items()))
    y25_stats["byDecision"] = dict(sorted(y25_stats["byDecision"].items()))
    for orgnr in sorted(o for o, v in c25_org.items() if v > 1):
        duplicate_orgnr_notes["2025"].append({
            "orgnr": orgnr,
            "name": recipients[orgnr]["name"],
            "rows": [
                {
                    "excelRow": rn, "role": rl, "applicantOrgnr": aorg, "decision": dec,
                    "tranche1NOK": t1v, "supplementaryNOK": sv, "totalDisbursedNOK": tv,
                }
                for rn, rl, aorg, dec, t1v, sv, tv in rows25_by_org[orgnr]
            ],
        })

    # Sheet 1 vs Sheet 2 reconciliation for 2025
    s1_blank_rows = 0
    s1_non_empty = 0
    s1_approved_total = 0
    s1_by_type = Counter()
    s1_by_model = Counter()
    s1_by_decision = Counter()
    s1_discrepancies = []
    umbrellas_2025 = []
    for rnum, row in s25_1[1:]:
        if all(not cell.strip() for cell in row):
            s1_blank_rows += 1
            continue
        s1_non_empty += 1
        app_orgnr = row[0].strip()
        app_name = re.sub(r"\s+", " ", row[1]).strip()
        stype = row[2].strip()
        smodel = row[3].strip()
        sdec = row[4].strip()
        godk = parse_opt_int(row[5] if len(row) > 5 else "") or 0
        org_count = parse_opt_int(row[6] if len(row) > 6 else "") or 0
        s1_by_type[stype] += 1
        s1_by_model[smodel] += 1
        s1_by_decision[sdec] += 1
        s1_approved_total += godk
        agg = by_app_s2.get(app_orgnr, {"rows": 0, "t1": 0, "supp": 0, "total": 0, "excelRows": []})
        if godk != agg["total"]:
            s1_discrepancies.append({
                "orgnr": app_orgnr,
                "name": app_name,
                "applicationType": stype,
                "applicationModel": smodel,
                "decision": sdec,
                "sheet1ExcelRow": rnum,
                "sheet1ApprovedNOK": godk,
                "sheet2MatchedRows": agg["rows"],
                "sheet2ExcelRows": agg["excelRows"],
                "sheet2Tranche1NOK": agg["t1"],
                "sheet2SupplementaryNOK": agg["supp"],
                "sheet2TotalDisbursedNOK": agg["total"],
                "differenceNOK": agg["total"] - godk,
            })
        if stype == "Sentralledd":
            umbrellas_2025.append({
                "orgnr": app_orgnr,
                "name": app_name,
                "applicationModel": smodel,
                "decision": sdec,
                "sheet1ExcelRow": rnum,
                "memberOrganizations": org_count,
                "sheet2MemberRows": agg["rows"],
                "approvedNOK": godk,
                "tranche1NOK": agg["t1"],
                "supplementaryNOK": agg["supp"],
                "totalDisbursedNOK": agg["total"],
                "inFrivillighetsregisteret": app_orgnr in friv_map,
            })

    umbrellas_2025.sort(key=lambda u: (-u["totalDisbursedNOK"], u["orgnr"]))

    reconciliation_2025 = {
        "sheet1InputRows": len(s25_1) - 1,
        "sheet1BlankSpacerRows": s1_blank_rows,
        "sheet1Applications": s1_non_empty,
        "sheet1ByType": dict(sorted(s1_by_type.items())),
        "sheet1ByModel": dict(sorted(s1_by_model.items())),
        "sheet1ByDecision": dict(sorted(s1_by_decision.items())),
        "sheet1ApprovedNOK": s1_approved_total,
        "sheet2Tranche1NOK": y25_stats["tranche1NOK"],
        "sheet2SupplementaryNOK": y25_stats["supplementaryNOK"],
        "sheet2TotalDisbursedNOK": y25_stats["totalDisbursedNOK"],
        "exactKroneMatches": s1_non_empty - len(s1_discrepancies),
        "discrepancyCount": len(s1_discrepancies),
        "discrepancies": s1_discrepancies,
    }

    # 4. Write Registry Edition (public/data/charity-registry/norway)
    reg_dir = os.path.join(out_dir, "charity-registry", "norway")
    os.makedirs(reg_dir, exist_ok=True)
    name_buckets = defaultdict(list)
    id_buckets = defaultdict(list)

    moms_orgnrs = set(recipients.keys())
    matched_in_friv = 0

    for orgnr in sorted(friv_map.keys()):
        e = friv_map[orgnr]
        has_moms = orgnr in moms_orgnrs
        if has_moms:
            matched_in_friv += 1
        bucket = bucket_for_name(e["name"])
        name_buckets[bucket].append([
            e["orgnr"],
            e["name"],
            e["form"],
            e["sector"],
            e["nace"],
            e["muniCode"],
            e["muniName"],
            e["frivDate"],
            e["flags"],
            has_moms,
        ])
        id_buckets[orgnr[:2]].append([orgnr, bucket])

    for bucket in name_buckets:
        name_buckets[bucket].sort(key=lambda r: (normalize_name(r[1]), r[0]))
    for prefix in id_buckets:
        id_buckets[prefix].sort(key=lambda r: r[0])

    name_manifest = {}
    for bucket in sorted(name_buckets.keys()):
        name_manifest[bucket] = write_shard(reg_dir, f"names/{bucket}.json.gz", name_buckets[bucket])
    id_manifest = {}
    for prefix in sorted(id_buckets.keys()):
        id_manifest[prefix] = write_shard(reg_dir, f"ids/{prefix}.json.gz", id_buckets[prefix])

    reg_manifest = {
        "format": "charitology-norway-frivillighetsregisteret-v1",
        "capturedOn": CAPTURED_ON,
        "sourceLastModified": BRREG_LAST_MODIFIED,
        "publisher": SOURCES["enheter_alle.json.gz"]["publisher"],
        "catalogue": SOURCES["enheter_alle.json.gz"]["catalogue"],
        "license": LICENSE_URL,
        "source": {
            "url": SOURCES["enheter_alle.json.gz"]["url"],
            "bytes": SOURCES["enheter_alle.json.gz"]["bytes"],
            "sha256": SOURCES["enheter_alle.json.gz"]["sha256"],
        },
        "fields": [
            "orgnr", "name", "form", "sector", "nace",
            "municipalityCode", "municipalityName", "frivillighetsregisteretDate",
            "flags", "hasMomskompensasjon2023to2025",
        ],
        "counts": {
            "enhetsregisteretEntities": total_enheter,
            "includedOrganizations": len(friv_map),
            "byForm": dict(sorted(by_form.items())),
            "bySector": dict(sorted(by_sector.items())),
            "foundationRegisterOverlap": stift_overlap,
            "vatRegistered": mva_overlap,
            "liquidating": liquidating,
            "bankrupt": bankrupt,
            "unknownMunicipality": unknown_muni,
            "repeatedNormalizedNames": sum(1 for v in norm_name_counts.values() if v > 1),
            "matchedMomskompensasjon2023to2025": matched_in_friv,
        },
        "names": name_manifest,
        "ids": id_manifest,
    }
    with open(os.path.join(reg_dir, "manifest.json"), "wb") as f:
        f.write(pretty_json(reg_manifest))

    # 5. Write Funding Flows Edition (public/data/funding-flows/norway-momskompensasjon)
    flow_dir = os.path.join(out_dir, "funding-flows", "norway-momskompensasjon")
    os.makedirs(flow_dir, exist_ok=True)

    role_code_map = {"Enkeltstående": "E", "Sentralledd": "S", "Underledd": "U", None: None}
    recipient_rows = []
    in_all_three = 0
    in_friv_total = 0
    in_enhet_only_total = 0
    absent_total = 0

    for orgnr in sorted(recipients.keys()):
        r = recipients[orgnr]
        if orgnr in friv_map:
            reg_status = "F"
            in_friv_total += 1
            display_name = r["name"] or friv_map[orgnr]["name"]
        elif orgnr in all_orgnrs:
            reg_status = "E"
            in_enhet_only_total += 1
            display_name = r["name"]
        else:
            reg_status = "N"
            absent_total += 1
            display_name = r["name"]
        if r["rows2023"] > 0 and r["rows2024"] > 0 and r["rows2025"] > 0:
            in_all_three += 1
        recipient_rows.append([
            orgnr,
            display_name,
            reg_status,
            role_code_map[r["role2025"]],
            r["umbrella2025"],
            r["icnpo2025"],
            r["nok2023"],
            r["nok2024"],
            r["nok2025T1"],
            r["nok2025Supp"],
            r["nok2025Total"],
            r["rows2023"] + r["rows2024"] + r["rows2025"],
        ])

    # Sort recipients by 2025 total desc, then 2024 desc, then 2023 desc, then orgnr
    recipient_rows.sort(key=lambda r: (-(r[10] or 0), -(r[7] or 0), -(r[6] or 0), r[0]))
    recipients_asset = write_shard(flow_dir, "recipients.json.gz", recipient_rows)

    anomalies = {
        "format": "charitology-norway-momskompensasjon-anomalies-v1",
        "capturedOn": CAPTURED_ON,
        "sheet1VsSheet2Discrepancies2025": s1_discrepancies,
        "blankOrgnrRowsCount": len(blank_orgnr_rows),
        "blankOrgnrRows": blank_orgnr_rows,
        "duplicateOrgnrCounts": {
            "2023": len(duplicate_orgnr_notes["2023"]),
            "2024": 0,
            "2025": len(duplicate_orgnr_notes["2025"]),
        },
        "duplicateOrgnrRecords": duplicate_orgnr_notes,
    }
    anomalies_bytes = pretty_json(anomalies)
    with open(os.path.join(flow_dir, "anomalies.json"), "wb") as f:
        f.write(anomalies_bytes)

    # Write umbrellas-2025.csv (all 264 Sentralledd umbrella intermediaries in 2025)
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow([
        "orgnr", "name", "applicationModel", "decision", "sheet1ExcelRow",
        "memberOrganizations", "sheet2MemberRows", "approvedNOK",
        "tranche1NOK", "supplementaryNOK", "totalDisbursedNOK", "inFrivillighetsregisteret",
    ])
    for u in umbrellas_2025:
        writer.writerow([
            u["orgnr"], safe_csv_cell(u["name"]), u["applicationModel"], u["decision"],
            u["sheet1ExcelRow"], u["memberOrganizations"], u["sheet2MemberRows"],
            u["approvedNOK"], u["tranche1NOK"], u["supplementaryNOK"], u["totalDisbursedNOK"],
            "true" if u["inFrivillighetsregisteret"] else "false",
        ])
    umbrellas_csv_bytes = ("\ufeff" + csv_buf.getvalue()).encode("utf-8")
    with open(os.path.join(flow_dir, "umbrellas-2025.csv"), "wb") as f:
        f.write(umbrellas_csv_bytes)

    flow_manifest = {
        "format": "charitology-norway-momskompensasjon-v1",
        "capturedOn": CAPTURED_ON,
        "currency": "NOK",
        "publisher": "Lotteri- og stiftelsestilsynet",
        "license": LICENSE_URL,
        "sources": {
            "2023": SOURCES["moms-2023.xlsx"],
            "2024": SOURCES["moms-2024.xlsx"],
            "2025": SOURCES["moms-2025.xlsx"],
        },
        "registrySnapshot": {
            "capturedOn": CAPTURED_ON,
            "sourceLastModified": BRREG_LAST_MODIFIED,
            "sourceSha256": SOURCES["enheter_alle.json.gz"]["sha256"],
            "includedOrganizations": len(friv_map),
        },
        "fields": [
            "orgnr", "name", "registryStatus", "role2025", "umbrellaOrgnr2025", "icnpo2025",
            "nok2023", "nok2024", "nok2025Tranche1", "nok2025Supplement", "nok2025Total", "sourceRowCount",
        ],
        "counts": {
            "totalOrganizationYearRows": y23_stats["inputRows"] + y24_stats["inputRows"] + y25_stats["inputRows"],
            "distinctValidOrgnrs": len(recipient_rows),
            "presentInAllThreeYears": in_all_three,
            "inFrivillighetsregisteret": in_friv_total,
            "inEnhetsregisteretOnly": in_enhet_only_total,
            "absentFromBrreg": absent_total,
            "totalAwardedAndDisbursedNOK": y23_stats["totalAwardedNOK"] + y24_stats["totalAwardedNOK"] + y25_stats["totalDisbursedNOK"],
            "umbrellas2025Count": len(umbrellas_2025),
        },
        "byYear": [y23_stats, y24_stats, y25_stats],
        "reconciliation2025": reconciliation_2025,
        "topUmbrellas2025": umbrellas_2025[:15],
        "asset": recipients_asset,
        "anomalies": {
            "path": "anomalies.json",
            "bytes": len(anomalies_bytes),
            "sha256": sha256_bytes(anomalies_bytes),
        },
        "umbrellasCsv": {
            "path": "umbrellas-2025.csv",
            "rows": len(umbrellas_2025),
            "bytes": len(umbrellas_csv_bytes),
            "sha256": sha256_bytes(umbrellas_csv_bytes),
        },
    }
    with open(os.path.join(flow_dir, "manifest.json"), "wb") as f:
        f.write(pretty_json(flow_manifest))

    print(f"Built Norway Frivillighetsregisteret: {len(friv_map):,} orgs across {len(name_manifest)} name shards + {len(id_manifest)} ID shards.")
    print(f"Built Norway Momskompensasjon 2023-2025: {len(recipient_rows):,} distinct orgnrs ({recipients_asset['bytes']:,} bytes gz), {len(umbrellas_2025)} 2025 umbrellas.")
    print(f"2025 Sheet 1 vs Sheet 2: {reconciliation_2025['exactKroneMatches']:,}/{reconciliation_2025['sheet1Applications']:,} exact matches, {reconciliation_2025['discrepancyCount']} discrepancy.")


if __name__ == "__main__":
    main()
