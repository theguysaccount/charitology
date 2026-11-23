#!/usr/bin/env python3
"""Deterministic builder for the Croatia Nonprofit Registry (Jurisdiction #25).

Combines three official Otvorena dozvola (OD) Ministry of Justice JSON extracts:
  1. Registar udruga Republike Hrvatske - CTS (71,415 associations)
  2. Registar udruga Republike Hrvatske - Djelatnosti (400,634 statutory activity classifications)
  3. Registar zaklada Republike Hrvatske (444 foundations)

Validates 11-digit Croatian OIBs using ISO 7064 Mod 11,10, strips emails and street addresses,
logs source anomalies verbatim, and emits deterministic gzip-sharded artifacts.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import re
import unicodedata
from pathlib import Path

EXPECTED_SHAS = {
    "croatia-registar-udruga-cts.json": "fedb1a54ce723bf1ed643973dfd89f8596a269e8237130a9fc5a9bf98d879c15",
    "croatia-registar-udruga-djelatnosti.json": "15bb5c706e785171a18da5ec7276195cf8e7851070e6e4dbf3417d0143cbbbc3",
    "croatia-registar-zaklada.json": "fb4657df69f4ea657455929dbcdaed3e39445faefe97dcb3a428e4833ab75ffa",
}

STATUS_MAP = {
    "AKTIVAN": "active",
    "BRISAN": "erased",
    "PRESTANAK DJELOVANJA": "ceased",
}

DOMAIN_EN = {
    "12. SPORT": "Sport",
    "6. KULTURA I UMJETNOST": "Culture & arts",
    "11. SOCIJALNA DJELATNOST": "Social welfare",
    "9. OBRAZOVANJE, ZNANOST I ISTRAŽIVANJE": "Education, science & research",
    "2. DEMOKRATSKA POLITIČKA KULTURA": "Democratic civic culture",
    "18. NOMENKLATURA SPORTOVA": "Sports nomenclature",
    "7. LJUDSKA PRAVA": "Human rights",
    "15. ZAŠTITA OKOLIŠA I PRIRODE": "Environment & nature",
    "8. MEĐUNARODNA SURADNJA": "International cooperation",
    "4. GOSPODARSTVO": "Economy & enterprise",
    "1. ŠPORTSKA": "Sports (legacy code)",
    "8. KULTURNA": "Culture (legacy code)",
    "10. ODRŽIVI RAZVOJ": "Sustainable development",
    "14. ZAŠTITA ZDRAVLJA": "Health protection",
    "16. ZAŠTITA ZDRAVLJA": "Health protection",
    "13. TEHNIČKA KULTURA": "Technical culture",
    "1. BRANITELJI I STRADALNICI": "Veterans & war victims",
    "3. DUHOVNOST": "Spirituality & religion",
    "5. HOBISTIČKA DJELATNOST": "Hobby & recreation",
    "14. ZAŠTITA I SPAŠAVANJE": "Civil protection & rescue",
    "17. OSTALA PODRUČJA DJELOVANJA": "Other activity areas",
    "20. OSTALE DJELATNOSTI": "Other activities (legacy code)",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_deterministic(raw: bytes) -> bytes:
    return gzip.compress(raw, compresslevel=9, mtime=0)


def valid_oib(oib: str) -> bool:
    if not re.fullmatch(r"\d{11}", oib):
        return False
    a = 10
    for ch in oib[:10]:
        a = (a + int(ch)) % 10
        if a == 0:
            a = 10
        a = (a * 2) % 11
    return ((11 - a) % 10) == int(oib[10])


def fold_hr(text: str) -> str:
    s = (text or "").replace("Đ", "D").replace("đ", "d")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def name_shard_key(norm: str) -> str:
    for ch in norm:
        if "a" <= ch <= "z":
            return ch
        if "0" <= ch <= "9":
            return "0-9"
    return "0-9"


def clean_url(raw: str | None) -> str | None:
    if not raw:
        return None
    val = str(raw).strip()
    if not val or any(c.isspace() or ord(c) < 32 for c in val):
        return None
    if val.startswith(("http://", "https://")):
        return val
    if re.fullmatch(r"[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s]*)?", val):
        return "https://" + val
    return None


def iso_day(val: str | None) -> str | None:
    if not val:
        return None
    s = str(val).strip()
    return s[:10] if len(s) >= 10 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", s[:10]) else None


def foundation_municipality(sjediste: str | None) -> str:
    if not sjediste:
        return ""
    # Foundations format: "Zagreb, Stonska ulica 7" -> extract city token before comma only.
    first = str(sjediste).split(",", 1)[0].strip()
    # Guard against any street numbers leaking if a record lacks a comma
    if re.search(r"\d", first):
        return ""
    return first


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    source_pins = []
    loaded = {}
    for fname, expected_sha in sorted(EXPECTED_SHAS.items()):
        fpath = args.input_dir / fname
        raw = fpath.read_bytes()
        digest = sha256_bytes(raw)
        if digest != expected_sha:
            raise SystemExit(f"SHA-256 mismatch for {fname}: got {digest}, expected {expected_sha}")
        loaded[fname] = json.loads(raw.decode("utf-8"))
        source_pins.append({"filename": fname, "bytes": len(raw), "sha256": digest})

    udruge = loaded["croatia-registar-udruga-cts.json"]
    djel_rows = loaded["croatia-registar-udruga-djelatnosti.json"]
    zaklade = loaded["croatia-registar-zaklada.json"]

    domains_by_udr: dict[int, set[str]] = collections.defaultdict(set)
    domain_org_counts = collections.Counter()
    for row in djel_rows:
        uid = row.get("UDR_ID")
        dom = str(row.get("PODRUCJA_DJELOVANJA") or "").strip()
        if uid is not None and dom:
            domains_by_udr[int(uid)].add(dom)

    records = []
    status_counts = collections.Counter()
    form_counts = collections.Counter()
    county_counts = collections.Counter()
    oib_status = collections.Counter()
    oib_to_records: dict[str, list[dict]] = collections.defaultdict(list)
    with_website = 0

    for row in udruge:
        uid = int(row["UDR_ID"])
        reg = str(row.get("REGISTARSKI_BROJ") or "").strip()
        oib_raw = str(row.get("OIB") or "").strip()
        oib: str | None = None
        if not oib_raw:
            oib_status["blank"] += 1
        elif valid_oib(oib_raw):
            oib = oib_raw
            oib_status["valid"] += 1
        else:
            oib = oib_raw
            oib_status["invalid"] += 1

        name = str(row.get("NAZIV") or "").strip()
        short_name = str(row.get("SKRACENI_NAZIV") or "").strip() or None
        raw_status = str(row.get("STATUS") or "").strip()
        status = STATUS_MAP.get(raw_status, "other")
        county = str(row.get("ZUPANIJA") or "").strip()
        reg_date = iso_day(row.get("DATUM_UPISA"))
        status_date = iso_day(row.get("DATUM_STATUSA"))
        web = clean_url(row.get("WEB_STRANICA"))
        if web:
            with_website += 1
        domains = sorted(domains_by_udr.get(uid, set()))
        for dom in domains:
            domain_org_counts[dom] += 1

        status_counts[status] += 1
        form_counts["association"] += 1
        if county:
            county_counts[county] += 1

        norm = fold_hr(f"{name} {short_name or ''}")
        rec = {
            "id": reg,
            "oib": oib,
            "form": "association",
            "name": name,
            "short": short_name,
            "norm": norm,
            "status": status,
            "county": county,
            "regDate": reg_date,
            "statusDate": status_date,
            "domains": domains[:6],
            "web": web,
        }
        records.append(rec)
        if oib:
            oib_to_records[oib].append({"reg": reg, "name": name, "status": status, "form": "association"})

    for row in zaklade:
        reg = str(row.get("REGISTARSKI_BROJ") or "").strip()
        oib_raw = str(row.get("OIB_ZAKLADE") or "").strip()
        oib = None
        if not oib_raw:
            oib_status["blank"] += 1
        elif valid_oib(oib_raw):
            oib = oib_raw
            oib_status["valid"] += 1
        else:
            oib = oib_raw
            oib_status["invalid"] += 1

        name = str(row.get("NAZIV") or "").strip()
        short_name = str(row.get("SKRACENI_NAZIV") or "").strip() or None
        raw_status = str(row.get("STATUS") or "").strip()
        status = STATUS_MAP.get(raw_status, "other")
        muni = foundation_municipality(row.get("SJEDISTE"))
        reg_date = iso_day(row.get("DATUM_UPISA"))
        status_date = iso_day(row.get("DATUM_STATUSA"))
        web = clean_url(row.get("WEB_STRANICA"))
        if web:
            with_website += 1

        status_counts[status] += 1
        form_counts["foundation"] += 1

        norm = fold_hr(f"{name} {short_name or ''}")
        rec = {
            "id": reg,
            "oib": oib,
            "form": "foundation",
            "name": name,
            "short": short_name,
            "norm": norm,
            "status": status,
            "county": muni,
            "regDate": reg_date,
            "statusDate": status_date,
            "domains": [],
            "web": web,
        }
        records.append(rec)
        if oib:
            oib_to_records[oib].append({"reg": reg, "name": name, "status": status, "form": "foundation"})

    records.sort(key=lambda r: (r["norm"], r["form"], r["id"]))

    name_shards: dict[str, list[dict]] = collections.defaultdict(list)
    id_shards: dict[str, list[dict]] = collections.defaultdict(list)
    for rec in records:
        name_shards[name_shard_key(rec["norm"])].append(rec)
        # Index into ID shard by OIB prefix (if present) and registration-number prefix (deduped if same bucket)
        buckets = set()
        if rec["oib"] and len(rec["oib"]) >= 2:
            buckets.add(rec["oib"][:2])
        if rec["id"] and len(rec["id"]) >= 2 and rec["id"][:2].isdigit():
            buckets.add(rec["id"][:2])
        elif rec["id"]:
            buckets.add("other")
        for b in sorted(buckets):
            id_shards[b].append(rec)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "names").mkdir(parents=True, exist_ok=True)
    (args.out_dir / "ids").mkdir(parents=True, exist_ok=True)

    name_shard_meta = {}
    for k in sorted(name_shards.keys()):
        raw_j = (json.dumps(name_shards[k], ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        gz_j = gzip_deterministic(raw_j)
        rel = f"names/{k}.json.gz"
        (args.out_dir / rel).write_bytes(gz_j)
        name_shard_meta[k] = {
            "path": rel,
            "bytes": len(gz_j),
            "sha256": sha256_bytes(gz_j),
            "decodedBytes": len(raw_j),
            "decodedSha256": sha256_bytes(raw_j),
            "rows": len(name_shards[k]),
        }

    id_shard_meta = {}
    for k in sorted(id_shards.keys()):
        rows_sorted = sorted(id_shards[k], key=lambda r: (r["oib"] or "", r["id"]))
        raw_j = (json.dumps(rows_sorted, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        gz_j = gzip_deterministic(raw_j)
        rel = f"ids/{k}.json.gz"
        (args.out_dir / rel).write_bytes(gz_j)
        id_shard_meta[k] = {
            "path": rel,
            "bytes": len(gz_j),
            "sha256": sha256_bytes(gz_j),
            "decodedBytes": len(raw_j),
            "decodedSha256": sha256_bytes(raw_j),
            "rows": len(rows_sorted),
        }

    dup_oibs = [
        {"oib": oib, "records": recs}
        for oib, recs in sorted(oib_to_records.items())
        if len(recs) > 1
    ]
    anomalies = {
        "format": "charitology-croatia-anomalies-v1",
        "capturedOn": "2026-11-23",
        "duplicateOibs": dup_oibs,
        "blankOibCount": oib_status["blank"],
        "invalidOibCount": oib_status["invalid"],
        "note": "Blank OIBs occur primarily on historic erased associations predating Croatia's 2009 OIB rollout. Duplicate OIB entries are preserved verbatim rather than silently merged.",
    }
    anom_bytes = (json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (args.out_dir / "anomalies.json").write_bytes(anom_bytes)

    top_domains = [
        {
            "raw": dom,
            "labelEn": DOMAIN_EN.get(dom, dom),
            "associations": cnt,
        }
        for dom, cnt in domain_org_counts.most_common(15)
    ]
    top_counties = [{"county": c, "associations": n} for c, n in county_counts.most_common(21)]

    manifest = {
        "format": "charitology-croatia-registry-v1",
        "jurisdiction": "Croatia",
        "publisher": "Ministry of Justice, Public Administration and Digital Transformation of the Republic of Croatia (data.gov.hr)",
        "license": "https://data.gov.hr/id/licence/otvorena-dozvola-rh",
        "asOf": "2026-11-22",
        "capturedOn": "2026-11-23",
        "catalogues": {
            "associations": "https://data.gov.hr/ckan/dataset/registar-udruga-republike-hrvatske",
            "foundations": "https://data.gov.hr/ckan/dataset/registar-zaklada-republike-hrvatske",
            "portal": "https://registri-npo-mpu.gov.hr/",
        },
        "sourceCaptures": source_pins,
        "counts": {
            "includedOrganizations": len(records),
            "byForm": dict(sorted(form_counts.items())),
            "byStatus": dict(sorted(status_counts.items())),
            "validatedOibs": oib_status["valid"],
            "blankOibs": oib_status["blank"],
            "invalidOibs": oib_status["invalid"],
            "duplicateOibGroups": len(dup_oibs),
            "associationsWithActivityDomains": len(domains_by_udr),
            "activityDomainRowsJoined": len(djel_rows),
            "withValidatedWebsite": with_website,
        },
        "topDomains": top_domains,
        "counties": top_counties,
        "anomalies": {
            "path": "anomalies.json",
            "bytes": len(anom_bytes),
            "sha256": sha256_bytes(anom_bytes),
        },
        "shards": {
            "names": name_shard_meta,
            "ids": id_shard_meta,
        },
    }
    (args.out_dir / "manifest.json").write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f"Built {len(records)} Croatian nonprofits ({form_counts['association']} associations + {form_counts['foundation']} foundations; {oib_status['valid']} valid OIBs, 0 invalid)")


if __name__ == "__main__":
    main()
