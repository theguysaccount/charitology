#!/usr/bin/env python3
"""Deterministic builder for Charitology's Netherlands Charity Index & Rijksfinancien edition.

Reads official CC0 public-domain archives retained outside public Git:
  1. Belastingdienst ANBI bulk XML archive (anbi.zip -> anbi.xml)
  2. Ministerie van Financien executed budget recipients (Financiele_instrumenten_2017-2024.csv)

Produces byte-for-byte deterministic sharded static assets under:
  - <out_root>/charity-registry/netherlands/
  - <out_root>/funding-flows/netherlands-rijksfinancien/
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
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

CAPTURED_ON = "2026-11-22"

EXPECTED_SOURCES = {
    "anbi.zip": {
        "publisher": "Belastingdienst",
        "catalogue": "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/open_data_anbi",
        "url": "https://download.belastingdienst.nl/data/anbi/anbi.zip",
        "license": "https://creativecommons.org/publicdomain/zero/1.0/",
        "bytes": 2614816,
        "sha256": "2f298ec9f4d3fbcd17598a052e72c550802ffa1e0c09cb5c6af015fb83113670",
    },
    "Financiele_instrumenten_2017-2024.csv": {
        "publisher": "Ministerie van Financiën (Rijksfinanciën)",
        "catalogue": "https://www.rijksfinancien.nl/open-data/Financi%C3%ABle%20Instrumenten",
        "url": "https://www.rijksfinancien.nl/sites/default/files/bestanden/open_data/Financiele_instrumenten_2017-2024.csv",
        "license": "https://creativecommons.org/publicdomain/zero/1.0/",
        "licenseNoteUrl": "https://www.rijksfinancien.nl/copyright",
        "bytes": 70532379,
        "sha256": "93b169982e6fef13476a633d6009bfc0d45ec3ccb2ea4e0df06606f6c9350aae",
    },
}

NONPROFIT_RECHTSVORMEN = {
    "Stichting": "S",
    "Vereniging": "V",
    "Vereniging met volledige rechtsbevoegdheid": "V",
    "Kerkgenootschap": "K",
}
VVE_RECHTSVORMEN = {"Vereniging van Eigenaars", "Vereniging van Eigenaren"}
SUBSIDY_INSTRUMENT = "Subsidies (regelingen)"
INCLUDED_YEARS = ("2020", "2021", "2022", "2023", "2024")

CHAPTER_CANONICAL_NAMES = {
    "A": "Mobiliteitsfonds",
    "F": "Diergezondheidsfonds",
    "IV": "Koninkrijksrelaties",
    "IX": "Financiën",
    "J": "Deltafonds",
    "V": "Buitenlandse Zaken",
    "VI": "Justitie en Veiligheid",
    "VII": "Binnenlandse Zaken en Koninkrijksrelaties",
    "VIII": "Onderwijs, Cultuur en Wetenschap",
    "X": "Defensie",
    "XII": "Infrastructuur en Waterstaat",
    "XIII": "Economische Zaken en Klimaat",
    "XIV": "Landbouw, Natuur en Voedselkwaliteit",
    "XV": "Sociale Zaken en Werkgelegenheid",
    "XVI": "Volksgezondheid, Welzijn en Sport",
    "XVII": "Buitenlandse Handel en Ontwikkelingssamenwerking / Ontwikkelingshulp",
}

HOST_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::\d{2,5})?(?:/[^\s<>\"']*)?$", re.I)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_file(path: Path, expected: dict[str, Any]) -> bytes:
    if not path.exists():
        raise FileNotFoundError(f"Missing required source file: {path}")
    raw = path.read_bytes()
    if len(raw) != expected["bytes"]:
        raise ValueError(f"{path.name}: expected {expected['bytes']} bytes, got {len(raw)}")
    digest = sha256_bytes(raw)
    if digest != expected["sha256"]:
        raise ValueError(f"{path.name}: expected sha256 {expected['sha256']}, got {digest}")
    return raw


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", (value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return text


def bucket_for(name: str) -> str:
    norm = normalize_name(name)
    first = norm[0] if norm else ""
    if "a" <= first <= "z":
        return first
    if "0" <= first <= "9":
        return "0-9"
    return "other"


def valid_rsin(value: str) -> bool:
    if not re.fullmatch(r"[0-9]{9}", value):
        return False
    weights = (9, 8, 7, 6, 5, 4, 3, 2, -1)
    return sum(int(ch) * w for ch, w in zip(value, weights)) % 11 == 0


def sanitize_website(raw: str) -> tuple[str | None, str]:
    """Return (safe_http_url_or_none, status_tag)."""
    cleaned = (raw or "").strip()
    if not cleaned:
        return None, "blank"
    if any(ch.isspace() for ch in cleaned):
        cleaned = cleaned.split()[0]
    lower = cleaned.lower()
    if lower.startswith(("http://", "https://")):
        rest = cleaned.split("://", 1)[1]
        if HOST_RE.match(rest):
            return cleaned, "http"
        return None, "invalid"
    if HOST_RE.match(cleaned):
        return f"https://{cleaned}", "prefixed_https"
    return None, "invalid"


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


def parse_anbi(anbi_zip_bytes: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(anbi_zip_bytes)) as zf:
        xml_bytes = zf.read("anbi.xml")
    root = ET.fromstring(xml_bytes)
    header = root.find("header")
    source_created = (header.findtext("aanmaakDatum") or "").strip() if header is not None else ""
    source_version = (header.findtext("versie") or "").strip() if header is not None else ""

    by_rsin: dict[str, list[dict[str, str]]] = defaultdict(list)
    statutory_umbrellas: list[dict[str, Any]] = []
    total_decrees = 0
    active_decrees = 0
    revoked_decrees = 0
    cultural_ever_decrees = 0
    cultural_active_decrees = 0
    cultural_revoked_decrees = 0
    retroactive_revocations = 0
    ws_stats = Counter()

    for elem in root:
        if elem.tag != "beschikking":
            continue
        total_decrees += 1
        rec = {child.tag: (child.text or "").strip() for child in elem}
        rsin = rec.get("fiscaalNummer", "")
        end_date = rec.get("eindDatum", "")
        revoked_date = rec.get("intrekkingsDatum", "")
        is_active = not (end_date or revoked_date)
        if is_active:
            active_decrees += 1
        else:
            revoked_decrees += 1
            if end_date and revoked_date and end_date != revoked_date:
                retroactive_revocations += 1

        cult_start = rec.get("ingangsDatumCultuur", "")
        cult_end = rec.get("eindDatumCultuur", "")
        cult_revoked = rec.get("intrekkingsDatumCultuur", "")
        if cult_start:
            cultural_ever_decrees += 1
            if is_active and not (cult_end or cult_revoked):
                cultural_active_decrees += 1
            else:
                cultural_revoked_decrees += 1

        if not rsin:
            statutory_umbrellas.append(
                {
                    "dossierNummer": rec.get("dossierNummer", ""),
                    "name": rec.get("naam", ""),
                    "alias": rec.get("aliasNaam") or None,
                    "place": rec.get("vestigingsPlaats") or None,
                    "startDate": rec.get("ingangsDatum") or None,
                }
            )
            continue

        if not valid_rsin(rsin):
            raise ValueError(f"Invalid RSIN 11-proef in anbi.xml: {rsin}")
        by_rsin[rsin].append(rec)

    orgs: dict[str, dict[str, Any]] = {}
    name_to_rsins: dict[str, set[str]] = defaultdict(set)
    name_city_to_rsins: dict[tuple[str, str], set[str]] = defaultdict(set)
    normalized_name_counts = Counter()

    for rsin in sorted(by_rsin.keys()):
        decrees = by_rsin[rsin]

        def decree_sort_key(d: dict[str, str]) -> tuple[int, str, int]:
            is_act = 1 if not (d.get("eindDatum") or d.get("intrekkingsDatum")) else 0
            start = d.get("ingangsDatum", "")
            dossier_int = int(d["dossierNummer"]) if d.get("dossierNummer", "").isdigit() else 0
            return (is_act, start, dossier_int)

        primary = max(decrees, key=decree_sort_key)
        end_date = primary.get("eindDatum") or None
        revoked_date = primary.get("intrekkingsDatum") or None
        status = "A" if not (end_date or revoked_date) else "R"

        cult_start = primary.get("ingangsDatumCultuur") or None
        cult_end = primary.get("eindDatumCultuur") or None
        cult_revoked = primary.get("intrekkingsDatumCultuur") or None
        if cult_start:
            cultural = "A" if (status == "A" and not (cult_end or cult_revoked)) else "R"
        else:
            cultural = None

        safe_ws, ws_tag = sanitize_website(primary.get("webSite", ""))
        ws_stats[ws_tag] += 1

        name = primary.get("naam", "")
        alias_raw = primary.get("aliasNaam", "")
        alias = alias_raw if (alias_raw and alias_raw.casefold() != name.casefold()) else None
        city = primary.get("vestigingsPlaats") or None

        orgs[rsin] = {
            "rsin": rsin,
            "name": name,
            "alias": alias,
            "city": city,
            "status": status,
            "cultural": cultural,
            "startDate": primary.get("ingangsDatum") or None,
            "endDate": end_date,
            "revokedDate": revoked_date,
            "website": safe_ws,
            "decreeCount": len(decrees),
            "subsidyMatch": None,
        }

        norm_legal = normalize_name(name)
        if norm_legal:
            normalized_name_counts[norm_legal] += 1
        norm_city = normalize_name(city or "")
        for d in decrees:
            for field in ("naam", "aliasNaam"):
                nm = normalize_name(d.get(field, ""))
                if nm:
                    name_to_rsins[nm].add(rsin)
                    if norm_city:
                        name_city_to_rsins[(nm, norm_city)].add(rsin)

    active_rsins = sum(1 for o in orgs.values() if o["status"] == "A")
    revoked_rsins = len(orgs) - active_rsins
    cultural_active_rsins = sum(1 for o in orgs.values() if o["cultural"] == "A")
    cultural_revoked_rsins = sum(1 for o in orgs.values() if o["cultural"] == "R")
    multi_decree_rsins = sum(1 for o in orgs.values() if o["decreeCount"] > 1)
    repeated_names = sum(1 for cnt in normalized_name_counts.values() if cnt > 1)

    return {
        "sourceCreatedOn": source_created,
        "sourceVersion": source_version,
        "xmlBytes": len(xml_bytes),
        "xmlSha256": sha256_bytes(xml_bytes),
        "statutoryUmbrellas": statutory_umbrellas,
        "orgs": orgs,
        "nameToRsins": name_to_rsins,
        "nameCityToRsins": name_city_to_rsins,
        "counts": {
            "totalDecrees": total_decrees,
            "statutoryPublicBodyDecrees": len(statutory_umbrellas),
            "distinctOrganizations": len(orgs),
            "activeOrganizations": active_rsins,
            "revokedOrEndedOrganizations": revoked_rsins,
            "activeDecrees": active_decrees,
            "revokedOrEndedDecrees": revoked_decrees,
            "retroactiveEndBeforeRevocationDecrees": retroactive_revocations,
            "multiDecreeOrganizations": multi_decree_rsins,
            "culturalActiveOrganizations": cultural_active_rsins,
            "culturalRevokedOrEndedOrganizations": cultural_revoked_rsins,
            "culturalEverDecrees": cultural_ever_decrees,
            "culturalActiveDecrees": cultural_active_decrees,
            "culturalRevokedDecrees": cultural_revoked_decrees,
            "withSafeWebsiteUrl": sum(1 for o in orgs.values() if o["website"]),
            "websitePrefixedHttps": ws_stats["prefixed_https"],
            "websiteBlankOrInvalid": ws_stats["blank"] + ws_stats["invalid"],
            "withDistinctAlias": sum(1 for o in orgs.values() if o["alias"]),
            "repeatedNormalizedNames": repeated_names,
        },
    }


def parse_rijksfinancien(csv_bytes: bytes, anbi: dict[str, Any]) -> dict[str, Any]:
    text = csv_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")

    total_csv_rows = 0
    pre_2020_rows = 0
    excluded_vve_rows = 0
    excluded_vve_net_k = 0
    other_np_instruments_rows = Counter()
    other_np_instruments_net_k = Counter()

    year_stats: dict[str, dict[str, Any]] = {
        yr: {
            "year": int(yr),
            "rows": 0,
            "kvkRows": 0,
            "blankKvkRows": 0,
            "anonymizedRows": 0,
            "distinctKvks": set(),
            "positiveRows": 0,
            "negativeRows": 0,
            "positiveEurThousands": 0,
            "negativeEurThousands": 0,
            "netEurThousands": 0,
        }
        for yr in INCLUDED_YEARS
    }

    chapter_stats: dict[str, dict[str, Any]] = {}
    recipients: dict[str, dict[str, Any]] = {}

    blank_kvk_rows: list[dict[str, Any]] = []
    negative_rows_detail: list[dict[str, Any]] = []
    unpadded_kvk_counts = Counter()
    truncated_40_rows = 0

    for excel_row_idx, row in enumerate(reader, start=2):
        total_csv_rows += 1
        yr = (row.get("Begrotingsjaar") or "").strip()
        rv = (row.get("Rechtsvorm") or "").strip()
        inst = (row.get("Instrument") or "").strip()
        ch_code = (row.get("Begrotingshoofdstuk") or "").strip()
        ch_name = (row.get("Begrotingsnaam") or "").strip()
        ontv = (row.get("Ontvanger") or "").strip()
        kvk_raw = (row.get("KVKnummer") or "").strip()
        plaats = (row.get("Plaats") or "").strip()
        amt_str = (row.get("Bedrag (x1000)") or "").strip()
        amt_k = int(amt_str)

        if yr not in INCLUDED_YEARS:
            pre_2020_rows += 1
            continue

        if rv in VVE_RECHTSVORMEN:
            if inst == SUBSIDY_INSTRUMENT:
                excluded_vve_rows += 1
                excluded_vve_net_k += amt_k
            continue

        if rv not in NONPROFIT_RECHTSVORMEN:
            continue

        if inst != SUBSIDY_INSTRUMENT:
            label = inst if inst else "(blank instrument)"
            other_np_instruments_rows[label] += 1
            other_np_instruments_net_k[label] += amt_k
            continue

        # Included nonprofit subsidy row (2020-2024)
        ys = year_stats[yr]
        ys["rows"] += 1
        ys["netEurThousands"] += amt_k
        if amt_k > 0:
            ys["positiveRows"] += 1
            ys["positiveEurThousands"] += amt_k
        elif amt_k < 0:
            ys["negativeRows"] += 1
            ys["negativeEurThousands"] += amt_k
            negative_rows_detail.append(
                {
                    "csvRow": excel_row_idx,
                    "year": int(yr),
                    "chapter": ch_code,
                    "chapterName": ch_name,
                    "kvk": kvk_raw.zfill(8) if kvk_raw.isdigit() else None,
                    "recipient": ontv,
                    "legalForm": rv,
                    "eurThousands": amt_k,
                }
            )

        if len(ontv) == 40:
            truncated_40_rows += 1

        if ch_code not in chapter_stats:
            chapter_stats[ch_code] = {
                "chapter": ch_code,
                "canonicalName": CHAPTER_CANONICAL_NAMES.get(ch_code, ch_name),
                "sourceNames": set(),
                "rows": 0,
                "distinctKvks": set(),
                "blankKvkRows": 0,
                "positiveEurThousands": 0,
                "negativeEurThousands": 0,
                "netEurThousands": 0,
            }
        cs = chapter_stats[ch_code]
        cs["sourceNames"].add(ch_name)
        cs["rows"] += 1
        cs["netEurThousands"] += amt_k
        if amt_k > 0:
            cs["positiveEurThousands"] += amt_k
        elif amt_k < 0:
            cs["negativeEurThousands"] += amt_k

        if not kvk_raw:
            ys["blankKvkRows"] += 1
            cs["blankKvkRows"] += 1
            is_anon = ontv.startswith("Geanonimiseerde ontvanger")
            if is_anon:
                ys["anonymizedRows"] += 1
            blank_kvk_rows.append(
                {
                    "csvRow": excel_row_idx,
                    "year": int(yr),
                    "chapter": ch_code,
                    "chapterName": ch_name,
                    "recipient": ontv,
                    "legalForm": rv,
                    "anonymized": is_anon,
                    "eurThousands": amt_k,
                }
            )
            continue

        if not kvk_raw.isdigit() or len(kvk_raw) > 8:
            raise ValueError(f"Unexpected KVKnummer {kvk_raw!r} at CSV row {excel_row_idx}")
        if len(kvk_raw) < 8:
            unpadded_kvk_counts[str(len(kvk_raw))] += 1
        kvk = kvk_raw.zfill(8)

        ys["kvkRows"] += 1
        ys["distinctKvks"].add(kvk)
        cs["distinctKvks"].add(kvk)

        if kvk not in recipients:
            recipients[kvk] = {
                "kvk": kvk,
                "nameCounts": Counter(),
                "latestYear": 0,
                "latestName": "",
                "forms": set(),
                "cities": Counter(),
                "chapterTotals": Counter(),
                "byYear": {},
                "netK": 0,
                "rowCount": 0,
            }
        rec = recipients[kvk]
        rec["nameCounts"][ontv] += 1
        yr_int = int(yr)
        if yr_int >= rec["latestYear"]:
            rec["latestYear"] = yr_int
            rec["latestName"] = ontv
        rec["forms"].add(NONPROFIT_RECHTSVORMEN[rv])
        if plaats:
            rec["cities"][plaats] += 1
        rec["chapterTotals"][ch_code] += amt_k
        rec["byYear"][yr] = rec["byYear"].get(yr, 0) + amt_k
        rec["netK"] += amt_k
        rec["rowCount"] += 1

    # Conservative ANBI candidate matching (NEVER claimed as statutory KvK==RSIN join)
    name_to_rsins = anbi["nameToRsins"]
    name_city_to_rsins = anbi["nameCityToRsins"]
    anbi_orgs = anbi["orgs"]

    match_counts = Counter()
    match_net_k = Counter()
    ambiguous_examples: list[dict[str, Any]] = []
    multi_spelling_kvks = 0
    multi_form_kvks: list[dict[str, Any]] = []

    recipient_rows: list[list[Any]] = []
    # Track best candidate basis per RSIN to mark anbi_orgs[rsin]["subsidyMatch"]
    rsin_match_basis: dict[str, str] = {}

    for kvk in sorted(recipients.keys()):
        rec = recipients[kvk]
        if len(rec["nameCounts"]) > 1:
            multi_spelling_kvks += 1
        # Deterministic canonical display name: latest year name if tied, else most frequent
        display_name = sorted(
            rec["nameCounts"].items(),
            key=lambda kv: (-kv[1], 0 if kv[0] == rec["latestName"] else 1, kv[0]),
        )[0][0]
        if len(rec["forms"]) == 1:
            form_code = next(iter(rec["forms"]))
        else:
            form_code = "M"
            multi_form_kvks.append(
                {
                    "kvk": kvk,
                    "name": display_name,
                    "forms": sorted(rec["forms"]),
                    "netEurThousands": rec["netK"],
                }
            )
        city = (
            sorted(rec["cities"].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
            if rec["cities"]
            else None
        )
        primary_chapter = sorted(
            rec["chapterTotals"].items(), key=lambda kv: (-abs(kv[1]), -kv[1], kv[0])
        )[0][0]
        chapters_str = "|".join(sorted(rec["chapterTotals"].keys()))

        # Check normalized name + city across all observed spellings for this KVK
        nc_candidates: set[str] = set()
        n_candidates: set[str] = set()
        norm_cities = {normalize_name(c) for c in rec["cities"].keys() if normalize_name(c)}
        for nm_raw in rec["nameCounts"].keys():
            nm = normalize_name(nm_raw)
            if not nm:
                continue
            n_candidates |= name_to_rsins.get(nm, set())
            for c_norm in norm_cities:
                nc_candidates |= name_city_to_rsins.get((nm, c_norm), set())

        if len(nc_candidates) == 1:
            basis = "C"
            cand_rsin = next(iter(nc_candidates))
        elif len(n_candidates) == 1:
            basis = "N"
            cand_rsin = next(iter(n_candidates))
        elif len(nc_candidates) > 1 or len(n_candidates) > 1:
            basis = "A"
            cand_rsin = None
            ambiguous_examples.append(
                {
                    "kvk": kvk,
                    "name": display_name,
                    "city": city,
                    "netEurThousands": rec["netK"],
                    "candidateRsins": sorted(nc_candidates if len(nc_candidates) > 1 else n_candidates)[:6],
                }
            )
        else:
            basis = "U"
            cand_rsin = None

        match_counts[basis] += 1
        match_net_k[basis] += rec["netK"]

        if cand_rsin is not None:
            # Prefer "C" over "N" if multiple KVKs ever point to same RSIN
            prev = rsin_match_basis.get(cand_rsin)
            if prev is None or (prev == "N" and basis == "C"):
                rsin_match_basis[cand_rsin] = basis

        k2020 = rec["byYear"].get("2020")
        k2021 = rec["byYear"].get("2021")
        k2022 = rec["byYear"].get("2022")
        k2023 = rec["byYear"].get("2023")
        k2024 = rec["byYear"].get("2024")
        assert sum(v for v in (k2020, k2021, k2022, k2023, k2024) if v is not None) == rec["netK"]

        recipient_rows.append(
            [
                kvk,
                display_name,
                form_code,
                city,
                primary_chapter,
                chapters_str,
                k2020,
                k2021,
                k2022,
                k2023,
                k2024,
                rec["netK"],
                rec["rowCount"],
                basis,
                cand_rsin,
            ]
        )

    for rsin, basis in rsin_match_basis.items():
        anbi_orgs[rsin]["subsidyMatch"] = basis

    # Sort recipients by descending netK, then kvk
    recipient_rows.sort(key=lambda r: (-r[11], r[0]))

    by_year_summary = []
    for yr in INCLUDED_YEARS:
        ys = year_stats[yr]
        by_year_summary.append(
            {
                "year": ys["year"],
                "rows": ys["rows"],
                "kvkRows": ys["kvkRows"],
                "blankKvkRows": ys["blankKvkRows"],
                "anonymizedRows": ys["anonymizedRows"],
                "distinctKvks": len(ys["distinctKvks"]),
                "positiveRows": ys["positiveRows"],
                "negativeRows": ys["negativeRows"],
                "positiveEurThousands": ys["positiveEurThousands"],
                "negativeEurThousands": ys["negativeEurThousands"],
                "netEurThousands": ys["netEurThousands"],
            }
        )

    chapters_summary = []
    for ch_code in sorted(
        chapter_stats.keys(), key=lambda c: (-chapter_stats[c]["netEurThousands"], c)
    ):
        cs = chapter_stats[ch_code]
        chapters_summary.append(
            {
                "chapter": cs["chapter"],
                "canonicalName": cs["canonicalName"],
                "sourceNames": sorted(cs["sourceNames"]),
                "rows": cs["rows"],
                "distinctKvks": len(cs["distinctKvks"]),
                "blankKvkRows": cs["blankKvkRows"],
                "positiveEurThousands": cs["positiveEurThousands"],
                "negativeEurThousands": cs["negativeEurThousands"],
                "netEurThousands": cs["netEurThousands"],
            }
        )

    total_rows = sum(y["rows"] for y in by_year_summary)
    total_pos_k = sum(y["positiveEurThousands"] for y in by_year_summary)
    total_neg_k = sum(y["negativeEurThousands"] for y in by_year_summary)
    total_net_k = sum(y["netEurThousands"] for y in by_year_summary)
    blank_kvk_net_k = sum(r["eurThousands"] for r in blank_kvk_rows)
    kvk_recipients_net_k = sum(r[11] for r in recipient_rows)
    assert kvk_recipients_net_k + blank_kvk_net_k == total_net_k
    assert sum(c["netEurThousands"] for c in chapters_summary) == total_net_k

    present_all_five = sum(
        1 for r in recipient_rows if all(r[idx] is not None for idx in (6, 7, 8, 9, 10))
    )

    top_recipients = [
        {
            "kvk": r[0],
            "name": r[1],
            "legalForm": r[2],
            "city": r[3],
            "primaryChapter": r[4],
            "k2020": r[6],
            "k2021": r[7],
            "k2022": r[8],
            "k2023": r[9],
            "k2024": r[10],
            "netEurThousands": r[11],
            "rowCount": r[12],
            "anbiMatchBasis": r[13],
            "candidateRsin": r[14],
        }
        for r in recipient_rows[:15]
    ]

    excluded_instruments = [
        {
            "instrument": inst,
            "rows": other_np_instruments_rows[inst],
            "netEurThousands": other_np_instruments_net_k[inst],
        }
        for inst in sorted(
            other_np_instruments_rows.keys(),
            key=lambda k: (-abs(other_np_instruments_net_k[k]), k),
        )
    ]

    anomalies = {
        "format": "charitology-netherlands-rijksfinancien-anomalies-v1",
        "capturedOn": CAPTURED_ON,
        "blankKvkRowsCount": len(blank_kvk_rows),
        "anonymizedRowsCount": sum(1 for r in blank_kvk_rows if r["anonymized"]),
        "blankKvkNetEurThousands": blank_kvk_net_k,
        "blankKvkRows": blank_kvk_rows,
        "negativeAdjustmentRowsCount": len(negative_rows_detail),
        "negativeAdjustmentTotalEurThousands": total_neg_k,
        "largestNegativeAdjustments": sorted(
            negative_rows_detail, key=lambda r: (r["eurThousands"], r["csvRow"])
        )[:25],
        "unpaddedKvkDigitCounts": dict(sorted(unpadded_kvk_counts.items())),
        "exactFortyCharNameRows": truncated_40_rows,
        "multiSpellingKvkCount": multi_spelling_kvks,
        "multiLegalFormKvksCount": len(multi_form_kvks),
        "multiLegalFormKvks": sorted(multi_form_kvks, key=lambda r: (-r["netEurThousands"], r["kvk"])),
        "ambiguousAnbiNameCollisionsCount": len(ambiguous_examples),
        "ambiguousAnbiNameCollisions": sorted(
            ambiguous_examples, key=lambda r: (-r["netEurThousands"], r["kvk"])
        ),
        "excludedVveCondoAssociationRows": excluded_vve_rows,
        "excludedVveCondoAssociationNetEurThousands": excluded_vve_net_k,
    }

    return {
        "recipientRows": recipient_rows,
        "byYear": by_year_summary,
        "chapters": chapters_summary,
        "topRecipients": top_recipients,
        "excludedNonprofitInstruments": excluded_instruments,
        "anomalies": anomalies,
        "counts": {
            "totalCsvRows2017to2024": total_csv_rows,
            "pre2020RowsWithoutRechtsvorm": pre_2020_rows,
            "includedSubsidyRows2020to2024": total_rows,
            "distinctKvkRecipients": len(recipient_rows),
            "presentInAllFiveYears": present_all_five,
            "blankKvkRows": len(blank_kvk_rows),
            "anonymizedRows": sum(1 for r in blank_kvk_rows if r["anonymized"]),
            "positiveEurThousands": total_pos_k,
            "negativeEurThousands": total_neg_k,
            "netEurThousands": total_net_k,
            "kvkRecipientsNetEurThousands": kvk_recipients_net_k,
            "blankKvkNetEurThousands": blank_kvk_net_k,
            "negativeAdjustmentRows": len(negative_rows_detail),
            "activeBudgetChapters": len(chapters_summary),
            "byLegalForm": {
                "Stichting": sum(1 for r in recipient_rows if r[2] == "S"),
                "Vereniging": sum(1 for r in recipient_rows if r[2] == "V"),
                "Kerkgenootschap": sum(1 for r in recipient_rows if r[2] == "K"),
                "Mixed": sum(1 for r in recipient_rows if r[2] == "M"),
            },
            "anbiCandidateMatches": {
                "uniqueNameAndCity": match_counts["C"],
                "uniqueNameOnly": match_counts["N"],
                "ambiguousNameCollision": match_counts["A"],
                "unmatchedNoPublicCrosswalk": match_counts["U"],
                "uniqueCandidateRsinsLinked": len(rsin_match_basis),
                "uniqueCandidateNetEurThousands": match_net_k["C"] + match_net_k["N"],
                "ambiguousNetEurThousands": match_net_k["A"],
                "unmatchedNetEurThousands": match_net_k["U"],
            },
        },
    }


def build(source_dir: Path, out_root: Path) -> None:
    anbi_bytes = verify_file(source_dir / "anbi.zip", EXPECTED_SOURCES["anbi.zip"])
    rf_bytes = verify_file(
        source_dir / "Financiele_instrumenten_2017-2024.csv",
        EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"],
    )

    anbi = parse_anbi(anbi_bytes)
    rf = parse_rijksfinancien(rf_bytes, anbi)

    # 1. Write Netherlands ANBI Registry shards
    reg_dir = out_root / "charity-registry" / "netherlands"
    if reg_dir.exists():
        shutil.rmtree(reg_dir)
    reg_dir.mkdir(parents=True, exist_ok=True)

    name_buckets: dict[str, list[list[Any]]] = defaultdict(list)
    id_buckets: dict[str, list[list[str]]] = defaultdict(list)
    matched_anbi_orgs = 0

    for rsin in sorted(anbi["orgs"].keys()):
        o = anbi["orgs"][rsin]
        bucket = bucket_for(o["name"])
        if o["subsidyMatch"] is not None:
            matched_anbi_orgs += 1
        name_buckets[bucket].append(
            [
                o["rsin"],
                o["name"],
                o["alias"],
                o["city"],
                o["status"],
                o["cultural"],
                o["startDate"],
                o["endDate"],
                o["revokedDate"],
                o["website"],
                o["decreeCount"],
                o["subsidyMatch"],
            ]
        )
        id_buckets[rsin[:2]].append([rsin, bucket])

    names_manifest: dict[str, Any] = {}
    for bucket in sorted(name_buckets.keys()):
        rows = sorted(name_buckets[bucket], key=lambda r: (normalize_name(r[1]), r[0]))
        meta = write_gzip_json(reg_dir / "names" / f"{bucket}.json.gz", rows)
        names_manifest[bucket] = {"path": f"names/{bucket}.json.gz", **meta}

    ids_manifest: dict[str, Any] = {}
    for prefix in sorted(id_buckets.keys()):
        rows = sorted(id_buckets[prefix], key=lambda r: r[0])
        meta = write_gzip_json(reg_dir / "ids" / f"{prefix}.json.gz", rows)
        ids_manifest[prefix] = {"path": f"ids/{prefix}.json.gz", **meta}

    reg_counts = dict(anbi["counts"])
    reg_counts["candidateSubsidyMatches2020to2024"] = matched_anbi_orgs

    reg_manifest = {
        "format": "charitology-netherlands-anbi-v1",
        "capturedOn": CAPTURED_ON,
        "sourceCreatedOn": anbi["sourceCreatedOn"],
        "sourceVersion": anbi["sourceVersion"],
        "publisher": EXPECTED_SOURCES["anbi.zip"]["publisher"],
        "catalogue": EXPECTED_SOURCES["anbi.zip"]["catalogue"],
        "license": EXPECTED_SOURCES["anbi.zip"]["license"],
        "source": {
            "url": EXPECTED_SOURCES["anbi.zip"]["url"],
            "bytes": EXPECTED_SOURCES["anbi.zip"]["bytes"],
            "sha256": EXPECTED_SOURCES["anbi.zip"]["sha256"],
            "xmlBytes": anbi["xmlBytes"],
            "xmlSha256": anbi["xmlSha256"],
        },
        "fields": [
            "rsin",
            "name",
            "alias",
            "city",
            "status",
            "cultural",
            "startDate",
            "endDate",
            "revokedDate",
            "website",
            "decreeCount",
            "subsidyMatch",
        ],
        "counts": reg_counts,
        "statutoryUmbrellas": anbi["statutoryUmbrellas"],
        "names": names_manifest,
        "ids": ids_manifest,
    }
    write_json(reg_dir / "manifest.json", reg_manifest)

    # 2. Write Netherlands Rijksfinancien 2020-2024 Funding Flows
    flow_dir = out_root / "funding-flows" / "netherlands-rijksfinancien"
    if flow_dir.exists():
        shutil.rmtree(flow_dir)
    flow_dir.mkdir(parents=True, exist_ok=True)

    recipients_meta = write_gzip_json(flow_dir / "recipients.json.gz", rf["recipientRows"])
    anom_bytes, anom_sha = write_json(flow_dir / "anomalies.json", rf["anomalies"])

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, lineterminator="\n")
    writer.writerow(
        [
            "chapter",
            "canonical_name",
            "source_names",
            "rows",
            "distinct_kvks",
            "blank_kvk_rows",
            "positive_eur_thousands",
            "negative_eur_thousands",
            "net_eur_thousands",
        ]
    )
    for ch in rf["chapters"]:
        writer.writerow(
            [
                ch["chapter"],
                ch["canonicalName"],
                " | ".join(ch["sourceNames"]),
                ch["rows"],
                ch["distinctKvks"],
                ch["blankKvkRows"],
                ch["positiveEurThousands"],
                ch["negativeEurThousands"],
                ch["netEurThousands"],
            ]
        )
    csv_raw = ("\ufeff" + csv_buf.getvalue()).encode("utf-8")
    (flow_dir / "chapters-2020-2024.csv").write_bytes(csv_raw)

    flow_manifest = {
        "format": "charitology-netherlands-rijksfinancien-v1",
        "capturedOn": CAPTURED_ON,
        "currency": "EUR",
        "amountUnit": "EUR_thousands",
        "publisher": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["publisher"],
        "catalogue": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["catalogue"],
        "license": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["license"],
        "licenseNoteUrl": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["licenseNoteUrl"],
        "source": {
            "url": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["url"],
            "bytes": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["bytes"],
            "sha256": EXPECTED_SOURCES["Financiele_instrumenten_2017-2024.csv"]["sha256"],
        },
        "anbiSnapshot": {
            "capturedOn": CAPTURED_ON,
            "sourceCreatedOn": anbi["sourceCreatedOn"],
            "sourceVersion": anbi["sourceVersion"],
            "sourceSha256": EXPECTED_SOURCES["anbi.zip"]["sha256"],
            "distinctOrganizations": anbi["counts"]["distinctOrganizations"],
        },
        "fields": [
            "kvk",
            "name",
            "legalForm",
            "city",
            "primaryChapter",
            "chapters",
            "k2020",
            "k2021",
            "k2022",
            "k2023",
            "k2024",
            "netK",
            "rowCount",
            "anbiMatchBasis",
            "candidateRsin",
        ],
        "counts": rf["counts"],
        "byYear": rf["byYear"],
        "chapters": rf["chapters"],
        "topRecipients": rf["topRecipients"],
        "excludedNonprofitInstruments": rf["excludedNonprofitInstruments"],
        "asset": {"path": "recipients.json.gz", **recipients_meta},
        "anomalies": {"path": "anomalies.json", "bytes": anom_bytes, "sha256": anom_sha},
        "chaptersCsv": {
            "path": "chapters-2020-2024.csv",
            "rows": len(rf["chapters"]),
            "bytes": len(csv_raw),
            "sha256": sha256_bytes(csv_raw),
        },
    }
    write_json(flow_dir / "manifest.json", flow_manifest)

    print(
        f"Built Netherlands edition: {reg_counts['distinctOrganizations']:,} ANBI RSINs "
        f"({reg_counts['activeOrganizations']:,} active, {reg_counts['revokedOrEndedOrganizations']:,} revoked/ended, "
        f"{reg_counts['culturalActiveOrganizations']:,} active cultural) + "
        f"{rf['counts']['distinctKvkRecipients']:,} nonprofit subsidy KVK recipients "
        f"(EUR {rf['counts']['netEurThousands']:,}k net across {rf['counts']['includedSubsidyRows2020to2024']:,} rows; "
        f"{rf['counts']['anbiCandidateMatches']['uniqueNameAndCity'] + rf['counts']['anbiCandidateMatches']['uniqueNameOnly']:,} unique name/city ANBI candidates, "
        f"{rf['counts']['anbiCandidateMatches']['ambiguousNameCollision']:,} ambiguous, "
        f"{rf['counts']['anbiCandidateMatches']['unmatchedNoPublicCrosswalk']:,} unmatched)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--out-root", default=Path("public/data"), type=Path)
    args = parser.parse_args()
    build(args.source_dir, args.out_root)


if __name__ == "__main__":
    main()
