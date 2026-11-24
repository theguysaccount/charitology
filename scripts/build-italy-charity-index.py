#!/usr/bin/env python3
"""Deterministic builder for the Italy Charity Index & 5 per mille Funding Flow (Jurisdiction #26).

Ingests all 7 official Agenzia delle Entrate AF 2025 CSV parts (updated 2026-11-05):
  - 96,059 distinct admitted 5 per mille beneficiaries (100% 11-digit Luhn-valid Codice Fiscale)
  - 15,562,797 expressed Italian taxpayer choices
  - EUR 603,099,780.80 exact disbursable allocations across 7 statutory categories + transitional ONLUS

Verifies SHA-256 of every raw CSV, validates every 11-digit Italian Codice Fiscale (preserving
all 22,354 leading-zero strings), verifies exact Euro-cent arithmetic (expressed + generic +
under-100 redistribution == total disbursable with 0 mismatches), logs structural edge cases
verbatim in anomalies.json, and emits deterministic gzip-sharded registry and funding-flow artifacts.
"""

from __future__ import annotations

import argparse
import collections
import csv
import gzip
import hashlib
import io
import json
import re
import unicodedata
from pathlib import Path

EXPECTED_SHAS = {
    "italy-5x1000-af2025-part1.csv": "280559352c8e65eb83817d11fe8518d3cbd7dcffc9d640365b29f9d3673645c7",
    "italy-5x1000-af2025-part2.csv": "824db54feed40d57bc745648ae27f4c1f91816c6f6de1e4a7366101dc65bc15a",
    "italy-5x1000-af2025-part3.csv": "0c2dc956bd364c4cf26f0304156871a921ffe0053609f25a36fb6f18176b8a57",
    "italy-5x1000-af2025-part4.csv": "37ebd8b5e011da428cbd397c1a5fbe14a5b64f0a06c13f0f347854dee43f2378",
    "italy-5x1000-af2025-part5.csv": "0eff35cbfbcb435a100899f196422849c32c8d0f714802aa22a153ac66a920f9",
    "italy-5x1000-af2025-part6.csv": "79400d13b5d5eab8a1875083c49b1dec116d07c0a2a3b5bd5f6de22396860aef",
    "italy-5x1000-af2025-part7.csv": "8c050b7f4007ff7d2a6b31b1d37ef9b5c9b313061503a31af344aefe993e2e66",
}

CAT_SPEC = [
    (6, "ets", "ETS", "Third Sector Entities (Enti del Terzo Settore / RUNTS)"),
    (7, "asd", "ASD", "Amateur Sports Associations (Associazioni Sportive Dilettantistiche)"),
    (8, "ricerca_scientifica", "Ricerca scientifica", "Scientific Research & Universities"),
    (9, "ricerca_sanitaria", "Ricerca sanitaria", "Health & Biomedical Research"),
    (10, "comuni", "Comuni", "Municipal Social Activities (Comuni)"),
    (11, "beni_culturali", "Beni culturali e paesaggistici", "Cultural & Landscape Heritage"),
    (12, "aree_protette", "Enti Gestori aree protette", "Protected Natural Area Managers"),
]

UNFLAGGED_CAT = (
    "onlus_unflagged",
    "Senza flag categoria (ONLUS in transizione)",
    "Admitted without category X flag (primarily transitional ONLUS)",
)

PORTAL_URL = "https://www.agenziaentrate.gov.it/portale/elenco-complessivo-degli-enti-ammessi-in-una-o-pi%C3%B9-categorie-di-beneficiari1"
OVERVIEW_URL = "https://www.agenziaentrate.gov.it/portale/contributo-del-5-per-mille-2025"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gzip_deterministic(raw: bytes) -> bytes:
    return gzip.compress(raw, compresslevel=9, mtime=0)


def parse_eur_cents(raw: str) -> int:
    s = (raw or "").strip().replace(".", "").replace(",", ".")
    if not s:
        return 0
    neg = s.startswith("-")
    if neg:
        s = s[1:]
    parts = s.split(".")
    cents = int(parts[0]) * 100 + int((parts[1] + "00")[:2]) if len(parts) == 2 else int(parts[0]) * 100
    return -cents if neg else cents


