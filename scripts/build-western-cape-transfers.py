"""Reconcile the amount columns in two exact Western Cape Annexure A captures."""
from collections import Counter, defaultdict
from hashlib import sha256
import argparse
import json
from pathlib import Path
import re

import pdfplumber
from pypdf import PdfReader


PUBLISHER = "Western Cape Department of Social Development"
PUBLISHER_FILES = "https://www.westerncape.gov.za/social-development/files/wcg-blob-files?file="
YEARS = {
    "2024/25": {
        "start": "2024-04-01", "end": "2025-03-31", "paidRows": 1092, "lastPaidPage": 14,
        "annex": {
            "file": "wc25-annex.pdf", "title": "2024/25 Annexure A: List of funded nonprofits",
            "url": PUBLISHER_FILES + "2026-10%2FDSD+Annual+Report+2024-25+Annexure+A+-+List+of+Funded+NPOs.pdf&type=file",
            "bytes": 341394, "sha256": "069365ad5e0a55e75da1d2dd5e4a0fc4ca7b591e6f72baa35c12cfef8e59bc18",
        },
        "annual": {
            "file": "wc25-report.pdf", "title": "Annual report for 2024/25",
            "url": PUBLISHER_FILES + "2025-10%2Fdsd-annual-report-24_25.pdf&type=file",
            "bytes": 6602016, "sha256": "6bc2c7b928caa3604fe25757787f1efa4f99966dfba732359f660c29492c299d",
            "page": 252, "totalZarThousands": 1031123, "comparisonZarThousands": 1080356,
        },
    },
    "2025/26": {
        "start": "2025-04-01", "end": "2026-03-31", "paidRows": 1104, "lastPaidPage": 15,
        "annex": {
            "file": "wc26-annex.pdf", "title": "2025/26 Annexure A: List of funded nonprofits",
            "url": PUBLISHER_FILES + "2026-10%2FDSD+Annual+Report+2025-26+Annexure+A+-+List+of+Funded+NPOs.pdf&type=file",
            "bytes": 338642, "sha256": "8140fcc56758ee415adadc6649c17dc10dbaef5ffe7485379e79857f086f869e",
        },
        "annual": {
            "file": "wc26-report.pdf", "title": "Annual report for 2025/26",
            "url": PUBLISHER_FILES + "2026-10%2FDSD+Annual+Report+2025-26.pdf&type=file",
            "bytes": 6350390, "sha256": "ae40035e77711c96d9294f74909fd569e0852f6e19d9a83305aecb5784292c0e",
            "page": 248, "totalZarThousands": 1161880, "comparisonZarThousands": 1031123,
        },
    },
}
IKAMVA_LABEL = "Ikamva Labantu Charitable Trust (Umelwane Project)"
IKAMVA = {
    "name": "Ikamva Labantu Charitable Trust", "npoRegistration": "082-581",
    "historicIdentitySource": "https://www.csd.dsd.gov.za/CsdDirectories/Western%20cape.pdf",
    "projectSource": "https://annualreport.ikamva.org.za/2026/",
    "annual": {
        "file": "ikamva26.pdf", "title": "Ikamva Labantu annual financial statements to February 2026",
        "url": "https://annualreport.ikamva.org.za/2026/doc/2026/iKamva_Labantu_AFS_20261028_LDV_18H23.pdf",
        "bytes": 5514840, "sha256": "e270766af5db8fee2037fc2ada46d0041648b31278bf441a0a6dfbb57b98ca5e",
        "page": 19, "printedPage": 17, "note": "8",
    },
    "localDesignatedGrants": [
        {"periodEnd": "2025-02-28", "amountZar": 15417294},
        {"periodEnd": "2026-02-28", "amountZar": 16478662},
    ],
}
CENSUS = {
    "publisher": "Statistics South Africa", "title": "South African age-sex structure, 1996–2022",
    "url": "https://www.statssa.gov.za/publications/Report-03-00-23/Report-03-00-232022.pdf",
    "locator": "Table 12", "period": "Census 2022", "geography": "Western Cape",
    "definition": "Residents aged 60 or older", "population": 818398,
}
PROGRAM = re.compile(r"(?<!\S)([2-5]\.\d)\s+Sub", re.IGNORECASE)
MONEY = re.compile(r"^(?:R ?)?([0-9][0-9, ]*)(?:N/A|Overpayment to NPO\.)?$")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def capture(folder, source):
    path = folder / source["file"]
    require(path.stat().st_size == source["bytes"], f"Wrong capture size for {path.name}")
    require(sha256(path.read_bytes()).hexdigest() == source["sha256"], f"Wrong capture fingerprint for {path.name}")
    return path


def value(field):
    match = MONEY.fullmatch(field or "")
    return None if match is None else int(match[1].replace(",", "").replace(" ", ""))


def sum_amounts(rows):
    return [sum(row["transferred"] for row in rows), sum(row["reportedSpent"] for row in rows)]


def read_paid_grid(path, paid_pages):
    entries = []
    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages[:paid_pages], 1):
            tables = page.extract_tables()
            require(len(tables) == 1, f"Expected one grid on page {page_number}")
            for row_number, row in enumerate(tables[0], 1):
                require(len(row) == 7, f"Expected seven columns on page {page_number}")
                if row[3] not in {"Yes", "No"}:
                    continue
                recipient, program, purpose, _, transferred, spent, _ = row
                category = PROGRAM.search(program or "")
                require(recipient and purpose and category, f"Incomplete grid row on page {page_number}")
                amounts = [value(transferred), value(spent)]
                require(None not in amounts, f"Invalid grid amounts on page {page_number}")
                entries.append({
                    "page": page_number, "gridRow": row_number, "category": category[1],
                    "recipientLabel": recipient, "amounts": amounts,
                })
    return entries


