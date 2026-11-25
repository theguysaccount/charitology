#!/usr/bin/env python3
"""Deterministic builder for the Colombia DIAN RTE tax-exempt nonprofit index (#30).

Reads the captured official DIAN (Unidad Administrativa Especial Dirección de Impuestos y
Aduanas Nacionales) dataset `8tdc-u2ga` ("Entidades sin ánimo de Lucro del Régimen Tributario
Especial", 2018–2022, 340,038 rows across 112,201 distinct 9-digit NITs) via datos.gov.co
and writes byte-reproducible sharded gzip JSON + manifest + anomalies + CSV summary under
public/data/charity-registry/colombia/.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import pathlib
import re
import unicodedata
from collections import Counter, defaultdict

LEGAL_FORMS = [
    ("asociacion", "Asociación", "Associations"),
    ("fundacion", "Fundación", "Foundations"),
    ("cooperative_mutual", "Cooperativa / Fondo de Empleados / Mutual", "Cooperatives, employee funds & mutuals"),
    ("corporacion", "Corporación", "Nonprofit corporations (Corporaciones)"),
    ("federation_club", "Federación / Confederación / Liga / Club", "Federations, leagues & clubs"),
    ("communal_board", "Junta de Acción Comunal / Asocomunal", "Communal action boards (JAC)"),
    ("religious", "Iglesia / Parroquia / Diócesis / Congregación", "Churches, parishes & religious bodies"),
    ("other", "Otra entidad ESAL / RTE", "Other Special Tax Regime entities"),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_deterministic_gzip(path: pathlib.Path, payload: bytes) -> dict:
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(payload)
    gz_bytes = buf.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gz_bytes)
    return {
        "path": str(path.relative_to(path.parents[1])),
        "bytes": len(gz_bytes),
        "sha256": sha256_bytes(gz_bytes),
        "decodedBytes": len(payload),
        "decodedSha256": sha256_bytes(payload),
    }


def normalize_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def classify_form(name: str) -> str:
    u = normalize_name(name).upper()
    if any(k in u for k in ("COOPERATIVA", "COOP ", "PRECOOPERATIVA", "FONDO DE EMPLEADOS", "MUTUAL")):
        return "cooperative_mutual"
    if "FUNDACION" in u:
        return "fundacion"
    if "CORPORACION" in u:
        return "corporacion"
    if "ASOCIACION" in u or u.startswith("ASOC ") or " ASOC " in u:
        return "asociacion"
    if any(k in u for k in ("IGLESIA", "PARROQUIA", "DIOCESIS", "CONGREGACION", "MINISTERIO")):
        return "religious"
    if "JUNTA DE ACCION COMUNAL" in u or "ASOCOMUNAL" in u:
        return "communal_board"
    if any(k in u for k in ("FEDERACION", "CONFEDERACION", "LIGA ", "CLUB ")):
        return "federation_club"
    return "other"


def name_bucket(norm: str) -> str:
    if not norm:
        return "0-9"
    ch = norm[0]
    if "a" <= ch <= "z":
        return ch
    return "0-9"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Colombia DIAN RTE sharded charity index.")
    parser.add_argument("--input-dir", required=True, type=pathlib.Path)
    parser.add_argument(
        "--output-dir",
        default=pathlib.Path("public/data/charity-registry/colombia"),
        type=pathlib.Path,
    )
    parser.add_argument("--captured-on", default="2026-11-25")
    args = parser.parse_args()

    csv_path = args.input_dir / "colombia-dian-rte.csv"
    raw_bytes = csv_path.read_bytes()
    raw_sha256 = sha256_bytes(raw_bytes)
    text = raw_bytes.decode("utf-8")

    reader = csv.DictReader(io.StringIO(text))
    raw_rows = list(reader)

    nit_years: dict[str, set[int]] = defaultdict(set)
    nit_year_names: dict[str, list[tuple[int, str]]] = defaultdict(list)
    seen_pairs: set[tuple[str, int]] = set()
    dup_pairs: list[dict] = []
    raw_by_year: Counter[int] = Counter()
    dedup_by_year: Counter[int] = Counter()

    for r in raw_rows:
        nit = r["nit"].strip()
        assert re.fullmatch(r"\d{9}", nit), f"Invalid 9-digit NIT: {nit!r}"
        name = re.sub(r"\s+", " ", r["raz_n_social"].strip())
        assert name, f"Empty name for NIT {nit}"
        yr = int(r["a_o"].strip())
        assert 2018 <= yr <= 2022, f"Unexpected year {yr}"
        raw_by_year[yr] += 1
        if (nit, yr) in seen_pairs:
            dup_pairs.append({"nit": nit, "year": yr, "name": name})
            continue
        seen_pairs.add((nit, yr))
        dedup_by_year[yr] += 1
        nit_years[nit].add(yr)
        nit_year_names[nit].append((yr, name))

    organizations: list[dict] = []
    form_counts_all: Counter[str] = Counter()
    form_counts_2022: Counter[str] = Counter()
    year_span_counts: Counter[int] = Counter()
    name_changes = 0

    for nit in sorted(nit_years.keys()):
        yrs = sorted(nit_years[nit])
        entries = sorted(nit_year_names[nit], key=lambda t: (t[0], t[1]))
        latest_name = entries[-1][1]
        distinct_names = list(dict.fromkeys(n for _, n in entries))
        alt_names = [n for n in distinct_names if n != latest_name]
        if alt_names:
            name_changes += 1
        form = classify_form(latest_name)
        active_2022 = 2022 in yrs
        all_5 = len(yrs) == 5
        form_counts_all[form] += 1
        if active_2022:
            form_counts_2022[form] += 1
        year_span_counts[len(yrs)] += 1

        norm = normalize_name(" ".join([latest_name, *alt_names]))
        organizations.append({
            "n": nit,
            "nm": latest_name,
            "alt": alt_names if alt_names else None,
            "s": norm,
            "f": form,
            "y": yrs,
            "a22": active_2022,
            "a5": all_5,
        })

    # Clean old shards before writing
    out_dir = args.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("ids", "names"):
        sub_dir = out_dir / sub
        if sub_dir.exists():
            for p in sub_dir.glob("*.json.gz"):
                p.unlink()

    # Shard by 2-digit NIT prefix & first normalized letter
    id_buckets: dict[str, list[dict]] = defaultdict(list)
    name_buckets: dict[str, list[dict]] = defaultdict(list)
    for o in organizations:
        id_buckets[o["n"][:2]].append(o)
        name_buckets[name_bucket(o["s"])].append(o)

    id_shards: dict[str, dict] = {}
    for pref in sorted(id_buckets.keys()):
        rows_b = sorted(id_buckets[pref], key=lambda x: x["n"])
        payload = json.dumps(rows_b, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        art = write_deterministic_gzip(out_dir / "ids" / f"{pref}.json.gz", payload)
        art["rows"] = len(rows_b)
        id_shards[pref] = art

    name_shards: dict[str, dict] = {}
    for key in sorted(name_buckets.keys()):
        rows_b = sorted(name_buckets[key], key=lambda x: (x["s"], x["n"]))
        payload = json.dumps(rows_b, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        art = write_deterministic_gzip(out_dir / "names" / f"{key}.json.gz", payload)
        art["rows"] = len(rows_b)
        name_shards[key] = art

    # Annual retention & Ley 1819 cliff table
    annual_rows = []
    for yr in range(2018, 2023):
        annual_rows.append({
            "year": yr,
            "rawRows": raw_by_year[yr],
            "uniqueNits": dedup_by_year[yr],
            "duplicateRowsRemoved": raw_by_year[yr] - dedup_by_year[yr],
        })

    dropped_after_2018_2019 = sum(
        1 for o in organizations if (2018 in o["y"] or 2019 in o["y"]) and not any(y >= 2020 for y in o["y"])
    )
    active_2022_count = sum(1 for o in organizations if o["a22"])
    continuous_5yr = sum(1 for o in organizations if o["a5"])
    new_2020_to_2022 = sum(1 for o in organizations if min(o["y"]) >= 2020)

    forms_summary = [
        {
            "code": code,
            "labelEs": label_es,
            "labelEn": label_en,
            "total": form_counts_all[code],
            "active2022": form_counts_2022[code],
        }
        for code, label_es, label_en in LEGAL_FORMS
    ]

    # Write annual summary CSV
    csv_buf = io.StringIO()
    cw = csv.writer(csv_buf, lineterminator="\r\n")
    cw.writerow(["year", "raw_rows", "unique_nits", "duplicate_rows_removed"])
    for a in annual_rows:
        cw.writerow([a["year"], a["rawRows"], a["uniqueNits"], a["duplicateRowsRemoved"]])
    annual_csv_bytes = ("\ufeff" + csv_buf.getvalue()).encode("utf-8")
    annual_csv_path = out_dir / "colombia-dian-rte-annual.csv"
    annual_csv_path.write_bytes(annual_csv_bytes)

    # Write anomalies.json
    anomalies = {
        "format": "charitology-colombia-anomalies-v1",
        "capturedOn": args.captured_on,
        "sourceFile": "colombia-dian-rte.csv",
        "sourceSha256": raw_sha256,
        "summary": {
            "rawRows": len(raw_rows),
            "distinctNits": len(organizations),
            "sameYearDuplicateNitRowsRemoved": len(dup_pairs),
            "entitiesWithNameVariantsAcrossYears": name_changes,
            "droppedAfter2018_2019ReformCliff": dropped_after_2018_2019,
            "continuousFiveYearEntities2018To2022": continuous_5yr,
        },
        "notes": [
            "DIAN dataset 8tdc-u2ga contains 400 same-year duplicate (NIT, year) rows across 2018–2022; deduplication keeps one record per (NIT, year) while preserving exact raw and deduplicated counts.",
            "Following Colombia's Ley 1819 de 2016 mandatory annual RTE web-disclosure and re-qualification reform, qualified entities dropped sharply from 106,643 (2018) to 49,168 (2020) and 45,171 unique NITs (2022); 59,088+ legacy entities from 2018–2019 (including commercial/cooperative edge cases such as NIT 800000076 DAGRO S.A.) did not renew into 2020–2022.",
            "DIAN publishes only NIT, legal name (razón social), and fiscal year in dataset 8tdc-u2ga; financial figures, addresses, and sector codes are unpublished (null) in this open bulk release.",
            "Legal-form groupings (Fundación, Asociación, Corporación, Cooperativa/Mutual, etc.) are deterministic text classifications derived from official Spanish legal designations in razón social and are labeled transparently as derived keywords.",
        ],
        "sameYearDuplicatesSample": dup_pairs[:25],
    }
    anom_bytes = (json.dumps(anomalies, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    anom_path = out_dir / "anomalies.json"
    anom_path.write_bytes(anom_bytes)

    manifest = {
        "format": "charitology-colombia-registry-v1",
        "jurisdiction": "Colombia",
        "asOf": "2022",
        "capturedOn": args.captured_on,
        "publisher": "Dirección de Impuestos y Aduanas Nacionales (DIAN — Colombia)",
        "catalogues": {
            "datosGovCoDataset": "https://www.datos.gov.co/Econom-a-y-Finanzas/Entidades-sin-nimo-de-Lucro-del-R-gimen-Tributario/8tdc-u2ga",
            "datosGovCoSodaCsv": "https://www.datos.gov.co/resource/8tdc-u2ga.csv",
            "dianRtePortal": "https://www.dian.gov.co/impuestos/sociedades/ESAL/Paginas/default.aspx",
        },
        "sourceCapture": {
            "filename": "colombia-dian-rte.csv",
            "bytes": len(raw_bytes),
            "sha256": raw_sha256,
            "capturedOn": args.captured_on,
            "rawRows": len(raw_rows),
        },
        "counts": {
            "includedOrganizations": len(organizations),
            "uniqueNits": len(organizations),
            "activeIn2022": active_2022_count,
            "continuousAllFiveYears": continuous_5yr,
            "droppedBefore2020": dropped_after_2018_2019,
            "newIn2020To2022": new_2020_to_2022,
            "sameYearDuplicateRowsRemoved": len(dup_pairs),
            "byYearsPresent": {str(k): v for k, v in sorted(year_span_counts.items())},
            "idShardCount": len(id_shards),
            "nameShardCount": len(name_shards),
        },
        "annualSeries": annual_rows,
        "legalForms": forms_summary,
        "artifacts": {
            "annualCsv": {
                "path": annual_csv_path.name,
                "bytes": len(annual_csv_bytes),
                "sha256": sha256_bytes(annual_csv_bytes),
                "rows": len(annual_rows),
            },
            "anomalies": {
                "path": anom_path.name,
                "bytes": len(anom_bytes),
                "sha256": sha256_bytes(anom_bytes),
            },
            "idShards": id_shards,
            "nameShards": name_shards,
        },
    }
    (out_dir / "manifest.json").write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    pathlib.Path("src/data/colombia-index-sources.tsv").write_text(
        "filename\turl\tbytes\tsha256\tcaptured_on\tlicense\tnote\n"
        f"colombia-dian-rte.csv\thttps://www.datos.gov.co/resource/8tdc-u2ga.csv\t{len(raw_bytes)}\t{raw_sha256}\t{args.captured_on}\tDatos Abiertos Colombia (datos.gov.co — DIAN)\tOfficial DIAN Entidades sin Ánimo de Lucro del Régimen Tributario Especial (2018–2022, 340,038 raw rows -> 112,201 distinct 9-digit NITs; 45,171 active in 2022; 38,624 continuous all 5 years)\n",
        encoding="utf-8",
    )

    total_gz = sum(v["bytes"] for v in id_shards.values()) + sum(v["bytes"] for v in name_shards.values())
    print(
        f"Built Colombia DIAN RTE sharded index: {len(organizations):,} unique 9-digit NITs "
        f"({active_2022_count:,} in 2022, {continuous_5yr:,} continuous 2018–2022), "
        f"{len(id_shards)} ID shards + {len(name_shards)} name shards ({total_gz/1024/1024:.2f} MiB total)."
    )


if __name__ == "__main__":
    main()