def cents_to_eur_str(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    v = abs(cents)
    return f"{sign}{v // 100}.{v % 100:02d}"


def valid_it_numeric_cf(cf: str) -> bool:
    if not re.fullmatch(r"\d{11}", cf):
        return False
    total = 0
    for i in range(10):
        d = int(cf[i])
        if i % 2 == 0:
            total += d
        else:
            d2 = d * 2
            total += d2 - 9 if d2 > 9 else d2
    return ((10 - (total % 10)) % 10) == int(cf[10])


def fold_it(text: str) -> str:
    s = unicodedata.normalize("NFKD", text or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def name_shard_key(norm: str) -> str:
    for ch in norm:
        if "a" <= ch <= "z":
            return ch
        if "0" <= ch <= "9":
            return "0-9"
    return "0-9"


def safe_csv_cell(val: str) -> str:
    s = str(val or "")
    if re.match(r"^[\t\r\n ]*[=+\-@]", s):
        return "'" + s
    return s


def write_csv_bytes(headers: list[str], rows: list[list[object]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([safe_csv_cell(v) if isinstance(v, str) else v for v in row])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--registry-out", required=True, type=Path)
    parser.add_argument("--flow-out", required=True, type=Path)
    args = parser.parse_args()

    source_pins = []
    records = []
    seen_cf: set[str] = set()
    duplicate_cfs = []
    invalid_cfs = []
    sum_mismatches = []

    leading_zero_cfs = 0
    multi_category_orgs = 0
    comuni_with_other_orgs = 0
    zero_eur_orgs = 0
    zero_choice_orgs = 0
    sub_threshold_orgs = 0
    funded_orgs = 0

    total_choices = 0
    total_exp_c = 0
    total_gen_c = 0
    total_u100_c = 0
    total_tot_c = 0

    cat_stats = {
        key: {"key": key, "sourceLabel": it_label, "labelEn": en_label, "entities": 0, "fundedEntities": 0, "choices": 0, "expressedEurCents": 0, "genericEurCents": 0, "under100EurCents": 0, "totalEurCents": 0}
        for _, key, it_label, en_label in CAT_SPEC
    }
    cat_stats[UNFLAGGED_CAT[0]] = {
        "key": UNFLAGGED_CAT[0],
        "sourceLabel": UNFLAGGED_CAT[1],
        "labelEn": UNFLAGGED_CAT[2],
        "entities": 0,
        "fundedEntities": 0,
        "choices": 0,
        "expressedEurCents": 0,
        "genericEurCents": 0,
        "under100EurCents": 0,
        "totalEurCents": 0,
    }
    region_stats: dict[str, dict[str, object]] = {}

    for fname, expected_sha in sorted(EXPECTED_SHAS.items()):
        fpath = args.input_dir / fname
        raw = fpath.read_bytes()
        digest = sha256_bytes(raw)
        if digest != expected_sha:
            raise SystemExit(f"SHA-256 mismatch for {fname}: got {digest}, expected {expected_sha}")
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))
        hdr_i = next(i for i, r in enumerate(rows) if len(r) > 5 and r[0].strip() == "Prog")
        part_rows = 0

        for r in rows[hdr_i + 1 :]:
            if not r or not r[0].strip().isdigit():
                continue
            part_rows += 1
            rank = int(r[0].strip())
            cf = r[1].strip().strip("'")
            name = r[2].strip()
            reg = r[3].strip()
            pr = r[4].strip()
            muni = r[5].strip()

            cats = [key for idx, key, _, _ in CAT_SPEC if r[idx].strip().upper() == "X"]
            if not cats:
                cats = [UNFLAGGED_CAT[0]]

            ch_s = r[13].strip().replace(".", "")
            choices = int(ch_s) if ch_s.isdigit() else 0
            exp_c = parse_eur_cents(r[14])
            gen_c = parse_eur_cents(r[15])
            u100_c = parse_eur_cents(r[16])
            tot_c = parse_eur_cents(r[17])

            if cf in seen_cf:
                duplicate_cfs.append({"cf": cf, "name": name, "rank": rank})
                continue
            seen_cf.add(cf)

            if cf.startswith("0"):
                leading_zero_cfs += 1
            if not valid_it_numeric_cf(cf):
                invalid_cfs.append({"cf": cf, "name": name, "rank": rank})

            if tot_c != exp_c + gen_c + u100_c:
                sum_mismatches.append({"cf": cf, "name": name, "expC": exp_c, "genC": gen_c, "u100C": u100_c, "totC": tot_c})

            if len(cats) > 1:
                multi_category_orgs += 1
                if "comuni" in cats:
                    comuni_with_other_orgs += 1
            if tot_c > 0:
                funded_orgs += 1
            else:
                zero_eur_orgs += 1
                if choices == 0:
                    zero_choice_orgs += 1
                else:
                    sub_threshold_orgs += 1

            total_choices += choices
            total_exp_c += exp_c
            total_gen_c += gen_c
            total_u100_c += u100_c
            total_tot_c += tot_c

            for ckey in cats:
                st = cat_stats[ckey]
                st["entities"] += 1
                if tot_c > 0:
                    st["fundedEntities"] += 1
                st["choices"] += choices
                st["expressedEurCents"] += exp_c
                st["genericEurCents"] += gen_c
                st["under100EurCents"] += u100_c
                st["totalEurCents"] += tot_c

            rst = region_stats.setdefault(
                reg,
                {"region": reg, "entities": 0, "fundedEntities": 0, "choices": 0, "totalEurCents": 0},
            )
            rst["entities"] += 1
            if tot_c > 0:
                rst["fundedEntities"] += 1
            rst["choices"] += choices
            rst["totalEurCents"] += tot_c

            records.append(
                {
                    "rank": rank,
                    "cf": cf,
                    "name": name,
                    "norm": fold_it(name),
                    "reg": reg,
                    "pr": pr,
                    "muni": muni,
                    "cats": cats,
                    "ch": choices,
                    "expC": exp_c,
                    "genC": gen_c,
                    "u100C": u100_c,
                    "totC": tot_c,
                }
            )

        source_pins.append({"filename": fname, "bytes": len(raw), "sha256": digest, "rows": part_rows})

    if duplicate_cfs or invalid_cfs or sum_mismatches:
        raise SystemExit(
            f"Unexpected integrity failures: dup={len(duplicate_cfs)}, invalid_cf={len(invalid_cfs)}, sum_mismatch={len(sum_mismatches)}"
        )

    records.sort(key=lambda r: (-r["totC"], -r["ch"], r["rank"], r["cf"]))
    top10_c = sum(r["totC"] for r in records[:10])
    top50_c = sum(r["totC"] for r in records[:50])
    top250_c = sum(r["totC"] for r in records[:250])

    # Build registry shards
    reg_out = args.registry_out
    (reg_out / "names").mkdir(parents=True, exist_ok=True)
    (reg_out / "ids").mkdir(parents=True, exist_ok=True)

    name_buckets: dict[str, list[dict]] = collections.defaultdict(list)
    id_buckets: dict[str, list[dict]] = collections.defaultdict(list)
    for rec in records:
        name_buckets[name_shard_key(rec["norm"])].append(rec)
        id_buckets[rec["cf"][:2]].append(rec)

    name_shards = {}
    for key in sorted(name_buckets.keys()):
        bucket = sorted(name_buckets[key], key=lambda r: (-r["totC"], -r["ch"], r["norm"], r["cf"]))
        dec = json.dumps(bucket, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        gz = gzip_deterministic(dec)
        rel = f"names/{key}.json.gz"
        (reg_out / rel).write_bytes(gz)
        name_shards[key] = {
            "path": rel,
            "rows": len(bucket),
            "bytes": len(gz),
            "sha256": sha256_bytes(gz),
            "decodedBytes": len(dec),
            "decodedSha256": sha256_bytes(dec),
        }

    id_shards = {}
    for key in sorted(id_buckets.keys()):
        bucket = sorted(id_buckets[key], key=lambda r: r["cf"])
        dec = json.dumps(bucket, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        gz = gzip_deterministic(dec)
        rel = f"ids/{key}.json.gz"
        (reg_out / rel).write_bytes(gz)
        id_shards[key] = {
            "path": rel,
            "rows": len(bucket),
            "bytes": len(gz),
            "sha256": sha256_bytes(gz),
            "decodedBytes": len(dec),
            "decodedSha256": sha256_bytes(dec),
        }

    categories_ordered = [
        cat_stats[k]
        for k in [
            "ets",
            "asd",
            "comuni",
            "onlus_unflagged",
            "ricerca_scientifica",
            "beni_culturali",
            "ricerca_sanitaria",
            "aree_protette",
        ]
    ]
    regions_ordered = sorted(region_stats.values(), key=lambda x: (-x["totalEurCents"], x["region"]))

    # Verbatim anomalies & structural disclosures
    unflagged_top = [
        {"rank": r["rank"], "cf": r["cf"], "name": r["name"], "reg": r["reg"], "ch": r["ch"], "totEur": cents_to_eur_str(r["totC"])}
        for r in records
        if r["cats"] == [UNFLAGGED_CAT[0]]
    ][:15]
    anomalies_doc = {
        "format": "charitology-italy-anomalies-v1",
        "asOf": "2026-11-05",
        "summary": {
            "duplicateCodiceFiscale": 0,
            "invalidNumericCodiceFiscale": 0,
            "arithmeticSumMismatches": 0,
            "leadingZeroCodiceFiscalePreserved": leading_zero_cfs,
            "multiCategoryEntities": multi_category_orgs,
            "comuniWithAdditionalCategory": comuni_with_other_orgs,
            "unflaggedCategoryEntities": cat_stats[UNFLAGGED_CAT[0]]["entities"],
            "subThresholdChoicesWithZeroPayout": sub_threshold_orgs,
            "zeroChoicesWithZeroPayout": zero_choice_orgs,
        },
        "notes": [
            "In AF 2025, Agenzia delle Entrate renamed column 6 from 'ETS e ONLUS' (used in AF 2023) to 'ETS'. As a result, 2,023 admitted entities (primarily transitional ONLUS, including Medici Senza Frontiere ONLUS at rank #7 with EUR 9.44M) carry no 'X' flag in columns 6-12 yet remain admitted beneficiaries with exact choice counts and disbursements. Charitology preserves these explicitly under 'onlus_unflagged' without altering upstream records.",
            "8,216 admitted entities received one or more taxpayer choices yet show EUR 0.00 disbursable because Italy's statutory EUR 100 minimum disbursement threshold redistributes sub-threshold amounts proportionally across qualifying recipients (totaling EUR 441,871.12 across AF 2025).",
            "537 entities qualify in two or more statutory 5 per mille categories simultaneously (e.g., Fondazione AIRC qualifies in ETS, Scientific Research, and Health Research). Category totals therefore overlap on multi-category recipients while the overall national sum (EUR 603,099,780.80) counts each recipient exactly once.",
        ],
        "topUnflaggedEntities": unflagged_top,
    }
    anom_bytes = (json.dumps(anomalies_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (reg_out / "anomalies.json").write_bytes(anom_bytes)

    top20_summary = [
        {
            "rank": r["rank"],
            "cf": r["cf"],
            "name": r["name"],
            "reg": r["reg"],
            "pr": r["pr"],
            "muni": r["muni"],
            "cats": r["cats"],
            "ch": r["ch"],
            "expC": r["expC"],
            "genC": r["genC"],
            "u100C": r["u100C"],
            "totC": r["totC"],
        }
        for r in records[:20]
    ]

    non_municipal_orgs = sum(1 for r in records if r["cats"] != ["comuni"])
    avg_eur_per_choice_cents = round(total_tot_c / total_choices)
    avg_exp_eur_per_choice_cents = round(total_exp_c / total_choices)

    counts_block = {
        "includedOrganizations": len(records),
        "nonMunicipalOrganizations": non_municipal_orgs,
        "municipalOnlyEntities": len(records) - non_municipal_orgs,
        "fundedOrganizations": funded_orgs,
        "zeroPayoutOrganizations": zero_eur_orgs,
        "subThresholdOrganizations": sub_threshold_orgs,
        "zeroChoiceOrganizations": zero_choice_orgs,
        "validatedCodiceFiscale": len(records),
        "invalidCodiceFiscale": 0,
        "leadingZeroCodiceFiscale": leading_zero_cfs,
        "multiCategoryOrganizations": multi_category_orgs,
        "unflaggedCategoryOrganizations": cat_stats[UNFLAGGED_CAT[0]]["entities"],
        "regionsCovered": len(regions_ordered),
        "totalChoices": total_choices,
        "expressedEurCents": total_exp_c,
        "genericEurCents": total_gen_c,
        "under100RedistEurCents": total_u100_c,
        "totalDisbursableEurCents": total_tot_c,
        "avgTotalEurPerChoiceCents": avg_eur_per_choice_cents,
        "avgExpressedEurPerChoiceCents": avg_exp_eur_per_choice_cents,
        "top10SharePct": round(top10_c / total_tot_c * 100, 2),
        "top50SharePct": round(top50_c / total_tot_c * 100, 2),
        "top250SharePct": round(top250_c / total_tot_c * 100, 2),
        "byCategory": {c["key"]: c["entities"] for c in categories_ordered},
    }

    registry_manifest = {
        "format": "charitology-italy-registry-v1",
        "jurisdiction": "IT",
        "fiscalYear": 2025,
        "publisher": "Agenzia delle Entrate (Italian Revenue Agency)",
        "asOf": "2026-11-05",
        "capturedOn": "2026-11-23",
        "catalogues": {
            "admittedList2025": PORTAL_URL,
            "programOverview2025": OVERVIEW_URL,
        },
        "sources": source_pins,
        "counts": counts_block,
        "categories": categories_ordered,
        "regions": regions_ordered,
        "top20": top20_summary,
        "anomalies": {
            "path": "anomalies.json",
            "bytes": len(anom_bytes),
            "sha256": sha256_bytes(anom_bytes),
        },
        "shards": {
            "names": name_shards,
            "ids": id_shards,
        },
    }
    (reg_out / "manifest.json").write_text(
        json.dumps(registry_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Build funding-flow artifacts
    flow_out = args.flow_out
    flow_out.mkdir(parents=True, exist_ok=True)

    top250_rows = [
        {
            "rank": r["rank"],
            "cf": r["cf"],
            "name": r["name"],
            "norm": r["norm"],
            "reg": r["reg"],
            "pr": r["pr"],
            "muni": r["muni"],
            "cats": r["cats"],
            "ch": r["ch"],
            "expC": r["expC"],
            "genC": r["genC"],
            "u100C": r["u100C"],
            "totC": r["totC"],
        }
        for r in records[:250]
    ]
    top250_dec = json.dumps(top250_rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    top250_gz = gzip_deterministic(top250_dec)
    (flow_out / "top-250.json.gz").write_bytes(top250_gz)

    cat_csv_bytes = write_csv_bytes(
        [
            "category_key",
            "source_label_it",
            "label_en",
            "admitted_entities",
            "funded_entities",
            "taxpayer_choices",
            "expressed_eur",
            "generic_eur",
            "under_100_redistribution_eur",
            "total_disbursable_eur",
        ],
        [
            [
                c["key"],
                c["sourceLabel"],
                c["labelEn"],
                c["entities"],
                c["fundedEntities"],
                c["choices"],
                cents_to_eur_str(c["expressedEurCents"]),
                cents_to_eur_str(c["genericEurCents"]),
                cents_to_eur_str(c["under100EurCents"]),
                cents_to_eur_str(c["totalEurCents"]),
            ]
            for c in categories_ordered
        ],
    )
    (flow_out / "categories.csv").write_bytes(cat_csv_bytes)

    reg_csv_bytes = write_csv_bytes(
        ["region", "admitted_entities", "funded_entities", "taxpayer_choices", "total_disbursable_eur"],
        [
            [r["region"], r["entities"], r["fundedEntities"], r["choices"], cents_to_eur_str(r["totalEurCents"])]
            for r in regions_ordered
        ],
    )
    (flow_out / "regions.csv").write_bytes(reg_csv_bytes)

    flow_manifest = {
        "format": "charitology-italy-5xmille-flow-v1",
        "jurisdiction": "IT",
        "fiscalYear": 2025,
        "publisher": "Agenzia delle Entrate (Italian Revenue Agency)",
        "asOf": "2026-11-05",
        "capturedOn": "2026-11-23",
        "catalogue": PORTAL_URL,
        "counts": counts_block,
        "categories": categories_ordered,
        "regions": regions_ordered,
        "top20": top20_summary,
        "artifacts": {
            "top250": {
                "path": "top-250.json.gz",
                "rows": len(top250_rows),
                "bytes": len(top250_gz),
                "sha256": sha256_bytes(top250_gz),
                "decodedBytes": len(top250_dec),
                "decodedSha256": sha256_bytes(top250_dec),
            },
            "categoriesCsv": {
                "path": "categories.csv",
                "rows": len(categories_ordered),
                "bytes": len(cat_csv_bytes),
                "sha256": sha256_bytes(cat_csv_bytes),
            },
            "regionsCsv": {
                "path": "regions.csv",
                "rows": len(regions_ordered),
                "bytes": len(reg_csv_bytes),
                "sha256": sha256_bytes(reg_csv_bytes),
            },
        },
    }
    (flow_out / "manifest.json").write_text(
        json.dumps(flow_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    total_gz_bytes = sum(s["bytes"] for s in name_shards.values()) + sum(s["bytes"] for s in id_shards.values())
    print(
        f"Built Italy 5x1000 AF 2025 registry & flow: {len(records):,} orgs, {total_choices:,} choices, "
        f"EUR {cents_to_eur_str(total_tot_c)}, {len(name_shards)} name shards + {len(id_shards)} ID shards "
        f"({total_gz_bytes / (1024 * 1024):.2f} MiB gz)."
    )


if __name__ == "__main__":
    main()