def audit(path, paid_pages, expected_rows):
    pdf = PdfReader(path)
    require(len(pdf.pages) == paid_pages + 1, "Unexpected annex page count")
    paid = pdf.pages[0].extract_text(extraction_mode="layout")
    budgeted = pdf.pages[paid_pages].extract_text(extraction_mode="layout")
    require("reflects the transfer payments made for the period" in paid, "Paid table heading differs")
    require("budgeted for in the period" in budgeted, "Separate budget table heading differs")
    rows = defaultdict(list)
    subtotals = {}
    grand_total = None
    sequence = []
    for page_number, page in enumerate(pdf.pages[:paid_pages], 1):
        for line in page.extract_text(extraction_mode="layout").splitlines():
            fields = re.split(r" {2,}", line.strip())
            category = PROGRAM.search(line)
            compliance = next((i for i, field in enumerate(fields)
                               if field in {"Yes", "No"} and i + 2 < len(fields)), None)
            if compliance is not None:
                require(category, f"Uncategorized paid row on page {page_number}")
                left, right = map(value, fields[compliance + 1:compliance + 3])
                require(left is not None and right is not None, f"Unrecognized amount on page {page_number}")
                rows[category[1]].append({"page": page_number, "transferred": left, "reportedSpent": right})
                sequence.append((page_number, category[1], [left, right]))
            elif fields[0].casefold() == "grand total":
                require(grand_total is None, "Repeated grand total")
                grand_total = list(map(value, fields[-2:]))
            elif category and " total" in line.casefold() and len(fields) >= 3:
                pair = list(map(value, fields[-2:]))
                if None not in pair:
                    require(category[1] not in subtotals, f"Repeated program subtotal on page {page_number}")
                    heading = " ".join(fields[:-2]).partition(":")[2].removesuffix(" Total")
                    require(heading, f"Expected a program heading on page {page_number}")
                    label = " ".join(heading.split())
                    subtotals[category[1]] = {"label": label, "page": page_number, "printedAmounts": pair}
    require(grand_total is not None and None not in grand_total, "Missing grand total")
    require(rows.keys() == subtotals.keys(), "Program subtotal keys differ")
    all_rows = [row for group in rows.values() for row in group]
    require(len(all_rows) == expected_rows, "Paid table row count differs")
    grid = read_paid_grid(path, paid_pages)
    require(sequence == [(row["page"], row["category"], row["amounts"]) for row in grid],
            "The two extraction methods disagree")
    selected = [row for row in grid if row["recipientLabel"] == IKAMVA_LABEL]
    require(len(selected) == 1 and selected[0]["category"] == "2.2", "Expected one selected project transfer")
    labels = Counter(row["recipientLabel"] for row in grid)
    return {
        "totalRows": len(all_rows), "selectedProject": selected[0],
        "detailSums": sum_amounts(all_rows), "printedGrandTotal": grand_total,
        "programs": {
            code: {"rowCount": len(rows[code]), "detailSums": sum_amounts(rows[code]), **subtotals[code]}
            for code in sorted(rows)
        },
        "gridCrossCheck": {
            "orderedRowsMatched": len(grid), "distinctLiteralLabels": len(labels),
            "repeatedLiteralLabels": sum(count > 1 for count in labels.values()),
            "rowsWhereAmountsDiffer": [
                {key: row[key] for key in ("page", "gridRow", "category", "amounts")}
                for row in grid if row["amounts"][0] != row["amounts"][1]
            ],
        },
    }


def verify_statement(folder, source):
    path = capture(folder, source)
    page = PdfReader(path).pages[source["page"] - 1].extract_text(extraction_mode="layout")
    require("STATEMENT OF TRANSFERS TO NON-PROFIT INSTITUTIONS" in page, "Wrong audited table")
    totals = [line for line in page.splitlines() if line.strip().startswith("TOTAL ")]
    require(len(totals) == 1, "Expected one audited grand total")
    amounts = [int(field.replace(" ", "")) for field in re.split(r" {2,}", totals[0].strip())
               if re.fullmatch(r"[0-9][0-9 ]*", field)]
    require(amounts[-1] == source["comparisonZarThousands"] and amounts[-3] == source["totalZarThousands"],
            "Audited transfer amounts differ")


def build(folder):
    editions = []
    for year, descriptor in YEARS.items():
        annex_path = capture(folder, descriptor["annex"])
        verify_statement(folder, descriptor["annual"])
        result = audit(annex_path, descriptor["lastPaidPage"], descriptor["paidRows"])
        editions.append({"year": year, **descriptor, **result})
    capture(folder, IKAMVA["annual"])
    return {
        "review": "draft", "publisher": PUBLISHER, "currency": "ZAR",
        "amountColumns": ["transferredZar", "reportedSpentZar"],
        "editions": editions, "recipient": IKAMVA, "census": CENSUS,
        "sourceTerms": "https://www.westerncape.gov.za/terms-of-use",
    }


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("capture_dir", type=Path)
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    data = json.dumps(build(args.capture_dir), ensure_ascii=False, indent=2) + "\n"
    args.output.write_text(data, encoding="utf-8")
