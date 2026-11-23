#!/usr/bin/env python3
"""
Deterministic stdlib-only builder for Slovakia (Jurisdiction #20):
  1. public/data/charity-registry/slovakia/              (10-year universe of 26,357 unique 2%/3% tax-assignment beneficiaries, 2016-2025)
  2. public/data/funding-flows/slovakia-pit-2-percent/   (EUR 782.06M statutory §50 Act No. 595/2003 tax-share disbursements, 2016-2025)

Usage:
  python3 scripts/build-slovakia-charity-index.py <input-dir> <output-public-data-dir>

All 10 official Finančná správa SR CSVs are verified by SHA-256 against src/data/slovakia-index-sources.tsv.
Zero street addresses or postcodes retained (municipality only); exact integer EUR cents; null distinct from 0.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import pathlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CAPTURED_ON = "2026-11-22"
AS_OF = "2025-12-31"
YEARS = list(range(2016, 2026))


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


def fold_slovak(text: str) -> str:
    s = unicodedata.normalize("NFKD", text.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def name_shard_key(name: str) -> str:
    folded = fold_slovak(name)
    if not folded:
        return "0-9"
    ch = folded[0]
    return ch if "a" <= ch <= "z" else "0-9"


def parse_cents(val: str) -> int | None:
    s = (
        (val or "")
        .strip()
        .replace("€", "")
        .replace("?", "")
        .replace("EUR", "")
        .replace(" ", "")
        .replace("\u00a0", "")
        .replace(",", ".")
    )
    if not s:
        return None
    try:
        dec = Decimal(s)
        return int((dec * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except InvalidOperation:
        return None


def classify_name_hint(name: str) -> str:
    """Transparent name-token classification (not an external RPO statutory code)."""
    f = fold_slovak(name)
    tokens = set(f.split())
    if "nadacia" in tokens or "nadacny" in tokens or f.startswith("nadacia "):
        return "foundation_named"
    if "neinvesticny" in tokens and "fond" in tokens or "n f" in f:
        return "non_investment_fund_named"
    if "neziskova" in tokens and "organizacia" in tokens or f.endswith(" n o") or " n o " in f:
        return "nonprofit_service_named"
    if "cerveny kriz" in f:
        return "red_cross"
    if "univerzita" in tokens or "akademia" in tokens or "skola" in tokens or "gymnazium" in tokens or "rodicovske" in tokens:
        return "education_or_pta_named"
    if "hasicsky" in tokens or "hasici" in tokens:
        return "volunteer_fire_named"
    return "other_eligible"


def verify_sources(input_dir: pathlib.Path, tsv_path: pathlib.Path) -> list[dict]:
    rows = []
    with tsv_path.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            fp = input_dir / row["file"]
            if not fp.is_file():
                raise SystemExit(f"Missing pinned Slovakia source: {fp}")
            actual_b = fp.stat().st_size
            if actual_b != int(row["bytes"]):
                raise SystemExit(f"Byte mismatch on {row['file']}: {actual_b} != {row['bytes']}")
            actual_sha = sha256_file(fp)
            if actual_sha != row["sha256"]:
                raise SystemExit(f"SHA-256 mismatch on {row['file']}: {actual_sha} != {row['sha256']}")
            rows.append(row)
    return sorted(rows, key=lambda r: int(r["year"]))


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-slovakia-charity-index.py <input-dir> <output-public-data-dir>")

    input_dir = pathlib.Path(sys.argv[1]).resolve()
    out_root = pathlib.Path(sys.argv[2]).resolve()
    tsv_path = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "slovakia-index-sources.tsv"

    sources = verify_sources(input_dir, tsv_path)

    orgs: dict[str, dict] = {}
    yearly_stats = {}
    dup_records = []
    zero_or_neg_records = []
    total_raw_rows = 0

    for src in sources:
        year = int(src["year"])
        enc = src["encoding"]
        fp = input_dir / src["file"]
        text = fp.read_bytes().decode(enc)

        seen_year: dict[str, int] = {}
        year_rows = 0
        year_cents = 0
        year_dups = 0

        for r in csv.reader(text.splitlines(), delimiter=";"):
            if len(r) < 6:
                continue
            ico_raw = re.sub(r"\D+", "", r[0].strip())
            if not ico_raw or len(ico_raw) > 8:
                continue
            cents = parse_cents(r[5])
            if cents is None:
                raise SystemExit(f"Unparseable EUR amount in {src['file']}: {r[:6]}")

            ico = ico_raw.zfill(8)
            name = re.sub(r"\s+", " ", r[1].strip().strip('"').strip().lstrip("?"))
            # Privacy: municipality (Obec) only — street address (col 2) and postcode (col 4) omitted
            muni = re.sub(r"\s+", " ", r[3].strip().lstrip("?"))
            total_raw_rows += 1
            year_rows += 1
            year_cents += cents

            if cents <= 0:
                zero_or_neg_records.append({"year": year, "ico": ico, "name": name, "cents": cents})

            if ico in seen_year:
                year_dups += 1
                dup_records.append({
                    "year": year,
                    "ico": ico,
                    "name": name,
                    "additionalCents": cents,
                })
                seen_year[ico] += cents
            else:
                seen_year[ico] = cents

            rec = orgs.get(ico)
            if rec is None:
                rec = {
                    "ico": ico,
                    "name": name,
                    "muni": muni,
                    "firstYear": year,
                    "lastYear": year,
                    "yearsCount": 0,
                    "totalCents": 0,
                    "y2025Cents": None,
                    "y2024Cents": None,
                    "y2023Cents": None,
                    "yearly": {},
                    "nameHint": "other_eligible",
                }
                orgs[ico] = rec
            if year >= rec["lastYear"]:
                if name:
                    rec["name"] = name
                if muni:
                    rec["muni"] = muni
                rec["lastYear"] = year
            if year < rec["firstYear"]:
                rec["firstYear"] = year
            rec["yearly"][str(year)] = seen_year[ico]

        # Year concentration & foundation share
        year_sorted = sorted(seen_year.items(), key=lambda x: (-x[1], x[0]))
        top10_cents = sum(c for _, c in year_sorted[:10])
        top50_cents = sum(c for _, c in year_sorted[:50])
        nad_orgs = 0
        nad_cents = 0
        for ico, c in seen_year.items():
            if classify_name_hint(orgs[ico]["name"]) == "foundation_named":
                nad_orgs += 1
                nad_cents += c

        yearly_stats[str(year)] = {
            "year": year,
            "encoding": enc,
            "rawRows": year_rows,
            "distinctOrganizations": len(seen_year),
            "duplicateRowsAggregated": year_dups,
            "totalCents": year_cents,
            "top10Cents": top10_cents,
            "top50Cents": top50_cents,
            "namedFoundationOrgs": nad_orgs,
            "namedFoundationCents": nad_cents,
        }

    # Finalize org summaries
    by_name_hint = Counter()
    by_name_hint_2025_cents = defaultdict(int)
    by_name_hint_10y_cents = defaultdict(int)
    by_muni_2025 = defaultdict(lambda: {"orgs": 0, "cents": 0})
    in_2025 = 0
    all_10_years = 0

    for ico, rec in orgs.items():
        rec["nameHint"] = classify_name_hint(rec["name"])
        rec["yearsCount"] = len(rec["yearly"])
        rec["totalCents"] = sum(rec["yearly"].values())
        rec["y2025Cents"] = rec["yearly"].get("2025")
        rec["y2024Cents"] = rec["yearly"].get("2024")
        rec["y2023Cents"] = rec["yearly"].get("2023")
        by_name_hint[rec["nameHint"]] += 1
        by_name_hint_10y_cents[rec["nameHint"]] += rec["totalCents"]
        if rec["y2025Cents"] is not None:
            in_2025 += 1
            by_name_hint_2025_cents[rec["nameHint"]] += rec["y2025Cents"]
            m_key = rec["muni"].split(" - ")[0].strip() if rec["muni"] else "Unspecified"
            by_muni_2025[m_key]["orgs"] += 1
            by_muni_2025[m_key]["cents"] += rec["y2025Cents"]
        if rec["yearsCount"] == len(YEARS):
            all_10_years += 1

    total_10y_cents = sum(r["totalCents"] for r in orgs.values())
    total_2025_cents = yearly_stats["2025"]["totalCents"]

    # 1. Write sharded Slovakia registry
    reg_dir = out_root / "charity-registry" / "slovakia"
    reg_dir.mkdir(parents=True, exist_ok=True)

    name_buckets: dict[str, list[dict]] = defaultdict(list)
    id_buckets: dict[str, list[dict]] = defaultdict(list)
    for ico in sorted(orgs.keys()):
        row = orgs[ico]
        name_buckets[name_shard_key(row["name"])].append(row)
        id_buckets[ico[0]].append(row)

    name_shards = {}
    for bkt in sorted(name_buckets.keys()):
        rows = sorted(name_buckets[bkt], key=lambda r: (fold_slovak(r["name"]), r["ico"]))
        rel = f"names/{bkt}.json.gz"
        meta = write_gz_json(reg_dir / rel, rows)
        name_shards[bkt] = {"path": rel, "rows": len(rows), **meta}

    id_shards = {}
    for pfx in sorted(id_buckets.keys()):
        rows = sorted(id_buckets[pfx], key=lambda r: r["ico"])
        rel = f"ids/{pfx}.json.gz"
        meta = write_gz_json(reg_dir / rel, rows)
        id_shards[pfx] = {"path": rel, "rows": len(rows), **meta}

    top_2025 = sorted(
        (
            {
                "ico": r["ico"],
                "name": r["name"],
                "muni": r["muni"],
                "nameHint": r["nameHint"],
                "yearsCount": r["yearsCount"],
                "y2025Cents": r["y2025Cents"],
                "y2024Cents": r["y2024Cents"],
                "total10yCents": r["totalCents"],
            }
            for r in orgs.values()
            if r["y2025Cents"] is not None
        ),
        key=lambda r: (-r["y2025Cents"], r["ico"]),
    )[:20]

    top_10y = sorted(
        (
            {
                "ico": r["ico"],
                "name": r["name"],
                "muni": r["muni"],
                "nameHint": r["nameHint"],
                "yearsCount": r["yearsCount"],
                "y2025Cents": r["y2025Cents"],
                "total10yCents": r["totalCents"],
            }
            for r in orgs.values()
        ),
        key=lambda r: (-r["total10yCents"], r["ico"]),
    )[:20]

    top_cities_2025 = sorted(
        [{"city": k, **v} for k, v in by_muni_2025.items()],
        key=lambda x: (-x["cents"], x["city"]),
    )[:15]

    reg_manifest = {
        "format": "charitology-slovakia-registry-v1",
        "jurisdiction": "SK",
        "capturedOn": CAPTURED_ON,
        "asOf": AS_OF,
        "currency": "EUR",
        "publisher": "Financial Directorate of the Slovak Republic (Finančné riaditeľstvo SR / Finančná správa)",
        "catalogues": {
            "financnaSprava": "https://www.financnasprava.sk/sk/elektronicke-sluzby/verejne-sluzby/zoznamy/zoznam-prijimatelov-dane",
            "notarRegister": "https://www.notar.sk/prijimatelia/",
            "rmnoRegister": "https://ives.minv.sk/rmno/",
        },
        "counts": {
            "yearsCovered": YEARS,
            "rawAnnualRowsScanned": total_raw_rows,
            "duplicateInYearRowsAggregated": len(dup_records),
            "includedOrganizations": len(orgs),
            "active2025Organizations": in_2025,
            "presentAll10Years": all_10_years,
            "total10YearEurCents": total_10y_cents,
            "total2025EurCents": total_2025_cents,
            "byNameHint": dict(sorted(by_name_hint.items())),
            "byNameHint2025Cents": dict(sorted(by_name_hint_2025_cents.items())),
            "byNameHint10yCents": dict(sorted(by_name_hint_10y_cents.items())),
        },
        "yearly": yearly_stats,
        "privacyBoundary": "Street addresses and postcodes from Finančná správa SR annual overview CSVs are omitted; only organization name, 8-digit IČO, municipality (Obec) and statutory EUR tax-share disbursements are retained.",
        "sourcesCount": len(sources),
        "sourcesPinnedIn": "src/data/slovakia-index-sources.tsv",
        "shards": {
            "names": name_shards,
            "ids": id_shards,
        },
    }
    (reg_dir / "manifest.json").write_text(
        json.dumps(reg_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    # 2. Write Slovakia 2%/3% PIT funding flows edition (all 26,357 orgs sorted by 10-year total)
    flow_dir = out_root / "funding-flows" / "slovakia-pit-2-percent"
    flow_dir.mkdir(parents=True, exist_ok=True)

    payout_rows = sorted(
        (
            {
                "ico": r["ico"],
                "name": r["name"],
                "muni": r["muni"],
                "hint": r["nameHint"],
                "yrs": r["yearsCount"],
                "first": r["firstYear"],
                "last": r["lastYear"],
                "tot": r["totalCents"],
                "y25": r["y2025Cents"],
                "y24": r["y2024Cents"],
                "y23": r["y2023Cents"],
                "y22": r["yearly"].get("2022"),
                "y21": r["yearly"].get("2021"),
                "y20": r["yearly"].get("2020"),
                "y19": r["yearly"].get("2019"),
                "y18": r["yearly"].get("2018"),
                "y17": r["yearly"].get("2017"),
                "y16": r["yearly"].get("2016"),
            }
            for r in orgs.values()
        ),
        key=lambda r: (-(r["y25"] or 0), -r["tot"], r["ico"]),
    )
    payouts_meta = write_gz_json(flow_dir / "payouts.json.gz", payout_rows)

    csv_buf = io.StringIO()
    w = csv.writer(csv_buf, lineterminator="\n")
    w.writerow([
        "year", "distinct_recipients", "raw_rows", "duplicate_rows_aggregated",
        "total_eur", "top10_eur", "top10_share_pct", "named_foundation_orgs",
        "named_foundation_eur", "named_foundation_share_pct", "source_encoding",
    ])
    for y in YEARS:
        s = yearly_stats[str(y)]
        tot = s["totalCents"]
        w.writerow([
            y,
            s["distinctOrganizations"],
            s["rawRows"],
            s["duplicateRowsAggregated"],
            f"{tot / 100:.2f}",
            f"{s['top10Cents'] / 100:.2f}",
            f"{s['top10Cents'] * 100 / tot:.2f}",
            s["namedFoundationOrgs"],
            f"{s['namedFoundationCents'] / 100:.2f}",
            f"{s['namedFoundationCents'] * 100 / tot:.2f}",
            s["encoding"],
        ])
    (flow_dir / "yearly-summary.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    anomalies = {
        "format": "charitology-slovakia-pit-anomalies-v1",
        "capturedOn": CAPTURED_ON,
        "asOf": AS_OF,
        "encodingQuirk2022": {
            "file": "2023.01.31_Prijimatelia_2perc.csv",
            "note": "The 2022 annual overview CSV was published in DOS Central European cp852 encoding (with '?' replacing the non-cp852 Euro symbol) whereas all other nine years (2016-2021, 2023-2025) use Windows cp1250. Decoding 2022 explicitly as cp852 recovers all 15,620 rows with intact Slovak diacritics.",
        },
        "duplicateIcoRowsInSameYear": {
            "count": len(dup_records),
            "byYear": dict(sorted(Counter(str(d["year"]) for d in dup_records).items())),
            "note": "In 2016 (1 row), 2018 (56 rows) and 2020 (3 rows), Finančná správa SR listed the same 8-digit IČO on more than one line within a single year (typically after an address or name update). The builder sums those rows under the single IČO per year so no disbursement is dropped.",
            "records": sorted(dup_records, key=lambda d: (d["year"], d["ico"])),
        },
        "zeroOrNegativeRows": {
            "count": len(zero_or_neg_records),
            "records": zero_or_neg_records,
        },
        "scopeLimitation": "Finančná správa SR publishes annual disbursements received under §50 Act No. 595/2003 Coll., combining individual (2%/3%) and corporate (1%/2%) income-tax assignments without splitting individual vs. corporate donor shares or listing eligible Notary Chamber organizations that received EUR 0.",
    }
    (flow_dir / "anomalies.json").write_text(
        json.dumps(anomalies, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    flow_manifest = {
        "format": "charitology-slovakia-pit-2-percent-v1",
        "jurisdiction": "SK",
        "capturedOn": CAPTURED_ON,
        "asOf": AS_OF,
        "currency": "EUR",
        "publisher": "Financial Directorate of the Slovak Republic (Finančné riaditeľstvo SR / Finančná správa)",
        "catalogue": "https://www.financnasprava.sk/sk/elektronicke-sluzby/verejne-sluzby/zoznamy/zoznam-prijimatelov-dane",
        "counts": {
            "yearsCovered": YEARS,
            "rawAnnualRowsScanned": total_raw_rows,
            "distinctOrganizations10y": len(orgs),
            "active2025Organizations": in_2025,
            "presentAll10Years": all_10_years,
            "total10YearEurCents": total_10y_cents,
            "total2025EurCents": total_2025_cents,
            "top10Share2025Pct": round(yearly_stats["2025"]["top10Cents"] * 100 / total_2025_cents, 2),
            "top50Share2025Pct": round(yearly_stats["2025"]["top50Cents"] * 100 / total_2025_cents, 2),
            "namedFoundationShare2025Pct": round(yearly_stats["2025"]["namedFoundationCents"] * 100 / total_2025_cents, 2),
            "byNameHint": dict(sorted(by_name_hint.items())),
            "byNameHint2025Cents": dict(sorted(by_name_hint_2025_cents.items())),
            "byNameHint10yCents": dict(sorted(by_name_hint_10y_cents.items())),
        },
        "yearly": yearly_stats,
        "topRecipients2025": top_2025,
        "topRecipients10y": top_10y,
        "topCities2025": top_cities_2025,
        "artifacts": {
            "payouts": {"path": "payouts.json.gz", "rows": len(payout_rows), **payouts_meta},
            "yearlySummaryCsv": "yearly-summary.csv",
            "anomalies": "anomalies.json",
        },
    }
    (flow_dir / "manifest.json").write_text(
        json.dumps(flow_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(
        f"Built Slovakia #20: {len(orgs):,} unique 2%/3% tax-assignment organizations across 2016-2025 "
        f"({in_2025:,} in 2025, {all_10_years:,} all 10 years), EUR {total_10y_cents / 100:,.2f} cumulative "
        f"(EUR {total_2025_cents / 100:,.2f} in 2025; {flow_manifest['counts']['namedFoundationShare2025Pct']}% named foundations)."
    )


if __name__ == "__main__":
    main()
