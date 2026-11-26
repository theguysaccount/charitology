#!/usr/bin/env python3
"""
Build Finland PRH YTJ Non-Profit Associations (AYH) & Foundations (SÄÄ) dataset.

Reads official Finnish Patent and Registration Office (PRH) YTJ v3 open-data
JSON captures (CC BY 4.0) for:
  - companyForm=AYH (code 6: Aatteellinen yhdistys / Ideell förening / Non-profit association)
  - companyForm=SÄÄ (code 18: Säätiö / Stiftelse / Foundation)

Outputs byte-reproducible gzip JSON, UTF-8 BOM CSV, anomalies.json, and SHA-256 manifest.json
under public/data/charity-registry/finland/.

Privacy & accuracy rules:
  - Retains Y-tunnus (validated modulo-11), official & parallel bilingual names, legal form,
    active/ended dates, statutory register memberships, TOL 2008 sector, domicile municipality
    (postOffice city only — zero street addresses or postal codes), and sanitized HTTPS websites.
  - Rejects malformed website strings (including accidental email addresses or street paths)
    and logs exact counts in anomalies.json.
  - Preserves unnamed records (56 entities with empty names: []) as name=null indexed by Y-tunnus.
  - Financial amounts remain unpublished (null); PRH open YTJ v3 covers trade/tax-registered
    nonprofits rather than the separate full Register of Associations or Poliisihallitus permits.
"""
from __future__ import annotations

import collections
import csv
import gzip
import hashlib
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

CAPTURED_ON = "2026-11-25"
PUBLISHER = "Patentti- ja rekisterihallitus (PRH) / Finnish Business Information System (YTJ)"
LICENSE = "CC BY 4.0 (PRH Open Data)"

DEFAULT_INPUT_DIR = Path(
    "/Users/jack/.gemini/antigravity/brain/6348cb4f-91bf-4102-bc32-46a6b3cb1b39/scratch/wave19"
)
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = REPO_ROOT / "public" / "data" / "charity-registry" / "finland"

TRADE_REG_STATUS_LABELS = {
    "0": "Unregistered from Trade Register",
    "1": "Registered in Trade Register",
    "2": "Removed from register",
    "3": "Start-up not registered (Tax/YTJ entry)",
    "4": "Ceased",
}

SITUATION_LABELS = {
    "KONK": "Bankruptcy (Konkurssi)",
    "SANE": "Restructuring (Yrityssaneeraus)",
    "SELV": "Liquidation (Selvitystila)",
}

REGISTER_LABELS = {
    "1": "Trade Register",
    "2": "Foundation Register",
    "3": "Register of Associations",
    "4": "Tax Administration",
    "5": "Prepayment Register",
    "6": "VAT Register",
    "7": "Employer Register",
    "8": "Insurance Premium Taxpayers",
}

ACTIVE_ENTRY_TYPES = {
    "1", "55", "80", "82", "83", "84", "85", "86", "87", "88", "89", "90", "91", "92"
}

