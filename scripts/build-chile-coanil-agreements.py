#!/usr/bin/env python3
"""Connect COANIL agreements to the pinned Chile ledger and audited accounts."""

import argparse
from collections import Counter
import csv
from datetime import timedelta
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
import re
from runpy import run_path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/data"
PAYMENTS = ROOT / "public/data/funding-flows/chile-residential-payments/edition.json"


def pin(path, digest):
    raw = path.read_bytes()
    assert sha256(raw).hexdigest() == digest, path
    return raw


def csv_output(path, rows):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=tuple(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def donation_totals(captures, rut):
    # Reuse the sheet reader, RUT check and exact workbook pins from the first Chile edition.
    reader = run_path(str(Path(__file__).with_name("build-chile-residential-care.py")))
    expected = {2022: (0, None), 2023: (0, None), 2024: (10, 117_295_275), 2025: (30, 364_898_960)}
    for year, digest in reader["PINNED"].items():
        book = reader["pinned"](captures / f"receipts-{year}.xlsx", digest)
        amount_column, date_column = ("C", "D") if year < 2024 else ("D", "E")
        amounts = []
        for position, fields in reader["rows"](book):
            if reader["check_rut"](fields.get("A", "")) != rut:
                continue
            day = reader["EPOCH"] + timedelta(days=int(fields[date_column]))
            amount = Decimal(fields[amount_column])
            assert day.year == year and amount == amount.to_integral_value() and amount > 0, (year, position)
            assert fields["B"].strip().casefold() == "fundación coanil", (year, position)
            amounts.append(int(amount))
        reported = sum(amounts) if amounts else None
        assert (len(amounts), reported) == expected[year]
        yield {
            "year": year, "sheet": 1, "sha256": digest, "rowCount": len(amounts), "reportedClp": reported,
            "source": f"https://donacionesley21440.gob.cl/donaciones/donaciones-{year}",
        }


def residence_rows(payments, rut):
    awards = {row["folio"]: row for row in payments["awards"] if row["rut"] == rut}
    with (DATA / "chile-coanil-residences.csv").open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == len({row["folio"] for row in rows}) == len(awards) == 10
    for row in rows:
        for name in ("places2025", "approved2025", "agreement2025Page", "adaptationClp", "places2026", "approved2026", "annex2026Page"):
            row[name] = int(row[name])
        award = awards[row["folio"]]
        assert row["residence"] == award["residence"].removeprefix("Residencia ")
        assert row["approved2025"] == award["awardClp"] == row["places2025"] * 14_124_000
        assert row["approved2026"] == row["places2026"] * 1_398_000 * 12
        row["awardPage"] = award["pdfPage"]
    return rows


def commune_totals(rows):
    result = Counter()
    for row in rows:
        label = row["budgetLocation"]
        assert label, row["sourceRow"]
        prefix, _, suffix = label.partition("-")
        result[suffix if prefix.isdecimal() else label] += row["paidClp"]
    return result


def reconcile(agreements, payments, residences, rut):
    ledger = [row for row in payments["ledger"] if row["rut"] == rut]
    used = set()
    for agreement in agreements:
        accrued = paid = 0
        for installment in agreement["installments"]:
            rows = [row for row in ledger if row["period"] == agreement["year"] and row["document"] in installment["documents"]]
            assert {row["document"] for row in rows} == set(installment["documents"])
            keys = {(row["source"], row["sourceRow"]) for row in rows}
            assert len(keys) == len(rows) and not used.intersection(keys), agreement["id"]
            used.update(keys)
            dates = {row["reportedPaymentDate"] for row in rows}
            assert len(dates) == 1, agreement["id"]
            installment.update(
                ledgerRows=sorted(position for _, position in keys),
                ledgerAccruedClp=sum(row["accruedClp"] for row in rows),
                ledgerPaidClp=sum(row["paidClp"] for row in rows),
                ledgerDate=dates.pop(),
            )
            assert installment["ledgerAccruedClp"] == installment["plannedClp"]
            accrued += installment["ledgerAccruedClp"]
            paid += installment["ledgerPaidClp"]
            if agreement["id"] == "original-2025":
                percent = (40, 30, 30)[installment["number"] - 1]
                expected = Counter()
                for residence in residences:
                    expected[residence["commune"]] += residence["approved2025"] * percent // 100
                assert len(expected) == 7 and commune_totals(rows) == expected
                installment["matchingCommuneTotals"] = dict(sorted(expected.items()))
        assert accrued == agreement["approvedClp"]
        agreement.update(ledgerAccruedClp=accrued, ledgerPaidClp=paid)
    assert len(used) == len(ledger) == 76


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path, help="COANIL agreement and report captures")
    parser.add_argument("workbooks", type=Path, help="Chile donation workbook captures")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    edition = json.loads((DATA / "chile-coanil-agreements.json").read_bytes())
    captures = {name: pin(args.captures / name, source["sha256"]) for name, source in edition["sources"].items()}
    rut = edition["institution"]["rut"]
    official_rut = "70.267.000-4"
    detail = captures["donee-rpd812.html"].decode()
    assert official_rut.replace(".", "") == rut
    assert official_rut in detail and re.search(r"fundaci[oó]n coanil", detail, re.I)
    payments = json.loads(pin(PAYMENTS, edition["paymentsEditionSha256"]))
    residences = residence_rows(payments, rut)
    for field, expected in [("places2025", 308), ("places2026", 304), ("approved2025", 4_350_192_000),
                            ("adaptationClp", 182_850_000), ("approved2026", 5_099_904_000)]:
        assert sum(row[field] for row in residences) == expected, field
    reconcile(edition["agreements"], payments, residences, rut)
    edition.update(
        currency="CLP", capturedOn="2026-11-12", awardSource=payments["citations"]["awards"],
        ledgerAttribution=payments["citations"]["publisher"],
        ledgerPortal=payments["citations"]["portal"], ledgerLicense=payments["citations"]["license"],
        residences=residences, donations=list(donation_totals(args.workbooks, rut)),
    )
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "edition.json").write_text(json.dumps(edition, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    csv_output(args.output / "residences.csv", residences)
    csv_output(args.output / "installments.csv", [
        {"year": group["year"], "agreement": group["id"], "approval": group["reference"], "basis": group["basis"],
         "installment": row["number"], "plannedClp": row["plannedClp"], "documents": "|".join(row["documents"]),
         "ledgerSourceRows": "|".join(map(str, row["ledgerRows"])), "ledgerAccruedClp": row["ledgerAccruedClp"],
         "ledgerPaidClp": row["ledgerPaidClp"], "lastLedgerPaymentDate": row["ledgerDate"],
         "recipientReportSource": row.get("recipientReported", {}).get("source"),
         "recipientReportAsOf": row.get("recipientReported", {}).get("asOf"),
         "recipientReportedPaidClp": row.get("recipientReported", {}).get("paidClp"),
         "recipientReportedPaymentDate": row.get("recipientReported", {}).get("date")}
        for group in edition["agreements"] for row in group["installments"]
    ])
    accounts_by_year = {row["year"]: row for row in edition["accounts"]}
    account_fields = ("senadisSubsidyClpThousands", "otherSenadisContributionClpThousands",
                      "deferredSenadisClpThousands", "donationsClpThousands")
    financial = []
    for donation in edition["donations"]:
        account = accounts_by_year.get(donation["year"], {})
        financial.append({**donation, **{key: account.get(key) for key in account_fields}})
    csv_output(args.output / "financial-disclosures.csv", financial)


if __name__ == "__main__":
    main()
