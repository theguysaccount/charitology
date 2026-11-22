#!/usr/bin/env python3
"""Deterministic builder for Charitology's Israel Charity Index & Foreign State Donations edition.

Reads four official Israel Ministry of Justice (Registrar of Associations) CKAN API snapshots
retained outside public Git:
  1. amutot.json.gz (be5b7935-3922-45d4-9638-08871b17ec95)
  2. pbc.json.gz (85e40960-5426-4f4c-874f-2d1ec1b94609)
  3. proper_management.json.gz (cb12ac14-7429-4268-bc03-460f48157858)
  4. foreign_state_donations.json.gz (35cb40b5-3f13-4bca-9ce2-488085913107)

Produces byte-for-byte deterministic sharded static assets under:
  - <out_root>/charity-registry/israel/
  - <out_root>/funding-flows/israel-foreign-state-donations/
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import shutil
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

CAPTURED_ON = "2026-11-22"

EXPECTED_SOURCES = {
    "amutot.json.gz": {
        "resourceId": "be5b7935-3922-45d4-9638-08871b17ec95",
        "title": "Registered Associations (עמותות רשומות)",
        "url": "https://data.gov.il/api/3/action/datastore_search?resource_id=be5b7935-3922-45d4-9638-08871b17ec95",
        "bytes": 13678071,
        "sha256": "548f7036ae2dd0d4041f37da42361bb03044fc615d77152be3a081abba04b031",
    },
    "pbc.json.gz": {
        "resourceId": "85e40960-5426-4f4c-874f-2d1ec1b94609",
        "title": "Public Benefit Companies (חברות רשומות לתועלת הציבור)",
        "url": "https://data.gov.il/api/3/action/datastore_search?resource_id=85e40960-5426-4f4c-874f-2d1ec1b94609",
        "bytes": 139734,
        "sha256": "aa62fc2ba2b00ac28537e00de6bd010b1e7fe08ac1fd56395557aabf5e123e53",
    },
    "proper_management.json.gz": {
        "resourceId": "cb12ac14-7429-4268-bc03-460f48157858",
        "title": "Certificates of Proper Management (אישור ניהול תקין)",
        "url": "https://data.gov.il/api/3/action/datastore_search?resource_id=cb12ac14-7429-4268-bc03-460f48157858",
        "bytes": 7686676,
        "sha256": "b6b11978f662cc29b596c32efd13ef3f29782d32e538e89f2f75a828cc247df5",
    },
    "foreign_state_donations.json.gz": {
        "resourceId": "35cb40b5-3f13-4bca-9ce2-488085913107",
        "title": "Donations from Foreign State Entities (תרומות מישות מדינית זרה)",
        "url": "https://data.gov.il/api/3/action/datastore_search?resource_id=35cb40b5-3f13-4bca-9ce2-488085913107",
        "bytes": 539030,
        "sha256": "87adf14af5daff30bb6cd80d12aae51b9d1cf125e27c27e2018cc58f9f984dff",
    },
}

CATALOGUE_URL = "https://data.gov.il/dataset/moj-amutot"
LICENSE_URL = "https://data.gov.il/terms"
PUBLISHER = "Israel Ministry of Justice — Registrar of Associations (רשם העמותות)"

# Map Hebrew primary sectors (normalizing MoJ legacy '~' to ',') to concise codes + bilingual labels
SECTORS = {
    "דת": ("REL", "Religion"),
    "חינוך, השכלה והכשרה מקצועית": ("EDU", "Education & vocational training"),
    "שירותי רווחה": ("WEL", "Social welfare services"),
    "קהילה וחברה": ("COM", "Community & society"),
    "ספורט": ("SPO", "Sports"),
    "תרבות או אמנות": ("CUL", "Culture or arts"),
    "בריאות או הצלת חיים": ("HLT", "Health or lifesaving"),
    "מורשת או הנצחה": ("HER", "Heritage or commemoration"),
    "שיכון ופיתוח עירוני": ("HOU", "Housing & urban development"),
    "מחקר, מדע וטכנולוגיה": ("SCI", "Research, science & technology"),
    "ארגוני סנגור, שינוי חברתי ופוליטי": ("ADV", "Advocacy, social & political change"),
    "סביבה ובעלי חיים": ("ENV", "Environment & animals"),
    "איגודים מקצועיים": ("PRO", "Professional associations"),
    "קשרים בינלאומיים": ("INT", "International relations"),
    "התנדבות וקרנות פילנטרופיות": ("PHI", "Volunteering & philanthropic funds"),
}

HEBREW_LETTERS = [chr(cp) for cp in range(0x05D0, 0x05EB)]  # 27 code points including final forms; map final forms to base
FINAL_TO_BASE = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}
BASE_HEBREW = [ch for ch in HEBREW_LETTERS if ch not in FINAL_TO_BASE]  # 22 letters
HEBREW_BUCKET = {ch: f"he-{idx + 1:02d}" for idx, ch in enumerate(BASE_HEBREW)}

ACTIVE_STATUSES = {"רשומה", "פעילה", "החייאה"}
PENDING_STATUSES = {"בתהליכי רישום"}
LIQUIDATION_STATUSES = {
    "בהליכי פירוק מרצון",
    "בפרוק מרצון",
    "ניתן צו פירוק על ידי בית משפט",
    "בפרוק ע~י בימ~ש",
    "הוגשה בקשת פירוק לבית משפט",
    "פירוק זמני",
    "כונס נכסים",
}
PM_STATUS_CODES = {
    "נחתם אישור": "OK",
    "אין אישור": "NO",
    "מבוטל": "REV",
    "מסורב": "REF",
    "בבדיקה מקצועית": "CHK",
    "בטיפול": "PRC",
    "ממתין להשלמות": "PND",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_verified_snapshot(source_dir: Path, filename: str) -> dict[str, Any]:
    path = source_dir / filename
    expected = EXPECTED_SOURCES[filename]
    raw = path.read_bytes()
    if len(raw) != expected["bytes"]:
        raise ValueError(f"{filename}: expected {expected['bytes']} bytes, got {len(raw)}")
    digest = sha256_bytes(raw)
    if digest != expected["sha256"]:
        raise ValueError(f"{filename}: expected sha256 {expected['sha256']}, got {digest}")
    with gzip.GzipFile(fileobj=io.BytesIO(raw), mode="rb") as gz:
        return json.loads(gz.read().decode("utf-8"))


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", (value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^\w\u05d0-\u05ea]+", " ", text)
    text = text.replace("_", " ")
    return re.sub(r"\s+", " ", text).strip()


def bucket_for_hebrew(name: str) -> str:
    norm = normalize_text(name)
    for ch in norm:
        base = FINAL_TO_BASE.get(ch, ch)
        if base in HEBREW_BUCKET:
            return HEBREW_BUCKET[base]
        if "0" <= ch <= "9":
            return "0-9"
        if "a" <= ch <= "z":
            return "latin-other"
        if ch.isalnum():
            return "latin-other"
    return "latin-other"


def il_checkdigit(oid: str) -> bool:
    if not re.fullmatch(r"[0-9]{9}", oid):
        return False
    total = 0
    for idx, ch in enumerate(oid):
        val = int(ch) * (1 if idx % 2 == 0 else 2)
        if val > 9:
            val -= 9
        total += val
    return total % 10 == 0


def parse_date(raw: Any) -> str | None:
    s = str(raw or "").strip()
    if not s:
        return None
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m2 = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if m2:
        return m2.group(1)
    return None


def parse_int(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        return int(round(float(raw)))
    except (TypeError, ValueError):
        return None


def classify_status(status_he: str) -> str:
    if status_he in ACTIVE_STATUSES:
        return "A"
    if status_he in PENDING_STATUSES:
        return "P"
    if status_he in LIQUIDATION_STATUSES:
        return "L"
    return "D"


def normalize_sector(raw: str) -> str | None:
    cleaned = (raw or "").strip().replace("~", ",")
    if not cleaned:
        return None
    entry = SECTORS.get(cleaned)
    return entry[0] if entry else None


def write_gzip_json(path: Path, data: Any) -> dict[str, Any]:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(raw)
    packed = buf.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(packed)
    return {
        "rows": len(data),
        "bytes": len(packed),
        "decodedBytes": len(raw),
        "sha256": sha256_bytes(packed),
        "decodedSha256": sha256_bytes(raw),
    }


def write_json(path: Path, data: Any) -> tuple[int, str]:
    raw = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return len(raw), sha256_bytes(raw)


def build(source_dir: Path, out_root: Path) -> None:
    amutot_doc = load_verified_snapshot(source_dir, "amutot.json.gz")
    pbc_doc = load_verified_snapshot(source_dir, "pbc.json.gz")
    pm_doc = load_verified_snapshot(source_dir, "proper_management.json.gz")
    fsd_doc = load_verified_snapshot(source_dir, "foreign_state_donations.json.gz")

    # 1. Index Proper Management certificates (latest approved year + latest overall status)
    pm_latest_approved: dict[str, int] = {}
    pm_latest_any: dict[str, tuple[int, str]] = {}
    pm_status_counts = Counter()
    pm_year_approved_counts = Counter()

    for r in pm_doc["records"]:
        oid = str(r.get("מספר עמותה") or "").strip().zfill(9)
        yr_int = parse_int(r.get("שנת האישור"))
        val_he = (r.get("האם יש אישור") or "").strip()
        code = PM_STATUS_CODES.get(val_he, "OTH")
        pm_status_counts[code] += 1
        if yr_int is not None:
            if code == "OK":
                pm_year_approved_counts[str(yr_int)] += 1
                if yr_int > pm_latest_approved.get(oid, 0):
                    pm_latest_approved[oid] = yr_int
            prev = pm_latest_any.get(oid)
            if prev is None or yr_int > prev[0] or (yr_int == prev[0] and code == "OK"):
                pm_latest_any[oid] = (yr_int, code)

    # 2. Index Foreign State Donations (2012-2026)
    fsd_by_org: dict[str, dict[str, Any]] = {}
    fsd_by_year: dict[str, dict[str, Any]] = {}
    fsd_by_currency = Counter()
    fsd_by_currency_ils = Counter()
    fsd_by_donor_type = Counter()
    fsd_by_donor_name = Counter()
    fsd_by_donor_rows = Counter()

    fsd_negative_rows: list[dict[str, Any]] = []
    fsd_self_donor_rows: list[dict[str, Any]] = []
    fsd_zero_rows = 0
    fsd_majority_rows = 0

    for r in fsd_doc["records"]:
        oid = str(r.get("מספר עמותה") or "").strip().zfill(9)
        org_name = (r.get("שם עמותה") or "").strip()
        donor = (r.get("ישות מדינית זרה תורמת") or "").strip()
        donor_type = (r.get("סוג ישות מדינית זרה תורמת (קוד)") or "").strip()
        currency = (r.get("מטבע") or "").strip() or "(blank)"
        yr_str = str(r.get("שנת תרומה") or "").strip()
        yr_int = parse_int(yr_str)
        nis = int(round(float(r.get("סכום התרומה בש~ח") or 0)))
        majority = (r.get("עיקר מימון תרומות מישות מדינית זרה") or "").strip() == "כן"

        if majority:
            fsd_majority_rows += 1
        if nis == 0:
            fsd_zero_rows += 1
        elif nis < 0:
            fsd_negative_rows.append(
                {
                    "recordId": r.get("_id"),
                    "orgId": oid,
                    "orgName": org_name,
                    "year": yr_int,
                    "donor": donor,
                    "currency": currency,
                    "ils": nis,
                }
            )

        # Detect obvious self-donor entry (Holocaust Victims Foundation listed as own donor)
        if oid == "580185700" and "רווחת נפגעי השואה" in donor:
            fsd_self_donor_rows.append(
                {
                    "recordId": r.get("_id"),
                    "orgId": oid,
                    "orgName": org_name,
                    "year": yr_int,
                    "quarter": (r.get("רבעון תרומה") or "").strip(),
                    "donor": donor,
                    "currency": currency,
                    "ils": nis,
                    "note": "Published record names the recipient foundation itself in the foreign-state donor field.",
                }
            )

        fsd_by_currency[currency] += 1
        fsd_by_currency_ils[currency] += nis
        fsd_by_donor_type[donor_type] += 1
        if donor:
            fsd_by_donor_name[donor] += nis
            fsd_by_donor_rows[donor] += 1

        if yr_str not in fsd_by_year:
            fsd_by_year[yr_str] = {
                "year": yr_int,
                "rows": 0,
                "distinctOrgs": set(),
                "majorityRows": 0,
                "positiveIls": 0,
                "negativeIls": 0,
                "netIls": 0,
            }
        ys = fsd_by_year[yr_str]
        ys["rows"] += 1
        ys["distinctOrgs"].add(oid)
        if majority:
            ys["majorityRows"] += 1
        ys["netIls"] += nis
        if nis > 0:
            ys["positiveIls"] += nis
        elif nis < 0:
            ys["negativeIls"] += nis

        if oid not in fsd_by_org:
            fsd_by_org[oid] = {
                "id": oid,
                "name": org_name,
                "totalIls": 0,
                "rows": 0,
                "majorityRows": 0,
                "minYear": yr_int,
                "maxYear": yr_int,
                "donors": Counter(),
                "currencies": Counter(),
                "byYear": Counter(),
            }
        o = fsd_by_org[oid]
        o["totalIls"] += nis
        o["rows"] += 1
        if majority:
            o["majorityRows"] += 1
        if yr_int is not None:
            o["minYear"] = yr_int if o["minYear"] is None else min(o["minYear"], yr_int)
            o["maxYear"] = yr_int if o["maxYear"] is None else max(o["maxYear"], yr_int)
            o["byYear"][yr_str] += nis
        if donor:
            o["donors"][donor] += nis
        o["currencies"][currency] += 1

    # 3. Merge Amutot (76,150) + PBC (1,500; 1,447 overlap, 53 PBC-only) into unified 76,203 registry
    pbc_by_id: dict[str, dict[str, Any]] = {}
    for r in pbc_doc["records"]:
        oid = str(r.get("מספר חלצ") or "").strip().zfill(9)
        pbc_by_id[oid] = r

    orgs: dict[str, dict[str, Any]] = {}
    overlap_pbc_count = 0
    pbc_only_count = 0
    non_standard_checkdigit_count = 0

    for r in amutot_doc["records"]:
        oid = str(r.get("מספר עמותה") or "").strip().zfill(9)
        if not il_checkdigit(oid):
            non_standard_checkdigit_count += 1
        is_pbc = oid in pbc_by_id
        if is_pbc:
            overlap_pbc_count += 1
        pbc_rec = pbc_by_id.get(oid)

        he_name = (r.get("שם עמותה בעברית") or "").strip()
        en_name = (r.get("שם עמותה באנגלית") or "").strip() or (
            (pbc_rec.get("שם חלצ באנגלית") or "").strip() if pbc_rec else ""
        ) or None
        status_he = (r.get("סטטוס עמותה") or "").strip()
        status_code = classify_status(status_he)
        sector_code = normalize_sector(r.get("סיווג פעילות ענפי") or "") or (
            normalize_sector(pbc_rec.get("סיווג פעילות ענפי") or "") if pbc_rec else None
        )
        city = (r.get("כתובת - ישוב") or "").strip() or (
            (pbc_rec.get("כתובת - ישוב") or "").strip() if pbc_rec else ""
        ) or None
        reg_date = parse_date(r.get("תאריך רישום עמותה")) or (
            parse_date(pbc_rec.get("תאריך רישום חלצ")) if pbc_rec else None
        )
        fin_year = parse_int(r.get("שנת דיווח דוח כספי אחרון")) or (
            parse_int(pbc_rec.get("שנת דיווח דוח כספי אחרון")) if pbc_rec else None
        )
        revenue_ils = parse_int(r.get("מחזור כספי (הכנסות)"))
        if revenue_ils is None and pbc_rec is not None:
            revenue_ils = parse_int(pbc_rec.get("מחזור - נתונים מדוח מילולי מקוון"))
        raw_exp = parse_int(r.get("סך הוצאות העמותה"))
        # Preserve nonzero expenses; treat 0 as null/unreported (68,516 rows default to 0 in MoJ export)
        expense_ils = raw_exp if (raw_exp is not None and raw_exp != 0) else None
        staff = parse_int(r.get("כמות עובדים"))
        if staff is None and pbc_rec is not None:
            staff = parse_int(pbc_rec.get("עובדים- נתונים מדוח מילולי מקוון"))
        volunteers = parse_int(r.get("כמות מתנדבים"))
        if volunteers is None and pbc_rec is not None:
            volunteers = parse_int(pbc_rec.get("מתנדבים- נתונים מדוח מילולי מקוון"))

        pm_ok_yr = pm_latest_approved.get(oid)
        pm_any = pm_latest_any.get(oid)
        pm_latest_str = f"{pm_any[0]}:{pm_any[1]}" if pm_any else None

        orgs[oid] = {
            "id": oid,
            "type": "P" if is_pbc else "A",
            "heName": he_name,
            "enName": en_name,
            "statusCode": status_code,
            "statusHe": status_he,
            "sectorCode": sector_code,
            "city": city,
            "regDate": reg_date,
            "finYear": fin_year,
            "revenueIls": revenue_ils,
            "expenseIls": expense_ils,
            "staff": staff,
            "volunteers": volunteers,
            "pmLatestApproved": pm_ok_yr,
            "pmLatestStatus": pm_latest_str,
            "hasFsd": oid in fsd_by_org,
        }

    for oid, r in sorted(pbc_by_id.items()):
        if oid in orgs:
            continue
        pbc_only_count += 1
        if not il_checkdigit(oid):
            non_standard_checkdigit_count += 1
        he_name = (r.get("שם חלצ בעברית") or "").strip()
        en_name = (r.get("שם חלצ באנגלית") or "").strip() or None
        status_he = (r.get("סטטוס חלצ") or "").strip()
        pm_ok_yr = pm_latest_approved.get(oid)
        pm_any = pm_latest_any.get(oid)
        orgs[oid] = {
            "id": oid,
            "type": "P",
            "heName": he_name,
            "enName": en_name,
            "statusCode": classify_status(status_he),
            "statusHe": status_he,
            "sectorCode": normalize_sector(r.get("סיווג פעילות ענפי") or ""),
            "city": (r.get("כתובת - ישוב") or "").strip() or None,
            "regDate": parse_date(r.get("תאריך רישום חלצ")),
            "finYear": parse_int(r.get("שנת דיווח דוח כספי אחרון")),
            "revenueIls": parse_int(r.get("מחזור - נתונים מדוח מילולי מקוון")),
            "expenseIls": None,
            "staff": parse_int(r.get("עובדים- נתונים מדוח מילולי מקוון")),
            "volunteers": parse_int(r.get("מתנדבים- נתונים מדוח מילולי מקוון")),
            "pmLatestApproved": pm_ok_yr,
            "pmLatestStatus": f"{pm_any[0]}:{pm_any[1]}" if pm_any else None,
            "hasFsd": oid in fsd_by_org,
        }

    # 4. Write Registry shards
    reg_dir = out_root / "charity-registry" / "israel"
    if reg_dir.exists():
        shutil.rmtree(reg_dir)
    reg_dir.mkdir(parents=True, exist_ok=True)

    name_buckets: dict[str, list[list[Any]]] = defaultdict(list)
    id_buckets: dict[str, list[list[str]]] = defaultdict(list)
    en_index: list[list[str]] = []

    status_counts = Counter()
    type_counts = Counter()
    sector_counts = Counter()
    with_revenue = 0
    revenue_sum_ils = 0
    with_nonzero_expense = 0
    expense_sum_ils = 0
    with_pm_ever = 0
    with_pm_2026_or_2027 = 0
    matched_fsd_in_reg = 0

    for oid in sorted(orgs.keys()):
        o = orgs[oid]
        bucket = bucket_for_hebrew(o["heName"])
        status_counts[o["statusCode"]] += 1
        type_counts[o["type"]] += 1
        sector_counts[o["sectorCode"] or "UNK"] += 1
        if o["revenueIls"] is not None:
            with_revenue += 1
            revenue_sum_ils += o["revenueIls"]
        if o["expenseIls"] is not None:
            with_nonzero_expense += 1
            expense_sum_ils += o["expenseIls"]
        if o["pmLatestApproved"] is not None:
            with_pm_ever += 1
            if o["pmLatestApproved"] >= 2026:
                with_pm_2026_or_2027 += 1
        if o["hasFsd"]:
            matched_fsd_in_reg += 1

        name_buckets[bucket].append(
            [
                o["id"],
                o["type"],
                o["heName"],
                o["enName"],
                o["statusCode"],
                o["statusHe"],
                o["sectorCode"],
                o["city"],
                o["regDate"],
                o["finYear"],
                o["revenueIls"],
                o["expenseIls"],
                o["staff"],
                o["volunteers"],
                o["pmLatestApproved"],
                o["pmLatestStatus"],
                o["hasFsd"],
            ]
        )
        id_buckets[oid[:2]].append([oid, bucket])
        if o["enName"]:
            en_index.append([oid, bucket, o["enName"]])

    names_manifest: dict[str, Any] = {}
    for bucket in sorted(name_buckets.keys()):
        rows = sorted(name_buckets[bucket], key=lambda r: (normalize_text(r[2]), r[0]))
        meta = write_gzip_json(reg_dir / "names" / f"{bucket}.json.gz", rows)
        names_manifest[bucket] = {"path": f"names/{bucket}.json.gz", **meta}

    ids_manifest: dict[str, Any] = {}
    for prefix in sorted(id_buckets.keys()):
        rows = sorted(id_buckets[prefix], key=lambda r: r[0])
        meta = write_gzip_json(reg_dir / "ids" / f"{prefix}.json.gz", rows)
        ids_manifest[prefix] = {"path": f"ids/{prefix}.json.gz", **meta}

    en_index.sort(key=lambda r: (normalize_text(r[2]), r[0]))
    en_meta = write_gzip_json(reg_dir / "en.json.gz", en_index)

    sector_table = {code: {"en": en_label, "he": he_label, "count": sector_counts[code]} for he_label, (code, en_label) in SECTORS.items()}

    reg_manifest = {
        "format": "charitology-israel-moj-v1",
        "capturedOn": CAPTURED_ON,
        "publisher": PUBLISHER,
        "catalogue": CATALOGUE_URL,
        "license": LICENSE_URL,
        "sources": {
            "amutot": EXPECTED_SOURCES["amutot.json.gz"],
            "pbc": EXPECTED_SOURCES["pbc.json.gz"],
            "properManagement": EXPECTED_SOURCES["proper_management.json.gz"],
        },
        "fields": [
            "id",
            "type",
            "heName",
            "enName",
            "statusCode",
            "statusHe",
            "sectorCode",
            "city",
            "regDate",
            "finYear",
            "revenueIls",
            "expenseIls",
            "staff",
            "volunteers",
            "pmLatestApproved",
            "pmLatestStatus",
            "hasFsd",
        ],
        "sectors": sector_table,
        "counts": {
            "amutotSourceRows": len(amutot_doc["records"]),
            "pbcSourceRows": len(pbc_doc["records"]),
            "pbcOverlapWithAmutot": overlap_pbc_count,
            "pbcOnlyAdded": pbc_only_count,
            "includedOrganizations": len(orgs),
            "byType": {"Amuta": type_counts["A"], "PublicBenefitCompany": type_counts["P"]},
            "byStatus": {
                "active": status_counts["A"],
                "pendingRegistration": status_counts["P"],
                "inLiquidation": status_counts["L"],
                "dissolvedOrStruckOff": status_counts["D"],
            },
            "withEnglishName": len(en_index),
            "withReportedRevenue": with_revenue,
            "reportedRevenueSumIls": revenue_sum_ils,
            "withNonzeroReportedExpense": with_nonzero_expense,
            "reportedNonzeroExpenseSumIls": expense_sum_ils,
            "properManagementSourceRows": len(pm_doc["records"]),
            "withProperManagementApprovedEver": with_pm_ever,
            "withProperManagement2026Or2027": with_pm_2026_or_2027,
            "nonStandardLegacyCheckDigitIds": non_standard_checkdigit_count,
            "matchedForeignStateDonations2012to2026": matched_fsd_in_reg,
        },
        "englishIndex": {"path": "en.json.gz", **en_meta},
        "names": names_manifest,
        "ids": ids_manifest,
    }
    write_json(reg_dir / "manifest.json", reg_manifest)

    # 5. Write Foreign State Donations funding-flows edition
    flow_dir = out_root / "funding-flows" / "israel-foreign-state-donations"
    if flow_dir.exists():
        shutil.rmtree(flow_dir)
    flow_dir.mkdir(parents=True, exist_ok=True)

    recipient_rows: list[list[Any]] = []
    unmatched_fsd_orgs: list[dict[str, Any]] = []

    for oid, rec in sorted(fsd_by_org.items(), key=lambda kv: (-kv[1]["totalIls"], kv[0])):
        reg_org = orgs.get(oid)
        in_reg = reg_org is not None
        if not in_reg:
            is_test = "טסט" in rec["name"]
            unmatched_fsd_orgs.append(
                {
                    "id": oid,
                    "name": rec["name"],
                    "totalIls": rec["totalIls"],
                    "rows": rec["rows"],
                    "suspectedProductionTestRecord": is_test,
                }
            )
        top_donor = (
            sorted(rec["donors"].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
            if rec["donors"]
            else None
        )
        currencies = "|".join(sorted(rec["currencies"].keys()))
        by_yr_sorted = {yr: rec["byYear"][yr] for yr in sorted(rec["byYear"].keys())}
        recipient_rows.append(
            [
                oid,
                reg_org["heName"] if reg_org else rec["name"],
                reg_org["enName"] if reg_org else None,
                reg_org["type"] if reg_org else "U",
                in_reg,
                reg_org["sectorCode"] if reg_org else None,
                reg_org["pmLatestApproved"] if reg_org else None,
                rec["totalIls"],
                rec["rows"],
                rec["majorityRows"],
                rec["minYear"],
                rec["maxYear"],
                top_donor,
                currencies,
                by_yr_sorted,
            ]
        )

    recipients_meta = write_gzip_json(flow_dir / "recipients.json.gz", recipient_rows)

    yearly_summary = []
    for yr_str in sorted(fsd_by_year.keys()):
        ys = fsd_by_year[yr_str]
        yearly_summary.append(
            {
                "year": ys["year"],
                "rows": ys["rows"],
                "distinctOrgs": len(ys["distinctOrgs"]),
                "majorityRows": ys["majorityRows"],
                "positiveIls": ys["positiveIls"],
                "negativeIls": ys["negativeIls"],
                "netIls": ys["netIls"],
            }
        )

    total_net_ils = sum(y["netIls"] for y in yearly_summary)
    total_pos_ils = sum(y["positiveIls"] for y in yearly_summary)
    total_neg_ils = sum(y["negativeIls"] for y in yearly_summary)
    assert sum(r[7] for r in recipient_rows) == total_net_ils

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow(["year", "rows", "distinct_orgs", "majority_funding_rows", "positive_ils", "negative_ils", "net_ils"])
    for y in yearly_summary:
        writer.writerow([y["year"], y["rows"], y["distinctOrgs"], y["majorityRows"], y["positiveIls"], y["negativeIls"], y["netIls"]])
    csv_raw = ("\ufeff" + csv_buf.getvalue()).encode("utf-8")
    (flow_dir / "yearly-2012-2026.csv").write_bytes(csv_raw)

    top_recipients = [
        {
            "id": r[0],
            "heName": r[1],
            "enName": r[2],
            "type": r[3],
            "inRegistry": r[4],
            "sectorCode": r[5],
            "pmLatestApproved": r[6],
            "totalIls": r[7],
            "rows": r[8],
            "majorityRows": r[9],
            "minYear": r[10],
            "maxYear": r[11],
            "topDonor": r[12],
        }
        for r in recipient_rows[:15]
    ]

    top_donors = [
        {"donorRaw": dn, "totalIls": ils, "rows": fsd_by_donor_rows[dn]}
        for dn, ils in sorted(fsd_by_donor_name.items(), key=lambda kv: (-kv[1], kv[0]))[:15]
    ]

    top_currencies = [
        {"currencyRaw": cur, "rows": cnt, "netIls": fsd_by_currency_ils[cur]}
        for cur, cnt in sorted(fsd_by_currency.items(), key=lambda kv: (-kv[1], kv[0]))[:12]
    ]

    anomalies = {
        "format": "charitology-israel-foreign-state-donations-anomalies-v1",
        "capturedOn": CAPTURED_ON,
        "unmatchedRecipientIdsCount": len(unmatched_fsd_orgs),
        "suspectedProductionTestRecipientsCount": sum(1 for u in unmatched_fsd_orgs if u["suspectedProductionTestRecord"]),
        "suspectedProductionTestTotalIls": sum(u["totalIls"] for u in unmatched_fsd_orgs if u["suspectedProductionTestRecord"]),
        "unmatchedRecipients": unmatched_fsd_orgs,
        "selfDonorFilingAnomaliesCount": len(fsd_self_donor_rows),
        "selfDonorFilingAnomalies": fsd_self_donor_rows,
        "negativeAdjustmentRowsCount": len(fsd_negative_rows),
        "negativeAdjustmentTotalIls": total_neg_ils,
        "negativeAdjustmentRows": fsd_negative_rows,
        "zeroIlsRowsCount": fsd_zero_rows,
        "gbpCurrencySynonymRows": {
            "פאונד אנגלי": fsd_by_currency.get("פאונד אנגלי", 0),
            "לירה שטרלינג": fsd_by_currency.get("לירה שטרלינג", 0),
        },
        "nonStandardLegacyCheckDigitIdsInRegistry": non_standard_checkdigit_count,
    }
    anom_bytes, anom_sha = write_json(flow_dir / "anomalies.json", anomalies)

    flow_manifest = {
        "format": "charitology-israel-foreign-state-donations-v1",
        "capturedOn": CAPTURED_ON,
        "currency": "ILS",
        "publisher": PUBLISHER,
        "catalogue": CATALOGUE_URL,
        "license": LICENSE_URL,
        "source": EXPECTED_SOURCES["foreign_state_donations.json.gz"],
        "registrySnapshot": {
            "capturedOn": CAPTURED_ON,
            "amutotSha256": EXPECTED_SOURCES["amutot.json.gz"]["sha256"],
            "pbcSha256": EXPECTED_SOURCES["pbc.json.gz"]["sha256"],
            "includedOrganizations": len(orgs),
        },
        "fields": [
            "id",
            "heName",
            "enName",
            "type",
            "inRegistry",
            "sectorCode",
            "pmLatestApproved",
            "totalIls",
            "rows",
            "majorityRows",
            "minYear",
            "maxYear",
            "topDonor",
            "currencies",
            "byYear",
        ],
        "counts": {
            "totalDisclosureRows": len(fsd_doc["records"]),
            "distinctRecipients": len(recipient_rows),
            "matchedInRegistry": matched_fsd_in_reg,
            "absentFromRegistry": len(unmatched_fsd_orgs),
            "suspectedProductionTestIds": anomalies["suspectedProductionTestRecipientsCount"],
            "suspectedProductionTestTotalIls": anomalies["suspectedProductionTestTotalIls"],
            "majorityForeignStateFundedRows": fsd_majority_rows,
            "zeroIlsRows": fsd_zero_rows,
            "negativeAdjustmentRows": len(fsd_negative_rows),
            "positiveIls": total_pos_ils,
            "negativeIls": total_neg_ils,
            "netIls": total_net_ils,
            "distinctCurrencies": len(fsd_by_currency),
        },
        "byYear": yearly_summary,
        "topRecipients": top_recipients,
        "topDonorsRaw": top_donors,
        "topCurrencies": top_currencies,
        "asset": {"path": "recipients.json.gz", **recipients_meta},
        "anomalies": {"path": "anomalies.json", "bytes": anom_bytes, "sha256": anom_sha},
        "yearlyCsv": {
            "path": "yearly-2012-2026.csv",
            "rows": len(yearly_summary),
            "bytes": len(csv_raw),
            "sha256": sha256_bytes(csv_raw),
        },
    }
    write_json(flow_dir / "manifest.json", flow_manifest)

    print(
        f"Built Israel edition: {len(orgs):,} merged orgs "
        f"({type_counts['A']:,} Amutot, {type_counts['P']:,} PBCs; {status_counts['A']:,} active; "
        f"{with_revenue:,} with revenue totaling ILS {revenue_sum_ils:,}; {with_pm_2026_or_2027:,} with 2026-2027 Proper Management) + "
        f"{len(recipient_rows):,} foreign-state donation recipients ({len(fsd_doc['records']):,} rows, ILS {total_net_ils:,} net; "
        f"{matched_fsd_in_reg} matched, {len(unmatched_fsd_orgs)} absent incl. {anomalies['suspectedProductionTestRecipientsCount']} production test IDs)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--out-root", default=Path("public/data"), type=Path)
    args = parser.parse_args()
    build(args.source_dir, args.out_root)


if __name__ == "__main__":
    main()