DOMAIN_RE = re.compile(
    r"^(?:https?://)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(/[^\s<>@,\"']*)?$",
    re.IGNORECASE,
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def valid_ytunnus(val: str) -> bool:
    m = re.fullmatch(r"(\d{7})-(\d)", val or "")
    if not m:
        return False
    digits = [int(c) for c in m.group(1)]
    weights = [7, 9, 10, 5, 8, 4, 2]
    rem = sum(d * w for d, w in zip(digits, weights)) % 11
    if rem == 1:
        return False
    chk = 0 if rem == 0 else 11 - rem
    return chk == int(m.group(2))


def sanitize_website(raw: str | None) -> tuple[str | None, bool]:
    if not raw:
        return None, False
    s = raw.strip()
    if not s:
        return None, False
    if "@" in s or " " in s or ">" in s or "<" in s or "," in s or s.lower().startswith("javascript:"):
        return None, True
    m = DOMAIN_RE.match(s)
    if not m:
        return None, True
    host = m.group(1).lower()
    tld = host.rsplit(".", 1)[-1]
    if len(tld) < 2 or not tld.isalpha():
        return None, True
    path = m.group(2) or ""
    scheme = "http://" if s.lower().startswith("http://") else "https://"
    return f"{scheme}{host}{path}", False


def csv_safe(val: Any) -> str:
    s = "" if val is None else str(val)
    if s and s.lstrip(" \t\r\n")[:1] in ("=", "+", "-", "@"):
        return "'" + s
    return s


def pick_lang_desc(items: list[dict[str, Any]] | None, code: str) -> str | None:
    if not items:
        return None
    for d in items:
        if d.get("languageCode") == code and d.get("description"):
            return str(d["description"]).strip()
    return None


def extract_municipality(rec: dict[str, Any]) -> str | None:
    # Prefer street-address postOffice (type=1), fallback to postal (type=2); NEVER retain street/postcode.
    addrs = rec.get("addresses") or []
    ordered = sorted(addrs, key=lambda a: (0 if str(a.get("type")) == "1" else 1))
    for addr in ordered:
        pos = addr.get("postOffices") or []
        fi = next((p.get("city") for p in pos if p.get("languageCode") == "1" and p.get("city")), None)
        sv = next((p.get("city") for p in pos if p.get("languageCode") == "2" and p.get("city")), None)
        city = fi or sv or next((p.get("city") for p in pos if p.get("city")), None)
        if city:
            return str(city).strip().upper()
    return None


def extract_names(rec: dict[str, Any]) -> tuple[str | None, list[str]]:
    names = rec.get("names") or []
    if not names:
        return None, []
    # Official primary name: type == "1", prefer active (no endDate), latest version/registrationDate
    type1 = [n for n in names if str(n.get("type")) == "1" and n.get("name")]
    active1 = [n for n in type1 if not n.get("endDate")]
    chosen_pool = active1 or type1 or [n for n in names if n.get("name")]
    chosen_pool.sort(key=lambda n: (n.get("version") or 9999, n.get("registrationDate") or ""))
    primary = str(chosen_pool[0]["name"]).strip() if chosen_pool else None

    # Parallel names (type == "2", e.g., Swedish/English parallel legal names)
    parallels = []
    seen = {primary.casefold()} if primary else set()
    for n in names:
        if str(n.get("type")) == "2" and not n.get("endDate") and n.get("name"):
            val = str(n["name"]).strip()
            if val.casefold() not in seen:
                seen.add(val.casefold())
                parallels.append(val)
    return primary, parallels


def gzip_deterministic(data: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(data)
    return buf.getvalue()


def main() -> None:
    in_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT_DIR
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    ayh_path = in_dir / "finland-prh-ayh.json"
    saa_path = in_dir / "finland-prh-saa.json"
    ayh_raw = json.loads(ayh_path.read_text(encoding="utf-8"))
    saa_raw = json.loads(saa_path.read_text(encoding="utf-8"))

    sources_meta = [
        {
            "id": "prh-ytj-ayh",
            "title": "PRH YTJ Open Data API v3 — Non-profit associations (companyForm=AYH)",
            "url": "https://avoindata.prh.fi/opendata-ytj-api/v3/companies?companyForm=AYH",
            "bytes": ayh_path.stat().st_size,
            "sha256": sha256_file(ayh_path),
            "totalResults": ayh_raw["totalResults"],
            "capturedCount": len(ayh_raw["companies"]),
        },
        {
            "id": "prh-ytj-saa",
            "title": "PRH YTJ Open Data API v3 — Foundations (companyForm=SÄÄ)",
            "url": "https://avoindata.prh.fi/opendata-ytj-api/v3/companies?companyForm=S%C3%84%C3%84",
            "bytes": saa_path.stat().st_size,
            "sha256": sha256_file(saa_path),
            "totalResults": saa_raw["totalResults"],
            "capturedCount": len(saa_raw["companies"]),
        },
    ]

    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    invalid_mod11: list[str] = []
    unnamed_ids: list[str] = []
    missing_reg_date_ids: list[str] = []
    form_transitions: list[dict[str, Any]] = []
    stripped_websites: list[dict[str, str]] = []
    situation_records: list[dict[str, Any]] = []

    by_form = collections.Counter()
    by_form_active = collections.Counter()
    by_trade_status = collections.Counter()
    by_decade = collections.Counter()
    by_sector = collections.Counter()
    sector_desc_votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    by_municipality = collections.Counter()
    active_register_counts = collections.Counter()
    sentinel_1900_ids: list[str] = []

    for query_form, batch in [("AYH", ayh_raw["companies"]), ("SÄÄ", saa_raw["companies"])]:
        for r in batch:
            bid = str(r["businessId"]["value"]).strip()
            if bid in seen_ids:
                raise ValueError(f"Duplicate businessId encountered: {bid}")
            seen_ids.add(bid)

            if not valid_ytunnus(bid):
                invalid_mod11.append(bid)

            cfs = r.get("companyForms") or []
            if len(cfs) > 1:
                form_transitions.append({
                    "businessId": bid,
                    "forms": [{"type": c.get("type"), "endDate": c.get("endDate")} for c in cfs],
                })
            active_cfs = [c for c in cfs if not c.get("endDate")]
            cf = active_cfs[0] if active_cfs else (cfs[0] if cfs else {})
            cf_code = str(cf.get("type") or ("6" if query_form == "AYH" else "18"))
            form_key = "foundation" if cf_code == "18" else "association"
            form_code_label = "SÄÄ" if form_key == "foundation" else "AYH"
            form_fi = pick_lang_desc(cf.get("descriptions"), "1") or ("Säätiö" if form_key == "foundation" else "Aatteellinen yhdistys")
            form_sv = pick_lang_desc(cf.get("descriptions"), "2") or ("Stiftelse" if form_key == "foundation" else "Ideell förening")
            form_en = pick_lang_desc(cf.get("descriptions"), "3") or ("Foundation" if form_key == "foundation" else "Non-profit association")

            primary_name, parallel_names = extract_names(r)
            if primary_name is None:
                unnamed_ids.append(bid)

            reg_date = r.get("registrationDate") or r.get("businessId", {}).get("registrationDate") or None
            if not reg_date:
                missing_reg_date_ids.append(bid)
            else:
                by_decade[f"{reg_date[:3]}0s"] += 1
                if reg_date == "1900-01-01":
                    sentinel_1900_ids.append(bid)

            end_date = r.get("endDate") or None
            status_code = str(r.get("status") or "")
            trade_status = str(r.get("tradeRegisterStatus") or "")
            active = (end_date is None) and (status_code == "2")

            mbl = r.get("mainBusinessLine") or {}
            tol_code = str(mbl.get("type")).strip() if mbl.get("type") else None
            tol_en = pick_lang_desc(mbl.get("descriptions"), "3") or pick_lang_desc(mbl.get("descriptions"), "1")
            if tol_code:
                by_sector[tol_code] += 1
                sector_desc_votes[tol_code][tol_en or tol_code] += 1
            else:
                by_sector["NONE"] += 1

            municipality = extract_municipality(r)
            by_municipality[municipality or "(unknown)"] += 1

            # Active statutory register codes (deduped, sorted)
            act_regs = sorted({
                str(e.get("register"))
                for e in (r.get("registeredEntries") or [])
                if e.get("register") and not e.get("endDate") and str(e.get("type")) in ACTIVE_ENTRY_TYPES
            })
            for reg in act_regs:
                active_register_counts[reg] += 1

            situations = sorted({str(s.get("type")) for s in (r.get("companySituations") or []) if s.get("type")})
            if situations:
                situation_records.append({
                    "businessId": bid,
                    "name": primary_name,
                    "situations": situations,
                })

            raw_web = (r.get("website") or {}).get("url")
            website, was_stripped = sanitize_website(raw_web)
            if was_stripped:
                stripped_websites.append({"businessId": bid, "reason": "malformed_or_non_url"})

            by_form[form_key] += 1
            if active:
                by_form_active[form_key] += 1
            by_trade_status[trade_status] += 1

            records.append({
                "id": bid,
                "name": primary_name,
                "alt": parallel_names,
                "form": form_key,
                "formCode": form_code_label,
                "formFi": form_fi,
                "formSv": form_sv,
                "formEn": form_en,
                "active": active,
                "regDate": reg_date,
                "endDate": end_date,
                "trStatus": trade_status,
                "regs": act_regs,
                "tol": tol_code,
                "sector": tol_en,
                "city": municipality,
                "sit": situations,
                "web": website,
            })

    # Deterministic sort: active first, foundations/associations by name (case-folded, unnamed last), then Y-tunnus
    records.sort(key=lambda x: (0 if x["active"] else 1, 1 if x["name"] is None else 0, (x["name"] or "").casefold(), x["id"]))

    # Serialize organizations.json.gz
    json_bytes = (json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    gz_bytes = gzip_deterministic(json_bytes)
    gz_path = out_dir / "organizations.json.gz"
    gz_path.write_bytes(gz_bytes)

    # Serialize UTF-8 BOM CSV with formula neutralization
    csv_buf = io.StringIO(newline="")
    writer = csv.writer(csv_buf, lineterminator="\r\n")
    writer.writerow([
        "business_id",
        "name",
        "parallel_names",
        "legal_form_code",
        "legal_form_en",
        "legal_form_fi",
        "legal_form_sv",
        "active",
        "registration_date",
        "end_date",
        "trade_register_status",
        "active_registers",
        "tol_2008_code",
        "sector_en",
        "municipality",
        "situations",
        "website",
    ])
    for x in records:
        writer.writerow([
            x["id"],
            csv_safe(x["name"]),
            csv_safe(" | ".join(x["alt"])),
            x["formCode"],
            x["formEn"],
            x["formFi"],
            x["formSv"],
            "true" if x["active"] else "false",
            x["regDate"] or "",
            x["endDate"] or "",
            TRADE_REG_STATUS_LABELS.get(x["trStatus"], x["trStatus"]),
            ",".join(x["regs"]),
            x["tol"] or "",
            csv_safe(x["sector"]),
            csv_safe(x["city"]),
            ",".join(x["sit"]),
            csv_safe(x["web"]),
        ])
    csv_bytes = b"\xef\xbb\xbf" + csv_buf.getvalue().encode("utf-8")
    csv_path = out_dir / "finland-prh-nonprofits.csv"
    csv_path.write_bytes(csv_bytes)

    # Anomalies document (verbatim disclosure, zero PII)
    anomalies = {
        "format": "charitology-finland-anomalies-v1",
        "asOf": CAPTURED_ON,
        "summary": {
            "totalRecords": len(records),
            "invalidMod11BusinessIdsCount": len(invalid_mod11),
            "unnamedRecordsCount": len(unnamed_ids),
            "missingRegistrationDateCount": len(missing_reg_date_ids),
            "legalFormTransitionCount": len(form_transitions),
            "strippedMalformedWebsitesCount": len(stripped_websites),
            "insolvencyOrRestructuringCount": len(situation_records),
            "missingMunicipalityCount": by_municipality["(unknown)"],
            "sentinel1900DateCount": len(sentinel_1900_ids),
        },
        "coverageBoundary": (
            "PRH's CC BY 4.0 opendata-ytj-api/v3 covers the 5,319 non-profit associations (AYH, 4,948) and foundations "
            "(SÄÄ, 371) registered in Finland's Trade Register / YTJ business register (nonprofits with commercial, VAT, "
            "or employer filings). Finland's separate Register of Associations (Yhdistysrekisteri, ~108,000 non-trading "
            "associations) and Register of Foundations (Säätiörekisteri, ~2,700 foundations) are not yet published by PRH "
            "as bulk open data, and public fundraising permits (Rahankeräysluvat) are regulated separately by Poliisihallitus. "
            "Financial statements are not included in this API (null)."
        ),
        "unnamedSampleIds": sorted(unnamed_ids)[:25],
        "missingRegistrationDateIds": sorted(missing_reg_date_ids),
        "sentinel1900DateIds": sorted(sentinel_1900_ids),
        "legalFormTransitions": sorted(form_transitions, key=lambda x: x["businessId"]),
        "insolvencyOrRestructuringRecords": sorted(situation_records, key=lambda x: x["businessId"]),
        "strippedWebsiteBusinessIds": sorted(x["businessId"] for x in stripped_websites),
    }
    anom_bytes = (json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    anom_path = out_dir / "anomalies.json"
    anom_path.write_bytes(anom_bytes)

    # Top sectors (grouped cleanly by TOL code) & municipalities
    top_sectors = [
        {
            "code": code,
            "description": sector_desc_votes[code].most_common(1)[0][0],
            "count": cnt,
        }
        for code, cnt in by_sector.most_common(13)
        if code != "NONE"
    ][:12]
    top_municipalities = [
        {"municipality": m, "count": cnt}
        for m, cnt in by_municipality.most_common(15)
        if m != "(unknown)"
    ]

    # Sample oldest active foundations & associations (historical durability table)
    oldest_active = sorted(
        [x for x in records if x["active"] and x["regDate"] and x["name"]],
        key=lambda x: (x["regDate"], x["id"]),
    )[:15]

    manifest = {
        "format": "charitology-finland-registry-v1",
        "jurisdiction": "FI",
        "jurisdictionName": "Finland",
        "asOf": CAPTURED_ON,
        "capturedOn": CAPTURED_ON,
        "publisher": PUBLISHER,
        "license": LICENSE,
        "catalogues": {
            "prhYtjApi": "https://avoindata.prh.fi/opendata-ytj-api/v3/companies",
            "prhYtjSchema": "https://avoindata.prh.fi/opendata-ytj-api/v3/schema?lang=en",
            "ytjSearch": "https://www.ytj.fi/en/index.html",
            "prhAssociations": "https://yhdistysrekisteri.prh.fi/",
        },
        "sources": sources_meta,
        "counts": {
            "includedOrganizations": len(records),
            "uniqueBusinessIds": len(seen_ids),
            "mod11ValidBusinessIds": len(seen_ids) - len(invalid_mod11),
            "activeOrganizations": sum(1 for x in records if x["active"]),
            "endedOrganizations": sum(1 for x in records if not x["active"]),
            "byForm": {
                "association": by_form["association"],
                "foundation": by_form["foundation"],
            },
            "byFormActive": {
                "association": by_form_active["association"],
                "foundation": by_form_active["foundation"],
            },
            "byTradeRegisterStatus": {
                k: {"label": TRADE_REG_STATUS_LABELS.get(k, k), "count": by_trade_status[k]}
                for k in sorted(by_trade_status)
            },
            "activeStatutoryRegisters": {
                k: {"label": REGISTER_LABELS.get(k, k), "count": active_register_counts[k]}
                for k in sorted(active_register_counts)
            },
            "withParallelNames": sum(1 for x in records if x["alt"]),
            "withVerifiedWebsite": sum(1 for x in records if x["web"]),
            "unnamedRecords": len(unnamed_ids),
            "byRegistrationDecade": dict(sorted(by_decade.items())),
        },
        "topSectors": top_sectors,
        "topMunicipalities": top_municipalities,
        "oldestActiveOrganizations": [
            {
                "id": x["id"],
                "name": x["name"],
                "formCode": x["formCode"],
                "formEn": x["formEn"],
                "regDate": x["regDate"],
                "city": x["city"],
                "sector": x["sector"],
            }
            for x in oldest_active
        ],
        "artifacts": {
            "organizations": {
                "path": "organizations.json.gz",
                "bytes": len(gz_bytes),
                "sha256": sha256_bytes(gz_bytes),
                "decodedBytes": len(json_bytes),
                "decodedSha256": sha256_bytes(json_bytes),
            },
            "csv": {
                "path": "finland-prh-nonprofits.csv",
                "bytes": len(csv_bytes),
                "sha256": sha256_bytes(csv_bytes),
            },
            "anomalies": {
                "path": "anomalies.json",
                "bytes": len(anom_bytes),
                "sha256": sha256_bytes(anom_bytes),
            },
        },
    }
    man_path = out_dir / "manifest.json"
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"Built Finland PRH index: {len(records):,} unique Y-tunnus "
        f"({by_form['association']:,} AYH, {by_form['foundation']:,} SÄÄ; "
        f"{manifest['counts']['activeOrganizations']:,} active, {manifest['counts']['endedOrganizations']:,} ended; "
        f"gz={len(gz_bytes):,} B, csv={len(csv_bytes):,} B)"
    )


if __name__ == "__main__":
    main()
